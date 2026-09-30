export const SHARED_CANVAS_FREE_MAX_DIMENSION = 128;
export const SHARED_CANVAS_FREE_MAX_COLORS = 16;
export const SHARED_CANVAS_PREMIUM_MAX_DIMENSION = 256;
export const SHARED_CANVAS_PREMIUM_MAX_COLORS = 32;

/** Check an image against the shared free/premium editing limits. Old oversized work stays readable. */
export function evaluateSharedCanvasPolicy({ width, height, colorCount } = {}, { passActive = false } = {}) {
  const dimensionsValid = Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0;
  const colorsValid = Number.isSafeInteger(colorCount) && colorCount > 0;
  const maxDimension = passActive ? SHARED_CANVAS_PREMIUM_MAX_DIMENSION : SHARED_CANVAS_FREE_MAX_DIMENSION;
  const maxColors = passActive ? SHARED_CANVAS_PREMIUM_MAX_COLORS : SHARED_CANVAS_FREE_MAX_COLORS;
  const supported = dimensionsValid && colorsValid
    && width <= SHARED_CANVAS_PREMIUM_MAX_DIMENSION && height <= SHARED_CANVAS_PREMIUM_MAX_DIMENSION
    && colorCount <= SHARED_CANVAS_PREMIUM_MAX_COLORS;
  const premiumContent = supported && (width > SHARED_CANVAS_FREE_MAX_DIMENSION
    || height > SHARED_CANVAS_FREE_MAX_DIMENSION || colorCount > SHARED_CANVAS_FREE_MAX_COLORS);
  const locked = premiumContent && !passActive;
  let reason = null;
  if (!dimensionsValid || !colorsValid) reason = 'invalid-canvas';
  else if (width > SHARED_CANVAS_PREMIUM_MAX_DIMENSION || height > SHARED_CANVAS_PREMIUM_MAX_DIMENSION) reason = 'canvas-over-256px';
  else if (colorCount > SHARED_CANVAS_PREMIUM_MAX_COLORS) reason = 'colors-over-32';
  else if (locked) reason = 'premium-required';
  return { supported, premiumContent, locked, reason, maxDimension, maxColors };
}
