import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const benefits = read('PiXiEEDrawDEV/assets/js/modules/pixieed-support-benefit-utils.js');
const normalizers = read('PiXiEEDrawDEV/assets/js/modules/state-normalizers.js');
const sheetActions = read('PiXiEEDrawDEV/assets/js/modules/open-project-tab-sheet-actions.js');
const collection = read('PiXiEEDrawDEV/assets/js/modules/project-sheet-collection-utils.js');

assert.match(benefits, /function hasPixieedrawMultiCanvasSupport\(\)\s*\{\s*return true;/);
assert.match(benefits, /function getLocalViewportCanvasAccountLimit\(\)\s*\{\s*return LOCAL_VIEWPORT_CANVAS_STANDARD_MAX_COUNT;/);
assert.match(normalizers, /const LOCAL_VIEWPORT_CANVAS_STANDARD_MAX_COUNT = 3;/);
assert.match(collection, /const MAX_CANVASES_PER_SHEET = 4;/);
assert.match(collection, /ERR_CANVAS_LIMIT_EXCEEDED/);
assert.doesNotMatch(sheetActions, /MAX_SHEETS_BY_PLAN|FREE_MAX_SHEETS|PREMIUM_MAX_SHEETS|canAddMoreSheets|isSheetLimitReached/);

console.log('PiXiEEDraw DEV Phase G1 monetization gate audit checks passed');
