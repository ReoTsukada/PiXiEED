import test from 'node:test';
import assert from 'node:assert/strict';
import { addAnimationFrame, addAnimationLayer, composeAnimationFrame, createAnimation, createAnimationFromSerialized, moveAnimationFrame, removeAnimationFrame, writeAnimationCel } from '../../js/creation/animation-core.mjs';
import { AUDIO_BAR_TICKS, AUDIO_MAX_LOOP_TICKS, AUDIO_PIXEL_TICKS, collectAudioEvents, createAudioSong, extendAudioLoopForImage, setAudioPixel } from '../../js/creation/audio-core.mjs';
import { AUDIO_ANIMATION_LINK_VERSION, createAudioAnimationLink, getAudioAnimationCellPitch, getAudioAnimationRowPitchMap, prepareAudioAnimationImport, setAudioAnimationColorMapping, setAudioAnimationPixel, validateAudioAnimationBinding } from '../../js/creation/audio-animation.mjs';

const RED = '#ff0000';
const BLUE = '#0000ff';
const RED_ID = 'rgba-ff0000ff';
const BLUE_ID = 'rgba-0000ffff';

function blankDoc(width, height) { return { schemaVersion: 1, width, height, palette: [RED, BLUE], pixels: Array(width * height).fill(0) }; }
function paint(animation, frameId, layerId, entries) {
  const document = blankDoc(animation.width, animation.height);
  for (const [x, y, paletteIndex] of entries) document.pixels[y * animation.width + x] = paletteIndex + 1;
  return writeAnimationCel(animation, frameId, layerId, document);
}

test('explicit import places ordered frames on an independent PPQ timeline and keeps frame durations out of audio time', () => {
  let animation = createAnimation({ width: 16, height: 1, palette: [RED, BLUE] });
  const first = animation.frames[0].id;
  animation = addAnimationFrame(animation, { sourceFrameId: first, durationMs: 9000 });
  const second = animation.frames[1].id;
  animation = paint(animation, first, animation.layers[0].id, [[15, 0, 0]]);
  animation = paint(animation, second, animation.layers[0].id, [[0, 0, 0], [1, 0, 1]]);
  const song = createAudioSong({ tempo: 120 });
  const result = prepareAudioAnimationImport(song, animation, { colorToSlot: { [RED_ID]: 'square' } });

  assert.equal(result.link.rulesVersion, AUDIO_ANIMATION_LINK_VERSION);
  assert.equal(result.link.imageRole, 'audio');
  assert.equal(result.link.sequenceTicks, 32 * AUDIO_PIXEL_TICKS);
  assert.equal(result.song.loopTicks, AUDIO_BAR_TICKS * 2);
  assert.equal(result.durationSeconds, 4);
  assert.equal(result.link.colorToSlot[RED_ID], 'square');
  assert.equal(result.link.colorToSlot[BLUE_ID], null, 'colors without an existing mapping remain silent');
  const notes = result.song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes));
  assert.deepEqual(notes.map(({ startTick, sourceCell }) => [startTick, sourceCell.frameId, sourceCell.x]), [
    [15 * AUDIO_PIXEL_TICKS, first, 15],
    [16 * AUDIO_PIXEL_TICKS, second, 16]
  ]);
  assert.deepEqual(collectAudioEvents(result.song, { joinAdjacent: true }).map(({ startTick, durationTicks }) => [startTick, durationTicks]), [
    [15 * AUDIO_PIXEL_TICKS, 2 * AUDIO_PIXEL_TICKS]
  ]);
  assert.equal(validateAudioAnimationBinding(result.song, animation, result.link), result.song);
});

