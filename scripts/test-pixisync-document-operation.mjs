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
assert.equal(codec.classifyHistoryLabel('addLayer'), 'structure_delta');
assert.equal(codec.classifyHistoryLabel('setLayerOpacity'), 'layer_properties');
assert.equal(codec.classifyHistoryLabel('setFrameFps'), 'frame_properties');
assert.equal(codec.classifyHistoryLabel('setLayerVisibility'), 'local-only');
assert.equal(codec.classifyHistoryLabel('setOnionSkin'), 'local-only');
assert.equal(codec.classifyHistoryLabel('toggleOnionSkin'), 'local-only');
assert.equal(codec.classifyHistoryLabel('duplicateLayer'), 'structure_delta');
assert.equal(codec.classifyHistoryLabel('resizeCanvas'), 'structure_delta');
assert.equal(codec.classifyHistoryLabel('paletteReorder'), 'checkpoint_restore');
for (const label of [
  'pasteLayer',
  'pasteFrame',
  'addCanvas', 'removeCanvas', 'reorderCanvas',
  'moveLayer', 'reorderLayer', 'moveFrame', 'reorderFrame',
  'clearCanvas', 'scaleSprite', 'selectionOutline4', 'selectionOutline8', 'selectionPaste',
]) assert.equal(codec.classifyHistoryLabel(label), 'checkpoint_restore', label);
assert.equal(codec.classifyHistoryLabel('addFrame'), 'structure_delta');
for (const label of [
  'removeLayer', 'moveLayerUp', 'moveLayerDown', 'moveLayerGroupUp', 'moveLayerGroupDown',
  'removeFrame', 'duplicateFrame', 'moveFrameLeft', 'moveFrameRight',
]) assert.equal(codec.classifyHistoryLabel(label), 'structure_delta', label);
assert.equal(codec.classifyHistoryLabel('colorModeConvert'), 'checkpoint_restore');
assert.equal(codec.classifyHistoryLabel('moveLayerCellsUp'), 'checkpoint_restore');
assert.equal(codec.classifyHistoryLabel('moveLayerCellsDown'), 'checkpoint_restore');
assert.equal(codec.classifyHistoryLabel('moveSlotFrameLeft'), 'checkpoint_restore');
assert.equal(codec.classifyHistoryLabel('moveSlotFrameRight'), 'checkpoint_restore');
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

const layerDescriptor = { id: 'layer-b', trackId: 'track-b', name: 'Layer B', opacity: 1, blendMode: 'normal' };
const layerInsert = {
  version: 1,
  type: 'structure_delta',
  action: 'layer_track_insert',
  data: { canvasId: 'canvas-a', afterTrackId: 'track-a', cells: [{ frameId: 'frame-a', layer: layerDescriptor }] },
};
assert.deepEqual(codec.decode(codec.encode(layerInsert)), layerInsert);
const frameInsert = {
  version: 1,
  type: 'structure_delta',
  action: 'frame_insert',
  data: {
    canvasId: 'canvas-a',
    afterFrameId: 'frame-a',
    frame: {
      id: 'frame-b', name: 'Frame 2', duration: 150,
      layers: [{ id: 'layer-c', trackId: 'track-a', name: 'Layer 1', opacity: 1, blendMode: 'normal' }],
    },
  },
};
assert.deepEqual(codec.decode(codec.encode(frameInsert)), frameInsert);
const rasterRegionSet = {
  version: 1,
  type: 'raster_region_set',
  canvasId: 'canvas-a', frameId: 'frame-a', layerId: 'layer-a',
  canvasWidth: 16, canvasHeight: 16, x: 2, y: 3, width: 5, height: 4,
  asset: {
    objectPath: 'rooms/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/raster-assets/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pxra',
    sha256Hex: 'cd'.repeat(32), byteLength: 64, codecVersion: 1, pixelFormat: 'indexed-mask-v1',
  },
};
assert.deepEqual(codec.decode(codec.encode(rasterRegionSet)), rasterRegionSet);
const resize = {
  version: 1,
  type: 'structure_delta',
  action: 'canvas_resize',
  data: { canvasId: 'canvas-a', fromWidth: 16, fromHeight: 16, width: 24, height: 20, offsetX: 4, offsetY: 2 },
};
assert.deepEqual(codec.decode(codec.encode(resize)), resize);
const frameClone = {
  version: 1,
  type: 'structure_delta',
  action: 'frame_clone',
  data: { canvasId: 'canvas-a', afterFrameId: 'frame-a', clones: [{ sourceFrameId: 'frame-a', frameId: 'frame-b', name: 'Frame 2', duration: 150, layerIds: ['layer-b'] }] },
};
assert.deepEqual(codec.decode(codec.encode(frameClone)), frameClone);
const trackClone = {
  version: 1,
  type: 'structure_delta',
  action: 'layer_track_clone',
  data: { canvasId: 'canvas-a', afterTrackId: 'track-a', clones: [{ sourceTrackId: 'track-a', trackId: 'track-b', cells: [{ frameId: 'frame-a', layerId: 'layer-b' }] }] },
};
assert.deepEqual(codec.decode(codec.encode(trackClone)), trackClone);
const rasterAsset = {
  objectPath: 'rooms/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/document-checkpoints/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pxd',
  sha256Hex: 'ab'.repeat(32), byteLength: 128, codecVersion: 1,
};
const rasterRestore = {
  version: 1, type: 'structure_delta', action: 'raster_restore',
  data: { canvasId: 'canvas-a', afterFrameId: null, afterTrackId: 'track-a', inverseAsset: rasterAsset },
};
assert.deepEqual(codec.decode(codec.encode(rasterRestore)), rasterRestore);
const resizeRestore = {
  version: 1, type: 'structure_delta', action: 'canvas_resize_restore',
  data: { canvasId: 'canvas-a', fromWidth: 12, fromHeight: 12, width: 16, height: 16, offsetX: 0, offsetY: 0, inverseAsset: rasterAsset },
};
assert.deepEqual(codec.decode(codec.encode(resizeRestore)), resizeRestore);
assert.throws(() => codec.encode({ ...rasterRestore, data: { ...rasterRestore.data, afterTrackId: 1 } }), /invalid-after-track-id/);
assert.throws(() => codec.encode({ ...resizeRestore, data: { ...resizeRestore.data, inverseAsset: { ...rasterAsset, byteLength: 0 } } }), /invalid-raster-asset-size/);
assert.throws(() => codec.encode({ ...layerInsert, data: { ...layerInsert.data, cells: [{ ...layerInsert.data.cells[0], layer: { ...layerDescriptor, visible: false } }] } }), /invalid-layer/);
assert.throws(() => codec.encode({ ...resize, data: { ...resize.data, width: 0 } }), /invalid-width/);
assert.throws(() => codec.encode({ ...layerInsert, data: { ...layerInsert.data, cells: [...layerInsert.data.cells, layerInsert.data.cells[0]] } }), /duplicate-layer-track-cell/);
assert.throws(() => codec.encode({ ...frameClone, data: { ...frameClone.data, clones: [{ ...frameClone.data.clones[0], name: '' }] } }), /invalid-frame-clone-name/);
assert.throws(() => codec.encode({ ...frameClone, data: { ...frameClone.data, clones: [{ ...frameClone.data.clones[0], duration: 0 }] } }), /invalid-frame-clone-duration/);

console.log('PiXiSYNC document operation codec tests passed');
