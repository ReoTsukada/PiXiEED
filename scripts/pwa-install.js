(() => {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const nav = window.navigator || {};
  const ua = nav.userAgent || '';
  const platform = nav.platform || '';
  const pathname = typeof window.location?.pathname === 'string' ? window.location.pathname : '';
  const isPixieeDrawPath = /(?:^|\/)pixiedraw(?:\/|$)/i.test(pathname);
  const isNativeApp = (() => {
    const capacitor = window.Capacitor || globalThis.Capacitor;
    try {
      if (capacitor && typeof capacitor.isNativePlatform === 'function' && capacitor.isNativePlatform()) {
        return true;
      }
    } catch (_error) {
      // Ignore Capacitor runtime detection failures.
    }
    const protocol = String(window.location?.protocol || '');
    return protocol === 'capacitor:' || protocol === 'ionic:' || protocol === 'app:';
  })();

  if (!isPixieeDrawPath || isNativeApp) {
    return;
  }

  const isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isStandalone = (
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || nav.standalone === true
  );

  if (isStandalone) {
    return;
  }

  const ensureStyles = () => {
    if (document.getElementById('pixieedPwaInstallStyles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'pixieedPwaInstallStyles';
    style.textContent = `
      .pixieed-pwa-install-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483641;
        background: rgba(0, 0, 0, 0.62);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .pixieed-pwa-install-overlay[hidden] {
        display: none !important;
      }
      .pixieed-pwa-install-dialog {
        width: min(92vw, 420px);
        background: #101828;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 16px;
        padding: 18px;
        color: #f8fafc;
        box-shadow: 0 24px 48px rgba(0, 0, 0, 0.45);
      }
      .pixieed-pwa-install-title {
        margin: 0 0 8px;
        font: 700 17px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .pixieed-pwa-install-text {
        margin: 0;
        white-space: pre-line;
        font: 400 14px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #d1d5db;
      }
      .pixieed-pwa-install-actions {
        margin-top: 14px;
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      .pixieed-pwa-install-action {
        border: 0;
        border-radius: 10px;
        padding: 9px 12px;
        font: 700 13px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        cursor: pointer;
      }
      .pixieed-pwa-install-action--primary {
        background: #ff9f43;
        color: #111827;
      }
      .pixieed-pwa-install-action--ghost {
        background: rgba(255, 255, 255, 0.08);
        color: #f8fafc;
      }
    `;
    document.head.appendChild(style);
  };

  const createDialog = () => {
    ensureStyles();

    const overlay = document.createElement('div');
    overlay.className = 'pixieed-pwa-install-overlay';
    overlay.hidden = true;

    const dialog = document.createElement('div');
    dialog.className = 'pixieed-pwa-install-dialog';

    const title = document.createElement('h2');
    title.className = 'pixieed-pwa-install-title';

    const message = document.createElement('p');
    message.className = 'pixieed-pwa-install-text';

    const actions = document.createElement('div');
    actions.className = 'pixieed-pwa-install-actions';

    const secondaryButton = document.createElement('button');
    secondaryButton.type = 'button';
    secondaryButton.className = 'pixieed-pwa-install-action pixieed-pwa-install-action--ghost';

    const primaryButton = document.createElement('button');
    primaryButton.type = 'button';
    primaryButton.className = 'pixieed-pwa-install-action pixieed-pwa-install-action--primary';

    actions.appendChild(secondaryButton);
    actions.appendChild(primaryButton);
    dialog.appendChild(title);
    dialog.appendChild(message);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        overlay.hidden = true;
      }
    });

    return {
      open(config) {
        const {
          dialogTitle,
          dialogMessage,
          primaryLabel,
          secondaryLabel,
          onPrimary,
          onSecondary
        } = config;

        title.textContent = dialogTitle;
        message.textContent = dialogMessage;
        primaryButton.textContent = primaryLabel || '閉じる';
        secondaryButton.textContent = secondaryLabel || 'キャンセル';

        primaryButton.onclick = () => {
          if (typeof onPrimary === 'function') {
            onPrimary();
          }
          overlay.hidden = true;
        };

        secondaryButton.onclick = () => {
          if (typeof onSecondary === 'function') {
            onSecondary();
          }
          overlay.hidden = true;
        };

        overlay.hidden = false;
      },
      close() {
        overlay.hidden = true;
      }
    };
  };

  const ready = (callback) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
      return;
    }
    callback();
  };

  ready(() => {
    const dialog = createDialog();

    let deferredPrompt = null;
    let installAvailable = false;

    const notifyState = () => {
      window.dispatchEvent(new CustomEvent('pixieed:pwa-install-availability-change', {
        detail: {
          available: installAvailable || isIOS,
          ios: isIOS,
          standalone: isStandalone,
        },
      }));
    };

    const openInstallPopup = () => {
      if (isStandalone) {
        return false;
      }
      installAvailable = Boolean(deferredPrompt);
      const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
      if (isIOS) {
        dialog.open({
          dialogTitle: 'PiXiEEDrawをインストール',
          dialogMessage: isSafari
            ? 'Safariの共有ボタンをタップして「ホーム画面に追加」を選ぶと、PiXiEEDrawをアプリのように使えます。'
            : 'この端末ではSafariで開くと「ホーム画面に追加」できます。SafariでPiXiEEDrawを開いて共有メニューを使ってください。',
          primaryLabel: '閉じる',
          secondaryLabel: 'OK'
        });
        return true;
      }
      dialog.open({
        dialogTitle: 'PiXiEEDrawをインストール',
        dialogMessage: 'ホーム画面やデスクトップに追加すると、PiXiEEDrawをアプリのようにすぐ開けます。',
        primaryLabel: 'インストール',
        secondaryLabel: '後で',
        onPrimary: async () => {
          const promptEvent = deferredPrompt;
          if (!promptEvent) {
            const fallbackMessage = isAndroid
              ? 'Chromeのメニューを開いて「ホーム画面に追加」または「アプリをインストール」を選択してください。'
              : 'ブラウザのメニューから「インストール」または「アプリを追加」を選択してください。';
            dialog.open({
              dialogTitle: 'インストール手順',
              dialogMessage: fallbackMessage,
              primaryLabel: '閉じる',
              secondaryLabel: 'OK'
            });
            return;
          }
          deferredPrompt = null;
          installAvailable = false;
          notifyState();
          try {
            promptEvent.prompt();
            await promptEvent.userChoice;
          } catch (_error) {
            // Ignore prompt failures.
          }
        }
      });
      return true;
    };

    window.pixieedPwaInstall = {
      open: openInstallPopup,
      isAvailable() {
        return !isStandalone && (Boolean(deferredPrompt) || isIOS);
      },
      isStandalone,
      isIOS,
    };

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      installAvailable = true;
      notifyState();
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      installAvailable = false;
      dialog.close();
      notifyState();
    });
    notifyState();
  });
})();
