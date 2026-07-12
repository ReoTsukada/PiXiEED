import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const journal = read('PiXiEEDrawDEV/assets/js/modules/local-project-journal-utils.js');
const autosave = read('PiXiEEDrawDEV/assets/js/modules/autosave-workflow-utils.js');
const packageWorkflow = read('PiXiEEDrawDEV/assets/js/modules/project-package-workflow-utils.js');

assert.match(journal, /if \(!hasSnapshot && !useCheckpoint && next\.checkpointProject/);
assert.match(journal, /journalOnly: true/);
assert.match(journal, /journalOnly: false/);

assert.match(autosave, /snapshot: null/);
assert.match(autosave, /const journalOnly = journalOnlySavePlan\?\.journalOnly === true/);
assert.match(autosave, /if \(!journalOnly\) \{\s*snapshot = makeHistorySnapshot/);
assert.match(autosave, /savePlan: journalOnlySavePlan/);
assert.match(autosave, /if \(!journalOnly\) \{\s*queueAutosaveV2ShadowWriteMeasured/);

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
const plan = journalUtils.buildSavePlan({
  projectId: 'project-1',
  snapshot: null,
  buildPackagedProjectPayload: () => {
    fullPackageBuilds += 1;
    return { unexpected: true };
  },
  buildAutosaveSessionPayload: () => ({ historyLimit: 30 }),
});
assert.equal(plan?.journalOnly, true);
assert.equal(plan?.dirtyOpCount, 1);
assert.equal(fullPackageBuilds, 0, 'journal-only saves must not rebuild a full checkpoint package');

console.log('P-AUTOSAVE-1A local journal fast-path checks passed.');
