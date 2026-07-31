import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

globalThis.window = { PiXiEEDrawModules: {} };
new Function(await readFile(new URL('../pixiedraw/assets/js/modules/pixisync-document-operation-utils.js', import.meta.url), 'utf8'))();

const codec = window.PiXiEEDrawModules.pixisyncDocumentOperationUtils;
const structure = {
  version: 1,
  type: 'document_structure',
  document: {
    palette: [{ r: 0, g: 0, b: 0, a: 0 }, { r: 255, g: 0, b: 0, a: 255 }],
    canvases: [{
      id: 'canvas-a',
      name: 'Canvas 1',
      width: 16,
      height: 16,
      frames: [{
        id: 'frame-a',
        name: 'Frame 1',
        duration: 100,
        layers: [{ id: 'layer-a', trackId: 'track-a', name: 'Layer 1', opacity: 0.75, blendMode: 'normal' }],
      }],
    }],
  },
};

const encoded = codec.encode(structure);
assert.deepEqual(codec.decode(encoded), structure);
assert.equal(codec.classifyHistoryLabel('addLayer'), 'document_structure');
assert.equal(codec.classifyHistoryLabel('setLayerOpacity'), 'layer_properties');
assert.equal(codec.classifyHistoryLabel('setFrameFps'), 'frame_properties');
assert.equal(codec.classifyHistoryLabel('setLayerVisibility'), 'local-only');
assert.equal(codec.classifyHistoryLabel('setOnionSkin'), 'local-only');
assert.equal(codec.classifyHistoryLabel('toggleOnionSkin'), 'local-only');
assert.equal(codec.classifyHistoryLabel('duplicateLayer'), 'checkpoint_restore');
assert.equal(codec.classifyHistoryLabel('resizeCanvas'), 'checkpoint_restore');
assert.equal(codec.classifyHistoryLabel('paletteReorder'), 'checkpoint_restore');
for (const label of [
  'removeLayer', 'removeFrame', 'removeCanvas',
  'clearCanvas', 'scaleSprite', 'selectionOutline4', 'selectionOutline8', 'selectionPaste',
]) assert.equal(codec.classifyHistoryLabel(label), 'checkpoint_restore', label);
assert.equal(codec.classifyHistoryLabel('colorModeConvert'), '');
assert.equal(codec.classifyHistoryLabel('pen'), '');

const checkpoint = {
  version: 1,
  type: 'checkpoint_restore',
  objectPath: 'rooms/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/document-checkpoints/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pxd',
  sha256Hex: 'ab'.repeat(32),
  byteLength: 12345,
};
assert.deepEqual(codec.decode(codec.encode(checkpoint)), checkpoint);
assert.throws(() => codec.encode({ ...checkpoint, objectPath: '../checkpoint.pxied' }), /invalid-checkpoint-object-path/);
assert.throws(() => codec.encode({ ...checkpoint, sha256Hex: 'not-a-hash' }), /invalid-checkpoint-sha256/);

assert.throws(() => codec.encode({
  ...structure,
  document: {
    ...structure.document,
    canvases: [{
      ...structure.document.canvases[0],
      frames: [{
        ...structure.document.canvases[0].frames[0],
        layers: [{ ...structure.document.canvases[0].frames[0].layers[0], visible: false }],
      }],
    }],
  },
}), /visibility-must-be-local/);
assert.throws(() => codec.encode({
  ...structure,
  document: {
    ...structure.document,
    canvases: [{
      ...structure.document.canvases[0],
      frames: [{
        ...structure.document.canvases[0].frames[0],
        layers: [{ ...structure.document.canvases[0].frames[0].layers[0], indices: [1] }],
      }],
    }],
  },
}), /raster-not-allowed-in-structure/);
assert.throws(() => codec.decode(new TextEncoder().encode('{{')), /invalid-json/);
assert.throws(() => codec.encode({ version: 1, type: 'layer_properties', layers: [{ layerId: 'layer-a', visible: true }] }), /visibility-must-be-local/);

console.log('PiXiSYNC document operation codec tests passed');
