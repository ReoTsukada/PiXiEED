(function () {
  function setupMobileInputViewportGuard() {
    if (window.__PIXIEED_MOBILE_INPUT_GUARD_BOUND__) {
      return;
    }
    window.__PIXIEED_MOBILE_INPUT_GUARD_BOUND__ = true;

    const body = document.body;
    const root = document.documentElement;
    if (!(body instanceof HTMLElement) || !(root instanceof HTMLElement)) {
      return;
    }

    const styleId = 'pixieed-mobile-input-guard-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        :root{
          --pixieed-keyboard-inset:0px;
        }
        html{
          scroll-padding-bottom:calc(env(safe-area-inset-bottom, 0px) + var(--pixieed-keyboard-inset, 0px) + 20px);
        }
        input,
        textarea,
        select,
        [contenteditable="true"],
        [contenteditable=""],
        [contenteditable]{
          scroll-margin-bottom:calc(var(--pixieed-keyboard-inset, 0px) + 24px);
        }
        body.is-soft-keyboard-open{
          overscroll-behavior-y:contain;
        }
        body.is-soft-keyboard-open .bottom-nav,
        body.is-soft-keyboard-open .ad-footer{
          opacity:0 !important;
          pointer-events:none !important;
          transform:translateY(calc(100% + 20px)) !important;
          transition:opacity 140ms ease, transform 180ms ease;
        }
      `;
      document.head.appendChild(style);
    }

    const isCoarsePointerDevice = () => {
      if (typeof window.matchMedia !== 'function') {
        return false;
      }
      try {
        return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches;
      } catch (_error) {
        return false;
      }
    };

    const isSoftKeyboardInputTarget = target => {
      if (!(target instanceof Element)) {
        return false;
      }
      if (target instanceof HTMLTextAreaElement) {
        return true;
      }
      if (target instanceof HTMLInputElement) {
        const type = String(target.type || 'text').toLowerCase();
        return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
      }
      return Boolean(target.isContentEditable);
    };

    const getScrollableAncestor = node => {
      let current = node instanceof Element ? node : null;
      while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY;
        const canScroll = (overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight + 1;
        if (canScroll) {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    };

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    let baselineViewportHeight = 0;
    let keyboardLikelyOpen = false;
    let alignTimer = null;
    let viewportTickRaf = null;

    const getViewportMetrics = () => {
      const viewport = window.visualViewport;
      const top = Math.round(Number(viewport?.offsetTop) || 0);
      const height = Math.max(0, Math.round(Number(viewport?.height) || Number(window.innerHeight) || 0));
      return {
        top,
        height,
        bottom: top + height,
      };
    };

    const updateBaselineViewportHeight = () => {
      if (isSoftKeyboardInputTarget(document.activeElement)) {
        return;
      }
      const viewport = window.visualViewport;
      const candidate = Math.max(
        0,
        Math.round(
          Math.max(
            Number(viewport?.height) || 0,
            Number(window.innerHeight) || 0
          )
        )
      );
      if (candidate > 0) {
        baselineViewportHeight = candidate;
      }
    };

    const computeKeyboardInset = () => {
      const viewport = window.visualViewport;
      const viewportHeight = Math.max(0, Math.round(Number(viewport?.height) || Number(window.innerHeight) || 0));
      const baseline = Math.max(
        baselineViewportHeight || 0,
        Math.round(Number(window.innerHeight) || 0),
        viewportHeight
      );
      if (baseline <= 0 || viewportHeight <= 0) {
        return 0;
      }
      return Math.max(0, baseline - viewportHeight);
    };

    const isVirtualKeyboardLikelyOpen = () => {
      const active = document.activeElement;
      if (!isCoarsePointerDevice() || !isSoftKeyboardInputTarget(active)) {
        return false;
      }
      const viewport = window.visualViewport;
      const viewportHeight = Math.max(0, Math.round(Number(viewport?.height) || Number(window.innerHeight) || 0));
      const innerHeight = Math.max(0, Math.round(Number(window.innerHeight) || 0));
      const baseline = Math.max(baselineViewportHeight || 0, innerHeight);
      if (viewportHeight <= 0 || innerHeight <= 0 || baseline <= 0) {
        return false;
      }
      const baselineLoss = baseline - viewportHeight;
      const innerLoss = innerHeight - viewportHeight;
      return (
        (baselineLoss > 84 && viewportHeight < baseline * 0.92)
        || (innerLoss > 110 && viewportHeight < innerHeight * 0.9)
      );
    };

    const alignFocusedInput = ({ force = false } = {}) => {
      if (!isCoarsePointerDevice()) {
        return;
      }
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !isSoftKeyboardInputTarget(active)) {
        return;
      }
      if (!force && !keyboardLikelyOpen) {
        return;
      }
      const viewport = getViewportMetrics();
      if (viewport.height <= 0) {
        return;
      }
      const rect = active.getBoundingClientRect();
      if (!Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)) {
        return;
      }
      const margin = Math.max(14, Math.min(28, Math.round(viewport.height * 0.08)));
      let deltaY = 0;
      if (rect.bottom > viewport.bottom - margin) {
        deltaY = rect.bottom - (viewport.bottom - margin);
      } else if (rect.top < viewport.top + margin) {
        deltaY = rect.top - (viewport.top + margin);
      }
      if (Math.abs(deltaY) <= 4) {
        return;
      }
      const container = getScrollableAncestor(active);
      if (container instanceof HTMLElement) {
        const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
        const nextScrollTop = clamp(container.scrollTop + deltaY, 0, maxScrollTop);
        if (Math.abs(nextScrollTop - container.scrollTop) > 1) {
          container.scrollTop = nextScrollTop;
        }
        return;
      }
      const rootScroll = document.scrollingElement;
      if (rootScroll) {
        const maxScrollTop = Math.max(0, rootScroll.scrollHeight - rootScroll.clientHeight);
        const nextScrollTop = clamp(rootScroll.scrollTop + deltaY, 0, maxScrollTop);
        if (Math.abs(nextScrollTop - rootScroll.scrollTop) > 1) {
          rootScroll.scrollTop = nextScrollTop;
        }
      }
    };

    const syncKeyboardState = () => {
      keyboardLikelyOpen = isVirtualKeyboardLikelyOpen();
      const inset = keyboardLikelyOpen ? computeKeyboardInset() : 0;
      root.style.setProperty('--pixieed-keyboard-inset', `${inset}px`);
      body.classList.toggle('is-soft-keyboard-open', keyboardLikelyOpen);
      if (!keyboardLikelyOpen) {
        updateBaselineViewportHeight();
      }
    };

    const scheduleAlign = ({ delay = 0, force = false } = {}) => {
      if (alignTimer !== null) {
        window.clearTimeout(alignTimer);
        alignTimer = null;
      }
      alignTimer = window.setTimeout(() => {
        alignTimer = null;
        syncKeyboardState();
        alignFocusedInput({ force });
      }, Math.max(0, Math.round(Number(delay) || 0)));
    };

    const handleViewportChange = () => {
      if (viewportTickRaf !== null) {
        window.cancelAnimationFrame(viewportTickRaf);
        viewportTickRaf = null;
      }
      viewportTickRaf = window.requestAnimationFrame(() => {
        viewportTickRaf = null;
        syncKeyboardState();
        if (isSoftKeyboardInputTarget(document.activeElement)) {
          alignFocusedInput();
        }
      });
    };

    document.addEventListener('focusin', event => {
      if (!isCoarsePointerDevice() || !isSoftKeyboardInputTarget(event.target)) {
        return;
      }
      syncKeyboardState();
      scheduleAlign({ delay: 90, force: true });
      window.setTimeout(() => alignFocusedInput({ force: true }), 220);
      window.setTimeout(() => alignFocusedInput({ force: true }), 360);
    }, true);

    document.addEventListener('focusout', event => {
      if (!isCoarsePointerDevice() || !isSoftKeyboardInputTarget(event.target)) {
        return;
      }
      window.setTimeout(() => {
        if (!isSoftKeyboardInputTarget(document.activeElement)) {
          syncKeyboardState();
        }
      }, 180);
    }, true);

    window.addEventListener('resize', handleViewportChange, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange, { passive: true });
      window.visualViewport.addEventListener('scroll', handleViewportChange, { passive: true });
    }
    window.addEventListener('orientationchange', () => {
      baselineViewportHeight = 0;
      window.setTimeout(() => {
        syncKeyboardState();
        alignFocusedInput({ force: true });
      }, 220);
    }, { passive: true });

    updateBaselineViewportHeight();
    syncKeyboardState();
  }

  function ensureAdsScript() {
    const existing = document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');
    if (existing) return;
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9801602250480253';
    document.head.appendChild(script);
  }

  function injectFooterAd() {
    const bottomNav = document.querySelector('.bottom-nav');
    if (!bottomNav) return;
    if (document.querySelector('.ad-footer')) return;

    const styleId = 'pixieed-ad-footer-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        :root{
          --pixieed-page-gutter:0px;
          --pixieed-layout-max-width:100vw;
          --pixieed-footer-ad-height:clamp(40px, 6.4vw, 52px);
          --pixieed-footer-ad-offset:calc(var(--pixieed-footer-ad-height) + 10px + env(safe-area-inset-bottom, 0px));
          --pixieed-footer-ad-bg:rgba(11,18,36,0.96);
        }
        @media (orientation: landscape){
          :root{
            --pixieed-page-gutter:clamp(18px, 3.6vw, 56px);
            --pixieed-layout-max-width:1160px;
          }
        }
        @media (min-width: 980px) and (orientation: landscape){
          :root{
            --pixieed-page-gutter:clamp(40px, 6vw, 128px);
            --pixieed-layout-max-width:1040px;
            --pixieed-footer-ad-height:44px;
            --pixieed-footer-ad-offset:calc(var(--pixieed-footer-ad-height) + 8px + env(safe-area-inset-bottom, 0px));
          }
        }
        body.has-footer-ad > .page,
        body.has-footer-ad > main{
          width:min(var(--pixieed-layout-max-width), calc(100vw - (var(--pixieed-page-gutter) * 2)));
          max-width:100%;
          margin-left:auto !important;
          margin-right:auto !important;
        }
        body.has-footer-ad > .page > header,
        body.has-footer-ad > .page > .top-nav,
        body.has-footer-ad > .page > [aria-label="top-nav"]{
          width:100vw;
          max-width:100vw !important;
          margin-left:calc(50% - 50vw) !important;
          margin-right:calc(50% - 50vw) !important;
        }
        body.has-footer-ad .bottom-nav{
          bottom:var(--pixieed-footer-ad-offset) !important;
          height:60px !important;
          padding:6px max(10px, env(safe-area-inset-right, 0px)) calc(6px + env(safe-area-inset-bottom, 0px)) max(10px, env(safe-area-inset-left, 0px)) !important;
        }
        body.has-footer-ad .bottom-nav__item{
          padding:4px 0 !important;
          gap:3px !important;
          font-size:11px !important;
        }
        body.has-footer-ad .bottom-nav__item .icon{
          width:20px;
          height:20px;
          font-size:18px;
          display:inline-flex;
          align-items:center;
          justify-content:center;
        }
        .ad-footer{
          position:fixed;
          left:0;
          right:0;
          bottom:0;
          z-index:70;
          width:auto !important;
          max-width:none !important;
          padding:8px env(safe-area-inset-right, 0px) calc(8px + env(safe-area-inset-bottom, 0px)) env(safe-area-inset-left, 0px);
          box-sizing:border-box;
          display:flex !important;
          justify-content:center;
          align-items:center;
          margin:0 !important;
          margin-left:0 !important;
          margin-right:0 !important;
          overflow:visible !important;
          background:var(--pixieed-footer-ad-bg);
          border-top:1px solid rgba(255,255,255,0.08);
          backdrop-filter:blur(8px);
          min-height:var(--pixieed-footer-ad-height);
        }
        .ad-footer ins{
          display:block !important;
          width:100% !important;
          max-width:none !important;
          min-height:var(--pixieed-footer-ad-height);
          overflow:hidden;
          background:var(--pixieed-footer-ad-bg) !important;
        }
        .ad-footer ins iframe{
          background:var(--pixieed-footer-ad-bg) !important;
        }
        .ad-footer ins.adsbygoogle[data-ad-status="unfilled"]{
          background:var(--pixieed-footer-ad-bg) !important;
        }
      `;
      document.head.appendChild(style);
    }

    document.body.classList.add('has-footer-ad');
    if (!document.body.dataset.footerAdPaddingApplied) {
      const currentPadding = window.getComputedStyle(document.body).paddingBottom || '0px';
      document.body.style.paddingBottom = `calc(${currentPadding} + var(--pixieed-footer-ad-offset))`;
      document.body.dataset.footerAdPaddingApplied = 'true';
    }

    const footer = document.createElement('div');
    footer.className = 'ad-footer';
    footer.setAttribute('aria-label', '広告');
    footer.innerHTML = `
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="ca-pub-9801602250480253"
           data-ad-slot="rotate"></ins>
    `;
    document.body.appendChild(footer);

    ensureAdsScript();
    if (window.pixieedObserveAds) {
      window.pixieedObserveAds();
      return;
    }
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch (_error) {
      // ignore
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupMobileInputViewportGuard();
      injectFooterAd();
    }, { once: true });
  } else {
    setupMobileInputViewportGuard();
    injectFooterAd();
  }
})();
