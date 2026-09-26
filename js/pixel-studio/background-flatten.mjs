/** Remove tiny color islands from recognized background interiors only. */
export function flattenRecognizedBackground(frame) {
  const { width, height, data, labels, palette } = frame ?? {};
  if (!frame || !Number.isInteger(width) || !Number.isInteger(height) ||
      width < 1 || height < 1 || width * height > 512 * 512 ||
      !(data instanceof Uint8Array || data instanceof Uint8ClampedArray) ||
      data.length !== width * height * 4 ||
      !(labels instanceof Uint32Array) || labels.length !== width * height ||
      !Array.isArray(palette) || palette.length < 2 || palette.length > 24) {
    throw new TypeError('frame needs bounded pixels, owner labels and a palette');
  }
  const zeroStats = () => ({ ...frame, stats: { ...(frame.stats ?? {}), backgroundFlattenedCells: 0 } });
  if (!frame.segmented || width < 3 || height < 3) return zeroStats();

  let background = 0, foreground = 0;
  for (const owner of labels) { if (owner === 0) background++; else foreground++; }
  if (background < 9 || foreground < 9) return zeroStats();

  const radius = Math.max(width, height) >= 192 ? 3 : Math.max(width, height) >= 64 ? 2 : 1;
  if (width <= radius * 2 || height <= radius * 2) return zeroStats();
  const side = radius * 2 + 1, neighborhood = side * side;
  const paletteIndex = new Map(palette.map(([r, g, b], index) => [r << 16 | g << 8 | b, index]));
  const indices = new Uint8Array(width * height);
  for (let cell = 0; cell < indices.length; cell++) {
    const p = cell * 4, key = data[p] << 16 | data[p + 1] << 8 | data[p + 2];
    const index = paletteIndex.get(key);
    if (index === undefined) throw new TypeError('pixel color must belong to the palette');
    indices[cell] = index;
  }

  const counts = new Uint8Array(palette.length);
  const output = new Uint8ClampedArray(data);
  let changed = 0;
  for (let y = radius; y < height - radius; y++) for (let x = radius; x < width - radius; x++) {
    const cell = y * width + x, current = indices[cell];
    if (labels[cell] !== 0 || current === palette.length - 1) continue;
    counts.fill(0);
    let touchesObject = false;
    for (let dy = -radius; dy <= radius && !touchesObject; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const neighbor = cell + dy * width + dx;
        if (labels[neighbor] !== 0) { touchesObject = true; break; }
        counts[indices[neighbor]]++;
      }
    }
    if (touchesObject) continue;
    let winner = current, most = counts[current];
    for (let index = 0; index < counts.length; index++) {
      if (counts[index] > most) { winner = index; most = counts[index]; }
    }
    if (winner === current || most < Math.ceil(neighborhood * .45) ||
        counts[current] > Math.floor(neighborhood * .42)) continue;
    const color = palette[winner], p = cell * 4;
    output[p] = color[0]; output[p + 1] = color[1]; output[p + 2] = color[2];
    changed++;
  }
  return { ...frame, data: output,
    stats: { ...(frame.stats ?? {}), backgroundFlattenedCells: changed } };
}
