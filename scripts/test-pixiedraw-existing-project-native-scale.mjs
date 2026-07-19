import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const scaleModulePath = new URL('../pixiedraw/assets/js/modules/snapshot-integer-scale-utils.js', import.meta.url);
const paletteModulePath = new URL('../pixiedraw/assets/js/modules/selection-move-workflow-utils.js', import.meta.url);
const appPath = new URL('../pixiedraw/assets/js/app.js', import.meta.url);
const modelPath = new URL('../pixiedraw/assets/js/modules/document-model.js', import.meta.url);
const serializationPath = new URL('../pixiedraw/assets/js/modules/document-serialization-utils.js', import.meta.url);
const sessionPath = new URL('../pixiedraw/assets/js/modules/document-session-workflow-utils.js', import.meta.url);
const indexPath = new URL('../pixiedraw/index.html', import.meta.url);

const context = {
  console,
  performance,
  setTimeout,
  Uint8Array,
  Uint8ClampedArray,
  Uint32Array,
  Int16Array,
  ArrayBuffer,
  Map,
  window: {
    PiXiEEDrawModules: {},
    setTimeout,
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(scaleModulePath, 'utf8'), context, {
  filename: 'snapshot-integer-scale-utils.js',
});

const scaleApi = context.window.PiXiEEDrawModules.snapshotIntegerScaleUtils;

function makeDirectLayer(width, height, scale, seed = 0) {
  const indices = new Int16Array(width * height).fill(-1);
  const direct = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const base = index * 4;
      const nativeX = Math.floor(x / scale);
      const nativeY = Math.floor(y / scale);
      direct[base] = (nativeX * 37 + seed) & 255;
      direct[base + 1] = (nativeY * 59 + seed) & 255;
      direct[base + 2] = ((nativeX + nativeY) * 23 + seed) & 255;
      direct[base + 3] = 255;
    }
  }
  return { id: `layer-${scale}-${seed}`, indices, direct, directOnly: true };
}

function makeSnapshot(layersByFrame, width = 32, height = 16) {
  return {
    width,
    height,
    colorMode: 'rgb',
    palette: [{ r: 0, g: 0, b: 0, a: 0 }],
    activeFrame: 0,
    activeLayer: layersByFrame[0][0].id,
    mirror: { enabled: false, axisX: 15.5, axisY: 7.5, axes: { vertical: false, horizontal: false } },
    selectionMask: null,
    selectionContentMask: null,
    selectionBounds: null,
    frames: layersByFrame.map((layers, index) => ({ id: `frame-${index}`, layers })),
  };
}

const mixedScaleSnapshot = makeSnapshot([
  [makeDirectLayer(32, 16, 8, 1)],
  [makeDirectLayer(32, 16, 4, 2)],
]);
const originalSecondFrame = new Uint8ClampedArray(mixedScaleSnapshot.frames[1].layers[0].direct);
const optimized = await scaleApi.optimizeSnapshotIntegerScale(mixedScaleSnapshot, {
  minimumPixelCount: 0,
  yieldIntervalMs: 1_000_000,
});
assert.equal(optimized.optimized, true);
assert.equal(optimized.factor, 4, '8x and 4x frames use their exact common 4x scale');
assert.equal(mixedScaleSnapshot.width, 8);
assert.equal(mixedScaleSnapshot.height, 4);
assert.equal(mixedScaleSnapshot.frames[0].layers[0].indices.length, 32);
assert.equal(mixedScaleSnapshot.frames[1].layers[0].direct.length, 32 * 4);
for (let y = 0; y < mixedScaleSnapshot.height; y += 1) {
  for (let x = 0; x < mixedScaleSnapshot.width; x += 1) {
    const targetBase = (y * mixedScaleSnapshot.width + x) * 4;
    const sourceBase = ((y * 4) * 32 + (x * 4)) * 4;
    assert.deepEqual(
      Array.from(mixedScaleSnapshot.frames[1].layers[0].direct.subarray(targetBase, targetBase + 4)),
      Array.from(originalSecondFrame.subarray(sourceBase, sourceBase + 4)),
      'optimized pixels are exact top-left samples from proven uniform blocks'
    );
  }
}

