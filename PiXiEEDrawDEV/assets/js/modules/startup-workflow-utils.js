(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createStartupWorkflowUtils(rawScope = {}) {
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
  function syncNewProjectDialogModeText() {
    const createShared = SHARED_PROJECTS_ENABLED && Boolean(pendingNewProjectCreateShared);
    if (dom.newProject?.title instanceof HTMLElement) {
      dom.newProject.title.textContent = createShared
        ? localizeText('共有プロジェクト作成', 'Create Shared Project')
        : localizeText('新規プロジェクト', 'New Project');
    }
    if (dom.newProject?.confirm instanceof HTMLElement) {
      dom.newProject.confirm.textContent = createShared
        ? localizeText('作成して共有', 'Create and Share')
        : localizeText('作成', 'Create');
    }
  }

  function syncNewProjectCreateModeButtons(mode = 'local') {
    const normalized = SHARED_PROJECTS_ENABLED && mode === 'shared' ? 'shared' : 'local';
    if (dom.newProject?.createMode instanceof HTMLSelectElement) {
      dom.newProject.createMode.value = normalized;
    }
    if (Array.isArray(dom.newProject?.modeButtons)) {
      dom.newProject.modeButtons.forEach(button => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        const active = button.dataset.createMode === normalized;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
  }

  function setupHorizontalOverflowDebug() {
    const debugEnabled = (
      typeof window !== 'undefined'
      && (
        window.__PIXIEED_DEBUG_OVERFLOW__ === true
        || window.localStorage?.getItem('pixieed_debug_overflow') === '1'
      )
    );
    if (!debugEnabled) {
      return;
    }
    const detectHorizontalOverflow = () => {
      const viewportWidth = window.innerWidth;
      const pageWidth = document.documentElement.scrollWidth;
      if (pageWidth <= viewportWidth) {
        return;
      }
      console.warn('[layout] horizontal overflow detected', { viewportWidth, pageWidth });
      const offenders = [...document.querySelectorAll('*')]
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return { el, rect };
        })
        .filter(({ rect }) => rect.right > viewportWidth + 0.5 || rect.left < -0.5)
        .map(({ el, rect }) => ({
          tag: el.tagName,
          id: el.id || '',
          className: typeof el.className === 'string' ? el.className : String(el.className || ''),
          width: Math.round(rect.width),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        }));
      console.table(offenders);
    };
    window.addEventListener('load', detectHorizontalOverflow, { once: false });
    window.addEventListener('resize', detectHorizontalOverflow);
    document.addEventListener('pixiedraw:ad-layout-change', detectHorizontalOverflow);
    detectHorizontalOverflow();
  }

  function openNewProjectDialog({ dismissStartup = false, appendAsTab = false, createShared = false } = {}) {
    if (!ensureCurrentClientCanReplaceActiveProject()) {
      return;
    }
    const requestedSharedCreate = SHARED_PROJECTS_ENABLED && Boolean(createShared);
    const config = dom.newProject;
    if (!config) {
      void promptNewProjectFallback({
        appendAsTab: Boolean(appendAsTab),
        createShared: requestedSharedCreate,
      });
      return;
    }
    const dialog = config.dialog;
    if (dialog && typeof dialog.showModal === 'function') {
      try {
        if (config.nameInput) {
          const currentName = state.documentName || DEFAULT_DOCUMENT_NAME;
          config.nameInput.value = extractDocumentBaseName(currentName);
        }
        if (config.widthInput) {
          config.widthInput.value = String(state.width);
        }
        if (config.heightInput) {
          config.heightInput.value = String(state.height);
        }
        if (config.palettePreset) {
          const normalizedPreset = normalizeNewProjectPalettePreset(
            newProjectPalettePresetId,
            NEW_PROJECT_PALETTE_PRESET_DEFAULT
          );
          renderNewProjectPalettePresetOptions(normalizedPreset);
          config.palettePreset.value = normalizedPreset;
          renderNewProjectPalettePresetPicker(normalizedPreset);
          setNewProjectPalettePresetPickerOpen(false);
        }
        syncNewProjectCreateModeButtons(requestedSharedCreate ? 'shared' : 'local');
        pendingNewProjectCreateShared = requestedSharedCreate;
        pendingNewProjectAppendAsTab = Boolean(appendAsTab) && !pendingNewProjectCreateShared;
        syncNewProjectDialogModeText();
        dialog.showModal();
        if (dismissStartup) {
          hideStartupScreen();
        }
        window.requestAnimationFrame(() => {
          queueNewProjectAdRender();
          config.nameInput?.focus();
          config.nameInput?.select?.();
        });
        return;
      } catch (error) {
        console.warn('Failed to open new project dialog', error);
      }
    }
    pendingNewProjectAppendAsTab = false;
    pendingNewProjectCreateShared = false;
    syncNewProjectDialogModeText();
    if (dismissStartup) {
      hideStartupScreen();
    }
    void promptNewProjectFallback({
      appendAsTab: Boolean(appendAsTab),
      createShared: requestedSharedCreate,
    });
  }

  function queueNewProjectAdRender() {
    if (window.__PIXIEED_ADS_DISABLED__ || window.pixieedAdFree?.state?.isActive) {
      return;
    }
    const dialog = dom.newProject?.dialog;
    const adSlot = dom.newProject?.adSlot;
    if (!(dialog instanceof HTMLDialogElement) || !dialog.open || !(adSlot instanceof HTMLElement)) {
      return;
    }
    if (newProjectAdRequested) {
      return;
    }
    if (adSlot.dataset.loaded === '1' || adSlot.getAttribute('data-adsbygoogle-status') === 'done') {
      newProjectAdRequested = true;
      return;
    }
    if (!adSlot.classList.contains('adsbygoogle')) {
      adSlot.classList.add('adsbygoogle');
    }

    const getWidth = () => {
      try {
        const rect = adSlot.getBoundingClientRect();
        return (rect && rect.width) || adSlot.clientWidth || adSlot.offsetWidth || 0;
      } catch (error) {
        return adSlot.clientWidth || adSlot.offsetWidth || 0;
      }
    };

    let attempts = 0;
    const MAX_ATTEMPTS = 24;
    const renderWhenReady = () => {
      if (!(dialog instanceof HTMLDialogElement) || !dialog.open) {
        newProjectAdRequested = false;
        return;
      }
      const width = getWidth();
      if (width <= 0) {
        attempts += 1;
        if (attempts < MAX_ATTEMPTS) {
          window.requestAnimationFrame(renderWhenReady);
          return;
        }
        newProjectAdRequested = false;
        return;
      }
      newProjectAdRequested = true;
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        adSlot.dataset.loaded = '1';
      } catch (error) {
        newProjectAdRequested = false;
      }
    };

    window.requestAnimationFrame(renderWhenReady);
  }









  function closeNewProjectDialog() {
    setNewProjectPalettePresetPickerOpen(false);
    pendingNewProjectAppendAsTab = false;
    pendingNewProjectCreateShared = false;
    syncNewProjectDialogModeText();
    const dialog = dom.newProject?.dialog;
    if (dialog && dialog.open) {
      dialog.close();
    }
  }

  function setupGlobalHistoryConfirmDialog() {
    const config = dom.globalHistoryConfirm;
    if (!config) {
      return;
    }
    const dialog = config.dialog;
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
      if (dialog) {
        dialog.hidden = true;
      }
      return;
    }
    config.cancel?.addEventListener('click', () => {
      closeGlobalHistoryConfirmDialog({ accepted: false });
    });
    config.confirm?.addEventListener('click', () => {
      closeGlobalHistoryConfirmDialog({ accepted: true });
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeGlobalHistoryConfirmDialog({ accepted: false });
    });
    dialog.addEventListener('close', () => {
      if (globalHistoryConfirmState.closing) {
        return;
      }
      resolveGlobalHistoryConfirm(false);
    });
  }

  async function openRecentProjectDeleteConfirmDialog(entry = null, { deletesOwnedSharedProject = null } = {}) {
    const resolvedDeletesOwnedSharedProject = deletesOwnedSharedProject === null
      ? await resolveSharedRecentProjectOwnedByCurrentUser(entry)
      : Boolean(deletesOwnedSharedProject);
    return new Promise(resolve => {
      const config = dom.recentProjectDeleteConfirm;
      const dialog = config?.dialog;
      const isSharedEntry = isSharedRecentProjectEntry(entry);
      const willDeleteOwnedSharedProject = isSharedEntry && resolvedDeletesOwnedSharedProject;
      const displayLabel = extractDocumentBaseName(entry?.fileName || entry?.name || DEFAULT_DOCUMENT_NAME);
      const message = isSharedEntry
        ? localizeText(
          willDeleteOwnedSharedProject
            ? `共有プロジェクト「${displayLabel}」を削除しますか？`
            : `共有プロジェクト「${displayLabel}」を一覧から外しますか？`,
          willDeleteOwnedSharedProject
            ? `Delete shared project "${displayLabel}"?`
            : `Remove shared project "${displayLabel}" from your list?`
        )
        : localizeText(
          `端末内プロジェクト「${displayLabel}」を削除しますか？`,
          `Delete local project "${displayLabel}"?`
        );
      const detail = isSharedEntry
        ? localizeText(
          willDeleteOwnedSharedProject
            ? 'あなたが所有している共有プロジェクト本体を削除します。この操作は取り消せません。'
            : '共有一覧から外します。共有自体には影響しません。',
          willDeleteOwnedSharedProject
            ? 'This permanently deletes the shared project you own. This action cannot be undone.'
            : 'This removes it from your shared project list only. The shared project itself remains available.'
        )
        : localizeText(
          'この操作は取り消せません。',
          'This action cannot be undone.'
        );
      if (config?.message instanceof HTMLElement) {
        config.message.textContent = message;
      }
      if (config?.detail instanceof HTMLElement) {
        config.detail.textContent = detail;
      }
      if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
        resolve(window.confirm(`${message}\n${detail}`));
        return;
      }
      let settled = false;
      const cleanup = result => {
        if (settled) {
          return;
        }
        settled = true;
        config?.cancel?.removeEventListener('click', onCancel);
        config?.confirm?.removeEventListener('click', onConfirm);
        dialog.removeEventListener('cancel', onDialogCancel);
        dialog.removeEventListener('close', onDialogClose);
        resolve(result);
      };
      const onCancel = () => {
        if (dialog.open) dialog.close();
        cleanup(false);
      };
      const onConfirm = () => {
        if (dialog.open) dialog.close();
        cleanup(true);
      };
      const onDialogCancel = event => {
        event.preventDefault();
        if (dialog.open) dialog.close();
        cleanup(false);
      };
      const onDialogClose = () => {
        cleanup(dialog.returnValue === 'confirm');
      };
      config?.cancel?.addEventListener('click', onCancel, { once: true });
      config?.confirm?.addEventListener('click', onConfirm, { once: true });
      dialog.addEventListener('cancel', onDialogCancel, { once: true });
      dialog.addEventListener('close', onDialogClose, { once: true });
      dialog.showModal();
      window.requestAnimationFrame(() => {
        config?.confirm?.focus?.({ preventScroll: true });
      });
    });
  }

  function setupRecentProjectDeleteConfirmDialog() {
    const dialog = dom.recentProjectDeleteConfirm?.dialog;
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
      if (dialog) {
        dialog.hidden = true;
      }
      return;
    }
    dom.recentProjectDeleteConfirm?.cancel?.addEventListener('click', () => {
      if (dialog.open) {
        dialog.close();
      }
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      if (dialog.open) {
        dialog.close();
      }
    });
  }

  function openShareStartConfirmDialog() {
    return new Promise(resolve => {
      if (!SHARED_PROJECTS_ENABLED) {
        showSharedRuntimeBlockedStatus();
        resolve(false);
        return;
      }
      const config = dom.shareStartConfirm;
      const dialog = config?.dialog;
      if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
        resolve(window.confirm(localizeText(
          'このプロジェクトを共有しますか？ 共有を開始すると、このプロジェクトは継続して同期されます。',
          'Share this project? Once sharing starts, this project will continue syncing.'
        )));
        return;
      }
      let settled = false;
      const cleanup = result => {
        if (settled) {
          return;
        }
        settled = true;
        config?.cancel?.removeEventListener('click', onCancel);
        config?.confirm?.removeEventListener('click', onConfirm);
        dialog.removeEventListener('cancel', onDialogCancel);
        dialog.removeEventListener('close', onDialogClose);
        resolve(result);
      };
      const onCancel = () => {
        if (dialog.open) dialog.close();
        cleanup(false);
      };
      const onConfirm = () => {
        if (dialog.open) dialog.close();
        cleanup(true);
      };
      const onDialogCancel = event => {
        event.preventDefault();
        if (dialog.open) dialog.close();
        cleanup(false);
      };
      const onDialogClose = () => {
        cleanup(dialog.returnValue === 'confirm');
      };
      config?.cancel?.addEventListener('click', onCancel, { once: true });
      config?.confirm?.addEventListener('click', onConfirm, { once: true });
      dialog.addEventListener('cancel', onDialogCancel, { once: true });
      dialog.addEventListener('close', onDialogClose, { once: true });
      dialog.showModal();
      window.requestAnimationFrame(() => {
        config?.confirm?.focus?.({ preventScroll: true });
      });
    });
  }

  function setupShareStartConfirmDialog() {
    const dialog = dom.shareStartConfirm?.dialog;
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
      if (dialog) {
        dialog.hidden = true;
      }
      return;
    }
    dom.shareStartConfirm?.cancel?.addEventListener('click', () => {
      if (dialog.open) {
        dialog.close();
      }
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      if (dialog.open) {
        dialog.close();
      }
    });
  }

  function openSharedProjectLimitDialog(maxSharedProjects = getMaxSharedProjectCount()) {
    const config = dom.sharedProjectLimit;
    const dialog = config?.dialog;
    const {
      ownedProjectCount,
      effectiveLimit,
    } = getSharedProjectOwnershipStatus();
    const message = localizeText(
      '共有プロジェクトは上限以上のため開けません',
      'Shared projects cannot be opened because you are at or above the limit'
    );
    const detail = buildSharedProjectOpenBlockedMessage({
      effectiveLimit: Math.max(1, effectiveLimit || maxSharedProjects),
      ownedProjectCount,
    });
    if (config?.message instanceof HTMLElement) {
      config.message.textContent = message;
    }
    if (config?.detail instanceof HTMLElement) {
      config.detail.textContent = detail;
    }
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
      window.alert(`${message}\n${detail}`);
      showStartupScreen();
      return;
    }
    if (dialog.open) {
      return;
    }
    dialog.showModal();
    window.requestAnimationFrame(() => {
      config?.manage?.focus?.({ preventScroll: true });
    });
  }

  function closeSharedProjectLimitDialog() {
    const dialog = dom.sharedProjectLimit?.dialog;
    if (dialog instanceof HTMLDialogElement && dialog.open) {
      dialog.close();
    }
  }

  function setupSharedProjectLimitDialog() {
    const config = dom.sharedProjectLimit;
    const dialog = config?.dialog;
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
      if (dialog) {
        dialog.hidden = true;
      }
      return;
    }
    config?.cancel?.addEventListener('click', () => {
      closeSharedProjectLimitDialog();
    });
    config?.manage?.addEventListener('click', () => {
      closeSharedProjectLimitDialog();
      showStartupScreen();
      updateAutosaveStatus(
        localizeText('一覧の × ボタンで不要な共有プロジェクトを削除できます', 'Use the x button in the list to remove an old shared project'),
        'info'
      );
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeSharedProjectLimitDialog();
    });
  }

  function setSharedProjectCreationFailureReason(reason = '', detail = '') {
    lastSharedProjectCreationFailureReason = String(reason || '').trim();
    lastSharedProjectCreationFailureDetail = String(detail || '').trim();
  }

  function clearSharedProjectCreationFailureReason() {
    setSharedProjectCreationFailureReason('', '');
  }

  function getSharedProjectCreationFailureReason(fallbackReason = '', fallbackDetail = '') {
    return {
      reason: lastSharedProjectCreationFailureReason || String(fallbackReason || '').trim(),
      detail: lastSharedProjectCreationFailureDetail || String(fallbackDetail || '').trim(),
    };
  }

  function openSharedProjectCreateFailureDialog({
    title = '',
    reason = '',
    detail = '',
    localCreated = true,
    appendLocalState = true,
  } = {}) {
    const resolvedTitle = String(title || '').trim() || localizeText(
      '共有プロジェクトを作成できませんでした',
      'Could Not Create Shared Project'
    );
    const resolvedReason = String(reason || '').trim() || localizeText(
      '共有プロジェクトとして作成できませんでした。',
      'The project could not be created as a shared project.'
    );
    const localStateText = localCreated
      ? localizeText('ローカルプロジェクトとして作成済みです。', 'It was created as a local project.')
      : localizeText('ローカルプロジェクトの作成も完了していません。', 'The local project was not created either.');
    const rawDetail = String(detail || '').trim();
    const resolvedDetail = appendLocalState
      ? (rawDetail ? `${localStateText}\n${rawDetail}` : localStateText)
      : rawDetail;
    const config = dom.sharedProjectCreateFailure;
    const dialog = config?.dialog;
    const messageText = resolvedDetail ? `${resolvedReason}\n${resolvedDetail}` : resolvedReason;
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function' || dom.newProject?.dialog?.open) {
      window.alert(messageText);
      return;
    }
    if (config?.title instanceof HTMLElement) {
      config.title.textContent = resolvedTitle;
    }
    if (config?.message instanceof HTMLElement) {
      config.message.textContent = resolvedReason;
    }
    if (config?.detail instanceof HTMLElement) {
      config.detail.textContent = resolvedDetail;
    }
    if (config?.close instanceof HTMLButtonElement) {
      config.close.onclick = () => {
        if (dialog.open) {
          dialog.close();
        }
      };
    }
    dialog.oncancel = event => {
      event.preventDefault();
      if (dialog.open) {
        dialog.close();
      }
    };
    if (!dialog.open) {
      dialog.showModal();
    }
    window.requestAnimationFrame(() => {
      config?.close?.focus?.({ preventScroll: true });
    });
  }

  async function hasVisibleLocalRecentProjects() {
    const entries = await loadRecentProjectsMetadata();
    return entries.some(entry => entry && !isSharedRecentProjectEntry(entry));
  }

  async function maybeOpenSharedInviteFailureDialog({ reason = '', detail = '' } = {}) {
    const hasLocalProjects = await hasVisibleLocalRecentProjects();
    if (hasLocalProjects) {
      return false;
    }
    openSharedProjectCreateFailureDialog({
      title: localizeText('共有プロジェクトを開けませんでした', 'Could Not Open Shared Project'),
      reason: String(reason || '').trim() || localizeText(
        '共有リンクからプロジェクトを読み込めませんでした。',
        'The project could not be loaded from the shared link.'
      ),
      detail: String(detail || '').trim() || localizeText(
        '端末内に通常プロジェクトがないため、共有リンクを確認してからもう一度開いてください。',
        'There are no local projects on this device, so check the shared link and try opening it again.'
      ),
      localCreated: false,
      appendLocalState: false,
    });
    return true;
  }

  async function createSharedProjectFromNewProject({
    name,
    width,
    height,
    palettePreset = newProjectPalettePresetId,
    promptExportDirectory = false,
  } = {}) {
    clearSharedProjectCreationFailureReason();
    const localCreated = await createNewProjectAsTab({
      name,
      width,
      height,
      palettePreset,
      promptExportDirectory,
    });
    if (!localCreated) {
      return {
        localCreated: false,
        sharedCreated: false,
        failureReason: localizeText(
          'ローカルプロジェクトを作成できませんでした。',
          'The local project could not be created.'
        ),
        failureDetail: localizeText(
          `キャンバスサイズは${MIN_CANVAS_SIZE}〜${MAX_CANVAS_SIZE}の範囲で指定してください。`,
          `Set the canvas size between ${MIN_CANVAS_SIZE} and ${MAX_CANVAS_SIZE}.`
        ),
      };
    }
    let sharedCreated = false;
    try {
      sharedCreated = await createSharedProjectFromCurrentDocument();
    } catch (error) {
      setSharedProjectCreationFailureReason(
        localizeText('共有プロジェクト作成中にエラーが発生しました。', 'An error occurred while creating the shared project.'),
        String(error?.message || error || '')
      );
    }
    const failure = sharedCreated
      ? { reason: '', detail: '' }
      : getSharedProjectCreationFailureReason(
        localizeText('共有プロジェクトとして作成できませんでした。', 'The project could not be created as a shared project.'),
        localizeText(
          'ログイン状態、ネットワーク、共有プロジェクト上限、Supabase設定を確認してください。',
          'Check sign-in state, network, shared project limit, and Supabase settings.'
        )
      );
    return {
      localCreated: true,
      sharedCreated: Boolean(sharedCreated),
      failureReason: failure.reason,
      failureDetail: failure.detail,
    };
  }

  async function handleNewProjectSubmit() {
    if (newProjectSubmitBusy) {
      return;
    }
    const config = dom.newProject;
    if (config?.form && typeof config.form.reportValidity === 'function') {
      if (!config.form.reportValidity()) {
        return;
      }
    }
    newProjectSubmitBusy = true;
    try {
      const rawName = config?.nameInput?.value ?? state.documentName;
      const name = normalizeDocumentName(rawName);
      const widthValue = config?.widthInput?.value;
      const heightValue = config?.heightInput?.value;
      const palettePresetValue = config?.palettePreset?.value;
      const width = Number(widthValue);
      const height = Number(heightValue);
      const selectedCreateMode = dom.newProject?.createMode instanceof HTMLSelectElement
        ? dom.newProject.createMode.value
        : 'local';
      const shouldCreateShared = SHARED_PROJECTS_ENABLED && (
        selectedCreateMode === 'shared'
        || Boolean(pendingNewProjectCreateShared)
      );
      const shouldAppendAsTab = Boolean(pendingNewProjectAppendAsTab);
      let created = false;
      let createdLocalProject = false;
      let sharedCreationFailure = null;
      if (shouldCreateShared) {
        const result = await createSharedProjectFromNewProject({
          name,
          width,
          height,
          palettePreset: palettePresetValue,
          promptExportDirectory: false,
        });
        created = Boolean(result?.sharedCreated);
        createdLocalProject = Boolean(result?.localCreated);
        if (!created) {
          sharedCreationFailure = {
            reason: result?.failureReason || '',
            detail: result?.failureDetail || '',
            localCreated: createdLocalProject,
          };
        }
      } else if (shouldAppendAsTab) {
        created = await createNewProjectAsTab({
          name,
          width,
          height,
          palettePreset: palettePresetValue,
          promptExportDirectory: false,
        });
      } else {
        created = await createNewProject({
          name,
          width,
          height,
          palettePreset: palettePresetValue,
          promptExportDirectory: false,
        });
      }
      if (created || createdLocalProject) {
        if (config?.nameInput) {
          config.nameInput.value = extractDocumentBaseName(name);
        }
        closeNewProjectDialog();
        if (projectHomeVisible) {
          hideProjectHomeScreen();
        }
        if (sharedCreationFailure) {
          openSharedProjectCreateFailureDialog(sharedCreationFailure);
        }
      } else if (!shouldCreateShared) {
        window.alert(`キャンバスサイズは${MIN_CANVAS_SIZE}〜${MAX_CANVAS_SIZE}の数値で入力してください。`);
      } else if (sharedCreationFailure) {
        openSharedProjectCreateFailureDialog(sharedCreationFailure);
      }
    } finally {
      newProjectSubmitBusy = false;
    }
  }

  async function promptNewProjectFallback({ appendAsTab = false, createShared = false } = {}) {
    if (!ensureCurrentClientCanReplaceActiveProject()) {
      return;
    }
    const name = window.prompt('ファイル名を入力してください', state.documentName || DEFAULT_DOCUMENT_NAME);
    if (name === null) return;
    const widthRaw = window.prompt(`キャンバスの横幅 (${MIN_CANVAS_SIZE}〜${MAX_CANVAS_SIZE})`, String(state.width));
    if (widthRaw === null) return;
    const heightRaw = window.prompt(`キャンバスの縦幅 (${MIN_CANVAS_SIZE}〜${MAX_CANVAS_SIZE})`, String(state.height));
    if (heightRaw === null) return;
    const width = Number(widthRaw);
    const height = Number(heightRaw);
    let created = false;
    let createdLocalProject = false;
    let sharedCreationFailure = null;
    if (SHARED_PROJECTS_ENABLED && createShared) {
      const result = await createSharedProjectFromNewProject({
        name,
        width,
        height,
        promptExportDirectory: false,
      });
      created = Boolean(result?.sharedCreated);
      createdLocalProject = Boolean(result?.localCreated);
      if (!created) {
        sharedCreationFailure = {
          reason: result?.failureReason || '',
          detail: result?.failureDetail || '',
          localCreated: createdLocalProject,
        };
      }
    } else if (appendAsTab) {
      created = await createNewProjectAsTab({
        name,
        width,
        height,
        promptExportDirectory: false,
      });
    } else {
      created = await createNewProject({
        name,
        width,
        height,
        promptExportDirectory: false,
      });
    }
    if (!created && !(SHARED_PROJECTS_ENABLED && createShared)) {
      window.alert(`キャンバスサイズは${MIN_CANVAS_SIZE}〜${MAX_CANVAS_SIZE}の数値で入力してください。`);
    } else if ((created || createdLocalProject) && projectHomeVisible) {
      hideProjectHomeScreen();
    }
    if (sharedCreationFailure) {
      openSharedProjectCreateFailureDialog(sharedCreationFailure);
    }
  }

  async function ensureExportDirectoryForNewProject() {
    if (!EXPORT_DIRECTORY_SUPPORTED || exportDirectoryHandle) {
      return;
    }
    if (pendingExportDirectoryHandle) {
      const restored = await attemptExportDirectoryReauthorization();
      if (restored || exportDirectoryHandle) {
        return;
      }
    }
    if (typeof window.showDirectoryPicker !== 'function') {
      return;
    }
    exportDirectorySetupDismissed = false;
    updateExportFolderStatus(
      localizeText(
        '新規作成: 画像/GIFの保存先フォルダを選択してください',
        'New project: choose a folder for image/GIF exports'
      ),
      'info'
    );
    const bound = await requestExportDirectoryBinding();
    if (!bound && !exportDirectoryHandle) {
      updateExportFolderStatus(
        localizeText(
          '新規作成: 保存先フォルダは未設定のまま続行します（保存時に選択可能）',
          'New project: continuing without a fixed export folder (you can choose on each save)'
        ),
        'warn'
      );
    }
  }

  async function createNewProject({
    name,
    width,
    height,
    palettePreset = newProjectPalettePresetId,
    promptExportDirectory = false,
    ensureTab = true,
  }) {
    if (!ensureCurrentClientCanReplaceActiveProject()) {
      return false;
    }
    const widthNumber = lockedCanvasWidth !== null ? lockedCanvasWidth : Number(width);
    const heightNumber = lockedCanvasHeight !== null ? lockedCanvasHeight : Number(height);
    if (!Number.isFinite(widthNumber) || !Number.isFinite(heightNumber)) {
      return false;
    }
    if (promptExportDirectory) {
      try {
        await ensureExportDirectoryForNewProject();
      } catch (error) {
        console.warn('Failed to prepare export directory during new project creation', error);
      }
    }
    if (ensureTab) {
      const closedCurrentProject = await closeAllOpenProjectTabsForProjectReplacement({ flushAutosave: true, showHome: false });
      if (!closedCurrentProject) {
        return false;
      }
    }
    const clampedWidth = clamp(Math.round(widthNumber), MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
    const clampedHeight = clamp(Math.round(heightNumber), MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
    const normalizedPalettePreset = normalizeNewProjectPalettePreset(
      palettePreset,
      newProjectPalettePresetId || NEW_PROJECT_PALETTE_PRESET_DEFAULT
    );
    setNewProjectPalettePresetId(normalizedPalettePreset);
    const snapshot = createInitialState({
      width: clampedWidth,
      height: clampedHeight,
      name,
      uiTheme: state.uiTheme,
      palettePreset: normalizedPalettePreset,
    });

    applyHistorySnapshot(snapshot);
    setCurrentPalettePresetId(normalizedPalettePreset, { syncControl: true });
    history.past = [];
    history.future = [];
    history.pending = null;
    clearTimelapseRecording({ silent: true, scope: 'all' });
    ensureTimelapseStartCapture();
    resetDocumentUnsavedChanges();
    updateHistoryButtons();
    resetExportScaleDefaults();
    syncPixfindSnapshotAfterDocumentReset();
    setTrackedProjectDotBaseline(snapshot, null);
    resetOpenedDocumentViewport({ defer: true });

    autosaveHandle = null;
    pendingAutosaveHandle = null;
    clearPendingPermissionListener();
    setActiveAutosaveProjectId(createAutosaveProjectId());
    clearActiveSharedProjectSession();
    storeMultiProjectKey('');
    syncMultiProjectKeyInputValues('', { preserveFocused: false });
    markAutosaveDirty();
    if (AUTOSAVE_SUPPORTED && autosaveWriteTimer !== null) {
      window.clearTimeout(autosaveWriteTimer);
      autosaveWriteTimer = null;
    }
    let savedImmediately = false;
    if (AUTOSAVE_SUPPORTED) {
      for (let attempt = 0; attempt < NEW_PROJECT_IMMEDIATE_AUTOSAVE_ATTEMPTS && !savedImmediately; attempt += 1) {
        try {
          savedImmediately = await writeAutosaveSnapshot(true);
        } catch (error) {
          console.warn('Immediate autosave after creating a new project failed', error);
          savedImmediately = false;
        }
      }
    }
    if (savedImmediately) {
      updateAutosaveStatus('自動保存: 新規プロジェクトを端末内に保存しました', 'success');
    } else if (AUTOSAVE_SUPPORTED) {
      scheduleAutosaveSnapshot();
      updateAutosaveStatus('自動保存: 新規プロジェクトの即時保存に失敗したため再試行します', 'warn');
    } else {
      updateAutosaveStatus('自動保存: このブラウザでは利用できません', 'warn');
    }
    if (ensureTab) {
      resetOpenProjectTabsToCurrentProject({
        source: 'new-project',
        projectId: autosaveProjectId,
      });
    }
    scheduleSessionPersist();
    return true;
  }

  function createStartupQuickProjectName() {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    return normalizeDocumentName(`${DEFAULT_DOCUMENT_BASENAME}_${yyyy}${mm}${dd}_${hh}${mi}`);
  }

  function setStartupQuickSetupStatus(message, tone = 'info') {
    const node = dom.startup?.quickSetupStatus;
    if (!(node instanceof HTMLElement)) {
      return;
    }
    node.textContent = message;
    if (tone && tone !== 'info') {
      node.dataset.tone = tone;
    } else {
      delete node.dataset.tone;
    }
  }

  async function runStartupQuickSetup() {
    const quickButton = dom.startup?.quickSetupButton;
    if (!(quickButton instanceof HTMLButtonElement) || quickButton.disabled) {
      return;
    }
    quickButton.disabled = true;
    quickButton.setAttribute('aria-busy', 'true');
    try {
      setStartupQuickSetupStatus(localizeText('かんたん初期設定: 新規作成を準備しています…', 'Quick setup: preparing a new project...'));
      const created = await createNewProject({
        name: createStartupQuickProjectName(),
        width: lockedCanvasWidth !== null ? lockedCanvasWidth : DEFAULT_CANVAS_SIZE,
        height: lockedCanvasHeight !== null ? lockedCanvasHeight : DEFAULT_CANVAS_SIZE,
        promptExportDirectory: true,
      });
      if (!created) {
        setStartupQuickSetupStatus(localizeText('かんたん初期設定に失敗しました。通常の「新規作成」をお試しください。', 'Quick setup failed. Please try "New Project".'), 'error');
        return;
      }
      setStartupQuickSetupStatus(localizeText('かんたん初期設定が完了しました。', 'Quick setup completed.'), 'success');
      hideStartupScreen();
    } catch (error) {
      console.warn('Startup quick setup failed', error);
      setStartupQuickSetupStatus(localizeText('かんたん初期設定に失敗しました。通常の「新規作成」をお試しください。', 'Quick setup failed. Please try "New Project".'), 'error');
    } finally {
      quickButton.removeAttribute('aria-busy');
      quickButton.disabled = false;
    }
  }

  function hasDismissedStartupScreen() {
    if (!canUseSessionStorage) {
      return false;
    }
    try {
      return window.localStorage.getItem(STARTUP_SCREEN_DISMISSED_KEY) === '1';
    } catch (error) {
      return false;
    }
  }

  function markStartupScreenDismissed() {
    if (!canUseSessionStorage) {
      return;
    }
    try {
      window.localStorage.setItem(STARTUP_SCREEN_DISMISSED_KEY, '1');
    } catch (error) {
      // Ignore localStorage errors.
    }
  }

  function normalizeStartupScreenMode(mode) {
    return mode === STARTUP_SCREEN_MODE_APPEND_TAB
      ? STARTUP_SCREEN_MODE_APPEND_TAB
      : STARTUP_SCREEN_MODE_DEFAULT;
  }

  function setStartupScreenMode(mode) {
    startupScreenMode = normalizeStartupScreenMode(mode);
    const container = dom.startup?.screen;
    if (container instanceof HTMLElement) {
      container.dataset.mode = startupScreenMode;
    }
  }

  function isStartupScreenAppendTabMode() {
    return startupScreenMode === STARTUP_SCREEN_MODE_APPEND_TAB;
  }

  function showStartupScreen(options = {}) {
    const container = dom.startup?.screen;
    if (!container) {
      return;
    }
    hideProjectHomeScreen();
    const nextMode = normalizeStartupScreenMode(options?.mode);
    setStartupScreenMode(nextMode);
    if (AUTOSAVE_SUPPORTED) {
      refreshRecentProjectsUI().catch(error => {
        console.warn('Failed to refresh recent projects', error);
      });
    } else if (dom.startup?.recentSection) {
      dom.startup.recentSection.hidden = true;
    }
    if (startupVisible) {
      return;
    }
    startupVirtualCursorState = state.showVirtualCursor;
    if (state.showVirtualCursor) {
      setVirtualCursorEnabled(false, { persist: false });
    }
    startupVisible = true;
    container.hidden = false;
    container.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-startup-active');
    window.requestAnimationFrame(() => {
      queueStartupRecentAdRender();
      container.focus?.({ preventScroll: true });
      const startupTargets = [
        dom.startup?.resumeButton,
        dom.startup?.newButton,
        dom.startup?.openButton,
        dom.startup?.skipButton,
      ];
      const defaultTarget = startupTargets.find(target => target instanceof HTMLElement && !target.hasAttribute('disabled')) || container;
      defaultTarget?.focus?.({ preventScroll: true });
    });
  }

  function queueStartupRecentAdRender() {
    const adTargets = [
      {
        screen: dom.startup?.screen,
        section: dom.startup?.recentSection,
        container: dom.startup?.recentAdContainer,
        slot: dom.startup?.recentAdSlot,
      },
    ];
    document.querySelectorAll('.startup-recent-card__ad-ins').forEach(slot => {
      const card = slot.closest('.startup-recent-card--ad');
      const section = slot.closest('.startup-screen__recent, .project-home-screen__recent');
      const screen = slot.closest('.startup-screen, .project-home-screen');
      adTargets.push({
        screen,
        section,
        container: card,
        slot,
      });
    });
    if (window.__PIXIEED_ADS_DISABLED__ || window.pixieedAdFree?.state?.isActive) {
      adTargets.forEach(target => {
        if (target.container instanceof HTMLElement) {
          target.container.hidden = true;
        }
      });
      return;
    }
    adTargets.forEach(target => {
      const screen = target.screen;
      const section = target.section;
      const container = target.container;
      const adSlot = target.slot;
      if (!(screen instanceof HTMLElement) || screen.hidden || !(section instanceof HTMLElement) || section.hidden || !(container instanceof HTMLElement) || !(adSlot instanceof HTMLElement)) {
        return;
      }
      container.hidden = false;
      if (adSlot.dataset.renderPending === '1') {
        return;
      }
      if (adSlot.dataset.loaded === '1' || adSlot.getAttribute('data-adsbygoogle-status') === 'done') {
        return;
      }
      if (!adSlot.classList.contains('adsbygoogle')) {
        adSlot.classList.add('adsbygoogle');
      }

      const getWidth = () => {
        try {
          const rect = adSlot.getBoundingClientRect();
          return (rect && rect.width) || adSlot.clientWidth || adSlot.offsetWidth || 0;
        } catch (error) {
          return adSlot.clientWidth || adSlot.offsetWidth || 0;
        }
      };

      let attempts = 0;
      const MAX_ATTEMPTS = 24;
      adSlot.dataset.renderPending = '1';
      const renderWhenReady = () => {
        if (!(screen instanceof HTMLElement) || screen.hidden || !(section instanceof HTMLElement) || section.hidden) {
          delete adSlot.dataset.renderPending;
          return;
        }
        const width = getWidth();
        if (width <= 0) {
          attempts += 1;
          if (attempts < MAX_ATTEMPTS) {
            window.requestAnimationFrame(renderWhenReady);
            return;
          }
          delete adSlot.dataset.renderPending;
          return;
        }
        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          adSlot.dataset.loaded = '1';
        } catch (error) {
          delete adSlot.dataset.renderPending;
          return;
        }
        delete adSlot.dataset.renderPending;
        startupRecentAdRequested = true;
      };

      window.requestAnimationFrame(renderWhenReady);
    });
  }

  function hideStartupScreen() {
    const container = dom.startup?.screen;
    if (!container || !startupVisible) {
      return;
    }
    markStartupScreenDismissed();
    startupVisible = false;
    container.hidden = true;
    container.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-startup-active');
    if (startupVirtualCursorState === true) {
      setVirtualCursorEnabled(true, { persist: false });
    }
    startupVirtualCursorState = null;
    if (lensImportRequested) {
      window.history.replaceState({}, document.title, window.location.href);
      lensImportRequested = false;
    }
    setStartupScreenMode(STARTUP_SCREEN_MODE_DEFAULT);
  }

  function setupProjectHomeScreen() {
    const screen = dom.projectHomeScreen;
    if (!(screen instanceof HTMLElement) || screen.dataset.bound === 'true') {
      return;
    }
    screen.dataset.bound = 'true';
    dom.projectHomeNew?.addEventListener('click', () => {
      openNewProjectDialog({ dismissStartup: false, appendAsTab: false });
    });
    dom.projectHomeOpen?.addEventListener('click', async () => {
      const opened = await openDocumentDialog({ mode: EXTERNAL_IMPORT_MODE_NEW_PROJECT });
      if (opened) {
        hideProjectHomeScreen();
      }
    });
    dom.controls.projectHomeApplyAccessCode?.addEventListener('click', async () => {
      const openedShared = SHARED_PROJECTS_ENABLED
        ? await openSharedProjectFromHomeInput()
        : false;
      if (openedShared) {
        return;
      }
      updateAutosaveStatus(
        localizeText('コード適用は現在停止中です。', 'Code application is currently disabled.'),
        'info'
      );
    });
    dom.projectHomeRecentList?.addEventListener('click', async event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) {
        return;
      }
      const deleteButton = target.closest('button[data-startup-recent-delete-id]');
      if (deleteButton instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        const projectId = deleteButton.dataset.startupRecentDeleteId || '';
        if (!projectId) {
          return;
        }
        const entry = recentProjectsCache.get(projectId) || null;
        const displayLabel = extractDocumentBaseName(entry?.fileName || entry?.name || DEFAULT_DOCUMENT_NAME);
        const isSharedEntry = isSharedRecentProjectEntry(entry);
        const ownsSharedProject = isSharedEntry
          ? await resolveSharedRecentProjectOwnedByCurrentUser(entry)
          : false;
        const accepted = await openRecentProjectDeleteConfirmDialog(entry, {
          deletesOwnedSharedProject: ownsSharedProject,
        });
        if (!accepted) {
          return;
        }
        const card = deleteButton.closest('.startup-recent-card');
        const openButton = card instanceof HTMLElement
          ? card.querySelector('button[data-startup-recent-open-id]')
          : null;
        deleteButton.disabled = true;
        if (openButton instanceof HTMLButtonElement) {
          openButton.disabled = true;
        }
        try {
          let deletedSharedProjectBackend = false;
          if (isSharedEntry && ownsSharedProject) {
            deletedSharedProjectBackend = await deleteOwnedSharedProjectFromBackend(entry);
            if (!deletedSharedProjectBackend) {
              hideSharedProjectFromRecentSync(entry?.sharedProjectKey || '');
            }
          }
          const deletesOwnedSharedProject = isSharedEntry && deletedSharedProjectBackend;
          if (isSharedEntry && !deletesOwnedSharedProject) {
            hideSharedProjectFromRecentSync(entry?.sharedProjectKey || '');
          }
          const removed = await removeRecentProjectEntry(projectId);
          if (removed) {
            if (deletesOwnedSharedProject && isSharedEntry) {
              await purgeDeletedSharedProjectLocalReferences(entry?.sharedProjectKey || '', projectId);
            }
            updateAutosaveStatus(
              deletesOwnedSharedProject
                ? localizeText(
                  `共有プロジェクトを削除しました (${displayLabel})`,
                  `Deleted shared project (${displayLabel})`
                )
                : isSharedEntry
                  ? localizeText(
                    `共有プロジェクトを一覧から外しました (${displayLabel})`,
                    `Removed shared project from list (${displayLabel})`
                  )
                  : localizeText(
                    `端末内プロジェクトを削除しました (${displayLabel})`,
                    `Deleted local project (${displayLabel})`
                  ),
              'info'
            );
            if (deletesOwnedSharedProject) {
              await enforceSharedProjectOwnershipLimit();
            }
          } else if (deletesOwnedSharedProject && isSharedEntry) {
            await purgeDeletedSharedProjectLocalReferences(entry?.sharedProjectKey || '', projectId);
            await enforceSharedProjectOwnershipLimit();
          } else if (AUTOSAVE_SUPPORTED) {
            refreshRecentProjectsUI().catch(error => {
              console.warn('Failed to refresh recent projects', error);
            });
          }
        } catch (error) {
          console.warn('Failed to remove recent project', error);
          updateAutosaveStatus(
            localizeText(
              '端末内プロジェクトを削除できませんでした',
              'Failed to delete local project'
            ),
            'error'
          );
          deleteButton.disabled = false;
          if (openButton instanceof HTMLButtonElement) {
            openButton.disabled = false;
          }
        }
        return;
      }

      const openButton = target.closest('button[data-startup-recent-open-id]');
      if (!(openButton instanceof HTMLButtonElement)) {
        return;
      }
      const projectId = openButton.dataset.startupRecentOpenId || '';
      const entry = projectId ? recentProjectsCache.get(projectId) : null;
      if (!entry) {
        if (AUTOSAVE_SUPPORTED) {
          refreshRecentProjectsUI().catch(error => {
            console.warn('Failed to refresh recent projects', error);
          });
        }
        return;
      }
      openButton.disabled = true;
      const closedCurrentProject = await closeAllOpenProjectTabsForProjectReplacement({ flushAutosave: true, showHome: false });
      if (!closedCurrentProject) {
        openButton.disabled = false;
        updateAutosaveStatus(
          localizeText('現在のプロジェクトを保存できなかったため、切り替えを中止しました', 'Project switch was canceled because the current project could not be saved'),
          'error'
        );
        return;
      }
      const success = await openRecentProject(entry, {
        hideStartup: false,
        replaceOpenProjectTabs: true,
      });
      if (success) {
        hideProjectHomeScreen();
      } else {
        openButton.disabled = false;
        setProjectHomeVisible(true, { refresh: false });
      }
    });
  }

  async function maybeRestoreAutosaveProjectOnStartup() {
    if (!AUTOSAVE_SUPPORTED || reloadSnapshotRestored) {
      return false;
    }
    if (readMultiInviteFromUrl()) {
      return false;
    }
    const recentEntries = await loadRecentProjectsMetadata();
    const limitedEntries = enforceSharedRecentProjectLimit(recentEntries);
    setRecentProjectsCache(limitedEntries);
    if (!limitedEntries.length) {
      return false;
    }
    const requestedProjectId = normalizeAutosaveProjectId(
      readReloadTargetProjectId()
      || startupAutosaveRestoreProjectId
      || autosaveProjectId
      || ''
    );
    const targetEntry = requestedProjectId
      ? (recentProjectsCache.get(requestedProjectId) || limitedEntries.find(entry => normalizeAutosaveProjectId(entry?.id || '') === requestedProjectId) || null)
      : (limitedEntries[0] || null);
    if (!targetEntry) {
      return false;
    }
    if (SHARED_PROJECTS_ENABLED && isSharedRecentProjectEntry(targetEntry)) {
      storePendingSharedInvite({
        inviteToken: targetEntry.sharedProjectInviteToken || '',
        projectKey: targetEntry.sharedProjectKey || '',
        requestedRole: targetEntry.sharedRoleHint || 'guest',
        autoJoin: targetEntry.sharedAutoJoin !== false,
        source: 'startup-reopen',
      });
      if (!(await ensureSharedProjectAuthenticatedStart({ requireLogin: true }))) {
        return false;
      }
      if (!await ensureSharedProjectBackendSession()) {
        return false;
      }
    }
    const restored = await openRecentProject(targetEntry, { hideStartup: true, silent: true });
    if (restored) {
      clearReloadTargetProjectId();
      updateAutosaveStatus(
        localizeText('自動保存: 端末内プロジェクトを復元しました', 'Autosave: restored local project'),
        'success'
      );
      startupAutosaveRestoreProjectId = '';
      return true;
    }
    return false;
  }

  async function maybeRestoreSharedProjectOnStartup() {
    if (!SHARED_PROJECTS_ENABLED) {
      startupSharedReloadProjectKey = '';
      startupSharedReloadRevision = 0;
      startupSharedReloadStructureRevision = 0;
      return false;
    }
    const restoredProjectKey = normalizeMultiProjectKey(startupSharedReloadProjectKey || '');
    if (startupRestoreCancelRequested || !restoredProjectKey || readMultiInviteFromUrl()) {
      return false;
    }
    setStartupProgressLabel(localizeText('共有プロジェクトへ復帰中…', 'Reopening shared project...'));
    try {
      const entries = await loadRecentProjectsMetadata();
      if (startupRestoreCancelRequested) {
        return false;
      }
      const limitedEntries = enforceSharedRecentProjectLimit(entries);
      setRecentProjectsCache(limitedEntries);
      let sharedEntry = getCurrentSharedRecentProjectEntry(restoredProjectKey);
      if (!sharedEntry) {
        sharedEntry = normalizeSharedRecentProjectEntry(
          limitedEntries.find(entry => (
            isSharedRecentProjectEntry(entry)
            && normalizeMultiProjectKey(entry?.sharedProjectKey || '') === restoredProjectKey
          )) || {
            sharedProjectKey: restoredProjectKey,
            sharedProjectId: buildSharedRecentProjectId(restoredProjectKey),
            id: buildSharedRecentProjectId(restoredProjectKey),
            name: restoredProjectKey,
            sharedRoleHint: 'guest',
            sharedAutoJoin: false,
            sharedProjectRevision: startupSharedReloadRevision,
            sharedProjectStructureRevision: startupSharedReloadStructureRevision,
          }
        );
      }
      if (!accountState.isLoggedIn || accountState.isAnonymous) {
        storePendingSharedInvite({
          inviteToken: sharedEntry?.sharedProjectInviteToken || '',
          projectKey: restoredProjectKey,
          requestedRole: sharedEntry?.sharedRoleHint || 'guest',
          autoJoin: sharedEntry?.sharedAutoJoin !== false,
          source: 'reload-shared',
        });
      }
      if (!(await ensureSharedProjectAuthenticatedStart({ requireLogin: true }))) {
        return false;
      }
      if (startupRestoreCancelRequested) {
        return false;
      }
      await initPixieedAccount();
      if (!await ensureSharedProjectBackendSession()) {
        return false;
      }
      if (startupRestoreCancelRequested) {
        return false;
      }
      await ensureNoLegacyMultiSessionForSharedProject();
      if (startupRestoreCancelRequested) {
        return false;
      }
      const opened = sharedEntry
        ? await openSharedRecentProject(sharedEntry, {
          hideStartup: true,
          silent: true,
          skipLatestRefresh: true,
        })
        : await openSharedProjectCanonical({
            projectKey: restoredProjectKey,
            requestedRole: 'guest',
            autoJoin: false,
            reason: 'reload-shared',
            hideStartup: true,
            silent: true,
          });
      if (opened) {
        clearReloadTargetProjectId();
        startupSharedReloadProjectKey = '';
        startupSharedReloadRevision = 0;
        startupSharedReloadStructureRevision = 0;
        startupAutosaveRestoreProjectId = '';
        updateAutosaveStatus(
          localizeText('共有プロジェクト: 再読み込み前のプロジェクトへ復帰しました', 'Shared project: reopened the project from before reload'),
          'success'
        );
        return true;
      }
    } catch (error) {
      console.warn('Failed to reopen shared project after reload', error);
    }
    return false;
  }

  function hasSeenUpdateToast(updateId = '') {
    if (!canUseSessionStorage) {
      return false;
    }
    const normalizedUpdateId = typeof updateId === 'string' ? updateId.trim() : '';
    if (!normalizedUpdateId) {
      return false;
    }
    try {
      if (window.localStorage.getItem(`${UPDATE_TOAST_SEEN_PREFIX}${normalizedUpdateId}`) === '1') {
        return true;
      }
      return window.localStorage.getItem(STARTUP_UPDATE_TOAST_HIDDEN_KEY) === normalizedUpdateId;
    } catch (error) {
      return false;
    }
  }

  function markUpdateToastSeen(updateId = '') {
    if (!canUseSessionStorage) {
      return;
    }
    const normalizedUpdateId = typeof updateId === 'string' ? updateId.trim() : '';
    if (!normalizedUpdateId) {
      return;
    }
    try {
      window.localStorage.setItem(`${UPDATE_TOAST_SEEN_PREFIX}${normalizedUpdateId}`, '1');
      window.localStorage.setItem(STARTUP_UPDATE_TOAST_HIDDEN_KEY, normalizedUpdateId);
    } catch (error) {
      // Ignore localStorage errors.
    }
  }

  function setUpdateToastVisibility(visible, { markSeen = false } = {}) {
    const updateToast = dom.startup?.updateToast;
    if (!updateToast) {
      return;
    }
    const shouldShow = Boolean(visible);
    updateToast.hidden = !shouldShow;
    updateToast.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    if (shouldShow && markSeen) {
      markUpdateToastSeen(updateToast.dataset.updateId || '');
    }
  }

  function showUpdateToast({ manual = false } = {}) {
    const updateToast = dom.startup?.updateToast;
    if (updateToast?.dataset.updatePublished === 'false') {
      hideUpdateToast();
      return;
    }
    setUpdateToastVisibility(true, { markSeen: !manual });
  }

  function hideUpdateToast() {
    setUpdateToastVisibility(false);
  }

  function setupStartupScreen() {
    const container = dom.startup?.screen;
    if (!container) {
      return;
    }
    bindCoreProjectActionButtons();
    getUpdateHistoryEntries();
    if (dom.startup?.hint) {
      dom.startup.hint.textContent = AUTOSAVE_SUPPORTED
        ? localizeText(
          '前回の作業はこの端末に自動保存されます。すぐ描くなら「最新の端末内プロジェクトを開く」を使ってください。',
          'Your work is autosaved on this device. Use "Open Latest Local Project" to continue quickly.'
        )
        : localizeText(
          'このブラウザでは自動保存が利用できません。保存/出力から手動保存してください。',
          'Autosave is not available in this browser. Please save manually from Save / Export.'
        );
    }
    if (dom.startup?.quickSetupButton instanceof HTMLButtonElement) {
      if (AUTOSAVE_SUPPORTED) {
        dom.startup.quickSetupButton.textContent = localizeText('新規作成（かんたん開始）', 'New Project (Quick Start)');
        setStartupQuickSetupStatus(localizeText('新規作成すると、この端末に自動保存を開始します。', 'Creating a new project starts autosave on this device.'));
      } else {
        dom.startup.quickSetupButton.textContent = localizeText('新規作成（かんたん開始）', 'New Project (Quick Start)');
        setStartupQuickSetupStatus(
          localizeText(
            'このブラウザは自動保存未対応です。開始後は「保存/出力」から書き出してください。',
            'This browser does not support autosave. Please export manually after starting.'
          ),
          'warn'
        );
      }
    }
    const updateToast = dom.startup?.updateToast;
    if (updateToast) {
      hideUpdateToast();
    }
    dom.startup?.updateToastCloseButton?.addEventListener('click', () => {
      hideUpdateToast();
    });
    container.addEventListener('keydown', event => {
      if (!startupVisible) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        hideStartupScreen();
        return;
      }
      if (event.key === 'Tab') {
        const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const focusableElements = Array.from(container.querySelectorAll(focusableSelectors))
          .filter(element => !element.hasAttribute('disabled') && element.offsetParent !== null);
        if (!focusableElements.length) {
          event.preventDefault();
          container.focus();
          return;
        }
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first || document.activeElement === container) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
    dom.startup?.resumeButton?.addEventListener('click', async () => {
      const firstEntry = Array.from(recentProjectsCache.values())[0] || null;
      if (!firstEntry) {
        updateAutosaveStatus(
          localizeText(
            '端末内プロジェクトがありません。新規作成またはファイルを開いてください。',
            'No local project found. Create a new one or open a file.'
          ),
          'warn'
        );
        return;
      }
      const closedCurrentProject = await closeAllOpenProjectTabsForProjectReplacement({ flushAutosave: true, showHome: false });
      if (!closedCurrentProject) {
        updateAutosaveStatus(
          localizeText('現在のプロジェクトを保存できなかったため、切り替えを中止しました', 'Project switch was canceled because the current project could not be saved'),
          'error'
        );
        return;
      }
      const opened = await openRecentProject(firstEntry, { hideStartup: true, silent: true });
      if (!opened) {
        refreshRecentProjectsUI().catch(error => {
          console.warn('Failed to refresh recent projects', error);
        });
      }
    });
    dom.startup?.quickSetupButton?.addEventListener('click', async () => {
      await runStartupQuickSetup();
    });
    dom.startup?.skipButton?.addEventListener('click', () => {
      hideStartupScreen();
    });
    dom.globalLoadingIndicatorCancel?.addEventListener('click', () => {
      cancelStartupRestoreProgress('loading-indicator-cancel');
    });
    dom.startup?.recentList?.addEventListener('click', async event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) {
        return;
      }
      const deleteButton = target.closest('button[data-startup-recent-delete-id]');
      if (deleteButton instanceof HTMLButtonElement) {
        event.preventDefault();
        event.stopPropagation();
        const projectId = deleteButton.dataset.startupRecentDeleteId || '';
        if (!projectId) {
          return;
        }
        const entry = recentProjectsCache.get(projectId) || null;
        const displayLabel = extractDocumentBaseName(entry?.fileName || entry?.name || DEFAULT_DOCUMENT_NAME);
        const isSharedEntry = isSharedRecentProjectEntry(entry);
        const ownsSharedProject = isSharedEntry
          ? await resolveSharedRecentProjectOwnedByCurrentUser(entry)
          : false;
        const accepted = await openRecentProjectDeleteConfirmDialog(entry, {
          deletesOwnedSharedProject: ownsSharedProject,
        });
        if (!accepted) {
          return;
        }
        const card = deleteButton.closest('.startup-recent-card');
        const openButton = card instanceof HTMLElement
          ? card.querySelector('button[data-startup-recent-open-id]')
          : null;
        deleteButton.disabled = true;
        if (openButton instanceof HTMLButtonElement) {
          openButton.disabled = true;
        }
        try {
          let deletedSharedProjectBackend = false;
          if (isSharedEntry && ownsSharedProject) {
            deletedSharedProjectBackend = await deleteOwnedSharedProjectFromBackend(entry);
            if (!deletedSharedProjectBackend) {
              hideSharedProjectFromRecentSync(entry?.sharedProjectKey || '');
            }
          }
          const deletesOwnedSharedProject = isSharedEntry && deletedSharedProjectBackend;
          if (isSharedEntry && !deletesOwnedSharedProject) {
            hideSharedProjectFromRecentSync(entry?.sharedProjectKey || '');
          }
          const removed = await removeRecentProjectEntry(projectId);
          if (removed) {
            if (deletesOwnedSharedProject && isSharedEntry) {
              await purgeDeletedSharedProjectLocalReferences(entry?.sharedProjectKey || '', projectId);
            }
            updateAutosaveStatus(
              deletesOwnedSharedProject
                ? localizeText(
                  `共有プロジェクトを削除しました (${displayLabel})`,
                  `Deleted shared project (${displayLabel})`
                )
                : isSharedEntry
                  ? localizeText(
                    `共有プロジェクトを一覧から外しました (${displayLabel})`,
                    `Removed shared project from list (${displayLabel})`
                  )
                : localizeText(
                  `端末内プロジェクトを削除しました (${displayLabel})`,
                  `Deleted local project (${displayLabel})`
                ),
              'info'
            );
            if (deletesOwnedSharedProject) {
              await enforceSharedProjectOwnershipLimit();
            }
          } else if (deletesOwnedSharedProject && isSharedEntry) {
            await purgeDeletedSharedProjectLocalReferences(entry?.sharedProjectKey || '', projectId);
            await enforceSharedProjectOwnershipLimit();
          } else if (AUTOSAVE_SUPPORTED) {
            refreshRecentProjectsUI().catch(error => {
              console.warn('Failed to refresh recent projects', error);
            });
          }
        } catch (error) {
          console.warn('Failed to remove recent project', error);
          updateAutosaveStatus(
            localizeText(
              '端末内プロジェクトを削除できませんでした',
              'Failed to delete local project'
            ),
            'error'
          );
          deleteButton.disabled = false;
          if (openButton instanceof HTMLButtonElement) {
            openButton.disabled = false;
          }
        }
        return;
      }

      const openButton = target.closest('button[data-startup-recent-open-id]');
      if (!(openButton instanceof HTMLButtonElement)) {
        return;
      }
      const projectId = openButton.dataset.startupRecentOpenId || '';
      const entry = projectId ? recentProjectsCache.get(projectId) : null;
      if (!entry) {
        if (AUTOSAVE_SUPPORTED) {
          refreshRecentProjectsUI().catch(error => {
            console.warn('Failed to refresh recent projects', error);
          });
        }
        return;
      }
      openButton.disabled = true;
      const closedCurrentProject = await closeAllOpenProjectTabsForProjectReplacement({ flushAutosave: true, showHome: false });
      if (!closedCurrentProject) {
        openButton.disabled = false;
        updateAutosaveStatus(
          localizeText('現在のプロジェクトを保存できなかったため、切り替えを中止しました', 'Project switch was canceled because the current project could not be saved'),
          'error'
        );
        return;
      }
      const success = await openRecentProject(entry, { hideStartup: true, silent: true });
      if (!success) {
        openButton.disabled = false;
      }
    });
    if (AUTOSAVE_SUPPORTED) {
      refreshRecentProjectsUI().catch(error => {
        console.warn('Failed to refresh recent projects', error);
      });
      syncStartupResumeState(Array.from(recentProjectsCache.values()));
    } else if (dom.startup?.recentSection) {
      dom.startup.recentSection.hidden = true;
      syncStartupResumeState([]);
    }
  }


        return Object.freeze({
        syncNewProjectDialogModeText,
        syncNewProjectCreateModeButtons,
        setupHorizontalOverflowDebug,
        openNewProjectDialog,
        queueNewProjectAdRender,
        closeNewProjectDialog,
        setupGlobalHistoryConfirmDialog,
        openRecentProjectDeleteConfirmDialog,
        setupRecentProjectDeleteConfirmDialog,
        openShareStartConfirmDialog,
        setupShareStartConfirmDialog,
        openSharedProjectLimitDialog,
        closeSharedProjectLimitDialog,
        setupSharedProjectLimitDialog,
        setSharedProjectCreationFailureReason,
        clearSharedProjectCreationFailureReason,
        getSharedProjectCreationFailureReason,
        openSharedProjectCreateFailureDialog,
        hasVisibleLocalRecentProjects,
        maybeOpenSharedInviteFailureDialog,
        createSharedProjectFromNewProject,
        handleNewProjectSubmit,
        promptNewProjectFallback,
        ensureExportDirectoryForNewProject,
        createNewProject,
        createStartupQuickProjectName,
        setStartupQuickSetupStatus,
        runStartupQuickSetup,
        hasDismissedStartupScreen,
        markStartupScreenDismissed,
        normalizeStartupScreenMode,
        setStartupScreenMode,
        isStartupScreenAppendTabMode,
        showStartupScreen,
        queueStartupRecentAdRender,
        hideStartupScreen,
        setupProjectHomeScreen,
        maybeRestoreAutosaveProjectOnStartup,
        maybeRestoreSharedProjectOnStartup,
        hasSeenUpdateToast,
        markUpdateToastSeen,
        setUpdateToastVisibility,
        showUpdateToast,
        hideUpdateToast,
        setupStartupScreen,
        });
      }
    })(scope);
  }

  root.startupWorkflowUtils = Object.freeze({
    createStartupWorkflowUtils,
  });
})();
