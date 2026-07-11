(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  function createAutosaveSchemaV2RestorePreviewUtils({ readProject, getComparison = () => null, maxPreviews = 5 } = {}) {
    const previews = new Map();
    const checksum = value => { const text = JSON.stringify(value); let hash = 2166136261; for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); } return `fnv1a-${(hash >>> 0).toString(16)}`; };
    function summarize(project) {
      const sheets = project?.sheets || []; let canvasCount = 0; let frameCount = 0; let layerCount = 0; let journalReplayCount = 0;
      const summaries = sheets.map(sheet => { const documentPayload = sheet?.project?.document || {}; const canvases = Array.isArray(documentPayload.canvases) ? documentPayload.canvases : [documentPayload]; canvasCount += canvases.length; const frames = canvases.flatMap(canvas => canvas?.frames || []); frameCount += frames.length; const layers = frames.flatMap(frame => frame?.layers || []); layerCount += layers.length; if (sheet?.journalRecovered) journalReplayCount += 1; return { id: sheet?.id || '', label: sheet?.label || '', fileName: sheet?.fileName || '', sourceKind: sheet?.sourceKind || '', canvasCount: canvases.length, frameCount: frames.length, layerCount: layers.length, activeCanvasId: documentPayload.activeCanvasId || '', pixelChecksum: checksum(layers.map(layer => [layer.indices, layer.direct, layer.importSourceDirect])) }; });
      return { summary: { sheetCount: sheets.length, activeSheetId: project?.activeSheetId || '', canvasCount, frameCount, layerCount, journalReplayCount }, sheets: summaries };
    }
    async function preview(projectId, options = {}) {
      const requestedRevision = Math.max(0, Math.round(Number(options.revision) || 0));
      try {
        const restored = await readProject(projectId, { revision: requestedRevision });
        const { summary, sheets } = summarize(restored.packaged);
        const warnings = []; const errors = [];
        if (!restored.thumbnail) warnings.push('thumbnail-missing');
        if (!restored.packaged?.dotStats) warnings.push('dotstats-missing');
        if (sheets.some(sheet => sheet.canvasCount > 4)) errors.push('canvas-limit-exceeded');
        const status = errors.length ? 'canvas-limit-exceeded' : (restored.fallbackUsed ? 'fallback-ready' : (sheets.some(sheet => restored.packaged.sheets.find(item => item.id === sheet.id)?.journalWarning) ? 'journal-fallback' : 'ready'));
        const result = { projectId, previewId: `${projectId}:${restored.manifest?.revision || 0}:${Date.now()}`, status, requestedRevision, restoredRevision: restored.manifest?.revision || 0, usedFallbackRevision: restored.fallbackUsed === true, restorable: errors.length === 0, summary, sheets, warnings, errors, comparison: getComparison(projectId) };
        if (previews.size >= maxPreviews) previews.delete(previews.keys().next().value);
        previews.set(projectId, { result, payload: restored.packaged });
        return result;
      } catch (error) {
        return { projectId, previewId: '', status: /No valid|manifest/i.test(error?.message || '') ? 'manifest-corrupt' : 'unrestorable', requestedRevision, restoredRevision: 0, usedFallbackRevision: false, restorable: false, summary: {}, sheets: [], warnings: [], errors: [error?.message || String(error)], comparison: getComparison(projectId) };
      }
    }
    return Object.freeze({ preview, getStatus: projectId => previews.get(projectId)?.result || { projectId, status: 'not-found' }, getPayload: projectId => previews.get(projectId)?.payload || null, clear: projectId => previews.delete(projectId) });
  }
  root.autosaveSchemaV2RestorePreviewUtils = Object.freeze({ createAutosaveSchemaV2RestorePreviewUtils });
})();
