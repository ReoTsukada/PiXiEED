(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createCanvasDrawingWorkflowUtils(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() {
        return true;
      },
      get(target, key) {
        if (key === Symbol.unscopables) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          return target[key];
        }
        return globalThis[key];
      },
      set(target, key, value) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          target[key] = value;
          return true;
        }
        globalThis[key] = value;
        return true;
      },
    });

    return ((scope) => {
      with (scope) {
  function readLayerRuntimeIndex(layer, index) {
    return typeof getRasterLayerRuntimeStoredIndex === 'function'
      ? getRasterLayerRuntimeStoredIndex(layer, index)
      : layer?.indices?.[index];
  }

  function writeLayerRuntimeIndex(layer, index, value) {
    if (typeof setRasterLayerRuntimeStoredIndex === 'function') {
      return setRasterLayerRuntimeStoredIndex(layer, index, value);
    }
    if (layer?.indices && index >= 0 && index < layer.indices.length) {
      layer.indices[index] = value;
      return true;
    }
    return false;
  }

  let rasterBatchDepth = 0;
  let rasterBatchBounds = null;
  function beginRasterBatch() { rasterBatchDepth += 1; }
  function endRasterBatch() {
    rasterBatchDepth = Math.max(0, rasterBatchDepth - 1);
    if (rasterBatchDepth || !rasterBatchBounds) return;
    const bounds = rasterBatchBounds;
    rasterBatchBounds = null;
    markDirtyRect(bounds.x0, bounds.y0, bounds.x1, bounds.y1);
  }
  function noteRasterPixelDirty(x, y) {
    if (!rasterBatchDepth) { markDirtyPixel(x, y); return; }
    if (!rasterBatchBounds) rasterBatchBounds = { x0: x, y0: y, x1: x, y1: y };
    else {
      rasterBatchBounds.x0 = Math.min(rasterBatchBounds.x0, x); rasterBatchBounds.y0 = Math.min(rasterBatchBounds.y0, y);
      rasterBatchBounds.x1 = Math.max(rasterBatchBounds.x1, x); rasterBatchBounds.y1 = Math.max(rasterBatchBounds.y1, y);
    }
  }
  function noteRasterRectDirty(x0, y0, x1, y1) {
    if (!rasterBatchDepth) { markDirtyRect(x0, y0, x1, y1); return; }
    if (!rasterBatchBounds) rasterBatchBounds = { x0, y0, x1, y1 };
    else {
      rasterBatchBounds.x0 = Math.min(rasterBatchBounds.x0, x0); rasterBatchBounds.y0 = Math.min(rasterBatchBounds.y0, y0);
      rasterBatchBounds.x1 = Math.max(rasterBatchBounds.x1, x1); rasterBatchBounds.y1 = Math.max(rasterBatchBounds.y1, y1);
    }
  }
  function withRasterBatch(callback) {
    beginRasterBatch();
    try { return callback(); } finally { endRasterBatch(); }
  }

  function setPixel(layer, x, y, paletteIndexOverride) {
    if (!layer) {
      return;
    }
    const tool = pointerState.tool || state.tool;
    if (!isMirrorEnabledForTool(tool)) {
      setPixelSingle(layer, x, y, paletteIndexOverride);
      return;
    }
    const points = getMirroredPointSet(x, y, { tool, includeOriginal: true });
    if (!points.length) {
      return;
    }
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      setPixelSingle(layer, point.x, point.y, paletteIndexOverride);
    }
  }

  function setPixelSingle(layer, x, y, paletteIndexOverride) {
    const activeCanvasDoc = getActiveProjectCanvasDocument();
    const canvasWidth = Math.max(1, Math.round(Number(activeCanvasDoc?.width) || Number(state.width) || 1));
    const canvasHeight = Math.max(1, Math.round(Number(activeCanvasDoc?.height) || Number(state.height) || 1));
    if (x < 0 || y < 0 || x >= canvasWidth || y >= canvasHeight) return;
    const selectionIndex = y * canvasWidth + x;
    if (
      state.selectionMask instanceof Uint8Array
      && selectionIndex >= 0
      && selectionIndex < state.selectionMask.length
      && state.selectionMask[selectionIndex] !== 1
    ) {
      return;
    }
    if (isSimulationLayer(layer)) {
      setSimulationPixelSingle(layer, x, y);
      return;
    }
    const index = y * canvasWidth + x;
    const base = index * 4;
    let direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    const transparentStorageIndex = resolveTransparentStoragePaletteIndex();
    const transparentLayerValue = getRasterLayerTransparentStorageValue(layer);
    recordPendingPixelPatchBefore(layer, index);

    if (pointerState.tool === 'eraser') {
      if (readLayerRuntimeIndex(layer, index) === transparentStorageIndex && (!direct || direct[base + 3] === 0)) {
        return;
      }
      writeLayerRuntimeIndex(layer, index, transparentStorageIndex);
      if (direct) {
        direct[base] = 0;
        direct[base + 1] = 0;
        direct[base + 2] = 0;
        direct[base + 3] = 0;
      }
      recordPendingPixelPatchAfter(layer, index);
      markHistoryDirty();
      noteRasterPixelDirty(x, y);
      return;
    }

    if (isRgbColorMode()) {
      const rgbColor = normalizeColorValue(getActiveDrawColor(undefined, paletteIndexOverride));
      if (rgbColor.a <= 0 && transparentStorageIndex >= 0) {
        if (readLayerRuntimeIndex(layer, index) === transparentStorageIndex && (!direct || direct[base + 3] === 0)) {
          return;
        }
        writeLayerRuntimeIndex(layer, index, transparentStorageIndex);
        if (direct) {
          direct[base] = 0;
          direct[base + 1] = 0;
          direct[base + 2] = 0;
          direct[base + 3] = 0;
        }
        recordPendingPixelPatchAfter(layer, index);
        markHistoryDirty();
        noteRasterPixelDirty(x, y);
        return;
      }
      const hasSameIndex = readLayerRuntimeIndex(layer, index) === transparentLayerValue;
      if (hasSameIndex && direct) {
        const sameColor = direct[base] === rgbColor.r
          && direct[base + 1] === rgbColor.g
          && direct[base + 2] === rgbColor.b
          && direct[base + 3] === rgbColor.a;
        if (sameColor) {
          return;
        }
      }
      if (!direct) {
        direct = ensureLayerDirect(layer);
      }
      writeLayerRuntimeIndex(layer, index, transparentLayerValue);
      direct[base] = rgbColor.r;
      direct[base + 1] = rgbColor.g;
      direct[base + 2] = rgbColor.b;
      direct[base + 3] = rgbColor.a;
      recordPendingPixelPatchAfter(layer, index);
      markHistoryDirty();
      noteRasterPixelDirty(x, y);
      return;
    }

    const paletteIndex = resolveDrawPaletteIndex(paletteIndexOverride);
    if (isMultiPaletteIsolationEnabled()) {
      const drawColor = normalizeColorValue(getActiveDrawColor(undefined, paletteIndex));
      if (drawColor.a <= 0 && transparentStorageIndex >= 0) {
        if (readLayerRuntimeIndex(layer, index) === transparentStorageIndex && (!direct || direct[base + 3] === 0)) {
          return;
        }
        writeLayerRuntimeIndex(layer, index, transparentStorageIndex);
        if (direct) {
          direct[base] = 0;
          direct[base + 1] = 0;
          direct[base + 2] = 0;
          direct[base + 3] = 0;
        }
        recordPendingPixelPatchAfter(layer, index);
        markHistoryDirty();
        noteRasterPixelDirty(x, y);
        return;
      }
      if (!direct) {
        direct = ensureLayerDirect(layer);
      }
      const sameColor = readLayerRuntimeIndex(layer, index) === transparentLayerValue
        && direct[base] === drawColor.r
        && direct[base + 1] === drawColor.g
        && direct[base + 2] === drawColor.b
        && direct[base + 3] === drawColor.a;
      if (sameColor) {
        return;
      }
      writeLayerRuntimeIndex(layer, index, transparentLayerValue);
      direct[base] = drawColor.r;
      direct[base + 1] = drawColor.g;
      direct[base + 2] = drawColor.b;
      direct[base + 3] = drawColor.a;
      recordPendingPixelPatchAfter(layer, index);
      markHistoryDirty();
      noteRasterPixelDirty(x, y);
      return;
    }
    if (readLayerRuntimeIndex(layer, index) === paletteIndex) {
      return;
    }
    writeLayerRuntimeIndex(layer, index, paletteIndex);
    layer.directOnly = false;
    if (direct) {
      direct[base] = 0;
      direct[base + 1] = 0;
      direct[base + 2] = 0;
      direct[base + 3] = 0;
    }
    recordPendingPixelPatchAfter(layer, index);
    markHistoryDirty();
    noteRasterPixelDirty(x, y);
  }

  function setLayerPixelDirectColorSingle(layer, x, y, color, { canvasDoc = null, respectSelection = true, markDirty = true } = {}) {
    if (!layer) {
      return false;
    }
    const sourceCanvasDoc = canvasDoc || getActiveProjectCanvasDocument();
    const canvasWidth = Math.max(1, Math.round(Number(sourceCanvasDoc?.width) || Number(state.width) || 1));
    const canvasHeight = Math.max(1, Math.round(Number(sourceCanvasDoc?.height) || Number(state.height) || 1));
    if (x < 0 || y < 0 || x >= canvasWidth || y >= canvasHeight) {
      return false;
    }
    const index = y * canvasWidth + x;
    if (
      respectSelection
      && state.selectionMask instanceof Uint8Array
      && index >= 0
      && index < state.selectionMask.length
      && state.selectionMask[index] !== 1
    ) {
      return false;
    }
    if (isSimulationLayer(layer)) {
      setSimulationPixelSingle(layer, x, y);
      return true;
    }
    const rgba = normalizeColorValue(color);
    const base = index * 4;
    let direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    const transparentStorageIndex = resolveTransparentStoragePaletteIndex();
    const transparentLayerValue = getRasterLayerTransparentStorageValue(layer);
    recordPendingPixelPatchBefore(layer, index);
    if (rgba.a <= 0 && transparentStorageIndex >= 0) {
      const alreadyTransparent = readLayerRuntimeIndex(layer, index) === transparentStorageIndex && (!direct || direct[base + 3] === 0);
      if (alreadyTransparent) {
        return false;
      }
      writeLayerRuntimeIndex(layer, index, transparentStorageIndex);
      if (direct) {
        direct[base] = 0;
        direct[base + 1] = 0;
        direct[base + 2] = 0;
        direct[base + 3] = 0;
      }
      if (markDirty) {
        recordPendingPixelPatchAfter(layer, index);
        markHistoryDirty();
        noteRasterPixelDirty(x, y);
      }
      return true;
    }
    if (!direct) {
      direct = ensureLayerDirect(layer, canvasWidth, canvasHeight);
    }
    const sameColor = readLayerRuntimeIndex(layer, index) === transparentLayerValue
      && direct[base] === rgba.r
      && direct[base + 1] === rgba.g
      && direct[base + 2] === rgba.b
      && direct[base + 3] === rgba.a;
    if (sameColor) {
      return false;
    }
    writeLayerRuntimeIndex(layer, index, transparentLayerValue);
    direct[base] = rgba.r;
    direct[base + 1] = rgba.g;
    direct[base + 2] = rgba.b;
    direct[base + 3] = rgba.a;
    if (markDirty) {
      recordPendingPixelPatchAfter(layer, index);
      markHistoryDirty();
      noteRasterPixelDirty(x, y);
    }
    return true;
  }

  function activateSimulationCell(layer, index) {
    if (!isSimulationLayer(layer) || !Number.isInteger(index) || index < 0 || index >= layer.activeMap.length) {
      return;
    }
    layer.activeMap[index] = 1;
  }

  function activateSimulationAround(layer, x, y, radius = 1) {
    if (!isSimulationLayer(layer)) {
      return;
    }
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
        activateSimulationCell(layer, (ny * state.width) + nx);
      }
    }
  }

  function seedSimulationElementState(layer, index, element) {
    if (!isSimulationLayer(layer)) {
      return;
    }
    if (element === SIM_ELEMENT_FIRE) {
      layer.lifeMap[index] = 28;
      layer.tempMap[index] = 760;
    } else if (element === SIM_ELEMENT_SMOKE) {
      layer.lifeMap[index] = 48;
      layer.tempMap[index] = 140;
    } else if (element === SIM_ELEMENT_WATER) {
      layer.lifeMap[index] = 0;
      layer.tempMap[index] = 0;
      layer.auxMap[index] = 4;
    } else if (element === SIM_ELEMENT_LIGHT) {
      layer.lightMap[index] = 255;
    } else {
      layer.lifeMap[index] = 0;
      layer.tempMap[index] = 0;
      layer.lightMap[index] = 0;
    }
  }

  function setSimulationPixelSingle(layer, x, y) {
    const index = (y * state.width) + x;
    const color = normalizeColorValue(getActiveDrawColor());
    const colorBase = index * 4;
    const mode = simulationEditorState.paintMode;
    if (pointerState.tool === 'eraser') {
      layer.elementMap[index] = SIM_ELEMENT_EMPTY;
      layer.sourceColorMap[colorBase] = 0;
      layer.sourceColorMap[colorBase + 1] = 0;
      layer.sourceColorMap[colorBase + 2] = 0;
      layer.sourceColorMap[colorBase + 3] = 0;
      layer.velXMap[index] = 0;
      layer.velYMap[index] = 0;
      layer.lifeMap[index] = 0;
      layer.tempMap[index] = 0;
      layer.lightMap[index] = 0;
      activateSimulationAround(layer, x, y, 2);
      markHistoryDirty();
      markDirtyPixel(x, y);
      return;
    }
    if (mode === SIM_PAINT_MODE_DEPTH) {
      layer.depthMap[index] = clamp(Math.round(Number(simulationEditorState.depthValue) || 0), 0, 255);
    } else if (mode === SIM_PAINT_MODE_AIR) {
      layer.airMap[index] = clamp(Math.round(Number(simulationEditorState.airValue) || 0), 0, 255);
    } else {
      const element = clamp(Math.round(Number(simulationEditorState.element) || 0), 0, SIM_ELEMENT_LIGHT);
      layer.elementMap[index] = element;
      layer.sourceColorMap[colorBase] = color.r;
      layer.sourceColorMap[colorBase + 1] = color.g;
      layer.sourceColorMap[colorBase + 2] = color.b;
      layer.sourceColorMap[colorBase + 3] = color.a;
      seedSimulationElementState(layer, index, element);
    }
    activateSimulationAround(layer, x, y, 2);
    markHistoryDirty();
    markDirtyPixel(x, y);
  }

  function getBrushOffsets(size, shapeOverride = state.brushShape) {
    const shape = getEffectiveBrushShape(shapeOverride);
    if (shape === BRUSH_SHAPE_CUSTOM) {
      if (isCustomBrushData(state.customBrush)) {
        return state.customBrush.offsets;
      }
      return getBrushOffsets(size, BRUSH_SHAPE_SQUARE);
    }

    const base = clamp(Math.round(size || 1), 1, 64);
    const cache = shape === BRUSH_SHAPE_CIRCLE ? brushCircleOffsetCache : brushOffsetCache;
    let offsets = cache.get(base);
    if (!offsets) {
      const halfDown = Math.floor(base / 2);
      const halfUp = Math.ceil(base / 2);
      offsets = [];
      const centerShift = base % 2 === 0 ? 0.5 : 0;
      const radius = Math.max(0.5, (base / 2) - 0.25);
      const radiusSq = radius * radius;
      for (let dy = -halfDown; dy < halfUp; dy += 1) {
        for (let dx = -halfDown; dx < halfUp; dx += 1) {
          if (shape === BRUSH_SHAPE_CIRCLE) {
            const cx = dx + centerShift;
            const cy = dy + centerShift;
            if ((cx * cx) + (cy * cy) > radiusSq) {
              continue;
            }
          }
          offsets.push({ dx, dy });
        }
      }
      cache.set(base, offsets);
    }
    return offsets;
  }

  function forEachBrushOffset(callback, sizeOverride, shapeOverride = state.brushShape) {
    const baseSize = sizeOverride ?? state.brushSize;
    const offsets = getBrushOffsets(baseSize || 1, shapeOverride);
    for (let i = 0; i < offsets.length; i += 1) {
      const { dx, dy } = offsets[i];
      callback(dx, dy);
    }
  }

  function stampLargeSnapshotBrush(layer, cx, cy) {
    if (!isRasterTilePatchPending?.() || !layer || !isIndexColorMode() || isMultiPaletteIsolationEnabled() || isMirrorEnabledForTool(pointerState.tool || state.tool)) {
      return false;
    }
    const canvas = getActiveProjectCanvasDocument();
    const width = Math.max(1, Math.round(Number(canvas?.width) || Number(state.width) || 1));
    const height = Math.max(1, Math.round(Number(canvas?.height) || Number(state.height) || 1));
    const tool = pointerState.tool || state.tool;
    const paletteIndex = tool === 'eraser' ? resolveTransparentStoragePaletteIndex() : resolveDrawPaletteIndex();
    const direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    const shape = getEffectiveBrushShape();
    const brushSize = clamp(Math.round(state.brushSize || 1), 1, 64);
    const offsets = getBrushOffsets(brushSize, shape);
    let captureX0 = width; let captureY0 = height; let captureX1 = -1; let captureY1 = -1;
    if (shape !== BRUSH_SHAPE_CUSTOM) {
      const halfDown = Math.floor(brushSize / 2);
      const halfUp = Math.ceil(brushSize / 2);
      captureX0 = Math.max(0, cx - halfDown);
      captureY0 = Math.max(0, cy - halfDown);
      captureX1 = Math.min(width - 1, cx + halfUp - 1);
      captureY1 = Math.min(height - 1, cy + halfUp - 1);
    } else {
      for (let i = 0; i < offsets.length; i += 1) {
        const x = cx + offsets[i].dx; const y = cy + offsets[i].dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (x < captureX0) captureX0 = x; if (x > captureX1) captureX1 = x;
        if (y < captureY0) captureY0 = y; if (y > captureY1) captureY1 = y;
      }
    }
    if (captureX1 >= captureX0 && captureY1 >= captureY0) {
      capturePendingRasterTilesForRect?.(layer, captureX0, captureY0, captureX1, captureY1);
    }
    let x0 = width; let y0 = height; let x1 = -1; let y1 = -1;
    const indexBuffer = layer.indices instanceof Int16Array || layer.indices instanceof Uint8Array
      ? layer.indices
      : null;
    const selectionMask = state.selectionMask instanceof Uint8Array ? state.selectionMask : null;
    for (let i = 0; i < offsets.length; i += 1) {
      const x = cx + offsets[i].dx;
      const y = cy + offsets[i].dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const index = (y * width) + x;
      if (selectionMask && selectionMask[index] !== 1) continue;
      const base = index * 4;
      const currentIndex = indexBuffer ? indexBuffer[index] : readLayerRuntimeIndex(layer, index);
      if (currentIndex === paletteIndex && (!direct || direct[base + 3] === 0)) continue;
      if (indexBuffer) indexBuffer[index] = paletteIndex;
      else writeLayerRuntimeIndex(layer, index, paletteIndex);
      if (direct) { direct[base] = 0; direct[base + 1] = 0; direct[base + 2] = 0; direct[base + 3] = 0; }
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < x0 || y1 < y0) return true;
    layer.directOnly = false;
    markHistoryDirty();
    noteRasterRectDirty(x0, y0, x1, y1);
    return true;
  }

  function stampBrush(layer, cx, cy) {
    if (stampLargeSnapshotBrush(layer, cx, cy)) return;
    return withRasterBatch(() => forEachBrushOffset((dx, dy) => setPixel(layer, cx + dx, cy + dy)));
  }

  function drawLine(start, end) {
    const layer = getActiveLayer();
    if (!layer) return;
    const points = bresenhamLine(start.x, start.y, end.x, end.y);
    const brushSize = Math.max(1, Math.round(Number(state.brushSize) || 1));
    const stampStride = brushSize >= 12 ? Math.max(1, Math.floor(brushSize / 5)) : 1;
    withRasterBatch(() => {
      for (let index = 0; index < points.length; index += stampStride) {
        stampBrush(layer, points[index].x, points[index].y);
      }
      const last = points[points.length - 1];
      if (last && (points.length - 1) % stampStride !== 0) stampBrush(layer, last.x, last.y);
    });
    requestRender();
  }

  function drawRectangle(start, end, filled) {
    const layer = getActiveLayer();
    if (!layer) return;
    const x0 = Math.min(start.x, end.x);
    const x1 = Math.max(start.x, end.x);
    const y0 = Math.min(start.y, end.y);
    const y1 = Math.max(start.y, end.y);
    const activeTool = pointerState.tool || state.tool;
    const brushSize = clamp(Math.round(state.brushSize || 1), 1, 64);
    const centerStep = brushSize >= 12 ? Math.max(1, Math.floor(brushSize / 5)) : 1;
    const hasMirror = isMirrorEnabledForTool(activeTool);
    const brushShape = getEffectiveBrushShape();
    const forEachCenter = (from, to, callback) => {
      let last = null;
      for (let value = from; value <= to; value += centerStep) { callback(value); last = value; }
      if (last !== to) callback(to);
    };

    withRasterBatch(() => {
    if (filled) {
      if (brushSize === 1 && brushShape === BRUSH_SHAPE_SQUARE && !hasMirror) {
        for (let y = y0; y <= y1; y += 1) {
          for (let x = x0; x <= x1; x += 1) {
            setPixelSingle(layer, x, y);
          }
        }
        return;
      }
      forEachCenter(y0, y1, y => forEachCenter(x0, x1, x => stampBrush(layer, x, y)));
    } else {
      forEachCenter(x0, x1, x => {
        stampBrush(layer, x, y0);
        stampBrush(layer, x, y1);
      });
      forEachCenter(y0, y1, y => {
        stampBrush(layer, x0, y);
        stampBrush(layer, x1, y);
      });
    }
    });
    requestRender();
  }

  function drawEllipse(start, end, filled) {
    const layer = getActiveLayer();
    if (!layer) return;
    const x0 = Math.min(start.x, end.x);
    const x1 = Math.max(start.x, end.x);
    const y0 = Math.min(start.y, end.y);
    const y1 = Math.max(start.y, end.y);
    if (x0 === x1 && y0 === y1) {
      stampBrush(layer, x0, y0);
      requestRender();
      return;
    }
    const brushSize = clamp(Math.round(state.brushSize || 1), 1, 64);
    const stampStride = brushSize >= 12 ? Math.max(1, Math.floor(brushSize / 5)) : 1;
    let pixelCount = 0;
    let lastPoint = null;
    withRasterBatch(() => drawEllipsePixels(x0, y0, x1, y1, filled, (x, y) => {
      lastPoint = { x, y };
      if ((pixelCount++ % stampStride) === 0) stampBrush(layer, x, y);
    }));
    if (lastPoint && ((pixelCount - 1) % stampStride) !== 0) stampBrush(layer, lastPoint.x, lastPoint.y);
    requestRender();
  }

  function drawEllipsePixels(x0, y0, x1, y1, filled, plotPixel) {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    if (maxX < minX || maxY < minY) return;
    const width = (maxX - minX) + 1;
    const height = (maxY - minY) + 1;
    const diameter = Math.max(1, Math.min(width, height));
    const circleMinX = minX + Math.floor((width - diameter) * 0.5);
    const circleMinY = minY + Math.floor((height - diameter) * 0.5);
    const circleMaxX = circleMinX + diameter - 1;
    const circleMaxY = circleMinY + diameter - 1;

    if (diameter === 1) {
      plotPixel(circleMinX, circleMinY);
      return;
    }

    const centerX2 = circleMinX + circleMaxX;
    const centerY2 = circleMinY + circleMaxY;
    const parity = Math.abs(centerX2) % 2;
    let radius2 = circleMaxX - circleMinX;
    if ((Math.abs(radius2) % 2) !== parity) {
      radius2 -= 1;
    }

    const fillRanges = filled ? new Map() : null;
    const recordPoint = (x, y) => {
      if (x < circleMinX || x > circleMaxX || y < circleMinY || y > circleMaxY) {
        return;
      }
      if (fillRanges) {
        const existing = fillRanges.get(y);
        if (existing) {
          existing.min = Math.min(existing.min, x);
          existing.max = Math.max(existing.max, x);
        } else {
          fillRanges.set(y, { min: x, max: x });
        }
      } else {
        plotPixel(x, y);
      }
    };

    const plotSymmetricOffset2 = (dx2, dy2) => {
      const pairs = [
        [dx2, dy2],
        [-dx2, dy2],
        [dx2, -dy2],
        [-dx2, -dy2],
        [dy2, dx2],
        [-dy2, dx2],
        [dy2, -dx2],
        [-dy2, -dx2],
      ];
      for (let i = 0; i < pairs.length; i += 1) {
        const [ox2, oy2] = pairs[i];
        const px2 = centerX2 + ox2;
        const py2 = centerY2 + oy2;
        if ((px2 & 1) !== 0 || (py2 & 1) !== 0) {
          continue;
        }
        recordPoint(px2 / 2, py2 / 2);
      }
    };

    let dx2 = parity;
    let dy2 = radius2;
    while (dx2 <= dy2) {
      plotSymmetricOffset2(dx2, dy2);
      const nextDx2 = dx2 + 2;
      const errEast = Math.abs((nextDx2 * nextDx2) + (dy2 * dy2) - (radius2 * radius2));
      const nextDy2 = dy2 - 2;
      const errSouthEast = nextDy2 >= parity
        ? Math.abs((nextDx2 * nextDx2) + (nextDy2 * nextDy2) - (radius2 * radius2))
        : Number.POSITIVE_INFINITY;
      if (errSouthEast <= errEast) {
        dy2 = nextDy2;
      }
      dx2 = nextDx2;
    }

    if (fillRanges) {
      fillRanges.forEach((range, y) => {
        for (let x = range.min; x <= range.max; x += 1) {
          plotPixel(x, y);
        }
      });
    }
  }

  const FILL_DITHER_BAYER_4 = Object.freeze([
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5,
  ]);

  function getFillGradientColors(paletteIndexOverride) {
    const activePaletteIndex = normalizePaletteIndex(state.activePaletteIndex, state.activePaletteIndex);
    const secondaryPaletteIndex = normalizePaletteIndex(state.secondaryPaletteIndex, activePaletteIndex);
    const primaryPaletteIndex = Number.isFinite(paletteIndexOverride)
      ? normalizePaletteIndex(paletteIndexOverride, activePaletteIndex)
      : activePaletteIndex;
    const gradientEndPaletteIndex = primaryPaletteIndex === secondaryPaletteIndex
      ? activePaletteIndex
      : secondaryPaletteIndex;
    return {
      primaryPaletteIndex,
      secondaryPaletteIndex: gradientEndPaletteIndex,
      primaryColor: normalizeColorValue(getActiveDrawColor(undefined, primaryPaletteIndex)),
      secondaryColor: normalizeColorValue(
        state.palette[gradientEndPaletteIndex]
        || state.palette[secondaryPaletteIndex]
        || state.activeRgb
        || { r: 0, g: 0, b: 0, a: 255 }
      ),
    };
  }

  function normalizeFillGradientPoint(point, fallback) {
    const source = point && typeof point === 'object' ? point : fallback;
    return {
      x: Math.round(Number(source?.x) || 0),
      y: Math.round(Number(source?.y) || 0),
    };
  }

  function getFillGradientT(x, y, start, end) {
    const sx = Math.round(Number(start?.x) || 0);
    const sy = Math.round(Number(start?.y) || 0);
    const dx = Math.round(Number(end?.x) || sx) - sx;
    const dy = Math.round(Number(end?.y) || sy) - sy;
    const lengthSq = (dx * dx) + (dy * dy);
    if (lengthSq <= 0) {
      return 0;
    }
    return clamp((((x - sx) * dx) + ((y - sy) * dy)) / lengthSq, 0, 1);
  }

  function interpolateFillGradientColor(primaryColor, secondaryColor, t) {
    const amount = clamp(Number(t) || 0, 0, 1);
    const from = normalizeColorValue(primaryColor);
    const to = normalizeColorValue(secondaryColor);
    const mix = (a, b) => clamp(Math.round(a + ((b - a) * amount)), 0, 255);
    return {
      r: mix(from.r, to.r),
      g: mix(from.g, to.g),
      b: mix(from.b, to.b),
      a: mix(from.a, to.a),
    };
  }

  function resolveFillGradientPixel(x, y, context) {
    const style = normalizeFillStyle(context?.fillStyle, state.fillStyle);
    const colors = context?.colors || getFillGradientColors(context?.paletteIndexOverride);
    const start = context?.start || { x, y };
    const end = context?.end || start;
    const t = getFillGradientT(x, y, start, end);
    if (style === FILL_STYLE_DITHER_GRADIENT) {
      const thresholdIndex = ((y & 3) * 4) + (x & 3);
      const threshold = ((FILL_DITHER_BAYER_4[thresholdIndex] || 0) + 0.5) / 16;
      const useSecondary = t >= threshold;
      return {
        color: useSecondary ? colors.secondaryColor : colors.primaryColor,
        paletteIndex: useSecondary ? colors.secondaryPaletteIndex : colors.primaryPaletteIndex,
      };
    }
    const interpolated = interpolateFillGradientColor(colors.primaryColor, colors.secondaryColor, t);
    if (context?.paletteGradient) {
      const fallbackIndex = normalizePaletteIndex(colors.primaryPaletteIndex, state.activePaletteIndex);
      const paletteIndex = findNearestPaletteIndexForColor(interpolated, state.palette, fallbackIndex);
      if (paletteIndex >= 0 && state.palette[paletteIndex]) {
        return {
          color: normalizeColorValue(state.palette[paletteIndex]),
          paletteIndex,
        };
      }
    }
    return {
      color: interpolated,
      paletteIndex: -1,
    };
  }

  function collectFillTargetPixels(layer, x, y, { fillMode = state.selectSameMode, selectionMask = state.selectionMask, limit = Number.POSITIVE_INFINITY } = {}) {
    if (!layer) return null;
    const width = state.width;
    const height = state.height;
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return [];
    }
    const startIdx = y * width + x;
    if (selectionMask && selectionMask[startIdx] !== 1) {
      return [];
    }
    const matchState = getLayerPixelMatchState(layer, startIdx);
    if (!matchState) {
      return [];
    }
    const normalizedFillMode = normalizeSelectSameMode(fillMode, SELECT_SAME_MODE_CONNECTED);
    const maxPixels = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : Number.POSITIVE_INFINITY;
    const pixels = [];
    const pushPixel = (idx) => {
      pixels.push(idx);
      return pixels.length >= maxPixels;
    };

    if (normalizedFillMode === SELECT_SAME_MODE_GLOBAL) {
      for (let py = 0; py < height; py += 1) {
        const rowOffset = py * width;
        for (let px = 0; px < width; px += 1) {
          const idx = rowOffset + px;
          if (selectionMask && selectionMask[idx] !== 1) continue;
          if (!layerPixelMatchesMatchState(matchState, idx)) continue;
          if (pushPixel(idx)) {
            markFillPreviewPixelsTruncated(pixels);
            return pixels;
          }
        }
      }
      return pixels;
    }

    // Scanline flood fill keeps the work stack proportional to boundaries,
    // rather than pushing four neighbours for every painted pixel.
    const visited = new Uint8Array(width * height);
    const stack = [x, y];
    const canVisit = (px, py) => {
      if (px < 0 || py < 0 || px >= width || py >= height) return false;
      const idx = py * width + px;
      return !visited[idx]
        && (!selectionMask || selectionMask[idx] === 1)
        && layerPixelMatchesMatchState(matchState, idx);
    };
    while (stack.length > 0) {
      const py = stack.pop();
      const px = stack.pop();
      if (!Number.isFinite(px) || !Number.isFinite(py) || !canVisit(px, py)) continue;
      let left = px;
      let right = px;
      while (left > 0 && canVisit(left - 1, py)) left -= 1;
      while (right + 1 < width && canVisit(right + 1, py)) right += 1;
      let aboveOpen = false;
      let belowOpen = false;
      for (let runX = left; runX <= right; runX += 1) {
        const idx = py * width + runX;
        visited[idx] = 1;
        if (pushPixel(idx)) {
          markFillPreviewPixelsTruncated(pixels);
          return pixels;
        }
        const canVisitAbove = canVisit(runX, py - 1);
        if (canVisitAbove && !aboveOpen) stack.push(runX, py - 1);
        aboveOpen = canVisitAbove;
        const canVisitBelow = canVisit(runX, py + 1);
        if (canVisitBelow && !belowOpen) stack.push(runX, py + 1);
        belowOpen = canVisitBelow;
      }
    }
    return pixels;
  }

  function collectSolidFillTargetRuns(layer, x, y, { fillMode = state.selectSameMode, selectionMask = state.selectionMask } = {}) {
    if (!layer) return new Int32Array(0);
    const width = Math.max(1, Number(state.width) || 1);
    const height = Math.max(1, Number(state.height) || 1);
    if (x < 0 || y < 0 || x >= width || y >= height) return new Int32Array(0);
    const startIndex = y * width + x;
    if (selectionMask && selectionMask[startIndex] !== 1) return new Int32Array(0);
    const matchState = getLayerPixelMatchState(layer, startIndex);
    if (!matchState) return new Int32Array(0);
    const normalizedMode = normalizeSelectSameMode(fillMode, SELECT_SAME_MODE_CONNECTED);
    const runs = [];
    if (normalizedMode === SELECT_SAME_MODE_GLOBAL) {
      for (let py = 0; py < height; py += 1) {
        const rowStart = py * width;
        let px = 0;
        while (px < width) {
          const index = rowStart + px;
          if ((selectionMask && selectionMask[index] !== 1) || !layerPixelMatchesMatchState(matchState, index)) { px += 1; continue; }
          const start = index;
          px += 1;
          while (px < width) {
            const nextIndex = rowStart + px;
            if ((selectionMask && selectionMask[nextIndex] !== 1) || !layerPixelMatchesMatchState(matchState, nextIndex)) break;
            px += 1;
          }
          runs.push(start, px - (start - rowStart));
        }
      }
      return new Int32Array(runs);
    }
    // One bit per logical pixel is substantially smaller than an array of
    // objects; more importantly, the output stays one run per scanline.
    const visited = new Uint8Array(width * height);
    const stack = [x, y];
    const canVisit = (px, py) => {
      if (px < 0 || py < 0 || px >= width || py >= height) return false;
      const index = py * width + px;
      return !visited[index] && (!selectionMask || selectionMask[index] === 1) && layerPixelMatchesMatchState(matchState, index);
    };
    while (stack.length) {
      const py = stack.pop();
      const px = stack.pop();
      if (!canVisit(px, py)) continue;
      let left = px; let right = px;
      while (left > 0 && canVisit(left - 1, py)) left -= 1;
      while (right + 1 < width && canVisit(right + 1, py)) right += 1;
      runs.push((py * width) + left, right - left + 1);
      let aboveOpen = false; let belowOpen = false;
      for (let runX = left; runX <= right; runX += 1) {
        const index = py * width + runX;
        visited[index] = 1;
        const above = canVisit(runX, py - 1);
        if (above && !aboveOpen) stack.push(runX, py - 1);
        aboveOpen = above;
        const below = canVisit(runX, py + 1);
        if (below && !belowOpen) stack.push(runX, py + 1);
        belowOpen = below;
      }
    }
    return new Int32Array(runs);
  }

  function applyGradientFillPixel(layer, x, y, context) {
    const style = normalizeFillStyle(context?.fillStyle, state.fillStyle);
    const pixel = resolveFillGradientPixel(x, y, context);
    if (
      isIndexColorMode()
      && !isMultiPaletteIsolationEnabled()
      && Number.isFinite(pixel.paletteIndex)
      && pixel.paletteIndex >= 0
    ) {
      setPixelSingle(layer, x, y, pixel.paletteIndex);
      return true;
    }
    return setLayerPixelDirectColorSingle(layer, x, y, pixel.color);
  }

  function applySolidIndexFillPixels(layer, pixels, paletteIndex) {
    if (!layer || !Array.isArray(pixels) || !pixels.length) {
      return false;
    }
    const width = Math.max(1, Number(state.width) || 1);
    const direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    // Capture the old cells once as typed scanline runs before mutation. This
    // is deliberately scoped to the active layer/frame, unlike a document
    // snapshot, and avoids creating one history object per filled pixel.
    const fillPatch = preparePendingSolidFillPatch?.(layer, pixels, paletteIndex) || null;
    let changed = false;
    let x0 = width;
    let y0 = Math.max(1, Number(state.height) || 1);
    let x1 = -1;
    let y1 = -1;
    for (let offset = 0; offset < pixels.length; offset += 1) {
      const index = pixels[offset];
      if (!Number.isInteger(index) || index < 0) {
        continue;
      }
      if (readLayerRuntimeIndex(layer, index) === paletteIndex && (!direct || direct[(index * 4) + 3] === 0)) {
        continue;
      }
      if (!fillPatch) recordPendingPixelPatchBefore(layer, index);
      writeLayerRuntimeIndex(layer, index, paletteIndex);
      if (direct) {
        const base = index * 4;
        direct[base] = 0;
        direct[base + 1] = 0;
        direct[base + 2] = 0;
        direct[base + 3] = 0;
      }
      if (!fillPatch) recordPendingPixelPatchAfter(layer, index);
      const x = index % width;
      const y = Math.floor(index / width);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      changed = true;
    }
    if (!changed) {
      return false;
    }
    layer.directOnly = false;
    markHistoryDirty();
    markDirtyRect(x0, y0, x1, y1);
    return true;
  }

  function applySolidIndexFillRuns(layer, runs, paletteIndex) {
    if (!layer || !(runs instanceof Int32Array) || !runs.length) return false;
    const width = Math.max(1, Number(state.width) || 1);
    const direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    const canvasPixelCount = width * Math.max(1, Number(state.height) || 1);
    const layerPixelCount = (
      (layer.indices instanceof Int16Array || layer.indices instanceof Uint8Array)
      && layer.indices.length > 0
    )
      ? layer.indices.length
      : canvasPixelCount;
    const fillPatch = preparePendingSolidFillRuns?.(layer, runs, paletteIndex) || null;
    let changed = false;
    let x0 = width; let y0 = Math.max(1, Number(state.height) || 1); let x1 = -1; let y1 = -1;
    for (let offset = 0; offset + 1 < runs.length; offset += 2) {
      const start = Math.max(0, runs[offset]);
      const end = Math.min(layerPixelCount, start + Math.max(0, runs[offset + 1]));
      if (
        fillPatch
        && (layer.indices instanceof Int16Array || layer.indices instanceof Uint8Array)
        && layer.indices.length >= layerPixelCount
      ) {
        // The history helper has already captured the old values.  A typed
        // array fill maps to the platform's contiguous-memory fast path,
        // which is the important difference for a 1000px-wide bucket fill.
        layer.indices.fill(paletteIndex, start, end);
        if (direct) direct.fill(0, start * 4, end * 4);
      } else {
        for (let index = start; index < end; index += 1) {
          if (!fillPatch) recordPendingPixelPatchBefore(layer, index);
          writeLayerRuntimeIndex(layer, index, paletteIndex);
          if (direct) direct.fill(0, index * 4, (index * 4) + 4);
          if (!fillPatch) recordPendingPixelPatchAfter(layer, index);
        }
      }
      if (end > start) {
        const row = Math.floor(start / width);
        x0 = Math.min(x0, start % width); x1 = Math.max(x1, (end - 1) % width);
        y0 = Math.min(y0, row); y1 = Math.max(y1, row);
        changed = true;
      }
    }
    if (!changed) return false;
    layer.directOnly = false;
    markHistoryDirty();
    markDirtyRect(x0, y0, x1, y1);
    return true;
  }

  function prepareLargeIndexedFillTileHistory(layer, pixels) {
    // Solid fills use denser scanline runs. Gradient/dither fills need a
    // different final value per pixel, so their compact history is the set of
    // touched 64px tiles instead of a giant per-pixel Map.
    if (!layer || !Array.isArray(pixels) || pixels.length < 4096) return false;
    if (!promotePendingPixelPatchToRasterTiles?.()) return false;
    const width = Math.max(1, Number(state.width) || 1);
    let x0 = width;
    let y0 = Math.max(1, Number(state.height) || 1);
    let x1 = -1;
    let y1 = -1;
    for (let i = 0; i < pixels.length; i += 1) {
      const index = pixels[i];
      if (!Number.isInteger(index) || index < 0) continue;
      const px = index % width;
      const py = Math.floor(index / width);
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
    }
    return x1 >= x0 && y1 >= y0
      ? Boolean(capturePendingRasterTilesForRect?.(layer, x0, y0, x1, y1))
      : false;
  }

  function floodFill(x, y, paletteIndexOverride, options = {}) {
    const layer = getActiveLayer();
    if (!layer) return;
    const width = state.width;
    const height = state.height;
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }
    const fillStyle = normalizeFillStyle(options.fillStyle, state.fillStyle);
    const gradientFill = isGradientFillStyle(fillStyle);
    const indexMode = isIndexColorMode();
    const fillMode = normalizeSelectSameMode(state.selectSameMode, SELECT_SAME_MODE_CONNECTED);
    const paletteIndex = indexMode ? resolveDrawPaletteIndex(paletteIndexOverride) : -1;
    const drawRgbColor = indexMode ? null : normalizeColorValue(getActiveDrawColor(undefined, paletteIndexOverride));
    const startIdx = y * width + x;
    const matchState = getLayerPixelMatchState(layer, startIdx);
    if (!matchState) {
      return;
    }
    const targetIndex = Number.isInteger(matchState.paletteIndex)
      ? matchState.paletteIndex
      : readLayerRuntimeIndex(layer, startIdx);
    if (!gradientFill && indexMode && targetIndex >= 0 && targetIndex === paletteIndex) {
      return;
    }
    if (!gradientFill && !indexMode && drawRgbColor) {
      const sourceColor = {
        r: matchState.r,
        g: matchState.g,
        b: matchState.b,
        a: matchState.a,
      };
      if (colorsMatchRgba(sourceColor, drawRgbColor)) {
        return;
      }
    }
    const selectionMask = state.selectionMask;

    // The ordinary indexed fill path is the common Aseprite-style bucket
    // operation. Resolve the region first, then mutate and dirty it in one
    // batch so a large fill does not perform render bookkeeping per pixel.
    if (indexMode && !gradientFill && !isMultiPaletteIsolationEnabled() && !isMirrorEnabledForTool('fill')) {
      const runs = collectSolidFillTargetRuns(layer, x, y, {
        fillMode,
        selectionMask,
      });
      if (applySolidIndexFillRuns(layer, runs, paletteIndex)) {
        requestRender();
        return;
      }
      // Keep Fill available for older/restored raster payloads whose runtime
      // storage cannot be represented by the compact scanline-run path. This
      // is deliberately a correctness fallback; normal indexed documents use
      // the faster path above.
      const fallbackPixels = collectFillTargetPixels(layer, x, y, {
        fillMode,
        selectionMask,
        limit: Number.POSITIVE_INFINITY,
      });
      if (applySolidIndexFillPixels(layer, fallbackPixels, paletteIndex)) {
        requestRender();
      }
      return;
    }

    if (gradientFill) {
      const start = normalizeFillGradientPoint(options.start, { x, y });
      const end = normalizeFillGradientPoint(options.end, start);
      const colors = getFillGradientColors(paletteIndexOverride);
      const pixels = collectFillTargetPixels(layer, x, y, { fillMode, selectionMask, limit: Number.POSITIVE_INFINITY });
      if (!pixels || !pixels.length) {
        return;
      }
      if (indexMode && !isMultiPaletteIsolationEnabled() && !isMirrorEnabledForTool('fill')) {
        prepareLargeIndexedFillTileHistory(layer, pixels);
      }
      const context = {
        fillStyle,
        start,
        end,
        colors,
        paletteIndexOverride,
        paletteGradient: indexMode && !isMultiPaletteIsolationEnabled(),
      };
      const mirrorEnabled = isMirrorEnabledForTool('fill');
      const painted = mirrorEnabled ? new Set() : null;
      for (let i = 0; i < pixels.length; i += 1) {
        const idx = pixels[i];
        const px = idx % width;
        const py = Math.floor(idx / width);
        if (!mirrorEnabled) {
          applyGradientFillPixel(layer, px, py, context);
          continue;
        }
        forEachMirroredPoint(px, py, 'fill', (mx, my) => {
          if (mx < 0 || my < 0 || mx >= width || my >= height) {
            return;
          }
          const maskIndex = my * width + mx;
          if (selectionMask && selectionMask[maskIndex] !== 1) {
            return;
          }
          if (painted && painted.has(maskIndex)) {
            return;
          }
          if (painted) {
            painted.add(maskIndex);
          }
          applyGradientFillPixel(layer, mx, my, context);
        });
      }
      requestRender();
      return;
    }

    if (fillMode === SELECT_SAME_MODE_GLOBAL) {
      for (let py = 0; py < height; py += 1) {
        const rowOffset = py * width;
        for (let px = 0; px < width; px += 1) {
          const idx = rowOffset + px;
          if (selectionMask && selectionMask[idx] !== 1) continue;
          if (!layerPixelMatchesMatchState(matchState, idx)) continue;
          setPixel(layer, px, py, indexMode ? paletteIndex : undefined);
        }
      }
      requestRender();
      return;
    }

    const visited = new Uint8Array(width * height);
    const stack = [x, y];
    while (stack.length > 0) {
      const py = stack.pop();
      const px = stack.pop();
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const idx = py * width + px;
      if (visited[idx]) continue;
      visited[idx] = 1;
      if (selectionMask && selectionMask[idx] !== 1) continue;
      if (!layerPixelMatchesMatchState(matchState, idx)) continue;
      setPixel(layer, px, py, indexMode ? paletteIndex : undefined);
      stack.push(px + 1, py);
      stack.push(px - 1, py);
      stack.push(px, py + 1);
      stack.push(px, py - 1);
    }
    requestRender();
  }

  function sampleColor(x, y) {
    const { color, mode, index } = sampleCompositeColor(x, y);
    if (!color) return;
    const normalized = normalizeColorValue(color);
    if (mode === 'index' && typeof index === 'number' && index >= 0 && isIndexColorMode()) {
      setActivePaletteIndex(index);
      state.activeRgb = normalized;
    } else {
      const previousActiveIndex = state.activePaletteIndex;
      if (typeof index === 'number' && index >= 0) {
        state.activePaletteIndex = normalizePaletteIndex(index, state.activePaletteIndex);
      }
      setActiveRgbColor(normalized, { syncInputs: true, render: false, persist: true });
      updatePaletteSelectionState(previousActiveIndex, state.secondaryPaletteIndex);
    }
    updateColorTabSwatch();
  }

  function sampleCompositePixelColor(x, y, { excludedLayerId = '' } = {}) {
    const frame = getActiveFrame();
    if (!frame || !Array.isArray(frame.layers)) {
      return null;
    }
    const width = Math.max(0, Math.floor(Number(state.width) || 0));
    const height = Math.max(0, Math.floor(Number(state.height) || 0));
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return null;
    }
    const pixelIndex = (y * width) + x;
    const composite = new Uint8ClampedArray(4);
    let hasVisibleColor = false;

    for (let i = 0; i < frame.layers.length; i += 1) {
      const layer = frame.layers[i];
      if (!layer || (excludedLayerId && layer.id === excludedLayerId)) {
        continue;
      }
      if (!getDisplayedLayerVisibility(layer, true)) {
        continue;
      }
      const layerOpacity = getDisplayedLayerPreviewOpacity(layer, 1);
      if (layerOpacity <= 0) {
        continue;
      }
      const direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
      const paletteIndex = typeof getStoredRasterLayerPaletteIndex === 'function'
        ? getStoredRasterLayerPaletteIndex(layer, pixelIndex)
        : readLayerRuntimeIndex(layer, pixelIndex);
      let srcR = 0;
      let srcG = 0;
      let srcB = 0;
      let srcA = 0;
      if (paletteIndex >= 0) {
        const color = state.palette[paletteIndex];
        if (!color) {
          continue;
        }
        srcR = color.r;
        srcG = color.g;
        srcB = color.b;
        srcA = color.a;
      } else if (direct) {
        const base = pixelIndex * 4;
        srcR = direct[base];
        srcG = direct[base + 1];
        srcB = direct[base + 2];
        srcA = direct[base + 3];
      } else {
        continue;
      }
      if (!Number.isFinite(srcA) || srcA <= 0) {
        continue;
      }
      compositeLayerPixelNormalized(
        composite,
        0,
        srcR,
        srcG,
        srcB,
        srcA,
        layerOpacity,
        normalizeLayerBlendMode(layer.blendMode)
      );
      hasVisibleColor = true;
    }

    if (!hasVisibleColor || composite[3] <= 0) {
      return null;
    }
    const color = normalizeColorValue({
      r: composite[0],
      g: composite[1],
      b: composite[2],
      a: composite[3],
    });
    const matchedPaletteIndex = findNearestPaletteIndexForColor(color, state.palette, -1);
    if (matchedPaletteIndex >= 0 && colorsMatchRgba(color, state.palette[matchedPaletteIndex])) {
      return { color, mode: 'index', index: matchedPaletteIndex };
    }
    return { color, mode: 'rgb', index: -1 };
  }

  function sampleCompositeColor(x, y) {
    return sampleCompositePixelColor(x, y) || { color: null, mode: 'rgb', index: -1 };
  }

  function sampleCompositeColorExcludingLayer(x, y, excludedLayerId) {
    const sample = sampleCompositePixelColor(x, y, { excludedLayerId });
    return sample ? normalizeColorValue(sample.color) : null;
  }

  function sampleLayerColor(layer, x, y) {
    const idx = y * state.width + x;
    const paletteIndex = readLayerRuntimeIndex(layer, idx);
    if (paletteIndex > 0) {
      return { type: 'index', index: paletteIndex };
    }
    const direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    const base = idx * 4;
    return {
      type: 'rgb',
      color: {
        r: direct ? direct[base] : 0,
        g: direct ? direct[base + 1] : 0,
        b: direct ? direct[base + 2] : 0,
        a: direct ? direct[base + 3] : 0,
      },
    };
  }

  function colorsEqual(target, replacement) {
    if (!target || !replacement) return false;
    if (target.type === 'index' && replacement.type === 'index') {
      return target.index === replacement.index;
    }
    if (target.type === 'rgb' && replacement.type === 'direct') {
      const c = replacement.color;
      return target.color.r === c.r && target.color.g === c.g && target.color.b === c.b && target.color.a === c.a;
    }
    return false;
  }

  function colorMatches(target, sample) {
    if (!sample || !target) return false;
    if (sample.type === 'index' && target.type === 'index') {
      return sample.index === target.index;
    }
    if (sample.type === 'rgb' && target.type === 'rgb') {
      return sample.color.r === target.color.r && sample.color.g === target.color.g && sample.color.b === target.color.b && sample.color.a === target.color.a;
    }
    return false;
  }

  return Object.freeze({
    setPixel,
    setPixelSingle,
    setLayerPixelDirectColorSingle,
    activateSimulationCell,
    activateSimulationAround,
    seedSimulationElementState,
    setSimulationPixelSingle,
    getBrushOffsets,
    forEachBrushOffset,
    stampBrush,
    drawLine,
    drawRectangle,
    drawEllipse,
    drawEllipsePixels,
    getFillGradientColors,
    normalizeFillGradientPoint,
    getFillGradientT,
    interpolateFillGradientColor,
    resolveFillGradientPixel,
    collectFillTargetPixels,
    collectSolidFillTargetRuns,
    applySolidIndexFillPixels,
    applySolidIndexFillRuns,
    prepareLargeIndexedFillTileHistory,
    withRasterBatch,
    applyGradientFillPixel,
    floodFill,
    sampleColor,
    sampleCompositePixelColor,
    sampleCompositeColor,
    sampleCompositeColorExcludingLayer,
    sampleLayerColor,
    colorsEqual,
    colorMatches,
  });
      }
    })(scope);
  }

  root.canvasDrawingWorkflowUtils = Object.freeze({
    createCanvasDrawingWorkflowUtils,
  });
})();
