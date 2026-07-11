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

function normalizeProjectStorageAdapterId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeProjectSaveHandleMeta(value = null, fallback = null) {
  const next = value && typeof value === 'object' ? value : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  return {
    fileName: typeof next.fileName === 'string' && next.fileName.trim()
      ? next.fileName.trim()
      : (typeof base.fileName === 'string' && base.fileName.trim() ? base.fileName.trim() : ''),
    adapterId: normalizeProjectStorageAdapterId(
      Object.prototype.hasOwnProperty.call(next, 'adapterId') ? next.adapterId : base.adapterId
    ),
    boundAt: typeof next.boundAt === 'string' && next.boundAt.trim()
      ? next.boundAt.trim()
      : (typeof base.boundAt === 'string' && base.boundAt.trim() ? base.boundAt.trim() : ''),
    sourceProjectToken: typeof next.sourceProjectToken === 'string' && next.sourceProjectToken.trim()
      ? next.sourceProjectToken.trim()
      : (typeof base.sourceProjectToken === 'string' && base.sourceProjectToken.trim() ? base.sourceProjectToken.trim() : null),
    handleKind: typeof next.handleKind === 'string' && next.handleKind.trim()
      ? next.handleKind.trim()
      : (typeof base.handleKind === 'string' && base.handleKind.trim() ? base.handleKind.trim() : 'unknown'),
    permissionState: typeof next.permissionState === 'string' && next.permissionState.trim()
      ? next.permissionState.trim()
      : (typeof base.permissionState === 'string' && base.permissionState.trim() ? base.permissionState.trim() : 'unknown'),
  };
}

function createWritableHandle(name, counterRef) {
  return {
    name,
    async createWritable() {
      counterRef.count += 1;
      return {
        async write() {},
        async close() {},
      };
    },
  };
}

