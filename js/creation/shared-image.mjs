import { evaluateSharedCanvasPolicy, SHARED_CANVAS_FREE_MAX_COLORS, SHARED_CANVAS_FREE_MAX_DIMENSION, SHARED_CANVAS_PREMIUM_MAX_COLORS, SHARED_CANVAS_PREMIUM_MAX_DIMENSION } from './shared-canvas-policy.mjs?rev=20261001-free-tools-1';

const MAX_PIXELS = 2 * 1024 * 1024;

function validateImage(image) {
  if (!image || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
    || image.width < 1 || image.height < 1 || image.width * image.height > MAX_PIXELS
    || !(image.rgba instanceof Uint8Array || image.rgba instanceof Uint8ClampedArray)
    || image.rgba.length !== image.width * image.height * 4) throw new TypeError('共通画像の寸法またはRGBA画素を確認できません。');
  return image;
}

function colorKey(rgba, offset) {
  return (rgba[offset] | (rgba[offset + 1] << 8) | (rgba[offset + 2] << 16) | (rgba[offset + 3] << 24)) >>> 0;
}
function unpackColor(key) { return [key & 255, (key >>> 8) & 255, (key >>> 16) & 255, (key >>> 24) & 255]; }

/** Count exact RGBA tuples, including alpha. With stopAfter, return stopAfter + 1 once exceeded. */
export function countSharedImageColors(image, stopAfter) {
  validateImage(image);
  if (stopAfter !== undefined && (!Number.isSafeInteger(stopAfter) || stopAfter < 0)) throw new RangeError('stopAfterは0以上の整数にしてください。');
  // Use a capped Set for the small palette checks used by editors and cameras.
  // Large exact counts use a packed array and in-place numeric sort, avoiding a
  // JS object per distinct pixel when reading full-colour legacy canvases.
  if (stopAfter !== undefined && stopAfter <= 128) {
    const colors = new Set(); const bytes = image.rgba;
    for (let offset = 0; offset < bytes.length; offset += 4) {
      colors.add(colorKey(bytes, offset));
      if (colors.size > stopAfter) return stopAfter + 1;
    }
    return colors.size;
  }
  if (image.width * image.height > 8192) {
    const keys = new Uint32Array(image.width * image.height); const bytes = image.rgba;
    for (let index = 0, offset = 0; index < keys.length; index += 1, offset += 4) keys[index] = colorKey(bytes, offset);
    keys.sort();
    let count = 0; let previous = -1;
    for (const key of keys) {
      if (count === 0 || key !== previous) {
        count += 1; previous = key;
        if (stopAfter !== undefined && count > stopAfter) return stopAfter + 1;
      }
    }
    return count;
  }
  const colors = new Set(); const bytes = image.rgba;
  for (let offset = 0; offset < bytes.length; offset += 4) {
    colors.add(colorKey(bytes, offset));
    if (stopAfter !== undefined && colors.size > stopAfter) return stopAfter + 1;
  }
  return colors.size;
}

function resizedBytes(image, width, height) {
  const rgba = new Uint8Array(width * height * 4); const source = image.rgba;
  if (width === image.width && height === image.height) { rgba.set(source); return rgba; }
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor((y + 0.5) * image.height / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor((x + 0.5) * image.width / width));
      const sourceOffset = (sourceY * image.width + sourceX) * 4;
      rgba.set(source.subarray(sourceOffset, sourceOffset + 4), (y * width + x) * 4);
    }
  }
  return rgba;
}

function containedBytes(image, width, height) {
  const scale = Math.min(width / image.width, height / image.height);
  const innerWidth = Math.max(1, Math.min(width, Math.round(image.width * scale)));
  const innerHeight = Math.max(1, Math.min(height, Math.round(image.height * scale)));
  const inner = resizedBytes(image, innerWidth, innerHeight);
  const rgba = new Uint8Array(width * height * 4);
  const left = Math.floor((width - innerWidth) / 2); const top = Math.floor((height - innerHeight) / 2);
  for (let y = 0; y < innerHeight; y += 1) rgba.set(inner.subarray(y * innerWidth * 4, (y + 1) * innerWidth * 4), ((top + y) * width + left) * 4);
  return rgba;
}

function histogram(rgba) {
  const map = new Map();
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const key = colorKey(rgba, offset); const entry = map.get(key);
    if (entry) entry.count += 1;
    else map.set(key, { key, color: unpackColor(key), count: 1 });
  }
  return [...map.values()];
}

function boxRange(box) {
  const low = [255, 255, 255, 255]; const high = [0, 0, 0, 0];
  for (const entry of box) for (let channel = 0; channel < 4; channel += 1) {
    const value = entry.color[channel]; low[channel] = Math.min(low[channel], value); high[channel] = Math.max(high[channel], value);
  }
  return high.map((value, channel) => value - low[channel]);
}

