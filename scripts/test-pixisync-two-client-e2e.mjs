import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

globalThis.window = {
  PiXiEEDrawModules: {},
  crypto: globalThis.crypto,
  btoa: value => Buffer.from(value, 'binary').toString('base64'),
  atob: value => Buffer.from(value, 'base64').toString('binary'),
};

for (const relativePath of [
  '../pixiedraw/assets/js/modules/pixisync-operation-codec-utils.js',
  '../pixiedraw/assets/js/modules/pixisync-writer-stamp-utils.js',
  '../pixiedraw/assets/js/modules/pixisync-order-keeper-utils.js',
  '../pixiedraw/assets/js/modules/pixisync-realtime-client-utils.js',
  '../pixiedraw/assets/js/modules/pixisync-pixel-mutation-bridge-utils.js',
  '../pixiedraw/assets/js/modules/pixisync-session-state.js',
  '../pixiedraw/assets/js/modules/pixisync-collaboration-controller-utils.js',
]) {
  new Function(await readFile(new URL(relativePath, import.meta.url), 'utf8'))();
}

const modules = window.PiXiEEDrawModules;
const codec = modules.pixisyncOperationCodecUtils.createPiXiSyncOperationCodecUtils();
const writerUtils = modules.pixisyncWriterStampUtils.createPiXiSyncWriterStampUtils();
const orderUtils = modules.pixisyncOrderKeeperUtils.createPiXiSyncOrderKeeperUtils();
const realtimeUtils = modules.pixisyncRealtimeClientUtils.createPiXiSyncRealtimeClientUtils({
  codec,
  orderKeeperFactory: options => orderUtils.createOrderKeeper(options),
  journal: { put: async () => {}, remove: async () => {} },
});
const createSession = modules.pixisyncSessionState.createPiXiSyncSessionState;
const WIDTH = 128;
const HEIGHT = 128;
const CELL_COUNT = WIDTH * HEIGHT;
const TARGET = Object.freeze({
  canvasId: 'canvas-v1',
  frameId: 'frame-v1',
  layerId: 'layer-v1',
  canvasWidth: WIDTH,
  canvasHeight: HEIGHT,
});

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const stampBytes = values => {
  const bytes = new Uint8Array(values.length * 8);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setBigUint64(index * 8, BigInt(value), true));
  return bytes;
};
const stateHash = (pixels, stamps) => sha256(Buffer.concat([Buffer.from(pixels), Buffer.from(stampBytes(stamps))]));

class AuthoritativeServer {
  constructor() {
    this.pixels = new Uint8Array(CELL_COUNT);
    this.writers = Array(CELL_COUNT).fill(0n);
    this.log = [];
    this.byOperationId = new Map();
    this.queue = Promise.resolve();
  }

  async commit(actor, params) {
    const task = this.queue.then(async () => {
      const existing = this.byOperationId.get(params.p_operation_id);
      if (existing) return this.result(existing, 'duplicate');
      const request = Uint8Array.from(Buffer.from(params.p_payload.slice(2), 'hex'));
      const requestHash = await codec.sha256Hex(request);
      assert.equal(requestHash, params.p_payload_sha256.slice(2));
      const guarded = params.p_kind === 'undo_pixel_patch' || params.p_kind === 'redo_pixel_patch';
      const changes = codec.decodePixelPatch(request, { cellCount: CELL_COUNT });
      const revision = BigInt(this.log.length + 1);
      let applied = changes;
      if (guarded) {
        const source = this.byOperationId.get(params.p_undo_of_operation_id);
        assert.ok(source);
        assert.equal(source.actor, actor);
        applied = changes
          .filter(change => {
            assert.equal(change.expectedWriterRevision, source.revision);
            return this.writers[change.index] === change.expectedWriterRevision;
          })
          .map(({ index, paletteValue }) => ({ index, paletteValue }));
      }
      applied.forEach(change => {
        this.pixels[change.index] = change.paletteValue;
        this.writers[change.index] = revision;
      });
      const canonicalPayload = guarded
        ? codec.encodePixelPatch(applied, { cellCount: CELL_COUNT, allowEmpty: true })
        : request;
      const canonicalHash = await codec.sha256Hex(canonicalPayload);
      const row = {
        actor,
        revision,
        operation_id: params.p_operation_id,
        operationId: params.p_operation_id,
        kind: params.p_kind,
        canvas_id: params.p_canvas_id,
        frame_id: params.p_frame_id,
        layer_id: params.p_layer_id,
        canvas_width: params.p_canvas_width,
        canvas_height: params.p_canvas_height,
        pixel_count: applied.length,
        requested_pixel_count: changes.length,
        skipped_pixel_count: changes.length - applied.length,
        payload_b64: codec.bytesToBase64(canonicalPayload),
        payload_sha256_hex: canonicalHash,
        undo_of_operation_id: params.p_undo_of_operation_id,
      };
      this.log.push(row);
      this.byOperationId.set(row.operation_id, row);
      return this.result(row, 'committed');
    });
    this.queue = task.catch(() => {});
    return task;
  }

