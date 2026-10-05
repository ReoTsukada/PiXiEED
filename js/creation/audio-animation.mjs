import { composeAnimationFrame, getAnimationCelDocument, validateAnimation, writeAnimationCel } from './animation-core.mjs';
import {
  AUDIO_PPQ, AUDIO_PIXEL_PALETTE, AUDIO_PIXEL_TICKS, AUDIO_SHARED_IMAGE_MAX_DIMENSION,
  createAudioRowPitchMap, extendAudioLoopForImage, validateAudioSong
} from './audio-core.mjs';

export const AUDIO_ANIMATION_LINK_VERSION = 'shared-animation-v1';
export const AUDIO_ANIMATION_MAX_NOTES = 100_000;
export const AUDIO_ANIMATION_MAX_COLORS = 32;

const rgbaId = (color) => `rgba-${color.slice(1).padEnd(8, 'f').toLowerCase()}`;

function validatePitchMap(rowPitchMap, height) {
  if (!Array.isArray(rowPitchMap) || rowPitchMap.length !== height) return false;
  for (let index = 0; index < height; index += 1) {
    const pitch = rowPitchMap[index];
    if (pitch !== null && (!Number.isInteger(pitch) || pitch < 0 || pitch > 127)) return false;
  }
  return true;
}

function normalizeFrameRowPitchMaps(animation, frameRowPitchMaps, { pruneStale = false } = {}) {
  if (frameRowPitchMaps === undefined || frameRowPitchMaps === null) return {};
  if (typeof frameRowPitchMaps !== 'object' || Array.isArray(frameRowPitchMaps)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(frameRowPitchMaps))) {
    throw new TypeError('フレームごとの音程対応が不正です。');
  }
  const frameIds = new Set(animation.frames.map(({ id }) => id));
  const maps = {};
  for (const [frameId, pitches] of Object.entries(frameRowPitchMaps)) {
    if (!frameIds.has(frameId)) {
      if (pruneStale) continue;
      throw new TypeError('フレームごとの音程対応に存在しないコマがあります。');
    }
    if (!validatePitchMap(pitches, animation.height)) throw new TypeError('フレームごとの音程対応が不正です。');
    Object.defineProperty(maps, frameId, { value: [...pitches], enumerable: true, configurable: true, writable: true });
  }
  return maps;
}

function normalizeFrameCellPitchMaps(animation, frameCellPitchMaps, { pruneStale = false } = {}) {
  if (frameCellPitchMaps === undefined || frameCellPitchMaps === null) return {};
  if (typeof frameCellPitchMaps !== 'object' || Array.isArray(frameCellPitchMaps)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(frameCellPitchMaps))) {
    throw new TypeError('セルごとの音程対応が不正です。');
  }
  const frameIds = new Set(animation.frames.map(({ id }) => id));
  const maps = {};
  for (const [frameId, cellMap] of Object.entries(frameCellPitchMaps)) {
    if (!frameIds.has(frameId)) {
      if (pruneStale) continue;
      throw new TypeError('セルごとの音程対応に存在しないコマがあります。');
    }
    if (!cellMap || typeof cellMap !== 'object' || Array.isArray(cellMap)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(cellMap))) {
      throw new TypeError('セルごとの音程対応が不正です。');
    }
    const normalizedCells = {};
    for (const [coordinate, pitch] of Object.entries(cellMap)) {
      const match = /^(0|[1-9]\d*):(0|[1-9]\d*)$/.exec(coordinate);
      const x = match ? Number(match[1]) : NaN;
      const y = match ? Number(match[2]) : NaN;
      if (!Number.isSafeInteger(x) || x < 0 || x >= animation.width || !Number.isSafeInteger(y) || y < 0 || y >= animation.height
          || !Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
        throw new TypeError('セルごとの音程対応が不正です。');
      }
      Object.defineProperty(normalizedCells, coordinate, { value: pitch, enumerable: true, configurable: true, writable: true });
    }
    if (Object.keys(normalizedCells).length) {
      Object.defineProperty(maps, frameId, { value: normalizedCells, enumerable: true, configurable: true, writable: true });
    }
  }
  return maps;
}

/** Resolve a frame-local axis while preserving the legacy shared-axis fallback. */
export function getAudioAnimationRowPitchMap(link, frameId) {
  const frameMaps = link?.frameRowPitchMaps;
  return frameId && frameMaps && Object.hasOwn(frameMaps, frameId)
    ? frameMaps[frameId]
    : link?.rowPitchMap ?? null;
}

