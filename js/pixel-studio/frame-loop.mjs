/** A DOM-free, single-flight latest-frame pump for expensive preview work. */
export function createFrameLoop({
  captureFrame,
  processFrame,
  publishFrame,
  onError = () => {},
  intervalMs = 500,
  minDelayMs = 100
}) {
  if (typeof captureFrame !== 'function' || typeof processFrame !== 'function' || typeof publishFrame !== 'function') {
    throw new TypeError('captureFrame, processFrame, and publishFrame are required');
  }
  let wanted = false;
  let generation = 0;
  let frameId = 0;
  let activeController = null;
  let runner = null;

  function delay(ms, signal) {
    return new Promise((resolve) => {
      if (signal.aborted) return resolve();
      const timer = setTimeout(done, Math.max(0, ms));
      function done() { signal.removeEventListener('abort', abort); resolve(); }
      function abort() { clearTimeout(timer); done(); }
      signal.addEventListener('abort', abort, { once: true });
    });
  }

  async function pump() {
    while (wanted) {
      const token = generation;
      const controller = new AbortController();
      activeController = controller;
      const started = Date.now();
      try {
        const frame = await captureFrame({ signal: controller.signal, generation: token });
        if (frame && wanted && token === generation && !controller.signal.aborted) {
          const result = await processFrame(frame, { signal: controller.signal, generation: token, frameId: ++frameId });
          if (result && wanted && token === generation && !controller.signal.aborted) {
            publishFrame(result, { generation: token, frameId });
          }
        }
      } catch (error) {
        if (!controller.signal.aborted && wanted && token === generation) {
          try { onError(error, { generation: token }); } catch { /* Observers cannot stop the pump. */ }
        }
      } finally {
        if (activeController === controller) activeController = null;
      }
      if (!wanted) break;
      const remaining = Math.max(minDelayMs, intervalMs - (Date.now() - started));
      await delay(remaining, controller.signal);
    }
  }

  function ensurePump() {
    if (!runner) {
      const task = pump();
      runner = task;
      task.finally(() => {
        if (runner === task) runner = null;
        if (wanted) ensurePump();
      });
    }
    return runner;
  }

  return {
    start() {
      wanted = true;
      return ensurePump();
    },
    stop() {
      wanted = false;
      generation++;
      activeController?.abort();
    },
    get running() { return wanted; },
    get inFlight() { return !!activeController; }
  };
}
