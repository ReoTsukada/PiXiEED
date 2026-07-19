(function() {
  window.PiXiEEDAdAccountControl?.refresh?.();
  if (window.location.protocol === 'file:') {
    window.pixieedObserveAds = function noopObserveAds() {};
    return;
  }

  if (window.__PIXIEED_ADS_DISABLED__ || window.__PIXIEED_AD_FREE_ACCOUNT__) return;
  if (window.pixieedObserveAds) return;

  const DEFAULT_INLINE_SLOT = '9073878884';
  const PAGE_SLOT_BY_PATH = Object.freeze({
    '/projects/pixiedraw/': '9073878884',
    '/projects/pixiee-lens/': '2261515379',
    '/projects/maoitu/': '9073878884',
    '/projects/qr-maker/': '2261515379',
  });
  let adsScriptPromise = null;
  let clampScheduled = false;
  const sizeObservers = new WeakMap();

  function normalizedPagePath() {
    const path = String(window.location.pathname || '/').toLowerCase();
    return path.endsWith('/index.html') ? path.slice(0, -'index.html'.length) : path;
  }

  function pageSlot() {
    return PAGE_SLOT_BY_PATH[normalizedPagePath()] || DEFAULT_INLINE_SLOT;
  }

  function ensureAdsScript() {
    if (window.PiXiEEDAdAccountControl) {
      return window.PiXiEEDAdAccountControl.loadAdsense().then((loaded) => {
        if (!loaded) throw new Error('ads disabled for this account');
      });
    }
    const existing = document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');
    if (existing && (window.__PIXIEED_ADSENSE_SCRIPT_READY__ === true
      || window.adsbygoogle?.loaded === true
      || document.querySelector('ins.adsbygoogle[data-adsbygoogle-status="done"]'))) {
      window.__PIXIEED_ADSENSE_SCRIPT_READY__ = true;
      return Promise.resolve();
    }
    if (adsScriptPromise) return adsScriptPromise;
    adsScriptPromise = new Promise((resolve, reject) => {
      const script = existing || document.createElement('script');
      const handleLoad = () => {
        window.__PIXIEED_ADSENSE_SCRIPT_READY__ = true;
        resolve();
      };
      const handleError = () => {
        adsScriptPromise = null;
        reject(new Error('adsbygoogle script failed to load'));
      };
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9801602250480253';
      script.addEventListener('load', handleLoad, { once: true });
      script.addEventListener('error', handleError, { once: true });
      if (!existing) {
        document.head.appendChild(script);
      }
    });
    return adsScriptPromise;
  }

  function isReady(ins) {
    return ins.getAttribute('data-adsbygoogle-status') === 'done' ||
      ['filled', 'unfilled', 'unfill-optimized'].includes(String(ins.getAttribute('data-ad-status') || '').toLowerCase());
  }

  function needsInlineAdGuard() {
    return Boolean(document.querySelector('.home-app, .project-live-tool'));
  }

  function contentWidth() {
    const body = document.body;
    if (!(body instanceof HTMLElement)) return window.innerWidth || 0;
    const styles = window.getComputedStyle(body);
    const left = Number.parseFloat(styles.paddingLeft) || 0;
    const right = Number.parseFloat(styles.paddingRight) || 0;
    return Math.max(1, Math.floor((window.innerWidth || body.clientWidth || 0) - left - right));
  }

  function injectInlineAdGuardStyle() {
    if (!needsInlineAdGuard() || document.getElementById('pixieed-inline-ad-guard')) return;
    document.body?.classList.add('pixieed-inline-ad-guard');
    const style = document.createElement('style');
    style.id = 'pixieed-inline-ad-guard';
    style.textContent = `
      body.pixieed-inline-ad-guard{
        max-inline-size:100dvw !important;
        overflow-x:clip !important;
      }
      body.pixieed-inline-ad-guard .page,
      body.pixieed-inline-ad-guard .page-shell,
      body.pixieed-inline-ad-guard .home-screen,
      body.pixieed-inline-ad-guard .home-panel,
      body.pixieed-inline-ad-guard .home-hero-card,
      body.pixieed-inline-ad-guard .section,
      body.pixieed-inline-ad-guard .section__inner,
      body.pixieed-inline-ad-guard .ad-banner{
        max-inline-size:100% !important;
        min-inline-size:0 !important;
        overflow-x:clip !important;
      }
      body.pixieed-inline-ad-guard ins.adsbygoogle,
      body.pixieed-inline-ad-guard .adsbygoogle,
      body.pixieed-inline-ad-guard .google-auto-placed,
      body.pixieed-inline-ad-guard iframe[id^="google_ads_iframe"],
      body.pixieed-inline-ad-guard iframe[name^="google_ads_iframe"],
      body.pixieed-inline-ad-guard iframe[id^="aswift_"],
      body.pixieed-inline-ad-guard iframe[name^="aswift_"]{
        inline-size:100% !important;
        max-inline-size:100% !important;
        min-inline-size:0 !important;
        box-sizing:border-box !important;
        overflow:hidden !important;
      }
      body.pixieed-inline-ad-guard .ad-banner ins.adsbygoogle{
        margin-inline:0 !important;
      }
      body.pixieed-inline-ad-guard .ad-banner ins.adsbygoogle > div,
      body.pixieed-inline-ad-guard .ad-banner ins.adsbygoogle > div > iframe{
        inline-size:100% !important;
        max-inline-size:100% !important;
        min-inline-size:0 !important;
        box-sizing:border-box !important;
        margin-inline:0 !important;
        overflow:hidden !important;
      }
      body.pixieed-inline-ad-guard > ins.adsbygoogle,
      body.pixieed-inline-ad-guard > .adsbygoogle,
      body.pixieed-inline-ad-guard > .google-auto-placed{
        inline-size:calc(100dvw - 28px) !important;
        max-inline-size:calc(100dvw - 28px) !important;
        margin-inline:auto !important;
      }
    `;
    document.head.appendChild(style);
  }

  function isAdNode(node) {
    if (!(node instanceof HTMLElement)) return false;
    return node.matches([
      'ins.adsbygoogle',
      '.adsbygoogle',
      '.google-auto-placed',
      'iframe[id^="google_ads_iframe"]',
      'iframe[name^="google_ads_iframe"]',
      'iframe[id^="aswift_"]',
      'iframe[name^="aswift_"]'
    ].join(','));
  }

  function clampElement(el) {
    if (!(el instanceof HTMLElement)) return;
    const frame = el.closest('.home-hero-ad__frame, .ad-footer, .page, .home-app, body');
    const frameRect = frame instanceof HTMLElement ? frame.getBoundingClientRect() : null;
    const max = Math.max(1, Math.floor(Math.min(frameRect?.width || contentWidth(), contentWidth())));
    const isFrame = el.tagName === 'IFRAME';
    const parentIsBody = el.parentElement === document.body;
    el.style.maxWidth = `${max}px`;
    el.style.minWidth = '0';
    el.style.boxSizing = 'border-box';
    el.style.overflow = 'hidden';
    if (isFrame) {
      el.style.width = '100%';
    } else if (parentIsBody || el.classList.contains('google-auto-placed')) {
      el.style.width = `${max}px`;
      el.style.marginLeft = 'auto';
      el.style.marginRight = 'auto';
    } else {
      el.style.width = '100%';
    }
  }

  function clampInlineAds(root) {
    if (!needsInlineAdGuard()) return;
    injectInlineAdGuardStyle();
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    if (isAdNode(scope)) clampElement(scope);
    scope.querySelectorAll?.([
      'ins.adsbygoogle',
      '.adsbygoogle',
      '.google-auto-placed',
      'iframe[id^="google_ads_iframe"]',
      'iframe[name^="google_ads_iframe"]',
      'iframe[id^="aswift_"]',
      'iframe[name^="aswift_"]'
    ].join(',')).forEach(clampElement);
  }

  function scheduleClamp(root) {
    if (!needsInlineAdGuard()) return;
    if (clampScheduled) return;
    clampScheduled = true;
    window.requestAnimationFrame(() => {
      clampScheduled = false;
      clampInlineAds(root || document);
    });
  }

  function isRenderable(ins) {
    if (!(ins instanceof HTMLElement)) return false;
    if (ins.closest('[hidden]')) return false;
    const heroSlide = ins.closest('.home-hero-slide');
    if (heroSlide instanceof HTMLElement && !heroSlide.classList.contains('is-active')) {
      return false;
    }
    if (ins.offsetParent === null && getComputedStyle(ins).position !== 'fixed') {
      return false;
    }
    const rect = ins.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      return false;
    }
    return true;
  }

  function assignSlot(ins) {
    if (!(ins instanceof HTMLElement)) return;
    if (ins.dataset.adSlotAssigned === '1') return;
    const existingSlot = ins.getAttribute('data-ad-slot');
    if (existingSlot && existingSlot !== 'rotate') {
      ins.dataset.adSlotAssigned = '1';
      return;
    }
    const slot = pageSlot();
    if (slot) {
      ins.setAttribute('data-ad-slot', slot);
    }
    ins.dataset.adSlotAssigned = '1';
  }

  function stopSizeObserver(ins) {
    sizeObservers.get(ins)?.disconnect();
    sizeObservers.delete(ins);
  }

  function waitForRenderableSize(ins) {
    if (!(ins instanceof HTMLElement) || typeof ResizeObserver !== 'function' || sizeObservers.has(ins)) return;
    const observer = new ResizeObserver(() => {
      if (!ins.isConnected) {
        stopSizeObserver(ins);
        return;
      }
      if (!isRenderable(ins)) return;
      stopSizeObserver(ins);
      loadAd(ins);
    });
    sizeObservers.set(ins, observer);
    observer.observe(ins);
    if (ins.parentElement) observer.observe(ins.parentElement);
  }

  function syncAdOutcome(ins) {
    if (!(ins instanceof HTMLElement)) return;
    const status = String(ins.getAttribute('data-ad-status') || '').toLowerCase();
    if (status === 'filled') ins.dataset.adsRequestState = 'filled';
    else if (status === 'unfilled') ins.dataset.adsRequestState = 'unfilled';
    else if (status === 'unfill-optimized') ins.dataset.adsRequestState = 'optimized';
    else if (ins.getAttribute('data-adsbygoogle-status') === 'done') ins.dataset.adsRequestState = 'requested';
    window.PiXiEEDAdAccountControl?.syncAdFallback?.(ins);
  }

  async function loadAd(ins) {
    if (!(ins instanceof HTMLElement)) return;
    syncAdOutcome(ins);
    if (['pending', '1'].includes(ins.dataset.adsLazyLoaded)
      || ['requested', 'filled', 'unfilled', 'optimized', 'push-failed'].includes(ins.dataset.adsRequestState)
      || isReady(ins)) return;
    if (ins.dataset.adsScriptBlocked === '1') return;
    if (!isRenderable(ins)) {
      waitForRenderableSize(ins);
      return;
    }
    stopSizeObserver(ins);
    assignSlot(ins);
    ins.dataset.adsLazyLoaded = 'pending';
    try {
      await ensureAdsScript();
    } catch (_error) {
      ins.dataset.adsLazyLoaded = '';
      ins.dataset.adsScriptBlocked = '1';
      window.PiXiEEDAdAccountControl?.syncAdFallback?.(ins);
      return;
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!isRenderable(ins)) {
          ins.dataset.adsLazyLoaded = '';
          waitForRenderableSize(ins);
          return;
        }
        ins.dataset.adsRequestState = 'requested';
        ins.dataset.adsLazyLoaded = '1';
        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (_error) {
          if (isReady(ins)) {
            syncAdOutcome(ins);
            return;
          }
          ins.dataset.adsRequestState = 'push-failed';
          window.PiXiEEDAdAccountControl?.syncAdFallback?.(ins);
        }
      });
    });
  }

  function observeAds(root) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    clampInlineAds(scope);
    scope.querySelectorAll('ins.adsbygoogle').forEach(loadAd);
  }

  function refreshAdsAfterLifecycleResume(root, options = {}) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    if (options.allowScriptRetry) {
      scope.querySelectorAll('ins.adsbygoogle[data-ads-script-blocked="1"]').forEach((ins) => {
        delete ins.dataset.adsScriptBlocked;
      });
    }
    window.requestAnimationFrame(() => {
      observeAds(scope);
      scheduleClamp(scope);
    });
  }

  window.pixieedObserveAds = observeAds;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => observeAds(document));
  } else {
    observeAds(document);
  }

  window.addEventListener('pageshow', () => {
    refreshAdsAfterLifecycleResume(document);
  });
  window.addEventListener('focus', () => {
    refreshAdsAfterLifecycleResume(document);
  });
  window.addEventListener('online', () => {
    adsScriptPromise = null;
    refreshAdsAfterLifecycleResume(document, { allowScriptRetry: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshAdsAfterLifecycleResume(document);
    }
  });

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement && mutation.target.matches('ins.adsbygoogle')) {
        scheduleClamp(mutation.target);
        syncAdOutcome(mutation.target);
        if (!isReady(mutation.target)) loadAd(mutation.target);
        return;
      }
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement && isAdNode(mutation.target)) {
        scheduleClamp(mutation.target);
        return;
      }
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        scheduleClamp(node);
        if (node.matches('ins.adsbygoogle')) {
          loadAd(node);
          return;
        }
        if (typeof node.querySelectorAll === 'function') {
          node.querySelectorAll('ins.adsbygoogle').forEach(loadAd);
        }
      });
    });
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-ad-status', 'data-adsbygoogle-status', 'class', 'style', 'id', 'name'],
      childList: true,
      subtree: true
    });
  }

  window.addEventListener('resize', () => scheduleClamp(document), { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => scheduleClamp(document), { passive: true });
  }
  document.addEventListener('pixieed:ad-account-state', (event) => {
    if (event.detail?.disabled === true) {
      document.querySelectorAll('ins.adsbygoogle').forEach(syncAdOutcome);
      return;
    }
    document.querySelectorAll('ins.adsbygoogle[data-ads-script-blocked="1"]').forEach((ins) => {
      delete ins.dataset.adsScriptBlocked;
    });
    refreshAdsAfterLifecycleResume(document);
  });
})();
