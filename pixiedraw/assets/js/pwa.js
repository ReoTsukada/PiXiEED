(() => {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  if (!window.isSecureContext) {
    console.warn('Service worker registration skipped: insecure context.');
    return;
  }

  const versionSource =
    document.querySelector('meta[name="build-version"]')?.content ||
    document.documentElement.getAttribute('data-build-version') ||
    (() => {
      const time = Date.parse(document.lastModified);
      return Number.isNaN(time) ? Date.now().toString() : time.toString();
    })();

  const serviceWorkerURL = `service-worker.js?v=${encodeURIComponent(versionSource)}`;
  let updateBanner = null;
  let isReloading = false;

  function removeBanner() {
    if (updateBanner) {
      updateBanner.remove();
      updateBanner = null;
    }
  }

  function createUpdateBanner(message, primaryLabel, onPrimary, secondaryLabel, onSecondary) {
    const banner = document.createElement('div');
    banner.className = 'update-toast';
    banner.innerHTML = `
      <div class="update-toast__body">
        <p class="update-toast__message">${message}</p>
        <div class="update-toast__actions">
          <button type="button" class="update-toast__btn update-toast__btn--primary">${primaryLabel}</button>
          <button type="button" class="update-toast__btn">${secondaryLabel}</button>
        </div>
      </div>
    `;
    const [primaryButton, secondaryButton] = banner.querySelectorAll('button');
    primaryButton.addEventListener('click', onPrimary, { once: true });
    secondaryButton.addEventListener('click', onSecondary, { once: true });
    return banner;
  }

  function promptForUpdate(registration) {
    const waitingWorker = registration.waiting;
    if (!waitingWorker || !navigator.serviceWorker.controller) {
      return;
    }
    if (updateBanner) {
      return;
    }

    const onUpdate = () => {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      removeBanner();
    };

    const onDismiss = () => {
      removeBanner();
    };

    updateBanner = createUpdateBanner(
      '新しいバージョンの PiXiEEDraw を利用できます。',
      '今すぐ更新',
      onUpdate,
      'あとで',
      onDismiss
    );

    document.body.appendChild(updateBanner);
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isReloading) {
      return;
    }
    isReloading = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(serviceWorkerURL, { scope: './' })
      .then(registration => {
        if (registration.waiting) {
          promptForUpdate(registration);
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) {
            return;
          }
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') {
              promptForUpdate(registration);
            }
          });
        });
      })
      .catch(error => {
        console.warn('Service worker registration failed:', error);
      });
  });
})();
