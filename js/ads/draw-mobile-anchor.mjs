import { drawDisplayAdConfig } from '../../data/draw-display-ad-config.mjs';

const CLIENT = /^ca-pub-\d{16}$/;
const PATHS = new Set(['/tools/start/draw/', '/draw/editor.html', '/draw/']);
const DIRECT = Object.freeze({ workspace: '1', runtime: 'direct', mode: 'draw' });
const SDK_SELECTOR = 'script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]';
const ATTEMPT = Symbol.for('pixieed.draw-mobile-anchor.attempt.v1');
const records = new WeakMap();
const previews = new Set(['filled', 'unfilled', 'blocked', 'delayed', 'off']);

function safeQuery(search, preview = false) {
  if (!search) return true;
  try {
    const params = new URLSearchParams(search);
    if (!params.size) return false;
    for (const [key, value] of params) {
      if (key === 'drawAdPreview' && preview && previews.has(value) && params.getAll(key).length === 1) continue;
      if (!(key in DIRECT) || value !== DIRECT[key] || params.getAll(key).length !== 1) return false;
    }
    const count = Object.keys(DIRECT).filter(key => params.has(key)).length;
    return count === 0 || count === Object.keys(DIRECT).length;
  } catch { return false; }
}
function isTopLevel(win) { try { return win.top === win.self; } catch { return false; } }
function privateContext(doc, win) {
  const state = win.history?.state;
  return Boolean(doc.querySelector?.('[data-private-view], [data-project-workspace], [data-project-editor], .tool-embed--expanded')
    || state && typeof state === 'object' && ['projectWorkspaceSelection', 'privateView', 'pxd', 'pxdRevision',
      'pxdImage', 'modePxd', 'modePxdRevision', 'modePxdImage', 'modeProjectTool', 'mcpEndpoint',
      'connectionId', 'pairingCode', 'sessionId', 'accessToken', 'browserToken', 'auth', 'code', 'token']
      .some(key => Boolean(state[key])));
}
function localPreview(win) {
  const loc = win.location;
  if (loc?.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(loc.hostname)
      || !PATHS.has(loc.pathname) || loc.hash || !safeQuery(loc.search, true)) return null;
  const value = new URLSearchParams(loc.search).get('drawAdPreview');
  return previews.has(value) ? value : null;
}
function approvedAnchorScript(script, client) {
  if (script?.getAttribute?.('data-overlays') !== 'collapsed-bottom'
      || script.getAttribute('data-draw-mobile-anchor') !== 'true') return false;
  try {
    const source = new URL(script.src);
    return source.origin === 'https://pagead2.googlesyndication.com'
      && source.pathname === '/pagead/js/adsbygoogle.js' && source.username === '' && source.password === ''
      && source.searchParams.getAll('client').length === 1 && source.searchParams.get('client') === client;
  } catch { return false; }
}
function listen(target, type, fn, options) {
  target?.addEventListener?.(type, fn, options);
  return () => target?.removeEventListener?.(type, fn, options);
}

export function isDrawMobileAnchorEligible({ config = drawDisplayAdConfig, origin, protocol, pathname,
  search = '', hash = '', topLevel = false, mode = '', desktop = false, fullscreen = false,
  privateView = false, pageVisible = true, viewportWidth = 0, viewportHeight = 0,
  visualViewport = null } = {}) {
  const width = Number(viewportWidth), height = Number(viewportHeight);
  return Boolean(config?.enabled === true && CLIENT.test(config?.unit?.client || '')
    && config.productionOrigins?.includes(origin) && protocol === 'https:' && PATHS.has(pathname)
    && safeQuery(search) && hash === '' && topLevel && mode === 'draw' && !desktop && !fullscreen
    && !privateView && pageVisible && width >= 320 && width <= 1000 && height >= 620
    && (!visualViewport || (visualViewport.scale === 1 && visualViewport.offsetTop === 0
      && visualViewport.offsetLeft === 0 && visualViewport.width >= 320
      && visualViewport.height >= 620)));
}

