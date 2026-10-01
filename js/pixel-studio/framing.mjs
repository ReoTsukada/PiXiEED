export const FRAME_RATIOS = Object.freeze([
  Object.freeze({ value: 'screen', label: '画面', ratio: null }),
  Object.freeze({ value: '1:1', label: '1:1', ratio: 1 }),
  Object.freeze({ value: '3:4', label: '3:4', ratio: 3 / 4 }),
  Object.freeze({ value: '9:16', label: '9:16', ratio: 9 / 16 }),
  Object.freeze({ value: '4:3', label: '4:3', ratio: 4 / 3 }),
  Object.freeze({ value: '16:9', label: '16:9', ratio: 16 / 9 })
]);

export const OUTPUT_SIZES = Object.freeze([16, 32, 64, 96, 128, 160, 256, 512]);
export const DEFAULT_FRAME_RATIO = '1:1';

/** New camera captures use the same long-edge allowance as the shared canvas. */
export function sharedOutputSizes(passActive = false) {
  const maxDimension = 256;
  return OUTPUT_SIZES.filter((size) => size <= maxDimension);
}

/** Normalize an old camera preset to the nearest currently supported capture size. */
export function normalizeOutputSize(value, fallback = 128) {
  const sizes = sharedOutputSizes();
  const safeFallback = sizes.includes(fallback) ? fallback : sizes[0];
  const requested = Number(value);
  if (!Number.isFinite(requested) || requested <= 0) return safeFallback;
  if (sizes.includes(requested)) return requested;
  if (requested > sizes.at(-1)) return sizes.at(-1);
  return sizes.reduce((best, size) => Math.abs(size - requested) < Math.abs(best - requested) ? size : best, safeFallback);
}

/** The shared camera keeps screen dimensions out of the saved canvas geometry. */
export function sharedFrameRatios() {
  return FRAME_RATIOS.filter((item) => item.ratio !== null);
}

function assertPositiveFinite(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive finite number`);
}

export function resolveAspect(value, viewportWidth, viewportHeight) {
  assertPositiveFinite(viewportWidth, 'viewportWidth');
  assertPositiveFinite(viewportHeight, 'viewportHeight');
  const selected = FRAME_RATIOS.find((item) => item.value === value);
  return selected && selected.ratio !== null ? selected.ratio : viewportWidth / viewportHeight;
}

export function centerCrop(nativeWidth, nativeHeight, aspect) {
  assertPositiveFinite(nativeWidth, 'nativeWidth');
  assertPositiveFinite(nativeHeight, 'nativeHeight');
  assertPositiveFinite(aspect, 'aspect');
  const nativeAspect = nativeWidth / nativeHeight;
  if (nativeAspect > aspect) {
    const sw = nativeHeight * aspect;
    return { sx: (nativeWidth - sw) / 2, sy: 0, sw, sh: nativeHeight };
  }
  const sh = nativeWidth / aspect;
  return { sx: 0, sy: (nativeHeight - sh) / 2, sw: nativeWidth, sh };
}

export function frameGeometry(aspect, longEdge) {
  assertPositiveFinite(aspect, 'aspect');
  if (!Number.isInteger(longEdge) || longEdge <= 0) throw new RangeError('longEdge must be a positive integer');
  const width = aspect >= 1 ? longEdge : Math.max(1, Math.round(longEdge * aspect));
  const height = aspect >= 1 ? Math.max(1, Math.round(longEdge / aspect)) : longEdge;
  return { width, height };
}

export function fitFrame(frameWidth, frameHeight, viewportWidth, viewportHeight) {
  assertPositiveFinite(frameWidth, 'frameWidth');
  assertPositiveFinite(frameHeight, 'frameHeight');
  assertPositiveFinite(viewportWidth, 'viewportWidth');
  assertPositiveFinite(viewportHeight, 'viewportHeight');
  const scale = Math.min(viewportWidth / frameWidth, viewportHeight / frameHeight);
  const width = frameWidth * scale, height = frameHeight * scale;
  return { width, height, left: (viewportWidth - width) / 2, top: (viewportHeight - height) / 2 };
}
