import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';
import path from 'node:path';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const require = createRequire(path.join(repoRoot, 'tools/screenshots/package.json'));
const { chromium } = require('playwright');

const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><title>Autosave index8 normalization</title>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
let browser = null;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ path: path.join(repoRoot, 'pixiedraw/assets/js/modules/document-model.js') });
  await page.addScriptTag({ path: path.join(repoRoot, 'pixiedraw/assets/js/modules/project-package-workflow-utils.js') });
  await page.addScriptTag({ path: path.join(repoRoot, 'pixiedraw/assets/js/modules/autosave-schema-v2-utils.js') });

  const result = await page.evaluate(() => {
    const palette = [
      { r: 20, g: 40, b: 60, a: 255 },
      { r: 255, g: 0, b: 255, a: 0 },
    ];
    const model = window.PiXiEEDrawModules.documentModel.createDocumentModel({
      state: { palette },
      DEFAULT_LAYER_BLEND_MODE: 'normal',
      SIM_LAYER_TYPE: 'simulation',
      normalizeLayerOpacity: value => value,
      normalizeLayerBlendMode: value => value,
      encodeTypedArray: value => value,
    });
    const runtimeIndices = new Int16Array([-1, 0, 1, 0]);
    const layer = {
      id: 'layer-1',
      name: 'Layer 1',
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      indices: runtimeIndices,
      direct: null,
      importSourceDirect: null,
      directOnly: false,
    };
    const serialized = model.serializeLayerForDocument(layer, {
      preserveTypedArrays: true,
      compactIndicesForStorage: true,
      width: 2,
      height: 2,
      palette,
    });
    const runtimeLayer = {
      ...layer,
      indices: new Uint8Array([0, 1, 0, 1]),
      indicesEncoding: 'uint8-palette-zero-transparent-v2',
    };
    const restoredRuntimeLayer = model.deserializeLayerFromDocument(
      runtimeLayer,
      4,
      'layer-fallback',
      'Layer',
      2,
      2,
      { reuseTypedArrays: false }
    );
    const materializedRuntimeIndices = model.materializeLayerIndices(restoredRuntimeLayer, 2, 2, palette);

    const fullPaletteLayer = { ...layer, indices: new Int16Array([255, -1, 0, 1]) };
    const fullPaletteSerialized = model.serializeLayerForDocument(fullPaletteLayer, {
      preserveTypedArrays: true,
      compactIndicesForStorage: true,
      width: 2,
      height: 2,
      palette: Array.from({ length: 256 }, (_unused, index) => ({ r: index, g: 0, b: 0, a: 255 })),
    });

    let capturedSerializationOptions = null;
    const packageUtils = window.PiXiEEDrawModules.projectPackageWorkflowUtils.createProjectPackageWorkflowUtils({
      PROJECT_PACKAGE_TYPE: 'pixieedraw-project',
      PROJECT_PACKAGE_VERSION: 2,
      DOCUMENT_FILE_VERSION: 2,
      resolveTrackedProjectDotStats: () => null,
      serializeDocumentSnapshot: (_snapshot, options) => {
        capturedSerializationOptions = { ...options };
        return { documentName: 'test' };
      },
      buildProjectSessionPayload: () => ({}),
      getActiveCanonicalProjectMetadata: () => null,
    });
    packageUtils.buildPackagedProjectPayload({}, { internalBinary: true, session: {} });
    const autosaveSchema = window.PiXiEEDrawModules.autosaveSchemaV2Utils.createAutosaveSchemaV2Utils();
    const autosaveRevision = autosaveSchema.createSchemaV2Revision({
      projectId: 'autosave-index8-test',
      project: {
        type: 'pixieedraw-project',
        document: {
          width: 2,
          height: 2,
          palette,
          frames: [{ id: 'frame-1', layers: [serialized] }],
        },
      },
    });
    const checkpointLayer = autosaveRevision.checkpoints[0].project.document.frames[0].layers[0];

    return {
      runtimeType: runtimeIndices.constructor.name,
      runtimeValues: Array.from(runtimeIndices),
      storedType: serialized.indices.constructor.name,
      storedValues: Array.from(serialized.indices),
      storedEncoding: serialized.indicesEncoding || '',
      fullPaletteType: fullPaletteSerialized.indices.constructor.name,
      fullPaletteEncoding: fullPaletteSerialized.indicesEncoding || '',
      capturedSerializationOptions,
      checkpointType: checkpointLayer.indices.constructor.name,
      checkpointValues: Array.from(checkpointLayer.indices),
      checkpointEncoding: checkpointLayer.indicesEncoding || '',
      restoredRuntimeType: restoredRuntimeLayer.indices.constructor.name,
      restoredRuntimeValues: Array.from(restoredRuntimeLayer.indices),
      materializedRuntimeType: materializedRuntimeIndices.constructor.name,
    };
  });

  assert.equal(result.runtimeType, 'Int16Array');
  assert.deepEqual(result.runtimeValues, [-1, 0, 1, 0]);
  assert.equal(result.storedType, 'Uint8Array');
  assert.deepEqual(result.storedValues, [0, 1, 0, 1]);
  assert.equal(result.storedEncoding, 'uint8-zero-transparent-v1');
  assert.equal(result.fullPaletteType, 'Int16Array');
  assert.equal(result.fullPaletteEncoding, '');
  assert.deepEqual(result.capturedSerializationOptions, {
    preserveTypedArrays: true,
    compactIndicesForStorage: true,
  });
  assert.equal(result.checkpointType, 'Uint8Array');
  assert.deepEqual(result.checkpointValues, [0, 1, 0, 1]);
  assert.equal(result.checkpointEncoding, 'uint8-zero-transparent-v1');
  assert.equal(result.restoredRuntimeType, 'Uint8Array');
  assert.deepEqual(result.restoredRuntimeValues, [0, 1, 0, 1]);
  assert.equal(result.materializedRuntimeType, 'Uint8Array');
  console.log('Autosave index8 normalization checks passed');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
