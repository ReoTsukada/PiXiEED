import { AUDIO_ANIMATION_LINK_VERSION, createAudioAnimationLink, prepareAudioAnimationImport } from './audio-animation.mjs?rev=20261011-legacy-frames-1';
import {
  AUDIO_PIXEL_PALETTE, AUDIO_PIXEL_PITCHES, AUDIO_PIXEL_TICKS, createAudioRowPitchMap, createAudioSong,
  setAudioColorInstrument, setAudioTempo, validateAudioSong
} from './audio-core.mjs?rev=20261011-legacy-frames-1';
import { readPxdAudioLink, readPxdAudioState, writePxdAudioState, projectLegacySharedAudioImage } from './pxd-draw-audio.mjs?rev=20261011-legacy-frames-1';
import { documentRgba } from './draw-core.mjs';
import { getPxdJson, setPxdJson } from './pxd-codec.mjs';
import { readPxdImage, readPxdSharedImage } from './pxd-project.mjs';
import { addAnimationFrame, composeAnimationFrame, createAnimation, createAnimationFromSerialized,
  getAnimationCelDocument, moveAnimationFrame, removeAnimationFrame, serializeAnimationPool,
  resizeAnimation, validateAnimation, writeAnimationCel } from './animation-core.mjs';
import { readPxdAnimation, writePxdAnimation } from './pxd-animation.mjs';

const colorId = (color) => `rgba-${color.slice(1).padEnd(8, 'f').toLowerCase()}`;
const clone = (value) => structuredClone(value);
export const LEGACY_MUSIC_EDITOR_ROLE = 'audio-legacy-editor';
export const DRAW_MUSIC_TRACK_SCHEMA_VERSION = 1;
export function usesLegacyMusicTiming(link, song) {
  return Boolean(link?.timing?.rulesVersion === 'loop-ratio-v1') || link?.rulesVersion === 'shared-canvas-v1'
    && (link.legacyEditorRole === LEGACY_MUSIC_EDITOR_ROLE || link.ticksPerCell !== AUDIO_PIXEL_TICKS || song.loopTicks < link.width * AUDIO_PIXEL_TICKS);
}

