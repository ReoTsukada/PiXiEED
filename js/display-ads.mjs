import { displayAdConfig } from '../data/site-config.js?rev=20261001-free-tools-1';

// Explicit page ownership prevents accidental ads in editors, private pages or embedded tools.
const placements = new Map([
  ['home', ['/']], ['tools', ['/tools/']], ['info', ['/about/', '/guide/']],
  ['stores', ['/stores/']], ['store-detail', ['/stores/ecowashcafe-nakanoshima.html']],
  ['camera-result', ['/pixel-camera.html']], ['draw-result', ['/draw/']],
  ['audio-result', ['/audio/']], ['jigsaw-result', ['/jigsaw/']],
  ['spot-result', ['/play/spot-difference/']], ['find-result', ['/play/hidden-object/']]
]);
const mounted = new WeakSet();

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
    if (!resolved) continue;
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
    let emptyObserver;
    let statusObserver;
    const script = doc.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');
    function dispose() {
      requestObserver?.disconnect();
      emptyObserver?.disconnect();
      statusObserver?.disconnect();
      script?.removeEventListener('error', markEmpty);
      doc.removeEventListener('visibilitychange', onVisible);
    }
    function collapseEmpty() {
      // Filled creatives, including Google's optimized unfilled units, must remain untouched.
      if (['filled', 'unfill-optimized'].includes(unit.dataset.adStatus)) { dispose(); return; }
      node.hidden = true;
      node.dataset.adState = 'empty';
      requestObserver?.disconnect();
      emptyObserver?.disconnect();
      script?.removeEventListener('error', markEmpty);
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
      if (queued || node.hidden || doc.visibilityState === 'hidden' || unit.getBoundingClientRect().width <= 0) return;
      queued = true;
      node.dataset.adState = 'requested';
      requestObserver?.disconnect();
      try { (win.adsbygoogle = win.adsbygoogle || []).push({}); }
      catch { markEmpty(); }
    }
    function onVisible() {
      if (doc.visibilityState !== 'hidden' && !queued) {
        const bounds = node.getBoundingClientRect();
        if (bounds.top < win.innerHeight + 240 && bounds.bottom > -240) request();
      }
    }
    statusObserver = new win.MutationObserver(() => {
      if (unit.dataset.adStatus === 'unfilled') markEmpty();
      else if (['filled', 'unfill-optimized'].includes(unit.dataset.adStatus)) {
        node.hidden = false;
        node.dataset.adState = 'filled'; dispose();
      }
    });
    statusObserver.observe(unit, { attributes: true, attributeFilter: ['data-ad-status'] });
    script?.addEventListener('error', markEmpty, { once: true });
    doc.addEventListener('visibilitychange', onVisible);
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
