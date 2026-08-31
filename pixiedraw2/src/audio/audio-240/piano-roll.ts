/** Pure piano-roll geometry shared by the Audio workspace and its tests. */

import type { AudioTick } from "../audio-200/contracts.ts";
import {
  type AudioClockSpec,
  audioFrameToTick,
  audioTickToFrame,
} from "../audio-200/timebase.ts";

export const PIANO_ROLL_LOW_MIDI = 21; // A0
export const PIANO_ROLL_HIGH_MIDI = 108; // C8

export type PianoRollInstrumentId =
  | "PIANO"
  | "PIANO_2"
  | "EPIANO"
  | "ORGAN"
  | "CLAVINET"
  | "GUITAR"
  | "ELECTRIC_GUITAR"
  | "CHIP"
  | "BASS"
  | "STRINGS"
  | "VIOLIN"
  | "CELLO"
  | "HARP"
  | "MARIMBA"
  | "KALIMBA"
  | "VIBRAPHONE"
  | "XYLOPHONE"
  | "CELESTA"
  | "TUBULAR_BELLS"
  | "STEEL_DRUM"
  | "FLUTE"
  | "CLARINET"
  | "SAXOPHONE"
  | "TRUMPET"
  | "BRASS"
  | "SYNTH_LEAD"
  | "SYNTH_PAD"
  | "GB_PULSE_1"
  | "GB_PULSE_2"
  | "GB_WAVE"
  | "GB_NOISE"
  | "NES_PULSE_1"
  | "NES_PULSE_2"
  | "NES_TRIANGLE"
  | "NES_NOISE"
  | "DRUMS"
  | "TAMBOURINE"
  | "SHAKER";

export type PianoRollQuantize =
  | "off"
  | "1/4"
  | "1/8"
  | "1/16"
  | "1/32"
  | "1/64";

export interface PianoRollPitch {
  readonly midi: number;
  readonly label: string;
  readonly black: boolean;
}

export interface PianoRollNote {
  readonly id: string;
  readonly pitchMidi: number;
  /** UI projection. The canonical edit/save unit is startTick. */
  readonly startFrame: number;
  /** UI projection. The canonical edit/save unit is durationTick. */
  readonly durationFrames: number;
  /** Canonical MIDI position. Optional only for legacy UI fixtures. */
  readonly startTick?: AudioTick;
  /** Canonical MIDI length. Optional only for legacy UI fixtures. */
  readonly durationTick?: AudioTick;
  readonly velocity: number;
  readonly instrument: PianoRollInstrumentId;
}

export interface PianoRollTickProjection {
  readonly startTick: AudioTick;
  readonly durationTick: AudioTick;
}

/** Resolve a note's canonical Tick range, projecting legacy frame notes once. */
export function pianoRollNoteTicks(
  note: PianoRollNote,
  clock: AudioClockSpec,
): PianoRollTickProjection {
  const startTick = note.startTick ?? audioFrameToTick(note.startFrame, clock);
  const endTick = note.durationTick === undefined
    ? audioFrameToTick(note.startFrame + note.durationFrames, clock)
    : startTick + note.durationTick;
  return {
    startTick,
    durationTick: Math.max(1, endTick - startTick) as AudioTick,
  };
}

/** Recalculate the Tick metadata after a legacy frame gesture. */
export function pianoRollNoteWithProjectedTicks(
  note: PianoRollNote,
  clock: AudioClockSpec,
): PianoRollNote {
  const startTick = audioFrameToTick(note.startFrame, clock);
  const endTick = audioFrameToTick(
    note.startFrame + Math.max(1, note.durationFrames),
    clock,
  );
  return {
    ...note,
    startTick,
    durationTick: Math.max(1, endTick - startTick) as AudioTick,
  };
}

/** Project a canonical Tick note to the current visible frame geometry. */
export function pianoRollNoteFromTicks(
  input:
    & Omit<PianoRollNote, "startFrame" | "durationFrames">
    & PianoRollTickProjection,
  clock: AudioClockSpec,
  frameCount = Number.POSITIVE_INFINITY,
): PianoRollNote | undefined {
  return createPianoRollNote({
    id: input.id,
    pitchMidi: input.pitchMidi,
    startFrame: audioTickToFrame(input.startTick, clock),
    durationFrames: Math.max(1, audioTickToFrame(input.durationTick, clock)),
    velocity: input.velocity,
    instrument: input.instrument,
    frameCount,
    startTick: input.startTick,
    durationTick: input.durationTick,
  });
}

