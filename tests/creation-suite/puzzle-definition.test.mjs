import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHiddenPuzzleDefinition, validateSpotPuzzleDefinition } from '../../supabase/functions/_shared/puzzle-definition.mjs';
import { decodePixelPngRgba } from '../../supabase/functions/_shared/pixel-png.mjs';
import { buildHiddenObjectHitBoxes } from '../../js/creation/hidden-object-core.mjs';
import { createDrawDocument, encodePng } from '../../js/creation/draw-core.mjs';

function image(width, height, color = [0, 0, 0, 255]) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) rgba.set(color, i * 4);
  return { width, height, rgba };
}
function spotFixture() {
  const original = image(16, 16); const changed = image(16, 16);
  changed.rgba.set([255, 0, 0, 255], 4 * 4);
  changed.rgba.set([0, 0, 255, 255], 4 * 8);
  const definition = { schemaVersion: 1, width: 16, height: 16, confirmed: true, candidates: [{ id: 'spot', pixels: [4] }], source: 'omit', extra: true };
  return { original, changed, definition };
}
function hiddenFixture() {
  const original = image(16, 16);
  const pixels = [];
  for (let y = 5; y < 10; y += 1) for (let x = 5; x < 10; x += 1) pixels.push(y * 16 + x);
  return { original, definition: { schemaVersion: 1, width: 16, height: 16, confirmed: true, targets: [{ id: 'flower', name: '花', pixels }] } };
}

test('Spot validation returns only allowlisted fields and permits omitted real differences', () => {
  const { original, changed, definition } = spotFixture();
  const result = validateSpotPuzzleDefinition(definition, original, changed);
  assert.deepEqual(result, { schemaVersion: 1, width: 16, height: 16, confirmed: true, candidates: [{ id: 'spot', pixels: [4] }] });
  assert.equal(Object.hasOwn(result, 'source'), false);
});

test('Drawの実PNGを復号した画素でSpotの正解を照合できる', async () => {
  const original = createDrawDocument(16);
  const changed = structuredClone(original);
  changed.pixels[4] = 2;
  changed.pixels[8] = 3;
  const before = await decodePixelPngRgba(encodePng(original));
  const after = await decodePixelPngRgba(encodePng(changed));
  const definition = { schemaVersion: 1, width: 16, height: 16, confirmed: true, candidates: [{ id: 'line', pixels: [4] }] };
  assert.deepEqual(validateSpotPuzzleDefinition(definition, before, after).candidates, [{ id: 'line', pixels: [4] }]);
  assert.throws(() => validateSpotPuzzleDefinition({ ...definition, candidates: [{ id: 'false', pixels: [5] }] }, before, after), /実際に異なる/);
});

test('Spot rejects mismatched images, false answers, transparent RGB-only differences, and no differences', () => {
  const { original, changed, definition } = spotFixture();
  assert.throws(() => validateSpotPuzzleDefinition(definition, original, image(32, 16)), /寸法/);
  assert.throws(() => validateSpotPuzzleDefinition({ ...definition, candidates: [{ id: 'wrong', pixels: [5] }] }, original, changed), /実際に異なる/);
  const transparentA = image(16, 16, [1, 2, 3, 0]); const transparentB = image(16, 16, [9, 8, 7, 0]);
  assert.throws(() => validateSpotPuzzleDefinition({ ...definition, candidates: [{ id: 'alpha', pixels: [0] }] }, transparentA, transparentB), /実際の差分/);
  assert.throws(() => validateSpotPuzzleDefinition({ ...definition, candidates: [{ id: 'alpha', pixels: [0] }] }, image(16, 16), image(16, 16)), /実際の差分/);
});

test('Spot rejects duplicate/out-of-range candidate pixels and unconfirmed or unknown versions', () => {
  const { original, changed, definition } = spotFixture();
  assert.throws(() => validateSpotPuzzleDefinition({ ...definition, candidates: [{ id: 'a', pixels: [4] }, { id: 'b', pixels: [4] }] }, original, changed), /重複/);
  assert.throws(() => validateSpotPuzzleDefinition({ ...definition, candidates: [{ id: 'a', pixels: [256] }] }, original, changed), /範囲外/);
  assert.throws(() => validateSpotPuzzleDefinition({ ...definition, candidates: [{ id: '<script>', pixels: [4] }] }, original, changed), /候補ID/);
  assert.throws(() => validateSpotPuzzleDefinition({ ...definition, confirmed: false }, original, changed), /確認済み/);
  assert.throws(() => validateSpotPuzzleDefinition({ ...definition, schemaVersion: 2 }, original, changed), /バージョン/);
});

