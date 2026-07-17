import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../PiXiEEDrawDEV/assets/js/app.js', import.meta.url), 'utf8');
const tabModelSource = await readFile(new URL('../PiXiEEDrawDEV/assets/js/modules/open-project-tab-model.js', import.meta.url), 'utf8');
const context = { window: { PiXiEEDrawModules: {} }, console: { info() {}, warn() {} }, Proxy, Symbol, Object, Array, String, Number, Boolean, Set, Map, Date, Error, Math, Promise };
vm.runInNewContext(source, context, { filename: 'open-import-workflow-utils.js' });

const calls = { normalize: 0, validate: 0 };
const original = { document: { width: 2, height: 1, activeCanvasId: 'canvas-a', canvases: [{ id: 'canvas-a', width: 2, height: 1, activeFrame: 0, activeLayer: 'layer-a', frames: [{ id: 'frame-a', duration: 100, layers: [{ id: 'layer-a' }] }] }] } };
const canonical = structuredClone(original);
canonical.canonicalPayloadFormat = 'v2';
canonical.canonicalSourceMetadata = { sourceKind: 'import-image', sourceAdapterId: null };
const utils = context.window.PiXiEEDrawModules.openImportWorkflowUtils.createOpenImportWorkflowUtils({
  normalizeExternalProjectToCanonicalV2(input) {
    calls.normalize += 1;
    assert.equal(input.decodedPayload, original);
    assert.equal(input.sourceKind, 'import-image');
    assert.equal(input.sourceAdapterId, null);
    return { ok: true, canonicalPayload: canonical, metrics: { sheetCount: 1, canvasCount: 1, layerCount: 1, frameCount: 1, bitmapCount: 0, typedByteLength: 8, warningCount: 0 } };
  },
  validateCanonicalV2ProjectPayload(payload) {
    calls.validate += 1;
    assert.equal(payload, canonical);
    return { ok: true };
  },
});

const result = await utils.normalizePngSheetCandidate(original, { type: 'image/png', name: 'secret.png', size: 42 });
assert.equal(result.ok, true);
assert.equal(result.canonicalPayload, canonical);
assert.equal(calls.normalize, 1);
assert.equal(calls.validate, 1);
assert.equal(original.canonicalPayloadFormat, undefined, 'normalization must not mutate the decoder candidate');

const unavailable = context.window.PiXiEEDrawModules.openImportWorkflowUtils.createOpenImportWorkflowUtils({});
assert.equal((await unavailable.normalizePngSheetCandidate(original, { type: 'image/png' })).code, 'ERR_CANONICAL_V2_NORMALIZER_UNAVAILABLE');

const validationFailure = context.window.PiXiEEDrawModules.openImportWorkflowUtils.createOpenImportWorkflowUtils({
  normalizeExternalProjectToCanonicalV2: () => ({ ok: true, canonicalPayload: canonical }),
  validateCanonicalV2ProjectPayload: () => ({ ok: false, code: 'ERR_CANONICAL_V2_CANVAS_INVALID', phase: 'validate' }),
});
assert.equal((await validationFailure.normalizePngSheetCandidate(original, { type: 'image/png' })).code, 'ERR_CANONICAL_V2_CANVAS_INVALID');

assert.match(source, /const isPng = kind === 'image'/);
assert.match(source, /project = normalized\.canonicalPayload;/);
assert.match(source, /forceV2WorkingCopy: true/);
assert.match(source, /canonicalPayloadFormat: project\.canonicalPayloadFormat \|\| ''/);
assert.match(appSource, /get normalizeExternalProjectToCanonicalV2\(\) \{ return canonicalV2ProjectUtilsModule\.normalizeExternalProjectToCanonicalV2; \}/);
assert.match(appSource, /get validateCanonicalV2ProjectPayload\(\) \{ return canonicalV2ProjectUtilsModule\.validateCanonicalV2ProjectPayload; \}/);
assert.match(appSource, /getActiveProjectPayload: \(tab\) => \{/);
assert.match(appSource, /canonicalPayloadFormat: 'v2'/);
assert.match(tabModelSource, /currentTab\?\.canonicalPayloadFormat === 'v2'/);
assert.match(tabModelSource, /canonicalSourceMetadata: currentTab\?\.canonicalSourceMetadata/);

console.log('Canonical V2 E3 PNG import connection checks passed');
