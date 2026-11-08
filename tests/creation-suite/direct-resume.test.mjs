import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createPxdProject } from '../../js/creation/pxd-codec.mjs';
import { createMemoryPxdAdapter } from '../../js/creation/pxd-store.mjs';
import { createToolProjectStore } from '../../js/creation/tool-project-store.mjs';
import { createProjectSession } from '../../js/creation/project-session.mjs';
import { forkProject } from '../../js/creation/project-catalog.mjs';

const directKey = 'pixieed:pxd:last:direct-workspace:v1';
const creationKey = 'pixieed:pxd:last:creation';
const drawKey = 'pixieed:pxd:last:draw';
const source = readFileSync(new URL('../../js/tool-direct.mjs', import.meta.url), 'utf8');
const start = source.indexOf('      let initialPointer, initialRestoreError');
const end = source.indexOf('      const importedRuntime =', start);
assert.ok(start >= 0 && end > start, 'exercise the actual direct-entry pointer selection');
function select(values = {}, search = '') {
  const result = runInNewContext(`${source.slice(start, end)}\n({ initialPointer, initialRestoreError });`, {
    DRAFT_KEY: directKey, adapted: new URL(`https://local.invalid/draw/${search}`),
    localStorage: { getItem(key) { return values[key] ?? null; } }
  });
  return JSON.parse(JSON.stringify(result));
}

test('normal entry resumes the saved identity without forwarding a fork flag or adding a title', () => {
  const pointer = { projectId: 'saved', revisionId: 'revision-1' };
  for (const key of [directKey, creationKey, drawKey]) {
    assert.deepEqual(select({ [key]: JSON.stringify({ ...pointer, fork: true, title: 'old title' }) }), {
      initialPointer: pointer, initialRestoreError: ''
    });
  }
  assert.deepEqual(select({ [directKey]: JSON.stringify(pointer), [creationKey]: JSON.stringify({ projectId: 'other', revisionId: 'other-1' }) }).initialPointer, pointer);
});

test('explicit project routes, invalid pointers and no saved work retain their guarded behavior', () => {
  const stored = { [directKey]: JSON.stringify({ projectId: 'saved', revisionId: 'revision-1' }) };
  for (const query of ['?pxd=explicit&pxdRevision=explicit-1', '?modePxd=explicit&modePxdRevision=explicit-1']) {
    assert.deepEqual(select(stored, query), { initialRestoreError: '' });
  }
  for (const value of ['{', '{}', '{"projectId":"saved"}', '{"projectId":"saved","revisionId":""}']) {
    assert.match(select({ [directKey]: value }).initialRestoreError, /作品一覧から選び直して/);
    assert.equal(select({ [directKey]: value }).initialPointer, undefined);
  }
  assert.deepEqual(select(), { initialRestoreError: '' });
});

function fixture() {
  let revision = 0;
  const store = createToolProjectStore('draw', { adapter: createMemoryPxdAdapter(), idFactory: () => `saved-${++revision}` });
  const session = () => createProjectSession({ store, capture: value => value });
  const original = createPxdProject({ projectId: 'existing', revisionId: 'initial', manifest: { title: '作品 の続き', toolProject: { tool: 'draw', schemaVersion: 1 } }, entries: [{ path: 'test.bin', bytes: new Uint8Array([1]) }] });
  return { store, session, original };
}

test('repeated normal-entry edits save new revisions of the same work and retain earlier versions', async () => {
  const { store, session, original } = fixture();
  let saved = await store.save(original);
  const first = saved;
  for (let index = 0; index < 3; index++) {
    const selected = select({ [directKey]: JSON.stringify({ projectId: saved.projectId, revisionId: saved.revisionId }) }).initialPointer;
    const opened = await store.load(selected.projectId, selected.revisionId);
    const current = session();
    await current.adopt(opened, { persisted: true });
    assert.equal(current.dirty, false);
    assert.equal((await current.save()).revisionId, saved.revisionId, 'unchanged reentry writes nothing');
    current.currentProject.entries[0].bytes[0] += 1;
    current.markDirty();
    saved = await current.save();
    assert.equal(saved.projectId, original.projectId);
    assert.equal(saved.manifest.title, original.manifest.title, 'existing titles are never renamed or merged');
    assert.equal((await store.listProjects()).projects.length, 1);
  }
  assert.equal((await store.load(first.projectId, first.revisionId)).entries[0].bytes[0], 1);
  assert.equal(saved.entries[0].bytes[0], 4);
});

