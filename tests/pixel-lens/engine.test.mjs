import test from 'node:test';
import assert from 'node:assert/strict';
import { setLensSettings, processLensFrame, resetLensPalette, lensPalette, lensFrameFilter, FIXED_FOUR_COLOR_PALETTE } from '../../js/pixel-lens/engine.mjs';

const frame = (w = 24, h = 24) => { const data = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) { const i = (y * w + x) * 4; data[i] = x * 10; data[i + 1] = y * 10; data[i + 2] = 128; data[i + 3] = 255; } return { data, width: w, height: h }; };

test('PiXiEELENS default: Game Boy four colours only', () => {
  setLensSettings({ colorDepth: '4', paletteMode: 'gameboy', gradientMode: 'dither', surfaceSimplify: 55 }); resetLensPalette();
  const img = processLensFrame(frame()); const allowed = new Set(FIXED_FOUR_COLOR_PALETTE.map((c) => `${c.r},${c.g},${c.b}`));
  for (let i = 0; i < img.data.length; i += 4) assert.ok(allowed.has(`${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`));
  assert.equal(lensPalette().length, 4);
});
test('photo palette: at most the chosen number of colours', () => {
  setLensSettings({ colorDepth: '8', paletteMode: 'source' }); resetLensPalette();
  const img = processLensFrame(frame()); const seen = new Set(); for (let i = 0; i < img.data.length; i += 4) seen.add(`${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`);
  assert.ok(seen.size <= 8, `colours ${seen.size}`);
});
test('camera tone filter string follows the camera settings', () => {
  setLensSettings({ cameraSettings: { brightness: 50 } }); assert.match(lensFrameFilter(), /blur\(0\.45px\) brightness\(1\.300\)/);
  setLensSettings({ cameraSettings: { brightness: 0 } });
});
