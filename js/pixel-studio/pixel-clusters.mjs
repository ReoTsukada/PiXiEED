const MAX_CELLS = 512 * 512;
const MAJORITY_REQUIRED = 6;
const MIN_SOURCE_MATCHES = 4;
const MAX_SOURCE_CHANNEL_DELTA = 20;

function isByteArray(value) {
  return value instanceof Uint8Array || value instanceof Uint8ClampedArray;
}

function assertInputs({ indices, palette, width, height, objects, materials, sourceRgb, protectedCells }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_CELLS) {
    throw new RangeError(`width and height must contain between 1 and ${MAX_CELLS} cells`);
  }
  const count = width * height;
  if (!(indices instanceof Uint8Array) || indices.length !== count) throw new TypeError('indices must be a Uint8Array matching width * height');
  if (!(objects instanceof Uint32Array) || objects.length !== count) throw new TypeError('objects must be a Uint32Array matching width * height');
  if (!(materials instanceof Float64Array || materials instanceof Uint32Array) || materials.length !== count) {
    throw new TypeError('materials must be a Float64Array or Uint32Array matching width * height');
  }
  if (!isByteArray(sourceRgb) || sourceRgb.length !== count * 3) throw new TypeError('sourceRgb must contain one RGB triplet per cell');
  if (protectedCells !== undefined && (!isByteArray(protectedCells) || protectedCells.length !== count)) {
    throw new TypeError('protectedCells must be a byte array matching width * height');
  }
  if (!Array.isArray(palette) || palette.length < 1 || palette.length > 256) throw new RangeError('palette must contain between 1 and 256 colors');
  for (let i = 0; i < palette.length; i++) {
    const color = palette[i];
    if (!Array.isArray(color) || color.length < 3 || color.slice(0, 3).some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
      throw new TypeError(`palette color ${i} must contain byte RGB channels`);
    }
  }
  for (let cell = 0; cell < count; cell++) {
    if (indices[cell] >= palette.length) throw new RangeError(`palette index at ${cell} is out of range`);
    if (!Number.isSafeInteger(materials[cell]) || materials[cell] < 0) throw new TypeError(`material key at ${cell} must be a non-negative safe integer`);
  }
}

function neighborsOf(cell, width) {
  const x = cell % width, y = Math.floor(cell / width);
  if (x === 0 || y === 0) return null;
  return [cell - width - 1, cell - width, cell - width + 1,
    cell - 1, cell + 1,
    cell + width - 1, cell + width, cell + width + 1];
}

function sourceClose(sourceRgb, cell, neighbor, maxDelta) {
  const a = cell * 3, b = neighbor * 3;
  return Math.max(Math.abs(sourceRgb[a] - sourceRgb[b]),
    Math.abs(sourceRgb[a + 1] - sourceRgb[b + 1]),
    Math.abs(sourceRgb[a + 2] - sourceRgb[b + 2])) <= maxDelta;
}

/**
 * Removes isolated, low-contrast index specks within one object/material
 * neighborhood. It only substitutes an existing palette index and never
 * blends RGB values; thin strokes and corners with any same-index neighbor
 * are intentionally left alone.
 */
export function cleanPixelClusters({ indices, palette, width, height, objects, materials, sourceRgb, protectedCells } = {}) {
  assertInputs({ indices, palette, width, height, objects, materials, sourceRgb, protectedCells });
  const output = new Uint8Array(indices);
  let removedCells = 0;

  // Read decisions only from the source indices so a cleanup cannot cascade.
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const cell = y * width + x;
    if (protectedCells?.[cell]) continue;
    const neighbors = neighborsOf(cell, width);
    const currentIndex = indices[cell];
    let hasStrokeSupport = false;
    for (const neighbor of neighbors) {
      // Support is deliberately independent of owner/material: a colored eye,
      // lash, or outline that touches another region must never be erased.
      if (indices[neighbor] === currentIndex) { hasStrokeSupport = true; break; }
    }
    if (hasStrokeSupport) continue;

    const objectId = objects[cell], material = materials[cell];
    let bestIndex = -1, bestCount = 0;
    for (const neighbor of neighbors) {
      if (objects[neighbor] !== objectId || materials[neighbor] !== material) continue;
      const candidate = indices[neighbor];
      if (candidate === currentIndex) continue;
      let count = 0;
      for (const other of neighbors) {
        if (objects[other] === objectId && materials[other] === material && indices[other] === candidate) count++;
      }
      if (count > bestCount) { bestIndex = candidate; bestCount = count; }
    }
    if (bestIndex < 0 || bestCount < MAJORITY_REQUIRED) continue;

    let sourceMatches = 0;
    for (const neighbor of neighbors) {
      if (objects[neighbor] === objectId && materials[neighbor] === material && indices[neighbor] === bestIndex &&
          sourceClose(sourceRgb, cell, neighbor, MAX_SOURCE_CHANNEL_DELTA)) sourceMatches++;
    }
    if (sourceMatches < MIN_SOURCE_MATCHES) continue;
    output[cell] = bestIndex;
    removedCells++;
  }
  return { indices: output, removedCells };
}
