import { encodeImportedAudioWav } from './audio-export.mjs?rev=20261024-free-tools-1';
import { listAudioOutputFormats } from './output-audio-capabilities.mjs?rev=20261020-format-conversion-1';

export const OUTPUT_AUDIO_MAX_SECONDS = 120;
export const OUTPUT_AUDIO_MAX_BYTES = 64 * 1024 * 1024;
export const OUTPUT_AUDIO_CODEC_PADDING_SECONDS = Object.freeze({ leading: 0.04, trailing: 0.08 });
const OUTPUT_SAMPLE_RATE_MIN = 8000;
const OUTPUT_SAMPLE_RATE_MAX = 48000;
const WATCHDOG_GRACE_MS = 10_000;
const AUDIO_CONTEXT_RESUME_TIMEOUT_MS = 5_000;
const CODEC_LEAD_PADDING_SECONDS = OUTPUT_AUDIO_CODEC_PADDING_SECONDS.leading;
const CODEC_TAIL_PADDING_SECONDS = OUTPUT_AUDIO_CODEC_PADDING_SECONDS.trailing;
const RECORDER_MIME = Object.freeze({ m4a: 'audio/mp4', webm: 'audio/webm', ogg: 'audio/ogg' });

function abortError() {
  try { return new DOMException('音声の作成を中止しました。', 'AbortError'); }
  catch { const error = new Error('音声の作成を中止しました。'); error.name = 'AbortError'; return error; }
}

function validateSource(source) {
  const { channels, sampleRate } = source || {};
  if (!Array.isArray(channels) || channels.length < 1 || channels.length > 2
      || !Number.isInteger(sampleRate) || sampleRate < OUTPUT_SAMPLE_RATE_MIN || sampleRate > OUTPUT_SAMPLE_RATE_MAX
      || channels.some((channel) => !(channel instanceof Float32Array))) {
    throw new TypeError('読み込んだ音声データを確認できません。');
  }
  const frames = channels[0].length;
  if (!Number.isSafeInteger(frames) || frames < 1 || channels.some((channel) => channel.length !== frames)) throw new TypeError('読み込んだ音声の長さが一致しません。');
  const seconds = frames / sampleRate;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > OUTPUT_AUDIO_MAX_SECONDS || frames * channels.length * 4 > OUTPUT_AUDIO_MAX_BYTES) {
    throw new RangeError('音声は2分・64MBまでです。短い音声を選んでください。');
  }
  return { frames, seconds };
}

function expectedFormat(formatChoice, MediaRecorderImpl) {
  const requested = typeof formatChoice === 'string' ? formatChoice : formatChoice?.value;
  const format = listAudioOutputFormats({ MediaRecorderImpl }).find((item) => item.value === requested);
  if (!format || !format.available) throw new Error(format?.reason || '音声の出力形式を選んでください。');
  if (format.value === 'wav') return format;
  if (!RECORDER_MIME[format.value]) throw new Error('この音声形式は実装されていません。');
  return format;
}

function containerMatches(bytes, extension) {
  if (extension === 'm4a') return bytes.length >= 8 && String.fromCharCode(...bytes.subarray(4, 8)) === 'ftyp';
  if (extension === 'webm') return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (extension === 'ogg') return bytes.length >= 4 && String.fromCharCode(...bytes.subarray(0, 4)) === 'OggS';
  return false;
}

function actualMimeType(recorder, choice) {
  const mimeType = recorder?.mimeType || choice.mimeType;
  return typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
}

/**
 * Encode an imported audio-buffer only after an explicit caller action.
 * Native formats are recorded in real time into a MediaStreamDestination; no audio reaches speakers.
 */
