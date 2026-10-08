import { audioVideoFrameSize, chooseAudioVideoMimeType, AUDIO_VIDEO_MAX_SECONDS } from './audio-video.mjs?rev=20261008-output-1';

function abortError() { try { return new DOMException('動画の作成を中止しました。', 'AbortError'); } catch { const error = new Error('動画の作成を中止しました。'); error.name = 'AbortError'; return error; } }
function assertFrame(frame) {
  if (!Number.isInteger(frame?.width) || !Number.isInteger(frame?.height) || frame.width < 1 || frame.height < 1
      || !(frame.data instanceof Uint8Array || frame.data instanceof Uint8ClampedArray) || frame.data.length !== frame.width * frame.height * 4) throw new TypeError('動画の画像コマが不正です。');
}
function containerMatches(blob, extension) {
  return blob.type.split(';', 1)[0] === (extension === 'mp4' ? 'video/mp4' : 'video/webm');
}

/** Record a frame timeline locally. Audio and video tracks are fixed before recording starts. */
export async function renderOutputVideo(frames, {
  audioSource = null, playbackRate = 1, mimeChoice = chooseAudioVideoMimeType(),
  MediaRecorderImpl = globalThis.MediaRecorder, AudioContextImpl = globalThis.AudioContext || globalThis.webkitAudioContext,
  MediaStreamImpl = globalThis.MediaStream, documentRef = globalThis.document,
  signal, onProgress = () => {}, now = globalThis.performance?.now?.bind(globalThis.performance) || Date.now,
  setTimeoutImpl = globalThis.setTimeout.bind(globalThis), clearTimeoutImpl = globalThis.clearTimeout.bind(globalThis),
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis) || ((callback) => setTimeoutImpl(() => callback(now()), 33)),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis) || clearTimeoutImpl
} = {}) {
  if (!Array.isArray(frames) || !frames.length || frames.length > 600) throw new TypeError('動画に使うコマを読み込めません。');
  frames.forEach(assertFrame);
  const width = frames[0].width; const height = frames[0].height;
  if (frames.some((frame) => frame.width !== width || frame.height !== height)) throw new TypeError('動画のコマのサイズをそろえてください。');
  if (!Number.isFinite(playbackRate) || playbackRate < 0.25 || playbackRate > 4) throw new RangeError('再生速度は0.25〜4倍で指定してください。');
  if (!mimeChoice || !MediaRecorderImpl || !MediaStreamImpl || !documentRef?.createElement || (audioSource && !AudioContextImpl)) throw new Error('このブラウザーは動画の作成に対応していません。画像と音声の通常保存は引き続き使えます。');
  if (signal?.aborted) throw abortError();
  const delays = frames.map((frame) => Number.isFinite(frame.delayMs) ? Math.max(20, Math.min(5000, frame.delayMs)) : 500);
  const imageSeconds = delays.reduce((sum, delay) => sum + delay, 0) / 1000 / playbackRate;
  const audioSeconds = audioSource ? audioSource.channels[0].length / audioSource.sampleRate / playbackRate : 0;
  const durationSeconds = audioSource ? audioSeconds : imageSeconds;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > AUDIO_VIDEO_MAX_SECONDS) throw new RangeError('動画は120秒以内で作成できます。コマ数や音声の長さを短くしてください。');

  const frameSize = audioVideoFrameSize(width, height);
  const canvas = documentRef.createElement('canvas'); canvas.width = frameSize.width; canvas.height = frameSize.height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context || typeof canvas.captureStream !== 'function') throw new Error('このブラウザーは動画の画像記録に対応していません。PNG/GIFとWAVは引き続き保存できます。');
  context.imageSmoothingEnabled = false;
  const frameStarts = []; let cursor = 0;
  for (const delay of delays) { frameStarts.push(cursor); cursor += delay / 1000; }
  const totalTimelineSeconds = cursor;
  const paint = (elapsedSeconds) => {
    let timelineSeconds = elapsedSeconds * playbackRate;
    if (audioSource) timelineSeconds %= totalTimelineSeconds;
    else timelineSeconds = Math.min(Math.max(0, timelineSeconds), Math.max(0, totalTimelineSeconds - 0.000001));
    let index = frameStarts.length - 1;
    for (let frameIndex = 0; frameIndex < frameStarts.length; frameIndex += 1) {
      if (timelineSeconds < frameStarts[frameIndex] + delays[frameIndex] / 1000) { index = frameIndex; break; }
    }
    const frame = frames[index];
    const source = documentRef.createElement('canvas'); source.width = width; source.height = height;
    try {
      const sourceContext = source.getContext('2d');
      if (!sourceContext) throw new Error('動画フレームを描けません。');
      sourceContext.putImageData(new ImageData(new Uint8ClampedArray(frame.data), width, height), 0, 0);
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
    } finally { source.width = source.height = 1; }
  };
  paint(0);

  let canvasStream = null; let audioContext = null; let audioStream = null; let stream = null; let recorder = null; let audioNode = null; let raf = null; let stopTimer = null; let watchdog = null;
  let disposed = false; let resolveResult; let rejectResult; let canceled = false; let startedAt = 0; let audioStartAt = 0;
  const chunks = [];
  const tracks = new Set();
  const resultPromise = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  const rejectOnce = (error) => { if (disposed) return; disposed = true; rejectResult(error); };
  const stopRecording = () => { if (recorder?.state === 'recording') { try { recorder.stop(); } catch {} } };
  const abort = () => { canceled = true; rejectOnce(abortError()); stopRecording(); };
  const onVisibility = () => { if (documentRef.visibilityState === 'hidden') abort(); };
  const onData = (event) => { if (!canceled && event.data?.size) chunks.push(event.data); };
  const onStop = () => {
    if (canceled || disposed) return;
    if (!chunks.length) { rejectOnce(new Error('動画データを作成できませんでした。PNG/GIFとWAVはそのまま保存できます。')); return; }
    const actualMime = recorder.mimeType || mimeChoice.mimeType;
    const extension = actualMime.split(';', 1)[0] === 'video/mp4' ? 'mp4' : actualMime.split(';', 1)[0] === 'video/webm' ? 'webm' : '';
    const blob = new Blob(chunks, { type: actualMime });
    if (!extension || extension !== mimeChoice.extension || !containerMatches(blob, extension)) { rejectOnce(new Error('動画の実際の形式が選択内容と一致しません。画像と音声の元データは保持されています。')); return; }
    const bytesPromise = blob.slice(0, 8).arrayBuffer();
    void bytesPromise.then((buffer) => {
      const signature = new Uint8Array(buffer);
      const valid = extension === 'mp4'
        ? signature.length === 8 && String.fromCharCode(...signature.subarray(4, 8)) === 'ftyp'
        : signature.length === 4 && signature[0] === 0x1a && signature[1] === 0x45 && signature[2] === 0xdf && signature[3] === 0xa3;
      if (!valid) { rejectOnce(new Error('作成した動画ファイルの識別情報が不正です。元データはそのままです。')); return; }
      disposed = true;
      resolveResult({ blob, extension, mimeType: actualMime, seconds: durationSeconds, width: frameSize.width, height: frameSize.height, hasAudio: Boolean(audioSource) });
    }).catch(() => rejectOnce(new Error('作成した動画を確認できませんでした。元データはそのままです。')));
  };

  try {
    canvasStream = canvas.captureStream(60);
    for (const track of canvasStream.getTracks()) tracks.add(track);
    const streamTracks = [...canvasStream.getVideoTracks()];
    if (!streamTracks.length || streamTracks.some((track) => track.readyState !== 'live')) throw new Error('動画の画像トラックを開始できません。');
    if (audioSource) {
      audioContext = new AudioContextImpl({ latencyHint: 'playback' });
      await audioContext.resume?.();
      const audioBuffer = audioContext.createBuffer(audioSource.channels.length, audioSource.channels[0].length, audioSource.sampleRate);
      audioSource.channels.forEach((channel, index) => audioBuffer.copyToChannel(channel, index));
      audioStream = audioContext.createMediaStreamDestination();
      const audioTrack = audioStream.stream.getAudioTracks()[0];
      if (!audioTrack || audioTrack.readyState !== 'live' || !audioTrack.enabled) throw new Error('音声トラックを準備できません。');
      streamTracks.push(audioTrack); tracks.add(audioTrack);
      audioNode = audioContext.createBufferSource(); audioNode.buffer = audioBuffer; audioNode.playbackRate.value = playbackRate; audioNode.connect(audioStream);
      audioNode.onended = () => { if (recorder?.state === 'recording') stopRecording(); };
    }
    stream = new MediaStreamImpl(streamTracks);
    const actualTracks = stream.getTracks(); actualTracks.forEach((track) => tracks.add(track));
    if (!actualTracks.some((track) => track.kind === 'video' && track.readyState === 'live')) throw new Error('動画の画像トラックがありません。');
    if (audioSource && !actualTracks.some((track) => track.kind === 'audio' && track.readyState === 'live' && track.enabled)) throw new Error('動画に含める音声トラックがありません。');
    recorder = new MediaRecorderImpl(stream, { mimeType: mimeChoice.mimeType, videoBitsPerSecond: 1_000_000, ...(audioSource ? { audioBitsPerSecond: 128_000 } : {}) });
    recorder.addEventListener('dataavailable', onData);
    recorder.addEventListener('stop', onStop);
    recorder.addEventListener('error', (event) => rejectOnce(event.error || new Error('動画の記録に失敗しました。元データはそのままです。')));
    let resolveStarted;
    const started = new Promise((resolve) => { resolveStarted = resolve; });
    recorder.addEventListener('start', resolveStarted, { once: true });
    signal?.addEventListener('abort', abort, { once: true });
    documentRef.addEventListener?.('visibilitychange', onVisibility);
    recorder.start(500);
    await Promise.race([started, resultPromise]);
    if (disposed) return await resultPromise;
    startedAt = now();
    if (audioNode) { audioStartAt = audioContext.currentTime; audioNode.start(audioStartAt); }
    const step = (time) => {
      if (signal?.aborted || canceled || disposed) return;
      const elapsed = audioNode ? Math.max(0, audioContext.currentTime - audioStartAt) : Math.max(0, (time - startedAt) / 1000);
      paint(elapsed);
      try { onProgress(Math.min(1, elapsed / durationSeconds)); } catch { /* progress is advisory */ }
      if (elapsed < durationSeconds) raf = requestFrame(step);
    };
    raf = requestFrame(step);
    watchdog = setTimeoutImpl(() => { rejectOnce(new Error('動画の作成が時間内に終わりませんでした。元データはそのままです。')); stopRecording(); }, (durationSeconds + 8) * 1000);
    if (!audioNode) stopTimer = setTimeoutImpl(stopRecording, Math.ceil(durationSeconds * 1000));
    const result = await resultPromise;
    return result;
  } catch (error) {
    if (!disposed) rejectOnce(error);
    throw error;
  } finally {
    canceled ||= signal?.aborted || false;
    signal?.removeEventListener('abort', abort);
    documentRef.removeEventListener?.('visibilitychange', onVisibility);
    if (raf !== null) cancelFrame(raf);
    if (stopTimer !== null) clearTimeoutImpl(stopTimer);
    if (watchdog !== null) clearTimeoutImpl(watchdog);
    if (recorder?.state === 'recording') { try { recorder.stop(); } catch {} }
    try { audioNode?.stop(); } catch {}
    audioNode?.disconnect?.();
    tracks.forEach((track) => { try { track.stop(); } catch {} });
    if (audioContext && audioContext.state !== 'closed') { try { await audioContext.close(); } catch {} }
    canvas.width = canvas.height = 1;
    if (stream && !canceled) stream.getTracks().forEach((track) => { try { track.stop(); } catch {} });
  }
}