/** Resolve a cell override before the frame-local or legacy row pitch. */
export function getAudioAnimationCellPitch(link, frameId, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  const frameMaps = link?.frameCellPitchMaps;
  const cells = frameMaps && Object.hasOwn(frameMaps, frameId) ? frameMaps[frameId] : null;
  const key = `${x}:${y}`;
  if (cells && Object.hasOwn(cells, key)) return cells[key];
  return getAudioAnimationRowPitchMap(link, frameId)?.[y] ?? null;
}

function validateSequenceLink(song, animation, { rowPitchMap, frameRowPitchMaps = {}, frameCellPitchMaps = {}, colorToSlot }) {
  if (!validatePitchMap(rowPitchMap, animation.height)) {
    throw new TypeError('アニメーションの行と音程の対応が不正です。');
  }
  normalizeFrameRowPitchMaps(animation, frameRowPitchMaps);
  normalizeFrameCellPitchMaps(animation, frameCellPitchMaps);
  if (!colorToSlot || typeof colorToSlot !== 'object' || Array.isArray(colorToSlot)) throw new TypeError('アニメーションの色と音色の対応が不正です。');
  const slotIds = new Set((song.pixelPalette || AUDIO_PIXEL_PALETTE).map(({ slotId }) => slotId));
  for (const [colorId, slotId] of Object.entries(colorToSlot)) {
    if (!/^rgba-[\da-f]{8}$/i.test(colorId) || colorId.endsWith('00') || (slotId !== null && !slotIds.has(slotId))) {
      throw new TypeError('アニメーションの色と音色の対応が不正です。');
    }
  }
}

export function createAudioAnimationLink(song, animation, { rowPitchMap = null, frameRowPitchMaps = null, frameCellPitchMaps = null, colorToSlot = null, projectionReady = false } = {}) {
  validateAudioSong(song); validateAnimation(animation);
  if (animation.width > AUDIO_SHARED_IMAGE_MAX_DIMENSION || animation.height > AUDIO_SHARED_IMAGE_MAX_DIMENSION) throw new RangeError('音楽に使えるアニメーションは256pxまでです。');
  if (animation.palette.length > AUDIO_ANIMATION_MAX_COLORS) throw new RangeError('音楽に使える色は32色までです。');
  const pitches = rowPitchMap || createAudioRowPitchMap(animation.height);
  const framePitches = normalizeFrameRowPitchMaps(animation, frameRowPitchMaps, { pruneStale: true });
  const cellPitches = normalizeFrameCellPitchMaps(animation, frameCellPitchMaps, { pruneStale: true });
  const mapping = { ...(colorToSlot || {}) };
  for (const color of animation.palette) { const id = rgbaId(color); if (!Object.hasOwn(mapping, id)) mapping[id] = null; }
  validateSequenceLink(song, animation, { rowPitchMap: pitches, frameRowPitchMaps: framePitches, frameCellPitchMaps: cellPitches, colorToSlot: mapping });
  return {
    rulesVersion: AUDIO_ANIMATION_LINK_VERSION,
    imageRole: 'audio',
    width: animation.width,
    height: animation.height,
    frameIds: animation.frames.map(({ id }) => id),
    rowPitchMap: [...pitches],
    ...(Object.keys(framePitches).length ? { frameRowPitchMaps: framePitches } : {}),
    ...(Object.keys(cellPitches).length ? { frameCellPitchMaps: cellPitches } : {}),
    ticksPerCell: AUDIO_PIXEL_TICKS,
    colorToSlot: mapping,
    sequenceTicks: animation.frames.length * animation.width * AUDIO_PIXEL_TICKS,
    loopTicks: song.loopTicks,
    projectionReady: Boolean(projectionReady)
  };
}

