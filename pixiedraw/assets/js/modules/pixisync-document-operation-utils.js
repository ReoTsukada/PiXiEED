(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  const MAX_DOCUMENT_OPERATION_BYTES = 262144;
  const MAX_DOCUMENT_DEPTH = 12;
  const STRUCTURE_LABELS = new Set([
    'addLayer', 'duplicateLayer', 'pasteLayer', 'removeLayer',
    'moveLayer', 'moveLayerUp', 'moveLayerDown', 'reorderLayer',
    'addFrame', 'duplicateFrame', 'pasteFrame', 'removeFrame',
    'moveFrame', 'moveFrameLeft', 'moveFrameRight', 'reorderFrame',
    'addCanvas', 'removeCanvas', 'reorderCanvas', 'resizeCanvas',
  ]);
  const PALETTE_LABELS = new Set([
    'paletteColor', 'paletteAdd', 'paletteRemove', 'paletteReorder',
    'paletteApplyPreset', 'paletteImport',
  ]);
  const LAYER_PROPERTY_LABELS = new Set(['setLayerOpacity', 'setLayerBlendMode']);
  const FRAME_PROPERTY_LABELS = new Set(['setFrameFps', 'setAllFrameFps']);
  const LOCAL_ONLY_LABELS = new Set([
    'setLayerVisibility',
    'setOnionSkin',
    'toggleOnionSkin',
  ]);
  // A structural edit changes the meaning of every following pixel target.
  // Sending only its layer/frame metadata made each peer retain its own raster
  // snapshot, so a small delivery difference could become a permanent visual
  // divergence.  Use an ordered full-document checkpoint for *every*
  // structure edit; personal visibility remains excluded by checkpoint capture.
  const CHECKPOINT_STRUCTURE_LABELS = new Set([
    ...STRUCTURE_LABELS,
    'clearCanvas', 'scaleSprite',
    'selectionOutline4', 'selectionOutline8',
    'selectionPaste',
  ]);
  const CHECKPOINT_PALETTE_LABELS = new Set([
    'paletteRemove', 'paletteReorder', 'paletteApplyPreset', 'paletteImport',
  ]);

  function fail(reason) {
    throw new Error(`PiXiSYNC document codec: ${reason}`);
  }

  function assertPlainJson(value, depth = 0) {
    if (depth > MAX_DOCUMENT_DEPTH) fail('payload-too-deep');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) fail('non-finite-number');
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(entry => assertPlainJson(entry, depth + 1));
      return;
    }
    if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
      fail('non-plain-value');
    }
    for (const [key, entry] of Object.entries(value)) {
      if (!key || key === '__proto__' || key === 'prototype' || key === 'constructor') fail('unsafe-key');
      assertPlainJson(entry, depth + 1);
    }
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }

  function assertId(value, field) {
    if (typeof value !== 'string' || value.length < 1 || value.length > 128) fail(`invalid-${field}`);
    return value;
  }

  function assertKeys(value, allowed, field) {
    const allow = new Set(allowed);
    for (const key of Object.keys(value || {})) {
      if (!allow.has(key)) fail(`unknown-${field}-key`);
    }
  }

  function assertColor(value) {
    if (!value || typeof value !== 'object') fail('invalid-color');
    for (const channel of ['r', 'g', 'b', 'a']) {
      if (!Number.isInteger(value[channel]) || value[channel] < 0 || value[channel] > 255) fail('invalid-color');
    }
  }

  function validateStructure(document) {
    if (!document || typeof document !== 'object') fail('invalid-structure');
    assertKeys(document, ['palette', 'canvases'], 'document');
    if (!Array.isArray(document.palette) || document.palette.length < 1 || document.palette.length > 255) fail('invalid-palette');
    document.palette.forEach(assertColor);
    if (!Array.isArray(document.canvases) || document.canvases.length < 1 || document.canvases.length > 64) fail('invalid-canvases');
    const seen = new Set();
    document.canvases.forEach(canvas => {
      assertKeys(canvas, ['id', 'name', 'width', 'height', 'frames'], 'canvas');
      assertId(canvas?.id, 'canvas-id');
      if (seen.has(canvas.id)) fail('duplicate-id');
      seen.add(canvas.id);
      if (!Number.isInteger(canvas.width) || canvas.width < 1 || canvas.width > 16384) fail('invalid-canvas-width');
      if (!Number.isInteger(canvas.height) || canvas.height < 1 || canvas.height > 16384) fail('invalid-canvas-height');
      if ((canvas.width * canvas.height) > 268435456) fail('canvas-too-large');
      if (!Array.isArray(canvas.frames) || canvas.frames.length < 1 || canvas.frames.length > 4096) fail('invalid-frames');
      canvas.frames.forEach(frame => {
        assertKeys(frame, ['id', 'name', 'duration', 'layers'], 'frame');
        assertId(frame?.id, 'frame-id');
        if (seen.has(frame.id)) fail('duplicate-id');
        seen.add(frame.id);
        if (!Number.isFinite(frame.duration) || frame.duration < 1 || frame.duration > 655350) fail('invalid-frame-duration');
        if (!Array.isArray(frame.layers) || frame.layers.length < 1 || frame.layers.length > 4096) fail('invalid-layers');
        frame.layers.forEach(layer => {
          if (Object.prototype.hasOwnProperty.call(layer, 'visible')) fail('visibility-must-be-local');
          for (const rasterKey of ['indices', 'direct', 'importSourceDirect']) {
            if (Object.prototype.hasOwnProperty.call(layer, rasterKey)) fail('raster-not-allowed-in-structure');
          }
          assertKeys(layer, ['id', 'trackId', 'name', 'opacity', 'blendMode'], 'layer');
          assertId(layer?.id, 'layer-id');
          assertId(layer?.trackId, 'track-id');
          if (seen.has(layer.id)) fail('duplicate-id');
          seen.add(layer.id);
          if (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) fail('invalid-layer-opacity');
          if (typeof layer.blendMode !== 'string' || layer.blendMode.length < 1 || layer.blendMode.length > 32) fail('invalid-blend-mode');
        });
      });
    });
  }

  function validateOperation(operation) {
    assertPlainJson(operation);
    if (operation?.version !== 1) fail('unsupported-version');
    switch (operation.type) {
      case 'document_structure':
        assertKeys(operation, ['version', 'type', 'document'], 'operation');
        validateStructure(operation.document);
        break;
      case 'palette':
        assertKeys(operation, ['version', 'type', 'palette'], 'operation');
        if (!Array.isArray(operation.palette) || operation.palette.length < 1 || operation.palette.length > 255) fail('invalid-palette');
        operation.palette.forEach(assertColor);
        break;
      case 'layer_properties':
        assertKeys(operation, ['version', 'type', 'layers'], 'operation');
        if (!Array.isArray(operation.layers) || !operation.layers.length) fail('invalid-layer-properties');
        operation.layers.forEach(layer => {
          if (Object.prototype.hasOwnProperty.call(layer, 'visible')) fail('visibility-must-be-local');
          assertKeys(layer, ['layerId', 'opacity', 'blendMode'], 'layer-properties');
          assertId(layer?.layerId, 'layer-id');
          if (layer.opacity !== undefined && (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1)) fail('invalid-layer-opacity');
          if (layer.blendMode !== undefined && (typeof layer.blendMode !== 'string' || !layer.blendMode || layer.blendMode.length > 32)) fail('invalid-blend-mode');
          if (layer.opacity === undefined && layer.blendMode === undefined) fail('empty-layer-properties');
        });
        break;
      case 'frame_properties':
        assertKeys(operation, ['version', 'type', 'frames'], 'operation');
        if (!Array.isArray(operation.frames) || !operation.frames.length) fail('invalid-frame-properties');
        operation.frames.forEach(frame => {
          assertKeys(frame, ['frameId', 'duration'], 'frame-properties');
          assertId(frame?.frameId, 'frame-id');
          if (!Number.isFinite(frame.duration) || frame.duration < 1 || frame.duration > 655350) fail('invalid-frame-duration');
        });
        break;
      case 'checkpoint_restore':
        assertKeys(operation, ['version', 'type', 'objectPath', 'sha256Hex', 'byteLength'], 'operation');
        if (
          typeof operation.objectPath !== 'string'
          || !/^rooms\/[0-9a-f-]{36}\/document-checkpoints\/[0-9a-f-]{36}\.pxd$/.test(operation.objectPath)
        ) fail('invalid-checkpoint-object-path');
        if (typeof operation.sha256Hex !== 'string' || !/^[0-9a-f]{64}$/i.test(operation.sha256Hex)) {
          fail('invalid-checkpoint-sha256');
        }
        if (!Number.isSafeInteger(operation.byteLength) || operation.byteLength < 1 || operation.byteLength > 52428800) {
          fail('invalid-checkpoint-byte-length');
        }
        break;
      default:
        fail('unsupported-operation-type');
    }
    return operation;
  }

  function encode(operation) {
    validateOperation(operation);
    const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(operation)));
    if (bytes.length < 2 || bytes.length > MAX_DOCUMENT_OPERATION_BYTES) fail('payload-size-out-of-range');
    return bytes;
  }

  function decode(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 2 || bytes.length > MAX_DOCUMENT_OPERATION_BYTES) fail('payload-size-out-of-range');
    let parsed;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch (_) { fail('invalid-json'); }
    return validateOperation(parsed);
  }

  function classifyHistoryLabel(label) {
    const normalized = String(label || '');
    if (LOCAL_ONLY_LABELS.has(normalized)) return 'local-only';
    if (CHECKPOINT_STRUCTURE_LABELS.has(normalized) || CHECKPOINT_PALETTE_LABELS.has(normalized)) {
      return 'checkpoint_restore';
    }
    if (STRUCTURE_LABELS.has(normalized)) return 'document_structure';
    if (PALETTE_LABELS.has(normalized)) return 'palette';
    if (LAYER_PROPERTY_LABELS.has(normalized)) return 'layer_properties';
    if (FRAME_PROPERTY_LABELS.has(normalized)) return 'frame_properties';
    return '';
  }

  root.pixisyncDocumentOperationUtils = Object.freeze({
    MAX_DOCUMENT_OPERATION_BYTES,
    STRUCTURE_LABELS,
    PALETTE_LABELS,
    LAYER_PROPERTY_LABELS,
    FRAME_PROPERTY_LABELS,
    LOCAL_ONLY_LABELS,
    CHECKPOINT_STRUCTURE_LABELS,
    CHECKPOINT_PALETTE_LABELS,
    classifyHistoryLabel,
    validateOperation,
    encode,
    decode,
  });
})();
