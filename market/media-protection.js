(function () {
  'use strict';

  const selector = '[data-market-protected-media]';

  function protectedMedia(target) {
    return target instanceof Element ? target.closest(selector) : null;
  }

  function blockMediaAction(event) {
    if (!protectedMedia(event.target)) return;
    event.preventDefault();
  }

  function protect(root) {
    const elements = [];
    if (root instanceof Element && root.matches(selector)) elements.push(root);
    if (root?.querySelectorAll) elements.push(...root.querySelectorAll(selector));
    elements.forEach((media) => {
      media.draggable = false;
      media.setAttribute('draggable', 'false');
      if (media instanceof HTMLVideoElement) {
        media.controlsList.add('nodownload', 'noremoteplayback');
        media.disablePictureInPicture = true;
      }
    });
  }

  document.addEventListener('contextmenu', blockMediaAction, true);
  document.addEventListener('dragstart', blockMediaAction, true);
  document.addEventListener('selectstart', blockMediaAction, true);
  document.addEventListener('copy', blockMediaAction, true);
  protect(document);
  new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach(protect));
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
