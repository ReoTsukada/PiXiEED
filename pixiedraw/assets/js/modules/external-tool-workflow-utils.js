(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createExternalToolWorkflowUtils(rawScope = {}) {
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
  function syncExternalToolActionButtons() {
    dom.topActionButtons.forEach(button => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const toolId = button.dataset.externalTool || '';
      const tool = getExternalToolDefinition(toolId) || getExternalToolDefinitionByAction(button.dataset.uiAction || '');
      if (!tool) {
        return;
      }
      button.dataset.externalTool = tool.id;
      const icon = button.querySelector('img');
      if (icon instanceof HTMLImageElement && typeof tool.iconSrc === 'string' && tool.iconSrc) {
        icon.setAttribute('src', tool.iconSrc);
        icon.alt = '';
      }
    });
  }

  async function launchLensCameraMode() {
    const lensTool = getExternalToolDefinition(EXTERNAL_TOOL_PIXIEELENS_ID);
    const lensToolName = getExternalToolLocalizedName(lensTool) || 'PiXiEELENS';
    const fallbackGroup = TOOL_TO_GROUP[state.tool] || 'pen';
    if (TOOL_GROUPS[fallbackGroup] && state.activeToolGroup !== fallbackGroup) {
      state.activeToolGroup = fallbackGroup;
      updateToolGroupButtons();
      updateToolVisibility();
    }
    if (!AUTOSAVE_SUPPORTED && hasDocumentUnsavedChanges()) {
      const accepted = window.confirm(
        localizeText(
          'このブラウザでは自動保存が使えません。現在の内容を保存せずにカメラモードへ移動しますか？',
          'Autosave is unavailable in this browser. Leave for Camera Mode without saving the current project?'
        )
      );
      if (!accepted) {
        return false;
      }
    } else if (AUTOSAVE_SUPPORTED) {
      try {
        if (!autosaveProjectId) {
          setActiveAutosaveProjectId(createAutosaveProjectId());
        }
        markAutosaveDirty();
        await writeAutosaveSnapshot(true);
      } catch (error) {
        console.warn(`Failed to save project before launching ${lensToolName}`, error);
      }
    }
    const lensUrl = buildLensCameraModeUrl();
    try {
      window.location.assign(lensUrl);
      return true;
    } catch (error) {
      console.warn(`Failed to open ${lensToolName}`, error);
      updateAutosaveStatus(
        localizeText(`${lensToolName} を開けませんでした`, `Failed to open ${lensToolName}`),
        'error'
      );
      return false;
    }
  }

  async function launchQrEditorMode() {
    const qrTool = getExternalToolDefinition(EXTERNAL_TOOL_QR_MAKER_ID);
    const qrToolName = getExternalToolLocalizedName(qrTool) || 'QRコードリーダー';
    const fallbackGroup = TOOL_TO_GROUP[state.tool] || 'pen';
    if (TOOL_GROUPS[fallbackGroup] && state.activeToolGroup !== fallbackGroup) {
      state.activeToolGroup = fallbackGroup;
      updateToolGroupButtons();
      updateToolVisibility();
    }
    if (!AUTOSAVE_SUPPORTED && hasDocumentUnsavedChanges()) {
      const accepted = window.confirm(
        localizeText(
          'このブラウザでは自動保存が使えません。現在の内容を保存せずにQR編集モードへ移動しますか？',
          'Autosave is unavailable in this browser. Leave for QR Edit Mode without saving the current project?'
        )
      );
      if (!accepted) {
        return false;
      }
    } else if (AUTOSAVE_SUPPORTED) {
      try {
        if (!autosaveProjectId) {
          setActiveAutosaveProjectId(createAutosaveProjectId());
        }
        markAutosaveDirty();
        await writeAutosaveSnapshot(true);
      } catch (error) {
        console.warn(`Failed to save project before launching ${qrToolName}`, error);
      }
    }
    const qrUrl = buildQrEditorModeUrl();
    try {
      window.location.assign(qrUrl);
      return true;
    } catch (error) {
      console.warn(`Failed to open ${qrToolName}`, error);
      updateAutosaveStatus(
        localizeText(`${qrToolName} を開けませんでした`, `Failed to open ${qrToolName}`),
        'error'
      );
      return false;
    }
  }

  return Object.freeze({
    syncExternalToolActionButtons,
    launchLensCameraMode,
    launchQrEditorMode,
  });
      }
    })(scope);
  }

  root.externalToolWorkflowUtils = Object.freeze({
    createExternalToolWorkflowUtils,
  });
})();
