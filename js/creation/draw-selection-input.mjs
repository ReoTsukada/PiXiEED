import { drawSelectionMask, drawSelectionMaskBounds } from './draw-selection-operations.mjs?rev=20261007-color-selection-1';

// Capture modifiers at down so changing keys during a drag cannot reinterpret it.
export function selectionInputOperation(event) {
  // Alt keeps the existing body-move / free-angle control behavior.
  return event.ctrlKey || event.metaKey ? 'subtract' : event.shiftKey ? 'add' : 'replace';
}

/** Lasso stays the drag mode while a transform preview is pending; transforms
 * are finalized on release, after tap/outside classification has run. */
export function selectionGestureKind({ selectionMode, operation, handle = null, altKey = false }) {
  if (!handle && selectionMode === 'lasso' && !altKey) return 'lasso';
  if (!handle && operation !== 'replace') return 'modify';
  return 'standard';
}

/** Combine detached full-canvas masks, including transparent selected cells. */
export function combineDrawInputSelection(base, incoming, operation, width, height) {
  if (operation === 'replace') return incoming;
  const a = base ? drawSelectionMask(base, width, height) : new Uint8Array(width * height);
  const b = incoming ? drawSelectionMask(incoming, width, height) : new Uint8Array(width * height);
  const mask = Uint8Array.from(a, (value, i) => operation === 'subtract' ? Number(Boolean(value && !b[i])) : Number(Boolean(value || b[i])));
  const bounds = drawSelectionMaskBounds(mask, width, height);
  return bounds ? { ...bounds, mask } : null;
}

/** Lasso commit uses the current pixel mask as its base, never its AABB. */
export function combineDrawLassoSelection(base, points, operation, width, height, fallback = null) {
  const incoming = lassoDrawSelection(points, width, height) || fallback;
  return combineDrawInputSelection(base, incoming, operation, width, height);
}

/** Rasterize a closed lasso at pixel centers. The returned mask includes
 * transparent cells and is clipped to the canvas, just like a rectangle. */
export function lassoDrawSelection(points, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 512 || height > 512) {
    throw new RangeError('選択マスクの寸法が不正です。');
  }
  if (!Array.isArray(points) || points.length < 3 || points.some(point => !Number.isFinite(point?.x) || !Number.isFinite(point?.y))) return null;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (const point of points) { minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); }
  const left = Math.max(0, Math.floor(minX)), top = Math.max(0, Math.floor(minY));
  const right = Math.min(width - 1, Math.ceil(maxX) - 1), bottom = Math.min(height - 1, Math.ceil(maxY) - 1);
  if (right < left || bottom < top) return null;
  const mask = new Uint8Array(width * height);
  const writeSpan = (y, start, end) => {
    const first = Math.max(left, Math.ceil(Math.min(start, end) - .5 - 1e-9));
    const last = Math.min(right, Math.floor(Math.max(start, end) - .5 + 1e-9));
    for (let x = first; x <= last; x++) mask[y * width + x] = 1;
  };
  // Scanline intersections keep complex freehand paths bounded by O(points × height + area).
  for (let y = top; y <= bottom; y++) {
    const py = y + .5, crossings = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[j], b = points[i];
      if (a.y === b.y) { if (Math.abs(py - a.y) < 1e-9) writeSpan(y, a.x, b.x); continue; }
      if ((a.y > py) !== (b.y > py)) crossings.push(a.x + (py - a.y) * (b.x - a.x) / (b.y - a.y));
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) writeSpan(y, crossings[i], crossings[i + 1]);
  }
  const bounds = drawSelectionMaskBounds(mask, width, height);
  return bounds ? { ...bounds, mask } : null;
}
