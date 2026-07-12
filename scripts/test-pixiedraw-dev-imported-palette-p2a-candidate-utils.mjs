import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import vm from 'node:vm';

const planningPath = new URL('../PiXiEEDrawDEV/assets/js/modules/imported-palette-planning-utils.js', import.meta.url);
const candidatePath = new URL('../PiXiEEDrawDEV/assets/js/modules/imported-palette-candidate-utils.js', import.meta.url);
const canonicalPath = new URL('../PiXiEEDrawDEV/assets/js/modules/canonical-v2-project-utils.js', import.meta.url);
const colorCodecPath = new URL('../PiXiEEDrawDEV/assets/js/modules/color-codec-utils.js', import.meta.url);

const context = { window: { PiXiEEDrawModules: {} }, ArrayBuffer, DataView, Uint8Array, Uint8ClampedArray, Int16Array, Int32Array, TextEncoder, Object, Array, Set, WeakSet, WeakMap, Number, String, Boolean, JSON, Error, atob: value => Buffer.from(value, 'base64').toString('binary'), btoa: value => Buffer.from(value, 'binary').toString('base64') };
vm.createContext(context);
for (const [path, name] of [[planningPath, 'imported-palette-planning-utils.js'], [candidatePath, 'imported-palette-candidate-utils.js'], [canonicalPath, 'canonical-v2-project-utils.js'], [colorCodecPath, 'color-codec-utils.js']]) {
  vm.runInContext(fs.readFileSync(path, 'utf8'), context, { filename: name });
}
const planning = context.window.PiXiEEDrawModules.importedPalettePlanningUtils.createImportedPalettePlanningUtils();
const canonical = context.window.PiXiEEDrawModules.canonicalV2ProjectUtils;
const codec = context.window.PiXiEEDrawModules.colorCodecUtils.createColorCodecUtils({ clamp: (value, min, max) => Math.min(max, Math.max(min, value)), MAX_IMPORTED_PALETTE_COLORS: 256 });
const api = context.window.PiXiEEDrawModules.importedPaletteCandidateUtils.createImportedPaletteCandidateUtils({
  ...planning,
  normalizeColor: color => ({ r: Math.max(0, Math.min(255, Math.round(Number(color?.r) || 0))), g: Math.max(0, Math.min(255, Math.round(Number(color?.g) || 0))), b: Math.max(0, Math.min(255, Math.round(Number(color?.b) || 0))), a: Math.max(0, Math.min(255, Math.round(Number(color?.a) || 0))) }),
});

function project({ id = 'canvas-a', direct = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 128]), palette = [{ r: 0, g: 0, b: 0, a: 0 }], indices = new Int16Array([-1, -1]), canvases = null } = {}) {
  const canvas = { id, width: 2, height: 1, activeFrame: 0, activeLayer: `layer-${id}`, frames: [{ id: `frame-${id}`, duration: 100, layers: [{ id: `layer-${id}`, visible: true, opacity: 1, blendMode: 'normal', indices, direct, importSourceDirect: direct ? new Uint8ClampedArray(direct) : null }] }] };
  const canvasList = canvases || [canvas];
  return { type: 'pixieedraw-project', packageVersion: 2, version: 1, updatedAt: '2026-07-12T00:00:00.000Z', document: { documentName: 'external', activeCanvasId: canvasList[0]?.id || id, canvases: canvasList, palette, activePaletteIndex: 0, secondaryPaletteIndex: 0, activeRgb: { r: 0, g: 0, b: 0, a: 0 }, colorMode: 'rgb' }, session: {} };
}

