import { simplifyIllumination } from './illumination.mjs?v=20260924-lighting-1';
import { createSurfaceTextureStabilizer } from './surface-texture.mjs?v=20260925-surfaces-1';
import { buildSurfaceTones } from './surface-tones.mjs?v=20260925-surfaces-1';
import { removeSurfaceSpecks } from './surface-specks.mjs?v=20260925-specks-1';
import { simplifySurfaceSamples } from './surface-samples.mjs?v=20260924-camera-release-1';
import { renderFacePixels } from './face-pixels.mjs?v=20260924-lighting-1';
import { buildThreeTonePalette } from './three-tone-palette.mjs';
import { classifyMaterials, smoothMaterialLight } from './material-groups.mjs?v=20260924-camera-release-1';
import { createMaterialRegionTracker } from './material-regions.mjs?v=20260924-camera-release-1';
import { detectChangedCells } from './motion-gate.mjs';
import { cleanPixelClusters } from './pixel-clusters.mjs';
import { refineThinLineSamples } from './thin-lines.mjs';
import { recognitionColor, recognitionMaterialKey } from './fixed-palette.mjs?v=20260924-camera-release-1';
import { prepareToneRamp } from './ordered-dither.mjs';
import { smoothTransitionCells, transitionRampIndex } from './selective-dither.mjs?v=20260925-surfaces-1';
import { grayLight, prepareGlobalToneRamp, nearestGlobalToneIndex } from './global-tones.mjs';
import { recognitionSurfaceKey } from './global-palette.mjs?v=20260924-camera-release-1';

const MAX_INPUT_PIXELS = 16_000_000;
const MAX_OUTPUT_SIZE = 512;
const DEFAULT_COLORS = 24;
const MAX_LABELS_PER_OUTPUT_CELL = 64;
const paletteBindingStates = new WeakMap();

function assertFrame(frame) {
  if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) ||
      frame.width < 1 || frame.height < 1 || frame.width * frame.height > MAX_INPUT_PIXELS ||
      !(frame.data instanceof Uint8ClampedArray || frame.data instanceof Uint8Array) ||
      frame.data.length !== frame.width * frame.height * 4) {
    throw new TypeError('frame must contain a bounded RGBA pixel buffer');
  }
}
function assertSegmentation(segmentation) {
  if (!segmentation) return false;
  if (!Number.isInteger(segmentation.width) || !Number.isInteger(segmentation.height) ||
      segmentation.width < 1 || segmentation.height < 1 || segmentation.width * segmentation.height > MAX_INPUT_PIXELS ||
      !(segmentation.labels instanceof Uint32Array) ||
      segmentation.labels.length !== segmentation.width * segmentation.height) {
    throw new TypeError('segmentation must contain a bounded Uint32 label map');
  }
  return true;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function rgbKey(r, g, b) { return (r << 16) | (g << 8) | b; }
function colorDistanceSquared(ar, ag, ab, br, bg, bb) {
  const dr = ar - br, dg = ag - bg, db = ab - bb;
  return dr * dr + dg * dg + db * db;
}

function nearestSourceLabel(segmentation, x, y, frameWidth, frameHeight) {
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

function collectCellOwners(frame, segmentation, segmented, width, height) {
  const cells = width * height;
  const owners = new Uint32Array(cells);
  const counts = new Uint32Array(cells);
  const mixed = new Array(cells);
  const centerLabels = new Uint32Array(cells);
  for (let cy = 0; cy < height; cy++) for (let cx = 0; cx < width; cx++) {
    const sx = Math.min(frame.width - 1, Math.floor((cx + 0.5) * frame.width / width));
    const sy = Math.min(frame.height - 1, Math.floor((cy + 0.5) * frame.height / height));
    centerLabels[cy * width + cx] = segmented ? nearestSourceLabel(segmentation, sx, sy, frame.width, frame.height) : 1;
  }

  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const cell = Math.min(height - 1, Math.floor(y * height / frame.height)) * width + Math.min(width - 1, Math.floor(x * width / frame.width));
    const label = segmented ? nearestSourceLabel(segmentation, x, y, frame.width, frame.height) : 1;
    if (counts[cell] === 0) { owners[cell] = label; counts[cell] = 1; continue; }
      if (!mixed[cell]) {
        if (owners[cell] === label) { counts[cell]++; continue; }
        mixed[cell] = new Map([[owners[cell], counts[cell]]]);
        mixed[cell].set(label, 1);
        continue;
      }
    if (!mixed[cell].has(label) && mixed[cell].size >= MAX_LABELS_PER_OUTPUT_CELL) {
      throw new RangeError(`too many object IDs fall inside output cell ${cell}; simplify the segmentation mask`);
    }
    mixed[cell].set(label, (mixed[cell].get(label) ?? 0) + 1);
  }

  for (let cell = 0; cell < cells; cell++) {
    if (!mixed[cell]) continue;
    const center = centerLabels[cell];
    let bestLabel = center, bestCount = -1, bestNonzero = -1;
    for (const [label, count] of mixed[cell]) {
      // Preserve any visible object ID over background within a reduced cell.
      // Among objects, choose the most represented label; center breaks ties.
      if (label !== 0) {
        if (count > bestNonzero || (count === bestNonzero && label === center)) {
          bestNonzero = count; bestLabel = label; bestCount = count;
        }
      } else if (bestNonzero < 0 && (count > bestCount || (count === bestCount && label === center))) {
        bestCount = count; bestLabel = label;
      }
    }
    owners[cell] = bestLabel;
  }
  return { owners, centerLabels };
}

function collectCellMedoids(frame, segmentation, segmented, width, height, owners) {
  const cells = width * height;
  const counts = new Uint32Array(cells);
  const sumsR = new Float64Array(cells), sumsG = new Float64Array(cells), sumsB = new Float64Array(cells);
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const cell = Math.min(height - 1, Math.floor(y * height / frame.height)) * width + Math.min(width - 1, Math.floor(x * width / frame.width));
    const label = segmented ? nearestSourceLabel(segmentation, x, y, frame.width, frame.height) : 1;
    if (label !== owners[cell]) continue;
    const source = (y * frame.width + x) * 4;
    counts[cell]++;
    sumsR[cell] += frame.data[source]; sumsG[cell] += frame.data[source + 1]; sumsB[cell] += frame.data[source + 2];
  }
  const meansR = new Float64Array(cells), meansG = new Float64Array(cells), meansB = new Float64Array(cells);
  for (let cell = 0; cell < cells; cell++) {
    const divisor = counts[cell] || 1;
    meansR[cell] = sumsR[cell] / divisor; meansG[cell] = sumsG[cell] / divisor; meansB[cell] = sumsB[cell] / divisor;
  }

  // The medoid is the real same-ID source sample nearest its cell's RGB centroid.
  // Under squared RGB distance this is an exact medoid, without emitting a synthetic average.
  const bestDistance = new Float64Array(cells); bestDistance.fill(Infinity);
  const rgb = new Uint8Array(cells * 3);
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const cell = Math.min(height - 1, Math.floor(y * height / frame.height)) * width + Math.min(width - 1, Math.floor(x * width / frame.width));
    const label = segmented ? nearestSourceLabel(segmentation, x, y, frame.width, frame.height) : 1;
    if (label !== owners[cell]) continue;
    const source = (y * frame.width + x) * 4;
    const r = frame.data[source], g = frame.data[source + 1], b = frame.data[source + 2];
    const distance = colorDistanceSquared(r, g, b, meansR[cell], meansG[cell], meansB[cell]);
    if (distance < bestDistance[cell]) {
      bestDistance[cell] = distance;
      rgb[cell * 3] = r; rgb[cell * 3 + 1] = g; rgb[cell * 3 + 2] = b;
    }
  }
  return { rgb, counts };
}

