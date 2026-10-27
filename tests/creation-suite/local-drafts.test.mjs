import test from 'node:test';
import assert from 'node:assert/strict';
import { createIndexedDbDraftAdapter, createLocalDraftStore, createMemoryDraftAdapter, LocalDraftConflictError, LocalDraftQuotaError } from '../../js/creation/local-drafts.mjs';
import { createDrawDocument } from '../../js/creation/draw-core.mjs';

/** A memory adapter whose reads yield first, so two saves really interleave. */
function slowAdapter() {
  const inner = createMemoryDraftAdapter();
  const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
  return { async get(id) { await tick(); return inner.get(id); }, put: inner.put, compareAndSwap: inner.compareAndSwap };
}
const drawing = (colour) => { const document = createDrawDocument(16); document.pixels[0] = colour; return document; };

test('two saves at once both land in the history (the old code dropped one)', async () => {
  const store = createLocalDraftStore(slowAdapter());
  const [a, b] = await Promise.all([
    store.save({ draftId: 'd1', kind: 'pixel_art', document: drawing(1) }),
    store.save({ draftId: 'd1', kind: 'pixel_art', document: drawing(2) }),
  ]);
  assert.notEqual(a.revisionId, b.revisionId);
  const head = await store.head('d1');
  assert.ok([a.revisionId, b.revisionId].includes(head));
  const latest = await store.load('d1');
  assert.equal(latest.revisionId, head);
});

test('history keeps every concurrent save', async () => {
  const backing = slowAdapter(); const store = createLocalDraftStore(backing);
  await Promise.all([1, 2, 3, 4].map((colour) => store.save({ draftId: 'd2', kind: 'pixel_art', document: drawing(colour) })));
  const record = await backing.get('d2');
  assert.equal(record.revisions.length, 4);
  assert.deepEqual(record.revisions.map((revision) => revision.document.pixels[0]).sort(), [1, 2, 3, 4]);
});

test('a save that started from an older version stops with a conflict and writes nothing', async () => {
  const backing = createMemoryDraftAdapter(); const store = createLocalDraftStore(backing);
  const first = await store.save({ draftId: 'd3', kind: 'pixel_art', document: drawing(1), expectedRevisionId: null });
  await store.save({ draftId: 'd3', kind: 'pixel_art', document: drawing(2), expectedRevisionId: first.revisionId });
  await assert.rejects(store.save({ draftId: 'd3', kind: 'pixel_art', document: drawing(3), expectedRevisionId: first.revisionId }), LocalDraftConflictError);
  assert.equal((await backing.get('d3')).revisions.length, 2);
  await assert.rejects(store.save({ draftId: 'd3', kind: 'pixel_art', document: drawing(4), expectedRevisionId: null }), LocalDraftConflictError);
});

test('two tabs editing the same version: the second is told, not silently merged', async () => {
  const store = createLocalDraftStore(slowAdapter());
  const base = await store.save({ draftId: 'd4', kind: 'pixel_art', document: drawing(1) });
  const results = await Promise.allSettled([2, 3].map((colour) => store.save({ draftId: 'd4', kind: 'pixel_art', document: drawing(colour), expectedRevisionId: base.revisionId })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(results.find((r) => r.status === 'rejected').reason instanceof LocalDraftConflictError);
});

test('running out of space reports a quota error and keeps the old history', async () => {
  const inner = createMemoryDraftAdapter();
  const full = { get: inner.get, put: inner.put, async compareAndSwap() { const error = new Error('full'); error.name = 'QuotaExceededError'; throw error; } };
  const store = createLocalDraftStore(full);
  await assert.rejects(store.save({ draftId: 'd5', kind: 'pixel_art', document: drawing(1) }), LocalDraftQuotaError);
  assert.equal(await inner.get('d5'), null);
});

test('adapters without compareAndSwap still refuse to write over a newer head', async () => {
  const inner = createMemoryDraftAdapter(); const store = createLocalDraftStore({ get: inner.get, put: inner.put });
  const first = await store.save({ draftId: 'd6', kind: 'pixel_art', document: drawing(1) });
  await store.save({ draftId: 'd6', kind: 'pixel_art', document: drawing(2) });
  await assert.rejects(store.save({ draftId: 'd6', kind: 'pixel_art', document: drawing(3), expectedRevisionId: first.revisionId }), LocalDraftConflictError);
});

test('save snapshots a live input before asynchronous hashing starts', async () => {
  const originalCrypto = globalThis.crypto;
  let releaseDigest;
  let digestStarted;
  const started = new Promise((resolve) => { digestStarted = resolve; });
  const digestGate = new Promise((resolve) => { releaseDigest = resolve; });
  const subtle = { async digest(algorithm, data) { digestStarted(); await digestGate; return originalCrypto.subtle.digest(algorithm, data); } };
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { ...originalCrypto, subtle } });
  try {
    const adapter = createMemoryDraftAdapter();
    const store = createLocalDraftStore(adapter, { idFactory: (() => { let n = 0; return () => `id-${++n}`; })() });
    const document = { prompt: 'before' };
    const saving = store.save({ draftId: 'snapshot-race', kind: 'game', document });
    await started;
    document.prompt = 'changed during digest';
    releaseDigest();
    const revision = await saving;
    assert.equal(revision.document.prompt, 'before');
    assert.equal((await store.load('snapshot-race')).document.prompt, 'before');
  } finally { Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto }); }
});


