import { createAudioPlayer, AUDIO_INSTRUMENTS, AUDIO_PIXEL_TICKS, getAudioColorInstrument } from './audio-core.mjs?rev=20261016-color-capability-1';
import { AUDIO_INSTRUMENT_GROUPS } from './audio-timbres.mjs?rev=20261005-audio-drums-1';
import { changeDrawMusicColor, changeDrawMusicTempo, describeDrawMusicProjection, usesLegacyMusicTiming, LEGACY_MUSIC_EDITOR_ROLE } from './draw-music-core.mjs?rev=20261016-tool-shell-1';
import { readPxdAnimation, writePxdAnimation } from './pxd-animation.mjs?rev=20261016-color-capability-1';
import { composeAnimationFrameRgba } from './animation-core.mjs?rev=20261016-color-capability-1';
import { audioAnimationSequenceColumn } from './audio-animation.mjs?rev=20261016-color-capability-1';
import { documentRgba } from './draw-core.mjs?rev=20261011-tool-size-1';
import { audioSongImage, audioCellLink, readPxdAudioState, readPxdAudioLink, assertPxdAudioPixelCompatibility } from './pxd-draw-audio.mjs?rev=20261016-color-capability-1';
import { pxdImageRoles, putPxdImage, readPxdImage } from './pxd-project.mjs?rev=20261016-color-capability-1';
import { setPxdJson } from './pxd-codec.mjs';
import { mountToolHeaderControls } from '../tool-header-controls.mjs?rev=20261018-direct-runtime-1&nav=20261016-tool-operations-1';
import { sendToolOutputAfterSaving } from './output-handoff.mjs?rev=20261018-direct-runtime-1';
import { saveFile } from '../pixel-export.mjs?rev=20261024-free-tools-1';
import { AUDIO_BASIC_INSTRUMENT_IDS, AUDIO_FREE_COLORS, AUDIO_FREE_COLUMNS, AUDIO_REWARD_COLORS, AUDIO_REWARD_COLUMNS } from './audio-reward-policy.mjs?rev=20261016-color-capability-1';
import { isSiteRewardPolicyEnabled } from '../ads/site-reward.mjs?rev=20261024-free-tools-1';

