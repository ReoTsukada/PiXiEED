(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createDocumentModel({
    state,
    EMBED_CONFIG,
    DEFAULT_CANVAS_SIZE,
    MIN_CANVAS_SIZE,
    MAX_CANVAS_SIZE,
    DEFAULT_DOCUMENT_NAME,
    DEFAULT_ONION_SKIN,
    DEFAULT_UI_THEME,
    SELECT_SAME_MODE_CONNECTED,
    FILL_STYLE_SOLID,
    SELECTION_SHAPE_MODE_CONTENT,
    BRUSH_SHAPE_SQUARE,
    BRUSH_SHAPE_CUSTOM,
    NEW_PROJECT_PALETTE_PRESET_DEFAULT,
    clamp,
    getNewProjectPalettePresetColors,
    normalizeColorValue,
    normalizeCustomBrushData,
    normalizeBrushShape,
    normalizeSelectSameMode,
    normalizeFillStyle,
    normalizeSelectionShapeMode,
    getDefaultLayerName,
    getDefaultFrameName,
    getDefaultCanvasViewportScale,
    createInitialMirrorState,
    DEFAULT_FLOATING_DRAW_BUTTON_SCALE,
    normalizeFloatingPreviewState,
    FLOATING_PREVIEW_DEFAULT_STATE,
    normalizeUiTheme,
    DEFAULT_GROUP_TOOL,
    normalizeOnionSkinState,
    COLOR_MODE_INDEX,
    normalizeDocumentName,
    getTransparentPaletteIndex,
    DEFAULT_LAYER_BLEND_MODE,
    SIM_SOURCE_COLOR,
    SIM_ELEMENT_PALETTE,
    SIM_MIXED,
    SIM_DEFAULT_STYLE,
    SIM_DEFAULT_SETTINGS,
    SIM_LAYER_TYPE,
    SIM_ELEMENT_WATER,
    SIM_ELEMENT_FIRE,
    SIM_ELEMENT_METAL,
    SIM_ELEMENT_SMOKE,
    SIM_ELEMENT_LIGHT,
    normalizeLayerOpacity,
    normalizeLayerBlendMode,
    VOXEL_EXTENSION_DEFAULT_YAW_DEG,
    VOXEL_EXTENSION_PREVIEW_ELEVATION_DEG,
    normalizeVoxelPreviewYawDegrees,
    normalizeVoxelPreviewPitchDegrees,
    encodeTypedArray,
    decodeBase64,
    validateBoundsObject,
    computeSelectionBoundsFromMask,
    normalizeProjectCanvasViewScale,
    normalizeMirrorAxisState,
    collapseToSingleProjectCanvasSource,
    cloneImageData,
    MIN_ZOOM_SCALE,
  } = {}) {
    const COMPACT_LAYER_INDEX_ENCODING = 'uint8-zero-transparent-v1';
    const TILED_LAYER_INDEX_ENCODING = 'uint8-tiled-zero-transparent-v1';
    const RUNTIME_LAYER_INDEX_ENCODING = 'uint8-palette-zero-transparent-v2';
    const COMPACT_LAYER_TILE_SIZE = 32;
    const COMPACT_LAYER_TILE_MIN_PIXELS = 4096;
    function createInitialState(options = {}) {
      const preferredWidth = EMBED_CONFIG.initialWidth ?? EMBED_CONFIG.width ?? DEFAULT_CANVAS_SIZE;
      const preferredHeight =
        EMBED_CONFIG.initialHeight ?? EMBED_CONFIG.height ?? EMBED_CONFIG.initialWidth ?? DEFAULT_CANVAS_SIZE;
      const hasExplicitWidth = Boolean(options && Object.prototype.hasOwnProperty.call(options, 'width'));
      const hasExplicitHeight = Boolean(options && Object.prototype.hasOwnProperty.call(options, 'height'));
      const {
        width: requestedWidth = preferredWidth,
        height: requestedHeight = preferredHeight,
        name: requestedName = DEFAULT_DOCUMENT_NAME,
        onionSkin: requestedOnionSkin = DEFAULT_ONION_SKIN,
        uiTheme: requestedUiTheme = DEFAULT_UI_THEME,
        selectSameMode: requestedSelectSameMode = SELECT_SAME_MODE_CONNECTED,
        fillStyle: requestedFillStyle = FILL_STYLE_SOLID,
        selectionShapeMode: requestedSelectionShapeMode = SELECTION_SHAPE_MODE_CONTENT,
        brushShape: requestedBrushShape = BRUSH_SHAPE_SQUARE,
        customBrush: requestedCustomBrush = null,
        floatingPreview: requestedFloatingPreview = null,
        palettePreset: requestedPalettePreset = NEW_PROJECT_PALETTE_PRESET_DEFAULT,
      } = options || {};
      const width = clamp(
        Math.round(Number(requestedWidth) || preferredWidth || DEFAULT_CANVAS_SIZE),
        MIN_CANVAS_SIZE,
        MAX_CANVAS_SIZE
      );
      const height = clamp(
        Math.round(Number(requestedHeight) || preferredHeight || DEFAULT_CANVAS_SIZE),
        MIN_CANVAS_SIZE,
        MAX_CANVAS_SIZE
      );
      const initialWidth = !hasExplicitWidth && width < DEFAULT_CANVAS_SIZE
        ? DEFAULT_CANVAS_SIZE
        : width;
      const initialHeight = !hasExplicitHeight && height < DEFAULT_CANVAS_SIZE
        ? DEFAULT_CANVAS_SIZE
        : height;
      const palette = getNewProjectPalettePresetColors(requestedPalettePreset, NEW_PROJECT_PALETTE_PRESET_DEFAULT);
      const maxPaletteIndex = Math.max(0, palette.length - 1);
      const initialActivePaletteIndex = clamp(2, 0, maxPaletteIndex);
      const initialSecondaryPaletteIndex = clamp(3, 0, maxPaletteIndex);
      const initialActiveRgb = normalizeColorValue(
        palette[initialActivePaletteIndex]
        || palette[0]
        || { r: 255, g: 255, b: 255, a: 255 }
      );
      const customBrush = normalizeCustomBrushData(requestedCustomBrush);
      const requestedShape = normalizeBrushShape(requestedBrushShape, BRUSH_SHAPE_SQUARE);
      const brushShape = requestedShape === BRUSH_SHAPE_CUSTOM && !customBrush
        ? BRUSH_SHAPE_SQUARE
        : requestedShape;
      const layers = [createLayer(getDefaultLayerName(1), initialWidth, initialHeight, palette)];
      const frames = [createFrame(getDefaultFrameName(1), layers, initialWidth, initialHeight)];

      return {
        width: initialWidth,
        height: initialHeight,
        scale: getDefaultCanvasViewportScale({ width: initialWidth, height: initialHeight }),
        pan: { x: 0, y: 0 },
        tool: 'pen',
        brushSize: 1,
        outlineSize: 1,
        brushShape,
        selectSameMode: normalizeSelectSameMode(requestedSelectSameMode, SELECT_SAME_MODE_CONNECTED),
        fillStyle: normalizeFillStyle(requestedFillStyle, FILL_STYLE_SOLID),
        selectionShapeMode: normalizeSelectionShapeMode(requestedSelectionShapeMode, SELECTION_SHAPE_MODE_CONTENT),
        customBrush,
        showGrid: true,
        showPixelGuides: true,
        mirror: createInitialMirrorState(initialWidth, initialHeight),
        showVirtualCursor: false,
  danmakuEnabled: true,
        virtualCursorButtonScale: DEFAULT_FLOATING_DRAW_BUTTON_SCALE,
        floatingPreview: normalizeFloatingPreviewState(
          requestedFloatingPreview,
          FLOATING_PREVIEW_DEFAULT_STATE
        ),
        showCanvasResizeHandles: true,
        showMajorGrid: true,
        gridScreenStep: 8,
        majorGridSpacing: 16,
        backgroundMode: 'dark',
        uiTheme: normalizeUiTheme(requestedUiTheme, DEFAULT_UI_THEME),
        activeToolGroup: 'pen',
        lastGroupTool: { ...DEFAULT_GROUP_TOOL },
        activeLeftTab: 'tools',
        dualLeftRail: false,
        activeRightTab: 'frames',
        showChecker: true,
        onionSkin: normalizeOnionSkinState(requestedOnionSkin),
        colorMode: COLOR_MODE_INDEX,
        palette,
        activePaletteIndex: initialActivePaletteIndex,
        secondaryPaletteIndex: initialSecondaryPaletteIndex,
        activeRgb: initialActiveRgb,
        frames,
        activeFrame: 0,
        activeLayer: frames[0].layers[0].id,
        selectionMask: null,
        selectionBounds: null,
        pendingPasteMoveState: null,
        playback: { isPlaying: false, lastFrame: 0, loop: true },
        documentName: normalizeDocumentName(requestedName),
      };
    }

    function createInitialVirtualCursor(source = state) {
      const width = Math.max(1, Math.floor(Number(source?.width) || DEFAULT_CANVAS_SIZE));
      const height = Math.max(1, Math.floor(Number(source?.height) || DEFAULT_CANVAS_SIZE));
      const centerX = Math.min(width - 1, Math.max(0, Math.floor(width / 2)));
      const centerY = Math.min(height - 1, Math.max(0, Math.floor(height / 2)));
      return { x: centerX, y: centerY };
    }

    function getLayerCreationPalette(paletteOverride = null) {
      if (Array.isArray(paletteOverride)) {
        return paletteOverride;
      }
      try {
        return Array.isArray(state?.palette) ? state.palette : null;
      } catch (error) {
        return null;
      }
    }

    function createLayer(name, width, height, paletteOverride = null, options = {}) {
      const size = width * height;
      const deferPixelAllocation = options?.deferPixelAllocation === true;
      const palette = getLayerCreationPalette(paletteOverride);
      const useUint8Runtime = Array.isArray(palette)
        && palette.length > 0
        && palette.length <= 256
        && Number(palette[0]?.a) <= 0;
      return {
        id: crypto.randomUUID ? crypto.randomUUID() : `layer-${Math.random().toString(36).slice(2)}`,
        name,
        visible: true,
        opacity: 1,
        blendMode: DEFAULT_LAYER_BLEND_MODE,
        // A zero-length Int16 array is the runtime sentinel for a completely
        // transparent, not-yet-edited layer. It avoids allocating width ×
        // height × 2 bytes for every inactive frame when a layer track is
        // added. Active editing and serialization materialize it first.
        indices: deferPixelAllocation
          ? (useUint8Runtime ? new Uint8Array(0) : new Int16Array(0))
          : (useUint8Runtime ? new Uint8Array(size) : new Int16Array(size).fill(-1)),
        ...(useUint8Runtime ? { indicesEncoding: RUNTIME_LAYER_INDEX_ENCODING } : {}),
        direct: null,
        importSourceDirect: null,
      };
    }

    function isImplicitTransparentLayerIndices(indices, expectedLength = null) {
      if (!(indices instanceof Int16Array || indices instanceof Uint8Array) || indices.length !== 0) {
        return false;
      }
      return expectedLength == null || Math.max(0, Math.round(Number(expectedLength) || 0)) > 0;
    }

    function isCompactLayerIndices(layer, expectedLength = null) {
      if (!layer || layer.indicesEncoding !== COMPACT_LAYER_INDEX_ENCODING || !(layer.indices instanceof Uint8Array)) {
        return false;
      }
      return expectedLength == null || layer.indices.length === Math.max(0, Math.round(Number(expectedLength) || 0));
    }

    function isRuntimeUint8LayerIndices(layer, expectedLength = null) {
      if (!layer || layer.indicesEncoding !== RUNTIME_LAYER_INDEX_ENCODING || !(layer.indices instanceof Uint8Array)) {
        return false;
      }
      return expectedLength == null || layer.indices.length === Math.max(0, Math.round(Number(expectedLength) || 0));
    }

    function isTiledLayerIndices(layer, expectedLength = null) {
      if (
        !layer
        || layer.indicesEncoding !== TILED_LAYER_INDEX_ENCODING
        || !Array.isArray(layer.indicesTiles)
        || !(layer.indices instanceof Uint8Array)
        || layer.indices.length !== 0
      ) {
        return false;
      }
      const width = Math.max(0, Math.round(Number(layer.indicesWidth) || 0));
      const height = Math.max(0, Math.round(Number(layer.indicesHeight) || 0));
      const tileSize = Math.max(1, Math.round(Number(layer.indicesTileSize) || COMPACT_LAYER_TILE_SIZE));
      const tileCols = Math.ceil(width / tileSize);
      const tileRows = Math.ceil(height / tileSize);
      if (!width || !height || layer.indicesTiles.length !== tileCols * tileRows) {
        return false;
      }
      const firstTile = layer.indicesTiles[0];
      const lastTile = layer.indicesTiles[layer.indicesTiles.length - 1];
      if (
        !(firstTile instanceof Uint8Array)
        || firstTile.length !== tileSize * tileSize
        || !(lastTile instanceof Uint8Array)
        || lastTile.length !== tileSize * tileSize
      ) {
        return false;
      }
      return expectedLength == null || width * height === Math.max(0, Math.round(Number(expectedLength) || 0));
    }

    function clearTiledLayerIndexMetadata(layer) {
      if (!layer) return;
      delete layer.indicesTiles;
      delete layer.indicesWidth;
      delete layer.indicesHeight;
      delete layer.indicesTileSize;
    }

    function getTiledLayerStoredValue(layer, pixelIndex) {
      if (!isTiledLayerIndices(layer)) {
        return 0;
      }
      const width = layer.indicesWidth;
      const height = layer.indicesHeight;
      const safeIndex = Math.round(Number(pixelIndex));
      if (!Number.isFinite(safeIndex) || safeIndex < 0 || safeIndex >= width * height) {
        return 0;
      }
      const tileSize = layer.indicesTileSize;
      const x = safeIndex % width;
      const y = Math.floor(safeIndex / width);
      const tileCols = Math.ceil(width / tileSize);
      const tileIndex = Math.floor(y / tileSize) * tileCols + Math.floor(x / tileSize);
      const localIndex = (y % tileSize) * tileSize + (x % tileSize);
      return layer.indicesTiles[tileIndex]?.[localIndex] || 0;
    }

    function getStoredLayerPaletteIndex(layer, pixelIndex) {
      if (isRuntimeUint8LayerIndices(layer)) {
        const stored = layer.indices[pixelIndex];
        return stored === 0 || !Number.isFinite(stored) ? -1 : stored;
      }
      if (isTiledLayerIndices(layer)) {
        const stored = getTiledLayerStoredValue(layer, pixelIndex);
        return stored === 0 ? -1 : stored - 1;
      }
      if (isCompactLayerIndices(layer)) {
        const stored = layer.indices[pixelIndex];
        return stored === 0 || !Number.isFinite(stored) ? -1 : stored - 1;
      }
      if (layer?.indices instanceof Int16Array) {
        const stored = layer.indices[pixelIndex];
        return Number.isFinite(stored) ? stored : -1;
      }
      return -1;
    }

    function compactLayerIndices(layer, paletteOverride = null, expectedLength = null) {
      const indices = layer?.indices;
      if (!layer || !(indices instanceof Int16Array) || indices.length === 0) {
        return false;
      }
      if (expectedLength != null && indices.length !== Math.max(0, Math.round(Number(expectedLength) || 0))) {
        return false;
      }
      const palette = getLayerCreationPalette(paletteOverride) || [];
      const compact = new Uint8Array(indices.length);
      for (let pixelIndex = 0; pixelIndex < indices.length; pixelIndex += 1) {
        const paletteIndex = indices[pixelIndex];
        const color = paletteIndex >= 0 ? palette[paletteIndex] : null;
        if (paletteIndex < 0 || (color && Number(color.a) <= 0)) {
          compact[pixelIndex] = 0;
          continue;
        }
        if (paletteIndex >= 255) {
          return false;
        }
        compact[pixelIndex] = paletteIndex + 1;
      }
      layer.indices = compact;
      layer.indicesEncoding = COMPACT_LAYER_INDEX_ENCODING;
      clearTiledLayerIndexMetadata(layer);
      return true;
    }

    function createCompactLayerIndicesForStorage(layer, paletteOverride = null, expectedLength = null) {
      const indices = layer?.indices;
      const safeExpectedLength = expectedLength == null
        ? null
        : Math.max(0, Math.round(Number(expectedLength) || 0));
      if (
        !layer
        || !(indices instanceof Int16Array)
        || indices.length === 0
        || (safeExpectedLength != null && indices.length !== safeExpectedLength)
      ) {
        return null;
      }
      const palette = getLayerCreationPalette(paletteOverride) || [];
      const compact = new Uint8Array(indices.length);
      for (let pixelIndex = 0; pixelIndex < indices.length; pixelIndex += 1) {
        const paletteIndex = indices[pixelIndex];
        const color = paletteIndex >= 0 ? palette[paletteIndex] : null;
        if (paletteIndex < 0 || (color && Number(color.a) <= 0)) {
          compact[pixelIndex] = 0;
          continue;
        }
        // 0 is reserved for transparency. A document using opaque palette
        // index 255 cannot be represented losslessly in this encoding, so its
        // layer remains Int16 instead of silently changing the color.
        if (paletteIndex >= 255) {
          return null;
        }
        compact[pixelIndex] = paletteIndex + 1;
      }
      return compact;
    }

    function compactLayerIndicesToTiles(layer, paletteOverride, width, height, baseLayer = null) {
      const safeWidth = Math.max(1, Math.round(Number(width) || 1));
      const safeHeight = Math.max(1, Math.round(Number(height) || 1));
      const expectedLength = safeWidth * safeHeight;
      if (expectedLength < COMPACT_LAYER_TILE_MIN_PIXELS) {
        return compactLayerIndices(layer, paletteOverride, expectedLength);
      }
      if (!layer || !(layer.indices instanceof Int16Array) || layer.indices.length !== expectedLength) {
        return false;
      }
      const palette = getLayerCreationPalette(paletteOverride) || [];
      const tileSize = COMPACT_LAYER_TILE_SIZE;
      const tileCols = Math.ceil(safeWidth / tileSize);
      const tileRows = Math.ceil(safeHeight / tileSize);
      const tileLength = tileSize * tileSize;
      const tiles = [];
      const tilePool = new Map();
      const baseIsTiled = isTiledLayerIndices(baseLayer, expectedLength)
        && baseLayer.indicesWidth === safeWidth
        && baseLayer.indicesHeight === safeHeight
        && baseLayer.indicesTileSize === tileSize;
      const tilesEqual = (left, right) => {
        if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array) || left.length !== right.length) {
          return false;
        }
        for (let index = 0; index < left.length; index += 1) {
          if (left[index] !== right[index]) return false;
        }
        return true;
      };
      const hashTile = tile => {
        let hash = 2166136261;
        for (let index = 0; index < tile.length; index += 1) {
          hash ^= tile[index];
          hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
      };
      for (let tileY = 0; tileY < tileRows; tileY += 1) {
        for (let tileX = 0; tileX < tileCols; tileX += 1) {
          const tile = new Uint8Array(tileLength);
          for (let localY = 0; localY < tileSize; localY += 1) {
            const y = tileY * tileSize + localY;
            if (y >= safeHeight) break;
            for (let localX = 0; localX < tileSize; localX += 1) {
              const x = tileX * tileSize + localX;
              if (x >= safeWidth) break;
              const paletteIndex = layer.indices[y * safeWidth + x];
              const color = paletteIndex >= 0 ? palette[paletteIndex] : null;
              if (paletteIndex < 0 || (color && Number(color.a) <= 0)) {
                continue;
              }
              if (paletteIndex >= 255) {
                return false;
              }
              tile[localY * tileSize + localX] = paletteIndex + 1;
            }
          }
          const tileIndex = tileY * tileCols + tileX;
          const baseTile = baseIsTiled ? baseLayer.indicesTiles[tileIndex] : null;
          if (baseTile && tilesEqual(tile, baseTile)) {
            tiles.push(baseTile);
            continue;
          }
          const hash = hashTile(tile);
          const pooledTiles = tilePool.get(hash) || [];
          const pooledTile = pooledTiles.find(candidate => tilesEqual(tile, candidate));
          if (pooledTile) {
            tiles.push(pooledTile);
          } else {
            pooledTiles.push(tile);
            tilePool.set(hash, pooledTiles);
            tiles.push(tile);
          }
        }
      }
      layer.indices = new Uint8Array(0);
      layer.indicesEncoding = TILED_LAYER_INDEX_ENCODING;
      layer.indicesTiles = tiles;
      layer.indicesWidth = safeWidth;
      layer.indicesHeight = safeHeight;
      layer.indicesTileSize = tileSize;
      return true;
    }

    function flattenTiledLayerIndices(layer) {
      if (!isTiledLayerIndices(layer)) {
        return null;
      }
      const output = new Uint8Array(layer.indicesWidth * layer.indicesHeight);
      for (let pixelIndex = 0; pixelIndex < output.length; pixelIndex += 1) {
        output[pixelIndex] = getTiledLayerStoredValue(layer, pixelIndex);
      }
      return output;
    }

    function createExpandedLayerIndices(layer, width, height, paletteOverride = null) {
      const size = Math.max(0, Math.floor(Number(width) || 0))
        * Math.max(0, Math.floor(Number(height) || 0));
      const output = new Int16Array(size).fill(-1);
      if (isRuntimeUint8LayerIndices(layer, size)) {
        for (let pixelIndex = 0; pixelIndex < size; pixelIndex += 1) {
          output[pixelIndex] = layer.indices[pixelIndex] === 0 ? -1 : layer.indices[pixelIndex];
        }
      } else if (isCompactLayerIndices(layer, size)) {
        for (let pixelIndex = 0; pixelIndex < size; pixelIndex += 1) {
          output[pixelIndex] = layer.indices[pixelIndex] === 0 ? -1 : layer.indices[pixelIndex] - 1;
        }
      } else if (isTiledLayerIndices(layer, size)) {
        for (let pixelIndex = 0; pixelIndex < size; pixelIndex += 1) {
          const stored = getTiledLayerStoredValue(layer, pixelIndex);
          output[pixelIndex] = stored === 0 ? -1 : stored - 1;
        }
      } else if (layer?.indices instanceof Int16Array && layer.indices.length > 0) {
        output.set(layer.indices.subarray(0, Math.min(output.length, layer.indices.length)));
      }
      return output;
    }

    function materializeLayerIndices(layer, width, height, paletteOverride = null) {
      if (!layer || isSimulationLayer(layer)) {
        return null;
      }
      const size = Math.max(0, Math.floor(Number(width) || 0))
        * Math.max(0, Math.floor(Number(height) || 0));
      if (layer.indices instanceof Int16Array && layer.indices.length === size) {
        return layer.indices;
      }
      if (isRuntimeUint8LayerIndices(layer, size)) {
        return layer.indices;
      }
      if (layer.indicesEncoding === RUNTIME_LAYER_INDEX_ENCODING && layer.indices instanceof Uint8Array) {
        const indices = new Uint8Array(size);
        indices.set(layer.indices.subarray(0, Math.min(size, layer.indices.length)));
        layer.indices = indices;
        return indices;
      }
      const indices = createExpandedLayerIndices(layer, width, height, paletteOverride);
      layer.indices = indices;
      delete layer.indicesEncoding;
      clearTiledLayerIndexMetadata(layer);
      return indices;
    }

    function cloneStoredLayerIndices(layer, { clonePixelData = true } = {}) {
      if (isTiledLayerIndices(layer)) {
        return new Uint8Array(0);
      }
      if (isCompactLayerIndices(layer)) {
        return clonePixelData ? new Uint8Array(layer.indices) : layer.indices;
      }
      if (isRuntimeUint8LayerIndices(layer)) {
        return clonePixelData ? new Uint8Array(layer.indices) : layer.indices;
      }
      if (layer?.indices instanceof Int16Array) {
        return clonePixelData ? new Int16Array(layer.indices) : layer.indices;
      }
      if (Array.isArray(layer?.indices)) {
        return new Int16Array(layer.indices);
      }
      return new Int16Array(0);
    }

    function copyTiledLayerIndexMetadata(source, target, { clonePixelData = true } = {}) {
      if (!isTiledLayerIndices(source) || !target) {
        return false;
      }
      const clonedTiles = clonePixelData
        ? source.indicesTiles.map(tile => new Uint8Array(tile))
        : source.indicesTiles.slice();
      target.indicesEncoding = TILED_LAYER_INDEX_ENCODING;
      target.indicesTiles = clonedTiles;
      target.indicesWidth = source.indicesWidth;
      target.indicesHeight = source.indicesHeight;
      target.indicesTileSize = source.indicesTileSize;
      return true;
    }

    function ensureLayerDirect(layer, width = state.width, height = state.height) {
      const length = Math.max(0, Math.floor(width) || 0) * Math.max(0, Math.floor(height) || 0) * 4;
      if (!(layer.direct instanceof Uint8ClampedArray) || layer.direct.length !== length) {
        layer.direct = new Uint8ClampedArray(length);
      }
      return layer.direct;
    }

    // `direct` is the runtime source of truth. Older payloads may contain
    // only importSourceDirect; promote that legacy fallback once at ingress
    // without discarding it, so old snapshots remain representable.
    function promoteLegacyImportSourceDirect(direct, importSourceDirect, length) {
      if (direct instanceof Uint8ClampedArray && direct.length === length) {
        return direct;
      }
      if (importSourceDirect instanceof Uint8ClampedArray && importSourceDirect.length === length) {
        return new Uint8ClampedArray(importSourceDirect);
      }
      return direct instanceof Uint8ClampedArray ? direct : null;
    }

    function isSimulationLayer(layer) {
      return Boolean(layer && layer.type === 'simulation' && layer.elementMap instanceof Uint8Array);
    }

    function cloneSimulationColor(color, fallback = { r: 0, g: 0, b: 0, a: 255 }) {
      const source = color && typeof color === 'object' ? color : fallback;
      return {
        r: clamp(Math.round(Number(source.r) || 0), 0, 255),
        g: clamp(Math.round(Number(source.g) || 0), 0, 255),
        b: clamp(Math.round(Number(source.b) || 0), 0, 255),
        a: clamp(Math.round(Number(source.a) || 255), 0, 255),
      };
    }

    function normalizeSimulationDisplayMode(value, fallback = SIM_SOURCE_COLOR) {
      return value === SIM_ELEMENT_PALETTE || value === SIM_MIXED || value === SIM_SOURCE_COLOR
        ? value
        : fallback;
    }

    function normalizeSimulationStyle(element, style) {
      const defaults = SIM_DEFAULT_STYLE[element] || {
        displayMode: SIM_SOURCE_COLOR,
        mixStrength: 0,
        palette: {},
      };
      const next = style && typeof style === 'object' ? style : defaults;
      const normalized = {
        displayMode: normalizeSimulationDisplayMode(next.displayMode, defaults.displayMode),
        mixStrength: clamp(Number.isFinite(Number(next.mixStrength)) ? Number(next.mixStrength) : defaults.mixStrength, 0, 1),
        palette: {},
      };
      Object.keys(defaults.palette || {}).forEach(key => {
        normalized.palette[key] = cloneSimulationColor(next.palette?.[key], defaults.palette[key]);
      });
      return normalized;
    }

    function normalizeSimulationSettings(settings = {}) {
      const source = settings && typeof settings === 'object' ? settings : {};
      return {
        gravityX: clamp(Math.round(Number(source.gravityX) || SIM_DEFAULT_SETTINGS.gravityX), -1, 1),
        gravityY: clamp(Math.round(Number(source.gravityY) || SIM_DEFAULT_SETTINGS.gravityY), -1, 1),
        windX: clamp(Math.round(Number(source.windX) || SIM_DEFAULT_SETTINGS.windX), -2, 2),
        windY: clamp(Math.round(Number(source.windY) || SIM_DEFAULT_SETTINGS.windY), -2, 2),
        tickRate: clamp(Math.round(Number(source.tickRate) || SIM_DEFAULT_SETTINGS.tickRate), 1, 60),
        lightingEnabled: source.lightingEnabled !== false,
        atmosphereEnabled: source.atmosphereEnabled !== false,
        fireEffectEnabled: source.fireEffectEnabled !== false,
        waterEffectEnabled: source.waterEffectEnabled !== false,
        metalReflectionEnabled: source.metalReflectionEnabled !== false,
        fogColor: cloneSimulationColor(source.fogColor, SIM_DEFAULT_SETTINGS.fogColor),
        atmosphereStrength: clamp(
          Number.isFinite(Number(source.atmosphereStrength)) ? Number(source.atmosphereStrength) : SIM_DEFAULT_SETTINGS.atmosphereStrength,
          0,
          1
        ),
      };
    }

    function createSimulationLayer(name, width, height) {
      const size = Math.max(1, Math.floor(width) || 1) * Math.max(1, Math.floor(height) || 1);
      return {
        id: crypto.randomUUID ? crypto.randomUUID() : `layer-${Math.random().toString(36).slice(2)}`,
        type: SIM_LAYER_TYPE,
        name,
        visible: true,
        opacity: 1,
        blendMode: DEFAULT_LAYER_BLEND_MODE,
        elementMap: new Uint8Array(size),
        sourceColorMap: new Uint8ClampedArray(size * 4),
        velXMap: new Int8Array(size),
        velYMap: new Int8Array(size),
        lifeMap: new Uint8Array(size),
        tempMap: new Uint16Array(size),
        lightMap: new Uint8Array(size),
        depthMap: new Uint8Array(size),
        airMap: new Uint8Array(size),
        auxMap: new Uint8Array(size),
        activeMap: new Uint8Array(size),
        settings: normalizeSimulationSettings(),
        elementStyle: {
          [SIM_ELEMENT_WATER]: normalizeSimulationStyle(SIM_ELEMENT_WATER),
          [SIM_ELEMENT_FIRE]: normalizeSimulationStyle(SIM_ELEMENT_FIRE),
          [SIM_ELEMENT_METAL]: normalizeSimulationStyle(SIM_ELEMENT_METAL),
          [SIM_ELEMENT_SMOKE]: normalizeSimulationStyle(SIM_ELEMENT_SMOKE),
          [SIM_ELEMENT_LIGHT]: normalizeSimulationStyle(SIM_ELEMENT_LIGHT),
        },
      };
    }

    function cloneSimulationLayer(baseLayer, width, height, { copyPixels = true } = {}) {
      const layer = createSimulationLayer(baseLayer?.name || getDefaultLayerName(1), width, height);
      layer.visible = baseLayer?.visible !== false;
      layer.opacity = normalizeLayerOpacity(baseLayer?.opacity);
      layer.blendMode = normalizeLayerBlendMode(baseLayer?.blendMode);
      layer.settings = normalizeSimulationSettings(baseLayer?.settings);
      layer.elementStyle = {
        [SIM_ELEMENT_WATER]: normalizeSimulationStyle(SIM_ELEMENT_WATER, baseLayer?.elementStyle?.[SIM_ELEMENT_WATER]),
        [SIM_ELEMENT_FIRE]: normalizeSimulationStyle(SIM_ELEMENT_FIRE, baseLayer?.elementStyle?.[SIM_ELEMENT_FIRE]),
        [SIM_ELEMENT_METAL]: normalizeSimulationStyle(SIM_ELEMENT_METAL, baseLayer?.elementStyle?.[SIM_ELEMENT_METAL]),
        [SIM_ELEMENT_SMOKE]: normalizeSimulationStyle(SIM_ELEMENT_SMOKE, baseLayer?.elementStyle?.[SIM_ELEMENT_SMOKE]),
        [SIM_ELEMENT_LIGHT]: normalizeSimulationStyle(SIM_ELEMENT_LIGHT, baseLayer?.elementStyle?.[SIM_ELEMENT_LIGHT]),
      };
      if (!copyPixels) {
        return layer;
      }
      [
        'elementMap',
        'sourceColorMap',
        'velXMap',
        'velYMap',
        'lifeMap',
        'tempMap',
        'lightMap',
        'depthMap',
        'airMap',
        'auxMap',
        'activeMap',
      ].forEach(key => {
        if (ArrayBuffer.isView(baseLayer?.[key]) && baseLayer[key].length === layer[key].length) {
          layer[key].set(baseLayer[key]);
        }
      });
      return layer;
    }

    function cloneGenericLayer(baseLayer, width, height, options = {}) {
      return isSimulationLayer(baseLayer)
        ? cloneSimulationLayer(baseLayer, width, height, options)
        : cloneLayer(baseLayer, width, height, options);
    }

    function createGenericLayerFromSnapshot(snapshot, width, height) {
      if (snapshot?.type === SIM_LAYER_TYPE) {
        const layer = createSimulationLayer(snapshot.name || getDefaultLayerName(1), width, height);
        layer.visible = snapshot?.visible !== false;
        layer.opacity = normalizeLayerOpacity(snapshot?.opacity);
        layer.blendMode = normalizeLayerBlendMode(snapshot?.blendMode);
        [
          'elementMap',
          'sourceColorMap',
          'velXMap',
          'velYMap',
          'lifeMap',
          'tempMap',
          'lightMap',
          'depthMap',
          'airMap',
          'auxMap',
          'activeMap',
        ].forEach(key => {
          if (ArrayBuffer.isView(snapshot?.[key]) && snapshot[key].length === layer[key].length) {
            layer[key].set(snapshot[key]);
          }
        });
        layer.settings = normalizeSimulationSettings(snapshot?.settings);
        layer.elementStyle = {
          [SIM_ELEMENT_WATER]: normalizeSimulationStyle(SIM_ELEMENT_WATER, snapshot?.elementStyle?.[SIM_ELEMENT_WATER]),
          [SIM_ELEMENT_FIRE]: normalizeSimulationStyle(SIM_ELEMENT_FIRE, snapshot?.elementStyle?.[SIM_ELEMENT_FIRE]),
          [SIM_ELEMENT_METAL]: normalizeSimulationStyle(SIM_ELEMENT_METAL, snapshot?.elementStyle?.[SIM_ELEMENT_METAL]),
          [SIM_ELEMENT_SMOKE]: normalizeSimulationStyle(SIM_ELEMENT_SMOKE, snapshot?.elementStyle?.[SIM_ELEMENT_SMOKE]),
          [SIM_ELEMENT_LIGHT]: normalizeSimulationStyle(SIM_ELEMENT_LIGHT, snapshot?.elementStyle?.[SIM_ELEMENT_LIGHT]),
        };
        return layer;
      }
      return createLayerFromClipboardSnapshot(snapshot, width, height);
    }

    function cloneLayer(baseLayer, width, height, { copyPixels = true } = {}) {
      if (isSimulationLayer(baseLayer)) {
        return cloneSimulationLayer(baseLayer, width, height, { copyPixels });
      }
      const size = width * height;
      const useRuntimeUint8 = isRuntimeUint8LayerIndices(baseLayer)
        || baseLayer?.indicesEncoding === RUNTIME_LAYER_INDEX_ENCODING;
      const layer = {
        id: crypto.randomUUID ? crypto.randomUUID() : `layer-${Math.random().toString(36).slice(2)}`,
        name: baseLayer.name,
        visible: baseLayer.visible,
        opacity: normalizeLayerOpacity(baseLayer.opacity),
        blendMode: normalizeLayerBlendMode(baseLayer.blendMode),
        indices: useRuntimeUint8 ? new Uint8Array(size) : new Int16Array(size).fill(-1),
        ...(useRuntimeUint8 ? { indicesEncoding: RUNTIME_LAYER_INDEX_ENCODING } : {}),
        direct: null,
        directOnly: Boolean(baseLayer.directOnly),
      };
      if (copyPixels && baseLayer.indices instanceof Int16Array) {
        layer.indices.set(baseLayer.indices);
      } else if (copyPixels && useRuntimeUint8 && baseLayer.indices instanceof Uint8Array) {
        layer.indices.set(baseLayer.indices);
      }
      const directSource = baseLayer.direct instanceof Uint8ClampedArray
        ? baseLayer.direct
        : (baseLayer.importSourceDirect instanceof Uint8ClampedArray ? baseLayer.importSourceDirect : null);
      if (copyPixels && directSource instanceof Uint8ClampedArray) {
        const direct = ensureLayerDirect(layer, width, height);
        direct.set(directSource.subarray(0, Math.min(direct.length, directSource.length)));
      }
      return layer;
    }

    function resizeProjectCanvasFrames(canvasDoc, width, height) {
      if (!canvasDoc || !Array.isArray(canvasDoc.frames)) {
        return false;
      }
      const targetWidth = Math.max(1, Math.round(Number(width) || 1));
      const targetHeight = Math.max(1, Math.round(Number(height) || 1));
      const sourceWidth = Math.max(1, Math.round(Number(canvasDoc.width) || 1));
      const sourceHeight = Math.max(1, Math.round(Number(canvasDoc.height) || 1));
      if (sourceWidth === targetWidth && sourceHeight === targetHeight) {
        return false;
      }
      canvasDoc.frames = canvasDoc.frames.map(frame => {
        if (!frame || !Array.isArray(frame.layers)) {
          return frame;
        }
        return {
          ...frame,
          layers: frame.layers.map(layer => {
            if (isSimulationLayer(layer)) {
              const resizedSimulation = createSimulationLayer(layer?.name || getDefaultLayerName(1), targetWidth, targetHeight);
              resizedSimulation.id = layer?.id || resizedSimulation.id;
              resizedSimulation.visible = layer?.visible !== false;
              resizedSimulation.opacity = normalizeLayerOpacity(layer?.opacity);
              resizedSimulation.blendMode = normalizeLayerBlendMode(layer?.blendMode);
              resizedSimulation.settings = normalizeSimulationSettings(layer?.settings);
              resizedSimulation.elementStyle = {
                [SIM_ELEMENT_WATER]: normalizeSimulationStyle(SIM_ELEMENT_WATER, layer?.elementStyle?.[SIM_ELEMENT_WATER]),
                [SIM_ELEMENT_FIRE]: normalizeSimulationStyle(SIM_ELEMENT_FIRE, layer?.elementStyle?.[SIM_ELEMENT_FIRE]),
                [SIM_ELEMENT_METAL]: normalizeSimulationStyle(SIM_ELEMENT_METAL, layer?.elementStyle?.[SIM_ELEMENT_METAL]),
                [SIM_ELEMENT_SMOKE]: normalizeSimulationStyle(SIM_ELEMENT_SMOKE, layer?.elementStyle?.[SIM_ELEMENT_SMOKE]),
                [SIM_ELEMENT_LIGHT]: normalizeSimulationStyle(SIM_ELEMENT_LIGHT, layer?.elementStyle?.[SIM_ELEMENT_LIGHT]),
              };
              const copyWidth = Math.min(sourceWidth, targetWidth);
              const copyHeight = Math.min(sourceHeight, targetHeight);
              const simKeys = ['elementMap', 'velXMap', 'velYMap', 'lifeMap', 'tempMap', 'lightMap', 'depthMap', 'airMap', 'auxMap', 'activeMap'];
              for (let y = 0; y < copyHeight; y += 1) {
                for (let x = 0; x < copyWidth; x += 1) {
                  const srcIndex = (y * sourceWidth) + x;
                  const dstIndex = (y * targetWidth) + x;
                  const srcBase = srcIndex * 4;
                  const dstBase = dstIndex * 4;
                  if (layer?.sourceColorMap instanceof Uint8ClampedArray && srcBase + 3 < layer.sourceColorMap.length) {
                    resizedSimulation.sourceColorMap[dstBase] = layer.sourceColorMap[srcBase];
                    resizedSimulation.sourceColorMap[dstBase + 1] = layer.sourceColorMap[srcBase + 1];
                    resizedSimulation.sourceColorMap[dstBase + 2] = layer.sourceColorMap[srcBase + 2];
                    resizedSimulation.sourceColorMap[dstBase + 3] = layer.sourceColorMap[srcBase + 3];
                  }
                  for (let i = 0; i < simKeys.length; i += 1) {
                    const key = simKeys[i];
                    const source = ArrayBuffer.isView(layer?.[key]) ? layer[key] : null;
                    if (source && srcIndex < source.length) {
                      resizedSimulation[key][dstIndex] = source[srcIndex];
                    }
                  }
                }
              }
              return resizedSimulation;
            }
            const resized = createLayer(layer?.name || getDefaultLayerName(1), targetWidth, targetHeight);
            resized.id = layer?.id || resized.id;
            resized.visible = layer?.visible !== false;
            resized.opacity = normalizeLayerOpacity(layer?.opacity);
            resized.blendMode = normalizeLayerBlendMode(layer?.blendMode);
            const sourceIndices = layer?.indices instanceof Int16Array || layer?.indices instanceof Uint8Array
              ? layer.indices
              : null;
            const transparentValue = isRuntimeUint8LayerIndices(resized) ? 0 : -1;
            const sourceDirect = layer?.direct instanceof Uint8ClampedArray ? layer.direct : null;
            const targetDirect = sourceDirect ? ensureLayerDirect(resized, targetWidth, targetHeight) : null;
            const copyWidth = Math.min(sourceWidth, targetWidth);
            const copyHeight = Math.min(sourceHeight, targetHeight);
            for (let y = 0; y < copyHeight; y += 1) {
              for (let x = 0; x < copyWidth; x += 1) {
                const srcIndex = (y * sourceWidth) + x;
                const dstIndex = (y * targetWidth) + x;
                resized.indices[dstIndex] = sourceIndices && srcIndex < sourceIndices.length
                  ? sourceIndices[srcIndex]
                  : transparentValue;
                if (sourceDirect && targetDirect) {
                  const srcBase = srcIndex * 4;
                  const dstBase = dstIndex * 4;
                  if (srcBase + 3 < sourceDirect.length) {
                    targetDirect[dstBase] = sourceDirect[srcBase];
                    targetDirect[dstBase + 1] = sourceDirect[srcBase + 1];
                    targetDirect[dstBase + 2] = sourceDirect[srcBase + 2];
                    targetDirect[dstBase + 3] = sourceDirect[srcBase + 3];
                  }
                }
              }
            }
            return resized;
          }),
        };
      });
      canvasDoc.width = targetWidth;
      canvasDoc.height = targetHeight;
      return true;
    }

    function createFrame(name, layers, width, height, options = {}) {
      const { copyPixels = true } = options || {};
      return {
        id: crypto.randomUUID ? crypto.randomUUID() : `frame-${Math.random().toString(36).slice(2)}`,
        name,
        duration: 1000 / 12,
        voxelPreviewYawDeg: VOXEL_EXTENSION_DEFAULT_YAW_DEG,
        voxelPreviewPitchDeg: VOXEL_EXTENSION_PREVIEW_ELEVATION_DEG,
        layers: layers.map(layer => cloneLayer(layer, width ?? state.width, height ?? state.height, { copyPixels })),
      };
    }

    function snapshotLayerForClipboard(layer, width = state.width, height = state.height) {
      if (!layer) {
        return null;
      }
      if (isSimulationLayer(layer)) {
        const sim = createSimulationLayer(typeof layer.name === 'string' ? layer.name : getDefaultLayerName(1), width, height);
        sim.visible = layer.visible !== false;
        sim.opacity = normalizeLayerOpacity(layer.opacity);
        sim.blendMode = normalizeLayerBlendMode(layer.blendMode);
        [
          'elementMap',
          'sourceColorMap',
          'velXMap',
          'velYMap',
          'lifeMap',
          'tempMap',
          'lightMap',
          'depthMap',
          'airMap',
          'auxMap',
          'activeMap',
        ].forEach(key => {
          if (ArrayBuffer.isView(layer[key]) && layer[key].length === sim[key].length) {
            sim[key].set(layer[key]);
          }
        });
        sim.settings = normalizeSimulationSettings(layer.settings);
        sim.elementStyle = {
          [SIM_ELEMENT_WATER]: normalizeSimulationStyle(SIM_ELEMENT_WATER, layer?.elementStyle?.[SIM_ELEMENT_WATER]),
          [SIM_ELEMENT_FIRE]: normalizeSimulationStyle(SIM_ELEMENT_FIRE, layer?.elementStyle?.[SIM_ELEMENT_FIRE]),
          [SIM_ELEMENT_METAL]: normalizeSimulationStyle(SIM_ELEMENT_METAL, layer?.elementStyle?.[SIM_ELEMENT_METAL]),
          [SIM_ELEMENT_SMOKE]: normalizeSimulationStyle(SIM_ELEMENT_SMOKE, layer?.elementStyle?.[SIM_ELEMENT_SMOKE]),
          [SIM_ELEMENT_LIGHT]: normalizeSimulationStyle(SIM_ELEMENT_LIGHT, layer?.elementStyle?.[SIM_ELEMENT_LIGHT]),
        };
        return sim;
      }
      const size = Math.max(0, Math.floor(width) || 0) * Math.max(0, Math.floor(height) || 0);
      const runtimeUint8 = isRuntimeUint8LayerIndices(layer);
      const indices = runtimeUint8 ? new Uint8Array(size) : new Int16Array(size).fill(-1);
      if (layer.indices instanceof Int16Array || layer.indices instanceof Uint8Array) {
        indices.set(layer.indices.subarray(0, Math.min(indices.length, layer.indices.length)));
      }
      let direct = null;
      if (layer.direct instanceof Uint8ClampedArray) {
        direct = new Uint8ClampedArray(size * 4);
        direct.set(layer.direct.subarray(0, Math.min(direct.length, layer.direct.length)));
      }
      let importSourceDirect = null;
      if (layer.importSourceDirect instanceof Uint8ClampedArray) {
        importSourceDirect = new Uint8ClampedArray(size * 4);
        importSourceDirect.set(layer.importSourceDirect.subarray(0, Math.min(importSourceDirect.length, layer.importSourceDirect.length)));
      }
      direct = promoteLegacyImportSourceDirect(direct, importSourceDirect, size * 4);
      return {
        name: typeof layer.name === 'string' ? layer.name : getDefaultLayerName(1),
        visible: layer.visible !== false,
        opacity: normalizeLayerOpacity(layer.opacity),
        blendMode: normalizeLayerBlendMode(layer.blendMode),
        indices,
        ...(runtimeUint8 ? { indicesEncoding: RUNTIME_LAYER_INDEX_ENCODING } : {}),
        direct,
        importSourceDirect,
        directOnly: Boolean(layer.directOnly),
      };
    }

    function createLayerFromClipboardSnapshot(snapshot, width = state.width, height = state.height) {
      if (snapshot?.type === SIM_LAYER_TYPE) {
        return createGenericLayerFromSnapshot(snapshot, width, height);
      }
      const layerName = typeof snapshot?.name === 'string' && snapshot.name.trim()
        ? snapshot.name.trim()
        : getDefaultLayerName(1);
      const layer = createLayer(layerName, width, height);
      layer.visible = snapshot?.visible !== false;
      layer.opacity = normalizeLayerOpacity(snapshot?.opacity);
      layer.blendMode = normalizeLayerBlendMode(snapshot?.blendMode);
      if (snapshot?.indices instanceof Int16Array || snapshot?.indices instanceof Uint8Array) {
        const sourceIndices = snapshot.indices;
        if (layer.indices instanceof Uint8Array && sourceIndices instanceof Int16Array) {
          for (let index = 0; index < Math.min(layer.indices.length, sourceIndices.length); index += 1) {
            layer.indices[index] = sourceIndices[index] >= 0 ? sourceIndices[index] : 0;
          }
        } else {
          layer.indices.set(sourceIndices.subarray(0, Math.min(layer.indices.length, sourceIndices.length)));
        }
      }
      if (snapshot?.direct instanceof Uint8ClampedArray) {
        const direct = ensureLayerDirect(layer, width, height);
        direct.set(snapshot.direct.subarray(0, Math.min(direct.length, snapshot.direct.length)));
        layer.directOnly = inferDirectOnlyLayer(snapshot, snapshot.indices, direct);
      }
      if (snapshot?.importSourceDirect instanceof Uint8ClampedArray) {
        layer.importSourceDirect = new Uint8ClampedArray(width * height * 4);
        layer.importSourceDirect.set(snapshot.importSourceDirect.subarray(0, Math.min(layer.importSourceDirect.length, snapshot.importSourceDirect.length)));
      }
      layer.direct = promoteLegacyImportSourceDirect(layer.direct, layer.importSourceDirect, width * height * 4);
      return layer;
    }

    function snapshotFrameForClipboard(frame, width = state.width, height = state.height) {
      if (!frame || !Array.isArray(frame.layers)) {
        return null;
      }
      return {
        name: typeof frame.name === 'string' ? frame.name : getDefaultFrameName(1),
        duration: Number.isFinite(frame.duration) && frame.duration > 0 ? frame.duration : (1000 / 12),
        voxelPreviewYawDeg: normalizeVoxelPreviewYawDegrees(frame?.voxelPreviewYawDeg),
        voxelPreviewPitchDeg: normalizeVoxelPreviewPitchDegrees(frame?.voxelPreviewPitchDeg),
        layers: frame.layers.map(layer => snapshotLayerForClipboard(layer, width, height)),
      };
    }

    function createFrameFromClipboardSnapshot(snapshot, width = state.width, height = state.height) {
      const frameName = typeof snapshot?.name === 'string' && snapshot.name.trim()
        ? snapshot.name.trim()
        : getDefaultFrameName(1);
      const layers = Array.isArray(snapshot?.layers) && snapshot.layers.length
        ? snapshot.layers.map(layer => createLayerFromClipboardSnapshot(layer, width, height))
        : [createLayer(getDefaultLayerName(1), width, height)];
      return {
        id: crypto.randomUUID ? crypto.randomUUID() : `frame-${Math.random().toString(36).slice(2)}`,
        name: frameName,
        duration: Number.isFinite(snapshot?.duration) && snapshot.duration > 0 ? snapshot.duration : (1000 / 12),
        voxelPreviewYawDeg: normalizeVoxelPreviewYawDegrees(snapshot?.voxelPreviewYawDeg),
        voxelPreviewPitchDeg: normalizeVoxelPreviewPitchDegrees(snapshot?.voxelPreviewPitchDeg),
        layers,
      };
    }

    function getDefaultProjectCanvasName(index = 1) {
      const safeIndex = Math.max(1, Math.round(Number(index) || 1));
      return `Canvas ${safeIndex}`;
    }

    function cloneCanvasDocumentFrames(frames, width, height, { clonePixelData = true } = {}) {
      if (!Array.isArray(frames) || !frames.length) {
        const fallbackLayer = createLayer(getDefaultLayerName(1), width, height);
        return [createFrame(getDefaultFrameName(1), [fallbackLayer], width, height, { copyPixels: false })];
      }
      return frames.map((frame, frameIndex) => ({
        id: typeof frame?.id === 'string' && frame.id ? frame.id : `frame-${frameIndex + 1}`,
        name: typeof frame?.name === 'string' ? frame.name : getDefaultFrameName(frameIndex + 1),
        duration: clamp(Number(frame?.duration) || (1000 / 12), 16, 2000),
        layers: Array.isArray(frame?.layers) && frame.layers.length
          ? frame.layers.map((layer, layerIndex) => {
            const nextLayer = createLayer(
              typeof layer?.name === 'string' ? layer.name : getDefaultLayerName(layerIndex + 1),
              width,
              height
            );
            nextLayer.id = typeof layer?.id === 'string' && layer.id
              ? layer.id
              : (crypto.randomUUID ? crypto.randomUUID() : `layer-${Math.random().toString(36).slice(2)}`);
            if (isSimulationLayer(layer)) {
              return cloneSimulationLayer(layer, width, height, { copyPixels: clonePixelData });
            }
	          nextLayer.visible = layer?.visible !== false;
	          nextLayer.opacity = normalizeLayerOpacity(layer?.opacity);
	          nextLayer.blendMode = normalizeLayerBlendMode(layer?.blendMode);
	          nextLayer.directOnly = Boolean(layer?.directOnly);
            if (isTiledLayerIndices(layer)) {
              nextLayer.indices = cloneStoredLayerIndices(layer, { clonePixelData });
              copyTiledLayerIndexMetadata(layer, nextLayer, { clonePixelData });
            } else if (isCompactLayerIndices(layer)) {
              nextLayer.indices = cloneStoredLayerIndices(layer, { clonePixelData });
              nextLayer.indicesEncoding = COMPACT_LAYER_INDEX_ENCODING;
            } else if (isRuntimeUint8LayerIndices(layer)) {
              nextLayer.indices = cloneStoredLayerIndices(layer, { clonePixelData });
              nextLayer.indicesEncoding = RUNTIME_LAYER_INDEX_ENCODING;
            } else if (clonePixelData && layer?.indices instanceof Int16Array) {
              nextLayer.indices.set(layer.indices.subarray(0, Math.min(nextLayer.indices.length, layer.indices.length)));
            } else if (!clonePixelData && layer?.indices instanceof Int16Array) {
              nextLayer.indices = layer.indices;
            } else if (!clonePixelData && Array.isArray(layer?.indices)) {
              nextLayer.indices = new Int16Array(layer.indices);
            }
            if (clonePixelData && layer?.direct instanceof Uint8ClampedArray) {
              const direct = ensureLayerDirect(nextLayer, width, height);
              direct.set(layer.direct.subarray(0, Math.min(direct.length, layer.direct.length)));
            } else if (!clonePixelData && layer?.direct instanceof Uint8ClampedArray) {
              nextLayer.direct = layer.direct;
            } else if (!clonePixelData && Array.isArray(layer?.direct)) {
              nextLayer.direct = new Uint8ClampedArray(layer.direct);
            }
            if (clonePixelData && layer?.importSourceDirect instanceof Uint8ClampedArray) {
              nextLayer.importSourceDirect = new Uint8ClampedArray(width * height * 4);
              nextLayer.importSourceDirect.set(layer.importSourceDirect.subarray(0, Math.min(nextLayer.importSourceDirect.length, layer.importSourceDirect.length)));
            } else if (!clonePixelData && layer?.importSourceDirect instanceof Uint8ClampedArray) {
              nextLayer.importSourceDirect = layer.importSourceDirect;
            }
            nextLayer.direct = promoteLegacyImportSourceDirect(nextLayer.direct, nextLayer.importSourceDirect, width * height * 4);
            return nextLayer;
          })
          : [createLayer(getDefaultLayerName(1), width, height)],
      }));
    }

    function cloneLayerForSnapshot(layer, { clonePixelData = true } = {}) {
      if (isSimulationLayer(layer)) {
        return cloneSimulationLayer(layer, state.width, state.height, { copyPixels: clonePixelData });
      }
      const compactIndices = isCompactLayerIndices(layer);
      const tiledIndices = isTiledLayerIndices(layer);
      const runtimeUint8Indices = isRuntimeUint8LayerIndices(layer);
      const clonedLayer = {
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        opacity: normalizeLayerOpacity(layer.opacity),
	      blendMode: normalizeLayerBlendMode(layer.blendMode),
	      indices: cloneStoredLayerIndices(layer, { clonePixelData }),
	      ...(compactIndices ? { indicesEncoding: COMPACT_LAYER_INDEX_ENCODING } : {}),
	      ...(runtimeUint8Indices ? { indicesEncoding: RUNTIME_LAYER_INDEX_ENCODING } : {}),
	      direct: null,
	      directOnly: Boolean(layer.directOnly),
      };
      if (tiledIndices) {
        copyTiledLayerIndexMetadata(layer, clonedLayer, { clonePixelData });
      }
      if (layer.direct instanceof Uint8ClampedArray) {
        clonedLayer.direct = clonePixelData ? new Uint8ClampedArray(layer.direct) : layer.direct;
      } else if (ArrayBuffer.isView(layer.direct)) {
        clonedLayer.direct = new Uint8ClampedArray(layer.direct.buffer.slice(0));
      }
      if (layer.importSourceDirect instanceof Uint8ClampedArray) {
        clonedLayer.importSourceDirect = clonePixelData ? new Uint8ClampedArray(layer.importSourceDirect) : layer.importSourceDirect;
      }
      clonedLayer.direct = promoteLegacyImportSourceDirect(clonedLayer.direct, clonedLayer.importSourceDirect, state.width * state.height * 4);
      return clonedLayer;
    }

    function serializeSimulationStyleForDocument(style) {
      return JSON.stringify({
        displayMode: normalizeSimulationDisplayMode(style?.displayMode, SIM_SOURCE_COLOR),
        mixStrength: clamp(Number(style?.mixStrength), 0, 1),
        palette: style?.palette || {},
      });
    }

    function parseSimulationStyleFromDocument(value, element) {
      try {
        return normalizeSimulationStyle(element, typeof value === 'string' ? JSON.parse(value) : value);
      } catch (error) {
        return normalizeSimulationStyle(element);
      }
    }

    function hasOnlyEmptyLayerIndices(indices) {
      if (!(indices instanceof Int16Array || indices instanceof Uint8Array)) {
        return false;
      }
      if (indices.length === 0) {
        return true;
      }
      for (let i = 0; i < indices.length; i += 1) {
        if (indices instanceof Uint8Array ? indices[i] !== 0 : indices[i] >= 0) {
          return false;
        }
      }
      return true;
    }

    function inferDirectOnlyLayer(layer, indices, direct) {
      return direct instanceof Uint8ClampedArray
        && direct.length > 0
        && hasOnlyEmptyLayerIndices(indices);
    }

    function frameListHasDirectPixelData(frames) {
      if (!Array.isArray(frames)) {
        return false;
      }
      return frames.some(frame => Array.isArray(frame?.layers) && frame.layers.some(layer => (
        layer?.direct instanceof Uint8ClampedArray && layer.direct.length > 0
      )));
    }

    function serializeLayerTypedArray(value, { preserveTypedArrays = false } = {}) {
      if (!value) {
        return preserveTypedArrays ? null : '';
      }
      if (preserveTypedArrays && ArrayBuffer.isView(value)) {
        return value;
      }
      return encodeTypedArray(value);
    }

    function serializeLayerForDocument(layer, options = {}) {
      const preserveTypedArrays = options?.preserveTypedArrays === true;
      const compactIndicesForStorage = preserveTypedArrays && options?.compactIndicesForStorage === true;
      if (isSimulationLayer(layer)) {
        return {
          id: layer.id,
          type: SIM_LAYER_TYPE,
          name: layer.name,
          visible: layer.visible !== false,
          opacity: normalizeLayerOpacity(layer.opacity),
          blendMode: normalizeLayerBlendMode(layer.blendMode),
          elementMap: serializeLayerTypedArray(layer.elementMap, { preserveTypedArrays }),
          sourceColorMap: serializeLayerTypedArray(layer.sourceColorMap, { preserveTypedArrays }),
          velXMap: serializeLayerTypedArray(layer.velXMap, { preserveTypedArrays }),
          velYMap: serializeLayerTypedArray(layer.velYMap, { preserveTypedArrays }),
          lifeMap: serializeLayerTypedArray(layer.lifeMap, { preserveTypedArrays }),
          tempMap: serializeLayerTypedArray(layer.tempMap, { preserveTypedArrays }),
          lightMap: serializeLayerTypedArray(layer.lightMap, { preserveTypedArrays }),
          depthMap: serializeLayerTypedArray(layer.depthMap, { preserveTypedArrays }),
          airMap: serializeLayerTypedArray(layer.airMap, { preserveTypedArrays }),
          auxMap: serializeLayerTypedArray(layer.auxMap, { preserveTypedArrays }),
          activeMap: serializeLayerTypedArray(layer.activeMap, { preserveTypedArrays }),
          settings: JSON.stringify(normalizeSimulationSettings(layer.settings)),
          waterStyle: serializeSimulationStyleForDocument(layer.elementStyle?.[SIM_ELEMENT_WATER]),
          fireStyle: serializeSimulationStyleForDocument(layer.elementStyle?.[SIM_ELEMENT_FIRE]),
          metalStyle: serializeSimulationStyleForDocument(layer.elementStyle?.[SIM_ELEMENT_METAL]),
          smokeStyle: serializeSimulationStyleForDocument(layer.elementStyle?.[SIM_ELEMENT_SMOKE]),
          lightStyle: serializeSimulationStyleForDocument(layer.elementStyle?.[SIM_ELEMENT_LIGHT]),
        };
      }
      const expectedLength = Math.max(0, Math.floor(Number(options?.width) || 0))
        * Math.max(0, Math.floor(Number(options?.height) || 0));
      let serializableIndices = layer.indices;
      const compactIndices = isCompactLayerIndices(layer, expectedLength);
      const tiledIndices = isTiledLayerIndices(layer, expectedLength);
      const runtimeUint8Indices = isRuntimeUint8LayerIndices(layer, expectedLength);
      let createdCompactStorageIndices = false;
      const preserveImplicitTransparency = preserveTypedArrays
        && expectedLength > 0
        && !compactIndices
        && !tiledIndices
        && isImplicitTransparentLayerIndices(layer.indices, expectedLength)
        && !(layer.direct instanceof Uint8ClampedArray)
        && !(layer.importSourceDirect instanceof Uint8ClampedArray);
      if (preserveImplicitTransparency) {
        serializableIndices = null;
      } else if (tiledIndices && preserveTypedArrays) {
        // Checkpoints retain the established contiguous compact encoding.
        // Runtime tile sharing remains untouched and is rebuilt as frames are
        // visited after restore.
        serializableIndices = flattenTiledLayerIndices(layer);
      } else if (runtimeUint8Indices && preserveTypedArrays) {
        serializableIndices = layer.indices;
      } else if (runtimeUint8Indices && !preserveTypedArrays) {
        serializableIndices = createExpandedLayerIndices(
          layer,
          options?.width,
          options?.height,
          Array.isArray(options?.palette) ? options.palette : null
        );
      } else if (compactIndicesForStorage) {
        const compactStorageIndices = createCompactLayerIndicesForStorage(
          layer,
          Array.isArray(options?.palette) ? options.palette : null,
          expectedLength
        );
        if (compactStorageIndices) {
          serializableIndices = compactStorageIndices;
          createdCompactStorageIndices = true;
        }
      } else if (compactIndices && !preserveTypedArrays) {
        serializableIndices = createExpandedLayerIndices(
          layer,
          options?.width,
          options?.height,
          Array.isArray(options?.palette) ? options.palette : null
        );
      } else if (tiledIndices && !preserveTypedArrays) {
        serializableIndices = createExpandedLayerIndices(
          layer,
          options?.width,
          options?.height,
          Array.isArray(options?.palette) ? options.palette : null
        );
      } else if (
        expectedLength > 0
        && !compactIndices
        && !tiledIndices
        && isImplicitTransparentLayerIndices(layer.indices, expectedLength)
      ) {
        serializableIndices = new Int16Array(expectedLength).fill(-1);
      }
      return {
        id: layer.id,
        name: layer.name,
        visible: layer.visible !== false,
        opacity: normalizeLayerOpacity(layer.opacity),
        blendMode: normalizeLayerBlendMode(layer.blendMode),
        indices: serializeLayerTypedArray(serializableIndices, { preserveTypedArrays }),
        ...(preserveImplicitTransparency ? { indicesImplicitTransparent: true } : {}),
        ...((runtimeUint8Indices || layer.indicesEncoding === RUNTIME_LAYER_INDEX_ENCODING) && preserveTypedArrays
          ? { indicesEncoding: RUNTIME_LAYER_INDEX_ENCODING }
          : ((compactIndices || tiledIndices || createdCompactStorageIndices) && preserveTypedArrays
            ? { indicesEncoding: COMPACT_LAYER_INDEX_ENCODING }
            : {})),
        direct: serializeLayerTypedArray(layer.direct, { preserveTypedArrays }),
        importSourceDirect: serializeLayerTypedArray(layer.importSourceDirect, { preserveTypedArrays }),
        directOnly: Boolean(layer.directOnly),
      };
    }

    function deserializeSimulationTypedArray(value, Type, expectedLength, { reuseTypedArrays = false } = {}) {
      if (value instanceof Type && value.length === expectedLength) {
        return reuseTypedArrays ? value : new Type(value);
      }
      if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        if (value.length !== expectedLength) {
          throw new Error('Simulation layer typed array mismatch');
        }
        return new Type(value);
      }
      if (typeof value !== 'string') {
        return new Type(expectedLength);
      }
      const bytes = decodeBase64(value);
      const itemSize = Type.BYTES_PER_ELEMENT || 1;
      if (bytes.length !== expectedLength * itemSize) {
        throw new Error('Simulation layer typed array mismatch');
      }
      const view = new Type(bytes.buffer, bytes.byteOffset, bytes.byteLength / itemSize);
      const output = new Type(view.length);
      output.set(view);
      return output;
    }

    function deserializeRasterTypedArray(value, Type, expectedLength, mismatchMessage, {
      allowMissing = false,
      fillValue = 0,
      reuseTypedArrays = false,
    } = {}) {
      if (typeof value === 'string' && value.length > 0) {
        const bytes = decodeBase64(value);
        const itemSize = Type.BYTES_PER_ELEMENT || 1;
        if (bytes.length !== expectedLength * itemSize) {
          throw new Error(mismatchMessage);
        }
        const aligned = new Uint8Array(bytes.byteLength);
        aligned.set(bytes);
        const view = new Type(aligned.buffer, 0, expectedLength);
        const output = new Type(expectedLength);
        output.set(view);
        return output;
      }
      if (value instanceof Type) {
        if (value.length !== expectedLength) {
          throw new Error(mismatchMessage);
        }
        return reuseTypedArrays ? value : new Type(value);
      }
      if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        if (value.length !== expectedLength) {
          throw new Error(mismatchMessage);
        }
        const output = new Type(expectedLength);
        output.set(value);
        return output;
      }
      if (allowMissing) {
        const output = new Type(expectedLength);
        if (fillValue !== 0) output.fill(fillValue);
        return output;
      }
      throw new Error('Layer is missing index data');
    }

    function deserializeLayerFromDocument(
      layer,
      pixelCount,
      fallbackId,
      fallbackName,
      width = state.width,
      height = state.height,
      options = {}
    ) {
      const reuseTypedArrays = options?.reuseTypedArrays === true;
      const trustStoredLayerFlags = options?.trustStoredLayerFlags === true;
      if (layer?.type === SIM_LAYER_TYPE) {
        const simLayer = createSimulationLayer(fallbackName, width, height);
        simLayer.id = typeof layer.id === 'string' ? layer.id : fallbackId;
        simLayer.name = typeof layer.name === 'string' ? layer.name : fallbackName;
        simLayer.visible = layer.visible !== false;
        simLayer.opacity = normalizeLayerOpacity(layer.opacity);
        simLayer.blendMode = normalizeLayerBlendMode(layer.blendMode);
        const typedOptions = { reuseTypedArrays };
        simLayer.elementMap = deserializeSimulationTypedArray(layer.elementMap, Uint8Array, pixelCount, typedOptions);
        simLayer.sourceColorMap = deserializeSimulationTypedArray(layer.sourceColorMap, Uint8ClampedArray, pixelCount * 4, typedOptions);
        simLayer.velXMap = deserializeSimulationTypedArray(layer.velXMap, Int8Array, pixelCount, typedOptions);
        simLayer.velYMap = deserializeSimulationTypedArray(layer.velYMap, Int8Array, pixelCount, typedOptions);
        simLayer.lifeMap = deserializeSimulationTypedArray(layer.lifeMap, Uint8Array, pixelCount, typedOptions);
        simLayer.tempMap = deserializeSimulationTypedArray(layer.tempMap, Uint16Array, pixelCount, typedOptions);
        simLayer.lightMap = deserializeSimulationTypedArray(layer.lightMap, Uint8Array, pixelCount, typedOptions);
        simLayer.depthMap = deserializeSimulationTypedArray(layer.depthMap, Uint8Array, pixelCount, typedOptions);
        simLayer.airMap = deserializeSimulationTypedArray(layer.airMap, Uint8Array, pixelCount, typedOptions);
        simLayer.auxMap = deserializeSimulationTypedArray(layer.auxMap, Uint8Array, pixelCount, typedOptions);
        simLayer.activeMap = deserializeSimulationTypedArray(layer.activeMap, Uint8Array, pixelCount, typedOptions);
        simLayer.settings = normalizeSimulationSettings(typeof layer.settings === 'string' ? JSON.parse(layer.settings) : layer.settings);
        simLayer.elementStyle = {
          [SIM_ELEMENT_WATER]: parseSimulationStyleFromDocument(layer.waterStyle, SIM_ELEMENT_WATER),
          [SIM_ELEMENT_FIRE]: parseSimulationStyleFromDocument(layer.fireStyle, SIM_ELEMENT_FIRE),
          [SIM_ELEMENT_METAL]: parseSimulationStyleFromDocument(layer.metalStyle, SIM_ELEMENT_METAL),
          [SIM_ELEMENT_SMOKE]: parseSimulationStyleFromDocument(layer.smokeStyle, SIM_ELEMENT_SMOKE),
          [SIM_ELEMENT_LIGHT]: parseSimulationStyleFromDocument(layer.lightStyle, SIM_ELEMENT_LIGHT),
        };
        return simLayer;
      }
      if (!layer || typeof layer !== 'object') {
        throw new Error('Layer is missing index data');
      }
      const hasDirectPayload = (typeof layer.direct === 'string' && layer.direct.length > 0)
        || Array.isArray(layer.direct)
        || ArrayBuffer.isView(layer.direct);
      const hasImplicitTransparentIndices = layer.indicesImplicitTransparent === true && !hasDirectPayload;
      const hasCompactIndices = layer.indicesEncoding === COMPACT_LAYER_INDEX_ENCODING;
      const hasRuntimeUint8Indices = layer.indicesEncoding === RUNTIME_LAYER_INDEX_ENCODING;
      let indices = null;
      if (hasImplicitTransparentIndices) {
        indices = hasRuntimeUint8Indices ? new Uint8Array(0) : new Int16Array(0);
      } else if (hasCompactIndices || hasRuntimeUint8Indices) {
        const compactBytes = typeof layer.indices === 'string'
          ? decodeBase64(layer.indices)
          : layer.indices;
        if (!(compactBytes instanceof Uint8Array) || compactBytes.length !== pixelCount) {
          throw new Error('Layer compact pixel data mismatch');
        }
        indices = reuseTypedArrays && compactBytes instanceof Uint8Array
          ? compactBytes
          : new Uint8Array(compactBytes);
      } else {
        indices = deserializeRasterTypedArray(
            layer.indices,
            Int16Array,
            pixelCount,
            'Layer pixel data mismatch',
            { allowMissing: hasDirectPayload, fillValue: -1, reuseTypedArrays }
          );
      }
      let direct = null;
      if (hasDirectPayload) {
        direct = deserializeRasterTypedArray(
          layer.direct,
          Uint8ClampedArray,
          pixelCount * 4,
          'Layer direct pixel data mismatch',
          { reuseTypedArrays }
        );
      }
      let importSourceDirect = null;
      const hasImportSourcePayload = (typeof layer.importSourceDirect === 'string' && layer.importSourceDirect.length > 0)
        || Array.isArray(layer.importSourceDirect)
        || ArrayBuffer.isView(layer.importSourceDirect);
      if (hasImportSourcePayload) {
        try {
          importSourceDirect = deserializeRasterTypedArray(
            layer.importSourceDirect,
            Uint8ClampedArray,
            pixelCount * 4,
            'Layer import source pixel data mismatch',
            { reuseTypedArrays }
          );
        } catch (_error) {
          importSourceDirect = null;
        }
      }
      direct = promoteLegacyImportSourceDirect(direct, importSourceDirect, pixelCount * 4);
      return {
        id: typeof layer.id === 'string' ? layer.id : fallbackId,
        name: typeof layer.name === 'string' ? layer.name : fallbackName,
        visible: layer.visible !== false,
        opacity: normalizeLayerOpacity(layer.opacity),
        blendMode: normalizeLayerBlendMode(layer.blendMode),
        indices,
        ...(hasCompactIndices ? { indicesEncoding: COMPACT_LAYER_INDEX_ENCODING } : {}),
        ...(hasRuntimeUint8Indices ? { indicesEncoding: RUNTIME_LAYER_INDEX_ENCODING } : {}),
        direct,
        importSourceDirect,
        directOnly: trustStoredLayerFlags && typeof layer.directOnly === 'boolean'
          ? layer.directOnly
          : inferDirectOnlyLayer(layer, indices, direct),
      };
    }

    function normalizeCanvasSelectionMask(mask, pixelCount) {
      if (!(mask instanceof Uint8Array) || mask.length !== pixelCount) {
        return null;
      }
      return new Uint8Array(mask);
    }

    function normalizeCanvasSelectionBounds(bounds, selectionMask = null) {
      const validated = validateBoundsObject(bounds);
      if (validated) {
        return validated;
      }
      if (selectionMask instanceof Uint8Array) {
        return computeSelectionBoundsFromMask(selectionMask);
      }
      return null;
    }

    function createProjectCanvasDocument(source = {}, { clonePixelData = true, fallbackIndex = 1 } = {}) {
      const width = clamp(
        Math.round(Number(source?.width) || DEFAULT_CANVAS_SIZE),
        MIN_CANVAS_SIZE,
        MAX_CANVAS_SIZE
      );
      const height = clamp(
        Math.round(Number(source?.height) || DEFAULT_CANVAS_SIZE),
        MIN_CANVAS_SIZE,
        MAX_CANVAS_SIZE
      );
      const frames = cloneCanvasDocumentFrames(source?.frames, width, height, { clonePixelData });
      const frameCount = Math.max(1, frames.length);
      const activeFrame = clamp(Math.round(Number(source?.activeFrame) || 0), 0, frameCount - 1);
      const frame = frames[activeFrame];
      const requestedLayerId = typeof source?.activeLayer === 'string' ? source.activeLayer : '';
      const activeLayer = frame.layers.some(layer => layer?.id === requestedLayerId)
        ? requestedLayerId
        : (frame.layers[frame.layers.length - 1]?.id || frame.layers[0]?.id || null);
      const pixelCount = width * height;
      const selectionMask = normalizeCanvasSelectionMask(source?.selectionMask, pixelCount);
      const selectionContentMask = normalizeCanvasSelectionMask(source?.selectionContentMask, pixelCount);
      return {
        id: typeof source?.id === 'string' && source.id
          ? source.id
          : (crypto.randomUUID ? crypto.randomUUID() : `canvas-${Math.random().toString(36).slice(2)}`),
        name: typeof source?.name === 'string' && source.name.trim()
          ? source.name.trim()
          : getDefaultProjectCanvasName(fallbackIndex),
        width,
        height,
        viewScale: normalizeProjectCanvasViewScale(
          source?.viewScale,
          normalizeProjectCanvasViewScale(source?.scale, 8)
        ),
        frames,
        activeFrame,
        activeLayer,
        mirror: normalizeMirrorAxisState(source?.mirror, width, height),
        selectionMask,
        selectionContentMask,
        selectionBounds: normalizeCanvasSelectionBounds(source?.selectionBounds, selectionMask),
        pendingPasteMoveState: null,
      };
    }

    function cloneProjectCanvasDocument(source, options = {}) {
      return createProjectCanvasDocument(source, options);
    }

    function createProjectCanvasStoreFromState(sourceState) {
      const initialCanvas = createProjectCanvasDocument({
        id: typeof sourceState?.activeCanvasId === 'string' ? sourceState.activeCanvasId : '',
        name: getDefaultProjectCanvasName(1),
        width: sourceState?.width,
        height: sourceState?.height,
        frames: sourceState?.frames,
        activeFrame: sourceState?.activeFrame,
        activeLayer: sourceState?.activeLayer,
        mirror: sourceState?.mirror,
        selectionMask: sourceState?.selectionMask,
        selectionContentMask: sourceState?.selectionContentMask,
        selectionBounds: sourceState?.selectionBounds,
      }, { clonePixelData: true, fallbackIndex: 1 });
      return {
        canvases: [initialCanvas],
        activeCanvasId: initialCanvas.id,
      };
    }

    function getProjectCanvasDocumentFields(targetState, store) {
      const activeCanvas = Array.isArray(store.canvases) && store.canvases.length
        ? (store.canvases.find(canvas => canvas?.id === store.activeCanvasId) || store.canvases[0])
        : null;
      if (activeCanvas) {
        return activeCanvas;
      }
      const fallbackCanvas = createProjectCanvasDocument({}, { clonePixelData: false, fallbackIndex: 1 });
      store.canvases = [fallbackCanvas];
      store.activeCanvasId = fallbackCanvas.id;
      return fallbackCanvas;
    }

    function installProjectCanvasStateProxy(targetState, store) {
      const proxyFields = [
        'width',
        'height',
        'frames',
        'activeFrame',
        'activeLayer',
        'mirror',
        'selectionMask',
        'selectionContentMask',
        'selectionBounds',
        'pendingPasteMoveState',
      ];
      proxyFields.forEach(field => {
        Object.defineProperty(targetState, field, {
          configurable: true,
          enumerable: true,
          get() {
            return getProjectCanvasDocumentFields(targetState, store)[field];
          },
          set(value) {
            getProjectCanvasDocumentFields(targetState, store)[field] = value;
          },
        });
      });
      Object.defineProperty(targetState, 'projectCanvases', {
        configurable: true,
        enumerable: true,
        get() {
          return store.canvases;
        },
        set(value) {
          if (Array.isArray(value) && value.length) {
            store.canvases = collapseToSingleProjectCanvasSource(value, store.activeCanvasId);
            const nextActive = store.canvases.find(canvas => canvas?.id === store.activeCanvasId);
            if (!nextActive) {
              store.activeCanvasId = store.canvases[0]?.id || '';
            }
          }
        },
      });
      Object.defineProperty(targetState, 'activeCanvasId', {
        configurable: true,
        enumerable: true,
        get() {
          return store.activeCanvasId;
        },
        set(value) {
          const requestedId = typeof value === 'string' ? value : '';
          if (requestedId && store.canvases.some(canvas => canvas?.id === requestedId)) {
            store.activeCanvasId = requestedId;
            return;
          }
          store.activeCanvasId = store.canvases[0]?.id || '';
        },
      });
    }

    function createPointerState() {
      return {
        active: false,
        pointerId: null,
        pendingCanvasSwitch: null,
        surface: null,
        tool: null,
        start: null,
        current: null,
        last: null,
        path: [],
        preview: null,
        selectionPreview: null,
        selectionMove: null,
        lastSelectionMove: null,
        drawPaletteIndex: null,
        selectionClearedOnDown: false,
        selectionRestartedOnDown: false,
        selectionExtendOnDown: false,
        startClient: null,
        voxelPreviewYawStart: null,
        voxelPreviewDragWidth: null,
        voxelPreviewPitchStart: null,
        voxelPreviewDragHeight: null,
        voxelPreviewYawChanged: false,
        panOrigin: { x: 0, y: 0 },
        panMode: null,
        touchPanStart: null,
        touchPinchStartDistance: null,
        touchPinchStartScale: null,
        touchPinchFocus: null,
        touchGestureMode: null,
        touchGestureStartPointers: null,
        touchGesturePointerIds: [],
        touchGestureStartedAt: 0,
        touchGestureMovedPointerIds: null,
        touchGestureDecisionTimer: null,
        touchGestureCaptureElement: null,
        suppressTouchCompatibilityUntil: 0,
        touchToolBaseline: null,
        touchPixelBaseline: null,
        touchGestureStartCentroid: null,
        touchGestureStartDistance: null,
        touchGestureStartScale: null,
        touchGestureStartPan: null,
        touchGestureRafId: null,
        curveHandle: null,
        panCaptureElement: null,
      };
    }

    const internalClipboard = {
      selection: null,
      timeline: null,
    };

    function cloneSelectionClipboardPayload(clip) {
      if (!clip || typeof clip !== 'object') {
        return null;
      }
      const width = Math.max(0, Math.floor(Number(clip.width) || 0));
      const height = Math.max(0, Math.floor(Number(clip.height) || 0));
      const size = width * height;
      if (width <= 0 || height <= 0) {
        return null;
      }
      return {
        width,
        height,
        mask: clip.mask instanceof Uint8Array ? new Uint8Array(clip.mask) : new Uint8Array(size),
        contentMask: clip.contentMask instanceof Uint8Array ? new Uint8Array(clip.contentMask) : null,
        indices: clip.indices instanceof Uint8Array
          ? new Uint8Array(clip.indices)
          : (clip.indices instanceof Int16Array ? new Int16Array(clip.indices) : new Uint8Array(size)),
        direct: clip.direct instanceof Uint8ClampedArray ? new Uint8ClampedArray(clip.direct) : new Uint8ClampedArray(size * 4),
        palette: Array.isArray(clip.palette) ? clip.palette.map(color => normalizeColorValue(color)) : [],
        bounds: clip.bounds ? { ...clip.bounds } : { x0: 0, y0: 0, x1: width - 1, y1: height - 1 },
        imageData: clip.imageData ? cloneImageData(clip.imageData) : null,
      };
    }

    function preserveCanvasSelectionClipboard() {
      return cloneSelectionClipboardPayload(internalClipboard.selection);
    }

    function restoreCanvasSelectionClipboard(clip) {
      const restored = cloneSelectionClipboardPayload(clip);
      if (restored) {
        internalClipboard.selection = restored;
      }
    }

    function snapshotProjectCanvasDocument(canvasDoc, { clonePixelData = true } = {}) {
      const resolved = createProjectCanvasDocument(canvasDoc, {
        clonePixelData,
        fallbackIndex: 1,
      });
      return {
        id: resolved.id,
        name: resolved.name,
        width: resolved.width,
        height: resolved.height,
        viewScale: normalizeProjectCanvasViewScale(state.scale, resolved.viewScale || 8),
        frames: resolved.frames.map(frame => ({
          id: frame.id,
          name: frame.name,
          duration: frame.duration,
          voxelPreviewYawDeg: normalizeVoxelPreviewYawDegrees(frame?.voxelPreviewYawDeg),
          voxelPreviewPitchDeg: normalizeVoxelPreviewPitchDegrees(frame?.voxelPreviewPitchDeg),
          layers: frame.layers.map(layer => {
            const compactIndices = isCompactLayerIndices(layer);
            const tiledIndices = isTiledLayerIndices(layer);
            const runtimeUint8Indices = isRuntimeUint8LayerIndices(layer);
            const snapshotLayer = {
              id: layer.id,
              name: layer.name,
              visible: layer.visible,
              opacity: normalizeLayerOpacity(layer.opacity),
              blendMode: normalizeLayerBlendMode(layer.blendMode),
              indices: cloneStoredLayerIndices(layer, { clonePixelData }),
              ...(compactIndices ? { indicesEncoding: COMPACT_LAYER_INDEX_ENCODING } : {}),
              ...(runtimeUint8Indices ? { indicesEncoding: RUNTIME_LAYER_INDEX_ENCODING } : {}),
              direct: layer.direct instanceof Uint8ClampedArray
                ? (clonePixelData ? new Uint8ClampedArray(layer.direct) : layer.direct)
                : null,
              directOnly: Boolean(layer.directOnly),
            };
            if (tiledIndices) {
              copyTiledLayerIndexMetadata(layer, snapshotLayer, { clonePixelData });
            }
            return snapshotLayer;
          }),
        })),
        activeFrame: resolved.activeFrame,
        activeLayer: resolved.activeLayer,
        mirror: normalizeMirrorAxisState(resolved.mirror, resolved.width, resolved.height),
        selectionMask: resolved.selectionMask ? new Uint8Array(resolved.selectionMask) : null,
        selectionContentMask: resolved.selectionContentMask ? new Uint8Array(resolved.selectionContentMask) : null,
        selectionBounds: resolved.selectionBounds ? { ...resolved.selectionBounds } : null,
      };
    }

    function syncSnapshotActiveCanvasPayload(snapshot, { direction = 'fromCanvas' } = {}) {
      if (!snapshot || !Array.isArray(snapshot.canvases) || !snapshot.canvases.length) {
        return;
      }
      const activeCanvas = snapshot.canvases.find(canvas => canvas?.id === snapshot.activeCanvasId) || snapshot.canvases[0];
      if (!activeCanvas) {
        return;
      }
      if (direction === 'toCanvas') {
        activeCanvas.width = snapshot.width;
        activeCanvas.height = snapshot.height;
        activeCanvas.viewScale = normalizeProjectCanvasViewScale(snapshot.scale, activeCanvas.viewScale || 8);
        activeCanvas.frames = snapshot.frames;
        activeCanvas.mirror = normalizeMirrorAxisState(snapshot.mirror, snapshot.width, snapshot.height);
        if (Object.prototype.hasOwnProperty.call(snapshot, 'activeFrame')) {
          activeCanvas.activeFrame = snapshot.activeFrame;
        }
        if (Object.prototype.hasOwnProperty.call(snapshot, 'activeLayer')) {
          activeCanvas.activeLayer = snapshot.activeLayer;
        }
        if (Object.prototype.hasOwnProperty.call(snapshot, 'selectionMask')) {
          activeCanvas.selectionMask = snapshot.selectionMask ? new Uint8Array(snapshot.selectionMask) : null;
        }
        if (Object.prototype.hasOwnProperty.call(snapshot, 'selectionContentMask')) {
          activeCanvas.selectionContentMask = snapshot.selectionContentMask ? new Uint8Array(snapshot.selectionContentMask) : null;
        }
        if (Object.prototype.hasOwnProperty.call(snapshot, 'selectionBounds')) {
          activeCanvas.selectionBounds = snapshot.selectionBounds ? { ...snapshot.selectionBounds } : null;
        }
        return;
      }
      snapshot.width = activeCanvas.width;
      snapshot.height = activeCanvas.height;
      snapshot.scale = normalizeProjectCanvasViewScale(activeCanvas.viewScale, snapshot.scale || MIN_ZOOM_SCALE);
      snapshot.frames = activeCanvas.frames;
      snapshot.activeFrame = activeCanvas.activeFrame;
      snapshot.activeLayer = activeCanvas.activeLayer;
      snapshot.mirror = normalizeMirrorAxisState(activeCanvas.mirror, activeCanvas.width, activeCanvas.height);
      snapshot.selectionMask = activeCanvas.selectionMask ? new Uint8Array(activeCanvas.selectionMask) : null;
      snapshot.selectionContentMask = activeCanvas.selectionContentMask ? new Uint8Array(activeCanvas.selectionContentMask) : null;
      snapshot.selectionBounds = activeCanvas.selectionBounds ? { ...activeCanvas.selectionBounds } : null;
    }

    return {
      internalClipboard,
      createInitialState,
      createInitialVirtualCursor,
      createLayer,
      isImplicitTransparentLayerIndices,
      isCompactLayerIndices,
      isRuntimeUint8LayerIndices,
      isTiledLayerIndices,
      getStoredLayerPaletteIndex,
      compactLayerIndices,
      createCompactLayerIndicesForStorage,
      compactLayerIndicesToTiles,
      materializeLayerIndices,
      ensureLayerDirect,
      isSimulationLayer,
      cloneSimulationColor,
      normalizeSimulationDisplayMode,
      normalizeSimulationStyle,
      normalizeSimulationSettings,
      createSimulationLayer,
      cloneSimulationLayer,
      cloneGenericLayer,
      createGenericLayerFromSnapshot,
      cloneLayer,
      resizeProjectCanvasFrames,
      createFrame,
      snapshotLayerForClipboard,
      createLayerFromClipboardSnapshot,
      snapshotFrameForClipboard,
      createFrameFromClipboardSnapshot,
      getDefaultProjectCanvasName,
      cloneCanvasDocumentFrames,
      cloneLayerForSnapshot,
      serializeSimulationStyleForDocument,
      parseSimulationStyleFromDocument,
      hasOnlyEmptyLayerIndices,
      inferDirectOnlyLayer,
      frameListHasDirectPixelData,
      serializeLayerForDocument,
      deserializeSimulationTypedArray,
      deserializeLayerFromDocument,
      normalizeCanvasSelectionMask,
      normalizeCanvasSelectionBounds,
      createProjectCanvasDocument,
      cloneProjectCanvasDocument,
      createProjectCanvasStoreFromState,
      getProjectCanvasDocumentFields,
      installProjectCanvasStateProxy,
      createPointerState,
      cloneSelectionClipboardPayload,
      preserveCanvasSelectionClipboard,
      restoreCanvasSelectionClipboard,
      snapshotProjectCanvasDocument,
      syncSnapshotActiveCanvasPayload,
    };
  }

  root.documentModel = {
    createDocumentModel,
  };
})();
