const BAYER_4 = Object.freeze([
  Object.freeze([0, 8, 2, 10]),
  Object.freeze([12, 4, 14, 6]),
  Object.freeze([3, 11, 1, 9]),
  Object.freeze([15, 7, 13, 5])
]);

const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const mod8 = (value) => ((value % 8) + 8) % 8;

/** Compile the at-most-three permitted palette entries once per material. */
export function prepareToneRamp(palette, allowed) {
  if (!Array.isArray(palette)) throw new TypeError('palette must be an array');
  if (!Array.isArray(allowed) || allowed.length < 1 || allowed.length > 3) {
    throw new RangeError('allowed must contain one to three palette indices');
  }
  const seen = new Set();
  const ramp = allowed.map((index) => {
    if (!Number.isInteger(index) || index < 0 || index >= palette.length || seen.has(index)) {
      throw new RangeError('allowed contains an invalid or duplicate palette index');
    }
    seen.add(index);
    const color = palette[index];
    if (!Array.isArray(color) || color.length < 3 || color.slice(0, 3).some((channel) =>
      !Number.isFinite(channel) || channel < 0 || channel > 255)) {
      throw new TypeError('palette entries must contain RGB channels in the range 0..255');
    }
    return { index, light: luminance(color) };
  });
  ramp.sort((a, b) => a.light - b.light || a.index - b.index);
  return ramp;
}

// Each 2x2 tile contributes two sites to either checkerboard parity. Ordering
// all even sites first makes exactly half coverage a true four-neighbor checker.
function thresholdRank(x, y) {
  const px = mod8(x), py = mod8(y);
  const parity = (px + py) & 1;
  const blockRank = BAYER_4[py >> 1][px >> 1];
  const localRank = (px & 1) === (py & 1) ? px & 1 : py & 1;
  return parity * 32 + blockRank * 2 + localRank;
}

/** Pick a stable tone from a precompiled ramp at integer output coordinates. */
export function orderedRampIndex(light, ramp, x, y) {
  if (!Number.isFinite(light)) throw new TypeError('light must be finite');
  if (!Number.isInteger(x) || !Number.isInteger(y)) throw new TypeError('x and y must be integer output coordinates');
  if (!Array.isArray(ramp) || ramp.length < 1 || ramp.length > 3) throw new TypeError('ramp must contain one to three entries');
  if (ramp.length === 1 || light <= ramp[0].light) return ramp[0].index;
  const last = ramp.length - 1;
  if (light >= ramp[last].light) return ramp[last].index;

  let upper = 1;
  while (upper < ramp.length && light > ramp[upper].light) upper++;
  const lowerTone = ramp[upper - 1], upperTone = ramp[upper];
  const spread = upperTone.light - lowerTone.light;
  if (spread < 3) {
    return light - lowerTone.light <= upperTone.light - light ? lowerTone.index : upperTone.index;
  }

  const amount = Math.max(0, Math.min(1, (light - lowerTone.light) / spread));
  const coverage = Math.round(amount * 16) / 16;
  const threshold = (thresholdRank(x, y) + 0.5) / 64;
  return coverage > threshold ? upperTone.index : lowerTone.index;
}

/** Convenience wrapper; hot loops should prepareToneRamp once and reuse it. */
export function orderedToneIndex(light, palette, allowed, x, y) {
  return orderedRampIndex(light, prepareToneRamp(palette, allowed), x, y);
}
