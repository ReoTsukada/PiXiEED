import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const rootDir = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
globalThis.window = { PiXiEEDrawModules: {} };

for (const relativePath of [
  'PiXiEEDrawDEV/assets/js/modules/project-sheet-collection-utils.js',
  'PiXiEEDrawDEV/assets/js/modules/project-sheet-transaction-utils.js',
]) {
  vm.runInThisContext(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'), { filename: relativePath });
}

const collection = window.PiXiEEDrawModules.projectSheetCollectionUtils.createProjectSheetCollectionUtils();
const transactions = window.PiXiEEDrawModules.projectSheetTransactionUtils.createProjectSheetTransactionUtils({ collectionUtils: collection });

function project(id, canvasCount = 1) {
  return {
    type: 'pixieedraw-project',
    document: {
      documentName: `${id}.pixieedraw`,
      canvases: Array.from({ length: canvasCount }, (_, index) => ({ id: `${id}-canvas-${index}`, frames: [], layers: [] })),
    },
  };
}

const existing = { id: 'existing', project: project('existing'), sourceKind: 'file' };
const manyCandidates = Array.from({ length: 25 }, (_, index) => collection.prepareSheetCandidate('file', {
  id: `import-${index}`,
  project: project(`import-${index}`),
  sourceKind: 'file',
}, { createToken: () => `token-${index}` }));
assert.equal(transactions.validateCandidates(manyCandidates, { existingSheetIds: [existing.id] }).valid, true);

const tooManyCanvases = collection.prepareSheetCandidate('file', { id: 'too-many', project: project('too-many', 5) });
assert.equal(transactions.validateCandidates([tooManyCanvases], { existingSheetIds: [existing.id] }).code, 'ERR_CANVAS_LIMIT_EXCEEDED');

const duplicate = collection.prepareSheetCandidate('file', { id: 'existing', project: project('duplicate') });
assert.equal(transactions.validateCandidates([duplicate], { existingSheetIds: [existing.id] }).code, 'ERR_SHEET_ID_DUPLICATE');

const tabs = [existing];
const snapshot = transactions.createTransactionSnapshot({ openProjectTabs: tabs, activeOpenProjectTabId: 'existing' });
tabs.push(manyCandidates[0]);
let activeId = manyCandidates[0].id;
assert.equal(transactions.rollbackSheetCandidate(snapshot, { openProjectTabs: tabs, setActiveOpenProjectTabId: id => { activeId = id; } }), true);
assert.deepEqual(tabs.map(tab => tab.id), ['existing']);
assert.equal(activeId, 'existing');

const candidate = collection.prepareSheetCandidate('new', { id: 'clean-new', project: project('clean-new') }, { createToken: () => 'new-token' });
assert.equal(candidate.projectSaveHandle, null);
assert.equal(candidate.projectSaveHandleMeta, null);
assert.equal(candidate.sourceKind, 'new');

console.log('PiXiEEDraw DEV Phase 5-B2b sheet transaction tests passed');
