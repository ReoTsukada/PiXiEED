(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createTimelapseUtils({
    TIMELAPSE_DEFAULT_FPS,
    TIMELAPSE_MIN_FPS,
    TIMELAPSE_MAX_FPS,
    clamp,
  } = {}) {
    function normalizeTimelapseFps(value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        return TIMELAPSE_DEFAULT_FPS;
      }
      return clamp(Math.round(parsed), TIMELAPSE_MIN_FPS, TIMELAPSE_MAX_FPS);
    }

    function createEmptyTimelapseTrack() {
      return {
        snapshots: [],
        operationLog: null,
        warningShown: false,
        sampleStep: 1,
        lastCaptureToken: -1,
      };
    }

    function createEmptyTimelapseOperationLog() {
      return {
        version: 1,
        baseSnapshot: null,
        entries: [],
      };
    }

    function normalizeFpsValue(value) {
      return clamp(Math.round(Number(value) || 0), 1, 60);
    }

    function getDurationFromFps(fps) {
      if (!Number.isFinite(fps) || fps <= 0) {
        return 1000 / 12;
      }
      return 1000 / fps;
    }

    return Object.freeze({
      normalizeTimelapseFps,
      createEmptyTimelapseTrack,
      createEmptyTimelapseOperationLog,
      normalizeFpsValue,
      getDurationFromFps,
    });
  }

  root.timelapseUtils = Object.freeze({
    createTimelapseUtils,
  });
})();
