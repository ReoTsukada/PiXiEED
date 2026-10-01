import { createPxdProject, getPxdJson, setPxdJson } from './pxd-codec.mjs';
import {
  imageToDrawDocument, mergePxdJson, putPxdDrawDocument, putPxdImage,
  readPxdDrawDocument as readProjectDrawDocument, readPxdImage,
  readPxdSharedImage, putPxdSharedImage
} from './pxd-project.mjs?rev=20260930-shared-canvas-5';
import { AUDIO_PIXEL_PITCHES, AUDIO_PIXEL_TICKS, AUDIO_PIXEL_COLUMN_OPTIONS, AUDIO_PIXEL_PALETTE, AUDIO_SHARED_IMAGE_MAX_DIMENSION, audioPixelColumns, audioSongPixels, createAudioRowPitchMap, extendAudioLoopForImage, resizeAudioCanvas, validateAudioSharedImage, validateAudioSong } from './audio-core.mjs?rev=20260930-audio-timebase-1';
import { DRAW_SIZES, documentRgba, validateDrawDocument } from './draw-core.mjs?rev=20260930-shared-canvas-5';
import { AUDIO_ANIMATION_LINK_VERSION, createAudioAnimationLink, validateAudioAnimationBinding } from './audio-animation.mjs?rev=20261001-audio-animation-1';

