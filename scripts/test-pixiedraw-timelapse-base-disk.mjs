import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const storeUrl = new URL('pixiedraw/assets/js/modules/timelapse-chunk-store-utils.js', root);
const sessionUrl = new URL('pixiedraw/assets/js/modules/timelapse-session-utils.js', root);
const appUrl = new URL('pixiedraw/assets/js/app.js', root);
const [storeSource, sessionSource, appSource] = await Promise.all([
  readFile(storeUrl, 'utf8'),
  readFile(sessionUrl, 'utf8'),
  readFile(appUrl, 'utf8'),
]);

const storeWindow = { PiXiEEDrawModules: {}, indexedDB: null };
vm.runInNewContext(storeSource, {
  window: storeWindow,
  console,
  structuredClone,
}, { filename: storeUrl.pathname });

const store = storeWindow.PiXiEEDrawModules.timelapseChunkStoreUtils.createTimelapseChunkStoreUtils({
  indexedDBApi: null,
  maxSnapshotsPerCanvas: 4,
});
const frame = id => ({ width: 1, height: 1, pixels: [id, 0, 0, 255] });
const baseSnapshot = {
  width: 2,
  height: 1,
  frames: [{ layers: [{ data: new Uint8Array([1, 2]) }] }],
};
const rgbBaseSnapshot = {
  colorMode: 'rgb',
  width: 1,
  height: 1,
  frames: [{ layers: [{ direct: new Uint8ClampedArray([12, 34, 56, 255]) }] }],
};

await store.appendSnapshots('project-1', 'canvas-1', [frame(1), frame(2)]);
assert.equal(await store.writeBaseSnapshot('project-1', 'canvas-1', baseSnapshot), true);
assert.equal(await store.writeBaseSnapshot('project-1', 'canvas-rgb', rgbBaseSnapshot), true);
baseSnapshot.frames[0].layers[0].data[0] = 99;
rgbBaseSnapshot.frames[0].layers[0].direct[0] = 99;

const stored = await store.readProject('project-1');
assert.equal(stored.byCanvas['canvas-1'].length, 2);
assert.equal(stored.baseSnapshotsByCanvas['canvas-1'].frames[0].layers[0].data[0], 1);
assert.equal(stored.baseSnapshotsByCanvas['canvas-rgb'].colorMode, 'rgb');
assert.equal(stored.baseSnapshotsByCanvas['canvas-rgb'].frames[0].layers[0].direct[0], 12);
stored.baseSnapshotsByCanvas['canvas-1'].frames[0].layers[0].data[0] = 77;
assert.equal(
  (await store.readProject('project-1')).baseSnapshotsByCanvas['canvas-1'].frames[0].layers[0].data[0],
  1,
  'readProject must not expose the fallback store object by reference'
);
assert.equal(await store.removeProject('project-1'), true);
const removed = await store.readProject('project-1');
assert.deepEqual(Object.keys(removed.byCanvas), []);
assert.deepEqual(Object.keys(removed.baseSnapshotsByCanvas), []);

const sessionWindow = { PiXiEEDrawModules: {} };
vm.runInNewContext(sessionSource, { window: sessionWindow, console }, { filename: sessionUrl.pathname });
const diskBase = { width: 1, height: 1, frames: [{ layers: [] }] };
let accidentalBaseCreationCount = 0;
const operationLog = {
  version: 1,
  baseSnapshot: null,
  baseSnapshotStored: true,
  baseSnapshotStorageCanvasId: 'canvas-1',
  baseSnapshotStorageProjectId: 'project-1',
  entries: [],
};
const track = { snapshots: [], operationLog };
const timelapseState = {
  enabled: true,
  tracksByCanvasId: { 'canvas-1': track },
  fps: 12,
};
const session = sessionWindow.PiXiEEDrawModules.timelapseSessionUtils.createTimelapseSessionUtils({
  timelapseState,
  activeSharedProjectKey: '',
  multiState: { connected: false },
  isSharedProjectCollaborativeMode: () => false,
  getActiveProjectCanvasDocument: () => ({ id: 'canvas-1' }),
  createEmptyTimelapseOperationLog: () => ({
    version: 1,
    baseSnapshot: null,
    baseSnapshotStored: false,
    baseSnapshotStorageCanvasId: '',
    baseSnapshotStorageProjectId: '',
    entries: [],
  }),
  makeHistorySnapshot: () => {
    accidentalBaseCreationCount += 1;
    return { accidental: true };
  },
  serializeDocumentSnapshot: value => value,
  loadPersistedTimelapseBaseSnapshot: async (canvasId, projectId) => (
    canvasId === 'canvas-1' && projectId === 'project-1' ? diskBase : null
  ),
});

assert.equal(session.ensureTimelapseOperationLogBase('canvas-1'), operationLog);
assert.equal(accidentalBaseCreationCount, 0, 'a disk-backed base must not be recreated from current pixels');
const hydration = await session.hydrateTimelapseOperationLogBase('canvas-1');
assert.equal(hydration?.hydrated, true);
assert.equal(operationLog.baseSnapshot, diskBase);
assert.equal(session.releaseHydratedTimelapseOperationLogBase(hydration), true);
assert.equal(operationLog.baseSnapshot, null);
assert.equal(operationLog.baseSnapshotStored, true);

assert.match(appSource, /TIMELAPSE_DISK_BASE_MIN_PIXEL_PLANES = 256 \* 256 \* 48/);
assert.match(appSource, /writeBaseSnapshot\(normalizedProjectId, canvasKey, baseSnapshot\)/);
assert.match(appSource, /normalizedProjectId !== activeProjectId/);
assert.match(appSource, /operationLog\.baseSnapshotStored = true;[\s\S]{0,240}operationLog\.baseSnapshot = null;/);
assert.match(appSource, /ERR_TIMELAPSE_BASE_UNAVAILABLE/);
assert.match(appSource, /ERR_AUTOSAVE_PROJECT_CONTEXT_CHANGED/);
assert.match(appSource, /recovered-from-v2-checkpoint/);
assert.match(appSource, /archiveTimelapseOperationLogBases\(normalizedProjectId\)\.catch/);
assert.match(appSource, /residentTimelapseBaseCount/);
assert.match(appSource, /diskBackedTimelapseBaseCount/);
assert.match(sessionSource, /try \{[\s\S]{0,180}buildTimelapseExportEntriesFromOperationLog[\s\S]{0,180}finally \{/);

console.log('PiXiEEDraw disk-backed timelapse base checks passed.');
