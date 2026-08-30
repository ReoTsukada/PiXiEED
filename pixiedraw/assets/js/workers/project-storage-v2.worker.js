(() => {
  const scope = typeof self !== 'undefined' ? self : globalThis;
  const root = scope.PiXiEEDrawModules = scope.PiXiEEDrawModules || {};

  if (!root.projectStorageV2ArchiveCodec?.createProjectStorageV2ArchiveCodec) {
    if (typeof importScripts !== 'function') {
      throw new Error('importScripts is required for project storage worker bootstrap');
    }
    importScripts('../modules/project-storage-v2-archive-codec.js?v=20260720-pxd3');
  }

  function encodeTypedArray(view) {
    if (!view) {
      return null;
    }
    const bytes = view instanceof Uint8Array
      ? view
      : new Uint8Array(view.buffer, view.byteOffset || 0, view.byteLength || 0);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary);
  }

  function decodeBase64(value) {
    const binary = atob(String(value || ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  const codec = root.projectStorageV2ArchiveCodec.createProjectStorageV2ArchiveCodec({
    decodeBase64,
    encodeTypedArray,
  });

  function serializeError(error) {
    return {
      code: typeof error?.code === 'string' && error.code ? error.code : 'ERR_WORKER_REQUEST_FAILED',
      message: typeof error?.message === 'string' && error.message ? error.message : String(error || 'Project storage worker request failed'),
      entryPath: typeof error?.entryPath === 'string' ? error.entryPath : '',
    };
  }

  function resolveBytesInput(value) {
    if (value instanceof Uint8Array) {
      return value;
    }
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    return new Uint8Array(0);
  }

  async function handleEncodeRequest(message) {
    const result = await codec.encodePackagedProject(message?.packaged || null, message?.options || {});
    const blobBytes = new Uint8Array(await result.blob.arrayBuffer());
    return {
      transfer: blobBytes.buffer ? [blobBytes.buffer] : [],
      payload: {
        id: message.id,
        ok: true,
        result: {
          blobBytes,
          packaged: result.packaged,
          archiveManifest: result.archiveManifest,
          archiveProject: result.archiveProject,
          diagnostics: result.diagnostics,
        },
      },
    };
  }

  async function handleDecodeRequest(message) {
    const bytes = resolveBytesInput(message?.bytes);
    const result = await codec.decodeArchiveBytes(bytes, message?.options || {});
    return {
      transfer: [],
      payload: {
        id: message.id,
        ok: true,
        result: {
          packaged: result.packaged,
          archiveManifest: result.archiveManifest,
          archiveProject: result.archiveProject,
          diagnostics: result.diagnostics,
        },
      },
    };
  }

  scope.onmessage = async function onProjectStorageWorkerMessage(event) {
    const message = event?.data || {};
    try {
      let response = null;
      if (message?.op === 'encode') {
        response = await handleEncodeRequest(message);
      } else if (message?.op === 'decode') {
        response = await handleDecodeRequest(message);
      } else {
        throw Object.assign(new Error(`Unsupported project storage worker op: ${String(message?.op || '')}`), {
          code: 'ERR_UNSUPPORTED_WORKER_OP',
        });
      }
      scope.postMessage(response.payload, response.transfer);
    } catch (error) {
      scope.postMessage({
        id: typeof message?.id === 'string' ? message.id : '',
        ok: false,
        error: serializeError(error),
      });
    }
  };
})();
