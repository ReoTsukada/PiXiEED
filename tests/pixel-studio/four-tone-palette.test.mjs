import test from 'node:test';
import assert from 'node:assert/strict';
import { createFourTonePalette } from '../../js/pixel-studio/four-tone-palette.mjs';
import { grayLight } from '../../js/pixel-studio/global-tones.mjs';
import { rgbToLab } from '../../js/pixel-studio/convert.mjs';

function image(width, height, pixelAt, labels = null) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, rgb = pixelAt(x, y);
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
  }
  return { width, height, data, ...(labels ? { labels } : {}) };
}
function rgbAt(result, x, y) { const i = (y * result.width + x) * 4; return [...result.data.slice(i, i + 3)]; }

 test('keeps palette within 24 colors and uses four encoded linear-luminance gray targets', () => {
  const source = image(24, 18, (x, y) => [[220, 55, 35], [30, 180, 80], [65, 90, 210], [120, 85, 55]][(x + y) % 4]);
  const result = createFourTonePalette({ dither: 'none' }).render(source);
  assert.ok(result.palette.length <= 24);
  assert.equal(result.stats.globalToneLevels, 4);
  const tones = [...new Set(result.palette.map((rgb) => Math.round(grayLight(...rgb))))].sort((a,b)=>a-b);
  assert.ok(tones.includes(24));
  assert.ok(tones.includes(240));
  assert.ok(tones.some((tone) => Math.abs(tone - 144) <= 1));
  assert.ok(tones.some((tone) => Math.abs(tone - 192) <= 1));
  assert.ok(result.palette.every((rgb) => rgb.length === 3 && rgb.every((n) => n >= 0 && n <= 255)));
});

test('maps low encoded luminance to dark and high colored luminance to shared highlight', () => {
  const source = image(4, 1, (x) => [[0, 0, 0], [45, 20, 10], [255, 0, 0], [255, 255, 0]][x]);
  const result = createFourTonePalette({ dither: 'none' }).render(source);
  assert.deepEqual(rgbAt(result, 0, 0), [24, 24, 24]);
  assert.deepEqual(rgbAt(result, 1, 0), [24, 24, 24]);
  assert.deepEqual(rgbAt(result, 3, 0), [240, 240, 240]);
  assert.ok(grayLight(...rgbAt(result, 2, 0)) < 220, 'red is judged by linear luminance, not its maximum channel');
});

test('uses the lower shared-dark cutoff while preserving the two middle and highlight assignments', () => {
  const values = [69, 70, 71, 79, 80, 81, 95, 108, 220, 240];
  const result = createFourTonePalette({ dither: 'none' }).render(image(values.length, 1, (x) => [values[x], values[x], values[x]]));
  assert.deepEqual(values.map((_, x) => rgbAt(result, x, 0)), [
    [24, 24, 24], [24, 24, 24], [144, 144, 144], [144, 144, 144],
    [144, 144, 144], [144, 144, 144], [144, 144, 144], [144, 144, 144],
    [240, 240, 240], [240, 240, 240]
  ]);
});

test('palette fitting retains source Oklab hue and chroma at both middle luminance targets', () => {
  const hue = (lab) => Math.atan2(lab[2], lab[1]);
  const hueDistance = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const warm = [228, 196, 172], warmLab = rgbToLab(...warm);
  const warmResult = createFourTonePalette({ dither: 'none' }).render(image(4, 4, () => warm));
  const warmSwatches = warmResult.palette.filter((rgb) => Math.hypot(rgbToLab(...rgb)[1], rgbToLab(...rgb)[2]) > .02);
  assert.equal(warmSwatches.length, 2);
  for (const rgb of warmSwatches) {
    const lab = rgbToLab(...rgb);
    assert.ok(hueDistance(hue(lab), hue(warmLab)) < .035, `warm hue preserved by ${rgb}`);
    assert.ok(Math.hypot(lab[1], lab[2]) >= Math.hypot(warmLab[1], warmLab[2]) * .9,
      `warm chroma preserved by ${rgb}`);
    assert.ok([144, 192].some((level) => Math.abs(grayLight(...rgb) - level) <= 1));
  }

  for (const source of [[144, 144, 144], [35, 165, 75], [80, 120, 220]]) {
    const originalLab = rgbToLab(...source);
    const result = createFourTonePalette({ dither: 'none' }).render(image(4, 4, () => source));
    const chromatic = result.palette.filter((rgb) => Math.hypot(rgbToLab(...rgb)[1], rgbToLab(...rgb)[2]) > .02);
    if (source[0] === source[1] && source[1] === source[2]) {
      assert.equal(chromatic.length, 0, 'neutral input does not acquire a red or warm tint');
      continue;
    }
    assert.equal(chromatic.length, 2);
    for (const rgb of chromatic) assert.ok(hueDistance(hue(rgbToLab(...rgb)), hue(originalLab)) < .06,
      `source hue preserved for ${source} by ${rgb}`);
  }
});

