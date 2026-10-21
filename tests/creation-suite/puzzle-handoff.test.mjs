import test from 'node:test';
import assert from 'node:assert/strict';
import { PUZZLE_HANDOFF_KEY, PUZZLE_HANDOFF_MAX_AGE_MS, decodePuzzleHandoff, encodePuzzleHandoff, openPuzzleHandoff } from '../../js/creation/puzzle-handoff.mjs';
import { createLocalDraftStore, createMemoryDraftAdapter } from '../../js/creation/local-drafts.mjs';
import { createDrawDocument, encodePng } from '../../js/creation/draw-core.mjs';
import { confirmDifferenceCandidates } from '../../js/creation/spot-difference-core.mjs';
import { createHiddenObjectDraft, confirmHiddenObjectTargets } from '../../js/creation/hidden-object-core.mjs';
import { inspectPixelPng } from '../../supabase/functions/_shared/pixel-png.mjs';
import { openHandoffComposer, pendingHandoff } from '../../js/globe/post-handoff.mjs';
import { buildGlobePostPayload } from '../../js/globe/post-supabase.mjs';
import { lookupCell } from '../../js/globe/geometry.mjs';

function imageAdapters() {
  return {
    encodeImage: async (document) => new Blob([encodePng(document)], { type: 'image/png' }),
    inspectImage: async (blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer()); const claim = await inspectPixelPng(bytes);
      return { dataUrl: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`, mimeType: 'image/png', size: bytes.length, ...claim, hasTransparency: true };
    },
  };
}

async function makeHandoff(mode, returnOptions = false, explicitDraftId) {
  const drawAdapter = createMemoryDraftAdapter(); const puzzleAdapter = createMemoryDraftAdapter(); let seq = 0;
  const makeId = () => `id-${++seq}`; const drawStore = createLocalDraftStore(drawAdapter, { idFactory: makeId });
  const originalDoc = createDrawDocument(16); const changedDoc = createDrawDocument(16); changedDoc.pixels[42] = 2;
  const original = await drawStore.save({ draftId: 'draw', kind: 'pixel_art', document: originalDoc });
  const changed = await drawStore.save({ draftId: 'draw', kind: 'pixel_art', document: changedDoc });
  const ref = (revision) => ({ draftId: 'draw', assetId: revision.asset.assetId, revisionId: revision.revisionId, contentHash: revision.documentHash, hashScheme: revision.hashScheme });
  const draftId = explicitDraftId || `${mode}-id`;
  const document = mode === 'spot_difference'
    ? confirmDifferenceCandidates({ schemaVersion: 1, gameId: draftId, width: 16, height: 16, before: ref(original), after: ref(changed), candidates: [{ id: 'spot', pixels: [42] }], confirmed: false, publication: 'draft', published: false })
    : confirmHiddenObjectTargets(createHiddenObjectDraft({ gameId: draftId, source: ref(original), width: 16, height: 16, targets: [{ id: 'flower', name: '花', pixels: Array.from({ length: 25 }, (_, i) => (5 + Math.floor(i / 5)) * 16 + 5 + i % 5) }] }));
  const store = createLocalDraftStore(puzzleAdapter, { idFactory: makeId });
  await store.save({ draftId, kind: mode, document, source: { type: 'local_draft_copy', assetId: original.asset.assetId, revisionId: original.revisionId } });
  const { createPuzzleHandoff } = await import('../../js/creation/puzzle-handoff.mjs');
  const options = { mode, draftId, store, adapter: drawAdapter, ...imageAdapters() };
  const handoff = await createPuzzleHandoff(options);
  return returnOptions ? { handoff, options } : handoff;
}

for (const mode of ['spot_difference', 'hidden_object']) test(`${mode} survives session handoff with its parent PNG and puzzle`, async () => {
  const handoff = await makeHandoff(mode); const serialized = encodePuzzleHandoff(handoff);
  const retryMetadata = { title: '復元題', caption: '説明', pin: { latitude: 35.68, longitude: 139.69, source: 'cell' }, requestKey: 'retry-key', requestFingerprint: 'fingerprint' };
  const { PUZZLE_HANDOFF_META_KEY } = await import('../../js/creation/puzzle-handoff.mjs');
  const storage = new Map([[PUZZLE_HANDOFF_KEY, serialized], [PUZZLE_HANDOFF_META_KEY, JSON.stringify(retryMetadata)]]);
  const page = {
    location: { href: `https://pixieed.jp/?from=${mode === 'spot_difference' ? 'spot-difference' : 'hidden-object'}`, origin: 'https://pixieed.jp' },
    sessionStorage: { getItem: (key) => storage.get(key), removeItem: (key) => storage.delete(key) },
    history: { replaceState(_state, _title, path) { page.location.href = `https://pixieed.jp${path}`; } },
  };
  const adopted = pendingHandoff(page);
  assert.equal(adopted.mode, mode); assert.equal(adopted.payload.puzzle.mode, mode);
  assert.deepEqual(adopted.metadata, retryMetadata);
  let submitted;
  assert.equal(openHandoffComposer(adopted, { openComposer() {}, async openPuzzleComposer(value) { submitted = value; return true; } }, File), true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(submitted.payload.puzzle.mode, mode);
  assert.equal(storage.has(PUZZLE_HANDOFF_KEY), true, 'failed or pending submissions must keep the payload for retry');
  submitted.onSuccess();
  assert.equal(storage.has(PUZZLE_HANDOFF_KEY), false);
  assert.equal(storage.has(PUZZLE_HANDOFF_META_KEY), false);
  assert.equal(new URL(page.location.href).searchParams.has('from'), false);
});

test('session handoffs expire and reject malformed source metadata', () => {
  const handoff = { version: 1, mode: 'hidden_object', createdAt: 100, expiresAt: 100 + PUZZLE_HANDOFF_MAX_AGE_MS, payload: { image: { base64: 'AQ==' }, puzzle: { mode: 'spot_difference' } } };
  assert.equal(decodePuzzleHandoff(encodePuzzleHandoff(handoff), 101), null);
  const valid = { ...handoff, payload: { ...handoff.payload, puzzle: { mode: 'hidden_object' } } };
  assert.equal(decodePuzzleHandoff(encodePuzzleHandoff(valid), 101).mode, 'hidden_object');
  assert.equal(decodePuzzleHandoff(encodePuzzleHandoff(valid), valid.expiresAt), null);
});

test('globe payload keeps request key and the exact puzzle upload contract', () => {
  const cell = lookupCell(139.69, 35.68);
  const puzzle = { mode: 'spot_difference', definition: { schemaVersion: 1, width: 16, height: 16, confirmed: true, candidates: [{ id: 'c1', pixels: [3] }] }, source: { schemaVersion: 1, original: { draftId: 'd', assetId: 'a', revisionId: 'r1', contentHash: 'a'.repeat(64), hashScheme: 'sha256-canonical-v1' }, changed: { draftId: 'd', assetId: 'a', revisionId: 'r2', contentHash: 'b'.repeat(64), hashScheme: 'sha256-canonical-v1' } }, changedImage: { mimeType: 'image/png', size: 10, width: 16, height: 16, colorCount: 2, base64: 'AQID' } };
  const payload = buildGlobePostPayload({ title: 'Puzzle', caption: '', postKind: 'pixel_art', image: { dataUrl: 'data:image/png;base64,AQID', mimeType: 'image/png', size: 3, width: 16, height: 16, colorCount: 2 }, pin: { cellId: cell.id }, requestKey: 'request-1', puzzle });
  assert.equal(payload.requestKey, 'request-1'); assert.deepEqual(payload.puzzle, puzzle);
});


test('feed handoff records public intent and a validated local draft ID, then opens the matching composer', async () => {
  const localDraftId = '123e4567-e89b-42d3-a456-426614174000';
  const { options } = await makeHandoff('spot_difference', true, localDraftId);
  const values = new Map(); let assigned = '';
  const page = { location: { href: 'https://pixieed.jp/spot-difference/', assign(url) { assigned = url; } }, sessionStorage: { setItem(key, value) { values.set(key, value); }, getItem(key) { return values.get(key) ?? null; } } };
  page.parent = page;
  await openPuzzleHandoff({ ...options, destination: 'feed', localDraftId, isCurrent: () => true, windowRef: page, now: 200 });
  assert.equal(assigned, '/feed/?compose=spot-difference');
  const restored = decodePuzzleHandoff(values.get(PUZZLE_HANDOFF_KEY), 201);
  assert.equal(restored.destination, 'feed');
  assert.equal(restored.publicationIntent, 'public');
  assert.equal(restored.localDraftId, localDraftId);
  assert.equal(restored.mode, 'spot_difference');
});

test('omitting a destination preserves the existing globe route without public feed intent', async () => {
  const { options } = await makeHandoff('hidden_object', true);
  const values = new Map(); let assigned = '';
  const page = { location: { href: 'https://pixieed.jp/hidden-object/', assign(url) { assigned = url; } }, sessionStorage: { setItem(key, value) { values.set(key, value); }, getItem(key) { return values.get(key) ?? null; } } };
  page.parent = page;
  await openPuzzleHandoff({ ...options, isCurrent: () => true, windowRef: page, now: 200 });
  assert.equal(assigned, '/globe/?from=hidden-object');
  const restored = decodePuzzleHandoff(values.get(PUZZLE_HANDOFF_KEY), 201);
  assert.equal(restored.destination, 'globe');
  assert.equal(restored.publicationIntent, undefined);
});

test('a stale editor epoch aborts handoff before session storage or navigation', async () => {
  const { options } = await makeHandoff('hidden_object', true, '123e4567-e89b-42d3-a456-426614174000');
  const values = new Map(); let assigned = '';
  const page = { location: { href: 'https://pixieed.jp/hidden-object/', assign(url) { assigned = url; } }, sessionStorage: { setItem(key, value) { values.set(key, value); }, getItem(key) { return values.get(key) ?? null; }, removeItem(key) { values.delete(key); } } };
  page.parent = page;
  let epoch = 8;
  const isCurrent = () => epoch === 8;
  const encode = options.encodeImage;
  options.encodeImage = async (document) => { const blob = await encode(document); epoch += 1; return blob; };
  await assert.rejects(openPuzzleHandoff({ ...options, destination: 'feed', localDraftId: '123e4567-e89b-42d3-a456-426614174000', isCurrent, windowRef: page, now: 200 }), /編集中の内容が変わった/);
  assert.equal(values.has(PUZZLE_HANDOFF_KEY), false);
  assert.equal(assigned, '');
  assert.ok(await options.store.load(options.draftId), 'the saved local draft remains available');
});

test('legacy handoffs without destination or local ID still decode; invalid IDs and intents are rejected', () => {
  const legacy = { version: 1, mode: 'hidden_object', createdAt: 100, expiresAt: 100 + PUZZLE_HANDOFF_MAX_AGE_MS, payload: { image: { base64: 'AQ==' }, puzzle: { mode: 'hidden_object' } } };
  const decoded = decodePuzzleHandoff(JSON.stringify(legacy), 101);
  assert.equal(decoded.destination, 'globe');
  assert.equal(decoded.localDraftId, undefined);
  assert.equal(decoded.publicationIntent, undefined);
  assert.throws(() => encodePuzzleHandoff({ ...legacy, localDraftId: '../not-a-uuid' }), /不正/);
  assert.throws(() => encodePuzzleHandoff({ ...legacy, destination: 'globe', publicationIntent: 'public' }), /不正/);
  assert.equal(decodePuzzleHandoff(JSON.stringify({ ...legacy, localDraftId: 'bad' }), 101), null);
  assert.equal(decodePuzzleHandoff(JSON.stringify({ ...legacy, destination: 'globe', publicationIntent: 'public' }), 101), null);
});
