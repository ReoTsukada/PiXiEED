/** One isolated, fixed-size Display unit for the settled initial project chooser. */
import { getAdsenseLoader } from '../display-ads.mjs?rev=20261030-event-inline-ads-1';

export const PROJECT_GALLERY_AD_MIN_GAP = 48;
export const PROJECT_GALLERY_AD_PATHS = Object.freeze([
  '/draw/', '/camera/', '/audio/', '/jigsaw/', '/spot-difference/', '/hidden-object/',
  '/tools/start/draw/', '/tools/start/camera/', '/tools/start/audio/', '/tools/start/jigsaw/',
  '/tools/start/spot-difference/', '/tools/start/hidden-object/',
]);
const PRODUCTION_ORIGINS = new Set(['https://pixieed.jp', 'https://www.pixieed.jp']);
const VALID_CLIENT = /^ca-pub-\d{16}$/;
const VALID_SLOT = /^\d{6,20}$/;
const SAFE_QUERY_KEYS = new Set(['workspace', 'social']);
const documents = new WeakMap();

export function resolveProjectGalleryAdUnit(config) {
  const unit = config?.unit;
  if (config?.enabled !== true || unit?.verifiedActive !== true
      || unit.format !== 'display' || unit.placement !== 'inline' || unit.size !== 'fixed'
      || typeof unit.client !== 'string' || !VALID_CLIENT.test(unit.client)
      || typeof unit.slot !== 'string' || !VALID_SLOT.test(unit.slot)) return null;
  return { client: unit.client, slot: unit.slot };
}

/** Every application value entering this gate is a boolean; no work metadata is accepted. */
export function isProjectGalleryAdEligible({ config, origin, protocol = 'https:', pathname,
  search = '', hash = '', topLevel = false, chooserVisible = false, settled = false,
  hasVisibleItems = false, hasValidArtwork = false, searching = false, hasErrors = false, busy = false,
  editor = false, fullscreen = false, privateContext = false, pageVisible = false } = {}) {
  if (!resolveProjectGalleryAdUnit(config)) return false;
  return protocol === 'https:' && PRODUCTION_ORIGINS.has(origin)
    && PROJECT_GALLERY_AD_PATHS.includes(pathname) && hasSafeQuery(search) && hash === ''
    && topLevel === true && chooserVisible === true && settled === true
    && hasVisibleItems === true && hasValidArtwork === true && searching === false && hasErrors === false
    && busy === false && editor === false && fullscreen === false
    && privateContext === false && pageVisible === true;
}

/** Select only ordinary fixed AdSense sizes that fit the actual chooser content box. */
export function getProjectGalleryAdLayout(availableWidth) {
  const width = Number(availableWidth);
  if (!Number.isFinite(width)) return null;
  if (width >= 728) return Object.freeze({ width: 728, height: 90 });
  if (width >= 468) return Object.freeze({ width: 468, height: 60 });
  if (width >= 320) return Object.freeze({ width: 320, height: 100 });
  if (width >= 300) return Object.freeze({ width: 300, height: 100 });
  return null;
}

function isTopLevel(win) {
  try { return win.top === win.self; } catch { return false; }
}
function hasSafeQuery(search = '') {
  if (search === '') return true;
  try {
    const params = new URLSearchParams(search);
    const keys = [...params.keys()];
    return keys.length > 0 && keys.every(key => SAFE_QUERY_KEYS.has(key)
      && params.getAll(key).length === 1 && params.get(key) === '1');
  } catch { return false; }
}
function privateHistoryState(state, search = '') {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (['projectWorkspaceSelection', 'toolStartActive', 'privateView', 'pxd', 'pxdRevision', 'pxdImage',
    'modePxd', 'modePxdRevision', 'modePxdImage', 'modeProjectTool'].some(key => Boolean(state[key]))) return true;
  // The direct chooser owns workspace=1; it is not a project pointer. Require the
  // matching known query so an unrelated or stale history flag still fails closed.
  if (state.pixieedWorkspace === true && !new URLSearchParams(search).getAll('workspace').includes('1')) return true;
  if (state.pixieedWorkspace === false && new URLSearchParams(search).has('workspace')) return true;
  return false;
}
function editorContext(doc, win) {
  return Boolean(doc.fullscreenElement || doc.body?.classList?.contains?.('creation-editor')
    || doc.body?.classList?.contains?.('tool-shell--workspace-open')
    || doc.documentElement?.dataset?.toolDirect !== 'chooser'
    || doc.documentElement?.hasAttribute?.('data-direct-loading')
    || doc.querySelector?.('.tool-embed--expanded, [data-private-view], [data-project-workspace], [data-project-editor]')
    || privateHistoryState(win.history?.state, win.location?.search || ''));
}
function contentBoxWidth(element, win) {
  const style = win.getComputedStyle?.(element);
  const padding = (parseFloat(style?.paddingLeft) || 0) + (parseFloat(style?.paddingRight) || 0);
  return Math.max(0, (Number(element.clientWidth) || 0) - padding);
}
function box(element) {
  try { return element?.getBoundingClientRect?.() || null; } catch { return null; }
}
function visible(element, win) {
  if (!element?.isConnected || element.hidden || element.getClientRects?.().length === 0) return false;
  const visibility = win.getComputedStyle?.(element)?.visibility;
  return !['hidden', 'collapse'].includes(visibility);
}
function fitsViewport(rect, win) {
  const width = Number(win.innerWidth || 0), height = Number(win.innerHeight || 0);
  return Boolean(rect && width > 0 && height > 0 && rect.left >= 0 && rect.right <= width
    && rect.top >= 0 && rect.bottom <= height && rect.width > 0 && rect.height > 0);
}

