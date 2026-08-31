(function () {
  'use strict';

  if (window.__PIXIEED_SHARED_PAGE_MOTION__) return;
  window.__PIXIEED_SHARED_PAGE_MOTION__ = true;

  const body = document.body;
  if (!body) return;

  body.classList.add('pixieed-motion-enabled');

  window.addEventListener('pageshow', () => {
    body.classList.add('pixieed-motion-enabled');
  }, { passive: true });
})();
