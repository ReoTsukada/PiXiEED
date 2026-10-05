export const AUDIO_SCHEMA_VERSION = 1;
export const AUDIO_PPQ = 480;
export const AUDIO_STEP_TICKS = AUDIO_PPQ / 2;
export const AUDIO_PIXEL_TICKS = AUDIO_PPQ / 4;
export const AUDIO_PIXEL_COLUMNS = 16;
export const AUDIO_PIXEL_PITCHES = Object.freeze([84, 81, 79, 76, 74, 72, 69, 67, 64, 62, 60, 57, 55, 52, 50, 48]);
export const AUDIO_PIXEL_COLUMN_OPTIONS = Object.freeze([16, 32, 64, 128]);
export const AUDIO_BAR_TICKS = AUDIO_PPQ * 4;
// Animation sequences can span 128 frames at 256 columns per frame (2048 bars).
export const AUDIO_MAX_LOOP_TICKS = AUDIO_BAR_TICKS * 2048;
export const AUDIO_MAX_PLAYBACK_EVENTS = 100_000;
export const AUDIO_MIN_TEMPO = 60;
export const AUDIO_MAX_TEMPO = 180;
export const AUDIO_SHARED_IMAGE_MAX_DIMENSION = 256;

/** Map every source-image row to a sounding pitch without reducing the image. */
export function createAudioRowPitchMap(height, { lowPitch = 36, highPitch = 96 } = {}) {
  if (!Number.isInteger(height) || height < 1 || height > AUDIO_SHARED_IMAGE_MAX_DIMENSION) throw new RangeError('画像の高さは1〜256行です');
  if (!Number.isInteger(lowPitch) || !Number.isInteger(highPitch) || lowPitch < 0 || highPitch > 127 || lowPitch > highPitch) throw new RangeError('音程の範囲が不正です');
  if (height === 1) return [Math.round((lowPitch + highPitch) / 2)];
  return Array.from({ length: height }, (_, y) => Math.round(highPitch - (highPitch - lowPitch) * y / (height - 1)));
}

export function validateAudioSharedImage(image, rowPitchMap) {
  if (!image || !Number.isInteger(image.width) || image.width < 1 || image.width > AUDIO_SHARED_IMAGE_MAX_DIMENSION || !Number.isInteger(image.height) || image.height < 1 || image.height > AUDIO_SHARED_IMAGE_MAX_DIMENSION || !(image.rgba instanceof Uint8Array || image.rgba instanceof Uint8ClampedArray) || image.rgba.length !== image.width * image.height * 4) throw new TypeError('共有画像の大きさまたはRGBAデータが不正です');
  if (!Array.isArray(rowPitchMap) || rowPitchMap.length !== image.height || rowPitchMap.some((pitch) => pitch !== null && (!Number.isInteger(pitch) || pitch < 0 || pitch > 127))) throw new TypeError('画像の行と音程の対応が不正です');
  return image;
}
import { AUDIO_INSTRUMENTS, getAudioInstrument } from './audio-timbres.mjs?rev=20261005-audio-drums-1';
import { createAudioColorMixPlan } from './audio-color-mix.mjs?rev=20261004-audio-color-mix-1';
import { scheduleAudioVoice } from './audio-voice.mjs?rev=20261005-audio-drums-1';
export { AUDIO_INSTRUMENTS };

/** Four stable storage lanes. Palette slots can select any modeled instrument. */
export const AUDIO_TRACK_INSTRUMENTS = Object.freeze([
  Object.freeze({ id: 'square', name: '矩形波', preset: 'pulse-25', waveform: 'pulse' }),
  Object.freeze({ id: 'triangle', name: '三角波', preset: 'triangle', waveform: 'triangle' }),
  Object.freeze({ id: 'sawtooth', name: 'のこぎり波', preset: 'sawtooth', waveform: 'sawtooth' }),
  Object.freeze({ id: 'noise', name: 'ノイズ', preset: 'noise', waveform: 'noise' })
]);
export const AUDIO_PIXEL_PALETTE = Object.freeze([
  Object.freeze({ slotId: 'square', color: '#49643c', instrument: 'square' }),
  Object.freeze({ slotId: 'triangle', color: '#4c82c3', instrument: 'triangle' }),
  Object.freeze({ slotId: 'sawtooth', color: '#e7a52b', instrument: 'sawtooth' }),
  Object.freeze({ slotId: 'noise', color: '#9a6bb0', instrument: 'noise' })
]);

const TRACK_INSTRUMENT_IDS = new Set(AUDIO_TRACK_INSTRUMENTS.map(({ id }) => id));
const INSTRUMENT_IDS = new Set(AUDIO_INSTRUMENTS.map(({ id }) => id));
const ALLOWED_PITCHES = new Set(AUDIO_PIXEL_PITCHES);

export function createAudioSong({ songId = 'song-local-1', title = '新しいループ', tempo = 120, loopTicks = AUDIO_BAR_TICKS } = {}) {
  const tracks = AUDIO_TRACK_INSTRUMENTS.map(({ id, name }) => ({
    trackId: `track-${id}`,
    instrument: id,
    name,
    clips: [{ clipId: `clip-${id}-1`, startTick: 0, lengthTicks: loopTicks, notes: [] }]
  }));
  return validateAudioSong({
    schemaVersion: AUDIO_SCHEMA_VERSION,
    songId,
    title,
    tempo,
    ticksPerQuarter: AUDIO_PPQ,
    timeSignature: { numerator: 4, denominator: 4 },
    loopTicks,
    scale: { rootMidi: 48, intervals: [0, 2, 4, 7, 9] },
    pixelPalette: AUDIO_PIXEL_PALETTE.map((slot) => ({ ...slot })),
    tracks
  });
}