function visibleArtworkArea(list, scrollerRect, win) {
  if (!scrollerRect) return 0;
  const viewportRect = { left: 0, top: 0, right: Number(win.innerWidth || 0), bottom: Number(win.innerHeight || 0) };
  const canvases = list.querySelectorAll?.('.project-gallery__tile canvas') || [];
  let area = 0;
  for (const canvas of canvases) {
    if (!visible(canvas, win)) continue;
    const rect = box(canvas);
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    const left = Math.max(rect.left, scrollerRect.left, viewportRect.left);
    const right = Math.min(rect.right, scrollerRect.right, viewportRect.right);
    const top = Math.max(rect.top, scrollerRect.top, viewportRect.top);
    const bottom = Math.min(rect.bottom, scrollerRect.bottom, viewportRect.bottom);
    if (right > left && bottom > top) area += (right - left) * (bottom - top);
  }
  return area;
}
function gapFromControls(dialog, hostRect, scroller, scrollerRect) {
  const controls = dialog.querySelectorAll?.('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])') || [];
  for (const control of controls) {
    let rect = box(control);
    if (!rect || control.hidden || rect.width <= 0 || rect.height <= 0) continue;
    // Virtualized overscan buttons outside the scrollport are clipped and cannot
    // be tapped. Measure only their visible intersection with that scrollport.
    if (scroller.contains?.(control)) {
      const left = Math.max(rect.left, scrollerRect.left), right = Math.min(rect.right, scrollerRect.right);
      const top = Math.max(rect.top, scrollerRect.top), bottom = Math.min(rect.bottom, scrollerRect.bottom);
      if (right <= left || bottom <= top) continue;
      rect = { left, right, top, bottom, width: right - left, height: bottom - top };
    }
    const gap = rect.bottom <= hostRect.top ? hostRect.top - rect.bottom
      : rect.top >= hostRect.bottom ? rect.top - hostRect.bottom : -1;
    if (gap < PROJECT_GALLERY_AD_MIN_GAP) return false;
  }
  return true;
}

/**
 * Mounts only after the chooser's settled, nonempty view has been confirmed. The
 * publisher SDK is allowed to finish loading, but its queued unit is not pushed
 * until this same placement is still eligible. Retirement removes the unit and
 * its listeners; it cannot unload a vendor script that has already executed.
 */
