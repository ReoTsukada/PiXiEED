/**
 * The shared rules every creation tool follows for pixels, sizes, colours, saved versions and
 * hand-offs (docs/creation-suite/DATA-CONTRACT.md). Nothing here changes a saved format: works
 * are still saved as the existing JSON arrays, and these helpers convert at the edges.
 *
 * Typed arrays silently wrap or clamp values that do not fit (ECMAScript ToUint8: -1 becomes
 * 255), so every conversion checks the values *before* building the typed array.
 */

/** The palette index of a transparent pixel in Draw documents. */
export const TRANSPARENT = -1;
/** Palettes hold at most this many colours, so indices fit an Int16Array with room for -1. */
export const MAX_PALETTE = 128;

export class PixelContractError extends TypeError {
  constructor(code, message) { super(message); this.name = 'PixelContractError'; this.code = code; }
}
const fail = (code, message) => { throw new PixelContractError(code, message); };
const isArrayLike = (value) => Array.isArray(value) || ArrayBuffer.isView(value);

// ---------------------------------------------------------------------------------------------
// Types by use
// ---------------------------------------------------------------------------------------------

/** Bytes (RGBA pixels, file contents): every value an integer 0..255, copied into a Uint8Array. */
export function toBytes(values, label = 'バイト列') {
  if (values instanceof Uint8Array) return new Uint8Array(values);
  if (!isArrayLike(values)) fail('BYTES_INVALID', `${label}が配列ではありません。`);
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!Number.isInteger(value) || value < 0 || value > 255) fail('BYTES_OUT_OF_RANGE', `${label}の${i}番目が0〜255の整数ではありません。`);
  }
  return Uint8Array.from(values);
}

/** RGBA for a canvas: a Uint8ClampedArray view over the same bytes (no copy), made only at the drawing boundary. */
export function canvasRgba(rgba, width, height) {
  if (!(rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray)) fail('RGBA_INVALID', '画素データの型が違います。');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length !== width * height * 4) fail('RGBA_SIZE', '画素データと寸法が一致しません。');
  return rgba instanceof Uint8ClampedArray ? rgba : new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length);
}

/** Palette indices for editing: -1 (transparent) .. paletteLength-1, as an Int16Array that keeps -1. */
export function toPaletteIndices(pixels, paletteLength) {
  if (!Number.isInteger(paletteLength) || paletteLength < 1 || paletteLength > MAX_PALETTE) fail('PALETTE_LENGTH', 'パレットの色数が範囲外です。');
  if (!isArrayLike(pixels)) fail('INDICES_INVALID', '画素データが配列ではありません。');
  for (let i = 0; i < pixels.length; i += 1) {
    const value = pixels[i];
    if (!Number.isInteger(value) || value < TRANSPARENT || value >= paletteLength) fail('INDEX_OUT_OF_RANGE', `${i}番目の画素の色番号が範囲外です。`);
  }
  return Int16Array.from(pixels);
}

/** Palette indices back to the saved JSON form (a plain array), for hashing and storage. */
export function paletteIndicesToJson(indices) {
  if (!(indices instanceof Int16Array) && !Array.isArray(indices)) fail('INDICES_INVALID', '画素データが配列ではありません。');
  return Array.from(indices);
}

/** A target mask: one 0/1 byte per pixel. Accepts booleans or 0/1 numbers. */
export function toMask(values, pixelCount) {
  if (!Number.isInteger(pixelCount) || pixelCount < 1) fail('MASK_SIZE', 'マスクの大きさが不正です。');
  if (!isArrayLike(values) || values.length !== pixelCount) fail('MASK_SIZE', 'マスクと画像の画素数が一致しません。');
  const mask = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const value = values[i];
    if (value === true || value === 1) mask[i] = 1;
    else if (value !== false && value !== 0) fail('MASK_VALUE', `マスクの${i}番目が0か1ではありません。`);
  }
  return mask;
}

/** Pixel positions (index = y * width + x) as a Uint32Array, each checked against the pixel count and not repeated. */
export function toPixelIndices(indices, pixelCount) {
  if (!Number.isInteger(pixelCount) || pixelCount < 1) fail('INDICES_SIZE', '画素数が不正です。');
  if (!isArrayLike(indices)) fail('INDICES_INVALID', '画素位置が配列ではありません。');
  const seen = new Uint8Array(pixelCount);
  for (let i = 0; i < indices.length; i += 1) {
    const value = indices[i];
    if (!Number.isInteger(value) || value < 0 || value >= pixelCount) fail('PIXEL_OUT_OF_RANGE', `画素位置${value}が画像の外です。`);
    if (seen[value]) fail('PIXEL_DUPLICATE', `画素位置${value}が重複しています。`);
    seen[value] = 1;
  }
  return Uint32Array.from(indices);
}

/** Pixel positions back to the saved JSON form. */
export function pixelIndicesToJson(indices) { return Array.from(indices); }

