import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const importWorkflow = read('PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js');
const drawing = read('PiXiEEDrawDEV/assets/js/modules/canvas-drawing-workflow-utils.js');
const patch = read('PiXiEEDrawDEV/assets/js/modules/pixel-patch-history-utils.js');
const journal = read('PiXiEEDrawDEV/assets/js/modules/local-project-journal-utils.js');
const documentModel = read('PiXiEEDrawDEV/assets/js/modules/document-model.js');

// PNG, GIF, JPEG and WebP all flow through decodeImageFileToFrames() into the
// same RGB candidate builder. New external raster imports must retain direct
// only; legacy importSourceDirect is handled at the restore boundaries.
assert.match(importWorkflow, /importResult = await decodeImageFileToFrames\(file\)/);
assert.match(importWorkflow, /const direct = ensureLayerDirect\(layer, width, height\)/);
assert.match(importWorkflow, /direct\.set\(frameInfo\.imageData\.data\)/);
assert.doesNotMatch(importWorkflow, /layer\.importSourceDirect\s*=/);

assert.doesNotMatch(drawing, /layer\.importSourceDirect\s*=/);
assert.doesNotMatch(patch, /layer\.importSourceDirect\s*=/);
assert.doesNotMatch(journal, /ensureTypedDirectBuffer\(layer, 'importSourceDirect'/);
assert.match(documentModel, /importSourceDirect: null/);
assert.match(documentModel, /promoteLegacyImportSourceDirect/);

console.log('G-MEM-2C external-raster direct-only checks passed.');