function createHarness({
  flagEnabled = false,
  activePersistenceState = null,
  activeProjectSaveBinding = null,
  autosaveHandleSeed = null,
  pendingAutosaveHandleSeed = null,
  openSheetCount = 1,
  packagedSheets = null,
  multiSheetFlagEnabled = false,
  completeMultiSheetCandidate = null,
} = {}) {
  const consoleInfo = [];
  const consoleWarn = [];
  const replaceCalls = [];
  const bindCalls = [];
  const triggerCalls = [];
  const pickerCounter = { count: 0 };
  const autosaveCounter = { count: 0 };
  const pendingCounter = { count: 0 };

  const pickerHandle = createWritableHandle('picker-project.pixieedraw', pickerCounter);
  const autosaveHandle = autosaveHandleSeed || createWritableHandle('autosave-seed.pixieedraw', autosaveCounter);
  const pendingAutosaveHandle = pendingAutosaveHandleSeed || createWritableHandle('pending-seed.pixieedraw', pendingCounter);

  let activeBindingState = activeProjectSaveBinding || null;

  globalThis.window = {
    document: {},
    PiXiEEDrawModules: {},
    __pixieedrawUseV2ProjectSave: flagEnabled,
    __pixieedrawUseMultiSheetV2ExternalSave: multiSheetFlagEnabled,
    showSaveFilePicker: async function showSaveFilePicker() {
      return pickerHandle;
    },
  };
  globalThis.document = window.document;
  globalThis.console = {
    info: (...args) => consoleInfo.push(args.join(' ')),
    warn: (...args) => consoleWarn.push(args),
    error() {},
    log() {},
  };
  globalThis.DISABLE_FILE_SYSTEM_ACCESS_SAVE = false;
  globalThis.PROJECT_FILE_EXTENSION = '.pixieedraw';
  globalThis.PROJECT_FILE_MIME_TYPE = 'application/x-pixieedraw-project';
  globalThis.NATIVE_PROJECTS_SUBDIRECTORY = 'pixieedraw-projects';
  globalThis.autosaveDirty = false;
  globalThis.autosaveProjectId = 'autosave-project';
  globalThis.autosaveHandle = autosaveHandle;
  globalThis.pendingAutosaveHandle = pendingAutosaveHandle;
  globalThis.dom = { controls: {} };
  globalThis.state = {
    documentName: 'phase4j-test.pixieedraw',
    frames: [],
  };
  globalThis.openProjectTabs = Array.from(
    { length: Math.max(1, Math.round(Number(openSheetCount) || 1)) },
    (_, index) => ({ id: `sheet-${index + 1}` })
  );

  loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/export-rendering.js');

  const exportRenderingModule = window.PiXiEEDrawModules.exportRendering.createExportRenderingModule({
    console,
    state,
    dom,
    PROJECT_FILE_EXTENSION,
    PROJECT_FILE_MIME_TYPE,
    NATIVE_PROJECTS_SUBDIRECTORY,
    DEFAULT_PROJECT_STORAGE_ADAPTER_ID: V1_ADAPTER_ID,
    commitHistory() {},
    makeHistorySnapshot() {
      return {
        version: 1,
        width: 2,
        height: 2,
        frames: [],
      };
    },
    buildProjectSessionPayload() {
      return {
        timelapse: {
          enabled: false,
          fps: 12,
          byCanvas: {},
          operationLogsByCanvas: {},
        },
      };
    },
    getExportFileNameBase() {
      return 'phase4j-test.pixieedraw';
    },
    getActiveProjectPersistenceState() {
      return activePersistenceState;
    },
    getActiveProjectSaveBinding() {
      return activeBindingState;
    },
    getOpenProjectSheetCount() {
      return globalThis.openProjectTabs.length;
    },
    normalizeAutosaveProjectId(value) {
      return typeof value === 'string' ? value.trim() : '';
    },
    activeOpenProjectTabId: 'sheet-1',
    collectCompleteMultiSheetV2SaveCandidate() {
      return completeMultiSheetCandidate;
    },
    bindActiveProjectSaveHandle(handle, meta) {
      const normalizedMeta = normalizeProjectSaveHandleMeta(meta, null);
      activeBindingState = {
        projectSaveHandle: handle,
        projectSaveHandleMeta: normalizedMeta,
        projectSaveHandleState: 'bound',
      };
      bindCalls.push({ handle, meta: normalizedMeta });
      return activeBindingState;
    },
    replaceActiveOpenProjectTabFromCurrentState(options = {}) {
      replaceCalls.push({ ...options });
      return options;
    },
    normalizeProjectSaveHandleMeta,
    async serializeProjectStorageSnapshot(projectState, options) {
      return {
        packaged: projectState?.packaged || {
          type: 'pixieedraw-project',
          packageVersion: 2,
          document: projectState.snapshot,
          session: projectState.session,
          ...(Array.isArray(packagedSheets) ? { sheets: packagedSheets } : {}),
        },
        blob: new Blob(['phase4j'], { type: PROJECT_FILE_MIME_TYPE }),
        filename: 'phase4j-test.pixieedraw',
        adapterId: options?.preferredAdapterId || V1_ADAPTER_ID,
        workerUsed: false,
      };
    },
    buildPackagedProjectPayload(snapshot, { session } = {}) {
      return {
        type: 'pixieedraw-project',
        packageVersion: 2,
        document: snapshot,
        session,
      };
    },
    createAutosaveFileName(name = 'phase4j-test.pixieedraw') {
      return name;
    },
    ensureCurrentClientCanExportProject() {
      return true;
    },
    updateAutosaveStatus() {},
    async ensureHandlePermission() {
      return true;
    },
    async recordRecentProjectSnapshot() {},
    resolvePackagedProjectDotStats() {
      return null;
    },
    setTrackedProjectDotBaseline() {},
    markDocumentDurablySaved() {},
    async resolveUniqueExportDirectoryFilename() {
      return null;
    },
    async getFileHandleInExportDirectory() {
      return null;
    },
    async triggerDownloadFromBlob(blob, filename, options = {}) {
      triggerCalls.push({ size: blob?.size || 0, filename, options });
      return 'download';
    },
  });

  return {
    exportRenderingModule,
    pickerHandle,
    autosaveHandle,
    pendingAutosaveHandle,
    consoleInfo,
    consoleWarn,
    replaceCalls,
    bindCalls,
    triggerCalls,
    pickerCounter,
    autosaveCounter,
    pendingCounter,
    get activeBindingState() {
      return activeBindingState;
    },
  };
}

