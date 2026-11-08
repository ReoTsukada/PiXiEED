/** One labelled, in-flow ordinary Display placement on the public PiXiEED shop. */
import { getAdsenseLoader } from '../display-ads.mjs?rev=20261030-event-inline-ads-1';
import { SHOP_AD_MARKER, shopAdConfig } from '../../data/shop-ad-config.mjs?rev=20261108-shop-display-ad-1';

export const SHOP_AD_MIN_PRODUCTS = 9;
export const SHOP_AD_MIN_SAFE_WIDTH = 280;
export const SHOP_AD_REQUEST_MARGIN = 240;

const VALID_CLIENT = /^ca-pub-\d{16}$/;
const VALID_SLOT = /^\d{6,20}$/;
const PRODUCTION_ORIGINS = new Set(['https://pixieed.jp', 'https://www.pixieed.jp']);
const instances = new WeakMap();

export function resolveShopAdUnit(config) {
  const unit = config?.unit;
  if (config?.enabled !== true || config?.marker !== SHOP_AD_MARKER
      || unit?.verifiedActive !== true || unit?.format !== 'display'
      || unit?.placement !== 'inline' || unit?.size !== 'responsive'
      || typeof unit?.client !== 'string' || typeof unit?.slot !== 'string'
      || !VALID_CLIENT.test(unit.client) || !VALID_SLOT.test(unit.slot)) return null;
  return { client: unit.client, slot: unit.slot, format: 'display', placement: 'inline', size: 'responsive' };
}

function historyHasPrivateContext(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  return ['__booksCatalogDetail', 'socialDetail', 'detailId', 'composerType', 'postId',
    'projectWorkspaceSelection', 'pixieedWorkspace', 'toolStartActive', 'privateView']
    .some(key => Boolean(state[key]));
}

function containsPrivateOrInteractiveContext(doc, win) {
  const classes = doc.body?.classList;
  const html = doc.documentElement;
  return Boolean(doc.fullscreenElement
    || classes?.contains?.('creation-editor')
    || classes?.contains?.('tool-shell--workspace-open')
    || html?.dataset?.toolDirect === 'work'
    || html?.hasAttribute?.('data-direct-loading')
    || historyHasPrivateContext(win.history?.state)
    || doc.querySelector?.('#product-detail[open], #composerDialog[open], [data-auth-dialog][open], .account-dialog[open], [data-private-view], [data-private], [data-workspace], [data-tool-embed], .tool-embed--expanded'));
}

/** The route, marker and every public-context gate are checked again at request time. */
export function isShopAdEligible({ config = shopAdConfig, origin, protocol = 'https:', pathname,
  search = '', hash = '', topLevel = false, marker, fullscreen = false, editor = false,
  privateContext = false, detailOpen = false, visibleProductCount = 0, publicContentLength = 0 } = {}) {
  if (!resolveShopAdUnit(config)) return false;
  if (protocol !== 'https:' || !PRODUCTION_ORIGINS.has(origin)
      || !['/books/', '/books/index.html'].includes(pathname)
      || search !== '' || hash !== '' || topLevel !== true
      || marker !== SHOP_AD_MARKER || fullscreen || editor || privateContext || detailOpen) return false;
  return Number.isInteger(visibleProductCount) && visibleProductCount >= SHOP_AD_MIN_PRODUCTS
    && Number.isFinite(publicContentLength) && publicContentLength >= 200;
}

function isTopLevel(win) {
  try { return win?.top === win?.self; } catch { return false; }
}

function visibleCards(grid) {
  return [...(grid?.querySelectorAll?.('[data-product-id]') || [])].filter(card => !card.hidden);
}

function routeAndMarkerAreShop(doc, win) {
  return Boolean(doc?.body?.dataset?.shopAd === SHOP_AD_MARKER && win?.location
    && PRODUCTION_ORIGINS.has(win.location.origin)
    && win.location.protocol === 'https:'
    && ['/books/', '/books/index.html'].includes(win.location.pathname)
    && isTopLevel(win));
}