const AUDIO_STATE_PATH = 'audio/state.json';
const AUDIO_LINK_PATH = 'audio/link.json';
const AUDIO_IMAGE_ROLE = 'audio';
const SHARED_IMAGE_ROLE = 'main';
const sharedImageColorCounts = new WeakMap();
const clone = (value) => structuredClone(value);
const rgbaHex = (rgba) => [...rgba].map((byte) => byte.toString(16).padStart(2, '0')).join('');
const colorRgba = (color) => {
  const hex = color.slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).concat(hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) : 255);
};
function imageColorCounts(image) {
  let counts = sharedImageColorCounts.get(image);
  if (counts) return counts;
  counts = new Map();
  for (let offset = 0; offset < image.rgba.length; offset += 4) {
    const key = rgbaHex(image.rgba.subarray(offset, offset + 4));
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  sharedImageColorCounts.set(image, counts); image.colorCount = counts.size;
  return counts;
}
function optionalJson(project, path) {
  if (!project?.entries?.some((entry) => entry.path === path)) return null;
  return getPxdJson(project, path);
}
function sameImage(left, right) {
  return Boolean(left && right && left.width === right.width && left.height === right.height
    && left.rgba?.length === right.rgba?.length
    && left.rgba.every((value, index) => value === right.rgba[index]));
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

/** Freeze a legacy main-linked music image into its own PXD role without changing its pixels. */
export async function detachPxdAudioImage(project) {
  const link = readPxdAudioLink(project); const song = readPxdAudioState(project);
  if (!song || link?.rulesVersion !== 'shared-canvas-v1' || link.imageRole !== SHARED_IMAGE_ROLE) return project;
  const main = await readPxdSharedImage(project);
  if (!main) throw new TypeError('音楽が参照するmain画像がありません。PXDは変更していません。');
  assertSharedAudioBinding(song, main, link);
  const existing = await readPxdImage(project, AUDIO_IMAGE_ROLE);
  if (existing && !sameImage(existing, main)) throw new TypeError('音楽用画像が既にあり、main画像と異なります。上書きせずPXDを保持しました。');
  let next = existing ? project : await putPxdImage(project, main, AUDIO_IMAGE_ROLE);
  const detachedLink = { ...link, imageRole: AUDIO_IMAGE_ROLE };
  assertSharedAudioBinding(song, existing || main, detachedLink);
  next = mergePxdJson(next, AUDIO_LINK_PATH, detachedLink);
  return next;
}

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

/** Create a link to the PXD's original main image. The audio layer stores only mappings and notes. */
export function sharedAudioCellLink(song, image, { rowPitchMap = createAudioRowPitchMap(image?.height), colorToSlot = null, imageRole = AUDIO_IMAGE_ROLE } = {}) {
  validateAudioSharedImage(image, rowPitchMap);
  if (![AUDIO_IMAGE_ROLE, SHARED_IMAGE_ROLE].includes(imageRole)) throw new TypeError('音楽画像の参照先が不正です');
  if (song.loopTicks < image.width * AUDIO_PIXEL_TICKS) throw new RangeError('画像の横幅に対して曲の長さが不足しています');
  const mapping = rankSharedImageColors(image, (song.pixelPalette || AUDIO_PIXEL_PALETTE).map((slot) => slot.slotId), colorToSlot);
  return {
    rulesVersion: 'shared-canvas-v1', imageRole,
    width: image.width, height: image.height, rowPitchMap: [...rowPitchMap],
    colorToSlot: mapping, ticksPerCell: AUDIO_PIXEL_TICKS
  };
}

function rankSharedImageColors(image, slotIds, existingMapping = null) {
  const counts = new Map();
  for (let offset = 0; offset < image.rgba.length; offset += 4) {
    if (!image.rgba[offset + 3]) continue;
    const key = `rgba-${rgbaHex(image.rgba.subarray(offset, offset + 4))}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const mapped = [...counts].sort((a, b) => b[1] - a[1]).map(([key], index) => [key, existingMapping ? existingMapping[key] ?? null : slotIds[index] || null]);
  // Palette colors without painted pixels remain available after a PXD round trip.
  if (existingMapping) for (const [key, slotId] of Object.entries(existingMapping)) {
    if (!counts.has(key) && /^rgba-[a-f\d]{8}$/i.test(key) && !key.endsWith('00') && (slotId === null || slotIds.includes(slotId))) mapped.push([key, slotId]);
  }
  return Object.fromEntries(mapped);
}

function sharedSlotRgba(song, link, slotId) {
  const colorId = Object.entries(link.colorToSlot).find(([, mapped]) => mapped === slotId)?.[0];
  if (/^rgba-[0-9a-f]{8}$/i.test(colorId || '')) return colorId.slice(5).match(/../g).map((byte) => Number.parseInt(byte, 16));
  return colorRgba((song.pixelPalette || AUDIO_PIXEL_PALETTE).find((slot) => slot.slotId === slotId).color);
}

function sharedCellTicks(song, x, width, link) {
  if (link.ticksPerCell === AUDIO_PIXEL_TICKS && song.loopTicks >= width * AUDIO_PIXEL_TICKS) {
    return { startTick: x * AUDIO_PIXEL_TICKS, durationTicks: AUDIO_PIXEL_TICKS };
  }
  // Read older PXD links using their original compressed timing until import migrates them.
  const startTick = Math.floor(x * song.loopTicks / width);
  const endTick = Math.floor((x + 1) * song.loopTicks / width);
  return { startTick, durationTicks: Math.max(1, endTick - startTick) };
}

function sharedImageNotes(song, image, link, { preserve = true } = {}) {
  validateAudioSharedImage(image, link.rowPitchMap);
  if (link.rulesVersion !== 'shared-canvas-v1' || ![AUDIO_IMAGE_ROLE, SHARED_IMAGE_ROLE].includes(link.imageRole) || link.width !== image.width || link.height !== image.height || !link.colorToSlot || typeof link.colorToSlot !== 'object' || Array.isArray(link.colorToSlot)) throw new TypeError('共有画像と音楽の連携情報が一致しません');
  const prior = new Map();
  if (preserve) for (const track of song.tracks) for (const clip of track.clips) for (const note of clip.notes) {
    const cell = note.sourceCell;
    if (cell && Number.isInteger(cell.x) && Number.isInteger(cell.y)) prior.set(`${cell.x}:${cell.y}`, note);
  }
  const tracks = song.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip, notes: clip.notes.filter((note) => !note.sourceCell) })) }));
  const tracksBySlot = new Map(tracks.map((track) => [track.instrument, track]));
  const usedNoteIds = new Set(song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes.map((note) => note.noteId))));
  let sequence = 0;
  for (let y = 0; y < image.height; y += 1) {
    const pitch = link.rowPitchMap[y]; if (pitch === null) continue;
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4; if (!image.rgba[offset + 3]) continue;
      const colorId = `rgba-${rgbaHex(image.rgba.subarray(offset, offset + 4))}`;
      const slotId = link.colorToSlot[colorId]; if (!slotId) continue;
      const track = tracksBySlot.get(slotId); if (!track) throw new TypeError('画像色の音色割り当てが不正です');
      const { startTick, durationTicks } = sharedCellTicks(song, x, image.width, link);
      const clip = track.clips.find((item) => startTick >= item.startTick && startTick + durationTicks <= item.startTick + item.lengthTicks);
      if (!clip) throw new RangeError('共有画像の横幅を曲のループへ配置できません');
      const old = prior.get(`${x}:${y}`);
      let noteId = old?.noteId;
      if (!noteId) {
        do { noteId = `shared-${song.songId}-${++sequence}`; } while (usedNoteIds.has(noteId));
        usedNoteIds.add(noteId);
      }
      clip.notes.push({ ...(old || {}), noteId, pitch, startTick, durationTicks, velocity: old?.velocity || 96, colorId, sourceCell: { x, y } });
    }
  }
  return validateAudioSong({ ...song, tracks });
}

export function prepareSharedAudioImageImport(song, image, options = {}) {
  if (image?.rgba instanceof Uint8ClampedArray) image = { ...image, rgba: new Uint8Array(image.rgba) };
  validateAudioSharedImage(image, options.rowPitchMap || createAudioRowPitchMap(image?.height));
  imageColorCounts(image);
  const document = pxdImageToAudioDocument(image);
  const rowPitchMap = options.rowPitchMap || createAudioRowPitchMap(image.height);
  const fittedSong = extendAudioLoopForImage(song, image.width);
  const imageRole = options.imageRole ?? AUDIO_IMAGE_ROLE;
  const link = sharedAudioCellLink(fittedSong, image, { rowPitchMap, colorToSlot: options.colorToSlot, imageRole });
  const nextSong = sharedImageNotes(fittedSong, image, link);
  return { song: nextSong, image, link, document, workingDocument: document };
}

export function setSharedAudioCell(song, image, link, { x, y, slotId = null, colorId = null, active = true } = {}) {
  validateAudioSong(song); validateAudioSharedImage(image, link?.rowPitchMap);
  if (link?.rulesVersion !== 'shared-canvas-v1' || ![AUDIO_IMAGE_ROLE, SHARED_IMAGE_ROLE].includes(link.imageRole) || link.width !== image.width || link.height !== image.height) throw new TypeError('共有画像と音楽の連携情報が一致しません');
  if (!Number.isInteger(x) || x < 0 || x >= image.width || !Number.isInteger(y) || y < 0 || y >= image.height) throw new RangeError('選択した画像セルが範囲外です');
  if (slotId !== null && !(song.pixelPalette || AUDIO_PIXEL_PALETTE).some((slot) => slot.slotId === slotId)) throw new TypeError('音色の割り当て先を確認してください');
  if (colorId !== null && (!/^rgba-[a-f\d]{8}$/i.test(colorId) || !Object.hasOwn(link.colorToSlot, colorId) || link.colorToSlot[colorId] !== slotId || colorId.endsWith('00'))) throw new TypeError('描く色と音の割り当てを確認してください');
  const nextImage = { ...image, rgba: new Uint8Array(image.rgba) };
  const nextCounts = new Map(imageColorCounts(image));
  const nextLink = clone(link); const offset = (y * image.width + x) * 4;
  const previousKey = rgbaHex(nextImage.rgba.subarray(offset, offset + 4));
  const targetBytes = !active ? [0, 0, 0, 0] : colorId !== null
    ? colorId.slice(5).match(/../g).map((byte) => Number.parseInt(byte, 16))
    : slotId === null ? [0, 0, 0, 0] : sharedSlotRgba(song, nextLink, slotId);
  const targetKey = rgbaHex(targetBytes);
  if (previousKey !== targetKey) {
    const previousCount = nextCounts.get(previousKey) || 0;
    if (previousCount <= 1) nextCounts.delete(previousKey); else nextCounts.set(previousKey, previousCount - 1);
    nextCounts.set(targetKey, (nextCounts.get(targetKey) || 0) + 1);
  }
  if (!active || (slotId === null && colorId === null)) nextImage.rgba.set([0, 0, 0, 0], offset);
  else {
    nextImage.rgba.set(targetBytes, offset);
    nextLink.colorToSlot[`rgba-${targetKey}`] = slotId;
  }
  nextImage.colorCount = nextCounts.size;
  sharedImageColorCounts.set(nextImage, nextCounts);
  const prior = song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes.filter((note) => note.sourceCell?.x === x && note.sourceCell?.y === y).map((note) => ({ track, note })))).at(0);
  const pitch = nextLink.rowPitchMap[y];
  const { startTick, durationTicks } = sharedCellTicks(song, x, image.width, link);
  let placed = false;
  const tracks = song.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => {
    const notes = clip.notes.filter((note) => !(note.sourceCell?.x === x && note.sourceCell?.y === y));
    if (active && slotId !== null && track.instrument === slotId && pitch !== null && startTick >= clip.startTick && startTick + durationTicks <= clip.startTick + clip.lengthTicks) {
      notes.push({ ...(prior?.note || {}), noteId: prior?.note.noteId || `shared-${song.songId}-${x}-${y}`, pitch, startTick, durationTicks, velocity: prior?.note.velocity || 96, colorId: `rgba-${rgbaHex(nextImage.rgba.subarray(offset, offset + 4))}`, sourceCell: { x, y } });
      placed = true;
    }
    return { ...clip, notes };
  }) }));
  if (active && slotId !== null && !placed) throw new RangeError('共有画像のセルを曲のループへ配置できません');
  return { image: nextImage, link: nextLink, song: validateAudioSong({ ...song, tracks }) };
}

export function resizePxdAudioWorkingImage(image, link, width) {
  if (!AUDIO_PIXEL_COLUMN_OPTIONS.includes(width) || !image || image.height !== AUDIO_PIXEL_PITCHES.length || image.rgba?.length !== image.width * image.height * 4 || link?.width !== image.width || link.height !== image.height) throw new TypeError('音楽用画像のサイズを変更できません。元画像は保持されています。');
  const next = new Uint8Array(width * image.height * 4); const copyWidth = Math.min(image.width, width);
  for (let y = 0; y < image.height; y += 1) next.set(image.rgba.subarray(y * image.width * 4, (y * image.width + copyWidth) * 4), y * width * 4);
  return { image: { width, height: image.height, rgba: next }, link: { ...link, width, height: image.height, sourceMapping: { ...(link.sourceMapping || {}), canvasWidth: width, canvasHeight: image.height, resizeRule: 'left-anchor-v1' } } };
}

export async function writePxdAudioState(project, song, { image = null, link = audioCellLink(song), animation = null } = {}) {
  if (link?.rulesVersion === AUDIO_ANIMATION_LINK_VERSION) {
    if (!animation) throw new TypeError('音楽用アニメーションがありません。PXDは変更していません。');
    validateAudioAnimationBinding(song, animation, link);
    let next = project || createPxdProject();
    next = optionalJson(next, AUDIO_STATE_PATH) === null
      ? setPxdJson(next, AUDIO_STATE_PATH, clone(song))
      : mergePxdJson(next, AUDIO_STATE_PATH, clone(song));
    next = optionalJson(next, AUDIO_LINK_PATH) === null
      ? setPxdJson(next, AUDIO_LINK_PATH, clone(link))
      : mergePxdJson(next, AUDIO_LINK_PATH, clone(link));
    return next;
  }
  image ||= audioSongImage(song);
  if (link?.rulesVersion === 'shared-canvas-v1') {
    let next = project || createPxdProject();
    if (![AUDIO_IMAGE_ROLE, SHARED_IMAGE_ROLE].includes(link.imageRole)) throw new TypeError('音楽画像の参照先が不正です');
    assertSharedAudioBinding(song, image, link);
    if (link.imageRole === SHARED_IMAGE_ROLE) {
      const shared = await readPxdSharedImage(next);
      if (!shared || !sameImage(shared, image)) throw new TypeError('main画像は音楽から更新できません。画像を音楽用へ複製してから保存してください。');
    } else {
      next = await putPxdImage(next, image, AUDIO_IMAGE_ROLE);
    }
    next = optionalJson(next, AUDIO_STATE_PATH) === null
      ? setPxdJson(next, AUDIO_STATE_PATH, clone(song))
      : mergePxdJson(next, AUDIO_STATE_PATH, clone(song));
    next = optionalJson(next, AUDIO_LINK_PATH) === null
      ? setPxdJson(next, AUDIO_LINK_PATH, clone(link))
      : mergePxdJson(next, AUDIO_LINK_PATH, clone(link));
    return next;
  }
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

/** Keep the audio-role link valid when the shared animation changes elsewhere. */
export async function updatePxdAudioAnimationLink(project, animation) {
  const song = readPxdAudioState(project);
  if (!song) return project;
  const prior = readPxdAudioLink(project);
  const colors = prior?.rulesVersion === AUDIO_ANIMATION_LINK_VERSION ? prior.colorToSlot : null;
  const rowPitchMap = prior?.rulesVersion === AUDIO_ANIMATION_LINK_VERSION && prior.rowPitchMap?.length === animation.height ? prior.rowPitchMap : null;
  const link = createAudioAnimationLink(song, animation, { colorToSlot: colors, rowPitchMap, projectionReady: false });
  return writePxdAudioState(project, song, { link, animation });
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

function assertSharedAudioBinding(song, image, link) {
  validateAudioSharedImage(image, link?.rowPitchMap);
  if (link?.rulesVersion !== 'shared-canvas-v1' || ![AUDIO_IMAGE_ROLE, SHARED_IMAGE_ROLE].includes(link.imageRole) || link.width !== image.width || link.height !== image.height || !link.colorToSlot || typeof link.colorToSlot !== 'object') throw new TypeError('共有画像と音楽の連携情報が一致しません');
  const expected = new Map();
  for (let y = 0; y < image.height; y += 1) {
    const pitch = link.rowPitchMap[y]; if (pitch === null) continue;
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4; if (!image.rgba[offset + 3]) continue;
      const colorId = `rgba-${rgbaHex(image.rgba.subarray(offset, offset + 4))}`;
      const slotId = link.colorToSlot[colorId]; if (!slotId) continue;
      const { startTick, durationTicks } = sharedCellTicks(song, x, image.width, link);
      const key = `${x}:${y}`; expected.set(key, { pitch, startTick, durationTicks, slotId, colorId });
    }
  }
  const actual = new Map();
  for (const track of song.tracks) for (const clip of track.clips) for (const note of clip.notes) if (note.sourceCell) {
    const { x, y } = note.sourceCell;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= image.width || y < 0 || y >= image.height || actual.has(`${x}:${y}`)) throw new TypeError('音符の画像位置が重複または範囲外です');
    actual.set(`${x}:${y}`, { pitch: note.pitch, startTick: note.startTick, durationTicks: note.durationTicks, slotId: track.instrument, colorId: note.colorId });
  }
  if (expected.size !== actual.size) throw new TypeError('共有画像の色割り当てと音符が一致しません');
  for (const [key, cell] of expected) {
    const note = actual.get(key);
    if (!note || note.pitch !== cell.pitch || note.startTick !== cell.startTick || note.durationTicks !== cell.durationTicks || note.slotId !== cell.slotId || note.colorId !== cell.colorId) throw new TypeError('共有画像の色割り当てと音符が一致しません');
  }
  return song;
}

export function assignPxdAudioColor(song, image, link, colorId, slotId) {
  if (link?.rulesVersion === 'shared-canvas-v1') {
    assertSharedAudioBinding(song, image, link);
    if (!/^rgba-[a-f\d]{8}$/i.test(colorId) || !Object.hasOwn(link.colorToSlot, colorId)) throw new TypeError('画像の色を選び直してください。');
    if (slotId !== null && !song.pixelPalette.some((slot) => slot.slotId === slotId)) throw new TypeError('音色の割り当て先を確認してください。');
    const nextLink = { ...link, colorToSlot: { ...link.colorToSlot, [colorId]: slotId } };
    return { song: sharedImageNotes(song, image, nextLink), link: nextLink };
  }
  assertLinkedCellSong(song, link, image);
  if (!/^rgba-[a-f\d]{8}$/i.test(colorId) || !Object.hasOwn(link.colorToSlot, colorId)) throw new TypeError('画像の色を選び直してください。');
  if (slotId !== null && !song.pixelPalette.some((slot) => slot.slotId === slotId)) throw new TypeError('音色の割り当て先を確認してください。');
  const nextLink = { ...link, colorToSlot: { ...link.colorToSlot, [colorId]: slotId } };
  return { song: rebuildLinkedPixelNotes(song, image, nextLink), link: nextLink };
}

function rebuildLinkedPixelNotes(song, image, link) {
  if (link?.rulesVersion === 'shared-canvas-v1') return sharedImageNotes(song, image, link);
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
  if (link?.rulesVersion === 'shared-canvas-v1') return assertSharedAudioBinding(song, image, link);
  const pixels = audioSongPixels(song); const colorToSlot = link.colorToSlot;
  for (let index = 0; index < pixels.pixels.length; index += 1) {
    const offset = index * 4; const rgba = image.rgba.subarray(offset, offset + 4);
    const slotId = rgba[3] === 0 ? null : (colorToSlot[`rgba-${rgbaHex(rgba)}`] ?? null);
    const expected = slotId === null ? -1 : song.pixelPalette.findIndex((slot) => slot.slotId === slotId);
    if (pixels.pixels[index] !== expected) throw new TypeError('音楽用画像の色割り当てと音符が一致しません。PXDは変更されていません。');
  }
}

function assertLinkedCellSong(song, link, image) {
  if (link?.rulesVersion === 'shared-canvas-v1') {
    validateAudioSong(song);
    validateAudioSharedImage(image, link.rowPitchMap);
    if (![AUDIO_IMAGE_ROLE, SHARED_IMAGE_ROLE].includes(link.imageRole) || link.width !== image.width || link.height !== image.height || link.width > AUDIO_SHARED_IMAGE_MAX_DIMENSION || link.height > AUDIO_SHARED_IMAGE_MAX_DIMENSION) throw new TypeError('共有画像と音楽の連携情報が一致しません');
    for (const slotId of Object.values(link.colorToSlot || {})) if (slotId !== null && !song.pixelPalette.some((slot) => slot.slotId === slotId)) throw new TypeError('画像色の音色割り当てが壊れています。');
    return;
  }
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
  const link = optionalJson(project, AUDIO_LINK_PATH);
  if (!link) return project;
  const storedSong = readPxdAudioState(project);
  if (link.rulesVersion === 'shared-canvas-v1') {
    if (role === SHARED_IMAGE_ROLE && link.imageRole === SHARED_IMAGE_ROLE) {
      const beforeMain = await readPxdSharedImage(project);
      let candidate;
      if (document?.rgba instanceof Uint8Array || document?.rgba instanceof Uint8ClampedArray) candidate = { width: document.width, height: document.height, rgba: new Uint8Array(document.rgba) };
      else { validateDrawDocument(document); candidate = { width: document.width, height: document.height, rgba: documentRgba(document) }; }
      if (!candidate || !Number.isInteger(candidate.width) || !Number.isInteger(candidate.height) || candidate.rgba.length !== candidate.width * candidate.height * 4) throw new TypeError('編集後のmain画像を確認できません。PXDは変更していません。');
      if (sameImage(beforeMain, candidate)) return project;
      return detachPxdAudioImage(project);
    }
    if (role !== link.imageRole) return project;
    const before = link.imageRole === SHARED_IMAGE_ROLE
      ? await readPxdSharedImage(project)
      : await readPxdImage(project, AUDIO_IMAGE_ROLE);
    if (!before || !storedSong) throw new TypeError('連携した共有画像または曲が見つかりません。');
    assertSharedAudioBinding(storedSong, before, link);
    let after;
    if (document?.rgba instanceof Uint8Array || document?.rgba instanceof Uint8ClampedArray) after = { width: document.width, height: document.height, rgba: new Uint8Array(document.rgba) };
    else { validateDrawDocument(document); after = { width: document.width, height: document.height, rgba: documentRgba(document) }; }
    if (!after || !Number.isInteger(after.width) || !Number.isInteger(after.height) || after.width < 1 || after.width > AUDIO_SHARED_IMAGE_MAX_DIMENSION || after.height < 1 || after.height > AUDIO_SHARED_IMAGE_MAX_DIMENSION || after.rgba.length !== after.width * after.height * 4) throw new RangeError('変更後の共有画像サイズが音楽連携の範囲外です');
    let changed = false; const nextLink = clone(link);
    if (before.width !== after.width || before.height !== after.height) changed = true;
    if (before.width === after.width && before.height === after.height) for (let index = 0; index < before.width * before.height; index += 1) {
      const offset = index * 4;
      for (let channel = 0; channel < 4; channel += 1) if (before.rgba[offset + channel] !== after.rgba[offset + channel]) { changed = true; break; }
    }
    nextLink.width = after.width; nextLink.height = after.height;
    nextLink.ticksPerCell = AUDIO_PIXEL_TICKS;
    if (nextLink.rowPitchMap.length !== after.height) nextLink.rowPitchMap = createAudioRowPitchMap(after.height);
    const afterColors = new Set();
    for (let index = 0; index < after.width * after.height; index += 1) {
      const offset = index * 4;
      if (after.rgba[offset + 3]) {
        const colorId = `rgba-${rgbaHex(after.rgba.subarray(offset, offset + 4))}`;
        afterColors.add(colorId);
      }
    }
    nextLink.colorToSlot = Object.fromEntries([...afterColors].map((colorId) => [colorId, link.colorToSlot?.[colorId] ?? null]));
    if (!changed && link.ticksPerCell === AUDIO_PIXEL_TICKS) return project;
    const song = sharedImageNotes(extendAudioLoopForImage(storedSong, after.width), after, nextLink);
    let next = mergePxdJson(project, AUDIO_STATE_PATH, song);
    next = mergePxdJson(next, AUDIO_LINK_PATH, nextLink);
    next = await putPxdImage(next, after, AUDIO_IMAGE_ROLE);
    return next;
  }
  if (role !== link.imageRole) return project;
  validateDrawDocument(document);
  const before = await readPxdImage(project, role);
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
