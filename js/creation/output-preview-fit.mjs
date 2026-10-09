/** Display media at the largest proportional size that fits its preview box. */
export function createOutputPreviewFit(preview, media, { getZoom = () => 1 } = {}) {
  let frame = 0;
  let disposed = false;
  let resizeObserver = null;
  let mutationObserver = null;
  const imageDimensionsBySource = new WeakMap();

  function sourceSize(element, fallbackWidth, fallbackHeight) {
    const width = Number(element.dataset.previewSourceWidth);
    const height = Number(element.dataset.previewSourceHeight);
    return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
      ? [width, height]
      : [fallbackWidth, fallbackHeight];
  }

  function intrinsicSize(element) {
    if (element instanceof HTMLImageElement) {
      if (!element.complete || element.naturalWidth <= 0) return [0, 0];
      const source = element.currentSrc || element.src;
      let cached = imageDimensionsBySource.get(element);
      if (cached?.source !== source) {
        cached = { source, width: element.naturalWidth, height: element.naturalHeight };
        imageDimensionsBySource.set(element, cached);
      }
      return sourceSize(element, cached.width, cached.height);
    }
    if (element instanceof HTMLVideoElement) {
      return element.readyState >= HTMLMediaElement.HAVE_METADATA && element.currentSrc === element.src
        ? [element.videoWidth, element.videoHeight]
        : [0, 0];
    }
    return sourceSize(element, element.width, element.height);
  }

  function fit() {
    frame = 0;
    if (disposed || !preview.isConnected) return;
    const style = getComputedStyle(preview);
    const rect = preview.getBoundingClientRect();
    const boxWidth = Math.max(0, rect.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth)
      - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const boxHeight = Math.max(0, rect.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth)
      - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
    if (!boxWidth || !boxHeight) return;

    const zoom = Math.max(0.5, Math.min(1, Number(getZoom()) || 1));
    for (const element of media) {
      if (element.hidden || getComputedStyle(element).display === 'none') continue;
      const [width, height] = intrinsicSize(element);
      if (!(width > 0 && height > 0)) continue;
      if (element instanceof HTMLImageElement || element instanceof HTMLCanvasElement || element instanceof HTMLVideoElement) {
        element.dataset.previewPixelated = String(element.dataset.pixelArt === 'true' || Math.max(width, height) <= 160);
      }
      if (element instanceof HTMLImageElement || element instanceof HTMLCanvasElement) {
        const cachedImageSize = element instanceof HTMLImageElement ? imageDimensionsBySource.get(element) : null;
        const actualWidth = cachedImageSize?.width || element.width;
        const actualHeight = cachedImageSize?.height || element.height;
        const hasSourceSize = Number(element.dataset.previewSourceWidth) > 0 && Number(element.dataset.previewSourceHeight) > 0;
        const correctedRatio = hasSourceSize && actualWidth > 0 && actualHeight > 0
          && width * actualHeight !== height * actualWidth;
        const ratioValue = String(correctedRatio);
        if (element.dataset.previewCorrectRatio !== ratioValue) element.dataset.previewCorrectRatio = ratioValue;
      }
      const scale = Math.min(boxWidth / width, boxHeight / height) * zoom;
      const displayWidth = `${width * scale}px`;
      const displayHeight = `${height * scale}px`;
      if (element.style.width !== displayWidth) element.style.width = displayWidth;
      if (element.style.height !== displayHeight) element.style.height = displayHeight;
    }
  }

  function scheduleFit() {
    if (!disposed && frame === 0) frame = requestAnimationFrame(fit);
  }

  function connect() {
    if (disposed) return;
    resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleFit) : null;
    resizeObserver?.observe(preview);
    if (preview.parentElement) resizeObserver?.observe(preview.parentElement);

    mutationObserver = typeof MutationObserver === 'function' ? new MutationObserver(scheduleFit) : null;
    mutationObserver?.observe(preview, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['src', 'hidden', 'width', 'height', 'data-pixel-art',
        'data-preview-source-width', 'data-preview-source-height']
    });

    for (const element of media) {
      element.addEventListener('load', scheduleFit);
      element.addEventListener('loadedmetadata', scheduleFit);
    }
    const video = media.find((element) => element instanceof HTMLVideoElement);
    video?.addEventListener('resize', scheduleFit);
    window.addEventListener('resize', scheduleFit, { passive: true });
    window.addEventListener('orientationchange', scheduleFit, { passive: true });
    scheduleFit();
  }

  function disconnect() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    resizeObserver?.disconnect();
    resizeObserver = null;
    mutationObserver?.disconnect();
    mutationObserver = null;
    window.removeEventListener('resize', scheduleFit);
    window.removeEventListener('orientationchange', scheduleFit);
    for (const element of media) {
      element.removeEventListener('load', scheduleFit);
      element.removeEventListener('loadedmetadata', scheduleFit);
    }
    const video = media.find((element) => element instanceof HTMLVideoElement);
    video?.removeEventListener('resize', scheduleFit);
  }

  connect();

  return {
    refresh: scheduleFit,
    reconnect: connect,
    suspend: disconnect,
    disconnect() { disposed = true; disconnect(); }
  };
}
