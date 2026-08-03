(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createDialogSetupUtils(rawScope = {}) {
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
  function setupDialogAutoDismiss({ delayMs = 10_000 } = {}) {
    const documentRef = window.document;
    const normalizedDelayMs = Math.max(1, Number(delayMs) || 10_000);
    const timers = new Map();
    const boundDialogs = new WeakSet();

    const clearTimer = dialog => {
      const timer = timers.get(dialog);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timers.delete(dialog);
      }
    };

    const schedule = dialog => {
      if (!(dialog instanceof HTMLDialogElement)) return;
      clearTimer(dialog);
      if (!dialog.open) return;
      const timer = window.setTimeout(() => {
        timers.delete(dialog);
        if (!dialog.open) return;
        // Let existing cancel handlers resolve pending confirmation promises
        // before forcing the native dialog closed. This also removes the
        // native ::backdrop together with the dialog.
        try {
          dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
        } catch (error) {
          console.warn('[pixiedraw:dialog] auto-dismiss cancel dispatch failed', error);
        }
        if (dialog.open) {
          try {
            dialog.close('timeout');
          } catch (error) {
            console.warn('[pixiedraw:dialog] auto-dismiss close failed', error);
          }
        }
      }, normalizedDelayMs);
      timers.set(dialog, timer);
    };

    const bind = dialog => {
      if (!(dialog instanceof HTMLDialogElement) || boundDialogs.has(dialog)) return;
      boundDialogs.add(dialog);
      dialog.addEventListener('close', () => clearTimer(dialog));
      dialog.addEventListener('cancel', () => {
        clearTimer(dialog);
        // A consumer may prevent the cancel event. Keep the timeout contract
        // in that case, while allowing the normal native close to finish.
        window.setTimeout(() => schedule(dialog), 0);
      }, true);
      schedule(dialog);
    };

    documentRef.querySelectorAll('dialog').forEach(bind);
    const observer = typeof MutationObserver === 'function'
      ? new MutationObserver(records => {
          records.forEach(record => {
            if (record.type === 'attributes') {
              bind(record.target);
              schedule(record.target);
              return;
            }
            record.addedNodes.forEach(node => {
              if (!(node instanceof Element)) return;
              if (node instanceof HTMLDialogElement) bind(node);
              node.querySelectorAll?.('dialog').forEach(bind);
            });
          });
        })
      : null;
    observer?.observe(documentRef.documentElement, {
      attributes: true,
      attributeFilter: ['open'],
      childList: true,
      subtree: true,
    });

    return () => {
      observer?.disconnect();
      timers.forEach(timer => window.clearTimeout(timer));
      timers.clear();
    };
  }

  function setupHelpPanel() {
    setInlineGuidesVisible(inlineGuidesVisible, { persist: false });

    if (dom.controls.helpSearchInput instanceof HTMLInputElement && dom.controls.helpSearchInput.dataset.bound !== 'true') {
      dom.controls.helpSearchInput.dataset.bound = 'true';
      dom.controls.helpSearchInput.addEventListener('input', () => {
        applyHelpGuideSearchFilter();
      });
    }
    if (dom.controls.helpClearSearch instanceof HTMLButtonElement && dom.controls.helpClearSearch.dataset.bound !== 'true') {
      dom.controls.helpClearSearch.dataset.bound = 'true';
      dom.controls.helpClearSearch.addEventListener('click', () => {
        if (dom.controls.helpSearchInput instanceof HTMLInputElement) {
          dom.controls.helpSearchInput.value = '';
          dom.controls.helpSearchInput.focus({ preventScroll: true });
        }
        applyHelpGuideSearchFilter();
      });
    }
    if (dom.controls.toggleInlineHelp instanceof HTMLInputElement && dom.controls.toggleInlineHelp.dataset.bound !== 'true') {
      dom.controls.toggleInlineHelp.dataset.bound = 'true';
      dom.controls.toggleInlineHelp.addEventListener('change', event => {
        if (!(event.target instanceof HTMLInputElement)) {
          return;
        }
        setInlineGuidesVisible(event.target.checked);
      });
    }
    if (dom.controls.closeOperationHelp instanceof HTMLButtonElement && dom.controls.closeOperationHelp.dataset.bound !== 'true') {
      dom.controls.closeOperationHelp.dataset.bound = 'true';
      dom.controls.closeOperationHelp.addEventListener('click', () => {
        const dialog = dom.controls.operationHelpDialog;
        if (dialog instanceof HTMLDialogElement && dialog.open) {
          dialog.close();
        }
      });
    }
    if (dom.controls.operationHelpDialog instanceof HTMLDialogElement && dom.controls.operationHelpDialog.dataset.bound !== 'true') {
      dom.controls.operationHelpDialog.dataset.bound = 'true';
      dom.controls.operationHelpDialog.addEventListener('cancel', event => {
        event.preventDefault();
        if (dom.controls.operationHelpDialog.open) {
          dom.controls.operationHelpDialog.close();
        }
      });
    }

    renderHelpGuideEntries();
    applyHelpGuideSearchFilter();
  }

  function setupUpdateHistoryDialog() {
    const dialog = dom.updateHistory?.dialog;
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
      if (dialog) {
        dialog.hidden = true;
      }
      return;
    }
    dom.updateHistory?.close?.addEventListener('click', () => {
      closeUpdateHistoryDialog();
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeUpdateHistoryDialog();
    });
  }

  function setupExportDialog() {
    const config = dom.exportDialog;
    if (!config) {
      return;
    }
    const dialog = config.dialog;
    const supportsDialog = dialog && typeof dialog.showModal === 'function';
    const resolveSelectedExportMode = () => {
      return normalizeExportFormat(config.format?.value || 'png');
    };
    const getSelectedExportFormatsSnapshot = () => {
      return (Array.isArray(config.formatChoices) ? config.formatChoices : [])
        .filter(choice => choice instanceof HTMLButtonElement && choice.getAttribute('aria-pressed') === 'true' && !choice.disabled)
        .map(choice => normalizeExportFormat(choice.dataset.exportFormatChoice || ''))
        .filter(format => format && format !== 'batchzip' && format !== 'allzip');
    };
    const syncFormatOptions = () => {
      const format = normalizeExportFormat(config.format?.value || 'png');
    };
    const bind = (element, handler) => {
      if (element) {
        element.addEventListener('click', handler);
      }
    };
    bind(config.confirm, () => {
      const inputBaseName = config.fileNameInput instanceof HTMLInputElement
        ? config.fileNameInput.value
        : '';
      setExportFileBaseName(inputBaseName || state.documentName);
      const mode = resolveSelectedExportMode();
      if (!ensureCurrentClientCanExportProject({ announce: true, format: mode })) {
        updateExportFormatAvailability();
        return;
      }
      closeExportDialog();
      const selectedFormats = mode === 'batchzip' ? getSelectedExportFormatsSnapshot() : null;
      queueExportWithInterstitial(async () => {
        if (mode === 'batchzip') {
          return await exportProjectAsAllFormatsZip({ selectedFormats });
        }
        return performExportByMode(mode, { selectedFormats });
      });
    });
    bind(config.cancel, () => {
      closeExportDialog();
    });
    if (supportsDialog && dialog) {
      dialog.addEventListener('cancel', event => {
        event.preventDefault();
        closeExportDialog();
      });
    } else if (dialog) {
      dialog.hidden = true;
    }
    if (!supportsDialog && config.adContainer) {
      config.adContainer.hidden = true;
    }
    if (config.format && config.format.dataset.bound !== 'true') {
      config.format.dataset.bound = 'true';
      config.format.addEventListener('change', () => {
        syncFormatOptions();
        refreshExportScaleControls();
        updateExportFormatAvailability();
        updateExportOriginalToggleUI();
      });
    }
    (Array.isArray(config.formatChoices) ? config.formatChoices : []).forEach(choice => {
      if (!(choice instanceof HTMLButtonElement) || choice.dataset.bound === 'true') {
        return;
      }
      choice.dataset.bound = 'true';
      choice.addEventListener('click', () => {
        if (!(config.format instanceof HTMLSelectElement) || choice.disabled) {
          return;
        }
        const format = String(choice.dataset.exportFormatChoice || 'png');
        const selected = (Array.isArray(config.formatChoices) ? config.formatChoices : [])
          .filter(item => item instanceof HTMLButtonElement && item.getAttribute('aria-pressed') === 'true')
          .map(item => String(item.dataset.exportFormatChoice || ''));
        const isSelected = choice.getAttribute('aria-pressed') === 'true';
        const next = format === 'timelapse' && !isSelected
          ? [format]
          : (selected.includes('timelapse') && !isSelected
            ? [format]
            : (isSelected
          ? selected.filter(value => value !== format)
          : [...selected, format]));
        if (!next.length) {
          return;
        }
        (Array.isArray(config.formatChoices) ? config.formatChoices : []).forEach(item => {
          if (!(item instanceof HTMLButtonElement)) {
            return;
          }
          const active = next.includes(String(item.dataset.exportFormatChoice || ''));
          item.setAttribute('aria-pressed', String(active));
          item.classList.toggle('is-active', active);
        });
        config.format.value = next.length === 1 ? next[0] : 'batchzip';
        config.format.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    if (config.formatHelpButton instanceof HTMLButtonElement
      && config.formatHelp instanceof HTMLElement
      && config.formatHelpButton.dataset.bound !== 'true') {
      config.formatHelpButton.dataset.bound = 'true';
      config.formatHelpButton.addEventListener('click', () => {
        const open = config.formatHelp.hidden;
        config.formatHelp.hidden = !open;
        config.formatHelpButton.setAttribute('aria-expanded', String(open));
      });
    }
    (Array.isArray(config.scaleChoices) ? config.scaleChoices : []).forEach(choice => {
      if (!(choice instanceof HTMLButtonElement) || choice.dataset.bound === 'true') {
        return;
      }
      choice.dataset.bound = 'true';
      choice.addEventListener('click', () => {
        if (choice.disabled) {
          return;
        }
        exportScaleUserOverride = true;
        setExportScale(choice.dataset.exportScaleChoice || 1);
      });
    });
    (Array.isArray(config.batchFormatToggles) ? config.batchFormatToggles : []).forEach(toggle => {
      if (!(toggle instanceof HTMLInputElement) || toggle.dataset.bound === 'true') {
        return;
      }
      toggle.dataset.bound = 'true';
      toggle.addEventListener('change', () => {
        updateExportFormatAvailability();
        updateExportOriginalToggleUI();
      });
    });
    if (config.fileNameInput instanceof HTMLInputElement && config.fileNameInput.dataset.bound !== 'true') {
      config.fileNameInput.dataset.bound = 'true';
      config.fileNameInput.addEventListener('change', event => {
        setExportFileBaseName(event.target.value || state.documentName);
      });
    }
    if (config.includeOriginalToggle instanceof HTMLInputElement && config.includeOriginalToggle.dataset.bound !== 'true') {
      config.includeOriginalToggle.dataset.bound = 'true';
      config.includeOriginalToggle.checked = exportIncludeOriginalSize;
      config.includeOriginalToggle.addEventListener('change', event => {
        exportIncludeOriginalSize = Boolean(event.target.checked);
        scheduleSessionPersist({ includeSnapshots: false });
        updateExportOriginalToggleUI();
        updateExportPreview();
      });
    }
    if (config.saveProjectCompanionToggle instanceof HTMLInputElement
      && config.saveProjectCompanionToggle.dataset.bound !== 'true') {
      config.saveProjectCompanionToggle.dataset.bound = 'true';
      config.saveProjectCompanionToggle.checked = exportSaveProjectCompanion;
      config.saveProjectCompanionToggle.addEventListener('change', event => {
        exportSaveProjectCompanion = Boolean(event.target.checked);
        scheduleSessionPersist({ includeSnapshots: false });
        updateExportProjectCompanionToggleUI();
        updateExportPreview();
      });
    }
    if (config.spriteMapColorSpritesToggle instanceof HTMLInputElement
      && config.spriteMapColorSpritesToggle.dataset.bound !== 'true') {
      config.spriteMapColorSpritesToggle.dataset.bound = 'true';
      config.spriteMapColorSpritesToggle.checked = exportColorSpritesEnabled;
      config.spriteMapColorSpritesToggle.addEventListener('change', event => {
        exportColorSpritesEnabled = Boolean(event.target.checked);
        scheduleSessionPersist({ includeSnapshots: false });
        refreshExportScaleControls();
        updateExportOptionVisibility(config.format?.value || 'png');
      });
    }

    const slider = config.scaleSlider;
    if (slider && slider.dataset.bound !== 'true') {
      slider.dataset.bound = 'true';
      slider.addEventListener('input', event => {
        exportScaleUserOverride = true;
        setExportScale(event.target.value);
      });
    }

    const scaleInput = config.scaleInput;
    if (scaleInput && scaleInput.dataset.bound !== 'true') {
      scaleInput.dataset.bound = 'true';
      scaleInput.addEventListener('change', event => {
        exportScaleUserOverride = true;
        setExportScale(event.target.value);
      });
    }

    const widthInput = config.pixelWidthInput;
    if (widthInput && widthInput.dataset.bound !== 'true') {
      widthInput.dataset.bound = 'true';
      widthInput.addEventListener('change', event => {
        exportScaleUserOverride = true;
        if (!exportSheetInfo) {
          syncExportScaleInputs();
          return;
        }
        const desiredWidth = Math.round(Number(event.target.value));
        if (!Number.isFinite(desiredWidth) || desiredWidth <= 0) {
          syncExportScaleInputs();
          return;
        }
        const baseWidth = Math.max(1, exportSheetInfo.sheetWidth);
        const targetScale = clamp(Math.round(desiredWidth / baseWidth), 1, exportMaxScale || 1);
        setExportScale(targetScale);
      });
    }

    const heightInput = config.pixelHeightInput;
    if (heightInput && heightInput.dataset.bound !== 'true') {
      heightInput.dataset.bound = 'true';
      heightInput.addEventListener('change', event => {
        exportScaleUserOverride = true;
        if (!exportSheetInfo) {
          syncExportScaleInputs();
          return;
        }
        const desiredHeight = Math.round(Number(event.target.value));
        if (!Number.isFinite(desiredHeight) || desiredHeight <= 0) {
          syncExportScaleInputs();
          return;
        }
        const baseHeight = Math.max(1, exportSheetInfo.sheetHeight);
        const targetScale = clamp(Math.round(desiredHeight / baseHeight), 1, exportMaxScale || 1);
        setExportScale(targetScale);
      });
    }

    const gridWidthInput = config.gridWidthInput;
    if (gridWidthInput instanceof HTMLInputElement && gridWidthInput.dataset.bound !== 'true') {
      gridWidthInput.dataset.bound = 'true';
      gridWidthInput.addEventListener('change', event => {
        exportGridTileWidth = normalizeExportGridTileSize(event.target.value, exportGridTileWidth);
        syncExportGridInputs();
        scheduleSessionPersist({ includeSnapshots: false });
        updateExportPreview();
      });
    }

    const gridHeightInput = config.gridHeightInput;
    if (gridHeightInput instanceof HTMLInputElement && gridHeightInput.dataset.bound !== 'true') {
      gridHeightInput.dataset.bound = 'true';
      gridHeightInput.addEventListener('change', event => {
        exportGridTileHeight = normalizeExportGridTileSize(event.target.value, exportGridTileHeight);
        syncExportGridInputs();
        scheduleSessionPersist({ includeSnapshots: false });
        updateExportPreview();
      });
    }

    syncExportGridInputs();
    syncFormatOptions();
    updateExportFormatAvailability();
    updateExportOriginalToggleUI();
  }

  function setupExportInterstitialDialog() {
    const dialog = dom.exportInterstitial?.dialog;
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
      if (dialog) {
        dialog.hidden = true;
      }
      return;
    }
    dom.exportInterstitial?.close?.addEventListener('click', () => {
      closeExportInterstitial({ runPendingExport: true });
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeExportInterstitial({ runPendingExport: true });
    });
    dialog.addEventListener('close', () => {
      exportInterstitialAdRequested = false;
      document.body.classList.remove('is-export-interstitial-active');
    });
  }

  function setupLoginPromptDialog() {
    const dialog = dom.loginPrompt?.dialog;
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
      if (dialog) {
        dialog.hidden = true;
      }
      return;
    }
    dom.loginPrompt?.close?.addEventListener('click', () => {
      closeLoginPromptDialog();
    });
    if (dom.loginPrompt?.goHome instanceof HTMLAnchorElement) {
      syncPixieedAccountLoginPromptLink();
      dom.loginPrompt.goHome.addEventListener('click', event => {
        event.preventDefault();
        startPixieedAccountLoginFlow({ closePrompt: true });
      });
    }
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeLoginPromptDialog();
    });
  }

  function setupToolSpotlightDialog() {
    const dialog = dom.toolSpotlight?.dialog;
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
      if (dialog) {
        dialog.hidden = true;
      }
      return;
    }
    dom.toolSpotlight?.close?.addEventListener('click', () => {
      closeToolSpotlightDialog();
    });
    dom.toolSpotlight?.goHome?.addEventListener('click', () => {
      closeToolSpotlightDialog();
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeToolSpotlightDialog();
    });
  }

  return Object.freeze({
    setupDialogAutoDismiss,
    setupHelpPanel,
    setupUpdateHistoryDialog,
    setupExportDialog,
    setupExportInterstitialDialog,
    setupLoginPromptDialog,
    setupToolSpotlightDialog,
  });
      }
    })(scope);
  }

  root.dialogSetupUtils = Object.freeze({
    createDialogSetupUtils,
  });
})();
