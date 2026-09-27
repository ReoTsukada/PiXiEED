import test from 'node:test';
import assert from 'node:assert/strict';
import { DITHER_PATTERNS } from '../../js/pixel-lens/dither-patterns.mjs';
import { processLensFrame, setLensSettings } from '../../js/pixel-lens/engine.mjs';

globalThis.ImageData ??= class { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } };

test('the first proposal: Bayer nets, checker, lines, diagonals, halftone, grain and two diffusions', () => {
  assert.deepEqual(DITHER_PATTERNS.map((p) => p.id), ['net8', 'net4', 'net2', 'checker', 'lines', 'diagonal', 'halftone', 'grain', 'atkinson', 'fs']);
  const steps = Object.fromEntries(DITHER_PATTERNS.filter((p) => p.kind === 'ordered').map((p) => [p.id, p.levels.length - 2]));
  assert.deepEqual(steps, { net8: 63, net4: 15, net2: 3, checker: 1, lines: 5, diagonal: 5, halftone: 8, grain: 255 });
  for (const p of DITHER_PATTERNS.filter((q) => q.kind === 'ordered')) for (let k = 1; k < p.coverage.length; k++) assert.ok(p.coverage[k] > p.coverage[k - 1], p.id);
  for (const p of DITHER_PATTERNS.filter((q) => q.kind === 'diffusion')) assert.ok(Math.abs(p.kernel.reduce((s, k) => s + k[2], 0) - (p.id === 'atkinson' ? 0.75 : 1)) < 1e-9, p.id);
});

test('each step of a net is a proper ordered pattern: steps only ever add pixels', () => {
  for (const id of ['net8', 'net4', 'net2', 'grain']) {
    const p = DITHER_PATTERNS.find((q) => q.id === id);
    for (let k = 1; k < p.levels.length; k++) for (let i = 0; i < p.levels[k].length; i++) assert.ok(p.levels[k][i] >= p.levels[k - 1][i], `${id} ${k}`);
  }
});

const flat = (w, h, v) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < d.length; i += 4) d.set([v, v, v, 255], i); return new ImageData(d, w, h); };
const run = (id, img) => { setLensSettings({ colorDepth: '2', paletteMode: 'gameboy', gradientMode: 'dither', ditherPattern: id, surfaceSimplify: 0 }); processLensFrame(img); return img; };

test('ordered patterns: a flat tone is one clean step, repeated', () => {
  for (const p of DITHER_PATTERNS.filter((q) => q.kind === 'ordered')) {
    for (const v of [70, 128, 190]) {
      const img = run(p.id, flat(32, 32, v)); const n = p.size;
      const light = Math.max(...img.data.filter((_, i) => i % 4 === 0));
      const bits = Array.from({ length: 32 * 32 }, (_, q) => (img.data[q * 4] === light ? 1 : 0));
      for (let q = 0; q < 32 * 32; q++) assert.equal(bits[q], bits[((q / 32 | 0) % n) * 32 + (q % 32) % n], `${p.id} ${v} repeats`);
      const tile = Array.from({ length: n * n }, (_, q) => bits[(q / n | 0) * 32 + (q % n)]);
      assert.ok(p.levels.some((level) => level.every((b, i) => b === tile[i])), `${p.id} ${v} is one of its steps`);
    }
  }
});

test('diffusion keeps the average tone and uses only palette colours', () => {
  for (const id of ['atkinson', 'fs']) {
    const img = run(id, flat(48, 48, 128));
    const values = new Set(img.data.filter((_, i) => i % 4 === 0));
    assert.ok(values.size === 2, id);
    const lightShare = img.data.filter((v, i) => i % 4 === 0 && v === Math.max(...values)).length / (48 * 48);
    assert.ok(lightShare > 0.2 && lightShare < 0.8, `${id} ${lightShare}`);
  }
});

test('no dither: flat colour only', () => {
  setLensSettings({ colorDepth: '2', paletteMode: 'gameboy', gradientMode: 'none', ditherPattern: 'net8', surfaceSimplify: 0 });
  const img = flat(16, 16, 128); processLensFrame(img);
  assert.equal(new Set(img.data.filter((_, i) => i % 4 === 0)).size, 1);
});
