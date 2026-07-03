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

  function setupAutosaveControls() {
    const button = dom.controls.enableAutosave;
    if (!button) return;
    button.textContent = localizeText('ローカル自動保存（常時ON）', 'Local Autosave (Always ON)');
    button.disabled = true;
  }

  function setExportDirectoryDisplayLabel(label, { persist = true } = {}) {
    exportDirectoryDisplayLabel = sanitizeExportDirectoryDisplayLabel(label);
    if (persist) {
      storeExportDirectoryDisplayLabel(exportDirectoryDisplayLabel);
    }
    updateExportDestinationLabel();
  }

  function getExportDestinationLabelText() {
    if (!EXPORT_DIRECTORY_SUPPORTED) {
      return localizeText(
        '画像/GIF/SVG出力先: 固定出力先は使用しません（保存時に保存先を選択）',
        'Image/GIF/SVG destination: fixed folder is disabled (choose destination when saving)'
      );
    }
    const activeHandle = exportDirectoryHandle || pendingExportDirectoryHandle;
    const displayLabel = sanitizeExportDirectoryDisplayLabel(exportDirectoryDisplayLabel)
      || buildExportDirectoryDisplayLabel({
        workspaceHandle: activeHandle,
        fallback: EXPORT_WORKSPACE_DIR_NAME,
      });
    if (exportDirectoryHandle) {
      return localizeText(
        `画像/GIF/SVG出力先: ${displayLabel}/（フルパスはブラウザ仕様で非表示）`,
        `Image/GIF/SVG destination: ${displayLabel}/ (full path hidden by browser)`
      );
    }
    if (pendingExportDirectoryHandle) {
      return localizeText(
        `画像/GIF/SVG出力先: ${displayLabel}/（再許可が必要）`,
        `Image/GIF/SVG destination: ${displayLabel}/ (reauthorization required)`
      );
    }
    return localizeText(
      '画像/GIF/SVG出力先: 未固定（保存時に保存先を選択）',
      'Image/GIF/SVG destination: not fixed (choose destination when saving)'
    );
  }

  function updateExportDestinationLabel() {
    const labelText = getExportDestinationLabelText();
    const labelNodes = [
      dom.controls.exportDestinationLabel,
      dom.exportDialog?.destinationLabel,
      dom.newProject?.exportDestinationLabel,
    ];
    labelNodes.forEach(node => {
      if (node instanceof HTMLElement) {
        node.textContent = labelText;
      }
    });
  }

  function updateExportFolderStatus(message, tone = 'info') {
    const statusNode = dom.controls.exportFolderStatus;
    if (statusNode) {
      statusNode.hidden = !EXPORT_DIRECTORY_SUPPORTED;
      if (statusNode.hidden) {
        statusNode.textContent = '';
        delete statusNode.dataset.tone;
        updateExportDestinationLabel();
        return;
      }
      statusNode.textContent = message;
      statusNode.dataset.tone = tone;
    }
    updateExportDestinationLabel();
  }

  function updateExportFolderButtonLabel() {
    const buttons = [dom.controls.bindExportFolder, dom.newProject?.bindExportFolder];
    if (!buttons.length) {
      return;
    }
    if (!EXPORT_DIRECTORY_SUPPORTED) {
      buttons.forEach(button => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        const isNewProjectButton = button === dom.newProject?.bindExportFolder;
        button.hidden = true;
        button.disabled = true;
        button.textContent = isNewProjectButton
          ? localizeText('保存先固定を使用しない', 'Disable fixed save destination')
          : localizeText('出力先固定を使用しない', 'Disable fixed export destination');
      });
      return;
    }
    buttons.forEach(button => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const isNewProjectButton = button === dom.newProject?.bindExportFolder;
      button.hidden = false;
      button.disabled = false;
      if (exportDirectoryHandle) {
        button.textContent = isNewProjectButton
          ? localizeText('保存先フォルダを変更', 'Change save folder')
          : localizeText('出力フォルダを変更', 'Change export folder');
        return;
      }
      if (pendingExportDirectoryHandle) {
        button.textContent = isNewProjectButton
          ? localizeText('保存先フォルダを再許可', 'Reauthorize save folder')
          : localizeText('出力フォルダを再許可', 'Reauthorize export folder');
        return;
      }
      button.textContent = isNewProjectButton
        ? localizeText('保存先フォルダを指定', 'Choose save folder')
        : localizeText('出力フォルダを設定', 'Set export folder');
    });
  }

  async function ensureExportWorkspaceDirectory(handle) {
    if (!handle || typeof handle.getDirectoryHandle !== 'function') {
      return handle;
    }
    try {
      return await handle.getDirectoryHandle(EXPORT_WORKSPACE_DIR_NAME, { create: true });
    } catch (error) {
      console.warn('Failed to create PiXiEED export workspace directory', error);
      return handle;
    }
  }

  function schedulePendingExportDirectoryPermission(handle) {
    pendingExportDirectoryHandle = handle || null;
    exportDirectoryHandle = null;
    if (handle) {
      const nextLabel = buildExportDirectoryDisplayLabel({
        workspaceHandle: handle,
        fallback: exportDirectoryDisplayLabel || EXPORT_WORKSPACE_DIR_NAME,
      });
      setExportDirectoryDisplayLabel(nextLabel);
    } else {
      updateExportDestinationLabel();
    }
    updateExportFolderButtonLabel();
    updateExportFolderStatus(
      localizeText(
        '出力フォルダ: 権限が必要です。ボタンを押して再許可してください',
        'Export folder: permission required. Press the button to reauthorize.'
      ),
      'warn'
    );
  }

  async function attemptExportDirectoryReauthorization() {
    if (!pendingExportDirectoryHandle) {
      return false;
    }
    const handle = pendingExportDirectoryHandle;
    const granted = await ensureHandlePermission(handle, { request: true });
    if (!granted) {
      schedulePendingExportDirectoryPermission(handle);
      return false;
    }
    pendingExportDirectoryHandle = null;
    exportDirectoryHandle = handle;
    const nextLabel = buildExportDirectoryDisplayLabel({
      workspaceHandle: handle,
      fallback: exportDirectoryDisplayLabel || EXPORT_WORKSPACE_DIR_NAME,
    });
    setExportDirectoryDisplayLabel(nextLabel);
    await storeExportDirectoryHandle(handle);
    updateExportFolderButtonLabel();
    updateExportFolderStatus(
      localizeText(
        `出力フォルダ: 設定済み (${EXPORT_WORKSPACE_DIR_NAME})`,
        `Export folder: set (${EXPORT_WORKSPACE_DIR_NAME})`
      ),
      'success'
    );
    return true;
  }

  async function requestExportDirectoryBinding() {
    if (!EXPORT_DIRECTORY_SUPPORTED || typeof window.showDirectoryPicker !== 'function') {
      updateExportFolderButtonLabel();
      updateExportFolderStatus(localizeText('出力フォルダ: このブラウザでは利用できません', 'Export folder: unsupported in this browser'), 'warn');
      return false;
    }
    try {
      const rootHandle = await window.showDirectoryPicker({
        id: EXPORT_DIRECTORY_PICKER_ID,
        mode: 'readwrite',
      });
      const grantedRoot = await ensureHandlePermission(rootHandle, { request: true });
      if (!grantedRoot) {
        schedulePendingExportDirectoryPermission(rootHandle);
        return false;
      }
      const workspaceHandle = await ensureExportWorkspaceDirectory(rootHandle);
      const grantedWorkspace = await ensureHandlePermission(workspaceHandle, { request: true });
      if (!grantedWorkspace) {
        schedulePendingExportDirectoryPermission(workspaceHandle);
        return false;
      }
      exportDirectoryHandle = workspaceHandle;
      pendingExportDirectoryHandle = null;
      exportDirectorySetupDismissed = false;
      const nextLabel = buildExportDirectoryDisplayLabel({
        rootHandle,
        workspaceHandle,
        fallback: EXPORT_WORKSPACE_DIR_NAME,
      });
      setExportDirectoryDisplayLabel(nextLabel);
      await storeExportDirectoryHandle(workspaceHandle);
      updateExportFolderButtonLabel();
      updateExportFolderStatus(
        localizeText(
          `出力フォルダ: 設定済み (${EXPORT_WORKSPACE_DIR_NAME})`,
          `Export folder: set (${EXPORT_WORKSPACE_DIR_NAME})`
        ),
        'success'
      );
      return true;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        exportDirectorySetupDismissed = true;
        updateExportFolderStatus(localizeText('出力フォルダ: キャンセルしました', 'Export folder: cancelled'), 'warn');
        return false;
      }
      console.warn('Export directory binding failed', error);
      updateExportFolderStatus(localizeText('出力フォルダ: フォルダを選択できませんでした', 'Export folder: failed to select folder'), 'error');
      return false;
    }
  }

  function setupExportDirectoryControls() {
    const buttons = [
      dom.controls.bindExportFolder,
      dom.newProject?.bindExportFolder,
    ].filter(button => button instanceof HTMLButtonElement);
    if (!buttons.length) {
      updateExportDestinationLabel();
      return;
    }
    updateExportFolderButtonLabel();
    updateExportDestinationLabel();
    if (!EXPORT_DIRECTORY_SUPPORTED) {
      updateExportFolderStatus(
        localizeText(
          '出力フォルダ: 固定出力先は使用しません（保存時に保存先を選択）',
          'Export folder: fixed destination is disabled (choose destination when saving)'
        ),
        'info'
      );
      return;
    }
    buttons.forEach(button => {
      if (button.dataset.bound === 'true') {
        return;
      }
      button.dataset.bound = 'true';
      button.addEventListener('click', async () => {
        exportDirectorySetupDismissed = false;
        if (pendingExportDirectoryHandle && !exportDirectoryHandle) {
          const restored = await attemptExportDirectoryReauthorization();
          if (restored) {
            return;
          }
        }
        await requestExportDirectoryBinding();
      });
    });
  }

  async function initializeExportDirectoryBinding() {
    const storedDisplayLabel = loadStoredExportDirectoryDisplayLabel();
    setExportDirectoryDisplayLabel(storedDisplayLabel, { persist: false });
    setupExportDirectoryControls();
    if (!EXPORT_DIRECTORY_SUPPORTED) {
      return;
    }
    updateExportFolderStatus(localizeText('出力フォルダ: 初期化中…', 'Export folder: initializing...'), 'info');
    try {
      const handle = await loadStoredExportDirectoryHandle();
      if (!handle) {
        setExportDirectoryDisplayLabel('');
        updateExportFolderButtonLabel();
        updateExportFolderStatus(localizeText('出力フォルダ: 未設定', 'Export folder: not set'), 'info');
        return;
      }
      const granted = await ensureHandlePermission(handle, { request: false });
      if (granted) {
        exportDirectoryHandle = handle;
        pendingExportDirectoryHandle = null;
        const nextLabel = sanitizeExportDirectoryDisplayLabel(exportDirectoryDisplayLabel)
          || buildExportDirectoryDisplayLabel({
            workspaceHandle: handle,
            fallback: EXPORT_WORKSPACE_DIR_NAME,
          });
        setExportDirectoryDisplayLabel(nextLabel);
        updateExportFolderButtonLabel();
        updateExportFolderStatus(
          localizeText(
            `出力フォルダ: 設定済み (${EXPORT_WORKSPACE_DIR_NAME})`,
            `Export folder: set (${EXPORT_WORKSPACE_DIR_NAME})`
          ),
          'success'
        );
      } else {
        schedulePendingExportDirectoryPermission(handle);
      }
    } catch (error) {
      console.warn('Export directory initialisation failed', error);
      updateExportFolderButtonLabel();
      updateExportFolderStatus(localizeText('出力フォルダ: 初期化でエラーが発生しました', 'Export folder: initialization failed'), 'error');
    }
  }

  async function initializeAutosave() {
    setupAutosaveControls();
    if (!AUTOSAVE_SUPPORTED) {
      updateAutosaveStatus('自動保存: このブラウザでは利用できません', 'warn');
      return;
    }

    updateAutosaveStatus('自動保存: 端末内データを確認中…');

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
      const storedProjectId = await loadStoredAutosaveProjectId();
      const reusableProjectId = normalizeAutosaveProjectId(storedProjectId || '');
      const startupRestoreTargetId = reusableProjectId
        ? reusableProjectId
        : normalizeAutosaveProjectId(recentEntries[0]?.id || '');
      startupAutosaveRestoreProjectId = startupRestoreTargetId;
      setActiveAutosaveProjectId(startupRestoreTargetId || reusableProjectId || createAutosaveProjectId());
      updateAutosaveStatus(
        recentEntries.length
          ? '自動保存: 端末内プロジェクトを復元できます'
          : '自動保存: 新規作成すると端末内への自動保存を開始します',
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
    if (isLightweightPersistenceMode()) {
      autosaveWriteQueued = true;
      scheduleAutosaveSnapshot();
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
    if (isLargeDocumentPerformanceMode()) {
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
    if (!AUTOSAVE_SUPPORTED) return;
    if (autosaveRestoring) return;
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
    if (!force && !autosaveDirty) return false;
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
    if (!force && isAutosaveInteractionBusy()) {
      autosaveWriteQueued = true;
      scheduleAutosaveSnapshot();
      return false;
    }
    if (!force && hasRecentSaveInteraction()) {
      autosaveWriteQueued = true;
      scheduleAutosaveSnapshot();
      return false;
    }
    if (!force && hasRecentViewportInteraction()) {
      autosaveWriteQueued = true;
      scheduleAutosaveSnapshot();
      return false;
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
      updateAutosaveStatus('自動保存: 端末内に保存中…');
      const snapshot = makeHistorySnapshot({ clonePixelData: false });
      const session = buildAutosaveSessionPayload();
      const packaged = buildPackagedProjectPayload(snapshot, { session });
      const dirtyGenerationAtStart = autosaveDirtyGeneration;
      const unsavedTokenAtStart = unsavedChangeToken;
      const savedEntry = await recordRecentProjectSnapshot(snapshot, packaged, {
        projectId,
        thumbnailIntervalMs: AUTOSAVE_THUMBNAIL_UPDATE_INTERVAL_MS,
      });
      if (!savedEntry) {
        throw new Error('Failed to record autosave snapshot');
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
      updateAutosaveStatus('自動保存: 端末内に保存済み', 'success');
      return true;
    } catch (error) {
      throw error;
    } finally {
      autosaveWriteInFlight = false;
      releaseAutosaveTabLock();
      if (autosaveWriteQueued || autosaveDirty) {
        autosaveWriteQueued = false;
        scheduleAutosaveSnapshot();
      }
    }
  }

  async function restoreAutosaveDocument(handle) {
    if (!ensureCurrentClientCanReplaceActiveProject({ announce: false })) {
      return false;
    }
    try {
      const file = await handle.getFile();
      if (!file) {
        return false;
      }
      const text = await file.text();
      if (!text) {
        updateAutosaveStatus('自動保存: 新しいファイルに保存します');
        return false;
      }
      const parsedDocument = snapshotFromDocumentText(text);
      const snapshot = parsedDocument?.snapshot || null;
      const projectSession = parsedDocument?.projectSession || null;
      const dotStats = parsedDocument?.dotStats || null;
      if (!snapshot) {
        updateAutosaveStatus('自動保存: ファイルを読み込めませんでした', 'error');
        return false;
      }
      if (isTinyStartupSnapshot(snapshot)) {
        updateAutosaveStatus('自動保存: 起動時の 1x1 バックアップ読み込みをスキップしました', 'warn');
        return false;
      }
      synchronizeImportedSnapshotPalette(snapshot);
      autosaveRestoring = true;
      try {
        applyHistorySnapshot(snapshot, { forcePalettePresetSync: true });
        history.pending = null;
        if (projectSession) {
          history.limit = projectSession.historyLimit;
          history.past = projectSession.historyPast;
          history.future = projectSession.historyFuture;
          trimHistoryStacksToLimit();
          timelapseState.tracksByCanvasId = Object.create(null);
          Object.entries(projectSession.timelapse.tracksByCanvasId || {}).forEach(([canvasId, track]) => {
            timelapseState.tracksByCanvasId[canvasId] = {
              snapshots: Array.isArray(track?.snapshots) ? track.snapshots.slice() : [],
              operationLog: track?.operationLog && typeof track.operationLog === 'object'
                ? {
                    version: 1,
                    baseSnapshot: track.operationLog.baseSnapshot || null,
                    entries: Array.isArray(track.operationLog.entries)
                      ? track.operationLog.entries
                        .map(entry => normalizeSerializedTimelapseOperationEntry(entry))
                        .filter(Boolean)
                      : [],
                  }
                : null,
              warningShown: Boolean(track?.warningShown),
              sampleStep: Math.max(1, Math.round(Number(track?.sampleStep) || 1)),
              lastCaptureToken: Number.isFinite(Number(track?.lastCaptureToken))
                ? Math.round(Number(track.lastCaptureToken))
                : -1,
            };
          });
          timelapseState.enabled = projectSession.timelapse.enabled;
          timelapseState.fps = projectSession.timelapse.fps;
        } else {
          history.past = [];
          history.future = [];
          clearTimelapseRecording({ silent: true, scope: 'all' });
        }
        reconcileTimelapseTracksForSingleCanvas();
        ensureTimelapseStartCapture();
      } finally {
        autosaveRestoring = false;
      }
      syncTimelapseControls();
      updateHistoryButtons();
      autosaveDirty = false;
      resetDocumentUnsavedChanges();
      syncPixfindSnapshotAfterDocumentReset();
      updateMemoryStatus();
      setTrackedProjectDotBaseline(snapshot, dotStats);
      resetOpenedDocumentViewport({ defer: true });
      return true;
    } catch (error) {
      autosaveRestoring = false;
      console.warn('Failed to restore autosave document', error);
      updateAutosaveStatus('自動保存: ファイルを読み込めませんでした', 'error');
      return false;
    }
  }

  async function getFileHandleInExportDirectory(filename, { create = true, requestPermission = false } = {}) {
    if (!exportDirectoryHandle || typeof exportDirectoryHandle.getFileHandle !== 'function') {
      return null;
    }
    const granted = await ensureHandlePermission(exportDirectoryHandle, { request: requestPermission });
    if (!granted) {
      if (requestPermission) {
        schedulePendingExportDirectoryPermission(exportDirectoryHandle);
      }
      return null;
    }
    try {
      return await exportDirectoryHandle.getFileHandle(filename, { create: Boolean(create) });
    } catch (error) {
      console.warn('Failed to create/open file in export directory', error);
      return null;
    }
  }

  async function resolveUniqueExportDirectoryFilename(filename, { requestPermission = true, maxSequence = 256 } = {}) {
    if (!exportDirectoryHandle || typeof exportDirectoryHandle.getFileHandle !== 'function') {
      return null;
    }
    const granted = await ensureHandlePermission(exportDirectoryHandle, { request: requestPermission });
    if (!granted) {
      if (requestPermission) {
        schedulePendingExportDirectoryPermission(exportDirectoryHandle);
      }
      return null;
    }
    const baseFilename = sanitizeNativeFilename(filename, 'export.bin');
    for (let sequence = 0; sequence <= maxSequence; sequence += 1) {
      const candidate = buildNumberedFilename(baseFilename, sequence);
      try {
        await exportDirectoryHandle.getFileHandle(candidate, { create: false });
      } catch (error) {
        if (error && error.name === 'NotFoundError') {
          return candidate;
        }
        console.warn('Failed to inspect existing export filename', error);
        return candidate;
      }
    }
    return buildNumberedFilename(baseFilename, maxSequence + 1);
  }

  async function requestAutosaveBinding(options = {}) {
    if (!FILE_HANDLE_AUTOSAVE_SUPPORTED) return;
    try {
      const suggestedNameOption = typeof options.suggestedName === 'string' ? options.suggestedName.trim() : '';
      const suggestedName = suggestedNameOption || createAutosaveFileName();
      let handle = await getFileHandleInExportDirectory(suggestedName, {
        create: true,
        requestPermission: true,
      });
      let boundFromExportDirectory = Boolean(handle);
      if (!handle && EXPORT_DIRECTORY_SUPPORTED && typeof window.showDirectoryPicker === 'function' && !exportDirectorySetupDismissed) {
        const bound = await requestExportDirectoryBinding();
        if (bound) {
          handle = await getFileHandleInExportDirectory(suggestedName, {
            create: true,
            requestPermission: true,
          });
          boundFromExportDirectory = Boolean(handle);
        }
      }
      if (!handle) {
        handle = await window.showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: 'PiXiEEDraw ドキュメント',
              accept: {
                'application/json': ['.json', '.pxdraw', '.pixieedraw'],
                'application/x-pixieedraw': ['.pixieedraw'],
              },
            },
          ],
        });
        boundFromExportDirectory = false;
      }
      const granted = await ensureHandlePermission(handle, { request: true });
      if (!granted) {
        updateAutosaveStatus('自動保存: 権限が必要です', 'warn');
        return;
      }
      autosaveHandle = handle;
      pendingAutosaveHandle = null;
      clearPendingPermissionListener();
      await storeAutosaveHandle(handle);
      if (dom.controls.enableAutosave) {
        dom.controls.enableAutosave.textContent = 'ローカル自動保存（常時ON）';
      }
      updateAutosaveStatus(
        boundFromExportDirectory
          ? `自動保存: ${EXPORT_WORKSPACE_DIR_NAME} フォルダ内に保存中…`
          : '自動保存: 保存中…'
      );
      markAutosaveDirty();
      await writeAutosaveSnapshot(true);
    } catch (error) {
      if (error && error.name === 'AbortError') {
        updateAutosaveStatus('自動保存: キャンセルしました', 'warn');
        return;
      }
      console.warn('Autosave binding failed', error);
      updateAutosaveStatus('自動保存: ファイルを選択できませんでした', 'error');
    }
  }

  async function ensureAutosaveForLensImport() {
    if (!AUTOSAVE_SUPPORTED) {
      return;
    }
    if (!autosaveProjectId) {
      setActiveAutosaveProjectId(createAutosaveProjectId());
    }
    markAutosaveDirty();
    scheduleAutosaveSnapshot();
    updateAutosaveStatus('PiXiEELENS の取り込み内容を端末内に自動保存します', 'info');
  }

  async function ensureHandlePermission(handle, { request = false } = {}) {
    if (!handle) return false;
    const opts = { mode: 'readwrite' };
    const canQuery = typeof handle.queryPermission === 'function';
    const canRequest = typeof handle.requestPermission === 'function';

    if (!canQuery) {
      if (!request || !canRequest) {
        return false;
      }
      const outcome = await handle.requestPermission(opts);
      return outcome === 'granted';
    }

    let permission = await handle.queryPermission(opts);
    if (permission === 'granted') {
      return true;
    }
    if (!request || !canRequest) {
      return false;
    }
    permission = await handle.requestPermission(opts);
    return permission === 'granted';
  }

  function schedulePendingAutosavePermission(handle) {
    pendingAutosaveHandle = handle;
    autosaveHandle = null;
    clearPendingPermissionListener();
    updateAutosaveStatus('自動保存: 権限が必要です。キャンバスをクリックして再許可してください', 'warn');
    if (dom.controls.enableAutosave) {
      dom.controls.enableAutosave.textContent = 'ローカル自動保存（常時ON）';
    }
    const listener = (event) => {
      const target = event?.target instanceof Element ? event.target : null;
      if (!target) {
        return;
      }
      const isEditable = Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
      if (isEditable) {
        return;
      }
      const isAutosaveButton = Boolean(
        dom.controls.enableAutosave
          && (target === dom.controls.enableAutosave || target.closest('#enableAutosave') === dom.controls.enableAutosave)
      );
      const isCanvasTap = Boolean(
        (dom.canvasViewport && dom.canvasViewport.contains(target))
          || isCanvasSurfaceTarget(target)
      );
      if (!isAutosaveButton && !isCanvasTap) {
        return;
      }
      clearPendingPermissionListener();
      attemptAutosaveReauthorization().catch(error => {
        console.warn('Autosave reauthorization failed', error);
        updateAutosaveStatus('自動保存: 権限を付与できませんでした', 'error');
      });
    };
    autosavePermissionListener = listener;
    window.addEventListener('pointerdown', listener, true);
  }

  function clearPendingPermissionListener() {
    if (!autosavePermissionListener) return;
    window.removeEventListener('pointerdown', autosavePermissionListener, true);
    autosavePermissionListener = null;
  }


  async function attemptAutosaveReauthorization() {
    if (!pendingAutosaveHandle) {
      return false;
    }
    const handle = pendingAutosaveHandle;
    clearPendingPermissionListener();
    const granted = await ensureHandlePermission(handle, { request: true });
    if (!granted) {
      updateAutosaveStatus('自動保存: 権限が必要です。右のボタンから再許可してください', 'warn');
      schedulePendingAutosavePermission(handle);
      return false;
    }
    pendingAutosaveHandle = null;
    autosaveHandle = handle;
    if (dom.controls.enableAutosave) {
      dom.controls.enableAutosave.textContent = 'ローカル自動保存（常時ON）';
    }
    try {
      const restored = await restoreAutosaveDocument(handle);
      if (restored) {
        updateAutosaveStatus('自動保存: 端末内データを読み込みました', 'success');
      } else {
        updateAutosaveStatus('自動保存: 端末内へ自動保存します', 'info');
      }
    } catch (error) {
      console.warn('Autosave restore after reauthorization failed', error);
      updateAutosaveStatus('自動保存: 既存バックアップの読み込みに失敗しました', 'error');
    }
    return true;
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
    setupAutosaveControls,
    setExportDirectoryDisplayLabel,
    getExportDestinationLabelText,
    updateExportDestinationLabel,
    updateExportFolderStatus,
    updateExportFolderButtonLabel,
    ensureExportWorkspaceDirectory,
    schedulePendingExportDirectoryPermission,
    attemptExportDirectoryReauthorization,
    requestExportDirectoryBinding,
    setupExportDirectoryControls,
    initializeExportDirectoryBinding,
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
    restoreAutosaveDocument,
    getFileHandleInExportDirectory,
    resolveUniqueExportDirectoryFilename,
    requestAutosaveBinding,
    ensureAutosaveForLensImport,
    ensureHandlePermission,
    schedulePendingAutosavePermission,
    clearPendingPermissionListener,
    attemptAutosaveReauthorization,
  });
      }
    })(scope);
  }

  root.autosaveWorkflowUtils = Object.freeze({
    createAutosaveWorkflowUtils,
  });
})();
