export const SHARED_CANVAS_FREE_MAX_DIMENSION = 256;
export const SHARED_CANVAS_FREE_MAX_COLORS = 32;
export const SHARED_CANVAS_PREMIUM_MAX_DIMENSION = 256;
export const SHARED_CANVAS_PREMIUM_MAX_COLORS = 32;

/** All supported canvases are free. Oversized originals stay readable without removing performance limits. */
export function evaluateSharedCanvasPolicy({ width, height, colorCount } = {}, { passActive = false } = {}) {
  const dimensionsValid = Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0;
  const colorsValid = Number.isSafeInteger(colorCount) && colorCount > 0;
  const maxDimension = SHARED_CANVAS_FREE_MAX_DIMENSION;
  const maxColors = SHARED_CANVAS_FREE_MAX_COLORS;
  const supported = dimensionsValid && colorsValid
    && width <= SHARED_CANVAS_PREMIUM_MAX_DIMENSION && height <= SHARED_CANVAS_PREMIUM_MAX_DIMENSION
    && colorCount <= SHARED_CANVAS_PREMIUM_MAX_COLORS;
  const premiumContent = false;
  const locked = false;
  let reason = null;
  if (!dimensionsValid || !colorsValid) reason = 'invalid-canvas';
  else if (width > SHARED_CANVAS_PREMIUM_MAX_DIMENSION || height > SHARED_CANVAS_PREMIUM_MAX_DIMENSION) reason = 'canvas-over-256px';
  else if (colorCount > SHARED_CANVAS_PREMIUM_MAX_COLORS) reason = 'colors-over-32';
  else if (locked) reason = 'premium-required';
  return { supported, premiumContent, locked, reason, maxDimension, maxColors };
}
