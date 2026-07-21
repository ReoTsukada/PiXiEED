import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../pixiedraw/assets/js/app.js', import.meta.url), 'utf8');
const rendering = fs.readFileSync(new URL('../pixiedraw/assets/js/modules/export-rendering.js', import.meta.url), 'utf8');
const dialog = fs.readFileSync(new URL('../pixiedraw/assets/js/modules/dialog-setup-utils.js', import.meta.url), 'utf8');
const dialogWorkflow = fs.readFileSync(new URL('../pixiedraw/assets/js/modules/export-dialog-workflow-utils.js', import.meta.url), 'utf8');
const normalizer = fs.readFileSync(new URL('../pixiedraw/assets/js/modules/export-normalizer-utils.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../pixiedraw/index.html', import.meta.url), 'utf8');
const staticConfig = fs.readFileSync(new URL('../pixiedraw/assets/js/modules/ui-static-config.js', import.meta.url), 'utf8');
const importer = fs.readFileSync(new URL('../pixiedraw/assets/js/modules/open-import-workflow-utils.js', import.meta.url), 'utf8');
const documentUtils = fs.readFileSync(new URL('../pixiedraw/assets/js/modules/document-utils.js', import.meta.url), 'utf8');
const archiveCodec = fs.readFileSync(new URL('../pixiedraw/assets/js/modules/project-storage-v2-archive-codec.js', import.meta.url), 'utf8');
const v2Adapter = fs.readFileSync(new URL('../pixiedraw/assets/js/modules/project-storage-v2-zip-adapter.js', import.meta.url), 'utf8');

