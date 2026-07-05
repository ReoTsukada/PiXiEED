(() => {
  if (typeof window === 'undefined' || !window.document) {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createViewportZoomUtils({
    state,
    DEFAULT_CANVAS_SIZE,
    MIN_ZOOM_RATIO,
    MAX_ZOOM_RATIO,
    MIN_ZOOM_SCALE,
    MAX_ZOOM_SCALE,
    MAX_ZOOM_BASE_SCALE,
    SMALL_CANVAS_BASE_VIEWPORT_FILL_RATIO,
    ZOOM_STEPS,
    ZOOM_EPSILON,
    getViewportZoomRatio,
    setViewportZoomRatio,
    getViewportVisibilityTargetSurface,
    getProjectCanvasCount,
    getProjectCanvasDocumentAt,
    getProjectCanvasDocumentById,
    getActiveProjectCanvasDocument,
    getMainCanvasViewportElement,
    isMultiCanvasWorldLayoutActive,
    clamp,
  } = {}) {
    function shouldUseProjectZoomBase() {
      try {
        if (typeof isMultiCanvasWorldLayoutActive === 'function' && isMultiCanvasWorldLayoutActive()) {
          return true;
        }
      } catch (error) {
        // Fall through to the count check.
      }
      try {
        return typeof getProjectCanvasCount === 'function' && Number(getProjectCanvasCount()) > 1;
      } catch (error) {
        return false;
      }
    }

    function getProjectZoomBaseCanvasDocument() {
      try {
        return getProjectCanvasDocumentAt?.(0) || null;
      } catch (error) {
        return null;
      }
    }

    function getZoomBaseCanvasDocument(canvasDoc = null) {
      if (canvasDoc && typeof canvasDoc === 'object') {
        return canvasDoc;
      }
      if (shouldUseProjectZoomBase()) {
        const projectBaseDocument = getProjectZoomBaseCanvasDocument();
        if (projectBaseDocument) {
          return projectBaseDocument;
        }
      }
      let targetSurface = null;
      try {
        targetSurface = getViewportVisibilityTargetSurface();
      } catch (error) {
        targetSurface = null;
      }
      let documentById = null;
      try {
        documentById = getProjectCanvasDocumentById(targetSurface?.canvasDocId);
      } catch (error) {
        documentById = null;
      }
      let activeDocument = null;
      try {
        activeDocument = getActiveProjectCanvasDocument();
      } catch (error) {
        activeDocument = null;
      }
      let fallbackWidth = DEFAULT_CANVAS_SIZE;
      let fallbackHeight = DEFAULT_CANVAS_SIZE;
      try {
        fallbackWidth = Number(state?.width) || DEFAULT_CANVAS_SIZE;
        fallbackHeight = Number(state?.height) || DEFAULT_CANVAS_SIZE;
      } catch (error) {
        fallbackWidth = DEFAULT_CANVAS_SIZE;
        fallbackHeight = DEFAULT_CANVAS_SIZE;
      }
      return targetSurface?.canvasDoc
        || documentById
        || activeDocument
        || { width: fallbackWidth, height: fallbackHeight };
    }

    function getViewportZoomBaseScale(canvasDoc = null) {
      const doc = getZoomBaseCanvasDocument(canvasDoc);
      let fallbackWidth = DEFAULT_CANVAS_SIZE;
      let fallbackHeight = DEFAULT_CANVAS_SIZE;
      try {
        fallbackWidth = Number(state?.width) || DEFAULT_CANVAS_SIZE;
        fallbackHeight = Number(state?.height) || DEFAULT_CANVAS_SIZE;
      } catch (error) {
        fallbackWidth = DEFAULT_CANVAS_SIZE;
        fallbackHeight = DEFAULT_CANVAS_SIZE;
      }
      const canvasWidth = Math.max(1, Math.round(Number(doc?.width) || fallbackWidth));
      const canvasHeight = Math.max(1, Math.round(Number(doc?.height) || fallbackHeight));
      const viewport = getMainCanvasViewportElement();
      const viewportRect = viewport instanceof HTMLElement ? viewport.getBoundingClientRect() : null;
      const viewportWidth = Math.max(
        1,
        Math.round(
          Number(viewport?.clientWidth)
          || Number(viewportRect?.width)
          || Number(window.innerWidth)
          || canvasWidth
        )
      );
      const viewportHeight = Math.max(
        1,
        Math.round(
          Number(viewport?.clientHeight)
          || Number(viewportRect?.height)
          || Number(window.innerHeight)
          || canvasHeight
        )
      );
      const fitScale = Math.min(viewportWidth / canvasWidth, viewportHeight / canvasHeight);
      if (!Number.isFinite(fitScale) || fitScale <= 0) {
        return MIN_ZOOM_RATIO;
      }
      const baseScale = fitScale < 1
        ? fitScale
        : Math.max(MIN_ZOOM_RATIO, Math.min(fitScale, fitScale * SMALL_CANVAS_BASE_VIEWPORT_FILL_RATIO));
      return clamp(baseScale, MIN_ZOOM_SCALE, MAX_ZOOM_BASE_SCALE);
    }

    function getZoomRatioForScale(scale, canvasDoc = null) {
      const baseScale = getViewportZoomBaseScale(canvasDoc);
      const numericScale = Number(scale);
      const effectiveScale = Number.isFinite(numericScale) && numericScale > 0
        ? numericScale
        : baseScale;
      return effectiveScale / Math.max(MIN_ZOOM_SCALE, baseScale);
    }

    function getZoomStepIndexForRatio(ratio) {
      if (!Number.isFinite(ratio)) {
        return 0;
      }
      let bestIndex = 0;
      let bestDiff = Number.POSITIVE_INFINITY;
      for (let i = 0; i < ZOOM_STEPS.length; i += 1) {
        const diff = Math.abs(ZOOM_STEPS[i] - ratio);
        if (diff < bestDiff - ZOOM_EPSILON) {
          bestDiff = diff;
          bestIndex = i;
        }
      }
      return bestIndex;
    }

    function normalizeZoomRatio(value, fallback = MIN_ZOOM_RATIO) {
      const numeric = Number(value);
      const fallbackNumeric = Number(fallback);
      const effective = Number.isFinite(numeric)
        ? numeric
        : (Number.isFinite(fallbackNumeric) ? fallbackNumeric : MIN_ZOOM_RATIO);
      return clamp(effective, MIN_ZOOM_RATIO, MAX_ZOOM_RATIO);
    }

    function getZoomScaleForRatio(ratio, canvasDoc = null) {
      const normalizedRatio = normalizeZoomRatio(ratio, getViewportZoomRatio?.() || MIN_ZOOM_RATIO);
      const baseScale = getViewportZoomBaseScale(canvasDoc);
      return clamp(baseScale * normalizedRatio, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
    }

    function syncViewportZoomScaleToBase({ preserveRatio = true, canvasDoc = null } = {}) {
      const currentScale = Number(state.scale) || getViewportZoomBaseScale(canvasDoc);
      const currentViewportZoomRatio = getViewportZoomRatio?.();
      const nextRatio = preserveRatio && Number.isFinite(currentViewportZoomRatio)
        ? normalizeZoomRatio(currentViewportZoomRatio)
        : normalizeZoomRatio(getZoomRatioForScale(currentScale, canvasDoc));
      setViewportZoomRatio?.(nextRatio);
      state.scale = getZoomScaleForRatio(nextRatio, canvasDoc);
      return state.scale;
    }

    function resetViewportZoomRatio(ratio = MIN_ZOOM_RATIO) {
      const nextRatio = normalizeZoomRatio(ratio, MIN_ZOOM_RATIO);
      setViewportZoomRatio?.(nextRatio);
      state.scale = getZoomScaleForRatio(nextRatio);
      return state.scale;
    }

    function rememberViewportZoomRatioFromScale(scale = state.scale) {
      const nextRatio = normalizeZoomRatio(getZoomRatioForScale(scale), getViewportZoomRatio?.() || MIN_ZOOM_RATIO);
      setViewportZoomRatio?.(nextRatio);
      return nextRatio;
    }

    function getZoomStepIndex(scale) {
      return getZoomStepIndexForRatio(getZoomRatioForScale(scale));
    }

    function getZoomScaleAtIndex(index) {
      const numeric = Number(index);
      const clampedIndex = Math.min(Math.max(Number.isFinite(numeric) ? Math.round(numeric) : 0, 0), ZOOM_STEPS.length - 1);
      return getZoomScaleForRatio(ZOOM_STEPS[clampedIndex] || MIN_ZOOM_RATIO);
    }

    function parseZoomInputScale(value) {
      const percent = Number(value);
      if (!Number.isFinite(percent)) {
        return null;
      }
      return getZoomScaleForRatio(normalizeZoomRatio(percent / 100, getViewportZoomRatio?.() || MIN_ZOOM_RATIO));
    }

    function normalizeZoomScale(value, fallback = MIN_ZOOM_SCALE) {
      const base = Number.isFinite(value) ? Number(value) : Number(fallback);
      const effective = Number.isFinite(base) ? base : getViewportZoomBaseScale();
      return getZoomScaleForRatio(normalizeZoomRatio(getZoomRatioForScale(effective)));
    }

    function formatZoomLabel(scale) {
      const percent = normalizeZoomRatio(getZoomRatioForScale(scale), getViewportZoomRatio?.() || MIN_ZOOM_RATIO) * 100;
      const roundedTenth = Math.round(percent * 10) / 10;
      const isWhole = Math.abs(roundedTenth - Math.round(roundedTenth)) < 0.05;
      const value = isWhole ? Math.round(roundedTenth) : Number(roundedTenth.toFixed(1));
      return `${value}%`;
    }

    function normalizeProjectCanvasViewScale(value, fallback = 8) {
      return normalizeZoomScale(value, fallback);
    }

    function getDefaultCanvasViewportScale(canvasDoc = null) {
      const width = Math.max(1, Math.round(Number(canvasDoc?.width) || DEFAULT_CANVAS_SIZE));
      const height = Math.max(1, Math.round(Number(canvasDoc?.height) || DEFAULT_CANVAS_SIZE));
      return getZoomScaleForRatio(1, { width, height });
    }

    return {
      normalizeProjectCanvasViewScale,
      getDefaultCanvasViewportScale,
      getZoomBaseCanvasDocument,
      getViewportZoomBaseScale,
      getZoomRatioForScale,
      getZoomStepIndexForRatio,
      normalizeZoomRatio,
      getZoomScaleForRatio,
      syncViewportZoomScaleToBase,
      resetViewportZoomRatio,
      rememberViewportZoomRatioFromScale,
      getZoomStepIndex,
      getZoomScaleAtIndex,
      parseZoomInputScale,
      normalizeZoomScale,
      formatZoomLabel,
    };
  }

  root.viewportZoomUtils = {
    createViewportZoomUtils,
  };
})();
