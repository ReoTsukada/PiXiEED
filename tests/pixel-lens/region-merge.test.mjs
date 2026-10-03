import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRegionColors, pickPaletteIndex } from '../../js/pixel-lens/region-merge.mjs';
const palette = [[15, 24, 42], [42, 72, 110], [228, 224, 210], [75, 78, 82]];
function makeFrame(width, height, pixel) { const data = new Uint8ClampedArray(width * height * 4); for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set([...pixel(x, y), 255], (y * width + x) * 4); return { width, height, data }; }
const rgbAt = (frame, x, y) => [...frame.data.subarray((y * frame.width + x) * 4, (y * frame.width + x) * 4 + 3)];

test('surface merge follows a mild night-sky gradient and preserves stars and skyline', () => {
  const width = 22; const height = 12;
  const source = makeFrame(width, height, (x, y) => { if (x === 9 && y === 3) return [236, 232, 218]; if (y >= 9) return [15, 24, 42]; const v = Math.round(y * 2.6 + x * 0.25); return [42 + v, 72 + v, 110 + v]; });
  const rendered = makeFrame(width, height, (x, y) => { if (x === 9 && y === 3) return palette[2]; if (y >= 9) return palette[0]; return (x + y) % 2 ? palette[1] : palette[2]; });
  const result = mergeRegionColors({ source, rendered, palette, seed: { x: 2, y: 2 }, sourceIndex: 1, targetIndex: 3, mode: 'surface', strength: 55 });
  assert.equal(result.mask[2 * width + 2], 1); assert.equal(result.mask[3 * width + 9], 0); assert.equal(result.mask[9 * width + 2], 0);
  assert.ok(result.selectedPixels >= width * 7, `sky coverage ${result.selectedPixels}`);
  assert.deepEqual(rgbAt({ ...rendered, data: result.data }, 9, 3), palette[2]); assert.deepEqual(rgbAt({ ...rendered, data: result.data }, 4, 4), palette[3]);
});

test('full-strength sky gradient stops at the measured ridge-to-building lightness reversal', () => {
  const width = 128; const height = 128;
  const anchors = [[0.20, [39, 75, 132]], [0.45, [48, 86, 140]], [0.52, [52, 88, 142]], [0.58, [47, 56, 116]], [0.68, [43, 55, 105]], [0.88, [42, 54, 103]], [0.93, [38, 54, 92]], [0.97, [137, 213, 185]]];
  const source = makeFrame(width, height, (_x, y) => {
    const t = y / (height - 1); let i = 0; while (i + 1 < anchors.length - 1 && anchors[i + 1][0] < t) i += 1;
    const [ta, ca] = anchors[i]; const [tb, cb] = anchors[i + 1]; const mix = Math.max(0, Math.min(1, (t - ta) / (tb - ta)));
    return ca.map((value, channel) => Math.round(value + (cb[channel] - value) * mix));
  });
  const rendered = makeFrame(width, height, () => palette[1]);
  const result = mergeRegionColors({ source, rendered, palette, seed: { x: Math.round((width - 1) * 0.53), y: Math.round((height - 1) * 0.30) }, sourceIndex: 1, targetIndex: 3, mode: 'surface', strength: 100 });
  const at = (x, y) => y * width + x;
  assert.equal(result.mask[at(Math.round((width - 1) * 0.43), Math.round((height - 1) * 0.45))], 1, 'the smooth upper sky gradient remains selected');
  assert.equal(result.mask[at(Math.round((width - 1) * 0.43), Math.round((height - 1) * 0.50))], 1, 'smooth sky remains selected up to the local ridge-edge window');
  assert.equal(result.mask[at(Math.round((width - 1) * 0.43), Math.round((height - 1) * 0.58))], 0, 'the multi-pixel ridge edge blocks the flood');
  assert.equal(result.mask[at(Math.round((width - 1) * 0.43), Math.round((height - 1) * 0.77))], 0, 'lower building stays outside despite its small seed color distance');
  assert.deepEqual(rgbAt({ ...rendered, data: result.data }, Math.round((width - 1) * 0.43), Math.round((height - 1) * 0.77)), palette[1]);
});

