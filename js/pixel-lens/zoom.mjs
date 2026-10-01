/**
 * Pinch-first camera zoom.
 *
 * Two fingers pinch, a trackpad pinch or ctrl+wheel zoom, a double tap returns to 1x, and the zoom pill
 * steps through useful total magnifications up to 40x. Device zoom is applied first when it reports the
 * requested setting; a centered image crop supplies the remainder at the existing output resolution.
 */
export const DIGITAL_MAX = 40;
export const TOTAL_ZOOM_MAX = 40;

export function zoomRange(capabilities) {
  const hw = capabilities?.zoom;
  const hwMin = hw && Number.isFinite(hw.min) && hw.min > 0 ? hw.min : 1;
  const hwMax = hw && Number.isFinite(hw.max) && hw.max > 0 ? hw.max : 1;
  const hwStep = hw && Number.isFinite(hw.step) && hw.step > 0 ? hw.step : 0.1;
  const hardware = Boolean(hw && hwMax > hwMin && hwMin <= TOTAL_ZOOM_MAX);
  return { min: hardware ? Math.min(TOTAL_ZOOM_MAX, hwMin) : 1, max: TOTAL_ZOOM_MAX, hwMin, hwMax: Math.min(TOTAL_ZOOM_MAX, hwMax), hwStep, hardware };
}

/** Split the requested magnification into camera zoom and the remaining crop factor. */
export function splitZoom(value, range) {
  const numeric = Number(value);
  const total = Math.min(range.max ?? TOTAL_ZOOM_MAX, Math.max(range.min ?? 1, Number.isFinite(numeric) && numeric > 0 ? numeric : 1));
  if (!range.hardware) return { hardware: 1, digital: total };
  const target = Math.min(range.hwMax, Math.max(range.hwMin, total));
  const steps = Math.floor((target - range.hwMin) / (range.hwStep || 0.1) + 1e-8);
  const hardware = Math.min(range.hwMax, Math.max(range.hwMin, Number((range.hwMin + steps * (range.hwStep || 0.1)).toFixed(6))));
  return { hardware, digital: Math.max(1, total / hardware) };
}

/** Preset stops for the pill: optional ultra-wide, then 1x / 2x / 5x / 10x / 20x / 40x. */
export function zoomStops(range) {
  const stops = [];
  if (range.min < 0.95) stops.push(Math.round(range.min * 10) / 10);
  for (const v of [1, 2, 5, 10, 20, 40]) if (v >= range.min && v <= range.max) stops.push(v);
  return stops;
}