test('frame-local pitch maps let the same canvas row sound different notes per frame', () => {
  let animation = createAnimation({ width: 32, height: 32, palette: [RED] });
  const first = animation.frames[0].id;
  animation = addAnimationFrame(animation, { sourceFrameId: first });
  const second = animation.frames[1].id;
  animation = paint(animation, first, animation.layers[0].id, [[0, 4, 0]]);
  animation = paint(animation, second, animation.layers[0].id, [[0, 4, 0]]);
  const result = prepareAudioAnimationImport(createAudioSong({ tempo: 128 }), animation, {
    rowPitchMap: Array(32).fill(null),
    frameRowPitchMaps: { [first]: Array.from({ length: 32 }, (_, row) => row === 4 ? 60 : null),
      [second]: Array.from({ length: 32 }, (_, row) => row === 4 ? 72 : null) },
    colorToSlot: { [RED_ID]: 'square' }
  });
  const events = collectAudioEvents(result.song, { joinAdjacent: true });
  assert.deepEqual(events.map(({ pitch, startTick }) => [pitch, startTick]), [[60, 0], [72, 32 * AUDIO_PIXEL_TICKS]]);
  assert.equal(result.song.loopTicks, 32 * 2 * AUDIO_PIXEL_TICKS);
  assert.deepEqual(getAudioAnimationRowPitchMap(result.link, first), [
    ...Array.from({ length: 4 }, () => null), 60, ...Array.from({ length: 27 }, () => null)
  ]);
  assert.equal(getAudioAnimationRowPitchMap(result.link, 'missing-frame'), result.link.rowPitchMap);
  assert.equal(validateAudioAnimationBinding(result.song, animation, result.link), result.song);
  const wrongPitchMap = Array.from({ length: 32 }, (_, row) => row === 4 ? 61 : null);
  assert.throws(() => validateAudioAnimationBinding(result.song, animation, {
    ...result.link, frameRowPitchMaps: { ...result.link.frameRowPitchMaps, [first]: wrongPitchMap }
  }), /位置が不正です/);
});

test('frame-local maps validate, follow frame IDs through reorder, prune removed frames, and fall back for new frames', () => {
  let animation = createAnimation({ width: 32, height: 2, palette: [RED] });
  const first = animation.frames[0].id;
  animation = addAnimationFrame(animation, { sourceFrameId: first });
  const second = animation.frames[1].id;
  const song = createAudioSong();
  const localMaps = { [first]: [60, null], [second]: [null, 72] };
  const link = createAudioAnimationLink(song, animation, { rowPitchMap: [48, 49], frameRowPitchMaps: localMaps });
  const remapped = setAudioAnimationColorMapping(song, animation, link, { colorId: RED_ID, slotId: 'square' });
  assert.deepEqual(remapped.frameRowPitchMaps, link.frameRowPitchMaps);
  const sparsePitchMap = new Array(2); sparsePitchMap[0] = 60;
  for (const maps of [[], new Map(), { [first]: [60] }, { [first]: [128, null] }, { [first]: sparsePitchMap }]) {
    assert.throws(() => createAudioAnimationLink(song, animation, { rowPitchMap: [48, 49], frameRowPitchMaps: maps }), /音程対応/);
  }
  assert.throws(() => createAudioAnimationLink(song, animation, {
    rowPitchMap: [48, 49], frameRowPitchMaps: Object.assign(Object.create({ inherited: [60, 61] }), { [first]: [60, null] })
  }), /音程対応/);
  assert.throws(() => createAudioAnimationLink(song, animation, {
    rowPitchMap: [48, 49], frameRowPitchMaps: localMaps, colorToSlot: { [RED_ID]: 'unknown-slot' }
  }), /色と音色/);
  assert.throws(() => validateAudioAnimationBinding(song, animation, {
    ...link, frameRowPitchMaps: { ...link.frameRowPitchMaps, 'stale-frame': [70, 71] }
  }), /存在しないコマ/);

  const reordered = moveAnimationFrame(animation, second, 0);
  const reorderedLink = createAudioAnimationLink(song, reordered, {
    rowPitchMap: link.rowPitchMap, frameRowPitchMaps: link.frameRowPitchMaps
  });
  assert.deepEqual(getAudioAnimationRowPitchMap(reorderedLink, second), [null, 72]);
  assert.deepEqual(getAudioAnimationRowPitchMap(reorderedLink, first), [60, null]);

  const withoutFirst = removeAnimationFrame(reordered, first);
  const trimmed = createAudioAnimationLink(song, withoutFirst, {
    rowPitchMap: link.rowPitchMap, frameRowPitchMaps: link.frameRowPitchMaps
  });
  assert.deepEqual(Object.keys(trimmed.frameRowPitchMaps), [second]);
  const withNewFrame = addAnimationFrame(withoutFirst, { copy: false });
  const newFrameId = withNewFrame.frames.at(-1).id;
  const extended = createAudioAnimationLink(song, withNewFrame, {
    rowPitchMap: link.rowPitchMap, frameRowPitchMaps: trimmed.frameRowPitchMaps
  });
  assert.deepEqual(getAudioAnimationRowPitchMap(extended, newFrameId), [48, 49]);
});

