// Keep the captured grid up to 256px. Quantize only when the capture exceeds
// the map's 128-colour admission limit; its saved PNG is unaffected.
export function cameraPostPixels(frame, maxSize = 256) {
  if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) ||
      frame.width < 1 || frame.height < 1 || frame.data?.length !== frame.width * frame.height * 4) {
    throw new Error('撮影画像を確認できませんでした。');
  }
  const scale = Math.min(1, maxSize / Math.max(frame.width, frame.height));
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  const colors = new Set();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const source = (Math.min(frame.height - 1, Math.floor(y * frame.height / height)) * frame.width +
      Math.min(frame.width - 1, Math.floor(x * frame.width / width))) * 4;
    const target = (y * width + x) * 4;
    data[target] = frame.data[source];
    data[target + 1] = frame.data[source + 1];
    data[target + 2] = frame.data[source + 2];
    data[target + 3] = 255;
    colors.add(`${data[target]},${data[target + 1]},${data[target + 2]}`);
  }
  if (colors.size > 128) {
    for (let i = 0; i < data.length; i += 4) {
      // 2 red bits, 3 green bits, 2 blue bits = 128 stable colours.
      data[i] = Math.round((data[i] >> 6) * 255 / 3);
      data[i + 1] = Math.round((data[i + 1] >> 5) * 255 / 7);
      data[i + 2] = Math.round((data[i + 2] >> 6) * 255 / 3);
    }
  }
  return { width, height, data };
}

export function cameraPostDataUrl(frame) {
  const canvas = document.createElement('canvas');
  for (const maxSize of [256, 192, 128, 64]) {
    const pixels = cameraPostPixels(frame, maxSize);
    canvas.width = pixels.width;
    canvas.height = pixels.height;
    canvas.getContext('2d').putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 0, 0);
    const dataUrl = canvas.toDataURL('image/png');
    if ((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4 <= 512 * 1024) return dataUrl;
  }
  throw new Error('画像が大きすぎます。色数を減らして撮り直してください。');
}
