(() => {
  'use strict';

  if (typeof window === 'undefined') {
    return;
  }

  // Legacy shim:
  // PiXiEEDraw now manages PWA install guidance from app.js and only from the settings panel.
  // Keep this file inert so older cached HTML that still references it does not show popups.
  if (!window.pixieedPwaInstall) {
    window.pixieedPwaInstall = {
      open() {
        return false;
      },
      isAvailable() {
        return false;
      },
      isStandalone: false,
      isIOS: false,
    };
  }

  window.dispatchEvent(new CustomEvent('pixieed:pwa-install-availability-change', {
    detail: {
      available: false,
      standalone: false,
      ios: false,
    },
  }));
})();
