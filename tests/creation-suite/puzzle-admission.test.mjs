import test from 'node:test';
import assert from 'node:assert/strict';
import { admitPuzzleUpload } from '../../supabase/functions/_shared/puzzle-admission.mjs';
import { inspectPixelPng } from '../../supabase/functions/_shared/pixel-png.mjs';
import { createDrawDocument, encodePng } from '../../js/creation/draw-core.mjs';

function pngWithPixels(changes = {}) {
  const document = createDrawDocument(16);
  for (const [index, color] of Object.entries(changes)) document.pixels[Number(index)] = color;
  return encodePng(document);
}

async function claim(bytes) {
  return { mimeType: 'image/png', size: bytes.length, ...await inspectPixelPng(bytes) };
}

function spotPuzzle(changedBytes, changedClaim) {
  return {
    mode: 'spot_difference',
    definition: { schemaVersion: 1, width: 16, height: 16, confirmed: true, candidates: [{ id: 'real', pixels: [4] }], source: 'untrusted', extra: true },
    changedImage: { ...changedClaim, base64: Buffer.from(changedBytes).toString('base64'), ignored: 'untrusted' },
    source: { schemaVersion: 1, original: sourceRef('id-1'), changed: sourceRef('550e8400-e29b-41d4-a716-446655440000'), ignored: 'untrusted' },
  };
}

function sourceRef(draftId) {
  return { draftId, assetId: 'asset_1', revisionId: 'revision-1', contentHash: 'a'.repeat(64), hashScheme: 'sha256-canonical-v1' };
}

test('Draw-generated Spot PNG accepts one real difference and returns an allowlist', async () => {
  const original = pngWithPixels(); const changed = pngWithPixels({ 4: 2, 8: 3 });
  const result = await admitPuzzleUpload(spotPuzzle(changed, await claim(changed)), original, await claim(original));
  assert.equal(result.mode, 'spot_difference');
  assert.deepEqual(result.definition.candidates, [{ id: 'real', pixels: [4] }]);
  assert.deepEqual(Object.keys(result), ['mode', 'source', 'definition', 'original', 'changed']);
  assert.deepEqual(result.source, {
    schemaVersion: 1,
    original: sourceRef('id-1'),
    changed: sourceRef('550e8400-e29b-41d4-a716-446655440000'),
  });
  assert.deepEqual(Object.keys(result.changed), ['bytes', 'width', 'height', 'colorCount']);
  assert.equal(result.changed.width, 16);
  assert.equal(Object.hasOwn(result, 'untrusted'), false);
  assert.equal(Object.hasOwn(result.changed, 'base64'), false);
});

test('Draw-generated Hidden PNG accepts valid masks and returns normalized source and recalculated hitboxes', async () => {
  const original = pngWithPixels(); const pixels = [];
  for (let y = 5; y < 10; y += 1) for (let x = 5; x < 10; x += 1) pixels.push(y * 16 + x);
  const result = await admitPuzzleUpload({ mode: 'hidden_object', source: { schemaVersion: 1, original: { ...sourceRef('local_draft'), privateExtra: true }, clientExtra: true }, definition: { schemaVersion: 1, width: 16, height: 16, confirmed: true, targets: [{ id: 'flower', name: '花', pixels }], clientOnly: true } }, original, await claim(original));
  assert.equal(result.mode, 'hidden_object');
  assert.equal(result.definition.targets[0].name, '花');
  assert.equal(result.definition.hitBoxes.length, 1);
  assert.equal(Object.hasOwn(result, 'changed'), false);
  assert.deepEqual(Object.keys(result.source), ['schemaVersion', 'original']);
  assert.equal(Object.hasOwn(result.source.original, 'privateExtra'), false);
});

