(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createExportDialogWorkflowUtils(rawScope = {}) {
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
  async function openExportDialog() {
    if (!ensureInternetConnectedForAction('保存/出力', 'Save / Export')) {
      return;
    }
    if (!ensureCurrentClientCanExportProject({ announce: true })) {
      return;
    }
    const config = dom.exportDialog;
    if (!config) {
      console.error('[PiXiEEDraw DEV] export settings dialog is unavailable');
      updateAutosaveStatus('出力設定を開けません。出力は開始していません。画面を再読み込みしてからもう一度お試しください。', 'error');
      return;
    }
    setExportFileBaseName(getExportFileNameBase() || state.documentName);
    const dialog = config.dialog;
    if (dialog && typeof dialog.showModal === 'function') {
      if (dialog.open) {
        return;
      }
      refreshExportScaleControls();
      updateExportFormatAvailability();
      updateExportOriginalToggleUI();
      try {
        dialog.showModal();
      } catch (error) {
        console.warn('Failed to open export dialog', error);
        updateAutosaveStatus('出力設定を開けません。出力は開始していません。画面を再読み込みしてからもう一度お試しください。', 'error');
        return;
      }
      window.requestAnimationFrame(() => {
        try {
          updateExportPreview();
        } catch (error) {
          console.warn('Failed to update export preview', error);
        }
        try {
          queueExportAdRender();
        } catch (error) {
          console.warn('Failed to queue export ad render', error);
        }
      });
    } else {
      console.error('[PiXiEEDraw DEV] export settings dialog does not support showModal');
      updateAutosaveStatus('この環境では出力設定パネルを開けません。出力は開始していません。', 'error');
    }
  }

  function queueExportAdRender() {
    if (!window.__PIXIEEDRAW_SHOULD_SHOW_MODAL_ADS__?.('export-dialog')) {
      return;
    }
    const dialog = dom.exportDialog?.dialog;
    const adSlot = dom.exportDialog?.adSlot;
    if (!(dialog instanceof HTMLDialogElement) || !dialog.open || !(adSlot instanceof HTMLElement)) {
      return;
    }
    if (exportAdRequested) {
      return;
    }
    if (adSlot.dataset.loaded === '1' || adSlot.getAttribute('data-adsbygoogle-status') === 'done') {
      exportAdRequested = true;
      return;
    }
    // Keep export slot out of global AdSense queue until dialog is open and width is measurable.
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
        exportAdRequested = false;
        return;
      }
      const width = getWidth();
      if (width <= 0) {
        attempts += 1;
        if (attempts < MAX_ATTEMPTS) {
          window.requestAnimationFrame(renderWhenReady);
          return;
        }
        exportAdRequested = false;
        return;
      }
      exportAdRequested = true;
      try {
        const result = window.__PIXIEEDRAW_RENDER_AD_SLOT__?.(adSlot, {
          owner: 'export-dialog',
          reason: 'dialog-open',
        });
        if (!result?.ok) throw new Error(result?.reason || 'ERR_AD_SLOT_RENDER_FAILED');
        adSlot.dataset.loaded = '1';
      } catch (error) {
        exportAdRequested = false;
      }
    };

    window.requestAnimationFrame(renderWhenReady);
  }

  function closeExportDialog() {
    const dialog = dom.exportDialog?.dialog;
    if (dialog && dialog.open) {
      dialog.close();
    }
  }

  function openShortcutHelpDialog() {
    const dialog = dom.shortcutHelp?.dialog;
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
      return;
    }
    if (dialog.open) {
      return;
    }
    dialog.showModal();
    window.requestAnimationFrame(() => {
      queueShortcutHelpAdRender();
      dom.controls.closeShortcutHelp?.focus?.({ preventScroll: true });
    });
  }

  function closeShortcutHelpDialog() {
    const dialog = dom.shortcutHelp?.dialog;
    if (dialog instanceof HTMLDialogElement && dialog.open) {
      dialog.close();
    }
  }

  function queueShortcutHelpAdRender() {
    if (!window.__PIXIEEDRAW_SHOULD_SHOW_MODAL_ADS__?.('shortcut-help-dialog')) {
      return;
    }
    const dialog = dom.shortcutHelp?.dialog;
    const adSlot = dom.shortcutHelp?.adSlot;
    if (!(dialog instanceof HTMLDialogElement) || !dialog.open || !(adSlot instanceof HTMLElement)) {
      return;
    }
    if (shortcutHelpAdRequested) {
      return;
    }
    if (adSlot.dataset.loaded === '1' || adSlot.getAttribute('data-adsbygoogle-status') === 'done') {
      shortcutHelpAdRequested = true;
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
        shortcutHelpAdRequested = false;
        return;
      }
      const width = getWidth();
      if (width <= 0) {
        attempts += 1;
        if (attempts < MAX_ATTEMPTS) {
          window.requestAnimationFrame(renderWhenReady);
          return;
        }
        shortcutHelpAdRequested = false;
        return;
      }
      shortcutHelpAdRequested = true;
      try {
        const result = window.__PIXIEEDRAW_RENDER_AD_SLOT__?.(adSlot, {
          owner: 'shortcut-help-dialog',
          reason: 'dialog-open',
        });
        if (!result?.ok) throw new Error(result?.reason || 'ERR_AD_SLOT_RENDER_FAILED');
        adSlot.dataset.loaded = '1';
      } catch (error) {
        shortcutHelpAdRequested = false;
      }
    };

    window.requestAnimationFrame(renderWhenReady);
  }

  function queueUpdateHistoryAdRender() {
    if (!window.__PIXIEEDRAW_SHOULD_SHOW_MODAL_ADS__?.('update-history-dialog')) {
      return;
    }
    const dialog = dom.updateHistory?.dialog;
    const adSlot = dom.updateHistory?.adSlot;
    if (!(dialog instanceof HTMLDialogElement) || !dialog.open || !(adSlot instanceof HTMLElement)) {
      return;
    }
    if (updateHistoryAdRequested) {
      return;
    }
    if (adSlot.dataset.loaded === '1' || adSlot.getAttribute('data-adsbygoogle-status') === 'done') {
      updateHistoryAdRequested = true;
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
        updateHistoryAdRequested = false;
        return;
      }
      const width = getWidth();
      if (width <= 0) {
        attempts += 1;
        if (attempts < MAX_ATTEMPTS) {
          window.requestAnimationFrame(renderWhenReady);
          return;
        }
        updateHistoryAdRequested = false;
        return;
      }
      updateHistoryAdRequested = true;
      try {
        const result = window.__PIXIEEDRAW_RENDER_AD_SLOT__?.(adSlot, {
          owner: 'update-history-dialog',
          reason: 'dialog-open',
        });
        if (!result?.ok) throw new Error(result?.reason || 'ERR_AD_SLOT_RENDER_FAILED');
        adSlot.dataset.loaded = '1';
      } catch (error) {
        updateHistoryAdRequested = false;
      }
    };

    window.requestAnimationFrame(renderWhenReady);
  }

  const updateHistoryUtils = window.PiXiEEDrawModules?.updateHistoryUtils?.createUpdateHistoryUtils?.({
    canUseSessionStorage,
    UPDATE_HISTORY_STORAGE_KEY,
    UPDATE_HISTORY_RETENTION_MS,
    BUILTIN_UPDATE_HISTORY_ENTRIES,
    SUPPRESSED_UPDATE_HISTORY_IDS,
  }) || {};
  const {
    parseUpdateHistoryTimestamp,
    normalizeUpdateHistoryEntry,
    formatUpdateHistoryDate,
    loadStoredUpdateHistoryEntries,
    saveStoredUpdateHistoryEntries,
    getUpdateHistoryEntries,
  } = updateHistoryUtils;

  function renderUpdateHistoryPanel() {
    const list = dom.updateHistory?.list;
    if (!(list instanceof HTMLElement)) {
      return;
    }
    list.replaceChildren();
    const entries = getUpdateHistoryEntries();
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'help-text';
      empty.textContent = '更新履歴は準備中です。';
      list.appendChild(empty);
      return;
    }
    entries.slice().reverse().forEach(entry => {
      const item = document.createElement('article');
      item.className = 'update-history-item';
      item.setAttribute('role', 'listitem');
      const head = document.createElement('div');
      head.className = 'update-history-item__head';
      const title = document.createElement('h3');
      title.className = 'update-history-item__title';
      title.textContent = entry.title;
      const time = document.createElement('time');
      time.className = 'update-history-item__time';
      time.dateTime = entry.at;
      time.textContent = formatUpdateHistoryDate(entry.timestamp, entry.at);
      head.append(title, time);
      item.appendChild(head);
      if (entry.details.length) {
        const detailList = document.createElement('ul');
        detailList.className = 'update-history-item__details';
        entry.details.forEach(detail => {
          const row = document.createElement('li');
          row.textContent = detail;
          detailList.appendChild(row);
        });
        item.appendChild(detailList);
      }
      list.appendChild(item);
    });
  }

  function openUpdateHistoryDialog() {
    const dialog = dom.updateHistory?.dialog;
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
      return;
    }
    renderUpdateHistoryPanel();
    if (dialog.open) {
      return;
    }
    dialog.showModal();
    window.requestAnimationFrame(() => {
      queueUpdateHistoryAdRender();
      dom.updateHistory?.close?.focus?.({ preventScroll: true });
    });
  }

  function closeUpdateHistoryDialog() {
    const dialog = dom.updateHistory?.dialog;
    if (dialog instanceof HTMLDialogElement && dialog.open) {
      dialog.close();
    }
  }



  function shuffleToolSpotlightCards() {
    const list = dom.toolSpotlight?.list;
    if (!(list instanceof HTMLElement)) {
      return;
    }
    const cards = Array.from(list.querySelectorAll('.tool-spotlight-card'));
    if (cards.length <= 1) {
      return;
    }
    const visibleCards = cards.filter(card => !(card.hidden || card.getAttribute('aria-hidden') === 'true'));
    if (visibleCards.length <= 1) {
      return;
    }
    const tipCard = dom.toolSpotlight?.supportTip || null;
    const shuffled = visibleCards.filter(card => card !== tipCard);
    if (shuffled.length > 1) {
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
    }
    if (tipCard && !(tipCard.hidden || tipCard.getAttribute('aria-hidden') === 'true')) {
      list.appendChild(tipCard);
    }
    shuffled.forEach(card => list.appendChild(card));
    const visibleSet = new Set([tipCard, ...shuffled].filter(Boolean));
    cards.forEach(card => {
      if (!visibleSet.has(card)) {
        list.appendChild(card);
      }
    });
  }

  function openToolSpotlightDialog() {
    const dialog = dom.toolSpotlight?.dialog;
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
      return;
    }
    if (dialog.open) {
      return;
    }
    shuffleToolSpotlightCards();
    dialog.showModal();
    window.requestAnimationFrame(() => {
      dom.toolSpotlight?.close?.focus?.({ preventScroll: true });
    });
  }

  function closeToolSpotlightDialog() {
    const dialog = dom.toolSpotlight?.dialog;
    if (dialog instanceof HTMLDialogElement && dialog.open) {
      dialog.close();
    }
  }

  function getDefaultLoginPromptCopy() {
    return {
      title: localizeText('ログイン', 'Sign In'),
      lead: localizeText(
        'ログインすると、プロフィール共有、端末間の引き継ぎ、ログイン限定機能を利用できます。',
        'Sign in to sync your profile, carry it to other devices, and use account-only features.'
      ),
      actionLabel: localizeText('マイページでログイン', 'Open My Page Login'),
    };
  }

  function applyLoginPromptCopy(options = {}) {
    const defaults = getDefaultLoginPromptCopy();
    const title = typeof options.title === 'string' && options.title.trim()
      ? options.title.trim()
      : defaults.title;
    const lead = typeof options.lead === 'string' && options.lead.trim()
      ? options.lead.trim()
      : defaults.lead;
    const actionLabel = typeof options.actionLabel === 'string' && options.actionLabel.trim()
      ? options.actionLabel.trim()
      : defaults.actionLabel;
    if (dom.loginPrompt?.title instanceof HTMLElement) {
      dom.loginPrompt.title.textContent = title;
    }
    if (dom.loginPrompt?.lead instanceof HTMLElement) {
      dom.loginPrompt.lead.textContent = lead;
    }
    if (dom.loginPrompt?.goHome instanceof HTMLElement) {
      dom.loginPrompt.goHome.textContent = actionLabel;
    }
  }

  function openLoginPromptDialog(options = {}) {
    if (accountState.isLoggedIn && !accountState.isAnonymous) {
      return;
    }
    const dialog = dom.loginPrompt?.dialog;
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
      return;
    }
    applyLoginPromptCopy(options);
    if (dialog.open) {
      return;
    }
    dialog.showModal();
    window.requestAnimationFrame(() => {
      dom.loginPrompt?.close?.focus?.({ preventScroll: true });
    });
  }

  function closeLoginPromptDialog() {
    const dialog = dom.loginPrompt?.dialog;
    if (dialog instanceof HTMLDialogElement && dialog.open) {
      dialog.close();
    }
  }

  function showLoginPromptAfterExport() {
    openToolSpotlightDialog();
    if (accountState.isLoggedIn) {
      return;
    }
    const spotlightDialog = dom.toolSpotlight?.dialog;
    if (spotlightDialog instanceof HTMLDialogElement && spotlightDialog.open) {
      spotlightDialog.addEventListener('close', () => {
        openLoginPromptDialog();
      }, { once: true });
      return;
    }
    openLoginPromptDialog();
  }

  function canShowExportInterstitial() {
    if (!window.__PIXIEEDRAW_SHOULD_SHOW_MODAL_ADS__?.('export-interstitial')) {
      return false;
    }
    const dialog = dom.exportInterstitial?.dialog;
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
      return false;
    }
    if (!canUseSessionStorage) {
      return true;
    }
    try {
      const lastShownAt = Number(window.localStorage.getItem(EXPORT_INTERSTITIAL_LAST_SHOWN_KEY) || 0);
      if (!Number.isFinite(lastShownAt) || lastShownAt <= 0) {
        return true;
      }
      return Date.now() - lastShownAt >= EXPORT_INTERSTITIAL_COOLDOWN_MS;
    } catch (error) {
      return true;
    }
  }

  function markExportInterstitialShown() {
    if (!canUseSessionStorage) {
      return;
    }
    try {
      window.localStorage.setItem(EXPORT_INTERSTITIAL_LAST_SHOWN_KEY, String(Date.now()));
    } catch (error) {
      // Ignore localStorage errors.
    }
  }

  function queueExportInterstitialAdRender() {
    if (!window.__PIXIEEDRAW_SHOULD_SHOW_MODAL_ADS__?.('export-interstitial')) {
      return;
    }
    const dialog = dom.exportInterstitial?.dialog;
    const adSlot = dom.exportInterstitial?.adSlot;
    if (!(dialog instanceof HTMLDialogElement) || !dialog.open || !(adSlot instanceof HTMLElement)) {
      return;
    }
    if (exportInterstitialAdRequested) {
      return;
    }
    if (adSlot.dataset.loaded === '1' || adSlot.getAttribute('data-adsbygoogle-status') === 'done') {
      exportInterstitialAdRequested = true;
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
    const MAX_ATTEMPTS = 36;
    const renderWhenReady = () => {
      if (!(dialog instanceof HTMLDialogElement) || !dialog.open) {
        exportInterstitialAdRequested = false;
        return;
      }
      const width = getWidth();
      if (width <= 0) {
        attempts += 1;
        if (attempts < MAX_ATTEMPTS) {
          window.requestAnimationFrame(renderWhenReady);
          return;
        }
        exportInterstitialAdRequested = false;
        return;
      }
      exportInterstitialAdRequested = true;
      try {
        const result = window.__PIXIEEDRAW_RENDER_AD_SLOT__?.(adSlot, {
          owner: 'export-interstitial-dialog',
          reason: 'dialog-open',
        });
        if (!result?.ok) throw new Error(result?.reason || 'ERR_AD_SLOT_RENDER_FAILED');
        adSlot.dataset.loaded = '1';
      } catch (error) {
        exportInterstitialAdRequested = false;
      }
    };

    window.requestAnimationFrame(renderWhenReady);
  }

  function runPendingExportAction() {
    const action = pendingExportAction;
    pendingExportAction = null;
    if (typeof action !== 'function') {
      return;
    }
    try {
      const result = action();
      if (result && typeof result.then === 'function') {
        result.catch(error => {
          console.warn('Export action failed', error);
        });
      }
    } catch (error) {
      console.warn('Export action failed', error);
    }
  }

  function closeExportInterstitial({ runPendingExport = false } = {}) {
    const dialog = dom.exportInterstitial?.dialog;
    if (!(dialog instanceof HTMLDialogElement)) {
      return;
    }
    const wasOpen = dialog.open;
    if (wasOpen) {
      dialog.close();
    }
    exportInterstitialAdRequested = false;
    document.body.classList.remove('is-export-interstitial-active');
    if (runPendingExport && wasOpen) {
      window.requestAnimationFrame(() => {
        runPendingExportAction();
      });
    }
  }

  function queueExportWithInterstitial(action) {
    if (typeof action !== 'function') {
      return;
    }
    pendingExportAction = action;
    const opened = openExportInterstitialDialog({ force: true });
    if (!opened) {
      runPendingExportAction();
    }
  }

  function setupTopActionButtons() {
    dom.topActionButtons = Array.from(document.querySelectorAll('[data-ui-action]'));
    dom.mobileQuickPanelButtons = Array.from(document.querySelectorAll('[data-mobile-quick-open-panel]'));
    const quickRightTabButtons = Array.from(document.querySelectorAll('[data-quick-right-tab]'));
    const detailActionButtons = Array.from(document.querySelectorAll('[data-detail-action]'));
    syncExternalToolActionButtons();
    dom.topActionButtons.forEach(button => {
      if (!(button instanceof HTMLButtonElement) || button.dataset.actionBound === 'true') {
        return;
      }
      button.dataset.actionBound = 'true';
      button.addEventListener('click', () => {
        const action = button.dataset.uiAction || '';
        if (!action) {
          return;
        }
        runUiAction(action, { sourceButton: button });
      });
    });
    quickRightTabButtons.forEach(button => {
      if (!(button instanceof HTMLButtonElement) || button.dataset.quickRightTabBound === 'true') {
        return;
      }
      button.dataset.quickRightTabBound = 'true';
      button.addEventListener('click', () => {
        if (layoutMode === 'mobilePortrait') {
          return;
        }
        const target = button.dataset.quickRightTab || '';
        if (!target || !RIGHT_TAB_KEYS.includes(target)) {
          return;
        }
        setRightTab(target);
        if (isDesktopRightToolRailMode()) {
          setCompactRightFlyoutOpen(true);
          updateRightTabVisibility();
          setRightUtilityMenuOpen(false);
        }
      });
    });
    detailActionButtons.forEach(button => {
      if (!(button instanceof HTMLButtonElement) || button.dataset.detailActionBound === 'true') {
        return;
      }
      button.dataset.detailActionBound = 'true';
      button.addEventListener('click', () => {
        const action = button.dataset.detailAction || '';
        if (action === 'account') {
          setRightTab('details');
          if (isDesktopRightToolRailMode()) {
            setCompactRightFlyoutOpen(true);
            updateRightTabVisibility();
          }
          window.requestAnimationFrame(() => {
            const accountField = document.getElementById('pixieedAccountLabel')?.closest('.settings-account-field');
            if (accountField instanceof HTMLElement) {
              accountField.scrollIntoView({ block: 'nearest' });
            }
            dom.controls.pixieedAccountLogin?.focus?.({ preventScroll: true });
          });
        }
      });
    });
    dom.mobileQuickPanelButtons.forEach(button => {
      if (!(button instanceof HTMLButtonElement) || button.dataset.mobileQuickPanelBound === 'true') {
        return;
      }
      button.dataset.mobileQuickPanelBound = 'true';
      button.addEventListener('click', () => {
        const target = button.dataset.mobileQuickOpenPanel || '';
        if (!target) {
          return;
        }
        activateMobileTab(target, { ensureDrawer: true });
      });
    });
  }

  function openExportInterstitialDialog({ force = false } = {}) {
    const dialog = dom.exportInterstitial?.dialog;
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
      return false;
    }
    if (!window.__PIXIEEDRAW_SHOULD_SHOW_MODAL_ADS__?.('export-interstitial')) {
      return false;
    }
    if (dialog.open) {
      return true;
    }
    if (!force && !canShowExportInterstitial()) {
      return false;
    }
    markExportInterstitialShown();
    dialog.showModal();
    document.body.classList.add('is-export-interstitial-active');
    queueExportInterstitialAdRender();
    window.requestAnimationFrame(() => {
      dom.exportInterstitial?.close?.focus?.({ preventScroll: true });
    });
    return true;
  }

  function exportProjectWithFallback() {
    if (!ensureCurrentClientCanExportProject({ announce: true })) {
      return;
    }
    const choice = window.prompt(
      '出力形式を入力してください (png / jpeg / svg / gif / project)',
      'png'
    );
    if (!choice) {
      return;
    }
    const inputMode = choice.trim().toLowerCase();
    if (
      inputMode !== 'png'
      && inputMode !== 'jpg'
      && inputMode !== 'jpeg'
      && inputMode !== 'svg'
      && inputMode !== 'gif'
      && inputMode !== 'project'
    ) {
      window.alert('png / jpeg / svg / gif / project のいずれかを入力してください。');
      return;
    }
    const normalized = normalizeExportFormat(inputMode);
    if (!ensureCurrentClientCanExportProject({ announce: true, format: normalized })) {
      return;
    }
    queueExportWithInterstitial(() => performExportByMode(normalized));
  }

  async function performExportByMode(mode) {
    const normalized = normalizeExportFormat(mode || 'png');
    if (normalized !== 'spritemap' && normalized !== 'allzip' && shouldSaveSpriteMapCompanion(normalized)) {
      await exportProjectAsSpriteMap({
        companionExport: true,
        includeProjectCompanion: false,
      });
    }
    if (normalized === 'allzip') {
      await exportProjectAsAllFormatsZip();
    } else if (normalized === 'gif') {
      await exportProjectAsGif();
    } else if (normalized === 'jpeg') {
      await exportProjectAsJpeg();
    } else if (normalized === 'svg') {
      await exportProjectAsSvg();
    } else if (normalized === 'glb') {
      await exportProjectAsGlb();
    } else if (normalized === 'gridpng') {
      await exportProjectAsGridPng();
    } else if (normalized === 'timelapse') {
      await exportTimelapseGif();
    } else if (normalized === 'project') {
      const result = await saveProjectAsPixieedraw({
        fileNameBase: getExportFileNameBase() || state.documentName,
      });
      if (result?.saved) {
        showLoginPromptAfterExport();
      }
    } else {
      await exportProjectAsPng();
    }
  }


  return Object.freeze({
    openExportDialog,
    queueExportAdRender,
    closeExportDialog,
    openShortcutHelpDialog,
    closeShortcutHelpDialog,
    queueShortcutHelpAdRender,
    queueUpdateHistoryAdRender,
    renderUpdateHistoryPanel,
    openUpdateHistoryDialog,
    closeUpdateHistoryDialog,
    shuffleToolSpotlightCards,
    openToolSpotlightDialog,
    closeToolSpotlightDialog,
    getDefaultLoginPromptCopy,
    applyLoginPromptCopy,
    openLoginPromptDialog,
    closeLoginPromptDialog,
    showLoginPromptAfterExport,
    canShowExportInterstitial,
    markExportInterstitialShown,
    queueExportInterstitialAdRender,
    runPendingExportAction,
    closeExportInterstitial,
    queueExportWithInterstitial,
    setupTopActionButtons,
    openExportInterstitialDialog,
    exportProjectWithFallback,
    performExportByMode,
  });
      }
    })(scope);
  }

  root.exportDialogWorkflowUtils = Object.freeze({
    createExportDialogWorkflowUtils,
  });
})();
