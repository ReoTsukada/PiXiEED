import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const require = createRequire(path.join(repoRoot, 'tools/screenshots/package.json'));
const { chromium } = require('playwright');
const server = http.createServer((_request, response) => response.end('<!doctype html><title>timelapse GIF dialog</title>'));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
let browser = null;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.setContent(`<!doctype html><dialog id="timelapseDialog"></dialog><canvas id="timelapseCanvas"></canvas><input id="timelapsePosition" type="range"><output id="timelapseStepCount"></output><button id="playTimelapse"></button><button id="stopTimelapse"></button><button id="restartTimelapse"></button><button id="exportTimelapse"></button><input id="timelapseSpeed" type="range" value="1"><output id="timelapseSpeedValue"></output><p id="timelapseStatus"></p>`);
  for (const file of ['timelapse-operation-store-utils.js', 'timelapse-replay-utils.js', 'timelapse-dialog-utils.js']) {
    await page.addScriptTag({ content: fs.readFileSync(path.join(repoRoot, 'pixiedraw/assets/js/modules', file), 'utf8') });
  }
  const result = await page.evaluate(async () => {
    const projectId = `dialog-gif-${crypto.randomUUID()}`;
    const modules = window.PiXiEEDrawModules;
    const store = modules.timelapseOperationStore.createTimelapseOperationStore();
    const baseline = {
      width: 1, height: 1, activeFrame: 0,
      palette: [{ r: 255, g: 0, b: 0, a: 255 }],
      frames: [{ id: 'frame-1', layers: [{ id: 'layer-1', visible: true, opacity: 1, indices: new Int16Array([0]) }] }],
    };
    await store.recordBaselineIfMissing({ projectId, snapshot: baseline });
    await store.recordOperation({
      projectId,
      operationId: 'resize',
      label: 'resizeCanvas',
      entry: {
        __historyEntryType: 'canvas-resize', kind: 'resize-canvas', canvasId: '',
        offsetX: 1, offsetY: 0,
      },
      checkpointSnapshot: {
        width: 2, height: 1, activeFrame: 0,
        palette: [{ r: 255, g: 0, b: 0, a: 255 }],
        frames: [{ id: 'frame-1', layers: [{ id: 'layer-1', visible: true, opacity: 1, indices: new Int16Array([-1, 0]) }] }],
      },
    });
    // Simulate an already-saved project created before resize offsets were
    // stored in timelapse metadata.
    await store.setOperationState({
      projectId,
      operationId: 'resize',
      state: 'active',
      metadata: { kind: 'resize-canvas', frameId: 'frame-1' },
    });
    const captured = {};
    const controller = modules.timelapseDialogUtils.createTimelapseDialogUtils({
      getProjectId: () => projectId,
      buildGifFromPixels: (frames, durations, width, height, options) => {
        captured.frames = frames.length;
        captured.firstLeftAlpha = frames[0][3];
        captured.firstPlacedAlpha = frames[0][7];
        captured.lastPlacedAlpha = frames.at(-1)[7];
        captured.durations = durations.length;
        captured.size = [width, height];
        captured.loopCount = options.loopCount;
        return new Uint8Array([71, 73, 70]);
      },
      triggerDownloadFromBlob: async (blob, filename) => {
        captured.blobSize = blob.size;
        captured.filename = filename;
      },
      getExportFileName: () => 'test-timelapse.gif',
    });
    await controller.load();
    await controller.exportGif();
    await store.removeProject(projectId);
    return { ...captured, status: document.getElementById('timelapseStatus').textContent };
  });
  assert.equal(result.frames, 2);
  assert.equal(result.durations, 2);
  assert.equal(result.firstLeftAlpha, 0);
  assert.equal(result.firstPlacedAlpha, 255);
  assert.equal(result.lastPlacedAlpha, 255);
  assert.deepEqual(result.size, [2, 1]);
  assert.equal(result.loopCount, 0);
  assert.equal(result.blobSize, 3);
  assert.equal(result.filename, 'test-timelapse.gif');
  assert.match(result.status, /透明GIFを出力しました/);
  console.log('timelapse dialog GIF export passed');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
