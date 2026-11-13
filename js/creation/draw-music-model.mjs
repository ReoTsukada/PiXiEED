import { estimateRetainedAnimationBytes } from './animation-core.mjs?rev=20261113-canvas1028-shared-2';
import {
  addDrawMusicPage, changeDrawMusicTempo, createDrawMusicState, createDrawMusicTrackState,
  describeDrawMusicProjection,
  getDrawMusicPageDocument, moveDrawMusicPage, projectDrawMusic, removeDrawMusicPage,
  selectDrawMusicPage, writeDrawMusicProject
} from './draw-music-core.mjs?rev=20261113-canvas1028-shared-2';
import { planSharedProjectSettings } from './shared-project-core.mjs?rev=20261113-canvas1028-shared-2';
import { setPxdJson } from './pxd-codec.mjs';
import { hasSiteReward, isSiteRewardPolicyEnabled, requireSiteReward } from '../ads/site-reward.mjs?rev=20261024-free-tools-1';
import { preservesAudioRewardContent, preservesAudioRewardPaletteContent } from './audio-reward-policy.mjs?rev=20261113-canvas1028-shared-2';

const AUDIO_STATE_PATH = 'audio/state.json';
const largeCanvas = value => value?.width > 256 || value?.height > 256;
const LARGE_CANVAS_MUSIC_NOTICE = '音楽は256px以下に対応しています。256pxを超える作品では音楽の編集を停止し、元の曲・音楽ページをそのまま保存します。Drawとカメラは引き続き使えます。';
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

function preservesAudioRewardState(before, after) {
  if (!before || !after) return true;
  if (!preservesAudioRewardContent(before.song, after.song)) return false;
  if (!preservesAudioRewardPaletteContent(before.animation, before.link, after.animation, after.link)) return false;
  if (before.musicAnimation || after.musicAnimation) {
    return preservesAudioRewardPaletteContent(before.musicAnimation || before.animation, before.link,
      after.musicAnimation || after.animation, after.link);
  }
  return true;
}

const musicObjectByteCache = new WeakMap();
// Conservative logical estimate, not a browser heap measurement. Avoid building
// a large JSON string; immutable model values are measured once per identity.
function estimatedMusicObjectBytes(value) {
  if(musicObjectByteCache.has(value))return musicObjectByteCache.get(value);
  const seen=new Set(),pending=[value];let bytes=0;
  while(pending.length){const item=pending.pop();if(item===null||item===undefined)continue;
    if(typeof item==='string'){bytes+=item.length*2+24;continue;}
    if(typeof item!=='object'){bytes+=8;continue;}
    if(seen.has(item))continue;seen.add(item);bytes+=64;
    if(ArrayBuffer.isView(item)){bytes+=item.byteLength;continue;}
    for(const key in item)if(Object.hasOwn(item,key)){bytes+=key.length*2+16;pending.push(item[key]);}
    if(bytes>64*1024*1024){musicObjectByteCache.set(value,Infinity);return Infinity;}
  }
  musicObjectByteCache.set(value,bytes);return bytes;
}

/** Extra logical Music retention, excluding cells already charged to shared Art history. */
export function estimateSharedMusicRetainedBytes({states=[],artTimelines=[],extraTimelines=[],project=null,signature=''}={}) {
  const unique=[...new Set(states.filter(Boolean))],jsonObjects=new Set();let bytes=16*1024+signature.length*2;
  for(const state of unique)for(const value of [state.song,state.link,state.originalSong,state.originalLink]) {
    if(value&&!jsonObjects.has(value)){jsonObjects.add(value);bytes+=estimatedMusicObjectBytes(value);}
  }
  const music=unique.map(value=>value.musicAnimation).filter(Boolean);
  bytes+=Math.max(0,estimateRetainedAnimationBytes([...new Set([...artTimelines,...extraTimelines,...music])])-estimateRetainedAnimationBytes([...new Set(artTimelines)]));
  for(const entry of project?.entries||[])if(entry.path.startsWith('audio/')||entry.path.startsWith('animations/audio/')||entry.path.startsWith('images/audio/')||entry.path.startsWith('legacy/')||entry.path.startsWith('animations/legacy/')||entry.path.startsWith('animations/audio-legacy-editor/')||entry.path.startsWith('images/audio-legacy-editor/'))bytes+=(entry.bytes?.byteLength||0)+512;
  return bytes+unique.length*1024;
}