function pitchName(midi) {
  if (!Number.isInteger(midi)) return null;
  const names = ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ'];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Human-readable dimensions, pitch mapping and column timing for the current projection. */
export function describeDrawMusicProjection(state) {
  if (!state?.animation || !state?.song) return '';
  const { width, height, frames } = state.musicTrackMode ? state.musicAnimation : state.animation;
  const maps = [state.link?.rowPitchMap, ...Object.values(state.link?.frameRowPitchMaps || {})]
    .filter(map => Array.isArray(map) && map.length === height);
  const pitches = maps.flat().filter(Number.isInteger);
  const range = pitches.length ? `${pitchName(Math.min(...pitches))}〜${pitchName(Math.max(...pitches))}` : '音高未割当';
  let columns;
  if (state.link?.timing?.rulesVersion === 'loop-ratio-v1') {
    columns = `各${state.musicTrackMode ? 'ページ' : 'コマ'}${state.link.timing.ticksPerFrame} ticksを${width}列に配分`;
  } else if (usesLegacyMusicTiming(state.link, state.song)) {
    columns = `1ループ${state.song.loopTicks} ticksを${width}列に配分`;
  } else {
    columns = '横1ドット＝16分音符';
  }
  return `${state.musicTrackMode ? '共有音楽' : '共有Draw'} ${width}×${height}px・${frames.length}${state.musicTrackMode ? 'ページ' : 'コマ'}・${columns}・音高 ${range}・${state.song.tempo} BPM（描画FPSとは別）`;
}

function timelineSignature(animation) {
  validateAnimation(animation);
  const meta = JSON.stringify({ width: animation.width, height: animation.height, palette: animation.palette,
    frames: animation.frames.map(({ id }) => id), layers: animation.layers });
  let first = 2166136261; let second = 0x9e3779b9;
  const feed = (value) => { first = Math.imul(first ^ value, 16777619) >>> 0; second = (Math.imul(second ^ value, 0x85ebca6b) + 0xc2b2ae35) >>> 0; };
  for (let i = 0; i < meta.length; i += 1) feed(meta.charCodeAt(i));
  for (const tile of serializeAnimationPool(animation)) {
    for (const value of `${tile.frameId}\0${tile.layerId}\0${tile.tileId}\0${tile.x},${tile.y},${tile.width},${tile.height}\0`) feed(value.charCodeAt(0));
    for (const byte of tile.bytes || []) feed(byte);
  }
  return `${meta.length}:${first.toString(16)}:${second.toString(16)}`;
}

function failMusicTrack(code, message) {
  const error = new TypeError(message); error.code = code; throw error;
}

function musicLayer(animation) { return animation.layers.find((layer) => layer.role === 'music') ?? null; }
function hasMusicTrackLayer(animation) { return Boolean(musicLayer(animation)); }
function requireMusicCanvasMatch(art, pages) {
  const colors = palette => palette.reduce((counts, color) => counts.set(color.toLowerCase(), (counts.get(color.toLowerCase()) || 0) + 1), new Map());
  const artColors = colors(art.palette), pageColors = colors(pages.palette);
  if (art.width !== pages.width || art.height !== pages.height || artColors.size !== pageColors.size
      || [...artColors].some(([color, count]) => pageColors.get(color) !== count)) {
    failMusicTrack('DRAW_MUSIC_PAGE_CANVAS_MISMATCH', '選択した画像と旧音楽のキャンバス寸法またはパレットが異なるため、音楽ページへ損失なく移せません。PXDは変更していません。');
  }
}

function remapMusicDocumentPalette(document, sourcePalette, targetPalette) {
  const targetByColor = new Map(targetPalette.map((color, index) => [color.toLowerCase(), index]));
  const pixels = document.pixels.map((index) => index < 0 ? -1 : targetByColor.get(sourcePalette[index]?.toLowerCase()) ?? -2);
  if (pixels.some((index) => index === -2)) failMusicTrack('DRAW_MUSIC_PAGE_COLOR_MISMATCH', '楽曲ページの色を選択した画像のパレットへ損失なく移せません。PXDは変更していません。');
  return { ...document, palette: [...targetPalette], pixels };
}

function nearestPaletteIndex(color, palette) {
  const rgb = hex => [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const value = rgb(color); let best = 0; let distance = Infinity;
  palette.forEach((candidate, index) => {
    const other = rgb(candidate);
    const next = value.reduce((sum, channel, axis) => sum + (channel - other[axis]) ** 2, 0);
    if (next < distance) { best = index; distance = next; }
  });
  return best;
}

// Apply the same center-crop/pad and nearest-color transform as shared project
// settings to every independent music page, preserving page IDs and durations.
function syncMusicCanvas(state, art) {
  let source = state.musicAnimation;
  const resized = source.width !== art.width || source.height !== art.height;
  if (resized) source = resizeAnimation(source, art.width, art.height, { anchor: 'center' });
  const paletteChanged = source.palette.length !== art.palette.length
    || source.palette.some((color, index) => color.toLowerCase() !== art.palette[index]?.toLowerCase());
  const sourceToTarget = source.palette.map(color => nearestPaletteIndex(color, art.palette));
  const changedColors = source.palette.some((color, index) => color.toLowerCase() !== art.palette[sourceToTarget[index]]?.toLowerCase());
  if (!resized && !paletteChanged) return { animation: source, resized: false, paletteChanged: false, changedColors: false };

  const layer = source.layers[0];
  let animation = createAnimationFromSerialized({ schemaVersion: 1, width: art.width, height: art.height,
    palette: [...art.palette], frames: source.frames.map(({ id, durationMs }) => ({ id, durationMs })),
    layers: source.layers.map(item => ({ ...item })) }, []);
  for (const frame of source.frames) for (const sourceLayer of source.layers) {
    const document = getAnimationCelDocument(source, frame.id, sourceLayer.id);
    const pixels = document.pixels.map(index => index < 0 ? -1 : sourceToTarget[index]);
    animation = writeAnimationCel(animation, frame.id, sourceLayer.id,
      { schemaVersion: 1, width: art.width, height: art.height, palette: [...art.palette],
        pixels: Uint8Array.from(pixels, value => value + 1) });
  }
  return { animation, resized, paletteChanged, changedColors };
}

function makeMusicAnimationFromImage(image, art) {
  if (art.width !== image.width || art.height !== image.height) failMusicTrack('DRAW_MUSIC_PAGE_CANVAS_MISMATCH', '選択した画像と旧音楽のキャンバス寸法またはパレットが異なるため、音楽ページへ損失なく移せません。PXDは変更していません。');
  const colorIndex = new Map(art.palette.map((color, index) => [color.slice(0, 7).toLowerCase(), index]));
  const pixels = new Array(image.width * image.height).fill(-1);
  for (let index = 0; index < pixels.length; index += 1) {
    const offset = index * 4, alpha = image.rgba[offset + 3];
    if (alpha === 0) continue;
    if (alpha !== 255) failMusicTrack('DRAW_MUSIC_PAGE_COLOR_MISMATCH', '半透明色を旧音楽ページへ正確に移せません。PXDは変更していません。');
    const hex = `#${[0, 1, 2].map(channel => image.rgba[offset + channel].toString(16).padStart(2, '0')).join('')}`;
    const paletteIndex = colorIndex.get(hex.toLowerCase());
    if (paletteIndex === undefined) failMusicTrack('DRAW_MUSIC_PAGE_COLOR_MISMATCH', `旧音楽ページの色 ${hex} が選択した画像のパレットにないため移せません。PXDは変更していません。`);
    pixels[index] = paletteIndex;
  }
  const animation = createAnimation({ width: image.width, height: image.height, palette: art.palette });
  return writeAnimationCel(animation, animation.frames[0].id, animation.layers[0].id,
    { schemaVersion: 1, width: image.width, height: image.height, palette: [...art.palette], pixels: pixels.map(value => value + 1) });
}

function flattenMusicPages(source, art) {
  requireMusicCanvasMatch(art, source);
  if (source.layers.length === 1 && source.layers[0].role !== 'music') return source;
  const ids = new Set(source.layers.map(({ id }) => id));
  let layerId = 'music-page-layer'; let suffix = 1;
  while (ids.has(layerId)) layerId = `music-page-layer-${suffix++}`;
  let normalized = createAnimationFromSerialized({ schemaVersion: 1, width: source.width, height: source.height,
    palette: [...source.palette], frames: source.frames.map(({ id, durationMs }) => ({ id, durationMs })),
    layers: [{ id: layerId, name: 'Music page', visible: true, locked: false }] }, []);
  for (const frame of source.frames) {
    const composed = composeAnimationFrame(source, frame.id, { excludeMusic: true });
    const sharedLayer = musicLayer(source);
    if (sharedLayer) {
      const roleCel = getAnimationCelDocument(source, source.frames[0].id, sharedLayer.id);
      for (let index = 0; index < composed.pixels.length; index += 1) if (roleCel.pixels[index] >= 0) composed.pixels[index] = roleCel.pixels[index];
    }
    normalized = writeAnimationCel(normalized, frame.id, layerId,
      { ...composed, pixels: Uint8Array.from(composed.pixels, value => value + 1) });
  }
  return normalized;
}

function bindMusicTrack(link, layerId, pageId) {
  return { ...link, musicTrack: { schemaVersion: DRAW_MUSIC_TRACK_SCHEMA_VERSION, layerId, pageId } };
}

function paletteMapping(song, animation, prior = {}) {
  const mapping = { ...prior };
  for (const color of animation.palette) {
    const id = colorId(color);
    if (Object.hasOwn(mapping, id)) continue;
    const exact = (song.pixelPalette || []).find((slot) => slot.color.toLowerCase() === `#${id.slice(5, 11)}`);
    mapping[id] = exact?.slotId ?? null;
  }
  return mapping;
}

function retainActiveColorOverrides(song, animation, transferred = {}) {
  const active = new Set(animation.palette.map(colorId));
  for (const track of song.tracks || []) for (const clip of track.clips || []) for (const note of clip.notes || []) {
    const source = note.sourceCell;
    const generated = source?.kind === 'audio-animation' || (Number.isInteger(source?.x) && Number.isInteger(source?.y))
      || (typeof note.noteId === 'string' && note.noteId.startsWith(`pxd-image-${song.songId}-`));
    if (!generated && typeof note.colorId === 'string' && /^rgba-[\da-f]{8}$/.test(note.colorId) && !note.colorId.endsWith('00')) active.add(note.colorId);
  }
  const overrides = {};
  for (const [id, instrument] of Object.entries(song.colorInstruments || {})) if (active.has(id)) overrides[id] = instrument;
  for (const [id, instrument] of Object.entries(transferred)) if (active.has(id)) overrides[id] = instrument;
  const next = { ...song };
  if (Object.keys(overrides).length) next.colorInstruments = overrides;
  else delete next.colorInstruments;
  return next;
}

function inheritEditedPalette(state, animation, mapping, song) {
  const previous = state.animation;
  if (!previous || previous.palette.length !== animation.palette.length
      || !animation.frames.some(frame => previous.frames.some(old => old.id === frame.id))
      || !animation.layers.some(layer => previous.layers.some(old => old.id === layer.id))) return { mapping, song, transferred: {} };
  const oldCounts = new Map(); const newCounts = new Map();
  previous.palette.forEach((color) => oldCounts.set(colorId(color), (oldCounts.get(colorId(color)) || 0) + 1));
  animation.palette.forEach((color) => newCounts.set(colorId(color), (newCounts.get(colorId(color)) || 0) + 1));
  const oldIds = previous.palette.map(colorId); const newIds = animation.palette.map(colorId);
  const claimed = new Set();
  const transferred = {};
  for (let index = 0; index < Math.min(oldIds.length, newIds.length); index += 1) {
    const oldId = oldIds[index]; const nextId = newIds[index];
    if (oldId === nextId || oldCounts.get(oldId) !== 1 || newCounts.get(nextId) !== 1
        || newIds.includes(oldId) || Object.hasOwn(mapping, nextId) || claimed.has(nextId)
        || !Object.hasOwn(state.link?.colorToSlot || {}, oldId)) continue;
    mapping[nextId] = state.link.colorToSlot[oldId]; claimed.add(nextId);
    if (Object.hasOwn(song.colorInstruments || {}, oldId) && !Object.hasOwn(song.colorInstruments || {}, nextId)) {
      transferred[nextId] = song.colorInstruments[oldId];
    }
  }
  return { mapping, song, transferred };
}

function animationLink(song, animation, priorLink, mapping) {
  const frameIds = new Set(animation.frames.map(({ id }) => id));
  const sameHeight = priorLink?.rowPitchMap?.length === animation.height;
  const frameRowPitchMaps = Object.fromEntries(Object.entries(priorLink?.frameRowPitchMaps || {})
    .filter(([id, map]) => frameIds.has(id) && map?.length === animation.height));
  const frameCellPitchMaps = priorLink?.width === animation.width && priorLink?.height === animation.height
    ? Object.fromEntries(Object.entries(priorLink?.frameCellPitchMaps || {}).filter(([id]) => frameIds.has(id))) : {};
  return createAudioAnimationLink(song, animation, {
    rowPitchMap: sameHeight ? priorLink.rowPitchMap : createAudioRowPitchMap(animation.height),
    frameRowPitchMaps, frameCellPitchMaps, colorToSlot: mapping, projectionReady: false,
    timing: priorLink?.timing || null
  });
}

function removePriorImageNotes(song, link) {
  const isOldStaticPixel = link?.rulesVersion === 'pixel-cell-v1';
  if (!isOldStaticPixel && link?.rulesVersion !== 'shared-canvas-v1'
      && link?.rulesVersion !== AUDIO_ANIMATION_LINK_VERSION) return song;
  const knownColors = new Set(Object.keys(link.colorToSlot || {}));
  const legacyPrefix = `pxd-image-${song.songId}-`;
  const legacyEditorNote = (note) => {
    if (link?.rulesVersion !== 'pixel-cell-v1' || link.ticksPerCell !== AUDIO_PIXEL_TICKS
        || link.height !== AUDIO_PIXEL_PITCHES.length || link.width < 1) return false;
    const match = /^note-(?:(\d{10,})|([\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12})|([\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}))-(\d+)-(\d+)$/i.exec(note.noteId || '');
    if (!match) return false;
    const x = Number(match[4]); const y = Number(match[5]);
    return x < link.width && y < link.height && note.pitch === AUDIO_PIXEL_PITCHES[y]
      && note.startTick === x * AUDIO_PIXEL_TICKS && note.durationTicks === AUDIO_PIXEL_TICKS;
  };
  return { ...song, tracks: song.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({
    ...clip,
    notes: clip.notes.filter((note) => {
      const source = note.sourceCell;
      // The animation projector replaces these cells itself and retains their
      // IDs, velocities and future fields when their musical values match.
      if (source?.kind === 'audio-animation') return true;
      if (Number.isInteger(source?.x) && Number.isInteger(source?.y)) return false;
      if (!isOldStaticPixel) return true;
      const row = AUDIO_PIXEL_PITCHES.indexOf(note.pitch);
      const generatedId = typeof note.noteId === 'string' && note.noteId.startsWith(legacyPrefix)
        && /^\d+$/.test(note.noteId.slice(legacyPrefix.length));
      const mappedTrack = knownColors.has(note.colorId) && link.colorToSlot[note.colorId] === track.instrument;
      const oldEditorCell = legacyEditorNote(note);
      return !(oldEditorCell || (generatedId && mappedTrack && row >= 0
        && Number.isInteger(note.startTick) && note.startTick % AUDIO_PIXEL_TICKS === 0
        && note.durationTicks === AUDIO_PIXEL_TICKS));
    })
  })) })) };
}

