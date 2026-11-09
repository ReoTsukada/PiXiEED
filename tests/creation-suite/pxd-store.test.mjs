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

function fakeIndexedDb({ putFailure = null } = {}) {
  const rows = new Map(); const catalog = new Map();
  let nextPutFailure = putFailure;
  const database = {
    objectStoreNames: { contains: () => true },
    transaction(_name, mode) {
      let pending = 0; let aborted = false;
      const writes = [];
      const tx = { error: null, objectStore, abort() {
        if (aborted) return; aborted = true;
        queueMicrotask(() => tx.onabort?.());
      } };
      function done() {
        pending--;
        queueMicrotask(() => {
          if (pending || aborted) return;
          for (const write of writes.splice(0)) write();
          tx.oncomplete?.();
        });
      }
      function objectStore(name) {
        const records = name === 'project-catalog' ? catalog : rows;
        return {
          get(id) {
            const request = {}; pending++;
            queueMicrotask(() => { request.result = structuredClone(records.get(id)); request.onsuccess?.(); done(); });
            return request;
          },
          getAll() {
            const request = {}; pending++;
            queueMicrotask(() => { request.result = structuredClone([...records.values()]); request.onsuccess?.(); done(); });
            return request;
          },
          put(record) {
            const failure = nextPutFailure; nextPutFailure = null;
            if (failure?.when === 'sync') throw failure.error;
            const request = {}; pending++;
            queueMicrotask(() => {
              if (failure) {
                request.error = failure.error;
                tx.error = failure.transactionError ?? failure.error;
                if (failure.when !== 'abort-only') { request.onerror?.(); tx.onerror?.(); }
                tx.abort();
              } else writes.push(() => records.set(record.projectId, structuredClone(record)));
              done();
            });
            return request;
          },
          delete(id) { pending++; queueMicrotask(() => { writes.push(() => records.delete(id)); done(); }); return {}; }
        };
      }
      return tx;
    }
  };
  return {
    rows, catalog,
    setPutFailure(failure) { nextPutFailure = failure; },
    open() {
      const request = { result: database };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    }
  };
}

