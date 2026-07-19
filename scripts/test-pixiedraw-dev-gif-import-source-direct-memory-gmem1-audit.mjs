import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const importWorkflow = read('PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js');
const documentModel = read('PiXiEEDrawDEV/assets/js/modules/document-model.js');
const drawing = read('PiXiEEDrawDEV/assets/js/modules/canvas-drawing-workflow-utils.js');
const palette = read('PiXiEEDrawDEV/assets/js/modules/palette-panel-utils.js');
const history = read('PiXiEEDrawDEV/assets/js/modules/history-snapshot-workflow-utils.js');
const codec = read('PiXiEEDrawDEV/assets/js/modules/project-storage-v2-archive-codec.js');
const decoder = read('PiXiEEDrawDEV/assets/js/modules/image-import-decode-utils.js');

// New external raster imports remain direct-only, and the GIF decoder must
// inspect every composited frame without retaining source-size frame copies.
assert.match(importWorkflow, /direct\.set\(frameInfo\.imageData\.data\)/);
assert.doesNotMatch(importWorkflow, /layer\.importSourceDirect\s*=/);

assert.doesNotMatch(drawing, /layer\.importSourceDirect = new Uint8ClampedArray\(direct\)/);
assert.doesNotMatch(drawing, /layer\.importSourceDirect\[base\] = rgbColor\.r/);
assert.match(palette, /const direct = layer\.direct instanceof Uint8ClampedArray/);
assert.match(palette, /layer\.importSourceDirect instanceof Uint8ClampedArray/);
assert.match(palette, /layer\.importSourceDirect = null/);

assert.match(documentModel, /importSourceDirect: encodeTypedArray\(layer\.importSourceDirect\)/);
assert.match(documentModel, /importSourceDirect = deserializeRasterTypedArray\(\s*layer\.importSourceDirect,/);
assert.match(documentModel, /direct = promoteLegacyImportSourceDirect\(direct, importSourceDirect, pixelCount \* 4\)/);
assert.match(history, /importSourceDirect: layer\.importSourceDirect \? compressUint8Array/);
assert.match(codec, /normalizeBitmapPayload\(layer\.importSourceDirect/);
assert.match(codec, /nextLayer\.importSourceDirect =/);

assert.match(decoder, /const pixels = new Uint8ClampedArray\(width \* height \* 4\)/);
assert.match(decoder, /const restoreBuffer = new Uint8ClampedArray\(pixels\.length\)/);
assert.match(decoder, /detectGifCommonIntegerScale\(reader, width, height, frameCount\)/);
assert.match(decoder, /createIntegerDownscaledImageDataFromPixels\(/);
assert.doesNotMatch(decoder, /const framePixels = new Uint8ClampedArray\(pixels\)/);
assert.doesNotMatch(decoder, /const sampledFrames = \[\]/);
assert.match(importWorkflow, /frameInfo\.imageData = null/);
assert.match(importWorkflow, /normalizedFramesData\[index\] = null/);

const estimate = ({ width, height, frames, factor }) => {
  const sourceFrameBytes = width * height * 4;
  const targetWidth = width / factor;
  const targetHeight = height / factor;
  const targetFrameBytes = targetWidth * targetHeight * 4;
  return {
    sourceFrameBytes,
    targetFrameBytes,
    sampledSourceBytes: 0,
    compositionBytes: sourceFrameBytes * 2,
    optimizedDirectBytes: targetFrameBytes * frames,
    optimizedIndexBytes: targetWidth * targetHeight * 2 * frames,
    importSourceBytes: 0,
  };
};
assert.deepEqual(estimate({ width: 1280, height: 960, frames: 204, factor: 4 }), {
  sourceFrameBytes: 4915200,
  targetFrameBytes: 307200,
  sampledSourceBytes: 0,
  compositionBytes: 9830400,
  optimizedDirectBytes: 62668800,
  optimizedIndexBytes: 31334400,
  importSourceBytes: 0,
});

console.log('G-MEM-1 importSourceDirect audit checks passed.');
