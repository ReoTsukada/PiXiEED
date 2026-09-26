/**
 * PiXiEELENS image engine, lifted verbatim from PiXiEELENS (pixiee-lens/index.html) so the camera keeps
 * PiXiEELENS's exact look: pre-processing (saturation, contrast, shadow lift), palette building
 * (fixed Game Boy 4 colours, black/white, gray tint, 8-bit, or colours taken from the photo), 4x4 ordered
 * dither, surface simplification and small-region cleanup, plus the camera tone filter (brightness,
 * exposure, contrast, saturation, shadows, white balance) applied while the frame is drawn.
 *
 * Only the UI glue was replaced: `state` and the palette display are module state here, and the palette
 * is reported through `onPalette` instead of being drawn into the PiXiEELENS HUD.
 */

const state = { colorDepth: '4', paletteMode: 'gameboy', gradientMode: 'dither', surfaceSimplify: 55, cameraSettings: null };
const paletteState = { depth: null, desired: 0, colors: [], originalColors: [], cache: new Map(), lastUpdated: 0, userEdited: false };
let paletteDisplayEnabled = false;
let paletteListener = null;
function updatePaletteDisplay() { if (paletteListener) paletteListener(paletteState.colors.map((c) => [c.r, c.g, c.b])); }
function resetPaletteDisplay() { if (paletteListener) paletteListener([]); }

const BLACK_COLOR = { r: 0, g: 0, b: 0 };

const WHITE_COLOR = { r: 255, g: 255, b: 255 };

const GRAY_TINT_DEFAULT_COLOR = { r: 192, g: 192, b: 192 };

const GRAY_TINT_MIN_SATURATION = 0.22;

const GRAY_TINT_MIN_LIGHTNESS = 0.04;

const GRAY_TINT_MAX_LIGHTNESS = 0.9;

const GRAY_TINT_EDIT_LIGHTNESS = 0.65;

const FIXED_FOUR_COLOR_PALETTE = [
  { r: 224, g: 248, b: 208 }, // lightest green
  { r: 168, g: 192, b: 112 }, // light green
  { r: 88, g: 120, b: 48 },   // dark green
  { r: 32, g: 56, b: 16 }     // darkest green
];

const FIXED_TWO_COLOR_PALETTE = [
  { r: 0, g: 0, b: 0 },
  { r: 255, g: 255, b: 255 }
];

const FOUR_COLOR_DARK_THRESHOLD = 96;

const COLOR_BIN_SIZE = 16;

const COLOR_BIN_INTERVAL = 256 / COLOR_BIN_SIZE;

const PRE_AVERAGE_RADIUS = 0;

const SATURATION_BOOST = 1.02;

const CONTRAST_STRENGTH = 1.04;

const SHADOW_LIFT_THRESHOLD = 60;

const SHADOW_LIFT_AMOUNT = 4;

const PALETTE_HOLD_MS = 5000;

const PALETTE_AUTO_UPDATE_ENABLED = false;

const DOT_SMOOTHING_BLUR = 0.45;

const DITHER_MATRIX_4X4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5
];

const FIXED_8BIT_LEVELS = Object.freeze({ r: 8, g: 8, b: 4 });

const CAMERA_SETTING_CONFIG = Object.freeze({
  brightness: { min: -100, max: 100, step: 1, default: 0 },
  exposure: { min: -100, max: 100, step: 1, default: 0 },
  saturation: { min: -100, max: 100, step: 1, default: 0 },
  shadows: { min: -100, max: 100, step: 1, default: 0 },
  contrast: { min: -100, max: 100, step: 1, default: 0 },
  whiteBalance: { min: -100, max: 100, step: 1, default: 0 },
  zoom: { min: 0, max: 100, step: 1, default: 0 }
});

const CAMERA_SETTING_KEYS = Object.freeze(Object.keys(CAMERA_SETTING_CONFIG));

const CAMERA_SETTING_DEFAULTS = Object.freeze(
  CAMERA_SETTING_KEYS.reduce((accumulator, key) => {
    const config = CAMERA_SETTING_CONFIG[key] || {};
    const defaultValue = Number(config.default);
    accumulator[key] = Number.isFinite(defaultValue) ? defaultValue : 0;
    return accumulator;
  }, {})
);

const CAMERA_BASE_SATURATION = 1;

function applyNewPaletteColors(colors) {
  const next = Array.isArray(colors) ? colors.map((color) => ({ ...color })) : [];
  paletteState.colors = next;
  paletteState.originalColors = next.map((color) => ({ ...color }));
  paletteState.cache = new Map();
  paletteState.userEdited = false;
}

function getColorBinIndex(value) {
  return Math.max(0, Math.min(COLOR_BIN_SIZE - 1, Math.floor(value / COLOR_BIN_INTERVAL)));
}

function binIndexToColorValue(index) {
  const step = 255 / (COLOR_BIN_SIZE - 1);
  return Math.max(0, Math.min(255, Math.round(index * step)));
}

