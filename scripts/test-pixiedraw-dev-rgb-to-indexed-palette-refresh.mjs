import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const panelPath = new URL('../PiXiEEDrawDEV/assets/js/modules/palette-panel-utils.js', import.meta.url);
const source = fs.readFileSync(panelPath, 'utf8');

class HTMLElementFixture {}
class HTMLButtonElementFixture extends HTMLElementFixture {}
class HTMLInputElementFixture extends HTMLElementFixture {}
class HTMLSelectElementFixture extends HTMLElementFixture {}

const context = {
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  HTMLElement: HTMLElementFixture,
  HTMLButtonElement: HTMLButtonElementFixture,
  HTMLInputElement: HTMLInputElementFixture,
  HTMLSelectElement: HTMLSelectElementFixture,
  console,
  window: { PiXiEEDrawModules: {} },
};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'palette-panel-utils.js' });

const state = {
  colorMode: 'rgb',
  palette: [{ r: 0, g: 0, b: 0, a: 0 }],
  activePaletteIndex: 0,
  secondaryPaletteIndex: 0,
  activeRgb: { r: 255, g: 0, b: 0, a: 255 },
};
const layer = {
  indices: new Int16Array([-1, -1]),
  direct: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]),
  importSourceDirect: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]),
  directOnly: true,
};
const calls = [];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const normalizeColorValue = color => ({
  r: clamp(Math.round(Number(color?.r) || 0), 0, 255),
  g: clamp(Math.round(Number(color?.g) || 0), 0, 255),
  b: clamp(Math.round(Number(color?.b) || 0), 0, 255),
  a: clamp(Math.round(Number(color?.a) || 0), 0, 255),
});

