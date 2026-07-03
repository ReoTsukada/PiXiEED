(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedProjectLocalOpUtils(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() {
        return true;
      },
      get(target, key) {
        if (key === Symbol.unscopables) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          return target[key];
        }
        return globalThis[key];
      },
      set(target, key, value) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          target[key] = value;
          return true;
        }
        globalThis[key] = value;
        return true;
      },
    });

    return ((scope) => {
      with (scope) {
  function reserveSharedProjectRoomRateSlot(slotMap, projectKey, minIntervalMs) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || activeSharedProjectKey || '');
    if (!normalizedProjectKey) {
      return 0;
    }
    const now = Date.now();
    const lastSlotAt = Math.max(0, Math.round(Number(slotMap.get(normalizedProjectKey)) || 0));
    const nextSlotAt = Math.max(now, lastSlotAt + Math.max(0, Math.round(Number(minIntervalMs) || 0)));
    slotMap.set(normalizedProjectKey, nextSlotAt);
    return Math.max(0, nextSlotAt - now);
  }

  function getSharedProjectRoomCommitDelay(projectKey) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || activeSharedProjectKey || '');
    if (!normalizedProjectKey) {
      return 0;
    }
    const lastSentAt = Math.max(0, Math.round(Number(sharedProjectRoomCommitSentAt.get(normalizedProjectKey)) || 0));
    return Math.max(0, lastSentAt + SHARED_PROJECT_ROOM_COMMIT_MIN_INTERVAL_MS - Date.now());
  }

  function markSharedProjectRoomCommitSent(projectKey) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || activeSharedProjectKey || '');
    if (normalizedProjectKey) {
      sharedProjectRoomCommitSentAt.set(normalizedProjectKey, Date.now());
    }
  }

  function scheduleSharedProjectBroadcastRetry(op, delayMs = 120, { rateLimited = false } = {}) {
    const opId = getSharedProjectOpId(op);
    if (!op || !opId) {
      return;
    }
    sharedProjectPendingBroadcastOps.set(opId, op);
    window.setTimeout(() => {
      const queued = sharedProjectPendingBroadcastOps.get(opId);
      if (!queued || !activeSharedProjectKey || queued.projectKey !== activeSharedProjectKey) {
        sharedProjectPendingBroadcastOps.delete(opId);
        return;
      }
      sendSharedProjectBroadcastOp(queued, { allowRetry: false, rateLimited });
    }, Math.max(32, Math.round(Number(delayMs) || 120)));
  }

  function sendSharedProjectBroadcastOp(op, { allowRetry = true, rateLimited = false } = {}) {
    const opId = getSharedProjectOpId(op);
    if (!activeSharedProjectChannel || typeof activeSharedProjectChannel.send !== 'function') {
      console.debug('[shared-realtime] broadcast-send-skipped', {
        reason: 'missing-active-channel',
        projectKey: op?.projectKey || '',
        opId,
        kind: typeof op?.kind === 'string' ? op.kind : '',
      });
      ensureActiveSharedProjectRealtimeChannel()
        .then(() => {
          if (allowRetry) {
            scheduleSharedProjectBroadcastRetry(op, 160);
          }
        })
        .catch(() => {
          if (allowRetry) {
            scheduleSharedProjectBroadcastRetry(op, 160);
          }
        });
      return;
    }
    if (!rateLimited) {
      const rateDelay = reserveSharedProjectRoomRateSlot(
        sharedProjectRoomBroadcastSlotAt,
        op?.projectKey || activeSharedProjectKey,
        SHARED_PROJECT_ROOM_BROADCAST_MIN_INTERVAL_MS
      );
      if (rateDelay > 0) {
        scheduleSharedProjectBroadcastRetry(op, rateDelay, { rateLimited: true });
        return;
      }
    }
    const broadcastProjectKey = normalizeMultiProjectKey(op?.projectKey || activeSharedProjectKey || '');
    if (broadcastProjectKey) {
      sharedProjectRoomBroadcastSlotAt.set(broadcastProjectKey, Date.now());
    }
    markSharedProjectLocalOpBroadcastSent(op, { source: 'realtime' });
    activeSharedProjectChannel.send({
      type: 'broadcast',
      event: SHARED_PROJECT_BROADCAST_EVENT,
      payload: op,
    }).then(() => {
      if (opId) {
        sharedProjectPendingBroadcastOps.delete(opId);
      }
      console.debug('[shared-realtime] broadcast-send-ok', {
        projectKey: op?.projectKey || '',
        opId,
        kind: typeof op?.kind === 'string' ? op.kind : '',
      });
    }).catch(error => {
      console.warn('[shared-realtime] broadcast-send-failed', {
        projectKey: op?.projectKey || '',
        opId,
        kind: typeof op?.kind === 'string' ? op.kind : '',
        error: String(error?.message || error || ''),
      });
      if (allowRetry) {
        scheduleSharedProjectBroadcastRetry(op, 180);
      }
      // Ignore broadcast transport failures and let DB insert become the source of truth.
    });
  }

  function sendOp(op, { retryOnConflict = true } = {}) {
    if (!op || typeof op !== 'object' || !op.projectKey) {
      return;
    }
    const opId = getSharedProjectOpId(op);
    if (opId && sharedProjectSeenOpIds.has(opId)) {
      console.info('[shared-sync]', {
        event: 'local-op-send-skipped-confirmed',
        opId,
        projectKey: op.projectKey || '',
      });
      deleteSharedLocalOpJournalEntry(opId).catch(error => {
        console.warn('Failed to delete already-confirmed shared local op journal entry', error);
      });
      return;
    }
    if (
      opId
      && (
        sharedProjectPendingLocalOps.some(entry => getSharedProjectOpId(entry?.op || entry) === opId)
        || sharedProjectLocalInFlightOps.has(opId)
      )
    ) {
      console.info('[shared-sync]', {
        event: 'local-op-send-skipped-active',
        opId,
        projectKey: op.projectKey || '',
        queueLength: sharedProjectPendingLocalOps.length,
      });
      scheduleSharedProjectPendingLocalOpsFlush(0, 'duplicate-active-op');
      return;
    }
    markSharedProjectTrafficActivity('tx');
    const opType = classifySharedProjectOpType(op.historyLabel || '');
    rememberSharedProjectLocalInFlightOp(op, {
      source: 'local',
      status: 'created',
      opType,
    });
    if (opType === 'draw') {
      logSharedProjectDrawLifecycle('local-provisional-apply-start', op, {
        mode: 'local-provisional',
      });
    }
    try {
      markSharedProjectLocalOpProvisionalApplied(op, {
        source: 'local',
        opType,
      });
      if (opType === 'draw') {
        logSharedProjectDrawLifecycle('local-provisional-apply-done', op, {
          mode: 'local-provisional',
        });
      }
    } catch (error) {
      if (opType === 'draw') {
        logSharedProjectDrawLifecycle('local-provisional-apply-failed', op, {
          mode: 'local-provisional',
          error,
        });
      }
      markSharedProjectLocalOpCommitFailed(op, error, { source: 'local-provisional' });
      return;
    }
    // shared_project_ops is the source of truth; local journal is a durability buffer.
    // Write a synchronous fallback entry to session/local storage immediately so
    // that user edits are not lost if IndexedDB writes are delayed or the
    // browser is closed before async persistence completes.
    try {
      const fallbackEntry = buildSharedLocalOpJournalEntry(op, { status: 'pending' });
      if (fallbackEntry) {
        upsertSharedLocalOpJournalFallbackEntry(fallbackEntry);
      }
    } catch (e) {
      // ignore fallback write failures
    }
    appendSharedLocalOpJournal(op, { status: 'pending' }).catch(error => {
      console.warn('Failed to append shared local op journal entry', error);
    });
    // Broadcast is only a wake-up signal; peers render after reading confirmed server ops.
    sendSharedProjectBroadcastOp(op);
    const queuedOp = {
      projectKey: op.projectKey,
      historyLabel: op.historyLabel || '',
      op,
      opPayload: op.payload || null,
      retryOnConflict,
    };
    const alreadyQueued = Boolean(opId) && sharedProjectPendingLocalOps.some(entry => (
      getSharedProjectOpId(entry?.op || entry) === opId
    ));
    if (alreadyQueued) {
      console.info('[shared-sync]', {
        event: 'commit-queue-add-skipped-duplicate',
        opId,
        projectKey: op.projectKey,
        queueLength: sharedProjectPendingLocalOps.length,
      });
      scheduleSharedProjectPendingLocalOpsFlush(0, 'duplicate-queued-op');
      return;
    }
    console.info('[shared-sync]', {
      event: 'commit-queue-add',
      opId,
      projectKey: op.projectKey,
      queueLengthBefore: sharedProjectPendingLocalOps.length,
    });
    sharedProjectPendingLocalOps.push(queuedOp);
    sortSharedProjectPendingLocalOps();
    scheduleSharedProjectPendingLocalOpsFlush(SHARED_PROJECT_LOCAL_OP_BATCH_DELAY_MS, 'local-op-batch');
  }

  function sortSharedProjectPendingLocalOps() {
    if (!Array.isArray(sharedProjectPendingLocalOps) || sharedProjectPendingLocalOps.length < 2) {
      return;
    }
    sharedProjectPendingLocalOps.sort((left, right) => {
      const leftOp = left?.op || left || null;
      const rightOp = right?.op || right || null;
      const leftCreatedAt = String(leftOp?.createdAt || '');
      const rightCreatedAt = String(rightOp?.createdAt || '');
      const createdAtCompare = leftCreatedAt.localeCompare(rightCreatedAt);
      if (createdAtCompare !== 0) {
        return createdAtCompare;
      }
      return String(getSharedProjectOpId(leftOp)).localeCompare(String(getSharedProjectOpId(rightOp)));
    });
  }

  function scheduleSharedProjectPendingLocalOpsFlush(delayMs = SHARED_PROJECT_LOCAL_OP_BATCH_DELAY_MS, reason = 'batch') {
    if (!activeSharedProjectKey || !sharedProjectPendingLocalOps.length) {
      return;
    }
    const safeDelay = Math.max(0, Math.round(Number(delayMs) || 0));
    const dueAt = Date.now() + safeDelay;
    if (sharedProjectPendingLocalOpsFlushTimer !== null) {
      if (sharedProjectPendingLocalOpsFlushDueAt > 0 && sharedProjectPendingLocalOpsFlushDueAt <= dueAt) {
        return;
      }
      window.clearTimeout(sharedProjectPendingLocalOpsFlushTimer);
      sharedProjectPendingLocalOpsFlushTimer = null;
    }
    sharedProjectPendingLocalOpsFlushDueAt = dueAt;
    console.info('[shared-sync]', {
      event: 'local-op-flush-timer-set',
      projectKey: activeSharedProjectKey || '',
      reason,
      delayMs: safeDelay,
      queueLength: sharedProjectPendingLocalOps.length,
    });
    sharedProjectPendingLocalOpsFlushTimer = window.setTimeout(() => {
      sharedProjectPendingLocalOpsFlushTimer = null;
      sharedProjectPendingLocalOpsFlushDueAt = 0;
      flushSharedProjectPendingLocalOps();
    }, safeDelay);
  }

  function clearSharedProjectPendingLocalOpsFlushTimer() {
    if (sharedProjectPendingLocalOpsFlushTimer !== null) {
      window.clearTimeout(sharedProjectPendingLocalOpsFlushTimer);
      sharedProjectPendingLocalOpsFlushTimer = null;
    }
    sharedProjectPendingLocalOpsFlushDueAt = 0;
  }

  function scheduleSharedProjectPendingLocalOpsRetry(delayMs = SHARED_PROJECT_LOCAL_OP_RETRY_DELAY_MS, reason = 'retry') {
    if (!activeSharedProjectKey) {
      return;
    }
    // Add a small random jitter to the retry delay to avoid many clients retrying
    // simultaneously (thundering herd) when a shared project reconnects.
    const baseDelay = Math.max(120, Math.round(Number(delayMs) || SHARED_PROJECT_LOCAL_OP_RETRY_DELAY_MS));
    const jitter = Math.round(Math.random() * Math.min(300, Math.floor(baseDelay / 2)));
    const safeDelay = baseDelay + jitter;
    const dueAt = Date.now() + safeDelay;
    if (sharedProjectPendingLocalOpsRetryTimer !== null) {
      if (sharedProjectPendingLocalOpsRetryDueAt > 0 && sharedProjectPendingLocalOpsRetryDueAt <= dueAt) {
        return;
      }
      window.clearTimeout(sharedProjectPendingLocalOpsRetryTimer);
      sharedProjectPendingLocalOpsRetryTimer = null;
    }
    sharedProjectPendingLocalOpsRetryDueAt = dueAt;
    console.info('[shared-sync]', {
      event: 'local-op-retry-timer-set',
      projectKey: activeSharedProjectKey || '',
      reason,
      delayMs: safeDelay,
      queueLength: sharedProjectPendingLocalOps.length,
    });
    sharedProjectPendingLocalOpsRetryTimer = window.setTimeout(() => {
      sharedProjectPendingLocalOpsRetryTimer = null;
      sharedProjectPendingLocalOpsRetryDueAt = 0;
      if (!activeSharedProjectKey) {
        return;
      }
      restorePendingSharedLocalOps(activeSharedProjectKey, {
        announce: false,
        refreshReason: `${reason || 'retry'}-pending-local-ops`,
      }).catch(error => {
        console.warn('Failed to restore pending shared local ops before retry', error);
      }).finally(() => {
        scheduleSharedProjectPendingLocalOpsFlush(0, `${reason || 'retry'}-after-restore`);
      });
    }, safeDelay);
  }

  function requeueSharedProjectOperationCommit(op, {
    retryOnConflict = true,
    prioritize = false,
    source = 'retry',
    retryDelayMs = 0,
  } = {}) {
    if (!op || typeof op !== 'object' || !op.projectKey) {
      return false;
    }
    const opId = getSharedProjectOpId(op);
    if (!opId || sharedProjectSeenOpIds.has(opId)) {
      return false;
    }
    const alreadyQueued = sharedProjectPendingLocalOps.some(entry => (
      getSharedProjectOpId(entry?.op || entry) === opId
    ));
    if (alreadyQueued) {
      return false;
    }
    const queuedOp = {
      projectKey: op.projectKey,
      historyLabel: op.historyLabel || '',
      op,
      opPayload: op.payload || null,
      retryOnConflict,
    };
    updateSharedLocalOpJournalStatus(op, {
      status: 'pending',
    }).catch(error => {
      console.warn('Failed to mark shared local op journal entry pending for retry', error);
    });
    if (opId && sharedProjectLocalInFlightOps.has(opId)) {
      const entry = sharedProjectLocalInFlightOps.get(opId);
      entry.status = 'retrying';
      entry.updatedAtMs = Date.now();
      entry.expiresAtMs = Date.now() + SHARED_PROJECT_LOCAL_OP_EXPIRE_MS;
      entry.retryCount = Math.max(0, Math.round(Number(entry.retryCount) || 0)) + 1;
      sharedProjectLocalInFlightOps.set(opId, entry);
    }
    console.info('[shared-sync]', {
      event: 'local-op-retry-scheduled',
      opId: opId || '',
      projectKey: op.projectKey || '',
      source,
    });
    logSharedProjectLocalOpLifecycle('requeued after commit failure', op, {
      source,
      status: 'retrying',
      opType: classifySharedProjectOpType(op.historyLabel || ''),
    });
    if (prioritize) {
      sharedProjectPendingLocalOps.unshift(queuedOp);
    } else {
      sharedProjectPendingLocalOps.push(queuedOp);
    }
    sortSharedProjectPendingLocalOps();
    const delayMs = Math.max(0, Math.round(Number(retryDelayMs) || 0));
    if (delayMs > 0) {
      sharedProjectPendingLocalRetryBlockedUntil = Math.max(
        sharedProjectPendingLocalRetryBlockedUntil,
        Date.now() + delayMs
      );
      scheduleSharedProjectPendingLocalOpsRetry(delayMs, source);
    } else {
      scheduleSharedProjectPendingLocalOpsFlush(0, source);
    }
    return true;
  }

  function resetLocalHistoryForSharedCollaborativeRemoteChange() {
    if (!isSharedProjectCollaborativeMode()) {
      return;
    }
    history.pending = null;
    history.past = [];
    history.future = [];
    clearMultiHistory();
    updateHistoryButtons();
  }

  function canFlushSharedProjectLocalOpDuringCatchup(queuedOp = null) {
    const opRecord = queuedOp?.op || queuedOp || null;
    const opType = classifySharedProjectOpType(String(queuedOp?.historyLabel || opRecord?.historyLabel || ''));
    return Boolean(
      (opType === 'draw' || opType === 'palette')
      && activeSharedProjectKey
      && activeSharedProjectDocumentLoaded
      && hasUsableActiveSharedProjectDocumentState()
      && !activeSharedProjectOpenInProgress
      && !activeSharedProjectOpenReadOnly
      && canCurrentSharedProjectEdit(activeSharedProjectKey)
      && !sharedProjectSnapshotReplayInFlight
    );
  }


  return Object.freeze({
    reserveSharedProjectRoomRateSlot,
    getSharedProjectRoomCommitDelay,
    markSharedProjectRoomCommitSent,
    scheduleSharedProjectBroadcastRetry,
    sendSharedProjectBroadcastOp,
    sendOp,
    sortSharedProjectPendingLocalOps,
    scheduleSharedProjectPendingLocalOpsFlush,
    clearSharedProjectPendingLocalOpsFlushTimer,
    scheduleSharedProjectPendingLocalOpsRetry,
    requeueSharedProjectOperationCommit,
    resetLocalHistoryForSharedCollaborativeRemoteChange,
    canFlushSharedProjectLocalOpDuringCatchup,
  });
      }
    })(scope);
  }

  root.sharedProjectLocalOpUtils = Object.freeze({
    createSharedProjectLocalOpUtils,
  });
})();