export function audioPixelColumns(song) {
  validateAudioSong(song);
  return song.loopTicks / AUDIO_PIXEL_TICKS;
}

/** Change the pixel timeline while preserving every clip and every note. */
export function resizeAudioCanvas(song, columns) {
  validateAudioSong(song);
  if (!AUDIO_PIXEL_COLUMN_OPTIONS.includes(columns)) throw new RangeError('16/32/64/128列から選んでください');
  return resizeAudioLoop(song, columns * AUDIO_PIXEL_TICKS);
}

/** Give each shared-image column one 16th note, without shortening existing music. */
export function extendAudioLoopForImage(song, width, { frameCount = 1 } = {}) {
  validateAudioSong(song);
  if (!Number.isInteger(width) || width < 1 || width > AUDIO_SHARED_IMAGE_MAX_DIMENSION) throw new RangeError('画像の横幅は1〜256列です');
  if (!Number.isInteger(frameCount) || frameCount < 1 || frameCount > 128) throw new RangeError('音楽に取り込むコマは1〜128枚です');
  const requiredTicks = Math.ceil(width * frameCount * AUDIO_PIXEL_TICKS / AUDIO_BAR_TICKS) * AUDIO_BAR_TICKS;
  if (requiredTicks > AUDIO_MAX_LOOP_TICKS) throw new RangeError('アニメーションを取り込む曲が長すぎます');
  return resizeAudioLoop(song, Math.max(song.loopTicks, requiredTicks));
}

function resizeAudioLoop(song, nextLoopTicks) {
  const oldLoopTicks = song.loopTicks;
  if (nextLoopTicks < oldLoopTicks && song.tracks.some((track) => track.clips.some((clip) => clip.notes.some((note) => note.startTick + note.durationTicks > nextLoopTicks)))) {
    throw new RangeError('縮小すると末尾の音符が失われるため変更できません');
  }
  if (nextLoopTicks === oldLoopTicks) return { ...song, tracks: song.tracks.map((track) => ({ ...track, clips: track.clips.map((clip) => ({ ...clip, notes: [...clip.notes] })) })) };
  const tracks = song.tracks.map((track) => {
    let clips = track.clips.map((clip) => {
      if (clip.startTick >= nextLoopTicks) return null;
      const lengthTicks = Math.min(clip.startTick + clip.lengthTicks, nextLoopTicks) - clip.startTick;
      return { ...clip, lengthTicks, notes: [...clip.notes] };
    }).filter(Boolean);
    if (nextLoopTicks > oldLoopTicks) {
      const last = clips.reduce((latest, clip) => !latest || clip.startTick + clip.lengthTicks > latest.startTick + latest.lengthTicks ? clip : latest, null);
      if (last && last.startTick + last.lengthTicks === oldLoopTicks) {
        clips = clips.map((clip) => clip === last ? { ...clip, lengthTicks: clip.lengthTicks + nextLoopTicks - oldLoopTicks } : clip);
      } else {
        let clipId = `clip-${track.instrument}-${oldLoopTicks}`; let suffix = 1;
        const used = new Set(clips.map((clip) => clip.clipId));
        while (used.has(clipId)) clipId = `clip-${track.instrument}-${oldLoopTicks}-${suffix++}`;
        clips.push({ clipId, startTick: oldLoopTicks, lengthTicks: nextLoopTicks - oldLoopTicks, notes: [] });
      }
    }
    return { ...track, clips };
  });
  return validateAudioSong({ ...song, loopTicks: nextLoopTicks, tracks });
}

/** Read the canvas-facing palette slot and occupancy without adding UI state. */
export function audioSongPixels(song) {
  validateAudioSong(song);
  const width = audioPixelColumns(song); const height = AUDIO_PIXEL_PITCHES.length;
  const palette = song.pixelPalette || AUDIO_PIXEL_PALETTE;
  const pixels = Array(width * height).fill(-1);
  const slotByTrack = new Map(palette.map((slot, index) => [slot.slotId, index]));
  const pitchRow = new Map(AUDIO_PIXEL_PITCHES.map((pitch, index) => [pitch, index]));
  for (const track of song.tracks) {
    const slot = slotByTrack.get(track.instrument);
    if (slot === undefined) continue;
    for (const clip of track.clips) for (const note of clip.notes) {
      const row = pitchRow.get(note.pitch); if (row === undefined) continue;
      // Match the editor's cell-start sampling, including historical notes
      // whose boundaries fall between cells. Do not export an invisible dot.
      const first = Math.max(0, Math.ceil(note.startTick / AUDIO_PIXEL_TICKS));
      const end = Math.min(width, Math.ceil((note.startTick + note.durationTicks) / AUDIO_PIXEL_TICKS));
      for (let x = first; x < end; x += 1) {
        const index = row * width + x;
        if (pixels[index] < 0) pixels[index] = slot;
      }
    }
  }
  return { width, height, palette: palette.map(({ color }) => color), pixels };
}

