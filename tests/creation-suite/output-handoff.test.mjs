import test from 'node:test';
import assert from 'node:assert/strict';
import { readToolOutput, sanitizeOutputFilename, saveToolOutputFilename, saveToolOutputVariant, sendToolOutput, stageToolOutput } from '../../js/creation/output-handoff.mjs';
import { shareOutputFile } from '../../js/creation/output-share.mjs';
import { resizeRgbaNearest } from '../../js/creation/output-render.mjs';

class FakeTransaction {
  error = null;
  objectStore(name) { return new FakeObjectStore(this, this.database.stores.get(name)); }
  constructor(database) { this.database = database; }
  completeSoon() { queueMicrotask(() => this.oncomplete?.()); }
  failSoon(error) { queueMicrotask(() => { this.error = error; this.onabort?.(); }); }
}

class FakeObjectStore {
  constructor(transaction, rows) { this.transaction = transaction; this.rows = rows; }
  add(value) {
    const request = {};
    queueMicrotask(() => {
      if (this.rows.has(value.id)) { this.transaction.failSoon(new Error('duplicate key')); return; }
      this.rows.set(value.id, value); request.result = value.id; request.onsuccess?.(); this.transaction.completeSoon();
    });
    return request;
  }
  get(id) {
    const request = {};
    queueMicrotask(() => { request.result = this.rows.get(id); request.onsuccess?.(); this.transaction.completeSoon(); });
    return request;
  }
  put(value) {
    const request = {};
    queueMicrotask(() => { this.rows.set(value.id, value); request.result = value.id; request.onsuccess?.(); this.transaction.completeSoon(); });
    return request;
  }
  openCursor() {
    const request = {}; const entries = [...this.rows.entries()]; let index = 0;
    const step = () => queueMicrotask(() => {
      if (index >= entries.length) { request.result = null; request.onsuccess?.(); this.transaction.completeSoon(); return; }
      const [id, value] = entries[index];
      request.result = { value, delete: () => this.rows.delete(id), continue: () => { index++; step(); } };
      request.onsuccess?.();
    });
    step(); return request;
  }
}

class FakeDatabase {
  constructor(state) {
    this.stores = state;
    this.objectStoreNames = { contains: (name) => this.stores.has(name) };
  }
  createObjectStore(name) { this.stores.set(name, new Map()); }
  transaction() { return new FakeTransaction(this); }
  close() {}
}

class FakeIndexedDB {
  state = new Map();
  open() {
    const request = {};
    queueMicrotask(() => {
      const database = new FakeDatabase(this.state);
      request.result = database;
      if (!this.state.has('outputs')) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  }
}

const validId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function dependencies({ indexedDBRef = new FakeIndexedDB(), now = () => 1_000, id = validId } = {}) {
  const assigned = [];
  return {
    assigned,
    indexedDBRef,
    now,
    cryptoRef: { randomUUID: () => id },
    locationRef: { origin: 'https://pixieed.test', assign: (url) => assigned.push(url) }
  };
}
function file(filename = 'my-art.png', type = 'image/png', contents = 'pixels') {
  return { blob: new Blob([contents], { type }), filename, returnUrl: '/draw/?pxd=local-id&pxdRevision=revision-id', metadata: { width: 16, height: 8 } };
}

test('filename settings preserve the original extension and remove path characters', () => {
  assert.equal(sanitizeOutputFilename('../My: art.png', 'png'), 'My- art.png');
  assert.equal(sanitizeOutputFilename('   ', 'gif'), 'pixieed-output.gif');
});

test('output data stays in IndexedDB and the route carries only an opaque id', async () => {
  const deps = dependencies();
  const staged = await stageToolOutput(file(), { ...deps, now: deps.now });
  assert.equal(staged.url, 'https://pixieed.test/output/?id=' + validId);
  assert.doesNotMatch(staged.url, /pixels|data:image|base64/);
  const first = await readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  const duplicateTab = await readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  assert.equal(await first.blob.text(), 'pixels');
  assert.equal(await duplicateTab.blob.text(), 'pixels');
  assert.equal(first.returnUrl, '/draw/?pxd=local-id&pxdRevision=revision-id');
});

test('expired entries fail clearly and are not consumed by a read', async () => {
  const deps = dependencies(); let now = 1_000;
  await stageToolOutput(file(), { ...deps, now: () => now, ttlMs: 60_000 });
  now = 61_001;
  await assert.rejects(readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: () => now }), /期限切れ/);
  assert.equal(deps.indexedDBRef.state.get('outputs').has(validId), true);
});

