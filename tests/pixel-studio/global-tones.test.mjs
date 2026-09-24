import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fitTone, grayLevels, grayLight, linearToSrgb, nearestGlobalToneIndex,
  prepareGlobalToneRamp, relativeLuminance, srgbToLinear
} from '../../js/pixel-studio/global-tones.mjs';

test('sRGB conversion uses the piecewise transfer curve and round trips', () => {
  assert.equal(srgbToLinear(0), 0);
  assert.equal(srgbToLinear(255), 1);
  assert.ok(Math.abs(srgbToLinear(128) - 0.2158605) < 1e-6);
  for (const value of [0, 1, 10, 32, 128, 240, 255]) {
    assert.ok(Math.abs(linearToSrgb(srgbToLinear(value)) - value) < 1e-9);
  }
  assert.ok(Math.abs(grayLight(255, 0, 0) - 127.1) < 0.2);
});

test('gray palettes are exact and returned as defensive copies', () => {
  const four = grayLevels();
  const eight = grayLevels(8);
  assert.deepEqual(four, [24, 88, 168, 240]);
  assert.deepEqual(eight, [24, 56, 88, 128, 168, 192, 216, 240]);
  four[0] = 0;
  eight.pop();
  assert.deepEqual(grayLevels(4), [24, 88, 168, 240]);
  assert.deepEqual(grayLevels(8), [24, 56, 88, 128, 168, 192, 216, 240]);
  assert.throws(() => grayLevels(5), RangeError);
});

test('fitTone hits each requested gray luminance while retaining available hue', () => {
  const samples = [[255, 0, 0], [0, 0, 255], [255, 105, 180], [0, 255, 0], [96, 96, 96]];
  for (const target of [...grayLevels(4), ...grayLevels(8)]) {
    for (const sample of samples) {
      const fitted = fitTone(sample, target);
      assert.equal(fitted.length, 3);
      assert.ok(fitted.every((v) => Number.isInteger(v) && v >= 0 && v <= 255));
      assert.ok(Math.abs(grayLight(...fitted) - target) <= 1, `${sample} at ${target}: ${fitted} -> ${grayLight(...fitted)}`);
    }
  }
  const brightBlue = fitTone([0, 0, 255], 240);
  assert.ok(brightBlue[2] > brightBlue[0]);
});

test('global ramp sorts perceptual gray and nearest choice uses absolute gray distance', () => {
  const palette = [[0, 0, 255], [255, 255, 255], [0, 0, 0], [255, 0, 0]];
  const ramp = prepareGlobalToneRamp(palette, [0, 1, 2, 3]);
  assert.deepEqual(ramp.map(({ index }) => index), [2, 0, 3, 1]);
  assert.ok(ramp.every((entry, i) => entry.luminance === relativeLuminance(...palette[entry.index]) &&
    entry.light === grayLight(...palette[entry.index]) && (!i || ramp[i - 1].light <= entry.light)));
  assert.equal(nearestGlobalToneIndex(grayLight(...palette[0]), ramp), 0);
  assert.equal(nearestGlobalToneIndex(128, [{ index: 4, light: 100 }, { index: 2, light: 156 }]), 2);
});

test('public APIs reject invalid numeric bounds and palette references', () => {
  assert.throws(() => srgbToLinear(-1), RangeError);
  assert.throws(() => linearToSrgb(1.1), RangeError);
  assert.throws(() => relativeLuminance(0, NaN, 0), RangeError);
  assert.throws(() => fitTone([0, 0], 100), TypeError);
  assert.throws(() => prepareGlobalToneRamp([[0, 0, 0]], [1]), RangeError);
  assert.throws(() => prepareGlobalToneRamp([[0, 0, 0]], [0, 0]), RangeError);
  assert.throws(() => nearestGlobalToneIndex(100, []), TypeError);
});


test('byte lookup retains exact transfer values and fractional channel support', () => {
  const curve = value => {
    const x = value / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  for (let value = 0; value < 256; value++) assert.equal(srgbToLinear(value), curve(value));
  for (const value of [-0, 0.25, 10.31475, 10.3147501, 128.5, 254.99]) {
    assert.equal(srgbToLinear(value), curve(value));
  }
});