test('cell pitch overrides take priority over frame and legacy row maps during projection', () => {
  let animation = createAnimation({ width: 16, height: 16, palette: [RED] });
  const first = animation.frames[0].id;
  animation = addAnimationFrame(animation, { sourceFrameId: first });
  const second = animation.frames[1].id;
  animation = paint(animation, first, animation.layers[0].id, [[3, 4, 0], [4, 4, 0]]);
  animation = paint(animation, second, animation.layers[0].id, [[3, 4, 0]]);
  const framePitches = {
    [first]: Array.from({ length: 16 }, (_, row) => row === 4 ? 72 : null),
    [second]: Array.from({ length: 16 }, (_, row) => row === 4 ? 74 : null)
  };
  const cells = { [first]: { '3:4': 60 }, [second]: { '3:4': 62 } };
  const result = prepareAudioAnimationImport(createAudioSong(), animation, {
    rowPitchMap: Array(16).fill(null), frameRowPitchMaps: framePitches, frameCellPitchMaps: cells,
    colorToSlot: { [RED_ID]: 'square' }
  });
  assert.deepEqual(collectAudioEvents(result.song, { joinAdjacent: true }).map(({ pitch, startTick }) => [pitch, startTick]), [
    [60, 3 * AUDIO_PIXEL_TICKS], [72, 4 * AUDIO_PIXEL_TICKS], [62, 19 * AUDIO_PIXEL_TICKS]
  ]);
  assert.equal(getAudioAnimationCellPitch(result.link, first, 3, 4), 60);
  assert.equal(getAudioAnimationCellPitch(result.link, first, 4, 4), 72);
  assert.equal(getAudioAnimationCellPitch(result.link, second, 3, 4), 62);
  assert.equal(validateAudioAnimationBinding(result.song, animation, result.link), result.song);
  const invalidated = { ...result.link, frameCellPitchMaps: { ...cells, [second]: { '3:4': 63 } } };
  assert.throws(() => validateAudioAnimationBinding(result.song, animation, invalidated), /位置が不正です/);

  const remapped = setAudioAnimationColorMapping(createAudioSong(), animation, result.link, { colorId: RED_ID, slotId: 'square' });
  assert.deepEqual(remapped.frameCellPitchMaps, result.link.frameCellPitchMaps);
});

test('cell pitch map validation rejects malformed coordinates and prunes removed-frame entries', () => {
  let animation = createAnimation({ width: 16, height: 2, palette: [RED] });
  const first = animation.frames[0].id;
  animation = addAnimationFrame(animation, { sourceFrameId: first });
  const second = animation.frames[1].id;
  for (const cellMap of [[], new Map(), { '01:0': 60 }, { '16:0': 60 }, { '0:2': 60 }, { '0:0': -1 }, { '0:0': 128 }]) {
    assert.throws(() => createAudioAnimationLink(createAudioSong(), animation, {
      rowPitchMap: [60, 61], frameCellPitchMaps: { [first]: cellMap }
    }), /セルごとの音程対応/);
  }
  assert.throws(() => createAudioAnimationLink(createAudioSong(), animation, {
    rowPitchMap: [60, 61], frameCellPitchMaps: Object.assign(Object.create({ inherited: { '0:0': 60 } }), { [first]: { '0:0': 60 } })
  }), /セルごとの音程対応/);
  const link = createAudioAnimationLink(createAudioSong(), animation, {
    rowPitchMap: [60, 61], frameCellPitchMaps: { [first]: { '0:0': 60 }, 'removed-frame': { '1:1': 70 } }
  });
  assert.deepEqual(Object.keys(link.frameCellPitchMaps), [first]);
  const removed = removeAnimationFrame(animation, first);
  const trimmed = createAudioAnimationLink(createAudioSong(), removed, {
    rowPitchMap: [60, 61], frameCellPitchMaps: link.frameCellPitchMaps
  });
  assert.equal(trimmed.frameCellPitchMaps, undefined);
  assert.equal(getAudioAnimationCellPitch(trimmed, second, 0, 0), 60);
});

