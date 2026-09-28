import { inspectPixelPng, withPixelPngMetadata } from './pixel-png-metadata.mjs';

export const MIN_DOTS = 8;
export const MAX_PIXEL_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PIXEL_IMAGE_EDGE = 4096;
export const MAX_PIXEL_IMAGE_PIXELS = 16 * 1024 * 1024;

const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

function samePixel(data, first, second) {
  if (data[first + 3] === 0 && data[second + 3] === 0) return true;
  return data[first] === data[second] && data[first + 1] === data[second + 1]
    && data[first + 2] === data[second + 2] && data[first + 3] === data[second + 3];
}

function validImage(image) {
  return image && Number.isSafeInteger(image.width) && Number.isSafeInteger(image.height)
    && image.width > 0 && image.height > 0 && image.width <= MAX_PIXEL_IMAGE_EDGE && image.height <= MAX_PIXEL_IMAGE_EDGE
    && image.width * image.height <= MAX_PIXEL_IMAGE_PIXELS && image.data
    && image.data.length === image.width * image.height * 4;
}

/** Largest exact grid size whose square blocks are all homogeneous. */
export function detectPixelScale(image) {
  if (!validImage(image)) return 1;
  let scale = gcd(image.width, image.height);
  if (scale === 1) return 1;
  const { width, height, data } = image;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 1; x < width; x += 1) {
      if (x % scale === 0) continue;
      if (!samePixel(data, (row + x - 1) * 4, (row + x) * 4)) {
        scale = gcd(scale, x); if (scale === 1) return 1;
      }
    }
  }
  for (let y = 1; y < height; y += 1) {
    if (y % scale === 0) continue;
    const above = (y - 1) * width; const here = y * width;
    for (let x = 0; x < width; x += 1) {
      if (!samePixel(data, (above + x) * 4, (here + x) * 4)) {
        scale = gcd(scale, y); if (scale === 1) return 1; break;
      }
    }
  }
  return scale;
}

/** Largest divisor of an inferred grid that retains `minDots` on the short side. */
export function reductionScale(image, { minDots = MIN_DOTS } = {}) {
  const detected = detectPixelScale(image);
  const floor = Number.isSafeInteger(minDots) && minDots > 0 ? minDots : MIN_DOTS;
  const shortSide = Math.min(image.width, image.height);
  for (let scale = detected; scale > 1; scale -= 1) {
    if (detected % scale === 0 && shortSide / scale >= Math.min(floor, shortSide)) return scale;
  }
  return 1;
}

/** Sample one pixel from each exact homogeneous block. */
export function downscalePixels({ width, height, data }, scale) {
  if (!Number.isSafeInteger(scale) || scale < 1 || width % scale || height % scale) throw new RangeError('Pixel scale must divide image dimensions');
  if (scale === 1) return { width, height, data };
  const w = width / scale; const h = height / scale; const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const from = ((y * scale) * width + x * scale) * 4; const to = (y * w + x) * 4;
    out[to] = data[from]; out[to + 1] = data[from + 1]; out[to + 2] = data[from + 2]; out[to + 3] = data[from + 3];
  }
  return { width: w, height: h, data: out };
}

function metadataScale(image, metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const { width, height, scale, version } = metadata;
  if (version !== 1 || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || !Number.isSafeInteger(scale)
    || width < 1 || height < 1 || scale < 1 || width * scale !== image.width || height * scale !== image.height) return null;
  return scale;
}

function blocksAreExact(image, scale) {
  const { width, height, data } = image;
  for (let y = 0; y < height; y += scale) for (let x = 0; x < width; x += scale) {
    const first = (y * width + x) * 4;
    for (let dy = 0; dy < scale; dy += 1) for (let dx = 0; dx < scale; dx += 1) {
      if (!samePixel(data, first, ((y + dy) * width + x + dx) * 4)) return false;
    }
  }
  return true;
}

/** Normalize an RGBA image. Valid explicit metadata wins over ambiguous visual inference. */
export function normalizePixels(image, { metadata = null, inferScale = true, minDots = MIN_DOTS } = {}) {
  if (!validImage(image)) throw new TypeError('Image dimensions or RGBA data are invalid');
  let scale = 1;
  if (metadata !== null) {
    const claimed = metadataScale(image, metadata);
    if (claimed !== null && (claimed === 1 || blocksAreExact(image, claimed))) scale = claimed;
    // A present but invalid claim must never fall through to a more destructive guess.
  } else if (inferScale) {
    scale = reductionScale(image, { minDots });
  }
  const reduced = downscalePixels(image, scale);
  return { ...reduced, scale, sourceWidth: image.width, sourceHeight: image.height };
}

