/**
 * Pinch-first camera zoom.
 *
 * Two fingers pinch, a trackpad pinch or ctrl+wheel zoom, a double tap returns to 1x, and the zoom pill
 * steps through 1x / 2x / 3x (plus the ultra-wide lens when the camera has one). The camera's own optical
 * zoom (MediaStreamTrack `zoom`) is used as far as it goes; beyond that the frame is cropped (digital zoom),
 * so every phone gets the same gesture.
 */
export const DIGITAL_MAX = 8;

export function zoomRange(capabilities) {
  const hw = capabilities?.zoom;
  const hwMin = hw && Number.isFinite(hw.min) ? hw.min : 1;
  const hwMax = hw && Number.isFinite(hw.max) ? hw.max : 1;
  return { min: Math.min(1, hwMin), max: Math.max(DIGITAL_MAX, hwMax), hwMin, hwMax, hardware: Boolean(hw && hwMax > hwMin) };
}

/** Split a zoom value into the part the camera does optically and the part left for cropping. */
export function splitZoom(value, range) {
  const hardware = range.hardware ? Math.min(range.hwMax, Math.max(range.hwMin, value)) : 1;
  return { hardware, digital: Math.max(1, value / hardware) };
}

/** Preset stops for the pill: the ultra-wide lens (if any), 1x, 2x, 3x, 5x within range. */
export function zoomStops(range) {
  const stops = [];
  if (range.min < 0.95) stops.push(Math.round(range.min * 10) / 10);
  for (const v of [1, 2, 3, 5]) if (v <= range.max) stops.push(v);
  return stops;
}

export function formatZoom(value) {
  const r = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${Number.isInteger(r) ? r : r.toFixed(1)}×`;
}

/**
 * Attach pinch / wheel / double-tap handling to `element`.
 * `onZoom(value, { gesture })` is called with the new zoom; `onTap()` fires for a single tap that was not
 * part of a double tap or a pinch (the caller uses it to re-pick colours).
 */
export function attachZoomGestures(element, { get, set, onTap = null, onGesture = null } = {}) {
  const pointers = new Map();
  let pinch = null; let lastTap = 0; let tapTimer = 0; let moved = false; let downAt = 0;
  const distance = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  element.addEventListener('pointerdown', (event) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, x0: event.clientX, y0: event.clientY });
    try { element.setPointerCapture(event.pointerId); } catch { /* not capturable */ }
    if (pointers.size === 1) { moved = false; downAt = performance.now(); }
    if (pointers.size === 2) { pinch = { start: distance(), zoom: get() }; moved = true; onGesture?.('start'); }
  });
  element.addEventListener('pointermove', (event) => {
    const p = pointers.get(event.pointerId); if (!p) return;
    p.x = event.clientX; p.y = event.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > 10) moved = true;
    if (pinch && pointers.size >= 2) { const d = distance(); if (pinch.start > 0) set(pinch.zoom * (d / pinch.start), { gesture: 'pinch' }); }
  });
  const end = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    if (pinch && pointers.size < 2) { pinch = null; onGesture?.('end'); }
    if (pointers.size === 0 && !moved && performance.now() - downAt < 350) {
      const now = performance.now();
      if (now - lastTap < 300) { window.clearTimeout(tapTimer); lastTap = 0; set(1, { gesture: 'double-tap' }); }
      else { lastTap = now; tapTimer = window.setTimeout(() => { if (lastTap === now) onTap?.(); }, 300); }
    }
  };
  element.addEventListener('pointerup', end);
  element.addEventListener('pointercancel', end);
  element.addEventListener('wheel', (event) => {
    event.preventDefault();
    const k = event.ctrlKey ? 0.012 : 0.0025; // trackpad pinch arrives as ctrl+wheel with small deltas
    set(get() * Math.exp(-event.deltaY * k), { gesture: 'wheel' });
  }, { passive: false });
  // iOS Safari: stop the page itself from pinch-zooming while the camera handles it
  for (const type of ['gesturestart', 'gesturechange']) element.addEventListener(type, (event) => event.preventDefault());
}
