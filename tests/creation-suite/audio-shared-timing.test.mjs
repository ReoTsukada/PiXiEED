import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_PIXEL_TICKS, collectAudioEvents, createAudioPlayer, createAudioSong } from '../../js/creation/audio-core.mjs';
import { prepareSharedAudioImageImport, readPxdAudioState, synchronizeLinkedAudioImage, validatePxdAudioBinding, writePxdAudioState } from '../../js/creation/pxd-draw-audio.mjs';
import { createPxdProject } from '../../js/creation/pxd-codec.mjs';
import { putPxdSharedImage } from '../../js/creation/pxd-project.mjs';

function image(width, coloredColumns = []) {
  const rgba = new Uint8Array(width * 4);
  for (const x of coloredColumns) rgba.set([76, 130, 195, 255], x * 4);
  return { width, height: 1, rgba };
}

function notes(song) {
  return song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes));
}

test('shared music gives every pixel the same duration as canvas width grows', () => {
  for (const width of [16, 32, 64, 128, 256]) {
    const plan = prepareSharedAudioImageImport(createAudioSong({ songId: `timing-${width}` }), image(width, [0, width - 1]));
    assert.equal(plan.link.ticksPerCell, AUDIO_PIXEL_TICKS);
    assert.deepEqual(notes(plan.song).map((note) => [note.startTick, note.durationTicks]), [
      [0, AUDIO_PIXEL_TICKS], [(width - 1) * AUDIO_PIXEL_TICKS, AUDIO_PIXEL_TICKS]
    ]);
    assert.ok(plan.song.loopTicks >= width * AUDIO_PIXEL_TICKS);
    validatePxdAudioBinding(plan.song, plan.image, plan.link);
  }
});

test('an older compressed shared song is re-timed without changing its picture or tempo', async () => {
  const before = image(32, [24]);
  const current = prepareSharedAudioImageImport(createAudioSong({ songId: 'older-timing', tempo: 137 }), before);
  const oldSong = {
    ...current.song,
    loopTicks: 1920,
    tracks: current.song.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({
      ...clip, lengthTicks: 1920,
      notes: clip.notes.map((note) => ({ ...note, startTick: 24 * 60, durationTicks: 60 }))
    })) }))
  };
  const oldLink = { ...current.link, ticksPerCell: 60 };
  validatePxdAudioBinding(oldSong, before, oldLink);
  let project = await putPxdSharedImage(createPxdProject({ projectId: 'older-timing' }), before);
  project = await writePxdAudioState(project, oldSong, { image: before, link: oldLink });
  const opened = prepareSharedAudioImageImport(readPxdAudioState(project), before, { rowPitchMap: oldLink.rowPitchMap, colorToSlot: oldLink.colorToSlot });
  assert.equal(opened.song.tempo, 137);
  assert.equal(opened.song.loopTicks, 3840);
  assert.deepEqual(notes(opened.song).map((note) => [note.startTick, note.durationTicks, note.sourceCell.x]), [[24 * 120, 120, 24]]);
  validatePxdAudioBinding(opened.song, before, opened.link);

  const wider = image(64, [24, 40]);
  const synchronized = await synchronizeLinkedAudioImage(project, wider);
  const synchronizedSong = readPxdAudioState(synchronized);
  assert.equal(synchronizedSong.loopTicks, 7680);
  assert.deepEqual(notes(synchronizedSong).map((note) => note.startTick), [24 * 120, 40 * 120]);
});

test('adjacent same-color pixels sustain one sound while color changes and gaps remain separate', async () => {
  const picture = image(16, [2, 3, 4, 7]);
  picture.rgba.set([231, 84, 69, 255], 5 * 4);
  const plan = prepareSharedAudioImageImport(createAudioSong({ songId: 'long-tone' }), picture, {
    rowPitchMap: [60], colorToSlot: { 'rgba-4c82c3ff': 'square', 'rgba-e75445ff': 'square' }
  });
  assert.equal(collectAudioEvents(plan.song).length, 5, 'the editable cells remain independent');
  assert.deepEqual(collectAudioEvents(plan.song, { joinAdjacent: true }).map(({ startTick, durationTicks }) => [startTick, durationTicks]), [
    [2 * 120, 3 * 120], [5 * 120, 120], [7 * 120, 120]
  ]);

  const starts = [];
  class Param { setValueAtTime() {} linearRampToValueAtTime() {} }
  class Node {
    constructor() { this.frequency = new Param(); this.gain = new Param(); }
    connect() {} disconnect() {} start(at) { starts.push(at); } stop() {}
  }
  const context = {
    currentTime: 0, sampleRate: 8000, destination: {}, resume: async () => {}, close: async () => {},
    createOscillator: () => new Node(), createGain: () => new Node()
  };
  const player = createAudioPlayer({ audioContextFactory: () => context, schedule: () => 1, cancel: () => {} });
  assert.equal(await player.play(plan.song), true);
  assert.equal(starts.length, 3, 'each same-color run starts its oscillator only once');
  await player.dispose();
});
