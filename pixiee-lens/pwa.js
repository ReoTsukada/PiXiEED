(() => {
  const installBanner = document.getElementById('installPrompt');
  const installButton = document.getElementById('installAppBtn');
  let deferredPrompt = null;

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

  if (installButton) {
    installButton.addEventListener('click', async () => {
      if (!deferredPrompt) {
        return;
      }
      try {
        installButton.disabled = true;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice.catch(() => undefined);
      } catch (error) {
        console.warn('PWA install prompt failed', error);
      } finally {
        deferredPrompt = null;
        hideInstallPrompt();
      }
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    showInstallPrompt();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallPrompt();
  });

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
