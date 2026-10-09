import { canvasResizeOffset } from './animation-core.mjs';
import { drawSelectionMask, drawSelectionMaskBounds } from './draw-selection-operations.mjs';

/** Resize transient editor coordinates using the same sampling as the pixel operation.
 * Membership is independent of transparency; never replace a sparse selection by its box.
 */
export function resizeDrawView(view, oldWidth, oldHeight, width, height, { resample = null } = {}) {
  const nearest = resample === 'nearest';
  const offset = nearest ? { x: 0, y: 0 } : canvasResizeOffset(oldWidth, oldHeight, width, height, 'center');
  const point = p => p && (nearest ? { x: p.x * width / oldWidth, y: p.y * height / oldHeight }
    : { x: p.x + offset.x, y: p.y + offset.y });
  let selection = null;
  if (view.selection) {
    const source = drawSelectionMask(view.selection, oldWidth, oldHeight), mask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const sx = nearest ? Math.min(oldWidth - 1, Math.floor((x + .5) * oldWidth / width)) : x - offset.x;
      const sy = nearest ? Math.min(oldHeight - 1, Math.floor((y + .5) * oldHeight / height)) : y - offset.y;
      if (sx >= 0 && sy >= 0 && sx < oldWidth && sy < oldHeight) mask[y * width + x] = source[sy * oldWidth + sx];
    }
    const bounds = drawSelectionMaskBounds(mask, width, height);
    if (bounds) selection = { ...view.selection, ...bounds, mask, ...(view.selection.pivot ? { pivot: point(view.selection.pivot) } : {}) };
  }
  const origin = point({ x: view.mirrorOrigin.x * oldWidth, y: view.mirrorOrigin.y * oldHeight });
  return { mirrorOrigin: { x: Math.max(0, Math.min(1, origin.x / width)), y: Math.max(0, Math.min(1, origin.y / height)) },
    selection, zoom: 1, panX: 0, panY: 0, cursor: point(view.cursor) };
}