export function validateAudioSong(song) {
  if (!song || song.schemaVersion !== AUDIO_SCHEMA_VERSION || typeof song.songId !== 'string' || !song.songId || typeof song.title !== 'string' || !song.title.trim()) throw new TypeError('曲データの基本情報が壊れています');
  if (!Number.isInteger(song.tempo) || song.tempo < AUDIO_MIN_TEMPO || song.tempo > AUDIO_MAX_TEMPO) throw new RangeError('テンポは60〜180 BPMの整数です');
  if (song.ticksPerQuarter !== AUDIO_PPQ || !Number.isInteger(song.loopTicks) || song.loopTicks < AUDIO_BAR_TICKS || song.loopTicks > AUDIO_MAX_LOOP_TICKS || song.loopTicks % AUDIO_BAR_TICKS !== 0) throw new TypeError('PPQまたはループ長が不正です');
  if (!song.timeSignature || song.timeSignature.numerator !== 4 || song.timeSignature.denominator !== 4) throw new TypeError('拍子は4/4に固定です');
  if (!Array.isArray(song.tracks) || song.tracks.length !== AUDIO_TRACK_INSTRUMENTS.length) throw new TypeError('4つの保存トラックが必要です');
  if (song.pixelPalette !== undefined) {
    if (!Array.isArray(song.pixelPalette) || song.pixelPalette.length !== AUDIO_PIXEL_PALETTE.length) throw new TypeError('色パレットが壊れています');
    const slots = new Set(); const colors = new Set();
    for (const entry of song.pixelPalette) {
      if (!entry || !TRACK_INSTRUMENT_IDS.has(entry.slotId) || slots.has(entry.slotId) || typeof entry.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(entry.color) || colors.has(entry.color.toLowerCase()) || !INSTRUMENT_IDS.has(entry.instrument)) throw new TypeError('色と音色の対応が不正です');
      slots.add(entry.slotId); colors.add(entry.color.toLowerCase());
    }
  }
  if (song.colorInstruments !== undefined) {
    const overrides = song.colorInstruments;
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(overrides))
        || Object.keys(overrides).length > 32
        || Object.entries(overrides).some(([colorId, instrument]) => !/^rgba-[\da-f]{8}$/.test(colorId) || colorId.endsWith('00') || !INSTRUMENT_IDS.has(instrument))) {
      throw new TypeError('色ごとの音色設定が不正です');
    }
  }

  const trackIds = new Set(); const instrumentIds = new Set(); const clipIds = new Set(); const noteIds = new Set();
  for (const track of song.tracks) {
    if (!track || typeof track.trackId !== 'string' || !track.trackId || trackIds.has(track.trackId) || !TRACK_INSTRUMENT_IDS.has(track.instrument) || typeof track.name !== 'string' || !Array.isArray(track.clips)) throw new TypeError('トラックが壊れています');
    trackIds.add(track.trackId);
    if (instrumentIds.has(track.instrument)) throw new TypeError('音色は各1トラックずつ必要です');
    instrumentIds.add(track.instrument);
    const clips = [...track.clips].sort((left, right) => left.startTick - right.startTick);
    let previousEnd = -1;
    for (const clip of clips) {
      if (!clip || typeof clip.clipId !== 'string' || !clip.clipId || clipIds.has(clip.clipId) || !Number.isInteger(clip.startTick) || !Number.isInteger(clip.lengthTicks) || clip.startTick < 0 || clip.lengthTicks <= 0 || clip.startTick + clip.lengthTicks > song.loopTicks || clip.startTick < previousEnd || !Array.isArray(clip.notes)) throw new TypeError('クリップの配置が不正です');
      clipIds.add(clip.clipId); previousEnd = clip.startTick + clip.lengthTicks;
      for (const note of clip.notes) {
        if (!note || typeof note.noteId !== 'string' || !note.noteId || noteIds.has(note.noteId) || !Number.isInteger(note.pitch) || note.pitch < 0 || note.pitch > 127 || !Number.isInteger(note.startTick) || !Number.isInteger(note.durationTicks) || !Number.isInteger(note.velocity) || note.velocity < 1 || note.velocity > 127 || note.durationTicks <= 0 || note.startTick < clip.startTick || note.startTick + note.durationTicks > clip.startTick + clip.lengthTicks) throw new TypeError('ノートのTickまたは値が不正です');
        noteIds.add(note.noteId);
      }
    }
  }
  if (instrumentIds.size !== AUDIO_TRACK_INSTRUMENTS.length) throw new TypeError('4つの異なる保存トラックが必要です');
  return song;
}

export function setAudioTempo(song, tempo) {
  validateAudioSong(song);
  return validateAudioSong({ ...song, tempo });
}

export function audioPixelPalette(song) {
  validateAudioSong(song);
  return song.pixelPalette || AUDIO_PIXEL_PALETTE;
}

/** Resolve an optional color-specific sound before the palette slot's default. */
export function getAudioColorInstrument(song, colorId, slotId) {
  if (colorId && song?.colorInstruments && Object.hasOwn(song.colorInstruments, colorId)) return song.colorInstruments[colorId];
  const slot = (song?.pixelPalette || AUDIO_PIXEL_PALETTE).find((entry) => entry.slotId === slotId);
  if (slot && INSTRUMENT_IDS.has(slot.instrument)) return slot.instrument;
  return TRACK_INSTRUMENT_IDS.has(slotId) ? slotId : null;
}

/** Set or clear one immutable RGBA color sound override. */
export function setAudioColorInstrument(song, { colorId, instrument } = {}) {
  validateAudioSong(song);
  if (!/^rgba-[\da-f]{8}$/.test(colorId || '') || colorId.endsWith('00') || (instrument !== null && !INSTRUMENT_IDS.has(instrument))) {
    throw new TypeError('色ごとの音色設定が不正です');
  }
  const colorInstruments = { ...(song.colorInstruments || {}) };
  if (instrument === null) delete colorInstruments[colorId];
  else colorInstruments[colorId] = instrument;
  return validateAudioSong({ ...song, colorInstruments });
}

