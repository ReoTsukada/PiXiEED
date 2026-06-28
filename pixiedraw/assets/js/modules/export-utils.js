(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function sanitizeNativeFilename(filename, fallback = 'export.bin') {
    const raw = typeof filename === 'string' ? filename : '';
    const basename = raw.split(/[\\/]/).pop() || '';
    const cleaned = basename
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || fallback;
  }

  function normalizeNativeSubdirectory(path) {
    const raw = typeof path === 'string' ? path : '';
    return raw
      .split('/')
      .map(segment => segment.trim())
      .filter(Boolean)
      .map(segment => segment.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_'))
      .join('/');
  }

  function isLikelyFileAlreadyExistsError(error) {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || error || '').toLowerCase();
    return (
      code.includes('exist')
      || code.includes('already')
      || message.includes('eexist')
      || message.includes('already exists')
      || message.includes('file exists')
      || message.includes('exists')
    );
  }

  function isNativePhotoLibraryExportMimeType(mimeType) {
    const normalized = String(mimeType || '').trim().toLowerCase();
    return normalized.startsWith('image/') && normalized !== 'image/svg+xml';
  }

  function splitFilenameStemAndExtension(filename, fallback = 'export.bin') {
    const safeFilename = sanitizeNativeFilename(filename, fallback);
    const match = safeFilename.match(/^(.*?)(\.[^.]*)?$/);
    const stem = match?.[1] || safeFilename;
    const extension = match?.[2] || '';
    return {
      stem: stem || 'export',
      extension,
    };
  }

  function buildNumberedFilename(filename, sequence = 0) {
    const normalizedSequence = Math.max(0, Math.floor(Number(sequence) || 0));
    const { stem, extension } = splitFilenameStemAndExtension(filename);
    if (normalizedSequence <= 0) {
      return `${stem}${extension}`;
    }
    return `${stem}.${normalizedSequence}${extension}`;
  }

  function createExportDirectoryStorageUtils({
    canUseSessionStorage,
    EXPORT_DIRECTORY_DISPLAY_LABEL_KEY,
  } = {}) {
    function sanitizeExportDirectoryDisplayLabel(value) {
      return typeof value === 'string' ? value.trim() : '';
    }

    function buildExportDirectoryDisplayLabel({ rootHandle = null, workspaceHandle = null, fallback = '' } = {}) {
      const rootName = sanitizeExportDirectoryDisplayLabel(rootHandle?.name || '');
      const workspaceName = sanitizeExportDirectoryDisplayLabel(workspaceHandle?.name || '');
      const fallbackName = sanitizeExportDirectoryDisplayLabel(fallback);
      if (rootName && workspaceName) {
        if (rootName === workspaceName) {
          return workspaceName;
        }
        return `${rootName}/${workspaceName}`;
      }
      return workspaceName || rootName || fallbackName;
    }

    function loadStoredExportDirectoryDisplayLabel() {
      if (!canUseSessionStorage) {
        return '';
      }
      try {
        return sanitizeExportDirectoryDisplayLabel(window.localStorage.getItem(EXPORT_DIRECTORY_DISPLAY_LABEL_KEY) || '');
      } catch (error) {
        return '';
      }
    }

    function storeExportDirectoryDisplayLabel(label) {
      if (!canUseSessionStorage) {
        return;
      }
      const normalized = sanitizeExportDirectoryDisplayLabel(label);
      try {
        if (normalized) {
          window.localStorage.setItem(EXPORT_DIRECTORY_DISPLAY_LABEL_KEY, normalized);
        } else {
          window.localStorage.removeItem(EXPORT_DIRECTORY_DISPLAY_LABEL_KEY);
        }
      } catch (error) {
        // Ignore localStorage errors.
      }
    }

    function clearStoredExportDirectoryDisplayLabel() {
      if (!canUseSessionStorage) {
        return;
      }
      try {
        window.localStorage.removeItem(EXPORT_DIRECTORY_DISPLAY_LABEL_KEY);
      } catch (error) {
        // Ignore localStorage errors.
      }
    }

    return Object.freeze({
      sanitizeExportDirectoryDisplayLabel,
      buildExportDirectoryDisplayLabel,
      loadStoredExportDirectoryDisplayLabel,
      storeExportDirectoryDisplayLabel,
      clearStoredExportDirectoryDisplayLabel,
    });
  }

  root.exportUtils = Object.freeze({
    sanitizeNativeFilename,
    normalizeNativeSubdirectory,
    isLikelyFileAlreadyExistsError,
    isNativePhotoLibraryExportMimeType,
    splitFilenameStemAndExtension,
    buildNumberedFilename,
    createExportDirectoryStorageUtils,
  });
})();
