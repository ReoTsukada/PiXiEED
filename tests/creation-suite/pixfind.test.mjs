import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeDifferenceRegions, computeHiddenObjectRegions, regionContainsPoint, resolvePuzzleFromLocation, validateHiddenObjectMarkers, validateStoredDifferenceRegions } from '../../js/creation/pixfind-regions.mjs';
import { fetchPublicPostPuzzle, loadLocalHiddenDraft, loadLocalSpotDraft, preparePublicPostPuzzle, publishedPuzzleRows, resolveLocalHiddenDraftId, resolveLocalSpotDraftId, resolvePostPuzzleId, safePublicPostImageUrl, safePuzzleImageUrl } from '../../js/creation/pixfind-play.mjs';
import { createDrawDocument } from '../../js/creation/draw-core.mjs';
import { createLocalDraftStore, createMemoryDraftAdapter } from '../../js/creation/local-drafts.mjs';
import { confirmDifferenceCandidates, detectDifferenceCandidates } from '../../js/creation/spot-difference-core.mjs';
import { buildHiddenObjectHitBoxes, confirmHiddenObjectTargets, createHiddenObjectDraft, HIDDEN_OBJECT_MIN_CANVAS_CSS_WIDTH, validateHiddenObjectDraft } from '../../js/creation/hidden-object-core.mjs';

function image(width, height, pixels = {}, background = [20, 30, 40, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) data.set(background, p * 4);
  for (const [key, rgba] of Object.entries(pixels)) data.set(rgba, Number(key) * 4);
  return { width, height, data };
}

const publicPostId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const publicImageBase = 'https://example.supabase.co/storage/v1/object/public/post-public/posts/abc';
function publicPostSpotPayload(overrides = {}) {
  return { ok: true, puzzle: {
    postId: publicPostId, title: '公開の間違い探し', author: '作者', mode: 'spot_difference',
    originalImage: { url: `${publicImageBase}/original.png`, width: 16, height: 16 },
    changedImage: { url: `${publicImageBase}/changed.png`, width: 16, height: 16 },
    definition: { schemaVersion: 1, width: 16, height: 16, confirmed: true, candidates: [{ id: 'spot-1', pixels: [42] }] },
    ...overrides,
  } };
}

test('difference extraction preserves one-pixel and separated changed regions and ignores transparent RGB noise', () => {
  const base = image(7, 4, { 0: [9, 8, 7, 0], 1: [1, 2, 3, 0] });
  const changed = image(7, 4, { 0: [200, 150, 80, 0], 1: [1, 2, 3, 0], 3: [20, 30, 40, 0], 13: [99, 30, 40, 255] });
  const { mask, regions } = computeDifferenceRegions(base, changed);
  assert.deepEqual([...mask].flatMap((bit, index) => bit ? [index] : []), [3, 13]);
  assert.equal(regions.length, 2);
  assert.deepEqual(regions.map(({ minX, minY, count, centroid }) => [minX, minY, count, centroid]), [[3, 0, 1, { x: 3, y: 0 }], [6, 1, 1, { x: 6, y: 1 }]]);
});

test('difference regions are four-connected, deterministic, and retain exact pixel masks', () => {
  const before = image(5, 4);
  const after = image(5, 4, { 1: [200, 30, 40, 255], 6: [200, 30, 40, 255], 18: [200, 30, 40, 255] });
  const { regions } = computeDifferenceRegions(before, after);
  assert.equal(regions.length, 2);
  assert.deepEqual(regions.map((r) => [r.minX, r.minY, r.count, [...r.mask]]), [[1, 0, 2, [1, 1]], [3, 3, 1, [1]]]);
  assert.equal(regionContainsPoint(regions[0], 1, 0), true);
  assert.equal(regionContainsPoint(regions[0], 1.5, 0.5), true);
  assert.equal(regionContainsPoint(regions[0], 1, 1), true);
  assert.equal(regionContainsPoint(regions[0], 2, 2), false);
  assert.equal(regionContainsPoint(regions[0], 2, 2, 1), false);
  assert.equal(regionContainsPoint(regions[0], 2, 1, 1), true);
});

