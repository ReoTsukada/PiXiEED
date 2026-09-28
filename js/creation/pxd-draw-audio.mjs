import { createPxdProject, getPxdJson, setPxdJson } from './pxd-codec.mjs';
import {
  imageToDrawDocument, mergePxdJson, putPxdDrawDocument, putPxdImage,
  readPxdDrawDocument as readProjectDrawDocument, readPxdImage
} from './pxd-project.mjs';
import { AUDIO_PIXEL_PITCHES, AUDIO_PIXEL_TICKS, AUDIO_PIXEL_COLUMN_OPTIONS, audioPixelColumns, audioSongPixels, resizeAudioCanvas, validateAudioSong } from './audio-core.mjs?rev=20260928-touch-motion-1';
import { DRAW_SIZES, documentRgba, validateDrawDocument } from './draw-core.mjs';

const AUDIO_STATE_PATH = 'audio/state.json';
const AUDIO_LINK_PATH = 'audio/link.json';
const AUDIO_IMAGE_ROLE = 'audio';
const clone = (value) => structuredClone(value);
const rgbaHex = (rgba) => [...rgba].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const colorRgba = (color) => {
  const hex = color.slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).concat(hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255);
};
function optionalJson(project, path) {
  if (!project?.entries?.some((entry) => entry.path === path)) return null;
  return getPxdJson(project, path);
}

export async function readPxdDrawDocument(project, role = 'main') {
  return readProjectDrawDocument(project, role);
}

export async function writePxdDrawDocument(project, document, role = 'main') {
  validateDrawDocument(document);
  return putPxdDrawDocument(project || createPxdProject(), document, role);
}

export function readPxdAudioState(project) {
  const song = optionalJson(project, AUDIO_STATE_PATH);
  if (song === null) return null;
  validateAudioSong(song);
  return clone(song);
}
export function readPxdAudioLink(project) { const link = optionalJson(project, AUDIO_LINK_PATH); return link === null ? null : clone(link); }

export function assertPxdAudioPixelCompatibility(song) {
  validateAudioSong(song);
  for (const track of song.tracks) for (const clip of track.clips) for (const note of clip.notes) {
    if (!AUDIO_PIXEL_PITCHES.includes(note.pitch) || note.startTick % AUDIO_PIXEL_TICKS !== 0 || note.durationTicks !== AUDIO_PIXEL_TICKS) throw new TypeError('この曲にはピクセル編集に対応しない音符があります。元の曲を保持したまま、別のセル対応曲を作ってください。');
  }
  return song;
}
export function validatePxdAudioBinding(song, image, link) {
  assertLinkedCellSong(song, link, image);
  assertImageNotesMatch(song, link, image);
  return song;
}

export function audioSongImage(song) {
  validateAudioSong(song);
  const pixels = audioSongPixels(song); const { width, height } = pixels;
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < pixels.pixels.length; index += 1) {
    const slotIndex = pixels.pixels[index]; if (slotIndex < 0) continue;
    rgba.set(colorRgba(pixels.palette[slotIndex]), index * 4);
  }
  return { width, height, rgba };
}

export function audioCellLink(song) {
  validateAudioSong(song);
  const width = audioPixelColumns(song); const palette = song.pixelPalette || [];
  return {
    rulesVersion: 'pixel-cell-v1', imageRole: AUDIO_IMAGE_ROLE, width, height: AUDIO_PIXEL_PITCHES.length,
    rowPitchMap: [...AUDIO_PIXEL_PITCHES], ticksPerCell: AUDIO_PIXEL_TICKS,
    colorToSlot: Object.fromEntries(palette.map((slot) => [`rgba-${rgbaHex(colorRgba(slot.color))}`, slot.slotId]))
  };
}

export function resizePxdAudioWorkingImage(image, link, width) {
  if (!AUDIO_PIXEL_COLUMN_OPTIONS.includes(width) || !image || image.height !== AUDIO_PIXEL_PITCHES.length || image.rgba?.length !== image.width * image.height * 4 || link?.width !== image.width || link.height !== image.height) throw new TypeError('音楽用画像のサイズを変更できません。元画像は保持されています。');
  const next = new Uint8Array(width * image.height * 4); const copyWidth = Math.min(image.width, width);
  for (let y = 0; y < image.height; y += 1) next.set(image.rgba.subarray(y * image.width * 4, (y * image.width + copyWidth) * 4), y * width * 4);
  return { image: { width, height: image.height, rgba: next }, link: { ...link, width, height: image.height, sourceMapping: { ...(link.sourceMapping || {}), canvasWidth: width, canvasHeight: image.height, resizeRule: 'left-anchor-v1' } } };
}

