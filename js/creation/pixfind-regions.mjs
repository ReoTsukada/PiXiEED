const MAX_PIXELS = 16_777_216;

function imagePixels(image) {
  if (!image || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height)
      || image.width < 1 || image.height < 1 || image.width * image.height > MAX_PIXELS
      || !image.data || image.data.length !== image.width * image.height * 4) {
    throw new TypeError('Expected a bounded RGBA image with exact dimensions.');
  }
  for (let i = 0; i < image.data.length; i += 1) {
    if (!Number.isInteger(image.data[i]) || image.data[i] < 0 || image.data[i] > 255) {
      throw new TypeError('RGBA channels must be integers from 0 to 255.');
    }
  }
  return image;
}

function optionsDistance(value, fallback = 0) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0 || value > 64) throw new RangeError('Invalid merge distance.');
  return Math.floor(value);
}

function components(mask, width, height, connectivity = 8, mergeDistance = 0) {
  const seen = new Uint8Array(mask.length);
  const groups = [];
  const offsets = [];
  for (let dy = -mergeDistance; dy <= mergeDistance; dy += 1) {
    for (let dx = -mergeDistance; dx <= mergeDistance; dx += 1) {
      if ((!dx && !dy) || Math.abs(dx) + Math.abs(dy) > mergeDistance) continue;
      if (connectivity === 4 && dx !== 0 && dy !== 0) continue;
      offsets.push([dx, dy]);
    }
  }
  if (!mergeDistance) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], ...(connectivity === 8 ? [[-1, -1], [1, -1], [-1, 1], [1, 1]] : [])]) offsets.push([dx, dy]);
  }
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    const queue = [start];
    seen[start] = 1;
    const pixels = [];
    for (let head = 0; head < queue.length; head += 1) {
      const at = queue[head]; pixels.push(at);
      const x = at % width; const y = Math.floor(at / width);
      for (const [dx, dy] of offsets) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (mask[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
      }
    }
    groups.push(pixels);
  }
  return groups.map((pixels) => {
    let minX = width; let maxX = -1; let minY = height; let maxY = -1; let sx = 0; let sy = 0;
    for (const at of pixels) { const x = at % width; const y = Math.floor(at / width); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); sx += x; sy += y; }
    const maskWidth = maxX - minX + 1; const maskHeight = maxY - minY + 1; const localMask = new Uint8Array(maskWidth * maskHeight);
    for (const at of pixels) localMask[(Math.floor(at / width) - minY) * maskWidth + (at % width - minX)] = 1;
    return { minX, maxX, minY, maxY, centerX: sx / pixels.length, centerY: sy / pixels.length,
      centroid: { x: sx / pixels.length, y: sy / pixels.length }, count: pixels.length,
      maskWidth, maskHeight, mask: localMask, pixels: Uint32Array.from(pixels) };
  }).sort((a, b) => a.minY - b.minY || a.minX - b.minX || a.maxY - b.maxY || a.maxX - b.maxX);
}

export function computeDifferenceRegions(original, changed, options = {}) {
  imagePixels(original); imagePixels(changed);
  if (original.width !== changed.width || original.height !== changed.height) throw new RangeError('Image dimensions must match.');
  const distance = optionsDistance(options.mergeDistance);
  const mask = new Uint8Array(original.width * original.height);
  for (let p = 0; p < mask.length; p += 1) {
    const i = p * 4; const aa = original.data[i + 3]; const ba = changed.data[i + 3];
    if (aa !== ba || (aa !== 0 && (original.data[i] !== changed.data[i] || original.data[i + 1] !== changed.data[i + 1] || original.data[i + 2] !== changed.data[i + 2]))) mask[p] = 1;
  }
  // The historical player joined every changed pixel within the Manhattan
  // radius, including diagonal offsets. Keep four-neighbour connectivity only
  // for the default exact-pixel extraction used by local editing.
  return { width: original.width, height: original.height, mask, regions: components(mask, original.width, original.height, distance ? 8 : 4, distance) };
}

export function computeHiddenObjectRegions(layer, options = {}) {
  imagePixels(layer);
  const alphaThreshold = options.alphaThreshold ?? 12; const blackThreshold = options.blackThreshold ?? 72;
  if (!Number.isInteger(alphaThreshold) || alphaThreshold < 0 || alphaThreshold > 255 || !Number.isInteger(blackThreshold) || blackThreshold < 0 || blackThreshold > 255) throw new RangeError('Invalid mask thresholds.');
  const mask = new Uint8Array(layer.width * layer.height);
  let blackCount = 0; let visibleCount = 0;
  for (let p = 0; p < mask.length; p += 1) {
    const i = p * 4; const alpha = layer.data[i + 3];
    if (alpha <= alphaThreshold) continue;
    visibleCount += 1;
    if (Math.max(layer.data[i], layer.data[i + 1], layer.data[i + 2]) <= blackThreshold) { mask[p] = 1; blackCount += 1; }
  }
  if (!blackCount && visibleCount && visibleCount / mask.length <= 0.25) {
    for (let p = 0; p < mask.length; p += 1) if (layer.data[p * 4 + 3] > alphaThreshold) mask[p] = 1;
  }
  return { width: layer.width, height: layer.height, mask, regions: components(mask, layer.width, layer.height, 8) };
}

