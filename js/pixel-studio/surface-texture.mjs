const MAX_CELLS = 512 * 512;
const WINDOW = 5;
const WINDOW_CELLS = WINDOW * WINDOW;
const MAX_CHANNEL_SPREAD = 48;
const MAX_CHROMA_DELTA = 16;
const MAX_DIRECTIONAL_STEP = 8;

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
  if (protectedCells) for (let cell = 0; cell < count; cell++) {
    if (protectedCells[cell] !== 0 && protectedCells[cell] !== 1) {
      throw new RangeError(`protectedCells value at ${cell} must be 0 or 1`);
    }
  }
  return count;
}

function isSafeWindow(rgb, objects, protectedCells, width, x, y, indices, sums) {
  const centerCell = y * width + x;
  const centerOffset = centerCell * 3;
  const owner = objects[centerCell];
  let minimumR = 255, minimumG = 255, minimumB = 255;
  let maximumR = 0, maximumG = 0, maximumB = 0;
  sums[0] = 0; sums[1] = 0; sums[2] = 0;

  let slot = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const cell = (y + dy) * width + x + dx;
    if (objects[cell] !== owner || protectedCells?.[cell]) return false;
    const offset = cell * 3;
    const r = rgb[offset], g = rgb[offset + 1], b = rgb[offset + 2];
    indices[slot++] = offset;
    sums[0] += r; sums[1] += g; sums[2] += b;
    if (r < minimumR) minimumR = r;
    if (g < minimumG) minimumG = g;
    if (b < minimumB) minimumB = b;
    if (r > maximumR) maximumR = r;
    if (g > maximumG) maximumG = g;
    if (b > maximumB) maximumB = b;
  }

  // Owner and protection checks above still run for flat windows; skip all later
  // analysis and representative-color search when the source is exactly uniform.
  if (minimumR === maximumR && minimumG === maximumG && minimumB === maximumB) return 1;

  // Reject strong color variation before the more expensive shape analysis.
  if (maximumR - minimumR > MAX_CHANNEL_SPREAD || maximumG - minimumG > MAX_CHANNEL_SPREAD ||
      maximumB - minimumB > MAX_CHANNEL_SPREAD) return 0;

  // Keep differing hues and coherent directional edges out of surface cleanup.
  let lightSum = 0, lightSquareSum = 0;
  let left = 0, right = 0, top = 0, bottom = 0;
  const centerR = rgb[centerOffset], centerG = rgb[centerOffset + 1], centerB = rgb[centerOffset + 2];
  const centerMean = (centerR + centerG + centerB) / 3;
  const centerCr = centerR - centerMean, centerCg = centerG - centerMean, centerCb = centerB - centerMean;
  for (let i = 0; i < WINDOW_CELLS; i++) {
    const offset = indices[i], r = rgb[offset], g = rgb[offset + 1], b = rgb[offset + 2];
    const mean = (r + g + b) / 3;
    if (Math.max(Math.abs(centerCr - (r - mean)), Math.abs(centerCg - (g - mean)),
      Math.abs(centerCb - (b - mean))) > MAX_CHROMA_DELTA) return 0;
    const light = (rgb[offset] + rgb[offset + 1] + rgb[offset + 2]) / 3;
    lightSum += light;
    lightSquareSum += light * light;
    const row = (i / WINDOW) | 0, col = i % WINDOW;
    if (col < 2) left += light;
    if (col > 2) right += light;
    if (row < 2) top += light;
    if (row > 2) bottom += light;
  }
  const lightMean = lightSum / WINDOW_CELLS;
  const lightStdDev = Math.sqrt(Math.max(0, lightSquareSum / WINDOW_CELLS - lightMean * lightMean));
  const directionalLimit = Math.max(MAX_DIRECTIONAL_STEP, lightStdDev * 1.3);
  if (Math.abs(left / 10 - right / 10) > directionalLimit ||
      Math.abs(top / 10 - bottom / 10) > directionalLimit) return 0;

  return 2;
}

/**
 * Reduce weak granular variation inside a dense, owner-local surface patch.
 * Every replacement is an RGB sample from the same 5x5 source window.
 */
export function simplifySurfaceTexture({ rgb, objects, protectedCells = null, width, height } = {}) {
  const count = validate({ rgb, objects, protectedCells, width, height });
  const output = new Uint8Array(rgb);
  const surfaceCells = new Uint8Array(count);
  const indices = new Int32Array(WINDOW_CELLS);
  const sums = new Float64Array(3);
  let changedCells = 0;

  for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
    const windowStatus = isSafeWindow(rgb, objects, protectedCells, width, x, y, indices, sums);
    if (!windowStatus) continue;
    const cell = y * width + x;
    surfaceCells[cell] = 1;
    if (windowStatus === 1) continue;

    const meanR = sums[0] / WINDOW_CELLS;
    const meanG = sums[1] / WINDOW_CELLS;
    const meanB = sums[2] / WINDOW_CELLS;
    const centerOffset = cell * 3;
    let bestOffset = -1, bestDistance = Infinity;
    for (let i = 0; i < WINDOW_CELLS; i++) {
      const offset = indices[i];
      const dr = rgb[offset] - meanR, dg = rgb[offset + 1] - meanG, db = rgb[offset + 2] - meanB;
      const distance = dr * dr + dg * dg + db * db;
      if (distance < bestDistance) { bestOffset = offset; bestDistance = distance; }
    }
    if (bestOffset >= 0 && (rgb[centerOffset] !== rgb[bestOffset] ||
        rgb[centerOffset + 1] !== rgb[bestOffset + 1] || rgb[centerOffset + 2] !== rgb[bestOffset + 2])) {
      output[centerOffset] = rgb[bestOffset];
      output[centerOffset + 1] = rgb[bestOffset + 1];
      output[centerOffset + 2] = rgb[bestOffset + 2];
      changedCells++;
    }
  }
  return { rgb: output, surfaceCells, changedCells };
}

