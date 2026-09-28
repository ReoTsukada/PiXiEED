import { createDrawDocument, DRAW_SIZES, MAX_DRAW_COLORS, validateDrawDocument } from './draw-core.mjs?rev=20260927-draw-step08-3';
import { normalizePixelFile, readPixelImageDimensions } from '../pixel-scale.mjs?rev=20260929-claude-integration-1';

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_SOURCE_PIXELS = 2 * 1024 * 1024;
export const CAMERA_HANDOFF_KEY = 'PiXiEED:camera-handoff:v1';
const IMAGE_TYPES = new Set(['image/png', 'image/webp']);

function rgbaKey(data, offset) {
  return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

function colorHex(key) { return `#${key.toString(16).padStart(8, '0')}`; }
function makeExactPalette(rgba, pixels) {
  const palette = []; const indexes = new Map(); const result = Array(pixels).fill(-1);
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4; if (rgba[offset + 3] === 0) continue;
    const key = rgbaKey(rgba, offset); let colorIndex = indexes.get(key);
    if (colorIndex === undefined) {
      if (palette.length === MAX_DRAW_COLORS) return null;
      colorIndex = palette.length; palette.push(colorHex(key)); indexes.set(key, colorIndex);
    }
    result[index] = colorIndex;
  }
  return palette.length ? { palette, pixels: result } : null;
}

const RGB_BINS = 16 * 16 * 16;
const HISTOGRAM_BINS = RGB_BINS * 4;
function histogramBin(red, green, blue, alpha) {
  if (alpha === 0) return -1;
  const alphaBin = alpha === 255 ? 3 : Math.min(2, Math.floor((alpha - 1) * 3 / 254));
  return alphaBin * RGB_BINS + (blue >> 4) * 256 + (green >> 4) * 16 + (red >> 4);
}

function medianCutPalette(rgba) {
  const counts = new Uint32Array(HISTOGRAM_BINS);
  const sumsR = new Uint32Array(HISTOGRAM_BINS); const sumsG = new Uint32Array(HISTOGRAM_BINS);
  const sumsB = new Uint32Array(HISTOGRAM_BINS); const sumsA = new Uint32Array(HISTOGRAM_BINS);
  const occupied = new Uint16Array(HISTOGRAM_BINS); let occupiedCount = 0;
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const alpha = rgba[offset + 3]; if (alpha === 0) continue;
    const bin = histogramBin(rgba[offset], rgba[offset + 1], rgba[offset + 2], alpha);
    if (counts[bin] === 0) occupied[occupiedCount++] = bin;
    counts[bin] += 1; sumsR[bin] += rgba[offset]; sumsG[bin] += rgba[offset + 1]; sumsB[bin] += rgba[offset + 2]; sumsA[bin] += alpha;
  }
  if (!occupiedCount) throw new RangeError('透明以外の画素がないため、この画像は複製できません。');
  const bins = new Array(occupiedCount);
  for (let index = 0; index < occupiedCount; index += 1) {
    const id = occupied[index]; const weight = counts[id];
    bins[index] = { id, weight, r: sumsR[id] / weight, g: sumsG[id] / weight, b: sumsB[id] / weight, a: sumsA[id] / weight, sumsR: sumsR[id], sumsG: sumsG[id], sumsB: sumsB[id], sumsA: sumsA[id] };
  }
  const boxes = [{ bins, weight: bins.reduce((sum, bin) => sum + bin.weight, 0) }];
  while (boxes.length < MAX_DRAW_COLORS) {
    let selected = -1; let selectedChannel = -1; let selectedScore = -1;
    for (let boxIndex = 0; boxIndex < boxes.length; boxIndex += 1) {
      const box = boxes[boxIndex]; if (box.bins.length < 2) continue;
      const min = [Infinity, Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity, -Infinity];
      for (const bin of box.bins) {
        const values = [bin.r, bin.g, bin.b, bin.a];
        for (let channel = 0; channel < 4; channel += 1) { min[channel] = Math.min(min[channel], values[channel]); max[channel] = Math.max(max[channel], values[channel]); }
      }
      let channel = 0; for (let next = 1; next < 4; next += 1) if (max[next] - min[next] > max[channel] - min[channel]) channel = next;
      const range = max[channel] - min[channel]; if (!range) continue;
      const score = range * box.weight;
      if (score > selectedScore) { selected = boxIndex; selectedChannel = channel; selectedScore = score; }
    }
    if (selected < 0) break;
    const box = boxes[selected]; const keys = ['r', 'g', 'b', 'a']; const key = keys[selectedChannel];
    box.bins.sort((left, right) => left[key] - right[key] || left.id - right.id);
    const half = box.weight / 2; let weight = 0; let split = 1;
    for (let index = 0; index < box.bins.length - 1; index += 1) { weight += box.bins[index].weight; if (weight >= half) { split = index + 1; break; } }
    const leftBins = box.bins.slice(0, split); const rightBins = box.bins.slice(split);
    boxes.splice(selected, 1, { bins: leftBins, weight: leftBins.reduce((sum, bin) => sum + bin.weight, 0) }, { bins: rightBins, weight: rightBins.reduce((sum, bin) => sum + bin.weight, 0) });
  }
  const palette = boxes.map((box) => {
    let weight = 0; let red = 0; let green = 0; let blue = 0; let alpha = 0;
    for (const bin of box.bins) { weight += bin.weight; red += bin.sumsR; green += bin.sumsG; blue += bin.sumsB; alpha += bin.sumsA; }
    return [Math.round(red / weight), Math.round(green / weight), Math.round(blue / weight), Math.round(alpha / weight)];
  });
  const remap = new Int16Array(HISTOGRAM_BINS); remap.fill(-1);
  for (const bin of bins) {
    let best = 0; let bestDistance = Infinity;
    for (let index = 0; index < palette.length; index += 1) {
      const color = palette[index]; const dr = bin.r - color[0]; const dg = bin.g - color[1]; const db = bin.b - color[2]; const da = bin.a - color[3];
      const distance = dr * dr * 3 + dg * dg * 4 + db * db * 2 + da * da * 4;
      if (distance < bestDistance) { bestDistance = distance; best = index; }
    }
    remap[bin.id] = best;
  }
  return { palette: palette.map((color) => colorHex(((color[0] << 24) | (color[1] << 16) | (color[2] << 8) | color[3]) >>> 0)), remap };
}