function clearPaletteState() {
  paletteState.colors = [];
  paletteState.originalColors = [];
  paletteState.cache = new Map();
  paletteState.depth = null;
  paletteState.desired = 0;
  paletteState.lastUpdated = 0;
  paletteState.userEdited = false;
  resetPaletteDisplay();
}

function getCameraSettingConfig(key) {
  return CAMERA_SETTING_CONFIG[key] || null;
}

function getCameraSettingRange(key) {
  const config = getCameraSettingConfig(key);
  const min = config && Number.isFinite(config.min) ? Number(config.min) : -100;
  const max = config && Number.isFinite(config.max) ? Number(config.max) : 100;
  if (max < min) {
    return { min: max, max: min };
  }
  return { min, max };
}

function clampCameraSettingValue(value, key) {
  const config = getCameraSettingConfig(key);
  const { min, max } = getCameraSettingRange(key);
  const step = config && Number.isFinite(config.step) && config.step > 0 ? Number(config.step) : null;
  let numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    const fallback = config && Number.isFinite(config.default) ? Number(config.default) : 0;
    numeric = fallback;
  }
  if (numeric < min) {
    numeric = min;
  } else if (numeric > max) {
    numeric = max;
  }
  if (step) {
    numeric = min + Math.round((numeric - min) / step) * step;
    if (numeric < min) {
      numeric = min;
    } else if (numeric > max) {
      numeric = max;
    }
  }
  return Number(Number.isFinite(numeric) ? numeric : min);
}

function clampFilterFactor(value, min = 0.2, max = 3) {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(max, Math.max(min, value));
}

function computeCameraFilterComponents(settings = state.cameraSettings) {
  if (!settings) {
    return [
      'brightness(1.000)',
      'contrast(1.000)',
      `saturate(${CAMERA_BASE_SATURATION.toFixed(3)})`
    ];
  }
  const brightnessValue = clampCameraSettingValue(settings.brightness ?? 0, 'brightness') / 100;
  const exposureValue = clampCameraSettingValue(settings.exposure ?? 0, 'exposure') / 100;
  const saturationValue = clampCameraSettingValue(settings.saturation ?? 0, 'saturation') / 100;
  const shadowValue = clampCameraSettingValue(settings.shadows ?? 0, 'shadows') / 100;
  const contrastValue = clampCameraSettingValue(settings.contrast ?? 0, 'contrast') / 100;
  const whiteBalanceValue = clampCameraSettingValue(settings.whiteBalance ?? 0, 'whiteBalance') / 100;

  const brightnessFactor = clampFilterFactor(1 + brightnessValue * 0.6, 0.2, 3);
  const exposureFactor = clampFilterFactor(1 + exposureValue * 0.9, 0.2, 3);
  const saturationFactor = clampFilterFactor(1 + saturationValue, 0.1, 3);
  const shadowContrastFactor = clampFilterFactor(1 + shadowValue * 0.6, 0.2, 3);
  const userContrastFactor = clampFilterFactor(1 + contrastValue, 0.2, 4);
  const combinedContrast = clampFilterFactor(userContrastFactor * shadowContrastFactor, 0.2, 4);

  const combinedBrightness = clampFilterFactor(brightnessFactor * exposureFactor, 0.2, 3);
  const combinedSaturation = clampFilterFactor(CAMERA_BASE_SATURATION * saturationFactor, 0.05, 4);

  const components = [
    `brightness(${combinedBrightness.toFixed(3)})`,
    `contrast(${combinedContrast.toFixed(3)})`,
    `saturate(${combinedSaturation.toFixed(3)})`
  ];

  if (state.colorDepth === 'gray') {
    components.push('grayscale(1)');
  }

  const whiteBalanceFilters = computeWhiteBalanceFilters(whiteBalanceValue);
  if (whiteBalanceFilters.length) {
    components.push(...whiteBalanceFilters);
  }

  return components;
}

function computeWhiteBalanceFilters(value) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.001) {
    return [];
  }
  const filters = [];
  const clamped = Math.max(-1, Math.min(1, value));
  const warm = clamped > 0;
  const intensity = Math.abs(clamped);
  const hueRotate = warm ? intensity * 12 : -intensity * 12;
  filters.push(`hue-rotate(${hueRotate.toFixed(3)}deg)`);
  const saturateFactor = clampFilterFactor(1 + intensity * 0.25 * (warm ? 1 : -0.5), 0.4, 2.5);
  filters.push(`saturate(${saturateFactor.toFixed(3)})`);
  if (warm) {
    const sepia = Math.min(0.35, intensity * 0.45);
    if (sepia > 0.001) {
      filters.push(`sepia(${sepia.toFixed(3)})`);
    }
    const brighten = clampFilterFactor(1 + intensity * 0.08, 0.5, 1.5);
    filters.push(`brightness(${brighten.toFixed(3)})`);
  } else {
    const coolBrightness = clampFilterFactor(1 + intensity * -0.08, 0.5, 1.5);
    filters.push(`brightness(${coolBrightness.toFixed(3)})`);
  }
  return filters;
}

