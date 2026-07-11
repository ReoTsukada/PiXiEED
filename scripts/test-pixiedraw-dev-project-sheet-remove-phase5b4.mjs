import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
globalThis.window = { PiXiEEDrawModules: {} };
vm.runInThisContext(
  fs.readFileSync(path.join(repoRoot, 'PiXiEEDrawDEV/assets/js/modules/open-project-tab-workflow-utils.js'), 'utf8'),
  { filename: 'open-project-tab-workflow-utils.js' }
);

function project(id, pixels = [1, 2, 3, 255]) {
  return {
    type: 'pixieedraw-project',
    document: {
      documentName: `${id}.pixieedraw`,
      canvases: [{ id: `${id}-canvas`, frames: [{ id: `${id}-frame`, layers: [{ id: `${id}-layer`, direct: new Uint8ClampedArray(pixels) }] }] }],
    },
    session: { historyPast: [{ id: `${id}-history` }], timelapse: { enabled: true, byCanvas: { [`${id}-canvas`]: {} } } },
  };
}

function tab(id, { handle = true } = {}) {
  return {
    id,
    projectId: 'project-id',
    project: project(id),
    sourceKind: 'file',
    sourceStorageAdapterId: 'pixieedraw-v2-zip-experimental',
    sourceProjectToken: `${id}-token`,
    projectSaveHandleState: handle ? 'bound' : 'none',
    projectSaveHandle: handle ? { name: `${id}.pixieedraw` } : null,
    projectSaveHandleMeta: handle ? { fileName: `${id}.pixieedraw` } : null,
  };
}

function setup({ tabs = [tab('a'), tab('b'), tab('c')], activeId = 'a', activate = null, replacement = null } = {}) {
  let currentActiveId = activeId;
  let dirty = 0;
  let autosave = 0;
  let sessionPersist = 0;
  let activationOptions = null;
  const scope = {
    openProjectTabs: tabs,
    openProjectTabBusy: false,
    projectHomeVisible: false,
    autosaveProjectId: 'project-id',
    findOpenProjectTabIndex: id => tabs.findIndex(item => item.id === id),
    normalizeAutosaveProjectId: value => value,
    localizeText: ja => ja,
    renderOpenProjectTabs() {},
    loadDocumentFromProjectPayload: async () => true,
    activateOpenProjectTab: async (id, options) => {
      activationOptions = options || null;
      if (activate) return await activate(id, value => { currentActiveId = value; }, options);
      currentActiveId = id;
      return true;
    },
    activateProjectSheetForRemoval: async (id, options) => {
      activationOptions = options || null;
      if (activate) return await activate(id, value => { currentActiveId = value; }, options);
      currentActiveId = id;
      return true;
    },
    createReplacementEmptySheetTab: async () => replacement || {
      id: 'replacement', projectId: 'project-id', project: project('replacement', [0, 0, 0, 0]), sourceKind: 'new',
      sourceStorageAdapterId: null, sourceProjectToken: 'replacement-token', lastSavedStorageAdapterId: null,
      projectSaveHandleState: 'none', projectSaveHandle: null, projectSaveHandleMeta: null, unsaved: true,
    },
    markAutosaveDirty: () => { dirty += 1; },
    markDocumentUnsavedChange() {},
    scheduleSessionPersist: () => { sessionPersist += 1; },
    scheduleAutosaveSnapshot: () => { autosave += 1; },
    updateAutosaveStatus() {},
  };
  Object.defineProperty(scope, 'activeOpenProjectTabId', {
    get: () => currentActiveId,
    set: value => { currentActiveId = value; },
    enumerable: true,
  });
  const utils = window.PiXiEEDrawModules.openProjectTabWorkflowUtils.createOpenProjectTabWorkflowUtils(scope);
  return {
    utils,
    tabs,
    getActiveId: () => currentActiveId,
    getActivationOptions: () => activationOptions,
    counts: () => ({ dirty, autosave, sessionPersist }),
  };
}

let test = setup({ activeId: 'a' });
let plan = test.utils.planProjectSheetRemoval('b');
assert.equal(plan.wasActive, false);
assert.equal(await test.utils.commitProjectSheetRemoval(plan), true);
assert.deepEqual(test.tabs.map(item => item.id), ['a', 'c']);
assert.equal(test.getActiveId(), 'a');
assert.deepEqual(test.counts(), { dirty: 1, autosave: 1, sessionPersist: 1 });

