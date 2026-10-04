import { mergeRegionColors } from './region-merge.mjs';

const MAX_FRAME_PIXELS = 256 * 256;
const MAX_UPDATE_MS = 60;
const MAX_PAUSE_MS = 500;
const MAX_CONSECUTIVE_FAILURES = 3;
const PATCH_SAMPLES_PER_AXIS = 9;
const MAX_TRANSLATION = 8;

function frameInfo(frame, label) {
  if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height)
      || frame.width <= 0 || frame.height <= 0 || !frame.data
      || frame.data.length !== frame.width * frame.height * 4) {
    throw new TypeError(`${label} must contain exactly width*height*4 RGBA values`);
  }
  return { width: frame.width, height: frame.height, pixels: frame.width * frame.height };
}
function paletteColors(palette) {
  if (!Array.isArray(palette) || !palette.length) throw new TypeError('palette must be a non-empty array');
  return palette.map((entry, index) => {
    const channels = Array.isArray(entry) || ArrayBuffer.isView(entry) ? [entry[0], entry[1], entry[2]] : entry && typeof entry === 'object' ? [entry.r, entry.g, entry.b] : null;
    if (!channels || channels.some((value) => !Number.isFinite(value) || value < 0 || value > 255)) throw new TypeError(`palette[${index}] must contain RGB channels in 0..255`);
    return channels;
  });
}
function readRgb(data, offset) { return [data[offset], data[offset + 1], data[offset + 2]]; }
function checkedRgb(value, label) {
  const channels = Array.isArray(value) || ArrayBuffer.isView(value) ? [value[0], value[1], value[2]] : value && typeof value === 'object' ? [value.r, value.g, value.b] : null;
  if (!channels || channels.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)) throw new TypeError(`${label} must contain RGB channels in 0..255`);
  return channels;
}
function nearestIndex(color, palette) {
  let best = -1; let distance = Infinity;
  for (let index = 0; index < palette.length; index += 1) {
    const candidate = palette[index]; const dr = color[0] - candidate[0]; const dg = color[1] - candidate[1]; const db = color[2] - candidate[2];
    const next = dr * dr + dg * dg + db * db;
    if (next < distance) { best = index; distance = next; }
  }
  return { index: best, distance };
}
function luma(data, offset) { return 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2]; }
function toOklab(color) {
  const linear = (value) => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; };
  const r = linear(color[0]); const g = linear(color[1]); const b = linear(color[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function labDistance(a, b) { const dl = a[0] - b[0]; const da = a[1] - b[1]; const db = a[2] - b[2]; return Math.hypot(dl, da, db); }
function cloneFrameData(frame) { return new Uint8ClampedArray(frame.data); }
function rawResult(rendered, width, height, seed, sourceIndex, targetIndex, status, processingMs = 0) {
  const info = frameInfo(rendered, 'rendered');
  return { data: cloneFrameData(rendered), mask: new Uint8Array(info.pixels), changedPixels: 0, selectedPixels: 0, status, seed: { ...seed }, sourceIndex, targetIndex, processingMs };
}
function samePixels(a, b) {
  if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) return false;
  for (let i = 0; i < a.data.length; i += 1) if (a.data[i] !== b.data[i]) return false;
  return true;
}
function sceneSignature(frame) {
  const { width, height } = frame; const values = new Uint8Array(64 * 3);
  for (let i = 0; i < 64; i += 1) {
    const x = Math.min(width - 1, Math.floor((i % 8 + 0.5) * width / 8));
    const y = Math.min(height - 1, Math.floor((Math.floor(i / 8) + 0.5) * height / 8));
    const offset = (y * width + x) * 4;
    values[i * 3] = frame.data[offset]; values[i * 3 + 1] = frame.data[offset + 1]; values[i * 3 + 2] = frame.data[offset + 2];
  }
  return values;
}
function signatureDistance(a, b) {
  let total = 0; let largeDifferences = 0;
  for (let i = 0; i < a.length; i += 3) {
    const dr = Math.abs(a[i] - b[i]); const dg = Math.abs(a[i + 1] - b[i + 1]); const db = Math.abs(a[i + 2] - b[i + 2]);
    const difference = (dr + dg + db) / (3 * 255); total += difference;
    if (difference > 0.16) largeDifferences += 1;
  }
  return { mean: total / 64, changedFraction: largeDifferences / 64 };
}
function makePatchOffsets(width, height) {
  const radius = Math.max(10, Math.min(20, Math.round(Math.min(width, height) * 0.1)));
  const stride = Math.max(1, Math.ceil((radius * 2) / (PATCH_SAMPLES_PER_AXIS - 1)));
  const axis = [];
  for (let value = -radius; value <= radius; value += stride) axis.push(value);
  if (axis.at(-1) !== radius) axis.push(radius);
  return axis.flatMap((y) => axis.map((x) => [x, y]));
}
function patchScore(previous, current, seed, dx, dy, offsets) {
  const { width, height } = current;
  let absoluteDifference = 0; let count = 0;
  for (const [ox, oy] of offsets) {
    const x = seed.x + ox; const y = seed.y + oy; const cx = x + dx; const cy = y + dy;
    if (x < 0 || y < 0 || x >= width || y >= height || cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
    const a = (y * width + x) * 4; const b = (cy * width + cx) * 4;
    absoluteDifference += Math.abs(previous.data[a] - current.data[b]);
    absoluteDifference += Math.abs(previous.data[a + 1] - current.data[b + 1]);
    absoluteDifference += Math.abs(previous.data[a + 2] - current.data[b + 2]);
    count += 1;
  }
  if (count < Math.max(12, Math.ceil(offsets.length * 0.42))) return -Infinity;
  return Math.max(0, 1 - absoluteDifference / (count * 3 * 72));
}
function findTranslation(previous, current, seed, offsets) {
  const radius = Math.min(MAX_TRANSLATION, Math.max(3, Math.round(Math.min(current.width, current.height) * 0.06)));
  let best = null; let second = null; let zero = null; const candidates = [];
  for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
    const score = patchScore(previous, current, seed, dx, dy, offsets);
    const candidate = { dx, dy, score };
    candidates.push(candidate);
    if (dx === 0 && dy === 0) zero = candidate;
    if (!best || score > best.score) { second = best; best = candidate; }
    else if (!second || score > second.score) second = candidate;
  }
  if (!best || best.score < 0.64) return { status: 'lost' };
  const ambiguous = best.score - (second?.score ?? -Infinity) < 0.008;
  if (ambiguous) {
    const nearBest = candidates.filter((candidate) => candidate.score >= best.score - 0.025);
    nearBest.sort((a, b) => (a.dx * a.dx + a.dy * a.dy) - (b.dx * b.dx + b.dy * b.dy) || b.score - a.score);
    const leastMotion = nearBest[0];
    if (zero && zero.score >= best.score - 0.025) best = zero;
    else if (leastMotion && leastMotion.score >= best.score - 0.025) best = leastMotion;
    else return { status: 'lost' };
  }
  return { ...best, ambiguous, status: 'tracking' };
}
function maskStats(mask, width, height) {
  let count = 0; let sumX = 0; let sumY = 0; let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let p = 0; p < mask.length; p += 1) if (mask[p]) {
    const x = p % width; const y = Math.floor(p / width); count += 1; sumX += x; sumY += y;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { count, centroidX: count ? sumX / count : 0, centroidY: count ? sumY / count : 0, minX, minY, maxX, maxY };
}
function stableEdgeDelta(before, after, limit, axis) {
  const minKey = axis === 'x' ? 'minX' : 'minY'; const maxKey = axis === 'x' ? 'maxX' : 'maxY';
  const beforeMin = before[minKey]; const afterMin = after[minKey]; const beforeMax = before[maxKey]; const afterMax = after[maxKey];
  if (beforeMax < 0 || afterMax < 0) return 0;
  const beforeSpan = beforeMax - beforeMin; const afterSpan = afterMax - afterMin;
  if (Math.abs(afterSpan - beforeSpan) > 2) return 0;
  if (beforeMin > 0 && afterMin > 0 && beforeMax < limit - 1 && afterMax < limit - 1) {
    return Math.round(((afterMin - beforeMin) + (afterMax - beforeMax)) / 2);
  }
  if (beforeMin === 0 && afterMin === 0 && beforeMax < limit - 1 && afterMax < limit - 1) return afterMax - beforeMax;
  if (beforeMax === limit - 1 && afterMax === limit - 1 && beforeMin > 0 && afterMin > 0) return afterMin - beforeMin;
  return 0;
}
function masksOverlap(previousMask, currentMask, width, height, dx, dy, oldCount, newCount) {
  if (!oldCount || !newCount) return 0;
  const stride = Math.max(1, Math.ceil(oldCount / 4096)); let overlap = 0; let visited = 0;
  for (let p = 0; p < previousMask.length; p += stride) if (previousMask[p]) {
    visited += 1; const x = p % width + dx; const y = Math.floor(p / width) + dy;
    if (x >= 0 && y >= 0 && x < width && y < height && currentMask[y * width + x]) overlap += 1;
  }
  if (!visited) return 0;
  const oldContainment = overlap / visited;
  const newContainment = overlap * stride / newCount;
  return Math.min(oldContainment, newContainment, (overlap * stride) / Math.max(1, oldCount + newCount - overlap * stride));
}
/** Track a conservative connected source surface across a short live-camera sequence. */
export function createLiveRegionMergeTracker({ source, rendered, palette, seed, sourceIndex, mode = 'surface', strength = 55, now = () => performance.now() } = {}) {
  const size = frameInfo(source, 'source'); const renderSize = frameInfo(rendered, 'rendered');
  if (size.width !== renderSize.width || size.height !== renderSize.height) throw new RangeError('source and rendered dimensions must match');
  if (size.pixels > MAX_FRAME_PIXELS) throw new RangeError(`live tracking is bounded to ${MAX_FRAME_PIXELS} pixels`);
  const initialPalette = paletteColors(palette);
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= initialPalette.length) throw new RangeError('sourceIndex must refer to an initial palette entry');
  if (!seed || !Number.isInteger(seed.x) || !Number.isInteger(seed.y) || seed.x < 0 || seed.y < 0 || seed.x >= size.width || seed.y >= size.height) throw new RangeError('seed must be inside the initial frame');
  if (mode !== 'surface' && mode !== 'color') throw new TypeError("mode must be 'surface' or 'color'");
  if (!Number.isFinite(strength) || strength < 0 || strength > 100) throw new RangeError('strength must be in the range 0..100');
  if (typeof now !== 'function') throw new TypeError('now must be a function');
  const referenceColor = initialPalette[sourceIndex].slice();
  const originSeedLab = toOklab(readRgb(source.data, (seed.y * size.width + seed.x) * 4));
  let currentSeedLab = originSeedLab;
  let selectedTargetColor = null;
  let currentSeed = { x: seed.x, y: seed.y };
  let previousSource = { width: size.width, height: size.height, data: cloneFrameData(source) };
  let previousMask = mergeRegionColors({ source, rendered, palette: initialPalette, seed: currentSeed, sourceIndex, targetIndex: sourceIndex, mode: 'surface', strength }).mask;
  let previousStats = maskStats(previousMask, size.width, size.height);
  const initialStats = { ...previousStats };
  const initialSeedFraction = {
    x: initialStats.maxX > initialStats.minX ? (seed.x - initialStats.minX) / (initialStats.maxX - initialStats.minX) : 0.5,
    y: initialStats.maxY > initialStats.minY ? (seed.y - initialStats.minY) / (initialStats.maxY - initialStats.minY) : 0.5
  };
  let previousSignature = sceneSignature(source);
  let lastProcessingMs = 0; let terminalStatus = null;
  let consecutiveFailures = 0; let pauseStartedAt = null;
  const patchOffsets = makePatchOffsets(size.width, size.height);

  const pauseClock = () => {
    const value = now();
    if (!Number.isFinite(value)) throw new TypeError('now must return a finite number');
    return value;
  };

  const endedResult = (nextRendered, nextSeed, nextSourceIndex, nextTargetIndex, status, started) => {
    terminalStatus = status;
    return rawResult(nextRendered, size.width, size.height, nextSeed, nextSourceIndex, nextTargetIndex, status, performance.now() - started);
  };
  const pauseResult = (nextRendered, nextSourceIndex, nextTargetIndex, started) => {
    const pauseNow = pauseClock();
    if (pauseStartedAt === null) pauseStartedAt = pauseNow;
    consecutiveFailures += 1;
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES || pauseNow - pauseStartedAt > MAX_PAUSE_MS) {
      return endedResult(nextRendered, currentSeed, nextSourceIndex, nextTargetIndex, 'lost', started);
    }
    return rawResult(nextRendered, size.width, size.height, currentSeed, nextSourceIndex, nextTargetIndex, 'paused', performance.now() - started);
  };

  return {
    update({ source: nextSource, rendered: nextRendered, palette: nextPalette, targetColor, mode: nextMode = mode, strength: nextStrength = strength, enabled = true } = {}) {
      const started = performance.now();
      if (terminalStatus) return rawResult(nextRendered, size.width, size.height, currentSeed, sourceIndex, -1, terminalStatus, performance.now() - started);
      const nextSourceInfo = frameInfo(nextSource, 'source'); const nextRenderedInfo = frameInfo(nextRendered, 'rendered');
      const colors = paletteColors(nextPalette);
      const sourceMatch = nearestIndex(referenceColor, colors); const mappedSourceIndex = sourceMatch.index;
      const mappedTarget = selectedTargetColor ? nearestIndex(selectedTargetColor, colors) : { index: -1, distance: Infinity };
      if (nextSourceInfo.width !== size.width || nextSourceInfo.height !== size.height
          || nextRenderedInfo.width !== size.width || nextRenderedInfo.height !== size.height
          || nextSourceInfo.width !== nextRenderedInfo.width || nextSourceInfo.height !== nextRenderedInfo.height) {
        return endedResult(nextRendered, currentSeed, mappedSourceIndex, mappedTarget.index, 'scene-changed', started);
      }
      if (nextSourceInfo.pixels > MAX_FRAME_PIXELS) return endedResult(nextRendered, currentSeed, mappedSourceIndex, mappedTarget.index, 'scene-changed', started);
      if (nextMode !== 'surface' && nextMode !== 'color') throw new TypeError("mode must be 'surface' or 'color'");
      if (!Number.isFinite(nextStrength) || nextStrength < 0 || nextStrength > 100) throw new RangeError('strength must be in the range 0..100');
      if (targetColor != null) selectedTargetColor = checkedRgb(targetColor, 'targetColor').slice();
      if (mappedSourceIndex < 0 || sourceMatch.distance > 3 * 65 * 65) return endedResult(nextRendered, currentSeed, mappedSourceIndex, mappedTarget.index, 'scene-changed', started);
      const signature = sceneSignature(nextSource); const signatureDelta = signatureDistance(previousSignature, signature);
      if ((signatureDelta.mean > 0.19 && signatureDelta.changedFraction > 0.32)
          || signatureDelta.changedFraction > 0.78) return endedResult(nextRendered, currentSeed, mappedSourceIndex, mappedTarget.index, 'scene-changed', started);
      if (pauseStartedAt !== null && pauseClock() - pauseStartedAt > MAX_PAUSE_MS) {
        return endedResult(nextRendered, currentSeed, mappedSourceIndex, mappedTarget.index, 'lost', started);
      }
      const targetMatch = selectedTargetColor ? nearestIndex(selectedTargetColor, colors) : { index: -1, distance: Infinity };
      const targetIndex = targetMatch.index;
      if (enabled && selectedTargetColor && targetMatch.distance > 3 * 65 * 65) return pauseResult(nextRendered, mappedSourceIndex, targetIndex, started);
      if (selectedTargetColor && targetIndex < 0) return pauseResult(nextRendered, mappedSourceIndex, targetIndex, started);
      if (lastProcessingMs > MAX_UPDATE_MS) return pauseResult(nextRendered, mappedSourceIndex, targetIndex, started);

      const sameSourcePixels = samePixels(previousSource, nextSource);
      const match = findTranslation(previousSource, nextSource, currentSeed, patchOffsets);
      if (match.status !== 'tracking') return pauseResult(nextRendered, mappedSourceIndex, targetIndex, started);
      const nextSeed = { x: currentSeed.x + match.dx, y: currentSeed.y + match.dy };
      const nextSeedOffset = (nextSeed.y * size.width + nextSeed.x) * 4;
      if (nextSeed.x < 0 || nextSeed.y < 0 || nextSeed.x >= size.width || nextSeed.y >= size.height || nextSource.data[nextSeedOffset + 3] === 0) {
        return pauseResult(nextRendered, mappedSourceIndex, targetIndex, started);
      }
      const nextSeedLab = toOklab(readRgb(nextSource.data, nextSeedOffset));
      if (labDistance(nextSeedLab, originSeedLab) > 0.13 || labDistance(nextSeedLab, currentSeedLab) > 0.085) {
        return pauseResult(nextRendered, mappedSourceIndex, targetIndex, started);
      }
      if (performance.now() - started > 16) return pauseResult(nextRendered, mappedSourceIndex, targetIndex, started);
      if (pauseStartedAt !== null && pauseClock() - pauseStartedAt > MAX_PAUSE_MS) {
        return endedResult(nextRendered, currentSeed, mappedSourceIndex, targetIndex, 'lost', started);
      }

      let merged;
      try {
        merged = mergeRegionColors({ source: nextSource, rendered: nextRendered, palette: colors, seed: nextSeed, sourceIndex: mappedSourceIndex, targetIndex: targetIndex < 0 ? mappedSourceIndex : targetIndex, mode: nextMode, strength: nextStrength });
      } catch {
        return pauseResult(nextRendered, mappedSourceIndex, targetIndex, started);
      }
      const nextStats = maskStats(merged.mask, size.width, size.height);
      const areaRatio = nextStats.count / Math.max(1, previousStats.count);
      const overlap = masksOverlap(previousMask, merged.mask, size.width, size.height, match.dx, match.dy, previousStats.count, nextStats.count);
      const centroidDeltaX = nextStats.centroidX - (previousStats.centroidX + match.dx);
      const centroidDeltaY = nextStats.centroidY - (previousStats.centroidY + match.dy);
      const centroidDrift = Math.hypot(centroidDeltaX, centroidDeltaY);
      const settingOnlyUpdate = sameSourcePixels && match.dx === 0 && match.dy === 0;
      if (!nextStats.count || (!settingOnlyUpdate && (areaRatio < 0.28 || areaRatio > 3.2 || overlap < 0.1 || centroidDrift > Math.max(10, Math.min(size.width, size.height) * 0.12)))) {
        return pauseResult(nextRendered, mappedSourceIndex, targetIndex, started);
      }
      let trackedSeed = nextSeed; let trackedSeedLab = nextSeedLab;
      if (match.ambiguous && !settingOnlyUpdate) {
        const originSpanX = initialStats.maxX - initialStats.minX; const originSpanY = initialStats.maxY - initialStats.minY;
        const currentSpanX = nextStats.maxX - nextStats.minX; const currentSpanY = nextStats.maxY - nextStats.minY;
        const stableUnclippedBox = initialStats.minX > 0 && initialStats.minY > 0
          && initialStats.maxX < size.width - 1 && initialStats.maxY < size.height - 1
          && nextStats.minX > 0 && nextStats.minY > 0 && nextStats.maxX < size.width - 1 && nextStats.maxY < size.height - 1
          && Math.abs(currentSpanX - originSpanX) <= Math.max(2, Math.round(originSpanX * 0.1))
          && Math.abs(currentSpanY - originSpanY) <= Math.max(2, Math.round(originSpanY * 0.1))
          && nextStats.count / Math.max(1, initialStats.count) >= 0.65
          && nextStats.count / Math.max(1, initialStats.count) <= 1.5;
        if (stableUnclippedBox) {
          const anchored = {
            x: Math.round(nextStats.minX + initialSeedFraction.x * currentSpanX),
            y: Math.round(nextStats.minY + initialSeedFraction.y * currentSpanY)
          };
          const anchoredOffset = (anchored.y * size.width + anchored.x) * 4;
          if (Math.abs(anchored.x - nextSeed.x) <= MAX_TRANSLATION && Math.abs(anchored.y - nextSeed.y) <= MAX_TRANSLATION
              && merged.mask[anchored.y * size.width + anchored.x] && nextSource.data[anchoredOffset + 3] > 0) {
            const anchoredLab = toOklab(readRgb(nextSource.data, anchoredOffset));
            if (labDistance(anchoredLab, originSeedLab) <= 0.13 && labDistance(anchoredLab, currentSeedLab) <= 0.085) {
              trackedSeed = anchored; trackedSeedLab = anchoredLab;
            }
          }
        }
        const edgeDeltaX = stableEdgeDelta(previousStats, nextStats, size.width, 'x');
        const edgeDeltaY = stableEdgeDelta(previousStats, nextStats, size.height, 'y');
        const useEdgeDelta = (edgeDeltaX !== 0 || edgeDeltaY !== 0)
          && Math.abs(edgeDeltaX) <= MAX_TRANSLATION && Math.abs(edgeDeltaY) <= MAX_TRANSLATION;
        const correctionX = useEdgeDelta
          ? (match.dx === 0 ? Math.max(-1, Math.min(1, edgeDeltaX)) : 0)
          : Math.max(-1, Math.min(1, Math.round(centroidDeltaX)));
        const correctionY = useEdgeDelta
          ? (match.dy === 0 ? Math.max(-1, Math.min(1, edgeDeltaY)) : 0)
          : Math.max(-1, Math.min(1, Math.round(centroidDeltaY)));
        const corrected = { x: nextSeed.x + correctionX, y: nextSeed.y + correctionY };
        if ((correctionX || correctionY)
            && (useEdgeDelta || (centroidDrift >= 0.55 && centroidDrift <= 2.1))
            && corrected.x >= 0 && corrected.y >= 0 && corrected.x < size.width && corrected.y < size.height
            && merged.mask[corrected.y * size.width + corrected.x]) {
          const correctedOffset = (corrected.y * size.width + corrected.x) * 4;
          const correctedLab = toOklab(readRgb(nextSource.data, correctedOffset));
          if (nextSource.data[correctedOffset + 3] > 0 && labDistance(correctedLab, originSeedLab) <= 0.13
              && labDistance(correctedLab, currentSeedLab) <= 0.085) {
            if (!stableUnclippedBox) { trackedSeed = corrected; trackedSeedLab = correctedLab; }
          }
        }
      }
      const processingMs = performance.now() - started;
      if (processingMs > MAX_UPDATE_MS) return pauseResult(nextRendered, mappedSourceIndex, targetIndex, started);
      if (pauseStartedAt !== null && pauseClock() - pauseStartedAt > MAX_PAUSE_MS) {
        return endedResult(nextRendered, currentSeed, mappedSourceIndex, targetIndex, 'lost', started);
      }

      currentSeed = trackedSeed; currentSeedLab = trackedSeedLab;
      previousSource = { width: size.width, height: size.height, data: cloneFrameData(nextSource) };
      previousMask = new Uint8Array(merged.mask); previousStats = nextStats; previousSignature = signature; lastProcessingMs = processingMs;
      consecutiveFailures = 0; pauseStartedAt = null;
      if (!enabled || targetIndex < 0) return { data: cloneFrameData(nextRendered), mask: merged.mask, changedPixels: 0, selectedPixels: merged.selectedPixels, status: 'tracking', seed: { ...currentSeed }, sourceIndex: mappedSourceIndex, targetIndex, processingMs };
      return { ...merged, status: 'tracking', seed: { ...currentSeed }, sourceIndex: mappedSourceIndex, targetIndex, processingMs };
    }
  };
}
