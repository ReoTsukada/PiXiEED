((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PiXiEEDrawModules = root.PiXiEEDrawModules || {};
    root.PiXiEEDrawModules.viewportGestureArbiterUtils = api;
  }
})(typeof window !== 'undefined' ? window : null, () => {
  const GestureMode = Object.freeze({
    IDLE: 'idle',
    TOOL_ACTIVE: 'tool-active',
    MOUSE_PAN: 'mouse-pan',
    TOUCH_UNDECIDED: 'touch-undecided',
    TOUCH_PAN: 'touch-pan',
    TOUCH_ZOOM: 'touch-zoom',
    CANCELLED_UNTIL_ALL_UP: 'cancelled-until-all-up',
  });

  const VIEWPORT_GESTURE_CONFIG = Object.freeze({
    TOUCH_SLOP_PX: 2,
    PAN_CENTROID_SLOP_PX: 2,
    ZOOM_DISTANCE_SLOP_PX: 1.5,
    ZOOM_RATIO_SLOP: 0.003,
    MIN_PINCH_START_DISTANCE_PX: 8,
    PAN_DOMINANCE_RATIO: 1,
    ZOOM_DOMINANCE_RATIO: 1.08,
    PAN_DIRECTION_DOT_MIN: 0.45,
    PAN_VECTOR_BALANCE_MIN: 0.25,
    ZOOM_OPPOSING_DIRECTION_DOT_MAX: -0.15,
    GESTURE_DECISION_TIMEOUT_MS: 80,
    MIN_FRAME_SCALE_FACTOR: 0.75,
    MAX_FRAME_SCALE_FACTOR: 1.333333,
    MIN_GESTURE_SCALE_FACTOR: 0.05,
    MAX_GESTURE_SCALE_FACTOR: 6,
    REQUIRE_ALL_TOUCHES_UP_AFTER_MULTITOUCH: true,
    ENABLE_GESTURE_DEBUG_LOG: false,
  });

  function getTwoPointMetrics(pointA, pointB) {
    if (!pointA || !pointB) return null;
    const ax = Number(pointA.x) || 0;
    const ay = Number(pointA.y) || 0;
    const bx = Number(pointB.x) || 0;
    const by = Number(pointB.y) || 0;
    return {
      centroid: { x: (ax + bx) / 2, y: (ay + by) / 2 },
      distance: Math.hypot(ax - bx, ay - by),
    };
  }

  function classifyTouchGesture({
    startCentroid,
    startDistance,
    currentCentroid,
    currentDistance,
    elapsedMs = 0,
    movementAnalysis = null,
    config = VIEWPORT_GESTURE_CONFIG,
  } = {}) {
    const panDisplacement = startCentroid && currentCentroid
      ? Math.hypot(currentCentroid.x - startCentroid.x, currentCentroid.y - startCentroid.y)
      : 0;
    const safeStartDistance = Math.max(0, Number(startDistance) || 0);
    const safeCurrentDistance = Math.max(0, Number(currentDistance) || 0);
    const zoomDistanceChange = Math.abs(safeCurrentDistance - safeStartDistance);
    const zoomRatioChange = safeStartDistance > 0
      ? Math.abs((safeCurrentDistance / safeStartDistance) - 1)
      : 0;
    const panCandidate = panDisplacement >= config.PAN_CENTROID_SLOP_PX;
    const zoomCandidate = safeStartDistance >= config.MIN_PINCH_START_DISTANCE_PX
      && zoomDistanceChange >= config.ZOOM_DISTANCE_SLOP_PX
      && zoomRatioChange >= config.ZOOM_RATIO_SLOP;
    const panScore = panDisplacement / Math.max(config.PAN_CENTROID_SLOP_PX, Number.EPSILON);
    const zoomScore = Math.max(
      zoomDistanceChange / Math.max(config.ZOOM_DISTANCE_SLOP_PX, Number.EPSILON),
      zoomRatioChange / Math.max(config.ZOOM_RATIO_SLOP, Number.EPSILON)
    );
    const firstMotion = Math.max(0, Number(movementAnalysis?.firstDistance) || 0);
    const secondMotion = Math.max(0, Number(movementAnalysis?.secondDistance) || 0);
    const bothTouchesMoved = firstMotion >= config.TOUCH_SLOP_PX
      && secondMotion >= config.TOUCH_SLOP_PX;
    const sameDirectionPan = bothTouchesMoved
      && Number(movementAnalysis?.normalizedDot) >= config.PAN_DIRECTION_DOT_MIN
      && Number(movementAnalysis?.balance) >= config.PAN_VECTOR_BALANCE_MIN;
    const opposingDirectionZoom = bothTouchesMoved
      && Number(movementAnalysis?.normalizedDot) <= config.ZOOM_OPPOSING_DIRECTION_DOT_MAX;
    // A stationary supporting finger is a normal pinch pattern.  Conversely,
    // two fingers that have both travelled together must remain a pan even if
    // their spacing jitters a few pixels.
    const singleFingerPinch = zoomCandidate && !bothTouchesMoved
      && Math.max(firstMotion, secondMotion) >= config.TOUCH_SLOP_PX;
    let mode = GestureMode.TOUCH_UNDECIDED;
    if (sameDirectionPan && panCandidate) {
      mode = GestureMode.TOUCH_PAN;
    } else if (zoomCandidate && (opposingDirectionZoom || singleFingerPinch)) {
      mode = GestureMode.TOUCH_ZOOM;
    } else if (panCandidate && !movementAnalysis && panScore >= zoomScore * config.PAN_DOMINANCE_RATIO) {
      mode = GestureMode.TOUCH_PAN;
    } else if (zoomCandidate && !movementAnalysis && zoomScore >= panScore * config.ZOOM_DOMINANCE_RATIO) {
      mode = GestureMode.TOUCH_ZOOM;
    } else if (elapsedMs >= config.GESTURE_DECISION_TIMEOUT_MS) {
      // Direction remains the tie-breaker after the short decision window.
      // When the motion is still ambiguous, favor a translating centroid over
      // a distance-only fluctuation so ordinary two-finger drags keep panning.
      if (opposingDirectionZoom || singleFingerPinch) mode = GestureMode.TOUCH_ZOOM;
      else if (panCandidate) mode = GestureMode.TOUCH_PAN;
      else if (zoomCandidate) mode = GestureMode.TOUCH_ZOOM;
    }
    return {
      mode,
      panDisplacement,
      zoomDistanceChange,
      zoomRatioChange,
      panScore,
      zoomScore,
      sameDirectionPan,
      opposingDirectionZoom,
      singleFingerPinch,
    };
  }

  function calculateTouchPan(startPan, startCentroid, currentCentroid) {
    return {
      x: (Number(startPan?.x) || 0) + ((Number(currentCentroid?.x) || 0) - (Number(startCentroid?.x) || 0)),
      y: (Number(startPan?.y) || 0) + ((Number(currentCentroid?.y) || 0) - (Number(startCentroid?.y) || 0)),
    };
  }

  function calculateTouchZoomScale(startScale, startDistance, currentDistance, config = VIEWPORT_GESTURE_CONFIG) {
    const safeStartDistance = Math.max(Number(startDistance) || 0, Number.EPSILON);
    const rawFactor = (Number(currentDistance) || safeStartDistance) / safeStartDistance;
    const factor = Math.min(Math.max(rawFactor, config.MIN_GESTURE_SCALE_FACTOR), config.MAX_GESTURE_SCALE_FACTOR);
    return (Number(startScale) || 1) * factor;
  }

  return Object.freeze({
    GestureMode,
    VIEWPORT_GESTURE_CONFIG,
    getTwoPointMetrics,
    classifyTouchGesture,
    calculateTouchPan,
    calculateTouchZoomScale,
  });
});
