const tidy = n => Math.round(n * 1e10) / 1e10;
export const normalizeSelectionAngle = angle => tidy(((angle % 360) + 360) % 360);
export function selectionAxes(angle = 0) {
  const a = normalizeSelectionAngle(angle);
  if (a % 90 === 0) return [{ c: 1, s: 0 }, { c: 0, s: 1 }, { c: -1, s: 0 }, { c: 0, s: -1 }][a / 90];
  return { c: Math.cos(a * Math.PI / 180), s: Math.sin(a * Math.PI / 180) };
}
export function selectionWorldPoint(frame, x, y) {
  const { c, s } = selectionAxes(frame.angle);
  return { x: tidy(frame.x + c * x - s * y), y: tidy(frame.y + s * x + c * y) };
}
export function selectionLocalPoint(frame, point) {
  const { c, s } = selectionAxes(frame.angle), x = point.x - frame.x, y = point.y - frame.y;
  return { x: tidy(c * x + s * y), y: tidy(-s * x + c * y) };
}
export function selectionFrameCorners(frame) {
  return Object.fromEntries([['nw', 0, 0], ['ne', frame.width, 0], ['sw', 0, frame.height], ['se', frame.width, frame.height]].map(([name, x, y]) => [name, selectionWorldPoint(frame, x, y)]));
}
export function selectionFrameBounds(frame) {
  const points = Object.values(selectionFrameCorners(frame));
  const x = Math.floor(Math.min(...points.map(p => p.x))), y = Math.floor(Math.min(...points.map(p => p.y)));
  return { x, y, width: Math.ceil(Math.max(...points.map(p => p.x))) - x, height: Math.ceil(Math.max(...points.map(p => p.y))) - y };
}
export const selectionDefaultPivot = frame => ({ x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 });
export function selectionContains(frame, point) {
  const p = selectionLocalPoint(frame, point);
  return p.x >= 0 && p.y >= 0 && p.x < frame.width && p.y < frame.height;
}
/** A narrow automatic snap; Shift requests exact quarter turns, Alt bypasses snapping. */
export function snapSelectionAngle(angle, { shiftKey = false, altKey = false } = {}) {
  const quarter = Math.round(angle / 90) * 90;
  return normalizeSelectionAngle(!altKey && (shiftKey || Math.abs(angle - quarter) <= 3) ? quarter : angle);
}
/** Origin is independent of pivot: changing the pivot alone never changes the mapping. */
export function rotateSelectionFrame(frame, angle) {
  const pivot = frame.pivot || selectionDefaultPivot(frame), previous = selectionAxes(frame.angle), { c, s } = selectionAxes(angle);
  const x = frame.x - pivot.x, y = frame.y - pivot.y;
  const offset = frame.rotationOffset || { x: previous.c * x + previous.s * y, y: -previous.s * x + previous.c * y };
  return { ...frame, x: tidy(pivot.x + c * offset.x - s * offset.y), y: tidy(pivot.y + s * offset.x + c * offset.y), angle: normalizeSelectionAngle(angle), pivot: { ...pivot }, rotationOffset: { ...offset } };
}
/** Resize in the rotated local axes, fixing the diagonally opposite world corner. */
export function resizeRotatedDrawSelection(frame, handle, dx, dy, fixedRatio = true, aspectRatio = frame.width / frame.height) {
  const { c, s } = selectionAxes(frame.angle), west = handle.includes('w'), north = handle.includes('n');
  const ux = c * dx + s * dy, uy = -s * dx + c * dy;
  let width = Math.max(1, Math.min(256, frame.width + (west ? -ux : ux)));
  let height = Math.max(1, Math.min(256, frame.height + (north ? -uy : uy)));
  if (fixedRatio) {
    if (Math.abs(width / frame.width - 1) >= Math.abs(height / frame.height - 1)) height = width / aspectRatio;
    else width = height * aspectRatio;
    const factor = Math.min(1, 256 / Math.max(width, height));
    width = Math.max(1, Math.round(width * factor)); height = Math.max(1, Math.round(height * factor));
  } else { width = Math.round(width); height = Math.round(height); }
  const anchor = selectionWorldPoint(frame, west ? frame.width : 0, north ? frame.height : 0);
  const x = tidy(anchor.x - c * (west ? width : 0) + s * (north ? height : 0));
  const y = tidy(anchor.y - s * (west ? width : 0) - c * (north ? height : 0));
  const oldPivot = selectionLocalPoint(frame, frame.pivot || selectionDefaultPivot(frame));
  const next = { ...frame, x, y, width, height };
  return { ...next, pivot: selectionWorldPoint(next, oldPivot.x * width / frame.width, oldPivot.y * height / frame.height), rotationOffset: undefined };
}

/** Nearest visible control wins; exact ties prefer corners. All distances are screen-sized. */
export function hitSelectionControls(point, controls, radiusX, radiusY) {
  let closest = null, distance = Infinity;
  for (const [name, p] of Object.entries(controls)) {
    const d = ((point.x - p.x) / radiusX) ** 2 + ((point.y - p.y) / radiusY) ** 2;
    if (d <= 1 && d < distance) { closest = name; distance = d; }
  }
  return closest;
}

/** Similarity transform from one gesture checkpoint, around its independent pivot.
 * Pointer bearing is unwrapped by the caller; raster samples always come from the source. */
export function transformSelectionFromCorner(frame, start, point, { angleDelta = null, minRadius = 0, ...modifiers } = {}) {
  const pivot = frame.pivot || selectionDefaultPivot(frame);
  const a = { x: start.x - pivot.x, y: start.y - pivot.y }, b = { x: point.x - pivot.x, y: point.y - pivot.y };
  const radius = Math.hypot(a.x, a.y), distance = Math.hypot(b.x, b.y);
  if (![radius, distance].every(Number.isFinite) || radius <= Math.max(minRadius, 1e-8) || distance <= minRadius) return null;
  const delta = angleDelta ?? Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y) * 180 / Math.PI;
  const scale = Math.max(1 / Math.min(frame.width, frame.height), Math.min(256 / Math.max(frame.width, frame.height), distance / radius));
  const width = Math.max(1, Math.min(256, Math.round(frame.width * scale))), height = Math.max(1, Math.min(256, Math.round(frame.height * scale)));
  const angle = snapSelectionAngle(frame.angle + delta, modifiers), localPivot = selectionLocalPoint(frame, pivot), { c, s } = selectionAxes(angle);
  const u = localPivot.x * width / frame.width, v = localPivot.y * height / frame.height;
  return { ...frame, x: tidy(pivot.x - c * u + s * v), y: tidy(pivot.y - s * u - c * v), width, height, angle, pivot: { ...pivot }, rotationOffset: undefined };
}
export function unwrapSelectionBearing(previous, next) {
  return ((next - previous + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}
