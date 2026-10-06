const MAX_SIDE = 512;
const IDENTITY = [[1, 0], [0, 1]];
const generators = {
  horizontal: [[-1, 0], [0, 1]],
  vertical: [[1, 0], [0, -1]],
  diagonalDown: [[0, 1], [1, 0]],
  diagonalUp: [[0, -1], [-1, 0]]
};
const transformCache = new Map();

function dimensionsAreValid(width, height) {
  return Number.isInteger(width) && Number.isInteger(height)
    && width >= 1 && height >= 1 && width <= MAX_SIDE && height <= MAX_SIDE;
}

function normalizeFlags(flags = {}) {
  if (flags == null || typeof flags !== 'object' || Array.isArray(flags)) throw new TypeError('Symmetry flags must be an object');
  const normalized = {};
  for (const name of Object.keys(generators)) {
    if (flags[name] !== undefined && typeof flags[name] !== 'boolean') throw new TypeError(`${name} symmetry must be boolean`);
    normalized[name] = flags[name] === true;
  }
  return normalized;
}

function multiply(left, right) {
  return [
    [left[0][0] * right[0][0] + left[0][1] * right[1][0], left[0][0] * right[0][1] + left[0][1] * right[1][1]],
    [left[1][0] * right[0][0] + left[1][1] * right[1][0], left[1][0] * right[0][1] + left[1][1] * right[1][1]]
  ];
}

function transformsFor(flags) {
  const normalized = normalizeFlags(flags);
  const key = Object.keys(generators).map((name) => Number(normalized[name])).join('');
  let transforms = transformCache.get(key);
  if (transforms) return transforms;

  const enabledGenerators = Object.keys(generators).filter((name) => normalized[name]).map((name) => generators[name]);
  transforms = [IDENTITY];
  const seen = new Set(['1,0,0,1']);
  for (let index = 0; index < transforms.length; index += 1) {
    for (const generator of enabledGenerators) {
      // Compose generators against each discovered map until the selected reflections close.
      const candidate = multiply(generator, transforms[index]);
      const key = candidate.flat().join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      transforms.push(candidate);
    }
  }
  const immutable = Object.freeze(transforms.map((matrix) => Object.freeze(matrix.map((row) => Object.freeze([...row])))));
  transformCache.set(key, immutable);
  return immutable;
}

/** Return the unique mirror-group matrices (including identity) as 2x2 row-major arrays. */
export function symmetryTransforms(flags = {}) {
  return transformsFor(flags).map((matrix) => matrix.map((row) => [...row]));
}

function validateMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 2 || matrix.some((row) => !Array.isArray(row) || row.length !== 2
      || row.some((value) => !Number.isInteger(value) || Math.abs(value) > 1))) throw new TypeError('Symmetry matrix must be a 2x2 signed matrix');
  const [a, b] = matrix[0]; const [c, d] = matrix[1];
  if (a * a + b * b !== 1 || c * c + d * d !== 1 || a * c + b * d !== 0) throw new TypeError('Symmetry matrix must be an orthogonal reflection or rotation');
}

/** Apply a centered matrix once, rounding the final pixel coordinate without clipping. */
export function symmetryPoint(point, width, height, matrix, origin = null) {
  if (!dimensionsAreValid(width, height)) throw new RangeError('Canvas dimensions must be integers from 1 to 512');
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new TypeError('Symmetry point must have finite coordinates');
  validateMatrix(matrix);
  if (origin !== null && (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y))) throw new TypeError('Symmetry origin must have finite coordinates');
  const centerX = origin?.x ?? (width - 1) / 2; const centerY = origin?.y ?? (height - 1) / 2;
  const x = point.x - centerX; const y = point.y - centerY;
  return {
    x: Math.round(centerX + matrix[0][0] * x + matrix[0][1] * y),
    y: Math.round(centerY + matrix[1][0] * x + matrix[1][1] * y)
  };
}

/** Map a source point through each selected group transform, optionally clipping and deduplicating. */
export function symmetryPoints(point, width, height, flags = {}, { clip = true } = {}) {
  if (typeof clip !== 'boolean') throw new TypeError('clip must be boolean');
  const mapped = new Map();
  for (const matrix of transformsFor(flags)) {
    const next = symmetryPoint(point, width, height, matrix, flags.origin ?? null);
    if (clip && (next.x < 0 || next.y < 0 || next.x >= width || next.y >= height)) continue;
    mapped.set(`${next.x},${next.y}`, next);
  }
  return [...mapped.values()];
}
