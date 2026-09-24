const MAX_CELLS = 512 * 512;
const NEIGHBORS = [
  [-1, -1], [0, -1], [1, -1], [1, 0],
  [1, 1], [0, 1], [-1, 1], [-1, 0]
];

const light = (rgb, p) => 0.2126 * rgb[p] + 0.7152 * rgb[p + 1] + 0.0722 * rgb[p + 2];
const maxRgbDelta = (rgb, a, b) => Math.max(
  Math.abs(rgb[a] - rgb[b]),
  Math.abs(rgb[a + 1] - rgb[b + 1]),
  Math.abs(rgb[a + 2] - rgb[b + 2])
);

function validate({ rgb, objects, protectedCells, width, height }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > 512 || height > 512 || width * height > MAX_CELLS) {
    throw new RangeError('width and height must form a grid from 1 to 512x512');
  }
  const count = width * height;
  if (!(rgb instanceof Uint8Array) || rgb.length !== count * 3) {
    throw new TypeError('rgb must contain one RGB triplet per cell');
  }
  if (!(objects instanceof Uint32Array) || objects.length !== count) {
    throw new TypeError('objects must contain one object ID per cell');
  }
  if (protectedCells != null && (!(protectedCells instanceof Uint8Array) || protectedCells.length !== count)) {
    throw new TypeError('protectedCells must match width * height');
  }
  if (protectedCells) {
    for (let cell = 0; cell < count; cell++) {
      if (protectedCells[cell] !== 0 && protectedCells[cell] !== 1) {
        throw new RangeError(`protectedCells value at ${cell} must be 0 or 1`);
      }
    }
  }
  return count;
}

/**
 * Replace only weak, isolated same-object light/dark specks with a real nearby
 * sample. Object boundaries, protected details, strong local edges, and line
 * supported samples are kept unchanged.
 */
export function simplifySurfaceSamples({ rgb, objects, protectedCells = null, width, height } = {}) {
  const count = validate({ rgb, objects, protectedCells, width, height });
  const output = new Uint8Array(rgb);
  const neighborCells = new Int32Array(8), neighborLights = new Float32Array(8);
  const sortedLights = new Float32Array(8), closeToCenter = new Uint8Array(8);
  let simplifiedCells = 0;

  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const cell = y * width + x;
    if (protectedCells?.[cell]) continue;
    const center = cell * 3, centerLight = light(rgb, center), object = objects[cell];
    let valid = true, minimumLight = Infinity, maximumLight = -Infinity;
    let brighterSupport = 0, darkerSupport = 0;
    for (let i = 0; i < 8; i++) {
      const [dx, dy] = NEIGHBORS[i];
      const neighbor = (y + dy) * width + x + dx;
      if (objects[neighbor] !== object || protectedCells?.[neighbor]) { valid = false; break; }
      const neighborLight = light(rgb, neighbor * 3);
      neighborCells[i] = neighbor;
      neighborLights[i] = neighborLight;
      sortedLights[i] = neighborLight;
      minimumLight = Math.min(minimumLight, neighborLight);
      maximumLight = Math.max(maximumLight, neighborLight);
      if (neighborLight > centerLight) brighterSupport++;
      if (neighborLight < centerLight) darkerSupport++;
      closeToCenter[i] = Math.abs(neighborLight - centerLight) <= 3 && maxRgbDelta(rgb, center, neighbor * 3) <= 16 ? 1 : 0;
    }
    if (!valid || maximumLight - minimumLight > 18) continue;

    // A neighboring run of near-center samples is evidence of a real thin or
    // curved line, even if most of the surrounding surface lies on one side.
    let lineSupported = false;
    for (let i = 0; i < 8; i++) {
      if (closeToCenter[i] && closeToCenter[(i + 1) % 8]) { lineSupported = true; break; }
    }
    for (let i = 0; i < 4 && !lineSupported; i++) {
      if (closeToCenter[i] && closeToCenter[i + 4]) lineSupported = true;
    }
    if (lineSupported) continue;

    sortedLights.sort();
    const medianLight = (sortedLights[3] + sortedLights[4]) * 0.5;
    const difference = Math.abs(centerLight - medianLight);
    if (difference <= 6 || (centerLight < medianLight ? brighterSupport : darkerSupport) < 5) continue;

    let sample = -1, sampleDistance = Infinity;
    for (let i = 0; i < 8; i++) {
      const distance = Math.abs(neighborLights[i] - medianLight);
      if (distance < sampleDistance) { sample = neighborCells[i]; sampleDistance = distance; }
    }
    const sampleOffset = sample * 3;
    if (sample < 0 || maxRgbDelta(rgb, center, sampleOffset) > 28) continue;
    output[center] = rgb[sampleOffset];
    output[center + 1] = rgb[sampleOffset + 1];
    output[center + 2] = rgb[sampleOffset + 2];
    simplifiedCells++;
  }

  return { rgb: output, simplifiedCells };
}
