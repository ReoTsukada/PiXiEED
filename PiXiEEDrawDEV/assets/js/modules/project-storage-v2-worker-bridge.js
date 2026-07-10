(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createProjectStorageV2WorkerBridge({
    workerUrl = '',
    WorkerCtor = typeof Worker === 'function' ? Worker : null,
    workerFactory = null,
    BlobCtor = typeof Blob === 'function' ? Blob : null,
    console: logger = console,
  } = {}) {
    let requestSequence = 0;
    let worker = null;
    const pending = new Map();

    function isSupported() {
      return Boolean(workerUrl && (typeof workerFactory === 'function' || WorkerCtor));
    }

    function normalizeWorkerError(error = null) {
      if (error instanceof Error) {
        return error;
      }
      const message = typeof error?.message === 'string' && error.message
        ? error.message
        : String(error || 'Project storage worker request failed');
      const nextError = new Error(message);
      if (typeof error?.code === 'string' && error.code) {
        nextError.code = error.code;
      }
      if (typeof error?.entryPath === 'string' && error.entryPath) {
        nextError.entryPath = error.entryPath;
      }
      if (typeof error?.cause !== 'undefined') {
        nextError.cause = error.cause;
      }
      return nextError;
    }

    function rejectAllPending(error) {
      const nextError = normalizeWorkerError(error);
      pending.forEach(({ reject }) => reject(nextError));
      pending.clear();
    }

    function resetWorker(error = null) {
      if (worker && typeof worker.terminate === 'function') {
        try {
          worker.terminate();
        } catch (_error) {
          // Ignore termination errors.
        }
      }
      worker = null;
      if (error) {
        rejectAllPending(error);
      }
    }

    function handleWorkerMessage(event) {
      const payload = event?.data;
      const requestId = typeof payload?.id === 'string' ? payload.id : '';
      if (!requestId || !pending.has(requestId)) {
        return;
      }
      const { resolve, reject } = pending.get(requestId);
      pending.delete(requestId);
      if (payload?.ok === true) {
        resolve(payload.result || {});
        return;
      }
      reject(normalizeWorkerError(payload?.error));
    }

    function handleWorkerFailure(event) {
      const error = normalizeWorkerError({
        code: 'ERR_WORKER_REQUEST_FAILED',
        message: event?.message || 'Project storage worker request failed',
      });
      resetWorker(error);
    }

    function ensureWorker() {
      if (worker) {
        return worker;
      }
      if (!isSupported()) {
        throw normalizeWorkerError({
          code: 'ERR_WORKER_UNSUPPORTED',
          message: 'Project storage worker bridge is not supported in this environment',
        });
      }
      const nextWorker = typeof workerFactory === 'function'
        ? workerFactory(workerUrl)
        : new WorkerCtor(workerUrl);
      nextWorker.onmessage = handleWorkerMessage;
      nextWorker.onerror = handleWorkerFailure;
      nextWorker.onmessageerror = handleWorkerFailure;
      worker = nextWorker;
      return worker;
    }

    function createRequestId(prefix = 'project-storage-v2') {
      requestSequence += 1;
      return `${prefix}-${Date.now()}-${requestSequence}`;
    }

    async function postRequest(op, payload = {}, transfer = []) {
      const nextWorker = ensureWorker();
      const requestId = createRequestId(op);
      return await new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
        try {
          nextWorker.postMessage({
            id: requestId,
            op,
            ...payload,
          }, transfer);
        } catch (error) {
          pending.delete(requestId);
          reject(normalizeWorkerError(error));
        }
      });
    }

    function cloneUint8Array(bytes) {
      if (bytes instanceof Uint8Array) {
        return bytes.slice();
      }
      if (bytes instanceof ArrayBuffer) {
        return new Uint8Array(bytes.slice(0));
      }
      if (ArrayBuffer.isView(bytes)) {
        return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      }
      return new Uint8Array(0);
    }

    async function encodePackagedProject(packaged, options = {}) {
      const result = await postRequest('encode', {
        packaged,
        options,
      });
      const blobBytes = result?.blobBytes instanceof Uint8Array
        ? result.blobBytes
        : (result?.blobBytes instanceof ArrayBuffer ? new Uint8Array(result.blobBytes) : new Uint8Array(0));
      if (!BlobCtor) {
        throw normalizeWorkerError({
          code: 'ERR_MISSING_BLOB_CTOR',
          message: 'Blob is not available for worker project archive serialization',
        });
      }
      return {
        ...result,
        blob: new BlobCtor([blobBytes], { type: options?.mimeType || 'application/zip' }),
      };
    }

    async function decodeArchiveBytes(bytes, options = {}) {
      const workerBytes = cloneUint8Array(bytes);
      return await postRequest('decode', {
        bytes: workerBytes,
        options,
      }, workerBytes.buffer ? [workerBytes.buffer] : []);
    }

    return Object.freeze({
      isSupported,
      encodePackagedProject,
      decodeArchiveBytes,
      dispose() {
        resetWorker();
      },
    });
  }

  root.projectStorageV2WorkerBridge = Object.freeze({
    createProjectStorageV2WorkerBridge,
  });
})();
