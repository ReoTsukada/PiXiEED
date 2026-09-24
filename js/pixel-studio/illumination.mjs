import { grayLight } from './global-tones.mjs';

const MAX_CELLS = 512 * 512;
const CORE_NEIGHBORS = [-1, 0, 1];

const pixelLight = (rgb, cell) => grayLight(rgb[cell * 3], rgb[cell * 3 + 1], rgb[cell * 3 + 2]);
const pixelMax = (rgb, cell) => Math.max(rgb[cell * 3], rgb[cell * 3 + 1], rgb[cell * 3 + 2]);

function validate({ rgb, objects, protectedCells, width, height }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > 512 || height > 512 || width * height > MAX_CELLS) {
    throw new RangeError('width and height must form a grid from 1 to 512x512');
  }
  const count = width * height;
  if (!(rgb instanceof Uint8Array) || rgb.length !== count * 3) throw new TypeError('rgb must contain one RGB triplet per cell');
  if (!(objects instanceof Uint32Array) || objects.length !== count) throw new TypeError('objects must contain one object ID per cell');
  if (protectedCells != null && (!(protectedCells instanceof Uint8Array) || protectedCells.length !== count)) {
    throw new TypeError('protectedCells must match width * height');
  }
  if (protectedCells) for (let cell = 0; cell < count; cell++) {
    if (protectedCells[cell] !== 0 && protectedCells[cell] !== 1) throw new RangeError(`protectedCells value at ${cell} must be 0 or 1`);
  }
  return count;
}

function similarColor(rgb, a, b, tolerance = 0.16) {
  const ao = a * 3, bo = b * 3;
  const aMax = Math.max(rgb[ao], rgb[ao + 1], rgb[ao + 2]);
  const bMax = Math.max(rgb[bo], rgb[bo + 1], rgb[bo + 2]);
  if (aMax < 24 || bMax < 24) return false;
  return Math.abs(rgb[ao] / aMax - rgb[bo] / bMax) <= tolerance &&
    Math.abs(rgb[ao + 1] / aMax - rgb[bo + 1] / bMax) <= tolerance &&
    Math.abs(rgb[ao + 2] / aMax - rgb[bo + 2] / bMax) <= tolerance;
}

function distanceFromBox(x, y, box) {
  const dx = x < box.minX ? box.minX - x : x > box.maxX ? x - box.maxX : 0;
  const dy = y < box.minY ? box.minY - y : y > box.maxY ? y - box.maxY : 0;
  return Math.max(dx, dy);
}

function median(values, length) {
  values.subarray(0, length).sort();
  const middle = length >> 1;
  return length & 1 ? values[middle] : (values[middle - 1] + values[middle]) * 0.5;
}

