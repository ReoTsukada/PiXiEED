(function () {
  const currentScript = document.currentScript;

  function asset(relativePath) {
    try {
      return new URL(relativePath, currentScript?.src || window.location.href).href;
    } catch (_error) {
      return relativePath;
    }
  }

  function removeSharedHeader() {
    document.querySelectorAll('.site-header, header[aria-label="top-nav"]').forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      node.remove();
    });
  }

  function ensureSharedAuthPanelScript() {
    if (window.pixieedSharedAuthPanel || document.querySelector('script[data-pixieed-shared-auth="true"]')) {
      return;
    }
    const script = document.createElement('script');
    script.defer = true;
    script.dataset.pixieedSharedAuth = 'true';
    script.src = asset('./shared-auth-panel.js?v=20260722-auth-form1');
    document.head.appendChild(script);
  }

  function init() {
    removeSharedHeader();
    ensureSharedAuthPanelScript();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