export async function writePxdAudioState(project, song, { image = audioSongImage(song), link = audioCellLink(song) } = {}) {
  assertPxdAudioPixelCompatibility(song);
  assertLinkedCellSong(song, link, image);
  assertImageNotesMatch(song, link, image);
  let next = project || createPxdProject();
  next = optionalJson(next, AUDIO_STATE_PATH) === null
    ? setPxdJson(next, AUDIO_STATE_PATH, clone(song))
    : mergePxdJson(next, AUDIO_STATE_PATH, clone(song));
  next = optionalJson(next, AUDIO_LINK_PATH) === null
    ? setPxdJson(next, AUDIO_LINK_PATH, clone(link))
    : mergePxdJson(next, AUDIO_LINK_PATH, clone(link));
  next = await putPxdImage(next, image, AUDIO_IMAGE_ROLE);
  return next;
}

/** Build a temporary Draw-shaped input without resizing or reducing RGBA colors. */
export function pxdImageToAudioDocument(image) {
  if (!image || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1 || image.width * image.height > 2 * 1024 * 1024 || !(image.rgba instanceof Uint8Array || image.rgba instanceof Uint8ClampedArray) || image.rgba.length !== image.width * image.height * 4) {
    throw new RangeError('この画像サイズは音楽キャンバスに取り込めません。原本はPXD内に保持されています。');
  }
  const palette = []; const colorToIndex = new Map(); const pixels = new Array(image.width * image.height);
  for (let index = 0; index < pixels.length; index += 1) {
    const rgba = image.rgba.subarray(index * 4, index * 4 + 4); const colorKey = rgbaHex(rgba);
    if (colorKey === '00000000') { pixels[index] = -1; continue; }
    if (!colorToIndex.has(colorKey)) {
      colorToIndex.set(colorKey, palette.length); palette.push(`#${colorKey}`);
    }
    pixels[index] = colorToIndex.get(colorKey);
  }
  if (!palette.length) palette.push('#00000000');
  return { schemaVersion: 1, width: image.width, height: image.height, palette, pixels };
}

export function preparePxdAudioImageImport(song, image) {
  const document = pxdImageToAudioDocument(image);
  const width = audioPixelColumns(song); const height = AUDIO_PIXEL_PITCHES.length;
  if (!AUDIO_PIXEL_COLUMN_OPTIONS.includes(width)) throw new RangeError('音楽用キャンバスの列数に対応していません。PXD原本は保持されています。');
  let importedSong = resizeAudioCanvas(song, width);
  const scale = Math.min(width / image.width, height / image.height);
  const copiedWidth = Math.max(1, Math.min(width, Math.round(image.width * scale)));
  const copiedHeight = Math.max(1, Math.min(height, Math.round(image.height * scale)));
  const left = Math.floor((width - copiedWidth) / 2); const top = Math.floor((height - copiedHeight) / 2);
  const workingRgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < copiedHeight; y += 1) for (let x = 0; x < copiedWidth; x += 1) {
    const sx = Math.min(image.width - 1, Math.floor((x + 0.5) * image.width / copiedWidth));
    const sy = Math.min(image.height - 1, Math.floor((y + 0.5) * image.height / copiedHeight));
    const sourceOffset = (sy * image.width + sx) * 4; const targetOffset = ((top + y) * width + left + x) * 4;
    workingRgba.set(image.rgba.subarray(sourceOffset, sourceOffset + 4), targetOffset);
  }
  const colorToSlot = Object.create(null); const slotIds = importedSong.pixelPalette.map((slot) => slot.slotId);
  const firstSeen = new Map();
  for (let offset = 0; offset < workingRgba.length; offset += 4) if (workingRgba[offset + 3] !== 0) {
    const key = `rgba-${rgbaHex(workingRgba.subarray(offset, offset + 4))}`;
    firstSeen.set(key, (firstSeen.get(key) || 0) + 1);
  }
  const ranked = [...firstSeen].map(([key, count], order) => ({ key, count, order })).sort((a, b) => b.count - a.count || a.order - b.order);
  ranked.forEach(({ key }, index) => { colorToSlot[key] = index < slotIds.length ? slotIds[index] : null; });
  const tracks = importedSong.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip, notes: clip.notes.filter((note) => !AUDIO_PIXEL_PITCHES.includes(note.pitch)) })) }));
  const tracksBySlot = new Map(tracks.map((track) => [track.instrument, track]));
  let sequence = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4; if (workingRgba[offset + 3] === 0) continue;
    const slotId = colorToSlot[`rgba-${rgbaHex(workingRgba.subarray(offset, offset + 4))}`]; if (!slotId) continue;
    const track = tracksBySlot.get(slotId); const tick = x * AUDIO_PIXEL_TICKS;
    const clip = track?.clips.find((item) => tick >= item.startTick && tick + AUDIO_PIXEL_TICKS <= item.startTick + item.lengthTicks);
    if (clip) clip.notes.push({ noteId: `pxd-image-${song.songId}-${++sequence}`, pitch: AUDIO_PIXEL_PITCHES[y], startTick: tick, durationTicks: AUDIO_PIXEL_TICKS, velocity: 96, colorId: `rgba-${rgbaHex(workingRgba.subarray(offset, offset + 4))}` });
  }
  importedSong = validateAudioSong({ ...importedSong, tracks });
  const link = { rulesVersion: 'pixel-cell-v1', imageRole: AUDIO_IMAGE_ROLE, width, height, rowPitchMap: [...AUDIO_PIXEL_PITCHES], ticksPerCell: AUDIO_PIXEL_TICKS, colorToSlot, sourceMapping: { sourceWidth: image.width, sourceHeight: image.height, copiedWidth, copiedHeight, x: left, y: top, rule: 'nearest-fit-v1' } };
  return { song: importedSong, image: { width, height, rgba: workingRgba }, link, document, workingDocument: pxdImageToAudioDocument({ width, height, rgba: workingRgba }) };
}

