import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = await readFile(new URL('../PiXiEEDrawDEV/assets/js/modules/pre-update-checkpoint-utils.js', import.meta.url), 'utf8');
const context = {
  window: { PiXiEEDrawModules: {} },
  structuredClone,
  crypto: webcrypto,
  TextEncoder,
  ArrayBuffer,
  Uint8Array,
  Int16Array,
  Uint8ClampedArray,
  Date,
  Math,
  JSON,
  Object,
  String,
  Number,
  Boolean,
  Set,
  WeakSet,
  Promise,
  Error,
};
vm.runInNewContext(source, context, { filename: 'pre-update-checkpoint-utils.js' });
const { createPreUpdateCheckpointUtils } = context.window.PiXiEEDrawModules.preUpdateCheckpointUtils;

function project(name, pixel = 1) {
  return {
    type: 'pixieedraw-project',
    updatedAt: '2026-07-12T00:00:00.000Z',
    document: {
      documentName: name,
      activeCanvasId: 'canvas-1',
      activeLayerId: 'layer-1',
      activeFrameId: 'frame-1',
      canvases: [{
        id: 'canvas-1', width: 16, height: 16,
        frames: [{ id: 'frame-1', layers: [{ id: 'layer-1', indices: new Int16Array([pixel, 0]), direct: new Uint8ClampedArray([pixel, 2, 3, 255]) }] }],
      }],
    },
    session: { localViewportCanvases: { positions: [{ left: 12, top: 24 }] } },
  };
}

function createMemoryStore(options = {}) {
  const sessions = new Map();
  const records = new Map();
  let readCount = 0;
  return {
    sessions,
    records,
    async writeSession(session, nextRecords) {
      if (options.failWrite) throw new Error('simulated write failure');
      sessions.set(session.checkpointSessionId, structuredClone(session));
      nextRecords.forEach(record => records.set(record.key, structuredClone(record)));
      if (options.onWrite) await options.onWrite();
    },
    async readSession(id) {
      readCount += 1;
      if (options.failRead) throw new Error('simulated read failure');
      if (options.onRead) await options.onRead({ readCount, sessions, records });
      const session = sessions.get(id);
      const matching = [...records.values()].filter(record => record.checkpointSessionId === id);
      return { session: session ? structuredClone(session) : null, records: structuredClone(matching) };
    },
    async updateSession(session) { sessions.set(session.checkpointSessionId, structuredClone(session)); },
    async invalidateSession(id, reason) {
      const session = sessions.get(id);
      if (session) sessions.set(id, { ...session, status: 'failed', failureReason: reason });
      [...records.values()].filter(record => record.checkpointSessionId === id).forEach(record => records.delete(record.key));
    },
    async cleanupReadySessions(keep) {
      const ready = [...sessions.values()].filter(session => session.status === 'ready')
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      ready.slice(keep).forEach(session => sessions.delete(session.checkpointSessionId));
    },
  };
}

function createHarness({ store = createMemoryStore(), tabs = null } = {}) {
  const openTabs = tabs || [
    { id: 'sheet-file', projectId: 'project-file', sheetRuntimeId: 'sheet-file-runtime', sourceKind: 'file', project: project('file.pixieedraw', 1) },
    { id: 'sheet-recent', projectId: 'project-recent', sheetRuntimeId: 'sheet-recent-runtime', sourceKind: 'recent', deferredProjectPayload: project('recent.pixieedraw', 2) },
    { id: 'sheet-image', projectId: 'project-image', sheetRuntimeId: 'sheet-image-runtime', sourceKind: 'import-image', project: project('image.pixieedraw', 3) },
    { id: 'sheet-gif', projectId: 'project-gif', sheetRuntimeId: 'sheet-gif-runtime', sourceKind: 'import-gif', project: project('gif.pixieedraw', 4) },
    { id: 'sheet-import', projectId: 'project-import', sheetRuntimeId: 'sheet-import-runtime', sourceKind: 'unknown', project: project('import.pixieedraw', 5) },
  ];
  const logs = [];
  const utils = createPreUpdateCheckpointUtils({
    getOpenProjectTabs: () => openTabs,
    getActiveOpenProjectTabId: () => 'sheet-file',
    getActiveProjectPayload: () => openTabs[0].project,
    resolveInactiveProjectPayload: tab => tab.project || tab.deferredProjectPayload || null,
    getBuildInfo: () => ({ edition: 'dev', version: '0.9.0-dev.1', buildId: '20260712-001' }),
    storeAdapter: store,
    now: () => '2026-07-12T01:02:03.456Z',
    random: () => 'fixed',
    log: event => logs.push(event),
  });
  return { utils, store, openTabs, logs };
}

