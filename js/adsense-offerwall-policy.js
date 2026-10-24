/** Site-owned eligibility gate for Google's provider-controlled Offerwall. */
(() => {
  const INTRO_PATHS = ['/draw/', '/camera/', '/audio/'];
  const SETUP_PATHS = ['/spot-difference/', '/hidden-object/', '/jigsaw/', '/output/work/'];
  const TOOL_PATHS = [...INTRO_PATHS, ...SETUP_PATHS];
  if (window.top !== window.self) return;

  const cleanToolEntry = () => window.location?.protocol === 'https:'
    && window.location?.origin === 'https://pixieed.jp'
    && TOOL_PATHS.includes(window.location.pathname)
    && window.location.search === '' && window.location.hash === ''
    && window.history?.state?.pixieedWorkspace !== true;
  let retired = false;
  let setupReady = false;
  let state = 'denied';
  const listeners = new Set();
  const path = window.location?.pathname;
  if (cleanToolEntry() && INTRO_PATHS.includes(path)) state = 'eligible';
  else if (cleanToolEntry() && SETUP_PATHS.includes(path)) state = 'pending';

  const isEligible = () => {
    if (retired) return false;
    if (!cleanToolEntry()) {
      if (state === 'eligible') retire();
      return false;
    }
    return INTRO_PATHS.includes(window.location.pathname)
      || (SETUP_PATHS.includes(window.location.pathname) && setupReady);
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
    if (options?.fresh !== true || !cleanToolEntry() || !SETUP_PATHS.includes(window.location.pathname)) { retire(); return false; }
    setupReady = true;
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

  if (state === 'eligible' || state === 'pending') {
    const retireOnStart = (event) => {
      if (event.target?.closest?.('[data-embed-start]')) { retire(); return; }
      if (!SETUP_PATHS.includes(window.location.pathname)
          || !event.target?.closest?.('main, .project-bar, header.site-header, #pxd-panel, .app-tabs')) return;
      const action = event.target?.closest?.('[data-tool-operation], button, input, select, textarea, canvas, [contenteditable="true"], [role="button"]');
      if (!action) return;
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      retire();
    };
    for (const type of ['pointerdown', 'click', 'keydown', 'beforeinput', 'input', 'change', 'paste', 'drop']) document.addEventListener(type, retireOnStart, true);
    window.addEventListener?.('pagehide', retire, { once: true });
  }

  const googlefc = window.googlefc = window.googlefc || {};
  googlefc.controlledMessagingFunction = (message) => {
    const offerwall = window.googlefc?.MessageTypeEnum?.OFFERWALL;
    if (offerwall == null) { message.proceed(true); return; }
    // This grants provider permission only; it does not force display or revoke an accepted Offerwall.
    if (isEligible()) message.proceed(true);
    else message.proceed(false, [offerwall]);
  };
})();
