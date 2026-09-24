import test from 'node:test';
import assert from 'node:assert/strict';
import { removeSurfaceSpecks } from '../../js/pixel-studio/surface-specks.mjs';

function makeSurface(width = 9, height = 9, background = [124, 132, 116]) {
  const count = width * height;
  const rgb = new Uint8Array(count * 3), coverageRgb = new Float32Array(count * 3);
  for (let cell = 0; cell < count; cell++) {
    rgb.set(background, cell * 3);
    coverageRgb.set(background, cell * 3);
  }
  return { rgb, coverageRgb, counts: new Uint32Array(count).fill(8), objects: new Uint32Array(count).fill(1), width, height };
}

function setCoverageForFraction(input, x, y, color, fraction) {
  const cell = y * input.width + x, offset = cell * 3;
  for (let channel = 0; channel < 3; channel++) {
    const background = input.coverageRgb[offset + channel];
    input.rgb[offset + channel] = color[channel];
    input.coverageRgb[offset + channel] = background + (color[channel] - background) * fraction;
  }
}

function pixel(rgb, width, x, y) {
  const offset = (y * width + x) * 3;
  return [...rgb.subarray(offset, offset + 3)];
}

test('removes a low-coverage strong isolated sample using an actual background color', () => {
  const input = makeSurface();
  setCoverageForFraction(input, 4, 4, [30, 34, 29], 0.125);
  const source = new Uint8Array(input.rgb), coverage = new Float32Array(input.coverageRgb), counts = new Uint32Array(input.counts);
  const result = removeSurfaceSpecks(input);
  assert.equal(result.removedCells, 1);
  assert.deepEqual(pixel(result.rgb, input.width, 4, 4), [124, 132, 116]);
  assert.deepEqual(input.rgb, source);
  assert.deepEqual(input.coverageRgb, coverage);
  assert.deepEqual(input.counts, counts);
  assert.notEqual(result.rgb, input.rgb);
});

test('decides a multi-cell fragment from the original frame and leaves two-pixel straight or diagonal strokes', () => {
  const fragment = makeSurface(11, 11);
  for (const [x, y] of [[5, 5], [6, 5], [6, 6]]) setCoverageForFraction(fragment, x, y, [48, 52, 44], 0.125);
  const cleaned = removeSurfaceSpecks(fragment);
  assert.equal(cleaned.removedCells, 3, 'the non-linear tiny fragment does not survive as amplified colors');
  for (const [x, y] of [[5, 5], [6, 5], [6, 6]]) assert.deepEqual(pixel(cleaned.rgb, 11, x, y), [124, 132, 116]);

  for (const points of [
    [[4, 4], [5, 4]],
    [[4, 4], [4, 5]],
    [[4, 4], [5, 5]],
    [[5, 5], [6, 4]]
  ]) {
    const line = makeSurface(11, 11);
    for (const [x, y] of points) setCoverageForFraction(line, x, y, [48, 52, 44], 0.125);
    const retained = removeSurfaceSpecks(line);
    for (const [x, y] of points) assert.deepEqual(pixel(retained.rgb, 11, x, y), [48, 52, 44], 'ambiguous two-pixel line is kept');
  }
});

test('requires enough actual source coverage and keeps real coverage, bright cores, and non-collinear residuals', () => {
  const lowCount = makeSurface();
  setCoverageForFraction(lowCount, 4, 4, [30, 34, 29], 0.125);
  lowCount.counts[4 * 9 + 4] = 3;
  assert.deepEqual(removeSurfaceSpecks(lowCount).rgb, lowCount.rgb);

  const substantial = makeSurface();
  setCoverageForFraction(substantial, 4, 4, [30, 34, 29], 0.25);
  substantial.counts[4 * 9 + 4] = 4;
  assert.deepEqual(pixel(removeSurfaceSpecks(substantial).rgb, 9, 4, 4), [124, 132, 116], 'a supported quarter-cell average can be corrected');

  const real = makeSurface();
  setCoverageForFraction(real, 4, 4, [30, 34, 29], 0.65);
  assert.deepEqual(removeSurfaceSpecks(real).rgb, real.rgb, 'average coverage near the center sample is real');

  const bright = makeSurface();
  setCoverageForFraction(bright, 4, 4, [250, 248, 244], 0.125);
  assert.deepEqual(removeSurfaceSpecks(bright).rgb, bright.rgb, 'small light sources stay intact');

  const residual = makeSurface();
  setCoverageForFraction(residual, 4, 4, [184, 132, 116], 0.1);
  residual.coverageRgb.set([124, 132, 116], (4 * 9 + 4) * 3);
  residual.coverageRgb[(4 * 9 + 4) * 3 + 1] = 155;
  assert.deepEqual(removeSurfaceSpecks(residual).rgb, residual.rgb, 'coverage off the background-to-center vector is retained');

  const brightPlane = makeSurface(9, 9, [170, 170, 170]);
  setCoverageForFraction(brightPlane, 4, 4, [220, 220, 220], 0.125);
  assert.deepEqual(removeSurfaceSpecks(brightPlane).rgb, brightPlane.rgb, 'bright neutral details are protected below the RGB maximum threshold');

  const darkScene = makeSurface(9, 9, [10, 12, 18]);
  setCoverageForFraction(darkScene, 4, 4, [60, 80, 190], 0.125);
  assert.deepEqual(removeSurfaceSpecks(darkScene).rgb, darkScene.rgb, 'blue light against a dark background remains intact');
});

