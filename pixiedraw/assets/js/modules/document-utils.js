(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createDocumentUtils({
    DEFAULT_DOCUMENT_BASENAME,
    PROJECT_FILE_EXTENSION,
  } = {}) {
    function extractDocumentBaseName(value) {
      if (typeof value !== 'string') {
        return DEFAULT_DOCUMENT_BASENAME;
      }
      let base = value.trim();
      if (!base) {
        return DEFAULT_DOCUMENT_BASENAME;
      }
      const removableExtensions = [
        PROJECT_FILE_EXTENSION,
        '.pxdraw',
        '.json',
        '.txt',
        '.png',
        '.gif',
        '.jpg',
        '.jpeg',
        '.webp',
        '.bmp',
        '.svg',
        '.avif',
      ];
      let changed = true;
      while (changed && base) {
        changed = false;
        const lowerBase = base.toLowerCase();
        for (let index = 0; index < removableExtensions.length; index += 1) {
          const extension = removableExtensions[index];
          if (!lowerBase.endsWith(extension)) {
            continue;
          }
          base = base.slice(0, -extension.length).trim();
          changed = true;
          break;
        }
      }
      base = base.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
      return base || DEFAULT_DOCUMENT_BASENAME;
    }

    function normalizeDocumentName(value) {
      const base = extractDocumentBaseName(value);
      const maxBaseLength = Math.max(1, 120 - PROJECT_FILE_EXTENSION.length);
      const limitedBase = base.slice(0, maxBaseLength);
      return `${limitedBase}${PROJECT_FILE_EXTENSION}`;
    }

    function sanitizeDocumentFileBase(name) {
      const base = extractDocumentBaseName(name);
      return base
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '') || DEFAULT_DOCUMENT_BASENAME.replace(/\s+/g, '_');
    }

    return Object.freeze({
      extractDocumentBaseName,
      normalizeDocumentName,
      sanitizeDocumentFileBase,
    });
  }

  root.documentUtils = Object.freeze({
    createDocumentUtils,
  });
})();
