import { AUDIO_PPQ, collectAudioEvents, createAudioPlayer } from './audio-core.mjs?rev=20261016-color-capability-1';
import { getAudioInstrument } from './audio-timbres.mjs?rev=20261005-audio-drums-1';
import { createMusicVideoTimingPlan, sampleMusicVideoFrame } from './music-video-timing.mjs';

const VIDEO_FRAME_LONG_EDGE = 1024;
const VIDEO_FRAME_MAX_EDGE = 1024;
export const AUDIO_VIDEO_MAX_SECONDS = 120;

export function audioVideoFrameSize(width, height, { longEdge = VIDEO_FRAME_LONG_EDGE, maxEdge = VIDEO_FRAME_MAX_EDGE } = {}) {
  if (![width, height, longEdge, maxEdge].every(Number.isInteger) || width < 1 || height < 1 || longEdge < 1 || maxEdge < longEdge || maxEdge > 2048) throw new RangeError('動画の画像サイズが不正です。');
  const longest = Math.max(width, height);
  const scale = Math.max(1, Math.min(Math.floor(maxEdge / longest), Math.ceil(longEdge / longest)));
  return { width: width * scale, height: height * scale, scale };
}

export function chooseAudioVideoMimeType(MediaRecorderImpl = globalThis.MediaRecorder, { includeAudio = true } = {}) {
  if (typeof MediaRecorderImpl !== 'function') return null;
  if (typeof MediaRecorderImpl.isTypeSupported !== 'function') return null;
  const choices = includeAudio ? [
    ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'webm'],
    ['video/webm;codecs=vp8,opus', 'webm'],
    ['video/webm', 'webm']
  ] : [
    ['video/mp4;codecs=avc1.42E01E', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9', 'webm'],
    ['video/webm;codecs=vp8', 'webm'],
    ['video/webm', 'webm']
  ];
  return choices.find(([mimeType]) => MediaRecorderImpl.isTypeSupported(mimeType))?.reduce((result, value, index) => {
    if (index === 0) result.mimeType = value;
    if (index === 1) result.extension = value;
    return result;
  }, {}) || null;
}

function makeVideoCanvas(documentRef, image, frameSize, frameImages = [image], frameTicks = 0, loopTicks = 1) {
  const source = documentRef.createElement('canvas');
  source.width = image.width; source.height = image.height;
  const sourceContext = source.getContext('2d', { alpha: true });
  const pixels = sourceContext.createImageData(image.width, image.height);
  pixels.data.set(image.rgba);
  sourceContext.putImageData(pixels, 0, 0);

  const canvas = documentRef.createElement('canvas');
  canvas.width = frameSize.width; canvas.height = frameSize.height;
  const context = canvas.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = false;
  let lastFrame = -1;
  const draw = (progress, frameIndexOverride = null) => {
    const frameIndex = Number.isInteger(frameIndexOverride)
      ? Math.max(0, Math.min(frameImages.length - 1, frameIndexOverride))
      : Math.min(frameImages.length - 1, frameTicks > 0
      ? Math.floor(Math.max(0, Math.min(0.999999, progress)) * loopTicks / frameTicks)
      : Math.floor(Math.max(0, Math.min(0.999999, progress)) * frameImages.length));
    if (frameIndex !== lastFrame) {
      const frame = frameImages[frameIndex];
      const pixels = sourceContext.createImageData(frame.width, frame.height); pixels.data.set(frame.rgba); sourceContext.putImageData(pixels, 0, 0); lastFrame = frameIndex;
    }
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(canvas.width * progress)));
    context.fillStyle = 'rgba(255,255,255,.58)'; context.fillRect(x, 0, Math.max(1, Math.ceil(canvas.width / image.width)), canvas.height);
    context.fillStyle = 'rgba(28,34,42,.78)'; context.fillRect(x, 0, Math.max(1, Math.ceil(canvas.width / image.width) / 3), canvas.height);
  };
  draw(0);
  return { canvas, source, draw };
}

