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
  normalizeProjectSaveHandleState: (value, fallback = 'none') => (
    ['none', 'bound', 'unavailable'].includes(value) ? value : fallback
  ),
  normalizeProjectSaveHandleMeta: value => (value && typeof value === 'object' ? { ...value } : null),
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
assert.match(lifecycleSource, /phase: 'save-handle-update:session-first'/);
assert.match(lifecycleSource, /phase: 'save-handle-update:tab-mirror'/);

const empty = api.normalizeActiveProjectSession();
assert.equal(empty.projectId, '');
assert.equal(api.validateActiveProjectSession(empty).ok, false);

const handle = { kind: 'file', name: 'example.pixieedraw' };
const session = api.createActiveProjectSession({
  projectId: ' local-a ',
  documentId: 'canvas-a',
  sourceKind: 'file',
  sourceStorageAdapterId: 'pixieedraw-v1-json',
  sourceProjectToken: 'source-a',
  lastSavedStorageAdapterId: 'pixieedraw-v1-json',
  projectSaveHandle: handle,
  projectSaveHandleMeta: { fileName: 'example.pixieedraw', adapterId: 'pixieedraw-v1-json' },
  projectSaveHandleState: 'bound',
  autosaveIdentity: 'local-a',
  recoveryIdentity: 'local-a',
  dirty: true,
});

assert.equal(session.projectId, 'local-a');
assert.equal(session.sourceAdapterId, 'pixieedraw-v1-json');
assert.equal(session.projectSaveHandle, handle);
assert.equal(api.validateActiveProjectSession(session).ok, true);

const updated = api.updateActiveProjectSession(session, { dirty: false });
assert.equal(updated.projectId, 'local-a');
assert.equal(updated.projectSaveHandle, handle);
assert.equal(updated.dirty, false);

const replaced = api.replaceActiveProjectSession(updated, {
  projectId: 'local-b',
  sourceKind: 'new',
  autosaveIdentity: 'local-b',
  recoveryIdentity: 'local-b',
});
assert.equal(replaced.projectId, 'local-b');
assert.equal(replaced.projectSaveHandle, null);
assert.equal(replaced.sourceAdapterId, null);

const rebound = api.bindActiveProjectSessionSaveHandle(replaced, {
  handle,
  meta: { fileName: 'new.pixieedraw', adapterId: 'pixieedraw-v2-zip-experimental' },
  lastSavedAdapterId: 'pixieedraw-v2-zip-experimental',
});
assert.equal(rebound.projectSaveHandleState, 'bound');
assert.equal(rebound.projectSaveHandle, handle);

const cleared = api.clearActiveProjectSessionSaveHandle(rebound);
assert.equal(cleared.projectSaveHandleState, 'none');
assert.equal(cleared.projectSaveHandle, null);

const unavailable = api.markActiveProjectSessionSaveHandleUnavailable(rebound);
assert.equal(unavailable.projectSaveHandleState, 'unavailable');
assert.equal(unavailable.projectSaveHandle, null);

const tab = {
  projectId: 'local-a',
  sourceKind: 'file',
  sourceStorageAdapterId: 'pixieedraw-v1-json',
  sourceProjectToken: 'source-a',
  lastSavedStorageAdapterId: 'pixieedraw-v1-json',
  projectSaveHandleState: 'bound',
  projectSaveHandle: handle,
  projectSaveHandleMeta: { fileName: 'example.pixieedraw', adapterId: 'pixieedraw-v1-json' },
  unsaved: true,
};
const comparison = api.compareActiveProjectSessionWithTab(session, tab);
assert.equal(comparison.ok, true);
assert.deepEqual(comparison.mismatches, []);

const mismatch = api.compareActiveProjectSessionWithTab(session, { ...tab, sourceKind: 'recent' });
assert.equal(mismatch.ok, false);
assert.ok(mismatch.mismatches.some(item => item.field === 'sourceKind'));

const unboundSession = api.createActiveProjectSession({
  projectId: 'local-c',
  sourceKind: 'new',
  autosaveIdentity: 'local-c',
  recoveryIdentity: 'local-c',
  projectSaveHandleState: 'none',
  dirty: false,
});
const unboundTabWithLegacyMeta = {
  projectId: 'local-c',
  sourceKind: 'new',
  sourceStorageAdapterId: null,
  sourceProjectToken: null,
  lastSavedStorageAdapterId: null,
  projectSaveHandleState: 'none',
  projectSaveHandle: null,
  projectSaveHandleMeta: { fileName: 'untitled.pixieedraw', adapterId: null },
  unsaved: false,
};
assert.equal(
  api.compareActiveProjectSessionWithTab(unboundSession, unboundTabWithLegacyMeta).ok,
  true,
  'unbound compatibility metadata must not be treated as a save-binding mismatch'
);

console.log('PiXiEEDrawDEV active project session R2 tests passed.');