{
  const { utils, store, logs, openTabs } = createHarness();
  openTabs.find(tab => tab.id === 'sheet-gif').project.canonicalSourceMetadata = {
    sourceKind: 'import-gif', sourceMimeType: 'image/gif', sourceFileBytes: 42,
    sourceWidth: 16, sourceHeight: 16, sourceFrameCount: 3, gifLoopCount: 0,
  };
  const result = await utils.preparePreUpdateCheckpoint({ targetBuildInfo: { edition: 'dev', version: '0.9.1-dev.1', buildId: '20260713-001' } });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.sheetCount, 5);
  const readback = await utils.readSession(result.checkpointSessionId);
  assert.equal(readback.session.status, 'ready');
  assert.equal(readback.records.length, 5);
  assert.deepEqual(readback.session.sheetOrder, ['sheet-file', 'sheet-recent', 'sheet-image', 'sheet-gif', 'sheet-import']);
  assert.equal(readback.records[0].payload.document.canvases[0].frames[0].layers[0].indices[0], 1);
  const gifRecord = readback.records.find(record => record.sheetId === 'sheet-gif-runtime');
  assert.equal(gifRecord.payload.canonicalSourceMetadata.gifLoopCount, 0);
  assert.equal(gifRecord.payload.canonicalSourceMetadata.sourceFrameCount, 3);
  assert.equal(logs.some(event => event.phase === 'readback-start'), true);
  assert.equal(store.records.size, 5);
}

for (const option of [{ failWrite: true, code: 'ERR_PRE_UPDATE_WRITE_FAILED' }, { failRead: true, code: 'ERR_PRE_UPDATE_READBACK_FAILED' }]) {
  const { utils, store } = createHarness({ store: createMemoryStore(option) });
  const result = await utils.preparePreUpdateCheckpoint();
  assert.equal(result.ok, false);
  assert.equal(result.code, option.code);
  if (store.sessions.has(result.checkpointSessionId)) {
    assert.equal(store.sessions.get(result.checkpointSessionId)?.status, 'failed');
  }
  assert.equal(store.records.size, 0);
}

{
  const store = createMemoryStore({ onRead: ({ readCount, records }) => {
    if (readCount === 1) records.values().next().value.payload.document.documentName = 'tampered.pixieedraw';
  } });
  const { utils } = createHarness({ store });
  const result = await utils.preparePreUpdateCheckpoint();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERR_PRE_UPDATE_VERIFY_FAILED');
}

{
  const { openTabs } = createHarness();
  const store = createMemoryStore({ onRead: ({ readCount }) => {
    if (readCount === 1) openTabs[0].project.document.canvases[0].frames[0].layers[0].indices[0] = 99;
  } });
  const { utils } = createHarness({ store, tabs: openTabs });
  const result = await utils.preparePreUpdateCheckpoint();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERR_PRE_UPDATE_REVISION_CHANGED');
}

{
  let releaseWrite;
  const waitForWrite = new Promise(resolve => { releaseWrite = resolve; });
  const store = createMemoryStore({ onWrite: async () => await waitForWrite });
  const { utils } = createHarness({ store });
  const first = utils.preparePreUpdateCheckpoint();
  await Promise.resolve();
  const second = await utils.preparePreUpdateCheckpoint();
  assert.equal(second.code, 'ERR_PRE_UPDATE_CHECKPOINT_IN_FLIGHT');
  releaseWrite();
  assert.equal((await first).ok, true);
}

console.log('pre-update checkpoint U3 tests passed');
