import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../pixiedraw/assets/js/app.js', import.meta.url), 'utf8');
const rendering = fs.readFileSync(new URL('../pixiedraw/assets/js/modules/export-rendering.js', import.meta.url), 'utf8');
const dialog = fs.readFileSync(new URL('../pixiedraw/assets/js/modules/dialog-setup-utils.js', import.meta.url), 'utf8');
const dialogWorkflow = fs.readFileSync(new URL('../pixiedraw/assets/js/modules/export-dialog-workflow-utils.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../pixiedraw/index.html', import.meta.url), 'utf8');

assert.match(
  app,
  /buildExportPreviewSourceCanvas,\s*updateExportPreview,\s*createFrameCanvas,\s*canvasRegionToBlob,\s*scaleCanvasNearestNeighbor,/,
  'Grid PNG must receive canvasRegionToBlob from export-rendering'
);
assert.match(
  rendering,
  /updateExportPreview,\s*createFrameCanvas,\s*canvasRegionToBlob,\s*scaleCanvasNearestNeighbor,/,
  'export-rendering must publish canvasRegionToBlob'
);
const previewStart = rendering.indexOf('function buildExportPreviewSourceCanvas(format)');
const previewEnd = rendering.indexOf('\n  function updateExportPreview()', previewStart);
assert.ok(previewStart >= 0 && previewEnd > previewStart, 'export preview source builder must exist');
const previewSource = rendering.slice(previewStart, previewEnd);
assert.match(
  previewSource,
  /compositeFramePixelsForExportPreview\(/,
  'export preview must use the bounded representative-frame compositor'
);
assert.doesNotMatch(
  previewSource,
  /compositeDocumentFrames\(/,
  'export preview must not composite every animation frame'
);
assert.match(
  rendering,
  /function compositeFramePixelsForExportPreview[\s\S]{0,180}maxEdge = 256/,
  'export preview sampling must bound its source edge'
);
assert.match(rendering, /async function exportProjectAsAllFormatsZip\(\)/);
assert.match(rendering, /PNG・GIF・SVG・JPEG・SpriteMAP・PiXiEEDrawをZIPへまとめました/);
assert.match(index, /value="allzip"/, 'export dialog must expose the all formats ZIP choice');
assert.match(app, /async function exportProjectAsAllFormatsZip\(\.\.\.args\)/);
assert.match(app, /get exportProjectAsAllFormatsZip\(\) \{ return exportProjectAsAllFormatsZip; \}/);
assert.match(dialogWorkflow, /normalized === 'allzip'[\s\S]{0,100}await exportProjectAsAllFormatsZip\(\)/);

const refreshThenDuplicatePreview = /refreshExportScaleControls\(\);[\s\S]{0,180}updateExportPreview\(\);/g;
assert.equal(
  [...dialog.matchAll(refreshThenDuplicatePreview)].length,
  0,
  'change handlers must not rebuild the same preview twice'
);
assert.match(index, /export-rendering\.js\?v=20260719-export-bundle1/);
assert.match(index, /dialog-setup-utils\.js\?v=20260719-export-preview-once1/);
assert.match(index, /app\.js\?v=20260719-113/);

console.log('PiXiEEDraw export runtime wiring and preview-cost checks passed');
