// The source-colour palette, Bayer matrix and edge-aware surface pass are
// adapted from the former PiXiEELENS camera. Rendering stays inside the
// current pixel-camera worker so its framing, capture and UI stay unchanged.
const MAX_PIXELS = 512 * 512;
const PALETTE_SIZE = 24;
const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const byte = (value) => Math.max(0, Math.min(255, Math.round(value)));
const luma = (r, g, b) => .2126 * r + .7152 * g + .0722 * b;
const distance = (a, b) => .25 * (a[0] - b[0]) ** 2 + .60 * (a[1] - b[1]) ** 2 + .15 * (a[2] - b[2]) ** 2;
const colorKey = (r, g, b) => (r << 16) | (g << 8) | b;

function validate(sampled) {
  if (!sampled || !Number.isInteger(sampled.width) || !Number.isInteger(sampled.height) ||
      sampled.width < 1 || sampled.height < 1 || sampled.width * sampled.height > MAX_PIXELS ||
      !(sampled.data instanceof Uint8Array || sampled.data instanceof Uint8ClampedArray) ||
      sampled.data.length !== sampled.width * sampled.height * 4 ||
      (sampled.labels && sampled.labels.length !== sampled.width * sampled.height)) {
    throw new TypeError('sampled must contain bounded RGBA pixels and matching labels');
  }
}

function binsFor(data) {
  const bins = new Map();
  for (let p = 0; p < data.length; p += 4) {
    const key = (data[p] >> 4) << 8 | (data[p + 1] >> 4) << 4 | (data[p + 2] >> 4);
    let entry = bins.get(key);
    if (!entry) {
      entry = { color: [((key >> 8) & 15) * 17, ((key >> 4) & 15) * 17, (key & 15) * 17], count: 0 };
      bins.set(key, entry);
    }
    entry.count++;
  }
  return [...bins.values()].sort((a, b) => b.count - a.count);
}

// Area-weighted image colours: preserve substantial black/white regions,
// seed separated material colours, then move centres toward occupied bins.
function sourcePalette(data, bins = binsFor(data), desired = PALETTE_SIZE) {
  if (!bins.length) return [[0, 0, 0]];
  const size = Math.min(desired, bins.length);
  const total = data.length / 4;
  const coverage = (predicate) => bins.reduce((sum, bin) => sum + (predicate(luma(...bin.color)) ? bin.count : 0), 0) / total;
  const centers = [], locked = [];
  if (coverage((y) => y <= 40) >= .012 && centers.length < size) { centers.push([0, 0, 0]); locked.push(true); }
  if (coverage((y) => y >= 216) >= .012 && centers.length < size) { centers.push([255, 255, 255]); locked.push(true); }
  while (centers.length < size) {
    let chosen = null, best = -Infinity;
    for (const bin of bins) {
      const nearest = centers.length ? Math.sqrt(Math.min(...centers.map((center) => distance(bin.color, center)))) : 96;
      if (centers.length && nearest < 18) continue;
      const score = Math.sqrt(bin.count) * (.35 + nearest / 96);
      if (score > best) { best = score; chosen = bin; }
    }
    if (!chosen) break;
    centers.push([...chosen.color]); locked.push(false);
  }
  const assignments = new Uint8Array(bins.length);
  for (let pass = 0; pass < 4; pass++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < bins.length; i++) {
      const bin = bins[i];
      let best = 0, error = Infinity;
      for (let j = 0; j < centers.length; j++) {
        const next = distance(bin.color, centers[j]);
        if (next < error) { best = j; error = next; }
      }
      assignments[i] = best;
      if (locked[best]) continue;
      const sum = sums[best];
      sum[0] += bin.color[0] * bin.count; sum[1] += bin.color[1] * bin.count;
      sum[2] += bin.color[2] * bin.count; sum[3] += bin.count;
    }
    for (let j = 0; j < centers.length; j++) if (!locked[j] && sums[j][3]) {
      centers[j] = sums[j].slice(0, 3).map((sum) => byte(sum / sums[j][3]));
    }
  }
  for (let j = 0; j < centers.length; j++) {
    if (locked[j]) continue;
    let chosen = null, best = Infinity;
    for (let i = 0; i < bins.length; i++) {
      if (assignments[i] !== j) continue;
      const score = distance(bins[i].color, centers[j]) - Math.min(2400, Math.log2(bins[i].count + 1) * 260);
      if (score < best) { best = score; chosen = bins[i].color; }
    }
    if (chosen) centers[j] = [...chosen];
  }
  const usage = centers.map((_, j) => bins.reduce((sum, bin, i) => sum + (assignments[i] === j ? bin.count : 0), 0));
  const selected = centers.map((color, index) => ({ color, index })).sort((a, b) =>
    Number(locked[b.index]) - Number(locked[a.index]) || usage[b.index] - usage[a.index]);
  const palette = [];
  for (const item of selected) {
    if (locked[item.index] || palette.every((color) => Math.sqrt(distance(color, item.color)) >= 24)) palette.push(item.color);
  }
  for (const bin of bins) {
    if (palette.length >= size) break;
    if (palette.every((color) => Math.sqrt(distance(color, bin.color)) >= 24)) palette.push([...bin.color]);
  }
  return palette;
}

