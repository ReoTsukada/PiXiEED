import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(
  new URL('../pixiedraw/assets/js/modules/export-planning-utils.js', import.meta.url),
  'utf8'
);
const context = {
  window: {},
  console,
  Math,
  Array,
  Map,
  Set,
  Number,
  String,
  Object,
  Uint8ClampedArray,
};
vm.runInNewContext(source, context, { filename: 'export-planning-utils.js' });

let fullFrameCompositeCalls = 0;
const planning = context.window.PiXiEEDrawModules.exportPlanningUtils.createExportPlanningUtils({
  MAX_EXPORT_DIMENSION: 16384,
  MAX_EXPORT_SCALE_OPTIONS: 8,
  state: {
    width: 512,
    height: 512,
    frames: Array.from({ length: 100 }, () => ({ layers: [] })),
    palette: [],
  },
  dom: { exportDialog: { format: { value: 'spritemap' } } },
  getExportColorSpritesEnabled: () => true,
  normalizeExportFormat: value => String(value || 'png'),
  shouldSaveSpriteMapCompanion: () => false,
  shouldAppendColorSpritesToPrimaryExport: () => false,
  compositeDocumentFrames: () => {
    fullFrameCompositeCalls += 1;
    throw new Error('dialog preview must not composite every frame');
  },
  buildColorSpriteExportPlanFromFramePixels: () => {
    throw new Error('dialog preview must not build color sprites');
  },
  normalizeColorValue: value => value,
  getPaletteColorKey: () => '',
});

const fast = planning.getExportScaleCandidates('spritemap');
assert.equal(fullFrameCompositeCalls, 0, 'SpriteMAP dialog planning must not composite all frames');
assert.equal(fast.columns, 10);
assert.equal(fast.rows, 10);
assert.equal(fast.sheetWidth, 5120);
assert.equal(fast.sheetHeight, 5120);

console.log('PiXiEEDraw export preview planning avoids all-frame compositing.');
