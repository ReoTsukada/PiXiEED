(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPiXiSyncOrderKeeperUtils() {
    const MAX_REVISION = 9223372036854775807n;

    function normalizeRevision(value, { allowZero = false } = {}) {
      let revision;
      if (typeof value === 'number' && !Number.isSafeInteger(value)) {
        throw new Error('PiXiSYNC order keeper: unsafe-number-revision');
      }
      try { revision = BigInt(value); } catch (_) {
        throw new Error('PiXiSYNC order keeper: invalid-revision');
      }
      if (revision < (allowZero ? 0n : 1n) || revision > MAX_REVISION) {
        throw new Error('PiXiSYNC order keeper: invalid-revision');
      }
      return revision;
    }

    function createOrderKeeper({ confirmedRevision = 0n, applyConfirmed, onGap, onRecoveryRequired, maxPending = 512 } = {}) {
      if (typeof applyConfirmed !== 'function') throw new Error('PiXiSYNC order keeper: applyConfirmed is required');
      let revision = normalizeRevision(confirmedRevision, { allowZero: true });
      const pendingByRevision = new Map();
      const seenByOperationId = new Map();

      function identity(operation) {
        const operationId = String(operation?.operationId || '');
        const payloadSha256 = String(operation?.payloadSha256 || '');
        const operationRevision = normalizeRevision(operation?.revision);
        if (!operationId || !/^[0-9a-f-]{36}$/i.test(operationId) || !/^[0-9a-f]{64}$/i.test(payloadSha256)) {
          throw new Error('PiXiSYNC order keeper: invalid-operation-identity');
        }
        return { operationId, payloadSha256: payloadSha256.toLowerCase(), revision: operationRevision };
      }

      function requireRecovery(reason, operation = null) {
        pendingByRevision.clear();
        onRecoveryRequired?.({ reason, operation, confirmedRevision: revision });
      }

      function apply(operation) {
        const id = identity(operation);
        if (id.revision !== revision + 1n) throw new Error('PiXiSYNC order keeper: noncontiguous-apply');
        const known = seenByOperationId.get(id.operationId);
        if (known && (known.revision !== id.revision || known.payloadSha256 !== id.payloadSha256)) {
          requireRecovery('operation-id-mismatch', operation);
          return false;
        }
        applyConfirmed(operation);
        revision = id.revision;
        seenByOperationId.set(id.operationId, id);
        return true;
      }

      function flush() {
        while (pendingByRevision.has(revision + 1n)) {
          const next = pendingByRevision.get(revision + 1n);
          pendingByRevision.delete(revision + 1n);
          if (!apply(next)) return false;
        }
        return true;
      }

      function receive(operation) {
        const id = identity(operation);
        const known = seenByOperationId.get(id.operationId);
        if (known) {
          if (known.revision !== id.revision || known.payloadSha256 !== id.payloadSha256) requireRecovery('operation-id-mismatch', operation);
          return { status: 'duplicate', confirmedRevision: revision };
        }
        if (id.revision <= revision) {
          requireRecovery('revision-reused-with-different-operation', operation);
          return { status: 'recovery', confirmedRevision: revision };
        }
        const occupying = pendingByRevision.get(id.revision);
        if (occupying) {
          const existing = identity(occupying);
          if (existing.operationId !== id.operationId || existing.payloadSha256 !== id.payloadSha256) requireRecovery('revision-collision', operation);
          return { status: 'buffered', confirmedRevision: revision };
        }
        if (id.revision > revision + 1n) {
          if (pendingByRevision.size >= maxPending) {
            requireRecovery('pending-limit', operation);
            return { status: 'recovery', confirmedRevision: revision };
          }
          pendingByRevision.set(id.revision, operation);
          onGap?.({ afterRevision: revision, receivedRevision: id.revision });
          return { status: 'gap', confirmedRevision: revision };
        }
        apply(operation);
        flush();
        return { status: 'applied', confirmedRevision: revision };
      }

      function reset(nextRevision = 0n) {
        revision = normalizeRevision(nextRevision, { allowZero: true });
        pendingByRevision.clear();
        seenByOperationId.clear();
      }

      return { receive, reset, get confirmedRevision() { return revision; }, get pendingCount() { return pendingByRevision.size; } };
    }

    return { MAX_REVISION, createOrderKeeper };
  }

  root.pixisyncOrderKeeperUtils = { createPiXiSyncOrderKeeperUtils };
})();
