const MAX_CELLS = 512 * 512;
const MIN_SPAN = 6;
const MAX_PERPENDICULAR_RESIDUAL = 1.2;
const MAX_MAJOR_GAP = 3;

function validate(cells, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_CELLS) {
    throw new RangeError(`width and height must contain between 1 and ${MAX_CELLS} cells`);
  }
  if (!Array.isArray(cells) && !ArrayBuffer.isView(cells)) throw new TypeError('cells must be an array of cell indexes');
  if (!Number.isInteger(cells.length)) throw new TypeError('cells must be an array of cell indexes');
  if (cells.length > width * height) throw new RangeError('cells cannot contain more entries than the image has pixels');
  const values = Array.from(cells);
  const seen = new Set();
  for (const cell of values) {
    if (!Number.isInteger(cell)) throw new TypeError('cell indexes must be integers');
    if (cell < 0 || cell >= width * height) throw new RangeError('cell index is outside the image');
    if (seen.has(cell)) throw new RangeError('cells cannot contain duplicate indexes');
    seen.add(cell);
  }
  return { values, seen };
}

function isEightConnected(values, seen, width) {
  if (!values.length) return false;
  const visited = new Set([values[0]]);
  const queue = [values[0]];
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head], x = cell % width, y = Math.floor(cell / width);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0) continue;
      const neighbor = ny * width + nx;
      if (seen.has(neighbor) && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return visited.size === values.length;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function bresenhamX(x0, y0, x1, y1) {
  const path = [];
  const dx = x1 - x0, dy = Math.abs(y1 - y0), stepY = y0 <= y1 ? 1 : -1;
  let error = 2 * dy - dx, y = y0;
  for (let x = x0; x <= x1; x++) {
    path.push(y);
    if (error >= 0) { y += stepY; error -= 2 * dx; }
    error += 2 * dy;
  }
  return path;
}

/**
 * Fit a thin, nearly straight 8-connected set of pixels to a one-pixel
 * Bresenham staircase. This is geometric only; it does not alter color data.
 */
export function fitDigitalLine(cells, width, height) {
  const { values, seen } = validate(cells, width, height);
  if (values.length < MIN_SPAN || !isEightConnected(values, seen, width)) return null;

  let minX = width, maxX = -1, minY = height, maxY = -1;
  for (const cell of values) {
    const x = cell % width, y = Math.floor(cell / width);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const useX = maxX - minX >= maxY - minY;
  const minMajor = useX ? minX : minY, maxMajor = useX ? maxX : maxY;
  const minMinor = useX ? minY : minX, maxMinor = useX ? maxY : maxX;
  const span = maxMajor - minMajor + 1;
  if (span < MIN_SPAN) return null;

  const points = values.map((cell) => {
    const x = cell % width, y = Math.floor(cell / width);
    return useX ? [x, y] : [y, x];
  });
  points.sort((a, b) => a[0] - b[0]);
  let priorMajor = points[0][0], maxGap = 1;
  for (let i = 1; i < points.length; i++) {
    if (points[i][0] !== priorMajor) {
      maxGap = Math.max(maxGap, points[i][0] - priorMajor);
      priorMajor = points[i][0];
    }
  }
  if (maxGap > MAX_MAJOR_GAP) return null;

  // Least-squares fit of the minor axis against the longer image axis.
  const meanMajor = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const meanMinor = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  let covariance = 0, variance = 0;
  for (const [major, minor] of points) {
    covariance += (major - meanMajor) * (minor - meanMinor);
    variance += (major - meanMajor) ** 2;
  }
  if (!variance) return null;
  const slope = covariance / variance;
  const intercept = meanMinor - slope * meanMajor;
  const normalizer = Math.sqrt(1 + slope * slope);
  let squaredResidual = 0, maxResidual = 0;
  const perMajorCounts = new Map();
  for (const [major, minor] of points) {
    const residual = Math.abs(minor - (intercept + slope * major)) / normalizer;
    squaredResidual += residual * residual;
    maxResidual = Math.max(maxResidual, residual);
    const count = (perMajorCounts.get(major) ?? 0) + 1;
    if (count > 2) return null;
    perMajorCounts.set(major, count);
  }
  const residual = Math.sqrt(squaredResidual / points.length);
  if (maxResidual > MAX_PERPENDICULAR_RESIDUAL || Math.abs(slope) > 2) return null;

  const minorStart = clamp(Math.round(intercept + slope * minMajor), minMinor, maxMinor);
  const minorEnd = clamp(Math.round(intercept + slope * maxMajor), minMinor, maxMinor);
  const minorPath = bresenhamX(minMajor, minorStart, maxMajor, minorEnd);
  const path = new Uint32Array(minorPath.map((minor, offset) => {
    const major = minMajor + offset;
    return useX ? minor * width + major : major * width + minor;
  }));

  return {
    path,
    sourceCells: new Uint32Array([...values].sort((a, b) => a - b)),
    span,
    residual
  };
}