function retainStaticCellMetadata(song, cleanSong, animation) {
  const retained = new Set(cleanSong.tracks.flatMap(track => track.clips.flatMap(clip => clip.notes.map(note => note.noteId))));
  return { ...cleanSong, tracks: cleanSong.tracks.map((track, trackIndex) => ({ ...track,
    clips: track.clips.map((clip, clipIndex) => ({ ...clip, notes: [...clip.notes,
      ...song.tracks[trackIndex].clips[clipIndex].notes.filter(note => !retained.has(note.noteId)).flatMap(note => {
        const x = note.sourceCell?.x ?? note.startTick / AUDIO_PIXEL_TICKS;
        const y = note.sourceCell?.y ?? AUDIO_PIXEL_PITCHES.indexOf(note.pitch);
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return [];
        const slot = (song.pixelPalette || AUDIO_PIXEL_PALETTE).find(slot => slot.slotId === track.instrument);
        const id = note.colorId || (slot ? colorId(slot.color) : undefined);
        return [{ ...note, colorId:id, sourceCell: { kind: 'audio-animation', frameId: animation.frames[0].id,
          frameIndex: 0, x, localX: x, y } }];
      })
    ] }))
  })) };
}

function projectTimeline(state, animation, { link: overrideLink = null, song: overrideSong = null } = {}) {
  let song = clone(overrideSong || state.song);
  const oldLink = overrideLink || state.link || state.originalLink;
  const mapping = { ...(oldLink?.colorToSlot || {}) };
  const inherited = inheritEditedPalette(state, animation, mapping, song);
  song = retainActiveColorOverrides(inherited.song, animation, inherited.transferred);
  const filledMapping = paletteMapping(song, animation, inherited.mapping);
  if (state.link?.rulesVersion === 'shared-canvas-v1' && usesLegacyMusicTiming(state.link, state.song) && animation.frames.length === 1) {
    const doc = composeAnimationFrame(animation, animation.frames[0].id);
    const image = { width: doc.width, height: doc.height,
      rgba: new Uint8Array(documentRgba({ ...doc, pixels: Array.from(doc.pixels) })) };
    const link = { ...state.link, imageRole: 'audio', width: animation.width, height: animation.height,
      rowPitchMap: state.link.rowPitchMap?.length === animation.height ? state.link.rowPitchMap : createAudioRowPitchMap(animation.height),
      colorToSlot: filledMapping, legacyEditorRole: LEGACY_MUSIC_EDITOR_ROLE };
    const projection = projectLegacySharedAudioImage(song, image, link);
    return { ...state, ...projection, animation, timelineSignature: timelineSignature(animation), projected: true };
  }
  const priorLink = animationLink(song, animation, oldLink, filledMapping);
  const timing = state.link?.timing || (usesLegacyMusicTiming(state.link, state.song)
    ? { rulesVersion: 'loop-ratio-v1', ticksPerFrame: state.song.loopTicks } : null);
  const cleanSong = retainStaticCellMetadata(song, removePriorImageNotes(song, oldLink), animation);
  const projection = prepareAudioAnimationImport(cleanSong, animation, {
    rowPitchMap: priorLink.rowPitchMap,
    frameRowPitchMaps: priorLink.frameRowPitchMaps,
    frameCellPitchMaps: priorLink.frameCellPitchMaps,
    colorToSlot: priorLink.colorToSlot,
    composeFrame: composeAnimationFrame, timing
  });
  return { ...state, song: projection.song, link: projection.link, animation,
    timelineSignature: timelineSignature(animation), projected: true };
}