const normalizer = args => canonical.normalizeExternalProjectToCanonicalV2(args);
const validator = payload => canonical.validateCanonicalV2ProjectPayload(payload);
const base = project();
const originalDirect = base.document.canvases[0].frames[0].layers[0].direct;
const configuredRgbPalette = [{ r: 0, g: 0, b: 0, a: 0 }, { r: 12, g: 34, b: 56, a: 255 }];
const rgb = api.applyImportedPalettePlanToCanonicalCandidate({ decodedPayload: base, sourceKind: 'import-image', colorMode: 'rgb', existingPalette: configuredRgbPalette, normalizeCanonicalV2: normalizer, validateCanonicalV2: validator, paletteCapacity: 256 });
assert.equal(rgb.ok, true, JSON.stringify(rgb));
const rgbDoc = rgb.canonicalPayload.document;
assert.deepEqual(Array.from(rgbDoc.palette, color => [color.r, color.g, color.b, color.a]), [[0, 0, 0, 0], [12, 34, 56, 255]]);
assert.equal(rgb.palettePlan.drawColorPlan.mode, 'rgb');
assert.ok(rgb.metrics.typedBytesBefore > 0);
assert.ok(rgb.metrics.typedBytesAfter > 0);
assert.deepEqual(Array.from(base.document.canvases[0].frames[0].layers[0].direct), Array.from(originalDirect));
assert.notEqual(rgbDoc.canvases[0].frames[0].layers[0].direct, originalDirect, 'canonical output owns typed pixels');

const indexed = api.applyImportedPalettePlanToCanonicalCandidate({ decodedPayload: project(), sourceKind: 'import-image', colorMode: 'indexed', normalizeCanonicalV2: normalizer, validateCanonicalV2: validator, paletteCapacity: 3 });
assert.equal(indexed.ok, true, JSON.stringify(indexed));
const indexedLayer = indexed.canonicalPayload.document.canvases[0].frames[0].layers[0];
assert.equal(indexed.canonicalPayload.document.palette[0].a, 0);
assert.deepEqual(Array.from(indexedLayer.indices), [1, 2]);
assert.equal(indexedLayer.direct, null);
assert.equal(indexed.palettePlan.drawColorPlan.activePaletteIndexCandidate, 1);

const encoded = project();
const encodedLayer = encoded.document.canvases[0].frames[0].layers[0];
encodedLayer.direct = Buffer.from(encodedLayer.direct).toString('base64');
encodedLayer.importSourceDirect = Buffer.from(encodedLayer.importSourceDirect).toString('base64');
encodedLayer.indices = Buffer.from(new Uint8Array(encodedLayer.indices.buffer)).toString('base64');
const encodedIndexed = api.applyImportedPalettePlanToCanonicalCandidate({ decodedPayload: encoded, sourceKind: 'import-image', colorMode: 'indexed', normalizeCanonicalV2: normalizer, validateCanonicalV2: validator, paletteCapacity: 3 });
assert.equal(encodedIndexed.ok, true, JSON.stringify(encodedIndexed));
assert.equal(typeof encodedIndexed.canonicalPayload.document.canvases[0].frames[0].layers[0].indices, 'string');

const sourceIndexed = project({ direct: null, indices: new Int16Array([2, 1]), palette: [{ r: 0, g: 0, b: 0, a: 0 }, { r: 1, g: 0, b: 0, a: 255 }, { r: 2, g: 0, b: 0, a: 255 }, { r: 3, g: 0, b: 0, a: 255 }] });
const indexedOrder = api.applyImportedPalettePlanToCanonicalCandidate({ decodedPayload: sourceIndexed, sourceKind: 'import-image', colorMode: 'indexed', normalizeCanonicalV2: normalizer, validateCanonicalV2: validator, paletteCapacity: 4 });
assert.equal(indexedOrder.ok, true, JSON.stringify(indexedOrder));
assert.deepEqual(Array.from(indexedOrder.canonicalPayload.document.palette, color => color.r), [0, 1, 2], 'unused indexed source color is omitted while source order remains');

