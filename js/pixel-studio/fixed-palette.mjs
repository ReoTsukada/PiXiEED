const MAX_EDGE = 512;
const MAX_PIXELS = MAX_EDGE * MAX_EDGE;

function assertRgbChannel(value) {
  if (!Number.isFinite(value) || value < 0 || value > 255) throw new RangeError('RGB channels must be from 0 to 255');
}

/** Return an analysis-only RGB color with saturation scaled in HSV-like coordinates. */
export function recognitionColor(r, g, b, saturation = 1.25) {
  assertRgbChannel(r);
  assertRgbChannel(g);
  assertRgbChannel(b);
  if (!Number.isFinite(saturation) || saturation <= 0) throw new RangeError('saturation must be a positive finite number');
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const chroma = maximum - minimum;
  if (chroma === 0 || saturation === 1) return [r, g, b];
  const scaledChroma = Math.min(maximum, chroma * saturation);
  const scaledMinimum = maximum - scaledChroma;
  const factor = scaledChroma / chroma;
  return [
    Math.max(0, Math.min(255, scaledMinimum + (r - minimum) * factor)),
    Math.max(0, Math.min(255, scaledMinimum + (g - minimum) * factor)),
    Math.max(0, Math.min(255, scaledMinimum + (b - minimum) * factor))
  ];
}

function colorKey(r, g, b) {
  return (r << 16) | (g << 8) | b;
}

function luma(color) {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

function distanceSquared(a, b) {
  const dx = a.descriptor[0] - b.descriptor[0];
  const dy = a.descriptor[1] - b.descriptor[1];
  const ds = a.descriptor[2] - b.descriptor[2];
  return dx * dx + dy * dy + ds * ds;
}

function quantileColor(colors, quantile) {
  const ordered = [...colors].sort((a, b) => luma(a) - luma(b) || a.key - b.key);
  const total = ordered.reduce((sum, color) => sum + color.weight, 0);
  const threshold = total * quantile;
  let accumulated = 0;
  for (const color of ordered) {
    accumulated += color.weight;
    if (accumulated >= threshold) return color;
  }
  return ordered.at(-1);
}

function copySnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    palette: snapshot.palette.map((rgb) => [...rgb]),
    ramps: snapshot.ramps.map((ramp) => ({
      key: ramp.key,
      materialKey: ramp.materialKey,
      indices: [...ramp.indices],
      base: [...ramp.base]
    })),
    revision: snapshot.revision,
    saturation: snapshot.saturation
  };
}

function analyzeFamily(r, g, b, saturation) {
  const analysis = recognitionColor(r, g, b, saturation);
  const maximum = Math.max(...analysis), minimum = Math.min(...analysis);
  const chroma = maximum - minimum;
  const sat = maximum === 0 ? 0 : chroma / maximum;
  if (sat < 0.12 || chroma < 12) {
    return { key: 'neutral', index: 0, descriptor: [0, 0, 0] };
  }
  let hue;
  if (analysis[0] === maximum) hue = ((analysis[1] - analysis[2]) / chroma) % 6;
  else if (analysis[1] === maximum) hue = (analysis[2] - analysis[0]) / chroma + 2;
  else hue = (analysis[0] - analysis[1]) / chroma + 4;
  hue = ((hue * 60) + 360) % 360;
  const hueBins = 7;
  const hueIndex = Math.floor(hue / 360 * hueBins);
  const saturationBand = sat >= 0.75 ? 'high' : sat >= 0.30 ? 'medium' : 'low';
  const saturationIndex = saturationBand === 'high' ? 2 : saturationBand === 'medium' ? 1 : 0;
  const familyAngle = ((hueIndex + 0.5) / hueBins) * Math.PI * 2;
  const representativeSaturation = saturationBand === 'high' ? 0.88 : saturationBand === 'medium' ? 0.53 : 0.22;
  return {
    key: `h${hueIndex}:${saturationBand}`,
    index: 1 + hueIndex * 3 + saturationIndex,
    descriptor: [
      Math.cos(familyAngle) * representativeSaturation,
      Math.sin(familyAngle) * representativeSaturation,
      representativeSaturation
    ]
  };
}

export function recognitionMaterialKey(r, g, b, saturation = 1.25) {
  return analyzeFamily(r, g, b, saturation).index;
}

