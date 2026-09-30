export const DRAW_SIZES = Object.freeze([16, 32, 64, 128, 256, 512]);
export const DRAW_SIZE = 16;
// かんたんドット絵 draws with 16 fixed colours + transparent. The first seven keep their old slots so earlier
// saves map onto the same colours; the other nine fill the gaps (grey, brown, skin, pink, orange, yellow, lime, sky, navy).
export const DRAW_PALETTE = Object.freeze(['#263238', '#f4f2ec', '#e75445', '#f2b84b', '#4c82c3', '#6d9b68', '#9a6bb0', '#8c97a1', '#8a5a3c', '#f5c9a0', '#f3a6c0', '#ef7d3c', '#ffe066', '#a8d86a', '#8ecdf0', '#27336b']);
/** The order the 16 colours are shown in: dark to light greys, then around the colour wheel. */
export const DRAW_PALETTE_ORDER = Object.freeze([0, 7, 1, 8, 9, 10, 2, 11, 3, 12, 13, 5, 14, 4, 15, 6]);
/** The simple editor makes and edits drawings up to 64px; older, larger saves stay readable by the other tools. */
export const SIMPLE_DRAW_SIZES = Object.freeze([16, 32, 64]);
export const SIMPLE_DRAW_MAX = 64;
export const DRAW_SCHEMA_VERSION = 1;
export const MAX_DRAW_COLORS = 128;
export const DEFAULT_HISTORY_BYTES = 4 * 1024 * 1024;

export function createDrawDocument(size = DRAW_SIZE) {
  if (!DRAW_SIZES.includes(size)) throw new RangeError('16/32/64/128/256/512px から選んでください');
  return { schemaVersion: DRAW_SCHEMA_VERSION, width: size, height: size, palette: [...DRAW_PALETTE], pixels: Array(size * size).fill(-1) };
}

export function validateDrawDocument(document) {
  if (!document || document.schemaVersion !== DRAW_SCHEMA_VERSION || ![document.width, document.height].every((side) => Number.isInteger(side) && side >= 1 && side <= 512)) throw new TypeError('1〜512px の編集データではありません');
  if (!Array.isArray(document.palette) || document.palette.length < 1 || document.palette.length > MAX_DRAW_COLORS || document.palette.some((color) => typeof color !== 'string' || !/^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(color))) throw new TypeError('色パレットが壊れています');
  if (!Array.isArray(document.pixels) || document.pixels.length !== document.width * document.height || document.pixels.some((pixel) => !Number.isInteger(pixel) || pixel < -1 || pixel >= document.palette.length)) throw new TypeError('画素データが壊れています');
  return document;
}

export function resizeDrawDocument(document, size) {
  validateDrawDocument(document);
  if (!DRAW_SIZES.includes(size)) throw new RangeError('16/32/64/128/256/512px から選んでください');
  return resizeDrawRectangle(document, size, size);
}

export function resizeDrawRectangle(document, width, height) {
  validateDrawDocument(document);
  if (![width, height].every((side) => Number.isInteger(side) && side >= 1 && side <= 512)) throw new RangeError('キャンバスは1〜512pxで指定してください');
  const pixels = Array(width * height).fill(-1); const oldWidth = document.width; const oldHeight = document.height;
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(oldHeight - 1, Math.floor((y + 0.5) * oldHeight / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(oldWidth - 1, Math.floor((x + 0.5) * oldWidth / width));
      pixels[y * width + x] = document.pixels[sourceY * oldWidth + sourceX];
    }
  }
  return { ...document, width, height, palette: [...document.palette], pixels };
}

function pointIndex(x, y, width, height) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
  const px = Math.floor(x); const py = Math.floor(y);
  return px < 0 || py < 0 || px >= width || py >= height ? -1 : py * width + px;
}

