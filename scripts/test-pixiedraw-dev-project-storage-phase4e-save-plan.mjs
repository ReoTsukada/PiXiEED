import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const V1_ADAPTER_ID = 'pixieedraw-v1-json';
const V2_ADAPTER_ID = 'pixieedraw-v2-zip-experimental';
const originalConsole = globalThis.console;

function loadBrowserModule(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  vm.runInThisContext(source, { filename: absolutePath });
}

function createConsoleCapture() {
  const info = [];
  const warn = [];
  const error = [];
  return {
    info,
    warn,
    error,
    console: {
      info: (...args) => info.push(args.join(' ')),
      warn: (...args) => warn.push(args.join(' ')),
      error: (...args) => error.push(args.join(' ')),
      log() {},
    },
  };
}

function createExportRenderingHarness({
  flagEnabled = false,
  activePersistenceState = null,
} = {}) {
  const consoleCapture = createConsoleCapture();
  globalThis.window = {
    document: {},
    PiXiEEDrawModules: {},
    __pixieedrawUseV2ProjectSave: flagEnabled,
  };
  globalThis.document = window.document;
  globalThis.console = consoleCapture.console;
  globalThis.DISABLE_FILE_SYSTEM_ACCESS_SAVE = false;
  globalThis.PROJECT_FILE_EXTENSION = '.pixieedraw';
  globalThis.PROJECT_FILE_MIME_TYPE = 'application/x-pixieedraw-project';
  globalThis.NATIVE_PROJECTS_SUBDIRECTORY = 'pixieedraw-projects';
  globalThis.autosaveDirty = false;
  globalThis.autosaveProjectId = 'autosave-project';
  globalThis.pendingAutosaveHandle = null;
  globalThis.dom = {
    controls: {},
  };
  globalThis.state = {
    documentName: 'phase4e-sample.pixieedraw',
    frames: [],
  };

  const snapshot = {
    version: 1,
    width: 2,
    height: 2,
    palette: [],
    frames: [],
  };
  const session = {
    timelapse: {
      enabled: false,
      fps: 12,
      byCanvas: {},
      operationLogsByCanvas: {},
    },
  };
  const serializedOptions = [];
  const triggerCalls = [];
  const statusCalls = [];
  let storeAutosaveHandleCalls = 0;
  let recentProjectCalls = 0;
  let boundHandleCreateWritableCalls = 0;
  let pickerCreateWritableCalls = 0;
  let markDocumentDurablySavedCalls = 0;
  let setTrackedProjectDotBaselineCalls = 0;

  globalThis.autosaveHandle = {
    async createWritable() {
      boundHandleCreateWritableCalls += 1;
      return {
        async write() {},
        async close() {},
      };
    },
  };

  loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/export-rendering.js');

  const exportRenderingModule = window.PiXiEEDrawModules.exportRendering.createExportRenderingModule({
    console: consoleCapture.console,
    state,
    dom,
    PROJECT_FILE_EXTENSION,
    PROJECT_FILE_MIME_TYPE,
    NATIVE_PROJECTS_SUBDIRECTORY,
    DEFAULT_PROJECT_STORAGE_ADAPTER_ID: V1_ADAPTER_ID,
    commitHistory() {},
    makeHistorySnapshot() {
      return snapshot;
    },
    buildProjectSessionPayload() {
      return session;
    },
    getExportFileNameBase() {
      return 'phase4e-sample.pixieedraw';
    },
    getActiveProjectPersistenceState() {
      return activePersistenceState;
    },
    async serializeProjectStorageSnapshot(projectState, options) {
      serializedOptions.push({ ...options });
      return {
        packaged: {
          type: 'pixieedraw-project',
          packageVersion: 2,
          document: projectState.snapshot,
          session: projectState.session,
        },
        blob: new Blob(['phase4e'], { type: PROJECT_FILE_MIME_TYPE }),
        filename: 'phase4e-sample.pixieedraw',
        adapterId: options?.preferredAdapterId || V1_ADAPTER_ID,
        workerUsed: options?.useWorker === true,
      };
    },
    buildPackagedProjectPayload(rawSnapshot, { session: rawSession } = {}) {
      return {
        type: 'pixieedraw-project',
        packageVersion: 2,
        document: rawSnapshot,
        session: rawSession,
      };
    },
    createAutosaveFileName(name = 'phase4e-sample.pixieedraw') {
      return name;
    },
    ensureCurrentClientCanExportProject() {
      return true;
    },
    updateAutosaveStatus(message, level) {
      statusCalls.push({ message, level });
    },
    async ensureHandlePermission() {
      return true;
    },
    async storeAutosaveHandle() {
      storeAutosaveHandleCalls += 1;
    },
    async recordRecentProjectSnapshot() {
      recentProjectCalls += 1;
    },
    clearPendingPermissionListener() {},
    schedulePendingAutosavePermission() {},
    createAutosaveProjectId() {
      return 'generated-autosave-project';
    },
    resolvePackagedProjectDotStats() {
      return { dots: 1 };
    },
    setTrackedProjectDotBaseline() {
      setTrackedProjectDotBaselineCalls += 1;
    },
    markDocumentDurablySaved() {
      markDocumentDurablySavedCalls += 1;
    },
    async resolveUniqueExportDirectoryFilename() {
      return null;
    },
    async getFileHandleInExportDirectory() {
      return null;
    },
    async triggerDownloadFromBlob(blob, filename, options = {}) {
      triggerCalls.push({
        size: blob?.size || 0,
        filename,
        options,
      });
      return 'download';
    },
    async writeProjectBlobToNewHandle(handle, blob) {
      return false;
    },
  });

  window.showSaveFilePicker = async function showSaveFilePicker() {
    return {
      async createWritable() {
        pickerCreateWritableCalls += 1;
        return {
          async write() {},
          async close() {},
        };
      },
    };
  };

  return {
    consoleCapture,
    exportRenderingModule,
    serializedOptions,
    triggerCalls,
    statusCalls,
    get boundHandleCreateWritableCalls() {
      return boundHandleCreateWritableCalls;
    },
    get pickerCreateWritableCalls() {
      return pickerCreateWritableCalls;
    },
    get storeAutosaveHandleCalls() {
      return storeAutosaveHandleCalls;
    },
    get recentProjectCalls() {
      return recentProjectCalls;
    },
    get markDocumentDurablySavedCalls() {
      return markDocumentDurablySavedCalls;
    },
    get setTrackedProjectDotBaselineCalls() {
      return setTrackedProjectDotBaselineCalls;
    },
  };
}