const api = context.window.PiXiEEDrawModules.palettePanelUtils.createPalettePanelUtils({
  COLOR_MODE_INDEX: 'indexed',
  COLOR_MODE_RGB: 'rgb',
  CURRENT_PALETTE_PRESET_CUSTOM: 'custom',
  MAX_IMPORTED_PALETTE_COLORS: 256,
  NEW_PROJECT_PALETTE_PRESET_DEFAULT: 'default',
  state,
  dom: { controls: {}, sections: {} },
  history: { pending: null },
  paletteEditorState: {},
  getCurrentPalettePresetId: () => 'default',
  getNewProjectPalettePresetId: () => 'default',
  getLayoutMode: () => 'desktop',
  normalizeColorMode: value => value === 'rgb' ? 'rgb' : 'indexed',
  isRgbColorMode: () => state.colorMode === 'rgb',
  isIndexColorMode: () => state.colorMode === 'indexed',
  colorsMatchRgba: () => false,
  getPaletteEditorTargetColor: () => null,
  canCurrentClientEditPaletteColors: () => true,
  isMultiPaletteIsolationEnabled: () => false,
  canCurrentClientReindexPalette: () => true,
  announcePaletteReindexRestriction: () => {},
  forEachProjectCanvasLayer: callback => callback({ layer }),
  forEachSnapshotCanvasLayer: () => {},
  normalizePaletteIndex: (index, fallback = 0) => clamp(Number.isInteger(index) ? index : fallback, 0, Math.max(0, state.palette.length - 1)),
  getTransparentPaletteIndex: () => 0,
  clamp,
  localizeText: (ja, en) => ja || en,
  normalizeColorValue,
  buildPaletteColorLookup: palette => new Map(palette.map((color, index) => [`${color.r},${color.g},${color.b},${color.a}`, index])),
  buildIndexedPaletteFromFrameDataList: () => ({
    palette: [{ r: 255, g: 0, b: 0, a: 255 }, { r: 0, g: 0, b: 255, a: 255 }],
    frameIndices: [new Int16Array([0, 1])],
    sourceColorCount: 2,
    reduced: false,
  }),
  quantizeRgbaColorEntriesWithMapping: () => ({ palette: [], sourceIndexToPaletteIndex: [] }),
  getRgbaMergeDistance: () => 0,
  mergeWeightedRgbaColors: () => null,
  getPaletteColorKey: color => `${color.r},${color.g},${color.b},${color.a}`,
  ensureLayerDirect: () => null,
  inferDirectOnlyLayer: () => false,
  getNewProjectPalettePresetDefinition: () => null,
  getNewProjectPalettePresetColors: () => [],
  normalizeCurrentPalettePreset: value => value,
  normalizeNewProjectPalettePreset: value => value,
  setCurrentPalettePresetId: () => {},
  setNewProjectPalettePresetId: () => {},
  setPalettePresetPickerOpen: () => {},
  setNewProjectPalettePresetPickerOpen: () => {},
  schedulePalettePresetPickerRefresh: () => {},
  updatePalettePresetPickerMenuPosition: () => {},
  updateNewProjectPalettePresetPickerMenuPosition: () => {},
  renderPalettePresetPicker: () => {},
  renderNewProjectPalettePresetOptions: () => {},
  renderNewProjectPalettePresetPicker: () => {},
  renderColorPanelPalettePresetOptions: () => {},
  renderPalettePresetPreview: () => {},
  getPalettePresetDisplayName: () => '',
  markCurrentPalettePresetCustom: () => calls.push('preset-custom'),
  beginHistory: () => calls.push('history-begin'),
  commitHistory: () => calls.push('history-commit'),
  markHistoryDirty: () => calls.push('history-dirty'),
  scheduleSessionPersist: () => calls.push('session-persist'),
  requestRender: () => calls.push('request-render'),
  renderAllProjectCanvasSurfaces: () => calls.push('render-surfaces'),
  scheduleSecondaryCanvasRefresh: () => calls.push('refresh-secondary'),
  requestOverlayRender: () => calls.push('render-overlay'),
  updateColorTabSwatch: () => calls.push('color-swatch'),
  updateFloatingDrawButtonPalettePreview: () => calls.push('floating-preview'),
  updateAutosaveStatus: () => calls.push('autosave-status'),
  updateToolTabIcon: () => {},
  captureMobilePanelScrollState: () => null,
  restoreMobilePanelScrollState: () => {},
  focusUnifiedLeftContext: () => calls.push('focus-color'),
  isUnifiedLeftToolsColorMode: () => false,
  rgbaToHsv: () => ({ h: 0, s: 0, v: 0 }),
  hsvToRgba: () => ({ r: 0, g: 0, b: 0, a: 255 }),
  rgbaToCss: () => '',
  rgbaToHex: () => '',
  hslToRgbColor: () => ({ r: 0, g: 0, b: 0, a: 255 }),
  applyPixelFrameBackground: () => {},
  debounce: callback => callback,
});

assert.equal(api.setColorMode('indexed'), true);
assert.equal(state.colorMode, 'indexed');
assert.equal(state.palette.length, 256, 'indexed conversion retains the existing fixed palette capacity');
assert.deepEqual(Array.from(layer.indices), [1, 2]);
assert.equal(layer.direct, null);
assert.equal(layer.importSourceDirect, null);
assert.ok(state.activePaletteIndex >= 0 && state.activePaletteIndex < state.palette.length);
assert.ok(state.secondaryPaletteIndex >= 0 && state.secondaryPaletteIndex < state.palette.length);
assert.ok(calls.indexOf('history-begin') < calls.indexOf('history-commit'));
assert.ok(calls.includes('render-surfaces'));
assert.ok(calls.includes('session-persist'));

assert.match(source, /function refreshPaletteUiAfterColorModeChange/);
assert.match(source, /syncColorModeControls\(\);\s*renderPalette\(\);\s*syncPaletteInputs\(\);/s);
assert.match(source, /customIndexPaletteResult = convertCurrentDocumentRgbPixelsToIndexedPalette\(\)/);
assert.match(source, /rgb-to-indexed-palette-ui-refresh-success/);

console.log('RGB-to-Indexed palette immediate refresh checks passed');