function collectCellSamples(frame, segmentation, segmented, width, height, owners) {
  const sums = new Uint32Array(owners.length * 3);
  const coverageRgb = new Float32Array(owners.length * 3);
  const counts = new Uint32Array(owners.length), rgb = new Uint8Array(owners.length * 3);
  const distance = new Float32Array(owners.length); distance.fill(Infinity);
  // Prefer the actual same-object source sample nearest the cell center. Unlike
  // a centroid, the center does not pull a cell toward a mixed edge color.
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const cx = Math.min(width - 1, Math.floor(x * width / frame.width));
    const cy = Math.min(height - 1, Math.floor(y * height / frame.height));
    const cell = cy * width + cx;
    const label = segmented ? nearestSourceLabel(segmentation, x, y, frame.width, frame.height) : 1;
    if (label !== owners[cell]) continue;
    counts[cell]++;
    const source = (y * frame.width + x) * 4, sample = cell * 3;
    sums[sample] += frame.data[source]; sums[sample + 1] += frame.data[source + 1]; sums[sample + 2] += frame.data[source + 2];
    const dx = x + 0.5 - (cx + 0.5) * frame.width / width;
    const dy = y + 0.5 - (cy + 0.5) * frame.height / height;
    const d = dx * dx + dy * dy;
    if (d < distance[cell]) {
      distance[cell] = d;
      const p = (y * frame.width + x) * 4, target = cell * 3;
      rgb[target] = frame.data[p]; rgb[target + 1] = frame.data[p + 1]; rgb[target + 2] = frame.data[p + 2];
    }
  }
  for (let cell = 0; cell < owners.length; cell++) for (let c = 0; c < 3; c++) coverageRgb[cell * 3 + c] = sums[cell * 3 + c] / Math.max(1, counts[cell]);
  return { rgb, counts, coverageRgb };
}

function nearestToneIndex(light, palette, allowed) {
  let best = -1, distance = Infinity;
  for (const index of allowed) {
    const c = palette[index], delta = Math.abs(light - (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]));
    if (delta < distance) { best = index; distance = delta; }
  }
  return best;
}

function makeRegionCandidates(owners, rgb, counts, protectedCells = null, lineCells = null) {
  const regions = new Map();
  for (let cell = 0; cell < owners.length; cell++) {
    const id = owners[cell];
    let region = regions.get(id);
    if (!region) { region = { id, cells: [], weight: 0, protectedWeight: 0, byColor: new Map(), paletteIndices: [] }; regions.set(id, region); }
    region.cells.push(cell);
    region.weight += counts[cell];
    if (protectedCells?.[cell]) region.protectedWeight += counts[cell];
    const offset = cell * 3, r = rgb[offset], g = rgb[offset + 1], b = rgb[offset + 2];
    const key = rgbKey(r, g, b);
    const candidate = region.byColor.get(key);
    if (candidate) { candidate.weight += counts[cell]; candidate.lineWeight += lineCells?.[cell] ? counts[cell] : 0; }
    else region.byColor.set(key, { key, r, g, b, weight: counts[cell], lineWeight: lineCells?.[cell] ? counts[cell] : 0 });
  }
  for (const region of regions.values()) {
    const candidates = [...region.byColor.values()];
    let meanR = 0, meanG = 0, meanB = 0;
    for (const candidate of candidates) {
      meanR += candidate.r * candidate.weight; meanG += candidate.g * candidate.weight; meanB += candidate.b * candidate.weight;
    }
    meanR /= region.weight; meanG /= region.weight; meanB /= region.weight;
    region.candidates = candidates;
    region.priorityWeight = region.weight + region.protectedWeight * 12;
    region.representative = candidates.reduce((best, candidate) => {
      const distance = colorDistanceSquared(candidate.r, candidate.g, candidate.b, meanR, meanG, meanB);
      return !best || distance < best.distance ? { candidate, distance } : best;
    }, null).candidate;
  }
  return regions;
}

function buildPalette(regions, colorLimit) {
  const palette = [], owners = [], keyToIndex = new Map();
  const regionList = [...regions.values()].sort((a, b) => b.weight - a.weight || a.id - b.id);
  function add(candidate, region, allowNew) {
    const priorIndex = keyToIndex.get(candidate.key);
    if (priorIndex !== undefined) {
      if (!owners[priorIndex].has(region.id)) owners[priorIndex].add(region.id);
      if (!region.paletteIndices.includes(priorIndex)) region.paletteIndices.push(priorIndex);
      return priorIndex;
    }
    if (!allowNew || palette.length >= colorLimit) return -1;
    const index = palette.length;
    palette.push([candidate.r, candidate.g, candidate.b]);
    owners.push(new Set([region.id]));
    keyToIndex.set(candidate.key, index);
    region.paletteIndices.push(index);
    return index;
  }

  // Reserve one actual sampled medoid per region while the global color budget permits.
  for (const region of regionList) add(region.representative, region, true);

  // Spend remaining palette slots on visually distant same-region medoids.
  while (palette.length < colorLimit) {
    let chosenRegion = null, chosenCandidate = null, chosenScore = -1;
    for (const region of regionList) {
      if (!region.paletteIndices.length) continue;
      let candidateBest = null, candidateDistance = -1;
      for (const candidate of region.candidates) {
        if (region.paletteIndices.some((index) => keyToIndex.get(candidate.key) === index)) continue;
        let nearest = Infinity;
        for (const index of region.paletteIndices) {
          const color = palette[index];
          nearest = Math.min(nearest, colorDistanceSquared(candidate.r, candidate.g, candidate.b, color[0], color[1], color[2]));
        }
        const weightedDistance = nearest * candidate.weight;
        if (weightedDistance > candidateDistance) { candidateBest = candidate; candidateDistance = weightedDistance; }
      }
      if (!candidateBest || candidateDistance <= 0) continue;
      const score = region.weight / (region.paletteIndices.length + 1);
      if (score > chosenScore) { chosenScore = score; chosenRegion = region; chosenCandidate = candidateBest; }
    }
    if (!chosenRegion) break;
    const added = add(chosenCandidate, chosenRegion, true);
    if (added < 0) break;
  }
  return { palette, owners, regionList };
}

