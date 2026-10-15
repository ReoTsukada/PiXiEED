import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLensSourcePalette } from '../../js/pixel-studio/lens-source-palette.mjs';
import { countSharedImageColors } from '../../js/creation/shared-image.mjs';
import { evaluateSharedCanvasPolicy } from '../../js/creation/shared-canvas-policy.mjs';

function gradientImage(colorCount) {
  const rgba = new Uint8ClampedArray(colorCount * 4);
  for (let i = 0; i < colorCount; i++) rgba.set([(i * 37) & 255, (i * 83) & 255, (i * 131) & 255, 255], i * 4);
  return { width: colorCount, height: 1, data: rgba };
}

test('camera source palette supports 32/64 depth and keeps full-color pixels unchanged', () => {
  for (const [inputCount, depth, maximum] of [[33, 32, 32], [64, 64, 64], [65, 64, 64]]) {
    const source = gradientImage(inputCount);
    const result = createLensSourcePalette().render(source, { colorDepth: String(depth), dither: 'off', surfaceSimplify: 0 });
    assert.ok(result.palette.length <= maximum, `${inputCount} source colors at depth ${depth}`);
    assert.equal(result.data.length, source.data.length);
  }
  const raw = gradientImage(65);
  const full = createLensSourcePalette().render(raw, { colorDepth: 'full' });
  assert.deepEqual([...full.data].filter((_, index) => index % 4 !== 3), [...raw.data].filter((_, index) => index % 4 !== 3));
});

test('shared camera color policy counts used RGBA colors, excludes transparent pixels and caps at 64', () => {
  const rgba = new Uint8Array(66 * 4);
  for (let i = 0; i < 65; i++) rgba.set([i, (i * 7) & 255, (i * 13) & 255, 255], i * 4);
  rgba.set([222, 11, 5, 0], 65 * 4);
  const image = { width: 66, height: 1, rgba };
  assert.equal(countSharedImageColors(image), 65);
  assert.equal(countSharedImageColors({ width: 2, height: 1, rgba: new Uint8Array([5, 6, 7, 0, 5, 6, 7, 127]) }), 1);
  assert.equal(evaluateSharedCanvasPolicy({ width: 64, height: 1, colorCount: 33 }, { passActive: false }).locked, true);
  assert.equal(evaluateSharedCanvasPolicy({ width: 64, height: 1, colorCount: 33 }, { passActive: true }).locked, false);
  assert.equal(evaluateSharedCanvasPolicy({ width: 64, height: 1, colorCount: 64 }, { passActive: true }).supported, true);
  assert.equal(evaluateSharedCanvasPolicy({ width: 64, height: 1, colorCount: 65 }, { passActive: true }).supported, false);
});

test('both camera UIs gate new 64-color processing and retain captured results after expiry', () => {
  const lens = readFileSync(new URL('../../js/pixel-lens/app.mjs', import.meta.url), 'utf8');
  const studio = readFileSync(new URL('../../js/pixel-studio/app.mjs', import.meta.url), 'utf8');
  assert.match(lens, /c64: \{ colorDepth: '64', paletteMode: 'source' \}/);
  assert.match(lens, /cameraRewardPaused = true;[\s\S]*?loop\?\.stop\(\);[\s\S]*?stopTracks\(\)/);
  assert.match(lens, /requireSiteReward\('camera\.colors64'\)/);
  assert.match(studio, /\['32', '32 色'\], \['64', '64 色 · 60分パス'\]/);
  assert.match(studio, /requireSiteReward\('camera\.colors64'\)/);
  assert.match(studio, /現在の64色画像は保持しています/);
});