export function strokePixels(document, from, to, value, { trusted = false } = {}) {
  // Pointer moves operate on an already validated document; importing and committing still validate fully.
  if (!trusted) validateDrawDocument(document);
  if (!Number.isInteger(value) || value < -1 || value >= document.palette.length) throw new TypeError('Invalid pixel value');
  const x0 = Math.floor(from.x); const y0 = Math.floor(from.y); const x1 = Math.floor(to.x); const y1 = Math.floor(to.y);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return [];
  if ([x0, y0, x1, y1].some((coordinate) => Math.abs(coordinate) > Math.max(document.width, document.height) * 4)) return [];
  const changed = []; let x = x0; let y = y0;
  const dx = Math.abs(x1 - x0); const sx = x0 < x1 ? 1 : -1; const dy = -Math.abs(y1 - y0); const sy = y0 < y1 ? 1 : -1; let error = dx + dy;
  for (;;) {
    const index = pointIndex(x, y, document.width, document.height);
    if (index >= 0 && document.pixels[index] !== value) { document.pixels[index] = value; changed.push(index); }
    if (x === x1 && y === y1) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
  return changed;
}

export function floodFill(document, x, y, value) {
  validateDrawDocument(document);
  if (!Number.isInteger(value) || value < -1 || value >= document.palette.length) throw new TypeError('Invalid pixel value');
  const start = pointIndex(x, y, document.width, document.height);
  if (start < 0) return [];
  const target = document.pixels[start];
  if (target === value) return [];
  const changed = new Uint32Array(document.pixels.length); let count = 0; let cursor = 0;
  document.pixels[start] = value; changed[count++] = start;
  while (cursor < count) {
    const index = changed[cursor++];
    const px = index % document.width; const py = Math.floor(index / document.width);
    const add = (next) => { if (document.pixels[next] === target) { document.pixels[next] = value; changed[count++] = next; } };
    if (px > 0) add(index - 1); if (px + 1 < document.width) add(index + 1);
    if (py > 0) add(index - document.width); if (py + 1 < document.height) add(index + document.width);
  }
  return changed.subarray(0, count);
}

function makePatch(before, after) {
  let count = 0;
  for (let index = 0; index < before.length; index += 1) if (before[index] !== after[index]) count += 1;
  if (!count) return null;
  const indices = new Uint32Array(count); const oldValues = new Int16Array(count); const newValues = new Int16Array(count);
  for (let index = 0, slot = 0; index < before.length; index += 1) if (before[index] !== after[index]) {
    indices[slot] = index; oldValues[slot] = before[index]; newValues[slot] = after[index]; slot += 1;
  }
  return { indices, oldValues, newValues, bytes: indices.byteLength + oldValues.byteLength + newValues.byteLength };
}
function applyPatch(pixels, patch, values) { for (let slot = 0; slot < patch.indices.length; slot += 1) pixels[patch.indices[slot]] = values[slot]; }

const samePalette = (a, b) => a.length === b.length && a.every((color, index) => color === b[index]);
// One history step holds the changed pixels and, when the colours were edited, the palette before and after.
export function createDrawHistory(document, { maxBytes = DEFAULT_HISTORY_BYTES, maxEntries = 100 } = {}) {
  validateDrawDocument(document);
  const past = []; const future = []; let retainedBytes = 0; let lastStep = null;
  const clearFuture = () => { for (const entry of future) retainedBytes -= entry.bytes; future.length = 0; };
  const trimPast = () => { while (past.length > maxEntries || retainedBytes > maxBytes && past.length > 1) retainedBytes -= past.shift().bytes; };
  const moveEntry = (from, to, backwards) => {
    if (!from.length) return false;
    const patch = from.pop(); applyPatch(document.pixels, patch, backwards ? patch.oldValues : patch.newValues);
    if (patch.paletteBefore) document.palette = [...(backwards ? patch.paletteBefore : patch.paletteAfter)];
    to.push(patch); lastStep = { indices: patch.indices, paletteChanged: Boolean(patch.paletteBefore) }; return true;
  };
  return {
    get canUndo() { return past.length > 0; }, get canRedo() { return future.length > 0; }, get retainedBytes() { return retainedBytes; },
    /** What the last undo/redo touched: pixel indices, and whether the colours changed. */
    get lastStep() { return lastStep; },
    commit(nextDocument) {
      validateDrawDocument(nextDocument);
      if (nextDocument.width !== document.width || nextDocument.height !== document.height) throw new TypeError('Resize the document before committing pixels');
      const paletteChanged = !samePalette(document.palette, nextDocument.palette);
      let patch = makePatch(document.pixels, nextDocument.pixels);
      if (!patch && !paletteChanged) return false;
      patch ??= { indices: new Uint32Array(0), oldValues: new Int16Array(0), newValues: new Int16Array(0), bytes: 0 };
      if (paletteChanged) { patch.paletteBefore = [...document.palette]; patch.paletteAfter = [...nextDocument.palette]; patch.bytes += (patch.paletteBefore.length + patch.paletteAfter.length) * 9; }
      clearFuture();
      if (patch.bytes > maxBytes) { past.length = 0; retainedBytes = 0; }
      else { past.push(patch); retainedBytes += patch.bytes; trimPast(); }
      document.pixels = nextDocument.pixels; if (paletteChanged) document.palette = [...nextDocument.palette]; return true;
    },
    undo() { return moveEntry(past, future, true); },
    redo() { return moveEntry(future, past, false); }
  };
}

export function finishDrawStroke(document, history, originalPixels) {
  validateDrawDocument(document);
  if (!Array.isArray(originalPixels) || originalPixels.length !== document.pixels.length) throw new TypeError('Invalid stroke snapshot');
  const completedPixels = document.pixels;
  document.pixels = originalPixels;
  return history.commit({ ...document, pixels: completedPixels });
}

function colorRgba(color) {
  const value = color.slice(1);
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16), value.length === 8 ? Number.parseInt(value.slice(6, 8), 16) : 255];
}
function writeRgba(pixels, offset, color) {
  if (color < 0) { pixels[offset] = 0; pixels[offset + 1] = 0; pixels[offset + 2] = 0; pixels[offset + 3] = 0; return; }
  const [red, green, blue, alpha] = colorRgba(color);
  pixels[offset] = red; pixels[offset + 1] = green; pixels[offset + 2] = blue; pixels[offset + 3] = alpha;
}
function setRgba(pixels, index, color) { writeRgba(pixels, index * 4, color); }
export function documentRgba(document) {
  validateDrawDocument(document);
  const rgba = new Uint8Array(document.pixels.length * 4);
  document.pixels.forEach((color, index) => setRgba(rgba, index, color < 0 ? -1 : document.palette[color]));
  return rgba;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function writeU32(bytes, offset, value) { bytes[offset] = value >>> 24; bytes[offset + 1] = value >>> 16; bytes[offset + 2] = value >>> 8; bytes[offset + 3] = value; }
function writeChunk(output, offset, type, data) {
  writeU32(output, offset, data.length);
  for (let index = 0; index < 4; index += 1) output[offset + 4 + index] = type.charCodeAt(index);
  output.set(data, offset + 8); writeU32(output, offset + data.length + 8, crc32(output.subarray(offset + 4, offset + data.length + 8)));
  return offset + data.length + 12;
}

export function encodePng(document) {
  validateDrawDocument(document);
  const width = document.width; const height = document.height;
  const stride = width * 4; const scanlines = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const cell = y * width + x; const color = document.pixels[cell] < 0 ? -1 : document.palette[document.pixels[cell]];
    writeRgba(scanlines, y * (stride + 1) + 1 + x * 4, color);
  }
  const blockCount = Math.ceil(scanlines.length / 65535); const zlib = new Uint8Array(2 + scanlines.length + blockCount * 5 + 4);
  zlib[0] = 0x78; zlib[1] = 0x01; let source = 0; let target = 2;
  while (source < scanlines.length) {
    const length = Math.min(65535, scanlines.length - source); const finalBlock = source + length === scanlines.length;
    zlib[target++] = finalBlock ? 1 : 0; zlib[target++] = length & 255; zlib[target++] = length >>> 8;
    zlib[target++] = (~length) & 255; zlib[target++] = ((~length) >>> 8) & 255;
    zlib.set(scanlines.subarray(source, source + length), target); source += length; target += length;
  }
  let a = 1; let b = 0; for (const byte of scanlines) { a = (a + byte) % 65521; b = (b + a) % 65521; } writeU32(zlib, target, ((b << 16) | a) >>> 0);
  const ihdr = new Uint8Array(13); writeU32(ihdr, 0, width); writeU32(ihdr, 4, height); ihdr[8] = 8; ihdr[9] = 6;
  const png = new Uint8Array(8 + ihdr.length + zlib.length + 3 * 12);
  png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  let offset = writeChunk(png, 8, 'IHDR', ihdr); offset = writeChunk(png, offset, 'IDAT', zlib); writeChunk(png, offset, 'IEND', new Uint8Array());
  return png;
}

