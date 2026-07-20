import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
globalThis.window = { PiXiEEDrawModules: {} };
vm.runInThisContext(
  fs.readFileSync(path.join(repoRoot, 'pixiedraw/assets/js/modules/document-model.js'), 'utf8'),
  { filename: 'document-model.js' }
);

let decodeCalls = 0;
const state = { width: 512, height: 512, palette: [{ r: 0, g: 0, b: 0, a: 0 }] };
const model = window.PiXiEEDrawModules.documentModel.createDocumentModel({
  state,
  EMBED_CONFIG: {},
  DEFAULT_CANVAS_SIZE: 1,
  MIN_CANVAS_SIZE: 1,
  MAX_CANVAS_SIZE: 4096,
  DEFAULT_DOCUMENT_NAME: 'project.pxd',
  DEFAULT_ONION_SKIN: {},
  DEFAULT_UI_THEME: 'default',
  SELECT_SAME_MODE_CONNECTED: 'connected',
  FILL_STYLE_SOLID: 'solid',
  SELECTION_SHAPE_MODE_CONTENT: 'content',
  BRUSH_SHAPE_SQUARE: 'square',
  BRUSH_SHAPE_CUSTOM: 'custom',
  NEW_PROJECT_PALETTE_PRESET_DEFAULT: 'default',
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  getNewProjectPalettePresetColors: () => [],
  normalizeColorValue: value => value,
  normalizeCustomBrushData: value => value,
  normalizeBrushShape: value => value,
  normalizeSelectSameMode: value => value,
  normalizeFillStyle: value => value,
  normalizeSelectionShapeMode: value => value,
  getDefaultLayerName: () => 'Layer',
  getDefaultFrameName: () => 'Frame',
  getDefaultCanvasViewportScale: () => 1,
  createInitialMirrorState: () => ({}),
  DEFAULT_FLOATING_DRAW_BUTTON_SCALE: 1,
  normalizeFloatingPreviewState: value => value,
  FLOATING_PREVIEW_DEFAULT_STATE: {},
  normalizeUiTheme: value => value,
  DEFAULT_GROUP_TOOL: 'pen',
  normalizeOnionSkinState: value => value,
  COLOR_MODE_INDEX: 'index',
  normalizeDocumentName: value => value,
  getTransparentPaletteIndex: () => 0,
  DEFAULT_LAYER_BLEND_MODE: 'normal',
  SIM_SOURCE_COLOR: 'source',
  SIM_ELEMENT_PALETTE: 'palette',
  SIM_MIXED: 'mixed',
  SIM_DEFAULT_STYLE: {},
  SIM_DEFAULT_SETTINGS: {},
  SIM_LAYER_TYPE: 'simulation',
  SIM_ELEMENT_WATER: 1,
  SIM_ELEMENT_FIRE: 2,
  SIM_ELEMENT_METAL: 3,
  SIM_ELEMENT_SMOKE: 4,
  SIM_ELEMENT_LIGHT: 5,
  normalizeLayerOpacity: value => value ?? 1,
  normalizeLayerBlendMode: value => value || 'normal',
  VOXEL_EXTENSION_DEFAULT_YAW_DEG: 0,
  VOXEL_EXTENSION_PREVIEW_ELEVATION_DEG: 0,
  normalizeVoxelPreviewYawDegrees: value => value || 0,
  normalizeVoxelPreviewPitchDegrees: value => value || 0,
  encodeTypedArray: value => value
    ? Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64')
    : '',
  decodeBase64: value => {
    decodeCalls += 1;
    return new Uint8Array(Buffer.from(value, 'base64'));
  },
  validateBoundsObject: value => value,
  computeSelectionBoundsFromMask: () => null,
  normalizeProjectCanvasViewScale: value => value || 1,
  normalizeMirrorAxisState: value => value,
  collapseToSingleProjectCanvasSource: value => value,
  cloneImageData: value => value,
  MIN_ZOOM_SCALE: 0.1,
});

const pixelCount = 512 * 512;
const indices = new Int16Array(pixelCount);
indices.fill(-1);
const direct = new Uint8ClampedArray(pixelCount * 4);
direct[0] = 12;
direct[1] = 34;
direct[2] = 56;
direct[3] = 255;
const layer = {
  id: 'layer-1',
  name: 'Layer',
  visible: true,
  opacity: 1,
  blendMode: 'normal',
  indices,
  direct,
  importSourceDirect: null,
  directOnly: true,
};

const internal = model.serializeLayerForDocument(layer, { preserveTypedArrays: true });
assert.strictEqual(internal.indices, indices, 'internal autosave must keep the Int16Array');
assert.strictEqual(internal.direct, direct, 'internal autosave must keep the Uint8ClampedArray');

const external = model.serializeLayerForDocument(layer);
assert.equal(typeof external.indices, 'string', 'file serialization remains Base64-compatible');
assert.equal(typeof external.direct, 'string', 'file serialization remains Base64-compatible');

const legacyRestored = model.deserializeLayerFromDocument(
  external,
  pixelCount,
  'layer-1',
  'Layer',
  512,
  512,
  { trustStoredLayerFlags: true }
);
assert.deepEqual(Array.from(legacyRestored.indices.subarray(0, 4)), [-1, -1, -1, -1]);
assert.deepEqual(Array.from(legacyRestored.direct.subarray(0, 4)), [12, 34, 56, 255]);
assert.equal(legacyRestored.directOnly, true, 'legacy Base64 V2 can trust its persisted layer flag');
const legacyDecodeCalls = decodeCalls;
assert.equal(legacyDecodeCalls, 2, 'legacy Base64 V2 remains readable');

const restored = model.deserializeLayerFromDocument(
  internal,
  pixelCount,
  'layer-1',
  'Layer',
  512,
  512,
  { reuseTypedArrays: true, trustStoredLayerFlags: true }
);
assert.strictEqual(restored.indices, indices, 'trusted V2 restore must reuse indices without copying');
assert.strictEqual(restored.direct, direct, 'trusted V2 restore must reuse direct pixels without copying');
assert.equal(restored.directOnly, true, 'trusted V2 restore must use the stored direct-only flag');
assert.equal(decodeCalls, legacyDecodeCalls, 'trusted TypedArray restore must not add Base64 decoding');

console.log(JSON.stringify({
  pixelCount,
  typedByteLength: indices.byteLength + direct.byteLength,
  legacyDecodeCalls,
  typedRestoreDecodeCalls: decodeCalls - legacyDecodeCalls,
  internalIndicesType: internal.indices.constructor.name,
  internalDirectType: internal.direct.constructor.name,
  externalIndicesType: typeof external.indices,
  externalDirectType: typeof external.direct,
}, null, 2));
