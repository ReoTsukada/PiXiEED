import { REWARD_LIMITS } from '../ads/site-reward-config.mjs?rev=20261016-color-capability-1';
import { AUDIO_PIXEL_TICKS, collectAudioEvents, getAudioColorInstrument } from './audio-core.mjs?rev=20261016-color-capability-1';
import { AUDIO_INSTRUMENTS } from './audio-timbres.mjs';
import { getAnimationCelDocument, getAnimationDrawRewardBonusColors, setAnimationDrawRewardBonusColors } from './animation-core.mjs?rev=20261016-color-capability-1';
import { getAudioAnimationUsedColorIds } from './audio-animation.mjs?rev=20261016-color-capability-1';

export const AUDIO_BASIC_INSTRUMENT_IDS = Object.freeze(['square', 'triangle', 'sawtooth', 'noise']);
const basicInstruments = new Set(AUDIO_BASIC_INSTRUMENT_IDS);
const knownInstruments = new Set(AUDIO_INSTRUMENTS.map(({ id }) => id));

export const AUDIO_FREE_COLUMNS = REWARD_LIMITS.audio.columns;
export const AUDIO_REWARD_COLUMNS = REWARD_LIMITS.audio.rewardColumns;
export const AUDIO_FREE_COLORS = REWARD_LIMITS.draw.colors;
export const AUDIO_REWARD_COLORS = REWARD_LIMITS.draw.rewardColors;

export function isAudioBasicInstrument(instrumentId) {
  return basicInstruments.has(instrumentId);
}

const rgbaId = (color) => `rgba-${color.slice(1).padEnd(8, 'f').toLowerCase()}`;

/** Exact RGBA count for indexed animation data; transparent and unused swatches don't consume the quota. */
export function getAudioRewardColorCount(animation) {
  return getAudioAnimationUsedColorIds(animation).size;
}

function imageColorsInOrder(image) {
  const ids = new Set();
  if (!image?.rgba || image.rgba.length !== image.width * image.height * 4) return ids;
  for (let offset = 0; offset < image.rgba.length; offset += 4) {
    if (image.rgba[offset + 3] === 0) continue;
    ids.add(`rgba-${[0, 1, 2, 3].map((channel) => image.rgba[offset + channel].toString(16).padStart(2, '0')).join('')}`);
  }
  return ids;
}

function rgbaIdsFromLedger(colors) {
  return Array.isArray(colors) ? colors.map((color) => `rgba-${String(color).replace(/^#/, '').padEnd(8, 'f').toLowerCase()}`) : null;
}

function ledgerColors(ids) {
  return [...ids].map((id) => `#${id.slice(5).toLowerCase()}`);
}

