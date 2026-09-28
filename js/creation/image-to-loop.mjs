import { hashCanonical, validateAsset } from './asset-contract.mjs';
import { validateDrawDocument } from './draw-core.mjs';

export const IMAGE_TO_LOOP_RULES_VERSION = 'image-to-loop-v2';
export const IMAGE_TO_LOOP_PPQ = 480;
export const IMAGE_TO_LOOP_TICKS = IMAGE_TO_LOOP_PPQ * 4;
export const IMAGE_TO_LOOP_MAX_NOTES = 32;
export const IMAGE_TO_LOOP_MAX_VELOCITY = 112;
export const IMAGE_TO_LOOP_HASH_SCHEME = 'sha256-canonical-v1';

const INSTRUMENTS = Object.freeze([
  { id: 'square', name: 'Square' },
  { id: 'triangle', name: 'Triangle' },
  { id: 'sawtooth', name: 'Sawtooth' },
  { id: 'noise', name: 'Noise' }
]);
const PENTATONIC = Object.freeze([0, 2, 4, 7, 9]);

function assertDerivationAllowed(asset, actorId) {
  validateAsset(asset);
  if (asset.kind !== 'pixel_art' && asset.kind !== 'pixel_camera') throw new Error('画像作品だけを音楽へ派生できます');
  if (asset.contentHash === null || !asset.revisionId) throw new Error('固定された画像版が必要です');
  if (asset.visibility !== 'draft' || asset.owner.type !== 'local' || asset.owner.id !== 'local-owner' || actorId !== 'local-owner' || asset.reusePermission !== 'owner_only') throw new Error('自分の端末に保存した画像だけを音楽へ使えます');
}

function parseColor(color) {
  const hex = color.slice(1);
  return {
    red: Number.parseInt(hex.slice(0, 2), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    blue: Number.parseInt(hex.slice(4, 6), 16),
    alpha: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255,
    canonical: `#${hex.toLowerCase()}`
  };
}

function colorFeatures({ red, green, blue }) {
  const max = Math.max(red, green, blue); const min = Math.min(red, green, blue); const chroma = max - min;
  const brightness = (red + green + blue) / (3 * 255);
  if (chroma < 8) {
    const step = Math.min(4, Math.floor(brightness * 5));
    return { neutral: true, hue: 0, brightness, instrument: 'triangle', pitch: 48 + PENTATONIC[step], slot: Math.min(7, Math.floor(brightness * 8)) };
  }
  let hue;
  if (max === red) hue = 60 * (((green - blue) / chroma) % 6);
  else if (max === green) hue = 60 * ((blue - red) / chroma + 2);
  else hue = 60 * ((red - green) / chroma + 4);
  if (hue < 0) hue += 360;
  const hueBand = Math.min(4, Math.floor(hue / 72));
  const octave = brightness >= 0.66 ? 60 : brightness >= 0.33 ? 48 : 36;
  return {
    neutral: false, hue, brightness,
    instrument: INSTRUMENTS[Math.min(3, Math.floor(hue / 90))].id,
    pitch: octave + PENTATONIC[hueBand],
    slot: Math.min(7, Math.floor(hue / 45))
  };
}

function collectVisibleColors(document) {
  const colors = new Map();
  for (const pixel of document.pixels) {
    if (pixel < 0) continue;
    const color = parseColor(document.palette[pixel]);
    if (color.alpha === 0) continue;
    const entry = colors.get(color.canonical) || { ...color, area: 0 };
    entry.area += 1;
    colors.set(color.canonical, entry);
  }
  return [...colors.values()].sort((left, right) => right.area - left.area || (left.canonical < right.canonical ? -1 : left.canonical > right.canonical ? 1 : 0));
}

/** Create a deterministic editable loop seed without copying image pixels or palette data. */
export async function imageToLoop({ asset, document, actorId }) {
  assertDerivationAllowed(asset, actorId);
  validateDrawDocument(document);
  if (document.width !== document.height) throw new TypeError('画像は正方形である必要があります');
  if (asset.hashScheme !== IMAGE_TO_LOOP_HASH_SCHEME) throw new Error('画像ファイルhashでは文書の固定版を検証できません（Step15で扱います）');
  if (await hashCanonical(document) !== asset.contentHash) throw new Error('固定版hashと画像編集データが一致しません');

  const colors = collectVisibleColors(document);
  const totalArea = colors.reduce((sum, color) => sum + color.area, 0);
  const selected = colors.slice(0, IMAGE_TO_LOOP_MAX_NOTES);
  const tracks = INSTRUMENTS.map(({ id, name }) => ({ trackId: `track-${id}`, instrument: id, name, notes: [] }));
  const suggestedColors = new Map();
  selected.forEach((color, rank) => {
    const feature = colorFeatures(color);
    if (!suggestedColors.has(feature.instrument)) suggestedColors.set(feature.instrument, color.canonical.slice(0, 7));
    const share = color.area / Math.max(totalArea, 1);
    const startTick = feature.slot * (IMAGE_TO_LOOP_PPQ / 2);
    const durationTicks = Math.min(IMAGE_TO_LOOP_TICKS - startTick, Math.min(480, Math.max(120, Math.ceil(share * 4) * 120)));
    const velocity = Math.min(IMAGE_TO_LOOP_MAX_VELOCITY, Math.max(48, 48 + Math.round(64 * share)));
    tracks.find((track) => track.instrument === feature.instrument).notes.push({
      noteId: `seed-note-${String(rank + 1).padStart(2, '0')}`,
      startTick,
      durationTicks,
      pitch: feature.pitch,
      velocity
    });
  });
  for (const track of tracks) track.notes.sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch || (left.noteId < right.noteId ? -1 : left.noteId > right.noteId ? 1 : 0));

  return {
    schemaVersion: 1,
    rulesVersion: IMAGE_TO_LOOP_RULES_VERSION,
    ticksPerQuarter: IMAGE_TO_LOOP_PPQ,
    tempo: 120,
    timeSignature: { numerator: 4, denominator: 4 },
    loopTicks: IMAGE_TO_LOOP_TICKS,
    scale: { rootMidi: 48, intervals: [...PENTATONIC] },
    source: {
      assetId: asset.assetId,
      revisionId: asset.revisionId,
      contentHash: asset.contentHash,
      hashScheme: asset.hashScheme
    },
    suggestedColors: Object.fromEntries(INSTRUMENTS.filter(({ id }) => suggestedColors.has(id)).map(({ id }) => [id, suggestedColors.get(id)])),
    tracks
  };
}
