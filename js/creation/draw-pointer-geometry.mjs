/** Return finite integer endpoints for rasterizing only the part of a segment near a canvas. */
export function boundedPixelLine(from, to, width, height, { margin = 0, preserveDistance = 4 } = {}) {
  if (!from || !to || ![from.x, from.y, to.x, to.y, width, height, margin, preserveDistance].every(Number.isFinite)
      || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
      || !Number.isInteger(margin) || margin < 0) return null;
  const values = [from.x, from.y, to.x, to.y].map(Math.floor);
  if (!values.every(Number.isSafeInteger)) return null;
  const [x0, y0, x1, y1] = values;
  const limit = Math.max(width, height) * preserveDistance;
  if (values.every((value) => Math.abs(value) <= limit)) return { x0, y0, x1, y1 };
  // Clip against the canvas plus brush margin before Bresenham can walk a distant segment.
  const left = -margin - 1; const right = width + margin;
  const top = -margin - 1; const bottom = height + margin;
  const dx = x1 - x0; const dy = y1 - y0;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  let enter = 0; let leave = 1;
  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) { if (t > leave) return false; if (t > enter) enter = t; }
    else { if (t < enter) return false; if (t < leave) leave = t; }
    return true;
  };
  if (!clip(-dx, x0 - left) || !clip(dx, right - x0) || !clip(-dy, y0 - top) || !clip(dy, bottom - y0) || enter > leave) return null;
  const sx = (t) => Math.max(left, Math.min(right, Math.floor(x0 + dx * t)));
  const sy = (t) => Math.max(top, Math.min(bottom, Math.floor(y0 + dy * t)));
  const clipped = { x0: sx(enter), y0: sy(enter), x1: sx(leave), y1: sy(leave) };
  return clipped;
}
