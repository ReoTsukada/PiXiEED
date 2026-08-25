(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  const MAX_OPERATION_BYTES = 64 * 1024;
  const FORBIDDEN_BLOB_KEYS = new Set(['blob', 'audioBytes', 'fileBytes', 'rawBytes', 'base64']);

  function clone(value) {
    if (typeof structuredClone !== 'function') throw new Error('structuredClone is required for convergence isolation.');
    return structuredClone(value);
  }

  function diagnostic(code, message, path = '') {
    return { code, message, ...(path ? { path } : {}) };
  }

  function canonicalJson(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('Operation payload contains a non-finite number.');
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value instanceof Uint8Array) return canonicalJson({ $type: 'Uint8Array', data: Array.from(value) });
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    throw new TypeError(`Unsupported operation value: ${typeof value}`);
  }

  function validateOperation(operation) {
    if (!operation || typeof operation !== 'object') return diagnostic('SYNC_OPERATION_INVALID', 'Operation must be an object.');
    for (const field of ['operationId', 'projectId', 'clientId']) {
      if (typeof operation[field] !== 'string' || !operation[field]) return diagnostic('SYNC_REQUIRED_FIELD', `${field} is required.`, field);
    }
    if (!Number.isSafeInteger(operation.baseRevision) || operation.baseRevision < 0) return diagnostic('SYNC_BASE_REVISION_INVALID', 'baseRevision must be a non-negative safe integer.', 'baseRevision');
    if (!Number.isSafeInteger(operation.structureEpoch) || operation.structureEpoch < 0) return diagnostic('SYNC_STRUCTURE_EPOCH_INVALID', 'structureEpoch must be a non-negative safe integer.', 'structureEpoch');
    if (!Number.isSafeInteger(operation.clientSequence) || operation.clientSequence < 1) return diagnostic('SYNC_CLIENT_SEQUENCE_INVALID', 'clientSequence must be a positive safe integer.', 'clientSequence');
    if (!operation.payload || typeof operation.payload !== 'object') return diagnostic('SYNC_PAYLOAD_INVALID', 'Operation payload is required.', 'payload');
    const keys = Object.keys(operation.payload);
    const forbidden = keys.find(key => FORBIDDEN_BLOB_KEYS.has(key));
    if (forbidden) return diagnostic('SYNC_BLOB_PAYLOAD_FORBIDDEN', 'Large Blob bytes must use a hash/reference transfer.', `payload.${forbidden}`);
    let size;
    try { size = new TextEncoder().encode(canonicalJson(operation)).byteLength; } catch (error) { return diagnostic('SYNC_PAYLOAD_UNSERIALIZABLE', error?.message || String(error)); }
    if (size > MAX_OPERATION_BYTES) return diagnostic('SYNC_OPERATION_TOO_LARGE', `Operation exceeds ${MAX_OPERATION_BYTES} bytes.`);
    return null;
  }

  function createCorePixiSyncConvergence({ applyOperation = () => {} } = {}) {
    const server = { headRevision: 0, structureEpoch: 0, operations: [], byId: new Map() };
    const replicas = new Map();

    function registerReplica(replicaId, initialState = {}, { structureEpoch = 0 } = {}) {
      if (typeof replicaId !== 'string' || !replicaId) throw new Error('Replica ID is required.');
      if (replicas.has(replicaId)) throw new Error(`Replica already exists: ${replicaId}`);
      replicas.set(replicaId, {
        replicaId,
        online: true,
        revision: 0,
        structureEpoch,
        state: clone(initialState),
        appliedOperationIds: new Set(),
        pendingOperations: [],
      });
      return snapshotReplica(replicaId);
    }

    function getReplica(replicaId) {
      const replica = replicas.get(replicaId);
      if (!replica) throw new Error(`Replica not found: ${replicaId}`);
      return replica;
    }

    function snapshotReplica(replicaId) {
      const replica = getReplica(replicaId);
      return {
        replicaId: replica.replicaId,
        online: replica.online,
        revision: replica.revision,
        structureEpoch: replica.structureEpoch,
        state: clone(replica.state),
        pendingOperationIds: replica.pendingOperations.map(operation => operation.operationId),
      };
    }

    function commit(operation) {
      const validation = validateOperation(operation);
      if (validation) return { ok: false, error: validation };
      if (server.byId.has(operation.operationId)) return { ok: true, duplicate: true, operation: clone(server.byId.get(operation.operationId)) };
      if (server.projectId && operation.projectId !== server.projectId) return { ok: false, error: diagnostic('SYNC_PROJECT_MISMATCH', 'Operation belongs to another project.', 'projectId') };
      if (!server.projectId) server.projectId = operation.projectId;
      if (operation.baseRevision !== server.headRevision) return { ok: false, error: diagnostic('SYNC_REVISION_CONFLICT', `Expected base revision ${server.headRevision}, received ${operation.baseRevision}.`, 'baseRevision') };
      if (operation.structureEpoch !== server.structureEpoch) return { ok: false, error: diagnostic('SYNC_STRUCTURE_EPOCH_MISMATCH', `Expected structure epoch ${server.structureEpoch}, received ${operation.structureEpoch}.`, 'structureEpoch') };
      if (operation.guardedUndo) {
        const target = server.byId.get(operation.guardedUndo.targetOperationId);
        if (!target || target.revision !== server.headRevision) return { ok: false, error: diagnostic('SYNC_GUARDED_UNDO_CONFLICT', 'Guarded undo target is no longer the current confirmed operation.') };
      }
      const confirmed = { ...clone(operation), revision: server.headRevision + 1 };
      server.headRevision = confirmed.revision;
      server.operations.push(confirmed);
      server.byId.set(confirmed.operationId, confirmed);
      return { ok: true, operation: clone(confirmed) };
    }

    function receive(replicaId, operation) {
      const replica = getReplica(replicaId);
      const validation = validateOperation(operation);
      if (validation) return { ok: false, error: validation };
      if (!Number.isSafeInteger(operation.revision) || operation.revision < 1) return { ok: false, error: diagnostic('SYNC_REVISION_INVALID', 'Confirmed operation revision is invalid.', 'revision') };
      if (replica.appliedOperationIds.has(operation.operationId)) return { ok: true, duplicate: true, revision: replica.revision };
      if (operation.revision <= replica.revision) return { ok: false, error: diagnostic('SYNC_REVISION_REORDERED', 'Unknown operation arrived behind the replica revision.') };
      if (operation.revision !== replica.revision + 1) return { ok: false, error: diagnostic('SYNC_REVISION_GAP', `Expected revision ${replica.revision + 1}, received ${operation.revision}.`) };
      if (operation.structureEpoch !== replica.structureEpoch) return { ok: false, error: diagnostic('SYNC_STRUCTURE_EPOCH_MISMATCH', 'Replica structure epoch does not match confirmed operation.', 'structureEpoch') };
      const nextState = clone(replica.state);
      try { applyOperation(nextState, clone(operation)); } catch (error) { return { ok: false, error: diagnostic('SYNC_APPLY_FAILED', error?.message || String(error)) }; }
      replica.state = nextState;
      replica.revision = operation.revision;
      replica.appliedOperationIds.add(operation.operationId);
      return { ok: true, revision: replica.revision };
    }

    function deliver(replicaId, operations) {
      if (!Array.isArray(operations)) return { ok: false, error: diagnostic('SYNC_TAIL_INVALID', 'Operation tail must be an array.') };
      const results = [];
      for (const operation of operations) {
        const result = receive(replicaId, operation);
        results.push(result);
        if (!result.ok) return { ok: false, results, error: result.error };
      }
      return { ok: true, results };
    }

    function serverTail(afterRevision = 0) {
      return clone(server.operations.filter(operation => operation.revision > afterRevision));
    }

    function setOnline(replicaId, online) {
      const replica = getReplica(replicaId);
      replica.online = Boolean(online);
      return snapshotReplica(replicaId);
    }

    function queueOffline(replicaId, operation) {
      const replica = getReplica(replicaId);
      const validation = validateOperation(operation);
      if (validation) return { ok: false, error: validation };
      replica.pendingOperations.push(clone(operation));
      return { ok: true, pending: true, operationId: operation.operationId };
    }

    function reconcile(replicaId) {
      const replica = getReplica(replicaId);
      const result = deliver(replicaId, serverTail(replica.revision));
      return { ...result, pendingOperationIds: replica.pendingOperations.map(operation => operation.operationId) };
    }

    return Object.freeze({ registerReplica, commit, receive, deliver, serverTail, setOnline, queueOffline, reconcile, snapshotReplica, validateOperation });
  }

  root.corePixiSyncConvergenceUtils = Object.freeze({ MAX_OPERATION_BYTES, validateOperation, createCorePixiSyncConvergence });
})();
