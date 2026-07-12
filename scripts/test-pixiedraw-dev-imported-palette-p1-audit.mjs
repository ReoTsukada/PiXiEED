import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const helperPath = new URL('../PiXiEEDrawDEV/assets/js/modules/imported-palette-planning-utils.js', import.meta.url);
const colorCodecPath = new URL('../PiXiEEDrawDEV/assets/js/modules/color-codec-utils.js', import.meta.url);
const importPath = new URL('../PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js', import.meta.url);
const panelPath = new URL('../PiXiEEDrawDEV/assets/js/modules/palette-panel-utils.js', import.meta.url);

const context = { Uint8Array, Uint8ClampedArray, Int16Array, Int32Array, ArrayBuffer, window: { PiXiEEDrawModules: {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(helperPath, 'utf8'), context, { filename: 'imported-palette-planning-utils.js' });
vm.runInContext(fs.readFileSync(colorCodecPath, 'utf8'), context, { filename: 'color-codec-utils.js' });
const { extractUsedRgbaColors, buildImportedPalettePlan } = context.window.PiXiEEDrawModules.importedPalettePlanningUtils.createImportedPalettePlanningUtils();
const { quantizeRgbaColorEntriesWithMapping } = context.window.PiXiEEDrawModules.colorCodecUtils.createColorCodecUtils({
  clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  MAX_IMPORTED_PALETTE_COLORS: 256,
});

const pixels = values => new Uint8ClampedArray(values);
const truecolor = {
  frames: [{ imageData: { data: pixels([
    255, 0, 0, 255,
    255, 0, 0, 255,
    255, 0, 0, 128,
    99, 88, 77, 0,
    0, 1, 2, 0,
  ]) } }],
};
const extracted = extractUsedRgbaColors(truecolor);
assert.equal(extracted.totalUniqueColorCount, 2);
assert.equal(extracted.opaqueColorCount, 1);
assert.equal(extracted.semiTransparentColorCount, 1);
assert.equal(extracted.transparentPixelCount, 2);
assert.deepEqual(Array.from(extracted.colors, color => [color.r, color.g, color.b, color.a]), [[255, 0, 0, 255], [255, 0, 0, 128]]);

const before = Array.from(truecolor.frames[0].imageData.data);
extractUsedRgbaColors(truecolor);
assert.deepEqual(Array.from(truecolor.frames[0].imageData.data), before, 'extraction must not mutate pixels');

const sourcePalette = [
  { r: 0, g: 0, b: 0, a: 0 },
  { r: 10, g: 0, b: 0, a: 255 },
  { r: 20, g: 0, b: 0, a: 255 },
  { r: 30, g: 0, b: 0, a: 255 },
];
const indexed = extractUsedRgbaColors({
  sourcePalette,
  frames: [{ indices: new Int16Array([2, 1, 2, 0]) }],
});
assert.equal(indexed.sourcePaletteOrderUsed, true);
assert.deepEqual(Array.from(indexed.colors, color => color.sourcePaletteIndex), [1, 2]);
assert.equal(indexed.transparentPixelCount, 1);

const multiCanvas = extractUsedRgbaColors({
  canvases: [
    { frames: [{ imageData: { data: pixels([1, 0, 0, 255]) } }, { imageData: { data: pixels([3, 0, 0, 255]) } }] },
    { frames: [{ imageData: { data: pixels([2, 0, 0, 255]) } }, { imageData: { data: pixels([4, 0, 0, 255]) } }] },
  ],
});
assert.deepEqual(Array.from(multiCanvas.colors, color => color.r), [1, 2, 3, 4], 'order is frame, canvas, then scanline');

const rgbPlan = buildImportedPalettePlan({ mode: 'rgb', usedColors: extracted.colors, paletteCapacity: 2 });
assert.equal(rgbPlan.ok, true);
assert.equal(rgbPlan.pixelRemapPlan, null);
assert.equal(rgbPlan.quantized, false);
const overflowColors = Array.from({ length: 4 }, (_, index) => ({ r: index * 40, g: 0, b: 0, a: 255, count: 1 }));
const rgbLargePlan = buildImportedPalettePlan({ mode: 'rgb', usedColors: overflowColors, paletteCapacity: 2 });
assert.equal(rgbLargePlan.ok, true);
assert.equal(rgbLargePlan.palette.length, 4);
assert.ok(rgbLargePlan.warnings.includes('rgb-palette-exceeds-requested-capacity-pixels-unchanged'));

const indexedExact = buildImportedPalettePlan({ mode: 'indexed', usedColors: extracted.colors, paletteCapacity: 3 });
assert.equal(indexedExact.ok, true);
assert.equal(indexedExact.palette[0].a, 0);
assert.deepEqual(Array.from(indexedExact.pixelRemapPlan.sourceColorToPaletteIndex), [1, 2]);

const unavailable = buildImportedPalettePlan({ mode: 'indexed', usedColors: overflowColors, paletteCapacity: 3 });
assert.equal(unavailable.ok, false);
assert.equal(unavailable.code, 'ERR_IMPORTED_PALETTE_QUANTIZER_UNAVAILABLE');
const quantized = buildImportedPalettePlan({
  mode: 'indexed',
  usedColors: overflowColors,
  paletteCapacity: 3,
  quantizer: quantizeRgbaColorEntriesWithMapping,
});
assert.equal(quantized.ok, true);
assert.equal(quantized.quantized, true);
assert.equal(quantized.palette.length, 3);
assert.equal(quantized.pixelRemapPlan.transparentIndex, 0);

const deterministicA = extractUsedRgbaColors(truecolor);
const deterministicB = extractUsedRgbaColors(truecolor);
assert.deepEqual(JSON.parse(JSON.stringify(deterministicA)), JSON.parse(JSON.stringify(deterministicB)));

const importSource = fs.readFileSync(importPath, 'utf8');
const panelSource = fs.readFileSync(panelPath, 'utf8');
assert.match(importSource, /const palette = createRgbModeDefaultPalette\(\)/);
assert.match(importSource, /colorMode: COLOR_MODE_RGB/);
assert.match(panelSource, /buildIndexedPaletteFromFrameDataList/);
assert.match(panelSource, /padIndexedPaletteToMaxColors/);
assert.match(panelSource, /MAX_IMPORTED_PALETTE_COLORS - 1/);

console.log('Imported palette P1 audit checks passed');
