import { createAudioPlayer, AUDIO_INSTRUMENTS, AUDIO_PIXEL_TICKS, getAudioColorInstrument } from './audio-core.mjs?rev=20261011-legacy-frames-1';
import { AUDIO_INSTRUMENT_GROUPS } from './audio-timbres.mjs';
import { changeDrawMusicColor, changeDrawMusicTempo, describeDrawMusicProjection, usesLegacyMusicTiming, LEGACY_MUSIC_EDITOR_ROLE } from './draw-music-core.mjs?rev=20261011-shared-music-2';
import { readPxdAnimation, writePxdAnimation } from './pxd-animation.mjs';
import { composeAnimationFrame } from './animation-core.mjs';
import { audioAnimationSequenceColumn } from './audio-animation.mjs?rev=20261011-legacy-frames-1';
import { documentRgba } from './draw-core.mjs';
import { audioSongImage, audioCellLink, readPxdAudioState, readPxdAudioLink, assertPxdAudioPixelCompatibility } from './pxd-draw-audio.mjs?rev=20261011-legacy-frames-1';
import { pxdImageRoles, putPxdImage, readPxdImage } from './pxd-project.mjs';
import { setPxdJson } from './pxd-codec.mjs';
import { mountToolHeaderControls } from '../tool-header-controls.mjs';
import { sendToolOutputAfterSaving } from './output-handoff.mjs?rev=20261011-shared-music-2';

const preparedLegacyProjects = new WeakSet();

/** Prepare only legacy song-only imports; existing project image roles stay untouched. */
export async function prepareSharedMusicProject(project) {
  const song = readPxdAudioState(project);
  const legacySongOnly = Boolean(song && !readPxdAudioLink(project) && !pxdImageRoles(project).length);
  if (legacySongOnly) {
    assertPxdAudioPixelCompatibility(song);
    const prepared = setPxdJson(await putPxdImage(project, audioSongImage(song), 'audio'), 'audio/link.json', audioCellLink(song));
    preparedLegacyProjects.add(prepared);
    return prepared;
  }
  const link = readPxdAudioLink(project);
  if (song && usesLegacyMusicTiming(link, song) && link.legacyEditorRole === LEGACY_MUSIC_EDITOR_ROLE) {
    const animation = await readPxdAnimation(project, LEGACY_MUSIC_EDITOR_ROLE);
    const image = await readPxdImage(project, link.imageRole);
    if (animation?.frames.length === 1 && image) {
      const doc = composeAnimationFrame(animation, animation.frames[0].id);
      const rgba = documentRgba({ ...doc, pixels: Array.from(doc.pixels) });
      // Keep the retained layers when they still compose to the legacy image.
      if (doc.width === image.width && doc.height === image.height && rgba.every((byte, index) => byte === image.rgba[index])) {
        const existingAudioAnimation = await readPxdAnimation(project, 'audio');
        if (existingAudioAnimation) return project;
        return writePxdAnimation(project, animation, { role: 'audio', posterFrameId: animation.frames[0].id });
      }
    }
  }
  return project;
}

