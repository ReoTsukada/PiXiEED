/**
 * PiXiEELENS image engine, adapted from PiXiEELENS (pixiee-lens/index.html):
 * pre-processing (saturation, contrast, shadow lift), palette building
 * (fixed Game Boy 4 colours, black/white, gray tint, 8-bit, or colours taken from the photo), 4x4 ordered
 * dither, surface simplification and small-region cleanup, plus the camera tone filter (brightness,
 * exposure, contrast, saturation, shadows, white balance) applied while the frame is drawn.
 *
 * applySurfaceSimplify / removeSmallRegions are rewritten allocation-free (identical output, several times faster).
 * Only the UI glue was replaced: `state` and the palette display are module state here, and the palette
 * is reported through `onPalette` instead of being drawn into the PiXiEELENS HUD.
 */

import { DITHER_PATTERNS } from './dither-patterns.mjs?v=20260927-first-1';

const state = { colorDepth: '4', paletteMode: 'gameboy', gradientMode: 'dither', ditherPattern: 'net8', surfaceSimplify: 55, cameraSettings: null };
const paletteState = { depth: null, desired: 0, colors: [], originalColors: [], cache: new Map(), lastUpdated: 0, userEdited: false, provisionalSource: false };
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

const DOT_SMOOTHING_BLUR = 0.45;

const FIXED_8BIT_LEVELS = Object.freeze({ r: 8, g: 8, b: 4 });

// ---- Dither -----------------------------------------------------------------------------------------
// Hand-made patterns (dither-patterns.mjs). Each pixel is written as a mix of the two palette colours that
// best explain it; the share of the lighter one picks the pattern step. Strong edges are not dithered, so
// outlines stay crisp, and motif patterns decide their step per 8×8 cell so every heart or star is whole.
// (cell sizes up to 16×16)
const EDGE_SOLID = 0.45;          // edge strength above which a pixel takes the nearer colour outright
const MIX_PENALTY = 0.3;          // discourages mixing two far-apart colours when a closer one will do
function currentDitherPattern() { return DITHER_PATTERNS.find((p) => p.id === state.ditherPattern) ?? DITHER_PATTERNS[0]; }
const scratch = { size: 0, pair: null, tone: null, solid: null };
function ensureScratch(n) {
  if (scratch.size >= n) return scratch;
  scratch.size = n; scratch.pair = new Uint16Array(n); scratch.tone = new Uint8Array(n); scratch.solid = new Uint8Array(n);
  return scratch;
}
function removeStrayEdgePixels(data, width, height, solid) {
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const p = y * width + x; if (!solid[p]) continue;
    const i = p * 4; const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    const n = [i - 4, i + 4, i - width * 4, i + width * 4];
    let alone = true;
    for (const j of n) if (((data[j] << 16) | (data[j + 1] << 8) | data[j + 2]) === key) { alone = false; break; }
    if (!alone) continue;
    let best = n[0]; let bestCount = 0;
    for (const j of n) { const kj = (data[j] << 16) | (data[j + 1] << 8) | data[j + 2]; let c = 0; for (const m of n) if (((data[m] << 16) | (data[m + 1] << 8) | data[m + 2]) === kj) c++; if (c > bestCount) { bestCount = c; best = j; } }
    if (bestCount >= 2) { data[i] = data[best]; data[i + 1] = data[best + 1]; data[i + 2] = data[best + 2]; }
  }
}
/**
 * Error diffusion (Atkinson / Floyd–Steinberg), serpentine so the error does not drift one way.
 * `pick(r, g, b)` returns the output [r, g, b]. Strong edges take their colour without passing error on,
 * so dither never bleeds across an outline.
 */
