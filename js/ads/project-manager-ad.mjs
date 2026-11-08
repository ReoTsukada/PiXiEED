/** Ordinary inline Display units after complete six-artwork groups. */
import { getAdsenseLoader } from '../display-ads.mjs?rev=20261030-event-inline-ads-1';
import { claimProjectGalleryAdRequest, hasProjectGalleryAdRequest,
  PROJECT_GALLERY_AD_PATHS, PROJECT_GALLERY_AD_MIN_GAP, resolveProjectGalleryAdUnit } from './project-gallery-ad.mjs?rev=20261108-gallery-canvas-viewport-1';

const origins = new Set(['https://pixieed.jp', 'https://www.pixieed.jp']);
const allowedQuery = { workspace: ['1'], social: ['1'], runtime: ['direct'], mode: ['draw', 'audio', 'camera'] };
export function isProjectManagerAdEligible({ config, origin, protocol, pathname, search = '', hash = '', surface = 'manager',
  topLevel = false, pageVisible = false, libraryVisible = false, settled = false,
  enoughArtwork = false, searching = false, selecting = false, importing = false,
  hasErrors = false, busy = false, restoring = false, dirty = false, fullscreen = false,
  privateContext = false, editor = false } = {}) {
  if (!resolveProjectGalleryAdUnit(config) || config.minimumArtwork !== 1 || !['manager', 'chooser'].includes(surface)) return false;
  const query = new URLSearchParams(search);
  // Never remove pointers or rewrite history merely to make advertising eligible.
  if ([...query.keys()].some(key => !Object.hasOwn(allowedQuery, key) || !allowedQuery[key].includes(query.get(key)) || query.getAll(key).length !== 1)) return false;
  if (surface === 'chooser' && (editor || [...query.keys()].some(key => !['workspace', 'social'].includes(key)))) return false;
  return origins.has(origin) && protocol === 'https:' && PROJECT_GALLERY_AD_PATHS.includes(pathname) && hash === ''
    && topLevel === true && pageVisible === true && libraryVisible === true && settled === true
    && enoughArtwork === true && !searching && !selecting && !importing && !hasErrors
    && !busy && !restoring && !dirty && !fullscreen && !privateContext;
}
export function hasManagerArtwork(projects, minimum = 1) {
  if (!Array.isArray(projects) || projects.length < minimum || minimum !== 1) return false;
  return projects.every(item => {
    const { width, height, rgb } = item?.summary?.thumbnail || {};
    return Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0
      && ArrayBuffer.isView(rgb) && !(rgb instanceof DataView) && rgb.length >= width * height * 3;
  });
}
export function projectGalleryAdPositions(count) {
  if (!Number.isSafeInteger(count) || count < 1) return [];
  if (count < 6) return [count];
  return Array.from({ length: Math.floor(count / 6) }, (_, i) => (i + 1) * 6);
}
export function getInlineGalleryAdLayout(width) {
  if (!Number.isFinite(width)) return null;
  if (width >= 468) return { width: 468, height: 60 };
  if (width >= 320) return { width: 320, height: 50 };
  if (width >= 300) return { width: 300, height: 50 };
  if (width >= 250) return { width: 250, height: 50 }; // Google-supported custom fixed size, subject to inventory.
  return null;
}
const rect = node => node?.getBoundingClientRect?.();
const visible = (node, win) => Boolean(node?.isConnected && !node.hidden && node.getClientRects?.().length
  && !['hidden', 'collapse'].includes(win.getComputedStyle(node).visibility));
function intersection(a, b) {
  if (!a || !b) return null;
  const left = Math.max(a.left, b.left), right = Math.min(a.right, b.right);
  const top = Math.max(a.top, b.top), bottom = Math.min(a.bottom, b.bottom);
  return right > left && bottom > top ? { left, right, top, bottom, width: right - left, height: bottom - top } : null;
}
function inside(a, b) { return Boolean(a && b && a.width > 0 && a.height > 0 && a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom); }
const noop = reason => ({ mounted: false, reason, retire() {}, dispose() {}, update() {} });

function galleryEnvironmentEligible({ doc, win, dialog, pane, galleryState, config, surface }) {
    const location = win.location, history = win.history?.state;
    let topLevel = false; try { topLevel = win.top === win.self; } catch {}
    const privateContext = Boolean(doc.querySelector('[data-private-view]')
      || history && ['privateView', 'projectWorkspaceSelection', 'pxd', 'pxdRevision', 'pxdImage', 'modePxd', 'modePxdRevision', 'modePxdImage', 'modeProjectTool', 'toolStartActive'].some(key => Boolean(history[key])));
    return isProjectManagerAdEligible({ ...galleryState, config, surface, origin: location?.origin, protocol: location?.protocol,
      pathname: location?.pathname, search: location?.search || '', hash: location?.hash || '', topLevel,
      libraryVisible: dialog?.open === true && pane?.hidden === false && galleryState.libraryVisible === true,
      editor: doc.documentElement?.dataset?.toolDirect === 'work',
      pageVisible: doc.visibilityState !== 'hidden', fullscreen: Boolean(doc.fullscreenElement), privateContext });
}

