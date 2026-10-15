export const SHARED_CANVAS_FREE_MAX_DIMENSION = 256;
export const SHARED_CANVAS_FREE_MAX_COLORS = 32;
export const SHARED_CANVAS_PREMIUM_MAX_DIMENSION = 256;
export const SHARED_CANVAS_PREMIUM_MAX_COLORS = 64;

/** Technical support and current entitlement are separate: expired originals remain readable. */
export function evaluateSharedCanvasPolicy({ width, height, colorCount } = {}, { passActive = false } = {}) {
  const dimensionsValid = Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0;
  const colorsValid = Number.isSafeInteger(colorCount) && colorCount >= 0;
  const maxDimension = SHARED_CANVAS_PREMIUM_MAX_DIMENSION;
  const maxColors = passActive ? SHARED_CANVAS_PREMIUM_MAX_COLORS : SHARED_CANVAS_FREE_MAX_COLORS;
  const supported = dimensionsValid && colorsValid && width <= maxDimension && height <= maxDimension && colorCount <= SHARED_CANVAS_PREMIUM_MAX_COLORS;
  const premiumContent = supported && colorCount > SHARED_CANVAS_FREE_MAX_COLORS;
  const locked = premiumContent && !passActive;
  let reason = null;
  if (!dimensionsValid || !colorsValid) reason = 'invalid-canvas';
  else if (width > maxDimension || height > maxDimension) reason = 'canvas-over-256px';
  else if (colorCount > SHARED_CANVAS_PREMIUM_MAX_COLORS) reason = 'colors-over-64';
  else if (locked) reason = 'premium-required';
  return { supported, premiumContent, locked, reason, maxDimension, maxColors };
}