function persistedBonusIds(animation, link) {
  const animationLedger = animation ? getAnimationDrawRewardBonusColors(animation) : null;
  const ledger = animationLedger ?? link?.drawRewardBonusColors;
  if (ledger === undefined || ledger === null) return null;
  if (!Array.isArray(ledger) || ledger.length > AUDIO_REWARD_COLORS
      || ledger.some((color) => typeof color !== 'string' || !/^#[\da-f]{8}$/i.test(color) || color.slice(7).toLowerCase() === '00')
      || new Set(ledger.map((color) => color.toLowerCase())).size !== ledger.length) {
    throw new TypeError('共有画像の特典色保護情報が不正です。原本は変更していません。');
  }
  return rgbaIdsFromLedger(ledger);
}

/** Seed stable ownership metadata once when loading legacy audio artwork. */
export function initializeAudioRewardColorOwnership({ animation = null, image = null, link = null } = {}) {
  const used = animation ? [...getAudioAnimationUsedColorIds(animation)] : [...imageColorsInOrder(image)];
  const stored = persistedBonusIds(animation, link);
  const bonus = stored ?? used.slice(AUDIO_FREE_COLORS);
  if (animation && getAnimationDrawRewardBonusColors(animation) === null) {
    setAnimationDrawRewardBonusColors(animation, ledgerColors(bonus));
  }
  const nextLink = link ? { ...link, drawRewardBonusColors: ledgerColors(bonus) } : link;
  return { animation, image, link: nextLink, bonusColorIds: [...bonus], changed: stored === null };
}

/** Persist stable ownership on an accepted audio image/animation candidate. */
export function writeAudioRewardColorOwnership({ animation = null, image = null, link = null,
  referenceLink = link, rewardActive = false } = {}) {
  const used = animation ? [...getAudioAnimationUsedColorIds(animation)] : [...imageColorsInOrder(image)];
  const existing = persistedBonusIds(animation, referenceLink);
  const bonus = rewardActive ? used.slice(AUDIO_FREE_COLORS) : existing ?? used.slice(AUDIO_FREE_COLORS);
  if (animation) setAnimationDrawRewardBonusColors(animation, ledgerColors(bonus));
  const nextLink = link ? { ...link, drawRewardBonusColors: ledgerColors(bonus) } : link;
  return { animation, image, link: nextLink, bonusColorIds: [...bonus] };
}

export function getAudioRewardImageColorCount(image) {
  return imageColorsInOrder(image).size;
}

function protectedPaletteState({ animation = null, image = null, link = null, bonusColorIds: explicitBonus = null } = {}) {
  let colorIds;
  const cells = [];
  if (animation) {
    colorIds = [...getAudioAnimationUsedColorIds(animation)];
    for (const frame of animation.frames) for (const layer of animation.layers) {
      const document = getAnimationCelDocument(animation, frame.id, layer.id);
      for (let index = 0; index < document.pixels.length; index += 1) {
        const paletteIndex = document.pixels[index];
        if (paletteIndex < 0) continue;
        const color = animation.palette[paletteIndex];
        if (!color) continue;
        const colorId = rgbaId(color);
        if (!colorId.endsWith('00')) cells.push([frame.id, layer.id, index % animation.width,
          Math.floor(index / animation.width), colorId]);
      }
    }
  } else {
    colorIds = [...imageColorsInOrder(image)];
    if (image?.rgba) for (let offset = 0; offset < image.rgba.length; offset += 4) {
      if (image.rgba[offset + 3] === 0) continue;
      const colorId = `rgba-${[0, 1, 2, 3].map((channel) => image.rgba[offset + channel].toString(16).padStart(2, '0')).join('')}`;
      cells.push([Math.floor(offset / 4) % image.width, Math.floor(offset / 4 / image.width), colorId]);
    }
  }
  const stored = persistedBonusIds(animation, link);
  const bonus = new Set(explicitBonus || stored || colorIds.slice(AUDIO_FREE_COLORS));
  const protectedCells = cells.filter((cell) => bonus.has(cell.at(-1)));
  const mappings = [...bonus].sort().map((colorId) => [colorId, link?.colorToSlot?.[colorId] ?? null]);
  return JSON.stringify({ colors: [...bonus].sort(), cells: protectedCells, mappings });
}

/** Snapshot used bonus swatches, their cell locations, and their audio assignments. */
export function getAudioRewardProtectedPaletteState(animation, link) {
  return protectedPaletteState({ animation, link });
}

export function preservesAudioRewardPaletteContent(beforeAnimation, beforeLink, afterAnimation, afterLink) {
  return preservesPaletteWithLedger(beforeAnimation, beforeLink, afterAnimation, afterLink);
}

function preservesPaletteWithLedger(beforeAnimation, beforeLink, afterAnimation, afterLink) {
  const beforeUsed = [...getAudioAnimationUsedColorIds(beforeAnimation)];
  const afterUsed = [...getAudioAnimationUsedColorIds(afterAnimation)];
  const ledger = persistedBonusIds(beforeAnimation, beforeLink) ?? beforeUsed.slice(AUDIO_FREE_COLORS);
  const afterLedger = persistedBonusIds(afterAnimation, afterLink);
  if (afterLedger && JSON.stringify([...afterLedger].sort()) !== JSON.stringify([...ledger].sort())) return false;
  if (afterUsed.filter((id) => !ledger.includes(id)).length > AUDIO_FREE_COLORS) return false;
  return protectedPaletteState({ animation: beforeAnimation, link: beforeLink, bonusColorIds: ledger })
    === protectedPaletteState({ animation: afterAnimation, link: afterLink, bonusColorIds: ledger });
}

export function preservesAudioRewardImageContent(beforeImage, beforeLink, afterImage, afterLink) {
  const beforeUsed = [...imageColorsInOrder(beforeImage)];
  const afterUsed = [...imageColorsInOrder(afterImage)];
  const ledger = persistedBonusIds(null, beforeLink) ?? beforeUsed.slice(AUDIO_FREE_COLORS);
  const afterLedger = persistedBonusIds(null, afterLink);
  if (afterLedger && JSON.stringify([...afterLedger].sort()) !== JSON.stringify([...ledger].sort())) return false;
  if (afterUsed.filter((id) => !ledger.includes(id)).length > AUDIO_FREE_COLORS) return false;
  return protectedPaletteState({ image: beforeImage, link: beforeLink, bonusColorIds: ledger })
    === protectedPaletteState({ image: afterImage, link: afterLink, bonusColorIds: ledger });
}

/** Summarize premium audio features without changing or normalizing the song. */
export function getAudioRewardFeatures(song) {
  const columns = song?.loopTicks / AUDIO_PIXEL_TICKS;
  const instruments = new Set();
  for (const { instrument } of collectAudioEvents(song)) if (knownInstruments.has(instrument) && !basicInstruments.has(instrument)) instruments.add(instrument);
  for (const slot of song?.pixelPalette || []) if (knownInstruments.has(slot.instrument) && !basicInstruments.has(slot.instrument)) instruments.add(slot.instrument);
  for (const instrument of Object.values(song?.colorInstruments || {})) if (knownInstruments.has(instrument) && !basicInstruments.has(instrument)) instruments.add(instrument);
  return Object.freeze({
    columns,
    wideCanvas: Number.isFinite(columns) && columns > AUDIO_FREE_COLUMNS,
    additionalInstruments: Object.freeze([...instruments]),
    hasAdditionalInstruments: instruments.size > 0
  });
}

/**
 * Exact projection of audio content that an expired reward must leave intact.
 * Keeping raw note records here catches edits that split, shorten, recolor, or
 * remove a sustained bonus note, including edits made through imported-image
 * and animation projections. Empty loop duration is intentionally excluded:
 * Draw canvas dimensions are a free general editing feature, and may expand
 * the shared music projection without creating bonus audio content. The
 * standalone Audio canvas size control applies its own explicit limit.
 */
export function getAudioRewardProtectedState(song) {
  const freeEnd = AUDIO_FREE_COLUMNS * AUDIO_PIXEL_TICKS;
  const extraNotes = [];
  for (const track of song?.tracks || []) for (const clip of track.clips || []) for (const note of clip.notes || []) {
    const instrument = getAudioColorInstrument(song, note.colorId, track.instrument) || track.instrument;
    if ((knownInstruments.has(instrument) && !basicInstruments.has(instrument)) || note.startTick >= freeEnd || note.startTick + note.durationTicks > freeEnd) {
      extraNotes.push([track.trackId, clip.clipId, instrument, note]);
    }
  }
  extraNotes.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const extraPalette = (song?.pixelPalette || []).filter(({ instrument }) => knownInstruments.has(instrument) && !basicInstruments.has(instrument));
  const extraColors = Object.entries(song?.colorInstruments || {}).filter(([, instrument]) => knownInstruments.has(instrument) && !basicInstruments.has(instrument)).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify({
    notes: extraNotes,
    palette: extraPalette,
    colors: extraColors
  });
}

export function preservesAudioRewardContent(beforeSong, afterSong) {
  return getAudioRewardProtectedState(beforeSong) === getAudioRewardProtectedState(afterSong);
}

/** True when this edit is covered by the free audio allowance. */
export function canEditAudioColumn(song, column, { rewardActive = false } = {}) {
  return rewardActive || (Number.isInteger(column) && column >= 0 && column < AUDIO_FREE_COLUMNS);
}
