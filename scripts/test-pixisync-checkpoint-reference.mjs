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
  '../pixiedraw/assets/js/modules/pixisync-order-keeper-utils.js',
  '../pixiedraw/assets/js/modules/pixisync-realtime-client-utils.js',
]) new Function(await readFile(new URL(relativePath, import.meta.url), 'utf8'))();

const modules = window.PiXiEEDrawModules;
const codec = modules.pixisyncOperationCodecUtils.createPiXiSyncOperationCodecUtils();
const order = modules.pixisyncOrderKeeperUtils.createPiXiSyncOrderKeeperUtils();
const checkpointReference = {
  version: 1,
  type: 'checkpoint_restore',
  objectPath: 'rooms/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/document-checkpoints/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pxd',
  sha256Hex: 'ab'.repeat(32),
  byteLength: 123,
};
const documentBytes = new TextEncoder().encode(JSON.stringify(checkpointReference));
const pixelBytes = codec.encodePixelPatch([{ index: 0, paletteValue: 1 }], { cellCount: 1 });
const rows = [
  {
    revision: '1', operation_id: '11111111-1111-4111-8111-111111111111',
    kind: 'document_patch', codec_version: 2, structure_epoch: 1,
    canvas_width: 1, canvas_height: 1, pixel_count: 0,
    payload_b64: codec.bytesToBase64(documentBytes),
    payload_sha256_hex: await codec.sha256Hex(documentBytes),
  },
  {
    revision: '2', operation_id: '22222222-2222-4222-8222-222222222222',
    kind: 'pixel_patch', codec_version: 1, structure_epoch: 1,
    canvas_id: 'canvas', frame_id: 'frame', layer_id: 'layer',
    canvas_width: 1, canvas_height: 1, pixel_count: 1,
    payload_b64: codec.bytesToBase64(pixelBytes),
    payload_sha256_hex: await codec.sha256Hex(pixelBytes),
  },
];
const documentCodec = {
  decode(bytes) { return JSON.parse(new TextDecoder().decode(bytes)); },
};
const events = [];
let releaseRestore;
const restoreBarrier = new Promise(resolve => { releaseRestore = resolve; });
let markRestoreStarted;
const restoreStarted = new Promise(resolve => { markRestoreStarted = resolve; });
const realtime = modules.pixisyncRealtimeClientUtils.createPiXiSyncRealtimeClientUtils({
  codec,
  documentCodec,
  orderKeeperFactory: options => order.createOrderKeeper(options),
  journal: { list: async () => [] },
});
const client = realtime.createClient({
  supabase: {
    rpc: async (_name, params = {}) => ({
      data: rows.filter(row => BigInt(row.revision) > BigInt(params.p_after_revision || 0)),
      error: null,
    }),
    channel: () => ({
      on() { return this; },
      subscribe(callback) { callback('SUBSCRIBED'); return this; },
    }),
    removeChannel: async () => {},
  },
  roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  clientId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  recoverOnSubscribe: false,
  prepareConfirmed: async operation => {
    if (operation.documentOperation?.type !== 'checkpoint_restore') return;
    events.push('restore-start');
    markRestoreStarted();
    await restoreBarrier;
    events.push('restore-complete');
  },
  applyConfirmed: operation => events.push(`apply-${operation.revision}`),
});
await client.start();
const syncing = client.syncFrom(0);
await restoreStarted;
assert.deepEqual(events, ['restore-start'], 'no operation may apply while checkpoint restore is pending');
releaseRestore();
assert.equal(await syncing, 2n);
assert.deepEqual(events, ['restore-start', 'restore-complete', 'apply-1', 'apply-2']);

// A broadcast-triggered recovery can finish before the session's initial-tail
// effect. That later effect must never rewind the order keeper to an older
// checkpoint revision and reapply confirmed operations.
const eventsAfterAuthoritativeRecovery = [...events];
assert.equal(await client.syncFrom(0), 2n);
assert.deepEqual(events, eventsAfterAuthoritativeRecovery);

const [documentMigration, uploadMigration, runtimeAdapter] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260801094501_pixisync_document_operations.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260801094502_pixisync_document_checkpoint_uploads.sql', import.meta.url), 'utf8'),
  readFile(new URL('../pixiedraw/assets/js/modules/pixisync-runtime-adapter-utils.js', import.meta.url), 'utf8'),
]);
assert.match(documentMigration, /checkpoint_restore/);
assert.match(documentMigration, /byteLength[\s\S]*?52428800/);
assert.match(uploadMigration, /p_base_revision <> v_room\.head_revision/);
assert.match(uploadMigration, /p_structure_epoch <> v_room\.structure_epoch/);
assert.match(uploadMigration, /document_checkpoint_blob_missing/);
assert.match(uploadMigration, /committed_revision is null[\s\S]*?v_upload\.committed_revision is null/);
assert.match(uploadMigration, /pixisync_list_stale_document_checkpoint_uploads/);
assert.match(uploadMigration, /v_upload\.committed_revision is not null[\s\S]*?document_checkpoint_abort_forbidden/);
assert.match(uploadMigration, /cleanup_claimed_by = v_user_id[\s\S]*?return query select v_upload\.storage_path/);
assert.match(uploadMigration, /document_checkpoint_blob_still_present/);
const cleanupFunction = runtimeAdapter.slice(
  runtimeAdapter.indexOf('async function cleanupDocumentCheckpointUpload'),
  runtimeAdapter.indexOf('async function prepareCheckpointOperation')
);
assert.ok(
  cleanupFunction.indexOf("rpc('pixisync_abort_document_checkpoint_upload'")
    < cleanupFunction.indexOf('removeCheckpointObject(claimedPath)'),
  'the server must atomically claim an uncommitted upload before Storage deletion'
);
assert.ok(
  cleanupFunction.indexOf('removeCheckpointObject(claimedPath)')
    < cleanupFunction.indexOf("rpc('pixisync_finalize_document_checkpoint_upload_cleanup'"),
  'the upload row is finalized only after Storage confirms deletion'
);

console.log('PiXiSYNC checkpoint reference barrier tests passed');