let diffusionBuffer = null;
function diffuse(data, width, height, kernel, edgeMap, pick) {
  const n = width * height;
  if (!diffusionBuffer || diffusionBuffer.length < n * 3) diffusionBuffer = new Float32Array(n * 3);
  const buf = diffusionBuffer;
  for (let p = 0; p < n; p++) { buf[p * 3] = data[p * 4]; buf[p * 3 + 1] = data[p * 4 + 1]; buf[p * 3 + 2] = data[p * 4 + 2]; }
  for (let y = 0; y < height; y++) {
    const dir = y & 1 ? -1 : 1;
    for (let step = 0; step < width; step++) {
      const x = dir === 1 ? step : width - 1 - step; const p = y * width + x; const b = p * 3;
      const r = clampByte(buf[b]); const g = clampByte(buf[b + 1]); const bl = clampByte(buf[b + 2]);
      const out = pick(r, g, bl);
      data[p * 4] = out[0]; data[p * 4 + 1] = out[1]; data[p * 4 + 2] = out[2];
      if (edgeMap && edgeMap[p] > EDGE_SOLID) continue;
      const er = buf[b] - out[0]; const eg = buf[b + 1] - out[1]; const eb = buf[b + 2] - out[2];
      for (const [dx, dy, w] of kernel) {
        const xx = x + dx * dir; const yy = y + dy;
        if (xx < 0 || xx >= width || yy >= height) continue;
        const q = (yy * width + xx) * 3; buf[q] += er * w; buf[q + 1] += eg * w; buf[q + 2] += eb * w;
      }
    }
  }
}
const cellKeys = new Int32Array(256); const cellCounts = new Int32Array(256); const cellSums = new Int32Array(256);
/** For cell-based patterns: replace each pixel's tone with its cell's average (over pixels mixing the same pair). */
function averageToneByCell(width, height, cell, pair, tone, solid) {
  for (let cy = 0; cy < height; cy += cell) for (let cx = 0; cx < width; cx += cell) {
    let distinct = 0;
    const yEnd = Math.min(height, cy + cell); const xEnd = Math.min(width, cx + cell);
    for (let y = cy; y < yEnd; y++) for (let x = cx; x < xEnd; x++) {
      const p = y * width + x; if (solid[p]) continue;
      let k = 0; while (k < distinct && cellKeys[k] !== pair[p]) k++;
      if (k === distinct) { cellKeys[k] = pair[p]; cellCounts[k] = 0; cellSums[k] = 0; distinct++; }
      cellCounts[k]++; cellSums[k] += tone[p];
    }
    for (let y = cy; y < yEnd; y++) for (let x = cx; x < xEnd; x++) {
      const p = y * width + x; if (solid[p]) continue;
      let k = 0; while (cellKeys[k] !== pair[p]) k++;
      tone[p] = Math.round(cellSums[k] / cellCounts[k]);
    }
  }
}

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
  paletteState.provisionalSource = false;
}

function getColorBinIndex(value) {
  return Math.max(0, Math.min(COLOR_BIN_SIZE - 1, Math.floor(value / COLOR_BIN_INTERVAL)));
}