export function assignPxdAudioColor(song, image, link, colorId, slotId) {
  assertLinkedCellSong(song, link, image);
  if (!/^rgba-[a-f\d]{8}$/i.test(colorId) || !Object.hasOwn(link.colorToSlot, colorId)) throw new TypeError('画像の色を選び直してください。');
  if (slotId !== null && !song.pixelPalette.some((slot) => slot.slotId === slotId)) throw new TypeError('音色の割り当て先を確認してください。');
  const nextLink = { ...link, colorToSlot: { ...link.colorToSlot, [colorId]: slotId } };
  return { song: rebuildLinkedPixelNotes(song, image, nextLink), link: nextLink };
}

function rebuildLinkedPixelNotes(song, image, link) {
  const old = new Map();
  for (const track of song.tracks) for (const clip of track.clips) for (const note of clip.notes) if (AUDIO_PIXEL_PITCHES.includes(note.pitch) && note.startTick % AUDIO_PIXEL_TICKS === 0 && note.durationTicks === AUDIO_PIXEL_TICKS) old.set(`${note.pitch}:${note.startTick}`, { track, note });
  const tracks = song.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip, notes: clip.notes.filter((note) => !AUDIO_PIXEL_PITCHES.includes(note.pitch)) })) }));
  const bySlot = new Map(tracks.map((track) => [track.instrument, track])); const width = image.width;
  for (let index = 0; index < image.rgba.length / 4; index += 1) {
    const offset = index * 4; const bytes = image.rgba.subarray(offset, offset + 4); if (bytes[3] === 0) continue;
    const colorId = `rgba-${rgbaHex(bytes)}`; const slotId = link.colorToSlot[colorId]; if (!slotId) continue;
    const row = Math.floor(index / width); const x = index % width; const pitch = AUDIO_PIXEL_PITCHES[row]; const tick = x * AUDIO_PIXEL_TICKS;
    const track = bySlot.get(slotId); const clip = track?.clips.find((item) => tick >= item.startTick && tick + AUDIO_PIXEL_TICKS <= item.startTick + item.lengthTicks);
    if (!clip) throw new RangeError('曲に対応するセルがありません。画像の色割り当ては変更していません。');
    const prior = old.get(`${pitch}:${tick}`); const reusable = prior?.track.instrument === slotId ? prior.note : prior?.note;
    clip.notes.push({ ...(reusable || {}), noteId: reusable?.noteId || `pxd-image-${song.songId}-${pitch}-${tick}`, pitch, startTick: tick, durationTicks: AUDIO_PIXEL_TICKS, velocity: reusable?.velocity || 96, colorId });
  }
  return validateAudioSong({ ...song, tracks });
}

function assertImageNotesMatch(song, link, image) {
  const pixels = audioSongPixels(song); const colorToSlot = link.colorToSlot;
  for (let index = 0; index < pixels.pixels.length; index += 1) {
    const offset = index * 4; const rgba = image.rgba.subarray(offset, offset + 4);
    const slotId = rgba[3] === 0 ? null : (colorToSlot[`rgba-${rgbaHex(rgba)}`] ?? null);
    const expected = slotId === null ? -1 : song.pixelPalette.findIndex((slot) => slot.slotId === slotId);
    if (pixels.pixels[index] !== expected) throw new TypeError('音楽用画像の色割り当てと音符が一致しません。PXDは変更されていません。');
  }
}