test('groups nearby sampled colors into one area-dominant main color', () => {
  const source = image(64, 64, (x, y) => {
    const n = y * 64 + x;
    return [175 + (n * 7 % 17), 133 + (n * 11 % 15), 117 + (n * 13 % 15)];
  });
  const result = createFourTonePalette({ dither: 'none' }).render(source);
  assert.equal(result.palette.length, 6, 'one broad warm color family needs only one two-tone ramp');
  assert.ok(result.palette[3][0] > result.palette[3][1] && result.palette[3][1] > result.palette[3][2]);
});

test('allocates the first scene ramp to the largest color area despite vivid small accents', () => {
  const accents = [[255,40,30],[255,90,20],[240,30,125],[210,50,220],[120,30,250],
    [35,80,250],[20,190,210],[20,215,65],[120,205,20],[250,180,15],[130,55,200],[30,110,140]];
  const source = image(64, 64, (x, y) => {
    const n = y * 64 + x;
    return n < 3840
      ? [177 + (n * 7 % 11), 136 + (n * 11 % 9), 122 + (n * 13 % 11)]
      : accents[Math.floor((n - 3840) / 22) % accents.length];
  });
  const result = createFourTonePalette({ dither: 'none' }).render(source);
  const main = result.palette[3], sourceChroma = rgbToLab(180, 140, 126);
  const mainChroma = rgbToLab(...main);
  assert.ok(Math.hypot(mainChroma[1] - sourceChroma[1], mainChroma[2] - sourceChroma[2]) < .025);
  assert.ok(result.palette.length <= 24);
  assert.ok(result.palette.some(([r,g,b]) => b > r * 1.3), 'distinct small accents still retain room');
});

test('retains distinct natural hue families on the two middle ramps', () => {
  const source = image(8, 4, (x) => x < 4 ? [230, 35, 20] : [25, 190, 60]);
  const result = createFourTonePalette({ dither: 'none' }).render(source);
  const red = rgbAt(result, 1, 1), green = rgbAt(result, 6, 1);
  assert.ok(red[0] > red[1] * 1.5);
  assert.ok(green[1] > green[0] * 1.5);
});

test('uniform planes are never dithered and smooth middle gradients dither deterministically', () => {
  const render = createFourTonePalette();
  const flat = image(12, 8, () => [164, 164, 164]);
  assert.equal(render.render(flat).stats.ditheredCells, 0);
  const gradient = image(24, 12, (x) => { const v = 150 + Math.round(x * 2); return [v, v, v]; });
  const first = render.render(gradient), second = render.render(gradient);
  assert.ok(first.stats.ditheredCells > 0);
  assert.deepEqual(first.data, second.data);
  assert.equal(first.stats.dither, 'selective-bayer');
  assert.equal(createFourTonePalette({ dither: 'none' }).render(gradient).stats.ditheredCells, 0);
  const texture = image(18, 12, (x, y) => {
    const v = 165 + ((x + y) % 2 ? 9 : -9);
    return [v, v, v];
  });
  assert.equal(createFourTonePalette().render(texture).stats.ditheredCells, 0,
    'alternating texture is not treated as a smooth gradient');
  const gradientWithLine = image(24, 12, (x, y) => {
    const base = 150 + x * 2, value = y === 6 ? base + 34 : base;
    return [value, value, value];
  });
  const cleanGradient = image(24, 12, (x) => { const value = 150 + x * 2; return [value, value, value]; });
  assert.ok(createFourTonePalette().render(cleanGradient).stats.ditheredCells >
    createFourTonePalette().render(gradientWithLine).stats.ditheredCells,
  'a one-cell gray line interrupts dithering across a smooth gradient without labels');
});

test('label changes and strong color edges prevent selective dithering', () => {
  const width = 3, height = 3;
  const labels = new Uint32Array([1, 1, 2, 1, 1, 2, 1, 1, 2]);
  const source = image(width, height, (x) => x === 0 ? [152, 152, 152] : x === 1 ? [158, 158, 158] : [158, 110, 110], labels);
  const result = createFourTonePalette().render(source);
  assert.equal(result.stats.ditheredCells, 0);
  assert.strictEqual(result.labels, labels);
});