function stabilizePalette(palette, paletteOwners, regions, previous, changedRegions = null) {
  if (!previous) return 0;
  const proposals = new Map();
  for (const region of regions.values()) {
    if (!region.paletteIndices.length || changedRegions?.has(region.id)) continue;
    const oldIndices = [];
    for (let index = 0; index < previous.paletteOwners.length; index++) {
      if (previous.paletteOwners[index].includes(region.id)) oldIndices.push(index);
    }
    const pairs = [];
    for (const currentIndex of region.paletteIndices) for (const oldIndex of oldIndices) {
      const current = palette[currentIndex], old = previous.palette[oldIndex];
      const distance = colorDistanceSquared(current[0], current[1], current[2], old[0], old[1], old[2]);
      if (distance <= 12 * 12) pairs.push({ currentIndex, oldIndex, distance });
    }
    pairs.sort((a, b) => a.distance - b.distance || a.currentIndex - b.currentIndex || a.oldIndex - b.oldIndex);
    const usedCurrent = new Set(), usedOld = new Set();
    for (const pair of pairs) {
      if (usedCurrent.has(pair.currentIndex) || usedOld.has(pair.oldIndex)) continue;
      usedCurrent.add(pair.currentIndex); usedOld.add(pair.oldIndex);
      let proposal = proposals.get(pair.currentIndex);
      if (!proposal) { proposal = { owners: new Set(), color: previous.palette[pair.oldIndex] }; proposals.set(pair.currentIndex, proposal); }
      if (proposal.color[0] === previous.palette[pair.oldIndex][0] &&
          proposal.color[1] === previous.palette[pair.oldIndex][1] &&
          proposal.color[2] === previous.palette[pair.oldIndex][2]) proposal.owners.add(region.id);
      else proposal.conflict = true;
    }
  }
  let heldEntries = 0;
  for (const [index, proposal] of proposals) {
    if (proposal.conflict || ![...paletteOwners[index]].every((owner) => proposal.owners.has(owner))) continue;
    palette[index] = [...proposal.color];
    heldEntries++;
  }
  return heldEntries;
}

function sceneChanged(previous, currentRgb, width, height, labels, segmented, sourceWidth, sourceHeight, segmentationWidth, segmentationHeight) {
  if (!previous) return false;
  if (previous.width !== width || previous.height !== height ||
      previous.sourceWidth !== sourceWidth || previous.sourceHeight !== sourceHeight ||
      previous.segmentationWidth !== segmentationWidth || previous.segmentationHeight !== segmentationHeight ||
      previous.segmented !== segmented) return true;
  let sameLabels = 0, labelChanges = 0, delta = 0, comparisons = 0;
  for (let cell = 0; cell < labels.length; cell++) {
    const oldLabel = previous.labels[cell], newLabel = labels[cell];
    if (oldLabel === newLabel) {
      sameLabels++;
      const p = cell * 3;
      delta += (Math.abs(previous.sourceRgb[p] - currentRgb[p]) + Math.abs(previous.sourceRgb[p + 1] - currentRgb[p + 1]) + Math.abs(previous.sourceRgb[p + 2] - currentRgb[p + 2])) / 3;
      comparisons++;
    } else labelChanges++;
  }
  const sameRatio = sameLabels / Math.max(1, labels.length);
  const labelChangeRatio = labelChanges / Math.max(1, labels.length);
  const meanDelta = comparisons ? delta / comparisons : 0;
  return meanDelta >= 52 || (labelChangeRatio >= 0.65 && meanDelta >= 28) || sameRatio < 0.08;
}

function nearestPaletteIndex(color, palette, allowed) {
  let bestIndex = -1, bestDistance = Infinity;
  for (const index of allowed) {
    const candidate = palette[index];
    const distance = colorDistanceSquared(color[0], color[1], color[2], candidate[0], candidate[1], candidate[2]);
    if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
  }
  return bestIndex;
}

// Palette RGB stays fixed across frames and object-mask updates. Regions only
// select an existing three-color ramp; no new swatch is synthesized here.
function assignFixedPalette(regions, snapshot, bindings) {
  const palette = snapshot.palette;
  const owners = palette.map(() => new Set());
  const choices = snapshot.ramps.map((ramp) => ({ ...ramp, recognized: recognitionColor(...ramp.base, snapshot.saturation) }));
  const families = new Map();
  for (const region of regions.values()) {
    const familyKey = region.id % 32;
    if (bindings.has(familyKey)) continue;
    const family = families.get(familyKey) ?? { r: 0, g: 0, b: 0, weight: 0 };
    for (const c of region.candidates) {
      family.r += c.r * c.weight; family.g += c.g * c.weight; family.b += c.b * c.weight; family.weight += c.weight;
    }
    families.set(familyKey, family);
  }
  for (const [familyKey, sum] of families) {
    const sameFamily = choices.find((candidate) => candidate.materialKey === familyKey);
    if (sameFamily) { bindings.set(familyKey, [...sameFamily.indices]); continue; }
    // Only the matching signal is averaged. The output still uses captured RGB.
    const recognized = recognitionColor(sum.r / sum.weight, sum.g / sum.weight, sum.b / sum.weight, snapshot.saturation);
    const light = (recognized[0] + recognized[1] + recognized[2]) / 3;
    let best = choices[0], bestDistance = Infinity;
    for (const candidate of choices) {
      const other = candidate.recognized, otherLight = (other[0] + other[1] + other[2]) / 3;
      const dr = (recognized[0] - light) - (other[0] - otherLight);
      const dg = (recognized[1] - light) - (other[1] - otherLight);
      const db = (recognized[2] - light) - (other[2] - otherLight);
      const distance = dr * dr + dg * dg + db * db + 0.35 * (light - otherLight) ** 2;
      if (distance < bestDistance) { bestDistance = distance; best = candidate; }
    }
    bindings.set(familyKey, [...best.indices]);
  }
  for (const region of regions.values()) {
    region.paletteIndices = [...bindings.get(region.id % 32)];
    for (const index of region.paletteIndices) owners[index].add(region.id);
    region.toneRamp = prepareToneRamp(palette, region.paletteIndices);
  }
  return { palette, owners, regionList: [...regions.values()] };
}