export function setAudioPixelPalette(song, { slotId, color, instrument }) {
  const palette = audioPixelPalette(song);
  if (!palette.some((slot) => slot.slotId === slotId)) throw new TypeError('指定した色がありません');
  return validateAudioSong({ ...song, pixelPalette: palette.map((slot) => slot.slotId === slotId ? {
    ...slot, color: color === undefined ? slot.color : color, instrument: instrument === undefined ? slot.instrument : instrument
  } : { ...slot }) });
}

export function toggleAudioStep(song, { trackId, pitch, startTick, noteId }) {
  validateAudioSong(song);
  if (!ALLOWED_PITCHES.has(pitch) || !Number.isInteger(startTick) || startTick < 0 || startTick >= song.loopTicks || startTick % AUDIO_STEP_TICKS !== 0 || typeof noteId !== 'string' || !noteId.trim()) throw new TypeError('音符は8分音符のマス目から選んでください');
  let found = false;
  const tracks = song.tracks.map((track) => {
    if (track.trackId !== trackId) return track;
    return {
      ...track,
      clips: track.clips.map((clip) => {
        if (!(startTick >= clip.startTick && startTick < clip.startTick + clip.lengthTicks)) return clip;
        found = true;
        const match = clip.notes.find((note) => note.pitch === pitch && note.startTick === startTick);
        const notes = match ? clip.notes.filter((note) => note !== match) : [...clip.notes, { noteId, pitch, startTick, durationTicks: AUDIO_STEP_TICKS, velocity: 96 }];
        return { ...clip, notes };
      })
    };
  });
  if (!found) throw new RangeError('指定したトラックまたは時間はありません');
  return validateAudioSong({ ...song, tracks });
}

/** Set or clear one 16th-note pixel in the shared time/pitch canvas. */
export function setAudioPixel(song, { trackId, pitch, startTick, noteId = 'pixel-note', active = true, velocity = 96 }) {
  validateAudioSong(song);
  if (!ALLOWED_PITCHES.has(pitch) || !Number.isInteger(startTick) || startTick < 0 || startTick >= song.loopTicks || startTick % AUDIO_PIXEL_TICKS !== 0 || typeof noteId !== 'string' || !noteId.trim() || !Number.isInteger(velocity) || velocity < 1 || velocity > 127) throw new TypeError('音符は16分音符のピクセルから選んでください');
  const target = song.tracks.find((track) => track.trackId === trackId);
  if (!target?.clips.some((clip) => startTick >= clip.startTick && startTick + AUDIO_PIXEL_TICKS <= clip.startTick + clip.lengthTicks)) throw new RangeError('指定したトラックまたは時間はありません');
  const cellEnd = startTick + AUDIO_PIXEL_TICKS;
  const reservedIds = new Set(song.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes.map((note) => note.noteId))));
  const uniqueSplitId = (base) => {
    let candidate = base; let suffix = 1;
    while (reservedIds.has(candidate)) candidate = `${base}-${suffix++}`;
    reservedIds.add(candidate);
    return candidate;
  };
  let found = false;
  const tracks = song.tracks.map((track) => {
    return {
      ...track,
      clips: track.clips.map((clip) => {
        const containsCell = startTick >= clip.startTick && cellEnd <= clip.startTick + clip.lengthTicks;
        if (track.trackId === trackId && containsCell) found = true;
        const notes = [];
        for (const note of clip.notes) {
          const noteEnd = note.startTick + note.durationTicks;
          if (note.pitch !== pitch || note.startTick >= cellEnd || noteEnd <= startTick) { notes.push(note); continue; }
          const before = Math.max(0, startTick - note.startTick);
          const after = Math.max(0, noteEnd - cellEnd);
          if (before > 0) notes.push({ ...note, durationTicks: before });
          if (after > 0) notes.push({ ...note, noteId: before > 0 ? uniqueSplitId(`${note.noteId}-split-${cellEnd}`) : note.noteId, startTick: cellEnd, durationTicks: after });
        }
        if (active && track.trackId === trackId && containsCell) notes.push({ noteId, pitch, startTick, durationTicks: AUDIO_PIXEL_TICKS, velocity });
        return { ...clip, notes };
      })
    };
  });
  if (!found) throw new RangeError('指定したトラックまたは時間はありません');
  return validateAudioSong({ ...song, tracks });
}

/** Make each visible occupied cell exactly one sounding note, including old sustained notes. */
export function normalizeAudioPixelSong(song) {
  validateAudioSong(song);
  let normalized = song;
  for (let tick = 0; tick < song.loopTicks; tick += AUDIO_PIXEL_TICKS) {
    for (const pitch of AUDIO_PIXEL_PITCHES) {
      const cellEnd = tick + AUDIO_PIXEL_TICKS;
      const owners = normalized.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes.filter((note) => note.pitch === pitch && note.startTick < cellEnd && note.startTick + note.durationTicks > tick).map((note) => ({ track, clip, note }))));
      if (owners.length === 0 || (owners.length === 1 && owners[0].note.startTick === tick && owners[0].note.durationTicks === AUDIO_PIXEL_TICKS)) continue;
      // Historical clips may begin or end between pixel boundaries. Preserve
      // their partial edge note instead of asking setAudioPixel to write outside
      // the clip. Interior cells remain normalized as usual.
      const owner = owners.find(({ clip }) => tick >= clip.startTick && cellEnd <= clip.startTick + clip.lengthTicks);
      if (!owner) continue;
      const reserved = new Set(normalized.tracks.flatMap((track) => track.clips.flatMap((clip) => clip.notes.map((note) => note.noteId))));
      let noteId = `normalized-${pitch}-${tick}`; let suffix = 1;
      while (reserved.has(noteId)) noteId = `normalized-${pitch}-${tick}-${suffix++}`;
      normalized = setAudioPixel(normalized, { trackId: owner.track.trackId, pitch, startTick: tick, noteId, velocity: owner.note.velocity });
    }
  }
  return normalized;
}

