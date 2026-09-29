/** AdSense for standalone tools; the enclosing page owns ads when a tool is embedded. */
(() => {
  if (window.top !== window.self || !['http:', 'https:'].includes(location.protocol)) return;
  const source = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9801602250480253';
  if (document.querySelector('script[src^="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]')) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = source;
  script.crossOrigin = 'anonymous';
  document.head.append(script);
})();
