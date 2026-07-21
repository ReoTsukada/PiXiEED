import assert from 'node:assert/strict';
import fs from 'node:fs';

const autosave = fs.readFileSync(
  new URL('../pixiedraw/assets/js/modules/autosave-workflow-utils.js', import.meta.url),
  'utf8'
);
const history = fs.readFileSync(
  new URL('../pixiedraw/assets/js/modules/history-core-workflow-utils.js', import.meta.url),
  'utf8'
);
const localJournal = fs.readFileSync(
  new URL('../pixiedraw/assets/js/modules/local-project-journal-utils.js', import.meta.url),
  'utf8'
);

const immediateStart = autosave.indexOf('function requestImmediateAutosaveSnapshot()');
const immediateEnd = autosave.indexOf('\n  function isAutosaveInteractionBusy()', immediateStart);
assert.ok(immediateStart >= 0 && immediateEnd > immediateStart, 'immediate autosave function must exist');
const immediate = autosave.slice(immediateStart, immediateEnd);
assert.match(immediate, /autosaveCommittedFlushQueued = true/);
assert.match(immediate, /if \(autosaveWriteInFlight\) \{[\s\S]*autosaveWriteQueued = true/);
assert.match(immediate, /writeAutosaveSnapshot\(true\)/);
assert.doesNotMatch(immediate, /isLightweightPersistenceMode\(\)/, 'lightweight mode must not debounce a committed change');

assert.match(
  autosave,
  /const flushCommittedChange = autosaveCommittedFlushQueued;[\s\S]{0,360}Promise\.resolve\(\)\.then\(\(\) => requestImmediateAutosaveSnapshot\(\)\)/,
  'a change committed during an in-flight write must flush immediately afterwards'
);

const commitStart = history.indexOf('function commitHistory()');
const commitEnd = history.indexOf('\nfunction undo()', commitStart);
assert.ok(commitStart >= 0 && commitEnd > commitStart, 'history commit function must exist');
const commit = history.slice(commitStart, commitEnd);
assert.match(commit, /requestImmediateAutosaveSnapshot\(\)/);
assert.doesNotMatch(commit, /if \(isLargeDocumentPerformanceMode\(\)\)/, 'large documents must retain the committed journal flush');
assert.match(localJournal, /LOCAL_PROJECT_LARGE_PIXEL_PATCH_MAX_CHANGES = 32768/);
assert.match(
  localJournal,
  /historyEntry\.changes\.length > LOCAL_PROJECT_LARGE_PIXEL_PATCH_MAX_CHANGES[\s\S]{0,180}next\.forceCheckpoint = true/,
  'large pixel patches must checkpoint instead of expanding the journal'
);

console.log('PiXiEEDraw committed journal autosave checks passed');
