import { planCameraPlacementMemory } from './camera-placement-preview.mjs?rev=20261113-canvas1028-shared-2';
import { ANIMATION_MAX_PALETTE_ENTRIES, ANIMATION_MAX_DIMENSION } from './animation-core.mjs?rev=20261113-canvas1028-shared-2';

import { REWARD_LIMITS } from '../ads/site-reward-config.mjs?rev=20261016-color-capability-1';

function assertCameraTargetPalette(doc) {
  if (!Array.isArray(doc?.palette) || doc.palette.some(color => typeof color !== 'string' || !/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(color))) throw new TypeError('カメラの適用先パレットを確認できません。作品と撮影画像は保持しています。');
}
const HEX_BYTES=Array.from({length:256},(_,i)=>i.toString(16).padStart(2,'0'));
const rgbaKey = hex => hex.length === 7 ? `${hex.toLowerCase()}ff` : hex.toLowerCase();
/** Choose existing palette slots; transparent pixels never consume the visible-color budget. */
export function chooseCameraPalette(doc, mask, otherUsedIndices = [], { maxColors = REWARD_LIMITS.draw.rewardColors } = {}) {
  assertCameraTargetPalette(doc);
  const required = new Set(otherUsedIndices);
  doc.pixels.forEach((value, index) => { if (mask && !mask[index]) required.add(value); });
  const capacity = maxColors;
  const indices = [], colors = new Set();
  for (const value of [...required, ...new Set(doc.pixels), ...doc.palette.keys()]) {
    const color = doc.palette[value]?.toLowerCase();
    if (!color || !/^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(color) || rgbaKey(color).endsWith('00') || colors.has(rgbaKey(color))) continue;
    if (indices.length >= capacity) break;
    colors.add(rgbaKey(color)); indices.push(value);
  }
  return indices;
}