function readEligibility(doc, win, config, grid) {
  const cards = visibleCards(grid);
  const main = doc.querySelector?.('main#catalog, main') || doc.body;
  const detailOpen = Boolean(doc.querySelector?.('#product-detail[open]')
    || String(win.location?.hash || '').startsWith('#product=')
    || historyHasPrivateContext(win.history?.state));
  return isShopAdEligible({
    config,
    origin: win.location?.origin,
    protocol: win.location?.protocol,
    pathname: win.location?.pathname,
    search: win.location?.search || '',
    hash: win.location?.hash || '',
    topLevel: isTopLevel(win),
    marker: doc.body?.dataset?.shopAd,
    fullscreen: Boolean(doc.fullscreenElement),
    editor: Boolean(doc.body?.classList?.contains?.('creation-editor')
      || doc.body?.classList?.contains?.('tool-shell--workspace-open')
      || doc.documentElement?.dataset?.toolDirect === 'work'
      || doc.documentElement?.hasAttribute?.('data-direct-loading')),
    privateContext: containsPrivateOrInteractiveContext(doc, win),
    detailOpen,
    visibleProductCount: cards.length,
    publicContentLength: String(main?.textContent || '').trim().length,
  });
}

function rect(element) {
  try { return element?.getBoundingClientRect?.() || null; } catch { return null; }
}

function safeVisibleGeometry(host, slot, doc, win) {
  if (!host?.isConnected || host.hidden || doc.visibilityState === 'hidden'
      || host.getClientRects?.().length === 0
      || ['hidden', 'collapse'].includes(win.getComputedStyle?.(host)?.visibility)) return false;
  const box = rect(host), slotBox = rect(slot);
  const viewportWidth = Number(win.innerWidth || 0), viewportHeight = Number(win.innerHeight || 0);
  if (!box || !slotBox || viewportWidth < 320 || viewportHeight <= 0
      || !Number.isFinite(slotBox.width) || slotBox.width < SHOP_AD_MIN_SAFE_WIDTH
      || box.left < 0 || box.right > viewportWidth || box.width > viewportWidth
      || slotBox.left < 0 || slotBox.right > viewportWidth || slotBox.width > viewportWidth) return false;
  return box.top < viewportHeight + SHOP_AD_REQUEST_MARGIN && box.bottom > -SHOP_AD_REQUEST_MARGIN
    && box.left < viewportWidth && box.right > 0;
}

function hasSafeWidth(host, slot, win) {
  const box = rect(host), slotBox = rect(slot);
  const viewportWidth = Number(win.innerWidth || 0);
  return Boolean(box && slotBox && viewportWidth >= 320
    && Number.isFinite(slotBox.width) && slotBox.width >= SHOP_AD_MIN_SAFE_WIDTH
    && box.left >= 0 && box.right <= viewportWidth && slotBox.left >= 0
    && slotBox.right <= viewportWidth);
}

function isOnscreen(host, win) {
  const box = rect(host);
  return Boolean(box && box.bottom > 0 && box.top < Number(win.innerHeight || 0));
}

/**
 * Mounts no provider until the unique shop marker, route, content, viewport and
 * ordinary unit are all eligible. This module never adds targeting data.
 */