  result(row, status) {
    return [{
      commit_status: status,
      revision: row.revision.toString(),
      payload_b64: row.payload_b64,
      payload_sha256_hex: row.payload_sha256_hex,
      pixel_count: row.pixel_count,
      requested_pixel_count: row.requested_pixel_count,
      skipped_pixel_count: row.skipped_pixel_count,
    }];
  }

  tail(afterRevision, { reverse = false } = {}) {
    const rows = this.log
      .filter(row => row.revision > BigInt(afterRevision))
      .map(row => ({ ...row, revision: row.revision.toString() }));
    return reverse ? rows.reverse() : rows;
  }

  replay() {
    const pixels = new Uint8Array(CELL_COUNT);
    const writers = Array(CELL_COUNT).fill(0n);
    this.log.forEach(row => {
      const changes = codec.decodePixelPatch(codec.base64ToBytes(row.payload_b64), {
        cellCount: CELL_COUNT,
        allowEmpty: row.pixel_count === 0,
      });
      changes.forEach(change => {
        pixels[change.index] = change.paletteValue;
        writers[change.index] = row.revision;
      });
    });
    return { pixels, writers };
  }
}

function activateSession(role) {
  const session = createSession({ role: role === 'owner' ? 'owner' : 'participant' });
  let result = session.dispatch(role === 'owner'
    ? { type: 'OPEN_REQUEST', projectKey: 'room-v1' }
    : { type: 'JOIN_REQUEST', projectKey: 'room-v1' });
  const epoch = result.state.epoch;
  session.dispatch(role === 'owner'
    ? { type: 'ROOM_READY', epoch, roomId: 'room-v1', status: 'active', generation: '1' }
    : { type: 'MEMBERSHIP_OK', epoch, roomId: 'room-v1', status: 'active', generation: '1', canEdit: true });
  session.dispatch({ type: 'CHANNEL_SUBSCRIBED', epoch, generation: '1', topic: 'pixisync:room:room-v1', private: true });
  session.dispatch({ type: 'CHECKPOINT_LOADED', epoch, generation: '1', revision: 0 });
  session.dispatch({ type: 'INITIAL_TAIL_APPLIED', epoch, generation: '1', revision: 0 });
  session.dispatch({ type: 'AUTHORITATIVE_HEAD', epoch, generation: '1', revision: 0 });
  session.dispatch({ type: 'RETAIL_APPLIED', epoch, generation: '1', revision: 0 });
  assert.equal(session.getSnapshot().phase, 'active');
  return session;
}

