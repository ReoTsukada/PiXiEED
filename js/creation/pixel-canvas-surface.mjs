/** Shared iDRAW-style ImageData renderer for gapless pixel canvases. */
export function createPixelCanvasSurface(canvas, { alpha = true, emptyColor = null } = {}) {
  let context = canvas.getContext('2d', { alpha });
  let image = context.createImageData(canvas.width, canvas.height);
  let lastPalette = null;
  let colors = null;
  const empty = emptyColor === null ? [0, 0, 0, 0] : readColor(emptyColor);

  function resize(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new RangeError('Invalid canvas size');
    canvas.width = width;
    canvas.height = height;
    context = canvas.getContext('2d', { alpha });
    image = context.createImageData(width, height);
  }

  function paint(pixels, palette, changed = null) {
    const { width, height } = image;
    if (pixels.length !== width * height) throw new RangeError('Pixel count does not match canvas size');
    if (palette !== lastPalette) { colors = palette.map(readColor); lastPalette = palette; }
    const indices = changed === null ? pixels.keys() : changed;
    let minX = width; let minY = height; let maxX = -1; let maxY = -1;
    for (const index of indices) {
      if (!Number.isInteger(index) || index < 0 || index >= pixels.length) continue;
      const color = pixels[index] < 0 ? empty : colors[pixels[index]];
      if (!color) throw new RangeError('Pixel palette index is invalid');
      const offset = index * 4;
      image.data[offset] = color[0]; image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2]; image.data[offset + 3] = color[3];
      const x = index % width; const y = Math.floor(index / width);
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    if (maxX >= minX) context.putImageData(image, 0, 0, minX, minY, maxX - minX + 1, maxY - minY + 1);
  }

  return { resize, paint };
}

function readColor(color) {
  if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(color)) throw new TypeError('Invalid pixel color');
  return [Number.parseInt(color.slice(1, 3), 16), Number.parseInt(color.slice(3, 5), 16), Number.parseInt(color.slice(5, 7), 16), color.length === 9 ? Number.parseInt(color.slice(7, 9), 16) : 255];
}