/** Snapshot the current project audio data beside the retained Draw timeline. */
export function createDrawMusicState(project, animation, { legacySongOnly = false, sharedArtwork = false } = {}) {
  validateAnimation(animation);
  const storedSong = project ? readPxdAudioState(project) : null;
  const originalLink = project ? readPxdAudioLink(project) : null;
  const song = clone(storedSong || createAudioSong());
  const state = { song, link: clone(originalLink || animationLink(song, animation, null, paletteMapping(song, animation))),
    animation, originalSong: storedSong ? clone(storedSong) : null, originalLink: clone(originalLink),
    timelineSignature: timelineSignature(animation), projected: false, hasStoredAudio: Boolean(storedSong), legacySongOnly: Boolean(legacySongOnly) };
  // A new project starts from the Draw artwork. Existing projects keep their exact song until Draw changes.
  return storedSong && !sharedArtwork ? state : projectTimeline(state, animation);
}

function projectMusicTrackTimeline(state, musicAnimation, artAnimation = state.animation, pageId = state.musicPageId, overrides = undefined) {
  requireMusicCanvasMatch(artAnimation, musicAnimation);
  const projected = projectTimeline({ ...state, animation: musicAnimation,
    timelineSignature: state.musicTimelineSignature || timelineSignature(musicAnimation) }, musicAnimation, overrides);
  const link = bindMusicTrack({ ...(state.link || {}), ...projected.link }, state.musicLayerId, pageId);
  return { ...projected, animation: artAnimation, musicAnimation, musicPageId: pageId,
    musicLayerId: state.musicLayerId, musicTrackMode: true, link,
    timelineSignature: timelineSignature(artAnimation), musicTimelineSignature: timelineSignature(musicAnimation) };
}

