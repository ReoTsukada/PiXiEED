import { recognitionColor } from './fixed-palette.mjs';
import { fitTone, grayLevels, grayLight } from './global-tones.mjs';

const MAX_EDGE = 512;
const MAX_PIXELS = MAX_EDGE * MAX_EDGE;
const MAX_PROTOTYPES = 12;
const PALETTE_LIMIT = 24;
const SHADOW_RGB = [43, 43, 43];
const MAIN_COLOR_CHROMA_SCALE = 1;

function validateRgb(rgb) {
  if (!(rgb instanceof Uint8Array) && !(rgb instanceof Uint8ClampedArray)) {
    throw new TypeError('rgb must be a Uint8Array of RGB triplets');
  }
  if (rgb.length === 0 || rgb.length % 3 !== 0 || rgb.length / 3 > MAX_PIXELS) {
    throw new RangeError('rgb must contain 1 to 512x512 RGB pixels');
  }
  return rgb.length / 3;
}

function validateGeometry(geometry, pixelCount) {
  if (geometry == null) return null;
  const { width, height, protectedCells = null } = geometry;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width * height !== pixelCount || width > MAX_EDGE || height > MAX_EDGE) {
    throw new RangeError('geometry width and height must match the RGB pixel count');
  }
  if (protectedCells != null &&
      (!(protectedCells instanceof Uint8Array || protectedCells instanceof Uint8ClampedArray) ||
       protectedCells.length !== pixelCount)) {
    throw new TypeError('geometry.protectedCells must be a byte array matching width * height');
  }
  if (protectedCells != null) {
    for (let i = 0; i < protectedCells.length; i++) {
      if (protectedCells[i] !== 0 && protectedCells[i] !== 1) {
        throw new RangeError(`geometry.protectedCells value at ${i} must be 0 or 1`);
      }
    }
  }
  return { width, height, protectedCells };
}

function validateParallel(values, pixelCount, name) {
  if (values == null) return;
  if ((!Array.isArray(values) && !ArrayBuffer.isView(values)) || values.length !== pixelCount) {
    throw new TypeError(`${name} must contain one value per pixel`);
  }
}

function cohortFor(gray) {
  return gray < 64 ? 0 : gray < 128 ? 1 : gray < 192 ? 2 : 3;
}

function channelKey(materialKey, cohort) {
  return `${materialKey}:${cohort}`;
}

function hueGroupKey(materialKey) {
  if (materialKey === 0) return 'neutral';
  const hueBin = Math.floor((materialKey - 1) / 2);
  // Pair adjacent fine hue bins, pairing the last bin with red across wrap.
  return `h${Math.floor(((hueBin + 1) % 24) / 2)}`;
}

function signature(candidate) {
  return `${candidate.materialKey}:${candidate.cohort}:${candidate.rgb.map(Math.round).join(',')}`;
}

function compareCandidates(a, b) {
  return a.materialKey - b.materialKey || a.cohort - b.cohort ||
    a.rgb[0] - b.rgb[0] || a.rgb[1] - b.rgb[1] || a.rgb[2] - b.rgb[2] ||
    (a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0);
}

function finalizeRegions(regions, rgb, weights, ownerOfPixel) {
  for (const region of regions) {
    region.meanRgb = [region.red / region.weight, region.green / region.weight, region.blue / region.weight];
    region.medoidDistance = Infinity;
    region.medoidKey = Infinity;
    region.medoid = null;
  }
  for (let pixel = 0; pixel < rgb.length / 3; pixel++) {
    const weight = weights == null ? 1 : weights[pixel];
    if (weight === 0) continue;
    const region = ownerOfPixel(pixel);
    if (region < 0) continue;
    const entry = regions[region];
    const offset = pixel * 3;
    const r = rgb[offset], g = rgb[offset + 1], b = rgb[offset + 2];
    const distance = (r - entry.meanRgb[0]) ** 2 + (g - entry.meanRgb[1]) ** 2 + (b - entry.meanRgb[2]) ** 2;
    const key = (r << 16) | (g << 8) | b;
    if (distance < entry.medoidDistance || (distance === entry.medoidDistance && key < entry.medoidKey)) {
      entry.medoidDistance = distance;
      entry.medoidKey = key;
      entry.medoid = [r, g, b];
    }
  }
  for (const region of regions) {
    region.rgb = region.medoid;
    delete region.red;
    delete region.green;
    delete region.blue;
    delete region.meanRgb;
    delete region.medoidDistance;
    delete region.medoidKey;
    delete region.medoid;
    const chroma = Math.max(...region.rgb) - Math.min(...region.rgb);
    const sat = chroma / Math.max(1, Math.max(...region.rgb));
    region.neutral = sat < 0.12 || chroma < 12;
    region.signature = signature(region);
  }
  return regions;
}

