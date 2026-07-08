(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedProjectBackendRpcUtils(rawScope = {}) {
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
  function createSharedProjectInviteToken() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `sp_${crypto.randomUUID().replace(/-/g, '')}`;
    }
    return `sp_${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
  }

  async function fetchSharedProjectRecordViaRpc(supabase, projectKey, errorContext = 'fetch') {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey);
    if (!supabase || !normalizedProjectKey) {
      return null;
    }
    try {
      const { data, error } = await supabase.rpc('pixieed_get_shared_project', {
        target_project_key: normalizedProjectKey,
      });
      if (error) {
        handleSharedProjectsBackendError(error, errorContext);
        return null;
      }
      return Array.isArray(data) ? (data[0] || null) : (data || null);
    } catch (error) {
      handleSharedProjectsBackendError(error, `${errorContext}-exception`);
      return null;
    }
  }

        return Object.freeze({
          createSharedProjectInviteToken,
          fetchSharedProjectRecordViaRpc,
        });
      }
    })(scope);
  }

  root.sharedProjectBackendRpcUtils = Object.freeze({
    createSharedProjectBackendRpcUtils,
  });
})();
