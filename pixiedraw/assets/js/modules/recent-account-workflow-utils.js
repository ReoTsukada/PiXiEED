(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createRecentAccountWorkflowUtils(rawScope = {}) {
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
  function getCurrentRecentProjectAccountUserId() {
    return normalizeRecentProjectAccountUserId(accountState.userId || '');
  }

  function isRecentProjectEntryVisibleForCurrentAccount(entry) {
    if (normalizeRecentProjectStorageKind(entry?.storageKind) === RECENT_PROJECT_STORAGE_LOCAL) {
      return true;
    }
    const entryUserId = normalizeRecentProjectAccountUserId(entry?.accountUserId || '');
    const currentUserId = getCurrentRecentProjectAccountUserId();
    return entryUserId === currentUserId || (currentUserId !== 'anonymous' && entryUserId === 'anonymous');
  }

  function isRecentProjectEntryInheritedAnonymous(entry) {
    const entryUserId = normalizeRecentProjectAccountUserId(entry?.accountUserId || '');
    const currentUserId = getCurrentRecentProjectAccountUserId();
    return currentUserId !== 'anonymous' && entryUserId === 'anonymous';
  }

  function assignCurrentAccountToRecentProjectEntry(entry = {}) {
    if (!entry || typeof entry !== 'object') {
      return entry;
    }
    const hasExplicitAccountUserId = typeof entry.accountUserId === 'string' && entry.accountUserId.trim();
    return {
      ...entry,
      accountUserId: hasExplicitAccountUserId
        ? normalizeRecentProjectAccountUserId(entry.accountUserId)
        : getCurrentRecentProjectAccountUserId(),
    };
  }

  function generateSharedProjectSessionToken(prefix = 'sp') {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  }

  function ensureSharedProjectDeviceId() {
    if (sharedProjectDeviceId) {
      return sharedProjectDeviceId;
    }
    try {
      const existing = typeof window !== 'undefined' && window.localStorage
        ? String(window.localStorage.getItem(SHARED_PROJECT_DEVICE_ID_STORAGE_KEY) || '').trim()
        : '';
      if (existing) {
        sharedProjectDeviceId = existing;
        return sharedProjectDeviceId;
      }
    } catch (_error) {
      // Ignore storage failures.
    }
    sharedProjectDeviceId = generateSharedProjectSessionToken('device');
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SHARED_PROJECT_DEVICE_ID_STORAGE_KEY, sharedProjectDeviceId);
      }
    } catch (_error) {
      // Ignore storage failures.
    }
    return sharedProjectDeviceId;
  }

  function ensureSharedProjectSessionInstanceId() {
    if (!sharedProjectSessionInstanceId) {
      sharedProjectSessionInstanceId = generateSharedProjectSessionToken('session');
    }
    return sharedProjectSessionInstanceId;
  }

        return Object.freeze({
          assignCurrentAccountToRecentProjectEntry,
          ensureSharedProjectDeviceId,
          ensureSharedProjectSessionInstanceId,
          generateSharedProjectSessionToken,
          getCurrentRecentProjectAccountUserId,
          isRecentProjectEntryInheritedAnonymous,
          isRecentProjectEntryVisibleForCurrentAccount,
        });
      }
    })(scope);
  }

  root.recentAccountWorkflowUtils = Object.freeze({
    createRecentAccountWorkflowUtils,
  });
})();
