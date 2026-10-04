/** Client-side checks for a pixel-art upload. Accepted files are normalized to PNG for server verification. */

import { normalizePixelFile } from '../pixel-scale.mjs?rev=20260929-claude-integration-1';
import { withPixelPngMetadata } from '../pixel-png-metadata.mjs?rev=20260929-claude-integration-1';

export const PIXEL_LIMITS = Object.freeze({ maxBytes: 512 * 1024, minSize: 1, maxSize: 256, maxColors: 128, mime: ['image/png', 'image/webp'] });
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

async function blobBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export async function inspectPixelImage(file, { keepScale = false } = {}) {
  if (!file) throw new Error('画像を選んでください。');
  if (!PIXEL_LIMITS.mime.includes(file.type)) throw new Error('PNG か WebP のドット絵を選んでください。（写真や JPEG は投稿できません）');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('画像ファイルは8MB以内にしてください。');
  const normalized = await normalizePixelFile(file, { keepScale });
  const { width, height, data } = normalized;
  const { minSize, maxSize, maxColors } = PIXEL_LIMITS;
  if (width < minSize || height < minSize) throw new Error(`画像サイズが不正です（${width}×${height}px）。`);
  if (Math.max(width, height) > maxSize) throw new Error(`大きすぎます（${width}×${height}px）。長辺を${maxSize}px以内にしてください。`);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('画像を読み込めませんでした。');
    context.imageSmoothingEnabled = false;
    const imageData = typeof ImageData === 'function'
      ? new ImageData(new Uint8ClampedArray(data), width, height)
      : context.createImageData(width, height);
    if (!(typeof ImageData === 'function')) imageData.data.set(data);
    context.putImageData(imageData, 0, 0);
    const pixels = data;
    const colors = new Set();
    let transparent = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] === 0) transparent += 1;
      colors.add((pixels[index] << 24 | pixels[index + 1] << 16 | pixels[index + 2] << 8 | pixels[index + 3]) >>> 0);
      if (colors.size > maxColors) throw new Error(`色数が多すぎます。${maxColors} 色以内のドット絵にしてください。（写真は投稿できません）`);
    }
    const rawPng = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('投稿用のPNGを作れませんでした。')), 'image/png'));
    const png = await withPixelPngMetadata(rawPng, { width, height, scale: 1 }, { maxBytes: MAX_SOURCE_BYTES });
    if (png.size > PIXEL_LIMITS.maxBytes) throw new Error('投稿用PNGが512KBを超えました。画像を小さくしてから選んでください。');
    const base64 = await blobBase64(png);
    const dataUrl = `data:image/png;base64,${base64}`;
    return { file: png, dataUrl, mimeType: 'image/png', size: png.size, width, height, colorCount: colors.size, hasTransparency: transparent > 0, scale: normalized.scale, sourceWidth: normalized.sourceWidth, sourceHeight: normalized.sourceHeight };
  } finally { canvas.width = canvas.height = 1; }
}

/** Largest whole-number scale that fits the box, so every pixel stays a crisp square. */
export function integerScale(width, height, boxWidth, boxHeight) {
  return Math.max(1, Math.floor(Math.min(boxWidth / width, boxHeight / height)));
}

/** Enlarge small pixels by whole steps; shrink larger art without changing its aspect ratio. */
export function fitPixelImage(width, height, boxWidth, boxHeight) {
  if (![width, height, boxWidth, boxHeight].every((value) => Number.isFinite(value) && value > 0)) throw new TypeError('画像と表示枠のサイズが不正です');
  const availableScale = Math.min(boxWidth / width, boxHeight / height);
  const scale = availableScale >= 1 ? Math.floor(availableScale) : availableScale;
  return { width: width * scale, height: height * scale };
}
