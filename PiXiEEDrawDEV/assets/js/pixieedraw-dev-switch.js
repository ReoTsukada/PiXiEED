(() => {
  const PROD_PATH = '/pixiedraw/';
  const DEV_PATH = '/PiXiEEDrawDEV/';
  const TAP_LIMIT = 10;
  const TAP_WINDOW_MS = 4000;
  const STORAGE_KEY = 'pixieedraw:runtime-target:v1';
  const RUNTIME_CACHE_BUSTER = '2026.07.03-pixieedrawdev-switch-fix5';
  let tapCount = 0;
  let firstTapAt = 0;

  function isSettingsButton(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    return Boolean(target.closest('[data-quick-right-tab="settings"], [data-mobile-tab="settings"], #mobileTabSettings'));
  }

  function getCurrentPath() {
    return window.location.pathname || '';
  }

  function getNextPath() {
    return getCurrentPath().startsWith(DEV_PATH) ? PROD_PATH : DEV_PATH;
  }

  function switchRuntime() {
    const nextPath = getNextPath();
    try {
      window.localStorage.setItem(STORAGE_KEY, nextPath === DEV_PATH ? 'PiXiEEDrawDEV' : 'PiXiEEDraw');
    } catch (error) {
      // Ignore storage failures; navigation itself is enough.
    }
    const nextUrl = new URL(nextPath, window.location.origin);
    nextUrl.search = window.location.search;
    nextUrl.searchParams.set('pixieedrawRuntime', nextPath === DEV_PATH ? RUNTIME_CACHE_BUSTER : 'prod');
    nextUrl.hash = window.location.hash;
    window.location.assign(nextUrl.href);
  }

  document.addEventListener('click', event => {
    if (!isSettingsButton(event.target)) {
      return;
    }
    const now = Date.now();
    if (!firstTapAt || (now - firstTapAt) > TAP_WINDOW_MS) {
      firstTapAt = now;
      tapCount = 0;
    }
    tapCount += 1;
    if (tapCount >= TAP_LIMIT) {
      tapCount = 0;
      firstTapAt = 0;
      switchRuntime();
    }
  }, true);
})();
