/** One ordinary display unit on the PUBLIC conversion guide, never the workspace. */
const documents = new WeakMap();
import { getAdsenseLoader } from '../display-ads.mjs?rev=20261027-guide-loader-1';
export const OUTPUT_GUIDE_CANONICAL = 'https://pixieed.jp/output/';

export function isOutputGuideAdEligible({ origin, pathname, search = '', topLevel,
  marker, privateContext = true } = {}) {
  return ['https://pixieed.jp', 'https://www.pixieed.jp'].includes(origin)
    && ['/output/', '/output/index.html'].includes(pathname)
    && search === '' && topLevel === true && marker === 'guide-v1'
    && privateContext === false;
}

export function resolveOutputGuideAd(config) {
  const unit = config?.unit;
  if (config?.enabled !== true || unit?.verifiedActive !== true
      || unit.format !== 'display' || unit.placement !== 'inline' || unit.size !== 'responsive'
      || !/^ca-pub-\d{16}$/.test(unit.client || '')
      || !/^\d{6,20}$/.test(String(unit.slot || ''))) return null;
  return { client: unit.client, slot: String(unit.slot) };
}

function eligible(doc, win) {
  try {
    return isOutputGuideAdEligible({ ...win.location, origin: win.location.origin,
      pathname: win.location.pathname, search: win.location.search,
      topLevel: win.top === win.self, marker: doc.body?.dataset?.outputMonetization,
      privateContext: Boolean(doc.fullscreenElement || doc.body?.classList?.contains('creation-editor')
        || doc.body?.classList?.contains('tool-shell--workspace-open')
        || doc.documentElement?.dataset?.toolDirect === 'work'
        || doc.documentElement?.hasAttribute?.('data-direct-loading')
        || doc.querySelector('[data-tool-embed], .tool-embed--expanded, input[type="file"]')),
    });
  } catch { return false; }
}

/** No loader on localhost, previews, frames, private URLs, or invalid configuration.
 * Requests once, near the viewport; ad loading never gates navigation or downloads.
 */