test('a frame ID named __proto__ keeps its frame-local pitch map as an own property', () => {
  const base = createAnimation({ width: 32, height: 1, palette: [RED] });
  const animation = createAnimationFromSerialized({ ...base, frames: [{ ...base.frames[0], id: '__proto__' }] }, []);
  const link = createAudioAnimationLink(createAudioSong(), animation, {
    rowPitchMap: [48], frameRowPitchMaps: { ['__proto__']: [73] }
  });
  assert.equal(Object.hasOwn(link.frameRowPitchMaps, '__proto__'), true);
  assert.deepEqual(getAudioAnimationRowPitchMap(link, '__proto__'), [73]);
  assert.equal(Object.getPrototypeOf(link.frameRowPitchMaps), Object.prototype);
  const withCellPitch = createAudioAnimationLink(createAudioSong(), animation, {
    rowPitchMap: [48], frameCellPitchMaps: { ['__proto__']: { '0:0': 77 } }
  });
  assert.equal(Object.hasOwn(withCellPitch.frameCellPitchMaps, '__proto__'), true);
  assert.equal(getAudioAnimationCellPitch(withCellPitch, '__proto__', 0, 0), 77);
  const reloadedMaps = JSON.parse(JSON.stringify(withCellPitch.frameCellPitchMaps));
  assert.equal(getAudioAnimationCellPitch({ ...withCellPitch, frameCellPitchMaps: reloadedMaps }, '__proto__', 0, 0), 77);
});

test('sequence refresh preserves exact-cell metadata but does not leak it across changed color or timing', () => {
  let animation = createAnimation({ width: 16, height: 1, palette: [RED, BLUE] });
  const first = animation.frames[0].id;
  animation = addAnimationFrame(animation, { sourceFrameId: first });
  const second = animation.frames[1].id;
  animation = paint(animation, first, animation.layers[0].id, [[0, 0, 0]]);
  animation = paint(animation, second, animation.layers[0].id, [[0, 0, 0]]);
  const mapping = { [RED_ID]: 'square', [BLUE_ID]: 'square' };
  let result = prepareAudioAnimationImport(createAudioSong(), animation, { colorToSlot: mapping });

  result = {
    ...result,
    song: {
      ...result.song,
      tracks: result.song.tracks.map((track) => track.instrument !== 'square' ? track : {
        ...track,
        clips: track.clips.map((clip) => ({ ...clip, notes: clip.notes.map((note) => note.sourceCell?.kind === 'audio-animation'
          ? { ...note, velocity: note.sourceCell.frameId === first ? 37 : 52, articulation: `frame-${note.sourceCell.frameIndex}` }
          : note) }))
      })
    }
  };
  let refreshed = prepareAudioAnimationImport(result.song, animation, { colorToSlot: mapping });
  let projected = refreshed.song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes))
    .filter((note) => note.sourceCell?.kind === 'audio-animation');
  assert.deepEqual(projected.map((note) => [note.velocity, note.articulation]), [[37, 'frame-0'], [52, 'frame-1']]);

  const changedColor = setAudioAnimationPixel(animation, refreshed.link, {
    frameId: first, layerId: animation.layers[0].id, x: 0, y: 0, colorId: BLUE_ID
  }).animation;
  const withNewPixel = setAudioAnimationPixel(changedColor, refreshed.link, {
    frameId: first, layerId: animation.layers[0].id, x: 1, y: 0, colorId: RED_ID
  }).animation;
  refreshed = prepareAudioAnimationImport(refreshed.song, withNewPixel, { colorToSlot: mapping });
  projected = refreshed.song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes))
    .filter((note) => note.sourceCell?.kind === 'audio-animation');
  assert.deepEqual(projected.map((note) => [note.velocity, note.articulation]), [[96, undefined], [96, undefined], [52, 'frame-1']]);

  const wrongTimingSong = {
    ...refreshed.song,
    tracks: refreshed.song.tracks.map((track) => track.instrument !== 'square' ? track : {
      ...track,
      clips: track.clips.map((clip) => ({ ...clip, notes: clip.notes.map((note) => note.sourceCell?.kind === 'audio-animation'
        && note.sourceCell.frameId === second ? { ...note, startTick: note.startTick + AUDIO_PIXEL_TICKS, velocity: 21, articulation: 'stale-time' } : note) }))
    })
  };
  refreshed = prepareAudioAnimationImport(wrongTimingSong, withNewPixel, { colorToSlot: mapping });
  projected = refreshed.song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes))
    .filter((note) => note.sourceCell?.kind === 'audio-animation');
  assert.equal(projected.find((note) => note.sourceCell.frameId === second).velocity, 96);
  assert.equal(projected.find((note) => note.sourceCell.frameId === second).articulation, undefined);
});