const helperHarness = createExportRenderingHarness();
const { resolveActiveProjectSavePlan } = helperHarness.exportRenderingModule;

assert.deepEqual(
  resolveActiveProjectSavePlan({
    activePersistenceState: {
      sourceKind: 'new',
      sourceStorageAdapterId: null,
      projectSaveHandleState: 'none',
    },
    explicitPreferredStorageAdapterId: '',
    devV2SaveFlag: false,
    defaultStorageAdapterId: V1_ADAPTER_ID,
  }),
  {
    sourceStorageAdapterId: '',
    targetStorageAdapterId: V1_ADAPTER_ID,
    sourceKind: 'new',
    isNewProject: true,
    isConversionSave: false,
    isDowngradeSave: false,
    isMixedOrUnknownSource: false,
    allowSameHandleOverwrite: false,
    forceSaveAsNewFile: true,
    reason: 'new-project',
  }
);

const newV2Plan = resolveActiveProjectSavePlan({
  activePersistenceState: {
    sourceKind: 'new',
    sourceStorageAdapterId: null,
    projectSaveHandleState: 'none',
  },
  explicitPreferredStorageAdapterId: '',
  devV2SaveFlag: true,
  defaultStorageAdapterId: V1_ADAPTER_ID,
});
assert.equal(newV2Plan.targetStorageAdapterId, V2_ADAPTER_ID);
assert.equal(newV2Plan.forceSaveAsNewFile, true);

const v1SamePlan = resolveActiveProjectSavePlan({
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V1_ADAPTER_ID,
    projectSaveHandleState: 'unknown',
  },
  explicitPreferredStorageAdapterId: '',
  devV2SaveFlag: false,
  defaultStorageAdapterId: V1_ADAPTER_ID,
});
assert.equal(v1SamePlan.targetStorageAdapterId, V1_ADAPTER_ID);
assert.equal(v1SamePlan.isConversionSave, false);
assert.equal(v1SamePlan.allowSameHandleOverwrite, false);
assert.equal(v1SamePlan.forceSaveAsNewFile, false);

const v1ToV2Plan = resolveActiveProjectSavePlan({
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V1_ADAPTER_ID,
    projectSaveHandleState: 'unknown',
  },
  explicitPreferredStorageAdapterId: '',
  devV2SaveFlag: true,
  defaultStorageAdapterId: V1_ADAPTER_ID,
});
assert.equal(v1ToV2Plan.targetStorageAdapterId, V2_ADAPTER_ID);
assert.equal(v1ToV2Plan.isConversionSave, true);
assert.equal(v1ToV2Plan.allowSameHandleOverwrite, false);
assert.equal(v1ToV2Plan.forceSaveAsNewFile, true);
assert.equal(v1ToV2Plan.reason, 'adapter-conversion');

const v2SamePlan = resolveActiveProjectSavePlan({
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V2_ADAPTER_ID,
    projectSaveHandleState: 'unknown',
  },
  explicitPreferredStorageAdapterId: '',
  devV2SaveFlag: true,
  defaultStorageAdapterId: V1_ADAPTER_ID,
});
assert.equal(v2SamePlan.targetStorageAdapterId, V2_ADAPTER_ID);
assert.equal(v2SamePlan.isConversionSave, false);
assert.equal(v2SamePlan.isDowngradeSave, false);