function edgeMap(sampled) {
  const { width, height, data } = sampled;
  const edge = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const cell = y * width + x, p = cell * 4;
    edge[cell] = Math.min(1, (Math.abs(luma(data[p + 4], data[p + 5], data[p + 6]) - luma(data[p - 4], data[p - 3], data[p - 2])) +
      Math.abs(luma(data[p + width * 4], data[p + width * 4 + 1], data[p + width * 4 + 2]) -
        luma(data[p - width * 4], data[p - width * 4 + 1], data[p - width * 4 + 2]))) / 180);
  }
  return edge;
}

function sameRegion(labels, cell, width) {
  if (!labels) return true;
  const label = labels[cell];
  return labels[cell - 1] === label && labels[cell + 1] === label &&
    labels[cell - width] === label && labels[cell + width] === label &&
    labels[cell - width - 1] === label && labels[cell - width + 1] === label &&
    labels[cell + width - 1] === label && labels[cell + width + 1] === label;
}

function smoothRamp(values, a, b, c) {
  const first = values[b] - values[a], second = values[c] - values[b];
  return first * second > 0 && Math.abs(first) >= 2 && Math.abs(second) >= 2 &&
    Math.abs(first) < 22 && Math.abs(second) < 22 && Math.abs(first - second) <= 8;
}

function shouldDither(cell, width, height, sampled, edges, brightness) {
  const x = cell % width, y = (cell / width) | 0;
  if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1 || edges[cell] > .16 ||
      !sameRegion(sampled.labels, cell, width)) return false;
  const horizontal = smoothRamp(brightness, cell - 1, cell, cell + 1) &&
    smoothRamp(brightness, cell - width - 1, cell - width, cell - width + 1) &&
    smoothRamp(brightness, cell + width - 1, cell + width, cell + width + 1);
  const vertical = smoothRamp(brightness, cell - width, cell, cell + width) &&
    smoothRamp(brightness, cell - width - 1, cell - 1, cell + width - 1) &&
    smoothRamp(brightness, cell - width + 1, cell + 1, cell + width + 1);
  return horizontal || vertical;
}

function simplifySurface(output, sampled, edges, strength = 55) {
  const { width, height, labels } = sampled;
  if (width < 3 || height < 3 || strength < 20) return 0;
  const offsets = [-1, 1, -width, width, -width - 1, -width + 1, width - 1, width + 1];
  const weights = [2, 2, 2, 2, 1, 1, 1, 1];
  const keys = new Uint32Array(8);
  const counts = new Uint8Array(8);
  const requiredWeight = strength < 34 ? 6 : strength < 67 ? 5 : 4;
  const maxDistanceSquared = (24 + strength * .45) ** 2;
  const passes = strength < 60 ? 1 : strength < 85 ? 2 : 3;
  let changed = 0;
  for (let pass = 0; pass < passes; pass++) {
    const source = new Uint8ClampedArray(output);
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const cell = y * width + x;
      if (edges[cell] > (strength < 75 ? .28 : .42) || !sameRegion(labels, cell, width)) continue;
      const p = cell * 4;
      let unique = 0;
      for (let n = 0; n < 8; n++) {
        const neighbor = cell + offsets[n];
        if (labels && labels[neighbor] !== labels[cell]) continue;
        const q = neighbor * 4, key = colorKey(source[q], source[q + 1], source[q + 2]);
        let index = 0;
        while (index < unique && keys[index] !== key) index++;
        if (index === unique) { keys[unique] = key; counts[unique] = 0; unique++; }
        counts[index] += weights[n];
      }
      let dominant = null, weight = requiredWeight - 1;
      for (let index = 0; index < unique; index++) if (counts[index] >= requiredWeight && counts[index] > weight) {
        dominant = keys[index]; weight = counts[index];
      }
      if (dominant === null) continue;
      const r = dominant >> 16 & 255, g = dominant >> 8 & 255, b = dominant & 255;
      const dr = source[p] - r, dg = source[p + 1] - g, db = source[p + 2] - b;
      if (dr === 0 && dg === 0 && db === 0) continue;
      if (.25 * dr * dr + .60 * dg * dg + .15 * db * db > maxDistanceSquared) continue;
      output[p] = r; output[p + 1] = g; output[p + 2] = b;
      changed++;
    }
  }
  return changed;
}

