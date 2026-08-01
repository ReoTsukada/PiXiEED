import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// This deliberately mirrors the released `structure_delta` wire actions, not
// UI history labels. It is a two-peer protocol oracle: after every ordered
// server revision the canonical raster + structural state must be identical.
globalThis.window = { PiXiEEDrawModules: {} };
new Function(await readFile(new URL('../pixiedraw/assets/js/modules/pixisync-document-operation-utils.js', import.meta.url), 'utf8'))();
const codec = window.PiXiEEDrawModules.pixisyncDocumentOperationUtils;

const empty = length => Array.from({ length }, () => -1);
const clone = value => structuredClone(value);
const digest = document => JSON.stringify(document);
const descriptor = (id, trackId, name = id) => ({ id, trackId, name, opacity: 1, blendMode: 'normal' });
const layer = (id, trackId, pixels) => ({ ...descriptor(id, trackId), pixels: pixels || empty(12) });
const rasterAssets = new Map();
const pixelsToSparse = pixels => pixels.flatMap((value, index) => value > 0 ? [[index, value]] : []);
const registerAsset = (id, asset) => {
  const reference = inverseAsset(id);
  rasterAssets.set(reference.objectPath, asset);
  return reference;
};
const makeDocument = () => ({
  canvasId: 'canvas-1', width: 4, height: 3,
  frames: [{ id: 'frame-1', name: 'Frame 1', duration: 100, layers: [layer('layer-1', 'track-1')] }],
});

function copyResized(pixels, fromWidth, fromHeight, width, height, offsetX, offsetY) {
  const next = empty(width * height);
  for (let y = 0; y < fromHeight; y += 1) for (let x = 0; x < fromWidth; x += 1) {
    const targetX = x + offsetX; const targetY = y + offsetY;
    if (targetX >= 0 && targetX < width && targetY >= 0 && targetY < height) {
      next[(targetY * width) + targetX] = pixels[(y * fromWidth) + x];
    }
  }
  return next;
}

function frame(document, id) {
  const result = document.frames.find(item => item.id === id);
  assert.ok(result, `missing frame ${id}`);
  return result;
}

function insertAfter(items, anchorId, value, id = value.id) {
  assert.equal(items.some(item => item.id === id || item.trackId === id), false, `duplicate identity ${id}`);
  const index = anchorId === null ? -1 : items.findIndex(item => item.id === anchorId || item.trackId === anchorId);
  assert.ok(anchorId === null || index >= 0, `missing anchor ${anchorId}`);
  items.splice(index + 1, 0, value);
}

