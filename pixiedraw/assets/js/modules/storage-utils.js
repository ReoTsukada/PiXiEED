(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createStorageUtils({
    canUseSessionStorage,
    UI_LANGUAGE_STORAGE_KEY,
    UI_LANGUAGE_JA,
    UI_LANGUAGE_SET,
    INLINE_GUIDES_STORAGE_KEY,
  } = {}) {
    function normalizeUiLanguage(value, fallback = UI_LANGUAGE_JA) {
      const normalized = String(value || '').trim().toLowerCase();
      if (UI_LANGUAGE_SET.has(normalized)) {
        return normalized;
      }
      return UI_LANGUAGE_SET.has(fallback) ? fallback : UI_LANGUAGE_JA;
    }

    function getUiLanguageFromQuery() {
      if (typeof window === 'undefined') {
        return '';
      }
      try {
        const params = new URLSearchParams(window.location.search);
        return normalizeUiLanguage(params.get('lang') || params.get('language') || '', '');
      } catch (error) {
        return '';
      }
    }

    function loadStoredUiLanguage() {
      if (!canUseSessionStorage) {
        return '';
      }
      try {
        return normalizeUiLanguage(window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY) || '', '');
      } catch (error) {
        return '';
      }
    }

    function resolveInitialUiLanguage() {
      return normalizeUiLanguage(getUiLanguageFromQuery() || loadStoredUiLanguage() || UI_LANGUAGE_JA, UI_LANGUAGE_JA);
    }

    function storeUiLanguage(language) {
      if (!canUseSessionStorage) {
        return;
      }
      const normalized = normalizeUiLanguage(language, UI_LANGUAGE_JA);
      try {
        window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, normalized);
      } catch (error) {
        // Ignore localStorage errors.
      }
    }

    function loadInlineGuidesVisibility() {
      if (!canUseSessionStorage) {
        return false;
      }
      try {
        return window.localStorage.getItem(INLINE_GUIDES_STORAGE_KEY) === '1';
      } catch (error) {
        return false;
      }
    }

    function storeInlineGuidesVisibility(visible) {
      if (!canUseSessionStorage) {
        return;
      }
      try {
        window.localStorage.setItem(INLINE_GUIDES_STORAGE_KEY, visible ? '1' : '0');
      } catch (error) {
        // Ignore localStorage errors.
      }
    }

    return Object.freeze({
      normalizeUiLanguage,
      getUiLanguageFromQuery,
      loadStoredUiLanguage,
      resolveInitialUiLanguage,
      storeUiLanguage,
      loadInlineGuidesVisibility,
      storeInlineGuidesVisibility,
    });
  }

  root.storageUtils = Object.freeze({
    createStorageUtils,
    createLocalRestoreStorageUtils,
  });

  function createLocalRestoreStorageUtils({
    accountState,
    canUseSessionStorage,
    AUTOSAVE_ACTIVE_PROJECT_SYNC_KEY,
    RELOAD_TARGET_PROJECT_ID_KEY,
    RELOAD_PROJECT_FALLBACK_STORAGE_KEY,
  } = {}) {
    function getCurrentAccountStorageNamespace() {
      const userId = typeof accountState.userId === 'string' ? accountState.userId.trim() : '';
      return userId || 'anonymous';
    }

    function getScopedStorageKey(baseKey, namespace = getCurrentAccountStorageNamespace()) {
      const normalizedBaseKey = typeof baseKey === 'string' ? baseKey.trim() : '';
      const normalizedNamespace = typeof namespace === 'string' ? namespace.trim() : '';
      if (!normalizedBaseKey) {
        return '';
      }
      if (!normalizedNamespace) {
        return normalizedBaseKey;
      }
      return `${normalizedBaseKey}:${normalizedNamespace}`;
    }

    function getLocalRestoreStorageKeys(baseKey) {
      const normalizedBaseKey = typeof baseKey === 'string' ? baseKey.trim() : '';
      if (!normalizedBaseKey) {
        return [];
      }
      const keys = [normalizedBaseKey];
      const scopedKey = getScopedStorageKey(normalizedBaseKey);
      if (scopedKey && scopedKey !== normalizedBaseKey) {
        keys.push(scopedKey);
      }
      return keys;
    }

    function isTabLocalRestoreOnlyKey(baseKey) {
      return baseKey === AUTOSAVE_ACTIVE_PROJECT_SYNC_KEY
        || baseKey === RELOAD_TARGET_PROJECT_ID_KEY
        || baseKey === RELOAD_PROJECT_FALLBACK_STORAGE_KEY;
    }

    function writeSessionStorageForLocalRestore(baseKey, value) {
      if (!canUseSessionStorage) {
        return;
      }
      getLocalRestoreStorageKeys(baseKey).forEach(key => {
        try {
          window.sessionStorage.setItem(key, value);
        } catch (error) {
          // Ignore storage write failures.
        }
      });
    }

    function writeLocalStorageForLocalRestore(baseKey, value) {
      if (!canUseSessionStorage) {
        return;
      }
      if (isTabLocalRestoreOnlyKey(baseKey)) {
        return;
      }
      getLocalRestoreStorageKeys(baseKey).forEach(key => {
        try {
          window.localStorage.setItem(key, value);
        } catch (error) {
          // Ignore storage write failures.
        }
      });
    }

    function readSessionStorageForLocalRestore(baseKey) {
      if (!canUseSessionStorage) {
        return '';
      }
      const keys = getLocalRestoreStorageKeys(baseKey);
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        try {
          const value = window.sessionStorage.getItem(key) || '';
          if (value) {
            return value;
          }
        } catch (error) {
          // Ignore storage read failures.
        }
      }
      return '';
    }

    function readLocalStorageForLocalRestore(baseKey) {
      if (!canUseSessionStorage) {
        return '';
      }
      if (isTabLocalRestoreOnlyKey(baseKey)) {
        return '';
      }
      const keys = getLocalRestoreStorageKeys(baseKey);
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        try {
          const value = window.localStorage.getItem(key) || '';
          if (value) {
            return value;
          }
        } catch (error) {
          // Ignore storage read failures.
        }
      }
      return '';
    }

    function clearLocalRestoreStorage(baseKey) {
      if (!canUseSessionStorage) {
        return;
      }
      getLocalRestoreStorageKeys(baseKey).forEach(key => {
        try {
          window.sessionStorage.removeItem(key);
        } catch (error) {
          // Ignore sessionStorage cleanup failures.
        }
        if (isTabLocalRestoreOnlyKey(baseKey)) {
          return;
        }
        try {
          window.localStorage.removeItem(key);
        } catch (error) {
          // Ignore localStorage cleanup failures.
        }
      });
    }

    return Object.freeze({
      getCurrentAccountStorageNamespace,
      getScopedStorageKey,
      getLocalRestoreStorageKeys,
      isTabLocalRestoreOnlyKey,
      writeSessionStorageForLocalRestore,
      writeLocalStorageForLocalRestore,
      readSessionStorageForLocalRestore,
      readLocalStorageForLocalRestore,
      clearLocalRestoreStorage,
    });
  }
})();
