import test from 'node:test';
import assert from 'node:assert/strict';
import { readToolOutput, removeToolOutputMaterial, restoreToolOutputMaterial, saveToolOutputItems, saveToolOutputMedia } from '../../js/creation/output-handoff-core.mjs';
import { needsDetailedOutput } from '../../js/creation/output-receive.mjs';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PNG = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });

class Tx {
  constructor(db, mode) {
    this.db = db; this.mode = mode;
    this.pending = mode === 'readwrite' ? new Map([...db.rows].map(([id, value]) => [id, structuredClone(value)])) : db.rows;
    this.finished = false;
  }
  objectStore() {
    const tx = this;
    const request = (run) => {
      const req = {};
      queueMicrotask(() => {
        if (tx.finished) return;
        try { req.result = run(); req.onsuccess?.(); queueMicrotask(() => tx.complete()); }
        catch (error) { req.error = error; req.onerror?.(); tx.abort(error); }
      });
      return req;
    };
    return {
      get: id => request(() => (tx.mode === 'readwrite' ? tx.pending : tx.db.rows).get(id)),
      put: record => request(() => { tx.pending.set(record.id, record); return record.id; }),
      add: record => request(() => { tx.pending.set(record.id, record); return record.id; }),
    };
  }
  complete() {
    if (this.finished) return;
    this.finished = true;
    if (this.mode === 'readwrite' && !this.db.abortNext) { this.db.rows = this.pending; this.db.afterCommit?.(this.db.rows); }
    if (this.db.abortNext) { this.db.abortNext = false; this.error = new Error('synthetic transaction abort'); this.onabort?.(); return; }
    this.oncomplete?.();
  }
  abort(error) { if (this.finished) return; this.finished = true; this.error = error; queueMicrotask(() => this.onabort?.()); }
}

class IDB {
  rows = new Map(); abortNext = false;
  open() {
    const req = {};
    queueMicrotask(() => {
      req.result = { objectStoreNames: { contains: () => true }, createObjectStore() {},
        transaction: (_name, mode) => new Tx(this, mode), close() {} };
      req.onsuccess?.();
    });
    return req;
  }
}

function record({ sources = null, mediaSource = null, materialInputState, outputs = null } = {}) {
  const blob = PNG();
  return { schemaVersion: 1, id: ID, createdAt: 1, expiresAt: 9_999_999, revision: 2,
    blob, mime: 'image/png', extension: 'png', filename: 'finished.png', source: 'test', sourceBlob: blob,
    mediaSources: sources, ...(mediaSource === null ? {} : { mediaSource }), mediaSettings: { playbackRate: 1, totalPlays: 3 },
    ...(materialInputState ? { materialInputState } : {}),
    outputs: outputs || [{ id: 'rendered', sourceId: sources?.[0]?.id || 'legacy', mime: 'image/png', extension: 'png', filename: 'rendered.png', blob, metadata: {} }],
  };
}

function imageSource(id = 'asset-one') {
  return { id, label: 'art.png', kind: 'rgba-frames', mediaSource: { kind: 'rgba-frames', width: 1, height: 1,
    totalPlays: 4, frames: [{ width: 1, height: 1, data: new Uint8Array([4, 3, 2, 255]), delayMs: 125, name: 'frame.png' }] } };
}

test('referenced deletion detaches the rendered row and retains both generated and source bytes', async () => {
  const idb = new IDB(), input = imageSource(), initial = record({ sources: [input] }); idb.rows.set(ID, initial);
  const bytesBefore = new Uint8Array(await initial.blob.arrayBuffer());
  const result = await removeToolOutputMaterial(ID, input.id, { indexedDBRef: idb, expectedRevision: 2, now: () => 1 });
  const raw = idb.rows.get(ID);
  assert.equal(result.revision, 3); assert.equal(raw.materialInputState, 'empty');
  assert.deepEqual(raw.mediaSources, []); assert.equal(raw.outputs[0].sourceId, '');
  assert.deepEqual(new Uint8Array(await raw.blob.arrayBuffer()), bytesBefore);
  assert.deepEqual(new Uint8Array(await raw.outputs[0].blob.arrayBuffer()), bytesBefore);
  assert.equal((await readToolOutput(ID, { indexedDBRef: idb, now: () => 1 })).outputs[0].sourceId, '');
  assert.equal(needsDetailedOutput(await readToolOutput(ID, { indexedDBRef: idb, now: () => 1 })), true);
});

