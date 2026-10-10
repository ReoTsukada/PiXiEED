import { getAnimationCelDocument, setAnimationPalette } from './animation-core.mjs';

/** Safe indexed Draw color adjustments with detached pixel or shared-palette results. */
export const DRAW_COLOR_DEFAULTS = Object.freeze({ brightness: 0, contrast: 0, saturation: 100, curve: Object.freeze([0, 64, 128, 192, 255]), paletteMode: 'exact' });
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const validColor = value => typeof value === 'string' && /^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value);
const parseColor = value => [1, 3, 5].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16));
const alphaSuffix = value => value.length === 9 ? value.slice(7, 9).toLowerCase() : '';
const toHex = (rgb, alpha = '') => `#${rgb.map(value => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0')).join('')}${alpha}`;

export function normalizeDrawColorSettings(value = {}) {
  const curve = Array.isArray(value.curve) && value.curve.length === 5
    ? value.curve.map(n => clamp(Math.round(Number(n) || 0), 0, 255))
    : [...DRAW_COLOR_DEFAULTS.curve];
  return {
    brightness: clamp(Number(value.brightness) || 0, -100, 100),
    contrast: clamp(Number(value.contrast) || 0, -100, 100),
    saturation: clamp(Number(value.saturation ?? 100) || 0, 0, 200),
    curve,
    paletteMode: value.paletteMode === 'nearest' ? 'nearest' : 'exact',
  };
}

function curveValue(channel, points) {
  const x = clamp(channel, 0, 255); const anchors = [0, 64, 128, 192, 255];
  let left = 0; while (left < 3 && x > anchors[left + 1]) left += 1;
  const mix = (x - anchors[left]) / (anchors[left + 1] - anchors[left]);
  return points[left] + (points[left + 1] - points[left]) * mix;
}

function adjustColor(rgb, settings) {
  const bright = settings.brightness * 2.55;
  const contrast = settings.contrast * 2.55;
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const gray = rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114;
  const saturation = settings.saturation / 100;
  return rgb.map(channel => curveValue(clamp(factor * (gray + (channel - gray) * saturation + bright - 128) + 128, 0, 255), settings.curve));
}

/** Transform the single palette shared by every frame/layer, preserving indexes. */
export function adjustDrawColorAnimation(animation, rawSettings = {}) {
  if (!animation || !Array.isArray(animation.palette) || !Array.isArray(animation.layers)) throw new TypeError('Invalid Draw animation');
  const locked = animation.layers.filter(layer => layer.locked);
  if (locked.length) {
    const error = new Error(`ロック中のレイヤーがあるため全体調整できません: ${locked.map(layer => layer.name).join('、')}`);
    error.code = 'DRAW_COLOR_LOCKED_LAYER'; throw error;
  }
  const settings = normalizeDrawColorSettings(rawSettings);
  if (settings.brightness === 0 && settings.contrast === 0 && settings.saturation === 100
    && settings.curve.every((value, index) => value === DRAW_COLOR_DEFAULTS.curve[index])) return animation;
  const palette = animation.palette.map(color => toHex(adjustColor(parseColor(color), settings), alphaSuffix(color)));
  return setAnimationPalette(animation, palette);
}

export function getAdjustedAnimationCel(animation, frameId, layerId) {
  return getAnimationCelDocument(animation, frameId, layerId);
}

/**
 * Create a detached adjusted cel with new/deduplicated palette colors. Selection
 * cells are the only indices that can change; -1 transparency is always kept.
 * Large cels yield between chunks and accept an AbortSignal or stale-preview
 * predicate so old slider previews cannot finish after newer ones.
 */
