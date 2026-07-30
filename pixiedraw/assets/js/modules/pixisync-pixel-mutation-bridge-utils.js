(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPiXiSyncPixelMutationBridgeUtils({
    resolveTarget,
    writeLayerPixelPatchValue,
    markDirtyRect,
    requestRender,
    requestOverlayRender,
    historyEntryType = 'pixelPatch',
  } = {}) {
    const ELIGIBLE_LABELS = new Set(['pen', 'eraser']);
    const MAX_CHANGES = 8192;

    function isTransparentRgba(value) {
      return !Array.isArray(value) || value.length !== 4 || Number(value[3]) === 0;
    }

    function appendChange(changes, index, before, after) {
      const safeIndex = Math.trunc(Number(index));
      const beforePaletteValue = Math.trunc(Number(before?.paletteIndex));
      const paletteValue = Math.trunc(Number(after?.paletteIndex));
      if (
        !Number.isSafeInteger(safeIndex)
        || safeIndex < 0
        || !Number.isSafeInteger(beforePaletteValue)
        || beforePaletteValue < 0
        || beforePaletteValue > 254
        || !Number.isSafeInteger(paletteValue)
        || paletteValue < 0
        || paletteValue > 254
        || !isTransparentRgba(before?.direct)
        || !isTransparentRgba(after?.direct)
        || !isTransparentRgba(before?.importSourceDirect)
        || !isTransparentRgba(after?.importSourceDirect)
      ) {
        return false;
      }
      if (beforePaletteValue === paletteValue) return true;
      changes.push({ index: safeIndex, paletteValue, beforePaletteValue });
      return changes.length <= MAX_CHANGES;
    }

    function expandRasterTiles(entry, changes) {
      if (!Array.isArray(entry.tiles)) return false;
      for (const tile of entry.tiles) {
        const tileWidth = Math.trunc(Number(tile?.width));
        const tileHeight = Math.trunc(Number(tile?.height));
        const tileX = Math.trunc(Number(tile?.x));
        const tileY = Math.trunc(Number(tile?.y));
        const before = tile?.beforeIndices;
        const after = tile?.afterIndices;
        if (
          !Number.isSafeInteger(tileWidth)
          || !Number.isSafeInteger(tileHeight)
          || tileWidth < 1
          || tileHeight < 1
          || !Number.isSafeInteger(tileX)
          || !Number.isSafeInteger(tileY)
          || tileX < 0
          || tileY < 0
          || !ArrayBuffer.isView(before)
          || !ArrayBuffer.isView(after)
          || before.length !== tileWidth * tileHeight
          || after.length !== before.length
        ) {
          return false;
        }
        for (let offset = 0; offset < before.length; offset += 1) {
          const beforeDirect = tile.beforeDirect instanceof Uint8ClampedArray
            ? [...tile.beforeDirect.subarray(offset * 4, (offset * 4) + 4)]
            : null;
          const afterDirect = tile.afterDirect instanceof Uint8ClampedArray
            ? [...tile.afterDirect.subarray(offset * 4, (offset * 4) + 4)]
            : null;
          const x = tileX + (offset % tileWidth);
          const y = tileY + Math.floor(offset / tileWidth);
          if (!appendChange(
            changes,
            (y * entry.width) + x,
            { paletteIndex: before[offset], direct: beforeDirect },
            { paletteIndex: after[offset], direct: afterDirect }
          )) return false;
        }
      }
      return true;
    }

    function toPixelMutation(entry) {
      if (
        !entry
        || entry.__historyEntryType !== historyEntryType
        || !ELIGIBLE_LABELS.has(String(entry.historyLabel || ''))
        || !Number.isSafeInteger(Number(entry.width))
        || !Number.isSafeInteger(Number(entry.height))
        || Number(entry.width) < 1
        || Number(entry.height) < 1
        || !entry.canvasId
        || !entry.frameId
        || !entry.layerId
      ) return null;
      const changes = [];
      if (!entry.kind) {
        if (!Array.isArray(entry.changes) || !entry.changes.length) return null;
        for (const change of entry.changes) {
          if (!appendChange(changes, change?.index, change?.before, change?.after)) return null;
        }
      } else if (entry.kind === 'raster-tile-patch') {
        if (!expandRasterTiles(entry, changes)) return null;
      } else {
        return null;
      }
      if (!changes.length || changes.length > MAX_CHANGES) return null;
      changes.sort((a, b) => a.index - b.index);
      const mutation = {
        canvasId: entry.canvasId,
        frameId: entry.frameId,
        layerId: entry.layerId,
        canvasWidth: Number(entry.width),
        canvasHeight: Number(entry.height),
        changes,
      };
      const target = resolveTarget?.(mutation);
      if (
        target
        && (
          Number(target.width) !== mutation.canvasWidth
          || Number(target.height) !== mutation.canvasHeight
          || target.v1Compatible === false
        )
      ) return null;
      return mutation;
    }

    function applyPixelMutation(mutation, { useBefore = false } = {}) {
      const target = resolveTarget?.(mutation);
      if (
        !target?.layer
        || target.v1Compatible === false
        || !mutation
        || !Array.isArray(mutation.changes)
        || Number(target.width) !== Number(mutation.canvasWidth)
        || Number(target.height) !== Number(mutation.canvasHeight)
      ) return { applied: 0, appliedIndices: [] };
      let applied = 0; let x0 = target.width; let y0 = target.height; let x1 = -1; let y1 = -1;
      const appliedIndices = [];
      mutation.changes.forEach(change => {
        const paletteIndex = useBefore ? change.beforePaletteValue : change.paletteValue;
        if (!Number.isSafeInteger(paletteIndex)) return;
        if (!writeLayerPixelPatchValue(target.layer, change.index, { paletteIndex }, target.width, target.height)) return;
        applied += 1;
        appliedIndices.push(change.index);
        const x = change.index % target.width; const y = Math.floor(change.index / target.width);
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      });
      if (applied) { markDirtyRect?.(x0, y0, x1, y1); requestRender?.(); requestOverlayRender?.(); }
      return { applied, appliedIndices, x0, y0, x1, y1 };
    }
    return { ELIGIBLE_LABELS, MAX_CHANGES, toPixelMutation, applyPixelMutation };
  }
  root.pixisyncPixelMutationBridgeUtils = { createPiXiSyncPixelMutationBridgeUtils };
})();
