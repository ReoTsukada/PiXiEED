/** One viewport-aware frame pump for the small animations on the home page. */
export function createVisibleAnimationScheduler(env = globalThis) {
  const doc = env.document;
  const entries = new Map();
  const hasObserver = typeof env.IntersectionObserver === 'function';
  let observer = null;
  let raf = 0;
  let watchdog = 0;
  let pageHidden = false;
  let reducedMotion = false;
  let disposed = false;
  const now = () => env.performance?.now?.() ?? Date.now();
  const visible = (element) => {
    if (!element?.getBoundingClientRect) return false;
    const rect = element.getBoundingClientRect();
    const width = env.innerWidth ?? doc?.documentElement?.clientWidth ?? 0;
    const height = env.innerHeight ?? doc?.documentElement?.clientHeight ?? 0;
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < width && rect.top < height;
  };
  const active = (entry) => !disposed && !pageHidden && doc?.visibilityState !== 'hidden' && entry.visible;
  function stopPump() {
    if (raf) env.cancelAnimationFrame?.(raf);
    if (watchdog) env.clearTimeout(watchdog);
    raf = 0; watchdog = 0;
  }
  function hasActive() { return [...entries.values()].some(active); }
  function arm() {
    if (disposed || raf || !hasActive()) return;
    raf = env.requestAnimationFrame((time) => { raf = 0; if (watchdog) env.clearTimeout(watchdog); watchdog = 0; pump(time); });
    // Some embedded browsers suspend rAF while remaining visible. Recover at the
    // visible animation rate so idle playback does not drop to four frames per second.
    const fastestFrame = Math.min(...[...entries.values()].filter(active).map((entry) => Math.max(1000 / entry.fps, reducedMotion ? 1000 / 12 : 0)));
    const watchdogDelay = Math.max(34, Math.min(250, Math.ceil(fastestFrame + 2)));
    watchdog = env.setTimeout(() => {
      watchdog = 0;
      if (!raf || !hasActive()) return;
      env.cancelAnimationFrame?.(raf); raf = 0;
      pump(now());
    }, watchdogDelay);
  }
  function pump(time) {
    if (!hasActive()) { stopPump(); return; }
    for (const entry of [...entries.values()]) {
      const period = Math.max(1000 / entry.fps, reducedMotion ? 1000 / 12 : 0);
      if (!active(entry) || time - entry.lastDraw < period - 1) continue;
      try { entry.draw(time); entry.lastDraw = time; }
      catch { entries.delete(entry.element); observer?.unobserve(entry.element); }
    }
    arm();
  }
  function reevaluate() {
    if (disposed) return;
    for (const entry of entries.values()) entry.visible = visible(entry.element);
    if (hasActive()) arm(); else stopPump();
  }
  if (hasObserver) observer = new env.IntersectionObserver(() => reevaluate(), { rootMargin: '0px', threshold: 0 });
  const onScroll = () => reevaluate();
  const onResize = () => reevaluate();
  const onVisibility = () => reevaluate();
  const onPageHide = () => { pageHidden = true; stopPump(); };
  const onPageShow = () => { pageHidden = false; reevaluate(); };
  env.addEventListener?.('scroll', onScroll, { passive: true });
  env.addEventListener?.('resize', onResize, { passive: true });
  doc?.addEventListener?.('visibilitychange', onVisibility);
  env.addEventListener?.('pagehide', onPageHide);
  env.addEventListener?.('pageshow', onPageShow);

  return {
    add(element, draw, { fps = 30 } = {}) {
      if (disposed || !element || typeof draw !== 'function') return () => {};
      const requestedFps = Number(fps);
      const safeFps = Number.isFinite(requestedFps) ? Math.max(1, Math.min(60, requestedFps)) : 30;
      const entry = { element, draw, fps: safeFps, visible: visible(element), lastDraw: -Infinity };
      entries.set(element, entry);
      observer?.observe(element);
      if (entry.visible) arm();
      return () => { entries.delete(element); observer?.unobserve(element); if (!hasActive()) stopPump(); };
    },
    redraw(element) {
      const entry = entries.get(element);
      if (!entry) return;
      entry.visible = visible(element);
      if (active(entry)) {
        try { entry.draw(now()); entry.lastDraw = now(); }
        catch { entries.delete(element); observer?.unobserve(element); }
        arm();
      }
    },
    setReducedMotion(value) { reducedMotion = Boolean(value); },
    dispose() {
      if (disposed) return;
      disposed = true; stopPump(); observer?.disconnect(); entries.clear();
      env.removeEventListener?.('scroll', onScroll); env.removeEventListener?.('resize', onResize);
      doc?.removeEventListener?.('visibilitychange', onVisibility);
      env.removeEventListener?.('pagehide', onPageHide); env.removeEventListener?.('pageshow', onPageShow);
    },
  };
}
