(() => {
  const host = typeof window !== 'undefined'
    ? window
    : (typeof self !== 'undefined' ? self : globalThis);
  if (!host) return;

  const root = host.PiXiEEDrawModules = host.PiXiEEDrawModules || {};

  function createImportedPalettePlanningUtils() {
    function normalizeColor(value) {
      const channel = input => Math.max(0, Math.min(255, Math.round(Number(input) || 0)));
      return { r: channel(value?.r), g: channel(value?.g), b: channel(value?.b), a: channel(value?.a) };
    }

    function colorKey(color) {
      const normalized = normalizeColor(color);
      return normalized.a <= 0 ? 'transparent' : `${normalized.r},${normalized.g},${normalized.b},${normalized.a}`;
    }

    function getFramePixels(frame) {
      const candidates = [frame?.imageData?.data, frame?.rgba, frame?.data, frame?.direct];
      return candidates.find(value => value instanceof Uint8ClampedArray || value instanceof Uint8Array) || null;
    }

    function listFramesInDeterministicOrder(canvases, frames) {
      if (Array.isArray(frames) && frames.length) return frames.map(frame => ({ frame, canvasIndex: 0 }));
      const sources = Array.isArray(canvases) ? canvases : [];
      const maximumFrameCount = sources.reduce((maximum, canvas) => Math.max(maximum, Array.isArray(canvas?.frames) ? canvas.frames.length : 0), 0);
      const output = [];
      for (let frameIndex = 0; frameIndex < maximumFrameCount; frameIndex += 1) {
        sources.forEach((canvas, canvasIndex) => {
          const frame = Array.isArray(canvas?.frames) ? canvas.frames[frameIndex] : null;
          if (frame) output.push({ frame, canvasIndex });
        });
      }
      return output;
    }

    /** Pure extraction: input pixel arrays, frame objects, and palettes are never changed. */
    function extractUsedRgbaColors({
      canvases = [],
      frames = [],
      sourcePalette = null,
      transparentPolicy = 'single-transparent',
      ordering = 'source-palette-or-first-seen',
    } = {}) {
      const colorEntries = [];
      const byKey = new Map();
      let transparentPixelCount = 0;
      const orderedFrames = listFramesInDeterministicOrder(canvases, frames);
      const palette = Array.isArray(sourcePalette) ? sourcePalette.map(normalizeColor) : null;
      const sourcePaletteUsage = new Set();

      const addColor = color => {
        const normalized = normalizeColor(color);
        if (normalized.a <= 0) {
          transparentPixelCount += 1;
          return;
        }
        const key = colorKey(normalized);
        const existing = byKey.get(key);
        if (existing) {
          existing.count += 1;
          return;
        }
        const entry = { ...normalized, count: 1, sourceIndex: colorEntries.length };
        byKey.set(key, entry);
        colorEntries.push(entry);
      };

      orderedFrames.forEach(({ frame }) => {
        const indices = frame?.indices instanceof Int16Array || frame?.indices instanceof Int32Array
          ? frame.indices
          : null;
        if (palette && indices) {
          for (let index = 0; index < indices.length; index += 1) {
            const paletteIndex = indices[index];
            if (paletteIndex < 0 || !palette[paletteIndex]) {
              transparentPixelCount += 1;
              continue;
            }
            if (palette[paletteIndex].a <= 0) {
              transparentPixelCount += 1;
              continue;
            }
            sourcePaletteUsage.add(paletteIndex);
          }
          return;
        }
        const pixels = getFramePixels(frame);
        if (!pixels) return;
        for (let index = 0; index + 3 < pixels.length; index += 4) {
          addColor({ r: pixels[index], g: pixels[index + 1], b: pixels[index + 2], a: pixels[index + 3] });
        }
      });

      let colors = colorEntries;
      let sourcePaletteOrderUsed = false;
      if (palette && sourcePaletteUsage.size && ordering === 'source-palette-or-first-seen') {
        sourcePaletteOrderUsed = true;
        colors = [];
        palette.forEach((color, paletteIndex) => {
          if (!sourcePaletteUsage.has(paletteIndex)) return;
          if (color.a <= 0) return;
          const key = colorKey(color);
          const existing = byKey.get(key);
          colors.push({ ...color, count: existing?.count || 1, sourceIndex: colors.length, sourcePaletteIndex: paletteIndex });
        });
      }
      const opaqueColorCount = colors.filter(color => color.a === 255).length;
      const semiTransparentColorCount = colors.filter(color => color.a > 0 && color.a < 255).length;
      return {
        colors: colors.map(color => ({ ...color })),
        transparentPixelCount,
        opaqueColorCount,
        semiTransparentColorCount,
        totalUniqueColorCount: colors.length,
        sourcePaletteOrderUsed,
        transparentPolicy,
      };
    }

    function createFailure(code, extras = {}) {
      return { ok: false, code, palette: [], pixelRemapPlan: null, warnings: [], metrics: {}, ...extras };
    }

    function buildImportedPalettePlan({
      mode = 'rgb',
      usedColors = [],
      sourcePalette = null,
      paletteCapacity = 256,
      quantizer = null,
    } = {}) {
      const normalizedMode = mode === 'indexed' ? 'indexed' : 'rgb';
      const capacity = Math.max(1, Math.round(Number(paletteCapacity) || 0));
      const colors = Array.isArray(usedColors)
        ? usedColors.map((color, sourceIndex) => ({ ...normalizeColor(color), count: Math.max(1, Math.round(Number(color?.count) || 1)), sourceIndex }))
          .filter(color => color.a > 0)
        : [];
      const transparent = { r: 0, g: 0, b: 0, a: 0 };
      const availableColorSlots = normalizedMode === 'indexed' ? Math.max(0, capacity - 1) : capacity;
      const metrics = { sourceColorCount: colors.length, paletteCapacity: capacity, availableColorSlots };
      if (normalizedMode === 'rgb') {
        return {
          ok: true,
          palette: colors.map(normalizeColor),
          pixelRemapPlan: null,
          quantized: false,
          quantizerId: '',
          sourceColorCount: colors.length,
          outputColorCount: colors.length,
          warnings: colors.length > capacity ? ['rgb-palette-exceeds-requested-capacity-pixels-unchanged'] : [],
          metrics,
        };
      }
      const requiresQuantization = colors.length > availableColorSlots;

      if (requiresQuantization && typeof quantizer !== 'function') {
        return createFailure(
        'ERR_IMPORTED_PALETTE_QUANTIZER_UNAVAILABLE',
          { metrics }
        );
      }

      let selectedColors = colors;
      let mapping = colors.map((_, index) => index);
      let quantized = false;
      if (requiresQuantization) {
        let result;
        try {
          result = quantizer(colors.map(color => ({ ...color })), availableColorSlots);
        } catch (error) {
          return createFailure('ERR_IMPORTED_PALETTE_QUANTIZATION_FAILED', { metrics, cause: error?.code || error?.message || '' });
        }
        if (!result || !Array.isArray(result.palette) || !Array.isArray(result.sourceIndexToPaletteIndex)) {
          return createFailure('ERR_IMPORTED_PALETTE_PLAN_INVALID', { metrics });
        }
        selectedColors = result.palette.map(normalizeColor).filter(color => color.a > 0);
        mapping = colors.map((_, index) => result.sourceIndexToPaletteIndex[index]);
        if (selectedColors.length > availableColorSlots || mapping.some(index => !Number.isInteger(index) || index < 0 || index >= selectedColors.length)) {
          return createFailure('ERR_IMPORTED_PALETTE_PLAN_INVALID', { metrics });
        }
        quantized = true;
      }

      const palette = [transparent, ...selectedColors];
      const pixelRemapPlan = {
        transparentIndex: 0,
        sourceColorToPaletteIndex: mapping.map(index => index + 1),
        sourcePalette,
      };
      return {
        ok: true,
        palette: palette.map(normalizeColor),
        pixelRemapPlan,
        quantized,
        quantizerId: quantized ? 'injected-existing-quantizer' : '',
        sourceColorCount: colors.length,
        outputColorCount: selectedColors.length,
        warnings: [],
        metrics,
      };
    }

    return Object.freeze({
      extractUsedRgbaColors,
      buildImportedPalettePlan,
    });
  }

  root.importedPalettePlanningUtils = {
    createImportedPalettePlanningUtils,
  };
})();