const hexRgba = (hex) => [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16), hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) : 255];
function nearestSimpleColor(hex) {
  const [r, g, b, a] = hexRgba(hex); if (a < 128) return -1;
  let best = 0; let bestDistance = Infinity;
  DRAW_PALETTE.forEach((candidate, index) => {
    const [cr, cg, cb] = hexRgba(candidate); const dr = r - cr; const dg = g - cg; const db = b - cb;
    const distance = dr * dr * 3 + dg * dg * 4 + db * db * 2; if (distance < bestDistance) { bestDistance = distance; best = index; }
  });
  return best;
}
const simpleSide = (length, scale) => DRAW_SIZES.reduce((best, size) => (Math.abs(size - length * scale) < Math.abs(best - length * scale) ? size : best), SIMPLE_DRAW_SIZES[0]);
/**
 * Brings any saved drawing into the simple editor: at most 64px on each side and the 16 fixed colours.
 * Returns a new document (the saved original is never touched) and what had to change.
 */
export function toSimpleDrawDocument(document) {
  validateDrawDocument(document);
  const longest = Math.max(document.width, document.height);
  const resized = longest > SIMPLE_DRAW_MAX;
  const scale = resized ? SIMPLE_DRAW_MAX / longest : 1;
  const width = resized ? Math.min(SIMPLE_DRAW_MAX, simpleSide(document.width, scale)) : document.width;
  const height = resized ? Math.min(SIMPLE_DRAW_MAX, simpleSide(document.height, scale)) : document.height;
  // Colours: an older save that uses the first slots of the palette simply gains the rest; any other picture
  // with 16 colours or fewer keeps its own colours exactly (so a picture linked to a song keeps its notes);
  // only pictures with more than 16 colours are moved onto the 16 fixed colours.
  const lower = document.palette.map((color) => color.toLowerCase());
  const isPrefix = lower.length <= DRAW_PALETTE.length && lower.every((color, index) => color === DRAW_PALETTE[index]);
  const keepOwn = !isPrefix && lower.length <= DRAW_PALETTE.length;
  const map = isPrefix || keepOwn ? null : document.palette.map(nearestSimpleColor);
  const recolored = Boolean(map);
  const pixels = new Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sy = resized ? Math.min(document.height - 1, Math.floor((y + 0.5) * document.height / height)) : y;
    for (let x = 0; x < width; x += 1) {
      const sx = resized ? Math.min(document.width - 1, Math.floor((x + 0.5) * document.width / width)) : x;
      const value = document.pixels[sy * document.width + sx];
      pixels[y * width + x] = value < 0 ? -1 : map ? map[value] : value;
    }
  }
  const next = { ...document, width, height, palette: keepOwn ? [...document.palette] : [...DRAW_PALETTE], pixels };
  validateDrawDocument(next);
  return { document: next, resized, recolored, changed: resized || recolored };
}
