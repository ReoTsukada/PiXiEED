import { encodeAnimatedGif } from '../animated-export.mjs?rev=20261008-output-progress-1';

export const OUTPUT_FORMATS = Object.freeze(['png', 'jpeg', 'svg', 'gif', 'apng']);
export const OUTPUT_MAX_EDGE = 4096;
export const OUTPUT_MAX_PIXELS = 16_777_216;
export const OUTPUT_MAX_ANIMATED_PIXELS = 8_000_000;
export const OUTPUT_MAX_FRAMES = 600;
export const OUTPUT_MAX_SVG_BYTES = 32 * 1024 * 1024;

const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const MIME = Object.freeze({ png: 'image/png', jpeg: 'image/jpeg', svg: 'image/svg+xml', gif: 'image/gif', apng: 'image/apng' });

function checkFrame(frame) {
  if (!frame || !Number.isSafeInteger(frame.width) || !Number.isSafeInteger(frame.height)
      || frame.width < 1 || frame.height < 1 || frame.width > OUTPUT_MAX_EDGE || frame.height > OUTPUT_MAX_EDGE
      || frame.width * frame.height > OUTPUT_MAX_PIXELS || !ArrayBuffer.isView(frame.data)
      || frame.data.BYTES_PER_ELEMENT !== 1 || frame.data.length !== frame.width * frame.height * 4) {
    throw new RangeError('画像フレームのサイズまたはRGBAデータが不正です。');
  }
}

function checkFrames(frames, animated) {
  if (!Array.isArray(frames) || !frames.length || frames.length > OUTPUT_MAX_FRAMES) throw new RangeError('画像フレーム数が上限を超えています。');
  frames.forEach(checkFrame);
  const { width, height } = frames[0];
  if (frames.some((frame) => frame.width !== width || frame.height !== height)) throw new RangeError('アニメーションの各フレームは同じサイズにしてください。');
  if (animated && width * height * frames.length > OUTPUT_MAX_ANIMATED_PIXELS) throw new RangeError('アニメーションの画像データが大きすぎます。フレーム数かサイズを下げてください。');
  if (animated && frames.some((frame) => !Number.isFinite(frame.delayMs ?? 100) || (frame.delayMs ?? 100) < 1 || (frame.delayMs ?? 100) > 3_600_000)) {
    throw new RangeError('各フレームの表示時間は1〜3600000msで指定してください。');
  }
}

function scaleFrame(frame, scale, requestedWidth = null, requestedHeight = null) {
  const width = requestedWidth ?? frame.width * scale; const height = requestedHeight ?? frame.height * scale;
  if (width === frame.width && height === frame.height) return frame;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new RangeError('出力サイズが不正です。');
  if (width > OUTPUT_MAX_EDGE || height > OUTPUT_MAX_EDGE || width * height > OUTPUT_MAX_PIXELS) throw new RangeError('出力画像のサイズが上限を超えています。拡大率を下げてください。');
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const source = ((Math.min(frame.height - 1, Math.floor(y * frame.height / height)) * frame.width) + Math.min(frame.width - 1, Math.floor(x * frame.width / width))) * 4;
    data.set(frame.data.subarray(source, source + 4), (y * width + x) * 4);
  }
  return { width, height, data, ...(frame.delayMs === undefined ? {} : { delayMs: frame.delayMs }) };
}