function applyStructureDelta(document, operation) {
  // The same byte-level codec used by the browser is a required precondition.
  assert.deepEqual(codec.decode(codec.encode(operation)), operation);
  const { action, data } = operation;
  assert.equal(data.canvasId, document.canvasId);
  if (action === 'layer_track_insert') {
    assert.equal(data.cells.length, document.frames.length, 'one new track cel per frame');
    const trackId = data.cells[0].layer.trackId;
    document.frames.forEach(current => {
      const cell = data.cells.find(item => item.frameId === current.id);
      assert.ok(cell && cell.layer.trackId === trackId, 'complete same-track insert');
      insertAfter(current.layers, data.afterTrackId, { ...clone(cell.layer), pixels: empty(document.width * document.height) }, trackId);
    });
  } else if (action === 'layer_track_clone') {
    data.clones.forEach(item => document.frames.forEach(current => {
      const source = current.layers.find(layerItem => layerItem.trackId === item.sourceTrackId);
      const cell = item.cells.find(candidate => candidate.frameId === current.id);
      assert.ok(source && cell, 'clone source/cel must exist at same revision');
      insertAfter(current.layers, data.afterTrackId, { ...clone(source), id: cell.layerId, trackId: item.trackId, pixels: source.pixels.slice() }, item.trackId);
    }));
  } else if (action === 'layer_track_remove') {
    const trackIds = new Set(data.trackIds);
    document.frames.forEach(current => {
      const indexes = current.layers.map((item, index) => trackIds.has(item.trackId) ? index : -1).filter(index => index >= 0);
      assert.equal(indexes.length, trackIds.size, 'cannot remove a missing track');
      assert.ok(current.layers.length > indexes.length, 'cannot remove final track');
      indexes.sort((a, b) => b - a).forEach(index => current.layers.splice(index, 1));
    });
  } else if (action === 'frame_clone') {
    data.clones.forEach(item => {
      const source = frame(document, item.sourceFrameId);
      assert.equal(item.layerIds.length, source.layers.length, 'clone needs every layer identity');
      insertAfter(document.frames, data.afterFrameId, {
        id: item.frameId, name: item.name, duration: item.duration,
        layers: source.layers.map((current, index) => ({ ...clone(current), id: item.layerIds[index], pixels: current.pixels.slice() })),
      });
    });
  } else if (action === 'frame_remove') {
    const frameIds = new Set(data.frameIds);
    const indexes = document.frames.map((item, index) => frameIds.has(item.id) ? index : -1).filter(index => index >= 0);
    assert.equal(indexes.length, frameIds.size, 'cannot remove a missing frame');
    assert.ok(document.frames.length > indexes.length, 'cannot remove final frame');
    indexes.sort((a, b) => b - a).forEach(index => document.frames.splice(index, 1));
  } else if (action === 'raster_restore') {
    const asset = rasterAssets.get(data.inverseAsset.objectPath);
    assert.ok(asset, 'verified inverse asset must be available');
    if (asset.kind === 'layer-track-remove') {
      const anchorIndex = data.afterTrackId === null ? -1 : document.frames[0].layers.findIndex(item => item.trackId === data.afterTrackId);
      assert.ok(anchorIndex >= -1, 'known layer restore anchor');
      document.frames.forEach(current => {
        const saved = asset.frames.find(item => item.frameId === current.id);
        assert.ok(saved, 'layer restore needs each frame');
        current.layers.splice(anchorIndex + 1, 0, ...saved.layers.map(item => ({ ...clone(item), pixels: (() => { const p = empty(document.width * document.height); item.pixels.forEach(([index, value]) => { p[index] = value; }); return p; })() })));
      });
    } else if (asset.kind === 'frame-remove') {
      const anchorIndex = data.afterFrameId === null ? -1 : document.frames.findIndex(item => item.id === data.afterFrameId);
      document.frames.splice(anchorIndex + 1, 0, ...asset.frames.map(saved => ({
        id: saved.frameId, name: saved.name, duration: saved.duration,
        layers: saved.layers.map(item => ({ ...clone(item), pixels: (() => { const p = empty(document.width * document.height); item.pixels.forEach(([index, value]) => { p[index] = value; }); return p; })() })),
      })));
    } else throw new Error('unsupported restore asset');
  } else if (action === 'canvas_resize_restore') {
    const asset = rasterAssets.get(data.inverseAsset.objectPath);
    assert.ok(asset && asset.kind === 'canvas-resize-lost', 'verified resize inverse asset must be available');
    assert.equal(document.width, data.fromWidth); assert.equal(document.height, data.fromHeight);
    document.frames.forEach(current => current.layers.forEach(item => {
      item.pixels = copyResized(item.pixels, data.fromWidth, data.fromHeight, data.width, data.height, data.offsetX, data.offsetY);
    }));
    document.width = data.width; document.height = data.height;
    asset.frames.forEach(saved => saved.layers.forEach(savedLayer => {
      const target = frame(document, saved.frameId).layers.find(item => item.id === savedLayer.id && item.trackId === savedLayer.trackId);
      assert.ok(target, 'resize restore layer identity');
      savedLayer.pixels.forEach(([index, value]) => { target.pixels[index] = value; });
    }));
  } else if (action === 'canvas_resize') {
    assert.equal(document.width, data.fromWidth); assert.equal(document.height, data.fromHeight);
    document.frames.forEach(current => current.layers.forEach(item => {
      item.pixels = copyResized(item.pixels, data.fromWidth, data.fromHeight, data.width, data.height, data.offsetX, data.offsetY);
    }));
    document.width = data.width; document.height = data.height;
  } else if (action === 'frame_order') {
    assert.equal(data.frameIds.length, document.frames.length, 'frame order must cover the complete timeline');
    const byId = new Map(document.frames.map(item => [item.id, item]));
    assert.equal(byId.size, document.frames.length, 'frame ids must remain unique');
    assert.ok(data.frameIds.every(id => byId.has(id)), 'frame order cannot target an unknown frame');
    document.frames.splice(0, document.frames.length, ...data.frameIds.map(id => byId.get(id)));
  } else if (action === 'layer_order') {
    document.frames.forEach(current => {
      assert.equal(data.trackIds.length, current.layers.length, 'track order must cover every frame');
      const byTrackId = new Map(current.layers.map(item => [item.trackId, item]));
      assert.equal(byTrackId.size, current.layers.length, 'track ids must remain unique per frame');
      assert.ok(data.trackIds.every(id => byTrackId.has(id)), 'track order cannot target an unknown track');
      current.layers.splice(0, current.layers.length, ...data.trackIds.map(id => byTrackId.get(id)));
    });
  } else {
    throw new Error(`unreleased/non-modelled action ${action}`);
  }
}

