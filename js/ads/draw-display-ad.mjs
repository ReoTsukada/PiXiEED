import { getAdsenseLoader } from '../display-ads.mjs?rev=20261118-draw-display-ad-1';
import { drawDisplayAdConfig } from '../../data/draw-display-ad-config.mjs';

export const DRAW_DISPLAY_AD_SIZES = Object.freeze([
  Object.freeze({ width: 300, height: 50 }),
  Object.freeze({ width: 234, height: 60 }),
]);
const VALID_CLIENT = /^ca-pub-\d{16}$/;
const VALID_SLOT = /^\d{6,20}$/;
const DRAW_PATHS = new Set(['/tools/start/draw/', '/draw/editor.html', '/draw/']);
const DIRECT_QUERY = Object.freeze({ workspace: '1', runtime: 'direct', mode: 'draw' });
const ATTEMPTS = Symbol.for('pixieed.draw-display-ad.attempts.v1');
const records = new WeakMap();

export function resolveDrawDisplayAdUnit(config = drawDisplayAdConfig) {
  const unit = config?.unit;
  return config?.enabled === true && unit?.verifiedActive === true
    && unit.format === 'display' && unit.placement === 'fixed'
    && VALID_CLIENT.test(unit.client || '') && VALID_SLOT.test(String(unit.slot || ''))
    ? { client: unit.client, slot: String(unit.slot) } : null;
}

/** Fit a compact banner inside the existing dock without changing canvas dimensions. */
export function getDrawDisplayAdLayout({ viewportWidth = 0, viewportHeight = 0,
  dockWidth = 0, layersHeight = 0, dockLeft = 0, dockTop = 0,
  dockBottom = viewportHeight, visualViewport = null, sizes = DRAW_DISPLAY_AD_SIZES } = {}) {
  const width = Number(viewportWidth), height = Number(viewportHeight);
  const dock = Number(dockWidth), layers = Number(layersHeight);
  const left = Number(dockLeft), top = Number(dockTop), bottom = Number(dockBottom);
  if (![width, height, dock, layers, left, top, bottom].every(Number.isFinite)
      || width <= 0 || height <= 0 || dock <= 0 || layers <= 0 || left < 0 || top < 0 || bottom <= top) return null;
  if (visualViewport && (visualViewport.scale !== 1 || visualViewport.offsetLeft !== 0
      || visualViewport.offsetTop !== 0 || !Number.isFinite(visualViewport.width)
      || !Number.isFinite(visualViewport.height))) return null;
  const usableWidth = visualViewport?.width ?? width;
  const usableHeight = visualViewport?.height ?? height;
  if (left + dock > usableWidth || bottom > usableHeight) return null;
  const minLayersHeight = 112, inset = 18;
  for (const size of sizes) {
    const adWidth = Number(size?.width), adHeight = Number(size?.height);
    // 24px separation + 16px label + 8px gap keeps the creative 48px from controls.
    const reserve = 24 + 16 + 8 + adHeight;
    if (adWidth > 0 && adHeight > 0 && dock - inset >= adWidth
        && layers - reserve >= minLayersHeight) {
      return Object.freeze({ width: adWidth, height: adHeight, reserve, minLayersHeight, inset });
    }
  }
  return null;
}

export function isDrawDisplayAdEligible({ config = drawDisplayAdConfig, origin, protocol,
  pathname, search = '', hash = '', topLevel = false, mode = '', desktop = false,
  fullscreen = false, visualScale = 1, pointerFine = false, privateContext = false,
  pageVisible = true, viewportWidth = 0 } = {}) {
  return Boolean(resolveDrawDisplayAdUnit(config)
    && config.productionOrigins?.includes(origin) && protocol === 'https:'
    && DRAW_PATHS.has(pathname) && safeDrawQuery(search) && hash === ''
    && topLevel === true && mode === 'draw' && desktop === true
    && fullscreen === false && visualScale === 1 && pointerFine === true
    && privateContext === false && pageVisible === true && Number(viewportWidth) >= 1100);
}

