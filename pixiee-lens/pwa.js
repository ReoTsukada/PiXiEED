(() => {
  const installBanner = document.getElementById('installPrompt');
  const installButton = document.getElementById('installAppBtn');
  const installLaterButton = document.getElementById('installLaterBtn');
  let deferredPrompt = null;
  const STORAGE_KEY = 'pixiee-lens:pwa-installed';
  const DISMISS_KEY = 'pixiee-lens:pwa-dismissed';

  const isAndroidChrome = () => {
    const ua = navigator.userAgent || '';
    const isAndroid = /android/i.test(ua);
    if (!isAndroid) {
      return false;
    }
    const isChrome = /chrome/i.test(ua) && !/crios/i.test(ua);
    if (!isChrome) {
      return false;
    }
    const isEdge = /edg/i.test(ua);
    const isOpera = /opr|opera/i.test(ua);
    const isSamsung = /samsungbrowser/i.test(ua);
    return !isEdge && !isOpera && !isSamsung;
  };

  const canShowInstallPrompt = isAndroidChrome();

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

  const getDismissedState = () => {
    try {
      return window.localStorage.getItem(DISMISS_KEY) === '1';
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

  const setDismissedState = () => {
    try {
      const timestamp = Date.now();
      window.localStorage.setItem(DISMISS_KEY, String(timestamp));
    } catch (error) {
      // ignore storage errors
    }
  };

  const resetDismissedStateIfExpired = () => {
    try {
      const raw = window.localStorage.getItem(DISMISS_KEY);
      if (!raw) {
        return;
      }
      const timestamp = Number(raw);
      if (!Number.isFinite(timestamp)) {
        window.localStorage.removeItem(DISMISS_KEY);
        return;
      }
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      if (Date.now() - timestamp >= ONE_DAY_MS) {
        window.localStorage.removeItem(DISMISS_KEY);
      }
    } catch (error) {
      // ignore errors
    }
  };

  const isAppInstalled = () =>
    isDisplayModeStandalone() || isIOSStandalone() || getStoredInstallState();

  const showInstallPrompt = () => {
    if (installBanner) {
      installBanner.hidden = false;
      installBanner.classList.add('is-visible');
    }
  };

  const hideInstallPrompt = () => {
    if (installBanner) {
      installBanner.hidden = true;
      installBanner.classList.remove('is-visible');
    }
  };

  const markAppInstalled = () => {
    setStoredInstallState();
    hideInstallPrompt();
    deferredPrompt = null;
  };

  if (installButton && canShowInstallPrompt) {
    installButton.addEventListener('click', async () => {
      if (!deferredPrompt) {
        return;
      }
      try {
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
  } else {
    hideInstallPrompt();
  }

  if (installBanner) {
    installBanner.addEventListener('click', (event) => {
      if (event.target === installBanner) {
        setDismissedState();
        hideInstallPrompt();
      }
    });
  }

  if (installLaterButton) {
    installLaterButton.addEventListener('click', () => {
      setDismissedState();
      hideInstallPrompt();
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    if (!canShowInstallPrompt) {
      return;
    }
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

  resetDismissedStateIfExpired();

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
