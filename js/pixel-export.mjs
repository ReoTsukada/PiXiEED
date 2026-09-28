/**
 * Saving pixel art out of PiXiEED, the same way in every tool.
 *
 * Pictures leave PiXiEED enlarged: each dot becomes an integer block of pixels (no smoothing), so a
 * 16×16 drawing arrives as a crisp 2048×2048 PNG that looks right in any photo app or SNS. PiXiEED
 * itself reads the original dot size stored in the PNG. Re-encoded images without that information
 * use exact repeated pixel blocks to estimate the dot grid instead.
 *
 * On phones the file goes to the share sheet (so it can be saved to Photos); elsewhere it downloads.
 */
import { withPixelPngMetadata } from './pixel-png-metadata.mjs?rev=20260928-pixel-roundtrip-1';
export const EXPORT_LONG_EDGE = 2048;
export const EXPORT_MAX_EDGE = 4096;

/** The integer enlargement that brings the long edge to about `longEdge` (never below 1×). */
export function exportScale(width, height, longEdge = EXPORT_LONG_EDGE) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError('invalid image size');
  return Math.max(1, Math.floor(longEdge / Math.max(width, height)));
}

/** RGBA pixels → an enlarged canvas (nearest-neighbour). */
export function enlargedCanvas({ width, height, data }, { scale = exportScale(width, height), background = null, documentRef = globalThis.document } = {}) {
  if (![width, height, scale].every(Number.isSafeInteger) || width < 1 || height < 1 || scale < 1 || width * scale > EXPORT_MAX_EDGE || height * scale > EXPORT_MAX_EDGE || !data || data.length !== width * height * 4) throw new RangeError('invalid image size or scale');
  const small = documentRef.createElement('canvas'); small.width = width; small.height = height;
  small.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  const big = documentRef.createElement('canvas'); big.width = width * scale; big.height = height * scale;
  const context = big.getContext('2d'); context.imageSmoothingEnabled = false;
  if (background) { context.fillStyle = background; context.fillRect(0, 0, big.width, big.height); }
  context.drawImage(small, 0, 0, big.width, big.height);
  return big;
}

export function canvasToPng(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNGを作れませんでした'))), 'image/png'));
}

/** Enlarged PNG of RGBA pixels. Returns { blob, width, height, scale }. */
export async function enlargedPng(image, options = {}) {
  const canvas = enlargedCanvas(image, options);
  try {
    const width = canvas.width; const height = canvas.height; const scale = width / image.width;
    const blob = await withPixelPngMetadata(await canvasToPng(canvas), { width: image.width, height: image.height, scale });
    return { blob, width, height, scale };
  } finally { canvas.width = 1; canvas.height = 1; }
}

const touchFirst = () => globalThis.matchMedia?.('(pointer: coarse)')?.matches === true;

/**
 * Hand a finished file to the person: the share sheet on phones (when it can take files), a download elsewhere.
 * Resolves 'shared', 'downloaded' or 'cancelled'.
 */
export async function saveFile(blob, filename, { navigatorRef = globalThis.navigator, documentRef = globalThis.document, preferShare = touchFirst() } = {}) {
  const type = blob.type || 'application/octet-stream';
  if (preferShare && typeof navigatorRef?.share === 'function' && typeof globalThis.File === 'function') {
    const file = new File([blob], filename, { type });
    if (navigatorRef.canShare?.({ files: [file] })) {
      try { await navigatorRef.share({ files: [file] }); return 'shared'; }
      catch (error) { if (error?.name === 'AbortError') return 'cancelled'; }
    }
  }
  const url = URL.createObjectURL(blob);
  const link = documentRef.createElement('a'); link.href = url; link.download = filename; link.hidden = true;
  documentRef.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
}
