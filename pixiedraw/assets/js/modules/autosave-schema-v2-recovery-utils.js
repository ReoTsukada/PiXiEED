(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createAutosaveSchemaV2RecoveryUtils() {
    const clone = value => JSON.parse(JSON.stringify(value));
    const emptyTimelapse = () => ({ enabled: true, fps: 12, byCanvas: {}, operationLogsByCanvas: {} });

    function sanitizeProject(project) {
      const next = project && typeof project === 'object' ? project : {};
      const documentPayload = next.document || {};
      const canvases = Array.isArray(documentPayload.canvases) ? documentPayload.canvases : [documentPayload];
      if (canvases.length > 4) return { ok: false, reason: 'canvas-limit-exceeded' };
      const session = next.session || {};
      if (!Array.isArray(session.historyPast) || !Array.isArray(session.historyFuture)) {
        next.session = { ...session, historyPast: [], historyFuture: [], recoveryWarning: 'history-reset' };
      }
      if (!next.session.timelapse || typeof next.session.timelapse !== 'object') next.session.timelapse = emptyTimelapse();
      delete next.projectSaveHandle;
      delete next.projectSaveHandleMeta;
      delete next.autosaveHandle;
      delete next.pendingAutosaveHandle;
      delete next.sheets;
      delete next.sheetOrder;
      delete next.activeSheetId;
      next.projectLayout = 'single-project';
      return { ok: true, project: next };
    }

    function buildCandidate(payload, { sourceProjectId = '', revision = 0 } = {}) {
      try {
        const raw = clone(payload);
        // Legacy V2 recovery remains readable: use its active/root document
        // and do not re-create its resident tab collection.
        const legacySheets = Array.isArray(raw?.sheets) ? raw.sheets : [];
        const activeLegacy = legacySheets.find(sheet => sheet?.id === raw.activeSheetId)?.project
          || legacySheets[0]?.project
          || raw;
        const result = sanitizeProject(activeLegacy);
        if (!result.ok) return { ok: false, reason: result.reason, errors: ['project'] };
        result.project.recoverySource = 'autosave-v2-experimental';
        result.project.recoveryProjectId = sourceProjectId;
        result.project.recoveryRevision = revision;
        return { ok: true, project: result.project, warnings: legacySheets.length > 1 ? ['legacy-multi-project-collapsed'] : [] };
      } catch (error) {
        return { ok: false, reason: 'unrestorable', errors: [error?.message || String(error)] };
      }
    }

    return Object.freeze({ buildCandidate });
  }

  root.autosaveSchemaV2RecoveryUtils = Object.freeze({ createAutosaveSchemaV2RecoveryUtils });
})();
