(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedProjectParticipantUtils(rawScope = {}) {
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
  function getLocalMultiParticipantName() {
    const accountName = readPixieedAccountNickname();
    return normalizeMultiParticipantName(accountName, DEFAULT_MULTI_PARTICIPANT_NAME);
  }

  function getLocalMultiParticipantAvatarId() {
    return readPixieedAccountAvatarId();
  }

  function getMultiAssignment(clientId) {
    if (!clientId) {
      return null;
    }
    return multiState.assignments.get(clientId) || null;
  }

  function normalizeMultiAssignmentCanvasId(canvasId, fallbackCanvasId = getActiveProjectCanvasDocument()?.id || '') {
    const requestedId = typeof canvasId === 'string' ? canvasId.trim() : '';
    if (requestedId && getProjectCanvasDocumentById(requestedId)) {
      return requestedId;
    }
    const fallbackId = typeof fallbackCanvasId === 'string' ? fallbackCanvasId.trim() : '';
    if (fallbackId && getProjectCanvasDocumentById(fallbackId)) {
      return fallbackId;
    }
    return getProjectCanvasDocumentAt(0)?.id || '';
  }

  function getAssignmentCanvasDocument(assignment, fallbackCanvasDoc = getActiveProjectCanvasDocument()) {
    const fallbackDoc = fallbackCanvasDoc || getActiveProjectCanvasDocument() || getProjectCanvasDocumentAt(0);
    if (!assignment || typeof assignment !== 'object') {
      return fallbackDoc || null;
    }
    const canvasId = normalizeMultiAssignmentCanvasId(assignment.canvasId, fallbackDoc?.id || '');
    const canvasDoc = getProjectCanvasDocumentById(canvasId) || fallbackDoc || null;
    if (canvasDoc?.id) {
      assignment.canvasId = canvasDoc.id;
    }
    return canvasDoc;
  }

  function resolveAssignedFrameIndexForCanvas(assignment, canvasDoc = getActiveProjectCanvasDocument()) {
    if (!assignment || !canvasDoc || !Array.isArray(canvasDoc.frames) || !canvasDoc.frames.length) {
      return -1;
    }
    let frameIndex = canvasDoc.frames.findIndex(frame => frame?.id === assignment.frameId);
    if (frameIndex < 0 && Number.isFinite(assignment.frameHint)) {
      frameIndex = clamp(Math.round(Number(assignment.frameHint) || 0), 0, canvasDoc.frames.length - 1);
    }
    return frameIndex;
  }

  function resolveAssignedLayerTrackIndexForCanvas(assignment, canvasDoc = getActiveProjectCanvasDocument()) {
    if (!assignment || !canvasDoc || !Array.isArray(canvasDoc.frames) || !canvasDoc.frames.length) {
      return -1;
    }
    const frame0 = canvasDoc.frames[0];
    if (!frame0 || !Array.isArray(frame0.layers) || !frame0.layers.length) {
      return -1;
    }
    let trackIndex = frame0.layers.findIndex(layer => layer?.id === assignment.anchorLayerId);
    if (trackIndex < 0 && Number.isFinite(assignment.trackHint)) {
      trackIndex = clamp(Math.round(Number(assignment.trackHint) || 0), 0, frame0.layers.length - 1);
    }
    return trackIndex;
  }

  function getProjectCanvasActiveLayerTrackIndex(canvasDoc = getActiveProjectCanvasDocument()) {
    const frameIndex = clamp(
      Math.round(Number(canvasDoc?.activeFrame) || 0),
      0,
      Math.max(0, (canvasDoc?.frames?.length || 1) - 1)
    );
    const frame = Array.isArray(canvasDoc?.frames) ? canvasDoc.frames[frameIndex] : null;
    if (!frame || !Array.isArray(frame.layers)) {
      return -1;
    }
    return frame.layers.findIndex(layer => layer?.id === canvasDoc?.activeLayer);
  }

  function getAssignedCellForClientOnCanvas(clientId, canvasDoc = getActiveProjectCanvasDocument()) {
    const assignment = getMultiAssignment(clientId);
    if (!assignment || !canvasDoc || !Array.isArray(canvasDoc.frames) || !canvasDoc.frames.length) {
      return null;
    }
    const assignmentCanvasId = normalizeMultiAssignmentCanvasId(assignment.canvasId, canvasDoc.id || '');
    if (assignmentCanvasId && canvasDoc.id && assignmentCanvasId !== canvasDoc.id) {
      return null;
    }
    if (canvasDoc.id) {
      assignment.canvasId = canvasDoc.id;
    }
    const frameIndex = resolveAssignedFrameIndexForCanvas(assignment, canvasDoc);
    const trackIndex = resolveAssignedLayerTrackIndexForCanvas(assignment, canvasDoc);
    if (frameIndex < 0 || trackIndex < 0) {
      return null;
    }
    const frame = canvasDoc.frames[frameIndex];
    if (!frame || !Array.isArray(frame.layers) || trackIndex >= frame.layers.length) {
      return null;
    }
    return {
      frameIndex,
      trackIndex,
      layer: frame.layers[trackIndex] || null,
    };
  }

  function isAssignedCellActiveForCanvas(clientId, canvasDoc = getActiveProjectCanvasDocument()) {
    const assignedCell = getAssignedCellForClientOnCanvas(clientId, canvasDoc);
    if (!assignedCell || !canvasDoc) {
      return false;
    }
    return assignedCell.frameIndex === clamp(
      Math.round(Number(canvasDoc.activeFrame) || 0),
      0,
      Math.max(0, (canvasDoc.frames?.length || 1) - 1)
    ) && assignedCell.trackIndex === getProjectCanvasActiveLayerTrackIndex(canvasDoc);
  }

  function getMultiLayerTrackIndexByAnchorLayerId(anchorLayerId) {
    if (!anchorLayerId || !Array.isArray(state.frames) || !state.frames.length) {
      return -1;
    }
    const frame0 = state.frames[0];
    if (!frame0 || !Array.isArray(frame0.layers)) {
      return -1;
    }
    return frame0.layers.findIndex(layer => layer?.id === anchorLayerId);
  }

  function getMultiFrameIndexByFrameId(frameId) {
    if (!frameId || !Array.isArray(state.frames) || !state.frames.length) {
      return -1;
    }
    return state.frames.findIndex(frame => frame?.id === frameId);
  }

  function getAssignedFrameIndexForClient(clientId, canvasDoc = null) {
    const assignment = getMultiAssignment(clientId);
    if (!assignment) {
      return -1;
    }
    const resolvedCanvasDoc = getAssignmentCanvasDocument(assignment, canvasDoc || getActiveProjectCanvasDocument());
    if (!resolvedCanvasDoc || !Array.isArray(resolvedCanvasDoc.frames) || !resolvedCanvasDoc.frames.length) {
      return -1;
    }
    let frameIndex = resolvedCanvasDoc.frames.findIndex(frame => frame?.id === assignment.frameId);
    if (frameIndex < 0 && Number.isFinite(assignment.frameHint)) {
      frameIndex = clamp(Math.round(Number(assignment.frameHint) || 0), 0, resolvedCanvasDoc.frames.length - 1);
    }
    if (frameIndex >= 0 && resolvedCanvasDoc.frames[frameIndex]?.id) {
      assignment.canvasId = resolvedCanvasDoc.id || assignment.canvasId || '';
      assignment.frameId = resolvedCanvasDoc.frames[frameIndex].id;
      assignment.frameHint = frameIndex;
    }
    return frameIndex;
  }

  function getAssignedLayerTrackIndexForClient(clientId, canvasDoc = null) {
    const assignment = getMultiAssignment(clientId);
    if (!assignment) {
      return -1;
    }
    const resolvedCanvasDoc = getAssignmentCanvasDocument(assignment, canvasDoc || getActiveProjectCanvasDocument());
    const frame0 = resolvedCanvasDoc?.frames?.[0];
    if (!frame0 || !Array.isArray(frame0.layers) || !frame0.layers.length) {
      return -1;
    }
    let trackIndex = frame0.layers.findIndex(layer => layer?.id === assignment.anchorLayerId);
    if (trackIndex < 0 && Number.isFinite(assignment.trackHint)) {
      trackIndex = clamp(Math.round(Number(assignment.trackHint) || 0), 0, frame0.layers.length - 1);
    }
    if (trackIndex >= 0) {
      assignment.canvasId = resolvedCanvasDoc.id || assignment.canvasId || '';
      assignment.anchorLayerId = frame0.layers[trackIndex]?.id || assignment.anchorLayerId;
      assignment.trackHint = trackIndex;
    }
    return trackIndex;
  }

  function getAssignedLayerForFrame(clientId, frameIndex = state.activeFrame, canvasDoc = null) {
    const assignment = getMultiAssignment(clientId);
    const resolvedCanvasDoc = getAssignmentCanvasDocument(assignment, canvasDoc || getActiveProjectCanvasDocument());
    if (!resolvedCanvasDoc || !Array.isArray(resolvedCanvasDoc.frames) || !resolvedCanvasDoc.frames.length) {
      return null;
    }
    const trackIndex = getAssignedLayerTrackIndexForClient(clientId, resolvedCanvasDoc);
    if (trackIndex < 0) {
      return null;
    }
    const frame = resolvedCanvasDoc.frames[clamp(Math.round(Number(frameIndex) || 0), 0, Math.max(0, resolvedCanvasDoc.frames.length - 1))];
    if (!frame || !Array.isArray(frame.layers) || trackIndex >= frame.layers.length) {
      return null;
    }
    return frame.layers[trackIndex] || null;
  }

  function getAssignedCellForClient(clientId, canvasDoc = null) {
    const assignment = getMultiAssignment(clientId);
    const resolvedCanvasDoc = getAssignmentCanvasDocument(assignment, canvasDoc || getActiveProjectCanvasDocument());
    if (!resolvedCanvasDoc || !Array.isArray(resolvedCanvasDoc.frames) || !resolvedCanvasDoc.frames.length) {
      return null;
    }
    const frameIndex = getAssignedFrameIndexForClient(clientId, resolvedCanvasDoc);
    const trackIndex = getAssignedLayerTrackIndexForClient(clientId, resolvedCanvasDoc);
    if (frameIndex < 0 || trackIndex < 0) {
      return null;
    }
    const layer = getAssignedLayerForFrame(clientId, frameIndex, resolvedCanvasDoc);
    if (!layer) {
      return null;
    }
    return {
      canvasId: resolvedCanvasDoc.id || '',
      frameIndex,
      trackIndex,
      layer,
    };
  }

  function getMultiAssignmentCellKey(frameIndex, trackIndex) {
    return `${frameIndex}:${trackIndex}`;
  }

  function getUsedMultiAssignmentCellKeys(ignoreClientId = '', canvasDoc = getActiveProjectCanvasDocument()) {
    const used = new Set();
    if (!canvasDoc) {
      return used;
    }
    multiState.assignments.forEach((entry, clientId) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      if (ignoreClientId && clientId === ignoreClientId) {
        return;
      }
      const assignedCell = getAssignedCellForClientOnCanvas(clientId, canvasDoc);
      if (!assignedCell) {
        return;
      }
      used.add(getMultiAssignmentCellKey(assignedCell.frameIndex, assignedCell.trackIndex));
    });
    return used;
  }

  function isMultiAssignmentCellOccupied(frameIndex, trackIndex, ignoreClientId = '', canvasDoc = getActiveProjectCanvasDocument()) {
    if (frameIndex < 0 || trackIndex < 0) {
      return false;
    }
    const used = getUsedMultiAssignmentCellKeys(ignoreClientId, canvasDoc);
    return used.has(getMultiAssignmentCellKey(frameIndex, trackIndex));
  }

  function findFirstAvailableMultiAssignmentCell({
    preferredFrameIndex = 0,
    preferredTrackIndex = 0,
    ignoreClientId = '',
    canvasDoc = getActiveProjectCanvasDocument(),
  } = {}) {
    const frameCount = Array.isArray(canvasDoc?.frames) ? canvasDoc.frames.length : 0;
    if (!frameCount) {
      return null;
    }
    const used = getUsedMultiAssignmentCellKeys(ignoreClientId, canvasDoc);
    const baseFrameIndex = clamp(Math.round(Number(preferredFrameIndex) || 0), 0, frameCount - 1);
    for (let frameOffset = 0; frameOffset < frameCount; frameOffset += 1) {
      const frameIndex = (baseFrameIndex + frameOffset) % frameCount;
      const frame = canvasDoc.frames[frameIndex];
      const layerCount = Array.isArray(frame?.layers) ? frame.layers.length : 0;
      if (!layerCount) {
        continue;
      }
      const baseTrackIndex = clamp(Math.round(Number(preferredTrackIndex) || 0), 0, layerCount - 1);
      for (let trackOffset = 0; trackOffset < layerCount; trackOffset += 1) {
        const trackIndex = (baseTrackIndex + trackOffset) % layerCount;
        const key = getMultiAssignmentCellKey(frameIndex, trackIndex);
        if (!used.has(key)) {
          return { frameIndex, trackIndex };
        }
      }
    }
    return null;
  }

  function sortMultiAssignmentEntriesForNormalization(entries = []) {
    return Array.from(entries).sort((a, b) => {
      const aEntry = a[1] || {};
      const bEntry = b[1] || {};
      if (aEntry.role !== bEntry.role) {
        return aEntry.role === 'master' ? -1 : 1;
      }
      const joinedDiff = (Number(aEntry.joinedAt) || 0) - (Number(bEntry.joinedAt) || 0);
      if (joinedDiff !== 0) {
        return joinedDiff;
      }
      return String(a[0]).localeCompare(String(b[0]));
    });
  }

  function getOrCreateMultiAssignmentUsedCellKeys(usedCellKeysByCanvasId, canvasId = '') {
    if (!(usedCellKeysByCanvasId instanceof Map) || !canvasId) {
      return null;
    }
    let usedCellKeys = usedCellKeysByCanvasId.get(canvasId);
    if (!usedCellKeys) {
      usedCellKeys = new Set();
      usedCellKeysByCanvasId.set(canvasId, usedCellKeys);
    }
    return usedCellKeys;
  }

  function findFirstAvailableMultiAssignmentCellInUsedSet({
    preferredFrameIndex = 0,
    preferredTrackIndex = 0,
    canvasDoc = getActiveProjectCanvasDocument(),
    usedCellKeys = null,
  } = {}) {
    const frameCount = Array.isArray(canvasDoc?.frames) ? canvasDoc.frames.length : 0;
    if (!frameCount) {
      return null;
    }
    const used = usedCellKeys instanceof Set ? usedCellKeys : new Set();
    const baseFrameIndex = clamp(Math.round(Number(preferredFrameIndex) || 0), 0, frameCount - 1);
    for (let frameOffset = 0; frameOffset < frameCount; frameOffset += 1) {
      const frameIndex = (baseFrameIndex + frameOffset) % frameCount;
      const frame = canvasDoc.frames[frameIndex];
      const layerCount = Array.isArray(frame?.layers) ? frame.layers.length : 0;
      if (!layerCount) {
        continue;
      }
      const baseTrackIndex = clamp(Math.round(Number(preferredTrackIndex) || 0), 0, layerCount - 1);
      for (let trackOffset = 0; trackOffset < layerCount; trackOffset += 1) {
        const trackIndex = (baseTrackIndex + trackOffset) % layerCount;
        const key = getMultiAssignmentCellKey(frameIndex, trackIndex);
        if (!used.has(key)) {
          return { frameIndex, trackIndex };
        }
      }
    }
    return null;
  }

  function getPreferredMultiAssignmentCanvasDocument(entry, canvasDocs, fallbackCanvasDoc = null) {
    const docs = Array.isArray(canvasDocs) ? canvasDocs.filter(Boolean) : [];
    if (!docs.length) {
      return null;
    }
    const requestedCanvasId = typeof entry?.canvasId === 'string' ? entry.canvasId.trim() : '';
    if (requestedCanvasId) {
      const requestedCanvas = docs.find(canvas => canvas?.id === requestedCanvasId) || null;
      if (requestedCanvas) {
        return requestedCanvas;
      }
    }
    return fallbackCanvasDoc || docs[0] || null;
  }

  function resolvePreferredMultiAssignmentTrackIndex(entry, canvasDoc) {
    const frame0 = canvasDoc?.frames?.[0];
    const layerCount = Array.isArray(frame0?.layers) ? frame0.layers.length : 0;
    if (!layerCount) {
      return -1;
    }
    const anchorLayerId = typeof entry?.anchorLayerId === 'string' ? entry.anchorLayerId : '';
    let trackIndex = anchorLayerId
      ? frame0.layers.findIndex(layer => layer?.id === anchorLayerId)
      : -1;
    if (trackIndex < 0 && Number.isFinite(entry?.trackHint)) {
      trackIndex = clamp(Math.round(Number(entry.trackHint) || 0), 0, layerCount - 1);
    }
    if (trackIndex < 0) {
      trackIndex = 0;
    }
    return clamp(trackIndex, 0, layerCount - 1);
  }

  function resolvePreferredMultiAssignmentFrameIndex(entry, canvasDoc) {
    const frameCount = Array.isArray(canvasDoc?.frames) ? canvasDoc.frames.length : 0;
    if (!frameCount) {
      return -1;
    }
    const frameId = typeof entry?.frameId === 'string' ? entry.frameId : '';
    let frameIndex = frameId
      ? canvasDoc.frames.findIndex(frame => frame?.id === frameId)
      : -1;
    if (frameIndex < 0 && Number.isFinite(entry?.frameHint)) {
      frameIndex = clamp(Math.round(Number(entry.frameHint) || 0), 0, frameCount - 1);
    }
    if (frameIndex < 0) {
      frameIndex = 0;
    }
    return clamp(frameIndex, 0, frameCount - 1);
  }

  function getMultiAssignmentCanvasSearchOrder({
    preferredCanvasId = '',
    canvasDocs = getProjectCanvasDocuments(),
    fallbackCanvasId = '',
  } = {}) {
    const docs = Array.isArray(canvasDocs)
      ? canvasDocs.filter(canvas => canvas && Array.isArray(canvas.frames) && canvas.frames.length)
      : [];
    if (!docs.length) {
      return [];
    }
    const ordered = [];
    const seen = new Set();
    const pushCanvas = canvasDoc => {
      if (!canvasDoc?.id || seen.has(canvasDoc.id)) {
        return;
      }
      seen.add(canvasDoc.id);
      ordered.push(canvasDoc);
    };
    if (preferredCanvasId) {
      pushCanvas(docs.find(canvas => canvas?.id === preferredCanvasId) || null);
    }
    if (fallbackCanvasId) {
      pushCanvas(docs.find(canvas => canvas?.id === fallbackCanvasId) || null);
    }
    docs.forEach(pushCanvas);
    return ordered;
  }

  function resolveNormalizedMultiAssignmentPlacement(entry, {
    canvasDocs = getProjectCanvasDocuments(),
    fallbackCanvasDoc = null,
    usedCellKeysByCanvasId = new Map(),
  } = {}) {
    const preferredCanvasDoc = getPreferredMultiAssignmentCanvasDocument(entry, canvasDocs, fallbackCanvasDoc);
    if (!preferredCanvasDoc?.id) {
      return null;
    }
    const preferredFrameIndex = resolvePreferredMultiAssignmentFrameIndex(entry, preferredCanvasDoc);
    const preferredTrackIndex = resolvePreferredMultiAssignmentTrackIndex(entry, preferredCanvasDoc);
    const searchOrder = getMultiAssignmentCanvasSearchOrder({
      preferredCanvasId: preferredCanvasDoc.id,
      canvasDocs,
      fallbackCanvasId: fallbackCanvasDoc?.id || '',
    });
    for (let index = 0; index < searchOrder.length; index += 1) {
      const canvasDoc = searchOrder[index];
      if (!canvasDoc?.id) {
        continue;
      }
      const usedCellKeys = getOrCreateMultiAssignmentUsedCellKeys(usedCellKeysByCanvasId, canvasDoc.id);
      const frameIndex = canvasDoc.id === preferredCanvasDoc.id
        ? preferredFrameIndex
        : resolvePreferredMultiAssignmentFrameIndex(entry, canvasDoc);
      const trackIndex = canvasDoc.id === preferredCanvasDoc.id
        ? preferredTrackIndex
        : resolvePreferredMultiAssignmentTrackIndex(entry, canvasDoc);
      const placement = findFirstAvailableMultiAssignmentCellInUsedSet({
        preferredFrameIndex: frameIndex,
        preferredTrackIndex: trackIndex,
        canvasDoc,
        usedCellKeys,
      });
      if (!placement) {
        continue;
      }
      const cellKey = getMultiAssignmentCellKey(placement.frameIndex, placement.trackIndex);
      usedCellKeys?.add(cellKey);
      return {
        canvasDoc,
        frameIndex: placement.frameIndex,
        trackIndex: placement.trackIndex,
        frameId: canvasDoc.frames?.[placement.frameIndex]?.id || '',
        anchorLayerId: canvasDoc.frames?.[0]?.layers?.[placement.trackIndex]?.id || '',
      };
    }
    return null;
  }

  function simulateNormalizedMultiAssignmentsForCanvasDocuments(canvasDocs, {
    assignments = multiState.assignments,
    fallbackCanvasDoc = null,
  } = {}) {
    const normalizedCanvasDocs = Array.isArray(canvasDocs)
      ? canvasDocs.filter(canvas => canvas && Array.isArray(canvas.frames) && canvas.frames.length)
      : [];
    const resolvedFallback = fallbackCanvasDoc
      || normalizedCanvasDocs[0]
      || getActiveProjectCanvasDocument()
      || getProjectCanvasDocumentAt(0)
      || null;
    const placements = new Map();
    const overflowClientIds = [];
    const usedCellKeysByCanvasId = new Map();
    sortMultiAssignmentEntriesForNormalization(assignments instanceof Map ? assignments.entries() : assignments).forEach(([clientId, entry]) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const placement = resolveNormalizedMultiAssignmentPlacement(entry, {
        canvasDocs: normalizedCanvasDocs,
        fallbackCanvasDoc: resolvedFallback,
        usedCellKeysByCanvasId,
      });
      if (!placement || !placement.canvasDoc?.id || !placement.anchorLayerId || !placement.frameId) {
        overflowClientIds.push(clientId);
        return;
      }
      placements.set(clientId, placement);
    });
    return {
      placements,
      overflowClientIds,
      fallbackCanvasDoc: resolvedFallback,
    };
  }

  function canNormalizeMultiAssignmentsForCanvasDocuments(canvasDocs, { announce = false } = {}) {
    if (isSharedProjectCollaborativeMode()) {
      return true;
    }
    if (!isMultiMasterMode() || !(multiState.assignments instanceof Map) || !multiState.assignments.size) {
      return true;
    }
    const simulation = simulateNormalizedMultiAssignmentsForCanvasDocuments(canvasDocs);
    if (!simulation.overflowClientIds.length) {
      return true;
    }
    if (announce) {
      setMultiStatus(
        localizeText(
          '残りのキャンバス / フレーム / レイヤーでは参加者セルを全員分維持できないため、この変更はできません',
          'This change would leave too few canvas/frame/layer cells for all participants'
        ),
        'warn'
      );
    }
    return false;
  }

  function cloneProjectCanvasDocumentsForStructureChange(canvases = getProjectCanvasDocuments()) {
    return (Array.isArray(canvases) ? canvases : []).map((canvas, index) => createProjectCanvasDocument(canvas, {
      clonePixelData: false,
      fallbackIndex: index + 1,
    }));
  }

  function normalizeMultiAssignmentsForCurrentDocument() {
    if (isSharedProjectCollaborativeMode()) {
      return;
    }
    const fallbackCanvasDoc = getActiveProjectCanvasDocument() || getProjectCanvasDocumentAt(0);
    const canvasDocs = getProjectCanvasDocuments().filter(canvas => canvas && Array.isArray(canvas.frames) && canvas.frames.length);
    if (!canvasDocs.length) {
      return;
    }
    const simulation = simulateNormalizedMultiAssignmentsForCanvasDocuments(canvasDocs, {
      assignments: multiState.assignments,
      fallbackCanvasDoc,
    });
    simulation.placements.forEach((placement, clientId) => {
      const entry = multiState.assignments.get(clientId);
      if (!entry || typeof entry !== 'object') {
        return;
      }
      entry.canvasId = placement.canvasDoc.id;
      entry.anchorLayerId = placement.anchorLayerId;
      entry.trackHint = placement.trackIndex;
      entry.frameId = placement.frameId;
      entry.frameHint = placement.frameIndex;
      multiState.assignments.set(clientId, entry);
    });
  }

  function setMultiSelectedControlClientId(clientId) {
    const normalizedClientId = typeof clientId === 'string' ? clientId.trim() : '';
    multiState.selectedAssignClientId = normalizedClientId;
    multiState.selectedRoleControlClientId = normalizedClientId;
    return normalizedClientId;
  }

  function selectMultiControlTarget(clientId) {
    const normalizedClientId = typeof clientId === 'string' ? clientId.trim() : '';
    if (!normalizedClientId) {
      return false;
    }
    if (!(dom.controls.multiAssignTarget instanceof HTMLSelectElement)) {
      return false;
    }
    setMultiSelectedControlClientId(normalizedClientId);
    syncMultiAssignmentControls();
    const select = dom.controls.multiAssignTarget;
    const hasOption = Array.from(select.options).some(option => option.value === normalizedClientId);
    if (!hasOption) {
      return false;
    }
    if (select.value !== normalizedClientId) {
      select.value = normalizedClientId;
    }
    setMultiSelectedControlClientId(normalizedClientId);
    updateMultiAssignmentControlsFromSelection();
    return true;
  }

  function getMultiSelectedControlTargetInfo() {
    const selectedClientId = setMultiSelectedControlClientId(
      (dom.controls.multiAssignTarget instanceof HTMLSelectElement ? dom.controls.multiAssignTarget.value : '')
      || multiState.selectedAssignClientId
      || multiState.selectedRoleControlClientId
      || ''
    );
    const participant = selectedClientId && multiState.participants instanceof Map
      ? multiState.participants.get(selectedClientId)
      : null;
    const assignment = selectedClientId ? getMultiAssignment(selectedClientId) : null;
    const role = normalizeMultiRoleControlTargetRole(
      (participant && typeof participant === 'object' ? participant.role : '')
      || assignment?.role
    );
    const name = normalizeMultiParticipantName(
      (participant && typeof participant === 'object' ? participant.name : '') || assignment?.name,
      DEFAULT_MULTI_PARTICIPANT_NAME
    );
    return {
      clientId: selectedClientId,
      role,
      name,
      participant,
      assignment,
    };
  }

  function updateMultiAssignmentControlsFromSelection() {
    const select = dom.controls.multiAssignTarget;
    const frameInput = dom.controls.multiAssignFrame;
    const layerInput = dom.controls.multiAssignLayer;
    if (!(select instanceof HTMLSelectElement) || !(frameInput instanceof HTMLInputElement) || !(layerInput instanceof HTMLInputElement)) {
      return;
    }
    const targetClientId = setMultiSelectedControlClientId(
      select.value || multiState.selectedAssignClientId || multiState.selectedRoleControlClientId || ''
    );
    const assignment = targetClientId ? getMultiAssignment(targetClientId) : null;
    const pendingRequest = targetClientId ? getPendingMultiAssignmentMoveRequest(targetClientId) : null;
    const targetCanvas = (() => {
      const pendingCanvasId = pendingRequest
        ? normalizeMultiAssignmentCanvasId(
          pendingRequest.canvasId,
          assignment?.canvasId || getActiveProjectCanvasDocument()?.id || ''
        )
        : '';
      return getProjectCanvasDocumentById(pendingCanvasId)
        || getAssignmentCanvasDocument(assignment, getActiveProjectCanvasDocument())
        || getActiveProjectCanvasDocument()
        || getProjectCanvasDocumentAt(0)
        || null;
    })();
    const frameCount = Math.max(1, Array.isArray(targetCanvas?.frames) ? targetCanvas.frames.length : 1);
    const layerCount = Math.max(1, Array.isArray(targetCanvas?.frames?.[0]?.layers) ? targetCanvas.frames[0].layers.length : 1);
    frameInput.min = '1';
    layerInput.min = '1';
    frameInput.max = String(frameCount);
    layerInput.max = String(layerCount);
    if (pendingRequest) {
      frameInput.value = String(clamp(pendingRequest.frameIndex, 0, Math.max(0, frameCount - 1)) + 1);
      layerInput.value = String(clamp(pendingRequest.trackIndex, 0, Math.max(0, layerCount - 1)) + 1);
    } else if (assignment) {
      const frameIndex = getAssignedFrameIndexForClient(targetClientId, targetCanvas);
      const trackIndex = getAssignedLayerTrackIndexForClient(targetClientId, targetCanvas);
      frameInput.value = String((frameIndex >= 0 ? frameIndex : 0) + 1);
      layerInput.value = String((trackIndex >= 0 ? trackIndex : 0) + 1);
    } else {
      frameInput.value = frameInput.value || '1';
      layerInput.value = layerInput.value || '1';
    }
  }

  function syncMultiAssignmentControls() {
    if (prefersSharedProjectFlow() || isSharedProjectCollaborativeMode()) {
      const controls = [
        dom.controls.multiAssignTarget,
        dom.controls.multiAssignFrame,
        dom.controls.multiAssignLayer,
        dom.controls.multiAssignApply,
        dom.controls.multiAssignLockToggle,
        dom.controls.multiAssignKick,
        dom.controls.multiAssignBan,
        dom.controls.multiRoleTarget,
        dom.controls.multiForceGuest,
        dom.controls.multiForceSpectator,
        dom.controls.multiBlockedTarget,
        dom.controls.multiBlockedRemove,
      ];
      controls.forEach(control => {
        if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement || control instanceof HTMLSelectElement) {
          control.disabled = true;
        }
      });
      if (dom.controls.multiAssignmentField instanceof HTMLElement) {
        dom.controls.multiAssignmentField.hidden = true;
      }
      syncMultiBlockedControls();
      return;
    }
    normalizeMultiAssignmentsForCurrentDocument();
    prunePendingMultiAssignmentMoveRequests();
    const select = dom.controls.multiAssignTarget;
    const frameInput = dom.controls.multiAssignFrame;
    const layerInput = dom.controls.multiAssignLayer;
    const applyButton = dom.controls.multiAssignApply;
    const lockButton = dom.controls.multiAssignLockToggle;
    const kickButton = dom.controls.multiAssignKick;
    const banButton = dom.controls.multiAssignBan;
    const assignmentField = dom.controls.multiAssignmentField;
    const canControl = isMultiMasterMode();
    const rows = buildMultiParticipantRows().filter(row => row.role === 'guest');
    const sharedTargetSelect = select instanceof HTMLSelectElement
      && dom.controls.multiRoleTarget instanceof HTMLSelectElement
      && select === dom.controls.multiRoleTarget;
    if (select instanceof HTMLSelectElement) {
      if (!sharedTargetSelect) {
        const previous = multiState.selectedAssignClientId || select.value || '';
        select.innerHTML = '';
        rows.forEach(row => {
          const option = document.createElement('option');
          option.value = row.clientId;
          const lockLabel = row.locked ? localizeText(' [ロック中]', ' [Locked]') : '';
          const onlineLabel = row.online ? '' : localizeText(' (オフライン)', ' (offline)');
          const pendingRequest = getPendingMultiAssignmentMoveRequest(row.clientId);
          const pendingCanvas = pendingRequest
            ? getProjectCanvasDocumentById(normalizeMultiAssignmentCanvasId(pendingRequest.canvasId, getActiveProjectCanvasDocument()?.id || ''))
            : null;
          const requestLabel = pendingRequest
            ? localizeText(
              ` [申請: ${pendingCanvas?.name || getDefaultProjectCanvasName(1)} / F${pendingRequest.frameIndex + 1} / L${pendingRequest.trackIndex + 1}]`,
              ` [Request: ${pendingCanvas?.name || getDefaultProjectCanvasName(1)} / F${pendingRequest.frameIndex + 1} / L${pendingRequest.trackIndex + 1}]`
            )
            : '';
          option.textContent = `${row.name}${lockLabel}${requestLabel}${onlineLabel}`;
          select.appendChild(option);
        });
        if (rows.length) {
          const nextSelected = rows.some(row => row.clientId === previous)
            ? previous
            : rows[0].clientId;
          select.value = nextSelected;
          setMultiSelectedControlClientId(nextSelected);
        } else {
          setMultiSelectedControlClientId('');
        }
      } else {
        const selectedFromShared = select.value
          || multiState.selectedAssignClientId
          || multiState.selectedRoleControlClientId
          || '';
        setMultiSelectedControlClientId(selectedFromShared);
      }
      if (!sharedTargetSelect) {
        select.disabled = !canControl || rows.length === 0;
      }
    }
    if (frameInput instanceof HTMLInputElement) {
      frameInput.disabled = !canControl || rows.length === 0;
    }
    if (layerInput instanceof HTMLInputElement) {
      layerInput.disabled = !canControl || rows.length === 0;
    }
    if (applyButton instanceof HTMLButtonElement) {
      applyButton.disabled = !canControl || rows.length === 0;
    }
    syncMultiRoleControlUi();
    const targetInfo = getMultiSelectedControlTargetInfo();
    const targetClientId = targetInfo.clientId;
    const targetAssignment = targetInfo.assignment;
    const targetRole = targetInfo.role;
    const targetPendingRequest = targetClientId ? getPendingMultiAssignmentMoveRequest(targetClientId) : null;
    const hasTargetGuest = Boolean(targetClientId && targetRole === 'guest' && rows.some(row => row.clientId === targetClientId));
    const hasTargetAssignment = Boolean(hasTargetGuest && targetAssignment);
    if (frameInput instanceof HTMLInputElement) {
      frameInput.disabled = !canControl || !hasTargetAssignment;
    }
    if (layerInput instanceof HTMLInputElement) {
      layerInput.disabled = !canControl || !hasTargetAssignment;
    }
    if (applyButton instanceof HTMLButtonElement) {
      applyButton.disabled = !canControl || !hasTargetAssignment;
      applyButton.textContent = targetPendingRequest
        ? localizeText('申請セルへ移動', 'Move To Requested Cell')
        : localizeText('参加者を移動', 'Move Participant');
    }
    if (lockButton instanceof HTMLButtonElement) {
      lockButton.disabled = !canControl || !hasTargetAssignment;
      lockButton.textContent = targetAssignment?.locked
        ? localizeText('セルロック解除', 'Unlock Cell')
        : localizeText('セルロック', 'Lock Cell');
    }
    if (kickButton instanceof HTMLButtonElement) {
      kickButton.disabled = !canControl || !hasTargetGuest;
    }
    if (banButton instanceof HTMLButtonElement) {
      banButton.disabled = !canControl || !hasTargetGuest;
    }
    if (assignmentField instanceof HTMLElement) {
      assignmentField.hidden = !canControl || targetRole !== 'guest';
    }
    if (applyButton instanceof HTMLButtonElement) {
      if (!canControl) {
        applyButton.title = localizeText('マスターのみ操作できます', 'Master only');
      } else if (targetRole !== 'guest') {
        applyButton.title = localizeText('参加者を選択すると使えます', 'Select a participant to use this');
      } else {
        applyButton.removeAttribute('title');
      }
    }
    if (lockButton instanceof HTMLButtonElement) {
      if (!canControl) {
        lockButton.title = localizeText('マスターのみ操作できます', 'Master only');
      } else if (targetRole !== 'guest') {
        lockButton.title = localizeText('参加者を選択すると使えます', 'Select a participant to use this');
      } else {
        lockButton.removeAttribute('title');
      }
    }
    if (kickButton instanceof HTMLButtonElement) {
      if (!canControl) {
        kickButton.title = localizeText('マスターのみ操作できます', 'Master only');
      } else if (targetRole !== 'guest') {
        kickButton.title = localizeText('参加者を選択すると使えます', 'Select a participant to use this');
      } else {
        kickButton.removeAttribute('title');
      }
    }
    if (banButton instanceof HTMLButtonElement) {
      if (!canControl) {
        banButton.title = localizeText('マスターのみ操作できます', 'Master only');
      } else if (targetRole !== 'guest') {
        banButton.title = localizeText('参加者を選択すると使えます', 'Select a participant to use this');
      } else {
        banButton.removeAttribute('title');
      }
    }
    updateMultiAssignmentControlsFromSelection();
    syncMultiBlockedControls();
  }

  function syncMultiBlockedControls() {
    const select = dom.controls.multiBlockedTarget;
    const removeButton = dom.controls.multiBlockedRemove;
    const hint = dom.controls.multiBlockedHint;
    const canControl = isMultiMasterMode();
    const blockedClientIds = serializeMultiBlockedClientIds();
    if (select instanceof HTMLSelectElement) {
      const previous = select.value || '';
      select.innerHTML = '';
      blockedClientIds.forEach(clientId => {
        const option = document.createElement('option');
        option.value = clientId;
        option.textContent = clientId;
        select.appendChild(option);
      });
      if (blockedClientIds.length) {
        select.value = blockedClientIds.includes(previous) ? previous : blockedClientIds[0];
      }
      select.disabled = !canControl || blockedClientIds.length === 0;
    }
    if (removeButton instanceof HTMLButtonElement) {
      removeButton.disabled = !canControl || blockedClientIds.length === 0;
    }
    if (hint instanceof HTMLElement) {
      if (!multiState.connected) {
        hint.textContent = localizeText(
          '接続後、マスターのみBAN解除できます。',
          'After connecting, only the master can remove bans.'
        );
      } else if (!canControl) {
        hint.textContent = localizeText(
          'マスターのみBAN解除できます。',
          'Only the master can remove bans.'
        );
      } else if (!blockedClientIds.length) {
        hint.textContent = localizeText(
          'BAN中の参加者はいません。',
          'No banned participants.'
        );
      } else {
        hint.textContent = localizeText(
          `${blockedClientIds.length} 件のBANがあります。選択して解除できます。`,
          `${blockedClientIds.length} bans. Select one to remove.`
        );
      }
    }
  }

  function moveMultiParticipantToCell(
    clientId,
    frameIndexRaw,
    trackIndexRaw,
    {
      announceStatus = true,
      canvasId = getActiveProjectCanvasDocument()?.id || '',
    } = {}
  ) {
    if (!isMultiMasterMode()) {
      setMultiStatus(localizeText('参加者のセル移動はマスターのみ操作できます', 'Only the master can move participant cells'), 'warn');
      return false;
    }
    const targetClientId = typeof clientId === 'string' ? clientId.trim() : '';
    if (!targetClientId) {
      setMultiStatus(localizeText('セル移動する参加者を選択してください', 'Select a participant to move'), 'warn');
      return false;
    }
    if (isMultiClientBlocked(targetClientId)) {
      setMultiStatus(localizeText('BAN中の参加者は移動できません', 'Banned participants cannot be moved'), 'warn');
      return false;
    }
    const assignment = getMultiAssignment(targetClientId);
    if (!assignment) {
      setMultiStatus(localizeText('対象参加者の割り当てが見つかりません', 'Selected participant assignment was not found'), 'warn');
      return false;
    }
    normalizeMultiAssignmentsForCurrentDocument();
    const targetCanvas = getProjectCanvasDocumentById(
      normalizeMultiAssignmentCanvasId(canvasId, assignment.canvasId || getActiveProjectCanvasDocument()?.id || '')
    ) || getActiveProjectCanvasDocument();
    const frameCount = Array.isArray(targetCanvas?.frames) ? targetCanvas.frames.length : 0;
    const layerCount = Array.isArray(targetCanvas?.frames?.[0]?.layers) ? targetCanvas.frames[0].layers.length : 0;
    if (!frameCount || !layerCount) {
      setMultiStatus(localizeText('セル移動できるフレーム/レイヤーがありません', 'No frame/layer is available for reassignment'), 'warn');
      return false;
    }
    const frameIndex = clamp(Math.round(Number(frameIndexRaw) || 0), 0, frameCount - 1);
    const trackIndex = clamp(Math.round(Number(trackIndexRaw) || 0), 0, layerCount - 1);
    const occupied = isMultiAssignmentCellOccupied(frameIndex, trackIndex, targetClientId, targetCanvas);
    if (occupied) {
      setMultiStatus(
        localizeText(
          `フレーム ${frameIndex + 1} / レイヤー ${trackIndex + 1} は他の参加者が使用中です`,
          `Frame ${frameIndex + 1} / Layer ${trackIndex + 1} is already used by another participant`
        ),
        'warn'
      );
      return false;
    }
    const anchorLayer = targetCanvas.frames[0]?.layers?.[trackIndex];
    const targetFrame = targetCanvas.frames[frameIndex];
    if (!anchorLayer || !anchorLayer.id || !targetFrame || !targetFrame.id) {
      setMultiStatus(localizeText('指定セルへ移動できませんでした', 'Failed to move to the specified cell'), 'error');
      return false;
    }
    assignment.canvasId = targetCanvas.id;
    assignment.anchorLayerId = anchorLayer.id;
    assignment.trackHint = trackIndex;
    assignment.frameId = targetFrame.id;
    assignment.frameHint = frameIndex;
    multiState.assignments.set(targetClientId, assignment);
    pruneMultiHistoryCanvases();
    removePendingMultiAssignmentMoveRequest(targetClientId);
    renderMultiParticipantsList();
    syncMultiAssignmentControls();
    scheduleMultiSessionStateBroadcast({ immediate: true });
    if (announceStatus) {
      setMultiStatus(
        localizeText(
          `参加者を フレーム ${frameIndex + 1} / レイヤー ${trackIndex + 1} へ移動しました`,
          `Moved participant to Frame ${frameIndex + 1} / Layer ${trackIndex + 1}`
        ),
        'success'
      );
    }
    return true;
  }

  async function sendMultiAssignmentMoveRequest(frameIndexRaw, trackIndexRaw, {
    requestVersion = null,
    announceStatus = true,
    source = 'timeline',
  } = {}) {
    if (!canCurrentGuestFreelyMoveAssignedCell()) {
      return false;
    }
    const targetCanvas = getActiveProjectCanvasDocument();
    const frameCount = Array.isArray(targetCanvas?.frames) ? targetCanvas.frames.length : 0;
    if (!frameCount) {
      return false;
    }
    const assignment = getMultiAssignment(multiState.clientId);
    if (!assignment) {
      maybeRequestGuestAssignmentSync();
      setMultiStatus(localizeText('割り当てセルを待機中です。マスターの同期を待ってください。', 'Waiting for assigned cell. Please wait for master sync.'), 'warn');
      return false;
    }
    if (assignment.locked) {
      setMultiStatus(localizeText('この参加者セルはマスターによってロックされています', 'This participant cell is locked by the master'), 'warn');
      return false;
    }
    const frameIndex = clamp(Math.round(Number(frameIndexRaw) || 0), 0, frameCount - 1);
    const layerCount = Array.isArray(targetCanvas.frames[frameIndex]?.layers) ? targetCanvas.frames[frameIndex].layers.length : 0;
    if (!layerCount) {
      setMultiStatus(localizeText('指定セルへ移動できませんでした', 'Failed to move to the specified cell'), 'warn');
      return false;
    }
    const trackIndex = clamp(Math.round(Number(trackIndexRaw) || 0), 0, layerCount - 1);
    const assignedCell = getAssignedCellForClient(multiState.clientId);
    if (
      assignedCell
      && assignedCell.canvasId === (targetCanvas?.id || '')
      && assignedCell.frameIndex === frameIndex
      && assignedCell.trackIndex === trackIndex
    ) {
      clearMultiGuestMovePreview();
      state.activeFrame = frameIndex;
      state.activeLayer = assignedCell.layer.id;
      syncControlsWithState();
      renderFrameList();
      renderLayerList();
      renderTimelineMatrix();
      scheduleSessionPersist();
      requestRender();
      requestOverlayRender();
      return true;
    }
    if (isMultiAssignmentCellOccupied(frameIndex, trackIndex, multiState.clientId, targetCanvas)) {
      setMultiStatus(localizeText('そのセルは他の参加者が使用中です', 'That cell is already used by another participant'), 'warn');
      return false;
    }
    const sent = await sendMultiBroadcast('assignment-move-request', {
      projectKey: multiState.projectKey,
      clientId: multiState.clientId,
      canvasId: targetCanvas?.id || '',
      frameIndex,
      trackIndex,
      requestVersion: Number.isFinite(Number(requestVersion)) ? Math.max(0, Math.round(Number(requestVersion))) : null,
      source: typeof source === 'string' && source.trim() ? source.trim().slice(0, 32) : 'timeline',
      sentAt: Date.now(),
    });
    if (!sent) {
      if ((multiState.guestMovePreview?.version || -1) === Math.max(0, Math.round(Number(requestVersion) || -1))) {
        clearMultiGuestMovePreview({ render: true });
      }
      setMultiStatus(localizeText('セル移動リクエストの送信に失敗しました', 'Failed to send cell move request'), 'error');
      return false;
    }
    if (announceStatus) {
      setMultiStatus(
        localizeText(
          `フレーム ${frameIndex + 1} / レイヤー ${trackIndex + 1} への移動リクエストを送信しました`,
          `Sent a move request to Frame ${frameIndex + 1} / Layer ${trackIndex + 1}`
        ),
        'info'
      );
    }
    return true;
  }

  async function sendMultiAssignmentMovePermissionRequest(frameIndexRaw, trackIndexRaw, {
    requestVersion = null,
    announceStatus = true,
    source = 'timeline',
  } = {}) {
    if (!isMultiGuestMode()) {
      return false;
    }
    const targetCanvas = getActiveProjectCanvasDocument();
    const frameCount = Array.isArray(targetCanvas?.frames) ? targetCanvas.frames.length : 0;
    if (!frameCount) {
      return false;
    }
    const assignment = getMultiAssignment(multiState.clientId);
    if (!assignment) {
      maybeRequestGuestAssignmentSync();
      setMultiStatus(localizeText('割り当てセルを待機中です。マスターの同期を待ってください。', 'Waiting for assigned cell. Please wait for master sync.'), 'warn');
      return false;
    }
    if (assignment.locked) {
      setMultiStatus(localizeText('この参加者セルはマスターによってロックされています', 'This participant cell is locked by the master'), 'warn');
      return false;
    }
    const frameIndex = clamp(Math.round(Number(frameIndexRaw) || 0), 0, frameCount - 1);
    const layerCount = Array.isArray(targetCanvas.frames[frameIndex]?.layers) ? targetCanvas.frames[frameIndex].layers.length : 0;
    if (!layerCount) {
      return false;
    }
    const trackIndex = clamp(Math.round(Number(trackIndexRaw) || 0), 0, layerCount - 1);
    const assignedCell = getAssignedCellForClient(multiState.clientId);
    if (
      assignedCell
      && assignedCell.canvasId === (targetCanvas?.id || '')
      && assignedCell.frameIndex === frameIndex
      && assignedCell.trackIndex === trackIndex
    ) {
      clearMultiGuestMovePreview();
      state.activeFrame = frameIndex;
      state.activeLayer = assignedCell.layer.id;
      syncControlsWithState();
      renderFrameList();
      renderLayerList();
      renderTimelineMatrix();
      scheduleSessionPersist();
      requestRender();
      requestOverlayRender();
      return true;
    }
    const sent = await sendMultiBroadcast('assignment-move-request', {
      projectKey: multiState.projectKey,
      clientId: multiState.clientId,
      canvasId: targetCanvas?.id || '',
      frameIndex,
      trackIndex,
      mode: 'request',
      requestVersion: Number.isFinite(Number(requestVersion)) ? Math.max(0, Math.round(Number(requestVersion))) : null,
      source: typeof source === 'string' && source.trim() ? source.trim().slice(0, 32) : 'timeline',
      sentAt: Date.now(),
    });
    if (!sent) {
      if ((multiState.guestMovePreview?.version || -1) === Math.max(0, Math.round(Number(requestVersion) || -1))) {
        clearMultiGuestMovePreview({ render: true });
      }
      setMultiStatus(localizeText('移動許可申請の送信に失敗しました', 'Failed to send move permission request'), 'error');
      return false;
    }
    if (announceStatus) {
      setMultiStatus(
        localizeText(
          `フレーム ${frameIndex + 1} / レイヤー ${trackIndex + 1} への移動許可を申請しました`,
          `Requested permission to move to Frame ${frameIndex + 1} / Layer ${trackIndex + 1}`
        ),
        'info'
      );
    }
    return true;
  }

  async function requestMultiGuestMoveToCell(frameIndexRaw, trackIndexRaw, options = {}) {
    if (canCurrentGuestFreelyMoveAssignedCell()) {
      return sendMultiAssignmentMoveRequest(frameIndexRaw, trackIndexRaw, options);
    }
    return sendMultiAssignmentMovePermissionRequest(frameIndexRaw, trackIndexRaw, options);
  }

  async function sendMultiAssignmentMoveResult(targetClientId, {
    decision = 'denied',
    frameIndex = -1,
    trackIndex = -1,
    canvasId = '',
    requestVersion = null,
  } = {}) {
    if (!isMultiMasterMode()) {
      return false;
    }
    const normalizedClientId = typeof targetClientId === 'string' ? targetClientId.trim() : '';
    if (!normalizedClientId || normalizedClientId === multiState.clientId) {
      return false;
    }
    return sendMultiBroadcast('assignment-move-result', {
      projectKey: multiState.projectKey,
      clientId: multiState.clientId,
      targetClientId: normalizedClientId,
      decision: typeof decision === 'string' ? decision.trim().slice(0, 32) : 'denied',
      canvasId: normalizeMultiAssignmentCanvasId(canvasId, getActiveProjectCanvasDocument()?.id || ''),
      frameIndex: Number.isFinite(Number(frameIndex)) ? Math.max(0, Math.round(Number(frameIndex))) : -1,
      trackIndex: Number.isFinite(Number(trackIndex)) ? Math.max(0, Math.round(Number(trackIndex))) : -1,
      requestVersion: Number.isFinite(Number(requestVersion)) ? Math.max(0, Math.round(Number(requestVersion))) : null,
      sentAt: Date.now(),
    });
  }

  async function handleMultiAssignmentMoveRequestMessage(payload) {
    if (!isMultiMasterMode()) {
      return;
    }
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const senderClientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : '';
    const projectKey = normalizeMultiProjectKey(payload.projectKey || '');
    const mode = typeof payload.mode === 'string' ? payload.mode.trim() : 'immediate';
    const requestVersion = Number.isFinite(Number(payload.requestVersion))
      ? Math.max(0, Math.round(Number(payload.requestVersion)))
      : null;
    if (!senderClientId || senderClientId === multiState.clientId || projectKey !== multiState.projectKey) {
      return;
    }
    if (isMultiClientBlocked(senderClientId)) {
      await sendMultiAssignmentMoveResult(senderClientId, { decision: 'blocked', requestVersion });
      return;
    }
    if (
      mode === 'immediate'
      && !normalizeMultiParticipantFreeCellMove(
        multiState.participantFreeCellMove,
        MULTI_DEFAULT_PARTICIPANT_FREE_CELL_MOVE
      )
    ) {
      await sendMultiAssignmentMoveResult(senderClientId, { decision: 'disabled', requestVersion });
      return;
    }
    const assignment = getMultiAssignment(senderClientId);
    if (!assignment || assignment.role !== 'guest') {
      await sendMultiAssignmentMoveResult(senderClientId, { decision: 'unassigned', requestVersion });
      return;
    }
    if (assignment.locked) {
      await sendMultiAssignmentMoveResult(senderClientId, { decision: 'locked', requestVersion });
      return;
    }
    const payloadCanvasId = normalizeMultiAssignmentCanvasId(
      payload.canvasId,
      assignment.canvasId || getActiveProjectCanvasDocument()?.id || ''
    );
    const targetCanvas = getProjectCanvasDocumentById(payloadCanvasId);
    const frameCount = Array.isArray(targetCanvas?.frames) ? targetCanvas.frames.length : 0;
    const requestedFrameIndex = Math.round(Number(payload.frameIndex));
    if (!frameCount || !Number.isFinite(requestedFrameIndex) || requestedFrameIndex < 0 || requestedFrameIndex >= frameCount) {
      await sendMultiAssignmentMoveResult(senderClientId, { decision: 'invalid', canvasId: payloadCanvasId, requestVersion });
      return;
    }
    const layerCount = Array.isArray(targetCanvas.frames[requestedFrameIndex]?.layers) ? targetCanvas.frames[requestedFrameIndex].layers.length : 0;
    const requestedTrackIndex = Math.round(Number(payload.trackIndex));
    if (!layerCount || !Number.isFinite(requestedTrackIndex) || requestedTrackIndex < 0 || requestedTrackIndex >= layerCount) {
      await sendMultiAssignmentMoveResult(senderClientId, { decision: 'invalid', canvasId: payloadCanvasId, requestVersion });
      return;
    }
    if (mode === 'request') {
      upsertPendingMultiAssignmentMoveRequest(
        senderClientId,
        requestedFrameIndex,
        requestedTrackIndex,
        payload.sentAt,
        targetCanvas.id
      );
      if (!multiState.masterOpsMode) {
        multiState.masterOpsMode = true;
      }
      selectMultiControlTarget(senderClientId);
      syncMultiControls();
      syncMultiAssignmentControls();
      setMultiStatus(
        localizeText(
          `${resolveMultiCommentAuthorName(senderClientId)} が フレーム ${requestedFrameIndex + 1} / レイヤー ${requestedTrackIndex + 1} への移動許可を申請しました`,
          `${resolveMultiCommentAuthorName(senderClientId)} requested permission to move to Frame ${requestedFrameIndex + 1} / Layer ${requestedTrackIndex + 1}`
        ),
        'info'
      );
      return;
    }
    if (isMultiAssignmentCellOccupied(requestedFrameIndex, requestedTrackIndex, senderClientId, targetCanvas)) {
      await sendMultiAssignmentMoveResult(senderClientId, {
        decision: 'occupied',
        canvasId: targetCanvas.id,
        frameIndex: requestedFrameIndex,
        trackIndex: requestedTrackIndex,
        requestVersion,
      });
      return;
    }
    const moved = moveMultiParticipantToCell(senderClientId, requestedFrameIndex, requestedTrackIndex, {
      announceStatus: false,
      canvasId: targetCanvas.id,
    });
    if (!moved) {
      await sendMultiAssignmentMoveResult(senderClientId, {
        decision: 'denied',
        canvasId: targetCanvas.id,
        frameIndex: requestedFrameIndex,
        trackIndex: requestedTrackIndex,
        requestVersion,
      });
      return;
    }
    await sendMultiAssignmentMoveResult(senderClientId, {
      decision: 'approved',
      canvasId: targetCanvas.id,
      frameIndex: requestedFrameIndex,
      trackIndex: requestedTrackIndex,
      requestVersion,
    });
  }

  function handleMultiAssignmentMoveResultMessage(payload) {
    if (!isMultiGuestMode()) {
      return;
    }
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const targetClientId = typeof payload.targetClientId === 'string' ? payload.targetClientId.trim() : '';
    const projectKey = normalizeMultiProjectKey(payload.projectKey || '');
    if (!targetClientId || targetClientId !== multiState.clientId || projectKey !== multiState.projectKey) {
      return;
    }
    const decision = typeof payload.decision === 'string' ? payload.decision.trim() : 'denied';
    const payloadCanvasId = normalizeMultiAssignmentCanvasId(payload.canvasId, getActiveProjectCanvasDocument()?.id || '');
    const targetCanvas = getProjectCanvasDocumentById(payloadCanvasId) || getActiveProjectCanvasDocument();
    const frameIndex = Math.round(Number(payload.frameIndex));
    const trackIndex = Math.round(Number(payload.trackIndex));
    const requestVersion = Number.isFinite(Number(payload.requestVersion))
      ? Math.max(0, Math.round(Number(payload.requestVersion)))
      : null;
    if (
      Number.isFinite(requestVersion)
      && requestVersion !== null
      && requestVersion > 0
      && requestVersion < Math.max(0, Math.round(Number(multiState.guestMovePreviewVersion) || 0))
    ) {
      return;
    }
    if ((multiState.guestMovePreview?.version || -1) === requestVersion) {
      clearMultiGuestMovePreview();
    }
    if (decision === 'approved') {
      const frame = targetCanvas && Number.isFinite(frameIndex) ? targetCanvas.frames[frameIndex] : null;
      const targetLayer = frame && Array.isArray(frame.layers) && Number.isFinite(trackIndex)
        ? frame.layers[trackIndex] || null
        : null;
      const anchorLayer = Array.isArray(targetCanvas?.frames?.[0]?.layers) && Number.isFinite(trackIndex)
        ? targetCanvas.frames[0].layers[trackIndex] || null
        : null;
      const assignment = getMultiAssignment(multiState.clientId);
      if (assignment && anchorLayer && frame && targetLayer) {
        assignment.canvasId = targetCanvas?.id || assignment.canvasId || '';
        assignment.anchorLayerId = anchorLayer.id;
        assignment.trackHint = trackIndex;
        assignment.frameId = frame.id;
        assignment.frameHint = frameIndex;
        multiState.assignments.set(multiState.clientId, assignment);
      }
      if (targetCanvas?.id) {
        const targetCanvasIndex = getProjectCanvasDocuments().findIndex(canvas => canvas?.id === targetCanvas.id);
        if (targetCanvasIndex >= 0 && targetCanvas.id !== (getActiveProjectCanvasDocument()?.id || '')) {
          setActiveProjectCanvasByIndex(targetCanvasIndex, { persist: false, syncUi: true });
        }
      }
      if (targetLayer) {
        state.activeFrame = clamp(frameIndex, 0, Math.max(0, state.frames.length - 1));
        state.activeLayer = targetLayer.id;
      }
      renderMultiParticipantsList();
      syncControlsWithState();
      renderFrameList();
      renderLayerList();
      renderTimelineMatrix();
      requestRender();
      requestOverlayRender();
      setMultiStatus(
        localizeText(
          `フレーム ${frameIndex + 1} / レイヤー ${trackIndex + 1} へ移動しました`,
          `Moved to Frame ${frameIndex + 1} / Layer ${trackIndex + 1}`
        ),
        'success'
      );
      return;
    }
    if (decision === 'occupied') {
      clearMultiGuestMovePreview({ render: true });
      setMultiStatus(localizeText('そのセルは他の参加者が使用中です', 'That cell is already used by another participant'), 'warn');
      return;
    }
    if (decision === 'locked') {
      clearMultiGuestMovePreview({ render: true });
      setMultiStatus(localizeText('この参加者セルはマスターによってロックされています', 'This participant cell is locked by the master'), 'warn');
      return;
    }
    if (decision === 'disabled') {
      clearMultiGuestMovePreview({ render: true });
      setMultiStatus(localizeText('この部屋では参加者セルの自由移動はOFFです', 'Participant free cell movement is OFF in this room'), 'warn');
      return;
    }
    if (decision === 'unassigned') {
      clearMultiGuestMovePreview({ render: true });
      maybeRequestGuestAssignmentSync();
      setMultiStatus(localizeText('割り当てセルを待機中です。マスターの同期を待ってください。', 'Waiting for assigned cell. Please wait for master sync.'), 'warn');
      return;
    }
    clearMultiGuestMovePreview({ render: true });
    setMultiStatus(localizeText('セル移動に失敗しました', 'Failed to move to the requested cell'), 'warn');
  }

  async function rejectPendingMultiAssignmentMoveRequest(clientId) {
    if (!isMultiMasterMode()) {
      setMultiStatus(localizeText('移動申請の却下はマスターのみ操作できます', 'Only the master can reject move requests'), 'warn');
      return false;
    }
    const targetClientId = typeof clientId === 'string' ? clientId.trim() : '';
    if (!targetClientId) {
      setMultiStatus(localizeText('却下する参加者を選択してください', 'Select a participant to reject'), 'warn');
      return false;
    }
    const pendingRequest = getPendingMultiAssignmentMoveRequest(targetClientId);
    if (!pendingRequest) {
      setMultiStatus(localizeText('却下する移動申請はありません', 'No pending move request to reject'), 'info');
      return false;
    }
    removePendingMultiAssignmentMoveRequest(targetClientId);
    renderMultiParticipantsList();
    syncMultiAssignmentControls();
    await sendMultiAssignmentMoveResult(targetClientId, {
      decision: 'denied',
      canvasId: pendingRequest.canvasId || '',
      frameIndex: pendingRequest.frameIndex,
      trackIndex: pendingRequest.trackIndex,
    });
    setMultiStatus(localizeText('移動申請を却下しました', 'Move request rejected'), 'info');
    return true;
  }

  async function sendMultiKickClientNotice(targetClientId, reason = 'kicked') {
    if (!isMultiMasterMode()) {
      return false;
    }
    const normalizedClientId = typeof targetClientId === 'string' ? targetClientId.trim() : '';
    if (!normalizedClientId) {
      return false;
    }
    return sendMultiBroadcast('kick-client', {
      clientId: multiState.clientId,
      projectKey: multiState.projectKey,
      targetClientId: normalizedClientId,
      reason: typeof reason === 'string' ? reason.trim().slice(0, 48) : '',
      maxGuests: normalizeMultiMaxGuests(multiState.maxGuests, MULTI_DEFAULT_GUEST_LIMIT),
      sentAt: Date.now(),
    });
  }

  function setMultiParticipantCellLocked(clientId, lockedRaw) {
    if (!isMultiMasterMode()) {
      setMultiStatus(localizeText('セルロックはマスターのみ操作できます', 'Only the master can lock cells'), 'warn');
      return false;
    }
    const targetClientId = typeof clientId === 'string' ? clientId.trim() : '';
    if (!targetClientId) {
      setMultiStatus(localizeText('ロック対象の参加者を選択してください', 'Select a participant to lock'), 'warn');
      return false;
    }
    if (isMultiClientBlocked(targetClientId)) {
      setMultiStatus(localizeText('BAN中の参加者のロックは変更できません', 'Cannot change lock state for banned participants'), 'warn');
      return false;
    }
    const assignment = getMultiAssignment(targetClientId);
    if (!assignment || assignment.role === 'master') {
      setMultiStatus(localizeText('ロック対象の参加者割り当てが見つかりません', 'Lock target assignment was not found'), 'warn');
      return false;
    }
    const nextLocked = Boolean(lockedRaw);
    if (Boolean(assignment.locked) === nextLocked) {
      return true;
    }
    assignment.locked = nextLocked;
    multiState.assignments.set(targetClientId, assignment);
    renderMultiParticipantsList();
    syncMultiAssignmentControls();
    scheduleMultiSessionStateBroadcast({ immediate: true });
    setMultiStatus(
      nextLocked
        ? localizeText('参加者セルをロックしました', 'Participant cell locked')
        : localizeText('参加者セルのロックを解除しました', 'Participant cell unlocked'),
      'success'
    );
    return true;
  }

  function removeMultiParticipantFromAssignments(clientId) {
    const targetClientId = typeof clientId === 'string' ? clientId.trim() : '';
    if (!targetClientId) {
      return false;
    }
    const hadAssignment = multiState.assignments.delete(targetClientId);
    removePendingMultiAssignmentMoveRequest(targetClientId);
    multiState.participants.delete(targetClientId);
    if (multiState.selectedAssignClientId === targetClientId || multiState.selectedRoleControlClientId === targetClientId) {
      setMultiSelectedControlClientId('');
    }
    normalizeMultiAssignmentsForCurrentDocument();
    renderMultiParticipantsList();
    syncMultiAssignmentControls();
    return hadAssignment;
  }

  async function kickMultiParticipant(clientId) {
    if (!isMultiMasterMode()) {
      setMultiStatus(localizeText('参加者のキックはマスターのみ操作できます', 'Only the master can kick participants'), 'warn');
      return false;
    }
    const targetClientId = typeof clientId === 'string' ? clientId.trim() : '';
    if (!targetClientId) {
      setMultiStatus(localizeText('キック対象の参加者を選択してください', 'Select a participant to kick'), 'warn');
      return false;
    }
    if (targetClientId === multiState.clientId) {
      setMultiStatus(localizeText('マスター自身はキックできません', 'The master cannot kick themselves'), 'warn');
      return false;
    }
    const assignment = getMultiAssignment(targetClientId);
    if (assignment?.role === 'master') {
      setMultiStatus(localizeText('マスターはキック対象にできません', 'The master cannot be kicked'), 'warn');
      return false;
    }
    removeMultiParticipantFromAssignments(targetClientId);
    scheduleMultiSessionStateBroadcast({ immediate: true });
    await sendMultiKickClientNotice(targetClientId, 'master-kick');
    setMultiStatus(localizeText('参加者をキックしました（再参加可）', 'Participant kicked (can rejoin)'), 'success');
    return true;
  }

  async function banMultiParticipant(clientId) {
    if (!isMultiMasterMode()) {
      setMultiStatus(localizeText('参加者のBANはマスターのみ操作できます', 'Only the master can ban participants'), 'warn');
      return false;
    }
    const targetClientId = typeof clientId === 'string' ? clientId.trim() : '';
    if (!targetClientId) {
      setMultiStatus(localizeText('BAN対象の参加者を選択してください', 'Select a participant to ban'), 'warn');
      return false;
    }
    if (targetClientId === multiState.clientId) {
      setMultiStatus(localizeText('マスター自身はBANできません', 'The master cannot ban themselves'), 'warn');
      return false;
    }
    const assignment = getMultiAssignment(targetClientId);
    if (assignment?.role === 'master') {
      setMultiStatus(localizeText('マスターはBAN対象にできません', 'The master cannot be banned'), 'warn');
      return false;
    }
    if (!(multiState.blockedClientIds instanceof Set)) {
      multiState.blockedClientIds = new Set();
    }
    multiState.blockedClientIds.add(targetClientId);
    removeMultiParticipantFromAssignments(targetClientId);
    scheduleMultiSessionStateBroadcast({ immediate: true });
    await sendMultiKickClientNotice(targetClientId, 'master-ban');
    setMultiStatus(localizeText('参加者をBANしました（再参加不可）', 'Participant banned (cannot rejoin)'), 'success');
    return true;
  }

  function unbanMultiParticipant(clientId) {
    if (!isMultiMasterMode()) {
      setMultiStatus(localizeText('BAN解除はマスターのみ操作できます', 'Only the master can remove bans'), 'warn');
      return false;
    }
    const targetClientId = typeof clientId === 'string' ? clientId.trim() : '';
    if (!targetClientId) {
      setMultiStatus(localizeText('BAN解除対象を選択してください', 'Select a participant to unban'), 'warn');
      return false;
    }
    if (!(multiState.blockedClientIds instanceof Set) || !multiState.blockedClientIds.has(targetClientId)) {
      setMultiStatus(localizeText('指定された参加者はBANされていません', 'The selected participant is not banned'), 'warn');
      return false;
    }
    multiState.blockedClientIds.delete(targetClientId);
    syncMultiAssignmentControls();
    scheduleMultiSessionStateBroadcast({ immediate: true });
    setMultiStatus(localizeText('BANを解除しました', 'Ban removed'), 'success');
    return true;
  }

  function enforceGuestAssignedLayerSelection({ announce = false, enforceFrame = true, enforceLayer = true } = {}) {
    if (!isMultiAssignedCellRestrictedEditorMode()) {
      return true;
    }
    const frameCount = Array.isArray(state.frames) ? state.frames.length : 0;
    if (!frameCount) {
      return false;
    }
    if (isMultiClientBlocked(multiState.clientId)) {
      if (announce) {
        setMultiStatus(localizeText('このセッションでは編集権限がありません', 'You do not have edit permission in this session'), 'warn');
      }
      return false;
    }
    let assignment = getMultiAssignment(multiState.clientId);
    if (!assignment) {
      maybeRequestGuestAssignmentSync();
      if (announce) {
        setMultiStatus(localizeText('割り当てセルを待機中です。マスターの同期を待ってください。', 'Waiting for assigned cell. Please wait for master sync.'), 'warn');
      }
      return false;
    }
    const assignmentCanvas = getAssignmentCanvasDocument(assignment, getActiveProjectCanvasDocument());
    if (!assignmentCanvas) {
      maybeRequestGuestAssignmentSync();
      if (announce) {
        setMultiStatus(localizeText('割り当てキャンバスを待機中です。マスターの同期を待ってください。', 'Waiting for assigned canvas. Please wait for master sync.'), 'warn');
      }
      return false;
    }
    let changed = false;
    if ((getActiveProjectCanvasDocument()?.id || '') !== assignmentCanvas.id) {
      const targetCanvasIndex = getProjectCanvasDocuments().findIndex(canvas => canvas?.id === assignmentCanvas.id);
      if (targetCanvasIndex >= 0) {
        setActiveProjectCanvasByIndex(targetCanvasIndex, { persist: false, syncUi: true });
        changed = true;
      }
    }
    let assignedCell = getAssignedCellForClientOnCanvas(multiState.clientId, assignmentCanvas);
    if (!assignedCell) {
      maybeRequestGuestAssignmentSync();
      if (announce) {
        setMultiStatus(localizeText('割り当てセルを待機中です。マスターの同期を待ってください。', 'Waiting for assigned cell. Please wait for master sync.'), 'warn');
      }
      return false;
    }
    if (enforceFrame && state.activeFrame !== assignedCell.frameIndex) {
      state.activeFrame = assignedCell.frameIndex;
      changed = true;
    }
    if (enforceLayer && state.activeLayer !== assignedCell.layer.id) {
      state.activeLayer = assignedCell.layer.id;
      changed = true;
    }
    if (changed) {
      syncControlsWithState();
      renderFrameList();
      renderLayerList();
      renderTimelineMatrix();
      requestRender();
      requestOverlayRender();
    }
    if (assignment.locked) {
      if (announce) {
        setMultiStatus(localizeText('この参加者セルはマスターによってロックされています', 'This participant cell is locked by the master'), 'warn');
      }
      return false;
    }
    if (changed && announce) {
      setMultiStatus(localizeText('このルームでは割り当てセルのみ編集できます。', 'In this room, only your assigned cell can be edited.'), 'warn');
    }
    return true;
  }

  function getMultiStatusColor(tone) {
    if (tone === 'error') {
      return '#ff8c8c';
    }
    if (tone === 'warn') {
      return '#ffd98c';
    }
    if (tone === 'success') {
      return '#8ce3ff';
    }
    return '';
  }

  function appendMultiOverviewChip(container, label, tone = 'neutral') {
    if (!(container instanceof HTMLElement) || typeof label !== 'string' || !label.trim()) {
      return;
    }
    const chip = document.createElement('span');
    chip.className = `multi-overview__chip multi-overview__chip--${tone}`;
    chip.textContent = label.trim();
    container.appendChild(chip);
  }

  function setMultiEntryActionCopy(button, {
    title = '',
    meta = '',
    titleSelector = '',
    metaSelector = '',
  } = {}) {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const titleNode = titleSelector ? document.querySelector(titleSelector) : null;
    const metaNode = metaSelector ? document.querySelector(metaSelector) : null;
    if (titleNode instanceof HTMLElement) {
      titleNode.textContent = title;
      if (metaNode instanceof HTMLElement) {
        metaNode.textContent = meta;
        return;
      }
    }
    button.textContent = [title, meta].filter(Boolean).join(' ');
  }

  function renderMultiOverview() {
    const overview = dom.controls.multiOverview;
    const chips = dom.controls.multiOverviewChips;
    const summary = dom.controls.multiOverviewSummary;
    const hint = dom.controls.multiOverviewHint;
    if (!(overview instanceof HTMLElement)) {
      return;
    }
    if (chips instanceof HTMLElement) {
      chips.innerHTML = '';
    }

    const resolvedSharedProjectKey = resolveSharedProjectKeyForCurrentState();
    let summaryText = localizeText(
      '共有を作るか、共有リンクを貼り付けて同じプロジェクトを開いてください。',
      'Create shared or paste an invite link to open the same project.'
    );
    let hintText = localizeText(
      '共有プロジェクトは参加者の一覧にも保存され、あとから同じ状態で開き直せます。',
      'Shared projects stay in each member project list and can be reopened later.'
    );

    const pushChip = (label, tone = 'neutral') => {
      if (chips instanceof HTMLElement) {
        appendMultiOverviewChip(chips, label, tone);
      }
    };

    if (prefersSharedProjectFlow() && !resolvedSharedProjectKey && !multiState.connecting) {
      summaryText = localizeText(
        'リンクを送るだけで、みんなと一緒に描けます。',
        'Share a link to draw together.'
      );
      hintText = localizeText(
        '共有リンクを作成してください。',
        'Create a shared link.'
      );
    } else if (multiState.connecting) {
      const pendingRole = normalizeMultiDesiredRole(multiState.desiredRole);
      pushChip(localizeText('接続中', 'Connecting'), 'info');
      pushChip(localizeText('共有準備中', 'Preparing Shared'), 'info');
      summaryText = localizeText(
        '共有プロジェクトを準備しています。完了するとそのまま共同編集できます。',
        'Preparing the shared project. You can edit together as soon as it is ready.'
      );
      hintText = localizeText(
        '共有リンクとプロジェクト一覧の両方から同じプロジェクトを開けます。',
        'The same project can be reopened from either the invite link or your project list.'
      );
    } else if (resolvedSharedProjectKey || isSharedProjectCollaborativeMode()) {
      pushChip(localizeText('共有プロジェクト', 'Shared Project'), 'success');
      pushChip(localizeText('全員編集可', 'Collaborative Edit'), 'info');
      summaryText = localizeText(
        'このリンクをシェアして一緒に描きましょう。',
        'Share this link to draw together.'
      );
      hintText = localizeText(
        '共有リンクをコピーできます。',
        'You can copy the shared link.'
      );
    } else if (isMultiMasterMode()) {
      pushChip(getMultiRoleLabel('master'), 'master');
      pushChip(localizeText(`参加枠 ${getAssignedGuestCount()} / ${multiState.maxGuests}`, `Slots ${getAssignedGuestCount()} / ${multiState.maxGuests}`), 'info');
      pushChip(getMultiJoinPolicyLabel(), 'neutral');
      pushChip(getMultiRoomVisibilityLabel(), isMultiRoomPublic() ? 'success' : 'neutral');
      summaryText = localizeText(
        '参加者一覧から承認、視聴切替、セル移動、ロック、キック、BANを行えます。',
        'Use the participant list to approve, switch roles, move cells, lock, kick, and ban.'
      );
      hintText = localizeText(
        `部屋設定では ${getMultiJoinPolicyLabel()} / ${getMultiRoomVisibilityLabel()} / 出力 ${getMultiExportPermissionLabel()} を変更できます。`,
        `Room settings control ${getMultiJoinPolicyLabel()} / ${getMultiRoomVisibilityLabel()} / export ${getMultiExportPermissionLabel()}.`
      );
    } else if (isMultiGuestMode()) {
      const placement = describeMultiParticipantPlacement(multiState.clientId, 'guest');
      const freeMoveEnabled = canCurrentGuestFreelyMoveAssignedCell();
      const canExportImage = canCurrentClientExportProject('png');
      pushChip(getMultiRoleLabel('guest'), 'guest');
      pushChip(localizeText('描画可', 'Can Draw'), 'success');
      pushChip(freeMoveEnabled ? localizeText('自由移動ON', 'Free Move ON') : localizeText('固定セル', 'Assigned Cell'), freeMoveEnabled ? 'success' : 'neutral');
      if (canExportImage) {
        pushChip(localizeText('画像出力可', 'Can Export'), 'info');
      }
      summaryText = localizeText(
        `描画とコメントができます。担当は ${placement.text} です。`,
        `You can draw and comment. Your assignment is ${placement.text}.`
      );
      if (placement.locked) {
        hintText = localizeText(
          '担当セルはロック中です。移動はマスター操作のみです。',
          'Your assigned cell is locked. Only the master can move it.'
        );
      } else if (freeMoveEnabled) {
        hintText = localizeText(
          '参加者一覧の自分の行から、空いているセルへ移動できます。',
          'Use your row in the participant list to move to any free cell.'
        );
      } else {
        hintText = localizeText(
          'セルを移動したいときは、参加者一覧の自分の行から移動申請を送れます。',
          'Use your row in the participant list to request a cell move.'
        );
      }
      if (!canExportImage) {
        hintText += localizeText(' 画像出力は現在制限されています。', ' Image export is currently restricted.');
      }
    } else if (isMultiSpectatorMode()) {
      pushChip(getMultiRoleLabel('spectator'), 'spectator');
      pushChip(localizeText('コメント可', 'Can Comment'), 'info');
      pushChip(localizeText('描画不可', 'Read Only'), 'warn');
      if (multiState.joinRequestPending) {
        pushChip(localizeText('参加申請中', 'Request Pending'), 'warn');
        summaryText = localizeText(
          'コメントと閲覧ができます。参加申請は送信済みで、マスターの承認待ちです。',
          'You can comment and watch. Your join request has been sent and is waiting for master approval.'
        );
        hintText = localizeText(
          '承認されると自動で参加者へ切り替わります。参加者一覧で状態を確認できます。',
          'You will switch to participant automatically after approval. Check the participant list for status.'
        );
      } else {
        summaryText = localizeText(
          'コメントと閲覧ができます。描画したい場合は参加リクエストを送ってください。',
          'You can comment and watch. Send a join request if you want to draw.'
        );
        hintText = localizeText(
          '参加者一覧の自分の行を開くと、参加リクエストを送れます。',
          'Open your own row in the participant list to send a join request.'
        );
      }
    } else {
      const pendingRole = normalizeMultiDesiredRole(multiState.desiredRole);
      pushChip(
        pendingRole === 'master'
          ? localizeText('部屋作成', 'Open Room')
          : localizeText('参加準備', 'Join Setup'),
        pendingRole === 'master' ? 'master' : 'neutral'
      );
      summaryText = pendingRole === 'master'
        ? localizeText('部屋を開く準備ができています。接続後は参加者一覧から運営できます。', 'Ready to open a room. After connection, manage participants from the participant list.')
        : localizeText('参加準備ができています。接続後はまず視聴として入り、必要なら参加申請を送ります。', 'Ready to join. You will enter as a viewer first, then request access if needed.');
      hintText = pendingRole === 'master'
        ? localizeText('コメント欄は残したまま、参加者一覧を主操作面として使えます。', 'Comments stay visible while the participant list becomes the main control surface.')
        : localizeText('描画したい場合は「参加申請して入る」、見るだけなら「視聴で入る」を選びます。', 'Choose request access to draw, or viewer mode if you only want to watch.');
    }

    if (summary instanceof HTMLElement) {
      summary.textContent = summaryText;
    }
    if (hint instanceof HTMLElement) {
      hint.textContent = hintText;
    }
  }

  function setMultiStatus(message, tone = 'info') {
    let text = typeof message === 'string' && message.trim()
      ? message.trim()
      : localizeText('共有モード: OFF', 'Collab mode: OFF');
    let actionText = '';
    if (prefersSharedProjectFlow()) {
      const currentAccess = readCurrentMultiProjectAccessInput();
      const currentProjectKey = currentAccess.projectKey || readCurrentMultiProjectKey();
      const resolvedSharedProjectKey = resolveSharedProjectKeyForCurrentState();
      const sharedModeEnabled = isCurrentProjectSharedEntry()
        || Boolean(resolvedSharedProjectKey && resolvedSharedProjectKey === currentProjectKey);
      actionText = sharedModeEnabled
        ? localizeText('共有リンクをコピー', 'Copy Shared Link')
        : localizeText('共有リンクを作成', 'Create Shared Link');
    }
    multiState.status = text;
    const node = dom.controls.multiStatus;
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const nextText = actionText || text;
    const nextColor = getMultiStatusColor(tone);
    if (
      node.textContent === nextText
      && node.style.color === nextColor
      && node.dataset.tone === tone
    ) {
      return;
    }
    node.textContent = nextText;
    node.style.color = nextColor;
    node.dataset.tone = tone;
    renderMultiOverview();
  }

  function inferStartupBootProgressPercent(label = '') {
    const text = typeof label === 'string' ? label : '';
    if (!text) {
      return 10;
    }
    if (text.includes('起動設定') || text.includes('Checking startup settings')) {
      return 18;
    }
    if (text.includes('前回の作業') || text.includes('previous work')) {
      return 38;
    }
    if (text.includes('共有プロジェクト') || text.includes('shared project')) {
      return 56;
    }
    if (text.includes('起動内容') || text.includes('Loading startup content')) {
      return 78;
    }
    if (text.includes('起動を完了') || text.includes('Finalizing startup')) {
      return 94;
    }
    if (text.includes('起動準備') || text.includes('Preparing startup')) {
      return 10;
    }
    return Math.min(92, startupBootProgressPercent + 6);
  }

  function getStartupBootProgressNow() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  function waitForNextPaint() {
    return new Promise(resolve => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => resolve());
        return;
      }
      window.setTimeout(resolve, 16);
    });
  }

  async function waitForStartupBootProgressReveal() {
    const STARTUP_BOOT_PROGRESS_MIN_VISIBLE_MS = 140;
    const elapsed = getStartupBootProgressNow() - startupBootProgressUpdatedAt;
    const waitMs = Math.max(0, STARTUP_BOOT_PROGRESS_MIN_VISIBLE_MS - elapsed);
    if (waitMs > 0) {
      await new Promise(resolve => window.setTimeout(resolve, waitMs));
    }
    await waitForNextPaint();
  }

  function setStartupBootLoadingProgress(percent, { label = '', force = false } = {}) {
    const container = dom.startupBootLoading;
    const labelNode = dom.startupBootLoadingLabel;
    const percentNode = dom.startupBootLoadingPercent;
    const fillNode = dom.startupBootLoadingFill;
    if (!(container instanceof HTMLElement)) {
      return;
    }
    const numeric = Number.isFinite(Number(percent)) ? Number(percent) : 0;
    const clamped = Math.max(0, Math.min(100, Math.round(numeric)));
    const nextPercent = force ? clamped : Math.max(startupBootProgressPercent, clamped);
    startupBootProgressPercent = nextPercent;
    startupBootProgressUpdatedAt = getStartupBootProgressNow();
    if (labelNode instanceof HTMLElement) {
      const nextLabel = (typeof label === 'string' && label.trim())
        ? label.trim()
        : localizeText('起動準備中…', 'Preparing startup...');
      labelNode.textContent = nextLabel;
    }
    if (percentNode instanceof HTMLElement) {
      percentNode.textContent = `${nextPercent}%`;
    }
    if (fillNode instanceof HTMLElement) {
      fillNode.style.width = `${nextPercent}%`;
    }
    container.setAttribute('aria-hidden', String(nextPercent >= 100));
  }

  function syncStartupBootLoadingWithLabel(label = '') {
    const nextPercent = inferStartupBootProgressPercent(label);
    setStartupBootLoadingProgress(nextPercent, { label });
  }

  function syncGlobalLoadingIndicator(label = '') {
    const container = dom.globalLoadingIndicator;
    const labelNode = dom.globalLoadingIndicatorLabel;
    const cancelButton = dom.globalLoadingIndicatorCancel;
    if (!(container instanceof HTMLElement)) {
      return;
    }
    const nextLabel = (typeof label === 'string' && label.trim())
      ? label.trim()
      : (globalLoadingIndicatorLabel || localizeText('読み込み中…', 'Loading...'));
    if (nextLabel) {
      globalLoadingIndicatorLabel = nextLabel;
    }
    if (labelNode instanceof HTMLElement && globalLoadingIndicatorLabel) {
      labelNode.textContent = globalLoadingIndicatorLabel;
    }
    container.classList.toggle('global-loading-indicator--blocking', globalLoadingIndicatorBlockingDepth > 0);
    if (cancelButton instanceof HTMLButtonElement) {
      const canCancelStartupProgress = globalLoadingIndicatorBlockingDepth > 0;
      cancelButton.hidden = !canCancelStartupProgress;
      cancelButton.disabled = !canCancelStartupProgress;
    }
    if (globalLoadingIndicatorHideTimer !== null) {
      window.clearTimeout(globalLoadingIndicatorHideTimer);
      globalLoadingIndicatorHideTimer = null;
    }
    if (globalLoadingIndicatorDepth > 0) {
      if (globalLoadingIndicatorVisible) {
        container.hidden = false;
        container.setAttribute('aria-hidden', 'false');
        return;
      }
      if (globalLoadingIndicatorShowTimer !== null) {
        return;
      }
      globalLoadingIndicatorShowTimer = window.setTimeout(() => {
        globalLoadingIndicatorShowTimer = null;
        if (globalLoadingIndicatorDepth <= 0 || globalLoadingIndicatorVisible) {
          return;
        }
        globalLoadingIndicatorVisible = true;
        globalLoadingIndicatorShownAt = Date.now();
        container.hidden = false;
        container.setAttribute('aria-hidden', 'false');
        if (labelNode instanceof HTMLElement && globalLoadingIndicatorLabel) {
          labelNode.textContent = globalLoadingIndicatorLabel;
        }
      }, GLOBAL_LOADING_INDICATOR_SHOW_DELAY);
      return;
    }
    if (globalLoadingIndicatorShowTimer !== null) {
      window.clearTimeout(globalLoadingIndicatorShowTimer);
      globalLoadingIndicatorShowTimer = null;
    }
    if (!globalLoadingIndicatorVisible) {
      container.hidden = true;
      container.setAttribute('aria-hidden', 'true');
      return;
    }
    const elapsed = Date.now() - globalLoadingIndicatorShownAt;
    const remaining = Math.max(0, GLOBAL_LOADING_INDICATOR_MIN_VISIBLE_MS - elapsed);
    globalLoadingIndicatorHideTimer = window.setTimeout(() => {
      globalLoadingIndicatorHideTimer = null;
      if (globalLoadingIndicatorDepth > 0) {
        return;
      }
      globalLoadingIndicatorVisible = false;
      globalLoadingIndicatorShownAt = 0;
      container.hidden = true;
      container.setAttribute('aria-hidden', 'true');
    }, remaining);
  }

  function setGlobalLoadingIndicatorLabel(label = '') {
    if (globalLoadingIndicatorDepth <= 0) {
      return;
    }
    syncGlobalLoadingIndicator(label);
  }

  function beginGlobalLoading(label = '', { immediate = false } = {}) {
    globalLoadingIndicatorDepth += 1;
    syncGlobalLoadingIndicator(label);
    if (immediate) {
      const container = dom.globalLoadingIndicator;
      const labelNode = dom.globalLoadingIndicatorLabel;
      if (globalLoadingIndicatorShowTimer !== null) {
        window.clearTimeout(globalLoadingIndicatorShowTimer);
        globalLoadingIndicatorShowTimer = null;
      }
      globalLoadingIndicatorVisible = true;
      globalLoadingIndicatorShownAt = Date.now();
      if (container instanceof HTMLElement) {
        container.hidden = false;
        container.setAttribute('aria-hidden', 'false');
      }
      if (labelNode instanceof HTMLElement && globalLoadingIndicatorLabel) {
        labelNode.textContent = globalLoadingIndicatorLabel;
      }
    }
    let closed = false;
    return () => {
      if (closed) {
        return;
      }
      closed = true;
      globalLoadingIndicatorDepth = Math.max(0, globalLoadingIndicatorDepth - 1);
      syncGlobalLoadingIndicator();
    };
  }

  function beginBlockingGlobalLoading(label = '', { immediate = false } = {}) {
    globalLoadingIndicatorBlockingDepth += 1;
    const close = beginGlobalLoading(label, { immediate });
    let closed = false;
    return () => {
      if (closed) {
        return;
      }
      closed = true;
      close();
      globalLoadingIndicatorBlockingDepth = Math.max(0, globalLoadingIndicatorBlockingDepth - 1);
      syncGlobalLoadingIndicator();
    };
  }

  function beginStartupProgress(label = '') {
    startupProgressDepth += 1;
    const nextLabel = label || localizeText('起動準備中…', 'Preparing startup...');
    syncStartupBootLoadingWithLabel(nextLabel);
    if (startupProgressDepth === 1 || typeof startupProgressClose !== 'function') {
      startupProgressClose = beginBlockingGlobalLoading(nextLabel, { immediate: true });
    } else {
      setGlobalLoadingIndicatorLabel(nextLabel);
    }
    let closed = false;
    return () => {
      if (closed) {
        return;
      }
      closed = true;
      startupProgressDepth = Math.max(0, startupProgressDepth - 1);
      if (startupProgressDepth > 0) {
        return;
      }
      const close = startupProgressClose;
      startupProgressClose = null;
      if (typeof close === 'function') {
        close();
      }
    };
  }

  function cancelStartupRestoreProgress(reason = 'user-cancel') {
    startupRestoreCancelRequested = true;
    startupSharedReloadProjectKey = '';
    startupSharedReloadRevision = 0;
    startupSharedReloadStructureRevision = 0;
    startupAutosaveRestoreProjectId = '';
    activeSharedProjectOpenInProgress = false;
    activeSharedProjectOpenReadOnly = false;
    activeSharedProjectCanonicalOpenPromise = null;
    activeSharedProjectCanonicalOpenKey = '';
    activeSharedProjectCanonicalOpenReasons = [];
    sharedProjectRecoveryInProgress = false;
    sharedProjectRefreshInFlight = false;
    sharedProjectReconnectRecoveryPromise = null;
    sharedProjectWakeRecoveryPromise = null;
    setSharedProjectDeferRealtimeUntilSynced(false);
    if (typeof startupProgressClose === 'function') {
      const close = startupProgressClose;
      startupProgressClose = null;
      try {
        close();
      } catch (_error) {
        // Ignore stale loading cleanup failures.
      }
    }
    startupProgressDepth = 0;
    globalLoadingIndicatorDepth = 0;
    globalLoadingIndicatorBlockingDepth = 0;
    if (globalLoadingIndicatorShowTimer !== null) {
      window.clearTimeout(globalLoadingIndicatorShowTimer);
      globalLoadingIndicatorShowTimer = null;
    }
    if (globalLoadingIndicatorHideTimer !== null) {
      window.clearTimeout(globalLoadingIndicatorHideTimer);
      globalLoadingIndicatorHideTimer = null;
    }
    globalLoadingIndicatorVisible = false;
    globalLoadingIndicatorShownAt = 0;
    setStartupBootLoadingProgress(0, {
      label: localizeText('起動準備中…', 'Preparing startup...'),
      force: true,
    });
    if (dom.globalLoadingIndicator instanceof HTMLElement) {
      dom.globalLoadingIndicator.hidden = true;
      dom.globalLoadingIndicator.setAttribute('aria-hidden', 'true');
    }
    syncGlobalLoadingIndicator(localizeText('復帰をキャンセルしました', 'Restore canceled'));
    startupRestoreCancelResolvers.forEach(resolve => {
      try {
        resolve(false);
      } catch (_error) {
        // Ignore stale cancel listeners.
      }
    });
    startupRestoreCancelResolvers.clear();
    showStartupScreen();
    if (dom.startup?.resumeHint instanceof HTMLElement) {
      dom.startup.resumeHint.textContent = localizeText(
        '前回の共有プロジェクト確認をキャンセルしました。プロジェクト一覧から開き直せます。',
        'Canceled the previous shared project check. You can reopen it from the project list.'
      );
      dom.startup.resumeHint.dataset.tone = 'warn';
    }
    console.info('[startup]', {
      event: 'restore-cancelled',
      reason,
    });
  }

  function setStartupProgressLabel(label = '') {
    if (startupProgressDepth <= 0) {
      return;
    }
    syncStartupBootLoadingWithLabel(label);
    setGlobalLoadingIndicatorLabel(label || localizeText('起動準備中…', 'Preparing startup...'));
  }

  function syncSharedModeStatusDisplay() {
    if (!prefersSharedProjectFlow()) {
      return;
    }
    if (multiState.connecting) {
      setMultiStatus(localizeText('共有モード: 準備中…', 'Shared mode: preparing…'), 'info');
      return;
    }
    const resolvedSharedProjectKey = resolveSharedProjectKeyForCurrentState();
    const currentProjectIsShared = isCurrentProjectSharedEntry();
    if (currentProjectIsShared || resolvedSharedProjectKey || isSharedProjectCollaborativeMode()) {
      setMultiStatus(localizeText('共有リンクをコピーできます', 'Shared link is ready to copy'), 'success');
      return;
    }
    if (!multiState.connected) {
      setMultiStatus(localizeText('共有モード: OFF', 'Shared mode: OFF'), 'info');
    }
  }

  function hasSharedProjectLocalCommitWorkPending() {
    return Boolean(
      sharedProjectPendingLocalOps.length > 0
      || sharedProjectOpCommitInFlight
      || hasSharedProjectLocalInFlightOps()
    );
  }

  async function ensureSharedProjectInviteIncludesCommittedLocalOps(projectKey = activeSharedProjectKey, {
    reason = 'invite-link',
    timeoutMs = 10000,
  } = {}) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || activeSharedProjectKey || '');
    if (
      !normalizedProjectKey
      || normalizedProjectKey !== normalizeMultiProjectKey(activeSharedProjectKey || '')
      || !isSharedProjectCollaborativeMode(normalizedProjectKey)
    ) {
      return true;
    }
    if (pointerState.active) {
      setMultiStatus(
        localizeText(
          '現在の描画を確定してから共有URLを発行してください。',
          'Finish the current stroke before creating the shared URL.'
        ),
        'warn'
      );
      return false;
    }
    if (history.pending?.dirty) {
      commitHistory();
    }
    const startedAt = Date.now();
    const safeTimeoutMs = Math.max(1200, Math.round(Number(timeoutMs) || 10000));
    let announced = false;
    while ((Date.now() - startedAt) < safeTimeoutMs) {
      if (hasSharedProjectFailedLocalOps()) {
        queueSharedProjectRefresh({ immediate: true, reason: `${reason}-failed-local-op`, force: true });
        setMultiStatus(
          localizeText(
            '未送信の描画を確認できないため、共有URLはまだ発行していません。同期後にもう一度お試しください。',
            'The shared URL was not created because a local draw has not been confirmed. Try again after sync completes.'
          ),
          'warn'
        );
        return false;
      }
      sharedProjectPendingLocalRetryBlockedUntil = 0;
      if (sharedProjectPendingLocalOpsRetryTimer !== null) {
        window.clearTimeout(sharedProjectPendingLocalOpsRetryTimer);
        sharedProjectPendingLocalOpsRetryTimer = null;
      }
      sharedProjectPendingLocalOpsRetryDueAt = 0;
      flushSharedProjectPendingLocalOps();
      if (!hasSharedProjectLocalCommitWorkPending()) {
        const latestProject = await fetchSharedProjectRecord(normalizedProjectKey);
        if (latestProject?.project_key) {
          if (getSharedProjectLatestRevision(latestProject) > activeSharedProjectRevision) {
            const replayed = await applySharedProjectOpsSinceRevision(latestProject, activeSharedProjectRevision);
            if (!replayed) {
              await waitForSharedOpenRetry(180);
              continue;
            }
          }
          const stable = await stabilizeActiveSharedProjectConnection(latestProject, {
            reason,
            announce: false,
          });
          if (stable && !hasSharedProjectLocalCommitWorkPending() && !hasSharedProjectFailedLocalOps()) {
            return true;
          }
        }
      }
      if (!announced) {
        announced = true;
        setMultiStatus(
          localizeText(
            '共有URL発行前に未送信の描画を保存しています…',
            'Saving pending shared draw operations before creating the shared URL...'
          ),
          'info'
        );
      }
      await waitForSharedOpenRetry(180);
    }
    queueSharedProjectRefresh({ immediate: true, reason: `${reason}-timeout`, force: true });
    setMultiStatus(
      localizeText(
        '未送信の描画がサーバーで確定していないため、共有URLはまだ発行していません。同期後にもう一度お試しください。',
        'The shared URL was not created because pending drawing has not been confirmed by the server. Try again after sync completes.'
      ),
      'warn'
    );
    return false;
  }

  async function copyMultiInviteLink() {
    if (isSharedProjectsBlockedByRuntime()) {
      showSharedRuntimeBlockedStatus();
      return false;
    }
    const inviteRole = resolveMultiInviteDefaultRole();
    const resolvedProjectKey = resolveSharedProjectKeyForCurrentState() || normalizeMultiProjectKey(activeSharedProjectKey || '');
    const initialInviteToken = getCurrentSharedRecentProjectEntry(resolvedProjectKey)?.sharedProjectInviteToken || '';
    const initialInviteUrl = buildMultiInviteUrl(resolvedProjectKey, {
      role: inviteRole,
      autoJoin: false,
      inviteToken: initialInviteToken,
    });
    if (
      initialInviteUrl
      && !pointerState.active
    ) {
      const copiedInitialInviteUrl = await writeTextToClipboard(initialInviteUrl, { promptFallback: false });
      if (copiedInitialInviteUrl) {
        ensureSharedProjectInviteIncludesCommittedLocalOps(resolvedProjectKey, { reason: 'copy-invite-link-background' }).catch(error => {
          console.warn('Failed to finish shared invite sync after copy', error);
        });
        setMultiStatus(localizeText('招待リンクをコピーしました', 'Invite link copied'), 'success');
        window.alert(localizeText('共有URLをコピーしました。', 'Shared URL copied.'));
        return true;
      }
    }
    if (!await ensureSharedProjectInviteIncludesCommittedLocalOps(resolvedProjectKey, { reason: 'copy-invite-link' })) {
      return false;
    }
    let inviteToken = getCurrentSharedRecentProjectEntry(resolvedProjectKey)?.sharedProjectInviteToken || '';
    if (!inviteToken && resolvedProjectKey && canUseSharedProjectsBackend()) {
      const project = await fetchSharedProjectRecord(resolvedProjectKey);
      if (project?.invite_token) {
        inviteToken = project.invite_token;
        await upsertSharedRecentProjectEntry({
          projectKey: resolvedProjectKey,
          projectId: project.id || '',
          inviteToken,
          visibility: project.visibility || 'shared',
          name: createSharedProjectSnapshotTitle(project.title || state.documentName || resolvedProjectKey),
          roleHint: project.owner_user_id === accountState.userId ? 'master' : 'guest',
          membershipRole: project.membership_role || '',
          ownerUserId: project.owner_user_id || '',
          autoJoin: false,
          revision: Math.max(0, Math.round(Number(project.latest_revision) || 0)),
          structureRevision: Math.max(0, Math.round(Number(project.latest_structure_revision) || 0)),
        });
      }
    }
    const inviteUrl = buildMultiInviteUrl(resolvedProjectKey, {
      role: inviteRole,
      autoJoin: false,
      inviteToken,
    });
    if (!inviteUrl) {
      setMultiStatus(localizeText('先に共有リンクを作成してください', 'Create a shared link first'), 'warn');
      return false;
    }
    const copied = await writeTextToClipboard(inviteUrl);
    if (!copied) {
      setMultiStatus(localizeText('招待リンクのコピーに失敗しました', 'Failed to copy invite link'), 'error');
      window.alert(localizeText('共有URLのコピーに失敗しました。もう一度お試しください。', 'Failed to copy the shared URL. Please try again.'));
      return false;
    }
    setMultiStatus(localizeText('招待リンクをコピーしました', 'Invite link copied'), 'success');
    window.alert(localizeText('共有URLをコピーしました。', 'Shared URL copied.'));
    return true;
  }

  async function shareMultiInviteLink() {
    if (isSharedProjectsBlockedByRuntime()) {
      showSharedRuntimeBlockedStatus();
      return false;
    }
    const inviteRole = resolveMultiInviteDefaultRole();
    const resolvedProjectKey = resolveSharedProjectKeyForCurrentState() || normalizeMultiProjectKey(activeSharedProjectKey || '');
    const initialInviteToken = getCurrentSharedRecentProjectEntry(resolvedProjectKey)?.sharedProjectInviteToken || '';
    const initialInviteUrl = buildMultiInviteUrl(resolvedProjectKey, {
      role: inviteRole,
      autoJoin: false,
      inviteToken: initialInviteToken,
    });
    if (initialInviteUrl && !pointerState.active) {
      const finishBackgroundSync = () => {
        ensureSharedProjectInviteIncludesCommittedLocalOps(resolvedProjectKey, { reason: 'share-invite-link-background' }).catch(error => {
          console.warn('Failed to finish shared invite sync after share', error);
        });
      };
      if (typeof navigator?.share === 'function') {
        try {
          await navigator.share({
            title: 'PiXiEEDraw 参加招待',
            text: 'PiXiEEDraw の参加招待リンクです',
            url: initialInviteUrl,
          });
          finishBackgroundSync();
          setMultiStatus(localizeText('招待リンクを共有しました', 'Invite link shared'), 'success');
          return true;
        } catch (error) {
          // Fallback to clipboard below when share is canceled/failed.
        }
      }
      const copied = await writeTextToClipboard(initialInviteUrl, { promptFallback: false });
      if (copied) {
        finishBackgroundSync();
        setMultiStatus(localizeText('招待リンクをコピーしました', 'Invite link copied'), 'success');
        window.alert(localizeText('共有URLをコピーしました。', 'Shared URL copied.'));
        return true;
      }
    }
    if (!await ensureSharedProjectInviteIncludesCommittedLocalOps(resolvedProjectKey, { reason: 'share-invite-link' })) {
      return false;
    }
    let inviteToken = getCurrentSharedRecentProjectEntry(resolvedProjectKey)?.sharedProjectInviteToken || '';
    if (!inviteToken && resolvedProjectKey && canUseSharedProjectsBackend()) {
      const project = await fetchSharedProjectRecord(resolvedProjectKey);
      if (project?.invite_token) {
        inviteToken = project.invite_token;
        await upsertSharedRecentProjectEntry({
          projectKey: resolvedProjectKey,
          projectId: project.id || '',
          inviteToken,
          visibility: project.visibility || 'shared',
          name: createSharedProjectSnapshotTitle(project.title || state.documentName || resolvedProjectKey),
          roleHint: project.owner_user_id === accountState.userId ? 'master' : 'guest',
          membershipRole: project.membership_role || '',
          ownerUserId: project.owner_user_id || '',
          autoJoin: false,
          revision: Math.max(0, Math.round(Number(project.latest_revision) || 0)),
          structureRevision: Math.max(0, Math.round(Number(project.latest_structure_revision) || 0)),
        });
      }
    }
    const inviteUrl = buildMultiInviteUrl(resolvedProjectKey, {
      role: inviteRole,
      autoJoin: false,
      inviteToken,
    });
    if (!inviteUrl) {
      setMultiStatus(localizeText('先に共有リンクを作成してください', 'Create a shared link first'), 'warn');
      return false;
    }
    if (typeof navigator?.share === 'function') {
      try {
        await navigator.share({
          title: 'PiXiEEDraw 参加招待',
          text: 'PiXiEEDraw の参加招待リンクです',
          url: inviteUrl,
        });
        setMultiStatus(localizeText('招待リンクを共有しました', 'Invite link shared'), 'success');
        return true;
      } catch (error) {
        // Fallback to clipboard below when share is canceled/failed.
      }
    }
    return copyMultiInviteLink();
  }

  function normalizeMultiRoleControlTargetRole(role) {
    if (role === 'guest') {
      return 'guest';
    }
    if (role === 'spectator') {
      return 'spectator';
    }
    return 'none';
  }

  async function sendMultiRoleChangeNotice(targetClientId, nextRole, reason = 'master-force') {
    if (!isMultiMasterMode()) {
      return false;
    }
    const normalizedClientId = typeof targetClientId === 'string' ? targetClientId.trim() : '';
    if (!normalizedClientId || normalizedClientId === multiState.clientId) {
      return false;
    }
    const normalizedRole = normalizeMultiRoleControlTargetRole(nextRole);
    if (normalizedRole === 'none') {
      return false;
    }
    return sendMultiBroadcast('role-change', {
      clientId: multiState.clientId,
      projectKey: multiState.projectKey,
      targetClientId: normalizedClientId,
      nextRole: normalizedRole,
      reason: typeof reason === 'string' ? reason.trim().slice(0, 64) : '',
      maxGuests: normalizeMultiMaxGuests(multiState.maxGuests, MULTI_DEFAULT_GUEST_LIMIT),
      roomVisibility: normalizeMultiRoomVisibility(
        multiState.roomVisibility,
        MULTI_DEFAULT_ROOM_VISIBILITY
      ),
      joinPolicy: normalizeMultiJoinPolicy(
        multiState.joinPolicy,
        MULTI_DEFAULT_JOIN_POLICY
      ),
      sentAt: Date.now(),
    });
  }

  function getRoleControlCandidateRows() {
    const rows = [];
    if (!(multiState.participants instanceof Map)) {
      return rows;
    }
    multiState.participants.forEach(entry => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const clientId = typeof entry.clientId === 'string' ? entry.clientId.trim() : '';
      if (!clientId || clientId === multiState.clientId || isMultiClientBlocked(clientId)) {
        return;
      }
      const role = normalizeMultiRoleControlTargetRole(entry.role);
      if (role === 'none') {
        return;
      }
      rows.push({
        clientId,
        role,
        name: normalizeMultiParticipantName(entry.name, DEFAULT_MULTI_PARTICIPANT_NAME),
        joinedAt: Number(entry.joinedAt) || 0,
      });
    });
    rows.sort((a, b) => {
      if (a.role !== b.role) {
        return a.role === 'guest' ? -1 : 1;
      }
      const joinedDiff = (a.joinedAt || 0) - (b.joinedAt || 0);
      if (joinedDiff !== 0) {
        return joinedDiff;
      }
      return a.clientId.localeCompare(b.clientId);
    });
    return rows;
  }

  function syncMultiRoleControlUi() {
    const select = dom.controls.multiRoleTarget;
    const toGuestButton = dom.controls.multiForceGuest;
    const toSpectatorButton = dom.controls.multiForceSpectator;
    const canControl = isMultiMasterMode();
    const rows = getRoleControlCandidateRows();
    if (select instanceof HTMLSelectElement) {
      const previous = multiState.selectedRoleControlClientId
        || multiState.selectedAssignClientId
        || select.value
        || '';
      select.innerHTML = '';
      rows.forEach(row => {
        const option = document.createElement('option');
        option.value = row.clientId;
        option.textContent = `${row.name} [${row.role === 'guest' ? getMultiRoleLabel('guest') : getMultiRoleLabel('spectator')}]`;
        select.appendChild(option);
      });
      if (rows.length) {
        const nextSelected = rows.some(row => row.clientId === previous) ? previous : rows[0].clientId;
        select.value = nextSelected;
        setMultiSelectedControlClientId(nextSelected);
      } else {
        setMultiSelectedControlClientId('');
      }
      select.disabled = !canControl || rows.length === 0;
    }
    const targetClientId = multiState.selectedRoleControlClientId
      || multiState.selectedAssignClientId
      || (select instanceof HTMLSelectElement ? select.value : '');
    const target = rows.find(row => row.clientId === targetClientId) || null;
    if (toGuestButton instanceof HTMLButtonElement) {
      const disableGuestPromotion = !canControl
        || !target
        || target.role === 'guest'
        || (target.role === 'spectator' && isMultiGuestLimitReached());
      toGuestButton.disabled = disableGuestPromotion;
      if (!canControl) {
        toGuestButton.title = localizeText('マスターのみ操作できます', 'Master only');
      } else if (!target) {
        toGuestButton.title = localizeText('対象を選択してください', 'Select a target');
      } else if (target.role === 'guest') {
        toGuestButton.title = localizeText('すでに参加者です', 'Already a participant');
      } else if (target.role === 'spectator' && isMultiGuestLimitReached()) {
        toGuestButton.title = localizeText(
          `参加上限 ${multiState.maxGuests} 人に達しています`,
          `Participant limit (${multiState.maxGuests}) reached`
        );
      } else {
        toGuestButton.removeAttribute('title');
      }
    }
    if (toSpectatorButton instanceof HTMLButtonElement) {
      toSpectatorButton.disabled = !canControl || !target || target.role === 'spectator';
      if (!canControl) {
        toSpectatorButton.title = localizeText('マスターのみ操作できます', 'Master only');
      } else if (!target) {
        toSpectatorButton.title = localizeText('対象を選択してください', 'Select a target');
      } else if (target.role === 'spectator') {
        toSpectatorButton.title = localizeText('すでに視聴者です', 'Already a viewer');
      } else {
        toSpectatorButton.removeAttribute('title');
      }
    }
    updateMultiAssignmentControlsFromSelection();
  }

  async function forceMultiParticipantRole(clientId, nextRoleRaw) {
    if (!isMultiMasterMode()) {
      setMultiStatus(localizeText('参加/視聴の切替はマスターのみ操作できます', 'Only the master can switch participant/viewer roles'), 'warn');
      return false;
    }
    const targetClientId = typeof clientId === 'string' ? clientId.trim() : '';
    if (!targetClientId) {
      setMultiStatus(localizeText('切替対象を選択してください', 'Select a target to switch'), 'warn');
      return false;
    }
    if (targetClientId === multiState.clientId) {
      setMultiStatus(localizeText('マスター自身は切替できません', 'The master cannot switch their own role'), 'warn');
      return false;
    }
    if (isMultiClientBlocked(targetClientId)) {
      setMultiStatus(localizeText('BAN中の参加者は切替できません', 'Banned users cannot be switched'), 'warn');
      return false;
    }
    const nextRole = normalizeMultiRoleControlTargetRole(nextRoleRaw);
    if (nextRole === 'none') {
      setMultiStatus(localizeText('切替先ロールが不正です', 'Invalid destination role'), 'error');
      return false;
    }
    const participantEntry = multiState.participants instanceof Map
      ? multiState.participants.get(targetClientId)
      : null;
    const currentRole = normalizeMultiRoleControlTargetRole(participantEntry?.role || getMultiAssignment(targetClientId)?.role);
    if (currentRole === nextRole) {
      setMultiStatus(
        nextRole === 'guest'
          ? localizeText('すでに参加者です', 'Already a participant')
          : localizeText('すでに視聴者です', 'Already a viewer'),
        'info'
      );
      return true;
    }

    if (nextRole === 'guest') {
      if (isMultiGuestLimitReached()) {
        setMultiStatus(
          localizeText(
            `参加上限 ${multiState.maxGuests} 人のため追加できません`,
            `Cannot add more participants: limit is ${multiState.maxGuests}`
          ),
          'warn'
        );
        return false;
      }
      const assignment = assignLayerToGuestClient(targetClientId, participantEntry?.name || '');
      if (!assignment) {
        setMultiStatus(localizeText('参加者への切替に失敗しました', 'Failed to switch to participant'), 'error');
        return false;
      }
      removeMultiJoinRequest(targetClientId);
      removePendingMultiAssignmentMoveRequest(targetClientId);
    } else {
      if (getMultiAssignment(targetClientId)) {
        multiState.assignments.delete(targetClientId);
      }
      removePendingMultiAssignmentMoveRequest(targetClientId);
      if (multiState.selectedAssignClientId === targetClientId || multiState.selectedRoleControlClientId === targetClientId) {
        setMultiSelectedControlClientId('');
      }
      normalizeMultiAssignmentsForCurrentDocument();
      renderMultiParticipantsList();
    }

    if (multiState.participants instanceof Map) {
      const current = multiState.participants.get(targetClientId);
      if (current && typeof current === 'object') {
        current.role = nextRole;
        multiState.participants.set(targetClientId, current);
      }
    }
    renderMultiParticipantsList();
    syncMultiJoinRequestControls();
    syncMultiAssignmentControls();
    scheduleMultiSessionStateBroadcast({ immediate: true });
    const sent = await sendMultiRoleChangeNotice(targetClientId, nextRole, 'master-force');
    if (!sent) {
      setMultiStatus(localizeText('役割変更通知の送信に失敗しました', 'Failed to send role change notice'), 'error');
      return false;
    }
    setMultiStatus(
      nextRole === 'guest'
        ? localizeText('視聴者を参加者に切替しました', 'Switched viewer to participant')
        : localizeText('参加者を視聴者に切替しました', 'Switched participant to viewer'),
      'success'
    );
    return true;
  }

  function getMultiRoleLabel(role) {
    if (role === 'master') {
      return localizeText('マスター', 'Master');
    }
    if (role === 'guest') {
      return localizeText('参加者', 'Participant');
    }
    if (role === 'spectator') {
      return localizeText('視聴者', 'Viewer');
    }
    return localizeText('接続待機', 'Waiting');
  }

  function normalizeMultiRole(role, fallback = 'guest') {
    if (role === 'master') {
      return 'master';
    }
    if (role === 'guest') {
      return 'guest';
    }
    if (role === 'spectator') {
      return 'spectator';
    }
    if (fallback === 'master' || fallback === 'guest' || fallback === 'spectator') {
      return fallback;
    }
    return 'guest';
  }

  function normalizeMultiDesiredRole(role) {
    return normalizeMultiRole(role, 'master');
  }

  function normalizeMultiUiView(view) {
    return view === 'master' || view === 'guest' || view === 'spectator' ? view : 'entry';
  }

  function normalizeMultiFlowTab(tab) {
    return tab === 'comments' ? 'comments' : 'collab';
  }

  function getMultiFlowTabButtons() {
    return [
      dom.controls.multiFlowTabCollab,
      dom.controls.multiFlowTabComments,
    ].filter(button => button instanceof HTMLButtonElement);
  }

  function setMultiCommentTabNotification(enabled) {
    const button = dom.controls.multiCommentsPanelTab || dom.controls.multiFlowTabComments;
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.classList.toggle('has-notification', Boolean(enabled));
  }

  function isMultiFlowPanelVisible() {
    return dom.controls.multiFlowPanel instanceof HTMLElement
      && !dom.controls.multiFlowPanel.hidden
      && dom.controls.multiFlowPanel.offsetParent !== null;
  }

  function isMultiCommentsTabVisible() {
    const commentsView = dom.controls.multiCommentsView;
    if (commentsView instanceof HTMLElement && !commentsView.hidden && isMultiFlowPanelVisible()) {
      return true;
    }
    return normalizeMultiFlowTab(multiState.activeTab) === 'comments'
      && isMultiFlowPanelVisible();
  }

  function setMultiParticipantsPanelTab(tab = 'participants') {
    const activeTab = tab === 'comments' ? 'comments' : 'participants';
    const previousCommentMode = isMultiParticipantsCommentModeActive();
    const input = dom.controls.multiJoinProjectKey;
    if (input instanceof HTMLInputElement) {
      if (activeTab === 'comments' && !previousCommentMode) {
        multiState.projectKeyDraft = input.value || '';
        input.value = multiState.commentDraft || '';
      } else if (activeTab !== 'comments' && previousCommentMode) {
        multiState.commentDraft = input.value || '';
        input.value = multiState.projectKeyDraft || input.value || '';
      }
    }
    const tabs = [
      dom.controls.multiParticipantsPanelTab,
      dom.controls.multiCommentsPanelTab,
    ].filter(button => button instanceof HTMLButtonElement);
    const views = {
      participants: dom.controls.multiParticipantsView,
      comments: dom.controls.multiCommentsView,
    };
    tabs.forEach(button => {
      const key = button.dataset.multiPanelTab === 'comments' ? 'comments' : 'participants';
      const isActive = key === activeTab;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
      button.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    Object.entries(views).forEach(([key, view]) => {
      if (!(view instanceof HTMLElement)) {
        return;
      }
      const isActive = key === activeTab;
      view.hidden = !isActive;
      view.classList.toggle('is-active', isActive);
    });
    if (activeTab === 'comments') {
      setMultiCommentTabNotification(false);
      setMultiTabNotification(false);
      renderMultiComments();
    }
    syncMultiControls();
  }

  function isMultiParticipantsCommentModeActive() {
    return dom.controls.multiCommentsView instanceof HTMLElement
      && !dom.controls.multiCommentsView.hidden;
  }

  function updateMultiFlowTabsUi() {
    const showCommentsTab = !prefersSharedProjectFlow() && multiState.connected;
    let activeTab = normalizeMultiFlowTab(multiState.activeTab);
    if (!showCommentsTab && activeTab === 'comments') {
      activeTab = 'collab';
    }
    multiState.activeTab = activeTab;
    const panels = {
      collab: dom.controls.multiFlowCollabPanel,
      comments: dom.controls.multiFlowCommentsPanel,
    };
    getMultiFlowTabButtons().forEach(button => {
      const tab = normalizeMultiFlowTab(button.dataset.multiFlowTab || '');
      if (tab === 'comments') {
        button.hidden = !showCommentsTab;
        button.setAttribute('aria-hidden', String(!showCommentsTab));
      }
      const isActive = tab === activeTab;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
      button.setAttribute('tabindex', isActive ? '0' : '-1');
      const panel = panels[tab];
      if (panel instanceof HTMLElement) {
        panel.hidden = !isActive || (tab === 'comments' && !showCommentsTab);
      }
    });
    if (activeTab === 'comments') {
      setMultiCommentTabNotification(false);
      setMultiTabNotification(false);
    }
  }

  function setMultiFlowTab(tab, { focus = false } = {}) {
    const nextTab = normalizeMultiFlowTab(tab);
    const changed = multiState.activeTab !== nextTab;
    multiState.activeTab = nextTab;
    updateMultiFlowTabsUi();
    if (focus) {
      const button = nextTab === 'comments'
        ? dom.controls.multiFlowTabComments
        : dom.controls.multiFlowTabCollab;
      if (button instanceof HTMLButtonElement) {
        button.focus();
      }
    }
    return changed;
  }

  function setMultiDesiredRole(role) {
    const normalized = normalizeMultiDesiredRole(role);
    if (multiState.desiredRole === normalized) {
      return false;
    }
    multiState.desiredRole = normalized;
    return true;
  }

  function setMultiUiView(view) {
    const normalized = normalizeMultiUiView(view);
    if (multiState.uiView === normalized) {
      return false;
    }
    multiState.uiView = normalized;
    return true;
  }

  function setMultiEntryJoinPanelOpen(visible, { focusKey = false } = {}) {
    const nextVisible = Boolean(visible);
    const changed = multiEntryJoinPanelOpen !== nextVisible;
    multiEntryJoinPanelOpen = nextVisible;
    if (changed) {
      syncMultiControls();
    }
    if (nextVisible && focusKey) {
      const targetInput = dom.controls.multiJoinProjectKey instanceof HTMLInputElement
        ? dom.controls.multiJoinProjectKey
        : (dom.controls.multiProjectKey instanceof HTMLInputElement ? dom.controls.multiProjectKey : null);
      if (targetInput instanceof HTMLInputElement) {
        targetInput.focus();
        targetInput.select();
      }
    }
    return changed;
  }

  function setMultiHelpPanelVisible(visible) {
    const panel = dom.controls.multiHelpPanel;
    const toggle = dom.controls.multiHelpToggle;
    const nextVisible = Boolean(visible);
    if (panel instanceof HTMLElement) {
      panel.hidden = !nextVisible;
    }
    if (toggle instanceof HTMLButtonElement) {
      toggle.setAttribute('aria-expanded', nextVisible ? 'true' : 'false');
    }
  }

  function isMultiSpectatorMode() {
    if (isCurrentSharedProjectReadOnlyMember()) {
      return true;
    }
    return multiState.connected && multiState.role === 'spectator';
  }

  function isMultiReadOnlyMode() {
    if (isSharedProjectCollaborativeMode()) {
      return isCurrentSharedProjectReadOnlyMember();
    }
    return isMultiGuestMode() || isMultiSpectatorMode();
  }

  function isMultiClientScopedHistoryMode() {
    if (!multiState.connected) {
      return false;
    }
    if (isSharedProjectCollaborativeMode()) {
      return false;
    }
    return isMultiGuestMode() || isMultiSpectatorMode();
  }

  function isMultiMasterConfigMode() {
    if (isMultiMasterMode()) {
      return true;
    }
    if (multiState.connected || multiState.connecting) {
      return false;
    }
    return normalizeMultiUiView(multiState.uiView) === 'master'
      || normalizeMultiDesiredRole(multiState.desiredRole) === 'master';
  }

  function scheduleMultiEntryScreenMetricsUpdate() {
    if (multiEntryMetricsRaf !== null) {
      window.cancelAnimationFrame(multiEntryMetricsRaf);
      multiEntryMetricsRaf = null;
    }
    multiEntryMetricsRaf = window.requestAnimationFrame(() => {
      multiEntryMetricsRaf = null;
      updateMultiEntryScreenMetrics();
    });
  }

  function getMultiEntryScreenAdReserveHeight(host) {
    if (!(host instanceof HTMLElement)) {
      return 0;
    }
    if (layoutMode === 'mobilePortrait') {
      return 0;
    }
    if (!(dom.rightRail instanceof HTMLElement)) {
      return 0;
    }
    if (dom.rightRail.dataset.collapsed === 'true' || dom.rightRail.dataset.compact === 'true') {
      return 0;
    }
    const mount = host.querySelector('[data-panel-ad-mount="right"]');
    if (!(mount instanceof HTMLElement)) {
      return 0;
    }
    const panelAd = mount.querySelector('.panel-ad');
    if (!(panelAd instanceof HTMLElement)) {
      return 0;
    }
    const rect = panelAd.getBoundingClientRect();
    const rawHeight = Math.round(rect.height || panelAd.offsetHeight || panelAd.clientHeight || 0);
    const adHeight = rawHeight > 0 ? rawHeight : 112;
    const adStyles = window.getComputedStyle(panelAd);
    const marginTop = Number.parseFloat(adStyles.marginTop) || 0;
    return Math.max(0, Math.round(adHeight + marginTop + 8));
  }

  function updateMultiEntryScreenMetrics() {
    const entry = dom.controls.multiEntryScreen;
    if (!(entry instanceof HTMLElement)) {
      return;
    }
    const panelBody = entry.closest('.panel-section__body');
    const host = panelBody instanceof HTMLElement
      ? panelBody
      : (entry.parentElement instanceof HTMLElement ? entry.parentElement : null);
    if (!(host instanceof HTMLElement)) {
      return;
    }
    const hostRect = host.getBoundingClientRect();
    const hostStyles = window.getComputedStyle(host);
    const horizontalPadding = (Number.parseFloat(hostStyles.paddingLeft) || 0) + (Number.parseFloat(hostStyles.paddingRight) || 0);
    const verticalPadding = (Number.parseFloat(hostStyles.paddingTop) || 0) + (Number.parseFloat(hostStyles.paddingBottom) || 0);
    const viewportWidth = window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0;
    const clippedWidth = clamp(
      Math.round(Math.min(hostRect.right, viewportWidth) - Math.max(hostRect.left, 0)),
      0,
      Math.round(hostRect.width || 0)
    );
    const clippedHeight = clamp(
      Math.round(Math.min(hostRect.bottom, viewportHeight) - Math.max(hostRect.top, 0)),
      0,
      Math.round(hostRect.height || 0)
    );
    const availableWidth = Math.max(
      0,
      Math.floor(Math.min(host.clientWidth || 0, clippedWidth || host.clientWidth || 0) - horizontalPadding)
    );
    const availableHeight = Math.max(
      0,
      Math.floor(Math.min(host.clientHeight || 0, clippedHeight || host.clientHeight || 0) - verticalPadding)
    );
    const adReserveHeight = getMultiEntryScreenAdReserveHeight(host);
    const availableEntryHeight = Math.max(0, availableHeight - adReserveHeight);
    if (!availableWidth || !availableEntryHeight) {
      return;
    }
    const shortEdge = Math.max(1, Math.min(availableWidth, availableEntryHeight));
    const gap = clamp(Math.round(shortEdge * 0.045), 8, 20);
    const maxWidth = Math.max(220, availableWidth - 2);
    const targetWidth = clamp(
      Math.round(availableWidth * (availableWidth < 420 ? 0.96 : 0.88)),
      220,
      Math.min(620, maxWidth)
    );
    const maxButtonHeightBySpace = Math.max(46, Math.floor((availableEntryHeight - gap - 20) * 0.9));
    const buttonHeight = clamp(
      Math.round(Math.min(availableEntryHeight * 0.28, (targetWidth - gap) * 0.42)),
      52,
      Math.min(130, maxButtonHeightBySpace)
    );
    const minHeight = clamp(
      Math.round(availableEntryHeight * (availableEntryHeight < 300 ? 0.78 : 0.9)),
      buttonHeight + gap + 20,
      availableEntryHeight
    );
    const entryHeight = clamp(minHeight, buttonHeight + gap + 20, availableEntryHeight);
    entry.style.setProperty('--multi-entry-gap', `${gap}px`);
    entry.style.setProperty('--multi-entry-width', `${targetWidth}px`);
    entry.style.setProperty('--multi-entry-button-height', `${buttonHeight}px`);
    entry.style.setProperty('--multi-entry-min-height', `${minHeight}px`);
    entry.style.setProperty('--multi-entry-height', `${entryHeight}px`);
  }

  function syncMultiPanelFlowUi() {
    const sharedProjectFlowPreferred = prefersSharedProjectFlow();
    const isEntry = !multiState.connected
      && !multiState.connecting
      && normalizeMultiUiView(multiState.uiView) === 'entry';
    if (!isEntry && multiEntryJoinPanelOpen) {
      multiEntryJoinPanelOpen = false;
    }
    if (sharedProjectFlowPreferred && isEntry) {
      multiEntryJoinPanelOpen = true;
    }
    const showJoinPanel = isEntry && !sharedProjectFlowPreferred && multiEntryJoinPanelOpen;
    const showJoinProjectKeyField = showJoinPanel;
    const showFlowProjectKeyField = !sharedProjectFlowPreferred && !isEntry;
    const selectedRole = sharedProjectFlowPreferred && isSharedProjectCollaborativeMode()
      ? getCurrentSharedProjectUiRole()
      : normalizeMultiDesiredRole(
          multiState.connected
            ? multiState.role
            : (normalizeMultiUiView(multiState.uiView) === 'entry'
              ? multiState.desiredRole
              : normalizeMultiUiView(multiState.uiView))
        );
    multiState.desiredRole = selectedRole;
    if (dom.controls.multiJoinProjectKeyField instanceof HTMLElement) {
      dom.controls.multiJoinProjectKeyField.hidden = false;
      dom.controls.multiJoinProjectKeyField.setAttribute('aria-hidden', 'false');
    }
    if (dom.controls.multiProjectKeyField instanceof HTMLElement) {
      dom.controls.multiProjectKeyField.hidden = !showFlowProjectKeyField;
      dom.controls.multiProjectKeyField.setAttribute('aria-hidden', String(!showFlowProjectKeyField));
    }
    if (dom.controls.multiEntryScreen instanceof HTMLElement) {
      dom.controls.multiEntryScreen.hidden = sharedProjectFlowPreferred || !isEntry;
    }
    if (dom.controls.multiEntryActions instanceof HTMLElement) {
      const hideEntryActions = showJoinPanel && !sharedProjectFlowPreferred;
      dom.controls.multiEntryActions.hidden = hideEntryActions;
      dom.controls.multiEntryActions.setAttribute('aria-hidden', String(hideEntryActions));
      dom.controls.multiEntryActions.dataset.sharedSingle = sharedProjectFlowPreferred && isEntry ? 'true' : 'false';
    }
    if (dom.controls.multiEntryJoinPanel instanceof HTMLElement) {
      dom.controls.multiEntryJoinPanel.hidden = !showJoinPanel;
      dom.controls.multiEntryJoinPanel.setAttribute('aria-hidden', String(!showJoinPanel));
    }
    if (dom.controls.multiEntryHint instanceof HTMLElement) {
      const hideEntryHint = showJoinPanel && !sharedProjectFlowPreferred;
      dom.controls.multiEntryHint.hidden = hideEntryHint;
      dom.controls.multiEntryHint.setAttribute('aria-hidden', String(hideEntryHint));
    }
    if (dom.controls.multiEntryJoinHint instanceof HTMLElement) {
      dom.controls.multiEntryJoinHint.hidden = !showJoinPanel;
      dom.controls.multiEntryJoinHint.setAttribute('aria-hidden', String(!showJoinPanel));
    }
    if (dom.controls.multiEntryGuest instanceof HTMLButtonElement) {
      dom.controls.multiEntryGuest.setAttribute('aria-expanded', showJoinPanel ? 'true' : 'false');
      dom.controls.multiEntryGuest.setAttribute('aria-controls', 'multiEntryJoinPanel');
    }
    if (dom.controls.multiFlowPanel instanceof HTMLElement) {
      dom.controls.multiFlowPanel.hidden = sharedProjectFlowPreferred ? false : isEntry;
    }
    if (isEntry) {
      setMultiHelpPanelVisible(false);
    }
    if (dom.controls.multiRoleLabel instanceof HTMLElement) {
      dom.controls.multiRoleLabel.textContent = sharedProjectFlowPreferred
        ? localizeText('共有プロジェクト', 'Shared Project')
        : (selectedRole === 'master'
          ? localizeText('マスター設定', 'Master Setup')
          : (selectedRole === 'spectator'
            ? localizeText('視聴者設定', 'Viewer Setup')
            : localizeText('参加リクエスト設定', 'Join Request Setup')));
    }
    if (dom.controls.multiStartSession instanceof HTMLButtonElement) {
      let startLabel = selectedRole === 'master'
        ? localizeText('開始', 'Start')
        : localizeText('入室', 'Join');
      if (multiState.connecting) {
        startLabel = selectedRole === 'master'
          ? localizeText('開始中…', 'Starting...')
          : localizeText('入室中…', 'Joining...');
      } else if (multiState.connected) {
        startLabel = multiState.role === 'guest'
          ? localizeText('参加中', 'Joined')
          : (multiState.role === 'spectator'
            ? localizeText('視聴中', 'Viewing')
            : localizeText('開始済み', 'Started'));
      }
      dom.controls.multiStartSession.textContent = startLabel;
    }
    const showMasterOnly = selectedRole === 'master';
    if (Array.isArray(dom.controls.multiMasterOnlyGroups)) {
      dom.controls.multiMasterOnlyGroups.forEach(node => {
        if (node instanceof HTMLElement) {
          node.hidden = !showMasterOnly;
        }
      });
    }
    scheduleMultiEntryScreenMetricsUpdate();
  }

  function serializeMultiAssignments() {
    normalizeMultiAssignmentsForCurrentDocument();
    return Array.from(multiState.assignments.values()).map(entry => ({
      clientId: entry.clientId,
      role: entry.role === 'master' ? 'master' : 'guest',
      name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim().slice(0, 32) : '',
      canvasId: normalizeMultiAssignmentCanvasId(entry.canvasId, getActiveProjectCanvasDocument()?.id || ''),
      anchorLayerId: entry.anchorLayerId,
      trackHint: Number.isFinite(entry.trackHint) ? Math.round(entry.trackHint) : -1,
      frameId: typeof entry.frameId === 'string' ? entry.frameId : '',
      frameHint: Number.isFinite(entry.frameHint) ? Math.round(entry.frameHint) : -1,
      joinedAt: Number(entry.joinedAt) || Date.now(),
      locked: Boolean(entry.locked),
    }));
  }

  function normalizeMultiAssignmentPayloadEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const clientId = typeof entry.clientId === 'string' ? entry.clientId.trim() : '';
    const anchorLayerId = typeof entry.anchorLayerId === 'string' ? entry.anchorLayerId.trim() : '';
    if (!clientId || !anchorLayerId) {
      return null;
    }
    if (isMultiClientBlocked(clientId)) {
      return null;
    }
    return {
      clientId,
      role: entry.role === 'master' ? 'master' : 'guest',
      name: normalizeMultiParticipantName(entry.name, DEFAULT_MULTI_PARTICIPANT_NAME),
      canvasId: typeof entry.canvasId === 'string' ? entry.canvasId.trim() : '',
      anchorLayerId,
      trackHint: Number.isFinite(entry.trackHint) ? Math.max(0, Math.round(entry.trackHint)) : null,
      frameId: typeof entry.frameId === 'string' ? entry.frameId.trim() : '',
      frameHint: Number.isFinite(entry.frameHint) ? Math.max(0, Math.round(entry.frameHint)) : null,
      joinedAt: Number(entry.joinedAt) || Date.now(),
      locked: Boolean(entry.locked),
    };
  }

  function mergeMultiAssignmentFromPayloadEntry(entry) {
    const normalized = normalizeMultiAssignmentPayloadEntry(entry);
    if (!normalized) {
      return null;
    }
    const previous = multiState.assignments.get(normalized.clientId) || null;
    multiState.assignments.set(normalized.clientId, previous
      ? { ...previous, ...normalized }
      : normalized);
    normalizeMultiAssignmentsForCurrentDocument();
    pruneMultiHistoryCanvases();
    return multiState.assignments.get(normalized.clientId) || normalized;
  }

  function mergeMultiSenderAssignmentFromPayload(assignments, senderClientId) {
    if (!Array.isArray(assignments)) {
      return null;
    }
    const normalizedClientId = typeof senderClientId === 'string' ? senderClientId.trim() : '';
    if (!normalizedClientId) {
      return null;
    }
    const entry = assignments.find(item => {
      const clientId = typeof item?.clientId === 'string' ? item.clientId.trim() : '';
      return clientId === normalizedClientId;
    }) || null;
    if (!entry) {
      return null;
    }
    return mergeMultiAssignmentFromPayloadEntry(entry);
  }

  function applyMultiAssignmentsFromPayload(assignments, masterClientId, blockedClientIds = undefined) {
    if (Array.isArray(blockedClientIds)) {
      multiState.blockedClientIds = normalizeMultiBlockedClientIds(blockedClientIds);
    }
    multiState.assignments.clear();
    if (Array.isArray(assignments)) {
      assignments.forEach(entry => {
        const normalizedEntry = normalizeMultiAssignmentPayloadEntry(entry);
        if (!normalizedEntry) {
          return;
        }
        multiState.assignments.set(normalizedEntry.clientId, normalizedEntry);
      });
    }
    normalizeMultiAssignmentsForCurrentDocument();
    pruneMultiHistoryCanvases();
    multiState.masterClientId = typeof masterClientId === 'string' && masterClientId.trim()
      ? masterClientId.trim()
      : (isMultiMasterMode() ? multiState.clientId : multiState.masterClientId);
    renderMultiParticipantsList();
    applyMultiRoleUiLocks();
    if (isMultiGuestMode()) {
      enforceGuestAssignedLayerSelection({ announce: false });
    }
  }

  function describeMultiParticipantPlacement(clientId, role, {
    includeRoleLabel = false,
  } = {}) {
    const normalizedClientId = typeof clientId === 'string' ? clientId.trim() : '';
    const normalizedRole = normalizeMultiRole(role, 'guest');
    const assignment = normalizedClientId ? getMultiAssignment(normalizedClientId) : null;
    const assignmentCanvas = getAssignmentCanvasDocument(assignment, getActiveProjectCanvasDocument());
    const frameIndex = normalizedClientId
      ? getAssignedFrameIndexForClient(normalizedClientId, assignmentCanvas)
      : -1;
    const trackIndex = normalizedClientId
      ? getAssignedLayerTrackIndexForClient(normalizedClientId, assignmentCanvas)
      : -1;
    const parts = [];
    if (includeRoleLabel && normalizedRole === 'master') {
      parts.push(localizeText('マスター', 'Master'));
    }
    if (assignmentCanvas && getProjectCanvasCount() > 1) {
      parts.push(assignmentCanvas.name);
    }
    if (frameIndex >= 0) {
      parts.push(localizeText(`フレーム ${frameIndex + 1}`, `Frame ${frameIndex + 1}`));
    }
    if (trackIndex >= 0) {
      parts.push(localizeText(`レイヤー ${trackIndex + 1}`, `Layer ${trackIndex + 1}`));
    }
    if (!parts.length) {
      parts.push(
        normalizedRole === 'spectator'
          ? localizeText('視聴中', 'Viewing')
          : (normalizedRole === 'guest'
            ? localizeText('参加中', 'Participating')
            : localizeText('セル未割当', 'No assigned cell'))
      );
    }
    return {
      assignment,
      assignmentCanvas,
      frameIndex,
      trackIndex,
      parts,
      text: parts.join(' / '),
      locked: Boolean(assignment?.locked),
    };
  }

  function buildMultiParticipantRows() {
    if (prefersSharedProjectFlow()) {
      return [];
    }
    const getRoleSortWeight = role => {
      if (role === 'master') return 0;
      if (role === 'guest') return 1;
      if (role === 'spectator') return 2;
      return 3;
    };
    const rows = [];
    const now = Date.now();
    const seen = new Set();
    multiState.participants.forEach(entry => {
      if (!entry || !entry.clientId) {
        return;
      }
      if (isMultiClientBlocked(entry.clientId)) {
        return;
      }
      const assignment = getMultiAssignment(entry.clientId);
      const presenceRole = normalizeMultiRole(entry.role, 'guest');
      rows.push({
        clientId: entry.clientId,
        role: isSharedProjectCollaborativeMode() ? 'guest' : (assignment?.role === 'master' ? 'master' : presenceRole),
        name: normalizeMultiParticipantName(entry.name || assignment?.name, DEFAULT_MULTI_PARTICIPANT_NAME),
        online: true,
        joinedAt: Number(entry.joinedAt) || now,
        locked: Boolean(assignment?.locked),
      });
      seen.add(entry.clientId);
    });
    if (!isSharedProjectCollaborativeMode()) {
      multiState.assignments.forEach(assignment => {
      if (!assignment || !assignment.clientId || seen.has(assignment.clientId)) {
        return;
      }
      if (isMultiClientBlocked(assignment.clientId)) {
        return;
      }
      rows.push({
        clientId: assignment.clientId,
        role: normalizeMultiRole(assignment.role, 'guest'),
        name: normalizeMultiParticipantName(assignment.name, DEFAULT_MULTI_PARTICIPANT_NAME),
        online: false,
        joinedAt: Number(assignment.joinedAt) || now,
        locked: Boolean(assignment.locked),
      });
      });
    }
    rows.sort((a, b) => {
      if (a.role !== b.role) {
        return getRoleSortWeight(a.role) - getRoleSortWeight(b.role);
      }
      const joinedDiff = (a.joinedAt || 0) - (b.joinedAt || 0);
      if (joinedDiff !== 0) {
        return joinedDiff;
      }
      return a.clientId.localeCompare(b.clientId);
    });
    return rows;
  }

  function createMultiParticipantsActionButton(label, onClick, {
    title = '',
    disabled = false,
    className = 'chip',
  } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    if (title) {
      button.title = title;
    }
    button.disabled = Boolean(disabled);
    if (typeof onClick === 'function') {
      button.addEventListener('click', event => {
        event.preventDefault();
        onClick(event);
      });
    }
    return button;
  }

  function renderMultiParticipantsList() {
    const sharedProjectFlowPreferred = prefersSharedProjectFlow();
    if (!sharedProjectFlowPreferred) {
      normalizeMultiAssignmentsForCurrentDocument();
    }
    const list = dom.controls.multiParticipants;
    if (!(list instanceof HTMLElement)) {
      return;
    }
    const countNode = document.getElementById('multiParticipantsCount');
    list.innerHTML = '';
    const rows = sharedProjectFlowPreferred
      ? []
      : buildMultiParticipantRows().map(row => ({ ...row }));
    if (sharedProjectFlowPreferred) {
      if (resolveSharedProjectKeyForCurrentState() && sharedProjectMembers.length) {
        rows.push(...sharedProjectMembers.map(row => ({ ...row })));
      }
      rows.sort((a, b) => {
        const onlineDiff = Number(Boolean(b.online)) - Number(Boolean(a.online));
        if (onlineDiff !== 0) {
          return onlineDiff;
        }
        const joinedDiff = (a.joinedAt || 0) - (b.joinedAt || 0);
        if (joinedDiff !== 0) {
          return joinedDiff;
        }
        return String(a.clientId).localeCompare(String(b.clientId));
      });
      if (countNode instanceof HTMLElement) {
        countNode.textContent = String(rows.length);
      }
      if (!rows.length) {
        const empty = document.createElement('li');
        empty.className = 'help-text';
        empty.textContent = resolveSharedProjectKeyForCurrentState()
          ? localizeText('まだ他のメンバーはいません。共有URLを送るとここに表示されます。', 'No other members yet. Share the URL to invite others.')
          : localizeText('共有リンクを作成すると、ここにメンバーが表示されます。', 'Create a shared link to show members here.');
        list.appendChild(empty);
        return;
      }
      rows.forEach(row => {
        const li = document.createElement('li');
        li.className = 'multi-participant-item';
        const isSelf = Boolean(
          (row.userId && accountState.userId && row.userId === accountState.userId)
          || row.clientId === multiState.clientId
        );
        const plain = document.createElement('div');
        plain.className = 'multi-participant-item__details is-static is-shared-member';
        if (isSelf) {
          plain.classList.add('is-self');
        }
        if (!row.online) {
          plain.classList.add('is-offline');
        }
        const summary = document.createElement('div');
        summary.className = 'multi-participant-item__summary';
        const avatar = document.createElement('img');
        avatar.className = 'multi-participant-item__avatar';
        avatar.src = typeof row.avatarSrc === 'string' && row.avatarSrc.trim()
          ? row.avatarSrc.trim()
          : '../icon/PiXiEED.icon512.png';
        avatar.alt = '';
        avatar.loading = 'lazy';
        avatar.addEventListener('error', () => {
          avatar.src = '../icon/PiXiEED.icon512.png';
        }, { once: true });
        const main = document.createElement('span');
        main.className = 'multi-participant-item__main';
        const nameLine = document.createElement('span');
        nameLine.className = 'multi-participant-item__name-line';
        const name = document.createElement('strong');
        name.className = 'multi-participant-item__name';
        name.textContent = row.name || DEFAULT_MULTI_PARTICIPANT_NAME;
        nameLine.appendChild(name);
        const cell = document.createElement('span');
        cell.className = 'multi-participant-item__cell';
        const memberPresence = getSharedProjectMemberCellPresence(row);
        cell.textContent = memberPresence ? getSharedProjectCellPresenceLabel(memberPresence) : '-';
        const online = document.createElement('span');
        online.className = 'multi-participant-item__online';
        online.textContent = row.online
          ? localizeText('オンライン', 'Online')
          : localizeText('オフライン', 'Offline');
        main.append(nameLine, cell, online);
        summary.append(avatar, main);
        plain.appendChild(summary);
        li.appendChild(plain);
        list.appendChild(li);
      });
      return;
    }
    if (!isSharedProjectCollaborativeMode() && isMultiMasterMode() && multiState.pendingJoinRequests instanceof Map) {
      multiState.pendingJoinRequests.forEach(request => {
        if (!request || typeof request !== 'object') {
          return;
        }
        const clientId = typeof request.clientId === 'string' ? request.clientId.trim() : '';
        if (!clientId) {
          return;
        }
        const existing = rows.find(row => row.clientId === clientId);
        if (existing) {
          existing.pendingJoinRequest = true;
          existing.requestSentAt = Number(request.sentAt) || Date.now();
          existing.name = existing.name || normalizeMultiParticipantName(request.name, DEFAULT_MULTI_PARTICIPANT_NAME);
          return;
        }
        rows.push({
          clientId,
          role: 'spectator',
          name: normalizeMultiParticipantName(request.name, DEFAULT_MULTI_PARTICIPANT_NAME),
          online: true,
          joinedAt: Number(request.sentAt) || Date.now(),
          locked: false,
          pendingJoinRequest: true,
          requestSentAt: Number(request.sentAt) || Date.now(),
        });
      });
    }
    rows.sort((a, b) => {
      const getWeight = row => {
        if (row.role === 'master') return 0;
        if (row.pendingJoinRequest) return 1;
        if (row.role === 'guest') return 2;
        if (row.role === 'spectator') return 3;
        return 4;
      };
      const weightDiff = getWeight(a) - getWeight(b);
      if (weightDiff !== 0) {
        return weightDiff;
      }
      const joinedDiff = (a.joinedAt || 0) - (b.joinedAt || 0);
      if (joinedDiff !== 0) {
        return joinedDiff;
      }
      return String(a.clientId).localeCompare(String(b.clientId));
    });
    if (countNode instanceof HTMLElement) {
      countNode.textContent = String(rows.length);
    }
    if (!rows.length) {
      const empty = document.createElement('li');
      empty.className = 'help-text';
      empty.textContent = multiState.connected
        ? localizeText('接続待機中…', 'Waiting for connection...')
        : localizeText('未接続', 'Not connected');
      list.appendChild(empty);
      syncMultiAssignmentControls();
      return;
    }
    rows.forEach(row => {
      const li = document.createElement('li');
      li.className = 'multi-participant-item';
      const isSelf = row.clientId === multiState.clientId;
      const placement = describeMultiParticipantPlacement(row.clientId, row.role, { includeRoleLabel: true });
      const assignment = placement.assignment;
      const assignmentCanvas = placement.assignmentCanvas;
      const frameIndex = placement.frameIndex;
      const trackIndex = placement.trackIndex;
      const pendingJoinRequest = Boolean(row.pendingJoinRequest || getPendingMultiJoinRequest(row.clientId));
      const pendingMoveRequest = getPendingMultiAssignmentMoveRequest(row.clientId);
      const metaParts = placement.parts.slice();

      const selectRowTarget = () => {
        if (isMultiMasterMode() && row.clientId && row.clientId !== multiState.clientId) {
          selectMultiControlTarget(row.clientId);
        }
      };

      const body = document.createElement('div');
      body.className = 'multi-participant-item__body';
      let hasBody = false;

      const appendBodyBlock = element => {
        if (!(element instanceof HTMLElement)) {
          return;
        }
        body.appendChild(element);
        hasBody = true;
      };

      const actions = document.createElement('div');
      actions.className = 'multi-participant-item__actions';
      const appendAction = button => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        actions.appendChild(button);
        hasBody = true;
      };

      if (isMultiMasterMode() && !isSelf) {
        if (pendingJoinRequest) {
          appendAction(
            createMultiParticipantsActionButton(
              localizeText('承認', 'Approve'),
              () => {
                selectRowTarget();
                approveMultiJoinRequest(row.clientId).catch(() => {});
              }
            )
          );
          appendAction(
            createMultiParticipantsActionButton(
              localizeText('却下', 'Reject'),
              () => {
                selectRowTarget();
                rejectMultiJoinRequest(row.clientId).catch(() => {});
              }
            )
          );
        }

        if (row.role === 'guest') {
          const moveRow = document.createElement('div');
          moveRow.className = 'multi-participant-item__move';
          const targetFrameValue = pendingMoveRequest
            ? pendingMoveRequest.frameIndex + 1
            : Math.max(1, frameIndex + 1);
          const targetLayerValue = pendingMoveRequest
            ? pendingMoveRequest.trackIndex + 1
            : Math.max(1, trackIndex + 1);
          const frameField = document.createElement('label');
          frameField.className = 'multi-participant-item__move-field';
          const frameFieldLabel = document.createElement('span');
          frameFieldLabel.textContent = 'F';
          const frameInput = document.createElement('input');
          frameInput.type = 'number';
          frameInput.min = '1';
          frameInput.step = '1';
          frameInput.value = String(targetFrameValue);
          frameField.append(frameFieldLabel, frameInput);
          const layerField = document.createElement('label');
          layerField.className = 'multi-participant-item__move-field';
          const layerFieldLabel = document.createElement('span');
          layerFieldLabel.textContent = 'L';
          const layerInput = document.createElement('input');
          layerInput.type = 'number';
          layerInput.min = '1';
          layerInput.step = '1';
          layerInput.value = String(targetLayerValue);
          layerField.append(layerFieldLabel, layerInput);
          const moveButton = createMultiParticipantsActionButton(
            pendingMoveRequest
              ? localizeText('申請セルへ移動', 'Move To Requested Cell')
              : localizeText('セル移動', 'Move Cell'),
            () => {
              selectRowTarget();
              moveMultiParticipantToCell(
                row.clientId,
                Math.max(0, Math.round(Number(frameInput.value) || 1) - 1),
                Math.max(0, Math.round(Number(layerInput.value) || 1) - 1)
              );
            }
          );
          moveRow.append(frameField, layerField, moveButton);
          appendBodyBlock(moveRow);
          if (pendingMoveRequest) {
            appendAction(
              createMultiParticipantsActionButton(
                localizeText('移動申請を却下', 'Reject Move Request'),
                () => {
                  selectRowTarget();
                  rejectPendingMultiAssignmentMoveRequest(row.clientId).catch(() => {});
                }
              )
            );
          }
          appendAction(
            createMultiParticipantsActionButton(
              row.locked ? localizeText('ロック解除', 'Unlock') : localizeText('セルロック', 'Lock Cell'),
              () => {
                selectRowTarget();
                setMultiParticipantCellLocked(row.clientId, !row.locked);
              }
            )
          );
          appendAction(
            createMultiParticipantsActionButton(
              localizeText('視聴にする', 'Make Viewer'),
              () => {
                selectRowTarget();
                forceMultiParticipantRole(row.clientId, 'spectator').catch(() => {});
              }
            )
          );
        } else if (row.role === 'spectator' && !pendingJoinRequest) {
          appendAction(
            createMultiParticipantsActionButton(
              localizeText('参加者にする', 'Make Participant'),
              () => {
                selectRowTarget();
                forceMultiParticipantRole(row.clientId, 'guest').catch(() => {});
              }
            )
          );
        }

        if (row.role !== 'master') {
          appendAction(
            createMultiParticipantsActionButton(
              localizeText('キック', 'Kick'),
              () => {
                selectRowTarget();
                kickMultiParticipant(row.clientId).catch(() => {});
              }
            )
          );
          appendAction(
            createMultiParticipantsActionButton(
              'BAN',
              () => {
                selectRowTarget();
                banMultiParticipant(row.clientId).catch(() => {});
              }
            )
          );
        }
      } else if (isSelf && isMultiReplicaRole(multiState.role)) {
        if (multiState.role === 'spectator') {
          appendAction(
            createMultiParticipantsActionButton(
              multiState.joinRequestPending
                ? localizeText('参加申請中', 'Request Pending')
                : localizeText('参加リクエスト', 'Join Request'),
              () => {
                sendMultiGuestJoinRequest().catch(() => {});
              },
              { disabled: multiState.joinRequestPending || !canCurrentClientRequestGuestRole() }
            )
          );
        } else if (multiState.role === 'guest') {
          const selfMoveRow = document.createElement('div');
          selfMoveRow.className = 'multi-participant-item__move';
          const selfFrameField = document.createElement('label');
          selfFrameField.className = 'multi-participant-item__move-field';
          const selfFrameLabel = document.createElement('span');
          selfFrameLabel.textContent = 'F';
          const selfFrameInput = document.createElement('input');
          selfFrameInput.type = 'number';
          selfFrameInput.min = '1';
          selfFrameInput.step = '1';
          selfFrameInput.value = String((pendingMoveRequest?.frameIndex ?? frameIndex) + 1 || 1);
          selfFrameField.append(selfFrameLabel, selfFrameInput);
          const selfLayerField = document.createElement('label');
          selfLayerField.className = 'multi-participant-item__move-field';
          const selfLayerLabel = document.createElement('span');
          selfLayerLabel.textContent = 'L';
          const selfLayerInput = document.createElement('input');
          selfLayerInput.type = 'number';
          selfLayerInput.min = '1';
          selfLayerInput.step = '1';
          selfLayerInput.value = String((pendingMoveRequest?.trackIndex ?? trackIndex) + 1 || 1);
          selfLayerField.append(selfLayerLabel, selfLayerInput);
          const selfMoveButton = createMultiParticipantsActionButton(
            canCurrentGuestFreelyMoveAssignedCell()
              ? localizeText('セル移動', 'Move Cell')
              : localizeText('移動申請', 'Request Move'),
            () => {
              const nextFrameIndex = Math.max(0, Math.round(Number(selfFrameInput.value) || 1) - 1);
              const nextTrackIndex = Math.max(0, Math.round(Number(selfLayerInput.value) || 1) - 1);
              if (canCurrentGuestFreelyMoveAssignedCell()) {
                scheduleMultiGuestMovePreview(nextFrameIndex, nextTrackIndex, {
                  source: 'participants-list',
                  immediate: true,
                });
                return;
              }
              requestMultiGuestMoveToCell(nextFrameIndex, nextTrackIndex, {
                source: 'participants-list',
              }).catch(() => {});
            },
            { disabled: Boolean(row.locked) }
          );
          selfMoveRow.append(selfFrameField, selfLayerField, selfMoveButton);
          appendBodyBlock(selfMoveRow);
          appendAction(
            createMultiParticipantsActionButton(
              localizeText('視聴に戻る', 'Switch To Viewer'),
              () => {
                connectMultiSessionAs('spectator').catch(() => {});
              }
            )
          );
        }
      }

      if (actions.childElementCount > 0) {
        appendBodyBlock(actions);
      }

      const summary = document.createElement(hasBody ? 'summary' : 'div');
      summary.className = 'multi-participant-item__summary';
      if (hasBody) {
        summary.title = localizeText('開くと操作できます', 'Open to show actions');
      }
      const avatar = document.createElement('img');
      avatar.className = 'multi-participant-item__avatar';
      avatar.src = '../icon/PiXiEED.icon512.png';
      avatar.alt = '';
      avatar.loading = 'lazy';
      const main = document.createElement('span');
      main.className = 'multi-participant-item__main';
      const nameLine = document.createElement('span');
      nameLine.className = 'multi-participant-item__name-line';
      const name = document.createElement('strong');
      name.className = 'multi-participant-item__name';
      name.textContent = row.name || DEFAULT_MULTI_PARTICIPANT_NAME;
      nameLine.appendChild(name);
      if (isSelf) {
        const selfTag = document.createElement('span');
        selfTag.className = 'multi-participant-item__tag multi-participant-item__tag--self';
        selfTag.textContent = localizeText('あなた', 'You');
        nameLine.appendChild(selfTag);
      }
      const cell = document.createElement('span');
      cell.className = 'multi-participant-item__cell';
      cell.textContent = metaParts.join(' / ');
      main.append(nameLine, cell);
      summary.appendChild(main);

      const state = document.createElement('span');
      state.className = 'multi-participant-item__state';
      let hasStateTag = false;
      const appendStateTag = (label, className = '') => {
        const tag = document.createElement('span');
        tag.className = className
          ? `multi-participant-item__tag ${className}`
          : 'multi-participant-item__tag';
        tag.textContent = label;
        state.appendChild(tag);
        hasStateTag = true;
      };
      if (pendingJoinRequest) {
        appendStateTag(localizeText('参加申請中', 'Join Request'), 'multi-participant-item__tag--request');
      }
      if (pendingMoveRequest) {
        appendStateTag(localizeText(
          `移動申請 F${pendingMoveRequest.frameIndex + 1}/L${pendingMoveRequest.trackIndex + 1}`,
          `Move Request F${pendingMoveRequest.frameIndex + 1}/L${pendingMoveRequest.trackIndex + 1}`
        ), 'multi-participant-item__tag--request');
      }
      if (row.locked) {
        appendStateTag(localizeText('ロック', 'Locked'), 'multi-participant-item__tag--locked');
      }
      if (!row.online) {
        appendStateTag(localizeText('オフライン', 'Offline'));
      }
      if (hasStateTag) {
        summary.appendChild(state);
      }
      summary.prepend(avatar);

      if (hasBody) {
        const details = document.createElement('details');
        details.className = 'multi-participant-item__details';
        if (isSelf) {
          details.classList.add('is-self');
        }
        if (!row.online) {
          details.classList.add('is-offline');
        }
        if (pendingJoinRequest) {
          details.classList.add('is-pending-request');
        }
        if (pendingJoinRequest || pendingMoveRequest || (isSelf && multiState.role === 'spectator')) {
          details.open = true;
        }
        details.append(summary, body);
        li.appendChild(details);
      } else {
        const plain = document.createElement('div');
        plain.className = 'multi-participant-item__details is-static';
        if (isSelf) {
          plain.classList.add('is-self');
        }
        if (!row.online) {
          plain.classList.add('is-offline');
        }
        if (pendingJoinRequest) {
          plain.classList.add('is-pending-request');
        }
        plain.appendChild(summary);
        li.appendChild(plain);
      }
      list.appendChild(li);
    });
    renderMultiOverview();
    syncMultiAssignmentControls();
  }






















  function syncMultiControls() {
    multiState.roomVisibility = normalizeMultiRoomVisibility(
      multiState.roomVisibility,
      MULTI_DEFAULT_ROOM_VISIBILITY
    );
    multiState.joinPolicy = normalizeMultiJoinPolicy(
      multiState.joinPolicy,
      MULTI_DEFAULT_JOIN_POLICY
    );
    multiState.exportPermission = normalizeMultiExportPermission(
      multiState.exportPermission,
      MULTI_DEFAULT_EXPORT_PERMISSION
    );
    const sharedProjectFlowPreferred = prefersSharedProjectFlow();
    const currentAccess = readCurrentMultiProjectAccessInput();
    const currentProjectKey = currentAccess.projectKey || readCurrentMultiProjectKey();
    const resolvedSharedProjectKey = sharedProjectFlowPreferred
      ? resolveSharedProjectKeyForCurrentState()
      : '';
    const activeSharedProjectKeyForUi = sharedProjectFlowPreferred
      ? normalizeMultiProjectKey(activeSharedProjectKey || '')
      : '';
    const currentProjectIsShared = sharedProjectFlowPreferred && isCurrentProjectSharedEntry();
    const visibleSharedProjectKey = resolvedSharedProjectKey || (
      currentProjectIsShared ? activeSharedProjectKeyForUi : ''
    );
    const hasCurrentProjectLocator = Boolean(currentProjectKey || currentAccess.inviteToken);
    const sharedModeEnabled = sharedProjectFlowPreferred && (
      currentProjectIsShared
      || Boolean(visibleSharedProjectKey && visibleSharedProjectKey === currentProjectKey)
    );
    if (sharedProjectFlowPreferred && !sharedModeEnabled && !multiState.connected) {
      multiState.maxGuests = normalizeMultiMaxGuests(
        getMultiGuestLimitForCurrentPlan(),
        MULTI_DEFAULT_GUEST_LIMIT,
        getMultiGuestLimitForCurrentPlan()
      );
    } else {
      multiState.maxGuests = normalizeMultiMaxGuests(multiState.maxGuests, MULTI_DEFAULT_GUEST_LIMIT);
    }
    const isEntryView = normalizeMultiUiView(multiState.uiView) === 'entry'
      && !multiState.connected
      && !multiState.connecting;
    const inMasterConfigMode = isMultiMasterConfigMode();
    const isSignedInAccount = Boolean(accountState.isLoggedIn && accountState.userId && !accountState.isAnonymous);
    const requiresSharedLogin = sharedProjectFlowPreferred && !isSignedInAccount;
    const commentsInputMode = isMultiParticipantsCommentModeActive();
    const canSendComment = (
      (isSharedProjectCollaborativeMode() && Boolean(activeSharedProjectKey))
      || multiState.connected
    ) && !multiState.connecting;
    syncMultiPanelFlowUi();
    updateMultiFlowTabsUi();
    const isJoinPanelVisible = isEntryView && multiEntryJoinPanelOpen;
    const isFlowKeyFieldVisible = !isEntryView;
    if (!commentsInputMode && !(sharedProjectFlowPreferred && !sharedModeEnabled)) {
      syncMultiProjectKeyInputValues(multiState.projectKey, { preserveFocused: true });
    }
    if (dom.controls.multiJoinProjectKey instanceof HTMLInputElement) {
      dom.controls.multiJoinProjectKey.disabled = commentsInputMode
        ? !canSendComment
        : (multiState.connecting || requiresSharedLogin);
    }
    if (dom.controls.multiProjectKey instanceof HTMLInputElement) {
      dom.controls.multiProjectKey.disabled = sharedProjectFlowPreferred
        ? multiState.connecting
        : true;
      dom.controls.multiProjectKey.readOnly = !sharedProjectFlowPreferred;
    }
    if (dom.controls.multiToggleCodeVisibility instanceof HTMLButtonElement) {
      dom.controls.multiToggleCodeVisibility.hidden = true;
      dom.controls.multiToggleCodeVisibility.disabled = true;
      dom.controls.multiToggleCodeVisibility.setAttribute('aria-hidden', 'true');
    }
    if (dom.controls.multiJoinProjectKey instanceof HTMLInputElement) {
      const codeValue = currentAccess.inviteToken || currentAccess.projectKey || '';
      if (commentsInputMode) {
        dom.controls.multiJoinProjectKey.readOnly = false;
        dom.controls.multiJoinProjectKey.type = 'text';
        dom.controls.multiJoinProjectKey.maxLength = 160;
        dom.controls.multiJoinProjectKey.placeholder = canSendComment
          ? localizeText('コメントを入力', 'Type a comment')
          : localizeText('接続するとコメントできます', 'Connect to comment');
      } else if (requiresSharedLogin) {
        dom.controls.multiJoinProjectKey.maxLength = 280;
        dom.controls.multiJoinProjectKey.value = '';
        dom.controls.multiJoinProjectKey.readOnly = true;
        dom.controls.multiJoinProjectKey.type = 'text';
        dom.controls.multiJoinProjectKey.placeholder = localizeText('ログインしてください', 'Please sign in');
      } else if (sharedModeEnabled) {
        dom.controls.multiJoinProjectKey.maxLength = 280;
        dom.controls.multiJoinProjectKey.value = codeValue;
        dom.controls.multiJoinProjectKey.readOnly = true;
        dom.controls.multiJoinProjectKey.type = 'text';
        dom.controls.multiJoinProjectKey.placeholder = localizeText('共有コード', 'Shared code');
      } else {
        dom.controls.multiJoinProjectKey.maxLength = 280;
        dom.controls.multiJoinProjectKey.readOnly = false;
        dom.controls.multiJoinProjectKey.type = 'text';
        if (sharedProjectFlowPreferred && dom.controls.multiJoinProjectKey !== document.activeElement) {
          const parsedJoinValue = parseMultiProjectAccessInput(dom.controls.multiJoinProjectKey.value);
          const storedProjectKey = normalizeMultiProjectKey(multiState.projectKey || '');
          if (storedProjectKey && parsedJoinValue.projectKey === storedProjectKey && !parsedJoinValue.inviteToken) {
            dom.controls.multiJoinProjectKey.value = '';
          }
        }
        dom.controls.multiJoinProjectKey.placeholder = localizeText('コードを入力してください', 'Enter code');
      }
    }
    if (dom.controls.multiToggleCodeVisibility instanceof HTMLButtonElement) {
      dom.controls.multiToggleCodeVisibility.textContent = localizeText('表示', 'Show');
      dom.controls.multiToggleCodeVisibility.hidden = true;
      dom.controls.multiToggleCodeVisibility.disabled = true;
      dom.controls.multiToggleCodeVisibility.setAttribute('aria-hidden', 'true');
    }
    if (dom.controls.multiApplyAccessCode instanceof HTMLButtonElement) {
      dom.controls.multiApplyAccessCode.textContent = commentsInputMode
        ? localizeText('送信', 'Send')
        : localizeText('確定', 'Apply');
      dom.controls.multiApplyAccessCode.disabled = commentsInputMode
        ? !canSendComment
        : (multiState.connecting || requiresSharedLogin);
      dom.controls.multiApplyAccessCode.hidden = commentsInputMode ? false : sharedModeEnabled;
      dom.controls.multiApplyAccessCode.setAttribute('aria-hidden', String(commentsInputMode ? false : sharedModeEnabled));
    }
    if (dom.controls.multiCopyAccessCode instanceof HTMLButtonElement) {
      const access = readCurrentMultiProjectAccessInput();
      dom.controls.multiCopyAccessCode.disabled = multiState.connecting || requiresSharedLogin || !(access.inviteToken || access.projectKey);
      dom.controls.multiCopyAccessCode.hidden = commentsInputMode || !sharedModeEnabled;
      dom.controls.multiCopyAccessCode.setAttribute('aria-hidden', String(commentsInputMode || !sharedModeEnabled));
    }
    if (dom.controls.multiEntryMaster instanceof HTMLButtonElement) {
      dom.controls.multiEntryMaster.disabled = sharedProjectFlowPreferred
        ? multiState.connecting
        : (multiState.connecting || multiState.connected);
      setMultiEntryActionCopy(dom.controls.multiEntryMaster, sharedProjectFlowPreferred
        ? {
            title: localizeText('共有', 'Share'),
            meta: localizeText('空欄なら作成、リンクなら開く', 'Create if empty, open if link pasted'),
            titleSelector: '#multiEntryMasterTitle',
            metaSelector: '#multiEntryMasterMeta',
          }
        : {
            title: localizeText('部屋を開く', 'Open Room'),
            meta: localizeText('キー自動生成', 'Auto-create key'),
            titleSelector: '#multiEntryMasterTitle',
            metaSelector: '#multiEntryMasterMeta',
          });
      if (dom.controls.multiEntryMaster.disabled) {
        dom.controls.multiEntryMaster.title = localizeText('接続中は切替できません', 'Cannot switch while connected');
      } else {
        dom.controls.multiEntryMaster.title = sharedProjectFlowPreferred
          ? localizeText('入力が空なら共有を作成し、入力があればその共有を開きます', 'Create shared if the field is empty, or open the pasted shared project')
          : localizeText('新しいキーを自動生成して部屋を開きます', 'Generates a new key and opens a room');
      }
    }
    if (dom.controls.multiEntryGuest instanceof HTMLButtonElement) {
      dom.controls.multiEntryGuest.disabled = multiState.connecting || multiState.connected;
      dom.controls.multiEntryGuest.hidden = sharedProjectFlowPreferred;
      setMultiEntryActionCopy(dom.controls.multiEntryGuest, sharedProjectFlowPreferred
        ? {
            title: localizeText('共有を開く', 'Open Shared'),
            meta: localizeText('共有リンクを貼り付け', 'Paste invite link'),
            titleSelector: '#multiEntryGuestTitle',
            metaSelector: '#multiEntryGuestMeta',
          }
        : {
            title: localizeText('参加する', 'Join'),
            meta: localizeText('キー入力へ進む', 'Open key input'),
            titleSelector: '#multiEntryGuestTitle',
            metaSelector: '#multiEntryGuestMeta',
          });
      if (dom.controls.multiEntryGuest.disabled) {
        dom.controls.multiEntryGuest.title = localizeText('接続中は切替できません', 'Cannot switch while connected');
      } else {
        dom.controls.multiEntryGuest.title = sharedProjectFlowPreferred
          ? localizeText('共有リンクまたは招待コードの入力欄を開きます', 'Open the invite link or code input')
          : localizeText('キー入力パネルを開きます', 'Open the key input panel');
      }
    }
    if (dom.controls.multiEntryJoinAsGuest instanceof HTMLButtonElement) {
      dom.controls.multiEntryJoinAsGuest.disabled = !isJoinPanelVisible || multiState.connecting || multiState.connected || !hasCurrentProjectLocator;
      dom.controls.multiEntryJoinAsGuest.hidden = sharedProjectFlowPreferred;
      setMultiEntryActionCopy(dom.controls.multiEntryJoinAsGuest, sharedProjectFlowPreferred
        ? {
            title: localizeText('共有を開く', 'Open Shared'),
            meta: localizeText('共有プロジェクトをそのまま開く', 'Open shared project directly'),
            titleSelector: '#multiEntryJoinAsGuestTitle',
            metaSelector: '#multiEntryJoinAsGuestMeta',
          }
        : {
            title: localizeText('参加申請して入る', 'Join With Request'),
            meta: localizeText('まず視聴で入り、参加申請を送信', 'Enter as viewer first, then request access'),
            titleSelector: '#multiEntryJoinAsGuestTitle',
            metaSelector: '#multiEntryJoinAsGuestMeta',
          });
      if (dom.controls.multiEntryJoinAsGuest.disabled) {
        dom.controls.multiEntryJoinAsGuest.title = !hasCurrentProjectLocator
          ? localizeText('先に共有リンクまたは招待コードを入力してください', 'Enter an invite link or invite code first')
          : localizeText('接続中は切替できません', 'Cannot switch while connected');
      } else {
        dom.controls.multiEntryJoinAsGuest.title = sharedProjectFlowPreferred
          ? localizeText('共有プロジェクトを開き、そのまま共同編集します', 'Open the shared project and start editing together')
          : localizeText(
            'まず視聴として入室し、そのまま参加申請を送信します',
            'Enter as a viewer first, then send a join request'
          );
      }
    }
    if (dom.controls.multiEntrySpectator instanceof HTMLButtonElement) {
      dom.controls.multiEntrySpectator.disabled = true;
      dom.controls.multiEntrySpectator.hidden = true;
      if (dom.controls.multiEntrySpectator.disabled) {
        dom.controls.multiEntrySpectator.title = localizeText('視聴専用参加は使用しません', 'Viewer-only joining is not used');
      } else {
        dom.controls.multiEntrySpectator.title = localizeText('キーで視聴モードに入室します', 'Join in viewer mode with key');
      }
    }
    if (dom.controls.multiEntryJoinBack instanceof HTMLButtonElement) {
      dom.controls.multiEntryJoinBack.disabled = !isJoinPanelVisible || multiState.connecting || multiState.connected;
      dom.controls.multiEntryJoinBack.hidden = sharedProjectFlowPreferred;
    }
    if (dom.controls.multiStartSession instanceof HTMLButtonElement) {
      const canStartSharedFlow = sharedProjectFlowPreferred && !multiState.connecting && !sharedModeEnabled;
      const sharedOwnershipStatus = getSharedProjectOwnershipStatus();
      const sharedCreationBlocked = sharedProjectFlowPreferred
        && !sharedModeEnabled
        && !multiState.connecting
        && sharedOwnershipStatus.overLimit;
      dom.controls.multiStartSession.disabled = sharedProjectFlowPreferred
        ? (multiState.connecting || (!sharedModeEnabled && (!canStartSharedFlow || sharedCreationBlocked)))
        : (multiState.connecting || multiState.connected || !currentProjectKey || isEntryView);
      dom.controls.multiStartSession.hidden = false;
      dom.controls.multiStartSession.textContent = sharedProjectFlowPreferred
        ? (sharedModeEnabled
          ? localizeText('共有リンクをコピー', 'Copy Shared Link')
          : localizeText('共有リンクを作成', 'Create Shared Link'))
        : localizeText('開始', 'Start');
      dom.controls.multiStartSession.classList.toggle('multi-shared-mode-toggle', sharedProjectFlowPreferred);
      dom.controls.multiStartSession.classList.toggle('is-on', sharedProjectFlowPreferred && sharedModeEnabled);
      if (multiState.connected && !sharedProjectFlowPreferred) {
        dom.controls.multiStartSession.title = sharedProjectFlowPreferred
          ? localizeText('共有プロジェクトを開いています', 'A shared project is already open')
          : (multiState.role === 'guest'
            ? localizeText('すでに参加中です', 'Already joined')
            : (multiState.role === 'spectator'
              ? localizeText('すでに視聴中です', 'Already viewing')
              : localizeText('すでに開始済みです', 'Already started')));
      } else if (multiState.connecting) {
        dom.controls.multiStartSession.title = localizeText('接続中です', 'Connecting...');
      } else if (sharedCreationBlocked) {
        dom.controls.multiStartSession.title = buildSharedProjectCreationBlockedMessage(sharedOwnershipStatus);
      } else if (sharedProjectFlowPreferred) {
        dom.controls.multiStartSession.title = sharedModeEnabled
          ? localizeText('共有リンクをコピーします', 'Copy the shared link')
          : localizeText('今のプロジェクトから共有リンクを作成します', 'Create a shared link from the current project');
      } else if (!currentProjectKey) {
        dom.controls.multiStartSession.title = localizeText('共有リンクまたはプロジェクトキーを入力してください', 'Enter an invite link or project key');
      } else if (isEntryView) {
        dom.controls.multiStartSession.title = localizeText(
          '先に「部屋を開く / 参加する」を選択してください',
          'Choose Open Room / Join Room first'
        );
      } else {
        dom.controls.multiStartSession.removeAttribute('title');
      }
    }
    if (dom.controls.multiLeaveSession instanceof HTMLButtonElement) {
      const canLeaveOrBack = multiState.connected
        || multiState.connecting
        || normalizeMultiUiView(multiState.uiView) !== 'entry';
      dom.controls.multiLeaveSession.disabled = !canLeaveOrBack;
      dom.controls.multiLeaveSession.hidden = true;
    }
    if (dom.controls.multiGenerateKey instanceof HTMLButtonElement) {
      dom.controls.multiGenerateKey.disabled = multiState.connecting || multiState.connected;
    }
    if (dom.controls.multiCopyKey instanceof HTMLButtonElement) {
      dom.controls.multiCopyKey.disabled = multiState.connecting
        || !currentProjectKey
        || !isFlowKeyFieldVisible;
      dom.controls.multiCopyKey.hidden = sharedProjectFlowPreferred;
    }
    if (dom.controls.multiBroadcastState instanceof HTMLButtonElement) {
      dom.controls.multiBroadcastState.disabled = sharedProjectFlowPreferred || !(multiState.connected && multiState.role === 'master');
      dom.controls.multiBroadcastState.hidden = sharedProjectFlowPreferred;
    }
    /* multiForceDanmakuToggle removed: danmaku is client-local and not master-forced */
    if (dom.controls.multiMaxGuests instanceof HTMLInputElement) {
      dom.controls.multiMaxGuests.value = String(multiState.maxGuests);
      dom.controls.multiMaxGuests.min = String(MULTI_GUEST_LIMIT_MIN);
      dom.controls.multiMaxGuests.max = String(MULTI_GUEST_LIMIT_MAX);
      dom.controls.multiMaxGuests.disabled = sharedProjectFlowPreferred || multiState.connecting || !inMasterConfigMode;
    }
    if (dom.controls.multiRoomVisibility instanceof HTMLSelectElement) {
      if (
        dom.controls.multiRoomVisibility.options.length !== 2
        || dom.controls.multiRoomVisibility.options[0].value !== MULTI_ROOM_VISIBILITY_PRIVATE
        || dom.controls.multiRoomVisibility.options[1].value !== MULTI_ROOM_VISIBILITY_PUBLIC
      ) {
        dom.controls.multiRoomVisibility.innerHTML = '<option value="private">限定プロジェクト</option><option value="public">公開プロジェクト</option>';
      }
      setLocalizedSelectOption(dom.controls.multiRoomVisibility, 'private', '限定プロジェクト', 'Limited Project');
      setLocalizedSelectOption(dom.controls.multiRoomVisibility, 'public', '公開プロジェクト', 'Public Project');
      dom.controls.multiRoomVisibility.value = normalizeMultiRoomVisibility(
        multiState.roomVisibility,
        MULTI_DEFAULT_ROOM_VISIBILITY
      );
      dom.controls.multiRoomVisibility.disabled = !sharedProjectFlowPreferred
        || !isSignedInAccount
        || currentProjectIsShared
        || multiState.connecting;
    }
    if (dom.controls.multiExportPermission instanceof HTMLSelectElement) {
      setLocalizedSelectOption(dom.controls.multiExportPermission, 'master-guest', 'マスター + 参加者', 'Master + Participants');
      setLocalizedSelectOption(dom.controls.multiExportPermission, 'master', 'マスターのみ', 'Master Only');
      setLocalizedSelectOption(dom.controls.multiExportPermission, 'all', '全員', 'Everyone');
      dom.controls.multiExportPermission.value = multiState.exportPermission;
      dom.controls.multiExportPermission.disabled = sharedProjectFlowPreferred || multiState.connecting || !inMasterConfigMode;
    }
    if (dom.controls.multiJoinPolicy instanceof HTMLSelectElement) {
      setLocalizedSelectOption(dom.controls.multiJoinPolicy, 'open', '自動参加（友達向け）', 'Auto Join (Friends)');
      setLocalizedSelectOption(dom.controls.multiJoinPolicy, 'approval', '承認制（配信向け）', 'Approval (Streaming)');
      dom.controls.multiJoinPolicy.value = multiState.joinPolicy;
      dom.controls.multiJoinPolicy.disabled = sharedProjectFlowPreferred || multiState.connecting || !inMasterConfigMode;
    }
    const canUseParticipantFreeCellMove = inMasterConfigMode;
    if (dom.controls.multiParticipantFreeCellMove instanceof HTMLInputElement) {
      dom.controls.multiParticipantFreeCellMove.checked = Boolean(multiState.participantFreeCellMove);
      dom.controls.multiParticipantFreeCellMove.disabled = sharedProjectFlowPreferred || multiState.connecting || !canUseParticipantFreeCellMove;
    }
    if (dom.controls.multiParticipantFreeCellMoveHint instanceof HTMLElement) {
      if (!multiState.connected) {
        dom.controls.multiParticipantFreeCellMoveHint.textContent = localizeText(
          'ON にすると参加者は空いているフレーム / レイヤーセルへ自分で移動できます。',
          'When ON, participants can move themselves to any free frame/layer cell.'
        );
      } else if (multiState.participantFreeCellMove) {
        dom.controls.multiParticipantFreeCellMoveHint.textContent = localizeText(
          '参加者は空きセルへ自分で移動できます。同じセルへの同時参加はできません。',
          'Participants can move themselves to any free cell. Two participants cannot share a cell.'
        );
      } else {
        dom.controls.multiParticipantFreeCellMoveHint.textContent = localizeText(
          'OFF 中はセル移動はマスターのみです。',
          'When OFF, only the master can move participant cells.'
        );
      }
    }
    if (dom.controls.multiPresetFriends instanceof HTMLButtonElement) {
      dom.controls.multiPresetFriends.disabled = sharedProjectFlowPreferred || multiState.connecting || !inMasterConfigMode;
    }
    if (dom.controls.multiPresetStream instanceof HTMLButtonElement) {
      dom.controls.multiPresetStream.disabled = sharedProjectFlowPreferred || multiState.connecting || !inMasterConfigMode;
    }
    if (dom.controls.multiPresetHint instanceof HTMLElement) {
      const joinPolicy = normalizeMultiJoinPolicy(multiState.joinPolicy, MULTI_DEFAULT_JOIN_POLICY);
      const visibilityLabel = getMultiRoomVisibilityLabel();
      const exportLabel = getMultiExportPermissionLabel();
      dom.controls.multiPresetHint.textContent = joinPolicy === MULTI_JOIN_POLICY_OPEN
        ? localizeText(
          `現在: 友達向け寄り（自動参加 / ${visibilityLabel} / ${exportLabel}）`,
          `Current: Friends preset (Auto Join / ${visibilityLabel} / ${exportLabel})`
        )
        : localizeText(
          `現在: 配信向け寄り（承認制 / ${visibilityLabel} / ${exportLabel}）`,
          `Current: Streaming preset (Approval / ${visibilityLabel} / ${exportLabel})`
        );
    }
    const canUseMasterOpsMode = !sharedProjectFlowPreferred && inMasterConfigMode;
    if (!canUseMasterOpsMode && multiState.masterOpsMode) {
      multiState.masterOpsMode = false;
    }
    if (dom.controls.multiMasterOpsMode instanceof HTMLInputElement) {
      dom.controls.multiMasterOpsMode.checked = Boolean(multiState.masterOpsMode);
      dom.controls.multiMasterOpsMode.disabled = multiState.connecting || !canUseMasterOpsMode;
    }
    if (dom.controls.multiMasterOpsHint instanceof HTMLElement) {
      dom.controls.multiMasterOpsHint.textContent = multiState.masterOpsMode
        ? localizeText(
          '運営モードON: 強制切替 / セル移動 / キック / BAN を表示中。',
          'Ops mode ON: force role/cell controls, kick and ban are shown.'
        )
        : localizeText(
          '運営モードOFF: 通常運用向けに運営操作を隠しています。',
          'Ops mode OFF: moderation controls are hidden for normal use.'
        );
    }
    if (Array.isArray(dom.controls.multiMasterOpsGroups)) {
      dom.controls.multiMasterOpsGroups.forEach(node => {
        if (node instanceof HTMLElement) {
          node.hidden = !canUseMasterOpsMode || !multiState.masterOpsMode;
        }
      });
    }
    if (dom.controls.multiGuestCapacityHint instanceof HTMLElement) {
      if (sharedProjectFlowPreferred) {
        const memberLimit = getSharedProjectMemberLimitForCurrentPlan();
        dom.controls.multiGuestCapacityHint.textContent = localizeText(
          `共有プロジェクトでは全員が対等に編集できます。現在の上限は最大 ${memberLimit} 人（参加者 ${memberLimit - 1} 人）です。`,
          `Everyone edits as an equal in shared projects. Current limit: up to ${memberLimit} people (${memberLimit - 1} participants).`
        );
      } else {
        const assignedGuestCount = getAssignedGuestCount();
        dom.controls.multiGuestCapacityHint.textContent = localizeText(
          `参加枠: ${assignedGuestCount} / ${multiState.maxGuests}`,
          `Participant slots: ${assignedGuestCount} / ${multiState.maxGuests}`
        );
      }
    }
    if (dom.controls.multiRoomVisibilityHint instanceof HTMLElement) {
      dom.controls.multiRoomVisibilityHint.textContent = sharedProjectFlowPreferred
        ? localizeText(
          '限定はログイン後にコードまたはURLで参加できます。公開はURLからログインなしで参加できます。',
          'Limited projects require sign-in to join by code or URL. Public projects can be joined from the URL without signing in.'
        )
        : localizeText(
          '公開部屋の一覧は停止中です。マルチプレイは非公開で開始され、招待リンクで共有できます。',
          'Public room listing is disabled. Multiplayer starts private and can be shared by invite link.'
        );
    }
    if (dom.controls.multiJoinPolicyHint instanceof HTMLElement) {
      const joinPolicy = normalizeMultiJoinPolicy(multiState.joinPolicy, MULTI_DEFAULT_JOIN_POLICY);
      if (sharedProjectFlowPreferred) {
        dom.controls.multiJoinPolicyHint.textContent = localizeText(
          '接続や承認より、共有プロジェクト自体を開いて同時編集する流れを優先します。',
          'The flow prioritizes opening the shared project itself and editing together over room-style join/approval.'
        );
      } else if (!multiState.connected) {
        dom.controls.multiJoinPolicyHint.textContent = joinPolicy === MULTI_JOIN_POLICY_OPEN
          ? localizeText(
            '共有リンク: まず共有プロジェクトを開きます。接続時は参加者で入室できます。',
            'Share link: opens the shared project first. Connecting can join as participant.'
          )
          : localizeText(
            '共有リンク: まず共有プロジェクトを開きます。接続時は視聴から始まります。',
            'Share link: opens the shared project first. Connecting starts as viewer.'
          );
      } else if (!isMultiMasterMode()) {
        dom.controls.multiJoinPolicyHint.textContent = localizeText(
          `参加方式: ${getMultiJoinPolicyLabel(joinPolicy)}`,
          `Join policy: ${getMultiJoinPolicyLabel(joinPolicy)}`
        );
      } else if (joinPolicy === MULTI_JOIN_POLICY_OPEN) {
        dom.controls.multiJoinPolicyHint.textContent = localizeText(
          '自動参加: 招待リンクで参加者として入室します。',
          'Auto Join: invite link joins as participant.'
        );
      } else {
        dom.controls.multiJoinPolicyHint.textContent = localizeText(
          '承認制: 参加はマスター承認が必要です。',
          'Approval: joining requires master approval.'
        );
      }
    }
    if (dom.controls.multiInviteCopy instanceof HTMLButtonElement) {
      dom.controls.multiInviteCopy.disabled = multiState.connecting
        || !(sharedProjectFlowPreferred ? Boolean(visibleSharedProjectKey) : (inMasterConfigMode && currentProjectKey));
      dom.controls.multiInviteCopy.hidden = sharedProjectFlowPreferred ? true : false;
    }
    if (dom.controls.multiInviteShare instanceof HTMLButtonElement) {
      dom.controls.multiInviteShare.disabled = multiState.connecting
        || !(sharedProjectFlowPreferred ? Boolean(visibleSharedProjectKey) : (inMasterConfigMode && currentProjectKey));
      dom.controls.multiInviteShare.hidden = sharedProjectFlowPreferred ? true : false;
    }
    const participantsPanel = document.querySelector('#panelMulti .multi-participants-panel');
    if (participantsPanel instanceof HTMLElement) {
      participantsPanel.hidden = false;
      participantsPanel.classList.toggle('is-inactive', sharedProjectFlowPreferred && !sharedModeEnabled);
    }
    if (dom.controls.multiMasterAdvanced instanceof HTMLElement) {
      dom.controls.multiMasterAdvanced.hidden = sharedProjectFlowPreferred;
    } else {
      const masterAdvanced = document.getElementById('multiMasterAdvanced');
      if (masterAdvanced instanceof HTMLElement) {
        masterAdvanced.hidden = sharedProjectFlowPreferred;
      }
    }
    if (dom.controls.multiJoinRequestField instanceof HTMLElement) {
      dom.controls.multiJoinRequestField.hidden = sharedProjectFlowPreferred;
    }
    if (dom.controls.multiProjectKeyField instanceof HTMLElement) {
      dom.controls.multiProjectKeyField.hidden = sharedProjectFlowPreferred;
    }
    if (dom.controls.multiJoinProjectKeyField instanceof HTMLElement) {
      dom.controls.multiJoinProjectKeyField.hidden = false;
      dom.controls.multiJoinProjectKeyField.setAttribute('aria-hidden', 'false');
    }
    if (dom.controls.multiEntryAccountCard instanceof HTMLElement) {
      dom.controls.multiEntryAccountCard.hidden = isSignedInAccount;
    }
    if (dom.controls.multiFlowAccountCard instanceof HTMLElement) {
      dom.controls.multiFlowAccountCard.hidden = isSignedInAccount;
    }
    if (dom.controls.multiSupportCard instanceof HTMLElement) {
      dom.controls.multiSupportCard.hidden = !isSignedInAccount;
    }
    if (dom.controls.multiCommentInput instanceof HTMLInputElement) {
      dom.controls.multiCommentInput.disabled = !canSendComment;
      dom.controls.multiCommentInput.placeholder = canSendComment
        ? localizeText('コメントを入力', 'Type a comment')
        : localizeText('接続するとコメントできます', 'Connect to comment');
    }
    if (dom.controls.multiCommentSend instanceof HTMLButtonElement) {
      dom.controls.multiCommentSend.disabled = !canSendComment;
    }
    renderMultiOverview();
    if (dom.controls.exportProject instanceof HTMLButtonElement) {
      const canExport = !multiState.connecting && canCurrentClientExportProject('png');
      dom.controls.exportProject.disabled = !canExport;
      const exportDisabledReason = multiState.connecting
        ? localizeText('接続中です', 'Connecting...')
        : getMultiExportDisabledReason('png');
      if (exportDisabledReason) {
        dom.controls.exportProject.title = exportDisabledReason;
      } else {
        dom.controls.exportProject.removeAttribute('title');
      }
    }
    updateExportFormatAvailability();
    updateExportOriginalToggleUI();
    syncMultiJoinRequestControls();
    updatePixfindModeUI();
    enforceMobileSpectatorTabLock({ forceActivate: true });
    syncMultiAssignmentControls();
    // Tool lock by role (spectator restrictions)
    try {
      if (isMultiSpectatorMode() && !isSharedProjectCollaborativeMode()) {
        // Ensure pan is active so viewer can pan/zoom
        setActiveTool('pan');
        if (Array.isArray(toolButtons)) {
          toolButtons.forEach(btn => {
            try { btn.disabled = true; btn.classList.add('is-disabled'); } catch (e) { /* ignore */ }
          });
        }
        if (Array.isArray(dom.toolGroupButtons)) {
          dom.toolGroupButtons.forEach(btn => { try { btn.disabled = true; } catch (e) { /* ignore */ } });
        }
      } else {
        if (Array.isArray(toolButtons)) {
          toolButtons.forEach(btn => {
            try { btn.disabled = false; btn.classList.remove('is-disabled'); } catch (e) { /* ignore */ }
          });
        }
        if (Array.isArray(dom.toolGroupButtons)) {
          dom.toolGroupButtons.forEach(btn => { try { btn.disabled = false; } catch (e) { /* ignore */ } });
        }
      }
    } catch (e) {
      /* ignore spectator tool sync errors */
    }
  }

  function applyMultiRoleUiLocks() {
    if (isSharedProjectCollaborativeMode()) {
      updateCanvasResizeControls();
      return;
    }
    const isReadOnly = isMultiReadOnlyMode();
    const lockTargets = [
      dom.controls.addLayer,
      dom.controls.removeLayer,
      dom.controls.moveLayerUp,
      dom.controls.moveLayerDown,
      dom.controls.addFrame,
      dom.controls.removeFrame,
      dom.controls.moveFrameUp,
      dom.controls.moveFrameDown,
      dom.controls.layerOpacity,
      dom.controls.layerBlendMode,
      dom.controls.animationFps,
      dom.controls.applyFpsAll,
      dom.controls.canvasWidth,
      dom.controls.canvasHeight,
      dom.controls.canvasWidthDecrement,
      dom.controls.canvasWidthIncrement,
      dom.controls.canvasHeightDecrement,
      dom.controls.canvasHeightIncrement,
      dom.controls.applyCanvasResize,
      dom.controls.applySpriteScale,
      dom.controls.toggleOnionSkin,
      dom.controls.onionSkinEnabled,
      dom.controls.onionPrevFrames,
      dom.controls.onionNextFrames,
      dom.controls.onionOpacity,
      dom.controls.toggleMirrorMode,
      dom.controls.mirrorAxisVertical,
      dom.controls.mirrorAxisHorizontal,
      dom.controls.mirrorAxisDiagonalA,
      dom.controls.mirrorAxisDiagonalB,
      dom.controls.toggleLocalCanvas,
      dom.controls.addLocalCanvas,
      dom.controls.removeLocalCanvas,
      dom.controls.togglePixfindMode,
      dom.controls.clearCanvas,
      dom.controls.openDocument,
      dom.newProject?.button,
      dom.controls.multiAssignTarget,
      dom.controls.multiAssignFrame,
      dom.controls.multiAssignLayer,
      dom.controls.multiAssignApply,
      dom.controls.multiAssignLockToggle,
      dom.controls.multiAssignKick,
      dom.controls.multiAssignBan,
      dom.controls.multiRoleTarget,
      dom.controls.multiForceGuest,
      dom.controls.multiForceSpectator,
      dom.controls.multiRoomVisibility,
      dom.controls.multiJoinPolicy,
      dom.controls.multiParticipantFreeCellMove,
      dom.controls.multiPresetFriends,
      dom.controls.multiPresetStream,
      dom.controls.multiMasterOpsMode,
      dom.controls.multiBlockedTarget,
      dom.controls.multiBlockedRemove,
    ];
    lockTargets.forEach(control => {
      if (!(control instanceof HTMLButtonElement) && !(control instanceof HTMLInputElement) && !(control instanceof HTMLSelectElement)) {
        return;
      }
      if (isReadOnly) {
        if (control.dataset.multiPrevDisabled === undefined) {
          control.dataset.multiPrevDisabled = control.disabled ? '1' : '0';
        }
        control.disabled = true;
      } else if (control.dataset.multiPrevDisabled !== undefined) {
        control.disabled = control.dataset.multiPrevDisabled === '1';
        delete control.dataset.multiPrevDisabled;
      }
    });
    updateCanvasResizeControls();
  }

        return Object.freeze({
          getLocalMultiParticipantName,
          getLocalMultiParticipantAvatarId,
          getMultiAssignment,
          normalizeMultiAssignmentCanvasId,
          getAssignmentCanvasDocument,
          resolveAssignedFrameIndexForCanvas,
          resolveAssignedLayerTrackIndexForCanvas,
          getProjectCanvasActiveLayerTrackIndex,
          getAssignedCellForClientOnCanvas,
          isAssignedCellActiveForCanvas,
          getMultiLayerTrackIndexByAnchorLayerId,
          getMultiFrameIndexByFrameId,
          getAssignedFrameIndexForClient,
          getAssignedLayerTrackIndexForClient,
          getAssignedLayerForFrame,
          getAssignedCellForClient,
          getMultiAssignmentCellKey,
          getUsedMultiAssignmentCellKeys,
          isMultiAssignmentCellOccupied,
          findFirstAvailableMultiAssignmentCell,
          sortMultiAssignmentEntriesForNormalization,
          getOrCreateMultiAssignmentUsedCellKeys,
          findFirstAvailableMultiAssignmentCellInUsedSet,
          getPreferredMultiAssignmentCanvasDocument,
          resolvePreferredMultiAssignmentTrackIndex,
          resolvePreferredMultiAssignmentFrameIndex,
          getMultiAssignmentCanvasSearchOrder,
          resolveNormalizedMultiAssignmentPlacement,
          simulateNormalizedMultiAssignmentsForCanvasDocuments,
          canNormalizeMultiAssignmentsForCanvasDocuments,
          cloneProjectCanvasDocumentsForStructureChange,
          normalizeMultiAssignmentsForCurrentDocument,
          setMultiSelectedControlClientId,
          selectMultiControlTarget,
          getMultiSelectedControlTargetInfo,
          updateMultiAssignmentControlsFromSelection,
          syncMultiAssignmentControls,
          syncMultiBlockedControls,
          moveMultiParticipantToCell,
          sendMultiAssignmentMoveRequest,
          sendMultiAssignmentMovePermissionRequest,
          requestMultiGuestMoveToCell,
          sendMultiAssignmentMoveResult,
          handleMultiAssignmentMoveRequestMessage,
          handleMultiAssignmentMoveResultMessage,
          rejectPendingMultiAssignmentMoveRequest,
          sendMultiKickClientNotice,
          setMultiParticipantCellLocked,
          removeMultiParticipantFromAssignments,
          kickMultiParticipant,
          banMultiParticipant,
          unbanMultiParticipant,
          enforceGuestAssignedLayerSelection,
          getMultiStatusColor,
          appendMultiOverviewChip,
          setMultiEntryActionCopy,
          renderMultiOverview,
          setMultiStatus,
          inferStartupBootProgressPercent,
          getStartupBootProgressNow,
          waitForNextPaint,
          waitForStartupBootProgressReveal,
          setStartupBootLoadingProgress,
          syncStartupBootLoadingWithLabel,
          syncGlobalLoadingIndicator,
          setGlobalLoadingIndicatorLabel,
          beginGlobalLoading,
          beginBlockingGlobalLoading,
          beginStartupProgress,
          cancelStartupRestoreProgress,
          setStartupProgressLabel,
          syncSharedModeStatusDisplay,
          hasSharedProjectLocalCommitWorkPending,
          ensureSharedProjectInviteIncludesCommittedLocalOps,
          copyMultiInviteLink,
          shareMultiInviteLink,
          normalizeMultiRoleControlTargetRole,
          sendMultiRoleChangeNotice,
          getRoleControlCandidateRows,
          syncMultiRoleControlUi,
          forceMultiParticipantRole,
          getMultiRoleLabel,
          normalizeMultiRole,
          normalizeMultiDesiredRole,
          normalizeMultiUiView,
          normalizeMultiFlowTab,
          getMultiFlowTabButtons,
          setMultiCommentTabNotification,
          isMultiFlowPanelVisible,
          isMultiCommentsTabVisible,
          setMultiParticipantsPanelTab,
          isMultiParticipantsCommentModeActive,
          updateMultiFlowTabsUi,
          setMultiFlowTab,
          setMultiDesiredRole,
          setMultiUiView,
          setMultiEntryJoinPanelOpen,
          setMultiHelpPanelVisible,
          isMultiSpectatorMode,
          isMultiReadOnlyMode,
          isMultiClientScopedHistoryMode,
          isMultiMasterConfigMode,
          scheduleMultiEntryScreenMetricsUpdate,
          getMultiEntryScreenAdReserveHeight,
          updateMultiEntryScreenMetrics,
          syncMultiPanelFlowUi,
          serializeMultiAssignments,
          normalizeMultiAssignmentPayloadEntry,
          mergeMultiAssignmentFromPayloadEntry,
          mergeMultiSenderAssignmentFromPayload,
          applyMultiAssignmentsFromPayload,
          describeMultiParticipantPlacement,
          buildMultiParticipantRows,
          createMultiParticipantsActionButton,
          renderMultiParticipantsList,
          syncMultiControls,
          applyMultiRoleUiLocks,
        });
      }
    })(scope);
  }

  root.sharedProjectParticipantUtils = Object.freeze({
    createSharedProjectParticipantUtils,
  });
})();
