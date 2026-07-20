import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const colorCodecPath = new URL('../pixiedraw/assets/js/modules/color-codec-utils.js', import.meta.url);
const imageUtilsPath = new URL('../pixiedraw/assets/js/modules/image-utils.js', import.meta.url);
const decodePath = new URL('../pixiedraw/assets/js/modules/image-import-decode-utils.js', import.meta.url);
const importPath = new URL('../pixiedraw/assets/js/modules/open-import-workflow-utils.js', import.meta.url);
const appPath = new URL('../pixiedraw/assets/js/app.js', import.meta.url);

class ImageDataFixture {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

const context = {
  ArrayBuffer,
  Date,
  ImageData: ImageDataFixture,
  Int16Array,
  Map,
  Math,
  Set,
  TextEncoder,
  Uint8Array,
  Uint8ClampedArray,
  console,
  crypto: globalThis.crypto,
  window: { PiXiEEDrawModules: {} },
};
vm.createContext(context);
for (const [filePath, filename] of [
  [colorCodecPath, 'color-codec-utils.js'],
  [imageUtilsPath, 'image-utils.js'],
  [decodePath, 'image-import-decode-utils.js'],
  [importPath, 'open-import-workflow-utils.js'],
]) {
  vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename });
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const { GifWriter, GifReader } = context.window.PiXiEEDrawModules.colorCodecUtils.createColorCodecUtils({ clamp });
const decodeUtils = context.window.PiXiEEDrawModules.imageImportDecodeUtils.createImageImportDecodeUtils({
  DEFAULT_IMPORT_FRAME_DURATION: 100,
  IMPORT_INTEGER_SCALE_SAMPLE_GRID: 8,
  MAX_IMPORTED_PALETTE_COLORS: 256,
  clamp,
  createImageImportError: message => new Error(message),
  GifReader,
});

const transparentHiddenRgb = new Uint8ClampedArray([
  1, 2, 3, 0, 4, 5, 6, 0, 0, 255, 0, 255, 0, 255, 0, 255,
  7, 8, 9, 0, 10, 11, 12, 0, 0, 255, 0, 255, 0, 255, 0, 255,
]);
assert.equal(
  decodeUtils.detectNearestNeighborIntegerScaleForFrames([
    { imageData: new ImageDataFixture(transparentHiddenRgb, 4, 2) },
  ], 4, 2),
  2,
  'hidden RGB values under fully transparent pixels must not block exact integer-scale detection'
);

const exactFrames = [{
  imageData: new ImageDataFixture(new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 255, 0, 255,
    77, 88, 99, 0,
  ]), 3, 1),
}];
const exactPalette = decodeUtils.buildExactIndexedPaletteFromImageFrames(exactFrames, 256);
assert.ok(exactPalette);
assert.equal(exactPalette.palette.length, 2);
assert.deepEqual(Array.from(exactPalette.palette, color => ({ ...color })), [
  { r: 255, g: 0, b: 0, a: 255 },
  { r: 0, g: 255, b: 0, a: 255 },
]);
const exactIndices = new Int16Array(3);
assert.equal(
  decodeUtils.writeExactIndexedPixelsFromRgba(
    exactFrames[0].imageData.data,
    exactIndices,
    exactPalette.colorToIndex
  ),
  true
);
assert.deepEqual(Array.from(exactIndices), [0, 1, -1]);

const tooManyColors = new Uint8ClampedArray(257 * 4);
for (let index = 0; index < 257; index += 1) {
  const base = index * 4;
  tooManyColors[base] = index & 0xff;
  tooManyColors[base + 1] = (index >>> 8) & 0xff;
  tooManyColors[base + 2] = 0;
  tooManyColors[base + 3] = 255;
}
assert.equal(
  decodeUtils.buildExactIndexedPaletteFromImageFrames([
    { imageData: new ImageDataFixture(tooManyColors, 257, 1) },
  ], 256),
  null,
  'more than 256 visible colors must keep the lossless RGB import path'
);

const gifOutput = new Uint8Array(65536);
const gifWriter = new GifWriter(gifOutput, 4, 2, {
  palette: [0x000000, 0xff0000, 0x00ff00, 0x0000ff],
  loop: 0,
});
for (let frameIndex = 0; frameIndex < 100; frameIndex += 1) {
  gifWriter.addFrame(0, 0, 4, 2, new Uint8Array(frameIndex % 2 === 0 ? [
    1, 1, 2, 2,
    1, 1, 2, 2,
  ] : [
    2, 2, 3, 3,
    2, 2, 3, 3,
  ]), { delay: 10, disposal: 0 });
}
const gifBytes = gifOutput.slice(0, gifWriter.end());

