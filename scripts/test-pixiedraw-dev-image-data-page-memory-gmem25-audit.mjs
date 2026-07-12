import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const decoder = read('PiXiEEDrawDEV/assets/js/modules/image-import-decode-utils.js');
const workflow = read('PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js');
const app = read('PiXiEEDrawDEV/assets/js/app.js');

assert.match(decoder, /const framePixels = new Uint8ClampedArray\(pixels\)/);
assert.match(decoder, /imageData: new ImageData\(framePixels, width, height\)/);
assert.match(decoder, /const resizedFrames = new Array\(frames\.length\)/);
assert.match(decoder, /frames\[index\] = null/);
assert.match(decoder, /const canvas = document\.createElement\('canvas'\)/);
assert.match(decoder, /return ctx\.getImageData\(0, 0, canvas\.width, canvas\.height\)/);
assert.match(decoder, /bitmap\.close\(\)/);

assert.match(workflow, /const framesData = Array\.isArray\(importResult\?\.frames\) \? importResult\.frames : \[\]/);
assert.match(workflow, /let normalizedFramesData;[\s\S]*?resizeImportFrames\(framesData, width, height\)/);
assert.match(workflow, /normalizedFramesData\.forEach/);
assert.match(workflow, /direct\.set\(frameInfo\.imageData\.data\)/);
assert.match(workflow, /applyHistorySnapshot\(snapshot/);

assert.match(app, /replaceProjectCanvasDocuments\([\s\S]*?snapshot\.frames/);
assert.match(app, /state\.frames = snapshot\.frames\.map/);

console.log('G-MEM-2.5 ImageData/Page lifetime audit checks passed.');
