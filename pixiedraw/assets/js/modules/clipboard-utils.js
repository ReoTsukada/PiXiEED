(() => {
  if (typeof window === 'undefined' || !window.document) {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createClipboardUtils({
    localizeText,
  } = {}) {
    async function writeTextToClipboard(text, { promptFallback = true } = {}) {
      if (typeof text !== 'string' || !text.trim()) {
        return false;
      }
      const value = text;
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
          await navigator.clipboard.writeText(value);
          return true;
        } catch (error) {
          // Fallback to execCommand below.
        }
      }
      try {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
        document.body.removeChild(textarea);
        if (copied) {
          return true;
        }
      } catch (error) {
        // continue to prompt fallback
      }
      if (!promptFallback) {
        return false;
      }
      try {
        // Last-resort fallback for environments where clipboard APIs are blocked.
        // Users can manually copy from the prompt field.
        window.prompt(
          localizeText('共有URLを手動でコピーしてください', 'Copy the shared URL manually'),
          value
        );
        return false;
      } catch (error) {
        return false;
      }
    }

    return {
      writeTextToClipboard,
    };
  }

  root.clipboardUtils = {
    createClipboardUtils,
  };
})();
