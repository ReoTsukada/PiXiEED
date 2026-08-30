(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPiXiSyncLazyCellSyncUtils({
    isTargetActive = () => true,
    applyPixelMutation,
    onDeferred = () => {},
  } = {}) {
    if (typeof applyPixelMutation !== 'function') return null;
    const deferredByTarget = new Map();

    const targetKey = target => [
      target?.canvasId,
      target?.frameId,
      target?.layerId,
      target?.canvasWidth,
      target?.canvasHeight,
    ].join('/');

    function normalizeMutation(mutation) {
      if (
        !mutation?.canvasId
        || !mutation?.frameId
        || !mutation?.layerId
        || !Number.isSafeInteger(Number(mutation.canvasWidth))
        || !Number.isSafeInteger(Number(mutation.canvasHeight))
        || !Array.isArray(mutation.changes)
      ) return null;
      return {
        canvasId: String(mutation.canvasId),
        frameId: String(mutation.frameId),
        layerId: String(mutation.layerId),
        canvasWidth: Number(mutation.canvasWidth),
        canvasHeight: Number(mutation.canvasHeight),
      };
    }

    function shouldDefer(mutation) {
      const target = normalizeMutation(mutation);
      return Boolean(target && !isTargetActive(target));
    }

    function defer(mutation, revision = 0) {
      const target = normalizeMutation(mutation);
      if (!target) return { applied: 0, appliedIndices: [] };
      const key = targetKey(target);
      let entry = deferredByTarget.get(key);
      if (!entry) {
        entry = { ...target, revision: 0n, changesByIndex: new Map() };
        deferredByTarget.set(key, entry);
      }
      try {
        const nextRevision = BigInt(revision || 0);
        if (nextRevision > entry.revision) entry.revision = nextRevision;
      } catch (_) {}
      const appliedIndices = [];
      mutation.changes.forEach(change => {
        const index = Math.trunc(Number(change?.index));
        const paletteValue = Math.trunc(Number(change?.paletteValue));
        if (!Number.isSafeInteger(index) || index < 0 || !Number.isSafeInteger(paletteValue)) return;
        entry.changesByIndex.set(index, { index, paletteValue });
        appliedIndices.push(index);
      });
      if (!entry.changesByIndex.size) {
        deferredByTarget.delete(key);
        return { applied: 0, appliedIndices: [] };
      }
      onDeferred({ ...target, revision: entry.revision.toString(), changeCount: entry.changesByIndex.size });
      return { applied: appliedIndices.length, appliedIndices, deferred: true };
    }

    function flushTarget(target) {
      const normalized = normalizeMutation({ ...target, changes: [] });
      if (!normalized) return { applied: 0, appliedIndices: [] };
      const key = targetKey(normalized);
      const entry = deferredByTarget.get(key);
      if (!entry) return { applied: 0, appliedIndices: [] };
      const changes = [...entry.changesByIndex.values()].sort((left, right) => left.index - right.index);
      const result = applyPixelMutation({ ...normalized, changes });
      if (result?.applied !== changes.length) {
        return { ...(result || {}), expected: changes.length, deferred: true, flushed: false };
      }
      deferredByTarget.delete(key);
      return { ...result, deferred: true, flushed: true, revision: entry.revision.toString() };
    }

    function flushActive() {
      let applied = 0;
      for (const entry of [...deferredByTarget.values()]) {
        if (!isTargetActive(entry)) continue;
        const result = flushTarget(entry);
        if (result.flushed === false) return { applied, ok: false, result };
        applied += Number(result.applied) || 0;
      }
      return { applied, ok: true };
    }

    function flushAll() {
      let applied = 0;
      for (const entry of [...deferredByTarget.values()]) {
        const result = flushTarget(entry);
        if (result.flushed === false) return { applied, ok: false, result };
        applied += Number(result.applied) || 0;
      }
      return { applied, ok: true };
    }

    function clear() {
      deferredByTarget.clear();
    }

    function snapshot() {
      return {
        deferredTargetCount: deferredByTarget.size,
        deferredChangeCount: [...deferredByTarget.values()]
          .reduce((sum, entry) => sum + entry.changesByIndex.size, 0),
        targets: [...deferredByTarget.values()].map(entry => ({
          canvasId: entry.canvasId,
          frameId: entry.frameId,
          layerId: entry.layerId,
          canvasWidth: entry.canvasWidth,
          canvasHeight: entry.canvasHeight,
          revision: entry.revision.toString(),
          changeCount: entry.changesByIndex.size,
        })),
      };
    }

    return Object.freeze({ shouldDefer, defer, flushTarget, flushActive, flushAll, clear, snapshot });
  }

  root.pixisyncLazyCellSyncUtils = { createPiXiSyncLazyCellSyncUtils };
})();
