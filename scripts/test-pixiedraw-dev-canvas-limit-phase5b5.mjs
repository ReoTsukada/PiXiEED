import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
globalThis.window = { PiXiEEDrawModules: {} };
vm.runInThisContext(fs.readFileSync(path.join(repoRoot, 'PiXiEEDrawDEV/assets/js/modules/project-canvas-validation-utils.js'), 'utf8'));
const validator = window.PiXiEEDrawModules.projectCanvasValidationUtils.createProjectCanvasValidationUtils();

function project(id, canvasCount) {
  return { document: { documentName: id, canvases: Array.from({ length: canvasCount }, (_, index) => ({ id: `${id}-${index}`, frames: [] })) } };
}

assert.equal(validator.validateCanvasCount(project('canvas-1', 1)).valid, true);
const rejected = validator.validateCanvasCount(project('canvas-2', 2));
assert.equal(rejected.valid, false);
assert.equal(rejected.code, 'ERR_CANVAS_LIMIT_EXCEEDED');
assert.equal(project('canvas-2', 2).document.canvases.length, 2, 'rejection does not truncate canvases');
for (const count of [1, 2, 3, 4]) {
  assert.equal(
    validator.validateCanvasCount(project(`legacy-${count}`, count), { maximum: 4 }).valid,
    true,
    'legacy input remains readable for split migration'
  );
}

const localCanvasSource = fs.readFileSync(path.join(repoRoot, 'PiXiEEDrawDEV/assets/js/modules/local-viewport-canvas-workflow-utils.js'), 'utf8');
assert.match(localCanvasSource, /真V2で編集できるキャンバスは1件/);
assert.match(localCanvasSource, /validateCanvasCount/);
const sessionSource = fs.readFileSync(path.join(repoRoot, 'PiXiEEDrawDEV/assets/js/modules/document-session-workflow-utils.js'), 'utf8');
assert.match(sessionSource, /ERR_CANVAS_LIMIT_EXCEEDED/);
assert.match(sessionSource, /maximum: 4/);
const codecSource = fs.readFileSync(path.join(repoRoot, 'PiXiEEDrawDEV/assets/js/modules/project-storage-v2-archive-codec.js'), 'utf8');
assert.match(codecSource, /assertPackagedCanvasLimit\(packaged\)/);
assert.match(codecSource, /assertPackagedCanvasLimit\(restored\.packaged\)/);

console.log('PiXiEEDraw DEV Phase 5-B5 canvas limit checks passed');
