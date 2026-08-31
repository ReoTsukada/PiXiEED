import {
  asAudioProjectId,
  createAudioWorkspaceSession,
} from "../../src/audio/audio-200/index.ts";
import {
  audioClockForProject,
  audioFrameToTick,
  audioInstrumentTrackId,
  audioSecondsToFrame,
  audioSecondsToTick,
  audioTickToFrame,
  audioTickToSeconds,
} from "../../src/audio/audio-200/timebase.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("AUDIO-200 timebase keeps Frame, Tick, and seconds on one clock", async () => {
  const created = await createAudioWorkspaceSession({
    projectId: asAudioProjectId("audio-timebase-test"),
    name: "Timebase",
    createdAt: "2026-08-19T00:00:00.000Z",
    framesPerSecond: 24,
    tempoBpm: 120,
    ppq: 480,
    instrumentIds: ["PIANO"],
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  const clock = audioClockForProject(created.value.project, 24);
  const tick = audioFrameToTick(4, clock);
  const seconds = audioTickToSeconds(tick, clock);
  assert(tick === 160, "Frame 4 did not map to the canonical 160 ticks.");
  assert(
    Math.abs(seconds - 1 / 6) < 0.000_001,
    "Tick seconds conversion drifted.",
  );
  assert(
    audioTickToFrame(tick, clock) === 4,
    "Tick to Frame conversion drifted.",
  );
  assert(
    audioSecondsToFrame(seconds, clock) === 4,
    "Seconds to Frame conversion drifted.",
  );
  assert(
    audioSecondsToTick(seconds, clock) === tick,
    "Seconds to Tick conversion drifted.",
  );
  assert(
    audioInstrumentTrackId(" instrument:PIANO ") === "instrument:piano",
    "Instrument Track ID normalization is not canonical.",
  );
});

Deno.test("AUDIO-200 timebase rejects a Frame range beyond the safe Tick bound", async () => {
  const created = await createAudioWorkspaceSession({
    projectId: asAudioProjectId("audio-timebase-overflow"),
    name: "Timebase Overflow",
    createdAt: "2026-08-19T00:00:00.000Z",
    framesPerSecond: 24,
    tempoBpm: 120,
    instrumentIds: ["PIANO"],
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  let rejected = false;
  try {
    audioFrameToTick(
      300_000_000,
      audioClockForProject(created.value.project, 24),
    );
  } catch {
    rejected = true;
  }
  assert(rejected, "An overflowing Frame was accepted by the timebase.");
});