function readU24(bytes, offset) { return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16); }

/** Read PNG, WebP or JPEG dimensions from a bounded header before raster decoding. */
export function readPixelImageDimensions(header, mimeType) {
  if (!(header instanceof Uint8Array)) return null;
  let width = 0; let height = 0;
  const ascii = (start, length) => String.fromCharCode(...header.subarray(start, start + length));
  if (mimeType === 'image/png' && header.length >= 24 && ascii(0, 8) === '\x89PNG\r\n\x1a\n' && ascii(12, 4) === 'IHDR') {
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength); width = view.getUint32(16); height = view.getUint32(20);
  } else if (mimeType === 'image/webp' && header.length >= 25 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const kind = ascii(12, 4);
    if (kind === 'VP8X' && header.length >= 30) { width = 1 + readU24(header, 24); height = 1 + readU24(header, 27); }
    else if (kind === 'VP8 ' && header.length >= 30 && header[23] === 0x9d && header[24] === 0x01 && header[25] === 0x2a) {
      const view = new DataView(header.buffer, header.byteOffset, header.byteLength); width = view.getUint16(26, true) & 0x3fff; height = view.getUint16(28, true) & 0x3fff;
    } else if (kind === 'VP8L' && header[20] === 0x2f) {
      width = 1 + ((header[21] | (header[22] << 8)) & 0x3fff);
      height = 1 + (((header[22] >> 6) | (header[23] << 2) | ((header[24] & 0x0f) << 10)) & 0x3fff);
    }
  } else if (mimeType === 'image/jpeg' && header.length >= 4 && header[0] === 0xff && header[1] === 0xd8) {
    const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 4 <= header.length) {
      if (header[offset] !== 0xff) return null;
      while (header[offset] === 0xff) offset += 1;
      const marker = header[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      if (offset + 2 > header.length) return null;
      const length = (header[offset] << 8) | header[offset + 1];
      if (length < 2 || offset + length > header.length) return null;
      if (sof.has(marker)) {
        if (length < 7) return null;
        height = (header[offset + 3] << 8) | header[offset + 4]; width = (header[offset + 5] << 8) | header[offset + 6]; break;
      }
      offset += length;
    }
  }
  return Number.isSafeInteger(width * height) && width > 0 && height > 0 ? { width, height } : null;
}

function readPixels(source, documentRef) {
  const canvas = documentRef.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('画像を読み込めませんでした。');
  context.imageSmoothingEnabled = false; context.drawImage(source, 0, 0);
  const image = { width: source.width, height: source.height, data: context.getImageData(0, 0, source.width, source.height).data };
  canvas.width = 1; canvas.height = 1;
  return image;
}

function imageDataForCanvas(image, context, documentRef) {
  if (typeof ImageData === 'function') return new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  const imageData = context.createImageData?.(image.width, image.height);
  if (!imageData) throw new Error('このブラウザーでは画像を作れません。');
  imageData.data.set(image.data); return imageData;
}

async function pngFromPixels(image, documentRef) {
  const canvas = documentRef.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('画像を作れませんでした。');
  context.putImageData(imageDataForCanvas(image, context, documentRef), 0, 0);
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNGを作れませんでした。')), 'image/png'));
  canvas.width = 1; canvas.height = 1;
  if (blob.size > MAX_PIXEL_FILE_BYTES) throw new RangeError('正規化した画像が10MBを超えています。');
  return withPixelPngMetadata(blob, { width: image.width, height: image.height, scale: 1 });
}

