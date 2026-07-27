import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
globalThis.window = { PiXiEEDrawModules: {} };
vm.runInThisContext(
  fs.readFileSync(path.join(repoRoot, 'pixiedraw/assets/js/modules/timeline-navigation-workflow-utils.js'), 'utf8'),
  { filename: 'timeline-navigation-workflow-utils.js' }
);

const layer = (id, trackId) => ({ id, trackId, visible: true, opacity: 1, blendMode: 'normal' });
const state = {
  activeFrame: 0,
  activeLayer: 'frame-1-track-b',
  frames: [
    { id: 'frame-1', duration: 100, layers: [layer('frame-1-track-a', 'track-a'), layer('frame-1-track-b', 'track-b')] },
    // Deliberately reversed: index 1 is track-a, not track-b.
    { id: 'frame-2', duration: 100, layers: [layer('frame-2-track-b', 'track-b'), layer('frame-2-track-a', 'track-a')] },
  ],
  selectionMask: null,
  playback: { isPlaying: false },
};
const noop = () => {};
const navigation = window.PiXiEEDrawModules.timelineNavigationWorkflowUtils.createTimelineNavigationWorkflowUtils({
  state,
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  getActiveFrame: () => state.frames[state.activeFrame] || null,
  getProjectCanvasDocuments: () => [],
  getActiveProjectCanvasDocument: () => null,
  pointerState: { active: false, selectionMove: null, lastSelectionMove: null },
  virtualCursorDrawState: { active: false, lastPosition: null, currentPosition: null },
  clearSelection: noop,
  abortActivePointerInteraction: noop,
  invalidateActiveCanvasCompositeRenderState: noop,
  isVoxelExtensionModeEnabled: () => false,
  isMultiAssignedCellRestrictedEditorMode: () => false,
  canSelectSharedProjectTimelineCell: () => true,
  scheduleSessionPersist: noop,
  renderFrameList: noop,
  renderLayerList: noop,
  requestRender: noop,
  requestOverlayRender: noop,
  updatePixfindModeUI: noop,
  scheduleSharedProjectCellPresenceBroadcast: noop,
  scheduleTimelineMatrixRenderSoon: noop,
  getActiveLayerIndex: () => state.frames[state.activeFrame].layers.findIndex(item => item.id === state.activeLayer),
  getActiveLayerTrackIndex: () => state.frames[state.activeFrame].layers.findIndex(item => item.id === state.activeLayer),
  getVoxelPreviewOrientationForFrameIndex: () => ({ yawDeg: 0, pitchDeg: 0 }),
  normalizeVoxelExtensionState: value => value,
  VOXEL_EXTENSION_DEFAULT_STATE: {},
  voxelExtensionState: {},
  syncVoxelExtensionPreviewFromSource: noop,
  compactInactiveRasterFrameIndices: noop,
  syncAnimationFpsDisplayFromState: noop,
  syncActiveFrameSettingsUI: noop,
  enforceGuestAssignedLayerSelection: noop,
  normalizeFpsValue: value => value,
  getDurationFromFps: value => value,
  beginHistory: noop,
  markHistoryDirty: noop,
  commitHistory: noop,
  renderTimelineMatrix: noop,
  updateAnimationFpsDisplay: noop,
  canCurrentClientEditProjectStructure: () => true,
  isSharedProjectCollaborativeMode: () => false,
  setMultiStatus: noop,
  localizeText: ja => ja,
  getActiveLayer: () => state.frames[state.activeFrame].layers.find(item => item.id === state.activeLayer) || null,
  DEFAULT_LAYER_BLEND_MODE: 'normal',
});

assert.equal(navigation.getActiveLayerTrackId(), 'track-b');
assert.equal(navigation.getLayerByTrackId(state.frames[1], 'track-b')?.id, 'frame-2-track-b');
navigation.stepActiveFrame(1, { persist: false, render: false, syncUi: false, broadcastPresence: false });
assert.equal(state.activeFrame, 1);
assert.equal(
  state.activeLayer,
  'frame-2-track-b',
  'frame navigation must retain the selected track even when the target frame order differs'
);
navigation.setActiveFrameIndex(0, { persist: false, render: false, syncUi: false, broadcastPresence: false });
assert.equal(state.activeLayer, 'frame-1-track-b', 'reverse navigation must retain the same track');

console.log(JSON.stringify({ activeTrackId: navigation.getActiveLayerTrackId(), activeLayer: state.activeLayer }, null, 2));
