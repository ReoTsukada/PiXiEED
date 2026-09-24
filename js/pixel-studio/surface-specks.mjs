const MAX_CELLS = 512 * 512;
const NEIGHBORS = [
  [-1, -1], [0, -1], [1, -1], [1, 0],
  [1, 1], [0, 1], [-1, 1], [-1, 0]
];
const OPPOSITE = [[0, 4], [1, 5], [2, 6], [3, 7]];

const maxRgbDelta = (rgb, a, b) => Math.max(
  Math.abs(rgb[a] - rgb[b]), Math.abs(rgb[a + 1] - rgb[b + 1]), Math.abs(rgb[a + 2] - rgb[b + 2])
);
const light = (rgb, p) => 0.2126 * rgb[p] + 0.7152 * rgb[p + 1] + 0.0722 * rgb[p + 2];

function validate({ rgb, coverageRgb, counts, objects, protectedCells, width, height }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > 512 || height > 512 || width * height > MAX_CELLS) {
    throw new RangeError('width and height must form a grid from 1 to 512x512');
  }
  const count = width * height;
  if (!(rgb instanceof Uint8Array) || rgb.length !== count * 3) throw new TypeError('rgb must contain one RGB triplet per cell');
  if (!(coverageRgb instanceof Uint8Array || coverageRgb instanceof Float32Array) || coverageRgb.length !== count * 3) {
    throw new TypeError('coverageRgb must contain one RGB average per cell');
  }
  if (!(counts instanceof Uint32Array) || counts.length !== count) throw new TypeError('counts must contain one source count per cell');
  if (!(objects instanceof Uint32Array) || objects.length !== count) throw new TypeError('objects must contain one owner ID per cell');
  if (protectedCells != null && (!(protectedCells instanceof Uint8Array) || protectedCells.length !== count)) {
    throw new TypeError('protectedCells must match width * height');
  }
  if (protectedCells) for (let cell = 0; cell < count; cell++) {
    if (protectedCells[cell] !== 0 && protectedCells[cell] !== 1) throw new RangeError(`protectedCells value at ${cell} must be 0 or 1`);
  }
  for (let channel = 0; channel < coverageRgb.length; channel++) {
    const value = coverageRgb[channel];
    if (!Number.isFinite(value) || value < 0 || value > 255) throw new RangeError(`coverageRgb value at ${channel} must be within 0..255`);
  }
  return count;
}

function occupancyIsSparse(rgb, coverageRgb, cell, backgroundRgbOffset) {
  const center = cell * 3;
  const vr = rgb[center] - rgb[backgroundRgbOffset];
  const vg = rgb[center + 1] - rgb[backgroundRgbOffset + 1];
  const vb = rgb[center + 2] - rgb[backgroundRgbOffset + 2];
  const denominator = vr * vr + vg * vg + vb * vb;
  if (denominator <= 100) return false;

  const ar = coverageRgb[center] - rgb[backgroundRgbOffset];
  const ag = coverageRgb[center + 1] - rgb[backgroundRgbOffset + 1];
  const ab = coverageRgb[center + 2] - rgb[backgroundRgbOffset + 2];
  const projection = (ar * vr + ag * vg + ab * vb) / denominator;
  const residualR = ar - projection * vr, residualG = ag - projection * vg, residualB = ab - projection * vb;
  const residual = Math.sqrt(residualR * residualR + residualG * residualG + residualB * residualB);
  const fromBackground = ar * ar + ag * ag + ab * ab;
  const fromCenter = (coverageRgb[center] - rgb[center]) ** 2 +
    (coverageRgb[center + 1] - rgb[center + 1]) ** 2 + (coverageRgb[center + 2] - rgb[center + 2]) ** 2;
  return projection >= -0.08 && projection <= 0.25 && residual <= 12 && fromBackground < fromCenter;
}

