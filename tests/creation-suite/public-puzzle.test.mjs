import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawDocument, encodePng } from '../../js/creation/draw-core.mjs';
import { admitPuzzleUpload } from '../../supabase/functions/_shared/puzzle-admission.mjs';
import { inspectPixelPng } from '../../supabase/functions/_shared/pixel-png.mjs';
import { buildPublicPuzzleResponse } from '../../supabase/functions/_shared/public-puzzle.mjs';
import { preparePublicPostPuzzle } from '../../js/creation/pixfind-play.mjs';

const POST_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT = 'https://example.supabase.co';
const NOW = '2026-09-28T12:00:00.000Z';
const SOURCE_REF = { draftId: 'draw-draft', assetId: 'asset-1', revisionId: 'revision-1', contentHash: 'a'.repeat(64), hashScheme: 'sha256-canonical-v1' };

async function claim(bytes) { return { mimeType: 'image/png', size: bytes.length, ...await inspectPixelPng(bytes) }; }

async function snapshot(mode) {
  const originalDocument = createDrawDocument(16); const originalBytes = encodePng(originalDocument);
  const parent = { id: POST_ID, status: 'published', publishedAt: NOW, title: '作品タイトル', authorLabel: '作者表示', imageClaim: await claim(originalBytes), privateAuthorId: 'private-author', exactPosition: { lat: 1, lon: 2 } };
  const point = { postId: POST_ID, publishedAt: NOW, imagePath: `${POST_ID}/original.png`, privateGeoHash: 'secret-cell' };
  let puzzle; let changedBytes;
  if (mode === 'spot_difference') {
    const changedDocument = structuredClone(originalDocument); changedDocument.pixels[4] = 2; changedBytes = encodePng(changedDocument);
    const admitted = await admitPuzzleUpload({
      mode, source: { schemaVersion: 1, original: SOURCE_REF, changed: { ...SOURCE_REF, revisionId: 'revision-2', contentHash: 'b'.repeat(64) } },
      definition: { schemaVersion: 1, width: 16, height: 16, confirmed: true, candidates: [{ id: 'spot-1', pixels: [4] }] },
      changedImage: { ...await claim(changedBytes), base64: Buffer.from(changedBytes).toString('base64') },
    }, originalBytes, parent.imageClaim);
    puzzle = { postId: POST_ID, reviewState: 'approved', mode, schemaVersion: 1, definition: admitted.definition, changedImage: { path: `${POST_ID}/changed.png`, claim: await claim(changedBytes) }, privateReviewNote: 'private-note' };
  } else {
    const targets = [{ id: 'flower', name: '花', pixels: [] }];
    for (let y = 5; y < 10; y += 1) for (let x = 5; x < 10; x += 1) targets[0].pixels.push(y * 16 + x);
    const admitted = await admitPuzzleUpload({ mode, source: { schemaVersion: 1, original: SOURCE_REF }, definition: { schemaVersion: 1, width: 16, height: 16, confirmed: true, targets } }, originalBytes, parent.imageClaim);
    puzzle = { postId: POST_ID, reviewState: 'approved', mode, schemaVersion: 1, definition: admitted.definition, privateReviewNote: 'private-note' };
  }
  return { input: { requestedPostId: POST_ID, parent, point, puzzle, originalBytes, ...(changedBytes ? { changedBytes } : {}) }, changedBytes };
}

for (const mode of ['spot_difference', 'hidden_object']) test(`Draw PNG → admission definition → public response → player contract (${mode})`, async () => {
  const { input } = await snapshot(mode); const before = structuredClone(input);
  const response = await buildPublicPuzzleResponse(input, PROJECT);
  assert.equal(response.ok, true);
  assert.deepEqual(Object.keys(response).sort(), ['ok', 'puzzle']);
  const puzzle = response.puzzle;
  assert.deepEqual(Object.keys(puzzle).sort(), mode === 'spot_difference'
    ? ['author', 'changedImage', 'definition', 'mode', 'originalImage', 'postId', 'title']
    : ['author', 'definition', 'mode', 'originalImage', 'postId', 'title']);
  assert.equal(puzzle.postId, POST_ID); assert.equal(puzzle.author, '作者表示'); assert.equal(puzzle.title, '作品タイトル');
  assert.match(puzzle.originalImage.url, new RegExp(`/storage/v1/object/public/post-public/${POST_ID}/original\\.png$`));
  assert.equal(Object.hasOwn(puzzle, 'privateAuthorId'), false);
  assert.equal(JSON.stringify(response).includes('private-note'), false);
  assert.equal(JSON.stringify(response).includes('secret-cell'), false);
  assert.equal(JSON.stringify(response).includes('base64'), false);
  const client = preparePublicPostPuzzle(response, POST_ID, PROJECT);
  assert.equal(client.publicPostOnly, true);
  assert.equal(client.mode, mode === 'spot_difference' ? 'spot-difference' : 'hidden-object');
  if (mode === 'spot_difference') assert.deepEqual(client.candidates, puzzle.definition.candidates);
  else assert.deepEqual(client.targets, puzzle.definition.targets);
  assert.deepEqual(input, before, 'builder must not mutate its adapter snapshot');
});

