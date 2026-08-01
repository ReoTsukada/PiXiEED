import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.window = { PiXiEEDrawModules: {} };
new Function(await readFile(new URL('../pixiedraw/assets/js/modules/pixisync-raster-asset-utils.js', import.meta.url), 'utf8'))();
const codec = window.PiXiEEDrawModules.pixisyncRasterAssetUtils;
const asset = {
  version: 1, kind: 'layer-track-remove', canvasId: 'canvas-a', width: 4, height: 3,
  frames: [{ frameId: 'frame-a', name: 'Frame 1', duration: 100, layers: [{ id: 'layer-a', trackId: 'track-a', name: 'Layer', opacity: 1, blendMode: 'normal', pixels: [[0, 2], [11, 4]] }] }],
};
assert.deepEqual(codec.decode(codec.encode(asset)), asset);
assert.deepEqual(codec.collectIndexedPixels({ indices: Int16Array.from([0, 2, -1, 4]) }, 2, 2), [[1, 2], [3, 4]]);
assert.throws(() => codec.encode({ ...asset, frames: [{ ...asset.frames[0], layers: [{ ...asset.frames[0].layers[0], pixels: [[2, 1], [1, 2]] }] }] }), /invalid-pixel/);
console.log('PiXiSYNC raster asset codec tests passed');
