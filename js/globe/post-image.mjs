/** Client-side checks for a pixel-art upload. Same limits as the production create-post function. */

export const PIXEL_LIMITS = Object.freeze({ maxBytes: 512 * 1024, minSize: 8, maxSize: 128, maxColors: 512, mime: ['image/png', 'image/webp'] });

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('画像を読み込めませんでした。'));
    reader.readAsDataURL(file);
  });
}

export async function inspectPixelImage(file) {
  if (!file) throw new Error('画像を選んでください。');
  if (!PIXEL_LIMITS.mime.includes(file.type)) throw new Error('PNG か WebP のドット絵を選んでください。（写真や JPEG は投稿できません）');
  if (file.size > PIXEL_LIMITS.maxBytes) throw new Error(`画像が大きすぎます（${Math.ceil(file.size / 1024)}KB）。512KB 以内にしてください。`);
  if (typeof createImageBitmap !== 'function') throw new Error('このブラウザでは画像を確認できません。');
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = bitmap;
    const { minSize, maxSize, maxColors } = PIXEL_LIMITS;
    if (width < minSize || height < minSize) throw new Error(`小さすぎます（${width}×${height}px）。${minSize}px 以上にしてください。`);
    if (width > maxSize || height > maxSize) throw new Error(`大きすぎます（${width}×${height}px）。${maxSize}px 以内のドット絵にしてください。拡大した画像は等倍に戻してから選んでください。`);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, width, height).data;
    const colors = new Set();
    let transparent = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] === 0) transparent += 1;
      colors.add((pixels[index] << 24 | pixels[index + 1] << 16 | pixels[index + 2] << 8 | pixels[index + 3]) >>> 0);
      if (colors.size > maxColors) throw new Error(`色数が多すぎます。${maxColors} 色以内のドット絵にしてください。（写真は投稿できません）`);
    }
    return { dataUrl: await readAsDataUrl(file), mimeType: file.type, size: file.size, width, height, colorCount: colors.size, hasTransparency: transparent > 0 };
  } finally {
    bitmap.close?.();
  }
}

/** Largest whole-number scale that fits the box, so every pixel stays a crisp square. */
export function integerScale(width, height, boxWidth, boxHeight) {
  return Math.max(1, Math.floor(Math.min(boxWidth / width, boxHeight / height)));
}