function peer() {
  return { revision: 0, epoch: 0, document: makeDocument(), receive(envelope) {
    assert.equal(envelope.baseRevision, this.revision, `stale/noncontiguous ${envelope.operation.action}`);
    assert.equal(envelope.structureEpoch, this.epoch, `stale epoch ${envelope.operation.action}`);
    applyStructureDelta(this.document, clone(envelope.operation));
    this.revision += 1; this.epoch += 1;
  } };
}
function commit(peers, envelope) {
  peers.forEach(item => item.receive(clone(envelope)));
  assert.equal(digest(peers[0].document), digest(peers[1].document), `two-peer divergence after ${envelope.operation.action}`);
}
const op = (baseRevision, structureEpoch, action, data) => ({ baseRevision, structureEpoch, operation: { version: 1, type: 'structure_delta', action, data } });
const inverseAsset = id => ({
  objectPath: `rooms/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/document-checkpoints/${id}.pxd`,
  sha256Hex: 'ab'.repeat(32), byteLength: 128, codecVersion: 1,
});
const owner = peer(); const participant = peer(); const peers = [owner, participant];

// Pixel state first proves that structural deltas preserve, rather than replace,
// pre-existing drawing state.
owner.document.frames[0].layers[0].pixels[0] = 9;
participant.document.frames[0].layers[0].pixels[0] = 9;
commit(peers, op(0, 0, 'layer_track_insert', {
  canvasId: 'canvas-1', afterTrackId: 'track-1',
  cells: [{ frameId: 'frame-1', layer: descriptor('layer-2', 'track-2') }],
}));
assert.equal(owner.document.frames[0].layers[0].pixels[0], 9);
assert.deepEqual(owner.document.frames[0].layers[1].pixels, empty(12));

commit(peers, op(1, 1, 'frame_clone', {
  canvasId: 'canvas-1', afterFrameId: 'frame-1',
  clones: [{ sourceFrameId: 'frame-1', frameId: 'frame-2', name: 'Frame 2', duration: 150, layerIds: ['layer-3', 'layer-4'] }],
}));
assert.deepEqual(owner.document.frames[1].layers.map(item => item.pixels), owner.document.frames[0].layers.map(item => item.pixels));
assert.equal(owner.document.frames[1].name, 'Frame 2');
assert.equal(owner.document.frames[1].duration, 150);

commit(peers, op(2, 2, 'frame_order', {
  canvasId: 'canvas-1', frameIds: ['frame-2', 'frame-1'],
}));
commit(peers, op(3, 3, 'frame_order', {
  canvasId: 'canvas-1', frameIds: ['frame-1', 'frame-2'],
}));

commit(peers, op(4, 4, 'layer_track_clone', {
  canvasId: 'canvas-1', afterTrackId: 'track-1', clones: [{
    sourceTrackId: 'track-1', trackId: 'track-3',
    cells: [{ frameId: 'frame-1', layerId: 'layer-5' }, { frameId: 'frame-2', layerId: 'layer-6' }],
  }],
}));
assert.deepEqual(owner.document.frames[0].layers.map(item => item.trackId), ['track-1', 'track-3', 'track-2']);
assert.deepEqual(owner.document.frames[0].layers[1].pixels, owner.document.frames[0].layers[0].pixels);

