const MAX_FILES = 8;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const MAX_EDGE = 4096;
const MAX_STILL_PIXELS = 8_000_000;
const MAX_TIMELINE_PIXELS = 8_000_000;
const MAX_FRAMES = 600;
const MAX_AUDIO_SECONDS = 120;
const MAX_AUDIO_DECODED_BYTES = 64 * 1024 * 1024;

function abortError() { return new DOMException('読み込みを中止しました。', 'AbortError'); }

function checkAbort(signal) { if (signal?.aborted) throw abortError(); }

function readU32(bytes, offset) {
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function readU32LittleEndian(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function imageType(bytes) {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(String.fromCharCode(...bytes.subarray(0, 6)))) return 'image/gif';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return '';
}

function pngAnimationInfo(bytes) {
  if (imageType(bytes) !== 'image/png') return null;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset);
    if (length > bytes.length - offset - 12) throw new Error('PNGのチャンクが壊れています。元のファイルは変更していません。');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type === 'acTL') {
      if (length !== 8) throw new Error('APNGの再生情報が壊れています。');
      return { frames: readU32(bytes, offset + 8), loopCount: readU32(bytes, offset + 12), animated: true };
    }
    if (type === 'IEND') break;
    offset += length + 12;
  }
  return { frames: 1, loopCount: 0, animated: false };
}

function gifLoopCount(bytes) {
  const marker = new TextEncoder().encode('NETSCAPE2.0');
  for (let index = 0; index <= bytes.length - marker.length - 4; index += 1) {
    if (marker.every((byte, offset) => bytes[index + offset] === byte)) {
      const data = index + marker.length;
      if (bytes[data] === 3 && bytes[data + 1] === 1) return bytes[data + 2] | (bytes[data + 3] << 8);
    }
  }
  return 1;
}

function webpAnimationInfo(bytes) {
  if (imageType(bytes) !== 'image/webp') return { animated: false, loopCount: 0 };
  if (bytes.length < 20 || readU32LittleEndian(bytes, 4) > bytes.length - 8) throw new Error('WebPの画像情報が壊れています。');
  let offset = 12; let animated = false; let loopCount = 0;
  while (offset + 8 <= bytes.length) {
    const kind = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const length = readU32LittleEndian(bytes, offset + 4);
    if (length > bytes.length - offset - 8) throw new Error('WebPの画像情報が壊れています。');
    if (kind === 'VP8X' && length >= 1 && (bytes[offset + 8] & 0x02)) animated = true;
    if (kind === 'ANIM') {
      if (length < 6) throw new Error('WebPの再生情報が壊れています。');
      animated = true;
      loopCount = bytes[offset + 12] | (bytes[offset + 13] << 8);
    }
    offset += 8 + length + (length & 1);
  }
  return { animated, loopCount };
}

function decodeCanvasImage(blob, signal, { createImageBitmapImpl = globalThis.createImageBitmap, documentRef = globalThis.document } = {}) {
  checkAbort(signal);
  if (typeof createImageBitmapImpl !== 'function') return Promise.reject(new Error('このブラウザーは静止画像の読み込みに対応していません。'));
  return createImageBitmapImpl(blob).then((bitmap) => {
    try {
      checkAbort(signal);
      const { width, height } = bitmap;
      if (!width || !height || width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_STILL_PIXELS) throw new RangeError('画像が大きすぎます。4096px以下・800万画素以下の画像を選んでください。');
      const canvas = documentRef.createElement('canvas'); canvas.width = width; canvas.height = height;
      try {
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('画像を読み込めません。');
        context.imageSmoothingEnabled = false;
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, width, height);
        return { width, height, data: new Uint8Array(pixels.data), delayMs: 500 };
      } finally { canvas.width = canvas.height = 1; }
    } finally { bitmap.close?.(); }
  });
}

function decoderType(type) { return type === 'image/apng' ? 'image/png' : type; }

