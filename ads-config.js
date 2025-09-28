(function () {
  const defaultConfig = { hero: [], showcase: null, footer: [] };

  function normalize(config) {
    if (!config || typeof config !== 'object') return { ...defaultConfig };
    const hero = Array.isArray(config.hero) ? config.hero.filter(Boolean) : [];
    const showcase = config.showcase || null;
    const footer = Array.isArray(config.footer) ? config.footer.filter(Boolean) : [];
    return { hero, showcase, footer };
  }

  const configPromise = fetch('ads/adsets/active/config.json', { cache: 'no-store' })
    .then(response => {
      if (!response.ok) return defaultConfig;
      return response.json().catch(() => defaultConfig);
    })
    .catch(() => defaultConfig)
    .then(data => {
      const normalized = normalize(data);
      window.PIXIEED_ADS = normalized;
      return normalized;
    });

  window.PIXIEED_ADS_READY = configPromise;
})();
