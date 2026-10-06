import { validateDrawDocument } from './draw-core.mjs?rev=20261006-draw-startup-1';
import { selectionAxes, selectionFrameBounds } from './draw-selection-geometry.mjs?rev=20261006-draw-startup-1';

export const selectionColor = color => {
  if (!/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(color)) throw new TypeError('選択の色が不正です。');
  return color.length === 7 ? `${color.toLowerCase()}ff` : color.toLowerCase();
};
export const DRAW_SELECTION_FORMAT = 'PiXiEED_DRAW_SELECTION';
const fail = message => { throw new RangeError(message); };
const dimension = n => Number.isInteger(n) && n >= 1 && n <= 256;

/** Tab-local clipboard: zero is a hole; positive bytes address its own palette. */
export function captureDrawSelection(doc, bounds, { mask = null } = {}) {
  validateDrawDocument(doc);
  if (!bounds || !dimension(bounds.width) || !dimension(bounds.height) || !Number.isInteger(bounds.x) || !Number.isInteger(bounds.y)
    || bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > doc.width || bounds.y + bounds.height > doc.height) fail('選択範囲がキャンバス外です。');
  if (mask && (!(mask instanceof Uint8Array) || mask.length !== doc.pixels.length)) fail('選択マスクの寸法が不正です。');
  const palette = [], colors = new Map(), indices = new Uint8Array(bounds.width * bounds.height), localMask = mask && new Uint8Array(indices.length);
  for (let y = 0; y < bounds.height; y++) for (let x = 0; x < bounds.width; x++) {
    const offset = (bounds.y + y) * doc.width + bounds.x + x;
    if (mask && !mask[offset]) continue;
    if (localMask) localMask[y * bounds.width + x] = 1;
    const value = doc.pixels[offset];
    if (value < 0) continue;
    const color = selectionColor(doc.palette[value]);
    if (color.endsWith('00')) continue;
    if (!color.endsWith('ff')) fail('半透明の原本は変更できません。');
    if (!colors.has(color)) {
      if (palette.length >= 255) fail('選択の色数が255色を超えています。');
      palette.push(color.slice(0, 7)); colors.set(color, palette.length);
    }
    indices[y * bounds.width + x] = colors.get(color);
  }
  return palette.length ? { format: DRAW_SELECTION_FORMAT, version: 1, width: bounds.width, height: bounds.height, origin: { x: bounds.x, y: bounds.y }, indices, palette, ...(localMask ? { mask: localMask } : {}) } : null;
}

function validateClipboard(clip) {
  if (clip?.format !== DRAW_SELECTION_FORMAT || clip.version !== 1 || !dimension(clip.width) || !dimension(clip.height) || !(clip.indices instanceof Uint8Array)
    || clip.indices.length !== clip.width * clip.height || !Array.isArray(clip.palette) || !clip.palette.length || clip.palette.length > 255) fail('コピーした選択データが不正です。');
  for (const color of clip.palette) if (!selectionColor(color).endsWith('ff')) fail('半透明の原本は変更できません。');
  for (const byte of clip.indices) if (byte > clip.palette.length) fail('コピーした色番号が不正です。');
  if (!clip.origin || !Number.isSafeInteger(clip.origin.x) || !Number.isSafeInteger(clip.origin.y)) fail('コピーした範囲の位置が不正です。');
  // Optional future non-rectangular selection mask: 0 unselected, 1 selected.
  // Transparency is still carried by indices, independently of selection membership.
  if (clip.mask !== undefined && (!(clip.mask instanceof Uint8Array) || clip.mask.length !== clip.indices.length || clip.mask.some(value => value !== 0 && value !== 1))) fail('選択マスクが不正です。');
}

/** Detach every owned buffer; no document or caller buffer is retained. */
export function cloneDrawSelection(clip) {
  validateClipboard(clip);
  return Object.freeze({ ...clip, palette: Object.freeze([...clip.palette]), origin: Object.freeze({ ...clip.origin }), indices: new Uint8Array(clip.indices), ...(clip.mask ? { mask: new Uint8Array(clip.mask) } : {}) });
}

export function createDrawSelectionClipboard() {
  let snapshot = null;
  return {
    get hasValue() { return Boolean(snapshot); },
    set(clip) { if (!clip) return false; snapshot = cloneDrawSelection(clip); return true; },
    read() { return snapshot ? cloneDrawSelection(snapshot) : null; }
  };
}

