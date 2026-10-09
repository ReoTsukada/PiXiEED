/** Position the Draw canvas settings panel before its opening frame is painted. */
export function mountDrawCanvasPanel({ scope, picker, summary, panel } = {}) {
  if (!scope?.listen || !scope?.add || typeof scope.disposed !== 'boolean') throw new TypeError('Canvas panel requires a lifecycle scope');
  if (!picker || !summary || !panel) throw new TypeError('Canvas panel requires its details, summary, and panel elements');

  let disposed = false;
  const setStyle = (name, value) => {
    const next = String(value);
    if (panel.style.getPropertyValue(name) !== next || panel.style.getPropertyPriority(name) !== 'important') {
      panel.style.setProperty(name, next, 'important');
    }
  };
  const boundsOf = (selector) => document.querySelector(selector)?.getBoundingClientRect();

  function clearPosition() {
    panel.removeAttribute('data-positioned');
    for (const property of ['position', 'box-sizing', 'width', 'overflow-y', 'left', 'top', 'right', 'bottom', 'max-height', 'transform']) panel.style.removeProperty(property);
  }

  function position() {
    if (disposed || !picker.open || !panel.isConnected) return false;
    const header = boundsOf('.px-site-header, .site-header, header');
    const nav = boundsOf('.app-tabs, .site-bottom-nav, nav[aria-label="アプリナビゲーション"]');
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0, viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? innerWidth, viewportHeight = viewport?.height ?? innerHeight;
    const viewportRight = Math.min(innerWidth, viewportLeft + viewportWidth), viewportBottom = Math.min(innerHeight, viewportTop + viewportHeight);
    const safeLeft = Math.max(8, viewportLeft + 8); const safeRight = Math.max(safeLeft, viewportRight - 8);
    const safeTop = Math.max(viewportTop + 8, Math.ceil(Math.max(header?.bottom ?? 0, boundsOf('.project-bar')?.bottom ?? 0)) + 8);
    const safeBottom = Math.max(safeTop + 80, Math.min(viewportBottom - 8, Math.floor(nav?.top ?? viewportBottom) - 8));
    const safeHeight = Math.max(80, safeBottom - safeTop);
    const anchor = summary.getBoundingClientRect();
    setStyle('position', 'fixed'); setStyle('box-sizing', 'border-box');
    setStyle('width', `${Math.max(80, Math.min(380, viewportWidth - 16))}px`);
    setStyle('max-height', `${safeHeight}px`); setStyle('overflow-y', 'auto');
    setStyle('left', '8px'); setStyle('top', `${safeTop}px`); setStyle('right', 'auto'); setStyle('bottom', 'auto'); setStyle('transform', 'none');
    const panelRect = panel.getBoundingClientRect();
    const width = Math.min(panelRect.width || 380, viewportWidth - 16);
    const height = Math.min(panelRect.height || panel.scrollHeight, safeHeight);
    const candidates = [
      { side: 'below', x: anchor.right - width, y: anchor.bottom + 8 },
      { side: 'above', x: anchor.right - width, y: anchor.top - height - 8 },
      { side: 'right', x: anchor.right + 8, y: anchor.top },
      { side: 'left', x: anchor.left - width - 8, y: anchor.top }
    ].map(candidate => ({
      ...candidate,
      fits: candidate.x >= safeLeft && candidate.x + width <= safeRight && candidate.y >= safeTop && candidate.y + height <= safeBottom,
      distance: Math.abs(candidate.x - anchor.left) + Math.abs(candidate.y - anchor.top)
    }));
    const selected = candidates.find(candidate => candidate.fits)
      || [...candidates].sort((a, b) => b.fits - a.fits || a.distance - b.distance)[0];
    const x = Math.max(safeLeft, Math.min(selected.x, safeRight - width));
    const y = Math.max(safeTop, Math.min(selected.y, safeBottom - height));
    setStyle('left', `${Math.round(x)}px`); setStyle('top', `${Math.round(y)}px`);
    panel.dataset.positioned = selected.side;
    return true;
  }

  function close() {
    if (picker.open) picker.open = false;
    clearPosition();
  }

  scope.listen(summary, 'click', (event) => {
    event.preventDefault();
    if (picker.open) { close(); return; }
    picker.open = true;
    // Details' native toggle is deferred; calculate now so the first visible frame is placed.
    position();
  });
  scope.listen(picker, 'toggle', () => {
    if (picker.open) position(); else clearPosition();
  });
  scope.listen(document, 'pointerdown', (event) => {
    if (!picker.open || picker.contains(event.target)) return;
    close();
  }, { capture: true });
  scope.listen(window, 'resize', position, { passive: true });
  scope.listen(window, 'scroll', position, { passive: true, capture: true });
  if (window.visualViewport) {
    scope.listen(window.visualViewport, 'resize', position, { passive: true });
    scope.listen(window.visualViewport, 'scroll', position, { passive: true });
  }

  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => { if (picker.open) position(); });
    scope.observe(observer, picker);
    scope.observe(observer, summary);
    const header = document.querySelector('.px-site-header, .site-header, header');
    const nav = document.querySelector('.app-tabs, .site-bottom-nav, nav[aria-label="アプリナビゲーション"]');
    if (header) scope.observe(observer, header);
    if (nav) scope.observe(observer, nav);
  }

  scope.add(() => { disposed = true; clearPosition(); });
  if (picker.open) position();
  return { position, close, dispose: () => { disposed = true; close(); } };
}
