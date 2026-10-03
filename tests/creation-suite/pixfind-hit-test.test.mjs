import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPixfindHit } from '../../js/creation/pixfind-hit-test.mjs';

function region(width, height, pixels) {
  const xs = pixels.map((pixel) => pixel % width); const ys = pixels.map((pixel) => Math.floor(pixel / width));
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const maskWidth = maxX - minX + 1; const maskHeight = maxY - minY + 1; const mask = new Uint8Array(maskWidth * maskHeight);
  for (const pixel of pixels) mask[(Math.floor(pixel / width) - minY) * maskWidth + (pixel % width - minX)] = 1;
  return { minX, maxX, minY, maxY, maskWidth, maskHeight, mask, pixels: Uint32Array.from(pixels) };
}

const hit = (regions, x, y, options = {}) => selectPixfindHit(regions, x, y, { width: 16, height: 16, scale: 1, ...options });

test('spot difference requires exact mask inside, including holes and concave corners', () => {
  const ring = region(16, 16, [5 * 16 + 5, 5 * 16 + 6, 6 * 16 + 5, 6 * 16 + 7, 7 * 16 + 5, 7 * 16 + 6]);
  assert.deepEqual(hit([ring], 5.5, 5.5, { toleranceCssPx: 0 }), { type: 'hit', index: 0 });
  assert.equal(hit([ring], 6.5, 6.5, { toleranceCssPx: 0 }).type, 'miss');
  assert.equal(hit([ring], 6.5, 6.5, { pointerType: 'touch' }).type, 'miss', 'a mask hole is never widened into a correct answer');
  assert.equal(hit([ring], 4.5, 4.5, { toleranceCssPx: 0 }).type, 'miss');
});

test('CSS tolerance scales with rendered zoom and uses smaller mouse than touch allowance', () => {
  const target = region(16, 16, [8 * 16 + 8]);
  assert.equal(hit([target], 5.5, 8.5, { scale: 1, pointerType: 'mouse' }).type, 'hit');
  assert.equal(hit([target], 1.5, 8.5, { scale: 1, pointerType: 'mouse' }).type, 'miss');
  assert.equal(hit([target], 1.5, 8.5, { scale: 1, pointerType: 'touch' }).type, 'hit');
  assert.equal(hit([target], 4.5, 8.5, { scale: 2, pointerType: 'mouse' }).type, 'miss');
  assert.equal(hit([target], 4.5, 8.5, { scale: 2, pointerType: 'touch' }).type, 'hit');
});

test('nearest target wins, equal-distance targets are ambiguous, and image exterior is ignored', () => {
  const left = region(16, 16, [8 * 16 + 5]); const right = region(16, 16, [8 * 16 + 9]);
  assert.deepEqual(hit([left, right], 6.5, 8.5, { toleranceCssPx: 12 }), { type: 'hit', index: 0 });
  assert.equal(hit([left, right], 7.5, 8.5, { toleranceCssPx: 12 }).type, 'ambiguous');
  assert.equal(hit([left], -0.5, 8.5).type, 'outside');
  assert.equal(hit([left], 16, 8.5).type, 'outside');
});

test('retapping an already found target is distinct from a miss', () => {
  const target = region(16, 16, [8 * 16 + 8]);
  assert.deepEqual(hit([target], 8.5, 8.5, { found: new Set([0]) }), { type: 'found', index: 0 });
  assert.equal(hit([target], 2.5, 2.5, { found: new Set([0]) }).type, 'miss');
});

test('hidden authored boxes can request exact-only matching', () => {
  const box = region(16, 16, [8 * 16 + 8, 8 * 16 + 9, 9 * 16 + 8, 9 * 16 + 9]);
  assert.equal(hit([box], 7.5, 8.5, { useTolerance: false, toleranceCssPx: 0 }).type, 'miss');
  assert.equal(hit([box], 8.5, 8.5, { useTolerance: false, toleranceCssPx: 0 }).type, 'hit');
});
