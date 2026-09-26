/** Blur low-contrast RGB texture inside recognized background without crossing owner edges. */
export function smoothRecognizedBackground(frame) {
  const { width, height, data, labels } = frame ?? {};
  if (!frame || !Number.isInteger(width) || !Number.isInteger(height) ||
      width < 1 || height < 1 || width * height > 512 * 512 ||
      !(data instanceof Uint8Array || data instanceof Uint8ClampedArray) ||
      data.length !== width * height * 4 ||
      !(labels instanceof Uint32Array) || labels.length !== width * height) {
    throw new TypeError('frame needs bounded RGBA pixels and owner labels');
  }
  const zeroStats = () => ({ ...frame, stats: { ...(frame.stats ?? {}), backgroundSmoothedCells: 0 } });
  if (!frame.segmented || width < 3 || height < 3) return zeroStats();
  let background = 0, foreground = 0;
  for (const owner of labels) { if (owner === 0) background++; else foreground++; }
  if (background < 9 || foreground < 9) return zeroStats();

  const radius = Math.max(width, height) >= 192 ? 3 : Math.max(width, height) >= 64 ? 2 : 1;
  let current = data;
  for (let pass = 0; pass < 2; pass++) {
    const output = new Uint8ClampedArray(current);
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const cell = y * width + x;
      if (labels[cell] !== 0) continue;
      // Keep the first background cell next to an object exactly as sampled.
      if (labels[cell - width - 1] || labels[cell - width] || labels[cell - width + 1] ||
          labels[cell - 1] || labels[cell + 1] ||
          labels[cell + width - 1] || labels[cell + width] || labels[cell + width + 1]) continue;
      const p = cell * 4, r = current[p], g = current[p + 1], b = current[p + 2];
      const light = (77 * r + 150 * g + 29 * b) >> 8;
      let red = 0, green = 0, blue = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const neighbor = ny * width + nx;
          if (labels[neighbor] !== 0) continue;
          const q = neighbor * 4, nr = current[q], ng = current[q + 1], nb = current[q + 2];
          if (Math.abs(((77 * nr + 150 * ng + 29 * nb) >> 8) - light) > 22 ||
              Math.max(Math.abs(nr - r), Math.abs(ng - g), Math.abs(nb - b)) > 48) continue;
          red += nr; green += ng; blue += nb; count++;
        }
      }
      if (count < 4) continue;
      output[p] = Math.round(red / count);
      output[p + 1] = Math.round(green / count);
      output[p + 2] = Math.round(blue / count);
    }
    current = output;
  }
  let changed = 0;
  for (let p = 0; p < data.length; p += 4) {
    if (Math.max(Math.abs(current[p] - data[p]), Math.abs(current[p + 1] - data[p + 1]),
      Math.abs(current[p + 2] - data[p + 2])) >= 2) changed++;
  }
  return { ...frame, data: current, stats: { ...(frame.stats ?? {}), backgroundSmoothedCells: changed } };
}
