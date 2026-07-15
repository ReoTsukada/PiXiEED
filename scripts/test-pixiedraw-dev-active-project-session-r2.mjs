import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
require(path.join(root, 'PiXiEEDrawDEV/assets/js/active-project-session-utils.js'));

const api = globalThis.PiXiEEDrawModules?.activeProjectSessionUtils?.createActiveProjectSessionUtils({
  normalizeAutosaveProjectId: value => (typeof value === 'string' ? value.trim() : ''),
  normalizeProjectSourceKind: (value, fallback = 'unknown') => (
    ['new', 'file', 'recent', 'autosave', 'import-image', 'unknown'].includes(value) ? value : fallback
  ),
  normalizeProjectStorageAdapterId: value => (typeof value === 'string' && value.trim() ? value.trim() : null),
  now: () => '2026-07-13T00:00:00.000Z',
});

assert.ok(api, 'session helper must register');

const indexHtml = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/index.html'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/app.js'), 'utf8');
const lifecycleSource = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/modules/open-project-tab-lifecycle.js'), 'utf8');
assert.ok(
  indexHtml.indexOf('assets/js/active-project-session-utils.js') < indexHtml.indexOf('assets/js/app.js'),
  'session module must load before app.js'
);
assert.match(appSource, /function getActiveProjectPersistenceState\(options = \{\}\)/);
assert.match(appSource, /window\.__pixieedrawGetActiveProjectSession/);
assert.doesNotMatch(lifecycleSource, /projectSaveHandle/);

const empty = api.normalizeActiveProjectSession();
assert.equal(empty.projectId, '');
assert.equal(api.validateActiveProjectSession(empty).ok, false);

const session = api.createActiveProjectSession({
  projectId: ' local-a ',
  documentId: 'canvas-a',
  sourceKind: 'file',
  sourceStorageAdapterId: 'pixieedraw-v1-json',
  sourceProjectToken: 'source-a',
  lastSavedStorageAdapterId: 'pixieedraw-v1-json',
  autosaveIdentity: 'local-a',
  recoveryIdentity: 'local-a',
  dirty: true,
});

assert.equal(session.projectId, 'local-a');
assert.equal(session.sourceAdapterId, 'pixieedraw-v1-json');
assert.equal(Object.hasOwn(session, 'projectSaveHandle'), false);
assert.equal(api.validateActiveProjectSession(session).ok, true);

const updated = api.updateActiveProjectSession(session, { dirty: false });
assert.equal(updated.projectId, 'local-a');
assert.equal(Object.hasOwn(updated, 'projectSaveHandle'), false);
assert.equal(updated.dirty, false);

const replaced = api.replaceActiveProjectSession(updated, {
  projectId: 'local-b',
  sourceKind: 'new',
  autosaveIdentity: 'local-b',
  recoveryIdentity: 'local-b',
});
assert.equal(replaced.projectId, 'local-b');
assert.equal(Object.hasOwn(replaced, 'projectSaveHandle'), false);
assert.equal(replaced.sourceAdapterId, null);

const tab = {
  projectId: 'local-a',
  sourceKind: 'file',
  sourceStorageAdapterId: 'pixieedraw-v1-json',
  sourceProjectToken: 'source-a',
  lastSavedStorageAdapterId: 'pixieedraw-v1-json',
  unsaved: true,
};
const comparison = api.compareActiveProjectSessionWithTab(session, tab);
assert.equal(comparison.ok, true);
assert.deepEqual(comparison.mismatches, []);

const mismatch = api.compareActiveProjectSessionWithTab(session, { ...tab, sourceKind: 'recent' });
assert.equal(mismatch.ok, false);
assert.ok(mismatch.mismatches.some(item => item.field === 'sourceKind'));

console.log('PiXiEEDrawDEV active project session R2 tests passed.');
