(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  function createAutosaveSchemaV2ReadShadowUtils() {
    const OMIT = new Set(['updatedAt', 'revision', 'key', 'checksum', 'projectSaveHandle', 'projectSaveHandleMeta', 'autosaveHandle', 'pendingAutosaveHandle', 'thumbnail', 'dotStats']);
    const clone = value => JSON.parse(JSON.stringify(value));
    function normalizeSession(session = {}) {
      return { historyPastCount: Array.isArray(session.historyPast) ? session.historyPast.length : 0, historyFutureCount: Array.isArray(session.historyFuture) ? session.historyFuture.length : 0, timelapse: Boolean(session.timelapse?.enabled || Object.keys(session.timelapse?.byCanvas || {}).length || Object.keys(session.timelapse?.operationLogsByCanvas || {}).length) };
    }
    function normalizeProject(project = {}) {
      const documentPayload = project.document || {};
      const canvases = Array.isArray(documentPayload.canvases) && documentPayload.canvases.length ? documentPayload.canvases : [documentPayload];
      return { document: { width: documentPayload.width || 0, height: documentPayload.height || 0, activeCanvasId: documentPayload.activeCanvasId || '', palette: clone(documentPayload.palette || []), canvases: canvases.map(canvas => ({ id: canvas?.id || '', width: canvas?.width || 0, height: canvas?.height || 0, frames: (canvas?.frames || []).map(frame => ({ id: frame?.id || '', layers: (frame?.layers || []).map(layer => ({ id: layer?.id || '', directOnly: Boolean(layer?.directOnly), indices: clone(layer?.indices || null), direct: clone(layer?.direct || null), importSourceDirect: clone(layer?.importSourceDirect || null) })) })) })) }, session: normalizeSession(project.session || {}) };
    }
    function normalize(payload = {}) {
      const sheets = Array.isArray(payload.sheets) && payload.sheets.length ? payload.sheets : [{ id: 'active', project: payload }];
      return { projectId: payload.projectId || '', sheetOrder: sheets.map(sheet => sheet?.id || ''), activeSheetId: payload.activeSheetId || sheets[0]?.id || '', sheets: sheets.map(sheet => ({ id: sheet?.id || '', label: sheet?.label || '', fileName: sheet?.fileName || '', sourceKind: sheet?.sourceKind || '', sourceStorageAdapterId: sheet?.sourceStorageAdapterId || '', sourceProjectToken: sheet?.sourceProjectToken || '', project: normalizeProject(sheet?.project || {}) })) };
    }
    function diff(left, right, path = '', out = [], total = { count: 0 }, limit = 100) {
      if (JSON.stringify(left) === JSON.stringify(right)) return;
      if (!left || !right || typeof left !== 'object' || typeof right !== 'object') { total.count += 1; if (out.length < limit) out.push({ path, kind: 'value-mismatch', v1: left, v2: right }); return; }
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      keys.forEach(key => diff(left[key], right[key], path ? `${path}.${key}` : key, out, total, limit));
    }
    function compare(v1Payload, v2Payload, { projectId = '', differenceLimit = 100 } = {}) {
      if (!v1Payload) return { projectId, comparable: false, reason: 'v1-multi-sheet-snapshot-unavailable', v1Status: 'unavailable', v2Status: v2Payload ? 'restored' : 'unavailable', summary: {}, differences: [], differenceCount: 0, warnings: [] };
      if (!v2Payload) return { projectId, comparable: false, reason: 'v2-restore-unavailable', v1Status: 'restored', v2Status: 'unavailable', summary: {}, differences: [], differenceCount: 0, warnings: [] };
      const v1 = normalize(v1Payload); const v2 = normalize(v2Payload); const differences = []; const total = { count: 0 };
      diff(v1, v2, '', differences, total, Math.max(1, differenceLimit));
      const summary = { sheetCountMatched: v1.sheets.length === v2.sheets.length, sheetOrderMatched: JSON.stringify(v1.sheetOrder) === JSON.stringify(v2.sheetOrder), activeSheetMatched: v1.activeSheetId === v2.activeSheetId, canvasMatched: !differences.some(item => item.path.includes('canvases')), frameMatched: !differences.some(item => item.path.includes('frames')), layerMatched: !differences.some(item => item.path.includes('layers')), pixelMatched: !differences.some(item => /indices|direct|importSourceDirect/.test(item.path)) };
      return { projectId, comparable: true, matched: total.count === 0, summary, differences, differenceCount: total.count, warnings: total.count > differences.length ? [`difference-display-capped:${differences.length}/${total.count}`] : [], v1Status: 'restored', v2Status: 'restored', normalized: { v1, v2 } };
    }
    return Object.freeze({ normalize, compare });
  }
  root.autosaveSchemaV2ReadShadowUtils = Object.freeze({ createAutosaveSchemaV2ReadShadowUtils });
})();
