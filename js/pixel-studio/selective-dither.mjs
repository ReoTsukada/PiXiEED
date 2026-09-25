import { srgbToLinear } from './global-tones.mjs';

// Dither belongs to smooth shading transitions, not to every intermediate RGB.
// See docs/pixel-camera-selective-dither.md for artistic sources and limitations.
export function smoothTransitionCells(light, labels, protectedCells, width, height) {
  const count = width * height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || count > 512 * 512 ||
      light?.length !== count || labels?.length !== count || protectedCells?.length !== count) {
    throw new RangeError('transition buffers must match a bounded output grid');
  }
  const candidates = new Uint8Array(count);
  // A complete 5x5 patch must belong to the same material, with no protected
  // detail. This also prevents tiny parts and one-pixel edge halos being dotted.
  for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
    const cell = y * width + x, label = labels[cell], center = light[cell];
    if (protectedCells[cell]) continue;
    let valid = true, residual = 0;
    const dx = (light[cell + 2] - light[cell - 2]) / 4;
    const dy = (light[cell + 2 * width] - light[cell - 2 * width]) / 4;
    const slope = Math.hypot(dx, dy);
    // Flat fields stay solid. Abrupt edges and fine texture are not gradients.
    if (slope < 0.65 || slope > 6) continue;
    for (let oy = -2; oy <= 2 && valid; oy++) for (let ox = -2; ox <= 2; ox++) {
      const neighbor = cell + oy * width + ox;
      if (labels[neighbor] !== label || protectedCells[neighbor]) { valid = false; break; }
      residual += Math.abs(light[neighbor] - (center + dx * ox + dy * oy));
    }
    if (valid && residual / 25 <= Math.max(1.25, slope * 0.6)) candidates[cell] = 1;
  }
  // Isolated eligibility specks must not punch holes into otherwise solid planes.
  const supported = new Uint8Array(count);
  for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
    const cell = y * width + x;
    if (!candidates[cell]) continue;
    let neighbors = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (ox || oy) neighbors += candidates[cell + oy * width + ox];
    }
    if (neighbors >= 5) supported[cell] = 1;
  }
  return supported;
}

const RANK_2 = [[0, 2], [3, 1]];

/** -1 keeps the ordinary solid tone. Only a narrow mid-tone band gets dots. */
export function transitionRampIndex(light, ramp, x, y, maxSpread = 100) {
  if (!Number.isFinite(light) || !Number.isInteger(x) || !Number.isInteger(y)) throw new TypeError('finite light and integer canvas coordinates required');
  if (ramp.length < 2 || light <= ramp[0].light || light >= ramp.at(-1).light) return -1;
  let upper = 1;
  while (upper < ramp.length && light > ramp[upper].light) upper++;
  const low = ramp[upper - 1], high = ramp[upper];
  const spread = high.light - low.light;
  // High-contrast checkerboards read as rough texture, even on a smooth input.
  if (spread < 6 || spread > maxSpread) return -1;
  // Global-tone ramps describe actual light energy. Coverage interpolates Y,
  // while the spatial smoothness gate still measures gray-axis steps.
  const amount = Number.isFinite(low.luminance) && Number.isFinite(high.luminance)
    ? (srgbToLinear(Math.max(0, Math.min(255, light))) - low.luminance) / (high.luminance - low.luminance)
    : (light - low.light) / spread;
  if (amount < 0.32 || amount > 0.68) return -1;
  const coverage = amount < 0.44 ? 1 : amount > 0.56 ? 3 : 2;
  // Classical nested 25/50/75 percent patterns. No sparse 1/16 dots or holes.
  // At 50 percent every horizontal and vertical neighbor is the opposite tone.
  const rank = RANK_2[((y % 2) + 2) % 2][((x % 2) + 2) % 2];
  return rank < coverage ? high.index : low.index;
}