/** Replace a weakly occupied isolated color with a real sample from its owner-local background. */
export function removeSurfaceSpecks({ rgb, coverageRgb, counts, objects, protectedCells = null, width, height } = {}) {
  validate({ rgb, coverageRgb, counts, objects, protectedCells, width, height });
  const output = new Uint8Array(rgb);
  const neighbors = new Int32Array(8), group = new Uint8Array(8), bestGroup = new Uint8Array(8), support = new Uint8Array(8);
  let removedCells = 0;

  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const cell = y * width + x, center = cell * 3;
    if (counts[cell] < 4 || protectedCells?.[cell] || Math.max(rgb[center], rgb[center + 1], rgb[center + 2]) >= 235 || light(rgb, center) >= 205) continue;
    if (Math.max(Math.abs(rgb[center] - coverageRgb[center]), Math.abs(rgb[center + 1] - coverageRgb[center + 1]),
      Math.abs(rgb[center + 2] - coverageRgb[center + 2])) < 8) continue;
    const object = objects[cell];
    let safe = true;
    for (let i = 0; i < 8; i++) {
      const [dx, dy] = NEIGHBORS[i], neighbor = (y + dy) * width + x + dx;
      neighbors[i] = neighbor;
      if (objects[neighbor] !== object || protectedCells?.[neighbor]) { safe = false; break; }
    }
    if (!safe) continue;

    let bestCount = 0;
    for (let seed = 0; seed < 8; seed++) {
      group.fill(0);
      let groupCount = 0, pairwise = true;
      for (let i = 0; i < 8; i++) {
        if (maxRgbDelta(rgb, neighbors[seed] * 3, neighbors[i] * 3) <= 14) { group[i] = 1; groupCount++; }
      }
      if (groupCount < 6) continue;
      for (let a = 0; a < 8 && pairwise; a++) if (group[a]) for (let b = a + 1; b < 8; b++) {
        if (group[b] && maxRgbDelta(rgb, neighbors[a] * 3, neighbors[b] * 3) > 14) { pairwise = false; break; }
      }
      if (!pairwise || groupCount <= bestCount) continue;
      bestCount = groupCount;
      bestGroup.set(group);
    }
    if (bestCount < 6) continue;

    let lineEvidence = false;
    // Same-color cells outside the background cluster form a possible stroke or fragment.
    support.fill(0);
    let supportCount = 0;
    for (let i = 0; i < 8; i++) if (!bestGroup[i] && maxRgbDelta(rgb, center, neighbors[i] * 3) <= 14) {
      support[i] = 1; supportCount++;
    }
    if (supportCount === 1) lineEvidence = true; // two-pixel strokes are ambiguous; preserve them
    else if (OPPOSITE.some(([a, b]) => support[a] && support[b])) lineEvidence = true;
    if (lineEvidence) continue;

    let sumR = 0, sumG = 0, sumB = 0, groupCells = 0;
    for (let i = 0; i < 8; i++) if (bestGroup[i]) {
      const offset = neighbors[i] * 3;
      sumR += rgb[offset]; sumG += rgb[offset + 1]; sumB += rgb[offset + 2]; groupCells++;
    }
    const meanR = sumR / groupCells, meanG = sumG / groupCells, meanB = sumB / groupCells;
    let background = -1, bestDistance = Infinity;
    for (let i = 0; i < 8; i++) if (bestGroup[i]) {
      const neighbor = neighbors[i], offset = neighbor * 3;
      const distance = (rgb[offset] - meanR) ** 2 + (rgb[offset + 1] - meanG) ** 2 + (rgb[offset + 2] - meanB) ** 2;
      if (distance < bestDistance) { background = neighbor; bestDistance = distance; }
    }
    if (background < 0 || maxRgbDelta(rgb, center, background * 3) <= 10 ||
        (light(rgb, center) > light(rgb, background * 3) && light(rgb, background * 3) < 86) ||
        !occupancyIsSparse(rgb, coverageRgb, cell, background * 3)) continue;

    output.set(rgb.subarray(background * 3, background * 3 + 3), center);
    removedCells++;
  }
  return { rgb: output, removedCells };
}
