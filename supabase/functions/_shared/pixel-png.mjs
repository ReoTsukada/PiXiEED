// Admission decoder for the browser-normalized PNG format. Unsupported PNG
// variants are rejected rather than accepting an unverified colour count.
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const MAX_SIZE = 512;
const MAX_COLORS = 128;
const MAX_BYTES = 512 * 1024;

export class PixelPngError extends Error {
  constructor(code) { super(code); this.name = 'PixelPngError'; this.code = code; }
}

/** @returns {never} */
function invalid() { throw new PixelPngError('image_decode_invalid'); }
function u32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}
function crc32(bytes, start, end) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function parseChunks(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 45 || !SIGNATURE.every((byte, index) => bytes[index] === byte)) invalid();
  let offset = 8; let dimensions = null; let idatEnded = false; let ended = false;
  const imageChunks = []; let imageLength = 0;
  while (offset + 12 <= bytes.length) {
    const length = u32(bytes, offset); const dataStart = offset + 8; const dataEnd = dataStart + length;
    if (length > bytes.length || dataEnd + 4 > bytes.length) invalid();
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (!/^[A-Za-z]{4}$/.test(type) || (type.charCodeAt(2) & 32) !== 0) invalid();
    if (crc32(bytes, offset + 4, dataEnd) !== u32(bytes, dataEnd)) invalid();
    if (!dimensions && type !== 'IHDR') invalid();
    if (type === 'IHDR') {
      if (dimensions || length !== 13) invalid();
      const width = u32(bytes, dataStart); const height = u32(bytes, dataStart + 4);
      const bitDepth = bytes[dataStart + 8]; const colorType = bytes[dataStart + 9];
      if (width < 8 || height < 8 || width > MAX_SIZE || height > MAX_SIZE) throw new PixelPngError('image_pixels_invalid');
      if (bitDepth !== 8 || ![2, 6].includes(colorType) || bytes[dataStart + 10] !== 0 || bytes[dataStart + 11] !== 0 || bytes[dataStart + 12] !== 0) invalid();
      dimensions = { width, height, channels: colorType === 6 ? 4 : 3 };
    } else if (type === 'IDAT') {
      if (idatEnded || ended) invalid();
      imageChunks.push(bytes.subarray(dataStart, dataEnd)); imageLength += length;
    } else if (type === 'IEND') {
      if (length !== 0 || !imageChunks.length || dataEnd + 4 !== bytes.length) invalid();
      ended = true; break;
    } else {
      if (imageChunks.length) idatEnded = true;
      // Transparency, animation, and unknown critical chunks change what a
      // viewer sees. The client re-encodes accepted files before admission.
      if (type === 'tRNS' || type === 'acTL' || type === 'fcTL' || type === 'fdAT' || (type.charCodeAt(0) & 32) === 0) invalid();
    }
    offset = dataEnd + 4;
  }
  if (!ended || !dimensions || !imageLength) invalid();
  const compressed = new Uint8Array(imageLength); let target = 0;
  for (const chunk of imageChunks) { compressed.set(chunk, target); target += chunk.length; }
  return { ...dimensions, compressed };
}

async function inflateBounded(compressed, expected) {
  if (typeof DecompressionStream !== 'function') invalid();
  let reader;
  try {
    reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    const parts = []; let length = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length; if (length > expected) invalid();
      parts.push(value);
    }
    if (length !== expected) invalid();
    const raw = new Uint8Array(length); let offset = 0;
    for (const part of parts) { raw.set(part, offset); offset += part.length; }
    return raw;
  } catch (error) {
    if (error instanceof PixelPngError) throw error;
    invalid();
  } finally { try { await reader?.cancel(); } catch {} }
}

function paeth(left, up, upperLeft) {
  const prediction = left + up - upperLeft;
  const a = Math.abs(prediction - left); const b = Math.abs(prediction - up); const c = Math.abs(prediction - upperLeft);
  return a <= b && a <= c ? left : b <= c ? up : upperLeft;
}

async function decodePixelPng(bytes, { includeRgba = false } = {}) {
  const { width, height, channels, compressed } = parseChunks(bytes);
  const rowBytes = width * channels;
  const raw = await inflateBounded(compressed, (rowBytes + 1) * height);
  const colors = new Set(); const rgba = includeRgba ? new Uint8Array(width * height * 4) : null;
  let previous = new Uint8Array(rowBytes); let offset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[offset++]; if (filter > 4) invalid();
    const row = new Uint8Array(rowBytes);
    for (let i = 0; i < rowBytes; i += 1) {
      const left = i >= channels ? row[i - channels] : 0;
      const up = previous[i]; const upperLeft = i >= channels ? previous[i - channels] : 0;
      const predictor = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : 0;
      row[i] = (raw[offset++] + predictor) & 255;
    }
    for (let x = 0; x < width; x += 1) {
      const i = x * channels;
      const key = ((row[i] << 24) | (row[i + 1] << 16) | (row[i + 2] << 8) | (channels === 4 ? row[i + 3] : 255)) >>> 0;
      colors.add(key);
      if (colors.size > MAX_COLORS) throw new PixelPngError('image_colors_invalid');
      if (rgba) {
        const output = (y * width + x) * 4;
        rgba[output] = row[i]; rgba[output + 1] = row[i + 1]; rgba[output + 2] = row[i + 2];
        rgba[output + 3] = channels === 4 ? row[i + 3] : 255;
      }
    }
    previous = row;
  }
  return { width, height, colorCount: colors.size, rgba };
}

/** Inspect actual decompressed samples; never trust a client-reported count. */
export async function inspectPixelPng(bytes) {
  const { width, height, colorCount } = await decodePixelPng(bytes);
  return { width, height, colorCount };
}

/** Decode validated PNG samples into row-major RGBA bytes. */
export async function decodePixelPngRgba(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_BYTES) throw new PixelPngError('image_size_invalid');
  return await decodePixelPng(bytes, { includeRgba: true });
}

export async function verifyPixelPngClaim(bytes, claim, { includeRgba = false } = {}) {
  if (!claim || claim.mimeType !== 'image/png') throw new PixelPngError('image_type_invalid');
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > MAX_BYTES || claim.size !== bytes.length) throw new PixelPngError('image_size_invalid');
  const actual = includeRgba ? await decodePixelPngRgba(bytes) : await inspectPixelPng(bytes);
  if (claim.width !== actual.width || claim.height !== actual.height) throw new PixelPngError('image_pixels_invalid');
  if (claim.colorCount !== actual.colorCount) throw new PixelPngError('image_colors_invalid');
  return actual;
}
