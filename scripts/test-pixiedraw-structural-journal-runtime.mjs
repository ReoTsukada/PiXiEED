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
assert.equal(restored.document.frames[0].layers[1].indices, null);
assert.equal(restored.document.frames[0].layers[1].indicesImplicitTransparent, true);
assert.equal(restored.document.frames.length, 2);
assert.equal(restored.document.frames[1].id, 'frame-2');
assert.equal(restored.document.frames[1].layers.length, 2);
assert.equal(restored.document.frames[1].layers[0].indices, null);
assert.equal(restored.document.frames[1].layers[0].indicesImplicitTransparent, true);
assert.equal(restored.document.activeFrame, 1);
assert.equal(restored.document.activeLayer, 'frame-2-layer-2');
assert.equal(
  journal.baseCheckpointKey,
  checkpoint.key,
  'structural journal must reuse the immutable checkpoint'
);

console.log(JSON.stringify({
  checkpointRevision: checkpointBundle.manifest.revision,
  journalRevision: journalBundle.manifest.revision,
  checkpointReused: journal.baseCheckpointKey === checkpoint.key,
  restoredLayerCount: restored.document.frames[0].layers.length,
  restoredFrameCount: restored.document.frames.length,
  addedLayerHasPixelBuffer: restored.document.frames[0].layers[1].indices != null,
  addedFrameHasPixelBuffer: restored.document.frames[1].layers.some(layer => layer.indices != null),
}, null, 2));
