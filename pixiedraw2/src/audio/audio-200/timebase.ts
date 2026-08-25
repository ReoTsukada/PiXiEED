/**
 * Canonical Audio-200 clock conversions.
 *
 * The Project is authoritative in PPQ ticks. Frames are the Draw/UI
 * projection and seconds are the runtime/render projection. Keeping all three
 * conversions here prevents the editor, scheduler, renderer, and recording
 * bridge from accumulating slightly different rounding rules.
 */

import {
  asAudioTick,
  asAudioTrackId,
  type AudioProject,
  type AudioTick,
  type AudioTrackId,
} from "./contracts.ts";

export interface AudioClockSpec {
  readonly framesPerSecond: number;
  readonly tempoMilliBpm: number;
  readonly ticksPerQuarter: number;
}

export interface AudioClockPosition {
  readonly frame: number;
  readonly tick: AudioTick;
  readonly seconds: number;
}

const MAX_TICK = 9_000_000_000;
const SAFE_INSTRUMENT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function positiveFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function audioClockForProject(
  project: AudioProject,
  framesPerSecond: number,
): AudioClockSpec {
  return {
    framesPerSecond: positiveFinite(framesPerSecond, 24),
    tempoMilliBpm: positiveFinite(project.tempo.milliBpm, 120_000),
    ticksPerQuarter: positiveFinite(
      project.timebase.ticksPerQuarter,
      480,
    ),
  };
}

export function audioTicksPerSecond(clock: AudioClockSpec): number {
  return clock.tempoMilliBpm * clock.ticksPerQuarter / 60_000;
}

export function audioFramesPerSecond(clock: AudioClockSpec): number {
  return clock.framesPerSecond;
}

export function audioTickToSeconds(
  tick: number,
  clock: AudioClockSpec,
): number {
  const ticks = Number.isFinite(tick) ? Math.max(0, tick) : 0;
  return ticks / audioTicksPerSecond(clock);
}

export function audioSecondsToTick(
  seconds: number,
  clock: AudioClockSpec,
): AudioTick {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const tick = Math.round(value * audioTicksPerSecond(clock));
  if (tick > MAX_TICK) {
    throw new RangeError("Audio tick exceeds the canonical range.");
  }
  return asAudioTick(tick);
}

export function audioFrameToSeconds(
  frame: number,
  clock: AudioClockSpec,
): number {
  const frames = Number.isFinite(frame) ? Math.max(0, frame) : 0;
  return frames / audioFramesPerSecond(clock);
}

export function audioSecondsToFrame(
  seconds: number,
  clock: AudioClockSpec,
): number {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return Math.max(0, Math.round(value * audioFramesPerSecond(clock)));
}

export function audioFrameToTick(
  frame: number,
  clock: AudioClockSpec,
): AudioTick {
  return audioSecondsToTick(audioFrameToSeconds(frame, clock), clock);
}

export function audioTickToFrame(
  tick: number,
  clock: AudioClockSpec,
): number {
  return audioSecondsToFrame(audioTickToSeconds(tick, clock), clock);
}

export function audioPositionFromFrame(
  frame: number,
  clock: AudioClockSpec,
): AudioClockPosition {
  const safeFrame = Math.max(0, Math.round(Number.isFinite(frame) ? frame : 0));
  const seconds = audioFrameToSeconds(safeFrame, clock);
  return {
    frame: safeFrame,
    tick: audioSecondsToTick(seconds, clock),
    seconds,
  };
}

export function audioPositionFromTick(
  tick: number,
  clock: AudioClockSpec,
): AudioClockPosition {
  const safeTick = asAudioTick(Math.min(
    MAX_TICK,
    Math.max(0, Math.round(Number.isFinite(tick) ? tick : 0)),
  ));
  const seconds = audioTickToSeconds(safeTick, clock);
  return {
    frame: audioSecondsToFrame(seconds, clock),
    tick: safeTick,
    seconds,
  };
}

/** Stable runtime/canonical ID for an instrument lane. */
export function audioInstrumentTrackId(value: string): AudioTrackId {
  const trimmed = String(value).trim();
  const token = trimmed.replace(/^instrument:/iu, "").replace(
    /[^A-Za-z0-9._:-]/gu,
    "-",
  ).slice(0, 128).toLowerCase();
  if (!SAFE_INSTRUMENT.test(token)) {
    throw new Error("Instrument Track ID is invalid.");
  }
  return asAudioTrackId(`instrument:${token}`);
}

/** Resolve a UI display ID or canonical ID to the one Project Track ID. */
export function resolveAudioTrackId(
  project: AudioProject,
  value: string,
): AudioTrackId | undefined {
  const input = String(value).trim();
  const exact = project.tracks.find((track) => String(track.trackId) === input);
  if (exact !== undefined) return exact.trackId;
  try {
    const instrumentId = audioInstrumentTrackId(input);
    return project.tracks.find((track) => track.trackId === instrumentId)
      ?.trackId;
  } catch {
    return undefined;
  }
}