function fillClipGaps(song) {
  const reserved = new Set(song.tracks.flatMap((track) => track.clips.map((clip) => clip.clipId)));
  return song.tracks.map((track) => {
    const clips = [...track.clips].sort((left, right) => left.startTick - right.startTick);
    const result = [];
    let cursor = 0;
    for (const clip of clips) {
      if (clip.startTick > cursor) {
        let clipId = `animation-gap-${song.songId}-${track.instrument}-${cursor}`; let suffix = 1;
        while (reserved.has(clipId)) clipId = `animation-gap-${song.songId}-${track.instrument}-${cursor}-${suffix++}`;
        reserved.add(clipId); result.push({ clipId, startTick: cursor, lengthTicks: clip.startTick - cursor, notes: [] });
      }
      result.push({ ...clip, notes: [...clip.notes] });
      cursor = Math.max(cursor, clip.startTick + clip.lengthTicks);
    }
    if (cursor < song.loopTicks) {
      let clipId = `animation-gap-${song.songId}-${track.instrument}-${cursor}`; let suffix = 1;
      while (reserved.has(clipId)) clipId = `animation-gap-${song.songId}-${track.instrument}-${cursor}-${suffix++}`;
      reserved.add(clipId); result.push({ clipId, startTick: cursor, lengthTicks: song.loopTicks - cursor, notes: [] });
    }
    return { ...track, clips: result };
  });
}

/** Explicitly project every visible animation frame into one sequential audio timeline. */
export function prepareAudioAnimationImport(song, animation, {
  rowPitchMap = null,
  frameRowPitchMaps = null,
  frameCellPitchMaps = null,
  colorToSlot = null,
  composeFrame = composeAnimationFrame,
  maxNotes = AUDIO_ANIMATION_MAX_NOTES
} = {}) {
  validateAudioSong(song); validateAnimation(animation);
  if (animation.width > AUDIO_SHARED_IMAGE_MAX_DIMENSION || animation.height > AUDIO_SHARED_IMAGE_MAX_DIMENSION) throw new RangeError('音楽に使えるアニメーションは256pxまでです。');
  if (animation.palette.length > AUDIO_ANIMATION_MAX_COLORS) throw new RangeError('音楽に使える色は32色までです。');
  if (typeof composeFrame !== 'function') throw new TypeError('アニメーションのフレーム合成関数が必要です。');
  if (!Number.isSafeInteger(maxNotes) || maxNotes < 1 || maxNotes > AUDIO_ANIMATION_MAX_NOTES) throw new RangeError('音符数の上限が不正です。');

  const pitches = rowPitchMap || createAudioRowPitchMap(animation.height);
  const framePitches = normalizeFrameRowPitchMaps(animation, frameRowPitchMaps, { pruneStale: true });
  const cellPitches = normalizeFrameCellPitchMaps(animation, frameCellPitchMaps, { pruneStale: true });
  const mapping = { ...(colorToSlot || {}) };
  for (const color of animation.palette) {
    const id = rgbaId(color);
    if (!Object.hasOwn(mapping, id)) mapping[id] = null;
  }
  validateSequenceLink(song, animation, { rowPitchMap: pitches, frameRowPitchMaps: framePitches, frameCellPitchMaps: cellPitches, colorToSlot: mapping });

  const nextSong = extendAudioLoopForImage(song, animation.width, { frameCount: animation.frames.length });
  const tracks = fillClipGaps(nextSong).map((track) => ({
    ...track,
    clips: track.clips.map((clip) => ({
      ...clip,
      notes: clip.notes.filter((note) => note.sourceCell?.kind !== 'audio-animation')
    }))
  }));
  const tracksBySlot = new Map(tracks.map((track) => [track.instrument, track]));
  const usedIds = new Set(tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes.map((note) => note.noteId))));
  const priorCells = new Map();
  for (const track of song.tracks) for (const clip of track.clips) for (const note of clip.notes) {
    const cell = note.sourceCell;
    if (cell?.kind !== 'audio-animation' || typeof cell.frameId !== 'string'
        || !Number.isInteger(cell.localX) || !Number.isInteger(cell.y)) continue;
    const key = `animation:${cell.frameId}:${cell.localX}:${cell.y}`;
    if (!priorCells.has(key)) priorCells.set(key, []);
    priorCells.get(key).push(note);
  }
  const frameIndexById = new Map(animation.frames.map((frame, index) => [frame.id, index]));
  let noteCount = 0;
  const addNote = (frame, frameIndex, x, y, colorIndex) => {
    const color = animation.palette[colorIndex];
    const colorId = rgbaId(color);
    const slotId = mapping[colorId];
    const pitch = Object.hasOwn(cellPitches, frame.id) && Object.hasOwn(cellPitches[frame.id], `${x}:${y}`)
      ? cellPitches[frame.id][`${x}:${y}`]
      : (Object.hasOwn(framePitches, frame.id) ? framePitches[frame.id] : pitches)[y];
    if (!slotId || pitch === null) return;
    if (++noteCount > maxNotes) throw new RangeError(`音符が上限（${maxNotes.toLocaleString()}個）を超えました。フレーム数か描画量を減らしてください。`);
    const sequenceX = frameIndex * animation.width + x;
    const startTick = sequenceX * AUDIO_PIXEL_TICKS;
    const track = tracksBySlot.get(slotId);
    const clip = track?.clips.find((item) => startTick >= item.startTick && startTick + AUDIO_PIXEL_TICKS <= item.startTick + item.lengthTicks);
    if (!clip) throw new RangeError('音楽ページの時間範囲を作れませんでした。曲の内容は保持されています。');
    const prior = priorCells.get(`animation:${frame.id}:${x}:${y}`)?.find((note) => {
      const source = note.sourceCell;
      return Number.isInteger(source.frameIndex)
        && source.x === source.frameIndex * animation.width + source.localX
        && note.startTick === source.x * AUDIO_PIXEL_TICKS
        && note.pitch === pitch && note.durationTicks === AUDIO_PIXEL_TICKS && note.colorId === colorId;
    });
    let noteId = prior?.noteId && !usedIds.has(prior.noteId)
      ? prior.noteId
      : `animation-${song.songId}-${frame.id}-${x}-${y}`;
    let suffix = 1;
    while (usedIds.has(noteId)) noteId = `animation-${song.songId}-${frame.id}-${x}-${y}-${suffix++}`;
    usedIds.add(noteId);
    clip.notes.push({ ...(prior || {}), noteId, pitch, startTick, durationTicks: AUDIO_PIXEL_TICKS, velocity: prior?.velocity ?? 96,
      colorId, sourceCell: { kind: 'audio-animation', frameId: frame.id, frameIndex, x: sequenceX, localX: x, y } });
  };

  // Compose, validate and consume one frame at a time; never retain all raster frames.
  for (let frameIndex = 0; frameIndex < animation.frames.length; frameIndex += 1) {
    const frame = animation.frames[frameIndex];
    const document = composeFrame(animation, frame.id);
    if (!document || document.width !== animation.width || document.height !== animation.height
        || !Array.isArray(document.palette) || !Array.isArray(document.pixels)
        || document.pixels.length !== animation.width * animation.height) {
      throw new TypeError('アニメーションの合成画像が不正です。');
    }
    for (let index = 0; index < document.pixels.length; index += 1) {
      const colorIndex = document.pixels[index];
      if (!Number.isInteger(colorIndex) || colorIndex < -1 || colorIndex >= animation.palette.length) throw new RangeError('アニメーションに不正な色番号があります。');
      if (colorIndex < 0) continue;
      addNote(frame, frameIndex, index % animation.width, Math.floor(index / animation.width), colorIndex);
    }
  }

  const resultSong = validateAudioSong({ ...nextSong, tracks });
  return {
    song: resultSong,
    link: createAudioAnimationLink(resultSong, animation, { rowPitchMap: pitches, frameRowPitchMaps: framePitches, frameCellPitchMaps: cellPitches, colorToSlot: mapping, projectionReady: true }),
    animation,
    noteCount,
    durationSeconds: resultSong.loopTicks * 60 / resultSong.tempo / AUDIO_PPQ
  };
}