function isDrumEvent(event) { return Boolean(getAudioInstrument(event.instrument)?.drum); }

function drumHitIdentity(event) {
  const cell = event.sourceCell;
  const animation = cell?.kind === 'audio-animation'
    ? [cell.frameId ?? null, cell.frameIndex ?? null, cell.x ?? null, cell.localX ?? null]
    : null;
  return JSON.stringify([event.colorId, event.instrument, event.startTick, animation]);
}

function expandDrumCellRun(event) {
  if (!['audio-image', 'audio-animation'].includes(event.sourceCell?.kind) || event.durationTicks <= AUDIO_PIXEL_TICKS) return [event];
  const hits = [];
  for (let offset = 0; offset < event.durationTicks; offset += AUDIO_PIXEL_TICKS) {
    const cellOffset = Math.floor(offset / AUDIO_PIXEL_TICKS);
    const sourceCell = { ...event.sourceCell, x: event.sourceCell.x + cellOffset };
    if (Number.isInteger(event.sourceCell.localX)) sourceCell.localX += cellOffset;
    hits.push({ ...event, startTick: event.startTick + offset, durationTicks: Math.min(AUDIO_PIXEL_TICKS, event.durationTicks - offset), sourceCell });
  }
  return hits;
}

/** Collapse only the playback projection: vertical pixels paint one fixed-pitch drum hit. */
function projectDrumHits(events) {
  const byHit = new Map();
  for (const event of events.flatMap(expandDrumCellRun)) {
    const key = drumHitIdentity(event);
    const prior = byHit.get(key);
    if (!prior) {
      byHit.set(key, { ...event, pitch: 60, sourceCell: event.sourceCell ? { ...event.sourceCell, y: 0 } : null });
    } else prior.velocity = Math.max(prior.velocity, event.velocity);
  }
  return [...byHit.values()];
}

export function collectAudioEvents(song, { joinAdjacent = false, outlineRuns = false } = {}) {
  validateAudioSong(song);
  const events = [];
  for (const track of song.tracks) for (const clip of track.clips) for (const note of clip.notes) {
    events.push({ instrument: getAudioColorInstrument(song, note.colorId, track.instrument) || track.instrument, startTick: note.startTick, durationTicks: note.durationTicks, pitch: note.pitch, velocity: note.velocity,
      trackId: track.trackId, colorId: note.colorId || `slot-${track.instrument}`, sourceCell: note.sourceCell || null });
  }
  if (!joinAdjacent) {
    const projected = outlineRuns ? projectSourceCellRuns(events) : events;
    return projected.map(({ trackId, colorId, sourceCell, groupGain, ...event }) => outlineRuns
      ? { ...event, ...(colorId === undefined ? {} : { colorId }), ...(sourceCell ? { sourceCell } : {}), ...(groupGain === undefined ? {} : { groupGain }) }
      : event)
      .sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch || (left.instrument < right.instrument ? -1 : left.instrument > right.instrument ? 1 : 0));
  }

  const drumEvents = projectDrumHits(events.filter(isDrumEvent));
  const melodicEvents = events.filter((event) => !isDrumEvent(event));
  const projected = (outlineRuns ? projectSourceCellRuns(melodicEvents) : melodicEvents).concat(drumEvents);
  const audible = [];
  const lanes = new Map();
  for (const event of projected) {
    if (isDrumEvent(event)) { audible.push(event); continue; }
    const key = JSON.stringify([event.trackId, event.colorId, event.instrument, event.pitch, event.sourceCell?.y ?? null, event.groupGain ?? 1]);
    if (!lanes.has(key)) lanes.set(key, []);
    lanes.get(key).push(event);
  }
  for (const lane of lanes.values()) {
    lane.sort((left, right) => left.startTick - right.startTick);
    let current = null;
    for (const event of lane) {
      if (current && current.colorId === event.colorId && current.instrument === event.instrument && current.velocity === event.velocity
        && current.startTick + current.durationTicks === event.startTick
        && (current.groupGain ?? 1) === (event.groupGain ?? 1)
        && Boolean(current.sourceCell) === Boolean(event.sourceCell)
        && (!event.sourceCell || (current.sourceCell.kind === 'audio-animation'
          ? current.sourceCell.kind === event.sourceCell.kind
            && current.sourceCell.x + 1 === event.sourceCell.x
            && ((current.sourceCell.frameId === event.sourceCell.frameId
              && current.sourceCell.frameIndex === event.sourceCell.frameIndex
              && current.sourceCell.localX + 1 === event.sourceCell.localX)
              || (event.sourceCell.frameIndex === current.sourceCell.frameIndex + 1 && event.sourceCell.localX === 0))
          : current.sourceCell.kind === event.sourceCell.kind
            && current.sourceCell.x + 1 === event.sourceCell.x))) {
        current.durationTicks += event.durationTicks;
        if (event.sourceCell) current.sourceCell = event.sourceCell;
      } else { current = { ...event }; audible.push(current); }
    }
  }
  return audible.map(({ trackId, colorId, sourceCell, groupGain, ...event }) => outlineRuns
    ? { ...event, ...(colorId === undefined ? {} : { colorId }), ...(sourceCell ? { sourceCell } : {}), ...(groupGain === undefined ? {} : { groupGain }) }
    : event)
    .sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch || (left.instrument < right.instrument ? -1 : left.instrument > right.instrument ? 1 : 0));
}

