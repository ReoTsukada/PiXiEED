(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createLocalProjectV2MigrationUtils() {
    function cloneJson(value, fallback = null) {
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (_error) {
        return fallback;
      }
    }

    function collectLegacyCollections(packaged = null) {
      const sheets = Array.isArray(packaged?.sheets)
        ? packaged.sheets.filter(sheet => sheet?.project && typeof sheet.project === 'object')
        : [];
      const canvases = Array.isArray(packaged?.document?.canvases)
        ? packaged.document.canvases.filter(canvas => canvas && typeof canvas === 'object')
        : [];
      const sheetHasMultipleCanvases = sheets.some(sheet => (
        Array.isArray(sheet?.project?.document?.canvases)
        && sheet.project.document.canvases.filter(canvas => canvas && typeof canvas === 'object').length > 1
      ));
      return {
        sheets,
        canvases,
        needsSplit: sheets.length > 1 || canvases.length > 1 || sheetHasMultipleCanvases,
      };
    }

    function inspectEntry(entry = null, packaged = null) {
      const collections = collectLegacyCollections(packaged);
      const hasLegacyBody = Boolean(entry?.project && typeof entry.project === 'object');
      const hasCurrentManifest = Number(entry?.autosaveSchemaVersion) === 2
        && typeof entry?.manifestKey === 'string'
        && Boolean(entry.manifestKey.trim());
      const isSingleLayout = packaged?.projectLayout === 'single-project'
        && collections.sheets.length === 0
        && collections.canvases.length <= 1;
      const trueV2 = hasCurrentManifest && !hasLegacyBody && isSingleLayout;
      return {
        trueV2,
        requiresMigration: !trueV2,
        needsSplit: collections.needsSplit,
        sheets: collections.sheets,
        canvases: collections.canvases,
        reason: trueV2
          ? 'true-v2'
          : (collections.needsSplit
              ? 'legacy-multiple-projects'
              : (!hasCurrentManifest
                  ? 'legacy-storage-record'
                  : (hasLegacyBody ? 'legacy-inline-payload' : 'legacy-project-layout'))),
      };
    }

    function normalizeSingleProject(entry = null, packaged = null) {
      if (!packaged || typeof packaged !== 'object') {
        throw new Error('Local project payload is unavailable');
      }
      const collections = collectLegacyCollections(packaged);
      if (collections.needsSplit) {
        throw new Error('Legacy project still contains multiple projects');
      }
      const source = collections.sheets.length === 1
        ? collections.sheets[0].project
        : packaged;
      const normalized = cloneJson(source, null);
      if (!normalized || typeof normalized !== 'object') {
        throw new Error('Local project payload could not be cloned');
      }
      const documentPayload = normalized.document && typeof normalized.document === 'object'
        ? normalized.document
        : null;
      const canvases = Array.isArray(documentPayload?.canvases)
        ? documentPayload.canvases.filter(canvas => canvas && typeof canvas === 'object')
        : [];
      if (canvases.length > 1) {
        throw new Error('Legacy project still contains multiple canvases');
      }
      delete normalized.sheets;
      delete normalized.sheetOrder;
      delete normalized.activeSheetId;
      normalized.type = 'pixieedraw-project';
      normalized.packageVersion = 2;
      normalized.projectLayout = 'single-project';
      normalized.updatedAt = new Date().toISOString();
      if (documentPayload) {
        const fileName = String(entry?.fileName || entry?.name || documentPayload.documentName || '').trim();
        if (fileName) documentPayload.documentName = fileName;
        if (canvases.length === 1) {
          documentPayload.canvases = [canvases[0]];
          documentPayload.activeCanvasId = canvases[0].id || documentPayload.activeCanvasId || '';
        } else {
          delete documentPayload.canvases;
          delete documentPayload.activeCanvasId;
        }
      }
      return normalized;
    }

    return Object.freeze({
      collectLegacyCollections,
      inspectEntry,
      normalizeSingleProject,
    });
  }

  root.localProjectV2MigrationUtils = Object.freeze({
    createLocalProjectV2MigrationUtils,
  });
})();
