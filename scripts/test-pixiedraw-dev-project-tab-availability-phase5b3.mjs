import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const appSource = read('PiXiEEDrawDEV/assets/js/app.js');
const importSource = read('PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js');
const viewSource = read('PiXiEEDrawDEV/assets/js/modules/open-project-tab-view.js');
const actionSource = read('PiXiEEDrawDEV/assets/js/modules/open-project-tab-sheet-actions.js');
const workflowSource = read('PiXiEEDrawDEV/assets/js/modules/open-project-tab-workflow-utils.js');

const importFactory = appSource.slice(
  appSource.indexOf('const openImportWorkflowUtilsModule'),
  appSource.indexOf('const projectStorageAdapterUtilsModule')
);
assert.match(importFactory, /get buildPackagedProjectPayload\(\) \{ return buildPackagedProjectPayload; \}/);
assert.match(importSource, /if \(!applyToRuntime\) \{\s*if \(typeof buildPackagedProjectPayload !== 'function'\) \{\s*throw new Error\('ERR_PROJECT_PAYLOAD_BUILDER_UNAVAILABLE'\);/);
assert.match(importSource, /return buildPackagedProjectPayload\(snapshot, \{ includeSheets: false \}\);/);

assert.match(viewSource, /function syncProjectTabAddButtonAvailability\(list\)/);
assert.match(viewSource, /addButton\.disabled = !availability\.enabled;/);
assert.match(viewSource, /addButton\.setAttribute\('aria-disabled', String\(!availability\.enabled\)\);/);
assert.match(actionSource, /const availability = getProjectTabAddAvailability\?\.\(\)/);
assert.match(actionSource, /reason: addButton\?\.dataset\?\.availabilityReason/);
assert.match(appSource, /reason: openProjectTabBusy\s*\? 'command-in-flight'\s*: \(hasActiveProject \? 'ready' : 'no-active-project'\)/);

const activateFunction = workflowSource.slice(
  workflowSource.indexOf('async function activateOpenProjectTab'),
  workflowSource.indexOf('async function closeOpenProjectTab')
);
assert.match(activateFunction, /openProjectTabBusy = true;\s*renderOpenProjectTabs\(\);\s*try \{/);
assert.match(activateFunction, /finally \{\s*guardedProjectTabIds\.forEach\(releaseOpenProjectTabProjectWriteGuard\);\s*openProjectTabBusy = false;\s*renderOpenProjectTabs\(\);/);
assert.equal((activateFunction.match(/\[sheet-switch-debug:start\]/g) || []).length, 1, 'one activation path emits one start diagnostic');

console.log('PiXiEEDraw DEV Phase 5-B3 tab availability and image payload dependency checks passed');
