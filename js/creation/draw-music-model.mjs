import {
  addDrawMusicPage, changeDrawMusicTempo, createDrawMusicState, createDrawMusicTrackState,
  describeDrawMusicProjection,
  getDrawMusicPageDocument, moveDrawMusicPage, projectDrawMusic, removeDrawMusicPage,
  selectDrawMusicPage, writeDrawMusicProject
} from './draw-music-core.mjs';
import { planSharedProjectSettings } from './shared-project-core.mjs';
import { setPxdJson } from './pxd-codec.mjs';

const AUDIO_STATE_PATH = 'audio/state.json';
function json(value) {
  try { return JSON.stringify(value); } catch { return ''; }
}

function audioSignature(state) {
  if (!state) return '';
  const link = state.link ? { ...state.link,
    ...(state.link.musicTrack ? { musicTrack: { ...state.link.musicTrack, pageId: undefined } } : {}) } : null;
  return json({ song: state.song, link });
}

function onlyTempoChanged(before, after) {
  if (!before?.song || !after?.song || !Number.isInteger(after.song.tempo)) return false;
  const oldSong = { ...before.song, tempo: after.song.tempo };
  return json(oldSong) === json(after.song)
    && json({ ...before, song: undefined }) === json({ ...after, song: undefined });
}

/**
 * Keep audio data synchronized with Draw history without creating a player or UI.
 * Call this before mounting the lazy music editor so the initial page snapshot is
 * part of the clean project baseline rather than an Undoable user edit.
 */