export function createLensSourcePalette() {
  let palette = null, locked = false, revision = 0, paletteSize = PALETTE_SIZE;
  function reset() { palette = null; locked = false; revision++; }
  function render(sampled, settings = {}) {
    validate(sampled);
    const requestedSize = settings.colorDepth === 'full' ? 'full' :
      [2, 4, 8, 16, 24].includes(Number(settings.colorDepth)) ? Number(settings.colorDepth) : PALETTE_SIZE;
    if (requestedSize !== paletteSize) { paletteSize = requestedSize; reset(); }
    const { width, height, data: original } = sampled, cells = width * height;
    const data = settings.legacyTone ? new Uint8ClampedArray(original) : original;
    if (settings.legacyTone) for (let p = 0; p < data.length; p += 4) {
      const y = luma(data[p], data[p + 1], data[p + 2]);
      const lift = y < 60 ? 4 : 0;
      for (let channel = 0; channel < 3; channel++) {
        data[p + channel] = byte(((data[p + channel] - y) * 1.02 + y - 128) * 1.04 + 128 + lift);
      }
    }
    if (requestedSize === 'full') {
      const output = new Uint8ClampedArray(data);
      for (let p = 3; p < output.length; p += 4) output[p] = 255;
      return { ...sampled, data: output, palette: [], stats: { ...sampled.stats,
        shading: 'lens-full-color', dither: 'none', ditheredCells: 0,
        surfaceSimplifiedCells: 0, paletteLocked: true, paletteRevision: revision } };
    }
    if (!locked) {
      const bins = binsFor(data);
      const informative = bins.length >= 2 && bins[0].count < cells * .96;
      if (!palette || informative) {
        palette = sourcePalette(data, bins, requestedSize); locked = informative; revision++;
      }
    }
    const prepared = data === original ? sampled : { ...sampled, data };
    const edges = edgeMap(prepared);
    const brightness = new Uint8Array(cells);
    for (let cell = 0; cell < cells; cell++) {
      const p = cell * 4;
      brightness[cell] = byte(luma(data[p], data[p + 1], data[p + 2]));
    }
    const output = new Uint8ClampedArray(data.length);
    let ditheredCells = 0;
    for (let cell = 0; cell < cells; cell++) {
      const p = cell * 4;
      let r = data[p], g = data[p + 1], b = data[p + 2];
      const ordered = settings.dither === 'ordered';
      const selective = settings.dither !== 'off' && settings.dither !== 'ordered';
      if (ordered || (selective && shouldDither(cell, width, height, prepared, edges, brightness))) {
        const offset = (BAYER_4[((cell / width | 0) & 3) * 4 + ((cell % width) & 3)] - 7.5) *
          (ordered ? (requestedSize === 2 ? 3 : 2) : .75);
        r = byte(r + offset); g = byte(g + offset); b = byte(b + offset);
        ditheredCells++;
      }
      let best = palette[0], error = Infinity;
      for (const color of palette) {
        const next = (r - color[0]) ** 2 + (g - color[1]) ** 2 + (b - color[2]) ** 2;
        if (next < error) { best = color; error = next; }
      }
      output[p] = best[0]; output[p + 1] = best[1]; output[p + 2] = best[2]; output[p + 3] = 255;
    }
    const simplifiedCells = simplifySurface(output, prepared, edges,
      Number.isFinite(settings.surfaceSimplify) ? Math.max(0, Math.min(100, settings.surfaceSimplify)) : 55);
    return {
      ...sampled, data: output, palette: palette.map((color) => [...color]),
      stats: { ...sampled.stats, shading: 'lens-source-palette',
        dither: settings.dither === 'ordered' ? 'ordered-bayer' : settings.dither === 'off' ? 'none' : 'selective-bayer',
        ditheredCells, surfaceSimplifiedCells: simplifiedCells,
        paletteLocked: locked, paletteRevision: revision }
    };
  }
  return { render, reset };
}
