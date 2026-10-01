/** Zoom a centered canvas while keeping the source point under an anchor fixed. */
export function zoomCanvasViewportAt(viewport, factor, startX, startY, currentX, currentY, centerX, centerY, { minScale = 1, maxScale = 4 } = {}) {
  const scale = Math.min(maxScale, Math.max(minScale, viewport.scale * factor));
  const sourceX = (startX - centerX - viewport.panX) / viewport.scale;
  const sourceY = (startY - centerY - viewport.panY) / viewport.scale;
  return {
    scale,
    panX: currentX - centerX - sourceX * scale,
    panY: currentY - centerY - sourceY * scale,
  };
}
