import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../PiXiEEDrawDEV/assets/js/modules/canonical-v2-project-utils.js', import.meta.url), 'utf8');
const context = { window: { PiXiEEDrawModules: {} }, ArrayBuffer, DataView, Uint8Array, Uint8ClampedArray, Int16Array, TextEncoder, Object, Array, Set, WeakSet, WeakMap, Number, String, Boolean, JSON, Error };
vm.runInNewContext(source, context, { filename: 'canonical-v2-project-utils.js' });
const api = context.window.PiXiEEDrawModules.canonicalV2ProjectUtils;

function payload(metadata = undefined) {
  const project = { type: 'pixieedraw-project', packageVersion: 2, document: { documentName: 'gif', activeCanvasId: 'canvas', canvases: [{ id: 'canvas', width: 1, height: 1, activeFrame: 0, activeLayer: 'layer', frames: [{ id: 'frame', duration: 50, layers: [{ id: 'layer', indices: new Int16Array([-1]), direct: new Uint8ClampedArray([1, 2, 3, 255]) }] }] }] }, session: {} };
  return api.normalizeExternalProjectToCanonicalV2({ sourceKind: 'import-gif', decodedPayload: project, sourceMetadata: metadata || {} });
}

for (const [loop, kind] of [[undefined, 'missing'], [null, 'no-extension'], [0, 'infinite'], [1, 'finite'], [3, 'finite']]) {
  const metadata = loop === undefined ? {} : { sourceMimeType: 'image/gif', sourceFileBytes: 5, sourceWidth: 1, sourceHeight: 1, sourceFrameCount: 1, gifLoopCount: loop };
  const result = payload(metadata);
  assert.equal(result.ok, true, JSON.stringify(result));
  const inspection = api.inspectCanonicalV2ProjectPayload(result.canonicalPayload);
  assert.equal(inspection.gifLoopCountKind, kind);
  assert.equal(result.canonicalPayload.document.canvases[0].frames[0].duration, 50);
  assert.equal(Object.hasOwn(result.canonicalPayload.canonicalSourceMetadata, 'rawDisposal'), false);
}
for (const value of [-1, 1.5, NaN, Infinity, '0', true, {}]) {
  const result = payload({ sourceMimeType: 'image/gif', gifLoopCount: value });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ERR_CANONICAL_V2_GIF_LOOP_COUNT_INVALID');
}
for (const [key, value, code] of [['sourceFrameCount', 0, 'ERR_CANONICAL_V2_GIF_FRAME_COUNT_INVALID'], ['sourceWidth', 0, 'ERR_CANONICAL_V2_GIF_DIMENSION_INVALID'], ['sourceHeight', -1, 'ERR_CANONICAL_V2_GIF_DIMENSION_INVALID']]) {
  const result = payload({ sourceMimeType: 'image/gif', [key]: value });
  assert.equal(result.ok, false);
  assert.equal(result.code, code);
}
const original = { sourceMimeType: 'image/gif', gifLoopCount: 0 };
const cloned = payload(original);
assert.equal(cloned.ok, true);
assert.equal(original.gifLoopCount, 0);
const nonGif = api.normalizeExternalProjectToCanonicalV2({ sourceKind: 'import-image', decodedPayload: { type: 'pixieedraw-project', packageVersion: 2, document: { documentName: '', activeCanvasId: 'canvas', canvases: [{ id: 'canvas', width: 1, height: 1, activeFrame: 0, activeLayer: 'layer', frames: [{ id: 'frame', duration: 1, layers: [{ id: 'layer' }] }] }] }, session: {} }, sourceMetadata: { gifLoopCount: 'not-gif' } });
assert.equal(nonGif.ok, true);
console.log('Canonical V2 E4-B GIF metadata checks passed');
