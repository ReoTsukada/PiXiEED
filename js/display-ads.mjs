import { displayAdConfig } from '../data/site-config.js?rev=20261008-map-detail-1';

// Explicit page ownership prevents accidental ads in editors, private pages or embedded tools.
const placements = new Map([
  ['home', ['/']], ['tools', ['/tools/']], ['info', ['/about/', '/guide/']],
  ['stores', ['/stores/']], ['store-detail', ['/stores/ecowashcafe-nakanoshima.html']],
  ['map-detail', ['/globe/']],
  ['camera-result', ['/pixel-camera.html']], ['draw-result', ['/draw/']],
  ['audio-result', ['/audio/']], ['jigsaw-result', ['/jigsaw/']],
  ['spot-result', ['/play/spot-difference/']], ['find-result', ['/play/hidden-object/']]
]);
const mounted = new WeakSet();
const loaders = new WeakMap();
const flowPlacements = new Set(['home', 'tools', 'info', 'stores', 'store-detail']);

function getAdsenseLoader(doc, win, client) {
  let state = loaders.get(doc);
  if (state) return state;
  const source = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  const script = doc.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]') || doc.createElement('script');
  state = { script, failed: false, errors: new Set() };
  loaders.set(doc, state);
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.addEventListener('error', () => {
    state.failed = true;
    for (const onError of [...state.errors]) onError();
    state.errors.clear();
  }, { once: true });
  if (!script.isConnected) {
    script.src = source;
    doc.head.append(script);
  }
  return state;
}

export function resolveDisplayAd(config, key, pathname) {
  const path = String(pathname || '').replace(/\/index\.html$/, '/');
  if (!placements.get(key)?.includes(path)) return null;
  const slot = config?.slots?.[key];
  if (typeof slot !== 'string' || !/^\d{6,20}$/.test(slot.trim())) return null;
  if (!/^ca-pub-\d{16}$/.test(config?.client || '')) return null;
  return { client: config.client, slot: slot.trim() };
}

