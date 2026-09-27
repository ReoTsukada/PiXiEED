import test from 'node:test';
import assert from 'node:assert/strict';
import { lensPalette, lensPaletteEdited, processLensFrame, resetLensPaletteEdits, setLensPalette, setLensPaletteColor, setLensSettings } from '../../js/pixel-lens/engine.mjs';

globalThis.ImageData ??= class { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } };
const gradient = () => { const w = 32; const h = 4; const d = new Uint8ClampedArray(w * h * 4); for (let p = 0; p < w * h; p++) { const v = ((p % w) / (w - 1)) * 255; d.set([v, v, v, 255], p * 4); } return new ImageData(d, w, h); };
const colours = (img) => { const s = new Set(); for (let i = 0; i < img.data.length; i += 4) s.add(`${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`); return s; };

test('a hand-edited colour is used and survives later frames; reset brings the original back', () => {
  setLensSettings({ colorDepth: '4', paletteMode: 'gameboy', gradientMode: 'none', surfaceSimplify: 0 });
  processLensFrame(gradient());
  assert.equal(lensPalette().length, 4);
  assert.ok(setLensPaletteColor(3, [200, 20, 90]));
  assert.equal(lensPaletteEdited(), true);
  let img = gradient(); processLensFrame(img); assert.ok(colours(img).has('200,20,90'));
  img = gradient(); processLensFrame(img); assert.ok(colours(img).has('200,20,90'), 'kept on the next frame');
  resetLensPaletteEdits();
  img = gradient(); processLensFrame(img); assert.ok(!colours(img).has('200,20,90'));
  assert.equal(lensPaletteEdited(), false);
});

test('a saved palette is used exactly and never re-picked', () => {
  const mine = [[10, 10, 40], [90, 60, 160], [240, 200, 120], [255, 250, 240]];
  setLensSettings({ colorDepth: '4', paletteMode: 'source', gradientMode: 'none', surfaceSimplify: 0 });
  setLensPalette(mine);
  for (let k = 0; k < 3; k++) { const img = gradient(); processLensFrame(img); for (const c of colours(img)) assert.ok(mine.some((m) => m.join(',') === c), c); }
  assert.deepEqual(lensPalette(), mine);
});

test('グレー: editing the one tint colour tints the whole picture', () => {
  setLensSettings({ colorDepth: 'gray', gradientMode: 'none', surfaceSimplify: 0 });
  processLensFrame(gradient());
  assert.equal(lensPalette().length, 1);
  setLensPaletteColor(0, [200, 150, 100]);
  const img = gradient(); processLensFrame(img);
  const mid = (16 + 32) * 4; assert.ok(img.data[mid] > img.data[mid + 2] + 10, 'warm tint');
});
