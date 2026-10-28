/** Pixel-art export preparation. Device delivery happens only in the output workspace. */
import { withPixelPngMetadata } from './pixel-png-metadata.mjs?rev=20260928-pixel-roundtrip-1';
import { trackSiteEvent } from './site-analytics.mjs?rev=20261017-analytics-integrity-1';
import { resolveStaticImageLongEdge, STATIC_IMAGE_FREE_LONG_EDGE } from './creation/static-output-policy.mjs?rev=20261024-free-tools-1';
import { isEditorOutput, routeEditorFile, reportOutputError } from './creation/output-router.mjs?rev=20261028-unified-output-1';
export const EXPORT_LONG_EDGE = STATIC_IMAGE_FREE_LONG_EDGE;
export const EXPORT_MAX_EDGE = 4096;
export const EXPORT_MAX_PIXELS = 16 * 1024 * 1024;

export function exportScale(width, height, longEdge = resolveStaticImageLongEdge()) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError('invalid image size');
  return Math.max(1, Math.floor(longEdge / Math.max(width, height)));
}
export function enlargedCanvas({ width, height, data }, { scale = exportScale(width, height), background = null, documentRef = globalThis.document } = {}) {
  if (![width, height, scale].every(Number.isSafeInteger) || width < 1 || height < 1 || scale < 1 || width * scale > EXPORT_MAX_EDGE || height * scale > EXPORT_MAX_EDGE || width * height * scale * scale > EXPORT_MAX_PIXELS || !data || data.length !== width * height * 4) throw new RangeError('invalid image size or scale');
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
export async function enlargedPng(image, options = {}) {
  const canvas = enlargedCanvas(image, options);
  try {
    const width = canvas.width; const height = canvas.height; const scale = width / image.width;
    const blob = await withPixelPngMetadata(await canvasToPng(canvas), { width: image.width, height: image.height, scale });
    return { blob, width, height, scale };
  } finally { canvas.width = 1; canvas.height = 1; }
}
const touchFirst = () => globalThis.matchMedia?.('(pointer: coarse)')?.matches === true;

/** 'staged' is navigation, not a completed download or share. */
export async function saveFile(blob, filename, options = {}) {
  if (isEditorOutput(options.locationRef || globalThis.location)) {
    try { return await routeEditorFile(blob, filename, options); }
    catch (error) { reportOutputError(error, options.documentRef); throw error; }
  }
  const result = await saveFileNow(blob, filename, options);
  if (result !== 'cancelled') {
    const fileType = String(filename).split('.').pop().toLowerCase();
    trackSiteEvent('file_export', { file_type: fileType, method: result, export_status: result === 'shared' ? 'share_handoff' : 'download_started' });
  }
  return result;
}
async function saveFileNow(blob, filename, { navigatorRef = globalThis.navigator, documentRef = globalThis.document, preferShare = touchFirst() } = {}) {
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
