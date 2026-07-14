(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createLocalViewportCanvasWorkflowUtils(rawScope = {}) {
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
  function getLocalViewportCanvasCount() {
    if (!MULTI_CANVAS_FEATURE_ENABLED) {
      localViewportCanvasState = normalizeLocalViewportCanvasState(
        LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE,
        LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE
      );
      return 0;
    }
    const count = Math.max(0, getProjectCanvasCount() - 1);
    localViewportCanvasState = normalizeLocalViewportCanvasState(
      { ...localViewportCanvasState, count },
      localViewportCanvasState
    );
    return count;
  }

  function isMultiCanvasWorldLayoutActive() {
    return MULTI_CANVAS_FEATURE_ENABLED && getProjectCanvasCount() > 1;
  }

  function setLocalViewportCanvasLayoutAnchor(left, top) {
    const count = Math.max(0, getLocalViewportCanvasCount());
    const currentScale = getCurrentLocalViewportCanvasLayoutScale();
    const nextAnchorLeft = parseLocalViewportCanvasUnit((Number(left) || 0) / Math.max(currentScale, Number.EPSILON), 0) || 0;
    const nextAnchorTop = parseLocalViewportCanvasUnit((Number(top) || 0) / Math.max(currentScale, Number.EPSILON), 0) || 0;
    const previousAnchorLeft = parseLocalViewportCanvasAxis(localViewportCanvasState?.anchorLeft, 0) || 0;
    const previousAnchorTop = parseLocalViewportCanvasAxis(localViewportCanvasState?.anchorTop, 0) || 0;
    const previousPositions = count > 0
      ? normalizeLocalViewportCanvasPositions(
        localViewportCanvasState?.positions,
        localViewportCanvasState?.positions,
        count,
        {
          relative: true,
          fallbackRelative: true,
        }
      )
      : [];
    const nextState = normalizeLocalViewportCanvasState(
      {
        ...localViewportCanvasState,
        layoutScale: 1,
        anchorLeft: nextAnchorLeft,
        anchorTop: nextAnchorTop,
      },
      localViewportCanvasState
    );
    if (
      nextState.anchorLeft === localViewportCanvasState.anchorLeft
      && nextState.anchorTop === localViewportCanvasState.anchorTop
    ) {
      return false;
    }
    if (count > 0) {
      const nextPositions = previousPositions.map(position => {
        if (!position || position.left === null || position.top === null) {
          return position;
        }
        const displayLeft = (previousAnchorLeft + position.left) * currentScale;
        const displayTop = (previousAnchorTop + position.top) * currentScale;
        return normalizeLocalViewportCanvasPosition(
          {
            left: (displayLeft / Math.max(currentScale, Number.EPSILON)) - nextAnchorLeft,
            top: (displayTop / Math.max(currentScale, Number.EPSILON)) - nextAnchorTop,
          },
          position,
          {
            relative: true,
            fallbackRelative: true,
          }
        );
      });
      nextState.positions = normalizeLocalViewportCanvasPositions(
        nextPositions,
        previousPositions,
        count,
        {
          relative: true,
          fallbackRelative: true,
        }
      );
    }
    localViewportCanvasState = nextState;
    localViewportCanvasLayoutResetPending = false;
    return true;
  }

  function getStoredLocalViewportCanvasPosition(index) {
    const safeIndex = Math.max(0, Math.round(Number(index) || 0));
    const positions = Array.isArray(localViewportCanvasState?.positions)
      ? localViewportCanvasState.positions
      : [];
    return normalizeLocalViewportCanvasPosition(positions[safeIndex], null, {
      relative: true,
      fallbackRelative: true,
    });
  }

  function getDisplayLocalViewportCanvasPosition(index, anchorLeft = 0, anchorTop = 0) {
    const storedPosition = getStoredLocalViewportCanvasPosition(index);
    const currentScale = getCurrentLocalViewportCanvasLayoutScale();
    const anchorWorldLeft = parseLocalViewportCanvasAxis(anchorLeft, localViewportCanvasState?.anchorLeft) || 0;
    const anchorWorldTop = parseLocalViewportCanvasAxis(anchorTop, localViewportCanvasState?.anchorTop) || 0;
    return {
      left: storedPosition.left === null
        ? null
        : Math.round((anchorWorldLeft + storedPosition.left) * currentScale),
      top: storedPosition.top === null
        ? null
        : Math.round((anchorWorldTop + storedPosition.top) * currentScale),
    };
  }

  function setLocalViewportCanvasPosition(index, left, top) {
    const count = Math.max(0, getLocalViewportCanvasCount());
    if (count <= 0) {
      return false;
    }
    const safeIndex = clamp(Math.round(Number(index) || 0), 0, Math.max(0, count - 1));
    const nextPositions = normalizeLocalViewportCanvasPositions(
      localViewportCanvasState?.positions,
      localViewportCanvasState?.positions,
      count,
      {
        relative: true,
        fallbackRelative: true,
      }
    );
    const anchorLeft = parseLocalViewportCanvasAxis(localViewportCanvasState?.anchorLeft, 0) || 0;
    const anchorTop = parseLocalViewportCanvasAxis(localViewportCanvasState?.anchorTop, 0) || 0;
    const currentScale = getCurrentLocalViewportCanvasLayoutScale();
    const worldLeft = (Number(left) || 0) / Math.max(currentScale, Number.EPSILON);
    const worldTop = (Number(top) || 0) / Math.max(currentScale, Number.EPSILON);
    nextPositions[safeIndex] = normalizeLocalViewportCanvasPosition(
      {
        left: worldLeft - anchorLeft,
        top: worldTop - anchorTop,
      },
      nextPositions[safeIndex],
      {
        relative: true,
        fallbackRelative: true,
      }
    );
    const nextState = normalizeLocalViewportCanvasState(
      {
        ...localViewportCanvasState,
        layoutScale: 1,
        positionsRelative: true,
        positions: nextPositions,
      },
      localViewportCanvasState
    );
    const previousPosition = getStoredLocalViewportCanvasPosition(safeIndex);
    const nextPosition = nextState.positions[safeIndex] || normalizeLocalViewportCanvasPosition(null, null);
    if (
      previousPosition.left === nextPosition.left
      && previousPosition.top === nextPosition.top
    ) {
      return false;
    }
    localViewportCanvasState = nextState;
    localViewportCanvasLayoutResetPending = false;
    return true;
  }

  function assignAdjacentPositionForNewLocalViewportCanvases(previousLocalCount = 0) {
    const targetLocalCount = Math.max(0, getLocalViewportCanvasCount());
    const previousCount = clamp(Math.round(Number(previousLocalCount) || 0), 0, targetLocalCount);
    if (targetLocalCount <= previousCount) {
      return false;
    }
    const defaults = computeDefaultLocalViewportCanvasPositions();
    const currentScale = getCurrentLocalViewportCanvasLayoutScale();
    const storedAnchorLeft = parseLocalViewportCanvasAxis(localViewportCanvasState?.anchorLeft, null);
    const storedAnchorTop = parseLocalViewportCanvasAxis(localViewportCanvasState?.anchorTop, null);
    const anchorLeft = storedAnchorLeft === null
      ? defaults.main.left
      : Math.round(storedAnchorLeft * currentScale);
    const anchorTop = storedAnchorTop === null
      ? defaults.main.top
      : Math.round(storedAnchorTop * currentScale);
    const resolvedLayout = computeResolvedMultiCanvasWorldLayoutPositions(anchorLeft, anchorTop);
    setLocalViewportCanvasLayoutAnchor(resolvedLayout.main.left, resolvedLayout.main.top);
    resolvedLayout.locals.forEach((position, index) => {
      setLocalViewportCanvasPosition(index, position.left, position.top);
    });
    localViewportCanvasLayoutResetPending = false;
    return true;
  }

  function requestLocalViewportCanvasLayoutReset({ clearStored = true } = {}) {
    if (isMultiCanvasWorldLayoutActive()) {
      localViewportCanvasLayoutResetPending = true;
      if (!clearStored) {
        return false;
      }
      const nextState = normalizeLocalViewportCanvasState(
        {
          ...localViewportCanvasState,
          layoutScale: 1,
          positionsRelative: true,
          anchorLeft: null,
          anchorTop: null,
          positions: [],
        },
        localViewportCanvasState
      );
      nextState.anchorLeft = null;
      nextState.anchorTop = null;
      nextState.positions = normalizeLocalViewportCanvasPositions(
        [],
        [],
        nextState.count,
        { relative: true, fallbackRelative: true }
      );
      const changed = (
        nextState.anchorLeft !== localViewportCanvasState.anchorLeft
        || nextState.anchorTop !== localViewportCanvasState.anchorTop
        || JSON.stringify(nextState.positions) !== JSON.stringify(localViewportCanvasState.positions)
      );
      localViewportCanvasState = nextState;
      return changed;
    }
    localViewportCanvasLayoutResetPending = true;
    if (!clearStored) {
      return false;
    }
    const nextState = normalizeLocalViewportCanvasState(
      {
        ...localViewportCanvasState,
        layoutScale: 1,
        positionsRelative: true,
        anchorLeft: null,
        anchorTop: null,
        positions: [],
      },
      localViewportCanvasState
    );
    nextState.anchorLeft = null;
    nextState.anchorTop = null;
    nextState.positions = normalizeLocalViewportCanvasPositions(
      [],
      [],
      nextState.count,
      { relative: true, fallbackRelative: true }
    );
    const changed = (
      nextState.anchorLeft !== localViewportCanvasState.anchorLeft
      || nextState.anchorTop !== localViewportCanvasState.anchorTop
      || JSON.stringify(nextState.positions) !== JSON.stringify(localViewportCanvasState.positions)
    );
    localViewportCanvasState = nextState;
    return changed;
  }

  function getProjectCanvasDocuments() {
    if (!Array.isArray(projectCanvasStore.canvases) || !projectCanvasStore.canvases.length) {
      const fallback = createProjectCanvasDocument({}, { clonePixelData: false, fallbackIndex: 1 });
      projectCanvasStore.canvases = [fallback];
      projectCanvasStore.activeCanvasId = fallback.id;
    } else if (!MULTI_CANVAS_FEATURE_ENABLED && projectCanvasStore.canvases.length > 1) {
      const collapsed = collapseToSingleProjectCanvasSource(
        projectCanvasStore.canvases,
        projectCanvasStore.activeCanvasId
      );
      projectCanvasStore.canvases = collapsed.map((canvas, index) => createProjectCanvasDocument(canvas, {
        clonePixelData: true,
        fallbackIndex: index + 1,
      }));
      projectCanvasStore.activeCanvasId = projectCanvasStore.canvases[0]?.id || '';
    }
    return projectCanvasStore.canvases;
  }

  function getProjectCanvasCount() {
    return getProjectCanvasDocuments().length;
  }

  function getProjectCanvasDocumentAt(index) {
    const canvases = getProjectCanvasDocuments();
    const safeIndex = clamp(Math.round(Number(index) || 0), 0, Math.max(0, canvases.length - 1));
    return canvases[safeIndex] || null;
  }

  function getProjectCanvasDocumentById(canvasId) {
    if (typeof canvasId !== 'string' || !canvasId) {
      return null;
    }
    return getProjectCanvasDocuments().find(canvas => canvas?.id === canvasId) || null;
  }

  function normalizeSharedProjectCanvasId(value = '') {
    return typeof value === 'string' ? value.trim() : '';
  }

  function resetSharedProjectCanvasIdentity({ canonicalCanvasId = '', source = '' } = {}) {
    sharedProjectCanvasAliases.clear();
    activeSharedProjectCanonicalCanvasId = normalizeSharedProjectCanvasId(canonicalCanvasId);
    activeSharedProjectCanvasIdentitySource = activeSharedProjectCanonicalCanvasId
      ? String(source || 'document')
      : '';
  }

  function registerSharedProjectCanvasAlias(aliasCanvasId = '', canonicalCanvasId = activeSharedProjectCanonicalCanvasId) {
    const aliasId = normalizeSharedProjectCanvasId(aliasCanvasId);
    const canonicalId = normalizeSharedProjectCanvasId(canonicalCanvasId);
    if (!aliasId || !canonicalId || aliasId === canonicalId) {
      return false;
    }
    if (sharedProjectCanvasAliases.get(aliasId) === canonicalId) {
      return false;
    }
    sharedProjectCanvasAliases.set(aliasId, canonicalId);
    console.info('[shared-sync]', {
      event: 'shared-canvas-id-alias-registered',
      aliasCanvasId: aliasId,
      canonicalCanvasId: canonicalId,
      projectKey: activeSharedProjectKey || '',
      source: activeSharedProjectCanvasIdentitySource || '',
    });
    return true;
  }

  function getSharedProjectCanonicalCanvasId() {
    const normalizedCanonicalId = normalizeSharedProjectCanvasId(activeSharedProjectCanonicalCanvasId);
    if (normalizedCanonicalId) {
      return normalizedCanonicalId;
    }
    const canvases = getProjectCanvasDocuments();
    if (canvases.length !== 1) {
      return '';
    }
    return normalizeSharedProjectCanvasId(canvases[0]?.id || '');
  }

  function initializeSharedProjectCanvasIdentityFromCurrentDocument({ source = 'document', reset = false } = {}) {
    if (!activeSharedProjectKey || getProjectCanvasCount() !== 1) {
      return false;
    }
    const canvasId = normalizeSharedProjectCanvasId(getProjectCanvasDocumentAt(0)?.id || '');
    if (!canvasId) {
      return false;
    }
    if (!reset && activeSharedProjectCanonicalCanvasId) {
      return false;
    }
    resetSharedProjectCanvasIdentity({
      canonicalCanvasId: canvasId,
      source,
    });
    console.info('[shared-sync]', {
      event: 'shared-canvas-id-canonical-seeded',
      canonicalCanvasId: canvasId,
      projectKey: activeSharedProjectKey || '',
      source,
    });
    return true;
  }

  function resolveSharedProjectCanvasAlias(canvasId = '') {
    const normalizedCanvasId = normalizeSharedProjectCanvasId(canvasId);
    if (!normalizedCanvasId) {
      return '';
    }
    return normalizeSharedProjectCanvasId(sharedProjectCanvasAliases.get(normalizedCanvasId) || '');
  }

  function remapSharedProjectLayerSnapshotCanvasId(previousCanvasId = '', nextCanvasId = '') {
    const previousId = typeof previousCanvasId === 'string' ? previousCanvasId.trim() : '';
    const nextId = typeof nextCanvasId === 'string' ? nextCanvasId.trim() : '';
    if (!previousId || !nextId || previousId === nextId || !sharedProjectLayerSnapshots.size) {
      return false;
    }
    const previousPrefix = `${previousId}\u0000`;
    const nextPrefix = `${nextId}\u0000`;
    const remappedSnapshots = new Map();
    let changed = false;
    sharedProjectLayerSnapshots.forEach((snapshot, key) => {
      if (typeof key === 'string' && key.startsWith(previousPrefix)) {
        remappedSnapshots.set(`${nextPrefix}${key.slice(previousPrefix.length)}`, snapshot);
        changed = true;
      } else {
        remappedSnapshots.set(key, snapshot);
      }
    });
    if (!changed) {
      return false;
    }
    sharedProjectLayerSnapshots.clear();
    remappedSnapshots.forEach((snapshot, key) => {
      sharedProjectLayerSnapshots.set(key, snapshot);
    });
    return true;
  }

  function remapTimelapseSingleCanvasId(previousCanvasId = '', nextCanvasId = '') {
    const previousId = typeof previousCanvasId === 'string' ? previousCanvasId.trim() : '';
    const nextId = typeof nextCanvasId === 'string' ? nextCanvasId.trim() : '';
    if (!previousId || !nextId || previousId === nextId) {
      return false;
    }
    let changed = false;
    const previousTrack = timelapseState.tracksByCanvasId?.[previousId] || null;
    if (previousTrack) {
      const nextTrack = timelapseState.tracksByCanvasId?.[nextId] || null;
      const previousCount = getTimelapseTrackStepCount(previousTrack);
      const nextCount = getTimelapseTrackStepCount(nextTrack);
      if (!nextTrack || previousCount > nextCount) {
        timelapseState.tracksByCanvasId[nextId] = previousTrack;
      }
      delete timelapseState.tracksByCanvasId[previousId];
      changed = true;
    }
    if (timelapseQueuedCanvasIds.has(previousId)) {
      timelapseQueuedCanvasIds.delete(previousId);
      timelapseQueuedCanvasIds.add(nextId);
      changed = true;
    }
    return changed;
  }

  function adoptSingleProjectCanvasId(requestedCanvasId = '') {
    const normalizedCanvasId = normalizeSharedProjectCanvasId(requestedCanvasId);
    if (!normalizedCanvasId) {
      return null;
    }
    const canvases = getProjectCanvasDocuments();
    if (canvases.length !== 1) {
      return null;
    }
    const soleCanvas = canvases[0] || null;
    if (!soleCanvas) {
      return null;
    }
    const currentCanvasId = normalizeSharedProjectCanvasId(soleCanvas.id || '');
    if (currentCanvasId === normalizedCanvasId) {
      if (isSharedProjectCollaborativeMode() && !activeSharedProjectCanonicalCanvasId) {
        initializeSharedProjectCanvasIdentityFromCurrentDocument({ source: 'direct-op' });
      }
      return soleCanvas;
    }
    if (isSharedProjectCollaborativeMode()) {
      let canonicalCanvasId = getSharedProjectCanonicalCanvasId();
      const shouldBootstrapFromIncomingOp = Boolean(
        normalizedCanvasId
        && currentCanvasId
        && currentCanvasId !== normalizedCanvasId
        && (
          !canonicalCanvasId
          || (
            activeSharedProjectCanvasIdentitySource !== 'snapshot'
            && !sharedProjectCanvasAliases.size
          )
        )
      );
      if (shouldBootstrapFromIncomingOp) {
        canonicalCanvasId = normalizedCanvasId;
      }
      if (!canonicalCanvasId) {
        canonicalCanvasId = currentCanvasId || normalizedCanvasId;
      }
      if (currentCanvasId && currentCanvasId !== canonicalCanvasId) {
        registerSharedProjectCanvasAlias(currentCanvasId, canonicalCanvasId);
      }
      if (normalizedCanvasId !== canonicalCanvasId) {
        registerSharedProjectCanvasAlias(normalizedCanvasId, canonicalCanvasId);
      }
      if (currentCanvasId === canonicalCanvasId) {
        activeSharedProjectCanonicalCanvasId = canonicalCanvasId;
        activeSharedProjectCanvasIdentitySource = activeSharedProjectCanvasIdentitySource || 'alias';
        console.info('[shared-sync]', {
          event: 'shared-canvas-id-alias-resolved',
          requestedCanvasId: normalizedCanvasId,
          resolvedCanvasId: canonicalCanvasId,
          projectKey: activeSharedProjectKey || '',
          aliasCount: sharedProjectCanvasAliases.size,
        });
        return soleCanvas;
      }
      activeSharedProjectCanonicalCanvasId = canonicalCanvasId;
      activeSharedProjectCanvasIdentitySource = shouldBootstrapFromIncomingOp ? 'first-server-op' : (activeSharedProjectCanvasIdentitySource || 'canonical');
    }
    const previousCanvasId = currentCanvasId;
    const resolvedCanvasId = isSharedProjectCollaborativeMode()
      ? getSharedProjectCanonicalCanvasId()
      : normalizedCanvasId;
    if (!resolvedCanvasId) {
      return soleCanvas;
    }
    soleCanvas.id = resolvedCanvasId;
    if (projectCanvasStore.activeCanvasId === previousCanvasId || !projectCanvasStore.activeCanvasId) {
      projectCanvasStore.activeCanvasId = resolvedCanvasId;
    }
    if (committedProjectCanvasId === previousCanvasId) {
      committedProjectCanvasId = resolvedCanvasId;
    }
    if (hoveredProjectCanvasId === previousCanvasId) {
      hoveredProjectCanvasId = resolvedCanvasId;
    }
    registerSharedProjectCanvasAlias(previousCanvasId, resolvedCanvasId);
    registerSharedProjectCanvasAlias(normalizedCanvasId, resolvedCanvasId);
    const layerSnapshotsRemapped = remapSharedProjectLayerSnapshotCanvasId(previousCanvasId, resolvedCanvasId);
    const timelapseRemapped = remapTimelapseSingleCanvasId(previousCanvasId, resolvedCanvasId);
    syncProjectCanvasSurfaceDocumentRefs();
    normalizeMultiAssignmentsForCurrentDocument();
    prunePendingMultiAssignmentMoveRequests();
    pruneMultiHistoryCanvases();
    pruneTimelapseTracksToExistingCanvases();
    clearCanvasScreenMetricsCache();
    invalidateFillPreviewCache();
    invalidateOnionSkinCache();
    clearPlaybackFrameCache();
    if (isSharedProjectCollaborativeMode()) {
      resetLocalHistoryForSharedCollaborativeRemoteChange();
      scheduleSessionPersist({ includeSnapshots: false });
      requestRender();
      requestOverlayRender();
    }
    const eventName = isSharedProjectCollaborativeMode()
      ? 'shared-canvas-id-canonicalized'
      : 'adopted-single-canvas-id-fallback';
    console.info('[shared-sync]', {
      event: eventName,
      previousCanvasId,
      requestedCanvasId: normalizedCanvasId,
      resolvedCanvasId,
      projectKey: activeSharedProjectKey || '',
      mutation: true,
      unsafeFallback: false,
      identitySource: activeSharedProjectCanvasIdentitySource || '',
      aliasCount: sharedProjectCanvasAliases.size,
      layerSnapshotsRemapped,
      timelapseRemapped,
    });
    return soleCanvas;
  }

  function getActiveProjectCanvasDocument() {
    return getProjectCanvasDocumentById(projectCanvasStore.activeCanvasId) || getProjectCanvasDocumentAt(0);
  }

  function getActiveProjectCanvasIndex() {
    const activeId = getActiveProjectCanvasDocument()?.id || '';
    return Math.max(0, getProjectCanvasDocuments().findIndex(canvas => canvas?.id === activeId));
  }

  function getProjectCanvasViewScale(canvasDoc, fallback = null) {
    const safeFallback = Number.isFinite(Number(fallback))
      ? Number(fallback)
      : (Number(state.scale) || 8);
    return normalizeProjectCanvasViewScale(canvasDoc?.viewScale, safeFallback);
  }

  function getProjectCanvasDisplayScale(canvasDoc) {
    return getPixelAlignedCanvasDisplayScale(
      normalizeProjectCanvasViewScale(state.scale, getProjectCanvasViewScale(canvasDoc, state.scale || 8))
    );
  }

  function syncStateToProjectCanvasDocument(canvasDoc) {
    if (!canvasDoc) {
      return;
    }
    const width = Math.max(1, Math.round(Number(state.width) || Number(canvasDoc.width) || 1));
    const height = Math.max(1, Math.round(Number(state.height) || Number(canvasDoc.height) || 1));
    canvasDoc.width = width;
    canvasDoc.height = height;
    canvasDoc.viewScale = normalizeProjectCanvasViewScale(state.scale, canvasDoc.viewScale || state.scale || 8);
    canvasDoc.frames = Array.isArray(state.frames) ? state.frames : canvasDoc.frames;
    canvasDoc.activeFrame = clamp(Math.round(Number(state.activeFrame) || 0), 0, Math.max(0, (canvasDoc.frames?.length || 1) - 1));
    canvasDoc.activeLayer = state.activeLayer || canvasDoc.activeLayer || null;
    canvasDoc.mirror = normalizeMirrorAxisState(state.mirror, width, height);
    canvasDoc.selectionMask = state.selectionMask || null;
    canvasDoc.selectionContentMask = state.selectionContentMask || null;
    canvasDoc.selectionBounds = state.selectionBounds ? { ...state.selectionBounds } : null;
  }

  function syncStateFromProjectCanvasDocument(canvasDoc) {
    if (!canvasDoc) {
      return;
    }
    const width = Math.max(1, Math.round(Number(canvasDoc.width) || Number(state.width) || 1));
    const height = Math.max(1, Math.round(Number(canvasDoc.height) || Number(state.height) || 1));
    const frames = Array.isArray(canvasDoc.frames) && canvasDoc.frames.length ? canvasDoc.frames : state.frames;
    state.width = width;
    state.height = height;
    state.frames = frames;
    state.activeFrame = clamp(Math.round(Number(canvasDoc.activeFrame) || 0), 0, Math.max(0, (frames?.length || 1) - 1));
    const activeFrame = frames?.[state.activeFrame] || null;
    state.activeLayer = canvasDoc.activeLayer || activeFrame?.layers?.[activeFrame.layers.length - 1]?.id || null;
    state.mirror = normalizeMirrorAxisState(canvasDoc.mirror || state.mirror, width, height);
    state.selectionMask = canvasDoc.selectionMask || null;
    state.selectionContentMask = canvasDoc.selectionContentMask || null;
    state.selectionBounds = canvasDoc.selectionBounds ? { ...canvasDoc.selectionBounds } : null;
  }

  function storeProjectCanvasViewScale(canvasDoc, scale = state.scale) {
    const normalizedScale = normalizeProjectCanvasViewScale(scale, state.scale || 8);
    const canvases = getProjectCanvasDocuments();
    if (!canvases.length) {
      return;
    }
    canvases.forEach(doc => {
      if (doc) {
        doc.viewScale = normalizedScale;
      }
    });
  }

  function syncActiveProjectCanvasViewScale() {
    storeProjectCanvasViewScale(getActiveProjectCanvasDocument(), state.scale);
  }

  function replaceProjectCanvasDocuments(canvases, activeCanvasId = '', { preserveIncomingIds = false } = {}) {
    const sourceCanvases = collapseToSingleProjectCanvasSource(canvases, activeCanvasId);
    const currentCanvases = Array.isArray(projectCanvasStore.canvases) ? projectCanvasStore.canvases : [];
    const currentSingleCanvasId = typeof currentCanvases[0]?.id === 'string' ? currentCanvases[0].id.trim() : '';
    const incomingSingleCanvasId = typeof sourceCanvases[0]?.id === 'string' ? sourceCanvases[0].id.trim() : '';
    const sharedStableSingleCanvasId = (
      isSharedProjectCollaborativeMode()
      && !preserveIncomingIds
      && currentCanvases.length === 1
      && sourceCanvases.length === 1
      && currentSingleCanvasId
      && !incomingSingleCanvasId
    )
      ? currentSingleCanvasId
      : '';
    const normalizedSourceCanvases = sharedStableSingleCanvasId
      ? sourceCanvases.map((canvas, index) => (
        index === 0
          ? { ...canvas, id: sharedStableSingleCanvasId }
          : canvas
      ))
      : sourceCanvases;
    const normalizedActiveCanvasId = sharedStableSingleCanvasId || activeCanvasId;
    projectCanvasStore.canvases = normalizedSourceCanvases.map((canvas, index) => createProjectCanvasDocument(canvas, {
      clonePixelData: true,
      fallbackIndex: index + 1,
    }));
    const nextActive = projectCanvasStore.canvases.find(canvas => canvas?.id === normalizedActiveCanvasId) || projectCanvasStore.canvases[0];
    projectCanvasStore.activeCanvasId = nextActive?.id || projectCanvasStore.canvases[0]?.id || '';
    if (isSharedProjectCollaborativeMode() && projectCanvasStore.canvases.length === 1) {
      const nextSingleCanvasId = normalizeSharedProjectCanvasId(projectCanvasStore.canvases[0]?.id || '');
      if (nextSingleCanvasId) {
        const previousCanonicalId = activeSharedProjectCanonicalCanvasId;
        resetSharedProjectCanvasIdentity({
          canonicalCanvasId: nextSingleCanvasId,
          source: incomingSingleCanvasId ? 'snapshot' : 'document',
        });
        if (currentSingleCanvasId && currentSingleCanvasId !== nextSingleCanvasId) {
          registerSharedProjectCanvasAlias(currentSingleCanvasId, nextSingleCanvasId);
        }
        if (previousCanonicalId && previousCanonicalId !== nextSingleCanvasId) {
          registerSharedProjectCanvasAlias(previousCanonicalId, nextSingleCanvasId);
        }
      }
    }
    const activeIndex = getActiveProjectCanvasIndex();
    localViewportCanvasState = normalizeLocalViewportCanvasState(
      {
        ...localViewportCanvasState,
        count: Math.max(0, projectCanvasStore.canvases.length - 1),
        selectedKind: activeIndex === 0 ? 'main' : 'local',
        selectedIndex: activeIndex > 0 ? activeIndex - 1 : -1,
      },
      localViewportCanvasState
    );
    const sharedScale = normalizeProjectCanvasViewScale(nextActive?.viewScale, state.scale || MIN_ZOOM_SCALE);
    projectCanvasStore.canvases.forEach(canvas => {
      if (canvas) {
        canvas.viewScale = sharedScale;
      }
    });
    normalizeMultiAssignmentsForCurrentDocument();
    prunePendingMultiAssignmentMoveRequests();
    pruneMultiHistoryCanvases();
    pruneTimelapseTracksToExistingCanvases();
    committedProjectCanvasId = getActiveProjectCanvasDocument()?.id || committedProjectCanvasId || '';
    hoveredProjectCanvasId = '';
    clearCanvasScreenMetricsCache();
    invalidateFillPreviewCache();
    invalidateOnionSkinCache();
    clearPlaybackFrameCache();
  }

  function collectCanvasDocumentIdentitySummary(canvases = []) {
    const canvasIds = [];
    const frameIds = [];
    const layerIds = [];
    (Array.isArray(canvases) ? canvases : []).forEach(canvas => {
      if (canvas?.id) {
        canvasIds.push(canvas.id);
      }
      (Array.isArray(canvas?.frames) ? canvas.frames : []).forEach(frame => {
        if (frame?.id) {
          frameIds.push(frame.id);
        }
        (Array.isArray(frame?.layers) ? frame.layers : []).forEach(layer => {
          if (layer?.id) {
            layerIds.push(layer.id);
          }
        });
      });
    });
    return { canvasIds, frameIds, layerIds };
  }

  function compareSharedProjectSnapshotIdentity(snapshot, { projectKey = '', projectId = '', snapshotRevision = 0, latestRevision = 0 } = {}) {
    const snapshotCanvases = Array.isArray(snapshot?.canvases) && snapshot.canvases.length
      ? snapshot.canvases
      : [{
        id: typeof snapshot?.activeCanvasId === 'string' ? snapshot.activeCanvasId : '',
        frames: Array.isArray(snapshot?.frames) ? snapshot.frames : [],
      }];
    const snapshotIdentity = collectCanvasDocumentIdentitySummary(snapshotCanvases);
    const localIdentity = collectCanvasDocumentIdentitySummary(getProjectCanvasDocuments());
    const mismatchReasons = [];
    if (snapshotIdentity.canvasIds.length !== localIdentity.canvasIds.length) {
      mismatchReasons.push('canvas-count-mismatch');
    }
    if (snapshotIdentity.frameIds.length !== localIdentity.frameIds.length) {
      mismatchReasons.push('frame-count-mismatch');
    }
    if (snapshotIdentity.layerIds.length !== localIdentity.layerIds.length) {
      mismatchReasons.push('layer-count-mismatch');
    }
    snapshotIdentity.canvasIds.forEach(canvasId => {
      if (!localIdentity.canvasIds.includes(canvasId)) {
        mismatchReasons.push('canvas-id-regenerated');
      }
    });
    snapshotIdentity.frameIds.forEach(frameId => {
      if (!localIdentity.frameIds.includes(frameId)) {
        mismatchReasons.push('frame-id-regenerated');
      }
    });
    snapshotIdentity.layerIds.forEach(layerId => {
      if (!localIdentity.layerIds.includes(layerId)) {
        mismatchReasons.push('layer-id-regenerated');
      }
    });
    const mismatch = mismatchReasons.length > 0;
    console.info('[shared-sync]', {
      event: mismatch ? 'shared-document-identity-mismatch' : 'shared-project-identity-check',
      projectKey: projectKey || activeSharedProjectKey || '',
      projectId: projectId || activeSharedProjectId || '',
      snapshotRevision: Math.max(0, Math.round(Number(snapshotRevision) || 0)),
      latestRevision: Math.max(0, Math.round(Number(latestRevision) || 0)),
      snapshotCanvasIds: snapshotIdentity.canvasIds,
      localCanvasIds: localIdentity.canvasIds,
      activeCanvasId: getActiveProjectCanvasDocument()?.id || '',
      snapshotFrameIds: snapshotIdentity.frameIds,
      localFrameIds: localIdentity.frameIds,
      snapshotLayerIds: snapshotIdentity.layerIds,
      localLayerIds: localIdentity.layerIds,
      mismatch,
      mismatchReason: mismatchReasons,
    });
    return {
      mismatch,
      mismatchReasons,
      snapshotIdentity,
      localIdentity,
    };
  }

  function createBlankProjectCanvasDocument(sourceCanvas = getActiveProjectCanvasDocument(), index = getProjectCanvasCount() + 1) {
    const width = Math.max(1, Math.round(Number(sourceCanvas?.width) || Number(state.width) || DEFAULT_CANVAS_SIZE));
    const height = Math.max(1, Math.round(Number(sourceCanvas?.height) || Number(state.height) || DEFAULT_CANVAS_SIZE));
    const layer = createLayer(getDefaultLayerName(1), width, height);
    const frame = createFrame(getDefaultFrameName(1), [layer], width, height, { copyPixels: false });
    return createProjectCanvasDocument({
      name: getDefaultProjectCanvasName(index),
      width,
      height,
      viewScale: normalizeProjectCanvasViewScale(state.scale, state.scale || 8),
      frames: [frame],
      activeFrame: 0,
      activeLayer: frame.layers[frame.layers.length - 1]?.id || null,
      mirror: normalizeMirrorAxisState(sourceCanvas?.mirror || state.mirror, width, height),
    }, { clonePixelData: false, fallbackIndex: index });
  }

  function ensureCanvasSurfaceContexts(surface) {
    if (!surface) {
      return;
    }
    if (surface.drawing instanceof HTMLCanvasElement && !surface.drawingCtx) {
      surface.drawingCtx = surface.drawing.getContext('2d', { willReadFrequently: true }) || surface.drawing.getContext('2d');
      if (surface.drawingCtx) surface.drawingCtx.imageSmoothingEnabled = false;
    }
    if (surface.overlay instanceof HTMLCanvasElement && !surface.overlayCtx) {
      surface.overlayCtx = surface.overlay.getContext('2d', { willReadFrequently: true }) || surface.overlay.getContext('2d');
      if (surface.overlayCtx) surface.overlayCtx.imageSmoothingEnabled = false;
    }
    if (surface.selection instanceof HTMLCanvasElement && !surface.selectionCtx) {
      surface.selectionCtx = surface.selection.getContext('2d', { willReadFrequently: true }) || surface.selection.getContext('2d');
      if (surface.selectionCtx) surface.selectionCtx.imageSmoothingEnabled = false;
    }
  }

  function bindActiveCanvasSurface(surface) {
    const resolvedSurface = surface || mainViewportCanvasSurface;
    syncProjectCanvasSurfaceDocumentRefs();
    ensureCanvasSurfaceContexts(resolvedSurface);
    activeCanvasSurface = resolvedSurface;
    const resolvedCanvasDoc = resolvedSurface.kind === 'local'
      ? getProjectCanvasDocumentForEntry(resolvedSurface)
      : getProjectCanvasDocumentAt(0);
    resolvedSurface.canvasDoc = resolvedCanvasDoc;
    resolvedSurface.canvasDocId = resolvedCanvasDoc?.id || '';
    if (resolvedSurface.stack instanceof HTMLElement) {
      resolvedSurface.stack.style.transform = 'none';
    }
    dom.canvases.stack = resolvedSurface.stack;
    dom.canvases.drawing = resolvedSurface.drawing;
    dom.canvases.overlay = resolvedSurface.overlay;
    dom.canvases.selection = resolvedSurface.selection;
    ctx.drawing = resolvedSurface.drawingCtx;
    ctx.overlay = resolvedSurface.overlayCtx;
    ctx.selection = resolvedSurface.selectionCtx;
    clearCanvasScreenMetricsCache();
    updateCanvasResizeHandlePosition();
    syncCanvasResizeHandleVisibility();
  }

  function bindCanvasSurfaceInteractionEvents(canvas) {
    if (!(canvas instanceof HTMLCanvasElement) || canvas.dataset.pointerBinding === 'true') {
      return;
    }
    canvas.dataset.pointerBinding = 'true';
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointercancel', handlePointerCancel);
    canvas.addEventListener('pointermove', event => {
      let needsRender = false;
      if (!pointerState.active) {
        const hoverSurface = getCanvasInteractionSurfaceFromTarget(event.currentTarget instanceof Element ? event.currentTarget : event.target);
        if (hoverSurface?.canvasDocId) {
          previewProjectCanvasSelection(hoverSurface);
        }
        if (updateSelectionTransformHandleHover(event.clientX, event.clientY)) {
          needsRender = true;
        }
      }
      if (pointerState.active) return;
      const controllingTouch = state.showVirtualCursor
        && event.pointerType === 'touch'
        && virtualCursorControl.pointerId === event.pointerId;
      if (controllingTouch) {
        event.preventDefault();
        updateVirtualCursorFromControlDelta(event);
        return;
      }
      updateVirtualCursorFromEvent(event);
      const awaitingLineEnd = curveBuilder && curveBuilder.stage === 'line' && curveBuilder.awaitingEndPoint && curveBuilder.start;
      const position = getPointerPosition(event);

      if (awaitingLineEnd) {
        const start = curveBuilder.start;
        if (start && position) {
          const prev = pointerState.preview;
          if (!prev || prev.end?.x !== position.x || prev.end?.y !== position.y) {
            pointerState.preview = { start, end: position };
            needsRender = true;
          }
          if (pointerState.tool !== 'curve') {
            pointerState.tool = 'curve';
            needsRender = true;
          }
          if (hoverPixel) {
            hoverPixel = null;
            needsRender = true;
          }
        } else {
          if (pointerState.preview) {
            pointerState.preview = null;
            needsRender = true;
          }
          if (pointerState.tool === 'curve') {
            pointerState.tool = null;
            needsRender = true;
          }
          if (hoverPixel) {
            hoverPixel = null;
            needsRender = true;
          }
        }
        if (needsRender) {
          requestOverlayRender();
        }
        return;
      }

      if (pointerState.preview && pointerState.tool === 'curve') {
        pointerState.preview = null;
        pointerState.tool = null;
        requestOverlayRender();
      }

      if (!position) {
        if (hoverPixel) {
          hoverPixel = null;
          needsRender = true;
        }
        if (needsRender) {
          requestOverlayRender();
        }
        return;
      }
      if (!hoverPixel || hoverPixel.x !== position.x || hoverPixel.y !== position.y) {
        hoverPixel = position;
        needsRender = true;
      }
      if (needsRender) {
        requestOverlayRender();
      }
    });
    canvas.addEventListener('pointerleave', event => {
      const relatedTarget = event.relatedTarget instanceof Element ? event.relatedTarget : null;
      if (!pointerState.active && (!relatedTarget || !isCanvasSurfaceTarget(relatedTarget))) {
        clearHoveredProjectCanvas();
      }
      let needsRender = false;
      if (setSelectionTransformHoverHandle('')) {
        needsRender = true;
      }
      if (hoverPixel) {
        hoverPixel = null;
        needsRender = true;
      }
      if (curveBuilder && curveBuilder.stage === 'line' && curveBuilder.awaitingEndPoint && pointerState.preview) {
        pointerState.preview = null;
        pointerState.tool = null;
        needsRender = true;
      }
      if (needsRender) {
        requestOverlayRender();
      }
    });
    canvas.addEventListener('contextmenu', event => event.preventDefault());
  }

  function teardownCanvasSurfacePanelDragInteraction() {
    window.removeEventListener('pointermove', handleCanvasSurfacePanelDragPointerMove);
    window.removeEventListener('pointerup', handleCanvasSurfacePanelDragPointerUp);
    window.removeEventListener('pointercancel', handleCanvasSurfacePanelDragPointerCancel);
  }

  function stopCanvasSurfacePanelDragInteraction({ persist = true } = {}) {
    if (!canvasSurfacePanelDragState.panel) {
      return;
    }
    const panel = canvasSurfacePanelDragState.panel;
    if (panel instanceof HTMLElement) {
      panel.classList.remove('is-moving');
    }
    document.body.classList.remove('is-canvas-surface-moving');
    const target = canvasSurfacePanelDragState.target;
    if (target instanceof HTMLElement && Number.isFinite(canvasSurfacePanelDragState.pointerId)) {
      try {
        target.releasePointerCapture?.(canvasSurfacePanelDragState.pointerId);
      } catch (error) {
        // Ignore pointer capture release failures.
      }
    }
    const shouldPersist = persist && (
      canvasSurfacePanelDragState.surfaceKind === 'main'
      || canvasSurfacePanelDragState.surfaceKind === 'local'
    );
    let layoutChanged = false;
    if (shouldPersist && panel instanceof HTMLElement) {
      const finalLeft = parseLocalViewportCanvasAxis(panel.style.left, panel.offsetLeft) || 0;
      const finalTop = parseLocalViewportCanvasAxis(panel.style.top, panel.offsetTop) || 0;
      if (canvasSurfacePanelDragState.surfaceKind === 'main') {
        layoutChanged = setLocalViewportCanvasLayoutAnchor(finalLeft, finalTop);
      } else if (canvasSurfacePanelDragState.surfaceKind === 'local') {
        layoutChanged = setLocalViewportCanvasPosition(canvasSurfacePanelDragState.surfaceIndex, finalLeft, finalTop);
      }
    }
    canvasSurfacePanelDragState.pointerId = null;
    canvasSurfacePanelDragState.surfaceKind = '';
    canvasSurfacePanelDragState.surfaceIndex = -1;
    canvasSurfacePanelDragState.target = null;
    canvasSurfacePanelDragState.panel = null;
    canvasSurfacePanelDragState.pointerOffsetX = 0;
    canvasSurfacePanelDragState.pointerOffsetY = 0;
    canvasSurfacePanelDragState.startClientX = 0;
    canvasSurfacePanelDragState.startClientY = 0;
    teardownCanvasSurfacePanelDragInteraction();
    if (shouldPersist) {
      if (layoutChanged) {
        markAutosaveDirty();
        markDocumentUnsavedChange();
      }
      scheduleSessionPersist({ includeSnapshots: layoutChanged });
    }
    syncLocalViewportCanvasDockLayout();
    updateCanvasResizeHandlePosition();
    syncCanvasResizeHandleVisibility();
    scheduleMirrorGuideRefresh();
  }

  function beginCanvasSurfacePanelDragInteraction(event, surface) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    const panel = surface?.panel instanceof HTMLElement ? surface.panel : null;
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    if (!panel || !target || canvasSurfacePanelDragState.panel) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    canvasSurfacePanelDragState.pointerId = event.pointerId ?? -1;
    canvasSurfacePanelDragState.surfaceKind = surface?.kind === 'local' ? 'local' : 'main';
    canvasSurfacePanelDragState.surfaceIndex = canvasSurfacePanelDragState.surfaceKind === 'local'
      ? Math.max(0, Math.round(Number(surface?.index) || 0))
      : 0;
    canvasSurfacePanelDragState.target = target;
    canvasSurfacePanelDragState.panel = panel;
    const panelRect = panel.getBoundingClientRect();
    canvasSurfacePanelDragState.pointerOffsetX = (Number(event.clientX) || 0) - panelRect.left;
    canvasSurfacePanelDragState.pointerOffsetY = (Number(event.clientY) || 0) - panelRect.top;
    canvasSurfacePanelDragState.startClientX = Number(event.clientX) || 0;
    canvasSurfacePanelDragState.startClientY = Number(event.clientY) || 0;
    panel.classList.add('is-moving');
    document.body.classList.add('is-canvas-surface-moving');
    scheduleMirrorGuideRefresh();
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Ignore pointer capture failures.
    }
    window.addEventListener('pointermove', handleCanvasSurfacePanelDragPointerMove, { passive: false });
    window.addEventListener('pointerup', handleCanvasSurfacePanelDragPointerUp);
    window.addEventListener('pointercancel', handleCanvasSurfacePanelDragPointerCancel);
  }

  function handleCanvasSurfacePanelDragPointerMove(event) {
    if (canvasSurfacePanelDragState.pointerId !== event.pointerId) {
      return;
    }
    const panel = canvasSurfacePanelDragState.panel;
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const workspaceRect = dom.viewportWorkspace?.getBoundingClientRect?.();
    if (!workspaceRect) {
      return;
    }
    const nextLeft = Math.round((Number(event.clientX) || 0) - workspaceRect.left - canvasSurfacePanelDragState.pointerOffsetX);
    const nextTop = Math.round((Number(event.clientY) || 0) - workspaceRect.top - canvasSurfacePanelDragState.pointerOffsetY);
    panel.style.left = `${nextLeft}px`;
    panel.style.top = `${nextTop}px`;
    if (canvasSurfacePanelDragState.surfaceKind === 'main') {
      return;
    }
    setLocalViewportCanvasPosition(canvasSurfacePanelDragState.surfaceIndex, nextLeft, nextTop);
  }

  function handleCanvasSurfacePanelDragPointerUp(event) {
    if (canvasSurfacePanelDragState.pointerId !== event.pointerId) {
      return;
    }
    stopCanvasSurfacePanelDragInteraction({ persist: true });
  }

  function handleCanvasSurfacePanelDragPointerCancel(event) {
    if (canvasSurfacePanelDragState.pointerId !== event.pointerId) {
      return;
    }
    stopCanvasSurfacePanelDragInteraction({ persist: true });
  }

  function ensureCanvasSurfaceDragHandle(surface) {
    const panel = surface?.panel instanceof HTMLElement ? surface.panel : null;
    if (!panel) {
      return null;
    }
    if (surface.dragHandle instanceof HTMLButtonElement && surface.dragHandle.isConnected) {
      return surface.dragHandle;
    }
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'canvas-surface-drag-handle';
    handle.setAttribute(
      'aria-label',
      localizeText('ドラッグして配置を移動', 'Drag to reposition')
    );
    handle.title = localizeText('ドラッグして配置を移動', 'Drag to reposition');
    handle.hidden = true;
    handle.setAttribute('aria-hidden', 'true');
    handle.addEventListener('pointerdown', event => {
      beginCanvasSurfacePanelDragInteraction(event, surface);
    });
    handle.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
    });
    panel.appendChild(handle);
    surface.dragHandle = handle;
    return handle;
  }

  function createLocalViewportCanvasEntry(index) {
    const panel = document.createElement('section');
    panel.className = 'local-canvas-surface';
    panel.dataset.localCanvasIndex = String(index);
    panel.setAttribute('aria-label', localizeText(`マルチキャンバス ${index + 2}`, `Multi Canvas ${index + 2}`));

    const badge = document.createElement('div');
    badge.className = 'canvas-surface-badge';
    badge.hidden = true;
    badge.setAttribute('aria-hidden', 'true');

    const stack = document.createElement('div');
    stack.className = 'canvas-stack local-canvas-stack';

    const drawing = document.createElement('canvas');
    drawing.className = 'local-canvas-surface__canvas';
    drawing.setAttribute('aria-label', localizeText(`マルチキャンバス ${index + 2}`, `Multi Canvas ${index + 2}`));

    const overlay = document.createElement('canvas');
    overlay.className = 'local-canvas-surface__overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const selection = document.createElement('canvas');
    selection.className = 'local-canvas-surface__selection';
    selection.setAttribute('aria-hidden', 'true');

    stack.appendChild(drawing);
    stack.appendChild(overlay);
    stack.appendChild(selection);
    panel.appendChild(badge);
    panel.appendChild(stack);
    const entry = {
      kind: 'local',
      index,
      panel,
      body: panel,
      badge,
      stack,
      drawing,
      overlay,
      selection,
      drawingCtx: null,
      overlayCtx: null,
      selectionCtx: null,
      canvasDoc: null,
      canvasDocId: '',
      dragHandle: null,
    };
    ensureCanvasSurfaceDragHandle(entry);
    bindCanvasSurfaceInteractionEvents(drawing);
    return entry;
  }

  function getProjectCanvasDocumentForEntry(entry) {
    if (!entry || typeof entry.index !== 'number') {
      return null;
    }
    return getProjectCanvasDocumentAt(entry.index + 1);
  }

  function getProjectCanvasSurfaceEntries() {
    return [mainViewportCanvasSurface, ...localViewportCanvasEntries];
  }

  function getProjectCanvasSurfaceForIndex(index) {
    return index === 0 ? mainViewportCanvasSurface : (localViewportCanvasEntries[index - 1] || null);
  }

  function getProjectCanvasSurfaceByCanvasId(canvasId = '') {
    const normalizedId = typeof canvasId === 'string' ? canvasId : '';
    if (!normalizedId) {
      return null;
    }
    return getProjectCanvasSurfaceEntries().find(surface => surface?.canvasDocId === normalizedId) || null;
  }

  function syncProjectCanvasSurfaceDocumentRefs() {
    const documents = getProjectCanvasDocuments();
    mainViewportCanvasSurface.canvasDoc = documents[0] || null;
    mainViewportCanvasSurface.canvasDocId = mainViewportCanvasSurface.canvasDoc?.id || '';
    localViewportCanvasEntries.forEach((entry, index) => {
      const canvasDoc = documents[index + 1] || null;
      entry.canvasDoc = canvasDoc;
      entry.canvasDocId = canvasDoc?.id || '';
    });
  }

  function getCanvasInteractionSurfaceMetrics(surface) {
    const resolvedSurface = getResolvedCanvasInteractionSurface(surface || null);
    const canvasDoc = resolvedSurface?.canvasDoc || getProjectCanvasDocumentById(resolvedSurface?.canvasDocId);
    const width = Math.max(1, Math.round(Number(canvasDoc?.width) || Number(state.width) || 1));
    const height = Math.max(1, Math.round(Number(canvasDoc?.height) || Number(state.height) || 1));
    return {
      surface: resolvedSurface,
      width,
      height,
    };
  }

  function setCanvasSurfaceDragHandleVisible(handle, visible) {
    if (!(handle instanceof HTMLElement)) {
      return;
    }
    handle.hidden = !visible;
    handle.setAttribute('aria-hidden', String(!visible));
  }

  function syncMultiCanvasSelectionUi() {
    const activeIndex = getActiveProjectCanvasIndex();
    const hoveredCanvasId = hoveredProjectCanvasId;
    const committedCanvasId = committedProjectCanvasId;
    const mainCanvasId = getProjectCanvasDocumentAt(0)?.id || '';
    const mainIsPreview = Boolean(hoveredCanvasId && hoveredCanvasId === mainCanvasId && hoveredCanvasId !== committedCanvasId);
    const multiCanvasVisible = getLocalViewportCanvasCount() > 0;
    if (dom.mainCanvasArea instanceof HTMLElement) {
      dom.mainCanvasArea.classList.toggle('is-multi-canvas-selected', activeIndex === 0 && !mainIsPreview);
      dom.mainCanvasArea.classList.toggle('is-multi-canvas-hover-preview', mainIsPreview);
    }
    setCanvasSurfaceDragHandleVisible(
      mainViewportCanvasSurface.dragHandle,
      multiCanvasVisible && activeIndex === 0 && !mainIsPreview
    );
    localViewportCanvasEntries.forEach(entry => {
      const isPreview = Boolean(
        hoveredCanvasId
        && hoveredCanvasId === entry.canvasDocId
        && hoveredCanvasId !== committedCanvasId
      );
      entry.panel.classList.toggle('is-active', activeIndex === entry.index + 1 && !isPreview);
      entry.panel.classList.toggle('is-hover-preview', isPreview);
      setCanvasSurfaceDragHandleVisible(
        entry.dragHandle,
        multiCanvasVisible && activeIndex === entry.index + 1 && !isPreview
      );
    });
    syncLocalViewportCanvasEntryMetadata();
  }

  function setHoveredProjectCanvasById(canvasId = '') {
    const normalizedId = typeof canvasId === 'string' ? canvasId : '';
    if (hoveredProjectCanvasId === normalizedId) {
      return;
    }
    hoveredProjectCanvasId = normalizedId;
    syncMultiCanvasSelectionUi();
  }

  function previewProjectCanvasSelection(surface) {
    const canvasId = surface?.canvasDocId || surface?.canvasDoc?.id || '';
    if (!canvasId) {
      return false;
    }
    setHoveredProjectCanvasById(canvasId);
    return false;
  }

  function commitPreviewProjectCanvasSelection({ persist = false, flushUi = false } = {}) {
    committedProjectCanvasId = getActiveProjectCanvasDocument()?.id || committedProjectCanvasId || '';
    hoveredProjectCanvasId = '';
    if (flushUi) {
      flushActiveProjectCanvasUiSync({ persist });
    } else {
      syncMultiCanvasSelectionUi();
      if (persist) {
        scheduleSessionPersist();
      }
    }
  }

  function clearHoveredProjectCanvas({ restoreCommitted = true } = {}) {
    if (pointerState.active) {
      return;
    }
    hoveredProjectCanvasId = '';
    syncMultiCanvasSelectionUi();
  }

  function finalizePendingSelectionBeforeCanvasSwitch(targetCanvasId = '') {
    const nextCanvasId = typeof targetCanvasId === 'string' ? targetCanvasId : '';
    const activeCanvasId = getActiveProjectCanvasDocument()?.id || '';
    if (!nextCanvasId || nextCanvasId === activeCanvasId) {
      return true;
    }
    if (!getPendingSelectionMoveState()) {
      return true;
    }
    return confirmPendingSelectionMove({ allowOutOfBoundsClip: true });
  }

  function setActiveProjectCanvasByIndex(index, { persist = true, syncUi = true } = {}) {
    const targetCanvas = getProjectCanvasDocumentAt(index);
    if (!targetCanvas) {
      return false;
    }
    const previousCanvas = getActiveProjectCanvasDocument();
    const previousSurface = activeCanvasSurface;
    const previousId = projectCanvasStore.activeCanvasId;
    // Switching the active canvas must not recenter the shared world. Safari
    // landscape can issue visualViewport work adjacent to this pointer event.
    const preservedMultiCanvasPan = isMultiCanvasWorldLayoutActive()
      ? { x: Number(state.pan.x) || 0, y: Number(state.pan.y) || 0 }
      : null;
    const changed = previousId !== targetCanvas.id;
    if (!changed) {
      if (syncUi) {
        syncMultiCanvasSelectionUi();
      }
      return false;
    }
    if (previousSurface && previousCanvas) {
      syncStateToProjectCanvasDocument(previousCanvas);
      markProjectCanvasSurfaceRendered(previousSurface, previousCanvas);
    }
    projectCanvasStore.activeCanvasId = targetCanvas.id;
    syncStateFromProjectCanvasDocument(targetCanvas);
    localViewportCanvasState = normalizeLocalViewportCanvasState(
      {
        ...localViewportCanvasState,
        count: Math.max(0, getProjectCanvasCount() - 1),
        selectedKind: index === 0 ? 'main' : 'local',
        selectedIndex: index > 0 ? index - 1 : -1,
      },
      localViewportCanvasState
    );
    bindActiveCanvasSurface(getProjectCanvasSurfaceForIndex(index) || mainViewportCanvasSurface);
    invalidateFillPreviewCache();
    invalidateOnionSkinCache();
    clearPlaybackFrameCache();
    if (syncUi) {
      pendingProjectCanvasUiSync = false;
      resizeCanvases({
        forceRender: false,
        applyTransform: false,
        syncControls: false,
        updateScaleLimits: false,
        renderLocalViewports: false,
        syncLocalViewportDock: false,
      });
      syncAllProjectCanvasSurfaceDimensions();
      renderFrameList();
      renderLayerList();
      syncControlsWithState();
      requestRender();
      requestOverlayRender();
      syncMultiCanvasSelectionUi();
    } else {
      pendingProjectCanvasUiSync = true;
      syncMultiCanvasSelectionUi();
    }
    if (preservedMultiCanvasPan) {
      state.pan.x = preservedMultiCanvasPan.x;
      state.pan.y = preservedMultiCanvasPan.y;
      syncMultiCanvasWorldLayoutDisplayPositions();
      applyViewportTransform();
    }
    updateHistoryButtons();
    if (persist) {
      scheduleSessionPersist();
    }
    return changed;
  }

  function flushActiveProjectCanvasUiSync({ persist = true } = {}) {
    if (!pendingProjectCanvasUiSync) {
      return;
    }
    pendingProjectCanvasUiSync = false;
    resizeCanvases({
      forceRender: false,
      applyTransform: false,
      syncControls: false,
      updateScaleLimits: false,
      renderLocalViewports: false,
      syncLocalViewportDock: false,
    });
    syncAllProjectCanvasSurfaceDimensions();
    renderFrameList();
    renderLayerList();
    syncControlsWithState();
    requestRender();
    requestOverlayRender();
    syncMultiCanvasSelectionUi();
    updateHistoryButtons();
    if (persist) {
      scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
    }
  }

  function setSelectedMultiCanvas(kind = 'main', index = -1, { persist = true } = {}) {
    const targetIndex = kind === 'local'
      ? clamp(Math.round(Number(index) || 0) + 1, 0, Math.max(0, getProjectCanvasCount() - 1))
      : 0;
    setActiveProjectCanvasByIndex(targetIndex, { persist });
  }

  function syncLocalViewportCanvasEntryMetadata() {
    const selectedCanvasId = getActiveProjectCanvasDocument()?.id || '';
    const previewCanvasId = hoveredProjectCanvasId;
    const committedCanvasId = committedProjectCanvasId;
    localViewportCanvasEntries.forEach(entry => {
      const canvasDoc = getProjectCanvasDocumentForEntry(entry);
      entry.canvasDoc = canvasDoc;
      entry.canvasDocId = canvasDoc?.id || '';
      entry.panel.classList.toggle('is-empty', !canvasDoc);
      entry.panel.classList.toggle(
        'is-active',
        Boolean(canvasDoc && canvasDoc.id === selectedCanvasId && canvasDoc.id !== previewCanvasId)
      );
      entry.panel.classList.toggle(
        'is-hover-preview',
        Boolean(canvasDoc && previewCanvasId && canvasDoc.id === previewCanvasId && canvasDoc.id !== committedCanvasId)
      );
      const displayLabel = getVoxelCanvasDisplayLabel(canvasDoc);
      const panelLabel = isVoxelExtensionModeEnabled()
        ? localizeText(`入力面 ${entry.index + 1}: ${displayLabel}`, `Input Face ${entry.index + 1}: ${displayLabel}`)
        : (canvasDoc
          ? localizeText(`マルチキャンバス ${entry.index + 2}: ${canvasDoc.name}`, `Multi Canvas ${entry.index + 2}: ${canvasDoc.name}`)
          : localizeText(`マルチキャンバス ${entry.index + 2}: なし`, `Multi Canvas ${entry.index + 2}: empty`));
      entry.panel.title = panelLabel;
      entry.panel.setAttribute('aria-label', panelLabel);
      if (entry.drawing instanceof HTMLCanvasElement) {
        entry.drawing.setAttribute('aria-label', panelLabel);
      }
      if (entry.badge instanceof HTMLElement) {
        const role = getVoxelExtensionCanvasRoleById(entry.canvasDocId || '');
        if (role) {
          entry.badge.hidden = false;
          entry.badge.dataset.role = role;
          entry.badge.textContent = getVoxelExtensionRoleLabel(role);
        } else {
          entry.badge.hidden = true;
          delete entry.badge.dataset.role;
          entry.badge.textContent = '';
        }
      }
    });
    syncVoxelExtensionCanvasBadges();
  }

  function getProjectCanvasFrameAt(canvasDoc, frameIndex = null) {
    if (!canvasDoc || !Array.isArray(canvasDoc.frames) || !canvasDoc.frames.length) {
      return null;
    }
    if (getProjectCanvasCount() <= 1) {
      const singleFrames = Array.isArray(state.frames) ? state.frames : canvasDoc.frames;
      if (!singleFrames.length) {
        return null;
      }
      const resolvedSingleFrameIndex = Number.isFinite(Number(frameIndex))
        ? clamp(Math.round(Number(frameIndex)), 0, singleFrames.length - 1)
        : clamp(Math.round(Number(state.activeFrame) || 0), 0, singleFrames.length - 1);
      return singleFrames[resolvedSingleFrameIndex] || singleFrames[0] || null;
    }
    const isActiveCanvas = Boolean(canvasDoc?.id) && canvasDoc.id === (getActiveProjectCanvasDocument()?.id || '');
    const resolvedFrameIndex = Number.isFinite(Number(frameIndex))
      ? clamp(Math.round(Number(frameIndex)), 0, canvasDoc.frames.length - 1)
      : clamp(
        Math.round(Number(isActiveCanvas ? state.activeFrame : canvasDoc.activeFrame) || 0),
        0,
        canvasDoc.frames.length - 1
      );
    return canvasDoc.frames[resolvedFrameIndex] || canvasDoc.frames[0] || null;
  }

  function getProjectCanvasActiveFrame(canvasDoc) {
    return getProjectCanvasFrameAt(canvasDoc);
  }

  function getProjectCanvasActiveLayer(canvasDoc) {
    const frame = getProjectCanvasActiveFrame(canvasDoc);
    if (!frame || !Array.isArray(frame.layers) || !frame.layers.length) {
      return null;
    }
    const preferredLayerId = (canvasDoc?.id && canvasDoc.id === (getActiveProjectCanvasDocument()?.id || ''))
      ? state.activeLayer
      : canvasDoc?.activeLayer;
    return frame.layers.find(layer => layer?.id === preferredLayerId)
      || frame.layers[frame.layers.length - 1]
      || frame.layers[0]
      || null;
  }

  function getMainCanvasInteractionSurface() {
    const canvasDoc = getProjectCanvasDocumentAt(0);
    mainViewportCanvasSurface.canvasDoc = canvasDoc;
    mainViewportCanvasSurface.canvasDocId = canvasDoc?.id || '';
    return {
      kind: 'main',
      drawing: mainViewportCanvasSurface.drawing,
      overlay: mainViewportCanvasSurface.overlay,
      selection: mainViewportCanvasSurface.selection,
      stack: mainViewportCanvasSurface.stack,
      panel: mainViewportCanvasSurface.panel,
      entry: mainViewportCanvasSurface,
      canvasDoc,
      canvasDocId: canvasDoc?.id || '',
      layer: getProjectCanvasActiveLayer(canvasDoc),
      layerId: getProjectCanvasActiveLayer(canvasDoc)?.id || '',
    };
  }

  function getLocalViewportCanvasEntryFromTarget(target) {
    if (!(target instanceof Element)) {
      return null;
    }
    for (let index = 0; index < localViewportCanvasEntries.length; index += 1) {
      const entry = localViewportCanvasEntries[index];
      if (target === entry?.drawing || target === entry?.overlay || target === entry?.selection) {
        return entry;
      }
    }
    return null;
  }

  function getCanvasInteractionSurfaceFromTarget(target) {
    const localEntry = getLocalViewportCanvasEntryFromTarget(target);
    if (localEntry && localEntry.drawing instanceof HTMLCanvasElement) {
      const canvasDoc = getProjectCanvasDocumentForEntry(localEntry);
      return {
        kind: 'local',
        drawing: localEntry.drawing,
        overlay: localEntry.overlay,
        selection: localEntry.selection,
        stack: localEntry.stack,
        panel: localEntry.panel,
        entry: localEntry,
        canvasDoc,
        canvasDocId: canvasDoc?.id || '',
        layer: getProjectCanvasActiveLayer(canvasDoc),
        layerId: getProjectCanvasActiveLayer(canvasDoc)?.id || '',
      };
    }
    if (
      target === mainViewportCanvasSurface.drawing
      || target === mainViewportCanvasSurface.overlay
      || target === mainViewportCanvasSurface.selection
    ) {
      return getMainCanvasInteractionSurface();
    }
    return null;
  }

  function getResolvedCanvasInteractionSurface(source = null) {
    if (source && typeof source === 'object' && source.drawing instanceof HTMLCanvasElement) {
      return source;
    }
    if (source instanceof Element) {
      return getCanvasInteractionSurfaceFromTarget(source);
    }
    if (pointerState.surface && pointerState.surface.drawing instanceof HTMLCanvasElement) {
      return pointerState.surface;
    }
    if (activeCanvasSurface?.drawing instanceof HTMLCanvasElement) {
      const canvasDoc = activeCanvasSurface.canvasDoc || getProjectCanvasDocumentById(activeCanvasSurface.canvasDocId);
      return {
        kind: activeCanvasSurface.kind || 'main',
        drawing: activeCanvasSurface.drawing,
        overlay: activeCanvasSurface.overlay,
        selection: activeCanvasSurface.selection,
        stack: activeCanvasSurface.stack,
        panel: activeCanvasSurface.panel,
        entry: activeCanvasSurface,
        canvasDoc,
        canvasDocId: canvasDoc?.id || activeCanvasSurface.canvasDocId || '',
        layer: getProjectCanvasActiveLayer(canvasDoc),
        layerId: getProjectCanvasActiveLayer(canvasDoc)?.id || '',
      };
    }
    return getMainCanvasInteractionSurface();
  }

  function syncActiveLayerFromInteractionSurface(surface, { syncUi = true, persist = true } = {}) {
    const canvasDoc = surface?.canvasDoc || getProjectCanvasDocumentById(surface?.canvasDocId);
    if (!canvasDoc) {
      return false;
    }
    const targetIndex = getProjectCanvasDocuments().findIndex(canvas => canvas?.id === canvasDoc.id);
    if (targetIndex < 0) {
      return false;
    }
    return setActiveProjectCanvasByIndex(targetIndex, { persist, syncUi });
  }

  function syncProjectCanvasSurfaceDimensions(surface, canvasDoc) {
    if (!surface || !canvasDoc || !(surface.stack instanceof HTMLElement)) {
      return;
    }
    ensureCanvasSurfaceContexts(surface);
    const width = Math.max(1, Math.round(Number(canvasDoc.width) || 1));
    const height = Math.max(1, Math.round(Number(canvasDoc.height) || 1));
    const scale = getProjectCanvasDisplayScale(canvasDoc);
    const cssWidth = `${width * scale}px`;
    const cssHeight = `${height * scale}px`;
    [surface.drawing, surface.overlay, surface.selection].forEach(canvas => {
      if (!(canvas instanceof HTMLCanvasElement)) {
        return;
      }
      if (canvas.width !== width) {
        canvas.width = width;
        if (canvas === surface.drawing) surface.drawingCtx = null;
        if (canvas === surface.overlay) surface.overlayCtx = null;
        if (canvas === surface.selection) surface.selectionCtx = null;
      }
      if (canvas.height !== height) {
        canvas.height = height;
        if (canvas === surface.drawing) surface.drawingCtx = null;
        if (canvas === surface.overlay) surface.overlayCtx = null;
        if (canvas === surface.selection) surface.selectionCtx = null;
      }
      canvas.style.width = cssWidth;
      canvas.style.height = cssHeight;
    });
    ensureCanvasSurfaceContexts(surface);
    surface.stack.style.width = cssWidth;
    surface.stack.style.height = cssHeight;
    surface.stack.dataset.background = state.backgroundMode;
    surface.stack.dataset.grid = state.showGrid ? 'true' : 'false';
    surface.stack.dataset.majorGrid = state.showMajorGrid ? 'true' : 'false';
    surface.stack.classList.toggle('is-flat', !state.showChecker);
    surface.stack.style.setProperty('--grid-screen-step', `${scale}px`);
    surface.stack.style.setProperty('--grid-major-step', `${scale * Math.max(Number(state.majorGridSpacing) || 16, 1)}px`);
    surface.stack.style.setProperty('--grid-offset-x', '0px');
    surface.stack.style.setProperty('--grid-offset-y', '0px');
    surface.stack.style.setProperty('--grid-major-offset-x', '0px');
    surface.stack.style.setProperty('--grid-major-offset-y', '0px');
    surface.stack.style.setProperty('--tile-screen-size', `${16 * scale}px`);
    surface.stack.style.setProperty('--tile-offset-x', '0px');
    surface.stack.style.setProperty('--tile-offset-y', '0px');
    updateStackGridOpacity(surface.stack, scale);
    updateCanvasSurfaceGridSvg(surface, canvasDoc, scale);
  }

  function getProjectCanvasSurfaceRenderSignature(canvasDoc) {
    if (!canvasDoc) {
      return '';
    }
    const frameCount = Array.isArray(canvasDoc.frames) ? canvasDoc.frames.length : 0;
    const layerCount = Array.isArray(canvasDoc.frames)
      ? canvasDoc.frames.reduce((total, frame) => total + (Array.isArray(frame?.layers) ? frame.layers.length : 0), 0)
      : 0;
    return [
      canvasDoc.id || '',
      Math.max(1, Math.round(Number(canvasDoc.width) || 1)),
      Math.max(1, Math.round(Number(canvasDoc.height) || 1)),
      getProjectCanvasDisplayScale(canvasDoc),
      Math.max(0, Math.round(Number(canvasDoc.activeFrame) || 0)),
      canvasDoc.activeLayer || '',
      frameCount,
      layerCount,
    ].join(':');
  }

  function markProjectCanvasSurfaceRendered(surface, canvasDoc) {
    if (!surface || !canvasDoc) {
      return;
    }
    surface.renderSignature = getProjectCanvasSurfaceRenderSignature(canvasDoc);
  }

  function shouldRenderProjectCanvasSurface(surface, canvasDoc) {
    if (!surface || !canvasDoc) {
      return false;
    }
    if (!(surface.drawing instanceof HTMLCanvasElement)) {
      return true;
    }
    const width = Math.max(1, Math.round(Number(canvasDoc.width) || 1));
    const height = Math.max(1, Math.round(Number(canvasDoc.height) || 1));
    if (surface.drawing.width !== width || surface.drawing.height !== height) {
      return true;
    }
    return surface.renderSignature !== getProjectCanvasSurfaceRenderSignature(canvasDoc);
  }

  function ensureLocalViewportCanvasEntries() {
    const host = dom.localCanvasDock;
    if (!(host instanceof HTMLElement)) {
      return;
    }
    const count = getLocalViewportCanvasCount();
    while (localViewportCanvasEntries.length > count) {
      const entry = localViewportCanvasEntries.pop();
      entry?.panel.remove();
    }
    while (localViewportCanvasEntries.length < count) {
      const entry = createLocalViewportCanvasEntry(localViewportCanvasEntries.length);
      localViewportCanvasEntries.push(entry);
      host.appendChild(entry.panel);
    }
    localViewportCanvasEntries.forEach((entry, index) => {
      entry.index = index;
      entry.panel.dataset.localCanvasIndex = String(index);
      entry.panel.setAttribute('aria-label', localizeText(`マルチキャンバス ${index + 2}`, `Multi Canvas ${index + 2}`));
      entry.drawing.setAttribute('aria-label', localizeText(`マルチキャンバス ${index + 2}`, `Multi Canvas ${index + 2}`));
    });
    ensureCanvasWheelListener();
  }

  function computeLocalViewportCanvasLayout() {
    const totalCanvases = Math.max(1, getProjectCanvasCount());
    const viewport = dom.canvasViewport;
    if (!(viewport instanceof HTMLElement) || totalCanvases <= 1) {
      return { mode: 'single', columns: 1, rows: 1 };
    }
    const viewportWidth = Math.max(1, Math.round(viewport.clientWidth || viewport.getBoundingClientRect().width || 1));
    const maxCanvasWidth = Math.max(...getProjectCanvasDocuments().map(canvas => (
      Math.max(1, Math.round(Number(canvas?.width) || 1)) * getProjectCanvasDisplayScale(canvas)
    )));
    const gap = MULTI_CANVAS_SURFACE_GAP;
    const padding = 16;
    const estimatedWidth = Math.max(1, Math.round(maxCanvasWidth) + gap);
    const columns = clamp(Math.floor((viewportWidth - padding * 2 + gap) / estimatedWidth) || 1, 1, totalCanvases);
    const rows = Math.max(1, Math.ceil(totalCanvases / columns));
    return { mode: 'grid', columns, rows };
  }

  function computeDefaultLocalViewportCanvasPositions() {
    const viewport = dom.canvasViewport;
    const viewportWidth = Math.max(1, Math.round(viewport?.clientWidth || viewport?.getBoundingClientRect().width || 1));
    const viewportHeight = Math.max(1, Math.round(viewport?.clientHeight || viewport?.getBoundingClientRect().height || 1));
    const padding = 16;
    const surfaces = getProjectCanvasSurfaceEntries().map((surface, index) => ({
      surface,
      canvas: getProjectCanvasDocumentAt(index),
      index,
    })).filter(item => item.surface && item.canvas);
    if (!surfaces.length) {
      return {
        main: { left: padding, top: padding },
        locals: [],
      };
    }
    if (surfaces.length === 1) {
      const canvas = surfaces[0].canvas;
      const displayScale = getProjectCanvasDisplayScale(canvas);
      const drawWidth = Math.max(1, Math.round(Number(canvas?.width) || 1)) * displayScale;
      const drawHeight = Math.max(1, Math.round(Number(canvas?.height) || 1)) * displayScale;
      return {
        main: {
          left: Math.max(padding, Math.round((viewportWidth - drawWidth) / 2)),
          top: Math.max(padding, Math.round((viewportHeight - drawHeight) / 2)),
        },
        locals: [],
      };
    }
    const gap = MULTI_CANVAS_SURFACE_GAP;
    const sizes = surfaces.map(item => ({
      ...item,
      drawWidth: Math.max(1, Math.round(Number(item.canvas?.width) || 1)) * getProjectCanvasDisplayScale(item.canvas),
      drawHeight: Math.max(1, Math.round(Number(item.canvas?.height) || 1)) * getProjectCanvasDisplayScale(item.canvas),
    }));
    const mainSize = sizes[0] || null;
    const anchorLeft = Math.max(
      padding,
      Math.round((viewportWidth - Math.max(1, Math.round(Number(mainSize?.drawWidth) || 1))) / 2)
    );
    const anchorTop = Math.max(
      padding,
      Math.round((viewportHeight - Math.max(1, Math.round(Number(mainSize?.drawHeight) || 1))) / 2)
    );
    const maxDrawWidth = Math.max(...sizes.map(item => item.drawWidth));
    const maxDrawHeight = Math.max(...sizes.map(item => item.drawHeight));
    const slotWidth = maxDrawWidth + gap;
    const slotHeight = maxDrawHeight + gap;
    const mainCenterX = anchorLeft + (Math.round(Number(mainSize?.drawWidth) || 1) / 2);
    const mainCenterY = anchorTop + (Math.round(Number(mainSize?.drawHeight) || 1) / 2);
    const slotOffsets = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 2, y: 0 },
      { x: -2, y: 0 },
      { x: 0, y: 2 },
      { x: 0, y: -2 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: 1 },
      { x: -1, y: -1 },
      { x: 2, y: 1 },
      { x: 2, y: -1 },
      { x: -2, y: 1 },
      { x: -2, y: -1 },
      { x: 1, y: 2 },
      { x: -1, y: 2 },
      { x: 1, y: -2 },
      { x: -1, y: -2 },
    ];
    const positions = sizes.map((item, itemIndex) => {
      if (itemIndex === 0) {
        return { left: anchorLeft, top: anchorTop };
      }
      const offset = slotOffsets[itemIndex - 1] || { x: itemIndex, y: 0 };
      const centerX = mainCenterX + (offset.x * slotWidth);
      const centerY = mainCenterY + (offset.y * slotHeight);
      return {
        left: Math.round(centerX - (item.drawWidth / 2)),
        top: Math.round(centerY - (item.drawHeight / 2)),
      };
    });
    return {
      main: positions[0] || { left: anchorLeft, top: anchorTop },
      locals: positions.slice(1),
    };
  }

  function computeDefaultLocalViewportCanvasWorldPosition(index, anchorLeft = 0, anchorTop = 0) {
    const safeIndex = Math.max(0, Math.round(Number(index) || 0));
    const gap = MULTI_CANVAS_SURFACE_GAP;
    let left = Number(anchorLeft) || 0;
    for (let canvasIndex = 0; canvasIndex <= safeIndex; canvasIndex += 1) {
      const canvasDoc = getProjectCanvasDocumentAt(canvasIndex);
      const displayScale = getProjectCanvasDisplayScale(canvasDoc);
      left += Math.max(1, Math.round(Number(canvasDoc?.width) || Number(state.width) || 1)) * displayScale;
      left += gap;
    }
    return {
      left: Math.round(left),
      top: Math.round(Number(anchorTop) || 0),
    };
  }

  function rectsOverlapWithGap(left, top, width, height, occupied, gap = MULTI_CANVAS_SURFACE_GAP) {
    const safeGap = Math.max(0, Math.round(Number(gap) || 0));
    const right = left + width;
    const bottom = top + height;
    return occupied.some(rect => !(
      right + safeGap <= rect.left
      || left >= rect.right + safeGap
      || bottom + safeGap <= rect.top
      || top >= rect.bottom + safeGap
    ));
  }

  function computeResolvedMultiCanvasWorldLayoutPositions(anchorLeft = 0, anchorTop = 0) {
    const defaults = computeDefaultLocalViewportCanvasPositions();
    const currentScale = getCurrentLocalViewportCanvasLayoutScale();
    const occupied = [];
    const mainCanvasDoc = getProjectCanvasDocumentAt(0);
    const mainScale = getProjectCanvasDisplayScale(mainCanvasDoc);
    const mainWidth = Math.max(1, Math.round(Number(mainCanvasDoc?.width) || Number(state.width) || 1)) * mainScale;
    const mainHeight = Math.max(1, Math.round(Number(mainCanvasDoc?.height) || Number(state.height) || 1)) * mainScale;
    const requestedAnchorLeft = Number(anchorLeft);
    const requestedAnchorTop = Number(anchorTop);
    const fallbackAnchorLeft = Number(defaults.main?.left) || 0;
    const fallbackAnchorTop = Number(defaults.main?.top) || 0;
    const resolvedMainWorld = {
      left: parseLocalViewportCanvasUnit(
        (Number.isFinite(requestedAnchorLeft) ? requestedAnchorLeft : fallbackAnchorLeft) / Math.max(currentScale, Number.EPSILON),
        0
      ) || 0,
      top: parseLocalViewportCanvasUnit(
        (Number.isFinite(requestedAnchorTop) ? requestedAnchorTop : fallbackAnchorTop) / Math.max(currentScale, Number.EPSILON),
        0
      ) || 0,
    };
    const resolvedMain = {
      left: Math.round(resolvedMainWorld.left * currentScale),
      top: Math.round(resolvedMainWorld.top * currentScale),
    };
    occupied.push({
      left: resolvedMain.left,
      top: resolvedMain.top,
      right: resolvedMain.left + mainWidth,
      bottom: resolvedMain.top + mainHeight,
    });
    const locals = [];
    let maxRight = resolvedMain.left + mainWidth;
    for (let index = 0; index < getLocalViewportCanvasCount(); index += 1) {
      const canvasDoc = getProjectCanvasDocumentAt(index + 1);
      const displayScale = getProjectCanvasDisplayScale(canvasDoc);
      const width = Math.max(1, Math.round(Number(canvasDoc?.width) || Number(state.width) || 1)) * displayScale;
      const height = Math.max(1, Math.round(Number(canvasDoc?.height) || Number(state.height) || 1)) * displayScale;
      const storedPosition = getDisplayLocalViewportCanvasPosition(index, resolvedMainWorld.left, resolvedMainWorld.top);
      const defaultPosition = defaults.locals[index] || computeDefaultLocalViewportCanvasWorldPosition(index, resolvedMain.left, resolvedMain.top);
      let nextLeft = storedPosition.left ?? defaultPosition.left ?? resolvedMain.left;
      let nextTop = storedPosition.top ?? defaultPosition.top ?? resolvedMain.top;
      if (rectsOverlapWithGap(nextLeft, nextTop, width, height, occupied)) {
        nextLeft = Math.round(maxRight + MULTI_CANVAS_SURFACE_GAP);
        nextTop = Math.round(defaultPosition.top ?? resolvedMain.top);
      }
      occupied.push({
        left: nextLeft,
        top: nextTop,
        right: nextLeft + width,
        bottom: nextTop + height,
      });
      maxRight = Math.max(maxRight, nextLeft + width);
      locals.push({ left: nextLeft, top: nextTop });
    }
    return {
      main: resolvedMain,
      locals,
    };
  }

  function syncMultiCanvasWorldLayoutDisplayPositions() {
    if (!isMultiCanvasWorldLayoutActive()) {
      return false;
    }
    const mainPanel = mainViewportCanvasSurface?.panel instanceof HTMLElement
      ? mainViewportCanvasSurface.panel
      : null;
    const currentScale = getCurrentLocalViewportCanvasLayoutScale();
    const fallbackAnchorLeft = parseLocalViewportCanvasAxis(mainPanel?.style.left, mainPanel?.offsetLeft) || 0;
    const fallbackAnchorTop = parseLocalViewportCanvasAxis(mainPanel?.style.top, mainPanel?.offsetTop) || 0;
    const anchorWorldLeft = parseLocalViewportCanvasAxis(localViewportCanvasState?.anchorLeft, fallbackAnchorLeft / Math.max(currentScale, Number.EPSILON)) || 0;
    const anchorWorldTop = parseLocalViewportCanvasAxis(localViewportCanvasState?.anchorTop, fallbackAnchorTop / Math.max(currentScale, Number.EPSILON)) || 0;
    const anchorDisplayLeft = Math.round(anchorWorldLeft * currentScale);
    const anchorDisplayTop = Math.round(anchorWorldTop * currentScale);
    if (mainPanel) {
      mainPanel.style.left = `${anchorDisplayLeft}px`;
      mainPanel.style.top = `${anchorDisplayTop}px`;
    }
    localViewportCanvasEntries.forEach((entry, index) => {
      if (!(entry?.panel instanceof HTMLElement)) {
        return;
      }
      const storedPosition = getStoredLocalViewportCanvasPosition(index);
      if (storedPosition.left === null || storedPosition.top === null) {
        return;
      }
      entry.panel.style.left = `${Math.round((anchorWorldLeft + storedPosition.left) * currentScale)}px`;
      entry.panel.style.top = `${Math.round((anchorWorldTop + storedPosition.top) * currentScale)}px`;
    });
    return true;
  }

  function getViewportPanelZoomFocus(focus, displayScale = getPixelAlignedCanvasDisplayScale(state.scale)) {
    if (!focus) {
      return null;
    }
    const surface = focus.surface
      ? getResolvedCanvasInteractionSurface(focus.surface)
      : (focus.canvasDocId ? getProjectCanvasSurfaceByCanvasId(focus.canvasDocId) : getViewportVisibilityTargetSurface());
    const panel = surface?.panel instanceof HTMLElement ? surface.panel : null;
    if (!(panel instanceof HTMLElement)) {
      return null;
    }
    const workspace = dom.viewportWorkspace instanceof HTMLElement ? dom.viewportWorkspace : null;
    const panelRect = panel.getBoundingClientRect();
    const workspaceRect = workspace?.getBoundingClientRect?.() || null;
    const panelOffsetX = workspaceRect
      ? Math.round(panelRect.left - workspaceRect.left)
      : (parseLocalViewportCanvasAxis(panel.style.left, panel.offsetLeft) || 0);
    const panelOffsetY = workspaceRect
      ? Math.round(panelRect.top - workspaceRect.top)
      : (parseLocalViewportCanvasAxis(panel.style.top, panel.offsetTop) || 0);
    return {
      clientX: Number.isFinite(focus.clientX) ? Number(focus.clientX) : null,
      clientY: Number.isFinite(focus.clientY) ? Number(focus.clientY) : null,
      panelOffsetX,
      panelOffsetY,
      worldX: Number(focus.worldX) || 0,
      worldY: Number(focus.worldY) || 0,
      canvasDocId: surface?.canvasDocId || focus.canvasDocId || '',
    };
  }

  function syncLocalViewportCanvasDockLayout() {
    const workspace = dom.viewportWorkspace;
    if (!(workspace instanceof HTMLElement)) {
      return;
    }
    const mainPanel = mainViewportCanvasSurface?.panel instanceof HTMLElement
      ? mainViewportCanvasSurface.panel
      : null;
    const totalCanvases = Math.max(1, getProjectCanvasCount());
    const multiCanvasWorldLayoutActive = isMultiCanvasWorldLayoutActive();
    const useCenteredMainPanel = isMainCanvasPanelCssCentered();
    const currentScale = getCurrentLocalViewportCanvasLayoutScale();
    workspace.dataset.localCanvasLayout = totalCanvases > 1 ? 'free' : 'single';
    workspace.style.setProperty('--workspace-canvas-columns', '1');
    workspace.style.setProperty('--workspace-canvas-rows', '1');
    if (multiCanvasWorldLayoutActive) {
      const shouldReset = Boolean(localViewportCanvasLayoutResetPending);
      const resolvedLayout = shouldReset
        ? computeResolvedMultiCanvasWorldLayoutPositions(
          Math.round((parseLocalViewportCanvasAxis(localViewportCanvasState?.anchorLeft, null) ?? 0) * currentScale),
          Math.round((parseLocalViewportCanvasAxis(localViewportCanvasState?.anchorTop, null) ?? 0) * currentScale)
        )
        : null;
      const defaults = resolvedLayout || computeDefaultLocalViewportCanvasPositions();
      const storedAnchorLeft = parseLocalViewportCanvasAxis(localViewportCanvasState?.anchorLeft, null);
      const storedAnchorTop = parseLocalViewportCanvasAxis(localViewportCanvasState?.anchorTop, null);
      const anchorDisplayLeft = shouldReset
        ? resolvedLayout.main.left
        : (storedAnchorLeft === null ? defaults.main.left : Math.round(storedAnchorLeft * currentScale));
      const anchorDisplayTop = shouldReset
        ? resolvedLayout.main.top
        : (storedAnchorTop === null ? defaults.main.top : Math.round(storedAnchorTop * currentScale));
      const anchorWorldLeft = anchorDisplayLeft / Math.max(currentScale, Number.EPSILON);
      const anchorWorldTop = anchorDisplayTop / Math.max(currentScale, Number.EPSILON);
      if (mainPanel) {
        mainPanel.style.left = `${anchorDisplayLeft}px`;
        mainPanel.style.top = `${anchorDisplayTop}px`;
      }
      setLocalViewportCanvasLayoutAnchor(anchorDisplayLeft, anchorDisplayTop);
      localViewportCanvasEntries.forEach((entry, index) => {
        if (!(entry.panel instanceof HTMLElement)) {
          return;
        }
        const storedPosition = shouldReset
          ? { left: null, top: null }
          : getDisplayLocalViewportCanvasPosition(index, anchorWorldLeft, anchorWorldTop);
        const defaultPosition = shouldReset
          ? (resolvedLayout.locals[index] || computeDefaultLocalViewportCanvasWorldPosition(index, anchorDisplayLeft, anchorDisplayTop))
          : (defaults.locals[index] || computeDefaultLocalViewportCanvasWorldPosition(index, anchorDisplayLeft, anchorDisplayTop));
        const left = storedPosition.left ?? defaultPosition.left;
        const top = storedPosition.top ?? defaultPosition.top;
        entry.panel.style.left = `${left}px`;
        entry.panel.style.top = `${top}px`;
        if (shouldReset || storedPosition.left === null || storedPosition.top === null) {
          setLocalViewportCanvasPosition(index, left, top);
        }
      });
      localViewportCanvasLayoutResetPending = false;
      return;
    }
    const defaults = computeDefaultLocalViewportCanvasPositions();
    const shouldReset = Boolean(localViewportCanvasLayoutResetPending);
    const storedAnchorLeft = parseLocalViewportCanvasAxis(localViewportCanvasState?.anchorLeft, null);
    const storedAnchorTop = parseLocalViewportCanvasAxis(localViewportCanvasState?.anchorTop, null);
    const anchorLeft = shouldReset
      ? defaults.main.left
      : (storedAnchorLeft === null ? defaults.main.left : Math.round(storedAnchorLeft * currentScale));
    const anchorTop = shouldReset
      ? defaults.main.top
      : (storedAnchorTop === null ? defaults.main.top : Math.round(storedAnchorTop * currentScale));
    const anchorWorldLeft = anchorLeft / Math.max(currentScale, Number.EPSILON);
    const anchorWorldTop = anchorTop / Math.max(currentScale, Number.EPSILON);
    if (mainPanel) {
      mainPanel.style.left = useCenteredMainPanel ? '0px' : `${anchorLeft}px`;
      mainPanel.style.top = useCenteredMainPanel ? '0px' : `${anchorTop}px`;
    }
    setLocalViewportCanvasLayoutAnchor(
      useCenteredMainPanel ? 0 : anchorLeft,
      useCenteredMainPanel ? 0 : anchorTop
    );
    localViewportCanvasEntries.forEach((entry, index) => {
      if (!(entry.panel instanceof HTMLElement)) {
        return;
      }
      const storedPosition = shouldReset
        ? { left: null, top: null }
        : getDisplayLocalViewportCanvasPosition(index, anchorWorldLeft, anchorWorldTop);
      const defaultPosition = {
        left: parseLocalViewportCanvasAxis(defaults.locals[index]?.left, null),
        top: parseLocalViewportCanvasAxis(defaults.locals[index]?.top, null),
      };
      const left = storedPosition.left ?? defaultPosition.left ?? anchorLeft;
      const top = storedPosition.top ?? defaultPosition.top ?? anchorTop;
      entry.panel.style.left = `${left}px`;
      entry.panel.style.top = `${top}px`;
      if (
        storedPosition.left !== left
        || storedPosition.top !== top
      ) {
        setLocalViewportCanvasPosition(index, left, top);
      }
    });
    localViewportCanvasLayoutResetPending = false;
  }

  function buildProjectCanvasImageData(canvasDoc) {
    const width = Math.max(1, Math.round(Number(canvasDoc?.width) || 1));
    const height = Math.max(1, Math.round(Number(canvasDoc?.height) || 1));
    const frame = getProjectCanvasActiveFrame(canvasDoc) || { layers: [] };
    const pixels = compositeFramePixels(frame, width, height, state.palette, {
      useLocalLayerPreviewVisibility: true,
      useLocalLayerPreviewOpacity: true,
    });
    try {
      return new ImageData(pixels, width, height);
    } catch (error) {
      return new ImageData(new Uint8ClampedArray(pixels), width, height);
    }
  }

  function buildVoxelPreviewCanvasCompositeImageData(canvasDoc) {
    if (!canvasDoc || !isVoxelPreviewCanvasId(canvasDoc.id || '') || !(voxelExtensionPreviewPixels instanceof Uint8ClampedArray) || !voxelExtensionPreviewMeta) {
      return null;
    }
    const width = Math.max(1, Math.round(Number(voxelExtensionPreviewMeta.width) || Number(canvasDoc?.width) || 1));
    const height = Math.max(1, Math.round(Number(voxelExtensionPreviewMeta.height) || Number(canvasDoc?.height) || 1));
    const basePixels = new Uint8ClampedArray(voxelExtensionPreviewPixels);
    const overlayImage = buildProjectCanvasImageData(canvasDoc);
    const overlayPixels = overlayImage?.data instanceof Uint8ClampedArray ? overlayImage.data : null;
    if (overlayPixels && overlayPixels.length === basePixels.length) {
      for (let index = 0; index < basePixels.length; index += 4) {
        const srcA = (overlayPixels[index + 3] || 0) / 255;
        if (srcA <= 0) {
          continue;
        }
        const dstA = (basePixels[index + 3] || 0) / 255;
        const outA = srcA + (dstA * (1 - srcA));
        if (outA <= 0) {
          basePixels[index] = 0;
          basePixels[index + 1] = 0;
          basePixels[index + 2] = 0;
          basePixels[index + 3] = 0;
          continue;
        }
        basePixels[index] = Math.round(((overlayPixels[index] * srcA) + (basePixels[index] * dstA * (1 - srcA))) / outA);
        basePixels[index + 1] = Math.round(((overlayPixels[index + 1] * srcA) + (basePixels[index + 1] * dstA * (1 - srcA))) / outA);
        basePixels[index + 2] = Math.round(((overlayPixels[index + 2] * srcA) + (basePixels[index + 2] * dstA * (1 - srcA))) / outA);
        basePixels[index + 3] = Math.round(outA * 255);
      }
    }
    try {
      return new ImageData(basePixels, width, height);
    } catch (error) {
      const fallbackPixels = new Uint8ClampedArray(basePixels);
      return new ImageData(fallbackPixels, width, height);
    }
  }

  function buildVoxelPreviewCanvasCompositeImageDataForFrameIndex(frameIndex = state.activeFrame) {
    if (!isVoxelExtensionModeEnabled()) {
      return null;
    }
    const resolved = getVoxelExtensionResolvedCanvases();
    const previewCanvasDoc = getProjectCanvasDocumentById(voxelExtensionState.previewCanvasId);
    if (!resolved?.front || !resolved?.back || !resolved?.left || !resolved?.right || !resolved?.top || !resolved?.bottom || !previewCanvasDoc) {
      return null;
    }
    const orientation = getVoxelPreviewOrientationForFrameIndex(
      frameIndex,
      voxelExtensionState.previewYawDeg,
      voxelExtensionState.previewPitchDeg
    );
    const rendered = buildVoxelPreviewPixels(
      resolved.front,
      resolved.back,
      resolved.left,
      resolved.right,
      resolved.top,
      resolved.bottom,
      {
        frameIndex,
        yawDeg: orientation.yawDeg,
        pitchDeg: orientation.pitchDeg,
        displayPx: voxelExtensionState.displayPx,
      }
    );
    const scaledPreview = scaleVoxelPreviewPixels(
      rendered.pixels,
      rendered.width,
      rendered.height,
      1
    );
    const width = Math.max(1, Math.round(Number(scaledPreview.width) || 1));
    const height = Math.max(1, Math.round(Number(scaledPreview.height) || 1));
    const basePixels = new Uint8ClampedArray(scaledPreview.pixels);
    const frame = getProjectCanvasFrameAt(previewCanvasDoc, frameIndex);
    const overlayImage = (() => {
      try {
        return new ImageData(
          compositeFramePixels(frame, width, height, state.palette, {
            useLocalLayerPreviewVisibility: true,
            useLocalLayerPreviewOpacity: true,
          }),
          width,
          height
        );
      } catch (error) {
        const pixels = compositeFramePixels(frame, width, height, state.palette, {
          useLocalLayerPreviewVisibility: true,
          useLocalLayerPreviewOpacity: true,
        });
        const image = createBlankImageData(width, height);
        if (image?.data instanceof Uint8ClampedArray) {
          image.data.set(pixels);
          return image;
        }
        return null;
      }
    })();
    const overlayPixels = overlayImage?.data instanceof Uint8ClampedArray ? overlayImage.data : null;
    if (overlayPixels && overlayPixels.length === basePixels.length) {
      for (let index = 0; index < basePixels.length; index += 4) {
        const srcA = (overlayPixels[index + 3] || 0) / 255;
        if (srcA <= 0) continue;
        const dstA = (basePixels[index + 3] || 0) / 255;
        const outA = srcA + (dstA * (1 - srcA));
        if (outA <= 0) {
          basePixels[index] = 0;
          basePixels[index + 1] = 0;
          basePixels[index + 2] = 0;
          basePixels[index + 3] = 0;
          continue;
        }
        basePixels[index] = Math.round(((overlayPixels[index] * srcA) + (basePixels[index] * dstA * (1 - srcA))) / outA);
        basePixels[index + 1] = Math.round(((overlayPixels[index + 1] * srcA) + (basePixels[index + 1] * dstA * (1 - srcA))) / outA);
        basePixels[index + 2] = Math.round(((overlayPixels[index + 2] * srcA) + (basePixels[index + 2] * dstA * (1 - srcA))) / outA);
        basePixels[index + 3] = Math.round(outA * 255);
      }
    }
    try {
      return new ImageData(basePixels, width, height);
    } catch (error) {
      const fallback = createBlankImageData(width, height);
      if (fallback?.data instanceof Uint8ClampedArray) {
        fallback.data.set(basePixels);
        return fallback;
      }
      return null;
    }
  }

  function renderProjectCanvasSurface(surface, canvasDoc, { imageData = null } = {}) {
    if (!surface || !canvasDoc) {
      return;
    }
    surface.canvasDoc = canvasDoc;
    surface.canvasDocId = canvasDoc.id || '';
    syncProjectCanvasSurfaceDimensions(surface, canvasDoc);
    ensureCanvasSurfaceContexts(surface);
    if (!surface.drawingCtx) {
      return;
    }
    let resolvedImage = imageData instanceof ImageData ? imageData : null;
    if (!resolvedImage && isVoxelPreviewCanvasId(canvasDoc.id || '')) {
      resolvedImage = buildVoxelPreviewCanvasCompositeImageData(canvasDoc);
    }
    if (!resolvedImage) {
      resolvedImage = buildProjectCanvasImageData(canvasDoc);
    }
    surface.drawingCtx.clearRect(0, 0, canvasDoc.width, canvasDoc.height);
    surface.drawingCtx.putImageData(resolvedImage, 0, 0);
    markProjectCanvasSurfaceRendered(surface, canvasDoc);
  }

  function renderVoxelExtensionPreviewSurfaceNow({ updateViewport = false } = {}) {
    if (!isVoxelExtensionModeEnabled()) {
      return false;
    }
    const synced = syncVoxelExtensionPreviewFromSource({ updateViewport });
    renderFloatingPreviewPanel();
    return synced;
  }

  function renderAllProjectCanvasSurfaces() {
    const documents = getProjectCanvasDocuments();
    getProjectCanvasSurfaceEntries().forEach((surface, index) => {
      const canvasDoc = documents[index] || null;
      if (!canvasDoc) {
        return;
      }
      renderProjectCanvasSurface(surface, canvasDoc);
    });
    syncMultiCanvasSelectionUi();
  }

  function syncAllProjectCanvasSurfaceDimensions() {
    const documents = getProjectCanvasDocuments();
    getProjectCanvasSurfaceEntries().forEach((surface, index) => {
      const canvasDoc = documents[index] || null;
      if (surface && canvasDoc) {
        syncProjectCanvasSurfaceDimensions(surface, canvasDoc);
      }
    });
  }

  function renderInactiveProjectCanvasSurfaces() {
    const documents = getProjectCanvasDocuments();
    getProjectCanvasSurfaceEntries().forEach((surface, index) => {
      const canvasDoc = documents[index] || null;
      if (!canvasDoc || surface === activeCanvasSurface) {
        return;
      }
      if (!shouldRenderProjectCanvasSurface(surface, canvasDoc)) {
        syncProjectCanvasSurfaceDimensions(surface, canvasDoc);
        return;
      }
      renderProjectCanvasSurface(surface, canvasDoc);
    });
    syncMultiCanvasSelectionUi();
  }

  function renderLocalViewportCanvases() {
    refreshInactiveProjectCanvasSurfacesSoon();
  }

  function drawVoxelGuideOverlayOnSurface(surface, guide) {
    if (!surface?.overlayCtx || !(guide?.pixels instanceof Uint8ClampedArray)) {
      return;
    }
    if (surface.overlay.width !== guide.width || surface.overlay.height !== guide.height) {
      return;
    }
    let imageData = null;
    try {
      imageData = new ImageData(guide.pixels, guide.width, guide.height);
    } catch (error) {
      imageData = surface.overlayCtx.createImageData(guide.width, guide.height);
      imageData.data.set(guide.pixels);
    }
    surface.overlayCtx.putImageData(imageData, 0, 0);
  }

  function drawVoxelProjectionOverlayOnMainSurface() {
    if (!isVoxelExtensionModeEnabled() || voxelExtensionState.previewCanvasId) {
      return;
    }
    const surface = mainViewportCanvasSurface;
    const overlayCtx = surface?.overlayCtx;
    const overlayCanvas = surface?.overlay;
    const pixels = voxelExtensionPreviewPixels;
    const meta = voxelExtensionPreviewMeta;
    if (
      !overlayCtx
      || !(overlayCanvas instanceof HTMLCanvasElement)
      || !(pixels instanceof Uint8ClampedArray)
      || !meta
    ) {
      return;
    }
    const sourceWidth = Math.max(1, Math.round(Number(meta.width) || 1));
    const sourceHeight = Math.max(1, Math.round(Number(meta.height) || 1));
    const offsetX = Math.floor((overlayCanvas.width - sourceWidth) / 2);
    const offsetY = Math.floor((overlayCanvas.height - sourceHeight) / 2);
    let imageData = null;
    try {
      imageData = new ImageData(pixels, sourceWidth, sourceHeight);
    } catch (error) {
      imageData = overlayCtx.createImageData(sourceWidth, sourceHeight);
      imageData.data.set(pixels);
    }
    overlayCtx.putImageData(imageData, offsetX, offsetY);
  }

  function renderVoxelGuideOverlays() {
    if (!isVoxelExtensionModeEnabled() || !voxelExtensionGuideProjections) {
      return;
    }
    getProjectCanvasSurfaceEntries().forEach(surface => {
      if (!surface || surface === activeCanvasSurface) {
        return;
      }
      const role = getVoxelExtensionCanvasRoleById(surface.canvasDocId || '');
      if (!role || hasCanvasDocumentVisiblePixels(surface.canvasDoc)) {
        return;
      }
      drawVoxelGuideOverlayOnSurface(surface, voxelExtensionGuideProjections[role] || null);
    });
  }

  function renderLocalViewportCanvasOverlays() {
    const activeDrawing = activeCanvasSurface?.drawing instanceof HTMLCanvasElement
      ? activeCanvasSurface.drawing
      : null;
    const interactionDrawing = pointerState.active && pointerState.surface?.drawing instanceof HTMLCanvasElement
      ? pointerState.surface.drawing
      : null;
    const hoveredSurface = !pointerState.active
      ? getProjectCanvasSurfaceByCanvasId(hoveredProjectCanvasId)
      : null;
    const hoveredDrawing = hoveredSurface?.drawing instanceof HTMLCanvasElement
      ? hoveredSurface.drawing
      : null;
    getProjectCanvasSurfaceEntries().forEach(surface => {
      ensureCanvasSurfaceContexts(surface);
      const keepOverlay = Boolean(
        surface.drawing === activeDrawing
        || surface.drawing === interactionDrawing
        || surface.drawing === hoveredDrawing
      );
      const keepSelection = Boolean(
        surface.drawing === activeDrawing
        || surface.drawing === interactionDrawing
      );
      if (!keepOverlay) {
        surface.overlayCtx?.clearRect(0, 0, surface.overlay.width, surface.overlay.height);
      }
      if (!keepSelection) {
        surface.selectionCtx?.clearRect(0, 0, surface.selection.width, surface.selection.height);
      }
    });
    renderVoxelGuideOverlays();
    drawVoxelProjectionOverlayOnMainSurface();
    if (
      !pointerState.active
      && hoveredSurface
      && hoveredSurface !== activeCanvasSurface
      && hoverPixel
    ) {
      drawHoverPreviewOnSurface(hoveredSurface, hoverPixel, getActiveTool());
    }
  }

  function syncLocalViewportCanvasDockVisibility({ persist = false, render = true } = {}) {
    const host = dom.localCanvasDock;
    const workspace = dom.viewportWorkspace;
    if (!(host instanceof HTMLElement) || !(workspace instanceof HTMLElement)) {
      return;
    }
    const count = getLocalViewportCanvasCount();
    const mainDragHandle = ensureCanvasSurfaceDragHandle(mainViewportCanvasSurface);
    host.dataset.background = state.backgroundMode;
    host.dataset.showChecker = state.showChecker ? 'true' : 'false';
    if (count <= 0) {
      while (localViewportCanvasEntries.length) {
        const entry = localViewportCanvasEntries.pop();
        entry?.panel.remove();
      }
      if (mainDragHandle instanceof HTMLElement) {
        mainDragHandle.hidden = true;
        mainDragHandle.setAttribute('aria-hidden', 'true');
      }
      if (dom.mainCanvasArea instanceof HTMLElement) {
        dom.mainCanvasArea.classList.remove('is-free-positionable');
      }
      host.classList.add('is-hidden');
      host.hidden = true;
      host.setAttribute('aria-hidden', 'true');
      workspace.dataset.localCanvasLayout = 'single';
      workspace.style.setProperty('--workspace-canvas-columns', '1');
      workspace.style.setProperty('--workspace-canvas-rows', '1');
      syncLocalViewportCanvasDockLayout();
      syncMultiCanvasSelectionUi();
      if (persist) {
        scheduleSessionPersist({ includeSnapshots: false });
      }
      return;
    }
    host.classList.remove('is-hidden');
    host.hidden = false;
    host.setAttribute('aria-hidden', 'false');
    if (mainDragHandle instanceof HTMLElement) {
      mainDragHandle.hidden = true;
      mainDragHandle.setAttribute('aria-hidden', 'true');
    }
    if (dom.mainCanvasArea instanceof HTMLElement) {
      dom.mainCanvasArea.classList.add('is-free-positionable');
    }
    ensureLocalViewportCanvasEntries();
    syncLocalViewportCanvasDockLayout();
    if (render) {
      refreshInactiveProjectCanvasSurfacesSoon();
      renderLocalViewportCanvasOverlays();
    } else {
      syncMultiCanvasSelectionUi();
    }
    if (persist) {
      scheduleSessionPersist({ includeSnapshots: false });
    }
  }

  function resetTransientInteractionForCanvasStructureChange() {
    if (cancelPendingCurveInteraction()) {
      // Curve cancellation handles its own overlay refresh.
    }
    if (hasPendingSelectionMove()) {
      cancelPendingSelectionMove();
    }
    if (pointerState.active) {
      if (pointerState.tool === 'pan' && pointerState.panMode === 'multiTouch') {
        cancelActiveViewportGesture('canvas-structure-change');
      } else {
        abortActivePointerInteraction({ commitHistory: false });
      }
    }
    clearPendingCanvasSwitchPointer({ detachListeners: true });
    pointerState.selectionMove = null;
    pointerState.lastSelectionMove = null;
    state.pendingPasteMoveState = null;
    hoverPixel = null;
    invalidateActiveCanvasCompositeRenderState();
    requestOverlayRender();
  }

  function setLocalViewportCanvasCount(nextCount, { persist = true, announce = true, recordHistory = false } = {}) {
    if (!MULTI_CANVAS_FEATURE_ENABLED) {
      const currentCanvases = getProjectCanvasDocuments();
      if (currentCanvases.length > 1) {
        replaceProjectCanvasDocuments(currentCanvases, getActiveProjectCanvasDocument()?.id || currentCanvases[0]?.id || '');
        ensureLocalViewportCanvasEntries();
        bindActiveCanvasSurface(mainViewportCanvasSurface);
        syncLocalViewportCanvasDockVisibility({ persist, render: true });
        renderFrameList();
        renderLayerList();
        renderTimelineMatrix();
        syncControlsWithState();
        applyViewportTransform();
        requestRender();
        requestOverlayRender();
      } else {
        localViewportCanvasState = normalizeLocalViewportCanvasState(
          LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE,
          LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE
        );
        syncLocalViewportCanvasDockVisibility({ persist, render: true });
      }
      return;
    }
    const previous = getLocalViewportCanvasCount();
    const currentCanvases = getProjectCanvasDocuments();
    const requestedCount = Math.round(Number(nextCount) || 0);
    const maximumAdditionalCanvases = 3;
    if (requestedCount > previous && currentCanvases.length >= 4) {
      updateAutosaveStatus(
        localizeText('キャンバスは1シートにつき最大4件です', 'A sheet can contain at most 4 canvases'),
        'warn'
      );
      syncControlsWithState();
      return false;
    }
    const targetCount = clamp(requestedCount, 0, maximumAdditionalCanvases);
    if (targetCount === previous) {
      if (persist) {
        scheduleSessionPersist({ includeSnapshots: false });
      }
      return false;
    }
    resetTransientInteractionForCanvasStructureChange();
    const historyLabel = targetCount > previous ? 'addCanvas' : 'removeCanvas';
    if (recordHistory) {
      beginHistory(historyLabel);
    }
    const sourceCanvas = getActiveProjectCanvasDocument() || currentCanvases[0] || null;
    const activeCanvasIndex = clamp(getActiveProjectCanvasIndex(), 0, Math.max(0, currentCanvases.length - 1));
    const targetTotal = targetCount + 1;
    const retainedCanvases = currentCanvases.slice(0, targetTotal);
    if (currentCanvases.length > targetTotal && activeCanvasIndex >= targetTotal && currentCanvases[activeCanvasIndex]) {
      retainedCanvases[targetTotal - 1] = currentCanvases[activeCanvasIndex];
    }
    const nextCanvases = retainedCanvases.map((canvas, index) => createProjectCanvasDocument(canvas, {
      clonePixelData: true,
      fallbackIndex: index + 1,
    }));
    while (nextCanvases.length < targetTotal) {
      nextCanvases.push(createBlankProjectCanvasDocument(sourceCanvas, nextCanvases.length + 1));
    }
    const validation = window.PiXiEEDrawModules?.projectSheetCollectionUtils
      ?.createProjectSheetCollectionUtils?.()
      ?.validateSheetCanvasCount?.({ document: { canvases: nextCanvases } });
    if (!validation?.valid) {
      updateAutosaveStatus(
        localizeText('キャンバスは1シートにつき最大4件です', 'A sheet can contain at most 4 canvases'),
        'warn'
      );
      syncControlsWithState();
      return false;
    }
    if (targetCount < previous && !canNormalizeMultiAssignmentsForCanvasDocuments(nextCanvases, { announce: true })) {
      return false;
    }
    if (targetCount !== previous) {
      clearPendingMultiAssignmentMoveRequests();
    }
    const activeCanvasId = currentCanvases[activeCanvasIndex]?.id || '';
    const resolvedActiveCanvasId = nextCanvases.some(canvas => canvas?.id === activeCanvasId)
      ? activeCanvasId
      : (nextCanvases[Math.min(activeCanvasIndex, nextCanvases.length - 1)]?.id || nextCanvases[0]?.id || '');
    replaceProjectCanvasDocuments(nextCanvases, resolvedActiveCanvasId);
    if (targetCount > previous) {
      requestLocalViewportCanvasLayoutReset({ clearStored: true });
      assignAdjacentPositionForNewLocalViewportCanvases(previous);
    }
    ensureLocalViewportCanvasEntries();
    bindActiveCanvasSurface(getProjectCanvasSurfaceForIndex(getActiveProjectCanvasIndex()) || mainViewportCanvasSurface);
    syncLocalViewportCanvasDockVisibility({ persist, render: true });
    renderFrameList();
    renderLayerList();
    renderTimelineMatrix();
    syncControlsWithState();
    applyViewportTransform();
    requestRender();
    requestOverlayRender();
    const normalizedCount = getLocalViewportCanvasCount();
    if (normalizedCount !== previous) {
      if (recordHistory) {
        markHistoryDirty();
        commitHistory();
      } else {
        markAutosaveDirty();
        markDocumentUnsavedChange();
      }
      if (persist && !recordHistory) {
        scheduleSessionPersist({ includeSnapshots: true });
      }
    }
    if (!announce || normalizedCount === previous) {
      return normalizedCount !== previous;
    }
    updateAutosaveStatus(
      normalizedCount > 0
        ? localizeText(`マルチキャンバスを ${normalizedCount} 面にしました`, `Multi canvases: ${normalizedCount}`)
        : localizeText('マルチキャンバスをOFFにしました', 'Multi canvases turned off'),
      'info'
    );
    return normalizedCount !== previous;
  }

  function adjustLocalViewportCanvasCount(delta, options = {}) {
    const count = getLocalViewportCanvasCount();
    setLocalViewportCanvasCount(count + Math.round(Number(delta) || 0), options);
  }

  function isVoxelExtensionModeEnabled() {
    return false;
  }

  function getLocalViewportCanvasMaxCount() {
    const currentProjectCanvasCount = Array.isArray(projectCanvasStore?.canvases)
      ? Math.max(0, projectCanvasStore.canvases.length - 1)
      : 0;
    const modeLimit = isVoxelExtensionModeEnabled()
      ? VOXEL_EXTENSION_LOCAL_CANVAS_MAX_COUNT
      : 0;
    return Math.min(3, Math.max(3, currentProjectCanvasCount, modeLimit));
  }

  function canUseVoxelExtensionMode() {
    return false;
  }

  function preserveViewportAnchorAcrossViewportChange(runLayoutUpdate) {
    const updateLayout = typeof runLayoutUpdate === 'function'
      ? runLayoutUpdate
      : () => {};
    const viewport = dom.canvasViewport instanceof HTMLElement ? dom.canvasViewport : null;
    const canPreserveAnchor = Boolean(
      viewport
      && typeof getViewportCenterZoomFocus === 'function'
      && typeof getCanvasSurfacePanelLayoutOffset === 'function'
      && typeof getCanvasSurfaceDrawingLocalOffset === 'function'
      && typeof getCanvasSurfaceDrawingDisplayScale === 'function'
    );
    if (!canPreserveAnchor) {
      updateLayout();
      applyViewportTransform();
      return;
    }
    const focus = getViewportCenterZoomFocus();
    const focusSurface = focus?.surface
      ? getResolvedCanvasInteractionSurface(focus.surface)
      : (typeof getViewportVisibilityTargetSurface === 'function' ? getViewportVisibilityTargetSurface() : null);
    const focusCanvasId = focus?.canvasDocId || focusSurface?.canvasDocId || focusSurface?.canvasDoc?.id || '';
    const viewportRectBefore = viewport.getBoundingClientRect();
    const focusCanvasDocBefore = focusSurface?.canvasDoc
      || getProjectCanvasDocumentById(focusSurface?.canvasDocId)
      || getActiveProjectCanvasDocument();
    const fallbackDisplayScale = getPixelAlignedCanvasDisplayScale(Number(state.scale) || MIN_ZOOM_SCALE);
    const panelOffsetBefore = getCanvasSurfacePanelLayoutOffset(focusSurface);
    const drawingOffsetBefore = getCanvasSurfaceDrawingLocalOffset(focusSurface);
    const drawingScaleBefore = getCanvasSurfaceDrawingDisplayScale(
      focusSurface,
      focusCanvasDocBefore,
      fallbackDisplayScale
    );
    const focusViewportOffsetX = focus && viewportRectBefore && Number.isFinite(focus.clientX)
      ? (Number(focus.clientX) - viewportRectBefore.left)
      : (focus
        ? (Number(state.pan.x) || 0) + panelOffsetBefore.x + drawingOffsetBefore.x + ((Number(focus.worldX) || 0) * drawingScaleBefore.x)
        : null);
    const focusViewportOffsetY = focus && viewportRectBefore && Number.isFinite(focus.clientY)
      ? (Number(focus.clientY) - viewportRectBefore.top)
      : (focus
        ? (Number(state.pan.y) || 0) + panelOffsetBefore.y + drawingOffsetBefore.y + ((Number(focus.worldY) || 0) * drawingScaleBefore.y)
        : null);

    updateLayout();

    if (
      !focus
      || !Number.isFinite(focusViewportOffsetX)
      || !Number.isFinite(focusViewportOffsetY)
    ) {
      applyViewportTransform();
      return;
    }

    const focusedSurface = focusCanvasId
      ? getProjectCanvasSurfaceByCanvasId(focusCanvasId)
      : focusSurface;
    const focusedCanvasDoc = focusedSurface?.canvasDoc
      || getProjectCanvasDocumentById(focusedSurface?.canvasDocId)
      || getActiveProjectCanvasDocument();
    const panelOffsetAfter = getCanvasSurfacePanelLayoutOffset(focusedSurface, panelOffsetBefore);
    const drawingOffsetAfter = getCanvasSurfaceDrawingLocalOffset(focusedSurface);
    const drawingScaleAfter = getCanvasSurfaceDrawingDisplayScale(
      focusedSurface,
      focusedCanvasDoc,
      fallbackDisplayScale
    );
    state.pan.x = (
      focusViewportOffsetX
      - (panelOffsetAfter.x + drawingOffsetAfter.x + ((Number(focus.worldX) || 0) * drawingScaleAfter.x))
    );
    state.pan.y = (
      focusViewportOffsetY
      - (panelOffsetAfter.y + drawingOffsetAfter.y + ((Number(focus.worldY) || 0) * drawingScaleAfter.y))
    );

    applyViewportTransform({
      updateDecorations: false,
      clampVisibility: false,
    });

    if (focusedSurface?.drawing instanceof HTMLCanvasElement) {
      const viewportRectAfter = viewport.getBoundingClientRect();
      const drawingRectAfter = focusedSurface.drawing.getBoundingClientRect();
      const actualScaleAfter = getCanvasSurfaceDrawingDisplayScale(
        focusedSurface,
        focusedCanvasDoc,
        fallbackDisplayScale
      );
      const anchorViewportX = (drawingRectAfter.left - viewportRectAfter.left) + ((Number(focus.worldX) || 0) * actualScaleAfter.x);
      const anchorViewportY = (drawingRectAfter.top - viewportRectAfter.top) + ((Number(focus.worldY) || 0) * actualScaleAfter.y);
      const correctionX = focusViewportOffsetX - anchorViewportX;
      const correctionY = focusViewportOffsetY - anchorViewportY;
      if (Math.abs(correctionX) > 0.01 || Math.abs(correctionY) > 0.01) {
        state.pan.x = (Number(state.pan.x) || 0) + correctionX;
        state.pan.y = (Number(state.pan.y) || 0) + correctionY;
      }
    }

    applyViewportTransform();
  }

  function handleLocalViewportCanvasViewportChange() {
    preserveViewportAnchorAcrossViewportChange(() => {
      syncLocalViewportCanvasDockVisibility({ persist: false, render: true });
    });
  }

  function handleLocalViewportCanvasVisualViewportChange() {
    if (!isMultiCanvasWorldLayoutActive()) {
      handleLocalViewportCanvasViewportChange();
      return;
    }
    preserveViewportAnchorAcrossViewportChange(() => {
      syncAllProjectCanvasSurfaceDimensions();
      syncMultiCanvasWorldLayoutDisplayPositions();
      renderLocalViewportCanvasOverlays();
      syncMultiCanvasSelectionUi();
    });
  }

  function reconcileProjectCanvasesFromLocalViewportState() {
    const desiredCount = getLocalViewportCanvasCount();
    const currentCanvases = getProjectCanvasDocuments();
    const targetCanvasTotal = Math.max(1, desiredCount + 1);
    if (currentCanvases.length >= targetCanvasTotal) {
      return false;
    }
    const sourceCanvas = getActiveProjectCanvasDocument() || currentCanvases[0] || null;
    const nextCanvases = currentCanvases.map((canvas, index) => createProjectCanvasDocument(canvas, {
      clonePixelData: true,
      fallbackIndex: index + 1,
    }));
    while (nextCanvases.length < targetCanvasTotal) {
      nextCanvases.push(createBlankProjectCanvasDocument(sourceCanvas, nextCanvases.length + 1));
    }
    replaceProjectCanvasDocuments(nextCanvases, getActiveProjectCanvasDocument()?.id || nextCanvases[0]?.id || '');
    return true;
  }

  function setupLocalViewportCanvasDock() {
    ensureCanvasSurfaceContexts(mainViewportCanvasSurface);
    bindActiveCanvasSurface(mainViewportCanvasSurface);
    const mainDragHandle = ensureCanvasSurfaceDragHandle(mainViewportCanvasSurface);
    if (mainDragHandle instanceof HTMLElement) {
      mainDragHandle.hidden = true;
      mainDragHandle.setAttribute('aria-hidden', 'true');
    }
    if (reconcileProjectCanvasesFromLocalViewportState()) {
      bindActiveCanvasSurface(getProjectCanvasSurfaceForIndex(getActiveProjectCanvasIndex()) || mainViewportCanvasSurface);
    }
    if (dom.controls.addLocalCanvas instanceof HTMLButtonElement) {
      dom.controls.addLocalCanvas.addEventListener('click', event => {
        event.preventDefault();
        if (!canCurrentClientEditProjectStructure({ announce: true })) {
          if (!isSharedProjectCollaborativeMode()) {
            announceMultiCanvasEditRestriction();
          }
          syncControlsWithState();
          return;
        }
        adjustLocalViewportCanvasCount(1, { persist: true, announce: true, recordHistory: true });
      });
    }
    if (dom.controls.removeLocalCanvas instanceof HTMLButtonElement) {
      dom.controls.removeLocalCanvas.addEventListener('click', event => {
        event.preventDefault();
        if (!canCurrentClientEditProjectStructure({ announce: true })) {
          if (!isSharedProjectCollaborativeMode()) {
            announceMultiCanvasEditRestriction();
          }
          syncControlsWithState();
          return;
        }
        adjustLocalViewportCanvasCount(-1, { persist: true, announce: true, recordHistory: true });
      });
    }
    window.addEventListener('resize', handleLocalViewportCanvasViewportChange);
    window.addEventListener('orientationchange', handleLocalViewportCanvasViewportChange);
    if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
      window.visualViewport.addEventListener('resize', handleLocalViewportCanvasVisualViewportChange);
      window.visualViewport.addEventListener('scroll', handleLocalViewportCanvasVisualViewportChange);
    }
    syncLocalViewportCanvasDockVisibility({ persist: false, render: true });
  }

  return Object.freeze({
    getLocalViewportCanvasCount,
    isMultiCanvasWorldLayoutActive,
    setLocalViewportCanvasLayoutAnchor,
    getStoredLocalViewportCanvasPosition,
    getDisplayLocalViewportCanvasPosition,
    setLocalViewportCanvasPosition,
    assignAdjacentPositionForNewLocalViewportCanvases,
    requestLocalViewportCanvasLayoutReset,
    getProjectCanvasDocuments,
    getProjectCanvasCount,
    getProjectCanvasDocumentAt,
    getProjectCanvasDocumentById,
    normalizeSharedProjectCanvasId,
    resetSharedProjectCanvasIdentity,
    registerSharedProjectCanvasAlias,
    getSharedProjectCanonicalCanvasId,
    initializeSharedProjectCanvasIdentityFromCurrentDocument,
    resolveSharedProjectCanvasAlias,
    remapSharedProjectLayerSnapshotCanvasId,
    remapTimelapseSingleCanvasId,
    adoptSingleProjectCanvasId,
    getActiveProjectCanvasDocument,
    getActiveProjectCanvasIndex,
    getProjectCanvasViewScale,
    getProjectCanvasDisplayScale,
    storeProjectCanvasViewScale,
    syncActiveProjectCanvasViewScale,
    replaceProjectCanvasDocuments,
    collectCanvasDocumentIdentitySummary,
    compareSharedProjectSnapshotIdentity,
    createBlankProjectCanvasDocument,
    ensureCanvasSurfaceContexts,
    bindActiveCanvasSurface,
    bindCanvasSurfaceInteractionEvents,
    teardownCanvasSurfacePanelDragInteraction,
    stopCanvasSurfacePanelDragInteraction,
    beginCanvasSurfacePanelDragInteraction,
    handleCanvasSurfacePanelDragPointerMove,
    handleCanvasSurfacePanelDragPointerUp,
    handleCanvasSurfacePanelDragPointerCancel,
    ensureCanvasSurfaceDragHandle,
    createLocalViewportCanvasEntry,
    getProjectCanvasDocumentForEntry,
    getProjectCanvasSurfaceEntries,
    getProjectCanvasSurfaceForIndex,
    getProjectCanvasSurfaceByCanvasId,
    syncProjectCanvasSurfaceDocumentRefs,
    getCanvasInteractionSurfaceMetrics,
    setCanvasSurfaceDragHandleVisible,
    syncMultiCanvasSelectionUi,
    setHoveredProjectCanvasById,
    previewProjectCanvasSelection,
    commitPreviewProjectCanvasSelection,
    clearHoveredProjectCanvas,
    finalizePendingSelectionBeforeCanvasSwitch,
    setActiveProjectCanvasByIndex,
    flushActiveProjectCanvasUiSync,
    setSelectedMultiCanvas,
    syncLocalViewportCanvasEntryMetadata,
    getProjectCanvasFrameAt,
    getProjectCanvasActiveFrame,
    getProjectCanvasActiveLayer,
    getMainCanvasInteractionSurface,
    getLocalViewportCanvasEntryFromTarget,
    getCanvasInteractionSurfaceFromTarget,
    getResolvedCanvasInteractionSurface,
    syncActiveLayerFromInteractionSurface,
    syncProjectCanvasSurfaceDimensions,
    ensureLocalViewportCanvasEntries,
    computeLocalViewportCanvasLayout,
    computeDefaultLocalViewportCanvasPositions,
    computeDefaultLocalViewportCanvasWorldPosition,
    rectsOverlapWithGap,
    computeResolvedMultiCanvasWorldLayoutPositions,
    syncMultiCanvasWorldLayoutDisplayPositions,
    getViewportPanelZoomFocus,
    syncLocalViewportCanvasDockLayout,
    buildProjectCanvasImageData,
    buildVoxelPreviewCanvasCompositeImageData,
    buildVoxelPreviewCanvasCompositeImageDataForFrameIndex,
    renderProjectCanvasSurface,
    renderVoxelExtensionPreviewSurfaceNow,
    renderAllProjectCanvasSurfaces,
    syncAllProjectCanvasSurfaceDimensions,
    renderInactiveProjectCanvasSurfaces,
    renderLocalViewportCanvases,
    drawVoxelGuideOverlayOnSurface,
    drawVoxelProjectionOverlayOnMainSurface,
    renderVoxelGuideOverlays,
    renderLocalViewportCanvasOverlays,
    syncLocalViewportCanvasDockVisibility,
    resetTransientInteractionForCanvasStructureChange,
    setLocalViewportCanvasCount,
    adjustLocalViewportCanvasCount,
    isVoxelExtensionModeEnabled,
    getLocalViewportCanvasMaxCount,
    canUseVoxelExtensionMode,
    handleLocalViewportCanvasViewportChange,
    handleLocalViewportCanvasVisualViewportChange,
    reconcileProjectCanvasesFromLocalViewportState,
    setupLocalViewportCanvasDock,
  });
      }
    })(scope);
  }

  root.localViewportCanvasWorkflowUtils = Object.freeze({
    createLocalViewportCanvasWorkflowUtils,
  });
})();
