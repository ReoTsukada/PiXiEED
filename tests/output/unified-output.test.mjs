import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isOutputWorkspace, isEditorOutput, outputReturnUrl, outputFilename, navigationContext, flushOutputWorkspace, storeOutputFile, readOutputFile, routeEditorFile, installEditorDownloadRouting } from '../../js/creation/output-router.mjs';
import { sendToolOutput, sendToolOutputAfterSaving, readToolOutput } from '../../js/creation/output-handoff.mjs';
import { sharedOutputRequest, needsDetailedOutput } from '../../js/creation/output-receive.mjs';
import { saveFile } from '../../js/pixel-export.mjs';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
class Transaction {
  constructor(stores) { this.stores = stores; }
  objectStore(name) {
    const rows = this.stores.get(name), tx = this;
    const perform = fn => { const req = {}; queueMicrotask(() => { try { req.result = fn(); req.onsuccess?.(); queueMicrotask(() => tx.oncomplete?.()); } catch (error) { tx.error = error; tx.onabort?.(); } }); return req; };
    return {
      add: value => perform(() => { if (rows.has(value.id)) throw new Error('duplicate'); rows.set(value.id, value); return value.id; }),
      put: value => perform(() => { rows.set(value.id, value); return value.id; }),
      get: id => perform(() => rows.get(id)),
      openCursor() {
        const req = {}, entries = [...rows.entries()]; let i = 0;
        const next = () => queueMicrotask(() => {
          const entry = entries[i];
          req.result = entry ? { value: entry[1], delete() { rows.delete(entry[0]); }, continue() { i++; next(); } } : null;
          req.onsuccess?.(); if (!entry) queueMicrotask(() => tx.oncomplete?.());
        }); next(); return req;
      }
    };
  }
  abort() { queueMicrotask(() => this.onabort?.()); }
}
class IndexedDB {
  databases = new Map();
  open(name) {
    const req = {};
    queueMicrotask(() => {
      const fresh = !this.databases.has(name); if (fresh) this.databases.set(name, new Map());
      const stores = this.databases.get(name);
      req.result = { objectStoreNames: { contains: key => stores.has(key) }, createObjectStore: key => stores.set(key, new Map()), transaction: () => new Transaction(stores), close() {} };
      if (fresh) req.onupgradeneeded?.(); req.onsuccess?.();
    }); return req;
  }
}
function deps(path = '/draw/?pxd=project&pxdRevision=revision') {
  const location = new URL(path, 'https://pixieed.test'), assigned = []; location.assign = url => assigned.push(url);
  const win = { location }; win.parent = win;
  return { windowRef: win, locationRef: location, indexedDBRef: new IndexedDB(), cryptoRef: { randomUUID: () => ID }, origin: location.origin, now: () => 1000, assigned };
}
const file = () => ({ blob: new Blob(['original-png-with-project-metadata'], { type: 'image/png' }), filename: 'art.png', returnUrl: '/draw/?pxd=project&pxdRevision=revision' });
for (const path of ['/draw/', '/audio/', '/camera/', '/pixel-camera.html', '/pixel-camera-studio.html', '/pixiee-lens/', '/jigsaw/', '/spot-difference/', '/hidden-object/', '/play/spot-difference/', '/play/hidden-object/', '/tools/start/draw/']) {
  test(`editor file routing includes ${path}`, () => assert.equal(isEditorOutput({ pathname: path }), true));
}
for (const path of ['/output/work/', '/output/work/index.html', '/output/', '/privacy/', '/stores/']) {
  test(`editor routing excludes ${path}`, () => assert.equal(isEditorOutput({ pathname: path }), false));
}
test('output route cannot recursively restage its own downloads', () => {
  assert.ok(isOutputWorkspace({ pathname: '/output/work/' })); assert.ok(isOutputWorkspace({ pathname: '/output/work/index.html' }));
  const doc = { addEventListener() { assert.fail('not installed on output'); } };
  installEditorDownloadRouting(doc, { location: new URL('https://pixieed.test/output/work/') });
});
test('return locations normalize fresh/embedded entries while preserving the saved project', () => {
  assert.equal(outputReturnUrl('/tools/start/draw/?pxd=one&pxdRevision=two', 'https://pixieed.test'), '/draw/?pxd=one&pxdRevision=two');
  assert.equal(outputReturnUrl('/audio/editor.html?pxd=p&embed=1&channel=x', 'https://pixieed.test'), '/audio/?pxd=p');
  for (const path of ['https://evil.test/draw/', '//evil.test/draw/', '/output/work/', '/admin/']) assert.throws(() => outputReturnUrl(path, 'https://pixieed.test'));
});
test('download filenames are inert text and do not contain paths or controls', () => {
  assert.equal(outputFilename('../folder/art.pxd'), 'art.pxd'); assert.equal(outputFilename('<script>\0.png'), '-script--.png');
});
test('PXD and arbitrary editor file bytes survive staging unchanged', async () => {
  const d = deps(), blob = new Blob([new Uint8Array([0, 1, 254, 255])], { type: 'application/octet-stream' });
  const result = await storeOutputFile(blob, 'work.pxd', '/draw/?pxd=p', d), read = await readOutputFile(result.id, d);
  assert.equal(result.url, `/output/work/?file=${ID}`); assert.equal(read.returnUrl, '/draw/?pxd=p'); assert.equal(read.filename, 'work.pxd');
  assert.deepEqual(new Uint8Array(await read.blob.arrayBuffer()), new Uint8Array([0, 1, 254, 255]));
  await assert.rejects(readOutputFile(ID, { ...d, now: () => 8 * 86400000 }));
});
test('invalid input and unavailable local storage never navigate', async () => {
  const d = deps();
  for (const blob of [new Blob([]), { size: 129 * 1024 * 1024, arrayBuffer() {} }]) await assert.rejects(storeOutputFile(blob, 'x', '/draw/', d));
  await assert.rejects(routeEditorFile(file().blob, 'art.png', { ...d, indexedDBRef: null })); assert.equal(d.assigned.length, 0);
});
test('staging uses a confirmed transaction before navigation and coalesces double clicks', async () => {
  const d = deps(), blob = file().blob, a = routeEditorFile(blob, 'art.png', d), b = routeEditorFile(blob, 'art.png', d);
  assert.equal(a, b); assert.equal(await a, 'staged'); assert.equal(d.assigned.length, 1);
  assert.equal((await readOutputFile(ID, d)).filename, 'art.png');
});
test('draw/camera/audio handoff no longer chooses the embedded-native-save branch', async () => {
  for (const mode of ['draw', 'camera', 'audio']) {
    const d = deps(`/${mode}/?pxd=p`); let saved = false;
    const workspace = { dirty: true, async assertCanSave() {}, async save() { saved = true; this.dirty = false; } };
    d.windowRef.__PIXIEED_CREATION_HOST__ = { active: true, kind: 'direct', runtime: { draw: { workspace } } };
    const result = await sendToolOutput(file(), d); assert.equal(result.ok, true); assert.ok(saved); assert.equal(d.assigned.length, 1);
    const record = await readToolOutput(ID, d); assert.equal(record.returnUrl, `/${mode}/?pxd=p`); assert.equal(await record.blob.text(), await file().blob.text());
  }
});
test('read-only workspace and unfinished save retain the editor', async () => {
  for (const workspace of [{ async assertCanSave() { throw new Error('read only'); } }, { dirty: true, async save() {} }]) {
    const d = deps(); d.windowRef.__PIXIEED_CREATION_HOST__ = { active: true, runtime: { draw: { workspace } } };
    assert.equal((await sendToolOutput(file(), d)).ok, false); assert.equal(d.assigned.length, 0);
  }
});
test('stale source and explicit permission failure are not handed off', async () => {
  const d = deps(); assert.equal((await sendToolOutputAfterSaving(file(), {}, () => false, d)).reason, 'source_changed');
  const denied = await sendToolOutputAfterSaving(file(), { async assertCanSave() { throw new Error('not owned'); } }, () => true, d);
  assert.equal(denied.reason, 'permission_blocked'); assert.equal(d.assigned.length, 0);
});
test('public handoff also coalesces concurrent requests', async () => {
  const d = deps(), first = sendToolOutput(file(), d), second = sendToolOutput(file(), d); assert.equal(first, second); assert.equal((await first).ok, true); assert.equal(d.assigned.length, 1);
});
test('only validated same-origin tool embeds may navigate their parent', () => {
  const d = deps(), parent = { location: new URL('https://pixieed.test/draw/') };
  assert.throws(() => navigationContext({ parent }, d.locationRef));
  const win = { parent, __PIXIEED_TOOL_EMBED__: { role: 'draw', channel: ID } }; assert.equal(navigationContext(win, d.locationRef).location, parent.location);
  parent.location = new URL('https://evil.test/draw/'); assert.throws(() => navigationContext(win, d.locationRef));
});
test('saveFile stages editor files without invoking share or creating a download link', async () => {
  const d = deps(); const result = await saveFile(file().blob, 'art.png', { ...d, navigatorRef: { share() { assert.fail(); } }, documentRef: { createElement() { assert.fail(); } } });
  assert.equal(result, 'staged'); assert.equal(d.assigned.length, 1);
});
test('ambiguous, duplicate and invalid private IDs fail closed', () => {
  for (const value of [`?id=${ID}&file=${ID}`, `?id=${ID}&id=${ID}`, '?id=', '?file=bad']) assert.throws(() => sharedOutputRequest(value));
  assert.deepEqual(sharedOutputRequest(`?id=${ID}`), { key: 'id', id: ID, advanced: false }); assert.equal(sharedOutputRequest('?mode=convert'), null);
});
test('complex songs, videos, multi-output and preview-only files retain complete detailed workspace', () => {
  for (const record of [{ outputs: [{}, {}] }, { metadata: { previewOnly: true } }, { mime: 'video/mp4' }, { mediaSources: [{ kind: 'audio-song' }] }, { mediaSources: [{ kind: 'rgba-frames' }, { kind: 'audio-buffer' }] }]) assert.equal(needsDetailedOutput(record), true);
  assert.equal(needsDetailedOutput({ mime: 'image/png', mediaSources: [{ kind: 'rgba-frames' }] }), false);
});
test('legacy anchor interception is scoped, idempotent, and ignores handled/remote navigation', () => {
  const d = deps(), listeners = [], doc = { addEventListener: (name, fn) => listeners.push(fn) }; d.windowRef.fetch = () => assert.fail('not fetched');
  installEditorDownloadRouting(doc, d.windowRef); installEditorDownloadRouting(doc, d.windowRef); assert.equal(listeners.length, 1);
  listeners[0]({ defaultPrevented: true, target: { closest: () => ({ href: 'blob:https://pixieed.test/a' }) } });
  listeners[0]({ defaultPrevented: false, target: { closest: () => ({ href: 'https://other.test/art.png' }) }, preventDefault() { assert.fail(); } });
});
test('public interface preserves storage API, simple entry and original-file recovery', async () => {
  const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
  const [entry, converter, header] = await Promise.all([read('js/creation/conversion-entry.mjs'), read('js/creation/conversion-page.mjs'), read('js/tool-header-controls.mjs')]);
  assert.match(entry, /mountSharedOutput/); assert.match(converter, /offerOriginal/); assert.match(header, /installEditorDownloadRouting/);
  assert.doesNotMatch(entry, /adsbygoogle|analytics|localStorage/);
});


test('camera save wrapper stages once and never opens the removed editor dialog', async () => {
  const { createCameraFileSave } = await import('../../js/pixel-lens/file-save.mjs');
  const d = deps('/camera/'), blob = file().blob;
  const controller = createCameraFileSave({ ...d, dialog: { showModal() { assert.fail('editor save dialog'); } } });
  assert.equal(controller.show({ blob, filename: 'camera.png', isCurrent: () => false }), false);
  assert.equal(controller.show({ blob, filename: 'camera.png', isCurrent: () => true }), true);
  assert.equal(controller.show({ blob, filename: 'camera.png', isCurrent: () => true }), false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(d.assigned.length, 1);
  assert.equal(await (await readOutputFile(ID, d)).blob.text(), await blob.text());
});
