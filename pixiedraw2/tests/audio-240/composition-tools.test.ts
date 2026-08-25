import { asAudioTick } from "../../src/audio/audio-200/index.ts";
import {
  humanizePianoRollNotes,
  swingPianoRollNotes,
  swingTick,
} from "../../src/audio/audio-240/composition-tools.ts";
import type { PianoRollNote } from "../../src/audio/audio-240/piano-roll.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const clock = {
  framesPerSecond: 24,
  tempoMilliBpm: 120_000,
  ticksPerQuarter: 480,
};

const notes: readonly PianoRollNote[] = [
  {
    id: "note:one",
    pitchMidi: 60,
    startFrame: 0,
    durationFrames: 2,
    startTick: asAudioTick(0),
    durationTick: asAudioTick(120),
    velocity: 0.8,
    instrument: "PIANO",
  },
  {
    id: "note:two",
    pitchMidi: 64,
    startFrame: 3,
    durationFrames: 2,
    startTick: asAudioTick(120),
    durationTick: asAudioTick(120),
    velocity: 0.8,
    instrument: "PIANO",
  },
];

Deno.test("composition swing keeps downbeats and delays offbeats", () => {
  assert(swingTick(0, 120, 66) === 0, "Swing moved the downbeat.");
  assert(swingTick(120, 120, 66) === 146, "Swing did not delay the offbeat.");
  const swung = swingPianoRollNotes(notes, clock, {
    subdivisionTicks: 120,
    amountPercent: 66,
  });
  assert(
    swung[1]?.startTick === asAudioTick(146),
    "Note swing was not projected.",
  );
});

Deno.test("composition humanize is bounded and deterministic", () => {
  const options = {
    timingTicks: 20,
    durationTicks: 10,
    velocityAmount: 0.1,
    seed: 7,
  };
  const first = humanizePianoRollNotes(notes, clock, options);
  const second = humanizePianoRollNotes(notes, clock, options);
  assert(
    JSON.stringify(first) === JSON.stringify(second),
    "Humanize is not deterministic.",
  );
  for (const note of first) {
    assert(Number(note.startTick) >= 0, "Humanize moved a note before Tick 0.");
    assert(Number(note.durationTick) >= 1, "Humanize created an empty note.");
    assert(
      note.velocity >= 0.05 && note.velocity <= 1,
      "Humanize exceeded velocity bounds.",
    );
  }
});
