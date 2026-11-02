import test from 'node:test';
import assert from 'node:assert/strict';
import { addConversionMaterials, countConversionMaterialFrames, describeConversionMaterials, firstConversionAssetFrameIndex, moveConversionMaterial, preserveConversionFrameAfterRemoval, removeConversionMaterial, removeConversionMaterialWithTicket, restoreConversionMaterial, snapshotConversionMaterialSource, validateConversionMaterialFiles } from '../../js/creation/conversion-materials.mjs';

const frame = (assetId, delayMs = 100, index = 0) => ({ assetId, frameId: `${assetId}:${index}`, width: 1, height: 1, data: new Uint8ClampedArray(4), delayMs });
const sizedFrame = (assetId, width, height, delayMs = 100, index = 0) => ({ assetId, frameId: `${assetId}:${index}`, width, height, data: new Uint8ClampedArray(width * height * 4), delayMs });
const asset = (id, n = 1, bytes = 10) => ({ id, name: `${id}.gif`, kind: 'image', bytes, rawFrames: Array.from({ length: n }, (_, i) => frame(id, 100 + i, i)) });
const source = (...assets) => ({ kind: 'image', name: assets[0]?.name, sequence: assets.length > 1, frames: assets.flatMap(item => item.rawFrames || item.frames), assets, totalPlays: 0 });

test('tracks input files independently from decoded frames and exposes local first-frame references', () => {
  const oneGif = source(asset('gif', 600));
  assert.equal(describeConversionMaterials(oneGif).length, 1);
  assert.equal(countConversionMaterialFrames(oneGif), 600);
  assert.throws(() => addConversionMaterials(oneGif, [asset('still')]), /600コマ/);
  assert.equal(describeConversionMaterials(oneGif)[0].id, 'gif');
});

test('add and remove preserve existing edits, order, settings, and untouched source objects', () => {
  const original = source(asset('a'), asset('b'));
  original.frames[0].delayMs = 777;
  const added = asset('c');
  const merged = addConversionMaterials(original, [added]);
  assert.deepEqual(merged.frames.map(f => f.assetId), ['a','b','c']);
  assert.equal(merged.frames[0].delayMs, 777);
  assert.equal(original.assets.length, 2);
  assert.equal(original.frames.length, 2);
  const removed = removeConversionMaterial(merged, 'b');
  assert.deepEqual(removed.frames.map(f => f.assetId), ['a','c']);
  assert.equal(removed.frames[0].delayMs, 777);
  assert.equal(removed.name, 'a.gif');
});

test('mixed dimensions are fitted consistently while retaining per-frame material IDs and timing', () => {
  const first = { ...asset('a'), rawFrames: [sizedFrame('a', 2, 1, 777)] };
  const second = { ...asset('b'), rawFrames: [sizedFrame('b', 1, 2, 555)] };
  const merged = addConversionMaterials(source(first), [second]);
  assert.deepEqual(merged.frames.map(frame => [frame.assetId, frame.width, frame.height, frame.delayMs]), [
    ['a', 2, 2, 777], ['b', 2, 2, 555],
  ]);
});

test('add and remove preserve interleaved frame order and raw decoded pixels', () => {
  const a = asset('a', 2); a.rawFrames[0] = { ...a.rawFrames[0], width: 2, height: 1, data: new Uint8Array([1,2,3,4,5,6,7,8]) };
  a.rawFrames[1] = { ...a.rawFrames[1], width: 2, height: 1, data: new Uint8Array([9,10,11,12,13,14,15,16]) };
  const b = asset('b'); b.rawFrames[0] = { ...b.rawFrames[0], width: 1, height: 2, data: new Uint8Array([21,22,23,24,25,26,27,28]) };
  const initial = source(a, b);
  const interleaved = { ...initial, frames: [initial.frames[0], initial.frames[2], initial.frames[1]] };
  const merged = addConversionMaterials(interleaved, [asset('c')]);
  assert.deepEqual(merged.frames.map(f => f.frameId), ['a:0','b:0','a:1','c:0']);
  const reduced = removeConversionMaterial(merged, 'b');
  assert.deepEqual(reduced.frames.map(f => f.frameId), ['a:0','a:1','c:0']);
  const one = removeConversionMaterial(reduced, 'c');
  assert.deepEqual(one.frames.map(f => [f.frameId, f.width, f.height, [...f.data]]), [
    ['a:0',2,1,[1,2,3,4,5,6,7,8]], ['a:1',2,1,[9,10,11,12,13,14,15,16]],
  ]);
});

test('one to many to one to empty removes only each selected input asset', () => {
  let current = source(asset('a', 3));
  current = addConversionMaterials(current, [asset('b', 2)]);
  assert.equal(current.assets.length, 2); assert.equal(current.frames.length, 5);
  current = removeConversionMaterial(current, 'a');
  assert.equal(current.assets.length, 1); assert.deepEqual(current.frames.map(f => f.assetId), ['b','b']);
  assert.equal(removeConversionMaterial(current, 'b'), null);
});

