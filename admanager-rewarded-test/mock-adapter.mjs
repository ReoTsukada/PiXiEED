const EVENT_TYPES = new Set(['ready', 'granted', 'closed', 'videoCompleted', 'noFill', 'unsupported', 'error']);

/** Deterministic local adapter for the rewarded-controller demo and tests. */
export function createMockAdapter({
  emit,
  scenario = 'normal',
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
  delayMs = 150
} = {}) {
  if (typeof emit !== 'function') throw new TypeError('emit must be a function');
  let status = 'new';
  let shown = false;
  let closed = false;
  let destroyed = false;
  const timers = new Set();

  const clearTimers = () => {
    for (const timer of timers) {
      try { cancelSchedule(timer); } catch { /* Best-effort local cleanup. */ }
    }
    timers.clear();
  };
  const scheduleEvent = (type, message = '') => {
    let timer;
    timer = schedule(() => {
      timers.delete(timer);
      fire(type, undefined, message);
    }, delayMs);
    timers.add(timer);
  };
  const fire = (type, payload, message = '') => {
    if (destroyed || !EVENT_TYPES.has(type)) return false;
    if (type === 'granted' && !shown) return false;
    if (type === 'closed' && !shown) return false;
    if (type === 'videoCompleted' && !shown) return false;
    if (['noFill', 'unsupported', 'error'].includes(type) && shown) return false;
    if (type === 'ready') {
      if (status !== 'loading') return false;
      status = 'ready';
    }
    if (type === 'closed') { if (closed) return false; closed = true; status = 'closed'; }
    if (type === 'granted') status = closed ? 'closed' : 'granted';
    if (['noFill', 'unsupported', 'error'].includes(type)) status = type;
    emit({ type, ...(payload === undefined ? {} : { payload }), ...(message ? { message } : {}) });
    return true;
  };

  return {
    prepare() {
      if (destroyed || status !== 'new') return;
      status = 'loading';
      if (scenario === 'timeout') return;
      if (scenario === 'no-fill') scheduleEvent('noFill', 'No ad was available.');
      else if (scenario === 'unsupported') scheduleEvent('unsupported', 'Rewarded ads are unavailable in this environment.');
      else if (scenario === 'sdk-error') scheduleEvent('error', 'The mock SDK failed.');
      else scheduleEvent('ready');
    },
    show() {
      if (destroyed || status !== 'ready') return false;
      shown = true;
      status = 'showing';
      return true;
    },
    close() {
      if (destroyed) return;
      // The visual slot is released, but this mock keeps the current attempt's
      // event bridge alive so tests can model a delayed grant after close.
      clearTimers();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      status = 'destroyed';
      clearTimers();
    },
    fire,
    get status() { return status; },
    get closed() { return closed; },
    get destroyed() { return destroyed; }
  };
}
