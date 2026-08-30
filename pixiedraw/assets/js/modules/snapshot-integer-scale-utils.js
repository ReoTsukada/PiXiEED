(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  const DEFAULT_MINIMUM_PIXEL_COUNT = 1_000_000;
  const DEFAULT_YIELD_INTERVAL_MS = 12;

  function greatestCommonDivisor(left, right) {
    let a = Math.abs(Math.round(Number(left) || 0));
    let b = Math.abs(Math.round(Number(right) || 0));
    while (b > 0) {
      const remainder = a % b;
      a = b;
      b = remainder;
    }
    return a;
  }

  function packRgba(r, g, b, a) {
    const alpha = Number(a) & 255;
    // Invisible RGB values under fully transparent pixels are not editable
    // visual detail and must not prevent lossless integer-scale detection.
    if (alpha === 0) {
      return 0;
    }
    return (
      ((Number(r) & 255) * 0x1000000)
      + ((Number(g) & 255) << 16)
      + ((Number(b) & 255) << 8)
      + alpha
    ) >>> 0;
  }

  function buildPaletteVisualKeys(palette) {
    if (!Array.isArray(palette)) {
      return [];
    }
    return palette.map(color => packRgba(color?.r, color?.g, color?.b, color?.a));
  }

  function getSnapshotCanvases(snapshot) {
    if (Array.isArray(snapshot?.canvases) && snapshot.canvases.length) {
      return snapshot.canvases;
    }
    if (Array.isArray(snapshot?.frames) && snapshot.frames.length) {
      return [{
        id: typeof snapshot?.activeCanvasId === 'string' ? snapshot.activeCanvasId : '',
        width: snapshot.width,
        height: snapshot.height,
        frames: snapshot.frames,
        activeFrame: snapshot.activeFrame,
        activeLayer: snapshot.activeLayer,
        mirror: snapshot.mirror,
        selectionMask: snapshot.selectionMask,
        selectionContentMask: snapshot.selectionContentMask,
        selectionBounds: snapshot.selectionBounds,
        pendingPasteMoveState: snapshot.pendingPasteMoveState,
        sourceSnapshot: snapshot,
      }];
    }
    return [];
  }

  function typedArrayHasValue(array) {
    if (!ArrayBuffer.isView(array)) {
      return false;
    }
    for (let index = 0; index < array.length; index += 1) {
      if (array[index] !== 0) {
        return true;
      }
    }
    return false;
  }

  function canvasHasUnsafeGeometryState(canvas) {
    if (!canvas || typeof canvas !== 'object') {
      return true;
    }
    if (canvas.pendingPasteMoveState) {
      return true;
    }
    if (canvas.selectionBounds) {
      return true;
    }
    if (typedArrayHasValue(canvas.selectionMask) || typedArrayHasValue(canvas.selectionContentMask)) {
      return true;
    }
    const mirror = canvas.mirror;
    if (mirror?.enabled) {
      return true;
    }
    return Boolean(mirror?.axes && Object.values(mirror.axes).some(Boolean));
  }

  function getLayerDirectSource(layer, expectedLength) {
    if (layer?.direct instanceof Uint8ClampedArray && layer.direct.length === expectedLength) {
      return layer.direct;
    }
    if (layer?.importSourceDirect instanceof Uint8ClampedArray && layer.importSourceDirect.length === expectedLength) {
      return layer.importSourceDirect;
    }
    return null;
  }

  function getPixelKey(layer, direct, paletteVisualKeys, index) {
    const paletteIndex = layer.indices[index];
    if (paletteIndex >= 0) {
      // Integer-scale optimization is lossless in rendered pixels. Duplicate
      // palette slots and INDEX/direct storage seams are not visible detail,
      // so compare the actual RGBA color for every raster layer.
      return paletteVisualKeys[paletteIndex] ?? 0;
    }
    if (!direct) {
      return 0;
    }
    const base = index * 4;
    return packRgba(direct[base], direct[base + 1], direct[base + 2], direct[base + 3]);
  }

  function now() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  function yieldToMainThread() {
    return new Promise(resolve => {
      if (typeof window.setTimeout === 'function') {
        window.setTimeout(resolve, 0);
        return;
      }
      resolve();
    });
  }

  async function inspectSnapshotIntegerScale(snapshot, options = {}) {
    const requestedMinimumPixelCount = Number(options.minimumPixelCount);
    const minimumPixelCount = Math.max(0, Math.round(
      Number.isFinite(requestedMinimumPixelCount)
        ? requestedMinimumPixelCount
        : DEFAULT_MINIMUM_PIXEL_COUNT
    ));
    const yieldIntervalMs = Math.max(
      0,
      Number.isFinite(Number(options.yieldIntervalMs))
        ? Number(options.yieldIntervalMs)
        : DEFAULT_YIELD_INTERVAL_MS
    );
    const canvases = getSnapshotCanvases(snapshot);
    const paletteVisualKeys = buildPaletteVisualKeys(snapshot?.palette);
    if (!canvases.length) {
      return { optimizable: false, factor: 1, reason: 'no-canvas', totalPixelCount: 0 };
    }
    if (canvases.some(canvasHasUnsafeGeometryState)) {
      return { optimizable: false, factor: 1, reason: 'active-geometry-state', totalPixelCount: 0 };
    }

    let factor = 0;
    let totalPixelCount = 0;
    let layerCount = 0;
    const canvasEntries = [];
    for (let canvasIndex = 0; canvasIndex < canvases.length; canvasIndex += 1) {
      const canvas = canvases[canvasIndex];
      const width = Math.max(1, Math.round(Number(canvas?.width) || 0));
      const height = Math.max(1, Math.round(Number(canvas?.height) || 0));
      const frames = Array.isArray(canvas?.frames) ? canvas.frames : [];
      if (!frames.length || width <= 1 || height <= 1) {
        return { optimizable: false, factor: 1, reason: 'invalid-canvas', totalPixelCount };
      }
      factor = factor > 0
        ? greatestCommonDivisor(factor, greatestCommonDivisor(width, height))
        : greatestCommonDivisor(width, height);
      const layers = [];
      for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
        const frameLayers = Array.isArray(frames[frameIndex]?.layers) ? frames[frameIndex].layers : [];
        if (!frameLayers.length) {
          return { optimizable: false, factor: 1, reason: 'invalid-frame', totalPixelCount };
        }
        for (let layerIndex = 0; layerIndex < frameLayers.length; layerIndex += 1) {
          const layer = frameLayers[layerIndex];
          if (layer?.type === 'simulation') {
            return { optimizable: false, factor: 1, reason: 'simulation-layer', totalPixelCount };
          }
          if (!(layer?.indices instanceof Int16Array) || layer.indices.length !== width * height) {
            return { optimizable: false, factor: 1, reason: 'invalid-layer', totalPixelCount };
          }
          const expectedDirectLength = width * height * 4;
          const hasDirectValue = layer.direct != null || layer.importSourceDirect != null;
          const direct = getLayerDirectSource(layer, expectedDirectLength);
          if (hasDirectValue && !direct) {
            return { optimizable: false, factor: 1, reason: 'invalid-direct-layer', totalPixelCount };
          }
          layers.push({ layer, direct });
          layerCount += 1;
          totalPixelCount += width * height;
        }
      }
      canvasEntries.push({ canvas, width, height, layers });
    }
    if (factor <= 1) {
      return { optimizable: false, factor: 1, reason: 'dimension-factor-one', totalPixelCount };
    }
    if (totalPixelCount < minimumPixelCount) {
      return { optimizable: false, factor: 1, reason: 'below-size-threshold', totalPixelCount };
    }

    let transitionFound = false;
    let lastYieldAt = now();
    let visitedLayers = 0;
    for (let canvasIndex = 0; canvasIndex < canvasEntries.length; canvasIndex += 1) {
      const entry = canvasEntries[canvasIndex];
      for (let layerIndex = 0; layerIndex < entry.layers.length; layerIndex += 1) {
        const { layer, direct } = entry.layers[layerIndex];
        const previousRow = new Float64Array(entry.width);
        for (let y = 0; y < entry.height; y += 1) {
          let leftKey = 0;
          const rowOffset = y * entry.width;
          for (let x = 0; x < entry.width; x += 1) {
            const key = getPixelKey(
              layer,
              direct,
              paletteVisualKeys,
              rowOffset + x
            );
            if (x > 0 && key !== leftKey) {
              transitionFound = true;
              factor = greatestCommonDivisor(factor, x);
              if (factor <= 1) {
                return {
                  optimizable: false,
                  factor: 1,
                  reason: 'pixel-factor-one',
                  totalPixelCount,
                  failureCanvasIndex: canvasIndex,
                  failureLayerIndex: layerIndex,
                  failureX: x,
                  failureY: y,
                  failureAxis: 'x',
                };
              }
            }
            if (y > 0 && key !== previousRow[x]) {
              transitionFound = true;
              factor = greatestCommonDivisor(factor, y);
              if (factor <= 1) {
                return {
                  optimizable: false,
                  factor: 1,
                  reason: 'pixel-factor-one',
                  totalPixelCount,
                  failureCanvasIndex: canvasIndex,
                  failureLayerIndex: layerIndex,
                  failureX: x,
                  failureY: y,
                  failureAxis: 'y',
                };
              }
            }
            previousRow[x] = key;
            leftKey = key;
          }
          if (yieldIntervalMs >= 0 && now() - lastYieldAt >= yieldIntervalMs) {
            options.onProgress?.({
              phase: 'inspect',
              visitedLayers,
              layerCount,
              factor,
            });
            await yieldToMainThread();
            lastYieldAt = now();
          }
        }
        visitedLayers += 1;
      }
    }
    if (!transitionFound || factor <= 1) {
      return {
        optimizable: false,
        factor: 1,
        reason: transitionFound ? 'pixel-factor-one' : 'uniform-content',
        totalPixelCount,
      };
    }
    return {
      optimizable: true,
      factor,
      reason: 'exact-common-integer-scale',
      totalPixelCount,
      layerCount,
      canvasEntries,
    };
  }

  function createDisabledMirror(source, width, height) {
    const axes = {};
    Object.keys(source?.axes || {}).forEach(key => {
      axes[key] = false;
    });
    return {
      enabled: false,
      axisX: (width - 1) / 2,
      axisY: (height - 1) / 2,
      axes,
    };
  }

  function applySnapshotIntegerScale(snapshot, inspection) {
    if (!inspection?.optimizable || inspection.factor <= 1 || !Array.isArray(inspection.canvasEntries)) {
      return {
        optimized: false,
        factor: 1,
        reason: inspection?.reason || 'not-optimizable',
        totalPixelCount: Math.max(0, Math.round(Number(inspection?.totalPixelCount) || 0)),
        failureCanvasIndex: Number.isInteger(inspection?.failureCanvasIndex) ? inspection.failureCanvasIndex : -1,
        failureLayerIndex: Number.isInteger(inspection?.failureLayerIndex) ? inspection.failureLayerIndex : -1,
        failureX: Number.isInteger(inspection?.failureX) ? inspection.failureX : -1,
        failureY: Number.isInteger(inspection?.failureY) ? inspection.failureY : -1,
        failureAxis: inspection?.failureAxis || '',
      };
    }
    const factor = inspection.factor;
    let sourceByteEstimate = 0;
    let targetByteEstimate = 0;
    inspection.canvasEntries.forEach(entry => {
      const targetWidth = entry.width / factor;
      const targetHeight = entry.height / factor;
      entry.layers.forEach(({ layer, direct }) => {
        const nextIndices = new Int16Array(targetWidth * targetHeight);
        const nextDirect = direct ? new Uint8ClampedArray(targetWidth * targetHeight * 4) : null;
        for (let y = 0; y < targetHeight; y += 1) {
          const sourceRow = (y * factor) * entry.width;
          const targetRow = y * targetWidth;
          for (let x = 0; x < targetWidth; x += 1) {
            const sourceIndex = sourceRow + (x * factor);
            const targetIndex = targetRow + x;
            nextIndices[targetIndex] = layer.indices[sourceIndex];
            if (nextDirect) {
              const sourceBase = sourceIndex * 4;
              const targetBase = targetIndex * 4;
              nextDirect[targetBase] = direct[sourceBase];
              nextDirect[targetBase + 1] = direct[sourceBase + 1];
              nextDirect[targetBase + 2] = direct[sourceBase + 2];
              nextDirect[targetBase + 3] = direct[sourceBase + 3];
            }
          }
        }
        sourceByteEstimate += layer.indices.byteLength + (direct?.byteLength || 0);
        targetByteEstimate += nextIndices.byteLength + (nextDirect?.byteLength || 0);
        layer.indices = nextIndices;
        layer.direct = nextDirect;
        layer.importSourceDirect = null;
      });
      entry.canvas.width = targetWidth;
      entry.canvas.height = targetHeight;
      entry.canvas.selectionMask = null;
      entry.canvas.selectionContentMask = null;
      entry.canvas.selectionBounds = null;
      entry.canvas.pendingPasteMoveState = null;
      entry.canvas.mirror = createDisabledMirror(entry.canvas.mirror, targetWidth, targetHeight);
      if (entry.canvas.sourceSnapshot) {
        entry.canvas.sourceSnapshot.width = targetWidth;
        entry.canvas.sourceSnapshot.height = targetHeight;
        entry.canvas.sourceSnapshot.frames = entry.canvas.frames;
        entry.canvas.sourceSnapshot.selectionMask = null;
        entry.canvas.sourceSnapshot.selectionContentMask = null;
        entry.canvas.sourceSnapshot.selectionBounds = null;
        entry.canvas.sourceSnapshot.pendingPasteMoveState = null;
        entry.canvas.sourceSnapshot.mirror = entry.canvas.mirror;
      }
    });

    const canvases = getSnapshotCanvases(snapshot);
    const activeCanvas = canvases.find(canvas => canvas?.id === snapshot.activeCanvasId) || canvases[0] || null;
    if (activeCanvas) {
      snapshot.width = activeCanvas.width;
      snapshot.height = activeCanvas.height;
      snapshot.frames = activeCanvas.frames;
      snapshot.activeFrame = activeCanvas.activeFrame ?? snapshot.activeFrame;
      snapshot.activeLayer = activeCanvas.activeLayer ?? snapshot.activeLayer;
      snapshot.selectionMask = null;
      snapshot.selectionContentMask = null;
      snapshot.selectionBounds = null;
      snapshot.pendingPasteMoveState = null;
      snapshot.mirror = createDisabledMirror(activeCanvas.mirror, activeCanvas.width, activeCanvas.height);
    }
    return {
      optimized: true,
      factor,
      reason: inspection.reason,
      sourceWidth: inspection.canvasEntries[0]?.width || 0,
      sourceHeight: inspection.canvasEntries[0]?.height || 0,
      width: inspection.canvasEntries[0]?.width / factor || 0,
      height: inspection.canvasEntries[0]?.height / factor || 0,
      sourceByteEstimate,
      targetByteEstimate,
      totalPixelCount: inspection.totalPixelCount,
    };
  }

  async function optimizeSnapshotIntegerScale(snapshot, options = {}) {
    const inspection = await inspectSnapshotIntegerScale(snapshot, options);
    return applySnapshotIntegerScale(snapshot, inspection);
  }

  root.snapshotIntegerScaleUtils = Object.freeze({
    greatestCommonDivisor,
    packRgba,
    inspectSnapshotIntegerScale,
    applySnapshotIntegerScale,
    optimizeSnapshotIntegerScale,
  });
})();
