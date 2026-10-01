import test from 'node:test';
import assert from 'node:assert/strict';
import { createPxdProject, decodePxd, setPxdBytes } from '../../js/creation/pxd-codec.mjs';
import { createMemoryPxdAdapter, createPxdStore } from '../../js/creation/pxd-store.mjs';

function input() {
  return createPxdProject({ projectId: 'delete-project', revisionId: 'input-rev', entries: [
    { path: 'image/pixels.rgba', bytes: new Uint8Array([1, 2, 3, 4]) },
    { path: 'future/unknown.json', bytes: new TextEncoder().encode('{"keep":true}') }
  ], opaquePayloads: [{ bytes: new Uint8Array([0, 9, 8, 0]) }] });
}
function ids() { let n = 0; return () => `delete-rev-${++n}`; }

test('project deletion hides latest and history while retaining exact bytes and restores by current head', async () => {
  const adapter = createMemoryPxdAdapter(); const store = createPxdStore({ adapter, idFactory: ids() });
  const first = await store.save(input(), { expectedRevisionId: null });
  const second = await store.save(setPxdBytes(first, 'image/pixels.rgba', new Uint8Array([4, 3, 2, 1])), { expectedRevisionId: first.revisionId });
  const firstRecord = await adapter.read('delete-project', first.revisionId);
  const before = await adapter.read('delete-project', second.revisionId);
  await store.deleteProject('delete-project', { expectedRevisionId: second.revisionId });

  assert.equal(await store.load('delete-project'), null);
  assert.equal(await store.load('delete-project', first.revisionId), null);
  assert.deepEqual((await store.listProjects()).projects, []);
  const trashed = (await store.listProjects({ includeDeleted: true })).projects[0];
  assert.equal(trashed.revisionId, second.revisionId); assert.ok(Number.isFinite(trashed.deletedAt));
  await assert.rejects(store.save(second, { expectedRevisionId: second.revisionId }), { code: 'PXD_PROJECT_DELETED' });

  const restoredHead = await store.restoreProject('delete-project', { expectedRevisionId: second.revisionId });
  assert.notEqual(restoredHead.revisionId, second.revisionId);
  assert.equal((await store.load('delete-project')).revisionId, restoredHead.revisionId);
  const restored = await adapter.read('delete-project', second.revisionId);
  assert.deepEqual(restored.bytes, before.bytes);
  assert.deepEqual(await store.load('delete-project', first.revisionId), await decodePxd(firstRecord.bytes));
  const restoredProject = await store.load('delete-project'); const oldProject = await decodePxd(before.bytes);
  assert.deepEqual(restoredProject.manifest, oldProject.manifest);
  assert.deepEqual(restoredProject.entries, oldProject.entries);
  assert.deepEqual(restoredProject.opaquePayloads, oldProject.opaquePayloads);
  assert.deepEqual((await store.listProjects()).projects.map(({ revisionId }) => revisionId), [restoredHead.revisionId]);
  await assert.rejects(store.save(second, { expectedRevisionId: second.revisionId }), { code: 'PXD_STORE_CONFLICT' });
});

test('delete and restore compare the expected current head atomically', async () => {
  const adapter = createMemoryPxdAdapter(); const store = createPxdStore({ adapter, idFactory: ids() });
  const first = await store.save(input(), { expectedRevisionId: null });
  const second = await store.save(setPxdBytes(first, 'image/pixels.rgba', new Uint8Array([7])), { expectedRevisionId: first.revisionId });
  await assert.rejects(store.deleteProject('delete-project', { expectedRevisionId: first.revisionId }), { code: 'PXD_STORE_CONFLICT' });
  await store.deleteProject('delete-project', { expectedRevisionId: second.revisionId });
  await assert.rejects(store.restoreProject('delete-project', { expectedRevisionId: first.revisionId }), { code: 'PXD_STORE_CONFLICT' });
  const restored = await store.restoreProject('delete-project', { expectedRevisionId: second.revisionId });
  assert.notEqual(restored.revisionId, second.revisionId);
  assert.deepEqual(await adapter.listRevisionIds('delete-project'), [first.revisionId, second.revisionId, restored.revisionId]);
});

test('custom adapters without atomic deletion report deletion unavailable', async () => {
  const memory = createMemoryPxdAdapter();
  const adapter = { read: (...args) => memory.read(...args), compareAndSwap: (...args) => memory.compareAndSwap(...args), listLatest: (...args) => memory.listLatest() };
  const store = createPxdStore({ adapter, idFactory: ids() });
  await assert.rejects(store.deleteProject('delete-project', { expectedRevisionId: 'delete-rev-1' }), { code: 'PXD_STORE_DELETE_UNAVAILABLE' });
  await assert.rejects(store.restoreProject('delete-project', { expectedRevisionId: 'delete-rev-1' }), { code: 'PXD_STORE_DELETE_UNAVAILABLE' });
});