const preparedLegacyProjects = new WeakSet();
const musicActionIcon = (paths) => `<svg class="draw-music-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;

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
      const doc = composeAnimationFrameRgba(animation, animation.frames[0].id);
      const rgba = doc.rgba;
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
    <div class="draw-music-pages"><button type="button" id="draw-music-page-add" aria-label="音楽ページを追加" title="音楽ページを追加">${musicActionIcon('<path d="M12 5v14M5 12h14"/>')}<span>追加</span></button><button type="button" id="draw-music-page-copy" aria-label="音楽ページを複製" title="音楽ページを複製">${musicActionIcon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>')}<span>複製</span></button><button type="button" id="draw-music-page-before" aria-label="音楽ページを前へ"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button><button type="button" id="draw-music-page-after" aria-label="音楽ページを後へ"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button><button type="button" id="draw-music-page-delete" aria-label="音楽ページを削除" title="音楽ページを削除">${musicActionIcon('<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>')}<span>削除</span></button></div>
    <label>BPM（音楽テンポ） <input id="draw-music-tempo" type="number" min="60" max="180" value="120"></label>
    <p id="draw-music-reward-limits" aria-live="polite"></p>
    <label>描く色の音 <select id="draw-music-instrument"><option value="">無音（未割当）</option></select></label>
    <button type="button" id="draw-music-preview" aria-label="この音を試聴" title="この音を試聴">${musicActionIcon('<path d="m8 5 11 7-11 7z"/>')}<span>この音を試聴</span></button>
    <label>保存時の再生回数 <select id="draw-music-loops"><option>1</option><option>2</option><option>4</option><option>8</option></select></label>
    <button type="button" id="draw-music-stop-loop" aria-label="このループの最後で停止" title="このループの最後で停止">${musicActionIcon('<path d="M5 6v5h5M5.8 10a7 7 0 1 1-.2 4M10 10h5v5h-5z"/>')}<span>このループの最後で停止</span></button>
    <label class="draw-music-check"><input type="checkbox" id="draw-music-output-layer">音楽レイヤーを絵として出力</label>
    <label class="draw-music-check"><input type="checkbox" id="draw-music-output-audio" checked>動画に音声を含める</label>
    <canvas id="draw-music-output-preview" class="draw-music-output-preview" aria-label="動画の先頭コマの出力プレビュー"></canvas>
    <p id="draw-music-export-summary" aria-live="polite"></p>
    <button type="button" id="draw-music-wav" aria-label="音を保存（WAV）" title="音を保存（WAV）">${musicActionIcon('<path d="M9 18V5l12-2v13M9 18c0 1.1-1.3 2-3 2s-3-.9-3-2 1.3-2 3-2 3 .9 3 2zm12-2c0 1.1-1.3 2-3 2s-3-.9-3-2 1.3-2 3-2 3 .9 3 2zM12 21v-5"/>')}<span>音を保存（WAV）</span></button><button type="button" id="draw-music-video" aria-label="動画を保存" title="動画を保存">${musicActionIcon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>')}<span>動画を保存</span></button>
    <p id="draw-music-timing">音楽レイヤーのページを順に演奏します。絵のコマとBPMは独立しています。透明は無音。</p>
    <p id="draw-music-color" aria-live="polite"></p><p id="draw-music-status" role="status" aria-live="polite"></p></div>`;
  document.querySelector('#main').append(settings);
  mountToolHeaderControls(document, { scope, selectors: ['#draw-music-settings'] });
  const musicSlot = settings.closest('.px-tool-header-slot'), drawSettingsSlot = document.querySelector('#draw-settings-picker')?.closest('.px-tool-header-slot');
  if (musicSlot && drawSettingsSlot) drawSettingsSlot.before(musicSlot);
  const instrument = settings.querySelector('#draw-music-instrument'), tempo = settings.querySelector('#draw-music-tempo'), status = settings.querySelector('#draw-music-status');
  for (const { name, instruments } of AUDIO_INSTRUMENT_GROUPS) {
    const group = document.createElement('optgroup'); group.label = name;
    for (const voice of instruments) { const option = document.createElement('option'); option.value = voice.id; option.textContent = `${voice.name}${isSiteRewardPolicyEnabled() && !AUDIO_BASIC_INSTRUMENT_IDS.includes(voice.id) ? '（リワード）' : ''}`; group.append(option); }
    instrument.append(group);
  }
  const play = document.createElement('button'); play.type = 'button'; play.id = 'draw-music-play'; play.className = 'draw-playback-control';
  play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="draw-play-icon" d="m6.5 5 11 7-11 7Z"/><path class="draw-stop-icon" d="M8 5v14M16 5v14"/></svg>'; play.setAttribute('aria-label', '音楽を再生'); nav.insertBefore(play, nav.children[2]);
  const feedback = document.createElement('div'); feedback.id = 'draw-music-feedback'; feedback.className = 'draw-music-feedback'; feedback.hidden = true;
  const transportStatus = document.createElement('p'); transportStatus.id = 'draw-music-transport-status'; transportStatus.className = 'draw-music-transport-status'; transportStatus.setAttribute('role', 'status'); transportStatus.setAttribute('aria-live', 'polite');
  const voiceCta = document.createElement('button'); voiceCta.type = 'button'; voiceCta.id = 'draw-music-voice-cta'; voiceCta.innerHTML = `${musicActionIcon('<path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3Zm12-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z"/>')}<span>音色を設定</span>`; voiceCta.title = '音色を設定'; voiceCta.setAttribute('aria-label', '音色を設定'); voiceCta.hidden = true;
  const recoveryCta = document.createElement('button'); recoveryCta.type = 'button'; recoveryCta.id = 'draw-music-recovery-cta'; recoveryCta.innerHTML = `${musicActionIcon('<path d="M4 5h6l2 2h8v12H4zM8 12h8M8 16h5"/>')}<span>作品一覧を開く</span>`; recoveryCta.title = '作品一覧を開く'; recoveryCta.setAttribute('aria-label', '作品一覧を開く'); recoveryCta.hidden = true;
  const dismissFeedback = document.createElement('button'); dismissFeedback.type = 'button'; dismissFeedback.id = 'draw-music-feedback-dismiss'; dismissFeedback.innerHTML = `${musicActionIcon('<path d="M6 6 18 18M18 6 6 18"/>')}<span>閉じる</span>`; dismissFeedback.title = '音楽の案内を閉じる'; dismissFeedback.setAttribute('aria-label', '音楽の案内を閉じる');
  feedback.append(transportStatus, voiceCta, recoveryCta, dismissFeedback); nav.append(feedback);
  const position = document.createElement('span'); position.className = 'draw-music-position'; position.hidden = true; document.querySelector('.draw-board').append(position);
  let lastFeedbackMessage = '', feedbackDismissed = false;
  const say = (message, { voice = false, recovery = false } = {}) => {
    if (message !== lastFeedbackMessage) feedbackDismissed = false;
    lastFeedbackMessage = message;
    status.textContent = message;
    transportStatus.textContent = message;
    voiceCta.hidden = !voice;
    recoveryCta.hidden = !recovery || typeof draw.workspace?.openRecovery !== 'function';
    feedback.hidden = !message || feedbackDismissed;
  };
  scope.listen(dismissFeedback, 'click', () => { feedbackDismissed = true; feedback.hidden = true; });
  scope.listen(voiceCta, 'click', () => {
    if (draw.openAudioTimbre?.(undefined, play)) say('');
  });
  scope.listen(recoveryCta, 'click', () => {
    say('');
    Promise.resolve().then(() => draw.workspace.openRecovery()).catch(error => say(`原本を保持しています。作品一覧を開けませんでした：${error.message}`, { recovery: true }));
  });
  function updateTransport(playing, starting) {
    if (playing || starting) say('');
    const nextState = playing ? 'playing' : starting ? 'starting' : 'idle';
    if (play.dataset.state !== nextState) play.dataset.state = nextState;
    const label = playing || starting ? '音楽を停止' : '音楽を再生';
    if (play.getAttribute('aria-label') !== label) play.setAttribute('aria-label', label);
    const pressed = String(Boolean(playing)); if (play.getAttribute('aria-pressed') !== pressed) play.setAttribute('aria-pressed', pressed);
    if (!playing) { position.hidden = true; cancelAnimationFrame(positionFrame); positionFrame = 0; }
  }
  const player = createAudioPlayer({ onStateChange: updateTransport }); updateTransport(false, false);
  let timbrePreviewPending = false, timbrePreviewActive = false, timbrePreviewTimer = 0, timbrePreviewToken = 0;
  function stopTimbrePreview() {
    timbrePreviewToken += 1; clearTimeout(timbrePreviewTimer); timbrePreviewTimer = 0;
    if (timbrePreviewPending || timbrePreviewActive) player.stop();
    timbrePreviewPending = false; timbrePreviewActive = false;
  }
  async function previewTimbre(instrumentId) {
    const voice = AUDIO_INSTRUMENTS.find(item => item.id === instrumentId); if (!voice) return false;
    stopTimbrePreview(); const token = ++timbrePreviewToken; timbrePreviewPending = true;
    player.stop();
    try {
      const started = await player.preview({ instrument: instrumentId, pitch: 60, velocity: 82, duration: 0.12 });
      if (token !== timbrePreviewToken || !started) return false;
      timbrePreviewPending = false; timbrePreviewActive = true;
      const duration = Math.max(0.12 + Number(voice.release || 0.12), Number(voice.drum?.duration || 0)) + 0.16;
      timbrePreviewTimer = window.setTimeout(() => { if (token === timbrePreviewToken) { timbrePreviewActive = false; timbrePreviewTimer = 0; } }, Math.ceil(duration * 1000));
      return true;
    } catch (error) { if (token === timbrePreviewToken) { timbrePreviewPending = false; timbrePreviewActive = false; } throw error; }
  }
  function timbreColorId(index, color = draw.getTimeline()?.palette?.[index]) {
    const value = typeof color === 'string' ? color.toLowerCase() : '';
    const fullyTransparent = value.length === 9 && value.endsWith('00');
    return Number.isInteger(index) && index >= 0 && value.startsWith('#') && !fullyTransparent
      ? `rgba-${value.slice(1).padEnd(8, 'f')}` : null;
  }
  const timbreApi = Object.freeze({
    getAssignment(index, color) {
      const current = musicModel.getState(), colorId = timbreColorId(index, color);
      const slotId = colorId ? current?.link?.colorToSlot?.[colorId] : null;
      return slotId && current?.song ? getAudioColorInstrument(current.song, colorId, slotId) || null : null;
    },
    isReadOnly(index) { const color = draw.getTimeline()?.palette?.[index]; return musicModel.readOnly || !timbreColorId(index, color); },
    preview: previewTimbre, stopPreview: stopTimbrePreview,
    apply(index, color, instrumentId) {
      const colorId = timbreColorId(index, color); if (!colorId || musicModel.readOnly) throw new Error('この色の音色は現在変更できません。');
      const current = musicModel.getState(), slotId = instrumentId ? current?.link?.colorToSlot?.[colorId] || 'square' : null;
      state = musicModel.change(value => changeDrawMusicColor(value, { colorId, slotId, instrument: instrumentId || null }));
      refresh();
    }
  });
  function selectedColorId() {
    const timeline = draw.getTimeline(), index = draw.getEditorState().selectedColor, color = timeline.palette[index];
    return color ? `rgba-${color.slice(1).toLowerCase().padEnd(8, 'f')}` : null;
  }
  const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
  const setValue = (node, value) => { if (node.value !== String(value)) node.value = String(value); };
  const setChecked = (node, value) => { if (node.checked !== Boolean(value)) node.checked = Boolean(value); };
  const setDisabled = (node, value) => { if (node.disabled !== Boolean(value)) node.disabled = Boolean(value); };
  function refresh() {
    if (!state || !isActive()) return;
    setValue(tempo, state.song.tempo);
    setText(settings.querySelector('#draw-music-reward-limits'), isSiteRewardPolicyEnabled()
      ? `無料：共有画像${AUDIO_FREE_COLORS}色・${AUDIO_FREE_COLUMNS}列・基本4音色（矩形波、三角波、のこぎり波、ノイズ）。リワード有効中：共有画像${AUDIO_REWARD_COLORS}色・最大${AUDIO_REWARD_COLUMNS}列・追加音色。透明色と未使用色は色数に含みません。期限後も追加内容は保持され、再生・WAV・保存・バックアップは利用できます。`
      : `音楽：最大${AUDIO_REWARD_COLUMNS}列。矩形波、三角波、のこぎり波、ノイズなどの音色を選べます。`);
    setText(settings.querySelector('#draw-music-timing'), `${describeDrawMusicProjection(state)}。音楽レイヤーだけを演奏します。画像のコマ切替では曲は変わりません。透明は無音。`);
    const pages = settings.querySelector('#draw-music-page'), frames = state.musicAnimation?.frames || [];
    const pageOptions = frames.map((frame,index) => ({ id:String(frame.id), label:`ページ ${index+1}` }));
    const currentOptions = [...pages.options];
    if (currentOptions.length !== pageOptions.length || currentOptions.some((option,index) => option.value !== pageOptions[index].id || option.textContent !== pageOptions[index].label)) {
      pages.replaceChildren(...pageOptions.map(({ id, label }) => { const option = document.createElement('option'); option.value=id; option.textContent=label; return option; }));
    }
    setValue(pages, state.musicPageId || '');
    setDisabled(pages, musicModel.readOnly || exporting);
    const pageIndex=frames.findIndex(frame=>frame.id===state.musicPageId);
    for (const action of ['add','copy','before','after','delete']) setDisabled(settings.querySelector(`#draw-music-page-${action}`), musicModel.readOnly || exporting || (action==='delete'&&frames.length<2) || (action==='before'&&pageIndex<1) || (action==='after'&&pageIndex>=frames.length-1));
    const preferences = draw.getOutputPreferences?.() || { includeMusic: false, includeAudio: true, loops: 1 };
    setChecked(settings.querySelector('#draw-music-output-layer'), preferences.includeMusic);
    setChecked(settings.querySelector('#draw-music-output-audio'), preferences.includeAudio);
    setValue(settings.querySelector('#draw-music-loops'), preferences.loops);
    renderOutputPreview();
    for(const id of ['#draw-music-output-layer','#draw-music-output-audio','#draw-music-loops']) setDisabled(settings.querySelector(id), exporting);
    if (musicModel.error) say(`${musicModel.error} 原本と音楽データは保持しています。`, { recovery: true });
    const id = selectedColorId(), slot = id ? state.link?.colorToSlot?.[id] : null;
    setValue(instrument, slot ? getAudioColorInstrument(state.song, id, slot) : '');
    setDisabled(instrument, musicModel.readOnly || !id || id.endsWith('00'));
    setDisabled(settings.querySelector('#draw-music-preview'), !instrument.value || instrument.disabled);
    setText(settings.querySelector('#draw-music-color'), id ? `${id.slice(5)}：${instrument.selectedOptions[0]?.textContent || '無音'}` : '透明：無音');
    for (const swatch of document.querySelectorAll('#draw-palette [data-color-index]')) {
      const index = Number(swatch.dataset.colorIndex), color = draw.getTimeline().palette[index];
      const key = color ? `rgba-${color.slice(1).toLowerCase().padEnd(8, 'f')}` : null;
      const slotId = key ? state.link?.colorToSlot?.[key] : null;
      const voice = slotId ? AUDIO_INSTRUMENTS.find(item => item.id === getAudioColorInstrument(state.song, key, slotId)) : null;
      const label = index < 0 ? '透明・無音' : `色 ${index + 1}・${voice?.name || '未割当。音色タブで設定できます'}`;
      const assigned = String(Boolean(voice));
      if (swatch.dataset.musicAssigned !== assigned) swatch.dataset.musicAssigned = assigned;
      if (swatch.title !== label) swatch.title = label;
      if (swatch.getAttribute('aria-label') !== label) swatch.setAttribute('aria-label', label);
    }
    for (const id of ['#draw-music-wav', '#draw-music-video']) setDisabled(settings.querySelector(id), exporting);
    draw.refreshAudioTimbrePanel?.();
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
  let renderedPreview = null;
  function renderOutputPreview() {
    const preview=settings.querySelector('#draw-music-output-preview'),timeline=draw.getTimeline();
    if (!timeline || !draw.getOutputFrame) return;
    const preferences = draw.getOutputPreferences?.() || { includeMusic: false, includeAudio: true, loops: 1 };
    const frameId = timeline.frames[0].id;
    if (renderedPreview?.timeline !== timeline || renderedPreview.frameId !== frameId || renderedPreview.includeMusic !== Boolean(preferences.includeMusic)) {
      const doc=draw.getOutputFrame(frameId, { includeMusic: preferences.includeMusic }),context=preview.getContext('2d');
      if (preview.width !== doc.width) preview.width=doc.width;
      if (preview.height !== doc.height) preview.height=doc.height;
      context.putImageData(new ImageData(new Uint8ClampedArray((doc.rgba || documentRgba({...doc,pixels:Array.from(doc.pixels)}))),doc.width,doc.height),0,0);
      renderedPreview = { timeline, frameId, includeMusic:Boolean(preferences.includeMusic) };
    }
    const loopSeconds = Number(state?.song?.loopTicks || 0) * 60 / Math.max(1, Number(state?.song?.tempo || 120)) / 480;
    setText(settings.querySelector('#draw-music-export-summary'), `動画の出力：音楽レイヤー${preferences.includeMusic ? 'あり' : 'なし'}・音声${preferences.includeAudio ? 'あり' : 'なし'}・${preferences.loops}回再生（約${(loopSeconds * preferences.loops).toFixed(1)}秒）。絵は設定したコマ時間で繰り返します。`);
  }
  scope.listen(settings.querySelector('#draw-music-output-layer'),'change',event=> { draw.setOutputPreferences?.({includeMusic:event.target.checked});renderOutputPreview(); });
  scope.listen(settings.querySelector('#draw-music-output-audio'),'change',event=> { draw.setOutputPreferences?.({includeAudio:event.target.checked});renderOutputPreview(); });
  scope.listen(settings.querySelector('#draw-music-loops'),'change',event=> { draw.setOutputPreferences?.({loops:Number(event.target.value)});renderOutputPreview(); });
  scope.listen(tempo, 'change', () => settingChange(value => changeDrawMusicTempo(value, Number(tempo.value))));
  scope.listen(instrument, 'change', () => settingChange(value => changeDrawMusicColor(value, { colorId: selectedColorId(), slotId: instrument.value ? value.link?.colorToSlot?.[selectedColorId()] || 'square' : null, instrument: instrument.value || null })));
  scope.listen(window, 'click', () => { if (isActive()) requestAnimationFrame(() => { if (!scope.disposed) refresh(); }); }, { capture: true });
  scope.listen(document, 'pointerdown', event => { if (!settings.contains(event.target)) settings.open = false; });
  scope.listen(settings.querySelector('#draw-music-preview'), 'click', async () => {
    try { if (instrument.value) await previewTimbre(instrument.value); } catch { say('音を試聴できませんでした。'); }
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
    feedbackDismissed = false;
    stopTimbrePreview();
    try {
      if (player.isPlaying || player.isStarting) { player.stop(); return; }
      state = projected(); const token = epoch;
      if (await player.play(state.song)) { if (!isActive() || token !== epoch) player.stop(); else paintPosition(); }
      else say('まだ音がありません。描く色に音を割り当ててください。', { voice: true });
    } catch (error) { say(`再生できませんでした：${error.message}`, { voice: !musicModel.readOnly }); }
  });
  scope.listen(settings.querySelector('#draw-music-stop-loop'), 'click', () => { player.stopAfterCurrentLoop(); });
  async function output(kind) {
    if (exporting || !isActive()) return;
    draw.suspend(); player.stop(); state = projected();
    const source = state, timeline = draw.getTimeline(), token = epoch, preferences = draw.getOutputPreferences?.() || { includeMusic: false, includeAudio: true, loops: 1 };
    const includeMusic = Boolean(preferences.includeMusic), includeAudio = Boolean(preferences.includeAudio), loops = preferences.loops;
    const unchanged = () => isActive() && !scope.disposed && token === epoch && state === source && draw.getTimeline() === timeline
      && JSON.stringify(draw.getOutputPreferences?.() || preferences) === JSON.stringify(preferences);
    exporting = true; refresh();
    try {
      const workspace = draw.workspace;
      await workspace.assertCanSave(); if (!unchanged()) return;
      let result, filename;
      if (kind === 'wav') { const { renderAudioWav } = await import('./audio-export.mjs?rev=20261024-free-tools-1'); if (!unchanged()) return; result = await renderAudioWav(source.song, { loops }); filename = `pixieed-dot-music-${Math.round(result.seconds)}s.wav`; }
      else {
        const { renderAudioVideo } = await import('./audio-video.mjs?rev=20261016-color-capability-1'); if (!unchanged()) return; videoController = new AbortController();
        const frames = timeline.frames.map(frame => { const doc = draw.getOutputFrame(frame.id, { includeMusic }); return { width: doc.width, height: doc.height, rgba: new Uint8ClampedArray((doc.rgba || documentRgba({ ...doc, pixels: Array.from(doc.pixels) }))) }; });
        result = await renderAudioVideo(source.song, frames[0], { totalPlays: loops, frameImages: frames, frameDurationsMs: timeline.frames.map(frame=>frame.durationMs), includeAudio, signal: videoController.signal });
        filename = `pixieed-dot-music-${Math.round(result.seconds)}s.${result.extension}`;
      }
      if (!unchanged()) return;
      if (kind === 'video') say(`動画を準備しました：音楽レイヤー${includeMusic ? 'あり' : 'なし'}・音声${includeAudio ? 'あり' : 'なし'}・${loops}回再生。`);
      const staged = await sendToolOutputAfterSaving({ blob: result.blob, filename, returnUrl: () => `${location.pathname}${location.search}`, title: kind === 'wav' ? '音を確認' : '動画を確認', source: 'ドットで音楽', metadata: { durationSeconds: result.seconds, loops, ...(kind==='video'? {includeMusicLayer:includeMusic,includeAudio:result.hasAudio,visualFrameDurationsMs:timeline.frames.map(frame=>frame.durationMs)}:{}) } }, workspace, unchanged);
      if (!staged.ok && staged.reason === 'embedded_native_save') {
        const saved = await saveFile(result.blob, filename);
        const label = kind === 'wav' ? 'WAV' : '動画';
        say(saved === 'cancelled' ? `${label}の保存をキャンセルしました。`
          : saved === 'shared' ? `${label}を共有画面に渡しました。`
            : `${label}のダウンロードを開始しました。`);
        return;
      }
      if (!staged.ok && staged.reason !== 'source_changed') say(staged.error?.message || '出力画面を開けませんでした。作品は保持しています。');
    } finally { exporting = false; videoController = null; refresh(); }
  }
  for (const kind of ['wav', 'video']) scope.listen(settings.querySelector(`#draw-music-${kind}`), 'click', () => void output(kind).catch(error => { if (error.name !== 'AbortError') say(error.message); }));
  function suspend() { draw.setAudioTimbreApi?.(null); epoch++; settings.open = false; videoController?.abort(); stopTimbrePreview(); player.stop(); void player.dispose(); position.hidden = true; }
  scope.listen(document, 'visibilitychange', () => {
    if (document.hidden) suspend();
    else if (isActive()) { draw.setAudioTimbreApi?.(timbreApi); refresh(); }
  });
  scope.listen(window, 'pagehide', suspend);
  scope.add(suspend);
  return { get workspace() { return draw.workspace; }, nodes: [settings.closest('.px-tool-header-slot') || settings, play, position, feedback], suspend, timbreApi,
    resume() { draw.setAudioTimbreApi?.(timbreApi); musicModel.selectMusicLayer(); changed(); },
    importImage(image) { draw.importImage(image); changed(); },
    getImage: () => draw.getImage()
  };
}
