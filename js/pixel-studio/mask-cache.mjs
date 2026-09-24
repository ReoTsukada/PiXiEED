const DEFAULTS = Object.freeze({
  maxAgeMs: 15000,
  reuseExactFrame: false,
  gridWidth: 128,
  gridHeight: 128,
  cellChangeThreshold: 24,
  sceneChangeThreshold: 42,
  sceneChangedFraction: 0.42,
  sourcePixelChangeThreshold: 12,
  maxSourceSnapshotBytes: 32 * 1024 * 1024
});

function validateFrame(frame) {
  if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) ||
      frame.width < 1 || frame.height < 1 || frame.width * frame.height > 16_000_000 ||
      !(frame.data instanceof Uint8Array || frame.data instanceof Uint8ClampedArray) ||
      frame.data.length !== frame.width * frame.height * 4) {
    throw new TypeError('frame must contain a bounded RGBA buffer');
  }
}

function signature(frame, gridWidth, gridHeight) {
  const columns = Math.min(gridWidth, frame.width);
  const rows = Math.min(gridHeight, frame.height);
  const rgb = new Uint8Array(columns * rows * 3);
  for (let gy = 0; gy < rows; gy++) {
    const y0 = Math.floor(gy * frame.height / rows);
    const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * frame.height / rows));
    for (let gx = 0; gx < columns; gx++) {
      const x0 = Math.floor(gx * frame.width / columns);
      const x1 = Math.max(x0 + 1, Math.floor((gx + 1) * frame.width / columns));
      let r = 0, g = 0, b = 0, count = 0;
      for (let y = y0; y < Math.min(frame.height, y1); y++) {
        for (let x = x0; x < Math.min(frame.width, x1); x++) {
          const p = (y * frame.width + x) * 4;
          r += frame.data[p]; g += frame.data[p + 1]; b += frame.data[p + 2]; count++;
        }
      }
      const i = (gy * columns + gx) * 3;
      rgb[i] = Math.round(r / count);
      rgb[i + 1] = Math.round(g / count);
      rgb[i + 2] = Math.round(b / count);
    }
  }
  return rgb;
}

function sourceRgbSnapshot(frame, maxBytes) {
  const byteLength = frame.width * frame.height * 3;
  if (byteLength > maxBytes) return null;
  const rgb = new Uint8Array(byteLength);
  for (let source = 0, target = 0; source < frame.data.length; source += 4, target += 3) {
    rgb[target] = frame.data[source];
    rgb[target + 1] = frame.data[source + 1];
    rgb[target + 2] = frame.data[source + 2];
  }
  return rgb;
}

function compareSourcePixels(previous, frame, threshold) {
  let changed = 0, exact = true;
  for (let pixel = 0, p = 0; p < previous.length; pixel++, p += 3) {
    const source = pixel * 4;
    if (previous[p] !== frame.data[source] || previous[p + 1] !== frame.data[source + 1] || previous[p + 2] !== frame.data[source + 2]) exact = false;
    if (Math.abs(previous[p] - frame.data[source]) > threshold ||
        Math.abs(previous[p + 1] - frame.data[source + 1]) > threshold ||
        Math.abs(previous[p + 2] - frame.data[source + 2]) > threshold) changed++;
  }
  return { changed, exact };
}

function compareSignatures(previous, current, options) {
  let total = 0, changed = 0;
  for (let cell = 0; cell < previous.length / 3; cell++) {
    const i = cell * 3;
    const delta = (Math.abs(previous[i] - current[i]) + Math.abs(previous[i + 1] - current[i + 1]) + Math.abs(previous[i + 2] - current[i + 2])) / 3;
    total += delta;
    if (delta >= options.cellChangeThreshold) changed++;
  }
  const count = previous.length / 3;
  return { meanDelta: total / count, changedFraction: changed / count };
}

/**
 * Short-lived mask reuse guarded by 128-cell-scale source color checks. Any
 * local movement beyond the tolerance rejects the whole mask; this is
 * deliberately conservative and is not a motion tracker.
 */