/** Async loader for projects whose Draw animation has the reserved shared music layer. */
export async function createDrawMusicTrackState(project, artAnimation) {
  validateAnimation(artAnimation);
  const roleLayer = musicLayer(artAnimation);
  if (!roleLayer) failMusicTrack('DRAW_MUSIC_TRACK_MISSING', 'Drawに共有音楽レイヤーがありません。');
  const storedSong = project ? readPxdAudioState(project) : null;
  const originalLink = project ? readPxdAudioLink(project) : null;
  const song = clone(storedSong || createAudioSong());
  let musicAnimation = null;

  if (project && originalLink?.rulesVersion === AUDIO_ANIMATION_LINK_VERSION) {
    const source = await readPxdAnimation(project, 'audio');
    if (!source) failMusicTrack('DRAW_MUSIC_PAGES_MISSING', '旧音楽ページがPXDにありません。原本は保持しています。');
    musicAnimation = flattenMusicPages(source, artAnimation);
  } else if (project && originalLink) {
    const legacyPages = await readPxdAnimation(project, LEGACY_MUSIC_EDITOR_ROLE);
    if (legacyPages) musicAnimation = flattenMusicPages(legacyPages, artAnimation);
    else {
      const sourceImage = originalLink.imageRole === 'main'
        ? await readPxdSharedImage(project)
        : await readPxdImage(project, originalLink.imageRole || 'audio');
      if (!sourceImage) failMusicTrack('DRAW_MUSIC_SOURCE_MISSING', '旧音楽が参照する画像をPXDから読み込めません。原本は保持しています。');
      musicAnimation = makeMusicAnimationFromImage(sourceImage, artAnimation);
    }
  }
  musicAnimation ||= createAnimation({ width: artAnimation.width, height: artAnimation.height, palette: [...artAnimation.palette] });
  requireMusicCanvasMatch(artAnimation, musicAnimation);
  if (musicAnimation.layers.length !== 1 || musicAnimation.layers[0].role === 'music') musicAnimation = flattenMusicPages(musicAnimation, artAnimation);

  if (originalLink?.musicTrack) {
    if (originalLink.musicTrack.schemaVersion !== DRAW_MUSIC_TRACK_SCHEMA_VERSION
        || originalLink.musicTrack.layerId !== roleLayer.id
        || !musicAnimation.frames.some(({ id }) => id === originalLink.musicTrack.pageId)) {
      failMusicTrack('DRAW_MUSIC_TRACK_BINDING_INVALID', '保存された共有音楽レイヤーと楽曲ページの対応が壊れています。PXDは変更していません。');
    }
  }
  const musicPageId = originalLink?.musicTrack?.pageId || musicAnimation.frames[0].id;
  let link = originalLink
    ? bindMusicTrack(clone(originalLink), roleLayer.id, musicPageId)
    : bindMusicTrack(animationLink(song, musicAnimation, null, paletteMapping(song, musicAnimation)), roleLayer.id, musicPageId);
  const state = { song, link, animation: artAnimation, musicAnimation, musicPageId, musicLayerId: roleLayer.id,
    musicTrackMode: true, originalSong: storedSong ? clone(storedSong) : null, originalLink: clone(originalLink),
    timelineSignature: timelineSignature(artAnimation), musicTimelineSignature: timelineSignature(musicAnimation),
    projected: false, hasStoredAudio: Boolean(storedSong), legacySongOnly: false };
  // Brand-new art begins with a blank music page; pixels on ordinary art layers never become notes.
  if (!storedSong) return projectMusicTrackTimeline(state, musicAnimation, artAnimation, musicPageId);
  return state;
}

