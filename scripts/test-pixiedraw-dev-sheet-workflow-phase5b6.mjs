import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

globalThis.window = { PiXiEEDrawModules: {} };
vm.runInThisContext(read('PiXiEEDrawDEV/assets/js/modules/project-sheet-collection-utils.js'), {
  filename: 'project-sheet-collection-utils.js',
});

const collection = window.PiXiEEDrawModules.projectSheetCollectionUtils.createProjectSheetCollectionUtils();
const project = (id, canvasCount = 1) => ({
  document: {
    documentName: `${id}.pixieedraw`,
    activeCanvasId: `${id}-canvas-0`,
    canvases: Array.from({ length: canvasCount }, (_, index) => ({
      id: `${id}-canvas-${index}`,
      frames: [{ id: `${id}-frame-${index}`, layers: [{ id: `${id}-layer-${index}`, direct: new Uint8ClampedArray([index, 0, 0, 255]) }] }],
    })),
  },
});

for (const sheetCount of [20, 50]) {
  const sheets = Array.from({ length: sheetCount }, (_, index) => collection.prepareSheetCandidate('file', {
    id: `sheet-${index + 1}`,
    project: project(`sheet-${index + 1}`, 4),
    sourceKind: 'file',
    sourceStorageAdapterId: 'pixieedraw-v2-zip-experimental',
  }));
  const order = sheets.map(sheet => sheet.id);
  const activeSheetId = order[Math.floor(order.length / 2)];
  assert.equal(collection.validateProjectSheetsCollection(sheets, { sheetOrder: order, activeSheetId }).valid, true);
  assert.equal(structuredClone(sheets).length, sheetCount, `${sheetCount} sheets must not be truncated`);
  assert.equal(sheets.at(-1).project.document.canvases[3].frames[0].layers[0].direct[0], 3);
}

const fiveCanvasProject = project('five-canvas', 5);
assert.equal(collection.validateSheetCanvasCount(fiveCanvasProject).code, 'ERR_CANVAS_LIMIT_EXCEEDED');
assert.equal(fiveCanvasProject.document.canvases.length, 5, 'invalid input must never be truncated');

const sheetActions = read('PiXiEEDrawDEV/assets/js/modules/open-project-tab-sheet-actions.js');
for (const label of ['空のシートを作成', 'プロジェクトをシートとして追加', '画像を追加', 'GIFを追加', '最近使ったプロジェクトから追加']) {
  assert.match(sheetActions, new RegExp(label));
}
assert.match(sheetActions, /event\.key !== 'Escape'/);
assert.match(sheetActions, /document\.addEventListener\('pointerdown'/);
assert.doesNotMatch(sheetActions, /PiXiEELENS|PiXiEELens|\bQR\b/, 'sheet add menu must not contain PiXiEELENS or QR actions');

const workflow = read('PiXiEEDrawDEV/assets/js/modules/open-project-tab-workflow-utils.js');
assert.match(workflow, /function planProjectSheetRemoval/);
assert.match(workflow, /async function commitProjectSheetRemoval/);
assert.match(workflow, /async function rollbackProjectSheetRemoval/);
assert.match(workflow, /Deleted the last sheet and created a new empty sheet/);
assert.match(workflow, /markAutosaveDirty\(\);[\s\S]{0,200}scheduleAutosaveSnapshot\(\);/);

const canvasRuntime = read('PiXiEEDrawDEV/assets/js/modules/local-viewport-canvas-workflow-utils.js');
const canvasUi = read('PiXiEEDrawDEV/assets/js/modules/control-ui-utils.js');
const parsedDocument = read('PiXiEEDrawDEV/assets/js/modules/document-session-workflow-utils.js');
const archiveCodec = read('PiXiEEDrawDEV/assets/js/modules/project-storage-v2-archive-codec.js');
assert.match(canvasRuntime, /currentCanvases\.length >= 4/);
assert.match(canvasRuntime, /validateSheetCanvasCount/);
assert.match(canvasUi, /\$\{totalCanvasCount\} \/ 4/);
assert.match(canvasUi, /maximum 4/);
assert.match(parsedDocument, /ERR_CANVAS_LIMIT_EXCEEDED/);
assert.match(archiveCodec, /assertPackagedCanvasLimit\(packaged\)/);
assert.match(archiveCodec, /assertPackagedCanvasLimit\(restored\.packaged\)/);

const exportRendering = read('PiXiEEDrawDEV/assets/js/modules/export-rendering.js');
assert.match(exportRendering, /blocked incomplete multi-sheet V2 project save/);
assert.match(exportRendering, /return \{\s*saved: false,\s*cancelled: false,\s*blocked: true/s);
assert.match(exportRendering, /sheet-package-incomplete/);
assert.match(exportRendering, /include-sheets-disabled/);
assert.match(exportRendering, /multi-sheet-v2-incomplete/);

const appSource = read('PiXiEEDrawDEV/assets/js/app.js');
const autosaveWorkflow = read('PiXiEEDrawDEV/assets/js/modules/autosave-workflow-utils.js');
const autosaveBuilder = appSource.slice(
  appSource.indexOf('function buildAutosaveSchemaV2ExperimentalProjectState'),
  appSource.indexOf('function countAutosaveShadowProject')
);
assert.match(autosaveBuilder, /const sourceTabs = openProjectTabs\.length/);
assert.match(autosaveBuilder, /activeSheetId: activeSheetId/);
assert.match(autosaveBuilder, /sourceKind: tab\?\.sourceKind/);
assert.doesNotMatch(autosaveBuilder, /projectSaveHandle|autosaveHandle|pendingAutosaveHandle|FileSystemFileHandle/);
assert.match(autosaveWorkflow, /queueAutosaveV2ShadowWrite\?\.\(\{ projectId, snapshot, v1Project: savedEntry\.project \|\| null \}\)/);

console.log('PiXiEEDraw DEV Phase 5-B6 sheet workflow integration audit passed');
