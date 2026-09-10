import type { GameAudioScheduledSegment } from "./game-range-selection.ts";

function safeDelaySeconds(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export interface GameAudioQueueTimer {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
}

export interface GameAudioQueue {
  start(segments: readonly GameAudioScheduledSegment[], onSegment: (segment: GameAudioScheduledSegment) => void, loop?: boolean, cycleDurationSeconds?: number): void;
  stop(): void;
  readonly active: boolean;
}

/**
 * Executes a Tick-derived audio schedule without materialising audio data or
 * one timer per segment. Only the next segment is retained in memory.
 */
export function createGameAudioQueue(timer: GameAudioQueueTimer): GameAudioQueue {
  let handle: number | undefined;
  let generation = 0;
  let active = false;

  const stop = (): void => {
    generation += 1;
    active = false;
    if (handle !== undefined) {
      timer.clearTimeout(handle);
      handle = undefined;
    }
  };

  const start = (
    segments: readonly GameAudioScheduledSegment[],
    onSegment: (segment: GameAudioScheduledSegment) => void,
    loop = false,
    cycleDurationSeconds = 0,
  ): void => {
    stop();
    if (segments.length === 0) return;
    const currentGeneration = generation;
    active = true;
    let index = 0;
    const advance = (): void => {
      if (currentGeneration !== generation) return;
      if (!active || index >= segments.length) {
        active = false;
        handle = undefined;
        return;
      }
      const segment = segments[index++];
      if (segment === undefined) {
        active = false;
        handle = undefined;
        return;
      }
      onSegment(segment);
      if (!active || currentGeneration !== generation) return;
      const next = segments[index];
      if (next === undefined) {
        if (loop && cycleDurationSeconds > 0) {
          index = 0;
          const firstOffset = safeDelaySeconds(segments[0]!.rangeOffsetSeconds);
          handle = timer.setTimeout(advance, safeDelaySeconds(cycleDurationSeconds - segment.rangeOffsetSeconds + firstOffset) * 1000);
        } else {
          active = false;
          handle = undefined;
        }
        return;
      }
      const delay = safeDelaySeconds(next.rangeOffsetSeconds - segment.rangeOffsetSeconds) * 1000;
      handle = timer.setTimeout(advance, delay);
    };
    handle = timer.setTimeout(advance, safeDelaySeconds(segments[0]!.rangeOffsetSeconds) * 1000);
  };

  return { start, stop, get active() { return active; } };
}
