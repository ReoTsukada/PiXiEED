(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedProjectRecoveryReplayUtils(rawScope = {}) {
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
  async function recoverSharedProjectRealtimeGap(projectKey = activeSharedProjectKey, {
    afterSeq = sharedProjectLastAppliedSeq,
    reason = 'gap',
  } = {}) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || activeSharedProjectKey);
    if (!normalizedProjectKey || !canUseSharedProjectsBackend()) {
      return false;
    }
    if (sharedProjectOpPollInFlight) {
      sharedProjectGapRecoveryRerunRequested = true;
      scheduleSharedProjectOpsRescueRetry(32, `${reason || 'gap'}-after-poll`);
      return false;
    }
    if (sharedProjectGapRecoveryPromise) {
      sharedProjectGapRecoveryRerunRequested = true;
      return sharedProjectGapRecoveryPromise;
    }
    sharedProjectGapRecoveryPromise = (async () => {
      const baseSeq = Math.max(0, Math.round(Number(afterSeq) || 0));
      if (baseSeq > 0 && baseSeq < sharedProjectLastAppliedSeq - 1) {
        console.debug('[shared-realtime] gap-recovery-base-stale', {
          reason,
          projectKey: normalizedProjectKey,
          requestedAfterSeq: baseSeq,
          activeAfterSeq: sharedProjectLastAppliedSeq,
        });
      }
      return await fetchAndReplaySharedProjectOpsBurst(normalizedProjectKey, {
        reason,
        limit: SHARED_PROJECT_MAX_MISSING_OP_FETCH,
        maxRounds: SHARED_PROJECT_BURST_CATCHUP_MAX_ROUNDS,
      });
    })();
    try {
      return await sharedProjectGapRecoveryPromise;
    } catch (_error) {
      return false;
    } finally {
      sharedProjectGapRecoveryPromise = null;
      if (!normalizedProjectKey || normalizedProjectKey !== activeSharedProjectKey) {
        sharedProjectGapRecoveryRerunRequested = false;
        return;
      }
      if (sharedProjectGapRecoveryRerunRequested) {
        sharedProjectGapRecoveryRerunRequested = false;
        scheduleSharedProjectOpsRescueRetry(32, `${reason || 'gap'}-rerun`);
      }
      if (reason && !sharedProjectPendingRemoteOps.size) {
        sharedProjectLastRealtimeActivityAt = Date.now();
      }
    }
  }

  async function pollSharedProjectRealtimeOpsRescue({ reason = 'poll' } = {}) {
    if (!activeSharedProjectKey || !canUseSharedProjectsBackend()) {
      return false;
    }
    if (
      sharedProjectOpPollInFlight
      || sharedProjectGapRecoveryPromise
      || sharedProjectWakeRecoveryPromise
      || sharedProjectRefreshInFlight
    ) {
      return false;
    }
    sharedProjectOpPollInFlight = true;
    try {
      const afterSeq = sharedProjectLastAppliedSeq;
      const recovered = await fetchAndReplaySharedProjectOpsBurst(activeSharedProjectKey, {
        reason,
        limit: Math.min(128, SHARED_PROJECT_MAX_MISSING_OP_FETCH),
        maxRounds: SHARED_PROJECT_BURST_CATCHUP_MAX_ROUNDS,
      });
      const advanced = sharedProjectLastAppliedSeq > afterSeq;
      console.debug('[shared-realtime] rescue-op-poll', {
        reason,
        projectKey: activeSharedProjectKey || '',
        afterSeq,
        afterRevision: sharedProjectLastAppliedSeq,
        recovered,
      });
      if (!recovered) {
        sharedProjectLastRescueAfterSeq = sharedProjectLastAppliedSeq;
        sharedProjectLastRescueOpCount = 0;
        sharedProjectRescueStallCount = 0;
        return Boolean(
          activeSharedProjectDocumentLoaded
          && hasUsableActiveSharedProjectDocumentState()
          && activeSharedProjectSyncState === 'synced'
        );
      }
      if (!advanced) {
        const repeatedSameWindow = (
          sharedProjectLastRescueAfterSeq === afterSeq
          && sharedProjectLastRescueOpCount === 0
        );
        sharedProjectLastRescueAfterSeq = afterSeq;
        sharedProjectLastRescueOpCount = 0;
        sharedProjectRescueStallCount = repeatedSameWindow
          ? (sharedProjectRescueStallCount + 1)
          : 1;
        console.warn('[shared-realtime] rescue-op-poll-stalled', {
          reason,
          projectKey: activeSharedProjectKey || '',
          afterSeq,
          pendingRemoteOps: sharedProjectPendingRemoteOps.size,
          stallCount: sharedProjectRescueStallCount,
        });
        if (sharedProjectRescueStallCount >= 3) {
          runSharedProjectConvergenceResync(`rescue-stalled-${reason || 'poll'}`).catch(() => {
            queueSharedProjectRefresh({
              immediate: false,
              reason: 'canonical-resync',
              force: true,
            });
          });
          scheduleSharedProjectOpsRescueRetry(
            Math.min(4000, SHARED_PROJECT_OP_RESCUE_POLL_INTERVAL_MS * Math.max(2, sharedProjectRescueStallCount))
          );
        } else {
          scheduleSharedProjectOpsRescueRetry(
            Math.min(1500, SHARED_PROJECT_OP_RESCUE_POLL_INTERVAL_MS * (sharedProjectRescueStallCount + 1))
          );
        }
        return false;
      }
      sharedProjectLastRescueAfterSeq = sharedProjectLastAppliedSeq;
      sharedProjectLastRescueOpCount = 0;
      sharedProjectRescueStallCount = 0;
      maybeMarkSharedProjectOpCatchupSynced(reason);
      return recovered;
    } catch (error) {
      console.warn('[shared-realtime] rescue-op-poll-failed', {
        reason,
        projectKey: activeSharedProjectKey || '',
        afterSeq: sharedProjectLastAppliedSeq,
        error: String(error?.message || error || ''),
      });
      return false;
    } finally {
      sharedProjectOpPollInFlight = false;
    }
  }

  function shouldCreateSharedProjectCheckpoint(opType = 'draw') {
    // Checkpoints are supplemental durability for shared projects.
    // Draw operations must stay op-first. Letting arbitrary clients rewrite
    // the canonical snapshot after draw replay can preserve a divergent local
    // document as the server read base.
    if (!isSharedProjectCollaborativeMode()) {
      return false;
    }
    if (opType === 'create' || opType === 'snapshot') {
      return true;
    }
    if ((opType === 'draw' || opType === 'palette') && sharedProjectOpsSinceCheckpoint >= SHARED_PROJECT_CHECKPOINT_OP_COUNT) {
      return true;
    }
    return false;
  }

  function isSharedProjectCheckpointHistoryLabel(historyLabel = '') {
    const normalizedLabel = String(historyLabel || '').trim();
    if (!normalizedLabel) {
      return false;
    }
    return (
      normalizedLabel === 'checkpoint'
      || normalizedLabel === 'structure-checkpoint'
      || normalizedLabel === 'sharedConflictReplay'
      || normalizedLabel === 'sharedForceResync'
      || normalizedLabel === 'sharedProjectCreate'
    );
  }

  function shouldPersistSharedProjectSnapshotForHistoryLabel(historyLabel = '', opType = 'snapshot') {
    const normalizedType = String(opType || 'snapshot').trim() || 'snapshot';
    const normalizedLabel = String(historyLabel || '').trim();
    if (normalizedType === 'create' || normalizedType === 'snapshot' || normalizedType === 'structure') {
      return true;
    }
    if (isSharedProjectCheckpointHistoryLabel(historyLabel)) {
      return true;
    }
    return false;
  }

  function getSharedProjectSnapshotComplexityMultiplier() {
    const sheetCount = Math.max(1, openProjectTabs.length || 1);
    const canvasCount = Math.max(1, getProjectCanvasCount());
    let multiplier = 1;
    if (sheetCount > 1) {
      multiplier += Math.min(2, (sheetCount - 1) * 0.35);
    }
    if (canvasCount > 1) {
      multiplier += Math.min(2.5, (canvasCount - 1) * 0.45);
    }
    return Math.max(1, multiplier);
  }

  function getSharedProjectEffectiveSnapshotDelay(delayMs = SHARED_PROJECT_DEFERRED_PERSIST_DELAY, { force = false } = {}) {
    const requestedDelay = Math.max(0, Math.round(Number(delayMs) || 0));
    if (force && requestedDelay <= 0) {
      return 0;
    }
    const complexDelay = Math.round(SHARED_PROJECT_DEFERRED_PERSIST_DELAY * getSharedProjectSnapshotComplexityMultiplier());
    return Math.max(requestedDelay, complexDelay);
  }

  function scheduleSharedProjectCheckpoint({ immediate = false, historyLabel = 'checkpoint' } = {}) {
    if (!activeSharedProjectKey || !canUseSharedProjectsBackend()) {
      return;
    }
    // Snapshot remains a recovery/checkpoint path, not the primary draw sync path.
    queueSharedProjectCurrentSnapshotCapture({
      delayMs: immediate ? 0 : SHARED_PROJECT_CHECKPOINT_DELAY,
      projectKey: activeSharedProjectKey,
      historyLabel,
      force: true,
    });
  }

  function scheduleSharedProjectVerifiedSnapshotCheckpoint({
    reason = 'recovery-verified-checkpoint',
    delayMs = 900,
    snapshotRevision = activeSharedProjectSnapshotRevision,
    latestRevision = activeSharedProjectRevision,
  } = {}) {
    if (!activeSharedProjectKey || !canUseSharedProjectsBackend()) {
      return false;
    }
    const normalizedSnapshotRevision = Math.max(0, Math.round(Number(snapshotRevision) || 0));
    const normalizedLatestRevision = Math.max(0, Math.round(Number(latestRevision) || 0));
    if (
      normalizedLatestRevision <= 0
      || normalizedSnapshotRevision >= normalizedLatestRevision
      || !activeSharedProjectDocumentLoaded
      || !hasUsableActiveSharedProjectDocumentState()
    ) {
      return false;
    }
    window.setTimeout(() => {
      if (
        !activeSharedProjectKey
        || !activeSharedProjectSynced
        || activeSharedProjectRevision < normalizedLatestRevision
        || hasSharedProjectLocalInFlightOps()
        || hasSharedProjectFailedLocalOps()
      ) {
        return;
      }
      queueSharedProjectCurrentSnapshotCapture({
        delayMs: 0,
        projectKey: activeSharedProjectKey,
        historyLabel: reason,
        force: true,
        revision: activeSharedProjectRevision,
      });
    }, Math.max(0, Math.round(Number(delayMs) || 0)));
    return true;
  }

  function replaySharedProjectDrawOpPayload(opPayload, { historyLabel = '' } = {}) {
    const payload = opPayload && typeof opPayload === 'object' ? opPayload : null;
    if (payload?.command === 'stroke') {
      const replayed = applySharedProjectStrokeCommand({ payload }, { fromRemote: false });
      if (replayed) {
        scheduleSharedProjectCheckpoint({
          immediate: shouldCreateSharedProjectCheckpoint('draw'),
          historyLabel: historyLabel || 'sharedConflictReplay',
        });
      }
      return replayed;
    }
    if (payload?.command === 'shape') {
      const replayed = applySharedProjectShapeCommand({ payload }, { fromRemote: false });
      if (replayed) {
        scheduleSharedProjectCheckpoint({
          immediate: shouldCreateSharedProjectCheckpoint('draw'),
          historyLabel: historyLabel || 'sharedConflictReplay',
        });
      }
      return replayed;
    }
    if (payload?.command === 'fill') {
      const replayed = applySharedProjectFillCommand({ payload }, { fromRemote: false });
      if (replayed) {
        scheduleSharedProjectCheckpoint({
          immediate: shouldCreateSharedProjectCheckpoint('draw'),
          historyLabel: historyLabel || 'sharedConflictReplay',
        });
      }
      return replayed;
    }
    if (payload?.command === 'curve') {
      const replayed = applySharedProjectCurveCommand({ payload }, { fromRemote: false });
      if (replayed) {
        scheduleSharedProjectCheckpoint({
          immediate: shouldCreateSharedProjectCheckpoint('draw'),
          historyLabel: historyLabel || 'sharedConflictReplay',
        });
      }
      return replayed;
    }
    if (payload?.command === 'region') {
      const replayed = applySharedProjectRegionCommand({ payload }, { fromRemote: false });
      if (replayed) {
        scheduleSharedProjectCheckpoint({
          immediate: shouldCreateSharedProjectCheckpoint('draw'),
          historyLabel: historyLabel || 'sharedConflictReplay',
        });
      }
      return replayed;
    }
    const canvasId = typeof payload?.canvasId === 'string' ? payload.canvasId.trim() : '';
    const layerId = typeof payload?.layerId === 'string' ? payload.layerId.trim() : '';
    const frameIndex = Math.max(0, Math.round(Number(payload?.frameIndex) || 0));
    const pixelCount = Math.max(0, Math.floor(Number(payload?.pixelCount) || 0));
    const patch = payload?.patch && typeof payload.patch === 'object' ? payload.patch : null;
    if (!canvasId || !layerId || !pixelCount || !patch) {
      return false;
    }
    const targetCanvas = getProjectCanvasDocumentById(canvasId) || adoptSingleProjectCanvasId(canvasId);
    if (!targetCanvas || !Array.isArray(targetCanvas.frames) || frameIndex >= targetCanvas.frames.length) {
      return false;
    }
    const frame = targetCanvas.frames[frameIndex];
    if (!frame || !Array.isArray(frame.layers)) {
      return false;
    }
    const resolvedLayer = resolveSharedProjectLayerForPayload(frame, payload, layerId);
    const layer = resolvedLayer.layer;
    if (!layer) {
      return false;
    }
    const applyResult = applyLayerPatchPayloadToLayer(layer, patch, pixelCount, {
      width: targetCanvas.width,
      height: targetCanvas.height,
    });
    if (!applyResult) {
      return false;
    }
    const resolvedCanvasId = targetCanvas?.id || canvasId;
    const snapshotKey = buildSharedProjectLayerSnapshotKey(resolvedCanvasId, frameIndex, resolvedLayer.layerId || layerId);
    const nextSnapshot = captureLayerPatchSnapshot(layer, pixelCount);
    if (snapshotKey && nextSnapshot) {
      sharedProjectLayerSnapshots.set(snapshotKey, nextSnapshot);
    }
    applyIncomingSharedProjectVisualResult(targetCanvas, applyResult);
    markDocumentUnsavedChange();
    noteSharedProjectOperationApplied({ opType: 'draw', fromRemote: false });
    scheduleSharedProjectCheckpoint({
      immediate: shouldCreateSharedProjectCheckpoint('draw'),
      historyLabel: historyLabel || 'sharedConflictReplay',
    });
    return true;
  }

  function maybeReplayPendingSharedProjectConflictAfterRefresh(projectKey = activeSharedProjectKey) {
    if (!pendingSharedProjectConflictReplay) {
      return false;
    }
    if (pendingSharedProjectConflictReplay.projectKey !== projectKey) {
      return false;
    }
    const pending = pendingSharedProjectConflictReplay;
    pendingSharedProjectConflictReplay = null;
    const replayed = replaySharedProjectDrawOpPayload(pending.opPayload, {
      historyLabel: pending.historyLabel,
    });
    if (replayed) {
      setMultiStatus(
        localizeText(
          '共有競合を検知し、あなたの描画を最新状態へ再適用しました',
          'A shared edit conflict was detected. Your stroke was reapplied on the latest state.'
        ),
        'info'
      );
    }
    return replayed;
  }

  function compareSharedProjectOpsForReplay(left, right) {
    const leftSeq = getSharedProjectOpSeq(left);
    const rightSeq = getSharedProjectOpSeq(right);
    if (leftSeq !== rightSeq) {
      return leftSeq - rightSeq;
    }
    const leftCreatedAt = String(left?.created_at || left?.createdAt || left?.payload?.createdAt || '');
    const rightCreatedAt = String(right?.created_at || right?.createdAt || right?.payload?.createdAt || '');
    if (leftCreatedAt && rightCreatedAt && leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt.localeCompare(rightCreatedAt);
    }
    const leftOpId = String(getSharedProjectOpId(left) || '');
    const rightOpId = String(getSharedProjectOpId(right) || '');
    if (leftOpId !== rightOpId) {
      return leftOpId.localeCompare(rightOpId);
    }
    return 0;
  }

  async function fetchMissingOps(projectKey = activeSharedProjectKey, afterSeq = sharedProjectLastAppliedSeq, limit = SHARED_PROJECT_MAX_MISSING_OP_FETCH) {
    return await fetchSharedProjectOpsSince(projectKey, afterSeq, limit);
  }

  function maybeMarkSharedProjectOpCatchupSynced(reason = 'op-catchup') {
    if (
      activeSharedProjectKey
      && activeSharedProjectDocumentLoaded
      && hasUsableActiveSharedProjectDocumentState()
      && !sharedProjectPendingRemoteOps.size
      && !sharedProjectRefreshInFlight
      && activeSharedProjectSyncState === 'catching-up'
    ) {
      setActiveSharedProjectSyncState('synced');
      console.debug('[shared-realtime] op-catchup-synced', {
        reason,
        projectKey: activeSharedProjectKey || '',
        revision: sharedProjectLastAppliedSeq,
      });
    }
  }

  async function fetchAndReplaySharedProjectOpsBurst(projectKey = activeSharedProjectKey, {
    reason = 'op-burst-catchup',
    limit = 128,
    maxRounds = SHARED_PROJECT_BURST_CATCHUP_MAX_ROUNDS,
  } = {}) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || activeSharedProjectKey);
    if (!normalizedProjectKey || normalizedProjectKey !== activeSharedProjectKey || !canUseSharedProjectsBackend()) {
      return false;
    }
    let recovered = false;
    let totalFetched = 0;
    let lastFetchCount = 0;
    const normalizedLimit = Math.max(1, Math.min(
      SHARED_PROJECT_MAX_MISSING_OP_FETCH,
      Math.round(Number(limit) || 128)
    ));
    const rounds = Math.max(1, Math.min(
      SHARED_PROJECT_BURST_CATCHUP_MAX_ROUNDS,
      Math.round(Number(maxRounds) || SHARED_PROJECT_BURST_CATCHUP_MAX_ROUNDS)
    ));
    for (let round = 0; round < rounds; round += 1) {
      if (
        normalizedProjectKey !== activeSharedProjectKey
        || sharedProjectRefreshInFlight
        || sharedProjectSnapshotReplayInFlight
      ) {
        break;
      }
      const afterSeq = sharedProjectLastAppliedSeq;
      const fetchStartedAt = Date.now();
      const ops = await fetchMissingOps(normalizedProjectKey, afterSeq, normalizedLimit);
      const fetchSucceeded = sharedProjectLastOpsFetchSucceededAt >= fetchStartedAt;
      lastFetchCount = ops.length;
      if (!ops.length) {
        if (fetchSucceeded) {
          maybeMarkSharedProjectOpCatchupSynced(reason);
        } else {
          scheduleSharedProjectOpsRescueRetry(180, `${reason || 'op-burst'}-fetch-retry`);
          return false;
        }
        break;
      }
      totalFetched += ops.length;
      confirmSharedProjectLocalOpsFromServerOps(ops, { source: reason });
      const beforeSeq = sharedProjectLastAppliedSeq;
      const replayed = await replayOps(ops, { fromRemote: true });
      if (!replayed) {
        scheduleSharedProjectOpsRescueRetry(120, `${reason || 'op-burst'}-apply-retry`);
        scheduleSharedProjectConvergenceResync(`${reason || 'op-burst'}-apply-retry`, 420);
        return false;
      }
      recovered = true;
      sharedProjectLastRealtimeActivityAt = Date.now();
      if (sharedProjectLastAppliedSeq <= beforeSeq && !sharedProjectPendingRemoteOps.size) {
        break;
      }
      if (ops.length < normalizedLimit && !sharedProjectPendingRemoteOps.size) {
        scheduleSharedProjectOpsRescueRetry(96, `${reason || 'op-burst'}-tail-check`);
        maybeMarkSharedProjectOpCatchupSynced(reason);
        break;
      }
    }
    if (recovered && sharedProjectPendingRemoteOps.size) {
      scheduleSharedProjectOpsRescueRetry(48, `${reason || 'op-burst'}-pending-drain`);
    } else if (recovered && lastFetchCount >= normalizedLimit) {
      scheduleSharedProjectOpsRescueRetry(48, `${reason || 'op-burst'}-continue`);
    }
    if (recovered) {
      console.debug('[shared-realtime] op-burst-catchup-done', {
        reason,
        projectKey: normalizedProjectKey,
        revision: sharedProjectLastAppliedSeq,
        totalFetched,
      });
    }
    return recovered;
  }

  function scheduleSharedProjectOpsRescueRetry(delayMs = SHARED_PROJECT_OP_RESCUE_POLL_INTERVAL_MS, reason = 'retry-op-poll') {
    if (!activeSharedProjectKey) {
      return;
    }
    const safeDelay = Math.max(
      SHARED_PROJECT_OP_RESCUE_POLL_INTERVAL_MS,
      Math.round(Number(delayMs) || SHARED_PROJECT_OP_RESCUE_POLL_INTERVAL_MS)
    );
    const dueAt = Date.now() + safeDelay;
    if (sharedProjectOpsRescueRetryTimer !== null) {
      if (sharedProjectOpsRescueRetryDueAt > 0 && sharedProjectOpsRescueRetryDueAt <= dueAt) {
        return;
      }
      window.clearTimeout(sharedProjectOpsRescueRetryTimer);
      sharedProjectOpsRescueRetryTimer = null;
    }
    sharedProjectOpsRescueRetryDueAt = dueAt;
    sharedProjectOpsRescueRetryTimer = window.setTimeout(() => {
      sharedProjectOpsRescueRetryTimer = null;
      sharedProjectOpsRescueRetryDueAt = 0;
      if (!activeSharedProjectKey) {
        return;
      }
      if (sharedProjectRefreshInFlight) {
        scheduleSharedProjectOpsRescueRetry(180, `${reason || 'retry-op-poll'}-after-refresh`);
        return;
      }
      if (sharedProjectGapRecoveryPromise) {
        if (sharedProjectGapRecoveryPromise) {
          sharedProjectGapRecoveryRerunRequested = true;
        }
        return;
      }
      pollSharedProjectRealtimeOpsRescue({ reason }).catch(() => {});
    }, safeDelay);
  }

  function scheduleSharedProjectBroadcastCatchupRetry({
    reason = 'broadcast-catchup',
    attempt = 0,
    delays = [320, 900, 1900, 3600],
  } = {}) {
    if (!activeSharedProjectKey || sharedProjectBroadcastCatchupTimer !== null) {
      return;
    }
    const normalizedAttempt = Math.max(0, Math.round(Number(attempt) || 0));
    const retryDelays = Array.isArray(delays) && delays.length ? delays : [320, 900, 1900, 3600];
    if (normalizedAttempt >= retryDelays.length) {
      return;
    }
    const delayMs = Math.max(120, Math.round(Number(retryDelays[normalizedAttempt]) || 320));
    sharedProjectBroadcastCatchupTimer = window.setTimeout(() => {
      sharedProjectBroadcastCatchupTimer = null;
      if (!activeSharedProjectKey || sharedProjectRefreshInFlight) {
        scheduleSharedProjectBroadcastCatchupRetry({
          reason,
          attempt: normalizedAttempt + 1,
          delays: retryDelays,
        });
        return;
      }
      const beforeSeq = sharedProjectLastAppliedSeq;
      pollSharedProjectRealtimeOpsRescue({ reason }).then(recovered => {
        const advanced = sharedProjectLastAppliedSeq > beforeSeq;
        console.debug('[shared-realtime] broadcast-catchup-attempt', {
          reason,
          attempt: normalizedAttempt,
          beforeSeq,
          afterSeq: sharedProjectLastAppliedSeq,
          advanced,
          recovered,
        });
        scheduleSharedProjectBroadcastCatchupRetry({
          reason,
          attempt: normalizedAttempt + 1,
          delays: retryDelays,
        });
      }).catch(() => {
        scheduleSharedProjectBroadcastCatchupRetry({
          reason,
          attempt: normalizedAttempt + 1,
          delays: retryDelays,
        });
      });
    }, delayMs);
  }

  function scheduleSharedProjectPostCommitCatchup(reason = 'local-commit-confirmed') {
    if (!activeSharedProjectKey) {
      return;
    }
    scheduleSharedProjectOpsRescueRetry(SHARED_PROJECT_OP_RESCUE_POLL_INTERVAL_MS, reason);
    scheduleSharedProjectBroadcastCatchupRetry({
      reason,
      delays: [420, 1100, 2400],
    });
  }

  function drainPendingSharedProjectRemoteOps() {
    let appliedAny = false;
    while (sharedProjectPendingRemoteOps.has(sharedProjectLastAppliedSeq + 1)) {
      const nextSeq = sharedProjectLastAppliedSeq + 1;
      if (shouldDeferIncomingSharedProjectRemoteApply()) {
        scheduleDeferredSharedProjectRemoteOpsDrain();
        return false;
      }
      const nextOp = sharedProjectPendingRemoteOps.get(nextSeq);
      const nextOpId = normalizeSharedProjectOpId(nextOp);
      sharedProjectPendingRemoteOps.delete(nextSeq);
      if (
        nextOpId
        && sharedProjectSeenOpIds.has(nextOpId)
      ) {
        sharedProjectLastAppliedSeq = nextSeq;
        activeSharedProjectRevision = Math.max(activeSharedProjectRevision, nextSeq);
        activeSharedProjectStructureRevision = Math.max(
          activeSharedProjectStructureRevision,
          Math.max(0, Math.round(Number(nextOp?.structure_revision) || 0))
        );
        appliedAny = true;
        continue;
      }
      if (!applyOp(nextOp, { fromRemote: true })) {
        rememberPendingSharedProjectRemoteOp(nextSeq, nextOp, 'drain-apply-failed');
        scheduleSharedProjectOpsRescueRetry(120, 'drain-apply-failed');
        return false;
      }
      console.info('[shared-sync]', {
        event: 'draw-op-replayed-after-structure-sync',
        opId: nextOpId || getSharedProjectOpId(nextOp),
        revision: nextSeq,
        provisional: false,
      });
      sharedProjectLastAppliedSeq = nextSeq;
      activeSharedProjectRevision = Math.max(activeSharedProjectRevision, nextSeq);
      activeSharedProjectStructureRevision = Math.max(
        activeSharedProjectStructureRevision,
        Math.max(0, Math.round(Number(nextOp?.structure_revision) || 0))
      );
      appliedAny = true;
    }
    if (appliedAny && sharedProjectReplayRenderBatchDepth <= 0) {
      replaySharedProjectLocalProvisionalAfterRemoteOps('pending-remote-drained-before-local');
    }
    return true;
  }

  async function replayOps(ops, { fromRemote = true } = {}) {
    const list = Array.isArray(ops) ? ops.slice() : [];
    if (!list.length) {
      return true;
    }
    if (fromRemote) {
      markSharedProjectTrafficActivity('rx');
    }
    list.sort(compareSharedProjectOpsForReplay);
    beginSharedProjectReplayRenderBatch();
    try {
      for (let index = 0; index < list.length; index += 1) {
        const op = list[index];
        const opId = normalizeSharedProjectOpId(op);
        const seq = getSharedProjectOpSeq(op);
        if (!seq) {
          continue;
        }
        if (
          fromRemote
          && opId
          && sharedProjectSeenOpIds.has(opId)
        ) {
          if (isSharedProjectRemoteOpFromCurrentSession(op)) {
            logSharedProjectDrawLifecycle('remote-confirmed-op-applied', op, {
              mode: 'self-confirmed-ack',
              reason: 'self-ack-without-reapply',
            });
          }
          if (seq === sharedProjectLastAppliedSeq + 1) {
            sharedProjectLastAppliedSeq = seq;
            activeSharedProjectRevision = Math.max(activeSharedProjectRevision, seq);
            activeSharedProjectStructureRevision = Math.max(
              activeSharedProjectStructureRevision,
              Math.max(0, Math.round(Number(op?.structure_revision) || 0))
            );
            if (!drainPendingSharedProjectRemoteOps()) {
              return false;
            }
          }
          continue;
        }
        if (
          fromRemote
          && seq <= activeSharedProjectRevision
          && seq <= sharedProjectLastAppliedSeq
        ) {
          if (opId) {
            rememberSharedProjectSeenOp(opId, seq);
          }
          logSharedProjectDrawLifecycle('remote-confirmed-op-skipped', op, {
            mode: isSharedProjectRemoteOpFromCurrentSession(op) ? 'self-confirmed-ack' : 'remote-confirmed',
            skipReason: 'active-revision-too-old',
          });
          console.info('[shared-sync]', {
            event: 'stale-op-skipped',
            opId,
            revision: seq,
            activeRevision: activeSharedProjectRevision,
          });
          continue;
        }
        if (seq <= sharedProjectLastAppliedSeq) {
          if (fromRemote) {
            if (opId) {
              rememberSharedProjectSeenOp(opId, seq);
            }
            logSharedProjectDrawLifecycle('remote-confirmed-op-skipped', op, {
              mode: isSharedProjectRemoteOpFromCurrentSession(op) ? 'self-confirmed-ack' : 'remote-confirmed',
              skipReason: 'revision-too-old',
            });
          }
          continue;
        }
        if (seq > sharedProjectLastAppliedSeq + 1) {
          console.info('[shared-sync]', {
            event: 'replay-gap-detected',
            opId,
            revision: seq,
            activeRevision: sharedProjectLastAppliedSeq,
          });
          rememberPendingSharedProjectRemoteOp(seq, op, 'replay-gap');
          scheduleSharedProjectOpsRescueRetry(48, 'replay-gap-detected');
          continue;
        }
        if (fromRemote && shouldDeferIncomingSharedProjectRemoteApply()) {
          rememberPendingSharedProjectRemoteOp(seq, op, 'replay-deferred');
          scheduleDeferredSharedProjectRemoteOpsDrain();
          continue;
        }
        if (!applyOp(op, { fromRemote, provisional: false })) {
          scheduleSharedProjectOpsRescueRetry(120, 'replay-apply-failed');
          return false;
        }
        const beforeRevision = activeSharedProjectRevision;
        sharedProjectLastAppliedSeq = seq;
        activeSharedProjectRevision = Math.max(activeSharedProjectRevision, seq);
        console.info('[shared-sync]', {
          event: 'remote-confirmed-revision-advanced',
          beforeRevision,
          opRevision: seq,
          afterRevision: activeSharedProjectRevision,
        });
        activeSharedProjectStructureRevision = Math.max(
          activeSharedProjectStructureRevision,
          Math.max(0, Math.round(Number(op?.structure_revision) || 0))
        );
        if (!drainPendingSharedProjectRemoteOps()) {
          return false;
        }
      }
      if (fromRemote) {
        replaySharedProjectLocalProvisionalAfterRemoteOps('remote-op-ordered-before-local');
      }
    } finally {
      endSharedProjectReplayRenderBatch();
    }
    return true;
  }


  return Object.freeze({
    recoverSharedProjectRealtimeGap,
    pollSharedProjectRealtimeOpsRescue,
    shouldCreateSharedProjectCheckpoint,
    isSharedProjectCheckpointHistoryLabel,
    shouldPersistSharedProjectSnapshotForHistoryLabel,
    getSharedProjectSnapshotComplexityMultiplier,
    getSharedProjectEffectiveSnapshotDelay,
    scheduleSharedProjectCheckpoint,
    scheduleSharedProjectVerifiedSnapshotCheckpoint,
    replaySharedProjectDrawOpPayload,
    maybeReplayPendingSharedProjectConflictAfterRefresh,
    compareSharedProjectOpsForReplay,
    fetchMissingOps,
    maybeMarkSharedProjectOpCatchupSynced,
    fetchAndReplaySharedProjectOpsBurst,
    scheduleSharedProjectOpsRescueRetry,
    scheduleSharedProjectBroadcastCatchupRetry,
    scheduleSharedProjectPostCommitCatchup,
    drainPendingSharedProjectRemoteOps,
    replayOps,
  });
      }
    })(scope);
  }

  root.sharedProjectRecoveryReplayUtils = Object.freeze({
    createSharedProjectRecoveryReplayUtils,
  });
})();