async function decodeAnimated(blob, type, bytes, signal, { ImageDecoderImpl = globalThis.ImageDecoder, documentRef = globalThis.document, onFrameProgress = () => {} } = {}) {
  const Decoder = ImageDecoderImpl;
  if (!Decoder || typeof Decoder.isTypeSupported !== 'function') throw new Error('このブラウザーはアニメーション画像の全コマ読み込みに対応していません。PNG/JPEGなどの静止画像か音声は読み込めます。');
  const decoderMime = decoderType(type);
  if (!(await Decoder.isTypeSupported(decoderMime))) throw new Error(`${type === 'image/gif' ? 'GIF' : 'APNG'}全コマの読み込みにこのブラウザーが対応していません。元のファイルは変更していません。`);
  checkAbort(signal);
  const decoder = new Decoder({ data: bytes, type: decoderMime, preferAnimation: true });
  const closeOnAbort = () => { try { decoder.close?.(); } catch {} };
  signal?.addEventListener('abort', closeOnAbort, { once: true });
  try {
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    if (!track || !track.animated || !Number.isSafeInteger(track.frameCount) || track.frameCount < 2) throw new Error('アニメーションの全コマを確認できませんでした。元のファイルは変更していません。');
    if (track.frameCount > MAX_FRAMES) throw new RangeError('アニメーションは600コマまで読み込めます。コマ数を減らしてからお試しください。');
    const frames = [];
    let totalPixels = 0;
    for (let index = 0; index < track.frameCount; index += 1) {
      checkAbort(signal);
      const decoded = await decoder.decode({ frameIndex: index, completeFramesOnly: true });
      const frame = decoded.image;
      try {
        const width = frame.displayWidth || frame.codedWidth;
        const height = frame.displayHeight || frame.codedHeight;
        if (!width || !height || width > MAX_EDGE || height > MAX_EDGE) throw new RangeError('アニメーションの画像サイズが上限を超えています。');
        totalPixels += width * height;
        if (totalPixels > MAX_TIMELINE_PIXELS) throw new RangeError('アニメーション全体が800万画素を超えています。サイズを下げるかコマ数を減らしてください。');
        const canvas = documentRef.createElement('canvas'); canvas.width = width; canvas.height = height;
        try {
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) throw new Error('アニメーションのコマを読み込めません。');
          context.imageSmoothingEnabled = false;
          context.drawImage(frame, 0, 0, width, height);
          const pixels = context.getImageData(0, 0, width, height);
          frames.push({ width, height, data: new Uint8Array(pixels.data), delayMs: Number.isFinite(frame.duration) && frame.duration > 0 ? Math.max(10, frame.duration / 1000) : 100 });
          onFrameProgress(index + 1, track.frameCount);
        } finally { canvas.width = canvas.height = 1; }
      } finally { frame.close?.(); }
    }
    const info = type === 'image/gif' ? { loopCount: gifLoopCount(bytes) }
      : type === 'image/webp' ? webpAnimationInfo(bytes)
        : pngAnimationInfo(bytes);
    return { frames, loopCount: info?.loopCount ?? 0 };
  } catch (error) {
    if (signal?.aborted) throw abortError();
    throw error;
  } finally { signal?.removeEventListener('abort', closeOnAbort); try { decoder.close?.(); } catch {} }
}

export function fitOutputFrames(frames) {
  if (!frames.length) return frames;
  if (frames.length > MAX_FRAMES) throw new RangeError('画像の合計は600コマまでです。コマ数を減らしてください。');
  const width = Math.max(...frames.map((frame) => frame.width));
  const height = Math.max(...frames.map((frame) => frame.height));
  const pixelLimit = frames.length > 1 ? MAX_TIMELINE_PIXELS : MAX_STILL_PIXELS;
  if (width > MAX_EDGE || height > MAX_EDGE || width * height * frames.length > pixelLimit) throw new RangeError('画像の合計がアニメーションの上限を超えています。画像サイズかコマ数を減らしてください。');
  return frames.map((frame) => {
    if (frame.width === width && frame.height === height) return frame;
    const scale = Math.min(width / frame.width, height / frame.height);
    const drawWidth = Math.max(1, Math.round(frame.width * scale));
    const drawHeight = Math.max(1, Math.round(frame.height * scale));
    const left = Math.floor((width - drawWidth) / 2);
    const top = Math.floor((height - drawHeight) / 2);
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < drawHeight; y += 1) for (let x = 0; x < drawWidth; x += 1) {
      const from = (Math.floor(y * frame.height / drawHeight) * frame.width + Math.floor(x * frame.width / drawWidth)) * 4;
      const to = ((y + top) * width + x + left) * 4;
      data.set(frame.data.subarray(from, from + 4), to);
    }
    return { width, height, data, delayMs: frame.delayMs, name: frame.name };
  });
}

