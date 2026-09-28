import test from 'node:test';
import assert from 'node:assert/strict';
import { createPxdProject, decodePxd, setPxdBytes } from '../../js/creation/pxd-codec.mjs';
import { createMemoryPxdAdapter, createPxdStore, PxdStoreConflictError, PxdStoreError } from '../../js/creation/pxd-store.mjs';

function project() {
  return createPxdProject({ projectId: 'store-project', revisionId: 'source-r0', manifest: { ownerHint: 'local-only' }, entries: [
    { path: 'image/raw.rgba', bytes: new Uint8Array([1, 2, 3, 0]) },
    { path: 'modules/future/state.json', bytes: new TextEncoder().encode('{"untouched":true}') }
  ] });
}

function sequence(prefix = 'revision') { let index = 0; return () => `${prefix}-${++index}`; }

test('memory store atomically saves revisions, reloads latest and history, and preserves unknown bytes', async () => {
  const adapter = createMemoryPxdAdapter(); const store = createPxdStore({ adapter, idFactory: sequence() });
  assert.equal(await store.load('store-project'), null);
  const first = await store.save(project(), { expectedRevisionId: null });
  assert.equal(first.revisionId, 'revision-1');
  const edited = setPxdBytes(first, 'image/raw.rgba', new Uint8Array([9, 8, 7, 0]));
  const second = await store.save(edited, { expectedRevisionId: first.revisionId });
  assert.equal(second.revisionId, 'revision-2');
  assert.deepEqual((await store.load('store-project')).entries.find((entry) => entry.path === 'image/raw.rgba').bytes, new Uint8Array([9, 8, 7, 0]));
  assert.deepEqual((await store.load('store-project', first.revisionId)).entries.find((entry) => entry.path === 'image/raw.rgba').bytes, new Uint8Array([1, 2, 3, 0]));
  assert.deepEqual((await store.load('store-project')).entries.find((entry) => entry.path === 'modules/future/state.json').bytes, new TextEncoder().encode('{"untouched":true}'));
  assert.deepEqual(await adapter.listRevisionIds('store-project'), ['revision-1', 'revision-2']);
});

test('opaque unreferenced payload survives a structured clone and persistent save', async () => {
  const adapter = createMemoryPxdAdapter(); const store = createPxdStore({ adapter, idFactory: sequence('opaque') });
  const input = createPxdProject({ projectId: 'opaque-project', revisionId: 'opaque-source', opaquePayloads: [{ bytes: new Uint8Array([7, 0, 99, 128]) }] });
  const first = await store.save(input, { expectedRevisionId: null });
  const decoded = await decodePxd((await adapter.read('opaque-project')).bytes);
  assert.deepEqual(decoded.opaquePayloads[0].bytes, new Uint8Array([7, 0, 99, 128]));
  const second = await store.save(structuredClone(decoded), { expectedRevisionId: first.revisionId });
  const resumed = await store.load('opaque-project', second.revisionId);
  assert.deepEqual(resumed.opaquePayloads[0].bytes, new Uint8Array([7, 0, 99, 128]));
});

test('cross-tab stale revision and simultaneous saves use compare-and-swap rather than last-write-wins', async () => {
  const adapter = createMemoryPxdAdapter();
  const storeA = createPxdStore({ adapter, idFactory: sequence('a') }); const storeB = createPxdStore({ adapter, idFactory: sequence('b') });
  const initial = await storeA.save(project(), { expectedRevisionId: null });
  const stale = await storeB.load('store-project');
  const [left, right] = await Promise.allSettled([
    storeA.save(setPxdBytes(initial, 'image/raw.rgba', new Uint8Array([4])), { expectedRevisionId: initial.revisionId }),
    storeB.save(setPxdBytes(stale, 'image/raw.rgba', new Uint8Array([5])), { expectedRevisionId: initial.revisionId })
  ]);
  assert.equal([left, right].filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = [left, right].find((result) => result.status === 'rejected');
  assert.ok(rejected.reason instanceof PxdStoreConflictError);
  assert.equal((await adapter.listRevisionIds('store-project')).length, 2);
});

test('failed transaction leaves the last complete revision and history intact', async () => {
  const memory = createMemoryPxdAdapter(); let fail = false;
  const adapter = {
    read: (...args) => memory.read(...args),
    compareAndSwap: (...args) => fail ? Promise.reject(new PxdStoreError('PXD_STORE_WRITE_FAILED')) : memory.compareAndSwap(...args),
    listRevisionIds: (...args) => memory.listRevisionIds(...args)
  };
  const store = createPxdStore({ adapter, idFactory: sequence('atomic') });
  const saved = await store.save(project(), { expectedRevisionId: null });
  fail = true;
  await assert.rejects(store.save(setPxdBytes(saved, 'image/raw.rgba', new Uint8Array([99])), { expectedRevisionId: saved.revisionId }), { code: 'PXD_STORE_WRITE_FAILED' });
  const loaded = await store.load('store-project');
  assert.equal(loaded.revisionId, saved.revisionId);
  assert.deepEqual(loaded.entries.find((entry) => entry.path === 'image/raw.rgba').bytes, new Uint8Array([1, 2, 3, 0]));
  assert.deepEqual(await memory.listRevisionIds('store-project'), [saved.revisionId]);
});

test('missing store APIs and unavailable IndexedDB fail explicitly without creating partial records', async () => {
  assert.throws(() => createPxdStore({ adapter: {} }), { code: 'PXD_STORE_ADAPTER_INVALID' });
  const store = createPxdStore({ idFactory: sequence('idb') });
  await assert.rejects(store.load('store-project'), { code: 'PXD_IDB_UNAVAILABLE' });
});