function descriptor(rgb) {
  const [r, g, b] = rgb;
  const gray = grayLight(r, g, b);
  // Opponent-color coordinates preserve hue direction while gray retains tone.
  return [(r - g) / 255, (g - b) / 255, gray / 255];
}

function distanceSquared(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

/** Fine hue/saturation identity used only for source-surface recognition. */
export function recognitionSurfaceKey(r, g, b, saturation = 1.25) {
  const analysis = recognitionColor(r, g, b, saturation);
  const maximum = Math.max(r, g, b), minimum = Math.min(r, g, b);
  const sourceChroma = maximum - minimum;
  const sourceSat = maximum === 0 ? 0 : sourceChroma / maximum;
  if (sourceChroma < 12 || sourceSat < 0.12) return 0;
  const analysisMax = Math.max(...analysis), analysisMin = Math.min(...analysis);
  const chroma = analysisMax - analysisMin;
  let hue;
  if (analysis[0] === analysisMax) hue = ((analysis[1] - analysis[2]) / chroma) % 6;
  else if (analysis[1] === analysisMax) hue = (analysis[2] - analysis[0]) / chroma + 2;
  else hue = (analysis[0] - analysis[1]) / chroma + 4;
  hue = ((hue * 60) % 360 + 360) % 360;
  // Center one bin on red so values just below and above 360 degrees agree.
  const hueBin = Math.floor(((hue + 7.5) % 360) / 15) % 24;
  const analysisSat = analysisMax === 0 ? 0 : chroma / analysisMax;
  return 1 + hueBin * 2 + (analysisSat >= 0.45 ? 1 : 0);
}

function collectRegions(rgb, objects, weights, saturation, geometry) {
  const pixelCount = rgb.length / 3;
  if (!geometry) {
    // Without a spatial mask, use a bounded 4-bit RGB histogram per recognition
    // key and brightness cohort instead of treating every pixel as a region.
    const bins = new Map();
    const ownerByBin = new Map();
    for (let pixel = 0; pixel < pixelCount; pixel++) {
      const weight = weights == null ? 1 : weights[pixel];
      if (weight === 0) continue;
      const offset = pixel * 3;
      const r = rgb[offset], g = rgb[offset + 1], b = rgb[offset + 2];
      const materialKey = recognitionSurfaceKey(r, g, b, saturation);
      const cohort = cohortFor(grayLight(r, g, b));
      const binKey = `${materialKey}:${cohort}:${r >> 4}:${g >> 4}:${b >> 4}`;
      let bin = bins.get(binKey);
      if (!bin) {
        bin = { materialKey, cohort, weight: 0, area: 0, red: 0, green: 0, blue: 0 };
        bins.set(binKey, bin);
      }
      bin.weight += weight;
      bin.area++;
      bin.red += r * weight;
      bin.green += g * weight;
      bin.blue += b * weight;
    }
    const regions = [...bins.entries()].map(([key, bin], index) => {
      ownerByBin.set(key, index);
      return {
        materialKey: bin.materialKey,
        cohort: bin.cohort,
        rgb: null,
        descriptor: null,
        weight: bin.weight,
        area: bin.area,
        protectedCount: 0,
        red: bin.red,
        green: bin.green,
        blue: bin.blue,
        signature: key
      };
    });
    finalizeRegions(regions, rgb, weights, (pixel) => {
      const offset = pixel * 3;
      const r = rgb[offset], g = rgb[offset + 1], b = rgb[offset + 2];
      const key = `${recognitionSurfaceKey(r, g, b, saturation)}:${cohortFor(grayLight(r, g, b))}:${r >> 4}:${g >> 4}:${b >> 4}`;
      return ownerByBin.get(key) ?? -1;
    });
    for (const region of regions) region.descriptor = descriptor(region.rgb);
    return regions;
  }
  const seen = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const regionOfPixel = new Int32Array(pixelCount);
  regionOfPixel.fill(-1);
  const regions = [];

  for (let start = 0; start < pixelCount; start++) {
    const startOffset = start * 3;
    const startWeight = weights == null ? 1 : weights[start];
    if (seen[start] || startWeight === 0) {
      seen[start] = 1;
      continue;
    }
    const startR = rgb[startOffset], startG = rgb[startOffset + 1], startB = rgb[startOffset + 2];
    const materialKey = recognitionSurfaceKey(startR, startG, startB, saturation);
    const cohort = cohortFor(grayLight(startR, startG, startB));
    let read = 0, write = 0;
    queue[write++] = start;
    seen[start] = 1;
    let totalWeight = 0, red = 0, green = 0, blue = 0, area = 0, protectedCount = 0;

    while (read < write) {
      const pixel = queue[read++];
      const offset = pixel * 3;
      const weight = weights == null ? 1 : weights[pixel];
      if (weight > 0) {
        totalWeight += weight;
        red += rgb[offset] * weight;
        green += rgb[offset + 1] * weight;
        blue += rgb[offset + 2] * weight;
        area++;
      }
      if (geometry.protectedCells?.[pixel]) protectedCount++;
      const x = pixel % geometry.width, y = Math.floor(pixel / geometry.width);
      const neighbors = [
        x > 0 ? pixel - 1 : -1,
        x + 1 < geometry.width ? pixel + 1 : -1,
        y > 0 ? pixel - geometry.width : -1,
        y + 1 < geometry.height ? pixel + geometry.width : -1
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || seen[neighbor]) continue;
        const neighborWeight = weights == null ? 1 : weights[neighbor];
        if (neighborWeight === 0) { seen[neighbor] = 1; continue; }
        const neighborOffset = neighbor * 3;
        if (recognitionSurfaceKey(rgb[neighborOffset], rgb[neighborOffset + 1], rgb[neighborOffset + 2], saturation) !== materialKey ||
            cohortFor(grayLight(rgb[neighborOffset], rgb[neighborOffset + 1], rgb[neighborOffset + 2])) !== cohort ||
            (objects != null && objects[neighbor] !== objects[pixel])) continue;
        seen[neighbor] = 1;
        queue[write++] = neighbor;
      }
    }
    if (totalWeight <= 0 || area <= 0) continue;
    const regionIndex = regions.length;
    for (let i = 0; i < write; i++) regionOfPixel[queue[i]] = regionIndex;
    regions.push({
      materialKey,
      cohort,
      rgb: null,
      descriptor: null,
      weight: totalWeight,
      area,
      protectedCount,
      red,
      green,
      blue,
      signature: ''
    });
  }
  finalizeRegions(regions, rgb, weights, (pixel) => regionOfPixel[pixel]);
  for (const region of regions) region.descriptor = descriptor(region.rgb);
  return regions;
}

