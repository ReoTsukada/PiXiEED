import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaterialRegionTracker } from '../../js/pixel-studio/material-regions.mjs';
import { prepareGlobalToneRamp, linearToSrgb } from '../../js/pixel-studio/global-tones.mjs';
import { smoothTransitionCells, transitionRampIndex } from '../../js/pixel-studio/selective-dither.mjs';

test('same-family adjacent cells split at an abrupt luminance edge but a smooth ramp stays connected', () => {
  const width = 12, height = 8;
  const family = new Float64Array(width * height).fill(41);
  const edge = Float32Array.from({ length: width * height }, (_, i) => i % width < 6 ? 30 : 150);
  const split = createMaterialRegionTracker().partition(family, width, height, { edgeLight: edge });
  assert.notEqual(split.labels[3 * width + 5], split.labels[3 * width + 6]);
  assert.equal(split.regionCount, 2);

  const ramp = Float32Array.from({ length: width * height }, (_, i) => 30 + (i % width) * 10);
  const connected = createMaterialRegionTracker().partition(family, width, height, { edgeLight: ramp });
  assert.equal(connected.regionCount, 1);
});

test('a protected one-cell edge is kept as its own region rather than merged', () => {
  const width = 10, height = 8, family = new Float64Array(width * height).fill(7);
  for (let y = 2; y < 6; y++) for (let x = 1; x < 5; x++) family[y * width + x] = 9;
  const tiny = 3 * width + 7;
  family[tiny] = 9;
  const protectedCells = new Uint8Array(width * height);
  protectedCells[tiny] = 1;
  const light = new Float32Array(width * height).fill(90);
  light[tiny] = 190;
  const result = createMaterialRegionTracker().partition(family, width, height, { protectedCells, edgeLight: light });
  assert.notEqual(result.labels[tiny], result.labels[3 * width + 3]);
  assert.equal(result.mergedCount, 0);
});

test('global-tone dithering gives nested 25, 50, and 75 percent coverage in 2x2 tiles', () => {
  const palette = [[24, 24, 24], [88, 88, 88], [168, 168, 168], [240, 240, 240]];
  const ramp = prepareGlobalToneRamp(palette, [0, 1, 2, 3]);
  for (const [low, high, coverage, amount] of [[0, 1, 1, 0.4], [1, 2, 2, 0.5], [2, 3, 3, 0.6]]) {
    const loY = ramp[low].luminance, hiY = ramp[high].luminance;
    const targetGray = linearToSrgb(loY + (hiY - loY) * amount);
    // The 2x2 Bayer ranks have exactly the requested number of high-tone sites.
    const chosen = Array.from({ length: 4 }, (_, i) => transitionRampIndex(targetGray, ramp, i % 2, Math.floor(i / 2)));
    assert.equal(chosen.filter((index) => index === ramp[high].index).length, coverage);
  }
});

test('protected detail and material boundaries suppress smooth-transition dither eligibility', () => {
  const width = 12, height = 12, count = width * height;
  const light = Float32Array.from({ length: count }, (_, i) => 70 + (i % width) * 3);
  const labels = new Uint32Array(count).fill(1), protectedCells = new Uint8Array(count);
  for (let y = 0; y < height; y++) labels[y * width + 6] = 2;
  protectedCells[5 * width + 4] = 1;
  const eligible = smoothTransitionCells(light, labels, protectedCells, width, height);
  assert.equal(eligible[5 * width + 4], 0);
  assert.equal(eligible[5 * width + 5], 0, 'a transition patch cannot cross a material edge');
});
