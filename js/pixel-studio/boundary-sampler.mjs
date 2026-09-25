const MAX_INPUT_PIXELS = 16_000_000;
const MAX_OUTPUT_SIZE = 512;

function validateFrame(frame) {
  if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) ||
      frame.width < 1 || frame.height < 1 || frame.width * frame.height > MAX_INPUT_PIXELS ||
      !(frame.data instanceof Uint8ClampedArray || frame.data instanceof Uint8Array) ||
      frame.data.length !== frame.width * frame.height * 4) {
    throw new TypeError('frame must contain a bounded RGBA pixel buffer');
  }
}

function validateSegmentation(segmentation) {
  if (!segmentation) return false;
  if (!Number.isInteger(segmentation.width) || !Number.isInteger(segmentation.height) ||
      segmentation.width < 1 || segmentation.height < 1 ||
      segmentation.width * segmentation.height > MAX_INPUT_PIXELS ||
      !(segmentation.labels instanceof Uint32Array) ||
      segmentation.labels.length !== segmentation.width * segmentation.height) {
    throw new TypeError('segmentation must contain a bounded Uint32 label map');
  }
  return true;
}

function labelAt(segmentation, x, y, frameWidth, frameHeight) {
  const sx = Math.min(segmentation.width - 1, Math.floor((x + 0.5) * segmentation.width / frameWidth));
  const sy = Math.min(segmentation.height - 1, Math.floor((y + 0.5) * segmentation.height / frameHeight));
  return segmentation.labels[sy * segmentation.width + sx];
}

function outputGeometry(frame, size) {
  const scale = Math.min(1, size / Math.max(frame.width, frame.height));
  return {
    width: Math.max(1, Math.round(frame.width * scale)),
    height: Math.max(1, Math.round(frame.height * scale))
  };
}

function countCellOwners(frame, segmentation, width, height) {
  const cells = width * height;
  const owners = new Uint32Array(cells);
  const counts = new Uint32Array(cells);
  const mixedCounts = new Array(cells);
  const centerLabels = new Uint32Array(cells);

  for (let cy = 0; cy < height; cy++) for (let cx = 0; cx < width; cx++) {
    const sx = Math.min(frame.width - 1, Math.floor((cx + 0.5) * frame.width / width));
    const sy = Math.min(frame.height - 1, Math.floor((cy + 0.5) * frame.height / height));
    centerLabels[cy * width + cx] = labelAt(segmentation, sx, sy, frame.width, frame.height);
  }

  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const cell = Math.min(height - 1, Math.floor(y * height / frame.height)) * width +
      Math.min(width - 1, Math.floor(x * width / frame.width));
    const label = labelAt(segmentation, x, y, frame.width, frame.height);
    if (counts[cell] === 0) {
      owners[cell] = label;
      counts[cell] = 1;
      continue;
    }
    const mixed = mixedCounts[cell];
    if (!mixed) {
      if (owners[cell] === label) { counts[cell]++; continue; }
      mixedCounts[cell] = new Map([[owners[cell], counts[cell]], [label, 1]]);
      continue;
    }
    mixed.set(label, (mixed.get(label) ?? 0) + 1);
  }

  const boundaryCells = new Uint8Array(cells);
  let boundaryCount = 0;
  for (let cell = 0; cell < cells; cell++) {
    const mixed = mixedCounts[cell];
    if (!mixed) continue;
    boundaryCells[cell] = 1;
    boundaryCount++;
    let maximumCount = 0;
    for (const count of mixed.values()) if (count > maximumCount) maximumCount = count;
    const center = centerLabels[cell];
    let selected = mixed.has(center) && mixed.get(center) === maximumCount ? center : Infinity;
    if (selected === Infinity) for (const [label, count] of mixed) {
      if (count === maximumCount && label < selected) selected = label;
    }
    owners[cell] = selected;
  }
  return { owners, boundaryCells, boundaryCount };
}

