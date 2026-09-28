import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalDraftStore, createMemoryDraftAdapter, LocalDraftConflictError, LocalDraftQuotaError } from '../../js/creation/local-drafts.mjs';
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