test('parent publication is authoritative even when a published point remains', async () => {
  const { input } = await snapshot('hidden_object'); input.parent.status = 'hidden';
  await assert.rejects(buildPublicPuzzleResponse(input, PROJECT), { code: 'public_puzzle_parent_not_published' });
});

test('Hidden public response retains author share wording while preserving answer masks', async () => {
  const { input } = await snapshot('hidden_object');
  input.puzzle.definition.prompt = '花を見つけよう';
  const response = await buildPublicPuzzleResponse(input, PROJECT);
  assert.equal(response.puzzle.definition.prompt, input.puzzle.definition.prompt);
  assert.deepEqual(response.puzzle.definition.targets, input.puzzle.definition.targets);
  assert.doesNotMatch(JSON.stringify(response), /private-note|private-author|secret-cell/);
});

test('all three IDs, parent and point dates, review approval and version are mandatory', async () => {
  for (const change of [
    (input) => { input.point.postId = OTHER_ID; },
    (input) => { input.puzzle.postId = OTHER_ID; },
    (input) => { input.parent.id = OTHER_ID; },
    (input) => { input.puzzle.reviewState = 'pending'; },
    (input) => { input.parent.publishedAt = ''; },
    (input) => { input.point.publishedAt = 'not a date'; },
    (input) => { input.point.publishedAt = '2026-02-31T12:00:00Z'; },
    (input) => { input.puzzle.mode = 'mystery'; },
    (input) => { input.puzzle.schemaVersion = 2; },
    (input) => { input.puzzle.definition.schemaVersion = 2; },
  ]) {
    const { input } = await snapshot('hidden_object'); change(input);
    await assert.rejects(buildPublicPuzzleResponse(input, PROJECT));
  }
});

test('storage keys must be same-post relative PNG keys and project config must be an HTTPS root', async () => {
  const overlongSegments = Array.from({ length: 30 }, () => 'segment'.repeat(16)).join('/');
  for (const path of [
    `https://evil.example/${POST_ID}/file.png`, `/storage/${POST_ID}/file.png`, `${POST_ID}//file.png`, `${POST_ID}/../file.png`,
    `${POST_ID}\\file.png`, `${POST_ID}/file%2Epng`, `${POST_ID}/file.png?download=1`, `${POST_ID}/file.png#fragment`, `${OTHER_ID}/file.png`, `${POST_ID}/file.jpg`, `${POST_ID}/${overlongSegments}/image.png`,
  ]) {
    const { input } = await snapshot('hidden_object'); input.point.imagePath = path;
    await assert.rejects(buildPublicPuzzleResponse(input, PROJECT), { code: 'public_puzzle_image_path_invalid' });
  }
  const { input } = await snapshot('hidden_object');
  for (const url of ['http://example.supabase.co', 'https://user:pass@example.supabase.co', `${PROJECT}/path`, `${PROJECT}/.`, `${PROJECT}?key=x`, `${PROJECT}#hash`]) {
    await assert.rejects(buildPublicPuzzleResponse(input, url), { code: 'public_puzzle_config_invalid' });
  }
});

test('PNG claims and mode-specific definitions are checked against actual bytes', async () => {
  const spot = await snapshot('spot_difference');
  spot.input.parent.imageClaim.colorCount += 1;
  await assert.rejects(buildPublicPuzzleResponse(spot.input, PROJECT), { code: 'public_puzzle_original_image_colors_invalid' });
  const falseSpot = await snapshot('spot_difference'); falseSpot.input.puzzle.definition.candidates[0].pixels = [5];
  await assert.rejects(buildPublicPuzzleResponse(falseSpot.input, PROJECT), { code: 'public_puzzle_definition_invalid' });
  const hiddenAttachment = await snapshot('hidden_object'); hiddenAttachment.input.puzzle.changedImage = { path: `${POST_ID}/unexpected.png`, claim: {} };
  await assert.rejects(buildPublicPuzzleResponse(hiddenAttachment.input, PROJECT), { code: 'public_puzzle_changed_image_unexpected' });
  const hiddenBytes = await snapshot('hidden_object'); hiddenBytes.input.changedBytes = Uint8Array.of(1, 2, 3);
  await assert.rejects(buildPublicPuzzleResponse(hiddenBytes.input, PROJECT), { code: 'public_puzzle_changed_image_unexpected' });
});

test('title is parent-owned and author fallback is display-only', async () => {
  const { input } = await snapshot('hidden_object'); input.parent.authorLabel = undefined;
  const response = await buildPublicPuzzleResponse(input, PROJECT);
  assert.equal(response.puzzle.title, '作品タイトル');
  assert.equal(response.puzzle.author, '作者不明');
  input.parent.title = '題'.repeat(61);
  await assert.rejects(buildPublicPuzzleResponse(input, PROJECT), { code: 'public_puzzle_title_invalid' });
});
