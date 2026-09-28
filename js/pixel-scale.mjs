/**
 * Pixel art is usually saved enlarged: every dot becomes an N×N block. This
 * finds N and shrinks the image back to one pixel per dot, but only when the
 * whole image is made of equal, grid-aligned N×N blocks of one exact colour.
 * Anything else (photos, JPEG noise, blurred scaling, a crop that breaks the
 * grid) is left at its original size.
 *
 * Fully transparent pixels count as the same colour whatever their RGB.
 */

const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

/** Smallest size, in dots, an image is shrunk to; a flat block stays readable. */
export const MIN_DOTS = 8;

function samePixel(data, a, b) {
  if (data[a + 3] === 0 && data[b + 3] === 0) return true;
  return data[a] === data[b] && data[a + 1] === data[b + 1] && data[a + 2] === data[b + 2] && data[a + 3] === data[b + 3];
}

/**
 * The block size N of an enlarged image: the largest N that divides the width
 * and the height and at which every colour change falls on the block grid.
 * 1 when the image is already one pixel per dot (or is not pixel art).
 */
export function detectPixelScale({ width, height, data }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || !data || data.length < width * height * 4) return 1;
  let scale = gcd(width, height);
  if (scale === 1) return 1;
  // A colour change between x-1 and x must sit on the grid, so N divides x.
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 1; x < width; x += 1) {
      if (x % scale === 0) continue;
      if (!samePixel(data, (row + x - 1) * 4, (row + x) * 4)) { scale = gcd(scale, x); if (scale === 1) return 1; }
    }
  }
  for (let y = 1; y < height; y += 1) {
    if (y % scale === 0) continue;
    const above = (y - 1) * width; const here = y * width;
    for (let x = 0; x < width; x += 1) {
      if (!samePixel(data, (above + x) * 4, (here + x) * 4)) { scale = gcd(scale, y); if (scale === 1) return 1; break; }
    }
  }
  return scale;
}

/**
 * The block size to shrink by: the detected N, lowered to its largest divisor
 * that keeps at least `minDots` dots on the short side (so a flat or very blocky
 * image does not collapse to a few pixels).
 */
export function reductionScale(image, { minDots = MIN_DOTS } = {}) {
  const detected = detectPixelScale(image);
  const shortSide = Math.min(image.width, image.height);
  for (let scale = detected; scale > 1; scale -= 1) {
    if (detected % scale === 0 && shortSide / scale >= Math.min(minDots, shortSide)) return scale;
  }
  return 1;
}

/** Take the top-left pixel of every scale×scale block. */
export function downscalePixels({ width, height, data }, scale) {
  if (scale <= 1) return { width, height, data };
  const w = width / scale; const h = height / scale;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const from = ((y * scale) * width + x * scale) * 4; const to = (y * w + x) * 4;
      out[to] = data[from]; out[to + 1] = data[from + 1]; out[to + 2] = data[from + 2]; out[to + 3] = data[from + 3];
    }
  }
  return { width: w, height: h, data: out };
}

/** Shrink RGBA pixels to one pixel per dot. Returns the pixels with `scale` and the source size. */
export function normalizePixels(image, options) {
  const scale = reductionScale(image, options);
  const reduced = downscalePixels(image, scale);
  return { ...reduced, scale, sourceWidth: image.width, sourceHeight: image.height };
}

function makeCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function' && typeof document === 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
}

/** RGBA pixels of an image, bitmap or canvas, read without smoothing. */
export function readPixels(source) {
  const width = source.naturalWidth || source.width; const height = source.naturalHeight || source.height;
  const canvas = makeCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('画像を読み込めませんでした。');
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0);
  const { data } = context.getImageData(0, 0, width, height);
  return { width, height, data };
}

/** A canvas holding the pixels. */
export function pixelsToCanvas({ width, height, data }) {
  const canvas = makeCanvas(width, height);
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  return canvas;
}

function canvasToPng(canvas) {
  if (typeof canvas.convertToBlob === 'function') return canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('画像を作れませんでした。'))), 'image/png'));
}

/**
 * Read an image file and bring it back to one pixel per dot.
 * Returns the original file untouched when it is already at 1× (or is not
 * block-scaled pixel art); otherwise a new PNG file of the shrunk image.
 */
export async function normalizePixelFile(file, { createImageBitmapImpl = globalThis.createImageBitmap, minDots } = {}) {
  if (typeof createImageBitmapImpl !== 'function') throw new Error('このブラウザでは画像を確認できません。');
  const bitmap = await createImageBitmapImpl(file);
  let pixels;
  try { pixels = readPixels(bitmap); } finally { bitmap.close?.(); }
  const normalized = normalizePixels(pixels, { minDots });
  if (normalized.scale === 1) return { file, ...normalized };
  const blob = await canvasToPng(pixelsToCanvas(normalized));
  const name = typeof file.name === 'string' && file.name ? file.name.replace(/\.[^.]*$/, '') + '.png' : 'pixel-art.png';
  const out = typeof File === 'function' ? new File([blob], name, { type: 'image/png', lastModified: Date.now() }) : blob;
  return { file: out, ...normalized };
}

/** A short note for the person when an image was shrunk; '' when nothing changed. */
export function scaleNotice({ scale, width, height }) {
  return scale > 1 ? `${scale}倍に拡大された画像だったので、等倍の${width}×${height}pxに戻しました。` : '';
}

/**
 * Show an element holding `dots` columns at a whole number of device pixels per
 * dot, as large as its CSS size allows. Returns that number (0 when the dots do
 * not fit even at 1 device pixel each, and the CSS size is kept).
 */
export function snapToWholePixels(element, dots, { devicePixelRatio = globalThis.devicePixelRatio || 1 } = {}) {
  if (!element || !(dots > 0)) return 0;
  element.style.removeProperty('width');
  const borderBox = globalThis.getComputedStyle?.(element).boxSizing === 'border-box';
  const edge = borderBox ? element.offsetWidth - element.clientWidth : 0;
  const available = element.clientWidth;
  const perDot = Math.floor((available * devicePixelRatio + 0.01) / dots);
  if (perDot < 1) return 0;
  element.style.width = `${(dots * perDot) / devicePixelRatio + edge}px`;
  return perDot;
}

/** Largest whole number of device pixels per dot that fits a box, as a CSS size. */
export function wholePixelFit(dotsWide, dotsHigh, boxWidth, boxHeight, { devicePixelRatio = globalThis.devicePixelRatio || 1 } = {}) {
  const perDot = Math.floor(Math.min((boxWidth * devicePixelRatio + 0.01) / dotsWide, (boxHeight * devicePixelRatio + 0.01) / dotsHigh));
  if (perDot < 1) {
    const scale = Math.min(boxWidth / dotsWide, boxHeight / dotsHigh);
    return { width: dotsWide * scale, height: dotsHigh * scale, perDot: 0 };
  }
  return { width: (dotsWide * perDot) / devicePixelRatio, height: (dotsHigh * perDot) / devicePixelRatio, perDot };
}
