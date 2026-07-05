(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedProjectSessionStateUtils(rawScope = {}) {
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
  function maybePollSharedProjectServerOps({
    reason = 'server-primary-op-poll',
    realtimeLikelyHealthy = false,
    realtimeSubscribed = false,
    force = false,
    allowRefreshBackstop = true,
  } = {}) {
    if (!activeSharedProjectKey || !canUseSharedProjectsBackend()) {
      return false;
    }
    if (document.visibilityState === 'hidden') {
      return false;
    }
    if (
      sharedProjectOpPollInFlight
      || sharedProjectGapRecoveryPromise
      || sharedProjectRefreshInFlight
      || (sharedProjectOpCommitInFlight && !force)
    ) {
      return false;
    }
    const now = Date.now();
    const normalizedReason = String(reason || 'server-primary-op-poll');
    const pollIntervalMs = (!realtimeSubscribed || !realtimeLikelyHealthy || activeSharedProjectSyncState === 'catching-up')
      ? SHARED_PROJECT_OP_RESCUE_POLL_INTERVAL_MS
      : SHARED_PROJECT_SERVER_OP_POLL_INTERVAL_MS;
    if (!force && (now - sharedProjectLastServerOpPollAt) < pollIntervalMs) {
      return false;
    }
    sharedProjectLastServerOpPollAt = now;
    pollSharedProjectRealtimeOpsRescue({
      reason: normalizedReason,
    }).then(recovered => {
      if (recovered) {
        return;
      }
      if (!allowRefreshBackstop || sharedProjectRefreshInFlight || sharedProjectRefreshTimer !== null) {
        return;
      }
      if (hasSharedProjectHardLocalWorkInFlight()) {
        return;
      }
      const refreshIntervalMs = (realtimeSubscribed && realtimeLikelyHealthy)
        ? SHARED_PROJECT_SERVER_OP_REFRESH_BACKSTOP_MS
        : SHARED_PROJECT_REFRESH_LOOP_INTERVAL_MS;
      const refreshNow = Date.now();
      if ((refreshNow - sharedProjectLastServerOpRefreshBackstopAt) < refreshIntervalMs) {
        return;
      }
      sharedProjectLastServerOpRefreshBackstopAt = refreshNow;
      queueSharedProjectRefresh({
        immediate: false,
        reason: `${normalizedReason}-latest-check`,
        force: true,
      });
    }).catch(() => {
      if (
        !allowRefreshBackstop
        || realtimeLikelyHealthy
        || sharedProjectRefreshInFlight
        || sharedProjectRefreshTimer !== null
        || hasSharedProjectHardLocalWorkInFlight()
      ) {
        return;
      }
      const refreshNow = Date.now();
      if ((refreshNow - sharedProjectLastServerOpRefreshBackstopAt) < SHARED_PROJECT_REFRESH_LOOP_INTERVAL_MS) {
        return;
      }
      sharedProjectLastServerOpRefreshBackstopAt = refreshNow;
      queueSharedProjectRefresh({
        immediate: false,
        reason: `${normalizedReason}-latest-check`,
        force: true,
      });
    });
    return true;
  }

  function ensureSharedProjectRefreshLoop() {
    if (sharedProjectPollingTimer !== null) {
      window.clearInterval(sharedProjectPollingTimer);
      sharedProjectPollingTimer = null;
    }
    if (!canUseSharedProjectsBackend() || !activeSharedProjectKey) {
      return;
    }
    sharedProjectWatchdogLastTickAt = Date.now();
    sharedProjectPollingTimer = window.setInterval(() => {
      if (!canUseSharedProjectsBackend() || !activeSharedProjectKey) {
        return;
      }
      const now = Date.now();
      const previousWatchdogTickAt = sharedProjectWatchdogLastTickAt;
      const watchdogGapMs = previousWatchdogTickAt > 0 ? (now - previousWatchdogTickAt) : 0;
      sharedProjectWatchdogLastTickAt = now;
      if (document.visibilityState === 'hidden') {
        return;
      }
      if (watchdogGapMs >= SHARED_PROJECT_SLEEP_WAKE_GAP_MS) {
        logSharedProjectRealtimeChannelLifecycle('watchdog-sleep-gap', {
          caller: 'ensureSharedProjectRefreshLoop',
          reason: 'timer-gap-detected',
          extra: {
            watchdogGapMs,
            realtimeStatus: sharedProjectRealtimeStatus,
            syncState: activeSharedProjectSyncState,
            channelState: typeof activeSharedProjectChannel?.state === 'string' ? activeSharedProjectChannel.state : '',
            joinState: typeof activeSharedProjectChannel?.joinPush?.state === 'string' ? activeSharedProjectChannel.joinPush.state : '',
          },
        });
        recoverSharedProjectAfterWake('watchdog-sleep-gap', {
          hiddenGapMs: watchdogGapMs,
          immediate: true,
        }).catch(() => {});
        return;
      }
      if (
        activeSharedProjectSyncState === 'catching-up'
        && !sharedProjectReconnectRecoveryPromise
        && sharedProjectReconnectRecoveryTimer === null
        && !sharedProjectRefreshInFlight
      ) {
        const catchingUpForMs = sharedProjectCatchingUpStartedAt > 0
          ? Math.max(0, now - sharedProjectCatchingUpStartedAt)
          : 0;
        logSharedProjectRealtimeChannelLifecycle('watchdog-catchup-stalled', {
          caller: 'ensureSharedProjectRefreshLoop',
          reason: 'catching-up-without-recovery',
          extra: {
            catchingUpForMs,
            realtimeStatus: sharedProjectRealtimeStatus,
            channelState: typeof activeSharedProjectChannel?.state === 'string' ? activeSharedProjectChannel.state : '',
            joinState: typeof activeSharedProjectChannel?.joinPush?.state === 'string' ? activeSharedProjectChannel.joinPush.state : '',
          },
        });
        maybePollSharedProjectServerOps({
          reason: 'watchdog-catchup-stalled',
          force: true,
          allowRefreshBackstop: true,
        });
        if (catchingUpForMs >= SHARED_PROJECT_VISIBLE_RECOVER_AFTER_SYNC_MS && sharedProjectRefreshTimer === null) {
          queueSharedProjectRefresh({
            immediate: false,
            reason: 'watchdog-catchup-backstop',
            force: true,
          });
        }
        if (catchingUpForMs >= SHARED_PROJECT_AUTO_RELOAD_AFTER_CATCHUP_MS) {
          softResumeSharedProjectAfterSleep('watchdog-catchup-stalled', {
            hiddenGapMs: catchingUpForMs,
            intensity: 'canonical',
          }).then(recovered => {
            if (!recovered) {
              scheduleSharedProjectRecoveryReload('watchdog-catchup-stalled', 1200);
            }
          }).catch(() => {
            scheduleSharedProjectRecoveryReload('watchdog-catchup-stalled', 1200);
          });
        }
        return;
      }
      if (autosaveWriteInFlight || multiState.applyRemoteInProgress) {
        return;
      }
      const realtimeSubscribed = sharedProjectRealtimeStatus === 'subscribed';
      if (sharedProjectRealtimeRetryBlockedUntil > now) {
        logSharedProjectRealtimeChannelLifecycle('poll-during-realtime-retry-block', {
          caller: 'ensureSharedProjectRefreshLoop',
          reason: 'retry-block-active',
        });
        pollSharedProjectRealtimeOpsRescue({
          reason: 'retry-block-op-poll',
        }).then(recovered => {
          if (recovered) {
            return;
          }
          if (!sharedProjectRefreshInFlight && sharedProjectRefreshTimer === null) {
            queueSharedProjectRefresh({ immediate: false, reason: 'retry-block-poll-recovery', force: true });
          }
        }).catch(() => {
          if (!sharedProjectRefreshInFlight && sharedProjectRefreshTimer === null) {
            queueSharedProjectRefresh({ immediate: false, reason: 'retry-block-poll-recovery', force: true });
          }
        });
        return;
      }
      if (sharedProjectRealtimeConnectPromise) {
        logSharedProjectRealtimeChannelLifecycle('poll-during-realtime-connect', {
          caller: 'ensureSharedProjectRefreshLoop',
          reason: 'realtime-connect-in-flight',
        });
        pollSharedProjectRealtimeOpsRescue({
          reason: 'connect-in-flight-op-poll',
        }).then(recovered => {
          if (recovered) {
            return;
          }
          if (!sharedProjectRefreshInFlight && sharedProjectRefreshTimer === null) {
            queueSharedProjectRefresh({ immediate: false, reason: 'connect-in-flight-poll-recovery', force: true });
          }
        }).catch(() => {
          if (!sharedProjectRefreshInFlight && sharedProjectRefreshTimer === null) {
            queueSharedProjectRefresh({ immediate: false, reason: 'connect-in-flight-poll-recovery', force: true });
          }
        });
        return;
      }
      const realtimeLikelyHealthy = Boolean(
        activeSharedProjectChannel
        && sharedProjectRealtimeRetryBlockedUntil <= now
      );
      const recentlyAppliedRealtime = (now - sharedProjectLastRealtimeActivityAt) < SHARED_PROJECT_REFRESH_IDLE_GRACE_MS;
      if (realtimeSubscribed && realtimeLikelyHealthy) {
        // shared_project_ops is the source of truth. Realtime is only a wake-up path;
        // a bounded server poll closes gaps when a browser misses an event after reload/sleep.
        maybePollSharedProjectServerOps({
          reason: 'server-primary-healthy-op-poll',
          realtimeLikelyHealthy,
          realtimeSubscribed,
        });
        return;
      }
      if (realtimeLikelyHealthy && recentlyAppliedRealtime) {
        maybePollSharedProjectServerOps({
          reason: 'server-primary-recent-op-poll',
          realtimeLikelyHealthy,
          realtimeSubscribed,
        });
        return;
      }
      pollSharedProjectRealtimeOpsRescue({
        reason: realtimeLikelyHealthy ? 'idle-op-poll' : 'recovery-op-poll',
      }).then(recovered => {
        if (recovered) {
          return;
        }
        if (!realtimeLikelyHealthy) {
          // Refresh loop is recovery-only when realtime itself looks unhealthy.
          queueSharedProjectRefresh({ immediate: false, reason: 'poll-recovery', force: true });
          return;
        }
        scheduleSharedProjectOpsRescueRetry();
      }).catch(() => {
        if (!realtimeLikelyHealthy) {
          queueSharedProjectRefresh({ immediate: false, reason: 'poll-recovery', force: true });
          return;
        }
        scheduleSharedProjectOpsRescueRetry();
      });
    }, Math.min(SHARED_PROJECT_REFRESH_LOOP_INTERVAL_MS, SHARED_PROJECT_OP_RESCUE_POLL_INTERVAL_MS));
  }

  function reportSharedProjectRealtimeSubscribeFailure(error) {
    const now = Date.now();
    const reason = typeof error?.message === 'string' ? error.message : String(error || '');
    if (activeSharedProjectKey) {
      const canContinueFromSavedHistory = (
        canResumeSharedProjectEditingFromDurableHistory(activeSharedProjectKey)
        || hasStableSharedProjectDurableState(activeSharedProjectKey)
      );
      if (!canContinueFromSavedHistory) {
        setActiveSharedProjectSyncState('catching-up', { announce: true });
      }
      queueSharedProjectReconnectRecovery('realtime-subscribe-failure', {
        immediate: false,
        blockEditing: !canContinueFromSavedHistory,
      }).catch(() => {});
      if (canContinueFromSavedHistory) {
        scheduleSharedProjectOpsRescueRetry();
      }
    }
    if ((now - sharedProjectRealtimeWarnedAt) < 30000) {
      return;
    }
    sharedProjectRealtimeWarnedAt = now;
    console.warn('Failed to subscribe shared project realtime channel', {
      reason,
      accountLoggedIn: Boolean(accountState.isLoggedIn),
      accountUserId: accountState.userId || '',
      accountAnonymous: Boolean(accountState.isAnonymous),
      activeProjectKey: activeSharedProjectKey || '',
      activeProjectId: activeSharedProjectId || '',
      retryBlockedUntil: sharedProjectRealtimeRetryBlockedUntil,
      channelKey: activeSharedProjectChannelKey || '',
      channelSignature: activeSharedProjectChannelSignature || '',
    });
    setMultiStatus(
      localizeText(
        reason.includes('auth')
          ? '共有リアルタイム接続に必要な認証を確認できません。保存済み履歴から同期を継続します。'
          : (reason.includes('CHANNEL_ERROR')
            ? '共有リアルタイム接続でチャンネルエラーが発生しました。保存済み履歴から同期を継続します。'
            : (reason.includes('CLOSED')
              ? '共有リアルタイム接続が終了しました。保存済み履歴から同期を継続します。'
              : '共有リアルタイム接続が不安定です。保存済み履歴から同期を継続します。')),
        reason.includes('auth')
          ? 'Shared realtime auth is unavailable. Sync continues from saved history.'
          : (reason.includes('CHANNEL_ERROR')
            ? 'Shared realtime hit a channel error. Sync continues from saved history.'
            : (reason.includes('CLOSED')
              ? 'Shared realtime channel closed. Sync continues from saved history.'
              : 'Shared realtime is unstable. Sync continues from saved history.'))
      ),
      'warn'
    );
  }

  function getSharedProjectRealtimeClientType(supabase) {
    if (!supabase) {
      return 'unknown';
    }
    if (supabase === accountState.supabase) {
      return 'authenticated';
    }
    if (supabase === multiState.supabase) {
      return 'multi';
    }
    return 'unknown';
  }

  function getSharedProjectRealtimeDebugStage() {
    let configuredStage = '';
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search || '');
        configuredStage = String(
          params.get('sharedRealtimeStage')
          || window.localStorage?.getItem('pixiedraw:shared-realtime-stage')
          || ''
        ).trim().toUpperCase();
      }
    } catch (_error) {
      configuredStage = '';
    }
    if (configuredStage === 'A' || configuredStage === 'B' || configuredStage === 'C' || configuredStage === 'D') {
      return configuredStage;
    }
    return 'FULL';
  }

  function getSharedProjectRealtimeStageDescription(stage = 'FULL') {
    switch (String(stage || 'FULL').toUpperCase()) {
      case 'A':
        return 'broadcast-only';
      case 'B':
        return 'broadcast+shared_projects';
      case 'C':
        return 'broadcast+shared_projects+shared_project_ops';
      case 'D':
        return 'broadcast+shared_projects+shared_project_ops+shared_project_members';
      default:
        return 'full';
    }
  }

  function shouldEnableSharedProjectRealtimeStage(stage = 'FULL', target = 'broadcast') {
    const normalizedStage = String(stage || 'FULL').toUpperCase();
    if (target === 'broadcast') {
      return true;
    }
    if (target === 'projects') {
      return normalizedStage !== 'A';
    }
    if (target === 'ops') {
      return normalizedStage === 'C' || normalizedStage === 'D' || normalizedStage === 'FULL';
    }
    if (target === 'members') {
      return normalizedStage === 'D' || normalizedStage === 'FULL';
    }
    return true;
  }

  function getSharedProjectRealtimeSessionDebugState() {
    return {
      activeProjectKey: activeSharedProjectKey || '',
      activeProjectId: activeSharedProjectId || '',
      activeRevision: activeSharedProjectRevision,
      activeStructureRevision: activeSharedProjectStructureRevision,
      channelKey: activeSharedProjectChannelKey || '',
      channelSignature: activeSharedProjectChannelSignature || '',
      hasActiveChannel: Boolean(activeSharedProjectChannel),
      channelState: typeof activeSharedProjectChannel?.state === 'string' ? activeSharedProjectChannel.state : '',
      joinState: typeof activeSharedProjectChannel?.joinPush?.state === 'string' ? activeSharedProjectChannel.joinPush.state : '',
      retryBlockedUntil: sharedProjectRealtimeRetryBlockedUntil,
      hasConnectPromise: Boolean(sharedProjectRealtimeConnectPromise),
      accountLoggedIn: Boolean(accountState.isLoggedIn),
      accountUserId: accountState.userId || '',
      accountAnonymous: Boolean(accountState.isAnonymous),
    };
  }

  function logSharedProjectRealtimeChannelLifecycle(action, {
    reason = '',
    caller = '',
    projectKey = activeSharedProjectKey || '',
    projectId = activeSharedProjectId || '',
    channelSignature = activeSharedProjectChannelSignature || '',
    channelKey = activeSharedProjectChannelKey || '',
    extra = null,
  } = {}) {
    const sessionDebug = getSharedProjectRealtimeSessionDebugState();
    console.debug(`[shared-realtime] ${action}`, {
      ...sessionDebug,
      caller,
      reason,
      projectKey,
      projectId,
      channelSignature,
      channelKey,
      ...(extra && typeof extra === 'object' ? { extra } : {}),
    });
  }

  function logSharedProjectDrawBlock(reason, extra = null) {
    if (!isSharedProjectCollaborativeMode()) {
      return;
    }
    console.debug('[shared-draw] blocked', {
      reason,
      tool: state.tool || '',
      activeProjectKey: activeSharedProjectKey || '',
      activeProjectId: activeSharedProjectId || '',
      activeRevision: activeSharedProjectRevision,
      activeStructureRevision: activeSharedProjectStructureRevision,
      documentLoaded: Boolean(activeSharedProjectDocumentLoaded),
      multiConnected: Boolean(multiState.connected),
      multiRole: multiState.role || '',
      activeCanvasId: getActiveProjectCanvasDocument()?.id || '',
      activeFrame: Math.max(0, Math.round(Number(state.activeFrame) || 0)),
      activeLayer: typeof state.activeLayer === 'string' ? state.activeLayer : '',
      ...(extra && typeof extra === 'object' ? { extra } : {}),
    });
  }

  function setActiveSharedProjectSession(projectKey = '', revision = 0, structureRevision = 0, projectId = '') {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey);
    if (!normalizedProjectKey) {
      logSharedProjectRealtimeChannelLifecycle('set-session-empty-project', {
        caller: 'setActiveSharedProjectSession',
        reason: 'missing-project-key',
        projectKey: '',
        projectId: typeof projectId === 'string' ? projectId.trim() : '',
      });
      clearActiveSharedProjectSession('set-empty-project');
      return;
    }
    const normalizedProjectId = typeof projectId === 'string' ? projectId.trim() : '';
    const incomingRevision = Math.max(0, Math.round(Number(revision) || 0));
    const incomingStructureRevision = Math.max(0, Math.round(Number(structureRevision) || 0));
    const projectChanged = Boolean(
      (activeSharedProjectKey && activeSharedProjectKey !== normalizedProjectKey)
      || (activeSharedProjectId && normalizedProjectId && activeSharedProjectId !== normalizedProjectId)
    );
    const previousRevision = projectChanged ? 0 : Math.max(0, Math.round(Number(activeSharedProjectRevision) || 0));
    const previousStructureRevision = projectChanged ? 0 : Math.max(0, Math.round(Number(activeSharedProjectStructureRevision) || 0));
    const nextSessionRevision = projectChanged ? incomingRevision : Math.max(previousRevision, incomingRevision);
    const nextSessionStructureRevision = projectChanged
      ? incomingStructureRevision
      : Math.max(previousStructureRevision, incomingStructureRevision);
    if (projectChanged) {
      activeSharedProjectMembershipRole = '';
    }
    if (!projectChanged && incomingRevision < previousRevision) {
      console.debug('[shared-realtime] skip-stale-session', {
        projectKey: normalizedProjectKey,
        projectId: normalizedProjectId || activeSharedProjectId || '',
        incomingRevision,
        retainedRevision: previousRevision,
      });
    }
    if (projectChanged) {
      activeSharedProjectDocumentLoaded = false;
      sharedProjectPendingRemoteOps.clear();
      sharedProjectPendingProvisionalOps.clear();
      sharedProjectSeenOpIds.clear();
      sharedProjectSeenOpSeqById.clear();
      sharedProjectRemoteApplyFailureKeys.clear();
      sharedProjectPendingLocalOps = [];
      clearSharedProjectPendingLocalOpsFlushTimer();
      sharedProjectRoomCommitSentAt.clear();
      sharedProjectRoomBroadcastSlotAt.clear();
      if (sharedProjectBroadcastCatchupTimer !== null) {
        window.clearTimeout(sharedProjectBroadcastCatchupTimer);
        sharedProjectBroadcastCatchupTimer = null;
      }
      if (sharedProjectPendingLocalOpsRetryTimer !== null) {
        window.clearTimeout(sharedProjectPendingLocalOpsRetryTimer);
        sharedProjectPendingLocalOpsRetryTimer = null;
      }
      sharedProjectPendingLocalOpsRetryDueAt = 0;
      if (sharedProjectOpsRescueRetryTimer !== null) {
        window.clearTimeout(sharedProjectOpsRescueRetryTimer);
        sharedProjectOpsRescueRetryTimer = null;
      }
      sharedProjectOpsRescueRetryDueAt = 0;
      sharedProjectPendingLocalRetryBlockedUntil = 0;
      sharedProjectLastCanonicalRefreshQueuedAt = 0;
      sharedProjectLastForceRefreshQueuedAt = 0;
      sharedProjectLastForceRefreshQueuedReason = '';
      sharedProjectDeferredRemoteOpsDelayMs = 0;
      clearDeferredSharedProjectRemoteOpsDrain();
      sharedProjectInFlightStroke = null;
      sharedProjectGapRecoveryRerunRequested = false;
      sharedProjectLastAppliedSeq = 0;
      resetSharedProjectCanvasIdentity();
      pendingSharedProjectConflictReplay = null;
      sharedProjectRealtimeConnectPromise = null;
    }
    activeSharedProjectId = normalizedProjectId || (
      activeSharedProjectKey === normalizedProjectKey
        ? activeSharedProjectId
        : ''
    );
    logSharedProjectRealtimeChannelLifecycle('set-session', {
      caller: 'setActiveSharedProjectSession',
      reason: projectChanged ? 'project-changed' : 'session-update',
      projectKey: normalizedProjectKey,
      projectId: activeSharedProjectId,
      channelSignature: `${normalizedProjectKey}::${activeSharedProjectId || ''}`,
      extra: {
        incomingRevision,
        incomingStructureRevision,
        appliedRevision: nextSessionRevision,
        appliedStructureRevision: nextSessionStructureRevision,
        projectChanged,
      },
    });
  // bump session token so in-flight async tasks can detect session changes
  activeSharedProjectKey = normalizedProjectKey;
  activeSharedProjectSessionToken += 1;
    activeSharedProjectRevision = nextSessionRevision;
    activeSharedProjectStructureRevision = nextSessionStructureRevision;
    if (projectChanged || !Array.isArray(multiState.comments) || multiState.comments.length === 0) {
      restoreMultiCommentsForProject(normalizedProjectKey);
    }
    ensureSharedProjectSessionHeartbeat();
    const nextChannelSignature = `${normalizedProjectKey}::${activeSharedProjectId || ''}`;
    const sharedRecentProjectId = buildSharedRecentProjectId(normalizedProjectKey);
    if (normalizeAutosaveProjectId(autosaveProjectId || '') !== sharedRecentProjectId) {
      setActiveAutosaveProjectId(sharedRecentProjectId, { persist: false });
    }
    if (!sharedProjectLastCheckpointAt) {
      sharedProjectLastCheckpointAt = Date.now();
    }
    if (!sharedProjectLastRealtimeActivityAt) {
      sharedProjectLastRealtimeActivityAt = Date.now();
    }
    initializeSharedProjectCanvasIdentityFromCurrentDocument({
      source: activeSharedProjectSnapshotRevision > 0 ? 'snapshot' : 'session',
    });
    ensureSharedProjectRefreshLoop();
    const hasProjectIdForRealtime = Boolean(activeSharedProjectId);
    const shouldEnsureRealtimeChannel = hasProjectIdForRealtime && !sharedProjectDeferRealtimeUntilSynced && (
      projectChanged
      || (
        activeSharedProjectChannelSignature !== nextChannelSignature
        && sharedProjectRealtimeConnectSignature !== nextChannelSignature
      )
      || (!activeSharedProjectChannel && !sharedProjectRealtimeConnectPromise && Date.now() >= sharedProjectRealtimeRetryBlockedUntil)
    );
    if (shouldEnsureRealtimeChannel) {
      ensureActiveSharedProjectRealtimeChannel().catch(error => {
        reportSharedProjectRealtimeSubscribeFailure(error);
      });
    } else if (sharedProjectDeferRealtimeUntilSynced) {
      logSharedProjectRealtimeChannelLifecycle('skip-realtime-rebind', {
        caller: 'setActiveSharedProjectSession',
        reason: 'defer-until-synced',
        projectKey: normalizedProjectKey,
        projectId: activeSharedProjectId,
        channelSignature: nextChannelSignature,
      });
    } else if (!hasProjectIdForRealtime) {
      logSharedProjectRealtimeChannelLifecycle('skip-realtime-rebind', {
        caller: 'setActiveSharedProjectSession',
        reason: 'missing-project-id',
        projectKey: normalizedProjectKey,
        projectId: activeSharedProjectId,
        channelSignature: nextChannelSignature,
      });
    } else {
      logSharedProjectRealtimeChannelLifecycle('skip-realtime-rebind', {
        caller: 'setActiveSharedProjectSession',
        reason: 'same-signature-session-update',
        projectKey: normalizedProjectKey,
        projectId: activeSharedProjectId,
        channelSignature: nextChannelSignature,
      });
    }
    syncSharedProjectMembers(normalizedProjectKey, activeSharedProjectId).catch(error => {
      console.warn('Failed to load shared project members', error);
    });
    syncSharedProjectVisibleStatus();
  }

  function setActiveSharedProjectSnapshotState(snapshotRevision = 0, {
    structureRevision = activeSharedProjectStructureRevision,
    synced = false,
    canonicalLoadedAt = Date.now(),
  } = {}) {
    activeSharedProjectSnapshotRevision = Math.max(0, Math.round(Number(snapshotRevision) || 0));
    activeSharedProjectStructureRevision = Math.max(
      activeSharedProjectStructureRevision,
      Math.max(0, Math.round(Number(structureRevision) || 0))
    );
    activeSharedProjectSynced = Boolean(synced);
    sharedProjectLastCanonicalLoadAt = Math.max(0, Math.round(Number(canonicalLoadedAt) || 0));
    if (activeSharedProjectSynced && activeSharedProjectDocumentLoaded && hasUsableActiveSharedProjectDocumentState()) {
      markSharedProjectDrawReadinessVerified('snapshot-state-synced');
    }
  }

  function markActiveSharedProjectDocumentLoaded(projectKey = activeSharedProjectKey) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    if (!normalizedProjectKey) {
      return;
    }
    if (normalizedProjectKey === activeSharedProjectKey) {
      activeSharedProjectDocumentLoaded = true;
      syncSharedProjectVisibleStatus();
      scheduleSharedProjectFreeTimelineCellEnsure('document-loaded');
    }
  }

  function hasUsableActiveSharedProjectDocumentState() {
    if (!activeSharedProjectKey) {
      return false;
    }
    const canvasDoc = getActiveProjectCanvasDocument();
    if (!canvasDoc || !Array.isArray(canvasDoc.frames) || !canvasDoc.frames.length) {
      return false;
    }
    return canvasDoc.frames.some(frame => Array.isArray(frame?.layers) && frame.layers.length > 0);
  }

  function canResumeSharedProjectEditingFromDurableHistory(projectKey = activeSharedProjectKey) {
    if (
      activeSharedProjectOpenInProgress
      || activeSharedProjectOpenReadOnly
      || !canCurrentSharedProjectEdit(projectKey)
    ) {
      return false;
    }
    return hasStableSharedProjectDurableState(projectKey);
  }

  function hasStableSharedProjectDurableState(projectKey = activeSharedProjectKey) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || activeSharedProjectKey || '');
    return Boolean(
      normalizedProjectKey
      && normalizedProjectKey === activeSharedProjectKey
      && activeSharedProjectDocumentLoaded
      && hasUsableActiveSharedProjectDocumentState()
      && activeSharedProjectSynced
      && activeSharedProjectSyncState === 'synced'
      && !sharedProjectDeferRealtimeUntilSynced
    );
  }

  function markSharedProjectDrawReadinessVerified(reason = 'verified') {
    if (!isSharedProjectCollaborativeMode()) {
      return;
    }
    const normalizedReason = String(reason || 'verified');
    const wasFresh = isSharedProjectDrawReadinessFresh();
    sharedProjectLastDrawReadinessVerifiedAt = Date.now();
    if (!wasFresh || normalizedReason !== 'ops-fetch-empty') {
      console.debug('[shared-sync]', {
        event: 'draw-readiness-verified',
        reason: normalizedReason,
        projectKey: activeSharedProjectKey || '',
        revision: activeSharedProjectRevision,
        structureRevision: activeSharedProjectStructureRevision,
      });
      syncSharedProjectVisibleStatus();
    }
  }

  function clearSharedProjectDrawReadinessVerification() {
    sharedProjectLastDrawReadinessVerifiedAt = 0;
  }

  function isSharedProjectDrawReadinessFresh() {
    if (!isSharedProjectCollaborativeMode()) {
      return true;
    }
    const latestVerifiedAt = Math.max(
      Math.max(0, Math.round(Number(sharedProjectLastDrawReadinessVerifiedAt) || 0)),
      activeSharedProjectSynced && activeSharedProjectSyncState === 'synced'
        ? Math.max(0, Math.round(Number(sharedProjectLastCanonicalLoadAt) || 0))
        : 0
    );
    return Boolean(
      latestVerifiedAt > 0
      && (Date.now() - latestVerifiedAt) <= SHARED_PROJECT_DRAW_READY_MAX_AGE_MS
    );
  }

  function pruneSharedProjectCellPresence(now = Date.now()) {
    let changed = false;
    sharedProjectCellPresenceByClient.forEach((entry, clientId) => {
      const updatedAt = Math.max(0, Math.round(Number(entry?.updatedAt) || 0));
      if (!updatedAt || now - updatedAt > SHARED_PROJECT_CELL_PRESENCE_TTL_MS) {
        sharedProjectCellPresenceByClient.delete(clientId);
        changed = true;
      }
    });
    return changed;
  }

  function getSharedProjectCellPresenceKey(canvasId = '', frameIndex = 0, layerId = '') {
    const normalizedCanvasId = typeof canvasId === 'string' ? canvasId.trim() : '';
    const normalizedLayerId = typeof layerId === 'string' ? layerId.trim() : '';
    const normalizedFrameIndex = Math.max(0, Math.round(Number(frameIndex) || 0));
    if (!normalizedCanvasId || !normalizedLayerId) {
      return '';
    }
    return `${normalizedCanvasId}:${normalizedFrameIndex}:${normalizedLayerId}`;
  }

  function normalizeSharedProjectCellPresencePayload(payload) {
    const raw = payload && typeof payload === 'object' ? payload : {};
    const projectKey = normalizeMultiProjectKey(raw.projectKey || '');
    const clientId = typeof raw.clientId === 'string' ? raw.clientId.trim() : '';
    const userId = typeof raw.userId === 'string' ? raw.userId.trim() : '';
    const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId.trim() : '';
    const canvasId = typeof raw.canvasId === 'string' ? raw.canvasId.trim() : '';
    const layerId = typeof raw.layerId === 'string' ? raw.layerId.trim() : '';
    const frameIndex = Math.max(0, Math.round(Number(raw.frameIndex) || 0));
    const name = normalizeMultiParticipantName(raw.name || '', DEFAULT_MULTI_PARTICIPANT_NAME);
    const updatedAt = Math.max(0, Math.round(Number(raw.updatedAt) || Date.now()));
    if (!projectKey || !clientId || !canvasId || !layerId) {
      return null;
    }
    return {
      projectKey,
      clientId,
      userId,
      sessionId,
      canvasId,
      frameIndex,
      layerId,
      name,
      updatedAt,
      key: getSharedProjectCellPresenceKey(canvasId, frameIndex, layerId),
    };
  }

  function getCurrentSharedProjectCellPresencePayload(reason = 'selection') {
    if (!isSharedProjectCollaborativeMode() || !activeSharedProjectKey) {
      return null;
    }
    const canvasDoc = getActiveProjectCanvasDocument();
    const canvasId = canvasDoc?.id || '';
    const activeFrameIndex = clamp(Math.round(Number(state.activeFrame) || 0), 0, Math.max(0, (state.frames?.length || 1) - 1));
    const layerId = typeof state.activeLayer === 'string' ? state.activeLayer.trim() : '';
    if (!canvasId || !layerId) {
      return null;
    }
    return {
      projectKey: activeSharedProjectKey,
      clientId: multiState.clientId || ensureMultiClientId(),
      userId: accountState.userId || '',
      sessionId: sharedProjectSessionInstanceId || '',
      canvasId,
      frameIndex: activeFrameIndex,
      layerId,
      name: getLocalMultiParticipantName(),
      updatedAt: Date.now(),
      reason: String(reason || 'selection').slice(0, 32),
    };
  }

  function getSharedProjectCellPresenceEntriesForCell({ canvasId = '', frameIndex = 0, layerId = '' } = {}) {
    pruneSharedProjectCellPresence();
    const cellKey = getSharedProjectCellPresenceKey(canvasId, frameIndex, layerId);
    if (!cellKey) {
      return [];
    }
    return Array.from(sharedProjectCellPresenceByClient.values())
      .filter(entry => (
        entry?.key === cellKey
        && entry.projectKey === activeSharedProjectKey
        && entry.clientId !== multiState.clientId
      ));
  }

  function getSharedProjectTimelineCellOccupants(frameIndex = state.activeFrame, layerId = state.activeLayer, canvasId = getActiveProjectCanvasDocument()?.id || '') {
    return getSharedProjectCellPresenceEntriesForCell({
      canvasId,
      frameIndex,
      layerId,
    });
  }

  function getSharedProjectCellPresenceLabel(entry) {
    if (!entry || typeof entry !== 'object') {
      return '-';
    }
    const frameIndex = Math.max(0, Math.round(Number(entry.frameIndex) || 0));
    const frame = Array.isArray(state.frames) ? state.frames[frameIndex] : null;
    const layerId = typeof entry.layerId === 'string' ? entry.layerId.trim() : '';
    const layerIndex = frame && Array.isArray(frame.layers)
      ? frame.layers.findIndex(layer => layer?.id === layerId)
      : -1;
    return layerIndex >= 0
      ? `${frameIndex + 1}.${layerIndex + 1}`
      : `${frameIndex + 1}.-`;
  }

  function getSharedProjectMemberCellPresence(row = {}) {
    if (!isSharedProjectCollaborativeMode() && !resolveSharedProjectKeyForCurrentState()) {
      return null;
    }
    const rowUserId = typeof row.userId === 'string' ? row.userId.trim() : '';
    const rowClientId = typeof row.clientId === 'string' ? row.clientId.trim() : '';
    if (rowUserId && rowUserId === accountState.userId) {
      return normalizeSharedProjectCellPresencePayload(getCurrentSharedProjectCellPresencePayload('self'));
    }
    pruneSharedProjectCellPresence();
    return Array.from(sharedProjectCellPresenceByClient.values()).find(entry => (
      entry?.projectKey === activeSharedProjectKey
      && (
        (rowUserId && entry.userId === rowUserId)
        || (rowClientId && entry.clientId === rowClientId)
      )
    )) || null;
  }

  function announceSharedProjectTimelineCellOccupied(occupants = []) {
    const names = occupants.map(entry => entry?.name).filter(Boolean).slice(0, 2);
    const suffix = names.length ? `: ${names.join(', ')}` : '';
    setMultiStatus(
      localizeText(
        `このセルは選択中です${suffix}`,
        `This cell is already selected${suffix}`
      ),
      'info'
    );
  }

  function canSelectSharedProjectTimelineCell(frameIndex = state.activeFrame, layerId = state.activeLayer, { announce = true } = {}) {
    if (!isSharedProjectCollaborativeMode() || !activeSharedProjectKey) {
      return true;
    }
    const occupants = getSharedProjectTimelineCellOccupants(frameIndex, layerId);
    if (!occupants.length) {
      return true;
    }
    if (announce) {
      announceSharedProjectTimelineCellOccupied(occupants);
    }
    return false;
  }

  function getSharedProjectOnlineParticipantCount() {
    let count = 0;
    const seen = new Set();
    pruneSharedProjectCellPresence();
    sharedProjectMembers.forEach(row => {
      const id = typeof row?.userId === 'string' && row.userId.trim()
        ? `u:${row.userId.trim()}`
        : (typeof row?.clientId === 'string' && row.clientId.trim() ? `c:${row.clientId.trim()}` : '');
      if (!id || !row.online || seen.has(id)) {
        return;
      }
      seen.add(id);
      count += 1;
    });
    if (isCurrentProjectSharedEntry() && accountState.userId && !seen.has(`u:${accountState.userId}`)) {
      count += 1;
    }
    sharedProjectCellPresenceByClient.forEach(entry => {
      const id = typeof entry?.userId === 'string' && entry.userId.trim()
        ? `u:${entry.userId.trim()}`
        : (typeof entry?.clientId === 'string' && entry.clientId.trim() ? `c:${entry.clientId.trim()}` : '');
      if (!id || seen.has(id)) {
        return;
      }
      seen.add(id);
      count += 1;
    });
    return Math.max(1, count);
  }

  function getSharedProjectTimelineCellCount() {
    if (!Array.isArray(state.frames) || !state.frames.length) {
      return 0;
    }
    return state.frames.reduce((total, frame) => (
      total + (Array.isArray(frame?.layers) ? frame.layers.length : 0)
    ), 0);
  }

  function findSharedProjectFreeTimelineCell() {
    const frames = Array.isArray(state.frames) ? state.frames : [];
    if (!frames.length) {
      return null;
    }
    const activeCanvasId = getActiveProjectCanvasDocument()?.id || '';
    if (!activeCanvasId) {
      return null;
    }
    const preferredFrame = clamp(Math.round(Number(state.activeFrame) || 0), 0, frames.length - 1);
    const activeLayerId = typeof state.activeLayer === 'string' ? state.activeLayer.trim() : '';
    if (
      activeLayerId
      && frames[preferredFrame]?.layers?.some(layer => layer?.id === activeLayerId)
      && getSharedProjectTimelineCellOccupants(preferredFrame, activeLayerId, activeCanvasId).length === 0
    ) {
      return { frameIndex: preferredFrame, layerId: activeLayerId };
    }
    for (let frameOffset = 0; frameOffset < frames.length; frameOffset += 1) {
      const frameIndex = (preferredFrame + frameOffset) % frames.length;
      const layers = Array.isArray(frames[frameIndex]?.layers) ? frames[frameIndex].layers : [];
      for (let layerOffset = 0; layerOffset < layers.length; layerOffset += 1) {
        const layer = layers[layerOffset];
        const layerId = typeof layer?.id === 'string' ? layer.id : '';
        if (!layerId) {
          continue;
        }
        if (getSharedProjectTimelineCellOccupants(frameIndex, layerId, activeCanvasId).length === 0) {
          return { frameIndex, layerId };
        }
      }
    }
    return null;
  }

  function selectSharedProjectTimelineCell(frameIndex, layerId, reason = 'auto-free-cell') {
    const frames = Array.isArray(state.frames) ? state.frames : [];
    const normalizedFrameIndex = clamp(Math.round(Number(frameIndex) || 0), 0, Math.max(0, frames.length - 1));
    const targetLayerId = typeof layerId === 'string' ? layerId.trim() : '';
    const targetFrame = frames[normalizedFrameIndex] || null;
    if (!targetFrame || !Array.isArray(targetFrame.layers) || !targetFrame.layers.some(layer => layer?.id === targetLayerId)) {
      return false;
    }
    if (!canSelectSharedProjectTimelineCell(normalizedFrameIndex, targetLayerId, { announce: false })) {
      return false;
    }
    const changed = state.activeFrame !== normalizedFrameIndex || state.activeLayer !== targetLayerId;
    state.activeFrame = normalizedFrameIndex;
    state.activeLayer = targetLayerId;
    const activeCanvasDoc = getActiveProjectCanvasDocument();
    if (activeCanvasDoc) {
      activeCanvasDoc.activeFrame = normalizedFrameIndex;
      activeCanvasDoc.activeLayer = targetLayerId;
    }
    clearTimelineSelection();
    scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
    scheduleTimelineMatrixRenderSoon();
    renderLayerList();
    requestRender();
    requestOverlayRender();
    scheduleSharedProjectCellPresenceBroadcast(reason);
    return changed;
  }

  function addSharedProjectAutoLayerTrack(reason = 'auto-free-cell') {
    if (!isSharedProjectCollaborativeMode()) {
      return false;
    }
    const blockReason = getSharedProjectStructureChangeBlockReason();
    if (blockReason) {
      return false;
    }
    const now = Date.now();
    if (now - sharedProjectLastAutoLayerAddedAt < SHARED_PROJECT_FREE_CELL_LAYER_ADD_COOLDOWN_MS) {
      return false;
    }
    const activeFrame = getActiveFrame();
    if (!activeFrame || !Array.isArray(state.frames) || !state.frames.length) {
      return false;
    }
    sharedProjectLastAutoLayerAddedAt = now;
    clearTimelineSelection();
    beginHistory('addLayer');
    const insertIndex = Number.isInteger(getActiveLayerIndex())
      ? clamp(getActiveLayerIndex() + 1, 0, Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER;
    let selectedLayerId = '';
    state.frames.forEach((frame, frameIndex) => {
      if (!frame || !Array.isArray(frame.layers)) {
        return;
      }
      const targetIndex = Math.min(insertIndex, frame.layers.length);
      const layer = createLayer(getDefaultLayerName(frame.layers.length + 1), state.width, state.height);
      frame.layers.splice(targetIndex, 0, layer);
      if (frameIndex === state.activeFrame) {
        selectedLayerId = layer.id;
      }
    });
    if (selectedLayerId) {
      state.activeLayer = selectedLayerId;
      const activeCanvasDoc = getActiveProjectCanvasDocument();
      if (activeCanvasDoc) {
        activeCanvasDoc.activeLayer = selectedLayerId;
      }
    }
    clearPendingMultiAssignmentMoveRequests();
    markHistoryDirty();
    scheduleSessionPersist();
    renderFrameList();
    renderLayerList();
    requestRender();
    requestOverlayRender();
    commitHistory();
    setMultiStatus(
      localizeText('空きセル用にレイヤーを追加しました', 'Added a layer for an open cell'),
      'info'
    );
    scheduleSharedProjectCellPresenceBroadcast(reason);
    scheduleSharedProjectFreeTimelineCellEnsure(`${reason}-after-add`, SHARED_PROJECT_FREE_CELL_LAYER_ADD_COOLDOWN_MS + 80);
    return true;
  }

  function ensureSharedProjectFreeTimelineCell(reason = 'ensure-free-cell') {
    if (!isSharedProjectCollaborativeMode() || !activeSharedProjectKey || !activeSharedProjectDocumentLoaded) {
      return false;
    }
    const neededCells = getSharedProjectOnlineParticipantCount();
    let guard = 0;
    while (
      getSharedProjectTimelineCellCount() < neededCells
      && guard < 4
      && addSharedProjectAutoLayerTrack(`${reason}-capacity`)
    ) {
      guard += 1;
    }
    let freeCell = findSharedProjectFreeTimelineCell();
    if (!freeCell) {
      if (addSharedProjectAutoLayerTrack(`${reason}-occupied`)) {
        freeCell = findSharedProjectFreeTimelineCell();
      }
    }
    if (freeCell) {
      selectSharedProjectTimelineCell(freeCell.frameIndex, freeCell.layerId, reason);
      return true;
    }
    return false;
  }

  function scheduleSharedProjectFreeTimelineCellEnsure(reason = 'ensure-free-cell', delayMs = SHARED_PROJECT_FREE_CELL_ENSURE_DELAY_MS) {
    if (!isSharedProjectCollaborativeMode()) {
      return;
    }
    if (sharedProjectFreeCellEnsureTimer !== null) {
      window.clearTimeout(sharedProjectFreeCellEnsureTimer);
    }
    sharedProjectFreeCellEnsureTimer = window.setTimeout(() => {
      sharedProjectFreeCellEnsureTimer = null;
      if (sharedProjectFreeCellEnsureInFlight) {
        scheduleSharedProjectFreeTimelineCellEnsure(`${reason}-queued`, SHARED_PROJECT_FREE_CELL_ENSURE_DELAY_MS);
        return;
      }
      sharedProjectFreeCellEnsureInFlight = true;
      try {
        ensureSharedProjectFreeTimelineCell(reason);
      } finally {
        sharedProjectFreeCellEnsureInFlight = false;
      }
    }, Math.max(0, Math.round(Number(delayMs) || 0)));
  }

  function isSharedProjectCurrentTimelineCellOccupiedByPeer() {
    if (!isSharedProjectCollaborativeMode() || !activeSharedProjectKey) {
      return false;
    }
    const payload = getCurrentSharedProjectCellPresencePayload('check');
    if (!payload) {
      return false;
    }
    return getSharedProjectCellPresenceEntriesForCell(payload).length > 0;
  }

  function renderTimelineMatrixForSharedCellPresence() {
    timelineMatrixRenderKey = '';
    renderTimelineMatrix();
  }

  function handleSharedProjectCellPresenceBroadcast(payload) {
    const entry = normalizeSharedProjectCellPresencePayload(payload?.payload || payload);
    if (!entry || entry.projectKey !== activeSharedProjectKey || entry.clientId === multiState.clientId) {
      return;
    }
    sharedProjectCellPresenceByClient.set(entry.clientId, entry);
    renderTimelineMatrixForSharedCellPresence();
    renderMultiParticipantsList();
    scheduleSharedProjectFreeTimelineCellEnsure('presence');
  }

  function broadcastSharedProjectCellPresence(reason = 'selection') {
    const payload = getCurrentSharedProjectCellPresencePayload(reason);
    if (!payload) {
      return;
    }
    renderMultiParticipantsList();
    if (!activeSharedProjectChannel || typeof activeSharedProjectChannel.send !== 'function') {
      ensureActiveSharedProjectRealtimeChannel().catch(() => {});
      return;
    }
    activeSharedProjectChannel.send({
      type: 'broadcast',
      event: SHARED_PROJECT_CELL_PRESENCE_EVENT,
      payload,
    }).catch(() => {
      // Presence is ephemeral; the heartbeat will retry on the next tick.
    });
  }

  function scheduleSharedProjectCellPresenceBroadcast(reason = 'selection') {
    if (!isSharedProjectCollaborativeMode()) {
      return;
    }
    if (sharedProjectCellPresenceBroadcastTimer !== null) {
      window.clearTimeout(sharedProjectCellPresenceBroadcastTimer);
    }
    sharedProjectCellPresenceBroadcastTimer = window.setTimeout(() => {
      sharedProjectCellPresenceBroadcastTimer = null;
      broadcastSharedProjectCellPresence(reason);
    }, SHARED_PROJECT_CELL_PRESENCE_BROADCAST_DEBOUNCE_MS);
  }

  function ensureSharedProjectCellPresenceHeartbeat() {
    if (sharedProjectCellPresenceHeartbeatTimer !== null) {
      return;
    }
    sharedProjectCellPresenceHeartbeatTimer = window.setInterval(() => {
      if (!isSharedProjectCollaborativeMode() || !activeSharedProjectChannel) {
        return;
      }
      const changed = pruneSharedProjectCellPresence();
      if (changed) {
        renderTimelineMatrixForSharedCellPresence();
        renderMultiParticipantsList();
      }
      broadcastSharedProjectCellPresence('heartbeat');
    }, SHARED_PROJECT_CELL_PRESENCE_HEARTBEAT_MS);
  }

  function clearSharedProjectCellPresence({ render = true } = {}) {
    sharedProjectCellPresenceByClient.clear();
    if (sharedProjectCellPresenceBroadcastTimer !== null) {
      window.clearTimeout(sharedProjectCellPresenceBroadcastTimer);
      sharedProjectCellPresenceBroadcastTimer = null;
    }
    if (sharedProjectCellPresenceHeartbeatTimer !== null) {
      window.clearInterval(sharedProjectCellPresenceHeartbeatTimer);
      sharedProjectCellPresenceHeartbeatTimer = null;
    }
    if (sharedProjectFreeCellEnsureTimer !== null) {
      window.clearTimeout(sharedProjectFreeCellEnsureTimer);
      sharedProjectFreeCellEnsureTimer = null;
    }
    sharedProjectFreeCellEnsureInFlight = false;
    if (render) {
      renderTimelineMatrixForSharedCellPresence();
    }
  }

  function getSharedProjectLocalDrawBlockReason(projectKey = activeSharedProjectKey, options = {}) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || activeSharedProjectKey || '');
    const allowLocalOpBacklog = Boolean(options?.allowLocalOpBacklog);
    if (!isSharedProjectCollaborativeMode(normalizedProjectKey)) {
      return '';
    }
    if (activeSharedProjectOpenInProgress) {
      return 'open-in-progress';
    }
    if (activeSharedProjectOpenReadOnly || !canCurrentSharedProjectEdit(normalizedProjectKey)) {
      return 'read-only';
    }
    if (!canUseSharedProjectsBackend()) {
      return 'backend-unavailable';
    }
    if (!activeSharedProjectDocumentLoaded) {
      return 'server-document-not-loaded';
    }
    if (!hasUsableActiveSharedProjectDocumentState()) {
      return 'missing-document-state';
    }
    if (hasSharedProjectFailedLocalOps()) {
      return 'failed-local-ops';
    }
    if (hasSharedProjectStructureLocalWorkInFlight()) {
      return 'local-structure-op-in-flight';
    }
    const hasLocalOpBacklog = sharedProjectOpCommitInFlight
      || hasSharedProjectLocalInFlightOps()
      || sharedProjectPendingLocalOps.length > 0;
    if (hasLocalOpBacklog && !allowLocalOpBacklog) {
      return 'local-op-in-flight';
    }
    if (
      !allowLocalOpBacklog
      && (
        sharedProjectSyncInFlight
        || sharedProjectRefreshInFlight
        || sharedProjectSnapshotReplayInFlight
        || sharedProjectRecoveryInProgress
        || sharedProjectReconnectRecoveryPromise
        || sharedProjectWakeRecoveryPromise
        || sharedProjectImmediateRecoveryPromise
      )
    ) {
      return 'sync-in-progress';
    }
    if (sharedProjectPendingRemoteOps.size > 0 && !allowLocalOpBacklog) {
      return 'remote-op-pending';
    }
    if (
      !allowLocalOpBacklog
      && (sharedProjectDeferRealtimeUntilSynced || activeSharedProjectSyncState !== 'synced' || !activeSharedProjectSynced)
    ) {
      return 'not-synced';
    }
    if (!isSharedProjectDrawReadinessFresh() && !allowLocalOpBacklog) {
      return 'draw-readiness-stale';
    }
    if (isSharedProjectCurrentTimelineCellOccupiedByPeer()) {
      return 'timeline-cell-occupied';
    }
    return '';
  }

  function getSharedProjectDrawBlockStatus(reason = '') {
    const normalizedReason = String(reason || '').trim();
    if (normalizedReason === 'offline') {
      return {
        level: 'warn',
        message: localizeText(
          'オフライン中です。描画内容は端末内に保護し、接続復帰後に共有へ送信します。',
          'You are offline. Edits are protected on this device and will be sent after reconnecting.'
        ),
      };
    }
    if (normalizedReason === 'read-only') {
      return {
        level: 'error',
        message: localizeText(
          'この共有プロジェクトは読み取り専用です。',
          'This shared project is read-only.'
        ),
      };
    }
    if (normalizedReason === 'local-op-in-flight') {
      return {
        level: 'info',
        message: localizeText(
          '直前の描画を共有へ確定中です。続きの描画は送信待ちとして保護します。',
          'The previous edit is being confirmed to the shared project. Additional edits are protected while waiting to send.'
        ),
      };
    }
    if (normalizedReason === 'timeline-cell-occupied') {
      return {
        level: 'info',
        message: localizeText(
          '他の参加者がこのフレーム/レイヤーを選択中です。別のセルを選んでください。',
          'Another participant is using this frame/layer. Select another cell to draw.'
        ),
      };
    }
    if (
      normalizedReason === 'open-in-progress'
      || normalizedReason === 'sync-in-progress'
      || normalizedReason === 'not-synced'
      || normalizedReason === 'draw-readiness-stale'
      || normalizedReason === 'local-structure-op-in-flight'
      || normalizedReason === 'remote-op-pending'
    ) {
      return {
        level: 'info',
        message: localizeText(
          '共有プロジェクトを最新状態へ確認中です。描画内容は端末内に保護して送信待ちにします。',
          'The shared project is being verified. Edits are protected on this device and queued for sending.'
        ),
      };
    }
    const needsReload = new Set([
      'server-document-not-loaded',
      'missing-document-state',
      'failed-local-ops',
      'backend-unavailable',
    ]).has(normalizedReason);
    if (needsReload) {
      return {
        level: 'error',
        message: localizeText(
          '共有プロジェクトを端末内で安全に保持できません。再読み込みしてください。',
          'The shared project cannot be safely kept on this device. Please reload.'
        ),
      };
    }
    return {
      level: 'warn',
      message: localizeText(
        '共有プロジェクトを最新状態へ同期中です。描画内容は送信待ちとして保護します。',
        'The shared project is syncing to the latest state. Edits are protected while waiting to send.'
      ),
    };
  }

  function canPersistActiveSharedProjectDocument(projectKey = activeSharedProjectKey, historyLabel = '') {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    if (!normalizedProjectKey) {
      return false;
    }
    if (classifySharedProjectOpType(historyLabel) === 'create') {
      return true;
    }
    if (normalizedProjectKey !== activeSharedProjectKey) {
      return true;
    }
    if (!canCurrentSharedProjectEdit(normalizedProjectKey)) {
      return false;
    }
    if (isSharedProjectCheckpointHistoryLabel(historyLabel)) {
      return true;
    }
    return activeSharedProjectDocumentLoaded;
  }

  function markAutosaveDirty() {
    autosaveDirty = true;
    autosaveDirtyGeneration += 1;
  }

  function handleAutosavePageHide() {
    if (RELOAD_SNAPSHOT_ENABLED) {
      persistReloadSessionSnapshot();
      persistReloadProjectFallback();
      persistReloadTargetProjectId();
    }
    if (canUseSessionStorage) {
      persistSessionState();
    }
    flushPendingTimelapseCapture({ force: true });
    flushAutosaveSnapshotOnLifecycle({ force: true });
  }

  function handleAutosaveVisibilityChange() {
    if (document.visibilityState !== 'hidden') {
      return;
    }
    if (RELOAD_SNAPSHOT_ENABLED) {
      persistReloadSessionSnapshot();
      persistReloadProjectFallback();
      persistReloadTargetProjectId();
    }
    if (canUseSessionStorage) {
      persistSessionState();
    }
    flushPendingTimelapseCapture({ force: true });
    flushAutosaveSnapshotOnLifecycle({ force: true });
  }

  function scheduleAppReload(reason = '') {
    if (appReloadInProgress) {
      return;
    }
    appReloadInProgress = true;
    try {
      persistCriticalSessionStateForNavigation();
    } catch (error) {
      // Ignore persistence errors during forced reload.
    }
    try {
      armMobileBackBeforeUnloadBypass();
    } catch (error) {
      // Ignore bypass errors.
    }
    window.setTimeout(() => {
      try {
        window.location.reload();
      } catch (error) {
        window.location.href = window.location.href;
      }
    }, 120);
  }

  function requestManualAppReload(reason = 'manual-reload') {
    try {
      persistCriticalSessionStateForNavigation();
      flushAutosaveSnapshotOnLifecycle({ force: true });
    } catch (error) {
      console.warn('Failed to persist state before manual reload', error);
    }
    scheduleAppReload(reason);
  }

  function markSharedProjectTrafficActivity(direction = 'tx') {
    if (!isSharedProjectCollaborativeMode()) {
      return;
    }
    if (direction === 'rx') {
      sharedProjectLastRxActivityAt = Date.now();
    } else {
      sharedProjectLastTxActivityAt = Date.now();
    }
    syncSharedProjectVisibleStatus();
  }

  function getSharedProjectVisibleStatus() {
    const now = Date.now();
    const sending = (
      sharedProjectOpCommitInFlight
      || sharedProjectSyncInFlight
      || sharedProjectPendingLocalOps.length > 0
      || ((now - sharedProjectLastTxActivityAt) <= SHARED_PROJECT_STATUS_TRAFFIC_LAMP_MS)
    );
    const receiving = (
      sharedProjectRefreshInFlight
      || sharedProjectRecoveryInProgress
      || Boolean(sharedProjectReconnectRecoveryPromise)
      || Boolean(sharedProjectWakeRecoveryPromise)
      || sharedProjectSnapshotReplayInFlight
      || sharedProjectPendingRemoteOps.size > 0
      || ((now - sharedProjectLastRxActivityAt) <= SHARED_PROJECT_STATUS_TRAFFIC_LAMP_MS)
    );
    const statusBase = {
      visible: true,
      state: 'idle',
      label: '',
      recoverable: false,
      reloadable: false,
      autoRecoverReason: '',
      sending,
      receiving,
    };
    if (!isSharedProjectCollaborativeMode()) {
      return {
        ...statusBase,
        visible: false,
      };
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        ...statusBase,
        state: 'offline',
        label: localizeText('オフライン', 'Offline'),
        autoRecoverReason: 'offline-wait',
        sending: false,
        receiving: false,
      };
    }
    if (
      sharedProjectRecoveryInProgress
      || sharedProjectReconnectRecoveryPromise
      || sharedProjectWakeRecoveryPromise
      || sharedProjectRefreshInFlight
    ) {
      return {
        ...statusBase,
        state: 'recovering',
        label: localizeText('復帰中', 'Recovering'),
        autoRecoverReason: 'recovery-in-progress',
      };
    }
    if (
      activeSharedProjectSyncState === 'catching-up'
      || !activeSharedProjectSynced
      || sharedProjectDeferRealtimeUntilSynced
    ) {
      const catchingUpForMs = sharedProjectCatchingUpStartedAt > 0
        ? Date.now() - sharedProjectCatchingUpStartedAt
        : 0;
      const reloadable = catchingUpForMs >= SHARED_PROJECT_VISIBLE_RECOVER_AFTER_SYNC_MS;
      return {
        ...statusBase,
        state: 'syncing',
        label: localizeText('同期中', 'Syncing'),
        recoverable: reloadable,
        reloadable,
        autoRecoverReason: 'syncing',
      };
    }
    const blockReason = getSharedProjectLocalDrawBlockReason(activeSharedProjectKey);
    if (blockReason) {
      const transientBlockReason = new Set([
        'open-in-progress',
        'sync-in-progress',
        'not-synced',
        'draw-readiness-stale',
        'remote-op-pending',
        'local-op-in-flight',
      ]);
      if (transientBlockReason.has(blockReason)) {
        return {
          ...statusBase,
          state: 'syncing',
          label: localizeText('同期中', 'Syncing'),
          autoRecoverReason: `sync-${blockReason}`,
        };
      }
      const reloadRequiredBlockReason = new Set([
        'server-document-not-loaded',
        'missing-document-state',
        'failed-local-ops',
        'backend-unavailable',
      ]);
      return {
        ...statusBase,
        state: 'blocked',
        label: localizeText('描画停止中', 'Drawing paused'),
        reloadable: reloadRequiredBlockReason.has(blockReason),
      };
    }
    if (hasSharedProjectLocalInFlightOps() || sharedProjectPendingLocalOps.length > 0 || sharedProjectOpCommitInFlight) {
      return {
        ...statusBase,
        state: 'syncing',
        label: localizeText('同期中', 'Syncing'),
        autoRecoverReason: 'local-op-pending',
      };
    }
    return {
      ...statusBase,
      state: 'synced',
      label: localizeText('最新', 'Up to date'),
    };
  }

  function resolveSharedProjectLampState(status) {
    if (!status?.visible) {
      return 'offline';
    }
    if (status.state === 'offline' || status.state === 'blocked') {
      return 'offline';
    }
    const sending = Boolean(status.sending);
    const receiving = Boolean(status.receiving);
    if (sending && receiving) {
      return sharedProjectLastRxActivityAt >= sharedProjectLastTxActivityAt
        ? 'receiving'
        : 'sending';
    }
    if (receiving) {
      return 'receiving';
    }
    if (sending) {
      return 'sending';
    }
    if (status.state === 'recovering' || status.state === 'syncing') {
      return 'receiving';
    }
    return 'synced';
  }



  return Object.freeze({
    maybePollSharedProjectServerOps,
    ensureSharedProjectRefreshLoop,
    reportSharedProjectRealtimeSubscribeFailure,
    getSharedProjectRealtimeClientType,
    getSharedProjectRealtimeDebugStage,
    getSharedProjectRealtimeStageDescription,
    shouldEnableSharedProjectRealtimeStage,
    getSharedProjectRealtimeSessionDebugState,
    logSharedProjectRealtimeChannelLifecycle,
    logSharedProjectDrawBlock,
    setActiveSharedProjectSession,
    setActiveSharedProjectSnapshotState,
    markActiveSharedProjectDocumentLoaded,
    hasUsableActiveSharedProjectDocumentState,
    canResumeSharedProjectEditingFromDurableHistory,
    hasStableSharedProjectDurableState,
    markSharedProjectDrawReadinessVerified,
    clearSharedProjectDrawReadinessVerification,
    isSharedProjectDrawReadinessFresh,
    pruneSharedProjectCellPresence,
    getSharedProjectCellPresenceKey,
    normalizeSharedProjectCellPresencePayload,
    getCurrentSharedProjectCellPresencePayload,
    getSharedProjectCellPresenceEntriesForCell,
    getSharedProjectTimelineCellOccupants,
    getSharedProjectCellPresenceLabel,
    getSharedProjectMemberCellPresence,
    announceSharedProjectTimelineCellOccupied,
    canSelectSharedProjectTimelineCell,
    getSharedProjectOnlineParticipantCount,
    getSharedProjectTimelineCellCount,
    findSharedProjectFreeTimelineCell,
    selectSharedProjectTimelineCell,
    addSharedProjectAutoLayerTrack,
    ensureSharedProjectFreeTimelineCell,
    scheduleSharedProjectFreeTimelineCellEnsure,
    isSharedProjectCurrentTimelineCellOccupiedByPeer,
    renderTimelineMatrixForSharedCellPresence,
    handleSharedProjectCellPresenceBroadcast,
    broadcastSharedProjectCellPresence,
    scheduleSharedProjectCellPresenceBroadcast,
    ensureSharedProjectCellPresenceHeartbeat,
    clearSharedProjectCellPresence,
    getSharedProjectLocalDrawBlockReason,
    getSharedProjectDrawBlockStatus,
    canPersistActiveSharedProjectDocument,
    markAutosaveDirty,
    handleAutosavePageHide,
    handleAutosaveVisibilityChange,
    scheduleAppReload,
    requestManualAppReload,
    markSharedProjectTrafficActivity,
    getSharedProjectVisibleStatus,
    resolveSharedProjectLampState,
  });
      }
    })(scope);
  }

  root.sharedProjectSessionStateUtils = Object.freeze({
    createSharedProjectSessionStateUtils,
  });
})();
