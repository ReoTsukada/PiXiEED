(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPalettePanelUtils({
    COLOR_MODE_INDEX,
    COLOR_MODE_RGB,
    CURRENT_PALETTE_PRESET_CUSTOM,
    MAX_IMPORTED_PALETTE_COLORS,
    NEW_PROJECT_PALETTE_PRESET_DEFAULT,
    state,
    dom,
    history,
    paletteEditorState,
    getCurrentPalettePresetId,
    getNewProjectPalettePresetId,
    getLayoutMode,
    normalizeColorMode,
    isRgbColorMode,
    isIndexColorMode,
    colorsMatchRgba,
    getPaletteEditorTargetColor,
    canCurrentClientEditPaletteColors,
    isMultiPaletteIsolationEnabled,
    canCurrentClientReindexPalette,
    announcePaletteReindexRestriction,
    forEachProjectCanvasLayer,
    forEachSnapshotCanvasLayer,
    normalizePaletteIndex,
    getTransparentPaletteIndex,
    clamp,
    localizeText,
    normalizeColorValue,
    buildPaletteColorLookup,
    buildIndexedPaletteFromFrameDataList,
    quantizeRgbaColorEntriesWithMapping,
    getRgbaMergeDistance,
    mergeWeightedRgbaColors,
    getPaletteColorKey,
    ensureLayerDirect,
    inferDirectOnlyLayer,
    getNewProjectPalettePresetDefinition,
    getNewProjectPalettePresetColors,
    normalizeCurrentPalettePreset,
    normalizeNewProjectPalettePreset,
    setCurrentPalettePresetId,
    setNewProjectPalettePresetId,
    setPalettePresetPickerOpen,
    setNewProjectPalettePresetPickerOpen,
    schedulePalettePresetPickerRefresh,
    updatePalettePresetPickerMenuPosition,
    updateNewProjectPalettePresetPickerMenuPosition,
    renderPalettePresetPicker,
    renderNewProjectPalettePresetOptions,
    renderNewProjectPalettePresetPicker,
    renderColorPanelPalettePresetOptions,
    renderPalettePresetPreview,
    getPalettePresetDisplayName,
    markCurrentPalettePresetCustom,
    beginHistory,
    commitHistory,
    markHistoryDirty,
    scheduleSessionPersist,
    requestRender,
    renderAllProjectCanvasSurfaces,
    scheduleSecondaryCanvasRefresh,
    requestOverlayRender,
    updateColorTabSwatch,
    updateFloatingDrawButtonPalettePreview,
    updateAutosaveStatus,
    updateToolTabIcon,
    captureMobilePanelScrollState,
    restoreMobilePanelScrollState,
    focusUnifiedLeftContext,
    isUnifiedLeftToolsColorMode,
    rgbaToHsv,
    hsvToRgba,
    rgbaToCss,
    rgbaToHex,
    hslToRgbColor,
    applyPixelFrameBackground,
    debounce,
  } = {}) {
    let palettePresetPickerPointerBound = false;
    let palettePresetPickerEscapeBound = false;
    let palettePresetPickerViewportBound = false;
    let paletteWheelCtx = null;
    let paletteWheelResizeObserver = null;
    let paletteWheelRenderKey = '';

    function syncPaletteReindexControlState() {
      const allowPaletteReindex = isIndexColorMode() && canCurrentClientReindexPalette();
      const allowPaletteOrdering = canCurrentClientEditPaletteColors();
      const canAddPaletteColor = canCurrentClientEditPaletteColors()
        && (!isIndexColorMode() || state.palette.length < MAX_IMPORTED_PALETTE_COLORS);
      if (dom.controls.addPaletteColor instanceof HTMLButtonElement) {
        dom.controls.addPaletteColor.disabled = !canAddPaletteColor;
      }
      if (dom.controls.removePaletteColor instanceof HTMLButtonElement) {
        const canRemove = state.palette.length > 1;
        dom.controls.removePaletteColor.disabled = !allowPaletteReindex || !canRemove;
      }
      if (dom.controls.movePaletteBackward instanceof HTMLButtonElement) {
        const canMoveBackward = state.palette.length > 1 && state.activePaletteIndex > 0;
        dom.controls.movePaletteBackward.disabled = !allowPaletteOrdering || !canMoveBackward;
      }
      if (dom.controls.movePaletteForward instanceof HTMLButtonElement) {
        const canMoveForward = state.palette.length > 1 && state.activePaletteIndex < (state.palette.length - 1);
        dom.controls.movePaletteForward.disabled = !allowPaletteOrdering || !canMoveForward;
      }
      if (dom.controls.paletteIndex instanceof HTMLInputElement) {
        dom.controls.paletteIndex.disabled = !allowPaletteReindex;
      }
    }
  
  
    function setActiveRgbColor(color, { syncInputs = true, render = true, persist = true } = {}) {
      state.activeRgb = normalizeColorValue(color);
      if (syncInputs) {
        syncPaletteInputs();
      }
      if (render) {
        renderPalette();
      } else {
        updateColorTabSwatch();
        updateFloatingDrawButtonPalettePreview();
      }
      if (persist) {
        scheduleSessionPersist();
      }
    }
  
  
    function syncColorModeControls() {
      const currentMode = normalizeColorMode(state.colorMode, COLOR_MODE_INDEX);
      state.colorMode = currentMode;
      const multiPaletteIsolation = isMultiPaletteIsolationEnabled();
      if (dom.controls.colorModeIndexLabel instanceof HTMLElement) {
        dom.controls.colorModeIndexLabel.textContent = multiPaletteIsolation
          ? localizeText('ローカルインデックス', 'Local Indexed')
          : localizeText('インデックスカラー', 'Indexed Color');
      }
      if (dom.controls.colorModeRgbLabel instanceof HTMLElement) {
        dom.controls.colorModeRgbLabel.textContent = multiPaletteIsolation
          ? localizeText('ローカルRGB', 'Local RGB')
          : localizeText('RGBカラー', 'RGB Color');
      }
      if (dom.controls.colorModeHint instanceof HTMLElement) {
        dom.controls.colorModeHint.textContent = multiPaletteIsolation
          ? localizeText(
            '共同制作中は色モードとパレットは各自ローカルです。既存ピクセルの色替えは行われません。',
            'During collab, color mode and palette are local to each user. Existing pixels are not recolored.'
          )
          : localizeText(
            'インデックスカラーとRGBカラーを切り替えます。',
            'Switch between indexed color and RGB color.'
          );
      }
      if (Array.isArray(dom.controls.colorMode)) {
        dom.controls.colorMode.forEach(input => {
          if (!(input instanceof HTMLInputElement)) {
            return;
          }
          input.checked = input.value === currentMode;
        });
      }
      if (dom.sections.color instanceof HTMLElement) {
        dom.sections.color.dataset.colorMode = currentMode;
      }
      const isIndexMode = currentMode === COLOR_MODE_INDEX;
      const allowColorPicking = canCurrentClientEditPaletteColors();
      const allowPaletteColorEditing = allowColorPicking;
      const allowPaletteReindex = isIndexMode && canCurrentClientReindexPalette();
      const allowPaletteSorting = canCurrentClientEditPaletteColors();
      if (dom.controls.addPaletteColor instanceof HTMLButtonElement) {
        dom.controls.addPaletteColor.disabled = !allowPaletteColorEditing;
      }
      if (dom.controls.removePaletteColor instanceof HTMLButtonElement) {
        const canRemove = state.palette.length > 1;
        dom.controls.removePaletteColor.disabled = !allowPaletteReindex || !canRemove;
      }
      syncPaletteReindexControlState();
      if (dom.controls.paletteHue instanceof HTMLInputElement) {
        dom.controls.paletteHue.disabled = !allowColorPicking;
      }
      if (dom.controls.paletteSaturation instanceof HTMLInputElement) {
        dom.controls.paletteSaturation.disabled = !allowColorPicking;
      }
      if (dom.controls.paletteValue instanceof HTMLInputElement) {
        dom.controls.paletteValue.disabled = !allowColorPicking;
      }
      if (dom.controls.paletteAlphaSlider instanceof HTMLInputElement) {
        dom.controls.paletteAlphaSlider.disabled = !allowColorPicking;
      }
      if (dom.controls.paletteWheelWrapper instanceof HTMLElement) {
        dom.controls.paletteWheelWrapper.classList.toggle('is-disabled', !allowColorPicking);
      }
      if (dom.controls.palettePresetSelect instanceof HTMLSelectElement) {
        dom.controls.palettePresetSelect.disabled = !allowColorPicking;
      }
      if (dom.controls.palettePresetPickerButton instanceof HTMLButtonElement) {
        dom.controls.palettePresetPickerButton.disabled = !allowColorPicking;
        if (!allowColorPicking) {
          setPalettePresetPickerOpen(false);
        }
      }
      if (dom.controls.applyPalettePreset instanceof HTMLButtonElement) {
        dom.controls.applyPalettePreset.disabled = !allowColorPicking;
      }
      if (dom.controls.sortPaletteHue instanceof HTMLButtonElement) {
        dom.controls.sortPaletteHue.disabled = !allowPaletteSorting;
      }
      if (dom.controls.sortPaletteSaturation instanceof HTMLButtonElement) {
        dom.controls.sortPaletteSaturation.disabled = !allowPaletteSorting;
      }
      if (dom.controls.sortPaletteValue instanceof HTMLButtonElement) {
        dom.controls.sortPaletteValue.disabled = !allowPaletteSorting;
      }
      const paletteIndexField = dom.controls.paletteIndexField;
      if (paletteIndexField instanceof HTMLElement) {
        paletteIndexField.hidden = !isIndexMode;
        paletteIndexField.setAttribute('aria-hidden', String(!isIndexMode));
        const paletteIndexLabel = paletteIndexField.querySelector('span');
        if (paletteIndexLabel instanceof HTMLElement) {
          paletteIndexLabel.textContent = multiPaletteIsolation
            ? localizeText('ローカル番号', 'Local Slot')
            : localizeText('インデックス', 'Index');
        }
      }
    }
  
  
    function remapDocumentDirectPixelsToCurrentPalette() {
      if (!Array.isArray(state.palette)) {
        state.palette = [];
      }
      const paletteLookup = buildPaletteColorLookup(state.palette);
      let convertedPixels = 0;
      let addedCount = 0;
      let touchedLayers = 0;
      forEachProjectCanvasLayer(({ layer }) => {
        if (!(layer?.indices instanceof Int16Array)) {
          return;
        }
        const indices = layer.indices;
        const pixelCount = indices.length;
        const expectedLength = pixelCount * 4;
        const direct = layer.direct instanceof Uint8ClampedArray && layer.direct.length === expectedLength
          ? layer.direct
          : null;
        if (!direct) {
          layer.direct = null;
          return;
        }
        let layerTouched = false;
        for (let i = 0; i < pixelCount; i += 1) {
          if (indices[i] >= 0) {
            continue;
          }
          const base = i * 4;
          const alpha = direct[base + 3];
          if (alpha <= 0) {
            continue;
          }
          const r = direct[base];
          const g = direct[base + 1];
          const b = direct[base + 2];
          const key = `${r},${g},${b},${alpha}`;
          let mappedIndex = paletteLookup.get(key);
          if (!Number.isInteger(mappedIndex) || mappedIndex < 0) {
            mappedIndex = state.palette.length;
            state.palette.push({ r, g, b, a: alpha });
            paletteLookup.set(key, mappedIndex);
            addedCount += 1;
          }
          indices[i] = mappedIndex;
          direct[base] = 0;
          direct[base + 1] = 0;
          direct[base + 2] = 0;
          direct[base + 3] = 0;
          convertedPixels += 1;
          layerTouched = true;
        }
        if (layerTouched) {
          layer.directOnly = inferDirectOnlyLayer(layer, indices, direct);
          touchedLayers += 1;
        }
        layer.direct = null;
        layer.importSourceDirect = null;
      });
      return { convertedPixels, addedCount, touchedLayers, paletteLookup };
    }
  
  
    function convertCurrentDocumentRgbPixelsToIndexedPalette() {
      const layerEntries = [];
      forEachProjectCanvasLayer(({ layer }) => {
        if (!(layer?.indices instanceof Int16Array)) {
          return;
        }
        const colorData = buildLayerColorDataPreferDirect(layer, state.palette);
        if (colorData instanceof Uint8ClampedArray) {
          layerEntries.push({ layer, colorData });
        }
      });
      if (!layerEntries.length) {
        state.palette = [
          { r: 0, g: 0, b: 0, a: 0 },
          { r: 0, g: 0, b: 0, a: 255 },
        ];
        state.activePaletteIndex = 1;
        state.secondaryPaletteIndex = 0;
        state.activeRgb = normalizeColorValue(state.palette[1]);
        return { convertedPixels: 0, addedCount: 0, touchedLayers: 0, reduced: false, sourceColorCount: 0, paletteSize: state.palette.length };
      }
      const previousActiveColor = normalizeColorValue(state.activeRgb || state.palette?.[state.activePaletteIndex] || { r: 0, g: 0, b: 0, a: 255 });
      const previousSecondaryColor = normalizeColorValue(state.palette?.[state.secondaryPaletteIndex] || { r: 0, g: 0, b: 0, a: 0 });
      const maxOpaqueColors = MAX_IMPORTED_PALETTE_COLORS - 1;
      const extraction = buildIndexedPaletteFromFrameDataList(
        layerEntries.map(entry => entry.colorData),
        maxOpaqueColors
      );
      const opaquePalette = Array.isArray(extraction.palette)
        ? extraction.palette.map(color => normalizeColorValue(color)).filter(color => color.a > 0).slice(0, maxOpaqueColors)
        : [];
      state.palette = [
        { r: 0, g: 0, b: 0, a: 0 },
        ...(opaquePalette.length ? opaquePalette : [{ r: 0, g: 0, b: 0, a: 255 }]),
      ];
      let convertedPixels = 0;
      let touchedLayers = 0;
      const usedPaletteIndices = new Set();
      layerEntries.forEach((entry, entryIndex) => {
        const layer = entry.layer;
        const extractedIndices = Array.isArray(extraction.frameIndices)
          ? extraction.frameIndices[entryIndex]
          : null;
        if (!(extractedIndices instanceof Int16Array) || extractedIndices.length !== layer.indices.length) {
          return;
        }
        const nextIndices = new Int16Array(layer.indices.length).fill(-1);
        let touchedLayer = false;
        for (let i = 0; i < nextIndices.length; i += 1) {
          const sourceIndex = extractedIndices[i];
          if (sourceIndex < 0) {
            continue;
          }
          const nextIndex = clamp(sourceIndex + 1, 1, Math.max(1, state.palette.length - 1));
          nextIndices[i] = nextIndex;
          usedPaletteIndices.add(nextIndex);
          convertedPixels += 1;
          touchedLayer = true;
        }
        layer.indices = nextIndices;
        layer.direct = null;
        layer.importSourceDirect = null;
        layer.directOnly = false;
        if (touchedLayer) {
          touchedLayers += 1;
        }
      });
      const sourceColorCount = Math.max(0, Math.round(Number(extraction.sourceColorCount) || 0));
      padIndexedPaletteToMaxColors(state.palette, MAX_IMPORTED_PALETTE_COLORS);
      state.activePaletteIndex = findNearestPaletteColorIndexByRgba(previousActiveColor, state.palette, Math.min(1, state.palette.length - 1));
      state.secondaryPaletteIndex = findNearestPaletteColorIndexByRgba(previousSecondaryColor, state.palette, 0);
      state.activeRgb = normalizeColorValue(state.palette[state.activePaletteIndex] || previousActiveColor);
      return {
        convertedPixels,
        addedCount: sourceColorCount,
        touchedLayers,
        reduced: Boolean(extraction.reduced) || sourceColorCount > maxOpaqueColors,
        sourceColorCount,
        usedColorCount: usedPaletteIndices.size,
        opaquePaletteSize: Math.max(0, state.palette.length - 1),
        paletteSize: state.palette.length,
      };
    }
  
  
    function reduceIndexedPaletteByClosestClusters(palette, counts, maxColors = MAX_IMPORTED_PALETTE_COLORS) {
      const normalizedMaxColors = clamp(
        Math.round(Number(maxColors) || MAX_IMPORTED_PALETTE_COLORS),
        2,
        MAX_IMPORTED_PALETTE_COLORS
      );
      const maxOpaqueColors = normalizedMaxColors - 1;
      const sourcePalette = Array.isArray(palette) ? palette.map(color => normalizeColorValue(color)) : [];
      if (sourcePalette.length <= normalizedMaxColors) {
        return {
          palette: sourcePalette,
          mapping: sourcePalette.map((_, index) => index),
        };
      }
      let clusters = [];
      for (let index = 1; index < sourcePalette.length; index += 1) {
        const color = normalizeColorValue(sourcePalette[index]);
        if (color.a <= 0) {
          continue;
        }
        clusters.push({
          ...color,
          count: Math.max(1, Math.round(Number(counts?.[index]) || 1)),
          sourceIndices: [index],
        });
      }
      if (clusters.length > 2048) {
        const quantized = quantizeRgbaColorEntriesWithMapping(
          clusters.map(cluster => ({
            ...cluster,
            sourceIndex: Array.isArray(cluster.sourceIndices) ? cluster.sourceIndices[0] : -1,
            sourceIndices: Array.isArray(cluster.sourceIndices) ? cluster.sourceIndices.slice() : [],
          })),
          maxOpaqueColors
        );
        const reducedPalette = [
          normalizeColorValue({ ...(sourcePalette[0] || { r: 0, g: 0, b: 0, a: 0 }), a: 0 }),
          ...quantized.palette.slice(0, maxOpaqueColors),
        ];
        const mapping = new Array(sourcePalette.length).fill(-1);
        mapping[0] = 0;
        quantized.sourceIndexToPaletteIndex.forEach((paletteIndex, sourceIndex) => {
          if (Number.isInteger(sourceIndex) && sourceIndex > 0 && Number.isInteger(paletteIndex) && paletteIndex >= 0) {
            mapping[sourceIndex] = paletteIndex + 1;
          }
        });
        for (let index = 1; index < mapping.length; index += 1) {
          if (!Number.isInteger(mapping[index]) || mapping[index] < 0) {
            mapping[index] = findNearestPaletteColorIndexByRgba(sourcePalette[index], reducedPalette, 1);
          }
        }
        return { palette: reducedPalette, mapping };
      }
      while (clusters.length > maxOpaqueColors) {
        let bestLeft = -1;
        let bestRight = -1;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let left = 0; left < clusters.length - 1; left += 1) {
          for (let right = left + 1; right < clusters.length; right += 1) {
            const distance = getRgbaMergeDistance(clusters[left], clusters[right]);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestLeft = left;
              bestRight = right;
              if (distance === 0) {
                break;
              }
            }
          }
          if (bestDistance === 0) {
            break;
          }
        }
        if (bestLeft < 0 || bestRight < 0) {
          break;
        }
        const merged = mergeWeightedRgbaColors(clusters[bestLeft], clusters[bestRight]);
        clusters[bestLeft] = {
          ...merged,
          sourceIndices: [
            ...(Array.isArray(clusters[bestLeft].sourceIndices) ? clusters[bestLeft].sourceIndices : []),
            ...(Array.isArray(clusters[bestRight].sourceIndices) ? clusters[bestRight].sourceIndices : []),
          ],
        };
        clusters.splice(bestRight, 1);
      }
      const nextPalette = [
        normalizeColorValue({ ...(sourcePalette[0] || { r: 0, g: 0, b: 0, a: 0 }), a: 0 }),
        ...clusters.map(color => normalizeColorValue(color)).slice(0, maxOpaqueColors),
      ];
      const mapping = new Array(sourcePalette.length).fill(-1);
      mapping[0] = 0;
      clusters.forEach((cluster, clusterIndex) => {
        const nextIndex = clusterIndex + 1;
        (cluster.sourceIndices || []).forEach((sourceIndex) => {
          mapping[sourceIndex] = nextIndex;
        });
      });
      return { palette: nextPalette, mapping };
    }
  
  
    function buildLayerColorDataPreferDirect(layer, palette) {
      if (!(layer?.indices instanceof Int16Array)) {
        return null;
      }
      const pixelCount = layer.indices.length;
      const data = new Uint8ClampedArray(pixelCount * 4);
      const sourceDirect = layer.importSourceDirect instanceof Uint8ClampedArray && layer.importSourceDirect.length === pixelCount * 4
        ? layer.importSourceDirect
        : null;
      const direct = sourceDirect || (layer.direct instanceof Uint8ClampedArray && layer.direct.length === pixelCount * 4
        ? layer.direct
        : null);
      for (let i = 0; i < pixelCount; i += 1) {
        const base = i * 4;
        if (direct) {
          data[base] = direct[base];
          data[base + 1] = direct[base + 1];
          data[base + 2] = direct[base + 2];
          data[base + 3] = direct[base + 3];
          continue;
        }
        const paletteIndex = layer.indices[i];
        if (paletteIndex >= 0 && Array.isArray(palette) && palette[paletteIndex]) {
          const color = normalizeColorValue(palette[paletteIndex]);
          data[base] = color.r;
          data[base + 1] = color.g;
          data[base + 2] = color.b;
          data[base + 3] = color.a;
        }
      }
      return data;
    }
  
  
    function padIndexedPaletteToMaxColors(palette, maxColors = MAX_IMPORTED_PALETTE_COLORS) {
      if (!Array.isArray(palette)) {
        return palette;
      }
      const targetLength = clamp(
        Math.round(Number(maxColors) || MAX_IMPORTED_PALETTE_COLORS),
        2,
        MAX_IMPORTED_PALETTE_COLORS
      );
      if (!palette.length || normalizeColorValue(palette[0]).a > 0) {
        palette.unshift({ r: 0, g: 0, b: 0, a: 0 });
      } else {
        palette[0] = normalizeColorValue({ ...palette[0], a: 0 });
      }
      const usedKeys = new Set(palette.map(color => getPaletteColorKey(color)));
      let seed = 0;
      while (palette.length < targetLength && seed < targetLength * 16) {
        const hue = (seed * 137.508) % 360;
        const sat = 62 + ((seed % 5) * 7);
        const light = 18 + ((seed * 11) % 68);
        const candidate = normalizeColorValue(hslToRgbColor(hue, sat, light));
        candidate.a = 255;
        const key = getPaletteColorKey(candidate);
        if (!usedKeys.has(key)) {
          usedKeys.add(key);
          palette.push(candidate);
        }
        seed += 1;
      }
      while (palette.length < targetLength) {
        const fallback = normalizeColorValue({
          r: (palette.length * 47) % 256,
          g: (palette.length * 89) % 256,
          b: (palette.length * 131) % 256,
          a: 255,
        });
        const key = getPaletteColorKey(fallback);
        if (!usedKeys.has(key)) {
          usedKeys.add(key);
          palette.push(fallback);
        } else {
          palette.push({ r: palette.length % 256, g: (palette.length * 3) % 256, b: (palette.length * 7) % 256, a: 255 });
        }
      }
      if (palette.length > targetLength) {
        palette.length = targetLength;
      }
      return palette;
    }
  
  
    function remapDocumentIndexedPixelsToDirect() {
      const palette = Array.isArray(state.palette) ? state.palette : [];
      let convertedPixels = 0;
      let touchedLayers = 0;
      forEachProjectCanvasLayer(({ canvasDoc, layer }) => {
        if (!(layer?.indices instanceof Int16Array)) {
          return;
        }
        const indices = layer.indices;
        if (!indices.length) {
          return;
        }
        const direct = ensureLayerDirect(layer, canvasDoc?.width, canvasDoc?.height);
        let layerTouched = false;
        for (let i = 0; i < indices.length; i += 1) {
          const paletteIndex = indices[i];
          if (paletteIndex < 0) {
            continue;
          }
          const base = i * 4;
          const paletteColor = palette[paletteIndex];
          if (paletteColor) {
            const normalized = normalizeColorValue(paletteColor);
            direct[base] = normalized.r;
            direct[base + 1] = normalized.g;
            direct[base + 2] = normalized.b;
            direct[base + 3] = normalized.a;
          } else {
            direct[base] = 0;
            direct[base + 1] = 0;
            direct[base + 2] = 0;
            direct[base + 3] = 0;
          }
          indices[i] = -1;
          convertedPixels += 1;
          layerTouched = true;
        }
        if (layerTouched) {
          touchedLayers += 1;
        }
      });
      return { convertedPixels, touchedLayers };
    }
  
  
    function convertIndexedDocumentToDirectForMultiPalette() {
      if (!isMultiPaletteIsolationEnabled()) {
        return { convertedPixels: 0, touchedLayers: 0 };
      }
      const result = remapDocumentIndexedPixelsToDirect();
      if ((result?.convertedPixels || 0) > 0) {
        requestRender();
        requestOverlayRender();
        scheduleSessionPersist();
      }
      return result;
    }
  
  
    function mapActiveRgbToIndexedPalette(paletteLookup = null) {
      if (!Array.isArray(state.palette)) {
        state.palette = [];
      }
      const lookup = paletteLookup instanceof Map
        ? paletteLookup
        : buildPaletteColorLookup(state.palette);
      const activeColor = normalizeColorValue(state.activeRgb);
      const activeKey = getPaletteColorKey(activeColor);
      let paletteIndex = lookup.get(activeKey);
      let addedCount = 0;
      if (!Number.isInteger(paletteIndex) || paletteIndex < 0) {
        paletteIndex = state.palette.length;
        state.palette.push(activeColor);
        lookup.set(activeKey, paletteIndex);
        addedCount += 1;
      }
      state.activePaletteIndex = normalizePaletteIndex(paletteIndex, state.activePaletteIndex);
      state.secondaryPaletteIndex = normalizePaletteIndex(state.secondaryPaletteIndex, state.activePaletteIndex);
      const mappedColor = state.palette[state.activePaletteIndex] || activeColor;
      state.activeRgb = normalizeColorValue(mappedColor);
      return { addedCount, activePaletteIndex: state.activePaletteIndex };
    }


    function projectHasIndexedPixels() {
      let hasIndexedPixels = false;
      forEachProjectCanvasLayer(({ layer }) => {
        if (hasIndexedPixels || !(layer?.indices instanceof Int16Array)) {
          return;
        }
        for (let index = 0; index < layer.indices.length; index += 1) {
          if (layer.indices[index] >= 0) {
            hasIndexedPixels = true;
            break;
          }
        }
      });
      return hasIndexedPixels;
    }


    function applyCustomIndexedPaletteFromActiveColor() {
      const activeColor = normalizeColorValue(
        state.activeRgb
        || state.palette?.[state.activePaletteIndex]
        || state.palette?.[1]
        || { r: 0, g: 0, b: 0, a: 255 }
      );
      const hasIndexedPixels = projectHasIndexedPixels();
      let compactedToSingleColor = false;
      if (!hasIndexedPixels) {
        state.palette = [
          { r: 0, g: 0, b: 0, a: 0 },
          activeColor,
        ].map(color => normalizeColorValue(color));
        state.activePaletteIndex = Math.min(1, Math.max(0, state.palette.length - 1));
        state.secondaryPaletteIndex = 0;
        compactedToSingleColor = true;
      } else {
        mapActiveRgbToIndexedPalette();
      }
      state.activeRgb = normalizeColorValue(state.palette[state.activePaletteIndex] || activeColor);
      markCurrentPalettePresetCustom({ syncControl: true });
      return {
        compactedToSingleColor,
        hasIndexedPixels,
      };
    }
  
  
    function reserveUniquePaletteColor(baseColor, usedKeys, salt = 0, { allowTransparent = false } = {}) {
      const keys = usedKeys instanceof Set ? usedKeys : new Set();
      let candidate = normalizeColorValue(baseColor);
      let attempt = 0;
      while (attempt < 2048) {
        const key = getPaletteColorKey(candidate);
        if (!keys.has(key)) {
          keys.add(key);
          return candidate;
        }
        attempt += 1;
        if (allowTransparent && candidate.a <= 0) {
          candidate = { r: 0, g: 0, b: 0, a: 0 };
          continue;
        }
        if (candidate.a <= 0) {
          candidate.a = 255;
        }
        const hsv = rgbaToHsv(candidate);
        const hue = (hsv.h + 23 + (salt * 11) + (attempt * 17)) % 360;
        const saturation = clamp(
          hsv.s + ((((salt + attempt) % 7) - 3) * 0.06),
          0.2,
          1
        );
        const value = clamp(
          hsv.v + ((((salt + attempt) % 9) - 4) * 0.05),
          0.12,
          1
        );
        const shifted = hsvToRgba(hue, saturation, value);
        shifted.a = clamp(Math.round(candidate.a), 1, 255);
        candidate = normalizeColorValue(shifted);
      }
      let fallback = normalizeColorValue({
        r: (37 * (salt + 3)) % 256,
        g: (91 * (salt + 5)) % 256,
        b: (157 * (salt + 7)) % 256,
        a: allowTransparent ? 0 : 255,
      });
      let fallbackKey = getPaletteColorKey(fallback);
      let fallbackAttempt = 0;
      while (keys.has(fallbackKey) && fallbackAttempt < 4096) {
        fallbackAttempt += 1;
        fallback = normalizeColorValue({
          r: (fallback.r + 37 + (fallbackAttempt % 23)) % 256,
          g: (fallback.g + 59 + (fallbackAttempt % 29)) % 256,
          b: (fallback.b + 83 + (fallbackAttempt % 31)) % 256,
          a: fallback.a <= 0 ? 255 : fallback.a,
        });
        fallbackKey = getPaletteColorKey(fallback);
      }
      keys.add(fallbackKey);
      return fallback;
    }
  
  
    function getPresetBasedPaletteAddColor(presetId = (dom.controls.palettePresetSelect?.value || getCurrentPalettePresetId())) {
      const normalizedCurrentPresetId = normalizeCurrentPalettePreset(presetId, getCurrentPalettePresetId());
      if (normalizedCurrentPresetId === CURRENT_PALETTE_PRESET_CUSTOM) {
        const usedKeys = new Set(buildPaletteColorLookup(state.palette).keys());
        const fallbackBase = normalizeColorValue(
          state.palette?.[state.activePaletteIndex]
          || state.activeRgb
          || state.palette?.[state.palette.length - 1]
          || { r: 88, g: 196, b: 255, a: 255 }
        );
        return reserveUniquePaletteColor(
          fallbackBase,
          usedKeys,
          (state.palette?.length || 0) + state.activePaletteIndex + 1,
          { allowTransparent: false }
        );
      }
      const normalizedPresetId = normalizeNewProjectPalettePreset(
        presetId,
        getNewProjectPalettePresetId() || NEW_PROJECT_PALETTE_PRESET_DEFAULT
      );
      const presetColors = getNewProjectPalettePresetColors(normalizedPresetId, NEW_PROJECT_PALETTE_PRESET_DEFAULT)
        .map(color => normalizeColorValue(color));
      const usedKeys = new Set(buildPaletteColorLookup(state.palette).keys());
      const opaquePresetColors = presetColors.filter(color => color.a > 0);
      const paletteBase = opaquePresetColors.length ? opaquePresetColors : presetColors;
      if (paletteBase.length) {
        const startIndex = ((state.palette?.length || 0) % paletteBase.length + paletteBase.length) % paletteBase.length;
        for (let offset = 0; offset < paletteBase.length; offset += 1) {
          const candidate = normalizeColorValue(paletteBase[(startIndex + offset) % paletteBase.length]);
          if (candidate.a <= 0) {
            continue;
          }
          const key = getPaletteColorKey(candidate);
          if (!usedKeys.has(key)) {
            usedKeys.add(key);
            return candidate;
          }
        }
      }
      const fallbackBase = normalizeColorValue(
        paletteBase[0]
        || state.palette?.[state.activePaletteIndex]
        || state.activeRgb
        || { r: 88, g: 196, b: 255, a: 255 }
      );
      return reserveUniquePaletteColor(
        fallbackBase,
        usedKeys,
        (state.palette?.length || 0) + state.activePaletteIndex + 1,
        { allowTransparent: false }
      );
    }
  
  
    function dedupeIndexedPaletteColors() {
      if (!Array.isArray(state.palette) || state.palette.length <= 1) {
        return { removedCount: 0 };
      }
      const previousPalette = state.palette.map(color => normalizeColorValue(color));
      const mapping = new Array(previousPalette.length).fill(-1);
      const nextPalette = [];
      const keyToIndex = new Map();
      for (let oldIndex = 0; oldIndex < previousPalette.length; oldIndex += 1) {
        const color = previousPalette[oldIndex];
        const key = getPaletteColorKey(color);
        let mappedIndex = keyToIndex.get(key);
        if (!Number.isInteger(mappedIndex) || mappedIndex < 0) {
          mappedIndex = nextPalette.length;
          nextPalette.push(color);
          keyToIndex.set(key, mappedIndex);
        }
        mapping[oldIndex] = mappedIndex;
      }
      const removedCount = previousPalette.length - nextPalette.length;
      if (removedCount <= 0) {
        return { removedCount: 0 };
      }
      state.palette = nextPalette;
      remapPaletteIndices(mapping);
      state.activePaletteIndex = normalizePaletteIndex(state.activePaletteIndex, state.activePaletteIndex);
      state.secondaryPaletteIndex = normalizePaletteIndex(state.secondaryPaletteIndex, state.activePaletteIndex);
      return { removedCount };
    }
  
  
    function setColorMode(mode, { persist = true } = {}) {
      const previousMode = normalizeColorMode(state.colorMode, COLOR_MODE_INDEX);
      const nextMode = normalizeColorMode(mode, previousMode);
      if (nextMode === previousMode) {
        syncColorModeControls();
        return false;
      }
      const multiPaletteIsolation = isMultiPaletteIsolationEnabled();
      if (multiPaletteIsolation) {
        state.colorMode = nextMode;
        if (nextMode === COLOR_MODE_RGB) {
          const paletteColor = state.palette[state.activePaletteIndex];
          if (paletteColor) {
            state.activeRgb = normalizeColorValue(paletteColor);
          }
        } else {
          state.activePaletteIndex = normalizePaletteIndex(state.activePaletteIndex, state.activePaletteIndex);
          state.secondaryPaletteIndex = normalizePaletteIndex(state.secondaryPaletteIndex, state.activePaletteIndex);
          const paletteColor = state.palette[state.activePaletteIndex];
          if (paletteColor) {
            state.activeRgb = normalizeColorValue(paletteColor);
          }
        }
        syncColorModeControls();
        syncPaletteInputs();
        renderPalette();
        updateColorTabSwatch();
        focusUnifiedLeftContext('color', { persist: false });
        if (persist) {
          scheduleSessionPersist();
          updateAutosaveStatus(
            nextMode === COLOR_MODE_INDEX
              ? localizeText(
                '共同制作中のインデックスはローカル専用です。既存ピクセルの色替えは行いません。',
                'Indexed mode is local-only during collab. Existing pixels are not recolored.'
              )
              : localizeText(
                '共同制作中のRGBはローカル専用です。描画結果だけが共有されます。',
                'RGB mode is local-only during collab. Only painted results are shared.'
              ),
            'info'
          );
        }
        return true;
      }
      const canRemapDocument = canCurrentClientReindexPalette();
      const shouldCreateCustomIndexPalette = (
        previousMode === COLOR_MODE_RGB
        && nextMode === COLOR_MODE_INDEX
      );
      const shouldRemapToRgb = (
        previousMode === COLOR_MODE_INDEX
        && nextMode === COLOR_MODE_RGB
        && canRemapDocument
      );
      if (shouldCreateCustomIndexPalette && !canCurrentClientEditPaletteColors()) {
        syncColorModeControls();
        updateAutosaveStatus(
          localizeText(
            'このモードではカスタムインデックスパレットを作成できません',
            'A custom indexed palette is not available in this mode'
          ),
          'warn'
        );
        return false;
      }
      if (!shouldCreateCustomIndexPalette && previousMode === COLOR_MODE_INDEX && nextMode === COLOR_MODE_RGB && !canRemapDocument) {
        syncColorModeControls();
        updateAutosaveStatus(
          localizeText(
            'このモードではカラーモード変換を実行できません',
            'Color mode conversion is not available in this mode'
          ),
          'warn'
        );
        return false;
      }
      let remapToRgbResult = null;
      let customIndexPaletteResult = null;
      let remapMutated = false;
      if (shouldCreateCustomIndexPalette) {
        customIndexPaletteResult = applyCustomIndexedPaletteFromActiveColor();
      } else if (shouldRemapToRgb) {
        beginHistory('colorModeConvert');
        remapToRgbResult = remapDocumentIndexedPixelsToDirect();
        remapMutated = (remapToRgbResult?.convertedPixels || 0) > 0;
        if ((remapToRgbResult?.convertedPixels || 0) > 0) {
          applyPaletteChange();
        }
      }
      state.colorMode = nextMode;
      if (nextMode === COLOR_MODE_RGB) {
        const paletteColor = state.palette[state.activePaletteIndex];
        if (paletteColor) {
          state.activeRgb = normalizeColorValue(paletteColor);
        }
      } else if (!customIndexPaletteResult) {
        state.activePaletteIndex = normalizePaletteIndex(state.activePaletteIndex, state.activePaletteIndex);
        state.secondaryPaletteIndex = normalizePaletteIndex(state.secondaryPaletteIndex, state.activePaletteIndex);
        const paletteColor = state.palette[state.activePaletteIndex];
        if (paletteColor) {
          state.activeRgb = normalizeColorValue(paletteColor);
        }
      }
      syncColorModeControls();
      syncPaletteInputs();
      renderPalette();
      updateColorTabSwatch();
      focusUnifiedLeftContext('color', { persist: false });
      if (shouldCreateCustomIndexPalette) {
        if (persist) {
          applyPaletteChange({
            preserveCurrentPalettePreset: true,
            renderSurfaces: Boolean(customIndexPaletteResult?.hasIndexedPixels),
          });
        } else {
          requestRender();
          if (customIndexPaletteResult?.hasIndexedPixels) {
            renderAllProjectCanvasSurfaces();
          } else {
            scheduleSecondaryCanvasRefresh();
          }
          requestOverlayRender();
        }
        updateAutosaveStatus(
          localizeText(
            customIndexPaletteResult?.compactedToSingleColor
              ? '描画色のみのカスタムパレットを生成してインデックスカラーへ切り替えました'
              : '描画色をカスタムパレットへ反映してインデックスカラーへ切り替えました',
            customIndexPaletteResult?.compactedToSingleColor
              ? 'Switched to indexed color with a custom palette built only from the active draw color'
              : 'Switched to indexed color and synced the active draw color into the custom palette'
          ),
          'info'
        );
      } else if (shouldRemapToRgb) {
        if (remapMutated) {
          commitHistory();
          if ((remapToRgbResult?.convertedPixels || 0) > 0) {
            updateAutosaveStatus(
              localizeText(
                `インデックス描画をRGBに変換しました (${remapToRgbResult.convertedPixels}px)`,
                `Converted indexed pixels to RGB (${remapToRgbResult.convertedPixels}px)`
              ),
              'info'
            );
          }
        } else {
          history.pending = null;
        }
      }
      if (persist && !shouldCreateCustomIndexPalette) {
        scheduleSessionPersist();
      }
      return true;
    }
  
  
    function buildAppliedPaletteFromPreset(presetColors, minimumLength = 1) {
      const source = Array.isArray(presetColors) && presetColors.length
        ? presetColors.map(color => normalizeColorValue(color))
        : [{ r: 0, g: 0, b: 0, a: 0 }];
      const targetLength = clamp(
        Math.round(Number(minimumLength) || source.length || 1),
        1,
        32
      );
      const next = new Array(targetLength);
      const used = new Set();
      const toKey = color => {
        const normalized = normalizeColorValue(color);
        return `${normalized.r},${normalized.g},${normalized.b},${normalized.a}`;
      };
      const reserveUniqueColor = (baseColor, salt = 0, { allowTransparent = false } = {}) => {
        let candidate = normalizeColorValue(baseColor);
        let attempt = 0;
        while (attempt < 1024) {
          const key = toKey(candidate);
          if (!used.has(key)) {
            used.add(key);
            return candidate;
          }
          attempt += 1;
          if (allowTransparent && candidate.a <= 0) {
            candidate = { r: 0, g: 0, b: 0, a: 0 };
            continue;
          }
          if (candidate.a <= 0) {
            candidate.a = 255;
          }
          const hsv = rgbaToHsv(candidate);
          const hue = (hsv.h + 23 + (salt * 11) + (attempt * 17)) % 360;
          const saturation = clamp(
            hsv.s + ((((salt + attempt) % 7) - 3) * 0.06),
            0.2,
            1
          );
          const value = clamp(
            hsv.v + ((((salt + attempt) % 9) - 4) * 0.05),
            0.12,
            1
          );
          const shifted = hsvToRgba(hue, saturation, value);
          shifted.a = clamp(Math.round(candidate.a), 1, 255);
          candidate = normalizeColorValue(shifted);
        }
        const fallback = {
          r: (37 * (salt + 3)) % 256,
          g: (91 * (salt + 5)) % 256,
          b: (157 * (salt + 7)) % 256,
          a: 255,
        };
        const fallbackKey = toKey(fallback);
        if (!used.has(fallbackKey)) {
          used.add(fallbackKey);
        }
        return normalizeColorValue(fallback);
      };
      const cycleSource = source.length > 1 ? source.slice(1) : [source[0]];
      for (let index = 0; index < targetLength; index += 1) {
        const baseColor = index < source.length
          ? source[index]
          : (index === 0 ? source[0] : cycleSource[(index - 1) % cycleSource.length]);
        if (index === 0) {
          next[index] = reserveUniqueColor(baseColor, index, { allowTransparent: true });
        } else {
          next[index] = reserveUniqueColor(baseColor, index, { allowTransparent: false });
        }
      }
      return next;
    }
  
  
    function resolveTransparentStoragePaletteIndex(palette = state.palette) {
      const transparentIndex = getTransparentPaletteIndex(palette);
      return transparentIndex >= 0 ? transparentIndex : -1;
    }
  
  
    function findNearestPaletteColorIndexByRgba(color, palette = state.palette, fallbackIndex = 0) {
      if (!Array.isArray(palette) || !palette.length) {
        return 0;
      }
      const source = normalizeColorValue(color);
      if (source.a <= 0) {
        const transparentIndex = getTransparentPaletteIndex(palette);
        return transparentIndex >= 0
          ? transparentIndex
          : clamp(fallbackIndex, 0, palette.length - 1);
      }
      let bestIndex = clamp(fallbackIndex, 0, palette.length - 1);
      let bestScore = Number.POSITIVE_INFINITY;
      for (let index = 0; index < palette.length; index += 1) {
        const target = normalizeColorValue(palette[index]);
        const dr = source.r - target.r;
        const dg = source.g - target.g;
        const db = source.b - target.b;
        const da = source.a - target.a;
        const alphaPenalty = target.a <= 0 ? 280000 : 0;
        const score = (dr * dr) + (dg * dg) + (db * db) + (da * da * 2.4) + alphaPenalty;
        if (score < bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }
      return bestIndex;
    }
  
  
    function remapDocumentColorsToPaletteApprox(nextPalette, previousPalette, targetMode = state.colorMode) {
      const mode = normalizeColorMode(targetMode, COLOR_MODE_INDEX);
      const oldPalette = Array.isArray(previousPalette) ? previousPalette.map(color => normalizeColorValue(color)) : [];
      const newPalette = Array.isArray(nextPalette) && nextPalette.length
        ? nextPalette.map(color => normalizeColorValue(color))
        : [{ r: 0, g: 0, b: 0, a: 0 }];
      let remappedPixels = 0;
      let touchedLayers = 0;
      forEachProjectCanvasLayer(({ canvasDoc, layer }) => {
        if (!(layer?.indices instanceof Int16Array)) {
          return;
        }
        const indices = layer.indices;
        const pixelCount = indices.length;
        if (!pixelCount) {
          return;
        }
        const hasDirect = layer.direct instanceof Uint8ClampedArray
          && layer.direct.length === pixelCount * 4;
        const direct = hasDirect ? layer.direct : null;
        const nextDirect = mode === COLOR_MODE_RGB
          ? ensureLayerDirect(layer, canvasDoc?.width, canvasDoc?.height)
          : null;
        let layerTouched = false;
        for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
          const paletteIndex = indices[pixelIndex];
          let sourceColor = null;
          if (paletteIndex >= 0) {
            sourceColor = oldPalette[paletteIndex]
              ? normalizeColorValue(oldPalette[paletteIndex])
              : { r: 0, g: 0, b: 0, a: 0 };
          } else if (direct) {
            const base = pixelIndex * 4;
            const alpha = direct[base + 3];
            if (alpha > 0) {
              sourceColor = {
                r: direct[base],
                g: direct[base + 1],
                b: direct[base + 2],
                a: alpha,
              };
            }
          }
          if (!sourceColor) {
            if (mode === COLOR_MODE_INDEX) {
              indices[pixelIndex] = -1;
            } else if (nextDirect instanceof Uint8ClampedArray) {
              const base = pixelIndex * 4;
              nextDirect[base] = 0;
              nextDirect[base + 1] = 0;
              nextDirect[base + 2] = 0;
              nextDirect[base + 3] = 0;
              indices[pixelIndex] = -1;
            }
            continue;
          }
          const mappedIndex = findNearestPaletteColorIndexByRgba(sourceColor, newPalette, 0);
          const mappedColor = normalizeColorValue(newPalette[mappedIndex] || newPalette[0]);
          if (mode === COLOR_MODE_INDEX) {
            if (indices[pixelIndex] !== mappedIndex) {
              indices[pixelIndex] = mappedIndex;
              layerTouched = true;
            } else if (paletteIndex < 0) {
              indices[pixelIndex] = mappedIndex;
              layerTouched = true;
            }
          } else if (nextDirect instanceof Uint8ClampedArray) {
            const base = pixelIndex * 4;
            const same = nextDirect[base] === mappedColor.r
              && nextDirect[base + 1] === mappedColor.g
              && nextDirect[base + 2] === mappedColor.b
              && nextDirect[base + 3] === mappedColor.a
              && indices[pixelIndex] < 0;
            if (!same) {
              nextDirect[base] = mappedColor.r;
              nextDirect[base + 1] = mappedColor.g;
              nextDirect[base + 2] = mappedColor.b;
              nextDirect[base + 3] = mappedColor.a;
              indices[pixelIndex] = -1;
              layerTouched = true;
            }
          }
          remappedPixels += 1;
        }
        if (mode === COLOR_MODE_INDEX) {
          layer.direct = null;
          layer.directOnly = false;
        }
        if (layerTouched) {
          if (mode === COLOR_MODE_RGB) {
            layer.directOnly = inferDirectOnlyLayer(layer, indices, nextDirect);
          }
          touchedLayers += 1;
        }
      });
      return { remappedPixels, touchedLayers };
    }
  
  
    function palettesMatch(a, b) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
        return false;
      }
      for (let index = 0; index < a.length; index += 1) {
        if (!colorsMatchRgba(a[index], b[index])) {
          return false;
        }
      }
      return true;
    }
  
  
    function applyPalettePresetToCurrentPalette(presetId, { announce = true } = {}) {
      if (!canCurrentClientEditPaletteColors()) {
        return false;
      }
      const normalizedPresetId = setNewProjectPalettePresetId(presetId, { persist: true, syncControl: true });
      setCurrentPalettePresetId(normalizedPresetId, { syncControl: true });
      const definition = getNewProjectPalettePresetDefinition(normalizedPresetId, NEW_PROJECT_PALETTE_PRESET_DEFAULT);
      const sourceColors = getNewProjectPalettePresetColors(normalizedPresetId, NEW_PROJECT_PALETTE_PRESET_DEFAULT);
      const targetPaletteLength = Math.max(
        1,
        clamp(Math.round(Number(definition?.colorCount) || sourceColors.length || 1), 1, 32)
      );
      const nextPalette = buildAppliedPaletteFromPreset(sourceColors, targetPaletteLength);
      const previousPalette = Array.isArray(state.palette)
        ? state.palette.map(color => normalizeColorValue(color))
        : [{ r: 0, g: 0, b: 0, a: 0 }];
      const previousActiveColor = getPaletteEditorTargetColor();
      const previousSecondaryColor = state.palette[state.secondaryPaletteIndex]
        ? normalizeColorValue(state.palette[state.secondaryPaletteIndex])
        : previousActiveColor;
      if (palettesMatch(previousPalette, nextPalette)) {
        if (announce) {
          const label = getPalettePresetDisplayName(definition);
          updateAutosaveStatus(
            localizeText(`プリセット「${label}」はすでに適用済みです`, `Preset "${label}" is already applied`),
            'info'
          );
        }
        return false;
      }
      const applyPresetToRgbSwatchesOnly = isRgbColorMode() && !isMultiPaletteIsolationEnabled();
      if (isMultiPaletteIsolationEnabled() || applyPresetToRgbSwatchesOnly) {
        if (applyPresetToRgbSwatchesOnly) {
          beginHistory('paletteApplyPreset');
        }
        state.palette = nextPalette.map(color => normalizeColorValue(color));
        state.activePaletteIndex = findNearestPaletteColorIndexByRgba(
          previousActiveColor || state.activeRgb || state.palette[0],
          state.palette,
          normalizePaletteIndex(state.activePaletteIndex, 0)
        );
        state.secondaryPaletteIndex = findNearestPaletteColorIndexByRgba(
          previousSecondaryColor || previousActiveColor || state.palette[0],
          state.palette,
          normalizePaletteIndex(state.secondaryPaletteIndex, state.activePaletteIndex)
        );
        const activeColor = state.palette[state.activePaletteIndex] || state.palette[0];
        if (activeColor) {
          state.activeRgb = normalizeColorValue(activeColor);
        }
        syncPaletteInputs();
        renderPalette();
        if (applyPresetToRgbSwatchesOnly) {
          applyPaletteChange({ preserveCurrentPalettePreset: true, renderSurfaces: false });
          commitHistory();
        } else {
        requestRender();
        requestOverlayRender();
        scheduleSessionPersist();
        setCurrentPalettePresetId(normalizedPresetId, { syncControl: true });
        }
        if (announce) {
          const label = getPalettePresetDisplayName(definition);
          updateAutosaveStatus(
            localizeText(
              isRgbColorMode()
                ? `プリセット「${label}」をRGBの色候補へ適用しました`
                : `プリセット「${label}」をローカルパレットへ適用しました`,
              isRgbColorMode()
                ? `Applied preset "${label}" to RGB color swatches`
                : `Applied preset "${label}" to your local palette`
            ),
            'success'
          );
        }
        return true;
      }
      beginHistory('paletteApplyPreset');
      state.palette = nextPalette.map(color => normalizeColorValue(color));
      const remapResult = remapDocumentColorsToPaletteApprox(
        state.palette,
        previousPalette,
        state.colorMode
      );
      state.activePaletteIndex = findNearestPaletteColorIndexByRgba(
        previousActiveColor || state.activeRgb || state.palette[0],
        state.palette,
        normalizePaletteIndex(state.activePaletteIndex, 0)
      );
      state.secondaryPaletteIndex = findNearestPaletteColorIndexByRgba(
        previousSecondaryColor || previousActiveColor || state.palette[0],
        state.palette,
        normalizePaletteIndex(state.secondaryPaletteIndex, state.activePaletteIndex)
      );
      const active = state.palette[state.activePaletteIndex] || state.palette[0];
      if (active) {
        state.activeRgb = normalizeColorValue(active);
      }
      syncPaletteInputs();
      renderPalette();
      applyPaletteChange({ preserveCurrentPalettePreset: true });
      commitHistory();
      if (announce) {
        const label = getPalettePresetDisplayName(definition);
        updateAutosaveStatus(
          localizeText(
            `パレットを「${label}」へ適用し、${targetPaletteLength}色へ再構成しました (${remapResult.remappedPixels}px)`,
            `Applied "${label}" and rebuilt to ${targetPaletteLength} colors (${remapResult.remappedPixels}px)`
          ),
          'success'
        );
      }
      return true;
    }
  
  
    function buildPaletteSortMetrics(color, index) {
      const normalized = normalizeColorValue(color);
      const hsv = rgbaToHsv(normalized);
      const luma = (normalized.r * 0.2126) + (normalized.g * 0.7152) + (normalized.b * 0.0722);
      return {
        index,
        color: normalized,
        h: hsv.h,
        s: hsv.s,
        v: hsv.v,
        luma,
        alpha: normalized.a,
      };
    }
  
  
    function comparePaletteSortMetrics(left, right, mode = 'hue') {
      const alphaCompare = Number(right.alpha > 0) - Number(left.alpha > 0);
      if (alphaCompare !== 0) {
        return alphaCompare;
      }
      if (mode === 'saturation') {
        if (left.s !== right.s) return left.s - right.s;
        if (left.v !== right.v) return left.v - right.v;
        if (left.h !== right.h) return left.h - right.h;
        if (left.luma !== right.luma) return left.luma - right.luma;
        return left.index - right.index;
      }
      if (mode === 'value') {
        if (left.v !== right.v) return left.v - right.v;
        if (left.luma !== right.luma) return left.luma - right.luma;
        if (left.h !== right.h) return left.h - right.h;
        if (left.s !== right.s) return left.s - right.s;
        return left.index - right.index;
      }
      if (left.h !== right.h) return left.h - right.h;
      if (left.s !== right.s) return left.s - right.s;
      if (left.v !== right.v) return left.v - right.v;
      if (left.luma !== right.luma) return left.luma - right.luma;
      return left.index - right.index;
    }
  
  
    function sortPaletteBy(mode = 'hue') {
      if (!canCurrentClientEditPaletteColors()) {
        return false;
      }
      if (!Array.isArray(state.palette) || state.palette.length < 2) {
        return false;
      }
      beginHistory('paletteReorder');
      const metrics = state.palette.map((color, index) => buildPaletteSortMetrics(color, index));
      const preserveFirstTransparent = metrics[0] && metrics[0].alpha <= 0;
      let head = null;
      let sortable = metrics.slice();
      if (preserveFirstTransparent) {
        head = sortable.shift();
      }
      sortable.sort((a, b) => comparePaletteSortMetrics(a, b, mode));
      const ordered = head ? [head, ...sortable] : sortable;
      state.palette = ordered.map(entry => ({ ...entry.color }));
      const mapping = new Array(metrics.length).fill(-1);
      ordered.forEach((entry, newIndex) => {
        mapping[entry.index] = newIndex;
      });
      if (isIndexColorMode()) {
        remapPaletteIndices(mapping);
      } else {
        state.activePaletteIndex = normalizePaletteIndex(mapping[state.activePaletteIndex], state.activePaletteIndex);
        state.secondaryPaletteIndex = normalizePaletteIndex(mapping[state.secondaryPaletteIndex], state.activePaletteIndex);
        const activeColor = state.palette[state.activePaletteIndex] || state.palette[0];
        if (activeColor) {
          state.activeRgb = normalizeColorValue(activeColor);
        }
      }
      renderPalette();
      syncPaletteInputs();
      applyPaletteChange({ renderSurfaces: isIndexColorMode() });
      commitHistory();
      const modeLabel = mode === 'value'
        ? localizeText('明度順', 'Value')
        : mode === 'saturation'
          ? localizeText('彩度順', 'Saturation')
          : localizeText('色相順', 'Hue');
      updateAutosaveStatus(localizeText(`パレットを${modeLabel}でソートしました`, `Palette sorted by ${modeLabel}`), 'info');
      return true;
    }
  
  
    function moveActivePaletteBy(delta) {
      if (!canCurrentClientEditPaletteColors() || (isIndexColorMode() && !canCurrentClientReindexPalette())) {
        announcePaletteReindexRestriction();
        return false;
      }
      const step = Math.round(Number(delta) || 0);
      if (!step) {
        return false;
      }
      const currentIndex = clamp(state.activePaletteIndex, 0, state.palette.length - 1);
      const targetIndex = clamp(currentIndex + step, 0, state.palette.length - 1);
      if (currentIndex === targetIndex) {
        return false;
      }
      reorderPalette(currentIndex, targetIndex);
      return true;
    }
  
  
    function setupPaletteEditor() {
      renderColorPanelPalettePresetOptions();
      renderPalettePresetPicker(dom.controls.palettePresetSelect?.value || getCurrentPalettePresetId());
      renderNewProjectPalettePresetOptions(dom.newProject?.palettePreset?.value || getNewProjectPalettePresetId());
      renderNewProjectPalettePresetPicker(dom.newProject?.palettePreset?.value || getNewProjectPalettePresetId());
      if (dom.controls.palettePresetSelect instanceof HTMLSelectElement) {
        dom.controls.palettePresetSelect.value = normalizeCurrentPalettePreset(
          dom.controls.palettePresetSelect.value,
          getCurrentPalettePresetId()
        );
        renderPalettePresetPreview(dom.controls.palettePresetSelect.value);
        if (dom.controls.palettePresetSelect.dataset.bound !== 'true') {
          dom.controls.palettePresetSelect.dataset.bound = 'true';
          dom.controls.palettePresetSelect.addEventListener('change', event => {
            const nextValue = event?.target instanceof HTMLSelectElement
              ? event.target.value
              : (dom.controls.palettePresetSelect?.value || getCurrentPalettePresetId());
            if (normalizeCurrentPalettePreset(nextValue, getCurrentPalettePresetId()) === CURRENT_PALETTE_PRESET_CUSTOM) {
              setCurrentPalettePresetId(CURRENT_PALETTE_PRESET_CUSTOM, { syncControl: true });
              return;
            }
            applyPalettePresetToCurrentPalette(nextValue, { announce: true });
          });
        }
      }
      if (dom.newProject?.palettePreset instanceof HTMLSelectElement) {
        dom.newProject.palettePreset.value = normalizeNewProjectPalettePreset(
          dom.newProject.palettePreset.value,
          getNewProjectPalettePresetId()
        );
        if (dom.newProject.palettePreset.dataset.bound !== 'true') {
          dom.newProject.palettePreset.dataset.bound = 'true';
          dom.newProject.palettePreset.addEventListener('change', event => {
            const nextValue = event?.target instanceof HTMLSelectElement
              ? event.target.value
              : (dom.newProject?.palettePreset?.value || getNewProjectPalettePresetId());
            setNewProjectPalettePresetId(nextValue, { persist: true, syncControl: true });
          });
        }
      }
      if (dom.controls.palettePresetPickerButton instanceof HTMLButtonElement && dom.controls.palettePresetPickerButton.dataset.bound !== 'true') {
        dom.controls.palettePresetPickerButton.dataset.bound = 'true';
        dom.controls.palettePresetPickerButton.addEventListener('click', () => {
          const isOpen = dom.controls.palettePresetPickerButton?.getAttribute('aria-expanded') === 'true';
          if (!isOpen) {
            setNewProjectPalettePresetPickerOpen(false);
          }
          setPalettePresetPickerOpen(!isOpen);
        });
      }
      if (dom.newProject?.palettePresetPickerButton instanceof HTMLButtonElement && dom.newProject.palettePresetPickerButton.dataset.bound !== 'true') {
        dom.newProject.palettePresetPickerButton.dataset.bound = 'true';
        dom.newProject.palettePresetPickerButton.addEventListener('click', () => {
          const isOpen = dom.newProject?.palettePresetPickerButton?.getAttribute('aria-expanded') === 'true';
          if (!isOpen) {
            setPalettePresetPickerOpen(false);
          }
          setNewProjectPalettePresetPickerOpen(!isOpen);
        });
      }
      if (!palettePresetPickerPointerBound) {
        palettePresetPickerPointerBound = true;
        document.addEventListener('pointerdown', event => {
          const targetNode = event.target instanceof Node ? event.target : null;
          if (
            dom.controls.palettePresetPicker instanceof HTMLElement
            && !dom.controls.palettePresetPicker.contains(targetNode)
          ) {
            setPalettePresetPickerOpen(false);
          }
          if (
            dom.newProject?.palettePresetPicker instanceof HTMLElement
            && !dom.newProject.palettePresetPicker.contains(targetNode)
          ) {
            setNewProjectPalettePresetPickerOpen(false);
          }
        });
      }
      if (!palettePresetPickerEscapeBound) {
        palettePresetPickerEscapeBound = true;
        document.addEventListener('keydown', event => {
          if (event.key === 'Escape') {
            setPalettePresetPickerOpen(false);
            setNewProjectPalettePresetPickerOpen(false);
          }
        });
      }
      if (!palettePresetPickerViewportBound) {
        palettePresetPickerViewportBound = true;
        const updateWhenOpen = event => {
          if (event?.type === 'resize') {
            schedulePalettePresetPickerRefresh();
          }
          const targetNode = event?.target instanceof Node ? event.target : null;
          if (event?.type === 'scroll' && targetNode) {
            if (
              dom.controls.palettePresetPickerMenu instanceof HTMLElement
              && dom.controls.palettePresetPickerMenu.contains(targetNode)
            ) {
              return;
            }
            if (
              dom.newProject?.palettePresetPickerMenu instanceof HTMLElement
              && dom.newProject.palettePresetPickerMenu.contains(targetNode)
            ) {
              return;
            }
          }
          if (dom.controls.palettePresetPickerButton?.getAttribute('aria-expanded') === 'true') {
            updatePalettePresetPickerMenuPosition();
          }
          if (dom.newProject?.palettePresetPickerButton?.getAttribute('aria-expanded') === 'true') {
            updateNewProjectPalettePresetPickerMenuPosition();
          }
        };
        window.addEventListener('resize', updateWhenOpen, { passive: true });
        window.addEventListener('scroll', updateWhenOpen, { passive: true, capture: true });
      }
      if (dom.controls.sortPaletteHue instanceof HTMLButtonElement && dom.controls.sortPaletteHue.dataset.bound !== 'true') {
        dom.controls.sortPaletteHue.dataset.bound = 'true';
        dom.controls.sortPaletteHue.addEventListener('click', () => {
          sortPaletteBy('hue');
        });
      }
      if (dom.controls.sortPaletteSaturation instanceof HTMLButtonElement && dom.controls.sortPaletteSaturation.dataset.bound !== 'true') {
        dom.controls.sortPaletteSaturation.dataset.bound = 'true';
        dom.controls.sortPaletteSaturation.addEventListener('click', () => {
          sortPaletteBy('saturation');
        });
      }
      if (dom.controls.sortPaletteValue instanceof HTMLButtonElement && dom.controls.sortPaletteValue.dataset.bound !== 'true') {
        dom.controls.sortPaletteValue.dataset.bound = 'true';
        dom.controls.sortPaletteValue.addEventListener('click', () => {
          sortPaletteBy('value');
        });
      }
      dom.controls.addPaletteColor?.addEventListener('click', () => {
        addPaletteColorFromCurrentEditor();
      });
  
      dom.controls.removePaletteColor?.addEventListener('click', () => {
        if (!isIndexColorMode()) {
          return;
        }
        if (!canCurrentClientReindexPalette()) {
          announcePaletteReindexRestriction();
          return;
        }
        if (state.palette.length <= 1) return;
        // 移動ボタンと同様に、削除はアクティブ（主選択）を対象にする
        const index = clamp(state.activePaletteIndex, 0, state.palette.length - 1);
        removePaletteColor(index);
      });
  
      dom.controls.movePaletteBackward?.addEventListener('click', () => {
        moveActivePaletteBy(-1);
      });
  
      dom.controls.movePaletteForward?.addEventListener('click', () => {
        moveActivePaletteBy(1);
      });
  
      dom.controls.paletteIndex?.addEventListener('change', () => {
        if (!isIndexColorMode()) {
          dom.controls.paletteIndex.value = String(state.activePaletteIndex);
          return;
        }
        if (!canCurrentClientReindexPalette()) {
          dom.controls.paletteIndex.value = String(state.activePaletteIndex);
          announcePaletteReindexRestriction();
          return;
        }
        const target = clamp(Number(dom.controls.paletteIndex.value), 0, state.palette.length - 1);
        if (Number.isNaN(target)) return;
        reorderPalette(state.activePaletteIndex, target);
      });
  
      if (Array.isArray(dom.controls.colorMode)) {
        dom.controls.colorMode.forEach(input => {
          if (!(input instanceof HTMLInputElement) || input.dataset.bound === 'true') {
            return;
          }
          input.dataset.bound = 'true';
          input.addEventListener('change', event => {
            if (!(event.target instanceof HTMLInputElement) || !event.target.checked) {
              return;
            }
            setColorMode(event.target.value, { persist: true });
          });
        });
      }
  
      dom.controls.paletteHue?.addEventListener('input', () => {
        handlePaletteSliderInput({ source: 'hue' });
      });
      dom.controls.paletteHue?.addEventListener('change', () => {
        commitPaletteColorHistorySession();
      });
  
      if (dom.controls.paletteHue) {
        dom.controls.paletteHue.style.background = 'linear-gradient(90deg, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)';
      }
  
      dom.controls.paletteSaturation?.addEventListener('input', () => {
        handlePaletteSliderInput({ source: 'saturation' });
      });
      dom.controls.paletteSaturation?.addEventListener('change', () => {
        commitPaletteColorHistorySession();
      });
  
      dom.controls.paletteValue?.addEventListener('input', () => {
        handlePaletteSliderInput({ source: 'value' });
      });
      dom.controls.paletteValue?.addEventListener('change', () => {
        commitPaletteColorHistorySession();
      });
  
      dom.controls.paletteAlphaSlider?.addEventListener('input', () => {
        handlePaletteSliderInput({ source: 'alpha' });
      });
      dom.controls.paletteAlphaSlider?.addEventListener('change', () => {
        commitPaletteColorHistorySession();
      });
  
      const wheel = dom.controls.paletteWheel;
      const wheelSurface = dom.controls.paletteWheelWrapper || wheel;
      if (wheel && typeof wheel.getContext === 'function') {
        paletteWheelCtx = wheel.getContext('2d', { willReadFrequently: true }) || null;
        if (wheelSurface) {
          wheelSurface.addEventListener('pointerdown', handlePaletteWheelPointerDown);
          wheelSurface.addEventListener('pointermove', handlePaletteWheelPointerMove);
          wheelSurface.addEventListener('pointerup', handlePaletteWheelPointerUp);
          wheelSurface.addEventListener('pointercancel', handlePaletteWheelPointerUp);
        }
      }
      setupPaletteWheelResizeObserver();
      window.addEventListener('resize', debounce(() => {
        drawPaletteWheel();
        updatePaletteWheelCursor();
      }, 160));
  
      syncColorModeControls();
      renderPalette();
      syncPaletteInputs();
      updateToolTabIcon();
    }
  
  
    function addPaletteColorFromCurrentEditor() {
      if (!canCurrentClientEditPaletteColors()) {
        return;
      }
      if (isIndexColorMode() && state.palette.length >= MAX_IMPORTED_PALETTE_COLORS) {
        updateAutosaveStatus(
          localizeText(
            'インデックスカラーは透明を含めて256色までです',
            'Indexed color supports up to 256 colors including transparency'
          ),
          'warn'
        );
        syncPaletteReindexControlState();
        return;
      }
      beginHistory('paletteAdd');
      const nextIndex = state.palette.length;
      const nextColor = isRgbColorMode()
        ? normalizeColorValue(
          getPaletteEditorTargetColor()
          || state.activeRgb
          || state.palette[state.activePaletteIndex]
          || state.palette[state.palette.length - 1]
          || { r: 88, g: 196, b: 255, a: 255 }
        )
        : getPresetBasedPaletteAddColor(dom.controls.palettePresetSelect?.value || getCurrentPalettePresetId());
      state.palette.push({ ...nextColor });
      state.activePaletteIndex = normalizePaletteIndex(nextIndex, state.activePaletteIndex);
      state.activeRgb = normalizeColorValue(nextColor);
      syncPaletteInputs();
      renderPalette();
      applyPaletteChange();
      commitHistory();
    }
  
  
    function reorderPalette(currentIndex, targetIndex, { setActive = true, setSecondary = false } = {}) {
      if (!canCurrentClientEditPaletteColors() || (isIndexColorMode() && !canCurrentClientReindexPalette())) return;
      const paletteLength = Array.isArray(state.palette) ? state.palette.length : 0;
      if (paletteLength < 2) return;
      const sourceIndex = clamp(Math.round(Number(currentIndex) || 0), 0, paletteLength - 1);
      const destinationIndex = clamp(Math.round(Number(targetIndex) || 0), 0, paletteLength - 1);
      if (sourceIndex === destinationIndex) return;
      beginHistory('paletteReorder');
      const order = state.palette.map((_, index) => index);
      const [movedOriginalIndex] = order.splice(sourceIndex, 1);
      order.splice(destinationIndex, 0, movedOriginalIndex);
      const mapping = new Array(order.length);
      order.forEach((oldIndex, newIndex) => {
        mapping[oldIndex] = newIndex;
      });
      const color = state.palette.splice(sourceIndex, 1)[0];
      state.palette.splice(destinationIndex, 0, color);
      const previousActive = state.activePaletteIndex;
      const previousSecondary = state.secondaryPaletteIndex;
      if (isIndexColorMode()) {
        remapPaletteIndices(mapping);
      }
      const newIndex = mapping[sourceIndex];
      // 表示を即時に反映させるため、state を直接更新してから再レンダリングする
      if (setActive) {
        state.activePaletteIndex = normalizePaletteIndex(newIndex, previousActive);
      } else if (setSecondary) {
        // 呼び出し側がアクティブを維持してセカンダリを更新したい場合
        state.secondaryPaletteIndex = normalizePaletteIndex(newIndex, previousActive);
      } else if (!isIndexColorMode()) {
        state.activePaletteIndex = normalizePaletteIndex(mapping[previousActive], previousActive);
        state.secondaryPaletteIndex = normalizePaletteIndex(mapping[previousSecondary], state.activePaletteIndex);
      }
      if (!isIndexColorMode()) {
        const activeColor = state.palette[state.activePaletteIndex] || state.palette[0];
        if (activeColor) {
          state.activeRgb = normalizeColorValue(activeColor);
        }
      }
      // DOM を再構築して選択表示を更新
      renderPalette();
      syncPaletteInputs();
      if (setActive) {
        focusUnifiedLeftContext('color', { persist: false });
      }
      applyPaletteChange({ renderSurfaces: isIndexColorMode() });
      commitHistory();
    }
  
  
    function setActivePaletteIndex(index) {
      const previousActivePaletteIndex = state.activePaletteIndex;
      const nextActivePaletteIndex = normalizePaletteIndex(index, state.activePaletteIndex);
      if (nextActivePaletteIndex === previousActivePaletteIndex) {
        focusUnifiedLeftContext('color', { persist: false });
        scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
        return;
      }
      state.activePaletteIndex = nextActivePaletteIndex;
      syncPaletteInputs();
      updatePaletteSelectionState(previousActivePaletteIndex, state.secondaryPaletteIndex);
      focusUnifiedLeftContext('color', { persist: false });
      scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
    }
  
  
    function setSecondaryPaletteIndex(index, { render = true, persist = true } = {}) {
      const previousSecondaryPaletteIndex = state.secondaryPaletteIndex;
      state.secondaryPaletteIndex = normalizePaletteIndex(index, state.activePaletteIndex);
      if (render) {
        updatePaletteSelectionState(state.activePaletteIndex, previousSecondaryPaletteIndex);
      }
      if (persist) {
        scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
      }
      focusUnifiedLeftContext('color', { persist: false });
    }
  
  
    function renderToolQuickPalette() {
      const container = dom.controls.toolQuickPalette;
      if (!(container instanceof HTMLElement)) {
        return;
      }
      if (isUnifiedLeftToolsColorMode() && getLayoutMode() !== 'mobilePortrait') {
        container.hidden = true;
        container.setAttribute('aria-hidden', 'true');
        // clear contents when hiding; no scroll preservation needed
        container.innerHTML = '';
        return;
      }
      container.hidden = false;
      container.setAttribute('aria-hidden', 'false');
      // preserve scroll position across full redraws to avoid jumping
      const mobileScrollState = captureMobilePanelScrollState('tools');
      const _prevToolQuickPaletteScroll = container.scrollTop || 0;
      container.innerHTML = '';
      if (!Array.isArray(state.palette) || !state.palette.length) {
        restoreMobilePanelScrollState(mobileScrollState);
        return;
      }
      const fragment = document.createDocumentFragment();
      const rgbMode = isRgbColorMode();
      const activePaletteIndex = normalizePaletteIndex(state.activePaletteIndex, state.activePaletteIndex);
      state.palette.forEach((color, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tool-quick-color__swatch pixel-frame';
        button.dataset.index = String(index);
        button.title = `${index}: ${rgbaToHex(color)}`;
        button.setAttribute('aria-label', `クイックカラー ${index}`);
        button.setAttribute('role', 'option');
        const normalizedColor = normalizeColorValue(color);
        const isActive = rgbMode
          ? index === activePaletteIndex
          : index === state.activePaletteIndex;
        const isSecondary = index === state.secondaryPaletteIndex;
        button.setAttribute('aria-selected', String(isActive));
        button.classList.toggle('is-active', isActive);
        button.classList.toggle('is-secondary', isSecondary);
        applyPixelFrameBackground(button, color);
        button.addEventListener('click', () => {
          if (rgbMode) {
            const previousActiveIndex = state.activePaletteIndex;
            state.activePaletteIndex = normalizePaletteIndex(index, state.activePaletteIndex);
            setActiveRgbColor(normalizedColor, { syncInputs: true, render: false, persist: true });
            updatePaletteSelectionState(previousActiveIndex, state.secondaryPaletteIndex);
            return;
          }
          setActivePaletteIndex(index);
        });
        button.addEventListener('contextmenu', event => {
          event.preventDefault();
          setSecondaryPaletteIndex(index);
        });
        fragment.appendChild(button);
      });
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'tool-quick-color__swatch tool-quick-color__swatch--add pixel-frame';
      addButton.textContent = '+';
      addButton.title = localizeText('色を追加', 'Add color');
      addButton.setAttribute('aria-label', localizeText('色を追加', 'Add color'));
      addButton.disabled = !canCurrentClientEditPaletteColors()
        || (isIndexColorMode() && state.palette.length >= MAX_IMPORTED_PALETTE_COLORS);
      addButton.addEventListener('click', () => {
        addPaletteColorFromCurrentEditor();
      });
      fragment.appendChild(addButton);
      container.appendChild(fragment);
      try {
        container.scrollTop = _prevToolQuickPaletteScroll;
      } catch (err) {
        // ignore on unexpected containers
      }
      restoreMobilePanelScrollState(mobileScrollState);
    }
  
  
    function syncPaletteInputs() {
      const color = getPaletteEditorTargetColor();
      if (!color) return;
      if (dom.controls.paletteIndex instanceof HTMLInputElement) {
        dom.controls.paletteIndex.value = String(state.activePaletteIndex);
      }
      const hsv = rgbaToHsv(color);
      paletteEditorState.hsv = {
        h: hsv.h,
        s: hsv.s,
        v: hsv.v,
        a: color.a,
      };
      if (dom.controls.paletteHue) {
        dom.controls.paletteHue.value = String(Math.round(hsv.h));
      }
      if (dom.controls.paletteSaturation) {
        dom.controls.paletteSaturation.value = String(Math.round(hsv.s * 100));
      }
      if (dom.controls.paletteValue) {
        dom.controls.paletteValue.value = String(Math.round(hsv.v * 100));
      }
      if (dom.controls.paletteAlphaSlider) {
        dom.controls.paletteAlphaSlider.value = String(color.a);
      }
      updatePaletteSliderOutputs();
      updatePaletteAlphaOutput();
      updatePalettePreview();
      drawPaletteWheel();
      updatePaletteWheelCursor();
      updateColorTabSwatch();
    }
  
  
    function renderPalette() {
      const container = dom.controls.paletteList;
      if (!container) return;
      // preserve scroll position so switching/refreshing the palette doesn't
      // reset the user's scroll to the top of the list
      const mobileScrollState = captureMobilePanelScrollState('tools');
      const _prevPaletteListScroll = container.scrollTop || 0;
      container.innerHTML = '';
      const rgbMode = isRgbColorMode();
      const activePaletteIndex = normalizePaletteIndex(state.activePaletteIndex, state.activePaletteIndex);
      state.palette.forEach((color, index) => {
        const button = document.createElement('button');
        // enable drag and drop reordering attributes
        button.draggable = true;
        button.addEventListener('dragstart', (ev) => {
          try {
            const dt = ev.dataTransfer;
            if (dt) dt.setData('text/plain', String(index));
          } catch (_) {}
          if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
          button.classList.add('dragging');
        });
        button.addEventListener('dragend', () => {
          button.classList.remove('dragging');
        });
        button.addEventListener('dragover', (ev) => {
          ev.preventDefault();
          if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
        });
        button.addEventListener('drop', (ev) => {
          ev.preventDefault();
          const dt = ev.dataTransfer;
          const src = dt ? dt.getData('text/plain') : null;
          if (!src) return;
          const srcIndex = Number(src);
          const dstIndex = Number(button.dataset.index);
          if (Number.isFinite(srcIndex) && Number.isFinite(dstIndex)) {
            reorderPalette(srcIndex, dstIndex, { setActive: true });
          }
        });
        button.type = 'button';
        button.className = 'palette-swatch pixel-frame';
        button.dataset.index = String(index);
        button.setAttribute('aria-label', `インデックス ${index}`);
        const normalizedColor = normalizeColorValue(color);
        const isActive = rgbMode
          ? index === activePaletteIndex
          : index === state.activePaletteIndex;
        const isSecondary = index === state.secondaryPaletteIndex;
        button.title = `${index}: ${rgbaToHex(color)}`;
        button.setAttribute('aria-selected', String(isActive));
        button.classList.toggle('is-active', isActive);
        button.classList.toggle('is-secondary', isSecondary);
        applyPixelFrameBackground(button, color);
        button.addEventListener('click', () => {
          if (rgbMode) {
            const previousActiveIndex = state.activePaletteIndex;
            state.activePaletteIndex = normalizePaletteIndex(index, state.activePaletteIndex);
            setActiveRgbColor(normalizedColor, { syncInputs: true, render: false, persist: true });
            updatePaletteSelectionState(previousActiveIndex, state.secondaryPaletteIndex);
            return;
          }
          setActivePaletteIndex(index);
        });
        button.addEventListener('contextmenu', event => {
          event.preventDefault();
          setSecondaryPaletteIndex(index);
        });
        container.appendChild(button);
      });
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'palette-swatch palette-swatch--add pixel-frame';
      addButton.textContent = '+';
      addButton.title = localizeText('色を追加', 'Add color');
      addButton.setAttribute('aria-label', localizeText('色を追加', 'Add color'));
      addButton.disabled = !canCurrentClientEditPaletteColors()
        || (isIndexColorMode() && state.palette.length >= MAX_IMPORTED_PALETTE_COLORS);
      addButton.addEventListener('click', () => {
        addPaletteColorFromCurrentEditor();
      });
      container.appendChild(addButton);
      // wire up import/export UI handlers (idempotent)
      try {
        const exportBtn = document.getElementById('exportPaletteJson');
        const importBtn = document.getElementById('importPaletteJson');
        const importInput = document.getElementById('importPaletteFile');
        // Hide import/export only when the left rail is in compact mode. When the
        // palette panel is opened (data-compact != "true") show the buttons.
        const isCompactRail = Boolean(dom.leftRail && String(dom.leftRail.getAttribute('data-compact') || '') === 'true');
        if (exportBtn instanceof HTMLElement) {
          exportBtn.hidden = isCompactRail;
          if (!isCompactRail && exportBtn.dataset.paletteExportBound !== 'true') {
            exportBtn.dataset.paletteExportBound = 'true';
            exportBtn.addEventListener('click', () => {
              try {
                const data = JSON.stringify(state.palette || []);
                const blob = new Blob([data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'palette.json';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } catch (err) {
                console.error('export palette failed', err);
              }
            });
          }
        }
        if (importBtn instanceof HTMLElement && importInput instanceof HTMLInputElement) {
          importBtn.hidden = isCompactRail;
          if (!isCompactRail && importBtn.dataset.paletteImportBound !== 'true') {
            importBtn.dataset.paletteImportBound = 'true';
            importBtn.addEventListener('click', () => importInput.click());
          }
          if (!isCompactRail && importInput.dataset.paletteImportChangeBound !== 'true') {
            importInput.dataset.paletteImportChangeBound = 'true';
            importInput.addEventListener('change', (ev) => {
              const target = ev.target;
              const files = target && target.files ? target.files : null;
              if (!files || !files.length) return;
              const file = files[0];
              const reader = new FileReader();
              reader.onload = () => {
                try {
                  const raw = String(reader.result || '');
                  const parsed = JSON.parse(raw);
                  if (Array.isArray(parsed)) {
                    beginHistory('paletteImport');
                    state.palette = parsed.map(entry => normalizeColorValue(entry));
                    state.activePaletteIndex = normalizePaletteIndex(0, 0);
                    state.secondaryPaletteIndex = normalizePaletteIndex(1, 0);
                    renderPalette();
                    syncPaletteInputs();
                    applyPaletteChange();
                    commitHistory();
                  } else {
                    updateAutosaveStatus(localizeText('無効なパレットファイルです', 'Invalid palette file'), 'error');
                  }
                } catch (err) {
                  console.error('import palette failed', err);
                  updateAutosaveStatus(localizeText('パレットの読み込みに失敗しました', 'Failed to load palette'), 'error');
                }
              };
              reader.readAsText(file);
              // reset input so same file can be selected again
              importInput.value = '';
            });
          }
        }
      } catch (err) {
        // ignore wiring failures
      }
      renderToolQuickPalette();
      updateColorTabSwatch();
      updateFloatingDrawButtonPalettePreview();
      syncPaletteReindexControlState();
      try {
        container.scrollTop = _prevPaletteListScroll;
      } catch (_) {
        // no-op if not applicable
      }
      restoreMobilePanelScrollState(mobileScrollState);
    }
  
  
    function updatePaletteSwatchColor(index, color) {
      const safeIndex = Math.round(Number(index));
      if (!Number.isFinite(safeIndex) || safeIndex < 0) {
        return;
      }
      const normalizedColor = normalizeColorValue(color);
      [dom.controls.paletteList, dom.controls.toolQuickPalette].forEach(container => {
        if (!(container instanceof HTMLElement)) {
          return;
        }
        const button = container.querySelector(`button[data-index="${safeIndex}"]`);
        if (!(button instanceof HTMLElement)) {
          return;
        }
        button.title = `${safeIndex}: ${rgbaToHex(normalizedColor)}`;
        applyPixelFrameBackground(button, normalizedColor);
      });
      updateColorTabSwatch();
      updateFloatingDrawButtonPalettePreview();
    }
  
  
    function updatePaletteSelectionState(previousActiveIndex = state.activePaletteIndex, previousSecondaryIndex = state.secondaryPaletteIndex) {
      const activePaletteIndex = normalizePaletteIndex(state.activePaletteIndex, state.activePaletteIndex);
      const secondaryPaletteIndex = normalizePaletteIndex(state.secondaryPaletteIndex, activePaletteIndex);
      const indexes = new Set([
        previousActiveIndex,
        previousSecondaryIndex,
        activePaletteIndex,
        secondaryPaletteIndex,
      ].map(value => Number.isFinite(value) ? Math.round(value) : -1));
      const rgbMode = isRgbColorMode();
      const updateContainer = (container) => {
        if (!(container instanceof HTMLElement)) {
          return;
        }
        indexes.forEach(index => {
          if (index < 0) {
            return;
          }
          const button = container.querySelector(`button[data-index="${index}"]`);
          if (!(button instanceof HTMLElement)) {
            return;
          }
          const isActive = rgbMode
            ? index === activePaletteIndex
            : index === state.activePaletteIndex;
          const isSecondary = index === secondaryPaletteIndex;
          button.classList.toggle('is-active', isActive);
          button.classList.toggle('is-secondary', isSecondary);
          button.setAttribute('aria-selected', String(isActive));
        });
      };
      updateContainer(dom.controls.paletteList);
      updateContainer(dom.controls.toolQuickPalette);
      syncPaletteReindexControlState();
      updateColorTabSwatch();
      updateFloatingDrawButtonPalettePreview();
    }
  
  
    function removePaletteColor(index) {
      if (!isIndexColorMode() || !canCurrentClientReindexPalette()) return;
      const paletteLength = Array.isArray(state.palette) ? state.palette.length : 0;
      const targetIndex = Math.round(Number(index));
      if (!Number.isFinite(targetIndex) || targetIndex < 0 || targetIndex >= paletteLength) return;
      beginHistory('paletteRemove');
      const mapping = state.palette.map((_, oldIndex) => {
        if (oldIndex === targetIndex) return -1;
        return oldIndex > targetIndex ? oldIndex - 1 : oldIndex;
      });
      state.palette.splice(targetIndex, 1);
      remapPaletteIndices(mapping);
      state.activePaletteIndex = normalizePaletteIndex(state.activePaletteIndex, state.activePaletteIndex);
      state.secondaryPaletteIndex = normalizePaletteIndex(state.secondaryPaletteIndex, state.activePaletteIndex);
      renderPalette();
      syncPaletteInputs();
      applyPaletteChange();
      commitHistory();
    }
  
  
    function remapPaletteIndices(mapping) {
      if (!mapping) return;
      forEachProjectCanvasLayer(({ layer }) => {
        const length = layer.indices.length;
        for (let i = 0; i < length; i += 1) {
          const oldIndex = layer.indices[i];
          if (oldIndex < 0) continue;
          const next = mapping[oldIndex];
          layer.indices[i] = typeof next === 'number' && next >= 0 ? next : -1;
        }
      });
      state.activePaletteIndex = normalizePaletteIndex(
        mapping[state.activePaletteIndex],
        state.activePaletteIndex
      );
      state.secondaryPaletteIndex = normalizePaletteIndex(
        mapping[state.secondaryPaletteIndex],
        state.activePaletteIndex
      );
    }
  
  
    function applyPaletteChange({ preserveCurrentPalettePreset = false, renderSurfaces = true } = {}) {
      if (preserveCurrentPalettePreset) {
        setCurrentPalettePresetId(getCurrentPalettePresetId(), { syncControl: true });
      } else {
        markCurrentPalettePresetCustom({ syncControl: true });
      }
      markHistoryDirty();
      requestRender();
      if (renderSurfaces) {
        renderAllProjectCanvasSurfaces();
      } else {
        scheduleSecondaryCanvasRefresh();
      }
      requestOverlayRender();
      scheduleSessionPersist();
      updateColorTabSwatch();
    }
  
  
    function applyPalettePreviewChange() {
      requestRender();
      scheduleSecondaryCanvasRefresh();
      requestOverlayRender();
      scheduleSessionPersist();
    }
  
  
    function beginPaletteColorHistorySession() {
      if (paletteEditorState.colorHistoryActive) {
        return;
      }
      if (history.pending) {
        return;
      }
      beginHistory('paletteColor');
      if (history.pending?.label !== 'paletteColor') {
        return;
      }
      paletteEditorState.colorHistoryActive = true;
      paletteEditorState.colorHistoryDirty = false;
    }
  
  
    function markPaletteColorHistoryDirty() {
      if (!paletteEditorState.colorHistoryActive || paletteEditorState.colorHistoryDirty) {
        return;
      }
      paletteEditorState.colorHistoryDirty = true;
      markCurrentPalettePresetCustom({ syncControl: true });
      markHistoryDirty();
    }
  
  
    function commitPaletteColorHistorySession() {
      if (!paletteEditorState.colorHistoryActive) {
        return;
      }
      const shouldCommit = paletteEditorState.colorHistoryDirty;
      paletteEditorState.colorHistoryActive = false;
      paletteEditorState.colorHistoryDirty = false;
      if (shouldCommit) {
        applyPaletteChange();
      }
      commitHistory();
    }
  
  
    function handlePaletteSliderInput({ source = 'unknown' } = {}) {
      if (!canCurrentClientEditPaletteColors()) return;
      if (!getPaletteEditorTargetColor()) return;
      beginPaletteColorHistorySession();
      focusUnifiedLeftContext('color', { persist: false });
      const hueValue = clamp(Number(dom.controls.paletteHue?.value ?? paletteEditorState.hsv.h), 0, 360);
      const saturationValue = clamp(Number(dom.controls.paletteSaturation?.value ?? paletteEditorState.hsv.s * 100), 0, 100) / 100;
      const valueValue = clamp(Number(dom.controls.paletteValue?.value ?? paletteEditorState.hsv.v * 100), 0, 100) / 100;
      const alphaValue = clamp(Number(dom.controls.paletteAlphaSlider?.value ?? paletteEditorState.hsv.a), 0, 255);
      paletteEditorState.hsv.h = hueValue;
      paletteEditorState.hsv.s = saturationValue;
      paletteEditorState.hsv.v = valueValue;
      paletteEditorState.hsv.a = alphaValue;
      if (source === 'hue' || source === 'saturation' || source === 'value') {
        drawPaletteWheel();
      }
      updatePaletteWheelCursor();
      updatePalettePreview();
      updatePaletteSliderOutputs();
      updatePaletteAlphaOutput();
      writePaletteColorFromHsv();
    }
  
  
    function updatePaletteSliderOutputs() {
      if (dom.controls.paletteHueValue) {
        dom.controls.paletteHueValue.textContent = String(Math.round(paletteEditorState.hsv.h));
      }
      if (dom.controls.paletteSaturationValue) {
        dom.controls.paletteSaturationValue.textContent = String(Math.round(clamp(paletteEditorState.hsv.s, 0, 1) * 100));
      }
      if (dom.controls.paletteValueValue) {
        dom.controls.paletteValueValue.textContent = String(Math.round(clamp(paletteEditorState.hsv.v, 0, 1) * 100));
      }
      if (dom.controls.paletteAlphaValue) {
        dom.controls.paletteAlphaValue.textContent = String(Math.round(clamp(paletteEditorState.hsv.a, 0, 255)));
      }
    }
  
  
    function updatePaletteAlphaOutput() {
      updatePaletteSliderOutputs();
      const alphaSlider = dom.controls.paletteAlphaSlider;
      if (alphaSlider) {
        const opaqueColor = hsvToRgba(paletteEditorState.hsv.h, paletteEditorState.hsv.s, paletteEditorState.hsv.v);
        alphaSlider.style.background = `linear-gradient(90deg, rgba(${opaqueColor.r}, ${opaqueColor.g}, ${opaqueColor.b}, 0) 0%, rgba(${opaqueColor.r}, ${opaqueColor.g}, ${opaqueColor.b}, 1) 100%)`;
      }
    }
  
  
    function updatePalettePreview() {
      const rgba = hsvToRgba(paletteEditorState.hsv.h, paletteEditorState.hsv.s, paletteEditorState.hsv.v);
      const saturationSlider = dom.controls.paletteSaturation;
      if (saturationSlider) {
        const startColor = hsvToRgba(paletteEditorState.hsv.h, 0, paletteEditorState.hsv.v);
        const endColor = hsvToRgba(paletteEditorState.hsv.h, 1, paletteEditorState.hsv.v);
        saturationSlider.style.background = `linear-gradient(90deg, ${rgbaToCss(startColor)} 0%, ${rgbaToCss(endColor)} 100%)`;
      }
      const valueSlider = dom.controls.paletteValue;
      if (valueSlider) {
        const lowColor = hsvToRgba(paletteEditorState.hsv.h, paletteEditorState.hsv.s, 0);
        const highColor = hsvToRgba(paletteEditorState.hsv.h, paletteEditorState.hsv.s, 1);
        valueSlider.style.background = `linear-gradient(90deg, ${rgbaToCss(lowColor)} 0%, ${rgbaToCss(highColor)} 100%)`;
      }
      updateColorTabSwatch();
    }
  
  
    function getPaletteWheelSurface() {
      return dom.controls.paletteWheelWrapper || dom.controls.paletteWheel;
    }
  
  
    function getPaletteWheelDisplaySize() {
      const surface = getPaletteWheelSurface();
      if (!surface) return 0;
      const rect = surface.getBoundingClientRect();
      return Math.max(0, Math.min(rect.width, rect.height));
    }
  
  
    function configurePaletteCanvas(canvas, displaySize = 0) {
      if (!canvas) return;
      const measuredSize = displaySize > 0
        ? displaySize
        : Math.max(0, Math.min(canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height));
      if (!measuredSize) return;
      const dpr = window.devicePixelRatio || 1;
      const size = Math.max(1, Math.round(measuredSize * dpr));
      if (canvas.width !== size || canvas.height !== size) {
        canvas.width = size;
        canvas.height = size;
        paletteWheelRenderKey = '';
      }
    }
  
  
    function setupPaletteWheelResizeObserver() {
      if (paletteWheelResizeObserver) {
        paletteWheelResizeObserver.disconnect();
        paletteWheelResizeObserver = null;
      }
      const surface = getPaletteWheelSurface();
      if (!surface || typeof ResizeObserver !== 'function') {
        return;
      }
      let frame = 0;
      paletteWheelResizeObserver = new ResizeObserver(() => {
        if (frame) {
          cancelAnimationFrame(frame);
        }
        frame = requestAnimationFrame(() => {
          frame = 0;
          drawPaletteWheel();
          updatePaletteWheelCursor();
        });
      });
      paletteWheelResizeObserver.observe(surface);
    }
  
  
    function getPaletteWheelMetrics(size) {
      const center = size / 2;
      const outerRadius = Math.max(2, (size / 2) - 0.5);
      const ringThickness = clamp(size * 0.14, 14, 26);
      const innerRadius = Math.max(8, outerRadius - ringThickness);
      const svHalf = Math.max(6, innerRadius / Math.SQRT2);
      const svLeft = center - svHalf;
      const svTop = center - svHalf;
      const svRight = center + svHalf;
      const svBottom = center + svHalf;
      const hueCursorRadius = innerRadius + ((outerRadius - innerRadius) * 0.5);
      const svSpan = Math.max(1, svRight - svLeft);
      return {
        center,
        outerRadius,
        innerRadius,
        hueCursorRadius,
        svLeft,
        svTop,
        svRight,
        svBottom,
        svSpan,
      };
    }
  
  
    function scalePaletteWheelMetrics(metrics, scale) {
      return {
        center: metrics.center * scale,
        outerRadius: metrics.outerRadius * scale,
        innerRadius: metrics.innerRadius * scale,
        hueCursorRadius: metrics.hueCursorRadius * scale,
        svLeft: metrics.svLeft * scale,
        svTop: metrics.svTop * scale,
        svRight: metrics.svRight * scale,
        svBottom: metrics.svBottom * scale,
        svSpan: metrics.svSpan * scale,
      };
    }
  
  
    function isPointInsideSvArea(x, y, metrics) {
      return x >= metrics.svLeft
        && x <= metrics.svRight
        && y >= metrics.svTop
        && y <= metrics.svBottom;
    }
  
  
    function drawPaletteWheel() {
      const canvas = dom.controls.paletteWheel;
      if (!canvas || !paletteWheelCtx) return;
      const displaySize = getPaletteWheelDisplaySize();
      if (!displaySize) return;
      configurePaletteCanvas(canvas, displaySize);
      const size = canvas.width;
      if (!size) return;
      const selectedHue = clamp(paletteEditorState.hsv.h, 0, 360);
      const renderKey = `${size}:${Math.round(displaySize * 1000)}:${Math.round(selectedHue * 100)}`;
      if (paletteWheelRenderKey === renderKey) {
        return;
      }
      const scale = size / displaySize;
      const displayMetrics = getPaletteWheelMetrics(displaySize);
      const metrics = scalePaletteWheelMetrics(displayMetrics, scale);
      const imageData = paletteWheelCtx.createImageData(size, size);
      const data = imageData.data;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const dx = x + 0.5 - metrics.center;
          const dy = y + 0.5 - metrics.center;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const index = (y * size + x) * 4;
          if (distance > metrics.outerRadius) {
            data[index + 3] = 0;
            continue;
          }
          let rgba;
          if (distance >= metrics.innerRadius) {
            let ringHue = Math.atan2(dy, dx) * (180 / Math.PI);
            if (ringHue < 0) ringHue += 360;
            rgba = hsvToRgba(ringHue, 1, 1);
          } else if (isPointInsideSvArea(x + 0.5, y + 0.5, metrics)) {
            const saturation = clamp((x + 0.5 - metrics.svLeft) / metrics.svSpan, 0, 1);
            const value = 1 - clamp((y + 0.5 - metrics.svTop) / metrics.svSpan, 0, 1);
            rgba = hsvToRgba(selectedHue, saturation, value);
          } else {
            rgba = { r: 16, g: 24, b: 36, a: 255 };
          }
          data[index] = rgba.r;
          data[index + 1] = rgba.g;
          data[index + 2] = rgba.b;
          data[index + 3] = 255;
        }
      }
      paletteWheelCtx.putImageData(imageData, 0, 0);
      paletteWheelRenderKey = renderKey;
    }
  
  
    function updatePaletteWheelCursor() {
      const hueCursor = dom.controls.paletteWheelCursor;
      const svCursor = dom.controls.paletteSvCursor;
      if (!hueCursor || !svCursor) return;
      const size = getPaletteWheelDisplaySize();
      if (!size) return;
      const metrics = getPaletteWheelMetrics(size);
  
      const hueSliderValue = Number(dom.controls.paletteHue?.value);
      const hue = Number.isFinite(hueSliderValue)
        ? clamp(hueSliderValue, 0, 360)
        : clamp(paletteEditorState.hsv.h, 0, 360);
      const hueAngle = (hue * Math.PI) / 180;
      const hx = metrics.center + Math.cos(hueAngle) * metrics.hueCursorRadius;
      const hy = metrics.center + Math.sin(hueAngle) * metrics.hueCursorRadius;
      hueCursor.style.left = `${hx}px`;
      hueCursor.style.top = `${hy}px`;
  
      const saturationSliderValue = Number(dom.controls.paletteSaturation?.value);
      const valueSliderValue = Number(dom.controls.paletteValue?.value);
      const saturation = Number.isFinite(saturationSliderValue)
        ? clamp(saturationSliderValue / 100, 0, 1)
        : clamp(paletteEditorState.hsv.s, 0, 1);
      const value = Number.isFinite(valueSliderValue)
        ? clamp(valueSliderValue / 100, 0, 1)
        : clamp(paletteEditorState.hsv.v, 0, 1);
      const sx = metrics.svLeft + (saturation * metrics.svSpan);
      const sy = metrics.svTop + ((1 - value) * metrics.svSpan);
      svCursor.style.left = `${sx}px`;
      svCursor.style.top = `${sy}px`;
    }
  
  
    function writePaletteColorFromHsv() {
      const rgba = hsvToRgba(paletteEditorState.hsv.h, paletteEditorState.hsv.s, paletteEditorState.hsv.v);
      rgba.a = Math.round(paletteEditorState.hsv.a);
      if (isRgbColorMode()) {
        const normalized = normalizeColorValue(rgba);
        state.activeRgb = normalized;
        const activeIndex = normalizePaletteIndex(state.activePaletteIndex, 0);
        const active = state.palette[activeIndex];
        const needsPaletteSync = !active || !colorsMatchRgba(active, normalized);
        if (needsPaletteSync) {
          if (active) {
            Object.assign(active, normalized);
          } else {
            state.palette[activeIndex] = { ...normalized };
          }
          markPaletteColorHistoryDirty();
          applyPalettePreviewChange();
        } else {
          scheduleSessionPersist();
        }
        updatePaletteSwatchColor(activeIndex, normalized);
        return;
      }
      const active = state.palette[state.activePaletteIndex];
      if (!active) return;
      Object.assign(active, rgba);
      markPaletteColorHistoryDirty();
      applyPalettePreviewChange();
      updatePaletteSwatchColor(state.activePaletteIndex, active);
    }
  
  
    function handlePaletteWheelPointerDown(event) {
      if (!canCurrentClientEditPaletteColors()) {
        return;
      }
      const wheelSurface = getPaletteWheelSurface();
      if (!wheelSurface) return;
      if (event.cancelable) {
        event.preventDefault();
      }
      if (paletteEditorState.wheelPointer.upHandler) {
        window.removeEventListener('pointerup', paletteEditorState.wheelPointer.upHandler);
        window.removeEventListener('pointercancel', paletteEditorState.wheelPointer.upHandler);
        paletteEditorState.wheelPointer.upHandler = null;
      }
      paletteEditorState.wheelPointer.active = true;
      paletteEditorState.wheelPointer.pointerId = event.pointerId;
      paletteEditorState.wheelPointer.mode = null;
      paletteEditorState.wheelPointer.captureTarget = wheelSurface;
      try {
        wheelSurface.setPointerCapture?.(event.pointerId);
      } catch (error) {
        // Some mobile browsers may reject pointer capture in edge cases.
      }
      beginPaletteColorHistorySession();
      updatePaletteFromWheelEvent(event);
      window.addEventListener('pointermove', handlePaletteWheelPointerMove, { passive: false });
      const pointerUpHandler = evt => handlePaletteWheelPointerUp(evt);
      paletteEditorState.wheelPointer.upHandler = pointerUpHandler;
      window.addEventListener('pointerup', pointerUpHandler);
      window.addEventListener('pointercancel', pointerUpHandler);
    }
  
  
    function handlePaletteWheelPointerMove(event) {
      if (!paletteEditorState.wheelPointer.active || event.pointerId !== paletteEditorState.wheelPointer.pointerId) {
        return;
      }
      if (event.cancelable) {
        event.preventDefault();
      }
      updatePaletteFromWheelEvent(event);
    }
  
  
    function handlePaletteWheelPointerUp(event) {
      if (!paletteEditorState.wheelPointer.active || (paletteEditorState.wheelPointer.pointerId !== null && event.pointerId !== paletteEditorState.wheelPointer.pointerId)) {
        return;
      }
      const captureTarget = paletteEditorState.wheelPointer.captureTarget;
      if (captureTarget && captureTarget.hasPointerCapture?.(event.pointerId)) {
        captureTarget.releasePointerCapture(event.pointerId);
      }
      paletteEditorState.wheelPointer.active = false;
      paletteEditorState.wheelPointer.pointerId = null;
      paletteEditorState.wheelPointer.mode = null;
      paletteEditorState.wheelPointer.captureTarget = null;
      if (paletteEditorState.wheelPointer.upHandler) {
        window.removeEventListener('pointerup', paletteEditorState.wheelPointer.upHandler);
        window.removeEventListener('pointercancel', paletteEditorState.wheelPointer.upHandler);
        paletteEditorState.wheelPointer.upHandler = null;
      }
      window.removeEventListener('pointermove', handlePaletteWheelPointerMove);
      commitPaletteColorHistorySession();
    }
  
  
    function updatePaletteFromWheelEvent(event) {
      const wheelSurface = getPaletteWheelSurface();
      if (!wheelSurface) return;
      const rect = wheelSurface.getBoundingClientRect();
      const size = Math.max(0, Math.min(rect.width, rect.height));
      if (!size) return;
      const x = clamp(event.clientX - rect.left, 0, size);
      const y = clamp(event.clientY - rect.top, 0, size);
      const metrics = getPaletteWheelMetrics(size);
      const dx = x - metrics.center;
      const dy = y - metrics.center;
      const inSvArea = isPointInsideSvArea(x, y, metrics);
      const mode = paletteEditorState.wheelPointer.mode
        || (inSvArea ? 'sv' : 'hue');
      paletteEditorState.wheelPointer.mode = mode;
  
      if (mode === 'hue') {
        let hue = Math.atan2(dy, dx) * (180 / Math.PI);
        if (hue < 0) hue += 360;
        paletteEditorState.hsv.h = hue;
        if (dom.controls.paletteHue) {
          dom.controls.paletteHue.value = String(Math.round(hue));
        }
        drawPaletteWheel();
      } else {
        const clampedX = clamp(x, metrics.svLeft, metrics.svRight);
        const clampedY = clamp(y, metrics.svTop, metrics.svBottom);
        const saturation = clamp((clampedX - metrics.svLeft) / metrics.svSpan, 0, 1);
        const value = 1 - clamp((clampedY - metrics.svTop) / metrics.svSpan, 0, 1);
        paletteEditorState.hsv.s = saturation;
        paletteEditorState.hsv.v = value;
        if (dom.controls.paletteSaturation) {
          dom.controls.paletteSaturation.value = String(Math.round(saturation * 100));
        }
        if (dom.controls.paletteValue) {
          dom.controls.paletteValue.value = String(Math.round(value * 100));
        }
      }
      updatePaletteWheelCursor();
      updatePalettePreview();
      updatePaletteSliderOutputs();
      updatePaletteAlphaOutput();
      writePaletteColorFromHsv();
    }
  
  
    return {
      syncPaletteReindexControlState,
      setActiveRgbColor,
      syncColorModeControls,
      remapDocumentDirectPixelsToCurrentPalette,
      convertCurrentDocumentRgbPixelsToIndexedPalette,
      reduceIndexedPaletteByClosestClusters,
      buildLayerColorDataPreferDirect,
      padIndexedPaletteToMaxColors,
      remapDocumentIndexedPixelsToDirect,
      convertIndexedDocumentToDirectForMultiPalette,
      mapActiveRgbToIndexedPalette,
      reserveUniquePaletteColor,
      getPresetBasedPaletteAddColor,
      dedupeIndexedPaletteColors,
      setColorMode,
      buildAppliedPaletteFromPreset,
      resolveTransparentStoragePaletteIndex,
      findNearestPaletteColorIndexByRgba,
      remapDocumentColorsToPaletteApprox,
      palettesMatch,
      applyPalettePresetToCurrentPalette,
      buildPaletteSortMetrics,
      comparePaletteSortMetrics,
      sortPaletteBy,
      moveActivePaletteBy,
      setupPaletteEditor,
      addPaletteColorFromCurrentEditor,
      reorderPalette,
      setActivePaletteIndex,
      setSecondaryPaletteIndex,
      renderToolQuickPalette,
      syncPaletteInputs,
      renderPalette,
      updatePaletteSwatchColor,
      updatePaletteSelectionState,
      removePaletteColor,
      remapPaletteIndices,
      applyPaletteChange,
      applyPalettePreviewChange,
      beginPaletteColorHistorySession,
      markPaletteColorHistoryDirty,
      commitPaletteColorHistorySession,
      handlePaletteSliderInput,
      updatePaletteSliderOutputs,
      updatePaletteAlphaOutput,
      updatePalettePreview,
      getPaletteWheelSurface,
      getPaletteWheelDisplaySize,
      configurePaletteCanvas,
      setupPaletteWheelResizeObserver,
      getPaletteWheelMetrics,
      scalePaletteWheelMetrics,
      isPointInsideSvArea,
      drawPaletteWheel,
      updatePaletteWheelCursor,
      writePaletteColorFromHsv,
      handlePaletteWheelPointerDown,
      handlePaletteWheelPointerMove,
      handlePaletteWheelPointerUp,
      updatePaletteFromWheelEvent,
    };
  }

  root.palettePanelUtils = {
    createPalettePanelUtils,
  };
})();