test('Hidden validation recalculates hitboxes and matches the client core on a successful fixture', () => {
  const { original, definition } = hiddenFixture();
  const result = validateHiddenPuzzleDefinition({ ...definition, hitBoxes: [{ targetId: 'bad', minX: 15, maxX: 15, minY: 15, maxY: 15 }] }, original);
  assert.deepEqual(result.hitBoxes, buildHiddenObjectHitBoxes(definition.targets, 16, 16, 120));
  assert.equal(Object.hasOwn(result, 'source'), false);
});

test('Hidden public definition preserves bounded author wording but strips unrelated fields', () => {
  const { original, definition } = hiddenFixture();
  const plain = validateHiddenPuzzleDefinition(definition, original);
  const result = validateHiddenPuzzleDefinition({ ...definition, prompt: ' 鍵が6こ ', extra: 'private' }, original);
  assert.equal(result.prompt, '鍵が6こ'); assert.equal(Object.hasOwn(result, 'extra'), false);
  assert.deepEqual(result.hitBoxes, plain.hitBoxes);
  assert.equal(Object.hasOwn(plain, 'prompt'), false);
  for (const prompt of [null, {}, 'あ'.repeat(181), 'a\u0000b']) assert.throws(() => validateHiddenPuzzleDefinition({ ...definition, prompt }, original), /180文字/);
});

test('Hidden rejects bad masks, duplicate IDs/names, and overlapping recomputed hitboxes', () => {
  const { original, definition } = hiddenFixture();
  assert.throws(() => validateHiddenPuzzleDefinition({ ...definition, targets: [{ ...definition.targets[0], pixels: [] }] }, original), /画素数/);
  assert.throws(() => validateHiddenPuzzleDefinition({ ...definition, targets: [{ ...definition.targets[0], pixels: [256] }] }, original), /範囲外/);
  assert.throws(() => validateHiddenPuzzleDefinition({ ...definition, targets: [definition.targets[0], { id: 'leaf', name: '葉', pixels: [definition.targets[0].pixels[0]] }] }, original), /重複/);
  assert.throws(() => validateHiddenPuzzleDefinition({ ...definition, targets: [definition.targets[0], { ...definition.targets[0], name: '葉' }] }, original), /ID/);
  assert.throws(() => validateHiddenPuzzleDefinition({ ...definition, targets: [definition.targets[0], { ...definition.targets[0], id: 'leaf', name: '花' }] }, original), /重複/);
  assert.throws(() => validateHiddenPuzzleDefinition({ ...definition, targets: [{ id: 'long', name: 'あ'.repeat(81), pixels: definition.targets[0].pixels }] }, original), /長すぎ/);
  assert.throws(() => validateHiddenPuzzleDefinition({ ...definition, targets: [{ id: 'unsafe', name: '花\n葉', pixels: definition.targets[0].pixels }] }, original), /対象名/);
  const separated = [{ id: 'a', name: 'A', pixels: [5 * 16 + 5] }, { id: 'b', name: 'B', pixels: [5 * 16 + 8] }];
  assert.throws(() => validateHiddenPuzzleDefinition({ ...definition, targets: separated }, original), /重なっています/);
  assert.throws(() => validateHiddenPuzzleDefinition({ ...definition, targets: [{ id: 'dup', name: 'X', pixels: [1, 1] }] }, original), /重複/);
});

test('Hidden rejects unconfirmed or unsupported versions and ignores client hitbox tampering', () => {
  const { original, definition } = hiddenFixture();
  assert.throws(() => validateHiddenPuzzleDefinition({ ...definition, confirmed: false }, original), /確認済み/);
  assert.throws(() => validateHiddenPuzzleDefinition({ ...definition, schemaVersion: 0 }, original), /バージョン/);
  const result = validateHiddenPuzzleDefinition({ ...definition, hitBoxes: [{ minX: 0, minY: 0, maxX: 15, maxY: 15 }] }, original);
  assert.deepEqual(result.hitBoxes, buildHiddenObjectHitBoxes(definition.targets, 16, 16, 120));
});
