(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createProjectStorageV2MultisheetCandidateUtils({
    validateSheetCanvasCount,
    normalizeLocalViewportCanvasState,
    LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE,
  } = {}) {
    const clone = value => typeof structuredClone === 'function'
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
    const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

    function sanitizeProject(project) {
      if (!isObject(project)) return null;
      const next = clone(project);
      delete next.projectSaveHandle;
      delete next.projectSaveHandleMeta;
      delete next.autosaveHandle;
      delete next.pendingAutosaveHandle;
      return next;
    }

    function validateTimelapse(session, includeTimelapse) {
      if (!includeTimelapse) return '';
      const timelapse = session?.timelapse;
      if (!isObject(timelapse) || !isObject(timelapse.byCanvas) || !isObject(timelapse.operationLogsByCanvas)) {
        return 'timelapse-invalid';
      }
      return '';
    }

    function collectCompleteMultiSheetV2SaveCandidate({
      openProjectTabs = [],
      activeSheetId = '',
      activePackagedProject = null,
      resolveStoredProjectForSheet = null,
      includeTimelapse = true,
    } = {}) {
      const tabs = Array.isArray(openProjectTabs) ? openProjectTabs.filter(isObject) : [];
      const resolvedActiveSheetId = typeof activeSheetId === 'string' && activeSheetId
        ? activeSheetId
        : (tabs[0]?.id || '');
      const errors = [];
      const sheets = tabs.map((tab, index) => {
        const isActive = tab.id === resolvedActiveSheetId;
        const sourceProject = isActive && isObject(activePackagedProject)
          ? activePackagedProject
          : (isObject(tab.project) ? tab.project : resolveStoredProjectForSheet?.(tab));
        const project = sanitizeProject(sourceProject);
        if (!project) {
          errors.push({ code: 'sheet-materialization-failed', sheetId: tab.id || `sheet-${index + 1}` });
          return null;
        }
        if (!isObject(project.document) || !isObject(project.session)) {
          errors.push({ code: 'sheet-payload-invalid', sheetId: tab.id || `sheet-${index + 1}` });
          return null;
        }
        const canvas = validateSheetCanvasCount?.({ project }) || { valid: true };
        if (!canvas.valid) {
          errors.push({ code: canvas.code || 'canvas-limit-exceeded', sheetId: tab.id || `sheet-${index + 1}` });
          return null;
        }
        const timelapseError = validateTimelapse(project.session, includeTimelapse);
        if (timelapseError) {
          errors.push({ code: timelapseError, sheetId: tab.id || `sheet-${index + 1}` });
          return null;
        }
        if (typeof normalizeLocalViewportCanvasState === 'function') {
          project.session.localViewportCanvases = normalizeLocalViewportCanvasState(
            project.session.localViewportCanvases,
            LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE
          );
        }
        return {
          id: typeof tab.id === 'string' && tab.id ? tab.id : `sheet-${index + 1}`,
          fileName: typeof tab.fileName === 'string' ? tab.fileName : (project.document.documentName || ''),
          label: typeof tab.label === 'string' ? tab.label : `Sheet ${index + 1}`,
          updatedAt: typeof tab.updatedAt === 'string' ? tab.updatedAt : (project.updatedAt || ''),
          source: typeof tab.source === 'string' ? tab.source : 'sheet',
          sourceKind: typeof tab.sourceKind === 'string' ? tab.sourceKind : 'unknown',
          sourceStorageAdapterId: typeof tab.sourceStorageAdapterId === 'string' ? tab.sourceStorageAdapterId : null,
          sourceProjectToken: typeof tab.sourceProjectToken === 'string' ? tab.sourceProjectToken : null,
          qrMetadata: tab.qrEditPayload || null,
          importMetadata: tab.importMetadata || null,
          unsaved: Boolean(tab.unsaved),
          project,
        };
      }).filter(Boolean);
      const sheetOrder = sheets.map(sheet => sheet.id);
      const uniqueIds = new Set(sheetOrder);
      if (sheets.length !== tabs.length) errors.push({ code: 'sheet-package-incomplete' });
      if (uniqueIds.size !== sheetOrder.length) errors.push({ code: 'sheet-order-invalid' });
      if (!sheetOrder.includes(resolvedActiveSheetId)) errors.push({ code: 'active-sheet-invalid' });
      const complete = errors.length === 0 && sheets.length === tabs.length;
      const packaged = complete
        ? {
            ...sanitizeProject(activePackagedProject),
            sheets,
            sheetOrder,
            activeSheetId: resolvedActiveSheetId,
          }
        : null;
      return {
        includeSheets: true,
        openSheetCount: tabs.length,
        packagedSheetCount: sheets.length,
        sheetOrder,
        activeSheetId: resolvedActiveSheetId,
        sheets,
        packaged,
        complete,
        warnings: [],
        errors,
      };
    }

    return Object.freeze({ collectCompleteMultiSheetV2SaveCandidate });
  }

  root.projectStorageV2MultisheetCandidateUtils = Object.freeze({ createProjectStorageV2MultisheetCandidateUtils });
})();
