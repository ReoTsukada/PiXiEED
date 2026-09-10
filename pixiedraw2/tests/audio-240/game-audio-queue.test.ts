import { createGameAudioQueue } from "../../src/audio/audio-240/game-audio-queue.ts";
import type { GameAudioScheduledSegment } from "../../src/audio/audio-240/game-range-selection.ts";

class Timer {
  next = 1;
  now = 0;
  delays: number[] = [];
  callbacks = new Map<number, { callback: () => void; delay: number }>();
  cancelled = new Map<number, { callback: () => void; delay: number }>();
  fired = new Map<number, { callback: () => void; delay: number }>();
  setTimeout(callback: () => void, delay: number): number { const id = this.next++; this.callbacks.set(id, { callback, delay }); this.delays.push(delay); return id; }
  clearTimeout(id: number): void { const entry = this.callbacks.get(id); if (entry !== undefined) { this.callbacks.delete(id); this.cancelled.set(id, entry); } }
  fireNext(): void { const entry = this.callbacks.entries().next().value as [number, { callback: () => void; delay: number }] | undefined; if (entry) { this.callbacks.delete(entry[0]); this.fired.set(entry[0], entry[1]); this.now += entry[1].delay / 1000; entry[1].callback(); } }
  fireCancelled(id: number): void { (this.cancelled.get(id) ?? this.fired.get(id))?.callback(); }
}

const segment = (id: string, start: number): GameAudioScheduledSegment => ({
  clipId: id,
  trackId: `track:${id}`,
  offsetTick: 0,
  durationTick: 480,
  rangeOffsetSeconds: start,
  startSeconds: 0,
  durationSeconds: 0.5,
});

Deno.test("AUDIO-240-GAME queue keeps only the next timer and preserves order", () => {
  const timer = new Timer();
  const queue = createGameAudioQueue(timer);
  const played: string[] = [];
  queue.start([segment("a", 0), segment("b", 0.5), segment("c", 1)], (item) => played.push(item.clipId));
  if (played.length !== 0 || timer.callbacks.size !== 1) throw new Error("Queue did not preserve the initial schedule.");
  timer.fireNext();
  timer.fireNext();
  timer.fireNext();
  if (JSON.stringify(played) !== JSON.stringify(["a", "b", "c"]) || queue.active) throw new Error("Queue order or completion is invalid.");
});

Deno.test("AUDIO-240-GAME queue cancellation invalidates pending callbacks", () => {
  const timer = new Timer();
  const queue = createGameAudioQueue(timer);
  let count = 0;
  queue.start([segment("a", 0), segment("b", 1)], () => count++);
  queue.stop();
  timer.fireNext();
  if (count !== 0 || queue.active || timer.callbacks.size !== 0) throw new Error("Queue cancellation leaked work.");
});

Deno.test("AUDIO-240-GAME queue loops the whole range, not each clip", () => {
  const timer = new Timer();
  const queue = createGameAudioQueue(timer);
  const played: string[] = [];
  queue.start([segment("a", 0.25), segment("b", 0.5)], (item) => played.push(item.clipId), true, 1);
  timer.fireNext();
  if (Number(timer.now) !== 0.25) throw new Error("first loop segment fired at the wrong virtual time");
  timer.fireNext();
  if (Number(timer.now) !== 0.5) throw new Error("second loop segment fired at the wrong virtual time");
  timer.fireNext();
  if (Number(timer.now) !== 1.25 || timer.delays[2] !== 750) throw new Error("loop wrap did not preserve the first offset");
  if (JSON.stringify(played) !== JSON.stringify(["a", "b", "a"])) throw new Error("Queue did not loop the complete range.");
  queue.stop();
});

Deno.test("AUDIO-240-GAME queue ignores a cancelled callback after synchronous stop/restart", () => {
  const timer = new Timer();
  const queue = createGameAudioQueue(timer);
  const played: string[] = [];
  queue.start([segment("old", 0)], (item) => {
    played.push(item.clipId);
    queue.start([segment("new", 0.25)], (next) => played.push(next.clipId));
  });
  const oldTimerId = 1;
  timer.fireNext();
  if (timer.callbacks.size !== 1 || !queue.active) throw new Error("restart did not leave exactly one pending timer");
  timer.fireCancelled(oldTimerId);
  if (timer.callbacks.size !== 1 || !queue.active) throw new Error("stale callback cancelled the restarted queue");
  timer.fireNext();
  if (JSON.stringify(played) !== JSON.stringify(["old", "new"]) || queue.active || Number(timer.callbacks.size) !== 0) throw new Error("synchronous restart leaked or lost queue work");
});

Deno.test("AUDIO-240-GAME queue normalizes malformed schedule times", () => {
  const timer = new Timer();
  const queue = createGameAudioQueue(timer);
  const played: string[] = [];
  queue.start([
    { ...segment("a", Number.NaN), rangeOffsetSeconds: Number.NaN },
    { ...segment("b", 0.5), rangeOffsetSeconds: Number.POSITIVE_INFINITY },
  ], (item) => played.push(item.clipId));
  timer.fireNext();
  timer.fireNext();
  if (JSON.stringify(played) !== JSON.stringify(["a", "b"]) || queue.active) throw new Error("Malformed schedule was not normalized safely.");
});
