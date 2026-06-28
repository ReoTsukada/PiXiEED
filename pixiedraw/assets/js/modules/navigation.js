(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createNavigation({
    EXTERNAL_TOOLS,
    EXTERNAL_TOOL_PIXIEELENS_ID,
    EXTERNAL_TOOL_QR_MAKER_ID,
    LENS_CAMERA_RETURN_MODE_SELF,
    LENS_CAMERA_RETURN_QUERY_KEY,
    LENS_CAMERA_DRAW_URL_QUERY_KEY,
    localizeText,
  } = {}) {
    function getExternalToolDefinition(toolId = '') {
      if (!toolId || typeof toolId !== 'string') {
        return null;
      }
      return EXTERNAL_TOOLS[toolId] || null;
    }

    function getExternalToolDefinitionByAction(action = '') {
      const tools = Object.values(EXTERNAL_TOOLS);
      return tools.find(tool => tool?.action === action) || null;
    }

    function getExternalToolLocalizedName(tool) {
      if (!tool?.displayName) {
        return '';
      }
      return localizeText(tool.displayName.ja, tool.displayName.en);
    }

    function getExternalToolLocalizedActionLabel(tool) {
      if (!tool?.actionLabel) {
        return '';
      }
      return localizeText(tool.actionLabel.ja, tool.actionLabel.en);
    }

    function isNativeAppRuntime() {
      if (typeof window === 'undefined') {
        return false;
      }
      const capacitor = window.Capacitor || globalThis.Capacitor;
      try {
        if (capacitor && typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform()) {
          return true;
        }
      } catch (error) {
        // Ignore native runtime detection failures and continue with fallback checks.
      }
      const protocol = String(window.location?.protocol || '');
      return protocol === 'capacitor:' || protocol === 'ionic:' || protocol === 'app:';
    }

    function buildLensCameraModeUrl({ returnMode = LENS_CAMERA_RETURN_MODE_SELF } = {}) {
      const lensTool = getExternalToolDefinition(EXTERNAL_TOOL_PIXIEELENS_ID);
      const nativeRuntime = isNativeAppRuntime();
      const fallbackPath = nativeRuntime
        ? '../pixiee-lens/index.html'
        : (lensTool?.launchUrl || 'https://pixieed.jp/pixiee-lens/index.html');
      const protocol = lensTool?.protocol || {};
      const returnQueryKey = protocol.returnQueryKey || LENS_CAMERA_RETURN_QUERY_KEY;
      const drawUrlQueryKey = protocol.drawUrlQueryKey || LENS_CAMERA_DRAW_URL_QUERY_KEY;
      try {
        const lensTarget = nativeRuntime
          ? new URL('../pixiee-lens/index.html', window.location.href)
          : new URL(lensTool?.launchUrl || fallbackPath);
        const lensUrl = new URL(lensTarget.toString());
        if (typeof returnMode === 'string' && returnMode) {
          lensUrl.searchParams.set(returnQueryKey, returnMode);
        }
        const drawUrl = buildLensCameraReturnDrawUrl();
        if (drawUrl) {
          lensUrl.searchParams.set(drawUrlQueryKey, drawUrl);
        }
        return lensUrl.toString();
      } catch (error) {
        return fallbackPath;
      }
    }

    function buildLensCameraReturnDrawUrl() {
      if (typeof window === 'undefined' || !window.location) {
        return '';
      }
      try {
        const drawUrl = new URL(window.location.href);
        drawUrl.searchParams.delete('lens');
        return drawUrl.toString();
      } catch (error) {
        return '';
      }
    }

    function buildQrEditorModeUrl({ returnMode = LENS_CAMERA_RETURN_MODE_SELF } = {}) {
      const qrTool = getExternalToolDefinition(EXTERNAL_TOOL_QR_MAKER_ID);
      const nativeRuntime = isNativeAppRuntime();
      const fallbackPath = nativeRuntime
        ? '../qr-maker/index.html'
        : (qrTool?.launchUrl || 'https://pixieed.jp/qr-maker/index.html');
      const protocol = qrTool?.protocol || {};
      const returnQueryKey = protocol.returnQueryKey || LENS_CAMERA_RETURN_QUERY_KEY;
      const drawUrlQueryKey = protocol.drawUrlQueryKey || LENS_CAMERA_DRAW_URL_QUERY_KEY;
      try {
        const qrTarget = nativeRuntime
          ? new URL('../qr-maker/index.html', window.location.href)
          : new URL(qrTool?.launchUrl || fallbackPath);
        const qrUrl = new URL(qrTarget.toString());
        if (typeof returnMode === 'string' && returnMode) {
          qrUrl.searchParams.set(returnQueryKey, returnMode);
        }
        const drawUrl = buildLensCameraReturnDrawUrl();
        if (drawUrl) {
          qrUrl.searchParams.set(drawUrlQueryKey, drawUrl);
        }
        return qrUrl.toString();
      } catch (error) {
        return fallbackPath;
      }
    }

    return Object.freeze({
      getExternalToolDefinition,
      getExternalToolDefinitionByAction,
      getExternalToolLocalizedName,
      getExternalToolLocalizedActionLabel,
      isNativeAppRuntime,
      buildLensCameraModeUrl,
      buildLensCameraReturnDrawUrl,
      buildQrEditorModeUrl,
    });
  }

  root.navigation = Object.freeze({
    createNavigation,
  });
})();
