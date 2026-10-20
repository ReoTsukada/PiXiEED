// Fixed-size local preview only; this does not establish that a provider supports the placement.
export const OUTPUT_SIDE_AD_LIVE_ENABLED = false;
export const OUTPUT_SIDE_AD_METRICS = Object.freeze({
  unitHeight: 600, labelHeight: 21, minWidth: 160, maxWidth: 300,
  contentGap: 48, viewportGap: 24, sizes: Object.freeze([160, 300])
});

const modes = new Set(['slot', 'delay', 'unfilled', 'failed', 'blocked']);
const requestedSizes = new Set(['auto', '160x600', '300x600']);
export function outputSideAdRequestedSize(location) {
  try {
    const values = new URL(location.href).searchParams.getAll('adSize');
    if (values.length > 1) return null;
    const size = values.length === 0 ? 'auto' : values[0];
    return requestedSizes.has(size) ? size : null;
  } catch { return null; }
}

export function outputSideAdPreviewMode(location) {
  try {
    const url = new URL(location.href);
    if (!['http:', 'https:'].includes(url.protocol)
        || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        || url.pathname !== '/output/work/' || url.searchParams.getAll('adPreview').length !== 1
        || outputSideAdRequestedSize(location) === null) return null;
    const mode = url.searchParams.get('adPreview');
    return modes.has(mode) ? mode : null;
  } catch { return null; }
}

const validRect = rect => rect && ['left', 'top', 'right', 'bottom'].every(key => Number.isFinite(rect[key]))
  && rect.right > rect.left && rect.bottom > rect.top;

/** Use surplus desktop gutter only; never shrink the content or add document height.
 * Keep the anchor at main.top + contentGap. If it does not fit, hide it instead of moving it.
 */
export function outputSideAdPlacement({ viewportWidth, viewportHeight, main, headerBottom = 0, obstacles = [], overflowing = false, adSize = 'auto', visualViewport = null } = {}) {
  if (overflowing || !Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)
      || !Number.isFinite(headerBottom) || !validRect(main) || !requestedSizes.has(adSize)) return null;
  if (visualViewport && (visualViewport.scale !== 1 || visualViewport.offsetLeft !== 0 || visualViewport.offsetTop !== 0
      || !Number.isFinite(visualViewport.width) || !Number.isFinite(visualViewport.height))) return null;
  const availableViewportWidth = visualViewport?.width ?? viewportWidth;
  const availableViewportHeight = visualViewport?.height ?? viewportHeight;
  const { minWidth, maxWidth, unitHeight, labelHeight, contentGap, viewportGap, sizes } = OUTPUT_SIDE_AD_METRICS;
  const left = main.right + contentGap;
  const top = main.top + contentGap;
  const availableWidth = Math.floor(availableViewportWidth - viewportGap - left);
  const width = adSize === 'auto'
    ? [...sizes].reverse().find(size => size <= availableWidth) || 0
    : Number(adSize.split('x')[0]);
  const height = unitHeight + labelHeight;
  const candidate = { left, top, right: left + width, bottom: top + height, width, height };
  if (width < minWidth || width > maxWidth || width > availableWidth || main.left < 0
      || top < headerBottom + contentGap || top < 0 || candidate.bottom > availableViewportHeight - viewportGap
      || candidate.bottom > main.bottom || main.right > availableViewportWidth) return null;
  for (const rect of obstacles) {
    if (!validRect(rect)) continue;
    if (candidate.left < rect.right + contentGap && candidate.right > rect.left - contentGap
        && candidate.top < rect.bottom + contentGap && candidate.bottom > rect.top - contentGap) return null;
  }
  return candidate;
}

