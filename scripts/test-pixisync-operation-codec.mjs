import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const loadModule = async path => {
  const source = await readFile(path, 'utf8');
  globalThis.window = { PiXiEEDrawModules: {}, crypto: globalThis.crypto, btoa: value => Buffer.from(value, 'binary').toString('base64'), atob: value => Buffer.from(value, 'base64').toString('binary') };
  new Function(source)();
  return globalThis.window.PiXiEEDrawModules;
};

const root = await loadModule(new URL('../pixiedraw/assets/js/modules/pixisync-operation-codec-utils.js', import.meta.url));
const codec = root.pixisyncOperationCodecUtils.createPiXiSyncOperationCodecUtils();
const raw = codec.encodePixelPatch([
  { index: 20, paletteValue: 4 },
  { index: 3, paletteValue: 1 },
  { index: 20, paletteValue: 7 },
  { index: 90, paletteValue: 0 },
], { cellCount: 128 });
const decoded = codec.decodePixelPatch(raw, { cellCount: 128 });
assert.deepEqual(decoded, [{ index: 3, paletteValue: 1 }, { index: 20, paletteValue: 7 }, { index: 90, paletteValue: 0 }]);
assert.deepEqual([...codec.encodePixelPatch(decoded, { cellCount: 128 })], [...raw]);
assert.deepEqual([...codec.base64ToBytes(codec.bytesToBase64(raw))], [...raw]);
assert.throws(() => codec.encodePixelPatch([{ index: 1, paletteValue: 255 }], { cellCount: 2 }), /palette-value-out-of-range/);
assert.throws(() => codec.decodePixelPatch(Uint8Array.from([...raw, 0]), { cellCount: 128 }), /trailing-bytes/);
assert.throws(() => codec.decodePixelPatch(Uint8Array.from([0x50, 0x69, 0x58, 0x53, 1, 0, 0]), { cellCount: 128 }), /invalid-change-count/);
const guarded = codec.encodePixelPatch([{ index: 3, paletteValue: 0, expectedWriterRevision: 9007199254740999n }], { cellCount: 128, guarded: true });
assert.deepEqual(codec.decodePixelPatch(guarded, { cellCount: 128 }), [{ index: 3, paletteValue: 0, expectedWriterRevision: 9007199254740999n }]);
assert.deepEqual([...codec.encodePixelPatch(codec.decodePixelPatch(guarded, { cellCount: 128 }), { cellCount: 128, guarded: true })], [...guarded]);
assert.throws(() => codec.encodePixelPatch([{ index: 3, paletteValue: 0 }], { cellCount: 128, guarded: true }), /invalid-expected-writer-revision/);
assert.throws(() => codec.encodePixelPatch([{ index: 3, paletteValue: 0, expectedWriterRevision: 9223372036854775808n }], { cellCount: 128, guarded: true }), /invalid-expected-writer-revision/);
const emptyConfirmed = codec.encodePixelPatch([], { cellCount: 128, allowEmpty: true });
assert.deepEqual(codec.decodePixelPatch(emptyConfirmed, { cellCount: 128, allowEmpty: true }), []);
assert.throws(() => codec.decodePixelPatch(emptyConfirmed, { cellCount: 128 }), /invalid-change-count/);

const stampRoot = await loadModule(new URL('../pixiedraw/assets/js/modules/pixisync-writer-stamp-utils.js', import.meta.url));
const stamps = stampRoot.pixisyncWriterStampUtils.createPiXiSyncWriterStampUtils();
const pixels = Uint8Array.from([1, 2, 3]);
const writers = stamps.createWriterStamps(pixels.length);
stamps.applyUnconditionalPatch({ changes: [{ index: 1, paletteValue: 8 }], revision: 4, stamps: writers, setValue: (index, value) => { pixels[index] = value; } });
assert.equal(writers.tileCount, 1);
assert.equal(writers.get(1), 4n);
assert.deepEqual(stamps.applyConditionalPatch({ changes: [{ index: 1, paletteValue: 2 }], expectedRevision: 4, revision: 5, stamps: writers, getValue: index => pixels[index], setValue: (index, value) => { pixels[index] = value; } }), [{ index: 1, before: 8, after: 2 }]);
stamps.applyUnconditionalPatch({ changes: [{ index: 1, paletteValue: 9 }], revision: 6, stamps: writers, setValue: (index, value) => { pixels[index] = value; } });
assert.deepEqual(stamps.applyConditionalPatch({ changes: [{ index: 1, paletteValue: 8 }], expectedRevision: 5, revision: 7, stamps: writers, getValue: index => pixels[index], setValue: (index, value) => { pixels[index] = value; } }), []);
const sparseWriters = stamps.createWriterStamps(268435456);
assert.equal(sparseWriters.tileCount, 0);
sparseWriters.set(268435455, 9223372036854775807n);
assert.equal(sparseWriters.tileCount, 1);
assert.equal(sparseWriters.get(268435455), 9223372036854775807n);
assert.throws(() => sparseWriters.set(0, 9223372036854775808n), /invalid-revision/);
console.log('PiXiSYNC codec and conditional writer-stamp tests passed');