test('same RGB at a disconnected object is not changed', () => {
  const width = 8; const height = 5; const source = makeFrame(width, height, (x) => x < 4 ? [44, 76, 114] : [180, 90, 52]); const rendered = makeFrame(width, height, () => palette[1]);
  const result = mergeRegionColors({ source, rendered, palette, seed: { x: 0, y: 2 }, sourceIndex: 1, targetIndex: 3, mode: 'color', strength: 60 });
  assert.deepEqual(rgbAt({ ...rendered, data: result.data }, 1, 2), palette[3]); assert.deepEqual(rgbAt({ ...rendered, data: result.data }, 6, 2), palette[1]); assert.equal(result.mask[2 * width + 6], 0);
});
test('color changes only selected rendered palette colour; surface unifies dithered gray asphalt shadows', () => {
  const grayPalette = [[72, 74, 76], [112, 114, 116], [158, 160, 162], [168, 90, 50]];
  const width = 26; const height = 5;
  const source = makeFrame(width, height, (x) => x < 7 ? [82, 84, 86] : x < 14 ? [100, 102, 104] : x < 20 ? [118, 120, 122] : x < 22 ? [174, 75, 42] : [100, 102, 104]);
  const rendered = makeFrame(width, height, (x) => x < 7 ? grayPalette[0] : x < 14 ? grayPalette[1] : x < 20 ? grayPalette[2] : x < 22 ? grayPalette[3] : grayPalette[1]);
  const args = { source, rendered, palette: grayPalette, seed: { x: 10, y: 2 }, sourceIndex: 1, targetIndex: 1, strength: 100 };
  const color = mergeRegionColors({ ...args, mode: 'color' }); const surface = mergeRegionColors({ ...args, mode: 'surface' });
  assert.deepEqual(rgbAt({ ...rendered, data: color.data }, 10, 2), grayPalette[1]);
  assert.deepEqual(rgbAt({ ...rendered, data: color.data }, 3, 2), grayPalette[0], 'color mode leaves a different rendered gray intact');
  assert.deepEqual(rgbAt({ ...rendered, data: surface.data }, 3, 2), grayPalette[1], 'surface mode merges the darker asphalt shadow');
  assert.deepEqual(rgbAt({ ...rendered, data: surface.data }, 16, 2), grayPalette[1], 'surface mode merges the lighter asphalt shade');
  assert.equal(surface.mask[2 * width + 23], 0, 'disconnected asphalt with the same gray stays outside the mask');
  assert.deepEqual(rgbAt({ ...rendered, data: surface.data }, 23, 2), grayPalette[1]);
  assert.equal(color.changedPixels, 0, 'color mode is a no-op when source and target palette indices match');
  assert.equal(surface.selectedPixels, 20 * height);
});
test('same source and target index still unifies a surface but color mode changes zero pixels', () => {
  const width = 6; const height = 2; const source = makeFrame(width, height, () => [46, 77, 112]);
  const rendered = makeFrame(width, height, (x) => x % 2 ? palette[1] : palette[2]);
  const args = { source, rendered, palette, seed: { x: 0, y: 0 }, sourceIndex: 1, targetIndex: 1, strength: 35 };
  const surface = mergeRegionColors({ ...args, mode: 'surface' }); const color = mergeRegionColors({ ...args, mode: 'color' });
  assert.deepEqual(rgbAt({ ...rendered, data: surface.data }, 2, 1), palette[1]);
  assert.ok(surface.changedPixels > 0); assert.equal(color.changedPixels, 0);
});
test('long gradual color drift remains seed-bounded and expands monotonically with strength', () => {
  const width = 240; const height = 3;
  const source = makeFrame(width, height, (x) => { const v = 20 + Math.round(x * 0.88); return [v, v, v]; });
  const rendered = makeFrame(width, height, () => palette[1]);
  const args = { source, rendered, palette, seed: { x: 120, y: 1 }, sourceIndex: 1, targetIndex: 3, mode: 'surface' };
  const low = mergeRegionColors({ ...args, strength: 15 }); const high = mergeRegionColors({ ...args, strength: 95 });
  assert.ok(low.selectedPixels > 0 && low.selectedPixels < high.selectedPixels);
  assert.ok(high.selectedPixels < width * height, 'even maximum strength does not absorb the entire long gradient');
  assert.equal(high.mask[width], 0, 'distant endpoint stays outside the seed surface');
  for (let p = 0; p < low.mask.length; p += 1) if (low.mask[p]) assert.equal(high.mask[p], 1, `higher strength retains low-strength pixel ${p}`);
});

