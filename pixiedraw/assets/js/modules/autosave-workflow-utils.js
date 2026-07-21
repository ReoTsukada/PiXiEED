(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createAutosaveWorkflowUtils(rawScope = {}) {
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
  let autosavePerformanceSequence = 0;
  // A committed history entry must reach IndexedDB before the normal debounce
  // window resumes. This also carries an immediate flush across an in-flight
  // write, so a fast second stroke is not left waiting for the next interval.
  let autosaveCommittedFlushQueued = false;

  function beginAutosavePerformanceSpan(name, details = null) {
    const perf = window?.performance;
    const id = `${name}:${Date.now().toString(36)}:${++autosavePerformanceSequence}`;
    const startMark = `${id}:start`;
    try {
      perf?.mark?.(startMark);
    } catch (_error) {}
    return { name, details, perf, id, startMark, startedAt: perf?.now?.() ?? Date.now() };
  }

  function endAutosavePerformanceSpan(span, details = null) {
    if (!span) return;
    const finishedAt = span.perf?.now?.() ?? Date.now();
    const endMark = `${span.id}:end`;
    const mergedDetails = { ...(span.details || {}), ...(details || {}) };
    try {
      span.perf?.mark?.(endMark);
      span.perf?.measure?.(span.name, span.startMark, endMark);
    } catch (_error) {}
    console.info('[pixiedraw:performance]', {
      phase: span.name,
      elapsedMs: Math.round(finishedAt - span.startedAt),
      ...mergedDetails,
    });
  }

  function updateAutosaveStatus(message, tone = 'info') {
    const statusNode = dom.controls.autosaveStatus;
    if (!statusNode) return;
    const nextText = typeof message === 'string' ? message : String(message || '');
    const nextTone = typeof tone === 'string' ? tone : 'info';
    if (statusNode.textContent === nextText && statusNode.dataset.tone === nextTone) {
      return;
    }
    statusNode.textContent = nextText;
    statusNode.dataset.tone = nextTone;
  }

  function getAutosaveBlockedStatusMessage() {
    if (multiState.connected && !isMultiMasterMode() && !isCurrentProjectSharedEntry()) {
      return MULTI_REPLICA_AUTOSAVE_BLOCKED_STATUS;
    }
    return '';
  }

  function ensureInternetConnectedForAction(actionLabelJa = 'この機能', actionLabelEn = 'this feature') {
    const online = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
    if (online) {
      return true;
    }
    const message = localizeText(
      `インターネット接続を確認してください。\n${actionLabelJa}を使うにはオンライン接続が必要です。`,
      `Please check your internet connection.\n${actionLabelEn} requires an online connection.`
    );
    updateAutosaveStatus(
      localizeText(
        'インターネット接続を確認してください',
        'Please check your internet connection'
      ),
      'warn'
    );
    setMultiStatus(
      localizeText(
        'インターネット接続を確認してください',
        'Please check your internet connection'
      ),
      'warn'
    );
    window.alert(message);
    return false;
  }

  function readAutosaveTabLock() {
    if (!canUseSessionStorage) {
      return null;
    }
    try {
      return parseAutosaveTabLockPayload(window.localStorage.getItem(AUTOSAVE_TAB_LOCK_KEY) || '');
    } catch (error) {
      return null;
    }
  }

  function tryAcquireAutosaveTabLock() {
    if (!canUseSessionStorage) {
      return true;
    }
    const now = Date.now();
    const projectId = normalizeAutosaveProjectId(autosaveProjectId || '');
    const current = readAutosaveTabLock();
    if (
      current
      && current.owner !== autosaveTabInstanceId
      && current.expiresAt > now
      && (!current.projectId || !projectId || current.projectId === projectId)
    ) {
      return false;
    }
    const nextLock = {
      owner: autosaveTabInstanceId,
      expiresAt: now + AUTOSAVE_TAB_LOCK_TTL_MS,
      projectId,
    };
    try {
      window.localStorage.setItem(AUTOSAVE_TAB_LOCK_KEY, JSON.stringify(nextLock));
      const verified = readAutosaveTabLock();
      return Boolean(
        verified
        && verified.owner === autosaveTabInstanceId
        && verified.expiresAt === nextLock.expiresAt
        && normalizeAutosaveProjectId(verified.projectId || '') === projectId
      );
    } catch (error) {
      return true;
    }
  }

  function releaseAutosaveTabLock() {
    if (!canUseSessionStorage) {
      return;
    }
    const lock = readAutosaveTabLock();
    if (!lock || lock.owner !== autosaveTabInstanceId) {
      return;
    }
    try {
      window.localStorage.removeItem(AUTOSAVE_TAB_LOCK_KEY);
    } catch (error) {
      // Ignore localStorage errors.
    }
  }

  function shouldAnnounceAutosaveTabLockWait() {
    const now = Date.now();
    if ((now - autosaveTabLockNoticeAt) < AUTOSAVE_TAB_LOCK_NOTICE_THROTTLE_MS) {
      return false;
    }
    autosaveTabLockNoticeAt = now;
    return true;
  }

  function handleAutosaveStorageEvent(event) {
    if (
      !AUTOSAVE_SUPPORTED
      || (typeof StorageEvent !== 'undefined' && !(event instanceof StorageEvent))
    ) {
      return;
    }
    if (event.key !== AUTOSAVE_TAB_LOCK_KEY) {
      return;
    }
    if (autosaveWriteInFlight) {
      return;
    }
    if (!autosaveDirty && !autosaveWriteQueued) {
      return;
    }
    if (!event.newValue) {
      scheduleAutosaveSnapshot();
      return;
    }
    const nextLock = parseAutosaveTabLockPayload(event.newValue);
    const currentProjectId = normalizeAutosaveProjectId(autosaveProjectId || '');
    if (
      !nextLock
      || nextLock.owner === autosaveTabInstanceId
      || nextLock.expiresAt <= Date.now()
      || (nextLock.projectId && currentProjectId && nextLock.projectId !== currentProjectId)
    ) {
      scheduleAutosaveSnapshot();
    }
  }

  async function initializeAutosave(options = {}) {
    if (!AUTOSAVE_SUPPORTED) {
      updateAutosaveStatus('自動保存: このブラウザでは利用できません', 'warn');
      return;
    }

    updateAutosaveStatus('自動保存: 端末内V2を確認中…');

    try {
      const reloadRestoreProjectId = normalizeAutosaveProjectId(
        autosaveProjectId
        || startupAutosaveRestoreProjectId
        || readReloadTargetProjectId()
        || ''
      );
      if (reloadSnapshotRestored && reloadRestoreProjectId) {
        startupAutosaveRestoreProjectId = reloadRestoreProjectId;
        if (normalizeAutosaveProjectId(autosaveProjectId || '') !== reloadRestoreProjectId) {
          setActiveAutosaveProjectId(reloadRestoreProjectId, { persist: false });
        }
        updateAutosaveStatus('自動保存: 再読み込み復帰のプロジェクトを維持します', 'info');
        return;
      }
      const sanitizeResult = await sanitizeRecentProjectsStore({ announce: false });
      const recentEntries = Array.isArray(sanitizeResult?.entries) ? sanitizeResult.entries : [];
      const reusePreviousProjectId = options?.reusePreviousProjectId === true;
      if (!reusePreviousProjectId) {
        startupAutosaveRestoreProjectId = '';
        setActiveAutosaveProjectId(createAutosaveProjectId());
        updateAutosaveStatus(
          recentEntries.length
            ? '自動保存: 保存済みプロジェクトを選んで開けます'
            : '自動保存: 新規作成後、端末内V2へ保存します',
          'info'
        );
        return;
      }
      const storedProjectId = await loadStoredAutosaveProjectId();
      const reusableProjectId = normalizeAutosaveProjectId(storedProjectId || '');
      const startupRestoreTargetId = reusableProjectId
        ? reusableProjectId
        : normalizeAutosaveProjectId(recentEntries[0]?.id || '');
      startupAutosaveRestoreProjectId = startupRestoreTargetId;
      setActiveAutosaveProjectId(startupRestoreTargetId || reusableProjectId || createAutosaveProjectId());
      updateAutosaveStatus(
        recentEntries.length
          ? '自動保存: 保存済みプロジェクトを開けます'
          : '自動保存: 新規作成後、端末内V2へ保存します',
        'info'
      );
    } catch (error) {
      console.warn('Autosave initialisation failed', error);
      updateAutosaveStatus('自動保存: 初期化でエラーが発生しました', 'error');
    }
  }

  function scheduleAutosaveSnapshot({ delayMs = AUTOSAVE_WRITE_DELAY } = {}) {
    if (!AUTOSAVE_SUPPORTED) return;
    if (autosaveRestoring) return;
    const blockedStatus = getAutosaveBlockedStatusMessage();
    if (blockedStatus) {
      if (autosaveWriteTimer !== null) {
        window.clearTimeout(autosaveWriteTimer);
        autosaveWriteTimer = null;
      }
      autosaveWriteDeadline = 0;
      updateAutosaveStatus(blockedStatus, 'info');
      return;
    }
    if (!autosaveDirty) return;
    const largeDocumentDelay = isLargeDocumentPerformanceMode() ? 4200 : 120;
    const safeDelayMs = Math.max(largeDocumentDelay, Math.round(Number(delayMs) || AUTOSAVE_WRITE_DELAY));
    const deadline = Date.now() + safeDelayMs;
    if (
      autosaveWriteTimer !== null
      && Number.isFinite(autosaveWriteDeadline)
      && autosaveWriteDeadline > 0
      && autosaveWriteDeadline <= deadline
    ) {
      return;
    }
    if (autosaveWriteTimer !== null) {
      window.clearTimeout(autosaveWriteTimer);
    }
    autosaveWriteDeadline = deadline;
    autosaveWriteTimer = window.setTimeout(() => {
      autosaveWriteTimer = null;
      autosaveWriteDeadline = 0;
      writeAutosaveSnapshot().catch(error => {
        console.warn('Autosave failed', error);
        updateAutosaveStatus('自動保存: 保存に失敗しました', 'error');
      });
    }, Math.max(0, deadline - Date.now()));
  }

  function requestImmediateAutosaveSnapshot() {
    if (!AUTOSAVE_SUPPORTED || autosaveRestoring || !autosaveDirty) {
      return;
    }
    autosaveCommittedFlushQueued = true;
    if (autosaveWriteInFlight) {
      autosaveWriteQueued = true;
      return;
    }
    writeAutosaveSnapshot(true).catch(error => {
      console.warn('Immediate autosave failed', error);
      updateAutosaveStatus('自動保存: 保存に失敗しました', 'error');
    });
  }

  function isAutosaveInteractionBusy() {
    return Boolean(
      pointerState.active
      || pointerState.selectionMove
      || virtualCursorDrawState.active
      || floatingDrawButtonState.drawSessionStarted
    );
  }

  function markSaveInteractionActivity() {
    lastSaveInteractionAt = Date.now();
  }

  function markViewportInteractionActivity() {
    lastViewportInteractionAt = Date.now();
  }

  function hasRecentSaveInteraction() {
    if (!Number.isFinite(lastSaveInteractionAt) || lastSaveInteractionAt <= 0) {
      return false;
    }
    return (Date.now() - lastSaveInteractionAt) < SAVE_INTERACTION_GRACE_MS;
  }

  function hasRecentViewportInteraction() {
    if (!Number.isFinite(lastViewportInteractionAt) || lastViewportInteractionAt <= 0) {
      return false;
    }
    return (Date.now() - lastViewportInteractionAt) < VIEWPORT_INTERACTION_GRACE_MS;
  }

  function hasPendingAutosaveWork() {
    if (!AUTOSAVE_SUPPORTED) {
      return false;
    }
    return Boolean(
      autosaveDirty
      || autosaveWriteQueued
      || autosaveWriteInFlight
      || autosaveWriteTimer !== null
    );
  }

  function flushAutosaveSnapshotOnLifecycle({ force = false } = {}) {
    if (!AUTOSAVE_SUPPORTED) {
      return;
    }
    if (autosaveRestoring) {
      return;
    }
    if (!hasPendingAutosaveWork()) {
      return;
    }
    if (isLargeDocumentPerformanceMode() && !force) {
      scheduleAutosaveSnapshot();
      return;
    }
    const blockedStatus = getAutosaveBlockedStatusMessage();
    if (blockedStatus) {
      return;
    }
    const now = Date.now();
    if (!force && (now - autosaveLifecycleFlushAt) < AUTOSAVE_LIFECYCLE_FLUSH_THROTTLE_MS) {
      return;
    }
    autosaveLifecycleFlushAt = now;
    if (autosaveWriteTimer !== null) {
      window.clearTimeout(autosaveWriteTimer);
      autosaveWriteTimer = null;
      autosaveWriteDeadline = 0;
    }
    if (autosaveWriteInFlight) {
      autosaveWriteQueued = true;
      return;
    }
    writeAutosaveSnapshot(true).catch(error => {
      console.warn('Autosave lifecycle flush failed', error);
      updateAutosaveStatus('自動保存: 保存に失敗しました', 'error');
    });
  }

  async function waitForAutosaveWriteIdle(timeoutMs = AUTOSAVE_WRITE_DELAY * 4) {
    const safeTimeoutMs = Math.max(250, Math.round(Number(timeoutMs) || 0));
    const deadline = Date.now() + safeTimeoutMs;
    while (autosaveWriteInFlight) {
      if (Date.now() >= deadline) {
        return false;
      }
      await new Promise(resolve => window.setTimeout(resolve, 16));
    }
    return true;
  }

  async function writeAutosaveSnapshot(force = false) {
    if (!AUTOSAVE_SUPPORTED || autosaveRestoring) return;
    const blockedStatus = getAutosaveBlockedStatusMessage();
    if (blockedStatus) {
      if (autosaveWriteTimer !== null) {
        window.clearTimeout(autosaveWriteTimer);
        autosaveWriteTimer = null;
      }
      autosaveWriteDeadline = 0;
      autosaveWriteQueued = false;
      updateAutosaveStatus(blockedStatus, 'info');
      return false;
    }
    if (!autosaveDirty) return true;
    if (autosaveWriteInFlight) {
      autosaveWriteQueued = true;
      if (!force) {
        return false;
      }
      const idle = await waitForAutosaveWriteIdle();
      if (!idle || autosaveWriteInFlight) {
        return false;
      }
    }
    if (
      !force
      && (isAutosaveInteractionBusy() || hasRecentSaveInteraction() || hasRecentViewportInteraction())
    ) {
      autosaveWriteQueued = true;
      scheduleAutosaveSnapshot();
      return false;
    }
    if (isAutosaveV2PrimaryEnabled?.() !== true) {
      throw new Error('On-device true V2 autosave is unavailable');
    }

    const projectId = await ensureActiveAutosaveProjectId();
    if (!tryAcquireAutosaveTabLock()) {
      autosaveWriteQueued = true;
      scheduleAutosaveSnapshot();
      if (shouldAnnounceAutosaveTabLockWait()) {
        updateAutosaveStatus(
          localizeText(
            '自動保存: 別タブが保存中のため待機しています',
            'Autosave: waiting while another tab is saving'
          ),
          'info'
        );
      }
      return false;
    }

    autosaveWriteInFlight = true;
    autosaveWriteQueued = false;
    const autosaveSpan = beginAutosavePerformanceSpan('pixiedraw:autosave:total', { projectId });
    try {
      if (shouldUseLightweightSharedProjectLocalSave(projectId)) {
        updateAutosaveStatus('自動保存: 共有プロジェクトの復帰情報を保存中…');
        const dirtyGenerationAtStart = autosaveDirtyGeneration;
        const unsavedTokenAtStart = unsavedChangeToken;
        const savedEntry = await recordSharedProjectLightweightLocalSave({ projectId });
        if (!savedEntry) {
          throw new Error('Failed to record shared project restore metadata');
        }
        const stillCurrentWrite = (
          normalizeAutosaveProjectId(autosaveProjectId || '') === projectId
          && autosaveDirtyGeneration === dirtyGenerationAtStart
          && unsavedChangeToken === unsavedTokenAtStart
        );
        if (!stillCurrentWrite) {
          autosaveWriteQueued = true;
          updateAutosaveStatus('自動保存: 追加変更を保存します', 'info');
          return false;
        }
        autosaveDirty = false;
        updateAutosaveStatus('自動保存: 共有プロジェクトの復帰情報を保存済み', 'success');
        return true;
      }

      updateAutosaveStatus('自動保存: 端末内V2へ差分保存中…');
      const buildInternalAutosavePayload = (snapshotValue, options = {}) => buildPackagedProjectPayload(
        snapshotValue,
        { ...options, internalBinary: true }
      );
      const journalSavePlan = buildActiveLocalProjectSavePlan?.({
        projectId,
        snapshot: null,
        buildPackagedProjectPayload: buildInternalAutosavePayload,
        buildAutosaveSessionPayload: buildProjectSessionPayload,
      }) || null;
      const normalizedJournalOps = journalSavePlan?.journalOnly === true
        ? normalizeV2PixelPatchJournalOps?.(journalSavePlan.journalPayload)
        : null;
      let useV2Journal = Boolean(
        Array.isArray(normalizedJournalOps)
        && normalizedJournalOps.length > 0
        && isAutosaveV2JournalReady?.(projectId) === true
      );
      let snapshot = null;
      const ensureCurrentSnapshot = () => {
        if (snapshot) {
          return snapshot;
        }
        const snapshotSpan = beginAutosavePerformanceSpan(
          'pixiedraw:autosave:make-history-snapshot',
          { skipped: false }
        );
        try {
          snapshot = makeHistorySnapshot({ clonePixelData: false });
          return snapshot;
        } finally {
          endAutosavePerformanceSpan(snapshotSpan);
        }
      };

      let activeSavePlan = journalSavePlan;
      if (!useV2Journal) {
        if (journalSavePlan?.journalOnly === true) {
          markActiveLocalProjectJournalNeedsCheckpoint?.(projectId);
        }
        ensureCurrentSnapshot();
        activeSavePlan = buildActiveLocalProjectSavePlan?.({
          projectId,
          snapshot,
          buildPackagedProjectPayload: buildInternalAutosavePayload,
          buildAutosaveSessionPayload: buildProjectSessionPayload,
        }) || null;
      }

      const dirtyGenerationAtStart = autosaveDirtyGeneration;
      const unsavedTokenAtStart = unsavedChangeToken;
      let savedEntry = null;
      const recordSpan = beginAutosavePerformanceSpan('pixiedraw:autosave:record-recent-project');
      try {
        try {
          savedEntry = await writeAutosaveV2Primary({
            projectId,
            snapshot,
            thumbnailIntervalMs: AUTOSAVE_THUMBNAIL_UPDATE_INTERVAL_MS,
            savePlan: useV2Journal ? journalSavePlan : activeSavePlan,
          });
        } catch (error) {
          const emptyJournalRevision = useV2Journal
            && /journal revision requires at least one changed (sheet|project)|journal save requires valid replayable operations/i.test(String(error?.message || ''));
          if (!emptyJournalRevision) {
            throw error;
          }
          markActiveLocalProjectJournalNeedsCheckpoint?.(projectId);
          ensureCurrentSnapshot();
          activeSavePlan = buildActiveLocalProjectSavePlan?.({
            projectId,
            snapshot,
            buildPackagedProjectPayload: buildInternalAutosavePayload,
            buildAutosaveSessionPayload: buildProjectSessionPayload,
          }) || null;
          useV2Journal = false;
          savedEntry = await writeAutosaveV2Primary({
            projectId,
            snapshot,
            thumbnailIntervalMs: AUTOSAVE_THUMBNAIL_UPDATE_INTERVAL_MS,
            savePlan: activeSavePlan,
          });
        }
      } finally {
        endAutosavePerformanceSpan(recordSpan);
      }
      if (!savedEntry) {
        throw new Error('Failed to record true V2 autosave snapshot');
      }

      const stillCurrentWrite = (
        normalizeAutosaveProjectId(autosaveProjectId || '') === projectId
        && autosaveDirtyGeneration === dirtyGenerationAtStart
        && unsavedChangeToken === unsavedTokenAtStart
      );
      if (!stillCurrentWrite) {
        autosaveWriteQueued = true;
        updateAutosaveStatus('自動保存: 追加変更を保存します', 'info');
        return false;
      }
      autosaveDirty = false;
      markDocumentDurablySaved();
      pruneInactiveCanvasDirectCaches?.();
      updateAutosaveStatus(
        localizeText(
          '自動保存: 端末内V2へ保存済み（完全ファイルは手動保存できます）',
          'Autosave: saved to on-device V2 storage (complete file can be saved manually)'
        ),
        'success'
      );
      return true;
    } finally {
      endAutosavePerformanceSpan(autosaveSpan);
      autosaveWriteInFlight = false;
      releaseAutosaveTabLock();
      if (autosaveWriteQueued || autosaveDirty) {
        const flushCommittedChange = autosaveCommittedFlushQueued;
        autosaveWriteQueued = false;
        autosaveCommittedFlushQueued = false;
        if (flushCommittedChange) {
          queueMicrotask(() => requestImmediateAutosaveSnapshot());
        } else {
          scheduleAutosaveSnapshot();
        }
      } else {
        autosaveCommittedFlushQueued = false;
      }
    }
  }


  async function ensureAutosaveForLensImport() {
    if (!AUTOSAVE_SUPPORTED) {
      return false;
    }
    if (!autosaveProjectId) {
      setActiveAutosaveProjectId(createAutosaveProjectId());
    }
    markAutosaveDirty();
    scheduleAutosaveSnapshot();
    updateAutosaveStatus('PiXiEELENS の取り込みを端末内V2へ保存します', 'info');
  }

  return Object.freeze({
    updateAutosaveStatus,
    getAutosaveBlockedStatusMessage,
    ensureInternetConnectedForAction,
    readAutosaveTabLock,
    tryAcquireAutosaveTabLock,
    releaseAutosaveTabLock,
    shouldAnnounceAutosaveTabLockWait,
    handleAutosaveStorageEvent,
    initializeAutosave,
    scheduleAutosaveSnapshot,
    requestImmediateAutosaveSnapshot,
    isAutosaveInteractionBusy,
    markSaveInteractionActivity,
    markViewportInteractionActivity,
    hasRecentSaveInteraction,
    hasRecentViewportInteraction,
    hasPendingAutosaveWork,
    flushAutosaveSnapshotOnLifecycle,
    waitForAutosaveWriteIdle,
    writeAutosaveSnapshot,
    ensureAutosaveForLensImport,
  });
      }
    })(scope);
  }

  root.autosaveWorkflowUtils = Object.freeze({
    createAutosaveWorkflowUtils,
  });
})();