export function getDrawMusicPageDocument(state, pageId = state?.musicPageId) {
  if (!state?.musicTrackMode || !state.musicAnimation || !state.musicAnimation.frames.some(({ id }) => id === pageId)) {
    throw new TypeError('選択した楽曲ページがありません。');
  }
  const document = getAnimationCelDocument(state.musicAnimation, pageId, state.musicAnimation.layers[0].id);
  return { ...remapMusicDocumentPalette(document, state.musicAnimation.palette, state.animation.palette), schemaVersion: 1 };
}

export function selectDrawMusicPage(state, pageId) {
  if (!state?.musicTrackMode || !state.musicAnimation?.frames.some(({ id }) => id === pageId)) throw new TypeError('選択した楽曲ページがありません。');
  return { ...state, musicPageId: pageId,
    link: bindMusicTrack(state.link, state.musicLayerId, pageId) };
}

export function addDrawMusicPage(state, { sourcePageId = state?.musicPageId, durationMs, copy = true } = {}) {
  if (!state?.musicTrackMode || !state.musicAnimation?.frames.some(({ id }) => id === sourcePageId)) throw new TypeError('複製元の楽曲ページがありません。');
  const options = { sourceFrameId: sourcePageId, copy };
  if (durationMs !== undefined) options.durationMs = durationMs;
  const musicAnimation = addAnimationFrame(state.musicAnimation, options);
  return projectMusicTrackTimeline(state, musicAnimation, state.animation, musicAnimation.frames.at(-1).id);
}

export function moveDrawMusicPage(state, pageId, index) {
  if (!state?.musicTrackMode || !state.musicAnimation?.frames.some(({ id }) => id === pageId)) throw new TypeError('移動する楽曲ページがありません。');
  const musicAnimation = moveAnimationFrame(state.musicAnimation, pageId, index);
  return projectMusicTrackTimeline(state, musicAnimation, state.animation, state.musicPageId);
}

export function removeDrawMusicPage(state, pageId) {
  if (!state?.musicTrackMode || !state.musicAnimation?.frames.some(({ id }) => id === pageId)) throw new TypeError('削除する楽曲ページがありません。');
  const pageIndex = state.musicAnimation.frames.findIndex(({ id }) => id === pageId);
  const musicAnimation = removeAnimationFrame(state.musicAnimation, pageId);
  const musicPageId = pageId === state.musicPageId
    ? musicAnimation.frames[Math.min(pageIndex, musicAnimation.frames.length - 1)].id : state.musicPageId;
  return projectMusicTrackTimeline(state, musicAnimation, state.animation, musicPageId);
}