const v2OverwriteCounter = { count: 0 };
const v2OverwriteHandle = createWritableHandle('bound-v2.pixieedraw', v2OverwriteCounter);
const overwriteHarness = createHarness({
  flagEnabled: true,
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V2_ADAPTER_ID,
    sourceProjectToken: 'token-v2-bound',
    lastSavedStorageAdapterId: V2_ADAPTER_ID,
    projectSaveHandleState: 'bound',
  },
  activeProjectSaveBinding: {
    projectSaveHandle: v2OverwriteHandle,
    projectSaveHandleMeta: normalizeProjectSaveHandleMeta({
      fileName: 'bound-v2.pixieedraw',
      adapterId: V2_ADAPTER_ID,
      sourceProjectToken: 'token-v2-bound',
      handleKind: 'file-picker',
      permissionState: 'granted',
    }),
    projectSaveHandleState: 'bound',
  },
});
const overwriteResult = await overwriteHarness.exportRenderingModule.saveProjectAsPixieedraw({ announceStatus: false });
assert.equal(overwriteResult.saved, true);
assert.equal(overwriteResult.savedAsNewFile, false);
assert.equal(v2OverwriteCounter.count, 1, 'V2 same-handle overwrite uses bound projectSaveHandle');
assert.equal(overwriteHarness.pickerCounter.count, 0, 'V2 same-handle overwrite does not open picker');
assert.equal(overwriteHarness.bindCalls.length, 0, 'existing bound handle is reused without rebinding');
assert.equal(overwriteHarness.autosaveCounter.count, 0, 'autosaveHandle is ignored for V2 overwrite');
assert.equal(overwriteHarness.pendingCounter.count, 0, 'pendingAutosaveHandle is ignored for V2 overwrite');
assert.equal(overwriteHarness.replaceCalls.at(-1)?.sourceStorageAdapterId, V2_ADAPTER_ID);
assert.equal(overwriteHarness.replaceCalls.at(-1)?.lastSavedStorageAdapterId, V2_ADAPTER_ID);
assert.equal(overwriteHarness.replaceCalls.at(-1)?.sourceKind, 'file');
assert.equal(overwriteHarness.replaceCalls.at(-1)?.projectSaveHandleState, 'bound');
assert.equal(overwriteHarness.replaceCalls.at(-1)?.fileName, 'bound-v2.pixieedraw');

const multiSheetOverwriteCounter = { count: 0 };
const multiSheetOverwriteHandle = createWritableHandle('bound-v2-multi.pixieedraw', multiSheetOverwriteCounter);
const multiSheetHarness = createHarness({
  flagEnabled: true,
  openSheetCount: 2,
  packagedSheets: [
    {
      id: 'sheet-1',
      project: {
        type: 'pixieedraw-project',
        packageVersion: 2,
        document: { version: 1, frames: [] },
        session: {},
      },
    },
  ],
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V2_ADAPTER_ID,
    sourceProjectToken: 'token-v2-multi',
    lastSavedStorageAdapterId: V2_ADAPTER_ID,
    projectSaveHandleState: 'bound',
  },
  activeProjectSaveBinding: {
    projectSaveHandle: multiSheetOverwriteHandle,
    projectSaveHandleMeta: normalizeProjectSaveHandleMeta({
      fileName: 'bound-v2-multi.pixieedraw',
      adapterId: V2_ADAPTER_ID,
      sourceProjectToken: 'token-v2-multi',
      handleKind: 'file-picker',
      permissionState: 'granted',
    }),
    projectSaveHandleState: 'bound',
  },
});
const multiSheetResult = await multiSheetHarness.exportRenderingModule.saveProjectAsPixieedraw({
  announceStatus: false,
  includeSheets: false,
});
assert.equal(multiSheetResult.saved, false);
assert.equal(multiSheetResult.blocked, true, 'incomplete multi-sheet V2 save is blocked');
assert.equal(multiSheetResult.savePlan.openSheetCount, 2);
assert.equal(multiSheetResult.savePlan.packagedSheetCount, 0);
assert.equal(multiSheetResult.savePlan.includesAllSheets, false);
assert.equal(multiSheetResult.savePlan.isMultiSheetProject, true);
assert.equal(multiSheetResult.savePlan.allowMultiSheetOverwrite, false);
assert.equal(multiSheetResult.savePlan.allowSameHandleOverwrite, false);
assert.equal(multiSheetResult.savePlan.forceSaveAsNewFile, true);
assert.equal(multiSheetResult.savePlan.overwriteBlockedReason, 'multi-sheet-v2-flag-disabled');
assert.equal(multiSheetOverwriteCounter.count, 0, 'multi-sheet save never writes the existing V2 handle');
assert.equal(multiSheetHarness.pickerCounter.count, 0, 'multi-sheet safety guard does not create an incomplete new file');
assert.equal(multiSheetHarness.triggerCalls.length, 0, 'multi-sheet safety guard does not download an incomplete file');
assert.ok(
  multiSheetHarness.consoleWarn.some(args => String(args[0]).includes('blocked multi-sheet V2 save preflight')),
  'multi-sheet safety guard logs its reason'
);

