// Reference-window geometry only: puzzle pixels, pieces and saved game state are untouched.
const WINDOW_KEY = 'pixieed:jigsaw:preview-window:v1';
const POSITION_KEY = 'pixieed:jigsaw:preview-position:v1';
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function fitJigsawPreview({ width = 196, aspect = 1, left, top, bounds }) {
  const ratio = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const availableWidth = Math.max(1, bounds.right - bounds.left);
  const availableHeight = Math.max(1, bounds.bottom - bounds.top);
  // 14px padding/border; 44px move row, 44px resize row and two 4px gaps.
  const chromeWidth = 14; const chromeHeight = 110;
  const maxContentWidth = Math.max(Number.MIN_VALUE, Math.min(506, availableWidth - chromeWidth, Math.max(0, availableHeight - chromeHeight) * ratio));
  // The shell stays wide enough for its controls; narrow/tall images can still
  // resize independently inside it, including sub-pixel CSS widths.
  const minWidth = Math.min(114, maxContentWidth / 2) + chromeWidth;
  const maxWidth = maxContentWidth + chromeWidth;
  const requestedWidth = clamp(finite(width, 196), minWidth, maxWidth);
  const contentWidth = requestedWidth - chromeWidth;
  const panelWidth = Math.min(availableWidth, Math.max(128, requestedWidth));
  const contentHeight = contentWidth / ratio;
  const panelHeight = chromeHeight + contentHeight;
  return { width: panelWidth, height: panelHeight, contentWidth, contentHeight, minWidth, maxWidth, requestedWidth,
    left: clamp(finite(left, bounds.right - panelWidth), bounds.left, Math.max(bounds.left, bounds.right - panelWidth)),
    top: clamp(finite(top, bounds.top), bounds.top, Math.max(bounds.top, bounds.bottom - panelHeight)) };
}
export function createJigsawPreviewWindow({ panel, canvas, toggle, window: host = globalThis.window }) {
  const moveHandle = panel.querySelector('.jigsaw-preview__head');
  const resizeHandle = panel.querySelector('#jigsaw-preview-resize');
  const closeButton = panel.querySelector('#jigsaw-preview-close');
  const sizeLabel = panel.querySelector('#jigsaw-preview-size');
  let desired = { width: 196 }; let geometry = null; let gesture = null;
  try {
    const saved = JSON.parse(host.localStorage.getItem(WINDOW_KEY) || host.localStorage.getItem(POSITION_KEY) || 'null');
    if (saved) desired = { width: finite(saved.width, 196), left: finite(saved.left, undefined), top: finite(saved.top, undefined) };
  } catch {}
  function bounds() {
    const header = host.document.querySelector('.site-header')?.getBoundingClientRect();
    const nav = host.document.querySelector('.app-tabs')?.getBoundingClientRect();
    return { left: 8, right: host.innerWidth - 8, top: Math.max(8, (header?.bottom || 0) + 8), bottom: Math.min(host.innerHeight - 8, (nav?.top ?? host.innerHeight) - 8) };
  }
  function apply(next = desired) {
    geometry = fitJigsawPreview({ ...next, aspect: canvas.width / Math.max(1, canvas.height), bounds: bounds() });
    Object.assign(panel.style, { left: `${geometry.left}px`, top: `${geometry.top}px`, right: 'auto', width: `${geometry.width}px` });
    Object.assign(canvas.style, { width: `${geometry.contentWidth}px`, height: `${geometry.contentHeight}px` });
    const size = geometry.contentWidth < 1 ? geometry.contentWidth.toFixed(2) : Math.round(geometry.contentWidth);
    sizeLabel.textContent = `画像幅 ${size}px`;
    resizeHandle.setAttribute('aria-label', `完成図のサイズ変更。現在の画像幅 ${size}ピクセル。ドラッグ、矢印キー、HomeとEndで調整`);
  }
  function persist() {
    try {
      host.localStorage.setItem(WINDOW_KEY, JSON.stringify(desired));
      host.localStorage.setItem(POSITION_KEY, JSON.stringify({ left: geometry.left, top: geometry.top }));
    } catch {}
  }
  function state(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-pressed', String(open)); toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '完成図を閉じる' : '完成図を表示');
    toggle.title = open ? '完成図を閉じる（表示中）' : '完成図を表示';
  }
  function finish(commit) {
    if (!gesture) return;
    const previous = gesture; gesture = null; delete panel.dataset.previewGesture;
    if (!commit) { desired = previous.desired; apply(); }
    else persist();
    try { if (previous.handle.hasPointerCapture(previous.id)) previous.handle.releasePointerCapture(previous.id); } catch {}
  }
  function close(focus = false) { finish(false); state(false); if (focus) toggle.focus({ preventScroll: true }); }
  function open() { if (!canvas.width || !canvas.height) return; state(true); apply(); }
  function listen(handle, mode) {
    handle.addEventListener('pointerdown', (event) => {
      if (gesture || event.button !== 0 || (mode === 'move' && event.target.closest('button'))) return;
      event.preventDefault(); event.stopPropagation(); apply();
      gesture = { id: event.pointerId, handle, mode, x: event.clientX, y: event.clientY, geometry: { ...geometry }, desired: { ...desired } };
      panel.dataset.previewGesture = mode;
      try { handle.setPointerCapture(event.pointerId); } catch {}
    });
    handle.addEventListener('pointermove', (event) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      const dx = event.clientX - gesture.x; const dy = event.clientY - gesture.y; const start = gesture.geometry;
      if (mode === 'move') {
        apply({ ...desired, left: start.left + dx, top: start.top + dy });
        desired = { ...desired, left: geometry.left, top: geometry.top };
      } else {
        const aspect = canvas.width / Math.max(1, canvas.height);
        const delta = (dx + dy / aspect) / (1 + 1 / (aspect * aspect));
        apply({ width: start.requestedWidth + delta, left: start.left, top: start.top });
        desired = { width: geometry.requestedWidth, left: geometry.left, top: geometry.top };
      }
    });
    handle.addEventListener('pointerup', (event) => { if (gesture?.id === event.pointerId) { event.stopPropagation(); finish(true); } });
    for (const name of ['pointercancel', 'lostpointercapture']) handle.addEventListener(name, (event) => { if (gesture?.id === event.pointerId) finish(false); });
    handle.addEventListener('keydown', (event) => {
      if (event.target !== handle) return;
      const steps = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
      if (!(event.key in steps) && !(mode === 'resize' && ['Home', 'End'].includes(event.key))) return;
      event.preventDefault(); event.stopPropagation(); finish(false); apply();
      const step = (event.shiftKey ? 32 : 16) * (steps[event.key] || 0);
      if (mode === 'resize') desired = { ...desired, width: event.key === 'Home' ? geometry.minWidth : event.key === 'End' ? geometry.maxWidth : geometry.requestedWidth + step };
      else desired = { ...desired, left: geometry.left + (/Left|Right/.test(event.key) ? step : 0), top: geometry.top + (/Up|Down/.test(event.key) ? step : 0) };
      apply(); desired = { width: geometry.requestedWidth, left: geometry.left, top: geometry.top }; persist();
    });
  }
  listen(moveHandle, 'move'); listen(resizeHandle, 'resize');
  panel.addEventListener('pointerdown', (event) => event.stopPropagation());
  panel.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true });
  toggle.addEventListener('click', () => panel.hidden ? open() : close());
  closeButton.addEventListener('click', () => close(true));
  host.addEventListener('blur', () => finish(false)); host.addEventListener('pagehide', () => finish(false));
  host.addEventListener('resize', () => { finish(false); if (!panel.hidden) apply(); });
  host.document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); event.stopImmediatePropagation(); close(true); }
  }, true);
  state(false);
  return { close, refresh() { if (!panel.hidden) apply(); } };
}
