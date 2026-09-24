import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixedPalette, recognitionColor } from '../../js/pixel-studio/fixed-palette.mjs';

function pixels(colors, repeats = 1) {
  const values = [];
  for (const [rgb, count] of colors.map((rgb) => [rgb, repeats])) {
    for (let index = 0; index < count; index++) values.push(...rgb);
  }
  return Uint8Array.from(values);
}

test('palette stays fixed until capture and returns defensive snapshots', () => {
  const fixed = createFixedPalette({ colorLimit: 12 });
  assert.equal(fixed.get(), null);
  const first = fixed.capture(pixels([[20, 30, 40], [160, 170, 180], [230, 220, 210]]));
  const before = fixed.get();
  assert.deepEqual(before, first);
  assert.equal(first.revision, 1);
  first.palette[0][0] = 255;
  first.ramps[0].indices.push(999);
  assert.deepEqual(fixed.get(), before, 'callers cannot mutate the captured palette');

  const second = fixed.capture(pixels([[1, 2, 3], [100, 110, 120], [240, 245, 250]]));
  assert.equal(second.revision, 2);
  assert.notDeepEqual(second.palette, before.palette);
  fixed.clear();
  assert.equal(fixed.get(), null);
  assert.equal(fixed.capture(pixels([[40, 50, 60]])).revision, 3, 'revision remains monotonic after clear');
});

test('palette is bounded to its color limit, three sampled tones per ramp, and source RGBs', () => {
  const colors = Array.from({ length: 90 }, (_, index) => [
    (index * 37) % 256, (index * 71) % 256, (index * 113) % 256
  ]);
  const input = pixels(colors);
  const result = createFixedPalette({ colorLimit: 48 }).capture(input);
  const source = new Set(colors.map((rgb) => rgb.join(',')));
  assert.ok(result.palette.length <= 48);
  assert.ok(result.ramps.length <= Math.floor(48 / 3));
  assert.ok(result.ramps.every((ramp) => ramp.indices.length <= 3));
  assert.ok(result.palette.every((rgb) => source.has(rgb.join(','))), 'palette entries are sampled input RGBs');
  assert.ok(result.ramps.every((ramp) => ramp.indices.every((index) => index >= 0 && index < result.palette.length)));
});

test('handles gray samples and small color inputs without inventing ramp colors', () => {
  const input = pixels([[12, 12, 12], [128, 128, 128], [244, 244, 244]]);
  const result = createFixedPalette().capture(input);
  assert.equal(result.palette.length, 3);
  assert.ok(result.palette.every(([r, g, b]) => r === g && g === b));
  assert.ok(result.ramps.every((ramp) => ramp.indices.length <= 3));
});

test('groups a full grayscale gradient into one family with a sampled shadow-base-highlight ramp', () => {
  const input = Uint8Array.from(Array.from({ length: 256 }, (_, value) => [value, value, value]).flat());
  const result = createFixedPalette().capture(input);

  assert.equal(result.ramps.length, 1, 'brightness changes alone do not create separate families');
  assert.equal(result.ramps[0].indices.length, 3);
  const ramp = result.ramps[0].indices.map((index) => result.palette[index]);
  assert.deepEqual(ramp, [[38, 38, 38], [127, 127, 127], [217, 217, 217]]);
});

test('different brightness levels of one chromatic family share a three-tone ramp', () => {
  const result = createFixedPalette().capture(pixels([
    [64, 0, 0], [128, 0, 0], [255, 0, 0]
  ]));
  assert.equal(result.ramps.length, 1);
  assert.equal(result.ramps[0].indices.length, 3);
  assert.deepEqual(result.ramps[0].indices.map((index) => result.palette[index]), [
    [64, 0, 0], [128, 0, 0], [255, 0, 0]
  ]);
});

test('greedy coverage retains a rare chromatic accent beside a dominant neutral area', () => {
  const input = Uint8Array.from([
    ...Array.from({ length: 95 }, () => [120, 120, 120]).flat(),
    0, 30, 250
  ]);
  const result = createFixedPalette({ colorLimit: 6 }).capture(input);
  assert.ok(result.palette.some((rgb) => rgb.join(',') === '0,30,250'));
  assert.ok(result.ramps.length <= 2);
});

test('saturation affects analysis only and never alters sampled output colors', () => {
  const raw = [180, 120, 100];
  const adjusted = recognitionColor(...raw, 1.8);
  assert.notDeepEqual(adjusted, raw);
  assert.deepEqual(recognitionColor(110, 110, 110, 1.8), [110, 110, 110]);
  const result = createFixedPalette({ saturation: 1.8 }).capture(pixels([raw]));
  assert.deepEqual(result.palette, [raw]);
  assert.deepEqual(result.ramps[0].base, raw);
});

test('object labels keep candidate ramps within each supplied boundary', () => {
  const input = pixels([[10, 20, 30], [220, 210, 200]]);
  const result = createFixedPalette({ colorLimit: 6 }).capture(input, Uint8Array.of(7, 9));
  assert.equal(result.ramps.length, 2);
  assert.equal(result.ramps[0].base.join(','), '10,20,30');
  assert.equal(result.ramps[1].base.join(','), '220,210,200');
});

test('is deterministic and invalid captures leave the previous snapshot untouched', () => {
  const source = pixels([[30, 40, 50], [200, 180, 160], [240, 230, 220]]);
  const a = createFixedPalette().capture(source);
  const b = createFixedPalette().capture(source);
  assert.deepEqual(a, b);

  const fixed = createFixedPalette();
  const before = fixed.capture(source);
  assert.throws(() => fixed.capture(Uint8Array.of(1, 2)), RangeError);
  assert.deepEqual(fixed.get(), before);
  assert.throws(() => createFixedPalette({ colorLimit: 2 }), RangeError);
  assert.throws(() => createFixedPalette({ saturation: NaN }), RangeError);
});
