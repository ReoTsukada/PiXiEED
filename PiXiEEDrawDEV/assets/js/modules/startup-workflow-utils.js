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
    if (!window.__PIXIEEDRAW_SHOULD_SHOW_MODAL_ADS__?.()) {
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
        const result = window.__PIXIEEDRAW_RENDER_AD_SLOT__?.(adSlot, {
          owner: 'new-project-dialog',
          reason: 'dialog-open',
        });
        if (!result?.ok) throw new Error(result?.reason || 'ERR_AD_SLOT_RENDER_FAILED');
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
      try {
        // A previous unsupported-dialog fallback can leave the element hidden.
        // `showModal()` does not clear that attribute, so make visibility part
        // of the confirmation dialog's opening contract.
        dialog.hidden = false;
        if (dialog.open) {
          dialog.close();
        }
      } catch (error) {
        console.warn('Failed to prepare recent project delete confirmation dialog', error);
        resolve(window.confirm(`${message}\n${detail}`));
        return;
      }
      config?.cancel?.addEventListener('click', onCancel, { once: true });
      config?.confirm?.addEventListener('click', onConfirm, { once: true });
      dialog.addEventListener('cancel', onDialogCancel, { once: true });
      dialog.addEventListener('close', onDialogClose, { once: true });
      try {
        dialog.showModal();
      } catch (error) {
        console.warn('Failed to open recent project delete confirmation dialog', error);
        cleanup(window.confirm(`${message}\n${detail}`));
        return;
      }
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
    console.info('[pixiedraw-dev:new-project]', { phase: 'new-project-submit' });
    const config = dom.newProject;
    if (config?.form && typeof config.form.reportValidity === 'function') {
      if (!config.form.reportValidity()) {
        console.info('[pixiedraw-dev:new-project]', { phase: 'new-project-validation-failed' });
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
        console.info('[pixiedraw-dev:new-project]', { phase: 'new-project-candidate-built' });
        console.info('[pixiedraw-dev:new-project]', { phase: 'new-project-commit-start' });
        created = await createNewProject({
          name,
          width,
          height,
          palettePreset: palettePresetValue,
          promptExportDirectory: false,
        });
      }
      if (created || createdLocalProject) {
        console.info('[pixiedraw-dev:new-project]', { phase: 'new-project-commit-success' });
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
        const invalidDimensions = !Number.isFinite(width)
          || !Number.isFinite(height)
          || width < MIN_CANVAS_SIZE
          || width > MAX_CANVAS_SIZE
          || height < MIN_CANVAS_SIZE
          || height > MAX_CANVAS_SIZE;
        console.info('[pixiedraw-dev:new-project]', {
          phase: 'new-project-failed',
          code: invalidDimensions ? 'invalid-canvas-size' : 'project-replacement-failed',
        });
        window.alert(invalidDimensions
          ? `キャンバスサイズは${MIN_CANVAS_SIZE}〜${MAX_CANVAS_SIZE}の数値で入力してください。`
          : '新規プロジェクトを作成できませんでした。現在のプロジェクトの保存状態を確認して、もう一度お試しください。');
      } else if (sharedCreationFailure) {
        openSharedProjectCreateFailureDialog(sharedCreationFailure);
      }
    } catch (error) {
      console.warn('New project submit failed', error);
      console.info('[pixiedraw-dev:new-project]', { phase: 'new-project-failed', code: String(error?.message || error || '') });
      throw error;
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
    // The active tab must be flushed before acquiring this lock. The tab lifecycle
    // intentionally rejects replacement while a project command is locked, so
    // locking the submit handler itself made every valid new-project request
    // reject its own tab-close step.
    const projectCreationLock = ensureTab
      ? acquireProjectCommandLock({ owner: 'new-project-create', command: 'create-new-project' })
      : null;
    if (ensureTab && !projectCreationLock?.ok) {
      return false;
    }
    try {
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
    let workspaceProjectHandle = null;
    if (window.PiXiEEDWorkspace) {
      try {
        workspaceProjectHandle = await window.PiXiEEDWorkspace.createProjectFileHandle(
          state.documentName || name || DEFAULT_DOCUMENT_NAME,
          { requestPermission: false }
        );
        if (workspaceProjectHandle) {
          autosaveHandle = workspaceProjectHandle;
          await storeAutosaveHandle?.(workspaceProjectHandle);
        }
      } catch (error) {
        console.warn('Failed to create project file in PiXiEED workspace', error);
        workspaceProjectHandle = null;
      }
    }
    clearActiveLocalProjectJournal?.();
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
        sourceStorageAdapterId: null,
        sourceKind: 'new',
        lastSavedStorageAdapterId: workspaceProjectHandle ? 'pixieedraw-v2-zip' : null,
        projectSaveHandleState: workspaceProjectHandle ? 'bound' : 'none',
        projectSaveHandle: workspaceProjectHandle,
        projectSaveHandleMeta: workspaceProjectHandle ? {
          fileName: workspaceProjectHandle.name || state.documentName || DEFAULT_DOCUMENT_NAME,
          handleKind: 'workspace-project-file',
          permissionState: 'granted',
          adapterId: 'pixieedraw-v2-zip',
          boundAt: new Date().toISOString(),
        } : null,
      });
      if (workspaceProjectHandle) {
        bindActiveProjectSaveHandle?.(workspaceProjectHandle, {
          fileName: workspaceProjectHandle.name || state.documentName || DEFAULT_DOCUMENT_NAME,
          handleKind: 'workspace-project-file',
          permissionState: 'granted',
          adapterId: 'pixieedraw-v2-zip',
          boundAt: new Date().toISOString(),
        }, { log: true });
      }
    }
    scheduleSessionPersist();
    return true;
    } finally {
      if (projectCreationLock?.ok) {
        releaseProjectCommandLock({ token: projectCreationLock.token, owner: projectCreationLock.owner });
      }
    }
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
    if (!window.__PIXIEEDRAW_SHOULD_SHOW_ADS__?.()) {
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
      if (adSlot.dataset.pixieedAdCard === 'true' && adSlot.dataset.visibilityObserved !== '1') {
        if (typeof window.IntersectionObserver === 'function') {
          const observer = new window.IntersectionObserver(entries => {
            if (!entries.some(entry => entry.isIntersecting)) {
              return;
            }
            observer.disconnect();
            adSlot.dataset.visibilityObserved = '1';
            const queue = () => queueStartupRecentAdRender();
            if (typeof window.requestIdleCallback === 'function') {
              window.requestIdleCallback(queue, { timeout: 1200 });
            } else {
              window.setTimeout(queue, 0);
            }
          }, { root: section.closest('.startup-recent-list') || null, threshold: 0.1 });
          observer.observe(container);
          adSlot.dataset.visibilityObserved = 'pending';
          return;
        }
        adSlot.dataset.visibilityObserved = '1';
      }
      if (adSlot.dataset.visibilityObserved === 'pending') {
        return;
      }
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
          const result = window.__PIXIEEDRAW_RENDER_AD_SLOT__?.(adSlot, {
            owner: 'startup-recent',
            reason: 'startup-recent-visible',
          });
          if (!result?.ok) throw new Error(result?.reason || 'ERR_AD_SLOT_RENDER_FAILED');
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
      // Keep the current project alive until the selected recent project has
      // actually been decoded. `openRecentProject` replaces the tab set only
      // after a successful load, so a corrupt/missing V2 record cannot leave
      // the user with an empty editor.
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
    const navigationEntry = typeof performance?.getEntriesByType === 'function'
      ? performance.getEntriesByType('navigation')[0]
      : null;
    const isSameTabReload = navigationEntry?.type === 'reload';
    if (!isSameTabReload) {
      const recoveryPayload = readReloadSessionSnapshotPayload();
      if (recoveryPayload?.unsaved && !isTinyStartupSnapshot(recoveryPayload.currentSnapshot)) {
        const action = await requestStartupRecoveryAction(recoveryPayload);
        if (action === 'restore') {
          const restored = restoreReloadSessionSnapshot();
          if (restored && recoveryPayload.projectId) {
            setActiveAutosaveProjectId(recoveryPayload.projectId);
          }
          return restored;
        }
        if (action === 'delete') {
          clearReloadRecoveryData();
          updateAutosaveStatus(localizeText('復帰データを削除しました', 'Recovery data deleted'), 'info');
        }
      }
      return false;
    }
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

  function requestStartupRecoveryAction(payload = null) {
    const dialog = dom.startupRecovery?.dialog;
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
      return Promise.resolve('later');
    }
    const snapshot = payload?.currentSnapshot || null;
    const projectName = normalizeDocumentName(snapshot?.documentName || DEFAULT_DOCUMENT_NAME);
    const savedAt = Number(payload?.at) > 0
      ? new Date(Number(payload.at)).toLocaleString()
      : '';
    if (dom.startupRecovery.message) {
      dom.startupRecovery.message.textContent = localizeText(
        `「${projectName}」の未保存作業が端末内に残っています。`,
        `Unsaved work for “${projectName}” remains on this device.`
      );
    }
    if (dom.startupRecovery.detail) {
      dom.startupRecovery.detail.textContent = localizeText(
        `${savedAt ? `復帰データ: ${savedAt}。` : ''}復帰しても保存先の .pixieedraw ファイルは自動で上書きしません。`,
        `${savedAt ? `Recovery data: ${savedAt}. ` : ''}Restoring does not automatically overwrite the destination .pixieedraw file.`
      );
    }
    return new Promise(resolve => {
      let settled = false;
      const finish = action => {
        if (settled) return;
        settled = true;
        dom.startupRecovery.later?.removeEventListener('click', onLater);
        dom.startupRecovery.restore?.removeEventListener('click', onRestore);
        dom.startupRecovery.delete?.removeEventListener('click', onDelete);
        dialog.removeEventListener('cancel', onCancel);
        dialog.removeEventListener('close', onClose);
        if (dialog.open) dialog.close();
        resolve(action);
      };
      const onLater = () => finish('later');
      const onRestore = () => finish('restore');
      const onDelete = () => finish('delete');
      const onCancel = event => {
        event.preventDefault();
        finish('later');
      };
      const onClose = () => finish('later');
      dom.startupRecovery.later?.addEventListener('click', onLater, { once: true });
      dom.startupRecovery.restore?.addEventListener('click', onRestore, { once: true });
      dom.startupRecovery.delete?.addEventListener('click', onDelete, { once: true });
      dialog.addEventListener('cancel', onCancel, { once: true });
      dialog.addEventListener('close', onClose, { once: true });
      dialog.showModal();
      dom.startupRecovery.restore?.focus();
    });
  }

  async function maybeRestoreSharedProjectOnStartup() {
    startupSharedReloadProjectKey = '';
    startupSharedReloadRevision = 0;
    startupSharedReloadStructureRevision = 0;
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

  let startupWorkspaceEntries = [];
  let startupWorkspaceRenderGeneration = 0;
  let startupWorkspaceMigrationPrompted = false;
  let startupWorkspaceMigrationPromise = null;

  function setStartupWorkspaceStatus(message, tone = 'info') {
    const node = dom.startup?.workspaceStatus;
    if (!(node instanceof HTMLElement)) return;
    node.textContent = message;
    if (tone && tone !== 'info') {
      node.dataset.tone = tone;
    } else {
      delete node.dataset.tone;
    }
  }

  function formatWorkspaceProjectSize(bytes) {
    const value = Math.max(0, Number(bytes) || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderStartupWorkspaceProjects(entries = []) {
    const list = dom.startup?.workspaceProjectList;
    if (!(list instanceof HTMLElement)) return;
    startupWorkspaceEntries = Array.isArray(entries) ? entries.slice() : [];
    const renderGeneration = ++startupWorkspaceRenderGeneration;
    list.replaceChildren();
    if (!startupWorkspaceEntries.length) {
      const empty = document.createElement('p');
      empty.className = 'startup-workspace__empty';
      empty.textContent = localizeText(
        'PiXiEEDフォルダ内に .pixieedraw プロジェクトがありません。',
        'No .pixieedraw projects were found in the PiXiEED folder.'
      );
      list.appendChild(empty);
      return;
    }
    startupWorkspaceEntries.forEach((entry, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'startup-workspace__project';
      button.dataset.workspaceProjectIndex = String(index);
      button.setAttribute('role', 'listitem');
      if (entry?.migrationRecovery !== true && Number(entry?.size) === 0) {
        button.title = localizeText(
          'このファイルは0バイトのため開けません。端末内の元データが残っている場合は「V2移行待ち」のカードから復旧してください。ファイルは自動削除しません。',
          'This file is empty and cannot be opened. If the original on-device data remains, recover it from the "Awaiting V2 migration" card. The file will not be deleted automatically.'
        );
      }
      if (entry?.migrationRecovery === true) {
        button.title = localizeText(
          `V2移行を完了できませんでした。元データは削除されていません。\n${entry?.migrationErrorCode || ''}: ${entry?.migrationErrorMessage || ''}`,
          `V2 migration could not be completed. The original data was not deleted.\n${entry?.migrationErrorCode || ''}: ${entry?.migrationErrorMessage || ''}`
        );
      }
      const thumbnail = document.createElement('span');
      thumbnail.className = 'startup-workspace__project-thumbnail';
      thumbnail.dataset.workspaceProjectThumbnail = String(index);
      const placeholder = document.createElement('span');
      placeholder.className = 'startup-workspace__project-thumbnail-placeholder';
      placeholder.textContent = 'PXD';
      thumbnail.appendChild(placeholder);
      if (entry?.migrationRecovery === true && typeof entry?.thumbnail === 'string' && entry.thumbnail) {
        const image = new Image();
        image.src = entry.thumbnail;
        image.alt = localizeText('端末内プロジェクトのサムネイル', 'Local project thumbnail');
        image.decoding = 'async';
        thumbnail.replaceChildren(image);
      }
      const details = document.createElement('span');
      details.className = 'startup-workspace__project-details';
      const name = document.createElement('span');
      name.className = 'startup-workspace__project-name';
      name.textContent = entry?.name || DEFAULT_DOCUMENT_NAME;
      const meta = document.createElement('span');
      meta.className = 'startup-workspace__project-meta';
      const modified = entry?.migrationRecovery === true && typeof entry?.updatedAt === 'string'
        ? new Date(entry.updatedAt).toLocaleString()
        : (Number(entry?.lastModified) > 0
            ? new Date(Number(entry.lastModified)).toLocaleString()
            : localizeText('更新日時不明', 'Unknown date'));
      meta.textContent = entry?.migrationRecovery === true
        ? `${modified} / ${localizeText('端末内・V2移行待ち', 'On device · awaiting V2 migration')}`
        : `${modified} / ${formatWorkspaceProjectSize(entry?.size)}`;
      const certification = document.createElement('span');
      certification.className = 'startup-workspace__project-certification is-checking';
      certification.dataset.workspaceProjectCertification = String(index);
      certification.textContent = entry?.migrationRecovery === true
        ? localizeText('復旧して開く', 'Open for recovery')
        : localizeText('確認中', 'Checking');
      certification.setAttribute('aria-label', entry?.migrationRecovery === true
        ? localizeText('端末内の元データを保持しています。開いて復旧できます。', 'The original on-device data is retained and can be opened for recovery.')
        : localizeText('PiXiEED公認状態を確認中', 'Checking PiXiEED certification'));
      if (entry?.migrationRecovery === true) {
        certification.className = 'startup-workspace__project-certification is-recovery';
      }
      details.append(name, meta, certification);
      button.append(thumbnail, details);
      list.appendChild(button);
    });
    void hydrateStartupWorkspaceProjectCards(startupWorkspaceEntries, renderGeneration);
  }

  function resolveWorkspaceProjectCertification(adapterId, manifest = null, packaged = null) {
    const originality = packaged?.canonicalSourceMetadata?.projectOriginality || null;
    const integrity = packaged?.session?.projectExportIntegrity || null;
    const summary = manifest?.certification && typeof manifest.certification === 'object'
      ? manifest.certification
      : {
          nativeCreated: originality?.saleEligibility === 'eligible'
            && originality?.createdWith === 'pixieedraw-native'
            && originality?.externalInputDetected !== true,
          externalInputDetected: originality?.externalInputDetected === true,
          completeProjectSave: integrity?.completeProjectSave === true,
          timelapseSynchronized: integrity?.timelapseSynchronized === true,
          saleCandidateDataComplete: integrity?.saleCandidateDataComplete === true,
        };
    const official = adapterId === 'pixieedraw-v2-zip'
      && summary.nativeCreated === true
      && summary.externalInputDetected !== true
      && summary.completeProjectSave === true
      && summary.timelapseSynchronized === true
      && summary.saleCandidateDataComplete === true;
    if (official) {
      return {
        state: 'official',
        label: localizeText('✓ PiXiEED公認', '✓ PiXiEED Certified'),
        description: localizeText(
          'PiXiEED内で新規作成され、外部入力なし・完全V2保存・タイムラプス同期済みです。',
          'Created in PiXiEED with no external input, complete V2 save, and synchronized timelapse.'
        ),
      };
    }
    if (summary.externalInputDetected === true) {
      return {
        state: 'external',
        label: localizeText('外部入力あり', 'External Input'),
        description: localizeText('外部画像・GIF・他形式由来のため、PiXiEED公認対象外です。', 'Not PiXiEED certified because external input was detected.'),
      };
    }
    return {
      state: 'unverified',
      label: localizeText('未認証', 'Unverified'),
      description: localizeText('公認に必要な制作元・完全保存・タイムラプス情報を確認できません。', 'Required origin, complete-save, or timelapse data could not be verified.'),
    };
  }

  async function inspectStartupWorkspaceProject(entry) {
    const file = entry?.file || (typeof entry?.handle?.getFile === 'function' ? await entry.handle.getFile() : null);
    if (!file) throw new Error('Workspace project file is unavailable');
    if (Number(file.size) === 0) {
      return {
        thumbnail: '',
        emptyFile: true,
        certification: {
          state: 'invalid',
          label: localizeText('空ファイル', 'Empty File'),
          description: localizeText(
            '0バイトのためプロジェクトデータを読み取れません。端末内の元データは自動削除されません。',
            'No project data can be read because the file is empty. Original on-device data is not deleted automatically.'
          ),
        },
      };
    }
    let adapterId = '';
    let manifest = null;
    if (typeof readProjectStorageManifestFromBlob === 'function') {
      const manifestResult = await readProjectStorageManifestFromBlob(file, { fileName: file.name || entry?.name || '' });
      adapterId = manifestResult?.adapterId || '';
      manifest = manifestResult?.manifest || null;
    }
    let packaged = null;
    let thumbnail = typeof manifest?.previewThumbnail === 'string' ? manifest.previewThumbnail : '';
    const needsPackagedInspection = !manifest?.certification || !thumbnail;
    if (needsPackagedInspection && typeof parseProjectStorageBlob === 'function') {
      const parsedResult = await parseProjectStorageBlob(file, { fileName: file.name || entry?.name || '' });
      adapterId = parsedResult?.adapterId || adapterId;
      packaged = parsedResult?.parsed && typeof parsedResult.parsed === 'object' ? parsedResult.parsed : null;
      thumbnail = thumbnail || (typeof packaged?.previewThumbnail === 'string' ? packaged.previewThumbnail : '');
      if (!thumbnail && packaged && typeof snapshotFromParsedDocumentValue === 'function' && typeof generateSnapshotThumbnail === 'function') {
        const snapshot = snapshotFromParsedDocumentValue(packaged)?.snapshot || null;
        if (snapshot) thumbnail = await generateSnapshotThumbnail(snapshot) || '';
      }
    }
    return {
      thumbnail,
      certification: resolveWorkspaceProjectCertification(adapterId, manifest, packaged),
    };
  }

  function updateStartupWorkspaceProjectCard(index, inspection, renderGeneration) {
    if (renderGeneration !== startupWorkspaceRenderGeneration) return;
    const list = dom.startup?.workspaceProjectList;
    if (!(list instanceof HTMLElement)) return;
    const thumbnail = list.querySelector(`[data-workspace-project-thumbnail="${index}"]`);
    if (thumbnail instanceof HTMLElement && inspection?.thumbnail) {
      const image = new Image();
      image.src = inspection.thumbnail;
      image.alt = localizeText('プロジェクトのサムネイル', 'Project thumbnail');
      image.decoding = 'async';
      thumbnail.replaceChildren(image);
    }
    const badge = list.querySelector(`[data-workspace-project-certification="${index}"]`);
    if (badge instanceof HTMLElement) {
      const certificationState = inspection?.certification?.state || 'unverified';
      const certificationLabel = inspection?.certification?.label || localizeText('未認証', 'Unverified');
      badge.className = `startup-workspace__project-certification is-${certificationState}`;
      badge.replaceChildren();
      if (certificationState === 'official') {
        const mark = new Image();
        mark.className = 'startup-workspace__project-certification-mark';
        mark.src = '../PiXiEEDEndorsed.png';
        mark.alt = '';
        mark.decoding = 'async';
        badge.appendChild(mark);
      }
      const label = document.createElement('span');
      label.textContent = certificationLabel;
      badge.appendChild(label);
      badge.title = inspection?.certification?.description || '';
      badge.setAttribute('aria-label', `${certificationLabel}: ${badge.title}`);
    }
  }

  async function hydrateStartupWorkspaceProjectCards(entries, renderGeneration) {
    for (let index = 0; index < entries.length; index += 1) {
      if (renderGeneration !== startupWorkspaceRenderGeneration) return;
      if (entries[index]?.migrationRecovery === true) continue;
      try {
        const inspection = await inspectStartupWorkspaceProject(entries[index]);
        updateStartupWorkspaceProjectCard(index, inspection, renderGeneration);
      } catch (error) {
        console.warn('[PiXiEED workspace] project card inspection failed', { name: entries[index]?.name || '', error });
        updateStartupWorkspaceProjectCard(index, {
          thumbnail: '',
          certification: resolveWorkspaceProjectCertification('', null, null),
        }, renderGeneration);
      }
      await new Promise(resolve => window.setTimeout(resolve, 0));
    }
  }

  function getLegacyPackagedProjectCollections(packaged = null) {
    const sheets = Array.isArray(packaged?.sheets)
      ? packaged.sheets.filter(sheet => sheet?.project && typeof sheet.project === 'object')
      : [];
    const canvases = Array.isArray(packaged?.document?.canvases)
      ? packaged.document.canvases.filter(canvas => canvas && typeof canvas === 'object')
      : [];
    const sheetHasMultipleCanvases = sheets.some(sheet => (
      Array.isArray(sheet?.project?.document?.canvases)
      && sheet.project.document.canvases.filter(canvas => canvas && typeof canvas === 'object').length > 1
    ));
    return {
      sheets,
      canvases,
      needsSplit: sheets.length > 1 || canvases.length > 1 || sheetHasMultipleCanvases,
    };
  }

  async function splitLegacyWorkspaceMigrationEntry(entry, packaged) {
    const collections = getLegacyPackagedProjectCollections(packaged);
    if (!collections.needsSplit || typeof migrateLegacyMultiProjectPackage !== 'function') {
      return false;
    }
    const result = await migrateLegacyMultiProjectPackage({
      sourceProjectId: entry?.id || '',
      sheets: collections.sheets,
      activeSheetId: packaged?.activeSheetId || '',
      sourceProject: packaged,
      canvases: collections.canvases,
      activeCanvasId: packaged?.document?.activeCanvasId || '',
    });
    if (result?.migrated === true || result?.reason === 'already-migrated') {
      return true;
    }
    throw new Error(`Legacy project split failed (${result?.reason || 'unknown'})`);
  }

  function mergePersistedTimelapseIntoSession(session, persistedByCanvas, canvasIds = []) {
    if (!session || typeof session !== 'object' || !persistedByCanvas || typeof persistedByCanvas !== 'object') {
      return false;
    }
    const allowedCanvasIds = new Set((Array.isArray(canvasIds) ? canvasIds : []).filter(Boolean));
    const sourceEntries = Object.entries(persistedByCanvas).filter(([canvasId]) => (
      !allowedCanvasIds.size || allowedCanvasIds.has(canvasId)
    ));
    if (!sourceEntries.length) return false;
    const timelapse = session.timelapse && typeof session.timelapse === 'object'
      ? session.timelapse
      : { byCanvas: {}, operationLogsByCanvas: {} };
    if (!timelapse.byCanvas || typeof timelapse.byCanvas !== 'object') {
      timelapse.byCanvas = {};
    }
    let mergedAny = false;
    sourceEntries.forEach(([canvasId, snapshots]) => {
      const serialized = typeof serializeProjectTimelapseSnapshotList === 'function'
        ? serializeProjectTimelapseSnapshotList(snapshots)
        : [];
      if (!serialized.length) return;
      const existing = Array.isArray(timelapse.byCanvas[canvasId]?.snapshots)
        ? timelapse.byCanvas[canvasId].snapshots
        : [];
      const seen = new Set();
      const merged = [...serialized, ...existing].filter(snapshot => {
        const key = `${snapshot?.width || 0}x${snapshot?.height || 0}:${snapshot?.pixels || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      timelapse.byCanvas[canvasId] = {
        warningShown: true,
        sampleStep: Math.max(1, Math.round(Number(timelapse.byCanvas[canvasId]?.sampleStep) || 1)),
        lastCaptureToken: Number.isFinite(Number(timelapse.byCanvas[canvasId]?.lastCaptureToken))
          ? Math.round(Number(timelapse.byCanvas[canvasId].lastCaptureToken))
          : -1,
        snapshots: merged,
      };
      mergedAny = true;
    });
    if (!mergedAny) return false;
    timelapse.enabled = true;
    timelapse.synchronization = {
      schemaVersion: 1,
      complete: true,
      synchronizedAt: new Date().toISOString(),
      persistedArchiveMerged: true,
    };
    session.timelapse = timelapse;
    return true;
  }

  async function mergeFileBackedTimelapseIntoPackaged(entry, packaged) {
    if (typeof loadPersistedTimelapseSnapshots !== 'function') return packaged;
    // Legacy production projects may predate the separate timelapse store, or
    // Safari may temporarily deny access to it. Missing optional archive data
    // must not make the drawable project itself impossible to migrate.
    const persistedByCanvas = await loadPersistedTimelapseSnapshots(entry?.id || '', { throwOnError: false });
    if (!persistedByCanvas || !Object.keys(persistedByCanvas).length) return packaged;
    const rootCanvasIds = Array.isArray(packaged?.document?.canvases)
      ? packaged.document.canvases.map(canvas => canvas?.id || '').filter(Boolean)
      : [];
    if (!packaged.session || typeof packaged.session !== 'object') packaged.session = {};
    mergePersistedTimelapseIntoSession(packaged.session, persistedByCanvas, rootCanvasIds);
    if (Array.isArray(packaged.sheets)) {
      packaged.sheets.forEach(sheet => {
        const project = sheet?.project;
        if (!project || typeof project !== 'object') return;
        if (!project.session || typeof project.session !== 'object') project.session = {};
        const canvasIds = Array.isArray(project?.document?.canvases)
          ? project.document.canvases.map(canvas => canvas?.id || '').filter(Boolean)
          : [];
        mergePersistedTimelapseIntoSession(project.session, persistedByCanvas, canvasIds);
      });
    }
    return packaged;
  }

  async function writePackagedProjectToWorkspace(workspace, entry, packaged) {
    if (typeof serializeProjectStorageSnapshot !== 'function') {
      throw new Error('V2 project serializer is unavailable');
    }
    const fileName = normalizeDocumentName(
      entry?.fileName
      || entry?.name
      || packaged?.document?.documentName
      || DEFAULT_DOCUMENT_NAME
    );
    let previewThumbnail = '';
    if (typeof snapshotFromParsedDocumentValue === 'function' && typeof generateSnapshotThumbnail === 'function') {
      try {
        const snapshot = snapshotFromParsedDocumentValue(packaged)?.snapshot || null;
        if (snapshot) previewThumbnail = await generateSnapshotThumbnail(snapshot) || '';
      } catch (error) {
        console.warn('[PiXiEED workspace] legacy thumbnail generation skipped', { projectId: entry?.id || '', error });
      }
    }
    const serialized = await serializeProjectStorageSnapshot({
      packaged,
      thumbnail: previewThumbnail,
    }, {
      fileNameBase: fileName,
      includeSheets: false,
      includeTimelapse: true,
      useWorker: true,
      preferredAdapterId: 'pixieedraw-v2-zip',
    });
    if (!(serialized?.blob instanceof Blob)) {
      throw new Error('V2 project serializer did not return a file');
    }
    const fileHandle = await workspace.createProjectFileHandle(fileName, { requestPermission: false });
    if (!fileHandle || typeof fileHandle.createWritable !== 'function') {
      throw new Error('Workspace project file could not be created');
    }
    try {
      const writable = await fileHandle.createWritable();
      try {
        await writable.write(serialized.blob);
        await writable.close();
      } catch (error) {
        try { await writable.abort?.(); } catch (_abortError) {}
        throw error;
      }
    } catch (error) {
      await workspace.removeProjectFile?.(fileHandle.name, { requestPermission: false });
      throw error;
    }
    return fileHandle.name || fileName;
  }

  function filterFilelessLocalProjects(entries, workspaceEntries = []) {
    const existingFileNames = new Set(
      (Array.isArray(workspaceEntries) ? workspaceEntries : [])
        .map(entry => String(entry?.name || '').trim().toLowerCase())
        .filter(Boolean)
    );
    return (Array.isArray(entries) ? entries : []).filter(entry => {
      if (!entry || !entry.id || isSharedRecentProjectEntry(entry)) return false;
      if (String(entry.workspaceFileName || '').trim()) return false;
      const fileName = normalizeDocumentName(entry.fileName || entry.name || DEFAULT_DOCUMENT_NAME).toLowerCase();
      return !existingFileNames.has(fileName);
    });
  }

  function classifyWorkspaceMigrationError(error) {
    const explicitCode = typeof error?.code === 'string' ? error.code.trim() : '';
    if (explicitCode) return explicitCode;
    const message = String(error?.message || error || '');
    if (/payload is unavailable/i.test(message)) return 'ERR_LEGACY_PAYLOAD_UNAVAILABLE';
    if (/serializer is unavailable|serializer did not return/i.test(message)) return 'ERR_V2_SERIALIZER_UNAVAILABLE';
    if (/file could not be created/i.test(message)) return 'ERR_WORKSPACE_FILE_CREATE_FAILED';
    if (/could not be removed/i.test(message)) return 'ERR_LEGACY_CLEANUP_FAILED';
    if (/still contains multiple projects/i.test(message)) return 'ERR_LEGACY_SPLIT_INCOMPLETE';
    const errorName = typeof error?.name === 'string' ? error.name.trim() : '';
    return errorName && errorName !== 'Error' ? errorName : 'ERR_V2_MIGRATION_FAILED';
  }

  async function migrateFilelessLocalProjectsToWorkspace(workspace, workspaceEntries = []) {
    if (startupWorkspaceMigrationPromise) return await startupWorkspaceMigrationPromise;
    startupWorkspaceMigrationPromise = (async () => {
      let entries = filterFilelessLocalProjects(await loadRecentProjectsMetadata(), workspaceEntries);
      if (!entries.length) {
        return { migrated: 0, failed: 0, declined: false, failedEntries: [] };
      }
      if (startupWorkspaceMigrationPrompted) {
        return {
          migrated: 0,
          failed: entries.length,
          declined: false,
          failedEntries: entries.map(entry => ({
            entry,
            code: 'ERR_V2_MIGRATION_RETRY_REQUIRED',
            message: 'Reload to retry V2 migration',
          })),
        };
      }
      startupWorkspaceMigrationPrompted = true;
      const accepted = window.confirm(localizeText(
        `端末内だけに保存されている旧プロジェクトが${entries.length}件あります。\n\n単一プロジェクト形式のV2へ変換して、PiXiEED/Projectsに実ファイルとして保存します。複数タブ・複数キャンバスは、それぞれ独立したV2ファイルへ分割します。元の端末内データは、対応するV2ファイルの保存に成功した後だけ削除します。\n\n変換を開始しますか？`,
        `${entries.length} legacy project(s) are stored only on this device.\n\nThey will be converted to single-project V2 files in PiXiEED/Projects. Multiple tabs and canvases will be split into separate V2 files. Original device data is removed only after its V2 file is saved successfully.\n\nStart conversion?`
      ));
      if (!accepted) {
        return {
          migrated: 0,
          failed: entries.length,
          declined: true,
          failedEntries: entries.map(entry => ({
            entry,
            code: 'V2_MIGRATION_DECLINED',
            message: 'V2 migration was not started',
          })),
        };
      }

      setStartupWorkspaceStatus(localizeText('端末内プロジェクトをV2へ変換しています…', 'Converting local projects to V2...'));
      for (const entry of entries) {
        try {
          const packaged = await loadRecentProjectPackagedPayload(entry);
          if (!packaged || typeof packaged !== 'object') continue;
          await mergeFileBackedTimelapseIntoPackaged(entry, packaged);
          await splitLegacyWorkspaceMigrationEntry(entry, packaged);
        } catch (error) {
          console.warn('[PiXiEED workspace] legacy project split failed', { projectId: entry.id, error });
        }
      }

      entries = filterFilelessLocalProjects(await loadRecentProjectsMetadata(), workspaceEntries);
      let migrated = 0;
      let failed = 0;
      const failedEntries = [];
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        setStartupWorkspaceStatus(localizeText(
          `端末内プロジェクトをV2へ変換しています… ${index + 1}/${entries.length}`,
          `Converting local projects to V2... ${index + 1}/${entries.length}`
        ));
        try {
          const packaged = await loadRecentProjectPackagedPayload(entry);
          if (!packaged || typeof packaged !== 'object') {
            throw new Error('Local project payload is unavailable');
          }
          await mergeFileBackedTimelapseIntoPackaged(entry, packaged);
          const collections = getLegacyPackagedProjectCollections(packaged);
          if (collections.needsSplit) {
            throw new Error('Legacy project still contains multiple projects');
          }
          const workspaceFileName = await writePackagedProjectToWorkspace(workspace, entry, packaged);
          const removed = await removeRecentProjectEntry(entry.id);
          if (!removed) {
            await workspace.removeProjectFile?.(workspaceFileName, { requestPermission: false });
            throw new Error('Original local project could not be removed');
          }
          migrated += 1;
        } catch (error) {
          failed += 1;
          failedEntries.push({
            entry,
            code: classifyWorkspaceMigrationError(error),
            message: String(error?.message || error || 'V2 migration failed'),
          });
          console.warn('[PiXiEED workspace] local project migration failed', { projectId: entry.id, error });
        }
      }
      if (typeof refreshRecentProjectsUI === 'function') {
        await refreshRecentProjectsUI().catch(error => {
          console.warn('Failed to refresh recent projects after workspace migration', error);
        });
      }
      return { migrated, failed, declined: false, failedEntries };
    })();
    try {
      return await startupWorkspaceMigrationPromise;
    } finally {
      startupWorkspaceMigrationPromise = null;
    }
  }

  async function refreshStartupWorkspaceProjects({ requestPermission = false } = {}) {
    const workspace = window.PiXiEEDWorkspace;
    if (!workspace) {
      setStartupWorkspaceStatus(
        localizeText('この環境では共通ワークスペースを初期化できません。', 'The shared workspace could not be initialized.'),
        'warn'
      );
      return false;
    }
    setStartupWorkspaceStatus(localizeText('PiXiEEDフォルダを確認しています…', 'Checking the PiXiEED folder...'));
    const handle = await workspace.connect({ requestPermission });
    if (!handle) {
      const status = workspace.getStatus();
      setStartupWorkspaceStatus(
        status.lastErrorCode === 'projects-folder-selected'
          ? localizeText(
              'Projectsフォルダが選択されました。既存のPiXiEEDフォルダ、またはPiXiEEDを作成する親フォルダを選んでください。',
              'The Projects folder was selected. Choose the existing PiXiEED folder or the parent folder where PiXiEED should be created.'
            )
          : status.directoryPickerSupported
          ? localizeText('未接続です。「保存場所を選んで接続」を押してください。', 'Not connected. Select “Choose Save Location”.')
          : localizeText(
              'このブラウザでは端末フォルダへの直接接続に対応していません。端末内プロジェクトは削除されません。',
              'This browser does not support direct folder access. On-device projects will not be deleted.'
            ),
        'warn'
      );
      return false;
    }
    const projectsDirectory = await workspace.getSubdirectory?.('Projects', {
      create: true,
      requestPermission: false,
    });
    if (!projectsDirectory) {
      setStartupWorkspaceStatus(
        localizeText(
          '接続先に PiXiEED/Projects を作成できませんでした。別の親フォルダを選び直してください。元データは削除されていません。',
          'PiXiEED/Projects could not be created in the selected location. Choose a different parent folder. Original data was not deleted.'
        ),
        'error'
      );
      return false;
    }
    const existingEntries = await workspace.listProjects({ requestPermission: false, includeWorkspaceRoot: true });
    const migration = await migrateFilelessLocalProjectsToWorkspace(workspace, existingEntries);
    const entries = migration.migrated > 0
      ? await workspace.listProjects({ requestPermission: false, includeWorkspaceRoot: true })
      : existingEntries;
    const recoveryEntries = (Array.isArray(migration.failedEntries) ? migration.failedEntries : [])
      .map(failure => ({
        ...(failure?.entry || {}),
        name: failure?.entry?.fileName || failure?.entry?.name || DEFAULT_DOCUMENT_NAME,
        migrationRecovery: true,
        migrationErrorCode: failure?.code || 'ERR_V2_MIGRATION_FAILED',
        migrationErrorMessage: failure?.message || '',
      }));
    const firstFailureCode = recoveryEntries[0]?.migrationErrorCode || '';
    renderStartupWorkspaceProjects(entries.concat(recoveryEntries));
    setStartupWorkspaceStatus(
      migration.failed > 0
        ? localizeText(
          `接続済み / ファイル${entries.length}件（V2移行 成功${migration.migrated}・未完了${migration.failed}${firstFailureCode ? ` / ${firstFailureCode}` : ''}）`,
          `Connected / ${entries.length} file(s) (V2 migrated ${migration.migrated}, incomplete ${migration.failed}${firstFailureCode ? ` / ${firstFailureCode}` : ''})`
        )
        : localizeText(
          `PiXiEEDフォルダに接続済み / ${entries.length}件${migration.migrated ? `（V2移行 ${migration.migrated}件）` : ''}`,
          `PiXiEED folder connected / ${entries.length} project(s)${migration.migrated ? ` (V2 migrated ${migration.migrated})` : ''}`
        ),
      migration.failed > 0 ? 'warn' : 'success'
    );
    return true;
  }

  function setupStartupWorkspace() {
    const workspace = window.PiXiEEDWorkspace;
    const connectButton = dom.startup?.workspaceConnect;
    const projectList = dom.startup?.workspaceProjectList;
    if (!workspace || !(projectList instanceof HTMLElement) || projectList.dataset.bound === 'true') {
      return;
    }
    projectList.dataset.bound = 'true';
    const status = workspace.getStatus();
    if (connectButton instanceof HTMLButtonElement) {
      connectButton.hidden = !status.directoryPickerSupported;
      connectButton.addEventListener('click', async () => {
        const accepted = window.confirm(localizeText(
          '保存場所を設定します。\n\n・すでに PiXiEED フォルダがある場合は、その PiXiEED フォルダを選択してください。\n・まだない場合は「書類」など作成先の親フォルダを選択してください。その中に PiXiEED/Projects を作成します。\n・Projects フォルダそのものは選択しないでください。\n\nV2ファイルの作成に成功するまで、端末内の元プロジェクトは削除しません。\n\n保存場所の選択へ進みますか？',
          'Set the save location.\n\n• If a PiXiEED folder already exists, select that PiXiEED folder.\n• Otherwise, select a parent location such as Documents. PiXiEED/Projects will be created inside it.\n• Do not select the Projects folder itself.\n\nOriginal on-device projects will not be deleted until their V2 files are created successfully.\n\nContinue to location selection?'
        ));
        if (!accepted) return;
        connectButton.disabled = true;
        try {
          await refreshStartupWorkspaceProjects({ requestPermission: true });
        } finally {
          connectButton.disabled = false;
        }
      });
    }
    projectList.addEventListener('click', async event => {
      const target = event.target instanceof Element
        ? event.target.closest('button[data-workspace-project-index]')
        : null;
      if (!(target instanceof HTMLButtonElement)) return;
      const entry = startupWorkspaceEntries[Number(target.dataset.workspaceProjectIndex)] || null;
      if (entry?.migrationRecovery === true) {
        target.disabled = true;
        try {
          const opened = await openRecentProject(entry, {
            hideStartup: true,
            silent: false,
            allowProjectMismatchLoad: true,
            replaceOpenProjectTabs: true,
          });
          if (opened) {
            hideStartupScreen();
            hideProjectHomeScreen();
          }
        } finally {
          target.disabled = false;
        }
        return;
      }
      if (Number(entry?.size) === 0) {
        setStartupWorkspaceStatus(
          localizeText(
            'このファイルは0バイトのため開けません。端末内の元データが残っている場合は「V2移行待ち」のカードから復旧してください。ファイルは削除していません。',
            'This file is empty and cannot be opened. If the original on-device data remains, recover it from the "Awaiting V2 migration" card. The file has not been deleted.'
          ),
          'error'
        );
        return;
      }
      const item = entry?.handle || entry?.file || null;
      if (!item) return;
      target.disabled = true;
      try {
        const opened = await openDocumentAsNewProject(item, {
          source: entry.handle ? 'workspace' : 'workspace-folder-import',
        });
        if (opened) {
          hideStartupScreen();
          hideProjectHomeScreen();
        }
      } finally {
        target.disabled = false;
      }
    });
    void refreshStartupWorkspaceProjects({ requestPermission: false });
  }

  function setupStartupScreen() {
    const container = dom.startup?.screen;
    if (!container) {
      return;
    }
    bindCoreProjectActionButtons();
    setupStartupWorkspace();
    getUpdateHistoryEntries();
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
    if (dom.startup?.recentSection) {
      dom.startup.recentSection.hidden = true;
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