test('does not alter protected neighborhoods, different owners, or image boundaries', () => {
  const input = makeSurface();
  setCoverageForFraction(input, 4, 4, [30, 34, 29], 0.125);
  const protectedCells = new Uint8Array(81);
  protectedCells[3 * 9 + 4] = 1;
  assert.deepEqual(removeSurfaceSpecks({ ...input, protectedCells }).rgb, input.rgb);
  protectedCells.fill(0);
  protectedCells[4 * 9 + 4] = 1;
  assert.deepEqual(removeSurfaceSpecks({ ...input, protectedCells }).rgb, input.rgb);

  const boundary = makeSurface();
  setCoverageForFraction(boundary, 4, 4, [30, 34, 29], 0.125);
  boundary.objects[4 * 9 + 5] = 2;
  assert.deepEqual(removeSurfaceSpecks(boundary).rgb, boundary.rgb);

  const edge = makeSurface(5, 5);
  setCoverageForFraction(edge, 0, 2, [30, 34, 29], 0.125);
  assert.deepEqual(removeSurfaceSpecks(edge).rgb, edge.rgb);
});

test('returns deterministic copies and rejects malformed arrays, ranges, and grids', () => {
  const input = makeSurface(7, 9);
  setCoverageForFraction(input, 3, 4, [30, 34, 29], 0.125);
  const first = removeSurfaceSpecks(input), second = removeSurfaceSpecks(input);
  assert.deepEqual(first, second);
  assert.equal(first.rgb.length, input.rgb.length);
  assert.throws(() => removeSurfaceSpecks({ ...input, width: 0 }), RangeError);
  assert.throws(() => removeSurfaceSpecks({ ...input, rgb: new Uint8Array(3) }), TypeError);
  assert.throws(() => removeSurfaceSpecks({ ...input, coverageRgb: new Float32Array(3) }), TypeError);
  assert.throws(() => removeSurfaceSpecks({ ...input, counts: new Uint8Array(63) }), TypeError);
  assert.throws(() => removeSurfaceSpecks({ ...input, objects: new Uint32Array(1) }), TypeError);
  assert.throws(() => removeSurfaceSpecks({ ...input, protectedCells: new Uint8Array(2) }), TypeError);
  const invalidMask = new Uint8Array(63); invalidMask[0] = 2;
  assert.throws(() => removeSurfaceSpecks({ ...input, protectedCells: invalidMask }), RangeError);
  const invalidCoverage = new Float32Array(input.coverageRgb); invalidCoverage[0] = Number.NaN;
  assert.throws(() => removeSurfaceSpecks({ ...input, coverageRgb: invalidCoverage }), RangeError);
  assert.throws(() => removeSurfaceSpecks({ ...input, width: 513, height: 512,
    rgb: new Uint8Array(513 * 512 * 3), coverageRgb: new Float32Array(513 * 512 * 3),
    counts: new Uint32Array(513 * 512), objects: new Uint32Array(513 * 512) }), RangeError);
});

test('leaves a flat field unchanged', () => {
  const input = makeSurface(256, 256, [124, 132, 116]);
  const result = removeSurfaceSpecks(input);
  assert.equal(result.removedCells, 0);
  assert.deepEqual(result.rgb, input.rgb);
});
