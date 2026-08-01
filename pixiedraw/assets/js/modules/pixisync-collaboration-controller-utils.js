(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPiXiSyncCollaborationControllerUtils({
    mutationBridge,
    documentBridge = null,
    writerStampUtils,
    operationIdFactory = () => window.crypto?.randomUUID?.(),
    onBlocked = () => {},
    onRecoveryRequired = () => {},
  } = {}) {
    if (!mutationBridge?.toPixelMutations || !mutationBridge?.applyPixelMutation || !writerStampUtils?.createWriterStamps) {
      throw new Error('PiXiSYNC controller: missing mutation dependencies');
    }

    // Every local drawing tool below commits a finalized pixelPatch history
    // entry. PiXiSYNC transports that patch, not the gesture/tool itself, so
    // shapes and fills are as safe to synchronize as pen and eraser strokes.
    const MUTATION_LABELS = new Set([
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
      'move',
      'selectionMove',
      'selectionTransform',
      'selectionCut',
      'selectionPastePixels',
    ]);
    const VIEW_ONLY_LABELS = new Set([
      'pan',
      'zoom',
      'eyedropper',
      'selectRect',
      'selectLasso',
      'selectSame',
    ]);
    let runtime = null;
    const pendingOptimistic = new Map();
    const pendingGuarded = new Map();
    let pendingDocument = null;
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

    function recordHistorySegment(entry, kind, groupIndex, groupSize, operationId, revision) {
      if (!entry || !Number.isSafeInteger(groupIndex) || !Number.isSafeInteger(groupSize) || groupSize < 1) return;
      const previous = historyMetadata.get(entry) || {};
      const key = kind === 'undo' ? 'undoSegments' : 'sourceSegments';
      const segments = Array.isArray(previous[key]) && previous[key].length === groupSize
        ? previous[key].slice()
        : new Array(groupSize).fill(null);
      segments[groupIndex] = { operationId: String(operationId), revision };
      historyMetadata.set(entry, {
        ...previous,
        [key]: segments,
        ...(kind === 'source' ? { undoSegments: [] } : {}),
      });
    }

    function applyConfirmed(operation, metadata = {}) {
      const revision = normalizeRevision(operation?.revision);
      if (revision !== appliedRevision + 1n) {
        onRecoveryRequired({ reason: 'noncontiguous-controller-apply', operation, appliedRevision });
        // The order keeper advances only after this callback returns.  Never
        // acknowledge an operation that the document controller rejected;
        // doing so makes every following revision look contiguous to the
        // transport while this controller remains at the older revision.
        throw new Error('PiXiSYNC controller: noncontiguous-controller-apply');
      }
      if (operation?.kind === 'document_patch') {
        const localDocument = pendingDocument?.operationId === String(operation.operationId);
        const discardedPendingIds = [];
        let invalidatedLocalDocument = null;
        if (!localDocument && pendingDocument) {
          // Another editor won the exact-base document revision while this
          // client was preparing/uploading. The remote operation is now the
          // authority; never restore our older before-snapshot in the local
          // promise's eventual stale-base catch.
          pendingDocument.invalidatedByRemote = true;
          invalidatedLocalDocument = pendingDocument;
          runtime.realtimeClient.discardPendingOperation?.(pendingDocument.operationId);
        }
        if (!localDocument && (pendingOptimistic.size || pendingGuarded.size)) {
          const invalidatedEntries = new Set();
          if (pendingOptimistic.size) rollbackPending();
          pendingOptimistic.forEach(record => {
            if (record?.entry) invalidatedEntries.add(record.entry);
          });
          pendingGuarded.forEach(record => {
            if (record?.entry) invalidatedEntries.add(record.entry);
          });
          discardedPendingIds.push(...pendingOptimistic.keys(), ...pendingGuarded.keys());
          pendingOptimistic.clear();
          pendingGuarded.clear();
          runtime.realtimeClient.discardPixelPendingBeforeEpoch?.(operation.structureEpoch);
          if (invalidatedEntries.size) {
            documentBridge?.discardInvalidatedHistoryEntries?.([...invalidatedEntries]);
          }
        }
        if (!localDocument) {
          const applied = documentBridge?.applyDocumentOperation?.(operation.documentOperation);
          if (applied !== true) {
            onRecoveryRequired({ reason: 'confirmed-document-operation-apply-failed', operation });
            throw new Error('PiXiSYNC controller: confirmed-document-operation-apply-failed');
          }
        } else {
          pendingDocument.confirmed = true;
          if (pendingDocument.entry && typeof pendingDocument.entry === 'object') {
            const previous = historyMetadata.get(pendingDocument.entry) || {};
            const key = pendingDocument.direction === 'undo'
              ? 'undoDocumentRevision'
              : 'sourceDocumentRevision';
            historyMetadata.set(pendingDocument.entry, {
              ...previous,
              [key]: revision.toString(),
            });
          }
        }
        stampsByTarget.clear();
        runtime.structureEpoch = Math.max(0, Number(operation.structureEpoch) || 0);
        stampConfirmed(operation);
        updateSessionPendingCount();
        if (discardedPendingIds.length) onBlocked({
          reason: 'pending-pixels-invalidated-by-document-operation',
          operation,
          operationIds: discardedPendingIds,
        });
        if (invalidatedLocalDocument) {
          // A semantic remote patch may not overwrite every optimistic local
          // structural field. Force a checkpoint+tail reload immediately;
          // waiting for the stale local RPC to fail can leave a hybrid model
          // visible for the full network timeout.
          Promise.resolve().then(() => documentBridge?.requestAuthoritativeRecovery?.(
            'remote-document-invalidated-local-document'
          )).catch(() => {});
        }
        return { applied: 1, promotedOptimistic: localDocument };
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
          recordHistorySegment(
            localPending.entry,
            'source',
            localPending.groupIndex,
            localPending.groupSize,
            operation.operationId,
            revision
          );
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
        throw new Error('PiXiSYNC controller: confirmed-patch-apply-mismatch');
      }
      stampConfirmed(operation, result.appliedIndices);
      if (localPending?.entry) {
        recordHistorySegment(
          localPending.entry,
          'source',
          localPending.groupIndex,
          localPending.groupSize,
          operation.operationId,
          revision
        );
      }
      if (guardedPending?.entry) {
        recordHistorySegment(
          guardedPending.entry,
          guardedPending.direction === 'undo' ? 'undo' : 'source',
          guardedPending.groupIndex,
          guardedPending.groupSize,
          operation.operationId,
          revision
        );
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
        return Boolean(currentSession()?.canDraw?.()) && pendingGuarded.size === 0 && !pendingDocument;
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
        count: pendingOptimistic.size + (pendingDocument ? 1 : 0),
      });
    }

    function canBeginLocalOperation(label, context = {}) {
      if (!runtime) return true;
      const normalized = String(label || '');
      if (VIEW_ONLY_LABELS.has(normalized)) return true;
      const documentKind = documentBridge?.classifyHistoryLabel?.(normalized) || '';
      if (documentKind === 'local-only') return true;
      if (documentKind) return canBeginDocumentOperation();
      if (!MUTATION_LABELS.has(normalized)) return false;
      if (!sessionCanDraw()) return false;
      if (
        context.colorMode
        && context.colorMode !== 'index'
        && context.colorMode !== 'indexed'
      ) return false;
      if (context.v1Compatible === false) return false;
      return true;
    }

    function canBeginDocumentOperation() {
      if (!runtime) return true;
      return Boolean(currentSession()?.canDraw?.())
        && pendingOptimistic.size === 0
        && pendingGuarded.size === 0
        && !pendingDocument;
    }

    function reject(reason, entry = null) {
      onBlocked({ reason, entry });
      return { status: 'rejected', reason, promise: Promise.resolve(null) };
    }

    function handleCommittedHistoryEntry(entry, label = entry?.historyLabel) {
      if (!runtime) return { status: 'disabled', promise: Promise.resolve(null) };
      const documentKind = documentBridge?.classifyHistoryLabel?.(String(label || '')) || '';
      if (documentKind === 'local-only') {
        return { status: 'ignored', reason: 'local-only', promise: Promise.resolve(null) };
      }
      if (documentKind) return handleCommittedDocumentEntry(entry, label, documentKind);
      if (!MUTATION_LABELS.has(String(label || ''))) return reject('unsupported-operation', entry);
      if (!sessionCanDraw()) return reject('session-not-active', entry);
      const mutations = mutationBridge.toPixelMutations(entry);
      if (!mutations?.length) {
        onRecoveryRequired({ reason: 'unsupported-confirmed-history-entry', entry });
        return reject('unsupported-confirmed-history-entry', entry);
      }
      // Large finalized raster edits must be one ordered revision. Splitting
      // them into 8192-cell commits exposes partial fills/pastes and permits a
      // structural edit to interleave between chunks.
      if (mutations.length > 1) {
        const rasterRegion = mutationBridge.toRasterRegionAsset?.(entry) || null;
        // Never fall back to multiple ordered commits: another structural
        // operation could interleave and expose only part of this raster edit.
        return handleCommittedDocumentEntry(entry, label, 'raster_region_set', { rasterRegion });
      }
      const records = mutations.map((mutation, groupIndex) => ({
        operationId: String(operationIdFactory?.() || ''),
        mutation,
        submittedRevision: appliedRevision,
        entry,
        groupIndex,
        groupSize: mutations.length,
      }));
      if (records.some(record => !/^[0-9a-f-]{36}$/i.test(record.operationId))) {
        return reject('invalid-operation-id', entry);
      }
      records.forEach(record => pendingOptimistic.set(record.operationId, record));
      updateSessionPendingCount();
      const promise = Promise.all(records.map(({ operationId, mutation }) => runtime.realtimeClient.commit({
        operationId,
        kind: 'pixel_patch',
        structureEpoch: runtime.structureEpoch || 0,
        changes: mutation.changes.map(({ index, paletteValue }) => ({ index, paletteValue })),
        canvasId: mutation.canvasId,
        frameId: mutation.frameId,
        layerId: mutation.layerId,
        canvasWidth: mutation.canvasWidth,
        canvasHeight: mutation.canvasHeight,
      }))).catch(error => {
        const session = currentSession();
        const snapshot = session?.getSnapshot?.();
        if (snapshot) session.dispatch?.({ type: 'SOCKET_OFFLINE', epoch: snapshot.epoch });
        onRecoveryRequired({ reason: 'commit-group-failed', error, operationIds: records.map(record => record.operationId) });
        throw error;
      });
      return {
        status: 'accepted',
        operationId: records[0].operationId,
        operationIds: records.map(record => record.operationId),
        mutation: mutations[0],
        mutations,
        promise,
      };
    }

    function handleCommittedDocumentEntry(entry, label, documentKind, options = {}) {
      if (!runtime?.realtimeClient?.commitDocument || !documentBridge?.toDocumentOperation) {
        return reject('document-operation-unavailable', entry);
      }
      if (!currentSession()?.canDraw?.() || pendingGuarded.size || pendingDocument) {
        onRecoveryRequired({ reason: 'document-operation-not-serialized', entry, label });
        return reject('document-operation-not-serialized', entry);
      }
      const operationId = String(operationIdFactory?.() || '');
      if (!/^[0-9a-f-]{36}$/i.test(operationId)) return reject('invalid-operation-id', entry);
      pendingDocument = {
        operationId,
        entry,
        label,
        direction: options.direction || 'forward',
        confirmed: false,
      };
      updateSessionPendingCount();
      let cleanupPreparedDocument = null;
      let documentCommitStarted = false;
      let retainDocumentLockForRecovery = false;
      const promise = (async () => {
        const waitStartedAt = Date.now();
        while (pendingOptimistic.size) {
          if ((Date.now() - waitStartedAt) > 20000) throw new Error('pending-pixel-confirmation-timeout');
          await new Promise(resolve => window.setTimeout(resolve, 10));
        }
        // Checkpoint-backed operations may upload a large immutable object.
        // Acquire the document lock before preparation so no local mutation can
        // overtake the snapshot that will be committed at this revision.
        const prepared = await documentBridge.toDocumentOperation(
          entry,
          String(label || ''),
          documentKind,
          {
            direction: options.direction || 'forward',
            operationId,
            structureEpoch: runtime.structureEpoch || 0,
            reuseDocumentOperation: options.reuseDocumentOperation || null,
            rasterRegion: options.rasterRegion || null,
          }
        );
        if (!prepared?.documentOperation) throw new Error('invalid-document-operation');
        cleanupPreparedDocument = typeof prepared.cleanup === 'function' ? prepared.cleanup : null;
        if (pendingDocument?.operationId !== operationId || pendingDocument.invalidatedByRemote) {
          throw new Error('document-operation-invalidated-by-remote');
        }
        if (entry && typeof entry === 'object') {
          const previous = historyMetadata.get(entry) || {};
          const key = options.direction === 'undo'
            ? 'undoDocumentOperation'
            : 'sourceDocumentOperation';
          historyMetadata.set(entry, { ...previous, [key]: prepared.documentOperation });
        }
        documentCommitStarted = true;
        await runtime.realtimeClient.commitDocument({
          operationId,
          structureEpoch: runtime.structureEpoch || 0,
          baseRevision: appliedRevision,
          documentOperation: prepared.documentOperation,
        });
        if (!pendingDocument?.confirmed) throw new Error('document-operation-not-confirmed');
        if (options.applyLocalAfterConfirm === true) {
          if (documentBridge.applyDocumentOperation?.(prepared.documentOperation) !== true) {
            throw new Error('local-document-history-apply-failed');
          }
        }
        return { operationId, structureEpoch: runtime.structureEpoch };
      })().catch(async error => {
        try { await cleanupPreparedDocument?.(); } catch (_) {}
        if (pendingDocument?.operationId === operationId && pendingDocument.confirmed) {
          // The DB row and ordered local confirmation already succeeded. A
          // post-confirm tail/broadcast failure must not turn success into a
          // local rollback or a stuck history operation.
          return { operationId, structureEpoch: runtime.structureEpoch };
        }
        const invalidatedByRemote = pendingDocument?.operationId === operationId
          && pendingDocument.invalidatedByRemote === true;
        if (
          !invalidatedByRemote
          && !documentCommitStarted
          && (options.direction || 'forward') === 'forward'
        ) {
          try {
            await documentBridge?.rollbackRejectedDocumentEntry?.(entry);
          } catch (rollbackError) {
            onRecoveryRequired({
              reason: 'document-operation-local-rollback-failed',
              error: rollbackError,
              operationId,
            });
          }
        }
        if (invalidatedByRemote || documentCommitStarted) {
          // Once the commit RPC has started, a timeout/network error is
          // ambiguous: Postgres may already have committed the operation.
          // Keep input locked until an authoritative checkpoint+tail recovery
          // proves the room state instead of guessing and rolling back.
          retainDocumentLockForRecovery = true;
          await documentBridge?.requestAuthoritativeRecovery?.(
            invalidatedByRemote
              ? 'remote-document-invalidated-local-document'
              : 'ambiguous-document-operation-commit'
          );
        }
        onRecoveryRequired({ reason: 'document-operation-commit-failed', error, operationId });
        throw error;
      }).finally(() => {
        if (!retainDocumentLockForRecovery && pendingDocument?.operationId === operationId) {
          pendingDocument = null;
        }
        updateSessionPendingCount();
      });
      return { status: 'accepted', operationId, promise };
    }

    function requestGuardedHistory(entry, direction) {
      if (!runtime) return reject('disabled', entry);
      const historyLabel = String(entry?.historyLabel || entry?.label || '');
      const documentKind = documentBridge?.classifyHistoryLabel?.(historyLabel) || '';
      const metadata = historyMetadata.get(entry) || {};
      const rasterDocumentKind = metadata.sourceDocumentOperation?.type === 'raster_region_set'
        ? 'raster_region_set'
        : '';
      if ((documentKind && documentKind !== 'local-only') || rasterDocumentKind) {
        if (direction !== 'undo' && direction !== 'redo') return reject('invalid-history-direction', entry);
        const expectedRevision = direction === 'undo'
          ? metadata.sourceDocumentRevision
          : metadata.undoDocumentRevision;
        if (!expectedRevision || BigInt(expectedRevision) !== appliedRevision) {
          return reject('document-history-not-current', entry);
        }
        return handleCommittedDocumentEntry(entry, historyLabel, rasterDocumentKind || documentKind, {
          direction,
          applyLocalAfterConfirm: true,
          reuseDocumentOperation: direction === 'undo'
            ? metadata.undoDocumentOperation
            : metadata.sourceDocumentOperation,
        });
      }
      if (!sessionCanDraw()) return reject(
        pendingGuarded.size ? 'guarded-operation-pending' : 'session-not-active',
        entry
      );
      if (direction !== 'undo' && direction !== 'redo') return reject('invalid-history-direction', entry);
      const mutations = mutationBridge.toPixelMutations(entry);
      if (!mutations?.length) return reject('unsupported-history-entry', entry);
      const meta = historyMetadata.get(entry);
      const targetSegments = direction === 'undo' ? meta?.sourceSegments : meta?.undoSegments;
      if (
        !Array.isArray(targetSegments)
        || targetSegments.length !== mutations.length
        || targetSegments.some(segment => !/^[0-9a-f-]{36}$/i.test(String(segment?.operationId || '')))
      ) {
        return reject('history-operation-not-confirmed', entry);
      }
      const records = mutations.map((mutation, groupIndex) => {
        let guardRevision;
        try { guardRevision = normalizeRevision(targetSegments[groupIndex].revision); } catch (_) { guardRevision = null; }
        return {
          operationId: String(operationIdFactory?.() || ''),
          mutation,
          guardRevision,
          targetOperationId: String(targetSegments[groupIndex].operationId),
          groupIndex,
          groupSize: mutations.length,
        };
      });
      if (records.some(record => !record.guardRevision)) return reject('history-revision-not-confirmed', entry);
      if (records.some(record => !/^[0-9a-f-]{36}$/i.test(record.operationId))) return reject('invalid-operation-id', entry);
      records.forEach(record => pendingGuarded.set(record.operationId, {
        entry,
        direction,
        groupIndex: record.groupIndex,
        groupSize: record.groupSize,
      }));
      const promise = Promise.all(records.map(record => runtime.realtimeClient.commit({
        operationId: record.operationId,
        kind: direction === 'undo' ? 'undo_pixel_patch' : 'redo_pixel_patch',
        structureEpoch: runtime.structureEpoch || 0,
        changes: record.mutation.changes.map(change => ({
          index: change.index,
          paletteValue: direction === 'undo' ? change.beforePaletteValue : change.paletteValue,
          expectedWriterRevision: record.guardRevision,
        })),
        canvasId: record.mutation.canvasId,
        frameId: record.mutation.frameId,
        layerId: record.mutation.layerId,
        canvasWidth: record.mutation.canvasWidth,
        canvasHeight: record.mutation.canvasHeight,
        undoOfOperationId: record.targetOperationId,
      }))).catch(error => {
        onRecoveryRequired({ reason: `${direction}-commit-group-failed`, error, operationIds: records.map(record => record.operationId) });
        throw error;
      });
      return {
        status: 'accepted',
        operationId: records[0].operationId,
        operationIds: records.map(record => record.operationId),
        mutation: mutations[0],
        mutations,
        promise,
      };
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
      const discardPendingForDocumentRecovery = Boolean(pendingDocument);
      rollbackPending();
      if (discardPendingForDocumentRecovery) {
        pendingOptimistic.clear();
        pendingGuarded.clear();
      }
      pendingDocument = null;
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
      pendingDocument = null;
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
        pendingDocumentOperation: Boolean(pendingDocument),
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
      canBeginDocumentOperation,
      get enabled() { return Boolean(runtime); },
      get appliedRevision() { return appliedRevision; },
      get pendingOperationCount() { return pendingOptimistic.size; },
      get guardedOperationPending() { return pendingGuarded.size > 0; },
    });
  }

  root.pixisyncCollaborationControllerUtils = { createPiXiSyncCollaborationControllerUtils };
})();
