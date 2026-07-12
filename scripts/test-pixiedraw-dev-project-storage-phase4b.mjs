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

function createExportRenderingHarness({ flagEnabled = false } = {}) {
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
    documentName: 'phase4b-sample.pixieedraw',
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
  let handleCreateWritableCalls = 0;
  let markDocumentDurablySavedCalls = 0;
  let setTrackedProjectDotBaselineCalls = 0;

  globalThis.autosaveHandle = {
    async createWritable() {
      handleCreateWritableCalls += 1;
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
    openProjectTabs: [],
    getOpenProjectSheetCount() {
      return 1;
    },
    commitHistory() {},
    makeHistorySnapshot() {
      return snapshot;
    },
    buildProjectSessionPayload() {
      return session;
    },
    getExportFileNameBase() {
      return 'phase4b-sample.pixieedraw';
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
        blob: new Blob(['phase4b'], { type: PROJECT_FILE_MIME_TYPE }),
        filename: 'phase4b-sample.pixieedraw',
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
    createAutosaveFileName(name = 'phase4b-sample.pixieedraw') {
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
    async writeProjectBlobToNewHandle() {
      return false;
    },
  });

  return {
    consoleCapture,
    exportRenderingModule,
    serializedOptions,
    triggerCalls,
    statusCalls,
    get storeAutosaveHandleCalls() {
      return storeAutosaveHandleCalls;
    },
    get recentProjectCalls() {
      return recentProjectCalls;
    },
    get handleCreateWritableCalls() {
      return handleCreateWritableCalls;
    },
    get markDocumentDurablySavedCalls() {
      return markDocumentDurablySavedCalls;
    },
    get setTrackedProjectDotBaselineCalls() {
      return setTrackedProjectDotBaselineCalls;
    },
  };
}

const appSource = fs.readFileSync(
  path.join(repoRoot, 'PiXiEEDrawDEV/assets/js/app.js'),
  'utf8'
);
assert.match(appSource, /defaultAdapterId:\s*pixieeDrawV2ZipAdapter\?\.id\s*\|\|\s*pixieeDrawV1JsonAdapter\?\.id\s*\|\|\s*''/);
assert.match(appSource, /window\.__pixieedrawSetV2ProjectSaveEnabled/);
assert.match(appSource, /window\.__pixieedrawGetV2ProjectSaveStatus/);

const flagOffHarness = createExportRenderingHarness({ flagEnabled: false });
const flagOffResult = await flagOffHarness.exportRenderingModule.saveProjectAsPixieedraw({
  announceStatus: false,
});
assert.equal(flagOffResult.saved, true);
assert.equal(flagOffResult.storageAdapterId, V2_ADAPTER_ID);
assert.equal(flagOffHarness.serializedOptions[0]?.preferredAdapterId, V2_ADAPTER_ID);
assert.equal(flagOffHarness.handleCreateWritableCalls, 0);
assert.equal(flagOffHarness.storeAutosaveHandleCalls, 0);
assert.equal(flagOffHarness.recentProjectCalls, 0);
assert.equal(flagOffHarness.triggerCalls.length, 1);

const flagOnHarness = createExportRenderingHarness({ flagEnabled: true });
const flagOnResult = await flagOnHarness.exportRenderingModule.saveProjectAsPixieedraw({
  announceStatus: false,
});
assert.equal(flagOnResult.saved, true);
assert.equal(flagOnResult.storageAdapterId, V2_ADAPTER_ID);
assert.equal(flagOnHarness.serializedOptions[0]?.preferredAdapterId, V2_ADAPTER_ID);
assert.equal(flagOnHarness.handleCreateWritableCalls, 0);
assert.equal(flagOnHarness.storeAutosaveHandleCalls, 0);
assert.equal(flagOnHarness.recentProjectCalls, 0);
assert.equal(flagOnHarness.triggerCalls.length, 1);
assert.equal(flagOnHarness.triggerCalls[0]?.filename, 'phase4b-sample.pixieedraw');
assert.equal(flagOnHarness.markDocumentDurablySavedCalls, 1);
assert.equal(flagOnHarness.setTrackedProjectDotBaselineCalls, 1);
assert.ok(
  flagOnHarness.consoleCapture.info.some(entry => entry.includes('[PiXiEEDraw DEV] V2 project save flag enabled'))
);
assert.ok(
  flagOnHarness.consoleCapture.info.some(entry => entry.includes(`selected adapter id: ${V2_ADAPTER_ID}`))
);
assert.ok(
  flagOnHarness.consoleCapture.info.some(entry => entry.includes('save as new file: true'))
);
assert.ok(
  flagOnHarness.consoleCapture.info.some(entry => entry.includes('worker used: true'))
);

globalThis.console = originalConsole;
originalConsole.log('Phase 4-B DEV V2 project save flag checks passed.');
