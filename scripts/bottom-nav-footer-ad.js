(function () {
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
    document.addEventListener('DOMContentLoaded', injectFooterAd, { once: true });
  } else {
    injectFooterAd();
  }
})();