const completePackagedSheets = [
  { id: 'sheet-1', project: { document: {}, session: {} } },
  { id: 'sheet-2', project: { document: {}, session: {} } },
];
const includeSheetsDisabledSafety = multiSheetHarness.exportRenderingModule.resolveV2ProjectSheetOverwriteSafety({
  packagedProject: { sheets: completePackagedSheets },
  includeSheets: false,
  openSheetCount: 2,
});
assert.equal(includeSheetsDisabledSafety.allowMultiSheetOverwrite, false);
assert.equal(includeSheetsDisabledSafety.overwriteBlockedReason, 'include-sheets-disabled');

const currentCompleteMultiSheetSafety = multiSheetHarness.exportRenderingModule.resolveV2ProjectSheetOverwriteSafety({
  packagedProject: { sheets: completePackagedSheets },
  includeSheets: true,
  openSheetCount: 2,
});
assert.equal(currentCompleteMultiSheetSafety.includesAllSheets, true);
assert.equal(currentCompleteMultiSheetSafety.allowMultiSheetOverwrite, false);
assert.equal(currentCompleteMultiSheetSafety.overwriteBlockedReason, 'multi-sheet-v2-incomplete');

const futureCompleteMultiSheetSafety = multiSheetHarness.exportRenderingModule.resolveV2ProjectSheetOverwriteSafety({
  packagedProject: { sheets: completePackagedSheets },
  includeSheets: true,
  openSheetCount: 2,
  allowCompleteMultiSheetOverwrite: true,
});
assert.equal(futureCompleteMultiSheetSafety.allowMultiSheetOverwrite, true);
assert.equal(futureCompleteMultiSheetSafety.overwriteBlockedReason, '');

const completeMultiSheetCandidate = {
  complete: true,
  packagedSheetCount: 2,
  packaged: {
    sheets: completePackagedSheets,
    sheetOrder: ['sheet-1', 'sheet-2'],
    activeSheetId: 'sheet-1',
  },
};
const completeMultiSheetEligibility = multiSheetHarness.exportRenderingModule.resolveProjectSameHandleOverwriteEligibility({
  activeProjectSaveBinding: {
    projectSaveHandle: multiSheetOverwriteHandle,
    projectSaveHandleState: 'bound',
  },
  savePlan: {
    allowSameHandleOverwrite: true,
    sourceKind: 'file',
    sourceStorageAdapterId: V2_ADAPTER_ID,
    targetStorageAdapterId: V2_ADAPTER_ID,
    isMultiSheetProject: true,
    openSheetCount: 2,
  },
  targetStorageAdapterId: V2_ADAPTER_ID,
  multiSheetCandidate: completeMultiSheetCandidate,
  multiSheetFlagEnabled: true,
  v2ProjectSaveFlagEnabled: true,
});
assert.equal(completeMultiSheetEligibility.eligible, true, 'complete bound multi-sheet V2 save is overwrite eligible');

const completeMultiSheetOverwriteCounter = { count: 0 };
const completeMultiSheetOverwriteHandle = createWritableHandle('bound-v2-multi-complete.pixieedraw', completeMultiSheetOverwriteCounter);
const completeMultiSheetHarness = createHarness({
  flagEnabled: true,
  multiSheetFlagEnabled: true,
  openSheetCount: 2,
  completeMultiSheetCandidate,
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V2_ADAPTER_ID,
    sourceProjectToken: 'token-v2-multi-complete',
    lastSavedStorageAdapterId: V2_ADAPTER_ID,
    projectSaveHandleState: 'bound',
  },
  activeProjectSaveBinding: {
    projectSaveHandle: completeMultiSheetOverwriteHandle,
    projectSaveHandleMeta: normalizeProjectSaveHandleMeta({
      fileName: 'bound-v2-multi-complete.pixieedraw',
      adapterId: V2_ADAPTER_ID,
      sourceProjectToken: 'token-v2-multi-complete',
      handleKind: 'file-picker',
      permissionState: 'granted',
    }),
    projectSaveHandleState: 'bound',
  },
});
const completeMultiSheetOverwriteResult = await completeMultiSheetHarness.exportRenderingModule.executeProjectSave({ announceStatus: false });
assert.equal(completeMultiSheetOverwriteResult.ok, true);
assert.equal(completeMultiSheetOverwriteResult.status, 'saved');
assert.equal(completeMultiSheetOverwriteResult.outputKind, 'bound-handle');
assert.equal(completeMultiSheetOverwriteResult.legacyResult.savePlan.allowSameHandleOverwrite, true);
assert.equal(completeMultiSheetOverwriteResult.legacyResult.savePlan.forceSaveAsNewFile, false);
assert.equal(completeMultiSheetOverwriteCounter.count, 1, 'complete multi-sheet V2 save writes the bound handle');
assert.equal(completeMultiSheetHarness.pickerCounter.count, 0, 'complete multi-sheet V2 overwrite does not open picker');

