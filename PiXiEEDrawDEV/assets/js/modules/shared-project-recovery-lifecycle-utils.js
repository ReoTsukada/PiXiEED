(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedProjectRecoveryLifecycleUtils(rawScope = {}) {
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
  function ensureSharedProjectAutoRecovery(status) {
    if (!status?.visible || !activeSharedProjectKey || appReloadInProgress) {
      return;
    }
    const reason = String(status.autoRecoverReason || '').trim();
    if (!reason || status.reloadable) {
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return;
    }
    if (sharedProjectReconnectRecoveryPromise || sharedProjectWakeRecoveryPromise || sharedProjectRefreshInFlight || sharedProjectRecoveryInProgress) {
      return;
    }
    const now = Date.now();
    if ((now - sharedProjectAutoRecoveryLastAttemptAt) < 1800) {
      return;
    }
    sharedProjectAutoRecoveryLastAttemptAt = now;
    if (reason === 'syncing' || reason.startsWith('sync-')) {
      maybePollSharedProjectServerOps({
        reason: `status-auto-${reason}`,
        force: true,
        allowRefreshBackstop: true,
      });
      return;
    }
    queueSharedProjectReconnectRecovery(`status-auto-${reason}`, {
      immediate: true,
      blockEditing: true,
    }).catch(() => {});
  }

  function scheduleSharedProjectVisibleStatusRefresh(status) {
    if (sharedProjectVisibleStatusTimer !== null) {
      window.clearTimeout(sharedProjectVisibleStatusTimer);
      sharedProjectVisibleStatusTimer = null;
    }
    if (
      !status
      || status.state !== 'syncing'
      || status.recoverable
      || sharedProjectCatchingUpStartedAt <= 0
    ) {
      return;
    }
    const elapsed = Date.now() - sharedProjectCatchingUpStartedAt;
    const delay = Math.max(250, SHARED_PROJECT_VISIBLE_RECOVER_AFTER_SYNC_MS - elapsed + 50);
    sharedProjectVisibleStatusTimer = window.setTimeout(() => {
      sharedProjectVisibleStatusTimer = null;
      syncSharedProjectVisibleStatus();
    }, delay);
  }

  function syncSharedProjectVisibleStatus() {
    const indicator = dom.controls.sharedStatusIndicator;
    if (!(indicator instanceof HTMLElement)) {
      return;
    }
    const status = getSharedProjectVisibleStatus();
    const lamp = resolveSharedProjectLampState(status);
    const reloadAction = dom.controls.appReloadAction instanceof HTMLButtonElement
      ? dom.controls.appReloadAction
      : null;
    const showReloadLamp = Boolean(
      status.visible
      && (
        status.reloadable
        || status.recoverable
        || status.state === 'blocked'
        || status.state === 'offline'
      )
    );
    const showReloadAction = Boolean(status.reloadable);
    const signature = [
      status.visible ? '1' : '0',
      status.state,
      status.label,
      status.recoverable ? '1' : '0',
      status.reloadable ? '1' : '0',
      status.sending ? '1' : '0',
      status.receiving ? '1' : '0',
      lamp,
      showReloadLamp ? '1' : '0',
      showReloadAction ? '1' : '0',
    ].join('|');
    if (signature === sharedProjectVisibleStatusSignature) {
      return;
    }
    sharedProjectVisibleStatusSignature = signature;
    indicator.hidden = !status.visible;
    indicator.setAttribute('aria-hidden', String(!status.visible));
    indicator.dataset.state = status.state;
    indicator.dataset.lamp = lamp;
    if (reloadAction) {
      reloadAction.dataset.sharedSyncLamp = showReloadLamp ? lamp : '';
      reloadAction.classList.toggle('canvas-reload-action--shared-notice', showReloadLamp);
      reloadAction.title = showReloadLamp
        ? localizeText('共有プロジェクトの更新が滞っています。必要なら再読み込み', 'Shared project updates are stalled. Reload if needed.')
        : localizeText('再読み込み', 'Reload');
    }
    if (dom.projectTabsStatusSlot instanceof HTMLElement) {
      dom.projectTabsStatusSlot.hidden = !status.visible;
      dom.projectTabsStatusSlot.setAttribute('aria-hidden', String(!status.visible));
    }
    if (dom.controls.sharedStatusIndicatorText instanceof HTMLElement) {
      dom.controls.sharedStatusIndicatorText.textContent = status.label;
    }
    if (dom.controls.sharedStatusRecoverAction instanceof HTMLButtonElement) {
      dom.controls.sharedStatusRecoverAction.textContent = localizeText('再読込', 'Reload');
      dom.controls.sharedStatusRecoverAction.hidden = !showReloadAction;
      dom.controls.sharedStatusRecoverAction.disabled = false;
      dom.controls.sharedStatusRecoverAction.setAttribute('aria-hidden', String(!showReloadAction));
    }
    scheduleSharedProjectVisibleStatusRefresh(status);
    ensureSharedProjectAutoRecovery(status);
  }

  function readSharedProjectRecoveryReloadAt() {
    if (!canUseSessionStorage) {
      return 0;
    }
    try {
      return Math.max(
        0,
        Math.round(Number(window.sessionStorage.getItem(getScopedStorageKey(SHARED_PROJECT_RECOVERY_RELOAD_STORAGE_KEY)) || 0) || 0)
      );
    } catch (error) {
      return 0;
    }
  }

  function markSharedProjectRecoveryReloadAt() {
    if (!canUseSessionStorage) {
      return;
    }
    try {
      window.sessionStorage.setItem(
        getScopedStorageKey(SHARED_PROJECT_RECOVERY_RELOAD_STORAGE_KEY),
        String(Date.now())
      );
    } catch (error) {
      // Ignore storage failures; reload recovery is still allowed in-memory.
    }
  }

  function clearSharedProjectRecoveryReloadTimer() {
    if (sharedProjectRecoveryReloadTimer !== null) {
      window.clearTimeout(sharedProjectRecoveryReloadTimer);
      sharedProjectRecoveryReloadTimer = null;
    }
  }

  function canScheduleSharedProjectRecoveryReload() {
    if (!activeSharedProjectKey || appReloadInProgress || document.visibilityState === 'hidden') {
      return false;
    }
    const lastReloadAt = readSharedProjectRecoveryReloadAt();
    return !lastReloadAt || (Date.now() - lastReloadAt) > SHARED_PROJECT_RECOVERY_RELOAD_COOLDOWN_MS;
  }

  function scheduleSharedProjectRecoveryReload(reason = 'shared-recovery-stalled', delayMs = 0) {
    if (!canScheduleSharedProjectRecoveryReload()) {
      return false;
    }
    const safeDelayMs = Math.max(0, Math.round(Number(delayMs) || 0));
    clearSharedProjectRecoveryReloadTimer();
    sharedProjectRecoveryReloadTimer = window.setTimeout(() => {
      sharedProjectRecoveryReloadTimer = null;
      if (!canScheduleSharedProjectRecoveryReload()) {
        return;
      }
      if (hasSharedProjectHardLocalWorkInFlight()) {
        scheduleSharedProjectRecoveryReload(`${reason}-local-work-wait`, 1200);
        return;
      }
      console.warn('[shared-sync]', {
        event: 'soft-resume-reload-suggested',
        reason,
        projectKey: activeSharedProjectKey || '',
        activeRevision: activeSharedProjectRevision,
        syncState: activeSharedProjectSyncState,
        realtimeStatus: sharedProjectRealtimeStatus,
      });
      updateAutosaveStatus(
        localizeText(
          '復帰に失敗しました。再読み込みで復旧できます',
          'Recovery failed. Reloading can restore the latest state.'
        ),
        'warn'
      );
      setMultiStatus(
        localizeText(
          '復帰に失敗しました。再読み込みで復旧できます',
          'Recovery failed. Reloading can restore the latest state.'
        ),
        'warn'
      );
      const confirmReload = typeof window.confirm === 'function'
        ? window.confirm(localizeText(
          '同期復帰に失敗しました。最新状態で開き直しますか？',
          'Sync recovery failed. Reopen the latest state?'
        ))
        : false;
      if (!confirmReload) {
        return;
      }
      markSharedProjectRecoveryReloadAt();
      setMultiStatus(
        localizeText(
          '共有モード: 復帰が停滞したため、最新状態へ戻すため再読み込みします',
          'Shared mode: recovery stalled. Reloading to restore the latest state.'
        ),
        'warn'
      );
      scheduleAppReload(`shared-${reason}`);
    }, safeDelayMs);
    return true;
  }

  function isReloadNavigation() {
    try {
      const entries = typeof window.performance?.getEntriesByType === 'function'
        ? window.performance.getEntriesByType('navigation')
        : [];
      const navigationEntry = Array.isArray(entries) && entries.length > 0 ? entries[0] : null;
      if (navigationEntry?.type === 'reload') {
        return true;
      }
      if (window.performance?.navigation?.type === 1) {
        return true;
      }
    } catch (error) {
      // Ignore navigation timing access errors.
    }
    return false;
  }

  function resumeSharedProjectLocalOpsAfterConnectivityChange(reason = 'connectivity') {
    if (!activeSharedProjectKey) {
      return;
    }
    sharedProjectPendingLocalRetryBlockedUntil = 0;
    if (sharedProjectPendingLocalOpsRetryTimer !== null) {
      window.clearTimeout(sharedProjectPendingLocalOpsRetryTimer);
      sharedProjectPendingLocalOpsRetryTimer = null;
    }
    sharedProjectPendingLocalOpsRetryDueAt = 0;
    restorePendingSharedLocalOps(activeSharedProjectKey, {
      announce: reason === 'online',
      refreshReason: `${reason || 'connectivity'}-resume-pending-local-ops`,
    }).catch(error => {
      console.warn('Failed to resume pending shared local ops after connectivity change', error);
    }).finally(() => {
      flushSharedProjectPendingLocalOps();
    });
  }

  async function stabilizeActiveSharedProjectConnection(projectRecord = null, {
    reason = 'connection-stabilize',
    announce = false,
  } = {}) {
    const projectKey = normalizeMultiProjectKey(projectRecord?.project_key || activeSharedProjectKey || '');
    if (!projectKey || projectKey !== activeSharedProjectKey) {
      return false;
    }
    setActiveSharedProjectSyncState('catching-up', { announce });
    if (!await ensureSharedProjectBackendSession()) {
      return false;
    }
    const resolveLatestProject = async (candidate = null) => {
      if (candidate?.project_key && normalizeMultiProjectKey(candidate.project_key) === projectKey) {
        return candidate;
      }
      return await fetchSharedProjectRecord(projectKey);
    };
    const syncToProjectRevision = async (candidate) => {
      if (!candidate?.project_key) {
        return false;
      }
      const latestRevision = getSharedProjectLatestRevision(candidate);
      if (latestRevision <= activeSharedProjectRevision && !activeSharedProjectDocumentLoaded) {
        return false;
      }
      if (latestRevision > activeSharedProjectRevision) {
        const replayed = await applySharedProjectOpsSinceRevision(candidate, activeSharedProjectRevision);
        if (!replayed) {
          return false;
        }
      }
      return activeSharedProjectRevision >= latestRevision;
    };
    let latestProject = await resolveLatestProject(projectRecord);
    if (!latestProject?.project_key) {
      return false;
    }
    if (!await syncToProjectRevision(latestProject)) {
      return false;
    }
    latestProject = await resolveLatestProject(null);
    if (!latestProject?.project_key) {
      return false;
    }
    if (!await syncToProjectRevision(latestProject)) {
      return false;
    }
    const latestRevision = getSharedProjectLatestRevision(latestProject);
    const latestStructureRevision = getSharedProjectLatestStructureRevision(latestProject);
    if (
      activeSharedProjectRevision < latestRevision
      || activeSharedProjectStructureRevision < latestStructureRevision
    ) {
      return false;
    }
    const projectId = typeof latestProject.id === 'string' && latestProject.id.trim()
      ? latestProject.id.trim()
      : activeSharedProjectId;
    setActiveSharedProjectSession(
      projectKey,
      activeSharedProjectRevision,
      activeSharedProjectStructureRevision,
      projectId
    );
    markActiveSharedProjectDocumentLoaded(projectKey);
    setSharedProjectDeferRealtimeUntilSynced(false);
    let realtimeChannel = null;
    try {
      realtimeChannel = await ensureActiveSharedProjectRealtimeChannel();
    } catch (error) {
      reportSharedProjectRealtimeSubscribeFailure(error);
      return false;
    }
    if (!realtimeChannel) {
      return false;
    }
    latestProject = await resolveLatestProject(null);
    if (!latestProject?.project_key || !await syncToProjectRevision(latestProject)) {
      return false;
    }
    await waitForSharedOpenRetry(90);
    latestProject = await resolveLatestProject(null);
    if (!latestProject?.project_key || !await syncToProjectRevision(latestProject)) {
      return false;
    }
    const verifiedLatestRevision = getSharedProjectLatestRevision(latestProject);
    const verifiedLatestStructureRevision = getSharedProjectLatestStructureRevision(latestProject);
    if (
      activeSharedProjectRevision < verifiedLatestRevision
      || activeSharedProjectStructureRevision < verifiedLatestStructureRevision
    ) {
      return false;
    }
    setActiveSharedProjectSnapshotState(
      Math.max(activeSharedProjectSnapshotRevision, Math.min(activeSharedProjectRevision, verifiedLatestRevision)),
      {
        structureRevision: Math.max(activeSharedProjectStructureRevision, verifiedLatestStructureRevision),
        synced: true,
        canonicalLoadedAt: Date.now(),
      }
    );
    setActiveSharedProjectSyncState('synced', { announce });
    ensureSharedProjectRefreshLoop();
    scheduleSharedProjectOpsRescueRetry();
    try {
      await restorePendingSharedLocalOps(projectKey, {
        announce: false,
        refreshReason: `${reason || 'connection-stabilize'}-resume-pending-local-ops`,
      });
      flushSharedProjectPendingLocalOps();
    } catch (error) {
      console.warn('Failed to restore pending shared local ops after connection stabilization', error);
    }
    console.info('[shared-sync]', {
      event: 'shared-connection-stable',
      reason,
      projectKey,
      revision: activeSharedProjectRevision,
      structureRevision: activeSharedProjectStructureRevision,
      realtimeStatus: sharedProjectRealtimeStatus,
    });
    return true;
  }

  function markSharedProjectOpenWithReconnectFallback(projectKey = activeSharedProjectKey, {
    projectRecord = null,
    snapshotRevision = activeSharedProjectSnapshotRevision,
    structureRevision = activeSharedProjectStructureRevision,
    reason = 'open-reconnect-fallback',
    announce = false,
  } = {}) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || activeSharedProjectKey || projectRecord?.project_key || '');
    if (!normalizedProjectKey || normalizedProjectKey !== activeSharedProjectKey) {
      return false;
    }
    const latestRevision = Math.max(
      activeSharedProjectRevision,
      getSharedProjectLatestRevision(projectRecord || {}),
      Math.max(0, Math.round(Number(snapshotRevision) || 0))
    );
    const latestStructureRevision = Math.max(
      activeSharedProjectStructureRevision,
      getSharedProjectLatestStructureRevision(projectRecord || {}),
      Math.max(0, Math.round(Number(structureRevision) || 0))
    );
    const projectId = typeof projectRecord?.id === 'string' && projectRecord.id.trim()
      ? projectRecord.id.trim()
      : activeSharedProjectId;
    setActiveSharedProjectSession(
      normalizedProjectKey,
      latestRevision,
      latestStructureRevision,
      projectId
    );
    markActiveSharedProjectDocumentLoaded(normalizedProjectKey);
    setSharedProjectDeferRealtimeUntilSynced(false);
    setActiveSharedProjectSnapshotState(
      Math.max(
        activeSharedProjectSnapshotRevision,
        Math.min(activeSharedProjectRevision, latestRevision || activeSharedProjectRevision)
      ),
      {
        structureRevision: latestStructureRevision,
        synced: true,
        canonicalLoadedAt: Date.now(),
      }
    );
    setActiveSharedProjectSyncState('synced', { announce });
    ensureSharedProjectRefreshLoop();
    ensureActiveSharedProjectRealtimeChannel().catch(error => {
      reportSharedProjectRealtimeSubscribeFailure(error);
    });
    scheduleSharedProjectOpsRescueRetry();
    restorePendingSharedLocalOps(normalizedProjectKey, {
      announce: false,
      refreshReason: `${reason || 'open-reconnect-fallback'}-resume-pending-local-ops`,
    }).catch(error => {
      console.warn('Failed to restore pending shared local ops after open fallback', error);
    }).finally(() => {
      flushSharedProjectPendingLocalOps();
    });
    console.info('[shared-sync]', {
      event: 'shared-open-reconnect-fallback',
      reason,
      projectKey: normalizedProjectKey,
      revision: activeSharedProjectRevision,
      structureRevision: activeSharedProjectStructureRevision,
      realtimeStatus: sharedProjectRealtimeStatus,
    });
    return true;
  }

  function queueSharedProjectReconnectRecovery(reason = 'connectivity', { immediate = false, blockEditing = true } = {}) {
    if (!activeSharedProjectKey) {
      return Promise.resolve(false);
    }
    if (sharedProjectWakeRecoveryPromise) {
      return sharedProjectWakeRecoveryPromise;
    }
    if (sharedProjectReconnectRecoveryPromise) {
      return sharedProjectReconnectRecoveryPromise;
    }
    if (!immediate && sharedProjectReconnectRecoveryTimer !== null) {
      return Promise.resolve(false);
    }
    const normalizedReason = String(reason || 'connectivity');
    const shouldBlockEditing = blockEditing !== false;
    if (shouldBlockEditing) {
      setActiveSharedProjectSyncState('catching-up', { announce: true });
    }
    if (sharedProjectReconnectRecoveryTimer !== null) {
      window.clearTimeout(sharedProjectReconnectRecoveryTimer);
      sharedProjectReconnectRecoveryTimer = null;
    }
    const scheduleRecoveryRetry = (retryReason = `${normalizedReason}-retry`, retryDelayMs = 1600) => {
      if (!activeSharedProjectKey) {
        return;
      }
      const retryBlockedDelay = Date.now() < sharedProjectRealtimeRetryBlockedUntil
        ? Math.max(500, Math.min(30000, sharedProjectRealtimeRetryBlockedUntil - Date.now() + 80))
        : 0;
      const offlineDelay = typeof navigator !== 'undefined' && navigator.onLine === false ? 5000 : 0;
      const delayMs = Math.max(
        500,
        Math.round(Number(retryDelayMs) || 1600),
        retryBlockedDelay,
        offlineDelay
      );
      if (sharedProjectReconnectRecoveryTimer !== null) {
        window.clearTimeout(sharedProjectReconnectRecoveryTimer);
      }
      sharedProjectReconnectRecoveryTimer = window.setTimeout(() => {
        sharedProjectReconnectRecoveryTimer = null;
        queueSharedProjectReconnectRecovery(retryReason, {
          immediate: true,
          blockEditing: shouldBlockEditing,
        }).catch(() => {});
      }, delayMs);
    };
    const runRecovery = () => {
      if (!activeSharedProjectKey) {
        return Promise.resolve(false);
      }
      if (sharedProjectReconnectRecoveryPromise) {
        return sharedProjectReconnectRecoveryPromise;
      }
      const recoveryProjectKey = activeSharedProjectKey;
      sharedProjectReconnectRecoveryPromise = (async () => {
        logSharedProjectRealtimeChannelLifecycle('reconnect-recovery-start', {
          caller: 'queueSharedProjectReconnectRecovery',
          reason: normalizedReason,
          projectKey: recoveryProjectKey,
        });
        try {
          await ensurePixieedAccountReady({ forceRefresh: true, silent: true });
          if (!await ensureSharedProjectBackendSession()) {
            scheduleRecoveryRetry(`${normalizedReason}-backend-retry`, 1800);
            return false;
          }
          if (recoveryProjectKey !== activeSharedProjectKey) {
            return false;
          }
          const refreshed = await refreshActiveSharedProjectSnapshot({
            force: true,
            reason: `${normalizedReason}-reconnect`,
          });
          if (recoveryProjectKey !== activeSharedProjectKey) {
            return false;
          }
          const stabilized = await stabilizeActiveSharedProjectConnection(null, {
            reason: `${normalizedReason}-reconnect`,
            announce: shouldBlockEditing,
          });
          if (recoveryProjectKey !== activeSharedProjectKey) {
            return false;
          }
          let realtimeChannel = null;
          let realtimeErrorMessage = '';
          try {
            realtimeChannel = await ensureActiveSharedProjectRealtimeChannel();
          } catch (error) {
            realtimeErrorMessage = String(error?.message || error || '');
            logSharedProjectRealtimeChannelLifecycle('reconnect-realtime-failed', {
              caller: 'queueSharedProjectReconnectRecovery',
              reason: normalizedReason,
              projectKey: recoveryProjectKey,
              extra: { error: realtimeErrorMessage },
            });
          }
          const recoveredGap = await recoverSharedProjectRealtimeGap(recoveryProjectKey, {
            afterSeq: sharedProjectLastAppliedSeq,
            reason: `${normalizedReason}-post-reconnect-gap`,
          });
          const backendRecovered = Boolean(
            refreshed
            || stabilized
            || recoveredGap
            || canResumeSharedProjectEditingFromDurableHistory(recoveryProjectKey)
          );
          const recovered = Boolean(
            backendRecovered
            && (
              activeSharedProjectSyncState === 'synced'
              || canResumeSharedProjectEditingFromDurableHistory(recoveryProjectKey)
            )
          );
          if (recovered && activeSharedProjectKey === recoveryProjectKey) {
            setActiveSharedProjectSyncState('synced', { announce: true });
            resumeSharedProjectLocalOpsAfterConnectivityChange(normalizedReason);
            if (!realtimeChannel) {
              scheduleSharedProjectOpsRescueRetry();
            }
          } else if (activeSharedProjectKey === recoveryProjectKey) {
            if (shouldBlockEditing) {
              scheduleRecoveryRetry(`${normalizedReason}-retry`, 1600);
            } else {
              scheduleSharedProjectOpsRescueRetry();
            }
          }
          logSharedProjectRealtimeChannelLifecycle('reconnect-recovery-done', {
            caller: 'queueSharedProjectReconnectRecovery',
            reason: normalizedReason,
            projectKey: recoveryProjectKey,
            extra: {
              refreshed,
              stabilized,
              backendRecovered,
              realtimeConnected: Boolean(realtimeChannel),
              realtimeError: realtimeErrorMessage,
              recoveredGap,
              recovered,
            },
          });
          return recovered;
        } catch (error) {
          console.debug('[shared-realtime] reconnect recovery failed', {
            reason: normalizedReason,
            projectKey: recoveryProjectKey,
            error: String(error?.message || error || ''),
          });
          scheduleRecoveryRetry(`${normalizedReason}-exception-retry`, 2400);
          scheduleSharedProjectOpsRescueRetry();
          return false;
        } finally {
          sharedProjectReconnectRecoveryPromise = null;
        }
      })();
      return sharedProjectReconnectRecoveryPromise;
    };
    if (immediate) {
      return runRecovery();
    }
    sharedProjectReconnectRecoveryTimer = window.setTimeout(() => {
      sharedProjectReconnectRecoveryTimer = null;
      runRecovery().catch(() => {});
    }, 180);
    return Promise.resolve(false);
  }

  function getSharedProjectSoftResumeIntensity(hiddenGapMs = 0) {
    const gap = Math.max(0, Math.round(Number(hiddenGapMs) || 0));
    if (gap >= 300000 || IS_SAFARI_BROWSER || IS_IOS_DEVICE) {
      return 'canonical';
    }
    if (gap >= 60000) {
      return 'reconnect';
    }
    if (gap >= 5000) {
      return 'catchup';
    }
    return 'light';
  }

  function getSharedProjectSoftResumeBrowserInfo() {
    return {
      safari: Boolean(IS_SAFARI_BROWSER),
      ios: Boolean(IS_IOS_DEVICE),
      userAgent: USER_AGENT_LOWER.slice(0, 180),
      visibilityState: document.visibilityState || '',
      online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
    };
  }

  async function softResumeSharedProjectAfterSleep(reason = 'soft-resume', options = {}) {
    if (!activeSharedProjectKey || appReloadInProgress) {
      return false;
    }
    if (sharedProjectSoftResumePromise) {
      return sharedProjectSoftResumePromise;
    }
    const hiddenGapMs = Math.max(0, Math.round(Number(options?.hiddenGapMs) || 0));
    const intensity = options?.intensity || getSharedProjectSoftResumeIntensity(hiddenGapMs);
    const resumeProjectKey = activeSharedProjectKey;
    const startedAt = Date.now();
    sharedProjectSoftResumePromise = (async () => {
      console.info('[shared-sync]', {
        event: 'soft-resume-start',
        reason,
        projectKey: resumeProjectKey,
        hiddenGapMs,
        intensity,
        browser: getSharedProjectSoftResumeBrowserInfo(),
        activeRevision: activeSharedProjectRevision,
        activeStructureRevision: activeSharedProjectStructureRevision,
        realtimeStatus: sharedProjectRealtimeStatus,
      });
      setActiveSharedProjectSyncState('catching-up', { announce: true });
      setMultiStatus(localizeText('同期を確認中…', 'Checking sync...'), 'info');
      try {
        await ensurePixieedAccountReady({ forceRefresh: true, silent: true });
        console.info('[shared-sync]', {
          event: 'soft-resume-auth-refreshed',
          reason,
          projectKey: resumeProjectKey,
        });
        if (!await ensureSharedProjectBackendSession()) {
          throw new Error('backend session unavailable');
        }
        if (resumeProjectKey !== activeSharedProjectKey) {
          return false;
        }
        await restorePendingSharedLocalOps(resumeProjectKey, {
          announce: false,
          refreshReason: `${reason || 'soft-resume'}-restore-pending-local-ops`,
        });
        let realtimeChannel = null;
        if (intensity === 'catchup' || intensity === 'reconnect' || intensity === 'canonical') {
          await disconnectActiveSharedProjectRealtimeChannel({
            reason: `${reason || 'soft-resume'}-soft-resume-reconnect`,
            caller: 'softResumeSharedProjectAfterSleep',
          });
          realtimeChannel = await ensureActiveSharedProjectRealtimeChannel();
          console.info('[shared-sync]', {
            event: 'soft-resume-realtime-reconnected',
            reason,
            projectKey: resumeProjectKey,
            connected: Boolean(realtimeChannel),
            realtimeStatus: sharedProjectRealtimeStatus,
          });
        }
        const latestProject = await fetchSharedProjectRecord(resumeProjectKey);
        if (!latestProject?.project_key || resumeProjectKey !== activeSharedProjectKey) {
          throw new Error('latest shared project record unavailable');
        }
        const latestRevision = getSharedProjectLatestRevision(latestProject);
        const latestStructureRevision = getSharedProjectLatestStructureRevision(latestProject);
        console.info('[shared-sync]', {
          event: 'soft-resume-latest-fetched',
          reason,
          projectKey: resumeProjectKey,
          activeRevision: activeSharedProjectRevision,
          latestRevision,
          activeStructureRevision: activeSharedProjectStructureRevision,
          latestStructureRevision,
        });
        let replayed = false;
        if (latestRevision > activeSharedProjectRevision || latestStructureRevision > activeSharedProjectStructureRevision) {
          replayed = await applySharedProjectOpsSinceRevision(latestProject, activeSharedProjectRevision);
          if (!replayed) {
            replayed = await fetchAndReplaySharedProjectOpsBurst(resumeProjectKey, {
              reason: `${reason || 'soft-resume'}-ops-burst`,
              limit: SHARED_PROJECT_MAX_MISSING_OP_FETCH,
              maxRounds: SHARED_PROJECT_BURST_CATCHUP_MAX_ROUNDS,
            });
          }
        } else if (intensity !== 'light') {
          replayed = await fetchAndReplaySharedProjectOpsBurst(resumeProjectKey, {
            reason: `${reason || 'soft-resume'}-tail-check`,
            limit: 96,
            maxRounds: 2,
          });
        }
        console.info('[shared-sync]', {
          event: 'soft-resume-ops-replayed',
          reason,
          projectKey: resumeProjectKey,
          replayed,
          revision: activeSharedProjectRevision,
          appliedSeq: sharedProjectLastAppliedSeq,
        });
        const gapRecovered = await recoverSharedProjectRealtimeGap(resumeProjectKey, {
          afterSeq: sharedProjectLastAppliedSeq,
          reason: `${reason || 'soft-resume'}-gap-check`,
        });
        console.info('[shared-sync]', {
          event: 'soft-resume-gap-recovered',
          reason,
          projectKey: resumeProjectKey,
          recovered: gapRecovered,
          pendingRemoteOps: sharedProjectPendingRemoteOps.size,
          appliedSeq: sharedProjectLastAppliedSeq,
        });
        if (sharedProjectPendingRemoteOps.size) {
          drainPendingSharedProjectRemoteOps();
        }
        let canonicalRefreshed = false;
        if (
          intensity === 'canonical'
          && (
            sharedProjectPendingRemoteOps.size
            || activeSharedProjectRevision < latestRevision
            || activeSharedProjectStructureRevision < latestStructureRevision
          )
        ) {
          console.info('[shared-sync]', {
            event: 'soft-resume-shadow-swap-start',
            reason,
            projectKey: resumeProjectKey,
            latestRevision,
            latestStructureRevision,
          });
          canonicalRefreshed = await refreshActiveSharedProjectSnapshot({
            force: true,
            reason: `${reason || 'soft-resume'}-shadow-snapshot`,
          });
          console.info('[shared-sync]', {
            event: 'soft-resume-shadow-swap-complete',
            reason,
            projectKey: resumeProjectKey,
            refreshed: canonicalRefreshed,
            revision: activeSharedProjectRevision,
          });
        }
        const fingerprint = createSharedProjectDocumentFingerprint();
        const synced = Boolean(
          resumeProjectKey === activeSharedProjectKey
          && activeSharedProjectDocumentLoaded
          && hasUsableActiveSharedProjectDocumentState()
          && !sharedProjectPendingRemoteOps.size
          && activeSharedProjectRevision >= latestRevision
          && activeSharedProjectStructureRevision >= latestStructureRevision
        );
        console[synced ? 'info' : 'warn']('[shared-sync]', {
          event: synced ? 'soft-resume-fingerprint-ok' : 'soft-resume-fingerprint-mismatch',
          reason,
          projectKey: resumeProjectKey,
          hash: fingerprint?.hash || '',
          revision: activeSharedProjectRevision,
          latestRevision,
          pendingRemoteOps: sharedProjectPendingRemoteOps.size,
          canonicalRefreshed,
        });
        if (!synced) {
          const converged = await runSharedProjectConvergenceResync(`${reason || 'soft-resume'}-convergence`);
          if (!converged) {
            throw new Error('soft resume convergence failed');
          }
        }
        setSharedProjectDeferRealtimeUntilSynced(false);
        setActiveSharedProjectSyncState('synced', { announce: true });
        flushSharedProjectPendingLocalOps();
        console.info('[shared-sync]', {
          event: 'soft-resume-local-pending-flushed',
          reason,
          projectKey: resumeProjectKey,
          pendingLocalOps: sharedProjectPendingLocalOps.length,
        });
        ensureSharedProjectRefreshLoop();
        updateAutosaveStatus(localizeText('最新状態に同期しました', 'Synced to the latest state'), 'success');
        console.info('[shared-sync]', {
          event: 'soft-resume-complete',
          reason,
          projectKey: resumeProjectKey,
          elapsedMs: Date.now() - startedAt,
          revision: activeSharedProjectRevision,
          realtimeConnected: Boolean(realtimeChannel) || sharedProjectRealtimeStatus === 'subscribed',
        });
        return true;
      } catch (error) {
        console.warn('[shared-sync]', {
          event: 'soft-resume-failed',
          reason,
          projectKey: resumeProjectKey,
          hiddenGapMs,
          intensity,
          error: String(error?.message || error || ''),
        });
        setActiveSharedProjectSyncState('catching-up', { announce: true });
        updateAutosaveStatus(localizeText('通信が不安定です。描画内容を保護しています', 'Connection is unstable. Your edits are protected.'), 'warn');
        scheduleSharedProjectConvergenceResync(`${reason || 'soft-resume'}-failed`, 900);
        return false;
      }
    })().finally(() => {
      sharedProjectSoftResumePromise = null;
    });
    return sharedProjectSoftResumePromise;
  }

  function recoverSharedProjectAfterWake(reason = 'wake', { hiddenGapMs = 0, immediate = true } = {}) {
    if (!activeSharedProjectKey) {
      return Promise.resolve(false);
    }
    return softResumeSharedProjectAfterSleep(reason, { hiddenGapMs, immediate });
  }

  function recoverSharedProjectAfterWakeLegacy(reason = 'wake', { hiddenGapMs = 0, immediate = true } = {}) {
    if (!activeSharedProjectKey) {
      return Promise.resolve(false);
    }
    if (sharedProjectWakeRecoveryPromise) {
      return sharedProjectWakeRecoveryPromise;
    }
    const normalizedReason = String(reason || 'wake');
    const recoveryProjectKey = activeSharedProjectKey;
    const runWakeRecovery = async () => {
      if (!activeSharedProjectKey || recoveryProjectKey !== activeSharedProjectKey) {
        return false;
      }
      if (sharedProjectRefreshTimer !== null) {
        window.clearTimeout(sharedProjectRefreshTimer);
        sharedProjectRefreshTimer = null;
      }
      if (sharedProjectReconnectRecoveryTimer !== null) {
        window.clearTimeout(sharedProjectReconnectRecoveryTimer);
        sharedProjectReconnectRecoveryTimer = null;
      }
      setActiveSharedProjectSyncState('catching-up', { announce: true });
      logSharedProjectRealtimeChannelLifecycle('wake-recovery-start', {
        caller: 'recoverSharedProjectAfterWake',
        reason: normalizedReason,
        projectKey: recoveryProjectKey,
        extra: {
          hiddenGapMs: Math.max(0, Math.round(Number(hiddenGapMs) || 0)),
          activeRevision: activeSharedProjectRevision,
          activeStructureRevision: activeSharedProjectStructureRevision,
          channelKey: activeSharedProjectChannelKey || '',
          realtimeStatus: sharedProjectRealtimeStatus,
        },
      });
      try {
        await ensurePixieedAccountReady({ forceRefresh: true, silent: true });
        if (!await ensureSharedProjectBackendSession()) {
          return false;
        }
        if (recoveryProjectKey !== activeSharedProjectKey) {
          return false;
        }
        const syncToLatestRecord = async (stage = 'wake-sync') => {
          const latestProject = await fetchSharedProjectRecord(recoveryProjectKey);
          if (!latestProject?.project_key || recoveryProjectKey !== activeSharedProjectKey) {
            return false;
          }
          const latestRevision = getSharedProjectLatestRevision(latestProject);
          const latestStructureRevision = getSharedProjectLatestStructureRevision(latestProject);
          console.info('[shared-sync]', {
            event: 'wake-latest-fetched',
            reason: normalizedReason,
            stage,
            projectKey: recoveryProjectKey,
            activeRevision: activeSharedProjectRevision,
            latestRevision,
            activeStructureRevision: activeSharedProjectStructureRevision,
            latestStructureRevision,
          });
          if (!activeSharedProjectDocumentLoaded || !hasUsableActiveSharedProjectDocumentState()) {
            return await refreshActiveSharedProjectSnapshot({
              force: true,
              reason: `${normalizedReason}-${stage}-snapshot-load`,
            });
          }
          if (
            latestRevision > activeSharedProjectRevision
            || latestStructureRevision > activeSharedProjectStructureRevision
          ) {
            const replayed = await applySharedProjectOpsSinceRevision(latestProject, activeSharedProjectRevision);
            if (!replayed) {
              return await refreshActiveSharedProjectSnapshot({
                force: true,
                reason: `${normalizedReason}-${stage}-canonical-fallback`,
              });
            }
          }
          return (
            activeSharedProjectRevision >= latestRevision
            && activeSharedProjectStructureRevision >= latestStructureRevision
          );
        };
        const syncedBeforeSubscribe = await syncToLatestRecord('before-subscribe');
        if (recoveryProjectKey !== activeSharedProjectKey) {
          return false;
        }
        await disconnectActiveSharedProjectRealtimeChannel({
          reason: `${normalizedReason}-wake-reconnect`,
          caller: 'recoverSharedProjectAfterWake',
        });
        const realtimeChannel = await ensureActiveSharedProjectRealtimeChannel();
        if (recoveryProjectKey !== activeSharedProjectKey) {
          return false;
        }
        const syncedAfterSubscribe = await syncToLatestRecord('after-subscribe');
        const recoveredGap = await recoverSharedProjectRealtimeGap(recoveryProjectKey, {
          afterSeq: sharedProjectLastAppliedSeq,
          reason: `${normalizedReason}-post-subscribe-gap`,
        });
        const finalSynced = await syncToLatestRecord('final-check');
        const recovered = Boolean(
          activeSharedProjectKey === recoveryProjectKey
          && (syncedBeforeSubscribe || syncedAfterSubscribe || recoveredGap || finalSynced)
          && finalSynced
          && !sharedProjectPendingRemoteOps.size
        );
        if (recovered) {
          setSharedProjectDeferRealtimeUntilSynced(false);
          setActiveSharedProjectSyncState('synced', { announce: true });
          resumeSharedProjectLocalOpsAfterConnectivityChange(normalizedReason);
          ensureSharedProjectRefreshLoop();
        } else if (activeSharedProjectKey === recoveryProjectKey) {
          window.setTimeout(() => {
            queueSharedProjectReconnectRecovery(`${normalizedReason}-fallback`, {
              immediate: false,
              blockEditing: true,
            }).catch(() => {});
          }, 0);
          scheduleSharedProjectOpsRescueRetry();
        }
        logSharedProjectRealtimeChannelLifecycle('wake-recovery-done', {
          caller: 'recoverSharedProjectAfterWake',
          reason: normalizedReason,
          projectKey: recoveryProjectKey,
          extra: {
            syncedBeforeSubscribe,
            syncedAfterSubscribe,
            recoveredGap,
            finalSynced,
            recovered,
            realtimeConnected: Boolean(realtimeChannel),
            activeRevision: activeSharedProjectRevision,
            pendingRemoteOps: sharedProjectPendingRemoteOps.size,
          },
        });
        return recovered;
      } catch (error) {
        console.warn('[shared-realtime] wake recovery failed', {
          reason: normalizedReason,
          projectKey: recoveryProjectKey,
          error: String(error?.message || error || ''),
        });
        window.setTimeout(() => {
          queueSharedProjectReconnectRecovery(`${normalizedReason}-exception`, {
            immediate: false,
            blockEditing: true,
          }).catch(() => {});
        }, 0);
        scheduleSharedProjectOpsRescueRetry();
        return false;
      }
    };
    sharedProjectWakeRecoveryPromise = (immediate
      ? Promise.resolve().then(runWakeRecovery)
      : new Promise(resolve => {
          window.setTimeout(() => {
            runWakeRecovery().then(resolve).catch(() => resolve(false));
          }, 180);
        })
    ).finally(() => {
      sharedProjectWakeRecoveryPromise = null;
    });
    return sharedProjectWakeRecoveryPromise;
  }

  function scheduleSafariSharedProjectWakeResync(reason = 'safari-wake', hiddenGapMs = 0) {
    if (!IS_SAFARI_BROWSER || !activeSharedProjectKey || appReloadInProgress) {
      return;
    }
    if (sharedProjectSafariWakeResyncTimer !== null) {
      window.clearTimeout(sharedProjectSafariWakeResyncTimer);
      sharedProjectSafariWakeResyncTimer = null;
    }
    const recoveryProjectKey = activeSharedProjectKey;
    sharedProjectSafariWakeResyncTimer = window.setTimeout(() => {
      sharedProjectSafariWakeResyncTimer = null;
      if (!activeSharedProjectKey || activeSharedProjectKey !== recoveryProjectKey || document.visibilityState === 'hidden') {
        return;
      }
      recoverSharedProjectAfterWake(`${reason}-safari-confirm`, {
        hiddenGapMs,
        immediate: true,
      }).catch(() => {});
    }, SHARED_PROJECT_SAFARI_WAKE_RESYNC_DELAY_MS);
  }

  function requestSharedProjectDrawReadinessRecovery(reason = 'draw-blocked') {
    if (!activeSharedProjectKey || appReloadInProgress || !isSharedProjectCollaborativeMode()) {
      return Promise.resolve(false);
    }
    const normalizedReason = String(reason || 'draw-blocked');
    const currentBlockReason = getSharedProjectLocalDrawBlockReason(activeSharedProjectKey);
    if (!currentBlockReason) {
      return Promise.resolve(true);
    }
    if (currentBlockReason === 'read-only' || currentBlockReason === 'backend-unavailable' || currentBlockReason === 'open-in-progress') {
      return Promise.resolve(false);
    }
    if (currentBlockReason === 'offline') {
      setActiveSharedProjectSyncState('catching-up', { announce: true });
      queueSharedProjectReconnectRecovery(`pre-draw-${normalizedReason}`, {
        immediate: false,
        blockEditing: true,
      }).catch(() => {});
      return Promise.resolve(false);
    }
    if (currentBlockReason === 'local-op-in-flight') {
      flushSharedProjectPendingLocalOps();
      scheduleSharedProjectOpsRescueRetry(72, `pre-draw-${normalizedReason}`);
      return Promise.resolve(false);
    }
    if (sharedProjectDrawReadinessPromise) {
      return sharedProjectDrawReadinessPromise;
    }
    const recoveryProjectKey = activeSharedProjectKey;
    sharedProjectDrawReadinessPromise = (async () => {
      if (!activeSharedProjectKey || recoveryProjectKey !== activeSharedProjectKey) {
        return false;
      }
      setActiveSharedProjectSyncState('catching-up', { announce: true });
      if (currentBlockReason === 'draw-readiness-stale' || currentBlockReason === 'remote-op-pending') {
        try {
          await ensureActiveSharedProjectRealtimeChannel();
        } catch (error) {
          console.debug('[shared-realtime] pre-draw realtime verification failed', {
            reason: normalizedReason,
            projectKey: recoveryProjectKey,
            error: String(error?.message || error || ''),
          });
        }
        const verifyFetchStartedAt = Date.now();
        await fetchAndReplaySharedProjectOpsBurst(recoveryProjectKey, {
          reason: `pre-draw-${normalizedReason}`,
          limit: 128,
          maxRounds: 2,
        });
        if (
          activeSharedProjectKey === recoveryProjectKey
          && activeSharedProjectDocumentLoaded
          && hasUsableActiveSharedProjectDocumentState()
          && activeSharedProjectSyncState === 'synced'
          && activeSharedProjectSynced
          && !sharedProjectPendingRemoteOps.size
          && !sharedProjectRefreshInFlight
          && !sharedProjectSnapshotReplayInFlight
          && sharedProjectLastOpsFetchSucceededAt >= verifyFetchStartedAt
        ) {
          markSharedProjectDrawReadinessVerified(`pre-draw-${normalizedReason}`);
          return true;
        }
        return false;
      }
      const recovered = await recoverSharedProjectAfterWake(`pre-draw-${normalizedReason}`, {
        hiddenGapMs: 0,
        immediate: true,
      });
      if (
        recovered
        && activeSharedProjectKey === recoveryProjectKey
        && activeSharedProjectSyncState === 'synced'
        && activeSharedProjectSynced
        && !sharedProjectPendingRemoteOps.size
      ) {
        markSharedProjectDrawReadinessVerified(`pre-draw-${normalizedReason}`);
        return true;
      }
      return false;
    })().finally(() => {
      sharedProjectDrawReadinessPromise = null;
    });
    return sharedProjectDrawReadinessPromise;
  }

  function handleMultiVisibilityChange() {
    syncSharedProjectVisibleStatus();
    if (document.visibilityState === 'hidden') {
      sharedProjectVisibilityHiddenAt = Date.now();
      return;
    }
    if (document.visibilityState === 'visible') {
      const hiddenGapMs = sharedProjectVisibilityHiddenAt > 0
        ? Math.max(0, Date.now() - sharedProjectVisibilityHiddenAt)
        : 0;
      sharedProjectVisibilityHiddenAt = 0;
      if (activeSharedProjectKey) {
        recoverSharedProjectAfterWake('visibility', { hiddenGapMs, immediate: true }).catch(() => {});
        scheduleSafariSharedProjectWakeResync('visibility', hiddenGapMs);
        return;
      }
      ensureSharedRecentProjectsAccountSynced({ force: true }).catch(() => {});
      requestMultiResync('visibility');
    }
  }

  function handleMultiWindowFocus() {
    syncSharedProjectVisibleStatus();
    const hiddenGapMs = sharedProjectVisibilityHiddenAt > 0
      ? Math.max(0, Date.now() - sharedProjectVisibilityHiddenAt)
      : 0;
    sharedProjectVisibilityHiddenAt = 0;
    if (activeSharedProjectKey) {
      recoverSharedProjectAfterWake('focus', { hiddenGapMs, immediate: true }).catch(() => {});
      scheduleSafariSharedProjectWakeResync('focus', hiddenGapMs);
      return;
    }
    ensureSharedRecentProjectsAccountSynced({ force: true }).catch(() => {});
    requestMultiResync('focus');
  }

  function handleMultiOnline() {
    syncSharedProjectVisibleStatus();
    if (activeSharedProjectKey) {
      recoverSharedProjectAfterWake('online', { hiddenGapMs: 0, immediate: true }).catch(() => {});
      scheduleSafariSharedProjectWakeResync('online', 0);
      return;
    }
    ensureSharedRecentProjectsAccountSynced({ force: true }).catch(() => {});
    requestMultiResync('online');
  }

  function handleMultiOffline() {
    syncSharedProjectVisibleStatus();
    if (!activeSharedProjectKey) {
      return;
    }
    setActiveSharedProjectSyncState('catching-up', { announce: true });
    queueSharedProjectReconnectRecovery('offline-wait', { immediate: false }).catch(() => {});
  }

  function handleMultiPageShow(event = null) {
    const hiddenGapMs = sharedProjectVisibilityHiddenAt > 0
      ? Math.max(0, Date.now() - sharedProjectVisibilityHiddenAt)
      : 0;
    sharedProjectVisibilityHiddenAt = 0;
    if (activeSharedProjectKey) {
      recoverSharedProjectAfterWake(event?.persisted ? 'pageshow-bfcache' : 'pageshow', { hiddenGapMs, immediate: true }).catch(() => {});
      scheduleSafariSharedProjectWakeResync(event?.persisted ? 'pageshow-bfcache' : 'pageshow', hiddenGapMs);
      return;
    }
    ensureSharedRecentProjectsAccountSynced({ force: true }).catch(() => {});
    requestMultiResync('pageshow');
  }

  function handleMultiDocumentResume() {
    const hiddenGapMs = sharedProjectVisibilityHiddenAt > 0
      ? Math.max(0, Date.now() - sharedProjectVisibilityHiddenAt)
      : 0;
    sharedProjectVisibilityHiddenAt = 0;
    if (activeSharedProjectKey) {
      recoverSharedProjectAfterWake('document-resume', { hiddenGapMs, immediate: true }).catch(() => {});
      scheduleSafariSharedProjectWakeResync('document-resume', hiddenGapMs);
      return;
    }
    ensureSharedRecentProjectsAccountSynced({ force: true }).catch(() => {});
    requestMultiResync('document-resume');
  }

  function handleMultiPageHide() {
    if (activeSharedProjectKey) {
      sharedProjectVisibilityHiddenAt = Date.now();
    }
    if (sharedProjectSafariWakeResyncTimer !== null) {
      window.clearTimeout(sharedProjectSafariWakeResyncTimer);
      sharedProjectSafariWakeResyncTimer = null;
    }
  }

  function handleSharedProjectRecoveryFirstInput(event = null) {
    if (!activeSharedProjectKey || appReloadInProgress) {
      return;
    }
    const target = event?.target instanceof Element ? event.target : null;
    const isCanvasPointer = Boolean(
      target
      && (
        (dom.canvasViewport && dom.canvasViewport.contains(target))
        || (dom.stage && dom.stage.contains(target))
      )
    );
    if (!isCanvasPointer) {
      return;
    }
    const blockReason = getSharedProjectLocalDrawBlockReason(activeSharedProjectKey, {
      allowLocalOpBacklog: true,
    });
    if (!blockReason) {
      if (activeSharedProjectSyncState === 'catching-up' || sharedProjectPendingRemoteOps.size > 0) {
        softResumeSharedProjectAfterSleep('first-input-background-sync', {
          hiddenGapMs: 0,
          intensity: 'reconnect',
        }).catch(() => {});
      }
      return;
    }
    if (activeSharedProjectOpenInProgress || document.visibilityState === 'hidden') {
      return;
    }
    softResumeSharedProjectAfterSleep(`first-input-${blockReason}`, {
      hiddenGapMs: 0,
      intensity: 'reconnect',
    }).then(recovered => {
      if (recovered) {
        markSharedProjectDrawReadinessVerified(`first-input-${blockReason}`);
      }
    }).catch(() => {});
    requestSharedProjectDrawReadinessRecovery(`first-input-${blockReason}`).catch(() => {});
    const catchingUpForMs = sharedProjectCatchingUpStartedAt > 0
      ? Date.now() - sharedProjectCatchingUpStartedAt
      : 0;
    const shouldReconnect = Boolean(
      activeSharedProjectSyncState === 'catching-up'
      && catchingUpForMs >= SHARED_PROJECT_FIRST_INPUT_RECONNECT_AFTER_CATCHUP_MS
    );
    if (shouldReconnect) {
      queueSharedProjectReconnectRecovery(`first-input-recovery-${blockReason}`, { immediate: true }).catch(() => {});
    }
  }



  return Object.freeze({
    ensureSharedProjectAutoRecovery,
    scheduleSharedProjectVisibleStatusRefresh,
    syncSharedProjectVisibleStatus,
    readSharedProjectRecoveryReloadAt,
    markSharedProjectRecoveryReloadAt,
    clearSharedProjectRecoveryReloadTimer,
    canScheduleSharedProjectRecoveryReload,
    scheduleSharedProjectRecoveryReload,
    isReloadNavigation,
    resumeSharedProjectLocalOpsAfterConnectivityChange,
    stabilizeActiveSharedProjectConnection,
    markSharedProjectOpenWithReconnectFallback,
    queueSharedProjectReconnectRecovery,
    getSharedProjectSoftResumeIntensity,
    getSharedProjectSoftResumeBrowserInfo,
    softResumeSharedProjectAfterSleep,
    recoverSharedProjectAfterWake,
    recoverSharedProjectAfterWakeLegacy,
    scheduleSafariSharedProjectWakeResync,
    requestSharedProjectDrawReadinessRecovery,
    handleMultiVisibilityChange,
    handleMultiWindowFocus,
    handleMultiOnline,
    handleMultiOffline,
    handleMultiPageShow,
    handleMultiDocumentResume,
    handleMultiPageHide,
    handleSharedProjectRecoveryFirstInput,
  });
      }
    })(scope);
  }

  root.sharedProjectRecoveryLifecycleUtils = Object.freeze({
    createSharedProjectRecoveryLifecycleUtils,
  });
})();
