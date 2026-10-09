import { gifRepeatsToTotalPlays } from './output-loop-count.mjs?rev=20261008-loop-count-1';

const MAX_FILES = 8;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const MAX_EDGE = 4096;
const MAX_STILL_PIXELS = 8_000_000;
const MAX_TIMELINE_PIXELS = 8_000_000;
const MAX_FRAMES = 600;
const MAX_AUDIO_SECONDS = 120;
const MAX_AUDIO_DECODED_BYTES = 64 * 1024 * 1024;
const MAX_UNKNOWN_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 120;
const MAX_VIDEO_PIXELS = 8_000_000;

export function boundedPreviewDimensions(width, height, { maxEdge = 1536, maxPixels = 2_000_000 } = {}) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
      || !Number.isSafeInteger(maxEdge) || maxEdge < 1 || !Number.isSafeInteger(maxPixels) || maxPixels < 1) {
    throw new TypeError('プレビュー画像のサイズを確認できません。');
  }
  const factor = Math.min(1, maxEdge / Math.max(width, height), Math.sqrt(maxPixels / (width * height)));
  return { width: Math.max(1, Math.floor(width * factor)), height: Math.max(1, Math.floor(height * factor)) };
}

/** Decode a local Blob at a bounded display resolution; the input Blob is never modified. */
export async function createBoundedRasterPreview(blob, {
  width,
  height,
  maxEdge = 1536,
  maxPixels = 2_000_000,
  resizeQuality = 'high',
  createImageBitmapImpl = globalThis.createImageBitmap,
  documentRef = globalThis.document
} = {}) {
  const target = boundedPreviewDimensions(width, height, { maxEdge, maxPixels });
  if (typeof createImageBitmapImpl !== 'function') throw new Error('このブラウザーは縮小プレビューの準備に対応していません。元ファイルは保存できます。');
  if (!documentRef?.createElement) throw new Error('プレビューを表示できません。元ファイルは保存できます。');
  let bitmap;
  try {
    bitmap = await createImageBitmapImpl(blob, {
      resizeWidth: target.width,
      resizeHeight: target.height,
      resizeQuality
    });
    const actualWidth = bitmap.width || target.width;
    const actualHeight = bitmap.height || target.height;
    if (!actualWidth || !actualHeight || actualWidth > maxEdge || actualHeight > maxEdge || actualWidth * actualHeight > maxPixels) {
      throw new RangeError('ブラウザーがプレビューを安全なサイズへ縮小できませんでした。元ファイルは保存できます。');
    }
    const canvas = documentRef.createElement('canvas');
    canvas.width = actualWidth; canvas.height = actualHeight;
    try {
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) throw new Error('プレビュー用の描画領域を作れません。元ファイルは保存できます。');
      context.drawImage(bitmap, 0, 0, actualWidth, actualHeight);
      return await new Promise((resolve, reject) => canvas.toBlob((result) => result
        ? resolve(result)
        : reject(new Error('縮小プレビューを書き出せません。元ファイルは保存できます。')), 'image/png'));
    } finally { canvas.width = canvas.height = 1; }
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error(error?.message || '縮小プレビューを準備できません。元ファイルは保存できます。');
  } finally { bitmap?.close?.(); }
}

function abortError() { return new DOMException('読み込みを中止しました。', 'AbortError'); }

function checkAbort(signal) { if (signal?.aborted) throw abortError(); }