function createClientHarness(server, role, clientOrdinal) {
  const pixels = new Uint8Array(CELL_COUNT);
  const layer = { indices: pixels };
  const session = activateSession(role);
  let reverseNextTail = false;
  let writeCount = 0;
  const supabase = {
    rpc: async (name, params) => {
      if (name === 'pixisync_commit_operation') {
        return { data: await server.commit(role, params), error: null };
      }
      const data = server.tail(params.p_after_revision, { reverse: reverseNextTail });
      reverseNextTail = false;
      return { data, error: null };
    },
    channel: () => ({
      on() { return this; },
      subscribe(callback) { callback?.('SUBSCRIBED'); return this; },
      send: async () => ({ status: 'ok' }),
    }),
    removeChannel: async () => {},
  };
  const bridge = modules.pixisyncPixelMutationBridgeUtils.createPiXiSyncPixelMutationBridgeUtils({
    resolveTarget: mutation => (
      mutation.canvasId === TARGET.canvasId
      && mutation.frameId === TARGET.frameId
      && mutation.layerId === TARGET.layerId
        ? { layer, width: WIDTH, height: HEIGHT, v1Compatible: true }
        : null
    ),
    writeLayerPixelPatchValue: (_layer, index, value) => {
      writeCount += 1;
      pixels[index] = value.paletteIndex;
      return true;
    },
  });
  let operationOrdinal = 0;
  const controller = modules.pixisyncCollaborationControllerUtils.createPiXiSyncCollaborationControllerUtils({
    mutationBridge: bridge,
    writerStampUtils: writerUtils,
    operationIdFactory: () => `00000000-0000-4000-8${clientOrdinal}00-${String(++operationOrdinal).padStart(12, '0')}`,
    onRecoveryRequired: details => {
      throw new Error(`unexpected recovery: ${details.reason}`);
    },
  });
  const realtimeClient = realtimeUtils.createClient({
    supabase,
    roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    clientId: `bbbbbbbb-bbbb-4bbb-8bbb-${String(clientOrdinal).padStart(12, '0')}`,
    applyConfirmed: (operation, metadata) => controller.applyConfirmed(operation, metadata),
  });
  controller.configure({ session, realtimeClient });

  function draw(label, changes) {
    const entryChanges = changes.map(change => {
      const before = pixels[change.index];
      pixels[change.index] = change.paletteValue;
      return {
        index: change.index,
        before: { paletteIndex: before, direct: null, importSourceDirect: null },
        after: { paletteIndex: change.paletteValue, direct: null, importSourceDirect: null },
      };
    });
    const entry = {
      __historyEntryType: 'pixelPatch',
      version: 1,
      historyLabel: label,
      ...TARGET,
      width: WIDTH,
      height: HEIGHT,
      changes: entryChanges,
    };
    const accepted = controller.handleCommittedHistoryEntry(entry, label);
    accepted.entry = entry;
    return accepted;
  }

  function drawSolidFill(start, length, paletteValue) {
    const beforeIndices = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += 1) {
      beforeIndices[offset] = pixels[start + offset];
      pixels[start + offset] = paletteValue;
    }
    const entry = {
      __historyEntryType: 'pixelPatch',
      kind: 'solid-fill-runs',
      version: 1,
      historyLabel: 'fill',
      ...TARGET,
      width: WIDTH,
      height: HEIGHT,
      runs: new Int32Array([start, length]),
      beforeIndices,
      beforeDirect: null,
      afterPaletteIndex: paletteValue,
    };
    const accepted = controller.handleCommittedHistoryEntry(entry, 'fill');
    accepted.entry = entry;
    return accepted;
  }

  return {
    role,
    pixels,
    session,
    controller,
    realtimeClient,
    draw,
    drawSolidFill,
    get writeCount() { return writeCount; },
    reverseNextTail() { reverseNextTail = true; },
  };
}

const server = new AuthoritativeServer();
const clientA = createClientHarness(server, 'owner', 1);
const clientB = createClientHarness(server, 'editor', 2);
await Promise.all([clientA.realtimeClient.start(), clientB.realtimeClient.start()]);

async function converge() {
  await Promise.all([clientA.realtimeClient.recover('e2e'), clientB.realtimeClient.recover('e2e')]);
}

async function drawAndConverge(client, label, changes) {
  const accepted = client.draw(label, changes);
  assert.equal(accepted.status, 'accepted');
  await accepted.promise;
  await converge();
  return accepted;
}

