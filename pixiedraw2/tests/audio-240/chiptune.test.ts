import {
  applyChipSynthVoiceOverride,
  buildChipTuneSchedule,
  CHIP_SYNTH_PRESETS,
  getChipSynthPreset,
  getChipSynthVoice,
  midiToFrequency,
} from "../../src/audio/audio-240/chiptune.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("AUDIO-240 chip presets expose bounded arcade waveforms", () => {
  assert(CHIP_SYNTH_PRESETS.length === 5, "Chip preset set is incomplete.");
  assert(
    getChipSynthPreset("pulse-25").dutyCycle === 0.25,
    "Pulse duty cycle is not canonical.",
  );
  assert(
    getChipSynthPreset("noise").waveform === "noise",
    "Noise preset is not available.",
  );
  assert(midiToFrequency(69) === 440, "MIDI A4 frequency is not canonical.");
  assert(
    midiToFrequency(-1) === 0 && midiToFrequency(128) === 0,
    "Out-of-range MIDI pitch was accepted.",
  );
});

Deno.test("AUDIO-240 chip schedule binds notes to animation frames", () => {
  const schedule = buildChipTuneSchedule(
    [
      { pitchMidi: 67, startFrame: 7, durationFrames: 2, velocity: 0.7 },
      { pitchMidi: 60, startFrame: -2, durationFrames: 0 },
      { pitchMidi: 200, startFrame: 2, durationFrames: 2 },
    ],
    24,
    8,
  );
  assert(schedule.length === 2, "Invalid chip notes were not rejected.");
  assert(
    schedule[0]?.startFrame === 0 && schedule[0]?.durationFrames === 1,
    "Frame bounds were not clamped.",
  );
  assert(
    schedule[1]?.startFrame === 7 && schedule[1]?.startSeconds === 7 / 24,
    "Frame timing was not projected.",
  );
});

Deno.test("AUDIO-240 modeled voices preserve instrument-specific cues", () => {
  const piano = getChipSynthVoice("PIANO");
  const guitar = getChipSynthVoice("ELECTRIC_GUITAR");
  const kick = getChipSynthVoice("DRUMS", 36);
  const hat = getChipSynthVoice("DRUMS", 42);
  const fallbackChip = getChipSynthVoice("CHIP", 72, "pulse-25");
  assert(
    piano.waveform === "sine" && piano.secondary.length >= 2,
    "Piano partials are missing.",
  );
  assert(
    guitar.filter?.type === "lowpass" && guitar.transientLevel > 0,
    "Guitar pick and tone shaping are missing.",
  );
  assert(
    kick.pitchStartRatio > 1 && kick.pitchSweepMs > 0,
    "Kick pitch sweep is missing.",
  );
  assert(
    hat.waveform === "noise" && hat.filter?.type === "highpass",
    "Hat high-frequency noise profile is missing.",
  );
  assert(
    fallbackChip.waveform === "pulse" && fallbackChip.dutyCycle === 0.25,
    "Chip preset selection was not preserved.",
  );
});

Deno.test("AUDIO-240 custom voice controls override the modeled base safely", () => {
  const base = getChipSynthVoice("ELECTRIC_GUITAR");
  const custom = applyChipSynthVoiceOverride(base, {
    waveform: "sine",
    attackMs: 34,
    releaseMs: 480,
    filter: { type: "bandpass", frequencyHz: 1_900, q: 2.4 },
    vibratoDepthCents: 9,
  });
  assert(custom.waveform === "sine", "Custom waveform was not applied.");
  assert(
    custom.attackMs === 34 && custom.releaseMs === 480,
    "Envelope controls were not applied.",
  );
  assert(
    custom.filter?.type === "bandpass" && custom.filter.frequencyHz === 1_900,
    "Filter controls were not applied.",
  );
  assert(
    custom.secondary.length === base.secondary.length,
    "Instrument partials were discarded.",
  );
});
