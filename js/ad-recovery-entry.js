/** One dismissible Google recovery-message opportunity before a tool is used. */
(() => {
  if (window.__PIXIEED_AD_RECOVERY_ENTRY__) return;
  const KEY = 'pixieed.ad-recovery.next-entry.v1';
  const DAY = 24 * 60 * 60 * 1000;
  const deadline = Date.now() + 8000; // A slow provider must not appear long after entry.
  const route = window.location.pathname;
  const directory = route === '/tools/' || route === '/tools/index.html';
  const tool = /^\/tools\/start\/(draw|camera|audio|spot-difference|hidden-object|jigsaw|convert)\/$/.exec(route)?.[1];
  let retired = false, approved = false, timer = 0, idleHandle = 0;
  const removers = [];
  const listen = (target, type, callback) => {
    target.addEventListener(type, callback, true);
    removers.push(() => target.removeEventListener(type, callback, true));
  };
  const retire = () => {
    retired = true;
    window.clearTimeout(timer);
    if (idleHandle) window.cancelIdleCallback?.(idleHandle);
    for (const remove of removers.splice(0)) remove();
  };
  const safeRoute = () => {
    if ((!tool && !directory) || window.top !== window.self || window.location.origin !== 'https://pixieed.jp'
        || window.location.pathname !== route || window.location.hash) return false;
    if (directory && window.location.search) return false;
    const allowed = { workspace: '1', runtime: 'direct', mode: tool };
    const params = new URLSearchParams(window.location.search);
    if (![...params.keys()].every(key => params.getAll(key).length === 1 && allowed[key] === params.get(key))) return false;
    const history = window.history?.state || {};
    return history.pixieedWorkspace !== true && history.toolStartActive !== true
      && !['projectWorkspaceSelection', 'pxd', 'pxdRevision', 'pxdImage', 'modePxd', 'modePxdRevision', 'modePxdImage', 'modeProjectTool', 'pixieedConversionRecovery', 'privateView', 'mcpEndpoint', 'connectionId', 'pairingCode', 'sessionId', 'accessToken', 'browserToken', 'auth', 'code', 'token']
        .some(key => Boolean(history[key]));
  };
  const cooldownFinished = () => {
    try {
      const next = Number(window.localStorage.getItem(KEY) || 0);
      return Number.isFinite(next) && next <= Date.now();
    } catch { return false; } // Do not repeat prompts when persistence is unavailable.
  };
  const ready = () => !retired && Date.now() <= deadline && safeRoute() && document.visibilityState === 'visible'
    && !document.fullscreenElement && !document.querySelector('dialog[open], [data-private-view], [data-project-workspace], [data-project-editor], .creation-editor, .tool-embed--expanded')
    && window.matchMedia('(pointer:fine)').matches;
  const allowMessage = () => {
    if (!ready()) return false;
    if (approved) return true;
    if (!cooldownFinished()) return false;
    try { window.localStorage.setItem(KEY, String(Date.now() + DAY)); }
    catch { return false; }
    approved = true;
    return true;
  };
  window.__PIXIEED_AD_RECOVERY_ENTRY__ = Object.freeze({ allowMessage });
  if (!safeRoute() || !cooldownFinished()) return;
  // The first interaction retires the opportunity permanently for this document.
  // A slow provider must never interrupt drawing, saving or game play later.
  for (const type of ['pointerdown', 'keydown', 'beforeinput', 'paste', 'drop', 'wheel', 'scroll']) listen(document, type, retire);
  for (const type of ['pagehide', 'popstate', 'hashchange']) listen(window, type, retire);
  listen(document, 'fullscreenchange', retire);
  listen(document, 'visibilitychange', () => { if (document.visibilityState !== 'visible') retire(); });
  listen(window, 'storage', event => { if (event.key === KEY && !approved) retire(); });
  const load = () => {
    if (!ready() || !cooldownFinished()) { retire(); return; }
    if (document.querySelector('script[data-pixieed-ad-recovery], script[src*="fundingchoicesmessages.google.com/i/"]')) return;
    if (!window.frames.googlefcPresent) {
      const signal = document.createElement('iframe');
      signal.name = 'googlefcPresent'; signal.hidden = true; signal.tabIndex = -1;
      signal.setAttribute('aria-hidden', 'true'); signal.title = 'Google messaging presence';
      document.body.append(signal);
    }
    const script = document.createElement('script');
    script.async = true; script.referrerPolicy = 'no-referrer';
    script.dataset.pixieedAdRecovery = 'true';
    script.src = 'https://fundingchoicesmessages.google.com/i/pub-9801602250480253?ers=1';
    script.addEventListener('error', retire, { once: true });
    document.head.append(script);
  };
  const schedule = () => {
    if (retired) return;
    timer = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') idleHandle = window.requestIdleCallback(load, { timeout: 2000 });
      else load();
    }, 700);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();
})();
