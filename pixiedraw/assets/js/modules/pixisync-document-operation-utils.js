(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  const MAX_DOCUMENT_OPERATION_BYTES = 262144;
  const MAX_DOCUMENT_DEPTH = 12;
  const STRUCTURE_LABELS = new Set([
    'addLayer', 'duplicateLayer', 'pasteLayer', 'removeLayer',
    'moveLayer', 'moveLayerUp', 'moveLayerDown', 'moveLayerGroupUp', 'moveLayerGroupDown', 'reorderLayer',
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
  // Raster mutations stay as compact pixel patches.  Every structural edit
  // is a checkpoint boundary: this makes the document itself authoritative
  // across joins/recovery, rather than depending on replaying a shape tail
  // against an older checkpoint.
  const STRUCTURE_DELTA_LABELS = new Set();
  const LOCAL_ONLY_LABELS = new Set([
    'setLayerVisibility',
    'setOnionSkin',
    'toggleOnionSkin',
  ]);
  // A structural edit changes the meaning of every following pixel target.
  // Use an ordered full-document checkpoint for every structure edit;
  // personal visibility remains excluded by checkpoint capture.
  const CHECKPOINT_STRUCTURE_LABELS = new Set([
    ...[...STRUCTURE_LABELS].filter(label => !STRUCTURE_DELTA_LABELS.has(label)),
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

  // Structure edits deliberately carry identities and intent, never raster
  // planes.  Receivers validate every referenced target before changing their
  // local document, so a malformed or stale operation becomes a recovery
  // request instead of a partially-applied timeline mutation.
  function assertLayerDescriptor(layer, field = 'layer') {
    if (!layer || typeof layer !== 'object' || Object.prototype.hasOwnProperty.call(layer, 'visible')) {
      fail(`invalid-${field}`);
    }
    assertKeys(layer, ['id', 'trackId', 'name', 'opacity', 'blendMode'], field);
    assertId(layer.id, `${field}-id`);
    assertId(layer.trackId, `${field}-track-id`);
    if (typeof layer.name !== 'string' || layer.name.length > 120) fail(`invalid-${field}-name`);
    if (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) fail(`invalid-${field}-opacity`);
    if (typeof layer.blendMode !== 'string' || layer.blendMode.length < 1 || layer.blendMode.length > 32) {
      fail(`invalid-${field}-blend-mode`);
    }
  }

  function assertNullableId(value, field) {
    if (value !== null) assertId(value, field);
  }

  function assertRasterAsset(asset, field = 'raster-asset') {
    if (!asset || typeof asset !== 'object') fail(`invalid-${field}`);
    assertKeys(asset, ['objectPath', 'sha256Hex', 'byteLength', 'codecVersion'], field);
    if (typeof asset.objectPath !== 'string'
      || !/^rooms\/[0-9a-f-]{36}\/document-checkpoints\/[0-9a-f-]{36}\.pxd$/i.test(asset.objectPath)) {
      fail(`invalid-${field}-path`);
    }
    if (typeof asset.sha256Hex !== 'string' || !/^[0-9a-f]{64}$/i.test(asset.sha256Hex)) fail(`invalid-${field}-hash`);
    if (!Number.isSafeInteger(asset.byteLength) || asset.byteLength < 1 || asset.byteLength > 52428800) fail(`invalid-${field}-size`);
    if (asset.codecVersion !== 1) fail(`invalid-${field}-codec`);
  }

  function validateStructureDelta(operation) {
    assertKeys(operation, ['version', 'type', 'action', 'data'], 'operation');
    if (typeof operation.action !== 'string' || !operation.action) fail('invalid-delta-action');
    const data = operation.data;
    if (!data || typeof data !== 'object') fail('invalid-delta-data');
    const assertCanvas = () => assertId(data.canvasId, 'canvas-id');
    switch (operation.action) {
      case 'layer_track_insert':
        assertKeys(data, ['canvasId', 'afterTrackId', 'cells'], 'layer-track-insert');
        assertCanvas();
        assertNullableId(data.afterTrackId, 'after-track-id');
        if (!Array.isArray(data.cells) || !data.cells.length || data.cells.length > 4096) fail('invalid-layer-track-cells');
        const frameIds = new Set();
        const layerIds = new Set();
        let trackId = '';
        data.cells.forEach(cell => {
          assertKeys(cell, ['frameId', 'layer'], 'layer-track-cell');
          assertId(cell.frameId, 'frame-id');
          assertLayerDescriptor(cell.layer, 'layer');
          if (frameIds.has(cell.frameId) || layerIds.has(cell.layer.id)) fail('duplicate-layer-track-cell');
          frameIds.add(cell.frameId);
          layerIds.add(cell.layer.id);
          if (trackId && trackId !== cell.layer.trackId) fail('mixed-layer-track-id');
          trackId = cell.layer.trackId;
        });
        break;
      case 'layer_track_remove':
        assertKeys(data, ['canvasId', 'trackIds', 'inverseAsset'], 'layer-track-remove');
        assertCanvas();
        if (!Array.isArray(data.trackIds) || !data.trackIds.length || data.trackIds.length > 1024) fail('invalid-track-ids');
        data.trackIds.forEach(id => assertId(id, 'track-id'));
        if (new Set(data.trackIds).size !== data.trackIds.length) fail('duplicate-track-id');
        assertRasterAsset(data.inverseAsset);
        break;
      case 'layer_track_clone':
        assertKeys(data, ['canvasId', 'afterTrackId', 'clones'], 'layer-track-clone');
        assertCanvas();
        assertNullableId(data.afterTrackId, 'after-track-id');
        if (!Array.isArray(data.clones) || !data.clones.length || data.clones.length > 1024) fail('invalid-layer-track-clones');
        {
          const sourceTrackIds = new Set(); const trackIds = new Set(); const layerIds = new Set();
          data.clones.forEach(clone => {
            assertKeys(clone, ['sourceTrackId', 'trackId', 'cells'], 'layer-track-clone');
            assertId(clone.sourceTrackId, 'source-track-id'); assertId(clone.trackId, 'track-id');
            if (sourceTrackIds.has(clone.sourceTrackId) || trackIds.has(clone.trackId)) fail('duplicate-layer-track-clone');
            sourceTrackIds.add(clone.sourceTrackId); trackIds.add(clone.trackId);
            if (!Array.isArray(clone.cells) || !clone.cells.length || clone.cells.length > 4096) fail('invalid-layer-track-clone-cells');
            const frameIds = new Set();
            clone.cells.forEach(cell => {
              assertKeys(cell, ['frameId', 'layerId'], 'layer-track-clone-cell');
              assertId(cell.frameId, 'frame-id'); assertId(cell.layerId, 'layer-id');
              if (frameIds.has(cell.frameId) || layerIds.has(cell.layerId)) fail('duplicate-layer-track-clone-cell');
              frameIds.add(cell.frameId); layerIds.add(cell.layerId);
            });
          });
        }
        break;
      case 'frame_insert':
        assertKeys(data, ['canvasId', 'afterFrameId', 'frame'], 'frame-insert');
        assertCanvas();
        assertNullableId(data.afterFrameId, 'after-frame-id');
        if (!data.frame || typeof data.frame !== 'object') fail('invalid-frame');
        assertKeys(data.frame, ['id', 'name', 'duration', 'layers'], 'frame');
        assertId(data.frame.id, 'frame-id');
        if (typeof data.frame.name !== 'string' || data.frame.name.length > 120) fail('invalid-frame-name');
        if (!Number.isFinite(data.frame.duration) || data.frame.duration < 1 || data.frame.duration > 655350) fail('invalid-frame-duration');
        if (!Array.isArray(data.frame.layers) || !data.frame.layers.length || data.frame.layers.length > 4096) fail('invalid-frame-layers');
        data.frame.layers.forEach(layer => assertLayerDescriptor(layer, 'layer'));
        break;
      case 'frame_remove':
        assertKeys(data, ['canvasId', 'frameIds', 'inverseAsset'], 'frame-remove');
        assertCanvas();
        if (!Array.isArray(data.frameIds) || !data.frameIds.length || data.frameIds.length > 1024) fail('invalid-frame-ids');
        data.frameIds.forEach(id => assertId(id, 'frame-id'));
        if (new Set(data.frameIds).size !== data.frameIds.length) fail('duplicate-frame-id');
        assertRasterAsset(data.inverseAsset);
        break;
      case 'raster_restore':
        assertKeys(data, ['canvasId', 'afterFrameId', 'afterTrackId', 'inverseAsset'], 'raster-restore');
        assertCanvas();
        assertNullableId(data.afterFrameId, 'after-frame-id');
        assertNullableId(data.afterTrackId, 'after-track-id');
        assertRasterAsset(data.inverseAsset);
        break;
      case 'canvas_resize_restore':
        assertKeys(data, ['canvasId', 'fromWidth', 'fromHeight', 'width', 'height', 'offsetX', 'offsetY', 'inverseAsset'], 'canvas-resize-restore');
        assertCanvas();
        for (const field of ['fromWidth', 'fromHeight', 'width', 'height']) {
          if (!Number.isInteger(data[field]) || data[field] < 1 || data[field] > 16384) fail(`invalid-${field}`);
        }
        if ((data.width * data.height) > 268435456) fail('canvas-too-large');
        for (const field of ['offsetX', 'offsetY']) {
          if (!Number.isInteger(data[field]) || Math.abs(data[field]) > 16384) fail(`invalid-${field}`);
        }
        assertRasterAsset(data.inverseAsset);
        break;
      case 'frame_clone':
        assertKeys(data, ['canvasId', 'afterFrameId', 'clones'], 'frame-clone');
        assertCanvas();
        assertNullableId(data.afterFrameId, 'after-frame-id');
        if (!Array.isArray(data.clones) || !data.clones.length || data.clones.length > 1024) fail('invalid-frame-clones');
        {
          const sourceFrameIds = new Set(); const frameIds = new Set(); const layerIds = new Set();
          data.clones.forEach(clone => {
            assertKeys(clone, ['sourceFrameId', 'frameId', 'name', 'duration', 'layerIds'], 'frame-clone');
            assertId(clone.sourceFrameId, 'source-frame-id'); assertId(clone.frameId, 'frame-id');
            if (sourceFrameIds.has(clone.sourceFrameId) || frameIds.has(clone.frameId)) fail('duplicate-frame-clone');
            sourceFrameIds.add(clone.sourceFrameId); frameIds.add(clone.frameId);
            // The UI assigns a new default frame name during duplication.  It
            // cannot be derived from the source frame on a receiver because
            // peer-local ordering may differ before this ordered operation.
            if (typeof clone.name !== 'string' || clone.name.length < 1 || clone.name.length > 120) fail('invalid-frame-clone-name');
            if (!Number.isFinite(clone.duration) || clone.duration < 1 || clone.duration > 655350) {
              fail('invalid-frame-clone-duration');
            }
            if (!Array.isArray(clone.layerIds) || !clone.layerIds.length || clone.layerIds.length > 4096) fail('invalid-frame-clone-layers');
            clone.layerIds.forEach(id => { assertId(id, 'layer-id'); if (layerIds.has(id)) fail('duplicate-frame-clone-layer'); layerIds.add(id); });
          });
        }
        break;
      case 'canvas_resize':
        assertKeys(data, ['canvasId', 'fromWidth', 'fromHeight', 'width', 'height', 'offsetX', 'offsetY', 'inverseAsset'], 'canvas-resize');
        assertCanvas();
        for (const field of ['fromWidth', 'fromHeight', 'width', 'height']) {
          if (!Number.isInteger(data[field]) || data[field] < 1 || data[field] > 16384) fail(`invalid-${field}`);
        }
        if ((data.width * data.height) > 268435456) fail('canvas-too-large');
        for (const field of ['offsetX', 'offsetY']) {
          if (!Number.isInteger(data[field]) || Math.abs(data[field]) > 16384) fail(`invalid-${field}`);
        }
        if ((data.width < data.fromWidth || data.height < data.fromHeight) && !data.inverseAsset) fail('missing-raster-asset');
        if (data.inverseAsset !== undefined) assertRasterAsset(data.inverseAsset);
        break;
      case 'frame_order':
        assertKeys(data, ['canvasId', 'frameIds'], 'frame-order');
        assertCanvas();
        if (!Array.isArray(data.frameIds) || !data.frameIds.length || data.frameIds.length > 4096) fail('invalid-frame-order');
        data.frameIds.forEach(id => assertId(id, 'frame-id'));
        if (new Set(data.frameIds).size !== data.frameIds.length) fail('duplicate-frame-id');
        break;
      case 'layer_order':
        assertKeys(data, ['canvasId', 'trackIds'], 'layer-order');
        assertCanvas();
        if (!Array.isArray(data.trackIds) || !data.trackIds.length || data.trackIds.length > 4096) fail('invalid-layer-order');
        data.trackIds.forEach(id => assertId(id, 'track-id'));
        if (new Set(data.trackIds).size !== data.trackIds.length) fail('duplicate-track-id');
        break;
      default:
        fail('unsupported-delta-action');
    }
  }

  function validateOperation(operation) {
    assertPlainJson(operation);
    if (operation?.version !== 1) fail('unsupported-version');
    switch (operation.type) {
      case 'structure_delta':
        validateStructureDelta(operation);
        break;
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
    if (STRUCTURE_DELTA_LABELS.has(normalized)) return 'structure_delta';
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
    STRUCTURE_DELTA_LABELS,
    LOCAL_ONLY_LABELS,
    CHECKPOINT_STRUCTURE_LABELS,
    CHECKPOINT_PALETTE_LABELS,
    classifyHistoryLabel,
    validateOperation,
    encode,
    decode,
  });
})();
