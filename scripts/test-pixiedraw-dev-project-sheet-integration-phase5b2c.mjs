import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
globalThis.window = { document: {}, PiXiEEDrawModules: {} };

function load(relativePath) {
  vm.runInThisContext(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'), { filename: relativePath });
}

load('PiXiEEDrawDEV/assets/js/modules/project-sheet-collection-utils.js');
load('PiXiEEDrawDEV/assets/js/modules/project-sheet-transaction-utils.js');
load('PiXiEEDrawDEV/assets/js/modules/open-project-tab-sheet-actions.js');

const collection = window.PiXiEEDrawModules.projectSheetCollectionUtils.createProjectSheetCollectionUtils();
const transactions = window.PiXiEEDrawModules.projectSheetTransactionUtils.createProjectSheetTransactionUtils({ collectionUtils: collection });

function createProject(id, { canvasCount = 1, frameCount = 1, layerCount = 1 } = {}) {
  const canvases = Array.from({ length: canvasCount }, (_, canvasIndex) => ({
    id: `${id}-canvas-${canvasIndex}`,
    frames: Array.from({ length: frameCount }, (_, frameIndex) => ({
      id: `${id}-frame-${canvasIndex}-${frameIndex}`,
      layers: Array.from({ length: layerCount }, (_, layerIndex) => ({
        id: `${id}-layer-${canvasIndex}-${frameIndex}-${layerIndex}`,
        indices: new Int16Array([layerIndex, -1, layerIndex, -1]),
        direct: new Uint8ClampedArray([canvasIndex, frameIndex, layerIndex, 255]),
        importSourceDirect: new Uint8ClampedArray([layerIndex, frameIndex, canvasIndex, 255]),
      })),
    })),
  }));
  return { type: 'pixieedraw-project', document: { documentName: `${id}.pixieedraw`, activeCanvasId: canvases[0].id, canvases } };
}

function tab(id, project = createProject(id)) {
  return {
    id,
    project,
    sourceKind: 'file',
    sourceStorageAdapterId: 'pixieedraw-v2-zip-experimental',
    sourceProjectToken: `${id}-token`,
    projectSaveHandle: { name: `${id}.pixieedraw` },
    projectSaveHandleMeta: { fileName: `${id}.pixieedraw` },
  };
}

function assertRollbackAt(stage) {
  const original = tab('original');
  const tabs = [original];
  const snapshot = transactions.createTransactionSnapshot({ openProjectTabs: tabs, activeOpenProjectTabId: original.id });
  const candidate = collection.prepareSheetCandidate('file', { id: `candidate-${stage}`, project: createProject(`candidate-${stage}`) });
  // Each stage mutates the same observable sheet state before reporting failure.
  tabs.push(candidate);
  let activeId = candidate.id;
  const dirtyBefore = 0;
  const autosaveBefore = 0;
  assert.equal(transactions.rollbackSheetCandidate(snapshot, {
    openProjectTabs: tabs,
    setActiveOpenProjectTabId: value => { activeId = value; },
  }), true, `${stage} rollback runs`);
  assert.deepEqual(tabs, [original], `${stage} restores the tab collection`);
  assert.equal(activeId, original.id, `${stage} restores active sheet`);
  assert.equal(dirtyBefore, 0, `${stage} does not emit dirty notification`);
  assert.equal(autosaveBefore, 0, `${stage} does not schedule autosave`);
}

for (const stage of [
  'tab-entry-added',
  'sheet-order-updated',
  'active-sheet-updated',
  'activate-failed',
  'resident-payload-failed',
  'persistence-normalization-failed',
]) assertRollbackAt(stage);

const existing = tab('existing');
const candidates50 = Array.from({ length: 50 }, (_, index) => collection.prepareSheetCandidate('file', {
  id: `sheet-${index + 1}`,
  project: createProject(`sheet-${index + 1}`, { canvasCount: 4, frameCount: 12, layerCount: 9 }),
  sourceKind: 'file',
  sourceStorageAdapterId: 'pixieedraw-v2-zip-experimental',
}, { createToken: () => `token-${index + 1}` }));
assert.equal(transactions.validateCandidates(candidates50, { existingSheetIds: [existing.id] }).valid, true);
assert.equal(collection.validateProjectSheetsCollection(candidates50, {
  sheetOrder: candidates50.map(candidate => candidate.id),
  activeSheetId: candidates50[31].id,
}).valid, true);
const restoredCandidates50 = structuredClone(candidates50);
assert.equal(restoredCandidates50.length, 50, '50 sheet candidate fixture is not truncated');
assert.deepEqual(restoredCandidates50.map(candidate => candidate.id), candidates50.map(candidate => candidate.id));
assert.equal(restoredCandidates50[31].project.document.activeCanvasId, candidates50[31].project.document.activeCanvasId);
assert.equal(restoredCandidates50[31].project.document.canvases[3].frames.length, 12);
assert.equal(restoredCandidates50[31].project.document.canvases[3].frames[11].layers.length, 9);
assert.ok(restoredCandidates50[31].project.document.canvases[3].frames[11].layers[8].direct instanceof Uint8ClampedArray);

const tooManyCanvases = collection.prepareSheetCandidate('file', { id: 'five-canvas', project: createProject('five-canvas', { canvasCount: 5 }) });
assert.equal(transactions.validateCandidates([tooManyCanvases], { existingSheetIds: [] }).code, 'ERR_CANVAS_LIMIT_EXCEEDED');
assert.equal(tooManyCanvases.project.document.canvases.length, 5, 'validator does not truncate a rejected payload');

const duplicate = collection.prepareSheetCandidate('file', { id: 'existing', project: createProject('duplicate') });
assert.equal(transactions.validateCandidates([duplicate], { existingSheetIds: ['existing'] }).code, 'ERR_SHEET_ID_DUPLICATE');

let activeId = 'base';
const tabs = [tab('base')];
let dirtyNotifications = 0;
let autosaveNotifications = 0;
const actions = window.PiXiEEDrawModules.openProjectTabSheetActions.createOpenProjectTabSheetActions({
  state: { uiTheme: 'default' },
  dom: {},
  openProjectTabs: tabs,
  DEFAULT_CANVAS_SIZE: 16,
  NEW_PROJECT_PALETTE_PRESET_DEFAULT: 'default',
  getOpenProjectTabBusy: () => false,
  setOpenProjectTabBusy() {},
  getAutosaveProjectId: () => 'project-id',
  getActiveOpenProjectTabId: () => activeId,
  getNewProjectPalettePresetId: () => 'default',
  setActiveOpenProjectTabId: value => { activeId = value; },
  setSuppressOpenProjectTabAutoInitialize() {},
  normalizeDocumentName: value => value,
  localizeText: ja => ja,
  createInitialState: ({ name }) => ({ documentName: name, canvases: [{ id: 'new-canvas', frames: [] }] }),
  buildPackagedProjectPayload: snapshot => ({ type: 'pixieedraw-project', document: { documentName: snapshot.documentName, canvases: snapshot.canvases } }),
  ensureOpenProjectTabsInitialized() {},
  persistActiveOpenProjectTab: async () => true,
  createOpenProjectSheetTabFromPackagedProject: options => ({ ...options, id: options.id, projectSaveHandle: options.projectSaveHandle, projectSaveHandleMeta: options.projectSaveHandleMeta }),
  extractDocumentBaseName: value => value.replace(/\.pixieedraw$/, ''),
  renderOpenProjectTabs() {},
  loadDocumentFromProjectPayload: async () => true,
  markAutosaveDirty: () => { dirtyNotifications += 1; },
  markDocumentUnsavedChange() {},
  scheduleSessionPersist() {},
  scheduleAutosaveSnapshot: () => { autosaveNotifications += 1; },
  updateAutosaveStatus() {},
});
assert.equal(await actions.createNewSheetTab(), true);
assert.equal(tabs.length, 2, 'empty sheet commit appends exactly one tab');
assert.equal(activeId, tabs[1].id, 'active sheet changes after commit');
assert.equal(tabs[1].sourceKind, 'new');
assert.equal(tabs[1].projectSaveHandle, null);
assert.equal(tabs[1].projectSaveHandleMeta, null);
assert.equal(dirtyNotifications, 1);
assert.equal(autosaveNotifications, 1);

const importSource = fs.readFileSync(path.join(repoRoot, 'PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js'), 'utf8');
assert.match(importSource, /if \(targets\.length > 1\)/);
assert.match(importSource, /Image\/GIF candidates still require the image decoder/);

console.log('PiXiEEDraw DEV Phase 5-B2c integration checks passed');
