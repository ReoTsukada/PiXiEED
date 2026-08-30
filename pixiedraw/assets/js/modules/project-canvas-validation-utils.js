(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createProjectCanvasValidationUtils() {
    function validateCanvasCount(projectOrDocument, { maximum = 1 } = {}) {
      const documentPayload = projectOrDocument?.project?.document
        || projectOrDocument?.document
        || projectOrDocument
        || {};
      const count = Array.isArray(documentPayload.canvases) ? documentPayload.canvases.length : 1;
      if (count < 1) return { valid: false, code: 'ERR_CANVAS_COUNT_INVALID', count };
      if (count > maximum) {
        return { valid: false, code: 'ERR_CANVAS_LIMIT_EXCEEDED', count, maximum };
      }
      return { valid: true, count, maximum };
    }

    return Object.freeze({ validateCanvasCount });
  }

  root.projectCanvasValidationUtils = Object.freeze({ createProjectCanvasValidationUtils });
})();