test('legacy playback grouping uses a fixed source-pixel radius and keeps the exact sparse answer mask', () => {
  const before = image(6, 2);
  const changed = image(6, 2, { 1: [200, 30, 40, 255], 3: [200, 30, 40, 255] });
  const result = computeDifferenceRegions(before, changed, { mergeDistance: 2 });
  assert.equal(result.regions.length, 1);
  assert.deepEqual([...result.regions[0].pixels], [1, 3]);
  assert.equal(regionContainsPoint(result.regions[0], 2, 0), false);
  const diagonal = image(6, 3, { 1: [200, 30, 40, 255], 8: [200, 30, 40, 255] });
  assert.equal(computeDifferenceRegions(image(6, 3), diagonal).regions.length, 2);
  assert.equal(computeDifferenceRegions(image(6, 3), diagonal, { mergeDistance: 2 }).regions.length, 1);
});

test('stored author-confirmed spot regions must match exact diff bounds, pixel counts, and centroids', () => {
  const before = image(5, 3);
  const changed = image(5, 3, { 6: [200, 30, 40, 255], 11: [200, 30, 40, 255] });
  const result = computeDifferenceRegions(before, changed);
  const stored = [{ minX: 1, maxX: 1, minY: 1, maxY: 2, count: 2, centerX: 1, centerY: 1.5 }];
  const validated = validateStoredDifferenceRegions(stored, result);
  assert.equal(validated.length, 1);
  assert.deepEqual([...validated[0].pixels], [6, 11]);
  assert.equal(validateStoredDifferenceRegions([{ ...stored[0], count: 1 }], result), null);
  assert.equal(validateStoredDifferenceRegions([{ ...stored[0], centerY: 1 }], result), null);
});

test('author hidden-object markers are accepted without layer overlap and reject invalid or overlapping areas', () => {
  const marker = (x, y, radius) => ({ x, y, radius, minX: Math.floor(x - radius), maxX: Math.ceil(x + radius), minY: Math.floor(y - radius), maxY: Math.ceil(y + radius) });
  const targets = [
    { label: '一つ目', marker: marker(5, 5, 2) },
    { label: '二つ目', marker: marker(20, 20, 2) },
  ];
  const validated = validateHiddenObjectMarkers(targets, 32, 32);
  assert.equal(validated.length, 2);
  assert.ok(validated[0].pixels.length > 1);
  assert.equal(validateHiddenObjectMarkers(['一つ目', '二つ目'], 32, 32), null);
  assert.equal(validateHiddenObjectMarkers([{ ...targets[0], marker: { ...targets[0].marker, maxX: 30 } }, targets[1]], 32, 32), null);
  assert.equal(validateHiddenObjectMarkers([targets[0], { label: '重複', marker: marker(6, 5, 2) }], 32, 32), null);
  const realShape = [{ label: '正解', marker: { x: 14, y: 92, radius: 8, minX: 6, maxX: 22, minY: 84, maxY: 99 } }];
  assert.equal(validateHiddenObjectMarkers(realShape, 64, 128).length, 1);
});

test('hidden-object extraction respects alpha, black mask, sparse legacy layer fallback, and 8-connectivity', () => {
  const layer = image(5, 3, { 0: [0, 0, 0, 255], 6: [0, 0, 0, 255], 7: [240, 240, 240, 255], 14: [0, 0, 0, 12] }, [240, 240, 240, 255]);
  const result = computeHiddenObjectRegions(layer);
  assert.deepEqual([...result.mask].flatMap((bit, index) => bit ? [index] : []), [0, 6]);
  assert.equal(result.regions.length, 1);
  assert.deepEqual([result.regions[0].minX, result.regions[0].minY, result.regions[0].maxX, result.regions[0].maxY, result.regions[0].count], [0, 0, 1, 1, 2]);
  const sparseLayer = image(4, 3, { 5: [180, 100, 120, 180], 6: [0, 0, 0, 0] }, [0, 0, 0, 0]);
  assert.deepEqual([...computeHiddenObjectRegions(sparseLayer).mask].flatMap((bit, index) => bit ? [index] : []), [5]);
});

