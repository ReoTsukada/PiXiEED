(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createUiLanguageUtils(rawScope = {}) {
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
  function setDocumentLanguage() {
    if (typeof document === 'undefined' || !document.documentElement) {
      return;
    }
    const nextLanguage = uiLanguage === UI_LANGUAGE_EN
      ? 'en'
      : (uiLanguage === UI_LANGUAGE_ZH ? 'zh' : 'ja');
    document.documentElement.lang = nextLanguage;
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('pixieedraw:uilanguagechange', {
        detail: { language: nextLanguage },
      }));
    }
  }

  function isEnglishUi() {
    return uiLanguage === UI_LANGUAGE_EN;
  }

  function isChineseUi() {
    return uiLanguage === UI_LANGUAGE_ZH;
  }

  function getNextUiLanguage() {
    if (uiLanguage === UI_LANGUAGE_JA) {
      return UI_LANGUAGE_EN;
    }
    if (uiLanguage === UI_LANGUAGE_EN) {
      return UI_LANGUAGE_ZH;
    }
    return UI_LANGUAGE_JA;
  }

  function resolveChineseText(jaText, enText) {
    if (typeof jaText === 'string' && UI_LANGUAGE_ZH_MAP[jaText]) {
      return UI_LANGUAGE_ZH_MAP[jaText];
    }
    if (typeof enText === 'string' && UI_LANGUAGE_ZH_MAP[enText]) {
      return UI_LANGUAGE_ZH_MAP[enText];
    }
    return '';
  }

  function localizeText(jaText, enText, zhText = '') {
    if (isChineseUi()) {
      const directZh = typeof zhText === 'string' && zhText ? zhText : resolveChineseText(jaText, enText);
      if (directZh) {
        return directZh;
      }
      return enText || jaText;
    }
    return isEnglishUi() ? enText : jaText;
  }

  function localizeUiThemePresetLabel(label) {
    if (isChineseUi()) {
      const map = {
        緑色: '绿色',
        ピンク: '粉色',
        白色: '白色',
        水色: '浅蓝',
        黄色: '黄色',
      };
      return map[label] || label;
    }
    if (!isEnglishUi()) {
      return label;
    }
    const map = {
      緑色: 'Green',
      ピンク: 'Pink',
      白色: 'White',
      水色: 'Sky',
      黄色: 'Yellow',
    };
    return map[label] || label;
  }

        return Object.freeze({
          setDocumentLanguage,
          isEnglishUi,
          isChineseUi,
          getNextUiLanguage,
          resolveChineseText,
          localizeText,
          localizeUiThemePresetLabel,
        });
      }
    })(scope);
  }

  root.uiLanguageUtils = Object.freeze({
    createUiLanguageUtils,
  });
})();