function clearPaletteState() {
  paletteState.colors = [];
  paletteState.originalColors = [];
  paletteState.cache = new Map();
  paletteState.depth = null;
  paletteState.desired = 0;
  paletteState.lastUpdated = 0;
  paletteState.userEdited = false;
  paletteState.provisionalSource = false;
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

function buildSourcePalette(imageData, desired) {
  // Spend each slot on an occupied, distinct source colour. A dominant sky
  // must not consume the whole palette with slightly different blue bins.
  const bins = new Map();
  const { data } = imageData;
  for (let index = 0; index < data.length; index += 4) {
    const rIndex = getColorBinIndex(data[index]);
    const gIndex = getColorBinIndex(data[index + 1]);
    const bIndex = getColorBinIndex(data[index + 2]);
    const key = (rIndex << 8) | (gIndex << 4) | bIndex;
    const bin = bins.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    bin.r += data[index]; bin.g += data[index + 1]; bin.b += data[index + 2];
    bin.count += 1;
    bins.set(key, bin);
  }
  const colors = Array.from(bins.values(), (bin) => ({
    r: clampByte(bin.r / bin.count), g: clampByte(bin.g / bin.count),
    b: clampByte(bin.b / bin.count), count: bin.count
  })).sort((a, b) => b.count - a.count);
  const size = Math.min(Math.max(2, Number(desired) || 4), colors.length);
  if (!size) return [];

  const totalPixels = Math.max(1, data.length / 4);
  const luma = (color) => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  const distance = (a, b) => 0.25 * (a.r - b.r) ** 2 + 0.60 * (a.g - b.g) ** 2 + 0.15 * (a.b - b.b) ** 2;
  const roleCoverage = (predicate) => colors.reduce((sum, color) => sum + (predicate(luma(color)) ? color.count : 0), 0) / totalPixels;
  const selected = [];

  // Do not manufacture black or white for a tiny speck of noise.  When
  // either is visibly present, keep it exact so the image retains a crisp
  // value range instead of turning into uniformly muted averages.
  if (roleCoverage((value) => value <= 40) >= 0.012 && selected.length < size) {
    selected.push({ ...BLACK_COLOR });
  }
  if (roleCoverage((value) => value >= 216) >= 0.012 && selected.length < size) {
    selected.push({ ...WHITE_COLOR });
  }
  const minimumSeparation = size <= 4 ? 46 : size <= 8 ? 34 : 24;
  const used = new Set();
  while (selected.length < size) {
    let candidate = null;
    let candidateScore = -1;
    for (const color of colors) {
      if (used.has(color)) continue;
      let separation = 96;
      if (selected.length) {
        let nearest = Infinity;
        for (const picked of selected) nearest = Math.min(nearest, distance(color, picked));
        separation = Math.sqrt(nearest);
      }
      if (separation < minimumSeparation) continue;
      // Area matters, but novelty matters more once a material is represented.
      const score = Math.sqrt(color.count) * (separation / 64) ** 2;
      if (score > candidateScore) {
        candidateScore = score;
        candidate = color;
      }
    }
    if (!candidate) break;
    used.add(candidate);
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

function sourcePaletteIsProvisional(colors) {
  if (!colors.length) return false;
  if (colors.every((color) => Math.max(color.r, color.g, color.b) <= 24)) return true;
  if (colors.length === 1) return true;
  const distanceSquared = (a, b) => 0.25 * (a.r - b.r) ** 2 + 0.60 * (a.g - b.g) ** 2 + 0.15 * (a.b - b.b) ** 2;
  for (let i = 0; i < colors.length; i += 1) {
    for (let j = i + 1; j < colors.length; j += 1) {
      if (distanceSquared(colors[i], colors[j]) > 24 * 24) return false;
    }
  }
  return true;
}

function hasPaletteRecoverySignal(imageData) {
  const { data, width = 0, height = 0 } = imageData || {};
  if (!data?.length) return false;
  const requiredPixels = Math.max(8, Math.ceil(width * height * 0.0005));
  const blackPalette = paletteState.colors.length > 0 && paletteState.colors.every((color) => Math.max(color.r, color.g, color.b) <= 24);
  let signalPixels = 0;
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index]; const g = data[index + 1]; const b = data[index + 2];
    if (blackPalette && Math.max(r, g, b) >= 192) return true;
    if (blackPalette && Math.max(r, g, b) < 64) continue;
    let nearestSquared = Infinity;
    for (const color of paletteState.colors) {
      const distanceSquared = 0.25 * (r - color.r) ** 2 + 0.60 * (g - color.g) ** 2 + 0.15 * (b - color.b) ** 2;
      if (distanceSquared < nearestSquared) nearestSquared = distanceSquared;
      if (nearestSquared <= 24 * 24) break;
    }
    if (nearestSquared <= 24 * 24) continue;
    signalPixels++;
    if (signalPixels >= requiredPixels) return true;
  }
  return false;
}

function shouldRebuildPalette(depth, desired, imageData) {
  // Saved/user-edited palettes stay exact, even when their size differs from the selected look.
  if (paletteState.userEdited && paletteState.colors.length) return false;
  if (depth !== paletteState.depth || desired !== paletteState.desired) {
    return true;
  }
  if (!paletteState.colors || !paletteState.colors.length) {
    return true;
  }
  if (!paletteState.provisionalSource) return false;
  return hasPaletteRecoverySignal(imageData);
}

function updateAutomaticPalette(imageData, depth, desired, timestamp) {
  const palette = buildSourcePalette(imageData, desired);
  applyNewPaletteColors(palette);
  paletteState.depth = depth;
  paletteState.desired = desired;
  paletteState.lastUpdated = timestamp;
  paletteState.provisionalSource = sourcePaletteIsProvisional(palette);
  updatePaletteDisplay(true);
}

function applyFixed8Bit(imageData, edgeMap) {
  if (!imageData || !imageData.data) {
    return;
  }
  const { data, width, height } = imageData;
  const useDither = state.gradientMode === 'dither' && width > 0;
  const levels = [FIXED_8BIT_LEVELS.r, FIXED_8BIT_LEVELS.g, FIXED_8BIT_LEVELS.b];
  if (!useDither) {
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) data[i + c] = quantizeChannelToLevels(data[i + c], levels[c]);
    return;
  }
  const pattern = currentDitherPattern();
  if (pattern.kind === 'diffusion') {
    const out = [0, 0, 0];
    diffuse(data, width, height, pattern.kernel, edgeMap, (r, g, b) => {
      out[0] = quantizeChannelToLevels(r, levels[0]); out[1] = quantizeChannelToLevels(g, levels[1]); out[2] = quantizeChannelToLevels(b, levels[2]);
      return out;
    });
    return;
  }
  // per-pixel patterns dither each channel on its own; block and motif patterns share one step per pixel
  // (from the brightness-weighted share) so a heart is the same heart in red, green and blue
  const shared = pattern.cell > 1;
  const n = width * height; const { tone, solid, pair } = ensureScratch(n);
  const lo = new Uint8Array(3); const frac = new Float32Array(3);
  if (shared) {
    for (let p = 0; p < n; p++) {
      const i = p * 4; let f = 0;
      for (let c = 0; c < 3; c++) { const step = 255 / (levels[c] - 1); const v = data[i + c] / step; f += (v - Math.floor(v)) * (c === 0 ? 0.3 : c === 1 ? 0.59 : 0.11); }
      tone[p] = Math.round(f * 255); solid[p] = edgeMap && edgeMap[p] > EDGE_SOLID ? 1 : 0; pair[p] = 0;
    }
    averageToneByCell(width, height, pattern.cell, pair, tone, solid);
  }
  for (let p = 0; p < n; p++) {
    const i = p * 4; const x = p % width; const y = (p / width) | 0; const bitIndex = ((y & pattern.mask) << pattern.shift) | (x & pattern.mask);
    const edge = edgeMap && edgeMap[p] > EDGE_SOLID;
    for (let c = 0; c < 3; c++) { const step = 255 / (levels[c] - 1); const v = data[i + c] / step; lo[c] = Math.floor(v); frac[c] = v - lo[c]; }
    for (let c = 0; c < 3; c++) {
      let up;
      if (edge) up = frac[c] >= 0.5;
      else {
        const t = shared ? tone[p] : Math.round(frac[c] * 255);
        up = pattern.levels[pattern.levelForTone[t]][bitIndex] === 1;
      }
      data[i + c] = clampByte(Math.round((lo[c] + (up ? 1 : 0)) * (255 / (levels[c] - 1))));
    }
  }
}

