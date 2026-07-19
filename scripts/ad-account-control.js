(function () {
  'use strict';

  if (window.PiXiEEDAdAccountControl) {
    window.PiXiEEDAdAccountControl.refresh();
    return;
  }

  const AUTH_STORAGE_KEY = 'sb-kyyiuakrqomzlikfaire-auth-token';
  const AUTH_SESSION_CACHE_KEY = 'pixieed:auth-session-cache:v1';
  const AD_FREE_CACHE_KEY = 'pixieed:site-ad-free:v1';
  const AD_FREE_CACHE_TTL_MS = 60 * 1000;
  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const ADSENSE_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9801602250480253';
  const ADSENSE_LOAD_TIMEOUT_MS = 15000;
  const controllerScriptUrl = document.currentScript?.src || new URL('scripts/ad-account-control.js', window.location.href).href;
  const siteRootUrl = new URL('../', controllerScriptUrl);
  let adsensePromise = null;
  let resolutionPromise = null;
  let resolvedUserId = '';
  let stateResolved = false;
  let stateDisabled = false;
  let observer = null;
  let accountSuppressedAds = false;
  let adsDisabledBeforeAccount = false;
  let autoAdsDisabledBeforeAccount = false;
  let fallbackObserver = null;

  function decodeJwtPayload(token) {
    try {
      const payload = String(token || '').split('.')[1] || '';
      if (!payload) return null;
      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
      return JSON.parse(decodeURIComponent(Array.from(atob(base64), (character) => (
        `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`
      )).join('')));
    } catch (_error) {
      return null;
    }
  }

  function sessionFromValue(value) {
    if (!value || typeof value !== 'object') return null;
    const user = value.user || value.session?.user || value.currentSession?.user || null;
    const accessToken = value.access_token || value.session?.access_token || value.currentSession?.access_token || '';
    const payload = decodeJwtPayload(accessToken);
    const userId = user?.id || payload?.sub || '';
    if (!userId || !accessToken) return null;
    return { userId: String(userId), accessToken: String(accessToken) };
  }

  function readStoredSession() {
    for (const key of [AUTH_STORAGE_KEY, AUTH_SESSION_CACHE_KEY]) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const session = sessionFromValue(JSON.parse(raw));
        if (session) return session;
      } catch (_error) {}
    }
    return null;
  }

  function readCachedState(userId) {
    try {
      const value = JSON.parse(localStorage.getItem(AD_FREE_CACHE_KEY) || 'null');
      if (value?.userId !== userId || typeof value?.disabled !== 'boolean') return null;
      if (!Number.isFinite(value.checkedAt) || Date.now() - value.checkedAt > AD_FREE_CACHE_TTL_MS) return null;
      return value.disabled;
    } catch (_error) {
      return null;
    }
  }

  function writeCachedState(userId, disabled) {
    try {
      localStorage.setItem(AD_FREE_CACHE_KEY, JSON.stringify({ userId, disabled, checkedAt: Date.now() }));
    } catch (_error) {}
  }

  function ensureSuppressionStyle() {
    if (document.getElementById('pixieed-ad-free-account-style')) return;
    const style = document.createElement('style');
    style.id = 'pixieed-ad-free-account-style';
    style.textContent = `
      html[data-pixieed-ad-free-account="true"] ins.adsbygoogle,
      html[data-pixieed-ad-free-account="true"] .adsbygoogle,
      html[data-pixieed-ad-free-account="true"] .google-auto-placed,
      html[data-pixieed-ad-free-account="true"] iframe[id^="google_ads_iframe"],
      html[data-pixieed-ad-free-account="true"] iframe[name^="google_ads_iframe"],
      html[data-pixieed-ad-free-account="true"] iframe[id^="aswift_"],
      html[data-pixieed-ad-free-account="true"] iframe[name^="aswift_"],
      html[data-pixieed-ad-free-account="true"] .ad-footer,
      html[data-pixieed-ad-free-account="true"] .pixieed-shared-top-ad,
      html[data-pixieed-ad-free-account="true"] .pixieed-common-details__ad,
      html[data-pixieed-ad-free-account="true"] .lens-ad-banner,
      html[data-pixieed-ad-free-account="true"] .capture-preview__ad,
      html[data-pixieed-ad-free-account="true"] .project-ad,
      html[data-pixieed-ad-free-account="true"] .game-ad,
      html[data-pixieed-ad-free-account="true"] .puzzle-ad-slot,
      html[data-pixieed-ad-free-account="true"] .ad-block:has(ins.adsbygoogle),
      html[data-pixieed-ad-free-account="true"] .ad-card:has(ins.adsbygoogle){
        display:none!important;
        width:0!important;
        height:0!important;
        min-width:0!important;
        min-height:0!important;
        margin:0!important;
        padding:0!important;
        border:0!important;
        overflow:hidden!important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function isGoogleAdNode(node) {
    if (!(node instanceof Element)) return false;
    return node.matches([
      'ins.adsbygoogle',
      '.google-auto-placed',
      'iframe[id^="google_ads_iframe"]',
      'iframe[name^="google_ads_iframe"]',
      'iframe[id^="aswift_"]',
      'iframe[name^="aswift_"]'
    ].join(','));
  }

  function removeRenderedAds(root) {
    if (document.documentElement.dataset.pixieedAdFreeAccount !== 'true') return;
    const scope = root instanceof Element || root instanceof Document ? root : null;
    if (!scope) return;
    if (isGoogleAdNode(scope)) scope.remove();
    scope.querySelectorAll?.([
      'ins.adsbygoogle',
      '.google-auto-placed',
      'iframe[id^="google_ads_iframe"]',
      'iframe[name^="google_ads_iframe"]',
      'iframe[id^="aswift_"]',
      'iframe[name^="aswift_"]'
    ].join(',')).forEach((node) => node.remove());
  }

  function observeAds() {
    if (observer || typeof MutationObserver !== 'function') return;
    observer = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => removeRenderedAds(node)));
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function applyState(disabled, resolved) {
    const wasDisabled = stateDisabled;
    const wasResolved = stateResolved;
    stateDisabled = disabled === true;
    stateResolved = resolved === true;
    document.documentElement.dataset.pixieedAdFreeAccount = stateDisabled ? 'true' : 'false';
    document.documentElement.dataset.pixieedAdAccountState = stateResolved ? 'ready' : 'pending';
    window.__PIXIEED_AD_FREE_ACCOUNT__ = stateDisabled;

    if (stateDisabled) {
      if (!accountSuppressedAds) {
        adsDisabledBeforeAccount = window.__PIXIEED_ADS_DISABLED__ === true;
        autoAdsDisabledBeforeAccount = window.__PIXIEED_DISABLE_AUTO_ADS__ === true;
      }
      accountSuppressedAds = true;
      window.__PIXIEED_ADS_DISABLED__ = true;
      window.__PIXIEED_DISABLE_AUTO_ADS__ = true;
      ensureSuppressionStyle();
      removeRenderedAds(document);
      observeAds();
    } else if (accountSuppressedAds) {
      accountSuppressedAds = false;
      window.__PIXIEED_ADS_DISABLED__ = adsDisabledBeforeAccount;
      window.__PIXIEED_DISABLE_AUTO_ADS__ = autoAdsDisabledBeforeAccount;
    }

    if (wasDisabled !== stateDisabled || wasResolved !== stateResolved) {
      try {
        document.dispatchEvent(new CustomEvent('pixieed:ad-account-state', {
          detail: { disabled: stateDisabled, resolved: stateResolved }
        }));
      } catch (_error) {}
    }

    if (wasDisabled && !stateDisabled && stateResolved) loadAdsense();
    return stateDisabled;
  }

  async function fetchRemoteState(session) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/site_current_user_ad_free`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    if (!response.ok) throw new Error(`ad permission request failed (${response.status})`);
    return (await response.json()) === true;
  }

  function resolveRemoteState(session) {
    if (resolutionPromise && resolvedUserId === session.userId) return resolutionPromise;
    resolvedUserId = session.userId;
    const request = fetchRemoteState(session)
      .then((disabled) => {
        if (readStoredSession()?.userId !== session.userId) return false;
        writeCachedState(session.userId, disabled);
        return applyState(disabled, true);
      })
      .catch(() => {
        if (readStoredSession()?.userId === session.userId) applyState(false, true);
        return false;
      })
      .finally(() => {
        if (resolutionPromise === request) resolutionPromise = null;
      });
    resolutionPromise = request;
    return resolutionPromise;
  }

  function refresh(options = {}) {
    const session = readStoredSession();
    if (!session) {
      resolvedUserId = '';
      resolutionPromise = null;
      return applyState(false, true);
    }
    if (resolvedUserId && resolvedUserId !== session.userId) {
      resolutionPromise = null;
      stateResolved = false;
    }
    const cached = options.force ? null : readCachedState(session.userId);
    if (cached !== null) {
      resolvedUserId = session.userId;
      applyState(cached, true);
      return cached;
    }
    applyState(stateDisabled && resolvedUserId === session.userId, false);
    resolveRemoteState(session);
    return stateDisabled;
  }

  async function resolve() {
    refresh();
    if (stateResolved) return stateDisabled;
    if (resolutionPromise) return resolutionPromise;
    return false;
  }

  function isAdFreeAccount() {
    refresh();
    return stateDisabled;
  }

  async function loadAdsense() {
    if (await resolve() || window.__PIXIEED_ADS_DISABLED__) return false;
    const existing = document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');
    const runtimeReady = Boolean(
      existing
      && (window.__PIXIEED_ADSENSE_SCRIPT_READY__ === true
        || window.adsbygoogle?.loaded === true
        || document.querySelector('ins.adsbygoogle[data-adsbygoogle-status="done"]'))
    );
    if (runtimeReady) {
      window.__PIXIEED_ADSENSE_SCRIPT_READY__ = true;
      syncAdsenseAvailability(true);
      return true;
    }
    if (adsensePromise) return adsensePromise;
    adsensePromise = new Promise((done) => {
      const script = existing || document.createElement('script');
      let settled = false;
      let timeoutId = 0;
      const finish = (loaded) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        if (loaded) window.__PIXIEED_ADSENSE_SCRIPT_READY__ = true;
        else {
          adsensePromise = null;
          if (window.__PIXIEED_ADSENSE_SCRIPT_READY__ !== true && script.isConnected) script.remove();
        }
        syncAdsenseAvailability(loaded);
        done(loaded);
      };
      timeoutId = window.setTimeout(() => finish(false), ADSENSE_LOAD_TIMEOUT_MS);
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = ADSENSE_SRC;
      script.addEventListener('load', () => finish(true), { once: true });
      script.addEventListener('error', () => finish(false), { once: true });
      if (!existing) document.head.appendChild(script);
    });
    return adsensePromise;
  }

  function ensureAdFallbackStyle() {
    if (document.getElementById('pixieed-ad-fallback-style')) return;
    const style = document.createElement('style');
    style.id = 'pixieed-ad-fallback-style';
    style.textContent = `
      .pixieed-ad-fallback[hidden]{display:none!important}
      .pixieed-ad-fallback{
        width:100%;min-width:0;min-height:56px;box-sizing:border-box;
        display:flex;align-items:center;justify-content:center;
      }
      .pixieed-ad-fallback__link{
        width:100%;min-width:0;min-height:56px;box-sizing:border-box;
        display:flex;align-items:center;justify-content:center;gap:10px;
        padding:9px 12px;border:1px solid rgba(148,163,184,.2);border-radius:12px;
        background:linear-gradient(135deg,rgba(15,23,42,.92),rgba(30,41,59,.9));
        color:#e5edf8;text-decoration:none;font-family:system-ui,-apple-system,sans-serif;
      }
      .pixieed-ad-fallback__link:hover,.pixieed-ad-fallback__link:focus-visible{
        border-color:rgba(121,192,255,.58);background:linear-gradient(135deg,#172641,#253653);outline:none;
      }
      .pixieed-ad-fallback__icon{
        width:34px;height:34px;flex:0 0 34px;object-fit:contain;image-rendering:pixelated;
      }
      .pixieed-ad-fallback__copy{min-width:0;display:grid;gap:2px;text-align:left}
      .pixieed-ad-fallback__eyebrow{font-size:10px;font-weight:800;letter-spacing:.08em;color:#93c5fd}
      .pixieed-ad-fallback__title{font-size:13px;font-weight:800;line-height:1.25;color:#f8fafc}
      [data-pixieed-ad-fallback-active='true'] ins.adsbygoogle{display:none!important}
      .pixieed-shared-top-ad .pixieed-ad-fallback__link{min-height:42px;padding:4px 9px;border-radius:8px}
      .pixieed-shared-top-ad .pixieed-ad-fallback__icon{width:26px;height:26px;flex-basis:26px}
      .pixieed-shared-top-ad .pixieed-ad-fallback__eyebrow{font-size:8px}
      .pixieed-shared-top-ad .pixieed-ad-fallback__title{font-size:11px}
      .pixieed-common-details__ad .pixieed-ad-fallback{min-height:220px}
      .startup-recent-ad__frame > .pixieed-ad-fallback{position:absolute;inset:18px 8px 8px;min-height:0}
      .startup-recent-ad__frame > .pixieed-ad-fallback .pixieed-ad-fallback__link{min-height:0;height:100%}
      html[data-pixieed-ad-free-account='true'] .pixieed-ad-fallback{display:none!important}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function resolveAdFallbackHost(ins) {
    if (!(ins instanceof HTMLElement)) return null;
    const projectFeedFrame = ins.closest('.startup-recent-ad__frame');
    if (projectFeedFrame instanceof HTMLElement) return projectFeedFrame;
    return ins.closest([
      '.pixieed-common-details__ad',
      '.market-ad',
      '.panel-ad',
      '.export-ad',
      '.startup-recent-card--ad',
      '.puzzle-ad-slot',
      '.game-ad',
      '.project-ad',
      '.entry-ad-slot',
      '.ad-banner',
      '.ad-card',
      '.ad-block'
    ].join(',')) || ins.parentElement;
  }

  function ensureAdFallback(ins) {
    const host = resolveAdFallbackHost(ins);
    if (!(host instanceof HTMLElement)) return null;
    let fallback = host.querySelector(':scope > .pixieed-ad-fallback');
    if (fallback instanceof HTMLElement) return fallback;
    fallback = document.createElement('div');
    fallback.className = 'pixieed-ad-fallback';
    fallback.hidden = true;
    fallback.dataset.pixieedAdFallback = 'true';
    const link = document.createElement('a');
    link.className = 'pixieed-ad-fallback__link';
    link.href = new URL('index.html#projects', siteRootUrl).href;
    link.setAttribute('aria-label', 'PiXiEEDのおすすめを見る');
    const icon = document.createElement('img');
    icon.className = 'pixieed-ad-fallback__icon';
    icon.src = new URL('Market.png', siteRootUrl).href;
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span');
    copy.className = 'pixieed-ad-fallback__copy';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'pixieed-ad-fallback__eyebrow';
    eyebrow.textContent = 'PiXiEED内のおすすめ';
    const title = document.createElement('span');
    title.className = 'pixieed-ad-fallback__title';
    title.textContent = '作品や制作ツールを見てみる';
    copy.append(eyebrow, title);
    link.append(icon, copy);
    fallback.append(link);
    host.append(fallback);
    return fallback;
  }

  function syncAdFallback(ins) {
    if (!(ins instanceof HTMLElement)) return;
    const host = resolveAdFallbackHost(ins);
    if (!(host instanceof HTMLElement)) return;
    const disabled = stateDisabled || window.__PIXIEED_ADS_DISABLED__ === true || window.__PIXIEED_AD_FREE_ACCOUNT__ === true;
    const status = String(ins.getAttribute('data-ad-status') || '').toLowerCase();
    const requestState = String(ins.dataset.adsRequestState || '').toLowerCase();
    const scriptBlocked = ins.dataset.adsScriptBlocked === '1';
    const shouldShow = !disabled && (
      status === 'unfilled'
      || status === 'unfill-optimized'
      || requestState === 'push-failed'
      || scriptBlocked
    );
    if (shouldShow) {
      host.dataset.pixieedReserveAdSpace = 'true';
      host.classList.remove('is-ad-unfilled');
      host.classList.add('is-ad-unfilled-reserved');
      const mount = host.closest('.panel-ad-mount');
      mount?.classList.remove('is-ad-unfilled');
      mount?.classList.add('is-ad-unfilled-reserved');
    } else if (status !== 'unfilled' && status !== 'unfill-optimized') {
      host.classList.remove('is-ad-unfilled', 'is-ad-unfilled-reserved');
      const mount = host.closest('.panel-ad-mount');
      mount?.classList.remove('is-ad-unfilled', 'is-ad-unfilled-reserved');
    }
    const fallback = shouldShow
      ? ensureAdFallback(ins)
      : host.querySelector(':scope > .pixieed-ad-fallback');
    if (fallback instanceof HTMLElement) fallback.hidden = !shouldShow;
    host.dataset.pixieedAdFallbackActive = shouldShow ? 'true' : 'false';
  }

  function syncAdsenseAvailability(loaded) {
    if (stateDisabled || window.__PIXIEED_ADS_DISABLED__ === true || window.__PIXIEED_AD_FREE_ACCOUNT__ === true) return;
    document.querySelectorAll('ins.adsbygoogle').forEach((ins) => {
      if (loaded) delete ins.dataset.adsScriptBlocked;
      else ins.dataset.adsScriptBlocked = '1';
      syncAdFallback(ins);
    });
  }

  function observeAdFallbacks(root = document) {
    ensureAdFallbackStyle();
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    if (scope instanceof HTMLElement && scope.matches('ins.adsbygoogle')) syncAdFallback(scope);
    scope.querySelectorAll?.('ins.adsbygoogle').forEach(syncAdFallback);
  }

  function setupAdFallbackObserver() {
    observeAdFallbacks(document);
    if (fallbackObserver || typeof MutationObserver !== 'function') return;
    fallbackObserver = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === 'attributes' && record.target instanceof HTMLElement) {
          if (record.target.matches('ins.adsbygoogle')) syncAdFallback(record.target);
          return;
        }
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) observeAdFallbacks(node);
        });
      });
    });
    fallbackObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        'data-ad-status',
        'data-adsbygoogle-status',
        'data-ads-request-state',
        'data-ads-script-blocked'
      ],
      childList: true,
      subtree: true
    });
  }

  const api = Object.freeze({ refresh, resolve, isAdFreeAccount, loadAdsense, syncAdFallback, observeAdFallbacks });
  window.PiXiEEDAdAccountControl = api;
  window.addEventListener('storage', (event) => {
    if ([AUTH_STORAGE_KEY, AUTH_SESSION_CACHE_KEY, AD_FREE_CACHE_KEY].includes(event.key)) {
      refresh({ force: event.key !== AD_FREE_CACHE_KEY });
    }
  });
  refresh();
  setupAdFallbackObserver();
})();
