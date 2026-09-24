const LUMINANCE_BINS = 256;
const MAX_TONES_PER_REGION = 3;
const MIN_LUMINANCE_SPREAD = 16;
const TONE_QUANTILES = Object.freeze([
  Object.freeze({ tone: 'base', quantile: 0.5 }),
  Object.freeze({ tone: 'shadow', quantile: 0.15 }),
  Object.freeze({ tone: 'highlight', quantile: 0.85 })
]);

function luminance(candidate) {
  return 0.2126 * candidate.r + 0.7152 * candidate.g + 0.0722 * candidate.b;
}

function compareStableKey(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const left = String(a), right = String(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

function regionStableKey(region) {
  return region.baseGroupId ?? region.stableKey ?? region.id;
}

function allocationWeight(region) {
  const priority = region.priorityWeight;
  return Number.isFinite(priority) && priority > 0 ? priority : region.weight;
}

function quantileCandidate(region, histogram, quantile, minBin, maxBin) {
  const targetWeight = Math.max(1, region.weight * quantile);
  let accumulated = 0, targetBin = minBin;
  for (; targetBin <= maxBin; targetBin++) {
    accumulated += histogram[targetBin];
    if (accumulated >= targetWeight) break;
  }
  targetBin = Math.min(maxBin, targetBin);
  const targetLuminance = targetBin + 0.5;
  let chosen = null, chosenDistance = Infinity;
  for (const candidate of region.candidates) {
    const value = luminance(candidate);
    if (Math.floor(value) !== targetBin) continue;
    const distance = Math.abs(value - targetLuminance);
    if (!chosen || distance < chosenDistance ||
        (distance === chosenDistance && compareStableKey(candidate.key, chosen.key) < 0)) {
      chosen = candidate;
      chosenDistance = distance;
    }
  }
  return chosen;
}

function strongestLineCandidate(region) {
  let strongest = null;
  for (const candidate of region.candidates) {
    const lineWeight = candidate.lineWeight ?? 0;
    if (lineWeight <= 0) continue;
    if (!strongest || lineWeight > strongest.lineWeight ||
        (lineWeight === strongest.lineWeight && compareStableKey(candidate.key, strongest.key) < 0)) {
      strongest = { candidate, lineWeight, key: candidate.key };
    }
  }
  return strongest?.candidate ?? null;
}

function addUniqueTone(tones, tone, candidate) {
  if (candidate && !tones.some((entry) => entry.candidate.key === candidate.key)) tones.push({ tone, candidate });
}

function describeRegion(region) {
  const histogram = new Uint32Array(LUMINANCE_BINS);
  let minBin = LUMINANCE_BINS - 1, maxBin = 0;
  for (const candidate of region.candidates) {
    const bin = Math.max(0, Math.min(LUMINANCE_BINS - 1, Math.floor(luminance(candidate))));
    histogram[bin] += candidate.weight;
    minBin = Math.min(minBin, bin);
    maxBin = Math.max(maxBin, bin);
  }
  const spread = maxBin - minBin;
  const base = quantileCandidate(region, histogram, 0.5, minBin, maxBin) ?? region.representative;
  const tones = [{ tone: 'base', candidate: base }];
  const lineCandidate = strongestLineCandidate(region);
  const baseLuminance = luminance(base);
  const lineLuminance = lineCandidate ? luminance(lineCandidate) : baseLuminance;
  const usefulLineCandidate = lineCandidate && Math.abs(lineLuminance - baseLuminance) >= 3
    ? lineCandidate : null;

  // Keep the pre-line tone selection byte-for-byte equivalent when no usable
  // line sample is present, so existing renders retain their quantiles.
  if (!usefulLineCandidate && spread >= MIN_LUMINANCE_SPREAD) {
    for (const { tone, quantile } of TONE_QUANTILES.slice(1)) {
      const candidate = quantileCandidate(region, histogram, quantile, minBin, maxBin);
      if (candidate && !tones.some((entry) => entry.candidate.key === candidate.key)) tones.push({ tone, candidate });
    }
  } else if (usefulLineCandidate) {
    const lineTone = lineLuminance < baseLuminance ? 'shadow' : 'highlight';
    const otherTone = lineTone === 'shadow' ? 'highlight' : 'shadow';
    addUniqueTone(tones, lineTone, usefulLineCandidate);
    if (spread >= MIN_LUMINANCE_SPREAD) {
      const quantile = otherTone === 'shadow' ? 0.15 : 0.85;
      const oppositeCandidate = quantileCandidate(region, histogram, quantile, minBin, maxBin);
      addUniqueTone(tones, otherTone, oppositeCandidate);
    }
  }
  return { region, tones, spread, stableKey: regionStableKey(region) };
}

/**
 * Builds a bounded global palette from pre-grouped base-color regions.
 * Each region receives at most one sampled shadow, base, and highlight color.
 * Candidate RGB values are never averaged or synthesized.
 */
export function buildThreeTonePalette(regions, colorLimit = 24) {
  if (!(regions instanceof Map)) throw new TypeError('regions must be a Map');
  if (!Number.isInteger(colorLimit) || colorLimit < 1 || colorLimit > 256) {
    throw new RangeError('colorLimit must be an integer from 1 to 256');
  }

  const regionList = [...regions.values()];
  for (const region of regionList) {
    if (!region || !Array.isArray(region.candidates) || region.candidates.length < 1 ||
        !Number.isFinite(region.weight) || region.weight <= 0) {
      throw new TypeError('each region must contain weighted color candidates');
    }
    for (const candidate of region.candidates) {
      if (candidate.lineWeight !== undefined && (!Number.isFinite(candidate.lineWeight) || candidate.lineWeight < 0)) {
        throw new TypeError('candidate lineWeight must be a non-negative finite number');
      }
    }
    region.paletteIndices = [];
  }

  const descriptions = regionList.map(describeRegion);
  const ordered = [...descriptions].sort((a, b) =>
    allocationWeight(b.region) - allocationWeight(a.region) || compareStableKey(a.stableKey, b.stableKey) ||
    compareStableKey(a.region.id, b.region.id));
  const crowded = colorLimit >= MAX_TONES_PER_REGION && regionList.length > colorLimit / 2;
  const primaryCount = crowded ? Math.floor(colorLimit / MAX_TONES_PER_REGION) : ordered.length;
  const primary = ordered.slice(0, primaryCount);
  const secondary = ordered.slice(primaryCount);
  const palette = [], owners = [], indexByRgb = new Map();

  function addTone(description, tone) {
    const candidate = tone.candidate;
    const rgbKey = `${candidate.r},${candidate.g},${candidate.b}`;
    let index = indexByRgb.get(rgbKey);
    if (index === undefined) {
      if (palette.length >= colorLimit) return false;
      index = palette.length;
      palette.push([candidate.r, candidate.g, candidate.b]);
      owners.push(new Set());
      indexByRgb.set(rgbKey, index);
    }
    if (!owners[index].has(description.region.id)) owners[index].add(description.region.id);
    if (!description.region.paletteIndices.includes(index)) {
      description.region.paletteIndices.push(index);
    }
    return true;
  }

  // Give the largest material regions one representative before spending colors on shade.
  for (const description of primary) addTone(description, description.tones[0]);

  const additionalTones = descriptions.flatMap((description) =>
    description.tones.slice(1).map((tone) => ({
      description,
      tone,
      score: allocationWeight(description.region) * description.spread
    })));
  additionalTones.sort((a, b) =>
    b.score - a.score || compareStableKey(a.description.stableKey, b.description.stableKey) ||
    compareStableKey(a.description.region.id, b.description.region.id) ||
    (a.tone.tone === b.tone.tone ? 0 : a.tone.tone === 'shadow' ? -1 : 1));

  function addAdditionalTones(items) {
    for (const item of items) {
      if (item.description.region.paletteIndices.length >= MAX_TONES_PER_REGION) continue;
      addTone(item.description, item.tone);
    }
  }

  if (crowded) {
    const primarySet = new Set(primary.map((description) => description.region));
    const primaryTones = additionalTones.filter((item) => primarySet.has(item.description.region));

    // In crowded scenes, reserve complete three-tone ramps for the largest materials.
    addAdditionalTones(primaryTones);
    // Use any capacity freed by flat/duplicate primary colors for the remaining materials.
    for (const description of secondary) addTone(description, description.tones[0]);
    addAdditionalTones(additionalTones.filter((item) => !primarySet.has(item.description.region)));
  } else {
    for (const description of secondary) addTone(description, description.tones[0]);
    addAdditionalTones(additionalTones);
  }

  return { palette, owners, regionList };
}
