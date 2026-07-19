(function () {
  'use strict';

  if (window.PiXiEEDMarketAds) return;

  const CLIENT = 'ca-pub-9801602250480253';
  const LIST_SLOT = '5001430253';
  const DETAIL_SLOT = '9279466474';
  const observedSlots = new WeakSet();
  const resizeObservers = new WeakMap();

  function adsDisabled() {
    window.PiXiEEDAdAccountControl?.refresh?.();
    return Boolean(window.__PIXIEED_ADS_DISABLED__ || window.__PIXIEED_AD_FREE_ACCOUNT__);
  }

  function createSlot(kind, slotId) {
    const wrapper = document.createElement('aside');
    wrapper.className = `market-ad market-ad--${kind}`;
    wrapper.dataset.marketAdSlot = slotId;
    wrapper.setAttribute('aria-label', '広告');

    const label = document.createElement('small');
    label.className = 'market-ad__label';
    label.textContent = '広告';

    const slot = document.createElement('ins');
    slot.className = 'adsbygoogle';
    slot.style.display = 'block';
    slot.dataset.adClient = CLIENT;
    slot.dataset.adSlot = slotId;
    slot.dataset.adFormat = 'auto';
    slot.dataset.fullWidthResponsive = 'true';
    wrapper.append(label, slot);
    return wrapper;
  }

  function stopResizeObserver(slot) {
    resizeObservers.get(slot)?.disconnect();
    resizeObservers.delete(slot);
  }

  function waitForUsableWidth(slot, retry) {
    if (typeof ResizeObserver !== 'function' || resizeObservers.has(slot)) return;
    const observer = new ResizeObserver(() => {
      if (!slot.isConnected || slot.getBoundingClientRect().width < 1) return;
      stopResizeObserver(slot);
      retry();
    });
    resizeObservers.set(slot, observer);
    observer.observe(slot);
    if (slot.parentElement) observer.observe(slot.parentElement);
  }

  async function renderSlot(wrapper) {
    if (!(wrapper instanceof HTMLElement) || !wrapper.isConnected || wrapper.hidden) return;
    const slot = wrapper.querySelector('ins.adsbygoogle');
    if (!(slot instanceof HTMLElement)
      || slot.dataset.marketAdPushed === 'true'
      || slot.getAttribute('data-adsbygoogle-status') === 'done') return;

    if (adsDisabled()) {
      wrapper.hidden = true;
      return;
    }
    if (window.location.protocol === 'file:') {
      wrapper.classList.add('is-local-preview');
      return;
    }

    const width = Math.min(
      slot.getBoundingClientRect().width,
      slot.parentElement?.getBoundingClientRect().width || 0
    );
    if (width < 1) {
      waitForUsableWidth(slot, () => renderSlot(wrapper));
      return;
    }

    const loaded = window.PiXiEEDAdAccountControl
      ? await window.PiXiEEDAdAccountControl.loadAdsense()
      : false;
    if (!loaded) {
      slot.dataset.adsScriptBlocked = '1';
      window.PiXiEEDAdAccountControl?.syncAdFallback?.(slot);
      return;
    }
    if (adsDisabled() || !slot.isConnected || slot.getBoundingClientRect().width < 1) return;

    delete slot.dataset.adsScriptBlocked;
    slot.dataset.adsRequestState = 'requested';
    slot.dataset.marketAdPushed = 'true';
    stopResizeObserver(slot);
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch (_error) {
      delete slot.dataset.marketAdPushed;
      slot.dataset.adsRequestState = 'push-failed';
      window.PiXiEEDAdAccountControl?.syncAdFallback?.(slot);
    }
  }

  function observe(wrapper) {
    if (!(wrapper instanceof HTMLElement) || observedSlots.has(wrapper)) return wrapper;
    if (adsDisabled()) {
      wrapper.hidden = true;
      return wrapper;
    }
    observedSlots.add(wrapper);
    if (window.location.protocol === 'file:') {
      window.requestAnimationFrame(() => renderSlot(wrapper));
      return wrapper;
    }
    if (typeof IntersectionObserver !== 'function') {
      window.requestAnimationFrame(() => renderSlot(wrapper));
      return wrapper;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      renderSlot(wrapper);
    }, { rootMargin: '600px 0px' });
    observer.observe(wrapper);
    return wrapper;
  }

  function createListAd() {
    return observe(createSlot('list', LIST_SLOT));
  }

  function showDetailAd() {
    const wrapper = document.getElementById('marketItemAd');
    if (!(wrapper instanceof HTMLElement) || wrapper.dataset.marketAdSlot !== DETAIL_SLOT) return;
    wrapper.hidden = adsDisabled();
    if (!wrapper.hidden) observe(wrapper);
  }

  document.addEventListener('pixieed:ad-account-state', (event) => {
    const disabled = event.detail?.disabled === true;
    document.querySelectorAll('[data-market-ad-slot]').forEach((wrapper) => {
      wrapper.hidden = disabled;
      if (!disabled) {
        if (observedSlots.has(wrapper)) renderSlot(wrapper);
        else observe(wrapper);
      }
    });
  });

  window.addEventListener('online', () => {
    document.querySelectorAll('[data-market-ad-slot]').forEach((wrapper) => renderSlot(wrapper));
  });

  window.addEventListener('pageshow', () => {
    document.querySelectorAll('[data-market-ad-slot]').forEach((wrapper) => renderSlot(wrapper));
  });

  window.PiXiEEDMarketAds = Object.freeze({ createListAd, showDetailAd });
})();
