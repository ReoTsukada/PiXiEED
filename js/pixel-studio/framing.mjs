export const FRAME_RATIOS = Object.freeze([
  Object.freeze({ value: 'screen', label: '画面', ratio: null }),
  Object.freeze({ value: '1:1', label: '1:1', ratio: 1 }),
  Object.freeze({ value: '3:4', label: '3:4', ratio: 3 / 4 }),
  Object.freeze({ value: '9:16', label: '9:16', ratio: 9 / 16 }),
  Object.freeze({ value: '4:3', label: '4:3', ratio: 4 / 3 }),
  Object.freeze({ value: '16:9', label: '16:9', ratio: 16 / 9 })
]);

export const OUTPUT_SIZES = Object.freeze([64, 128, 256, 512]);

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
