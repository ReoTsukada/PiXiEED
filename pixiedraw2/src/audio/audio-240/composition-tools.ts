/** Lightweight, deterministic composition helpers for the Tick-native roll. */

import type { AudioClockSpec, AudioTick } from "../audio-200/index.ts";
import {
  type PianoRollNote,
  pianoRollNoteFromTicks,
  pianoRollNoteTicks,
} from "./piano-roll.ts";

export interface HumanizePianoRollOptions {
  readonly timingTicks?: number;
  readonly velocityAmount?: number;
  readonly durationTicks?: number;
  readonly seed?: number;
}

export interface SwingPianoRollOptions {
  readonly subdivisionTicks: number;
  readonly amountPercent: number;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, finite(value, min)));
}

/** Move every second subdivision towards the following subdivision. */
export function swingTick(
  tick: number,
  subdivisionTicks: number,
  amountPercent: number,
): AudioTick {
  const subdivision = Math.max(1, Math.round(finite(subdivisionTicks, 1)));
  const index = Math.max(
    0,
    Math.round(Math.max(0, finite(tick, 0)) / subdivision),
  );
  if (index % 2 === 0) return Math.max(0, Math.round(tick)) as AudioTick;
  const amount = clamp(amountPercent, 0, 100) / 100;
  const offset = Math.round(subdivision * amount / 3);
  return Math.max(0, Math.round(tick) + offset) as AudioTick;
}

function seededRandom(seed: number): () => number {
  let state = (Math.trunc(seed) >>> 0) || 0x9e3779b9;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function projectNotes(
  notes: readonly PianoRollNote[],
  clock: AudioClockSpec,
  transform: (note: PianoRollNote, index: number) => {
    readonly startTick: AudioTick;
    readonly durationTick: AudioTick;
    readonly velocity: number;
  },
): readonly PianoRollNote[] {
  return notes.map((note, index) => {
    const next = transform(note, index);
    return pianoRollNoteFromTicks(
      {
        id: note.id,
        pitchMidi: note.pitchMidi,
        startTick: next.startTick,
        durationTick: next.durationTick,
        velocity: next.velocity,
        instrument: note.instrument,
      },
      clock,
    ) ?? note;
  });
}

export function swingPianoRollNotes(
  notes: readonly PianoRollNote[],
  clock: AudioClockSpec,
  options: SwingPianoRollOptions,
): readonly PianoRollNote[] {
  return projectNotes(notes, clock, (note) => {
    const ticks = pianoRollNoteTicks(note, clock);
    return {
      startTick: swingTick(
        Number(ticks.startTick),
        options.subdivisionTicks,
        options.amountPercent,
      ),
      durationTick: ticks.durationTick,
      velocity: note.velocity,
    };
  });
}

export function humanizePianoRollNotes(
  notes: readonly PianoRollNote[],
  clock: AudioClockSpec,
  options: HumanizePianoRollOptions = {},
): readonly PianoRollNote[] {
  const random = seededRandom(options.seed ?? 0x51f15e);
  const timingTicks = Math.max(
    0,
    Math.round(finite(options.timingTicks ?? 12, 12)),
  );
  const durationTicks = Math.max(
    0,
    Math.round(finite(options.durationTicks ?? 0, 0)),
  );
  const velocityAmount = clamp(
    finite(options.velocityAmount ?? 0.08, 0.08),
    0,
    0.5,
  );
  return projectNotes(notes, clock, (note) => {
    const ticks = pianoRollNoteTicks(note, clock);
    const timingOffset = Math.round((random() * 2 - 1) * timingTicks);
    const durationOffset = Math.round((random() * 2 - 1) * durationTicks);
    const velocityOffset = (random() * 2 - 1) * velocityAmount;
    return {
      startTick: Math.max(
        0,
        Number(ticks.startTick) + timingOffset,
      ) as AudioTick,
      durationTick: Math.max(
        1,
        Number(ticks.durationTick) + durationOffset,
      ) as AudioTick,
      velocity: clamp(note.velocity + velocityOffset, 0.05, 1),
    };
  });
}