function detectLightCores({ rgb, objects, protectedCells, width, height, lights, lightCoreCells, output, haloCells }) {
  const count = width * height;
  const visited = new Uint8Array(count);
  const queue = new Int32Array(count);
  const scale = Math.max(1, Math.min(4, Math.min(width, height) / 128));
  const maxCoreCells = Math.min(512, Math.round(24 * scale * scale));
  const maxCoreDimension = Math.round(5 * scale);
  const coreValues = new Float32Array(512);
  const ringValues = new Float32Array(2800);
  const outerRadius = Math.max(5, Math.min(16, Math.round(Math.min(width, height) * 0.125)));
  const haloRadius = outerRadius - 3;

  for (let start = 0; start < count; start++) {
    if (visited[start]) continue;
    const bright = lights[start] >= 205 || (pixelMax(rgb, start) >= 245 && lights[start] >= 145);
    if (!bright) { visited[start] = 1; continue; }

    let head = 0, tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    while (head < tail) {
      const cell = queue[head++], x = cell % width, y = Math.floor(cell / width);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (const dy of CORE_NEIGHBORS) for (const dx of CORE_NEIGHBORS) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const neighbor = ny * width + nx;
        if (visited[neighbor]) continue;
        if (lights[neighbor] >= 205 || (pixelMax(rgb, neighbor) >= 245 && lights[neighbor] >= 145)) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        } else visited[neighbor] = 1;
      }
    }
    if (tail > maxCoreCells || maxX - minX + 1 > maxCoreDimension || maxY - minY + 1 > maxCoreDimension) continue;

    for (let i = 0; i < tail; i++) coreValues[i] = lights[queue[i]];
    const coreLight = median(coreValues, tail);
    const box = { minX, minY, maxX, maxY };

    // A compact bright region is only treated as a lamp when the outer ring is dark.
    let ringCount = 0;
    for (let y = Math.max(0, minY - outerRadius); y <= Math.min(height - 1, maxY + outerRadius); y++) {
      for (let x = Math.max(0, minX - outerRadius); x <= Math.min(width - 1, maxX + outerRadius); x++) {
        const cell = y * width + x;
        const distance = distanceFromBox(x, y, box);
        if (distance < outerRadius - 3 || distance > outerRadius || lightCoreCells[cell] || protectedCells?.[cell]) continue;
        ringValues[ringCount++] = lights[cell];
      }
    }
    if (ringCount < 8) continue;
    const ambientLight = median(ringValues, ringCount);
    if (ambientLight > 82 || coreLight - ambientLight < 100) continue;

    let transitionCount = 0;
    for (let y = Math.max(0, minY - haloRadius); y <= Math.min(height - 1, maxY + haloRadius); y++) {
      for (let x = Math.max(0, minX - haloRadius); x <= Math.min(width - 1, maxX + haloRadius); x++) {
        const cell = y * width + x, distance = distanceFromBox(x, y, box);
        if (distance > haloRadius || protectedCells?.[cell] || lightCoreCells[cell]) continue;
        if (lights[cell] > ambientLight + 6 && lights[cell] < coreLight - 5) transitionCount++;
      }
    }
    // A hard-edged white object has no broad, connected transition to clean up.
    if (transitionCount < 3) continue;

    for (let i = 0; i < tail; i++) lightCoreCells[queue[i]] = 1;

    // The halo may use a different object label from the core. Build per-owner
    // ambient samples so correction never borrows RGB across object boundaries.
    const ownerRings = new Map();
    for (let y = Math.max(0, minY - outerRadius); y <= Math.min(height - 1, maxY + outerRadius); y++) {
      for (let x = Math.max(0, minX - outerRadius); x <= Math.min(width - 1, maxX + outerRadius); x++) {
        const cell = y * width + x, distance = distanceFromBox(x, y, box);
        if (distance < outerRadius - 3 || distance > outerRadius || lightCoreCells[cell] || protectedCells?.[cell]) continue;
        let ownerRing = ownerRings.get(objects[cell]);
        if (!ownerRing) { ownerRing = { cells: [], count: 0 }; ownerRings.set(objects[cell], ownerRing); }
        ownerRing.cells.push(cell);
        ownerRing.count++;
      }
    }
    for (const ownerRing of ownerRings.values()) {
      if (ownerRing.count < 4) { ownerRing.ambient = Infinity; continue; }
      for (let i = 0; i < ownerRing.count; i++) ringValues[i] = lights[ownerRing.cells[i]];
      ownerRing.ambient = median(ringValues, ownerRing.count);
      let best = -1, bestDistance = Infinity;
      for (const cell of ownerRing.cells) {
        const distance = Math.abs(lights[cell] - ownerRing.ambient);
        if (distance < bestDistance) { best = cell; bestDistance = distance; }
      }
      ownerRing.representative = best;
    }

    for (let y = Math.max(0, minY - haloRadius); y <= Math.min(height - 1, maxY + haloRadius); y++) {
      for (let x = Math.max(0, minX - haloRadius); x <= Math.min(width - 1, maxX + haloRadius); x++) {
        const cell = y * width + x, distance = distanceFromBox(x, y, box);
        if (distance > haloRadius || protectedCells?.[cell] || lightCoreCells[cell]) continue;
        const centerLight = lights[cell];
        if (centerLight <= ambientLight + 6 || centerLight >= coreLight - 5) continue;

        let coherentNeighbors = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const neighbor = ny * width + nx;
          if (objects[neighbor] === objects[cell] && !lightCoreCells[neighbor] &&
              Math.abs(lights[neighbor] - centerLight) <= 35 && lights[neighbor] > ambientLight + 3) coherentNeighbors++;
        }
        if (coherentNeighbors < 2) continue;
        const ownerRing = ownerRings.get(objects[cell]);
        if (!ownerRing || ownerRing.ambient === Infinity || centerLight <= ownerRing.ambient + 6) continue;
        const chosen = ownerRing.representative;
        if (chosen < 0 || lights[chosen] >= centerLight - 5) continue;
        const offset = cell * 3, sampleOffset = chosen * 3;
        const dr = rgb[offset] - rgb[sampleOffset], dg = rgb[offset + 1] - rgb[sampleOffset + 1], db = rgb[offset + 2] - rgb[sampleOffset + 2];
        if (Math.min(dr, dg, db) < -8 || Math.max(dr, dg, db) - Math.min(dr, dg, db) > 45) continue;
        output.set(rgb.subarray(sampleOffset, sampleOffset + 3), offset);
        haloCells[cell] = 1;
      }
    }
  }
}