// Resize is compact intent (dimensions + offset) and produces the same result
// on every existing cel. Its inverse is another ordered resize delta.
commit(peers, op(5, 5, 'canvas_resize', {
  canvasId: 'canvas-1', fromWidth: 4, fromHeight: 3, width: 6, height: 4, offsetX: 1, offsetY: 1,
}));
assert.equal(owner.document.frames[0].layers[0].pixels[7], 9);
commit(peers, op(6, 6, 'canvas_resize', {
  canvasId: 'canvas-1', fromWidth: 6, fromHeight: 4, width: 4, height: 3, offsetX: -1, offsetY: -1,
  inverseAsset: inverseAsset('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
}));
assert.equal(owner.document.frames[0].layers[0].pixels[0], 9, 'reversible in-bounds resize converges');

// A cropped edge is preserved as sparse old-coordinate pixels, then merged
// only after the inverse resize has recreated its original coordinate plane.
owner.document.frames[0].layers[0].pixels[11] = 7;
participant.document.frames[0].layers[0].pixels[11] = 7;
const croppedAsset = registerAsset('abababab-abab-4bab-8bab-abababababab', {
  version: 1, kind: 'canvas-resize-lost', canvasId: 'canvas-1', width: 4, height: 3,
  frames: owner.document.frames.map(current => ({
    frameId: current.id, name: current.name, duration: current.duration,
    layers: current.layers.map(item => ({ ...descriptor(item.id, item.trackId, item.name), pixels: item.pixels[11] > 0 ? [[11, item.pixels[11]]] : [] })),
  })),
});
commit(peers, op(7, 7, 'canvas_resize', {
  canvasId: 'canvas-1', fromWidth: 4, fromHeight: 3, width: 3, height: 3, offsetX: 0, offsetY: 0,
  inverseAsset: croppedAsset,
}));
commit(peers, op(8, 8, 'canvas_resize_restore', {
  canvasId: 'canvas-1', fromWidth: 3, fromHeight: 3, width: 4, height: 3, offsetX: 0, offsetY: 0,
  inverseAsset: croppedAsset,
}));
assert.equal(owner.document.frames[0].layers[0].pixels[11], 7, 'cropped sparse pixel is restored');

const removedTrackAsset = registerAsset('cccccccc-cccc-4ccc-8ccc-cccccccccccc', {
  version: 1, kind: 'layer-track-remove', canvasId: 'canvas-1', width: 4, height: 3,
  frames: owner.document.frames.map(current => ({
    frameId: current.id, name: current.name, duration: current.duration,
    layers: current.layers.filter(item => item.trackId === 'track-2').map(item => ({ ...descriptor(item.id, item.trackId, item.name), pixels: pixelsToSparse(item.pixels) })),
  })),
});
commit(peers, op(9, 9, 'layer_track_remove', {
  canvasId: 'canvas-1', trackIds: ['track-2'], inverseAsset: removedTrackAsset,
}));
commit(peers, op(10, 10, 'raster_restore', {
  canvasId: 'canvas-1', afterFrameId: null, afterTrackId: 'track-3', inverseAsset: removedTrackAsset,
}));
assert.equal(owner.document.frames[0].layers.at(-1).trackId, 'track-2', 'removed track is restored with its sparse raster');

const removedFrameAsset = registerAsset('dddddddd-dddd-4ddd-8ddd-dddddddddddd', {
  version: 1, kind: 'frame-remove', canvasId: 'canvas-1', width: 4, height: 3,
  frames: [owner.document.frames[1]].map(current => ({
    frameId: current.id, name: current.name, duration: current.duration,
    layers: current.layers.map(item => ({ ...descriptor(item.id, item.trackId, item.name), pixels: pixelsToSparse(item.pixels) })),
  })),
});
commit(peers, op(11, 11, 'frame_remove', {
  canvasId: 'canvas-1', frameIds: ['frame-2'], inverseAsset: removedFrameAsset,
}));
commit(peers, op(12, 12, 'raster_restore', {
  canvasId: 'canvas-1', afterFrameId: 'frame-1', afterTrackId: null, inverseAsset: removedFrameAsset,
}));
assert.equal(owner.document.frames[1].id, 'frame-2', 'removed frame is restored with its sparse raster');

// Reorder operations are compact complete identity orders.  The inverse is
// the pre-move order stored in local history, not a second raster snapshot.
commit(peers, op(13, 13, 'layer_order', {
  canvasId: 'canvas-1', trackIds: ['track-3', 'track-1', 'track-2'],
}));
assert.deepEqual(owner.document.frames[0].layers.map(item => item.trackId), ['track-3', 'track-1', 'track-2']);
commit(peers, op(14, 14, 'layer_order', {
  canvasId: 'canvas-1', trackIds: ['track-1', 'track-3', 'track-2'],
}));

// A delayed stale delta is never applied to an altered shape/order.
assert.throws(() => participant.receive(op(14, 14, 'layer_track_remove', { canvasId: 'canvas-1', trackIds: ['track-3'], inverseAsset: inverseAsset('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') })), /stale\/noncontiguous/);
assert.throws(() => participant.receive(op(15, 14, 'layer_track_remove', { canvasId: 'canvas-1', trackIds: ['track-3'], inverseAsset: inverseAsset('ffffffff-ffff-4eee-8eee-eeeeeeeeeeee') })), /stale epoch/);
console.log('PiXiSYNC released document delta two-peer convergence tests passed');