/** Hold a stable texture decision until its source neighborhood moves far enough. */
export function createSurfaceTextureStabilizer() {
  let previous = null;
  let stablePrefix = null;
  let prefixStride = 0;

  function reset() { previous = null; }

  function render(input = {}) {
    const { rgb, objects, protectedCells = null, width, height } = input;
    const current = simplifySurfaceTexture(input);
    const count = width * height;
    const sameGeometry = previous && previous.width === width && previous.height === height;
    if (!sameGeometry) {
      prefixStride = width + 1;
      stablePrefix = new Uint32Array(prefixStride * (height + 1));
      previous = {
        width, height,
        anchorRgb: new Uint8Array(rgb),
        objects: new Uint32Array(objects),
        protectedCells: protectedCells ? new Uint8Array(protectedCells) : new Uint8Array(count),
        rgb: new Uint8Array(current.rgb),
        surfaceCells: new Uint8Array(current.surfaceCells)
      };
      return { ...current, heldCells: 0 };
    }

    const output = current.rgb;
    const surfaceCells = current.surfaceCells;
    const nextAnchorRgb = new Uint8Array(previous.anchorRgb);
    const nextProtected = protectedCells ?? null;
    let heldCells = 0, changedCells = current.changedCells;

    // Build a summed-area map of source samples that still match their fixed
    // per-cell anchors. A 5x5 all-stable query is then constant-time per cell.
    const stride = prefixStride;
    stablePrefix.fill(0, 0, stride);
    for (let y = 0; y < height; y++) {
      let rowStable = 0;
      const prefixRow = (y + 1) * stride, previousRow = y * stride;
      stablePrefix[prefixRow] = 0;
      for (let x = 0; x < width; x++) {
        const cell = y * width + x, p = cell * 3;
        const stable = objects[cell] === previous.objects[cell] &&
          (nextProtected?.[cell] ?? 0) === previous.protectedCells[cell] &&
          Math.abs(rgb[p] - previous.anchorRgb[p]) <= 4 &&
          Math.abs(rgb[p + 1] - previous.anchorRgb[p + 1]) <= 4 &&
          Math.abs(rgb[p + 2] - previous.anchorRgb[p + 2]) <= 4;
        rowStable += stable ? 1 : 0;
        stablePrefix[prefixRow + x + 1] = stablePrefix[previousRow + x + 1] + rowStable;
      }
    }

    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const cell = y * width + x, p = cell * 3;
      let hold = x >= 2 && x < width - 2 && y >= 2 && y < height - 2 && !nextProtected?.[cell];
      if (hold) {
        const top = y - 2, left = x - 2, bottom = y + 3, right = x + 3;
        const stableCount = stablePrefix[bottom * stride + right] - stablePrefix[top * stride + right] -
          stablePrefix[bottom * stride + left] + stablePrefix[top * stride + left];
        hold = stableCount === WINDOW_CELLS;
      }
      if (hold) {
        const wasChanged = output[p] !== rgb[p] || output[p + 1] !== rgb[p + 1] || output[p + 2] !== rgb[p + 2];
        const staysChanged = previous.rgb[p] !== rgb[p] || previous.rgb[p + 1] !== rgb[p + 1] || previous.rgb[p + 2] !== rgb[p + 2];
        if (wasChanged !== staysChanged) changedCells += staysChanged ? 1 : -1;
        output[p] = previous.rgb[p]; output[p + 1] = previous.rgb[p + 1]; output[p + 2] = previous.rgb[p + 2];
        surfaceCells[cell] = previous.surfaceCells[cell];
        heldCells++;
      } else {
        nextAnchorRgb[p] = rgb[p]; nextAnchorRgb[p + 1] = rgb[p + 1]; nextAnchorRgb[p + 2] = rgb[p + 2];
      }
    }

    previous = {
      width, height,
      anchorRgb: nextAnchorRgb,
      objects: new Uint32Array(objects),
      protectedCells: nextProtected ? new Uint8Array(nextProtected) : new Uint8Array(count),
      rgb: new Uint8Array(output),
      surfaceCells: new Uint8Array(surfaceCells)
    };
    return { rgb: output, surfaceCells, changedCells: Math.max(0, changedCells), heldCells };
  }

  return { render, reset };
}
