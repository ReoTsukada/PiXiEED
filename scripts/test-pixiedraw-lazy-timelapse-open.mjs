import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';
import path from 'node:path';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const require = createRequire(path.join(repoRoot, 'tools/screenshots/package.json'));
const { chromium } = require('playwright');

const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><title>PiXiEEDraw lazy timelapse</title>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
let browser = null;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({
    path: path.join(repoRoot, 'pixiedraw/assets/js/modules/document-session-workflow-utils.js'),
  });
  const result = await page.evaluate(() => {
    let decodeCalls = 0;
    const utils = window.PiXiEEDrawModules.documentSessionWorkflowUtils.createDocumentSessionWorkflowUtils({
      history: { limit: 30 },
      MIN_HISTORY_LIMIT: 1,
      DEFAULT_HISTORY_LIMIT: 30,
      clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
      normalizeTimelapseFps: value => Number(value) || 12,
      normalizeTimelapseCanvasId: (value, fallback = '') => String(value || fallback || ''),
      createEmptyTimelapseTrack: () => ({
        snapshots: [], serializedSnapshots: [], operationLog: null,
        warningShown: false, sampleStep: 1, lastCaptureToken: -1,
      }),
      normalizeLocalViewportCanvasState: value => value || {},
      LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE: {},
      decodeBase64: () => {
        decodeCalls += 1;
        return new Uint8Array(16);
      },
      compressUint8Array: value => value,
      getAllTimelapseTracks: () => ({}),
      flushPendingTimelapseCapture: () => {},
      serializeProjectTimelapseSnapshotList: () => [],
    });
    const encodedFrame = {
      width: 2,
      height: 2,
      pixels: 'AAAAAAAAAAAAAAAAAAAAAA==',
    };
    const payload = {
      historyLimit: 30,
      timelapse: {
        enabled: true,
        fps: 12,
        byCanvas: {
          canvas: {
            snapshots: Array.from({ length: 100 }, () => encodedFrame),
            warningShown: true,
            sampleStep: 1,
            lastCaptureToken: 100,
          },
        },
        operationLogsByCanvas: {},
      },
    };
    const lazy = utils.parseProjectSessionPayload(payload, 'canvas', {
      deferTimelapseSnapshots: true,
    });
    const lazyDecodeCalls = decodeCalls;
    const eager = utils.parseProjectSessionPayload(payload, 'canvas', {
      deferTimelapseSnapshots: false,
    });
    return {
      lazyDecodeCalls,
      eagerDecodeCalls: decodeCalls - lazyDecodeCalls,
      lazyRuntimeCount: lazy.timelapse.tracksByCanvasId.canvas.snapshots.length,
      lazySerializedCount: lazy.timelapse.tracksByCanvasId.canvas.serializedSnapshots.length,
      eagerRuntimeCount: eager.timelapse.tracksByCanvasId.canvas.snapshots.length,
    };
  });
  assert.equal(result.lazyDecodeCalls, 0);
  assert.equal(result.lazyRuntimeCount, 0);
  assert.equal(result.lazySerializedCount, 100);
  assert.equal(result.eagerDecodeCalls, 100);
  assert.equal(result.eagerRuntimeCount, 100);
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
