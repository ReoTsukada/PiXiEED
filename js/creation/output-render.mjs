/** Resize one RGBA raster with nearest-neighbor sampling, leaving the source untouched. */
export function resizeRgbaNearest(frame, width, height, { maxPixels = 16_777_216, maxEdge = 8192 } = {}) {
  if (!frame || !Number.isSafeInteger(frame.width) || !Number.isSafeInteger(frame.height)
      || frame.width < 1 || frame.height < 1 || !ArrayBuffer.isView(frame.data)
      || frame.data.BYTES_PER_ELEMENT !== 1 || frame.data.length !== frame.width * frame.height * 4) {
    throw new TypeError('画像データを確認できません。');
  }
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
      || width > maxEdge || height > maxEdge || width * height > maxPixels) {
    throw new RangeError('出力サイズが上限を超えています。幅と高さを小さくしてください。');
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(frame.height - 1, Math.floor((y + 0.5) * frame.height / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(frame.width - 1, Math.floor((x + 0.5) * frame.width / width));
      const sourceOffset = (sourceY * frame.width + sourceX) * 4;
      data.set(frame.data.subarray(sourceOffset, sourceOffset + 4), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}