test('invalid dimensions, mismatched images, and oversized input are rejected', () => {
  assert.throws(() => computeDifferenceRegions(image(2, 2), image(3, 2)), /dimensions/);
  assert.throws(() => computeHiddenObjectRegions({ width: 2, height: 2, data: new Uint8Array(15) }), /exact dimensions/);
  assert.throws(() => computeHiddenObjectRegions({ width: 5000, height: 5000, data: new Uint8Array(0) }), /bounded/);
});

test('legacy puzzle URLs resolve IDs and slugs and fail closed on malformed or unknown values', () => {
  const puzzles = [{ id: 'id-1', slug: 'old-one' }, { id: 'id-2', slug: 'old-two' }];
  assert.equal(resolvePuzzleFromLocation({ search: '?puzzle=id-1', hash: '' }, puzzles), puzzles[0]);
  assert.equal(resolvePuzzleFromLocation({ search: '', hash: '#puzzle=old-two' }, puzzles), puzzles[1]);
  assert.equal(resolvePuzzleFromLocation({ search: '?puzzle=unknown', hash: '' }, puzzles), null);
  assert.equal(resolvePuzzleFromLocation({ search: '', hash: '#puzzle=%E0%A4%A' }, puzzles), null);
  assert.equal(resolvePuzzleFromLocation({ search: '?puzzle=id-1', hash: '#puzzle=old-two' }, puzzles), puzzles[0]);
});

test('local Spot route token is separate from public puzzle IDs and rejects malformed or duplicate tokens', () => {
  const id = '9dbb5127-9814-4598-8f99-0c69f29e6a60';
  assert.equal(resolveLocalSpotDraftId({ search: `?localSpot=${id}` }), id);
  assert.equal(resolveLocalSpotDraftId({ search: '?puzzle=old-slug' }), undefined);
  assert.equal(resolveLocalSpotDraftId({ search: '?localSpot=not-a-uuid' }), null);
  assert.equal(resolveLocalSpotDraftId({ search: `?localSpot=${id}&localSpot=${id}` }), null);
});

test('local Hidden route is separate from Spot and public puzzle routes', () => {
  const id = '9dbb5127-9814-4598-8f99-0c69f29e6a60';
  assert.equal(resolveLocalHiddenDraftId({ search: `?localHidden=${id}` }), id);
  assert.equal(resolveLocalHiddenDraftId({ search: '?localSpot=old' }), undefined);
  assert.equal(resolveLocalHiddenDraftId({ search: '?puzzle=old-slug' }), undefined);
  assert.equal(resolveLocalHiddenDraftId({ search: '?localHidden=bad' }), null);
  assert.equal(resolveLocalHiddenDraftId({ search: `?localHidden=${id}&localHidden=${id}` }), null);
});

test('public post puzzle routing is strict and preserves legacy puzzle and local route parsing', () => {
  assert.equal(resolvePostPuzzleId({ search: `?postPuzzle=${publicPostId}`, hash: '' }), publicPostId);
  assert.equal(resolvePostPuzzleId({ search: '?postPuzzle=bad', hash: '' }), null);
  assert.equal(resolvePostPuzzleId({ search: `?postPuzzle=${publicPostId}&postPuzzle=${publicPostId}`, hash: '' }), null);
  assert.equal(resolvePostPuzzleId({ search: `?postPuzzle=${publicPostId}&puzzle=old`, hash: '' }), null);
  assert.equal(resolvePostPuzzleId({ search: `?postPuzzle=${publicPostId}&localSpot=${publicPostId}`, hash: '' }), null);
  assert.equal(resolvePostPuzzleId({ search: `?postPuzzle=${publicPostId}`, hash: '#puzzle=old' }), null);
  assert.equal(resolvePostPuzzleId({ search: '?puzzle=old', hash: '' }), undefined);
  assert.equal(resolveLocalSpotDraftId({ search: `?localSpot=${publicPostId}` }), publicPostId);
  assert.equal(resolvePuzzleFromLocation({ search: '?puzzle=old', hash: '' }, [{ id: 'old', slug: 'old' }]).id, 'old');
});