/** Snap a canonical Tick to a musical subdivision. */
export function snapPianoRollTick(
  tick: number,
  options: {
    readonly maxTick: number;
    readonly ppq: number;
    readonly quantize: PianoRollQuantize;
  },
): AudioTick {
  const maxTick = Math.max(
    1,
    Number.isFinite(options.maxTick) ? Math.trunc(options.maxTick) : 1,
  );
  const boundedTick = Math.max(
    0,
    Math.min(maxTick, Number.isFinite(tick) ? Math.round(tick) : 0),
  );
  if (options.quantize === "off") return boundedTick as AudioTick;
  const denominator = options.quantize === "1/4"
    ? 4
    : options.quantize === "1/8"
    ? 8
    : options.quantize === "1/16"
    ? 16
    : options.quantize === "1/32"
    ? 32
    : options.quantize === "1/64"
    ? 64
    : 0;
  const ppq = Number.isFinite(options.ppq) ? Math.max(1, options.ppq) : 480;
  const quantum = (ppq * 4) / Math.max(1, denominator);
  return Math.max(
    0,
    Math.min(maxTick, Math.round(boundedTick / quantum) * quantum),
  ) as AudioTick;
}

/**
 * Compatibility projection for the existing canvas. Frames are never saved;
 * they are only used to locate the visible cell at the current FPS.
 */
export function snapPianoRollFrame(
  frame: number,
  options: {
    readonly frameCount: number;
    readonly fps: number;
    readonly bpm: number;
    readonly ppq: number;
    readonly quantize: PianoRollQuantize;
  },
): number {
  const frameCount = Number.isFinite(options.frameCount)
    ? Math.max(1, Math.trunc(options.frameCount))
    : 1;
  const safeFrame = Number.isFinite(frame) ? Math.trunc(frame) : 0;
  const boundedFrame = Math.max(0, Math.min(frameCount - 1, safeFrame));
  if (options.quantize === "off") return boundedFrame;

  const denominator = options.quantize === "1/4"
    ? 4
    : options.quantize === "1/8"
    ? 8
    : options.quantize === "1/16"
    ? 16
    : options.quantize === "1/32"
    ? 32
    : options.quantize === "1/64"
    ? 64
    : 0;
  if (
    denominator === 0 || !Number.isFinite(options.fps) || options.fps <= 0 ||
    !Number.isFinite(options.bpm) || options.bpm <= 0 ||
    !Number.isFinite(options.ppq) || options.ppq <= 0
  ) return boundedFrame;

  const ticksPerFrame = (options.bpm * options.ppq) /
    (60 * options.fps);
  const quantizeTicks = (options.ppq * 4) / denominator;
  if (
    !Number.isFinite(ticksPerFrame) || ticksPerFrame <= 0 ||
    !Number.isFinite(quantizeTicks) || quantizeTicks <= 0
  ) return boundedFrame;

  const snappedTicks = Math.round(
    (boundedFrame * ticksPerFrame) / quantizeTicks,
  ) * quantizeTicks;
  const snappedFrame = Math.round(snappedTicks / ticksPerFrame);
  return Math.max(0, Math.min(frameCount - 1, snappedFrame));
}

const PITCH_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);

export function pitchLabel(midi: number): string {
  const safeMidi = Math.trunc(midi);
  const name = PITCH_NAMES[((safeMidi % 12) + 12) % 12] ?? "C";
  return `${name}${Math.floor(safeMidi / 12) - 1}`;
}

export function createPianoRollPitchRange(
  lowMidi = PIANO_ROLL_LOW_MIDI,
  highMidi = PIANO_ROLL_HIGH_MIDI,
): readonly PianoRollPitch[] {
  const low = Math.max(
    0,
    Math.min(127, Number.isFinite(lowMidi) ? Math.trunc(lowMidi) : 0),
  );
  const high = Math.max(
    low,
    Math.min(127, Number.isFinite(highMidi) ? Math.trunc(highMidi) : low),
  );
  return Array.from({ length: high - low + 1 }, (_, offset) => {
    const midi = low + offset;
    return {
      midi,
      label: pitchLabel(midi),
      black: BLACK_PITCH_CLASSES.has(midi % 12),
    };
  });
}

