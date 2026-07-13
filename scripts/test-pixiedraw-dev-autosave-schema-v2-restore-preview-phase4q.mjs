import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
globalThis.window = { PiXiEEDrawModules: {} };
vm.runInThisContext(fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/modules/autosave-schema-v2-restore-preview-utils.js'), 'utf8'));
const project = { projectLayout: 'single-project', document: { documentName: 'preview.pixieedraw', activeCanvasId: 'c0', canvases: Array.from({ length: 4 }, (_, index) => ({ id: `c${index}`, frames: [{ layers: [{ indices: [index], direct: [index, 0, 0, 255], importSourceDirect: null }] }] })) }, session: { historyPast: [], historyFuture: [], timelapse: { enabled: false } }, dotStats: null };
let calls = [];
const preview = window.PiXiEEDrawModules.autosaveSchemaV2RestorePreviewUtils.createAutosaveSchemaV2RestorePreviewUtils({
  readProject: async (_id, { revision } = {}) => { calls.push(revision || 0); if (revision === 99) throw new Error('Invalid manifest'); return { packaged: project, manifest: { revision: revision || 2 }, fallbackUsed: revision === 0, thumbnail: null }; },
  getComparison: () => ({ comparable: true, matched: true, differenceCount: 0, warnings: [] }),
});
const result = await preview.preview('p');
assert.equal(result.status, 'fallback-ready');
assert.equal(result.summary.projectLayout, 'single-project');
assert.equal(result.summary.projectCount, 1);
assert.equal(result.summary.canvasCount, 4);
assert.equal(result.restorable, true);
assert.equal(result.comparison.matched, true);
const selected = await preview.preview('p', { revision: 1 }); assert.equal(selected.restoredRevision, 1);
const corrupt = await preview.preview('p', { revision: 99 }); assert.equal(corrupt.restorable, false); assert.equal(corrupt.status, 'manifest-corrupt');
const over = { ...project, document: { ...project.document, canvases: Array.from({ length: 5 }, () => ({ frames: [] })) } };
const bad = window.PiXiEEDrawModules.autosaveSchemaV2RestorePreviewUtils.createAutosaveSchemaV2RestorePreviewUtils({ readProject: async () => ({ packaged: over, manifest: { revision: 1 }, fallbackUsed: false, thumbnail: null }) });
assert.equal((await bad.preview('bad')).status, 'canvas-limit-exceeded');
assert.equal(preview.clear('p'), true); assert.equal(preview.getStatus('p').status, 'not-found');
console.log('Phase 4-Q autosave V2 restore preview checks passed.');
