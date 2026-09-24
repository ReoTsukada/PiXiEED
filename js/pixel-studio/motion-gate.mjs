const MAX_DIMENSION = 512;
const NOISE_DELTA = 4;
const RGB_DISTANCE_SQUARED = 56.25;

function isRgbBuffer(value) {
  return value instanceof Uint8Array || value instanceof Uint8ClampedArray;
}

function isObjectBuffer(value) {
  return value instanceof Uint32Array || Array.isArray(value);
}

function validateObjects(value, length, name) {
  if (!isObjectBuffer(value) || value.length !== length) {
    throw new TypeError(`${name} must contain one object ID per cell`);
  }
  for (let i = 0; i < length; i++) {
    if (!Number.isSafeInteger(value[i]) || value[i] < 0) throw new TypeError(`${name}[${i}] must be a non-negative safe integer`);
  }
}

/**
 * Marks cells whose previous palette/tone must not be retained. A one-cell
 * eight-neighbor halo also releases stale outlines around a moved boundary.
 * Small per-channel sensor changes through four levels are ignored; a five
 * level single-channel edge is enough to count as motion.
 */
export function detectChangedCells(currentRgb, previousRgb, currentObjects, previousObjects, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new RangeError(`width and height must be integers from 1 to ${MAX_DIMENSION}`);
  }
  const cells = width * height;
  if (!isRgbBuffer(currentRgb) || currentRgb.length !== cells * 3) {
    throw new TypeError('currentRgb must contain three 8-bit channels per cell');
  }
  validateObjects(currentObjects, cells, 'currentObjects');

  const hasPreviousRgb = previousRgb !== null && previousRgb !== undefined;
  const hasPreviousObjects = previousObjects !== null && previousObjects !== undefined;
  if (hasPreviousRgb !== hasPreviousObjects) throw new TypeError('previous RGB and object IDs must both be present or both be absent');
  if (!hasPreviousRgb) return new Uint8Array(cells).fill(1);
  if (!isRgbBuffer(previousRgb) || previousRgb.length !== cells * 3) {
    throw new TypeError('previousRgb must contain three 8-bit channels per cell');
  }
  validateObjects(previousObjects, cells, 'previousObjects');

  const changed = new Uint8Array(cells);
  for (let cell = 0; cell < cells; cell++) {
    if (currentObjects[cell] !== previousObjects[cell]) {
      changed[cell] = 1;
      continue;
    }
    const p = cell * 3;
    const dr = currentRgb[p] - previousRgb[p];
    const dg = currentRgb[p + 1] - previousRgb[p + 1];
    const db = currentRgb[p + 2] - previousRgb[p + 2];
    if (Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)) > NOISE_DELTA ||
        dr * dr + dg * dg + db * db > RGB_DISTANCE_SQUARED) changed[cell] = 1;
  }

  const invalid = new Uint8Array(changed);
  for (let cell = 0; cell < cells; cell++) {
    if (!changed[cell]) continue;
    const x = cell % width, y = Math.floor(cell / width);
    for (let oy = -1; oy <= 1; oy++) {
      const ny = y + oy;
      if (ny < 0 || ny >= height) continue;
      for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox;
        if (nx >= 0 && nx < width) invalid[ny * width + nx] = 1;
      }
    }
  }
  return invalid;
}
