(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPiXiSyncCollaborationControllerUtils({
    mutationBridge,
    writerStampUtils,
    operationIdFactory = () => window.crypto?.randomUUID?.(),
    onBlocked = () => {},
    onRecoveryRequired = () => {},
  } = {}) {
    if (!mutationBridge?.toPixelMutation || !mutationBridge?.applyPixelMutation || !writerStampUtils?.createWriterStamps) {
      throw new Error('PiXiSYNC controller: missing mutation dependencies');
    }

    const MUTATION_LABELS = new Set(['pen', 'eraser']);
    const VIEW_ONLY_LABELS = new Set(['pan', 'zoom', 'eyedropper']);
    let runtime = null;
    const pendingOptimistic = new Map();
    const pendingGuarded = new Map();
    const stampsByTarget = new Map();
    const confirmedOperationIds = new Set();
    const historyMetadata = new WeakMap();
    let appliedRevision = 0n;

    const targetKey = operation => [
      operation?.canvasId,
      operation?.frameId,
      operation?.layerId,
      operation?.canvasWidth,
      operation?.canvasHeight,
    ].join('/');

    function normalizeRevision(value, { allowZero = false } = {}) {
      let revision;
      if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('unsafe-number-revision');
      try { revision = BigInt(value); } catch (_) { throw new Error('invalid-revision'); }
      if (revision < (allowZero ? 0n : 1n) || revision > writerStampUtils.MAX_REVISION) {
        throw new Error('invalid-revision');
      }
      return revision;
    }

    function getStamps(operation) {
      const key = targetKey(operation);
      let stamps = stampsByTarget.get(key);
      if (!stamps) {
        const cellCount = Number(operation.canvasWidth) * Number(operation.canvasHeight);
        stamps = writerStampUtils.createWriterStamps(cellCount);
        stampsByTarget.set(key, stamps);
      }
      return stamps;
    }

    function mutationFromConfirmed(operation) {
      return {
        canvasId: operation.canvasId,
        frameId: operation.frameId,
        layerId: operation.layerId,
        canvasWidth: operation.canvasWidth,
        canvasHeight: operation.canvasHeight,
        changes: operation.changes,
      };
    }

    function stampConfirmed(operation, appliedIndices = null) {
      const revision = normalizeRevision(operation.revision);
      const stamps = getStamps(operation);
      const allowed = appliedIndices ? new Set(appliedIndices) : null;
      operation.changes.forEach(change => {
        if (!allowed || allowed.has(change.index)) stamps.set(change.index, revision);
      });
      appliedRevision = revision;
      confirmedOperationIds.add(String(operation.operationId));
      const session = currentSession();
      const snapshot = session?.getSnapshot?.();
      if (snapshot) {
        session.dispatch?.({
          type: 'CONFIRMED_OPERATION_APPLIED',
          epoch: snapshot.epoch,
          generation: snapshot.sessionGeneration,
          revision: revision.toString(),
        });
      }
    }

    function rollbackPending() {
      const pending = [...pendingOptimistic.values()];
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        mutationBridge.applyPixelMutation(pending[index].mutation, { useBefore: true });
      }
    }

    function reapplyPending() {
      pendingOptimistic.forEach(record => mutationBridge.applyPixelMutation(record.mutation));
    }

    function applyConfirmed(operation, metadata = {}) {
      const revision = normalizeRevision(operation?.revision);
      if (revision !== appliedRevision + 1n) {
        onRecoveryRequired({ reason: 'noncontiguous-controller-apply', operation, appliedRevision });
        return { applied: 0, recovery: true };
      }
      const localPending = pendingOptimistic.get(String(operation.operationId)) || null;
      const guardedPending = pendingGuarded.get(String(operation.operationId)) || null;
      const canPromoteWithoutRewrite = Boolean(
        metadata.local
        && localPending
        && localPending.submittedRevision === appliedRevision
      );

      if (canPromoteWithoutRewrite) {
        pendingOptimistic.delete(String(operation.operationId));
        if (localPending.entry) {
          historyMetadata.set(localPending.entry, {
            sourceOperationId: String(operation.operationId),
            sourceRevision: revision,
            undoOperationId: '',
            undoRevision: 0n,
          });
        }
        stampConfirmed(operation);
        updateSessionPendingCount();
        return { applied: operation.changes.length, promotedOptimistic: true };
      }

      rollbackPending();
      if (localPending) pendingOptimistic.delete(String(operation.operationId));
      const mutation = mutationFromConfirmed(operation);
      const result = mutationBridge.applyPixelMutation(mutation);
      if (result.applied !== operation.changes.length) {
        onRecoveryRequired({ reason: 'confirmed-patch-apply-mismatch', operation, result });
        return { ...result, recovery: true };
      }
      stampConfirmed(operation, result.appliedIndices);
      if (localPending?.entry) {
        historyMetadata.set(localPending.entry, {
          sourceOperationId: String(operation.operationId),
          sourceRevision: revision,
          undoOperationId: '',
          undoRevision: 0n,
        });
      }
      if (guardedPending?.entry) {
        const previous = historyMetadata.get(guardedPending.entry) || {};
        historyMetadata.set(guardedPending.entry, guardedPending.direction === 'undo'
          ? {
              ...previous,
              undoOperationId: String(operation.operationId),
              undoRevision: revision,
            }
          : {
              ...previous,
              sourceOperationId: String(operation.operationId),
              sourceRevision: revision,
              undoOperationId: '',
              undoRevision: 0n,
            });
        pendingGuarded.delete(String(operation.operationId));
      }
      reapplyPending();
      updateSessionPendingCount();
      return result;
    }

    function currentSession() {
      return runtime?.session || null;
    }

    function sessionCanDraw() {
      try {
        return Boolean(currentSession()?.canDraw?.()) && pendingGuarded.size === 0;
      } catch (_) {
        return false;
      }
    }

    function updateSessionPendingCount() {
      const session = currentSession();
      const snapshot = session?.getSnapshot?.();
      if (!snapshot) return;
      session.dispatch?.({
        type: 'PENDING_OPERATION_COUNT',
        epoch: snapshot.epoch,
        count: pendingOptimistic.size,
      });
    }

    function canBeginLocalOperation(label, context = {}) {
      if (!runtime) return true;
      const normalized = String(label || '');
      if (VIEW_ONLY_LABELS.has(normalized)) return true;
      if (!MUTATION_LABELS.has(normalized)) return false;
      if (!sessionCanDraw()) return false;
      if (context.colorMode && context.colorMode !== 'indexed') return false;
      if (context.v1Compatible === false) return false;
      return true;
    }

    function reject(reason, entry = null) {
      onBlocked({ reason, entry });
      return { status: 'rejected', reason, promise: Promise.resolve(null) };
    }

    function handleCommittedHistoryEntry(entry, label = entry?.historyLabel) {
      if (!runtime) return { status: 'disabled', promise: Promise.resolve(null) };
      if (!MUTATION_LABELS.has(String(label || ''))) return reject('unsupported-operation', entry);
      if (!sessionCanDraw()) return reject('session-not-active', entry);
      const mutation = mutationBridge.toPixelMutation(entry);
      if (!mutation) {
        onRecoveryRequired({ reason: 'unsupported-confirmed-history-entry', entry });
        return reject('unsupported-confirmed-history-entry', entry);
      }
      const operationId = String(operationIdFactory?.() || '');
      if (!/^[0-9a-f-]{36}$/i.test(operationId)) return reject('invalid-operation-id', entry);
      const record = {
        operationId,
        mutation,
        submittedRevision: appliedRevision,
        entry,
      };
      pendingOptimistic.set(operationId, record);
      updateSessionPendingCount();
      const promise = Promise.resolve(runtime.realtimeClient.commit({
        operationId,
        kind: 'pixel_patch',
        structureEpoch: runtime.structureEpoch || 0,
        changes: mutation.changes.map(({ index, paletteValue }) => ({ index, paletteValue })),
        canvasId: mutation.canvasId,
        frameId: mutation.frameId,
        layerId: mutation.layerId,
        canvasWidth: mutation.canvasWidth,
        canvasHeight: mutation.canvasHeight,
      })).catch(error => {
        const session = currentSession();
        const snapshot = session?.getSnapshot?.();
        if (snapshot) session.dispatch?.({ type: 'SOCKET_OFFLINE', epoch: snapshot.epoch });
        onRecoveryRequired({ reason: 'commit-failed', error, operationId });
        return { commitStatus: 'failed', operationId };
      });
      return { status: 'accepted', operationId, mutation, promise };
    }

    function requestGuardedHistory(entry, direction) {
      if (!runtime) return reject('disabled', entry);
      if (!sessionCanDraw()) return reject(
        pendingGuarded.size ? 'guarded-operation-pending' : 'session-not-active',
        entry
      );
      if (direction !== 'undo' && direction !== 'redo') return reject('invalid-history-direction', entry);
      const mutation = mutationBridge.toPixelMutation(entry);
      if (!mutation) return reject('unsupported-history-entry', entry);
      const meta = historyMetadata.get(entry);
      const targetOperationId = direction === 'undo'
        ? String(meta?.sourceOperationId || '')
        : String(meta?.undoOperationId || '');
      const expectedRevision = direction === 'undo'
        ? meta?.sourceRevision
        : meta?.undoRevision;
      if (!/^[0-9a-f-]{36}$/i.test(targetOperationId)) {
        return reject('history-operation-not-confirmed', entry);
      }
      let guardRevision;
      try { guardRevision = normalizeRevision(expectedRevision); } catch (_) {
        return reject('history-revision-not-confirmed', entry);
      }
      const operationId = String(operationIdFactory?.() || '');
      if (!/^[0-9a-f-]{36}$/i.test(operationId)) return reject('invalid-operation-id', entry);
      const changes = mutation.changes.map(change => ({
        index: change.index,
        paletteValue: direction === 'undo' ? change.beforePaletteValue : change.paletteValue,
        expectedWriterRevision: guardRevision,
      }));
      pendingGuarded.set(operationId, { entry, direction });
      const promise = Promise.resolve(runtime.realtimeClient.commit({
        operationId,
        kind: direction === 'undo' ? 'undo_pixel_patch' : 'redo_pixel_patch',
        structureEpoch: runtime.structureEpoch || 0,
        changes,
        canvasId: mutation.canvasId,
        frameId: mutation.frameId,
        layerId: mutation.layerId,
        canvasWidth: mutation.canvasWidth,
        canvasHeight: mutation.canvasHeight,
        undoOfOperationId: targetOperationId,
      })).catch(error => {
        pendingGuarded.delete(operationId);
        onRecoveryRequired({ reason: `${direction}-commit-failed`, error, operationId });
        throw error;
      });
      return { status: 'accepted', operationId, mutation, promise };
    }

    function requestUndo(entry) {
      return requestGuardedHistory(entry, 'undo');
    }

    function requestRedo(entry) {
      return requestGuardedHistory(entry, 'redo');
    }

    function configure(nextRuntime) {
      if (!nextRuntime?.session?.canDraw || !nextRuntime?.realtimeClient?.commit) {
        throw new Error('PiXiSYNC controller: invalid runtime');
      }
      runtime = {
        session: nextRuntime.session,
        realtimeClient: nextRuntime.realtimeClient,
        structureEpoch: Math.max(0, Number(nextRuntime.structureEpoch) || 0),
      };
      appliedRevision = normalizeRevision(
        nextRuntime.session.getSnapshot?.().appliedRevision || 0,
        { allowZero: true }
      );
      updateSessionPendingCount();
    }

    function beginAuthoritativeResync(checkpointRevision = 0) {
      rollbackPending();
      stampsByTarget.clear();
      confirmedOperationIds.clear();
      appliedRevision = normalizeRevision(checkpointRevision, { allowZero: true });
    }

    function reapplyPendingAfterResync() {
      pendingOptimistic.forEach(record => {
        mutationBridge.applyPixelMutation(record.mutation);
        record.submittedRevision = appliedRevision;
      });
      updateSessionPendingCount();
      return pendingOptimistic.size;
    }

    function clear() {
      runtime = null;
      pendingOptimistic.clear();
      pendingGuarded.clear();
      stampsByTarget.clear();
      confirmedOperationIds.clear();
      appliedRevision = 0n;
    }

    function snapshot() {
      return {
        enabled: Boolean(runtime),
        session: currentSession()?.getSnapshot?.() || null,
        appliedRevision: appliedRevision.toString(),
        pendingOperationCount: pendingOptimistic.size,
        guardedOperationPending: pendingGuarded.size > 0,
        pendingOperationIds: [...pendingOptimistic.keys()],
        confirmedOperationIds: [...confirmedOperationIds],
        writerTargets: [...stampsByTarget.entries()].map(([key, stamps]) => ({
          key,
          tiles: stamps.exportTiles(),
        })),
      };
    }

    return Object.freeze({
      MUTATION_LABELS,
      VIEW_ONLY_LABELS,
      configure,
      clear,
      canBeginLocalOperation,
      handleCommittedHistoryEntry,
      requestUndo,
      requestRedo,
      applyConfirmed,
      beginAuthoritativeResync,
      reapplyPendingAfterResync,
      snapshot,
      get enabled() { return Boolean(runtime); },
      get appliedRevision() { return appliedRevision; },
      get pendingOperationCount() { return pendingOptimistic.size; },
      get guardedOperationPending() { return pendingGuarded.size > 0; },
    });
  }

  root.pixisyncCollaborationControllerUtils = { createPiXiSyncCollaborationControllerUtils };
})();
