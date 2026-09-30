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
test('8 and 16 colour looks spend source-derived slots on distinct scene colours', () => {
  const groups = [
    { rgb: [49, 111, 181], count: 6200 }, // broad blue sky with small shade variations
    { rgb: [216, 73, 59], count: 1200 },
    { rgb: [48, 165, 84], count: 1000 },
    { rgb: [240, 190, 56], count: 800 },
    { rgb: [146, 73, 180], count: 800 }
  ];
  const data = new Uint8ClampedArray(100 * 100 * 4);
  let cell = 0;
  for (const { rgb, count } of groups) for (let i = 0; i < count; i++) {
    const offset = cell++ * 4;
    const variation = rgb[2] === 181 ? (i % 5 - 2) * 2 : 0;
    data.set([rgb[0] + variation, rgb[1] + variation, rgb[2] + variation, 255], offset);
  }
  for (const depth of ['8', '16']) for (const paletteMode of ['gameboy', 'source']) {
    setLensSettings({ colorDepth: depth, paletteMode, gradientMode: 'none', surfaceSimplify: 0 });
    resetLensPalette();
    const rendered = { width: 100, height: 100, data: new Uint8ClampedArray(data) };
    processLensFrame(rendered);
    const palette = lensPalette();
    assert.equal(palette.length, 5, `${depth} colours, ${paletteMode}: no near-blue duplicates or invented fillers`);
    const allowed = new Set(palette.map((color) => color.join(',')));
    for (let offset = 0; offset < rendered.data.length; offset += 4) {
      assert.ok(allowed.has([...rendered.data.subarray(offset, offset + 3)].join(',')), 'pixels use the extracted palette only');
    }
    for (const [red, green, blue] of groups.slice(1).map(({ rgb }) => rgb)) {
      assert.ok(palette.some(([r, g, b]) => Math.abs(r - red) < 20 && Math.abs(g - green) < 20 && Math.abs(b - blue) < 20),
        `${depth} colours, ${paletteMode}: each smaller material keeps a colour`);
    }
  }
});
test('camera tone filter string follows the camera settings', () => {
  setLensSettings({ cameraSettings: { brightness: 50 } }); assert.match(lensFrameFilter(), /blur\(0\.45px\) brightness\(1\.300\)/);
  setLensSettings({ cameraSettings: { brightness: 0 } });
});
