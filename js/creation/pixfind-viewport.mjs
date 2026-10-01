/** Shared image viewport math for spot-difference and hidden-object players. */
export { wheelZoomFactor as pixfindWheelZoomFactor } from './viewport-wheel.mjs';
export const PIXFIND_MIN_ZOOM = 1;
export const PIXFIND_MAX_ZOOM = 8;

export function clampPixfindViewport(viewport, imageWidth, imageHeight, baseScale, areas, visible = 32) {
  const zoom = Math.min(PIXFIND_MAX_ZOOM, Math.max(PIXFIND_MIN_ZOOM, Number(viewport?.zoom) || 1));
  let { x = 0, y = 0 } = viewport || {};
  const width = imageWidth * baseScale * zoom;
  const height = imageHeight * baseScale * zoom;
  for (const area of areas || []) {
    if (!area?.width || !area?.height) continue;
    // An enlarged image can still be narrower than the panel. Forcing its pan
    // to zero in that interval breaks cursor-anchored zoom near the edges.
    const minX = zoom <= PIXFIND_MIN_ZOOM ? 0 : visible - area.width / 2 - width / 2;
    const maxX = zoom <= PIXFIND_MIN_ZOOM ? 0 : area.width / 2 + width / 2 - visible;
    const minY = zoom <= PIXFIND_MIN_ZOOM ? 0 : visible - area.height / 2 - height / 2;
    const maxY = zoom <= PIXFIND_MIN_ZOOM ? 0 : area.height / 2 + height / 2 - visible;
    x = Math.min(maxX, Math.max(minX, x));
    y = Math.min(maxY, Math.max(minY, y));
  }
  return { zoom, x, y };
}

export function pixfindViewportGeometry({ width, height, areaWidth, areaHeight, baseScale, viewport = { zoom: 1, x: 0, y: 0 } }) {
  const scale = baseScale * viewport.zoom;
  return {
    scale,
    xoff: (areaWidth - width * baseScale) / 2 + viewport.x - (width * baseScale * (viewport.zoom - 1)) / 2,
    yoff: (areaHeight - height * baseScale) / 2 + viewport.y - (height * baseScale * (viewport.zoom - 1)) / 2,
    width: width * scale,
    height: height * scale,
  };
}

export function zoomPixfindViewport(viewport, factor, anchorX, anchorY, centerX, centerY, baseScale) {
  const zoom = Math.min(PIXFIND_MAX_ZOOM, Math.max(PIXFIND_MIN_ZOOM, viewport.zoom * factor));
  const sourceX = (anchorX - centerX - viewport.x) / (baseScale * viewport.zoom);
  const sourceY = (anchorY - centerY - viewport.y) / (baseScale * viewport.zoom);
  return {
    zoom,
    x: anchorX - centerX - sourceX * baseScale * zoom,
    y: anchorY - centerY - sourceY * baseScale * zoom,
  };
}

/** Keep the source point between two fingers under their moving midpoint. */
export function pinchPixfindViewport(viewport, factor, startX, startY, currentX, currentY, centerX, centerY, baseScale) {
  const zoom = Math.min(PIXFIND_MAX_ZOOM, Math.max(PIXFIND_MIN_ZOOM, viewport.zoom * factor));
  const sourceX = (startX - centerX - viewport.x) / (baseScale * viewport.zoom);
  const sourceY = (startY - centerY - viewport.y) / (baseScale * viewport.zoom);
  return {
    zoom,
    x: currentX - centerX - sourceX * baseScale * zoom,
    y: currentY - centerY - sourceY * baseScale * zoom,
  };
}

export function mapPixfindPoint(clientX, clientY, rect, geometry) {
  return {
    x: (clientX - rect.left - geometry.xoff) / geometry.scale,
    y: (clientY - rect.top - geometry.yoff) / geometry.scale,
  };
}
