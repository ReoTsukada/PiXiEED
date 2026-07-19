(() => {
  if (typeof window === 'undefined') return;

  const allowedEditions = new Set(['dev', 'web-free', 'product']);
  const requestedEdition = String(window.__PIXIEEDRAW_BUILD_EDITION__ || 'dev').trim();
  const edition = allowedEditions.has(requestedEdition) ? requestedEdition : 'dev';
  const capabilities = Object.freeze({
    ads: edition === 'dev' || edition === 'web-free',
  });

  window.PIXIEEDRAW_EDITION = edition;
  window.PIXIEEDRAW_EDITION_CAPABILITIES = capabilities;
  // Embed mode is a display context, not an entitlement. No account, purchase,
  // storage, or remote API state participates in this decision.
  const isWebProtocol = () => (
    window.location?.protocol === 'http:' || window.location?.protocol === 'https:'
  );

  window.__PIXIEEDRAW_SHOULD_SHOW_ADS__ = () => (
    capabilities.ads && isWebProtocol() && window.__PIXIEED_EMBED_MODE__ !== true
  );

  function enforceEditionAdvertising() {
    const showAds = window.__PIXIEEDRAW_SHOULD_SHOW_ADS__();
    window.__PIXIEED_ADS_DISABLED__ = window.__PIXIEED_AD_FREE_ACCOUNT__ === true || !showAds;
    if (!showAds || typeof document === 'undefined') return;
    document.body?.classList.remove('pixieed-adfree');
    document.documentElement?.classList.remove('pixieed-adfree');
    document.documentElement?.style.removeProperty('--mobile-bottom-ad-height');
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', enforceEditionAdvertising, { once: true });
    } else {
      enforceEditionAdvertising();
    }
  }
})();