function readU32(bytes, offset) {
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function readU32LittleEndian(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readU16LittleEndian(bytes, offset) { return bytes[offset] | (bytes[offset + 1] << 8); }

function assertImageHeaderBounds({ width, height, frames = 1, animated = false }) {
  const pixels = width * height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
      || width > MAX_EDGE || height > MAX_EDGE || !Number.isSafeInteger(pixels)
      || pixels > MAX_STILL_PIXELS || !Number.isSafeInteger(frames) || frames < 1 || frames > MAX_FRAMES) {
    throw new RangeError('画像のヘッダー情報が上限を超えています。4096px以下・800万画素以下・600コマまでの素材を選んでください。');
  }
  if (animated && pixels * frames > MAX_TIMELINE_PIXELS) throw new RangeError('アニメーションの展開サイズが上限を超えています。サイズを下げるかコマ数を減らしてください。');
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
  let width = 0; let height = 0; let frames = 1; let totalPlays = 1; let animated = false;
  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset);
    if (length > bytes.length - offset - 12) throw new Error('PNGのチャンクが壊れています。元のファイルは変更していません。');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type === 'IHDR') {
      if (length !== 13 || offset !== 8) throw new Error('PNGの画像情報が壊れています。');
      width = readU32(bytes, offset + 8); height = readU32(bytes, offset + 12);
    } else if (type === 'acTL') {
      if (length !== 8) throw new Error('APNGの再生情報が壊れています。');
      frames = readU32(bytes, offset + 8); totalPlays = readU32(bytes, offset + 12); animated = true;
    }
    if (type === 'IEND') break;
    offset += length + 12;
  }
  assertImageHeaderBounds({ width, height, frames, animated });
  return { width, height, frames, totalPlays, animated };
}

function gifAnimationInfo(bytes) {
  if (bytes.length < 13 || !['GIF87a', 'GIF89a'].includes(String.fromCharCode(...bytes.subarray(0, 6)))) throw new Error('GIFの画像情報が壊れています。');
  const width = readU16LittleEndian(bytes, 6); const height = readU16LittleEndian(bytes, 8);
  let offset = 13;
  const screenFlags = bytes[10];
  if (screenFlags & 0x80) offset += 3 * (1 << ((screenFlags & 0x07) + 1));
  let frames = 0; let totalPlays = 1;
  while (offset < bytes.length) {
    const marker = bytes[offset++];
    if (marker === 0x3b) break;
    if (marker === 0x2c) {
      if (offset + 9 > bytes.length) throw new Error('GIFの画像情報が壊れています。');
      const imageFlags = bytes[offset + 8];
      offset += 9;
      if (imageFlags & 0x80) offset += 3 * (1 << ((imageFlags & 0x07) + 1));
      if (offset >= bytes.length) throw new Error('GIFの画像情報が壊れています。');
      offset += 1; // LZW minimum code size
      frames += 1;
    } else if (marker !== 0x21) {
      throw new Error('GIFの画像情報が壊れています。');
    } else {
      if (offset >= bytes.length) throw new Error('GIFの画像情報が壊れています。');
      const label = bytes[offset++];
      if (label === 0xff) {
        if (offset >= bytes.length) throw new Error('GIFの画像情報が壊れています。');
        const appLength = bytes[offset++];
        if (appLength > bytes.length - offset) throw new Error('GIFの画像情報が壊れています。');
        const app = String.fromCharCode(...bytes.subarray(offset, offset + appLength)); offset += appLength;
        let firstBlock = null; let terminated = false;
        while (offset < bytes.length) {
          const blockSize = bytes[offset++];
          if (blockSize === 0) { terminated = true; break; }
          if (blockSize > bytes.length - offset) throw new Error('GIFの画像情報が壊れています。');
          if (!firstBlock) firstBlock = bytes.subarray(offset, offset + blockSize);
          offset += blockSize;
        }
        if (!terminated) throw new Error('GIFの画像情報が壊れています。');
        const isLoopApp = app === 'NETSCAPE2.0' || app === 'ANIMEXTS1.0';
        if (isLoopApp && firstBlock?.length >= 3 && firstBlock[0] === 1) {
          const repeats = readU16LittleEndian(firstBlock, 1);
          totalPlays = gifRepeatsToTotalPlays(repeats);
        }
        continue;
      }
    }
    let terminated = false;
    while (offset < bytes.length) {
      const blockSize = bytes[offset++];
      if (blockSize === 0) { terminated = true; break; }
      if (blockSize > bytes.length - offset) throw new Error('GIFの画像情報が壊れています。');
      offset += blockSize;
    }
    if (!terminated) throw new Error('GIFの画像情報が壊れています。');
  }
  if (frames < 1) throw new Error('GIFに画像コマがありません。');
  const animated = frames > 1;
  assertImageHeaderBounds({ width, height, frames, animated });
  return { width, height, frames, totalPlays, animated };
}