/** Reproject only after a structural Draw timeline change; preserve exact original song otherwise. */
export function projectDrawMusic(state, animation) {
  validateAnimation(animation);
  if (state?.musicTrackMode) {
    const roleLayer = musicLayer(animation);
    if (!roleLayer || roleLayer.id !== state.musicLayerId) failMusicTrack('DRAW_MUSIC_TRACK_BINDING_INVALID', 'Draw音楽レイヤーが変更されました。PXDは変更していません。');
    const synchronized = syncMusicCanvas(state, animation);
    let musicAnimation = synchronized.animation;
    const colorToSlot = { ...(state.link?.colorToSlot || {}) };
    // A newly introduced shared color is intentionally silent until the user
    // assigns it to a voice in music settings.
    for (const color of animation.palette) if (!Object.hasOwn(colorToSlot, colorId(color))) colorToSlot[colorId(color)] = null;
    let nextState = { ...state, musicAnimation,
      link: bindMusicTrack({ ...state.link, colorToSlot }, state.musicLayerId, state.musicPageId) };
    const mirrored = remapMusicDocumentPalette(getAnimationCelDocument(animation, animation.frames[0].id, roleLayer.id),
      animation.palette, musicAnimation.palette);
    const currentPage = getAnimationCelDocument(musicAnimation, state.musicPageId, musicAnimation.layers[0].id);
    const samePixels = mirrored.pixels.length === currentPage.pixels.length
      && mirrored.pixels.every((value, index) => value === currentPage.pixels[index]);
    const musicChanged = synchronized.resized || synchronized.changedColors || !samePixels;
    if (musicChanged) musicAnimation = writeAnimationCel(musicAnimation, state.musicPageId,
      musicAnimation.layers[0].id, { ...mirrored, palette: [...musicAnimation.palette],
        pixels: Uint8Array.from(mirrored.pixels, value => value + 1) });
    if (musicChanged) return projectMusicTrackTimeline(nextState, musicAnimation, animation, state.musicPageId);
    return { ...nextState, animation, timelineSignature: timelineSignature(animation),
      musicTimelineSignature: timelineSignature(musicAnimation) };
  }
  const signature = timelineSignature(animation);
  if (signature === state.timelineSignature) return animation === state.animation ? state : { ...state, animation };
  return projectTimeline(state, animation);
}

export function changeDrawMusicColor(state, { colorId: id, slotId, instrument } = {}) {
  if (!/^rgba-[\da-f]{8}$/i.test(id || '') || id.endsWith('00')) throw new TypeError('色を確認してください。');
  const animation = state.musicTrackMode ? state.musicAnimation : state.animation;
  if (!animation.palette.some((color) => colorId(color) === id)) throw new TypeError('色はDrawパレットにありません。');
  let song = clone(state.song);
  song = retainActiveColorOverrides(song, animation);
  if (instrument !== undefined) song = setAudioColorInstrument(song, { colorId: id, instrument });
  const mapping = paletteMapping(song, animation, state.link?.colorToSlot || {});
  if (slotId !== null && !song.pixelPalette.some((slot) => slot.slotId === slotId)) throw new TypeError('音色スロットを確認してください。');
  if (slotId !== undefined) mapping[id] = slotId;
  const link = animationLink(song, animation, state.link, mapping);
  if (state.musicTrackMode) return projectMusicTrackTimeline({ ...state, song }, animation, state.animation, state.musicPageId, { song, link });
  return projectTimeline(state, animation, { song, link });
}

export function changeDrawMusicTempo(state, tempo) {
  return { ...state, song: setAudioTempo(state.song, tempo) };
}

function linkForMusicTrackSave(state) {
  if (state.link?.rulesVersion === AUDIO_ANIMATION_LINK_VERSION) return bindMusicTrack(state.link, state.musicLayerId, state.musicPageId);
  const frameIds = new Set(state.musicAnimation.frames.map(({ id }) => id));
  for (const [frameId] of Object.entries(state.link?.frameRowPitchMaps || {})) if (!frameIds.has(frameId)) {
    failMusicTrack('DRAW_MUSIC_TRACK_BINDING_INVALID', '旧音楽のフレーム別音高設定が楽曲ページと一致しません。PXDは変更していません.');
  }
  for (const [frameId] of Object.entries(state.link?.frameCellPitchMaps || {})) if (!frameIds.has(frameId)) {
    failMusicTrack('DRAW_MUSIC_TRACK_BINDING_INVALID', '旧音楽のセル別音高設定が楽曲ページと一致しません。PXDは変更していません.');
  }
  const rowPitchMap = state.link?.rowPitchMap?.length === state.musicAnimation.height
    ? state.link.rowPitchMap : createAudioRowPitchMap(state.musicAnimation.height);
  const timing = state.link?.timing || (usesLegacyMusicTiming(state.link, state.song)
    ? { rulesVersion: 'loop-ratio-v1', ticksPerFrame: state.song.loopTicks } : null);
  const normalized = createAudioAnimationLink(state.song, state.musicAnimation, {
    rowPitchMap,
    frameRowPitchMaps: state.link?.frameRowPitchMaps || null,
    frameCellPitchMaps: state.link?.frameCellPitchMaps || null,
    colorToSlot: state.link?.colorToSlot || {},
    projectionReady: false,
    timing
  });
  return bindMusicTrack({ ...(state.link || {}), ...normalized, imageRole: 'audio' }, state.musicLayerId, state.musicPageId);
}

function animationArchiveSignature(animation) {
  return `${timelineSignature(animation)}:${JSON.stringify(animation.frames)}`;
}

