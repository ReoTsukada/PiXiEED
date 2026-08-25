import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const modulePath = fileURLToPath(new URL('../pixiedraw/assets/js/modules/core-pixisync-convergence-utils.js', import.meta.url));
const source = await readFile(modulePath, 'utf8');
const appWindow = {};
const load = new Function('window', `${source}\nreturn window.PiXiEEDrawModules.corePixiSyncConvergenceUtils;`);
const api = load(appWindow);

function applyOperation(state, operation) {
  if (operation.payload.type !== 'setValue') throw new Error('unsupported operation');
  state.value = operation.payload.value;
}

const sync = api.createCorePixiSyncConvergence({ applyOperation });
sync.registerReplica('client-a', { value: 0 });
sync.registerReplica('client-b', { value: 0 });

const op1 = { operationId: 'op-1', projectId: 'project-wp050', clientId: 'client-a', baseRevision: 0, structureEpoch: 0, clientSequence: 1, payload: { type: 'setValue', value: 1 } };
const op2 = { operationId: 'op-2', projectId: 'project-wp050', clientId: 'client-a', baseRevision: 1, structureEpoch: 0, clientSequence: 2, payload: { type: 'setValue', value: 2 } };
const op3 = { operationId: 'op-3', projectId: 'project-wp050', clientId: 'client-a', baseRevision: 2, structureEpoch: 0, clientSequence: 3, payload: { type: 'setValue', value: 3 } };

const c1 = sync.commit(op1);
const c2 = sync.commit(op2);
const c3 = sync.commit(op3);
assert.equal(c1.ok && c2.ok && c3.ok, true);
assert.equal(sync.deliver('client-a', [c1.operation, c2.operation, c3.operation]).ok, true);
assert.equal(sync.deliver('client-b', [c1.operation]).ok, true);
assert.equal(sync.receive('client-b', c1.operation).duplicate, true, 'duplicate delivery must be idempotent');
assert.equal(sync.receive('client-b', c3.operation).error.code, 'SYNC_REVISION_GAP');
assert.equal(sync.deliver('client-b', [c2.operation, c3.operation]).ok, true);
assert.equal(sync.snapshotReplica('client-a').state.value, 3);
assert.equal(sync.snapshotReplica('client-b').state.value, 3);

sync.setOnline('client-b', false);
const offline = { operationId: 'op-offline', projectId: 'project-wp050', clientId: 'client-b', baseRevision: 3, structureEpoch: 0, clientSequence: 1, payload: { type: 'setValue', value: 4 } };
assert.equal(sync.queueOffline('client-b', offline).pending, true);
assert.deepEqual(sync.snapshotReplica('client-b').pendingOperationIds, ['op-offline']);
sync.setOnline('client-b', true);
assert.deepEqual(sync.reconcile('client-b').pendingOperationIds, ['op-offline'], 'offline operation remains queued until explicit confirmation');

const guardedUndo = { operationId: 'op-undo', projectId: 'project-wp050', clientId: 'client-a', baseRevision: 3, structureEpoch: 0, clientSequence: 4, guardedUndo: { targetOperationId: 'op-1' }, payload: { type: 'setValue', value: 0 } };
assert.equal(sync.commit(guardedUndo).error.code, 'SYNC_GUARDED_UNDO_CONFLICT');

const forbiddenBlob = { ...op1, operationId: 'op-blob', baseRevision: 3, clientSequence: 4, payload: { type: 'setValue', value: 5, audioBytes: [1, 2, 3] } };
assert.equal(sync.commit(forbiddenBlob).error.code, 'SYNC_BLOB_PAYLOAD_FORBIDDEN');
const huge = { ...op1, operationId: 'op-huge', baseRevision: 3, clientSequence: 4, payload: { type: 'setValue', value: 'x'.repeat(api.MAX_OPERATION_BYTES) } };
assert.equal(sync.commit(huge).error.code, 'SYNC_OPERATION_TOO_LARGE');
assert.equal(sync.snapshotReplica('client-a').revision, 3, 'rejected operations must not advance the replica');
assert.doesNotMatch(source, /\b(indexedDB|fetch|XMLHttpRequest|Date|Math\.random)\b/, 'convergence adapter must not own storage/network/time/random');
console.log('WP-050 Core PiXiSYNC convergence tests passed: convergence, duplicate, gap, offline queue, guarded undo, Blob boundary');
