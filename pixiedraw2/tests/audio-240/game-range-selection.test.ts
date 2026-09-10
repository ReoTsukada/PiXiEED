import {
  audioRangeSelectionFromTrackDrag,
  normalizeGameAudioRangeSelection,
  planGameAudioRangePlayback,
  scheduleGameAudioPlayback,
  type GameAudioRangeSelection,
} from "../../src/audio/audio-240/game-range-selection.ts";
import type { AudioClip, AudioProject } from "../../src/audio/audio-200/contracts.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertThrows(callback: () => unknown): void {
  let thrown = false;
  try {
    callback();
  } catch {
    thrown = true;
  }
  if (!thrown) throw new Error("Expected callback to throw");
}

function clip(clipId: string, trackId: string, startTick: number, durationTick: number): AudioClip {
  return {
    clipId: clipId as AudioClip["clipId"],
    trackId: trackId as AudioClip["trackId"],
    revisionId: "revision:test" as AudioClip["revisionId"],
    timeline: { startTick: startTick as AudioClip["timeline"]["startTick"], durationTick: durationTick as AudioClip["timeline"]["durationTick"] },
    sourceOffsetUs: 0,
    gainMilliDb: 0,
    fadeInTick: 0 as AudioClip["fadeInTick"],
    fadeOutTick: 0 as AudioClip["fadeOutTick"],
    loop: false,
  };
}

const project = (clips: readonly AudioClip[]): AudioProject => ({
  clips,
} as AudioProject);

Deno.test("AUDIO-240-GAME range selection supports Beat and Free", () => {
  assertEquals(normalizeGameAudioRangeSelection({ trackIds: ["a", "b", "a"], startTick: 11, endTick: 501, snap: "BEAT", ticksPerBeat: 480 }), { trackIds: ["a", "b"], startTick: 0, durationTick: 480, snap: "BEAT" });
  assertEquals(audioRangeSelectionFromTrackDrag({ trackId: "sfx", shiftTrackIds: ["voice"], startTick: 13, endTick: 97, snap: "FREE" }), { trackIds: ["sfx", "voice"], startTick: 13, durationTick: 84, snap: "FREE" });
});

Deno.test("AUDIO-240-GAME clamps a range at the safe Audio-200 tick boundary", () => {
  const selection = normalizeGameAudioRangeSelection({
    trackIds: ["sfx"],
    startTick: Number.MAX_SAFE_INTEGER - 2,
    endTick: Number.MAX_SAFE_INTEGER + 100,
    snap: "FREE",
  });
  assertEquals(selection.startTick, Number.MAX_SAFE_INTEGER - 2);
  assertEquals(selection.durationTick, 2);
});

Deno.test("AUDIO-240-GAME preserves every selected track in a sparse range", () => {
  const trackIds = Array.from({ length: 64 }, (_, index) => `track-${index}`);
  const selection = normalizeGameAudioRangeSelection({
    trackIds,
    startTick: 0,
    endTick: 480,
    snap: "BEAT",
  });
  assertEquals(selection.trackIds.length, 64);
});

Deno.test("AUDIO-240-GAME drops blank track identifiers", () => {
  const selection = normalizeGameAudioRangeSelection({
    trackIds: ["", "  ", "sfx", " sfx "],
    startTick: 0,
    endTick: 10,
    snap: "FREE",
  });
  assertEquals(selection.trackIds, ["sfx"]);
});

Deno.test("AUDIO-240-GAME plans the complete half-open range across every selected track", () => {
  const selection: GameAudioRangeSelection = normalizeGameAudioRangeSelection({
    trackIds: ["track-a", "track-b"],
    startTick: 240,
    endTick: 960,
    snap: "FREE",
  });
  const plan = planGameAudioRangePlayback(project([
    clip("a-before", "track-a", 0, 480),
    clip("a-after", "track-a", 480, 480),
    clip("b-edge", "track-b", 240, 240),
    clip("outside", "track-b", 960, 120),
  ]), selection);
  assertEquals(plan.renderMode, "POST_MIX");
  assertEquals(plan.trackIds, ["track-a", "track-b"]);
  assertEquals([...
    plan.clips.map((item) => [item.clip.clipId, item.startTick, item.endTick, item.rangeOffsetTick, item.clipOffsetTick, item.durationTick]),
  ], [
    ["a-before", 240, 480, 0, 240, 240],
    ["b-edge", 240, 480, 0, 0, 240],
    ["a-after", 480, 960, 240, 0, 480],
  ]);
  assertEquals(plan.startTick, 240);
  assertEquals(plan.endTick, 960);
  assertEquals(plan.durationTick, 720);
});

Deno.test("AUDIO-240-GAME keeps an empty selected track safe and preserves the range duration", () => {
  const plan = planGameAudioRangePlayback(project([
    clip("music", "track-music", 100, 100),
  ]), normalizeGameAudioRangeSelection({
    trackIds: ["track-empty", "track-music"],
    startTick: 0,
    endTick: 480,
    snap: "FREE",
  }));
  assertEquals(plan.trackIds, ["track-empty", "track-music"]);
  assertEquals(plan.clips.length, 1);
  assertEquals(plan.durationTick, 480);
});

Deno.test("AUDIO-240-GAME rejects invalid playback ranges before selecting clips", () => {
  const valid = (startTick: number, durationTick: number): GameAudioRangeSelection => ({
    trackIds: ["track-a"],
    startTick: startTick as GameAudioRangeSelection["startTick"],
    durationTick: durationTick as GameAudioRangeSelection["durationTick"],
    snap: "FREE",
  });
  const source = project([clip("a", "track-a", 0, 480)]);
  assertThrows(() => planGameAudioRangePlayback(source, valid(0, 0)));
  assertThrows(() => planGameAudioRangePlayback(source, valid(-1, 1)));
  assertThrows(() => planGameAudioRangePlayback(source, valid(Number.MAX_SAFE_INTEGER, 1)));
  assertThrows(() => planGameAudioRangePlayback(source, { ...valid(0, 1), trackIds: ["", "  "] }));
});

Deno.test("AUDIO-240-GAME converts Tick ranges into gap-preserving seconds", () => {
  const scheduled = scheduleGameAudioPlayback({
    ...project([
    clip("a", "track-a", 480, 480),
    clip("b", "track-b", 960, 480),
    ]),
    timebase: { ticksPerQuarter: 480 },
    tempo: { milliBpm: 120_000 },
  } as AudioProject, normalizeGameAudioRangeSelection({
    trackIds: ["track-a", "track-b"],
    startTick: 480,
    endTick: 1440,
    snap: "FREE",
  }));
  assertEquals(scheduled.map((item) => [item.clipId, item.rangeOffsetSeconds, item.startSeconds, item.durationSeconds]), [
    ["a", 0, 0, 0.5],
    ["b", 0.5, 0, 0.5],
  ]);
});

Deno.test("AUDIO-240-GAME keeps an unprepared Audio project safe", () => {
  const result = scheduleGameAudioPlayback(project([
    clip("a", "track-a", 0, 480),
  ]), normalizeGameAudioRangeSelection({
    trackIds: ["track-a"], startTick: 0, endTick: 480, snap: "FREE",
  }));
  assertEquals(result, []);
});