test('sequence refresh carries metadata with its frame after frames are reordered', () => {
  let animation = createAnimation({ width: 16, height: 1, palette: [RED] });
  const first = animation.frames[0].id;
  animation = addAnimationFrame(animation, { sourceFrameId: first });
  const second = animation.frames[1].id;
  animation = paint(animation, first, animation.layers[0].id, [[0, 0, 0]]);
  animation = paint(animation, second, animation.layers[0].id, [[0, 0, 0]]);
  const mapping = { [RED_ID]: 'square' };
  let result = prepareAudioAnimationImport(createAudioSong(), animation, { colorToSlot: mapping });
  result = {
    ...result,
    song: {
      ...result.song,
      tracks: result.song.tracks.map((track) => track.instrument !== 'square' ? track : {
        ...track,
        clips: track.clips.map((clip) => ({ ...clip, notes: clip.notes.map((note) => note.sourceCell?.kind === 'audio-animation'
          ? { ...note, velocity: note.sourceCell.frameId === first ? 31 : 57 }
          : note) }))
      })
    }
  };
  const reordered = moveAnimationFrame(animation, second, 0);
  const refreshed = prepareAudioAnimationImport(result.song, reordered, { colorToSlot: mapping });
  const projected = refreshed.song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes))
    .filter((note) => note.sourceCell?.kind === 'audio-animation')
    .sort((left, right) => left.startTick - right.startTick);
  assert.deepEqual(projected.map((note) => [note.startTick, note.sourceCell.frameId, note.sourceCell.frameIndex, note.velocity]), [
    [0, second, 0, 57], [16 * AUDIO_PIXEL_TICKS, first, 1, 31]
  ]);
});

test('hidden layers stay silent and animation refresh preserves manual song notes and valid color mappings', () => {
  let animation = createAnimation({ width: 16, height: 1, palette: [RED, BLUE] });
  const baseLayer = animation.layers[0].id;
  animation = addAnimationLayer(animation, { visible: false });
  const hiddenLayer = animation.layers[1].id;
  animation = paint(animation, animation.frames[0].id, baseLayer, [[0, 0, 0]]);
  animation = paint(animation, animation.frames[0].id, hiddenLayer, [[1, 0, 1]]);
  const song = setAudioPixel(createAudioSong(), { trackId: 'track-triangle', pitch: 60, startTick: 0, noteId: 'manual-note' });
  const result = prepareAudioAnimationImport(song, animation, { colorToSlot: { [RED_ID]: 'square', [BLUE_ID]: 'noise' } });
  const notes = result.song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes));
  assert.ok(notes.some(({ noteId }) => noteId === 'manual-note'));
  assert.deepEqual(notes.filter(({ sourceCell }) => sourceCell?.kind === 'audio-animation').map(({ colorId }) => colorId), [RED_ID]);
  assert.equal(result.link.colorToSlot[BLUE_ID], 'noise');
});