const saveAsHarness = createHarness({
  flagEnabled: true,
  activePersistenceState: {
    sourceKind: 'file', sourceStorageAdapterId: V2_ADAPTER_ID, projectSaveHandleState: 'bound',
  },
  activeProjectSaveBinding: {
    projectSaveHandle: createWritableHandle('save-as-source.pixieedraw', { count: 0 }),
    projectSaveHandleState: 'bound',
  },
});
const saveAsResult = await saveAsHarness.exportRenderingModule.executeProjectSaveAs({ announceStatus: false });
assert.equal(saveAsResult.ok, true);
assert.equal(saveAsResult.status, 'saved-as');
assert.equal(saveAsHarness.pickerCounter.count, 1, 'Save As always opens the picker');
assert.equal(saveAsHarness.bindCalls.length, 1, 'Save As binds only its successfully selected picker handle');

const copyHarness = createHarness({
  flagEnabled: true,
  activePersistenceState: {
    sourceKind: 'file', sourceStorageAdapterId: V2_ADAPTER_ID, projectSaveHandleState: 'bound',
  },
  activeProjectSaveBinding: {
    projectSaveHandle: createWritableHandle('copy-source.pixieedraw', { count: 0 }),
    projectSaveHandleState: 'bound',
  },
});
const copyResult = await copyHarness.exportRenderingModule.executeProjectSaveCopy({ announceStatus: false });
assert.equal(copyResult.ok, true);
assert.equal(copyResult.status, 'copy-saved');
assert.equal(copyResult.bindingChanged, false);
assert.equal(copyResult.dirtyChanged, false);
assert.equal(copyHarness.pickerCounter.count, 1, 'Save Copy always opens a new picker');
assert.equal(copyHarness.bindCalls.length, 0, 'Save Copy does not bind the output handle');
assert.equal(copyHarness.replaceCalls.length, 0, 'Save Copy does not replace active persistence state');

const noBoundHarness = createHarness({
  flagEnabled: true,
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V2_ADAPTER_ID,
    sourceProjectToken: 'token-v2-unbound',
    lastSavedStorageAdapterId: V2_ADAPTER_ID,
    projectSaveHandleState: 'none',
  },
  activeProjectSaveBinding: {
    projectSaveHandle: createWritableHandle('ignored-v2-none.pixieedraw', { count: 0 }),
    projectSaveHandleMeta: normalizeProjectSaveHandleMeta({
      fileName: 'ignored-v2-none.pixieedraw',
      adapterId: V2_ADAPTER_ID,
      sourceProjectToken: 'token-v2-unbound',
      handleKind: 'file-picker',
      permissionState: 'granted',
    }),
    projectSaveHandleState: 'none',
  },
});
const noBoundResult = await noBoundHarness.exportRenderingModule.saveProjectAsPixieedraw({ announceStatus: false });
assert.equal(noBoundResult.saved, true);
assert.equal(noBoundHarness.pickerCounter.count, 1, 'V2 without bound handle falls back to new-file picker');
assert.equal(noBoundHarness.bindCalls.length, 1, 'picker save rebinds external V2 handle');

