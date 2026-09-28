const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const KEYWORD = 'PiXiEED-pixels';
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 8192;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

function crc32(bytes, start, end) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function readU32(bytes, offset) {
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function writeU32(bytes, offset, value) {
  bytes[offset] = value >>> 24; bytes[offset + 1] = value >>> 16; bytes[offset + 2] = value >>> 8; bytes[offset + 3] = value;
}

function isPixelMetadataText(bytes, start, end) {
  return end - start > KEYWORD.length && bytes[start + KEYWORD.length] === 0
    && KEYWORD.split('').every((character, index) => bytes[start + index] === character.charCodeAt(0));
}

function isValidMetadata(value, pngWidth, pngHeight) {
  return value && typeof value === 'object' && value.version === 1
    && Number.isSafeInteger(value.width) && value.width >= 1 && value.width <= MAX_EDGE
    && Number.isSafeInteger(value.height) && value.height >= 1 && value.height <= MAX_EDGE
    && Number.isSafeInteger(value.scale) && value.scale >= 1 && value.scale <= MAX_EDGE
    && value.width * value.scale === pngWidth && value.height * value.scale === pngHeight;
}

function parsePng(value, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const bytes = bytesOf(value);
  if (!bytes || bytes.byteLength < 45 || bytes.byteLength > maxBytes) return { valid: false, containsMetadata: false };
  if (!SIGNATURE.every((byte, index) => bytes[index] === byte)) return { valid: false, containsMetadata: false };
  const chunks = [];
  let offset = 8; let width = 0; let height = 0; let sawEnd = false; let sawData = false; let metadata = null; let metadataCount = 0;
  while (offset < bytes.length) {
    if (chunks.length >= 10000 || offset + 12 > bytes.length) return { valid: false, containsMetadata: metadataCount > 0 };
    const length = readU32(bytes, offset); const dataStart = offset + 8; const crcOffset = dataStart + length; const nextOffset = crcOffset + 4;
    if (nextOffset > bytes.length || nextOffset < offset) return { valid: false, containsMetadata: metadataCount > 0 };
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = String.fromCharCode(...typeBytes);
    const relevantText = type === 'tEXt' && isPixelMetadataText(bytes, dataStart, crcOffset);
    if ((type === 'IHDR' || type === 'IEND' || relevantText) && crc32(bytes, offset + 4, crcOffset) !== readU32(bytes, crcOffset)) return { valid: false, containsMetadata: metadataCount > 0 || relevantText };
    if (!chunks.length && (type !== 'IHDR' || length !== 13)) return { valid: false, containsMetadata: false };
    if (type === 'IHDR') {
      if (chunks.length || length !== 13) return { valid: false, containsMetadata: metadataCount > 0 };
      width = readU32(bytes, dataStart); height = readU32(bytes, dataStart + 4);
      if (width < 1 || height < 1 || width > MAX_EDGE || height > MAX_EDGE || width * height > 16 * 1024 * 1024) return { valid: false, containsMetadata: metadataCount > 0 };
    }
    if (type === 'IDAT') sawData = true;
    if (type === 'tEXt') {
      const text = bytes.subarray(dataStart, crcOffset);
      const separator = text.indexOf(0);
      if (separator === KEYWORD.length && isPixelMetadataText(bytes, dataStart, crcOffset)) {
        metadataCount += 1;
        try { metadata = JSON.parse(new TextDecoder().decode(text.subarray(separator + 1))); } catch { metadata = null; }
      }
    }
    chunks.push({ start: offset, end: nextOffset, type, dataStart, dataEnd: crcOffset });
    offset = nextOffset;
    if (type === 'IEND') {
      if (length !== 0 || offset !== bytes.length) return { valid: false, containsMetadata: metadataCount > 0 };
      sawEnd = true; break;
    }
  }
  if (!sawEnd || !sawData || !width || !height) return { valid: false, containsMetadata: metadataCount > 0 };
  if (metadataCount !== 1 || !isValidMetadata(metadata, width, height)) metadata = null;
  return { valid: true, containsMetadata: metadataCount > 0, metadata, width, height, chunks, bytes };
}

function makeTextChunk(metadata) {
  const text = new TextEncoder().encode(`${KEYWORD}\0${JSON.stringify(metadata)}`);
  const chunk = new Uint8Array(12 + text.length); writeU32(chunk, 0, text.length);
  chunk.set([116, 69, 88, 116], 4); chunk.set(text, 8); writeU32(chunk, 8 + text.length, crc32(chunk, 4, 8 + text.length));
  return chunk;
}

/** Read one unambiguous, CRC-verified PiXiEED PNG metadata claim. */
export function readPixelPngMetadata(value, options = {}) {
  const parsed = parsePng(value, options);
  return parsed.valid ? parsed.metadata : null;
}

/** Replace PiXiEED's PNG tEXt claim while preserving every other PNG chunk. */
export async function withPixelPngMetadata(blob, { width, height, scale } = {}, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  if (!blob || typeof blob.arrayBuffer !== 'function' || blob.size > maxBytes || (blob.type && blob.type !== 'image/png')) throw new TypeError('A bounded PNG blob is required');
  const source = new Uint8Array(await blob.arrayBuffer()); const parsed = parsePng(source, { maxBytes });
  if (!parsed.valid) throw new TypeError('PNG signature, chunk bounds, or CRC is invalid');
  const metadata = { version: 1, width, height, scale };
  if (!isValidMetadata(metadata, parsed.width, parsed.height)) throw new RangeError('Pixel metadata does not match PNG dimensions');
  const replacement = makeTextChunk(metadata); const pieces = [parsed.bytes.subarray(0, 8)]; let inserted = false;
  for (const chunk of parsed.chunks) {
    const isOurs = chunk.type === 'tEXt' && chunk.dataEnd > chunk.dataStart + KEYWORD.length
      && parsed.bytes[chunk.dataStart + KEYWORD.length] === 0
      && String.fromCharCode(...parsed.bytes.subarray(chunk.dataStart, chunk.dataStart + KEYWORD.length)) === KEYWORD;
    if (isOurs) continue;
    if (chunk.type === 'IDAT' && !inserted) { pieces.push(replacement); inserted = true; }
    pieces.push(parsed.bytes.subarray(chunk.start, chunk.end));
  }
  if (!inserted) throw new TypeError('PNG has no image data');
  const size = pieces.reduce((sum, part) => sum + part.length, 0);
  if (size > maxBytes) throw new RangeError('PNG exceeds the metadata byte limit');
  const output = new Uint8Array(size); let offset = 0;
  for (const piece of pieces) { output.set(piece, offset); offset += piece.length; }
  return new Blob([output], { type: 'image/png' });
}

/** Internal inspection used to prevent malformed claims from falling back to heuristic scaling. */
export function inspectPixelPng(value, options = {}) {
  return parsePng(value, options);
}
