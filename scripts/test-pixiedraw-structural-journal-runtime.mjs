import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
globalThis.window = { PiXiEEDrawModules: {} };
vm.runInThisContext(
  fs.readFileSync(path.join(repoRoot, 'pixiedraw/assets/js/modules/autosave-schema-v2-utils.js'), 'utf8'),
  { filename: 'autosave-schema-v2-utils.js' }
);

const schema = window.PiXiEEDrawModules.autosaveSchemaV2Utils.createAutosaveSchemaV2Utils();
const baseProject = {
  type: 'pixieedraw-project',
  packageVersion: 2,
  version: 2,
  document: {
    id: 'canvas-1',
    activeCanvasId: 'canvas-1',
    width: 256,
    height: 256,
    activeFrame: 0,
    activeLayer: 'layer-base',
    palette: [{ r: 0, g: 0, b: 0, a: 0 }],
    frames: [{
      id: 'frame-1',
      name: 'Frame 1',
      duration: 100,
      layers: [{
        id: 'layer-base',
        trackId: 'track-base',
        name: 'Layer 1',
        visible: true,
        opacity: 1,
        blendMode: 'normal',
        indices: new Int16Array(256 * 256).fill(-1),
        direct: null,
        importSourceDirect: null,
        directOnly: false,
      }],
    }],
  },
  session: {},
};

const checkpointBundle = schema.createSchemaV2Revision({
  projectId: 'project-structure-journal',
  name: 'structure-journal.pxd',
  fileName: 'structure-journal.pxd',
  project: baseProject,
}, { revision: 1 });
const checkpoint = checkpointBundle.checkpoints[0];
const addedLayer = {
  id: 'layer-added',
  trackId: 'track-added',
  name: 'Layer 2',
  visible: true,
  opacity: 1,
  blendMode: 'normal',
  indices: null,
  indicesImplicitTransparent: true,
  direct: null,
  importSourceDirect: null,
  directOnly: false,
};
const journalBundle = schema.createSchemaV2JournalRevision(
  checkpointBundle.manifest,
  [
    {
      sequence: 1,
      kind: 'layer-add',
      canvasId: 'canvas-1',
      activeFrame: 0,
      activeLayer: 'layer-added',
      layers: [{ frameId: 'frame-1', layerId: 'layer-added', index: 1, layer: addedLayer }],
    },
    {
      sequence: 2,
      kind: 'frame-add',
      canvasId: 'canvas-1',
      activeFrame: 1,
      activeLayer: 'frame-2-layer-2',
      frames: [{
        frameId: 'frame-2',
        index: 1,
        frame: {
          id: 'frame-2',
          name: 'Frame 2',
          duration: 100,
          layers: [
            { ...baseProject.document.frames[0].layers[0], id: 'frame-2-layer-1', indices: null, indicesImplicitTransparent: true },
            { ...addedLayer, id: 'frame-2-layer-2' },
          ],
        },
      }],
    },
  ],
  { revision: 2 }
);
const journal = journalBundle.journals[0];
const restored = schema.restoreSchemaV2Manifest(
  journalBundle.manifest,
  new Map([[checkpoint.key, checkpoint]]),
  new Map([[journal.key, journal]])
);

assert.equal(restored.document.frames[0].layers.length, 2);
assert.equal(restored.document.frames[0].layers[1].id, 'layer-added');
assert.equal(restored.document.frames[0].layers[1].trackId, 'track-added');
assert.equal(restored.document.frames[0].layers[1].indices, null);
assert.equal(restored.document.frames[0].layers[1].indicesImplicitTransparent, true);
assert.equal(restored.document.frames.length, 2);
assert.equal(restored.document.frames[1].id, 'frame-2');
assert.equal(restored.document.frames[1].layers.length, 2);
assert.equal(restored.document.frames[1].layers[0].indices, null);
assert.equal(restored.document.frames[1].layers[0].indicesImplicitTransparent, true);
assert.equal(restored.document.frames[1].layers[0].trackId, 'track-base');
assert.equal(restored.document.frames[1].layers[1].trackId, 'track-added');
assert.equal(restored.document.activeFrame, 1);
assert.equal(restored.document.activeLayer, 'frame-2-layer-2');
assert.equal(
  journal.baseCheckpointKey,
  checkpoint.key,
  'structural journal must reuse the immutable checkpoint'
);