/**
 * Keep audio data synchronized with Draw history without creating a player or UI.
 * Call this before mounting the lazy music editor so the initial page snapshot is
 * part of the clean project baseline rather than an Undoable user edit.
 */
export async function mountDrawMusicModel({ draw, scope, rewardPolicy = null } = {}) {
  if (!draw?.getTimeline || !draw?.subscribe || !draw?.attachProjectHooks || !scope?.add) {
    throw new TypeError('Draw music model requires a Draw API and lifecycle scope');
  }

  let state = null;
  let memoryReady=false,memoryCache=null;
  let suspendedForLargeCanvas = false, priorReadOnlyReason = '', retainedProject = null, resumePromise = null;
  let readOnlyReason = '';
  let disposed = false;
  let projectUnsubscribe = null;
  let lastTimeline = null;
  let lastAudioSignature = '';
  let snapshots = new WeakMap();
  let leasedTimelines = new WeakSet();
  let openSequence = 0;
  let lastAcceptedTimelineSnapshot = null;
  let restoringDeniedTimeline = false;
  const listeners = new Set();
  const rewardEnabled = () => rewardPolicy?.isEnabled?.() ?? isSiteRewardPolicyEnabled();
  const rewardEntitled = () => rewardPolicy?.hasReward?.() ?? hasSiteReward();
  const requestAudioReward = () => rewardPolicy?.require ? rewardPolicy.require('audio') : requireSiteReward('audio');

  function setReadOnly(reason = '') {
    readOnlyReason = String(reason || '');
    draw.setMusicReadOnly?.(readOnlyReason);
  }

  function planMusicSettings(settings = {}) {
    if (largeCanvas(settings) || largeCanvas(draw.getTimeline())) return { summary: { croppedPixels: 0, musicImpact: LARGE_CANVAS_MUSIC_NOTICE } };
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

  function validateMusicTimeline({ before, after, rewardActive: operationLease } = {}) {
    if (!after || !state || largeCanvas(after) || suspendedForLargeCanvas) return true;
    const lease = typeof operationLease === 'boolean' ? operationLease : rewardEntitled();
    if (!rewardEnabled()) return true;
    let candidate = snapshots.get(after);
    try { candidate ||= projectDrawMusic(state, after); }
    catch {
      if (lease) { leasedTimelines.add(after); return true; }
      requestAudioReward();
      draw.setMusicRewardStatus?.('この描画変更は音楽ページへ安全に反映できないため、追加機能の更新後に適用できます。');
      return false;
    }
    if (lease) {
      snapshots.set(after, candidate);
      leasedTimelines.add(after);
      return true;
    }
    if (!preservesAudioRewardState(state, candidate)) {
      requestAudioReward();
      draw.setMusicRewardStatus?.('期限切れの追加音色・追加列は変更できません。リワードを更新してください。');
      return false;
    }
    // Cache only the exact candidate the Draw API is about to commit.
    snapshots.set(after, candidate);
    return true;
  }

  function install(next, timeline = draw.getTimeline(), { emit = true } = {}) {
    if (!next || !timeline) return state;
    const previousSignature = lastAudioSignature || audioSignature(state);
    state = { ...next, animation: timeline };
    snapshots.set(timeline, state);
    lastTimeline = timeline;
    lastAudioSignature = audioSignature(state);
    lastAcceptedTimelineSnapshot = draw.snapshotTimeline?.() ?? null;
    if (emit) notify(previousSignature !== lastAudioSignature);
    return state;
  }

  function resolveTimeline(timeline) {
    if (largeCanvas(timeline)) {
      if (!suspendedForLargeCanvas) { priorReadOnlyReason = readOnlyReason; suspendedForLargeCanvas = true; setReadOnly(LARGE_CANVAS_MUSIC_NOTICE); notify(true); }
      // Retain the last supported music snapshot; never project 512px into it.
      return state;
    }
    if (suspendedForLargeCanvas && timeline) {
      suspendedForLargeCanvas = false; setReadOnly(priorReadOnlyReason);
      if (!state && !resumePromise) {
        resumePromise = onOpen(retainedProject, timeline, { requireCurrent: true }).finally(() => {
          resumePromise = null;
          if (!disposed && !state) { suspendedForLargeCanvas = true; setReadOnly(LARGE_CANVAS_MUSIC_NOTICE); }
        });
        return state;
      }
    }
    if (!state || !timeline || restoringDeniedTimeline) return state;
    if (timeline === lastTimeline) { leasedTimelines.delete(timeline); return state; }
    const beforeSignature = lastAudioSignature || audioSignature(state);
    let candidate;
    if (snapshots.has(timeline)) {
      candidate = snapshots.get(timeline);
    } else if (!readOnlyReason) {
      try { candidate = projectDrawMusic(state, timeline); }
      catch (error) {
        setReadOnly(error?.message || 'この作品の音楽を安全に同期できません。');
        candidate = { ...state, animation: timeline };
      }
    } else {
      // A failed legacy-page migration never reprojects the song from artwork.
      candidate = { ...state, animation: timeline };
    }
    const operationLease = leasedTimelines.has(timeline);
    leasedTimelines.delete(timeline);
    if (rewardEnabled() && !operationLease && !rewardEntitled()
        && !preservesAudioRewardState(state, candidate)) {
      requestAudioReward();
      // Draw applies pointer edits before notifying subscribers. Restore the
      // exact accepted session snapshot so denied music-layer edits cannot
      // leave image/history state diverged from the unchanged song.
      if (lastAcceptedTimelineSnapshot && draw.restoreTimelineSnapshot) {
        restoringDeniedTimeline = true;
        try { draw.restoreTimelineSnapshot(lastAcceptedTimelineSnapshot); }
        finally { restoringDeniedTimeline = false; }
      }
      draw.setMusicRewardStatus?.('期限切れの追加音色・追加列は変更できません。リワードを更新してください。');
      return state;
    }
    state = candidate;
    snapshots.set(timeline, state);
    lastTimeline = timeline;
    lastAudioSignature = audioSignature(state);
    lastAcceptedTimelineSnapshot = draw.snapshotTimeline?.() ?? null;
    notify(beforeSignature !== lastAudioSignature);
    return state;
  }

  async function onOpen(project, timeline, { requireCurrent = false } = {}) {
    if (disposed || !timeline) return;
    const sequence = ++openSequence;
    retainedProject = project;
    suspendedForLargeCanvas = false; priorReadOnlyReason = '';
    const hadLoadedState = Boolean(state);
    state = null; lastTimeline = null; lastAudioSignature = ''; snapshots = new WeakMap(); leasedTimelines = new WeakSet(); lastAcceptedTimelineSnapshot = null;
    setReadOnly('');
    // A new project replaces the current playback source immediately. Views
    // can stop the old player while the new baseline is being prepared.
    if (hadLoadedState) notify(true);
    if (largeCanvas(timeline)) {
      suspendedForLargeCanvas = true; setReadOnly(LARGE_CANVAS_MUSIC_NOTICE); notify(false); return;
    }
    try {
      const loaded = await createDrawMusicTrackState(project, timeline);
      if (disposed || sequence !== openSequence || (requireCurrent && draw.getTimeline() !== timeline)) return;
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
    if (suspendedForLargeCanvas || largeCanvas(timeline)) {
      // Save pending supported-size music edits without projecting the large art.
      const next = resolved?.musicTrackMode && !priorReadOnlyReason
        ? await writeDrawMusicProject(project, resolved, { imageRole })
        : resolved?.hasStoredAudio && priorReadOnlyReason ? setPxdJson(project, AUDIO_STATE_PATH, resolved.song) : project;
      retainedProject = next; return next;
    }
    if (!resolved) return project;
    if (readOnlyReason) {
      // Do not rewrite audio links, pages, images, or future fields when a
      // project cannot be migrated losslessly. Only persist an allowed tempo edit.
      if (!resolved.hasStoredAudio) return project;
      return setPxdJson(project, AUDIO_STATE_PATH, resolved.song);
    }
    return writeDrawMusicProject(project, resolved, { imageRole });
  }

  function retainedMemoryBytes() {
    if (disposed) return null;
    if (!memoryReady || resumePromise) return Infinity;
    const history=draw.snapshotTimeline?.()?.session?.timeline;
    const art=history?[...history.past,history.current,...history.future]:[draw.getTimeline()];
    const accepted=lastAcceptedTimelineSnapshot?.session?.timeline;
    const extra=[...(accepted?[...accepted.past,accepted.current,...accepted.future]:[]),state?.animation,lastTimeline].filter(Boolean);
    const keys=[state,retainedProject,lastAudioSignature,lastTimeline,...art,...extra];
    if(memoryCache&&keys.length===memoryCache.keys.length&&keys.every((value,index)=>value===memoryCache.keys[index]))return memoryCache.bytes;
    const values=[state,...[...new Set([...art,...extra,lastTimeline])].filter(Boolean).map(timeline=>snapshots.get(timeline))];
    const bytes=estimateSharedMusicRetainedBytes({states:values,artTimelines:art,extraTimelines:extra,project:retainedProject,signature:lastAudioSignature});
    memoryCache={keys,bytes};return bytes;
  }
  const clearMemoryEstimator=draw.setMusicMemoryEstimator?.(retainedMemoryBytes);
  const hooks = { async onOpen(...args) {memoryReady=false;memoryCache=null;await onOpen(...args);memoryReady=true;}, onSave };
  draw.setMusicSettingsPlanner?.(planMusicSettings);
  const clearTimelineValidator = draw.setMusicTimelineValidator?.(validateMusicTimeline);
  const unsubscribeDraw = draw.subscribe(() => resolveTimeline(draw.getTimeline()));
  scope.add(() => {
    disposed = true;
    unsubscribeDraw?.();
    projectUnsubscribe?.();
    draw.setMusicSettingsPlanner?.(null);
    clearTimelineValidator?.();
    clearMemoryEstimator?.();
    listeners.clear();
  });

  try { projectUnsubscribe = await draw.attachProjectHooks(hooks); }
  catch (error) {
    setReadOnly(error?.message || '音楽データを読み込めませんでした。');
  }

  function change(transform) {
    if (suspendedForLargeCanvas || largeCanvas(draw.getTimeline())) throw new Error(LARGE_CANVAS_MUSIC_NOTICE);
    if (typeof transform !== 'function') throw new TypeError('音楽の変更処理が必要です。');
    const timeline = draw.getTimeline();
    const current = resolveTimeline(timeline);
    if (!current) throw new TypeError('音楽状態がまだ読み込まれていません。');
    const next = transform(current);
    if (!next || typeof next !== 'object') throw new TypeError('音楽状態を更新できません。');
    if (readOnlyReason && (!current.hasStoredAudio || !onlyTempoChanged(current, next))) {
      throw new Error(`${readOnlyReason} 音楽ページや色の割り当ては変更できません。`);
    }
    if (rewardEnabled() && !rewardEntitled()
        && !preservesAudioRewardState(current, next)) {
      requestAudioReward();
      throw new Error('期限切れの追加音色・追加列は変更できません。リワードを更新してください。');
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
    const current = resolveTimeline(draw.getTimeline());
    if (rewardEnabled() && !rewardEntitled()
        && !preservesAudioRewardState(current, next)) {
      requestAudioReward();
      throw new Error('期限切れの追加音色・追加列は変更できません。リワードを更新してください。');
    }
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
    dispose() { disposed = true; unsubscribeDraw?.(); projectUnsubscribe?.(); draw.setMusicSettingsPlanner?.(null); clearTimelineValidator?.(); clearMemoryEstimator?.(); listeners.clear(); }
  };
}
