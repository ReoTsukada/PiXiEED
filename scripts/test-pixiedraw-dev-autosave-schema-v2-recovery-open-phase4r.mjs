import assert from 'node:assert/strict'; import fs from 'node:fs'; import vm from 'node:vm';
globalThis.window={PiXiEEDrawModules:{}}; vm.runInThisContext(fs.readFileSync('/Users/tsukadareine/Documents/GitHub/PiXiEED/PiXiEEDrawDEV/assets/js/modules/autosave-schema-v2-recovery-utils.js','utf8'));
const utils=window.PiXiEEDrawModules.autosaveSchemaV2RecoveryUtils.createAutosaveSchemaV2RecoveryUtils();
const payload = { activeSheetId: 'a', sheets: Array.from({ length: 20 }, (_, index) => ({
  id: index ? `s${index}` : 'a',
  project: { projectSaveHandle: { bad: true }, document: { activeCanvasId: 'c', canvases: [{ id: 'c', frames: [{ layers: [{ indices: [index] }] }] }] }, session: { localViewportCanvases: { count: 0, positions: [], anchorLeft: index, anchorTop: index }, historyPast: [], historyFuture: [], timelapse: { enabled: false } } },
})) };
const result=utils.buildCandidate(payload,{sourceProjectId:'source',revision:2}); assert.equal(result.ok,true); assert.equal(result.project.sheets.length,20); assert.equal(result.project.sheets[0].project.projectSaveHandle,undefined); assert.deepEqual(result.project.sheets[0].project.session.localViewportCanvases, payload.sheets[0].project.session.localViewportCanvases); assert.equal(result.project.activeSheetId,'a'); assert.equal(payload.sheets[0].project.projectSaveHandle.bad,true);
const over=JSON.parse(JSON.stringify(payload)); over.sheets[0].project.document.canvases=Array.from({length:5},()=>({frames:[]})); assert.equal(utils.buildCandidate(over).reason,'canvas-limit-exceeded'); console.log('Phase 4-R recovery candidate checks passed.');
