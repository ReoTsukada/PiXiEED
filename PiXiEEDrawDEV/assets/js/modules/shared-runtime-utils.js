(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedRuntimeUtils(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() {
        return true;
      },
      get(target, key) {
        if (key === Symbol.unscopables) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          return target[key];
        }
        return globalThis[key];
      },
      set(target, key, value) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          target[key] = value;
          return true;
        }
        globalThis[key] = value;
        return true;
      },
    });

    return ((scope) => {
      with (scope) {
  function canUseSharedProjectsBackend() {
    return supportsSharedProjectsBackend && accountState.isLoggedIn && Boolean(accountState.userId);
  }

  function isRecoverableSharedBackendPreflightError(error) {
    const status = Number(error?.status || 0);
    const code = String(error?.code || '').trim();
    const message = String(error?.message || '').toLowerCase();
    return (
      status === 0
      && !code
      && (
        message.includes('load failed')
        || message.includes('failed to fetch')
        || message.includes('networkerror')
      )
    );
  }

  function isSharedProjectsBlockedByRuntime() {
    return window.location?.protocol === 'file:';
  }

  function showSharedRuntimeBlockedStatus() {
    setMultiStatus(
      localizeText(
        '共有モードは file:// 直開きでは使えません。https または localhost で開いてください。',
        'Shared mode is unavailable on file://. Open PiXiEEDraw over https or localhost.'
      ),
      'error'
    );
  }

  function prefersSharedProjectFlow() {
    return true;
  }

  function createSharedProjectSnapshotTitle(name = state.documentName || DEFAULT_DOCUMENT_NAME) {
    return extractDocumentBaseName(normalizeDocumentName(name || DEFAULT_DOCUMENT_NAME));
  }

        return Object.freeze({
          canUseSharedProjectsBackend,
          isRecoverableSharedBackendPreflightError,
          isSharedProjectsBlockedByRuntime,
          showSharedRuntimeBlockedStatus,
          prefersSharedProjectFlow,
          createSharedProjectSnapshotTitle,
        });
      }
    })(scope);
  }

  root.sharedRuntimeUtils = Object.freeze({
    createSharedRuntimeUtils,
  });
})();