test('transparent seed is a no-op and transparent gradient samples do not throw', () => {
  const width = 7; const height = 7;
  const source = makeFrame(width, height, (_x, y) => [35 + y * 3, 65 + y * 3, 110 + y * 2]);
  source.data[(3 * width + 2) * 4 + 3] = 0; // one lightness-gradient endpoint is transparent
  const rendered = makeFrame(width, height, () => palette[1]);
  const args = { source, rendered, palette, seed: { x: 3, y: 3 }, sourceIndex: 1, targetIndex: 3, mode: 'surface', strength: 70 };
  const result = mergeRegionColors(args);
  assert.ok(result.selectedPixels > 0, 'the opaque seed still produces a region');
  const transparentSeedSource = { ...source, data: new Uint8ClampedArray(source.data) };
  transparentSeedSource.data[(3 * width + 3) * 4 + 3] = 0;
  const noOp = mergeRegionColors({ ...args, source: transparentSeedSource });
  assert.equal(noOp.selectedPixels, 0); assert.equal(noOp.changedPixels, 0);
  assert.deepEqual(noOp.data, rendered.data); assert.ok(noOp.data !== rendered.data);
});

test('inputs remain unchanged and output uses only existing palette colours', () => {
  const source = makeFrame(5, 4, (x, y) => [40 + x, 72 + y, 108 + x]); const rendered = makeFrame(5, 4, (x, y) => palette[(x + y) % palette.length]);
  const beforeSource = new Uint8ClampedArray(source.data); const beforeRendered = new Uint8ClampedArray(rendered.data);
  const result = mergeRegionColors({ source, rendered, palette, seed: { x: 2, y: 1 }, sourceIndex: 1, targetIndex: 3, mode: 'surface', strength: 80 });
  assert.deepEqual(source.data, beforeSource); assert.deepEqual(rendered.data, beforeRendered); assert.notEqual(result.data, rendered.data); assert.notEqual(result.mask, rendered.data);
  const allowed = new Set(palette.map((c) => c.join(','))); for (let i = 0; i < result.data.length; i += 4) assert.ok(allowed.has([...result.data.subarray(i, i + 3)].join(',')));
});
test('palette picking returns nearest RGB entry and -1 outside the frame', () => {
  const frame = makeFrame(2, 1, (x) => x ? [220, 221, 210] : [43, 70, 109]);
  assert.equal(pickPaletteIndex(frame, palette, 0, 0), 1); assert.equal(pickPaletteIndex(frame, palette, 1, 0), 2); assert.equal(pickPaletteIndex(frame, palette, -1, 0), -1);
});
test('invalid frame, seed, indices, mode, and strength fail closed', () => {
  const source = makeFrame(2, 2, () => [40, 70, 110]); const rendered = makeFrame(2, 2, () => palette[1]); const valid = { source, rendered, palette, seed: { x: 0, y: 0 }, sourceIndex: 1, targetIndex: 3, mode: 'surface' };
  assert.throws(() => mergeRegionColors({ ...valid, seed: { x: 2, y: 0 } }), RangeError); assert.throws(() => mergeRegionColors({ ...valid, sourceIndex: -1 }), RangeError);
  assert.throws(() => mergeRegionColors({ ...valid, targetIndex: palette.length }), RangeError); assert.throws(() => mergeRegionColors({ ...valid, mode: 'all' }), TypeError);
  assert.throws(() => mergeRegionColors({ ...valid, strength: 101 }), RangeError); assert.throws(() => mergeRegionColors({ ...valid, rendered: makeFrame(3, 2, () => palette[1]) }), RangeError);
  assert.throws(() => mergeRegionColors({ ...valid, source: { width: 2, height: 2, data: new Uint8Array(4) } }), TypeError);
});