function ensurePaletteColor(palette, target) {
  if (palette.some((entry) => entry.r === target.r && entry.g === target.g && entry.b === target.b)) {
    return;
  }
  const color = { ...target };
  if (typeof color.count !== 'number') {
    color.count = Number.MAX_SAFE_INTEGER;
  }
  palette.push(color);
}

function applyPreAverage(imageData) {
  if (PRE_AVERAGE_RADIUS <= 0) {
    return;
  }
  const width = imageData.width || 0;
  const height = imageData.height || 0;
  if (!width || !height) {
    return;
  }
  const radius = Math.floor(PRE_AVERAGE_RADIUS);
  const source = new Uint8ClampedArray(imageData.data);
  const data = imageData.data;
  for (let y = 0; y < height; y += 1) {
    const yMin = Math.max(0, y - radius);
    const yMax = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const xMin = Math.max(0, x - radius);
      const xMax = Math.min(width - 1, x + radius);
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let count = 0;
      for (let yy = yMin; yy <= yMax; yy += 1) {
        const base = yy * width;
        for (let xx = xMin; xx <= xMax; xx += 1) {
          const idx = (base + xx) * 4;
          rSum += source[idx];
          gSum += source[idx + 1];
          bSum += source[idx + 2];
          count += 1;
        }
      }
      const target = (y * width + x) * 4;
      data[target] = Math.round(rSum / count);
      data[target + 1] = Math.round(gSum / count);
      data[target + 2] = Math.round(bSum / count);
    }
  }
}

function boostSaturation(imageData) {
  if (SATURATION_BOOST <= 1) {
    return;
  }
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    data[i] = Math.max(0, Math.min(255, Math.round(luminance + (r - luminance) * SATURATION_BOOST)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(luminance + (g - luminance) * SATURATION_BOOST)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(luminance + (b - luminance) * SATURATION_BOOST)));
  }
}

function adjustChannelContrast(value) {
  if (CONTRAST_STRENGTH <= 1) {
    return value;
  }
  const normalized = value / 255;
  const contrasted = ((normalized - 0.5) * CONTRAST_STRENGTH) + 0.5;
  return Math.max(0, Math.min(255, Math.round(contrasted * 255)));
}

function applyContrastToImageData(imageData) {
  if (CONTRAST_STRENGTH <= 1) {
    return;
  }
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = adjustChannelContrast(data[i]);
    data[i + 1] = adjustChannelContrast(data[i + 1]);
    data[i + 2] = adjustChannelContrast(data[i + 2]);
  }
}

function liftShadows(imageData) {
  if (SHADOW_LIFT_AMOUNT <= 0) {
    return;
  }
  const threshold = Math.max(1, SHADOW_LIFT_THRESHOLD);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luminance >= threshold) {
      continue;
    }
    const lift = SHADOW_LIFT_AMOUNT * (1 - luminance / threshold);
    data[i] = Math.max(0, Math.min(255, Math.round(r + lift)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g + lift)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b + lift)));
  }
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const chroma = max - min;
  let hue = 0;
  if (chroma !== 0) {
    if (max === rn) {
      hue = ((gn - bn) / chroma + (gn < bn ? 6 : 0)) / 6;
    } else if (max === gn) {
      hue = ((bn - rn) / chroma + 2) / 6;
    } else {
      hue = ((rn - gn) / chroma + 4) / 6;
    }
  }
  const lightness = (max + min) / 2;
  const saturation = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1));
  return [hue, saturation, lightness];
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function quantizeChannelToLevels(value, levels) {
  const safeLevels = Math.max(1, Number(levels) || 1);
  if (safeLevels <= 1) {
    return 0;
  }
  const maxIndex = safeLevels - 1;
  const normalized = Math.max(0, Math.min(255, value)) / 255;
  const index = Math.round(normalized * maxIndex);
  return clampByte((index / maxIndex) * 255);
}

function hslToRgb(h, s, l) {
  let hue = h;
  if (!Number.isFinite(hue)) {
    hue = 0;
  }
  hue = ((hue % 1) + 1) % 1;
  const saturation = Math.max(0, Math.min(1, s));
  const lightness = Math.max(0, Math.min(1, l));
  if (saturation === 0) {
    const value = clampByte(lightness * 255);
    return { r: value, g: value, b: value };
  }
  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const hueToRgb = (t) => {
    let temp = t;
    if (temp < 0) {
      temp += 1;
    }
    if (temp > 1) {
      temp -= 1;
    }
    if (temp < 1 / 6) {
      return p + (q - p) * 6 * temp;
    }
    if (temp < 1 / 2) {
      return q;
    }
    if (temp < 2 / 3) {
      return p + (q - p) * (2 / 3 - temp) * 6;
    }
    return p;
  };
  const r = hueToRgb(hue + 1 / 3);
  const g = hueToRgb(hue);
  const b = hueToRgb(hue - 1 / 3);
  return {
    r: clampByte(r * 255),
    g: clampByte(g * 255),
    b: clampByte(b * 255)
  };
}

