/** Deterministic pixel-region colour merge helpers. Inputs are dot-resolution RGBA frames. */
function dimensions(frame, label) {
  if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width <= 0 || frame.height <= 0 || !frame.data || frame.data.length !== frame.width * frame.height * 4) throw new TypeError(`${label} must have positive integer dimensions and exactly width*height*4 RGBA values`);
  return { width: frame.width, height: frame.height, size: frame.width * frame.height };
}
function rgb(value, label) {
  const channels = Array.isArray(value) || ArrayBuffer.isView(value) ? [value[0], value[1], value[2]] : value && typeof value === 'object' ? [value.r, value.g, value.b] : null;
  if (!channels || channels.some((v) => !Number.isFinite(v) || v < 0 || v > 255)) throw new TypeError(`${label} must contain RGB channels in the range 0..255`);
  return channels;
}
function checkedPalette(palette) { if (!Array.isArray(palette) || !palette.length) throw new TypeError('palette must be a non-empty array'); return palette.map((c, i) => rgb(c, `palette[${i}]`)); }
function checkCoordinates(x, y, width, height) { if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) throw new RangeError('seed coordinates must be integer pixels inside the frame'); }
function checkPaletteIndex(index, palette, label) { if (!Number.isInteger(index) || index < 0 || index >= palette.length) throw new RangeError(`${label} must refer to an entry in palette`); }
function colorAt(data, offset) { return [data[offset], data[offset + 1], data[offset + 2]]; }
function rgbDistanceSquared(a, b) { const r = a[0] - b[0]; const g = a[1] - b[1]; const bl = a[2] - b[2]; return r * r + g * g + bl * bl; }
function toOklab(red, green, blue) {
  const linear = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const r = linear(red); const g = linear(green); const b = linear(blue);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function chroma(lab) { return Math.hypot(lab[1], lab[2]); }
function labDistanceSquared(a, b, ignoreHue = false) { const l = a[0] - b[0]; const aa = ignoreHue ? 0 : a[1] - b[1]; const bb = ignoreHue ? 0 : a[2] - b[2]; return l * l + aa * aa + bb * bb; }

/** Return nearest palette entry by RGB distance, or -1 when the coordinates are outside the frame. */
export function pickPaletteIndex(frame, palette, x, y) {
  const { width, height } = dimensions(frame, 'frame'); const colors = checkedPalette(palette);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) return -1;
  const pixel = colorAt(frame.data, (y * width + x) * 4); let best = -1; let bestDistance = Infinity;
  for (let i = 0; i < colors.length; i += 1) { const distance = rgbDistanceSquared(pixel, colors[i]); if (distance < bestDistance) { best = i; bestDistance = distance; } }
  return best;
}

