/**
 * Mirror-guide coordinates use raster-pixel space:
 * - an integer is the centre of a pixel cell;
 * - a half-integer is the boundary between two cells.
 *
 * This lets an odd-sized canvas keep its centre pixel as the symmetry axis
 * while still allowing the guide to land on the neighbouring grid boundary.
 */

function safeRasterSize(size: number): number {
  return Math.max(1, Math.round(Number.isFinite(size) ? size : 1));
}

export function mirrorGuideCenter(size: number): number {
  return (safeRasterSize(size) - 1) / 2;
}

export function clampMirrorGuideCoordinate(
  value: number,
  size: number,
): number {
  const safeSize = safeRasterSize(size);
  const fallback = mirrorGuideCenter(safeSize);
  const safeValue = Number.isFinite(value) ? value : fallback;
  return Math.max(-0.5, Math.min(safeSize - 0.5, safeValue));
}

/** Snap to either a pixel-cell centre or the boundary between two cells. */
export function snapMirrorGuideCoordinate(
  value: number,
  size: number,
): number {
  const clamped = clampMirrorGuideCoordinate(value, size);
  return clampMirrorGuideCoordinate(Math.round(clamped * 2) / 2, size);
}

/** Convert raster-pixel space to the SVG/canvas coordinate space [0, size]. */
export function mirrorGuideToCanvasCoordinate(
  value: number,
  size: number,
): number {
  const safeSize = safeRasterSize(size);
  return Math.max(
    0,
    Math.min(safeSize, clampMirrorGuideCoordinate(value, safeSize) + 0.5),
  );
}

/** Convert a canvas coordinate to raster-pixel space without snapping. */
export function canvasCoordinateToMirrorGuide(
  value: number,
  size: number,
): number {
  const safeSize = safeRasterSize(size);
  const safeValue = Number.isFinite(value) ? value : safeSize / 2;
  return clampMirrorGuideCoordinate(safeValue - 0.5, safeSize);
}

/** Map a diagonal guide offset [-1, 1] to a canvas coordinate [0, size]. */
export function diagonalMirrorGuideOffsetToCanvasCoordinate(
  offset: number,
  size: number,
): number {
  const safeSize = safeRasterSize(size);
  const safeOffset = Number.isFinite(offset)
    ? Math.max(-1, Math.min(1, offset))
    : 0;
  return ((safeOffset + 1) / 2) * safeSize;
}

/** Convert a canvas coordinate [0, size] back to a diagonal guide offset. */
export function canvasCoordinateToDiagonalMirrorGuideOffset(
  value: number,
  size: number,
): number {
  const safeSize = safeRasterSize(size);
  const safeValue = Number.isFinite(value)
    ? Math.max(0, Math.min(safeSize, value))
    : safeSize / 2;
  return (safeValue / safeSize) * 2 - 1;
}
