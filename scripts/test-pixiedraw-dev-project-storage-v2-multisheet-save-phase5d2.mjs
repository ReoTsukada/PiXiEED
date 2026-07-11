import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window = { PiXiEEDrawModules: {} };
vm.runInThisContext(fs.readFileSync('/Users/tsukadareine/Documents/GitHub/PiXiEED/PiXiEEDrawDEV/assets/js/modules/project-storage-v2-multisheet-candidate-utils.js', 'utf8'));

const validator = value => {
  const count = Array.isArray(value?.project?.document?.canvases) ? value.project.document.canvases.length : 1;
  return count >= 1 && count <= 4 ? { valid: true } : { valid: false, code: 'ERR_CANVAS_LIMIT_EXCEEDED' };
};
const normalizeLayout = value => value && typeof value === 'object'
  ? structuredClone(value)
  : { count: 0, selectedKind: 'main', selectedIndex: -1, layoutScale: 1, positionsRelative: true, anchorLeft: null, anchorTop: null, positions: [] };
const collector = window.PiXiEEDrawModules.projectStorageV2MultisheetCandidateUtils.createProjectStorageV2MultisheetCandidateUtils({
  validateSheetCanvasCount: validator,
  normalizeLocalViewportCanvasState: normalizeLayout,
  LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE: normalizeLayout(),
});
const project = (id, canvases = 1) => ({
  type: 'pixieedraw-project',
  document: { documentName: `${id}.pixieedraw`, activeCanvasId: `${id}-canvas-0`, canvases: Array.from({ length: canvases }, (_, index) => ({ id: `${id}-canvas-${index}`, viewScale: 8, frames: [{ id: `${id}-frame`, layers: [{ id: `${id}-layer`, indices: 'AA==', direct: 'AAAAAA==' }] }] })) },
  session: { localViewportCanvases: { count: Math.max(0, canvases - 1), selectedKind: 'main', selectedIndex: -1, layoutScale: 1, positionsRelative: true, anchorLeft: 10, anchorTop: 20, positions: [] }, timelapse: { enabled: false, fps: 12, byCanvas: {}, operationLogsByCanvas: {} } },
});
const tab = (id, options = {}) => ({ id, fileName: `${id}.pixieedraw`, label: id, source: 'sheet', sourceKind: 'file', sourceStorageAdapterId: 'pixieedraw-v2-zip-experimental', sourceProjectToken: `${id}-token`, project: options.project === undefined ? project(id, options.canvases || 1) : options.project });
for (const count of [2, 20, 50]) {
  const tabs = Array.from({ length: count }, (_, index) => tab(`sheet-${index + 1}`, { canvases: index === 0 ? 4 : 1 }));
  const candidate = collector.collectCompleteMultiSheetV2SaveCandidate({ openProjectTabs: tabs, activeSheetId: tabs[3]?.id || tabs[0].id, activePackagedProject: tabs[3]?.project || tabs[0].project });
  assert.equal(candidate.complete, true);
  assert.equal(candidate.packagedSheetCount, count);
  assert.deepEqual(candidate.packaged.sheetOrder, tabs.map(item => item.id));
  assert.equal(candidate.packaged.activeSheetId, tabs[3]?.id || tabs[0].id);
  assert.equal(candidate.packaged.sheets[0].project.session.localViewportCanvases.anchorLeft, 10);
}
const canvasFailure = collector.collectCompleteMultiSheetV2SaveCandidate({ openProjectTabs: [tab('ok'), tab('bad', { canvases: 5 })], activeSheetId: 'ok', activePackagedProject: project('ok') });
assert.equal(canvasFailure.complete, false);
assert.equal(canvasFailure.errors[0].code, 'ERR_CANVAS_LIMIT_EXCEEDED');
const missingFailure = collector.collectCompleteMultiSheetV2SaveCandidate({ openProjectTabs: [tab('ok'), tab('missing', { project: null })], activeSheetId: 'ok', activePackagedProject: project('ok') });
assert.equal(missingFailure.complete, false);
assert.equal(missingFailure.errors[0].code, 'sheet-materialization-failed');
console.log('PiXiEEDraw DEV Phase 5-D2 multi-sheet candidate checks passed');