function bytesOf(value) {
  if (value instanceof Blob) return value.arrayBuffer().then((bytes) => new Uint8Array(bytes));
  if (value instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(value));
  if (ArrayBuffer.isView(value) && value.BYTES_PER_ELEMENT === 1) return Promise.resolve(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  throw new TypeError('画像エンコーダーはBlobまたはbyte配列を返してください。');
}

function signatureMatches(format, bytes) {
  if (format === 'png' || format === 'apng') return bytes.length >= 8 && PNG_SIGNATURE.every((byte, i) => bytes[i] === byte);
  if (format === 'jpeg') return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  if (format === 'gif') return bytes.length >= 6 && String.fromCharCode(...bytes.subarray(0, 6)).startsWith('GIF8');
  if (format === 'svg') return bytes.length > 0 && new TextDecoder().decode(bytes).includes('<svg');
  return false;
}

function makeBlob(bytes, format) {
  if (!signatureMatches(format, bytes)) throw new Error(`${format.toUpperCase()}形式の出力を確認できません。`);
  return new Blob([bytes], { type: MIME[format] });
}

function parseHexColor(value) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new TypeError('JPEGの背景色は#RRGGBBで指定してください。');
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function flattenFrame(frame, background) {
  const color = parseHexColor(background);
  const data = new Uint8ClampedArray(frame.data.length);
  for (let index = 0; index < data.length; index += 4) {
    const alpha = frame.data[index + 3] / 255;
    data[index] = Math.round(frame.data[index] * alpha + color[0] * (1 - alpha));
    data[index + 1] = Math.round(frame.data[index + 1] * alpha + color[1] * (1 - alpha));
    data[index + 2] = Math.round(frame.data[index + 2] * alpha + color[2] * (1 - alpha));
    data[index + 3] = 255;
  }
  return { width: frame.width, height: frame.height, data };
}

function svgText(frame) {
  const runs = [];
  const prefix = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width}" height="${frame.height}" viewBox="0 0 ${frame.width} ${frame.height}" shape-rendering="crispEdges">`;
  const suffix = '</svg>';
  let outputLength = prefix.length + suffix.length;
  for (let y = 0; y < frame.height; y += 1) {
    let x = 0;
    while (x < frame.width) {
      const offset = (y * frame.width + x) * 4;
      const r = frame.data[offset]; const g = frame.data[offset + 1]; const b = frame.data[offset + 2]; const a = frame.data[offset + 3];
      let end = x + 1;
      while (end < frame.width) {
        const next = (y * frame.width + end) * 4;
        if (frame.data[next] !== r || frame.data[next + 1] !== g || frame.data[next + 2] !== b || frame.data[next + 3] !== a) break;
        end += 1;
      }
      if (a) {
        const rect = `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}"${a === 255 ? '' : ` fill-opacity="${Number((a / 255).toFixed(6))}"`}/>`;
        outputLength += rect.length;
        if (outputLength > OUTPUT_MAX_SVG_BYTES) throw new RangeError('SVGの出力が32MBを超えます。サイズを下げるかPNG形式を選んでください。');
        runs.push(rect);
      }
      x = end;
    }
  }
  return `${prefix}${runs.join('')}${suffix}`;
}

function readU32(bytes, offset) { return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0; }
function writeU32(bytes, offset, value) { bytes[offset] = value >>> 24; bytes[offset + 1] = value >>> 16; bytes[offset + 2] = value >>> 8; bytes[offset + 3] = value; }
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const result = new Uint8Array(data.length + 12);
  writeU32(result, 0, data.length);
  for (let i = 0; i < 4; i += 1) result[4 + i] = type.charCodeAt(i);
  result.set(data, 8); writeU32(result, result.length - 4, crc32(result.subarray(4, result.length - 4)));
  return result;
}

function parsePng(bytes) {
  if (!signatureMatches('png', bytes)) throw new Error('APNGフレームのPNGデータが不正です。');
  let offset = 8; let ihdr = null; const idat = []; const colorChunks = []; let ended = false;
  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset);
    if (length > bytes.length - offset - 12) throw new Error('PNGチャンクが不正です。');
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const bodyStart = offset + 8; const bodyEnd = bodyStart + length; const expected = readU32(bytes, bodyEnd);
    if (crc32(bytes.subarray(offset + 4, bodyEnd)) !== expected) throw new Error('PNGチャンクのCRCが不正です。');
    const body = bytes.subarray(bodyStart, bodyEnd);
    if (type === 'IHDR') { if (ihdr || offset !== 8 || length !== 13) throw new Error('PNGヘッダーが不正です。'); ihdr = body.slice(); }
    else if (type === 'IDAT') idat.push(body.slice());
    else if (type === 'IEND') { ended = true; break; }
    else if (['PLTE', 'tRNS', 'sBIT', 'cHRM', 'gAMA', 'iCCP', 'sRGB'].includes(type)) colorChunks.push({ type, data: body.slice() });
    else if (['acTL', 'fcTL', 'fdAT'].includes(type)) throw new Error('フレームデータに入れ子のAPNGは使えません。');
    else if (type.charCodeAt(0) >= 65 && type.charCodeAt(0) <= 90 && !['PLTE'].includes(type)) throw new Error('対応していないPNGの必須チャンクがあります。');
    offset = bodyEnd + 4;
  }
  if (!ihdr || !idat.length || !ended) throw new Error('PNGの画像データが不足しています。');
  return { ihdr, idat, colorChunks };
}