test('undo restores raw pixels, frame timing, global source order, settings, and output references', async () => {
  const idb = new IDB(), first = imageSource('asset-one'), second = imageSource('asset-two');
  first.mediaSource.frames[0].data[0] = 11; first.mediaSource.frames[0].delayMs = 95;
  const initial = record({ sources: [first, second], outputs: [
    { id: 'row-a', sourceId: 'asset-one', mime: 'image/png', extension: 'png', filename: 'a.png', blob: PNG(), metadata: {} },
    { id: 'row-b', sourceId: 'asset-two', mime: 'image/png', extension: 'png', filename: 'b.png', blob: PNG(), metadata: {} },
  ] }); idb.rows.set(ID, initial);
  const removed = await removeToolOutputMaterial(ID, 'asset-one', { indexedDBRef: idb, expectedRevision: 2, now: () => 1 });
  assert.deepEqual(idb.rows.get(ID).mediaSources.map(item => item.id), ['asset-two']);
  assert.equal(idb.rows.get(ID).outputs[0].sourceId, '');
  const restored = await restoreToolOutputMaterial(ID, removed.snapshot, { indexedDBRef: idb, expectedRevision: removed.revision, now: () => 1 });
  const current = idb.rows.get(ID);
  assert.equal(restored.revision, 4); assert.deepEqual(current.mediaSources.map(item => item.id), ['asset-one', 'asset-two']);
  assert.deepEqual([...current.mediaSources[0].mediaSource.frames[0].data], [11, 3, 2, 255]);
  assert.equal(current.mediaSources[0].mediaSource.frames[0].delayMs, 95);
  assert.deepEqual(current.mediaSettings, initial.mediaSettings);
  assert.deepEqual(current.outputs.map(item => item.sourceId), ['asset-one', 'asset-two']);
});

test('last-source deletion marker survives reload routing and prevents legacy source resurrection', async () => {
  const idb = new IDB(), initial = record({ sources: [imageSource()] }); idb.rows.set(ID, initial);
  const removed = await removeToolOutputMaterial(ID, 'asset-one', { indexedDBRef: idb, expectedRevision: 2, now: () => 1 });
  const loaded = await readToolOutput(ID, { indexedDBRef: idb, now: () => 1 });
  assert.equal(loaded.materialInputState, 'empty'); assert.deepEqual(loaded.mediaSources, []);
  assert.equal(needsDetailedOutput(loaded), true); assert.equal(loaded.outputs[0].sourceId, '');
  await restoreToolOutputMaterial(ID, removed.snapshot, { indexedDBRef: idb, expectedRevision: removed.revision, now: () => 1 });
});

test('legacy virtual source undo restores absent fields and original raw representation', async () => {
  const idb = new IDB(), rawMediaSource = { kind: 'old-private-kind', frames: [{ token: 1 }] };
  const initial = record({ sources: [], mediaSource: rawMediaSource }); delete initial.materialInputState; idb.rows.set(ID, initial);
  const removed = await removeToolOutputMaterial(ID, 'legacy', { indexedDBRef: idb, expectedRevision: 2, now: () => 1 });
  assert.equal(idb.rows.get(ID).materialInputState, 'empty'); assert.equal(idb.rows.get(ID).mediaSource, null);
  await restoreToolOutputMaterial(ID, removed.snapshot, { indexedDBRef: idb, expectedRevision: removed.revision, now: () => 1 });
  const restored = idb.rows.get(ID);
  assert.equal(Object.hasOwn(restored, 'materialInputState'), false);
  assert.deepEqual(restored.mediaSource, rawMediaSource);
  assert.equal(restored.outputs[0].sourceId, 'legacy');
});

