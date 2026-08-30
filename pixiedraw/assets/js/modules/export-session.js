(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createExportSession({
    state,
    dom,
    normalizeDocumentName,
    sanitizeDocumentFileBase,
    PROJECT_FILE_EXTENSION,
    extractDocumentBaseName,
    DEFAULT_DOCUMENT_BASENAME,
    renderOpenProjectTabs,
    initialExportFileNameBase = '',
  } = {}) {
    let exportFileNameBase = typeof initialExportFileNameBase === 'string' ? initialExportFileNameBase : '';

    function getExportFileNameBase() {
      return exportFileNameBase;
    }

    function updateDocumentMetadata() {
      const name = normalizeDocumentName(state.documentName);
      if (state.documentName !== name) {
        state.documentName = name;
      }
      const baseTitle = 'PiXiEEDraw';
      document.title = `${name} • ${baseTitle}`;
      renderOpenProjectTabs();
    }

    function createAutosaveFileName(name = state.documentName) {
      const sanitizedBase = sanitizeDocumentFileBase(name);
      return `${sanitizedBase}${PROJECT_FILE_EXTENSION}`;
    }

    function resolveExportFileBaseName(raw = '') {
      const source = typeof raw === 'string' && raw.trim() ? raw : exportFileNameBase || state.documentName;
      return extractDocumentBaseName(source);
    }

    function setExportFileBaseName(raw = '') {
      const normalizedBase = resolveExportFileBaseName(raw);
      exportFileNameBase = normalizedBase;
      const input = dom.exportDialog?.fileNameInput;
      if (input instanceof HTMLInputElement) {
        input.value = normalizedBase;
      }
      return normalizedBase;
    }

    function createExportFileName(extension, suffix = '') {
      const sanitized = sanitizeDocumentFileBase(resolveExportFileBaseName());
      const safeBase =
        sanitized || DEFAULT_DOCUMENT_BASENAME.replace(/\s+/g, '_');
      const safeSuffix = suffix ? `_${suffix}` : '';
      const normalizedExt = extension ? extension.replace(/^\.+/, '') : '';
      return normalizedExt ? `${safeBase}${safeSuffix}.${normalizedExt}` : `${safeBase}${safeSuffix}`;
    }

    return {
      getExportFileNameBase,
      updateDocumentMetadata,
      createAutosaveFileName,
      resolveExportFileBaseName,
      setExportFileBaseName,
      createExportFileName,
    };
  }

  root.exportSession = {
    createExportSession,
  };
})();