test('unsupported additions and aggregate limits reject atomically', () => {
  const current = source(asset('a'));
  assert.throws(() => addConversionMaterials(current, [{ ...asset('audio'), kind: 'audio' }]), /動画・音声/);
  assert.throws(() => addConversionMaterials(current, Array.from({ length: 8 }, (_, i) => asset(`x${i}`))), /8ファイル/);
  assert.throws(() => addConversionMaterials(current, [asset('large', 1, 128 * 1024 * 1024)]), /128MB/);
  assert.throws(() => addConversionMaterials(source(asset('many', 600)), [asset('extra')]), /600コマ/);
  assert.equal(current.assets.length, 1); assert.equal(current.frames.length, 1);
  assert.throws(() => validateConversionMaterialFiles(current, Array.from({ length: 8 }, (_, i) => ({ name: `f${i}`, size: 1 }))), /8ファイル/);
  assert.throws(() => validateConversionMaterialFiles(current, [{ name: 'large', size: 128 * 1024 * 1024 }]), /128MB/);
});

test('unknown asset removal and empty additions are harmless', () => {
  const current = source(asset('a'));
  assert.equal(addConversionMaterials(current, []), current);
  assert.equal(removeConversionMaterial(current, 'missing'), current);
});

test('removing another material preserves the active asset and selected frame by stable IDs', () => {
  const current = source(asset('a', 2), asset('b'), asset('c', 2));
  const reduced = removeConversionMaterial(current, 'a');
  const preserved = preserveConversionFrameAfterRemoval(current, reduced, 'a', 'c', 'c:1');
  assert.deepEqual(preserved, { activeId: 'c', frameIndex: 2, frameId: 'c:1' });
  assert.equal(reduced.frames[preserved.frameIndex].frameId, 'c:1');
  const removed = removeConversionMaterialWithTicket(current, 'a');
  const restored = restoreConversionMaterial(removed.source, removed.ticket);
  assert.equal(restored.frames.findIndex(frame => frame.frameId === preserved.frameId), 4, 'Undo restores the selected frame at its original global index');
  assert.deepEqual(restored.frames.map(frame => frame.frameId), current.frames.map(frame => frame.frameId));
});

test('when the selected frame is removed, deletion falls back to the closest surviving material first frame', () => {
  const current = source(asset('a', 2), asset('b'), asset('c'));
  const reduced = removeConversionMaterial(current, 'b');
  const fallback = preserveConversionFrameAfterRemoval(current, reduced, 'b', 'b', 'b:0');
  assert.deepEqual(fallback, { activeId: 'c', frameIndex: 2, frameId: 'c:0' });
});


import { loadTimelineFiles } from '../../js/creation/conversion-timeline.mjs';
test('real loader snapshots keep stable IDs and raw frames through mixed-size import and remove', async () => {
  const files = [{ name: 'wide.png', size: 10 }, { name: 'tall.png', size: 10 }];
  const decoded = [sizedFrame('ignored', 2, 1), sizedFrame('ignored', 1, 2)];
  decoded[0].data.set([1,2,3,4,5,6,7,8]);
  const imported = await loadTimelineFiles(files, { load: async file => ({ kind: 'image', name: file.name, frames: [decoded[files.indexOf(file)]] }) });
  const working = snapshotConversionMaterialSource(imported), original = snapshotConversionMaterialSource(working);
  assert.deepEqual(working.frames.map(f => f.frameId), ['material-1:0','material-2:0']);
  assert.notEqual(working.frames[0], original.frames[0]);
  working.frames[0].delayMs = 222; assert.equal(original.frames[0].delayMs, 1000);
  assert.equal(working.assets[0].rawFrames[0].data, decoded[0].data);
  const reduced = removeConversionMaterial(working, 'material-2');
  assert.deepEqual([reduced.frames[0].width, reduced.frames[0].height, [...reduced.frames[0].data]], [2,1,[1,2,3,4,5,6,7,8]]);
  assert.doesNotThrow(() => snapshotConversionMaterialSource({ kind: 'audio', assets: [{ id: 'audio', rawFrames: [] }], frames: [] }));
});

test('undo restores an interleaved deletion around surviving frames with original pixels and delays', () => {
  const a = asset('a', 2); a.rawFrames[0] = { ...a.rawFrames[0], width: 2, height: 1, data: new Uint8Array([1,2,3,4,5,6,7,8]), delayMs: 123 };
  a.rawFrames[1] = { ...a.rawFrames[1], width: 2, height: 1, data: new Uint8Array([9,10,11,12,13,14,15,16]), delayMs: 456 };
  const b = asset('b'); b.rawFrames[0] = { ...b.rawFrames[0], width: 1, height: 2, data: new Uint8Array([21,22,23,24,25,26,27,28]), delayMs: 789 };
  const initial = source(a, b), mixed = { ...initial, frames: [initial.frames[0], initial.frames[2], initial.frames[1]] };
  const { source: removed, ticket } = removeConversionMaterialWithTicket(mixed, 'b');
  const restored = restoreConversionMaterial(removed, ticket);
  assert.deepEqual(restored.frames.map(f => f.frameId), ['a:0','b:0','a:1']);
  assert.deepEqual([restored.frames[1].frameId, restored.frames[1].delayMs, restored.frames[1].data.slice(0, 4)], ['b:0',789,new Uint8Array([21,22,23,24])]);
});