export function createMaskCache(options = {}) {
  const config = { ...DEFAULTS, ...options };
  if (typeof config.reuseExactFrame !== 'boolean' || !Number.isFinite(config.maxAgeMs) || config.maxAgeMs < 1 ||
      !Number.isInteger(config.gridWidth) || config.gridWidth < 2 ||
      !Number.isInteger(config.gridHeight) || config.gridHeight < 2 ||
      !Number.isFinite(config.cellChangeThreshold) || config.cellChangeThreshold < 0 ||
      !Number.isFinite(config.sceneChangeThreshold) || config.sceneChangeThreshold < 0 ||
      !Number.isFinite(config.sceneChangedFraction) || config.sceneChangedFraction <= 0 || config.sceneChangedFraction > 1 ||
      !Number.isFinite(config.sourcePixelChangeThreshold) || config.sourcePixelChangeThreshold < 0 || config.sourcePixelChangeThreshold > 255 ||
      !Number.isSafeInteger(config.maxSourceSnapshotBytes) || config.maxSourceSnapshotBytes < 0) {
    throw new RangeError('invalid mask-cache settings');
  }

  let entry = null;

  function reset() { entry = null; }

  function store({ frame, labels, width, height, session, jobId, now = Date.now(), capturedAt = now, model = null, instanceCount = 0, trackingMatches = 0, aiProcessingMs = 0 } = {}) {
    validateFrame(frame);
    if (!(labels instanceof Uint32Array) || !Number.isInteger(width) || !Number.isInteger(height) ||
        width < 1 || height < 1 || width * height > 4_000_000 || labels.length !== width * height ||
        !Number.isFinite(now) || !Number.isFinite(capturedAt)) throw new TypeError('mask result must contain a bounded Uint32 label map');
    let labeled = 0;
    for (const label of labels) if (label) labeled++;
    entry = {
      width: frame.width, height: frame.height, session, jobId, createdAt: capturedAt, noInstances: false,
      labelsWidth: width, labelsHeight: height, labels,
      coverage: labeled / labels.length,
      signature: signature(frame, config.gridWidth, config.gridHeight),
      sourceRgb: sourceRgbSnapshot(frame, config.maxSourceSnapshotBytes),
      model, instanceCount, trackingMatches, aiProcessingMs
    };
    return true;
  }

  function storeEmpty(options = {}) {
    store({ ...options, labels: new Uint32Array(1), width: 1, height: 1, instanceCount: 0, trackingMatches: 0 });
    entry.noInstances = true;
    entry.labels = null;
    return true;
  }

  function validResult(ageMs, meanDelta = 0, exactFrame = false) {
    return {
      mask: entry.noInstances ? null : { width: entry.labelsWidth, height: entry.labelsHeight, labels: entry.labels },
      reason: entry.noInstances ? 'no-instances' : 'valid', ageMs,
      coverage: entry.coverage, model: entry.model, instanceCount: entry.instanceCount,
      trackingMatches: entry.trackingMatches, aiProcessingMs: entry.aiProcessingMs,
      changedFraction: 0, meanDelta, sourceChangedPixels: 0, sourceChangedFraction: 0,
      ...(config.reuseExactFrame ? { exactFrame } : {})
    };
  }

  function get({ frame, session, now = Date.now() } = {}) {
    validateFrame(frame);
    if (!Number.isFinite(now)) throw new TypeError('now must be finite');
    if (!entry) return { mask: null, reason: 'empty', ageMs: null, coverage: 0 };
    const ageMs = Math.max(0, now - entry.createdAt);
    if (entry.session !== session) {
      reset();
      return { mask: null, reason: 'session', ageMs, coverage: 0 };
    }
    if (frame.width !== entry.width || frame.height !== entry.height) {
      reset();
      return { mask: null, reason: 'geometry', ageMs, coverage: 0 };
    }
    // A complete RGB match authorizes reuse without pretending the inference
    // was captured more recently. Any changed byte returns to the normal TTL.
    const sourceComparison = config.reuseExactFrame && entry.sourceRgb
      ? compareSourcePixels(entry.sourceRgb, frame, config.sourcePixelChangeThreshold) : null;
    if (sourceComparison?.exact) return validResult(ageMs, 0, true);
    if (entry.noInstances) {
      reset();
      return { mask: null, reason: 'changed-region', ageMs, coverage: 0 };
    }
    if (ageMs > config.maxAgeMs) {
      reset();
      return { mask: null, reason: 'expired', ageMs, coverage: 0 };
    }

    const compared = compareSignatures(entry.signature, signature(frame, config.gridWidth, config.gridHeight), config);
    if (compared.meanDelta >= config.sceneChangeThreshold || compared.changedFraction >= config.sceneChangedFraction) {
      reset();
      return { mask: null, reason: 'scene-change', ageMs, coverage: 0, ...compared };
    }
    if (!entry.sourceRgb) {
      reset();
      return { mask: null, reason: 'changed-region', ageMs, coverage: 0, ...compared, sourceSnapshotUnavailable: true };
    }
    const sourceChangedPixels = (sourceComparison ?? compareSourcePixels(entry.sourceRgb, frame, config.sourcePixelChangeThreshold)).changed;
    if (sourceChangedPixels > 0) {
      reset();
      return {
        mask: null, reason: 'changed-region', ageMs, coverage: 0, ...compared,
        sourceChangedPixels,
        sourceChangedFraction: sourceChangedPixels / (frame.width * frame.height)
      };
    }
    if (compared.changedFraction > 0) {
      reset();
      return { mask: null, reason: 'changed-region', ageMs, coverage: 0, ...compared };
    }

    return validResult(ageMs, compared.meanDelta);
  }

  return { store, storeEmpty, get, reset };
}
