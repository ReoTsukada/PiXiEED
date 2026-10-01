/** Shared pixel coordinates and connected strokes for drawing and music modes. */
export function rawPixelCellAt(event, rect, width, height) {
  if (!(rect?.width > 0 && rect?.height > 0)) return { x: -1, y: -1 };
  return { x: Math.floor((event.clientX - rect.left) * width / rect.width), y: Math.floor((event.clientY - rect.top) * height / rect.height) };
}
export function pixelCellAt(event, rect, width, height) {
  const cell = rawPixelCellAt(event, rect, width, height);
  return Number.isFinite(cell.x) && Number.isFinite(cell.y) && cell.x >= 0 && cell.y >= 0 && cell.x < width && cell.y < height ? cell : null;
}
export function* pixelLineCells(from, to) {
  let x = Math.floor(from.x); let y = Math.floor(from.y);
  const endX = Math.floor(to.x); const endY = Math.floor(to.y);
  if (![x, y, endX, endY].every(Number.isSafeInteger)) return;
  const dx = Math.abs(endX - x); const sx = x < endX ? 1 : -1;
  const dy = -Math.abs(endY - y); const sy = y < endY ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    yield { x, y };
    if (x === endX && y === endY) break;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
}
