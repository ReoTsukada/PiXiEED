import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const drawingPath = path.join(root, 'PiXiEEDrawDEV/assets/js/modules/canvas-drawing-workflow-utils.js');
const pointerPath = path.join(root, 'PiXiEEDrawDEV/assets/js/modules/canvas-pointer-workflow-utils.js');
const overlayPath = path.join(root, 'PiXiEEDrawDEV/assets/js/modules/canvas-overlay-workflow-utils.js');
const sharedApplyPath = path.join(root, 'PiXiEEDrawDEV/assets/js/modules/shared-project-draw-apply-utils.js');

globalThis.window = { PiXiEEDrawModules: {} };
vm.runInThisContext(fs.readFileSync(drawingPath, 'utf8'), { filename: drawingPath });

const drawing = window.PiXiEEDrawModules.canvasDrawingWorkflowUtils.createCanvasDrawingWorkflowUtils({});
assert.deepEqual(
  drawing.getCircleBounds({ x: 2, y: 2 }, { x: 6, y: 2 }),
  { start: { x: 2, y: 2 }, end: { x: 6, y: 6 } },
  'horizontal drag must create a circle instead of collapsing to one row',
);
assert.deepEqual(
  drawing.getCircleBounds({ x: 6, y: 6 }, { x: 6, y: 2 }),
  { start: { x: 6, y: 2 }, end: { x: 10, y: 6 } },
  'vertical reverse drag must create a circle instead of collapsing to one column',
);
assert.deepEqual(
  drawing.getCircleBounds({ x: 6, y: 2 }, { x: 2, y: 5 }),
  { start: { x: 2, y: 2 }, end: { x: 6, y: 6 } },
  'the longer axis must define the diameter while preserving drag direction',
);

const pointerSource = fs.readFileSync(pointerPath, 'utf8');
const overlaySource = fs.readFileSync(overlayPath, 'utf8');
const sharedApplySource = fs.readFileSync(sharedApplyPath, 'utf8');
assert.match(pointerSource, /const isCircleTool = tool === 'ellipse' \|\| tool === 'ellipseFill';[\s\S]*?event\.shiftKey \|\| isCircleTool/);
assert.match(overlaySource, /const span = Math\.max\(Math\.abs\(deltaX\), Math\.abs\(deltaY\)\)/);
assert.match(sharedApplySource, /const span = Math\.max\(Math\.abs\(deltaX\), Math\.abs\(deltaY\)\)/);

console.log('PiXiEEDrawDEV circle drag regression checks passed.');