/** An inert local stub. It never imports a provider, creates an ad unit or sends analytics. */
export function mountOutputSideAdPreview({ doc = document, win = window } = {}) {
  const mode = outputSideAdPreviewMode(win.location);
  if (!mode || win.top !== win.self || !win.MutationObserver || !win.ResizeObserver) return () => {};
  const main = doc.querySelector('.output-main'), layout = doc.querySelector('#output-layout');
  if (!main || !layout) return () => {};
  const adSize = outputSideAdRequestedSize(win.location);
  const aside = doc.createElement('aside');
  aside.className = 'output-side-ad-preview'; aside.hidden = true;
  aside.setAttribute('aria-label', '広告枠のローカル確認（通信なし）');
  aside.dataset.previewState = mode === 'delay' ? 'pending' : mode === 'slot' ? 'filled' : mode;
  const label = doc.createElement('span'); label.className = 'output-side-ad-preview__label'; label.textContent = '広告枠（ローカル確認）';
  const unit = doc.createElement('div'); unit.className = 'output-side-ad-preview__unit';
  const title = doc.createElement('strong'); title.textContent = '仮枠・広告通信なし';
  const size = doc.createElement('span');
  unit.append(title, size); aside.append(label, unit); main.append(aside);
  main.dataset.sideAdPreviewHost = '';
  let disposed = false, frame = 0, timer = 0, readyOnce = false, retired = false;
  function update() {
    frame = 0;
    if (disposed) return;
    const busy = !doc.querySelector('#output-generation-progress')?.hidden;
    // Once work resumes, retire this review placement until navigation. Do not flash
    // the stub back in or restart a delayed load after every output regeneration.
    if (busy && readyOnce) { retired = true; win.clearTimeout(timer); }
    const ready = !retired && !busy && !layout.hidden && layout.getClientRects().length > 0
      && Boolean(doc.querySelector('#output-download')?.getAttribute('href')?.startsWith('blob:'));
    const mainRect = main.getBoundingClientRect();
    const obstacles = [...doc.querySelectorAll('a,button,input,select,textarea,summary,video,audio,canvas,[role="button"],.pixieed-site-reward-status')]
      .filter(node => !node.hidden && node.getClientRects().length > 0).map(node => node.getBoundingClientRect());
    const placement = ready ? outputSideAdPlacement({
      viewportWidth: doc.documentElement.clientWidth, viewportHeight: win.innerHeight, main: mainRect,
      headerBottom: doc.querySelector('.output-header')?.getBoundingClientRect().bottom || 0,
      overflowing: doc.documentElement.scrollWidth > doc.documentElement.clientWidth,
      obstacles, adSize,
      visualViewport: win.visualViewport ? {
        scale: win.visualViewport.scale, offsetLeft: win.visualViewport.offsetLeft,
        offsetTop: win.visualViewport.offsetTop, width: win.visualViewport.width,
        height: win.visualViewport.height
      } : null
    }) : null;
    const filled = aside.dataset.previewState === 'filled';
    aside.hidden = !placement || !filled;
    aside.dataset.eligible = String(Boolean(placement));
    aside.dataset.retired = String(retired);
    if (placement) {
      aside.style.left = `${placement.left - mainRect.left}px`;
      aside.style.top = `${placement.top - mainRect.top}px`;
      aside.style.width = `${placement.width}px`;
      aside.style.height = `${placement.height}px`;
      aside.style.setProperty('--output-side-ad-unit-height', `${OUTPUT_SIDE_AD_METRICS.unitHeight}px`);
      size.textContent = `${placement.width}px × ${OUTPUT_SIDE_AD_METRICS.unitHeight}px（適合未確認）`;
      if (!readyOnce) {
        readyOnce = true;
        if (mode === 'delay') timer = win.setTimeout(() => { aside.dataset.previewState = 'filled'; schedule(); }, 1500);
      }
    }
  }
  function schedule() { if (!disposed && !frame) frame = win.requestAnimationFrame(update); }
  const observer = new win.MutationObserver(schedule);
  observer.observe(layout, { attributes: true, childList: true, subtree: true, attributeFilter: ['hidden', 'href'] });
  const resizeObserver = new win.ResizeObserver(schedule); resizeObserver.observe(main);
  win.addEventListener('resize', schedule);
  win.addEventListener('scroll', schedule, { passive: true });
  win.visualViewport?.addEventListener('resize', schedule, { passive: true });
  win.visualViewport?.addEventListener('scroll', schedule, { passive: true });
  schedule();
  function dispose() {
    if (disposed) return;
    disposed = true; observer.disconnect(); resizeObserver.disconnect();
    win.removeEventListener('resize', schedule); win.removeEventListener('pagehide', onPageHide);
    win.removeEventListener('scroll', schedule);
    win.visualViewport?.removeEventListener('resize', schedule);
    win.visualViewport?.removeEventListener('scroll', schedule);
    win.cancelAnimationFrame(frame); win.clearTimeout(timer); aside.remove(); delete main.dataset.sideAdPreviewHost;
  }
  function onPageHide(event) { if (!event.persisted) dispose(); }
  win.addEventListener('pagehide', onPageHide);
  return dispose;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') mountOutputSideAdPreview();
