(function() {
  window.PiXiEEDAdAccountControl?.refresh?.();
  if (window.location.protocol === 'file:') {
    window.pixieedObserveAds = function noopObserveAds() {};
    return;
  }

  if (window.__PIXIEED_ADS_DISABLED__ || window.__PIXIEED_AD_FREE_ACCOUNT__) return;
  if (window.pixieedObserveAds) return;

  const SLOT_SEQUENCE = ['2141591954', '9073878884', '2261515379'];
  const SLOT_KEY = 'pixieedAdSlotIndex';
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2500;
  let slotIndex = 0;
  let adsScriptPromise = null;
  let clampScheduled = false;

  try {
    const stored = sessionStorage.getItem(SLOT_KEY);
    if (stored !== null) {
      slotIndex = Number(stored) || 0;
    }
  } catch (_error) {}

  function storeSlotIndex() {
    try {
      sessionStorage.setItem(SLOT_KEY, String(slotIndex));
    } catch (_error) {}
  }

  function nextSlot() {
    if (!SLOT_SEQUENCE.length) return '';
    const slot = SLOT_SEQUENCE[slotIndex % SLOT_SEQUENCE.length];
    slotIndex += 1;
    storeSlotIndex();
    return slot;
  }

  function ensureAdsScript() {
    if (window.PiXiEEDAdAccountControl) {
      return window.PiXiEEDAdAccountControl.loadAdsense().then((loaded) => {
        if (!loaded) throw new Error('ads disabled for this account');
      });
    }
    const existing = document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');
    if (existing?.dataset.pixieedReady === '1') {
      return Promise.resolve();
    }
    if (adsScriptPromise) return adsScriptPromise;
    adsScriptPromise = new Promise((resolve, reject) => {
      const script = existing || document.createElement('script');
      const handleLoad = () => {
        script.dataset.pixieedReady = '1';
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
      ins.getAttribute('data-ad-status') === 'filled';
  }

  function isUnfilled(ins) {
    return ins.getAttribute('data-ad-status') === 'unfilled';
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
    const slot = nextSlot();
    if (slot) {
      ins.setAttribute('data-ad-slot', slot);
    }
    ins.dataset.adSlotAssigned = '1';
  }

  function queueRetry(ins) {
    if (!(ins instanceof HTMLElement)) return;
    if (isReady(ins)) return;
    if (ins.dataset.adsRetryQueued === '1') return;
    const attempts = Number(ins.dataset.adsAttemptCount || '0');
    if (attempts >= MAX_RETRIES) return;
    ins.dataset.adsRetryQueued = '1';
    window.setTimeout(() => {
      ins.dataset.adsRetryQueued = '';
      if (isReady(ins)) return;
      if (isUnfilled(ins)) {
        ins.removeAttribute('data-ad-status');
      }
      ins.dataset.adsLazyLoaded = '';
      loadAd(ins);
    }, RETRY_DELAY_MS);
  }

  async function loadAd(ins) {
    if (!(ins instanceof HTMLElement)) return;
    if (ins.dataset.adsLazyLoaded === '1' || isReady(ins)) return;
    if (!isRenderable(ins)) return;
    const attempts = Number(ins.dataset.adsAttemptCount || '0');
    if (attempts >= MAX_RETRIES) return;
    assignSlot(ins);
    ins.dataset.adsLazyLoaded = 'pending';
    ins.dataset.adsAttemptCount = String(attempts + 1);
    try {
      await ensureAdsScript();
    } catch (_error) {
      ins.dataset.adsLazyLoaded = '';
      queueRetry(ins);
      return;
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!isRenderable(ins)) {
          ins.dataset.adsLazyLoaded = '';
          return;
        }
        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          ins.dataset.adsLazyLoaded = '1';
          queueRetry(ins);
        } catch (_error) {
          ins.dataset.adsLazyLoaded = '';
          queueRetry(ins);
        }
      });
    });
  }

  function observeAds(root) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    clampInlineAds(scope);
    scope.querySelectorAll('ins.adsbygoogle').forEach(loadAd);
  }

  function refreshAdsAfterLifecycleResume(root) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
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
    refreshAdsAfterLifecycleResume(document);
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
        if (isUnfilled(mutation.target)) {
          queueRetry(mutation.target);
        }
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
})();
