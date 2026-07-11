import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const importSource = read('PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js');
const actionSource = read('PiXiEEDrawDEV/assets/js/modules/open-project-tab-sheet-actions.js');
const viewSource = read('PiXiEEDrawDEV/assets/js/modules/open-project-tab-view.js');

assert.match(importSource, /finally \{\s*openProjectTabBusy = false;\s*\/\/ The tab bar may have been rendered[\s\S]*?renderOpenProjectTabs\(\);/);
assert.match(importSource, /finally \{\s*openProjectTabBusy = false;\s*renderOpenProjectTabs\(\);\s*\}/);
assert.match(actionSource, /function getProjectTabAddDebugState\(\)/);
assert.match(actionSource, /overlayCount: document\.querySelectorAll\('\[data-sheet-add-overlay\]'\)\.length/);
assert.match(actionSource, /list\.addEventListener\('click'/);
assert.match(viewSource, /function syncProjectTabAddButtonAvailability\(list\)/);
assert.match(viewSource, /addButton\.disabled = !availability\.enabled;/);
assert.match(viewSource, /addButton\.setAttribute\('aria-disabled', String\(!availability\.enabled\)\);/);

console.log('PiXiEEDraw DEV sheet add lock release checks passed');
