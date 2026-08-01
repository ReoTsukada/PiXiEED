import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

class ElementStub {}
class InputStub extends ElementStub {}
class ButtonStub extends ElementStub {}
class SelectStub extends ElementStub {}

const listeners = new Map();
const windowStub = {
  PiXiEEDrawModules: {},
  addEventListener(type, listener) { listeners.set(type, listener); },
  removeEventListener(type, listener) {
    if (listeners.get(type) === listener) listeners.delete(type);
  },
};
const context = {
  Array,
  HTMLButtonElement: ButtonStub,
  HTMLElement: ElementStub,
  HTMLInputElement: InputStub,
  HTMLSelectElement: SelectStub,
  Int16Array,
  Map,
  Math,
  Number,
  Set,
  Uint8Array,
  Uint8ClampedArray,
  console,
  window: windowStub,
};
vm.createContext(context);
const modulePath = new URL('../pixiedraw/assets/js/modules/palette-panel-utils.js', import.meta.url);
vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: 'palette-panel-utils.js' });

const state = {
  palette: [{ r: 10, g: 20, b: 30, a: 255 }],
  activePaletteIndex: 0,
  secondaryPaletteIndex: 0,
  activeRgb: { r: 10, g: 20, b: 30, a: 255 },
};
const originalColor = () => ({ ...state.palette[0] });
const history = { pending: null };
const paletteEditorState = {
  hsv: { h: 10, s: 0.2, v: 0.3, a: 255 },
  colorHistoryActive: false,
  colorHistoryDirty: false,
  wheelPointer: {
    active: false,
    pointerId: null,
    mode: null,
    captureTarget: null,
    upHandler: null,
  },
};
const controls = {
  paletteHue: { value: '120', style: {} },
  paletteSaturation: { value: '75', style: {} },
  paletteValue: { value: '80', style: {} },
  paletteAlphaSlider: { value: '200', style: {} },
  paletteHueValue: { textContent: '' },
  paletteSaturationValue: { textContent: '' },
  paletteValueValue: { textContent: '' },
  paletteAlphaValue: { textContent: '' },
};
const dom = { controls, sections: {} };
let gateOpen = false;
let dirtyCount = 0;
let commitCount = 0;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const normalizeColorValue = color => ({
  r: clamp(Math.round(Number(color?.r) || 0), 0, 255),
  g: clamp(Math.round(Number(color?.g) || 0), 0, 255),
  b: clamp(Math.round(Number(color?.b) || 0), 0, 255),
  a: clamp(Math.round(Number(color?.a) || 0), 0, 255),
});
const rgbaToHsv = color => ({ h: Number(color.r), s: Number(color.g) / 255, v: Number(color.b) / 255 });
const hsvToRgba = (h, s, v) => ({
  r: clamp(Math.round(h), 0, 255),
  g: clamp(Math.round(s * 255), 0, 255),
  b: clamp(Math.round(v * 255), 0, 255),
  a: 255,
});

const palette = windowStub.PiXiEEDrawModules.palettePanelUtils.createPalettePanelUtils({
  COLOR_MODE_INDEX: 'index',
  COLOR_MODE_RGB: 'rgb',
  CURRENT_PALETTE_PRESET_CUSTOM: 'custom',
  MAX_IMPORTED_PALETTE_COLORS: 256,
  NEW_PROJECT_PALETTE_PRESET_DEFAULT: 'default',
  state,
  dom,
  history,
  paletteEditorState,
  getCurrentPalettePresetId: () => 'custom',
  getNewProjectPalettePresetId: () => 'default',
  getLayoutMode: () => 'desktop',
  normalizeColorMode: () => 'index',
  isRgbColorMode: () => false,
  isIndexColorMode: () => true,
  colorsMatchRgba: (left, right) => ['r', 'g', 'b', 'a'].every(key => left?.[key] === right?.[key]),
  getPaletteEditorTargetColor: () => state.palette[0],
  canCurrentClientEditPaletteColors: () => true,
  canBeginPiXiSyncLocalOperation: () => gateOpen,
  isMultiPaletteIsolationEnabled: () => false,
  canCurrentClientReindexPalette: () => true,
  announcePaletteReindexRestriction: () => {},
  forEachProjectCanvasLayer: () => {},
  forEachSnapshotCanvasLayer: () => {},
  normalizePaletteIndex: value => clamp(Math.round(Number(value) || 0), 0, state.palette.length - 1),
  getTransparentPaletteIndex: () => 0,
  clamp,
  localizeText: value => value,
  normalizeColorValue,
  markCurrentPalettePresetCustom: () => {},
  beginHistory: label => { history.pending = { label }; },
  commitHistory: () => { commitCount += 1; history.pending = null; },
  markHistoryDirty: () => { dirtyCount += 1; },
  scheduleSessionPersist: () => {},
  requestRender: () => {},
  renderAllProjectCanvasSurfaces: () => {},
  scheduleSecondaryCanvasRefresh: () => {},
  requestOverlayRender: () => {},
  updateColorTabSwatch: () => {},
  updateFloatingDrawButtonPalettePreview: () => {},
  captureMobilePanelScrollState: () => null,
  restoreMobilePanelScrollState: () => {},
  focusUnifiedLeftContext: () => {},
  rgbaToHsv,
  hsvToRgba,
  rgbaToCss: color => `rgba(${color.r},${color.g},${color.b},${color.a})`,
  rgbaToHex: () => '#000000',
  applyPixelFrameBackground: () => {},
});

const beforeBlockedSlider = originalColor();
assert.equal(palette.handlePaletteSliderInput({ source: 'alpha' }), false);
assert.deepEqual(originalColor(), beforeBlockedSlider, 'a busy PiXiSYNC session must reject slider mutation');
assert.equal(history.pending, null);
assert.equal(dirtyCount, 0);

const wheelSurface = {
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  setPointerCapture: () => {},
  hasPointerCapture: () => false,
};
controls.paletteWheelWrapper = wheelSurface;
const blockedWheelEvent = {
  pointerId: 9,
  clientX: 85,
  clientY: 50,
  cancelable: true,
  preventDefault: () => {},
};
const beforeBlockedWheel = originalColor();
assert.equal(palette.handlePaletteWheelPointerDown(blockedWheelEvent), false);
assert.deepEqual(originalColor(), beforeBlockedWheel, 'a busy PiXiSYNC session must reject wheel mutation');
assert.equal(paletteEditorState.wheelPointer.active, false);
assert.equal(listeners.has('pointermove'), false);

gateOpen = true;
controls.paletteHue.value = '140';
controls.paletteSaturation.value = '60';
controls.paletteValue.value = '70';
controls.paletteAlphaSlider.value = '210';
palette.handlePaletteSliderInput({ source: 'alpha' });
assert.notDeepEqual(originalColor(), beforeBlockedSlider, 'an available PiXiSYNC session may edit palette color');
assert.equal(history.pending?.label, 'paletteColor');
assert.equal(dirtyCount, 1);
palette.commitPaletteColorHistorySession();
assert.equal(commitCount, 1, 'accepted palette editing must commit one document history entry');
assert.equal(history.pending, null);

console.log('PiXiSYNC palette color busy-state guard checks passed');