function quotaIndexedDb() {
  const rows = new Map(); let failure = null;
  const database = {
    transaction(_storeName, mode) {
      const tx = { error: null, oncomplete: null, onerror: null, onabort: null, objectStore() { return objectStore; }, abort() { queueMicrotask(() => tx.onabort?.()); } };
      const finish = () => queueMicrotask(() => tx.oncomplete?.());
      const objectStore = {
        get(id) { const request = { result: rows.get(id) }; queueMicrotask(() => { request.onsuccess?.(); if (mode === 'readonly') finish(); }); return request; },
        put(record) {
          const currentFailure = failure; failure = null;
          if (currentFailure?.when === 'sync') throw currentFailure.error;
          if (currentFailure?.when === 'async') {
            const request = {};
            queueMicrotask(() => { request.error = currentFailure.error; tx.error = currentFailure.transactionError; request.onerror?.(); tx.onerror?.(); tx.onabort?.(); });
            return request;
          }
          rows.set(record.draftId, structuredClone(record)); finish(); return {};
        }
      };
      return tx;
    }
  };
  return { rows, setFailure(error) { failure = error; }, open() { const request = { result: database }; queueMicrotask(() => request.onsuccess?.()); return request; } };
}

test('default IndexedDB adapter preserves history on sync quota exception and allows retry', async () => {
  const original = globalThis.indexedDB; const fake = quotaIndexedDb(); globalThis.indexedDB = fake;
  try {
    const adapter = createIndexedDbDraftAdapter(fake, 'quota-test-drafts');
    let id = 0; const store = createLocalDraftStore(adapter, { idFactory: () => `quota-id-${++id}` });
    const initial = await store.save({ draftId: 'quota-draft', kind: 'game', document: { version: 1 } });
    for (const failure of [
      { when: 'sync', error: Object.assign(new Error('full'), { name: 'QuotaExceededError' }) },
      { when: 'async', error: Object.assign(new Error('full'), { name: 'QuotaExceededError' }), transactionError: Object.assign(new Error('aborted'), { name: 'AbortError' }) }
    ]) {
      fake.setFailure(failure);
      await assert.rejects(store.save({ draftId: 'quota-draft', kind: 'game', document: { version: 2 }, expectedRevisionId: initial.revisionId }), LocalDraftQuotaError);
    }
    const reopened = createLocalDraftStore(createIndexedDbDraftAdapter(fake, 'quota-test-drafts'), { idFactory: () => `retry-${++id}` });
    assert.equal((await reopened.load('quota-draft')).document.version, 1);
    assert.deepEqual(fake.rows.get('quota-draft').revisions.map(({ revisionId }) => revisionId), [initial.revisionId]);
    const retried = await reopened.save({ draftId: 'quota-draft', kind: 'game', document: { version: 2 }, expectedRevisionId: initial.revisionId });
    assert.equal(retried.document.version, 2);
    assert.equal(fake.rows.get('quota-draft').revisions.length, 2);
  } finally { if (original === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = original; }
});
