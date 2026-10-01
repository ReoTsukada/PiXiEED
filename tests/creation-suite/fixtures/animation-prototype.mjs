/**
 * Isolated animation storage prototype. This module has no production imports.
 * Cel bytes are palette indexes plus one; zero is transparent.
 */
export const MAX_PALETTE_COLORS = 32;
export const MAX_DIMENSION = 256;
export const PIXEL_BUDGET_BYTES = 32 * 1024 * 1024;

function assertPalette(palette) {
  if (!Array.isArray(palette) || palette.length < 1 || palette.length > MAX_PALETTE_COLORS
      || palette.some((color) => typeof color !== 'string' || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(color)
        || color.length === 9 && color.slice(7, 9).toLowerCase() !== 'ff')) {
    throw new TypeError('Palette must contain at most 32 opaque hex colors');
  }
}

function assertDimension(value) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_DIMENSION) throw new RangeError('Canvas dimensions must be between 1 and 256');
}

function assertId(collection, id, kind) {
  if (typeof id !== 'string' || !collection.some((item) => item.id === id)) throw new TypeError(`Unknown ${kind} id`);
}

function hashImage(width, height, bytes) {
  let hash = 2166136261;
  for (const value of bytes) { hash ^= value; hash = Math.imul(hash, 16777619); }
  return `${width}x${height}:${hash >>> 0}`;
}

function equalImage(image, width, height, bytes) {
  return image.width === width && image.height === height && image.bytes.length === bytes.length
    && image.bytes.every((value, index) => value === bytes[index]);
}

function countReferences(state, imageId) {
  let count = 0;
  for (const layer of state.layers) for (const ref of layer.cels.values()) if (ref?.imageId === imageId) count += 1;
  return count;
}

function poolBytes(state) {
  let bytes = 0;
  for (const image of state.images.values()) bytes += image.bytes.byteLength;
  return bytes;
}

function findImage(state, width, height, bytes) {
  const candidates = state.imageHashes.get(hashImage(width, height, bytes)) || [];
  return candidates.find((imageId) => {
    const image = state.images.get(imageId);
    return image && equalImage(image, width, height, bytes);
  }) || null;
}

function removeImage(state, imageId) {
  if (!imageId || countReferences(state, imageId)) return;
  const image = state.images.get(imageId);
  if (!image) return;
  state.images.delete(imageId);
  const candidates = state.imageHashes.get(image.hash);
  if (candidates) {
    const next = candidates.filter((candidate) => candidate !== imageId);
    if (next.length) state.imageHashes.set(image.hash, next);
    else state.imageHashes.delete(image.hash);
  }
}

export function createAnimationDocument({ width = 16, height = 16, palette = ['#000000'], pixelBudgetBytes = PIXEL_BUDGET_BYTES } = {}) {
  assertDimension(width); assertDimension(height); assertPalette(palette);
  if (!Number.isSafeInteger(pixelBudgetBytes) || pixelBudgetBytes < 0 || pixelBudgetBytes > PIXEL_BUDGET_BYTES) throw new RangeError('Pixel budget must be between zero and 32 MiB');
  const firstFrame = { id: 'frame-1', name: 'Frame 1' };
  const firstLayer = { id: 'layer-1', name: 'Layer 1', visible: true, cels: new Map([[firstFrame.id, null]]) };
  return {
    width, height, palette: [...palette], pixelBudgetBytes,
    frames: [firstFrame], layers: [firstLayer],
    images: new Map(), imageHashes: new Map(), nextFrameNumber: 2, nextLayerNumber: 2, nextImageNumber: 1
  };
}

export function addLayer(state, { name = `Layer ${state.nextLayerNumber}`, visible = true } = {}) {
  const layer = { id: `layer-${state.nextLayerNumber++}`, name, visible: Boolean(visible), cels: new Map(state.frames.map((frame) => [frame.id, null])) };
  state.layers.push(layer);
  return layer.id;
}

export function duplicateFrame(state, frameId, { name } = {}) {
  assertId(state.frames, frameId, 'frame');
  const frame = state.frames.find((item) => item.id === frameId);
  const duplicate = { id: `frame-${state.nextFrameNumber++}`, name: name || `${frame.name} copy` };
  state.frames.push(duplicate);
  for (const layer of state.layers) {
    const ref = layer.cels.get(frameId);
    layer.cels.set(duplicate.id, ref ? { ...ref } : null);
  }
  return duplicate.id;
}