function webpAnimationInfo(bytes) {
  if (imageType(bytes) !== 'image/webp') return null;
  if (bytes.length < 20 || readU32LittleEndian(bytes, 4) > bytes.length - 8) throw new Error('WebPの画像情報が壊れています。');
  let offset = 12; let animated = false; let totalPlays = 1; let width = 0; let height = 0; let frames = 0; let hasAnimChunk = false;
  while (offset + 8 <= bytes.length) {
    const kind = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const length = readU32LittleEndian(bytes, offset + 4);
    if (length > bytes.length - offset - 8) throw new Error('WebPの画像情報が壊れています。');
    if (kind === 'VP8X') {
      if (length < 10) throw new Error('WebPの画像情報が壊れています。');
      animated = Boolean(bytes[offset + 8] & 0x02);
      width = readU24LittleEndian(bytes, offset + 12) + 1;
      height = readU24LittleEndian(bytes, offset + 15) + 1;
    }
    if (kind === 'ANIM') {
      if (length < 6) throw new Error('WebPの再生情報が壊れています。');
      hasAnimChunk = true;
      totalPlays = readU16LittleEndian(bytes, offset + 12);
    }
    if (kind === 'ANMF') frames += 1;
    if (!width && kind === 'VP8 ' && length >= 10 && bytes[offset + 11] === 0x9d && bytes[offset + 12] === 0x01 && bytes[offset + 13] === 0x2a) {
      width = readU16LittleEndian(bytes, offset + 14) & 0x3fff; height = readU16LittleEndian(bytes, offset + 16) & 0x3fff;
    }
    if (!width && kind === 'VP8L' && length >= 5 && bytes[offset + 8] === 0x2f) {
      width = 1 + bytes[offset + 9] + ((bytes[offset + 10] & 0x3f) << 8);
      height = 1 + ((bytes[offset + 10] >> 6) | (bytes[offset + 11] << 2) | ((bytes[offset + 12] & 0x0f) << 10));
    }
    offset += 8 + length + (length & 1);
  }
  if (animated && !hasAnimChunk) throw new Error('アニメーションWebPの再生情報がありません。');
  if (animated && frames < 1) throw new Error('WebPにアニメーションコマがありません。');
  if (!animated) frames = 1;
  assertImageHeaderBounds({ width, height, frames, animated });
  return { width, height, frames, totalPlays: animated ? totalPlays : 1, animated };
}

function readU24LittleEndian(bytes, offset) { return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16); }

function jpegDimensions(bytes) {
  if (imageType(bytes) !== 'image/jpeg') return null;
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) throw new Error('JPEGの画像情報が壊れています。');
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || length > bytes.length - offset) throw new Error('JPEGの画像情報が壊れています。');
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) throw new Error('JPEGの画像情報が壊れています。');
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4]; const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      assertImageHeaderBounds({ width, height });
      return { width, height, frames: 1, totalPlays: 1, animated: false };
    }
    offset += length;
  }
  throw new Error('JPEGのサイズを確認できません。元のファイルは変更していません。');
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

async function decodeAnimated(blob, type, bytes, signal, { ImageDecoderImpl = globalThis.ImageDecoder, documentRef = globalThis.document, onFrameProgress = () => {} } = {}, headerInfo) {
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
    if (headerInfo?.animated && track.frameCount !== headerInfo.frames) throw new Error('画像ヘッダーとアニメーションのコマ数が一致しません。元のファイルは変更していません。');
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
    const info = type === 'image/gif' ? gifAnimationInfo(bytes)
      : type === 'image/webp' ? webpAnimationInfo(bytes)
        : pngAnimationInfo(bytes);
    return { frames, totalPlays: info?.totalPlays ?? 1 };
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
  const headerInfo = type === 'image/png' ? pngAnimationInfo(bytes)
    : type === 'image/gif' ? gifAnimationInfo(bytes)
      : type === 'image/webp' ? webpAnimationInfo(bytes) : jpegDimensions(bytes);
  if (headerInfo?.animated && headerInfo.frames > 1) {
    const result = await decodeAnimated(file, type, bytes, signal, dependencies, headerInfo);
    return { frames: result.frames.map((frame, index) => ({ ...frame, name: result.frames.length > 1 ? `${file.name || 'アニメーション'} · ${index + 1}` : (file.name || '画像') })), totalPlays: result.totalPlays };
  }
  return { frames: [{ ...(await decodeCanvasImage(file, signal, dependencies)), name: file.name || '画像' }], totalPlays: 1 };
}

