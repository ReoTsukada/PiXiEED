(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createHistoryGuardWorkflowUtils(rawScope = {}) {
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
  function buildGlobalHistoryConfirmContent(action, historyLabel = '') {
    const normalizedAction = action === 'redo' ? 'redo' : 'undo';
    const title = normalizedAction === 'redo'
      ? localizeText('全体Redo', 'Shared Redo')
      : localizeText('全体Undo', 'Shared Undo');
    const operationName = getGuardedHistoryLabelDisplayName(historyLabel);
    const message = normalizedAction === 'redo'
      ? localizeText(
        `次にやり直すのは「${operationName}」です。`,
        `The next action to redo is "${operationName}".`
      )
      : localizeText(
        `次に戻すのは「${operationName}」です。`,
        `The next action to undo is "${operationName}".`
      );
    const detail = localizeText(
      'この操作はプロジェクト全体に反映されます。続ける前に内容を確認してください。',
      'This updates the whole project. Check before continuing.'
    );
    const confirmLabel = normalizedAction === 'redo'
      ? localizeText('全体Redoする', 'Run Shared Redo')
      : localizeText('全体Undoする', 'Run Shared Undo');
    const fallbackMessage = `${message}\n${detail}\n${localizeText('続けますか？', 'Continue?')}`;
    return {
      title,
      message,
      detail,
      confirmLabel,
      fallbackMessage,
    };
  }

  function resolveGlobalHistoryConfirm(accepted) {
    const resolver = globalHistoryConfirmState.resolve;
    globalHistoryConfirmState.resolve = null;
    if (typeof resolver === 'function') {
      resolver(Boolean(accepted));
    }
  }

  function closeGlobalHistoryConfirmDialog({ accepted = false } = {}) {
    const dialog = dom.globalHistoryConfirm?.dialog;
    globalHistoryConfirmState.closing = true;
    resolveGlobalHistoryConfirm(accepted);
    if (dialog instanceof HTMLDialogElement && dialog.open) {
      dialog.close();
    }
    globalHistoryConfirmState.closing = false;
  }

  async function requestGlobalHistoryConfirm(action, historyLabel = '') {
    const content = buildGlobalHistoryConfirmContent(action, historyLabel);
    const dialog = dom.globalHistoryConfirm?.dialog;
    if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') {
      return window.confirm(content.fallbackMessage);
    }
    if (dom.globalHistoryConfirm?.title) {
      dom.globalHistoryConfirm.title.textContent = content.title;
    }
    if (dom.globalHistoryConfirm?.message) {
      dom.globalHistoryConfirm.message.textContent = content.message;
    }
    if (dom.globalHistoryConfirm?.detail) {
      dom.globalHistoryConfirm.detail.textContent = content.detail;
    }
    if (dom.globalHistoryConfirm?.confirm) {
      dom.globalHistoryConfirm.confirm.textContent = content.confirmLabel;
    }
    if (globalHistoryConfirmState.resolve) {
      resolveGlobalHistoryConfirm(false);
    }
    return new Promise(resolve => {
      globalHistoryConfirmState.resolve = resolve;
      try {
        if (dialog.open) {
          dialog.close();
        }
        dialog.showModal();
        window.requestAnimationFrame(() => {
          dom.globalHistoryConfirm?.confirm?.focus();
        });
      } catch (error) {
        console.warn('Failed to open global history confirm dialog', error);
        globalHistoryConfirmState.resolve = null;
        resolve(window.confirm(content.fallbackMessage));
      }
    });
  }

  function peekGuardedHistoryActionLabel(action) {
    const normalizedAction = action === 'redo' ? 'redo' : 'undo';
    if (isSharedProjectCollaborativeMode()) {
      return null;
    }
    if (!multiState.connected || !isMultiMasterMode()) {
      return null;
    }
    if (hasPendingSelectionMove() || hasPendingCurveUndoRedoInterception()) {
      return null;
    }
    if (normalizedAction === 'undo' && history.pending?.dirty) {
      return isGuardedMultiSharedHistoryLabel(history.pending.label)
        ? String(history.pending.label || '')
        : null;
    }
    if (normalizedAction === 'redo' && history.pending?.dirty) {
      return null;
    }
    const stack = normalizedAction === 'redo' ? history.future : history.past;
    if (!Array.isArray(stack) || !stack.length) {
      return null;
    }
    const label = getHistoryEntryLabel(stack[stack.length - 1]);
    return isGuardedMultiSharedHistoryLabel(label) ? label : null;
  }

  async function runHistoryActionWithGuard(action) {
    const normalizedAction = action === 'redo' ? 'redo' : 'undo';
    const guardedLabel = peekGuardedHistoryActionLabel(normalizedAction);
    if (guardedLabel !== null) {
      const accepted = await requestGlobalHistoryConfirm(normalizedAction, guardedLabel);
      if (!accepted) {
        return;
      }
    }
    if (normalizedAction === 'redo') {
      redo();
    } else {
      undo();
    }
  }



  return Object.freeze({
    buildGlobalHistoryConfirmContent,
    resolveGlobalHistoryConfirm,
    closeGlobalHistoryConfirmDialog,
    requestGlobalHistoryConfirm,
    peekGuardedHistoryActionLabel,
    runHistoryActionWithGuard,
  });
      }
    })(scope);
  }

  root.historyGuardWorkflowUtils = Object.freeze({
    createHistoryGuardWorkflowUtils,
  });
})();