export function regionContainsPoint(region, x, y, tolerance = 0) {
  if (!region || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 32) return false;
  const px = Math.floor(x); const py = Math.floor(y);
  if (px >= region.minX && px <= region.maxX && py >= region.minY && py <= region.maxY && region.mask?.[(py - region.minY) * region.maskWidth + (px - region.minX)]) return true;
  if (!tolerance) return false;
  const radius2 = tolerance * tolerance;
  for (let dy = -Math.ceil(tolerance); dy <= Math.ceil(tolerance); dy += 1) for (let dx = -Math.ceil(tolerance); dx <= Math.ceil(tolerance); dx += 1) {
    if (dx * dx + dy * dy > radius2) continue;
    const nx = px + dx; const ny = py + dy;
    if (nx >= region.minX && nx <= region.maxX && ny >= region.minY && ny <= region.maxY && region.mask[(ny - region.minY) * region.maskWidth + nx - region.minX]) return true;
  }
  return false;
}

function storedRegion(pixels, width, height, minX, maxX, minY, maxY) {
  const maskWidth = maxX - minX + 1; const maskHeight = maxY - minY + 1;
  const localMask = new Uint8Array(maskWidth * maskHeight);
  let sx = 0; let sy = 0;
  for (const pixel of pixels) { const x = pixel % width; const y = Math.floor(pixel / width); localMask[(y - minY) * maskWidth + x - minX] = 1; sx += x; sy += y; }
  return { minX, maxX, minY, maxY, centerX: sx / pixels.length, centerY: sy / pixels.length,
    centroid: { x: sx / pixels.length, y: sy / pixels.length }, count: pixels.length,
    maskWidth, maskHeight, mask: localMask, pixels: Uint32Array.from(pixels) };
}

function validatedRegions(boxes, mask, width, height, getBox, verifyCentroid = true) {
  if (!Array.isArray(boxes) || !boxes.length || boxes.length > 128 || !mask || mask.length !== width * height) return null;
  const assigned = new Uint8Array(mask.length); const regions = [];
  for (const box of boxes) {
    const bounds = getBox(box);
    if (!bounds) return null;
    const { minX, maxX, minY, maxY, count, centerX, centerY } = bounds;
    if (![minX, maxX, minY, maxY].every(Number.isInteger) || minX < 0 || minY < 0 || maxX < minX || maxY < minY || maxX >= width || maxY >= height) return null;
    if (!Number.isSafeInteger(count) || count < 1 || !Number.isFinite(centerX) || !Number.isFinite(centerY)) return null;
    const pixels = []; let actualMinX = width; let actualMaxX = -1; let actualMinY = height; let actualMaxY = -1;
    for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      if (assigned[index]) return null;
      assigned[index] = 1; pixels.push(index); actualMinX = Math.min(actualMinX, x); actualMaxX = Math.max(actualMaxX, x); actualMinY = Math.min(actualMinY, y); actualMaxY = Math.max(actualMaxY, y);
    }
    if (pixels.length !== count || actualMinX !== minX || actualMaxX !== maxX || actualMinY !== minY || actualMaxY !== maxY) return null;
    const sx = pixels.reduce((sum, pixel) => sum + pixel % width, 0) / pixels.length;
    const sy = pixels.reduce((sum, pixel) => sum + Math.floor(pixel / width), 0) / pixels.length;
    if (verifyCentroid && (Math.abs(sx - centerX) > 0.01 || Math.abs(sy - centerY) > 0.01)) return null;
    regions.push({ ...storedRegion(pixels, width, height, minX, maxX, minY, maxY), hitTolerance: 0 });
  }
  return regions;
}

/** Validates legacy author-confirmed spot-difference boxes against the decoded difference pixels. */
export function validateStoredDifferenceRegions(boxes, result) {
  if (!result || !Number.isSafeInteger(result.width) || !Number.isSafeInteger(result.height)) return null;
  return validatedRegions(boxes, result.mask, result.width, result.height, (box) => box && ({
    minX: box.minX, maxX: box.maxX, minY: box.minY, maxY: box.maxY,
    count: box.count, centerX: box.centerX, centerY: box.centerY,
  }));
}