export function formatZoom(value) {
  const r = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${Number.isInteger(r) ? r : r.toFixed(1)}×`;
}

/** Request the camera's zoom control once, falling back only when that constraint itself is unsupported. */
export async function getUserMediaWithZoomPreference(getUserMedia, { facingMode = 'environment', zoomSupported = false, permissions = globalThis.navigator?.permissions } = {}) {
  const video = { facingMode: { ideal: facingMode }, ...(zoomSupported ? { zoom: true } : {}) };
  if (!zoomSupported) return getUserMedia({ audio: false, video });
  try { return await getUserMedia({ audio: false, video }); }
  catch (error) {
    const constraintFailure = ['OverconstrainedError', 'NotSupportedError', 'TypeError'].includes(error?.name)
      && (error?.name !== 'OverconstrainedError' || !error.constraint || error.constraint === 'zoom');
    let permissionAlreadyGranted = false;
    if (error?.name === 'NotAllowedError') {
      try { permissionAlreadyGranted = (await permissions?.query?.({ name: 'camera' }))?.state === 'granted'; } catch {}
    }
    if (!constraintFailure && !permissionAlreadyGranted) throw error;
    return getUserMedia({ audio: false, video: { facingMode: { ideal: facingMode } } });
  }
}

/**
 * Serial device-zoom controller. It trusts getSettings(), never promise resolution alone, and ignores
 * results from tracks that were replaced or stopped while an applyConstraints call was in flight.
 */
export function createCameraZoomController({ onChange = () => {} } = {}) {
  let track = null;
  let generation = 0;
  let range = zoomRange(null);
  let requested = 1;
  let actualHardware = 1;
  let hardwareFailed = false;
  let pending = null;

  const effectiveRange = () => hardwareFailed ? { ...range, hardware: false } : range;
  const snapshot = () => {
    const availableRange = effectiveRange();
    const currentTrack = track;
    const currentGeneration = generation;
    let actual = currentTrack && validHardwareZoom(actualHardware) ? actualHardware : 1;
    try {
      const measured = currentTrack?.getSettings?.().zoom;
      if (validHardwareZoom(measured) && track === currentTrack && generation === currentGeneration) {
        actualHardware = measured;
        actual = measured;
      }
    } catch {}
    const digital = Math.max(1, requested / actual);
    const total = actual * digital;
    return { track: currentTrack, generation: currentGeneration, zoom: total, requested, range: availableRange, hardware: actual, digital, total, overLimit: total > TOTAL_ZOOM_MAX + 0.02, hardwareFailed };
  };
  const emit = () => { try { onChange(snapshot()); } catch {} };
  const validHardwareZoom = (value) => Number.isFinite(value) && value > 0;
  const closeEnough = (a, b) => Math.abs(a - b) <= Math.max(0.02, (range.hwStep || 0.1) * 0.1);

  async function applyLatest() {
    if (!track || !range.hardware || hardwareFailed) return snapshot();
    const target = splitZoom(requested, range).hardware;
    if (closeEnough(target, actualHardware)) return snapshot();
    if (pending?.track === track && pending.generation === generation) return snapshot();
    const currentTrack = track;
    const currentGeneration = generation;
    const operation = { track: currentTrack, generation: currentGeneration };
    pending = operation;
    try {
      await currentTrack.applyConstraints({ advanced: [{ zoom: target }] });
      if (track !== currentTrack || generation !== currentGeneration) return snapshot();
      const measured = currentTrack.getSettings?.().zoom;
      if (!validHardwareZoom(measured)) hardwareFailed = true;
      else {
        actualHardware = measured;
        if (!closeEnough(measured, target)) hardwareFailed = true;
      }
    } catch {
      if (track === currentTrack && generation === currentGeneration) hardwareFailed = true;
    } finally {
      if (pending === operation) pending = null;
    }
    if (track !== currentTrack || generation !== currentGeneration) return snapshot();
    emit();
    if (!hardwareFailed) {
      const latestTarget = splitZoom(requested, range).hardware;
      if (!closeEnough(latestTarget, actualHardware)) return applyLatest();
    }
    return snapshot();
  }

  function attach(nextTrack) {
    generation++;
    pending = null;
    track = nextTrack ?? null;
    let capabilities = null;
    try { capabilities = track?.getCapabilities?.() ?? null; } catch {}
    range = zoomRange(capabilities);
    hardwareFailed = false;
    actualHardware = 1;
    try {
      const measured = track?.getSettings?.().zoom;
      if (validHardwareZoom(measured)) actualHardware = measured;
    } catch {}
    requested = Math.min(range.max, Math.max(range.min, requested));
    emit();
    void applyLatest();
    return range;
  }

  function detach() {
    generation++;
    pending = null;
    track = null;
    range = zoomRange(null);
    actualHardware = 1;
    hardwareFailed = false;
    requested = Math.min(range.max, Math.max(range.min, requested));
    emit();
  }

  function setZoom(value) {
    const numeric = Number(value);
    requested = Math.min(range.max, Math.max(range.min, Number.isFinite(numeric) && numeric > 0 ? numeric : 1));
    emit();
    void applyLatest();
    return snapshot();
  }

  return { attach, detach, setZoom, snapshot, get range() { return effectiveRange(); } };
}

/**
 * Attach pinch / wheel / double-tap / swipe handling to `element`.
 * `set(value, { gesture })` receives the new zoom; `onTap()` fires for a single tap that was not part of a
 * double tap, pinch or swipe (the caller uses it to re-pick colours). A one-finger flick calls
 * `onSwipe('left'|'right'|'up'|'down')`; `onDrag(dx, dy)` follows the finger meanwhile (and `onDrag(0, 0)`
 * on release) so the view can lean with it.
 */
export const SWIPE_MIN_PX = 48;
export const SWIPE_MAX_MS = 700;

/** Classify a one-finger movement as a swipe direction, or null. */
export function swipeDirection(dx, dy, ms) {
  const ax = Math.abs(dx); const ay = Math.abs(dy);
  if (ms > SWIPE_MAX_MS || Math.max(ax, ay) < SWIPE_MIN_PX) return null;
  if (ax > ay * 1.4) return dx < 0 ? 'left' : 'right';
  if (ay > ax * 1.4) return dy < 0 ? 'up' : 'down';
  return null;
}

export function attachZoomGestures(element, { get, set, onTap = null, onGesture = null, onSwipe = null, onDrag = null } = {}) {
  const pointers = new Map();
  let pinch = null; let lastTap = 0; let tapTimer = 0; let moved = false; let downAt = 0; let pinched = false;
  const distance = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  element.addEventListener('pointerdown', (event) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, x0: event.clientX, y0: event.clientY });
    try { element.setPointerCapture(event.pointerId); } catch { /* not capturable */ }
    if (pointers.size === 1) { moved = false; pinched = false; downAt = performance.now(); }
    if (pointers.size === 2) { pinch = { start: distance(), zoom: get() }; moved = true; pinched = true; onDrag?.(0, 0); onGesture?.('start'); }
  });
  element.addEventListener('pointermove', (event) => {
    const p = pointers.get(event.pointerId); if (!p) return;
    p.x = event.clientX; p.y = event.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > 10) moved = true;
    if (pinch && pointers.size >= 2) { const d = distance(); if (pinch.start > 0) set(pinch.zoom * (d / pinch.start), { gesture: 'pinch' }); }
    else if (!pinched && pointers.size === 1 && moved) onDrag?.(p.x - p.x0, p.y - p.y0);
  });
  const end = (event) => {
    const p = pointers.get(event.pointerId);
    if (!p) return;
    pointers.delete(event.pointerId);
    if (pinch && pointers.size < 2) { pinch = null; onGesture?.('end'); }
    if (pointers.size === 0 && moved && !pinched) {
      onDrag?.(0, 0);
      const direction = event.type === 'pointerup' ? swipeDirection(p.x - p.x0, p.y - p.y0, performance.now() - downAt) : null;
      if (direction) onSwipe?.(direction);
    }
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
