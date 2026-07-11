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
  window.__PIXIEEDRAW_SHOULD_SHOW_ADS__ = () => (
    capabilities.ads && window.__PIXIEED_EMBED_MODE__ !== true
  );
})();