function topLevel(win) { try { return win.top === win.self; } catch { return false; } }
function safeDrawQuery(search, { preview = false } = {}) {
  if (!search) return true;
  try {
    const params = new URLSearchParams(search);
    if (params.size === 0) return false;
    for (const [key, value] of params) {
      if (key === 'drawAdPreview' && preview && ['filled', 'delayed', 'unfilled', 'blocked', 'off'].includes(value)) continue;
      if (!(key in DIRECT_QUERY) || value !== DIRECT_QUERY[key] || params.getAll(key).length !== 1) return false;
    }
    const directKeys = Object.keys(DIRECT_QUERY);
    const found = directKeys.filter(key => params.has(key)).length;
    return found === 0 || found === directKeys.length;
  } catch { return false; }
}
function isLocalPreview(win) {
  const location = win?.location;
  return location?.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    && DRAW_PATHS.has(location.pathname);
}
function previewMode(win) {
  if (!isLocalPreview(win) || win.location.hash || !safeDrawQuery(win.location.search, { preview: true })) return null;
  try {
    const params = new URLSearchParams(win.location.search);
    if (params.getAll('drawAdPreview').length !== 1) return null;
    const value = params.get('drawAdPreview');
    return ['filled', 'delayed', 'unfilled', 'blocked', 'off'].includes(value) ? value : null;
  } catch { return null; }
}
function hasPrivateContext(doc, win) {
  const state = win.history?.state;
  return Boolean(doc.querySelector?.('[data-private-view], [data-project-workspace], [data-project-editor], .tool-embed--expanded')
    || state && typeof state === 'object' && ['projectWorkspaceSelection', 'privateView', 'pxd', 'pxdRevision',
      'pxdImage', 'modePxd', 'modePxdRevision', 'modePxdImage', 'modeProjectTool', 'mcpEndpoint',
      'connectionId', 'pairingCode', 'sessionId', 'accessToken', 'browserToken', 'auth', 'code', 'token']
      .some(key => Boolean(state[key])));
}
function claimAttempt(doc) {
  try {
    if (!doc[ATTEMPTS]) Object.defineProperty(doc, ATTEMPTS, { value: new Set() });
    if (doc[ATTEMPTS].has('draw')) return false;
    doc[ATTEMPTS].add('draw'); return true;
  } catch { return false; }
}
function listen(target, type, fn, options) {
  target?.addEventListener?.(type, fn, options);
  return () => target?.removeEventListener?.(type, fn, options);
}
function rect(el) { try { return el?.getBoundingClientRect?.() || null; } catch { return null; } }
function idle(win, callback) {
  if (typeof win.requestIdleCallback === 'function') return win.requestIdleCallback(callback, { timeout: 1800 });
  return win.setTimeout(callback, 250);
}

