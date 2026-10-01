/** Own a mode's listeners, animation and temporary resources without touching browser globals. */
export function createModeScope(runtime = globalThis) {
  const controller = new AbortController();
  const cleanups = new Set(); const timers = new Set(); const frames = new Set();
  let disposed = false;
  const add = (cleanup) => {
    if (typeof cleanup !== 'function') return cleanup;
    if (disposed) cleanup(); else cleanups.add(cleanup);
    return cleanup;
  };
  return {
    get disposed() { return disposed; },
    get signal() { return controller.signal; },
    add,
    listen(target, type, callback, options = {}) {
      if (disposed || !target) return;
      const config = typeof options === 'boolean' ? { capture: options } : options;
      target.addEventListener(type, callback, { ...config, signal: controller.signal });
      return () => target.removeEventListener(type, callback, config.capture || false);
    },
    observe(observer, target, options) { if (disposed) return; observer.observe(target, options); add(() => observer.disconnect()); return observer; },
    timeout(callback, delay, ...args) {
      if (disposed) return 0;
      const id = runtime.setTimeout(() => { timers.delete(id); if (!disposed) callback(...args); }, delay);
      timers.add(id); return id;
    },
    clearTimeout(id) { timers.delete(id); runtime.clearTimeout(id); },
    frame(callback) {
      if (disposed) return 0;
      const id = runtime.requestAnimationFrame((time) => { frames.delete(id); if (!disposed) callback(time); });
      frames.add(id); return id;
    },
    cancelFrame(id) { frames.delete(id); runtime.cancelAnimationFrame(id); },
    dispose() {
      if (disposed) return;
      disposed = true; controller.abort();
      for (const id of timers) runtime.clearTimeout(id);
      for (const id of frames) runtime.cancelAnimationFrame(id);
      timers.clear(); frames.clear();
      for (const cleanup of [...cleanups].reverse()) { try { cleanup(); } catch { /* Continue releasing the remaining resources. */ } }
      cleanups.clear();
    }
  };
}
