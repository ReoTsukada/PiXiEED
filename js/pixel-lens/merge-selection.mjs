const SEED_NEIGHBOR_RADIUS = 2;
const SEED_RAW_OKLAB_DISTANCE = 0.045;
const DISTANCE_EPSILON = 1e-12;

function frameInfo(frame, label) {
  const width = frame?.width;
  const height = frame?.height;
  const pixels = width * height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || !Number.isSafeInteger(pixels) || !frame?.data || frame.data.length !== pixels * 4) {
    throw new TypeError(`${label} must have positive safe-integer dimensions and exactly width*height*4 RGBA values`);
  }
  for (let offset = 0; offset < frame.data.length; offset += 1) {
    const channel = frame.data[offset];
    if (!Number.isFinite(channel) || channel < 0 || channel > 255) throw new TypeError(`${label} RGBA values must be finite channels in 0..255`);
  }
  return { width, height, pixels };
}

function checkedPalette(palette) {
  if (!Array.isArray(palette) || palette.length === 0) throw new TypeError('palette must be a non-empty array');
  return palette.map((entry, index) => {
    const channels = Array.isArray(entry) || ArrayBuffer.isView(entry)
      ? [entry[0], entry[1], entry[2]]
      : entry && typeof entry === 'object' ? [entry.r, entry.g, entry.b] : null;
    if (!channels || channels.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)) {
      throw new TypeError(`palette[${index}] must contain RGB channels in 0..255`);
    }
    return channels;
  });
}

function validateSeed(seed, width, height) {
  if (!seed || typeof seed !== 'object' || !Number.isInteger(seed.x) || !Number.isInteger(seed.y)
    || seed.x < 0 || seed.y < 0 || seed.x >= width || seed.y >= height) {
    throw new RangeError('seed must be an integer pixel inside the frame');
  }
}

function offsetAt(x, y, width) { return (y * width + x) * 4; }
function readRgb(data, offset) { return [data[offset], data[offset + 1], data[offset + 2]]; }
function rgbDistanceSquared(a, b) {
  const dr = a[0] - b[0]; const dg = a[1] - b[1]; const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}
function nearestPaletteIndex(pixel, colors) {
  let best = -1;
  let bestDistance = Infinity;
  for (let index = 0; index < colors.length; index += 1) {
    const distance = rgbDistanceSquared(pixel, colors[index]);
    if (distance < bestDistance) { best = index; bestDistance = distance; }
  }
  return best;
}
function oklab(rgb) {
  const linear = (value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  const r = linear(rgb[0]); const g = linear(rgb[1]); const b = linear(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  ];
}
function labDistanceSquared(a, b) {
  const dl = a[0] - b[0]; const da = a[1] - b[1]; const db = a[2] - b[2];
  return dl * dl + da * da + db * db;
}

/**
 * Pick a palette source at the exact seed, using only nearby opaque rendered colors
 * whose raw source pixels remain close to the center in Oklab.
 */
export function pickMergeSource({ source, rendered, palette, seed } = {}) {
  const src = frameInfo(source, 'source');
  const out = frameInfo(rendered, 'rendered');
  if (src.width !== out.width || src.height !== out.height) throw new RangeError('source and rendered dimensions must match');
  const colors = checkedPalette(palette);
  validateSeed(seed, src.width, src.height);

  const centerOffset = offsetAt(seed.x, seed.y, src.width);
  if (source.data[centerOffset + 3] === 0 || rendered.data[centerOffset + 3] === 0) return null;

  const centerRawLab = oklab(readRgb(source.data, centerOffset));
  const centerRenderedIndex = nearestPaletteIndex(readRgb(rendered.data, centerOffset), colors);
  const observed = new Set();
  const maxDistanceSquared = SEED_RAW_OKLAB_DISTANCE ** 2;

  for (let dy = -SEED_NEIGHBOR_RADIUS; dy <= SEED_NEIGHBOR_RADIUS; dy += 1) {
    const y = seed.y + dy;
    if (y < 0 || y >= src.height) continue;
    for (let dx = -SEED_NEIGHBOR_RADIUS; dx <= SEED_NEIGHBOR_RADIUS; dx += 1) {
      const x = seed.x + dx;
      if (x < 0 || x >= src.width) continue;
      const offset = offsetAt(x, y, src.width);
      if (source.data[offset + 3] === 0 || rendered.data[offset + 3] === 0) continue;
      if (labDistanceSquared(oklab(readRgb(source.data, offset)), centerRawLab) > maxDistanceSquared) continue;
      const index = nearestPaletteIndex(readRgb(rendered.data, offset), colors);
      if (index >= 0) observed.add(index);
    }
  }

  if (!observed.size) return null;
  const centerPaletteLab = colors.map(oklab);
  let sourceIndex = -1;
  let bestDistance = Infinity;
  for (const index of observed) {
    const distance = labDistanceSquared(centerPaletteLab[index], centerRawLab);
    if (distance < bestDistance - DISTANCE_EPSILON) {
      sourceIndex = index;
      bestDistance = distance;
    } else if (Math.abs(distance - bestDistance) <= DISTANCE_EPSILON) {
      const candidateIsCenter = index === centerRenderedIndex;
      const currentIsCenter = sourceIndex === centerRenderedIndex;
      if ((candidateIsCenter && !currentIsCenter) || (candidateIsCenter === currentIsCenter && index < sourceIndex)) sourceIndex = index;
    }
  }

  return { sourceIndex, seed: { x: seed.x, y: seed.y } };
}

/** Rank existing palette entries by their opaque rendered-pixel count inside a supplied mask. */
export function rankMergeTargets({ rendered, palette, mask, sourceIndex } = {}) {
  const out = frameInfo(rendered, 'rendered');
  const colors = checkedPalette(palette);
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= colors.length) throw new RangeError('sourceIndex must refer to an entry in palette');
  if (!mask || typeof mask.length !== 'number' || mask.length !== out.pixels) throw new TypeError('mask must contain one value per rendered pixel');

  const counts = new Array(colors.length).fill(0);
  for (let pixel = 0; pixel < out.pixels; pixel += 1) {
    if (!mask[pixel]) continue;
    const offset = pixel * 4;
    if (rendered.data[offset + 3] === 0) continue;
    const index = nearestPaletteIndex(readRgb(rendered.data, offset), colors);
    if (index >= 0) counts[index] += 1;
  }

  const paletteLabs = colors.map(oklab);
  const sourceLab = paletteLabs[sourceIndex];
  const candidates = colors.map((_color, index) => index).filter((index) => index !== sourceIndex);
  candidates.sort((a, b) => {
    const countDelta = counts[b] - counts[a];
    if (countDelta) return countDelta;
    const distanceDelta = labDistanceSquared(paletteLabs[a], sourceLab) - labDistanceSquared(paletteLabs[b], sourceLab);
    return Math.abs(distanceDelta) > DISTANCE_EPSILON ? distanceDelta : a - b;
  });
  candidates.push(sourceIndex);
  const recommendedIndex = candidates.find((index) => index !== sourceIndex && counts[index] > 0) ?? -1;
  return candidates.map((index) => ({ index, count: counts[index], recommended: index === recommendedIndex }));
}
