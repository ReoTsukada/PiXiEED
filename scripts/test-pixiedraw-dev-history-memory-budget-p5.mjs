import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(root, 'PiXiEEDrawDEV/assets/js/modules/memory-utils.js');
const historyCorePath = path.join(root, 'PiXiEEDrawDEV/assets/js/modules/history-core-workflow-utils.js');
const document = { getElementById: () => null, querySelectorAll: () => [] };
const context = {
  window: { document },
  document,
  navigator: {},
  performance: { now: () => 100 },
  console,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: modulePath });

const makeSnapshot = id => ({
  id,
  frames: [{ layers: [{ indices: new Int16Array(300_000), direct: null }] }],
  palette: [],
});
const history = {
  past: [makeSnapshot('oldest'), makeSnapshot('middle'), makeSnapshot('newest')],
  future: [],
  pending: null,
  limit: 80,
};
let buttonUpdates = 0;
const utils = context.window.PiXiEEDrawModules.memoryUtils.createMemoryUtils({
  dom: { controls: {} },
  state: { frames: [], palette: [], selectionMask: null, selectionContentMask: null },
  history,
  DEFAULT_HISTORY_LIMIT: 80,
  MEMORY_MONITOR_INTERVAL: 5000,
  MEMORY_WARNING_DEFAULT: Number.MAX_SAFE_INTEGER,
  MIN_HISTORY_LIMIT: 20,
  HISTORY_MEMORY_BUDGET_BYTES: 1024 * 1024,
  estimateEncodedByteLength: value => Number(value?.byteLength) || 0,
  isPixelPatchHistoryEntry: entry => entry?.__historyEntryType === 'pixelPatch',
  finalizePixelPatchHistoryEntry: entry => entry,
  getAllTimelapseTracks: () => ({}),
  getAllTimelapseStepCount: () => 0,
  getActiveTimelapseTrack: () => null,
  clearTimelapseRecording() {},
  fillPreviewCache: {},
  updateHistoryButtons: () => { buttonUpdates += 1; },
  markAutosaveDirty() {},
  scheduleAutosaveSnapshot() {},
  localizeText: ja => ja,
  formatBytes: value => `${value} B`,
  normalizeProjectHistoryLimit: value => Math.max(1, Math.round(Number(value) || 80)),
});

const trimmed = utils.trimHistoryToByteBudget();
assert.equal(trimmed.trimmed, true);
assert.equal(history.past.length, 1, 'history over the byte budget must release older snapshots');
assert.equal(history.past[0].id, 'newest', 'the nearest undo entry must be preserved');
assert.equal(buttonUpdates, 1);
assert.ok(trimmed.total <= trimmed.budget);

const patchBytes = utils.estimateSnapshotBytes({
  __historyEntryType: 'pixelPatch',
  changes: [{
    before: { paletteIndex: 0, direct: [1, 2, 3, 4], importSourceDirect: null },
    after: { paletteIndex: 1, direct: [5, 6, 7, 8], importSourceDirect: [5, 6, 7, 8] },
  }],
});
assert.ok(patchBytes > 40, 'pixel patch estimates must include entry and RGBA value overhead');

const historyCoreSource = fs.readFileSync(historyCorePath, 'utf8');
assert.match(historyCoreSource, /clearColdHistoryDirection\('future'\);\s*\}\s*history\.future\.length = 0;\s*trimHistoryToByteBudget\?\.\(\);/);

console.log('PiXiEEDrawDEV P5 history memory-budget checks passed.');
