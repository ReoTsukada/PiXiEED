(() => {
  const MAX_SOURCE_EDGE = 256;
  const MAX_INTEGER_SCALE = 6;
  let rafId = 0;

  function isPixelArtCandidate(img) {
    if (!(img instanceof HTMLImageElement)) return false;
    if (img.dataset.pixelArtFit === 'off') return false;
    if (img.closest('button, .icon-button, .bottom-nav, .site-header, .header-inner, .profile-panel, .project-links, .project-grid, .home-project-grid')) {
      return false;
    }
    if (img.classList.contains('control-icon') || img.classList.contains('icon')) {
      return false;
    }
    const naturalWidth = Number(img.naturalWidth) || 0;
    const naturalHeight = Number(img.naturalHeight) || 0;
    if (!naturalWidth || !naturalHeight) return false;
    return naturalWidth <= MAX_SOURCE_EDGE && naturalHeight <= MAX_SOURCE_EDGE;
  }

  function fitImage(img) {
    if (!isPixelArtCandidate(img)) {
      img.style.removeProperty('width');
      img.style.removeProperty('height');
      img.style.removeProperty('max-width');
      img.style.removeProperty('max-height');
      img.style.removeProperty('margin');
      return;
    }
    const parent = img.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    if (!rect.width || !rect.height) return;
    const scale = Math.floor(Math.min(rect.width / naturalWidth, rect.height / naturalHeight));
    const maxScaleValue = Number(
      img.dataset.pixelArtMaxScale ||
      parent.dataset.pixelArtMaxScale ||
      MAX_INTEGER_SCALE
    );
    const maxScale = Number.isFinite(maxScaleValue) && maxScaleValue > 0
      ? Math.floor(maxScaleValue)
      : MAX_INTEGER_SCALE;
    if (!Number.isFinite(scale) || scale < 1) {
      img.style.removeProperty('width');
      img.style.removeProperty('height');
      img.style.imageRendering = 'pixelated';
      img.style.objectFit = 'contain';
      return;
    }
    const appliedScale = Math.max(1, Math.min(scale, maxScale));
    img.style.width = `${naturalWidth * appliedScale}px`;
    img.style.height = `${naturalHeight * appliedScale}px`;
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
    img.style.objectFit = 'contain';
    img.style.imageRendering = 'pixelated';
    img.style.margin = '0 auto';
  }

  function fitAll() {
    rafId = 0;
    document.querySelectorAll('img').forEach(fitImage);
  }

  function scheduleFit() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(fitAll);
  }

  function bindImage(img) {
    if (!(img instanceof HTMLImageElement)) return;
    if (img.complete) {
      scheduleFit();
      return;
    }
    img.addEventListener('load', scheduleFit, { once: true });
  }

  function init() {
    document.querySelectorAll('img').forEach(bindImage);
    scheduleFit();
    window.addEventListener('resize', scheduleFit, { passive: true });
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(scheduleFit);
      observer.observe(document.body);
    }
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (node instanceof HTMLImageElement) {
            bindImage(node);
          } else if (node instanceof HTMLElement) {
            node.querySelectorAll?.('img').forEach(bindImage);
          }
        });
      }
      scheduleFit();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