test('stale revision and aborted transaction make no partial material or reference mutation', async () => {
  const idb = new IDB(), initial = record({ sources: [imageSource()] }); idb.rows.set(ID, initial);
  const before = structuredClone(initial);
  await assert.rejects(removeToolOutputMaterial(ID, 'asset-one', { indexedDBRef: idb, now: () => 1 }), /改訂番号/);
  await assert.rejects(removeToolOutputMaterial(ID, 'asset-one', { indexedDBRef: idb, expectedRevision: 1, now: () => 1 }), /別のタブ/);
  assert.deepEqual(idb.rows.get(ID), before);
  idb.abortNext = true;
  await assert.rejects(removeToolOutputMaterial(ID, 'asset-one', { indexedDBRef: idb, expectedRevision: 2, now: () => 1 }), /abort/);
  assert.deepEqual(idb.rows.get(ID), before);
});

test('undo ticket is bound to its output record ID', async () => {
  const idb = new IDB(), initial = record({ sources: [imageSource()] }); idb.rows.set(ID, initial);
  const removed = await removeToolOutputMaterial(ID, 'asset-one', { indexedDBRef: idb, expectedRevision: 2, now: () => 1 });
  const before = structuredClone(idb.rows.get(ID));
  await assert.rejects(restoreToolOutputMaterial('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', removed.snapshot,
    { indexedDBRef: idb, expectedRevision: removed.revision, now: () => 1 }), /素材の状態/);
  assert.deepEqual(idb.rows.get(ID), before);
});


test('ordinary item and material writes return their own committed revision, never a later writer revision', async () => {
  for (const kind of ['items','media']) {
    const idb = new IDB(), initial = record({ sources: [imageSource()] }); idb.rows.set(ID, initial);
    idb.afterCommit = rows => { const next = structuredClone(rows.get(ID)); next.revision++; next.mediaSources[0].label = 'other-tab.png'; rows.set(ID,next); idb.afterCommit = null; };
    const saved = kind === 'items'
      ? await saveToolOutputItems(ID, initial.outputs, { indexedDBRef:idb, expectedRevision:2, now:()=>1 })
      : await saveToolOutputMedia(ID, initial.mediaSources, initial.mediaSettings, { indexedDBRef:idb, expectedRevision:2, now:()=>1 });
    assert.equal(saved.revision,3); assert.equal(idb.rows.get(ID).revision,4);
    if (kind === 'media') assert.equal(saved.mediaSources[0].label,'art.png');
    await assert.rejects(removeToolOutputMaterial(ID,'asset-one',{ indexedDBRef:idb,expectedRevision:saved.revision,now:()=>1 }),/別のタブ/);
    assert.equal(idb.rows.get(ID).mediaSources[0].label,'other-tab.png');
  }
});


test('stale or aborted undo never replaces newer data, and empty inputs can accept a new source without rebinding outputs', async () => {
  const idb = new IDB(); idb.rows.set(ID,record({sources:[imageSource()]}));
  const removed = await removeToolOutputMaterial(ID,'asset-one',{indexedDBRef:idb,expectedRevision:2,now:()=>1});
  const empty = structuredClone(idb.rows.get(ID)); idb.abortNext = true;
  await assert.rejects(restoreToolOutputMaterial(ID,removed.snapshot,{indexedDBRef:idb,expectedRevision:removed.revision,now:()=>1}),/abort/);
  assert.deepEqual(idb.rows.get(ID),empty);
  const saved = await saveToolOutputMedia(ID,[imageSource('new-source')],{}, {indexedDBRef:idb,expectedRevision:removed.revision,now:()=>1});
  const current = structuredClone(idb.rows.get(ID));
  assert.equal(current.materialInputState,'present'); assert.equal(current.outputs[0].sourceId,'');
  assert.equal(saved.mediaSources[0].id,'new-source');
  await assert.rejects(restoreToolOutputMaterial(ID,removed.snapshot,{indexedDBRef:idb,expectedRevision:removed.revision,now:()=>1}),/別のタブ/);
  assert.deepEqual(idb.rows.get(ID),current);
});