export async function mountDrawMusicModel({ draw, scope } = {}) {
  if (!draw?.getTimeline || !draw?.subscribe || !draw?.attachProjectHooks || !scope?.add) {
    throw new TypeError('Draw music model requires a Draw API and lifecycle scope');
  }

  let state = null;
  let readOnlyReason = '';
  let disposed = false;
  let projectUnsubscribe = null;
  let lastTimeline = null;
  let lastAudioSignature = '';
  let snapshots = new WeakMap();
  let openSequence = 0;
  const listeners = new Set();

  function setReadOnly(reason = '') {
    readOnlyReason = String(reason || '');
    draw.setMusicReadOnly?.(readOnlyReason);
  }

  function planMusicSettings(settings = {}) {
    const current = refresh();
    if (!current) return null;
    if (readOnlyReason || !current.musicTrackMode || !current.musicAnimation) {
      return { summary: { croppedPixels: 0,
        musicImpact: '旧形式の音楽データは変更せず保持します。キャンバス設定の変更は音楽ページへ適用されません。' } };
    }
    const plan = planSharedProjectSettings(current.musicAnimation, settings);
    const after = describeDrawMusicProjection({ ...current, animation: plan.animation, musicAnimation: plan.animation });
    const before = describeDrawMusicProjection(current);
    const pageCount = current.musicAnimation.frames.length;
    const dimensions = `${current.musicAnimation.width}×${current.musicAnimation.height}px → ${plan.animation.width}×${plan.animation.height}px`;
    const widthImpact = plan.animation.width !== current.musicAnimation.width
      ? '横幅変更により列の時刻配分を再計算します。' : '列の時刻配分は維持します。';
    const heightImpact = plan.animation.height !== current.musicAnimation.height
      ? '高さ変更により音高範囲を再計算します。' : '音高範囲は維持します。';
    const colorImpact = plan.summary.remappedColors
      ? `${plan.summary.remappedColors}色の割当が変わるため、対応する音色を再確認してください。`
      : '色の音割当は維持します。';
    const cropImpact = plan.summary.croppedPixels
      ? `${plan.summary.croppedPixels}個の非透明画素が全${pageCount}ページで切り取られます。`
      : '音楽ページの画素は切り取られません。';
    return { summary: { croppedPixels: plan.summary.croppedPixels,
      musicImpact: `全${pageCount}ページに適用（${dimensions}）。${widthImpact}${heightImpact}${colorImpact}${cropImpact}音楽情報: ${before} → ${after}` } };
  }

  function notify(audioChanged = false) {
    for (const listener of [...listeners]) {
      try { listener({ state, audioChanged, readOnly: Boolean(readOnlyReason), error: readOnlyReason }); }
      catch { /* A view subscriber must not break Draw history. */ }
    }
  }

  function install(next, timeline = draw.getTimeline(), { emit = true } = {}) {
    if (!next || !timeline) return state;
    const previousSignature = lastAudioSignature || audioSignature(state);
    state = { ...next, animation: timeline };
    snapshots.set(timeline, state);
    lastTimeline = timeline;
    lastAudioSignature = audioSignature(state);
    if (emit) notify(previousSignature !== lastAudioSignature);
    return state;
  }

  function resolveTimeline(timeline) {
    if (!state || !timeline || timeline === lastTimeline) return state;
    const beforeSignature = lastAudioSignature || audioSignature(state);
    if (snapshots.has(timeline)) {
      state = snapshots.get(timeline);
    } else if (!readOnlyReason) {
      try { state = projectDrawMusic(state, timeline); }
      catch (error) {
        setReadOnly(error?.message || 'この作品の音楽を安全に同期できません。');
        state = { ...state, animation: timeline };
      }
      snapshots.set(timeline, state);
    } else {
      // A failed legacy-page migration never reprojects the song from artwork.
      state = { ...state, animation: timeline };
      snapshots.set(timeline, state);
    }
    lastTimeline = timeline;
    lastAudioSignature = audioSignature(state);
    notify(beforeSignature !== lastAudioSignature);
    return state;
  }

  async function onOpen(project, timeline) {
    if (disposed || !timeline) return;
    const sequence = ++openSequence;
    const hadLoadedState = Boolean(state);
    state = null; lastTimeline = null; lastAudioSignature = ''; snapshots = new WeakMap();
    setReadOnly('');
    // A new project replaces the current playback source immediately. Views
    // can stop the old player while the new baseline is being prepared.
    if (hadLoadedState) notify(true);
    try {
      const loaded = await createDrawMusicTrackState(project, timeline);
      if (disposed || sequence !== openSequence) return;
      if (typeof draw.applyMusicPage !== 'function') throw new TypeError('音楽ページを読み込む機能がありません。');
      const pageDocument = getDrawMusicPageDocument(loaded, loaded.musicPageId);
      let prepared = false;
      await draw.applyMusicPage(pageDocument, {
        record: false,
        select: false,
        prepareTimeline(nextTimeline) {
          prepared = true;
          snapshots.set(nextTimeline, { ...loaded, animation: nextTimeline });
        }
      });
      if (disposed || sequence !== openSequence) return;
      const current = draw.getTimeline() || timeline;
      const baseline = snapshots.get(current) || { ...loaded, animation: current };
      if (!prepared || !snapshots.has(current)) snapshots.set(current, baseline);
      install(baseline, current, { emit: false });
    } catch (error) {
      if (disposed || sequence !== openSequence) return;
      // Keep the stored song intact and let artwork editing continue. The
      // settings UI can still permit a tempo-only edit when a stored song exists.
      try { state = createDrawMusicState(project, timeline); }
      catch { state = createDrawMusicState(null, timeline); }
      setReadOnly(error?.message || 'このPXDの音楽を損失なく共有編集へ移せません。音楽は保持されています。');
      install({ ...state, projected: false }, draw.getTimeline() || timeline, { emit: false });
    }
    notify(false);
  }

  async function onSave(project, timeline, { imageRole = 'main' } = {}) {
    const resolved = resolveTimeline(timeline);
    if (!resolved) return project;
    if (readOnlyReason) {
      // Do not rewrite audio links, pages, images, or future fields when a
      // project cannot be migrated losslessly. Only persist an allowed tempo edit.
      if (!resolved.hasStoredAudio) return project;
      return setPxdJson(project, AUDIO_STATE_PATH, resolved.song);
    }
    return writeDrawMusicProject(project, resolved, { imageRole });
  }

  const hooks = { onOpen, onSave };
  draw.setMusicSettingsPlanner?.(planMusicSettings);
  const unsubscribeDraw = draw.subscribe(() => resolveTimeline(draw.getTimeline()));
  scope.add(() => {
    disposed = true;
    unsubscribeDraw?.();
    projectUnsubscribe?.();
    draw.setMusicSettingsPlanner?.(null);
    listeners.clear();
  });

  try { projectUnsubscribe = await draw.attachProjectHooks(hooks); }
  catch (error) {
    setReadOnly(error?.message || '音楽データを読み込めませんでした。');
  }

  function change(transform) {
    if (typeof transform !== 'function') throw new TypeError('音楽の変更処理が必要です。');
    const timeline = draw.getTimeline();
    const current = resolveTimeline(timeline);
    if (!current) throw new TypeError('音楽状態がまだ読み込まれていません。');
    const next = transform(current);
    if (!next || typeof next !== 'object') throw new TypeError('音楽状態を更新できません。');
    if (readOnlyReason && (!current.hasStoredAudio || !onlyTempoChanged(current, next))) {
      throw new Error(`${readOnlyReason} 音楽ページや色の割り当ては変更できません。`);
    }
    if (json(next.song) === json(current.song) && json(next.link) === json(current.link)) return current;
    if (typeof draw.commitMetadata !== 'function') throw new TypeError('Undo対応の音楽変更がありません。');
    const beforeSignature = lastAudioSignature || audioSignature(current);
    draw.commitMetadata((nextTimeline) => {
      snapshots.set(nextTimeline, { ...next, animation: nextTimeline });
    });
    const nextTimeline = draw.getTimeline();
    const applied = snapshots.get(nextTimeline) || { ...next, animation: nextTimeline };
    state = applied; lastTimeline = nextTimeline; lastAudioSignature = audioSignature(applied);
    notify(beforeSignature !== lastAudioSignature);
    return state;
  }

  async function applyPage(next) {
    if (readOnlyReason) throw new Error(`${readOnlyReason} 音楽ページは変更できません。`);
    if (typeof draw.applyMusicPage !== 'function') throw new TypeError('音楽ページを描画へ適用できません。');
    const pageDocument = getDrawMusicPageDocument(next, next.musicPageId);
    const beforeSignature = lastAudioSignature || audioSignature(state);
    await draw.applyMusicPage(pageDocument, {
      record: true,
      select: true,
      prepareTimeline(nextTimeline) {
        snapshots.set(nextTimeline, { ...next, animation: nextTimeline });
      }
    });
    const timeline = draw.getTimeline();
    const applied = snapshots.get(timeline) || { ...next, animation: timeline };
    state = applied; snapshots.set(timeline, applied); lastTimeline = timeline;
    lastAudioSignature = audioSignature(applied);
    notify(beforeSignature !== lastAudioSignature);
    return state;
  }

  function selectPage(pageId) {
    const current = resolveTimeline(draw.getTimeline());
    if (!current) throw new TypeError('音楽状態がまだ読み込まれていません。');
    if (readOnlyReason) throw new Error(`${readOnlyReason} 音楽ページは変更できません。`);
    return applyPage(selectDrawMusicPage(current, pageId));
  }

  function addPage(options) {
    const current = resolveTimeline(draw.getTimeline());
    if (!current) throw new TypeError('音楽状態がまだ読み込まれていません。');
    if (readOnlyReason) throw new Error(`${readOnlyReason} 音楽ページは変更できません。`);
    return applyPage(addDrawMusicPage(current, options));
  }

  function movePage(pageId, index) {
    const current = resolveTimeline(draw.getTimeline());
    if (!current) throw new TypeError('音楽状態がまだ読み込まれていません。');
    if (readOnlyReason) throw new Error(`${readOnlyReason} 音楽ページは変更できません。`);
    return applyPage(moveDrawMusicPage(current, pageId, index));
  }

  function removePage(pageId) {
    const current = resolveTimeline(draw.getTimeline());
    if (!current) throw new TypeError('音楽状態がまだ読み込まれていません。');
    if (readOnlyReason) throw new Error(`${readOnlyReason} 音楽ページは変更できません。`);
    // The core rejects deleting the final page; preserve its typed error and
    // leave the shared Draw timeline untouched.
    return applyPage(removeDrawMusicPage(current, pageId));
  }

  function selectMusicLayer() {
    if (readOnlyReason) return false;
    return draw.selectMusicLayer?.() ?? false;
  }

  function refresh() { return resolveTimeline(draw.getTimeline()); }

  return {
    getState: () => refresh(),
    get readOnly() { return Boolean(readOnlyReason); },
    get error() { return readOnlyReason; },
    subscribe(listener) { if (typeof listener !== 'function') throw new TypeError('音楽更新の通知先が必要です。'); listeners.add(listener); return () => listeners.delete(listener); },
    change,
    changeTempo(tempo) { return change((current) => changeDrawMusicTempo(current, tempo)); },
    selectPage,
    addPage,
    movePage,
    removePage,
    selectMusicLayer,
    refresh,
    dispose() { disposed = true; unsubscribeDraw?.(); projectUnsubscribe?.(); draw.setMusicSettingsPlanner?.(null); listeners.clear(); }
  };
}
