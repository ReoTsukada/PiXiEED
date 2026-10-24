import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isInitialProjectEntryFresh } from '../../js/creation/project-workspace.mjs?rev=20261024-all-tools-offerwall-1';

const root = new URL('../../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');
const entryImport = /import \{ notifyToolEntryReady \} from ['"]\.\.\/tool-offerwall-entry\.mjs\?rev=20261024-all-tools-offerwall-1['"]/;

test('workspace freshness starts false and is granted only after a clean, successful first bootstrap', async () => {
  const workspace = await source('js/creation/project-workspace.mjs');
  assert.match(workspace, /let initialEntryFresh = false;/);
  assert.match(workspace, /initialEntryFresh = isInitialProjectEntryFresh\(\{ initialProject, pointer, hasQuery: params\.size > 0, hash: location\.hash, restoreError: initialRestoreError, operationError, failed \}\);/);
  assert.match(workspace, /get initialEntryFresh\(\) \{ return initialEntryFresh; \}/);
  assert.equal((workspace.match(/initialEntryFresh =/g) || []).length, 2, 'freshness is never rearmed by later project actions');
  assert.match(workspace, /finally \{\s*initialSelectionPending = false;[\s\S]*?\}\s*initialEntryFresh = isInitialProjectEntryFresh/);
});

test('freshness predicate fails closed for every restored or failed initial state', () => {
  assert.equal(isInitialProjectEntryFresh(), true);
  for (const state of [
    { initialProject: {} },
    { pointer: { projectId: 'opaque', revisionId: 'opaque' } },
    { hasQuery: true },
    { hash: '#resume' },
    { restoreError: 'restore failed' },
    { operationError: 'open failed' },
    { failed: true }
  ]) assert.equal(isInitialProjectEntryFresh(state), false, JSON.stringify(state));
});

test('puzzle tool entries signal only after restoration bootstrap and reject restored, active, query, and hash states', async () => {
  for (const [path, activeState] of [
    ['js/creation/jigsaw-page.mjs', '!game'],
    ['js/creation/spot-difference-page.mjs', '!draft && !inlineDraw'],
    ['js/creation/hidden-object-page.mjs', '!draft']
  ]) {
    const page = await source(path);
    assert.match(page, entryImport, `${path} imports the shared entry notifier`);
    assert.match(page, new RegExp(`notifyToolEntryReady\\(pxdBridge\\?\\.initialEntryFresh === true && !pxdBridge\\?\\.restoreError && ${activeState.replaceAll('!', '\\!')}[\\s\\S]*?!location\\.search && !location\\.hash\\)`), `${path} requires a fresh, inactive, clean route`);
    assert.match(page, /catch \(error\) \{ notifyToolEntryReady\(false\); throw error; \}/, `${path} fails closed if initial loading rejects`);
    const signal = page.lastIndexOf('notifyToolEntryReady(pxdBridge?.initialEntryFresh');
    assert.ok(signal > page.lastIndexOf('await pxdBridge.ready'), `${path} signals after the workspace promise resolves`);
  }
  const jigsaw = await source('js/creation/jigsaw-page.mjs');
  assert.ok(jigsaw.lastIndexOf('notifyToolEntryReady(pxdBridge?.initialEntryFresh') > jigsaw.lastIndexOf('await resumeGame('), 'jigsaw waits for local game resume handling');
  const spot = await source('js/creation/spot-difference-page.mjs');
  assert.ok(spot.lastIndexOf('notifyToolEntryReady(pxdBridge?.initialEntryFresh') > spot.lastIndexOf("await resume();"), 'spot-difference waits for resume handling');
  const hidden = await source('js/creation/hidden-object-page.mjs');
  assert.ok(hidden.lastIndexOf('notifyToolEntryReady(pxdBridge?.initialEntryFresh') > hidden.lastIndexOf("await resume();"), 'hidden-object waits for resume handling');
});

test('output workspace signals only a clean empty start after its start panel is installed', async () => {
  const output = await source('js/creation/output-page.mjs');
  assert.match(output, entryImport);
  assert.match(output, /showStart\(\);\s*notifyToolEntryReady\(location\.pathname === ['"]\/output\/work\/['"] && params\.size === 0 && !location\.hash\);\s*return;/);
  assert.match(output, /setError\('出力IDが複数あります[^;]+; notifyToolEntryReady\(false\); return;/);
  assert.match(output, /notifyToolEntryReady\(false\);\s*\}\s*catch \(error\) \{ setError\([^;]+; notifyToolEntryReady\(false\); \}/);
});

test('privacy disclosure describes a general tool-start entry without implying a new user step', async () => {
  const html = await source('privacy/index.html');
  assert.match(html, /ツールの利用開始前の入口では、GoogleのOfferwallを表示する場合があります/);
  assert.doesNotMatch(html, /描画・カメラ・音楽ツールの紹介ページでは、制作を始める前に/);
});
