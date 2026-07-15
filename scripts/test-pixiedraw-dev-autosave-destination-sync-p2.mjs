import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(
  path.join(root, 'PiXiEEDrawDEV/assets/js/modules/autosave-workflow-utils.js'),
  'utf8'
);

const timers = new Map();
let timerSequence = 0;
const counters = {
  snapshots: 0,
  v2Writes: 0,
  serializes: 0,
  destinationWrites: 0,
  durableMarks: 0,
};
let checkpointRequired = false;

globalThis.window = {
  PiXiEEDrawModules: {},
  performance: {
    now: () => Date.now(),
    mark() {},
    measure() {},
  },
  setTimeout(callback, delay) {
    const id = ++timerSequence;
    timers.set(id, { callback, delay });
    return id;
  },
  clearTimeout(id) {
    timers.delete(id);
  },
};
globalThis.document = { getElementById: () => null };
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { onLine: true },
});
vm.runInThisContext(source, { filename: 'autosave-workflow-utils.js' });

const autosaveHandle = {
  async queryPermission() {
    return 'granted';
  },
  async createWritable() {
    return {
      async write() {
        counters.destinationWrites += 1;
      },
      async close() {},
      async abort() {},
    };
  },
};

const scope = {
  AUTOSAVE_DESTINATION_SYNC_DELAY_MS: 12000,
  AUTOSAVE_LIFECYCLE_FLUSH_THROTTLE_MS: 1000,
  AUTOSAVE_SUPPORTED: true,
  AUTOSAVE_TAB_LOCK_KEY: 'lock',
  AUTOSAVE_TAB_LOCK_NOTICE_THROTTLE_MS: 1000,
  AUTOSAVE_TAB_LOCK_TTL_MS: 1000,
  AUTOSAVE_THUMBNAIL_UPDATE_INTERVAL_MS: 12000,
  AUTOSAVE_WRITE_DELAY: 900,
  FILE_HANDLE_AUTOSAVE_SUPPORTED: true,
  MULTI_REPLICA_AUTOSAVE_BLOCKED_STATUS: '',
  SAVE_INTERACTION_GRACE_MS: 100,
  VIEWPORT_INTERACTION_GRACE_MS: 100,
  autosaveDirty: true,
  autosaveDirtyGeneration: 1,
  autosaveHandle,
  autosaveLifecycleFlushAt: 0,
  autosaveProjectId: 'project-1',
  autosaveRestoring: false,
  autosaveTabInstanceId: 'tab-1',
  autosaveTabLockNoticeAt: 0,
  autosaveWriteDeadline: 0,
  autosaveWriteInFlight: false,
  autosaveWriteQueued: false,
  autosaveWriteTimer: null,
  canUseSessionStorage: false,
  dom: { controls: { autosaveStatus: { textContent: '', dataset: {} } } },
  floatingDrawButtonState: { drawSessionStarted: false },
  lastSaveInteractionAt: 0,
  lastViewportInteractionAt: 0,
  multiState: { connected: false },
  pendingAutosaveHandle: null,
  pointerState: { active: false, selectionMove: false },
  state: { documentName: 'project-1.pixieedraw' },
  unsavedChangeToken: 1,
  virtualCursorDrawState: { active: false },
  buildActiveLocalProjectSavePlan: ({ snapshot }) => snapshot
    ? { journalOnly: false, packagedPayload: { document: snapshot } }
    : (checkpointRequired ? null : { journalOnly: true, journalPayload: { ops: [{ kind: 'pixel-patch' }] } }),
  buildPackagedProjectPayload: snapshot => ({ document: snapshot }),
  buildProjectSessionPayload: () => ({ historyLimit: 30 }),
  ensureActiveAutosaveProjectId: async () => 'project-1',
  ensureHandlePermission: async () => true,
  isAutosaveV2JournalReady: () => true,
  isAutosaveV2PrimaryEnabled: () => true,
  isCurrentProjectSharedEntry: () => false,
  isLargeDocumentPerformanceMode: () => false,
  isLightweightPersistenceMode: () => false,
  isMultiMasterMode: () => true,
  localizeText: ja => ja,
  loadStoredAutosaveHandle: async () => autosaveHandle,
  makeHistorySnapshot: () => {
    counters.snapshots += 1;
    return { width: 32, height: 32, frames: [] };
  },
  markActiveLocalProjectJournalNeedsCheckpoint() {},
  markDocumentDurablySaved: () => {
    counters.durableMarks += 1;
  },
  normalizeAutosaveProjectId: value => String(value || '').trim(),
  normalizeV2PixelPatchJournalOps: payload => payload?.ops || null,
  pruneInactiveCanvasDirectCaches() {},
  queueAutosaveV2ShadowWrite() {},
  recordRecentProjectSnapshot: async () => ({ id: 'project-1' }),
  serializeProjectStorageSnapshot: async () => {
    counters.serializes += 1;
    return { blob: new Blob(['v2']), workerUsed: true };
  },
  shouldUseLightweightSharedProjectLocalSave: () => false,
  writeAutosaveV2Primary: async ({ savePlan }) => {
    counters.v2Writes += 1;
    assert.equal(savePlan?.journalOnly === true, !checkpointRequired);
    return { id: 'project-1' };
  },
};

const utils = window.PiXiEEDrawModules.autosaveWorkflowUtils.createAutosaveWorkflowUtils(scope);

const journalWriteResult = await utils.writeAutosaveSnapshot(false, { syncDestination: false });
if (journalWriteResult !== true) {
  console.error({ journalWriteResult, counters, autosaveDirty: scope.autosaveDirty, statusNode: scope.dom.controls.autosaveStatus });
}
assert.equal(journalWriteResult, true);
assert.equal(counters.v2Writes, 1, 'the V2 journal must be committed immediately');
assert.equal(counters.snapshots, 0, 'journal-only autosave must not build a full snapshot');
assert.equal(counters.serializes, 0, 'journal-only autosave must not rebuild the archive');
assert.equal(counters.destinationWrites, 0, 'journal-only autosave must not rewrite the destination file');
assert.equal(scope.autosaveDirty, false);
assert.equal(utils.hasPendingAutosaveWork(), true, 'destination-file lag must remain visible as pending work');
assert.equal([...timers.values()].some(timer => timer.delay === 12000), true, 'destination sync must be scheduled for idle time');
assert.equal(scope.dom.controls.autosaveStatus.textContent.includes('反映待ち'), true);

assert.equal(await utils.writeAutosaveSnapshot(true), true, 'forced flush must synchronize the destination file');
assert.equal(counters.snapshots, 1, 'forced destination sync must build one current snapshot');
assert.equal(counters.serializes, 1);
assert.equal(counters.destinationWrites, 1);
assert.equal(counters.v2Writes, 1, 'destination-only sync must not duplicate the V2 journal revision');
assert.equal(utils.hasPendingAutosaveWork(), false);
assert.equal(scope.dom.controls.autosaveStatus.textContent.includes('反映済み'), true);

checkpointRequired = true;
scope.autosaveDirty = true;
scope.autosaveDirtyGeneration = 2;
scope.unsavedChangeToken = 2;
assert.equal(await utils.writeAutosaveSnapshot(false, { syncDestination: false }), true);
assert.equal(counters.snapshots, 2, 'a checkpoint must build a full snapshot immediately');
assert.equal(counters.v2Writes, 2);
assert.equal(counters.destinationWrites, 2, 'a checkpoint must immediately refresh the destination file');
assert.equal(utils.hasPendingAutosaveWork(), false);

console.log('PiXiEEDrawDEV P2 autosave destination-sync checks passed.');
