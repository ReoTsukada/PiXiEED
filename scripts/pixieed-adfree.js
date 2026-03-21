(function () {
  if (window.pixieedAdFree) {
    return;
  }

  const SUPABASE_URL = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4';
  const SUPABASE_MODULE_URL = 'https://esm.sh/@supabase/supabase-js@2.46.1?bundle';
  const CACHE_KEY = 'pixieed_browser_adfree_cache_v1';
  const ENTITLEMENT_KEY = 'browser_ad_free';
  const PURCHASE_URL = 'https://pixieed.stores.jp';
  const STYLE_ID = 'pixieed-adfree-style';
  const listeners = new Set();

  let supabasePromise = null;
  let refreshPromise = null;
  let authListenerBound = false;
  let uiBound = false;
  let readyResolved = false;
  let readyResolver = null;
  let uiMessage = '';

  const state = {
    isReady: false,
    isLoading: false,
    isLoggedIn: false,
    isActive: false,
    userId: '',
    expiresAt: '',
    lastError: '',
  };

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
      if (!parsed || parsed.active !== true) {
        return null;
      }
      const expiresAt = typeof parsed.expiresAt === 'string' ? parsed.expiresAt : '';
      if (expiresAt) {
        const timestamp = Date.parse(expiresAt);
        if (Number.isFinite(timestamp) && timestamp <= Date.now()) {
          return null;
        }
      }
      return {
        active: true,
        expiresAt,
      };
    } catch (_error) {
      return null;
    }
  }

  function writeCachedState() {
    try {
      if (state.isActive) {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify({
          active: true,
          expiresAt: state.expiresAt || '',
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
    if (!row || row.entitlement_key !== ENTITLEMENT_KEY) {
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
    const claimInput = document.getElementById('pixieedAdFreeOrderId');
    const claimButton = document.getElementById('pixieedAdFreeClaim');
    const redeemInput = document.getElementById('pixieedAdFreeRedeemCode');
    const redeemButton = document.getElementById('pixieedAdFreeRedeem');

    if (purchaseLink instanceof HTMLAnchorElement) {
      purchaseLink.href = PURCHASE_URL;
      purchaseLink.target = '_blank';
      purchaseLink.rel = 'noopener noreferrer';
    }

    if (claimInput instanceof HTMLInputElement) {
      claimInput.disabled = !state.isLoggedIn || state.isLoading;
    }
    if (claimButton instanceof HTMLButtonElement) {
      claimButton.disabled = !state.isLoggedIn || state.isLoading;
    }
    if (redeemInput instanceof HTMLInputElement) {
      redeemInput.disabled = !state.isLoggedIn || state.isLoading;
    }
    if (redeemButton instanceof HTMLButtonElement) {
      redeemButton.disabled = !state.isLoggedIn || state.isLoading;
    }

    if (uiMessage) {
      updateStatusElement(uiMessage, Boolean(state.lastError));
      return;
    }
    if (!state.isLoggedIn) {
      updateStatusElement('ログイン後に購入コードを適用できます。');
      return;
    }
    if (state.isActive) {
      const expiry = formatExpiryLabel(state.expiresAt);
      updateStatusElement(expiry ? `広告非表示が有効です (${expiry} まで)` : '広告非表示が有効です。');
      return;
    }
    updateStatusElement('未購入です。購入後にコードを適用してください。');
  }

  function notify() {
    writeCachedState();
    applyDomState();
    syncUi();
    const detail = {
      isReady: state.isReady,
      isLoggedIn: state.isLoggedIn,
      isActive: state.isActive,
      userId: state.userId,
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

  async function ensureSupabase() {
    if (supabasePromise) {
      return supabasePromise;
    }
    supabasePromise = (async () => {
      const module = await import(SUPABASE_MODULE_URL);
      const client = module.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
    state.isLoggedIn = Boolean(state.userId);
    if (!state.userId) {
      state.isActive = false;
      state.expiresAt = '';
      return;
    }
    const { data: row, error } = await supabase
      .from('user_entitlements')
      .select('user_id, entitlement_key, status, expires_at, revoked_at')
      .eq('user_id', state.userId)
      .eq('entitlement_key', ENTITLEMENT_KEY)
      .maybeSingle();
    if (error) {
      throw error;
    }
    state.isActive = isEntitlementActive(row || null);
    state.expiresAt = typeof row?.expires_at === 'string' ? row.expires_at : '';
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
        state.expiresAt = '';
        state.lastError = String(error?.message || error || 'adfree fetch failed');
      } finally {
        state.isLoading = false;
        state.isReady = true;
        notify();
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
      const input = document.getElementById('pixieedAdFreeRedeemCode');
      if (input instanceof HTMLInputElement) {
        input.value = '';
      }
      await refresh();
      return { ok: true };
    } catch (error) {
      const message = String(error?.message || error || 'コードの適用に失敗しました。');
      state.lastError = message;
      uiMessage = message;
      syncUi();
      return { ok: false, error: message };
    }
  }

  async function claimPurchaseCode(rawOrderId) {
    const orderId = String(rawOrderId || '').trim();
    if (!orderId) {
      state.lastError = '注文番号を入力してください。';
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
    uiMessage = '注文番号を確認しています...';
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
      const redeemInput = document.getElementById('pixieedAdFreeRedeemCode');
      if (redeemInput instanceof HTMLInputElement) {
        redeemInput.value = code;
      }
      uiMessage = '購入コードを受け取りました。続けて「コードを適用」を押してください。';
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

  function bindUi() {
    if (uiBound) {
      return;
    }
    uiBound = true;
    injectStyle();
    applyDomState();
    syncUi();
    const redeemButton = document.getElementById('pixieedAdFreeRedeem');
    const claimButton = document.getElementById('pixieedAdFreeClaim');
    if (claimButton instanceof HTMLButtonElement) {
      claimButton.addEventListener('click', async () => {
        const input = document.getElementById('pixieedAdFreeOrderId');
        const orderId = input instanceof HTMLInputElement ? input.value : '';
        await claimPurchaseCode(orderId);
      });
    }
    if (redeemButton instanceof HTMLButtonElement) {
      redeemButton.addEventListener('click', async () => {
        const input = document.getElementById('pixieedAdFreeRedeemCode');
        const code = input instanceof HTMLInputElement ? input.value : '';
        await redeemCode(code);
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
      userId: state.userId,
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
    redeemCode,
    subscribe,
    get purchaseUrl() {
      return PURCHASE_URL;
    },
  };

  const cached = readCachedState();
  if (cached) {
    state.isActive = true;
    state.expiresAt = cached.expiresAt || '';
    applyDomState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUi, { once: true });
  } else {
    bindUi();
  }

  refresh();
})();
