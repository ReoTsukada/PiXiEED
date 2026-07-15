import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const journal = read('PiXiEEDrawDEV/assets/js/modules/local-project-journal-utils.js');
const autosave = read('PiXiEEDrawDEV/assets/js/modules/autosave-workflow-utils.js');
const packageWorkflow = read('PiXiEEDrawDEV/assets/js/modules/project-package-workflow-utils.js');

assert.match(journal, /if \(!hasSnapshot && !useCheckpoint && next\.checkpointPersisted/);
assert.match(journal, /journalOnly: true/);
assert.match(journal, /journalOnly: false/);

assert.match(autosave, /snapshot: null/);
assert.match(autosave, /const useV2Journal = Boolean\(/);
assert.match(autosave, /const journalOnly = useV2Journal \|\| \(!useV2Primary/);
assert.match(autosave, /if \(!useV2Journal \|\| syncDestination\) \{\s*ensureCurrentSnapshot\(\)/);
assert.match(autosave, /savePlan: usedV2Journal \? journalOnlySavePlan : activeSavePlan/);
assert.match(autosave, /usedV2Journal && !syncDestination/);
assert.match(autosave, /if \(!useV2Primary && !journalOnly\) \{\s*queueAutosaveV2ShadowWriteMeasured/);

assert.match(packageWorkflow, /savePlan: suppliedSavePlan = null/);
assert.match(packageWorkflow, /const journalOnlySave = suppliedSavePlan\?\.journalOnly === true/);
assert.match(packageWorkflow, /savePlan\?\.journalOnly === true \? previousEntry\?\.project \|\| null/);
assert.match(packageWorkflow, /!savePlan\?\.journalOnly\s*&& !skipThumbnail/);

const context = { console: { warn() {} }, window: { PiXiEEDrawModules: {} } };
vm.createContext(context);
vm.runInContext(journal, context, { filename: 'local-project-journal-utils.js' });
const journalUtils = context.window.PiXiEEDrawModules.localProjectJournalUtils.createLocalProjectJournalUtils({
  LOCAL_PROJECT_CHECKPOINT_HISTORY_INTERVAL: 30,
  PROJECT_PACKAGE_TYPE: 'pixieed-project-package',
  PROJECT_PACKAGE_VERSION: 1,
  DOCUMENT_FILE_VERSION: 1,
  DEFAULT_DOCUMENT_NAME: 'PiXiEEDraw',
  history: { past: [], future: [], limit: 30 },
  state: {},
  recentProjectsCache: new Map(),
  normalizeAutosaveProjectId: value => String(value || '').trim(),
  normalizeDocumentName: value => String(value || ''),
  extractDocumentBaseName: value => String(value || ''),
  createAutosaveProjectId: () => 'generated',
  snapshotFromParsedDocumentValue: () => null,
  serializeDocumentSnapshot: () => ({}),
  buildProjectSessionPayload: () => ({ historyLimit: 30 }),
  isPixelPatchHistoryEntry: () => true,
  getProjectCanvasDocuments: () => [],
  getActiveProjectCanvasDocument: () => null,
  getActiveOpenProjectTabId: () => '',
  findOpenProjectTabIndex: () => -1,
  openProjectTabs: [],
  getRecentProjectEntryFileName: () => 'test.pixieed',
  localizeText: value => value,
});
journalUtils.hydrateActiveStateFromRecentEntry({
  id: 'project-1',
  project: { type: 'pixieed-project-package', document: {} },
  projectJournal: { checkpointId: 'project-1:cp:1', checkpointSequence: 1, ops: [] },
});
journalUtils.noteHistoryEntry('project-1', { kind: 'pixel-patch' }, 'draw');
let fullPackageBuilds = 0;
let fullSessionBuilds = 0;
const plan = journalUtils.buildSavePlan({
  projectId: 'project-1',
  snapshot: null,
  buildPackagedProjectPayload: () => {
    fullPackageBuilds += 1;
    return { unexpected: true };
  },
  buildAutosaveSessionPayload: () => {
    fullSessionBuilds += 1;
    return { historyLimit: 30, timelapse: { byCanvas: { unexpected: true } } };
  },
});
assert.equal(plan?.journalOnly, true);
assert.equal(plan?.dirtyOpCount, 1);
assert.equal(fullPackageBuilds, 0, 'journal-only saves must not rebuild a full checkpoint package');
assert.equal(fullSessionBuilds, 0, 'journal-only saves must not serialize complete timelapse/session data');

const normalizedV2Ops = journalUtils.normalizeV2PixelPatchJournalOps({
  ops: [{
    kind: 'pixel-patch',
    historyEntry: {
      canvasId: 'canvas-1',
      frameId: 'frame-1',
      layerId: 'layer-1',
      changes: [{ index: 3, after: { paletteIndex: 1, direct: null, importSourceDirect: null } }],
    },
  }],
});
assert.deepEqual(JSON.parse(JSON.stringify(normalizedV2Ops)), [{
  sequence: 1,
  kind: 'pixel-patch',
  canvasId: 'canvas-1',
  frameId: 'frame-1',
  layerId: 'layer-1',
  changes: [{ index: 3, after: { paletteIndex: 1, direct: null, importSourceDirect: null } }],
}]);

for (let index = 1; index < 30; index += 1) {
  journalUtils.noteHistoryEntry('project-1', { kind: 'pixel-patch', index }, 'draw');
}
assert.equal(
  journalUtils.buildSavePlan({
    projectId: 'project-1',
    snapshot: null,
    buildPackagedProjectPayload: () => ({ unexpected: true }),
    buildAutosaveSessionPayload: () => ({ historyLimit: 30 }),
  }),
  null,
  '30 accumulated operations require a new checkpoint snapshot'
);
let checkpointBuilds = 0;
let checkpointSessionBuilds = 0;
const checkpointPlan = journalUtils.buildSavePlan({
  projectId: 'project-1',
  snapshot: { documentName: 'checkpoint' },
  buildPackagedProjectPayload: () => {
    checkpointBuilds += 1;
    return { type: 'pixieed-project-package', document: { documentName: 'checkpoint' } };
  },
  buildAutosaveSessionPayload: () => {
    checkpointSessionBuilds += 1;
    return { historyLimit: 30, timelapse: { byCanvas: {} } };
  },
});
assert.equal(checkpointBuilds, 1);
assert.equal(checkpointSessionBuilds, 1, 'checkpoint saves must retain complete session/timelapse packaging');
assert.equal(checkpointPlan?.dirtyOpCount, 0);
assert.equal(checkpointPlan?.journalPayload?.ops?.length, 0);

console.log('P-AUTOSAVE-1A local journal fast-path checks passed.');
