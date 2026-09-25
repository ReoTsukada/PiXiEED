import test from 'node:test';
import assert from 'node:assert/strict';
import { smoothTransitionCells, transitionRampIndex } from '../../js/pixel-studio/selective-dither.mjs';
import { prepareToneRamp } from '../../js/pixel-studio/ordered-dither.mjs';
import { createFixedPalette } from '../../js/pixel-studio/fixed-palette.mjs';
import { createObjectRenderer } from '../../js/pixel-studio/object-renderer.mjs';

function patch(valueAt, size = 32) {
  return { width: size, height: size,
    light: Float32Array.from({ length: size * size }, (_, cell) => valueAt(cell % size, Math.floor(cell / size))),
    labels: new Uint32Array(size * size).fill(1), protected: new Uint8Array(size * size) };
}
function eligible(p) { return smoothTransitionCells(p.light, p.labels, p.protected, p.width, p.height); }
const ramp = prepareToneRamp([[40, 40, 40], [120, 120, 120], [200, 200, 200]], [0, 1, 2]);

test('flat mid-tones and fine alternating texture receive no dither', () => {
  assert.equal(eligible(patch(() => 80)).reduce((a, b) => a + b), 0);
  assert.equal(eligible(patch((x, y) => 80 + ((x + y) % 2 ? 10 : -10))).reduce((a, b) => a + b), 0);
});

test('smooth gradient keeps most solid tone planes and only dots transition bands', () => {
  const p = patch((x) => 40 + x * 2), mask = eligible(p);
  let candidates = 0, dots = 0;
  for (let cell = 0; cell < mask.length; cell++) {
    candidates += mask[cell];
    if (mask[cell] && transitionRampIndex(p.light[cell], ramp, cell % p.width, Math.floor(cell / p.width)) >= 0) dots++;
  }
  assert.ok(candidates > 0);
  assert.ok(dots > 0 && dots < p.light.length / 2);
  assert.equal(transitionRampIndex(45, ramp, 10, 10), -1);
  assert.equal(transitionRampIndex(115, ramp, 10, 10), -1);
});

test('material boundaries and protected fine parts have a two-pixel no-dither margin', () => {
  const p = patch((x) => 50 + x * 2);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.labels[y * 32 + x] = x < 16 ? 1 : 2;
  p.protected[8 * 32 + 8] = 1;
  const mask = eligible(p);
  for (let y = 6; y <= 10; y++) for (let x = 6; x <= 10; x++) assert.equal(mask[y * 32 + x], 0);
  for (let y = 0; y < 32; y++) for (let x = 14; x <= 17; x++) assert.equal(mask[y * 32 + x], 0);
  assert.ok(mask.some(Boolean));
});

test('transition uses only regular quarter, half and three-quarter patterns anchored to canvas', () => {
  for (const [light, count] of [[72, 16], [80, 32], [88, 48]]) {
    let upper = 0;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const index = transitionRampIndex(light, ramp, x, y);
      upper += index === 1;
      assert.equal(index, transitionRampIndex(light, ramp, x + 2, y - 2));
      if (light === 80) {
        assert.notEqual(index, transitionRampIndex(light, ramp, x + 1, y));
        assert.notEqual(index, transitionRampIndex(light, ramp, x, y + 1));
      }
    }
    assert.equal(upper, count);
  }
  assert.equal(transitionRampIndex(128, prepareToneRamp([[0, 0, 0], [255, 255, 255]], [0, 1]), 0, 0), -1);
});

test('renderer keeps a uniform intermediate-color plane solid on a captured palette', () => {
  const fixed = createFixedPalette();
  fixed.capture(new Uint8Array([40, 40, 40, 120, 120, 120, 200, 200, 200]));
  const data = new Uint8ClampedArray(32 * 32 * 4);
  for (let cell = 0; cell < 32 * 32; cell++) data.set([80, 80, 80, 255], cell * 4);
  const render = createObjectRenderer({ size: 32, colors: 48, shading: 'three-tone', paletteSession: fixed, dither: 'ordered' });
  const first = render.render({ width: 32, height: 32, data });
  assert.equal(first.stats.ditheredCells, 0);
  assert.equal(new Set(first.indices).size, 1);
  assert.deepEqual(render.render({ width: 32, height: 32, data }).data, first.data);
});


test('surface transitions reject harsh tone pairs and retain canvas-fixed close-color patterns', () => {
  assert.equal(transitionRampIndex(80, ramp, 0, 0, 48), -1);
  const close = prepareToneRamp([[80,80,80],[112,112,112]], [0,1]);
  let upper = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const index = transitionRampIndex(96, close, x, y, 48);
    assert.ok(index >= 0);
    upper += index === 1;
    assert.equal(index, transitionRampIndex(96, close, x + 2, y + 2, 48));
  }
  assert.equal(upper, 32);
});