export function createPianoRollNote(input: {
  readonly id: string;
  readonly pitchMidi: number;
  readonly startFrame: number;
  readonly durationFrames: number;
  readonly startTick?: AudioTick;
  readonly durationTick?: AudioTick;
  readonly velocity?: number;
  readonly instrument: PianoRollInstrumentId;
  readonly frameCount?: number;
}): PianoRollNote | undefined {
  const frameCount = input.frameCount === undefined ||
      input.frameCount === Number.POSITIVE_INFINITY
    ? Number.POSITIVE_INFINITY
    : Math.max(
      1,
      Number.isFinite(input.frameCount) ? Math.trunc(input.frameCount) : 1,
    );
  const pitchMidi = Math.trunc(input.pitchMidi);
  const startFrame = Math.max(0, Math.trunc(input.startFrame));
  if (
    !input.id.trim() || pitchMidi < 0 || pitchMidi > 127 ||
    startFrame >= frameCount
  ) return undefined;
  const requestedDuration = Number.isFinite(input.durationFrames)
    ? Math.trunc(input.durationFrames)
    : 1;
  const durationFrames = Math.max(
    1,
    Math.min(
      requestedDuration,
      Math.max(1, frameCount - startFrame),
    ),
  );
  const velocity = Math.min(
    1,
    Math.max(
      0.05,
      Number.isFinite(input.velocity) ? input.velocity ?? 0.8 : 0.8,
    ),
  );
  return {
    id: input.id,
    pitchMidi,
    startFrame,
    durationFrames,
    ...(input.startTick === undefined ? {} : { startTick: input.startTick }),
    ...(input.durationTick === undefined
      ? {}
      : { durationTick: input.durationTick }),
    velocity,
    instrument: input.instrument,
  };
}

export function noteCoversFrame(note: PianoRollNote, frame: number): boolean {
  const safeFrame = Math.trunc(frame);
  return safeFrame >= note.startFrame &&
    safeFrame < note.startFrame + note.durationFrames;
}

export function resizePianoRollNote(
  note: PianoRollNote,
  durationFrames: number,
  frameCount = Number.POSITIVE_INFINITY,
): PianoRollNote {
  const safeFrameCount = Number.isFinite(frameCount)
    ? Math.max(1, Math.trunc(frameCount))
    : Number.POSITIVE_INFINITY;
  const requestedDuration = Number.isFinite(durationFrames)
    ? Math.trunc(durationFrames)
    : 1;
  const boundedDuration = Math.max(
    1,
    Math.min(
      requestedDuration,
      Math.max(1, safeFrameCount - note.startFrame),
    ),
  );
  return { ...note, durationFrames: boundedDuration };
}

/** Resize in canonical Tick space and update the visible frame projection. */
export function resizePianoRollNoteInTicks(
  note: PianoRollNote,
  durationTick: number,
  clock: AudioClockSpec,
  frameCount = Number.POSITIVE_INFINITY,
): PianoRollNote {
  const ticks = pianoRollNoteTicks(note, clock);
  const boundedDurationTick = Math.max(
    1,
    Number.isFinite(durationTick)
      ? Math.round(durationTick)
      : ticks.durationTick,
  ) as AudioTick;
  const resized = resizePianoRollNote(
    {
      ...note,
      startFrame: audioTickToFrame(ticks.startTick, clock),
      durationFrames: Math.max(1, audioTickToFrame(boundedDurationTick, clock)),
    },
    audioTickToFrame(boundedDurationTick, clock),
    frameCount,
  );
  return {
    ...resized,
    startTick: ticks.startTick,
    durationTick: boundedDurationTick,
  };
}

export function framesPerMeasure(
  fps: number,
  bpm: number,
  ppq: number,
  numerator: number,
  denominator: number,
): number {
  if (
    !Number.isFinite(fps) || fps <= 0 || !Number.isFinite(bpm) || bpm <= 0 ||
    !Number.isFinite(ppq) || ppq <= 0
  ) return 1;
  const beats = Math.max(1, Number.isFinite(numerator) ? numerator : 4);
  const beatTicks = ppq * 4 /
    Math.max(1, Number.isFinite(denominator) ? denominator : 4);
  return Math.max(1, Math.round((beats * beatTicks * 60 * fps) / (bpm * ppq)));
}
