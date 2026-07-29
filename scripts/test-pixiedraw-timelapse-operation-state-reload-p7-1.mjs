import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const require = createRequire(path.join(repoRoot, 'tools/screenshots/package.json'));
const { chromium } = require('playwright');

function startServer() {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>PiXiEEDraw timelapse operation reload test</title>');
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const server = await startServer();
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}/`;
let browser = null;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({
    content: fs.readFileSync(path.join(repoRoot, 'pixiedraw/assets/js/modules/timelapse-operation-store-utils.js'), 'utf8'),
  });
  const result = await page.evaluate(async () => {
    const projectId = `reload-${crypto.randomUUID()}`;
    const module = window.PiXiEEDrawModules.timelapseOperationStore;
    const pixelPatch = index => ({
      __historyEntryType: 'pixel-patch',
      historyLabel: 'pen',
      canvasId: 'canvas-1', frameId: 'frame-1', layerId: 'layer-1',
      width: 2, height: 2,
      changes: [{ index, before: { paletteIndex: 0 }, after: { paletteIndex: 1 } }],
    });
    const createStore = () => module.createTimelapseOperationStore();
    const first = createStore();
    const baseline = { width: 2, height: 2, palette: [{ r: 0, g: 0, b: 0, a: 0 }], frames: [] };
    const queuedProjectId = `${projectId}-queued`;
    const queued = createStore();
    queued.queueBaseline(queuedProjectId, baseline);
    queued.queueOperation(queuedProjectId, pixelPatch(0), 'pen');
    await queued.flush(queuedProjectId);
    const queuedEvents = await createStore().listActiveEvents(queuedProjectId);
    await first.recordBaselineIfMissing({ projectId, snapshot: baseline });
    await first.recordOperation({ projectId, operationId: 'op-1', entry: pixelPatch(0), label: 'pen' });
    const baselineAfterReload = await createStore().readBaseline(projectId);
    await first.setOperationState({ projectId, operationId: 'op-1', state: 'undone' });
    const afterUndoReload = await createStore().listActiveEvents(projectId);
    await createStore().setOperationState({ projectId, operationId: 'op-1', state: 'active' });
    const afterRedoReload = await createStore().listActiveEvents(projectId);
    await createStore().setOperationState({ projectId, operationId: 'op-1', state: 'discarded' });
    await createStore().recordOperation({ projectId, operationId: 'op-2', entry: pixelPatch(1), label: 'pen' });
    await createStore().recordOperation({
      projectId,
      operationId: 'op-3',
      entry: { __historyEntryType: 'palette-state', historyLabel: 'palette' },
      label: 'palette',
      checkpointSnapshot: { width: 2, height: 2, palette: [{ r: 255, g: 0, b: 0, a: 255 }], frames: [] },
    });
    const afterBranchReload = await createStore().listActiveEvents(projectId);
    const structuralEvent = afterBranchReload.find(event => event.operationId === 'op-3');
    const structuralCheckpoint = await createStore().readOperationCheckpoint(projectId, structuralEvent?.checkpointKey);
    await createStore().removeProject(projectId);
    await createStore().removeProject(queuedProjectId);
    const baselineAfterCleanup = await createStore().readBaseline(projectId);
    return {
      baselineAfterReload,
      baselineAfterCleanup,
      structuralCheckpoint,
      queuedEvents: queuedEvents.length,
      afterUndoReload: afterUndoReload.map(event => event.operationId),
      afterRedoReload: afterRedoReload.map(event => event.operationId),
      afterBranchReload: afterBranchReload.map(event => event.operationId),
    };
  });

  assert.deepEqual(result.afterUndoReload, []);
  assert.equal(result.queuedEvents, 1);
  assert.deepEqual(result.baselineAfterReload, { width: 2, height: 2, palette: [{ r: 0, g: 0, b: 0, a: 0 }], frames: [] });
  assert.equal(result.baselineAfterCleanup, null);
  assert.deepEqual(result.afterRedoReload, ['op-1']);
  assert.deepEqual(result.afterBranchReload, ['op-2', 'op-3']);
  assert.deepEqual(result.structuralCheckpoint, { width: 2, height: 2, palette: [{ r: 255, g: 0, b: 0, a: 255 }], frames: [] });
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
