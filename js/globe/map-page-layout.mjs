/** Keep the full map frame within the visible page chrome on the globe route. */
export function initializeMapPageLayout({
  documentObject = globalThis.document,
  windowObject = globalThis.window,
  ResizeObserverImpl = globalThis.ResizeObserver
} = {}) {
  const body = documentObject?.body;
  if (!body?.classList?.contains('app-page--tool-globe')) return () => {};

  const chrome = [
    documentObject.querySelector('.site-header'),
    documentObject.querySelector('.site-draw-cta'),
    documentObject.querySelector('.map-page-directory-link')
  ].filter(Boolean);
  let lastHeight = null;
  const update = () => {
    // Read element heights only; viewport coordinates would change on scroll.
    const height = chrome.reduce((sum, element) => sum + element.getBoundingClientRect().height, 0);
    const value = `${height}px`;
    if (value === lastHeight) return;
    body.style.setProperty('--map-page-chrome-height', value);
    lastHeight = value;
  };

  update();
  const observer = typeof ResizeObserverImpl === 'function' ? new ResizeObserverImpl(update) : null;
  for (const element of chrome) observer?.observe(element);
  windowObject?.addEventListener?.('resize', update, { passive: true });
  const fonts = documentObject.fonts;
  fonts?.addEventListener?.('loadingdone', update);
  fonts?.ready?.then?.(update);

  return () => {
    observer?.disconnect();
    windowObject?.removeEventListener?.('resize', update);
    fonts?.removeEventListener?.('loadingdone', update);
  };
}

if (typeof document !== 'undefined') initializeMapPageLayout();