function applySurfaceSimplify(imageData, edgeMap, palette) {
  // Same rule as PiXiEELENS (majority of the 8 weighted neighbours, ties to the first one seen, then a
  // colour-distance guard), written without per-pixel allocations: integer colour keys and fixed arrays.
  const strength = Math.max(0, Math.min(100, Number(state.surfaceSimplify) || 0));
  const passes = strength < 20 ? 0 : strength < 60 ? 1 : strength < 85 ? 2 : 3;
  const { width, height, data } = imageData;
  if (!passes || width < 3 || height < 3) return;
  const requiredWeight = strength < 34 ? 6 : strength < 67 ? 5 : 4;
  const maxColorDistance = 24 + strength * 0.45;
  const maxSq = maxColorDistance * maxColorDistance;
  const edgeLimit = strength < 75 ? 0.28 : 0.42;
  const row = width * 4;
  const offsets = [-4, 4, -row, row, -row - 4, -row + 4, row - 4, row + 4];
  const weights = [2, 2, 2, 2, 1, 1, 1, 1];
  const keys = new Int32Array(8); const counts = new Int32Array(8);
  const source = new Uint8ClampedArray(data.length);
  for (let pass = 0; pass < passes; pass += 1) {
    source.set(data);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const pixel = y * width + x;
        if (edgeMap[pixel] > edgeLimit) continue;
        const index = pixel * 4;
        let n = 0;
        for (let k = 0; k < 8; k += 1) {
          const o = index + offsets[k]; const key = (source[o] << 16) | (source[o + 1] << 8) | source[o + 2];
          let j = 0; while (j < n && keys[j] !== key) j += 1;
          if (j === n) { keys[n] = key; counts[n] = weights[k]; n += 1; } else counts[j] += weights[k];
        }
        let best = 0; for (let j = 1; j < n; j += 1) if (counts[j] > counts[best]) best = j;
        if (counts[best] < requiredWeight) continue;
        const key = keys[best]; const r = (key >> 16) & 255; const g = (key >> 8) & 255; const b = key & 255;
        const sr = source[index]; const sg = source[index + 1]; const sb = source[index + 2];
        if (sr === r && sg === g && sb === b) continue;
        if (0.25 * (sr - r) ** 2 + 0.60 * (sg - g) ** 2 + 0.15 * (sb - b) ** 2 > maxSq) continue;
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
  const total = width * height; const visited = new Uint8Array(total);
  const stack = new Int32Array(total); const region = new Int32Array(total);
  const bKeys = []; const bCounts = [];
  for (let pixel = 0; pixel < total; pixel += 1) {
    if (visited[pixel]) continue;
    const start = pixel * 4; const sr = data[start]; const sg = data[start + 1]; const sb = data[start + 2];
    let top = 0; let size = 0; let edgeTotal = 0; bKeys.length = 0; bCounts.length = 0;
    stack[top++] = pixel;
    while (top) {
      const current = stack[--top];
      if (visited[current]) continue;
      visited[current] = 1; region[size++] = current; edgeTotal += edgeMap[current];
      const x = current % width; const y = (current / width) | 0;
      for (let d = 0; d < 4; d += 1) {
        const xx = x + (d === 0 ? -1 : d === 1 ? 1 : 0); const yy = y + (d === 2 ? -1 : d === 3 ? 1 : 0);
        if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
        const neighbor = yy * width + xx; const ni = neighbor * 4;
        if (data[ni] === sr && data[ni + 1] === sg && data[ni + 2] === sb) { if (!visited[neighbor]) stack[top++] = neighbor; }
        else { const key = (data[ni] << 16) | (data[ni + 1] << 8) | data[ni + 2]; const j = bKeys.indexOf(key); if (j < 0) { bKeys.push(key); bCounts.push(1); } else bCounts[j] += 1; }
      }
    }
    if (size <= maxSize && edgeTotal / size < 0.24 && bKeys.length) {
      let best = 0; for (let j = 1; j < bKeys.length; j += 1) if (bCounts[j] > bCounts[best]) best = j;
      const key = bKeys[best]; const r = (key >> 16) & 255; const g = (key >> 8) & 255; const b = key & 255;
      for (let i = 0; i < size; i += 1) { const index = region[i] * 4; data[index] = r; data[index + 1] = g; data[index + 2] = b; }
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
    applyFixed8Bit(imageData, edgeMap);
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
      applyNewPaletteColors(FIXED_FOUR_COLOR_PALETTE);
      paletteState.depth = '4';
      paletteState.desired = FIXED_FOUR_COLOR_PALETTE.length;
      paletteState.lastUpdated = timestamp;
      updatePaletteDisplay(true);
    }
  } else if (depth === '2' && !useSourcePalette) {
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
    if (shouldRebuildPalette(depth, desiredColors, imageData)) {
      updateAutomaticPalette(imageData, depth, desiredColors, timestamp);
    }
  }
  const palette = paletteState.colors;
  if (!palette || !palette.length) {
    return;
  }
  const { data, width, height } = imageData;
  const useDither = state.gradientMode === 'dither' && width > 0;
  // Every rendered pixel uses a visible swatch. Black and white are available
  // only when fixed by the chosen look or actually selected from the scene.
  const lum = palette.map((c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
  // per colour (6 bits a channel): which two colours to mix and how much of the lighter one
  const cacheId = `${useDither ? 'mix' : 'near'}`;
  if (!paletteState.mixCache || paletteState.mixCachePalette !== palette || paletteState.mixCacheId !== cacheId) {
    paletteState.mixCache = new Uint16Array(1 << 18);
    paletteState.mixTone = new Uint8Array(1 << 18);
    paletteState.mixCachePalette = palette; paletteState.mixCacheId = cacheId;
  }
  const mixCache = paletteState.mixCache; const mixTone = paletteState.mixTone;
  const encode = (a, b) => ((a << 5) | b) + 1;

  const classify = (r, g, b, key) => {
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let a = -1;
    // Preserve the fixed Game Boy look's darkest tone; photo-derived looks
    // always choose among their own extracted colours.
    if (!useSourcePalette && !useDither && depth === '4' && luminance < FOUR_COLOR_DARK_THRESHOLD) a = palette.length - 1;
    if (a < 0) {
      let best = Infinity;
      for (let k = 0; k < palette.length; k++) { const c = palette[k]; const d = (r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2; if (d < best) { best = d; a = k; } }
      if (useDither) {
        let bestPair = -1; let bestTone = 0; let bestErr = best;
        for (let m = 0; m < palette.length; m++) for (let k = m + 1; k < palette.length; k++) {
          const p0 = palette[m]; const p1 = palette[k];
          const vr = p1.r - p0.r; const vg = p1.g - p0.g; const vb = p1.b - p0.b; const len2 = vr * vr + vg * vg + vb * vb;
          if (!len2) continue;
          const f = Math.max(0, Math.min(1, ((r - p0.r) * vr + (g - p0.g) * vg + (b - p0.b) * vb) / len2));
          const er = r - (p0.r + vr * f); const eg = g - (p0.g + vg * f); const eb = b - (p0.b + vb * f);
          const err = er * er + eg * eg + eb * eb + MIX_PENALTY * f * (1 - f) * len2;
          if (err < bestErr) { bestErr = err; bestPair = (m << 8) | k; bestTone = f; }
        }
        if (bestPair >= 0) {
          let dark = bestPair >> 8; let light = bestPair & 255; let f = bestTone;
          if (lum[dark] > lum[light]) { const t = dark; dark = light; light = t; f = 1 - f; }
          mixCache[key] = encode(dark, light); mixTone[key] = Math.round(f * 255);
          return;
        }
      }
    }
    mixCache[key] = encode(a, a); mixTone[key] = 0;
  };

  if (useDither && currentDitherPattern().kind === 'diffusion') {
    if (!paletteState.nearCache || paletteState.nearCachePalette !== palette) { paletteState.nearCache = new Uint8Array(1 << 18); paletteState.nearCachePalette = palette; }
    const near = paletteState.nearCache; const out = [0, 0, 0];
    diffuse(data, width, height, currentDitherPattern().kernel, edgeMap, (r, g, b) => {
      const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      let index = near[key];
      if (!index) {
        let best = Infinity; const rr = (r & 252) | 2; const gg = (g & 252) | 2; const bb = (b & 252) | 2;
        for (let k = 0; k < palette.length; k++) { const c = palette[k]; const dist = (rr - c.r) ** 2 + (gg - c.g) ** 2 + (bb - c.b) ** 2; if (dist < best) { best = dist; index = k + 1; } }
        near[key] = index;
      }
      const c = palette[index - 1]; out[0] = c.r; out[1] = c.g; out[2] = c.b; return out;
    });
    return;
  }
  const n = width * height; const { pair, tone, solid } = ensureScratch(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const key = ((data[i] >> 2) << 12) | ((data[i + 1] >> 2) << 6) | (data[i + 2] >> 2);
    if (!mixCache[key]) classify((data[i] & 252) | 2, (data[i + 1] & 252) | 2, (data[i + 2] & 252) | 2, key);
    pair[p] = mixCache[key]; tone[p] = mixTone[key];
    // outlines stay crisp: a strong edge takes the nearer of its two colours, no pattern
    solid[p] = useDither && edgeMap[p] > EDGE_SOLID ? 1 : 0;
  }
  const pattern = currentDitherPattern();
  if (useDither && pattern.cell > 1) averageToneByCell(width, height, pattern.cell, pair, tone, solid);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const code = pair[p] - 1; const dark = code >> 5; const light = code & 31;
    let pick = dark;
    if (dark !== light) {
      if (!useDither || solid[p]) pick = tone[p] >= 128 ? light : dark;
      else {
        const x = p % width; const y = (p / width) | 0;
        pick = pattern.levels[pattern.levelForTone[tone[p]]][((y & pattern.mask) << pattern.shift) | (x & pattern.mask)] ? light : dark;
      }
    }
    const color = palette[pick];
    data[i] = color.r; data[i + 1] = color.g; data[i + 2] = color.b;
  }
  // Edge pixels were placed without a pattern; one that ended up alone (unlike all four neighbours) is a
  // stray fleck, not detail, so it takes the colour most of its neighbours have.
  if (useDither) removeStrayEdgePixels(data, width, height, solid);
  // 面のまとまり is a majority filter: it would erase the dither pattern, so it only tidies flat colour
  if (useDither) return;
  applySurfaceSimplify(imageData, edgeMap, palette);
  removeSmallRegions(imageData, edgeMap);
}

state.cameraSettings = { ...CAMERA_SETTING_DEFAULTS };

export { DITHER_PATTERNS };
export { CAMERA_SETTING_CONFIG, CAMERA_SETTING_DEFAULTS, DOT_SMOOTHING_BLUR, FIXED_FOUR_COLOR_PALETTE };

/** Update PiXiEELENS settings: colorDepth ('2'|'4'|'8'|'16'|'gray'|'256'|'full'), paletteMode ('gameboy'|'source'),
 * gradientMode ('dither'|'none'), ditherPattern (DITHER_PATTERNS id), surfaceSimplify (0..100), cameraSettings ({ brightness, exposure, ... } -100..100). */
export function setLensSettings(next = {}) {
  const depthChanged = next.colorDepth !== undefined && next.colorDepth !== state.colorDepth;
  const modeChanged = next.paletteMode !== undefined && next.paletteMode !== state.paletteMode;
  if (next.colorDepth !== undefined) state.colorDepth = String(next.colorDepth);
  if (next.paletteMode !== undefined) state.paletteMode = next.paletteMode === 'source' ? 'source' : 'gameboy';
  if (next.gradientMode !== undefined) state.gradientMode = next.gradientMode === 'none' ? 'none' : 'dither';
  if (next.ditherPattern !== undefined && DITHER_PATTERNS.some((p) => p.id === next.ditherPattern)) state.ditherPattern = next.ditherPattern;
  if (next.surfaceSimplify !== undefined) state.surfaceSimplify = Math.max(0, Math.min(100, Number(next.surfaceSimplify) || 0));
  if (next.cameraSettings) state.cameraSettings = { ...state.cameraSettings, ...next.cameraSettings };
  if (depthChanged || modeChanged) clearPaletteState();
}

export function getLensSettings() { return { ...state, cameraSettings: { ...state.cameraSettings } }; }

/** Pick the palette again from the next frame (PiXiEELENS keeps a palette until the depth changes). */
export function resetLensPalette() { clearPaletteState(); }

export function onLensPalette(listener) { paletteListener = listener; paletteDisplayEnabled = Boolean(listener); }

export function lensPalette() { return paletteState.colors.map((c) => [c.r, c.g, c.b]); }

// ---- Editing the palette by hand (PiXiEELENS kept a userEdited flag for this) ----
const toColor = ([r, g, b]) => ({ r: clampByte(Math.round(r)), g: clampByte(Math.round(g)), b: clampByte(Math.round(b)) });
/** Change one palette colour. The array is replaced, so every colour cache keyed on it starts fresh. */
export function setLensPaletteColor(index, rgb) {
  if (!paletteState.colors[index]) return false;
  const next = paletteState.colors.map((c) => ({ ...c }));
  next[index] = toColor(rgb);
  paletteState.colors = next;
  paletteState.cache = new Map();
  paletteState.userEdited = true;
  paletteState.provisionalSource = false;
  return true;
}
/** Put back the colours the look started with (before any hand edits). */
export function resetLensPaletteEdits() {
  if (!paletteState.originalColors.length) return;
  paletteState.colors = paletteState.originalColors.map((c) => ({ ...c }));
  paletteState.cache = new Map();
  paletteState.userEdited = false;
}
/** Use a saved palette as it is: it is kept (never re-picked) until the look changes. */
export function setLensPalette(colors) {
  applyNewPaletteColors(colors.map(toColor));
  paletteState.depth = state.colorDepth;
  paletteState.desired = colors.length;
  paletteState.lastUpdated = typeof performance !== 'undefined' ? performance.now() : Date.now();
  paletteState.userEdited = true;
}
export function lensPaletteEdited() { return paletteState.userEdited; }
/** グレー: the one tint colour (neutral until edited). */
export function ensureGrayTint() {
  if (state.colorDepth !== 'gray' || paletteState.colors.length) return;
  applyNewPaletteColors([GRAY_TINT_DEFAULT_COLOR]); paletteState.depth = 'gray'; paletteState.desired = 1;
}

/** CSS filter string PiXiEELENS draws the camera frame with (tone settings + the dot smoothing blur). */
export function lensFrameFilter() {
  return `blur(${DOT_SMOOTHING_BLUR}px) ${computeCameraFilterComponents(state.cameraSettings).join(' ')}`;
}

/** Run the PiXiEELENS colour pipeline on an ImageData already sampled at dot resolution (in place). */
export function processLensFrame(imageData) { applyColorDepth(imageData); return imageData; }