function delayFraction(delayMs) {
  const ms = Math.max(1, Math.round(delayMs));
  for (let denominator = 1000; denominator >= 1; denominator -= 1) {
    const numerator = Math.round(ms * denominator / 1000);
    if (numerator <= 65535 && numerator > 0) return [numerator, denominator];
  }
  throw new RangeError('APNGのコマ時間を表現できません。');
}

function encodeApng(pngFrames, loopCount) {
  if (!Number.isSafeInteger(loopCount) || loopCount < 0 || loopCount > 0xffffffff) throw new RangeError('ループ回数は0以上の整数で指定してください。');
  const parsed = pngFrames.map(({ bytes }) => parsePng(bytes));
  const ihdr = parsed[0].ihdr;
  if (parsed.some(({ ihdr: candidate }) => !ihdr.every((byte, index) => candidate[index] === byte))) throw new Error('APNGフレーム間でPNGの色形式が一致しません。');
  const colorChunks = parsed[0].colorChunks;
  if (parsed.some(({ colorChunks: chunks }) => chunks.length !== colorChunks.length || chunks.some((entry, index) => entry.type !== colorChunks[index].type || entry.data.length !== colorChunks[index].data.length || entry.data.some((byte, offset) => byte !== colorChunks[index].data[offset])))) {
    throw new Error('APNGフレーム間でPNGの色メタデータが一致しません。');
  }
  const width = readU32(ihdr, 0); const height = readU32(ihdr, 4);
  if (!width || !height || ihdr[8] !== 8 || ![2, 6].includes(ihdr[9]) || ihdr[12] !== 0) throw new Error('APNGには8bit RGB/RGBA・非インターレースPNGが必要です。');
  const output = [PNG_SIGNATURE, chunk('IHDR', ihdr), ...colorChunks.map(({ type, data }) => chunk(type, data))];
  const actl = new Uint8Array(8); writeU32(actl, 0, parsed.length); writeU32(actl, 4, loopCount); output.push(chunk('acTL', actl));
  let sequence = 0;
  pngFrames.forEach((frame, index) => {
    const [numerator, denominator] = delayFraction(pngFrames[index].delayMs ?? 100);
    const fctl = new Uint8Array(26); writeU32(fctl, 0, sequence++); writeU32(fctl, 4, width); writeU32(fctl, 8, height);
    writeU32(fctl, 12, 0); writeU32(fctl, 16, 0); fctl[20] = numerator >>> 8; fctl[21] = numerator;
    fctl[22] = denominator >>> 8; fctl[23] = denominator; fctl[24] = 0; fctl[25] = 0; // SOURCE blend, NONE disposal
    output.push(chunk('fcTL', fctl));
    for (const data of parsed[index].idat) {
      if (index === 0) output.push(chunk('IDAT', data));
      else {
        const fdat = new Uint8Array(data.length + 4); writeU32(fdat, 0, sequence++); fdat.set(data, 4); output.push(chunk('fdAT', fdat));
      }
    }
  });
  output.push(chunk('IEND', new Uint8Array()));
  const length = output.reduce((sum, item) => sum + item.length, 0);
  const bytes = new Uint8Array(length); let offset = 0;
  for (const item of output) { bytes.set(item, offset); offset += item.length; }
  return bytes;
}

function setGifLoop(bytes, loopCount) {
  if (!Number.isSafeInteger(loopCount) || loopCount < 0 || loopCount > 65535) throw new RangeError('GIFのループ回数は0〜65535で指定してください。');
  const needle = [0x21, 0xff, 0x0b, ...new TextEncoder().encode('NETSCAPE2.0'), 3, 1];
  for (let index = 0; index <= bytes.length - needle.length - 2; index += 1) {
    if (needle.every((value, i) => bytes[index + i] === value)) { bytes[index + needle.length] = loopCount & 255; bytes[index + needle.length + 1] = loopCount >>> 8; return bytes; }
  }
  throw new Error('GIFのループ設定を確認できません。');
}