function refinePaletteForDepth(palette, depth, desired) {
  if (!Array.isArray(palette) || !palette.length) {
    return [];
  }
  const numericDepth = Number(depth);
  const maxColors = Math.max(2, Math.min(256, Number.isFinite(numericDepth) ? numericDepth : Number(desired) || 4));
  const distanceThreshold = maxColors <= 4 ? 72 : maxColors <= 16 ? 56 : 42;
  const thresholdSq = distanceThreshold * distanceThreshold;
  const sorted = palette
    .map((entry) => ({
      r: clampByte(entry?.r),
      g: clampByte(entry?.g),
      b: clampByte(entry?.b),
      count: Number(entry?.count) || 0
    }))
    .sort((a, b) => b.count - a.count);
  const selected = [];
  const distanceSq = (a, b) => {
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return dr * dr + dg * dg + db * db;
  };
  for (const color of sorted) {
    const isNear = selected.some((picked) => distanceSq(color, picked) <= thresholdSq);
    if (!isNear) {
      selected.push({ r: color.r, g: color.g, b: color.b, count: color.count });
    }
    if (selected.length >= maxColors) {
      break;
    }
  }
  if (!selected.length) {
    selected.push({ ...BLACK_COLOR, count: 0 });
  }
  ensurePaletteColor(selected, BLACK_COLOR);
  ensurePaletteColor(selected, WHITE_COLOR);
  if (selected.length < maxColors) {
    for (const color of sorted) {
      if (selected.length >= maxColors) {
        break;
      }
      ensurePaletteColor(selected, color);
    }
  }
  while (selected.length > maxColors) {
    selected.pop();
  }
  return selected.map(({ r, g, b }) => ({ r, g, b }));
}

function buildPaletteFromImage(imageData, desired, depth) {
  const bins = new Map();
  const data = imageData.data;
  const totalPixels = data.length / 4;
  const minCount = Math.max(1, Math.floor(totalPixels * 0.005));
  for (let i = 0; i < data.length; i += 4) {
    const rIndex = getColorBinIndex(data[i]);
    const gIndex = getColorBinIndex(data[i + 1]);
    const bIndex = getColorBinIndex(data[i + 2]);
    const key = (rIndex << 8) | (gIndex << 4) | bIndex;
    const existing = bins.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      bins.set(key, {
        rIndex,
        gIndex,
        bIndex,
        count: 1
      });
    }
  }
  const sortedBins = Array.from(bins.values()).sort((a, b) => b.count - a.count);
  const palette = [];
  for (const bin of sortedBins) {
    const color = {
      r: binIndexToColorValue(bin.rIndex),
      g: binIndexToColorValue(bin.gIndex),
      b: binIndexToColorValue(bin.bIndex),
      count: bin.count
    };
    if (bin.count < minCount && palette.length >= 2) {
      continue;
    }
    palette.push(color);
    if (palette.length >= desired) {
      break;
    }
  }

  ensurePaletteColor(palette, BLACK_COLOR);
  ensurePaletteColor(palette, WHITE_COLOR);

  palette.sort((a, b) => b.count - a.count);
  while (palette.length > desired) {
    palette.pop();
  }

  const trimmed = palette.map(({ r, g, b }) => ({ r, g, b }));
  const refined = refinePaletteForDepth(trimmed, depth, desired);
  return refined.map(({ r, g, b }) => ({ r, g, b }));
}