const conversionHandleCounter = { count: 0 };
const conversionHandle = createWritableHandle('old-v1-bound.pixieedraw', conversionHandleCounter);
const conversionHarness = createHarness({
  flagEnabled: true,
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V1_ADAPTER_ID,
    sourceProjectToken: 'token-v1-to-v2',
    lastSavedStorageAdapterId: V1_ADAPTER_ID,
    projectSaveHandleState: 'bound',
  },
  activeProjectSaveBinding: {
    projectSaveHandle: conversionHandle,
    projectSaveHandleMeta: normalizeProjectSaveHandleMeta({
      fileName: 'old-v1-bound.pixieedraw',
      adapterId: V1_ADAPTER_ID,
      sourceProjectToken: 'token-v1-to-v2',
      handleKind: 'file-picker',
      permissionState: 'granted',
    }),
    projectSaveHandleState: 'bound',
  },
});
const conversionResult = await conversionHarness.exportRenderingModule.saveProjectAsPixieedraw({ announceStatus: false });
assert.equal(conversionResult.saved, true);
assert.equal(conversionHandleCounter.count, 0, 'V1 -> V2 conversion does not overwrite existing handle');
assert.equal(conversionHarness.pickerCounter.count, 1, 'V1 -> V2 conversion uses new-file picker');
assert.equal(conversionHarness.replaceCalls.at(-1)?.sourceStorageAdapterId, V2_ADAPTER_ID);
assert.equal(conversionHarness.replaceCalls.at(-1)?.lastSavedStorageAdapterId, V2_ADAPTER_ID);

const downgradeHandleCounter = { count: 0 };
const downgradeHandle = createWritableHandle('old-v2-bound.pixieedraw', downgradeHandleCounter);
const downgradeHarness = createHarness({
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V2_ADAPTER_ID,
    sourceProjectToken: 'token-v2-to-v1',
    lastSavedStorageAdapterId: V2_ADAPTER_ID,
    projectSaveHandleState: 'bound',
  },
  activeProjectSaveBinding: {
    projectSaveHandle: downgradeHandle,
    projectSaveHandleMeta: normalizeProjectSaveHandleMeta({
      fileName: 'old-v2-bound.pixieedraw',
      adapterId: V2_ADAPTER_ID,
      sourceProjectToken: 'token-v2-to-v1',
      handleKind: 'file-picker',
      permissionState: 'granted',
    }),
    projectSaveHandleState: 'bound',
  },
});
const downgradeResult = await downgradeHarness.exportRenderingModule.saveProjectAsPixieedraw({ announceStatus: false });
assert.equal(downgradeResult.saved, true);
assert.equal(downgradeHandleCounter.count, 0, 'V2 -> V1 downgrade does not overwrite existing handle');
assert.equal(downgradeHarness.pickerCounter.count, 1, 'V2 -> V1 downgrade uses new-file picker');
assert.equal(downgradeHarness.replaceCalls.at(-1)?.sourceStorageAdapterId, V1_ADAPTER_ID);
assert.equal(downgradeHarness.replaceCalls.at(-1)?.lastSavedStorageAdapterId, V1_ADAPTER_ID);

for (const sourceKind of ['recent', 'autosave', 'shared-local', 'import-image', 'unknown', 'mixed']) {
  const sourceHandleCounter = { count: 0 };
  const sourceHandle = createWritableHandle(`ignored-${sourceKind}.pixieedraw`, sourceHandleCounter);
  const harness = createHarness({
    flagEnabled: true,
    activePersistenceState: {
      sourceKind,
      sourceStorageAdapterId: V2_ADAPTER_ID,
      sourceProjectToken: `token-${sourceKind}`,
      lastSavedStorageAdapterId: V2_ADAPTER_ID,
      projectSaveHandleState: 'bound',
    },
    activeProjectSaveBinding: {
      projectSaveHandle: sourceHandle,
      projectSaveHandleMeta: normalizeProjectSaveHandleMeta({
        fileName: `ignored-${sourceKind}.pixieedraw`,
        adapterId: V2_ADAPTER_ID,
        sourceProjectToken: `token-${sourceKind}`,
        handleKind: 'file-picker',
        permissionState: 'granted',
      }),
      projectSaveHandleState: 'bound',
    },
  });
  const result = await harness.exportRenderingModule.saveProjectAsPixieedraw({ announceStatus: false });
  assert.equal(result.saved, true);
  assert.equal(sourceHandleCounter.count, 0, `${sourceKind} source does not overwrite bound V2 handle`);
  assert.equal(harness.pickerCounter.count, 1, `${sourceKind} source falls back to new-file picker`);
  assert.equal(harness.autosaveCounter.count, 0, `${sourceKind} source ignores autosaveHandle`);
  assert.equal(harness.pendingCounter.count, 0, `${sourceKind} source ignores pendingAutosaveHandle`);
}

globalThis.console = originalConsole;
originalConsole.log('Phase 4-J-fix V2 overwrite checks passed.');