function flattenSoftShadows({ rgb, objects, protectedCells, width, height, lights, output, lightCoreCells, haloCells, flattenedShadowCells }) {
  const count = width * height, visited = new Uint8Array(count), queue = new Int32Array(count);
  const binCount = 32, histogram = new Uint32Array(binCount), representatives = new Int32Array(binCount);
  const neighborOffsets = [-1, 1, -width, width, -width - 1, -width + 1, width - 1, width + 1];

  for (let start = 0; start < count; start++) {
    if (visited[start]) continue;
    if (protectedCells?.[start] || lightCoreCells[start] || haloCells[start]) { visited[start] = 1; continue; }
    const object = objects[start];
    let head = 0, tail = 0, minX = width, minY = height, maxX = -1, maxY = -1;
    queue[tail++] = start; visited[start] = 1;
    while (head < tail) {
      const cell = queue[head++], x = cell % width, y = Math.floor(cell / width);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (const offset of neighborOffsets) {
        const neighbor = cell + offset;
        if (neighbor < 0 || neighbor >= count || visited[neighbor]) continue;
        const nx = neighbor % width;
        if (Math.abs(nx - x) > 1 || protectedCells?.[neighbor] || lightCoreCells[neighbor] || haloCells[neighbor] || objects[neighbor] !== object) continue;
        if (Math.abs(lights[neighbor] - lights[cell]) > 10 ||
            Math.max(rgb[neighbor * 3] > rgb[cell * 3] ? rgb[neighbor * 3] - rgb[cell * 3] : rgb[cell * 3] - rgb[neighbor * 3],
              rgb[neighbor * 3 + 1] > rgb[cell * 3 + 1] ? rgb[neighbor * 3 + 1] - rgb[cell * 3 + 1] : rgb[cell * 3 + 1] - rgb[neighbor * 3 + 1],
              rgb[neighbor * 3 + 2] > rgb[cell * 3 + 2] ? rgb[neighbor * 3 + 2] - rgb[cell * 3 + 2] : rgb[cell * 3 + 2] - rgb[neighbor * 3 + 2]) > 18 ||
            !similarColor(rgb, start, neighbor, 0.12)) continue;
        visited[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }

    if (tail < 36 || maxX - minX + 1 < 6 || maxY - minY + 1 < 6 ||
        tail / ((maxX - minX + 1) * (maxY - minY + 1)) < 0.25) continue;
    let minLight = Infinity, maxLight = -Infinity;
    for (let i = 0; i < tail; i++) { minLight = Math.min(minLight, lights[queue[i]]); maxLight = Math.max(maxLight, lights[queue[i]]); }
    if (minLight < 86 || maxLight < 135 || maxLight - minLight < 12 || maxLight - minLight > 85) continue;

    histogram.fill(0);
    representatives.fill(0);
    const range = maxLight - minLight;
    for (let i = 0; i < tail; i++) {
      const cell = queue[i];
      const bin = Math.min(binCount - 1, Math.floor((lights[cell] - minLight) / range * binCount));
      histogram[bin]++;
      const prior = representatives[bin];
      if (prior === 0 || Math.abs(lights[cell] - (minLight + (bin + 0.5) * range / binCount)) <
          Math.abs(lights[prior - 1] - (minLight + (bin + 0.5) * range / binCount))) representatives[bin] = cell + 1;
    }
    let cumulative = 0, upperBin = 0;
    for (; upperBin < binCount; upperBin++) { cumulative += histogram[upperBin]; if (cumulative >= tail * 0.75) break; }
    const targetLight = minLight + (upperBin + 0.5) * range / binCount;

    for (let i = 0; i < tail; i++) {
      const cell = queue[i];
      // Tiny remaining differences also need the plane's base: after limited
      // palette quantization they can otherwise become a dark ring around an
      // already flattened shadow center.
      if (lights[cell] >= targetLight) continue;
      let chosen = -1, chosenDistance = Infinity;
      for (let bin = 0; bin < binCount; bin++) {
        const sample = representatives[bin] - 1;
        if (sample < 0 || lights[sample] <= lights[cell] + 0.25 || !similarColor(rgb, cell, sample, 0.10)) continue;
        const difference = Math.abs(lights[sample] - targetLight);
        if (difference < chosenDistance) { chosen = sample; chosenDistance = difference; }
      }
      if (chosen < 0 || chosenDistance > Math.max(5, range * 0.18)) continue;
      output.set(rgb.subarray(chosen * 3, chosen * 3 + 3), cell * 3);
      flattenedShadowCells[cell] = 1;
    }
  }
}

/** Conservatively suppresses local light halos and broad, weak face-plane shadows. */
export function simplifyIllumination({ rgb, objects, protectedCells = null, width, height } = {}) {
  const count = validate({ rgb, objects, protectedCells, width, height });
  const output = new Uint8Array(rgb);
  const lights = new Float32Array(count);
  for (let cell = 0; cell < count; cell++) lights[cell] = pixelLight(rgb, cell);
  const haloCells = new Uint8Array(count);
  const lightCoreCells = new Uint8Array(count);
  const flattenedShadowCells = new Uint8Array(count);

  // A small white detail against a locally dark edge also occurs in daytime
  // portraits and cups. Only enable halo removal when most of the frame is dark.
  let darkCells = 0;
  for (let cell = 0; cell < count; cell++) if (lights[cell] < 86) darkCells++;
  if (darkCells >= count * 0.6) {
    detectLightCores({ rgb, objects, protectedCells, width, height, lights, lightCoreCells, output, haloCells });
  }
  flattenSoftShadows({ rgb, objects, protectedCells, width, height, lights, output, lightCoreCells, haloCells, flattenedShadowCells });
  return { rgb: output, haloCells, flattenedShadowCells, lightCoreCells };
}
