/**
 * Sample-accurate, host-neutral transport scheduling primitives.
 *
 * The scheduler never owns an AudioContext or a timer implementation. A
 * browser adapter supplies both, which keeps the timing model deterministic in
 * tests and lets the UI remain independent from the audio rendering clock.
 */

export type AudioTransportState = "STOPPED" | "PAUSED" | "PLAYING";

export interface AudioScheduleEvent<T> {
  readonly id: string;
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly payload: T;
}

export interface AudioSchedulerClock {
  readonly now: () => number;
}

export interface AudioSchedulerTimer {
  readonly setInterval: (callback: () => void, delayMs: number) => number;
  readonly clearInterval: (handle: number) => void;
}

export interface SampleAccurateSchedulerOptions<T> {
  readonly clock: AudioSchedulerClock;
  readonly timer: AudioSchedulerTimer;
  readonly onSchedule: (
    event: AudioScheduleEvent<T>,
    audioTimeSeconds: number,
  ) => void;
  readonly onEnded?: () => void;
  readonly lookaheadSeconds?: number;
  readonly intervalMs?: number;
}

const EPSILON_SECONDS = 1e-7;

function finiteNonNegative(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeEvents<T>(
  events: readonly AudioScheduleEvent<T>[],
): readonly AudioScheduleEvent<T>[] {
  return events
    .filter((event) => {
      return event.id.length > 0 &&
        Number.isFinite(event.startSeconds) &&
        event.startSeconds >= 0 &&
        Number.isFinite(event.durationSeconds) &&
        event.durationSeconds > 0;
    })
    .map((event) => ({
      ...event,
      startSeconds: Math.max(0, event.startSeconds),
      durationSeconds: Math.max(EPSILON_SECONDS, event.durationSeconds),
    }))
    .sort((left, right) =>
      left.startSeconds - right.startSeconds || left.id.localeCompare(right.id)
    );
}

/**
 * Schedules events against a monotonic audio clock using a short lookahead.
 * The timer only pumps the queue; actual event time is always the supplied
 * clock time plus the event's timeline offset.
 */
export class SampleAccurateScheduler<T> {
  private events: readonly AudioScheduleEvent<T>[] = [];
  private durationSeconds = 0;
  private stateValue: AudioTransportState = "STOPPED";
  private loopValue = false;
  private positionSeconds = 0;
  private anchorTimeSeconds = 0;
  private nextEventIndex = 0;
  private nextEventCycle = 0;
  private timerHandle: number | undefined;
  private readonly lookaheadSeconds: number;
  private readonly intervalMs: number;

  constructor(private readonly options: SampleAccurateSchedulerOptions<T>) {
    this.lookaheadSeconds = finiteNonNegative(
      options.lookaheadSeconds ?? 0.1,
      0.1,
    );
    this.intervalMs = Math.max(
      8,
      Math.trunc(
        finiteNonNegative(options.intervalMs ?? 25, 25),
      ),
    );
  }

  get state(): AudioTransportState {
    return this.stateValue;
  }

  get loop(): boolean {
    return this.loopValue;
  }

  get duration(): number {
    return this.durationSeconds;
  }

  get position(): number {
    if (this.stateValue !== "PLAYING") return this.positionSeconds;
    const elapsed = Math.max(
      0,
      this.options.clock.now() - this.anchorTimeSeconds,
    );
    if (this.durationSeconds <= 0) return 0;
    return this.loopValue
      ? elapsed % this.durationSeconds
      : Math.min(this.durationSeconds, elapsed);
  }

  get isPlaying(): boolean {
    return this.stateValue === "PLAYING";
  }

  load(
    events: readonly AudioScheduleEvent<T>[],
    durationSeconds: number,
  ): void {
    this.stop();
    this.events = normalizeEvents(events);
    const eventEnd = this.events.reduce(
      (latest, event) =>
        Math.max(
          latest,
          event.startSeconds + event.durationSeconds,
        ),
      0,
    );
    this.durationSeconds = Math.max(
      EPSILON_SECONDS,
      finiteNonNegative(durationSeconds, 0),
      eventEnd,
    );
    this.positionSeconds = 0;
    this.resetCursor(0);
  }

  setLoop(enabled: boolean): void {
    this.loopValue = enabled;
    if (this.stateValue === "PLAYING") this.pump();
  }

  start(positionSeconds?: number, loop = this.loopValue): boolean {
    if (this.durationSeconds <= 0) return false;
    this.stopTimer();
    this.loopValue = loop;
    const requested = positionSeconds === undefined
      ? this.positionSeconds
      : positionSeconds;
    this.positionSeconds = Math.min(
      this.durationSeconds,
      Math.max(0, finiteNonNegative(requested, 0)),
    );
    this.anchorTimeSeconds = this.options.clock.now() - this.positionSeconds;
    this.resetCursor(this.positionSeconds);
    this.stateValue = "PLAYING";
    this.pump();
    this.timerHandle = this.options.timer.setInterval(
      () => this.pump(),
      this.intervalMs,
    );
    return true;
  }

  pause(): number {
    if (this.stateValue === "PLAYING") {
      this.positionSeconds = this.position;
      this.stateValue = "PAUSED";
      this.stopTimer();
    }
    return this.positionSeconds;
  }

  stop(): void {
    this.stopTimer();
    this.stateValue = "STOPPED";
    this.positionSeconds = 0;
    this.resetCursor(0);
  }

  seek(positionSeconds: number): number {
    this.positionSeconds = Math.min(
      this.durationSeconds,
      Math.max(0, finiteNonNegative(positionSeconds, 0)),
    );
    this.resetCursor(this.positionSeconds);
    if (this.stateValue === "PLAYING") {
      this.anchorTimeSeconds = this.options.clock.now() - this.positionSeconds;
      this.pump();
    }
    return this.positionSeconds;
  }

  /** Pump immediately; useful for tests and for a transport resume. */
  pump(nowSeconds = this.options.clock.now()): void {
    if (this.stateValue !== "PLAYING") return;
    const elapsed = Math.max(0, nowSeconds - this.anchorTimeSeconds);
    if (!this.loopValue && elapsed >= this.durationSeconds) {
      this.positionSeconds = this.durationSeconds;
      this.stateValue = "STOPPED";
      this.stopTimer();
      this.options.onEnded?.();
      return;
    }

    const targetElapsed = elapsed + this.lookaheadSeconds;
    while (this.events.length > 0) {
      const event = this.events[this.nextEventIndex];
      if (event === undefined) break;
      const occurrenceElapsed = this.nextEventCycle * this.durationSeconds +
        event.startSeconds;
      if (occurrenceElapsed >= targetElapsed - EPSILON_SECONDS) break;
      this.options.onSchedule(
        event,
        this.anchorTimeSeconds + occurrenceElapsed,
      );
      this.advanceCursor();
    }
    this.positionSeconds = this.loopValue
      ? elapsed % this.durationSeconds
      : Math.min(this.durationSeconds, elapsed);
  }

  private resetCursor(positionSeconds: number): void {
    if (this.events.length === 0 || this.durationSeconds <= 0) {
      this.nextEventIndex = 0;
      this.nextEventCycle = 0;
      return;
    }
    const cycle = this.loopValue
      ? Math.floor(positionSeconds / this.durationSeconds)
      : 0;
    const withinCycle = this.loopValue
      ? positionSeconds - cycle * this.durationSeconds
      : positionSeconds;
    const first = this.events.findIndex((event) =>
      event.startSeconds >= withinCycle - EPSILON_SECONDS
    );
    if (first >= 0) {
      this.nextEventIndex = first;
      this.nextEventCycle = cycle;
    } else {
      this.nextEventIndex = 0;
      this.nextEventCycle = cycle + 1;
    }
  }

  private advanceCursor(): void {
    this.nextEventIndex += 1;
    if (this.nextEventIndex >= this.events.length) {
      this.nextEventIndex = 0;
      this.nextEventCycle += 1;
    }
    if (!this.loopValue && this.nextEventCycle > 0) {
      this.nextEventIndex = this.events.length;
    }
  }

  private stopTimer(): void {
    if (this.timerHandle === undefined) return;
    this.options.timer.clearInterval(this.timerHandle);
    this.timerHandle = undefined;
  }
}
