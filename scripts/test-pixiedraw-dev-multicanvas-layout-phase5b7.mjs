import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

globalThis.window = { PiXiEEDrawModules: {} };
vm.runInThisContext(read('PiXiEEDrawDEV/assets/js/modules/document-session-workflow-utils.js'), {
  filename: 'document-session-workflow-utils.js',
});
vm.runInThisContext(read('PiXiEEDrawDEV/assets/js/modules/project-storage-v1-json-adapter.js'), {
  filename: 'project-storage-v1-json-adapter.js',
});

const defaultLayout = {
  count: 0,
  selectedKind: 'main',
  selectedIndex: -1,
  layoutScale: 1,
  positionsRelative: true,
  anchorLeft: null,
  anchorTop: null,
  positions: [],
};
const normalizeLayout = (value, fallback = defaultLayout) => {
  const source = value && typeof value === 'object' ? value : fallback;
  const finite = (candidate, fallbackValue = null) => Number.isFinite(Number(candidate)) ? Number(candidate) : fallbackValue;
  const positions = Array.isArray(source.positions)
    ? source.positions.map(position => ({
      left: finite(position?.left),
      top: finite(position?.top),
    }))
    : [];
  return {
    count: Math.max(0, Math.round(finite(source.count, 0))),
    selectedKind: source.selectedKind === 'local' ? 'local' : 'main',
    selectedIndex: Math.round(finite(source.selectedIndex, -1)),
    layoutScale: 1,
    positionsRelative: true,
    anchorLeft: finite(source.anchorLeft),
    anchorTop: finite(source.anchorTop),
    positions,
  };
};
const layout = {
  count: 3,
  selectedKind: 'local',
  selectedIndex: 2,
  layoutScale: 1,
  positionsRelative: true,
  anchorLeft: 128,
  anchorTop: 96,
  positions: [
    { left: 180, top: 0 },
    { left: -180, top: 0 },
    { left: 0, top: 180 },
  ],
};
const scope = {
  DEFAULT_HISTORY_LIMIT: 30,
  clamp: (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value)),
  history: { limit: 30, past: [], future: [] },
  timelapseState: { enabled: false, fps: 12 },
  localViewportCanvasState: structuredClone(layout),
  LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE: defaultLayout,
  normalizeLocalViewportCanvasState: normalizeLayout,
  normalizeProjectHistoryLimit: value => Math.max(1, Math.round(Number(value) || 30)),
  serializeProjectHistoryList: value => Array.isArray(value) ? value : [],
  normalizeTimelapseFps: value => Math.max(1, Math.round(Number(value) || 12)),
  flushPendingTimelapseCapture() {},
  getAllTimelapseTracks: () => ({}),
  serializeProjectTimelapseTracks: () => ({}),
  serializeProjectTimelapseOperationLogs: () => ({}),
  getAllTimelapseStepCount: () => 0,
  deserializeProjectHistoryList: () => [],
  deserializeProjectTimelapseTracks: () => ({}),
  deserializeProjectTimelapseOperationLogs: () => ({}),
  createEmptyTimelapseTrack: () => ({}),
  normalizeTimelapseCanvasId: value => String(value || ''),
  deserializeProjectTimelapseSnapshots: () => [],
};
const sessions = window.PiXiEEDrawModules.documentSessionWorkflowUtils.createDocumentSessionWorkflowUtils(scope);
const savedSession = sessions.buildProjectSessionPayload();
assert.deepEqual(savedSession.localViewportCanvases, normalizeLayout(layout));
assert.deepEqual(sessions.parseProjectSessionPayload(savedSession).localViewportCanvases, normalizeLayout(layout));

const invalidSession = structuredClone(savedSession);
invalidSession.localViewportCanvases.anchorLeft = Number.NaN;
invalidSession.localViewportCanvases.positions[1].top = Infinity;
const parsedInvalid = sessions.parseProjectSessionPayload(invalidSession).localViewportCanvases;
assert.equal(parsedInvalid.anchorLeft, null, 'invalid anchor uses a safe fallback');
assert.equal(parsedInvalid.positions[1].top, null, 'invalid position uses a safe fallback');

const v1Adapter = window.PiXiEEDrawModules.projectStorageV1JsonAdapter.createPixieeDrawV1JsonAdapter({
  buildPackagedProjectPayload: (_snapshot, { session }) => ({
    type: 'pixieedraw-project',
    document: { canvases: [{ id: 'canvas-1', frames: [] }] },
    session,
  }),
  createAutosaveFileName: () => 'layout.pixieedraw',
});
const v1 = v1Adapter.serializeProject({ snapshot: { documentName: 'layout' }, session: savedSession });
assert.deepEqual(v1Adapter.parseText(v1.text).session.localViewportCanvases, normalizeLayout(layout));

const localViewportSource = read('PiXiEEDrawDEV/assets/js/modules/local-viewport-canvas-workflow-utils.js');
const documentSessionSource = read('PiXiEEDrawDEV/assets/js/modules/document-session-workflow-utils.js');
const layoutViewportSource = read('PiXiEEDrawDEV/assets/js/modules/layout-viewport.js');
assert.match(localViewportSource, /assignAdjacentPositionForNewLocalViewportCanvases/);
assert.match(localViewportSource, /setLocalViewportCanvasPosition\(canvasSurfacePanelDragState\.surfaceIndex, finalLeft, finalTop\)/);
assert.match(localViewportSource, /if \(layoutChanged\) \{\s*markAutosaveDirty\(\);\s*markDocumentUnsavedChange\(\);/s);
assert.match(localViewportSource, /scheduleSessionPersist\(\{ includeSnapshots: layoutChanged \}\)/);
assert.match(localViewportSource, /if \(targetCount > previous\) \{\s*requestLocalViewportCanvasLayoutReset\(\{ clearStored: true \}\);/s);
assert.match(documentSessionSource, /localViewportCanvases: normalizeLocalViewportCanvasState/);
assert.match(documentSessionSource, /preserveLocalCanvasLayout: Boolean\(projectSession\?\.localViewportCanvases\)/);
assert.match(layoutViewportSource, /preserveLocalCanvasLayout = false/);
assert.match(layoutViewportSource, /if \(!preserveLocalCanvasLayout\)/);

console.log('PiXiEEDraw DEV Phase 5-B7 multi-canvas layout checks passed');
