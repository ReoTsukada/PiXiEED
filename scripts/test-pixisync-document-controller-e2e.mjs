import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.window = {
  PiXiEEDrawModules: {},
  crypto: globalThis.crypto,
  btoa: value => Buffer.from(value, 'binary').toString('base64'),
  atob: value => Buffer.from(value, 'base64').toString('binary'),
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
};

for (const relativePath of [
  '../pixiedraw/assets/js/modules/pixisync-operation-codec-utils.js',
  '../pixiedraw/assets/js/modules/pixisync-document-operation-utils.js',
  '../pixiedraw/assets/js/modules/pixisync-writer-stamp-utils.js',
  '../pixiedraw/assets/js/modules/pixisync-order-keeper-utils.js',
  '../pixiedraw/assets/js/modules/pixisync-realtime-client-utils.js',
  '../pixiedraw/assets/js/modules/pixisync-collaboration-controller-utils.js',
]) {
  new Function(await readFile(new URL(relativePath, import.meta.url), 'utf8'))();
}

const modules = window.PiXiEEDrawModules;
const pixelCodec = modules.pixisyncOperationCodecUtils.createPiXiSyncOperationCodecUtils();
const documentCodec = modules.pixisyncDocumentOperationUtils;
const writerUtils = modules.pixisyncWriterStampUtils.createPiXiSyncWriterStampUtils();
const orderUtils = modules.pixisyncOrderKeeperUtils.createPiXiSyncOrderKeeperUtils();
const journalRecords = new Map();
const journal = {
  async put(record) { journalRecords.set(`${record.roomId}/${record.clientId}/${record.operationId}`, record); },
  async remove(roomId, operationId) {
    for (const key of journalRecords.keys()) {
      if (key.startsWith(`${roomId}/`) && key.endsWith(`/${operationId}`)) journalRecords.delete(key);
    }
  },
  async list(roomId, clientId) {
    return [...journalRecords.entries()]
      .filter(([key]) => key.startsWith(`${roomId}/${clientId}/`))
      .map(([, record]) => record);
  },
};
const realtimeUtils = modules.pixisyncRealtimeClientUtils.createPiXiSyncRealtimeClientUtils({
  codec: pixelCodec,
  documentCodec,
  orderKeeperFactory: options => orderUtils.createOrderKeeper(options),
  journal,
});

const TARGET = Object.freeze({
  canvasId: 'canvas-1',
  frameId: 'frame-1',
  layerId: 'layer-1',
  canvasWidth: 4,
  canvasHeight: 4,
});
const INITIAL_PALETTE = [
  { r: 0, g: 0, b: 0, a: 0 },
  { r: 0, g: 0, b: 0, a: 255 },
];
const paletteOperation = value => ({
  version: 1,
  type: 'palette',
  palette: [...INITIAL_PALETTE, { r: value, g: value, b: value, a: 255 }],
});
const structureOperation = layerIds => ({
  version: 1,
  type: 'document_structure',
  document: {
    palette: INITIAL_PALETTE,
    canvases: [{
      id: 'canvas-1',
      name: 'Canvas',
      width: 4,
      height: 4,
      frames: [{
        id: 'frame-1',
        name: 'Frame',
        duration: 100,
        layers: layerIds.map((id, index) => ({
          id,
          trackId: `track-${index + 1}`,
          name: `Layer ${index + 1}`,
          opacity: 1,
          blendMode: 'normal',
        })),
      }],
    }],
  },
});

class Server {
  constructor() {
    this.revision = 0n;
    this.structureEpoch = 0;
    this.rows = [];
    this.delayNextPixelActor = '';
    this.releaseDelayedPixel = null;
    this.failNextDocument = false;
    this.delayNextDocumentActor = '';
    this.releaseDelayedDocument = null;
  }

