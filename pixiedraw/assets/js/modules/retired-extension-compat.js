(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  const noop = () => undefined;
  const returnFalse = () => false;
  const returnNull = () => null;
  const returnEmptyObject = () => ({});

  function createRetiredExtensionStaticConfig({
    EXTENSION_MODE_NONE = 'none',
    VOXEL_EXTENSION_DEFAULT_YAW_DEG = 0,
    VOXEL_EXTENSION_PREVIEW_ELEVATION_DEG = 32,
  } = {}) {
    return Object.freeze({
      VOXEL_EXTENSION_LABELS: Object.freeze({}),
      VOXEL_EXTENSION_PROJECT_NAMES: Object.freeze({}),
      VOXEL_EXTENSION_ROLES: Object.freeze([]),
      VOXEL_EXTENSION_DEFAULT_STATE: Object.freeze({
        mode: EXTENSION_MODE_NONE,
        frontCanvasId: '',
        backCanvasId: '',
        leftCanvasId: '',
        rightCanvasId: '',
        topCanvasId: '',
        bottomCanvasId: '',
        previewCanvasId: '',
        previewYawDeg: VOXEL_EXTENSION_DEFAULT_YAW_DEG,
        previewPitchDeg: VOXEL_EXTENSION_PREVIEW_ELEVATION_DEG,
        displayPx: 0,
      }),
    });
  }

  function createRetiredModeUtils(rawScope = {}) {
    const localize = typeof rawScope.localizeText === 'function'
      ? rawScope.localizeText
      : (ja, en) => ja || en || '';
    const getOrientation = (_frameIndex, yawDeg = 0, pitchDeg = 32) => ({ yawDeg, pitchDeg });
    const syncRetiredUi = () => {
      const controls = rawScope.dom?.controls;
      if (controls?.toggleVoxelExtensionMode instanceof HTMLInputElement) {
        controls.toggleVoxelExtensionMode.checked = false;
        controls.toggleVoxelExtensionMode.disabled = true;
      }
      if (controls?.voxelExtensionField instanceof HTMLElement) {
        controls.voxelExtensionField.hidden = true;
      }
    };
    return Object.freeze({
      getVoxelExtensionProjectName: () => '',
      getVoxelExtensionRoleLabel: () => '',
      getVoxelPreviewCanvasLabel: () => '',
      getVoxelCanvasDisplayLabel: canvas => canvas?.name || localize('未設定', 'Empty'),
      getVoxelExtensionCanvasIndexByRole: () => -1,
      getActiveVoxelExtensionRole: () => '',
      setActiveVoxelExtensionRole: returnFalse,
      rotateVoxelNavigatorVector: vector => vector || { x: 0, y: 0, z: 0 },
      getVoxelNavigatorFaceDepths: returnEmptyObject,
      getVoxelNavigatorFrontRole: () => '',
      renderVoxelNavigatorUi: noop,
      renderFloatingPreviewGizmo: noop,
      getVoxelExtensionResolvedCanvases: returnEmptyObject,
      syncVoxelExtensionCanvasIdsFromDocuments: noop,
      getVoxelExtensionCanvasRoleById: () => '',
      isVoxelPreviewCanvasId: returnFalse,
      announceVoxelPreviewReadonly: noop,
      hasCanvasDocumentVisiblePixels: returnFalse,
      getVoxelExtensionOverwriteConfirmation: returnFalse,
      getProjectCanvasCompositePixelsForVoxel: returnNull,
      getVoxelSourcePixel: returnNull,
      getVoxelSourceAlpha: () => 0,
      getVoxelOpaqueBounds: returnNull,
      getVoxelBoundedPixel: returnNull,
      hasVoxelBoundedAlpha: returnFalse,
      pickVoxelColorChain: returnNull,
      getVoxelPreviewOrientationForFrame: getOrientation,
      setVoxelPreviewOrientationForFrame: returnFalse,
      setVoxelPreviewOrientationForFrameIndex: returnFalse,
      getVoxelPreviewOrientationForFrameIndex: getOrientation,
      syncVoxelExtensionCanvasBadges: noop,
      syncVoxelExtensionModeUi: syncRetiredUi,
      syncVoxelExtensionPreviewFromSource: returnFalse,
      ensureVoxelExtensionCanvasSetup: returnFalse,
      setVoxelExtensionModeEnabled: returnFalse,
    });
  }

  root.voxelModeUtils = Object.freeze({
    createVoxelExtensionStaticConfig: createRetiredExtensionStaticConfig,
    createVoxelModeUtils: createRetiredModeUtils,
  });
  root.voxelInteractionUtils = Object.freeze({
    createVoxelInteractionUtils: () => Object.freeze({
      getVoxelPreviewDragWidth: () => 0,
      getVoxelPreviewDragHeight: () => 0,
      startVoxelPreviewRotateInteraction: returnFalse,
      updateVoxelPreviewYawFromDrag: returnFalse,
      finishVoxelPreviewRotateInteraction: noop,
    }),
  });
  root.voxelPreviewUtils = Object.freeze({
    createVoxelPreviewUtils: () => Object.freeze({
      scaleVoxelPreviewPixels: returnNull,
      shadeVoxelColor: color => color || null,
      getVoxelPreviewProjectionScales: returnEmptyObject,
      getVoxelPreviewProjectionBoundsMax: returnEmptyObject,
      getVoxelPreviewFixedProjectionScale: () => 1,
      projectVoxelPreviewPoint: returnNull,
      fillVoxelPolygonRgba: noop,
      buildVoxelPreviewPixels: returnNull,
    }),
  });
  root.voxelGlbUtils = Object.freeze({
    createVoxelGlbUtils: () => Object.freeze({
      buildVoxelGlbBinaryFromCanvases: returnNull,
    }),
  });
})();
