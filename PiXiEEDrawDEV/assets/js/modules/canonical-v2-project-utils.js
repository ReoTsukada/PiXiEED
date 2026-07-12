(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  const CANONICAL_V2_SCHEMA_VERSION = 1;
  const CANONICAL_V2_PAYLOAD_FORMAT = 'v2';
  const KNOWN_SOURCE_KINDS = new Set([
    'new', 'file', 'recent', 'autosave', 'shared-local', 'import-image',
    'import-gif', 'recovery', 'mixed', 'unknown',
  ]);
  const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

  function failure(code, phase, path, details = '') {
    return { ok: false, code, phase, path, recoverable: true, details };
  }

  function warning(code, path) {
    return { code, path };
  }

  function isTypedArray(value) {
    return ArrayBuffer.isView(value) && !(value instanceof DataView);
  }

  function isUnsafeObject(value) {
    if (!value || typeof value !== 'object') return false;
    if (typeof value.nodeType === 'number' || typeof value.nodeName === 'string') return true;
    if ((value.kind === 'file' || value.kind === 'directory')
      && (typeof value.getFile === 'function' || typeof value.requestPermission === 'function')) return true;
    if (typeof value.close === 'function' && Number.isFinite(value.width) && Number.isFinite(value.height)) return true;
    return false;
  }

  function cloneSafe(value, path = 'project', seen = new WeakMap()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw failure('ERR_CANONICAL_V2_INPUT_INVALID', 'clone', path, 'non-finite-number');
      return value;
    }
    if (typeof value === 'undefined') return undefined;
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
      throw failure('ERR_CANONICAL_V2_UNSAFE_VALUE', 'clone', path, typeof value);
    }
    if (value instanceof ArrayBuffer) return value.slice(0);
    if (isTypedArray(value)) return new value.constructor(value);
    if (isUnsafeObject(value)) throw failure('ERR_CANONICAL_V2_UNSAFE_VALUE', 'clone', path, 'unsafe-object');
    if (seen.has(value)) throw failure('ERR_CANONICAL_V2_INPUT_INVALID', 'clone', path, 'circular-value');
    if (Array.isArray(value)) {
      const result = [];
      seen.set(value, result);
      value.forEach((entry, index) => {
        const cloned = cloneSafe(entry, `${path}[${index}]`, seen);
        if (cloned !== undefined) result.push(cloned);
      });
      seen.delete(value);
      return result;
    }
    if (Object.prototype.toString.call(value) !== '[object Object]') {
      throw failure('ERR_CANONICAL_V2_UNSAFE_VALUE', 'clone', path, 'non-plain-object');
    }
    const result = {};
    seen.set(value, result);
    Object.keys(value).forEach(key => {
      if (UNSAFE_KEYS.has(key)) throw failure('ERR_CANONICAL_V2_UNSAFE_VALUE', 'clone', `${path}.${key}`, 'unsafe-key');
      const cloned = cloneSafe(value[key], `${path}.${key}`, seen);
      if (cloned !== undefined) result[key] = cloned;
    });
    seen.delete(value);
    return result;
  }

  function countSerializedBytes(value, seen = new WeakSet()) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'string') {
      // Base64 is common in packaged payloads. Estimate decoded data when applicable.
      return /^[A-Za-z0-9+/]*={0,2}$/.test(value) && value.length % 4 === 0
        ? Math.max(0, Math.floor((value.length * 3) / 4) - (value.endsWith('==') ? 2 : (value.endsWith('=') ? 1 : 0)))
        : new TextEncoder().encode(value).byteLength;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return 8;
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (isTypedArray(value)) return value.byteLength;
    if (typeof value !== 'object' || seen.has(value)) return 0;
    seen.add(value);
    const result = Array.isArray(value)
      ? value.reduce((total, entry) => total + countSerializedBytes(entry, seen), 0)
      : Object.entries(value).reduce((total, [key, entry]) => total + new TextEncoder().encode(key).byteLength + countSerializedBytes(entry, seen), 0);
    seen.delete(value);
    return result;
  }

  function assertId(value, code, path) {
    if (typeof value !== 'string' || !value.trim()) throw failure(code, 'validate', path, 'missing-id');
    return value;
  }

  function assertPositiveInteger(value, path) {
    if (!Number.isInteger(value) || value < 1) throw failure('ERR_CANONICAL_V2_CANVAS_INVALID', 'validate', path, 'invalid-dimension');
  }

  function validateGifSourceMetadata(source) {
    if (source?.sourceKind !== 'import-gif') return null;
    const path = 'payload.canonicalSourceMetadata';
    const has = key => Object.prototype.hasOwnProperty.call(source, key);
    if (has('gifLoopCount')) {
      const value = source.gifLoopCount;
      if (value !== null && (!Number.isInteger(value) || value < 0)) {
        return failure('ERR_CANONICAL_V2_GIF_LOOP_COUNT_INVALID', 'validate', `${path}.gifLoopCount`, 'invalid-loop-count');
      }
    }
    if (has('sourceMimeType') && source.sourceMimeType !== 'image/gif') {
      return failure('ERR_CANONICAL_V2_GIF_METADATA_INVALID', 'validate', `${path}.sourceMimeType`, 'expected-image-gif');
    }
    if (has('sourceFileBytes') && (!Number.isInteger(source.sourceFileBytes) || source.sourceFileBytes < 0)) {
      return failure('ERR_CANONICAL_V2_GIF_METADATA_INVALID', 'validate', `${path}.sourceFileBytes`, 'invalid-byte-length');
    }
    if (has('sourceWidth') && (!Number.isInteger(source.sourceWidth) || source.sourceWidth < 1)) {
      return failure('ERR_CANONICAL_V2_GIF_DIMENSION_INVALID', 'validate', `${path}.sourceWidth`, 'invalid-width');
    }
    if (has('sourceHeight') && (!Number.isInteger(source.sourceHeight) || source.sourceHeight < 1)) {
      return failure('ERR_CANONICAL_V2_GIF_DIMENSION_INVALID', 'validate', `${path}.sourceHeight`, 'invalid-height');
    }
    if (has('sourceFrameCount') && (!Number.isInteger(source.sourceFrameCount) || source.sourceFrameCount < 1)) {
      return failure('ERR_CANONICAL_V2_GIF_FRAME_COUNT_INVALID', 'validate', `${path}.sourceFrameCount`, 'invalid-frame-count');
    }
    return null;
  }

  function validateLayer(layer, path, width, height, ids, metrics) {
    if (!layer || typeof layer !== 'object') throw failure('ERR_CANONICAL_V2_LAYER_INVALID', 'validate', path, 'invalid-layer');
    const id = assertId(layer.id, 'ERR_CANONICAL_V2_LAYER_INVALID', `${path}.id`);
    if (ids.layers.has(id)) throw failure('ERR_CANONICAL_V2_DUPLICATE_ID', 'validate', `${path}.id`, 'duplicate-layer-id');
    ids.layers.add(id);
    if (layer.opacity !== undefined && (!Number.isFinite(Number(layer.opacity)) || Number(layer.opacity) < 0 || Number(layer.opacity) > 1)) {
      throw failure('ERR_CANONICAL_V2_LAYER_INVALID', 'validate', `${path}.opacity`, 'invalid-opacity');
    }
    const pixelCount = width * height;
    if (isTypedArray(layer.indices) && layer.indices.length !== pixelCount) {
      throw failure('ERR_CANONICAL_V2_TYPED_DATA_INVALID', 'validate', `${path}.indices`, 'indexed-length');
    }
    for (const key of ['direct', 'importSourceDirect']) {
      if (isTypedArray(layer[key]) && layer[key].byteLength !== pixelCount * 4) {
        throw failure('ERR_CANONICAL_V2_TYPED_DATA_INVALID', 'validate', `${path}.${key}`, 'direct-length');
      }
    }
    const bitmapRef = layer.bitmapId || layer?.cel?.bitmapId || layer?.cel?.bitmapRef || '';
    if (bitmapRef) metrics.bitmapReferences.push({ path, id: String(bitmapRef) });
    metrics.layerCount += 1;
  }

  function validateCanvas(canvas, path, ids, metrics) {
    if (!canvas || typeof canvas !== 'object') throw failure('ERR_CANONICAL_V2_CANVAS_INVALID', 'validate', path, 'invalid-canvas');
    const id = assertId(canvas.id, 'ERR_CANONICAL_V2_CANVAS_INVALID', `${path}.id`);
    if (ids.canvases.has(id)) throw failure('ERR_CANONICAL_V2_DUPLICATE_ID', 'validate', `${path}.id`, 'duplicate-canvas-id');
    ids.canvases.add(id);
    assertPositiveInteger(canvas.width, `${path}.width`);
    assertPositiveInteger(canvas.height, `${path}.height`);
    if (!Array.isArray(canvas.frames) || !canvas.frames.length) throw failure('ERR_CANONICAL_V2_FRAME_INVALID', 'validate', `${path}.frames`, 'missing-frames');
    const activeFrame = Number(canvas.activeFrame ?? 0);
    if (!Number.isInteger(activeFrame) || activeFrame < 0 || activeFrame >= canvas.frames.length) {
      throw failure('ERR_CANONICAL_V2_FRAME_INVALID', 'validate', `${path}.activeFrame`, 'invalid-active-frame');
    }
    canvas.frames.forEach((frame, frameIndex) => {
      const framePath = `${path}.frames[${frameIndex}]`;
      if (!frame || typeof frame !== 'object') throw failure('ERR_CANONICAL_V2_FRAME_INVALID', 'validate', framePath, 'invalid-frame');
      const frameId = assertId(frame.id, 'ERR_CANONICAL_V2_FRAME_INVALID', `${framePath}.id`);
      if (ids.frames.has(frameId)) throw failure('ERR_CANONICAL_V2_DUPLICATE_ID', 'validate', `${framePath}.id`, 'duplicate-frame-id');
      ids.frames.add(frameId);
      if (!Number.isFinite(Number(frame.duration ?? 0)) || Number(frame.duration ?? 0) < 0) {
        throw failure('ERR_CANONICAL_V2_FRAME_INVALID', 'validate', `${framePath}.duration`, 'invalid-duration');
      }
      if (!Array.isArray(frame.layers) || !frame.layers.length) throw failure('ERR_CANONICAL_V2_LAYER_INVALID', 'validate', `${framePath}.layers`, 'missing-layers');
      frame.layers.forEach((layer, layerIndex) => validateLayer(layer, `${framePath}.layers[${layerIndex}]`, canvas.width, canvas.height, ids, metrics));
      metrics.frameCount += 1;
    });
    const activeLayers = canvas.frames[activeFrame].layers;
    if (typeof canvas.activeLayer === 'string' && canvas.activeLayer
      && !activeLayers.some(layer => layer?.id === canvas.activeLayer)) {
      throw failure('ERR_CANONICAL_V2_LAYER_INVALID', 'validate', `${path}.activeLayer`, 'invalid-active-layer');
    }
    metrics.canvasCount += 1;
  }

  function resolveSheetEntries(project, warnings) {
    if (Array.isArray(project.sheets) && project.sheets.length) return project.sheets;
    const rootSheetId = typeof project.activeSheetId === 'string' && project.activeSheetId
      ? project.activeSheetId
      : 'root';
    warnings.push(warning('WARN_CANONICAL_V2_OPTIONAL_FIELD_DEFAULTED', 'project.sheets'));
    return [{ id: rootSheetId, project }];
  }

  function validateCanonicalV2ProjectPayload(payload) {
    const warnings = [];
    try {
      if (!payload || typeof payload !== 'object') return failure('ERR_CANONICAL_V2_INPUT_INVALID', 'validate', 'payload', 'missing-payload');
      if (payload.canonicalPayloadFormat !== CANONICAL_V2_PAYLOAD_FORMAT) return failure('ERR_CANONICAL_V2_PROJECT_INVALID', 'validate', 'payload.canonicalPayloadFormat', 'unexpected-format');
      if (Number(payload.canonicalSchemaVersion) !== CANONICAL_V2_SCHEMA_VERSION) return failure('ERR_CANONICAL_V2_PROJECT_INVALID', 'validate', 'payload.canonicalSchemaVersion', 'unexpected-version');
      const isLegacyWrapper = Boolean(payload.project && typeof payload.project === 'object' && !payload.document);
      const project = isLegacyWrapper ? payload.project : payload;
      if (!project || !project.document || typeof project.document !== 'object') return failure('ERR_CANONICAL_V2_PROJECT_INVALID', 'validate', 'payload.project.document', 'missing-document');
      const source = payload.canonicalSourceMetadata && typeof payload.canonicalSourceMetadata === 'object' ? payload.canonicalSourceMetadata : {};
      if (!KNOWN_SOURCE_KINDS.has(source.sourceKind || 'unknown')) warnings.push(warning('WARN_CANONICAL_V2_UNKNOWN_SOURCE_KIND', 'payload.canonicalSourceMetadata.sourceKind'));
      const gifMetadataFailure = validateGifSourceMetadata(source);
      if (gifMetadataFailure) return gifMetadataFailure;

      const sheets = resolveSheetEntries(project, warnings);
      const ids = { sheets: new Set(), canvases: new Set(), frames: new Set(), layers: new Set(), bitmaps: new Set() };
      const metrics = { sheetCount: 0, canvasCount: 0, frameCount: 0, layerCount: 0, bitmapCount: 0, typedByteLength: 0, estimatedCanonicalBytes: 0, bitmapReferences: [] };
      const sheetOrder = Array.isArray(project.sheetOrder) ? project.sheetOrder : sheets.map(sheet => sheet?.id);
      if (sheetOrder.length !== sheets.length) return failure('ERR_CANONICAL_V2_PROJECT_INVALID', 'validate', 'payload.project.sheetOrder', 'sheet-order-count');
      sheets.forEach((sheet, sheetIndex) => {
        const path = `payload.project.sheets[${sheetIndex}]`;
        if (!sheet || typeof sheet !== 'object') throw failure('ERR_CANONICAL_V2_SHEET_INVALID', 'validate', path, 'invalid-sheet');
        const id = assertId(sheet.id, 'ERR_CANONICAL_V2_SHEET_INVALID', `${path}.id`);
        if (ids.sheets.has(id)) throw failure('ERR_CANONICAL_V2_DUPLICATE_ID', 'validate', `${path}.id`, 'duplicate-sheet-id');
        ids.sheets.add(id);
        if (!sheetOrder.includes(id)) throw failure('ERR_CANONICAL_V2_PROJECT_INVALID', 'validate', 'payload.project.sheetOrder', 'sheet-order-reference');
        const sheetProject = sheet.project && typeof sheet.project === 'object' ? sheet.project : project;
        const documentValue = sheetProject.document && typeof sheetProject.document === 'object' ? sheetProject.document : null;
        if (!documentValue) throw failure('ERR_CANONICAL_V2_SHEET_INVALID', 'validate', `${path}.project.document`, 'missing-document');
        const fallbackCanvasId = typeof documentValue.activeCanvasId === 'string' && documentValue.activeCanvasId
          ? documentValue.activeCanvasId
          : `canvas-root-${id}`;
        const canvases = Array.isArray(documentValue.canvases) && documentValue.canvases.length
          ? documentValue.canvases
          : [{ ...documentValue, id: fallbackCanvasId }];
        const activeCanvasId = typeof documentValue.activeCanvasId === 'string' && documentValue.activeCanvasId
          ? documentValue.activeCanvasId
          : fallbackCanvasId;
        if (!canvases.some(canvas => canvas?.id === activeCanvasId)) throw failure('ERR_CANONICAL_V2_CANVAS_INVALID', 'validate', `${path}.project.document.activeCanvasId`, 'invalid-active-canvas');
        canvases.forEach((canvas, canvasIndex) => validateCanvas(canvas, `${path}.project.document.canvases[${canvasIndex}]`, ids, metrics));
        metrics.sheetCount += 1;
      });
      const activeSheetId = typeof project.activeSheetId === 'string' && project.activeSheetId ? project.activeSheetId : sheets[0]?.id;
      if (!ids.sheets.has(activeSheetId)) return failure('ERR_CANONICAL_V2_SHEET_INVALID', 'validate', 'payload.project.activeSheetId', 'invalid-active-sheet');

      const bitmapTable = Array.isArray(project.bitmaps) ? project.bitmaps : [];
      bitmapTable.forEach((bitmap, index) => {
        const path = `payload.project.bitmaps[${index}]`;
        const id = assertId(bitmap?.id, 'ERR_CANONICAL_V2_BITMAP_INVALID', `${path}.id`);
        if (ids.bitmaps.has(id)) throw failure('ERR_CANONICAL_V2_DUPLICATE_ID', 'validate', `${path}.id`, 'duplicate-bitmap-id');
        ids.bitmaps.add(id);
        assertPositiveInteger(bitmap.width, `${path}.width`);
        assertPositiveInteger(bitmap.height, `${path}.height`);
        if (bitmap.data !== undefined && !isTypedArray(bitmap.data) && !(bitmap.data instanceof ArrayBuffer) && typeof bitmap.data !== 'string') {
          throw failure('ERR_CANONICAL_V2_TYPED_DATA_INVALID', 'validate', `${path}.data`, 'unsupported-bitmap-data');
        }
        metrics.bitmapCount += 1;
      });
      for (const reference of metrics.bitmapReferences) {
        if (reference.id.startsWith('bitmaps/')) continue; // V2 archive reference is validated by the archive codec.
        if (!ids.bitmaps.has(reference.id)) return failure('ERR_CANONICAL_V2_REFERENCE_MISSING', 'validate', reference.path, 'bitmap-reference');
      }
      metrics.typedByteLength = countSerializedBytes(project);
      metrics.estimatedCanonicalBytes = metrics.typedByteLength + new TextEncoder().encode(JSON.stringify({ sheetOrder, activeSheetId })).byteLength;
      metrics.warningCount = warnings.length;
      delete metrics.bitmapReferences;
      return { ok: true, metrics, warnings };
    } catch (error) {
      if (error?.ok === false) return error;
      return failure(error?.code || 'ERR_CANONICAL_V2_NORMALIZE_FAILED', error?.phase || 'validate', error?.path || 'payload', error?.details || 'validation-failed');
    }
  }

  function normalizeExternalProjectToCanonicalV2({ sourceKind = 'unknown', sourceAdapterId = null, decodedPayload = null, sourceMetadata = {}, options = {} } = {}) {
    try {
      if (!decodedPayload || typeof decodedPayload !== 'object' || Array.isArray(decodedPayload)) {
        return failure('ERR_CANONICAL_V2_INPUT_INVALID', 'normalize', 'decodedPayload', 'invalid-payload');
      }
      const project = cloneSafe(decodedPayload, 'decodedPayload');
      const warnings = [];
      const normalizedSourceKind = typeof sourceKind === 'string' && sourceKind.trim() ? sourceKind.trim() : 'unknown';
      if (!KNOWN_SOURCE_KINDS.has(normalizedSourceKind)) warnings.push(warning('WARN_CANONICAL_V2_UNKNOWN_SOURCE_KIND', 'sourceKind'));
      const rawMetadata = sourceMetadata && typeof sourceMetadata === 'object' ? sourceMetadata : {};
      const rawGifMetadataFailure = validateGifSourceMetadata({ ...rawMetadata, sourceKind: normalizedSourceKind });
      if (rawGifMetadataFailure) return rawGifMetadataFailure;
      const metadata = cloneSafe(rawMetadata, 'sourceMetadata');
      const canonicalPayload = {
        ...project,
        canonicalPayloadFormat: CANONICAL_V2_PAYLOAD_FORMAT,
        canonicalSchemaVersion: CANONICAL_V2_SCHEMA_VERSION,
        canonicalSourceMetadata: {
          ...metadata,
          sourceKind: normalizedSourceKind,
          sourceAdapterId: typeof sourceAdapterId === 'string' && sourceAdapterId.trim() ? sourceAdapterId.trim() : null,
        },
      };
      if (!canonicalPayload.metadata || typeof canonicalPayload.metadata !== 'object') {
        canonicalPayload.metadata = {};
        warnings.push(warning('WARN_CANONICAL_V2_OPTIONAL_FIELD_DEFAULTED', 'decodedPayload.metadata'));
      }
      if (typeof canonicalPayload.document?.documentName !== 'string') {
        canonicalPayload.document = { ...(canonicalPayload.document || {}), documentName: '' };
        warnings.push(warning('WARN_CANONICAL_V2_OPTIONAL_FIELD_DEFAULTED', 'decodedPayload.document.documentName'));
      }
      const validation = validateCanonicalV2ProjectPayload(canonicalPayload);
      if (!validation.ok) return validation;
      const allWarnings = [...warnings, ...validation.warnings];
      return {
        ok: true,
        canonicalPayload,
        canonicalMetadata: {
          schemaVersion: CANONICAL_V2_SCHEMA_VERSION,
          canonicalPayloadFormat: CANONICAL_V2_PAYLOAD_FORMAT,
          sourceKind: normalizedSourceKind,
          sourceAdapterId: canonicalPayload.canonicalSourceMetadata.sourceAdapterId,
          projectId: typeof metadata.projectId === 'string' ? metadata.projectId : '',
          sheetOrder: Array.isArray(canonicalPayload.sheetOrder)
            ? canonicalPayload.sheetOrder.slice()
            : (Array.isArray(canonicalPayload.sheets) && canonicalPayload.sheets.length ? canonicalPayload.sheets.map(sheet => sheet.id) : [canonicalPayload.activeSheetId || 'root']),
          activeSheetId: canonicalPayload.activeSheetId || (canonicalPayload.sheets?.[0]?.id || 'root'),
        },
        metrics: { ...validation.metrics, warningCount: allWarnings.length },
        warnings: allWarnings,
      };
    } catch (error) {
      if (error?.ok === false) return error;
      return failure(error?.code || 'ERR_CANONICAL_V2_NORMALIZE_FAILED', error?.phase || 'normalize', error?.path || 'decodedPayload', error?.details || 'normalization-failed');
    }
  }

  function inspectCanonicalV2ProjectPayload(payload) {
    const validation = validateCanonicalV2ProjectPayload(payload);
    if (!validation.ok) return validation;
    const source = payload?.canonicalSourceMetadata || {};
    const loopCount = source?.gifLoopCount;
    const gifLoopCountKind = !Object.prototype.hasOwnProperty.call(source, 'gifLoopCount')
      ? 'missing'
      : loopCount === null ? 'no-extension'
        : loopCount === 0 ? 'infinite' : 'finite';
    return {
      ok: true,
      schemaVersion: Number(payload.canonicalSchemaVersion),
      hasProjectId: Boolean(payload?.canonicalSourceMetadata?.projectId),
      sourceKind: source.sourceKind || 'unknown',
      sourceAdapterId: source.sourceAdapterId || null,
      hasGifSourceMetadata: source.sourceKind === 'import-gif' && Object.prototype.hasOwnProperty.call(source, 'gifLoopCount'),
      gifLoopCountKind,
      canonicalPayloadFormat: payload.canonicalPayloadFormat,
      ...validation.metrics,
      warnings: validation.warnings,
    };
  }

  root.canonicalV2ProjectUtils = Object.freeze({
    CANONICAL_V2_SCHEMA_VERSION,
    CANONICAL_V2_PAYLOAD_FORMAT,
    normalizeExternalProjectToCanonicalV2,
    validateCanonicalV2ProjectPayload,
    inspectCanonicalV2ProjectPayload,
  });
})();