/** Build a conservative 4-connected source surface and merge rendered palette pixels in it. */
export function mergeRegionColors({ source, rendered, palette, seed, sourceIndex, targetIndex, mode, strength = 50 } = {}) {
  const src = dimensions(source, 'source'); const out = dimensions(rendered, 'rendered');
  if (src.width !== out.width || src.height !== out.height) throw new RangeError('source and rendered dimensions must match');
  const colors = checkedPalette(palette); checkPaletteIndex(sourceIndex, colors, 'sourceIndex'); checkPaletteIndex(targetIndex, colors, 'targetIndex');
  if (!seed || typeof seed !== 'object') throw new TypeError('seed must contain x and y coordinates');
  checkCoordinates(seed.x, seed.y, src.width, src.height);
  if (mode !== 'color' && mode !== 'surface') throw new TypeError("mode must be 'color' or 'surface'");
  if (!Number.isFinite(strength) || strength < 0 || strength > 100) throw new RangeError('strength must be in the range 0..100');
  const data = new Uint8ClampedArray(rendered.data); const mask = new Uint8Array(src.size);
  const seedOffset = (seed.y * src.width + seed.x) * 4;
  if (source.data[seedOffset + 3] === 0) return { data, mask, changedPixels: 0, selectedPixels: 0 };
  const seedLab = toOklab(...colorAt(source.data, seedOffset));
  const neutralSeed = chroma(seedLab) < 0.055; const amount = strength / 100;
  const seedLimit = 0.075 + amount * 0.145; const lightnessLimit = 0.075 + amount * 0.15;
  const stepLimit = neutralSeed ? 0.035 + amount * 0.06 : 0.028 + amount * 0.02;
  const stepLightnessLimit = neutralSeed ? 0.03 + amount * 0.045 : 0.024 + amount * 0.016;
  const seedLimit2 = seedLimit * seedLimit; const stepLimit2 = stepLimit * stepLimit;
  const labs = new Array(src.size); const allowed = new Uint8Array(src.size);
  for (let p = 0; p < src.size; p += 1) {
    const i = p * 4; if (source.data[i + 3] === 0) continue;
    const lab = toOklab(source.data[i], source.data[i + 1], source.data[i + 2]); labs[p] = lab;
    const neutralPair = neutralSeed && chroma(lab) < 0.075;
    if (Math.abs(lab[0] - seedLab[0]) <= lightnessLimit && labDistanceSquared(lab, seedLab, neutralPair) <= seedLimit2) allowed[p] = 1;
  }
  // A chromatic sky often has a smooth, directional lightness gradient. When that local
  // gradient reverses sharply at a roof or ridge, stop the flood even if the new colour
  // remains close to the seed. Neutral surfaces keep the wider shadow-merging behavior.
  let gradientX = 0; let gradientY = 0; let seedEdgeMagnitude = 0;
  const edgeRadius = Math.max(1, Math.min(2, Math.floor(Math.min(src.width, src.height) * 0.02)));
  if (!neutralSeed) {
    const radius = Math.max(1, Math.min(4, Math.floor(Math.min(src.width, src.height) * 0.03)));
    const x0 = Math.max(0, seed.x - radius); const x1 = Math.min(src.width - 1, seed.x + radius);
    const y0 = Math.max(0, seed.y - radius); const y1 = Math.min(src.height - 1, seed.y + radius);
    if (x1 > x0) {
      const left = labs[seed.y * src.width + x0]; const right = labs[seed.y * src.width + x1];
      if (left && right) gradientX = (right[0] - left[0]) / (x1 - x0);
    }
    if (y1 > y0) {
      const top = labs[y0 * src.width + seed.x]; const bottom = labs[y1 * src.width + seed.x];
      if (top && bottom) gradientY = (bottom[0] - top[0]) / (y1 - y0);
    }
    const spanContrast = (x0, y0, x1, y1) => {
      if (x0 < 0 || y0 < 0 || x1 >= src.width || y1 >= src.height) return 0;
      const a = labs[y0 * src.width + x0]; const b = labs[y1 * src.width + x1];
      return a && b ? Math.sqrt(labDistanceSquared(a, b)) : 0;
    };
    seedEdgeMagnitude = Math.max(
      spanContrast(seed.x - edgeRadius, seed.y, seed.x + edgeRadius, seed.y),
      spanContrast(seed.x, seed.y - edgeRadius, seed.x, seed.y + edgeRadius)
    );
  }
  const edgeLimit = Math.min(0.03, Math.max(0.015, seedEdgeMagnitude * 2.5) + amount * 0.005);
  const edgeLimit2 = edgeLimit * edgeLimit;
  const crossesStrongEdge = (p, q) => {
    if (neutralSeed) return false;
    const dx = q === p - 1 ? -1 : q === p + 1 ? 1 : 0;
    const dy = q === p - src.width ? -1 : q === p + src.width ? 1 : 0;
    for (let side = -1; side <= 1; side += 1) {
      const beforeX = p % src.width - dx * edgeRadius - dy * side;
      const beforeY = Math.floor(p / src.width) - dy * edgeRadius + dx * side;
      const afterX = q % src.width + dx * edgeRadius - dy * side;
      const afterY = Math.floor(q / src.width) + dy * edgeRadius + dx * side;
      if (beforeX < 0 || beforeY < 0 || afterX < 0 || afterY < 0 || beforeX >= src.width || afterX >= src.width || beforeY >= src.height || afterY >= src.height) continue;
      const before = labs[beforeY * src.width + beforeX]; const after = labs[afterY * src.width + afterX];
      if (before && after && labDistanceSquared(before, after) > edgeLimit2) return true;
    }
    return false;
  };
  const start = seed.y * src.width + seed.x; const queue = new Int32Array(src.size); let head = 0; let tail = 0;
  if (allowed[start]) { mask[start] = 1; queue[tail++] = start; }
  while (head < tail) {
    const p = queue[head++]; const x = p % src.width; const y = Math.floor(p / src.width);
    const ns = [x > 0 ? p - 1 : -1, x + 1 < src.width ? p + 1 : -1, y > 0 ? p - src.width : -1, y + 1 < src.height ? p + src.width : -1];
    for (const q of ns) {
      if (q < 0 || mask[q] || !allowed[q]) continue;
      const a = labs[p]; const b = labs[q]; const neutralPair = neutralSeed && chroma(a) < 0.075 && chroma(b) < 0.075;
      const deltaLightness = b[0] - a[0];
      if (Math.abs(deltaLightness) > stepLightnessLimit || labDistanceSquared(a, b, neutralPair) > stepLimit2) continue;
      if (crossesStrongEdge(p, q)) continue;
      if (!neutralSeed) {
        const expectedSlope = q === p - 1 ? -gradientX : q === p + 1 ? gradientX : q === p - src.width ? -gradientY : gradientY;
        if (Math.abs(expectedSlope) > 0.0008 && deltaLightness * expectedSlope < -0.000004) continue;
      }
      mask[q] = 1; queue[tail++] = q;
    }
  }
  const from = colors[sourceIndex]; const to = colors[targetIndex]; let changedPixels = 0; let selectedPixels = 0;
  for (let p = 0; p < src.size; p += 1) {
    if (!mask[p]) continue; selectedPixels += 1; const i = p * 4;
    if (mode === 'color' && rgbDistanceSquared(colorAt(rendered.data, i), from) !== 0) continue;
    if (data[i] === to[0] && data[i + 1] === to[1] && data[i + 2] === to[2]) continue;
    data[i] = to[0]; data[i + 1] = to[1]; data[i + 2] = to[2]; changedPixels += 1;
  }
  return { data, mask, changedPixels, selectedPixels };
}
