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
    response.end('<!doctype html><title>PiXiEEDraw timelapse safety test</title>');
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
    content: fs.readFileSync(
      path.join(repoRoot, 'pixiedraw/assets/js/modules/timelapse-operation-store-utils.js'),
      'utf8'
    ),
  });

  const result = await page.evaluate(async () => {
    const module = window.PiXiEEDrawModules.timelapseOperationStore;
    const statusEvents = [];
    const makeOptions = () => ({
      maxEventCount: 3,
      maxEventBytes: 2 * 1024 * 1024,
      maxCheckpointCount: 2,
      maxCheckpointBytes: 4 * 1024 * 1024,
      onStatus: (message, tone, details) => statusEvents.push({ message, tone, details }),
    });
    const first = module.createTimelapseOperationStore(makeOptions());
    const second = module.createTimelapseOperationStore(makeOptions());
    const projectId = `capacity-${crypto.randomUUID()}`;
    const baseline = { width: 2, height: 2, palette: [{ r: 0, g: 0, b: 0, a: 0 }], frames: [] };
    const pixelPatch = index => ({
      __historyEntryType: 'pixel-patch',
      historyLabel: 'pen',
      canvasId: 'canvas-1',
      frameId: 'frame-1',
      layerId: 'layer-1',
      width: 2,
      height: 2,
      changes: [{ index, before: { paletteIndex: 0 }, after: { paletteIndex: 1 } }],
    });

    await first.recordBaselineIfMissing({ projectId, snapshot: baseline });
    for (let index = 0; index < 3; index += 1) {
      await first.recordOperation({
        projectId,
        operationId: `capacity-op-${index}`,
        entry: pixelPatch(index),
        label: 'pen',
      });
    }
    const beforePause = await second.readProjectMeta(projectId);
    const rejectedAtCapacity = await second.recordOperation({
      projectId,
      operationId: 'capacity-op-3',
      entry: pixelPatch(3),
      label: 'pen',
    });
    const afterPause = await first.readProjectMeta(projectId);
    const rejectedAfterPause = await first.recordOperation({
      projectId,
      operationId: 'capacity-op-4',
      entry: pixelPatch(4),
      label: 'pen',
    });
    const preservedAfterStateChange = await first.setOperationState({
      projectId,
      operationId: 'capacity-op-0',
      state: 'undone',
    });
    const afterStateChange = await first.readProjectMeta(projectId);
    const activeAfterPause = await second.listActiveEvents(projectId);

    const deleteProjectId = `delete-race-${crypto.randomUUID()}`;
    await first.recordBaselineIfMissing({ projectId: deleteProjectId, snapshot: baseline });
    first.queueOperation(deleteProjectId, pixelPatch(8), 'pen');
    const removal = second.removeProject(deleteProjectId);
    const concurrentRemoval = first.removeProject(deleteProjectId);
    first.queueOperation(deleteProjectId, pixelPatch(9), 'pen');
    const removalResults = await Promise.all([removal, concurrentRemoval]);
    await first.flush(deleteProjectId);
    const deleteBaseline = await second.readBaseline(deleteProjectId);
    const deleteEvents = await first.listActiveEvents(deleteProjectId);
    const deleteMeta = await second.readProjectMeta(deleteProjectId);

    await first.removeProject(projectId);
    return {
      beforePause: {
        eventCount: beforePause?.eventCount,
        checkpointCount: beforePause?.checkpointCount,
        recordingState: beforePause?.recordingState,
      },
      rejectedAtCapacity,
      rejectedAfterPause,
      afterPause: {
        eventCount: afterPause?.eventCount,
        checkpointCount: afterPause?.checkpointCount,
        recordingState: afterPause?.recordingState,
        recordingPauseReason: afterPause?.recordingPauseReason,
      },
      preservedAfterStateChange,
      afterStateChange: {
        eventCount: afterStateChange?.eventCount,
        checkpointCount: afterStateChange?.checkpointCount,
        recordingState: afterStateChange?.recordingState,
      },
      activeAfterPause: activeAfterPause.map(event => event.operationId),
      removalResults,
      deleteBaseline,
      deleteEvents: deleteEvents.map(event => event.operationId),
      deleteMeta,
      statusCount: statusEvents.length,
      capacityNoticeCount: statusEvents.filter(event => event.details?.reason === 'capacity').length,
    };
  });

  assert.deepEqual(result.beforePause, {
    eventCount: 3,
    checkpointCount: 1,
    recordingState: 'active',
  });
  assert.equal(result.rejectedAtCapacity, null);
  assert.equal(result.rejectedAfterPause, null);
  assert.deepEqual(result.afterPause, {
    eventCount: 3,
    checkpointCount: 1,
    recordingState: 'paused',
    recordingPauseReason: 'capacity',
  });
  assert.equal(result.preservedAfterStateChange, true);
  assert.deepEqual(result.afterStateChange, {
    eventCount: 3,
    checkpointCount: 1,
    recordingState: 'paused',
  });
  assert.deepEqual(result.activeAfterPause, ['capacity-op-1', 'capacity-op-2']);
  assert.deepEqual(result.removalResults, [true, true]);
  assert.equal(result.deleteBaseline, null);
  assert.deepEqual(result.deleteEvents, []);
  assert.equal(result.deleteMeta, null);
  assert.equal(result.capacityNoticeCount, 2);
  console.log(JSON.stringify(result, null, 2));
  console.log('PiXiEEDraw timelapse safety runtime checks passed');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
