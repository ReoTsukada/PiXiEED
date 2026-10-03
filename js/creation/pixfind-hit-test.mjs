import { regionContainsPoint } from './pixfind-regions.mjs';

export const PIXFIND_HIT_TOLERANCE_CSS_PX = Object.freeze({ mouse: 6, touch: 12, pen: 8 });

function regionDistanceCss(region, x, y, width, scale, maxDistanceCssPx) {
  const boxDx = x < region.minX ? region.minX - x : x > region.maxX + 1 ? x - (region.maxX + 1) : 0;
  const boxDy = y < region.minY ? region.minY - y : y > region.maxY + 1 ? y - (region.maxY + 1) : 0;
  if (Math.hypot(boxDx, boxDy) * scale > maxDistanceCssPx) return Infinity;
  let distance2 = Infinity;
  const visitPixel = (pixel) => {
    const px = pixel % width;
    const py = Math.floor(pixel / width);
    const dx = x < px ? px - x : x > px + 1 ? x - (px + 1) : 0;
    const dy = y < py ? py - y : y > py + 1 ? y - (py + 1) : 0;
    distance2 = Math.min(distance2, dx * dx + dy * dy);
  };
  if (region.pixels?.length) {
    for (const pixel of region.pixels) {
      visitPixel(pixel);
      if (!distance2) break;
    }
  } else if (region.mask && region.maskWidth > 0 && region.maskHeight > 0) {
    for (let my = 0; my < region.maskHeight; my += 1) for (let mx = 0; mx < region.maskWidth; mx += 1) {
      if (region.mask[my * region.maskWidth + mx]) visitPixel((region.minY + my) * width + region.minX + mx);
    }
  }
  return Math.sqrt(distance2) * scale;
}

/** Selects a target without expanding its authored mask or accepting ambiguous near taps. */
export function selectPixfindHit(regions, x, y, {
  width,
  height,
  scale,
  pointerType = 'mouse',
  found = new Set(),
  toleranceCssPx = PIXFIND_HIT_TOLERANCE_CSS_PX[pointerType] ?? PIXFIND_HIT_TOLERANCE_CSS_PX.mouse,
  useTolerance = true,
} = {}) {
  if (!Array.isArray(regions) || !Number.isInteger(width) || !Number.isInteger(height)
      || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= width || y >= height) {
    return { type: 'outside', index: -1 };
  }
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(toleranceCssPx) || toleranceCssPx < 0) {
    return { type: 'miss', index: -1 };
  }

  const exact = [];
  for (let index = 0; index < regions.length; index += 1) {
    if (regionContainsPoint(regions[index], x, y, 0)) exact.push(index);
  }
  if (exact.length === 1) return { type: found.has(exact[0]) ? 'found' : 'hit', index: exact[0] };
  if (exact.length > 1) return { type: 'ambiguous', index: -1 };
  if (!useTolerance || toleranceCssPx === 0) return { type: 'miss', index: -1 };

  const candidates = [];
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index]; const px = Math.floor(x); const py = Math.floor(y);
    if (px >= region.minX && px <= region.maxX && py >= region.minY && py <= region.maxY
        && !region.mask?.[(py - region.minY) * region.maskWidth + px - region.minX]) continue;
    const distanceCssPx = regionDistanceCss(region, x, y, width, scale, toleranceCssPx);
    if (distanceCssPx <= toleranceCssPx) candidates.push({ index, distanceCssPx });
  }
  if (!candidates.length) return { type: 'miss', index: -1 };
  candidates.sort((a, b) => a.distanceCssPx - b.distanceCssPx || a.index - b.index);
  if (candidates.length > 1 && Math.abs(candidates[1].distanceCssPx - candidates[0].distanceCssPx) < 0.5) {
    return { type: 'ambiguous', index: -1 };
  }
  const { index } = candidates[0];
  return { type: found.has(index) ? 'found' : 'hit', index };
}
