import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
globalThis.window = { PiXiEEDrawModules: {} };
for (const relativePath of [
  'PiXiEEDrawDEV/assets/js/modules/autosave-schema-v2-utils.js',
  'PiXiEEDrawDEV/assets/js/modules/autosave-schema-v2-shadow-utils.js',
]) vm.runInThisContext(fs.readFileSync(path.join(root, relativePath), 'utf8'), { filename: relativePath });

const schema = window.PiXiEEDrawModules.autosaveSchemaV2Utils.createAutosaveSchemaV2Utils();
function project(id, canvasCount = 1, { sourceKind = 'file' } = {}) {
  return {
    id, fileName: `${id}.pixieedraw`, label: id, sourceKind, sourceStorageAdapterId: 'pixieedraw-v2-zip-experimental', sourceProjectToken: `${id}-token`,
    project: { type: 'pixieedraw-project', packageVersion: 2, document: {
      activeCanvasId: `${id}-canvas-0`, palette: [[0, 0, 0, 0]],
      canvases: Array.from({ length: canvasCount }, (_, canvasIndex) => ({ id: `${id}-canvas-${canvasIndex}`, width: 1, height: 1, frames: Array.from({ length: 12 }, (_, frameIndex) => ({ id: `${id}-frame-${frameIndex}`, layers: Array.from({ length: 16 }, (_, layerIndex) => ({ id: `${id}-layer-${layerIndex}`, indices: [layerIndex], direct: null, importSourceDirect: null })) })) })),
    }, session: { historyPast: [], historyFuture: [], timelapse: { enabled: false, byCanvas: {}, operationLogsByCanvas: {} }, projectSaveHandle: { blocked: true } } },
  };
}
function state(sheets, activeSheetId = sheets[0]?.id) {
  return { projectId: 'phase4o', activeSheetId, sheets, journalsBySheet: {}, updatedAt: '2026-07-11T00:00:00Z' };
}

const twentySheets = Array.from({ length: 20 }, (_, index) => project(`sheet-${index}`, index === 0 ? 4 : 1));
const revision1 = schema.createSchemaV2Revision(state(twentySheets), { revision: 1 });
assert.equal(revision1.manifest.sheets.length, 20);
assert.equal(revision1.checkpoints[0].project.document.canvases.length, 4);
assert.equal(revision1.checkpoints[0].project.document.canvases[0].frames.length, 12);
assert.equal(revision1.checkpoints[0].project.document.canvases[0].frames[0].layers.length, 16);
assert.equal(JSON.stringify(revision1).includes('projectSaveHandle'), false);

assert.throws(() => schema.createSchemaV2Revision(state([project('too-many-canvases', 5)]), { revision: 1 }), error => error?.code === 'ERR_CANVAS_LIMIT_EXCEEDED');

const remainingSheets = twentySheets.filter(sheet => sheet.id !== 'sheet-3');
const revision2 = schema.createSchemaV2Revision(state(remainingSheets, 'sheet-4'), { revision: 2, parentRevision: 1 });
assert.equal(revision2.manifest.sheets.some(sheet => sheet.id === 'sheet-3'), false);
assert.equal(revision2.journals.some(journal => journal.sheetId === 'sheet-3'), false);
assert.equal(revision2.manifest.activeSheetId, 'sheet-4');
assert.equal(revision1.manifest.sheets.some(sheet => sheet.id === 'sheet-3'), true, 'old revision remains recoverable before cleanup');

const emptyReplacement = project('new-empty', 1, { sourceKind: 'new' });
emptyReplacement.sourceStorageAdapterId = null;
emptyReplacement.sourceProjectToken = 'new-token';
emptyReplacement.project.session = { historyPast: [], historyFuture: [], timelapse: { enabled: false, byCanvas: {}, operationLogsByCanvas: {} } };
const lastDeleteRevision = schema.createSchemaV2Revision(state([emptyReplacement]), { revision: 3, parentRevision: 2 });
assert.equal(lastDeleteRevision.manifest.sheets.length, 1);
assert.equal(lastDeleteRevision.manifest.sheets[0].sourceKind, 'new');
assert.equal(lastDeleteRevision.checkpoints[0].project.session.historyPast.length, 0);

let enabled = false;
const writes = [];
let restored = null;
const shadow = window.PiXiEEDrawModules.autosaveSchemaV2ShadowUtils.createAutosaveSchemaV2ShadowUtils({
  isEnabled: () => enabled,
  buildProjectState: job => job.projectState,
  writeProject: async projectState => { writes.push(projectState.revision); await new Promise(resolve => setTimeout(resolve, 5)); return { manifest: { revision: projectState.revision } }; },
  readProject: async () => ({ packaged: restored }),
  comparePayloads: (v1, v2) => ({ comparable: true, matches: v1.id === v2.id }),
  shouldCompare: () => true,
});
assert.equal(shadow.enqueue({ projectId: 'phase4o', projectState: { projectId: 'phase4o', revision: 1 } }).queued, false);
enabled = true;
restored = { id: 'same' };
shadow.enqueue({ projectId: 'phase4o', projectState: { projectId: 'phase4o', revision: 1 }, v1Project: { id: 'same' } });
shadow.enqueue({ projectId: 'phase4o', projectState: { projectId: 'phase4o', revision: 2 }, v1Project: { id: 'same' } });
await shadow.flush('phase4o');
assert.deepEqual(writes, [2], 'pending shadow writes coalesce to the newest snapshot before start');
assert.equal(shadow.getStatus('phase4o').lastResult.diagnostics.matches, true);

console.log('Phase 4-O autosave V2 shadow checks passed.');
