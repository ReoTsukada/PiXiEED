/** Convert mouse wheels, trackpads, and line/page scrolling to a steady zoom step. */
export function wheelZoomFactor(deltaY, deltaMode = 0, areaHeight = 0) {
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? areaHeight : 1);
  return Math.min(1.2, Math.max(1 / 1.2, Math.exp(-pixels * 0.0015)));
}