const v2ToV1Plan = resolveActiveProjectSavePlan({
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V2_ADAPTER_ID,
    projectSaveHandleState: 'unknown',
  },
  explicitPreferredStorageAdapterId: '',
  devV2SaveFlag: false,
  defaultStorageAdapterId: V1_ADAPTER_ID,
});
assert.equal(v2ToV1Plan.targetStorageAdapterId, V1_ADAPTER_ID);
assert.equal(v2ToV1Plan.isDowngradeSave, true);
assert.equal(v2ToV1Plan.forceSaveAsNewFile, true);
assert.equal(v2ToV1Plan.reason, 'adapter-downgrade');

for (const sourceKind of ['recent', 'autosave', 'shared-local', 'unknown']) {
  const plan = resolveActiveProjectSavePlan({
    activePersistenceState: {
      sourceKind,
      sourceStorageAdapterId: null,
      projectSaveHandleState: 'none',
    },
    explicitPreferredStorageAdapterId: '',
    devV2SaveFlag: true,
    defaultStorageAdapterId: V1_ADAPTER_ID,
  });
  assert.equal(plan.allowSameHandleOverwrite, false);
  assert.equal(plan.forceSaveAsNewFile, true);
}

const conversionGuardPlan = resolveActiveProjectSavePlan({
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V1_ADAPTER_ID,
    projectSaveHandleState: 'bound',
  },
  explicitPreferredStorageAdapterId: V2_ADAPTER_ID,
  devV2SaveFlag: false,
  defaultStorageAdapterId: V1_ADAPTER_ID,
});
assert.equal(conversionGuardPlan.allowSameHandleOverwrite, false);

const v1ToV2SaveHarness = createExportRenderingHarness({
  flagEnabled: true,
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V1_ADAPTER_ID,
    projectSaveHandleState: 'none',
  },
});
const v1ToV2SaveResult = await v1ToV2SaveHarness.exportRenderingModule.saveProjectAsPixieedraw({
  announceStatus: false,
});
assert.equal(v1ToV2SaveResult.saved, true);
assert.equal(v1ToV2SaveResult.storageAdapterId, V2_ADAPTER_ID);
assert.equal(v1ToV2SaveResult.savePlan.isConversionSave, true);
assert.equal(v1ToV2SaveResult.savePlan.forceSaveAsNewFile, true);
assert.equal(v1ToV2SaveHarness.boundHandleCreateWritableCalls, 0);
assert.equal(v1ToV2SaveHarness.pickerCreateWritableCalls, 1);
assert.equal(v1ToV2SaveHarness.triggerCalls.length, 0);
assert.ok(
  v1ToV2SaveHarness.consoleCapture.info.some(entry => entry.includes('source adapter id: pixieedraw-v1-json'))
);
assert.ok(
  v1ToV2SaveHarness.consoleCapture.info.some(entry => entry.includes('target adapter id: pixieedraw-v2-zip-experimental'))
);
assert.ok(
  v1ToV2SaveHarness.consoleCapture.info.some(entry => entry.includes('force save as new file: true'))
);

const recentV1SaveHarness = createExportRenderingHarness({
  flagEnabled: false,
  activePersistenceState: {
    sourceKind: 'recent',
    sourceStorageAdapterId: null,
    projectSaveHandleState: 'none',
  },
});
const recentV1SaveResult = await recentV1SaveHarness.exportRenderingModule.saveProjectAsPixieedraw({
  announceStatus: false,
});
assert.equal(recentV1SaveResult.saved, true);
assert.equal(recentV1SaveResult.savePlan.forceSaveAsNewFile, true);
assert.equal(recentV1SaveHarness.boundHandleCreateWritableCalls, 0);
assert.equal(recentV1SaveHarness.pickerCreateWritableCalls, 1);
assert.equal(recentV1SaveHarness.triggerCalls.length, 0);

const downgradeHarness = createExportRenderingHarness({
  flagEnabled: false,
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V2_ADAPTER_ID,
    projectSaveHandleState: 'none',
  },
});
const downgradeResult = await downgradeHarness.exportRenderingModule.saveProjectAsPixieedraw({
  announceStatus: false,
});
assert.equal(downgradeResult.saved, true);
assert.equal(downgradeResult.savePlan.isDowngradeSave, true);
assert.equal(downgradeResult.savePlan.forceSaveAsNewFile, true);
assert.equal(downgradeHarness.boundHandleCreateWritableCalls, 0);
assert.equal(downgradeHarness.pickerCreateWritableCalls, 1);
assert.equal(downgradeHarness.triggerCalls.length, 0);
assert.ok(
  downgradeHarness.consoleCapture.info.some(entry => entry.includes('is downgrade save: true'))
);

globalThis.console = originalConsole;
originalConsole.log('Phase 4-E project save plan checks passed.');