test('sequence projects do not join the last cell back to the first, and adjacent color changes stay separate', () => {
  let animation = createAnimation({ width: 16, height: 1, palette: [RED, BLUE] });
  const first = animation.frames[0].id;
  animation = addAnimationFrame(animation, { sourceFrameId: first });
  const second = animation.frames[1].id;
  animation = paint(animation, first, animation.layers[0].id, [[0, 0, 0], [15, 0, 0]]);
  animation = paint(animation, second, animation.layers[0].id, [[0, 0, 0], [1, 0, 1]]);
  const result = prepareAudioAnimationImport(createAudioSong(), animation, { colorToSlot: { [RED_ID]: 'square', [BLUE_ID]: 'square' } });
  const events = collectAudioEvents(result.song, { joinAdjacent: true });
  assert.deepEqual(events.map(({ startTick, durationTicks, pitch }) => [startTick, durationTicks, pitch]), [
    [0, AUDIO_PIXEL_TICKS, 66],
    [15 * AUDIO_PIXEL_TICKS, 2 * AUDIO_PIXEL_TICKS, 66],
    [17 * AUDIO_PIXEL_TICKS, AUDIO_PIXEL_TICKS, 66]
  ]);
});

test('sequence length supports 128 frames at 256 columns while staying within a bounded song loop', () => {
  const song = createAudioSong();
  const grown = extendAudioLoopForImage(song, 256, { frameCount: 128 });
  assert.equal(grown.loopTicks, AUDIO_BAR_TICKS * 2048);
  assert.equal(grown.loopTicks, AUDIO_MAX_LOOP_TICKS);
  assert.throws(() => extendAudioLoopForImage(song, 256, { frameCount: 129 }), /1〜128枚/);
});

test('malformed composed pixels and stale sequence metadata fail closed', () => {
  const animation = createAnimation({ width: 16, height: 1, palette: [RED] });
  assert.throws(() => prepareAudioAnimationImport(createAudioSong(), animation, {
    composeFrame: () => ({ schemaVersion: 1, width: 16, height: 1, palette: [RED], pixels: [257, ...Array(15).fill(-1)] })
  }), /不正な色番号/);
  const result = prepareAudioAnimationImport(createAudioSong(), animation);
  assert.throws(() => validateAudioAnimationBinding(result.song, animation, { ...result.link, frameIds: ['stale-frame'] }), /保存情報が一致しません/);
});

test('painting transparent and indexed animation pixels preserves every other palette color', () => {
  let animation = createAnimation({ width: 3, height: 1, palette: [RED, BLUE] });
  const frameId = animation.frames[0].id; const layerId = animation.layers[0].id;
  animation = paint(animation, frameId, layerId, [[0, 0, 0], [1, 0, 1]]);
  const link = createAudioAnimationLink(createAudioSong(), animation, { colorToSlot: { [RED_ID]: 'square', [BLUE_ID]: 'noise' } });
  const erased = setAudioAnimationPixel(animation, link, { frameId, layerId, x: 0, y: 0, active: false });
  assert.equal(composeAnimationFrame(erased.animation, frameId).pixels[0], -1);
  assert.equal(composeAnimationFrame(erased.animation, frameId).pixels[1], 1);
  const painted = setAudioAnimationPixel(erased.animation, link, { frameId, layerId, x: 2, y: 0, colorId: RED_ID, active: true });
  assert.deepEqual([...composeAnimationFrame(painted.animation, frameId).pixels], [-1, 1, 0]);
});
