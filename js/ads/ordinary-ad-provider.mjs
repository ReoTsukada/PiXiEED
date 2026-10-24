import { ordinaryAdUnitIsConfigured } from './ordinary-ad-placement.mjs?rev=20261024-ordinary-ad-1';

const sdkByDocument = new WeakMap();

function loadSdk(doc, client) {
  let state = sdkByDocument.get(doc);
  if (state) return state;
  const source = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  state = new Promise((resolve, reject) => {
    let script = doc.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');
    if (script) { resolve(); return; }
    script = doc.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.ordinaryAdSdk = 'true';
    script.src = source;
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error('AdSense display SDK failed to load')), { once: true });
    doc.head.append(script);
  });
  sdkByDocument.set(doc, state); // Keep rejection cached: no automatic retries on this document.
  return state;
}

function nearViewport(slot, win) {
  const rect = slot?.getBoundingClientRect?.();
  return Boolean(rect && rect.width > 0 && rect.height > 0
    && rect.top < win.innerHeight + 240 && rect.bottom > -240
    && rect.left < win.innerWidth + 240 && rect.right > -240);
}

/** Constructing this provider is inert; each call returns its cleanup immediately. */
export function createAdSenseDisplayProvider({ doc = globalThis.document, win = globalThis.window, timeoutMs = 15000 } = {}) {
  return function requestDisplay(slot, { unit, placement = 'inline', eligibility = {}, onStatus = () => {} } = {}) {
    let topLevel = false;
    try { topLevel = win?.top === win?.self; } catch { /* framed */ }
    const origin = win?.location?.origin;
    const expectedPlacement = placement === 'inline' ? 'inline' : placement === 'gutter' ? 'gutter' : '';
    const contextAllowed = placement === 'inline'
      ? eligibility.publicFeed === true && eligibility.trustedContentEligible === true
        && eligibility.feedReady === true && eligibility.partialWarning === false
        && eligibility.loading === false && eligibility.empty === false
        && eligibility.privateView === false && eligibility.composerOpen === false
        && eligibility.detailOpen === false && eligibility.eligiblePostCount >= 24
      : placement === 'gutter' && eligibility.desktop === true
        && eligibility.gutterFits === true && eligibility.contentReady === true
        && eligibility.privateView === false && eligibility.composerOpen === false
        && eligibility.detailOpen === false && eligibility.loading === false;
    const allowed = doc?.createElement && doc.head && win && expectedPlacement
      && ordinaryAdUnitIsConfigured(unit) && unit.placement === placement
      && eligibility.productionOrigin === true && eligibility.topLevel === true
      && topLevel && ['https://pixieed.jp', 'https://www.pixieed.jp'].includes(origin)
      && contextAllowed && eligibility.fullscreen !== true && eligibility.editor !== true
      && slot?.isConnected === true;
    if (!allowed) { onStatus('failed'); return () => {}; }

    let disposed = false;
    let terminal = false;
    let requested = false;
    let ins = null;
    let statusObserver = null;
    let requestObserver = null;
    let resizeObserver = null;
    let timeout = null;
    let insRemoved = false;
    const removeIns = () => {
      if (insRemoved) return;
      insRemoved = true;
      ins?.remove?.();
    };
    const report = (status) => { try { onStatus(status); } catch { /* host callback does not own provider lifecycle */ } };
    const stillEligible = () => {
      let currentTopLevel = false;
      try { currentTopLevel = win.top === win.self; } catch { /* framed */ }
      return currentTopLevel && ['https://pixieed.jp', 'https://www.pixieed.jp'].includes(win.location?.origin)
        && !doc.fullscreenElement && !doc.body?.classList?.contains?.('creation-editor')
        && !doc.querySelector?.('#composerDialog[open], #detailDialog[open], #toolsDialog[open], #guestAccountDialog[open], [data-auth-dialog][open], .account-dialog[open]');
    };
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      clearTimeout(timeout);
      requestObserver?.disconnect();
      resizeObserver?.disconnect();
      statusObserver?.disconnect();
      doc.removeEventListener?.('visibilitychange', onVisibility);
      doc.removeEventListener?.('fullscreenchange', onContextChange);
      win.removeEventListener?.('pixieed:account-changed', onContextChange);
      removeIns();
    };
    const finish = (status) => {
      if (disposed || terminal) return;
      terminal = true;
      clearTimeout(timeout);
      statusObserver?.disconnect();
      if (status !== 'filled') removeIns();
      report(status);
    };
    const onVisibility = () => {
      if (!disposed && doc.visibilityState !== 'hidden' && nearViewport(slot, win)) request();
    };
    const onContextChange = () => {
      if (disposed || stillEligible()) return;
      terminal = true;
      cleanup();
      report('blocked');
    };
    const request = () => {
      if (disposed || terminal || requested || !slot.isConnected || doc.visibilityState === 'hidden' || !nearViewport(slot, win)) return;
      if (!stillEligible()) { finish('blocked'); return; }
      requested = true;
      requestObserver?.disconnect();
      resizeObserver?.disconnect();
      ins = doc.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.style.width = '100%';
      if (placement === 'gutter') ins.style.height = '600px';
      else ins.style.minHeight = '90px';
      ins.dataset.adClient = unit.client;
      ins.dataset.adSlot = String(unit.slot).trim();
      if (placement === 'inline') {
        ins.dataset.adFormat = 'auto';
        // Keep responsive creatives contained by the feed's measured card.
        ins.dataset.fullWidthResponsive = 'false';
      }
      slot.replaceChildren(ins);
      statusObserver = new win.MutationObserver(() => {
        if (!ins?.isConnected || disposed || terminal) return;
        const status = ins.dataset.adStatus || ins.dataset.adsbygoogleStatus;
        if (['filled', 'unfill-optimized'].includes(status)) finish('filled');
        else if (status === 'unfilled') finish('unfilled');
      });
      statusObserver.observe(ins, { attributes: true, attributeFilter: ['data-ad-status', 'data-adsbygoogle-status'] });
      timeout = setTimeout(() => finish('failed'), Math.max(1000, timeoutMs));
      void loadSdk(doc, unit.client).then(() => {
      if (disposed || terminal) return;
      if (!slot.isConnected || !ins?.isConnected || doc.visibilityState === 'hidden' || !nearViewport(slot, win) || !stillEligible()) { finish('blocked'); return; }
        (win.adsbygoogle = win.adsbygoogle || []).push({});
      }).catch(() => finish('failed'));
    };

    doc.addEventListener?.('visibilitychange', onVisibility);
    doc.addEventListener?.('fullscreenchange', onContextChange);
    win.addEventListener?.('pixieed:account-changed', onContextChange);
    if (typeof win.IntersectionObserver === 'function') {
      requestObserver = new win.IntersectionObserver((entries) => {
        if (entries.some(entry => entry.target === slot && entry.isIntersecting)) request();
      }, { rootMargin: '240px' });
      requestObserver.observe(slot);
    } else if (nearViewport(slot, win)) request();
    if (typeof win.ResizeObserver === 'function') {
      resizeObserver = new win.ResizeObserver(() => { if (!requested && nearViewport(slot, win)) request(); });
      resizeObserver.observe(slot);
    }
    return cleanup;
  };
}
