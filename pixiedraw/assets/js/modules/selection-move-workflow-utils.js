(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSelectionMoveWorkflowUtils(rawScope = {}) {
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
  function isRasterIndexArray(value) {
    return value instanceof Int16Array || value instanceof Uint8Array;
  }

  function createSelectionIndexArray(layer, size) {
    const useUint8 = typeof isRuntimeUint8LayerIndices === 'function' && isRuntimeUint8LayerIndices(layer);
    return useUint8 ? new Uint8Array(size) : new Int16Array(size).fill(-1);
  }

  function getSelectionTransparentValue(layer) {
    return typeof isRuntimeUint8LayerIndices === 'function' && isRuntimeUint8LayerIndices(layer) ? 0 : -1;
  }

  function buildSelectionMoveContentMask(mask, moveStateLike) {
    if (!(mask instanceof Uint8Array)) {
      return null;
    }
    const contentMask = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i += 1) {
      if (mask[i] !== 1) {
        continue;
      }
      if (getMoveStateSourcePixelAlpha(moveStateLike, i) > 0) {
        contentMask[i] = 1;
      }
    }
    return contentMask;
  }

  function getSelectionMoveContentMask(moveState) {
    if (!moveState) {
      return null;
    }
    const size = Math.max(0, Math.floor(Number(moveState.width) || 0)) * Math.max(0, Math.floor(Number(moveState.height) || 0));
    if (moveState.contentMask instanceof Uint8Array && moveState.contentMask.length === size) {
      return moveState.contentMask;
    }
    if (!(moveState.mask instanceof Uint8Array) || moveState.mask.length !== size) {
      return null;
    }
    moveState.contentMask = buildSelectionMoveContentMask(moveState.mask, moveState);
    return moveState.contentMask;
  }

  function shouldCreateSelectionMoveBitmapPreview(width, height) {
    const pixelCount = Math.max(0, Math.floor(Number(width) || 0)) * Math.max(0, Math.floor(Number(height) || 0));
    return pixelCount > 0 && pixelCount <= SELECTION_TRANSFORM_LARGE_PREVIEW_MAX_PIXELS;
  }

  function createSelectionMoveState(layer, bounds, mask, sourceContentMask = null) {
    if (!layer || !bounds || !mask) {
      return null;
    }
    const width = Math.max(0, (bounds.x1 ?? 0) - (bounds.x0 ?? 0) + 1);
    const height = Math.max(0, (bounds.y1 ?? 0) - (bounds.y0 ?? 0) + 1);
    if (width <= 0 || height <= 0) {
      return null;
    }

    const size = width * height;
    const localMask = new Uint8Array(size);
    const localContentMask = new Uint8Array(size);
    const localIndices = createSelectionIndexArray(layer, size);
    const transparentValue = getSelectionTransparentValue(layer);
    const localDirect = new Uint8ClampedArray(size * 4);
    const selectedSourceIndices = [];
    const contentSourceIndices = [];
    const shouldCreatePreviewBitmap = shouldCreateSelectionMoveBitmapPreview(width, height);
    const imageData = shouldCreatePreviewBitmap ? createBlankImageData(width, height) : null;

    const layerDirect = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    const hasSourceContentMask = sourceContentMask instanceof Uint8Array && sourceContentMask.length === mask.length;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const canvasX = bounds.x0 + x;
        const canvasY = bounds.y0 + y;
        if (canvasX < 0 || canvasY < 0 || canvasX >= state.width || canvasY >= state.height) {
          continue;
        }
        const canvasIndex = canvasY * state.width + canvasX;
        const localIndex = y * width + x;
        const selected = mask[canvasIndex] === 1 ? 1 : 0;
        localMask[localIndex] = selected;
        const canvasBase = canvasIndex * 4;
        const localBase = localIndex * 4;
        if (selected) {
          const paletteIndex = typeof getStoredRasterLayerPaletteIndex === 'function'
            ? getStoredRasterLayerPaletteIndex(layer, canvasIndex)
            : layer.indices[canvasIndex];
          const fallbackColor = {
            r: layerDirect ? layerDirect[canvasBase] : 0,
            g: layerDirect ? layerDirect[canvasBase + 1] : 0,
            b: layerDirect ? layerDirect[canvasBase + 2] : 0,
            a: layerDirect ? layerDirect[canvasBase + 3] : 0,
          };
          const sourceColor = paletteIndex >= 0 && state.palette[paletteIndex]
            ? state.palette[paletteIndex]
            : fallbackColor;
          const hasContent = hasSourceContentMask
            ? sourceContentMask[canvasIndex] === 1
            : (Number(sourceColor?.a) || 0) > 0;
          // Direct-color pixels do not have a palette index. Preserve the
          // layer's native transparent sentinel here: Int16 uses -1 while the
          // new Uint8 runtime uses 0. Coercing Int16 direct pixels to 0 makes
          // the renderer prefer palette[0] and drops their actual RGBA color.
          localIndices[localIndex] = hasContent && paletteIndex >= 0
            ? paletteIndex
            : transparentValue;
          if (layerDirect) {
            localDirect[localBase] = hasContent ? layerDirect[canvasBase] : 0;
            localDirect[localBase + 1] = hasContent ? layerDirect[canvasBase + 1] : 0;
            localDirect[localBase + 2] = hasContent ? layerDirect[canvasBase + 2] : 0;
            localDirect[localBase + 3] = hasContent ? layerDirect[canvasBase + 3] : 0;
          } else {
            localDirect[localBase] = 0;
            localDirect[localBase + 1] = 0;
            localDirect[localBase + 2] = 0;
            localDirect[localBase + 3] = 0;
          }
          if (imageData) {
            if (hasContent) {
              imageData.data[localBase] = sourceColor.r;
              imageData.data[localBase + 1] = sourceColor.g;
              imageData.data[localBase + 2] = sourceColor.b;
              imageData.data[localBase + 3] = sourceColor.a;
            } else {
              imageData.data[localBase] = 0;
              imageData.data[localBase + 1] = 0;
              imageData.data[localBase + 2] = 0;
              imageData.data[localBase + 3] = 0;
            }
          }
          if (hasContent) {
            localContentMask[localIndex] = 1;
            contentSourceIndices.push(localIndex);
          }
          selectedSourceIndices.push(localIndex);
        } else {
          localIndices[localIndex] = transparentValue;
          if (imageData) {
            imageData.data[localBase] = 0;
            imageData.data[localBase + 1] = 0;
            imageData.data[localBase + 2] = 0;
            imageData.data[localBase + 3] = 0;
          }
        }
      }
    }

    const previewCanvas = shouldCreatePreviewBitmap
      ? (createMovePreviewCanvasFromImageData(imageData)
        || createMovePreviewCanvasFromPixels(width, height, localMask, localIndices, localDirect))
      : null;
    return {
      layer,
      bounds: { ...bounds },
      width,
      height,
      mask: localMask,
      contentMask: localContentMask,
      indices: localIndices,
      direct: localDirect,
      imageData,
      previewCanvas,
      selectedSourceIndices,
      contentSourceIndices,
      offset: { x: 0, y: 0 },
      hasCleared: false,
      committed: false,
      applySelectionOnFinalize: true,
      transformRotationDeg: 0,
      transformFlipHorizontal: false,
      transformFlipVertical: false,
      transformScaleX: 1,
      transformScaleY: 1,
      transformedEntryCache: null,
      transformedContentEntryCache: null,
      transformedPreviewRenderCache: null,
    };
  }

  function createCompositeSelectionMoveState(bounds, mask, imageData) {
    if (!bounds || !(mask instanceof Uint8Array) || !(imageData?.data instanceof Uint8ClampedArray)) {
      return null;
    }
    const width = Math.max(0, (bounds.x1 ?? 0) - (bounds.x0 ?? 0) + 1);
    const height = Math.max(0, (bounds.y1 ?? 0) - (bounds.y0 ?? 0) + 1);
    if (width <= 0 || height <= 0) {
      return null;
    }
    const size = width * height;
    const localMask = new Uint8Array(size);
    const localContentMask = new Uint8Array(size);
    const localIndices = new Uint8Array(size);
    const localDirect = new Uint8ClampedArray(size * 4);
    const selectedSourceIndices = [];
    const contentSourceIndices = [];
    const shouldCreatePreviewBitmap = shouldCreateSelectionMoveBitmapPreview(width, height);
    const localImageData = shouldCreatePreviewBitmap ? createBlankImageData(width, height) : null;
    const sourceData = imageData.data;
    const imageWidth = Math.max(1, Math.round(Number(imageData.width) || state.width || 1));
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const canvasX = bounds.x0 + x;
        const canvasY = bounds.y0 + y;
        if (canvasX < 0 || canvasY < 0 || canvasX >= state.width || canvasY >= state.height) {
          continue;
        }
        const canvasIndex = canvasY * state.width + canvasX;
        const localIndex = y * width + x;
        if (mask[canvasIndex] !== 1) {
          continue;
        }
        const sourceBase = ((canvasY * imageWidth) + canvasX) * 4;
        const localBase = localIndex * 4;
        localMask[localIndex] = 1;
        selectedSourceIndices.push(localIndex);
        localDirect[localBase] = sourceData[sourceBase];
        localDirect[localBase + 1] = sourceData[sourceBase + 1];
        localDirect[localBase + 2] = sourceData[sourceBase + 2];
        localDirect[localBase + 3] = sourceData[sourceBase + 3];
        if (localImageData?.data instanceof Uint8ClampedArray) {
          localImageData.data[localBase] = sourceData[sourceBase];
          localImageData.data[localBase + 1] = sourceData[sourceBase + 1];
          localImageData.data[localBase + 2] = sourceData[sourceBase + 2];
          localImageData.data[localBase + 3] = sourceData[sourceBase + 3];
        }
        if (sourceData[sourceBase + 3] > 0) {
          localContentMask[localIndex] = 1;
          contentSourceIndices.push(localIndex);
        }
      }
    }
    if (!selectionMaskHasPixels(localMask)) {
      return null;
    }
    const previewCanvas = shouldCreatePreviewBitmap
      ? (createMovePreviewCanvasFromImageData(localImageData)
        || createMovePreviewCanvasFromPixels(width, height, localMask, localIndices, localDirect))
      : null;
    return {
      layer: getActiveLayer(),
      layerId: getActiveLayer()?.id || null,
      bounds: { ...bounds },
      width,
      height,
      mask: localMask,
      contentMask: localContentMask,
      indices: localIndices,
      direct: localDirect,
      imageData: localImageData,
      previewCanvas,
      selectedSourceIndices,
      contentSourceIndices,
      offset: { x: 0, y: 0 },
      hasCleared: false,
      committed: false,
      applySelectionOnFinalize: true,
      transformRotationDeg: 0,
      transformFlipHorizontal: false,
      transformFlipVertical: false,
      transformScaleX: 1,
      transformScaleY: 1,
      transformedEntryCache: null,
      transformedContentEntryCache: null,
      transformedPreviewRenderCache: null,
    };
  }

  function createFullCanvasMask(width, height) {
    const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
    const safeHeight = Math.max(1, Math.floor(Number(height) || 1));
    const mask = new Uint8Array(safeWidth * safeHeight);
    mask.fill(1);
    return mask;
  }

  function createBoundsMask(bounds, width, height) {
    const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
    const safeHeight = Math.max(1, Math.floor(Number(height) || 1));
    const mask = new Uint8Array(safeWidth * safeHeight);
    const x0 = clamp(Math.round(Number(bounds?.x0) || 0), 0, safeWidth - 1);
    const y0 = clamp(Math.round(Number(bounds?.y0) || 0), 0, safeHeight - 1);
    const x1 = clamp(Math.round(Number(bounds?.x1) || 0), 0, safeWidth - 1);
    const y1 = clamp(Math.round(Number(bounds?.y1) || 0), 0, safeHeight - 1);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        mask[(y * safeWidth) + x] = 1;
      }
    }
    return mask;
  }

  function snapshotRenderedCanvasImageData(surface = activeCanvasSurface) {
    const drawingCanvas = surface?.drawing instanceof HTMLCanvasElement ? surface.drawing : null;
    const drawingCtx = surface?.drawingCtx || drawingCanvas?.getContext?.('2d', { willReadFrequently: true }) || drawingCanvas?.getContext?.('2d');
    if (!drawingCanvas || !drawingCtx) {
      return null;
    }
    const width = Math.max(1, Math.round(Number(drawingCanvas.width) || 1));
    const height = Math.max(1, Math.round(Number(drawingCanvas.height) || 1));
    try {
      return drawingCtx.getImageData(0, 0, width, height);
    } catch (error) {
      return null;
    }
  }

  function snapshotVisibleVoxelPreviewForClipboard() {
    const compositeImage = snapshotRenderedCanvasImageData(activeCanvasSurface)
      || buildVoxelPreviewCanvasCompositeImageDataForFrameIndex(state.activeFrame);
    if (!compositeImage) {
      return null;
    }
    const width = Math.max(1, Math.round(Number(compositeImage.width) || 1));
    const height = Math.max(1, Math.round(Number(compositeImage.height) || 1));
    return createCompositeSelectionMoveState(
      { x0: 0, y0: 0, x1: width - 1, y1: height - 1 },
      createFullCanvasMask(width, height),
      compositeImage
    );
  }

  function normalizeSelectionMoveRotationDeg(value) {
    const step = SELECTION_TRANSFORM_ROTATION_STEP_DEG;
    if (!Number.isFinite(value)) {
      return 0;
    }
    const snapped = Math.round(Number(value) / step) * step;
    let normalized = snapped % 360;
    if (normalized < 0) {
      normalized += 360;
    }
    return normalized;
  }

  function getSelectionMoveTransformState(moveState) {
    if (!moveState || typeof moveState !== 'object') {
      return {
        rotationDeg: 0,
        flipHorizontal: false,
        flipVertical: false,
      };
    }
    return {
      rotationDeg: normalizeSelectionMoveRotationDeg(moveState.transformRotationDeg),
      flipHorizontal: Boolean(moveState.transformFlipHorizontal),
      flipVertical: Boolean(moveState.transformFlipVertical),
      scaleX: normalizeSelectionMoveScale(moveState.transformScaleX),
      scaleY: normalizeSelectionMoveScale(moveState.transformScaleY),
    };
  }

  function hasSelectionMoveTransform(moveState) {
    const transform = getSelectionMoveTransformState(moveState);
    return transform.rotationDeg !== 0
      || transform.flipHorizontal
      || transform.flipVertical
      || Math.abs(transform.scaleX - 1) > SELECTION_TRANSFORM_SCALE_EPSILON
      || Math.abs(transform.scaleY - 1) > SELECTION_TRANSFORM_SCALE_EPSILON;
  }

  function normalizeSelectionMoveScale(value, fallback = 1) {
    const numeric = Number(value);
    const safeFallback = Number.isFinite(Number(fallback)) && Number(fallback) > 0
      ? Number(fallback)
      : 1;
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return clamp(safeFallback, SELECTION_TRANSFORM_SCALE_MIN, SELECTION_TRANSFORM_SCALE_MAX);
    }
    return clamp(numeric, SELECTION_TRANSFORM_SCALE_MIN, SELECTION_TRANSFORM_SCALE_MAX);
  }

  function transformSelectionMoveLocalPixel(x, y, width, height, transform) {
    const mappedCenter = transformSelectionMoveLocalPoint(x + 0.5, y + 0.5, width, height, transform);
    const mappedX = Math.round(mappedCenter.x - 0.5);
    const mappedY = Math.round(mappedCenter.y - 0.5);
    return { x: mappedX, y: mappedY };
  }

  function transformSelectionMoveLocalPoint(x, y, width, height, transform) {
    const cx = width / 2;
    const cy = height / 2;
    let dx = x - cx;
    let dy = y - cy;
    if (transform.flipHorizontal) {
      dx = -dx;
    }
    if (transform.flipVertical) {
      dy = -dy;
    }
    const scaleX = normalizeSelectionMoveScale(transform.scaleX);
    const scaleY = normalizeSelectionMoveScale(transform.scaleY);
    dx *= scaleX;
    dy *= scaleY;
    const rotationDeg = normalizeSelectionMoveRotationDeg(transform.rotationDeg);
    if (rotationDeg !== 0) {
      const rad = (rotationDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const nextDx = (dx * cos) - (dy * sin);
      const nextDy = (dx * sin) + (dy * cos);
      dx = nextDx;
      dy = nextDy;
    }
    const mappedX = dx + cx;
    const mappedY = dy + cy;
    return { x: mappedX, y: mappedY };
  }

  function inverseTransformSelectionMoveLocalPoint(x, y, width, height, transform) {
    const cx = width / 2;
    const cy = height / 2;
    let dx = x - cx;
    let dy = y - cy;
    const rotationDeg = normalizeSelectionMoveRotationDeg(transform.rotationDeg);
    if (rotationDeg !== 0) {
      const rad = (-rotationDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const nextDx = (dx * cos) - (dy * sin);
      const nextDy = (dx * sin) + (dy * cos);
      dx = nextDx;
      dy = nextDy;
    }
    dx /= normalizeSelectionMoveScale(transform.scaleX);
    dy /= normalizeSelectionMoveScale(transform.scaleY);
    if (transform.flipHorizontal) {
      dx = -dx;
    }
    if (transform.flipVertical) {
      dy = -dy;
    }
    return { x: dx + cx, y: dy + cy };
  }

  function shouldResampleSelectionMoveTransform(transform) {
    const rotation = normalizeSelectionMoveRotationDeg(transform.rotationDeg);
    return Math.abs(normalizeSelectionMoveScale(transform.scaleX) - 1) > SELECTION_TRANSFORM_SCALE_EPSILON
      || Math.abs(normalizeSelectionMoveScale(transform.scaleY) - 1) > SELECTION_TRANSFORM_SCALE_EPSILON
      || (rotation % 90) !== 0;
  }

  function getMoveStateSourceRgba(moveState, sourceIndex) {
    if (!moveState || !Number.isInteger(sourceIndex) || sourceIndex < 0) {
      return [0, 0, 0, 0];
    }
    const imageData = moveState.imageData?.data instanceof Uint8ClampedArray ? moveState.imageData.data : null;
    const sourceBase = sourceIndex * 4;
    if (imageData && sourceBase + 3 < imageData.length && imageData[sourceBase + 3] > 0) {
      return [
        imageData[sourceBase],
        imageData[sourceBase + 1],
        imageData[sourceBase + 2],
        imageData[sourceBase + 3],
      ];
    }
    const direct = moveState.direct instanceof Uint8ClampedArray ? moveState.direct : null;
    if (direct && sourceBase + 3 < direct.length && direct[sourceBase + 3] > 0) {
      return [
        direct[sourceBase],
        direct[sourceBase + 1],
        direct[sourceBase + 2],
        direct[sourceBase + 3],
      ];
    }
    const indices = isRasterIndexArray(moveState.indices) ? moveState.indices : null;
    const paletteIndex = indices && sourceIndex < indices.length ? indices[sourceIndex] : -1;
    const color = paletteIndex >= 0 ? state.palette[paletteIndex] : null;
    return color ? [color.r, color.g, color.b, color.a] : [0, 0, 0, 0];
  }

  function sampleMoveStateNearestRgba(moveState, sourceX, sourceY, sourceMask) {
    const width = Math.max(0, Math.floor(Number(moveState?.width) || 0));
    const height = Math.max(0, Math.floor(Number(moveState?.height) || 0));
    if (width <= 0 || height <= 0 || sourceX < 0 || sourceY < 0 || sourceX >= width || sourceY >= height) {
      return [0, 0, 0, 0];
    }
    const x = clamp(Math.floor(sourceX), 0, width - 1);
    const y = clamp(Math.floor(sourceY), 0, height - 1);
    const index = (y * width) + x;
    if (sourceMask instanceof Uint8Array && sourceMask[index] !== 1) {
      return [0, 0, 0, 0];
    }
    return getMoveStateSourceRgba(moveState, index);
  }

  function buildSelectionMoveResampledEntries(moveState, sourceMask, transform, key) {
    const sourceWidth = Math.max(0, Math.floor(Number(moveState?.width) || 0));
    const sourceHeight = Math.max(0, Math.floor(Number(moveState?.height) || 0));
    if (!(sourceMask instanceof Uint8Array) || sourceWidth <= 0 || sourceHeight <= 0 || sourceMask.length !== sourceWidth * sourceHeight) {
      return {
        key,
        entries: [],
        bounds: null,
        mask: null,
        width: 0,
        height: 0,
      };
    }
    const localCorners = [
      transformSelectionMoveLocalPoint(0, 0, sourceWidth, sourceHeight, transform),
      transformSelectionMoveLocalPoint(sourceWidth, 0, sourceWidth, sourceHeight, transform),
      transformSelectionMoveLocalPoint(sourceWidth, sourceHeight, sourceWidth, sourceHeight, transform),
      transformSelectionMoveLocalPoint(0, sourceHeight, sourceWidth, sourceHeight, transform),
    ];
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    localCorners.forEach(point => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return;
      }
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    });
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return {
        key,
        entries: [],
        bounds: null,
        mask: null,
        width: 0,
        height: 0,
      };
    }
    const bounds = {
      x0: Math.floor(minX),
      y0: Math.floor(minY),
      x1: Math.ceil(maxX) - 1,
      y1: Math.ceil(maxY) - 1,
    };
    const outputWidth = Math.max(0, (bounds.x1 - bounds.x0) + 1);
    const outputHeight = Math.max(0, (bounds.y1 - bounds.y0) + 1);
    if (outputWidth <= 0 || outputHeight <= 0) {
      return {
        key,
        entries: [],
        bounds: null,
        mask: null,
        width: 0,
        height: 0,
      };
    }
    const entries = [];
    const transformedMask = new Uint8Array(outputWidth * outputHeight);
    for (let y = bounds.y0; y <= bounds.y1; y += 1) {
      for (let x = bounds.x0; x <= bounds.x1; x += 1) {
        const sourcePoint = inverseTransformSelectionMoveLocalPoint(x + 0.5, y + 0.5, sourceWidth, sourceHeight, transform);
        if (sourcePoint.x < 0 || sourcePoint.y < 0 || sourcePoint.x >= sourceWidth || sourcePoint.y >= sourceHeight) {
          continue;
        }
        const nearestX = clamp(Math.floor(sourcePoint.x), 0, sourceWidth - 1);
        const nearestY = clamp(Math.floor(sourcePoint.y), 0, sourceHeight - 1);
        const sourceIndex = (nearestY * sourceWidth) + nearestX;
        if (sourceMask[sourceIndex] !== 1) {
          continue;
        }
        const localX = x - bounds.x0;
        const localY = y - bounds.y0;
        const localIndex = (localY * outputWidth) + localX;
        const rgba = sampleMoveStateNearestRgba(moveState, sourcePoint.x, sourcePoint.y, sourceMask);
        transformedMask[localIndex] = 1;
        entries.push({
          x,
          y,
          sourceIndex,
          rgba: rgba[3] > 0 ? rgba : null,
        });
      }
    }
    if (!entries.length) {
      return {
        key,
        entries: [],
        bounds: null,
        mask: null,
        width: 0,
        height: 0,
      };
    }
    return {
      key,
      entries,
      bounds,
      mask: transformedMask,
      width: outputWidth,
      height: outputHeight,
    };
  }

  function getSelectionMoveSourceIndices(moveState, sourceMask) {
    if (!moveState || !(sourceMask instanceof Uint8Array)) {
      return null;
    }
    if (sourceMask === moveState.mask && Array.isArray(moveState.selectedSourceIndices)) {
      return moveState.selectedSourceIndices;
    }
    if (sourceMask === moveState.contentMask && Array.isArray(moveState.contentSourceIndices)) {
      return moveState.contentSourceIndices;
    }
    return null;
  }

  function buildSelectionMoveTransformedEntries(moveState, options = {}) {
    const sourceMask = options?.sourceMask instanceof Uint8Array
      ? options.sourceMask
      : moveState?.mask;
    const cacheProperty = typeof options?.cacheProperty === 'string' && options.cacheProperty
      ? options.cacheProperty
      : 'transformedEntryCache';
    const cacheScope = typeof options?.cacheScope === 'string' && options.cacheScope
      ? options.cacheScope
      : 'selection';
    if (!moveState || !(sourceMask instanceof Uint8Array)) {
      return {
        entries: [],
        bounds: null,
        mask: null,
        width: 0,
        height: 0,
      };
    }
    const sourceWidth = Math.max(0, Math.floor(Number(moveState.width) || 0));
    const sourceHeight = Math.max(0, Math.floor(Number(moveState.height) || 0));
    const sourceSize = sourceWidth * sourceHeight;
    if (sourceWidth <= 0 || sourceHeight <= 0 || sourceMask.length !== sourceSize) {
      return {
        entries: [],
        bounds: null,
        mask: null,
        width: 0,
        height: 0,
      };
    }
    const transform = getSelectionMoveTransformState(moveState);
    const key = `${cacheScope}:${transform.rotationDeg}:${transform.flipHorizontal ? 1 : 0}:${transform.flipVertical ? 1 : 0}:${Math.round(transform.scaleX * 1000)}:${Math.round(transform.scaleY * 1000)}`;
    if (
      moveState[cacheProperty]
      && moveState[cacheProperty].key === key
      && Array.isArray(moveState[cacheProperty].entries)
    ) {
      return moveState[cacheProperty];
    }

    if (shouldResampleSelectionMoveTransform(transform)) {
      const result = buildSelectionMoveResampledEntries(moveState, sourceMask, transform, key);
      moveState[cacheProperty] = result;
      return result;
    }

    const entries = [];
    const localIndexByKey = new Map();
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    const sourceIndices = getSelectionMoveSourceIndices(moveState, sourceMask);
    const visitSourceIndex = (sourceIndex) => {
      if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= sourceSize || sourceMask[sourceIndex] !== 1) {
        return;
      }
      const x = sourceIndex % sourceWidth;
      const y = Math.floor(sourceIndex / sourceWidth);
      const mapped = transformSelectionMoveLocalPixel(x, y, sourceWidth, sourceHeight, transform);
      const mapKey = `${mapped.x},${mapped.y}`;
      const existing = localIndexByKey.get(mapKey);
      if (Number.isInteger(existing) && existing >= 0) {
        entries[existing].sourceIndex = sourceIndex;
      } else {
        localIndexByKey.set(mapKey, entries.length);
        entries.push({
          x: mapped.x,
          y: mapped.y,
          sourceIndex,
        });
      }
      if (mapped.x < minX) minX = mapped.x;
      if (mapped.y < minY) minY = mapped.y;
      if (mapped.x > maxX) maxX = mapped.x;
      if (mapped.y > maxY) maxY = mapped.y;
    };

    if (Array.isArray(sourceIndices)) {
      for (let i = 0; i < sourceIndices.length; i += 1) {
        visitSourceIndex(sourceIndices[i]);
      }
    } else {
      for (let sourceIndex = 0; sourceIndex < sourceSize; sourceIndex += 1) {
        visitSourceIndex(sourceIndex);
      }
    }

    let bounds = null;
    let transformedMask = null;
    let transformedWidth = 0;
    let transformedHeight = 0;
    if (entries.length > 0 && Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
      bounds = { x0: minX, y0: minY, x1: maxX, y1: maxY };
      transformedWidth = (maxX - minX) + 1;
      transformedHeight = (maxY - minY) + 1;
      transformedMask = new Uint8Array(transformedWidth * transformedHeight);
      for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        const localX = entry.x - minX;
        const localY = entry.y - minY;
        const localIndex = (localY * transformedWidth) + localX;
        transformedMask[localIndex] = 1;
      }
    }

    const result = {
      key,
      entries,
      bounds,
      mask: transformedMask,
      width: transformedWidth,
      height: transformedHeight,
    };
    moveState[cacheProperty] = result;
    return result;
  }

  function getSelectionMoveVisualBounds(moveState) {
    if (!moveState || !moveState.bounds) {
      return null;
    }
    const transformed = buildSelectionMoveTransformedEntries(moveState);
    if (!transformed.bounds) {
      return null;
    }
    const offsetX = Number(moveState.offset?.x) || 0;
    const offsetY = Number(moveState.offset?.y) || 0;
    const originX = (Number(moveState.bounds.x0) || 0) + offsetX;
    const originY = (Number(moveState.bounds.y0) || 0) + offsetY;
    return {
      x0: originX + transformed.bounds.x0,
      y0: originY + transformed.bounds.y0,
      x1: originX + transformed.bounds.x1,
      y1: originY + transformed.bounds.y1,
    };
  }

  function selectionMaskHasPixels(mask) {
    if (!mask) {
      return false;
    }
    for (let i = 0; i < mask.length; i += 1) {
      if (mask[i] === 1) {
        return true;
      }
    }
    return false;
  }

  function buildCustomBrushFromSelection() {
    const mask = state.selectionMask;
    if (!selectionMaskHasPixels(mask)) {
      return null;
    }
    const width = state.width;
    const height = state.height;
    if (width <= 0 || height <= 0) {
      return null;
    }
    let bounds = state.selectionBounds
      ? {
        x0: clamp(Math.round(Number(state.selectionBounds.x0) || 0), 0, width - 1),
        y0: clamp(Math.round(Number(state.selectionBounds.y0) || 0), 0, height - 1),
        x1: clamp(Math.round(Number(state.selectionBounds.x1) || 0), 0, width - 1),
        y1: clamp(Math.round(Number(state.selectionBounds.y1) || 0), 0, height - 1),
      }
      : null;

    if (!bounds || bounds.x0 > bounds.x1 || bounds.y0 > bounds.y1) {
      bounds = { x0: width, y0: height, x1: -1, y1: -1 };
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const idx = y * width + x;
          if (mask[idx] !== 1) continue;
          if (x < bounds.x0) bounds.x0 = x;
          if (y < bounds.y0) bounds.y0 = y;
          if (x > bounds.x1) bounds.x1 = x;
          if (y > bounds.y1) bounds.y1 = y;
        }
      }
      if (bounds.x0 > bounds.x1 || bounds.y0 > bounds.y1) {
        return null;
      }
    }

    let count = 0;
    for (let y = bounds.y0; y <= bounds.y1; y += 1) {
      for (let x = bounds.x0; x <= bounds.x1; x += 1) {
        const idx = y * width + x;
        if (mask[idx] !== 1) continue;
        count += 1;
        if (count > CUSTOM_BRUSH_MAX_PIXELS) {
          return { error: 'too_many', count };
        }
      }
    }
    if (count <= 0) {
      return null;
    }

    const anchorX = Math.floor((bounds.x0 + bounds.x1) / 2);
    const anchorY = Math.floor((bounds.y0 + bounds.y1) / 2);
    const offsets = [];
    for (let y = bounds.y0; y <= bounds.y1; y += 1) {
      for (let x = bounds.x0; x <= bounds.x1; x += 1) {
        const idx = y * width + x;
        if (mask[idx] !== 1) continue;
        offsets.push({ dx: x - anchorX, dy: y - anchorY });
      }
    }

    return normalizeCustomBrushData({
      offsets,
      width: bounds.x1 - bounds.x0 + 1,
      height: bounds.y1 - bounds.y0 + 1,
    });
  }

  function createCustomBrushFromSelection() {
    const built = buildCustomBrushFromSelection();
    if (!built) {
      updateAutosaveStatus('カスタムブラシ化するには範囲選択が必要です', 'warn');
      return false;
    }
    if (built.error === 'too_many') {
      updateAutosaveStatus(`選択ピクセルが多すぎます (上限 ${CUSTOM_BRUSH_MAX_PIXELS}px)`, 'warn');
      return false;
    }
    state.customBrush = built;
    state.brushShape = BRUSH_SHAPE_CUSTOM;
    syncBrushControls();
    requestOverlayRender();
    scheduleSessionPersist();
    updateAutosaveStatus(`カスタムブラシを作成しました (${built.pixelCount}px)`, 'success');
    return true;
  }

  function applySelectionOutline(options = {}) {
    const outlineMode = options?.mode === '4' ? '4' : '8';
    const modeLabel = outlineMode === '4' ? '4方向' : '8方向';
    const mask = state.selectionMask;
    if (!selectionMaskHasPixels(mask)) {
      updateAutosaveStatus('アウトライン化するには範囲選択が必要です', 'warn');
      return false;
    }
    if (isMultiSpectatorMode()) {
      setMultiStatus(localizeText('視聴モードでは描画できません', 'Drawing is disabled in viewer mode'), 'warn');
      return false;
    }
    if (isMultiAssignedCellRestrictedEditorMode() && !enforceGuestAssignedLayerSelection({ announce: true })) {
      return false;
    }
    const layer = getActiveLayer();
    if (!layer) {
      updateAutosaveStatus('アウトラインを描画するレイヤーがありません', 'warn');
      return false;
    }
    const width = Math.max(0, Number(state.width) || 0);
    const height = Math.max(0, Number(state.height) || 0);
    if (width <= 0 || height <= 0 || !(mask instanceof Uint8Array) || mask.length !== (width * height)) {
      updateAutosaveStatus('選択範囲情報が不正なためアウトラインを描画できません', 'warn');
      return false;
    }
    const bounds = normalizeSelectionBoundsForState(state.selectionBounds) || computeSelectionBoundsFromMask(mask);
    if (!bounds) {
      updateAutosaveStatus('アウトライン化するには範囲選択が必要です', 'warn');
      return false;
    }

    const outlineThickness = clamp(Math.round(Number(state.outlineSize) || 1), 1, 8);
    const outlineMask = new Uint8Array(mask.length);
    const neighbors = outlineMode === '4'
      ? [
        { x: 0, y: -1 },
        { x: -1, y: 0 }, { x: 1, y: 0 },
        { x: 0, y: 1 },
      ]
      : [
        { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 },
        { x: -1, y: 0 }, { x: 1, y: 0 },
        { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 },
      ];
    let current = new Uint8Array(mask.length);
    current.set(mask);
    for (let layer = 0; layer < outlineThickness; layer += 1) {
      const nextRing = new Uint8Array(mask.length);
      for (let y = 0; y < height; y += 1) {
        const rowOffset = y * width;
        for (let x = 0; x < width; x += 1) {
          const idx = rowOffset + x;
          if (current[idx] !== 1) {
            continue;
          }
          for (let i = 0; i < neighbors.length; i += 1) {
            const nextX = x + neighbors[i].x;
            const nextY = y + neighbors[i].y;
            if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
              continue;
            }
            const nextIdx = (nextY * width) + nextX;
            if (current[nextIdx] === 1) {
              continue;
            }
            nextRing[nextIdx] = 1;
          }
        }
      }
      for (let idx = 0; idx < outlineMask.length; idx += 1) {
        if (nextRing[idx] === 1) {
          outlineMask[idx] = 1;
          current[idx] = 1;
        }
      }
    }

    const paletteIndex = normalizePaletteIndex(state.activePaletteIndex, state.activePaletteIndex);
    const changedIndices = [];
    let dirtyMinX = width;
    let dirtyMinY = height;
    let dirtyMaxX = -1;
    let dirtyMaxY = -1;
    for (let idx = 0; idx < outlineMask.length; idx += 1) {
      if (outlineMask[idx] !== 1) {
        continue;
      }
      if (layer.indices[idx] === paletteIndex) {
        continue;
      }
      changedIndices.push(idx);
      const y = Math.floor(idx / width);
      const x = idx - (y * width);
      if (x < dirtyMinX) dirtyMinX = x;
      if (y < dirtyMinY) dirtyMinY = y;
      if (x > dirtyMaxX) dirtyMaxX = x;
      if (y > dirtyMaxY) dirtyMaxY = y;
    }

    if (!changedIndices.length) {
      updateAutosaveStatus('アウトラインの追加対象がありません', 'info');
      return false;
    }

    beginHistory(outlineMode === '4' ? 'selectionOutline4' : 'selectionOutline8');
    const direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    changedIndices.forEach(idx => {
      layer.indices[idx] = paletteIndex;
      if (direct) {
        const base = idx * 4;
        direct[base] = 0;
        direct[base + 1] = 0;
        direct[base + 2] = 0;
        direct[base + 3] = 0;
      }
    });
    markHistoryDirty();
    if (dirtyMinX <= dirtyMaxX && dirtyMinY <= dirtyMaxY) {
      markDirtyRect(dirtyMinX, dirtyMinY, dirtyMaxX, dirtyMaxY);
    }
    requestRender();
    requestOverlayRender();
    commitHistory();
    scheduleSessionPersist();
    updateAutosaveStatus(`${modeLabel}アウトラインを追加しました (${changedIndices.length}px)`, 'success');
    return true;
  }

  function snapshotSelectionForClipboard() {
    if (pointerState.active) {
      return null;
    }
    const mask = state.selectionMask;
    const bounds = state.selectionBounds;
    if (!bounds) {
      return null;
    }
    if (isVoxelPreviewCanvasId(getActiveProjectCanvasDocument()?.id || '')) {
      const effectiveMask = mask instanceof Uint8Array
        ? mask
        : createBoundsMask(bounds, state.width, state.height);
      const compositeImage = snapshotRenderedCanvasImageData(activeCanvasSurface)
        || buildVoxelPreviewCanvasCompositeImageDataForFrameIndex(state.activeFrame);
      if (!compositeImage) {
        return null;
      }
      return createCompositeSelectionMoveState(bounds, effectiveMask, compositeImage);
    }
    if (!mask) {
      return null;
    }
    const layer = getActiveLayer();
    if (!layer) {
      return null;
    }
    const moveState = createSelectionMoveState(layer, bounds, mask, state.selectionContentMask);
    if (!moveState) {
      return null;
    }
    if (!selectionMaskHasPixels(moveState.mask)) {
      return null;
    }
    return moveState;
  }

  function snapshotPendingSelectionMoveForClipboard(moveState) {
    if (!moveState || !moveState.hasCleared) {
      return null;
    }
    const transformed = buildSelectionMoveTransformedEntries(moveState);
    const entries = Array.isArray(transformed.entries) ? transformed.entries : [];
    const transformedBounds = transformed.bounds;
    const width = Math.max(0, Math.floor(Number(transformed.width) || 0));
    const height = Math.max(0, Math.floor(Number(transformed.height) || 0));
    const size = width * height;
    if (!entries.length || !transformedBounds || width <= 0 || height <= 0 || !(transformed.mask instanceof Uint8Array) || transformed.mask.length !== size) {
      return null;
    }

    const useUint8 = moveState.indices instanceof Uint8Array;
    const indices = useUint8 ? new Uint8Array(size) : new Int16Array(size).fill(-1);
    const direct = new Uint8ClampedArray(size * 4);
    const imageData = createBlankImageData(width, height);
    const outputData = imageData?.data instanceof Uint8ClampedArray ? imageData.data : null;
    const sourceIndices = isRasterIndexArray(moveState.indices) ? moveState.indices : null;
    const sourceDirect = moveState.direct instanceof Uint8ClampedArray ? moveState.direct : null;
    const sourceImageData = moveState.imageData?.data instanceof Uint8ClampedArray ? moveState.imageData.data : null;

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      const sourceIndex = Number(entry?.sourceIndex);
      const outX = (Number(entry?.x) || 0) - transformedBounds.x0;
      const outY = (Number(entry?.y) || 0) - transformedBounds.y0;
      if (
        !Number.isInteger(sourceIndex)
        || sourceIndex < 0
        || outX < 0
        || outY < 0
        || outX >= width
        || outY >= height
      ) {
        continue;
      }
      const localIndex = (outY * width) + outX;
      const localBase = localIndex * 4;
      const sourceBase = sourceIndex * 4;
      if (Array.isArray(entry.rgba) && entry.rgba.length >= 4) {
        indices[localIndex] = useUint8 ? 0 : -1;
        direct[localBase] = clamp(Math.round(Number(entry.rgba[0]) || 0), 0, 255);
        direct[localBase + 1] = clamp(Math.round(Number(entry.rgba[1]) || 0), 0, 255);
        direct[localBase + 2] = clamp(Math.round(Number(entry.rgba[2]) || 0), 0, 255);
        direct[localBase + 3] = clamp(Math.round(Number(entry.rgba[3]) || 0), 0, 255);
        if (outputData) {
          outputData[localBase] = direct[localBase];
          outputData[localBase + 1] = direct[localBase + 1];
          outputData[localBase + 2] = direct[localBase + 2];
          outputData[localBase + 3] = direct[localBase + 3];
        }
        continue;
      }
      if (sourceIndices && sourceIndex < sourceIndices.length) {
        indices[localIndex] = sourceIndices[sourceIndex];
      }
      if (sourceDirect && sourceBase + 3 < sourceDirect.length) {
        direct[localBase] = sourceDirect[sourceBase];
        direct[localBase + 1] = sourceDirect[sourceBase + 1];
        direct[localBase + 2] = sourceDirect[sourceBase + 2];
        direct[localBase + 3] = sourceDirect[sourceBase + 3];
      }
      if (outputData) {
        if (sourceImageData && sourceBase + 3 < sourceImageData.length) {
          outputData[localBase] = sourceImageData[sourceBase];
          outputData[localBase + 1] = sourceImageData[sourceBase + 1];
          outputData[localBase + 2] = sourceImageData[sourceBase + 2];
          outputData[localBase + 3] = sourceImageData[sourceBase + 3];
        } else if (indices[localIndex] >= 0 && state.palette[indices[localIndex]]) {
          const color = state.palette[indices[localIndex]];
          outputData[localBase] = color.r;
          outputData[localBase + 1] = color.g;
          outputData[localBase + 2] = color.b;
          outputData[localBase + 3] = color.a;
        } else if (sourceDirect && sourceBase + 3 < sourceDirect.length) {
          outputData[localBase] = sourceDirect[sourceBase];
          outputData[localBase + 1] = sourceDirect[sourceBase + 1];
          outputData[localBase + 2] = sourceDirect[sourceBase + 2];
          outputData[localBase + 3] = sourceDirect[sourceBase + 3];
        }
      }
    }

    const visualBounds = getSelectionMoveVisualBounds(moveState) || {
      x0: (Number(moveState.bounds?.x0) || 0) + (Number(moveState.offset?.x) || 0) + transformedBounds.x0,
      y0: (Number(moveState.bounds?.y0) || 0) + (Number(moveState.offset?.y) || 0) + transformedBounds.y0,
      x1: (Number(moveState.bounds?.x0) || 0) + (Number(moveState.offset?.x) || 0) + transformedBounds.x1,
      y1: (Number(moveState.bounds?.y0) || 0) + (Number(moveState.offset?.y) || 0) + transformedBounds.y1,
    };

    return {
      width,
      height,
      mask: new Uint8Array(transformed.mask),
      contentMask: (() => {
        const transformedContent = buildSelectionMoveTransformedEntries(moveState, {
          sourceMask: getSelectionMoveContentMask(moveState),
          cacheProperty: 'transformedContentEntryCache',
          cacheScope: 'content',
        });
        return transformedContent.mask instanceof Uint8Array ? new Uint8Array(transformedContent.mask) : null;
      })(),
      indices,
      direct,
      bounds: visualBounds,
      imageData,
    };
  }

  function cloneImageData(imageData) {
    if (!imageData) {
      return null;
    }
    const width = Number(imageData.width) || 0;
    const height = Number(imageData.height) || 0;
    const source = imageData.data instanceof Uint8ClampedArray
      ? imageData.data
      : new Uint8ClampedArray(imageData.data || []);

    if (typeof ImageData === 'function') {
      try {
        const clone = new ImageData(width, height);
        clone.data.set(source);
        return clone;
      } catch (error) {
        try {
          return new ImageData(new Uint8ClampedArray(source), width, height);
        } catch (innerError) {
          // fall through
        }
      }
    }

    if (ctx.overlay && typeof ctx.overlay.createImageData === 'function') {
      const clone = ctx.overlay.createImageData(width, height);
      clone.data.set(source);
      return clone;
    }

    return null;
  }

  function createBlankImageData(width, height) {
    const w = Math.max(0, Math.floor(width) || 0);
    const h = Math.max(0, Math.floor(height) || 0);
    if (w === 0 || h === 0) {
      return null;
    }
    if (ctx.overlay && typeof ctx.overlay.createImageData === 'function') {
      try {
        return ctx.overlay.createImageData(w, h);
      } catch (error) {
        // Fall through to ImageData constructor fallback.
      }
    }
    if (typeof ImageData === 'function') {
      try {
        return new ImageData(w, h);
      } catch (error) {
        try {
          return new ImageData(new Uint8ClampedArray(w * h * 4), w, h);
        } catch (innerError) {
          return null;
        }
      }
    }
    return null;
  }

  function createMovePreviewCanvasFromImageData(imageData) {
    if (!imageData || typeof document === 'undefined' || typeof document.createElement !== 'function') {
      return null;
    }
    const width = Math.max(0, Math.floor(Number(imageData.width) || 0));
    const height = Math.max(0, Math.floor(Number(imageData.height) || 0));
    if (width <= 0 || height <= 0) {
      return null;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      let previewCtx = null;
      try {
        previewCtx = canvas.getContext('2d', { willReadFrequently: true });
      } catch (error) {
        previewCtx = canvas.getContext('2d');
      }
      if (!previewCtx) {
        return null;
      }
      previewCtx.imageSmoothingEnabled = false;
      previewCtx.putImageData(imageData, 0, 0);
      return canvas;
    } catch (error) {
      return null;
    }
  }

  function createMovePreviewCanvasFromPixels(width, height, mask, indices, direct) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
      return null;
    }
    const w = Math.max(0, Math.floor(Number(width) || 0));
    const h = Math.max(0, Math.floor(Number(height) || 0));
    if (w <= 0 || h <= 0) {
      return null;
    }
    const expectedSize = w * h;
    if (!(mask instanceof Uint8Array) || mask.length !== expectedSize) {
      return null;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const previewCtx = canvas.getContext('2d');
      if (!previewCtx) {
        return null;
      }
      previewCtx.imageSmoothingEnabled = false;
      const palette = Array.isArray(state.palette) ? state.palette : [];

      let imageData = null;
      try {
        imageData = previewCtx.createImageData(w, h);
      } catch (error) {
        imageData = null;
      }

      if (imageData && imageData.data instanceof Uint8ClampedArray) {
        const data = imageData.data;
        for (let i = 0; i < expectedSize; i += 1) {
          const base = i * 4;
          if (mask[i] !== 1) {
            data[base] = 0;
            data[base + 1] = 0;
            data[base + 2] = 0;
            data[base + 3] = 0;
            continue;
          }
          const paletteIndex = isRasterIndexArray(indices) ? indices[i] : -1;
          if (paletteIndex >= 0 && palette[paletteIndex] && Number(palette[paletteIndex].a) > 0) {
            const color = palette[paletteIndex];
            data[base] = color.r;
            data[base + 1] = color.g;
            data[base + 2] = color.b;
            data[base + 3] = color.a;
          } else if (direct instanceof Uint8ClampedArray && direct.length >= base + 4) {
            data[base] = direct[base];
            data[base + 1] = direct[base + 1];
            data[base + 2] = direct[base + 2];
            data[base + 3] = direct[base + 3];
          } else {
            data[base] = 0;
            data[base + 1] = 0;
            data[base + 2] = 0;
            data[base + 3] = 0;
          }
        }
        previewCtx.putImageData(imageData, 0, 0);
        return canvas;
      }

      let lastFillStyle = '';
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const localIndex = y * w + x;
          if (mask[localIndex] !== 1) {
            continue;
          }
          const paletteIndex = isRasterIndexArray(indices) ? indices[localIndex] : -1;
          let r = 0;
          let g = 0;
          let b = 0;
          let a = 0;
          if (paletteIndex >= 0 && palette[paletteIndex] && Number(palette[paletteIndex].a) > 0) {
            const color = palette[paletteIndex];
            r = color.r;
            g = color.g;
            b = color.b;
            a = color.a;
          } else if (direct instanceof Uint8ClampedArray) {
            const base = localIndex * 4;
            if (direct.length >= base + 4) {
              r = direct[base];
              g = direct[base + 1];
              b = direct[base + 2];
              a = direct[base + 3];
            }
          }
          if (a <= 0) {
            continue;
          }
          const fillStyle = `rgba(${r},${g},${b},${(a / 255).toFixed(4)})`;
          if (fillStyle !== lastFillStyle) {
            previewCtx.fillStyle = fillStyle;
            lastFillStyle = fillStyle;
          }
          previewCtx.fillRect(x, y, 1, 1);
        }
      }
      return canvas;
    } catch (error) {
      return null;
    }
  }

  function populateImageDataFromPixels(imageData, indices, direct, mask) {
    if (!imageData) {
      return;
    }
    const data = imageData.data;
    if (!(data instanceof Uint8ClampedArray)) {
      return;
    }
    const palette = state.palette;
    const size = mask ? mask.length : 0;
    for (let i = 0; i < size; i += 1) {
      const base = i * 4;
      if (mask[i] === 1) {
        const paletteIndex = isRasterIndexArray(indices) ? indices[i] : -1;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        if (paletteIndex >= 0 && palette[paletteIndex] && Number(palette[paletteIndex].a) > 0) {
          const color = palette[paletteIndex];
          r = color.r;
          g = color.g;
          b = color.b;
          a = color.a;
        } else if (direct instanceof Uint8ClampedArray) {
          r = direct[base];
          g = direct[base + 1];
          b = direct[base + 2];
          a = direct[base + 3];
        }
        data[base] = r;
        data[base + 1] = g;
        data[base + 2] = b;
        data[base + 3] = a;
      } else {
        data[base] = 0;
        data[base + 1] = 0;
        data[base + 2] = 0;
        data[base + 3] = 0;
      }
    }
  }

  function getPaletteColorKey(color) {
    const normalized = normalizeColorValue(color);
    return `${normalized.r},${normalized.g},${normalized.b},${normalized.a}`;
  }

  function ensurePaletteColor(palette, paletteLookup, color) {
    const targetPalette = Array.isArray(palette) ? palette : [];
    const lookup = paletteLookup instanceof Map ? paletteLookup : buildPaletteColorLookup(targetPalette);
    const normalized = normalizeColorValue(color);
    const key = getPaletteColorKey(normalized);
    let paletteIndex = lookup.get(key);
    let added = false;
    if (!Number.isInteger(paletteIndex) || paletteIndex < 0) {
      paletteIndex = targetPalette.length;
      targetPalette.push(normalized);
      lookup.set(key, paletteIndex);
      added = true;
    }
    return { paletteIndex, added, color: normalized };
  }

  function getPaletteColorDistanceScore(sourceColor, targetColor) {
    const source = normalizeColorValue(sourceColor);
    const target = normalizeColorValue(targetColor);
    const dr = source.r - target.r;
    const dg = source.g - target.g;
    const db = source.b - target.b;
    const da = source.a - target.a;
    return (dr * dr * 3) + (dg * dg * 4) + (db * db * 2) + (da * da * 6);
  }

  function findNearestPaletteIndexForColor(color, palette = state.palette, fallbackIndex = state.activePaletteIndex) {
    if (!Array.isArray(palette) || !palette.length) {
      return -1;
    }
    const normalized = normalizeColorValue(color);
    let bestIndex = -1;
    let bestScore = Infinity;
    for (let index = 0; index < palette.length; index += 1) {
      const candidate = normalizeColorValue(palette[index]);
      if (normalized.a > 0 && candidate.a <= 0 && palette.length > 1) {
        continue;
      }
      const score = getPaletteColorDistanceScore(normalized, candidate);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex >= 0) {
      return bestIndex;
    }
    if (normalized.a > 0) {
      return -1;
    }
    const fallback = Number.isFinite(fallbackIndex) ? Math.round(fallbackIndex) : 0;
    return clamp(fallback, 0, palette.length - 1);
  }

  function buildPaletteColorLookup(palette = state.palette) {
    const lookup = new Map();
    if (!Array.isArray(palette)) {
      return lookup;
    }
    for (let i = 0; i < palette.length; i += 1) {
      const key = getPaletteColorKey(palette[i]);
      if (!lookup.has(key)) {
        lookup.set(key, i);
      }
    }
    return lookup;
  }

  function getPackedPaletteColorKey(r, g, b, a) {
    return (
      ((Number(r) & 255) * 0x1000000)
      + ((Number(g) & 255) << 16)
      + ((Number(b) & 255) << 8)
      + (Number(a) & 255)
    ) >>> 0;
  }

  function buildPackedPaletteColorLookup(palette) {
    const lookup = new Map();
    if (!Array.isArray(palette)) {
      return lookup;
    }
    for (let index = 0; index < palette.length; index += 1) {
      const color = palette[index];
      const key = getPackedPaletteColorKey(color?.r, color?.g, color?.b, color?.a);
      if (!lookup.has(key)) {
        lookup.set(key, index);
      }
    }
    return lookup;
  }

  function buildLayerColorDataForPaletteSync(layer, palette) {
    if (!isRasterIndexArray(layer?.indices)) {
      return null;
    }
    const pixelCount = layer.indices.length;
    const data = new Uint8ClampedArray(pixelCount * 4);
    const direct = layer.direct instanceof Uint8ClampedArray && layer.direct.length === pixelCount * 4
      ? layer.direct
      : null;
    for (let i = 0; i < pixelCount; i += 1) {
      const base = i * 4;
      const paletteIndex = typeof getStoredRasterLayerPaletteIndex === 'function'
        ? getStoredRasterLayerPaletteIndex(layer, i)
        : layer.indices[i];
      if (paletteIndex >= 0 && Array.isArray(palette) && palette[paletteIndex] && Number(palette[paletteIndex].a) > 0) {
        const color = normalizeColorValue(palette[paletteIndex]);
        data[base] = color.r;
        data[base + 1] = color.g;
        data[base + 2] = color.b;
        data[base + 3] = color.a;
      } else if (direct) {
        data[base] = direct[base];
        data[base + 1] = direct[base + 1];
        data[base + 2] = direct[base + 2];
        data[base + 3] = direct[base + 3];
      }
    }
    return data;
  }

  function limitSnapshotPaletteColors(snapshot, maxColors = MAX_IMPORTED_PALETTE_COLORS) {
    if (!snapshot || typeof snapshot !== 'object') {
      return { reduced: false, sourceColorCount: 0, paletteSize: 0 };
    }
    const normalizedMaxColors = clamp(
      Math.round(Number(maxColors) || MAX_IMPORTED_PALETTE_COLORS),
      2,
      MAX_IMPORTED_PALETTE_COLORS
    );
    const palette = Array.isArray(snapshot.palette)
      ? snapshot.palette.map(color => normalizeColorValue(color))
      : [];
    if (palette.length <= normalizedMaxColors) {
      return { reduced: false, sourceColorCount: palette.length, paletteSize: palette.length };
    }
    const transparentColor = palette.find(color => normalizeColorValue(color).a <= 0) || { r: 0, g: 0, b: 0, a: 0 };
    const maxOpaqueColors = normalizedMaxColors - 1;
    const layerEntries = [];
    forEachSnapshotCanvasLayer(snapshot, ({ layer }) => {
      if (!isRasterIndexArray(layer?.indices)) {
        return;
      }
      const colorData = buildLayerColorDataForPaletteSync(layer, palette);
      if (colorData instanceof Uint8ClampedArray) {
        layerEntries.push({ layer, colorData });
      }
    });
    if (!layerEntries.length) {
      const opaqueColors = palette
        .map((color, index) => ({ ...normalizeColorValue(color), count: 1, sourceIndex: index }))
        .filter(color => color.a > 0);
      const reducedOpaqueColors = opaqueColors.length > maxOpaqueColors
        ? quantizeRgbaColors(opaqueColors, maxOpaqueColors)
        : opaqueColors.map(color => normalizeColorValue(color));
      snapshot.palette = [
        normalizeColorValue({ ...transparentColor, a: 0 }),
        ...reducedOpaqueColors.slice(0, maxOpaqueColors).map(color => normalizeColorValue({ ...color, a: color.a <= 0 ? 255 : color.a })),
      ];
      return {
        reduced: palette.length > snapshot.palette.length,
        sourceColorCount: palette.length,
        paletteSize: snapshot.palette.length,
      };
    }
    const extraction = buildIndexedPaletteFromFrameDataList(
      layerEntries.map(entry => entry.colorData),
      maxOpaqueColors
    );
    const extractedOpaquePalette = Array.isArray(extraction.palette) && extraction.palette.length
      ? extraction.palette.map(color => normalizeColorValue(color)).filter(color => color.a > 0)
      : [];
    const nextPalette = [
      normalizeColorValue({ ...transparentColor, a: 0 }),
      ...extractedOpaquePalette.slice(0, maxOpaqueColors),
    ];
    if (nextPalette.length < 2) {
      nextPalette.push({ r: 0, g: 0, b: 0, a: 255 });
    }
    const colorMode = normalizeColorMode(snapshot.colorMode, COLOR_MODE_INDEX);
    let layerEntryIndex = 0;
    forEachSnapshotCanvasLayer(snapshot, ({ layer }) => {
      if (!isRasterIndexArray(layer?.indices)) {
        return;
      }
      const extractedIndices = Array.isArray(extraction.frameIndices)
        ? extraction.frameIndices[layerEntryIndex]
        : null;
      layerEntryIndex += 1;
      if (!(extractedIndices instanceof Int16Array) || extractedIndices.length !== layer.indices.length) {
        return;
      }
      if (colorMode === COLOR_MODE_INDEX) {
        const runtimeUint8 = typeof isRuntimeUint8LayerIndices === 'function' && isRuntimeUint8LayerIndices(layer);
        const remapped = runtimeUint8
          ? new Uint8Array(extractedIndices.length)
          : new Int16Array(extractedIndices.length).fill(-1);
        for (let i = 0; i < extractedIndices.length; i += 1) {
          remapped[i] = extractedIndices[i] >= 0 ? extractedIndices[i] + 1 : (runtimeUint8 ? 0 : -1);
        }
        layer.indices = remapped;
        layer.direct = null;
        layer.directOnly = false;
        return;
      }
      const direct = layer.direct instanceof Uint8ClampedArray && layer.direct.length === layer.indices.length * 4
        ? layer.direct
        : null;
      if (!direct) {
        const runtimeUint8 = typeof isRuntimeUint8LayerIndices === 'function' && isRuntimeUint8LayerIndices(layer);
        const remapped = runtimeUint8
          ? new Uint8Array(extractedIndices.length)
          : new Int16Array(extractedIndices.length).fill(-1);
        for (let i = 0; i < extractedIndices.length; i += 1) {
          remapped[i] = extractedIndices[i] >= 0 ? extractedIndices[i] + 1 : (runtimeUint8 ? 0 : -1);
        }
        layer.indices = remapped;
        layer.direct = null;
        layer.directOnly = false;
        return;
      }
      const runtimeUint8 = typeof isRuntimeUint8LayerIndices === 'function' && isRuntimeUint8LayerIndices(layer);
      const remappedIndices = runtimeUint8 ? new Uint8Array(layer.indices) : new Int16Array(layer.indices);
      for (let i = 0; i < remappedIndices.length; i += 1) {
        const sourcePaletteIndex = typeof getStoredRasterLayerPaletteIndex === 'function'
          ? getStoredRasterLayerPaletteIndex(layer, i)
          : layer.indices[i];
        remappedIndices[i] = sourcePaletteIndex >= 0 && extractedIndices[i] >= 0
          ? extractedIndices[i] + 1
          : (runtimeUint8 ? 0 : -1);
      }
      layer.indices = remappedIndices;
    });
    const oldActiveColor = normalizeColorValue(
      snapshot.activeRgb
      || palette[clamp(Math.round(Number(snapshot.activePaletteIndex) || 0), 0, Math.max(0, palette.length - 1))]
      || palette[0]
      || nextPalette[0]
    );
    const oldSecondaryColor = normalizeColorValue(
      palette[clamp(Math.round(Number(snapshot.secondaryPaletteIndex) || 0), 0, Math.max(0, palette.length - 1))]
      || oldActiveColor
    );
    snapshot.palette = nextPalette;
    snapshot.activePaletteIndex = findNearestPaletteColorIndexByRgba(oldActiveColor, nextPalette, 0);
    snapshot.secondaryPaletteIndex = findNearestPaletteColorIndexByRgba(
      oldSecondaryColor,
      nextPalette,
      snapshot.activePaletteIndex
    );
    snapshot.activeRgb = normalizeColorValue(nextPalette[snapshot.activePaletteIndex] || oldActiveColor || nextPalette[0]);
    return {
      reduced: palette.length > nextPalette.length || Boolean(extraction.reduced),
      sourceColorCount: extraction.sourceColorCount || palette.length,
      paletteSize: nextPalette.length,
    };
  }

  function limitCurrentDocumentPaletteColors(maxColors = MAX_IMPORTED_PALETTE_COLORS, { colorMode = state.colorMode } = {}) {
    if (!Array.isArray(state.palette) || state.palette.length <= maxColors) {
      return { reduced: false, sourceColorCount: state.palette?.length || 0, paletteSize: state.palette?.length || 0 };
    }
    const snapshot = {
      palette: state.palette,
      colorMode,
      activePaletteIndex: state.activePaletteIndex,
      secondaryPaletteIndex: state.secondaryPaletteIndex,
      activeRgb: state.activeRgb,
      canvases: getProjectCanvasDocuments().map(canvasDoc => ({
        id: canvasDoc?.id || '',
        width: canvasDoc?.width || state.width,
        height: canvasDoc?.height || state.height,
        frames: canvasDoc?.frames || [],
      })),
    };
    const result = limitSnapshotPaletteColors(snapshot, maxColors);
    state.palette = Array.isArray(snapshot.palette)
      ? snapshot.palette.map(color => normalizeColorValue(color))
      : [{ r: 0, g: 0, b: 0, a: 0 }];
    padIndexedPaletteToMaxColors(state.palette, maxColors);
    state.activePaletteIndex = normalizePaletteIndex(snapshot.activePaletteIndex, state.activePaletteIndex);
    state.secondaryPaletteIndex = normalizePaletteIndex(snapshot.secondaryPaletteIndex, state.activePaletteIndex);
    state.activeRgb = normalizeColorValue(snapshot.activeRgb || state.palette[state.activePaletteIndex] || state.palette[0]);
    return result;
  }

  function synchronizeImportedSnapshotPalette(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return { addedCount: 0, convertedPixels: 0, reduced: false, paletteSize: 0 };
    }
    const palette = Array.isArray(snapshot.palette)
      ? snapshot.palette.map(color => normalizeColorValue(color))
      : [];
    // This path can visit hundreds of millions of pixels. A packed numeric key
    // avoids per-pixel objects, string creation, and duplicate normalization.
    const paletteLookup = buildPackedPaletteColorLookup(palette);
    const colorMode = normalizeColorMode(snapshot.colorMode, COLOR_MODE_INDEX);
    let addedCount = 0;
    let convertedPixels = 0;

    forEachSnapshotCanvasLayer(snapshot, ({ layer }) => {
      if (!isRasterIndexArray(layer?.indices)) {
        return;
      }
      const pixelCount = layer.indices.length;
      const expectedLength = pixelCount * 4;
      let direct = layer.direct instanceof Uint8ClampedArray && layer.direct.length === expectedLength
        ? layer.direct
        : null;
      if (
        !direct
        && layer.importSourceDirect instanceof Uint8ClampedArray
        && layer.importSourceDirect.length === expectedLength
      ) {
        direct = layer.importSourceDirect;
        layer.direct = direct;
      }
      if (!direct) {
        layer.direct = null;
        layer.importSourceDirect = null;
        return;
      }
      for (let i = 0; i < pixelCount; i += 1) {
        const storedPaletteIndex = typeof getStoredRasterLayerPaletteIndex === 'function'
          ? getStoredRasterLayerPaletteIndex(layer, i)
          : layer.indices[i];
        if (storedPaletteIndex >= 0) {
          continue;
        }
        const base = i * 4;
        const alpha = direct[base + 3];
        if (alpha <= 0) {
          continue;
        }
        const red = direct[base];
        const green = direct[base + 1];
        const blue = direct[base + 2];
        const key = getPackedPaletteColorKey(red, green, blue, alpha);
        let paletteIndex = paletteLookup.get(key);
        if (!Number.isInteger(paletteIndex) || paletteIndex < 0) {
          paletteIndex = palette.length;
          palette.push({ r: red, g: green, b: blue, a: alpha });
          paletteLookup.set(key, paletteIndex);
          addedCount += 1;
        }
        if (colorMode === COLOR_MODE_INDEX) {
          layer.indices[i] = paletteIndex;
          direct[base] = 0;
          direct[base + 1] = 0;
          direct[base + 2] = 0;
          direct[base + 3] = 0;
          convertedPixels += 1;
        }
      }
      if (colorMode === COLOR_MODE_INDEX) {
        layer.direct = null;
        layer.directOnly = false;
      }
      // direct/indices are the current editable source of truth. The legacy
      // import buffer is accepted at ingress but must not remain as a second
      // full-resolution RGBA copy in memory or subsequent saves.
      layer.importSourceDirect = null;
    });

    if (!palette.length) {
      palette.push({ r: 0, g: 0, b: 0, a: 0 });
    }

    snapshot.palette = palette;
    const limitResult = palette.length > MAX_IMPORTED_PALETTE_COLORS
      ? limitSnapshotPaletteColors(snapshot, MAX_IMPORTED_PALETTE_COLORS)
      : { reduced: false, sourceColorCount: palette.length, paletteSize: palette.length };
    const resolvedPalette = Array.isArray(snapshot.palette)
      ? snapshot.palette.map(color => normalizeColorValue(color))
      : [{ r: 0, g: 0, b: 0, a: 0 }];
    snapshot.palette = resolvedPalette;
    const maxPaletteIndex = Math.max(0, resolvedPalette.length - 1);
    const fallbackActivePaletteIndex = Number.isFinite(snapshot.activePaletteIndex)
      ? Math.round(snapshot.activePaletteIndex)
      : 0;
    snapshot.activePaletteIndex = clamp(fallbackActivePaletteIndex, 0, maxPaletteIndex);
    const fallbackSecondaryPaletteIndex = Number.isFinite(snapshot.secondaryPaletteIndex)
      ? Math.round(snapshot.secondaryPaletteIndex)
      : snapshot.activePaletteIndex;
    snapshot.secondaryPaletteIndex = clamp(fallbackSecondaryPaletteIndex, 0, maxPaletteIndex);
    const fallbackActiveRgb = resolvedPalette[snapshot.activePaletteIndex] || resolvedPalette[0];
    snapshot.activeRgb = normalizeColorValue(snapshot.activeRgb || fallbackActiveRgb);
    return { addedCount, convertedPixels, ...limitResult };
  }

  function remapClipboardSelectionColorsToCurrentPalette(clip, indices, direct, mask, {
    strategy = 'add-missing',
    targetPalette = state.palette,
  } = {}) {
    if (
      !isRasterIndexArray(indices)
      || !(mask instanceof Uint8Array)
      || mask.length !== indices.length
    ) {
      return { indices, addedCount: 0 };
    }
    const sourcePalette = Array.isArray(clip?.palette) ? clip.palette : null;
    const remappedIndices = indices instanceof Uint8Array ? new Uint8Array(indices) : new Int16Array(indices);
    const palette = Array.isArray(targetPalette) ? targetPalette : state.palette;
    const paletteLookup = buildPaletteColorLookup(palette);
    const sourceIndexMap = new Map();
    let addedCount = 0;
    const useNearestPalette = strategy === 'nearest-existing';
    const mapDirectPixel = (pixelIndex) => {
      if (!(direct instanceof Uint8ClampedArray)) {
        return -1;
      }
      const base = pixelIndex * 4;
      if (base + 3 >= direct.length || direct[base + 3] <= 0) {
        return -1;
      }
      const directColor = normalizeColorValue({
        r: direct[base],
        g: direct[base + 1],
        b: direct[base + 2],
        a: direct[base + 3],
      });
      const directKey = getPaletteColorKey(directColor);
      let mappedIndex = paletteLookup.get(directKey);
      if (!Number.isInteger(mappedIndex) || mappedIndex < 0) {
        if (useNearestPalette) {
          mappedIndex = findNearestPaletteIndexForColor(directColor, palette, state.activePaletteIndex);
        }
        if (!Number.isInteger(mappedIndex) || mappedIndex < 0) {
          const result = ensurePaletteColor(palette, paletteLookup, directColor);
          mappedIndex = result.paletteIndex;
          if (result.added) {
            addedCount += 1;
          }
        }
      }
      direct[base] = 0;
      direct[base + 1] = 0;
      direct[base + 2] = 0;
      direct[base + 3] = 0;
      return mappedIndex;
    };
    for (let i = 0; i < remappedIndices.length; i += 1) {
      if (mask[i] !== 1) {
        continue;
      }
      const sourceIndex = remappedIndices[i];
      const sourceColor = sourcePalette && sourcePalette[sourceIndex]
        ? normalizeColorValue(sourcePalette[sourceIndex])
        : null;
      const directBase = i * 4;
      const hasVisibleDirect = direct instanceof Uint8ClampedArray
        && directBase + 3 < direct.length
        && direct[directBase + 3] > 0;
      if (hasVisibleDirect && (sourceIndex < 0 || !sourceColor || sourceColor.a <= 0)) {
        const mappedDirectIndex = mapDirectPixel(i);
        if (mappedDirectIndex >= 0) {
          remappedIndices[i] = mappedDirectIndex;
        }
        continue;
      }
      if (sourceIndex >= 0) {
        let mappedIndex = sourceIndexMap.get(sourceIndex);
        if (!Number.isInteger(mappedIndex)) {
          if (sourceColor) {
            const sourceKey = getPaletteColorKey(sourceColor);
            const existingIndex = paletteLookup.get(sourceKey);
            if (Number.isInteger(existingIndex) && existingIndex >= 0) {
              mappedIndex = existingIndex;
            } else if (useNearestPalette) {
              mappedIndex = findNearestPaletteIndexForColor(sourceColor, palette, state.activePaletteIndex);
              if (!Number.isInteger(mappedIndex) || mappedIndex < 0) {
                const result = ensurePaletteColor(palette, paletteLookup, sourceColor);
                mappedIndex = result.paletteIndex;
                if (result.added) {
                  addedCount += 1;
                }
              }
            } else {
              const result = ensurePaletteColor(palette, paletteLookup, sourceColor);
              mappedIndex = result.paletteIndex;
              if (result.added) {
                addedCount += 1;
              }
            }
          } else {
            mappedIndex = normalizePaletteIndex(sourceIndex, state.activePaletteIndex);
          }
          sourceIndexMap.set(sourceIndex, mappedIndex);
        }
        remappedIndices[i] = mappedIndex;
        continue;
      }
      const mappedDirectIndex = mapDirectPixel(i);
      if (mappedDirectIndex >= 0) {
        remappedIndices[i] = mappedDirectIndex;
      }
    }
    return { indices: remappedIndices, addedCount };
  }

  function getClipboardPaletteExpansionCount(clip) {
    const width = Math.max(0, Math.floor(Number(clip?.width) || 0));
    const height = Math.max(0, Math.floor(Number(clip?.height) || 0));
    const size = width * height;
    if (!clip || size === 0) {
      return 0;
    }
    const mask = clip.mask instanceof Uint8Array && clip.mask.length === size
      ? new Uint8Array(clip.mask)
      : new Uint8Array(size);
    const indices = isRasterIndexArray(clip.indices) && clip.indices.length === size
      ? (clip.indices instanceof Uint8Array ? new Uint8Array(clip.indices) : new Int16Array(clip.indices))
      : new Uint8Array(size);
    const direct = clip.direct instanceof Uint8ClampedArray && clip.direct.length === size * 4
      ? new Uint8ClampedArray(clip.direct)
      : new Uint8ClampedArray(size * 4);
    const previewPalette = Array.isArray(state.palette)
      ? state.palette.map(color => normalizeColorValue(color))
      : [];
    return remapClipboardSelectionColorsToCurrentPalette(
      clip,
      indices,
      direct,
      mask,
      {
        strategy: isIndexColorMode() ? 'nearest-existing' : 'add-missing',
        targetPalette: previewPalette,
      }
    ).addedCount;
  }

  function createMoveStateFromClipboard(clip, bounds, layer, { autoExpandPalette = false } = {}) {
    if (!clip) {
      return null;
    }
    const width = Math.max(0, Math.floor(Number(clip.width) || 0));
    const height = Math.max(0, Math.floor(Number(clip.height) || 0));
    if (width === 0 || height === 0) {
      return null;
    }
    const size = width * height;
    const mask = clip.mask instanceof Uint8Array && clip.mask.length === size
      ? new Uint8Array(clip.mask)
      : new Uint8Array(size);
    const contentMask = clip.contentMask instanceof Uint8Array && clip.contentMask.length === size
      ? new Uint8Array(clip.contentMask)
      : null;
    let indices = isRasterIndexArray(clip.indices) && clip.indices.length === size
      ? (clip.indices instanceof Uint8Array ? new Uint8Array(clip.indices) : new Int16Array(clip.indices))
      : createSelectionIndexArray(layer, size);
    const direct = clip.direct instanceof Uint8ClampedArray && clip.direct.length === size * 4
      ? new Uint8ClampedArray(clip.direct)
      : new Uint8ClampedArray(size * 4);
    let paletteAddedCount = 0;
    if (autoExpandPalette) {
      const remapResult = remapClipboardSelectionColorsToCurrentPalette(
        clip,
        indices,
        direct,
        mask,
        { strategy: isIndexColorMode() ? 'nearest-existing' : 'add-missing' }
      );
      indices = remapResult.indices;
      paletteAddedCount = remapResult.addedCount;
    }
    let imageData = null;
    const shouldCreatePreviewBitmap = shouldCreateSelectionMoveBitmapPreview(width, height);
    if (clip.imageData && shouldCreatePreviewBitmap) {
      imageData = cloneImageData(clip.imageData);
    } else if (shouldCreatePreviewBitmap) {
      imageData = createBlankImageData(width, height);
      if (imageData) {
        populateImageDataFromPixels(imageData, indices, direct, mask);
      }
    }
    const previewCanvas = shouldCreatePreviewBitmap
      ? (createMovePreviewCanvasFromImageData(imageData)
        || createMovePreviewCanvasFromPixels(width, height, mask, indices, direct))
      : null;
    return {
      layer,
      layerId: layer?.id || null,
      bounds: { ...bounds },
      width,
      height,
      mask,
      contentMask: contentMask || buildSelectionMoveContentMask(mask, { indices, direct }),
      indices,
      direct,
      imageData,
      previewCanvas,
      offset: { x: 0, y: 0 },
      hasCleared: false,
      committed: false,
      restoreIndices: null,
      restoreDirect: null,
      applySelectionOnFinalize: true,
      fromPastePlacement: true,
      paletteAddedCount,
      transformRotationDeg: 0,
      transformFlipHorizontal: false,
      transformFlipVertical: false,
      transformScaleX: 1,
      transformScaleY: 1,
      transformedEntryCache: null,
      transformedContentEntryCache: null,
      transformedPreviewRenderCache: null,
    };
  }

  function createPasteRestoreSnapshot(layer, bounds, width, height) {
    const snappedWidth = Math.max(0, Math.floor(width) || 0);
    const snappedHeight = Math.max(0, Math.floor(height) || 0);
    if (snappedWidth === 0 || snappedHeight === 0) {
      return { indices: null, direct: null };
    }
    const size = snappedWidth * snappedHeight;
    const indices = createSelectionIndexArray(layer, size);
    const transparentValue = getSelectionTransparentValue(layer);
    let direct = null;
    const layerDirect = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    if (layerDirect) {
      direct = new Uint8ClampedArray(size * 4);
    }
    for (let y = 0; y < snappedHeight; y += 1) {
      for (let x = 0; x < snappedWidth; x += 1) {
        const localIndex = y * snappedWidth + x;
        const canvasX = bounds.x0 + x;
        const canvasY = bounds.y0 + y;
        if (canvasX < 0 || canvasY < 0 || canvasX >= state.width || canvasY >= state.height) {
          indices[localIndex] = transparentValue;
          if (direct) {
            const localBase = localIndex * 4;
            direct[localBase] = 0;
            direct[localBase + 1] = 0;
            direct[localBase + 2] = 0;
            direct[localBase + 3] = 0;
          }
          continue;
        }
        const canvasIndex = canvasY * state.width + canvasX;
        indices[localIndex] = layer.indices[canvasIndex];
        if (direct) {
          const localBase = localIndex * 4;
          const canvasBase = canvasIndex * 4;
          direct[localBase] = layerDirect[canvasBase];
          direct[localBase + 1] = layerDirect[canvasBase + 1];
          direct[localBase + 2] = layerDirect[canvasBase + 2];
          direct[localBase + 3] = layerDirect[canvasBase + 3];
        }
      }
    }
    return { indices, direct };
  }

  function createLayerMoveState(layer) {
    if (!layer) {
      return null;
    }
    const width = state.width;
    const height = state.height;
    if (width <= 0 || height <= 0) {
      return null;
    }
    const layerDirect = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    const bounds = { x0: width, y0: height, x1: -1, y1: -1 };
    const palette = state.palette;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        const paletteIndex = typeof getStoredRasterLayerPaletteIndex === 'function'
          ? getStoredRasterLayerPaletteIndex(layer, idx)
          : layer.indices[idx];
        let alpha = 0;
        if (paletteIndex >= 0 && palette[paletteIndex]) {
          alpha = palette[paletteIndex].a;
        } else if (layerDirect) {
          const base = idx * 4;
          alpha = layerDirect[base + 3];
        }
        if (paletteIndex >= 0 || alpha > 0) {
          if (x < bounds.x0) bounds.x0 = x;
          if (y < bounds.y0) bounds.y0 = y;
          if (x > bounds.x1) bounds.x1 = x;
          if (y > bounds.y1) bounds.y1 = y;
        }
      }
    }

    if (bounds.x1 < bounds.x0 || bounds.y1 < bounds.y0) {
      return null;
    }

    const moveWidth = bounds.x1 - bounds.x0 + 1;
    const moveHeight = bounds.y1 - bounds.y0 + 1;
    const size = moveWidth * moveHeight;
    const mask = new Uint8Array(size);
    const indices = createSelectionIndexArray(layer, size);
    const transparentValue = getSelectionTransparentValue(layer);
    const direct = new Uint8ClampedArray(size * 4);
    const contentSourceIndices = [];
    const shouldCreatePreviewBitmap = shouldCreateSelectionMoveBitmapPreview(moveWidth, moveHeight);
    const imageData = shouldCreatePreviewBitmap ? createBlankImageData(moveWidth, moveHeight) : null;

    for (let y = 0; y < moveHeight; y += 1) {
      for (let x = 0; x < moveWidth; x += 1) {
        const canvasX = bounds.x0 + x;
        const canvasY = bounds.y0 + y;
        const canvasIndex = canvasY * width + canvasX;
        const localIndex = y * moveWidth + x;
        const paletteIndex = typeof getStoredRasterLayerPaletteIndex === 'function'
          ? getStoredRasterLayerPaletteIndex(layer, canvasIndex)
          : layer.indices[canvasIndex];
        const canvasBase = canvasIndex * 4;
        const localBase = localIndex * 4;
        let hasPixel = false;
        if (paletteIndex >= 0) {
          indices[localIndex] = layer.indices[canvasIndex];
          hasPixel = true;
          if (layerDirect) {
            direct[localBase] = layerDirect[canvasBase];
            direct[localBase + 1] = layerDirect[canvasBase + 1];
            direct[localBase + 2] = layerDirect[canvasBase + 2];
            direct[localBase + 3] = layerDirect[canvasBase + 3];
          }
          if (imageData && palette[paletteIndex]) {
            const color = palette[paletteIndex];
            imageData.data[localBase] = color.r;
            imageData.data[localBase + 1] = color.g;
            imageData.data[localBase + 2] = color.b;
            imageData.data[localBase + 3] = color.a;
          } else if (imageData) {
            imageData.data[localBase] = 0;
            imageData.data[localBase + 1] = 0;
            imageData.data[localBase + 2] = 0;
            imageData.data[localBase + 3] = 0;
          }
        } else if (layerDirect && layerDirect[canvasBase + 3] > 0) {
          indices[localIndex] = transparentValue;
          direct[localBase] = layerDirect[canvasBase];
          direct[localBase + 1] = layerDirect[canvasBase + 1];
          direct[localBase + 2] = layerDirect[canvasBase + 2];
          direct[localBase + 3] = layerDirect[canvasBase + 3];
          hasPixel = true;
          if (imageData) {
            imageData.data[localBase] = direct[localBase];
            imageData.data[localBase + 1] = direct[localBase + 1];
            imageData.data[localBase + 2] = direct[localBase + 2];
            imageData.data[localBase + 3] = direct[localBase + 3];
          }
        } else {
          indices[localIndex] = transparentValue;
          if (imageData) {
            imageData.data[localBase] = 0;
            imageData.data[localBase + 1] = 0;
            imageData.data[localBase + 2] = 0;
            imageData.data[localBase + 3] = 0;
          }
        }
        if (hasPixel) {
          mask[localIndex] = 1;
          contentSourceIndices.push(localIndex);
        }
      }
    }

    const previewCanvas = shouldCreatePreviewBitmap
      ? (createMovePreviewCanvasFromImageData(imageData)
        || createMovePreviewCanvasFromPixels(moveWidth, moveHeight, mask, indices, direct))
      : null;
    return {
      layer,
      layerId: layer.id,
      bounds,
      width: moveWidth,
      height: moveHeight,
      mask,
      contentMask: new Uint8Array(mask),
      indices,
      direct,
      imageData,
      previewCanvas,
      selectedSourceIndices: contentSourceIndices.slice(),
      contentSourceIndices,
      offset: { x: 0, y: 0 },
      hasCleared: false,
      committed: false,
      restoreIndices: null,
      restoreDirect: null,
      applySelectionOnFinalize: true,
      transformRotationDeg: 0,
      transformFlipHorizontal: false,
      transformFlipVertical: false,
      transformScaleX: 1,
      transformScaleY: 1,
      transformedEntryCache: null,
      transformedPreviewRenderCache: null,
    };
  }

  return Object.freeze({
    buildSelectionMoveContentMask,
    getSelectionMoveContentMask,
    shouldCreateSelectionMoveBitmapPreview,
    createSelectionMoveState,
    createCompositeSelectionMoveState,
    createFullCanvasMask,
    createBoundsMask,
    snapshotRenderedCanvasImageData,
    snapshotVisibleVoxelPreviewForClipboard,
    normalizeSelectionMoveRotationDeg,
    getSelectionMoveTransformState,
    hasSelectionMoveTransform,
    normalizeSelectionMoveScale,
    transformSelectionMoveLocalPixel,
    transformSelectionMoveLocalPoint,
    inverseTransformSelectionMoveLocalPoint,
    shouldResampleSelectionMoveTransform,
    getMoveStateSourceRgba,
    sampleMoveStateNearestRgba,
    buildSelectionMoveResampledEntries,
    getSelectionMoveSourceIndices,
    buildSelectionMoveTransformedEntries,
    getSelectionMoveVisualBounds,
    selectionMaskHasPixels,
    buildCustomBrushFromSelection,
    createCustomBrushFromSelection,
    applySelectionOutline,
    snapshotSelectionForClipboard,
    snapshotPendingSelectionMoveForClipboard,
    cloneImageData,
    createBlankImageData,
    createMovePreviewCanvasFromImageData,
    createMovePreviewCanvasFromPixels,
    populateImageDataFromPixels,
    getPaletteColorKey,
    ensurePaletteColor,
    getPaletteColorDistanceScore,
    findNearestPaletteIndexForColor,
    buildPaletteColorLookup,
    getPackedPaletteColorKey,
    buildPackedPaletteColorLookup,
    buildLayerColorDataForPaletteSync,
    limitSnapshotPaletteColors,
    limitCurrentDocumentPaletteColors,
    synchronizeImportedSnapshotPalette,
    createLayerMoveState,
    createPasteRestoreSnapshot,
    createMoveStateFromClipboard,
    getClipboardPaletteExpansionCount,
    remapClipboardSelectionColorsToCurrentPalette,
  });
      }
    })(scope);
  }

  root.selectionMoveWorkflowUtils = Object.freeze({
    createSelectionMoveWorkflowUtils,
  });
})();
