/** One visible gallery at a time: share in-flight reads and retain successful results. */
export function createLazyGalleryData({ load, isVisible, onData, onBusy = () => {}, onError = () => {} }) {
  let generation = 0, cachedGeneration = -1, appliedGeneration = -1;
  let cached, pending = null, disposed = false;
  const visible = () => !disposed && isVisible();
  function present() {
    if (!visible() || cachedGeneration !== generation || appliedGeneration === generation) return;
    onData(cached); appliedGeneration = generation;
  }
  function invalidate() { generation++; cachedGeneration = appliedGeneration = -1; cached = undefined; }
  function ensure({ force = false } = {}) {
    if (force) invalidate();
    if (!visible()) return Promise.resolve();
    if (cachedGeneration === generation) { present(); onBusy(false); return Promise.resolve(cached); }
    onBusy(true);
    if (pending) return pending;
    // Defer once so even a synchronous loader shares this same pending promise.
    pending = Promise.resolve().then(async () => {
      try {
        while (visible() && cachedGeneration !== generation) {
          const version = generation;
          try {
            const value = await load();
            if (disposed) return;
            if (version !== generation) continue; // A save/close invalidated the old read.
            cached = value; cachedGeneration = version; present(); return value;
          } catch (error) {
            if (disposed) return;
            if (version !== generation) continue;
            if (visible()) onError(error);
            return;
          }
        }
      } finally { pending = null; if (visible()) onBusy(false); }
    });
    return pending;
  }
  return { ensure, invalidate, dispose() { disposed = true; invalidate(); } };
}
