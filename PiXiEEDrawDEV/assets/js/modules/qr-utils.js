(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createQrUtils({
    QR_EDIT_MODE_TARGET_SOURCE,
    normalizeAutosaveProjectId,
  } = {}) {
    function normalizeQrEditPayload(payload = null, fallbackProjectId = '') {
      if (!payload || typeof payload !== 'object') {
        return null;
      }
      const source = typeof payload.source === 'string' ? payload.source.trim() : '';
      if (source !== QR_EDIT_MODE_TARGET_SOURCE) {
        return null;
      }
      const projectId = normalizeAutosaveProjectId(
        typeof payload.projectId === 'string' ? payload.projectId : fallbackProjectId
      ) || normalizeAutosaveProjectId(fallbackProjectId || '');
      const expectedText = typeof payload.rawValue === 'string' ? payload.rawValue.trim() : '';
      const editSize = Math.max(1, Math.round(Number(payload.editSize) || 0));
      const panelVisible = payload.panelVisible !== false;
      return {
        source,
        projectId,
        rawValue: expectedText,
        editSize,
        panelVisible,
      };
    }

    function canUseQrEditJsQrDecoder() {
      return typeof window !== 'undefined' && typeof window.jsQR === 'function';
    }

    return Object.freeze({
      normalizeQrEditPayload,
      canUseQrEditJsQrDecoder,
    });
  }

  root.qrUtils = Object.freeze({
    createQrUtils,
  });
})();