/** Audio samples: finite numbers in -1..1 as a Float32Array. */
export function toSamples(values) {
  if (!isArrayLike(values)) fail('SAMPLES_INVALID', '音声データが配列ではありません。');
  for (let i = 0; i < values.length; i += 1) if (!Number.isFinite(values[i]) || values[i] < -1 || values[i] > 1) fail('SAMPLE_OUT_OF_RANGE', `音声の${i}番目が-1〜1の範囲外です。`);
  return Float32Array.from(values);
}

// ---------------------------------------------------------------------------------------------
// Draw documents: editing form <-> saved form
// ---------------------------------------------------------------------------------------------

/** The editing form of a saved Draw document: same fields, pixels as a checked Int16Array. */
export function toEditingDocument(document) {
  if (!document || !Array.isArray(document.palette) || !Array.isArray(document.pixels)) fail('DOCUMENT_INVALID', '編集データではありません。');
  if (document.pixels.length !== document.width * document.height) fail('DOCUMENT_SIZE', '画素数と寸法が一致しません。');
  return { ...document, palette: [...document.palette], pixels: toPaletteIndices(document.pixels, document.palette.length) };
}

/** The saved form of an editing document (plain arrays), so validation and content hashes match older saves exactly. */
export function toSavedDocument(editing) {
  if (!editing || !Array.isArray(editing.palette)) fail('DOCUMENT_INVALID', '編集データではありません。');
  const checked = toPaletteIndices(editing.pixels, editing.palette.length);
  if (checked.length !== editing.width * editing.height) fail('DOCUMENT_SIZE', '画素数と寸法が一致しません。');
  return { ...editing, palette: [...editing.palette], pixels: paletteIndicesToJson(checked) };
}

// ---------------------------------------------------------------------------------------------
// Dots, display scale and output size are three different things
// ---------------------------------------------------------------------------------------------

/**
 * A work's size in dots, how large it is shown, and how large it is exported, kept apart.
 * e.g. a 64×64 work shown at 5× and saved at 2048×2048 is still 64×64 dots.
 */
export function createPixelFrame({ width, height, displayScale = 1, outputScale = 1 }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) fail('FRAME_DOTS', '作品のドット数が不正です。');
  if (!(displayScale > 0) || !Number.isFinite(displayScale)) fail('FRAME_DISPLAY', '表示倍率が不正です。');
  if (!Number.isInteger(outputScale) || outputScale < 1) fail('FRAME_OUTPUT', '出力倍率は1以上の整数です。');
  return Object.freeze({ dots: Object.freeze({ width, height }), displayScale, outputScale, output: Object.freeze({ width: width * outputScale, height: height * outputScale }) });
}

/**
 * The dot under a point on screen, in the work's own coordinates. `rect` is where the art is
 * drawn (e.g. getBoundingClientRect of the canvas or image). Returns null outside the art.
 */
export function dotAtPoint({ width, height }, rect, clientX, clientY) {
  if (!rect || !(rect.width > 0) || !(rect.height > 0) || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const x = Math.floor(((clientX - rect.left) / rect.width) * width); const y = Math.floor(((clientY - rect.top) / rect.height) * height);
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return { x, y, index: y * width + x };
}

// ---------------------------------------------------------------------------------------------
// Original and working copies
// ---------------------------------------------------------------------------------------------

/**
 * Describe a working copy made from an original: what was done (`purpose`, `transform`) and
 * how its coordinates map back (source = copy * scale + offset). The original is never changed.
 */
export function describeWorkingCopy({ source, copy, purpose, transform = {} }) {
  for (const [name, size] of [['source', source], ['copy', copy]]) {
    if (!size || !Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width < 1 || size.height < 1) fail('COPY_SIZE', `${name}の寸法が不正です。`);
  }
  if (typeof purpose !== 'string' || !purpose) fail('COPY_PURPOSE', '作業コピーの用途が必要です。');
  const offsetX = transform.offsetX ?? 0; const offsetY = transform.offsetY ?? 0;
  return Object.freeze({
    purpose, transform: Object.freeze({ ...transform }),
    source: Object.freeze({ width: source.width, height: source.height }),
    copy: Object.freeze({ width: copy.width, height: copy.height }),
    map: Object.freeze({ scaleX: (source.width - offsetX * 2) / copy.width, scaleY: (source.height - offsetY * 2) / copy.height, offsetX, offsetY })
  });
}

/** A dot in a working copy mapped back to the original's dot. */
export function toSourceDot(description, x, y) {
  const { map, source } = description;
  const sx = Math.min(source.width - 1, Math.max(0, Math.floor(map.offsetX + (x + 0.5) * map.scaleX)));
  const sy = Math.min(source.height - 1, Math.max(0, Math.floor(map.offsetY + (y + 0.5) * map.scaleY)));
  return { x: sx, y: sy, index: sy * source.width + sx };
}

// ---------------------------------------------------------------------------------------------
// Colours and sounds
// ---------------------------------------------------------------------------------------------

const hex2 = (value) => value.toString(16).padStart(2, '0');

/** A colour's fixed ID, the same form PXD image metadata uses: `rgba-rrggbbaa`. */
export function colorIdOf(r, g, b, a = 255) {
  for (const value of [r, g, b, a]) if (!Number.isInteger(value) || value < 0 || value > 255) fail('COLOR_INVALID', '色の値が0〜255の整数ではありません。');
  return `rgba-${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a)}`;
}

/** The ID of a palette entry written as `#rrggbb` or `#rrggbbaa`. */
export function colorIdOfHex(color) {
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(color)) fail('COLOR_INVALID', '色の書式が違います。');
  const value = color.slice(1).toLowerCase();
  return `rgba-${value.length === 6 ? `${value}ff` : value}`;
}

