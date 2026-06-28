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
  });
})();