async function encodeRaster(frame, format, encoder, signal, quality = 0.9) {
  if (signal?.aborted) throw new DOMException('出力を中止しました。', 'AbortError');
  if (typeof encoder !== 'function') throw new Error('画像エンコーダーが利用できません。');
  const mime = MIME[format];
  const result = await encoder(frame, mime, quality);
  if (signal?.aborted) throw new DOMException('出力を中止しました。', 'AbortError');
  if (result instanceof Blob && result.type !== mime) throw new Error(`${mime}形式に対応したエンコードが利用できません。PNGなどへの代替出力は行いません。`);
  const bytes = await bytesOf(result);
  if (!signatureMatches(format, bytes)) throw new Error(`${format.toUpperCase()}のMIMEとファイル署名が一致しません。`);
  return bytes;
}

/** Encode one output item from original RGBA frame data. `encodeRaster(frame, mime)` supplies browser canvas encoding. */
export async function encodeOutput({ format, frames, background = '#ffffff', quality = 0.9, loopCount = 0, scale = 1, width = null, height = null } = {}, { encodeRaster: rasterEncoder, signal, onProgress = () => {} } = {}) {
  const progress = (value) => { try { onProgress(Math.max(0, Math.min(1, value))); } catch { /* progress cannot affect encoding */ } };
  if (!OUTPUT_FORMATS.includes(format)) throw new TypeError('選択できない画像形式です。');
  const animated = format === 'gif' || format === 'apng';
  checkFrames(frames, animated);
  if (!Number.isSafeInteger(scale) || scale < 1 || scale > 16) throw new RangeError('拡大率は1〜16の整数で指定してください。');
  if (format === 'jpeg' && (!Number.isFinite(quality) || quality < 0.5 || quality > 1)) throw new RangeError('JPEG画質は50〜100%で指定してください。');
  if ((width === null) !== (height === null)) throw new RangeError('幅と高さを両方指定してください。');
  const outputFrames = frames.map((frame) => scaleFrame(frame, scale, width, height));
  checkFrames(outputFrames, animated);
  const framesWithTiming = outputFrames.map((frame) => ({ ...frame, delayMs: frame.delayMs ?? 100 }));
  if (format === 'svg') { const blob = makeBlob(new TextEncoder().encode(svgText(outputFrames[0])), format); progress(1); return blob; }
  if (format === 'png') { progress(0.25); const blob = makeBlob(await encodeRaster(outputFrames[0], format, rasterEncoder, signal), format); progress(1); return blob; }
  if (format === 'jpeg') { progress(0.25); const blob = makeBlob(await encodeRaster(flattenFrame(outputFrames[0], background), format, rasterEncoder, signal, quality), format); progress(1); return blob; }
  if (format === 'apng') {
    const pngs = [];
    for (let index = 0; index < framesWithTiming.length; index += 1) {
      const frame = framesWithTiming[index];
      pngs.push({ bytes: await encodeRaster(frame, 'png', rasterEncoder, signal), delayMs: frame.delayMs });
      progress((index + 1) / framesWithTiming.length * 0.9);
    }
    const blob = makeBlob(encodeApng(pngs, loopCount), format); progress(1); return blob;
  }
  if (!Number.isSafeInteger(loopCount) || loopCount < 0 || loopCount > 65535) throw new RangeError('GIFのループ回数は0〜65535で指定してください。');
  const encoded = await encodeAnimatedGif(framesWithTiming, { delayMs: 100, maxInputPixels: OUTPUT_MAX_ANIMATED_PIXELS, maxPixels: OUTPUT_MAX_ANIMATED_PIXELS, longEdge: 4096, signal, onProgress: (value) => progress(value * 0.9) });
  progress(0.95);
  const blob = makeBlob(setGifLoop(encoded.bytes, loopCount), format); progress(1); return blob;
}
