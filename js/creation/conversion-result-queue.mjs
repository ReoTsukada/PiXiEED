/** Keep conversion output previews latest-only and bounded to one pending run. */
export function createResultPreviewQueue({ render, onState = () => {}, timers = globalThis, delay = 220 } = {}) {
  if (typeof render !== 'function') throw new TypeError('render must be a function');

  let key = null;
  let state = 'empty';
  let result = null;
  let resultKey = null;
  let error = null;
  let hasSource = false;
  let automatic = true;
  let supported = true;
  let payload;
  let timer = null;
  let controller = null;
  let version = 0;
  let destroyed = false;

  const snapshot = () => ({ key, state, result, resultKey, error });
  const publish = () => {
    if (!destroyed) onState(snapshot());
  };
  const clearTimer = () => {
    if (timer !== null) {
      timers.clearTimeout(timer);
      timer = null;
    }
  };
  const cancelWork = () => {
    clearTimer();
    if (controller) {
      controller.abort();
      controller = null;
    }
    version++;
  };
  const run = (runVersion) => {
    if (destroyed || runVersion !== version || !hasSource || !supported) return;
    timer = null;
    const activeController = new AbortController();
    controller = activeController;
    state = 'rendering';
    error = null;
    publish();
    let work;
    try {
      work = render(payload, { signal: activeController.signal });
    } catch (cause) {
      work = Promise.reject(cause);
    }
    Promise.resolve(work).then((output) => {
      if (destroyed || runVersion !== version || controller !== activeController) return;
      controller = null;
      result = output;
      resultKey = key;
      state = 'ready';
      error = null;
      publish();
    }, (cause) => {
      if (destroyed || runVersion !== version || controller !== activeController) return;
      controller = null;
      state = 'error';
      error = cause;
      publish();
    });
  };
  const schedule = (immediate = false) => {
    cancelWork();
    const scheduledVersion = version;
    state = 'queued';
    error = null;
    publish();
    if (immediate) run(scheduledVersion);
    else timer = timers.setTimeout(() => run(scheduledVersion), Math.max(0, Number(delay) || 0));
  };

  return {
    request(request = {}) {
      if (destroyed) return snapshot();
      const nextKey = request.key ?? null;
      const nextHasSource = request.hasSource !== false;
      const nextAutomatic = request.automatic !== false;
      const nextSupported = request.supported !== false;
      const unchanged = key === nextKey && hasSource === nextHasSource && automatic === nextAutomatic && supported === nextSupported;
      if (unchanged) return snapshot();

      cancelWork();
      key = nextKey;
      hasSource = nextHasSource;
      automatic = nextAutomatic;
      supported = nextSupported;
      payload = request.payload;
      error = null;
      if (!hasSource) {
        state = 'empty';
        publish();
      } else if (!supported || !automatic) {
        state = 'manual';
        publish();
      } else {
        schedule();
      }
      return snapshot();
    },
    refresh() {
      if (destroyed || !hasSource || !supported || state === 'queued' || state === 'rendering') return false;
      schedule(true);
      return true;
    },
    pause() {
      if (destroyed) return snapshot();
      cancelWork();
      state = 'paused';
      error = null;
      publish();
      return snapshot();
    },
    destroy() {
      if (destroyed) return;
      cancelWork();
      destroyed = true;
    },
    get snapshot() {
      return snapshot();
    }
  };
}
