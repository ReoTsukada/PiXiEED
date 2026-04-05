(function () {
  if (window.pixieedAdFree) {
    return;
  }

  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const SUPABASE_MODULE_URL = 'https://esm.sh/@supabase/supabase-js@2.46.1?bundle';
  const AUTH_STORAGE_KEY = 'sb-kyyiuakrqomzlikfaire-auth-token';
  const CACHE_KEY = 'pixieed_browser_adfree_cache_v1';
  const GLOBAL_ENTITLEMENT_KEY = 'browser_ad_free';
  const PIXIEDRAW_ENTITLEMENT_KEY = 'pixiedraw_ad_free';
  const CHECKOUT_ENDPOINT = `${SUPABASE_URL}/functions/v1/stripe-browser-adfree-checkout`;
  const PIXIEDRAW_SUPPORT_URL = 'https://buy.stripe.com/aFadRaeo8ekv5L44MM2VG01';
  const AUTO_APPLY_QUERY_KEY = 'stripe_checkout_session_id';
  const AUTO_APPLY_STATUS_KEY = 'stripe_checkout_status';
  const ACCESS_CODE_PATTERN = /^PXA[A-Z0-9]{6,}$/i;
  const STYLE_ID = 'pixieed-adfree-style';
  const listeners = new Set();

  let supabasePromise = null;
  let refreshPromise = null;
  let authListenerBound = false;
  let uiBound = false;
  let readyResolved = false;
  let readyResolver = null;
  let uiMessage = '';
  let autoApplyStarted = false;
  let reloadPromptOpen = false;

  const state = {
    isReady: false,
    isLoading: false,
    isLoggedIn: false,
    isActive: false,
    activeEntitlements: {},
    userId: '',
    userEmail: '',
    expiresAt: '',
    lastError: '',
  };

  function isPixieedrawPage() {
    try {
      const pathname = String(window.location.pathname || '').toLowerCase();
      return /(?:^|\/)pixiedraw(?:\/|\/index\.html)?$/.test(pathname);
    } catch (_error) {
      return false;
    }
  }

  function getPageEntitlementKeys() {
    return isPixieedrawPage()
      ? [GLOBAL_ENTITLEMENT_KEY, PIXIEDRAW_ENTITLEMENT_KEY]
      : [GLOBAL_ENTITLEMENT_KEY];
  }

  function getPurchaseEntitlementKey() {
    return isPixieedrawPage() ? PIXIEDRAW_ENTITLEMENT_KEY : GLOBAL_ENTITLEMENT_KEY;
  }

  function isActiveByExpiry(expiresAt) {
    const normalized = typeof expiresAt === 'string' ? expiresAt : '';
    if (!normalized) {
      return true;
    }
    const timestamp = Date.parse(normalized);
    return Number.isFinite(timestamp) && timestamp > Date.now();
  }

  function isAnyEntitlementActive(entitlements, keys = getPageEntitlementKeys()) {
    return keys.some(key => {
      const row = entitlements?.[key];
      return row && isActiveByExpiry(row.expiresAt);
    });
  }

  const ready = new Promise(resolve => {
    readyResolver = resolve;
  });

  function resolveReady() {
    if (readyResolved) {
      return;
    }
    readyResolved = true;
    if (typeof readyResolver === 'function') {
      readyResolver(state);
    }
  }

  function readCachedState() {
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (parsed && parsed.active === true) {
        const expiresAt = typeof parsed.expiresAt === 'string' ? parsed.expiresAt : '';
        if (!isActiveByExpiry(expiresAt)) {
          return null;
        }
        return {
          entitlements: {
            [GLOBAL_ENTITLEMENT_KEY]: {
              expiresAt,
            },
          },
        };
      }
      const rawEntitlements = parsed?.entitlements;
      if (!rawEntitlements || typeof rawEntitlements !== 'object') {
        return null;
      }
      const entitlements = {};
      Object.entries(rawEntitlements).forEach(([key, value]) => {
        const expiresAt = typeof value?.expiresAt === 'string' ? value.expiresAt : '';
        if (isActiveByExpiry(expiresAt)) {
          entitlements[key] = { expiresAt };
        }
      });
      if (!Object.keys(entitlements).length) {
        return null;
      }
      return { entitlements };
    } catch (_error) {
      return null;
    }
  }

  function writeCachedState() {
    try {
      const entitlements = {};
      Object.entries(state.activeEntitlements || {}).forEach(([key, value]) => {
        const expiresAt = typeof value?.expiresAt === 'string' ? value.expiresAt : '';
        if (isActiveByExpiry(expiresAt)) {
          entitlements[key] = { expiresAt };
        }
      });
      if (Object.keys(entitlements).length) {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify({
          entitlements,
          savedAt: Date.now(),
        }));
      } else {
        window.localStorage.removeItem(CACHE_KEY);
      }
    } catch (_error) {
      // ignore cache failures
    }
  }

  function isEntitlementActive(row) {
    if (!row || ![GLOBAL_ENTITLEMENT_KEY, PIXIEDRAW_ENTITLEMENT_KEY].includes(row.entitlement_key)) {
      return false;
    }
    if (row.revoked_at || (row.status && row.status !== 'active')) {
      return false;
    }
    const expiresAt = typeof row.expires_at === 'string' ? row.expires_at : '';
    if (!expiresAt) {
      return true;
    }
    const timestamp = Date.parse(expiresAt);
    return Number.isFinite(timestamp) && timestamp > Date.now();
  }

  function formatExpiryLabel(value) {
    const timestamp = Date.parse(value || '');
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return '';
    }
    const d = new Date(timestamp);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  }

  function getAccessInput() {
    const input = document.getElementById('pixieedAdFreeOrderId');
    return input instanceof HTMLInputElement ? input : null;
  }

  function setAccessInputValue(value) {
    const input = getAccessInput();
    if (input) {
      input.value = value;
    }
  }

  function readQueryParam(name) {
    try {
      return new URL(window.location.href).searchParams.get(name) || '';
    } catch (_error) {
      return '';
    }
  }

  function clearCheckoutParams() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(AUTO_APPLY_QUERY_KEY);
      url.searchParams.delete(AUTO_APPLY_STATUS_KEY);
      window.history.replaceState({}, '', url.toString());
    } catch (_error) {
      // ignore history failures
    }
  }

  function buildCheckoutReturnUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(AUTO_APPLY_QUERY_KEY);
      url.searchParams.delete(AUTO_APPLY_STATUS_KEY);
      return url.toString();
    } catch (_error) {
      return 'https://pixieed.jp/pixiedraw/';
    }
  }

  function buildPurchaseUrl() {
    try {
      const url = new URL(CHECKOUT_ENDPOINT);
      url.searchParams.set('product', getPurchaseEntitlementKey());
      url.searchParams.set('return_url', buildCheckoutReturnUrl());
      url.searchParams.set('cancel_url', buildCheckoutReturnUrl());
      if (state.isLoggedIn && state.userEmail) {
        url.searchParams.set('email', state.userEmail);
      }
      return url.toString();
    } catch (_error) {
      return CHECKOUT_ENDPOINT;
    }
  }

  function shouldRetryPurchaseClaim(message) {
    return /purchase not found|not found|見つかりません|まだ反映/i.test(String(message || ''));
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      body.pixieed-adfree .ad-footer,
      body.pixieed-adfree .card--ad,
      body.pixieed-adfree .entry-card--ad,
      body.pixieed-adfree .entry-ad-slot,
      body.pixieed-adfree .entry-ad-note,
      body.pixieed-adfree .project-ad,
      body.pixieed-adfree .ad-block,
      body.pixieed-adfree .panel-ad,
      body.pixieed-adfree .panel-ad-mount,
      body.pixieed-adfree .lens-ad-banner,
      body.pixieed-adfree .capture-preview__ad,
      body.pixieed-adfree .game-ad,
      body.pixieed-adfree .puzzle-ad-slot,
      body.pixieed-adfree .puzzle-ad-note,
      body.pixieed-adfree .export-ad,
      body.pixieed-adfree .export-ad__label,
      body.pixieed-adfree .export-interstitial__slot-wrap,
      body.pixieed-adfree #leftPanelAd,
      body.pixieed-adfree #rightPanelAd,
      body.pixieed-adfree #mobileBottomAd,
      body.pixieed-adfree [aria-label="広告"],
      body.pixieed-adfree [aria-label="広告バナー"],
      body.pixieed-adfree ins.adsbygoogle {
        display: none !important;
      }

      /* Keep PiXiEEDraw control positions stable by preserving known ad slots as invisible placeholders. */
      body.pixieed-adfree .panel-ad-mount {
        display: block !important;
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
      }

      body.pixieed-adfree #leftPanelAd,
      body.pixieed-adfree #rightPanelAd {
        display: flex !important;
        visibility: hidden !important;
        pointer-events: none !important;
        min-height: var(--panel-ad-height, 110px) !important;
        height: auto !important;
        max-height: none !important;
      }

      body.pixieed-adfree #leftPanelAdSlot,
      body.pixieed-adfree #rightPanelAdSlot {
        display: flex !important;
        visibility: hidden !important;
        pointer-events: none !important;
        min-height: var(--panel-ad-height, 112px) !important;
        height: auto !important;
        max-height: none !important;
      }

      body.pixieed-adfree #exportAdContainer {
        display: block !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      body.pixieed-adfree .export-interstitial__slot-wrap {
        display: flex !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      body.pixieed-adfree #mobileBottomAd {
        display: flex !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function applyDomState() {
    window.__PIXIEED_ADS_DISABLED__ = Boolean(state.isActive);
    if (document.body) {
      document.body.classList.toggle('pixieed-adfree', Boolean(state.isActive));
    }
    if (document.documentElement) {
      document.documentElement.classList.toggle('pixieed-adfree', Boolean(state.isActive));
      if (state.isActive) {
        document.documentElement.style.setProperty('--mobile-bottom-ad-height', '0px');
      } else {
        document.documentElement.style.removeProperty('--mobile-bottom-ad-height');
      }
    }
    if (state.isActive && document.body) {
      document.body.classList.remove('bottom-ad-active');
    }
  }

  function updateStatusElement(message, isError = false) {
    const status = document.getElementById('pixieedAdFreeStatus');
    if (!(status instanceof HTMLElement)) {
      return;
    }
    status.textContent = message;
    status.style.color = isError ? '#fca5a5' : '';
  }

  function syncUi() {
    const purchaseLink = document.getElementById('pixieedAdFreePurchase');
    const supportTipLinks = Array.from(document.querySelectorAll('a#supportTipLink'));
    const spotlightTipLinks = Array.from(document.querySelectorAll('a#toolSpotlightSupportTip'));
    const claimInput = document.getElementById('pixieedAdFreeOrderId');
    const claimButton = document.getElementById('pixieedAdFreeClaim');

    if (purchaseLink instanceof HTMLAnchorElement) {
      purchaseLink.href = PIXIEDRAW_SUPPORT_URL;
      purchaseLink.target = '_self';
      purchaseLink.rel = 'noopener';
      purchaseLink.dataset.supportPanelTrigger = 'true';
      purchaseLink.dataset.supportPreferredProduct = 'pixiedraw_ad_free';
    }
    supportTipLinks.forEach((link) => {
      link.href = PIXIEDRAW_SUPPORT_URL;
      link.target = '_self';
      link.rel = 'noopener';
      link.dataset.supportPanelTrigger = 'true';
      link.dataset.supportPreferredProduct = 'pixiedraw_ad_free';
    });
    spotlightTipLinks.forEach((link) => {
      link.href = PIXIEDRAW_SUPPORT_URL;
      link.target = '_self';
      link.rel = 'noopener';
      link.dataset.supportPanelTrigger = 'true';
      link.dataset.supportPreferredProduct = 'pixiedraw_ad_free';
    });

    if (claimInput instanceof HTMLInputElement) {
      claimInput.disabled = !state.isLoggedIn || state.isLoading;
    }
    if (claimButton instanceof HTMLButtonElement) {
      claimButton.disabled = !state.isLoggedIn || state.isLoading;
    }

    if (uiMessage) {
      updateStatusElement(uiMessage, Boolean(state.lastError));
      return;
    }
    if (readQueryParam(AUTO_APPLY_STATUS_KEY) === 'cancelled' && !state.isActive) {
      updateStatusElement('購入はキャンセルされました。再度購入する場合は「広告非表示を購入」を押してください。');
      return;
    }
    if (!state.isLoggedIn && readQueryParam(AUTO_APPLY_QUERY_KEY)) {
      updateStatusElement('購入は完了しています。購入時と同じメールアドレスでログインすると自動で反映します。');
      return;
    }
    if (!state.isLoggedIn) {
      updateStatusElement('ログイン後に購入番号または購入コードを適用できます。');
      return;
    }
    if (state.isActive) {
      const expiry = formatExpiryLabel(state.expiresAt);
      updateStatusElement(expiry ? `広告非表示が有効です (${expiry} まで)` : '広告非表示が有効です。');
      return;
    }
    updateStatusElement('未購入です。購入後は自動反映されます。うまくいかない場合は購入番号または購入コードを入力してください。');
  }

  function notify() {
    writeCachedState();
    applyDomState();
    syncUi();
    const detail = {
      isReady: state.isReady,
      isLoggedIn: state.isLoggedIn,
      isActive: state.isActive,
      activeEntitlements: state.activeEntitlements,
      userId: state.userId,
      userEmail: state.userEmail,
      expiresAt: state.expiresAt,
      lastError: state.lastError,
    };
    listeners.forEach(listener => {
      try {
        listener(detail);
      } catch (_error) {
        // ignore listener errors
      }
    });
    window.dispatchEvent(new CustomEvent('pixieed:adfreechange', { detail }));
  }

  function promptReloadAfterApply() {
    if (reloadPromptOpen) {
      return;
    }
    reloadPromptOpen = true;
    const accepted = window.confirm(
      '広告非表示を適用しました。今すぐ更新して広告を非表示にしますか？'
    );
    reloadPromptOpen = false;
    if (!accepted) {
      uiMessage = '広告非表示を適用しました。反映するにはページを更新してください。';
      syncUi();
      return;
    }
    try {
      window.location.reload();
    } catch (_error) {
      uiMessage = '広告非表示を適用しました。反映するにはページを更新してください。';
      syncUi();
    }
  }

  async function ensureSupabase() {
    if (supabasePromise) {
      return supabasePromise;
    }
    supabasePromise = (async () => {
      if (window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__) {
        return window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__;
      }
      if (window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__) {
        return await window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__;
      }
      const module = await import(SUPABASE_MODULE_URL);
      const client = module.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: AUTH_STORAGE_KEY,
        },
      });
      window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT__ = client;
      window.__PIXIEED_ACCOUNT_SUPABASE_CLIENT_PROMISE__ = Promise.resolve(client);
      if (!authListenerBound) {
        authListenerBound = true;
        client.auth.onAuthStateChange(() => {
          uiMessage = '';
          refresh();
        });
      }
      return client;
    })();
    return supabasePromise;
  }

  async function fetchEntitlement() {
    const supabase = await ensureSupabase();
    const { data } = await supabase.auth.getSession();
    const session = data?.session || null;
    state.userId = session?.user?.id || '';
    state.userEmail = typeof session?.user?.email === 'string' ? session.user.email.trim().toLowerCase() : '';
    state.isLoggedIn = Boolean(state.userId);
    if (!state.userId) {
      state.isActive = false;
      state.activeEntitlements = {};
      state.userEmail = '';
      state.expiresAt = '';
      return;
    }
    const { data: rows, error } = await supabase
      .from('user_entitlements')
      .select('user_id, entitlement_key, status, expires_at, revoked_at')
      .eq('user_id', state.userId)
      .in('entitlement_key', [GLOBAL_ENTITLEMENT_KEY, PIXIEDRAW_ENTITLEMENT_KEY]);
    if (error) {
      throw error;
    }
    const activeEntitlements = {};
    (Array.isArray(rows) ? rows : []).forEach(row => {
      if (isEntitlementActive(row || null)) {
        activeEntitlements[row.entitlement_key] = {
          expiresAt: typeof row?.expires_at === 'string' ? row.expires_at : '',
        };
      }
    });
    state.activeEntitlements = activeEntitlements;
    state.isActive = isAnyEntitlementActive(activeEntitlements);
    const activeKeys = getPageEntitlementKeys();
    const activeRow = activeKeys.map(key => activeEntitlements[key]).find(Boolean) || null;
    state.expiresAt = typeof activeRow?.expiresAt === 'string' ? activeRow.expiresAt : '';
  }

  async function refresh() {
    if (refreshPromise) {
      return refreshPromise;
    }
    refreshPromise = (async () => {
      state.isLoading = true;
      state.lastError = '';
      notify();
      try {
        await fetchEntitlement();
      } catch (error) {
        state.isActive = false;
        state.activeEntitlements = {};
        state.expiresAt = '';
        state.lastError = String(error?.message || error || 'adfree fetch failed');
      } finally {
        state.isLoading = false;
        state.isReady = true;
        notify();
        maybeAutoApplyFromUrl();
        resolveReady();
        refreshPromise = null;
      }
      return state;
    })();
    return refreshPromise;
  }

  async function redeemCode(rawCode) {
    const code = String(rawCode || '').trim();
    if (!code) {
      state.lastError = 'コードを入力してください。';
      uiMessage = state.lastError;
      syncUi();
      return { ok: false, error: state.lastError };
    }
    if (!state.isLoggedIn) {
      state.lastError = 'ログイン後にコードを適用してください。';
      uiMessage = state.lastError;
      syncUi();
      return { ok: false, error: state.lastError };
    }
    uiMessage = 'コードを適用しています...';
    syncUi();
    try {
      const supabase = await ensureSupabase();
      const { error } = await supabase.rpc('redeem_browser_adfree_code', { input_code: code });
      if (error) {
        throw error;
      }
      uiMessage = 'コードを適用しました。';
      state.lastError = '';
      setAccessInputValue('');
      clearCheckoutParams();
      await refresh();
      if (state.isActive) {
        promptReloadAfterApply();
      }
      return { ok: true };
    } catch (error) {
      const message = String(error?.message || error || 'コードの適用に失敗しました。');
      state.lastError = message;
      uiMessage = message;
      syncUi();
      return { ok: false, error: message };
    }
  }

  async function claimPurchaseCode(rawOrderId, options = {}) {
    const autoRedeem = Boolean(options && options.autoRedeem);
    const orderId = String(rawOrderId || '').trim();
    if (!orderId) {
      state.lastError = '購入番号または購入コードを入力してください。';
      uiMessage = state.lastError;
      syncUi();
      return { ok: false, error: state.lastError };
    }
    if (!state.isLoggedIn) {
      state.lastError = '購入時と同じメールアドレスでログインしてください。';
      uiMessage = state.lastError;
      syncUi();
      return { ok: false, error: state.lastError };
    }
    uiMessage = '購入番号を確認しています...';
    syncUi();
    try {
      const supabase = await ensureSupabase();
      const { data, error } = await supabase.rpc('claim_browser_adfree_purchase_code', { input_order_id: orderId });
      if (error) {
        throw error;
      }
      const code = typeof data?.code === 'string' ? data.code.trim() : '';
      if (!code) {
        throw new Error('購入コードを受け取れませんでした。');
      }
      if (autoRedeem) {
        return await redeemCode(code);
      }
      setAccessInputValue(code);
      uiMessage = '購入コードを受け取りました。続けて「適用」を押してください。';
      state.lastError = '';
      syncUi();
      return { ok: true, code };
    } catch (error) {
      const message = String(error?.message || error || '購入コードの取得に失敗しました。');
      state.lastError = message;
      uiMessage = message;
      syncUi();
      return { ok: false, error: message };
    }
  }

  async function applyAccessValue(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) {
      state.lastError = '購入番号または購入コードを入力してください。';
      uiMessage = state.lastError;
      syncUi();
      return { ok: false, error: state.lastError };
    }
    if (ACCESS_CODE_PATTERN.test(value)) {
      return redeemCode(value);
    }
    return claimPurchaseCode(value, { autoRedeem: true });
  }

  async function maybeAutoApplyFromUrl() {
    const sessionId = readQueryParam(AUTO_APPLY_QUERY_KEY);
    if (!sessionId) {
      return;
    }
    if (state.isActive) {
      clearCheckoutParams();
      return;
    }
    if (!state.isLoggedIn || state.isLoading || autoApplyStarted) {
      return;
    }
    autoApplyStarted = true;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await claimPurchaseCode(sessionId, { autoRedeem: true });
      if (result?.ok) {
        clearCheckoutParams();
        return;
      }
      if (!shouldRetryPurchaseClaim(result?.error)) {
        return;
      }
      await new Promise(resolve => {
        window.setTimeout(resolve, 1200 * (attempt + 1));
      });
    }
    uiMessage = '購入は完了しています。少し待ってから、同じ入力欄に購入番号を入れて「適用」を押してください。';
    state.lastError = '';
    syncUi();
  }

  function bindUi() {
    if (uiBound) {
      return;
    }
    uiBound = true;
    injectStyle();
    applyDomState();
    syncUi();
    const claimButton = document.getElementById('pixieedAdFreeClaim');
    if (claimButton instanceof HTMLButtonElement) {
      claimButton.addEventListener('click', async () => {
        const input = document.getElementById('pixieedAdFreeOrderId');
        const orderId = input instanceof HTMLInputElement ? input.value : '';
        await applyAccessValue(orderId);
      });
    }
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    listeners.add(listener);
    listener({
      isReady: state.isReady,
      isLoggedIn: state.isLoggedIn,
      isActive: state.isActive,
      activeEntitlements: state.activeEntitlements,
      userId: state.userId,
      userEmail: state.userEmail,
      expiresAt: state.expiresAt,
      lastError: state.lastError,
    });
    return () => {
      listeners.delete(listener);
    };
  }

  window.pixieedAdFree = {
    state,
    ready,
    refresh,
    claimPurchaseCode,
    applyAccessValue,
    redeemCode,
    subscribe,
    get purchaseUrl() {
      return buildPurchaseUrl();
    },
  };

  const cached = readCachedState();
  if (cached) {
    state.activeEntitlements = cached.entitlements || {};
    state.isActive = isAnyEntitlementActive(state.activeEntitlements);
    const activeKeys = getPageEntitlementKeys();
    const activeRow = activeKeys.map(key => state.activeEntitlements[key]).find(Boolean) || null;
    state.expiresAt = typeof activeRow?.expiresAt === 'string' ? activeRow.expiresAt : '';
    applyDomState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUi, { once: true });
  } else {
    bindUi();
  }

  refresh();
})();