/** One desktop-only banner in the existing dock. Cleanup is idempotent. */
export function mountDrawDisplayAd({ doc = globalThis.document, win = globalThis.window,
  root = doc, config = drawDisplayAdConfig, loadAdsense = getAdsenseLoader,
  onLayout = () => {}, onOutcome = () => {} } = {}) {
  if (!config?.enabled || !doc || !win || !root) return () => {};
  const previous = records.get(doc);
  if (previous) return previous.cleanup;
  const shell = root.matches?.('.draw-desktop-shell') ? root : root.querySelector?.('.draw-desktop-shell');
  const dock = shell?.querySelector?.('.draw-desktop-dock');
  const palette = dock?.querySelector?.('.draw-desktop-palette-panel');
  const layers = dock?.querySelector?.('.draw-desktop-layers-panel');
  const canvas = shell?.querySelector?.('#draw-canvas') || root.querySelector?.('#draw-canvas');
  if (!shell || !dock || !palette || !layers || !canvas) return () => {};
  const mode = previewMode(win);
  if (mode === 'off') return () => {};
  const layoutEligible = () => {
    let pointerFine = false;
    try { pointerFine = win.matchMedia?.('(pointer:fine)')?.matches === true; } catch {}
    return Number(win.innerWidth) >= 1100 && pointerFine && (win.visualViewport?.scale ?? 1) === 1
      && doc.body?.dataset?.creationMode === 'draw' && doc.body?.classList?.contains?.('draw-desktop-active')
      && !doc.fullscreenElement && topLevel(win);
  };
  const eligible = () => {
    let pointerFine = false;
    try { pointerFine = win.matchMedia?.('(pointer:fine)')?.matches === true; } catch {}
    if (mode) return Number(win.innerWidth) >= 1100 && pointerFine
      && (win.visualViewport?.scale ?? 1) === 1 && doc.body?.dataset?.creationMode === 'draw'
      && doc.body?.classList?.contains?.('draw-desktop-active') && !doc.fullscreenElement
      && topLevel(win);
    const location = win.location;
    return isDrawDisplayAdEligible({ config, origin: location?.origin, protocol: location?.protocol,
      pathname: location?.pathname, search: location?.search || '', hash: location?.hash || '',
      topLevel: topLevel(win), mode: doc.body?.dataset?.creationMode,
      desktop: doc.body?.classList?.contains?.('draw-desktop-active') === true,
      fullscreen: Boolean(doc.fullscreenElement), visualScale: win.visualViewport?.scale ?? 1,
      pointerFine, privateContext: hasPrivateContext(doc, win), pageVisible: true,
      viewportWidth: win.innerWidth });
  };
  if (!eligible() || doc.visibilityState === 'hidden' || doc.querySelector?.('dialog[open]')) return () => {};
  const initialDock = rect(dock), initialLayers = rect(layers);
  const initialLayout = getDrawDisplayAdLayout({ viewportWidth: win.innerWidth,
    viewportHeight: win.innerHeight, dockWidth: initialDock?.width, layersHeight: initialLayers?.height,
    dockLeft: initialDock?.left, dockTop: initialDock?.top, dockBottom: initialDock?.bottom,
    visualViewport: win.visualViewport });
  if (!initialLayout) return () => {};

  const state = { host: null, requested: false, retired: false, finished: false, pointerActive: false,
    timer: 0, idleHandle: 0, idleKind: '', lastInput: 0, observer: null,
    statusObserver: null, loader: null, layout: initialLayout, cleanups: [], adCleanups: [], responseTimer: 0, adFailed: false, adFilled: false };
  records.set(doc, state);
  const outcome = value => { try { onOutcome(value); } catch {} };
  const clearScheduled = () => {
    if (state.timer) { win.clearTimeout?.(state.timer); state.timer = 0; }
    if (state.idleHandle) {
      if (state.idleKind === 'idle') win.cancelIdleCallback?.(state.idleHandle);
      else win.clearTimeout?.(state.idleHandle);
      state.idleHandle = 0;
    }
  };
  const clearAdWork = () => {
    clearScheduled();
    state.statusObserver?.disconnect?.(); state.statusObserver = null;
    if (state.responseTimer) { win.clearTimeout?.(state.responseTimer); state.responseTimer = 0; }
    state.loader?.errors?.delete?.(state.onSdkError);
    for (const remove of state.adCleanups.splice(0)) { try { remove(); } catch {} }
  };
  const fallback = reason => {
    if (state.retired || state.adFailed) return;
    state.adFailed = true; state.requested = true;
    clearAdWork();
    // Remove the failed unit so a late provider callback cannot replace the hint.
    state.slot?.remove?.();
    if (state.host) {
      state.host.dataset.adState = 'fallback'; state.host.dataset.adReason = reason;
      state.host.setAttribute('aria-label', '操作のヒント');
      state.label.textContent = '操作のヒント'; state.hint.hidden = false;
    }
    outcome(reason);
  };
  const filled = () => {
    if (state.retired || state.adFailed || !state.ins) return;
    if (state.responseTimer) { win.clearTimeout?.(state.responseTimer); state.responseTimer = 0; }
    state.host.dataset.adState = 'filled';
    state.host.setAttribute('aria-label', '広告');
    state.label.textContent = mode ? '広告・確認用' : '広告';
    state.hint.hidden = true;
    if (!state.adFilled) outcome('filled');
    state.adFilled = true;
  };
  const removeReservation = () => {
    for (const name of ['--draw-ad-lane-height', '--draw-ad-width', '--draw-ad-height']) dock.style?.removeProperty?.(name);
    dock.removeAttribute?.('data-draw-ad-lane');
    try { onLayout(); } catch {}
  };
  const removeHost = () => { state.host?.remove?.(); state.host = null; };
  const cleanupListeners = () => { for (const remove of state.cleanups.splice(0)) { try { remove(); } catch {} } };
  const finishRetire = () => {
    if (state.finished) return true;
    if (state.pointerActive) return false;
    state.finished = true;
    clearAdWork(); cleanupListeners();
    removeHost(); removeReservation(); outcome(state.reason || 'retired');
    return true;
  };
  const retire = (reason = 'retired') => {
    if (state.retired) return;
    state.retired = true; state.reason = reason;
    if (state.host) { state.host.hidden = true; state.host.dataset.adState = reason; }
    clearAdWork();
    if (!finishRetire()) {
      const release = () => { if (!state.pointerActive) finishRetire(); else state.timer = win.setTimeout(release, 250); };
      state.cleanups.push(listen(canvas, 'pointerup', release, true), listen(canvas, 'pointercancel', release, true), listen(canvas, 'lostpointercapture', release, true));
    }
  };
  const cleanup = () => {
    if (state.finished) return;
    // Disposal may remove the canvas before its terminal pointer event arrives.
    // Unlike a temporary geometry change, it must release ownership immediately.
    state.pointerActive = false; state.reason = 'disposed';
    if (!state.retired) retire('disposed');
    else finishRetire();
  };
  state.cleanup = cleanup;
  const schedule = delay => {
    if (state.retired || state.requested || state.timer || state.idleHandle) return;
    state.timer = win.setTimeout(() => {
      state.timer = 0;
      if (state.retired || state.requested) return;
      if (doc.querySelector?.('dialog[open]')) { schedule(500); return; }
      if (!eligible()) { if (!layoutEligible()) retire('context'); else fallback('private-context'); return; }
      if (doc.visibilityState === 'hidden' || state.pointerActive || Date.now() - state.lastInput < 1200) {
        schedule(500); return;
      }
      state.idleKind = typeof win.requestIdleCallback === 'function' ? 'idle' : 'timeout';
      state.idleHandle = idle(win, () => {
        state.idleHandle = 0;
        if (state.retired || state.requested) return;
        if (doc.querySelector?.('dialog[open]')) { schedule(500); return; }
        if (!eligible()) { if (!layoutEligible()) retire('context'); else fallback('private-context'); return; }
        if (doc.visibilityState === 'hidden' || state.pointerActive || Date.now() - state.lastInput < 1200) { schedule(500); return; }
        request();
      });
    }, delay);
  };
  const stillFits = () => {
    if (!layoutEligible()) return false;
    const dockBounds = rect(dock), layerBounds = rect(layers);
    const viewportWidth = Math.min(Number(win.innerWidth || 0), Number(win.visualViewport?.width || win.innerWidth || 0));
    const viewportHeight = Math.min(Number(win.innerHeight || 0), Number(win.visualViewport?.height || win.innerHeight || 0));
    if (!dockBounds || !layerBounds || dockBounds.width - state.layout.inset < state.layout.width
        || layerBounds.height < state.layout.minLayersHeight || dockBounds.left < 0 || dockBounds.top < 0
        || dockBounds.right > viewportWidth || dockBounds.bottom > viewportHeight
        || layerBounds.bottom + state.layout.reserve > dockBounds.bottom + 1) return false;
    // The fixed-size creative must remain fully inside its dock after resize.
    const hostBounds = state.host && !state.host.hidden ? rect(state.host) : null;
    return !hostBounds || (hostBounds.width >= state.layout.width && hostBounds.height >= state.layout.reserve
      && hostBounds.left >= dockBounds.left && hostBounds.right <= dockBounds.right
      && hostBounds.top >= layerBounds.bottom && hostBounds.bottom <= dockBounds.bottom);
  };
  const checkContext = () => {
    if (state.retired) return false;
    if (!stillFits()) { retire('geometry'); return false; }
    if (!eligible()) { fallback('private-context'); return false; }
    return !state.adFailed;
  };
  const reserveLane = () => {
    dock.style?.setProperty?.('--draw-ad-lane-height', `${state.layout.reserve}px`);
    dock.style?.setProperty?.('--draw-ad-width', `${state.layout.width}px`);
    dock.style?.setProperty?.('--draw-ad-height', `${state.layout.height}px`);
    dock.setAttribute?.('data-draw-ad-lane', 'true');
    try { onLayout(); } catch {}
  };
  const makeShell = () => {
    const host = doc.createElement('aside');
    host.className = 'draw-display-ad'; host.setAttribute('aria-label', '操作のヒント');
    host.dataset.adState = 'loading';
    const label = doc.createElement('span'); label.className = 'draw-display-ad__label';
    label.textContent = '操作のヒント';
    const slot = doc.createElement('div'); slot.className = 'draw-display-ad__slot'; slot.hidden = true;
    const hint = doc.createElement('p'); hint.className = 'draw-display-ad__hint';
    hint.textContent = '線や色はレイヤーを分けると、あとから直しやすくなります。';
    host.append(label, slot, hint);
    dock.append(host); state.host = host; state.slot = slot; state.label = label; state.hint = hint;
    if (mode) host.dataset.preview = 'true';
    return host;
  };
  const prepareAdSlot = () => {
    if (state.retired || state.adFailed) return false;
    // Create the AdSense unit only when it can be requested visibly. The SDK
    // never sees an initially hidden ins, and the hint never covers a creative.
    state.hint.hidden = true; state.slot.hidden = false;
    state.host.setAttribute('aria-label', '広告');
    state.label.textContent = '広告';
    const ins = doc.createElement('ins'); ins.className = 'adsbygoogle draw-display-ad__unit';
    ins.style.display = 'block'; ins.style.width = `${state.layout.width}px`; ins.style.height = `${state.layout.height}px`;
    ins.dataset.adClient = resolveDrawDisplayAdUnit(config)?.client || '';
    ins.dataset.adSlot = resolveDrawDisplayAdUnit(config)?.slot || '';
    ins.dataset.fullWidthResponsive = 'false'; state.slot.append(ins); state.ins = ins;
    return true;
  };
  const setPreviewState = preview => {
    if (state.retired || state.adFailed) return;
    if (!stillFits()) { retire('geometry'); return; }
    if (preview === 'unfilled' || preview === 'blocked') { fallback(preview); return; }
    if (preview === 'delayed') {
      state.responseTimer = win.setTimeout(() => { state.responseTimer = 0; setPreviewState('filled'); }, 1800);
      return;
    }
    if (!prepareAdSlot()) return;
    const copy = doc.createElement('span'); copy.className = 'draw-display-ad__preview-copy';
    copy.textContent = `確認用の広告枠 ${state.layout.width} × ${state.layout.height}`;
    state.ins.append(copy); filled();
  };
  const readAdStatus = () => {
    if (state.retired || state.adFailed) return;
    // data-adsbygoogle-status describes initialization, not whether an ad filled.
    const status = state.ins?.dataset?.adStatus;
    if (status === 'unfilled') fallback('unfilled');
    else if (status === 'filled' || status === 'unfill-optimized') filled();
  };
  const request = () => {
    if (state.requested || state.retired || state.adFailed || doc.querySelector?.('dialog[open]')) return;
    if (!checkContext()) return;
    if (!claimAttempt(doc)) { fallback('document-limit'); return; }
    state.requested = true;
    if (mode) { setPreviewState(mode); return; }
    const client = resolveDrawDisplayAdUnit(config)?.client;
    if (!client) { fallback('configuration'); return; }
    try {
      state.loader = loadAdsense(doc, win, client);
      if (!state.loader || state.loader.failed || !state.loader.script?.addEventListener) { fallback('sdk-error'); return; }
      const patchedQueue = win.adsbygoogle && win.adsbygoogle.push !== Array.prototype.push;
      const knownLoaded = ['loaded', 'complete'].includes(state.loader.script.readyState) || patchedQueue;
      state.onSdkError = () => fallback('sdk-error');
      state.loader.errors?.add?.(state.onSdkError);
      let queued = false;
      state.responseTimer = win.setTimeout(() => fallback('sdk-timeout'), 15000);
      const onLoad = () => {
        if (state.retired || state.adFailed || queued) return;
        queued = true;
        state.loader?.errors?.delete?.(state.onSdkError);
        if (!checkContext()) return;
        if (doc.visibilityState === 'hidden' || state.host?.hidden || doc.querySelector?.('dialog[open]')) { fallback('not-visible'); return; }
        try {
          if (!prepareAdSlot()) return;
          if (typeof win.MutationObserver === 'function') {
            state.statusObserver = new win.MutationObserver(readAdStatus);
            state.statusObserver.observe(state.ins, { attributes: true, attributeFilter: ['data-ad-status'] });
          }
          win.adsbygoogle = win.adsbygoogle || []; win.adsbygoogle.push({});
          if (state.responseTimer) { win.clearTimeout?.(state.responseTimer); state.responseTimer = 0; }
          readAdStatus();
          if (!state.retired && !state.adFailed && !state.adFilled) {
            state.responseTimer = win.setTimeout(() => {
              readAdStatus();
              if (!state.retired && !state.adFailed && !state.adFilled) fallback('response-timeout');
            }, 15000);
          }
        }
        catch { fallback('request-error'); }
      };
      const onError = () => fallback('sdk-error');
      state.adCleanups.push(listen(state.loader.script, 'load', onLoad, { once: true }), listen(state.loader.script, 'error', onError, { once: true }));
      if (knownLoaded) onLoad();
    } catch { fallback('sdk-error'); }
  };
  // One stable hint/advertisement row is reserved before any provider work begins.
  const ensureReservationAndSchedule = () => {
    if (state.retired || state.requested) return;
    if (!state.host) { reserveLane(); makeShell(); }
    if (mode === 'blocked') fallback('blocked');
    else schedule(700);
  };
  // Preview and live share the exact same layout gate; preview has no network code path.
  state.cleanups.push(listen(doc, 'visibilitychange', () => { if (checkContext() && doc.visibilityState !== 'hidden') ensureReservationAndSchedule(); }));
  const input = () => { state.lastInput = Date.now(); };
  state.cleanups.push(listen(root, 'pointerdown', input, true), listen(root, 'keydown', input, true));
  state.cleanups.push(listen(canvas, 'pointerdown', () => { state.pointerActive = true; input(); }, true));
  const pointerEnd = () => { state.pointerActive = false; input(); if (state.retired) finishRetire(); else if (!state.requested) schedule(1200); };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) state.cleanups.push(listen(canvas, type, pointerEnd, true));
  state.cleanups.push(listen(doc, 'fullscreenchange', checkContext, true),
    listen(doc, 'toggle', () => {
      const overlay = Boolean(doc.querySelector?.('dialog[open]'));
      if (state.host) state.host.hidden = overlay;
      if (!overlay && !state.requested) schedule(100);
    }, true),
    listen(doc, 'close', () => {
      const overlay = Boolean(doc.querySelector?.('dialog[open]'));
      if (state.host) state.host.hidden = overlay;
      if (!overlay && !state.requested) schedule(100);
    }, true),
    listen(win, 'resize', checkContext, { passive: true }),
    listen(win.visualViewport, 'resize', checkContext, { passive: true }),
    listen(win, 'pagehide', () => retire('pagehide'), { once: true }));
  if (typeof win.MutationObserver === 'function') {
    state.observer = new win.MutationObserver(checkContext);
    state.observer.observe(doc.body, { attributes: true, attributeFilter: ['class', 'data-creation-mode'] });
    state.cleanups.push(() => { state.observer?.disconnect?.(); state.observer = null; });
  }
  if (typeof win.ResizeObserver === 'function') {
    state.resizeObserver = new win.ResizeObserver(checkContext);
    for (const node of [dock, palette, layers]) state.resizeObserver.observe(node);
    state.cleanups.push(() => { state.resizeObserver?.disconnect?.(); state.resizeObserver = null; });
  }
  // Only the dock reserves a banner row; the canvas and outer shell keep their dimensions.
  ensureReservationAndSchedule();
  return cleanup;
}

