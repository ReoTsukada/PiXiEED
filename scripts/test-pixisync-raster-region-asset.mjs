import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.window = { PiXiEEDrawModules: {} };
new Function(await readFile(new URL('../pixiedraw/assets/js/modules/pixisync-raster-region-asset-utils.js', import.meta.url), 'utf8'))();
const codec = window.PiXiEEDrawModules.pixisyncRasterRegionAssetUtils;
const encoded = codec.encode({
  width: 16,
  height: 12,
  changes: [
    { index: 17, paletteValue: 2 },
    { index: 18, paletteValue: 0 },
    { index: 50, paletteValue: 7 },
  ],
});
assert.deepEqual(encoded.rect, { x: 1, y: 1, width: 2, height: 3 });
assert.deepEqual(codec.decode(encoded.bytes), {
  rect: { x: 1, y: 1, width: 2, height: 3 },
  changes: [
    { x: 1, y: 1, paletteValue: 2 },
    { x: 2, y: 1, paletteValue: 0 },
    { x: 2, y: 3, paletteValue: 7 },
  ],
  changedCount: 3,
  pixelFormat: 'indexed-mask-v1',
});
assert.throws(() => codec.encode({ width: 2, height: 2, changes: [{ index: 0, paletteValue: 255 }] }), /invalid-change/);
assert.throws(() => codec.encode({ width: 2, height: 2, changes: [{ index: 0, paletteValue: 1 }, { index: 0, paletteValue: 2 }] }), /invalid-change/);
const corrupt = encoded.bytes.slice(); corrupt[4] = 9;
assert.throws(() => codec.decode(corrupt), /invalid-header/);
console.log('PiXiSYNC raster region asset codec tests passed');
