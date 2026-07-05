(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPixfindModeUtils(rawScope = {}) {
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
  function getPixfindFramePair() {
    if (!Array.isArray(state.frames) || state.frames.length < 2) {
      return null;
    }
    const originalFrame = state.frames[0];
    const diffFrame = state.frames[1];
    if (!originalFrame || !diffFrame) {
      return null;
    }
    return { originalFrame, diffFrame };
  }

  function getPixfindMultiDisabledReason() {
    if (multiState.connecting) {
      return localizeText(
        '共有モード接続中は間違い探しモードを使えません',
        'PiXFiND mode is unavailable while connecting to collab'
      );
    }
    if (multiState.connected) {
      return localizeText(
        '共有モード中は間違い探しモードを使えません',
        'PiXFiND mode is unavailable during collab'
      );
    }
    return '';
  }

  function disablePixfindForMultiSession({ announce = true } = {}) {
    if (!pixfindModeEnabled) {
      updatePixfindModeUI();
      return false;
    }
    pixfindModeEnabled = false;
    updatePixfindModeUI();
    scheduleSessionPersist({ includeSnapshots: false });
    if (announce) {
      const message = localizeText(
        '共有モード開始のため間違い探しモードをOFFにしました',
        'PiXFiND mode was turned off because collab started'
      );
      updateAutosaveStatus(message, 'info');
      setMultiStatus(message, 'info');
    }
    return true;
  }

  function getPixfindSendDisabledReason() {
    const pixfindMultiReason = getPixfindMultiDisabledReason();
    if (pixfindMultiReason) {
      return pixfindMultiReason;
    }
    const exportReason = getMultiExportDisabledReason('pixfind');
    if (exportReason) {
      return exportReason;
    }
    if (!pixfindModeEnabled) {
      return localizeText('間違い探しモードをONにしてください', 'Turn on PiXFiND mode first');
    }
    if (!getPixfindFramePair()) {
      return localizeText(
        'フレーム2がありません。間違い探しモードをONにすると自動で作成されます',
        'Frame 2 is missing. It is created automatically when PiXFiND mode is enabled.'
      );
    }
    return '';
  }

  function setPixfindHelpExpanded(expanded) {
    const next = Boolean(expanded);
    if (dom.controls.pixfindHelpText instanceof HTMLElement) {
      dom.controls.pixfindHelpText.hidden = !next;
      dom.controls.pixfindHelpText.setAttribute('aria-hidden', String(!next));
    }
    if (dom.controls.togglePixfindHelp instanceof HTMLButtonElement) {
      dom.controls.togglePixfindHelp.setAttribute('aria-expanded', String(next));
      dom.controls.togglePixfindHelp.classList.toggle('is-active', next);
      dom.controls.togglePixfindHelp.textContent = next
        ? localizeText('間違い探しモードの説明を閉じる', 'Hide PiXFiND Mode Help')
        : localizeText('間違い探しモードの説明', 'PiXFiND Mode Help');
    }
  }

  function updatePixfindModeUI() {
    const modeControl = dom.controls.togglePixfindMode;
    const modeDisabledReason = getPixfindMultiDisabledReason();
    const sendDisabledReason = getPixfindSendDisabledReason();
    if (modeControl instanceof HTMLInputElement) {
      modeControl.checked = pixfindModeEnabled;
      modeControl.disabled = Boolean(modeDisabledReason);
      if (modeDisabledReason) {
        modeControl.title = modeDisabledReason;
      } else {
        modeControl.removeAttribute('title');
      }
    }
    if (dom.controls.sendToPixfind) {
      dom.controls.sendToPixfind.disabled = Boolean(sendDisabledReason);
      if (sendDisabledReason) {
        dom.controls.sendToPixfind.title = sendDisabledReason;
      } else {
        dom.controls.sendToPixfind.removeAttribute('title');
      }
    }
    if (dom.controls.pixfindActionReason) {
      dom.controls.pixfindActionReason.textContent = sendDisabledReason || localizeText('PiXFiNDへ送信できます', 'Ready to send to PiXFiND');
    }
  }

  function ensurePixfindDiffFrame({ quiet = false, recordHistory = true, forceRecreate = false } = {}) {
    if (!Array.isArray(state.frames) || !state.frames.length) {
      if (!quiet) {
        updateAutosaveStatus(localizeText('PiXFiND用の原本フレームがありません', 'No original frame found for PiXFiND'), 'warn');
      }
      return false;
    }
    const originalFrame = state.frames[0];
    if (!originalFrame || !Array.isArray(originalFrame.layers) || !originalFrame.layers.length) {
      if (!quiet) {
        updateAutosaveStatus(localizeText('PiXFiND用の原本フレームを作成できませんでした', 'Failed to prepare the original frame for PiXFiND'), 'warn');
      }
      return false;
    }
    const hadDiffFrame = Boolean(state.frames[1]);
    if (hadDiffFrame && !forceRecreate) {
      return true;
    }
    const preferredLayerIndex = originalFrame.layers.findIndex(layer => layer.id === state.activeLayer);
    if (recordHistory) {
      beginHistory(hadDiffFrame ? 'resetPixfindFrame2' : 'createPixfindFrame2');
    }
    const diffFrame = createFrame(getDefaultFrameName(2), originalFrame.layers, state.width, state.height);
    if (Number.isFinite(originalFrame.duration) && originalFrame.duration > 0) {
      diffFrame.duration = originalFrame.duration;
    }
    if (hadDiffFrame) {
      state.frames[1] = diffFrame;
    } else {
      state.frames.splice(1, 0, diffFrame);
    }
    state.activeFrame = 1;
    if (diffFrame.layers.length) {
      const targetLayerIndex = preferredLayerIndex >= 0
        ? clamp(preferredLayerIndex, 0, diffFrame.layers.length - 1)
        : diffFrame.layers.length - 1;
      state.activeLayer = diffFrame.layers[targetLayerIndex].id;
    }
    markHistoryDirty();
    scheduleSessionPersist();
    renderFrameList();
    renderLayerList();
    requestRender();
    requestOverlayRender();
    if (recordHistory) {
      commitHistory();
    }
    updatePixfindModeUI();
    if (!quiet) {
      updateAutosaveStatus(
        hadDiffFrame
          ? localizeText('PiXFiND用にフレーム2をフレーム1から作り直しました', 'Rebuilt Frame 2 from Frame 1 for PiXFiND')
          : localizeText('PiXFiND用にフレーム2を作成しました。フレーム2を編集して送信してください', 'Created Frame 2 for PiXFiND. Edit Frame 2 and send it.'),
        'success'
      );
    }
    return true;
  }

  function setPixfindModeEnabled(enabled, { confirmFirst = true, confirmOverwrite = true, quiet = false } = {}) {
    if (!canCurrentClientEditProjectStructure({ announce: true })) {
      if (!isSharedProjectCollaborativeMode()) {
        setMultiStatus(localizeText('参加/視聴モードでは間違い探し設定はマスターのみ変更できます', 'In participant/viewer mode, only the master can change PiXFiND settings'), 'warn');
      }
      return false;
    }
    const next = Boolean(enabled);
    const multiDisabledReason = getPixfindMultiDisabledReason();
    if (next && multiDisabledReason) {
      if (!quiet) {
        updateAutosaveStatus(multiDisabledReason, 'warn');
        if (multiState.connected || multiState.connecting) {
          setMultiStatus(multiDisabledReason, 'warn');
        }
      }
      updatePixfindModeUI();
      return false;
    }
    if (next === pixfindModeEnabled) {
      updatePixfindModeUI();
      return true;
    }
    if (next && confirmFirst && !pixfindModeFirstEnableConfirmed) {
      const accepted = window.confirm(
        localizeText(
          '間違い探しモードを初めてONにします。フレーム1を原本、フレーム2を差分として使います。続けますか？',
          'Enable PiXFiND mode for the first time? Frame 1 will be original and Frame 2 will be diff. Continue?'
        )
      );
      if (!accepted) {
        return false;
      }
      pixfindModeFirstEnableConfirmed = true;
    }
    if (next && confirmOverwrite && Array.isArray(state.frames) && state.frames.length >= 2) {
      const acceptedOverwrite = window.confirm(
        localizeText(
          '間違い探しモードをONにすると、現在のフレーム2はフレーム1の内容で上書きされます。続けますか？',
          'Enabling PiXFiND mode overwrites current Frame 2 with Frame 1 content. Continue?'
        )
      );
      if (!acceptedOverwrite) {
        return false;
      }
    }
    pixfindModeEnabled = next;
    if (next) {
      const prepared = ensurePixfindDiffFrame({ quiet: true, recordHistory: true, forceRecreate: true });
      const pair = getPixfindFramePair();
      if (pair && state.activeFrame !== 1) {
        setActiveFrameIndex(1, { wrap: false, persist: false, render: true });
      }
      if (!quiet) {
        if (prepared && pair) {
          updateAutosaveStatus(
            localizeText(
              '間違い探しモードをONにしました。フレーム1=原本、フレーム2=差分です',
              'PiXFiND mode enabled. Frame 1 = original, Frame 2 = diff.'
            ),
            'info'
          );
        } else {
          updateAutosaveStatus(
            localizeText(
              '間違い探しモードをONにしましたが、フレーム2を用意できませんでした',
              'PiXFiND mode enabled, but Frame 2 could not be prepared.'
            ),
            'warn'
          );
        }
      }
    } else {
      if (!quiet) {
        updateAutosaveStatus(localizeText('間違い探しモードをOFFにしました', 'PiXFiND mode disabled'), 'info');
      }
    }
    updatePixfindModeUI();
    scheduleSessionPersist();
    return true;
  }

  function syncPixfindSnapshotAfterDocumentReset() {
    updatePixfindModeUI();
  }

  function exportProjectToPixfind() {
    if (!ensureCurrentClientCanExportProject({ announce: true, format: 'pixfind' })) {
      return;
    }
    if (!pixfindModeEnabled) {
      updateAutosaveStatus(localizeText('間違い探しモードをONにしてください', 'Turn on PiXFiND mode first'), 'warn');
      return;
    }
    const pair = getPixfindFramePair();
    if (!pair) {
      updateAutosaveStatus(localizeText('PiXFiND出力にはフレーム1とフレーム2が必要です', 'PiXFiND export requires Frame 1 and Frame 2'), 'warn');
      return;
    }
    try {
      const basePixels = compositeFramePixels(pair.originalFrame, state.width, state.height, state.palette);
      const diffPixels = compositeFramePixels(pair.diffFrame, state.width, state.height, state.palette);
      const baseCanvas = createFrameCanvas(basePixels, state.width, state.height);
      const diffCanvas = createFrameCanvas(diffPixels, state.width, state.height);
      const originalDataUrl = baseCanvas.toDataURL('image/png');
      const diffDataUrl = diffCanvas.toDataURL('image/png');
      if (!originalDataUrl || !diffDataUrl) {
        throw new Error('Missing PiXFiND data URL');
      }
      try {
        const payload = {
          originalDataUrl,
          diffDataUrl,
          canvasSize: state.width === state.height ? state.width : `${state.width}x${state.height}`,
          width: state.width,
          height: state.height,
          createdAt: new Date().toISOString(),
        };
        localStorage.setItem(PIXFIND_UPLOAD_KEY, JSON.stringify(payload));
      } catch (error) {
        console.warn('pixfind upload store failed', error);
      }
      markDocumentDurablySaved();
      window.location.href = '../pixfind/index.html#creator';
    } catch (error) {
      console.error('PiXFiND export failed', error);
      updateAutosaveStatus(localizeText('PiXFiND出力に失敗しました', 'PiXFiND export failed'), 'error');
    }
  }

        return Object.freeze({
          getPixfindFramePair,
          getPixfindMultiDisabledReason,
          disablePixfindForMultiSession,
          getPixfindSendDisabledReason,
          setPixfindHelpExpanded,
          updatePixfindModeUI,
          ensurePixfindDiffFrame,
          setPixfindModeEnabled,
          syncPixfindSnapshotAfterDocumentReset,
          exportProjectToPixfind,
        });
      }
    })(scope);
  }

  root.pixfindModeUtils = Object.freeze({
    createPixfindModeUtils,
  });
})();
