const GRID = 48;
const MAX_INSTANCES = 32;
const distance = (a, b) => a.reduce((sum, value, c) => sum + Math.abs(value - b[c]), 0) / 3;

function signature(frame) {
  const values = new Uint8Array(16 * 16 * 3);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const sx = Math.min(frame.width - 1, Math.floor((x + 0.5) * frame.width / 16));
    const sy = Math.min(frame.height - 1, Math.floor((y + 0.5) * frame.height / 16));
    const p = (sy * frame.width + sx) * 4;
    values.set(frame.data.subarray(p, p + 3), (y * 16 + x) * 3);
  }
  return values;
}

function describe(instance, width, height, frame) {
  const small = new Uint8Array(GRID * GRID);
  let area = 0, xSum = 0, ySum = 0;
  const rgb = [0, 0, 0];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const mx = Math.min(width - 1, Math.floor((x + 0.5) * width / GRID));
    const my = Math.min(height - 1, Math.floor((y + 0.5) * height / GRID));
    if (!instance.mask[my * width + mx]) continue;
    small[y * GRID + x] = 1;
    area++; xSum += x; ySum += y;
    const sx = Math.min(frame.width - 1, Math.floor((x + 0.5) * frame.width / GRID));
    const sy = Math.min(frame.height - 1, Math.floor((y + 0.5) * frame.height / GRID));
    const p = (sy * frame.width + sx) * 4;
    for (let c = 0; c < 3; c++) rgb[c] += frame.data[p + c];
  }
  return { small, area, cx: area ? xSum / area : 0, cy: area ? ySum / area : 0, rgb: rgb.map(v => v / Math.max(1, area)) };
}

function overlap(current, prior, dx = 0, dy = 0) {
  let intersection = 0;
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    const px = x - dx, py = y - dy;
    if (px >= 0 && py >= 0 && px < GRID && py < GRID && current.small[y * GRID + x] && prior.small[py * GRID + px]) intersection++;
  }
  return intersection / Math.max(1, current.area + prior.area - intersection);
}

function matchScore(current, prior) {
  if (!current.area || !prior.area) return 0;
  const ratio = current.area / prior.area;
  const dx = Math.round(current.cx - prior.cx), dy = Math.round(current.cy - prior.cy);
  if (ratio < 0.6 || ratio > 1.7 || Math.hypot(dx, dy) > GRID * 0.18 || distance(current.rgb, prior.rgb) > 35) return 0;
  const direct = overlap(current, prior);
  if (direct < 0.15) return 0;
  return overlap(current, prior, dx, dy) * 0.7 + direct * 0.3;
}

/** Conservative geometric association, not learned tracking or depth estimation.
 * Ambiguous, missing, cut, or stale objects receive new IDs. No old masks are
 * drawn and disappeared tracks are not kept for speculative re-identification.
 */
export function createObjectTracker() {
  let previous = null;
  let nextId = 1;
  function reset() { previous = null; }
  function track(segmentation, frame, { timestamp = performance.now() } = {}) {
    const { width, height, instances } = segmentation ?? {};
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 4e6 ||
        !Array.isArray(instances) || instances.length > MAX_INSTANCES || !Number.isFinite(timestamp)) throw new TypeError('Invalid segmentation or timestamp');
    if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 1 || frame.height < 1 || frame.width * frame.height > 16e6 ||
        !(frame.data instanceof Uint8ClampedArray || frame.data instanceof Uint8Array) || frame.data.length !== frame.width * frame.height * 4) throw new TypeError('Invalid source frame');
    const seen = new Set();
    for (const instance of instances) {
      if (!instance || !Number.isInteger(instance.id) || instance.id < 1 || seen.has(instance.id) || !Number.isFinite(instance.score) || instance.score < 0 || instance.score > 1 ||
          !(instance.mask instanceof Uint8Array) || instance.mask.length !== width * height) throw new TypeError('Invalid instance');
      seen.add(instance.id);
      for (const value of instance.mask) if (value !== 0 && value !== 1) throw new TypeError('Masks must be binary');
    }
    const imageSignature = signature(frame);
    let resetReason = null;
    if (previous) {
      if (previous.width !== width || previous.height !== height || previous.frameWidth !== frame.width || previous.frameHeight !== frame.height) resetReason = 'geometry';
      else if (timestamp <= previous.timestamp || timestamp - previous.timestamp > 30000) resetReason = 'time-gap';
      else {
        let total = 0;
        for (let i = 0; i < imageSignature.length; i++) total += Math.abs(imageSignature[i] - previous.signature[i]);
        if (total / imageSignature.length > 48) resetReason = 'scene-cut';
      }
    }
    if (resetReason) previous = null;
    const descriptions = instances.map(instance => describe(instance, width, height, frame));
    const old = previous?.tracks ?? [];
    const scores = descriptions.map(current => old.map(prior => matchScore(current, prior)));
    const used = new Set();
    let matchedCount = 0;
    const output = instances.map((instance, i) => {
      const ranked = scores[i].map((score, j) => ({ score, j })).sort((a,b) => b.score - a.score || a.j - b.j);
      const best = ranked[0];
      let id = 0;
      if (best && best.score >= 0.65 && best.score - (ranked[1]?.score ?? 0) >= 0.12 && !used.has(best.j)) {
        const competitors = scores.map((row,k) => k === i ? 0 : row[best.j]);
        if (best.score - Math.max(0, ...competitors) >= 0.12) {
          id = old[best.j].id; used.add(best.j); matchedCount++;
        }
      }
      if (!id) {
        if (nextId > 0xffffffff) throw new RangeError('Object ID capacity reached; restart camera');
        id = nextId++;
      }
      return { ...instance, proposalId: instance.id, id };
    });
    previous = {
      width, height, frameWidth: frame.width, frameHeight: frame.height, timestamp,
      signature: imageSignature,
      tracks: descriptions.map((description, i) => ({ ...description, id: output[i].id }))
    };
    return { ...segmentation, instances: output, tracked: true, tracking: 'conservative-mask-association', resetReason, matchedCount };
  }
  return { track, reset };
}
