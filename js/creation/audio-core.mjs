export const AUDIO_SCHEMA_VERSION = 1;
export const AUDIO_PPQ = 480;
export const AUDIO_STEP_TICKS = AUDIO_PPQ / 2;
export const AUDIO_PIXEL_TICKS = AUDIO_PPQ / 4;
export const AUDIO_PIXEL_COLUMNS = 16;
export const AUDIO_PIXEL_PITCHES = Object.freeze([84, 81, 79, 76, 74, 72, 69, 67, 64, 62, 60, 57, 55, 52, 50, 48]);
export const AUDIO_PIXEL_COLUMN_OPTIONS = Object.freeze([16, 32, 64, 128]);
export const AUDIO_BAR_TICKS = AUDIO_PPQ * 4;
export const AUDIO_MAX_LOOP_TICKS = AUDIO_BAR_TICKS * 16;
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
import { AUDIO_INSTRUMENTS, getAudioInstrument } from './audio-timbres.mjs?rev=20260928-dot-music-1';
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
export function extendAudioLoopForImage(song, width) {
  validateAudioSong(song);
  if (!Number.isInteger(width) || width < 1 || width > AUDIO_SHARED_IMAGE_MAX_DIMENSION) throw new RangeError('画像の横幅は1〜256列です');
  const requiredTicks = Math.ceil(width * AUDIO_PIXEL_TICKS / AUDIO_BAR_TICKS) * AUDIO_BAR_TICKS;
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

export function collectAudioEvents(song, { joinAdjacent = false } = {}) {
  validateAudioSong(song);
  const events = [];
  const instruments = new Map((song.pixelPalette || AUDIO_PIXEL_PALETTE).map((slot) => [slot.slotId, slot.instrument]));
  for (const track of song.tracks) for (const clip of track.clips) for (const note of clip.notes) {
    events.push({ instrument: instruments.get(track.instrument) || track.instrument, startTick: note.startTick, durationTicks: note.durationTicks, pitch: note.pitch, velocity: note.velocity,
      trackId: track.trackId, colorId: note.colorId || `slot-${track.instrument}`, sourceCell: note.sourceCell || null });
  }
  const audible = joinAdjacent ? [] : events;
  if (joinAdjacent) {
    const lanes = new Map();
    for (const event of events) {
      const key = JSON.stringify([event.trackId, event.pitch, event.sourceCell?.y ?? null]);
      if (!lanes.has(key)) lanes.set(key, []);
      lanes.get(key).push(event);
    }
    for (const lane of lanes.values()) {
      lane.sort((left, right) => left.startTick - right.startTick);
      let current = null;
      for (const event of lane) {
        if (current && current.colorId === event.colorId && current.velocity === event.velocity
          && current.startTick + current.durationTicks === event.startTick
          && Boolean(current.sourceCell) === Boolean(event.sourceCell)
          && (!event.sourceCell || current.sourceCell.x + 1 === event.sourceCell.x)) {
          current.durationTicks += event.durationTicks;
          if (event.sourceCell) current.sourceCell = event.sourceCell;
        } else { current = { ...event }; audible.push(current); }
      }
    }
  }
  return audible.map(({ trackId, colorId, sourceCell, ...event }) => event)
    .sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch || (left.instrument < right.instrument ? -1 : left.instrument > right.instrument ? 1 : 0));
}

export function midiFrequency(pitch) {
  if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) throw new RangeError('MIDI pitch must be 0–127');
  return 440 * (2 ** ((pitch - 69) / 12));
}

const pulseWaveCache = new WeakMap();
function getPulseWave(context, duty = 0.25) {
  let waves = pulseWaveCache.get(context);
  if (!waves) { waves = new Map(); pulseWaveCache.set(context, waves); }
  if (waves.has(duty)) return waves.get(duty);
  if (typeof context.createPeriodicWave !== 'function') return null;
  const harmonics = 32; const real = new Float32Array(harmonics + 1); const imag = new Float32Array(harmonics + 1);
  for (let harmonic = 1; harmonic <= harmonics; harmonic += 1) {
    const angle = 2 * Math.PI * harmonic * duty;
    real[harmonic] = Math.sin(angle) / (Math.PI * harmonic);
    imag[harmonic] = (1 - Math.cos(angle)) / (Math.PI * harmonic);
  }
  const wave = context.createPeriodicWave(real, imag);
  waves.set(duty, wave);
  return wave;
}