// A compact sparse layer has no dense indices buffer. Journal replay must
// update its tile directly; allocating a dense buffer here would discard the
// already-checkpointed sparse pixels after a reload.
const sparseTileSize = 8;
const sparseWidth = 16;
const sparseHeight = 8;
const sparseTile = new Uint8Array(sparseTileSize * sparseTileSize);
sparseTile[0] = 2; // Stored palette index 1 at (0, 0).
const sparseProject = {
  type: 'pixieedraw-project',
  packageVersion: 2,
  version: 2,
  document: {
    id: 'canvas-sparse', activeCanvasId: 'canvas-sparse', width: sparseWidth, height: sparseHeight,
    activeFrame: 0, activeLayer: 'layer-sparse', palette: [{ r: 0, g: 0, b: 0, a: 0 }],
    frames: [{
      id: 'frame-sparse', name: 'Frame 1', duration: 100,
      layers: [{
        id: 'layer-sparse', trackId: 'track-sparse', name: 'Layer 1', visible: true, opacity: 1, blendMode: 'normal',
        indicesEncoding: 'uint8-tiled-zero-transparent-v1', indices: new Uint8Array(0),
        indicesTiles: new Map([[0, sparseTile]]), indicesWidth: sparseWidth, indicesHeight: sparseHeight,
        indicesTileSize: sparseTileSize, direct: null, importSourceDirect: null, directOnly: false,
      }],
    }],
  },
  session: {},
};
const sparseCheckpointBundle = schema.createSchemaV2Revision({
  projectId: 'project-sparse-journal', name: 'sparse-journal.pxd', fileName: 'sparse-journal.pxd', project: sparseProject,
}, { revision: 1 });
const sparseCheckpoint = sparseCheckpointBundle.checkpoints[0];
const sparseJournalBundle = schema.createSchemaV2JournalRevision(sparseCheckpointBundle.manifest, [{
  sequence: 1, kind: 'pixel-patch', canvasId: 'canvas-sparse', frameId: 'frame-sparse', layerId: 'layer-sparse',
  changes: [{ index: 9, after: { paletteIndex: 3 } }],
}], { revision: 2 });
const sparseJournal = sparseJournalBundle.journals[0];
const sparseRestored = schema.restoreSchemaV2Manifest(
  sparseJournalBundle.manifest,
  new Map([[sparseCheckpoint.key, sparseCheckpoint]]),
  new Map([[sparseJournal.key, sparseJournal]])
);
const sparseRestoredLayer = sparseRestored.document.frames[0].layers[0];
assert.equal(sparseRestoredLayer.indices.length, 0, 'sparse journal replay must not materialize a dense buffer');
assert.ok(sparseRestoredLayer.indicesTiles instanceof Map, 'sparse journal replay must retain tile storage');
assert.equal(sparseRestoredLayer.indicesTiles.get(0)?.[0], 2, 'checkpoint sparse pixel must survive journal replay');
assert.equal(sparseRestoredLayer.indicesTiles.get(1)?.[1], 4, 'journal pixel must be written using sparse storage encoding');

console.log(JSON.stringify({
  checkpointRevision: checkpointBundle.manifest.revision,
  journalRevision: journalBundle.manifest.revision,
  checkpointReused: journal.baseCheckpointKey === checkpoint.key,
  restoredLayerCount: restored.document.frames[0].layers.length,
  restoredFrameCount: restored.document.frames.length,
  addedLayerHasPixelBuffer: restored.document.frames[0].layers[1].indices != null,
  addedFrameHasPixelBuffer: restored.document.frames[1].layers.some(layer => layer.indices != null),
  sparseJournalRetainedTiles: sparseRestoredLayer.indicesTiles.size,
}, null, 2));