test('locks the first palette with midtones, keeps it across frames, and reset permits reseeding', () => {
  const renderer = createFourTonePalette({ dither: 'none' });
  const mono = image(4, 4, (x) => x < 2 ? [255, 255, 255] : [0, 0, 0]);
  const initial = renderer.render(mono);
  assert.equal(initial.stats.paletteLocked, false);
  const seeded = renderer.render(image(4, 4, () => [220, 45, 35]));
  assert.equal(seeded.stats.paletteLocked, true);
  assert.ok(seeded.stats.paletteRevision > initial.stats.paletteRevision);
  const later = renderer.render(image(4, 4, () => [25, 210, 70]));
  assert.deepEqual(later.palette, seeded.palette);
  assert.equal(later.stats.paletteRevision, seeded.stats.paletteRevision);
  renderer.reset();
  const resetResult = renderer.render(image(4, 4, () => [25, 210, 70]));
  assert.notDeepEqual(resetResult.palette, seeded.palette);
  assert.ok(resetResult.stats.paletteRevision > later.stats.paletteRevision);
});

test('waits through uniform neutral startup, then seeds once on real color detail', () => {
  const renderer = createFourTonePalette({ dither: 'none' });
  const startup = image(12, 8, () => [168, 168, 168]);
  const first = renderer.render(startup), repeated = renderer.render(startup);
  assert.equal(first.stats.paletteLocked, false);
  assert.equal(repeated.stats.paletteLocked, false);
  assert.equal(repeated.stats.paletteRevision, first.stats.paletteRevision);

  const colorScene = image(12, 8, (x) => x < 6 ? [220, 55, 35] : [35, 165, 75]);
  const seeded = renderer.render(colorScene);
  assert.equal(seeded.stats.paletteLocked, true);
  assert.ok(seeded.palette.some(([r, g, b]) => r > g * 1.5), 'the seed includes a colored middle ramp');
  assert.ok(seeded.stats.paletteRevision > repeated.stats.paletteRevision);
  const later = renderer.render(image(12, 8, () => [40, 85, 210]));
  assert.deepEqual(later.palette, seeded.palette);
  assert.equal(later.stats.paletteRevision, seeded.stats.paletteRevision);
});

test('moving bright and dark cells leave no prior frame RGB in the output', () => {
  const renderer = createFourTonePalette({ dither: 'none' });
  renderer.render(image(8, 3, (x) => x === 3 ? [220, 40, 25] : [150, 150, 150]));
  const next = renderer.render(image(8, 3, (x) => x === 3 ? [0, 0, 0] : [190, 190, 190]));
  assert.deepEqual(rgbAt(next, 3, 1), [24, 24, 24]);
  assert.ok(next.palette.every((rgb) => !rgb.every((v, i) => v === [220, 40, 25][i])));
});

test('colors beyond the bounded exact chroma cache stay exact and order independent', () => {
  const renderer = createFourTonePalette({ dither: 'none' });
  renderer.render(image(4, 4, (x) => [[140, 140, 140], [225, 45, 35], [35, 180, 65], [40, 70, 210]][(x % 4)]));
  const width = 257, height = 256, data = new Uint8ClampedArray(width * height * 4);
  const target = [128, 105, 75];
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    data[p] = i & 255; data[p + 1] = (i >> 8) & 255; data[p + 2] = (i >> 16) & 255; data[p + 3] = 255;
  }
  // Add >65k distinct exact RGB values, then repeat one color on both sides of the cache limit.
  data.set([...target, 255], 0);
  data.set([...target, 255], (width * height - 1) * 4);
  const first = renderer.render({ width, height, data });
  assert.deepEqual(rgbAt(first, 0, 0), rgbAt(first, width - 1, height - 1));
  const reversed = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const src = ((height - 1 - y) * width + (width - 1 - x)) * 4, dst = (y * width + x) * 4;
    reversed.set(data.subarray(src, src + 4), dst);
  }
  const second = renderer.render({ width, height, data: reversed });
  assert.deepEqual(rgbAt(first, 0, 0), rgbAt(second, width - 1, height - 1));
});

test('preserves geometry, labels, alpha, and input bytes while rejecting invalid input/options', () => {
  const labels = new Uint32Array([1, 2, 3, 4]), source = image(2, 2, (x, y) => [80 + x * 50, 80 + y * 50, 110]);
  source.data[3] = 0;
  const before = source.data.slice(), result = createFourTonePalette({ dither: 'none' }).render({ ...source, labels });
  assert.equal(result.width, 2); assert.equal(result.height, 2);
  assert.strictEqual(result.labels, labels);
  assert.equal(result.data[3], 0);
  assert.deepEqual(source.data, before);
  assert.notStrictEqual(result.data, source.data);
  assert.throws(() => createFourTonePalette({ dither: 'noise' }), RangeError);
  assert.throws(() => createFourTonePalette().render({ width: 2, height: 2, data: new Uint8Array(3) }), TypeError);
});
