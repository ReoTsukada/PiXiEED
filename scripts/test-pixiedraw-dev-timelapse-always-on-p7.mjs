import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../PiXiEEDrawDEV/assets/js/app.js', import.meta.url), 'utf8');
const indexSource = fs.readFileSync(new URL('../PiXiEEDrawDEV/index.html', import.meta.url), 'utf8');
const timelapseSource = fs.readFileSync(new URL('../PiXiEEDrawDEV/assets/js/modules/timelapse-session-utils.js', import.meta.url), 'utf8');
const sessionSource = fs.readFileSync(new URL('../PiXiEEDrawDEV/assets/js/modules/document-session-workflow-utils.js', import.meta.url), 'utf8');
const autosaveSource = fs.readFileSync(new URL('../PiXiEEDrawDEV/assets/js/modules/autosave-workflow-utils.js', import.meta.url), 'utf8');
const recoverySource = fs.readFileSync(new URL('../PiXiEEDrawDEV/assets/js/modules/autosave-schema-v2-recovery-utils.js', import.meta.url), 'utf8');

assert.match(appSource, /const timelapseState = \{\s*enabled: true,/);
assert.match(appSource, /TIMELAPSE_OPERATION_LOG_MAX_ENTRIES = isLightweightPersistenceMode\(\) \? 120 : 240/);
assert.match(appSource, /TIMELAPSE_OPERATION_LOG_MAX_CHANGES = isLightweightPersistenceMode\(\) \? 8192 : 32768/);
assert.match(appSource, /timelapseState\.enabled = true;\s*if \(Number\.isFinite\(payload\.timelapseFps\)\)/);
assert.match(indexSource, /<input checked disabled id="toggleTimelapse" type="checkbox"\/>/);
assert.match(sessionSource, /timelapseState\.enabled = true;/);
assert.match(autosaveSource, /timelapseState\.enabled = true;/);
assert.match(recoverySource, /emptyTimelapse = \(\) => \(\{ enabled: true,/);

assert.match(timelapseSource, /function compactTimelapseOperationLogIfNeeded/);
assert.match(timelapseSource, /type: 'pixelPatchBatch'/);
assert.match(timelapseSource, /requestIdleCallback/);
assert.match(timelapseSource, /initialChangeCount > maxChanges \* 2/);
assert.match(timelapseSource, /const next = true;/);
assert.match(timelapseSource, /toggleTimelapse\.disabled = true/);
assert.match(timelapseSource, /const persistedByCanvas = await loadPersistedTimelapseSnapshots\(\)/);
assert.match(sessionSource, /entry\.type === 'pixelPatchBatch'/);
assert.doesNotMatch(sessionSource, /if \(track\?\.operationLog\?\.baseSnapshot\) \{\s*return;\s*\}/);

console.log('PiXiEEDrawDEV P7 timelapse always-on and bounded-log checks passed.');
