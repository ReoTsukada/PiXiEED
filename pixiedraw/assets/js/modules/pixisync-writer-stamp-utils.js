(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPiXiSyncWriterStampUtils() {
    const TILE_CELL_COUNT = 1024;
    const MAX_REVISION = 9223372036854775807n;

    function normalizeRevision(value, { allowZero = false } = {}) {
      let revision;
      if (typeof value === 'number' && !Number.isSafeInteger(value)) {
        throw new Error('PiXiSYNC writer stamps: unsafe-number-revision');
      }
      try { revision = BigInt(value); } catch (_) {
        throw new Error('PiXiSYNC writer stamps: invalid-revision');
      }
      if (revision < (allowZero ? 0n : 1n) || revision > MAX_REVISION) {
        throw new Error('PiXiSYNC writer stamps: invalid-revision');
      }
      return revision;
    }

    function createWriterStamps(cellCount) {
      const safeCellCount = Math.trunc(Number(cellCount));
      if (!Number.isSafeInteger(safeCellCount) || safeCellCount < 1) {
        throw new Error('PiXiSYNC writer stamps: invalid-cell-count');
      }
      const tiles = new Map();

      function normalizeIndex(value) {
        const index = Math.trunc(Number(value));
        if (!Number.isSafeInteger(index) || index < 0 || index >= safeCellCount) {
          throw new Error('PiXiSYNC writer stamps: index-out-of-range');
        }
        return index;
      }

      return {
        cellCount: safeCellCount,
        get(indexValue) {
          const index = normalizeIndex(indexValue);
          const tile = tiles.get(Math.floor(index / TILE_CELL_COUNT));
          return tile ? tile[index % TILE_CELL_COUNT] : 0n;
        },
        set(indexValue, revisionValue) {
          const index = normalizeIndex(indexValue);
          const revision = normalizeRevision(revisionValue, { allowZero: true });
          const tileIndex = Math.floor(index / TILE_CELL_COUNT);
          let tile = tiles.get(tileIndex);
          if (!tile && revision === 0n) return;
          if (!tile) {
            tile = new BigUint64Array(TILE_CELL_COUNT);
            tiles.set(tileIndex, tile);
          }
          tile[index % TILE_CELL_COUNT] = revision;
        },
        exportTiles() {
          return [...tiles.entries()].sort((a, b) => a[0] - b[0]).map(([tileIndex, values]) => ({
            tileIndex,
            values: [...values].map(value => value.toString()),
          }));
        },
        get tileCount() { return tiles.size; },
      };
    }

    function applyConditionalPatch({ changes, expectedRevision, revision, getValue, setValue, stamps }) {
      if (!stamps || typeof stamps.get !== 'function' || typeof stamps.set !== 'function'
          || typeof getValue !== 'function' || typeof setValue !== 'function') {
        throw new Error('PiXiSYNC writer stamps: invalid-dispatcher');
      }
      const expected = normalizeRevision(expectedRevision, { allowZero: true });
      const next = normalizeRevision(revision);
      if (!Array.isArray(changes)) {
        throw new Error('PiXiSYNC writer stamps: invalid-revision-or-changes');
      }
      const applied = [];
      changes.forEach(change => {
        const index = Math.trunc(Number(change?.index));
        if (!Number.isSafeInteger(index) || index < 0 || index >= stamps.cellCount) {
          throw new Error('PiXiSYNC writer stamps: index-out-of-range');
        }
        if (stamps.get(index) !== expected) return;
        const before = getValue(index);
        setValue(index, change.paletteValue);
        stamps.set(index, next);
        applied.push({ index, before, after: change.paletteValue });
      });
      return applied;
    }

    function applyUnconditionalPatch({ changes, revision, setValue, stamps }) {
      if (!stamps || typeof stamps.get !== 'function' || typeof stamps.set !== 'function'
          || typeof setValue !== 'function' || !Array.isArray(changes)) {
        throw new Error('PiXiSYNC writer stamps: invalid-dispatcher');
      }
      const next = normalizeRevision(revision);
      changes.forEach(change => {
        const index = Math.trunc(Number(change?.index));
        if (!Number.isSafeInteger(index) || index < 0 || index >= stamps.cellCount) {
          throw new Error('PiXiSYNC writer stamps: index-out-of-range');
        }
        setValue(index, change.paletteValue);
        stamps.set(index, next);
      });
    }

    return { TILE_CELL_COUNT, MAX_REVISION, createWriterStamps, applyConditionalPatch, applyUnconditionalPatch };
  }

  root.pixisyncWriterStampUtils = { createPiXiSyncWriterStampUtils };
})();
