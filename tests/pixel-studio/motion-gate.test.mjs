import test from 'node:test';
import assert from 'node:assert/strict';
import { detectChangedCells } from '../../js/pixel-studio/motion-gate.mjs';

function rgbFrame(width, height, colorAt) {
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 3;
    const color = colorAt(x, y);
    rgb[p] = color[0]; rgb[p + 1] = color[1]; rgb[p + 2] = color[2];
  }
  return rgb;
}

function ids(width, height, idAt) {
  const result = new Uint32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) result[y * width + x] = idAt(x, y);
  return result;
}

test('moving a thin object invalidates the old and new outlines plus a one-cell halo', () => {
  const width = 8, height = 5;
  const previousObjects = ids(width, height, (x) => x === 2 ? 9 : 1);
  const currentObjects = ids(width, height, (x) => x === 3 ? 9 : 1);
  const previousRgb = rgbFrame(width, height, (x) => x === 2 ? [16, 16, 16] : [220, 220, 220]);
  const currentRgb = rgbFrame(width, height, (x) => x === 3 ? [16, 16, 16] : [220, 220, 220]);
  const changed = detectChangedCells(currentRgb, previousRgb, currentObjects, previousObjects, width, height);

  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 4; x++) assert.equal(changed[y * width + x], 1);
  assert.equal(changed[0], 0, 'distant background remains eligible for temporal reuse');
  assert.equal(changed[4 * width + 7], 0);
});

test('independent RGB noise of plus or minus two does not release stable cells', () => {
  const width = 12, height = 9;
  const objects = ids(width, height, () => 4);
  const previousRgb = rgbFrame(width, height, () => [120, 140, 160]);
  const currentRgb = rgbFrame(width, height, (x, y) => [
    120 + ((x + y) % 3 - 1) * 2,
    140 + ((2 * x + y) % 3 - 1) * 2,
    160 + ((x + 2 * y) % 3 - 1) * 2
  ]);

  const changed = detectChangedCells(currentRgb, previousRgb, objects, objects, width, height);
  assert.deepEqual(changed, new Uint8Array(width * height));
});

test('a low-contrast moving edge is detected and releases both sides of its old boundary', () => {
  const width = 8, height = 3;
  const objects = ids(width, height, () => 2);
  const previousRgb = rgbFrame(width, height, (x) => x < 4 ? [100, 100, 100] : [105, 105, 105]);
  const currentRgb = rgbFrame(width, height, (x) => x < 5 ? [100, 100, 100] : [105, 105, 105]);

  const changed = detectChangedCells(currentRgb, previousRgb, objects, objects, width, height);
  for (let y = 0; y < height; y++) for (let x = 3; x <= 5; x++) assert.equal(changed[y * width + x], 1);
  assert.equal(changed[1], 0);
  assert.equal(changed[6], 0);
});

test('object ID changes invalidate even when sampled RGB is identical', () => {
  const width = 5, height = 4;
  const previousObjects = ids(width, height, (x, y) => x === 2 && y === 1 ? 8 : 3);
  const currentObjects = ids(width, height, () => 3);
  const rgb = rgbFrame(width, height, () => [90, 120, 150]);
  const changed = detectChangedCells(rgb, rgb, currentObjects, previousObjects, width, height);

  for (let y = 0; y <= 2; y++) for (let x = 1; x <= 3; x++) assert.equal(changed[y * width + x], 1);
});

test('missing history invalidates every cell and inputs are not mutated', () => {
  const width = 3, height = 2;
  const rgb = rgbFrame(width, height, () => [10, 20, 30]);
  const objects = ids(width, height, () => 1);
  const originalRgb = new Uint8Array(rgb), originalObjects = new Uint32Array(objects);
  assert.deepEqual(detectChangedCells(rgb, null, objects, null, width, height), new Uint8Array(width * height).fill(1));
  assert.deepEqual(rgb, originalRgb);
  assert.deepEqual(objects, originalObjects);
});

test('invalid dimensions, unmatched history, and wrong buffer lengths are rejected', () => {
  assert.throws(() => detectChangedCells(new Uint8Array(3), null, new Uint32Array([0]), null, 0, 1), RangeError);
  assert.throws(() => detectChangedCells(new Uint8Array(3), null, new Uint32Array([0]), new Uint32Array([0]), 1, 1), /both be present or both be absent/);
  assert.throws(() => detectChangedCells(new Uint8Array(2), null, new Uint32Array([0]), null, 1, 1), /currentRgb/);
  assert.throws(() => detectChangedCells(new Uint8Array(3), new Uint8Array(3), new Uint32Array([0]), new Uint32Array([0]), 513, 1), RangeError);
});
