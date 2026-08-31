import {
  copyAudioProjectRange,
  copyAudioPianoRollRange,
  normalizeAudioBarRange,
  pasteAudioProjectRange,
  pasteAudioPianoRollRange,
} from "../../src/audio/audio-240/arrangement-editing.ts";
import type { PianoRollNote } from "../../src/audio/audio-240/piano-roll.ts";
import {
  asAudioProjectId,
  createAudioWorkspaceSession,
} from "../../src/audio/audio-200/index.ts";

const notes: readonly PianoRollNote[] = [
  {
    id: "piano:inside",
    pitchMidi: 60,
    startFrame: 12,
    durationFrames: 8,
    velocity: 0.8,
    instrument: "PIANO",
  },
  {
    id: "piano:crossing",
    pitchMidi: 64,
    startFrame: 42,
    durationFrames: 12,
    velocity: 0.7,
    instrument: "PIANO_2",
  },
  {
    id: "piano:outside",
    pitchMidi: 67,
    startFrame: 60,
    durationFrames: 4,
    velocity: 0.7,
    instrument: "PIANO",
  },
];

Deno.test("Audio arrangement bar ranges stay ordered and bounded", () => {
  const range = normalizeAudioBarRange(4, 1, 3);
  if (range.startBar !== 2 || range.endBar !== 3) {
    throw new Error("bar range should clamp to the last available bar");
  }
  const single = normalizeAudioBarRange(-2, -1, 8);
  if (single.startBar !== 0 || single.endBar !== 1) {
    throw new Error("bar range should always contain one bar");
  }
});

Deno.test("Audio arrangement copies and pastes a bounded multi-track phrase", () => {
  const clipboard = copyAudioPianoRollRange(notes, 8, 40);
  if (clipboard.durationFrames !== 40 || clipboard.notes.length !== 2) {
    throw new Error("range copy should include notes that touch the range");
  }
  if (
    clipboard.notes[0]?.startFrame !== 4 ||
    clipboard.notes[1]?.startFrame !== 34 ||
    clipboard.notes[1]?.durationFrames !== 6
  ) {
    throw new Error("copied notes must be rebased and clipped to the range");
  }
  const pasted = pasteAudioPianoRollRange(
    clipboard,
    80,
    128,
    (note, index) => `${note.instrument}:paste:${index}`,
  );
  if (
    pasted.length !== 2 ||
    pasted[0]?.startFrame !== 84 ||
    pasted[1]?.startFrame !== 114 ||
    pasted[1]?.durationFrames !== 6 ||
    pasted[1]?.instrument !== "PIANO_2"
  ) {
    throw new Error("pasted notes must preserve timing and instrument lanes");
  }
});

Deno.test("Audio arrangement copies every canonical lane in Tick space", async () => {
  const created = await createAudioWorkspaceSession({
    projectId: asAudioProjectId("audio-range-tick-test"),
    name: "Tick range",
    createdAt: "2026-08-23T00:00:00.000Z",
    framesPerSecond: 24,
    tempoBpm: 120,
    instrumentIds: ["PIANO", "PIANO_2"],
  });
  if (!created.ok) throw new Error(JSON.stringify(created.diagnostics));
  const piano = created.value.project.tracks.find((track) =>
    String(track.trackId) === "instrument:piano"
  );
  if (piano === undefined) throw new Error("piano track missing");
  const sourceNote = {
    noteId: "note:tick-range" as typeof created.value.project.notes[number]["noteId"],
    trackId: piano.trackId,
    pitchMidi: 60,
    timeline: { startTick: 240 as never, durationTick: 480 as never },
    velocityMilli: 800,
  };
  const project = {
    ...created.value.project,
    notes: [sourceNote],
    automations: [{
      automationId: "automation:tick-range" as never,
      target: { kind: "TRACK_GAIN" as const, targetId: String(piano.trackId) },
      points: [
        { tick: 480 as never, value: -6 },
        { tick: 960 as never, value: 0 },
      ],
    }],
    markers: [{
      markerId: "marker:tick-range",
      frameId: "tick:480",
      tick: 720 as never,
      label: "Cue",
    }],
  };
  const clipboard = copyAudioProjectRange(project, {
    startTick: 240 as never,
    durationTick: 960 as never,
  });
  if (
    clipboard.notes.length !== 1 ||
    clipboard.notes[0]?.timeline.startTick !== 0 ||
    clipboard.automations[0]?.points[0]?.tick !== 240 ||
    clipboard.markers[0]?.tick !== 480
  ) throw new Error("Tick range copy did not rebase every lane");
  const pasted = pasteAudioProjectRange(clipboard, 1_920, {
    noteId: () => "note:tick-paste" as never,
    clipId: (source) => source.clipId,
    automationId: () => "automation:tick-paste" as never,
    markerId: () => "marker:tick-paste",
  });
  if (
    pasted.notes[0]?.timeline.startTick !== 1_920 ||
    pasted.automations[0]?.points[0]?.tick !== 2_160 ||
    pasted.markers[0]?.tick !== 2_400
  ) throw new Error("Tick range paste lost the destination offset");
});