/** Converts a confirmed local Spot draft's exact pixel groups into playable regions. */
export function validateLocalDifferenceGroups(groups, result) {
  if (!result || !Number.isSafeInteger(result.width) || !Number.isSafeInteger(result.height)
      || result.width < 1 || result.height < 1 || !result.mask || result.mask.length !== result.width * result.height
      || !Array.isArray(groups) || !groups.length || groups.length > 256) return null;
  const assigned = new Uint8Array(result.mask.length);
  const regions = [];
  for (const group of groups) {
    if (!group || typeof group.id !== 'string' || !group.id || !Array.isArray(group.pixels) || !group.pixels.length) return null;
    const pixels = [];
    let minX = result.width; let maxX = -1; let minY = result.height; let maxY = -1;
    for (const pixel of group.pixels) {
      if (!Number.isInteger(pixel) || pixel < 0 || pixel >= result.mask.length || !result.mask[pixel] || assigned[pixel]) return null;
      assigned[pixel] = 1; pixels.push(pixel);
      const x = pixel % result.width; const y = Math.floor(pixel / result.width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const maskWidth = maxX - minX + 1; const maskHeight = maxY - minY + 1;
    const mask = new Uint8Array(maskWidth * maskHeight);
    let sx = 0; let sy = 0;
    for (const pixel of pixels) {
      const x = pixel % result.width; const y = Math.floor(pixel / result.width);
      mask[(y - minY) * maskWidth + x - minX] = 1; sx += x; sy += y;
    }
    regions.push({ minX, maxX, minY, maxY, count: pixels.length, centerX: sx / pixels.length, centerY: sy / pixels.length,
      centroid: { x: sx / pixels.length, y: sy / pixels.length }, maskWidth, maskHeight, mask, pixels: Uint32Array.from(pixels), hitTolerance: 0 });
  }
  return regions;
}

/** Builds validated author-defined circular hit regions from pixel-space markers. */
export function validateHiddenObjectMarkers(targets, width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS
      || !Array.isArray(targets) || !targets.length || targets.length > 128
      || targets.some((target) => !target || typeof target !== 'object' || typeof target.label !== 'string' || !target.label.trim() || !target.marker || typeof target.marker !== 'object')) return null;
  const regions = []; const occupied = new Uint8Array(width * height);
  for (const target of targets) {
    const marker = target.marker;
    if (![marker.x, marker.y, marker.radius, marker.minX, marker.maxX, marker.minY, marker.maxY].every(Number.isFinite)
        || ![marker.minX, marker.maxX, marker.minY, marker.maxY].every(Number.isInteger)
        || marker.radius <= 0 || marker.radius > Math.max(width, height)
        || marker.x < 0 || marker.y < 0 || marker.x >= width || marker.y >= height) return null;
    const expectedMinX = Math.max(0, Math.floor(marker.x - marker.radius));
    const expectedMaxX = Math.min(width - 1, Math.ceil(marker.x + marker.radius));
    const expectedMinY = Math.max(0, Math.floor(marker.y - marker.radius));
    const expectedMaxY = Math.min(height - 1, Math.ceil(marker.y + marker.radius));
    if (Math.abs(marker.minX - expectedMinX) > 1 || Math.abs(marker.maxX - expectedMaxX) > 1
        || Math.abs(marker.minY - expectedMinY) > 1 || Math.abs(marker.maxY - expectedMaxY) > 1
        || marker.x < marker.minX || marker.x > marker.maxX || marker.y < marker.minY || marker.y > marker.maxY) return null;
    const pixels = []; let minX = width; let maxX = -1; let minY = height; let maxY = -1;
    for (let y = Math.max(0, marker.minY); y <= Math.min(height - 1, marker.maxY); y += 1) {
      for (let x = Math.max(0, marker.minX); x <= Math.min(width - 1, marker.maxX); x += 1) {
        if ((x - marker.x) ** 2 + (y - marker.y) ** 2 > marker.radius ** 2) continue;
        const pixel = y * width + x;
        if (occupied[pixel]) return null;
        occupied[pixel] = 1; pixels.push(pixel); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
    if (!pixels.length) return null;
    regions.push({ ...storedRegion(pixels, width, height, minX, maxX, minY, maxY), hitTolerance: 0 });
  }
  return regions;
}

export function resolvePuzzleFromLocation(location, puzzles) {
  if (!location || !Array.isArray(puzzles)) return null;
  let token = null;
  try {
    token = new URLSearchParams(location.search || '').get('puzzle');
    if (!token && typeof location.hash === 'string' && location.hash.startsWith('#puzzle=')) token = decodeURIComponent(location.hash.slice(8));
  } catch { return null; }
  if (typeof token !== 'string' || !token.trim()) return null;
  const key = token.trim();
  return puzzles.find((puzzle) => puzzle && (puzzle.id === key || puzzle.slug === key)) ?? null;
}
