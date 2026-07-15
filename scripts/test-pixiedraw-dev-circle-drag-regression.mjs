import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const drawingPath = path.join(root, 'PiXiEEDrawDEV/assets/js/modules/canvas-drawing-workflow-utils.js');
const productionDrawingPath = path.join(root, 'pixiedraw/assets/js/modules/canvas-drawing-workflow-utils.js');
const pointerPath = path.join(root, 'PiXiEEDrawDEV/assets/js/modules/canvas-pointer-workflow-utils.js');
const overlayPath = path.join(root, 'PiXiEEDrawDEV/assets/js/modules/canvas-overlay-workflow-utils.js');
const sharedApplyPath = path.join(root, 'PiXiEEDrawDEV/assets/js/modules/shared-project-draw-apply-utils.js');

globalThis.window = { PiXiEEDrawModules: {} };
const drawingSource = fs.readFileSync(drawingPath, 'utf8');
const productionDrawingSource = fs.readFileSync(productionDrawingPath, 'utf8');
vm.runInThisContext(drawingSource, { filename: drawingPath });

const drawing = window.PiXiEEDrawModules.canvasDrawingWorkflowUtils.createCanvasDrawingWorkflowUtils({});
const extractCircleImplementation = source => source.slice(
  source.indexOf('  function drawEllipse(start, end, filled) {'),
  source.indexOf('  const FILL_DITHER_BAYER_4'),
);
assert.equal(
  extractCircleImplementation(drawingSource),
  extractCircleImplementation(productionDrawingSource),
  'DEV circle rasterization must remain identical to production PiXiEEDraw',
);

const outlinePixels = [];
assert.doesNotThrow(() => {
  drawing.drawEllipsePixels(0, 0, 32, 32, false, (x, y) => {
    assert.equal(Number.isFinite(x), true);
    assert.equal(Number.isFinite(y), true);
    outlinePixels.push(`${x},${y}`);
  });
}, 'production-compatible circle outline generation must not throw');
assert.ok(outlinePixels.length > 16, 'circle outline must contain a usable set of pixels');
assert.ok(outlinePixels.length < 512, 'circle outline generation must remain bounded');

const rectangularBoundsPixels = [];
drawing.drawEllipsePixels(0, 0, 40, 20, false, (x, y) => rectangularBoundsPixels.push({ x, y }));
assert.equal(Math.min(...rectangularBoundsPixels.map(point => point.x)), 10);
assert.equal(Math.max(...rectangularBoundsPixels.map(point => point.x)), 30);
assert.equal(Math.min(...rectangularBoundsPixels.map(point => point.y)), 0);
assert.equal(Math.max(...rectangularBoundsPixels.map(point => point.y)), 20);

const pointerSource = fs.readFileSync(pointerPath, 'utf8');
const overlaySource = fs.readFileSync(overlayPath, 'utf8');
const sharedApplySource = fs.readFileSync(sharedApplyPath, 'utf8');
assert.doesNotMatch(pointerSource, /const isCircleTool =/);
assert.match(pointerSource, /if \(event\.shiftKey\) \{/);
assert.doesNotMatch(overlaySource, /const span = Math\.max\(Math\.abs\(deltaX\), Math\.abs\(deltaY\)\)/);
assert.match(overlaySource, /const x0 = Math\.min\(start\.x, end\.x\);[\s\S]*?drawEllipsePixels\(x0, y0, x1, y1, filled/);
assert.match(sharedApplySource, /drawEllipsePixels\(start\.x, start\.y, end\.x, end\.y, Boolean\(command\.filled\), plotPoint\)/);

console.log('PiXiEEDrawDEV production-compatible circle regression checks passed.');
