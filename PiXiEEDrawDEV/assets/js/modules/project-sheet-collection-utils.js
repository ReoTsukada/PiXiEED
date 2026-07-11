(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  function createProjectSheetCollectionUtils() {
    const MAX_CANVASES_PER_SHEET = 4;
    const clone = value => {
      if (typeof structuredClone === 'function') return structuredClone(value);
      return JSON.parse(JSON.stringify(value));
    };
    function validateSheetCanvasCount(sheetOrDocument, { maximum = MAX_CANVASES_PER_SHEET } = {}) {
      const documentPayload = sheetOrDocument?.project?.document || sheetOrDocument?.document || sheetOrDocument || {};
      const count = Array.isArray(documentPayload.canvases) ? documentPayload.canvases.length : 1;
      if (count < 1) return { valid: false, code: 'ERR_CANVAS_COUNT_INVALID', count };
      if (count > maximum) return { valid: false, code: 'ERR_CANVAS_LIMIT_EXCEEDED', count, maximum };
      return { valid: true, count, maximum };
    }
    function validateProjectSheetsCollection(sheets, { sheetOrder = null, activeSheetId = '' } = {}) {
      if (!Array.isArray(sheets) || !sheets.length) return { valid: false, code: 'ERR_SHEET_COLLECTION_EMPTY' };
      const ids = new Set();
      for (const sheet of sheets) { if (!sheet?.id || !sheet?.project) return { valid: false, code: 'ERR_SHEET_PAYLOAD_INVALID' }; if (ids.has(sheet.id)) return { valid: false, code: 'ERR_SHEET_ID_DUPLICATE', id: sheet.id }; ids.add(sheet.id); const canvas = validateSheetCanvasCount(sheet); if (!canvas.valid) return { valid: false, ...canvas, sheetId: sheet.id }; }
      const order = Array.isArray(sheetOrder) ? sheetOrder : sheets.map(sheet => sheet.id);
      if (order.length !== sheets.length || order.some(id => !ids.has(id))) return { valid: false, code: 'ERR_SHEET_ORDER_INVALID' };
      if (activeSheetId && !ids.has(activeSheetId)) return { valid: false, code: 'ERR_ACTIVE_SHEET_INVALID' };
      return { valid: true, count: sheets.length, sheetOrder: order };
    }
    function prepareSheetCandidate(kind, input = {}, context = {}) {
      const project = input.project ? clone(input.project) : null;
      const id = input.id || context.createId?.() || `sheet-${Date.now()}`;
      return {
        kind,
        id,
        project,
        fileName: input.fileName || project?.document?.documentName || '',
        label: input.label || '',
        sourceKind: input.sourceKind || kind,
        sourceStorageAdapterId: input.sourceStorageAdapterId || null,
        sourceProjectToken: input.sourceProjectToken || context.createToken?.() || '',
        // Source identity is diagnostic-only. Runtime ownership is always new.
        sourceProjectId: input.sourceProjectId || null,
        sourceSheetId: input.sourceSheetId || null,
        runtimeProjectId: input.runtimeProjectId || context.createRuntimeProjectId?.() || `${id}:runtime-project`,
        sheetRuntimeId: input.sheetRuntimeId || context.createRuntimeId?.() || `${id}:runtime`,
        deferredPayloadKey: input.deferredPayloadKey || context.createDeferredPayloadKey?.() || `${id}:deferred`,
        sheetPersistenceKey: input.sheetPersistenceKey || context.createPersistenceKey?.() || `${id}:persistence`,
        localPersistenceKey: input.localPersistenceKey || context.createLocalPersistenceKey?.() || `${id}:local`,
        autosaveV2SheetId: input.autosaveV2SheetId || context.createAutosaveV2SheetId?.() || `${id}:autosave-v2`,
        historyOwnerId: input.historyOwnerId || context.createHistoryOwnerId?.() || `${id}:history`,
        timelapseOwnerId: input.timelapseOwnerId || context.createTimelapseOwnerId?.() || `${id}:timelapse`,
        projectSaveHandle: null,
        projectSaveHandleMeta: null,
      };
    }
    function validateSheetCandidate(candidate) { if (!candidate?.id || !candidate.project) return { valid: false, code: 'ERR_SHEET_CANDIDATE_INVALID' }; return validateProjectSheetsCollection([candidate], { activeSheetId: candidate.id }); }
    return Object.freeze({ MAX_CANVASES_PER_SHEET, validateSheetCanvasCount, validateProjectSheetsCollection, prepareSheetCandidate, validateSheetCandidate });
  }
  root.projectSheetCollectionUtils = Object.freeze({ createProjectSheetCollectionUtils });
})();
