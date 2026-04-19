(function() {
  if (window.location.protocol === 'file:') {
    window.pixieedObserveAds = function noopObserveAds() {};
    return;
  }

  try {
    const pathname = String(window.location.pathname || '').toLowerCase();
    const isPixieedrawPage = /(?:^|\/)pixiedraw(?:\/|\/index\.html)?$/.test(pathname);
    const raw = window.localStorage.getItem('pixieed_browser_adfree_cache_v1');
    if (raw) {
      const cached = JSON.parse(raw);
      const entitlements = cached?.entitlements;
      const keys = isPixieedrawPage ? ['browser_ad_free', 'pixiedraw_ad_free'] : ['browser_ad_free'];
      const hasScopedEntitlement = keys.some(key => {
        const expiresAt = typeof entitlements?.[key]?.expiresAt === 'string' ? entitlements[key].expiresAt : '';
        return entitlements?.[key] && (!expiresAt || Date.parse(expiresAt) > Date.now());
      });
      const legacyActive = cached?.active === true && (!cached?.expiresAt || Date.parse(cached.expiresAt) > Date.now());
      if (legacyActive || hasScopedEntitlement) {
        window.__PIXIEED_ADS_DISABLED__ = true;
      }
    }
  } catch (_error) {}
  if (window.__PIXIEED_ADS_DISABLED__ || window.pixieedAdFree?.state?.isActive) return;
  if (window.pixieedObserveAds) return;

  const SLOT_SEQUENCE = ['2141591954', '9073878884', '2261515379'];
  const SLOT_KEY = 'pixieedAdSlotIndex';
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 2500;
  let slotIndex = 0;
  let adsScriptPromise = null;

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
    scope.querySelectorAll('ins.adsbygoogle').forEach(loadAd);
  }

  window.pixieedObserveAds = observeAds;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => observeAds(document));
  } else {
    observeAds(document);
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement && mutation.target.matches('ins.adsbygoogle')) {
        if (isUnfilled(mutation.target)) {
          queueRetry(mutation.target);
        }
        return;
      }
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
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
      attributeFilter: ['data-ad-status', 'data-adsbygoogle-status', 'class'],
      childList: true,
      subtree: true
    });
  }
})();