// Each connected color surface chooses its own captured hue prototype. The
// original AI object IDs remain authoritative and are returned unmodified.
function assignGlobalPalette(regions, snapshot, previousBindings, continuity = null) {
  const palette = snapshot.palette, owners = palette.map(() => new Set());
  const paletteLights = palette.map(color => grayLight(...color));
  const bindings = new Map();
  const choices = snapshot.ramps.map(ramp => ({ ...ramp,
    recognized: recognitionColor(...ramp.base, snapshot.saturation),
    tones: prepareGlobalToneRamp(palette, ramp.indices) }));
  for (const region of regions.values()) {
    const representative = region.representative;
    const base = [representative.r, representative.g, representative.b];
    let old = previousBindings.get(region.id);
    if (!old && continuity) {
      const votes = new Map();
      let unchanged = 0;
      for (const cell of region.cells) {
        const p = cell * 3;
        if (Math.abs(continuity.rgb[p] - continuity.previous.sourceRgb[p]) > 2 ||
            Math.abs(continuity.rgb[p + 1] - continuity.previous.sourceRgb[p + 1]) > 2 ||
            Math.abs(continuity.rgb[p + 2] - continuity.previous.sourceRgb[p + 2]) > 2) continue;
        unchanged++;
        const prior = previousBindings.get(continuity.previous.labels[cell]);
        if (!prior) continue;
        const key = prior.indices.join(',');
        const vote = votes.get(key) ?? { binding: prior, count: 0 };
        vote.count++; votes.set(key, vote);
      }
      // Late AI may split a still surface into new IDs. Its existing color
      // choice is not a new observation: carry it over only on unchanged pixels.
      if (unchanged >= region.cells.length * 0.95) {
        let winner = null;
        for (const vote of votes.values()) if (!winner || vote.count > winner.count) winner = vote;
        if (winner?.count >= region.cells.length * 0.6) old = { ...winner.binding, base };
      }
    }
    const bindingDelta = old ? Math.max(...base.map((value, i) => Math.abs(value - old.base[i]))) : Infinity;
    // Keep a region's ramp on small sensor changes, never on a changed material.
    if (old && bindingDelta <= 8) {
      region.paletteIndices = [...old.indices];
      bindings.set(region.id, old);
    } else {
      const color = recognitionColor(...base, snapshot.saturation);
      const mean = (color[0] + color[1] + color[2]) / 3;
      const distanceTo = choice => {
        const other = choice.recognized, otherMean = (other[0] + other[1] + other[2]) / 3;
        const chromaDistance = color.reduce((sum, value, c) => sum + ((value - mean) - (other[c] - otherMean)) ** 2, 0);
        return chromaDistance + 0.15 * (mean - otherMean) ** 2;
      };
      let chosen = choices[0], distance = Infinity;
      for (const choice of choices) {
        const candidateDistance = distanceTo(choice);
        if (candidateDistance < distance) { distance = candidateDistance; chosen = choice; }
      }
      // A marginally better match must not swap a surface's hue back and forth.
      const priorChoice = old && bindingDelta <= 16 && choices.find(choice => choice.key === old.prototypeKey);
      if (priorChoice && distanceTo(priorChoice) <= distance * 1.15 + 64) chosen = priorChoice;
      const samples = region.candidates.map(c => ({ light: grayLight(c.r, c.g, c.b), weight: c.weight }));
      const errorFor = indices => {
        let error = 0;
        for (const sample of samples) {
          let difference = Infinity;
          for (const index of indices) difference = Math.min(difference, Math.abs(sample.light - paletteLights[index]));
          error += difference * difference * sample.weight;
        }
        return Math.sqrt(error / Math.max(1, region.weight));
      };
      // Compact ramps can skip levels that would introduce an unrelated hue.
      // Compare actual swatch light, and always retain the captured main color.
      const candidates = chosen.tones.map(tone => tone.index);
      let best = [...candidates], error = Infinity;
      if (candidates.length > 3) {
        for (let a = 0; a < candidates.length - 2; a++) for (let b = a + 1; b < candidates.length - 1; b++) for (let c = b + 1; c < candidates.length; c++) {
          const trial = [candidates[a], candidates[b], candidates[c]];
          if (chosen.mainIndex !== undefined && !trial.includes(chosen.mainIndex)) continue;
          const candidateError = errorFor(trial);
          if (candidateError < error) { best = trial; error = candidateError; }
        }
      } else error = errorFor(best);
      if (bindingDelta <= 16 && old?.prototypeKey === chosen.key && old.indices.every(index => candidates.includes(index)) &&
          (chosen.mainIndex === undefined || old.indices.includes(chosen.mainIndex)) && errorFor(old.indices) <= error + 2) best = [...old.indices];
      region.paletteIndices = best;
      bindings.set(region.id, { base, indices: [...best], prototypeKey: chosen.key });
    }
    const toneSource = choices.find(choice => choice.key === bindings.get(region.id)?.prototypeKey);
    if (toneSource && region.paletteIndices.every(index => toneSource.indices.includes(index))) {
      const selected = new Set(region.paletteIndices);
      region.toneRamp = toneSource.tones.filter(tone => selected.has(tone.index)).map(tone => ({ ...tone }));
    } else region.toneRamp = prepareGlobalToneRamp(palette, region.paletteIndices);
    for (const index of region.paletteIndices) owners[index].add(region.id);
  }
  return { palette, owners, regionList: [...regions.values()], bindings };
}

function ditherProtection(rgb, objects, details, width, height) {
  const protectedCells = new Uint8Array(details);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const cell = y * width + x, p = cell * 3;
    for (const neighbor of [x > 0 ? cell - 1 : -1, x + 1 < width ? cell + 1 : -1,
      y > 0 ? cell - width : -1, y + 1 < height ? cell + width : -1]) {
      if (neighbor < 0) continue;
      const q = neighbor * 3;
      if (objects[cell] !== objects[neighbor] || Math.max(Math.abs(rgb[p] - rgb[q]),
        Math.abs(rgb[p + 1] - rgb[q + 1]), Math.abs(rgb[p + 2] - rgb[q + 2])) > 48) {
        protectedCells[cell] = 1; break;
      }
    }
  }
  return protectedCells;
}

// Sparse codec/sensor specks must not invalidate every surrounding tone.
// Connected changes (a moving edge/area) still release their one-cell halo.
function coherentToneMotion(current, previous, width, height) {
  const seeds = new Uint8Array(width * height), released = new Uint8Array(seeds.length);
  for (let cell = 0; cell < seeds.length; cell++) {
    const p = cell * 3;
    seeds[cell] = Math.max(Math.abs(current[p] - previous[p]), Math.abs(current[p + 1] - previous[p + 1]), Math.abs(current[p + 2] - previous[p + 2])) > 4 ? 1 : 0;
  }
  for (let cell = 0; cell < seeds.length; cell++) {
    if (!seeds[cell]) continue;
    released[cell] = 1;
    const x = cell % width, y = Math.floor(cell / width);
    if (!((x > 0 && seeds[cell - 1]) || (x + 1 < width && seeds[cell + 1]) ||
        (y > 0 && seeds[cell - width]) || (y + 1 < height && seeds[cell + width]))) continue;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (x + ox >= 0 && x + ox < width && y + oy >= 0 && y + oy < height) released[cell + oy * width + ox] = 1;
    }
  }
  return released;
}

function stableToneIndex(cell, label, color, light, previous, palette, allowed, canStabilize) {
  if (!canStabilize || !previous?.toneReferenceLight || previous.labels[cell] !== label ||
      Math.abs(light - previous.toneReferenceLight[cell]) > 4) return -1;
  const p = cell * 3;
  if (Math.max(Math.abs(color[0] - previous.sourceRgb[p]), Math.abs(color[1] - previous.sourceRgb[p + 1]),
      Math.abs(color[2] - previous.sourceRgb[p + 2])) > 8) return -1;
  const old = [previous.renderedRgb[p], previous.renderedRgb[p + 1], previous.renderedRgb[p + 2]];
  const index = nearestPaletteIndex(old, palette, allowed);
  if (index < 0) return -1;
  const tone = palette[index];
  return colorDistanceSquared(...old, ...tone) <= 12 * 12 ? index : -1;
}

function hysteresisIndex(cell, label, color, previous, palette, allowed, canStabilize) {
  if (!canStabilize || !previous) return -1;
  const width = previous.width, height = previous.height;
  const x = cell % width, y = Math.floor(cell / width);
  let match = -1, bestOffset = Infinity;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const nx = x + ox, ny = y + oy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const candidate = ny * width + nx;
    if (previous.labels[candidate] !== label) continue;
    const offset = Math.abs(ox) + Math.abs(oy);
    if (offset < bestOffset) { match = candidate; bestOffset = offset; }
  }
  if (match < 0) return -1;
  const oldRgbOffset = match * 3;
  const dr = Math.abs(color[0] - previous.renderedRgb[oldRgbOffset]);
  const dg = Math.abs(color[1] - previous.renderedRgb[oldRgbOffset + 1]);
  const db = Math.abs(color[2] - previous.renderedRgb[oldRgbOffset + 2]);
  if (Math.max(dr, dg, db) > 12) return -1;
  let bestIndex = -1, bestDistance = Infinity;
  for (const index of allowed) {
    const swatch = palette[index];
    const distance = colorDistanceSquared(previous.renderedRgb[oldRgbOffset], previous.renderedRgb[oldRgbOffset + 1], previous.renderedRgb[oldRgbOffset + 2], swatch[0], swatch[1], swatch[2]);
    if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
  }
  return bestDistance <= 12 * 12 ? bestIndex : -1;
}

