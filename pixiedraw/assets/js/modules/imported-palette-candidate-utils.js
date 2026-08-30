(() => {
  const host = typeof window !== 'undefined'
    ? window
    : (typeof self !== 'undefined' ? self : globalThis);
  if (!host) return;
  const root = host.PiXiEEDrawModules = host.PiXiEEDrawModules || {};

  function createImportedPaletteCandidateUtils({
    extractUsedRgbaColors,
    buildImportedPalettePlan,
    normalizeColor = value => ({ r: Number(value?.r) || 0, g: Number(value?.g) || 0, b: Number(value?.b) || 0, a: Number(value?.a) || 0 }),
  } = {}) {
    function failure(code, phase, path = '', details = {}) {
      return { ok: false, code, phase, path, recoverable: true, details };
    }

    function cloneValue(value, seen = new WeakMap()) {
      if (value === null || typeof value !== 'object') return value;
      if (seen.has(value)) return seen.get(value);
      if (value instanceof Uint8ClampedArray || value instanceof Uint8Array || value instanceof Int16Array || value instanceof Int32Array) return new value.constructor(value);
      if (value instanceof ArrayBuffer) return value.slice(0);
      if (Array.isArray(value)) {
        const output = [];
        seen.set(value, output);
        value.forEach(entry => output.push(cloneValue(entry, seen)));
        return output;
      }
      const output = {};
      seen.set(value, output);
      Object.keys(value).forEach(key => { output[key] = cloneValue(value[key], seen); });
      return output;
    }

    function getSheets(payload) {
      if (Array.isArray(payload?.sheets) && payload.sheets.length) {
        return payload.sheets
          .map((sheet, index) => ({ sheet, project: sheet?.project, path: `sheets[${index}].project` }))
          .filter(entry => entry.project && typeof entry.project === 'object');
      }
      return payload?.document && typeof payload.document === 'object'
        ? [{ sheet: null, project: payload, path: '' }]
        : [];
    }

    function listCanvasFrames(documentPayload) {
      const canvases = Array.isArray(documentPayload?.canvases) && documentPayload.canvases.length
        ? documentPayload.canvases
        : [documentPayload];
      const maximumFrameCount = canvases.reduce((maximum, canvas) => Math.max(maximum, Array.isArray(canvas?.frames) ? canvas.frames.length : 0), 0);
      const output = [];
      for (let frameIndex = 0; frameIndex < maximumFrameCount; frameIndex += 1) {
        canvases.forEach((canvas, canvasIndex) => {
          const frame = Array.isArray(canvas?.frames) ? canvas.frames[frameIndex] : null;
          if (frame) output.push({ canvas, canvasIndex, frame, frameIndex });
        });
      }
      return output;
    }

    function decodeBase64(value) {
      if (typeof value !== 'string' || typeof atob !== 'function') return null;
      try {
        const text = atob(value);
        const bytes = new Uint8Array(text.length);
        for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
        return bytes;
      } catch (_) { return null; }
    }

    function encodeBase64(bytes) {
      if (!(bytes instanceof Uint8Array) || typeof btoa !== 'function') return null;
      let text = '';
      for (let index = 0; index < bytes.length; index += 0x8000) text += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      return btoa(text);
    }

    function decodeLayerValue(value, kind, expectedLength) {
      if (kind === 'direct' && value instanceof Uint8ClampedArray && value.length === expectedLength * 4) return new Uint8ClampedArray(value);
      if (kind === 'indices' && value instanceof Int16Array && value.length === expectedLength) return new Int16Array(value);
      const bytes = decodeBase64(value);
      if (!bytes) return null;
      if (kind === 'direct' && bytes.byteLength === expectedLength * 4) return new Uint8ClampedArray(bytes);
      if (kind === 'indices' && bytes.byteLength === expectedLength * 2) {
        const view = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        return view.length === expectedLength ? view : null;
      }
      return null;
    }

    function encodeLike(original, value) {
      if (typeof original === 'string') return encodeBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
      return value;
    }

    function readLayerPixels(layer, palette, pixelCount) {
      const expectedBytes = pixelCount * 4;
      const direct = decodeLayerValue(layer?.direct, 'direct', pixelCount)
        || decodeLayerValue(layer?.importSourceDirect, 'direct', pixelCount);
      if (direct) return direct;
      const indices = decodeLayerValue(layer?.indices, 'indices', pixelCount);
      if (!indices || !Array.isArray(palette)) return null;
      const pixels = new Uint8ClampedArray(expectedBytes);
      for (let index = 0; index < indices.length; index += 1) {
        const color = palette[indices[index]];
        if (!color) continue;
        const normalized = normalizeColor(color);
        const offset = index * 4;
        pixels[offset] = normalized.r;
        pixels[offset + 1] = normalized.g;
        pixels[offset + 2] = normalized.b;
        pixels[offset + 3] = normalized.a;
      }
      return pixels;
    }

    function collectSheetPixels(documentPayload) {
      const sourcePalette = Array.isArray(documentPayload?.palette) ? documentPayload.palette : [];
      const frames = [];
      const layers = [];
      let sourcePixelCount = 0;
      let typedBytesBefore = 0;
      listCanvasFrames(documentPayload).forEach(({ canvas, canvasIndex, frame, frameIndex }) => {
        const width = Math.max(1, Math.round(Number(canvas?.width || documentPayload?.width) || 1));
        const height = Math.max(1, Math.round(Number(canvas?.height || documentPayload?.height) || 1));
        const pixelCount = width * height;
        (Array.isArray(frame?.layers) ? frame.layers : []).forEach((layer, layerIndex) => {
          if (layer?.visible === false) return;
          const pixels = readLayerPixels(layer, sourcePalette, pixelCount);
          if (!pixels) return;
          [layer?.indices, layer?.direct, layer?.importSourceDirect].forEach(value => {
            if (ArrayBuffer.isView(value)) typedBytesBefore += value.byteLength;
          });
          const decodedIndices = decodeLayerValue(layer?.indices, 'indices', pixelCount);
          const hasDirectPixels = Boolean(decodeLayerValue(layer?.direct, 'direct', pixelCount) || decodeLayerValue(layer?.importSourceDirect, 'direct', pixelCount));
          frames.push(hasDirectPixels
            ? { imageData: { data: pixels }, sourceFrameIndex: frameIndex, sourceCanvasIndex: canvasIndex, sourceLayerIndex: layerIndex }
            : { indices: decodedIndices, sourceFrameIndex: frameIndex, sourceCanvasIndex: canvasIndex, sourceLayerIndex: layerIndex });
          layers.push({ layer, pixels, width, height, originalIndices: layer?.indices, path: `canvases[${canvasIndex}].frames[${frameIndex}].layers[${layerIndex}]` });
          sourcePixelCount += pixelCount;
        });
      });
      return { frames, layers, sourcePixelCount, sourcePalette, typedBytesBefore };
    }

    function countDocumentTypedBytes(documentPayload) {
      let total = 0;
      listCanvasFrames(documentPayload).forEach(({ frame }) => {
        (Array.isArray(frame?.layers) ? frame.layers : []).forEach(layer => {
          [layer?.indices, layer?.direct, layer?.importSourceDirect].forEach(value => {
            if (ArrayBuffer.isView(value)) total += value.byteLength;
          });
        });
      });
      return total;
    }

    function resolveIndexedLayerRemap(layerEntry, palettePlan, path) {
      const pixels = layerEntry.pixels;
      const pixelCount = Math.floor(pixels.length / 4);
      const remap = palettePlan?.pixelRemapPlan?.sourceColorToPaletteIndex;
      const colorToSourceIndex = new Map();
      palettePlan?.sourceColors?.forEach((color, index) => {
        const normalized = normalizeColor(color);
        if (normalized.a > 0) colorToSourceIndex.set(`${normalized.r},${normalized.g},${normalized.b},${normalized.a}`, index);
      });
      if (!Array.isArray(remap)) return failure('ERR_IMPORTED_INDEXED_REMAP_FAILED', 'remap', path);
      const indices = new Int16Array(pixelCount).fill(palettePlan.pixelRemapPlan.transparentIndex);
      let exactMappedPixelCount = 0;
      for (let index = 0; index < pixelCount; index += 1) {
        const offset = index * 4;
        if (pixels[offset + 3] === 0) continue;
        const key = `${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]},${pixels[offset + 3]}`;
        const sourceIndex = colorToSourceIndex.get(key);
        if (!Number.isInteger(sourceIndex) || !Number.isInteger(remap[sourceIndex])) {
          return failure('ERR_IMPORTED_INDEXED_REMAP_FAILED', 'remap', `${path}.indices[${index}]`);
        }
        indices[index] = remap[sourceIndex];
        exactMappedPixelCount += 1;
      }
      return { ok: true, indices, exactMappedPixelCount };
    }

    function createDrawColorPlan(mode, palette) {
      const firstOpaqueIndex = palette.findIndex(color => normalizeColor(color).a > 0);
      if (mode === 'indexed') {
        return {
          mode: 'indexed',
          activePaletteIndexCandidate: firstOpaqueIndex >= 0 ? firstOpaqueIndex : 0,
          synchronizeDrawColor: true,
        };
      }
      return {
        mode: 'rgb',
        activeRgbCandidate: firstOpaqueIndex >= 0 ? normalizeColor(palette[firstOpaqueIndex]) : null,
        preservePaletteIndependence: true,
      };
    }

    function applyImportedPalettePlanToCanonicalCandidate({
      decodedPayload,
      sourceKind = '',
      colorMode = 'rgb',
      sourcePalette = null,
      existingPalette = null,
      paletteCapacity = 256,
      quantizer = null,
      normalizeCanonicalV2,
      validateCanonicalV2,
      sourceMetadata = null,
      options = {},
    } = {}) {
      if (!decodedPayload || typeof decodedPayload !== 'object') return failure('ERR_IMPORTED_PALETTE_SOURCE_INVALID', 'source', 'decodedPayload');
      if (typeof extractUsedRgbaColors !== 'function' || typeof buildImportedPalettePlan !== 'function') {
        return failure('ERR_IMPORTED_PALETTE_PLAN_INVALID', 'plan', '', { reason: 'planning-utils-unavailable' });
      }
      if (typeof normalizeCanonicalV2 !== 'function') return failure('ERR_IMPORTED_PALETTE_CANONICAL_NORMALIZE_FAILED', 'normalize', '', { reason: 'normalizer-unavailable' });
      if (typeof validateCanonicalV2 !== 'function') return failure('ERR_IMPORTED_PALETTE_CANONICAL_VALIDATION_FAILED', 'validate', '', { reason: 'validator-unavailable' });
      const candidate = cloneValue(decodedPayload);
      const sheets = getSheets(candidate);
      if (!sheets.length) return failure('ERR_IMPORTED_PALETTE_SOURCE_INVALID', 'source', 'document');
      const warnings = [];
      const metrics = { sheetCount: sheets.length, canvasCount: 0, frameCount: 0, sourcePixelCount: 0, sourceUniqueColorCount: 0, outputPaletteColorCount: 0, transparentPixelCount: 0, semiTransparentColorCount: 0, quantized: false, quantizerId: '', remappedPixelCount: 0, exactMappedPixelCount: 0, typedBytesBefore: 0, typedBytesAfter: 0, warningCount: 0 };
      const sheetPlans = [];

      for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex += 1) {
        const { project, path } = sheets[sheetIndex];
        const documentPayload = project?.document;
        if (!documentPayload || typeof documentPayload !== 'object') return failure('ERR_IMPORTED_PALETTE_SOURCE_INVALID', 'source', `${path}.document`);
        const collected = collectSheetPixels(documentPayload);
        if (!collected.frames.length) return failure('ERR_IMPORTED_PALETTE_COLOR_EXTRACTION_FAILED', 'extract', `${path}.document`);
        const effectiveSourcePalette = sourcePalette || documentPayload.palette || null;
        const extraction = extractUsedRgbaColors({ frames: collected.frames, sourcePalette: effectiveSourcePalette });
        const plan = buildImportedPalettePlan({ mode: colorMode, usedColors: extraction.colors, sourcePalette: effectiveSourcePalette, paletteCapacity, quantizer });
        if (!plan?.ok) return failure(plan?.code || 'ERR_IMPORTED_PALETTE_PLAN_INVALID', 'plan', path, plan?.metrics || {});
        plan.sourceColors = extraction.colors.map(color => ({ ...color }));
        documentPayload.colorMode = colorMode === 'indexed' ? 'indexed' : 'rgb';
        if (documentPayload.colorMode === 'rgb') {
          const configuredPalette = Array.isArray(existingPalette) ? existingPalette : documentPayload.palette;
          documentPayload.palette = Array.isArray(configuredPalette)
            ? configuredPalette.map(color => normalizeColor(color))
            : [];
          plan.palette = documentPayload.palette.map(color => ({ ...color }));
          plan.outputColorCount = plan.palette.length;
          plan.warnings = [];
        } else {
          documentPayload.palette = plan.palette.map(color => normalizeColor(color));
        }
        const drawColorPlan = createDrawColorPlan(documentPayload.colorMode, documentPayload.palette);
        if (documentPayload.colorMode === 'indexed') {
          documentPayload.activePaletteIndex = drawColorPlan.activePaletteIndexCandidate;
          documentPayload.secondaryPaletteIndex = plan.pixelRemapPlan.transparentIndex;
          documentPayload.activeRgb = normalizeColor(documentPayload.palette[drawColorPlan.activePaletteIndexCandidate] || documentPayload.palette[0]);
          for (const layerEntry of collected.layers) {
            const remapped = resolveIndexedLayerRemap(layerEntry, plan, `${path}.document.${layerEntry.path}`);
            if (!remapped.ok) return remapped;
            layerEntry.layer.indices = encodeLike(layerEntry.originalIndices, remapped.indices);
            layerEntry.layer.direct = null;
            layerEntry.layer.importSourceDirect = null;
            layerEntry.layer.directOnly = false;
            metrics.remappedPixelCount += remapped.indices.length;
            metrics.exactMappedPixelCount += remapped.exactMappedPixelCount;
          }
        } else {
          documentPayload.activeRgb = normalizeColor(documentPayload.activeRgb || drawColorPlan.activeRgbCandidate || { r: 0, g: 0, b: 0, a: 0 });
          documentPayload.activePaletteIndex = Number.isInteger(documentPayload.activePaletteIndex) ? documentPayload.activePaletteIndex : 0;
          documentPayload.secondaryPaletteIndex = Number.isInteger(documentPayload.secondaryPaletteIndex) ? documentPayload.secondaryPaletteIndex : 0;
        }
        metrics.canvasCount += Array.isArray(documentPayload.canvases) ? documentPayload.canvases.length : 1;
        metrics.frameCount += collected.frames.length;
        metrics.sourcePixelCount += collected.sourcePixelCount;
        metrics.typedBytesBefore += collected.typedBytesBefore;
        metrics.sourceUniqueColorCount += extraction.totalUniqueColorCount;
        metrics.outputPaletteColorCount += documentPayload.palette.length;
        metrics.transparentPixelCount += extraction.transparentPixelCount;
        metrics.semiTransparentColorCount += extraction.semiTransparentColorCount;
        metrics.quantized = metrics.quantized || Boolean(plan.quantized);
        metrics.quantizerId = plan.quantizerId || metrics.quantizerId;
        if (plan.quantized) warnings.push('WARN_IMPORTED_PALETTE_QUANTIZED');
        if (documentPayload.colorMode === 'rgb' && documentPayload.palette.length > paletteCapacity) warnings.push('WARN_IMPORTED_PALETTE_LARGE_RGB_PALETTE');
        metrics.typedBytesAfter += countDocumentTypedBytes(documentPayload);
        sheetPlans.push({ sheetIndex, palettePlan: plan, drawColorPlan });
      }

      let normalized;
      try {
        normalized = normalizeCanonicalV2({ sourceKind, sourceAdapterId: null, decodedPayload: candidate, sourceMetadata, options });
      } catch (error) {
        return failure('ERR_IMPORTED_PALETTE_CANONICAL_NORMALIZE_FAILED', 'normalize', '', { reason: error?.code || error?.message || '' });
      }
      if (!normalized?.ok || !normalized.canonicalPayload) return failure('ERR_IMPORTED_PALETTE_CANONICAL_NORMALIZE_FAILED', 'normalize', '', normalized || {});
      let validation;
      try {
        validation = validateCanonicalV2(normalized.canonicalPayload);
      } catch (error) {
        return failure('ERR_IMPORTED_PALETTE_CANONICAL_VALIDATION_FAILED', 'validate', '', { reason: error?.code || error?.message || '' });
      }
      if (!validation?.ok) return failure('ERR_IMPORTED_PALETTE_CANONICAL_VALIDATION_FAILED', 'validate', validation?.path || '', validation || {});
      metrics.warningCount = warnings.length;
      return { ok: true, canonicalPayload: normalized.canonicalPayload, palettePlan: sheetPlans.length === 1 ? sheetPlans[0] : sheetPlans, metrics, warnings };
    }

    return Object.freeze({ applyImportedPalettePlanToCanonicalCandidate });
  }

  root.importedPaletteCandidateUtils = { createImportedPaletteCandidateUtils };
})();