test('undo reinserts near surviving anchors after later edits and additions', () => {
  const initial = source(asset('a', 2), asset('b'), asset('c'));
  const { source: removed, ticket } = removeConversionMaterialWithTicket(initial, 'b');
  const changed = { ...removed, frames: removed.frames.map(frame => ({ ...frame, delayMs: frame.assetId === 'a' ? 333 : frame.delayMs })) };
  const withAddition = addConversionMaterials(changed, [asset('d')]);
  const restored = restoreConversionMaterial(withAddition, ticket);
  assert.deepEqual(restored.frames.map(frame => frame.assetId), ['a','a','b','c','d']);
  assert.deepEqual(restored.frames.filter(frame => frame.assetId === 'a').map(frame => frame.delayMs), [333,333]);
});

test('one-level undo restores final deletion to empty state and rejects limit overflow atomically', () => {
  const raw = { ...asset('last', 2), rawFrames: [sizedFrame('last', 2, 1, 111, 0), sizedFrame('last', 2, 1, 222, 1)] };
  raw.rawFrames[0].data.set([1,2,3,4,5,6,7,8]);
  const one = source(raw);
  const removed = removeConversionMaterialWithTicket(one, 'last');
  assert.equal(removed.source, null);
  const restored = restoreConversionMaterial(null, removed.ticket);
  assert.deepEqual(restored.frames.map(frame => [frame.frameId, frame.width, frame.height, frame.delayMs, [...frame.data]]), [
    ['last:0',2,1,111,[1,2,3,4,5,6,7,8]], ['last:1',2,1,222,[0,0,0,0,0,0,0,0]],
  ]);

  const base = source(...Array.from({ length: 7 }, (_, index) => asset(`a${index}`)));
  const deleted = removeConversionMaterialWithTicket(source(...Array.from({ length: 8 }, (_, index) => asset(`a${index}`))), 'a7');
  const changed = addConversionMaterials(deleted.source, [asset('later')]);
  assert.throws(() => restoreConversionMaterial(changed, deleted.ticket), /ファイル数/);
  assert.deepEqual(changed.assets.map(asset => asset.id), base.assets.map(asset => asset.id).slice(0, 7).concat('later'));
});

test('standalone audio removal can be undone without a video timeline', () => {
  const audio = { kind: 'audio', name: 'voice.wav', audio: { sampleRate: 8000, channels: [new Float32Array([0.1])] }, assets: [{ id: 'audio', name: 'voice.wav', kind: 'audio', bytes: 5, rawFrames: [] }], frames: [] };
  const removed = removeConversionMaterialWithTicket(audio, 'audio');
  const restored = restoreConversionMaterial(removed.source, removed.ticket);
  assert.equal(restored.kind, 'audio'); assert.equal(restored.audio, audio.audio); assert.equal(restored.assets[0].id, 'audio');
});

test('moving assets reorders groups without losing frame timing or decoded data', () => {
  const initial = source(asset('a', 2), asset('b'));
  const moved = moveConversionMaterial(initial, 'b', -1);
  assert.deepEqual(moved.assets.map(item => item.id), ['b','a']);
  assert.deepEqual(moved.frames.map(item => item.frameId), ['b:0','a:0','a:1']);
  assert.equal(moveConversionMaterial(moved, 'b', -1), moved);
  assert.equal(firstConversionAssetFrameIndex(moved, 'b'), 0);
  assert.equal(firstConversionAssetFrameIndex(moved, 'a'), 1);
});


test('moving one material preserves the relative order and timing of other interleaved materials', () => {
  const source = snapshotConversionMaterialSource({ kind: 'image', assets: ['a','b','c'].map(id => ({ id, name:id, kind:'image', bytes:4, rawFrames:[{ width:1,height:1,data:new Uint8ClampedArray([1,2,3,255]),frameId:`${id}:0`,assetId:id }] })),
    frames: ['b','c','a','b'].map((id,index) => ({ width:1,height:1,data:new Uint8ClampedArray([1,2,3,255]),frameId:`${id}:${index}`,assetId:id,delayMs:100+index })) });
  const moved = moveConversionMaterial(source, 'a', 1);
  assert.deepEqual(moved.frames.filter(frame=>frame.assetId!=='a').map(frame=>[frame.assetId,frame.delayMs]), [['b',100],['c',101],['b',103]]);
  assert.deepEqual(moved.frames.map(frame=>frame.assetId), ['b','c','b','a']);
});