/**
 * The instrument for a colour. Sounds follow the colour's ID, never its position in the
 * palette, so reordering colours never changes a sound; a colour with no instrument stays in
 * the picture and is silent (null).
 */
export function instrumentForColor(assignments, color) {
  const id = color.startsWith('rgba-') ? color : colorIdOfHex(color);
  const entry = assignments instanceof Map ? assignments.get(id) : assignments?.[id];
  return typeof entry === 'string' && entry ? entry : null;
}

// ---------------------------------------------------------------------------------------------
// Limits, stale async results and releasing resources
// ---------------------------------------------------------------------------------------------

/** Read limits by use. The check is shared; the numbers differ, and one use never imposes its limits on another. */
export const READ_LIMITS = Object.freeze({
  post: Object.freeze({ maxBytes: 512 * 1024, maxSourceBytes: 8 * 1024 * 1024, minSize: 8, maxSize: 512, maxSourceSize: 4096, maxColors: 128 }),
  edit: Object.freeze({ maxBytes: 10 * 1024 * 1024, maxPixels: 2_097_152 }),
  game: Object.freeze({ maxBytes: 2 * 1024 * 1024, maxSourceBytes: 8 * 1024 * 1024, maxSize: 4096, maxPixels: 1024 * 1024 }),
  jigsaw: Object.freeze({ maxBytes: 8 * 1024 * 1024, maxPixels: 20_000_000 }),
  pxd: Object.freeze({ maxPixels: 2 * 1024 * 1024 })
});

/** Check an image's size against one use's limits. Returns a list of problems (empty when it fits). */
export function checkReadLimits(use, { bytes, width, height, colors } = {}) {
  const limits = READ_LIMITS[use];
  if (!limits) fail('LIMITS_UNKNOWN', `用途「${use}」の上限がありません。`);
  const problems = [];
  const byteLimit = limits.maxSourceBytes ?? limits.maxBytes;
  if (Number.isFinite(bytes) && byteLimit && bytes > byteLimit) problems.push({ code: 'bytes', limit: byteLimit });
  if (Number.isFinite(width) && Number.isFinite(height)) {
    if (limits.minSize && (width < limits.minSize || height < limits.minSize)) problems.push({ code: 'min-size', limit: limits.minSize });
    const sizeLimit = limits.maxSourceSize ?? limits.maxSize;
    if (sizeLimit && (width > sizeLimit || height > sizeLimit)) problems.push({ code: 'max-size', limit: sizeLimit });
    if (limits.maxPixels && width * height > limits.maxPixels) problems.push({ code: 'pixels', limit: limits.maxPixels });
  }
  if (Number.isFinite(colors) && limits.maxColors && colors > limits.maxColors) problems.push({ code: 'colors', limit: limits.maxColors });
  return problems;
}

/**
 * Guards against an older async result overwriting a newer one: each load takes a ticket, and
 * only the newest ticket may apply its result.
 */
export function createLatestGate() {
  let current = 0;
  return Object.freeze({ begin() { current += 1; return current; }, isCurrent(ticket) { return ticket === current; }, cancel() { current += 1; } });
}

/** Collects object URLs, workers, bitmaps, audio contexts and callbacks, and releases them together once. */
export function createResourceBag() {
  let items = [];
  const release = (item) => {
    try {
      if (typeof item === 'string' && item.startsWith('blob:')) URL.revokeObjectURL(item);
      else if (typeof item === 'function') item();
      else if (typeof item?.terminate === 'function') item.terminate();
      else if (typeof item?.close === 'function') item.close();
    } catch { /* releasing one item never stops the others */ }
  };
  return Object.freeze({
    add(item) { items.push(item); return item; },
    release(item) { const index = items.indexOf(item); if (index >= 0) { items.splice(index, 1); release(item); } },
    releaseAll() { const current = items; items = []; current.reverse().forEach(release); },
    get size() { return items.length; }
  });
}
