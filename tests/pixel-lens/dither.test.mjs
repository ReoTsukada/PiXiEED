import test from 'node:test';
import assert from 'node:assert/strict';
import { DITHER_PATTERNS, processLensFrame, setLensSettings } from '../../js/pixel-lens/engine.mjs';

globalThis.ImageData ??= class { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } };
const gradient = (w = 64, h = 8) => { const d = new Uint8ClampedArray(w * h * 4); for (let p = 0; p < w * h; p++) { const v = ((p % w) / (w - 1)) * 255; d.set([v, v, v, 255], p * 4); } return new ImageData(d, w, h); };
const render = (pattern, mode = 'dither') => { setLensSettings({ colorDepth: '2', paletteMode: 'gameboy', gradientMode: mode, ditherPattern: pattern, surfaceSimplify: 0 }); const img = gradient(); processLensFrame(img); return img.data; };
const mixedColumns = (data, w = 64, h = 8) => { let n = 0; for (let x = 0; x < w; x++) { const s = new Set(); for (let y = 0; y < h; y++) s.add(data[(y * w + x) * 4]); if (s.size > 1) n++; } return n; };

test('five dither patterns, each a different picture', () => {
  assert.deepEqual(DITHER_PATTERNS.map((p) => p.id), ['fine', 'coarse', 'checker', 'halftone', 'lines']);
  const outputs = DITHER_PATTERNS.map((p) => render(p.id).join(','));
  assert.equal(new Set(outputs).size, outputs.length);
});

test('dither spans the step between colours, not just the boundary', () => {
  assert.equal(mixedColumns(render('fine', 'none')), 0);
  assert.ok(mixedColumns(render('fine')) > 20, 'most of the gradient is patterned');
  const checker = mixedColumns(render('checker'));
  assert.ok(checker > 8 && checker < mixedColumns(render('fine')), 'checker keeps flat colour at both ends');
});

test('horizontal lines: every row is one colour', () => {
  setLensSettings({ colorDepth: '2', paletteMode: 'gameboy', gradientMode: 'dither', ditherPattern: 'lines', surfaceSimplify: 0 });
  const w = 8; const d = new Uint8ClampedArray(w * 8 * 4).fill(128); for (let i = 3; i < d.length; i += 4) d[i] = 255;
  const img = new ImageData(d, w, 8); processLensFrame(img);
  for (let y = 0; y < 8; y++) assert.equal(new Set(Array.from({ length: w }, (_, x) => img.data[(y * w + x) * 4])).size, 1);
});
