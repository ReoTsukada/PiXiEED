import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
globalThis.window = { PiXiEEDrawModules: {} };
vm.runInThisContext(fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/modules/document-model.js'), 'utf8'), { filename: 'document-model.js' });

const bytes = value => new Uint8ClampedArray(value);
const base64 = value => Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64');
const state = { width: 1, height: 1, palette: [{ r: 0, g: 0, b: 0, a: 0 }] };
const model = window.PiXiEEDrawModules.documentModel.createDocumentModel({
  state, EMBED_CONFIG: {}, DEFAULT_CANVAS_SIZE: 1, MIN_CANVAS_SIZE: 1, MAX_CANVAS_SIZE: 4096, DEFAULT_DOCUMENT_NAME: 'project.pixieedraw',
  DEFAULT_ONION_SKIN: {}, DEFAULT_UI_THEME: 'default', SELECT_SAME_MODE_CONNECTED: 'connected', FILL_STYLE_SOLID: 'solid', SELECTION_SHAPE_MODE_CONTENT: 'content',
  BRUSH_SHAPE_SQUARE: 'square', BRUSH_SHAPE_CUSTOM: 'custom', NEW_PROJECT_PALETTE_PRESET_DEFAULT: 'default', clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  getNewProjectPalettePresetColors: () => [], normalizeColorValue: value => value, normalizeCustomBrushData: value => value, normalizeBrushShape: value => value,
  normalizeSelectSameMode: value => value, normalizeFillStyle: value => value, normalizeSelectionShapeMode: value => value, getDefaultLayerName: () => 'Layer',
  getDefaultFrameName: () => 'Frame', getDefaultCanvasViewportScale: () => 1, createInitialMirrorState: () => ({}), DEFAULT_FLOATING_DRAW_BUTTON_SCALE: 1,
  normalizeFloatingPreviewState: value => value, FLOATING_PREVIEW_DEFAULT_STATE: {}, normalizeUiTheme: value => value, DEFAULT_GROUP_TOOL: 'pen', normalizeOnionSkinState: value => value,
  COLOR_MODE_INDEX: 'index', normalizeDocumentName: value => value, getTransparentPaletteIndex: () => 0, DEFAULT_LAYER_BLEND_MODE: 'normal',
  SIM_SOURCE_COLOR: 'source', SIM_ELEMENT_PALETTE: 'palette', SIM_MIXED: 'mixed', SIM_DEFAULT_STYLE: {}, SIM_DEFAULT_SETTINGS: {}, SIM_LAYER_TYPE: 'simulation',
  SIM_ELEMENT_WATER: 1, SIM_ELEMENT_FIRE: 2, SIM_ELEMENT_METAL: 3, SIM_ELEMENT_SMOKE: 4, SIM_ELEMENT_LIGHT: 5,
  normalizeLayerOpacity: value => value ?? 1, normalizeLayerBlendMode: value => value || 'normal', VOXEL_EXTENSION_DEFAULT_YAW_DEG: 0, VOXEL_EXTENSION_PREVIEW_ELEVATION_DEG: 0,
  normalizeVoxelPreviewYawDegrees: value => value || 0, normalizeVoxelPreviewPitchDegrees: value => value || 0,
  encodeTypedArray: value => value ? base64(value) : '', decodeBase64: value => new Uint8Array(Buffer.from(value, 'base64')),
  validateBoundsObject: value => value, computeSelectionBoundsFromMask: () => null, normalizeProjectCanvasViewScale: value => value || 1,
  normalizeMirrorAxisState: value => value, collapseToSingleProjectCanvasSource: value => value, cloneImageData: value => value, MIN_ZOOM_SCALE: 0.1,
});

const indices = new Int16Array([-1]);
const direct = bytes([1, 2, 3, 255]);
const legacy = bytes([9, 8, 7, 255]);
const fromPayload = (directValue, importValue) => model.deserializeLayerFromDocument({
  id: 'layer', name: 'Layer', indices: base64(indices), direct: directValue, importSourceDirect: importValue,
}, 1, 'layer', 'Layer', 1, 1);

const bothDifferent = fromPayload(base64(direct), base64(legacy));
assert.deepEqual(Array.from(bothDifferent.direct), Array.from(direct), 'direct wins when legacy data disagrees');
assert.deepEqual(Array.from(bothDifferent.importSourceDirect), Array.from(legacy), 'legacy payload remains accepted');

const importOnly = fromPayload('', base64(legacy));
assert.deepEqual(Array.from(importOnly.direct), Array.from(legacy), 'import-only legacy payload is promoted into direct');
assert.deepEqual(Array.from(importOnly.importSourceDirect), Array.from(legacy));

const directOnly = fromPayload(base64(direct), '');
assert.deepEqual(Array.from(directOnly.direct), Array.from(direct));
assert.equal(directOnly.importSourceDirect, null);

const nullLegacy = fromPayload(base64(direct), null);
assert.deepEqual(Array.from(nullLegacy.direct), Array.from(direct));
assert.equal(nullLegacy.importSourceDirect, null);

const clipboardImportOnly = model.createLayerFromClipboardSnapshot({ name: 'clipboard', indices, direct: null, importSourceDirect: legacy }, 1, 1);
assert.deepEqual(Array.from(clipboardImportOnly.direct), Array.from(legacy), 'clipboard import-only payload is promoted');
assert.deepEqual(Array.from(clipboardImportOnly.importSourceDirect), Array.from(legacy));

const duplicated = model.cloneLayer({ name: 'legacy', visible: true, opacity: 1, blendMode: 'normal', indices, direct: null, importSourceDirect: legacy, directOnly: true }, 1, 1);
assert.deepEqual(Array.from(duplicated.direct), Array.from(legacy), 'duplicate promotes legacy-only source into direct');

const codec = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/modules/project-storage-v2-archive-codec.js'), 'utf8');
const history = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/modules/history-snapshot-workflow-utils.js'), 'utf8');
const recovery = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/modules/autosave-schema-v2-recovery-utils.js'), 'utf8');
assert.match(codec, /nextLayer\.importSourceDirect =/);
assert.match(history, /importSourceDirect: layer\.importSourceDirect \? decodeUint8Data/);
assert.match(recovery, /const raw = clone\(payload\)/);

console.log('G-MEM-2B legacy-shape compatibility checks passed.');
