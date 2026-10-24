import { ordinaryAdUnitIsConfigured } from './ordinary-ad-placement.mjs?rev=20261024-ordinary-ad-1';

const attemptedGutterDocuments = new WeakSet();

function isEnabledPlacement(config, placement) {
  return config?.enabled === true && config?.unit?.placement === placement
    && ordinaryAdUnitIsConfigured(config.unit);
}

/** Resolve a placement without importing the network-capable adapter when off. */
export async function createFeedAdRuntime(config, { doc = globalThis.document, win = globalThis.window } = {}) {
  if (!isEnabledPlacement(config, 'inline') || config.trustedContentEligible !== true) {
    return { enabled: false, trustedContentEligible: false, unit: null, provider: undefined };
  }
  const { createAdSenseDisplayProvider } = await import('./ordinary-ad-provider.mjs?rev=20261024-ordinary-ad-provider-1');
  return {
    enabled: true, trustedContentEligible: true, unit: config.unit,
    provider: createAdSenseDisplayProvider({ doc, win }),
  };
}

/** Resolve optional feed ads after the feed has booted; adapter errors stay local to ads. */
export function connectOptionalFeedAds(app, ordinaryAds, loadRuntime) {
  let active = true;
  Promise.resolve().then(loadRuntime).then((runtime) => {
    if (!active || !runtime?.enabled || !app || typeof app.render !== 'function') return;
    Object.assign(ordinaryAds, runtime);
    app.render();
  }).catch(() => {});
  return () => { active = false; };
}

/** Place a single measured static gutter on an already-approved information route. */
export async function mountInformationGutter({ config, doc = globalThis.document, win = globalThis.window, isEligiblePage = false } = {}) {
  if (!isEligiblePage || !isEnabledPlacement(config, 'gutter')) return { mounted: false, reason: 'disabled-or-ineligible' };
  if (!doc || attemptedGutterDocuments.has(doc)) return { mounted: false, reason: 'already-attempted' };
  attemptedGutterDocuments.add(doc);
  const { desktopGutterPlacement, mountOrdinaryDisplayAd } = await import('./ordinary-ad-placement.mjs?rev=20261024-ordinary-ad-1');
  const { createAdSenseDisplayProvider } = await import('./ordinary-ad-provider.mjs?rev=20261024-ordinary-ad-provider-1');
  let topLevel = false;
  try { topLevel = win.top === win.self; } catch { /* framed */ }
  const main = doc.querySelector('main#main, main[role="main"], main');
  if (!topLevel || !main || !doc.body || !doc.body.classList
      || !['https://pixieed.jp', 'https://www.pixieed.jp'].includes(win.location?.origin)
      || String(main.innerText || main.textContent || '').replace(/\s+/g, ' ').trim().length < 120
      || doc.querySelector('[aria-busy="true"]')) {
    return { mounted: false, reason: 'page-not-eligible' };
  }
  const getPlacement = () => {
    const rect = main.getBoundingClientRect();
    const obstacles = [...doc.querySelectorAll('header, nav, button, [role="dialog"], .site-header')]
      .filter((element) => element.getClientRects?.().length !== 0)
      .map((element) => element.getBoundingClientRect());
    return desktopGutterPlacement({
      viewportWidth: win.innerWidth, viewportHeight: win.innerHeight, visualViewport: win.visualViewport,
      main: rect, anchorTop: Math.max(rect.top, 24), obstacles, fixedWidth: config.unit.size.width,
      fullscreen: Boolean(doc.fullscreenElement), editor: doc.body.classList.contains('creation-editor'),
      mobileOrTablet: win.innerWidth <= 1190 || win.innerHeight <= 671,
    });
  };
  const placement = getPlacement();
  if (!placement) return { mounted: false, reason: 'no-safe-surplus-space' };
  const host = doc.createElement('div');
  host.className = 'ordinary-ad-gutter-host';
  host.style.position = 'absolute';
  host.style.left = `${win.scrollX + placement.left}px`;
  host.style.top = `${win.scrollY + placement.top}px`;
  host.style.width = `${placement.width}px`;
  doc.body.append(host);
  const provider = createAdSenseDisplayProvider({ doc, win });
  const mounted = mountOrdinaryDisplayAd({
    container: host, doc, provider, unit: config.unit, enabled: true, kind: 'gutter',
    onOutcome: (status) => { if (['unfilled', 'blocked', 'failed', 'empty'].includes(status)) host.remove(); },
    eligibility: {
      productionOrigin: true, topLevel: true, desktop: true,
      viewportWidth: win.innerWidth, viewportHeight: win.innerHeight,
      gutterFits: true, contentReady: true, publicFeed: false, feedReady: false,
      partialWarning: false, loading: false, empty: false, privateView: false,
      composerOpen: false, detailOpen: false, fullscreen: Boolean(doc.fullscreenElement),
      editor: doc.body.classList.contains('creation-editor'), trustedContentEligible: true,
    },
  });
  if (!mounted.mounted) host.remove();
  let retired = false;
  let resizeObserver;
  let bodyObserver;
  const removeListeners = () => {
    win.removeEventListener?.('resize', verifySafety);
    doc.removeEventListener?.('fullscreenchange', verifySafety);
    win.removeEventListener?.('pagehide', retire);
    resizeObserver?.disconnect();
    bodyObserver?.disconnect();
  };
  const retire = () => {
    if (retired) return;
    retired = true;
    removeListeners();
    mounted.cleanup?.();
    host.remove();
  };
  const verifySafety = () => {
    if (retired) return;
    if (String(main.innerText || main.textContent || '').replace(/\s+/g, ' ').trim().length < 120
        || doc.querySelector('[aria-busy="true"]')) { retire(); return; }
    const candidate = getPlacement();
    const actual = host.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    if (!candidate || !host.isConnected || Math.abs(actual.left - candidate.left) > 2
        || Math.abs(actual.width - config.unit.size.width) > 2
        || actual.left < mainRect.right + 48 || actual.right > win.innerWidth - 24
        || actual.top < mainRect.top + 48 || actual.bottom > Math.min(win.innerHeight - 24, mainRect.bottom)) retire();
  };
  if (mounted.mounted) {
    win.addEventListener?.('resize', verifySafety);
    doc.addEventListener?.('fullscreenchange', verifySafety);
    win.addEventListener?.('pagehide', retire, { once: true });
    if (typeof win.ResizeObserver === 'function') {
      resizeObserver = new win.ResizeObserver(verifySafety);
      resizeObserver.observe(main);
    }
    if (typeof win.MutationObserver === 'function') {
      bodyObserver = new win.MutationObserver(verifySafety);
      bodyObserver.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
    }
    verifySafety();
  }
  return { ...mounted, host, placement, cleanup: retire, get retired() { return retired; } };
}