function buildSourcePalette(imageData, desired) {
  // Image-derived palettes need roles, rather than simply averaging the
  // most common RGB values.  The optional black/white anchors preserve
  // real deep shadows and highlights; the remaining slots become the
  // representative material colours (sky, skin, hair, clothes, etc.).
  const bins = new Map();
  const { data } = imageData;
  for (let index = 0; index < data.length; index += 4) {
    const rIndex = getColorBinIndex(data[index]);
    const gIndex = getColorBinIndex(data[index + 1]);
    const bIndex = getColorBinIndex(data[index + 2]);
    const key = (rIndex << 8) | (gIndex << 4) | bIndex;
    const bin = bins.get(key) || {
      r: binIndexToColorValue(rIndex),
      g: binIndexToColorValue(gIndex),
      b: binIndexToColorValue(bIndex),
      count: 0
    };
    bin.count += 1;
    bins.set(key, bin);
  }
  const colors = Array.from(bins.values()).sort((a, b) => b.count - a.count);
  const size = Math.min(Math.max(2, Number(desired) || 4), colors.length);
  if (!size) return [];

  const totalPixels = Math.max(1, data.length / 4);
  const luma = (color) => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  const distance = (a, b) => 0.25 * (a.r - b.r) ** 2 + 0.60 * (a.g - b.g) ** 2 + 0.15 * (a.b - b.b) ** 2;
  const roleCoverage = (predicate) => colors.reduce((sum, color) => sum + (predicate(luma(color)) ? color.count : 0), 0) / totalPixels;
  const centers = [];
  const locked = [];

  // Do not manufacture black or white for a tiny speck of noise.  When
  // either is visibly present, keep it exact so the image retains a crisp
  // value range instead of turning into uniformly muted averages.
  if (roleCoverage((value) => value <= 40) >= 0.012 && centers.length < size) {
    centers.push({ ...BLACK_COLOR });
    locked.push(true);
  }
  if (roleCoverage((value) => value >= 216) >= 0.012 && centers.length < size) {
    centers.push({ ...WHITE_COLOR });
    locked.push(true);
  }

  // Seed remaining entries from frequent, well-separated source colours.
  // This gives a blue background and a skin tone separate slots instead
  // of spending every entry on almost-identical shades of the background.
  while (centers.length < size) {
    let next = null;
    let bestScore = -1;
    for (const color of colors) {
      const separation = centers.length
        ? Math.sqrt(Math.min(...centers.map((center) => distance(color, center))))
        : 96;
      const score = Math.sqrt(color.count) * (0.35 + separation / 96);
      if (score > bestScore) {
        bestScore = score;
        next = color;
      }
    }
    if (!next) break;
    centers.push({ r: next.r, g: next.g, b: next.b });
    locked.push(false);
  }

  const assignments = new Array(colors.length).fill(0);
  for (let pass = 0; pass < 4; pass += 1) {
    const sums = centers.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    colors.forEach((color, colorIndex) => {
      let target = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      centers.forEach((center, centerIndex) => {
        const value = distance(color, center);
        if (value < bestDistance) {
          bestDistance = value;
          target = centerIndex;
        }
      });
      assignments[colorIndex] = target;
      if (!locked[target]) {
        sums[target].r += color.r * color.count;
        sums[target].g += color.g * color.count;
        sums[target].b += color.b * color.count;
        sums[target].count += color.count;
      }
    });
    sums.forEach((sum, index) => {
      if (!locked[index] && sum.count) {
        centers[index] = {
          r: clampByte(sum.r / sum.count),
          g: clampByte(sum.g / sum.count),
          b: clampByte(sum.b / sum.count)
        };
      }
    });
  }

  // Snap each material centre back to a well-used real source bin.  It
  // avoids synthetic in-between hues while retaining the shade grouping
  // obtained from the clustering pass above.
  centers.forEach((center, centerIndex) => {
    if (locked[centerIndex]) return;
    let representative = null;
    let bestScore = Number.POSITIVE_INFINITY;
    colors.forEach((color, colorIndex) => {
      if (assignments[colorIndex] !== centerIndex) return;
      const score = distance(color, center) - Math.min(2400, Math.log2(color.count + 1) * 260);
      if (score < bestScore) {
        bestScore = score;
        representative = color;
      }
    });
    if (representative) {
      centers[centerIndex] = { r: representative.r, g: representative.g, b: representative.b };
    }
  });

  // A palette slot should not be spent on a barely different shade that
  // is already represented by a more frequently used colour.  Keep the
  // best-supported entry of each close group, then only refill from a
  // genuinely separated source colour.  This is especially important at
  // 2BIT/3BIT where two similar blues can otherwise consume half of the
  // available palette.
  const minimumSeparation = size <= 4 ? 46 : size <= 8 ? 34 : 24;
  const centerUsage = centers.map((_, centerIndex) => colors.reduce(
    (sum, color, colorIndex) => sum + (assignments[colorIndex] === centerIndex ? color.count : 0),
    0
  ));
  const selected = [];
  const orderedCenters = centers.map((center, index) => ({ center, index }))
    .sort((first, second) => {
      if (locked[first.index] !== locked[second.index]) return locked[first.index] ? -1 : 1;
      return centerUsage[second.index] - centerUsage[first.index];
    });
  orderedCenters.forEach(({ center, index }) => {
    const isTooClose = selected.some((picked) => Math.sqrt(distance(center, picked)) < minimumSeparation);
    if (!isTooClose || locked[index]) {
      selected.push(center);
    }
  });
  while (selected.length < size) {
    let candidate = null;
    let candidateScore = -1;
    colors.forEach((color) => {
      const separation = selected.length
        ? Math.sqrt(Math.min(...selected.map((picked) => distance(color, picked))))
        : minimumSeparation;
      if (separation < minimumSeparation) return;
      const score = Math.sqrt(color.count) * (0.5 + separation / minimumSeparation);
      if (score > candidateScore) {
        candidateScore = score;
        candidate = color;
      }
    });
    if (!candidate) break;
    selected.push({ r: candidate.r, g: candidate.g, b: candidate.b });
  }
  return selected;
}

function createEdgeMap(imageData) {
  const { width, height, data } = imageData;
  const edges = new Float32Array(width * height);
  const luma = (index) => 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const index = (y * width + x) * 4;
    edges[y * width + x] = Math.min(1, (Math.abs(luma(index + 4) - luma(index - 4)) + Math.abs(luma(index + width * 4) - luma(index - width * 4))) / 180);
  }
  return edges;
}

function shouldRebuildPalette(depth, desired) {
  if (depth !== paletteState.depth || desired !== paletteState.desired) {
    return true;
  }
  if (!paletteState.colors || !paletteState.colors.length) {
    return true;
  }
  if (paletteState.userEdited) {
    return false;
  }
  if (!PALETTE_AUTO_UPDATE_ENABLED) {
    return false;
  }
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return now - paletteState.lastUpdated >= PALETTE_HOLD_MS;
}