function createContextDestination(context, destination) {
  return new Proxy(context, { get(target, key) {
    if (key === 'destination') return destination;
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}

function abortError() {
  try { return new DOMException('動画の作成を中止しました。', 'AbortError'); }
  catch { const error = new Error('動画の作成を中止しました。'); error.name = 'AbortError'; return error; }
}

/** Record one complete loop with the same synthesizer used by playback. */
export async function renderAudioVideo(song, image, {
  totalPlays = 1,
  MediaRecorderImpl = globalThis.MediaRecorder,
  AudioContextImpl = globalThis.AudioContext || globalThis.webkitAudioContext,
  MediaStreamImpl = globalThis.MediaStream,
  documentRef = globalThis.document,
  playerFactory = createAudioPlayer,
  signal,
  onProgress = () => {},
  frameImages = null,
  frameTicks = null,
  frameDurationsMs = null,
  includeAudio = true,
  nowImpl = () => Date.now(),
  setTimeoutImpl = globalThis.setTimeout.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout.bind(globalThis),
  setIntervalImpl = globalThis.setInterval.bind(globalThis),
  clearIntervalImpl = globalThis.clearInterval.bind(globalThis)
} = {}) {
  if (typeof includeAudio !== 'boolean') throw new TypeError('音声の有無を指定してください。');
  const events = collectAudioEvents(song);
  if (includeAudio && !events.length) throw new Error('まだ音符がありません。');
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || !(image.rgba instanceof Uint8Array || image.rgba instanceof Uint8ClampedArray) || image.rgba.length !== image.width * image.height * 4) throw new TypeError('動画に使う絵を読み込めませんでした。');
  if (frameImages && (!Array.isArray(frameImages) || frameImages.length < 1 || frameImages.length > 128 || frameImages.some((frame) => frame.width !== image.width || frame.height !== image.height || !(frame.rgba instanceof Uint8Array || frame.rgba instanceof Uint8ClampedArray) || frame.rgba.length !== image.width * image.height * 4))) throw new TypeError('動画のコマを読み込めませんでした。');
  const visualFrames = frameImages || [image];
  let visualTimingPlan = null;
  if (frameDurationsMs !== null) {
    if (!Array.isArray(frameDurationsMs) || frameDurationsMs.length !== visualFrames.length) throw new TypeError('動画フレームの表示時間がコマ数と一致しません。');
    visualTimingPlan = createMusicVideoTimingPlan({
      loopTicks: song.loopTicks, tempo: song.tempo, ticksPerQuarter: AUDIO_PPQ, loops: totalPlays,
      frames: frameDurationsMs.map((durationMs, index) => ({ id: String(index), durationMs }))
    });
  }
  if (!includeAudio && !visualTimingPlan) throw new Error('音声なしの動画にはフレームごとの表示時間が必要です。');
  if (!MediaRecorderImpl || (includeAudio && !AudioContextImpl) || !MediaStreamImpl || !documentRef?.createElement) throw new Error('このブラウザーでは動画を作れません。PNGとWAVは引き続き保存できます。');
  const mime = chooseAudioVideoMimeType(MediaRecorderImpl, { includeAudio });
  if (!mime) throw new Error('このブラウザーは動画の保存に対応していません。PNGとWAVは引き続き保存できます。');
  if (signal?.aborted) throw abortError();

  const frameSize = audioVideoFrameSize(image.width, image.height);
  const loopSeconds = song.loopTicks * 60 / song.tempo / AUDIO_PPQ;
  if (!Number.isSafeInteger(totalPlays) || totalPlays < 1 || totalPlays > 8) throw new RangeError('音楽の再生回数は1〜8回です。');
  const durationSeconds = visualTimingPlan ? visualTimingPlan.musicDurationMs / 1000 : loopSeconds * totalPlays;
  if (!Number.isFinite(durationSeconds) || durationSeconds > AUDIO_VIDEO_MAX_SECONDS) throw new RangeError('この曲は長いため動画にできません。音楽を合計120秒以内にしてください。プロジェクト保存と再生は続けられます。');
  const releaseSeconds = includeAudio ? Math.max(0, ...events.map(({ instrument }) => { const profile = getAudioInstrument(instrument); return profile?.drum?.duration || profile?.release || 0; })) : 0;
  const tailMs = visualTimingPlan ? 0 : Math.ceil(releaseSeconds * 1000) + 80;
  const chunks = []; const allTracks = new Set();
  let canvas = null; let source = null; let draw = null; let canvasStream = null; let audioContext = null; let audioStream = null; let stream = null; let recorder = null;
  const scheduledTimers = new Set();
  let completionTimer = null; let watchdogTimer = null; let progressTimer = null; let player = null; let startedAt = 0;
  let settled = false; let startedRecording = false; let failure = null; let lastVisualFrameIndex = 0;
  const hiddenListener = () => { if (documentRef.visibilityState === 'hidden') finishError(abortError()); };
  let resolveRecording; let rejectRecording;
  const recording = new Promise((resolve, reject) => { resolveRecording = resolve; rejectRecording = reject; });
  recording.catch(() => {});
  const finishError = (error) => { if (settled) return; failure = error; settled = true; rejectRecording(error); };
  const onRecorderStop = () => {
    if (settled) return;
    if (!chunks.length) { finishError(new Error('このブラウザーでは動画を記録できませんでした。PNGとWAVは引き続き保存できます。')); return; }
    settled = true;
    const actualMime = recorder?.mimeType || mime.mimeType;
    resolveRecording({ blob: new Blob(chunks, { type: actualMime }), mimeType: actualMime, extension: actualMime.includes('mp4') ? 'mp4' : 'webm', seconds: durationSeconds, totalPlays, hasAudio: includeAudio, ...(visualTimingPlan ? { recordLeadMs: 35 } : {}), width: frameSize.width, height: frameSize.height });
  };
  const listen = (target, type, callback) => {
    if (typeof target.addEventListener === 'function') target.addEventListener(type, callback);
    else target[`on${type}`] = callback;
  };
  const onData = (event) => { if (event.data?.size) chunks.push(event.data); };
  const onError = (event) => finishError(event.error || new Error('動画を記録できませんでした。'));
  const abortListener = () => finishError(abortError());

  try {
    ({ canvas, source, draw } = makeVideoCanvas(documentRef, image, frameSize, visualFrames, frameTicks, song.loopTicks));
    if (typeof canvas.captureStream !== 'function') throw new Error('このブラウザーでは映像を記録できません。PNGとWAVは引き続き保存できます。');
    canvasStream = canvas.captureStream(visualTimingPlan ? 50 : 24);
    let routedContext = null;
    if (includeAudio) {
      audioContext = new AudioContextImpl({ latencyHint: 'playback' });
      const audioDestination = audioContext.createMediaStreamDestination();
      let playerDestination = audioDestination;
      if (audioContext.createGain) {
        const outputGain = audioContext.createGain(); outputGain.gain.value = 2.5;
        const compressor = audioContext.createDynamicsCompressor?.();
        if (compressor) {
          compressor.threshold.value = -3; compressor.knee.value = 6; compressor.ratio.value = 8; compressor.attack.value = 0.004; compressor.release.value = 0.18;
          outputGain.connect(compressor); compressor.connect(audioDestination);
        } else outputGain.connect(audioDestination);
        playerDestination = outputGain;
      }
      routedContext = createContextDestination(audioContext, playerDestination);
      audioStream = audioDestination.stream;
    }
    const tracks = [...canvasStream.getVideoTracks(), ...(audioStream?.getAudioTracks() ?? [])];
    for (const track of [...tracks, ...canvasStream.getTracks(), ...(audioStream?.getTracks() ?? [])]) allTracks.add(track);
    stream = new MediaStreamImpl(tracks);
    for (const track of stream.getTracks()) allTracks.add(track);
    recorder = new MediaRecorderImpl(stream, { mimeType: mime.mimeType, videoBitsPerSecond: 900_000, audioBitsPerSecond: 96_000 });
    listen(recorder, 'dataavailable', onData);
    listen(recorder, 'stop', onRecorderStop);
    listen(recorder, 'error', onError);
    signal?.addEventListener('abort', abortListener, { once: true });
    documentRef.addEventListener?.('visibilitychange', hiddenListener);
    recorder.start(1000);
    startedRecording = true;
    const recordingLeadMs = Math.ceil(durationSeconds * 1000) + 35;
    const completionDelayMs = visualTimingPlan ? recordingLeadMs : Math.ceil((durationSeconds + 0.035) * 1000 + tailMs);
    const watchdogDelayMs = visualTimingPlan
      ? completionDelayMs + 5000
      : Math.ceil((durationSeconds + 0.035) * 1000 + tailMs + 5000);
    watchdogTimer = setTimeoutImpl(() => finishError(new Error('動画の記録が時間内に完了しませんでした。もう一度お試しください。')), watchdogDelayMs);
    if (includeAudio) {
      player = playerFactory({
        audioContextFactory: () => routedContext,
        schedule: (callback, delay) => {
          let timer = null;
          timer = setTimeoutImpl(() => {
            scheduledTimers.delete(timer);
            if (!settled) callback();
          }, delay);
          scheduledTimers.add(timer);
          return timer;
        },
        cancel: (timer) => {
          if (timer === null) return;
          clearTimeoutImpl(timer);
          scheduledTimers.delete(timer);
        }
      });
      const played = await Promise.race([player.play(song), recording.then((result) => ({ recordingResult: result }))]);
      if (played?.recordingResult) return played.recordingResult;
      if (!played) throw new Error('この曲を動画にできませんでした。');
      if (signal?.aborted) throw abortError();
      if (failure) throw failure;
      if (typeof player.stopAfterCurrentLoop !== 'function' || (totalPlays === 1 && !player.stopAfterCurrentLoop())) throw new Error('曲の再生をループ終端で停止できませんでした。');
    }
    startedAt = nowImpl() + 35;
    completionTimer = setTimeoutImpl(() => {
      completionTimer = null;
      if (settled) return;
      draw(1, visualTimingPlan ? lastVisualFrameIndex : null);
      progressTimer !== null && clearIntervalImpl(progressTimer);
      progressTimer = null;
      player?.stop();
      if (recorder?.state === 'recording') recorder.stop();
    }, completionDelayMs);
    let lastTick = null; let completedLoops = 0;
    progressTimer = setIntervalImpl(() => {
      if (settled) return;
      // Keep the picture on the same clock as the scheduled notes. A wall
      // clock can drift from AudioContext.currentTime while a long recording
      // is under load, which makes the animation lead or lag the music.
      const tick = player?.currentTick;
      if (Number.isFinite(tick)) {
        if (lastTick !== null && tick < lastTick) {
          completedLoops += 1;
          if (completedLoops >= totalPlays - 1 && !player.stopAfterCurrentLoop()) finishError(new Error('曲の再生を指定回数で停止できませんでした。'));
        }
        lastTick = tick;
      }
      const progress = Number.isFinite(tick)
        ? Math.min(1, tick / song.loopTicks)
        : Math.min(1, (nowImpl() - startedAt) / (durationSeconds * 1000));
      if (visualTimingPlan) {
        const elapsedTicks = Number.isFinite(tick) ? completedLoops * song.loopTicks + tick : null;
        const musicTimeMs = !includeAudio || elapsedTicks === null
          ? Math.max(0, nowImpl() - startedAt)
          : elapsedTicks * 60_000 / song.tempo / AUDIO_PPQ;
        const sample = sampleMusicVideoFrame(visualTimingPlan, musicTimeMs);
        if (!sample.ended) {
          lastVisualFrameIndex = sample.frameIndex;
          draw(Math.min(1, musicTimeMs / visualTimingPlan.musicDurationMs), sample.frameIndex);
        }
        try { onProgress(Math.min(1, musicTimeMs / visualTimingPlan.musicDurationMs)); } catch {}
      } else {
        draw(progress);
        try { onProgress(progress); } catch {}
      }
    }, visualTimingPlan ? 1000 / 50 : 1000 / 24);
    return await recording;
  } catch (error) {
    const reported = error?.name === 'NotSupportedError'
      ? new Error(includeAudio ? 'このブラウザーは音付き動画の保存に対応していません。PNGとWAVは引き続き保存できます。' : 'このブラウザーは動画の保存に対応していません。PNGとWAVは引き続き保存できます。')
      : error;
    finishError(reported);
    throw reported;
  } finally {
    if (completionTimer !== null) clearTimeoutImpl(completionTimer);
    for (const timer of scheduledTimers) clearTimeoutImpl(timer);
    scheduledTimers.clear();
    if (watchdogTimer !== null) clearTimeoutImpl(watchdogTimer);
    if (progressTimer !== null) clearIntervalImpl(progressTimer);
    signal?.removeEventListener('abort', abortListener);
    documentRef.removeEventListener?.('visibilitychange', hiddenListener);
    try { player?.stop(); } catch {}
    if (startedRecording && recorder?.state === 'recording') { try { recorder.stop(); } catch {} }
    try { await player?.dispose(); } catch {}
    for (const track of allTracks) { try { track.stop(); } catch {} }
    if (audioContext && audioContext.state !== 'closed') { try { await audioContext.close(); } catch {} }
    if (source && canvas) source.width = source.height = canvas.width = canvas.height = 1;
  }
}