/** Prepare the explicitly declared flow-layout units; blank configuration stays untouched. */
export function mountDisplayAds({ root = document, win = window, config = displayAdConfig, canMount = () => true } = {}) {
  if (win.top !== win.self || !['http:', 'https:'].includes(win.location.protocol)) return () => {};
  const doc = root.ownerDocument || root;
  const pathname = win.location.pathname;
  const cleanups = [];
  for (const node of root.querySelectorAll('[data-display-ad]')) {
    if (mounted.has(node)) continue;
    const resolved = resolveDisplayAd(config, node.dataset.displayAd, pathname);
    if (!resolved) { node.hidden = true; continue; }
    const inner = node.querySelector('.px-display-ad__inner');
    if (!inner) continue;
    // A full-screen result may omit this unit before any request when it cannot fit safely.
    if (!canMount(node)) continue;
    mounted.add(node);
    const unit = doc.createElement('ins');
    unit.className = 'adsbygoogle px-display-ad__unit';
    unit.style.display = 'block';
    unit.dataset.adClient = resolved.client;
    unit.dataset.adSlot = resolved.slot;
    unit.dataset.fullWidthResponsive = 'false';
    inner.append(unit);
    node.dataset.adState = 'ready';
    node.hidden = false;

    let queued = false;
    let requestObserver;
    let sizeObserver;
    let visibilityObserver;
    let emptyObserver;
    let statusObserver;
    let loader;
    let disposed = false;
    function dispose() {
      disposed = true;
      requestObserver?.disconnect();
      sizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      emptyObserver?.disconnect();
      statusObserver?.disconnect();
      loader?.errors.delete(markEmpty);
      doc.removeEventListener('visibilitychange', onVisible);
    }
    function collapseEmpty() {
      // Filled creatives, including Google's optimized unfilled units, must remain untouched.
      if (['filled', 'unfill-optimized'].includes(unit.dataset.adStatus)) { dispose(); return; }
      if (node.hasAttribute('data-ad-reserve')) {
        node.dataset.adState = 'empty';
        requestObserver?.disconnect();
        sizeObserver?.disconnect();
        visibilityObserver?.disconnect();
        emptyObserver?.disconnect();
        loader?.errors.delete(markEmpty);
        doc.removeEventListener('visibilitychange', onVisible);
        return;
      }
      node.hidden = true;
      node.dataset.adState = 'empty';
      requestObserver?.disconnect();
      sizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      emptyObserver?.disconnect();
      loader?.errors.delete(markEmpty);
      doc.removeEventListener('visibilitychange', onVisible);
      // Keep the status observer so a later Google-optimized fill is never hidden.
    }
    function markEmpty() {
      if (['filled', 'unfill-optimized'].includes(unit.dataset.adStatus)) return;
      node.dataset.adState = 'unfilled';
      const bounds = node.getBoundingClientRect();
      if (bounds.bottom <= 0 || bounds.top >= win.innerHeight) { collapseEmpty(); return; }
      // Do not move buttons beneath the user's finger: collapse after this area leaves view.
      if (!emptyObserver && win.IntersectionObserver) {
        emptyObserver = new win.IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.target === node && !entry.isIntersecting)) collapseEmpty();
        });
        emptyObserver.observe(node);
      }
    }
    function request() {
      if (disposed || queued || node.hidden || doc.visibilityState === 'hidden' || unit.getBoundingClientRect().width <= 0) return;
      if (flowPlacements.has(node.dataset.displayAd)) {
        const style = win.getComputedStyle?.(node);
        const rects = node.getClientRects?.();
        if ((rects && !rects.length) || ['hidden', 'collapse'].includes(style?.visibility)) return;
      }
      queued = true;
      sizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      node.dataset.adState = 'requested';
      requestObserver?.disconnect();
      try {
        loader = getAdsenseLoader(doc, win, resolved.client);
        if (loader.failed) { markEmpty(); return; }
        loader.errors.add(markEmpty);
        (win.adsbygoogle = win.adsbygoogle || []).push({});
      }
      catch { markEmpty(); }
    }
    function onVisible() {
      if (!disposed && doc.visibilityState !== 'hidden' && !queued) {
        const bounds = node.getBoundingClientRect();
        if (bounds.top < win.innerHeight + 240 && bounds.bottom > -240) request();
      }
    }
    function requestIfNear() {
      if (disposed || queued || doc.visibilityState === 'hidden') return;
      const bounds = node.getBoundingClientRect();
      if (bounds.top < win.innerHeight + 240 && bounds.bottom > -240) request();
    }
    statusObserver = new win.MutationObserver(() => {
      if (unit.dataset.adStatus === 'unfilled') markEmpty();
      else if (['filled', 'unfill-optimized'].includes(unit.dataset.adStatus)) {
        node.hidden = false;
        node.dataset.adState = 'filled'; dispose();
      }
    });
    statusObserver.observe(unit, { attributes: true, attributeFilter: ['data-ad-status'] });
    doc.addEventListener('visibilitychange', onVisible);
    if (flowPlacements.has(node.dataset.displayAd)) {
      if (win.ResizeObserver) {
        sizeObserver = new win.ResizeObserver(requestIfNear);
        sizeObserver.observe(node);
      }
      if (win.MutationObserver && node.parentElement) {
        visibilityObserver = new win.MutationObserver(requestIfNear);
        for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
          visibilityObserver.observe(ancestor, { attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
        }
      }
    }
    if (win.IntersectionObserver) {
      requestObserver = new win.IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.target === node && entry.isIntersecting)) request();
      }, { rootMargin: '240px 0px' });
      requestObserver.observe(node);
    } else request();
    cleanups.push(dispose);
  }
  return () => { for (const dispose of cleanups) dispose(); };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') mountDisplayAds();
