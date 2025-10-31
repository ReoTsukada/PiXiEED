(() => {
  const installBanner = document.getElementById('installPrompt');
  const installButton = document.getElementById('installAppBtn');
  let deferredPrompt = null;
  const STORAGE_KEY = 'pixiee-lens:pwa-installed';

  const isDisplayModeStandalone = () => {
    if (window.matchMedia) {
      try {
        return window.matchMedia('(display-mode: standalone)').matches;
      } catch (error) {
        return false;
      }
    }
    return false;
  };

  const isIOSStandalone = () => window.navigator?.standalone === true;

  const getStoredInstallState = () => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch (error) {
      return false;
    }
  };

  const setStoredInstallState = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch (error) {
      // ignore storage errors (e.g., Safari private mode)
    }
  };

  const isAppInstalled = () =>
    isDisplayModeStandalone() || isIOSStandalone() || getStoredInstallState();

  const showInstallPrompt = () => {
    if (installBanner) {
      installBanner.hidden = false;
    }
    if (installButton) {
      installButton.disabled = false;
    }
  };

  const hideInstallPrompt = () => {
    if (installBanner) {
      installBanner.hidden = true;
    }
    if (installButton) {
      installButton.disabled = false;
    }
  };

  const markAppInstalled = () => {
    setStoredInstallState();
    hideInstallPrompt();
    deferredPrompt = null;
  };

  if (installButton) {
    installButton.addEventListener('click', async () => {
      if (!deferredPrompt) {
        return;
      }
      try {
        installButton.disabled = true;
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice.catch(() => undefined);
        if (choice && choice.outcome === 'accepted') {
          markAppInstalled();
          return;
        }
      } catch (error) {
        console.warn('PWA install prompt failed', error);
      } finally {
        deferredPrompt = null;
        hideInstallPrompt();
      }
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    if (isAppInstalled()) {
      return;
    }
    event.preventDefault();
    deferredPrompt = event;
    showInstallPrompt();
  });

  window.addEventListener('appinstalled', () => {
    markAppInstalled();
  });

  if (isAppInstalled()) {
    hideInstallPrompt();
  } else if (window.matchMedia) {
    try {
      const standaloneWatcher = window.matchMedia('(display-mode: standalone)');
      if (standaloneWatcher && typeof standaloneWatcher.addEventListener === 'function') {
        standaloneWatcher.addEventListener('change', (event) => {
          if (event.matches) {
            markAppInstalled();
          }
        });
      }
    } catch (error) {
      // ignore matchMedia errors
    }
  }

  const supportsServiceWorker = 'serviceWorker' in navigator;
  if (!supportsServiceWorker || !window.isSecureContext) {
    return;
  }

  const resolveBuildVersion = () => {
    const meta = document.querySelector('meta[name="build-version"]');
    const metaContent = meta?.content?.trim();
    if (metaContent) {
      return metaContent;
    }
    const parsed = Date.parse(document.lastModified || '');
    const timestamp = Number.isNaN(parsed) ? Date.now() : parsed;
    return `pixiee-lens-${timestamp}`;
  };

  const registerServiceWorker = () => {
    const versionToken = resolveBuildVersion();
    const serviceWorkerUrl = `./sw.js?v=${encodeURIComponent(versionToken)}`;

    navigator.serviceWorker
      .register(serviceWorkerUrl)
      .catch((error) => {
        console.warn('Service worker registration failed', error);
      });
  };

  if (document.readyState === 'complete') {
    registerServiceWorker();
  } else {
    window.addEventListener('load', registerServiceWorker, { once: true });
  }
})();
