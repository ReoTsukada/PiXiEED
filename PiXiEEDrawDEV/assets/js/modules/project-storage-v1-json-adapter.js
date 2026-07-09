(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPixieeDrawV1JsonAdapter({
    PROJECT_FILE_EXTENSION = '.pixieedraw',
    PROJECT_FILE_MIME_TYPE = 'application/x-pixieedraw',
    PROJECT_PACKAGE_TYPE = 'pixieedraw-project',
    buildPackagedProjectPayload,
    createAutosaveFileName,
    JSONGlobal = JSON,
    BlobCtor = typeof Blob === 'function' ? Blob : null,
  } = {}) {
    function canReadParsedValue(parsed) {
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return false;
      }
      if (parsed.type === PROJECT_PACKAGE_TYPE && parsed.document && typeof parsed.document === 'object') {
        return true;
      }
      return Boolean(parsed.frames || parsed.canvases || parsed.palette);
    }

    function parseText(text) {
      if (typeof text !== 'string' || !text.length) {
        throw new Error('Project text is empty');
      }
      return JSONGlobal.parse(text);
    }

    function normalizeParsedValue(parsed) {
      return parsed;
    }

    function serializeProject(projectState, options = {}) {
      if (typeof buildPackagedProjectPayload !== 'function') {
        throw new Error('buildPackagedProjectPayload is required for v1 project serialization');
      }
      const snapshot = projectState?.snapshot || null;
      const session = projectState?.session || null;
      const packaged = buildPackagedProjectPayload(snapshot, {
        session,
        updatedAt: options?.updatedAt || '',
        includeSheets: options?.includeSheets !== false,
      });
      const text = JSONGlobal.stringify(packaged);
      const fileNameBase = options?.fileNameBase || snapshot?.documentName || '';
      const filename = typeof createAutosaveFileName === 'function'
        ? createAutosaveFileName(fileNameBase)
        : `project${PROJECT_FILE_EXTENSION}`;
      const blob = BlobCtor ? new BlobCtor([text], { type: PROJECT_FILE_MIME_TYPE }) : null;
      return {
        packaged,
        text,
        blob,
        filename,
        mimeType: PROJECT_FILE_MIME_TYPE,
        fileExtension: PROJECT_FILE_EXTENSION,
      };
    }

    return Object.freeze({
      id: 'pixieedraw-v1-json',
      fileExtension: PROJECT_FILE_EXTENSION,
      mimeType: PROJECT_FILE_MIME_TYPE,
      canReadParsedValue,
      parseText,
      normalizeParsedValue,
      serializeProject,
    });
  }

  root.projectStorageV1JsonAdapter = Object.freeze({
    createPixieeDrawV1JsonAdapter,
  });
})();
