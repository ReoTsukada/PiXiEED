import { drawSelectionMask, drawSelectionMaskBounds } from './draw-selection-operations.mjs?rev=20261007-color-selection-1';

// Capture modifiers at down so changing keys during a drag cannot reinterpret it.
export function selectionInputOperation(event) {
  // Alt keeps the existing body-move / free-angle control behavior.
  return event.ctrlKey || event.metaKey ? 'subtract' : event.shiftKey ? 'add' : 'replace';
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
