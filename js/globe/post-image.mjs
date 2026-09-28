/** Client-side checks for a pixel-art upload. Accepted files are normalized to PNG for server verification. */

import { normalizePixels, pixelsToCanvas, readPixels } from '../pixel-scale.mjs?v=20260928-pixel-scale-1';

export const PIXEL_LIMITS = Object.freeze({ maxBytes: 512 * 1024, minSize: 8, maxSize: 512, maxColors: 128, mime: ['image/png', 'image/webp'] });

/** Enlarged pixel art is read up to this size before it is shrunk back to one pixel per dot. */
export const SOURCE_LIMITS = Object.freeze({ maxBytes: 8 * 1024 * 1024, maxSize: 4096 });

/**
 * Check a pixel-art upload. Art saved enlarged (every dot an N×N block) is
 * detected and shrunk back to one pixel per dot first; `keepScale` skips that
 * for images whose size is already fixed elsewhere (a puzzle's own PNG).
 */
export async function inspectPixelImage(file, { keepScale = false } = {}) {
  if (!file) throw new Error('画像を選んでください。');
  if (!PIXEL_LIMITS.mime.includes(file.type)) throw new Error('PNG か WebP のドット絵を選んでください。（写真や JPEG は投稿できません）');
  const byteLimit = keepScale ? PIXEL_LIMITS.maxBytes : SOURCE_LIMITS.maxBytes;
  if (file.size > byteLimit) throw new Error(`画像が大きすぎます（${Math.ceil(file.size / 1024)}KB）。${Math.round(byteLimit / 1024)}KB 以内にしてください。`);
  if (typeof createImageBitmap !== 'function') throw new Error('このブラウザでは画像を確認できません。');
  const bitmap = await createImageBitmap(file);
  let source;
  try {
    if (!keepScale && (bitmap.width > SOURCE_LIMITS.maxSize || bitmap.height > SOURCE_LIMITS.maxSize)) throw new Error(`大きすぎます（${bitmap.width}×${bitmap.height}px）。`);
    source = readPixels(bitmap);
  } finally {
    bitmap.close?.();
  }
  const image = keepScale ? { ...source, scale: 1, sourceWidth: source.width, sourceHeight: source.height } : normalizePixels(source, { minDots: PIXEL_LIMITS.minSize });
  const { width, height, data: pixels } = image;
  const { minSize, maxSize, maxColors } = PIXEL_LIMITS;
  if (width < minSize || height < minSize) throw new Error(`小さすぎます（${width}×${height}px）。${minSize}px 以上にしてください。`);
  if (width > maxSize || height > maxSize) throw new Error(`大きすぎます（${width}×${height}px）。${maxSize}px 以内のドット絵にしてください。`);
  const colors = new Set();
  let transparent = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) transparent += 1;
    colors.add((pixels[index] << 24 | pixels[index + 1] << 16 | pixels[index + 2] << 8 | pixels[index + 3]) >>> 0);
    if (colors.size > maxColors) throw new Error(`色数が多すぎます。${maxColors} 色以内のドット絵にしてください。（写真は投稿できません）`);
  }
  const dataUrl = pixelsToCanvas(image).toDataURL('image/png');
  if (!dataUrl.startsWith('data:image/png;base64,')) throw new Error('投稿用のPNGを作れませんでした。');
  const base64 = dataUrl.slice('data:image/png;base64,'.length);
  const size = Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (size > PIXEL_LIMITS.maxBytes) throw new Error('投稿用PNGが512KBを超えました。画像を小さくしてから選んでください。');
  return { dataUrl, mimeType: 'image/png', size, width, height, colorCount: colors.size, hasTransparency: transparent > 0, scale: image.scale, sourceWidth: image.sourceWidth, sourceHeight: image.sourceHeight };
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
