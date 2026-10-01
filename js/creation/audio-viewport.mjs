/** Viewing transforms never resample notes or change the logical dot canvas. */
import { wheelZoomFactor } from './viewport-wheel.mjs';
export function audioViewportGeometry({ width, height, hostWidth, hostHeight, zoom = 1, x = 0, y = 0 }) {
  const base = Math.max(1, Math.floor(Math.min((hostWidth - 12) / width, (hostHeight - 12) / height)));
  const cell = Math.max(1, Math.floor(base * Math.max(1, Math.min(16, zoom))));
  const maxX = Math.max(0, (width * cell - hostWidth + 12) / 2);
  const maxY = Math.max(0, (height * cell - hostHeight + 12) / 2);
  return { width: width * cell, height: height * cell, x: Math.max(-maxX, Math.min(maxX, x)) || 0, y: Math.max(-maxY, Math.min(maxY, y)) || 0 };
}

export function createAudioViewport(canvas, host, { onStrokeStart = () => {}, onGestureStart = () => {}, onChange = () => {}, scope = null } = {}) {
  const touches = new Map();
  const cleanups = [];
  const listen = (target, type, callback, options) => {
    if (scope?.listen) {
      const cleanup = scope.listen(target, type, callback, options);
      if (typeof cleanup === 'function') cleanups.push(cleanup);
      return;
    }
    target.addEventListener(type, callback, options);
    cleanups.push(() => target.removeEventListener(type, callback, options));
  };
  let width = 16, height = 16, zoom = 1, x = 0, y = 0, gesture = null, gesturing = false;
  const touchPose = () => {
    const [a, b] = [...touches.values()];
    return { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const layout = () => {
    const r = audioViewportGeometry({ width, height, hostWidth: host.clientWidth, hostHeight: host.clientHeight, zoom, x, y });
    x = r.x; y = r.y;
    canvas.style.width = `${r.width}px`; canvas.style.height = `${r.height}px`;
    canvas.style.transform = `translate(${x}px, ${y}px)`;
    onChange();
  };
  listen(host, 'pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size === 1) onStrokeStart();
    if (touches.size === 2) {
      event.preventDefault(); gesture = { ...touchPose(), zoom, panX: x, panY: y }; gesturing = true;
      onGestureStart();
      try { host.setPointerCapture(event.pointerId); } catch {}
    }
  }, { capture: true });
  listen(host, 'pointermove', (event) => {
    if (!touches.has(event.pointerId)) return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!gesture || touches.size !== 2) return;
    event.preventDefault(); const pose = touchPose();
    zoom = Math.max(1, Math.min(16, gesture.zoom * pose.distance / gesture.distance));
    const ratio = zoom / gesture.zoom, bounds = host.getBoundingClientRect();
    x = gesture.panX * ratio + pose.x - gesture.x + (1 - ratio) * (gesture.x - bounds.left - bounds.width / 2);
    y = gesture.panY * ratio + pose.y - gesture.y + (1 - ratio) * (gesture.y - bounds.top - bounds.height / 2);
    layout();
  }, { capture: true });
  const end = (event) => {
    touches.delete(event.pointerId);
    if (touches.size < 2) gesture = null;
    if (touches.size === 0) gesturing = false;
  };
  for (const type of ['pointerup', 'pointercancel']) listen(document, type, end, { capture: true });
  listen(host, 'wheel', (event) => {
    event.preventDefault(); const next = Math.max(1, Math.min(16, zoom * wheelZoomFactor(event.deltaY, event.deltaMode, host.clientHeight)));
    const ratio = next / zoom, bounds = host.getBoundingClientRect();
    x = x * ratio + (1 - ratio) * (event.clientX - bounds.left - bounds.width / 2);
    y = y * ratio + (1 - ratio) * (event.clientY - bounds.top - bounds.height / 2);
    zoom = next; layout();
  }, { passive: false });
  return {
    get isGesturing() { return gesturing; },
    getState() { return { zoom, x, y }; },
    restoreState(state) {
      zoom = Number.isFinite(state?.zoom) ? Math.max(1, Math.min(16, state.zoom)) : 1;
      x = Number.isFinite(state?.x) ? state.x : 0; y = Number.isFinite(state?.y) ? state.y : 0;
      gesture = null; gesturing = false; touches.clear(); layout();
    },
    resize(nextWidth, nextHeight) {
      if (nextWidth !== width || nextHeight !== height) { zoom = 1; x = 0; y = 0; }
      width = nextWidth; height = nextHeight; layout();
    },
    dispose() {
      touches.clear(); gesture = null; gesturing = false;
      for (const cleanup of cleanups.splice(0)) cleanup();
    }
  };
}