export async function adjustDrawColorDocument(document, rawSettings = {}, {
  selectionMask = null, signal = null, isCancelled = () => false,
  yieldEvery = 8192, onProgress = null, maxPalette = 128,
} = {}) {
  if (!document || !Number.isInteger(document.width) || document.width < 1 || !Number.isInteger(document.height) || document.height < 1
    || !Array.isArray(document.pixels) || document.pixels.length !== document.width * document.height
    || !Array.isArray(document.palette) || document.palette.length < 1 || document.palette.some(color => !validColor(color))) {
    throw new TypeError('Invalid indexed drawing document');
  }
  if (selectionMask != null && (!(selectionMask instanceof Uint8Array) || selectionMask.length !== document.pixels.length)) throw new TypeError('Invalid selection mask');
  const settings = normalizeDrawColorSettings(rawSettings);
  const chunkSize = Number.isInteger(yieldEvery) && yieldEvery > 0 ? yieldEvery : 8192;
  if (!Number.isInteger(maxPalette) || maxPalette < document.palette.length) throw new RangeError('Invalid palette capacity');
  const used = new Set();
  for (let start = 0; start < document.pixels.length; start += chunkSize) {
    if (signal?.aborted || isCancelled()) { const error = new Error('Color adjustment preview cancelled'); error.name = 'AbortError'; throw error; }
    const end = Math.min(document.pixels.length, start + chunkSize);
    for (let index = start; index < end; index += 1) {
      const value = document.pixels[index];
      if (value !== -1 && (!Number.isInteger(value) || value < 0 || value >= document.palette.length)) throw new RangeError('Invalid palette index in drawing');
      if (value === -1 || (selectionMask && !selectionMask[index])) continue;
      used.add(value);
    }
    if (end < document.pixels.length) await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (!used.size || (settings.brightness === 0 && settings.contrast === 0 && settings.saturation === 100
    && settings.curve.every((value, index) => value === DRAW_COLOR_DEFAULTS.curve[index]))) return document;
  const newPalette = [...document.palette];
  const remap = new Map();
  for (const source of used) {
    const sourceColor = document.palette[source];
    const adjusted = toHex(adjustColor(parseColor(sourceColor), settings), alphaSuffix(sourceColor));
    let next = newPalette.findIndex(color => color.toLowerCase() === adjusted);
    if (next < 0 && settings.paletteMode === 'nearest') {
      const target = parseColor(adjusted); let distance = Infinity;
      for (let index = 0; index < newPalette.length; index += 1) {
        if (alphaSuffix(newPalette[index]) !== alphaSuffix(sourceColor)) continue;
        const candidate = parseColor(newPalette[index]);
        const current = (target[0] - candidate[0]) ** 2 + (target[1] - candidate[1]) ** 2 + (target[2] - candidate[2]) ** 2;
        if (current < distance) { distance = current; next = index; }
      }
    }
    if (next < 0) {
      if (newPalette.length >= maxPalette) {
        const error = new RangeError(`調整色を追加できません。パレット上限 ${maxPalette} 色に達しています。`);
        error.code = 'DRAW_COLOR_PALETTE_FULL'; throw error;
      }
      next = newPalette.length; newPalette.push(adjusted);
    }
    remap.set(source, next);
  }
  const pixels = [...document.pixels]; let changed = false;
  for (let start = 0; start < pixels.length; start += chunkSize) {
    if (signal?.aborted || isCancelled()) { const error = new Error('Color adjustment preview cancelled'); error.name = 'AbortError'; throw error; }
    const end = Math.min(pixels.length, start + chunkSize);
    for (let index = start; index < end; index += 1) {
      if (selectionMask && !selectionMask[index]) continue;
      const source = document.pixels[index];
      if (source === -1) continue;
      if (!Number.isInteger(source) || source < 0 || source >= document.palette.length || !remap.has(source)) throw new RangeError('Invalid palette index in drawing');
      const next = remap.get(source);
      if (next !== source) { pixels[index] = next; changed = true; }
    }
    onProgress?.(end, pixels.length);
    if (end < pixels.length) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return changed ? { ...document, palette: newPalette, pixels } : document;
}