function makeInstrumentSource(context, profile, waveform, duty, frequency, onset, partial = null) {
  if (waveform === 'noise') {
    const length = Math.max(1, Math.ceil(context.sampleRate * 0.3));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0); let b0 = 0; let b1 = 0; let b2 = 0;
    for (let index = 0; index < data.length; index += 1) {
      const white = Math.random() * 2 - 1;
      if (profile.noiseColor === 'pink') { b0 = 0.99765 * b0 + white * 0.099046; b1 = 0.963 * b1 + white * 0.2965164; b2 = 0.57 * b2 + white * 1.0526913; data[index] = (b0 + b1 + b2 + white * 0.1848) * 0.12; }
      else data[index] = white;
    }
    const source = context.createBufferSource(); source.buffer = buffer; return source;
  }
  const source = context.createOscillator();
  if (waveform === 'pulse') {
    const wave = getPulseWave(context, duty);
    if (wave) source.setPeriodicWave(wave); else source.type = 'square';
  } else source.type = waveform;
  const ratio = partial?.ratio ?? 1;
  const frequencyValue = Math.max(20, Math.min(20000, frequency * ratio));
  source.frequency.setValueAtTime(frequencyValue, onset);
  if (partial?.detune && source.detune?.setValueAtTime) source.detune.setValueAtTime(partial.detune, onset);
  if (partial === null && ['marimba', 'xylophone'].includes(profile.id)) {
    source.frequency.setValueAtTime(frequencyValue * 1.018, onset);
    if (source.frequency.exponentialRampToValueAtTime) source.frequency.exponentialRampToValueAtTime(frequencyValue, onset + 0.025);
  }
  return source;
}