let packagedSnapshot = null;
let packagedOptions = null;
let layerSequence = 0;
const openImportUtils = context.window.PiXiEEDrawModules.openImportWorkflowUtils.createOpenImportWorkflowUtils({
  COLOR_MODE_INDEX: 'index',
  COLOR_MODE_RGB: 'rgb',
  DEFAULT_DOCUMENT_NAME: 'Untitled.pxd',
  DEFAULT_GROUP_TOOL: { pen: 'pen' },
  DEFAULT_IMPORT_FRAME_DURATION: 100,
  DEFAULT_UI_THEME: 'dark',
  IMPORT_FRAME_DURATION_MIN_MS: 10,
  IMPORT_FRAME_DURATION_MAX_MS: 60000,
  IMPORT_INTEGER_SCALE_SAMPLE_GRID: 8,
  MAX_CANVAS_SIZE: 512,
  MAX_IMAGE_IMPORT_SOURCE_SIZE: 16384,
  MAX_IMPORTED_PALETTE_COLORS: 256,
  MIN_ZOOM_RATIO: 1,
  TOOL_GROUPS: { pen: {} },
  TOOL_TO_GROUP: { pen: 'pen' },
  GifReader,
  clamp,
  beginBlockingGlobalLoading: () => () => {},
  buildPackagedProjectPayload: (snapshot, options) => {
    packagedSnapshot = snapshot;
    packagedOptions = options;
    return { document: snapshot, session: options.session };
  },
  createLayer: (name, width, height) => ({
    id: `layer-${++layerSequence}`,
    name,
    visible: true,
    opacity: 1,
    indices: new Int16Array(width * height).fill(-1),
    direct: null,
    importSourceDirect: null,
  }),
  createRgbModeDefaultPalette: () => [
    { r: 0, g: 0, b: 0, a: 255 },
    { r: 255, g: 255, b: 255, a: 255 },
  ],
  ensureLayerDirect: (layer, width, height) => {
    layer.direct = new Uint8ClampedArray(width * height * 4);
    return layer.direct;
  },
  getDefaultFrameName: index => `Frame ${index}`,
  localizeText: japanese => japanese,
  normalizeDocumentName: value => value,
  normalizeMirrorAxisState: () => ({ x: false, y: false }),
  normalizeOnionSkinState: value => value || {},
  normalizeUiTheme: value => value || 'dark',
  setGlobalLoadingIndicatorLabel: () => {},
  state: {
    activeLeftTab: 'tools',
    activeRightTab: 'frames',
    activeToolGroup: 'pen',
    backgroundMode: 'dark',
    brushSize: 1,
    gridScreenStep: 8,
    lastGroupTool: { pen: 'pen' },
    majorGridSpacing: 16,
    onionSkin: {},
    outlineSize: 1,
    showCanvasResizeHandles: true,
    showChecker: true,
    showGrid: true,
    showMajorGrid: true,
    showPixelGuides: true,
    showVirtualCursor: false,
    tool: 'pen',
    uiTheme: 'dark',
  },
});
const gifFile = {
  name: '100-frame-test.gif',
  size: gifBytes.byteLength,
  type: 'image/gif',
  arrayBuffer: async () => gifBytes.buffer.slice(
    gifBytes.byteOffset,
    gifBytes.byteOffset + gifBytes.byteLength
  ),
};
const packaged = await openImportUtils.loadDocumentFromImageFile(gifFile, { applyToRuntime: false });
assert.ok(packaged);
assert.equal(packagedSnapshot.colorMode, 'index');
assert.equal(packagedSnapshot.width, 2);
assert.equal(packagedSnapshot.height, 1);
assert.equal(packagedSnapshot.frames.length, 100);
assert.equal(packagedSnapshot.frames.every(frame => frame.layers[0].direct === null), true);
assert.equal(packagedSnapshot.frames.every(frame => frame.layers[0].indices instanceof Int16Array), true);
assert.equal(packagedSnapshot.frames.every(frame => frame.layers[0].indices.byteLength === 4), true);
assert.equal(packagedSnapshot.palette.length, 3);
assert.equal(packagedOptions.includeSheets, false);
assert.equal(Object.keys(packagedOptions.session).length, 0, 'new raster projects must not inherit the previous project session');

const indexedRuntimeBytes = packagedSnapshot.frames.reduce(
  (total, frame) => total + frame.layers[0].indices.byteLength,
  0
);
const formerRgbRuntimeBytes = packagedSnapshot.frames.length * packagedSnapshot.width * packagedSnapshot.height * 6;
assert.equal(indexedRuntimeBytes, 400);
assert.equal(formerRgbRuntimeBytes, 1200);
assert.equal(indexedRuntimeBytes * 3, formerRgbRuntimeBytes);

const importSource = fs.readFileSync(importPath, 'utf8');
const appSource = fs.readFileSync(appPath, 'utf8');
assert.match(importSource, /buildExactIndexedPaletteFromImageFrames\(normalizedFramesData, MAX_IMPORTED_PALETTE_COLORS\)/);
assert.match(importSource, /buildPackagedProjectPayload\(snapshot, \{ session: \{\}, includeSheets: false \}\)/);
const openImportScopeStart = appSource.indexOf('const openImportWorkflowUtilsModule');
const openImportScopeEnd = appSource.indexOf('const {', openImportScopeStart);
const openImportScopeSource = appSource.slice(openImportScopeStart, openImportScopeEnd);
assert.match(openImportScopeSource, /get COLOR_MODE_INDEX\(\)/);

console.log('PiXiEEDraw GIF exact-index import runtime checks passed');