const orderRoot = await loadModule(new URL('../pixiedraw/assets/js/modules/pixisync-order-keeper-utils.js', import.meta.url));
const order = orderRoot.pixisyncOrderKeeperUtils.createPiXiSyncOrderKeeperUtils();
const applied = [];
const gaps = [];
const recoveries = [];
const operation = revision => ({ operationId: `00000000-0000-4000-8000-${String(revision).padStart(12, '0')}`, revision, payloadSha256: String(revision).repeat(64).slice(0, 64) });
const keeper = order.createOrderKeeper({ applyConfirmed: item => applied.push(item.revision), onGap: gap => gaps.push(gap), onRecoveryRequired: recovery => recoveries.push(recovery) });
assert.equal(keeper.receive(operation(2)).status, 'gap');
assert.equal(keeper.receive(operation(1)).status, 'applied');
assert.deepEqual(applied, [1, 2]);
assert.equal(keeper.confirmedRevision, 2n);
assert.equal(keeper.receive(operation(2)).status, 'duplicate');
assert.equal(gaps.length, 1);
assert.equal(recoveries.length, 0);
const highStart = 9007199254740993n;
const highApplied = [];
const highKeeper = order.createOrderKeeper({ confirmedRevision: highStart, applyConfirmed: item => highApplied.push(item.revision) });
const highOperation = {
  operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  revision: (highStart + 1n).toString(),
  payloadSha256: 'ab'.repeat(32),
};
assert.equal(highKeeper.receive(highOperation).status, 'applied');
assert.equal(highKeeper.confirmedRevision, highStart + 1n);
assert.throws(() => order.createOrderKeeper({ confirmedRevision: Number(highStart), applyConfirmed() {} }), /unsafe-number-revision/);
console.log('PiXiSYNC order keeper tests passed');

