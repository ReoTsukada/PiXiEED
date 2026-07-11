import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
globalThis.window = { PiXiEEDrawModules: {} };
const importSource = fs.readFileSync(path.join(repoRoot, 'PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js'), 'utf8');
vm.runInThisContext(importSource, { filename: 'open-import-workflow-utils.js' });
const importUtils = window.PiXiEEDrawModules.openImportWorkflowUtils.createOpenImportWorkflowUtils({});

assert.deepEqual(importUtils.getSheetAddPickerTypes('project')[0].accept['application/x-pixieedraw'], ['.pixieedraw']);
assert.deepEqual(importUtils.getSheetAddPickerTypes('image')[0].accept['image/png'], ['.png']);
assert.deepEqual(importUtils.getSheetAddPickerTypes('gif')[0].accept['image/gif'], ['.gif']);
assert.equal(importUtils.normalizeSheetAddKind('project'), 'project');
assert.equal(importUtils.normalizeSheetAddKind('image'), 'image');
assert.equal(importUtils.normalizeSheetAddKind('gif'), 'gif');
assert.equal(importUtils.normalizeSheetAddKind('unsupported'), '');

const sheetActionsSource = fs.readFileSync(path.join(repoRoot, 'PiXiEEDrawDEV/assets/js/modules/open-project-tab-sheet-actions.js'), 'utf8');
for (const label of ['空のシートを作成', 'プロジェクトをシートとして追加', '画像を追加', 'GIFを追加', '最近使ったプロジェクトから追加']) {
  assert.match(sheetActionsSource, new RegExp(label));
}
assert.match(sheetActionsSource, /event\.key !== 'Escape'/);
assert.match(sheetActionsSource, /document\.addEventListener\('pointerdown'/);
assert.match(sheetActionsSource, /openProjectSheetDialog/);
assert.match(sheetActionsSource, /openImageSheetDialog/);
assert.match(sheetActionsSource, /openGifSheetDialog/);
assert.match(sheetActionsSource, /appendRecentProjectAsSheets/);
assert.match(importSource, /async function appendRecentProjectAsSheets/);
assert.match(importSource, /projectSaveHandleState: 'none'/);
assert.match(importSource, /if \(targets\.length > 1\)/, 'multi-image/GIF safe rejection remains');

const addFunction = sheetActionsSource.slice(
  sheetActionsSource.indexOf('function openProjectTabAddPicker()'),
  sheetActionsSource.indexOf('function closeProjectTabAddMenu()')
);
assert.doesNotMatch(addFunction, /void createNewSheetTab\(\);/, 'plus click must open a menu before creating a sheet');

console.log('PiXiEEDraw DEV Phase 5-B3 sheet add menu checks passed');
