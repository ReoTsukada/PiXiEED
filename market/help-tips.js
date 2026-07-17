(function () {
  'use strict';

  const tips = Array.from(document.querySelectorAll('[data-market-help]'));
  if (!tips.length) return;

  function positionTip(tip) {
    const content = tip.querySelector('.market-help-tip__content');
    if (!content) return;
    content.style.left = '0px';
    content.style.right = 'auto';
    const tipRect = tip.getBoundingClientRect();
    const contentWidth = content.getBoundingClientRect().width;
    const viewportWidth = document.documentElement.clientWidth;
    const edge = 14;
    let left = 0;
    if (tipRect.left + contentWidth > viewportWidth - edge) {
      left = viewportWidth - edge - contentWidth - tipRect.left;
    }
    if (tipRect.left + left < edge) left = edge - tipRect.left;
    const arrowLeft = Math.max(9, Math.min(contentWidth - 17, (tipRect.width / 2) - left - 4));
    content.style.left = `${Math.round(left)}px`;
    content.style.setProperty('--market-help-arrow-left', `${Math.round(arrowLeft)}px`);
  }

  function closeTip(tip) {
    tip.classList.remove('is-open');
    tip.querySelector('.market-help-tip__button')?.setAttribute('aria-expanded', 'false');
  }

  function closeAll(except) {
    tips.forEach((tip) => { if (tip !== except) closeTip(tip); });
  }

  tips.forEach((tip) => {
    const button = tip.querySelector('.market-help-tip__button');
    if (!button) return;
    tip.addEventListener('pointerenter', () => positionTip(tip));
    tip.addEventListener('focusin', () => positionTip(tip));
    button.addEventListener('click', (event) => {
      // Some help buttons live inside labels. Prevent the label's checkbox or
      // file input from being activated while the explanation is opened.
      event.preventDefault();
      event.stopPropagation();
      const shouldOpen = !tip.classList.contains('is-open');
      closeAll(tip);
      if (shouldOpen) positionTip(tip);
      tip.classList.toggle('is-open', shouldOpen);
      button.setAttribute('aria-expanded', String(shouldOpen));
    });
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-market-help]')) closeAll();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const openTip = tips.find((tip) => tip.classList.contains('is-open'));
    if (!openTip) return;
    const button = openTip.querySelector('.market-help-tip__button');
    closeAll();
    button?.focus();
  });
  window.addEventListener('resize', () => {
    tips.forEach((tip) => {
      if (tip.classList.contains('is-open')) positionTip(tip);
    });
  }, { passive: true });
})();