const realtimeRoot = await loadModule(new URL('../pixiedraw/assets/js/modules/pixisync-realtime-client-utils.js', import.meta.url));
const realtime = realtimeRoot.pixisyncRealtimeClientUtils.createPiXiSyncRealtimeClientUtils({ codec, orderKeeperFactory: options => order.createOrderKeeper(options), journal: { put: async () => {}, remove: async () => {} } });
const rpcCalls = [];
let committedRow = null;
let serverRevision = 0;
const fakeSupabase = {
  rpc: async (name, params) => {
    rpcCalls.push({ name, params });
    if (name === 'pixisync_commit_operation') {
      serverRevision += 1;
      const requestPayload = Uint8Array.from(Buffer.from(params.p_payload.slice(2), 'hex'));
      const guarded = params.p_kind === 'undo_pixel_patch' || params.p_kind === 'redo_pixel_patch';
      const requestChanges = codec.decodePixelPatch(requestPayload, { cellCount: params.p_canvas_width * params.p_canvas_height });
      const confirmedChanges = guarded
        ? (params.p_operation_id.startsWith('eeee') ? [] : requestChanges.map(({ index, paletteValue }) => ({ index, paletteValue })))
        : requestChanges;
      const confirmedPayload = guarded
        ? codec.encodePixelPatch(confirmedChanges, { cellCount: params.p_canvas_width * params.p_canvas_height, allowEmpty: true })
        : requestPayload;
      const confirmedHash = await codec.sha256Hex(confirmedPayload);
      committedRow = { revision: String(serverRevision), operation_id: params.p_operation_id, kind: params.p_kind, canvas_id: params.p_canvas_id, frame_id: params.p_frame_id, layer_id: params.p_layer_id, canvas_width: params.p_canvas_width, canvas_height: params.p_canvas_height, pixel_count: confirmedChanges.length, payload_b64: codec.bytesToBase64(confirmedPayload), payload_sha256_hex: confirmedHash };
      return { data: [{ commit_status: 'committed', revision: String(serverRevision), payload_b64: committedRow.payload_b64, payload_sha256_hex: confirmedHash, pixel_count: confirmedChanges.length }], error: null };
    }
    return { data: committedRow ? [committedRow] : [], error: null };
  },
  channel: () => ({
    on() { return this; },
    subscribe(callback) { callback?.('SUBSCRIBED'); return this; },
    send: async () => {},
  }),
  removeChannel: async () => {},
};
let remoteApplyCount = 0;
let localConfirmCount = 0;
const realtimeClient = realtime.createClient({ supabase: fakeSupabase, roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', clientId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', recoverOnSubscribe: false, applyConfirmed: () => { remoteApplyCount += 1; }, onLocalConfirmed: () => { localConfirmCount += 1; } });
await realtimeClient.start();
await realtimeClient.commit({ operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', changes: [{ index: 17, paletteValue: 3 }], canvasId: 'canvas-a', frameId: 'frame-a', layerId: 'layer-a', canvasWidth: 32, canvasHeight: 16 });
assert.equal(rpcCalls[0].name, 'pixisync_commit_operation');
assert.deepEqual([rpcCalls[0].params.p_canvas_id, rpcCalls[0].params.p_frame_id, rpcCalls[0].params.p_layer_id], ['canvas-a', 'frame-a', 'layer-a']);
assert.equal(rpcCalls[0].params.p_canvas_width, 32);
assert.equal(rpcCalls[0].params.p_canvas_height, 16);
assert.equal(remoteApplyCount, 1);
assert.equal(localConfirmCount, 1);
assert.equal(realtimeClient.pendingOperationCount, 0);
assert.equal(realtimeClient.confirmedRevision, 1n);
await realtimeClient.commit({
  operationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  kind: 'undo_pixel_patch',
  changes: [{ index: 17, paletteValue: 0, expectedWriterRevision: 1n }],
  canvasId: 'canvas-a',
  frameId: 'frame-a',
  layerId: 'layer-a',
  canvasWidth: 32,
  canvasHeight: 16,
  undoOfOperationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
});
assert.equal(remoteApplyCount, 2);
assert.equal(localConfirmCount, 2);
assert.equal(realtimeClient.confirmedRevision, 2n);
await realtimeClient.commit({
  operationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  kind: 'undo_pixel_patch',
  changes: [{ index: 17, paletteValue: 0, expectedWriterRevision: 1n }],
  canvasId: 'canvas-a',
  frameId: 'frame-a',
  layerId: 'layer-a',
  canvasWidth: 32,
  canvasHeight: 16,
  undoOfOperationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
});
assert.equal(remoteApplyCount, 3);
assert.equal(localConfirmCount, 3);
assert.equal(realtimeClient.confirmedRevision, 3n);
console.log('PiXiSYNC realtime RPC adapter tests passed');

const bridgeRoot = await loadModule(new URL('../pixiedraw/assets/js/modules/pixisync-pixel-mutation-bridge-utils.js', import.meta.url));
const blankDirectLayer = {
  directOnly: true,
  indices: new Uint8Array(8 * 8),
  direct: new Uint8ClampedArray(8 * 8 * 4),
  importSourceDirect: new Uint8ClampedArray(8 * 8 * 4),
};
assert.equal(bridgeRoot.pixisyncPixelMutationBridgeUtils.isIndexedLayerCompatible(blankDirectLayer), true);
assert.equal(blankDirectLayer.directOnly, true, 'compatibility checks must not mutate the layer');
const visibleDirectLayer = {
  directOnly: true,
  direct: new Uint8ClampedArray(8 * 8 * 4),
};
visibleDirectLayer.direct[3] = 255;
assert.equal(bridgeRoot.pixisyncPixelMutationBridgeUtils.isIndexedLayerCompatible(visibleDirectLayer), false);
assert.equal(visibleDirectLayer.directOnly, true);
const writes = [];
const bridge = bridgeRoot.pixisyncPixelMutationBridgeUtils.createPiXiSyncPixelMutationBridgeUtils({
  resolveTarget: mutation => mutation.canvasId === 'canvas-a' ? { layer: {}, width: 8, height: 8 } : null,
  writeLayerPixelPatchValue: (_layer, index, value) => { writes.push({ index, value }); return true; },
});
const mutation = bridge.toPixelMutation({ __historyEntryType: 'pixelPatch', historyLabel: 'pen', canvasId: 'canvas-a', frameId: 'frame-a', layerId: 'layer-a', width: 8, height: 8, changes: [{ index: 2, before: { paletteIndex: 0, direct: [0, 0, 0, 0] }, after: { paletteIndex: 4, direct: [0, 0, 0, 0] } }] });
assert.deepEqual(mutation.changes, [{ index: 2, paletteValue: 4, beforePaletteValue: 0 }]);
for (const historyLabel of [
  'pen',
  'eraser',
  'line',
  'curve',
  'rect',
  'rectFill',
  'ellipse',
  'ellipseFill',
  'fill',
  'fillDither',
  'fillGradient',
]) {
  assert.ok(bridge.toPixelMutation({
    __historyEntryType: 'pixelPatch',
    historyLabel,
    canvasId: 'canvas-a',
    frameId: 'frame-a',
    layerId: 'layer-a',
    width: 8,
    height: 8,
    changes: [{
      index: 3,
      before: { paletteIndex: 0, direct: null, importSourceDirect: null },
      after: { paletteIndex: 5, direct: null, importSourceDirect: null },
    }],
  }), `${historyLabel} must convert to a PiXiSYNC pixel mutation`);
}
assert.equal(bridge.applyPixelMutation(mutation).applied, 1);
assert.deepEqual(writes, [{ index: 2, value: { paletteIndex: 4 } }]);
const tileMutation = bridge.toPixelMutation({
  __historyEntryType: 'pixelPatch',
  kind: 'raster-tile-patch',
  historyLabel: 'eraser',
  canvasId: 'canvas-a',
  frameId: 'frame-a',
  layerId: 'layer-a',
  width: 8,
  height: 8,
  tiles: [{
    x: 2,
    y: 1,
    width: 2,
    height: 2,
    beforeIndices: Uint8Array.from([3, 3, 3, 3]),
    afterIndices: Uint8Array.from([3, 0, 3, 3]),
    beforeDirect: null,
    afterDirect: null,
  }],
});
assert.deepEqual(tileMutation.changes, [{ index: 11, paletteValue: 0, beforePaletteValue: 3 }]);
const largeFillCount = 9000;
const largeBridge = bridgeRoot.pixisyncPixelMutationBridgeUtils.createPiXiSyncPixelMutationBridgeUtils({
  resolveTarget: mutation => ({ layer: {}, width: mutation.canvasWidth, height: mutation.canvasHeight }),
  writeLayerPixelPatchValue: () => true,
});
const largeFillMutations = largeBridge.toPixelMutations({
  __historyEntryType: 'pixelPatch',
  kind: 'solid-fill-runs',
  historyLabel: 'fill',
  canvasId: 'canvas-a',
  frameId: 'frame-a',
  layerId: 'layer-a',
  width: 100,
  height: 100,
  runs: new Int32Array([0, largeFillCount]),
  beforeIndices: new Uint8Array(largeFillCount),
  beforeDirect: null,
  afterPaletteIndex: 9,
});
assert.equal(largeFillMutations.length, 2);
assert.equal(largeFillMutations[0].changes.length, 8192);
assert.equal(largeFillMutations[1].changes.length, largeFillCount - 8192);
assert.deepEqual(largeFillMutations[1].changes.at(-1), {
  index: largeFillCount - 1,
  paletteValue: 9,
  beforePaletteValue: 0,
});
assert.equal(largeBridge.toPixelMutations({
  __historyEntryType: 'pixelPatch',
  kind: 'solid-fill-runs',
  historyLabel: 'fill',
  canvasId: 'canvas-a',
  frameId: 'frame-a',
  layerId: 'layer-a',
  width: 8,
  height: 8,
  runs: new Int32Array([0, 4, 3, 2]),
  beforeIndices: new Uint8Array(6),
  afterPaletteIndex: 2,
}), null, 'overlapping fill runs must be rejected');
assert.equal(bridge.toPixelMutation({ __historyEntryType: 'pixelPatch', historyLabel: 'pen', changes: [{ index: 0, after: { paletteIndex: 0, direct: [1, 2, 3, 255] } }] }), null);
console.log('PiXiSYNC pixel mutation bridge tests passed');

const sessionRoot = await loadModule(new URL('../pixiedraw/assets/js/modules/pixisync-session-state.js', import.meta.url));
const createSession = sessionRoot.pixisyncSessionState.createPiXiSyncSessionState;
const owner = createSession({ role: 'owner' });
assert.equal(owner.getSnapshot().phase, 'local');
assert.equal(owner.canDraw(), false);
let result = owner.dispatch({ type: 'OPEN_REQUEST', projectKey: 'room-a' });
assert.equal(result.state.phase, 'creating');
assert.equal(result.effects[0].type, 'ENSURE_ROOM');
const ownerEpoch = result.state.epoch;
result = owner.dispatch({ type: 'ROOM_READY', epoch: ownerEpoch, roomId: 'room-a', status: 'active', generation: '1' });
assert.equal(result.effects[0].type, 'OPEN_PRIVATE_CHANNEL');
result = owner.dispatch({ type: 'CHANNEL_SUBSCRIBED', epoch: ownerEpoch, generation: '1', topic: 'pixisync:room:room-a', private: true });
assert.equal(result.state.phase, 'syncing');
assert.equal(result.effects[0].type, 'LOAD_CHECKPOINT');
owner.dispatch({ type: 'CHECKPOINT_LOADED', epoch: ownerEpoch, generation: '1', revision: '10' });
owner.dispatch({ type: 'INITIAL_TAIL_APPLIED', epoch: ownerEpoch, generation: '1', revision: '12' });
result = owner.dispatch({ type: 'AUTHORITATIVE_HEAD', epoch: ownerEpoch, generation: '1', revision: '13' });
assert.equal(owner.canDraw(), false);
assert.deepEqual(result.effects, [{ type: 'FETCH_RETAIL', afterRevision: '12' }]);
result = owner.dispatch({ type: 'RETAIL_APPLIED', epoch: ownerEpoch, generation: '1', revision: '13' });
assert.equal(result.state.phase, 'active');
assert.equal(owner.canDraw(), true);
result = owner.dispatch({ type: 'GAP_DETECTED', epoch: ownerEpoch });
assert.equal(result.state.phase, 'reconnecting');
assert.equal(owner.canDraw(), false);
const reconnectEpoch = result.state.epoch;
assert.equal(owner.dispatch({ type: 'CHECKPOINT_LOADED', epoch: reconnectEpoch - 1, generation: '1', revision: '13' }).ignored, true);
owner.dispatch({ type: 'CHANNEL_SUBSCRIBED', epoch: reconnectEpoch, generation: '1', topic: 'pixisync:room:room-a', private: true });
owner.dispatch({ type: 'CHECKPOINT_LOADED', epoch: reconnectEpoch, generation: '1', revision: '13' });
owner.dispatch({ type: 'INITIAL_TAIL_APPLIED', epoch: reconnectEpoch, generation: '1', revision: '13' });
owner.dispatch({ type: 'AUTHORITATIVE_HEAD', epoch: reconnectEpoch, generation: '1', revision: '13' });
owner.dispatch({ type: 'RETAIL_APPLIED', epoch: reconnectEpoch, generation: '1', revision: '13' });
assert.equal(owner.getSnapshot().phase, 'active');
owner.dispatch({ type: 'PENDING_OPERATION_COUNT', epoch: reconnectEpoch, count: 32 });
assert.equal(owner.canDraw(), false);
owner.dispatch({ type: 'PENDING_OPERATION_COUNT', epoch: reconnectEpoch, count: 0 });
assert.equal(owner.canDraw(), true);
result = owner.dispatch({ type: 'CLOSE_REQUEST' });
assert.equal(result.state.phase, 'closing');
assert.deepEqual(result.effects.map(effect => effect.type), ['FLUSH_PENDING', 'STOP_PRESENCE', 'REMOVE_CHANNEL']);
assert.equal(owner.dispatch({ type: 'CLOSED', epoch: result.state.epoch }).state.phase, 'archived');

const viewer = createSession({ role: 'participant', canEdit: false });
result = viewer.dispatch({ type: 'JOIN_REQUEST', projectKey: 'room-a' });
const viewerEpoch = result.state.epoch;
viewer.dispatch({ type: 'MEMBERSHIP_OK', epoch: viewerEpoch, roomId: 'room-a', status: 'active', generation: '1', canEdit: false });
viewer.dispatch({ type: 'CHANNEL_SUBSCRIBED', epoch: viewerEpoch, generation: '1', topic: 'pixisync:room:room-a', private: true });
viewer.dispatch({ type: 'CHECKPOINT_LOADED', epoch: viewerEpoch, generation: '1', revision: 0 });
viewer.dispatch({ type: 'INITIAL_TAIL_APPLIED', epoch: viewerEpoch, generation: '1', revision: 0 });
viewer.dispatch({ type: 'AUTHORITATIVE_HEAD', epoch: viewerEpoch, generation: '1', revision: 0 });
viewer.dispatch({ type: 'RETAIL_APPLIED', epoch: viewerEpoch, generation: '1', revision: 0 });
assert.equal(viewer.getSnapshot().phase, 'active');
assert.equal(viewer.canDraw(), false);
console.log('PiXiSYNC session state tests passed');
