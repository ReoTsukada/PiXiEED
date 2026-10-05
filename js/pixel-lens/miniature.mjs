/** Software tilt-shift on a crop of the original video, before dot sampling.
 * No distance estimate, focus request or colour correction.
 */
export const MINIATURE_PROFILE = Object.freeze({ sharpBand: 0.20, transition: 0.40, sigmaRatio: 0.006, workLongEdge: 512 });

export function miniatureSigma(row, height) {
  const distance = Math.abs((row + 0.5) / height - 0.5);
  const t = Math.max(0, Math.min(1, (distance - MINIATURE_PROFILE.sharpBand / 2) / MINIATURE_PROFILE.transition));
  // Quintic easing has zero first and second derivatives at both ends.
  return height * MINIATURE_PROFILE.sigmaRatio * t * t * t * (10 + t * (-15 + 6 * t));
}

export function miniatureWorkSize(width, height) {
  const scale = Math.min(1, MINIATURE_PROFILE.workLongEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function gaussian(sigma) {
  if (sigma < 0.05) return null;
  const radius = Math.ceil(sigma * 3), weights = new Float64Array(radius * 2 + 1);
  let total = 0;
  for (let k = -radius; k <= radius; k++) total += weights[k + radius] = Math.exp(-k * k / (2 * sigma * sigma));
  for (let k = 0; k < weights.length; k++) weights[k] /= total;
  return { radius, weights };
}

/** Scratch is reused; returned frames own their pixels and the input stays intact. */
export function createMiniatureProcessor() {
  let cachedHeight = 0, kernels = [], horizontal = new Float32Array(0);
  return function applyMiniature(image, enabled = false) {
    // OFF is the exact original object: no allocation and no changed pixels.
    if (!enabled) return image;
    const { width, height, data } = image;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data?.length !== width * height * 4) throw new TypeError('Invalid camera frame');
    if (height !== cachedHeight) {
      kernels = Array.from({ length: height }, (_, y) => gaussian(miniatureSigma(y, height)));
      cachedHeight = height;
    }
    const count = width * height * 3;
    if (horizontal.length !== count) horizontal = new Float32Array(count);
    for (let y = 0; y < height; y++) {
      const kernel = kernels[y];
      for (let x = 0; x < width; x++) {
        const dest = (y * width + x) * 3, src = (y * width + x) * 4;
        if (!kernel) { horizontal[dest] = data[src]; horizontal[dest + 1] = data[src + 1]; horizontal[dest + 2] = data[src + 2]; continue; }
        let r = 0, g = 0, b = 0;
        for (let k = -kernel.radius; k <= kernel.radius; k++) {
          // Extend edge pixels instead of introducing transparent/dark borders.
          const i = (y * width + Math.max(0, Math.min(width - 1, x + k))) * 4, w = kernel.weights[k + kernel.radius];
          r += data[i] * w; g += data[i + 1] * w; b += data[i + 2] * w;
        }
        horizontal[dest] = r; horizontal[dest + 1] = g; horizontal[dest + 2] = b;
      }
    }
    const output = new Uint8ClampedArray(data);
    for (let y = 0; y < height; y++) {
      const kernel = kernels[y];
      // Keep the sharp band byte-for-byte, including alpha.
      if (!kernel) continue;
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0;
        for (let k = -kernel.radius; k <= kernel.radius; k++) {
          const i = (Math.max(0, Math.min(height - 1, y + k)) * width + x) * 3, w = kernel.weights[k + kernel.radius];
          r += horizontal[i] * w; g += horizontal[i + 1] * w; b += horizontal[i + 2] * w;
        }
        const dest = (y * width + x) * 4;
        output[dest] = Math.round(r); output[dest + 1] = Math.round(g); output[dest + 2] = Math.round(b);
      }
    }
    return { width, height, data: output };
  };
}
