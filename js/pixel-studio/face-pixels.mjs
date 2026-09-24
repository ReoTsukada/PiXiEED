import { fitTone, grayLight } from './global-tones.mjs';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const lightOf = rgb => grayLight(rgb[0], rgb[1], rgb[2]);
const delta = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

function samplePoints(frame, points, gridWidth, quantile = 0.5) {
  const samples = [];
  const radius = Math.max(1, Math.min(12, Math.round(frame.width / gridWidth * 0.35)));
  for (const point of points) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) continue;
    const cx = Math.min(frame.width - 1, Math.floor(point.x * frame.width));
    const cy = Math.min(frame.height - 1, Math.floor(point.y * frame.height));
    for (let y = Math.max(0, cy - radius); y <= Math.min(frame.height - 1, cy + radius); y++) {
      for (let x = Math.max(0, cx - radius); x <= Math.min(frame.width - 1, cx + radius); x++) {
        const p = (y * frame.width + x) * 4;
        const rgb = [frame.data[p], frame.data[p + 1], frame.data[p + 2]];
        samples.push({ rgb, light: lightOf(rgb) });
      }
    }
  }
  if (!samples.length) return null;
  samples.sort((a, b) => a.light - b.light);
  return samples[Math.min(samples.length - 1, Math.floor(samples.length * quantile))].rgb;
}

function nearestColor(rgb, palette, lights, { min = 0, max = 255 } = {}) {
  let best = -1, distance = Infinity;
  for (let index = 0; index < palette.length; index++) {
    if (lights[index] < min || lights[index] > max) continue;
    const color = palette[index];
    const d = (rgb[0] - color[0]) ** 2 + (rgb[1] - color[1]) ** 2 + (rgb[2] - color[2]) ** 2;
    if (d < distance) { distance = d; best = index; }
  }
  return best;
}

function compatibleSkin(rgb, base) {
  const mean = (rgb[0] + rgb[1] + rgb[2]) / 3;
  const reference = (base[0] + base[1] + base[2]) / 3;
  // Compare color direction independently of shading. Strongly different hair,
  // lips, occluders and accessories remain in the ordinary object renderer.
  return Math.max(...rgb.map((value, c) => Math.abs((value - mean) - (base[c] - reference)))) <= 24;
}

/** Simplify a detected small face in the existing palette; never add RGB colors. */
export function renderFacePixels({ frame, rgb, objects, indices, palette, width, height, guide, previous = null }) {
  if (!guide?.compact) return { indices, state: null, skinCells: 0, featureCells: 0, skinColors: 0 };
  const count = width * height;
  if (guide.width !== width || guide.height !== height || guide.skin?.length !== count ||
      !(indices instanceof Uint8Array) || indices.length !== count || rgb.length !== count * 3 || objects.length !== count) {
    throw new TypeError('face pixels must match the output grid');
  }
  const ownerCounts = new Map();
  for (const point of guide.samples ?? []) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) continue;
    const x = Math.min(width - 1, Math.floor(point.x * width));
    const y = Math.min(height - 1, Math.floor(point.y * height));
    const cell = y * width + x;
    if (!guide.skin[cell]) continue;
    const owner = objects[cell];
    ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
  }
  let faceOwner;
  let ownerVotes = 0;
  for (const [owner, votes] of ownerCounts) {
    if (votes > ownerVotes) { faceOwner = owner; ownerVotes = votes; }
  }
  if (ownerVotes === 0) return { indices, state: null, skinCells: 0, featureCells: 0, skinColors: 0 };
  const faceSamples = guide.samples.filter(point => {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return false;
    const x = Math.min(width - 1, Math.floor(point.x * width));
    const y = Math.min(height - 1, Math.floor(point.y * height));
    const cell = y * width + x;
    return guide.skin[cell] && objects[cell] === faceOwner;
  });
  const base = samplePoints(frame, faceSamples, width);
  if (!base) return { indices, state: null, skinCells: 0, featureCells: 0, skinColors: 0 };
  const lights = palette.map(lightOf), paletteKey = palette.map(color => color.join(',')).join(';');
  const baseLight = lightOf(base);
  const baseIndex = nearestColor(base, palette, lights);
  let ramp = [
    nearestColor(fitTone(base, clamp(lights[baseIndex] - 32, 24, 240)), palette, lights,
      { min: Math.max(0, lights[baseIndex] - 56), max: lights[baseIndex] - 8 }),
    baseIndex,
    nearestColor(fitTone(base, clamp(lights[baseIndex] + 24, 24, 240)), palette, lights,
      { min: lights[baseIndex] + 8, max: Math.min(255, lights[baseIndex] + 48) })
  ];
  if (previous?.paletteKey === paletteKey && delta(previous.base, base) <= 8) ramp = [...previous.ramp];
  const [shadow, main, highlight] = ramp;
  const featureMask = new Uint8Array(count);
  for (const mark of guide.marks) for (const cell of mark.cells) featureMask[cell] = 1;
  const output = new Uint8Array(indices), touched = new Uint8Array(count);
  let skinCells = 0, featureCells = 0;
  const skinColors = new Set();
  // Median shading is only a tone-selection signal within the face/object.
  // Final pixels stay solid palette colors and the outer face rim is untouched.
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const cell = y * width + x;
    if (!guide.skin[cell] || objects[cell] !== faceOwner || featureMask[cell] || !guide.skin[cell - 1] || !guide.skin[cell + 1] ||
        !guide.skin[cell - width] || !guide.skin[cell + width]) continue;
    const color = [rgb[cell * 3], rgb[cell * 3 + 1], rgb[cell * 3 + 2]];
    if (!compatibleSkin(color, base) || Math.abs(lightOf(color) - baseLight) > 72) continue;
    const local = [];
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const n = cell + oy * width + ox;
      if (guide.skin[n] && !featureMask[n] && objects[n] === objects[cell]) {
        const sample = [rgb[n * 3], rgb[n * 3 + 1], rgb[n * 3 + 2]];
        if (compatibleSkin(sample, base)) local.push(lightOf(sample));
      }
    }
    local.sort((a, b) => a - b);
    const light = local.length ? local[Math.floor(local.length / 2)] : lightOf(color);
    const index = shadow >= 0 && light < baseLight - 28 ? shadow
      : highlight >= 0 && light > baseLight + 30 ? highlight : main;
    output[cell] = index; touched[cell] = 1; skinCells++; skinColors.add(index);
  }
  // Draw only detected landmarks with source-image contrast. The nose uses a
  // softer skin shade; eyes/mouth may use a darker source-compatible swatch.
  const painted = new Uint8Array(count);
  for (const mark of guide.marks) {
    const sample = samplePoints(frame, mark.points, width, mark.kind === 'nose' ? 0.3 : 0.2);
    if (!sample || baseLight - lightOf(sample) < (mark.kind === 'nose' ? 4 : 6)) continue;
    const target = mark.kind === 'nose'
      ? fitTone(base, clamp(lights[main] - 32, 24, 240)) : sample;
    let index = mark.kind === 'nose' && shadow >= 0 ? shadow
      : nearestColor(target, palette, lights, { max: lights[main] - (mark.kind === 'nose' ? 12 : 24) });
    if (index < 0) continue;
    for (const cell of mark.cells) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= count || !guide.skin[cell] || objects[cell] !== faceOwner || painted[cell]) continue;
      output[cell] = index; touched[cell] = painted[cell] = 1; featureCells++;
    }
  }
  return { indices: output, touched, state: { base, paletteKey, ramp },
    skinCells, featureCells, skinColors: skinColors.size };
}