/** Google owns the anchor, including overlap and its close control. No app layout changes. */
export function mountDrawMobileAnchor({ doc = globalThis.document, win = globalThis.window,
  root = doc, config = drawDisplayAdConfig, onOutcome = () => {} } = {}) {
  if (!doc?.body || !doc.head || !win || !root) return () => {};
  if (records.has(doc)) return records.get(doc).cleanup;
  const preview = localPreview(win);
  const eligible = () => {
    const loc = win.location;
    const context = { config, origin: loc?.origin, protocol: loc?.protocol, pathname: loc?.pathname,
      search: loc?.search || '', hash: loc?.hash || '', topLevel: isTopLevel(win),
      mode: doc.body.dataset.creationMode, desktop: doc.body.classList?.contains?.('draw-desktop-active') === true,
      fullscreen: Boolean(doc.fullscreenElement), privateView: privateContext(doc, win),
      pageVisible: doc.visibilityState !== 'hidden', viewportWidth: win.innerWidth,
      viewportHeight: win.innerHeight, visualViewport: win.visualViewport };
    if (preview) return isDrawMobileAnchorEligible({ ...context, origin: config.productionOrigins?.[0],
      protocol: 'https:', search: '', hash: '' });
    return isDrawMobileAnchorEligible(context);
  };
  if (preview === 'off' || !eligible() || doc.querySelector?.('dialog[open]') || doc[ATTEMPT]) return () => {};
  try { Object.defineProperty(doc, ATTEMPT, { value: true }); } catch { return () => {}; }
  const state = { disposed: false, started: false, terminal: false, idle: 0, timer: 0,
    stub: null, cleanups: [], inputCleanups: [], cleanup: null };
  const outcome = value => { try { onOutcome(value); } catch {} };
  const removeIdle = () => {
    if (!state.idle) return;
    if (typeof win.requestIdleCallback === 'function') win.cancelIdleCallback?.(state.idle);
    else win.clearTimeout?.(state.idle);
    state.idle = 0;
  };
  const clearTimer = () => { if (state.timer) win.clearTimeout?.(state.timer); state.timer = 0; };
  const removeInputListeners = () => { for (const release of state.inputCleanups.splice(0)) release(); };
  const finish = reason => {
    if (state.disposed || state.terminal) return;
    state.terminal = true; clearTimer(); removeIdle(); removeInputListeners(); outcome(reason);
  };
  const cleanup = () => {
    if (state.disposed) return;
    state.disposed = true; removeIdle(); clearTimer(); removeInputListeners();
    for (const release of state.cleanups.splice(0)) release();
    state.stub?.remove(); state.stub = null;
    // The SDK may still serve an anchor after Draw is disposed. Keep its display permission.
    // Never inspect, reposition, resize, remove, or manually request Google's creative.
  };
  state.cleanup = cleanup; records.set(doc, state);
  const reuseApprovedAnchor = script => {
    if (!approvedAnchorScript(script, config.unit.client)) return false;
    state.started = true;
    doc.body.setAttribute('data-draw-mobile-ad', 'true');
    finish('existing-anchor');
    return true;
  };
  // A safe chooser may already own the correctly configured SDK. Reuse its permission only.
  if (!preview && reuseApprovedAnchor(doc.querySelector?.(SDK_SELECTOR))) return cleanup;
  const showPreview = () => {
    if (state.disposed || state.terminal) return;
    const stub = doc.createElement('aside'); stub.className = 'draw-mobile-ad-preview';
    stub.dataset.preview = 'true'; stub.setAttribute('role', 'region'); stub.setAttribute('aria-label', '広告・確認用');
    const label = doc.createElement('span'); label.className = 'draw-mobile-ad-preview__label'; label.textContent = '広告・確認用';
    const close = doc.createElement('button'); close.className = 'draw-mobile-ad-preview__close';
    close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', '確認用の広告を閉じる');
    state.cleanups.push(listen(close, 'click', () => { stub.remove(); state.stub = null; }));
    stub.append(label, close); state.stub = stub; doc.body.append(stub); finish('preview-filled');
  };
  const load = () => {
    state.idle = 0;
    if (state.disposed || state.started || state.terminal) return;
    if (!eligible() || doc.querySelector?.('dialog[open]')) { finish('context-changed'); return; }
    state.started = true; removeInputListeners();
    if (preview) {
      if (['unfilled', 'blocked'].includes(preview)) finish(preview);
      else if (preview === 'delayed') state.timer = win.setTimeout(() => { state.timer = 0; showPreview(); }, 1800);
      else showPreview();
      return;
    }
    // A chooser may insert its approved SDK while this idle task is waiting.
    const existingScript = doc.querySelector?.(SDK_SELECTOR);
    if (existingScript || win.adsbygoogle != null) {
      if (!reuseApprovedAnchor(existingScript)) finish('existing-sdk');
      return;
    }
    const script = doc.createElement('script');
    script.async = true; script.crossOrigin = 'anonymous';
    script.setAttribute('data-overlays', 'collapsed-bottom'); script.setAttribute('data-draw-mobile-anchor', 'true');
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(config.unit.client)}`;
    state.cleanups.push(listen(script, 'load', () => finish('sdk-loaded'), { once: true }),
      listen(script, 'error', () => finish('sdk-error'), { once: true }));
    state.timer = win.setTimeout(() => finish('sdk-timeout'), 10000);
    // This flag only excludes Google's unit from the direct editor's generic ad suppression.
    doc.body.setAttribute('data-draw-mobile-ad', 'true');
    try { doc.head.append(script); } catch { finish('sdk-error'); }
  };
  for (const type of ['pointerdown', 'keydown', 'wheel', 'beforeinput', 'paste', 'drop']) {
    state.inputCleanups.push(listen(root, type, () => { if (!state.started) finish('work-started'); }, true));
  }
  state.cleanups.push(listen(win, 'pagehide', event => { if (!event.persisted) cleanup(); }));
  state.idle = typeof win.requestIdleCallback === 'function'
    ? win.requestIdleCallback(load, { timeout: 1800 }) : win.setTimeout(load, 250);
  return cleanup;
}

/** Wait for startup to settle; work input cancels an ad that has not started. */
export function mountDrawMobileAnchorWhenReady({ doc = globalThis.document, win = globalThis.window,
  root = doc, ...options } = {}) {
  if (!doc || !win || !root) return () => {};
  let stopped = false, started = false, timer = 0, mountedCleanup = null;
  const frames = new Set(), releases = [];
  const clearWaiting = () => {
    for (const release of releases.splice(0)) release();
    for (const frame of frames) {
      if (frame.raf) win.cancelAnimationFrame?.(frame.id); else win.clearTimeout?.(frame.id);
    }
    frames.clear(); if (timer) win.clearTimeout?.(timer); timer = 0;
  };
  const cleanup = () => {
    stopped = true; clearWaiting();
    if (mountedCleanup) { const dispose = mountedCleanup; mountedCleanup = null; dispose(); }
  };
  for (const type of ['pointerdown', 'keydown', 'wheel', 'beforeinput', 'paste', 'drop']) releases.push(listen(root, type, cleanup, true));
  const link = doc.querySelector?.('link[rel="stylesheet"][href*="/css/draw-mobile-anchor.css?rev=20261118-draw-display-ad-1"]');
  if (!link) { cleanup(); return cleanup; }
  const nextFrame = callback => {
    const frame = { raf: typeof win.requestAnimationFrame === 'function', id: 0 };
    const run = () => { frames.delete(frame); if (!stopped) callback(); };
    frame.id = frame.raf ? win.requestAnimationFrame(run) : win.setTimeout(run, 16); frames.add(frame);
  };
  const start = () => {
    if (stopped || started || !link.sheet) return;
    started = true;
    nextFrame(() => nextFrame(() => {
      clearWaiting();
      mountedCleanup = mountDrawMobileAnchor({ ...options, doc, win, root });
    }));
  };
  timer = win.setTimeout(cleanup, 3500);
  releases.push(listen(link, 'load', start, { once: true }), listen(link, 'error', cleanup, { once: true }));
  start();
  return cleanup;
}