test('rejects forged image claims, malformed base64, excessive size, and changed dimensions', async () => {
  const original = pngWithPixels(); const changed = pngWithPixels({ 4: 2 });
  const originalClaim = await claim(original); const changedClaim = await claim(changed);
  await assert.rejects(admitPuzzleUpload(spotPuzzle(changed, changedClaim), original, { ...originalClaim, colorCount: 99 }), { code: 'puzzle_original_image_colors_invalid' });
  await assert.rejects(admitPuzzleUpload(spotPuzzle(changed, { ...changedClaim, width: 32 }), original, originalClaim), { code: 'puzzle_changed_image_image_pixels_invalid' });
  const malformed = spotPuzzle(changed, changedClaim); malformed.changedImage.base64 = 'YQ===';
  await assert.rejects(admitPuzzleUpload(malformed, original, originalClaim), { code: 'puzzle_changed_image_base64_invalid' });
  const oversized = spotPuzzle(changed, changedClaim); oversized.changedImage.base64 = Buffer.alloc(512 * 1024 + 1).toString('base64');
  await assert.rejects(admitPuzzleUpload(oversized, original, originalClaim), { code: 'puzzle_changed_image_size_invalid' });
});

test('rejects false answers, unknown modes and versions, and changed images on Hidden', async () => {
  const original = pngWithPixels(); const changed = pngWithPixels({ 4: 2 }); const originalClaim = await claim(original);
  const falseAnswer = spotPuzzle(changed, await claim(changed)); falseAnswer.definition.candidates[0].pixels = [5];
  await assert.rejects(admitPuzzleUpload(falseAnswer, original, originalClaim), { code: 'puzzle_definition_invalid' });
  await assert.rejects(admitPuzzleUpload({ mode: 'other', definition: {} }, original, originalClaim), { code: 'puzzle_mode_invalid' });
  const unknownVersion = { mode: 'hidden_object', source: { schemaVersion: 1, original: sourceRef('id-1') }, definition: { schemaVersion: 2, width: 16, height: 16, confirmed: true, targets: [] } };
  await assert.rejects(admitPuzzleUpload(unknownVersion, original, originalClaim), { code: 'puzzle_definition_version_unsupported' });
  await assert.rejects(admitPuzzleUpload({ mode: 'hidden_object', source: { schemaVersion: 1, original: sourceRef('id-1') }, definition: { schemaVersion: 1, width: 16, height: 16, confirmed: true, targets: [] }, changedImage: {} }, original, originalClaim), { code: 'puzzle_changed_image_unexpected' });
});

test('requires valid source references for each mode and normalizes away extra source keys', async () => {
  const original = pngWithPixels(); const changed = pngWithPixels({ 4: 2 }); const originalClaim = await claim(original); const changedClaim = await claim(changed);
  const missing = spotPuzzle(changed, changedClaim); delete missing.source.changed;
  await assert.rejects(admitPuzzleUpload(missing, original, originalClaim), { code: 'puzzle_source_invalid' });
  const malformedHash = spotPuzzle(changed, changedClaim); malformedHash.source.original.contentHash = 'A'.repeat(64);
  await assert.rejects(admitPuzzleUpload(malformedHash, original, originalClaim), { code: 'puzzle_source_invalid' });
  const badId = spotPuzzle(changed, changedClaim); badId.source.changed.assetId = 'invalid/id';
  await assert.rejects(admitPuzzleUpload(badId, original, originalClaim), { code: 'puzzle_source_invalid' });
  const hidden = { mode: 'hidden_object', source: { schemaVersion: 1, original: sourceRef('id-1'), changed: sourceRef('id-2') }, definition: { schemaVersion: 1, width: 16, height: 16, confirmed: true, targets: [{ id: 'x', name: 'x', pixels: [85] }] } };
  await assert.rejects(admitPuzzleUpload(hidden, original, originalClaim), { code: 'puzzle_source_invalid' });
  const changedSource = spotPuzzle(changed, changedClaim);
  changedSource.source.changed.contentHash = 'b'.repeat(64);
  const accepted = await admitPuzzleUpload(changedSource, original, originalClaim);
  assert.equal(accepted.source.changed.contentHash, 'b'.repeat(64));
});