// 1-2: A pen and B eraser use finalized history only.
const aPen = await drawAndConverge(clientA, 'pen', [{ index: 1, paletteValue: 5 }]);
assert.equal(clientA.pixels[1], 5);
assert.equal(clientB.pixels[1], 5);
assert.equal(clientA.writeCount, 0);
assert.ok(clientB.writeCount > 0);
for (const label of [
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
  assert.equal(clientA.controller.canBeginLocalOperation(label, {
    colorMode: 'index',
    v1Compatible: true,
  }), true, `${label} must be drawable in the app's canonical index mode while active`);
}
assert.equal(clientA.controller.canBeginLocalOperation('pen', {
  colorMode: 'indexed',
  v1Compatible: true,
}), true, 'legacy indexed mode spelling remains compatible');
assert.equal(clientA.controller.canBeginLocalOperation('pen', {
  colorMode: 'rgb',
  v1Compatible: true,
}), false, 'RGB mutations remain outside the indexed-patch protocol');
for (const label of ['selectRect', 'selectLasso', 'selectSame']) {
  assert.equal(clientA.controller.canBeginLocalOperation(label), true, `${label} must remain locally usable`);
}
for (const label of ['move', 'selectionMove', 'selectionTransform', 'selectionCut', 'selectionPastePixels']) {
  assert.equal(clientA.controller.canBeginLocalOperation(label, {
    colorMode: 'index',
    v1Compatible: true,
  }), true, `${label} must be available for indexed collaborative edits`);
}
assert.equal(clientA.controller.canBeginLocalOperation('pan'), true);
await drawAndConverge(clientA, 'line', [{ index: 2, paletteValue: 6 }]);
assert.equal(clientB.pixels[2], 6);
await drawAndConverge(clientA, 'selectionMove', [
  { index: 2, paletteValue: 0 },
  { index: 12, paletteValue: 6 },
]);
assert.equal(clientA.pixels[2], 0);
assert.equal(clientB.pixels[12], 6);
await drawAndConverge(clientB, 'fillGradient', [{ index: 3, paletteValue: 7 }]);
assert.equal(clientA.pixels[3], 7);
const largeFill = clientA.drawSolidFill(1000, 9000, 18);
assert.equal(largeFill.status, 'accepted');
await largeFill.promise;
await converge();
assert.equal(largeFill.operationIds.length, 2);
assert.equal(clientB.pixels[9999], 18);
const largeFillUndo = clientA.controller.requestUndo(largeFill.entry);
assert.equal(largeFillUndo.status, 'accepted');
assert.equal(largeFillUndo.operationIds.length, 2);
await largeFillUndo.promise;
await converge();
assert.equal(clientA.pixels[9999], 0);
assert.equal(clientB.pixels[9999], 0);
const largeFillRedo = clientA.controller.requestRedo(largeFill.entry);
assert.equal(largeFillRedo.status, 'accepted');
assert.equal(largeFillRedo.operationIds.length, 2);
await largeFillRedo.promise;
await converge();
assert.equal(clientA.pixels[9999], 18);
assert.equal(clientB.pixels[9999], 18);
await drawAndConverge(clientB, 'eraser', [{ index: 1, paletteValue: 0 }]);
assert.equal(clientA.pixels[1], 0);
assert.equal(clientB.pixels[1], 0);

// 3: same-cell normal conflict converges to the larger authoritative revision.
const conflictA = clientA.draw('pen', [{ index: 4, paletteValue: 6 }]);
const conflictB = clientB.draw('pen', [{ index: 4, paletteValue: 7 }]);
await Promise.all([conflictA.promise, conflictB.promise]);
await converge();
assert.equal(clientA.pixels[4], server.pixels[4]);
assert.equal(clientB.pixels[4], server.pixels[4]);

// 4: reversed delivery is buffered and then applied in revision order.
const reverseOne = await drawAndConverge(clientA, 'pen', [{ index: 5, paletteValue: 8 }]);
const reverseTwo = clientA.draw('pen', [{ index: 6, paletteValue: 9 }]);
await reverseTwo.promise;
clientB.reverseNextTail();
await clientB.realtimeClient.recover('reverse-tail');
assert.equal(clientB.realtimeClient.confirmedRevision, server.log.at(-1).revision);
assert.equal(clientB.pixels[5], 8);
assert.equal(clientB.pixels[6], 9);

// 5: duplicate operation ID returns the existing revision and never adds a row.
const duplicateId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const duplicateInput = { operationId: duplicateId, changes: [{ index: 7, paletteValue: 3 }], ...TARGET };
const operationCountBeforeDuplicate = server.log.length;
await clientA.realtimeClient.commit(duplicateInput);
await clientA.realtimeClient.commit(duplicateInput);
await converge();
assert.equal(server.log.length, operationCountBeforeDuplicate + 1);
assert.equal(clientA.realtimeClient.pendingOperationCount, 0);

// 6: missing Broadcast is recovered exclusively from the ordered DB tail.
const missingHint = clientA.draw('pen', [{ index: 8, paletteValue: 11 }]);
await missingHint.promise;
assert.notEqual(clientB.pixels[8], 11);
await clientB.realtimeClient.recover('broadcast-missing');
assert.equal(clientB.pixels[8], 11);

// 7: reconnecting blocks drawing until checkpoint + tail + head + re-tail converge.
let reconnect = clientA.session.dispatch({
  type: 'SOCKET_OFFLINE',
  epoch: clientA.session.getSnapshot().epoch,
});
assert.equal(reconnect.state.phase, 'reconnecting');
assert.equal(clientA.controller.canBeginLocalOperation('pen'), false);
const beforeDisconnectRevision = clientA.controller.appliedRevision;
await drawAndConverge(clientB, 'pen', [{ index: 9, paletteValue: 12 }]);
const reconnectEpoch = clientA.session.getSnapshot().epoch;
clientA.session.dispatch({ type: 'CHANNEL_SUBSCRIBED', epoch: reconnectEpoch, generation: '1', topic: 'pixisync:room:room-v1', private: true });
clientA.session.dispatch({ type: 'CHECKPOINT_LOADED', epoch: reconnectEpoch, generation: '1', revision: beforeDisconnectRevision });
await clientA.realtimeClient.recover('reconnect-tail');
clientA.session.dispatch({ type: 'INITIAL_TAIL_APPLIED', epoch: reconnectEpoch, generation: '1', revision: clientA.controller.appliedRevision });
clientA.session.dispatch({ type: 'AUTHORITATIVE_HEAD', epoch: reconnectEpoch, generation: '1', revision: server.log.length });
clientA.session.dispatch({ type: 'RETAIL_APPLIED', epoch: reconnectEpoch, generation: '1', revision: server.log.length });
assert.equal(clientA.session.getSnapshot().phase, 'active');
assert.equal(clientA.pixels[9], 12);

// 8: A's Undo cannot remove B's later writer.
const undoSource = await drawAndConverge(clientA, 'pen', [{ index: 10, paletteValue: 13 }]);
await drawAndConverge(clientB, 'pen', [{ index: 10, paletteValue: 14 }]);
const undoConflict = clientA.controller.requestUndo(undoSource.entry);
assert.equal(undoConflict.status, 'accepted');
assert.equal(clientA.pixels[10], 14, 'guarded Undo must not apply before server confirmation');
await undoConflict.promise;
await converge();
assert.equal(server.byOperationId.get(undoConflict.operationId).pixel_count, 0);
assert.equal(clientA.pixels[10], 14);
assert.equal(clientB.pixels[10], 14);

// 9: Redo guards the Undo revision, not the original draw revision.
const redoSource = await drawAndConverge(clientA, 'pen', [{ index: 11, paletteValue: 15 }]);
const undo = clientA.controller.requestUndo(redoSource.entry);
assert.equal(undo.status, 'accepted');
await undo.promise;
await converge();
await drawAndConverge(clientB, 'pen', [{ index: 11, paletteValue: 16 }]);
const redo = clientA.controller.requestRedo(redoSource.entry);
assert.equal(redo.status, 'accepted');
assert.equal(clientA.pixels[11], 16, 'guarded Redo must not apply before server confirmation');
await redo.promise;
await converge();
assert.equal(server.byOperationId.get(redo.operationId).pixel_count, 0);
assert.equal(clientA.pixels[11], 16);

// 10: client pixels/stamps, replayed log, writer state and session metadata converge.
const replayed = server.replay();
assert.deepEqual([...replayed.pixels], [...server.pixels]);
assert.deepEqual(replayed.writers, server.writers);
const expectedStateHash = stateHash(server.pixels, server.writers);
for (const client of [clientA, clientB]) {
  const snapshot = client.controller.snapshot();
  const firstTarget = snapshot.writerTargets[0];
  const clientWriters = Array(CELL_COUNT).fill(0n);
  for (const tile of firstTarget?.tiles || []) {
    tile.values.forEach((value, offset) => {
      const index = (tile.tileIndex * writerUtils.TILE_CELL_COUNT) + offset;
      if (index < CELL_COUNT) clientWriters[index] = BigInt(value);
    });
  }
  assert.equal(stateHash(client.pixels, clientWriters), expectedStateHash);
  assert.equal(snapshot.pendingOperationCount, 0);
  assert.deepEqual(snapshot.confirmedOperationIds, server.log.map(row => row.operation_id));
  assert.equal(snapshot.appliedRevision, String(server.log.length));
  assert.equal(client.realtimeClient.pendingOperationCount, 0);
  assert.deepEqual(client.realtimeClient.confirmedOperationIds, server.log.map(row => row.operation_id));
  const session = client.session.getSnapshot();
  assert.equal(session.phase, 'active');
  assert.equal(session.appliedRevision, String(server.log.length));
  assert.equal(session.authoritativeRevision, String(server.log.length));
}
assert.equal(sha256(clientA.pixels), sha256(clientB.pixels));
assert.equal(sha256(clientA.pixels), sha256(replayed.pixels));
assert.equal(sha256(clientA.pixels), sha256(server.pixels));
assert.ok(aPen.operationId && conflictA.operationId && conflictB.operationId && reverseOne.operationId && reverseTwo.operationId);

// Realtime authorization regression remains an explicit schema contract.
const realtimeMigration = await readFile(
  new URL('../supabase/migrations/20260730025332_pixisync_realtime_active_room_only.sql', import.meta.url),
  'utf8'
);
assert.match(realtimeMigration, /pixisync_can_access_realtime_topic/);
assert.match(realtimeMigration, /room\.status = 'active'/);
assert.match(realtimeMigration, /p_topic = 'pixisync:room:' \|\| room\.id::text/);
assert.match(realtimeMigration, /member\.revoked_at is null/);
assert.match(realtimeMigration, /member\.role in \('owner', 'editor'\)/);

// The production app must keep the collaboration send boundary at finalized history,
// and drawing admission must remain connected to the session-aware controller.
const [appSource, historySource, pointerSource] = await Promise.all([
  readFile(new URL('../pixiedraw/assets/js/app.js', import.meta.url), 'utf8'),
  readFile(
    new URL('../pixiedraw/assets/js/modules/history-core-workflow-utils.js', import.meta.url),
    'utf8'
  ),
  readFile(
    new URL('../pixiedraw/assets/js/modules/canvas-pointer-workflow-utils.js', import.meta.url),
    'utf8'
  ),
]);
assert.match(
  appSource,
  /function onCommittedHistoryEntry\(entry, label\)[\s\S]*handleCommittedHistoryEntry\(entry, label\)/
);
assert.match(appSource, /get canBeginPiXiSyncLocalOperation\(\)/);
assert.match(
  historySource,
  /history\.past\.push\(historyEntry\)[\s\S]*onCommittedHistoryEntry\?\.\(historyEntry, pendingLabel\)/
);
assert.match(pointerSource, /!canBeginPiXiSyncLocalOperation\(activeTool\)/);
assert.match(pointerSource, /!canBeginPiXiSyncLocalOperation\('selectionMove'\)/);
assert.match(pointerSource, /!canBeginPiXiSyncLocalOperation\('selectionTransform'\)/);

console.log('PiXiSYNC two-client finalized-history E2E passed');
