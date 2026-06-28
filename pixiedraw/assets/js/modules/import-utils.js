(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createImportUtils({
    EXTERNAL_IMPORT_MODE_APPEND_TAB,
    EXTERNAL_IMPORT_MODE_NEW_PROJECT,
  } = {}) {
    function normalizeExternalImportMode(value) {
      return value === EXTERNAL_IMPORT_MODE_APPEND_TAB
        ? EXTERNAL_IMPORT_MODE_APPEND_TAB
        : EXTERNAL_IMPORT_MODE_NEW_PROJECT;
    }

    function shouldAppendExternalImportToProject(payload) {
      return normalizeExternalImportMode(payload?.importMode) === EXTERNAL_IMPORT_MODE_APPEND_TAB;
    }

    function isLensImportPayload(payload) {
      return Boolean(
        payload
        && typeof payload === 'object'
        && typeof payload.dataUrl === 'string'
        && payload.dataUrl.startsWith('data:image/')
      );
    }

    return Object.freeze({
      normalizeExternalImportMode,
      shouldAppendExternalImportToProject,
      isLensImportPayload,
    });
  }

  root.importUtils = Object.freeze({
    createImportUtils,
  });
})();