test('normal resume keeps stale-tab CAS protection and explicit duplication preserves both works', async () => {
  const { store, session, original } = fixture();
  const first = await store.save(original);
  const a = session(), b = session();
  await a.adopt(first, { persisted: true });
  await b.adopt(first, { persisted: true });
  a.currentProject.entries[0].bytes[0] = 2; a.markDirty();
  const latest = await a.save();
  b.currentProject.entries[0].bytes[0] = 3; b.markDirty();
  await assert.rejects(b.save(), { code: 'PXD_STORE_CONFLICT' });
  assert.equal(b.currentProject.entries[0].bytes[0], 3);
  assert.equal(b.persistedProject.revisionId, first.revisionId);
  assert.equal((await store.load(first.projectId)).revisionId, latest.revisionId);
  assert.equal((await store.listProjects()).projects.length, 1, 'a conflict must not create an automatic copy');
  await b.adopt(forkProject(b.currentProject, { projectId: 'explicit-copy', revisionId: 'copy-initial' }), { persisted: false });
  await b.save();
  assert.equal((await store.load(first.projectId)).entries[0].bytes[0], 2);
  assert.equal((await store.load('explicit-copy')).entries[0].bytes[0], 3);
  assert.equal((await store.listProjects()).projects.length, 2);
});

test('the shell lets a visible shared settings menu consume Escape before leaving work', () => {
  const handler = source.match(/document\.addEventListener\('keydown', event => \{([\s\S]*?)\n  \}, \{ signal: lifecycle.signal \}\);/)?.[1];
  assert.ok(handler);
  for (const overlay of ['dialog[open]', 'details[open]', '#creation-settings-panel:not([hidden])', null]) {
    let hidden = 0;
    const event = { key: 'Escape', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    runInNewContext(`(() => {${handler}})()`, { open: true, event, document: { querySelector: selector => overlay && selector.split(',').includes(overlay) ? {} : null }, hide: () => hidden++ });
    assert.equal(hidden, overlay ? 0 : 1, overlay || 'Escape outside panels may return to explanation');
  }
});


test('definite restore failure opens the gallery once only after the active shell is ready', () => {
  const start = source.indexOf('  function showRestoreState() {');
  const end = source.indexOf('  function own(node)', start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  for (const blocked of [{ coreReady: false }, { open: false }, { disposed: true }]) {
    const calls = [];
    runInNewContext(`${body}\nshowRestoreState();`, {
      runtime: { draw: { workspace: { restoreError: 'test failure', syncInputLock() {}, showProjects(value) { calls.push(value); } } } },
      disposed: false, coreReady: true, open: true, recoveryAutoOpened: false,
      recovery: {}, message: {}, status: {}, bar: { classList: { toggle() {} } }, viewport() {}, ...blocked
    });
    assert.equal(calls.length, 0, JSON.stringify(blocked));
  }
  const calls = [], recovery = {}, message = {}, status = {};
  const workspace = { restoreError: 'test failure', syncInputLock() {}, showProjects(value) { calls.push(value.pane); } };
  runInNewContext(`${body}\nshowRestoreState(); showRestoreState();`, {
    runtime: { draw: { workspace } }, disposed: false, coreReady: true, open: true, recoveryAutoOpened: false,
    recovery, message, status, bar: { classList: { toggle() {} } }, viewport() {}
  });
  assert.deepEqual(calls, ['library'], 'repeat state updates respect a prior dismissal');
  assert.equal(recovery.hidden, false);
  assert.match(message.textContent, /作品を開けませんでした/);
});