export function createAudioPlayer({ audioContextFactory = () => new globalThis.AudioContext(), schedule = globalThis.setTimeout, cancel = globalThis.clearTimeout, onStateChange = () => {} } = {}) {
  let context = null; let loopTimer = null; let playing = false; let starting = false; let stopAtLoopEnd = false; let token = 0; let previewToken = 0; let cycleStartAt = null; let cycleLoopTicks = null; let cycleSecondsPerTick = null; const activeNodes = new Set(); const previewNodes = new Set();

  function notify() { onStateChange(playing, starting); }
  function disposeNode(node) {
    activeNodes.delete(node);
    previewNodes.delete(node);
    try { node.disconnect(); } catch {}
  }
  function cancelPreviews() {
    previewToken += 1;
    const now = context?.currentTime ?? 0;
    for (const node of [...previewNodes]) {
      try { node.stop(now); } catch {}
      disposeNode(node);
    }
    previewNodes.clear();
  }
  function stop() {
    token += 1;
    stopAtLoopEnd = false;
    cancelPreviews();
    playing = false;
    starting = false;
    cycleStartAt = null; cycleLoopTicks = null; cycleSecondsPerTick = null;
    if (loopTimer !== null) { cancel(loopTimer); loopTimer = null; }
    const now = context?.currentTime ?? 0;
    for (const node of [...activeNodes]) {
      try { node.stop(now); } catch {}
      disposeNode(node);
    }
    notify();
  }

  async function dispose() {
    stop();
    const closing = context;
    context = null;
    if (closing && typeof closing.close === 'function') {
      try { await closing.close(); } catch {}
    }
  }

  function scheduleCycle(song, cycleToken) {
    if (!playing || cycleToken !== token || !context) return;
    const events = collectAudioEvents(song, { joinAdjacent: true }); const startAt = context.currentTime + 0.035;
    const secondsPerTick = 60 / song.tempo / AUDIO_PPQ;
    cycleStartAt = startAt; cycleLoopTicks = song.loopTicks; cycleSecondsPerTick = secondsPerTick;
    const scheduled = events.map((event) => {
      const instrument = getAudioInstrument(event.instrument);
      return { event, instrument, onsetTick: event.startTick, endTick: event.startTick + event.durationTicks + (instrument?.release || 0) / secondsPerTick };
    });
    for (const { event, instrument, endTick } of scheduled) {
      if (!instrument) continue;
      const onset = startAt + event.startTick * secondsPerTick;
      const frequency = midiFrequency(event.pitch);
      const gateEnd = onset + event.durationTicks * secondsPerTick;
      const releaseEnd = gateEnd + instrument.release;
      const soundEnd = releaseEnd + 0.005;
      const decayEnd = Math.min(gateEnd, onset + instrument.attack + instrument.decay);
      // Scale only dense passages. Count notes whose gated or release sound
      // overlaps this note's audible window, including tails from earlier cells.
      const overlaps = scheduled.filter((candidate) => candidate.instrument && candidate.onsetTick < endTick && candidate.endTick > event.startTick).length;
      const peak = event.velocity / 127 * 0.18 / Math.sqrt(Math.max(1, overlaps));
      const sum = context.createGain();
      let output = sum;
      let filterNode = null;
      if (instrument.filter && context.createBiquadFilter) {
        filterNode = context.createBiquadFilter();
        filterNode.type = instrument.filter.type; filterNode.frequency.value = instrument.filter.frequency; filterNode.Q.value = instrument.filter.q;
        sum.connect(filterNode); output = filterNode; activeNodes.add(filterNode);
      }
      const gain = context.createGain();
      output.connect(gain); gain.connect(context.destination);
      gain.gain.setValueAtTime(0, onset);
      gain.gain.linearRampToValueAtTime(peak, onset + instrument.attack);
      gain.gain.linearRampToValueAtTime(peak * instrument.sustain, decayEnd);
      gain.gain.setValueAtTime(peak * instrument.sustain, gateEnd);
      gain.gain.linearRampToValueAtTime(0, releaseEnd);
      const sources = [makeInstrumentSource(context, instrument, instrument.waveform, instrument.duty, frequency, onset)];
      for (const partial of instrument.partials) sources.push(makeInstrumentSource(context, instrument, partial.waveform, instrument.duty, frequency, onset, partial));
      if (instrument.transient > 0 && context.createBuffer && context.createBufferSource) {
        const transientLength = Math.max(1, Math.ceil(context.sampleRate * 0.025));
        const buffer = context.createBuffer(1, transientLength, context.sampleRate); const data = buffer.getChannelData(0);
        for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
        const transient = context.createBufferSource(); transient.buffer = buffer; sources.push(transient);
      }
      const sourceGains = [1, ...instrument.partials.map(({ gain: level }) => level), ...(sources.length > instrument.partials.length + 1 ? [instrument.transient] : [])];
      let remainingSources = sources.length;
      const cleanNote = () => {
        disposeNode(gain); disposeNode(sum);
        if (filterNode) disposeNode(filterNode);
      };
      sources.forEach((source, index) => {
        const sourceGain = sourceGains[index] ?? 1;
        let route = null;
        if (sourceGain === 1) source.connect(sum);
        else { route = context.createGain(); route.gain.value = sourceGain; source.connect(route); route.connect(sum); activeNodes.add(route); }
        source.onended = () => { disposeNode(source); if (route) disposeNode(route); remainingSources -= 1; if (remainingSources === 0) cleanNote(); };
        activeNodes.add(source); source.start(onset); source.stop(soundEnd);
      });
      activeNodes.add(sum); activeNodes.add(gain);
    }
    loopTimer = schedule(() => {
      loopTimer = null;
      if (!stopAtLoopEnd) { scheduleCycle(song, cycleToken); return; }
      const releaseMs = Math.max(0, ...events.map(({ instrument: id }) => getAudioInstrument(id)?.release || 0)) * 1000;
      loopTimer = schedule(stop, releaseMs + 60);
    }, song.loopTicks * secondsPerTick * 1000);
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

    const onset = context.currentTime + 0.008;
    const gateEnd = onset + Math.max(0.035, duration);
    const releaseEnd = gateEnd + Math.min(instrument.release, 0.16);
    const sum = context.createGain(); let output = sum; let filterNode = null;
    if (instrument.filter && context.createBiquadFilter) {
      filterNode = context.createBiquadFilter();
      filterNode.type = instrument.filter.type; filterNode.frequency.value = instrument.filter.frequency; filterNode.Q.value = instrument.filter.q;
      sum.connect(filterNode); output = filterNode;
    }
    const gain = context.createGain(); output.connect(gain); gain.connect(context.destination);
    const peak = velocity / 127 * 0.18;
    gain.gain.setValueAtTime(0, onset);
    gain.gain.linearRampToValueAtTime(peak, onset + Math.min(instrument.attack, duration * 0.45));
    gain.gain.linearRampToValueAtTime(peak * instrument.sustain, Math.min(gateEnd, onset + instrument.attack + instrument.decay));
    gain.gain.setValueAtTime(peak * instrument.sustain, gateEnd);
    gain.gain.linearRampToValueAtTime(0, releaseEnd);
    const sources = [makeInstrumentSource(context, instrument, instrument.waveform, instrument.duty, midiFrequency(pitch), onset)];
    for (const part of instrument.partials) sources.push(makeInstrumentSource(context, instrument, part.waveform, instrument.duty, midiFrequency(pitch), onset, part));
    if (instrument.transient > 0 && context.createBuffer && context.createBufferSource) {
      const length = Math.max(1, Math.ceil(context.sampleRate * Math.min(0.025, duration)));
      const buffer = context.createBuffer(1, length, context.sampleRate); const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
      const transient = context.createBufferSource(); transient.buffer = buffer; sources.push(transient);
    }
    let remaining = sources.length;
    const cleanup = () => { disposeNode(gain); disposeNode(sum); if (filterNode) disposeNode(filterNode); };
    sources.forEach((source, index) => {
      const level = index === 0 ? 1 : index <= instrument.partials.length ? instrument.partials[index - 1].gain : instrument.transient;
      let route = null;
      if (level === 1) source.connect(sum);
      else { route = context.createGain(); route.gain.value = level; source.connect(route); route.connect(sum); activeNodes.add(route); previewNodes.add(route); }
      source.onended = () => { disposeNode(source); if (route) disposeNode(route); remaining -= 1; if (remaining === 0) cleanup(); };
      activeNodes.add(source); previewNodes.add(source); source.start(onset); source.stop(releaseEnd + 0.005);
    });
    activeNodes.add(sum); activeNodes.add(gain); previewNodes.add(sum); previewNodes.add(gain);
    if (filterNode) { activeNodes.add(filterNode); previewNodes.add(filterNode); }
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
