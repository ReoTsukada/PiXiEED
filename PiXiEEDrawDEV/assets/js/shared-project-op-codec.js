(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function hasLabel(labelSet, label) {
    return Boolean(labelSet && typeof labelSet.has === 'function' && labelSet.has(label));
  }

  function createSharedProjectOpCodec({
    structureHistoryLabels = null,
    paletteHistoryLabels = null,
    layerPatchHistoryLabels = null,
  } = {}) {
    function classifySharedProjectOpType(historyLabel = '') {
      const normalizedLabel = String(historyLabel || '').trim();
      if (!normalizedLabel) {
        return 'snapshot';
      }
      if (hasLabel(structureHistoryLabels, normalizedLabel)) {
        return 'structure';
      }
      if (hasLabel(paletteHistoryLabels, normalizedLabel)) {
        return 'palette';
      }
      if (hasLabel(layerPatchHistoryLabels, normalizedLabel)) {
        return 'draw';
      }
      return 'draw';
    }

    function normalizeSharedProjectOpKind(historyLabel = '', opPayload = null) {
      const normalizedLabel = String(historyLabel || '').trim();
      const normalizedType = classifySharedProjectOpType(normalizedLabel);
      if (normalizedType === 'draw') {
        if (opPayload?.command === 'stroke') return 'stroke-command';
        if (opPayload?.command === 'shape') return 'shape-command';
        if (opPayload?.command === 'fill') return 'fill-command';
        if (opPayload?.command === 'curve') return 'curve-command';
        if (opPayload?.command === 'region') return 'region-command';
        if (normalizedLabel === 'fill') return 'fill';
        if (
          normalizedLabel === 'selectionMove'
          || normalizedLabel === 'selectionPaste'
          || normalizedLabel === 'selectionCut'
          || normalizedLabel === 'selectionTransform'
        ) {
          return 'selection-transform';
        }
        return 'layer-patch';
      }
      if (normalizedType === 'structure') {
        if (normalizedLabel === 'addLayer' || normalizedLabel === 'addSimulationLayer' || normalizedLabel === 'duplicateLayer' || normalizedLabel === 'pasteLayer') return 'add-layer';
        if (normalizedLabel === 'removeLayer') return 'remove-layer';
        if (normalizedLabel === 'moveLayer' || normalizedLabel === 'reorderLayer') return 'move-layer';
        if (normalizedLabel === 'duplicateFrame' || normalizedLabel === 'pasteFrame' || normalizedLabel === 'addFrame') return 'add-frame';
        if (normalizedLabel === 'removeFrame') return 'remove-frame';
        if (normalizedLabel === 'moveFrame' || normalizedLabel === 'reorderFrame') return 'move-frame';
        if (normalizedLabel === 'resizeCanvas') return 'resize-canvas';
        if (normalizedLabel === 'addCanvas') return 'canvas-create';
        if (normalizedLabel === 'removeCanvas') return 'canvas-delete';
        if (normalizedLabel === 'reorderCanvas') return 'canvas-reorder';
        return 'structure';
      }
      if (normalizedType === 'palette') {
        return 'palette-update';
      }
      if (normalizedType === 'create') {
        return 'checkpoint';
      }
      return opPayload && typeof opPayload === 'object' ? 'snapshot' : 'session';
    }

    function getSharedProjectOpSeq(opRecord) {
      return Math.max(
        0,
        Math.round(
          Number(opRecord?.seq)
          || Number(opRecord?.revision)
          || 0
        )
      );
    }

    function extractSharedProjectOpPayload(opRecord) {
      if (opRecord?.payload && typeof opRecord.payload === 'object') {
        if (opRecord.payload.op && typeof opRecord.payload.op === 'object') {
          return {
            ...opRecord.payload,
            ...opRecord.payload.op,
          };
        }
        return opRecord.payload;
      }
      if (opRecord?.payload?.op && typeof opRecord.payload.op === 'object') {
        return opRecord.payload.op;
      }
      if (opRecord?.op && typeof opRecord.op === 'object') {
        return opRecord.op;
      }
      if (opRecord && typeof opRecord === 'object') {
        return opRecord;
      }
      return null;
    }

    function getSharedProjectOpId(opRecord) {
      const payload = extractSharedProjectOpPayload(opRecord);
      if (typeof payload?.opId === 'string' && payload.opId.trim()) {
        return payload.opId.trim();
      }
      if (typeof opRecord?.opId === 'string' && opRecord.opId.trim()) {
        return opRecord.opId.trim();
      }
      if (typeof opRecord?.op_id === 'string' && opRecord.op_id.trim()) {
        return opRecord.op_id.trim();
      }
      return '';
    }

    function normalizeSharedProjectOpId(opRecord) {
      const payload = extractSharedProjectOpPayload(opRecord);
      if (typeof payload?.opId === 'string' && payload.opId.trim()) return payload.opId.trim();
      if (typeof payload?.id === 'string' && payload.id.trim()) return payload.id.trim();
      if (typeof payload?.operationId === 'string' && payload.operationId.trim()) return payload.operationId.trim();
      if (typeof opRecord?.opId === 'string' && opRecord.opId.trim()) return opRecord.opId.trim();
      if (typeof opRecord?.op_id === 'string' && opRecord.op_id.trim()) return opRecord.op_id.trim();
      if (typeof opRecord?.id === 'string' && opRecord.id.trim()) return opRecord.id.trim();
      if (typeof opRecord?.operationId === 'string' && opRecord.operationId.trim()) return opRecord.operationId.trim();
      return '';
    }

    return Object.freeze({
      classifySharedProjectOpType,
      normalizeSharedProjectOpKind,
      getSharedProjectOpSeq,
      extractSharedProjectOpPayload,
      getSharedProjectOpId,
      normalizeSharedProjectOpId,
    });
  }

  root.sharedProjectOpCodec = Object.freeze({
    createSharedProjectOpCodec,
  });
})();