export function mountShopAd({ doc = globalThis.document, win = globalThis.window,
  config = shopAdConfig, loadAdsense = getAdsenseLoader, timeoutMs = 15000 } = {}) {
  if (!doc || !win || !routeAndMarkerAreShop(doc, win) || !resolveShopAdUnit(config)) {
    return { mounted: false, reason: 'ineligible' };
  }
  if (instances.has(doc)) return instances.get(doc);

  const grid = doc.querySelector?.('[data-product-grid]');
  const hosts = [...(doc.querySelectorAll?.('[data-shop-display-ad]') || [])];
  const host = hosts[0];
  const slot = host?.querySelector?.('[data-shop-ad-slot]');
  if (!grid || hosts.length !== 1 || !host || !slot || !grid.contains?.(host)
      || !readEligibility(doc, win, config, grid)) {
    if (host) host.hidden = true;
    return { mounted: false, reason: 'missing-or-ineligible-content' };
  }

  const unit = resolveShopAdUnit(config);
  const state = {
    mounted: true, requested: false, retired: false,
    host, slot,
    requestObserver: null, statusObserver: null, loader: null, ins: null,
    timeout: null, cleaned: false,
  };
  const clearRequestObserver = () => { state.requestObserver?.disconnect(); state.requestObserver = null; };
  const onLoadError = () => markUnfilled('error');
  const clearFailureWatchers = () => {
    clearTimeout(state.timeout); state.timeout = null;
    state.loader?.errors?.delete?.(onLoadError);
  };
  const removeCreative = () => {
    state.statusObserver?.disconnect(); state.statusObserver = null;
    if (state.ins?.remove) state.ins.remove();
    else if (state.ins?.parentElement?.removeChild) state.ins.parentElement.removeChild(state.ins);
    state.ins = null;
    slot.replaceChildren?.();
  };
  const collapseIfOffscreen = () => {
    if (!state.host.isConnected || !['unfilled', 'error', 'retired'].includes(state.host.dataset.adState)) return;
    if (!isOnscreen(host, win)) {
      host.hidden = true;
      if (state.host.dataset.adState !== 'retired') state.host.dataset.adState = 'empty';
    }
  };
  function markUnfilled(outcome = 'unfilled') {
    if (state.cleaned || state.retired || !state.requested) return;
    if (['filled', 'unfill-optimized'].includes(state.ins?.dataset?.adStatus)) return;
    state.host.dataset.adState = outcome;
    clearFailureWatchers();
    collapseIfOffscreen();
  }
  const markFilled = () => {
    if (state.cleaned || state.retired) return;
    clearFailureWatchers();
    state.host.hidden = false;
    state.host.dataset.adState = 'filled';
    state.statusObserver?.disconnect(); state.statusObserver = null;
  };
  const positionBeforeRequest = () => {
    const cards = visibleCards(grid);
    if (cards.length < SHOP_AD_MIN_PRODUCTS) { host.hidden = true; return; }
    const ninth = cards[SHOP_AD_MIN_PRODUCTS - 1];
    if (ninth && ninth !== host) grid.insertBefore(host, ninth);
  };
  const eligible = () => readEligibility(doc, win, config, grid);
  const retireAfterRequest = () => {
    if (!state.requested || state.retired) return;
    state.retired = true;
    clearRequestObserver();
    clearFailureWatchers();
    removeCreative();
    host.dataset.adState = 'retired';
    // Keep a modest in-flow reservation if it is currently in view; removing
    // it under a finger could move a neighboring product/detail control.
    host.hidden = !isOnscreen(host, win);
  };
  const refreshBeforeRequest = () => {
    if (state.cleaned || state.retired || state.requested) return;
    if (!eligible()) { host.hidden = true; return; }
    positionBeforeRequest();
    host.hidden = false;
    if (!hasSafeWidth(host, slot, win)) { host.hidden = true; return; }
    host.dataset.adState = 'ready';
    tryRequest();
  };
  function tryRequest() {
    if (state.cleaned || state.retired || state.requested || !eligible()) return;
    if (!safeVisibleGeometry(host, slot, doc, win)) return;
    state.requested = true; // One attempt per document; never refresh or retry.
    host.dataset.adState = 'requested';
    clearRequestObserver();
    const ins = doc.createElement('ins');
    ins.className = 'adsbygoogle shop-ad__unit';
    ins.style.display = 'block';
    ins.style.width = '100%';
    ins.dataset.adClient = unit.client;
    ins.dataset.adSlot = unit.slot;
    ins.dataset.adFormat = 'auto';
    ins.dataset.fullWidthResponsive = 'false';
    state.ins = ins;
    slot.replaceChildren(ins);
    if (typeof win.MutationObserver === 'function') {
      state.statusObserver = new win.MutationObserver(() => {
        if (!state.ins || state.retired || state.cleaned) return;
        const status = state.ins.dataset.adStatus || state.ins.dataset.adsbygoogleStatus;
        if (['filled', 'unfill-optimized'].includes(status)) markFilled();
        else if (status === 'unfilled') markUnfilled('unfilled');
      });
      state.statusObserver.observe(ins, { attributes: true, attributeFilter: ['data-ad-status', 'data-adsbygoogle-status'] });
    }
    try {
      state.loader = loadAdsense(doc, win, unit.client);
      if (!state.loader || state.loader.failed) { markUnfilled('error'); return; }
      state.loader.errors?.add?.(onLoadError);
      state.timeout = setTimeout(() => markUnfilled('error'), Math.max(1, Number(timeoutMs) || 15000));
      (win.adsbygoogle = win.adsbygoogle || []).push({});
    } catch { markUnfilled('error'); }
  }
  const onCatalogWillChange = () => {
    if (state.requested) retireAfterRequest();
  };
  const onCatalogChanged = () => {
    if (state.requested) {
      if (!state.retired) retireAfterRequest();
      // The creative is gone before the product list is changed. The remaining
      // shell is only a temporary safe-space reservation, never re-requested.
      if (!isOnscreen(host, win)) positionBeforeRequest();
      collapseIfOffscreen();
      return;
    }
    refreshBeforeRequest();
  };
  const onCatalogDetailOpen = () => {
    if (state.requested) retireAfterRequest();
    else host.hidden = true;
  };
  const onCatalogDetailClosed = () => {
    if (!state.requested && !state.retired) refreshBeforeRequest();
  };
  const onContextOrGeometryChange = () => {
    if (state.requested) {
      if (state.retired) collapseIfOffscreen();
      else if (!eligible()) retireAfterRequest();
      else if (['unfilled', 'error'].includes(host.dataset.adState)) collapseIfOffscreen();
      return;
    }
    refreshBeforeRequest();
  };
  const cleanup = () => {
    if (state.cleaned) return;
    state.cleaned = true;
    clearRequestObserver();
    clearFailureWatchers();
    state.statusObserver?.disconnect();
    state.statusObserver = null;
    removeCreative();
    doc.removeEventListener?.('visibilitychange', onContextOrGeometryChange);
    doc.removeEventListener?.('fullscreenchange', onContextOrGeometryChange);
    win.removeEventListener?.('scroll', onContextOrGeometryChange);
    win.removeEventListener?.('resize', onContextOrGeometryChange);
    win.removeEventListener?.('hashchange', onContextOrGeometryChange);
    win.removeEventListener?.('popstate', onContextOrGeometryChange);
    win.removeEventListener?.('books:catalog-will-change', onCatalogWillChange);
    win.removeEventListener?.('books:catalog-updated', onCatalogChanged);
    win.removeEventListener?.('books:catalog-detail-open', onCatalogDetailOpen);
    win.removeEventListener?.('books:catalog-detail-closed', onCatalogDetailClosed);
    win.removeEventListener?.('pagehide', cleanup);
    host.remove?.();
  };

  host.hidden = true;
  doc.addEventListener?.('visibilitychange', onContextOrGeometryChange);
  doc.addEventListener?.('fullscreenchange', onContextOrGeometryChange);
  win.addEventListener?.('scroll', onContextOrGeometryChange, { passive: true });
  win.addEventListener?.('resize', onContextOrGeometryChange);
  win.addEventListener?.('hashchange', onContextOrGeometryChange);
  win.addEventListener?.('popstate', onContextOrGeometryChange);
  win.addEventListener?.('books:catalog-will-change', onCatalogWillChange);
  win.addEventListener?.('books:catalog-updated', onCatalogChanged);
  win.addEventListener?.('books:catalog-detail-open', onCatalogDetailOpen);
  win.addEventListener?.('books:catalog-detail-closed', onCatalogDetailClosed);
  win.addEventListener?.('pagehide', cleanup, { once: true });
  if (typeof win.IntersectionObserver === 'function') {
    state.requestObserver = new win.IntersectionObserver(entries => {
      if (entries.some(entry => entry.target === host && entry.isIntersecting)) tryRequest();
    }, { rootMargin: `${SHOP_AD_REQUEST_MARGIN}px 0px` });
    state.requestObserver.observe(host);
  }
  const result = {
    mounted: true, host, cleanup,
    get requested() { return state.requested; },
    get retired() { return state.retired; },
  };
  instances.set(doc, result);
  refreshBeforeRequest();
  return result;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined'
    && document.body?.dataset?.shopAd === SHOP_AD_MARKER) {
  mountShopAd({ doc: document, win: window });
}
