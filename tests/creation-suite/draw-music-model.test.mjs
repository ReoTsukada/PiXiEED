import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnimation, ensureAnimationMusicLayer, setLayerProperties, writeAnimationCel } from '../../js/creation/animation-core.mjs';
import { createAudioSong } from '../../js/creation/audio-core.mjs';
import { createPxdProject, getPxdJson, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { mountDrawMusicModel } from '../../js/creation/draw-music-model.mjs';

function harness(timeline, project = createPxdProject()) {
  let currentTimeline = timeline;
  const listeners = new Set();
  const cleanups = [];
  const history = [];
  const modelEvents = [];
  let hooks;
  let musicSettingsPlanner = null;
  const emit = () => { for (const listener of [...listeners]) listener(); };
  const draw = {
    getTimeline: () => currentTimeline,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async attachProjectHooks(value) { hooks = value; await value.onOpen(project, currentTimeline); return () => { hooks = null; }; },
    async applyMusicPage(document, options) {
      const layer = currentTimeline.layers.find(({ role }) => role === 'music');
      const storedDocument = { ...document, pixels: document.pixels.map((value) => value < 0 ? 0 : value + 1) };
      const next = writeAnimationCel(currentTimeline, currentTimeline.frames[0].id, layer.id, storedDocument);
      options.prepareTimeline(next); currentTimeline = next; if (options.record !== false) history.push(next); emit();
      return next;
    },
    commitMetadata(prepare) {
      const activeLayer = currentTimeline.layers.find(({ role }) => role !== 'music') || currentTimeline.layers[0];
      const next = setLayerProperties(currentTimeline, activeLayer.id, {});
      prepare(next); currentTimeline = next; history.push(next); emit();
    },
    selectMusicLayer() { return true; },
    setMusicReadOnly(reason) { this.readOnlyReason = reason; },
    setMusicSettingsPlanner(planner) { musicSettingsPlanner = planner; }
  };
  const scope = { add(cleanup) { cleanups.push(cleanup); } };
  return { draw, scope, history, modelEvents, get timeline() { return currentTimeline; }, get hooks() { return hooks; }, get musicSettingsPlanner() { return musicSettingsPlanner; }, emit,
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
