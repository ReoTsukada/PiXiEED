import { AUDIO_PPQ, audioSongPixels, collectAudioEvents, createAudioPlayer } from './audio-core.mjs?rev=20260930-audio-timebase-1';
import { createPixelCanvasSurface } from './pixel-canvas-surface.mjs';
import { withPixelPngMetadata } from '../pixel-png-metadata.mjs?rev=20260928-pixel-roundtrip-1';

export const AUDIO_EXPORT_MAX_SECONDS = 120;
export const AUDIO_EXPORT_MAX_WAV_BYTES = 64 * 1024 * 1024;

/** Integer scaling preserves every dot and never includes the playhead or controls. */
export function audioImageExportSize(width, height, longEdge = 2048) {
  if (![width, height, longEdge].every(Number.isInteger) || width < 1 || height < 1 || longEdge < 1 || longEdge > 4096) throw new RangeError('画像サイズが不正です');
  const scale = Math.max(1, Math.floor(longEdge / Math.max(width, height)));
  return { width: width * scale, height: height * scale, scale };
}

export async function exportAudioImage(song, { document = globalThis.document, image = null } = {}) {
  const songPixels = audioSongPixels(song);
  const width = image?.width ?? songPixels.width; const height = image?.height ?? songPixels.height;
  if (width !== songPixels.width || height !== songPixels.height || (image && (!(image.rgba instanceof Uint8Array || image.rgba instanceof Uint8ClampedArray) || image.rgba.length !== width * height * 4))) throw new TypeError('書き出す絵と音楽キャンバスのサイズが一致しません。');
  const source = document.createElement('canvas'); source.width = width; source.height = height;
  if (image) {
    const context = source.getContext('2d'); const pixels = context.createImageData(width, height); pixels.data.set(image.rgba); context.putImageData(pixels, 0, 0);
  } else createPixelCanvasSurface(source, { alpha: false, emptyColor: '#ffffff' }).paint(songPixels.pixels, songPixels.palette);
  const size = audioImageExportSize(width, height);
  const output = document.createElement('canvas'); output.width = size.width; output.height = size.height;
  const context = output.getContext('2d'); context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, size.width, size.height);
  try {
    const blob = await new Promise((resolve) => output.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('画像を保存できませんでした。');
    return { blob: await withPixelPngMetadata(blob, { width, height, scale: size.scale }), width: size.width, height: size.height };
  } finally { source.width = source.height = output.width = output.height = 1; }
}

/** How many times the loop is repeated in a sound file: at least about 8 seconds, at most 8 loops. */
export function audioExportLoops(song, { minSeconds = 8, maxLoops = 8 } = {}) {
  const loopSeconds = song.loopTicks * 60 / song.tempo / AUDIO_PPQ;
  return Math.max(1, Math.min(maxLoops, Math.ceil(minSeconds / loopSeconds)));
}

/** 16-bit PCM WAV from an AudioBuffer-like { numberOfChannels, sampleRate, length, getChannelData }. */
export function encodeWav(buffer) {
  const channels = buffer.numberOfChannels; const frames = buffer.length;
  if (!Number.isInteger(channels) || channels < 1 || channels > 2 || !Number.isInteger(buffer.sampleRate) || buffer.sampleRate < 8000 || buffer.sampleRate > 48000
      || !Number.isSafeInteger(frames) || frames < 0 || 44 + frames * channels * 2 > AUDIO_EXPORT_MAX_WAV_BYTES) {
    throw new RangeError('WAVは2分・64MBまでです。短い範囲を書き出してください。');
  }
  const bytes = new ArrayBuffer(44 + frames * channels * 2); const view = new DataView(bytes);
  const text = (offset, value) => { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * channels * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * channels * 2, true);
  const data = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel)); let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) for (let channel = 0; channel < channels; channel += 1) {
    const sample = Math.max(-1, Math.min(1, data[channel][frame])); view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true); offset += 2;
  }
  return new Uint8Array(bytes);
}

/**
 * Renders the song with the same instruments as playback into a WAV file (the loop repeated to about 8 s).
 * The player is driven by an offline audio context whose clock we move forward one loop at a time.
 */
export async function renderAudioWav(song, { loops = audioExportLoops(song), sampleRate = 44100, OfflineContext = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext } = {}) {
  if (!collectAudioEvents(song).length) throw new Error('まだ音がありません。');
  if (!OfflineContext) throw new Error('この端末では音を書き出せません。');
  if (!Number.isInteger(loops) || loops < 1 || loops > 8 || !Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 48000) throw new RangeError('音の書き出し設定が不正です。');
  const loopSeconds = song.loopTicks * 60 / song.tempo / AUDIO_PPQ; const seconds = loopSeconds * loops + 1.2;
  const frameCount = Math.ceil(seconds * sampleRate);
  if (!Number.isFinite(seconds) || seconds > AUDIO_EXPORT_MAX_SECONDS || 44 + frameCount * 4 > AUDIO_EXPORT_MAX_WAV_BYTES) {
    throw new RangeError('この曲は長いためWAVへ書き出せません。曲を120秒以内にしてください。プロジェクト保存と再生は続けられます。');
  }
  const offline = new OfflineContext(2, frameCount, sampleRate);
  let clock = 0; let nextCycle = null;
  const context = new Proxy(offline, { get(target, key) {
    if (key === 'currentTime') return clock;
    if (key === 'resume') return async () => {};
    if (key === 'close') return async () => {};
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const player = createAudioPlayer({ audioContextFactory: () => context, schedule: (callback) => { nextCycle = callback; return 1; }, cancel: () => { nextCycle = null; } });
  if (!await player.play(song)) throw new Error('まだ音がありません。');
  for (let loop = 1; loop < loops && nextCycle; loop += 1) { const run = nextCycle; nextCycle = null; clock = loop * loopSeconds; run(); }
  nextCycle = null;
  const rendered = await offline.startRendering();
  // playback is quiet on purpose (it mixes with the page); a saved file is brought up to a normal level
  let peak = 0; for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) for (const sample of rendered.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0 ? Math.min(4, 0.89 / peak) : 1;
  if (gain !== 1) for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) { const data = rendered.getChannelData(channel); for (let i = 0; i < data.length; i += 1) data[i] *= gain; }
  return { blob: new Blob([encodeWav(rendered)], { type: 'audio/wav' }), seconds: rendered.length / rendered.sampleRate, loops };
}