/** Shared clipped opaque walk for signed editing pixels and zero-based clipboard bytes. */
export function visitOpaqueDrawSelection(source, width, height, origin, canvasWidth, canvasHeight, visit, { mask = null, transparent = 0 } = {}) {
  for (let y = Math.max(0, -origin.y); y < Math.min(height, canvasHeight - origin.y); y++) for (let x = Math.max(0, -origin.x); x < Math.min(width, canvasWidth - origin.x); x++) {
    const index = y * width + x;
    if (mask && !mask[index]) continue;
    const value = typeof source === 'function' ? source(x, y) : source[index];
    if (value !== transparent) visit((origin.y + y) * canvasWidth + origin.x + x, value);
  }
}

/** Clear only the captured opaque footprint, never the holes in its rectangle. */
export function clearDrawSelection(doc, clip, sourceBounds) {
  validateClipboard(clip);
  const pixels = [...doc.pixels];
  visitOpaqueDrawSelection(clip.indices, clip.width, clip.height, sourceBounds, doc.width, doc.height, index => { pixels[index] = -1; }, { mask: clip.mask });
  return { ...doc, pixels };
}

/** Sample the immutable original; quarter turns and flips are exact index permutations. */
export function sampleDrawSelection(clip, { width, height, turns = 0, flipX = false, flipY = false }) {
  validateClipboard(clip);
  if (!dimension(width) || !dimension(height) || !Number.isInteger(turns)) fail('選択の幅・高さは1〜256pxです。');
  turns = ((turns % 4) + 4) % 4;
  const ow = turns % 2 ? clip.height : clip.width, oh = turns % 2 ? clip.width : clip.height;
  const result = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let ox = Math.min(ow - 1, Math.floor((x + .5) * ow / width)), oy = Math.min(oh - 1, Math.floor((y + .5) * oh / height));
    if (flipX) ox = ow - 1 - ox;
    if (flipY) oy = oh - 1 - oy;
    let sx = ox, sy = oy;
    if (turns === 1) { sx = oy; sy = clip.height - 1 - ox; }
    if (turns === 2) { sx = clip.width - 1 - ox; sy = clip.height - 1 - oy; }
    if (turns === 3) { sx = clip.width - 1 - oy; sy = ox; }
    const source = sy * clip.width + sx;
    result[y * width + x] = !clip.mask || clip.mask[source] ? clip.indices[source] : 0;
  }
  return result;
}

/** A staging document only. The caller commits pixels + palette once after validation. */
export function projectDrawSelection(base, clip, transform, { sourceBounds = null, otherColors = [], enforceLimits = true, maxPalette = 32, maxUsedColors = 32 } = {}) {
  validateDrawDocument(base);
  const raster = transform.angle === undefined ? { ...transform, indices: sampleDrawSelection(clip, transform) } : rasterDrawSelection(clip, transform);
  const { x, y, width, height, indices: samples } = raster;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || Math.abs(x) > 4096 || Math.abs(y) > 4096) fail('選択の位置が範囲外です。');
  let visiblePixels = 0;
  const usedBytes = new Set();
  visitOpaqueDrawSelection(samples, width, height, raster, base.width, base.height, (_index, value) => { visiblePixels++; usedBytes.add(value); });
  if (!visiblePixels) {
    if (enforceLimits) fail('キャンバス内に不透明な画素が必要です。位置またはサイズを調整してください。');
    return { document: base, visiblePixels: 0 };
  }
  const next = sourceBounds ? clearDrawSelection(base, clip, sourceBounds) : { ...base, pixels: [...base.pixels] };
  next.palette = [...base.palette];
  const targetColors = new Map(next.palette.map((color, index) => [selectionColor(color), index])), remap = new Map();
  for (const byte of usedBytes) {
    const color = selectionColor(clip.palette[byte - 1]);
    if (!targetColors.has(color)) {
      if (enforceLimits && next.palette.length >= maxPalette) fail('パレットは32色までです。貼り付けは確定していません。');
      targetColors.set(color, next.palette.length); next.palette.push(color.slice(0, 7));
    }
    remap.set(byte, targetColors.get(color));
  }
  visitOpaqueDrawSelection(samples, width, height, raster, base.width, base.height, (index, byte) => { next.pixels[index] = remap.get(byte); });
  if (enforceLimits) {
    const used = new Set(otherColors.map(selectionColor));
    for (const value of next.pixels) used.add(value < 0 ? '#00000000' : selectionColor(next.palette[value]));
    if (used.size > maxUsedColors) fail('透明を含む使用色は作品全体で32色までです。貼り付けは確定していません。');
  }
  return { document: next, visiblePixels };
}