const overflowDirect = new Uint8ClampedArray(Array.from({ length: 4 }, (_, index) => [index * 60, 0, 0, 255]).flat());
const overflow = api.applyImportedPalettePlanToCanonicalCandidate({ decodedPayload: project({ direct: overflowDirect, indices: new Int16Array([-1, -1, -1, -1]), canvases: [{ id: 'canvas-overflow', width: 4, height: 1, activeFrame: 0, activeLayer: 'layer-overflow', frames: [{ id: 'frame-overflow', duration: 100, layers: [{ id: 'layer-overflow', visible: true, indices: new Int16Array([-1, -1, -1, -1]), direct: overflowDirect, importSourceDirect: new Uint8ClampedArray(overflowDirect) }] }] }] }), sourceKind: 'import-gif', colorMode: 'indexed', normalizeCanonicalV2: normalizer, validateCanonicalV2: validator, paletteCapacity: 3 });
assert.equal(overflow.ok, false);
assert.equal(overflow.code, 'ERR_IMPORTED_PALETTE_QUANTIZER_UNAVAILABLE');
const quantized = api.applyImportedPalettePlanToCanonicalCandidate({ decodedPayload: project({ direct: overflowDirect, indices: new Int16Array([-1, -1, -1, -1]), canvases: [{ id: 'canvas-quantized', width: 4, height: 1, activeFrame: 0, activeLayer: 'layer-quantized', frames: [{ id: 'frame-quantized', duration: 100, layers: [{ id: 'layer-quantized', visible: true, indices: new Int16Array([-1, -1, -1, -1]), direct: overflowDirect, importSourceDirect: new Uint8ClampedArray(overflowDirect) }] }] }] }), sourceKind: 'import-gif', colorMode: 'indexed', normalizeCanonicalV2: normalizer, validateCanonicalV2: validator, paletteCapacity: 3, quantizer: codec.quantizeRgbaColorEntriesWithMapping });
assert.equal(quantized.ok, true, JSON.stringify(quantized));
assert.equal(quantized.metrics.quantized, true);
assert.ok(quantized.warnings.includes('WARN_IMPORTED_PALETTE_QUANTIZED'));

const multiCanvas = project({ canvases: [
  project({ id: 'canvas-1', direct: new Uint8ClampedArray([1, 0, 0, 255, 1, 0, 0, 255]) }).document.canvases[0],
  project({ id: 'canvas-2', direct: new Uint8ClampedArray([2, 0, 0, 255, 2, 0, 0, 255]) }).document.canvases[0],
] });
const multi = api.applyImportedPalettePlanToCanonicalCandidate({ decodedPayload: multiCanvas, sourceKind: 'import-gif', colorMode: 'rgb', normalizeCanonicalV2: normalizer, validateCanonicalV2: validator });
assert.equal(multi.ok, true, JSON.stringify(multi));
assert.deepEqual(Array.from(multi.canonicalPayload.document.palette, color => color.r), [0]);

const multiSheet = project();
multiSheet.sheets = [{ id: 'sheet-a', project: project({ id: 'canvas-a', direct: new Uint8ClampedArray([5, 0, 0, 255, 5, 0, 0, 255]) }) }, { id: 'sheet-b', project: project({ id: 'canvas-b', direct: new Uint8ClampedArray([6, 0, 0, 255, 6, 0, 0, 255]) }) }];
multiSheet.sheetOrder = ['sheet-a', 'sheet-b'];
multiSheet.activeSheetId = 'sheet-a';
const perSheet = api.applyImportedPalettePlanToCanonicalCandidate({ decodedPayload: multiSheet, sourceKind: 'import-gif', colorMode: 'rgb', normalizeCanonicalV2: normalizer, validateCanonicalV2: validator });
assert.equal(perSheet.ok, true, JSON.stringify(perSheet));
assert.equal(perSheet.metrics.sheetCount, 2);
assert.deepEqual(Array.from(perSheet.canonicalPayload.sheets[0].project.document.palette, color => color.r), [0]);
assert.deepEqual(Array.from(perSheet.canonicalPayload.sheets[1].project.document.palette, color => color.r), [0]);

const normalizeFailure = api.applyImportedPalettePlanToCanonicalCandidate({ decodedPayload: project(), colorMode: 'rgb', normalizeCanonicalV2: () => ({ ok: false, code: 'bad' }), validateCanonicalV2: validator });
assert.equal(normalizeFailure.code, 'ERR_IMPORTED_PALETTE_CANONICAL_NORMALIZE_FAILED');
const validationFailure = api.applyImportedPalettePlanToCanonicalCandidate({ decodedPayload: project(), colorMode: 'rgb', normalizeCanonicalV2: normalizer, validateCanonicalV2: () => ({ ok: false, path: 'fixture' }) });
assert.equal(validationFailure.code, 'ERR_IMPORTED_PALETTE_CANONICAL_VALIDATION_FAILED');

console.log('Imported palette P2-A candidate utility checks passed');