/** Validate, decode and optionally normalize an image file within bounded raster limits. */
export async function normalizePixelFile(file, { createImageBitmapImpl = globalThis.createImageBitmap, documentRef = globalThis.document, inferScale = true, minDots = MIN_DOTS, keepScale = false } = {}) {
  if (!file || typeof file.slice !== 'function' || !Number.isSafeInteger(file.size) || file.size < 1) throw new TypeError('画像ファイルを選んでください。');
  if (file.size > MAX_PIXEL_FILE_BYTES) throw new RangeError('画像ファイルは10MB以内にしてください。');
  if (!['image/png', 'image/webp', 'image/jpeg'].includes(file.type)) throw new TypeError('PNG、WebP、JPEGの画像を選んでください。');
  if (typeof createImageBitmapImpl !== 'function') throw new Error('このブラウザーでは画像を確認できません。');
  if (!documentRef?.createElement) throw new Error('このブラウザーでは画像を確認できません。');
  const headerSize = file.type === 'image/jpeg' ? 64 * 1024 : 32;
  const header = new Uint8Array(await file.slice(0, headerSize).arrayBuffer());
  const dimensions = readPixelImageDimensions(header, file.type);
  if (!dimensions) throw new TypeError('画像ファイルの形式や寸法を確認できません。');
  if (dimensions.width > MAX_PIXEL_IMAGE_EDGE || dimensions.height > MAX_PIXEL_IMAGE_EDGE || dimensions.width * dimensions.height > MAX_PIXEL_IMAGE_PIXELS) throw new RangeError('画像の画素数が多すぎます（最大4096px、約1600万画素です）。');

  let metadata = null; let metadataClaimPresent = false;
  if (file.type === 'image/png') {
    const png = new Uint8Array(await file.arrayBuffer()); const parsed = inspectPixelPng(png);
    if (!parsed.valid || parsed.width !== dimensions.width || parsed.height !== dimensions.height) throw new TypeError('PNGのチャンク、CRC、寸法を確認できません。');
    metadata = parsed.metadata; metadataClaimPresent = parsed.containsMetadata;
  }
  const bitmap = await createImageBitmapImpl(file);
  let pixels;
  try {
    const sameDimensions = bitmap.width === dimensions.width && bitmap.height === dimensions.height;
    // JPEG decoders may apply EXIF orientation before reporting raster dimensions.
    const orientedJpeg = file.type === 'image/jpeg' && bitmap.width === dimensions.height && bitmap.height === dimensions.width;
    if (!bitmap.width || !bitmap.height || (!sameDimensions && !orientedJpeg)) throw new TypeError('画像の寸法を確認できませんでした。');
    pixels = readPixels(bitmap, documentRef);
  } finally { bitmap.close?.(); }
  const result = normalizePixels(pixels, {
    metadata: keepScale ? null : metadataClaimPresent && !metadata ? { version: 0 } : metadata,
    inferScale: keepScale ? false : inferScale,
    minDots
  });
  if (result.scale === 1) return { file, ...result };
  const normalizedFile = await pngFromPixels(result, documentRef);
  return { file: normalizedFile, ...result };
}

/** A short note for the person when an image was shrunk; '' when nothing changed. */
export function scaleNotice({ scale, width, height }) {
  return scale > 1 ? `${scale}倍の画像を${width}×${height}pxで読み込みました。` : '';
}

export function snapToWholePixels(element, dots, { devicePixelRatio = globalThis.devicePixelRatio || 1 } = {}) {
  if (!element || !(dots > 0)) return 0;
  element.style.removeProperty('width');
  const borderBox = globalThis.getComputedStyle?.(element).boxSizing === 'border-box';
  const edge = borderBox ? element.offsetWidth - element.clientWidth : 0;
  const available = element.clientWidth; const perDot = Math.floor((available * devicePixelRatio + 0.01) / dots);
  if (perDot < 1) return 0;
  element.style.width = `${(dots * perDot) / devicePixelRatio + edge}px`;
  return perDot;
}

export function wholePixelFit(dotsWide, dotsHigh, boxWidth, boxHeight, { devicePixelRatio = globalThis.devicePixelRatio || 1 } = {}) {
  const perDot = Math.floor(Math.min((boxWidth * devicePixelRatio + 0.01) / dotsWide, (boxHeight * devicePixelRatio + 0.01) / dotsHigh));
  if (perDot < 1) { const scale = Math.min(boxWidth / dotsWide, boxHeight / dotsHigh); return { width: dotsWide * scale, height: dotsHigh * scale, perDot: 0 }; }
  return { width: (dotsWide * perDot) / devicePixelRatio, height: (dotsHigh * perDot) / devicePixelRatio, perDot };
}
