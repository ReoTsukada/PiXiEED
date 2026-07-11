import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
globalThis.window = { PiXiEEDrawModules: {} };
vm.runInThisContext(fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/modules/autosave-schema-v2-read-shadow-utils.js'), 'utf8'));
const utils = window.PiXiEEDrawModules.autosaveSchemaV2ReadShadowUtils.createAutosaveSchemaV2ReadShadowUtils();
function sheet(id, { pixel = 1, sourceKind = 'file', canvases = 1 } = {}) { return { id, label: id, fileName: `${id}.pixieedraw`, sourceKind, sourceStorageAdapterId: sourceKind === 'new' ? '' : 'pixieedraw-v2-zip-experimental', sourceProjectToken: `${id}-token`, project: { document: { activeCanvasId: `${id}-canvas-0`, palette: [[0, 0, 0, 0]], canvases: Array.from({ length: canvases }, (_, c) => ({ id: `${id}-canvas-${c}`, width: 1, height: 1, frames: [{ id: `${id}-frame`, layers: [{ id: `${id}-layer`, directOnly: false, indices: [pixel], direct: [pixel, 0, 0, 255], importSourceDirect: [0, 0, 0, 0] }] }] })) }, session: { historyPast: [], historyFuture: [], timelapse: { enabled: false, byCanvas: {}, operationLogsByCanvas: {} }, projectSaveHandle: { ignored: true } } } }; }
function project(sheets) { return { projectId: 'phase4p', activeSheetId: sheets[0]?.id || '', sheets, updatedAt: 'ignored', revision: 9 }; }
const many = Array.from({ length: 20 }, (_, index) => sheet(`sheet-${index}`, { pixel: index, canvases: index === 0 ? 4 : 1 }));
const equal = utils.compare(project(many), project(many), { projectId: 'phase4p' });
assert.equal(equal.comparable, true); assert.equal(equal.matched, true); assert.equal(equal.summary.sheetCountMatched, true);
const changed = project(many.map(item => JSON.parse(JSON.stringify(item)))); changed.sheets[2].project.document.canvases[0].frames[0].layers[0].direct[0] = 99;
const mismatch = utils.compare(project(many), changed, { projectId: 'phase4p', differenceLimit: 1 });
assert.equal(mismatch.matched, false); assert.equal(mismatch.summary.pixelMatched, false); assert.ok(mismatch.differenceCount >= 1); assert.ok(mismatch.differences.length <= 1);
const unavailable = utils.compare(null, project(many), { projectId: 'phase4p' });
assert.equal(unavailable.comparable, false); assert.equal(unavailable.reason, 'v1-multi-sheet-snapshot-unavailable');
const deleted = project(many.filter(item => item.id !== 'sheet-3')); deleted.activeSheetId = 'sheet-4';
const deletion = utils.compare(deleted, deleted, { projectId: 'phase4p' }); assert.equal(deletion.matched, true); assert.equal(deletion.normalized.v2.sheetOrder.includes('sheet-3'), false);
const empty = project([sheet('new-empty', { sourceKind: 'new' })]); empty.sheets[0].sourceStorageAdapterId = ''; empty.sheets[0].project.session.historyPast = []; const emptyResult = utils.compare(empty, empty); assert.equal(emptyResult.matched, true); assert.equal(emptyResult.normalized.v2.sheets[0].sourceKind, 'new');
console.log('Phase 4-P autosave V2 read shadow checks passed.');