export function mountProjectGalleryAd({ doc = globalThis.document, win = globalThis.window,
  dialog, scroller, list, primaryAction, host, slot, galleryState,
  config, loadAdsense = getAdsenseLoader } = {}) {
  if (!doc || !win || !dialog || !scroller || !list || !primaryAction || !host || !slot) {
    return { mounted: false, reason: 'missing-elements' };
  }
  const existing = documents.get(doc);
  if (existing) {
    if (existing.host !== host) host.hidden = true;
    return existing;
  }
  const resolved = resolveProjectGalleryAdUnit(config);
  const currentEligibility = () => {
    const location = win.location;
    return isProjectGalleryAdEligible({ config, origin: location?.origin, protocol: location?.protocol,
      pathname: location?.pathname, search: location?.search || '', hash: location?.hash || '',
      topLevel: isTopLevel(win), chooserVisible: Boolean(dialog.open),
      settled: galleryState?.settled === true, hasVisibleItems: galleryState?.hasVisibleItems === true,
      hasValidArtwork: galleryState?.hasValidArtwork === true,
      searching: galleryState?.searching === true, hasErrors: galleryState?.hasErrors === true,
      busy: galleryState?.busy === true, editor: editorContext(doc, win),
      fullscreen: Boolean(doc.fullscreenElement),
      privateContext: privateHistoryState(win.history?.state, location?.search || ''),
      pageVisible: doc.visibilityState !== 'hidden' });
  };
  if (!resolved || !currentEligibility() || !host.isConnected || !slot.isConnected
      || !dialog.contains?.(host) || !host.contains?.(slot)) {
    host.hidden = true;
    const blocked = { mounted: false, retired: true, reason: 'ineligible', host };
    documents.set(doc, blocked);
    return blocked;
  }

  const state = { mounted: true, requested: false, attempted: false, retired: false,
    host, slot, ins: null, loader: null, statusObserver: null,
    scriptLoad: null, scriptError: null, contextObserver: null,
    originalScrollerMaxHeight: scroller.style.maxHeight || '', failed: false,
  };
  documents.set(doc, state);
  const cleanupListeners = () => {
    doc.removeEventListener?.('visibilitychange', onContextChange);
    doc.removeEventListener?.('fullscreenchange', onContextChange);
    dialog.removeEventListener?.('close', onDialogClose);
    dialog.removeEventListener?.('cancel', onDialogClose);
    dialog.removeEventListener?.('scroll', onScroll);
    scroller.removeEventListener?.('scroll', onScroll);
    win.removeEventListener?.('popstate', onContextChange);
    win.removeEventListener?.('hashchange', onContextChange);
    win.removeEventListener?.('pagehide', onPageHide);
    win.removeEventListener?.('resize', onResize);
    win.removeEventListener?.('scroll', onScroll);
    win.navigation?.removeEventListener?.('navigate', onContextChange);
    win.navigation?.removeEventListener?.('currententrychange', onContextChange);
    state.contextObserver?.disconnect(); state.contextObserver = null;
    if (state.loader?.errors && state.onSdkError) state.loader.errors.delete(state.onSdkError);
    if (state.loader?.script && state.scriptLoad) state.loader.script.removeEventListener?.('load', state.scriptLoad);
    if (state.loader?.script && state.scriptError) state.loader.script.removeEventListener?.('error', state.scriptError);
    state.scriptLoad = state.scriptError = null;
  };
  const removeCreative = () => {
    state.statusObserver?.disconnect(); state.statusObserver = null;
    state.ins?.remove?.(); state.ins = null;
    slot.replaceChildren?.();
  };
  const retire = (reason = 'context') => {
    if (state.retired) return;
    state.retired = true; state.host.dataset.adState = 'retired';
    cleanupListeners(); removeCreative();
    // Keep the measured reservation while the modal is open so its controls do not jump.
    // Restore the pre-ad geometry when an already-retired dialog eventually closes.
    const restoreAfterClose = () => {
      host.hidden = true;
      scroller.style.maxHeight = state.originalScrollerMaxHeight;
    };
    if (!dialog.open) restoreAfterClose();
    else dialog.addEventListener?.('close', restoreAfterClose, { once: true });
    host.dataset.retireReason = reason;
  };
  state.retire = retire; state.cleanup = () => retire('dispose');
  const markError = () => {
    if (state.retired || !state.attempted || state.failed) return;
    state.failed = true;
    const filled = ['filled', 'unfill-optimized'].includes(state.ins?.dataset?.adStatus);
    state.host.dataset.adState = filled ? 'filled' : 'error';
    state.loader?.errors?.delete?.(state.onSdkError);
    if (state.loader?.script && state.scriptLoad) state.loader.script.removeEventListener?.('load', state.scriptLoad);
    if (state.loader?.script && state.scriptError) state.loader.script.removeEventListener?.('error', state.scriptError);
    state.scriptLoad = state.scriptError = null;
    if (!state.requested && !filled) removeCreative();
  };
  const markStatus = () => {
    if (state.retired || !state.ins) return;
    const status = state.ins.dataset.adStatus || state.ins.dataset.adsbygoogleStatus;
    if (status === 'filled' || status === 'unfill-optimized') {
      host.dataset.adState = 'filled'; host.hidden = false;
      state.statusObserver?.disconnect(); state.statusObserver = null;
    } else if (status === 'unfilled') host.dataset.adState = 'unfilled';
  };
  state.onSdkError = markError;

  host.hidden = false;
  host.style.visibility = 'hidden';
  const layout = getProjectGalleryAdLayout(contentBoxWidth(dialog, win));
  if (!layout) {
    host.hidden = true; host.style.visibility = '';
    state.mounted = false; state.retired = true; host.dataset.adState = 'omitted';
    return state;
  }
  host.dataset.adWidth = String(layout.width); host.dataset.adHeight = String(layout.height);
  slot.style.width = `${layout.width}px`; slot.style.height = `${layout.height}px`;
  slot.style.maxWidth = '100%'; slot.style.flex = 'none';
  slot.dataset.adLayout = `${layout.width}x${layout.height}`;
  const currentScollerMax = parseFloat(win.getComputedStyle?.(scroller)?.maxHeight);
  const fixedContentHeight = Math.max(0, dialog.scrollHeight - scroller.offsetHeight);
  const availableScrollerHeight = dialog.clientHeight - fixedContentHeight - 2;
  if (availableScrollerHeight <= 0) {
    host.hidden = true; host.style.visibility = ''; scroller.style.maxHeight = state.originalScrollerMaxHeight;
    state.mounted = false; state.retired = true; host.dataset.adState = 'omitted';
    return state;
  }
  const maxScrollerHeight = Number.isFinite(currentScollerMax)
    ? Math.min(currentScollerMax, availableScrollerHeight) : availableScrollerHeight;
  scroller.style.maxHeight = `${maxScrollerHeight}px`;
  host.style.visibility = '';

  const geometrySafe = () => {
    if (state.retired || !currentEligibility() || !visible(dialog, win)
        || !visible(host, win) || !visible(slot, win)
        || doc.fullscreenElement || doc.visibilityState === 'hidden') return false;
    const dialogRect = box(dialog), hostRect = box(host), slotRect = box(slot);
    const scrollerRect = box(scroller), actionRect = box(primaryAction);
    const tiles = list.querySelectorAll?.('.project-gallery__tile, button') || [];
    const tileRect = [...tiles].map(box).find(rect => rect && rect.left >= scrollerRect?.left
      && rect.right <= scrollerRect?.right && rect.top >= scrollerRect?.top && rect.bottom <= scrollerRect?.bottom);
    const artworkArea = visibleArtworkArea(list, scrollerRect, win);
    if (!fitsViewport(dialogRect, win) || !fitsViewport(hostRect, win)
        || !fitsViewport(slotRect, win) || !fitsViewport(actionRect, win)
        || !dialogRect || !hostRect || !slotRect || !scrollerRect || !tileRect) return false;
    const borderTop = parseFloat(win.getComputedStyle?.(dialog)?.borderTopWidth) || 0;
    const borderBottom = parseFloat(win.getComputedStyle?.(dialog)?.borderBottomWidth) || 0;
    if (hostRect.top < dialogRect.top + borderTop || hostRect.bottom > dialogRect.bottom - borderBottom
        || actionRect.top < dialogRect.top || actionRect.bottom > dialogRect.bottom
        || tileRect.top < scrollerRect.top || tileRect.bottom > scrollerRect.bottom
        || tileRect.left < scrollerRect.left || tileRect.right > scrollerRect.right
        || slotRect.width < layout.width || slotRect.height < layout.height
        || artworkArea < layout.width * layout.height
        || dialog.scrollHeight > dialog.clientHeight + 1
        || !gapFromControls(dialog, hostRect, scroller, scrollerRect)) return false;
    return true;
  };
  if (!geometrySafe()) {
    host.hidden = true; host.style.visibility = ''; scroller.style.maxHeight = state.originalScrollerMaxHeight;
    state.mounted = false; state.retired = true; host.dataset.adState = 'omitted';
    return state;
  }
  host.dataset.adState = 'ready';
  host.setAttribute('aria-label', '広告');
  host.style.visibility = '';

  const onContextChange = () => { if (!state.retired) retire('context'); };
  const onDialogClose = () => retire('hide');
  const onPageHide = () => retire('pagehide');
  const onResize = () => {
    if (state.retired) return;
    if (getProjectGalleryAdLayout(contentBoxWidth(dialog, win))?.width !== layout.width
        || !geometrySafe()) retire('geometry');
  };
  const onScroll = () => {
    if (!state.retired && state.attempted && !geometrySafe()) retire('geometry');
  };
  dialog.addEventListener?.('close', onDialogClose);
  dialog.addEventListener?.('cancel', onDialogClose);
  dialog.addEventListener?.('scroll', onScroll, { passive: true });
  scroller.addEventListener?.('scroll', onScroll, { passive: true });
  doc.addEventListener?.('visibilitychange', onContextChange);
  doc.addEventListener?.('fullscreenchange', onContextChange);
  win.addEventListener?.('popstate', onContextChange);
  win.addEventListener?.('hashchange', onContextChange);
  win.addEventListener?.('pagehide', onPageHide, { once: true });
  win.addEventListener?.('resize', onResize);
  win.addEventListener?.('scroll', onScroll, { passive: true });
  win.navigation?.addEventListener?.('navigate', onContextChange);
  win.navigation?.addEventListener?.('currententrychange', onContextChange);
  if (typeof win.MutationObserver === 'function') {
    state.contextObserver = new win.MutationObserver(onContextChange);
    for (const target of [doc.documentElement, doc.body, dialog]) {
      if (target) state.contextObserver.observe(target, { attributes: true, attributeFilter: ['class', 'open', 'data-tool-direct', 'data-direct-loading', 'hidden'] });
    }
  }
  if (typeof win.MutationObserver === 'function') {
    state.statusObserver = new win.MutationObserver(markStatus);
    const ins = doc.createElement('ins');
    ins.className = 'adsbygoogle project-gallery-ad__unit';
    ins.style.display = 'block'; ins.style.width = `${layout.width}px`; ins.style.height = `${layout.height}px`;
    ins.style.maxWidth = '100%'; ins.dataset.adClient = resolved.client; ins.dataset.adSlot = resolved.slot;
    ins.dataset.fullWidthResponsive = 'false'; state.ins = ins; slot.replaceChildren(ins);
    state.statusObserver.observe(ins, { attributes: true, attributeFilter: ['data-ad-status', 'data-adsbygoogle-status'] });
  } else {
    const ins = doc.createElement('ins');
    ins.className = 'adsbygoogle project-gallery-ad__unit';
    ins.style.display = 'block'; ins.style.width = `${layout.width}px`; ins.style.height = `${layout.height}px`;
    ins.style.maxWidth = '100%'; ins.dataset.adClient = resolved.client; ins.dataset.adSlot = resolved.slot;
    ins.dataset.fullWidthResponsive = 'false'; state.ins = ins; slot.replaceChildren(ins);
  }

  // Request immediately only after the entire placement and primary controls are visible.
  state.attempted = true; host.dataset.adState = 'loading-sdk';
  try {
    const existingSdk = doc.querySelector?.('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');
    state.loader = loadAdsense(doc, win, resolved.client);
    if (!state.loader || state.loader.failed || !state.loader.script?.addEventListener) { markError(); return state; }
    const patchedQueue = win.adsbygoogle && win.adsbygoogle.push !== Array.prototype.push;
    const knownLoaded = ['loaded', 'complete'].includes(state.loader.script.readyState) || patchedQueue;
    if (existingSdk && !knownLoaded) { markError(); return state; }
    state.loader.errors?.add?.(state.onSdkError);
    state.scriptLoad = () => {
      if (state.retired || state.failed || state.requested) return;
      state.loader?.errors?.delete?.(state.onSdkError);
      if (!geometrySafe()) { retire('context'); return; }
      state.requested = true; host.dataset.adState = 'requested';
      try {
        win.adsbygoogle = win.adsbygoogle || [];
        win.adsbygoogle.push({});
      } catch { markError(); }
    };
    state.scriptError = markError;
    state.loader.script.addEventListener('load', state.scriptLoad, { once: true });
    state.loader.script.addEventListener('error', state.scriptError, { once: true });
    // If an SDK had already loaded, request only when its state is known or its
    // queue is patched; unknown preloaded state failed closed above.
    if (knownLoaded) state.scriptLoad();
  } catch { markError(); }
  const result = {
    mounted: true, host, slot, get requested() { return state.requested; },
    get retired() { return state.retired; }, retire: state.retire, cleanup: state.cleanup,
  };
  documents.set(doc, result);
  return result;
}