function buildSnapshot(rgb, objects, weights, colorLimit, saturation, revision) {
  if (!(rgb instanceof Uint8Array) && !(rgb instanceof Uint8ClampedArray)) {
    throw new TypeError('rgb must be a Uint8Array of RGB triplets');
  }
  if (rgb.length === 0 || rgb.length % 3 !== 0 || rgb.length / 3 > MAX_PIXELS) {
    throw new RangeError('rgb must contain 1 to 512x512 RGB pixels');
  }
  const pixelCount = rgb.length / 3;
  if (objects != null && ((!Array.isArray(objects) && !ArrayBuffer.isView(objects)) || objects.length !== pixelCount)) {
    throw new TypeError('objects must contain one label per pixel');
  }
  if (weights != null && ((!Array.isArray(weights) && !ArrayBuffer.isView(weights)) || weights.length !== pixelCount)) {
    throw new TypeError('weights must contain one weight per pixel');
  }

  const families = new Map();
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const weight = weights == null ? 1 : weights[pixel];
    if (!Number.isFinite(weight) || weight < 0) throw new RangeError('weights must be finite and non-negative');
    if (weight === 0) continue;
    const offset = pixel * 3;
    const r = rgb[offset], g = rgb[offset + 1], b = rgb[offset + 2];
    // Labels identify source boundaries for callers, but ramps are shared by
    // chromatic family so differently lit regions of the same material keep one ramp.
    if (objects != null && typeof objects[pixel] === 'number' && !Number.isFinite(objects[pixel])) {
      throw new RangeError('object labels must be finite');
    }
    const family = analyzeFamily(r, g, b, saturation);
    let group = families.get(family.key);
    if (!group) {
      group = { key: family.key, index: family.index, descriptor: family.descriptor, weight: 0, colors: new Map() };
      families.set(family.key, group);
    }
    group.weight += weight;
    const key = colorKey(r, g, b);
    let color = group.colors.get(key);
    if (!color) {
      color = { key, r, g, b, weight: 0 };
      group.colors.set(key, color);
    }
    color.weight += weight;
  }

  if (!families.size) throw new RangeError('at least one sample must have positive weight');
  const familyLimit = Math.floor(colorLimit / 3);
  let selectedFamilies = [...families.values()].sort((a, b) => a.key.localeCompare(b.key));
  if (selectedFamilies.length > familyLimit) {
    const selected = [];
    while (selected.length < familyLimit) {
      let best = null;
      for (const candidate of selectedFamilies) {
        if (selected.includes(candidate)) continue;
        const nearest = selected.length
          ? Math.min(...selected.map((family) => distanceSquared(candidate, family)))
          : Infinity;
        const score = selected.length
          ? Math.sqrt(nearest) * (1 + Math.log1p(candidate.weight))
          : candidate.weight;
        if (!best || score > best.score || (score === best.score && candidate.key < best.family.key)) {
          best = { family: candidate, score };
        }
      }
      if (!best) break;
      selected.push(best.family);
    }
    selectedFamilies = selected.sort((a, b) => a.key.localeCompare(b.key));
  }

  const palette = [];
  const paletteByKey = new Map();
  const ramps = [];
  for (const family of selectedFamilies) {
    const colors = [...family.colors.values()];
    if (!colors.length) continue;
    const base = quantileColor(colors, 0.5);
    const tones = [quantileColor(colors, 0.15), base, quantileColor(colors, 0.85)];
    const indices = [];
    for (const tone of tones) {
      if (indices.some((paletteIndex) => paletteByKey.get(tone.key) === paletteIndex)) continue;
      let paletteIndex = paletteByKey.get(tone.key);
      if (paletteIndex === undefined) {
        paletteIndex = palette.length;
        palette.push([tone.r, tone.g, tone.b]);
        paletteByKey.set(tone.key, paletteIndex);
      }
      indices.push(paletteIndex);
    }
    ramps.push({
      key: family.key,
      materialKey: family.index,
      indices,
      base: [base.r, base.g, base.b]
    });
  }

  return { palette, ramps, revision, saturation };
}

/** Capture a deterministic, input-sampled palette. It changes only on capture(). */
export function createFixedPalette({ colorLimit = 48, saturation = 1.25 } = {}) {
  if (!Number.isInteger(colorLimit) || colorLimit < 3 || colorLimit > 256) {
    throw new RangeError('colorLimit must be an integer from 3 to 256');
  }
  if (!Number.isFinite(saturation) || saturation <= 0) throw new RangeError('saturation must be positive and finite');
  let current = null;
  let revision = 0;
  return {
    capture(rgb, objects = null, weights = null) {
      const next = buildSnapshot(rgb, objects, weights, colorLimit, saturation, revision + 1);
      revision++;
      current = next;
      return copySnapshot(current);
    },
    get() {
      return copySnapshot(current);
    },
    clear() {
      current = null;
    }
  };
}
