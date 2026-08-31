import {
  createPianoRollNote,
  createPianoRollPitchRange,
  framesPerMeasure,
  noteCoversFrame,
  pianoRollNoteFromTicks,
  pianoRollNoteTicks,
  resizePianoRollNote,
  resizePianoRollNoteInTicks,
  snapPianoRollFrame,
  snapPianoRollTick,
} from "../../src/audio/audio-240/piano-roll.ts";

Deno.test("Audio-240 exposes the full 88-key piano range", () => {
  const pitches = createPianoRollPitchRange();
  if (pitches.length !== 88) throw new Error("expected 88 piano keys");
  if (pitches[0]?.midi !== 21 || pitches[0]?.label !== "A0") {
    throw new Error("piano range must start at A0");
  }
  if (pitches.at(-1)?.midi !== 108 || pitches.at(-1)?.label !== "C8") {
    throw new Error("piano range must end at C8");
  }
  if (pitches.find((pitch) => pitch.label === "F#4")?.black !== true) {
    throw new Error("black-key metadata is required for piano-roll styling");
  }
});

Deno.test("Audio-240 notes can span F1 through F9", () => {
  const note = createPianoRollNote({
    id: "piano:f1-f9",
    pitchMidi: 60,
    startFrame: 0,
    durationFrames: 9,
    instrument: "PIANO",
    frameCount: 32,
  });
  if (note === undefined) throw new Error("note should be created");
  if (!noteCoversFrame(note, 0) || !noteCoversFrame(note, 8)) {
    throw new Error("long note must cover F1-F9");
  }
  if (noteCoversFrame(note, 9)) throw new Error("F10 must be outside F1-F9");
  const resized = resizePianoRollNote(note, 16, 12);
  if (resized.durationFrames !== 12) {
    throw new Error("note resize must be bounded by the timeline");
  }
  const dragged = createPianoRollNote({
    id: "piano:f4-f8",
    pitchMidi: 65,
    startFrame: 3,
    durationFrames: 5,
    instrument: "PIANO",
    frameCount: 32,
  });
  if (
    dragged === undefined || dragged.startFrame !== 3 ||
    dragged.durationFrames !== 5 || !noteCoversFrame(dragged, 7) ||
    noteCoversFrame(dragged, 8)
  ) {
    throw new Error("F4-F8 drag must become one sustained note");
  }
});

Deno.test("Audio-240 maps a measure to animation frames", () => {
  if (framesPerMeasure(24, 120, 480, 4, 4) !== 48) {
    throw new Error(
      "24 FPS at 120 BPM should expose 48 frames per 4/4 measure",
    );
  }
  if (framesPerMeasure(30, 100, 480, 3, 4) !== 54) {
    throw new Error("3/4 measure frame mapping is incorrect");
  }
});

Deno.test("Audio-240 quantize snaps Piano Roll placement to musical frames", () => {
  const options = {
    frameCount: 32,
    fps: 24,
    bpm: 120,
    ppq: 480,
  } as const;
  if (
    snapPianoRollFrame(2, { ...options, quantize: "off" }) !== 2 ||
    snapPianoRollFrame(2, { ...options, quantize: "1/16" }) !== 3 ||
    snapPianoRollFrame(4, { ...options, quantize: "1/16" }) !== 3 ||
    snapPianoRollFrame(5, { ...options, quantize: "1/16" }) !== 6
  ) {
    throw new Error("Piano Roll placement must snap to the nearest 1/16 grid");
  }
  if (
    snapPianoRollFrame(99, { ...options, quantize: "1/4" }) !== 31 ||
    snapPianoRollFrame(-4, { ...options, quantize: "1/4" }) !== 0
  ) {
    throw new Error("quantized frames must stay inside the timeline");
  }
});

Deno.test("Audio-240 persists Piano Roll edits as exact PPQ Ticks", () => {
  const clock = {
    framesPerSecond: 24,
    tempoMilliBpm: 120_000,
    ticksPerQuarter: 480,
  } as const;
  const note = pianoRollNoteFromTicks(
    {
      id: "piano:tick-note",
      pitchMidi: 60,
      startTick: 240 as never,
      durationTick: 720 as never,
      velocity: 0.8,
      instrument: "PIANO",
    },
    clock,
    128,
  );
  if (note === undefined) throw new Error("Tick note should be projected");
  const ticks = pianoRollNoteTicks(note, clock);
  if (ticks.startTick !== 240 || ticks.durationTick !== 720) {
    throw new Error("Piano Roll Tick metadata was not preserved");
  }
  const resized = resizePianoRollNoteInTicks(note, 1_137, clock, 256);
  const resizedTicks = pianoRollNoteTicks(resized, clock);
  if (resizedTicks.startTick !== 240 || resizedTicks.durationTick !== 1_137) {
    throw new Error("Piano Roll resize must retain the exact Tick duration");
  }
  if (
    snapPianoRollTick(250, {
      maxTick: 1_920,
      ppq: 480,
      quantize: "1/16",
    }) !== 240
  ) throw new Error("Tick quantize should snap to the nearest 1/16");
  if (
    snapPianoRollTick(31, {
        maxTick: 1_920,
        ppq: 480,
        quantize: "1/64",
      }) !== 30 ||
    snapPianoRollTick(31, {
        maxTick: 1_920,
        ppq: 480,
        quantize: "off",
      }) !== 31
  ) {
    throw new Error("1/64 and free-Tick placement must remain precise");
  }
});