/** Music is a consumer of the full Draw editor, never a second pixel editor. */
export async function mountDrawMusic({ draw, scope, nav, isActive, musicModel }) {
  let state = null, epoch = 0, videoController = null, exporting = false, positionFrame = 0;
  if (!musicModel?.getState) throw new TypeError('共有音楽データを読み込めません。');
  state = musicModel.getState();
  const settings = document.createElement('details'); settings.id = 'draw-music-settings'; settings.className = 'draw-music-settings';
  settings.innerHTML = `<summary>音楽</summary><div class="draw-music-panel" role="group" aria-label="音楽の設定">
    <label>曲のページ <select id="draw-music-page"></select></label>
    <div class="draw-music-pages"><button type="button" id="draw-music-page-add">追加</button><button type="button" id="draw-music-page-copy">複製</button><button type="button" id="draw-music-page-before" aria-label="音楽ページを前へ">←</button><button type="button" id="draw-music-page-after" aria-label="音楽ページを後へ">→</button><button type="button" id="draw-music-page-delete">削除</button></div>
    <label>BPM（音楽テンポ） <input id="draw-music-tempo" type="number" min="60" max="180" value="120"></label>
    <label>描く色の音 <select id="draw-music-instrument"><option value="">無音（未割当）</option></select></label>
    <button type="button" id="draw-music-preview">この音を試聴</button>
    <label>保存時の再生回数 <select id="draw-music-loops"><option>1</option><option>2</option><option>4</option><option>8</option></select></label>
    <button type="button" id="draw-music-stop-loop">このループの最後で停止</button>
    <label class="draw-music-check"><input type="checkbox" id="draw-music-output-layer">音楽レイヤーを絵として出力</label>
    <label class="draw-music-check"><input type="checkbox" id="draw-music-output-audio" checked>動画に音声を含める</label>
    <canvas id="draw-music-output-preview" class="draw-music-output-preview" aria-label="動画の先頭コマの出力プレビュー"></canvas>
    <button type="button" id="draw-music-wav">音を保存（WAV）</button><button type="button" id="draw-music-video">動画を保存</button>
    <p id="draw-music-timing">音楽レイヤーのページを順に演奏します。絵のコマとBPMは独立しています。透明は無音。</p>
    <p id="draw-music-color" aria-live="polite"></p><p id="draw-music-status" role="status" aria-live="polite"></p></div>`;
  document.querySelector('#main').append(settings);
  mountToolHeaderControls(document, { selectors: ['#draw-music-settings'] });
  const musicSlot = settings.closest('.px-tool-header-slot'), drawSettingsSlot = document.querySelector('#draw-settings-picker')?.closest('.px-tool-header-slot');
  if (musicSlot && drawSettingsSlot) drawSettingsSlot.before(musicSlot);
  const instrument = settings.querySelector('#draw-music-instrument'), tempo = settings.querySelector('#draw-music-tempo'), status = settings.querySelector('#draw-music-status');
  for (const { name, instruments } of AUDIO_INSTRUMENT_GROUPS) {
    const group = document.createElement('optgroup'); group.label = name;
    for (const voice of instruments) { const option = document.createElement('option'); option.value = voice.id; option.textContent = voice.name; group.append(option); }
    instrument.append(group);
  }
  const play = document.createElement('button'); play.type = 'button'; play.id = 'draw-music-play'; play.className = 'draw-playback-control';
  play.textContent = '▶'; play.setAttribute('aria-label', '音楽を再生'); nav.insertBefore(play, nav.children[2]);
  const position = document.createElement('span'); position.className = 'draw-music-position'; position.hidden = true; document.querySelector('.draw-board').append(position);
  const say = message => { status.textContent = message; };
  function updateTransport(playing, starting) {
    play.dataset.state = playing ? 'playing' : starting ? 'starting' : 'idle'; play.textContent = playing || starting ? '■' : '▶';
    play.setAttribute('aria-label', playing || starting ? '音楽を停止' : '音楽を再生'); play.setAttribute('aria-pressed', String(playing));
    if (!playing) { position.hidden = true; cancelAnimationFrame(positionFrame); positionFrame = 0; }
  }
  const player = createAudioPlayer({ onStateChange: updateTransport }); updateTransport(false, false);
  function selectedColorId() {
    const timeline = draw.getTimeline(), index = draw.getEditorState().selectedColor, color = timeline.palette[index];
    return color ? `rgba-${color.slice(1).toLowerCase().padEnd(8, 'f')}` : null;
  }
  function refresh() {
    if (!state || !isActive()) return;
    tempo.value = state.song.tempo;
    settings.querySelector('#draw-music-timing').textContent = `${describeDrawMusicProjection(state)}。音楽レイヤーだけを演奏します。画像のコマ切替では曲は変わりません。透明は無音。`;
    const pages = settings.querySelector('#draw-music-page'), frames = state.musicAnimation?.frames || [];
    pages.replaceChildren(...frames.map((frame,index) => { const option = document.createElement('option'); option.value=frame.id; option.textContent=`ページ ${index+1}`; return option; })); pages.value=state.musicPageId || '';
    pages.disabled=musicModel.readOnly || exporting;
    const pageIndex=frames.findIndex(frame=>frame.id===state.musicPageId);
    for (const action of ['add','copy','before','after','delete']) settings.querySelector(`#draw-music-page-${action}`).disabled=musicModel.readOnly || exporting || (action==='delete'&&frames.length<2) || (action==='before'&&pageIndex<1) || (action==='after'&&pageIndex>=frames.length-1);
    settings.querySelector('#draw-music-output-layer').checked=Boolean(draw.getOutputPreferences?.().includeMusic);
    renderOutputPreview();
    for(const id of ['#draw-music-output-layer','#draw-music-output-audio','#draw-music-loops']) settings.querySelector(id).disabled=exporting;
    if (musicModel.error) say(musicModel.error);
    const id = selectedColorId(), slot = id ? state.link?.colorToSlot?.[id] : null;
    instrument.value = slot ? getAudioColorInstrument(state.song, id, slot) : '';
    instrument.disabled = musicModel.readOnly || !id || id.endsWith('00');
    settings.querySelector('#draw-music-preview').disabled = !instrument.value || instrument.disabled;
    settings.querySelector('#draw-music-color').textContent = id ? `${id.slice(5)}：${instrument.selectedOptions[0]?.textContent || '無音'}` : '透明：無音';
    for (const swatch of document.querySelectorAll('#draw-palette [data-color-index]')) {
      const index = Number(swatch.dataset.colorIndex), color = draw.getTimeline().palette[index];
      const key = color ? `rgba-${color.slice(1).toLowerCase().padEnd(8, 'f')}` : null;
      const slotId = key ? state.link?.colorToSlot?.[key] : null;
      const voice = slotId ? AUDIO_INSTRUMENTS.find(item => item.id === getAudioColorInstrument(state.song, key, slotId)) : null;
      const label = index < 0 ? '透明・無音' : `色 ${index + 1}・${voice?.name || '未割当。音楽設定で音を選べます'}`;
      swatch.dataset.musicAssigned = String(Boolean(slotId)); swatch.title = label; swatch.setAttribute('aria-label', label);
    }
    for (const id of ['#draw-music-wav', '#draw-music-video']) settings.querySelector(id).disabled = exporting;
  }
  function projected() {
    const next = musicModel.getState();
    if (!next) throw new TypeError('音楽状態を読み込んでいます。');
    return next;
  }
  function changed({ audioChanged = false } = {}) {
    if (audioChanged) { player.stop(); videoController?.abort(); epoch++; }
    state = musicModel.getState(); refresh();
  }
  scope.add(musicModel.subscribe(changed));
  scope.add(draw.subscribe(() => { state = musicModel.getState(); refresh(); }));
  function settingChange(change) {
    try { state=musicModel.change(change); refresh(); say('音の設定を変更しました。Undoで戻せます。'); }
    catch (error) { say(error.message); refresh(); }
  }
  const pageSelect=settings.querySelector('#draw-music-page');
  scope.listen(pageSelect,'change',()=>void musicModel.selectPage(pageSelect.value).catch(error=>say(error.message)));
  async function pageAction(action) {
    try {
      const current=projected(),index=current.musicAnimation.frames.findIndex(frame=>frame.id===current.musicPageId);
      if (action==='add'||action==='copy') await musicModel.addPage({copy:action==='copy'});
      else if(action==='delete') await musicModel.removePage(current.musicPageId);
      else await musicModel.movePage(current.musicPageId,index+(action==='before'?-1:1));
      state=projected();refresh();
    } catch(error){say(error.message);}
  }
  for(const action of ['add','copy','before','after','delete']) scope.listen(settings.querySelector(`#draw-music-page-${action}`),'click',()=>void pageAction(action));
  function renderOutputPreview() {
    const preview=settings.querySelector('#draw-music-output-preview'),timeline=draw.getTimeline();
    if (!timeline || !draw.getOutputFrame) return;
    const doc=draw.getOutputFrame(timeline.frames[0].id),context=preview.getContext('2d');
    preview.width=doc.width;preview.height=doc.height;
    context.putImageData(new ImageData(new Uint8ClampedArray(documentRgba({...doc,pixels:Array.from(doc.pixels)})),doc.width,doc.height),0,0);
  }
  scope.listen(settings.querySelector('#draw-music-output-layer'),'change',event=> { draw.setOutputPreferences?.({includeMusic:event.target.checked});renderOutputPreview(); });
  scope.listen(tempo, 'change', () => settingChange(value => changeDrawMusicTempo(value, Number(tempo.value))));
  scope.listen(instrument, 'change', () => settingChange(value => changeDrawMusicColor(value, { colorId: selectedColorId(), slotId: instrument.value ? value.link?.colorToSlot?.[selectedColorId()] || 'square' : null, instrument: instrument.value || null })));
  scope.listen(window, 'click', () => { if (isActive()) requestAnimationFrame(() => { if (!scope.disposed) refresh(); }); }, { capture: true });
  scope.listen(document, 'pointerdown', event => { if (!settings.contains(event.target)) settings.open = false; });
  scope.listen(settings.querySelector('#draw-music-preview'), 'click', async () => {
    try { if (instrument.value) await player.preview({ instrument: instrument.value, pitch: 60 }); } catch { say('音を試聴できませんでした。'); }
  });
  function paintPosition() {
    if (!isActive() || !player.isPlaying) return;
    const tick = player.currentTick, width = (state.musicAnimation || state.animation).width;
    const sequenceX = Math.max(0, state.link?.timing
      ? audioAnimationSequenceColumn(state.link, tick || 0)
      : Math.floor(usesLegacyMusicTiming(state.link, state.song) ? (tick || 0) * width / state.song.loopTicks : (tick || 0) / AUDIO_PIXEL_TICKS));
    position.textContent = `▶ ページ ${Math.min((state.musicAnimation || state.animation).frames.length, Math.floor(sequenceX / width) + 1)}・列 ${sequenceX % width + 1}`; position.hidden = false;
    positionFrame = requestAnimationFrame(paintPosition);
  }
  scope.listen(play, 'click', async () => {
    try {
      if (player.isPlaying || player.isStarting) { player.stop(); return; }
      state = projected(); const token = epoch;
      if (await player.play(state.song)) { if (!isActive() || token !== epoch) player.stop(); else paintPosition(); }
      else say('まだ音がありません。描く色に音を割り当ててください。');
    } catch (error) { say(error.message); }
  });
  scope.listen(settings.querySelector('#draw-music-stop-loop'), 'click', () => { player.stopAfterCurrentLoop(); });
  async function output(kind) {
    if (exporting || !isActive()) return;
    draw.suspend(); player.stop(); state = projected();
    const source = state, timeline = draw.getTimeline(), token = epoch, includeMusic=Boolean(draw.getOutputPreferences?.().includeMusic), includeAudio=settings.querySelector('#draw-music-output-audio').checked;
    const unchanged = () => isActive() && !scope.disposed && token === epoch && state === source && draw.getTimeline() === timeline;
    exporting = true; refresh();
    try {
      const workspace = draw.workspace;
      await workspace.assertCanSave(); if (!unchanged()) return;
      const loops = Number(settings.querySelector('#draw-music-loops').value); let result, filename;
      if (kind === 'wav') { const { renderAudioWav } = await import('./audio-export.mjs'); if (!unchanged()) return; result = await renderAudioWav(source.song, { loops }); filename = `pixieed-dot-music-${Math.round(result.seconds)}s.wav`; }
      else {
        const { renderAudioVideo } = await import('./audio-video.mjs'); if (!unchanged()) return; videoController = new AbortController();
        const frames = timeline.frames.map(frame => { const doc = draw.getOutputFrame(frame.id); return { width: doc.width, height: doc.height, rgba: new Uint8ClampedArray(documentRgba({ ...doc, pixels: Array.from(doc.pixels) })) }; });
        result = await renderAudioVideo(source.song, frames[0], { totalPlays: loops, frameImages: frames, frameDurationsMs: timeline.frames.map(frame=>frame.durationMs), includeAudio, signal: videoController.signal });
        filename = `pixieed-dot-music-${Math.round(result.seconds)}s.${result.extension}`;
      }
      if (!unchanged()) return;
      const staged = await sendToolOutputAfterSaving({ blob: result.blob, filename, returnUrl: () => `${location.pathname}${location.search}`, title: kind === 'wav' ? '音を確認' : '動画を確認', source: 'ドットで音楽', metadata: { durationSeconds: result.seconds, loops, ...(kind==='video'? {includeMusicLayer:includeMusic,includeAudio:result.hasAudio,visualFrameDurationsMs:timeline.frames.map(frame=>frame.durationMs)}:{}) } }, workspace, unchanged);
      if (!staged.ok && staged.reason !== 'source_changed') say(staged.error?.message || '出力画面を開けませんでした。作品は保持しています。');
    } finally { exporting = false; videoController = null; refresh(); }
  }
  for (const kind of ['wav', 'video']) scope.listen(settings.querySelector(`#draw-music-${kind}`), 'click', () => void output(kind).catch(error => { if (error.name !== 'AbortError') say(error.message); }));
  function suspend() { epoch++; settings.open = false; videoController?.abort(); player.stop(); void player.dispose(); position.hidden = true; }
  scope.listen(document, 'visibilitychange', () => { if (document.hidden) suspend(); });
  scope.listen(window, 'pagehide', suspend);
  scope.add(suspend);
  return { get workspace() { return draw.workspace; }, nodes: [settings.closest('.px-tool-header-slot') || settings, play, position], suspend,
    resume() { musicModel.selectMusicLayer(); changed(); refresh(); },
    importImage(image) { draw.importImage(image); changed(); },
    getImage: () => draw.getImage()
  };
}
