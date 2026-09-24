const FOUR_LEVELS = Object.freeze([24, 88, 168, 240]);
const EIGHT_LEVELS = Object.freeze([24, 56, 88, 128, 168, 192, 216, 240]);

function channel(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 255) throw new RangeError(`${name} must be in the range 0..255`);
  return value;
}

function rgbValues(rgb) {
  if (!Array.isArray(rgb) || rgb.length < 3) throw new TypeError('rgb must contain three channels');
  return [channel(rgb[0], 'red'), channel(rgb[1], 'green'), channel(rgb[2], 'blue')];
}

function decodeSrgb(value) {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

// Camera RGB bytes have only 256 possible channel values. Keep the exact
// transfer curve, but evaluate its power once per value instead of per pixel.
const BYTE_LINEAR = Float64Array.from({ length: 256 }, (_, value) => decodeSrgb(value));

export function srgbToLinear(channel0to255) {
  const value = channel(channel0to255, 'channel');
  return value === 0 ? value : Number.isInteger(value) ? BYTE_LINEAR[value] : decodeSrgb(value);
}

export function linearToSrgb(linear0to1) {
  if (!Number.isFinite(linear0to1) || linear0to1 < 0 || linear0to1 > 1) {
    throw new RangeError('linear value must be in the range 0..1');
  }
  const srgb = linear0to1 <= 0.0031308
    ? linear0to1 * 12.92
    : 1.055 * linear0to1 ** (1 / 2.4) - 0.055;
  return srgb * 255;
}

export function relativeLuminance(r, g, b) {
  const red = srgbToLinear(r), green = srgbToLinear(g), blue = srgbToLinear(b);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function grayLight(r, g, b) {
  return linearToSrgb(relativeLuminance(r, g, b));
}

export function grayLevels(count = 4) {
  if (count === 4) return [...FOUR_LEVELS];
  if (count === 8) return [...EIGHT_LEVELS];
  throw new RangeError('count must be 4 or 8');
}

/** Map RGB to a requested gray-axis luminance while retaining as much linear-RGB chroma as fits. */
export function fitTone(rgbArray, targetGray, { chromaScale = 1 } = {}) {
  if (!Number.isFinite(chromaScale) || chromaScale < 0) throw new RangeError('chromaScale must be finite and non-negative');
  const rgb = rgbValues(rgbArray);
  channel(targetGray, 'targetGray');
  const source = rgb.map(srgbToLinear);
  const sourceY = 0.2126 * source[0] + 0.7152 * source[1] + 0.0722 * source[2];
  const targetY = srgbToLinear(targetGray);
  const deltas = source.map((value) => (value - sourceY) * chromaScale);
  let chroma = 1;
  for (const delta of deltas) {
    if (delta > 0) chroma = Math.min(chroma, (1 - targetY) / delta);
    else if (delta < 0) chroma = Math.min(chroma, targetY / -delta);
  }
  chroma = Math.max(0, Math.min(1, chroma));
  return deltas.map((delta) => Math.round(linearToSrgb(Math.max(0, Math.min(1, targetY + chroma * delta)))));
}

export function prepareGlobalToneRamp(palette, indices) {
  if (!Array.isArray(palette)) throw new TypeError('palette must be an array');
  if (!Array.isArray(indices) || indices.length < 1) throw new RangeError('indices must contain at least one palette index');
  const seen = new Set();
  const ramp = indices.map((index) => {
    if (!Number.isInteger(index) || index < 0 || index >= palette.length || seen.has(index)) {
      throw new RangeError('indices contains an invalid or duplicate palette index');
    }
    seen.add(index);
    const [r, g, b] = rgbValues(palette[index]);
    return { index, light: grayLight(r, g, b), luminance: relativeLuminance(r, g, b) };
  });
  ramp.sort((a, b) => a.light - b.light || a.index - b.index);
  return ramp;
}

export function nearestGlobalToneIndex(lightGray, ramp) {
  if (!Number.isFinite(lightGray) || lightGray < 0 || lightGray > 255) throw new RangeError('lightGray must be in the range 0..255');
  if (!Array.isArray(ramp) || ramp.length < 1) throw new TypeError('ramp must contain at least one entry');
  let nearest = ramp[0];
  if (!nearest || !Number.isInteger(nearest.index) || !Number.isFinite(nearest.light)) throw new TypeError('ramp entries require an integer index and finite light');
  let distance = Math.abs(lightGray - nearest.light);
  for (let i = 1; i < ramp.length; i++) {
    const entry = ramp[i];
    if (!entry || !Number.isInteger(entry.index) || !Number.isFinite(entry.light)) throw new TypeError('ramp entries require an integer index and finite light');
    const nextDistance = Math.abs(lightGray - entry.light);
    if (nextDistance < distance || (nextDistance === distance && entry.index < nearest.index)) {
      nearest = entry;
      distance = nextDistance;
    }
  }
  return nearest.index;
}
