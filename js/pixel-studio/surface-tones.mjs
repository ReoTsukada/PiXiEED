import { fitTone, grayLight } from './global-tones.mjs';

const BASE_LIMIT = 24;
const PALETTE_LIMIT = 48;
const MAX_RAMPS = 12;

function validateColor(color, name) {
  if (!Array.isArray(color) || color.length !== 3 ||
      color.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new TypeError(`${name} must be an RGB byte triplet`);
  }
  return [...color];
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.palette) ||
      !Array.isArray(snapshot.ramps)) {
    throw new TypeError('snapshot must contain palette and ramps arrays');
  }
  if (snapshot.palette.length < 2 || snapshot.palette.length > BASE_LIMIT) {
    throw new RangeError(`snapshot palette must contain 2 to ${BASE_LIMIT} colors`);
  }
  if (snapshot.ramps.length > MAX_RAMPS) throw new RangeError(`snapshot may contain at most ${MAX_RAMPS} ramps`);

  const palette = snapshot.palette.map((color, index) => validateColor(color, `palette[${index}]`));
  const keys = new Set();
  const ramps = snapshot.ramps.map((ramp, rampIndex) => {
    if (!ramp || typeof ramp !== 'object' || typeof ramp.key !== 'string' || !ramp.key ||
        !Array.isArray(ramp.indices)) {
      throw new TypeError(`ramps[${rampIndex}] must have a key and indices`);
    }
    if (keys.has(ramp.key)) throw new RangeError('ramp keys must be unique');
    keys.add(ramp.key);
    const base = validateColor(ramp.base, `ramps[${rampIndex}].base`);
    if (!Number.isInteger(ramp.mainIndex) || ramp.mainIndex < 0 || ramp.mainIndex >= palette.length) {
      throw new RangeError(`ramps[${rampIndex}].mainIndex is outside the palette`);
    }
    const seen = new Set();
    const indices = ramp.indices.map((index) => {
      if (!Number.isInteger(index) || index < 0 || index >= palette.length || seen.has(index)) {
        throw new RangeError(`ramps[${rampIndex}].indices contains an invalid or duplicate index`);
      }
      seen.add(index);
      return index;
    });
    if (!seen.has(ramp.mainIndex)) throw new RangeError(`ramps[${rampIndex}] must include its mainIndex`);
    return { key: ramp.key, base, mainIndex: ramp.mainIndex, indices };
  });
  return { palette, ramps };
}

/**
 * Derive a bounded set of same-hue local tone choices without changing the
 * captured global palette or its indices. The caller owns when these extras
 * are eligible for rendering.
 */
export function buildSurfaceTones(snapshot) {
  const { palette: basePalette, ramps } = validateSnapshot(snapshot);
  const palette = basePalette.map((color) => [...color]);
  const paletteIndexByRgb = new Map(palette.map((color, index) => [color.join(','), index]));
  const extrasByRamp = new Map(ramps.map((ramp) => [ramp.key, []]));
  const targetsByIndex = new Map();

  for (const ramp of ramps) {
    const mainGray = grayLight(...palette[ramp.mainIndex]);
    const existingGrays = ramp.indices.map((index) => grayLight(...palette[index]));
    const lower = existingGrays.filter((gray) => gray < mainGray).reduce((best, gray) =>
      best === null || gray > best ? gray : best, null);
    const higher = existingGrays.filter((gray) => gray > mainGray).reduce((best, gray) =>
      best === null || gray < best ? gray : best, null);
    const targetGrays = [];
    if (lower !== null) targetGrays.push(Math.round((lower + mainGray) / 2));
    if (higher !== null) targetGrays.push(Math.round((mainGray + higher) / 2));
    for (const targetGray of targetGrays) {
      if (extrasByRamp.get(ramp.key).length >= 2) break;
      if (targetGray < 40 || targetGray > 224 ||
          existingGrays.some((gray) => Math.abs(gray - targetGray) < 7)) continue;

      const color = fitTone(ramp.base, targetGray);
      const key = color.join(',');
      let index = paletteIndexByRgb.get(key);
      if (index === undefined) {
        if (palette.length >= PALETTE_LIMIT) continue;
        index = palette.length;
        palette.push(color);
        paletteIndexByRgb.set(key, index);
      }
      if (ramp.indices.includes(index) || extrasByRamp.get(ramp.key).includes(index)) continue;
      extrasByRamp.get(ramp.key).push(index);
      targetsByIndex.set(index, targetGray);
    }
  }

  return { palette, extrasByRamp, targets: targetsByIndex, baseSize: basePalette.length, limit: PALETTE_LIMIT };
}