/** Snapshot the selected cells so a camera session cannot drift with later selection changes. */
export function prepareCameraTarget(doc, mask, allowedIndices, {copyDocument=true,memoryContext={}}={}) {
  assertCameraTargetPalette(doc);
  const { width, height } = doc;
  if (!Number.isInteger(width) || width<1 || width>ANIMATION_MAX_DIMENSION || !Number.isInteger(height) || height<1 || height>ANIMATION_MAX_DIMENSION || !Array.isArray(doc.pixels) || doc.pixels.length !== width * height) throw new TypeError('Invalid drawing');
  if (mask != null && (!(mask instanceof Uint8Array) || mask.length !== width * height)) throw new TypeError('Invalid selection mask');
  let count=mask?0:width*height;if(mask)for(const value of mask)if(value)count++;
  const budget=planCameraPlacementMemory({width,height,selectedCells:count,irregular:Boolean(mask),...memoryContext});
  if(!budget.allowed){const error=new RangeError('選択範囲がカメラの作業メモリ上限を超えます。作品は変更していません。');error.code='camera-memory-budget';throw error;}
  const cells=new Uint32Array(count);let cursor=0;
  for (let i = 0; i < width * height; i += 1) if (!mask || mask[i]) cells[cursor++]=i;
  if (!cells.length) throw new TypeError('Select at least one cell');
  let left = width; let top = height; let right = -1; let bottom = -1;
  for (const i of cells) { const x = i % width; const y = Math.floor(i / width); left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  const bounds = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  const permitted = [...new Set(allowedIndices ?? doc.palette.map((_, i) => i))];
  if (!permitted.length || permitted.some((i) => !Number.isInteger(i) || i < 0 || i >= doc.palette.length)) throw new TypeError('Invalid palette selection');
  const document = copyDocument ? { ...doc, pixels: width*height>256*256?Int16Array.from(doc.pixels):[...doc.pixels], palette: [...doc.palette] } : null;
  return Object.freeze({ memoryContext:Object.freeze({...memoryContext}),document, width, height, bounds: Object.freeze(bounds), cells, palette: Object.freeze([...doc.palette]), allowedIndices: Object.freeze(permitted), mask: mask ? new Uint8Array(mask) : null });
}

const rgb = (hex) => [1, 3, 5, 7].map((n) => Number.parseInt(rgbaKey(hex).slice(n, n + 2), 16));
/** Convert RGBA samples to signed palette slots, choosing only among allowed existing slots. */
export function cameraPixels(rgba, palette, allowedIndices, saturation = 1) {
  if (!rgba || rgba.length % 4 || !Array.isArray(palette) || !allowedIndices?.length) throw new TypeError('Invalid camera pixels');
  const choices = allowedIndices.map((i) => { if (!Number.isInteger(i) || i < 0 || i >= palette.length) throw new RangeError('Invalid palette slot'); const color = palette[i]; if (typeof color !== 'string' || !/^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(color)) throw new TypeError('Camera replacements require RGBA palette colors'); return [i, rgb(color)]; });
  const out = new Int16Array(rgba.length / 4); const sat = Math.max(0, Math.min(2, Number(saturation) || 0));
  const matchCache=new Map();
  for (let p = 0; p < out.length; p += 1) {
    const o = p * 4;
    const cacheKey=((rgba[o]<<24)|(rgba[o+1]<<16)|(rgba[o+2]<<8)|rgba[o+3])>>>0;
    const cached=matchCache.get(cacheKey);if(cached!==undefined){out[p]=cached;continue;}
    let best = choices[0][0]; let distance = Infinity;
    const gray = (rgba[o] * 0.299 + rgba[o + 1] * 0.587 + rgba[o + 2] * 0.114);
    const r = Math.max(0, Math.min(255, gray + (rgba[o] - gray) * sat));
    const g = Math.max(0, Math.min(255, gray + (rgba[o + 1] - gray) * sat));
    const b = Math.max(0, Math.min(255, gray + (rgba[o + 2] - gray) * sat));
    for (const [i, candidate] of choices) { const d = (r - candidate[0]) ** 2 + (g - candidate[1]) ** 2 + (b - candidate[2]) ** 2 + (rgba[o + 3] - candidate[3]) ** 2; if (d < distance) { best = i; distance = d; } }
    if(matchCache.size>=2048)matchCache.clear();matchCache.set(cacheKey,best);
    out[p] = best; // Every selected cell is replaced by an existing RGBA palette color.
  }
  return out;
}

/** Return a new drawing with chosen selected cells replaced; holes and source remain untouched. */
export function replaceCameraPixels(doc, target, indices) {
  if (target.width !== doc.width || target.height !== doc.height || !indices || indices.length !== target.cells.length) throw new TypeError('Camera target no longer matches drawing');
  if (doc.palette.length !== target.palette.length || doc.palette.some((color, i) => color !== target.palette[i])) throw new TypeError('Camera palette no longer matches drawing');
  const pixels = [...doc.pixels];
  for (let n = 0; n < target.cells.length; n += 1) {
    const value = indices[n];
    if (!Number.isInteger(value) || !target.allowedIndices.includes(value) || !/^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(doc.palette[value] ?? '')) throw new RangeError('Invalid replacement color');
    pixels[target.cells[n]] = value;
  }
  return { ...doc, palette: [...doc.palette], pixels };
}
/** Stage the selected output pixels and appended colors without mutating the
 * project. A failed plan leaves the captured image available for another choice. */
export function planCameraReplacement(target, rgba, { paletteFixed = false, maxColors = REWARD_LIMITS.draw.rewardColors, otherUsedIndices = [],memoryContext=target?.memoryContext||{} } = {}) {
  assertCameraTargetPalette(target?.document);
  if (Array.isArray(target?.palette)) assertCameraTargetPalette({ ...target.document, palette: target.palette });
  if (!rgba || rgba.length !== target.cells.length * 4) throw new TypeError('撮影画像の画素数が一致しません。');
  const budget=planCameraPlacementMemory({width:target.width,height:target.height,selectedCells:target.cells.length,irregular:Boolean(target.mask),...memoryContext});
  if(!budget.allowed){const error=new RangeError('カメラ適用の作業メモリ上限を超えます。作品は変更していません。');error.code='camera-memory-budget';throw error;}
  const palette = [...target.palette], normalize = rgbaKey;
  const slots = new Map();
  palette.forEach((hex, index) => { if (!slots.has(normalize(hex))) slots.set(normalize(hex), index); });
  const pixels = [...target.document.pixels], additions = [];
  const fixedPixels = paletteFixed ? cameraPixels(rgba, palette, target.allowedIndices) : null;
  for (let n = 0; n < target.cells.length; n++) {
    const offset = n * 4, alpha = rgba[offset + 3];
    if (alpha === 0) { pixels[target.cells[n]] = -1; continue; }
    if (paletteFixed) { pixels[target.cells[n]] = fixedPixels[n]; continue; }
    const hex = '#'+HEX_BYTES[rgba[offset]]+HEX_BYTES[rgba[offset+1]]+HEX_BYTES[rgba[offset+2]]+(alpha===255?'':HEX_BYTES[alpha]);
    let index = slots.get(normalize(hex));
    if (index === undefined) {
      if(palette.length>=ANIMATION_MAX_PALETTE_ENTRIES){const error=new RangeError('撮影画像の登録色数が上限を超えます。画像と作品は変更していません。');error.code='camera-palette-overflow';throw error;}
      index = palette.length; slots.set(normalize(hex), index); palette.push(hex); additions.push(hex); }
    pixels[target.cells[n]] = index;
  }
  const usedIndices=new Set(otherUsedIndices);for(const value of pixels)if(value>=0)usedIndices.add(value);
  const usedColors=new Set();for(const value of usedIndices)if(value>=0){const key=normalize(palette[value]);if(!key.endsWith('00'))usedColors.add(key);}
  if (usedColors.size > maxColors || palette.length > ANIMATION_MAX_PALETTE_ENTRIES) {
    const error = new RangeError(`使用色を追加すると${usedColors.size}色になります。現在の使用色上限は${maxColors}色、登録パレット上限は${ANIMATION_MAX_PALETTE_ENTRIES}色です。色数の少ない撮影モードか「パレット固定」を選んで撮り直してください。画像と作品は変更していません。`);
    error.code = 'camera-palette-overflow'; throw error;
  }
  return { document: { ...target.document, palette, pixels }, additions };
}
