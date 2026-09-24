import test from 'node:test';
import assert from 'node:assert/strict';
import { orderedRampIndex, orderedToneIndex, prepareToneRamp } from '../../js/pixel-studio/ordered-dither.mjs';

const ramp = prepareToneRamp([[0, 0, 0], [255, 255, 255]], [0, 1]);
function countUpper(light) {
  let count = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (orderedRampIndex(light, ramp, x, y) === 1) count++;
  }
  return count;
}

test('ordered tone selection is deterministic at fixed integer coordinates', () => {
  const expected = Array.from({ length: 64 }, (_, i) => orderedRampIndex(128, ramp, i % 8, Math.floor(i / 8)));
  const repeated = Array.from({ length: 64 }, (_, i) => orderedRampIndex(128, ramp, i % 8, Math.floor(i / 8)));
  assert.deepEqual(repeated, expected);
});

test('50 percent coverage is an exact four-neighbor checkerboard', () => {
  const output = Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => orderedRampIndex(127.5, ramp, x, y)));
  assert.equal(output.flat().filter((index) => index === 1).length, 32);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (x < 7) assert.notEqual(output[y][x], output[y][x + 1]);
    if (y < 7) assert.notEqual(output[y][x], output[y + 1][x]);
  }
});

test('quantized coverage produces exact 0, 25, 50, 75 and 100 percent densities', () => {
  const densities = [0, 0.25, 0.5, 0.75, 1];
  const counts = densities.map((coverage) => countUpper(coverage * 255));
  assert.deepEqual(counts, [0, 16, 32, 48, 64]);
  assert.ok(counts.every((count, i) => i === 0 || count >= counts[i - 1]));
});

test('clamps to ramp ends and only returns an allowed palette entry', () => {
  const palette = [[250, 0, 0], [0, 0, 0], [255, 255, 255], [128, 128, 128]];
  const prepared = prepareToneRamp(palette, [0, 2, 3]);
  assert.equal(orderedRampIndex(-10, prepared, 0, 0), 0);
  assert.equal(orderedRampIndex(300, prepared, 0, 0), 2);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    assert.ok([0, 2, 3].includes(orderedRampIndex(120, prepared, x, y)));
  }
  assert.equal(orderedToneIndex(300, palette, [2], 0, 0), 2);
});

test('negative coordinates repeat the same fixed 8x8 pattern', () => {
  for (let y = -8; y < 0; y++) for (let x = -8; x < 0; x++) {
    assert.equal(orderedRampIndex(100, ramp, x, y), orderedRampIndex(100, ramp, x + 8, y + 8));
  }
});

test('low contrast tones use the nearest entry and malformed coordinates fail clearly', () => {
  const close = prepareToneRamp([[100, 100, 100], [102, 102, 102]], [0, 1]);
  assert.equal(orderedRampIndex(100.5, close, 0, 0), 0);
  assert.equal(orderedRampIndex(101.5, close, 0, 0), 1);
  assert.throws(() => prepareToneRamp([], []), /one to three/);
  assert.throws(() => orderedRampIndex(NaN, ramp, 0, 0), /finite/);
  assert.throws(() => orderedRampIndex(10, ramp, 0.5, 0), /integer/);
});
