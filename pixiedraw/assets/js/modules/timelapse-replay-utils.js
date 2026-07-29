(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createTimelapseReplayUtils() {
    const clone = value => globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
    const safeByte = value => Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
    const COMPACT_INDICES = 'uint8-zero-transparent-v1';
    const TILED_INDICES = 'uint8-tiled-zero-transparent-v1';
    const RUNTIME_INDICES = 'uint8-palette-zero-transparent-v2';

    function getCanvasSnapshot(snapshot, canvasId) {
      const requestedId = String(canvasId || '');
      if (requestedId && Array.isArray(snapshot?.canvases)) {
        const matched = snapshot.canvases.find(canvas => canvas?.id === requestedId);
        if (matched) return matched;
      }
      return snapshot;
    }

    function getLayer(snapshot, entry) {
      const canvas = getCanvasSnapshot(snapshot, entry?.canvasId);
      const frame = Array.isArray(canvas?.frames)
        ? canvas.frames.find(item => item?.id === entry?.frameId) || canvas.frames[0]
        : null;
      const layer = Array.isArray(frame?.layers)
        ? frame.layers.find(item => item?.id === entry?.layerId) || null
        : null;
      return { canvas, layer };
    }

    function getTiledStoredValue(layer, index) {
      const width = Math.max(1, Math.round(Number(layer?.indicesWidth) || 1));
      const tileSize = Math.max(1, Math.round(Number(layer?.indicesTileSize) || 16));
      const x = index % width;
      const y = Math.floor(index / width);
      const tileColumns = Math.ceil(width / tileSize);
      const tileIndex = Math.floor(y / tileSize) * tileColumns + Math.floor(x / tileSize);
      const localIndex = (y % tileSize) * tileSize + (x % tileSize);
      const tile = layer.indicesTiles instanceof Map
        ? layer.indicesTiles.get(tileIndex)
        : layer.indicesTiles?.[tileIndex];
      return tile?.[localIndex] || 0;
    }

    function getPaletteIndex(layer, index) {
      if (layer?.indicesEncoding === TILED_INDICES) {
        const stored = getTiledStoredValue(layer, index);
        return stored === 0 ? -1 : stored - 1;
      }
      const stored = layer?.indices?.[index];
      if (!Number.isFinite(stored)) return -1;
      if (layer?.indicesEncoding === COMPACT_INDICES) return stored === 0 ? -1 : stored - 1;
      if (layer?.indicesEncoding === RUNTIME_INDICES) return stored === 0 ? -1 : stored;
      return stored;
    }

    function writeTiledPaletteIndex(layer, index, paletteIndex) {
      const width = Math.max(1, Math.round(Number(layer?.indicesWidth) || 1));
      const height = Math.max(1, Math.round(Number(layer?.indicesHeight) || 1));
      if (index < 0 || index >= width * height) return false;
      const tileSize = Math.max(1, Math.round(Number(layer?.indicesTileSize) || 16));
      const x = index % width;
      const y = Math.floor(index / width);
      const tileColumns = Math.ceil(width / tileSize);
      const tileIndex = Math.floor(y / tileSize) * tileColumns + Math.floor(x / tileSize);
      const localIndex = (y % tileSize) * tileSize + (x % tileSize);
      const tiles = layer.indicesTiles instanceof Map ? layer.indicesTiles : (layer.indicesTiles || []);
      let tile = layer.indicesTiles instanceof Map ? tiles.get(tileIndex) : tiles[tileIndex];
      if (!(tile instanceof Uint8Array)) tile = new Uint8Array(tileSize * tileSize);
      tile[localIndex] = paletteIndex < 0 ? 0 : Math.min(255, paletteIndex + 1);
      if (layer.indicesTiles instanceof Map) tiles.set(tileIndex, tile);
      else tiles[tileIndex] = tile;
      return true;
    }

    function writePixel(layer, index, value) {
      if (!layer || !value) return;
      const paletteIndex = Math.round(Number(value.paletteIndex));
      if (layer.indicesEncoding === TILED_INDICES) {
        if (!writeTiledPaletteIndex(layer, index, paletteIndex)) return;
      } else if (layer.indices instanceof Int16Array || layer.indices instanceof Uint8Array) {
        if (index < 0 || index >= layer.indices.length) return;
        if (layer.indicesEncoding === COMPACT_INDICES) layer.indices[index] = paletteIndex < 0 ? 0 : paletteIndex + 1;
        else if (layer.indicesEncoding === RUNTIME_INDICES) layer.indices[index] = paletteIndex < 0 ? 0 : paletteIndex;
        else layer.indices[index] = paletteIndex;
      } else {
        return;
      }
      if (Array.isArray(value.direct) && value.direct.length === 4) {
        if (!(layer.direct instanceof Uint8ClampedArray)) {
          layer.direct = new Uint8ClampedArray(layer.indices.length * 4);
        }
        layer.direct.set(value.direct.map(safeByte), index * 4);
      }
    }

    function applyForwardDiff(snapshot, diff) {
      if (!diff || diff.__historyEntryType !== 'pixel-patch') return false;
      const { layer } = getLayer(snapshot, diff);
      if (!layer?.indices) return false;
      if (Array.isArray(diff.changes)) {
        diff.changes.forEach(change => writePixel(layer, Math.round(Number(change?.index) || 0), change?.after));
        return true;
      }
      if (diff.kind === 'solid-fill-runs' && diff.runs) {
        for (let offset = 0; offset + 1 < diff.runs.length; offset += 2) {
          const start = Math.round(Number(diff.runs[offset]) || 0);
          const length = Math.max(0, Math.round(Number(diff.runs[offset + 1]) || 0));
          for (let index = start; index < start + length; index += 1) {
            writePixel(layer, index, { paletteIndex: diff.afterPaletteIndex });
          }
        }
        return true;
      }
      if (diff.kind === 'raster-tile-patch' && Array.isArray(diff.tiles)) {
        const width = Math.max(1, Math.round(Number(diff.width) || 1));
        diff.tiles.forEach(tile => {
          if (!tile?.afterIndices) return;
          for (let row = 0; row < tile.height; row += 1) {
            for (let column = 0; column < tile.width; column += 1) {
              const sourceIndex = (row * tile.width) + column;
              const destination = ((tile.y + row) * width) + tile.x + column;
              const direct = tile.afterDirect instanceof Uint8ClampedArray
                ? Array.from(tile.afterDirect.subarray(sourceIndex * 4, sourceIndex * 4 + 4))
                : null;
              writePixel(layer, destination, { paletteIndex: tile.afterIndices[sourceIndex], direct });
            }
          }
        });
        return true;
      }
      return false;
    }

    function renderSnapshotToCanvas(snapshot, canvas, { frameId = '' } = {}) {
      const source = getCanvasSnapshot(snapshot, snapshot?.activeCanvasId);
      const width = Math.max(1, Math.round(Number(source?.width) || 1));
      const height = Math.max(1, Math.round(Number(source?.height) || 1));
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: true });
      const image = context.createImageData(width, height);
      const frame = (frameId && Array.isArray(source?.frames)
        ? source.frames.find(candidate => candidate?.id === frameId)
        : null)
        || source?.frames?.[Math.max(0, Math.round(Number(snapshot?.activeFrame) || 0))]
        || source?.frames?.[0];
      const palette = Array.isArray(source?.palette) ? source.palette : (Array.isArray(snapshot?.palette) ? snapshot.palette : []);
      (frame?.layers || []).forEach(layer => {
        if (layer?.visible === false || !layer?.indices) return;
        const opacity = Math.max(0, Math.min(1, Number(layer.opacity ?? 1)));
        for (let index = 0; index < width * height; index += 1) {
          const directOffset = index * 4;
          const direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
          const paletteIndex = getPaletteIndex(layer, index);
          const color = direct && direct[directOffset + 3] > 0
            ? { r: direct[directOffset], g: direct[directOffset + 1], b: direct[directOffset + 2], a: direct[directOffset + 3] }
            : (paletteIndex >= 0 ? palette[paletteIndex] : null);
          if (!color || !color.a) continue;
          const alpha = (safeByte(color.a) / 255) * opacity;
          const destinationAlpha = image.data[directOffset + 3] / 255;
          const combined = alpha + destinationAlpha * (1 - alpha);
          if (!combined) continue;
          image.data[directOffset] = Math.round((safeByte(color.r) * alpha + image.data[directOffset] * destinationAlpha * (1 - alpha)) / combined);
          image.data[directOffset + 1] = Math.round((safeByte(color.g) * alpha + image.data[directOffset + 1] * destinationAlpha * (1 - alpha)) / combined);
          image.data[directOffset + 2] = Math.round((safeByte(color.b) * alpha + image.data[directOffset + 2] * destinationAlpha * (1 - alpha)) / combined);
          image.data[directOffset + 3] = Math.round(combined * 255);
        }
      });
      context.putImageData(image, 0, 0);
      return { width, height };
    }

    return { clone, applyForwardDiff, renderSnapshotToCanvas };
  }

  root.timelapseReplayUtils = { createTimelapseReplayUtils };
})();