test('IndexedDB save reports sync and async quota failures, keeps the head, and retries after space clears', async () => {
  const original = globalThis.indexedDB;
  const fake = fakeIndexedDb();
  globalThis.indexedDB = fake;
  try {
    const store = createPxdStore({ idFactory: sequence('quota') });
    const initial = await store.save(project(), { expectedRevisionId: null });
    const edited = setPxdBytes(initial, 'image/raw.rgba', new Uint8Array([6, 6, 6, 0]));
    for (const failure of [
      { when: 'sync', error: Object.assign(new Error('storage full'), { code: 22 }) },
      { when: 'async', error: Object.assign(new Error('storage full'), { name: 'QuotaExceededError' }), transactionError: Object.assign(new Error('aborted'), { name: 'AbortError' }) },
      { when: 'abort-only', error: Object.assign(new Error('commit storage full'), { name: 'QuotaExceededError' }) }
    ]) {
      fake.setPutFailure(failure);
      await assert.rejects(store.save(edited, { expectedRevisionId: initial.revisionId }), {
        code: 'PXD_STORE_QUOTA', message: /空き容量.*編集内容は残っています/
      });
      assert.equal((await store.load('store-project')).revisionId, initial.revisionId);
      assert.equal(fake.rows.get('store-project').history.length, 1);
      const reopened = await createPxdStore({ idFactory: sequence('reopen') }).load('store-project');
      assert.equal(reopened.revisionId, initial.revisionId);
      assert.deepEqual(reopened.entries.find((entry) => entry.path === 'image/raw.rgba').bytes, new Uint8Array([1, 2, 3, 0]));
    }
    const retried = await store.save(edited, { expectedRevisionId: initial.revisionId });
    assert.notEqual(retried.revisionId, initial.revisionId);
    assert.deepEqual((await store.load('store-project')).entries.find((entry) => entry.path === 'image/raw.rgba').bytes, new Uint8Array([6, 6, 6, 0]));
  } finally {
    if (original === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = original;
  }
});

test('IndexedDB save keeps nonquota errors generic and compare-and-swap conflicts specific', async () => {
  const original = globalThis.indexedDB;
  const fake = fakeIndexedDb();
  globalThis.indexedDB = fake;
  try {
    const store = createPxdStore({ idFactory: sequence('error') });
    const initial = await store.save(project(), { expectedRevisionId: null });
    const edited = setPxdBytes(initial, 'image/raw.rgba', new Uint8Array([7, 7, 7, 0]));
    fake.setPutFailure({ when: 'async', error: Object.assign(new Error('disk failure'), { name: 'UnknownError' }) });
    await assert.rejects(store.save(edited, { expectedRevisionId: initial.revisionId }), { code: 'PXD_IDB_WRITE_FAILED' });
    await assert.rejects(store.save(edited, { expectedRevisionId: 'stale-revision' }), { code: 'PXD_STORE_CONFLICT' });
    assert.equal((await store.load('store-project')).revisionId, initial.revisionId);
  } finally {
    if (original === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = original;
  }
});

test('permanent bulk removal is atomic, frees every selected revision, and preserves unrelated/deleted histories', async () => {
  const adapter = createMemoryPxdAdapter(); const store = createPxdStore({ adapter, idFactory: sequence('purge') });
  const first = await store.save(project());
  const latest = await store.save(first, { expectedRevisionId: first.revisionId });
  const second = await store.save({ ...project(), projectId: 'second-project' });
  const trash = await store.save({ ...project(), projectId: 'old-trash' });
  await store.deleteProject(trash.projectId, { expectedRevisionId: trash.revisionId });
  await assert.rejects(store.purgeProjects([
    { projectId: first.projectId, expectedRevisionId: first.revisionId },
    { projectId: second.projectId, expectedRevisionId: second.revisionId }
  ]), { code: 'PXD_STORE_CONFLICT' });
  assert.equal((await store.load(second.projectId)).revisionId, second.revisionId);
  assert.deepEqual(await adapter.listRevisionIds(first.projectId), [first.revisionId, latest.revisionId]);
  await assert.rejects(store.purgeProjects([]), { code: 'PXD_STORE_DELETE_EMPTY' });
  await assert.rejects(store.purgeProjects([
    { projectId: latest.projectId, expectedRevisionId: latest.revisionId },
    { projectId: latest.projectId, expectedRevisionId: latest.revisionId }
  ]), { code: 'PXD_STORE_DELETE_DUPLICATE' });
  await store.purgeProjects([
    { projectId: latest.projectId, expectedRevisionId: latest.revisionId },
    { projectId: second.projectId, expectedRevisionId: second.revisionId }
  ]);
  assert.deepEqual(await adapter.listRevisionIds(first.projectId), []);
  assert.equal(await store.load(second.projectId), null);
  assert.deepEqual(await adapter.listRevisionIds(trash.projectId), [trash.revisionId]);
  await assert.rejects(store.save(latest, { expectedRevisionId: latest.revisionId }), { code: 'PXD_STORE_CONFLICT' });
  assert.equal(await store.load(first.projectId), null);
  await assert.rejects(store.save(latest, { expectedRevisionId: null }), { code: 'PXD_PROJECT_DELETED' });
});

test('IndexedDB catalog and payload are written and purged in one transaction', async () => {
  const original = globalThis.indexedDB; const fake = fakeIndexedDb(); globalThis.indexedDB = fake;
  try {
    const store = createPxdStore({ idFactory: sequence('indexed-purge') });
    const first = await store.save(project());
    const second = await store.save({ ...project(), projectId: 'second-project' });
    assert.equal(fake.catalog.get(first.projectId).revisionId, first.revisionId);
    assert.equal(Object.hasOwn(fake.catalog.get(first.projectId), 'bytes'), false);
    assert.equal(Object.hasOwn(fake.catalog.get(first.projectId), 'history'), false);
    await assert.rejects(store.purgeProjects([
      { projectId: first.projectId, expectedRevisionId: first.revisionId },
      { projectId: second.projectId, expectedRevisionId: 'stale' }
    ]), { code: 'PXD_STORE_CONFLICT' });
    assert.equal(fake.rows.size, 2); assert.equal(fake.catalog.size, 2);
    await store.purgeProject(first.projectId, { expectedRevisionId: first.revisionId });
    assert.equal(fake.rows.has(first.projectId), false); assert.deepEqual(Object.keys(fake.catalog.get(first.projectId)).sort(), ['projectId', 'purgedAt']);
    assert.equal((await store.load(second.projectId)).revisionId, second.revisionId);
    await assert.rejects(store.save(first, { expectedRevisionId: null }), { code: 'PXD_PROJECT_DELETED' });
    assert.deepEqual((await store.listProjects({ includeDeleted: true })).projects.map(item => item.projectId), [second.projectId]);
  } finally { if (original === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = original; }
});

test('a valid catalog lists without reading or decoding PXD payloads', async () => {
  const memory = createMemoryPxdAdapter(); const writer = createPxdStore({ adapter: memory, idFactory: sequence('metadata') });
  const saved = await writer.save(project());
  const store = createPxdStore({ adapter: {
    compareAndSwap: (...args) => memory.compareAndSwap(...args),
    read() { throw new Error('Unexpected payload read'); },
    listLatest() { throw new Error('Unexpected payload listing'); },
    listCatalog: (...args) => memory.listCatalog(...args)
  } });
  assert.deepEqual((await store.listProjects()).projects.map(item => item.projectId), [saved.projectId]);
});

test('catalog cache never authorizes loading corrupt PXD bytes', async () => {
  const memory = createMemoryPxdAdapter(); const store = createPxdStore({ adapter: memory, idFactory: sequence('corrupt') });
  const saved = await store.save(project());
  const record = await memory.read(saved.projectId);
  await memory.compareAndSwap(saved.projectId, saved.revisionId, { ...record, revisionId: 'bad-version', bytes: new Uint8Array([1, 2]) });
  assert.equal((await store.listProjects()).projects.length, 1);
  await assert.rejects(store.load(saved.projectId), { code: 'PXD_MAGIC_INVALID' });
});


test('permanent deletion checks canonical head even when catalog metadata is stale', async () => {
  const original = globalThis.indexedDB; const fake = fakeIndexedDb(); globalThis.indexedDB = fake;
  try {
    const store = createPxdStore({ idFactory: sequence('stale-catalog') });
    const first = await store.save(project());
    const oldMetadata = structuredClone(fake.catalog.get(first.projectId));
    const latest = await store.save(first, { expectedRevisionId: first.revisionId });
    fake.catalog.set(first.projectId, oldMetadata);
    await assert.rejects(store.purgeProject(first.projectId, { expectedRevisionId: first.revisionId }), { code: 'PXD_STORE_CONFLICT' });
    assert.equal((await store.load(first.projectId)).revisionId, latest.revisionId);
    assert.equal(fake.rows.get(first.projectId).history.length, 2);
  } finally { if (original === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = original; }
});

test('scoped catalog filters known owners before fallback payload reads, preserves unscoped behavior, and retries', async () => {
  const memory = createMemoryPxdAdapter(); const writer = createPxdStore({ adapter: memory, idFactory: sequence('scoped') });
  for (const [id, tool] of [['owned', 'draw'], ['foreign', 'audio'], ['untagged', null]]) {
    await writer.save(createPxdProject({ projectId: id, manifest: tool ? { toolProject: { tool, schemaVersion: 1 } } : {} }));
  }
  const records = await memory.listCatalog();
  // Force thumbnail fallback while keeping ownership metadata available.
  for (const row of records) row.summary = { toolProject: row.summary.toolProject };
  const reads = []; const scopes = []; let fail = true;
  const store = createPxdStore({ adapter: { ...memory,
    async listCatalog(scope) { scopes.push(scope); if (fail) { fail = false; throw Error('temporary'); } return records; },
    async readLatest(id) { reads.push(id); return memory.readLatest(id); }
  } });
  await assert.rejects(store.listProjects({ tool: 'draw', source: 'owned' }), /temporary/);
  assert.deepEqual((await store.listProjects({ tool: 'draw', source: 'owned' })).projects.map(x => x.projectId), ['owned']);
  assert.deepEqual(reads, ['owned']); reads.length = 0;
  assert.deepEqual((await store.listProjects({ tool: 'draw', source: 'imports' })).projects.map(x => x.projectId).sort(), ['foreign', 'untagged']);
  assert.deepEqual(reads.sort(), ['foreign', 'untagged']); reads.length = 0;
  assert.equal((await store.listProjects()).projects.length, 3);
  assert.deepEqual(reads.sort(), ['foreign', 'owned', 'untagged']);
  assert.equal(scopes[0].source, 'owned');
});

test('unknown legacy ownership caches classification without generating a hidden summary, then lists on request', async () => {
  const memory = createMemoryPxdAdapter(); const writer = createPxdStore({ adapter: memory, idFactory: sequence('legacy-scope') });
  await writer.save(createPxdProject({ projectId: 'legacy-foreign', manifest: { toolProject: { tool: 'audio', schemaVersion: 1 } } }));
  const [record] = await memory.listCatalog(); record.summary = null; record.galleryOwner = 'unknown';
  const owners = []; const summaries = [];
  const store = createPxdStore({ adapter: { ...memory, async listCatalog() { return [record]; },
    async cacheOwner(id, revision, owner) { owners.push(owner); record.galleryOwner = owner; },
    async cacheSummary(id, revision, summary) { summaries.push(summary); record.summary = summary; }
  } });
  assert.deepEqual((await store.listProjects({ tool: 'draw', source: 'owned' })).projects, []);
  assert.deepEqual(owners, ['tool:audio']); assert.equal(summaries.length, 0);
  assert.equal((await store.listProjects({ tool: 'draw', source: 'imports' })).projects.length, 1);
  assert.equal(summaries.length, 1);
  assert.equal((await memory.listRevisionIds('legacy-foreign')).length, 1);
});
