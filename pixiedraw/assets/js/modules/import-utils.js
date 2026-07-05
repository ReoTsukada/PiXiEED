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

  function createImportTransferUtils({
    canUseSessionStorage,
    isLensImportPayload,
    LENS_IMPORT_STORAGE_KEY,
    LENS_IMPORT_WINDOW_NAME_TYPE,
    LENS_IMPORT_MESSAGE_TYPE,
    LENS_IMPORT_READY_MESSAGE_TYPE,
    LENS_IMPORT_MESSAGE_WAIT_MS,
    LENS_IMPORT_SESSION_FLAG,
    QR_IMPORT_SESSION_FLAG,
    QR_IMPORT_STORAGE_KEY,
    QR_IMPORT_QUERY_KEY,
    onClearLensImportRequested,
    onClearQrImportRequested,
  } = {}) {
    let pendingLensImportMessagePayload = null;
    let pendingLensImportMessageResolvers = [];

    function acceptLensImportPayloadFromMessage(payload) {
      if (!isLensImportPayload(payload)) {
        return false;
      }
      pendingLensImportMessagePayload = payload;
      try {
        window.localStorage.setItem(LENS_IMPORT_STORAGE_KEY, JSON.stringify(payload));
      } catch (error) {
        // The message payload is enough for this import attempt.
      }
      const resolvers = pendingLensImportMessageResolvers.splice(0);
      resolvers.forEach(resolve => resolve(payload));
      return true;
    }

    function readLensImportWindowNamePayload() {
      if (typeof window === 'undefined' || typeof window.name !== 'string' || !window.name) {
        return null;
      }
      let envelope = null;
      try {
        envelope = JSON.parse(window.name);
      } catch (error) {
        return null;
      }
      if (!envelope || envelope.type !== LENS_IMPORT_WINDOW_NAME_TYPE || !isLensImportPayload(envelope.payload)) {
        return null;
      }
      try {
        window.name = '';
      } catch (error) {
        // ignore
      }
      return envelope.payload;
    }

    function notifyLensImportReady() {
      if (typeof window === 'undefined') {
        return;
      }
      const message = { type: LENS_IMPORT_READY_MESSAGE_TYPE };
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(message, '*');
        }
      } catch (error) {
        // ignore
      }
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(message, '*');
        }
      } catch (error) {
        // ignore
      }
    }

    function waitForLensImportPayloadMessage(timeoutMs = LENS_IMPORT_MESSAGE_WAIT_MS) {
      if (pendingLensImportMessagePayload) {
        return Promise.resolve(pendingLensImportMessagePayload);
      }
      notifyLensImportReady();
      return new Promise(resolve => {
        const timeout = window.setTimeout(() => {
          const index = pendingLensImportMessageResolvers.indexOf(done);
          if (index >= 0) {
            pendingLensImportMessageResolvers.splice(index, 1);
          }
          resolve(null);
        }, Math.max(0, Number(timeoutMs) || LENS_IMPORT_MESSAGE_WAIT_MS));
        const done = payload => {
          window.clearTimeout(timeout);
          resolve(payload || null);
        };
        pendingLensImportMessageResolvers.push(done);
      });
    }

    function clearLensImportRequestParam() {
      if (typeof window === 'undefined' || typeof window.location === 'undefined') {
        return;
      }
      try {
        const currentUrl = new URL(window.location.href);
        const hadLens = currentUrl.searchParams.has('lens');
        const hadQr = currentUrl.searchParams.has(QR_IMPORT_QUERY_KEY);
        if (!hadLens && !hadQr) {
          return;
        }
        currentUrl.searchParams.delete('lens');
        currentUrl.searchParams.delete(QR_IMPORT_QUERY_KEY);
        window.history.replaceState({}, document.title, currentUrl.toString());
      } catch (error) {
        // Ignore URL manipulation errors.
      }
    }

    function clearLensImportSessionFlag() {
      if (canUseSessionStorage) {
        try {
          window.sessionStorage.removeItem(LENS_IMPORT_SESSION_FLAG);
        } catch (error) {
          // ignore
        }
      }
      if (typeof onClearLensImportRequested === 'function') {
        onClearLensImportRequested();
      }
    }

    function clearQrImportSessionFlag() {
      if (canUseSessionStorage) {
        try {
          window.sessionStorage.removeItem(QR_IMPORT_SESSION_FLAG);
        } catch (error) {
          // ignore
        }
      }
      if (typeof onClearQrImportRequested === 'function') {
        onClearQrImportRequested();
      }
    }

    function removeLensImportPayload() {
      try {
        window.localStorage.removeItem(LENS_IMPORT_STORAGE_KEY);
      } catch (error) {
        // ignore
      }
    }

    function removeQrImportPayload() {
      try {
        window.localStorage.removeItem(QR_IMPORT_STORAGE_KEY);
      } catch (error) {
        // ignore
      }
      try {
        window.sessionStorage.removeItem(QR_IMPORT_STORAGE_KEY);
      } catch (error) {
        // ignore
      }
    }

    function finalizeLensImportAttempt({ clearPayload = false } = {}) {
      if (clearPayload) {
        removeLensImportPayload();
      }
      clearLensImportSessionFlag();
    }

    function finalizeQrImportAttempt({ clearPayload = false } = {}) {
      if (clearPayload) {
        removeQrImportPayload();
      }
      clearQrImportSessionFlag();
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('message', event => {
        const data = event && event.data;
        if (!data || data.type !== LENS_IMPORT_MESSAGE_TYPE) {
          return;
        }
        acceptLensImportPayloadFromMessage(data.payload);
      });
    }

    return Object.freeze({
      readLensImportWindowNamePayload,
      waitForLensImportPayloadMessage,
      clearLensImportRequestParam,
      clearLensImportSessionFlag,
      clearQrImportSessionFlag,
      finalizeLensImportAttempt,
      finalizeQrImportAttempt,
    });
  }

  root.importUtils = Object.freeze({
    createImportUtils,
    createImportTransferUtils,
  });
})();
