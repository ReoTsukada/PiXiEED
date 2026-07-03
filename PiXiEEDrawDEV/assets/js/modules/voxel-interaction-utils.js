(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createVoxelInteractionUtils(rawScope = {}) {
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
  function getVoxelPreviewDragWidth(surface = null) {
    const drawing = surface?.drawing instanceof HTMLCanvasElement
      ? surface.drawing
      : null;
    const rect = drawing?.getBoundingClientRect?.();
    const width = rect && Number.isFinite(rect.width) ? rect.width : 0;
    return Math.max(96, Math.round(width || VOXEL_EXTENSION_PREVIEW_MAX_EDGE));
  }

  function getVoxelPreviewDragHeight(surface = null) {
    const drawing = surface?.drawing instanceof HTMLCanvasElement
      ? surface.drawing
      : null;
    const rect = drawing?.getBoundingClientRect?.();
    const height = rect && Number.isFinite(rect.height) ? rect.height : 0;
    return Math.max(96, Math.round(height || VOXEL_EXTENSION_PREVIEW_MAX_EDGE));
  }

  function startVoxelPreviewRotateInteraction(event, surface) {
    if (!(surface?.drawing instanceof HTMLCanvasElement)) {
      return false;
    }
    hoverPixel = null;
    requestOverlayRender();
    pointerState.active = true;
    pointerState.pointerId = event.pointerId;
    pointerState.surface = surface;
    pointerState.tool = 'voxelPreviewRotate';
    pointerState.start = null;
    pointerState.current = null;
    pointerState.last = null;
    pointerState.path = [];
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = null;
    pointerState.drawPaletteIndex = null;
    pointerState.selectionClearedOnDown = false;
    pointerState.selectionExtendOnDown = false;
    pointerState.startClient = { x: event.clientX, y: event.clientY };
    pointerState.voxelPreviewYawStart = normalizeVoxelPreviewYawDegrees(voxelExtensionState.previewYawDeg);
    pointerState.voxelPreviewPitchStart = normalizeVoxelPreviewPitchDegrees(voxelExtensionState.previewPitchDeg);
    pointerState.voxelPreviewDragWidth = getVoxelPreviewDragWidth(surface);
    pointerState.voxelPreviewDragHeight = getVoxelPreviewDragHeight(surface);
    pointerState.voxelPreviewYawChanged = false;
    pointerState.voxelPreviewLockedAxis = null;
    try {
      surface.drawing.setPointerCapture(event.pointerId);
    } catch (error) {
      // Ignore capture failures.
    }
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return true;
  }

  function updateVoxelPreviewYawFromDrag(event) {
    if (pointerState.tool !== 'voxelPreviewRotate' || event.pointerId !== pointerState.pointerId) {
      return false;
    }
    const dragWidth = Math.max(96, Number(pointerState.voxelPreviewDragWidth) || VOXEL_EXTENSION_PREVIEW_MAX_EDGE);
    const dragHeight = Math.max(96, Number(pointerState.voxelPreviewDragHeight) || VOXEL_EXTENSION_PREVIEW_MAX_EDGE);
    const startYaw = normalizeVoxelPreviewYawDegrees(pointerState.voxelPreviewYawStart);
    const startPitch = normalizeVoxelPreviewPitchDegrees(pointerState.voxelPreviewPitchStart);
    const deltaX = (Number(event.clientX) || 0) - (Number(pointerState.startClient?.x) || 0);
    const deltaY = (Number(event.clientY) || 0) - (Number(pointerState.startClient?.y) || 0);
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    if (!pointerState.voxelPreviewLockedAxis) {
      const deadzone = Math.max(1, Math.round(VOXEL_PREVIEW_DRAG_AXIS_LOCK_DEADZONE_PX));
      if (Math.max(absDeltaX, absDeltaY) < deadzone) {
        return false;
      }
      if (absDeltaX >= absDeltaY + deadzone) {
        pointerState.voxelPreviewLockedAxis = 'horizontal';
      } else if (absDeltaY >= absDeltaX + deadzone) {
        pointerState.voxelPreviewLockedAxis = 'vertical';
      } else {
        return false;
      }
    }
    const lockedDeltaX = pointerState.voxelPreviewLockedAxis === 'horizontal' ? deltaX : 0;
    const lockedDeltaY = pointerState.voxelPreviewLockedAxis === 'vertical' ? deltaY : 0;
    const nextYawDeg = normalizeVoxelPreviewYawDegrees(startYaw + ((lockedDeltaX / dragWidth) * VOXEL_PREVIEW_DRAG_TURN_DEGREES));
    const nextPitchDeg = normalizeVoxelPreviewPitchDegrees(
      startPitch - ((lockedDeltaY / dragHeight) * VOXEL_PREVIEW_DRAG_TILT_DEGREES)
    );
    if (
      nextYawDeg === normalizeVoxelPreviewYawDegrees(voxelExtensionState.previewYawDeg)
      && nextPitchDeg === normalizeVoxelPreviewPitchDegrees(voxelExtensionState.previewPitchDeg)
    ) {
      return false;
    }
    voxelExtensionState = normalizeVoxelExtensionState({
      ...voxelExtensionState,
      previewYawDeg: nextYawDeg,
      previewPitchDeg: nextPitchDeg,
    }, VOXEL_EXTENSION_DEFAULT_STATE);
    setVoxelPreviewOrientationForFrameIndex(state.activeFrame, nextYawDeg, nextPitchDeg);
    pointerState.voxelPreviewYawChanged = true;
    renderVoxelExtensionPreviewSurfaceNow({ updateViewport: false });
    requestRender();
    return true;
  }

  function finishVoxelPreviewRotateInteraction({ persist = true } = {}) {
    if (pointerState.pointerId !== null && pointerState.surface?.drawing instanceof HTMLCanvasElement) {
      try {
        pointerState.surface.drawing.releasePointerCapture(pointerState.pointerId);
      } catch (error) {
        // Ignore capture release failures.
      }
    }
    detachPointerListeners();
    const yawChanged = Boolean(pointerState.voxelPreviewYawChanged);
    pointerState.active = false;
    pointerState.pointerId = null;
    pointerState.surface = null;
    pointerState.voxelPreviewLockedAxis = null;
    pointerState.tool = null;
    pointerState.start = null;
    pointerState.current = null;
    pointerState.last = null;
    pointerState.path = [];
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = null;
    pointerState.drawPaletteIndex = null;
    pointerState.selectionClearedOnDown = false;
    pointerState.selectionExtendOnDown = false;
    pointerState.startClient = null;
    pointerState.voxelPreviewYawStart = null;
    pointerState.voxelPreviewDragWidth = null;
    pointerState.voxelPreviewPitchStart = null;
    pointerState.voxelPreviewDragHeight = null;
    pointerState.voxelPreviewYawChanged = false;
    if (persist && yawChanged) {
      markDocumentUnsavedChange();
      markAutosaveDirty();
      requestImmediateAutosaveSnapshot();
      scheduleSessionPersist();
    } else if (persist) {
      scheduleSessionPersist();
    }
    requestOverlayRender();
  }

  return Object.freeze({
    getVoxelPreviewDragWidth,
    getVoxelPreviewDragHeight,
    startVoxelPreviewRotateInteraction,
    updateVoxelPreviewYawFromDrag,
    finishVoxelPreviewRotateInteraction,
  });
      }
    })(scope);
  }

  root.voxelInteractionUtils = Object.freeze({
    createVoxelInteractionUtils,
  });
})();