function wavPreflight(bytes) {
  if (bytes.length < 12 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' || String.fromCharCode(...bytes.subarray(8, 12)) !== 'WAVE') return null;
  let offset = 12; let format = null; let dataLength = 0;
  while (offset + 8 <= bytes.length) {
    const kind = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const length = readU32LittleEndian(bytes, offset + 4);
    if (length > bytes.length - offset - 8) throw new Error('WAVのチャンク情報が壊れています。');
    if (kind === 'fmt ') {
      if (length < 16) throw new Error('WAVの音声情報が壊れています。');
      format = { code: readU16LittleEndian(bytes, offset + 8), channels: readU16LittleEndian(bytes, offset + 10), sampleRate: readU32LittleEndian(bytes, offset + 12), byteRate: readU32LittleEndian(bytes, offset + 16) };
    } else if (kind === 'data') dataLength = length;
    offset += 8 + length + (length & 1);
  }
  if (!format || !dataLength || ![1, 3].includes(format.code)) return null;
  const durationSeconds = dataLength / format.byteRate;
  assertAudioBounds({ durationSeconds, channels: format.channels, sampleRate: format.sampleRate });
  return { durationSeconds, ...format };
}

const MPEG_BITRATES = {
  '1-1': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  '1-3': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
};

function mpegFrameAt(bytes, start, limit = bytes.length) {
  for (let offset = start; offset + 4 <= limit; offset += 1) {
    const word = readU32(bytes, offset);
    if (((word & 0xffe00000) >>> 0) !== 0xffe00000) continue;
    const versionBits = (word >>> 19) & 3; const layerBits = (word >>> 17) & 3; const bitrateIndex = (word >>> 12) & 15; const rateIndex = (word >>> 10) & 3;
    if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) continue;
    const version = versionBits === 3 ? 1 : 2; const layer = 4 - layerBits;
    const baseRate = [44100, 48000, 32000][rateIndex]; const sampleRate = version === 1 ? baseRate : baseRate / (versionBits === 2 ? 2 : 4);
    const bitrate = MPEG_BITRATES[`${version}-${layer}`]?.[bitrateIndex] * 1000;
    const channels = ((word >>> 6) & 3) === 3 ? 1 : 2;
    const samples = layer === 1 ? 384 : (layer === 3 && version !== 1 ? 576 : 1152);
    return { offset, version, layer, bitrate, sampleRate, channels, samples };
  }
  return null;
}

function mp3Preflight(bytes) {
  let start = 0;
  if (bytes.length >= 10 && String.fromCharCode(...bytes.subarray(0, 3)) === 'ID3') {
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    start = 10 + size + ((bytes[5] & 0x10) ? 10 : 0);
  }
  const first = mpegFrameAt(bytes, start);
  if (!first) return null;
  let offset = first.offset; let samples = 0; let frames = 0;
  while (offset + 4 <= bytes.length) {
    const frame = mpegFrameAt(bytes, offset, offset + 4);
    if (!frame || frame.version !== first.version || frame.layer !== first.layer || frame.sampleRate !== first.sampleRate) break;
    const padding = (readU32(bytes, offset) >>> 9) & 1;
    const frameLength = frame.layer === 1 ? Math.floor(12 * frame.bitrate / frame.sampleRate + padding) * 4
      : Math.floor((frame.layer === 3 && frame.version !== 1 ? 72 : 144) * frame.bitrate / frame.sampleRate + padding);
    if (frameLength < 4 || frameLength > bytes.length - offset) break;
    samples += frame.samples; frames += 1; offset += frameLength;
  }
  if (!frames) return null;
  const durationSeconds = samples / first.sampleRate;
  assertAudioBounds({ durationSeconds, channels: first.channels, sampleRate: first.sampleRate });
  return { durationSeconds, channels: first.channels, sampleRate: first.sampleRate };
}

