import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnimation, ensureAnimationMusicLayer, getAnimationCelDocument, setAnimationDrawRewardBonusColors, setLayerProperties, writeAnimationCel } from '../../js/creation/animation-core.mjs';
import { AUDIO_PIXEL_TICKS, createAudioSong, resizeAudioCanvas, setAudioPixel } from '../../js/creation/audio-core.mjs';
import { createPxdProject, getPxdJson, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { changeDrawMusicColor, projectDrawMusic } from '../../js/creation/draw-music-core.mjs';
import { mountDrawMusicModel } from '../../js/creation/draw-music-model.mjs';
import { planSharedProjectSettings } from '../../js/creation/shared-project-core.mjs?rev=20261015-alpha-opacity-1';

function harness(timeline, project = createPxdProject()) {
  let currentTimeline = timeline;
  const listeners = new Set();
  const cleanups = [];
  const history = [];
  const modelEvents = [];
  let hooks;
  let musicSettingsPlanner = null;
  let musicTimelineValidator = null;
  let rewardActive = false;
  const emit = () => { for (const listener of [...listeners]) listener(); };
  const draw = {
    getTimeline: () => currentTimeline,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async attachProjectHooks(value) { hooks = value; await value.onOpen(project, currentTimeline); return () => { hooks = null; }; },
    async applyMusicPage(document, options) {
      const layer = currentTimeline.layers.find(({ role }) => role === 'music');
      const storedDocument = { ...document, pixels: document.pixels.map((value) => value < 0 ? 0 : value + 1) };
      const next = writeAnimationCel(currentTimeline, currentTimeline.frames[0].id, layer.id, storedDocument);
      options.prepareTimeline?.(next);
      if (musicTimelineValidator?.({ before: currentTimeline, after: next, operation: 'music-page', rewardActive }) === false) return currentTimeline;
      currentTimeline = next; if (options.record !== false) history.push(next); emit();
      return next;
    },
    commitMetadata(prepare) {
      const activeLayer = currentTimeline.layers.find(({ role }) => role !== 'music') || currentTimeline.layers[0];
      const next = setLayerProperties(currentTimeline, activeLayer.id, {});
      prepare(next);
      if (musicTimelineValidator?.({ before: currentTimeline, after: next, operation: 'metadata', rewardActive }) === false) return false;
      currentTimeline = next; history.push(next); emit();
    },
    selectMusicLayer() { return true; },
    setMusicReadOnly(reason) { this.readOnlyReason = reason; },
    setMusicRewardStatus(reason) { this.rewardStatus = reason; },
    setMusicSettingsPlanner(planner) { musicSettingsPlanner = planner; },
    setMusicTimelineValidator(validator) { musicTimelineValidator = validator; return () => { if (musicTimelineValidator === validator) musicTimelineValidator = null; }; },
    snapshotTimeline() { return { animation: currentTimeline }; },
    restoreTimelineSnapshot(snapshot) { currentTimeline = snapshot.animation; emit(); return currentTimeline; },
    tryTimelineMutation(next, { afterValidate } = {}) {
      if (musicTimelineValidator?.({ before: currentTimeline, after: next, operation: 'direct-edit', rewardActive }) === false) return false;
      afterValidate?.();
      currentTimeline = next; history.push(next); emit(); return true;
    }
  };
  const scope = { add(cleanup) { cleanups.push(cleanup); } };
  return { draw, scope, history, modelEvents, get timeline() { return currentTimeline; }, get hooks() { return hooks; }, get musicSettingsPlanner() { return musicSettingsPlanner; }, emit,
    setRewardActive(value) { rewardActive = Boolean(value); },
    subscribe(model) { model.subscribe((event) => modelEvents.push(event)); }, cleanup() { cleanups.forEach((cleanup) => cleanup()); } };
}

test('music page baseline is loaded without adding an Undo step; page selection and tempo are snapshot-backed', async () => {
  const timeline = ensureAnimationMusicLayer(createAnimation({ width: 2, height: 2, palette: ['#000000', '#ffffff'] }));
  const app = harness(timeline);
  const model = await mountDrawMusicModel({ draw: app.draw, scope: app.scope });
  app.subscribe(model);

  assert.equal(app.history.length, 0, 'baseline page load does not create an Undo step');
  assert.equal(app.draw.readOnlyReason, '');
  assert.equal(model.readOnly, false);
  assert.equal(model.getState().musicTrackMode, true);

  const pageTwo = await model.addPage({ copy: false });
  assert.equal(app.history.length, 1);
  assert.equal(pageTwo.musicAnimation.frames.length, 2);
  assert.equal(pageTwo.musicPageId, pageTwo.musicAnimation.frames[1].id);
  assert.equal(app.modelEvents.at(-1).audioChanged, true, 'adding a blank page changes the composed track');

  const impact = app.musicSettingsPlanner({ width: 1, height: 2 }).summary.musicImpact;
  assert.match(impact, /全2ページに適用/);
  assert.match(impact, /2×2px → 1×2px/);
  assert.match(impact, /列の時刻配分を再計算/);

  const originalFirstPageId = pageTwo.musicAnimation.frames[0].id;
  await model.movePage(originalFirstPageId, 1);
  assert.equal(app.history.length, 2);
  assert.deepEqual(model.getState().musicAnimation.frames.map(({ id }) => id), [pageTwo.musicPageId, originalFirstPageId]);
  assert.equal(model.getState().musicPageId, pageTwo.musicPageId, 'moving another page keeps the active page selected');

  const priorPageId = pageTwo.musicAnimation.frames[0].id;
  await model.selectPage(priorPageId);
  assert.equal(app.history.length, 3);
  assert.equal(model.getState().musicPageId, priorPageId);
  assert.equal(app.modelEvents.at(-1).audioChanged, false, 'changing the selected page alone does not interrupt playback');

  model.changeTempo(132);
  assert.equal(app.history.length, 4);
  assert.equal(model.getState().song.tempo, 132);
  assert.equal(app.modelEvents.at(-1).audioChanged, true);
  app.cleanup();
  assert.equal(app.musicSettingsPlanner, null, 'model cleanup unregisters its settings preview hook');
});

test('expired audio reward keeps bonus notes through tempo edits and page selection', async () => {
  const timeline = ensureAnimationMusicLayer(createAnimation({ width: 2, height: 2, palette: ['#000000', '#ffffff'] }));
  let entitled = true;
  const app = harness(timeline);
  app.setRewardActive(true);
  const rewardPolicy = { isEnabled: () => true, hasReward: () => entitled, require: () => false };
  const model = await mountDrawMusicModel({ draw: app.draw, scope: app.scope, rewardPolicy });

  const secondPage = await model.addPage({ copy: false });
  let bonusSong = resizeAudioCanvas(secondPage.song, 128);
  bonusSong = setAudioPixel(bonusSong, { trackId: 'track-square', pitch: 84,
    startTick: 16 * AUDIO_PIXEL_TICKS, noteId: 'expired-bonus-note' });
  model.change(current => ({ ...current, song: bonusSong }));
  entitled = false;
  app.setRewardActive(false);

  model.changeTempo(132);
  assert.equal(model.getState().song.tempo, 132, 'basic tempo remains editable');
  assert.equal(model.getState().song.loopTicks, bonusSong.loopTicks);
  assert.deepEqual(model.getState().song.tracks[0].clips[0].notes, bonusSong.tracks[0].clips[0].notes,
    'the reward-owned note remains unchanged');
  const pageIds = model.getState().musicAnimation.frames.map(({ id }) => id);
  await model.selectPage(pageIds[0]);
  assert.equal(model.getState().musicPageId, pageIds[0]);
  assert.deepEqual(model.getState().musicAnimation.frames.map(({ id }) => id), pageIds,
    'selecting a page does not alter the saved pages');
  assert.deepEqual(model.getState().song.tracks[0].clips[0].notes, bonusSong.tracks[0].clips[0].notes);
  app.cleanup();
});

test('expired shared Draw Audio rejects a bonus-column stroke before changing timeline or history', async () => {
  const timeline = ensureAnimationMusicLayer(createAnimation({ width: 128, height: 16, palette: ['#000000'] }));
  let entitled = true;
  const storedSong = setAudioPixel(resizeAudioCanvas(createAudioSong({ songId: 'shared-audio' }), 128), {
    trackId: 'track-square', pitch: 84, startTick: 16 * AUDIO_PIXEL_TICKS, noteId: 'stored-bonus-note'
  });
  const project = setPxdJson(createPxdProject(), 'audio/state.json', storedSong);
  const app = harness(timeline, project);
  app.setRewardActive(true);
  const rewardPolicy = { isEnabled: () => true, hasReward: () => entitled, require: () => false };
  const model = await mountDrawMusicModel({ draw: app.draw, scope: app.scope, rewardPolicy });
  model.change(current => changeDrawMusicColor(current, {
    colorId: 'rgba-000000ff', slotId: 'square', instrument: 'square'
  }));
  entitled = false;
  app.setRewardActive(false);

  const beforeTimeline = app.timeline;
  const beforeState = model.getState();
  const beforeHistory = app.history.length;
  const layer = beforeTimeline.layers.find(({ role }) => role === 'music');
  const cel = getAnimationCelDocument(beforeTimeline, beforeTimeline.frames[0].id, layer.id);
  cel.pixels[16] = 0;
  cel.pixels = Uint8Array.from(cel.pixels, value => value + 1);
  const editedTimeline = writeAnimationCel(beforeTimeline, beforeTimeline.frames[0].id, layer.id, cel);

  assert.equal(app.draw.tryTimelineMutation(editedTimeline), false);
  assert.equal(app.timeline, beforeTimeline, 'the pre-commit validator keeps the timeline unchanged');
  assert.equal(app.history.length, beforeHistory, 'a denied stroke adds no undo or redo entry');
  assert.equal(model.getState(), beforeState, 'the audio model remains on the same accepted snapshot');
  assert.equal(model.getState().song.tracks[0].clips[0].notes.some(note => note.noteId === 'stored-bonus-note'), true);
  app.cleanup();
});

test('expired shared Draw Audio keeps general canvas resize free when the extra columns contain no notes', async () => {
  const timeline = ensureAnimationMusicLayer(createAnimation({ width: 16, height: 16, palette: ['#000000'] }));
  const app = harness(timeline);
  app.setRewardActive(true);
  let entitled = true;
  const model = await mountDrawMusicModel({ draw: app.draw, scope: app.scope,
    rewardPolicy: { isEnabled: () => true, hasReward: () => entitled, require: () => false } });
  model.change(current => changeDrawMusicColor(current, {
    colorId: 'rgba-000000ff', slotId: 'square', instrument: 'square'
  }));
  entitled = false;
  app.setRewardActive(false);

  const widened = planSharedProjectSettings(app.timeline, { width: 32, height: 16 }).animation;
  assert.equal(app.draw.tryTimelineMutation(widened), true,
    'the shared Draw 16-to-32 canvas expansion is a free general drawing operation');
  assert.equal(app.timeline.width, 32);
  assert.equal(model.getState().song.loopTicks / AUDIO_PIXEL_TICKS, 32);
  const narrowed = planSharedProjectSettings(app.timeline, { width: 16, height: 16 }).animation;
  assert.equal(app.draw.tryTimelineMutation(narrowed), true,
    'an empty extension can be narrowed without dropping protected audio notes');
  assert.equal(app.timeline.width, 16);
  assert.equal(model.getState().song.loopTicks / AUDIO_PIXEL_TICKS, 32,
    'canvas resizing does not destructively shorten the audio loop');
  app.cleanup();
});

test('expired shared Draw Audio rejects narrowing if it would remove notes in bonus columns', async () => {
  const timeline = ensureAnimationMusicLayer(createAnimation({ width: 32, height: 16, palette: ['#000000'] }));
  const app = harness(timeline);
  app.setRewardActive(true);
  let entitled = true;
  const model = await mountDrawMusicModel({ draw: app.draw, scope: app.scope,
    rewardPolicy: { isEnabled: () => true, hasReward: () => entitled, require: () => false } });
  model.change(current => changeDrawMusicColor(current, {
    colorId: 'rgba-000000ff', slotId: 'square', instrument: 'square'
  }));
  const page = getAnimationCelDocument(app.timeline, app.timeline.frames[0].id,
    app.timeline.layers.find(({ role }) => role === 'music').id);
  page.pixels = new Array(32 * 16).fill(-1);
  page.pixels[16] = 0;
  await app.draw.applyMusicPage(page, { record: true, select: true });
  assert.equal(model.getState().song.tracks.some(track => track.clips.some(clip => clip.notes.some(note => note.sourceCell?.x === 16))), true,
    'the generated note is linked to the bonus-column music cell');
  entitled = false;
  app.setRewardActive(false);

  const beforeState = model.getState();
  const beforeTimeline = app.timeline;
  const beforeHistory = app.history.length;
  const narrowed = planSharedProjectSettings(beforeTimeline, { width: 16, height: 16 }).animation;
  assert.equal(app.draw.tryTimelineMutation(narrowed), false,
    'shrinking the shared canvas cannot erase a protected bonus-column note');
  assert.equal(app.timeline, beforeTimeline);
  assert.equal(model.getState(), beforeState);
  assert.equal(app.history.length, beforeHistory);
  assert.equal(model.getState().song.tracks.some(track => track.clips.some(clip =>
    clip.notes.some(note => note.sourceCell?.x === 16))), true,
  'the source-linked bonus-column note remains after the denied shrink');
  app.cleanup();
});

test('expired shared Audio preserves free palette remaps beside 32 owned bonus RGBA colors', async () => {
  const palette = Array.from({ length: 64 }, (_, index) => `#${index.toString(16).padStart(2, '0')}6464`);
  let timeline = ensureAnimationMusicLayer(createAnimation({ width: 64, height: 1, palette }));
  const artLayer = timeline.layers.find(({ role }) => role !== 'music');
  timeline = writeAnimationCel(timeline, timeline.frames[0].id, artLayer.id, {
    width: 64, height: 1, palette, pixels: Uint8Array.from({ length: 64 }, (_, index) => index + 1)
  });
  setAnimationDrawRewardBonusColors(timeline, palette.slice(32).map(color => `${color}ff`));
  const app = harness(timeline);
  app.setRewardActive(true);
  let entitled = true;
  const model = await mountDrawMusicModel({ draw: app.draw, scope: app.scope,
    rewardPolicy: { isEnabled: () => true, hasReward: () => entitled, require: () => false } });
  entitled = false;
  app.setRewardActive(false);

  const beforeSong = model.getState().song;
  const nextPalette = [...app.timeline.palette];
  nextPalette[0] = '#fedcba';
  const remapped = planSharedProjectSettings(app.timeline, { palette: nextPalette }).animation;
  assert.equal(app.draw.tryTimelineMutation(remapped), true,
    `the shared audio projection must not reject a harmless free-color remap: ${app.draw.rewardStatus || ''}`);
  assert.equal(app.timeline.palette[0], '#fedcba');
  assert.deepEqual(model.getState().song, beforeSong, 'palette-only edits do not rewrite existing audio');
  assert.deepEqual(app.timeline.drawRewardBonusColors, palette.slice(32).map(color => `${color}ff`),
    'the same bonus-color ownership remains attached to the accepted timeline');
  app.cleanup();
});

test('a captured audio reward lease covers one in-flight Draw stroke across expiry only', async () => {
  const timeline = ensureAnimationMusicLayer(createAnimation({ width: 128, height: 16, palette: ['#000000'] }));
  let entitled = true;
  const storedSong = setAudioPixel(resizeAudioCanvas(createAudioSong({ songId: 'lease-audio' }), 128), {
    trackId: 'track-square', pitch: 84, startTick: 16 * AUDIO_PIXEL_TICKS, noteId: 'stored-bonus-note'
  });
  const project = setPxdJson(createPxdProject(), 'audio/state.json', storedSong);
  const app = harness(timeline, project);
  app.setRewardActive(true);
  const model = await mountDrawMusicModel({ draw: app.draw, scope: app.scope,
    rewardPolicy: { isEnabled: () => true, hasReward: () => entitled, require: () => false } });
  model.change(current => changeDrawMusicColor(current, {
    colorId: 'rgba-000000ff', slotId: 'square', instrument: 'square'
  }));

  const before = app.timeline;
  const layer = before.layers.find(({ role }) => role === 'music');
  const firstCel = getAnimationCelDocument(before, before.frames[0].id, layer.id);
  firstCel.pixels[16] = 0;
  firstCel.pixels = Uint8Array.from(firstCel.pixels, value => value + 1);
  const firstEdit = writeAnimationCel(before, before.frames[0].id, layer.id, firstCel);
  assert.equal(app.draw.tryTimelineMutation(firstEdit, { afterValidate() {
    entitled = false; app.setRewardActive(false);
  } }), true, 'the edit that began under the captured lease completes');
  const acceptedTimeline = app.timeline;
  const acceptedState = model.getState();
  const acceptedHistory = app.history.length;
  assert.equal(acceptedState.song.tracks[0].clips[0].notes.some(note => note.sourceCell?.x === 16), true);

  const secondCel = getAnimationCelDocument(acceptedTimeline, acceptedTimeline.frames[0].id, layer.id);
  secondCel.pixels[17] = 0;
  secondCel.pixels = Uint8Array.from(secondCel.pixels, value => value + 1);
  const secondEdit = writeAnimationCel(acceptedTimeline, acceptedTimeline.frames[0].id, layer.id, secondCel);
  assert.equal(app.draw.tryTimelineMutation(secondEdit), false, 'a later edit has no inherited lease');
  assert.equal(app.timeline, acceptedTimeline);
  assert.equal(model.getState(), acceptedState);
  assert.equal(app.history.length, acceptedHistory);

  app.draw.restoreTimelineSnapshot({ animation: before });
  assert.equal(app.timeline, acceptedTimeline, 'undoing back across the protected stroke is rejected after expiry');
  assert.equal(model.getState(), acceptedState);
  assert.equal(app.history.length, acceptedHistory, 'a denied history transition leaves the accepted history intact');
  app.cleanup();
});

test('page removal uses shared history and refuses to remove the final page', async () => {
  const timeline = ensureAnimationMusicLayer(createAnimation({ width: 2, height: 2, palette: ['#000000', '#ffffff'] }));
  const app = harness(timeline);
  const model = await mountDrawMusicModel({ draw: app.draw, scope: app.scope });
  const twoPages = await model.addPage({ copy: false });
  const removedPage = twoPages.musicPageId;
  const onePage = await model.removePage(removedPage);
  assert.equal(app.history.length, 2);
  assert.equal(onePage.musicAnimation.frames.length, 1);
  assert.equal(onePage.musicPageId, onePage.musicAnimation.frames[0].id);
  assert.throws(() => model.removePage(onePage.musicPageId), /最後のコマは削除できません/);
  assert.equal(app.history.length, 2, 'a rejected final-page removal creates no Undo step');
  app.cleanup();
});

test('opening another project immediately signals that the previous audio source must stop', async () => {
  const timeline = ensureAnimationMusicLayer(createAnimation({ width: 2, height: 2, palette: ['#000000', '#ffffff'] }));
  const app = harness(timeline);
  const model = await mountDrawMusicModel({ draw: app.draw, scope: app.scope });
  app.subscribe(model);

  const opening = app.hooks.onOpen(createPxdProject(), timeline);
  assert.equal(app.modelEvents.at(-1).state, null);
  assert.equal(app.modelEvents.at(-1).audioChanged, true);
  await opening;
  assert.equal(model.getState().musicTrackMode, true);
  assert.equal(app.modelEvents.at(-1).audioChanged, false, 'the prepared baseline does not signal another source change');
  app.cleanup();
});

test('lossless migration failure keeps the stored song read-only except for tempo and saves only audio state', async () => {
  const timeline = createAnimation({ width: 2, height: 2, palette: ['#000000', '#ffffff'] });
  const originalSong = createAudioSong({ songId: 'retained', tempo: 117 });
  const project = setPxdJson(createPxdProject(), 'audio/state.json', originalSong);
  const app = harness(timeline, project);
  const model = await mountDrawMusicModel({ draw: app.draw, scope: app.scope });

  assert.equal(model.readOnly, true, 'art without a music role cannot be migrated into a music page');
  assert.match(app.musicSettingsPlanner({ width: 3, height: 2 }).summary.musicImpact, /変更せず保持/);
  assert.equal(model.getState().song.songId, originalSong.songId);
  assert.throws(() => model.change((state) => ({ ...state, song: { ...state.song, title: 'changed' } })), /音楽ページや色の割り当ては変更できません/);
  assert.throws(() => model.addPage({ copy: false }), /音楽ページは変更できません/);
  assert.throws(() => model.movePage('missing', 0), /音楽ページは変更できません/);
  assert.throws(() => model.removePage('missing'), /音楽ページは変更できません/);
  model.changeTempo(125);
  assert.equal(model.getState().song.tempo, 125);
  assert.equal(app.history.length, 1, 'only the tempo edit is committed to shared history');

  const saved = await app.hooks.onSave(project, app.timeline, { imageRole: 'main' });
  assert.equal(getPxdJson(saved, 'audio/state.json').tempo, 125);
  assert.equal(saved.entries.some(({ path }) => path === 'audio/link.json'), false);
  assert.deepEqual(saved.entries.filter(({ path }) => path !== 'audio/state.json').map(({ path }) => path), []);
  app.cleanup();
});