function splitPalette(colors, limit) {
  let boxes = [colors];
  while (boxes.length < limit) {
    let selected = -1; let selectedAxis = 0; let bestScore = -1;
    for (let index = 0; index < boxes.length; index += 1) {
      const box = boxes[index]; if (box.length < 2) continue;
      const ranges = boxRange(box); const weights = [3, 4, 2, 4];
      let axis = 0; let range = -1;
      for (let channel = 0; channel < 4; channel += 1) if (ranges[channel] * weights[channel] > range) { axis = channel; range = ranges[channel] * weights[channel]; }
      const weight = box.reduce((sum, item) => sum + item.count, 0);
      const score = range * Math.log2(weight + 1);
      if (score > bestScore) { bestScore = score; selected = index; selectedAxis = axis; }
    }
    if (selected < 0) break;
    const box = boxes[selected];
    box.sort((a, b) => a.color[selectedAxis] - b.color[selectedAxis] || a.key - b.key);
    const half = box.reduce((sum, item) => sum + item.count, 0) / 2; let weight = 0; let split = 1;
    for (let index = 0; index < box.length - 1; index += 1) { weight += box[index].count; split = index + 1; if (weight >= half) break; }
    boxes.splice(selected, 1, box.slice(0, split), box.slice(split));
  }
  return boxes.map((box) => {
    const total = box.reduce((sum, item) => sum + item.count, 0); const rgba = [0, 0, 0, 0];
    for (let channel = 0; channel < 4; channel += 1) rgba[channel] = Math.round(box.reduce((sum, item) => sum + item.color[channel] * item.count, 0) / total);
    return rgba;
  });
}

function quantize(rgba, maxColors) {
  const colors = histogram(rgba); if (colors.length <= maxColors) return rgba;
  const hasTransparent = colors.some((item) => item.color[3] === 0);
  const opaque = colors.filter((item) => item.color[3] !== 0);
  const opaqueBudget = maxColors - (hasTransparent ? 1 : 0);
  if (opaque.length && opaqueBudget < 1) throw new RangeError('透明部分を保つには色数を2色以上にしてください。');
  const palette = opaque.length ? splitPalette(opaque, opaqueBudget) : [];
  const assignments = new Map();
  for (const item of opaque) {
    let nearest = palette[0]; let distance = Infinity;
    for (const candidate of palette) {
      const dr = item.color[0] - candidate[0]; const dg = item.color[1] - candidate[1]; const db = item.color[2] - candidate[2]; const da = item.color[3] - candidate[3];
      const score = dr * dr * 3 + dg * dg * 4 + db * db * 2 + da * da * 4;
      if (score < distance) { distance = score; nearest = candidate; }
    }
    assignments.set(item.key, nearest);
  }
  const output = new Uint8Array(rgba.length);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    if (rgba[offset + 3] === 0) output.set([0, 0, 0, 0], offset);
    else output.set(assignments.get(colorKey(rgba, offset)), offset);
  }
  return output;
}

/** Prepare a newly captured/imported image once; mode changes must use the stored image directly. */
export function prepareSharedCanvasImage(image, { passActive = false, width, height, maxColors, fit } = {}) {
  validateImage(image);
  const maxDimension = passActive ? SHARED_CANVAS_PREMIUM_MAX_DIMENSION : SHARED_CANVAS_FREE_MAX_DIMENSION;
  const policyColors = passActive ? SHARED_CANVAS_PREMIUM_MAX_COLORS : SHARED_CANVAS_FREE_MAX_COLORS;
  if (maxColors !== undefined && (!Number.isSafeInteger(maxColors) || maxColors < 1)) throw new RangeError('maxColorsは1以上の整数にしてください。');
  const colorLimit = Math.min(maxColors ?? policyColors, policyColors);
  const targetWidth = width === undefined ? Infinity : width;
  const targetHeight = height === undefined ? Infinity : height;
  if ((targetWidth !== Infinity && (!Number.isSafeInteger(targetWidth) || targetWidth < 1))
    || (targetHeight !== Infinity && (!Number.isSafeInteger(targetHeight) || targetHeight < 1))) throw new RangeError('変換先の寸法を確認できません。');
  const explicitSize = width !== undefined && height !== undefined;
  if (fit !== undefined && fit !== 'contain') throw new TypeError('fitはcontainのみ指定できます。');
  if (explicitSize && (width > maxDimension || height > maxDimension || width * height > MAX_PIXELS)) throw new RangeError(`変換先は各辺${maxDimension}pxまでです。`);
  const scale = explicitSize ? 1 : Math.min(1, maxDimension / Math.max(image.width, image.height), targetWidth / image.width, targetHeight / image.height);
  const outWidth = explicitSize ? width : Math.max(1, Math.round(image.width * scale)); const outHeight = explicitSize ? height : Math.max(1, Math.round(image.height * scale));
  let rgba = explicitSize && fit === 'contain' ? containedBytes(image, outWidth, outHeight) : resizedBytes(image, outWidth, outHeight);
  const beforeColors = countSharedImageColors({ width: outWidth, height: outHeight, rgba }, colorLimit);
  if (beforeColors > colorLimit) rgba = quantize(rgba, colorLimit);
  const colorCount = countSharedImageColors({ width: outWidth, height: outHeight, rgba });
  const policy = evaluateSharedCanvasPolicy({ width: outWidth, height: outHeight, colorCount }, { passActive });
  const changed = outWidth !== image.width || outHeight !== image.height || !rgba.every((value, index) => value === image.rgba[index]);
  return { image: { width: outWidth, height: outHeight, rgba }, changed, sourceWidth: image.width, sourceHeight: image.height, colorCount, policy };
}
