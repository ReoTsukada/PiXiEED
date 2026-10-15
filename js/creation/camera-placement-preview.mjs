import { centerCrop } from '../pixel-studio/framing.mjs';

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer`);
}

/** Cache nearest-neighbour source offsets for every selected target cell. */
export function createCameraPlacementMapping({ sourceWidth, sourceHeight, width, height, bounds, cells, mask = null }) {
  positiveInteger(sourceWidth, 'sourceWidth'); positiveInteger(sourceHeight, 'sourceHeight');
  positiveInteger(width, 'width'); positiveInteger(height, 'height');
  if (!bounds || !Number.isInteger(bounds.x) || !Number.isInteger(bounds.y) || !Number.isInteger(bounds.width) || !Number.isInteger(bounds.height)
    || bounds.x < 0 || bounds.y < 0 || bounds.width < 1 || bounds.height < 1
    || bounds.x + bounds.width > width || bounds.y + bounds.height > height) throw new RangeError('Invalid target bounds');
  if (!cells || !Number.isInteger(cells.length)) throw new TypeError('Target cells are required');
  if (mask != null && (!(mask instanceof Uint8Array) || mask.length !== width * height)) throw new TypeError('Invalid target mask');
  const crop = centerCrop(sourceWidth, sourceHeight, bounds.width / bounds.height);
  const sourceOffsets = new Uint32Array(cells.length);
  const targetIndices = new Uint32Array(cells.length);
  for (let n = 0; n < cells.length; n++) {
    const targetIndex = Number(cells[n]);
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= width * height || (mask && !mask[targetIndex])) throw new RangeError('Invalid target cell');
    const x = targetIndex % width - bounds.x;
    const y = Math.floor(targetIndex / width) - bounds.y;
    if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) throw new RangeError('Target cell is outside bounds');
    const sx = Math.min(sourceWidth - 1, Math.max(0, Math.floor(crop.sx + (x + 0.5) * crop.sw / bounds.width)));
    const sy = Math.min(sourceHeight - 1, Math.max(0, Math.floor(crop.sy + (y + 0.5) * crop.sh / bounds.height)));
    sourceOffsets[n] = (sy * sourceWidth + sx) * 4;
    targetIndices[n] = targetIndex;
  }
  const edges = [];
  const selectedAt = (x, y) => x >= 0 && y >= 0 && x < width && y < height && (mask ? mask[y * width + x] : x >= bounds.x && y >= bounds.y && x < bounds.x + bounds.width && y < bounds.y + bounds.height);
  for (const index of targetIndices) {
    const x = index % width, y = Math.floor(index / width);
    if (!selectedAt(x, y - 1)) edges.push(index * 4);
    if (!selectedAt(x + 1, y)) edges.push(index * 4 + 1);
    if (!selectedAt(x, y + 1)) edges.push(index * 4 + 2);
    if (!selectedAt(x - 1, y)) edges.push(index * 4 + 3);
  }
  return Object.freeze({ sourceWidth, sourceHeight, width, height, bounds:Object.freeze({ ...bounds }), sourceOffsets, targetIndices, edges:Uint32Array.from(edges), mask:mask ? new Uint8Array(mask) : null, sampled:new Uint8ClampedArray(cells.length * 4) });
}

/** Sample a processed camera frame with the same mapping used by final apply. */
export function sampleCameraFrameToPlacement(frame, mapping, output = mapping?.sampled) {
  if (!frame || frame.width !== mapping?.sourceWidth || frame.height !== mapping?.sourceHeight
    || !frame.data || frame.data.length !== frame.width * frame.height * 4) throw new TypeError('Camera frame does not match the placement mapping');
  if (!output || output.length !== mapping.sourceOffsets.length * 4) throw new TypeError('Invalid sampled frame buffer');
  for (let n = 0; n < mapping.sourceOffsets.length; n++) {
    const source = mapping.sourceOffsets[n], target = n * 4;
    output[target] = frame.data[source]; output[target + 1] = frame.data[source + 1];
    output[target + 2] = frame.data[source + 2]; output[target + 3] = frame.data[source + 3];
  }
  return output;
}

function paletteColor(palette, index, output, offset) {
  const color = index >= 0 ? palette[index] : null;
  if (typeof color !== 'string' || !/^#[\da-f]{6}(?:ff)?$/i.test(color)) {
    output[offset] = output[offset + 1] = output[offset + 2] = output[offset + 3] = 0;
    return;
  }
  output[offset] = Number.parseInt(color.slice(1, 3), 16);
  output[offset + 1] = Number.parseInt(color.slice(3, 5), 16);
  output[offset + 2] = Number.parseInt(color.slice(5, 7), 16);
  output[offset + 3] = 255;
}

function rgbaPaletteColor(palette, index) {
  const color = palette?.[index];
  if (typeof color !== 'string' || !/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(color)) return null;
  return [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16))
    .concat(color.length === 9 ? Number.parseInt(color.slice(7, 9), 16) : 255);
}

function createRgbaCameraPlacementRenderer(snapshot, mapping) {
  const { width, height, rgbaLayers, activeLayerId, baseRgba, activeVisible = true,
    activeLocked = false, musicOnly = false, previewAllowed = true, palette = [], allowedIndices = [] } = snapshot;
  const length = width * height;
  if (!Array.isArray(rgbaLayers) || !rgbaLayers.length || !rgbaLayers.some(layer => layer.id === activeLayerId)) throw new TypeError('RGBA placement layers are incomplete');
  if (!(baseRgba instanceof Uint8Array || baseRgba instanceof Uint8ClampedArray) || baseRgba.length !== length * 4) throw new TypeError('RGBA placement base does not match canvas');
  const layers = rgbaLayers.map(layer => {
    if (!layer || typeof layer.id !== 'string' || !layer.rgba || layer.rgba.length !== length * 4
      || typeof layer.visible !== 'boolean' || !Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) throw new TypeError('RGBA placement layer is invalid');
    return layer;
  });
  const activeIndex = layers.findIndex(layer => layer.id === activeLayerId);
  const canPreview = (musicOnly || activeVisible) && !activeLocked && previewAllowed !== false;
  const fixedChoices = allowedIndices.map(index => ({ index, rgba:rgbaPaletteColor(palette, index) })).filter(choice => choice.rgba);
  if (!fixedChoices.length) throw new TypeError('RGBA replacement palette is empty');
  const fixedIndices = new Int16Array(mapping.targetIndices.length);
  const sampled = mapping.sampled;
  const output = new Uint8ClampedArray(length * 4);

  function compositePixel(pixel, cameraPixel = -1, paletteFixed = false) {
    let red = 0, green = 0, blue = 0, alpha = 0;
    const first = musicOnly ? activeIndex : 0, last = musicOnly ? activeIndex + 1 : layers.length;
    for (let layerIndex = first; layerIndex < last; layerIndex += 1) {
      const layer = layers[layerIndex];
      if (!musicOnly && !layer.visible) continue;
      const offset = pixel * 4;
      let sourceRed, sourceGreen, sourceBlue, sourceAlpha;
      if (layerIndex === activeIndex && cameraPixel >= 0) {
        const cameraOffset = cameraPixel * 4;
        if (sampled[cameraOffset + 3] === 0) continue; // transparent capture clears this cel
        if (paletteFixed) {
          const color = fixedChoices[fixedIndices[cameraPixel]].rgba;
          [sourceRed, sourceGreen, sourceBlue, sourceAlpha] = color;
        } else {
          sourceRed = sampled[cameraOffset]; sourceGreen = sampled[cameraOffset + 1];
          sourceBlue = sampled[cameraOffset + 2]; sourceAlpha = sampled[cameraOffset + 3];
        }
      } else {
        sourceRed = layer.rgba[offset]; sourceGreen = layer.rgba[offset + 1];
        sourceBlue = layer.rgba[offset + 2]; sourceAlpha = layer.rgba[offset + 3];
      }
      sourceAlpha *= layer.opacity;
      if (!sourceAlpha) continue;
      if (sourceAlpha === 255) { red = sourceRed; green = sourceGreen; blue = sourceBlue; alpha = 255; continue; }
      const sourceWeight = sourceAlpha / 255, backWeight = 1 - sourceWeight;
      const backRed = red * alpha / 255, backGreen = green * alpha / 255, backBlue = blue * alpha / 255;
      alpha = sourceAlpha + alpha * backWeight;
      if (alpha > 0) {
        red = (sourceRed * sourceWeight + backRed * backWeight) * 255 / alpha;
        green = (sourceGreen * sourceWeight + backGreen * backWeight) * 255 / alpha;
        blue = (sourceBlue * sourceWeight + backBlue * backWeight) * 255 / alpha;
      }
    }
    const offset = pixel * 4;
    output[offset] = Math.round(red); output[offset + 1] = Math.round(green);
    output[offset + 2] = Math.round(blue); output[offset + 3] = Math.round(alpha);
  }

  return Object.freeze({
    mapping,
    render(frame, { paletteFixed = false } = {}) {
      sampleCameraFrameToPlacement(frame, mapping, sampled);
      output.set(baseRgba);
      if (!canPreview) return output;
      if (paletteFixed) {
        for (let n = 0; n < mapping.targetIndices.length; n += 1) {
          const source = n * 4; let best = 0, distance = Infinity;
          const sample = [sampled[source], sampled[source + 1], sampled[source + 2], sampled[source + 3]];
          for (let choiceIndex = 0; choiceIndex < fixedChoices.length; choiceIndex += 1) {
            const color = fixedChoices[choiceIndex].rgba;
            const candidate = (sample[0] - color[0]) ** 2 + (sample[1] - color[1]) ** 2
              + (sample[2] - color[2]) ** 2 + (sample[3] - color[3]) ** 2;
            if (candidate < distance) { best = choiceIndex; distance = candidate; }
          }
          fixedIndices[n] = best;
        }
      }
      for (let n = 0; n < mapping.targetIndices.length; n += 1) compositePixel(mapping.targetIndices[n], n, paletteFixed);
      return output;
    }
  });
}

/** Build a cached base composite and render camera pixels over the selected layer. */
export function createCameraPlacementRenderer(snapshot, mapping) {
  if (!snapshot || !mapping || snapshot.width !== mapping.width || snapshot.height !== mapping.height) throw new TypeError('Placement snapshot does not match its mapping');
  if (Array.isArray(snapshot.rgbaLayers)) return createRgbaCameraPlacementRenderer(snapshot, mapping);
  const { width, height, palette, below, active, above, activeVisible = true, activeLocked = false, musicOnly = false, allowedIndices = [] } = snapshot;
  const length = width * height;
  for (const pixels of [below, active, above]) if (!pixels || pixels.length !== length) throw new TypeError('Placement layer pixels do not match canvas');
  if (!Array.isArray(palette)) throw new TypeError('Placement palette is required');
  const base = new Uint8ClampedArray(snapshot.baseRgba?.length === length * 4 ? snapshot.baseRgba : length * 4);
  const under = new Uint8ClampedArray(length * 4);
  const output = new Uint8ClampedArray(length * 4);
  for (let i = 0; i < length; i++) {
    const offset = i * 4;
    if (!musicOnly) paletteColor(palette, below[i], under, offset);
    if (!snapshot.baseRgba) {
      const baseIndex = musicOnly ? active[i] : above[i] >= 0 ? above[i] : activeVisible && active[i] >= 0 ? active[i] : below[i];
      paletteColor(palette, baseIndex, base, offset);
    }
  }
  const sampled = mapping.sampled;
  const fixedIndices = new Int16Array(mapping.targetIndices.length);
  const fixedChoices = allowedIndices.map(index => {
    const color = palette[index];
    if (typeof color !== 'string' || !/^#[a-f\d]{6}(?:ff)?$/i.test(color)) throw new TypeError('Camera replacements require opaque palette colors');
    return { index, rgb:[1, 3, 5].map(n => Number.parseInt(color.slice(n, n + 2), 16)) };
  });
  const fixedColorCache = new Map();
  function quantizeFixed() {
    for (let n = 0; n < mapping.targetIndices.length; n++) {
      const offset = n * 4, r = sampled[offset], g = sampled[offset + 1], b = sampled[offset + 2];
      const key = (r << 16) | (g << 8) | b;
      let match = fixedColorCache.get(key);
      if (match === undefined) {
        const gray = (r * 0.299 + g * 0.587 + b * 0.114);
        const adjustedR = Math.max(0, Math.min(255, gray + (r - gray)));
        const adjustedG = Math.max(0, Math.min(255, gray + (g - gray)));
        const adjustedB = Math.max(0, Math.min(255, gray + (b - gray)));
        let distance = Infinity; match = fixedChoices[0].index;
        for (const choice of fixedChoices) {
          const dr = adjustedR - choice.rgb[0], dg = adjustedG - choice.rgb[1], db = adjustedB - choice.rgb[2];
          const candidate = dr * dr + dg * dg + db * db;
          if (candidate < distance) { distance = candidate; match = choice.index; }
        }
        if (fixedColorCache.size >= 2048) fixedColorCache.clear();
        fixedColorCache.set(key, match);
      }
      fixedIndices[n] = match;
    }
  }
  // The music-only editor intentionally shows the active music cel even while its
  // layer visibility flag is off. Keep camera preview aligned with that view.
  const canPreview = (musicOnly || activeVisible) && !activeLocked && snapshot.previewAllowed !== false;

  return Object.freeze({
    mapping,
    render(frame, { paletteFixed = false } = {}) {
      sampleCameraFrameToPlacement(frame, mapping, sampled);
      output.set(base);
      if (!canPreview) return output;
      if (paletteFixed) quantizeFixed();
      for (let n = 0; n < mapping.targetIndices.length; n++) {
        const index = mapping.targetIndices[n], source = n * 4, target = index * 4;
        // Above-layer pixels remain untouched. A transparent camera pixel clears the
        // active cel and therefore reveals the cached lower composite (or transparency
        // in the music-only editor view).
        if (!musicOnly && above[index] >= 0) continue;
        const alpha = sampled[source + 3];
        if (alpha === 0) {
          output[target] = under[target]; output[target + 1] = under[target + 1];
          output[target + 2] = under[target + 2]; output[target + 3] = under[target + 3];
        } else if (alpha === 255) {
          if (paletteFixed) paletteColor(palette, fixedIndices[n], output, target);
          else {
            output[target] = sampled[source]; output[target + 1] = sampled[source + 1];
            output[target + 2] = sampled[source + 2]; output[target + 3] = 255;
          }
        }
        // Partially transparent samples cannot be applied to the indexed artwork;
        // leave their current pixels visible until the existing error explains why.
      }
      return output;
    }
  });
}

/** Paint a subtle boundary for the irregular selection without touching the preview canvas. */
export function drawCameraPlacementBoundary(context, mapping) {
  const scale = context.canvas.width / mapping.width || 4;
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.save(); context.scale(scale, scale);
  context.strokeStyle = 'rgba(255, 226, 115, 0.95)'; context.lineWidth = 1 / scale;
  context.beginPath();
  for (const encoded of mapping.edges) {
    const index = Math.floor(encoded / 4), direction = encoded % 4, x = index % mapping.width, y = Math.floor(index / mapping.width);
    if (direction === 0) { context.moveTo(x, y); context.lineTo(x + 1, y); }
    else if (direction === 1) { context.moveTo(x + 1, y); context.lineTo(x + 1, y + 1); }
    else if (direction === 2) { context.moveTo(x, y + 1); context.lineTo(x + 1, y + 1); }
    else { context.moveTo(x, y); context.lineTo(x, y + 1); }
  }
  context.stroke(); context.restore();
}
