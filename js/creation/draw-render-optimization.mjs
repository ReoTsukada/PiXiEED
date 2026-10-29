/** Small bounded cache for immutable animation frame renderings. */
export function createAnimationFrameCache({ maxEntries = 128, maxBytes = 2 * 1024 * 1024 } = {}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 0 || !Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('Frame cache limits must be non-negative safe integers');
  }
  const animationIds = new WeakMap();
  const entries = new Map();
  let nextAnimationId = 1;
  let retainedBytes = 0;

  function keyFor(animation, frameKey) {
    if (!animation || (typeof animation !== 'object' && typeof animation !== 'function')) throw new TypeError('Animation cache key must be an object');
    if (typeof frameKey !== 'string') throw new TypeError('Animation frame cache key must be a string');
    let id = animationIds.get(animation);
    if (id === undefined) { id = nextAnimationId++; animationIds.set(animation, id); }
    return `${id}\u0000${frameKey}`;
  }

  return {
    get(animation, frameKey) {
      const key = keyFor(animation, frameKey);
      const entry = entries.get(key);
      if (!entry) return undefined;
      entries.delete(key); entries.set(key, entry);
      return entry.value;
    },
    set(animation, frameKey, value, bytes) {
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw new RangeError('Frame cache entry size must be a non-negative safe integer');
      const key = keyFor(animation, frameKey);
      const previous = entries.get(key);
      if (previous) { retainedBytes -= previous.bytes; entries.delete(key); }
      if (maxEntries === 0 || bytes > maxBytes) return value;
      entries.set(key, { value, bytes }); retainedBytes += bytes;
      while (entries.size > maxEntries || retainedBytes > maxBytes) {
        const oldestKey = entries.keys().next().value;
        const oldest = entries.get(oldestKey);
        entries.delete(oldestKey); retainedBytes -= oldest.bytes;
      }
      return value;
    },
    clear() { entries.clear(); retainedBytes = 0; },
    snapshot() { return { entries: entries.size, retainedBytes }; }
  };
}

/** Update reusable onion ImageData and return the smallest dirty rectangle. */
export function updateOnionImageData(image, display, previous, next, changed = null) {
  const width = image?.width, height = image?.height, data = image?.data;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
      || !(data instanceof Uint8ClampedArray) || data.length !== width * height * 4) {
    throw new TypeError('Onion image data dimensions are invalid');
  }
  if (display?.width !== width || display?.height !== height
      || (!display?.rgba && !display?.pixels)
      || display.rgba && display.rgba.length !== data.length
      || display.pixels && display.pixels.length !== width * height) {
    throw new TypeError('Onion display dimensions are invalid');
  }
  for (const guide of [previous, next]) {
    if (guide && (guide.width !== width || guide.height !== height || !guide.rgba || guide.rgba.length !== data.length)) {
      throw new TypeError('Onion guide dimensions are invalid');
    }
  }
  if (changed !== null && (!changed || typeof changed[Symbol.iterator] !== 'function')) {
    throw new TypeError('Changed onion pixels must be iterable or null');
  }

  let minX = width, minY = height, maxX = -1, maxY = -1;
  const updatePixel = (index) => {
    if (!Number.isInteger(index) || index < 0 || index >= width * height) return;
    const offset = index * 4;
    const x = index % width, y = Math.floor(index / width);
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    data[offset] = 0; data[offset + 1] = 0; data[offset + 2] = 0; data[offset + 3] = 0;
    const active = display.rgba ? display.rgba[offset + 3] > 0 : display.pixels[index] >= 0;
    if (!active) {
      const hasPrevious = Boolean(previous?.rgba[offset + 3] > 0);
      const hasNext = Boolean(next?.rgba[offset + 3] > 0);
      if (hasPrevious) { data[offset] = 255; data[offset + 1] = 100; data[offset + 2] = 110; data[offset + 3] = 95; }
      else if (hasNext) { data[offset] = 85; data[offset + 1] = 185; data[offset + 2] = 255; data[offset + 3] = 95; }
      else return;
    }
  };

  if (changed === null) {
    for (let index = 0; index < width * height; index++) updatePixel(index);
  } else {
    for (const index of changed) updatePixel(index);
  }
  return maxX < minX ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Coalesce repeated UI invalidations while keeping underlying input updates synchronous. */
export function createFrameBatcher({ requestFrame, cancelFrame, callback } = {}) {
  if (typeof requestFrame !== 'function' || typeof cancelFrame !== 'function' || typeof callback !== 'function') {
    throw new TypeError('Frame batcher requires request, cancel and callback functions');
  }
  let queued = false, frameId = null, disposed = false;
  const cancel = () => {
    if (!queued) return;
    cancelFrame(frameId); queued = false; frameId = null;
  };
  return {
    schedule() {
      if (disposed || queued) return;
      queued = true;
      frameId = requestFrame(() => {
        queued = false; frameId = null;
        if (!disposed) callback();
      });
    },
    cancel,
    dispose() { if (disposed) return; disposed = true; cancel(); }
  };
}


/**
 * Collect the pixels of multiple pointer samples and paint at most once per
 * animation frame. Writes to the document remain synchronous, only rendering
 * is coalesced; cancelling a stroke drops stale dirty indices.
 */
export function createStrokePaintScheduler({ requestFrame, cancelFrame, paint, maxDirtyPixels = 16384 } = {}) {
  if (typeof paint !== 'function' || !Number.isSafeInteger(maxDirtyPixels) || maxDirtyPixels < 1) {
    throw new TypeError('Stroke painter needs a paint callback and a positive dirty-pixel limit');
  }
  const pending = new Set();
  let full = false, disposed = false;
  function render() {
    if (disposed) return;
    const changed = full ? null : Array.from(pending);
    pending.clear(); full = false;
    if (changed === null || changed.length) paint(changed);
  }
  const batcher = createFrameBatcher({ requestFrame, cancelFrame, callback: render });
  return {
    queue(indices) {
      if (disposed) return false;
      if (!indices || typeof indices === 'string' || typeof indices[Symbol.iterator] !== 'function') throw new TypeError('Dirty stroke pixels must be iterable');
      let touched = false;
      for (const index of indices) {
        if (!Number.isSafeInteger(index) || index < 0) continue;
        touched = true;
        if (full) break;
        pending.add(index);
        if (pending.size > maxDirtyPixels) { pending.clear(); full = true; }
      }
      if (touched) batcher.schedule();
      return touched;
    },
    flush() {
      if (disposed) return;
      batcher.cancel(); render();
    },
    cancel() { batcher.cancel(); pending.clear(); full = false; },
    dispose() { if (disposed) return; disposed = true; batcher.dispose(); pending.clear(); full = false; },
  };
}
