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

// G-MEM-1 findings remain pinned while G-MEM-2 establishes the direct-only
// runtime shape for new external raster imports.
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
assert.match(decoder, /const framePixels = new Uint8ClampedArray\(pixels\)/);

const estimate = ({ width, height, frames }) => {
  const frameBytes = width * height * 4;
  return {
    frameBytes,
    completedBytes: frameBytes * frames,
    directBytes: frameBytes * frames,
    importSourceBytes: frameBytes * frames,
    compositionBytes: frameBytes * 2,
  };
};
assert.deepEqual(estimate({ width: 512, height: 512, frames: 60 }), {
  frameBytes: 1048576,
  completedBytes: 62914560,
  directBytes: 62914560,
  importSourceBytes: 62914560,
  compositionBytes: 2097152,
});

console.log('G-MEM-1 importSourceDirect audit checks passed.');
