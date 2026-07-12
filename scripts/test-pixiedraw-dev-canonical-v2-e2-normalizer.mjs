import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../PiXiEEDrawDEV/assets/js/modules/canonical-v2-project-utils.js', import.meta.url), 'utf8');
const context = {
  window: { PiXiEEDrawModules: {} },
  ArrayBuffer, DataView, Uint8Array, Uint8ClampedArray, Int16Array, TextEncoder,
  Object, Array, Set, WeakSet, WeakMap, Number, String, Boolean, JSON, Error,
};
vm.runInNewContext(source, context, { filename: 'canonical-v2-project-utils.js' });
const api = context.window.PiXiEEDrawModules.canonicalV2ProjectUtils;

function documentPayload({ canvasId = 'canvas-a', frameId = 'frame-a', layerId = 'layer-a', direct = new Uint8ClampedArray([1, 2, 3, 255]), indexed = new Int16Array([0]), bitmapId = '' } = {}) {
  const layer = { id: layerId, type: 'raster', visible: true, opacity: 1, blendMode: 'normal', indices: indexed, direct };
  if (bitmapId) layer.bitmapId = bitmapId;
  return {
    type: 'pixieedraw-project', packageVersion: 2, version: 1, updatedAt: '2026-07-12T00:00:00.000Z',
    document: {
      documentName: 'fixture.pixieedraw', activeCanvasId: canvasId,
      canvases: [{ id: canvasId, width: 1, height: 1, activeFrame: 0, activeLayer: layerId, frames: [{ id: frameId, duration: 100, layers: [layer] }] }],
    },
    session: { localViewportCanvases: { anchorLeft: 0, anchorTop: 0, positions: [] }, timelapse: { enabled: true, byCanvas: {} } },
  };
}

function normalize(payload, sourceKind = 'file', sourceAdapterId = 'pixieedraw-v2-zip-experimental', sourceMetadata = {}) {
  return api.normalizeExternalProjectToCanonicalV2({ sourceKind, sourceAdapterId, decodedPayload: payload, sourceMetadata });
}

{
  const input = documentPayload();
  const originalDirect = input.document.canvases[0].frames[0].layers[0].direct;
  const result = normalize(input, 'import-image', null, { projectId: 'project-a' });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.canonicalPayload.canonicalPayloadFormat, 'v2');
  assert.equal(result.canonicalPayload.canonicalSchemaVersion, api.CANONICAL_V2_SCHEMA_VERSION);
  const direct = result.canonicalPayload.document.canvases[0].frames[0].layers[0].direct;
  assert.equal(direct instanceof Uint8ClampedArray, true);
  assert.deepEqual([...direct], [...originalDirect]);
  assert.notEqual(direct, originalDirect);
  assert.deepEqual([...input.document.canvases[0].frames[0].layers[0].direct], [1, 2, 3, 255]);
  assert.equal(api.validateCanonicalV2ProjectPayload(result.canonicalPayload).ok, true);
  const inspection = api.inspectCanonicalV2ProjectPayload(result.canonicalPayload);
  assert.equal(inspection.ok, true);
  assert.equal(inspection.sheetCount, 1);
  assert.equal(inspection.canvasCount, 1);
}

{
  const first = documentPayload({ canvasId: 'canvas-1', frameId: 'frame-1', layerId: 'layer-1' });
  const second = documentPayload({ canvasId: 'canvas-2', frameId: 'frame-2', layerId: 'layer-2', direct: new Uint8ClampedArray([9, 8, 7, 255]) });
  const multi = documentPayload();
  multi.activeSheetId = 'sheet-2';
  multi.sheetOrder = ['sheet-1', 'sheet-2'];
  multi.sheets = [
    { id: 'sheet-1', label: 'One', project: first, sourceKind: 'file' },
    { id: 'sheet-2', label: 'Two', project: second, sourceKind: 'import-gif' },
  ];
  const result = normalize(multi, 'unknown', 'pixieedraw-v1-json');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(Array.from(result.canonicalMetadata.sheetOrder), ['sheet-1', 'sheet-2']);
  assert.equal(result.canonicalMetadata.activeSheetId, 'sheet-2');
  assert.equal(result.metrics.sheetCount, 2);
  assert.equal(result.metrics.canvasCount, 2);
}

for (const mutate of [
  payload => { payload.sheets = [{ id: 'same', project: documentPayload() }, { id: 'same', project: documentPayload({ canvasId: 'canvas-b', frameId: 'frame-b', layerId: 'layer-b' }) }]; payload.sheetOrder = ['same', 'same']; payload.activeSheetId = 'same'; },
  payload => { payload.document.canvases[0].width = 0; },
  payload => { payload.document.canvases[0].frames[0].layers[0].direct = new Uint8ClampedArray([1]); },
  payload => { payload.document.canvases[0].frames[0].layers[0].bitmapId = 'missing-bitmap'; },
  payload => { payload.metadata = { callback() {} }; },
  payload => { payload.metadata = { handle: { kind: 'file', getFile() {} } }; },
]) {
  const payload = documentPayload();
  mutate(payload);
  assert.equal(normalize(payload).ok, false);
}

{
  const payload = documentPayload();
  payload.bitmaps = [{ id: 'bitmap-a', width: 1, height: 1, data: new Uint8Array([1, 2, 3, 4]) }];
  payload.document.canvases[0].frames[0].layers[0].bitmapId = 'bitmap-a';
  const valid = normalize(payload, 'import-gif');
  assert.equal(valid.ok, true, JSON.stringify(valid));
  assert.equal(valid.metrics.bitmapCount, 1);
  payload.bitmaps.push({ id: 'bitmap-a', width: 1, height: 1, data: new Uint8Array([1, 2, 3, 4]) });
  assert.equal(normalize(payload).code, 'ERR_CANONICAL_V2_DUPLICATE_ID');
}

{
  const payload = documentPayload();
  payload.document.canvases[0].frames[0].duration = 40;
  payload.session.timelapse = { enabled: true, byCanvas: { 'canvas-a': { entries: [] } }, loopCount: 3 };
  payload.document.canvases[0].frames[0].layers[0].importSourceDirect = new Uint8ClampedArray([4, 3, 2, 255]);
  const result = normalize(payload, 'unrecognized-source', 'pixieedraw-v1-json');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.canonicalPayload.document.canvases[0].frames[0].duration, 40);
  assert.equal(result.canonicalPayload.session.timelapse.loopCount, 3);
  assert.equal(result.warnings.some(entry => entry.code === 'WARN_CANONICAL_V2_UNKNOWN_SOURCE_KIND'), true);
}

{
  // V2 archive decode and U3 both hand packaged payloads back as encoded plain data.
  const payload = documentPayload({ direct: 'AQID/w==', indexed: 'AAAAAA==' });
  payload.document.canvases[0].frames[0].layers[0].importSourceDirect = 'BAMCAP8=';
  const result = normalize(payload, 'file', 'pixieedraw-v2-zip-experimental');
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.canonicalPayload.document.canvases[0].frames[0].layers[0].direct, 'AQID/w==');
}

console.log('Canonical V2 E2 normalizer tests passed');
