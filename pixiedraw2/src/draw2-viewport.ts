export interface CanvasViewportProjection {
  readonly zoom: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface SourcePointZoomRequest {
  readonly nextZoom: number;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly rasterWidth: number;
  readonly rasterHeight: number;
  readonly presentationCenterX: number;
  readonly presentationCenterY: number;
  readonly anchorClientX: number;
  readonly anchorClientY: number;
  /** CSS display scale, including responsive fit scale, for the target zoom. */
  readonly displayScale?: number;
  /** Keep pinch movement continuous and snap only when the gesture settles. */
  readonly snap?: boolean;
}

export const MIN_VIEWPORT_ZOOM = 0.1;
export const MIN_SNAPPED_VIEWPORT_ZOOM = 0.25;
export const MAX_VIEWPORT_ZOOM = 32;
export const VIEWPORT_ZOOM_EPSILON = 0.0001;

/**
 * The canvas presentation uses small, deterministic steps rather than large
 * integer-only jumps. CSS transforms are still avoided; the stack gets a
 * rounded CSS display size and the raster keeps nearest-neighbor rendering.
 * This gives a smoother editor zoom while the canvas, guide, and SVG grid stay
 * on one measured display lattice.
 */
export const PIXEL_PERFECT_ZOOM_LEVELS = [
  0.25, 1 / 3, 0.5, 2 / 3, 0.75, 0.875,
  1, 1.125, 1.25, 1.375, 1.5, 1.625, 1.75, 1.875, 2,
  2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4,
  4.5, 5, 6, 7, 8, 10, 12, 16, 24, 32,
] as const;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function snapPixelPerfectZoom(value: number): number {
  const safeValue = Math.max(
    MIN_SNAPPED_VIEWPORT_ZOOM,
    Math.min(MAX_VIEWPORT_ZOOM, finite(value, 1)),
  );
  return PIXEL_PERFECT_ZOOM_LEVELS.reduce((closest, candidate) => (
    Math.abs(candidate - safeValue) < Math.abs(closest - safeValue) ? candidate : closest
  ), PIXEL_PERFECT_ZOOM_LEVELS[0]);
}

export function stepPixelPerfectZoom(currentZoom: number, direction: -1 | 1): number {
  const safeCurrent = Math.max(
    MIN_VIEWPORT_ZOOM,
    Math.min(MAX_VIEWPORT_ZOOM, finite(currentZoom, 1)),
  );
  if (direction > 0) {
    return PIXEL_PERFECT_ZOOM_LEVELS.find((candidate) => candidate > safeCurrent + VIEWPORT_ZOOM_EPSILON) ??
      PIXEL_PERFECT_ZOOM_LEVELS.at(-1) ?? safeCurrent;
  }
  for (let index = PIXEL_PERFECT_ZOOM_LEVELS.length - 1; index >= 0; index -= 1) {
    const candidate = PIXEL_PERFECT_ZOOM_LEVELS[index];
    if (candidate !== undefined && candidate < safeCurrent - VIEWPORT_ZOOM_EPSILON) {
      return candidate;
    }
  }
  return PIXEL_PERFECT_ZOOM_LEVELS[0] ?? safeCurrent;
}

/**
 * Resolves a two-finger scale using the same deterministic levels as the
 * desktop wheel/shortcut path. Sensitivity changes the physical pinch scale,
 * but never creates a non-canonical zoom level.
 */
export function pinchZoomFromDistance(
  startZoom: number,
  startDistance: number,
  currentDistance: number,
  sensitivity = 1,
  snap = true,
): number {
  const safeStartZoom = Math.max(
    MIN_VIEWPORT_ZOOM,
    Math.min(MAX_VIEWPORT_ZOOM, finite(startZoom, 1)),
  );
  const safeStartDistance = Math.max(1, finite(startDistance, 1));
  const safeCurrentDistance = Math.max(1, finite(currentDistance, safeStartDistance));
  const safeSensitivity = Math.max(0.25, Math.min(2, finite(sensitivity, 1)));
  const ratio = safeCurrentDistance / safeStartDistance;
  const continuousZoom = Math.max(
    MIN_VIEWPORT_ZOOM,
    Math.min(MAX_VIEWPORT_ZOOM, safeStartZoom * Math.pow(ratio, safeSensitivity)),
  );
  return snap ? snapPixelPerfectZoom(continuousZoom) : continuousZoom;
}

/**
 * Projects a zoom from the source pixel that is actually under the pointer.
 * Unlike a transform-origin approximation, this remains exact after pan,
 * resize, or a canvas whose centred display box has changed dimensions.
 */
export function zoomAtSourcePoint(request: SourcePointZoomRequest): CanvasViewportProjection {
  const rawZoom = Math.max(
    MIN_VIEWPORT_ZOOM,
    Math.min(MAX_VIEWPORT_ZOOM, finite(request.nextZoom, 1)),
  );
  const zoom = request.snap === false ? rawZoom : snapPixelPerfectZoom(rawZoom);
  const width = Math.max(1, finite(request.rasterWidth, 1));
  const height = Math.max(1, finite(request.rasterHeight, 1));
  const sourceX = Math.max(0, Math.min(width, finite(request.sourceX, width / 2)));
  const sourceY = Math.max(0, Math.min(height, finite(request.sourceY, height / 2)));
  const presentationCenterX = finite(request.presentationCenterX, 0);
  const presentationCenterY = finite(request.presentationCenterY, 0);
  const displayScale = Math.max(
    0.01,
    finite(request.displayScale ?? zoom, zoom),
  );
  return {
    zoom,
    offsetX: finite(request.anchorClientX, presentationCenterX) - presentationCenterX - ((sourceX - (width / 2)) * displayScale),
    offsetY: finite(request.anchorClientY, presentationCenterY) - presentationCenterY - ((sourceY - (height / 2)) * displayScale),
  };
}

export function isViewportAt100Percent(scale: number): boolean {
  return Math.abs(finite(scale, 1) - 1) < VIEWPORT_ZOOM_EPSILON;
}
