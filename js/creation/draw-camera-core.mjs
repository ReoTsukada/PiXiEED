/** Keep the whole artwork within 32 used colours, including remaining transparency. */
export function chooseCameraPalette(doc, mask, otherUsedIndices = []) {
  const required = new Set(otherUsedIndices);
  doc.pixels.forEach((value, index) => { if (mask && !mask[index]) required.add(value); });
  const capacity = required.has(-1) ? 31 : 32;
  const indices = [], colors = new Set();
  for (const value of [...required, ...new Set(doc.pixels), ...doc.palette.keys()]) {
    const color = doc.palette[value]?.toLowerCase();
    if (!color || !/^#[a-f\d]{6}(?:ff)?$/i.test(color) || colors.has(color.slice(0, 7))) continue;
    if (indices.length >= capacity) break;
    colors.add(color.slice(0, 7)); indices.push(value);
  }
  return indices;
}

/** Snapshot the selected cells so a camera session cannot drift with later selection changes. */
export function prepareCameraTarget(doc, mask, allowedIndices) {
  const { width, height } = doc;
  if (!Number.isInteger(width) || !Number.isInteger(height) || !Array.isArray(doc.pixels) || doc.pixels.length !== width * height) throw new TypeError('Invalid drawing');
  if (mask != null && (!(mask instanceof Uint8Array) || mask.length !== width * height)) throw new TypeError('Invalid selection mask');
  const cells = [];
  for (let i = 0; i < width * height; i += 1) if (!mask || mask[i]) cells.push(i);
  if (!cells.length) throw new TypeError('Select at least one cell');
  let left = width; let top = height; let right = -1; let bottom = -1;
  for (const i of cells) { const x = i % width; const y = Math.floor(i / width); left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  const bounds = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  const permitted = [...new Set(allowedIndices ?? doc.palette.map((_, i) => i))];
  if (!permitted.length || permitted.some((i) => !Number.isInteger(i) || i < 0 || i >= doc.palette.length)) throw new TypeError('Invalid palette selection');
  const document = { ...doc, pixels: [...doc.pixels], palette: [...doc.palette] };
  return Object.freeze({ document, width, height, bounds: Object.freeze(bounds), cells: Uint32Array.from(cells), palette: Object.freeze([...doc.palette]), allowedIndices: Object.freeze(permitted), mask: mask ? new Uint8Array(mask) : null });
}

const rgb = (hex) => [1, 3, 5].map((n) => Number.parseInt(hex.slice(n, n + 2), 16));
/** Convert RGBA samples to signed palette slots, choosing only among allowed existing slots. */
export function cameraPixels(rgba, palette, allowedIndices, saturation = 1) {
  if (!rgba || rgba.length % 4 || !Array.isArray(palette) || !allowedIndices?.length) throw new TypeError('Invalid camera pixels');
  const choices = allowedIndices.map((i) => { if (!Number.isInteger(i) || i < 0 || i >= palette.length) throw new RangeError('Invalid palette slot'); const color = palette[i]; if (typeof color !== 'string' || !/^#[a-f\d]{6}(?:ff)?$/i.test(color)) throw new TypeError('Camera replacements require opaque palette colors'); return [i, rgb(color)]; });
  const out = new Int16Array(rgba.length / 4); const sat = Math.max(0, Math.min(2, Number(saturation) || 0));
  for (let p = 0; p < out.length; p += 1) {
    const o = p * 4;
    let best = choices[0][0]; let distance = Infinity;
    const gray = (rgba[o] * 0.299 + rgba[o + 1] * 0.587 + rgba[o + 2] * 0.114);
    const r = Math.max(0, Math.min(255, gray + (rgba[o] - gray) * sat));
    const g = Math.max(0, Math.min(255, gray + (rgba[o + 1] - gray) * sat));
    const b = Math.max(0, Math.min(255, gray + (rgba[o + 2] - gray) * sat));
    for (const [i, candidate] of choices) { const d = (r - candidate[0]) ** 2 + (g - candidate[1]) ** 2 + (b - candidate[2]) ** 2; if (d < distance) { best = i; distance = d; } }
    out[p] = best; // Every selected cell is replaced by an opaque existing palette color.
  }
  return out;
}

/** Return a new drawing with chosen selected cells replaced; holes and source remain untouched. */
export function replaceCameraPixels(doc, target, indices) {
  if (target.width !== doc.width || target.height !== doc.height || !indices || indices.length !== target.cells.length) throw new TypeError('Camera target no longer matches drawing');
  if (doc.palette.length !== target.palette.length || doc.palette.some((color, i) => color !== target.palette[i])) throw new TypeError('Camera palette no longer matches drawing');
  const pixels = [...doc.pixels];
  for (let n = 0; n < target.cells.length; n += 1) {
    const value = indices[n];
    if (!Number.isInteger(value) || !target.allowedIndices.includes(value) || !/^#[a-f\d]{6}(?:ff)?$/i.test(doc.palette[value] ?? '')) throw new RangeError('Invalid replacement color');
    pixels[target.cells[n]] = value;
  }
  return { ...doc, palette: [...doc.palette], pixels };
}
