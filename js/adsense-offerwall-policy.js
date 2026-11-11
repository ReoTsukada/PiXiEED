/** Site-owned entry gate for Google's provider-controlled Offerwall. */
(() => {
  const START_PATHS = [
    '/tools/start/draw/', '/tools/start/camera/', '/tools/start/audio/',
    '/tools/start/spot-difference/', '/tools/start/hidden-object/',
    '/tools/start/jigsaw/', '/tools/start/convert/',
  ];
  const OUTPUT_PATHS = ['/tools/start/convert/', '/output/work/', '/output/work/index.html'];
  const MODE_BY_PATH = Object.freeze({
    '/tools/start/draw/': 'draw',
    '/tools/start/camera/': 'camera',
    '/tools/start/audio/': 'audio',
  });
  if (window.top !== window.self) return;

  const startPath = window.location?.pathname;
  const isConverterStart = OUTPUT_PATHS.includes(startPath);
  const converterReferrerSafe = () => {
    if (!isConverterStart) return true;
    const referrer = String(document.referrer || '');
    if (!referrer) return true;
    try {
      const url = new URL(referrer);
      return ['http:', 'https:'].includes(url.protocol)
        && !url.search && !url.hash && !/[?#]/.test(referrer);
    } catch { return false; }
  };
  const isGoogleOfferwallPreviewSearch = (params) => {
    if (!isConverterStart) return false;
    const keys = [...params.keys()];
    return keys.length === 2
      && params.getAll('fc').length === 1 && params.get('fc') === 'alwaysshow'
      && params.getAll('fctype').length === 1 && params.get('fctype') === 'monetization';
  };
  const freshInitialSearch = (search) => {
    const params = new URLSearchParams(search || '');
    if (isGoogleOfferwallPreviewSearch(params)) return true;
    if (isConverterStart) {
      const allowed = { workspace: ['1'], social: ['1'], entry: ['1'], mode: ['convert'], text: ['input', 'output'] };
      return [...params.keys()].every(key => params.getAll(key).length === 1 && Array.isArray(allowed[key]) && allowed[key].includes(params.get(key)));
    }
    for (const key of params.keys()) {
      if (!['workspace', 'social'].includes(key) || params.getAll(key).length !== 1 || params.get(key) !== '1') return false;
    }
    return true;
  };
  const mode = MODE_BY_PATH[startPath] || null;
  const hasConverterRecoveryHistory = () => isConverterStart && [
    'pixieedConversionRecovery', 'pixieedConversionRecoveryPrevious', 'pixieedConversionRecoveryPaused'
  ].some(key => Object.prototype.hasOwnProperty.call(window.history?.state || {}, key));
  const initialHistoryFresh = isConverterStart || (window.history?.state?.pixieedWorkspace !== true
    && window.history?.state?.projectWorkspaceSelection !== true
    && window.history?.state?.toolStartActive !== true
    && !hasConverterRecoveryHistory());
  const initialEntryFresh = window.location?.protocol === 'https:'
    && window.location?.origin === 'https://pixieed.jp'
    && (START_PATHS.includes(startPath) || isConverterStart)
    && !window.location.hash
    && freshInitialSearch(window.location.search)
    && converterReferrerSafe()
    && initialHistoryFresh;

  let retired = false;
  let setupReady = false;
  let state = initialEntryFresh ? 'pending' : 'denied';
  let readySearch = null;
  const listeners = new Set();

  // A direct host may append only these runtime-owned keys after it captured a
  // fresh initial URL. Pointers, ids, unknown keys, and hashes remain denied.
  const knownInternalSearch = (search) => {
    const params = new URLSearchParams(search || '');
    const allowed = new Set(['workspace', 'social', 'runtime', 'mode', 'modeProjectTool']);
    let hasInternal = false;
    for (const key of params.keys()) {
      if (!allowed.has(key) || params.getAll(key).length !== 1) return false;
      const value = params.get(key);
      if (key === 'workspace' || key === 'social') {
        if (value !== '1') return false;
      } else if (key === 'runtime') {
        if (value !== 'direct') return false;
        hasInternal = true;
      } else if (key === 'mode' || key === 'modeProjectTool') {
        if (!mode || value !== mode) return false;
        hasInternal = true;
      }
    }
    return hasInternal;
  };
  const currentRouteSafe = () => window.location?.protocol === 'https:'
    && window.location?.origin === 'https://pixieed.jp'
    && window.location.pathname === startPath
    && (START_PATHS.includes(startPath) || isConverterStart)
    && !window.location.hash
    && converterReferrerSafe()
    && initialHistoryFresh;
  const isEligible = () => {
    if (retired || !setupReady) return false;
    if (!currentRouteSafe() || (isConverterStart ? !freshInitialSearch(window.location.search)
        : window.location.search !== readySearch && !knownInternalSearch(window.location.search))) {
      retire();
      return false;
    }
    return true;
  };
  const notify = () => {
    const eligible = isEligible();
    if (!eligible && state === 'eligible') state = 'denied';
    for (const listener of [...listeners]) {
      try { listener({ eligible, state }); } catch { /* Isolate optional subscribers. */ }
    }
  };
  const retire = () => {
    if (retired) return;
    retired = true;
    setupReady = false;
    state = 'denied';
    notify();
  };
  const ready = (options = {}) => {
    if (retired || state !== 'pending') return false;
    if ((options?.fresh !== true || (isConverterStart && options?.output !== true)) || !initialEntryFresh || !currentRouteSafe()
        || !(freshInitialSearch(window.location.search) || knownInternalSearch(window.location.search))) {
      retire();
      return false;
    }
    setupReady = true;
    readySearch = window.location.search;
    state = 'eligible';
    notify();
    return isEligible();
  };

  window.__PIXIEED_OFFERWALL_ENTRY__ = Object.freeze({
    ready,
    retire,
    isEligible,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      try { listener({ eligible: isEligible(), state }); } catch { /* Isolate optional subscribers. */ }
      return () => listeners.delete(listener);
    },
  });

  if (initialEntryFresh) {
    const retireOnWork = (event) => {
      if (isConverterStart) return; // One page-entry opportunity; settings/downloads do not rearm it.
      if (!setupReady && !['click', 'pointerdown', 'keydown', 'beforeinput', 'input', 'change', 'paste', 'drop'].includes(event.type)) return;
      const roots = 'main, .project-bar, header.site-header, #pxd-panel, .app-tabs, [data-direct-chrome], [data-tool-operation], #output-file-input, #output-audio-replacement-input';
      if (!event.target?.closest?.(roots)) return;
      const action = event.target?.closest?.('[data-tool-operation], [data-embed-start], button, input, select, textarea, canvas, [contenteditable="true"], [role="button"]');
      if (!action) return;
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      retire();
    };
    for (const type of ['pointerdown', 'click', 'keydown', 'beforeinput', 'input', 'change', 'paste', 'drop']) document.addEventListener(type, retireOnWork, true);
    window.addEventListener?.('pagehide', retire, { once: true });
    window.addEventListener?.('popstate', retire);
  }

  const googlefc = window.googlefc = window.googlefc || {};
  googlefc.controlledMessagingFunction = (message) => {
    const offerwall = window.googlefc?.MessageTypeEnum?.OFFERWALL;
    // Unknown provider enums must not hold or suppress CMP messaging.
    if (offerwall == null) { message.proceed(true); return; }
    // This grants provider permission only; it cannot force or retract an Offerwall.
    if (isEligible()) message.proceed(true);
    else message.proceed(false, [offerwall]);
  };
})();