function validateCelInput(state, width, height, source) {
  assertDimension(width); assertDimension(height);
  if (width !== state.width || height !== state.height) throw new RangeError('Cel input must match the canvas dimensions');
  if (!source || typeof source.length !== 'number' || source.length !== width * height) throw new TypeError('Cel byte count does not match its dimensions');
  // Validate before Uint8Array construction so values such as 257 cannot wrap to index 1.
  for (let i = 0; i < source.length; i += 1) {
    const value = source[i];
    if (!Number.isInteger(value) || value < 0 || value > state.palette.length) throw new RangeError('Cel contains a palette index outside the palette');
  }
}

function cropCel(state, source) {
  let minX = state.width; let minY = state.height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < state.height; y += 1) for (let x = 0; x < state.width; x += 1) {
    if (source[y * state.width + x] !== 0) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  }
  if (maxX < 0) return null;
  const width = maxX - minX + 1; const height = maxY - minY + 1; const bytes = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) bytes[y * width + x] = source[(minY + y) * state.width + minX + x];
  return { width, height, x: minX, y: minY, bytes };
}

export function writeCel(state, { layerId, frameId, bytes }) {
  assertId(state.layers, layerId, 'layer'); assertId(state.frames, frameId, 'frame');
  validateCelInput(state, state.width, state.height, bytes);
  const cropped = cropCel(state, bytes);
  const layer = state.layers.find((item) => item.id === layerId);
  const previous = layer.cels.get(frameId);
  let imageId = cropped ? findImage(state, cropped.width, cropped.height, cropped.bytes) : null;
  const needsImage = Boolean(cropped && !imageId);
  const removesPrevious = Boolean(previous && previous.imageId !== imageId && countReferences(state, previous.imageId) === 1);
  const resultingBytes = poolBytes(state) - (removesPrevious ? state.images.get(previous.imageId).bytes.byteLength : 0) + (needsImage ? cropped.bytes.byteLength : 0);
  if (resultingBytes > state.pixelBudgetBytes) throw new RangeError('Animation pixel budget exceeded');

  if (needsImage) {
    imageId = `image-${state.nextImageNumber++}`;
    const hash = hashImage(cropped.width, cropped.height, cropped.bytes);
    state.images.set(imageId, { id: imageId, width: cropped.width, height: cropped.height, bytes: cropped.bytes, hash });
    const candidates = state.imageHashes.get(hash) || [];
    candidates.push(imageId); state.imageHashes.set(hash, candidates);
  }
  layer.cels.set(frameId, cropped ? { imageId, x: cropped.x, y: cropped.y } : null);
  if (previous && previous.imageId !== imageId) removeImage(state, previous.imageId);
  return layer.cels.get(frameId) ? { ...layer.cels.get(frameId) } : null;
}

export function editCelPixel(state, { layerId, frameId, x, y, value }) {
  assertId(state.layers, layerId, 'layer'); assertId(state.frames, frameId, 'frame');
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= state.width || y >= state.height) throw new RangeError('Pixel coordinate is outside the canvas');
  if (!Number.isInteger(value) || value < 0 || value > state.palette.length) throw new RangeError('Pixel palette index is outside the palette');
  const layer = state.layers.find((item) => item.id === layerId); const ref = layer.cels.get(frameId);
  const bytes = new Uint8Array(state.width * state.height);
  if (ref) {
    const image = state.images.get(ref.imageId);
    for (let iy = 0; iy < image.height; iy += 1) for (let ix = 0; ix < image.width; ix += 1) bytes[(ref.y + iy) * state.width + ref.x + ix] = image.bytes[iy * image.width + ix];
  }
  bytes[y * state.width + x] = value;
  return writeCel(state, { layerId, frameId, bytes });
}

export function getCelReference(state, { layerId, frameId }) {
  assertId(state.layers, layerId, 'layer'); assertId(state.frames, frameId, 'frame');
  const ref = state.layers.find((item) => item.id === layerId).cels.get(frameId);
  if (!ref) return null;
  const image = state.images.get(ref.imageId);
  return { ...ref, width: image.width, height: image.height };
}

export function renderComposite(state, frameId) {
  assertId(state.frames, frameId, 'frame');
  const output = new Uint8Array(state.width * state.height);
  for (const layer of state.layers) {
    if (!layer.visible) continue;
    const ref = layer.cels.get(frameId); if (!ref) continue;
    const image = state.images.get(ref.imageId);
    for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
      const value = image.bytes[y * image.width + x];
      if (value !== 0) output[(ref.y + y) * state.width + ref.x + x] = value;
    }
  }
  return output;
}

export function setLayerVisible(state, layerId, visible) {
  assertId(state.layers, layerId, 'layer');
  state.layers.find((item) => item.id === layerId).visible = Boolean(visible);
}

export function getPixelMemoryBytes(state) { return poolBytes(state); }