/** Mount only after Draw's desktop stylesheet has applied and before the first work input. */
export function mountDrawDisplayAdWhenReady({ doc = globalThis.document, win = globalThis.window,
  root = doc, onLayout = () => {}, ...options } = {}) {
  if (!(options.config ?? drawDisplayAdConfig).enabled || !doc || !win || !root) return () => {};
  let stopped = false;
  let timeout = 0;
  let mountedCleanup = null;
  const frames = new Set();
  const releases = [];
  const releaseWaiters = () => {
    for (const release of releases.splice(0)) { try { release(); } catch {} }
  };
  const cancelFrames = () => {
    for (const frame of frames) {
      if (frame.kind === 'raf') win.cancelAnimationFrame?.(frame.handle);
      else win.clearTimeout?.(frame.handle);
    }
    frames.clear();
  };
  const clearWaiting = () => {
    releaseWaiters();
    cancelFrames();
    if (timeout) { win.clearTimeout?.(timeout); timeout = 0; }
  };
  const cleanup = () => {
    if (!stopped) stopped = true;
    clearWaiting();
    if (mountedCleanup) { const dispose = mountedCleanup; mountedCleanup = null; dispose(); }
  };
  const abort = () => cleanup();
  for (const type of ['pointerdown', 'keydown', 'wheel', 'beforeinput', 'paste', 'drop']) {
    releases.push(listen(root, type, abort, true));
  }
  const link = doc.querySelector?.('link[data-draw-desktop-ui]');
  if (!link) { cleanup(); return cleanup; }
  timeout = win.setTimeout(cleanup, 3500);
  const scheduleFrame = callback => {
    if (stopped) return;
    const frame = { kind: typeof win.requestAnimationFrame === 'function' ? 'raf' : 'timeout', handle: 0 };
    const run = () => { frames.delete(frame); if (!stopped) callback(); };
    frame.handle = frame.kind === 'raf' ? win.requestAnimationFrame(run) : win.setTimeout(run, 16);
    frames.add(frame);
  };
  const startAfterPaint = () => {
    if (stopped) return;
    scheduleFrame(() => scheduleFrame(() => {
      if (stopped) return;
      clearWaiting();
      try { mountedCleanup = mountDrawDisplayAd({ ...options, doc, win, root, onLayout }); }
      catch { mountedCleanup = null; }
    }));
  };
  const onLoad = () => { if (link.sheet) startAfterPaint(); };
  const onError = () => cleanup();
  if (link.sheet) startAfterPaint();
  else {
    releases.push(listen(link, 'load', onLoad, { once: true }), listen(link, 'error', onError, { once: true }));
  }
  return cleanup;
}
