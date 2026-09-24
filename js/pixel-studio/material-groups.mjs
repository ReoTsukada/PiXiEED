// Color families supplement an object mask; these are not semantic face/hair labels.
// Every family ID retains its original object ID, including IDs above 2^28.
export function materialKey(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), chroma = max - min;
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (chroma < Math.max(10, max * 0.12) || max < 26) return light < 56 ? 0 : light < 160 ? 1 : 2;
  let hue = max === r ? (g - b) / chroma : max === g ? 2 + (b - r) / chroma : 4 + (r - g) / chroma;
  hue = (hue * 60 + 375) % 360;
  // A dark chromatic material (e.g. brown hair) gets its own ramp, rather than
  // consuming the skin ramp simply because both share a warm hue.
  return 3 + Math.floor(hue / 60) + (chroma / max >= 0.5 ? 6 : 0) + (light < 52 ? 12 : 0);
}

export function classifyMaterials(rgb, objects, previous = null, changedCells = null, colorKey = materialKey, keyStride = 32) {
  const materials = new Float64Array(objects.length);
  const referenceRgb = new Uint8Array(rgb);
  let held = 0;
  for (let cell = 0; cell < objects.length; cell++) {
    const p = cell * 3;
    const key = colorKey(rgb[p], rgb[p + 1], rgb[p + 2]);
    materials[cell] = objects[cell] * keyStride + key;
    const reference = previous?.materialReferenceRgb ?? previous?.sourceRgb;
    if (previous && !changedCells?.[cell] && previous.objects[cell] === objects[cell] &&
        Math.max(Math.abs(rgb[p] - reference[p]), Math.abs(rgb[p + 1] - reference[p + 1]), Math.abs(rgb[p + 2] - reference[p + 2])) <= 6) {
      materials[cell] = previous.labels[cell];
      referenceRgb[p] = reference[p]; referenceRgb[p + 1] = reference[p + 1]; referenceRgb[p + 2] = reference[p + 2];
      held++;
    }
  }
  return { materials, held, referenceRgb };
}

export function smoothMaterialLight(rgb, materials, width, height, protectedCells = null, lightOf = null) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 512 * 512) {
    throw new RangeError('width and height must contain between 1 and 262144 cells');
  }
  const cellCount = width * height;
  if (!(rgb instanceof Uint8Array || rgb instanceof Uint8ClampedArray) || rgb.length !== cellCount * 3) {
    throw new TypeError('rgb must contain one RGB triplet per cell');
  }
  if (!(materials instanceof Float64Array || materials instanceof Uint32Array) || materials.length !== cellCount) {
    throw new TypeError('materials must be a Float64Array or Uint32Array matching width * height');
  }
  if (protectedCells !== null && protectedCells !== undefined) {
    if (!(protectedCells instanceof Uint8Array || protectedCells instanceof Uint8ClampedArray) || protectedCells.length !== cellCount) {
      throw new TypeError('protectedCells must be a byte array matching width * height');
    }
    for (let i = 0; i < protectedCells.length; i++) {
      if (protectedCells[i] !== 0 && protectedCells[i] !== 1) throw new RangeError(`protectedCells value at ${i} must be 0 or 1`);
    }
  }
  const light = new Float32Array(materials.length), smoothed = new Float32Array(materials.length);
  for (let cell = 0; cell < light.length; cell++) {
    const p = cell * 3;
    light[cell] = lightOf ? lightOf(rgb[p], rgb[p + 1], rgb[p + 2]) : 0.2126 * rgb[p] + 0.7152 * rgb[p + 1] + 0.0722 * rgb[p + 2];
  }
  // Only the tone-selection signal is smoothed, never output RGB or object IDs.
  // Strong edges and different materials are excluded, so no intermediate
  // fringe colors or antialiasing are introduced at the final boundary.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const cell = y * width + x, center = light[cell];
    if (protectedCells?.[cell]) {
      smoothed[cell] = center;
      continue;
    }
    let sum = center * 2, weight = 2;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if ((!ox && !oy) || x + ox < 0 || x + ox >= width || y + oy < 0 || y + oy >= height) continue;
      const n = (y + oy) * width + x + ox;
      if (protectedCells?.[n]) continue;
      if (materials[n] !== materials[cell] || Math.abs(light[n] - center) > 18) continue;
      sum += light[n]; weight++;
    }
    smoothed[cell] = sum / weight;
  }
  return smoothed;
}
