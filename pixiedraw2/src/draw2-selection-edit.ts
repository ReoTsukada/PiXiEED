/**
 * DOM-free selection editing helpers used by the Draw2 input adapter.
 * Selection changes are projections; only the explicit Commit action assigns
 * the resulting snapshot to the active local selection.
 */

import type { PixelPoint } from "./draw2-core.ts";

export type SelectionEditMode = "REPLACE" | "ADD" | "SUBTRACT" | "INTERSECT";

export function selectionPointKey(point: PixelPoint): string {
  return `${point.x}:${point.y}`;
}

export interface SelectionRegionLike {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Selection tools grab by the visible selection bounds, not only by an
 * opaque pixel. This keeps lasso/alpha selections draggable from a transparent
 * hole inside their bounding rectangle, as in pixel editors.
 */
export function pointInSelectionBounds(
  point: PixelPoint,
  regions: readonly SelectionRegionLike[],
): boolean {
  return regions.some((region) =>
    point.x >= region.x && point.y >= region.y &&
    point.x < region.x + region.width &&
    point.y < region.y + region.height
  );
}

function uniquePoints(points: readonly PixelPoint[]): readonly PixelPoint[] {
  const unique = new Map<string, PixelPoint>();
  for (const point of points) unique.set(selectionPointKey(point), { x: point.x, y: point.y });
  return [...unique.values()].sort((left, right) => left.y - right.y || left.x - right.x);
}

/** Applies Aseprite/PiXiEEDraw-style selection composition deterministically. */
export function combineSelectionPoints(
  current: readonly PixelPoint[],
  incoming: readonly PixelPoint[],
  mode: SelectionEditMode,
): readonly PixelPoint[] {
  const currentUnique = uniquePoints(current);
  const incomingUnique = uniquePoints(incoming);
  const currentKeys = new Set(currentUnique.map(selectionPointKey));
  const incomingKeys = new Set(incomingUnique.map(selectionPointKey));
  if (mode === "REPLACE") return incomingUnique;
  if (mode === "ADD") return uniquePoints([...currentUnique, ...incomingUnique]);
  if (mode === "SUBTRACT") return currentUnique.filter((point) => !incomingKeys.has(selectionPointKey(point)));
  return currentUnique.filter((point) => incomingKeys.has(selectionPointKey(point)));
}

/** Keyboard modifiers are temporary overrides; the selector remains the persistent mode. */
export function selectionEditModeFromModifiers(
  shiftKey: boolean,
  altKey: boolean,
  fallback: SelectionEditMode,
): SelectionEditMode {
  if (shiftKey && altKey) return "INTERSECT";
  if (shiftKey) return "ADD";
  if (altKey) return "SUBTRACT";
  return fallback;
}
