/** Owns one opt-in attempt. Only a matching adapter receipt after accepted show can grant. */
export function createRewardedController({
  createAdapter, onGrant = () => {}, onChange = () => {},
  timeoutMs = 15_000, playbackTimeoutMs = 180_000, lateGrantMs = 5_000,
  schedule = setTimeout, cancelSchedule = clearTimeout
} = {}) {
  if (typeof createAdapter !== 'function') throw new TypeError('createAdapter must be a function');
  let phase = 'idle';
  let attempt = 0;
  let generation = 0;
  let adapter = null;
  let authorized = false;
  let showIssued = false;
  let closed = false;
  let rewarded = false;
  let busy = false;
  let disposed = false;
  let timer = null;
  let resolver = null;
  let signal = null;
  let abortHandler = null;
  let onReadyCallback = null;
  let onRestoreCallback = null;
  let grantPromise = null;
  let queued = [];

  const publish = (event, extra = {}) => {
    try { onChange({ phase, attempt, event, rewarded, ...extra }); } catch {}
  };
  const clearTimer = () => {
    if (timer === null) return;
    try { cancelSchedule(timer); } catch {}
    timer = null;
  };
  const cleanup = () => {
    generation++;
    clearTimer();
    if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
    signal = null; abortHandler = null;
    const prior = adapter; adapter = null; queued = [];
    try { prior?.destroy?.(); } catch {}
  };
  const isCurrent = token => Boolean(resolver) && token === generation && !disposed;
  const finish = (result, token = generation) => {
    if (!resolver || token !== generation) return false;
    const resolve = resolver; resolver = null;
    phase = result;
    cleanup(); publish(result); resolve(result); return true;
  };

  function showFor(token) {
    if (!isCurrent(token) || phase !== 'ready' || !adapter || showIssued || busy) return false;
    authorized = true; busy = true; queued = []; phase = 'showing'; publish('show-requested');
    let accepted = false;
    try { accepted = adapter.show() === true; }
    catch { busy = false; finish('error', token); return false; }
    busy = false;
    if (!isCurrent(token)) { queued = []; return false; }
    if (!accepted) { queued = []; authorized = false; finish('error', token); return false; }
    showIssued = true;
    try { timer = schedule(() => { if (isCurrent(token)) finish(rewarded ? 'granted' : 'timeout', token); }, playbackTimeoutMs); }
    catch { finish('error', token); return false; }
    const events = queued; queued = [];
    for (const event of events) receive(event, token);
    return true;
  }
  function show() { return showFor(generation); }
  function cancelFor(token) {
    // Once a valid receipt starts persistence, cancellation cannot undo it.
    // Keep the attempt pending until that persistence succeeds or fails.
    if (rewarded) return false;
    return finish('cancelled', token);
  }
  function cancel() { return cancelFor(generation); }

  function receive(event, token) {
    if (!isCurrent(token) || !event || typeof event.type !== 'string') return;
    if (busy) { queued.push(event); return; }
    const type = event.type;
    if (type === 'ready') {
      if (phase !== 'loading' || !adapter) return;
      clearTimer(); phase = 'ready'; publish('ready');
      try { onReadyCallback?.({ show: () => showFor(token), cancel: () => cancelFor(token) }); }
      catch { finish('error', token); }
      return;
    }
    if (type === 'granted') {
      if (!showIssued || !authorized || rewarded || !['showing', 'closed'].includes(phase)) return;
      // Keep the playback deadline in case the close notification is lost.
      rewarded = true;
      try { grantPromise = Promise.resolve(onGrant({ attempt })); }
      catch { finish('error', token); return; }
      grantPromise.then(() => {
        if (!isCurrent(token)) return;
        if (closed) finish('granted', token);
        else { phase = 'granted'; publish('granted'); }
      }).catch(() => { if (isCurrent(token)) finish('error', token); });
      return;
    }
    if (type === 'closed') {
      if (!showIssued || closed || !['showing', 'granted'].includes(phase)) return;
      closed = true;
      clearTimer();
      try { onRestoreCallback?.(); } catch {}
      if (rewarded) {
        grantPromise?.then(() => { if (isCurrent(token)) finish('granted', token); })
          .catch(() => { if (isCurrent(token)) finish('error', token); });
        return;
      }
      phase = 'closed'; publish('closed');
      // Keep this attempt's receipt listener briefly: GPT may dispatch Granted after Closed.
      try { timer = schedule(() => { if (isCurrent(token)) finish('closed', token); }, lateGrantMs); }
      catch { finish('closed', token); }
      return;
    }
    if (type === 'videoCompleted') { if (showIssued) publish('videoCompleted'); return; }
    if (type === 'noFill' || type === 'unsupported') { if (!showIssued) finish(type === 'noFill' ? 'no-fill' : 'unsupported', token); return; }
    if (type === 'error') finish('error', token);
  }

  function run({ optIn = false, onReady, onRestore, signal: abortSignal } = {}) {
    if (optIn !== true || resolver || disposed) return Promise.resolve('cancelled');
    attempt++;
    // State is attempt-local even when the controller instance is reused.
    authorized = false; showIssued = false; closed = false; rewarded = false; busy = false;
    grantPromise = null; queued = []; timer = null; adapter = null;
    onReadyCallback = onReady; onRestoreCallback = onRestore;
    signal = null; abortHandler = null;
    const token = ++generation;
    return new Promise(resolve => {
      resolver = resolve; phase = 'loading'; publish('loading');
      if (abortSignal?.aborted) { finish('cancelled', token); return; }
      signal = abortSignal || null;
      if (signal) { abortHandler = () => cancelFor(token); signal.addEventListener('abort', abortHandler, { once: true }); }
      try {
        adapter = createAdapter({ emit: event => { if (token === generation) receive(event, token); }, attempt });
        if (!adapter || typeof adapter.prepare !== 'function' || typeof adapter.show !== 'function' || typeof adapter.destroy !== 'function') {
          finish('unsupported', token); return;
        }
        timer = schedule(() => { if (isCurrent(token)) finish('timeout', token); }, timeoutMs);
        Promise.resolve(adapter.prepare()).catch(() => { if (isCurrent(token)) finish('error', token); });
      } catch { finish('error', token); }
    });
  }
  function dispose() { if (disposed) return; disposed = true; if (resolver) finish('cancelled'); else cleanup(); }
  return { run, show, cancel, dispose, get state() { return { phase, attempt, rewarded }; } };
}