test('new public-post image allowlist accepts only same-project post-public PNG objects', () => {
  const origin = 'https://example.supabase.co'; const valid = `${publicImageBase}/original.png`;
  assert.equal(safePublicPostImageUrl(valid, origin), valid);
  for (const value of [
    'https://evil.example/storage/v1/object/public/post-public/posts/a.png',
    'https://example.supabase.co/storage/v1/object/public/pixfind-puzzles/posts/a.png',
    `${valid}?token=x`, `${valid}#fragment`, `${publicImageBase}/../secret.png`,
    `${publicImageBase}/secret.jpg`, 'http://example.supabase.co/storage/v1/object/public/post-public/a.png',
  ]) assert.equal(safePublicPostImageUrl(value, origin), null, value);
});

test('public post API responses prepare confirmed Spot answers and reject mismatched or unsafe contracts', () => {
  const valid = preparePublicPostPuzzle(publicPostSpotPayload(), publicPostId, 'https://example.supabase.co');
  assert.deepEqual([valid.publicPostOnly, valid.mode, valid.width, valid.candidates[0].pixels[0]], [true, 'spot-difference', 16, 42]);
  for (const payload of [
    { ...publicPostSpotPayload(), ok: false },
    { ...publicPostSpotPayload(), puzzle: { ...publicPostSpotPayload().puzzle, postId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } },
    publicPostSpotPayload({ mode: 'unknown' }),
    publicPostSpotPayload({ definition: { schemaVersion: 2, confirmed: true, width: 16, height: 16, candidates: [{ id: 'x', pixels: [42] }] } }),
    publicPostSpotPayload({ definition: { schemaVersion: 1, confirmed: false, width: 16, height: 16, candidates: [{ id: 'x', pixels: [42] }] } }),
    publicPostSpotPayload({ originalImage: { url: 'https://evil.example/a.png', width: 16, height: 16 } }),
    publicPostSpotPayload({ changedImage: { url: `${publicImageBase}/changed.png`, width: 32, height: 16 } }),
    publicPostSpotPayload({ definition: { schemaVersion: 1, confirmed: true, width: 16, height: 16, candidates: [{ id: 'x', pixels: [256] }] } }),
  ]) assert.throws(() => preparePublicPostPuzzle(payload, publicPostId, 'https://example.supabase.co'));
});

test('public Hidden Object definitions recalculate accessible hitBoxes from masks', () => {
  const targets = [{ id: 'star', name: '星', pixels: [68, 69, 84, 85] }];
  const hitBoxes = buildHiddenObjectHitBoxes(targets, 16, 16, 120);
  const payload = { ok: true, puzzle: {
    postId: publicPostId, title: '公開もの探し', author: '作者', mode: 'hidden_object',
    originalImage: { url: `${publicImageBase}/original.png`, width: 16, height: 16 },
    definition: { schemaVersion: 1, width: 16, height: 16, confirmed: true, targets, hitBoxes },
  } };
  const ready = preparePublicPostPuzzle(payload, publicPostId, 'https://example.supabase.co');
  assert.equal(ready.mode, 'hidden-object');
  assert.deepEqual([ready.regions[0].minX, ready.regions[0].maxX, ready.regions[0].minY, ready.regions[0].maxY], [hitBoxes[0].minX, hitBoxes[0].maxX, hitBoxes[0].minY, hitBoxes[0].maxY]);
  assert.throws(() => preparePublicPostPuzzle({ ...payload, puzzle: { ...payload.puzzle, definition: { ...payload.puzzle.definition, hitBoxes: [{ ...hitBoxes[0], maxX: hitBoxes[0].maxX + 1 }] } } }, publicPostId, 'https://example.supabase.co'));
  assert.throws(() => preparePublicPostPuzzle({ ...payload, puzzle: { ...payload.puzzle, definition: { ...payload.puzzle.definition, targets: [{ ...targets[0], pixels: [] }] } } }, publicPostId, 'https://example.supabase.co'));
});