function applyFixed8Bit(imageData) {
  if (!imageData || !imageData.data) {
    return;
  }
  const data = imageData.data;
  const width = imageData.width || 0;
  const useDither = state.gradientMode === 'dither' && width > 0;
  const ditherStrength = useDither ? 32 : 0;
  const ditherScale = useDither ? ditherStrength / 16 : 0;
  const rLevels = FIXED_8BIT_LEVELS.r;
  const gLevels = FIXED_8BIT_LEVELS.g;
  const bLevels = FIXED_8BIT_LEVELS.b;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    if (useDither) {
      const pixelIndex = i >> 2;
      const x = pixelIndex % width;
      const y = (pixelIndex / width) | 0;
      const threshold = DITHER_MATRIX_4X4[((y & 3) << 2) | (x & 3)];
      const offset = (threshold - 7.5) * ditherScale;
      r = clampByte(r + offset);
      g = clampByte(g + offset);
      b = clampByte(b + offset);
    }
    data[i] = quantizeChannelToLevels(r, rLevels);
    data[i + 1] = quantizeChannelToLevels(g, gLevels);
    data[i + 2] = quantizeChannelToLevels(b, bLevels);
  }
}

function applySurfaceSimplify(imageData, edgeMap, palette) {
  const strength = Math.max(0, Math.min(100, Number(state.surfaceSimplify) || 0));
  const passes = strength < 20 ? 0 : strength < 60 ? 1 : strength < 85 ? 2 : 3;
  const { width, height, data } = imageData;
  if (!passes || width < 3 || height < 3) return;
  const requiredWeight = strength < 34 ? 6 : strength < 67 ? 5 : 4;
  const maxColorDistance = 24 + strength * 0.45;
  const colorDistance = (first, second) => Math.sqrt(0.25 * (first.r - second.r) ** 2 + 0.60 * (first.g - second.g) ** 2 + 0.15 * (first.b - second.b) ** 2);
  for (let pass = 0; pass < passes; pass += 1) {
    const source = new Uint8ClampedArray(data);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = (y * width + x) * 4;
        const pixel = y * width + x;
        if (edgeMap[pixel] > (strength < 75 ? 0.28 : 0.42)) continue;
        const neighbors = [[index - 4, 2], [index + 4, 2], [index - width * 4, 2], [index + width * 4, 2], [index - width * 4 - 4, 1], [index - width * 4 + 4, 1], [index + width * 4 - 4, 1], [index + width * 4 + 4, 1]];
        const groups = new Map();
        neighbors.forEach(([neighbor, weight]) => {
          const key = `${source[neighbor]}/${source[neighbor + 1]}/${source[neighbor + 2]}`;
          groups.set(key, (groups.get(key) || 0) + weight);
        });
        const dominant = [...groups.entries()].sort((first, second) => second[1] - first[1]).find(([, count]) => count >= requiredWeight)?.[0];
        if (!dominant) continue;
        const [r, g, b] = dominant.split('/').map(Number);
        if (source[index] === r && source[index + 1] === g && source[index + 2] === b) continue;
        if (colorDistance({ r: source[index], g: source[index + 1], b: source[index + 2] }, { r, g, b }) > maxColorDistance) continue;
        data[index] = r; data[index + 1] = g; data[index + 2] = b;
      }
    }
  }
}

function removeSmallRegions(imageData, edgeMap) {
  const strength = Math.max(0, Math.min(100, Number(state.surfaceSimplify) || 0));
  const maxSize = strength < 25 ? 0 : strength < 50 ? 1 : strength < 75 ? 2 : strength < 95 ? 3 : 5;
  const { width, height, data } = imageData;
  // Connected-component scans are intentionally reserved for strong
  // cleanup on small canvases. Running a full flood fill per live frame
  // at 256px costs more than the visible benefit at normal strengths.
  if (!maxSize || strength < 75 || width > 160 || height > 160) return;
  const visited = new Uint8Array(width * height);
  const sameColor = (first, second) => data[first] === data[second] && data[first + 1] === data[second + 1] && data[first + 2] === data[second + 2];
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (visited[pixel]) continue;
    const start = pixel * 4;
    const region = [];
    const stack = [pixel];
    const border = new Map();
    let edgeTotal = 0;
    while (stack.length) {
      const current = stack.pop();
      if (visited[current]) continue;
      visited[current] = 1;
      region.push(current);
      edgeTotal += edgeMap[current];
      const x = current % width;
      const y = (current / width) | 0;
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => {
        const xx = x + dx; const yy = y + dy;
        if (xx < 0 || xx >= width || yy < 0 || yy >= height) return;
        const neighbor = yy * width + xx;
        const neighborIndex = neighbor * 4;
        if (sameColor(start, neighborIndex)) {
          if (!visited[neighbor]) stack.push(neighbor);
        } else {
          const key = `${data[neighborIndex]}/${data[neighborIndex + 1]}/${data[neighborIndex + 2]}`;
          border.set(key, (border.get(key) || 0) + 1);
        }
      });
    }
    if (region.length <= maxSize && edgeTotal / region.length < 0.24 && border.size) {
      const [color] = [...border.entries()].sort((first, second) => second[1] - first[1])[0];
      const [r, g, b] = color.split('/').map(Number);
      region.forEach((entry) => { const index = entry * 4; data[index] = r; data[index + 1] = g; data[index + 2] = b; });
    }
  }
}