/** Only boolean gallery state crosses into the controller, never project records. */
export function mountProjectManagerAd({ doc = document, win = window, dialog, pane, scroller = dialog, list, host, slot,
  galleryState, config, surface = 'manager', placementKey = 'manager:1', manageContext = true, loadAdsense = getAdsenseLoader } = {}) {
  let retired = false, attempted = false, requested = false, sdkReady = false, loader, ins, statusObserver, contextObserver, resizeObserver, intersectionObserver;
  let scriptLoad, scriptError, animationFrame = 0;
  const resolved = resolveProjectGalleryAdUnit(config);
  const stateEligible = () => galleryEnvironmentEligible({ doc, win, dialog, pane, galleryState, config, surface });
  if (!dialog || !pane || !list || !host || !slot || !resolved || !stateEligible() || hasProjectGalleryAdRequest(doc, placementKey)) {
    if (host) host.hidden = true; return noop('ineligible');
  }
  const layout = getInlineGalleryAdLayout(list.clientWidth);
  if (!layout) { host.hidden = true; return noop('width'); }
  host.hidden = false; host.style.visibility = 'hidden'; host.dataset.adState = 'pending';
  slot.style.width = `${layout.width}px`; slot.style.height = `${layout.height}px`; slot.dataset.adLayout = `${layout.width}x${layout.height}`;
  const geometrySafe = () => {
    if (!stateEligible() || !visible(dialog, win) || !visible(pane, win)) return false;
    const viewport = { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight };
    const d = rect(dialog), h = rect(host), s = rect(slot);
    const view = intersection(d, rect(scroller));
    if (!view || !inside(d, viewport) || !inside(h, view) || !inside(s, view) || !inside(s, viewport)
      || s.width < layout.width || s.height < layout.height) return false;
    const header = rect(dialog.querySelector('.project-sheet__header'));
    const clip = { left: view.left, right: view.right, top: Math.max(view.top, header?.bottom || view.top), bottom: view.bottom };
    if (!inside(h, clip)) return false;
    // A visible real artwork is required. This is a site heuristic, not Google's
    // definition of publisher content or an official content/ad area ratio.
    const artworkVisible = [...list.querySelectorAll('.project-gallery__tile canvas')].some(canvas => {
      const shown = visible(canvas, win) && intersection(rect(canvas), clip);
      return shown && shown.width >= 64 && shown.height >= 64;
    });
    if (!artworkVisible) return false;
    for (const control of dialog.querySelectorAll('button, input, select, textarea, summary, a[href], [tabindex]:not([tabindex="-1"])')) {
      if (host.contains(control) || control.closest('.project-manager-ad') || !visible(control, win)) continue;
      const c = intersection(rect(control), list.contains(control) ? clip : d); if (!c) continue;
      const gap = c.bottom <= h.top ? h.top - c.bottom : c.top >= h.bottom ? c.top - h.bottom : -1;
      if (gap < PROJECT_GALLERY_AD_MIN_GAP) return false;
    }
    return true;
  };
  const cleanup = () => {
    win.cancelAnimationFrame?.(animationFrame); animationFrame = 0;
    resizeObserver?.disconnect(); intersectionObserver?.disconnect(); contextObserver?.disconnect(); statusObserver?.disconnect();
    scroller.removeEventListener('scroll', schedule); dialog.removeEventListener('close', close); dialog.removeEventListener('cancel', close);
    win.removeEventListener('resize', schedule); win.removeEventListener('popstate', contextChange); win.removeEventListener('hashchange', contextChange); win.removeEventListener('pagehide', contextChange);
    win.navigation?.removeEventListener('navigate', contextChange); win.navigation?.removeEventListener('currententrychange', contextChange);
    doc.removeEventListener('visibilitychange', contextChange); doc.removeEventListener('fullscreenchange', contextChange);
    loader?.errors?.delete(onError);
    loader?.script?.removeEventListener('load', scriptLoad); loader?.script?.removeEventListener('error', scriptError);
  };
  function retire(reason = 'interaction') {
    if (retired) return;
    retired = true; cleanup(); ins?.remove(); slot.replaceChildren(); host.dataset.adState = 'retired'; host.dataset.retireReason = reason;
    host.style.visibility = 'hidden'; // Keep normal-flow geometry until close; controls must not jump.
    if (!dialog.open) host.hidden = true;
  }
  function close() { retire('close'); host.hidden = true; }
  function contextChange() { retire('context'); }
  function onError() {
    if (retired) return;
    cleanup(); ins?.remove(); slot.replaceChildren(); host.dataset.adState = 'error'; host.style.visibility = 'hidden'; retired = true;
  }
  function markStatus() {
    if (retired || !ins) return;
    const status = ins.dataset.adStatus;
    if (['filled', 'unfill-optimized'].includes(status)) { host.dataset.adState = 'filled'; host.style.visibility = ''; }
    else if (status === 'unfilled') { host.dataset.adState = 'unfilled'; host.style.visibility = 'hidden'; }
  }
  function pushUnit() {
    if (retired || requested || !sdkReady || !geometrySafe()) return;
    // Create the ins immediately before its push. Another unit's push must never
    // accidentally initialize this slot while its artwork is off-screen.
    ins = doc.createElement('ins'); ins.className = 'adsbygoogle project-manager-ad__unit';
    ins.style.display = 'block'; ins.style.width = `${layout.width}px`; ins.style.height = `${layout.height}px`;
    ins.dataset.adClient = resolved.client; ins.dataset.adSlot = resolved.slot; ins.dataset.fullWidthResponsive = 'false';
    ins.dataset.galleryPlacement = placementKey; slot.replaceChildren(ins);
    if (typeof win.MutationObserver === 'function') { statusObserver = new win.MutationObserver(markStatus); statusObserver.observe(ins, { attributes: true, attributeFilter: ['data-ad-status', 'data-adsbygoogle-status'] }); }
    requested = true; host.dataset.adState = 'requested'; host.style.visibility = '';
    try { win.adsbygoogle ||= []; win.adsbygoogle.push({}); } catch { onError(); }
  }
  function tryRequest() {
    animationFrame = 0; if (retired) return;
    if (!stateEligible()) { retire('state'); return; }
    if (list.clientWidth < layout.width) { retire('responsive-width'); return; }
    if (attempted) { pushUnit(); return; }
    if (!geometrySafe()) return;
    if (!claimProjectGalleryAdRequest(doc, host, placementKey)) { retire('placement-limit'); return; }
    attempted = true; host.dataset.adState = 'loading-sdk';
    try {
      loader = loadAdsense(doc, win, resolved.client);
      if (!loader || loader.failed || !loader.script?.addEventListener) { onError(); return; }
      loader.errors?.add(onError);
      scriptLoad = () => { if (!retired) { sdkReady = true; pushUnit(); } };
      scriptError = onError;
      loader.script.addEventListener('load', scriptLoad, { once: true }); loader.script.addEventListener('error', scriptError, { once: true });
      if (['loaded', 'complete'].includes(loader.script.readyState) || win.adsbygoogle && win.adsbygoogle.push !== Array.prototype.push) scriptLoad();
    } catch { onError(); }
  }
  function schedule() { if (!retired && !animationFrame) animationFrame = win.requestAnimationFrame(tryRequest); }
  scroller.addEventListener('scroll', schedule, { passive: true }); dialog.addEventListener('close', close); dialog.addEventListener('cancel', close);
  win.addEventListener('resize', schedule);
  if (manageContext) {
    win.addEventListener('popstate', contextChange); win.addEventListener('hashchange', contextChange); win.addEventListener('pagehide', contextChange);
    win.navigation?.addEventListener('navigate', contextChange); win.navigation?.addEventListener('currententrychange', contextChange);
    doc.addEventListener('visibilitychange', contextChange); doc.addEventListener('fullscreenchange', contextChange);
  }
  if (typeof win.ResizeObserver === 'function') { resizeObserver = new win.ResizeObserver(schedule); for (const el of [dialog, list, slot]) resizeObserver.observe(el); }
  if (typeof win.IntersectionObserver === 'function') { intersectionObserver = new win.IntersectionObserver(schedule, { root: scroller, threshold: 1 }); intersectionObserver.observe(host); }
  if (manageContext && typeof win.MutationObserver === 'function') {
    contextObserver = new win.MutationObserver(() => { if (!stateEligible()) retire('state'); });
    for (const el of [dialog, pane, doc.documentElement]) contextObserver.observe(el, { attributes: true, attributeFilter: ['class', 'hidden', 'open', 'data-private-view', 'data-tool-direct', 'data-direct-loading'] });
    contextObserver.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open', 'data-private-view', 'data-tool-direct', 'data-direct-loading'] });
  }
  schedule();
  return { mounted: true, get attempted() { return attempted; }, get requested() { return requested; }, get retired() { return retired; }, retire, update: schedule, dispose: close };
}

