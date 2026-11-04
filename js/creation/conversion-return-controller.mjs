/** Return intent uses the engine's own pending-write navigation port. */
export function createConversionReturnController({ read, activate }) {
  return {
    snapshot() {
      const state = read();
      return state ? { available: true, href: state.href, label: state.label } : { available: false, href: '/output/', label: '← ガイド' };
    },
    request(event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
      if (!read() || typeof activate !== 'function') return false;
      event.preventDefault();
      activate(); // Never duplicate navigation or bypass the pending-write handler.
      return true;
    },
  };
}

/** One pending-write return operation; storage and actual navigation remain ports. */
export function createConversionReturnGate({ pending, navigate, reportFailure = () => {}, isCurrent = () => true }) {
  let inFlight = null, observed = null;
  return {
    observeWrite(write) {
      if (!observed) return;
      observed.add(write);
      // It may settle and leave the native pending set before the first batch.
      Promise.resolve(write).catch(() => {});
    },
    request(href) {
      if (inFlight) return inFlight;
      const writesDuringReturn = new Set(); observed = writesDuringReturn;
      const task = (async () => {
        const seen = new Set();
        let writes = Array.from(pending());
        while (writes.length) {
          for (const write of writes) seen.add(write);
          const results = await Promise.allSettled(writes);
          if (!isCurrent()) return false;
          if (results.some(result => result.status === 'rejected')) {
            reportFailure();
            return false;
          }
          // New edits can enqueue writes while navigation is waiting. Drain
          // those too without repeatedly awaiting already settled promises.
          writes = Array.from(new Set([...pending(), ...writesDuringReturn])).filter(write => !seen.has(write));
        }
        if (!isCurrent()) return false;
        navigate(href);
        return true;
      })();
      inFlight = task;
      const clear = () => { if (inFlight === task) inFlight = null; if (observed === writesDuringReturn) observed = null; };
      task.then(clear, clear);
      return task;
    },
    get pending() { return Boolean(inFlight); },
  };
}
