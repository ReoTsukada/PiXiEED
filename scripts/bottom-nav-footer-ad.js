(function () {
  if (window.__PIXIEED_FOOTER_AD_CONTROLLER__) {
    return;
  }
  window.__PIXIEED_FOOTER_AD_CONTROLLER__ = true;

  let adsScriptLoadScheduled = false;
  let maoituAdsScriptDelayApplied = false;

  function arePixieedAdsDisabled() {
    window.PiXiEEDAdAccountControl?.refresh?.();
    return Boolean(window.__PIXIEED_ADS_DISABLED__ || window.__PIXIEED_AD_FREE_ACCOUNT__);
  }

  function isLocalFilePreview() {
    return window.location.protocol === 'file:';
  }

  function shouldReserveFooterAdOnly() {
    try {
      const path = String(window.location.pathname || '').toLowerCase();
      return /(?:^|\/)(portfolio|terms|privacy|account|account-deletion|contact)(?:\/|\/index\.html)?$/.test(path);
    } catch (_error) {
      return false;
    }
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
    if (isLocalFilePreview() || arePixieedAdsDisabled()) return;
    if (window.PiXiEEDAdAccountControl) {
      window.PiXiEEDAdAccountControl.loadAdsense();
      return;
    }
    const existing = document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');
    if (existing) return;
    if (isMaoituPage() && window.__MAOITU_GAME_ACTIVE__) {
      window.addEventListener('maoitu:game-active-change', () => {
        if (!window.__MAOITU_GAME_ACTIVE__) {
          ensureAdsScript();
        }
      }, { once: true });
      return;
    }
    if (isMaoituPage() && !adsScriptLoadScheduled && !maoituAdsScriptDelayApplied) {
      adsScriptLoadScheduled = true;
      maoituAdsScriptDelayApplied = true;
      const scheduleLoad = () => {
        adsScriptLoadScheduled = false;
        ensureAdsScript();
      };
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(scheduleLoad, { timeout: 1800 });
      } else {
        window.setTimeout(scheduleLoad, 1000);
      }
      return;
    }
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9801602250480253';
    document.head.appendChild(script);
  }

  function isPixiedrawPage() {
    try {
      const path = String(window.location.pathname || '').toLowerCase();
      return /(?:^|\/)(?:pixiedraw|pixieedrawdev)(?:\/|\/index\.html)?$/.test(path);
    } catch (_error) {
      return false;
    }
  }

  function isMaoituPage() {
    try {
      const path = String(window.location.pathname || '').toLowerCase();
      return /(?:^|\/)maoitu(?:\/|\/index\.html)?$/.test(path);
    } catch (_error) {
      return false;
    }
  }

  function isPixiedrawMobileChromeActive() {
    if (!isPixiedrawPage()) return false;
    const body = document.body;
    const root = document.documentElement;
    return body?.dataset.pixieedMobileChrome === 'true' || root?.dataset.pixieedMobileChrome === 'true';
  }

  function dispatchPixiedrawAdLayoutChange(reason) {
    if (!isPixiedrawPage()) return;
    try {
      document.dispatchEvent(new CustomEvent('pixiedraw:ad-layout-change', {
        detail: { source: 'sharedTopAd', reason: reason || 'sync' }
      }));
    } catch (_error) {
      // ignore
    }
  }

  function ensureTopAdStyles() {
    const styleId = 'pixieed-shared-top-ad-style';
    if (document.getElementById(styleId)) {
      return;
    }
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      :root{
        --pixieed-top-ad-inline-padding:6px;
        --pixieed-top-ad-banner-gap:4px;
        --pixieed-top-ad-banner-top:4px;
        --pixieed-top-ad-offset:0px;
        --pixieed-side-ad-offset:0px;
        --pixieed-shared-side-ad-width:0px;
        --pixieed-landscape-side-ad-width:72px;
        --pixieed-landscape-side-ad-gap:4px;
        --pixieed-landscape-side-ad-length:320px;
      }
      .pixieed-shared-top-ad{
        position:fixed;
        top:calc(env(safe-area-inset-top, 0px) + var(--pixieed-top-ad-banner-top));
        left:50%;
        transform:translateX(-50%);
        width:min(640px, calc(100vw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - (var(--pixieed-top-ad-inline-padding) * 2)));
        height:50px;
        min-height:50px;
        max-height:50px;
        box-sizing:border-box;
        z-index:14040;
        display:flex;
        justify-content:center;
        align-items:center;
        pointer-events:auto;
        overflow:hidden;
        contain:layout paint;
        isolation:isolate;
      }
      .pixieed-shared-top-ad .ad-block{
        border:1px dashed rgba(255,255,255,0.2);
        border-radius:8px;
        background:linear-gradient(150deg, rgba(255,255,255,0.04), rgba(15,23,42,0.9));
        padding:0;
        box-shadow:0 10px 30px rgba(0,0,0,0.28);
        position:relative;
        width:100%;
        height:100%;
        max-width:none;
        display:block;
        overflow:hidden;
      }
      .pixieed-shared-top-ad.is-local-preview .ad-block::after{
        content:'広告プレビュー';
        position:absolute;
        inset:0;
        display:grid;
        place-items:center;
        color:rgba(203,213,225,.72);
        font-size:11px;
        font-weight:700;
        letter-spacing:.06em;
        pointer-events:none;
      }
      .pixieed-shared-top-ad .ad-label{
        position:absolute;
        top:2px;
        left:4px;
        background:rgba(0,0,0,0.6);
        color:#cbd5e1;
        font-size:9px;
        padding:2px 5px;
        border-radius:999px;
        letter-spacing:0.04em;
        line-height:1;
        z-index:1;
      }
      .pixieed-shared-top-ad ins.adsbygoogle{
        display:block;
        width:100% !important;
        max-width:100% !important;
        min-width:0 !important;
        min-height:100% !important;
        height:100% !important;
        max-height:100% !important;
        overflow:hidden;
      }
      .pixieed-shared-top-ad ins.adsbygoogle iframe{
        width:100% !important;
        height:100% !important;
        max-width:100% !important;
        max-height:100% !important;
      }
      body[data-pixieed-page="pixiedraw"] .app{
        padding-top:var(--pixieed-common-content-top, calc(var(--pixieed-top-ad-offset) + 48px)) !important;
      }
      body[data-pixieed-page="maoitu"] .game-shell{
        padding-top:var(--pixieed-common-content-top, calc(var(--pixieed-top-ad-offset) + 48px)) !important;
        box-sizing:border-box;
      }
      body[data-pixieed-page="pixiedraw"]{
        /* Match the landscape shared navigation rail exactly. */
        --pixieed-landscape-side-ad-width:var(--pixieed-shared-side-nav-width, 72px);
        --pixieed-landscape-side-ad-gap:var(--pixieed-shared-side-nav-gap, 6px);
      }
      body[data-pixieed-page="maoitu"]{
        --pixieed-landscape-side-ad-width:clamp(96px, calc((100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 12px) / 3.2), 160px);
        --pixieed-landscape-side-ad-gap:6px;
        --pixieed-landscape-side-ad-length:100%;
      }
      @media (orientation: landscape){
        body[data-pixieed-page="pixiedraw"] .pixieed-shared-top-ad,
        body[data-pixieed-page="maoitu"] .pixieed-shared-top-ad{
          top:calc(env(safe-area-inset-top, 0px) + 6px);
          bottom:calc(env(safe-area-inset-bottom, 0px) + 6px);
          left:calc(env(safe-area-inset-left, 0px) + 6px);
          transform:none;
          width:var(--pixieed-landscape-side-ad-width);
          height:auto;
          align-items:stretch;
          justify-content:flex-start;
          overflow:hidden;
          contain:layout paint;
          isolation:isolate;
        }
        /* PiXiEEDraw uses the same full-height rail geometry as its navigation.
           The rotated creative stays centered within the rail rather than
           inheriting a small, top-aligned advertising frame. */
        body[data-pixieed-page="pixiedraw"] .pixieed-shared-top-ad{
          top:0;
          bottom:0;
          left:0;
          width:var(--pixieed-landscape-side-ad-width);
          min-height:100vh;
          min-height:100dvh;
          height:100vh;
          height:100dvh;
          max-height:100vh;
          max-height:100dvh;
          box-sizing:border-box;
          align-items:center;
          justify-content:center;
        }
        body[data-pixieed-page="pixiedraw"] .pixieed-shared-top-ad .ad-block,
        body[data-pixieed-page="maoitu"] .pixieed-shared-top-ad .ad-block{
          position:absolute;
          top:50%;
          left:50%;
          width:var(--pixieed-landscape-side-ad-length);
          height:50px;
          transform:translate(-50%, -50%) rotate(90deg);
          transform-origin:center center;
          border-radius:10px;
          overflow:hidden;
        }
        body[data-pixieed-page="pixiedraw"] .pixieed-shared-top-ad .ad-block{
          width:calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 12px);
          min-width:0;
          max-width:none;
        }
        body[data-pixieed-page="maoitu"] .pixieed-shared-top-ad .ad-block{
          position:relative;
          top:auto;
          left:auto;
          width:100%;
          height:100%;
          transform:none;
          display:block;
        }
        body[data-pixieed-page="pixiedraw"] .pixieed-shared-top-ad .ad-label,
        body[data-pixieed-page="maoitu"] .pixieed-shared-top-ad .ad-label{
          top:3px;
          left:50%;
          transform:translateX(-50%);
          writing-mode:horizontal-tb;
          text-orientation:mixed;
          padding:2px 6px;
          border-radius:999px;
          letter-spacing:0.02em;
        }
        body[data-pixieed-page="maoitu"] .pixieed-shared-top-ad .ad-label{
          top:4px;
          left:50%;
          transform:translateX(-50%);
          writing-mode:vertical-rl;
          text-orientation:mixed;
          padding:2px 4px;
          border-radius:6px;
        }
        body[data-pixieed-page="pixiedraw"] .pixieed-shared-top-ad ins.adsbygoogle,
        body[data-pixieed-page="maoitu"] .pixieed-shared-top-ad ins.adsbygoogle{
          min-height:50px !important;
          height:50px !important;
        }
        body[data-pixieed-page="maoitu"] .pixieed-shared-top-ad ins.adsbygoogle{
          min-height:0 !important;
          height:100% !important;
          max-height:100% !important;
        }
        body[data-pixieed-page="pixiedraw"] .app{
          padding-top:var(--pixieed-common-tabbar-height, 48px) !important;
          padding-left:env(safe-area-inset-left, 0px) !important;
        }
        body[data-pixieed-page="maoitu"] .game-shell{
          padding-top:var(--pixieed-common-tabbar-height, 48px) !important;
          padding-left:env(safe-area-inset-left, 0px) !important;
        }
        .pixieed-shared-top-ad{display:none!important}
      }
    `;
    document.head.appendChild(style);
  }

  function isLandscapeViewport() {
    try {
      if (window.matchMedia) {
        return window.matchMedia('(orientation: landscape)').matches;
      }
      return window.innerWidth > window.innerHeight;
    } catch (_error) {
      return false;
    }
  }

  function clearReservedTopSpace() {
    const body = document.body;
    if (!(body instanceof HTMLElement)) return;
    const target = isPixiedrawPage()
      ? document.querySelector('.app')
      : isMaoituPage()
        ? document.querySelector('.game-shell') || body
        : body;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.pixieedTopAdPaddingApplied === 'true') {
      target.style.paddingTop = target.dataset.pixieedTopAdOriginalPaddingTop || '';
      delete target.dataset.pixieedTopAdPaddingApplied;
      delete target.dataset.pixieedTopAdOriginalPaddingTop;
    }
    document.documentElement.style.setProperty('--pixieed-top-ad-offset', '0px');
    document.documentElement.style.setProperty('--pixieed-side-ad-offset', '0px');
    document.documentElement.style.setProperty('--pixieed-shared-side-ad-width', '0px');
    dispatchPixiedrawAdLayoutChange('clear-top-ad-space');
  }

  function reserveTopSpace(reason) {
    const body = document.body;
    if (!(body instanceof HTMLElement)) return;
    const ad = document.querySelector('.pixieed-shared-top-ad');
    if (!(ad instanceof HTMLElement)) {
      clearReservedTopSpace();
      return;
    }
    const rect = ad.getBoundingClientRect();
    const reserved = Math.max(0, Math.ceil(rect.bottom));
    const reservedPx = `${reserved}px`;
    document.documentElement.style.setProperty('--pixieed-top-ad-offset', reservedPx);
    document.documentElement.style.setProperty('--pixieed-side-ad-offset', '0px');
    document.documentElement.style.setProperty('--pixieed-shared-side-ad-width', '0px');
    dispatchPixiedrawAdLayoutChange(reason || 'reserve-top-ad-space');
  }

  function removeFooterAd() {
    document.querySelectorAll('.ad-footer').forEach(node => node.remove());
    if (document.body) {
      document.body.classList.remove('has-footer-ad');
      if (document.body.dataset.footerAdPaddingApplied === 'true') {
        document.body.style.paddingBottom = '';
        delete document.body.dataset.footerAdPaddingApplied;
      }
    }
  }

  function removeTopAd() {
    document.querySelectorAll('.pixieed-shared-top-ad').forEach((node) => node.remove());
    document.body?.classList.remove('has-pixieed-shared-top-ad');
    clearReservedTopSpace();
  }

  function injectTopAd() {
    if (arePixieedAdsDisabled()
      || isLandscapeViewport()) {
      removeTopAd();
      return;
    }
    ensureTopAdStyles();
    removeFooterAd();

    let banner = document.querySelector('.pixieed-shared-top-ad');
    if (!(banner instanceof HTMLElement)) {
      banner = document.createElement('div');
      banner.className = 'pixieed-shared-top-ad';
      banner.setAttribute('aria-label', '広告');
      banner.innerHTML = `
        <div class="ad-block">
          <ins class="adsbygoogle"
               style="display:block"
               data-ad-client="ca-pub-9801602250480253"
               data-ad-slot="2141591954"
               data-pixieed-shared-banner="true"></ins>
          <small class="ad-label">広告</small>
        </div>
      `;
      document.body.appendChild(banner);
    }
    const localFilePreview = isLocalFilePreview();
    banner.classList.toggle('is-local-preview', localFilePreview);
    document.body?.classList.add('has-pixieed-shared-top-ad');
    if (banner.dataset.pixieedInteractionGuard !== '1') {
      banner.dataset.pixieedInteractionGuard = '1';
      ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend', 'contextmenu'].forEach(type => {
        banner.addEventListener(type, event => {
          // Keep input inside the shared ad rail. This prevents a transformed
          // banner edge from activating a PiXiEEDraw tool behind it.
          event.stopPropagation();
        });
      });
    }

    // AdSense can apply a late inline size to its `ins` or generated iframe.
    // The banner itself is deliberately a fixed-size mobile chrome element;
    // keep every generated child inside that measured frame so a late ad
    // response cannot expand over the editor after its top space was reserved.
    const syncBannerGeometry = () => {
      const portrait = !isLandscapeViewport();
      const nodes = [
        banner,
        banner.querySelector('.ad-block'),
        banner.querySelector('ins.adsbygoogle'),
        ...Array.from(banner.querySelectorAll('iframe')),
      ].filter(node => node instanceof HTMLElement);
      const clearGeometryLock = node => {
        if (node.dataset.pixieedBannerGeometryLock !== 'true') return;
        ['height', 'min-height', 'max-height'].forEach(property => node.style.removeProperty(property));
        delete node.dataset.pixieedBannerGeometryLock;
      };
      if (!portrait) {
        nodes.forEach(clearGeometryLock);
        return;
      }
      // PiXiEEDraw's portrait banner is deliberately the same fixed 50px
      // chrome in production and DEV.  Do not use a late AdSense response as
      // the source of truth here: when it reports a tall responsive creative,
      // measuring it first would lock that oversized height above the editor.
      const height = isPixiedrawPage()
        ? 50
        : Math.max(1, Math.round(banner.getBoundingClientRect().height));
      const heightValue = `${height}px`;
      nodes.forEach(node => {
        ['height', 'min-height', 'max-height'].forEach(property => {
          if (node.style.getPropertyValue(property) !== heightValue
            || node.style.getPropertyPriority(property) !== 'important') {
            node.style.setProperty(property, heightValue, 'important');
          }
        });
        node.dataset.pixieedBannerGeometryLock = 'true';
      });
    };

    if (banner.dataset.pixieedGeometryGuard !== 'true') {
      banner.dataset.pixieedGeometryGuard = 'true';
      let geometryFrame = 0;
      const scheduleGeometrySync = () => {
        if (geometryFrame) return;
        geometryFrame = window.requestAnimationFrame(() => {
          geometryFrame = 0;
          syncBannerGeometry();
          reserveTopSpace('shared-top-ad-geometry-sync');
        });
      };
      const geometryObserver = new MutationObserver(scheduleGeometrySync);
      geometryObserver.observe(banner, {
        attributes: true,
        attributeFilter: ['style'],
        childList: true,
        subtree: true,
      });
      window.addEventListener('orientationchange', scheduleGeometrySync, { passive: true });
      window.addEventListener('resize', scheduleGeometrySync, { passive: true });
      scheduleGeometrySync();
    } else {
      syncBannerGeometry();
    }

    const renderBanner = () => {
      if (!(banner instanceof HTMLElement) || !banner.isConnected) {
        return;
      }
      if (localFilePreview) return;
      const slot = banner.querySelector('ins.adsbygoogle');
      if (!(slot instanceof HTMLElement)
        || slot.dataset.pixieedPushQueued === '1'
        || slot.getAttribute('data-adsbygoogle-status') === 'done') {
        return;
      }
      const slotRect = slot.getBoundingClientRect();
      const frameRect = slot.parentElement?.getBoundingClientRect();
      if (slotRect.width < 1 || slotRect.height < 1 || (frameRect && frameRect.width < 1)) {
        if (banner.dataset.pixieedAdSizeObserver !== '1' && typeof ResizeObserver === 'function') {
          banner.dataset.pixieedAdSizeObserver = '1';
          const observer = new ResizeObserver(() => {
            const nextRect = slot.getBoundingClientRect();
            if (nextRect.width < 1 || nextRect.height < 1) return;
            observer.disconnect();
            delete banner.dataset.pixieedAdSizeObserver;
            renderBanner();
          });
          observer.observe(banner);
          observer.observe(slot);
        }
        return;
      }
      slot.dataset.pixieedPushQueued = '1';
      if (window.pixieedObserveAds) {
        window.pixieedObserveAds(banner);
      } else {
        try {
          window.adsbygoogle = window.adsbygoogle || [];
          window.adsbygoogle.push({});
        } catch (_error) {
          delete slot.dataset.pixieedPushQueued;
        }
      }
    };
    const usesManagedPixiedrawAds = !localFilePreview && isPixiedrawPage()
      && typeof window.__PIXIEEDRAW_LOAD_ADS__ === 'function';
    if (usesManagedPixiedrawAds) {
      // PiXiEEDraw owns the external library lifecycle. The shared, rotated
      // banner waits for the editor-ready event instead of competing at boot.
      if (window.__PIXIEEDRAW_AD_RENDER_ENABLED__ === true) {
        renderBanner();
      } else if (banner.dataset.pixieedEditorAdReadyListener !== '1') {
        banner.dataset.pixieedEditorAdReadyListener = '1';
        document.addEventListener('pixieedraw:ads-ready', () => {
          delete banner.dataset.pixieedEditorAdReadyListener;
          renderBanner();
        }, { once: true });
      }
    } else if (!localFilePreview) {
      ensureAdsScript();
      renderBanner();
    }
    reserveTopSpace('inject-top-ad');
  }

  function syncFooterAd() {
    removeFooterAd();
    if (arePixieedAdsDisabled()) {
      removeTopAd();
      return;
    }
    injectTopAd();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectMinimalSiteChrome();
      setupHomeBackGuard();
      setupMobileInputViewportGuard();
      syncFooterAd();
    }, { once: true });
  } else {
    injectMinimalSiteChrome();
    setupHomeBackGuard();
    setupMobileInputViewportGuard();
    syncFooterAd();
  }

  window.addEventListener('pageshow', () => {
    syncFooterAd();
  });
  window.addEventListener('focus', () => {
    syncFooterAd();
  });
  window.addEventListener('online', () => {
    syncFooterAd();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncFooterAd();
    }
  });
  let lastLandscapeState = isLandscapeViewport();
  const syncResponsiveAdLayout = (reason) => {
    const nextLandscapeState = isLandscapeViewport();
    if (nextLandscapeState !== lastLandscapeState) {
      lastLandscapeState = nextLandscapeState;
      syncFooterAd();
      return;
    }
    if (nextLandscapeState) {
      removeTopAd();
      return;
    }
    reserveTopSpace(reason);
  };
  window.addEventListener('resize', () => {
    syncResponsiveAdLayout('resize-top-ad');
  }, { passive: true });
  window.addEventListener('orientationchange', () => {
    lastLandscapeState = isLandscapeViewport();
    syncFooterAd();
  }, { passive: true });
  document.addEventListener('pixiedraw:mobile-chrome-change', syncFooterAd);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      syncResponsiveAdLayout('visual-viewport-resize');
    }, { passive: true });
  }
})();