test('public post endpoint uses anonymous no-store GET and fails closed for HTTP or invalid response', async () => {
  let requested;
  const goodFetch = async (url, options) => { requested = { url: new URL(url), options }; return { ok: true, status: 200, json: async () => publicPostSpotPayload() }; };
  const ready = await fetchPublicPostPuzzle(publicPostId, goodFetch, 'https://example.supabase.co');
  assert.equal(ready.publicPostOnly, true);
  assert.equal(requested.url.pathname, '/functions/v1/public-post-puzzle');
  assert.equal(requested.url.searchParams.get('postId'), publicPostId);
  assert.equal(requested.options.method, 'GET');
  assert.equal(requested.options.cache, 'no-store');
  assert.equal(requested.options.credentials, 'omit');
  await assert.rejects(() => fetchPublicPostPuzzle(publicPostId, async () => ({ ok: false, status: 404 }), 'https://example.supabase.co'), /利用できません/);
  await assert.rejects(() => fetchPublicPostPuzzle(publicPostId, async () => ({ ok: true, status: 201 }), 'https://example.supabase.co'), /利用できません/);
  await assert.rejects(() => fetchPublicPostPuzzle(publicPostId, async () => ({ ok: true, status: 200, json: async () => ({ ok: false }) }), 'https://example.supabase.co'), /定義を安全に/);
});