const onePixelDetail = makeDirectLayer(32, 16, 8, 3);
onePixelDetail.direct[0] = 255;
const onePixelSnapshot = makeSnapshot([[onePixelDetail]]);
const notOptimized = await scaleApi.optimizeSnapshotIntegerScale(onePixelSnapshot, {
  minimumPixelCount: 0,
  yieldIntervalMs: 1_000_000,
});
assert.equal(notOptimized.optimized, false);
assert.equal(notOptimized.reason, 'pixel-factor-one');
assert.equal(onePixelSnapshot.width, 32, 'a single 1px detail prevents automatic resize');

const selectedSnapshot = makeSnapshot([[makeDirectLayer(32, 16, 8, 4)]]);
selectedSnapshot.selectionMask = new Uint8Array(32 * 16);
selectedSnapshot.selectionMask[0] = 1;
assert.equal((await scaleApi.inspectSnapshotIntegerScale(selectedSnapshot, { minimumPixelCount: 0 })).reason, 'active-geometry-state');

vm.runInContext(fs.readFileSync(paletteModulePath, 'utf8'), context, {
  filename: 'selection-move-workflow-utils.js',
});
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const normalizeColorValue = color => ({
  r: clamp(Math.round(Number(color?.r) || 0), 0, 255),
  g: clamp(Math.round(Number(color?.g) || 0), 0, 255),
  b: clamp(Math.round(Number(color?.b) || 0), 0, 255),
  a: clamp(Math.round(Number(color?.a) || 0), 0, 255),
});
const paletteApi = context.window.PiXiEEDrawModules.selectionMoveWorkflowUtils.createSelectionMoveWorkflowUtils({
  state: { palette: [] },
  COLOR_MODE_INDEX: 'indexed',
  COLOR_MODE_RGB: 'rgb',
  MAX_IMPORTED_PALETTE_COLORS: 256,
  clamp,
  normalizeColorValue,
  normalizeColorMode: value => value === 'rgb' ? 'rgb' : 'indexed',
  forEachSnapshotCanvasLayer: (snapshot, visitor) => {
    snapshot.frames.forEach((frame, frameIndex) => {
      frame.layers.forEach((layer, layerIndex) => visitor({ frame, frameIndex, layer, layerIndex }));
    });
  },
});
const indexedLayer = {
  indices: new Int16Array([-1, -1, -1]),
  direct: new Uint8ClampedArray([
    255, 0, 0, 255,
    255, 0, 0, 255,
    0, 0, 255, 255,
  ]),
  directOnly: true,
};
const indexedSnapshot = {
  colorMode: 'indexed',
  palette: [{ r: 0, g: 0, b: 0, a: 0 }],
  activePaletteIndex: 0,
  secondaryPaletteIndex: 0,
  frames: [{ layers: [indexedLayer] }],
};
const paletteResult = paletteApi.synchronizeImportedSnapshotPalette(indexedSnapshot);
assert.equal(paletteResult.addedCount, 2);
assert.deepEqual(Array.from(indexedLayer.indices), [1, 1, 2]);
assert.equal(indexedLayer.direct, null);
assert.equal(paletteApi.getPackedPaletteColorKey(255, 0, 0, 255), 0xff0000ff);

const appSource = fs.readFileSync(appPath, 'utf8');
const modelSource = fs.readFileSync(modelPath, 'utf8');
const serializationSource = fs.readFileSync(serializationPath, 'utf8');
const sessionSource = fs.readFileSync(sessionPath, 'utf8');
const indexSource = fs.readFileSync(indexPath, 'utf8');
assert.match(modelSource, /colorMode:\s*COLOR_MODE_INDEX/);
assert.match(appSource, /blank startup canvas always begins indexed[\s\S]{0,220}state\.colorMode = COLOR_MODE_INDEX;/);
assert.match(appSource, /state\.colorMode = normalizeColorMode\(snapshot\.colorMode, state\.colorMode\);/);
assert.match(serializationSource, /normalizeColorMode\(payload\.colorMode, inferredColorMode\)/);
assert.match(sessionSource, /scaleOptimizer\(snapshot,[\s\S]{0,800}synchronizeImportedSnapshotPalette\(snapshot\);/);
assert.match(sessionSource, /hasTimelapseEdits[\s\S]{0,900}hasArchivedTimelapse/);
assert.ok(
  indexSource.indexOf('snapshot-integer-scale-utils.js') < indexSource.indexOf('document-session-workflow-utils.js'),
  'integer scale utility loads before project session restore'
);

console.log('Existing project native-scale, packed-palette, and initial indexed-mode checks passed');