  async commitPixel(actor, params) {
    if (this.delayNextPixelActor === actor) {
      this.delayNextPixelActor = '';
      await new Promise(resolve => { this.releaseDelayedPixel = resolve; });
    }
    if (Number(params.p_structure_epoch) !== this.structureEpoch) {
      return { data: null, error: new Error('structure_epoch_mismatch') };
    }
    const payload = Uint8Array.from(Buffer.from(params.p_payload.slice(2), 'hex'));
    const hash = await pixelCodec.sha256Hex(payload);
    assert.equal(hash, params.p_payload_sha256.slice(2));
    const changes = pixelCodec.decodePixelPatch(payload, {
      cellCount: params.p_canvas_width * params.p_canvas_height,
    });
    this.revision += 1n;
    const row = {
      revision: this.revision.toString(),
      operation_id: params.p_operation_id,
      kind: params.p_kind,
      codec_version: 1,
      structure_epoch: this.structureEpoch,
      canvas_id: params.p_canvas_id,
      frame_id: params.p_frame_id,
      layer_id: params.p_layer_id,
      canvas_width: params.p_canvas_width,
      canvas_height: params.p_canvas_height,
      pixel_count: changes.length,
      payload_b64: pixelCodec.bytesToBase64(payload),
      payload_sha256_hex: hash,
    };
    this.rows.push(row);
    return { data: [{
      commit_status: 'committed',
      revision: row.revision,
      payload_b64: row.payload_b64,
      payload_sha256_hex: row.payload_sha256_hex,
      pixel_count: row.pixel_count,
    }], error: null };
  }

  async commitDocument(actor, params) {
    if (this.delayNextDocumentActor === actor) {
      this.delayNextDocumentActor = '';
      await new Promise(resolve => { this.releaseDelayedDocument = resolve; });
    }
    if (this.failNextDocument) {
      this.failNextDocument = false;
      return { data: null, error: new Error('forced_document_failure') };
    }
    if (BigInt(params.p_base_revision) !== this.revision) {
      return { data: null, error: new Error('base_revision_mismatch') };
    }
    if (Number(params.p_structure_epoch) !== this.structureEpoch) {
      return { data: null, error: new Error('structure_epoch_mismatch') };
    }
    const payload = Uint8Array.from(Buffer.from(params.p_payload.slice(2), 'hex'));
    const hash = await pixelCodec.sha256Hex(payload);
    assert.equal(hash, params.p_payload_sha256.slice(2));
    documentCodec.decode(payload);
    this.revision += 1n;
    this.structureEpoch += 1;
    const row = {
      revision: this.revision.toString(),
      operation_id: params.p_operation_id,
      kind: 'document_patch',
      codec_version: 2,
      structure_epoch: this.structureEpoch,
      canvas_id: '__document__',
      frame_id: '__document__',
      layer_id: '__document__',
      canvas_width: 1,
      canvas_height: 1,
      pixel_count: 0,
      payload_b64: pixelCodec.bytesToBase64(payload),
      payload_sha256_hex: hash,
    };
    this.rows.push(row);
    return { data: [{
      commit_status: 'committed',
      revision: row.revision,
      structure_epoch: row.structure_epoch,
      pixel_count: 0,
      payload_b64: row.payload_b64,
      payload_sha256_hex: row.payload_sha256_hex,
    }], error: null };
  }

  tail(afterRevision) {
    return this.rows.filter(row => BigInt(row.revision) > BigInt(afterRevision));
  }
}

function createSession() {
  const snapshot = { epoch: 1, appliedRevision: '0', phase: 'active' };
  return {
    canDraw: () => snapshot.phase === 'active',
    getSnapshot: () => ({ ...snapshot }),
    dispatch(event) {
      if (event?.type === 'CONFIRMED_OPERATION_APPLIED') snapshot.appliedRevision = String(event.revision);
      return { state: { ...snapshot } };
    },
  };
}

