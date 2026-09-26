import { srgbToLinear, linearToSrgb } from './global-tones.mjs';
import { rgbToLab } from './convert.mjs';

const LIMIT_PIXELS = 16_000_000;
const LEVELS = Object.freeze([24, 144, 192, 240]);
const CUTS = Object.freeze([70, 172, 220]);
const CHROMA_GROUP_RADIUS = .055;
const BAYER = Object.freeze([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
const decode = (v) => srgbToLinear(v);
const encodeY = (y) => linearToSrgb(Math.max(0, Math.min(1, y)));
const rgbLab = (rgb) => rgbToLab(rgb[0], rgb[1], rgb[2]);

function validate(sampled) {
  if (!sampled || !Number.isInteger(sampled.width) || !Number.isInteger(sampled.height) ||
      sampled.width < 1 || sampled.height < 1 || sampled.width * sampled.height > LIMIT_PIXELS ||
      !(sampled.data instanceof Uint8Array || sampled.data instanceof Uint8ClampedArray) ||
      sampled.data.length !== sampled.width * sampled.height * 4 ||
      (sampled.labels != null && (!ArrayBuffer.isView(sampled.labels) || sampled.labels.length !== sampled.width * sampled.height))) {
    throw new TypeError('sampled must contain bounded RGBA pixels and an optional matching label map');
  }
}
function yAt(data, p) {
  return .2126 * decode(data[p]) + .7152 * decode(data[p + 1]) + .0722 * decode(data[p + 2]);
}
function grayAt(data, p) { return encodeY(yAt(data, p)); }
function chroma(rgb) { const lab = rgbLab(rgb); return [lab[1], lab[2]]; }
function chromaDistance(a, b) { return (a[0]-b[0])**2 + (a[1]-b[1])**2; }

function linearRgbFromOklab(lightness, a, b) {
  const l = (lightness + .3963377774 * a + .2158037573 * b) ** 3;
  const m = (lightness - .1055613458 * a - .0638541728 * b) ** 3;
  const s = (lightness - .0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
    -.0041960863 * l - .7034186147 * m + 1.707614701 * s
  ];
}
function linearRgbY(rgb) { return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]; }

/** Fit palette swatches to gray-axis Y while retaining source Oklab hue and chroma. */
function fitPaletteTone(rgb, targetGray) {
  const [, a, b] = rgbLab(rgb), targetY = srgbToLinear(targetGray);
  const solve = (scale) => {
    let low = 0, high = 1, linear = [targetY, targetY, targetY];
    for (let step = 0; step < 22; step++) {
      const lightness = (low + high) / 2;
      linear = linearRgbFromOklab(lightness, a * scale, b * scale);
      if (linearRgbY(linear) < targetY) low = lightness;
      else high = lightness;
    }
    const lightness = (low + high) / 2;
    linear = linearRgbFromOklab(lightness, a * scale, b * scale);
    return { linear, inGamut: linear.every((value) => value >= -1e-7 && value <= 1 + 1e-7) };
  };

  let fitted = solve(1);
  if (!fitted.inGamut) {
    let low = 0, high = 1;
    fitted = solve(0);
    for (let step = 0; step < 20; step++) {
      const scale = (low + high) / 2, candidate = solve(scale);
      if (candidate.inGamut) { low = scale; fitted = candidate; }
      else high = scale;
    }
  }
  return fitted.linear.map((value) => Math.round(linearToSrgb(Math.max(0, Math.min(1, value)))));
}

function sceneCandidates(sampled) {
  const { width, height, data } = sampled, count = width * height;
  const bins = new Map();
  const samples = Math.min(4096, count);
  // Evenly distributed deterministic samples bound analysis cost regardless of frame size.
  for (let n = 0; n < samples; n++) {
    const i = Math.floor((n + .5) * count / samples), p = i * 4, light = grayAt(data, p);
    if (light <= CUTS[0] || light >= CUTS[2]) continue;
    const rgb = [data[p], data[p + 1], data[p + 2]], key = (rgb[0] >> 3) << 10 | (rgb[1] >> 3) << 5 | (rgb[2] >> 3);
    const prior = bins.get(key);
    if (prior) prior.weight++;
    else bins.set(key, { rgb, weight: 1 });
  }
  return [...bins.values()].sort((a, b) => b.weight - a.weight || a.rgb[0] - b.rgb[0] || a.rgb[1] - b.rgb[1] || a.rgb[2] - b.rgb[2]);
}
function sceneColorGroups(candidates) {
  const groups = [], maxDistance = CHROMA_GROUP_RADIUS ** 2;
  for (const item of candidates) {
    if (Math.hypot(...item.chroma) < .035) continue;
    let nearest = null, distance = maxDistance;
    for (const group of groups) {
      const next = chromaDistance(item.chroma, group.chroma);
      if (next < distance) { nearest = group; distance = next; }
    }
    if (!nearest) {
      groups.push({ chroma: [...item.chroma], weight: item.weight, members: [item] });
      continue;
    }
    const weight = nearest.weight + item.weight;
    nearest.chroma[0] = (nearest.chroma[0] * nearest.weight + item.chroma[0] * item.weight) / weight;
    nearest.chroma[1] = (nearest.chroma[1] * nearest.weight + item.chroma[1] * item.weight) / weight;
    nearest.weight = weight;
    nearest.members.push(item);
  }
  return groups.map((group) => {
    // A source medoid keeps the actual scene hue while the centroid represents its area.
    const source = group.members.reduce((best, item) =>
      !best || chromaDistance(item.chroma, group.chroma) < chromaDistance(best.chroma, group.chroma) ? item : best, null);
    return { rgb: source.rgb, chroma: group.chroma, weight: group.weight };
  });
}

function buildPalette(sampled) {
  const bins = sceneCandidates(sampled), representatives = [];
  const candidateData = bins.map((item) => ({ ...item, chroma: chroma(item.rgb) }));
  const neutral = candidateData.filter((item) => Math.hypot(...item.chroma) < .035).sort((a,b)=>b.weight-a.weight);
  if (neutral.length) representatives.push(neutral[0]);
  else representatives.push({ rgb: [144, 144, 144], weight: 1, chroma: [0, 0] });
  const groups = sceneColorGroups(candidateData);
  const selected = new Set(), nearestError = groups.map((group) => chromaDistance(group.chroma, representatives[0].chroma));
  while (representatives.length < 11) {
    let best = -1, bestGain = 0;
    for (let candidate = 0; candidate < groups.length; candidate++) {
      if (selected.has(candidate)) continue;
      let gain = 0;
      for (let i = 0; i < groups.length; i++) {
        const improvement = nearestError[i] - chromaDistance(groups[i].chroma, groups[candidate].chroma);
        if (improvement > 0) gain += groups[i].weight * improvement;
      }
      if (gain > bestGain) { bestGain = gain; best = candidate; }
    }
    if (best < 0 || bestGain < .00002) break;
    selected.add(best);
    representatives.push(groups[best]);
    for (let i = 0; i < groups.length; i++)
      nearestError[i] = Math.min(nearestError[i], chromaDistance(groups[i].chroma, groups[best].chroma));
  }
  const palette = [[LEVELS[0],LEVELS[0],LEVELS[0]]];
  const ramps = [];
  for (const item of representatives) {
    const first = palette.length;
    const low = fitPaletteTone(item.rgb, LEVELS[1]), high = fitPaletteTone(item.rgb, LEVELS[2]);
    palette.push(low, high);
    ramps.push({ low, high, chroma: item.chroma, lowIndex: first, highIndex: first + 1 });
  }
  const lightIndex = palette.length;
  palette.push([LEVELS[3],LEVELS[3],LEVELS[3]]);
  return { palette, ramps, lightIndex };
}

function middleColor(chromaA, chromaB, light, state) {
  if (!state.ramps.length) return light < CUTS[1] ? 1 : 2;
  let chosen = state.ramps[0], distance = (chromaA - chosen.chroma[0]) ** 2 + (chromaB - chosen.chroma[1]) ** 2;
  for (let i = 1; i < state.ramps.length; i++) {
    const next = state.ramps[i], d = (chromaA - next.chroma[0]) ** 2 + (chromaB - next.chroma[1]) ** 2;
    if (d < distance) { chosen = next; distance = d; }
  }
  return light < CUTS[1] ? chosen.lowIndex : chosen.highIndex;
}

function ditherEligible(sampled, cell, lights, chromaA, chromaB) {
  const { width, height, labels } = sampled, x = cell % width, y = Math.floor(cell / width);
  if (x === 0 || y === 0 || x === width - 1 || y === height - 1 || width < 3 || height < 3) return false;
  const center = cell, centerLabel = labels?.[center], offsets = [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1];
  if (labels && offsets.some((offset) => labels[center + offset] !== centerLabel)) return false;
  for (const offset of offsets) {
    const neighbor = center + offset;
    if (Math.abs(lights[neighbor] - lights[center]) > 24) return false;
    if (Math.abs(chromaA[neighbor] - chromaA[center]) > .035 || Math.abs(chromaB[neighbor] - chromaB[center]) > .035) return false;
  }
  const smoothRamp = (a, b, c) => {
    const first = lights[b] - lights[a], second = lights[c] - lights[b];
    return Math.abs(first) >= 1.5 && Math.abs(second) >= 1.5 && first * second > 0 &&
      Math.abs(first) < 30 && Math.abs(second) < 30 && Math.abs(first - second) <= Math.max(4, Math.min(Math.abs(first), Math.abs(second)) * .55);
  };
  const horizontal = smoothRamp(center - 1, center, center + 1) && smoothRamp(center - width - 1, center - width, center - width + 1) &&
    smoothRamp(center + width - 1, center + width, center + width + 1);
  const vertical = smoothRamp(center - width, center, center + width) && smoothRamp(center - width - 1, center - 1, center + width - 1) &&
    smoothRamp(center - width + 1, center + 1, center + width + 1);
  return horizontal || vertical;
}

export function createFourTonePalette({ dither = 'bayer' } = {}) {
  if (dither !== 'bayer' && dither !== 'none') throw new RangeError("dither must be 'bayer' or 'none'");
  let state = null, paletteLocked = false, paletteRevision = 0;
  const chromaCache = new Map();
  function reset() { state = null; paletteLocked = false; paletteRevision++; chromaCache.clear(); }

  function render(sampled) {
    validate(sampled);
    const { width, height, data } = sampled, count = width * height;
    const ys = new Float32Array(count), chromaA = new Float32Array(count), chromaB = new Float32Array(count), lights = new Float32Array(count);
    let hasMid = false, minLight = Infinity, maxLight = -Infinity, maxChroma = 0;
    for (let i = 0; i < count; i++) {
      const p = i * 4, y = yAt(data, p), light = encodeY(y), key = data[p] << 16 | data[p + 1] << 8 | data[p + 2];
      let colorChroma = chromaCache.get(key);
      if (!colorChroma && chromaCache.size < 65536) {
        const lab = rgbToLab(data[p], data[p + 1], data[p + 2]);
        colorChroma = [lab[1], lab[2]]; chromaCache.set(key, colorChroma);
      }
      if (!colorChroma) {
        const lab = rgbToLab(data[p], data[p + 1], data[p + 2]);
        colorChroma = [lab[1], lab[2]];
        if (chromaCache.size < 65536) chromaCache.set(key, colorChroma);
      }
      ys[i] = y; lights[i] = light; chromaA[i] = colorChroma[0]; chromaB[i] = colorChroma[1];
      minLight = Math.min(minLight, light); maxLight = Math.max(maxLight, light);
      maxChroma = Math.max(maxChroma, Math.hypot(colorChroma[0], colorChroma[1]));
      if (light > CUTS[0] && light < CUTS[2]) hasMid = true;
    }
    const seedEligible = hasMid && (maxLight - minLight > 8 || maxChroma > .035);
    if (!state || (!paletteLocked && seedEligible)) {
      state = buildPalette(sampled);
      paletteLocked = seedEligible;
      paletteRevision++;
    }
    const output = new Uint8ClampedArray(data.length);
    let ditheredCells = 0;
    for (let i = 0; i < count; i++) {
      const p = i * 4, light = lights[i];
      let index;
      if (light <= CUTS[0]) index = 0;
      else if (light >= CUTS[2]) index = state.lightIndex;
      else {
        const low = middleColor(chromaA[i], chromaB[i], light, state);
        index = low;
        if (dither === 'bayer' && light >= LEVELS[1] && light <= LEVELS[2] && ditherEligible(sampled, i, lights, chromaA, chromaB)) {
          const lowIs144 = light < CUTS[1];
          const pairLow = lowIs144 ? state.ramps.find((r) => r.lowIndex === low) : state.ramps.find((r) => r.highIndex === low);
          if (pairLow) {
            const coverage = Math.max(0, Math.min(1, (ys[i] - srgbToLinear(LEVELS[1])) / (srgbToLinear(LEVELS[2]) - srgbToLinear(LEVELS[1]))));
            const threshold = (BAYER[((Math.floor(i / width) & 3) << 2) | (i % width & 3)] + .5) / 16;
            index = coverage > threshold ? pairLow.highIndex : pairLow.lowIndex;
            if (index !== low) ditheredCells++;
          }
        }
      }
      const color = state.palette[index], q = i * 4;
      output[q] = color[0]; output[q + 1] = color[1]; output[q + 2] = color[2]; output[q + 3] = data[p + 3];
    }
    return { ...sampled, data: output, palette: state.palette.map((color) => [...color]),
      stats: { ...(sampled.stats ?? {}), globalToneLevels: 4, paletteLocked,
        paletteRevision, shading: 'four-tone', dither: dither === 'bayer' ? 'selective-bayer' : 'none', ditheredCells } };
  }
  return { render, reset };
}