/** Render each output cell from one real source pixel, preserving current object boundaries. */
export function createBoundarySampler({ size = 256 } = {}) {
  if (!Number.isInteger(size) || size < 1 || size > MAX_OUTPUT_SIZE) {
    throw new RangeError(`size must be an integer from 1 to ${MAX_OUTPUT_SIZE}`);
  }

  function reset() { /* This renderer intentionally keeps no frame history. */ }

  function render(frame, segmentation = null) {
    validateFrame(frame);
    const segmented = validateSegmentation(segmentation);
    const { width, height } = outputGeometry(frame, size);
    const cellCount = width * height;
    let labels, boundaryCells;
    let boundaryCount = 0;

    if (segmented) {
      const counted = countCellOwners(frame, segmentation, width, height);
      labels = counted.owners;
      boundaryCells = counted.boundaryCells;
      boundaryCount = counted.boundaryCount;
    } else {
      labels = new Uint32Array(cellCount).fill(1);
      boundaryCells = new Uint8Array(cellCount);
    }

    const data = new Uint8ClampedArray(cellCount * 4);
    if (!segmented || boundaryCount === 0) {
      // With no segmentation, or a mask that stays constant inside each cell,
      // the center sample is already the nearest real sample for every cell.
      for (let cy = 0; cy < height; cy++) for (let cx = 0; cx < width; cx++) {
        const sx = Math.min(frame.width - 1, Math.floor((cx + 0.5) * frame.width / width));
        const sy = Math.min(frame.height - 1, Math.floor((cy + 0.5) * frame.height / height));
        const source = (sy * frame.width + sx) * 4, target = (cy * width + cx) * 4;
        data[target] = frame.data[source]; data[target + 1] = frame.data[source + 1];
        data[target + 2] = frame.data[source + 2]; data[target + 3] = 255;
      }
    } else {
      for (let cy = 0; cy < height; cy++) for (let cx = 0; cx < width; cx++) {
        const cell = cy * width + cx;
        if (boundaryCells[cell]) continue;
        const sx = Math.min(frame.width - 1, Math.floor((cx + 0.5) * frame.width / width));
        const sy = Math.min(frame.height - 1, Math.floor((cy + 0.5) * frame.height / height));
        const source = (sy * frame.width + sx) * 4, target = cell * 4;
        data[target] = frame.data[source]; data[target + 1] = frame.data[source + 1];
        data[target + 2] = frame.data[source + 2]; data[target + 3] = 255;
      }

      // Only mixed-owner cells need a second, local pass. Select the nearest
      // source sample belonging to the chosen owner, with row-major tie breaks.
      for (let cy = 0; cy < height; cy++) for (let cx = 0; cx < width; cx++) {
        const cell = cy * width + cx;
        if (!boundaryCells[cell]) continue;
        const xStart = Math.ceil(cx * frame.width / width);
        const xEnd = Math.ceil((cx + 1) * frame.width / width);
        const yStart = Math.ceil(cy * frame.height / height);
        const yEnd = Math.ceil((cy + 1) * frame.height / height);
        const targetX = (cx + 0.5) * frame.width / width;
        const targetY = (cy + 0.5) * frame.height / height;
        let bestSource = -1, bestDistance = Infinity;
        for (let y = yStart; y < yEnd; y++) for (let x = xStart; x < xEnd; x++) {
          if (labelAt(segmentation, x, y, frame.width, frame.height) !== labels[cell]) continue;
          const dx = x + 0.5 - targetX, dy = y + 0.5 - targetY;
          const distance = dx * dx + dy * dy;
          if (distance < bestDistance) { bestSource = (y * frame.width + x) * 4; bestDistance = distance; }
        }
        if (bestSource < 0) throw new Error(`selected owner has no source sample in cell ${cell}`);
        const target = cell * 4;
        data[target] = frame.data[bestSource]; data[target + 1] = frame.data[bestSource + 1];
        data[target + 2] = frame.data[bestSource + 2]; data[target + 3] = 255;
      }
    }

    return {
      width, height, data, labels, segmented,
      stats: {
        quality: segmented ? 'segmented' : 'unsegmented',
        shading: 'source-sampled',
        dither: 'none',
        paletteLocked: false,
        temporalHeldCells: 0,
        boundaryCells: boundaryCount
      }
    };
  }

  return { render, reset };
}
