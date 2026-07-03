(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createMultiHistoryUtils({
    state,
    history,
    multiState,
    multiHistory,
    DEFAULT_HISTORY_LIMIT,
    MULTI_PALETTE_HISTORY_LABELS,
    MULTI_LAYER_PATCH_HISTORY_LABELS,
    clamp,
    localizeText,
    normalizeProjectHistoryLimit,
    getActiveProjectCanvasDocument,
    getProjectCanvasDocumentById,
    isSharedProjectCollaborativeMode,
    getMultiAssignment,
    getAssignmentCanvasDocument,
    resolveAssignedFrameIndexForCanvas,
    resolveAssignedLayerTrackIndexForCanvas,
    isMultiMasterMode,
    getCurveBuilder,
    getPointerState,
  } = {}) {
    function normalizeMultiHistoryClientId(clientId = multiState.clientId || '') {
      return typeof clientId === 'string' ? clientId.trim() : '';
    }

    function normalizeMultiHistoryCanvasId(canvasId = getActiveProjectCanvasDocument()?.id || '') {
      const normalized = typeof canvasId === 'string' ? canvasId.trim() : '';
      if (normalized) {
        return normalized;
      }
      return typeof getActiveProjectCanvasDocument()?.id === 'string'
        ? getActiveProjectCanvasDocument().id
        : '';
    }

    function getMultiHistoryScope(clientId = multiState.clientId || '', canvasId = getActiveProjectCanvasDocument()?.id || '') {
      const normalizedClientId = normalizeMultiHistoryClientId(clientId);
      const normalizedCanvasId = normalizeMultiHistoryCanvasId(canvasId);
      if (!normalizedClientId || !normalizedCanvasId) {
        return null;
      }
      const requestedCanvas = getProjectCanvasDocumentById(normalizedCanvasId)
        || (((getActiveProjectCanvasDocument()?.id || '') === normalizedCanvasId) ? getActiveProjectCanvasDocument() : null)
        || null;
      if (isSharedProjectCollaborativeMode() && requestedCanvas) {
        const frames = Array.isArray(requestedCanvas.frames) ? requestedCanvas.frames : [];
        const frameIndex = clamp(Math.round(Number(state.activeFrame ?? requestedCanvas.activeFrame) || 0), 0, Math.max(0, frames.length - 1));
        const frame = frames[frameIndex] || null;
        const layerId = typeof state.activeLayer === 'string' && state.activeLayer
          ? state.activeLayer
          : (typeof requestedCanvas.activeLayer === 'string' ? requestedCanvas.activeLayer : '');
        return {
          clientId: normalizedClientId,
          canvasId: normalizedCanvasId,
          frameToken: frame?.id || (frameIndex >= 0 ? `f${frameIndex}` : ''),
          layerToken: layerId || '',
        };
      }
      const assignment = getMultiAssignment(normalizedClientId);
      const assignmentCanvas = getAssignmentCanvasDocument(assignment, requestedCanvas);
      if (!assignment || !assignmentCanvas || (assignmentCanvas.id || '') !== normalizedCanvasId) {
        return {
          clientId: normalizedClientId,
          canvasId: normalizedCanvasId,
          frameToken: '',
          layerToken: '',
        };
      }
      const frameIndex = resolveAssignedFrameIndexForCanvas(assignment, assignmentCanvas);
      const trackIndex = resolveAssignedLayerTrackIndexForCanvas(assignment, assignmentCanvas);
      const frameId = frameIndex >= 0
        ? (assignmentCanvas.frames?.[frameIndex]?.id || '')
        : '';
      const anchorLayerId = trackIndex >= 0
        ? (assignmentCanvas.frames?.[0]?.layers?.[trackIndex]?.id || assignment.anchorLayerId || '')
        : (assignment.anchorLayerId || '');
      return {
        clientId: normalizedClientId,
        canvasId: normalizedCanvasId,
        frameToken: frameId || (frameIndex >= 0 ? `f${frameIndex}` : ''),
        layerToken: anchorLayerId || (trackIndex >= 0 ? `l${trackIndex}` : ''),
      };
    }

    function getMultiHistoryKey(clientId = multiState.clientId || '', canvasId = getActiveProjectCanvasDocument()?.id || '') {
      const scope = getMultiHistoryScope(clientId, canvasId);
      if (!scope) {
        return '';
      }
      const parts = [scope.clientId, scope.canvasId];
      if (scope.frameToken) {
        parts.push(scope.frameToken);
      }
      if (scope.layerToken) {
        parts.push(scope.layerToken);
      }
      return parts.join('\u0000');
    }

    function createMultiHistoryBucket(limit = history.limit) {
      return {
        past: [],
        future: [],
        limit: normalizeProjectHistoryLimit(limit, DEFAULT_HISTORY_LIMIT),
      };
    }

    function getMultiHistoryBucket(clientId = multiState.clientId || '', canvasId = getActiveProjectCanvasDocument()?.id || '', { create = false } = {}) {
      const key = getMultiHistoryKey(clientId, canvasId);
      if (!key) {
        return null;
      }
      let bucket = multiHistory.get(key) || null;
      if (!bucket && create) {
        bucket = createMultiHistoryBucket();
        multiHistory.set(key, bucket);
      }
      if (!bucket) {
        return null;
      }
      if (!Array.isArray(bucket.past)) {
        bucket.past = [];
      }
      if (!Array.isArray(bucket.future)) {
        bucket.future = [];
      }
      bucket.limit = normalizeProjectHistoryLimit(history.limit || bucket.limit, bucket.limit || DEFAULT_HISTORY_LIMIT);
      return bucket;
    }

    function clearMultiHistory() {
      multiHistory.clear();
    }

    function setHistoryEntryLabel(entry, label = '') {
      if (!entry || typeof entry !== 'object') {
        return entry;
      }
      entry.historyLabel = typeof label === 'string' ? label : '';
      return entry;
    }

    function getHistoryEntryLabel(entry) {
      return typeof entry?.historyLabel === 'string' ? entry.historyLabel : '';
    }

    function hasPendingCurveUndoRedoInterception() {
      const pointerState = getPointerState();
      return Boolean(
        getCurveBuilder()
        || (history.pending && history.pending.label === 'curve')
        || (pointerState.active && pointerState.tool === 'curve')
      );
    }

    function isLocalOnlyMultiHistoryLabel(label = '') {
      return MULTI_PALETTE_HISTORY_LABELS.has(String(label || ''));
    }

    function isGuardedMultiSharedHistoryLabel(label = '') {
      const normalizedLabel = String(label || '');
      return multiState.connected
        && isMultiMasterMode()
        && !MULTI_LAYER_PATCH_HISTORY_LABELS.has(normalizedLabel)
        && !isLocalOnlyMultiHistoryLabel(normalizedLabel);
    }

    function getGuardedHistoryLabelDisplayName(label = '') {
      switch (String(label || '')) {
        case 'addLayer':
          return localizeText('レイヤー追加', 'Add Layer');
        case 'removeLayer':
          return localizeText('レイヤー削除', 'Remove Layer');
        case 'duplicateLayer':
          return localizeText('レイヤー複製', 'Duplicate Layer');
        case 'pasteLayer':
          return localizeText('レイヤー貼り付け', 'Paste Layer');
        case 'setLayerBlendMode':
          return localizeText('レイヤー合成モード変更', 'Change Layer Blend Mode');
        case 'addFrame':
          return localizeText('フレーム追加', 'Add Frame');
        case 'removeFrame':
          return localizeText('フレーム削除', 'Remove Frame');
        case 'duplicateFrame':
          return localizeText('フレーム複製', 'Duplicate Frame');
        case 'pasteFrame':
          return localizeText('フレーム貼り付け', 'Paste Frame');
        case 'setAllFrameFps':
          return localizeText('再生速度変更', 'Change Playback Speed');
        case 'resizeCanvas':
          return localizeText('キャンバスサイズ変更', 'Resize Canvas');
        case 'addCanvas':
          return localizeText('キャンバス追加', 'Add Canvas');
        case 'removeCanvas':
          return localizeText('キャンバス削除', 'Remove Canvas');
        case 'clearCanvas':
          return localizeText('キャンバス全消去', 'Clear Canvas');
        case 'scaleSprite':
          return localizeText('全体拡大縮小', 'Scale Sprite');
        case 'colorModeConvert':
          return localizeText('色モード変換', 'Convert Color Mode');
        case 'paletteAdd':
          return localizeText('パレット色追加', 'Add Palette Color');
        case 'paletteRemove':
          return localizeText('パレット色削除', 'Remove Palette Color');
        case 'paletteReorder':
          return localizeText('パレット並び替え', 'Reorder Palette');
        case 'paletteColor':
          return localizeText('パレット色変更', 'Edit Palette Color');
        case 'paletteApplyPreset':
          return localizeText('パレットプリセット適用', 'Apply Palette Preset');
        case 'toggleOnionSkin':
          return localizeText('オニオンスキン切替', 'Toggle Onion Skin');
        case 'setOnionSkin':
          return localizeText('オニオンスキン設定変更', 'Change Onion Skin Settings');
        default:
          return localizeText('共有ドキュメント変更', 'Shared Document Change');
      }
    }

    return {
      normalizeMultiHistoryClientId,
      normalizeMultiHistoryCanvasId,
      getMultiHistoryScope,
      getMultiHistoryKey,
      createMultiHistoryBucket,
      getMultiHistoryBucket,
      clearMultiHistory,
      setHistoryEntryLabel,
      getHistoryEntryLabel,
      hasPendingCurveUndoRedoInterception,
      isLocalOnlyMultiHistoryLabel,
      isGuardedMultiSharedHistoryLabel,
      getGuardedHistoryLabelDisplayName,
    };
  }

  root.multiHistoryUtils = {
    createMultiHistoryUtils,
  };
})();
