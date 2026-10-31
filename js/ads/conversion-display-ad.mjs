import { displayAdConfig } from '../../data/site-config.js?rev=20261008-map-detail-1';
import { getAdsenseLoader } from '../display-ads.mjs?rev=20261030-event-inline-ads-1';

const mounted = new WeakMap();
const paths = new Set(['/tools/start/convert/', '/output/work/']);
const allowedQuery = new Map([['mode', new Set(['convert'])], ['text', new Set(['input', 'output'])]]);

/** Preserve Google's optimized empty unit without reporting it as a paid creative. */
export function conversionAdDeliveryState(status) {
  return ['filled', 'unfilled', 'unfill-optimized'].includes(status) ? status : 'pending';
}
const preservesUnit = unit => ['filled', 'unfill-optimized'].includes(conversionAdDeliveryState(unit?.dataset.adStatus));

/** Private handoffs and arbitrary query data never become advertising URLs. */
export function conversionAdEligible({ origin, pathname, search = '', hash = '', topLevel = false } = {}) {
  if (!topLevel || !['https://pixieed.jp', 'https://www.pixieed.jp'].includes(origin)
      || !paths.has(pathname) || (hash && hash !== '#main')) return false;
  const query = new URLSearchParams(search);
  for (const key of query.keys()) {
    if (query.getAll(key).length !== 1 || !allowedQuery.get(key)?.has(query.get(key))) return false;
  }
  return true;
}

/** Keep the converter's existing width. A rail is used only in genuinely spare space. */
export function conversionAdLayout({ viewportWidth, viewportHeight, mainRight, railTop = 24, bottomDock = 120, frozenSize = null } = {}) {
  if (![viewportWidth, viewportHeight, mainRight].every(Number.isFinite)) return null;
  const spare = viewportWidth - 24 - mainRight - 48;
  const width = frozenSize?.width || (spare >= 300 ? 300 : spare >= 160 ? 160 : viewportWidth < 340 ? 250 : 300);
  const height = frozenSize?.height || (viewportHeight >= 900 ? 600 : 250);
  const rail = height >= 600 && spare >= width && railTop >= 0 && railTop + height + 24 <= viewportHeight - bottomDock;
  return { width, height, rail, left: mainRight + 48 };
}

// Essential geometry is available synchronously, even when the decorative CSS is
// cached, slow or unavailable. The ad unit itself also has explicit inline dimensions.
const criticalLayout = `
.conversion-ad-layout{position:relative;width:100%;min-width:0}
.conversion-display-ad{box-sizing:content-box;width:var(--conversion-ad-width,300px);margin:48px auto;padding:0;border:0}
.conversion-display-ad[hidden]{display:none!important}
.conversion-display-ad__label{display:block;height:24px;font:11px/24px system-ui,sans-serif;text-align:center}
.conversion-display-ad__slot,.conversion-display-ad__unit{display:block;box-sizing:content-box;width:var(--conversion-ad-width,300px);height:var(--conversion-ad-height,250px);margin:0;padding:0;border:0}
.conversion-ad-layout[data-ad-layout="rail"] .conversion-display-ad{position:absolute;top:var(--conversion-rail-top,24px);left:var(--conversion-rail-left);margin:0}`;

/** One normal asynchronous manual unit, requested once without waiting for editor
 * focus, preview idleness, scroll position or a secondary stylesheet load event.
 * No refresh, automatic advertising, overlay, export listener or consent override.
 */
