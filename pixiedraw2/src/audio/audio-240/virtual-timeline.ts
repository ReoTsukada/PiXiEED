import { AUDIO200_MAX_TICK, type AudioTick } from "../audio-200/contracts.ts";

/** A bounded coordinate used by the UI while the document tick stays global. */
export interface AudioVirtualPosition {
  readonly chunk: number;
  readonly offsetTick: AudioTick;
}

export interface AudioVirtualTimelineSpec {
  readonly chunkTicks: number;
  readonly maxTick?: number;
}

export interface AudioVirtualViewport {
  readonly start: AudioVirtualPosition;
  readonly end: AudioVirtualPosition;
}

const DEFAULT_CHUNK_TICKS = 1_000_000_000;

interface NormalizedSpec {
  readonly chunkTicks: number;
  readonly maxTick: number;
}

function specOf(spec?: AudioVirtualTimelineSpec): NormalizedSpec {
  const inputChunkTicks = spec?.chunkTicks;
  const inputMaxTick = spec?.maxTick;
  const chunkTicks = typeof inputChunkTicks === "number" && Number.isSafeInteger(inputChunkTicks) && inputChunkTicks > 0
    ? inputChunkTicks
    : DEFAULT_CHUNK_TICKS;
  const maxTick = typeof inputMaxTick === "number" && Number.isSafeInteger(inputMaxTick) && inputMaxTick >= 0
    ? inputMaxTick
    : AUDIO200_MAX_TICK;
  return { chunkTicks, maxTick };
}

export function splitAudioTick(
  tick: number,
  spec?: AudioVirtualTimelineSpec,
): AudioVirtualPosition {
  const { chunkTicks, maxTick } = specOf(spec);
  if (!Number.isSafeInteger(tick) || tick < 0 || tick > maxTick) {
    throw new Error("Audio tick is outside the virtual timeline range.");
  }
  return {
    chunk: Math.floor(tick / chunkTicks),
    offsetTick: (tick % chunkTicks) as AudioTick,
  };
}

export function joinAudioTick(
  position: AudioVirtualPosition,
  spec?: AudioVirtualTimelineSpec,
): AudioTick {
  const { chunkTicks, maxTick } = specOf(spec);
  if (!Number.isSafeInteger(position.chunk) || position.chunk < 0) {
    throw new Error("Virtual timeline chunk must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(position.offsetTick) || position.offsetTick < 0 || position.offsetTick >= chunkTicks) {
    throw new Error("Virtual timeline offset must stay inside its chunk.");
  }
  const tick = position.chunk * chunkTicks + position.offsetTick;
  if (!Number.isSafeInteger(tick) || tick > maxTick) {
    throw new Error("Virtual timeline position exceeds the configured range.");
  }
  return tick as AudioTick;
}

export function virtualChunkCount(
  endTick: number,
  spec?: AudioVirtualTimelineSpec,
): number {
  const { chunkTicks, maxTick } = specOf(spec);
  if (!Number.isSafeInteger(endTick) || endTick < 0 || endTick > maxTick) {
    throw new Error("Virtual timeline end tick is outside the configured range.");
  }
  return Math.max(1, Math.ceil((endTick + 1) / chunkTicks));
}

export function virtualViewport(
  startTick: number,
  endTick: number,
  spec?: AudioVirtualTimelineSpec,
): AudioVirtualViewport {
  if (endTick < startTick) {
    throw new Error("Virtual timeline viewport end must not precede its start.");
  }
  return {
    start: splitAudioTick(startTick, spec),
    end: splitAudioTick(endTick, spec),
  };
}