/** Keep only the sounding outline of each contiguous source-image color run. */
function projectSourceCellRuns(events) {
  const columns = new Map();
  const manual = [];
  for (const event of events) {
    const cell = event.sourceCell;
    if (!cell || !Number.isInteger(cell.x) || !Number.isInteger(cell.y)) { manual.push({ ...event }); continue; }
    const key = JSON.stringify([event.trackId, event.colorId, event.startTick, event.durationTicks,
      cell.kind ?? null, cell.x, cell.frameId ?? null, cell.frameIndex ?? null, cell.localX ?? null]);
    if (!columns.has(key)) columns.set(key, []);
    columns.get(key).push(event);
  }
  const projected = [...manual];
  for (const column of columns.values()) {
    column.sort((left, right) => left.sourceCell.y - right.sourceCell.y);
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const top = run[0]; const bottom = run[run.length - 1];
      if (top.pitch === bottom.pitch) projected.push({ ...top, groupGain: 1 });
      else {
        projected.push({ ...top, groupGain: 0.5 });
        projected.push({ ...bottom, groupGain: 0.5 });
      }
      run = [];
    };
    for (const event of column) {
      if (run.length && event.sourceCell.y !== run[run.length - 1].sourceCell.y + 1) flush();
      run.push(event);
    }
    flush();
  }
  return projected;
}

export function midiFrequency(pitch) {
  if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) throw new RangeError('MIDI pitch must be 0–127');
  return 440 * (2 ** ((pitch - 69) / 12));
}

function estimateOverlapCounts(events) {
  const heap = [];
  const push = (value) => { let index = heap.length; heap.push(value); while (index > 0) { const parent = (index - 1) >> 1; if (heap[parent] <= value) break; heap[index] = heap[parent]; index = parent; } heap[index] = value; };
  const pop = () => { const first = heap[0]; const last = heap.pop(); if (heap.length) { let index = 0; while (true) { const left = index * 2 + 1; const right = left + 1; if (left >= heap.length) break; const child = right < heap.length && heap[right] < heap[left] ? right : left; if (heap[child] >= last) break; heap[index] = heap[child]; index = child; } heap[index] = last; } return first; };
  const counts = new Array(events.length); let index = 0;
  while (index < events.length) {
    const onset = events[index].onsetTick; let end = index + 1;
    while (end < events.length && events[end].onsetTick === onset) end += 1;
    while (heap.length && heap[0] <= onset) pop();
    const overlaps = heap.length + end - index;
    for (let cursor = index; cursor < end; cursor += 1) { counts[cursor] = overlaps; push(events[cursor].endTick); }
    index = end;
  }
  return counts;
}

