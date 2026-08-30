(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createStartupTailWorkflowUtils(rawScope = {}) {
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
  function setupGlobalFocusDismiss() {
    document.addEventListener(
      'pointerdown',
      (event) => {
        const isMouseLikePointer = event.pointerType === 'mouse' && !isCoarsePointerDevice();
        const targetElement = event.target instanceof Element ? event.target : null;
        if (hasPendingSelectionMove()) {
          const keepCanvasFlow = Boolean(
            targetElement
            && (isCanvasSurfaceTarget(targetElement) || isViewportControlTarget(targetElement))
          );
          if (!keepCanvasFlow) {
            confirmPendingSelectionMove({ allowOutOfBoundsClip: true });
          }
        }
        if (!isMouseLikePointer) {
          return;
        }
        const active = document.activeElement;
        if (!isInputControlElement(active)) {
          return;
        }
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
        const shouldRetain = path.some((node) => {
          if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
          return isInputControlElement(node) || isLabelForElement(node, active);
        });
        if (shouldRetain) {
          return;
        }
        if (typeof active.blur === 'function') {
          active.blur();
        }
      },
      true
    );
  }

  function setupQrEditModeControls() {
    if (dom.qrEditPanel instanceof HTMLElement) {
      dom.qrEditPanel.addEventListener('pointerdown', beginQrEditPanelDrag, { passive: false });
      ['pointerdown', 'click', 'dblclick'].forEach(type => {
        dom.qrEditPanel.addEventListener(type, event => {
          event.stopPropagation();
        }, { passive: false });
      });
    }
    if (dom.qrEditPanelClose instanceof HTMLButtonElement) {
      dom.qrEditPanelClose.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setQrEditPanelVisibleForActiveProject(false);
        if (dom.controls.toggleQrMode instanceof HTMLInputElement) {
          dom.controls.toggleQrMode.checked = false;
        }
        updateAutosaveStatus('QRパネルを非表示にしました', 'info');
      });
    }
    window.addEventListener('resize', refreshQrEditPanelViewportPosition, { passive: true });
    window.addEventListener('orientationchange', refreshQrEditPanelViewportPosition, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', refreshQrEditPanelViewportPosition, { passive: true });
      window.visualViewport.addEventListener('scroll', refreshQrEditPanelViewportPosition, { passive: true });
    }
  }

  async function runStartupTaskWithTimeout(task, {
    timeoutMs = STARTUP_RESTORE_TIMEOUT_MS,
    fallbackValue = false,
    label = 'startup-task',
    clearLoadingOnTimeout = false,
  } = {}) {
    if (startupRestoreCancelRequested) {
      return fallbackValue;
    }
    const normalizedTimeout = Math.max(0, Math.round(Number(timeoutMs) || 0));
    const taskPromise = Promise.resolve().then(() => (
      typeof task === 'function' ? task() : task
    ));
    if (normalizedTimeout <= 0) {
      return await taskPromise;
    }
    let timeoutId = null;
    let cancelResolver = null;
    const cancelPromise = new Promise(resolve => {
      cancelResolver = () => resolve(fallbackValue);
      startupRestoreCancelResolvers.add(cancelResolver);
    });
    const timeoutPromise = new Promise(resolve => {
      timeoutId = window.setTimeout(() => {
        console.warn('[startup] task-timeout', {
          label,
          timeoutMs: normalizedTimeout,
        });
        if (clearLoadingOnTimeout) {
          cancelStartupRestoreProgress(`${label}-timeout`);
        }
        resolve(fallbackValue);
      }, normalizedTimeout);
    });
    try {
      return await Promise.race([taskPromise, timeoutPromise, cancelPromise]);
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      if (cancelResolver) {
        startupRestoreCancelResolvers.delete(cancelResolver);
      }
    }
  }

  return Object.freeze({
    setupGlobalFocusDismiss,
    setupQrEditModeControls,
    runStartupTaskWithTimeout,
  });
      }
    })(scope);
  }

  root.startupTailWorkflowUtils = Object.freeze({
    createStartupTailWorkflowUtils,
  });
})();
