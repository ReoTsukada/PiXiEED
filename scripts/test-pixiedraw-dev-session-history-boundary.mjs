import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const editions = ['PiXiEEDrawDEV', 'pixiedraw'];

for (const edition of editions) {
  const appSource = fs.readFileSync(path.join(root, edition, 'assets/js/app.js'), 'utf8');
  const documentSessionSource = fs.readFileSync(
    path.join(root, edition, 'assets/js/modules/document-session-workflow-utils.js'),
    'utf8'
  );
  const reloadSessionSource = fs.readFileSync(
    path.join(root, edition, 'assets/js/modules/reload-session-workflow-utils.js'),
    'utf8'
  );
  const localJournalSource = fs.readFileSync(
    path.join(root, edition, 'assets/js/modules/local-project-journal-utils.js'),
    'utf8'
  );
  const uiConfigSource = fs.readFileSync(
    path.join(root, edition, 'assets/js/modules/ui-static-config.js'),
    'utf8'
  );

  assert.match(
    documentSessionSource,
    /function buildProjectSessionPayload\(\)[\s\S]*historyPast: \[\],[\s\S]*historyFuture: \[\]/,
    `${edition}: saved project sessions must not contain Undo/Redo stacks`
  );
  assert.match(
    documentSessionSource,
    /function parseProjectSessionPayload[\s\S]*const historyPast = \[\];[\s\S]*const historyFuture = \[\]/,
    `${edition}: history from older projects must not be deserialized on open`
  );
  assert.match(
    documentSessionSource,
    /setActiveAutosaveProjectId\([\s\S]*resetHistorySession: true/,
    `${edition}: opening a document must reset file-backed history for the new editing session`
  );
  assert.match(
    reloadSessionSource,
    /const past = \[\];[\s\S]*const future = \[\]/,
    `${edition}: reload recovery must not persist Undo/Redo stacks`
  );
  assert.match(uiConfigSource, /RELOAD_SNAPSHOT_MAX_HISTORY_ITEMS = 0/);
  assert.doesNotMatch(
    localJournalSource,
    /historyPast = normalizeHistoryEntryList\(history\?\.past/,
    `${edition}: autosave journals must not duplicate the live Undo stack`
  );
  assert.match(
    localJournalSource,
    /session\.historyPast = \[\];[\s\S]*session\.historyFuture = \[\]/,
    `${edition}: autosave checkpoints must keep Undo/Redo out of their session payload`
  );
  assert.match(
    appSource,
    /maxEntriesPerDirection: Number\.MAX_SAFE_INTEGER/,
    `${edition}: the uninterrupted page session must not impose a drawing-count cap`
  );
  assert.match(appSource, /function resetColdHistorySession\(/);
  assert.match(
    appSource,
    /generation !== coldHistorySessionGeneration/,
    `${edition}: an old asynchronous refill must not cross the project-open boundary`
  );
}

console.log('PiXiEEDraw production and DEV session history boundary tests passed.');