function selectPrototypes(regions) {
  const candidates = [...regions].sort((a, b) => a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0);
  if (candidates.length <= MAX_PROTOTYPES) return candidates;

  const selected = [];
  const selectedSet = new Set();
  function add(candidate) {
    if (!candidate || selectedSet.has(candidate)) return;
    selected.push(candidate);
    selectedSet.add(candidate);
  }

  // Preserve one neutral or dark sample when one exists, without turning its
  // source RGB into a family-wide shadow color.
  const neutralOrDark = candidates.filter((candidate) => candidate.neutral || candidate.cohort === 0);
  if (neutralOrDark.length) {
    neutralOrDark.sort((a, b) => Number(b.neutral) - Number(a.neutral) ||
      Math.sqrt(b.area) - Math.sqrt(a.area) || compareCandidates(a, b));
    add(neutralOrDark[0]);
  }

  // Start with the most substantial connected sample, then distribute the
  // remaining budget by chroma/tone distance with only a modest area weight.
  if (!selected.length) {
    const priority = (candidate) => Math.sqrt(candidate.area) *
      (1 + Math.min(1, candidate.protectedCount / Math.sqrt(candidate.area)) * 0.15);
    const first = [...candidates].sort((a, b) => priority(b) - priority(a) || compareCandidates(a, b))[0];
    add(first);
  }

  // Reserve one real, weighted-medoid sample for substantial exact color keys
  // before farthest-point diversity can spend every slot on tiny vivid accents.
  // Keep one slot open for that diversity pass, and retain the neutral/dark seed.
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  const byMaterialKey = new Map();
  for (const candidate of candidates) {
    if (candidate.materialKey === 0) continue;
    const group = byMaterialKey.get(candidate.materialKey) ?? {
      weight: 0, descriptor: [0, 0, 0], candidates: []
    };
    group.weight += candidate.weight;
    for (let axis = 0; axis < 3; axis++) group.descriptor[axis] += candidate.descriptor[axis] * candidate.weight;
    group.candidates.push(candidate);
    byMaterialKey.set(candidate.materialKey, group);
  }
  const supportedKeys = [];
  for (const [materialKey, group] of byMaterialKey) {
    if (group.weight < totalWeight * 0.01 || selected.some(candidate => candidate.materialKey === materialKey)) continue;
    const mean = group.descriptor.map(value => value / group.weight);
    const representative = group.candidates.reduce((best, candidate) => {
      const distance = distanceSquared(candidate.descriptor, mean);
      return !best || distance < best.distance ||
        (distance === best.distance && compareCandidates(candidate, best.candidate) < 0)
        ? { candidate, distance } : best;
    }, null).candidate;
    supportedKeys.push({ materialKey, weight: group.weight, representative });
  }
  supportedKeys.sort((a, b) => b.weight - a.weight || compareCandidates(a.representative, b.representative));
  const reservedSlots = Math.max(0, MAX_PROTOTYPES - selected.length - 1);
  for (let i = 0; i < supportedKeys.length && i < reservedSlots; i++) add(supportedKeys[i].representative);

  while (selected.length < MAX_PROTOTYPES) {
    let best = null, bestScore = -Infinity;
    for (const candidate of candidates) {
      if (selectedSet.has(candidate)) continue;
      let nearest = Infinity;
      for (const chosen of selected) nearest = Math.min(nearest, distanceSquared(candidate.descriptor, chosen.descriptor));
      const protectedPriority = Math.min(1, candidate.protectedCount / Math.sqrt(candidate.area));
      // Let substantial surfaces compete reliably with tiny, high-contrast
      // accents while leaving the distance term enough room to keep rare colors.
      const surfacePriority = 1 + Math.sqrt(Math.sqrt(candidate.area)) * 0.5;
      const score = Math.sqrt(nearest) * surfacePriority * (1 + protectedPriority * 0.15);
      if (score > bestScore || (score === bestScore && compareCandidates(candidate, best) < 0)) {
        best = candidate;
        bestScore = score;
      }
    }
    if (!best) break;
    add(best);
  }
  return selected.sort(compareCandidates);
}

function copySnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    mode: snapshot.mode,
    toneLevels: snapshot.toneLevels,
    mainColorChromaScale: snapshot.mainColorChromaScale,
    sharedShadow: snapshot.sharedShadow,
    paletteLimit: snapshot.paletteLimit,
    levels: [...snapshot.levels],
    levelIndices: snapshot.levelIndices.map((indices) => [...indices]),
    hueGroups: (snapshot.hueGroups ?? []).map((group) => ({ key: group.key, indices: [...group.indices] })),
    palette: snapshot.palette.map((rgb) => [...rgb]),
    ramps: snapshot.ramps.map((ramp) => ({
      key: ramp.key,
      materialKey: ramp.materialKey,
      base: [...ramp.base],
      indices: [...ramp.indices],
      mainIndex: ramp.mainIndex
    })),
    revision: snapshot.revision,
    saturation: snapshot.saturation
  };
}

function buildSnapshot(rgb, objects, weights, geometry, toneLevels, saturation, revision) {
  const pixelCount = validateRgb(rgb);
  validateParallel(objects, pixelCount, 'objects');
  validateParallel(weights, pixelCount, 'weights');
  const dimensions = validateGeometry(geometry, pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const weight = weights == null ? 1 : weights[pixel];
    if (!Number.isFinite(weight) || weight < 0) throw new RangeError('weights must be finite and non-negative');
    if (objects != null && typeof objects[pixel] === 'number' && !Number.isFinite(objects[pixel])) {
      throw new RangeError('object labels must be finite');
    }
  }
  if (weights != null && !weights.some((weight) => weight > 0)) throw new RangeError('at least one sample must have positive weight');

  const levels = grayLevels(toneLevels);
  const regions = collectRegions(rgb, objects, weights, saturation, dimensions);
  if (!regions.length) throw new RangeError('at least one sample must have positive weight');
  const prototypes = selectPrototypes(regions);
  const shadow = fitTone(SHADOW_RGB, levels[0]);
  const palette = [shadow];
  const paletteIndexByRgb = new Map([[shadow.join(','), 0]]);
  const levelIndices = Array.from({ length: levels.length }, () => []);
  const levelRecords = Array.from({ length: levels.length }, () => []);
  levelIndices[0].push(0);
  const middleLevels = levels.map((_, i) => i).slice(1, -1);
  const hueGroups = new Map();

  function addTone(color, source, levelIndex, { main = false, fallback = false } = {}) {
    const key = color.join(',');
    let index = paletteIndexByRgb.get(key);
    if (index === undefined) {
      index = palette.length;
      paletteIndexByRgb.set(key, index);
      palette.push(color);
    }
    if (!levelIndices[levelIndex].includes(index)) levelIndices[levelIndex].push(index);
    const groupKey = hueGroupKey(source.materialKey);
    const groupIndices = hueGroups.get(groupKey) ?? new Set();
    groupIndices.add(index);
    hueGroups.set(groupKey, groupIndices);
    const record = { index, materialKey: source.materialKey, groupKey, main, fallback, levelIndex };
    levelRecords[levelIndex].push(record);
    return record;
  }

  function toneFor(prototype, targetGray) {
    // Preserve the captured material hue and chroma; only gray level changes.
    return fitTone(prototype.rgb, targetGray, { chromaScale: prototype.neutral ? 1 : MAIN_COLOR_CHROMA_SCALE });
  }

  const groupKeyForMaterial = new Map();
  for (const prototype of prototypes) groupKeyForMaterial.set(prototype.materialKey, hueGroupKey(prototype.materialKey));
  const familyMembers = new Map();
  for (const prototype of prototypes) {
    const key = hueGroupKey(prototype.materialKey);
    const list = familyMembers.get(key) ?? [];
    list.push(prototype);
    familyMembers.set(key, list);
  }
  const priority = (prototype) => Math.sqrt(Math.max(1, prototype.weight)) *
    (1 + Math.min(1, prototype.protectedCount / Math.sqrt(prototype.area)) * 0.15);
  const bestByMaterial = new Map();
  for (const prototype of prototypes) {
    const old = bestByMaterial.get(prototype.materialKey);
    if (!old || priority(prototype) > priority(old) ||
        (priority(prototype) === priority(old) && compareCandidates(prototype, old) < 0)) {
      bestByMaterial.set(prototype.materialKey, prototype);
    }
  }
  const mainCandidates = [...bestByMaterial.values()].sort((a, b) => priority(b) - priority(a) || compareCandidates(a, b));
  const recordsByGroup = new Map([...familyMembers.keys()].map((key) => [key, []]));
  if (!recordsByGroup.has('neutral')) recordsByGroup.set('neutral', []);
  const mainRecords = new Map();

  function allocate(prototype, main) {
    const groupKey = groupKeyForMaterial.get(prototype.materialKey);
    const group = recordsByGroup.get(groupKey);
    const used = new Set(group.filter(record => record.materialKey === prototype.materialKey).map(record => record.levelIndex));
    if (used.size >= 3 || palette.length >= PALETTE_LIMIT - 1) return false;
    const gray = grayLight(...prototype.rgb);
    const levelIndex = middleLevels.filter((index) => !used.has(index))
      .sort((a, b) => Math.abs(levels[a] - gray) - Math.abs(levels[b] - gray) || a - b)[0];
    if (levelIndex === undefined) return false;
    const record = addTone(toneFor(prototype, levels[levelIndex]), prototype, levelIndex, { main });
    group.push(record);
    if (main) mainRecords.set(prototype.materialKey, record);
    return true;
  }

  // Reserve one source color for each exact key before spending budget on shades.
  for (const prototype of mainCandidates) allocate(prototype, true);

  // Add source-colored shades fairly after reserving every captured main.
  // Similar skin/cloth hues may share a gray level without displacing a main.
  const alternates = new Map();
  for (const prototype of prototypes) {
    if (bestByMaterial.get(prototype.materialKey) === prototype) continue;
    const list = alternates.get(prototype.materialKey) ?? [];
    list.push(prototype);
    alternates.set(prototype.materialKey, list);
  }
  for (const list of alternates.values()) list.sort((a, b) => priority(b) - priority(a) || compareCandidates(a, b));
  for (let round = 0; round < 2; round++) {
    for (const main of mainCandidates) {
      const variant = alternates.get(main.materialKey)?.[round] ?? main;
      allocate(variant, false);
    }
  }

  const highlight = fitTone([230, 222, 212], levels.at(-1));
  let highlightIndex = paletteIndexByRgb.get(highlight.join(','));
  if (highlightIndex === undefined) {
    highlightIndex = palette.length;
    paletteIndexByRgb.set(highlight.join(','), highlightIndex);
    palette.push(highlight);
  }
  levelIndices.at(-1).push(highlightIndex);

  const neutralRecords = (recordsByGroup.get('neutral') ?? []).filter((record) => record.index !== 0);
  const ramps = prototypes.map((prototype, prototypeIndex) => {
    const ownRecords = levelRecords.slice(1, -1).flat().filter((record) => record.materialKey === prototype.materialKey);
    const familyRecords = levelRecords.slice(1, -1).flat().filter((record) =>
      record.groupKey === hueGroupKey(prototype.materialKey) && record.materialKey !== 0);
    const usefulRecords = ownRecords.length ? ownRecords : familyRecords.length ? familyRecords : neutralRecords;
    const gray = grayLight(...prototype.rgb);
    const mainRecord = mainRecords.get(prototype.materialKey) ?? [...(ownRecords.length ? ownRecords : usefulRecords)].sort((a, b) =>
      Math.abs(grayLight(...palette[a.index]) - gray) - Math.abs(grayLight(...palette[b.index]) - gray) || a.index - b.index)[0];
    const mainIndex = mainRecord?.index ?? (Math.abs(gray - levels[0]) <= Math.abs(gray - levels.at(-1)) ? 0 : highlightIndex);
    const indices = [...new Set([0, ...ownRecords.map((record) => record.index),
      ...usefulRecords.map((record) => record.index), mainIndex, highlightIndex])].sort((a, b) => a - b);
    return {
      key: `${channelKey(prototype.materialKey, prototype.cohort)}:${prototypeIndex}`,
      materialKey: prototype.materialKey,
      base: [...prototype.rgb],
      indices,
      mainIndex
    };
  });
  const hueGroupSnapshots = [...hueGroups.entries()].map(([key, indices]) => ({ key, indices: [...indices].sort((a, b) => a - b) }))
    .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

  return {
    mode: 'global-tones',
    toneLevels,
    mainColorChromaScale: MAIN_COLOR_CHROMA_SCALE,
    sharedShadow: 'neutral',
    levels: [...levels],
    levelIndices,
    hueGroups: hueGroupSnapshots,
    paletteLimit: PALETTE_LIMIT,
    palette,
    ramps,
    revision,
    saturation
  };
}

/**
 * Captures one immutable-by-copy global tone palette. Saturation affects only
 * recognition keys; every emitted tone is fitted from its original RGB base.
 */
export function createGlobalPalette({ toneLevels = 4, saturation = 1.25 } = {}) {
  if (toneLevels !== 4 && toneLevels !== 8) {
    throw new RangeError('toneLevels must be 4 or 8');
  }
  if (!Number.isFinite(saturation) || saturation <= 0) throw new RangeError('saturation must be positive and finite');
  let current = null;
  let revision = 0;
  return {
    capture(rgbTriplets, objects = null, weights = null, geometry = null) {
      const next = buildSnapshot(rgbTriplets, objects, weights, geometry, toneLevels, saturation, revision + 1);
      current = next;
      revision++;
      return copySnapshot(current);
    },
    get() { return copySnapshot(current); },
    clear() { current = null; }
  };
}