/** Overlay audio data on the supplied Draw project without replacing its project identity or entries. */
export async function writeDrawMusicProject(project, state, { imageRole = 'main' } = {}) {
  if (!state?.song || !state?.link || !state?.animation) throw new TypeError('音楽状態がありません。');
  if (!['main', 'audio'].includes(imageRole)) throw new TypeError('保存する画像の役割を確認してください。');
  validateAudioSong(state.song);
  if (state.musicTrackMode) {
    const link = linkForMusicTrackSave(state);
    let next = project;
    const oldAudioAnimation = project ? await readPxdAnimation(project, 'audio') : null;
    const existingLink = project ? readPxdAudioLink(project) : null;
    const alreadyManaged = existingLink?.musicTrack?.schemaVersion === DRAW_MUSIC_TRACK_SCHEMA_VERSION
      && existingLink.musicTrack.layerId === state.musicLayerId;
    if (oldAudioAnimation && !alreadyManaged
        && animationArchiveSignature(oldAudioAnimation) !== animationArchiveSignature(state.musicAnimation)) {
      const archived = project.entries?.some(({ path }) => path === 'animations/audio-source/state.json');
      if (archived) {
        const retained = await readPxdAnimation(project, 'audio-source');
        if (!retained || animationArchiveSignature(retained) !== animationArchiveSignature(oldAudioAnimation)) {
          failMusicTrack('DRAW_MUSIC_SOURCE_ARCHIVE_CONFLICT', 'PXDにはすでに別のaudio-sourceアニメーションがあります。上書きせず原本を保持しました。');
        }
      } else next = await writeAnimationPreservingFuture(next, oldAudioAnimation, oldAudioAnimation.posterFrameId, 'audio-source');
    }
    next = await writePxdAudioState(next, state.song, { link, animation: state.musicAnimation });
    return writeAnimationPreservingFuture(next, state.musicAnimation, state.musicPageId, 'audio');
  }
  if (state.projected && state.link.rulesVersion === 'shared-canvas-v1' && usesLegacyMusicTiming(state.link, state.song)) {
    const selectedImage = await readPxdImage(project, imageRole);
    const selectedMatches = selectedImage && selectedImage.width === state.image?.width && selectedImage.height === state.image?.height
      && selectedImage.rgba.length === state.image?.rgba?.length
      && selectedImage.rgba.every((value, index) => value === state.image.rgba[index]);
    if (selectedImage && !selectedMatches) throw new TypeError('選択した画像の役割と音楽の投影が一致しません。PXDは変更していません。');
    const targetRole = selectedMatches ? imageRole : state.link.imageRole;
    const link = { ...state.link, imageRole: targetRole };
    const next = await writePxdAudioState(project, state.song, { image: state.image, link });
    return writeAnimationPreservingFuture(next, state.animation, state.animation.frames[0]?.id, LEGACY_MUSIC_EDITOR_ROLE);
  }
  if (state.legacySongOnly && !state.projected && state.hasStoredAudio) {
    return setPxdJson(project, 'audio/state.json', state.song);
  }
  const originalLink = state.originalLink;
  if (!state.projected && state.hasStoredAudio && originalLink && originalLink.rulesVersion !== AUDIO_ANIMATION_LINK_VERSION) {
    const image = originalLink.imageRole === 'main'
      ? await readPxdSharedImage(project)
      : await readPxdImage(project, originalLink.imageRole || 'audio');
    if (!image) throw new TypeError('元の音楽画像がありません。PXDは変更していません。');
    return writePxdAudioState(project, state.song, { image, link: originalLink });
  }
  if (!state.projected && state.hasStoredAudio && originalLink?.rulesVersion === AUDIO_ANIMATION_LINK_VERSION) {
    const retained = await readPxdAnimation(project, 'audio');
    if (!retained) throw new TypeError('保存済み音楽アニメーションがありません。PXDは変更していません。');
    const next = await writePxdAudioState(project, state.song, { link: originalLink, animation: retained });
    return writeAnimationPreservingFuture(next, retained, retained.posterFrameId);
  }
  const next = await writePxdAudioState(project, state.song, { link: state.link, animation: state.animation });
  return writeAnimationPreservingFuture(next, state.animation, state.animation.frames[0]?.id);
}

async function writeAnimationPreservingFuture(project, animation, posterFrameId, role = 'audio') {
  const path = `animations/${role}/state.json`;
  const future = project?.entries?.some(({ path: entryPath }) => entryPath === path) ? getPxdJson(project, path) : null;
  let next = await writePxdAnimation(project, animation, { role, posterFrameId });
  if (!future || typeof future !== 'object' || Array.isArray(future)) return next;
  const current = getPxdJson(next, path);
  const merged = { ...current };
  for (const [key, value] of Object.entries(future)) if (!Object.hasOwn(current, key)) merged[key] = clone(value);
  if (Object.keys(merged).length !== Object.keys(current).length) next = setPxdJson(next, path, merged);
  return next;
}