export async function encodeNativeAudio(source, {
  formatChoice,
  signal,
  onProgress = () => {},
  MediaRecorderImpl = globalThis.MediaRecorder,
  AudioContextImpl = globalThis.AudioContext || globalThis.webkitAudioContext,
  MediaStreamImpl = globalThis.MediaStream,
  setTimeoutImpl = globalThis.setTimeout.bind(globalThis),
  clearTimeoutImpl = globalThis.clearTimeout.bind(globalThis),
  setIntervalImpl = globalThis.setInterval.bind(globalThis),
  clearIntervalImpl = globalThis.clearInterval.bind(globalThis),
  resumeTimeoutMs = AUDIO_CONTEXT_RESUME_TIMEOUT_MS,
  now = globalThis.performance?.now?.bind(globalThis.performance) || Date.now
} = {}) {
  const { frames, seconds: sourceSeconds } = validateSource(source);
  const choice = expectedFormat(formatChoice, MediaRecorderImpl);
  if (signal?.aborted) throw abortError();
  if (choice.value === 'wav') {
    const blob = await encodeImportedAudioWav(source, { signal, onProgress });
    return { blob, mimeType: blob.type, extension: 'wav', seconds: sourceSeconds, sourceSeconds, paddingSeconds: 0 };
  }
  if (typeof MediaRecorderImpl !== 'function' || typeof AudioContextImpl !== 'function' || typeof MediaStreamImpl !== 'function') {
    throw new Error('このブラウザーでは選択した音声形式を作成できません。WAVは引き続き保存できます。');
  }
  const leadFrames = Math.round(CODEC_LEAD_PADDING_SECONDS * source.sampleRate);
  const tailFrames = Math.round(CODEC_TAIL_PADDING_SECONDS * source.sampleRate);
  const paddedFrames = frames + leadFrames + tailFrames;
  const recordingSeconds = paddedFrames / source.sampleRate;
  const paddingSeconds = (leadFrames + tailFrames) / source.sampleRate;

  let audioContext = null; let destination = null; let sourceNode = null; let stream = null; let recorder = null;
  let intervalId = null; let watchdogId = null; let setupTimeoutId = null; let abortListener = null; let settled = false; let canceled = false; let recordingStarted = false;
  const tracks = new Set(); const chunks = [];
  let rejectSetupInterruption;
  const setupInterruption = new Promise((resolve, reject) => { rejectSetupInterruption = reject; });
  setupInterruption.catch(() => {});
  let resolveRecording; let rejectRecording;
  const recording = new Promise((resolve, reject) => { resolveRecording = resolve; rejectRecording = reject; });
  const rejectOnce = (error) => { if (settled) return; settled = true; rejectRecording(error); };
  const stopRecorder = () => { if (recorder?.state === 'recording' || recorder?.state === 'paused') { try { recorder.stop(); } catch {} } };
  const abort = () => {
    canceled = true;
    const error = abortError();
    if (recordingStarted) rejectOnce(error);
    rejectSetupInterruption(error);
    stopRecorder();
  };
  const fail = (error) => { rejectOnce(error instanceof Error ? error : new Error('音声の記録に失敗しました。元データはそのままです。')); stopRecorder(); };
  const onStop = async () => {
    if (canceled || settled) return;
    if (!chunks.length) { fail(new Error('音声データを作成できませんでした。元データはそのままです。')); return; }
    const mimeType = actualMimeType(recorder, choice);
    const essence = mimeType.split(';', 1)[0];
    const expectedEssence = RECORDER_MIME[choice.value];
    const extension = Object.entries(RECORDER_MIME).find(([, candidate]) => candidate === essence)?.[0];
    if (!mimeType || essence !== expectedEssence || extension !== choice.extension) {
      fail(new Error('音声の実際の形式が選択内容と一致しません。元データはそのままです。')); return;
    }
    let blob;
    try { blob = new Blob(chunks, { type: mimeType }); }
    catch { fail(new Error('作成した音声を確認できませんでした。元データはそのままです。')); return; }
    if (blob.size <= 0 || blob.size > OUTPUT_AUDIO_MAX_BYTES || blob.type.toLowerCase() !== mimeType) {
      fail(new Error('作成した音声のサイズまたは形式を確認できません。元データはそのままです。')); return;
    }
    try {
      const signature = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
      if (!containerMatches(signature, extension)) { fail(new Error('作成した音声ファイルの識別情報が不正です。元データはそのままです。')); return; }
      if (settled || canceled) return;
      settled = true;
      resolveRecording({ blob, mimeType, extension, seconds: recordingSeconds, sourceSeconds, paddingSeconds });
    } catch { fail(new Error('作成した音声を確認できませんでした。元データはそのままです。')); }
  };

  try {
    audioContext = new AudioContextImpl({ latencyHint: 'playback' });
    abortListener = abort;
    signal?.addEventListener('abort', abortListener, { once: true });
    if (signal?.aborted) throw abortError();
    if (!Number.isFinite(resumeTimeoutMs) || resumeTimeoutMs <= 0) throw new RangeError('音声の準備時間が不正です。');
    setupTimeoutId = setTimeoutImpl(() => rejectSetupInterruption(new Error('音声の準備が時間内に終わりませんでした。元データはそのままです。')), resumeTimeoutMs);
    await Promise.race([Promise.resolve(audioContext.resume?.()), setupInterruption]);
    if (setupTimeoutId !== null) clearTimeoutImpl(setupTimeoutId);
    setupTimeoutId = null;
    if (canceled || signal?.aborted) throw abortError();
    const audioBuffer = audioContext.createBuffer(source.channels.length, paddedFrames, source.sampleRate);
    source.channels.forEach((channel, index) => audioBuffer.copyToChannel(channel, index, leadFrames));
    destination = audioContext.createMediaStreamDestination();
    try {
      destination.channelCountMode = 'explicit';
      destination.channelCount = source.channels.length;
      destination.channelInterpretation = 'discrete';
    } catch { throw new Error('このブラウザーでは音声のチャンネル数を保てません。WAVは引き続き保存できます。'); }
    if (destination.channelCount !== source.channels.length || destination.channelCountMode !== 'explicit') {
      throw new Error('このブラウザーでは音声のチャンネル数を保てません。WAVは引き続き保存できます。');
    }
    const audioTrack = destination?.stream?.getAudioTracks?.()[0];
    if (!audioTrack || audioTrack.readyState !== 'live' || audioTrack.enabled === false) throw new Error('音声トラックを準備できません。元データはそのままです。');
    tracks.add(audioTrack);
    sourceNode = audioContext.createBufferSource(); sourceNode.buffer = audioBuffer;
    sourceNode.connect(destination);
    stream = new MediaStreamImpl([audioTrack]);
    for (const track of stream.getTracks?.() || []) tracks.add(track);
    if (![...tracks].some((track) => track.kind === 'audio' && track.readyState === 'live' && track.enabled !== false)) throw new Error('音声トラックを準備できません。元データはそのままです。');
    recorder = new MediaRecorderImpl(stream, { mimeType: choice.mimeType, audioBitsPerSecond: 128_000 });
    if (recorder.mimeType && recorder.mimeType.toLowerCase().split(';', 1)[0] !== RECORDER_MIME[choice.value]) throw new Error('このブラウザーは選択した音声形式で記録できません。元データはそのままです。');
    recorder.addEventListener('dataavailable', (event) => { if (!canceled && event.data?.size) chunks.push(event.data); });
    recorder.addEventListener('stop', () => { void onStop(); });
    recorder.addEventListener('error', (event) => fail(event.error || new Error('音声の記録に失敗しました。元データはそのままです。')));
    sourceNode.onended = stopRecorder;
    if (signal?.aborted) throw abortError();
    recordingStarted = true;
    recorder.start(250);
    const startedAt = now();
    try { onProgress(0); } catch { /* progress is advisory */ }
    intervalId = setIntervalImpl(() => {
      if (canceled || settled) return;
      try { onProgress(Math.max(0, Math.min(1, (now() - startedAt) / (recordingSeconds * 1000)))); } catch { /* progress is advisory */ }
    }, 100);
    watchdogId = setTimeoutImpl(() => { fail(new Error('音声の作成が時間内に終わりませんでした。元データはそのままです。')); }, Math.ceil(recordingSeconds * 1000) + WATCHDOG_GRACE_MS);
    sourceNode.start(0);
    return await recording;
  } finally {
    canceled ||= signal?.aborted || false;
    if (abortListener) signal?.removeEventListener('abort', abortListener);
    if (setupTimeoutId !== null) clearTimeoutImpl(setupTimeoutId);
    if (intervalId !== null) clearIntervalImpl(intervalId);
    if (watchdogId !== null) clearTimeoutImpl(watchdogId);
    try { sourceNode?.stop(); } catch {}
    try { sourceNode?.disconnect?.(); } catch {}
    stopRecorder();
    tracks.forEach((track) => { try { track.stop(); } catch {} });
    if (audioContext && audioContext.state !== 'closed') { try { await audioContext.close(); } catch {} }
  }
}