test('missing entries fail without affecting the editing page', async () => {
  await assert.rejects(readToolOutput(validId, { indexedDBRef: new FakeIndexedDB() }), /見つかりません/);
});

test('unsupported types and unsafe return paths are rejected before storage', async () => {
  const deps = dependencies();
  await assert.rejects(stageToolOutput(file('art.jpg', 'image/jpeg'), deps), /まだ対応していません/);
  await assert.rejects(stageToolOutput({ ...file(), returnUrl: '//other.example/' }, deps), /戻り先/);
  assert.equal(deps.indexedDBRef.state.has('outputs'), false);
});

test('storage failure returns control so the caller can use its original save action', async () => {
  const deps = dependencies({ indexedDBRef: null });
  const result = await sendToolOutput(file(), deps);
  assert.equal(result.ok, false);
  assert.equal(deps.assigned.length, 0);
});

test('large files are accepted without a fixed application size cap', async () => {
  const deps = dependencies();
  const large = file('large-art.png', 'image/png', 'x'.repeat(2 * 1024 * 1024));
  const staged = await stageToolOutput(large, deps);
  const read = await readToolOutput(staged.id, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  assert.equal(read.blob.size, 2 * 1024 * 1024);
});

test('GIF with oversized optional frame data still reaches the shared page unchanged', async () => {
  const deps = dependencies();
  const mediaSource = { kind: 'gif-frames', frames: Array.from({ length: 601 }, () => ({ width: 1, height: 1, data: new Uint8Array([0, 0, 0, 255]), delayMs: 20 })), loopCount: 0 };
  const staged = await stageToolOutput({ ...file('large-animation.gif', 'image/gif'), mediaSource }, deps);
  const loaded = await readToolOutput(staged.id, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  assert.equal(await loaded.blob.text(), 'pixels');
  assert.equal(loaded.mediaSource, null);
});

test('rendered variants and names survive reload while the original remains recoverable', async () => {
  const deps = dependencies();
  await stageToolOutput(file(), deps);
  const rendered = new Blob(['new-pixels'], { type: 'image/png' });
  await saveToolOutputVariant(validId, rendered, { width: 2, height: 1, scale: 3 }, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  await saveToolOutputFilename(validId, 'edited-art.png', { indexedDBRef: deps.indexedDBRef, now: deps.now });
  const loaded = await readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  assert.equal(await loaded.blob.text(), 'new-pixels');
  assert.equal(await loaded.sourceBlob.text(), 'pixels');
  assert.equal(loaded.filename, 'edited-art.png');
  assert.equal(loaded.metadata.scale, 3);
});

test('native share starts synchronously and a user cancellation preserves the output', async () => {
  let called = false;
  const resultPromise = shareOutputFile({ name: 'art.png' }, { navigatorRef: { canShare: () => true, share() { called = true; return Promise.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })); } } });
  assert.equal(called, true, 'share is invoked before control leaves the click handler');
  assert.equal((await resultPromise).status, 'cancelled');
});

test('native share failures keep ordinary save available', async () => {
  const result = await shareOutputFile({ name: 'art.png' }, { navigatorRef: { canShare: () => true, share: () => Promise.reject(new Error('blocked')) } });
  assert.equal(result.status, 'failed');
  assert.equal((await shareOutputFile({ name: 'art.png' }, { navigatorRef: {} })).status, 'unavailable');
});

test('nearest-neighbor exact resizing retains source alpha and does not mutate the source', () => {
  const frame = { width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 0]) };
  const resized = resizeRgbaNearest(frame, 4, 2);
  assert.deepEqual([resized.width, resized.height], [4, 2]);
  assert.deepEqual([...resized.data.slice(0, 8)], [255, 0, 0, 255, 255, 0, 0, 255]);
  assert.deepEqual([...resized.data.slice(-4)], [0, 255, 0, 0]);
  assert.equal(frame.data.length, 8);
  assert.throws(() => resizeRgbaNearest(frame, 9000, 1), /上限/);
});