/**
 * Boundary-preserving palette renderer for externally supplied, stable object IDs.
 * Input RGB is treated as opaque source color (alpha is ignored); output alpha is 255.
 * This is post-processing; it performs no object recognition or mask tracking.
 */
export function createObjectRenderer({ size = 128, colors = DEFAULT_COLORS, shading = 'sampled', paletteSession = null, dither = 'none', simplifySurfaces = false, simplifyLighting = simplifySurfaces, surfaceSmoothing = false, surfaceTones = false } = {}) {
  if (!Number.isInteger(size) || size < 1 || size > MAX_OUTPUT_SIZE) throw new RangeError(`size must be an integer from 1 to ${MAX_OUTPUT_SIZE}`);
  if (!Number.isInteger(colors) || colors < 1 || colors > 256) throw new RangeError('colors must be an integer from 1 to 256');
  if (!['sampled', 'three-tone'].includes(shading)) throw new RangeError('unknown shading style');
  const threeTone = shading === 'three-tone';
  if (!['none', 'ordered'].includes(dither)) throw new RangeError('unknown dither style');
  if (paletteSession && (!threeTone || typeof paletteSession.get !== 'function' || typeof paletteSession.capture !== 'function')) throw new TypeError('paletteSession requires a three-tone palette controller');
  const orderedDither = threeTone && dither === 'ordered';
  const regionTracker = threeTone ? createMaterialRegionTracker() : null;
  let previous = null;
  let extraTones = null, extraToneRevision = null;
  const textureStabilizer = threeTone && surfaceSmoothing ? createSurfaceTextureStabilizer() : null;
  let regionalBindings = new Map();
  const bindingState = paletteSession ? (paletteBindingStates.get(paletteSession) ?? { revision: null, bindings: new Map() }) : null;
  if (paletteSession) paletteBindingStates.set(paletteSession, bindingState);

  function reset() { previous = null; regionalBindings.clear(); regionTracker?.reset(); textureStabilizer?.reset(); }

  function render(frame, segmentation = null, { protectedCells = null, faceGuides = null } = {}) {
    assertFrame(frame);
    const segmented = assertSegmentation(segmentation);
    const { width, height } = outputGeometry(frame, size);
    const cellCount = width * height;
    if (protectedCells !== null && (!(protectedCells instanceof Uint8Array) || protectedCells.length !== cellCount)) {
      throw new TypeError('protectedCells must match the output grid');
    }
    const { owners: objectLabels } = collectCellOwners(frame, segmentation, segmented, width, height);
    const collect = threeTone ? collectCellSamples : collectCellMedoids;
    const sampled = collect(frame, segmentation, segmented, width, height, objectLabels);
    const rawSourceRgb = sampled.rgb, sourceCounts = sampled.counts;
    const sameSourceGeometry = !!previous && previous.width === width && previous.height === height &&
      previous.sourceWidth === frame.width && previous.sourceHeight === frame.height;
    const sameGeometry = sameSourceGeometry &&
      previous.segmentationWidth === (segmented ? segmentation.width : 0) &&
      previous.segmentationHeight === (segmented ? segmentation.height : 0) && previous.segmented === segmented;
    const legacySceneCut = sameGeometry && sceneChanged(threeTone ? { ...previous, sourceRgb: previous.rawSourceRgb, labels: previous.objects } : previous,
      rawSourceRgb, width, height, objectLabels, segmented, frame.width, frame.height,
      segmented ? segmentation.width : 0, segmented ? segmentation.height : 0);
    let sourceDelta = 0;
    if (sameSourceGeometry && previous.globalTones) {
      for (let p = 0; p < rawSourceRgb.length; p++) sourceDelta += Math.abs(rawSourceRgb[p] - previous.rawSourceRgb[p]);
    }
    const sceneCut = previous?.globalTones ? sameSourceGeometry && sourceDelta / rawSourceRgb.length >= 52 : legacySceneCut;
    const canStabilize = sameGeometry && !sceneCut;
    if (sceneCut) { regionTracker?.reset(); regionalBindings.clear(); }
    const lines = threeTone ? refineThinLineSamples({ rgb: rawSourceRgb, coverageRgb: sampled.coverageRgb,
      objects: objectLabels, width, height, protectedCells, previous: canStabilize ? previous.lineState : null }) : null;
    const detailProtection = threeTone ? new Uint8Array(cellCount) : protectedCells;
    if (threeTone) for (let cell = 0; cell < cellCount; cell++) detailProtection[cell] = protectedCells?.[cell] || lines.lineCells[cell] ? 1 : 0;
    // A center sample can hit a tiny dark fleck even when its source footprint
    // belongs almost entirely to the surrounding plane. Correct that evidence
    // before material classification and palette capture can amplify it.
    const specks = threeTone && simplifySurfaces ? removeSurfaceSpecks({ rgb: lines.rgb,
      coverageRgb: sampled.coverageRgb, counts: sourceCounts, objects: objectLabels,
      protectedCells: detailProtection, width, height }) : null;
    const surfaces = threeTone && simplifySurfaces ? simplifySurfaceSamples({ rgb: specks.rgb, objects: objectLabels, protectedCells: detailProtection, width, height }) : null;
    const illumination = threeTone && simplifyLighting ? simplifyIllumination({
      rgb: surfaces?.rgb ?? lines.rgb, objects: objectLabels,
      protectedCells: detailProtection, width, height
    }) : null;
    // Protect the light itself through dither and cluster cleanup, while keeping
    // all object IDs and the current-frame motion signal unchanged.
    if (illumination) for (let cell = 0; cell < cellCount; cell++) {
      detailProtection[cell] ||= illumination.lightCoreCells[cell] || illumination.haloCells[cell];
    }
    const flatSourceRgb = illumination?.rgb ?? surfaces?.rgb ?? lines?.rgb ?? rawSourceRgb;
    if (!canStabilize) textureStabilizer?.reset();
    const texture = textureStabilizer ? textureStabilizer.render({
      rgb: flatSourceRgb, objects: objectLabels, protectedCells: detailProtection, width, height
    }) : null;
    const sourceRgb = surfaceSmoothing && texture ? texture.rgb : flatSourceRgb;
    const changedCells = threeTone ? detectChangedCells(rawSourceRgb, canStabilize ? previous.rawSourceRgb : null,
      objectLabels, canStabilize ? previous.objects : null, width, height) : null;
    if (threeTone && canStabilize) {
      const lineChanges = detectChangedCells(sourceRgb, previous.sourceRgb, objectLabels, previous.objects, width, height);
      for (let cell = 0; cell < cellCount; cell++) changedCells[cell] ||= lineChanges[cell];
      // A detected stroke appearing/disappearing must not retain synthesized color.
      for (let cell = 0; cell < cellCount; cell++) if (lines.lineCells[cell] !== previous.lineCells[cell]) {
        const x = cell % width, y = Math.floor(cell / width);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          if (x + ox >= 0 && x + ox < width && y + oy >= 0 && y + oy < height) changedCells[(y + oy) * width + x + ox] = 1;
        }
      }
    }
    const locked = paletteSession ? (paletteSession.get() ?? paletteSession.capture(sourceRgb, objectLabels, sourceCounts, { width, height, protectedCells: detailProtection })) : null;
    const globalTones = locked?.mode === 'global-tones';
    const edgeLight = globalTones ? Float32Array.from({ length: cellCount }, (_, cell) => grayLight(sourceRgb[cell * 3], sourceRgb[cell * 3 + 1], sourceRgb[cell * 3 + 2])) : null;
    const materialPrevious = canStabilize ? { ...previous, labels: previous.familyLabels } : null;
    const materials = threeTone ? classifyMaterials(sourceRgb, objectLabels, materialPrevious, changedCells, locked ? (r, g, b) => (globalTones ? recognitionSurfaceKey : recognitionMaterialKey)(r, g, b, locked.saturation) : undefined, globalTones ? 64 : 32) : null;
    const localRegions = threeTone && (!paletteSession || globalTones) ? regionTracker.partition(materials.materials, width, height, { protectedCells: detailProtection, edgeLight }) : null;
    const labels = localRegions?.labels ?? (paletteSession ? materials.materials : objectLabels);
    // Use anchored samples, including coverage-adjusted line colors. Tiny sensor noise must
    // not change which hue wins a luminance quantile. The anchor advances once
    // cumulative RGB change exceeds the material hold threshold.
    const regions = makeRegionCandidates(labels, materials?.referenceRgb ?? sourceRgb, sourceCounts, detailProtection, lines?.lineCells);
    const build = threeTone ? buildThreeTonePalette : buildPalette;
    if (locked && bindingState.revision !== locked.revision) {
      bindingState.bindings.clear(); regionalBindings.clear(); bindingState.revision = locked.revision;
    }
    const sameColorGrid = previous && previous.width === width && previous.height === height &&
      previous.sourceWidth === frame.width && previous.sourceHeight === frame.height && !sceneCut;
    const assigned = globalTones ? assignGlobalPalette(regions, locked, regionalBindings,
      sameColorGrid ? { previous, rgb: sourceRgb } : null)
      : locked ? assignFixedPalette(regions, locked, bindingState.bindings) : build(regions, colors);
    let { palette, owners: paletteOwners } = assigned;
    const { regionList } = assigned;
    if (globalTones && surfaceTones) {
      if (extraToneRevision !== locked.revision) {
        extraTones = buildSurfaceTones(locked); extraToneRevision = locked.revision;
      }
      palette = extraTones.palette;
      paletteOwners = [...paletteOwners, ...palette.slice(paletteOwners.length).map(() => new Set())];
      for (const region of regionList) {
        const key = assigned.bindings.get(region.id)?.prototypeKey;
        region.surfaceIndices = [...new Set([...region.paletteIndices, ...(extraTones.extrasByRamp.get(key) ?? [])])];
        region.surfaceRamp = prepareGlobalToneRamp(palette, region.surfaceIndices);
        for (const index of region.surfaceIndices) paletteOwners[index].add(region.id);
      }
    }
    if (globalTones) regionalBindings = assigned.bindings;
    if (orderedDither && !locked) for (const region of regionList) if (region.paletteIndices.length) region.toneRamp = prepareToneRamp(palette, region.paletteIndices);
    // Each region still selects its own hue ramp. Extra solid tones do not
    // interpolate across edges, so an AI mask changing nearby must not remove
    // them. Only source-detail cells and compact faces keep the base ramp.
    const fineToneCells = globalTones && surfaceTones ? Uint8Array.from(detailProtection,
      (protectedCell, cell) => !protectedCell && !(faceGuides?.compact && faceGuides.skin?.[cell]) ? 1 : 0) : null;
    const ditherProtected = orderedDither ? ditherProtection(sourceRgb, objectLabels, detailProtection, width, height) : null;
    const toneLight = threeTone ? smoothMaterialLight(sourceRgb, labels, width, height, detailProtection, globalTones ? grayLight : null) : null;
    const toneReferenceLight = threeTone ? new Float32Array(toneLight) : null;
    // RGB-only motion is independent of delayed AI IDs. New boundaries still
    // control sampling/protection immediately; unchanged colors retain an anchor.
    const colorMotion = globalTones && sameColorGrid
      ? detectChangedCells(sourceRgb, previous.sourceRgb, objectLabels, objectLabels, width, height) : changedCells;
    const toneMotion = globalTones && sameColorGrid ? coherentToneMotion(sourceRgb, previous.sourceRgb, width, height) : changedCells;
    const toneAnchorRgb = threeTone ? new Uint8Array(sourceRgb) : null;
    let toneAnchorHeldCells = 0, ditherDecisionHeldCells = 0;
    if ((orderedDither || globalTones) && (globalTones ? sameColorGrid : canStabilize)) for (let cell = 0; cell < cellCount; cell++) {
      const p = cell * 3, anchor = previous.toneAnchorRgb ?? previous.sourceRgb;
      const sameColor = Math.max(Math.abs(sourceRgb[p] - anchor[p]), Math.abs(sourceRgb[p + 1] - anchor[p + 1]), Math.abs(sourceRgb[p + 2] - anchor[p + 2])) <= (globalTones ? 4 : 2);
      // Connected movement releases adjacent shading immediately.
      if (!(globalTones ? toneMotion[cell] : changedCells[cell]) && sameColor &&
          (globalTones || previous.labels[cell] === labels[cell]) &&
          Math.abs(toneLight[cell] - previous.toneReferenceLight[cell]) <= (globalTones ? 4 : 2)) {
        toneReferenceLight[cell] = previous.toneReferenceLight[cell];
        toneAnchorRgb[p] = anchor[p]; toneAnchorRgb[p + 1] = anchor[p + 1]; toneAnchorRgb[p + 2] = anchor[p + 2];
        toneAnchorHeldCells++;
      }
    }
    const ditherEligible = orderedDither ? smoothTransitionCells(toneReferenceLight, labels, ditherProtected, width, height) : null;
    const pendingDither = orderedDither ? new Uint8Array(cellCount) : null;
    if (orderedDither && globalTones && sameColorGrid && previous.ditherEligible) {
      for (let y = 2; y < height - 2; y++) for (let x = 2; x < width - 2; x++) {
        const cell = y * width + x;
        if (colorMotion[cell] || previous.ditherEligible[cell] === ditherEligible[cell]) continue;
        // Never delay a newly detected detail or object/material boundary.
        let safe = true;
        for (let oy = -2; oy <= 2 && safe; oy++) for (let ox = -2; ox <= 2; ox++) {
          const neighbor = cell + oy * width + ox;
          if (ditherProtected[neighbor] || labels[neighbor] !== labels[cell] || colorMotion[neighbor]) { safe = false; break; }
        }
        if (!safe) continue;
        const request = ditherEligible[cell] + 1;
        if (previous.pendingDither?.[cell] === request) continue;
        pendingDither[cell] = request;
        ditherEligible[cell] = previous.ditherEligible[cell];
        ditherDecisionHeldCells++;
      }
    }
    const ditherCells = orderedDither ? new Uint8Array(cellCount) : null;
    const changedRegions = new Set();
    if (changedCells) for (let cell = 0; cell < cellCount; cell++) if (changedCells[cell]) changedRegions.add(labels[cell]);
    const paletteHeldEntries = locked ? palette.length : canStabilize ? stabilizePalette(palette, paletteOwners, regions, previous, changedRegions) : 0;
    const pendingToneKeys = threeTone ? new Uint32Array(cellCount) : null;
    const pendingToneFrames = threeTone ? new Uint8Array(cellCount) : null;
    let indices = new Uint8Array(cellCount);
    const data = new Uint8ClampedArray(cellCount * 4);
    const renderedRgb = new Uint8Array(cellCount * 3);
    const regionById = regions;
    const globalPaletteIndices = palette.map((_, index) => index);
    let heldCells = 0, overflowCells = 0, ditheredCells = 0;

    for (let cell = 0; cell < cellCount; cell++) {
      const label = labels[cell], region = regionById.get(label);
      const color = [sourceRgb[cell * 3], sourceRgb[cell * 3 + 1], sourceRgb[cell * 3 + 2]];
      // Under a crowded global palette, choose one fixed nearest base per
      // overflow material; never let it borrow an unrestricted 24-color ramp.
      if (threeTone && !region.paletteIndices.length && region.fallbackIndex === undefined) {
        const base = region.representative;
        region.fallbackIndex = nearestPaletteIndex([base.r, base.g, base.b], palette, globalPaletteIndices);
      }
      const allowed = region.paletteIndices.length ? region.paletteIndices
        : threeTone ? [region.fallbackIndex] : globalPaletteIndices;
      const light = toneReferenceLight?.[cell];
      const fineSurface = surfaceTones && region.surfaceRamp && fineToneCells?.[cell];
      const activeRamp = fineSurface ? region.surfaceRamp : region.toneRamp;
      const transitionIndex = orderedDither && ditherEligible[cell] && allowed.length > 1
        ? transitionRampIndex(light, activeRamp, cell % width, Math.floor(cell / width), surfaceTones ? 48 : 100) : -1;
      let index = transitionIndex >= 0 ? transitionIndex
        : globalTones ? nearestGlobalToneIndex(light, activeRamp)
          : threeTone ? nearestToneIndex(light, palette, allowed) : nearestPaletteIndex(color, palette, allowed);
      if (transitionIndex >= 0) { ditheredCells++; ditherCells[cell] = 1; }
      let held = orderedDither || globalTones ? -1 : threeTone ? stableToneIndex(cell, label, color, toneLight[cell], previous, palette, allowed, canStabilize && !changedCells[cell])
        : hysteresisIndex(cell, label, color, previous, palette, region.paletteIndices.length ? region.paletteIndices : [], canStabilize);
      if (threeTone && held >= 0 && held !== index) {
        // Two consecutive requests for the same new tone confirm a real change.
        // Tiny threshold changes must not leave an old pixel held indefinitely.
        const key = rgbKey(...palette[index]) + 1;
        pendingToneKeys[cell] = key;
        pendingToneFrames[cell] = previous?.pendingToneKeys?.[cell] === key ? previous.pendingToneFrames[cell] + 1 : 1;
        if (pendingToneFrames[cell] >= 2) { held = -1; pendingToneKeys[cell] = 0; pendingToneFrames[cell] = 0; }
      }
      if (held >= 0) {
        index = held; heldCells++;
        if (threeTone) toneReferenceLight[cell] = previous.toneReferenceLight[cell];
      }
      if (!region.paletteIndices.length) overflowCells++;
      if (index < 0) throw new Error('palette allocation produced no color');
      indices[cell] = index;
      const swatch = palette[index], target = cell * 4;
      data[target] = swatch[0]; data[target + 1] = swatch[1]; data[target + 2] = swatch[2]; data[target + 3] = 255;
      renderedRgb[cell * 3] = swatch[0]; renderedRgb[cell * 3 + 1] = swatch[1]; renderedRgb[cell * 3 + 2] = swatch[2];
    }

    let removedNoiseCells = 0;
    if (threeTone) {
      const cleanupProtection = new Uint8Array(detailProtection);
      if (orderedDither) for (let cell = 0; cell < cellCount; cell++) {
        cleanupProtection[cell] ||= ditherCells[cell] || ditherProtected[cell];
      }
      const cleaned = cleanPixelClusters({ indices, palette, width, height, objects: objectLabels,
        materials: labels, sourceRgb, protectedCells: cleanupProtection });
      removedNoiseCells = cleaned.removedCells;
      for (let cell = 0; cell < cellCount; cell++) {
        if (cleaned.indices[cell] === indices[cell]) continue;
        // Extra tones cannot spread into protected parts or compact-face skin.
        if (globalTones && surfaceTones && cleaned.indices[cell] >= locked.palette.length && !fineToneCells?.[cell]) {
          cleaned.indices[cell] = indices[cell]; removedNoiseCells--; continue;
        }
        const color = palette[cleaned.indices[cell]], p = cell * 4, rgb = cell * 3;
        data[p] = renderedRgb[rgb] = color[0];
        data[p + 1] = renderedRgb[rgb + 1] = color[1];
        data[p + 2] = renderedRgb[rgb + 2] = color[2];
        toneReferenceLight[cell] = toneLight[cell];
        pendingToneKeys[cell] = 0; pendingToneFrames[cell] = 0;
      }
      indices = cleaned.indices;
    }

    // A stationary source patch must not switch output just because a nearby
    // material changes its chosen ramp. Keep a fixed RGB reference so real
    // cumulative exposure/motion still releases the old output immediately.
    const surfaceOutputAnchor = globalTones && (surfaceSmoothing || surfaceTones) ? new Uint8Array(flatSourceRgb) : null;
    let surfaceOutputHeldCells = 0;
    if (surfaceOutputAnchor && sameColorGrid && previous.paletteRevision === locked.revision && previous.surfaceOutputAnchor) {
      const stable = new Uint8Array(cellCount);
      for (let cell = 0; cell < cellCount; cell++) {
        const p = cell * 3;
        stable[cell] = objectLabels[cell] === previous.objects[cell] &&
          detailProtection[cell] === previous.detailProtection[cell] && !detailProtection[cell] &&
          !(faceGuides?.compact && faceGuides.skin?.[cell]) && !previous.compactFaceSkin?.[cell] &&
          Math.abs(flatSourceRgb[p] - previous.surfaceOutputAnchor[p]) <= 4 &&
          Math.abs(flatSourceRgb[p + 1] - previous.surfaceOutputAnchor[p + 1]) <= 4 &&
          Math.abs(flatSourceRgb[p + 2] - previous.surfaceOutputAnchor[p + 2]) <= 4 ? 1 : 0;
      }
      for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        const cell = y * width + x;
        if (!stable[cell]) continue;
        let safe = true;
        for (let dy = -1; dy <= 1 && safe; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!stable[cell + dy * width + dx]) { safe = false; break; }
        }
        if (!safe) continue;
        const oldIndex = previous.indices[cell];
        // The captured palette is fixed. A changed regional quantile alone is
        // not evidence of a changed source pixel and must not revoke its tone.
        const swatch = palette[oldIndex], old = previous.palette[oldIndex];
        if (!swatch || !old || swatch.some((value, channel) => value !== old[channel])) continue;
        const p = cell * 4, q = cell * 3;
        indices[cell] = oldIndex;
        for (let channel = 0; channel < 3; channel++) {
          data[p + channel] = renderedRgb[q + channel] = swatch[channel];
          surfaceOutputAnchor[q + channel] = previous.surfaceOutputAnchor[q + channel];
        }
        if (orderedDither && previous.ditherCells) {
          ditheredCells += previous.ditherCells[cell] - ditherCells[cell];
          ditherCells[cell] = previous.ditherCells[cell];
        }
        surfaceOutputHeldCells++;
      }
    }

    const facePixels = globalTones && faceGuides ? renderFacePixels({ frame, rgb: sourceRgb,
      objects: objectLabels, indices, palette: locked.palette, width, height, guide: faceGuides,
      previous: canStabilize ? previous.faceState : null, flattenShadows: simplifyLighting }) : null;
    if (facePixels?.touched) {
      indices = facePixels.indices;
      for (let cell = 0; cell < cellCount; cell++) {
        if (!facePixels.touched[cell]) continue;
        const color = palette[indices[cell]], p = cell * 4, rgb = cell * 3;
        data[p] = renderedRgb[rgb] = color[0];
        data[p + 1] = renderedRgb[rgb + 1] = color[1];
        data[p + 2] = renderedRgb[rgb + 2] = color[2];
        if (ditherCells?.[cell]) { ditherCells[cell] = 0; ditheredCells--; }
      }
    }

    const overBudgetLabels = regionList.filter((region) => region.paletteIndices.length === 0).map((region) => region.id);
    const quality = !segmented ? 'unsegmented' : overBudgetLabels.length ? 'segmented-over-budget' : 'segmented';
    const stats = {
      quality,
      shading,
      paletteLocked: Boolean(locked),
      paletteRevision: locked?.revision ?? null,
      recognitionSaturation: locked?.saturation ?? 1,
      globalToneLevels: globalTones ? locked.toneLevels : null,
      globalGrayLevels: globalTones ? [...locked.levels] : null,
      paletteGrayReference: globalTones ? 'base-palette' : null,
      maxPaletteGrayError: globalTones ? Math.max(...locked.palette.map(rgb => Math.min(...locked.levels.map(level => Math.abs(grayLight(...rgb) - level))))) : null,
      sharedShadow: globalTones ? locked.sharedShadow : null,
      sharedHighlight: globalTones ? 'warm-neutral' : null,
      colorsPerGrayLevel: globalTones ? locked.levelIndices?.map(indices => indices.length) : null,
      colorsPerHueGroup: globalTones ? locked.hueGroups?.map(group => group.indices.length) : null,
      maxHueGroupColors: globalTones && locked.hueGroups ? Math.max(0, ...locked.hueGroups.map(group => group.indices.length)) : null,
      toneAnchorHeldCells, ditherDecisionHeldCells,
      mainColorChromaScale: globalTones ? locked.mainColorChromaScale : null,
      dither: orderedDither ? 'selective-canvas-2x2' : 'none',
      ditherLevels: orderedDither ? 5 : 0,
      ditheredCells,
      solidCells: cellCount - ditheredCells,
      ditherCoveragePercent: 100 * ditheredCells / cellCount,
      ditherProtectedCells: ditherProtected?.reduce((sum, value) => sum + Boolean(value), 0) ?? 0,
      tonesPerMaterial: threeTone ? 3 : null,
      materialCount: threeTone ? regions.size : null,
      mergedMaterialFragments: localRegions?.mergedCount ?? 0,
      maxMaterialColors: threeTone ? regionList.reduce((max, region) => Math.max(max, region.paletteIndices.length, 1), 0) : null,
      materialHeldCells: materials?.held ?? 0,
      removedNoiseCells,
      simplifiedSurfaceCells: surfaces?.simplifiedCells ?? 0,
      removedSurfaceSpeckCells: specks?.removedCells ?? 0,
      simplifiedTextureCells: surfaceSmoothing ? texture?.changedCells ?? 0 : 0,
      surfaceDecisionHeldCells: texture?.heldCells ?? 0,
      surfaceOutputHeldCells,
      surfaceInteriorCells: fineToneCells?.reduce((sum, value) => sum + value, 0) ?? 0,
      basePaletteSize: locked?.palette.length ?? palette.length,
      surfaceToneColors: surfaceTones && extraTones ? palette.length - extraTones.baseSize : 0,
      surfaceToneGrayLevels: surfaceTones && extraTones ? [...new Set(extraTones.targets.values())].sort((a,b) => a-b) : [],
      maxSurfaceColors: surfaceTones ? regionList.reduce((max, region) => Math.max(max, region.surfaceIndices?.length ?? 0), 0) : 0,
      suppressedHaloCells: illumination?.haloCells.reduce((sum, value) => sum + value, 0) ?? 0,
      flattenedShadowCells: illumination?.flattenedShadowCells.reduce((sum, value) => sum + value, 0) ?? 0,
      faceSkinCells: facePixels?.skinCells ?? 0,
      faceFeatureCells: facePixels?.featureCells ?? 0,
      faceSkinColors: facePixels?.skinColors ?? 0,
      faceWidth: faceGuides?.faceWidth ?? null,
      faceSourceBase: facePixels?.state?.base ?? null,
      facePaletteRamp: facePixels?.state?.ramp.map(index => index < 0 ? null : palette[index]) ?? null,
      straightLineCount: lines?.lineCount ?? 0,
      softenedLineCount: lines?.softenedLines ?? 0,
      straightLineCells: lines?.lineCells.reduce((sum, value) => sum + value, 0) ?? 0,
      regularizedLineCells: lines?.regularizedCells ?? 0,
      motionReleasedCells: canStabilize && changedCells ? changedCells.reduce((sum, value) => sum + value, 0) : 0,
      protectedDetailCells: protectedCells?.reduce((sum, value) => sum + Boolean(value), 0) ?? 0,
      regionCount: new Set(objectLabels).size,
      paletteSize: palette.length,
      colorLimit: surfaceTones && extraTones ? extraTones.limit : globalTones ? locked.paletteLimit ?? colors : colors,
      overBudgetRegionCount: overBudgetLabels.length,
      overBudgetLabels,
      overBudgetCellCount: overflowCells,
      temporalHeldCells: heldCells,
      paletteHeldEntries,
      sceneCut
    };
    previous = {
      width, height, sourceWidth: frame.width, sourceHeight: frame.height,
      segmentationWidth: segmented ? segmentation.width : 0,
      segmentationHeight: segmented ? segmentation.height : 0,
      segmented, labels: threeTone ? new Float64Array(labels) : new Uint32Array(labels),
      objects: new Uint32Array(objectLabels), sourceRgb: new Uint8Array(sourceRgb),
      rawSourceRgb: new Uint8Array(rawSourceRgb), lineCells: lines?.lineCells ?? null, lineState: lines?.state ?? null,
      faceState: facePixels?.state ?? null,
      compactFaceSkin: faceGuides?.compact && faceGuides.skin ? new Uint8Array(faceGuides.skin) : null,
      materialReferenceRgb: materials?.referenceRgb ?? null,
      familyLabels: materials?.materials ?? null,
      toneReferenceLight, toneAnchorRgb, ditherEligible, pendingDither, globalTones, pendingToneKeys, pendingToneFrames,
      surfaceOutputAnchor, detailProtection, ditherCells, paletteRevision: locked?.revision ?? null,
      indices: new Uint8Array(indices), renderedRgb: new Uint8Array(renderedRgb),
      palette: palette.map((color) => [...color]),
      paletteOwners: paletteOwners.map((set) => [...set])
    };
    return { width, height, data, palette, indices, labels: objectLabels, segmented, stats };
  }

  return { render, reset };
}
