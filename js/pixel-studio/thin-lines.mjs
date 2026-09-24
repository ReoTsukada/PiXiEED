import { fitDigitalLine } from './digital-line.mjs';

const NORMALS = [[1, 0], [0, 1], [1, 1], [1, -1]];
const SIDE_DIRECTIONS = [-1, 1];
const MAX_CELLS = 512 * 512;
const light = (rgb, p) => 0.2126 * rgb[p] + 0.7152 * rgb[p + 1] + 0.0722 * rgb[p + 2];
const delta = (rgb, a, b) => Math.max(Math.abs(rgb[a] - rgb[b]), Math.abs(rgb[a + 1] - rgb[b + 1]), Math.abs(rgb[a + 2] - rgb[b + 2]));

/** Straight surface strokes only: no object-boundary edits and no fringe pixels. */
export function refineThinLineSamples({ rgb, coverageRgb = rgb, objects, protectedCells = null, width, height, previous = null }) {
  const count = width * height;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 512 || height > 512 || count > MAX_CELLS) throw new RangeError('invalid thin-line grid');
  if (!(rgb instanceof Uint8Array) || rgb.length !== count * 3 || !(objects instanceof Uint32Array) || objects.length !== count) throw new TypeError('thin-line RGB and objects must match the grid');
  if (!(coverageRgb instanceof Uint8Array || coverageRgb instanceof Float32Array) || coverageRgb.length !== rgb.length) throw new TypeError('coverage RGB must match the grid');
  if (protectedCells !== null && (!(protectedCells instanceof Uint8Array) || protectedCells.length !== count)) throw new TypeError('protected cells must match the grid');
  const currentRgb = rgb;
  const analyzedRgb = new Uint8Array(rgb), analyzedCoverage = new Float32Array(coverageRgb);
  if (previous?.width === width && previous?.height === height && previous?.coverageRgb?.length === rgb.length) {
    const changed = new Uint8Array(count), released = new Uint8Array(count);
    for (let cell = 0; cell < count; cell++) {
      const p = cell * 3;
      changed[cell] = objects[cell] !== previous.objects[cell] ||
        Math.abs(rgb[p] - previous.rgb[p]) > 4 || Math.abs(coverageRgb[p] - previous.coverageRgb[p]) > 4 ||
        Math.abs(rgb[p + 1] - previous.rgb[p + 1]) > 4 || Math.abs(coverageRgb[p + 1] - previous.coverageRgb[p + 1]) > 4 ||
        Math.abs(rgb[p + 2] - previous.rgb[p + 2]) > 4 || Math.abs(coverageRgb[p + 2] - previous.coverageRgb[p + 2]) > 4 ? 1 : 0;
    }
    for (let cell = 0; cell < count; cell++) if (changed[cell]) {
      const x = cell % width, y = Math.floor(cell / width);
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
        if (x + ox >= 0 && x + ox < width && y + oy >= 0 && y + oy < height) released[(y + oy) * width + x + ox] = 1;
      }
    }
    for (let cell = 0; cell < count; cell++) if (!released[cell]) for (let c = 0; c < 3; c++) {
      analyzedRgb[cell * 3 + c] = previous.rgb[cell * 3 + c];
      analyzedCoverage[cell * 3 + c] = previous.coverageRgb[cell * 3 + c];
    }
  }
  // Anchor line analysis, never the untouched surface RGB. Slow real changes
  // accumulate against the anchor; a changed neighborhood releases it at once.
  rgb = analyzedRgb; coverageRgb = analyzedCoverage;
  const candidates = new Int8Array(count), backgrounds = new Int32Array(count);
  const luminance = new Float32Array(count);
  for (let cell = 0; cell < count; cell++) luminance[cell] = light(rgb, cell * 3);
  let candidateCells = 0;
  for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
    const cell = y * width + x;
    if (protectedCells?.[cell]) continue;
    const center = luminance[cell], object = objects[cell];
    let best = 0;
    for (const [dx, dy] of NORMALS) {
      let firstSide = -1, secondSide = -1, sign = 0, sideIndex = 0;
      for (const direction of SIDE_DIRECTIONS) {
        let side = -1;
        for (let step = 1; step <= 2; step++) {
          const n = (y + dy * step * direction) * width + x + dx * step * direction;
          if (objects[n] !== object || protectedCells?.[n]) break;
          const difference = center - luminance[n];
          if (Math.abs(difference) < 10) continue;
          const nextSign = difference < 0 ? -1 : 1;
          if (sign && sign !== nextSign) break;
          sign = nextSign; side = n; break;
        }
        if (side < 0) { firstSide = -1; secondSide = -1; break; }
        if (sideIndex++ === 0) firstSide = side;
        else secondSide = side;
      }
      if (firstSide < 0 || secondSide < 0 || delta(rgb, firstSide * 3, secondSide * 3) > 24 || Math.abs(luminance[firstSide] - luminance[secondSide]) > 14) continue;
      const contrast = Math.min(Math.abs(center - luminance[firstSide]), Math.abs(center - luminance[secondSide]));
      if (contrast <= best) continue;
      best = contrast; candidates[cell] = sign;
      // An actual same-object side sample fills an old extra-width cell.
      backgrounds[cell] = Math.abs(center - luminance[firstSide]) <= Math.abs(center - luminance[secondSide]) ? firstSide : secondSide;
    }
    if (best) candidateCells++;
  }

  const visited = new Uint8Array(count), lineCells = new Uint8Array(count), changedCells = new Uint8Array(count);
  const output = new Uint8Array(currentRgb), queue = new Int32Array(count);
  const lineHistory = new Map();
  const canHold = previous?.width === width && previous?.height === height && previous?.lines instanceof Map;
  let lineCount = 0, softenedLines = 0, regularizedCells = 0;
  for (let start = 0; start < count; start++) {
    if (!candidates[start] || visited[start]) continue;
    let read = 0, write = 1; queue[0] = start; visited[start] = 1;
    const cells = [];
    while (read < write) {
      const cell = queue[read++]; cells.push(cell);
      const x = cell % width, y = Math.floor(cell / width);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if ((!ox && !oy) || x + ox < 0 || x + ox >= width || y + oy < 0 || y + oy >= height) continue;
        const n = (y + oy) * width + x + ox;
        if (!visited[n] && candidates[n] === candidates[start] && objects[n] === objects[start]) {
          visited[n] = 1; queue[write++] = n;
        }
      }
    }
    if (cells.length < 6 || cells.length > 2048) continue;
    const fit = fitDigitalLine(cells, width, height);
    if (!fit) continue;
    const members = new Set(cells), pathSet = new Set(fit.path);
    const horizontal = Math.abs(fit.path[fit.path.length - 1] % width - fit.path[0] % width) >= Math.abs(Math.floor(fit.path[fit.path.length - 1] / width) - Math.floor(fit.path[0] / width));
    const coordinate = cell => horizontal ? cell % width : Math.floor(cell / width);
    const byCoordinate = new Map();
    for (const cell of cells) {
      const key = coordinate(cell), bucket = byCoordinate.get(key) ?? [];
      bucket.push(cell); byCoordinate.set(key, bucket);
    }
    const references = [];
    let safe = true;
    for (const cell of fit.path) {
      if (objects[cell] !== objects[start] || protectedCells?.[cell] || lineCells[cell]) { safe = false; break; }
      const key = coordinate(cell), nearby = [...(byCoordinate.get(key) ?? []), ...(byCoordinate.get(key - 1) ?? []), ...(byCoordinate.get(key + 1) ?? [])];
      let nearest = -1, distance = Infinity;
      for (const candidate of nearby) {
        const d = Math.abs(cell % width - candidate % width) + Math.abs(Math.floor(cell / width) - Math.floor(candidate / width));
        if (d < distance || (d === distance && candidate < nearest)) { distance = d; nearest = candidate; }
      }
      if (nearest < 0 || distance > 2 || (!members.has(cell) && delta(rgb, cell * 3, backgrounds[nearest] * 3) > 24)) { safe = false; break; }
      references.push(nearest);
    }
    if (!safe || cells.some(cell => lineCells[cell])) continue;

    // Estimate subpixel coverage from the original same-owner source footprint.
    // Quantize this scalar for the entire stroke; never paint a soft fringe.
    let coverage = 0;
    for (const cell of cells) {
      const p = cell * 3, b = backgrounds[cell] * 3;
      const dr = rgb[p] - rgb[b], dg = rgb[p + 1] - rgb[b + 1], db = rgb[p + 2] - rgb[b + 2];
      const denominator = dr * dr + dg * dg + db * db;
      const projection = ((coverageRgb[p] - rgb[b]) * dr + (coverageRgb[p + 1] - rgb[b + 1]) * dg + (coverageRgb[p + 2] - rgb[b + 2]) * db) / Math.max(1, denominator);
      coverage += Math.max(0, Math.min(1, Number.isFinite(projection) ? projection : 1));
    }
    const measuredCoverage = Math.max(0, Math.min(1, coverage / fit.path.length));
    let weight = Math.max(0.25, Math.min(1, Math.round(measuredCoverage * 4) / 4));
    let referenceCoverage = measuredCoverage;
    const historyKey = `${fit.path[0]}:${fit.path[fit.path.length - 1]}:${fit.path.length}`;
    const prior = canHold ? previous.lines.get(historyKey) : null;
    let stableHistory = !!prior && Math.abs(measuredCoverage - prior.referenceCoverage) <= 0.06;
    if (stableHistory) for (const cell of cells) {
      const p = cell * 3, b = backgrounds[cell] * 3;
      if (objects[cell] !== previous.objects[cell] ||
          Math.max(Math.abs(rgb[p] - previous.rgb[p]), Math.abs(rgb[p + 1] - previous.rgb[p + 1]), Math.abs(rgb[p + 2] - previous.rgb[p + 2])) > 4 ||
          Math.max(Math.abs(rgb[b] - previous.rgb[b]), Math.abs(rgb[b + 1] - previous.rgb[b + 1]), Math.abs(rgb[b + 2] - previous.rgb[b + 2])) > 4) {
        stableHistory = false;
        break;
      }
    }
    if (stableHistory) { weight = prior.weight; referenceCoverage = prior.referenceCoverage; }
    lineHistory.set(historyKey, { weight, referenceCoverage });
    for (const cell of cells) if (!pathSet.has(cell)) {
      const p = cell * 3, b = backgrounds[cell] * 3;
      output[p] = rgb[b]; output[p + 1] = rgb[b + 1]; output[p + 2] = rgb[b + 2];
      changedCells[cell] = 1; regularizedCells++;
    }
    for (let i = 0; i < fit.path.length; i++) {
      const cell = fit.path[i], ref = references[i], p = cell * 3, r = ref * 3, b = backgrounds[ref] * 3;
      for (let c = 0; c < 3; c++) output[p + c] = Math.round(rgb[b + c] + (rgb[r + c] - rgb[b + c]) * weight);
      lineCells[cell] = 1;
      if (output[p] !== rgb[p] || output[p + 1] !== rgb[p + 1] || output[p + 2] !== rgb[p + 2]) changedCells[cell] = 1;
    }
    lineCount++;
    if (weight < 1) softenedLines++;
  }
  return { rgb: output, lineCells, changedCells, lineCount, softenedLines, regularizedCells, candidateCells,
    state: { width, height, rgb: new Uint8Array(rgb), coverageRgb: new Float32Array(coverageRgb), objects: new Uint32Array(objects), lines: lineHistory } };
}