export function validateAudioAnimationBinding(song, animation, link) {
  validateAudioSong(song); validateAnimation(animation);
  if (animation.width > AUDIO_SHARED_IMAGE_MAX_DIMENSION || animation.height > AUDIO_SHARED_IMAGE_MAX_DIMENSION || animation.palette.length > AUDIO_ANIMATION_MAX_COLORS) throw new RangeError('音楽に使える絵は256px、32色までです。');
  if (link?.rulesVersion !== AUDIO_ANIMATION_LINK_VERSION || link.imageRole !== 'audio'
      || link.width !== animation.width || link.height !== animation.height
      || !Array.isArray(link.frameIds) || JSON.stringify(link.frameIds) !== JSON.stringify(animation.frames.map(({ id }) => id))
      || link.ticksPerCell !== AUDIO_PIXEL_TICKS || link.sequenceTicks !== animation.frames.length * animation.width * AUDIO_PIXEL_TICKS
      || link.loopTicks !== song.loopTicks) throw new TypeError('音楽ページとアニメーションの保存情報が一致しません。');
  validateSequenceLink(song, animation, link);
  // A pending external frame edit intentionally retains the last projected
  // song until the author presses refresh. Its old frame coordinates may be
  // stale after a frame is removed or reordered.
  if (!link.projectionReady) return song;
  for (const track of song.tracks) for (const clip of track.clips) for (const note of clip.notes) {
    const source = note.sourceCell;
    if (source?.kind !== 'audio-animation') continue;
    const frameIndex = frameIndexById(animation, source.frameId);
    if (frameIndex < 0 || frameIndex !== source.frameIndex || source.x !== frameIndex * animation.width + source.localX
        || source.y < 0 || source.y >= animation.height || source.localX < 0 || source.localX >= animation.width
        || note.pitch !== getAudioAnimationCellPitch(link, source.frameId, source.localX, source.y)
        || note.startTick !== source.x * AUDIO_PIXEL_TICKS) throw new TypeError('アニメーション音符の位置が不正です。');
  }
  return song;
}