/** Inverse-map destination pixel centers directly into the immutable original, once. */
export function rasterDrawSelection(clip, frame) {
  validateClipboard(clip);
  if (!dimension(frame.width) || !dimension(frame.height) || ![frame.x, frame.y, frame.angle].every(Number.isFinite)
    || Math.abs(frame.x) > 4096 || Math.abs(frame.y) > 4096) fail('選択の位置・角度・寸法が不正です。');
  const bounds = selectionFrameBounds(frame), indices = new Uint8Array(bounds.width * bounds.height), mask = new Uint8Array(indices.length), { c, s } = selectionAxes(frame.angle);
  for (let y = 0; y < bounds.height; y++) for (let x = 0; x < bounds.width; x++) {
    const wx = bounds.x + x + .5 - frame.x, wy = bounds.y + y + .5 - frame.y;
    // Remove only floating-point noise at quarter-turn boundaries; keep genuine subpixels.
    const u = Math.round((c * wx + s * wy) * 1e10) / 1e10, v = Math.round((-s * wx + c * wy) * 1e10) / 1e10;
    if (u < 0 || v < 0 || u >= frame.width || v >= frame.height) continue;
    let sx = Math.min(clip.width - 1, Math.floor(u * clip.width / frame.width)), sy = Math.min(clip.height - 1, Math.floor(v * clip.height / frame.height));
    if (frame.flipX) sx = clip.width - 1 - sx;
    if (frame.flipY) sy = clip.height - 1 - sy;
    const source = sy * clip.width + sx;
    if (!clip.mask || clip.mask[source]) { indices[y * bounds.width + x] = clip.indices[source]; mask[y * bounds.width + x] = 1; }
  }
  return { ...bounds, indices, mask };
}

/** Logical hit testing shared by real pointers and the virtual cursor. */
export function drawSelectionHandle(point, bounds, radiusX, radiusY) {
  if (!bounds) return null;
  // A tiny selection must still be movable from its center.
  if (bounds.width < radiusX * 3 && bounds.height < radiusY * 3
    && Math.abs(point.x - bounds.x - bounds.width / 2) < bounds.width * .22
    && Math.abs(point.y - bounds.y - bounds.height / 2) < bounds.height * .22) return null;
  let best = Infinity, handle = null;
  for (const [name, x, y] of [['nw', bounds.x, bounds.y], ['ne', bounds.x + bounds.width, bounds.y], ['sw', bounds.x, bounds.y + bounds.height], ['se', bounds.x + bounds.width, bounds.y + bounds.height]]) {
    const distance = ((point.x - x) / radiusX) ** 2 + ((point.y - y) / radiusY) ** 2;
    if (distance <= 1 && distance < best) { best = distance; handle = name; }
  }
  return handle;
}

export function resizeDrawSelectionFromHandle(bounds, handle, dx, dy, fixedRatio = true, aspectRatio = bounds.width / bounds.height) {
  const west = handle.includes('w'), north = handle.includes('n');
  let width = Math.max(1, Math.min(256, bounds.width + (west ? -dx : dx)));
  let height = Math.max(1, Math.min(256, bounds.height + (north ? -dy : dy)));
  if (fixedRatio) {
    if (Math.abs(width / bounds.width - 1) >= Math.abs(height / bounds.height - 1)) height = Math.round(width / aspectRatio);
    else width = Math.round(height * aspectRatio);
    const factor = Math.min(1, 256 / Math.max(width, height));
    width = Math.max(1, Math.round(width * factor)); height = Math.max(1, Math.round(height * factor));
  }
  return { ...bounds, x: west ? bounds.x + bounds.width - width : bounds.x, y: north ? bounds.y + bounds.height - height : bounds.y, width, height };
}

/** Full-canvas membership is independent of opaque pixels, including transparent holes. */
export function drawSelectionMask(bounds, width, height) {
  if (!bounds) return null;
  if (bounds.mask instanceof Uint8Array && bounds.mask.length === width * height) return bounds.mask;
  const mask = new Uint8Array(width * height);
  for (let y = Math.max(0, bounds.y); y < Math.min(height, bounds.y + bounds.height); y++)
    for (let x = Math.max(0, bounds.x); x < Math.min(width, bounds.x + bounds.width); x++) mask[y * width + x] = 1;
  return mask;
}
export function rasterSelectionMask(raster, width, height) {
  const mask = new Uint8Array(width * height);
  for (let y = Math.max(0, -raster.y); y < Math.min(raster.height, height - raster.y); y++)
    for (let x = Math.max(0, -raster.x); x < Math.min(raster.width, width - raster.x); x++)
      mask[(y + raster.y) * width + x + raster.x] = raster.mask[y * raster.width + x];
  return mask;
}
