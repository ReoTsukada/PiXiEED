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
  let slotIndex = 0;

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

  function isReady(ins) {
    return ins.getAttribute('data-adsbygoogle-status') === 'done' ||
      ins.getAttribute('data-ad-status') === 'filled';
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

  function loadAd(ins) {
    if (!(ins instanceof HTMLElement)) return;
    if (ins.dataset.adsLazyLoaded === '1' || isReady(ins)) return;
    if (!isRenderable(ins)) return;
    assignSlot(ins);
    ins.dataset.adsLazyLoaded = 'pending';
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!isRenderable(ins)) {
          ins.dataset.adsLazyLoaded = '';
          return;
        }
        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          ins.dataset.adsLazyLoaded = '1';
        } catch (_error) {
          ins.dataset.adsLazyLoaded = '';
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
      childList: true,
      subtree: true
    });
  }
})();