async function decodeImageFile(file, signal, dependencies) {
  if (file.size < 1 || file.size > MAX_FILE_BYTES) throw new RangeError('画像は1ファイル64MBまで読み込めます。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  checkAbort(signal);
  const type = imageType(bytes);
  if (!type) throw new Error(`${file.name || '選択したファイル'}はPNG/JPEG/GIF/WebP画像として確認できません。SVGとその他の形式は読み込めません。`);
  const webpInfo = type === 'image/webp' ? webpAnimationInfo(bytes) : null;
  if (type === 'image/gif' || (type === 'image/png' && pngAnimationInfo(bytes)?.animated) || webpInfo?.animated) {
    const result = await decodeAnimated(file, type, bytes, signal, dependencies);
    return { frames: result.frames.map((frame, index) => ({ ...frame, name: result.frames.length > 1 ? `${file.name || 'アニメーション'} · ${index + 1}` : (file.name || '画像') })), loopCount: result.loopCount };
  }
  return { frames: [{ ...(await decodeCanvasImage(file, signal, dependencies)), name: file.name || '画像' }], loopCount: 0 };
}

async function decodeAudioFile(file, audioContext, signal) {
  if (file.size < 1 || file.size > MAX_FILE_BYTES) throw new RangeError('音声は1ファイル64MBまで読み込めます。');
  checkAbort(signal);
  const bytes = await file.arrayBuffer();
  const decoding = audioContext.decodeAudioData(bytes.slice(0));
  decoding.catch(() => {});
  let audio; let abortListener = null;
  try {
    if (!signal) audio = await decoding;
    else audio = await Promise.race([decoding, new Promise((_, reject) => {
      abortListener = () => reject(abortError());
      signal.addEventListener('abort', abortListener, { once: true });
    })]);
  } finally { if (abortListener) signal.removeEventListener('abort', abortListener); }
  checkAbort(signal);
  if (!Number.isFinite(audio.duration) || audio.duration <= 0 || audio.duration > MAX_AUDIO_SECONDS) throw new RangeError('音声は120秒以内のファイルを選んでください。');
  if (audio.numberOfChannels < 1 || audio.numberOfChannels > 2 || audio.sampleRate < 8000 || audio.sampleRate > 48000) throw new Error('音声はモノラル/ステレオ、8〜48kHzの範囲に対応しています。');
  const decodedBytes = audio.length * audio.numberOfChannels * 4;
  if (decodedBytes > MAX_AUDIO_DECODED_BYTES) throw new RangeError('展開後の音声が64MBを超えています。短い音声を選んでください。');
  const channels = [];
  for (let channel = 0; channel < audio.numberOfChannels; channel += 1) channels.push(new Float32Array(audio.getChannelData(channel)));
  return { sampleRate: audio.sampleRate, durationSeconds: audio.duration, channels, name: file.name || '音声' };
}

/** Decode only locally selected files. No input bytes, filenames, or URLs leave this page. */
export async function importOutputFiles(files, { signal, onProgress = () => {}, AudioContextImpl = globalThis.AudioContext || globalThis.webkitAudioContext, createImageBitmapImpl = globalThis.createImageBitmap, ImageDecoderImpl = globalThis.ImageDecoder, documentRef = globalThis.document } = {}) {
  const selected = [...(files || [])];
  if (!selected.length) throw new Error('ファイルを選んでください。');
  if (selected.length > MAX_FILES) throw new RangeError('一度に8ファイルまで追加できます。');
  const bytes = selected.reduce((sum, file) => sum + (Number(file?.size) || 0), 0);
  if (bytes > MAX_TOTAL_BYTES) throw new RangeError('選んだファイルの合計が128MBを超えています。数を減らしてください。');
  const output = { frames: [], loopCount: 0, audio: null };
  let audioContext = null;
  try {
    for (let index = 0; index < selected.length; index += 1) {
      checkAbort(signal);
      const file = selected[index];
      const header = new Uint8Array(await file.slice(0, Math.min(file.size, 32)).arrayBuffer());
      if (imageType(header)) {
        const decoded = await decodeImageFile(file, signal, {
          createImageBitmapImpl, ImageDecoderImpl, documentRef,
          onFrameProgress: (framesDone, framesTotal) => onProgress({ current: index + 1, total: selected.length, name: file.name || `ファイル${index + 1}`, frameProgress: framesDone / framesTotal, framesDone, framesTotal })
        });
        if (output.frames.length + decoded.frames.length > MAX_FRAMES) throw new RangeError('画像の合計は600コマまでです。');
        if (!output.frames.length && decoded.frames.length > 1) output.loopCount = decoded.loopCount;
        output.frames.push(...decoded.frames);
      } else {
        if (!AudioContextImpl) throw new Error('このブラウザーでは音声の読み込みに対応していません。');
        if (output.audio) throw new Error('音声は1つずつ追加してください。先に現在の音声を削除できます。');
        audioContext ||= new AudioContextImpl();
        output.audio = await decodeAudioFile(file, audioContext, signal);
      }
      onProgress({ current: index + 1, total: selected.length, name: file.name || `ファイル${index + 1}` });
    }
    output.frames = fitOutputFrames(output.frames);
    if (output.frames.length > 1) {
      const totalPixels = output.frames[0].width * output.frames[0].height * output.frames.length;
      if (totalPixels > MAX_TIMELINE_PIXELS) throw new RangeError('画像の合計が800万画素を超えています。サイズを下げるかコマ数を減らしてください。');
    }
    if (!output.frames.length && !output.audio) throw new Error('選んだファイルを読み込めませんでした。');
    return output;
  } finally { try { await audioContext?.close?.(); } catch { /* release decoded input context */ } }
}

export const OUTPUT_IMPORT_LIMITS = Object.freeze({ MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, MAX_EDGE, MAX_STILL_PIXELS, MAX_TIMELINE_PIXELS, MAX_FRAMES, MAX_AUDIO_SECONDS, MAX_AUDIO_DECODED_BYTES });
