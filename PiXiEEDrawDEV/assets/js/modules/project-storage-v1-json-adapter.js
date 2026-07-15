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
    TextDecoderCtor = typeof TextDecoder === 'function' ? TextDecoder : null,
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

    function canReadBytes(bytes) {
      if (!(bytes instanceof Uint8Array) || !bytes.length || !TextDecoderCtor) {
        return false;
      }
      let index = 0;
      if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        index = 3;
      }
      while (index < bytes.length) {
        const byte = bytes[index];
        if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d) {
          index += 1;
          continue;
        }
        return byte === 0x7b || byte === 0x5b;
      }
      return false;
    }

    function parseBytes(bytes) {
      if (!(bytes instanceof Uint8Array) || !bytes.length || !TextDecoderCtor) {
        throw new Error('Project bytes are empty');
      }
      return parseText(new TextDecoderCtor().decode(bytes));
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
      canReadBytes,
      parseText,
      parseBytes,
      normalizeParsedValue,
      serializeProject,
    });
  }

  root.projectStorageV1JsonAdapter = Object.freeze({
    createPixieeDrawV1JsonAdapter,
  });
})();