/** Stable distinct slots. Each position can request once in this document. */
export function mountProjectGalleryAdSeries({ doc = document, win = window, dialog, pane, scroller = dialog, list, gallery,
  artworkCount, galleryState, config, surface = 'manager' } = {}) {
  if (!galleryEnvironmentEligible({ doc, win, dialog, pane, galleryState, config, surface })) return noop('ineligible');
  const breaks = projectGalleryAdPositions(artworkCount).filter(after => !hasProjectGalleryAdRequest(doc, `${surface}:${after}`)).map(after => {
    const host = doc.createElement('section'); host.className = 'project-manager-ad'; host.setAttribute('aria-label', '広告');
    host.dataset[surface === 'chooser' ? 'projectGalleryAd' : 'projectManagerAd'] = ''; host.dataset.adAfter = String(after); host.dataset.adState = 'reserved';
    const label = doc.createElement('p'); label.className = 'project-manager-ad__label'; label.textContent = '広告';
    const slot = doc.createElement('div'); slot.className = 'project-manager-ad__slot'; slot.dataset.projectManagerAdSlot = '';
    host.append(label, slot); host.style.visibility = 'hidden';
    const layout = getInlineGalleryAdLayout(list.clientWidth);
    if (layout) { slot.style.width = `${layout.width}px`; slot.style.height = `${layout.height}px`; }
    return { after, element: host, slot };
  });
  if (!breaks.length || !getInlineGalleryAdLayout(list.clientWidth)) return noop('no-placement');
  let stopped = false, frame = 0, observer, contextObserver;
  const controllers = new Map();
  const activate = item => {
    if (stopped || controllers.has(item.element)) return;
    const { after, element: host, slot } = item;
    controllers.set(host, mountProjectManagerAd({ doc, win, dialog, pane, scroller, list, host, slot,
      galleryState, config, surface, placementKey: `${surface}:${after}`, manageContext: false }));
  };
  const activateVisible = () => {
    const view = rect(scroller);
    for (const item of breaks) if (intersection(rect(item.element), view)) activate(item);
  };
  gallery.setBreaks(breaks);
  frame = win.requestAnimationFrame(() => {
    frame = 0; if (stopped) return;
    if (typeof win.IntersectionObserver === 'function') {
      const byHost = new Map(breaks.map(item => [item.element, item]));
      observer = new win.IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) activate(byHost.get(entry.target));
      }, { root: scroller, threshold: 0 });
      for (const { element } of breaks) observer.observe(element);
    } else scroller.addEventListener('scroll', activateVisible, { passive: true });
    activateVisible();
  });
  function retire(reason = 'context') {
    if (stopped) return;
    stopped = true; win.cancelAnimationFrame(frame); observer?.disconnect(); contextObserver?.disconnect(); scroller.removeEventListener('scroll', activateVisible);
    for (const type of ['popstate', 'hashchange', 'pagehide']) win.removeEventListener(type, contextChange);
    for (const type of ['visibilitychange', 'fullscreenchange']) doc.removeEventListener(type, contextChange);
    win.navigation?.removeEventListener('navigate', contextChange); win.navigation?.removeEventListener('currententrychange', contextChange);
    dialog.removeEventListener('close', contextChange); dialog.removeEventListener('cancel', contextChange);
    controllers.forEach(c => c.retire(reason));
    for (const { element } of breaks) { element.style.visibility = 'hidden'; if (!controllers.has(element)) { element.dataset.adState = 'retired'; element.dataset.retireReason = reason; } }
  }
  function contextChange() { retire('context'); }
  for (const type of ['popstate', 'hashchange', 'pagehide']) win.addEventListener(type, contextChange);
  for (const type of ['visibilitychange', 'fullscreenchange']) doc.addEventListener(type, contextChange);
  win.navigation?.addEventListener('navigate', contextChange); win.navigation?.addEventListener('currententrychange', contextChange);
  dialog.addEventListener('close', contextChange); dialog.addEventListener('cancel', contextChange);
  if (typeof win.MutationObserver === 'function') {
    contextObserver = new win.MutationObserver(() => { if (!galleryEnvironmentEligible({ doc, win, dialog, pane, galleryState, config, surface })) retire('state'); });
    contextObserver.observe(doc.documentElement, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'hidden', 'open', 'data-private-view', 'data-tool-direct', 'data-direct-loading'] });
  }
  return { mounted: true, retire,
    update() {
      if (!galleryEnvironmentEligible({ doc, win, dialog, pane, galleryState, config, surface })) retire('state');
      else controllers.forEach(c => c.update());
    },
    dispose() { retire('close'); controllers.forEach(c => c.dispose()); gallery.clearBreaks(); }
  };
}