function assertAudioBounds({ durationSeconds, channels, sampleRate }) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > MAX_AUDIO_SECONDS) throw new RangeError('音声は120秒以内のファイルを選んでください。');
  if (!Number.isInteger(channels) || channels < 1 || channels > 2 || sampleRate < 8000 || sampleRate > 48000) throw new Error('音声はモノラル/ステレオ、8〜48kHzの範囲に対応しています。');
  if (durationSeconds * sampleRate * channels * 4 > MAX_AUDIO_DECODED_BYTES) throw new RangeError('展開後の音声が64MBを超える見込みです。短い音声を選んでください。');
}

async function decodeAudioFile(file, audioContext, signal) {
  if (file.size < 1 || file.size > MAX_FILE_BYTES) throw new RangeError('音声は1ファイル64MBまで読み込めます。');
  checkAbort(signal);
  const signature = new Uint8Array(await file.slice(0, Math.min(file.size, 64)).arrayBuffer());
  const looksWav = signature.length >= 12 && String.fromCharCode(...signature.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...signature.subarray(8, 12)) === 'WAVE';
  const looksMp3 = (signature.length >= 3 && String.fromCharCode(...signature.subarray(0, 3)) === 'ID3') || Boolean(mpegFrameAt(signature, 0));
  if (file.size > MAX_UNKNOWN_AUDIO_BYTES && !looksWav && !looksMp3) throw new RangeError('形式を事前確認できない音声は4MBまで読み込めます。短いファイルを選んでください。');
  const bytes = await file.arrayBuffer();
  const encoded = new Uint8Array(bytes);
  const preflight = looksWav ? wavPreflight(encoded) : mp3Preflight(encoded);
  if (!preflight && file.size > MAX_UNKNOWN_AUDIO_BYTES) throw new RangeError('音声の長さを事前確認できないファイルは4MBまで読み込めます。');
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
  assertAudioBounds({ durationSeconds: audio.duration, channels: audio.numberOfChannels, sampleRate: audio.sampleRate });
  const decodedBytes = audio.length * audio.numberOfChannels * 4;
  if (decodedBytes > MAX_AUDIO_DECODED_BYTES) throw new RangeError('展開後の音声が64MBを超えています。短い音声を選んでください。');
  const channels = [];
  for (let channel = 0; channel < audio.numberOfChannels; channel += 1) channels.push(new Float32Array(audio.getChannelData(channel)));
  return { sampleRate: audio.sampleRate, durationSeconds: audio.duration, channels, name: file.name || '音声' };
}

function videoCandidate(file) {
  const mime = String(file?.type || '').split(';', 1)[0].toLowerCase();
  const extension = String(file?.name || '').split('.').pop().toLowerCase();
  return ['video/mp4', 'video/webm'].includes(mime) || ['mp4', 'webm'].includes(extension);
}

