import {
  applyChipSynthVoiceOverride,
  buildChipTuneSchedule,
  CHIP_SYNTH_PRESETS,
  CHIP_SYNTH_MACHINE_PROFILES,
  getChipSynthPreset,
  getChipSynthMachineProfile,
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

Deno.test("AUDIO-240 hardware chip profiles expose GB and Famicom channels", () => {
  assert(
    CHIP_SYNTH_MACHINE_PROFILES.length === 3 &&
      getChipSynthMachineProfile("GAME_BOY").channels.length === 4 &&
      getChipSynthMachineProfile("FAMICOM").channels.length === 4,
    "Hardware chip channel layouts are incomplete.",
  );
  const gbPulse = getChipSynthVoice(
    "GB_PULSE_1",
    60,
    "pulse-25",
  );
  const gbNoise = getChipSynthVoice("GB_NOISE", 42, "noise");
  const nesPulse = getChipSynthVoice("NES_PULSE_1", 60, "pulse-25");
  const nesNoise = getChipSynthVoice("NES_NOISE", 42, "noise");
  const genericGameBoyChip = getChipSynthVoice(
    "CHIP",
    60,
    "pulse-50",
    undefined,
    "GAME_BOY",
  );
  assert(
    gbPulse.waveform === "pulse" && gbPulse.dutyCycle === 0.25 &&
      gbNoise.noiseMode === "game-boy" &&
      nesPulse.dutyCycle === 0.125 && nesNoise.noiseMode === "nes-long",
    "Hardware-specific voice profiles are not distinct.",
  );
  assert(
    genericGameBoyChip.id === "GB_PULSE_1",
    "Generic CHIP did not bind to the selected Game Boy channel.",
  );
});

Deno.test("AUDIO-240 generic drum presets preserve each kit voice", () => {
  const representative = getChipSynthVoice("DRUMS", 38, "noise");
  const genericOverride = {
    waveform: representative.waveform,
    dutyCycle: representative.dutyCycle,
    attackMs: representative.attackMs,
    decayMs: representative.decayMs,
    sustain: representative.sustain,
    releaseMs: representative.releaseMs,
    filter: {
      type: representative.filter?.type ?? "bandpass",
      frequencyHz: representative.filter?.frequencyHz ?? 1_850,
      q: representative.filter?.q ?? 0.8,
    },
    noiseColor: representative.noiseColor,
    transientLevel: representative.transientLevel,
    transientMs: representative.transientMs,
    pitchStartRatio: representative.pitchStartRatio,
    pitchSweepMs: representative.pitchSweepMs,
    vibratoDepthCents: representative.vibratoDepthCents,
    vibratoRateHz: representative.vibratoRateHz,
  };
  const overrides = new Map<string, typeof genericOverride>([
    ["DRUMS", genericOverride],
  ]);
  const [kick, snare, closedHat, openHat, percussion] = (
    [
      [36, "triangle"],
      [38, "noise"],
      [42, "pulse-25"],
      [46, "pulse-25"],
      [45, "sawtooth"],
    ] as const
  ).map(([pitch, preset]) =>
    getChipSynthVoice("DRUMS", pitch, preset, overrides)
  );

  assert(
    kick !== undefined && kick.waveform === "sine" && kick.pitchStartRatio > 1,
    "A generic drum preset erased the kick voice.",
  );
  assert(
    snare !== undefined &&
      snare.waveform === "noise" &&
      snare.filter?.type === "bandpass",
    "The snare representative changed unexpectedly.",
  );
  assert(
    closedHat !== undefined &&
      closedHat.filter?.type === "highpass" &&
      openHat !== undefined &&
      openHat.id === "DRUMS_OPEN_HAT" &&
      openHat.decayMs > closedHat.decayMs,
    "Closed and open hats lost their separate voices.",
  );
  assert(
    percussion !== undefined &&
      percussion.waveform === "sawtooth" &&
      percussion.pitchStartRatio > 1,
    "The percussion/tom voice was erased by the generic preset.",
  );

  const editedKick = getChipSynthVoice(
    "DRUMS",
    36,
    "triangle",
    new Map([["DRUMS", { ...genericOverride, decayMs: 260 }]]),
  );
  assert(
    editedKick.decayMs === 260 && editedKick.pitchStartRatio > 1,
    "An intentional drum control change was not applied without losing the kick model.",
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
