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

const runtimeDirect = new Uint8ClampedArray(pixelCount * 4);
runtimeDirect.set([90, 80, 70, 255], 0);
const deferredRuntimeLayer = {
  id: 'runtime-direct-layer',
  name: 'Runtime direct layer',
  visible: true,
  opacity: 1,
  blendMode: 'normal',
  indices: new Uint8Array(0),
  indicesEncoding: 'uint8-palette-zero-transparent-v2',
  direct: runtimeDirect,
  importSourceDirect: null,
  directOnly: true,
};
const serializedDeferredRuntime = model.serializeLayerForDocument(deferredRuntimeLayer, {
  preserveTypedArrays: true,
  width: 512,
  height: 512,
});
assert.ok(serializedDeferredRuntime.indices instanceof Uint8Array, 'deferred runtime indices stay Uint8');
assert.equal(serializedDeferredRuntime.indices.length, pixelCount, 'deferred direct layer must serialize a full index buffer');
assert.equal(serializedDeferredRuntime.indicesEncoding, 'uint8-palette-zero-transparent-v2');
const restoredDeferredRuntime = model.deserializeLayerFromDocument(
  serializedDeferredRuntime,
  pixelCount,
  'runtime-direct-layer',
  'Runtime direct layer',
  512,
  512,
  { trustStoredLayerFlags: true }
);
assert.ok(restoredDeferredRuntime.indices instanceof Uint8Array, 'serialized runtime indices restore as Uint8');
assert.equal(restoredDeferredRuntime.indices.length, pixelCount, 'restored runtime index buffer keeps canvas size');
assert.deepEqual(Array.from(restoredDeferredRuntime.direct.subarray(0, 4)), [90, 80, 70, 255]);

const malformedBuild116Runtime = {
  ...serializedDeferredRuntime,
  indices: new Int16Array(pixelCount).fill(-1),
  indicesEncoding: 'uint8-palette-zero-transparent-v2',
};
const recoveredBuild116Runtime = model.deserializeLayerFromDocument(
  malformedBuild116Runtime,
  pixelCount,
  'runtime-direct-layer',
  'Runtime direct layer',
  512,
  512,
  { trustStoredLayerFlags: true }
);
assert.ok(recoveredBuild116Runtime.indices instanceof Uint8Array, 'Build 116 runtime payloads recover to Uint8');
assert.equal(recoveredBuild116Runtime.indices.length, pixelCount, 'Build 116 recovery restores full index buffer');
assert.equal(recoveredBuild116Runtime.indices[0], 0, 'legacy transparent marker is recovered as runtime transparency');

const recoveredBuild116EncodedRuntime = model.deserializeLayerFromDocument(
  {
    ...malformedBuild116Runtime,
    indices: Buffer.from(
      malformedBuild116Runtime.indices.buffer,
      malformedBuild116Runtime.indices.byteOffset,
      malformedBuild116Runtime.indices.byteLength
    ).toString('base64'),
  },
  pixelCount,
  'runtime-direct-layer',
  'Runtime direct layer',
  512,
  512,
  { trustStoredLayerFlags: true }
);
assert.ok(recoveredBuild116EncodedRuntime.indices instanceof Uint8Array, 'encoded Build 116 payloads recover to Uint8');
assert.equal(recoveredBuild116EncodedRuntime.indices.length, pixelCount, 'encoded Build 116 recovery restores full index buffer');

const unmarkedRuntimeLayer = model.deserializeLayerFromDocument(
  {
    ...serializedDeferredRuntime,
    indices: new Uint8Array(pixelCount),
    indicesEncoding: undefined,
  },
  pixelCount,
  'runtime-direct-layer',
  'Runtime direct layer',
  512,
  512,
  { trustStoredLayerFlags: true }
);
assert.equal(
  unmarkedRuntimeLayer.indicesEncoding,
  'uint8-palette-zero-transparent-v2',
  'unmarked direct-color Uint8 payloads recover as runtime V2 indices'
);
assert.equal(unmarkedRuntimeLayer.indices.length, pixelCount, 'unmarked runtime indices restore at canvas size');

const damagedDirectIndexLayer = model.deserializeLayerFromDocument(
  {
    ...serializedDeferredRuntime,
    indices: new Uint8Array([0]),
    indicesEncoding: undefined,
  },
  pixelCount,
  'runtime-direct-layer',
  'Runtime direct layer',
  512,
  512,
  { trustStoredLayerFlags: true }
);
assert.equal(
  damagedDirectIndexLayer.indicesEncoding,
  'uint8-palette-zero-transparent-v2',
  'damaged direct-color index maps rebuild as V2 transparent runtime indices'
);
assert.deepEqual(
  Array.from(damagedDirectIndexLayer.direct.subarray(0, 4)),
  [90, 80, 70, 255],
  'damaged direct-color index maps retain the authoritative visible RGBA data'
);

const unmarkedEncodedRuntimeLayer = model.deserializeLayerFromDocument(
  {
    ...serializedDeferredRuntime,
    indices: Buffer.from(new Uint8Array(pixelCount)).toString('base64'),
    indicesEncoding: undefined,
  },
  pixelCount,
  'runtime-direct-layer',
  'Runtime direct layer',
  512,
  512,
  { trustStoredLayerFlags: true }
);
assert.equal(
  unmarkedEncodedRuntimeLayer.indicesEncoding,
  'uint8-palette-zero-transparent-v2',
  'Base64 unmarked direct-color Uint8 payloads recover as runtime V2 indices'
);
assert.equal(unmarkedEncodedRuntimeLayer.indices.length, pixelCount, 'unmarked Base64 runtime indices restore at canvas size');

const unmarkedCompactLayer = model.deserializeLayerFromDocument(
  {
    id: 'unmarked-compact-layer',
    name: 'Unmarked compact layer',
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    indices: new Uint8Array([0, 1, 0, 1]),
  },
  4,
  'unmarked-compact-layer',
  'Unmarked compact layer',
  2,
  2,
  { trustStoredLayerFlags: true }
);
assert.equal(
  unmarkedCompactLayer.indicesEncoding,
  'uint8-zero-transparent-v1',
  'unmarked non-direct Uint8 payloads retain compact V1 palette semantics'
);
assert.deepEqual(Array.from(unmarkedCompactLayer.indices), [0, 1, 0, 1]);

console.log(JSON.stringify({
  pixelCount,
  typedByteLength: indices.byteLength + direct.byteLength,
  legacyDecodeCalls,
  typedRestoreDecodeCalls: decodeCalls - legacyDecodeCalls,
  internalIndicesType: internal.indices.constructor.name,
  internalDirectType: internal.direct.constructor.name,
  externalIndicesType: typeof external.indices,
  externalDirectType: typeof external.direct,
  deferredRuntimeIndexLength: serializedDeferredRuntime.indices.length,
  recoveredBuild116IndexLength: recoveredBuild116Runtime.indices.length,
  recoveredBuild116EncodedIndexLength: recoveredBuild116EncodedRuntime.indices.length,
}, null, 2));