test('Hidden local-trial button is gated on a confirmed saved draft and sends only its opaque ID', () => {
  const html = readFileSync(new URL('../../hidden-object/index.html', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../js/creation/hidden-object-page.mjs', import.meta.url), 'utf8');
  const player = readFileSync(new URL('../../js/creation/pixfind-play.mjs', import.meta.url), 'utf8');
  assert.match(html, /id="hidden-play-local"[^>]*hidden[^>]*disabled/);
  assert.match(page, /draft\?\.confirmed && draftId && savedConfirmedDraftId === draftId/);
  assert.match(page, /\/pixfind\/\?localHidden=\$\{encodeURIComponent\(draftId\)\}/);
  assert.match(player, /localHiddenOnly/);
  assert.match(player, /URL\.createObjectURL/);
  assert.match(player, /URL\.revokeObjectURL/);
});

test('local trial control is initially hidden and script links only an opaque draft id', () => {
  const html = readFileSync(new URL('../../spot-difference/index.html', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../js/creation/spot-difference-page.mjs', import.meta.url), 'utf8');
  const player = readFileSync(new URL('../../js/creation/pixfind-play.mjs', import.meta.url), 'utf8');
  assert.match(html, /id="spot-play-local"[^>]*hidden[^>]*disabled/);
  assert.match(html, /確定した下書きを試しに遊ぶ/);
  assert.match(page, /\/pixfind\/\?localSpot=\$\{encodeURIComponent\(draft\.gameId\)\}/);
  assert.doesNotMatch(page, /dataUrl|base64/);
  assert.ok(player.indexOf('const localId = resolveLocalSpotDraftId') < player.indexOf('const [posts, puzzleRows]'));
  assert.match(player, /URL\.createObjectURL/);
  assert.match(player, /URL\.revokeObjectURL/);
});

async function makeLocalSpotFixture({ candidatePixels = [42], changedPixels = [42], ownerId = 'local-owner' } = {}) {
  const drawAdapter = createMemoryDraftAdapter(); const puzzleAdapter = createMemoryDraftAdapter();
  let sequence = 0;
  const idFactory = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
  const drawStore = createLocalDraftStore(drawAdapter, { idFactory });
  const beforeDocument = createDrawDocument(16); const afterDocument = createDrawDocument(16);
  for (const pixel of changedPixels) afterDocument.pixels[pixel] = 2;
  const before = await drawStore.save({ draftId: 'draw-draft', kind: 'pixel_art', document: beforeDocument });
  const after = await drawStore.save({ draftId: 'draw-draft', kind: 'pixel_art', document: afterDocument });
  const reference = (revision) => ({ draftId: 'draw-draft', assetId: revision.asset.assetId, revisionId: revision.revisionId, contentHash: revision.documentHash, hashScheme: revision.hashScheme });
  detectDifferenceCandidates(beforeDocument, afterDocument);
  const draftId = '11111111-1111-4111-8111-111111111111';
  const draft = confirmDifferenceCandidates({ schemaVersion: 1, gameId: draftId, width: 16, height: 16, before: reference(before), after: reference(after), candidates: [{ id: 'confirmed-1', pixels: candidatePixels }], confirmed: false, publication: 'draft', published: false });
  await createLocalDraftStore(puzzleAdapter, { idFactory }).save({ draftId, kind: 'spot_difference', ownerId, document: draft, source: { type: 'local_draft_copy', assetId: before.asset.assetId, revisionId: before.revisionId } });
  return { draftId, drawAdapter, puzzleAdapter };
}

test('confirmed local Spot draft reloads fixed Draw revisions and builds exact regions without publishing', async () => {
  const fixture = await makeLocalSpotFixture();
  const loaded = await loadLocalSpotDraft(fixture.puzzleAdapter, fixture.drawAdapter, fixture.draftId);
  assert.equal(loaded.id, fixture.draftId);
  assert.equal(loaded.draft.confirmed, true);
  assert.deepEqual([...loaded.regions[0].pixels], [42]);
  assert.equal(loaded.differenceMask[42], 1);
  assert.equal(loaded.differenceMask[43], 0);
  assert.equal(loaded.beforeDocument.pixels[42], -1);
  assert.equal(loaded.afterDocument.pixels[42], 2);
});

test('local Spot playback accepts a confirmed subset of actual difference candidates', async () => {
  const fixture = await makeLocalSpotFixture({ candidatePixels: [42], changedPixels: [42, 43] });
  const loaded = await loadLocalSpotDraft(fixture.puzzleAdapter, fixture.drawAdapter, fixture.draftId);
  assert.equal(loaded.differenceMask[42], 1);
  assert.equal(loaded.differenceMask[43], 1);
  assert.deepEqual([...loaded.regions[0].pixels], [42]);
  assert.equal(loaded.regions[0].maskWidth, 1);
  assert.equal(loaded.regions[0].maskHeight, 1);
});

test('local Spot playback rejects candidate pixels outside actual fixed-version differences and foreign drafts', async () => {
  const changedCandidate = await makeLocalSpotFixture({ candidatePixels: [43] });
  await assert.rejects(() => loadLocalSpotDraft(changedCandidate.puzzleAdapter, changedCandidate.drawAdapter, changedCandidate.draftId), /実際の差分/);
  const foreign = await makeLocalSpotFixture({ ownerId: 'other-local-owner' });
  await assert.rejects(() => loadLocalSpotDraft(foreign.puzzleAdapter, foreign.drawAdapter, foreign.draftId), /自分の間違い探し下書き/);
  await assert.rejects(() => loadLocalSpotDraft(foreign.puzzleAdapter, foreign.drawAdapter, '22222222-2222-4222-8222-222222222222'), /下書き/);
});

async function makeLocalHiddenFixture({ ownerId = 'local-owner', confirmed = true, legacyLayout = false, targets = null } = {}) {
  const drawAdapter = createMemoryDraftAdapter(); const puzzleAdapter = createMemoryDraftAdapter();
  const drawStore = createLocalDraftStore(drawAdapter);
  const document = createDrawDocument(16);
  const source = await drawStore.save({ draftId: 'hidden-draw', kind: 'pixel_art', document });
  const sourceRef = { draftId: 'hidden-draw', assetId: source.asset.assetId, revisionId: source.revisionId, contentHash: source.documentHash, hashScheme: source.hashScheme };
  const pixels = (x0, y0) => [y0 * 16 + x0, y0 * 16 + x0 + 1, (y0 + 1) * 16 + x0, (y0 + 1) * 16 + x0 + 1];
  const draftId = '22222222-2222-4222-8222-222222222222';
  let draft = createHiddenObjectDraft({ gameId: draftId, source: sourceRef, width: 16, height: 16, targets: targets || [{ id: 'star', name: '星', pixels: pixels(4, 4) }] });
  if (confirmed) draft = legacyLayout ? validateHiddenObjectDraft({ ...draft, confirmed: true, hitBoxes: buildHiddenObjectHitBoxes(draft.targets, 16, 16, HIDDEN_OBJECT_MIN_CANVAS_CSS_WIDTH), hitTestLayout: { cssCanvasWidth: HIDDEN_OBJECT_MIN_CANVAS_CSS_WIDTH, minTargetCssPx: 24 } }) : confirmHiddenObjectTargets(draft);
  await createLocalDraftStore(puzzleAdapter).save({ draftId, kind: 'hidden_object', ownerId, document: draft, source: { type: 'local_draft_copy', assetId: source.asset.assetId, revisionId: source.revisionId } });
  return { draftId, drawAdapter, puzzleAdapter };
}

test('confirmed local Hidden draft reloads the exact Draw revision and uses saved accessible hitBoxes', async () => {
  const fixture = await makeLocalHiddenFixture();
  const loaded = await loadLocalHiddenDraft(fixture.puzzleAdapter, fixture.drawAdapter, fixture.draftId);
  assert.equal(loaded.id, fixture.draftId);
  assert.equal(loaded.draft.confirmed, true);
  assert.equal(loaded.sourceDocument.width, 16);
  assert.equal(loaded.regions.length, 1);
  assert.deepEqual([loaded.regions[0].minX, loaded.regions[0].maxX, loaded.regions[0].minY, loaded.regions[0].maxY], [loaded.draft.hitBoxes[0].minX, loaded.draft.hitBoxes[0].maxX, loaded.draft.hitBoxes[0].minY, loaded.draft.hitBoxes[0].maxY]);
  assert.equal(loaded.regions[0].pixels.length, (loaded.regions[0].maxX - loaded.regions[0].minX + 1) * (loaded.regions[0].maxY - loaded.regions[0].minY + 1));
});

test('legacy Hidden draft expands hitboxes for short screens or refuses ambiguous targets', async () => {
  const legacy = await makeLocalHiddenFixture({ legacyLayout: true, targets: [{ id: 'star', name: '星', pixels: [5 * 16 + 5] }] });
  const loaded = await loadLocalHiddenDraft(legacy.puzzleAdapter, legacy.drawAdapter, legacy.draftId);
  assert.equal(loaded.draft.hitTestLayout.cssCanvasWidth, HIDDEN_OBJECT_MIN_CANVAS_CSS_WIDTH);
  assert.ok(loaded.regions[0].maskWidth > loaded.draft.hitBoxes[0].maxX - loaded.draft.hitBoxes[0].minX + 1);
  const close = await makeLocalHiddenFixture({ legacyLayout: true, targets: [{ id: 'one', name: '一', pixels: [5 * 16 + 5] }, { id: 'two', name: '二', pixels: [5 * 16 + 8] }] });
  await assert.rejects(() => loadLocalHiddenDraft(close.puzzleAdapter, close.drawAdapter, close.draftId), /短い画面で対象を押し分けられません/);
});

test('local Hidden playback rejects unconfirmed, foreign, or missing drafts', async () => {
  const unconfirmed = await makeLocalHiddenFixture({ confirmed: false });
  await assert.rejects(() => loadLocalHiddenDraft(unconfirmed.puzzleAdapter, unconfirmed.drawAdapter, unconfirmed.draftId), /作者の確認前|確認済み/);
  const foreign = await makeLocalHiddenFixture({ ownerId: 'another-owner' });
  await assert.rejects(() => loadLocalHiddenDraft(foreign.puzzleAdapter, foreign.drawAdapter, foreign.draftId), /自分のもの探し/);
  await assert.rejects(() => loadLocalHiddenDraft(foreign.puzzleAdapter, foreign.drawAdapter, '33333333-3333-4333-8333-333333333333'), /下書き/);
});

test('play catalog intersects puzzle records with published PiXFiND social references only', () => {
  const puzzles = [{ id: 'public-1', slug: 'one' }, { id: 'unreferenced', slug: 'secret' }];
  const posts = [
    { status: 'published', post_kind: 'pixfind', distribution_mode: 'pixfind', pixfind_puzzle_id: 'public-1' },
    { status: 'pending', post_kind: 'pixfind', distribution_mode: 'pixfind', pixfind_puzzle_id: 'unreferenced' },
    { status: 'published', post_kind: 'image', distribution_mode: 'showcase', pixfind_puzzle_id: 'unreferenced' },
  ];
  assert.deepEqual(publishedPuzzleRows(posts, puzzles), [puzzles[0]]);
  assert.deepEqual(publishedPuzzleRows([], puzzles), []);
});

test('play images accept only HTTPS objects under the two legacy PiXFiND buckets on the configured project', () => {
  const base = 'https://example.supabase.co';
  assert.equal(safePuzzleImageUrl(`${base}/storage/v1/object/public/pixfind-puzzles/puzzles/abc/original.png`, base), `${base}/storage/v1/object/public/pixfind-puzzles/puzzles/abc/original.png`);
  assert.equal(safePuzzleImageUrl(`${base}/storage/v1/object/public/pixieed-contest/puzzles/abc/diff.webp`, base), `${base}/storage/v1/object/public/pixieed-contest/puzzles/abc/diff.webp`);
  assert.equal(safePuzzleImageUrl('https://evil.example/storage/v1/object/public/pixfind-puzzles/puzzles/abc/original.png', base), null);
  assert.equal(safePuzzleImageUrl(`${base}/storage/v1/object/public/post-public/puzzles/abc/original.png`, base), null);
  assert.equal(safePuzzleImageUrl(`${base}/storage/v1/object/public/pixfind-puzzles/private/original.png`, base), null);
  assert.equal(safePuzzleImageUrl(`${base}/storage/v1/object/public/pixieed-contest/puzzles/abc/diff.png?redirect=https://evil.example`, base), null);
});

test('play screen keeps one large tappable image, offers a same-position comparison toggle, and reserves shared navigation space', () => {
  const html = readFileSync(new URL('../../pixfind/index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../css/creation-pixfind.css', import.meta.url), 'utf8');
  assert.match(html, /id="pixfind-play-area"[^>]*role="application"/);
  assert.match(html, /id="pixfind-compare"/);
  assert.match(html, /変化後を見る/);
  assert.match(html, /id="pixfind-original"/);
  assert.match(html, /id="pixfind-changed"/);
  assert.match(html, /class="app-tabs"/);
  assert.match(css, /\.pixfind-page--playing\{position:fixed/);
  assert.match(css, /\.pixfind-play-area img\{position:absolute/);
  assert.match(css, /\.pixfind-play-area img\[hidden\]\{display:none!important\}/);
  assert.match(css, /4\.8rem \+ env\(safe-area-inset-bottom/);
});