export function mountConversionDisplayAd({ doc = globalThis.document, win = globalThis.window,
  config = displayAdConfig, load = getAdsenseLoader } = {}) {
  if (!doc || !win) return null;
  const eligible = () => conversionAdEligible({ origin: win.location.origin,
    pathname: win.location.pathname, search: win.location.search, hash: win.location.hash,
    topLevel: win.top === win.self });
  const main = doc.querySelector('main#main');
  const errorOnly = () => Boolean(main?.querySelector('[role="alert"]'))
    && !main.querySelector('#output-start,#output-layout,[data-editor]');
  if (!eligible() || !main || errorOnly() || mounted.has(doc)) return mounted.get(doc) || null;
  const client = config?.client, slot = String(config?.slots?.tools || '').trim();
  if (config?.enabled === false || !/^ca-pub-\d{16}$/.test(client || '') || !/^\d{6,20}$/.test(slot)) return null;
  const fallback = doc.createElement('style'); fallback.dataset.conversionAdLayout = '';
  fallback.textContent = criticalLayout; doc.head.append(fallback);
  const sheet = doc.createElement('link'); sheet.rel = 'stylesheet';
  sheet.href = '/css/conversion-display-ad.css?rev=20261031-workspace-2';
  const wrapper = doc.createElement('div'); wrapper.className = 'conversion-ad-layout';
  // Reparenting the workspace can blur an input while the user is typing.
  const focused = main.contains(doc.activeElement) ? doc.activeElement : null;
  let selection = null;
  try {
    if (focused && typeof focused.selectionStart === 'number')
      selection = [focused.selectionStart, focused.selectionEnd, focused.selectionDirection];
  } catch { /* Non-text controls have no text selection. */ }
  main.before(wrapper); wrapper.append(main);
  if (focused && doc.activeElement !== focused) {
    focused.focus({ preventScroll: true });
    if (selection) focused.setSelectionRange(...selection);
  }
  const host = doc.createElement('aside'); host.className = 'conversion-display-ad';
  host.setAttribute('aria-label', '広告'); host.hidden = true;
  host.innerHTML = '<span class="conversion-display-ad__label">広告</span><div class="conversion-display-ad__slot"></div>';
  wrapper.append(host);
  const inner = host.querySelector('.conversion-display-ad__slot');
  const unit = doc.createElement('ins'); unit.className = 'adsbygoogle conversion-display-ad__unit';
  unit.dataset.adClient = client; unit.dataset.adSlot = slot;
  unit.dataset.fullWidthResponsive = 'false'; inner.append(unit);
  let requested = false, disposed = false, failed = false, frozenSize = null;
  let frame = 0, idle = null, loader, layout;
  const report = (state, reason = '') => {
    host.dataset.adState = state;
    if (reason) host.dataset.adReason = reason;
    else delete host.dataset.adReason;
    doc.dispatchEvent(new win.CustomEvent('pixieed:conversion-ad', {
      detail: { state, reason, layout: layout?.rail ? 'rail' : 'flow', width: layout?.width, height: layout?.height }
    })); // Local diagnostic only: no filenames, source media or query data.
  };
  const requestBlocker = () => {
    if (!eligible()) return 'private-route';
    if (doc.visibilityState === 'hidden') return 'document-hidden';
    if (doc.fullscreenElement || doc.querySelector('dialog:modal, [role="dialog"][aria-modal="true"], .tool-embed--expanded')) return 'overlay-open';
    if (errorOnly()) return 'error-page';
    if (!layout?.rail) return 'no-safe-rail';
    if (!host.isConnected || host.hidden) return 'container-hidden';
    const rect = unit.getBoundingClientRect(), css = win.getComputedStyle(unit);
    if (rect.width <= 0 || rect.height <= 0 || !unit.getClientRects().length
        || ['hidden', 'collapse'].includes(css.visibility)) return 'waiting-for-layout';
    return '';
  };
  const collapseEmptyBelowView = () => {
    if (!failed || preservesUnit(unit)) return;
    if (host.getBoundingClientRect().top >= win.innerHeight) { host.hidden = true; report('empty', host.dataset.adReason); }
  };
  const markFailed = (reason = 'no-ad-returned') => {
    if (preservesUnit(unit)) return;
    failed = true; report(reason === 'no-ad-returned' ? 'unfilled' : 'error', reason);
    collapseEmptyBelowView();
  };
  const onScriptError = () => markFailed('script-load-error');
  function update() {
    frame = 0; if (disposed) return;
    const rect = main.getBoundingClientRect(), wrap = wrapper.getBoundingClientRect();
    const header = doc.querySelector('header');
    const headerBottom = header?.getBoundingClientRect().bottom || 0;
    const railTop = Math.max(24, headerBottom + 24, rect.top + 24);
    layout = conversionAdLayout({ viewportWidth: doc.documentElement.clientWidth,
      viewportHeight: win.innerHeight, mainRight: rect.right, railTop, frozenSize });
    if (!layout) return;
    if (!requested) {
      unit.style.display = 'block'; unit.style.width = `${layout.width}px`; unit.style.height = `${layout.height}px`;
    }
    wrapper.dataset.adLayout = layout.rail ? 'rail' : 'flow';
    wrapper.style.setProperty('--conversion-rail-left', `${layout.left - wrap.left}px`);
    wrapper.style.setProperty('--conversion-rail-top', `${railTop - wrap.top}px`);
    wrapper.style.setProperty('--conversion-ad-width', `${layout.width}px`);
    wrapper.style.setProperty('--conversion-ad-height', `${layout.height}px`);
    if (!layout.rail) host.hidden = true;
    else if (host.hidden && !failed) host.hidden = false;
    wrapper.style.minHeight = '';
    collapseEmptyBelowView();
    if (requested) return;
    const reason = requestBlocker(); report(reason ? 'waiting' : 'ready', reason);
    if (reason || idle !== null) return;
    const request = () => {
      idle = null;
      if (disposed || requested) return;
      const reason = requestBlocker();
      if (reason) { report('waiting', reason); return; }
      requested = true; frozenSize = { width: layout.width, height: layout.height }; report('requested');
      try {
        loader = load(doc, win, client);
        if (loader.failed) { onScriptError(); return; }
        loader.errors.add(onScriptError);
        (win.adsbygoogle = win.adsbygoogle || []).push({});
      } catch { markFailed('request-error'); }
    };
    idle = win.requestIdleCallback ? win.requestIdleCallback(request, { timeout: 1000 }) : win.setTimeout(request, 0);
  }
  function schedule() { if (!disposed && !frame) frame = win.requestAnimationFrame(update); }
  // Attach before insertion; neither event is a prerequisite for requesting the unit.
  sheet.addEventListener('load', schedule, { once: true });
  sheet.addEventListener('error', () => { host.dataset.adStyle = 'inline-fallback'; schedule(); }, { once: true });
  doc.head.append(sheet);
  const statusObserver = new win.MutationObserver(() => {
    const state = conversionAdDeliveryState(unit.dataset.adStatus);
    if (state === 'filled' || state === 'unfill-optimized') { failed = false; host.hidden = !layout?.rail; report(state); }
    else if (state === 'unfilled') markFailed();
  });
  statusObserver.observe(unit, { attributes: true, attributeFilter: ['data-ad-status'] });
  // Closing a dialog must resume a deferred request, even with no subsequent scroll.
  const overlayObserver = new win.MutationObserver(records => {
    if (records.some(record => record.attributeName === 'open'
        || record.target.classList?.contains('tool-embed')
        || record.target === doc.body)) schedule();
  });
  overlayObserver.observe(doc.body, { attributes: true, subtree: true, attributeFilter: ['open', 'class'] });
  const resizeObserver = win.ResizeObserver ? new win.ResizeObserver(schedule) : null;
  resizeObserver?.observe(main);
  const intersection = win.IntersectionObserver ? new win.IntersectionObserver(schedule) : null;
  intersection?.observe(host);
  for (const type of ['resize', 'scroll', 'pageshow', 'popstate', 'hashchange']) win.addEventListener(type, schedule, { passive: true });
  for (const type of ['visibilitychange', 'fullscreenchange']) doc.addEventListener(type, schedule);
  const onHide = event => { if (!event.persisted) cleanup(); };
  win.addEventListener('pagehide', onHide);
  function cleanup() {
    if (disposed) return; disposed = true;
    win.cancelAnimationFrame(frame);
    if (idle !== null) { if (win.cancelIdleCallback) win.cancelIdleCallback(idle); else win.clearTimeout(idle); }
    statusObserver.disconnect(); overlayObserver.disconnect(); resizeObserver?.disconnect(); intersection?.disconnect();
    loader?.errors.delete(onScriptError);
    for (const type of ['resize', 'scroll', 'pageshow', 'popstate', 'hashchange']) win.removeEventListener(type, schedule);
    for (const type of ['visibilitychange', 'fullscreenchange']) doc.removeEventListener(type, schedule);
    win.removeEventListener('pagehide', onHide);
  }
  const result = { cleanup, get requested() { return requested; } };
  mounted.set(doc, result); schedule(); return result;
}