function applyColorDepth(imageData) {
  const depth = state.colorDepth || '4';
  const edgeMap = createEdgeMap(imageData);
  applyPreAverage(imageData);
  boostSaturation(imageData);
  applyContrastToImageData(imageData);
  liftShadows(imageData);
  if (depth === 'full') {
    clearPaletteState();
    return;
  }
  if (depth === '256') {
    applyFixed8Bit(imageData);
    clearPaletteState();
    return;
  }
  const timestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const useSourcePalette = state.paletteMode === 'source';
  if (depth === '4' && state.paletteMode !== 'source') {
    const needsUpdate = paletteState.depth !== '4'
      || paletteState.colors.length !== FIXED_FOUR_COLOR_PALETTE.length
      || paletteState.originalColors.length !== FIXED_FOUR_COLOR_PALETTE.length;
    if (needsUpdate) {
      applyNewPaletteColors(useSourcePalette ? buildSourcePalette(imageData, 4) : FIXED_FOUR_COLOR_PALETTE);
      paletteState.depth = '4';
      paletteState.desired = FIXED_FOUR_COLOR_PALETTE.length;
      paletteState.lastUpdated = timestamp;
      updatePaletteDisplay(true);
    }
  } else if (depth === '2') {
    const needsUpdate = paletteState.depth !== '2'
      || paletteState.colors.length !== FIXED_TWO_COLOR_PALETTE.length
      || paletteState.originalColors.length !== FIXED_TWO_COLOR_PALETTE.length;
    if (needsUpdate) {
      applyNewPaletteColors(useSourcePalette ? buildSourcePalette(imageData, 2) : FIXED_TWO_COLOR_PALETTE);
      paletteState.depth = '2';
      paletteState.desired = FIXED_TWO_COLOR_PALETTE.length;
      paletteState.lastUpdated = timestamp;
      updatePaletteDisplay(true);
    }
  } else if (depth === 'gray') {
    const needsInit = paletteState.depth !== 'gray'
      || paletteState.colors.length !== 1;
    if (needsInit) {
      applyNewPaletteColors([GRAY_TINT_DEFAULT_COLOR]);
      paletteState.depth = 'gray';
      paletteState.desired = 1;
      paletteState.lastUpdated = timestamp;
      paletteState.userEdited = false;
      if (paletteDisplayEnabled) {
        updatePaletteDisplay(true);
      }
    } else {
      paletteState.depth = 'gray';
      paletteState.desired = 1;
      paletteState.lastUpdated = timestamp;
    }
    const baseColor = paletteState.colors[0] || GRAY_TINT_DEFAULT_COLOR;
    const [baseHue, baseSaturation, baseLightness] = rgbToHsl(
      baseColor.r,
      baseColor.g,
      baseColor.b
    );
    const tintActive = paletteState.userEdited && baseSaturation > 0.001;
    const dataArr = imageData.data;
    if (!tintActive) {
      for (let i = 0; i < dataArr.length; i += 4) {
        const value = Math.round(
          0.2126 * dataArr[i] +
          0.7152 * dataArr[i + 1] +
          0.0722 * dataArr[i + 2]
        );
        const clamped = Math.max(0, Math.min(255, value));
        dataArr[i] = clamped;
        dataArr[i + 1] = clamped;
        dataArr[i + 2] = clamped;
      }
    } else {
      const minLightness = Math.min(
        GRAY_TINT_MAX_LIGHTNESS * 0.25,
        Math.max(GRAY_TINT_MIN_LIGHTNESS, baseLightness * 0.12)
      );
      const maxLightness = Math.min(
        GRAY_TINT_MAX_LIGHTNESS,
        Math.max(baseLightness, GRAY_TINT_EDIT_LIGHTNESS)
      );
      const tintSaturation = Math.max(baseSaturation, GRAY_TINT_MIN_SATURATION);
      for (let i = 0; i < dataArr.length; i += 4) {
        const luminance = Math.max(
          0,
          Math.min(
            255,
            Math.round(
              0.2126 * dataArr[i] +
              0.7152 * dataArr[i + 1] +
              0.0722 * dataArr[i + 2]
            )
          )
        );
        const normalized = luminance / 255;
        const lightness = minLightness + (maxLightness - minLightness) * normalized;
        const saturation = tintSaturation * (0.25 + 0.75 * normalized);
        const tinted = hslToRgb(baseHue, saturation, lightness);
        dataArr[i] = tinted.r;
        dataArr[i + 1] = tinted.g;
        dataArr[i + 2] = tinted.b;
      }
    }
    return;
  } else {
    const desiredColors = Math.max(2, Number(depth) || 4);
    if (shouldRebuildPalette(depth, desiredColors)) {
      const palette = useSourcePalette ? buildSourcePalette(imageData, desiredColors) : buildPaletteFromImage(imageData, desiredColors, depth);
      applyNewPaletteColors(palette);
      paletteState.depth = depth;
      paletteState.desired = desiredColors;
      paletteState.lastUpdated = timestamp;
      updatePaletteDisplay(true);
    }
  }
  const palette = paletteState.colors;
  if (!palette || !palette.length) {
    return;
  }
  const data = imageData.data;
  const cache = paletteState.cache;
  const width = imageData.width || 0;
  const useDither = state.gradientMode === 'dither' && width > 0;
  const ditherStrength = useDither ? (depth === '2' ? 48 : 32) : 0;
  const ditherScale = useDither ? ditherStrength / 16 : 0;

  const findNearestColor = (r, g, b, key) => {
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (!useSourcePalette) {
      if (depth !== '4' && luminance < 48) {
        cache.set(key, BLACK_COLOR);
        return BLACK_COLOR;
      }
      if (depth !== '4' && luminance > 224) {
        cache.set(key, WHITE_COLOR);
        return WHITE_COLOR;
      }
      if (depth === '4' && luminance < FOUR_COLOR_DARK_THRESHOLD) {
        const darkest = palette[palette.length - 1] || { r: 0, g: 0, b: 0 };
        cache.set(key, darkest);
        return darkest;
      }
    }
    let cached = cache.get(key);
    if (cached) {
      return cached;
    }
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < palette.length; i += 1) {
      const color = palette[i];
      const dr = r - color.r;
      const dg = g - color.g;
      const db = b - color.b;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIndex = i;
      }
    }
    cached = palette[bestIndex];
    cache.set(key, cached);
    return cached;
  };

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    const pixelIndex = i >> 2;
    if (useDither) {
      const x = pixelIndex % width;
      const y = (pixelIndex / width) | 0;
      const threshold = DITHER_MATRIX_4X4[((y & 3) << 2) | (x & 3)];
      const offset = (threshold - 7.5) * ditherScale;
      r = clampByte(r + offset);
      g = clampByte(g + offset);
      b = clampByte(b + offset);
    }
    const rIndex = getColorBinIndex(r);
    const gIndex = getColorBinIndex(g);
    const bIndex = getColorBinIndex(b);
    const key = (rIndex << 8) | (gIndex << 4) | bIndex;
    const nearest = findNearestColor(r, g, b, key);
    data[i] = nearest.r;
    data[i + 1] = nearest.g;
    data[i + 2] = nearest.b;
  }
  applySurfaceSimplify(imageData, edgeMap, palette);
  removeSmallRegions(imageData, edgeMap);
}

