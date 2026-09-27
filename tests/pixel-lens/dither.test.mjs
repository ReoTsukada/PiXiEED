import test from 'node:test';
import assert from 'node:assert/strict';
import { DITHER_PATTERNS } from '../../js/pixel-lens/dither-patterns.mjs';
import { processLensFrame, setLensSettings } from '../../js/pixel-lens/engine.mjs';

globalThis.ImageData ??= class { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } };

test('every pattern is hand-drawn square tiles (8×8, motifs 16×16) with strictly rising coverage', () => {
  assert.deepEqual(DITHER_PATTERNS.map((p) => p.id), ['net', 'checker', 'halftone', 'lines', 'diagonal', 'heart', 'star', 'sparkle', 'flower']);
  for (const p of DITHER_PATTERNS) {
    assert.equal(p.size, p.group === 'cute' ? 16 : 8, p.id);
    for (const tile of p.tiles) { assert.equal(tile.length, p.size, p.id); for (const row of tile) assert.match(row, new RegExp(`^[#.]{${p.size}}$`), p.id); }
    for (let k = 1; k < p.coverage.length; k++) assert.ok(p.coverage[k] > p.coverage[k - 1], `${p.id} step ${k}`);
  }
});

test('motifs are symmetric at every step (whole hearts, stars, sparkles, flowers)', () => {
  for (const p of DITHER_PATTERNS.filter((q) => q.group === 'cute')) {
    for (const tile of p.tiles) {
      const n = tile.length;
      const symmetric = Array.from({ length: n }, (_, s) => s).some((s) => tile.every((row) => [...row].every((c, x) => c === row[(s - x + 2 * n) % n])));
      assert.ok(symmetric, `${p.id}\n${tile.join('\n')}`);
    }
  }
});

test('built on the checker: up to half, light only on checker cells; past half, dark only on the others', () => {
  for (const p of DITHER_PATTERNS) for (const tile of p.tiles) {
    const n = tile.length; const cover = tile.join('').split('').filter((c) => c === '#').length / (n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const onChecker = (x + y) % 2 === 0; const light = tile[y][x] === '#';
      if (cover <= 0.5 && light) assert.ok(onChecker, `${p.id} light off the checker`);
      if (cover >= 0.5 && !light) assert.ok(!onChecker, `${p.id} dark on the checker`);
    }
  }
});

test('網目 is the full 8×8 Bayer net (63 steps), and every pattern starts and ends on it', () => {
  const net = DITHER_PATTERNS.find((p) => p.id === 'net');
  assert.equal(net.tiles.length, 63);
  for (const p of DITHER_PATTERNS.filter((q) => q.id !== 'checker')) {
    const tiled = (t) => Array.from({ length: p.size }, (_, y) => t[y % 8].repeat(p.size / 8));
    assert.deepEqual(p.tiles[0], tiled(net.tiles[0]), p.id);
    assert.deepEqual(p.tiles.at(-1), tiled(net.tiles.at(-1)), p.id);
  }
});

const flat = (w, h, v) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < d.length; i += 4) d.set([v, v, v, 255], i); return new ImageData(d, w, h); };
const run = (id, img) => { setLensSettings({ colorDepth: '2', paletteMode: 'gameboy', gradientMode: 'dither', ditherPattern: id, surfaceSimplify: 0 }); processLensFrame(img); return img; };

test('a flat tone becomes exactly one of the drawn tiles, repeated', () => {
  for (const p of DITHER_PATTERNS) {
    for (const v of [70, 128, 190]) {
      const img = run(p.id, flat(32, 32, v));
      const light = Math.max(...img.data.filter((_, i) => i % 4 === 0));
      const bits = Array.from({ length: 32 * 32 }, (_, q) => (img.data[q * 4] === light ? '#' : '.'));
      const n = p.size;
      const tile = Array.from({ length: n }, (_, y) => bits.slice(y * 32, y * 32 + n).join(''));
      for (let q = 0; q < 32 * 32; q++) assert.equal(bits[q], tile[(q / 32 | 0) % n][q % n], `${p.id} ${v} repeats`);
      const drawn = [Array(n).fill('.'.repeat(n)), ...p.tiles, Array(n).fill('#'.repeat(n))];
      assert.ok(drawn.some((t) => t.join('') === tile.join('')), `${p.id} ${v} is a drawn tile`);
    }
  }
});

test('no dither: flat colour only', () => {
  setLensSettings({ colorDepth: '2', paletteMode: 'gameboy', gradientMode: 'none', ditherPattern: 'net', surfaceSimplify: 0 });
  const img = flat(16, 16, 128); processLensFrame(img);
  assert.equal(new Set(img.data.filter((_, i) => i % 4 === 0)).size, 1);
});
