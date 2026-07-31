(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function isIndexedLayerCompatible(layer) {
    if (!layer || typeof layer !== 'object') return false;
    if (layer.directOnly !== true) return true;
    const hasVisiblePixels = pixels => {
      if (!(pixels instanceof Uint8ClampedArray)) return false;
      for (let alpha = 3; alpha < pixels.length; alpha += 4) {
        if (pixels[alpha] !== 0) return true;
      }
      return false;
    };
    // A newly restored blank layer can retain an allocated direct buffer even
    // though every pixel is transparent. Local drawing converts that layer on
    // its first write, so PiXiSYNC must not block the pointer before that write.
    if (hasVisiblePixels(layer.direct) || hasVisiblePixels(layer.importSourceDirect)) return false;
    const indices = layer.indices;
    if (indices instanceof Uint8Array) {
      for (let index = 0; index < indices.length; index += 1) {
        if (indices[index] !== 0) return false;
      }
    } else if (indices instanceof Int16Array) {
      for (let index = 0; index < indices.length; index += 1) {
        if (indices[index] >= 0) return false;
      }
    } else {
      return false;
    }
    return true;
  }

  function createPiXiSyncPixelMutationBridgeUtils({
    resolveTarget,
    writeLayerPixelPatchValue,
    markDirtyRect,
    requestRender,
    requestOverlayRender,
    resolvePaletteColor = () => null,
    historyEntryType = 'pixelPatch',
  } = {}) {
    // Keep this aligned with the local HISTORY_DRAW_TOOLS set. All of these
    // tools finalize to the same indexed pixelPatch representation.
    const ELIGIBLE_LABELS = new Set([
      'pen',
      'eraser',
      'line',
      'curve',
      'rect',
      'rectFill',
      'ellipse',
      'ellipseFill',
      'fill',
      'fillDither',
      'fillGradient',
      'selectionMove',
      'selectionTransform',
      'selectionCut',
      'selectionPastePixels',
    ]);
    const MAX_CHANGES = 8192;

    function isCompatibleIndexedRgba(value, paletteIndex) {
      if (!Array.isArray(value) || value.length !== 4 || Number(value[3]) === 0) return true;
      const color = resolvePaletteColor?.(paletteIndex);
      if (!color || typeof color !== 'object') return false;
      return Number(value[0]) === Number(color.r)
        && Number(value[1]) === Number(color.g)
        && Number(value[2]) === Number(color.b)
        && Number(value[3]) === Number(color.a);
    }

    function appendChange(changes, index, before, after) {
      const safeIndex = Math.trunc(Number(index));
      const beforePaletteValue = Math.max(0, Math.trunc(Number(before?.paletteIndex)));
      const paletteValue = Math.max(0, Math.trunc(Number(after?.paletteIndex)));
      if (
        !Number.isSafeInteger(safeIndex)
        || safeIndex < 0
        || !Number.isSafeInteger(beforePaletteValue)
        || beforePaletteValue < 0
        || beforePaletteValue > 254
        || !Number.isSafeInteger(paletteValue)
        || paletteValue < 0
        || paletteValue > 254
        || !isCompatibleIndexedRgba(before?.direct, beforePaletteValue)
        || !isCompatibleIndexedRgba(after?.direct, paletteValue)
        || !isCompatibleIndexedRgba(before?.importSourceDirect, beforePaletteValue)
        || !isCompatibleIndexedRgba(after?.importSourceDirect, paletteValue)
      ) {
        return false;
      }
      if (beforePaletteValue === paletteValue) return true;
      changes.push({ index: safeIndex, paletteValue, beforePaletteValue });
      return true;
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

    function expandSolidFillRuns(entry, changes) {
      if (
        !(entry.runs instanceof Int32Array)
        || entry.runs.length < 2
        || entry.runs.length % 2 !== 0
        || !(entry.beforeIndices instanceof Int16Array || entry.beforeIndices instanceof Uint8Array)
        || !Number.isSafeInteger(Number(entry.afterPaletteIndex))
        || Number(entry.afterPaletteIndex) < 0
        || Number(entry.afterPaletteIndex) > 254
      ) return false;
      const beforeDirect = entry.beforeDirect;
      if (beforeDirect != null && (!(beforeDirect instanceof Uint8ClampedArray) || beforeDirect.length !== entry.beforeIndices.length * 4)) {
        return false;
      }
      let valueOffset = 0;
      let previousEnd = 0;
      for (let offset = 0; offset < entry.runs.length; offset += 2) {
        const start = Number(entry.runs[offset]);
        const length = Number(entry.runs[offset + 1]);
        if (
          !Number.isSafeInteger(start)
          || !Number.isSafeInteger(length)
          || start < previousEnd
          || length < 1
          || start < 0
          || start + length > Number(entry.width) * Number(entry.height)
        ) return false;
        for (let local = 0; local < length; local += 1, valueOffset += 1) {
          if (valueOffset >= entry.beforeIndices.length) return false;
          const direct = beforeDirect
            ? [...beforeDirect.subarray(valueOffset * 4, (valueOffset + 1) * 4)]
            : null;
          if (!appendChange(
            changes,
            start + local,
            { paletteIndex: entry.beforeIndices[valueOffset], direct },
            { paletteIndex: entry.afterPaletteIndex, direct: null }
          )) return false;
        }
        previousEnd = start + length;
      }
      return valueOffset === entry.beforeIndices.length;
    }

    function expandCompressedSelectionMove(entry, changes) {
      const sourceMask = entry?.sourceMask;
      const sourceIndices = entry?.sourceIndices;
      const sourceDirect = entry?.sourceDirect;
      const targetPositions = entry?.targetPositions;
      const targetBeforeIndices = entry?.targetBeforeIndices;
      const targetAfterIndices = entry?.targetAfterIndices;
      const targetBeforeDirect = entry?.targetBeforeDirect;
      const targetAfterDirect = entry?.targetAfterDirect;
      const moveWidth = Math.trunc(Number(entry?.moveWidth));
      const moveHeight = Math.trunc(Number(entry?.moveHeight));
      const sourceX = Math.trunc(Number(entry?.sourceX));
      const sourceY = Math.trunc(Number(entry?.sourceY));
      if (
        !(sourceMask instanceof Uint8Array)
        || !(sourceIndices instanceof Int16Array || sourceIndices instanceof Uint8Array)
        || !(targetPositions instanceof Int32Array)
        || !(targetBeforeIndices instanceof Int16Array || targetBeforeIndices instanceof Uint8Array)
        || !(targetAfterIndices instanceof Int16Array || targetAfterIndices instanceof Uint8Array)
        || !Number.isSafeInteger(moveWidth)
        || !Number.isSafeInteger(moveHeight)
        || moveWidth < 1
        || moveHeight < 1
        || sourceMask.length !== moveWidth * moveHeight
        || sourceIndices.length !== sourceMask.length
        || targetBeforeIndices.length !== targetPositions.length
        || targetAfterIndices.length !== targetPositions.length
        || (sourceDirect != null && (!(sourceDirect instanceof Uint8ClampedArray) || sourceDirect.length !== sourceMask.length * 4))
        || (targetBeforeDirect != null && (!(targetBeforeDirect instanceof Uint8ClampedArray) || targetBeforeDirect.length !== targetPositions.length * 4))
        || (targetAfterDirect != null && (!(targetAfterDirect instanceof Uint8ClampedArray) || targetAfterDirect.length !== targetPositions.length * 4))
      ) return false;
      const byIndex = new Map();
      for (let offset = 0; offset < targetPositions.length; offset += 1) {
        const index = Number(targetPositions[offset]);
        if (!Number.isSafeInteger(index) || index < 0 || byIndex.has(index)) return false;
        const directOffset = offset * 4;
        byIndex.set(index, {
          index,
          before: {
            paletteIndex: targetBeforeIndices[offset],
            direct: targetBeforeDirect ? [...targetBeforeDirect.subarray(directOffset, directOffset + 4)] : null,
          },
          after: {
            paletteIndex: targetAfterIndices[offset],
            direct: targetAfterDirect ? [...targetAfterDirect.subarray(directOffset, directOffset + 4)] : null,
          },
        });
      }
      for (let localIndex = 0; localIndex < sourceMask.length; localIndex += 1) {
        if (sourceMask[localIndex] !== 1) continue;
        const x = sourceX + (localIndex % moveWidth);
        const y = sourceY + Math.floor(localIndex / moveWidth);
        if (x < 0 || y < 0 || x >= Number(entry.width) || y >= Number(entry.height)) continue;
        const index = (y * Number(entry.width)) + x;
        const directOffset = localIndex * 4;
        const existing = byIndex.get(index);
        byIndex.set(index, {
          index,
          before: {
            paletteIndex: sourceIndices[localIndex],
            direct: sourceDirect ? [...sourceDirect.subarray(directOffset, directOffset + 4)] : null,
          },
          after: existing?.after || { paletteIndex: 0, direct: null },
        });
      }
      for (const change of byIndex.values()) {
        if (!appendChange(changes, change.index, change.before, change.after)) return false;
      }
      return true;
    }

    function toPixelMutations(entry) {
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
      } else if (entry.kind === 'solid-fill-runs') {
        if (!expandSolidFillRuns(entry, changes)) return null;
      } else if (entry.kind === 'selection-move-compressed') {
        if (!expandCompressedSelectionMove(entry, changes)) return null;
      } else {
        return null;
      }
      if (!changes.length) return null;
      changes.sort((a, b) => a.index - b.index);
      for (let index = 1; index < changes.length; index += 1) {
        if (changes[index - 1].index === changes[index].index) return null;
      }
      const base = {
        canvasId: entry.canvasId,
        frameId: entry.frameId,
        layerId: entry.layerId,
        canvasWidth: Number(entry.width),
        canvasHeight: Number(entry.height),
      };
      const target = resolveTarget?.({ ...base, changes });
      if (
        target
        && (
          Number(target.width) !== base.canvasWidth
          || Number(target.height) !== base.canvasHeight
          || target.v1Compatible === false
        )
      ) return null;
      const mutations = [];
      for (let offset = 0; offset < changes.length; offset += MAX_CHANGES) {
        mutations.push({ ...base, changes: changes.slice(offset, offset + MAX_CHANGES) });
      }
      return mutations;
    }

    function toPixelMutation(entry) {
      const mutations = toPixelMutations(entry);
      return mutations?.length === 1 ? mutations[0] : null;
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
    return { ELIGIBLE_LABELS, MAX_CHANGES, toPixelMutation, toPixelMutations, applyPixelMutation };
  }
  root.pixisyncPixelMutationBridgeUtils = {
    createPiXiSyncPixelMutationBridgeUtils,
    isIndexedLayerCompatible,
  };
})();
