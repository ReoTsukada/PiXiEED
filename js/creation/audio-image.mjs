import { AUDIO_PIXEL_PITCHES, AUDIO_PIXEL_TICKS, AUDIO_PIXEL_PALETTE, audioPixelColumns, resizeAudioCanvas, validateAudioSong } from './audio-core.mjs?rev=20261004-audio-outline-color-1';
import { DRAW_SIZES, MAX_DRAW_COLORS, validateDrawDocument } from './draw-core.mjs';

const colorDefaults = AUDIO_PIXEL_PALETTE.map(({ color }) => color);
export const AUDIO_IMAGE_RULES_VERSION = 'image-to-audio-pixels-v1';
const toRgb = (color) => {
  const hex = color.slice(1);
  return { r: Number.parseInt(hex.slice(0, 2), 16), g: Number.parseInt(hex.slice(2, 4), 16), b: Number.parseInt(hex.slice(4, 6), 16), a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255 };
};
const toHex = ({ r, g, b }) => `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
const distance = (a, b) => (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;

function validateImageDocument(document) {
  if (document?.width === document?.height) return validateDrawDocument(document);
  if (!document || document.schemaVersion !== 1 || !DRAW_SIZES.includes(document.width) || !DRAW_SIZES.includes(document.height)) throw new TypeError('画像データの大きさが不正です');
  if (!Array.isArray(document.palette) || document.palette.length < 1 || document.palette.length > MAX_DRAW_COLORS || document.palette.some((color) => typeof color !== 'string' || !/^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(color))) throw new TypeError('画像の色パレットが不正です');
  if (!Array.isArray(document.pixels) || document.pixels.length !== document.width * document.height || document.pixels.some((pixel) => !Number.isInteger(pixel) || pixel < -1 || pixel >= document.palette.length)) throw new TypeError('画像の画素データが不正です');
  return document;
}

function representativeColors(histogram) {
  const colors = [...histogram.values()];
  if (!colors.length) return [...colorDefaults];
  const boxes = [colors];
  while (boxes.length < 4) {
    let chosen = -1; let bestScore = -1;
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      const ranges = ['r', 'g', 'b'].map((channel) => Math.max(...box.map((item) => item[channel])) - Math.min(...box.map((item) => item[channel])));
      const score = Math.max(...ranges) * box.reduce((sum, item) => sum + item.count, 0);
      if (score > bestScore) { bestScore = score; chosen = index; }
    });
    if (chosen < 0) break;
    const box = boxes.splice(chosen, 1)[0];
    const channels = ['r', 'g', 'b'].map((channel) => Math.max(...box.map((item) => item[channel])) - Math.min(...box.map((item) => item[channel])));
    const channel = ['r', 'g', 'b'][channels.indexOf(Math.max(...channels))];
    box.sort((left, right) => left[channel] - right[channel]);
    const half = box.reduce((sum, item) => sum + item.count, 0) / 2; let weight = 0; let split = 1;
    for (; split < box.length; split += 1) { weight += box[split - 1].count; if (weight >= half) break; }
    boxes.push(box.slice(0, split), box.slice(split));
  }
  const result = [];
  const seen = new Set();
  for (const box of boxes) {
    const total = box.reduce((sum, item) => sum + item.count, 0);
    const color = { r: box.reduce((sum, item) => sum + item.r * item.count, 0) / total, g: box.reduce((sum, item) => sum + item.g * item.count, 0) / total, b: box.reduce((sum, item) => sum + item.b * item.count, 0) / total };
    const hex = toHex(color);
    if (!seen.has(hex)) { result.push(color); seen.add(hex); }
  }
  for (const fallback of colorDefaults) {
    if (result.length === 4) break;
    if (!seen.has(fallback)) { result.push(toRgb(fallback)); seen.add(fallback); }
  }
  return result.slice(0, 4).map(toHex);
}

function addGapClips(song) {
  let id = 0;
  const used = new Set(song.tracks.flatMap((track) => track.clips.map((clip) => clip.clipId)));
  const nextId = () => { let candidate; do { candidate = `image-import-clip-${++id}`; } while (used.has(candidate)); used.add(candidate); return candidate; };
  return song.tracks.map((track) => {
    const clips = [...track.clips].sort((a, b) => a.startTick - b.startTick);
    const covered = []; let cursor = 0;
    for (const clip of clips) {
      if (clip.startTick > cursor) covered.push({ clipId: nextId(), startTick: cursor, lengthTicks: clip.startTick - cursor, notes: [] });
      covered.push(clip); cursor = clip.startTick + clip.lengthTicks;
    }
    if (cursor < song.loopTicks) covered.push({ clipId: nextId(), startTick: cursor, lengthTicks: song.loopTicks - cursor, notes: [] });
    return { ...track, clips: covered };
  });
}

/** Seed the audio pixel canvas from a Draw document; each opaque cell becomes one 16th-note. */
export function importAudioImage(song, document) {
  validateAudioSong(song); validateImageDocument(document);
  const columns = audioPixelColumns(song);
  const sampled = Array(columns * AUDIO_PIXEL_PITCHES.length).fill(null);
  const histogram = new Map();
  for (let y = 0; y < AUDIO_PIXEL_PITCHES.length; y += 1) for (let x = 0; x < columns; x += 1) {
    const sx = Math.min(document.width - 1, Math.floor((x + 0.5) * document.width / columns));
    const sy = Math.min(document.height - 1, Math.floor((y + 0.5) * document.height / AUDIO_PIXEL_PITCHES.length));
    const pixel = document.pixels[sy * document.width + sx];
    if (pixel < 0) continue;
    const rgb = toRgb(document.palette[pixel]); if (rgb.a === 0) continue;
    sampled[y * columns + x] = rgb;
    const key = `${rgb.r},${rgb.g},${rgb.b}`; const entry = histogram.get(key) || { ...rgb, count: 0 }; entry.count += 1; histogram.set(key, entry);
  }
  const colors = representativeColors(histogram);
  const slots = song.pixelPalette || AUDIO_PIXEL_PALETTE;
  const palette = slots.map((slot, index) => ({ ...slot, color: colors[index] }));
  const tracks = addGapClips({ ...resizeAudioCanvas(song, columns), pixelPalette: palette }).map((track) => ({
    ...track,
    clips: track.clips.map((clip) => ({ ...clip, notes: clip.notes.filter((note) => !AUDIO_PIXEL_PITCHES.includes(note.pitch)) }))
  }));
  const tracksByInstrument = new Map(tracks.map((track) => [track.instrument, track]));
  const occupiedIds = new Set(tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes.map((note) => note.noteId))));
  let noteSequence = 0;
  for (let y = 0; y < AUDIO_PIXEL_PITCHES.length; y += 1) for (let x = 0; x < columns; x += 1) {
    const rgb = sampled[y * columns + x]; if (!rgb) continue;
    const slotIndex = colors.reduce((best, color, index) => distance(rgb, toRgb(color)) < distance(rgb, toRgb(colors[best])) ? index : best, 0);
    const track = tracksByInstrument.get(slots[slotIndex].slotId); if (!track) throw new TypeError('画像パレットの保存トラックがありません');
    const startTick = x * AUDIO_PIXEL_TICKS;
    const clip = track.clips.find((item) => startTick >= item.startTick && startTick + AUDIO_PIXEL_TICKS <= item.startTick + item.lengthTicks);
    if (!clip) throw new RangeError('画像のノートを置けるクリップがありません');
    let noteId; do { noteId = `image-${song.songId}-${++noteSequence}`; } while (occupiedIds.has(noteId)); occupiedIds.add(noteId);
    clip.notes.push({ noteId, pitch: AUDIO_PIXEL_PITCHES[y], startTick, durationTicks: AUDIO_PIXEL_TICKS, velocity: 96 });
  }
  return validateAudioSong({ ...song, pixelPalette: palette, tracks });
}