function createClient(server, actor, ordinal) {
  const pixels = new Uint8Array(16);
  const session = createSession();
  let document = paletteOperation(10);
  let authoritativeRecoveryDocument = null;
  let operationOrdinal = 0;
  const recoveries = [];
  const blocked = [];
  const mutationBridge = {
    toPixelMutations(entry) { return entry?.mutation ? [entry.mutation] : []; },
    applyPixelMutation(mutation, { useBefore = false } = {}) {
      mutation.changes.forEach(change => {
        pixels[change.index] = useBefore ? change.beforePaletteValue : change.paletteValue;
      });
      return { applied: mutation.changes.length, appliedIndices: mutation.changes.map(change => change.index) };
    },
  };
  const documentBridge = {
    classifyHistoryLabel: label => documentCodec.classifyHistoryLabel(label),
    toDocumentOperation(entry, _label, _kind, { direction = 'forward' } = {}) {
      if (entry?.failPrepare) throw new Error('forced_prepare_failure');
      const documentOperation = structuredClone(entry[direction] || entry.forward);
      return { documentOperation };
    },
    applyDocumentOperation(operation) {
      document = structuredClone(operation);
      return true;
    },
    rollbackRejectedDocumentEntry(entry) {
      if (!entry?.rollbackTo) return false;
      document = structuredClone(entry.rollbackTo);
      return true;
    },
    async requestAuthoritativeRecovery() {
      if (authoritativeRecoveryDocument) document = structuredClone(authoritativeRecoveryDocument);
      controller.beginAuthoritativeResync(server.revision);
      return true;
    },
  };
  const supabase = {
    rpc: async (name, params) => {
      if (name === 'pixisync_commit_operation') return server.commitPixel(actor, params);
      if (name === 'pixisync_commit_document_operation') return server.commitDocument(actor, params);
      return { data: server.tail(params.p_after_revision), error: null };
    },
    channel: () => ({
      on() { return this; },
      subscribe(callback) { callback?.('SUBSCRIBED'); return this; },
      send: async () => ({ status: 'ok' }),
    }),
    removeChannel: async () => {},
  };
  let controller = modules.pixisyncCollaborationControllerUtils.createPiXiSyncCollaborationControllerUtils({
    mutationBridge,
    documentBridge,
    writerStampUtils: writerUtils,
    operationIdFactory: () => `00000000-0000-4000-8${ordinal}00-${String(++operationOrdinal).padStart(12, '0')}`,
    onRecoveryRequired: details => recoveries.push(details),
    onBlocked: details => blocked.push(details),
  });
  const realtimeClient = realtimeUtils.createClient({
    supabase,
    roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    clientId: `bbbbbbbb-bbbb-4bbb-8bbb-${String(ordinal).padStart(12, '0')}`,
    recoverOnSubscribe: false,
    applyConfirmed: (operation, metadata) => controller.applyConfirmed(operation, metadata),
  });
  controller.configure({ session, realtimeClient, structureEpoch: 0 });
  return {
    actor,
    pixels,
    session,
    controller,
    realtimeClient,
    clientId: `bbbbbbbb-bbbb-4bbb-8bbb-${String(ordinal).padStart(12, '0')}`,
    recoveries,
    blocked,
    get document() { return document; },
    set document(value) { document = structuredClone(value); },
    set authoritativeRecoveryDocument(value) { authoritativeRecoveryDocument = structuredClone(value); },
    draw(index, paletteValue) {
      const beforePaletteValue = pixels[index];
      pixels[index] = paletteValue;
      const mutation = { ...TARGET, changes: [{ index, paletteValue, beforePaletteValue }] };
      return controller.handleCommittedHistoryEntry({ historyLabel: 'pen', mutation }, 'pen');
    },
  };
}

const server = new Server();
const owner = createClient(server, 'owner', 1);
const editor = createClient(server, 'editor', 2);
await Promise.all([owner.realtimeClient.start(), editor.realtimeClient.start()]);
const converge = async () => Promise.all([
  owner.realtimeClient.recover('test'),
  editor.realtimeClient.recover('test'),
]);

// Local document operations remain optimistic locally, become authoritative at
// one revision, update the structure epoch, and apply remotely.
const paletteEntry = { historyLabel: 'paletteColor', forward: paletteOperation(40) };
owner.document = paletteEntry.forward;
const paletteCommit = owner.controller.handleCommittedHistoryEntry(paletteEntry, paletteEntry.historyLabel);
assert.equal(paletteCommit.status, 'accepted');
await paletteCommit.promise;
await converge();
assert.deepEqual(editor.document, paletteEntry.forward);
assert.equal(owner.controller.appliedRevision, 1n);
assert.equal(editor.controller.appliedRevision, 1n);
assert.equal(server.structureEpoch, 1);

// Visibility is a per-user preference; canonical metadata is gated and synced.
assert.equal(owner.controller.canBeginLocalOperation('setLayerVisibility'), true);
assert.equal(owner.controller.handleCommittedHistoryEntry({ historyLabel: 'setLayerVisibility' }).status, 'ignored');
for (const label of ['setLayerOpacity', 'setLayerBlendMode', 'setFrameFps', 'setAllFrameFps']) {
  assert.equal(owner.controller.canBeginLocalOperation(label), true, `${label} should use the document gate`);
}

// Structure Undo/Redo uses direction-specific canonical payloads and is not
// applied locally until the server confirms it.
const structureEntry = {
  historyLabel: 'addLayer',
  forward: structureOperation(['layer-1', 'layer-2']),
  undo: structureOperation(['layer-1']),
  redo: structureOperation(['layer-1', 'layer-2']),
};
owner.document = structureEntry.forward;
const structureForward = owner.controller.handleCommittedHistoryEntry(structureEntry, 'addLayer');
await structureForward.promise;
await converge();
assert.deepEqual(editor.document, structureEntry.forward);
const undo = owner.controller.requestUndo(structureEntry);
assert.equal(undo.status, 'accepted');
assert.deepEqual(owner.document, structureEntry.forward, 'document Undo must wait for confirmation');
await undo.promise;
await converge();
assert.deepEqual(owner.document, structureEntry.undo);
assert.deepEqual(editor.document, structureEntry.undo);
const redo = owner.controller.requestRedo(structureEntry);
assert.equal(redo.status, 'accepted');
await redo.promise;
await converge();
assert.deepEqual(owner.document, structureEntry.redo);
assert.deepEqual(editor.document, structureEntry.redo);