test = setup({ activeId: 'b' });
plan = test.utils.planProjectSheetRemoval('b');
assert.equal(plan.nextActiveSheetId, 'c', 'active deletion chooses the right neighbor first');
assert.equal(await test.utils.commitProjectSheetRemoval(plan), true);
assert.deepEqual(test.tabs.map(item => item.id), ['a', 'c']);
assert.equal(test.getActiveId(), 'c');
assert.equal(typeof test.getActivationOptions()?.commandOwner, 'symbol', 'active deletion reuses its owned busy command');
assert.equal(test.getActivationOptions()?.skipBusyGuard, undefined, 'removal does not broadly bypass the busy guard');

test = setup({ tabs: [tab('a'), tab('b')], activeId: 'b' });
plan = test.utils.planProjectSheetRemoval('b');
assert.equal(plan.nextActiveSheetId, 'a', 'active deletion falls back to the left neighbor');
assert.equal(await test.utils.commitProjectSheetRemoval(plan), true);
assert.deepEqual(test.tabs.map(item => item.id), ['a']);
assert.equal(test.getActiveId(), 'a');

test = setup({ tabs: [tab('last')], activeId: 'last' });
plan = test.utils.planProjectSheetRemoval('last');
assert.equal(plan.isLastSheet, true);
assert.equal(await test.utils.commitProjectSheetRemoval(plan), true);
assert.deepEqual(test.tabs.map(item => item.id), ['replacement']);
assert.equal(test.getActiveId(), 'replacement');
assert.equal(test.tabs[0].sourceKind, 'new');
assert.equal(test.tabs[0].sourceStorageAdapterId, null);
assert.equal(test.tabs[0].projectSaveHandleState, 'none');
assert.equal(test.tabs[0].projectSaveHandle, null);
assert.notDeepEqual(Array.from(test.tabs[0].project.document.canvases[0].frames[0].layers[0].direct), [1, 2, 3, 255]);

test = setup({ activeId: 'b', activate: async () => false });
plan = test.utils.planProjectSheetRemoval('b');
assert.equal(await test.utils.commitProjectSheetRemoval(plan), false);
assert.deepEqual(test.tabs.map(item => item.id), ['a', 'b', 'c']);
assert.equal(test.getActiveId(), 'b');
assert.deepEqual(test.counts(), { dirty: 0, autosave: 0, sessionPersist: 0 });

const failing = setup({ tabs: [tab('last')], activeId: 'last', replacement: { id: '', project: null } });
plan = failing.utils.planProjectSheetRemoval('last');
assert.equal(await failing.utils.commitProjectSheetRemoval(plan), false);
assert.deepEqual(failing.tabs.map(item => item.id), ['last']);
assert.equal(failing.getActiveId(), 'last');
assert.deepEqual(failing.counts(), { dirty: 0, autosave: 0, sessionPersist: 0 });

for (const sheetCount of [20, 50]) {
  const manyTabs = Array.from({ length: sheetCount }, (_, index) => tab(`sheet-${index + 1}`));
  const targetIndex = Math.floor(sheetCount / 2);
  const targetId = manyTabs[targetIndex].id;
  const many = setup({ tabs: manyTabs, activeId: targetId });
  plan = many.utils.planProjectSheetRemoval(targetId);
  assert.equal(await many.utils.commitProjectSheetRemoval(plan), true);
  assert.equal(many.tabs.length, sheetCount - 1, `${sheetCount} sheet removal does not truncate remaining sheets`);
  assert.equal(many.tabs.some(item => item.id === targetId), false);
  assert.equal(many.getActiveId(), `sheet-${targetIndex + 2}`, 'right neighbor remains selected');
}

const source = fs.readFileSync(path.join(repoRoot, 'PiXiEEDrawDEV/assets/js/modules/open-project-tab-workflow-utils.js'), 'utf8');
assert.match(source, /function planProjectSheetRemoval/);
assert.match(source, /async function commitProjectSheetRemoval/);
assert.match(source, /async function rollbackProjectSheetRemoval/);
assert.match(source, /createRemoveProjectSheetCommandOwner/);
assert.match(source, /commandOwner,/);
assert.match(source, /const reusesBusyLock = Boolean/);
assert.match(source, /Deleted the last sheet and created a new empty sheet/);

console.log('PiXiEEDraw DEV Phase 5-B4 sheet removal checks passed');