assert.match(staticConfig, /const PROJECT_FILE_EXTENSION = '\.pxd'/, 'new PiXiEEDraw project saves must use .pxd');
assert.match(staticConfig, /const PROJECT_FILE_MIME_TYPE = 'application\/x-pixieed-pxd'/, 'new PXD projects must use the PXD MIME type');
assert.match(importer, /'application\/x-pixieed-pxd': \['\.pxd'\]/, 'the importer must accept PXD files');
assert.match(importer, /'application\/x-pixieedraw': \['\.pixieedraw', '\.pxdraw'\]/, 'the importer must retain legacy project extension compatibility');
assert.match(documentUtils, /'\.pixieedraw'/, 'document name cleanup must retain legacy extension compatibility');
assert.match(v2Adapter, /const ADAPTER_ID = 'pxd-v2-zip'/, 'PXD must be the only normal V2 writer');
assert.match(archiveCodec, /format: 'pxd'/, 'new true-V2 archives must carry the PXD manifest format');
assert.match(archiveCodec, /\['pxd', 'pixieedraw'\]\.includes\(archiveFormat\)/, 'the true-V2 reader must retain legacy V2 archive compatibility');

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
assert.match(
  app,
  /get getStoredRasterLayerPaletteIndex\(\) \{ return getStoredRasterLayerPaletteIndex; \},[\s\S]{0,300}get getExportFileNameBase/,
  'playback/export compositor must receive the runtime Uint8 palette-index reader'
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
assert.match(rendering, /async function exportProjectAsAllFormatsZip\(\{ selectedFormats = null \} = \{\}\)/);
assert.match(rendering, /ALL_ZIP_EXPORT_FORMATS = Object\.freeze\(\['png', 'gif', 'svg', 'jpeg', 'spritemap', 'gridpng', 'project'\]\)/);
assert.match(index, /value="allzip"/, 'export dialog must retain the all formats ZIP compatibility value');
assert.match(index, /data-export-format-choice="png"/, 'export dialog must expose a PNG format pad');
assert.match(index, /data-export-format-choice="spritemap"/, 'export dialog must expose a SpriteMAP format pad');
assert.match(index, /data-export-format-choice="gridpng"/, 'export dialog must expose a fixed-size Grid PNG format pad');
assert.match(index, /data-export-format-choice="project"/, 'export dialog must expose a PiXiEEDraw format pad');
assert.match(index, /id="exportPreviewOutputs"/, 'export dialog must show the files that will be placed beside the preview');
assert.match(index, /id="exportFormatHelpButton"/, 'export dialog must provide format help');
assert.match(index, /data-export-scale-choice="1"/, 'export dialog must provide a ×1 output pad');
assert.match(index, /value="batchzip"/, 'export dialog must retain the selected formats ZIP value');
assert.match(normalizer, /normalized === 'batchzip'[\s\S]{0,100}return 'batchzip'/, 'shared export format normalization must preserve selected ZIP mode');
assert.match(rendering, /function getSelectedBatchZipFormats\(\)/, 'selected ZIP must read the active format choices');
assert.match(rendering, /choice\.getAttribute\('aria-pressed'\) === 'true'/, 'selected ZIP must read multiple active format pads');
assert.match(rendering, /forceZip: true/, 'a selected ZIP with one format must still be delivered as a ZIP');
assert.match(app, /async function exportProjectAsAllFormatsZip\(\.\.\.args\)/);
assert.match(app, /get exportProjectAsAllFormatsZip\(\) \{ return exportProjectAsAllFormatsZip; \}/);
assert.match(
  app,
  /get rollbackPixelPatchHistoryPending\(\) \{ return rollbackPixelPatchHistoryPending; \}/,
  'history rollback must receive the pending pixel-patch rollback helper'
);
assert.match(dialogWorkflow, /normalized === 'allzip'[\s\S]{0,100}await exportProjectAsAllFormatsZip\(\)/);
assert.match(dialogWorkflow, /normalized === 'batchzip'[\s\S]{0,220}selectedFormats: Array\.isArray\(selectedFormats\) \? selectedFormats : getSelectedBatchZipFormats\(\)/);
assert.match(dialog, /const getSelectedExportFormatsSnapshot = \(\) =>/, 'selected export pads must be snapshotted before the dialog closes');
assert.match(dialog, /exportProjectAsAllFormatsZip\(\{ selectedFormats \}\)/, 'batch ZIP must use its exact selected formats through deferred export');
assert.match(app, /exportProjectAsAllFormatsZip: \(\.\.\.args\) => exportProjectAsAllFormatsZip\(\.\.\.args\)/, 'dialog setup must receive the ZIP exporter directly');
assert.match(dialogWorkflow, /performExportByMode\(mode, \{ selectedFormats = null \} = \{\}\)/, 'export execution must accept the selected-format snapshot');
assert.match(dialogWorkflow, /normalized === 'spritemap'[\s\S]{0,100}await exportProjectAsSpriteMap\(\)/);
assert.match(dialogWorkflow, /normalized === 'gridpng'[\s\S]{0,100}await exportProjectAsGridPng\(\)/, 'Grid PNG pad must route to fixed-size grid export');
assert.match(dialog, /config\.formatChoices/, 'format pads must be wired to the export select');
assert.match(dialog, /config\.format\.dispatchEvent\(new Event\('change'/, 'format pad activation must refresh export state');

const refreshThenDuplicatePreview = /refreshExportScaleControls\(\);[\s\S]{0,180}updateExportPreview\(\);/g;
assert.equal(
  [...dialog.matchAll(refreshThenDuplicatePreview)].length,
  0,
  'change handlers must not rebuild the same preview twice'
);
assert.match(rendering, /function renderExportPreviewOutputs\(mode, previewData = null\)/, 'preview must render a compact card for every selected output');
assert.match(rendering, /function createExportPreviewOutputVisual\(card, previewData\)/, 'output cards must use lightweight real-content thumbnails');
assert.match(rendering, /add\('PiXiEEDraw', '\.pxd 編集データ'/, 'project export must be named as a .pxd file in the preview');
assert.match(rendering, /add\('SpriteMAP', '全フレームを PNG ×1 で配置'/, 'SpriteMAP preview must state its fixed ×1 placement');
assert.match(index, /export-rendering\.js\?v=20260721-runtime-index8-output1/);
assert.match(index, /dialog-setup-utils\.js\?v=20260720-export-batch-direct1/);
assert.match(index, /export-dialog-workflow-utils\.js\?v=20260720-export-batch-snapshot1/);
assert.match(index, /export-normalizer-utils\.js\?v=20260720-export-batchzip1/);
assert.match(index, /app\.js\?v=20260721-117/);

console.log('PiXiEEDraw export runtime wiring and preview-cost checks passed');