// A remote document operation invalidates an older optimistic pixel without
// reconnecting or surfacing its eventual stale-epoch RPC error.
server.delayNextPixelActor = 'owner';
const delayedPixel = owner.draw(5, 9);
assert.equal(delayedPixel.status, 'accepted');
assert.equal(owner.pixels[5], 9);
await new Promise(resolve => setTimeout(resolve, 0));
const remotePaletteEntry = { historyLabel: 'paletteColor', forward: paletteOperation(90) };
editor.document = remotePaletteEntry.forward;
const remoteDocument = editor.controller.handleCommittedHistoryEntry(remotePaletteEntry, 'paletteColor');
await remoteDocument.promise;
await owner.realtimeClient.recover('remote-document-invalidates-pixel');
assert.equal(owner.pixels[5], 0, 'optimistic pixel must roll back before document apply');
server.releaseDelayedPixel();
await delayedPixel.promise;
await converge();
assert.equal(owner.recoveries.length, 0, 'discarded stale pixel must not force recovery');
assert.equal(owner.controller.snapshot().pendingOperationCount, 0);
assert.equal(owner.controller.canBeginLocalOperation('pen', { colorMode: 'index', v1Compatible: true }), true);

// A rejected document commit rolls the optimistic local document back before
// the controller releases its input lock.
const beforeRejected = structuredClone(owner.document);
const rejectedTarget = paletteOperation(120);
owner.document = rejectedTarget;
owner.authoritativeRecoveryDocument = beforeRejected;
server.failNextDocument = true;
const rejected = owner.controller.handleCommittedHistoryEntry({
  historyLabel: 'paletteColor',
  forward: rejectedTarget,
  rollbackTo: beforeRejected,
}, 'paletteColor');
await assert.rejects(rejected.promise, /forced_document_failure/);
assert.deepEqual(owner.document, beforeRejected);
assert.equal(owner.controller.snapshot().pendingDocumentOperation, false);

// If another document revision wins while our commit is pending, the winning
// remote state stays authoritative; the stale local catch must not restore its
// older before snapshot over that revision.
const localRaceTarget = paletteOperation(130);
const remoteRaceTarget = paletteOperation(140);
// The production recovery bridge reloads the room checkpoint before replaying
// the ordered tail. Model that checkpoint explicitly in this in-memory test.
owner.authoritativeRecoveryDocument = remoteRaceTarget;
server.delayNextDocumentActor = 'owner';
owner.document = localRaceTarget;
const localRace = owner.controller.handleCommittedHistoryEntry({
  historyLabel: 'paletteColor',
  forward: localRaceTarget,
  rollbackTo: beforeRejected,
}, 'paletteColor');
await new Promise(resolve => setTimeout(resolve, 0));
editor.document = remoteRaceTarget;
const remoteRace = editor.controller.handleCommittedHistoryEntry({
  historyLabel: 'paletteColor',
  forward: remoteRaceTarget,
  rollbackTo: beforeRejected,
}, 'paletteColor');
await remoteRace.promise;
await owner.realtimeClient.recover('remote-document-wins-race');
assert.deepEqual(owner.document, remoteRaceTarget);
server.releaseDelayedDocument();
await assert.rejects(localRace.promise, /document-operation-(not-confirmed|invalidated-by-remote)|base_revision_mismatch/);
assert.deepEqual(owner.document, remoteRaceTarget, 'stale local rollback must not overwrite remote authority');
assert.equal(owner.controller.snapshot().pendingDocumentOperation, false);

// A failure proven to happen before commit is attempted can roll the local
// optimistic history entry back directly without a network recovery.
owner.document = rejectedTarget;
const prepareRejected = owner.controller.handleCommittedHistoryEntry({
  historyLabel: 'paletteColor',
  forward: rejectedTarget,
  rollbackTo: beforeRejected,
  failPrepare: true,
}, 'paletteColor');
await assert.rejects(prepareRejected.promise, /forced_prepare_failure/);
assert.deepEqual(owner.document, beforeRejected);

console.log('PiXiSYNC document controller/realtime integration tests passed');
