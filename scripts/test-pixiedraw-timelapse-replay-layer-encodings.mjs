import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const require = createRequire(path.join(repoRoot, 'tools/screenshots/package.json'));
const { chromium } = require('playwright');
const server = http.createServer((_request, response) => response.end('<!doctype html><title>timelapse layer encoding</title>'));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
let browser = null;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.addScriptTag({ content: fs.readFileSync(path.join(repoRoot, 'pixiedraw/assets/js/modules/timelapse-replay-utils.js'), 'utf8') });
  const result = await page.evaluate(() => {
    const replay = window.PiXiEEDrawModules.timelapseReplayUtils.createTimelapseReplayUtils();
    const canvas = document.createElement('canvas');
    const snapshot = {
      width: 3, height: 1, activeFrame: 0,
      palette: [
        { r: 255, g: 0, b: 0, a: 255 },
        { r: 0, g: 255, b: 0, a: 255 },
        { r: 0, g: 0, b: 255, a: 255 },
      ],
      frames: [{ layers: [
        { visible: true, opacity: 1, indices: new Int16Array([0, -1, -1]) },
        { visible: true, opacity: 1, indicesEncoding: 'uint8-zero-transparent-v1', indices: new Uint8Array([0, 2, 0]) },
        { visible: true, opacity: 1, indicesEncoding: 'uint8-tiled-zero-transparent-v1', indices: new Uint8Array(0), indicesWidth: 3, indicesHeight: 1, indicesTileSize: 2, indicesTiles: [new Uint8Array(4), new Uint8Array([3, 0, 0, 0])] },
      ] }],
    };
    replay.applyForwardDiff(snapshot, { __historyEntryType: 'pixel-patch', canvasId: '', frameId: '', layerId: '', width: 3, changes: [] });
    replay.renderSnapshotToCanvas(snapshot, canvas);
    const layers = Array.from(canvas.getContext('2d').getImageData(0, 0, 3, 1).data);
    const frameSnapshot = {
      width: 1, height: 1, activeFrame: 0,
      palette: [{ r: 255, g: 0, b: 0, a: 255 }, { r: 0, g: 0, b: 255, a: 255 }],
      frames: [
        { id: 'frame-a', layers: [{ visible: true, opacity: 1, indices: new Int16Array([0]) }] },
        { id: 'frame-b', layers: [{ visible: true, opacity: 1, indices: new Int16Array([1]) }] },
      ],
    };
    replay.renderSnapshotToCanvas(frameSnapshot, canvas, { frameId: 'frame-b' });
    const frameB = Array.from(canvas.getContext('2d').getImageData(0, 0, 1, 1).data);
    return { layers, frameB };
  });
  assert.deepEqual(result.layers, [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
  assert.deepEqual(result.frameB, [0, 0, 255, 255]);
  console.log('timelapse replay preserves layer encodings and event frame selection');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
