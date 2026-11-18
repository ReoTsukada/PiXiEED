/** Public portal only. Google owns consent and the account's Auto Ads formats. */
(() => {
  const loc = window.location;
  try { if (window.top !== window.self) return; } catch { return; }
  if (loc?.origin !== 'https://pixieed.jp' || !['/', '/index.html'].includes(loc.pathname)
      || loc.search || loc.hash || !document.head) return;
  // The existing earlier deferred policy excludes Offerwall and optional recovery,
  // while allowing Google's required consent messages to proceed normally.
  if (typeof window.googlefc?.controlledMessagingFunction !== 'function'
      || window.__PIXIEED_OFFERWALL_ENTRY__?.isEligible?.() !== false) return;
  if (document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]')) return;
  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.setAttribute('data-home-auto-ads', 'true');
  script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9801602250480253';
  document.head.append(script);
})();
