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

  function openNewProjectDialog({ dismissStartup = false, createShared = false } = {}) {
    if (!ensureCurrentClientCanReplaceActiveProject()) {
      return;
    }
    const requestedSharedCreate = SHARED_PROJECTS_ENABLED && Boolean(createShared);
    const config = dom.newProject;
    if (!config) {
      void promptNewProjectFallback({ createShared: requestedSharedCreate });
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
    pendingNewProjectCreateShared = false;
    syncNewProjectDialogModeText();
    if (dismissStartup) {
      hideStartupScreen();
    }
    void promptNewProjectFallback({ createShared: requestedSharedCreate });
  }

  function queueNewProjectAdRender() {
    if (!window.__PIXIEEDRAW_SHOULD_SHOW_MODAL_ADS__?.('new-project-dialog')) {
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
    const localCreated = await createNewProject({
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
    console.info('[pixiedraw:new-project]', { phase: 'new-project-submit' });
    const config = dom.newProject;
    if (config?.form && typeof config.form.reportValidity === 'function') {
      if (!config.form.reportValidity()) {
        console.info('[pixiedraw:new-project]', { phase: 'new-project-validation-failed' });
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
      } else {
        console.info('[pixiedraw:new-project]', { phase: 'new-project-candidate-built' });
        console.info('[pixiedraw:new-project]', { phase: 'new-project-commit-start' });
        created = await createNewProject({
          name,
          width,
          height,
          palettePreset: palettePresetValue,
          promptExportDirectory: false,
        });
      }
      if (created || createdLocalProject) {
        console.info('[pixiedraw:new-project]', { phase: 'new-project-commit-success' });
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
        console.info('[pixiedraw:new-project]', {
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
      console.info('[pixiedraw:new-project]', { phase: 'new-project-failed', code: String(error?.message || error || '') });
      throw error;
    } finally {
      newProjectSubmitBusy = false;
    }
  }

  async function promptNewProjectFallback({ createShared = false } = {}) {
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

  async function createNewProject({
    name,
    width,
    height,
    palettePreset = newProjectPalettePresetId,
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
    // The old tab/session still points at the project that was just closed.
    // Reset the new document's dirty tokens without mirroring them until the
    // new autosave id, tab, and active-project session are committed together.
    resetDocumentUnsavedChanges({ syncSession: false });
    updateHistoryButtons();
    resetExportScaleDefaults();
    syncPixfindSnapshotAfterDocumentReset();
    setTrackedProjectDotBaseline(snapshot, null);
    resetOpenedDocumentViewport({ defer: true });

    const newProjectId = createAutosaveProjectId();
    setActiveAutosaveProjectId(newProjectId);
    clearActiveLocalProjectJournal?.();
    clearActiveSharedProjectSession();
    storeMultiProjectKey('');
    syncMultiProjectKeyInputValues('', { preserveFocused: false });
    if (ensureTab) {
      resetOpenProjectTabsToCurrentProject({
        source: 'new-project',
        projectId: newProjectId,
        sourceStorageAdapterId: null,
        sourceKind: 'new',
        lastSavedStorageAdapterId: null,
      });
    }
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
      updateAutosaveStatus(
        localizeText('自動保存: 新規プロジェクトを端末内V2へ保存しました', 'Autosave: saved the new project to on-device V2 storage'),
        'success'
      );
    } else if (AUTOSAVE_SUPPORTED) {
      scheduleAutosaveSnapshot();
      updateAutosaveStatus('自動保存: 新規プロジェクトの即時保存に失敗したため再試行します', 'warn');
    } else {
      updateAutosaveStatus('自動保存: このブラウザでは利用できません', 'warn');
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

  function normalizeStartupScreenMode() {
    return STARTUP_SCREEN_MODE_DEFAULT;
  }

  function setStartupScreenMode(mode) {
    startupScreenMode = normalizeStartupScreenMode(mode);
    const container = dom.startup?.screen;
    if (container instanceof HTMLElement) {
      container.dataset.mode = startupScreenMode;
    }
  }

  function showStartupScreen(options = {}) {
    const container = dom.startup?.screen;
    if (!container) {
      return;
    }
    const refreshWorkspace = options?.refreshWorkspace !== false;
    hideProjectHomeScreen();
    const nextMode = normalizeStartupScreenMode(options?.mode);
    setStartupScreenMode(nextMode);
    if (startupVisible) {
      if (refreshWorkspace) {
        void refreshStartupWorkspaceProjects({ requestPermission: false }).catch(error => {
          console.warn('[PiXiEED workspace] project list refresh failed', error);
        });
      }
      return;
    }
    startupVirtualCursorState = state.showVirtualCursor;
    if (state.showVirtualCursor) {
      setVirtualCursorEnabled(false, { persist: false });
    }
    startupVisible = true;
    container.inert = false;
    container.hidden = false;
    container.removeAttribute('aria-hidden');
    document.body.classList.add('is-startup-active');
    if (refreshWorkspace) {
      void refreshStartupWorkspaceProjects({ requestPermission: false }).catch(error => {
        console.warn('[PiXiEED workspace] project list refresh failed', error);
      });
    }
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
      const section = slot.closest('.startup-screen__recent, .startup-workspace, .project-home-screen__recent');
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
      if ((adSlot.dataset.pixieedAdCard === 'true' || adSlot.dataset.pixieedProjectFeedAd === 'true')
        && adSlot.dataset.visibilityObserved !== '1') {
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
          }, { root: section.closest('.startup-recent-list, .startup-workspace__list') || null, threshold: 0.1 });
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
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && container.contains(activeElement)) {
      if (dom.stage instanceof HTMLElement) {
        dom.stage.focus({ preventScroll: true });
      }
      if (container.contains(document.activeElement)) {
        activeElement.blur();
      }
    }
    container.inert = true;
    container.hidden = true;
    container.removeAttribute('aria-hidden');
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
      openNewProjectDialog({ dismissStartup: false });
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
  let startupWorkspaceSearchQuery = '';
  let startupWorkspaceMigrationPrompted = false;

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

  function buildDeviceLocalWorkspaceEntries(entries = []) {
    return (Array.isArray(entries) ? entries : [])
      .filter(entry => entry?.id && !isSharedRecentProjectEntry(entry))
      .map(entry => ({
        ...entry,
        name: entry.fileName || entry.name || DEFAULT_DOCUMENT_NAME,
        deviceLocalProject: true,
        lastModified: Number.isFinite(Date.parse(entry.updatedAt || ''))
          ? Date.parse(entry.updatedAt)
          : 0,
      }));
  }

  async function loadDeviceLocalWorkspaceEntries() {
    return buildDeviceLocalWorkspaceEntries(await loadRecentProjectsMetadata());
  }

  function renderStartupWorkspaceProjects(entries = []) {
    const list = dom.startup?.workspaceProjectList;
    if (!(list instanceof HTMLElement)) return;
    startupWorkspaceEntries = Array.isArray(entries) ? entries.slice() : [];
    const visibleEntries = startupWorkspaceSearchQuery
      ? startupWorkspaceEntries.filter(entry => String(entry?.name || entry?.fileName || '')
          .toLocaleLowerCase()
          .includes(startupWorkspaceSearchQuery))
      : startupWorkspaceEntries;
    list.replaceChildren();
    if (!startupWorkspaceEntries.length) {
      const empty = document.createElement('p');
      empty.className = 'startup-workspace__empty';
      empty.textContent = localizeText('保存済みプロジェクトはありません。', 'No saved projects were found.');
      list.appendChild(empty);
      return;
    }
    if (!visibleEntries.length) {
      const empty = document.createElement('p');
      empty.className = 'startup-workspace__empty';
      empty.textContent = localizeText('一致するプロジェクトがありません。', 'No matching projects.');
      list.appendChild(empty);
      return;
    }
    visibleEntries.forEach((entry, visibleIndex) => {
      const entryIndex = startupWorkspaceEntries.indexOf(entry);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'startup-workspace__project';
      button.dataset.workspaceProjectIndex = String(entryIndex);
      button.setAttribute('role', 'listitem');
      if (entry?.deviceLocalProject !== true && entry?.migrationRecovery !== true && Number(entry?.size) === 0) {
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
      thumbnail.dataset.workspaceProjectThumbnail = String(entryIndex);
      const placeholder = document.createElement('span');
      placeholder.className = 'startup-workspace__project-thumbnail-placeholder';
      placeholder.textContent = 'PXD';
      thumbnail.appendChild(placeholder);
      if ((entry?.migrationRecovery === true || entry?.deviceLocalProject === true)
        && typeof entry?.thumbnail === 'string'
        && entry.thumbnail) {
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
      const displayName = String(entry?.name || DEFAULT_DOCUMENT_NAME).replace(/\.pixieedraw$/i, '');
      name.textContent = displayName || 'PiXiEEDraw';
      const meta = document.createElement('span');
      meta.className = 'startup-workspace__project-meta';
      const modified = (entry?.migrationRecovery === true || entry?.deviceLocalProject === true)
        && typeof entry?.updatedAt === 'string'
        ? new Date(entry.updatedAt).toLocaleString()
        : (Number(entry?.lastModified) > 0
            ? new Date(Number(entry.lastModified)).toLocaleString()
            : localizeText('更新日時不明', 'Unknown date'));
      meta.textContent = entry?.migrationRecovery === true
        ? `${modified} / ${localizeText('端末内・V2移行待ち', 'On device · awaiting V2 migration')}`
        : entry?.deviceLocalProject === true
          ? `${modified} / ${localizeText('端末内保存', 'On-device storage')}`
          : modified;
      const certification = document.createElement('span');
      certification.className = entry?.migrationRecovery === true
        ? 'startup-workspace__project-certification is-recovery'
        : 'startup-workspace__project-certification is-local';
      certification.textContent = entry?.migrationRecovery === true
        ? localizeText('復旧して開く', 'Open for recovery')
        : (Number(entry?.autosaveSchemaVersion) === 2
            ? localizeText('端末内V2', 'On-device V2')
            : localizeText('端末内プロジェクト', 'On-device project'));
      certification.setAttribute('aria-label', entry?.migrationRecovery === true
        ? localizeText('端末内の元データを保持しています。開いて復旧できます。', 'The original on-device data is retained and can be opened for recovery.')
        : localizeText(
          'このブラウザの端末内保存から開けます。完全ファイルは手動保存できます。',
          'This project can be opened from on-device storage. Save a complete file manually when needed.'
        ));
      details.append(name, meta, certification);
      button.append(thumbnail, details);
      list.appendChild(button);
      if ((visibleIndex + 1) % 8 === 0 && window.__PIXIEEDRAW_SHOULD_SHOW_ADS__?.()) {
        const adCard = document.createElement('div');
        adCard.className = 'startup-recent-card--ad startup-recent-ad startup-workspace__ad';
        adCard.dataset.pixieedReserveAdSpace = 'true';
        adCard.setAttribute('role', 'listitem');
        adCard.setAttribute('aria-label', localizeText('広告', 'Advertisement'));
        const frame = document.createElement('div');
        frame.className = 'startup-recent-ad__frame';
        const label = document.createElement('span');
        label.className = 'startup-recent-ad__label';
        label.textContent = localizeText('広告', 'Advertisement');
        const ad = document.createElement('ins');
        ad.className = 'startup-recent-card__ad-ins startup-recent-ad__slot';
        ad.setAttribute('data-ad-client', 'ca-pub-9801602250480253');
        ad.setAttribute('data-ad-format', 'horizontal');
        ad.setAttribute('data-ad-slot', '2141591954');
        ad.setAttribute('data-full-width-responsive', 'true');
        ad.dataset.pixieedProjectFeedAd = 'true';
        ad.style.display = 'block';
        frame.append(label, ad);
        adCard.appendChild(frame);
        list.appendChild(adCard);
      }
    });
    if (startupVisible) {
      window.requestAnimationFrame(() => queueStartupRecentAdRender());
    }
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

  async function refreshStartupWorkspaceProjects() {
    let migration = { migrated: 0, created: 0, failed: 0, declined: false, failedEntries: [] };
    if (!startupWorkspaceMigrationPrompted && typeof migrateLegacyLocalProjectsToTrueV2 === 'function') {
      migration = await migrateLegacyLocalProjectsToTrueV2({
        confirmMigration: ({ count, candidates }) => {
          startupWorkspaceMigrationPrompted = true;
          const hasSplit = Array.isArray(candidates) && candidates.some(candidate => candidate?.needsSplit === true);
          return window.confirm(localizeText(
            `端末内にV1・旧V2プロジェクトが${count}件あります。\n\n真V2の単一プロジェクトへ変換します。${hasSplit ? '\n複数タブ・複数キャンバスは、それぞれ独立した真V2プロジェクトへ分割します。' : ''}\n変換先を端末内へ完全保存できた後だけ、元のV1・旧V2データを削除します。\n変換中は画面を閉じないでください。\n\n変換を開始しますか？`,
            `${count} V1 or legacy V2 on-device project(s) were found.\n\nThey will be converted to true V2 single projects.${hasSplit ? '\nMultiple tabs and canvases will be split into independent true V2 projects.' : ''}\nThe original V1/legacy V2 data is deleted only after its on-device true V2 replacement is fully committed.\nKeep this page open during conversion.\n\nStart conversion?`
          ));
        },
        preparePackaged: async (entry, packaged) => await mergeFileBackedTimelapseIntoPackaged(entry, packaged),
        onProgress: ({ index, total }) => {
          setStartupWorkspaceStatus(localizeText(
            `端末内プロジェクトを真V2へ変換しています… ${index}/${total}`,
            `Converting on-device projects to true V2... ${index}/${total}`
          ));
        },
      });
    }
    const failuresById = new Map((migration.failedEntries || [])
      .filter(failure => failure?.entry?.id)
      .map(failure => [failure.entry.id, failure]));
    const localEntries = (await loadDeviceLocalWorkspaceEntries()).map(entry => {
      const failure = failuresById.get(entry.id);
      return failure
        ? {
            ...entry,
            migrationRecovery: true,
            migrationErrorCode: failure.code || 'ERR_TRUE_V2_MIGRATION_FAILED',
            migrationErrorMessage: failure.message || '',
          }
        : entry;
    });
    renderStartupWorkspaceProjects(localEntries);
    const migrationSummary = migration.migrated > 0
      ? localizeText(
          ` 真V2移行: 元${migration.migrated}件→${migration.created}件。`,
          ` True V2 migration: ${migration.migrated} source(s) to ${migration.created} project(s).`
        )
      : '';
    setStartupWorkspaceStatus(
      migration.failed > 0
        ? localizeText(
            `端末内プロジェクト${localEntries.length}件。真V2移行の未完了が${migration.failed}件あります。元データは削除していません。`,
            `${localEntries.length} on-device project(s). ${migration.failed} true V2 migration(s) remain incomplete; original data was retained.`
          )
        : localizeText(
            `端末内プロジェクト ${localEntries.length}件。${migrationSummary}`,
            `${localEntries.length} on-device project(s).${migrationSummary}`
          ),
      migration.failed > 0 ? 'warn' : 'info'
    );
    return true;
  }

  function setupStartupWorkspace() {
    const projectList = dom.startup?.workspaceProjectList;
    if (!(projectList instanceof HTMLElement) || projectList.dataset.bound === 'true') {
      return;
    }
    projectList.dataset.bound = 'true';
    dom.startup?.workspaceSearch?.addEventListener('input', () => {
      startupWorkspaceSearchQuery = String(dom.startup.workspaceSearch.value || '').trim().toLocaleLowerCase();
      renderStartupWorkspaceProjects(startupWorkspaceEntries);
    });
    projectList.addEventListener('click', async event => {
      const target = event.target instanceof Element
        ? event.target.closest('button[data-workspace-project-index]')
        : null;
      if (!(target instanceof HTMLButtonElement)) return;
      const entry = startupWorkspaceEntries[Number(target.dataset.workspaceProjectIndex)] || null;
      if (entry?.deviceLocalProject !== true && entry?.migrationRecovery !== true) return;
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
    });
    void refreshStartupWorkspaceProjects();
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
