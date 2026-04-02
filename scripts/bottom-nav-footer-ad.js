(function () {
  function isPixieedrawPageForAds() {
    try {
      const pathname = String(window.location.pathname || '').toLowerCase();
      return /(?:^|\/)pixiedraw(?:\/|\/index\.html)?$/.test(pathname);
    } catch (_error) {
      return false;
    }
  }

  function hasCachedAdFreeForCurrentPage() {
    try {
      const raw = window.localStorage.getItem('pixieed_browser_adfree_cache_v1');
      if (!raw) return false;
      const cached = JSON.parse(raw);
      if (cached?.active === true) {
        const expiresAt = typeof cached?.expiresAt === 'string' ? cached.expiresAt : '';
        return !expiresAt || Date.parse(expiresAt) > Date.now();
      }
      const entitlements = cached?.entitlements;
      if (!entitlements || typeof entitlements !== 'object') return false;
      const keys = isPixieedrawPageForAds()
        ? ['browser_ad_free', 'pixiedraw_ad_free']
        : ['browser_ad_free'];
      return keys.some(key => {
        const expiresAt = typeof entitlements?.[key]?.expiresAt === 'string' ? entitlements[key].expiresAt : '';
        return entitlements?.[key] && (!expiresAt || Date.parse(expiresAt) > Date.now());
      });
    } catch (_error) {
      return false;
    }
  }

  function bootstrapPixieedAdFree() {
    if (hasCachedAdFreeForCurrentPage()) {
      window.__PIXIEED_ADS_DISABLED__ = true;
    }
    if (window.pixieedAdFree || document.querySelector('script[data-pixieed-adfree="true"]')) {
      return;
    }
    const currentScript = document.currentScript;
    const script = document.createElement('script');
    script.defer = true;
    script.dataset.pixieedAdfree = 'true';
    script.src = currentScript?.src
      ? new URL('./pixieed-adfree.js', currentScript.src).href
      : new URL('/scripts/pixieed-adfree.js', window.location.href).href;
    document.head.appendChild(script);
  }

  function arePixieedAdsDisabled() {
    return Boolean(window.__PIXIEED_ADS_DISABLED__ || window.pixieedAdFree?.state?.isActive);
  }

  function injectMinimalSiteChrome() {
    const styleId = 'pixieed-minimal-site-chrome';
    if (document.getElementById(styleId)) {
      return;
    }
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      :root{
        --pixieed-clean-line:rgba(255,255,255,0.04);
        --pixieed-clean-line-strong:rgba(255,255,255,0.06);
        --pixieed-clean-shadow:0 14px 34px rgba(2,6,18,0.24);
        --pixieed-clean-shadow-soft:0 8px 20px rgba(2,6,18,0.16);
      }
      header,
      .site-header,
      .top-nav{
        border-bottom-color:transparent !important;
        box-shadow:none !important;
      }
      .brand-icon{
        border-color:var(--pixieed-clean-line-strong) !important;
        box-shadow:none !important;
      }
      .lang-switch,
      .support-tip-link,
      .chip,
      .button.button--ghost,
      .button.secondary{
        border-color:var(--pixieed-clean-line-strong) !important;
        box-shadow:none !important;
      }
      .card,
      .section,
      .panel,
      .item,
      .entry-card,
      .portfolio-card,
      .auth-card,
      .post-card,
      .avatar-panel,
      .public-room-card,
      .update-card,
      .audience-card,
      .new-tool-card,
      .category-hub-card,
      .seo-guide-card,
      .link-card,
      .content-card,
      .feature-card,
      .hero-card,
      .display,
      .portfolio-window,
      .portfolio-window__art,
      .project-alert,
      .faq-item{
        border-color:var(--pixieed-clean-line) !important;
        box-shadow:var(--pixieed-clean-shadow) !important;
      }
      .card.card--ad,
      .entry-card.entry-card--ad,
      .ad-banner,
      .ad-card{
        border-color:rgba(255,255,255,0.03) !important;
      }
      .section--highlight,
      .section--accent,
      .panel-head{
        border-color:var(--pixieed-clean-line) !important;
        box-shadow:none !important;
      }
      .display__frame,
      .hero-card__preview,
      .hero-image img,
      .display__screen,
      .public-room-thumb,
      .portfolio-window__content,
      .portfolio-window__art img{
        border-color:var(--pixieed-clean-line) !important;
        box-shadow:var(--pixieed-clean-shadow-soft) !important;
      }
      .bottom-nav,
      .ad-footer{
        border-top-color:transparent !important;
      }
    `;
    document.head.appendChild(style);
  }

  function setupHomeBackGuard() {
    if (window.__PIXIEED_HOME_BACK_GUARD__) {
      return;
    }
    window.__PIXIEED_HOME_BACK_GUARD__ = true;
    if (typeof window.history?.pushState !== 'function' || typeof window.history?.replaceState !== 'function') {
      return;
    }

    const HOME_PATHS = new Set(['/', '/index.html']);
    const currentUrl = new URL(window.location.href);
    if (HOME_PATHS.has(currentUrl.pathname)) {
      return;
    }

    const entryKey = 'pixieed_entry_url_v1';
    let entryUrl = null;
    try {
      entryUrl = window.sessionStorage.getItem(entryKey);
      if (!entryUrl) {
        window.sessionStorage.setItem(entryKey, currentUrl.href);
        entryUrl = currentUrl.href;
      }
    } catch (_error) {
      const referrer = document.referrer;
      if (referrer) {
        try {
          const referrerOrigin = new URL(referrer).origin;
          if (referrerOrigin === currentUrl.origin) {
            return;
          }
        } catch (_err) {
          // ignore invalid referrer
        }
      }
      entryUrl = currentUrl.href;
    }

    if (entryUrl !== currentUrl.href) {
      return;
    }

    const stateKey = '__pixieedHomeGuard';
    const currentState = window.history.state;
    const baseState = currentState && typeof currentState === 'object'
      ? { ...currentState }
      : {};
    if (baseState[stateKey]) {
      return;
    }
    baseState[stateKey] = 'base';
    window.history.replaceState(baseState, document.title, currentUrl.href);
    window.history.pushState({ [stateKey]: 'sentinel' }, document.title, currentUrl.href);
    window.addEventListener('popstate', (event) => {
      const nextState = event.state || {};
      if (nextState && nextState[stateKey] === 'base') {
        window.location.replace(`${currentUrl.origin}/index.html`);
      }
    });
  }

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
    if (arePixieedAdsDisabled()) return;
    const bottomNav = document.querySelector('.bottom-nav');
    if (!bottomNav) return;
    if (document.querySelector('.ad-footer')) return;

    const syncPageGutter = () => {
      const body = document.body;
      if (!body) return;
      const styles = window.getComputedStyle(body);
      const left = Number.parseFloat(styles.paddingLeft) || 0;
      const right = Number.parseFloat(styles.paddingRight) || 0;
      const gutter = Math.max(left, right, 0);
      document.documentElement.style.setProperty('--pixieed-page-gutter', `${gutter}px`);
    };

    const styleId = 'pixieed-ad-footer-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        :root{
          --pixieed-page-gutter:0px;
          --pixieed-layout-max-width:100vw;
          --pixieed-safe-bottom:env(safe-area-inset-bottom, 0px);
          --pixieed-footer-ad-height:clamp(40px, 6.4vw, 52px);
          --pixieed-footer-ad-padding-y:8px;
          --pixieed-bottom-nav-height:60px;
          --pixieed-bottom-nav-padding-y:6px;
          --pixieed-footer-ad-total-height:calc(var(--pixieed-footer-ad-height) + (var(--pixieed-footer-ad-padding-y) * 2) + var(--pixieed-safe-bottom));
          --pixieed-footer-ad-offset:var(--pixieed-footer-ad-total-height);
          --pixieed-footer-ad-bg:#000;
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
            --pixieed-footer-ad-total-height:calc(var(--pixieed-footer-ad-height) + (var(--pixieed-footer-ad-padding-y) * 2) + var(--pixieed-safe-bottom));
            --pixieed-footer-ad-offset:var(--pixieed-footer-ad-total-height);
          }
        }
        body.has-footer-ad > .page,
        body.has-footer-ad > main{
          width:100%;
          max-width:min(var(--pixieed-layout-max-width), 100%);
          margin-left:auto !important;
          margin-right:auto !important;
        }
        body.has-footer-ad > .page > header,
        body.has-footer-ad > .page > .top-nav,
        body.has-footer-ad > .page > [aria-label="top-nav"]{
          width:calc(100% + (var(--pixieed-page-gutter) * 2));
          max-width:none !important;
          margin-left:calc(var(--pixieed-page-gutter) * -1) !important;
          margin-right:calc(var(--pixieed-page-gutter) * -1) !important;
        }
        body.has-footer-ad .bottom-nav{
          bottom:var(--pixieed-footer-ad-offset) !important;
          height:calc(var(--pixieed-bottom-nav-height) + var(--pixieed-safe-bottom)) !important;
          box-sizing:border-box !important;
          padding:var(--pixieed-bottom-nav-padding-y) max(10px, env(safe-area-inset-right, 0px)) calc(var(--pixieed-bottom-nav-padding-y) + var(--pixieed-safe-bottom)) max(10px, env(safe-area-inset-left, 0px)) !important;
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
          box-sizing:border-box;
          padding:var(--pixieed-footer-ad-padding-y) env(safe-area-inset-right, 0px) calc(var(--pixieed-footer-ad-padding-y) + var(--pixieed-safe-bottom)) env(safe-area-inset-left, 0px);
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
          min-height:var(--pixieed-footer-ad-total-height);
        }
        .ad-footer ins{
          display:block !important;
          width:100% !important;
          max-width:min(720px, calc(100vw - 24px)) !important;
          min-height:var(--pixieed-footer-ad-height);
          margin:0 auto !important;
          overflow:hidden;
          background:var(--pixieed-footer-ad-bg) !important;
        }
        .ad-footer ins iframe{
          display:block !important;
          margin:0 auto !important;
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
    syncPageGutter();
    if (!window.__PIXIEED_FOOTER_AD_GUTTER_BOUND__) {
      window.__PIXIEED_FOOTER_AD_GUTTER_BOUND__ = true;
      window.addEventListener('resize', syncPageGutter, { passive: true });
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', syncPageGutter, { passive: true });
      }
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
      bootstrapPixieedAdFree();
      injectMinimalSiteChrome();
      setupHomeBackGuard();
      setupMobileInputViewportGuard();
      injectFooterAd();
    }, { once: true });
  } else {
    bootstrapPixieedAdFree();
    injectMinimalSiteChrome();
    setupHomeBackGuard();
    setupMobileInputViewportGuard();
    injectFooterAd();
  }
})();