export function createAudioPlayer({ audioContextFactory = () => new globalThis.AudioContext({ latencyHint: 'playback' }), schedule = globalThis.setTimeout, cancel = globalThis.clearTimeout, onStateChange = () => {} } = {}) {
  let context = null; let masterContext = null; let masterNode = null; let loopTimer = null; let lookaheadTimer = null; let playing = false; let starting = false; let stopAtLoopEnd = false; let token = 0; let previewToken = 0; let cycleStartAt = null; let cycleLoopTicks = null; let cycleSecondsPerTick = null; const activeNodes = new Set(); const previewNodes = new Set(); const sessions = new Set(); const nodeSessions = new WeakMap(); let transportSession = null; let previewSession = null; const chokeVoices = new Map();
  const STOP_FADE_SECONDS = 0.008;
  const STOP_CLEANUP_DELAY_MS = 28;

  function masterOutput() {
    if (!context) return null;
    if (masterContext === context) return masterNode || context.destination;
    try { masterNode?.disconnect(); } catch {}
    masterContext = context; masterNode = null;
    if (context.createDynamicsCompressor) {
      try {
        masterNode = context.createDynamicsCompressor();
        for (const [key, value] of [['threshold', -9], ['knee', 3], ['ratio', 20], ['attack', 0.001], ['release', 0.08]]) if (masterNode[key]) masterNode[key].value = value;
        masterNode.connect(context.destination);
      } catch { masterNode = null; }
    }
    return masterNode || context.destination;
  }

  function notify() { onStateChange(playing, starting); }
  function createSession(kind) {
    const bus = context.createGain(); bus.gain.value = 1; bus.connect(masterOutput());
    const session = { kind, context, bus, nodes: new Set(), sources: new Set(), cleanupTimer: null, closing: false };
    sessions.add(session);
    return session;
  }
  function registerSessionNode(session, node) {
    activeNodes.add(node); session.nodes.add(node); nodeSessions.set(node, session);
    if (session.kind === 'preview') previewNodes.add(node);
    if (typeof node.stop === 'function') session.sources.add(node);
  }
  function disposeNode(node) {
    activeNodes.delete(node);
    previewNodes.delete(node);
    const session = nodeSessions.get(node);
    if (session) { session.nodes.delete(node); session.sources.delete(node); nodeSessions.delete(node); }
    try { node.disconnect(); } catch {}
  }
  function forceCleanupSession(session) {
    if (!sessions.has(session)) return;
    if (session.cleanupTimer !== null) { cancel(session.cleanupTimer); session.cleanupTimer = null; }
    for (const node of [...session.nodes]) disposeNode(node);
    try { session.bus.disconnect(); } catch {}
    sessions.delete(session);
  }
  function fadeSession(session) {
    if (!session || session.closing) return;
    session.closing = true;
    const now = context?.currentTime ?? 0; const stopAt = now + STOP_FADE_SECONDS;
    const gain = session.bus.gain;
    try { gain.cancelScheduledValues?.(now); } catch {}
    if (gain?.setValueAtTime) gain.setValueAtTime(Number.isFinite(gain.value) ? gain.value : 1, now);
    if (gain?.linearRampToValueAtTime) gain.linearRampToValueAtTime(0, stopAt);
    else if (gain) gain.value = 0;
    for (const node of [...session.nodes]) {
      activeNodes.delete(node); previewNodes.delete(node);
    }
    for (const source of [...session.sources]) { try { source.stop(stopAt); } catch {} }
    session.cleanupTimer = schedule(() => { session.cleanupTimer = null; forceCleanupSession(session); }, STOP_CLEANUP_DELAY_MS);
  }
  function cancelPreviews() {
    previewToken += 1;
    fadeSession(previewSession); previewSession = null;
    previewNodes.clear();
  }
  function stop() {
    token += 1;
    stopAtLoopEnd = false;
    cancelPreviews();
    playing = false;
    starting = false;
    cycleStartAt = null; cycleLoopTicks = null; cycleSecondsPerTick = null; chokeVoices.clear();
    if (loopTimer !== null) { cancel(loopTimer); loopTimer = null; }
    if (lookaheadTimer !== null) { cancel(lookaheadTimer); lookaheadTimer = null; }
    fadeSession(transportSession); transportSession = null;
    notify();
  }

  async function dispose() {
    stop();
    const closing = context;
    const closingMaster = masterContext === closing ? masterNode : null;
    const closingSessions = [...sessions].filter((session) => session.context === closing);
    context = null;
    if (masterContext === closing) { masterNode = null; masterContext = null; }
    if (closing?.state === 'running' && closingSessions.some((session) => session.closing)) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, STOP_CLEANUP_DELAY_MS));
    }
    for (const session of closingSessions) forceCleanupSession(session);
    try { closingMaster?.disconnect(); } catch {}
    if (closing && typeof closing.close === 'function') {
      try { await closing.close(); } catch {}
    }
  }

  function scheduleCycle(song, cycleToken) {
    if (!playing || cycleToken !== token || !context) return;
    transportSession ||= createSession('transport');
    const events = collectAudioEvents(song, { joinAdjacent: true, outlineRuns: true });
    if (events.length > AUDIO_MAX_PLAYBACK_EVENTS) throw new RangeError(`再生できる音符数は${AUDIO_MAX_PLAYBACK_EVENTS.toLocaleString()}個までです。絵を曲に反映し直すか、音符を減らしてください。`);
    const startAt = context.currentTime + 0.035;
    const secondsPerTick = 60 / song.tempo / AUDIO_PPQ;
    cycleStartAt = startAt; cycleLoopTicks = song.loopTicks; cycleSecondsPerTick = secondsPerTick;
    const scheduled = events.map((event) => {
      const instrument = getAudioInstrument(event.instrument);
      const drumSeconds = instrument?.drum?.duration;
      return { event, instrument, onsetTick: event.startTick, endTick: event.startTick + (drumSeconds ?? (event.durationTicks * secondsPerTick + (instrument?.release || 0))) / secondsPerTick };
    });
    const colorMixPlan = createAudioColorMixPlan(scheduled);
    const playable = scheduled.map((item, index) => ({ ...item, index })).filter(({ instrument }) => instrument);
    const playableCounts = estimateOverlapCounts(playable);
    const overlapCounts = new Array(scheduled.length).fill(1);
    playable.forEach(({ index }, position) => { overlapCounts[index] = playableCounts[position]; });
    let eventIndex = 0;
    const scheduleWindow = () => {
      if (!playing || cycleToken !== token || !context) return;
      const windowEnd = context.currentTime + 1; let batch = 0;
      while (eventIndex < scheduled.length && batch < 256) {
      const item = scheduled[eventIndex];
      if (startAt + item.onsetTick * secondsPerTick > windowEnd) break;
      eventIndex += 1; batch += 1;
      const { event, instrument } = item;
      if (!instrument) continue;
      const onset = startAt + event.startTick * secondsPerTick;
      const frequency = instrument.drum?.frequency ?? midiFrequency(event.pitch);
      const gateEnd = onset + (instrument.drum ? Math.max(0, instrument.drum.duration - instrument.release) : event.durationTicks * secondsPerTick);
      const releaseEnd = instrument.drum ? onset + instrument.drum.duration : gateEnd + instrument.release;
      const soundEnd = releaseEnd + 0.005;
      // Scale only dense passages. Count notes whose gated or release sound
      // overlaps this note's audible window, including tails from earlier cells.
      const overlaps = overlapCounts[eventIndex - 1] || 1;
      const sourceMix = colorMixPlan[eventIndex - 1];
      const peak = event.velocity / 127 * 0.18 / (sourceMix ? 1 : Math.sqrt(Math.max(1, overlaps)));
      let mixGain = null;
      if (sourceMix) {
        mixGain = context.createGain();
        registerSessionNode(transportSession, mixGain);
        mixGain.connect(transportSession.bus);
        const initialPoint = sourceMix.filter(({ tick }) => tick <= event.startTick).at(-1) || sourceMix[0];
        const initialMixGain = initialPoint?.gain ?? 1;
        mixGain.gain.setValueAtTime(initialMixGain, onset);
        let lastAutomationAt = onset;
        let lastMixGain = initialMixGain;
        for (let pointIndex = 0; pointIndex < sourceMix.length; pointIndex += 1) {
          const point = sourceMix[pointIndex];
          const changeAt = startAt + point.tick * secondsPerTick;
          if (changeAt <= onset || changeAt > soundEnd || point === initialPoint) continue;
          const rampStart = Math.max(lastAutomationAt, changeAt);
          const nextPoint = sourceMix[pointIndex + 1];
          const nextChangeAt = nextPoint ? startAt + nextPoint.tick * secondsPerTick : soundEnd;
          const rampEnd = Math.min(soundEnd, nextChangeAt, rampStart + 0.02);
          mixGain.gain.setValueAtTime(lastMixGain, rampStart);
          if (rampEnd > rampStart) mixGain.gain.linearRampToValueAtTime(point.gain, rampEnd);
          else mixGain.gain.setValueAtTime(point.gain, rampStart);
          lastAutomationAt = rampEnd;
          lastMixGain = point.gain;
        }
      }
      const voice = scheduleAudioVoice(context, instrument, { frequency, velocity: event.velocity, onset, gateEnd, releaseEnd, peak, destination: mixGain || transportSession.bus, registerNode: (node) => registerSessionNode(transportSession, node), onSourceEnded: disposeNode });
      const chokeGroup = instrument.drum?.chokeGroup;
      if (chokeGroup && voice.choke) {
        let group = chokeVoices.get(chokeGroup);
        if (group && onset > group.onset + 1e-9) {
          for (const previous of group.voices) previous.choke(onset);
          group = null;
        }
        if (!group) { group = { onset, voices: [] }; chokeVoices.set(chokeGroup, group); }
        group.voices.push(voice);
      }
      let remaining = voice.sources.length;
      const cleanNote = () => { for (const node of [voice.gain, mixGain, voice.sum, voice.filter, ...voice.nodes]) if (node) disposeNode(node); };
      voice.sources.forEach((source) => {
        const previous = source.onended;
        source.onended = () => { previous?.(); remaining -= 1; if (!remaining) cleanNote(); };
      });
      if (!remaining) cleanNote();
      }
      if (eventIndex < scheduled.length) lookaheadTimer = schedule(() => { lookaheadTimer = null; scheduleWindow(); }, 25);
    };
    loopTimer = schedule(() => {
      loopTimer = null;
      if (lookaheadTimer !== null) { cancel(lookaheadTimer); lookaheadTimer = null; }
      if (!stopAtLoopEnd) { scheduleCycle(song, cycleToken); return; }
      const releaseMs = Math.max(0, ...events.map(({ instrument: id }) => {
        const profile = getAudioInstrument(id);
        return profile?.drum?.duration || profile?.release || 0;
      })) * 1000;
      loopTimer = schedule(stop, releaseMs + 60);
    }, song.loopTicks * secondsPerTick * 1000);
    scheduleWindow();
  }

  async function preview({ instrument: instrumentId, pitch, velocity = 80, duration = 0.12 } = {}) {
    const instrument = getAudioInstrument(instrumentId);
    if (!instrument || !Number.isInteger(pitch) || pitch < 0 || pitch > 127 || !Number.isInteger(velocity) || velocity < 1 || velocity > 127 || !Number.isFinite(duration) || duration <= 0 || duration > 1) throw new TypeError('試聴する音色・音程・強さ・長さが不正です');
    cancelPreviews();
    const previewId = previewToken;
    if (!context) context = audioContextFactory();
    if (!context) throw new Error('AudioContext unavailable');
    try { await context.resume(); }
    catch (error) { if (previewId !== previewToken || !context) return false; throw error; }
    if (previewId !== previewToken || !context) return false;

    const onset = context.currentTime + 0.035;
    previewSession ||= createSession('preview');
    const gateEnd = onset + Math.max(0.035, duration);
    const releaseEnd = gateEnd + instrument.release;
    const peak = velocity / 127 * 0.18;
    const voice = scheduleAudioVoice(context, instrument, { frequency: midiFrequency(pitch), velocity, onset, gateEnd, releaseEnd, peak, destination: previewSession.bus, registerNode: (node) => registerSessionNode(previewSession, node), onSourceEnded: disposeNode });
    let remaining = voice.sources.length;
    for (const source of voice.sources) {
      const previous = source.onended;
      source.onended = () => { previous?.(); remaining -= 1; if (!remaining) for (const node of voice.nodes) { disposeNode(node); previewNodes.delete(node); } };
    }
    if (!remaining) for (const node of voice.nodes) { disposeNode(node); previewNodes.delete(node); }
    return true;
  }

  return Object.freeze({
    get isPlaying() { return playing; },
    get isStarting() { return starting; },
    get currentTick() {
      if (!playing || !context || cycleStartAt === null || cycleLoopTicks === null || cycleSecondsPerTick === null) return null;
      const elapsed = context.currentTime - cycleStartAt;
      if (elapsed < 0) return null;
      return Math.min(cycleLoopTicks - 1, Math.floor(elapsed / cycleSecondsPerTick));
    },
    preview,
    stopAfterCurrentLoop() {
      if (!playing && !starting) return false;
      stopAtLoopEnd = true;
      return true;
    },
    async play(song) {
      validateAudioSong(song);
      if (!collectAudioEvents(song).length) return false;
      stop();
      const playToken = token;
      try {
        // Construct AudioContext synchronously during the user's click gesture.
        if (!context) context = audioContextFactory();
        if (!context) throw new Error('AudioContext unavailable');
        starting = true; notify();
        await context.resume();
        if (playToken !== token) return false;
        starting = false; playing = true; notify(); scheduleCycle(song, playToken); return true;
      } catch (error) {
        if (playToken !== token) return false;
        await dispose();
        throw error;
      }
    },
    stop,
    dispose
  });
}