async function decodeVideoFile(file, signal, { documentRef = globalThis.document, URLImpl = globalThis.URL } = {}) {
  if (!videoCandidate(file)) throw new Error(`${file.name || '選択したファイル'}は対応していない形式です。動画はブラウザーが読み込めるMP4/WebMに対応しています。`);
  if (file.size < 1 || file.size > MAX_FILE_BYTES) throw new RangeError('動画は1ファイル64MBまで読み込めます。');
  const mime = String(file.type || '').split(';', 1)[0].toLowerCase();
  if (mime && mime !== 'application/octet-stream' && !['video/mp4', 'video/webm'].includes(mime)) throw new Error('動画はMP4/WebMに対応しています。');
  if (typeof URLImpl?.createObjectURL !== 'function' || !documentRef?.createElement) throw new Error('このブラウザーでは動画を確認できません。');
  checkAbort(signal);
  const url = URLImpl.createObjectURL(file);
  const video = documentRef.createElement('video');
  video.muted = true; video.defaultMuted = true; video.playsInline = true; video.preload = 'metadata'; video.src = url;
  const cleanup = () => { video.pause?.(); video.removeAttribute?.('src'); video.load?.(); URLImpl.revokeObjectURL?.(url); };
  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => { if (settled) return; settled = true; video.removeEventListener?.('loadedmetadata', onReady); video.removeEventListener?.('error', onError); signal?.removeEventListener('abort', onAbort); error ? reject(error) : resolve(); };
      const onReady = () => finish();
      const onError = () => finish(new Error('動画をデコードできませんでした。MP4/WebMの別ファイルを選んでください。'));
      const onAbort = () => finish(abortError());
      video.addEventListener?.('loadedmetadata', onReady, { once: true }); video.addEventListener?.('error', onError, { once: true }); signal?.addEventListener('abort', onAbort, { once: true });
      video.src = url; video.load?.();
      if (video.readyState >= 1) finish();
    });
    checkAbort(signal);
    const { videoWidth: width, videoHeight: height, duration: durationSeconds } = video;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_VIDEO_PIXELS) throw new RangeError('動画の画像サイズは4096px以下・800万画素以下にしてください。');
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > MAX_VIDEO_SECONDS) throw new RangeError('動画は120秒以内のファイルを選んでください。');
    if (video.readyState < 2) {
      await new Promise((resolve, reject) => {
        const finish = (error) => { video.removeEventListener?.('seeked', onReady); video.removeEventListener?.('error', onError); signal?.removeEventListener('abort', onAbort); error ? reject(error) : resolve(); };
        const onReady = () => finish(); const onError = () => finish(new Error('動画の映像コマを読み込めませんでした。'));
        const onAbort = () => finish(abortError());
        video.addEventListener?.('seeked', onReady, { once: true }); video.addEventListener?.('error', onError, { once: true }); signal?.addEventListener('abort', onAbort, { once: true });
        try { video.currentTime = Math.min(0.05, durationSeconds / 2); } catch (error) { finish(error); }
      });
    }
    checkAbort(signal);
    const canvas = documentRef.createElement('canvas'); canvas.width = width; canvas.height = height;
    let poster;
    try {
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('動画のプレビュー画像を作れませんでした。');
      context.imageSmoothingEnabled = false; context.drawImage(video, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height);
      poster = { width, height, data: new Uint8Array(pixels.data), delayMs: 500, name: file.name || '動画' };
    } finally { canvas.width = canvas.height = 1; }
    const normalizedMime = ['video/mp4', 'video/webm'].includes(mime) ? mime : (String(file.name || '').toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4');
    return { blob: file, mime: normalizedMime, width, height, durationSeconds, name: file.name || '動画', poster };
  } finally { cleanup(); }
}

/** Decode only locally selected files. No input bytes, filenames, or URLs leave this page. */
export async function importOutputFiles(files, { signal, onProgress = () => {}, AudioContextImpl = globalThis.AudioContext || globalThis.webkitAudioContext, createImageBitmapImpl = globalThis.createImageBitmap, ImageDecoderImpl = globalThis.ImageDecoder, documentRef = globalThis.document, URLImpl = globalThis.URL } = {}) {
  const selected = [...(files || [])];
  if (!selected.length) throw new Error('ファイルを選んでください。');
  if (selected.length > MAX_FILES) throw new RangeError('一度に8ファイルまで追加できます。');
  const bytes = selected.reduce((sum, file) => sum + (Number(file?.size) || 0), 0);
  if (bytes > MAX_TOTAL_BYTES) throw new RangeError('選んだファイルの合計が128MBを超えています。数を減らしてください。');
  const output = { frames: [], totalPlays: 1, audio: null, video: null };
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
        if (!output.frames.length && decoded.frames.length > 1) output.totalPlays = decoded.totalPlays;
        output.frames.push(...decoded.frames);
      } else if (videoCandidate(file)) {
        if (output.video) throw new Error('動画は1つずつ読み込んでください。');
        output.video = await decodeVideoFile(file, signal, { documentRef, URLImpl });
      } else {
        if (String(file.type || '').startsWith('video/')) throw new Error(`${file.name || '選択したファイル'}は対応していない形式です。動画はMP4/WebMに対応しています。`);
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
    if (!output.frames.length && !output.audio && !output.video) throw new Error('選んだファイルを読み込めませんでした。');
    return output;
  } finally { try { await audioContext?.close?.(); } catch { /* release decoded input context */ } }
}

export const OUTPUT_IMPORT_LIMITS = Object.freeze({ MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, MAX_EDGE, MAX_STILL_PIXELS, MAX_TIMELINE_PIXELS, MAX_FRAMES, MAX_AUDIO_SECONDS, MAX_AUDIO_DECODED_BYTES, MAX_UNKNOWN_AUDIO_BYTES, MAX_VIDEO_SECONDS, MAX_VIDEO_PIXELS });
