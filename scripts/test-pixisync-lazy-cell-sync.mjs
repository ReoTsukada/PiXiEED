import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.window = { PiXiEEDrawModules: {}, crypto: globalThis.crypto };
for (const path of [
  '../pixiedraw/assets/js/modules/pixisync-lazy-cell-sync-utils.js',
  '../pixiedraw/assets/js/modules/pixisync-writer-stamp-utils.js',
  '../pixiedraw/assets/js/modules/pixisync-collaboration-controller-utils.js',
]) {
  new Function(await readFile(new URL(path, import.meta.url), 'utf8'))();
}

const modules = window.PiXiEEDrawModules;
const active = { canvasId: 'canvas-1', frameId: 'frame-1', layerId: 'layer-1' };
const pixelsByLayer = new Map([
  ['layer-1', new Uint8Array(16)],
  ['layer-2', new Uint8Array(16)],
  ['layer-3', new Uint8Array(16)],
]);
const visibleLayerIds = new Set(['layer-1', 'layer-3']);
const appliedMutations = [];
const applyPixelMutation = mutation => {
  const pixels = pixelsByLayer.get(mutation.layerId);
  if (!pixels) return { applied: 0, appliedIndices: [] };
  mutation.changes.forEach(change => { pixels[change.index] = change.paletteValue; });
  appliedMutations.push(mutation);
  return { applied: mutation.changes.length, appliedIndices: mutation.changes.map(change => change.index) };
};
const lazy = modules.pixisyncLazyCellSyncUtils.createPiXiSyncLazyCellSyncUtils({
  isTargetActive: target => target.canvasId === active.canvasId
    && target.frameId === active.frameId
    && visibleLayerIds.has(target.layerId),
  applyPixelMutation,
});
const target = layerId => ({
  canvasId: 'canvas-1', frameId: 'frame-1', layerId, canvasWidth: 4, canvasHeight: 4,
});

assert.equal(lazy.shouldDefer({ ...target('layer-2'), changes: [] }), true);
assert.equal(lazy.shouldDefer({ ...target('layer-1'), changes: [] }), false);
assert.equal(lazy.shouldDefer({ ...target('layer-3'), changes: [] }), false, 'a visible non-active layer on the displayed frame must stay live');
assert.equal(
  lazy.shouldDefer({ ...target('layer-3'), frameId: 'frame-2', changes: [] }),
  true,
  'a visible layer on another frame must remain deferred until that frame is displayed'
);
assert.equal(lazy.defer({ ...target('layer-2'), changes: [{ index: 3, paletteValue: 1 }] }, 1).deferred, true);
lazy.defer({ ...target('layer-2'), changes: [{ index: 3, paletteValue: 2 }, { index: 7, paletteValue: 4 }] }, 2);
assert.equal(pixelsByLayer.get('layer-2')[3], 0, 'hidden layer pixels must remain untouched');
assert.deepEqual(lazy.snapshot(), {
  deferredTargetCount: 1,
  deferredChangeCount: 2,
  targets: [{ ...target('layer-2'), revision: '2', changeCount: 2 }],
});
assert.deepEqual(lazy.flushActive(), { applied: 0, ok: true });
visibleLayerIds.add('layer-2');
assert.deepEqual(lazy.flushActive(), { applied: 2, ok: true });
assert.equal(pixelsByLayer.get('layer-2')[3], 2, 'the latest coalesced pixel must win when the layer becomes visible');
assert.equal(pixelsByLayer.get('layer-2')[7], 4);
assert.equal(lazy.snapshot().deferredTargetCount, 0);

visibleLayerIds.delete('layer-2');
const mutationBridge = {
  toPixelMutations: entry => entry?.mutation ? [entry.mutation] : [],
  applyPixelMutation,
};
const appliedDocuments = [];
const sessionState = { epoch: 1, sessionGeneration: 1, appliedRevision: '0' };
const session = {
  canDraw: () => true,
  getSnapshot: () => ({ ...sessionState }),
  dispatch: event => {
    if (event?.type === 'CONFIRMED_OPERATION_APPLIED') sessionState.appliedRevision = String(event.revision);
  },
};
const controller = modules.pixisyncCollaborationControllerUtils.createPiXiSyncCollaborationControllerUtils({
  mutationBridge,
  writerStampUtils: modules.pixisyncWriterStampUtils.createPiXiSyncWriterStampUtils(),
  shouldDeferConfirmedMutation: mutation => lazy.shouldDefer(mutation),
  deferConfirmedMutation: (mutation, revision) => lazy.defer(mutation, revision),
  flushDeferredPixelMutations: () => lazy.flushAll(),
  clearDeferredPixelMutations: () => lazy.clear(),
  getDeferredPixelSnapshot: () => lazy.snapshot(),
  documentBridge: {
    applyDocumentOperation: operation => {
      appliedDocuments.push({ operation, layer2Pixel9: pixelsByLayer.get('layer-2')[9] });
      return true;
    },
  },
});
controller.configure({ session, realtimeClient: { commit: async () => null }, structureEpoch: 0 });
const confirmed = {
  operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  revision: '1',
  kind: 'pixel_patch',
  structureEpoch: 0,
  ...target('layer-2'),
  changes: [{ index: 5, paletteValue: 6 }],
};
const deferredResult = controller.applyConfirmed(confirmed, { local: false });
assert.equal(deferredResult.deferred, true);
assert.equal(controller.appliedRevision, 1n, 'global ordered revision must advance without rasterizing an inactive cell');
assert.equal(pixelsByLayer.get('layer-2')[5], 0);
assert.equal(controller.snapshot().deferredPixels.deferredChangeCount, 1);
visibleLayerIds.add('layer-2');
assert.deepEqual(lazy.flushActive(), { applied: 1, ok: true });
assert.equal(pixelsByLayer.get('layer-2')[5], 6, 'showing the layer must atomically hydrate its deferred final values');

visibleLayerIds.delete('layer-2');
const liveVisibleResult = controller.applyConfirmed({
  ...confirmed,
  operationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  revision: '2',
  layerId: 'layer-3',
  changes: [{ index: 4, paletteValue: 5 }],
}, { local: false });
assert.equal(liveVisibleResult.deferred, undefined);
assert.equal(pixelsByLayer.get('layer-3')[4], 5, 'a confirmed visible non-active layer patch must apply immediately');

controller.applyConfirmed({
  ...confirmed,
  operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  revision: '3',
  changes: [{ index: 9, paletteValue: 7 }],
}, { local: false });
assert.equal(pixelsByLayer.get('layer-2')[9], 0);
controller.applyConfirmed({
  operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  revision: '4',
  kind: 'document_patch',
  structureEpoch: 1,
  canvasId: '__document__',
  frameId: '__document__',
  layerId: '__document__',
  canvasWidth: 1,
  canvasHeight: 1,
  changes: [],
  documentOperation: { version: 1, type: 'structure_delta', data: { action: 'frame_add' } },
}, { local: false });
assert.equal(appliedDocuments.length, 1);
assert.equal(appliedDocuments[0].layer2Pixel9, 7, 'older deferred pixels must flush before a structural revision applies');
assert.equal(lazy.snapshot().deferredTargetCount, 0);

lazy.defer({ ...target('layer-2'), changes: [{ index: 11, paletteValue: 8 }] }, 5);
controller.beginAuthoritativeResync(4);
assert.equal(lazy.snapshot().deferredTargetCount, 0, 'authoritative resync must discard the stale deferred tail');

console.log('PiXiSYNC lazy hidden/offscreen-cell synchronization checks passed');