function frameIndexById(animation, frameId) { return animation.frames.findIndex((frame) => frame.id === frameId); }

/** Edit one audio-role cel immutably; song projection remains an explicit refresh action. */
export function setAudioAnimationPixel(animation, link, { frameId, layerId, x, y, colorId = null, active = true } = {}) {
  validateAnimation(animation);
  if (link?.rulesVersion !== AUDIO_ANIMATION_LINK_VERSION || link.imageRole !== 'audio'
      || link.width !== animation.width || link.height !== animation.height
      || !Array.isArray(link.frameIds) || JSON.stringify(link.frameIds) !== JSON.stringify(animation.frames.map(({ id }) => id))) {
    throw new TypeError('音楽用アニメーションと色の対応が一致しません。');
  }
  if (!Number.isInteger(x) || x < 0 || x >= animation.width || !Number.isInteger(y) || y < 0 || y >= animation.height) throw new RangeError('選択した画像セルが範囲外です。');
  if (active && (!/^rgba-[\da-f]{8}$/i.test(colorId || '') || !Object.hasOwn(link.colorToSlot || {}, colorId) || colorId.endsWith('00'))) throw new TypeError('描く色を確認してください。');
  const colorIndex = active ? animation.palette.findIndex((color) => rgbaId(color) === colorId) : -1;
  if (active && colorIndex < 0) throw new TypeError('選んだ色はアニメーションのパレットにありません。');
  const cel = getAnimationCelDocument(animation, frameId, layerId);
  const offset = y * animation.width + x;
  const nextLegacyIndex = active ? colorIndex : -1;
  if (cel.pixels[offset] === nextLegacyIndex) return { animation, changed: false };
  // Cel documents use legacy palette indices (-1 = transparent). Convert the
  // entire document back to the animation runtime's indexed bytes before write.
  cel.pixels = Uint8Array.from(cel.pixels, (value) => value + 1);
  cel.pixels[offset] = nextLegacyIndex + 1;
  return { animation: writeAnimationCel(animation, frameId, layerId, cel), changed: true };
}

export function setAudioAnimationColorMapping(song, animation, link, { colorId, slotId } = {}) {
  validateAudioSong(song); validateAnimation(animation);
  if (link?.rulesVersion !== AUDIO_ANIMATION_LINK_VERSION || link.imageRole !== 'audio'
      || link.width !== animation.width || link.height !== animation.height
      || !Array.isArray(link.frameIds) || JSON.stringify(link.frameIds) !== JSON.stringify(animation.frames.map(({ id }) => id))) throw new TypeError('音楽用アニメーションの対応が一致しません。');
  if (!Object.hasOwn(link.colorToSlot || {}, colorId) || (slotId !== null && !(song.pixelPalette || AUDIO_PIXEL_PALETTE).some((slot) => slot.slotId === slotId))) throw new TypeError('色と音色の対応を確認してください。');
  const colorToSlot = { ...link.colorToSlot, [colorId]: slotId };
  validateSequenceLink(song, animation, { rowPitchMap: link.rowPitchMap, frameRowPitchMaps: link.frameRowPitchMaps, frameCellPitchMaps: link.frameCellPitchMaps, colorToSlot });
  return { ...link, colorToSlot };
}
