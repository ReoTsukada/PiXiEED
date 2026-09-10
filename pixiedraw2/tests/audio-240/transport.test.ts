import {
  type AudioScheduleEvent,
  SampleAccurateScheduler,
} from "../../src/audio/audio-240/transport.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class FakeTimer {
  private nextHandle = 0;
  readonly callbacks = new Map<number, () => void>();

  readonly adapter = {
    setInterval: (callback: () => void): number => {
      const handle = ++this.nextHandle;
      this.callbacks.set(handle, callback);
      return handle;
    },
    clearInterval: (handle: number): void => {
      this.callbacks.delete(handle);
    },
  };

  fire(): void {
    for (const callback of this.callbacks.values()) callback();
  }
}

function event(
  id: string,
  startSeconds: number,
): AudioScheduleEvent<{ label: string }> {
  return { id, startSeconds, durationSeconds: 0.05, payload: { label: id } };
}

Deno.test("AUDIO-240 scheduler uses audio time and lookahead without duplicates", () => {
  let now = 10;
  const timer = new FakeTimer();
  const scheduled: Array<{ id: string; audioTime: number }> = [];
  const scheduler = new SampleAccurateScheduler({
    clock: { now: () => now },
    timer: timer.adapter,
    lookaheadSeconds: 0.25,
    onSchedule: (item, audioTime) => {
      scheduled.push({ id: item.id, audioTime });
    },
  });
  scheduler.load([event("early", 0.1), event("late", 0.4)], 1);
  assert(scheduler.start(0, false), "Scheduler did not start.");
  assert(
    scheduled.length === 1 && scheduled[0]?.audioTime === 10.1,
    "The first event was not scheduled against the audio clock.",
  );
  scheduler.pump(10.05);
  assert(scheduled.length === 1, "An event was scheduled twice.");
  now = 10.2;
  scheduler.pump();
  const scheduledCount: number = Number(scheduled.length);
  assert(
    scheduledCount === 2 && scheduled[1]?.audioTime === 10.4,
    "The lookahead queue did not schedule the next event at its exact time.",
  );
  assert(timer.callbacks.size === 1, "The transport timer was not installed.");
});

Deno.test("AUDIO-240 scheduler pause and seek reset the event cursor", () => {
  let now = 0;
  const timer = new FakeTimer();
  const scheduled: string[] = [];
  const scheduler = new SampleAccurateScheduler({
    clock: { now: () => now },
    timer: timer.adapter,
    lookaheadSeconds: 0.05,
    onSchedule: (item) => scheduled.push(item.id),
  });
  scheduler.load([event("a", 0.1), event("b", 0.7)], 1);
  scheduler.start(0, false);
  now = 0.2;
  scheduler.pump();
  scheduler.pause();
  assert(scheduler.state === "PAUSED", "Pause did not change state.");
  scheduler.seek(0.65);
  scheduler.start();
  now = 0.26;
  scheduler.pump();
  assert(
    scheduled.includes("b") &&
      scheduled.filter((id) => id === "a").length === 1,
    "Seek did not advance the scheduler cursor without replaying old events.",
  );
  scheduler.stop();
  const finalState: string = scheduler.state;
  assert(
    finalState === "STOPPED" && timer.callbacks.size === 0,
    "Stop did not clear the scheduler timer.",
  );
});

Deno.test("AUDIO-240 scheduler schedules loop occurrences across the boundary", () => {
  let now = 5;
  const timer = new FakeTimer();
  const scheduled: number[] = [];
  const scheduler = new SampleAccurateScheduler({
    clock: { now: () => now },
    timer: timer.adapter,
    lookaheadSeconds: 0.5,
    onSchedule: (_item, audioTime) => scheduled.push(audioTime),
  });
  scheduler.load([event("loop-note", 0.2)], 1);
  scheduler.start(0.8, true);
  assert(
    scheduled.length === 1 && scheduled[0] === 5.4,
    "The next loop occurrence was not scheduled at the correct audio time.",
  );
  now = 5.91;
  scheduler.pump();
  assert(
    scheduled.length > 1 && scheduled[1] === 6.4,
    "The scheduler did not continue into the following loop cycle.",
  );
});

Deno.test("AUDIO-240 scheduler resumes from a captured position after output interruption", () => {
  let now = 0;
  const timer = new FakeTimer();
  const scheduled: string[] = [];
  const scheduler = new SampleAccurateScheduler({
    clock: { now: () => now },
    timer: timer.adapter,
    lookaheadSeconds: 0.35,
    onSchedule: (item) => scheduled.push(item.id),
  });
  scheduler.load([event("a", 0.1), event("b", 0.4)], 1);
  assert(scheduler.start(0, false), "Scheduler did not start.");
  now = 0.15;
  scheduler.pump();
  const capturedPosition = scheduler.position;
  scheduler.stop();
  assert(timer.callbacks.size === 0, "Lifecycle stop left a timer running.");
  now = 50;
  assert(
    scheduler.start(capturedPosition, false),
    "Scheduler did not resume after the output interruption.",
  );
  assert(
    scheduled.filter((id) => id === "a").length === 1 &&
      scheduled.includes("b"),
    "Lifecycle resume replayed old events or missed the next event.",
  );
  scheduler.stop();
});

Deno.test("AUDIO-240 scheduler consumes a virtual event source without materializing its length", () => {
  let now = 0;
  const timer = new FakeTimer();
  let accesses = 0;
  const source = {
    length: 10_000,
    at: (index: number): AudioScheduleEvent<{ label: string }> => {
      accesses += 1;
      return event(`virtual-${index}`, index * 0.1);
    },
    findFirstIndex: (startSeconds: number): number =>
      Math.max(0, Math.ceil(startSeconds / 0.1)),
  };
  const scheduled: string[] = [];
  const scheduler = new SampleAccurateScheduler({
    clock: { now: () => now },
    timer: timer.adapter,
    lookaheadSeconds: 0.25,
    onSchedule: (item) => scheduled.push(item.id),
  });
  scheduler.load(source, 10_000);
  assert(scheduler.start(0, false), "Virtual scheduler did not start.");
  assert(
    scheduled.length === 3 && accesses < 32,
    "The scheduler should visit only the short lookahead window.",
  );
  now = 0.3;
  scheduler.pump();
  assert(
    scheduled.includes("virtual-3") && accesses < 64,
    "A virtual timeline should advance without allocating all events.",
  );
  scheduler.stop();
});