export function mountOutputGuideAd({ doc = globalThis.document, win = globalThis.window,
  config } = {}) {
  if (!doc || !win || !eligible(doc, win)) return { mounted: false, reason: 'ineligible' };
  if (documents.has(doc)) return documents.get(doc);
  const resolved = resolveOutputGuideAd(config);
  const hosts = doc.querySelectorAll('[data-output-guide-ad]');
  const host = hosts[0];
  const main = doc.querySelector('main#main');
  if (!resolved || hosts.length !== 1 || !host || !main?.contains(host)
      || String(main.textContent || '').trim().length < 200) {
    return { mounted: false, reason: 'configuration-or-content' };
  }
  const slot = host.querySelector('[data-output-guide-ad-slot]');
  if (!slot) return { mounted: false, reason: 'missing-slot' };
  let requested = false, disposed = false, unfilled = false;
  let observer, statusObserver, loader;
  const unit = doc.createElement('ins');
  unit.className = 'adsbygoogle output-guide-ad__unit';
  unit.style.display = 'block';
  unit.style.width = '100%';
  unit.style.height = '250px';
  unit.dataset.adClient = resolved.client;
  unit.dataset.adSlot = resolved.slot;
  unit.dataset.fullWidthResponsive = 'false';
  slot.append(unit);
  host.hidden = false;
  host.dataset.adState = 'ready';
  const filled = () => ['filled', 'unfill-optimized'].includes(unit.dataset.adStatus);
  const bounds = () => host.getBoundingClientRect();
  const near = () => { const r = bounds(); return r.width >= 250 && r.height > 0
    && r.top < win.innerHeight + 120 && r.bottom > -120; };
  const collapseOffscreen = () => {
    if (!unfilled || filled()) return;
    const r = bounds();
    if (r.bottom <= 0 || r.top >= win.innerHeight) {
      host.hidden = true;
      host.dataset.adState = 'empty';
    }
  };
  const failed = () => {
    if (filled()) return;
    unfilled = true;
    host.dataset.adState = 'unfilled';
    collapseOffscreen();
  };
  const request = () => {
    if (requested || disposed || !host.isConnected || !eligible(doc, win)
        || doc.visibilityState === 'hidden' || host.hidden || !near()
        || host.getClientRects?.().length === 0
        || ['hidden', 'collapse'].includes(win.getComputedStyle?.(host)?.visibility)) return;
    requested = true; // Never retry or refresh, even after a network/ad-block failure.
    host.dataset.adState = 'requested';
    try {
      // Use the same SDK instance and error handling as the public tools page.
      loader = getAdsenseLoader(doc, win, resolved.client);
      if (loader.failed) { failed(); return; }
      loader.errors.add(failed);
      (win.adsbygoogle = win.adsbygoogle || []).push({});
    } catch { failed(); }
  };
  const onVisibility = () => { request(); collapseOffscreen(); };
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect(); statusObserver?.disconnect();
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('resize', onVisibility);
    win.removeEventListener('scroll', onVisibility);
    win.removeEventListener('pagehide', cleanup);
    loader?.errors.delete(failed);
  };
  if (typeof win.MutationObserver === 'function') {
    statusObserver = new win.MutationObserver(() => {
      if (filled()) { unfilled = false; host.hidden = false; host.dataset.adState = 'filled'; }
      else if (unit.dataset.adStatus === 'unfilled') failed();
    });
    statusObserver.observe(unit, { attributes: true, attributeFilter: ['data-ad-status'] });
  }
  if (typeof win.IntersectionObserver === 'function') {
    observer = new win.IntersectionObserver(() => { request(); collapseOffscreen(); }, { rootMargin: '120px' });
    observer.observe(host);
  }
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('resize', onVisibility);
  win.addEventListener('scroll', onVisibility, { passive: true });
  win.addEventListener('pagehide', cleanup, { once: true });
  const result = { mounted: true, cleanup, get requested() { return requested; } };
  documents.set(doc, result);
  request();
  return result;
}

/** Reuse existing consent-gated analytics. No URL parameters or filenames are sent. */
export function bindOutputGuideActions({ doc = globalThis.document, win = globalThis.window,
  track = () => {} } = {}) {
  const onClick = async event => {
    if (event.target?.closest?.('a[data-output-start]')) {
      try { track('select_content', { tool: 'output', content_type: 'tool' }); } catch { /* navigation wins */ }
    }
    if (!event.target?.closest?.('[data-output-copy]')) return;
    const status = doc.querySelector('[data-output-copy-status]');
    try {
      await win.navigator.clipboard.writeText(OUTPUT_GUIDE_CANONICAL);
      if (status) status.textContent = 'この案内ページのURLをコピーしました。';
      try { track('link_copy', { tool: 'output', method: 'clipboard' }); } catch { /* optional */ }
    } catch { if (status) status.textContent = `共有するURL：${OUTPUT_GUIDE_CANONICAL}`; }
  };
  doc.addEventListener('click', onClick);
  const copy = doc.querySelector('[data-output-copy]');
  if (copy && typeof win.navigator?.clipboard?.writeText === 'function') copy.hidden = false;
  return () => doc.removeEventListener('click', onClick);
}

if (typeof document !== 'undefined' && typeof window !== 'undefined'
    && document.body?.dataset?.outputMonetization === 'guide-v1') {
  let track = () => {};
  bindOutputGuideActions({ track: (...args) => track(...args) });
  // Loading local configuration is harmless; the guard blocks all advertising off production.
  void import('../../data/output-guide-ad-config.mjs?rev=20261027-guide-loader-1')
    .then(({ outputGuideAdConfig }) => mountOutputGuideAd({ config: outputGuideAdConfig }))
    .catch(() => {});
  void import('../site-analytics.mjs?rev=20261007-safe-analytics-1')
    .then(module => { track = module.trackSiteEvent; }).catch(() => {});
}
