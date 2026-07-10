(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPixieeDrawV2ZipAdapter({
    PROJECT_FILE_EXTENSION = '.pixieedraw',
    PROJECT_FILE_MIME_TYPE = 'application/x-pixieedraw',
    PROJECT_PACKAGE_TYPE = 'pixieedraw-project',
    buildPackagedProjectPayload,
    createAutosaveFileName,
    buildZipBlobFromTasks,
    decodeBase64,
    encodeTypedArray,
    JSONGlobal = JSON,
    BlobCtor = typeof Blob === 'function' ? Blob : null,
    TextEncoderCtor = typeof TextEncoder === 'function' ? TextEncoder : null,
    TextDecoderCtor = typeof TextDecoder === 'function' ? TextDecoder : null,
    CompressionStreamCtor = typeof CompressionStream === 'function' ? CompressionStream : null,
    DecompressionStreamCtor = typeof DecompressionStream === 'function' ? DecompressionStream : null,
    ResponseCtor = typeof Response === 'function' ? Response : null,
    CryptoGlobal = typeof crypto !== 'undefined' ? crypto : null,
    compressBytes = null,
    decompressBytes = null,
    digestBytes = null,
    workerBridge = null,
    useWorkerByDefault = false,
    console: logger = console,
  } = {}) {
    const ADAPTER_ID = 'pixieedraw-v2-zip-experimental';

    function normalizeCodecError(error) {
      if (error instanceof Error) {
        return error;
      }
      return new Error(String(error || 'Unknown project archive error'));
    }

    if (!root.projectStorageV2ArchiveCodec?.createProjectStorageV2ArchiveCodec) {
      throw new Error('projectStorageV2ArchiveCodec module is required before projectStorageV2ZipAdapter');
    }

    const codec = root.projectStorageV2ArchiveCodec.createProjectStorageV2ArchiveCodec({
      buildZipBlobFromTasks,
      decodeBase64,
      encodeTypedArray,
      JSONGlobal,
      BlobCtor,
      TextEncoderCtor,
      TextDecoderCtor,
      CompressionStreamCtor,
      DecompressionStreamCtor,
      ResponseCtor,
      CryptoGlobal,
      compressBytes,
      decompressBytes,
      digestBytes,
    });

    async function parseBytes(bytes) {
      return await parseBytesWithOptions(bytes, {});
    }

    async function readManifestFromBytes(bytes) {
      try {
        return await codec.readManifestFromBytes(bytes);
      } catch (error) {
        throw normalizeCodecError(error);
      }
    }

    function shouldUseWorker(options = {}) {
      if (options?.useWorker === true) {
        return true;
      }
      if (options?.useWorker === false) {
        return false;
      }
      return useWorkerByDefault === true;
    }

    async function decodeProjectBytes(bytes, options = {}) {
      const decodeOptions = {
        adapterId: ADAPTER_ID,
      };
      if (shouldUseWorker(options) && workerBridge?.isSupported?.()) {
        try {
          return await workerBridge.decodeArchiveBytes(bytes, decodeOptions);
        } catch (error) {
          if (options?.requireWorker === true) {
            throw normalizeCodecError(error);
          }
          logger?.warn?.('Project storage worker decode failed, falling back to main thread codec', error);
        }
      }
      return await codec.decodeArchiveBytes(bytes, decodeOptions);
    }

    async function parseBytesWithOptions(bytes, options = {}) {
      try {
        const result = await decodeProjectBytes(bytes, options);
        return result.packaged;
      } catch (error) {
        throw normalizeCodecError(error);
      }
    }

    async function serializeProject(projectState, options = {}) {
      if (typeof buildPackagedProjectPayload !== 'function') {
        throw new Error('buildPackagedProjectPayload is required for v2 project serialization');
      }
      const includeSheets = options?.includeSheets === true;
      const includeTimelapse = options?.includeTimelapse !== false;
      const snapshot = projectState?.snapshot || null;
      const session = projectState?.session || null;
      const packaged = buildPackagedProjectPayload(snapshot, {
        session,
        updatedAt: options?.updatedAt || '',
        includeSheets,
      });
      try {
        const encodeOptions = {
          adapterId: ADAPTER_ID,
          packageType: PROJECT_PACKAGE_TYPE,
          fileExtension: PROJECT_FILE_EXTENSION,
          mimeType: PROJECT_FILE_MIME_TYPE,
          includeSheets,
          includeTimelapse,
        };
        let result = null;
        let workerUsed = false;
        if (shouldUseWorker(options) && workerBridge?.isSupported?.()) {
          try {
            result = await workerBridge.encodePackagedProject(packaged, encodeOptions);
            workerUsed = true;
          } catch (error) {
            if (options?.requireWorker === true) {
              throw normalizeCodecError(error);
            }
            logger?.warn?.('Project storage worker encode failed, falling back to main thread codec', error);
          }
        }
        if (!result) {
          result = await codec.encodePackagedProject(packaged, encodeOptions);
        }
        const fileNameBase = options?.fileNameBase || snapshot?.documentName || '';
        const filename = typeof createAutosaveFileName === 'function'
          ? createAutosaveFileName(fileNameBase)
          : `project${PROJECT_FILE_EXTENSION}`;
        return {
          packaged,
          archiveManifest: result.archiveManifest,
          archiveProject: result.archiveProject,
          diagnostics: result.diagnostics,
          blob: result.blob,
          workerUsed,
          filename,
          mimeType: PROJECT_FILE_MIME_TYPE,
          fileExtension: PROJECT_FILE_EXTENSION,
        };
      } catch (error) {
        throw normalizeCodecError(error);
      }
    }

    return Object.freeze({
      id: ADAPTER_ID,
      fileExtension: PROJECT_FILE_EXTENSION,
      mimeType: PROJECT_FILE_MIME_TYPE,
      canReadBytes(bytes) {
        return codec.canReadBytes(bytes);
      },
      async parseBytes(bytes, options = {}) {
        return await parseBytesWithOptions(bytes, options);
      },
      readManifestFromBytes,
      serializeProject,
    });
  }

  root.projectStorageV2ZipAdapter = Object.freeze({
    createPixieeDrawV2ZipAdapter,
  });
})();
