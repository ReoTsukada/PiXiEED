import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpotDifferenceImagePair } from '../../js/creation/draw-import.mjs';
import { documentRgba } from '../../js/creation/draw-core.mjs';
import { detectDifferenceCandidates } from '../../js/creation/spot-difference-core.mjs';

function raster(width, height, pixel) {
  const data = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p++) data.set(pixel(p), p * 4);
  return { width, height, data };
}

test('pair reduction never invents differences in unchanged pixels, even with different color frequencies', () => {
  const before = raster(32, 32, p => [p % 251, (p * 13) % 253, (p * 29) % 255, 255]);
  const after = structuredClone(before);
  for (let p = 500; p < 800; p++) after.data.set([255, 0, 127, 255], p * 4);
  const originalBytes = new Uint8Array(before.data);
  const changedBytes = new Uint8Array(after.data);
  const result = createSpotDifferenceImagePair(before, after);
  assert.equal(result.quantized, true);
  assert.ok(result.before.palette.length <= 32);
  assert.ok(result.after.palette.length <= 32);
  const a = documentRgba(result.before), b = documentRgba(result.after);
  for (let p = 0; p < 1024; p++) {
    if (p >= 500 && p < 800) continue;
    assert.deepEqual(a.slice(p * 4, p * 4 + 4), b.slice(p * 4, p * 4 + 4), `unchanged pixel ${p}`);
  }
  assert.deepEqual(before.data, originalBytes);
  assert.deepEqual(after.data, changedBytes);
});

test('exact-color imports preserve the intended single-pixel difference and ignore hidden transparent RGB', () => {
  const before = raster(16, 16, () => [12, 40, 90, 255]);
  const after = structuredClone(before);
  before.data.set([0, 0, 0, 0], 0);
  after.data.set([255, 30, 40, 0], 0);
  after.data.set([245, 220, 100, 255], 10 * 4);
  const pair = createSpotDifferenceImagePair(before, after);
  const difference = detectDifferenceCandidates(pair.before, pair.after);
  assert.equal(pair.quantized, false);
  assert.deepEqual(difference.candidates.flatMap(group => group.pixels), [10]);
});

test('pair dimensions must match before conversion and never crop or stretch one picture to the other', () => {
  const original = raster(16, 16, () => [10, 20, 30, 255]);
  assert.throws(() => createSpotDifferenceImagePair(original, raster(32, 16, () => [10, 20, 30, 255])), /同じ幅・高さ/);
  assert.deepEqual(original.data.slice(0, 4), Uint8Array.of(10, 20, 30, 255));
});

test('large imports use identical bounded grids while keeping input pixels intact', () => {
  const before = raster(600, 300, p => [p % 2 ? 20 : 230, Math.floor(p / 600) % 2 ? 40 : 210, 70, 255]);
  const after = structuredClone(before);
  const pair = createSpotDifferenceImagePair(before, after);
  assert.ok(pair.width <= 256 && pair.height <= 256);
  assert.equal(pair.width / pair.height, 2);
  assert.equal(before.width, 600);
  assert.equal(before.data.length, 600 * 300 * 4);
  assert.deepEqual(documentRgba(pair.before), documentRgba(pair.after));
  assert.throws(() => createSpotDifferenceImagePair(before, after, { maxDimension: 512 }), /上限/);
  assert.throws(() => createSpotDifferenceImagePair(before, after, { maxColors: 33 }), /上限/);
});

test('an enlarged dot grid is recovered jointly without inventing or losing its changed cell', () => {
  const width = 64;
  const before = raster(width, width, p => {
    const x = Math.floor((p % width) / 4), y = Math.floor(Math.floor(p / width) / 4);
    return (x + y) % 2 ? [220, 90, 40, 255] : [20, 70, 180, 255];
  });
  const after = structuredClone(before);
  for (let y = 20; y < 24; y++) for (let x = 28; x < 32; x++) after.data.set([40, 220, 110, 255], (y * width + x) * 4);
  const pair = createSpotDifferenceImagePair(before, after);
  assert.equal(pair.commonGridScale, 4);
  assert.equal(pair.width, 16); assert.equal(pair.height, 16);
  assert.deepEqual(detectDifferenceCandidates(pair.before, pair.after).candidates.flatMap(c => c.pixels), [5 * 16 + 7]);
});
