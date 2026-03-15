(function() {
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
    assignSlot(ins);
    ins.dataset.adsLazyLoaded = '1';
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (_error) {
      ins.dataset.adsLazyLoaded = '';
    }
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
