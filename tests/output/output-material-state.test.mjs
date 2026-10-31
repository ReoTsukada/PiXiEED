import test from 'node:test';
import assert from 'node:assert/strict';
import { describeOutputMaterialState, replaceOutputMaterialSource } from '../../js/creation/output-material-state.mjs';

test('keeps image asset groups, frames, and output rows as separate counts', () => {
  const pixels = new Uint8Array([1, 2, 3, 4]);
  const state = describeOutputMaterialState({
    record: { id: 'workspace' },
    activeId: 'local-images', activeItemId: 'gif',
    mediaSources: [{ id: 'local-images', label: '画像 (3コマ)', kind: 'rgba-frames', mediaSource: { frames: [
      { name: 'a.png', width: 1, height: 1, data: pixels }, { name: 'b.png', width: 2, height: 1, data: new Uint8Array(8) }, { name: 'c.png', width: 1, height: 2, data: new Uint8Array(8) },
    ] } }],
    outputItems: [{ id: 'png' }, { id: 'gif' }],
  });
  assert.equal(state.loaded, true); assert.equal(state.grouped, true);
  assert.equal(state.assets.length, 1); assert.equal(state.assets[0].grouped, true);
  assert.equal(state.frameCount, 3); assert.equal(state.outputCount, 2);
  assert.equal(state.activeId, 'local-images'); assert.equal(state.selectedAsset, state.assets[0]);
  assert.equal(state.activeItemId, 'gif');
  assert.equal(state.assets[0].firstFrame.data, pixels, 'first frame pixels are referenced, not copied');
  assert.equal(state.assets[0].firstFrame.name, 'a.png');
});

test('reports capability reasons for output-referenced and unsupported assets', () => {
  const state = describeOutputMaterialState({
    record: {}, activeId: 'video',
    mediaSources: [
      { id: 'audio', label: 'music.wav', kind: 'audio-buffer' },
      { id: 'video', label: 'clip.mov', kind: 'legacy-file' },
    ],
    outputItems: [{ id: 'movie', sourceId: 'audio' }],
  });
  assert.equal(state.assets[0].canRemove, false); assert.match(state.assets[0].removeReason, /出力項目/);
  assert.equal(state.assets[0].canReplace, true);
  assert.equal(state.assets[1].canReplace, false); assert.match(state.replaceReason, /置き換えできません/);
  assert.equal(state.canReplace, false); assert.equal(state.canAdd, true);
});

test('busy state disables material actions and includes a reason', () => {
  const state = describeOutputMaterialState({ record: {}, activeId: 'image', busy: true,
    mediaSources: [{ id: 'image', kind: 'rgba-frames', mediaSource: { frames: [{ width: 1, height: 1, data: new Uint8Array(4) }] } }],
    outputItems: [],
  });
  assert.equal(state.busy, true); assert.equal(state.canAdd, false); assert.match(state.addReason, /処理が終わってから/);
  assert.equal(state.canReplace, false); assert.match(state.replaceReason, /処理が終わってから/);
  assert.equal(state.assets[0].canRemove, false); assert.match(state.assets[0].removeReason, /処理が終わってから/);
});

test('empty workspace has no selected asset but remains capable of adding files', () => {
  const empty = describeOutputMaterialState({ record: {}, outputItems: [] });
  assert.equal(empty.loaded, false); assert.equal(empty.activeId, ''); assert.equal(empty.selectedAsset, null);
  assert.equal(empty.canAdd, true); assert.equal(empty.canReplace, false); assert.equal(empty.frameCount, 0); assert.equal(empty.outputCount, 0);
});

test('image replacement keeps one source ID and preserves other sources without mutating inputs', () => {
  const oldPixels = new Uint8Array([0, 1, 2, 3]);
  const newPixels = new Uint8Array([4, 5, 6, 7]);
  const oldImage = { id: 'local-images', kind: 'rgba-frames', label: 'old', mediaSource: { frames: [{ name: 'old.png', width: 1, height: 1, data: oldPixels }] } };
  const audio = { id: 'local-audio', kind: 'audio-buffer', label: 'music.wav' };
  const incoming = [{ id: 'local-images', kind: 'rgba-frames', label: 'new', mediaSource: { frames: [{ name: 'new.png', width: 1, height: 1, data: newPixels }] } }];
  const state = replaceOutputMaterialSource([oldImage, audio], incoming, 'local-images', 1);
  assert.deepEqual(state.map((source) => source.id), ['local-images', 'local-audio']);
  assert.equal(state[0].mediaSource.frames.length, 1); assert.equal(state[0].mediaSource.frames[0].data, newPixels);
  assert.equal(state[1], audio); assert.equal(oldImage.mediaSource.frames[0].data, oldPixels);
  assert.equal(incoming[0].id, 'local-images'); assert.equal(incoming[0].mediaSource.frames[0].data, newPixels);
});

test('replacement rejects missing, mismatched, or multi-file input atomically', () => {
  const current = [{ id: 'audio', kind: 'audio-buffer', label: 'music.wav' }];
  const before = structuredClone(current);
  for (const [incoming, id, count] of [
    [[{ id: 'x', kind: 'image' }], 'audio', 1],
    [[{ id: 'x', kind: 'audio-buffer' }, { id: 'y', kind: 'audio-buffer' }], 'audio', 2],
    [[{ id: 'x', kind: 'audio-buffer' }], 'absent', 1],
  ]) assert.throws(() => replaceOutputMaterialSource(current, incoming, id, count), /同じ種類の素材を1つ/);
  assert.deepEqual(current, before);
});
