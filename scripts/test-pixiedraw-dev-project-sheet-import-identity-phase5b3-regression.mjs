import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const importSource = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js'), 'utf8');

assert.match(importSource, /projectId: parentProjectId/);
assert.match(importSource, /project: candidate\.project, residentProjectLoaded: true, deferredRestore: false/);
assert.match(importSource, /createOpenProjectTabId\(\)/);
assert.match(importSource, /projectSaveHandleState: 'none'/);

globalThis.window = { PiXiEEDrawModules: {} };
vm.runInThisContext(fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/modules/project-sheet-collection-utils.js'), 'utf8'));
const collection = window.PiXiEEDrawModules.projectSheetCollectionUtils.createProjectSheetCollectionUtils();
const sourceProject = {
  document: {
    canvases: [{
      id: 'source-canvas',
      frames: [{ layers: [{ indices: new Int16Array([1, 2]), direct: new Uint8ClampedArray([1, 2, 3, 4]) }] }],
    }],
  },
};
const first = collection.prepareSheetCandidate('file', { id: 'import-a', project: sourceProject });
const second = collection.prepareSheetCandidate('file', { id: 'import-b', project: sourceProject });
assert.notEqual(first.project, sourceProject);
assert.notEqual(second.project, sourceProject);
assert.notEqual(first.project, second.project);
assert.notEqual(first.project.document.canvases[0].frames[0].layers[0].indices, sourceProject.document.canvases[0].frames[0].layers[0].indices);
first.project.document.canvases[0].frames[0].layers[0].indices[0] = 99;
assert.equal(sourceProject.document.canvases[0].frames[0].layers[0].indices[0], 1);
assert.equal(second.project.document.canvases[0].frames[0].layers[0].indices[0], 1);
assert.notEqual(first.sheetRuntimeId, second.sheetRuntimeId);
assert.notEqual(first.sheetPersistenceKey, second.sheetPersistenceKey);
assert.notEqual(first.historyOwnerId, second.historyOwnerId);
assert.notEqual(first.timelapseOwnerId, second.timelapseOwnerId);
assert.equal(first.projectSaveHandle, null);
assert.equal(first.projectSaveHandleMeta, null);

const importedTabs = [
  { id: first.id, projectId: 'current-project', project: first.project, residentProjectLoaded: true },
  { id: second.id, projectId: 'current-project', project: second.project, residentProjectLoaded: true },
];
assert.notEqual(importedTabs[0].id, importedTabs[1].id);
assert.ok(importedTabs.every(tab => tab.project && tab.residentProjectLoaded));
assert.equal(new Set(importedTabs.map(tab => tab.projectId)).size, 1, 'one current project collection owns imported sheets');
console.log('PiXiEEDraw DEV Phase 5-B3 imported sheet identity regression checks passed');
