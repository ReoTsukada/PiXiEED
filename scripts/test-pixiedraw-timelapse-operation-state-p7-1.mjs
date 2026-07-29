import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const requireText = (source, pattern, label) => {
  if (!pattern.test(source)) throw new Error(`Missing ${label}`);
};

const storePath = 'pixiedraw/assets/js/modules/timelapse-operation-store-utils.js';
const historyPath = 'pixiedraw/assets/js/modules/history-core-workflow-utils.js';
const dialogPath = 'pixiedraw/assets/js/modules/timelapse-dialog-utils.js';
const htmlPath = 'pixiedraw/index.html';
const store = read(storePath);
const history = read(historyPath);
const dialog = read(dialogPath);
const html = read(htmlPath);

// The module is intentionally a browser classic script because PiXiEEDraw's
// split modules use a scoped factory, not Node's strict module parser.
new Function(store);
new Function(history);
new Function(dialog);

requireText(store, /timelapseEvents/, 'event store');
requireText(store, /timelapseOperationStates/, 'operation-state store');
requireText(store, /timelapseProjectMeta/, 'project metadata store');
requireText(store, /timelapseCheckpoints/, 'replay checkpoint store');
requireText(store, /recordBaselineIfMissing/, 'baseline persistence');
requireText(store, /readBaseline/, 'baseline restore');
requireText(store, /projectSequence/, 'project-scoped sequence index');
requireText(store, /nextSequence: sequence \+ 1/, 'atomic nextSequence update');
requireText(store, /\['active', 'undone', 'discarded'\]/, 'three operation states');
requireText(store, /state\?\.state === 'active'/, 'active-only replay query');
requireText(store, /projectWriteTails/, 'per-project write serialization');
requireText(store, /async function flush\(projectId = ''\)/, 'pending-write flush');
requireText(store, /async function removeProject\(projectId\)/, 'project cleanup');
requireText(history, /recordTimelapseHistoryEntry\(historyEntry, pendingLabel, history\.pending\.timelapseBaselineSnapshot\)/, 'commit-to-operation binding');
requireText(history, /history\.future\.forEach\(entry => setTimelapseHistoryEntryState\(entry, 'discarded'\)\)/, 'discarded redo branch');
requireText(history, /synchronizeTimelapseHistoryStates\(\)/, 'undo redo state synchronization');
requireText(dialog, /await store\.flush\?\.\(projectId\)/, 'latest operation flush before replay');
requireText(dialog, /async function exportGif\(\)/, 'GIF export workflow');
requireText(dialog, /maxFrames = 240/, 'bounded GIF frame export');
requireText(dialog, /exportCancelled/, 'GIF export cancellation');
requireText(html, /timelapse-operation-store-utils\.js\?v=20260729-resize-placement1/, 'runtime module load');
requireText(html, /id="exportTimelapse"/, 'GIF export control');

console.log('P7.1 timelapse operation-state contract passed');
