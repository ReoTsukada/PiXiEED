(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createUiActionButtonsWorkflowUtils(rawScope = {}) {
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
  function updateVirtualCursorActionToolButtons() {
    const available = true;
    const enabled = Boolean(state.showVirtualCursor);
    const toggleButtons = Array.from(document.querySelectorAll(`.tool-button[data-tool="${TOOL_ACTION_VIRTUAL_CURSOR_TOGGLE}"], [data-ui-action="${TOP_UI_ACTION_VIRTUAL_CURSOR_TOGGLE}"]`));
    toggleButtons.forEach(button => {
      if (button instanceof HTMLButtonElement) {
        button.hidden = !available;
        button.disabled = !available;
      } else if (button instanceof HTMLElement) {
        button.hidden = !available;
      }
      if (button instanceof HTMLElement) {
        button.setAttribute('aria-hidden', String(!available));
      }
      const icon = button.querySelector('img');
      const srOnly = button.querySelector('.sr-only');
      const groupLabel = button.querySelector('.tool-group-label');
      const label = srOnly instanceof HTMLElement
        ? srOnly
        : (groupLabel instanceof HTMLElement ? groupLabel : button.querySelector('span'));
      const controlLabel = localizeText(
        enabled ? '仮想カーソルを非表示' : '仮想カーソルを表示',
        enabled ? 'Hide Virtual Cursor' : 'Show Virtual Cursor'
      );
      const visibleLabel = localizeText('仮想カーソル', 'Virtual Cursor');
      button.classList.toggle('is-active', enabled);
      button.setAttribute('aria-pressed', String(enabled));
      button.setAttribute('aria-label', controlLabel);
      button.setAttribute('title', controlLabel);
      if (icon instanceof HTMLImageElement) {
        icon.src = 'assets/icons/tool-cursor.png';
        icon.alt = '仮想カーソル';
      }
      if (label) {
        label.textContent = visibleLabel;
      }
    });
  }

  function updateLocalCanvasActionToolButtons() {
    const localCanvasCount = normalizeLocalViewportCanvasState(
      localViewportCanvasState,
      LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE
    ).count;
    const canEditProjectStructure = canCurrentClientEditProjectStructure();
    const voxelModeEnabled = isVoxelExtensionModeEnabled();
    const available = MULTI_CANVAS_FEATURE_ENABLED && !voxelModeEnabled;
    const enabled = available && localCanvasCount > 0;
    const disabled = !available || !canEditProjectStructure;
    const toggleButtons = Array.from(document.querySelectorAll(
      `.tool-button[data-tool="${TOOL_ACTION_LOCAL_CANVAS_TOGGLE}"], [data-ui-action="${TOP_UI_ACTION_LOCAL_CANVAS_TOGGLE}"]`
    ));
    toggleButtons.forEach(button => {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      button.hidden = !MULTI_CANVAS_FEATURE_ENABLED;
      button.setAttribute('aria-hidden', String(!MULTI_CANVAS_FEATURE_ENABLED));
      if (button instanceof HTMLButtonElement) {
        button.disabled = disabled;
      }
      button.classList.toggle('is-active', enabled);
      button.setAttribute('aria-pressed', String(enabled));
      const controlLabel = localizeText(
        enabled ? 'マルチキャンバスをオフ' : 'マルチキャンバスをオン',
        enabled ? 'Turn Multi Canvas Off' : 'Turn Multi Canvas On'
      );
      button.setAttribute('aria-label', controlLabel);
      button.setAttribute('title', controlLabel);
      const srOnly = button.querySelector('.sr-only');
      const groupLabel = button.querySelector('.tool-group-label');
      const label = srOnly instanceof HTMLElement
        ? srOnly
        : (groupLabel instanceof HTMLElement ? groupLabel : button.querySelector('span'));
      if (label instanceof HTMLElement) {
        label.textContent = localizeText('マルチキャンバス', 'Multi Canvas');
      }
    });
  }

  function updateFloatingPreviewActionToolButtons() {
    const voxelModeEnabled = isVoxelExtensionModeEnabled();
    const enabled = Boolean(state.floatingPreview?.enabled) || voxelModeEnabled;
    const disabled = voxelModeEnabled;
    const toggleButtons = Array.from(document.querySelectorAll(
      `.tool-button[data-tool="${TOOL_ACTION_FLOATING_PREVIEW_TOGGLE}"], [data-ui-action="${TOP_UI_ACTION_FLOATING_PREVIEW_TOGGLE}"]`
    ));
    toggleButtons.forEach(button => {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      if (button instanceof HTMLButtonElement) {
        button.disabled = disabled;
      }
      button.classList.toggle('is-active', enabled);
      button.setAttribute('aria-pressed', String(enabled));
      const controlLabel = localizeText(
        enabled ? '小窓プレビューを非表示' : '小窓プレビューを表示',
        enabled ? 'Hide Floating Preview' : 'Show Floating Preview'
      );
      button.setAttribute('aria-label', controlLabel);
      button.setAttribute('title', controlLabel);
      const srOnly = button.querySelector('.sr-only');
      const groupLabel = button.querySelector('.tool-group-label');
      const label = srOnly instanceof HTMLElement
        ? srOnly
        : (groupLabel instanceof HTMLElement ? groupLabel : button.querySelector('span'));
      if (label instanceof HTMLElement) {
        label.textContent = localizeText('小窓プレビュー', 'Floating Preview');
      }
    });
  }

  function getMirrorActionAnchor() {
    const candidates = Array.from(document.querySelectorAll(
      `[data-ui-action="${TOP_UI_ACTION_MIRROR_POPUP}"], .tool-button[data-tool="${TOOL_ACTION_MIRROR_POPUP}"]`
    ));
    const visible = candidates.find(node => (
      node instanceof HTMLElement
      && !node.hidden
      && node.getClientRects().length > 0
    ));
    if (visible instanceof HTMLElement) {
      return visible;
    }
    for (const node of candidates) {
      if (node instanceof HTMLElement) {
        return node;
      }
    }
    return null;
  }

  function updateMirrorActionButtons() {
    const buttons = Array.from(document.querySelectorAll(`.tool-button[data-tool="${TOOL_ACTION_MIRROR_POPUP}"], [data-ui-action="${TOP_UI_ACTION_MIRROR_POPUP}"]`));
    const active = Boolean(getNormalizedMirrorState().enabled);
    const controlLabel = localizeText(
      active ? 'ミラーモードをオフ' : 'ミラーモードをオン',
      active ? 'Turn Mirror Mode Off' : 'Turn Mirror Mode On'
    );
    const label = localizeText('対称', 'Mirror');
    buttons.forEach(button => {
      if (!(button instanceof HTMLElement)) {
        return;
      }
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', controlLabel);
      button.setAttribute('title', controlLabel);
      const srOnly = button.querySelector('.sr-only');
      const groupLabel = button.querySelector('.tool-group-label');
      if (srOnly instanceof HTMLElement) {
        srOnly.textContent = label;
      } else if (groupLabel instanceof HTMLElement) {
        groupLabel.textContent = label;
      }
    });
  }



  return Object.freeze({
    updateVirtualCursorActionToolButtons,
    updateLocalCanvasActionToolButtons,
    updateFloatingPreviewActionToolButtons,
    getMirrorActionAnchor,
    updateMirrorActionButtons,
  });
      }
    })(scope);
  }

  root.uiActionButtonsWorkflowUtils = Object.freeze({
    createUiActionButtonsWorkflowUtils,
  });
})();