function assertLinkedCellSong(song, link, image) {
  assertPxdAudioPixelCompatibility(song);
  if (link?.rulesVersion !== 'pixel-cell-v1' || link.imageRole !== AUDIO_IMAGE_ROLE || link.width !== image.width || link.height !== image.height || link.width !== audioPixelColumns(song) || link.height !== AUDIO_PIXEL_PITCHES.length || link.ticksPerCell !== AUDIO_PIXEL_TICKS || JSON.stringify(link.rowPitchMap) !== JSON.stringify(AUDIO_PIXEL_PITCHES)) throw new TypeError('この曲は同じ大きさのセル連携に対応していません。曲と原本は変更しません。');
  const occupied = new Set();
  for (const track of song.tracks) for (const clip of track.clips) for (const note of clip.notes) {
    const key = `${note.pitch}:${note.startTick}`;
    if (occupied.has(key)) throw new TypeError('同じセルに複数の音符があり、連携できません。曲と原本は変更しません。');
    occupied.add(key);
  }
  if (!link.colorToSlot || typeof link.colorToSlot !== 'object' || Array.isArray(link.colorToSlot)) throw new TypeError('色と音の対応が壊れています。曲と原本は変更しません。');
  for (const slotId of Object.values(link.colorToSlot)) if (slotId !== null && !song.pixelPalette.some((slot) => slot.slotId === slotId)) throw new TypeError('画像色の音色割り当てが壊れています。曲と原本は変更しません。');
}

function trackAtSlot(song, slotId) { return song.tracks.find((track) => track.instrument === slotId); }
function updateCell(song, pitch, tick, slotId, colorId = undefined) {
  const track = slotId === null ? null : trackAtSlot(song, slotId);
  if (slotId !== null && !track) throw new TypeError('画像色に対応する音色がありません。曲と原本は変更しません。');
  let foundClip = slotId === null;
  const tracks = song.tracks.map((candidate) => ({
    ...candidate,
    clips: candidate.clips.map((clip) => {
      const contains = tick >= clip.startTick && tick + AUDIO_PIXEL_TICKS <= clip.startTick + clip.lengthTicks;
      if (candidate.trackId === track?.trackId && contains) foundClip = true;
      const notes = clip.notes.filter((note) => !(note.pitch === pitch && note.startTick === tick));
      if (candidate.trackId === track?.trackId && contains) notes.push({ noteId: `draw-sync-${song.songId}-${pitch}-${tick}`, pitch, startTick: tick, durationTicks: AUDIO_PIXEL_TICKS, velocity: 96, ...(colorId ? { colorId } : {}) });
      return { ...clip, notes };
    })
  }));
  if (!foundClip) throw new RangeError('曲に対応するセルがありません。曲と原本は変更しません。');
  return validateAudioSong({ ...song, tracks });
}

/** Update only cells changed in the selected linked Draw image; reject old/complex DAW notes untouched. */
export async function synchronizeLinkedAudioImage(project, document, role = 'main') {
  validateDrawDocument(document);
  const link = optionalJson(project, AUDIO_LINK_PATH);
  if (!link || role !== link.imageRole) return project;
  const before = await readPxdImage(project, role); const storedSong = readPxdAudioState(project);
  if (!before || !storedSong) throw new TypeError('連携した画像または曲が見つかりません。');
  assertLinkedCellSong(storedSong, link, before);
  if (before.width !== document.width || before.height !== document.height) throw new RangeError('元画像と描画サイズが異なるためセル連携できません。曲と原本は変更しません。');
  const after = documentRgba(document); let changed = false;
  for (let index = 0; index < before.width * before.height; index += 1) {
    const offset = index * 4; let different = false;
    for (let channel = 0; channel < 4; channel += 1) if (before.rgba[offset + channel] !== after[offset + channel]) { different = true; break; }
    if (!different) continue;
    const rgbaKey = `rgba-${rgbaHex(after.subarray(offset, offset + 4))}`;
    if (after[offset + 3] !== 0 && !Object.hasOwn(link.colorToSlot, rgbaKey)) link.colorToSlot[rgbaKey] = null;
    changed = true;
  }
  if (!changed) return project;
  const song = rebuildLinkedPixelNotes(storedSong, { width: document.width, height: document.height, rgba: after }, link);
  let next = mergePxdJson(project, AUDIO_STATE_PATH, song);
  next = mergePxdJson(next, AUDIO_LINK_PATH, link);
  next = await putPxdImage(next, { width: document.width, height: document.height, rgba: after }, role);
  return next;
}

export async function drawDocumentFromPxdImage(image) {
  return imageToDrawDocument(image);
}
