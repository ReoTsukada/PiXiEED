import './home-play.mjs?rev=20261002-ux-polish-1';

/** Start the non-hero site code once the first paint has had an idle opportunity. */
export function scheduleAppStartup({
  win = globalThis,
  doc = globalThis.document,
  loadApp = () => import('./app.js?rev=20261006-header-controls-1'),
  onError = (error) => console.error('ホームの追加機能を読み込めませんでした', error),
  maxWait = 500,
} = {}) {
  let started = false;
  let firstFrame = 0; let secondFrame = 0; let idle = 0; let fallback = 0;

  const cancelPending = () => {
    if (firstFrame) win.cancelAnimationFrame(firstFrame);
    if (secondFrame) win.cancelAnimationFrame(secondFrame);
    if (idle) {
      if (win.cancelIdleCallback) win.cancelIdleCallback(idle);
      else win.clearTimeout(idle);
    }
    if (fallback) win.clearTimeout(fallback);
    firstFrame = 0; secondFrame = 0; idle = 0; fallback = 0;
  };
  const run = () => {
    if (started || doc?.hidden) return;
    started = true;
    cancelPending();
    doc?.removeEventListener('visibilitychange', onVisibilityChange);
    Promise.resolve().then(loadApp).catch(onError);
  };
  const schedule = () => {
    if (started || doc?.hidden || firstFrame || secondFrame || idle || fallback) return;
    // This timer also covers visible browsers that stop dispatching animation frames.
    fallback = win.setTimeout(run, maxWait);
    firstFrame = win.requestAnimationFrame(() => {
      firstFrame = 0;
      if (doc?.hidden) return;
      secondFrame = win.requestAnimationFrame(() => {
        secondFrame = 0;
        if (doc?.hidden) return;
        if (win.requestIdleCallback) idle = win.requestIdleCallback(() => { idle = 0; run(); }, { timeout: maxWait });
        else idle = win.setTimeout(() => { idle = 0; run(); }, 0);
      });
    });
  };
  function onVisibilityChange() {
    cancelPending();
    if (!doc?.hidden) schedule();
  }

  doc?.addEventListener('visibilitychange', onVisibilityChange);
  schedule();
  return () => {
    if (started) return;
    cancelPending();
    doc?.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

scheduleAppStartup();
