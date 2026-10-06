import { captureDrawSelection, cloneDrawSelection, projectDrawSelection } from './draw-selection-operations.mjs';
import { selectionFrameBounds, selectionDefaultPivot, selectionLocalPoint, selectionWorldPoint, rotateSelectionFrame } from './draw-selection-geometry.mjs';

/** One floating transaction belongs to one immutable cel/animation revision. */
export function createDrawSelectionTransform(document, bounds, { clipboard = null, owner = null } = {}) {
  const captured = clipboard || captureDrawSelection(document, bounds);
  if (!captured) return null;
  const clip = cloneDrawSelection(captured);
  const base = { ...document, pixels: [...document.pixels], palette: [...document.palette] };
  const sourceBounds = clipboard ? null : { ...bounds };
  const originalBounds = bounds && { ...bounds };
  let transform = { x: bounds?.x ?? clip.origin.x, y: bounds?.y ?? clip.origin.y, width: clip.width, height: clip.height, angle: 0, flipX: false, flipY: false };
  transform.pivot = bounds?.pivot ? { ...bounds.pivot } : selectionDefaultPivot(transform);
  return {
    owner, originalBounds,
    get rect() { return selectionFrameBounds(transform); },
    get state() { return { ...transform, pivot: { ...transform.pivot }, rotationOffset: transform.rotationOffset && { ...transform.rotationOffset } }; },
    get aspectRatio() { return clip.width / clip.height; },
    update(rect) {
      const next = { ...transform, ...rect };
      // Moving the frame transports its pivot. Full checkpoints already own a pivot.
      next.pivot = rect.pivot ? { ...rect.pivot } : { x: transform.pivot.x + (next.x - transform.x), y: transform.pivot.y + (next.y - transform.y) };
      if (!Object.hasOwn(rect, 'rotationOffset')) next.rotationOffset = undefined;
      transform = next;
    },
    setPivot(pivot) { transform = { ...transform, pivot: { ...pivot }, rotationOffset: undefined }; },
    resize(size) {
      const local = selectionLocalPoint(transform, transform.pivot), next = { ...transform, ...size, rotationOffset: undefined };
      next.pivot = selectionWorldPoint(next, local.x * next.width / transform.width, local.y * next.height / transform.height);
      transform = next;
    },
    setAngle(angle) { transform = rotateSelectionFrame(transform, angle); },
    rotate(delta) { transform = rotateSelectionFrame(transform, transform.angle + delta * 90); },
    flip(axis) { const key = axis === 'x' ? 'flipX' : 'flipY'; transform = { ...transform, [key]: !transform[key] }; },
    project(options) { return projectDrawSelection(base, clip, transform, { ...options, sourceBounds }); }
  };
}
