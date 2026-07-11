import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
globalThis.window = { PiXiEEDrawModules: {} };
vm.runInThisContext(fs.readFileSync(path.join(repoRoot, 'PiXiEEDrawDEV/assets/js/modules/project-sheet-collection-utils.js'), 'utf8'));
const collection = window.PiXiEEDrawModules.projectSheetCollectionUtils.createProjectSheetCollectionUtils();

function project(id, canvasCount) {
  return { document: { documentName: id, canvases: Array.from({ length: canvasCount }, (_, index) => ({ id: `${id}-${index}`, frames: [] })) } };
}

for (const count of [1, 2, 3, 4]) {
  assert.equal(collection.validateSheetCanvasCount(project(`canvas-${count}`, count)).valid, true);
}
const rejected = collection.validateSheetCanvasCount(project('canvas-5', 5));
assert.equal(rejected.valid, false);
assert.equal(rejected.code, 'ERR_CANVAS_LIMIT_EXCEEDED');
assert.equal(project('canvas-5', 5).document.canvases.length, 5, 'rejection does not truncate canvases');

const localCanvasSource = fs.readFileSync(path.join(repoRoot, 'PiXiEEDrawDEV/assets/js/modules/local-viewport-canvas-workflow-utils.js'), 'utf8');
assert.match(localCanvasSource, /currentCanvases\.length >= 4/);
assert.match(localCanvasSource, /ERR_CANVAS_LIMIT_EXCEEDED|最大4件/);
assert.match(localCanvasSource, /validateSheetCanvasCount/);
const controlUiSource = fs.readFileSync(path.join(repoRoot, 'PiXiEEDrawDEV/assets/js/modules/control-ui-utils.js'), 'utf8');
assert.match(controlUiSource, /\$\{totalCanvasCount\} \/ 4/);
assert.match(controlUiSource, /maximum 4/);
const sessionSource = fs.readFileSync(path.join(repoRoot, 'PiXiEEDrawDEV/assets/js/modules/document-session-workflow-utils.js'), 'utf8');
assert.match(sessionSource, /ERR_CANVAS_LIMIT_EXCEEDED/);
const codecSource = fs.readFileSync(path.join(repoRoot, 'PiXiEEDrawDEV/assets/js/modules/project-storage-v2-archive-codec.js'), 'utf8');
assert.match(codecSource, /assertPackagedCanvasLimit\(packaged\)/);
assert.match(codecSource, /assertPackagedCanvasLimit\(restored\.packaged\)/);

console.log('PiXiEEDraw DEV Phase 5-B5 canvas limit checks passed');