export function createImportedDrawDocument(image, size = 128) {
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || image.width * image.height > MAX_IMPORT_SOURCE_PIXELS || !image.data || image.data.length !== image.width * image.height * 4) throw new TypeError('読み込んだ画像の大きさや画素データを確認できません。');
  if (!DRAW_SIZES.includes(size)) throw new RangeError('16/32/64/128/256/512px から選んでください');
  const scale = Math.min(size / image.width, size / image.height);
  const width = Math.max(1, Math.min(size, Math.round(image.width * scale)));
  const height = Math.max(1, Math.min(size, Math.round(image.height * scale)));
  const offsetX = Math.floor((size - width) / 2); const offsetY = Math.floor((size - height) / 2);
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sx = Math.min(image.width - 1, Math.floor((x + 0.5) * image.width / width));
    const sy = Math.min(image.height - 1, Math.floor((y + 0.5) * image.height / height));
    const sourceOffset = (sy * image.width + sx) * 4; const targetOffset = ((offsetY + y) * size + offsetX + x) * 4;
    for (let channel = 0; channel < 4; channel += 1) rgba[targetOffset + channel] = image.data[sourceOffset + channel];
  }
  const document = createDrawDocument(size);
  if (rgba.every((value, index) => index % 4 !== 3 || value === 0)) {
    return { document, sourceWidth: image.sourceWidth || image.width, sourceHeight: image.sourceHeight || image.height, copiedWidth: width, copiedHeight: height, colorCount: 0, quantized: false };
  }
  const exact = makeExactPalette(rgba, size * size);
  let palette; let pixels; let quantized = false;
  if (exact) { palette = exact.palette; pixels = exact.pixels; }
  else {
    const reduced = medianCutPalette(rgba); palette = reduced.palette; pixels = Array(size * size).fill(-1); quantized = true;
    for (let index = 0; index < pixels.length; index += 1) {
      const offset = index * 4; const alpha = rgba[offset + 3];
      if (alpha !== 0) pixels[index] = reduced.remap[histogramBin(rgba[offset], rgba[offset + 1], rgba[offset + 2], alpha)];
    }
  }
  document.palette = palette; document.pixels = pixels;
  validateDrawDocument(document);
  return { document, sourceWidth: image.sourceWidth || image.width, sourceHeight: image.sourceHeight || image.height, copiedWidth: width, copiedHeight: height, colorCount: palette.length, quantized };
}

export async function decodeDrawImageFile(file, { createImageBitmapImpl = globalThis.createImageBitmap, documentRef = globalThis.document, keepScale = false, inferScale = true, minDots = 8 } = {}) {
  if (!file || !(file instanceof Blob)) throw new TypeError('画像ファイルを選んでください。');
  if (!IMAGE_TYPES.has(file.type)) throw new TypeError('ドット絵のPNGかWebP画像を選んでください。');
  if (file.size > MAX_IMPORT_FILE_BYTES) throw new RangeError('画像ファイルは10MB以内にしてください。');
  const image = await normalizePixelFile(file, { createImageBitmapImpl, documentRef, keepScale, inferScale, minDots });
  if (image.width * image.height > MAX_IMPORT_SOURCE_PIXELS) throw new RangeError('画像の画素数が多すぎます（最大で約210万画素です）。');
  return { width: image.width, height: image.height, data: image.data, scale: image.scale, sourceWidth: image.sourceWidth, sourceHeight: image.sourceHeight };
}

export function readDrawImageDimensions(header, mimeType) {
  return readPixelImageDimensions(header, mimeType);
}

export function decodeCameraHandoff(serialized, now = Date.now()) {
  try {
    if (!serialized || serialized.length > 1024 * 1024) return null;
    const handoff = JSON.parse(serialized);
    if (!Number.isSafeInteger(handoff.createdAt) || handoff.createdAt > now || now - handoff.createdAt > 7 * 24 * 60 * 60 * 1000) return null;
    if (typeof handoff.dataUrl !== 'string' || !/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(handoff.dataUrl)) return null;
    const [metadata, encoded] = handoff.dataUrl.split(','); const mimeType = metadata.slice(5, metadata.indexOf(';'));
    const binary = atob(encoded); if (!binary.length || binary.length > MAX_IMPORT_FILE_BYTES) return null;
    const bytes = new Uint8Array(binary.length); for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { file: new Blob([bytes], { type: mimeType }), createdAt: handoff.createdAt };
  } catch { return null; }
}

export function cameraHandoffImage(localStorageRef, now = Date.now()) {
  try {
    const storage = localStorageRef || globalThis.localStorage;
    return decodeCameraHandoff(storage?.getItem(CAMERA_HANDOFF_KEY), now);
  } catch { return null; }
}