state.cameraSettings = { ...CAMERA_SETTING_DEFAULTS };

export { CAMERA_SETTING_CONFIG, CAMERA_SETTING_DEFAULTS, DOT_SMOOTHING_BLUR, FIXED_FOUR_COLOR_PALETTE };

/** Update PiXiEELENS settings: colorDepth ('2'|'4'|'8'|'16'|'gray'|'256'|'full'), paletteMode ('gameboy'|'source'),
 * gradientMode ('dither'|'none'), surfaceSimplify (0..100), cameraSettings ({ brightness, exposure, ... } -100..100). */
export function setLensSettings(next = {}) {
  const depthChanged = next.colorDepth !== undefined && next.colorDepth !== state.colorDepth;
  const modeChanged = next.paletteMode !== undefined && next.paletteMode !== state.paletteMode;
  if (next.colorDepth !== undefined) state.colorDepth = String(next.colorDepth);
  if (next.paletteMode !== undefined) state.paletteMode = next.paletteMode === 'source' ? 'source' : 'gameboy';
  if (next.gradientMode !== undefined) state.gradientMode = next.gradientMode === 'none' ? 'none' : 'dither';
  if (next.surfaceSimplify !== undefined) state.surfaceSimplify = Math.max(0, Math.min(100, Number(next.surfaceSimplify) || 0));
  if (next.cameraSettings) state.cameraSettings = { ...state.cameraSettings, ...next.cameraSettings };
  if (depthChanged || modeChanged) clearPaletteState();
}

export function getLensSettings() { return { ...state, cameraSettings: { ...state.cameraSettings } }; }

/** Pick the palette again from the next frame (PiXiEELENS keeps a palette until the depth changes). */
export function resetLensPalette() { clearPaletteState(); }

export function onLensPalette(listener) { paletteListener = listener; paletteDisplayEnabled = Boolean(listener); }

export function lensPalette() { return paletteState.colors.map((c) => [c.r, c.g, c.b]); }

/** CSS filter string PiXiEELENS draws the camera frame with (tone settings + the dot smoothing blur). */
export function lensFrameFilter() {
  return `blur(${DOT_SMOOTHING_BLUR}px) ${computeCameraFilterComponents(state.cameraSettings).join(' ')}`;
}

/** Run the PiXiEELENS colour pipeline on an ImageData already sampled at dot resolution (in place). */
export function processLensFrame(imageData) { applyColorDepth(imageData); return imageData; }
