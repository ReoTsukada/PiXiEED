/** Host-neutral chip-tune authoring primitives used by the Audio workspace. */

export type ChipSynthWaveform =
  | "pulse"
  | "triangle"
  | "sawtooth"
  | "sine"
  | "noise";

export type ChipSynthPresetId =
  | "pulse-25"
  | "pulse-50"
  | "triangle"
  | "sawtooth"
  | "noise";

export interface ChipSynthPreset {
  readonly id: ChipSynthPresetId;
  readonly label: string;
  readonly waveform: ChipSynthWaveform;
  readonly dutyCycle: number;
  readonly attackMs: number;
  readonly decayMs: number;
  readonly sustain: number;
  readonly releaseMs: number;
}

/** Lightweight, host-neutral voice description used by the browser synth. */
export type ChipSynthFilterType = "lowpass" | "highpass" | "bandpass";

export type ChipSynthNoiseColor = "white" | "pink";

export interface ChipSynthFilterProfile {
  readonly type: ChipSynthFilterType;
  readonly frequencyHz: number;
  readonly q: number;
}

export interface ChipSynthSecondaryOscillator {
  readonly waveform: Exclude<ChipSynthWaveform, "noise">;
  readonly ratio: number;
  readonly gain: number;
  readonly detuneCents: number;
  readonly dutyCycle: number;
}

export interface ChipSynthVoiceProfile {
  readonly id: string;
  readonly waveform: ChipSynthWaveform;
  readonly dutyCycle: number;
  readonly attackMs: number;
  readonly decayMs: number;
  readonly sustain: number;
  readonly releaseMs: number;
  readonly filter: ChipSynthFilterProfile | undefined;
  readonly secondary: readonly ChipSynthSecondaryOscillator[];
  readonly noiseColor: ChipSynthNoiseColor;
  /** Extra breath, pick, mallet or key noise mixed into the voice. */
  readonly transientLevel: number;
  readonly transientMs: number;
  /** A value above 1 creates the downward pitch sweep used by membranes. */
  readonly pitchStartRatio: number;
  readonly pitchSweepMs: number;
  readonly vibratoDepthCents: number;
  readonly vibratoRateHz: number;
}

/** Runtime projection of the Audio-200 custom preset record. */
export interface ChipSynthVoiceOverride {
  readonly waveform?: ChipSynthWaveform;
  readonly dutyCycle?: number;
  readonly attackMs?: number;
  readonly decayMs?: number;
  readonly sustain?: number;
  readonly releaseMs?: number;
  readonly filter?: Partial<ChipSynthFilterProfile> | null;
  readonly noiseColor?: ChipSynthNoiseColor;
  readonly transientLevel?: number;
  readonly transientMs?: number;
  readonly pitchStartRatio?: number;
  readonly pitchSweepMs?: number;
  readonly vibratoDepthCents?: number;
  readonly vibratoRateHz?: number;
}

type ChipSynthVoicePatch =
  & Partial<
    Omit<ChipSynthVoiceProfile, "id" | "filter" | "secondary">
  >
  & {
    readonly waveform: ChipSynthWaveform;
    readonly filter?: ChipSynthFilterProfile;
    readonly secondary?: readonly ChipSynthSecondaryOscillator[];
  };

const secondary = (
  waveform: Exclude<ChipSynthWaveform, "noise">,
  ratio: number,
  gain: number,
  detuneCents = 0,
  dutyCycle = 0.5,
): ChipSynthSecondaryOscillator => ({
  waveform,
  ratio,
  gain,
  detuneCents,
  dutyCycle,
});

const filter = (
  type: ChipSynthFilterType,
  frequencyHz: number,
  q = 0.7,
): ChipSynthFilterProfile => ({ type, frequencyHz, q });

const makeVoice = (
  id: string,
  patch: ChipSynthVoicePatch,
): ChipSynthVoiceProfile =>
  Object.freeze({
    id,
    waveform: patch.waveform,
    dutyCycle: patch.dutyCycle ?? 0.5,
    attackMs: patch.attackMs ?? 4,
    decayMs: patch.decayMs ?? 180,
    sustain: patch.sustain ?? 0.35,
    releaseMs: patch.releaseMs ?? 140,
    filter: patch.filter === undefined
      ? undefined
      : Object.freeze({ ...patch.filter }),
    secondary: Object.freeze([...(patch.secondary ?? [])]),
    noiseColor: patch.noiseColor ?? "white",
    transientLevel: patch.transientLevel ?? 0,
    transientMs: patch.transientMs ?? 18,
    pitchStartRatio: patch.pitchStartRatio ?? 1,
    pitchSweepMs: patch.pitchSweepMs ?? 0,
    vibratoDepthCents: patch.vibratoDepthCents ?? 0,
    vibratoRateHz: patch.vibratoRateHz ?? 5.2,
  });

export const CHIP_SYNTH_PRESETS: readonly ChipSynthPreset[] = Object.freeze(
  [
    {
      id: "pulse-25",
      label: "Pulse 25%",
      waveform: "pulse",
      dutyCycle: 0.25,
      attackMs: 2,
      decayMs: 28,
      sustain: 0.62,
      releaseMs: 18,
    },
    {
      id: "pulse-50",
      label: "Pulse 50%",
      waveform: "pulse",
      dutyCycle: 0.5,
      attackMs: 2,
      decayMs: 34,
      sustain: 0.68,
      releaseMs: 20,
    },
    {
      id: "triangle",
      label: "Triangle",
      waveform: "triangle",
      dutyCycle: 0.5,
      attackMs: 4,
      decayMs: 42,
      sustain: 0.58,
      releaseMs: 26,
    },
    {
      id: "sawtooth",
      label: "Saw",
      waveform: "sawtooth",
      dutyCycle: 0.5,
      attackMs: 2,
      decayMs: 24,
      sustain: 0.48,
      releaseMs: 18,
    },
    {
      id: "noise",
      label: "Noise Drums",
      waveform: "noise",
      dutyCycle: 0.5,
      attackMs: 1,
      decayMs: 12,
      sustain: 0.32,
      releaseMs: 8,
    },
  ] as const,
);

/**
 * Small modeled voices instead of large sample banks.  The values describe
 * the audible cues that separate instruments: partials, transient, filter and
 * envelope.  They are intentionally deterministic and cheap enough for note
 * audition as well as long timeline playback.
 */
const CHIP_SYNTH_VOICE_PROFILES: Readonly<
  Record<string, ChipSynthVoiceProfile>
> = Object.freeze({
  PIANO: makeVoice("PIANO", {
    waveform: "sine",
    attackMs: 4,
    decayMs: 760,
    sustain: 0.24,
    releaseMs: 420,
    filter: filter("lowpass", 5_800, 0.65),
    secondary: [secondary("sine", 2, 0.2), secondary("triangle", 3, 0.08)],
    transientLevel: 0.08,
    transientMs: 14,
  }),
  PIANO_2: makeVoice("PIANO_2", {
    waveform: "sine",
    attackMs: 7,
    decayMs: 980,
    sustain: 0.3,
    releaseMs: 520,
    filter: filter("lowpass", 3_900, 0.7),
    secondary: [secondary("sine", 2, 0.12), secondary("triangle", 4, 0.04)],
    transientLevel: 0.04,
    transientMs: 18,
  }),
  EPIANO: makeVoice("EPIANO", {
    waveform: "sine",
    attackMs: 6,
    decayMs: 520,
    sustain: 0.58,
    releaseMs: 240,
    filter: filter("lowpass", 3_800, 0.8),
    secondary: [secondary("pulse", 2, 0.2, 4, 0.5)],
    transientLevel: 0.035,
    transientMs: 20,
    vibratoDepthCents: 2.5,
    vibratoRateHz: 4.8,
  }),
  ORGAN: makeVoice("ORGAN", {
    waveform: "pulse",
    dutyCycle: 0.5,
    attackMs: 14,
    decayMs: 90,
    sustain: 0.84,
    releaseMs: 180,
    filter: filter("lowpass", 5_500, 0.55),
    secondary: [secondary("sine", 2, 0.36), secondary("sine", 3, 0.18)],
  }),
  CLAVINET: makeVoice("CLAVINET", {
    waveform: "pulse",
    dutyCycle: 0.25,
    attackMs: 1,
    decayMs: 170,
    sustain: 0.16,
    releaseMs: 80,
    filter: filter("bandpass", 2_200, 1.1),
    secondary: [secondary("sawtooth", 2, 0.12)],
    transientLevel: 0.2,
    transientMs: 9,
  }),
  GUITAR: makeVoice("GUITAR", {
    waveform: "triangle",
    attackMs: 2,
    decayMs: 420,
    sustain: 0.17,
    releaseMs: 180,
    filter: filter("lowpass", 3_200, 0.75),
    secondary: [secondary("sine", 2, 0.12)],
    transientLevel: 0.18,
    transientMs: 16,
  }),
  ELECTRIC_GUITAR: makeVoice("ELECTRIC_GUITAR", {
    waveform: "sawtooth",
    attackMs: 2,
    decayMs: 560,
    sustain: 0.28,
    releaseMs: 220,
    filter: filter("lowpass", 4_600, 0.95),
    secondary: [secondary("triangle", 2, 0.18, 3)],
    transientLevel: 0.12,
    transientMs: 13,
  }),
  BASS: makeVoice("BASS", {
    waveform: "triangle",
    attackMs: 4,
    decayMs: 280,
    sustain: 0.52,
    releaseMs: 180,
    filter: filter("lowpass", 1_250, 0.75),
    secondary: [secondary("sawtooth", 1, 0.22, -7)],
    transientLevel: 0.04,
    transientMs: 20,
  }),
  STRINGS: makeVoice("STRINGS", {
    waveform: "sawtooth",
    attackMs: 75,
    decayMs: 260,
    sustain: 0.78,
    releaseMs: 520,
    filter: filter("lowpass", 3_100, 0.65),
    secondary: [secondary("triangle", 1, 0.36, -6)],
    vibratoDepthCents: 5,
    vibratoRateHz: 5.1,
  }),
  VIOLIN: makeVoice("VIOLIN", {
    waveform: "sawtooth",
    attackMs: 48,
    decayMs: 180,
    sustain: 0.78,
    releaseMs: 360,
    filter: filter("lowpass", 4_200, 0.75),
    secondary: [secondary("triangle", 2, 0.2, 5)],
    transientLevel: 0.035,
    transientMs: 18,
    vibratoDepthCents: 7,
    vibratoRateHz: 5.5,
  }),
  CELLO: makeVoice("CELLO", {
    waveform: "triangle",
    attackMs: 82,
    decayMs: 280,
    sustain: 0.76,
    releaseMs: 420,
    filter: filter("lowpass", 2_200, 0.7),
    secondary: [secondary("sawtooth", 2, 0.16, -4)],
    vibratoDepthCents: 4,
    vibratoRateHz: 4.6,
  }),
  HARP: makeVoice("HARP", {
    waveform: "triangle",
    attackMs: 2,
    decayMs: 680,
    sustain: 0.1,
    releaseMs: 230,
    filter: filter("lowpass", 5_200, 0.6),
    secondary: [secondary("sine", 2, 0.14)],
    transientLevel: 0.16,
    transientMs: 12,
  }),
  MARIMBA: makeVoice("MARIMBA", {
    waveform: "sine",
    attackMs: 2,
    decayMs: 360,
    sustain: 0.08,
    releaseMs: 160,
    filter: filter("lowpass", 3_400, 0.65),
    secondary: [secondary("sine", 3.95, 0.24)],
    transientLevel: 0.14,
    transientMs: 10,
  }),
  KALIMBA: makeVoice("KALIMBA", {
    waveform: "pulse",
    dutyCycle: 0.25,
    attackMs: 1,
    decayMs: 410,
    sustain: 0.07,
    releaseMs: 170,
    filter: filter("bandpass", 3_100, 1.15),
    secondary: [secondary("sine", 2.03, 0.22)],
    transientLevel: 0.13,
    transientMs: 8,
  }),
  VIBRAPHONE: makeVoice("VIBRAPHONE", {
    waveform: "sine",
    attackMs: 3,
    decayMs: 900,
    sustain: 0.2,
    releaseMs: 520,
    filter: filter("lowpass", 4_800, 0.65),
    secondary: [secondary("sine", 3.0, 0.18), secondary("sine", 4.2, 0.08)],
    transientLevel: 0.06,
    transientMs: 12,
    vibratoDepthCents: 7,
    vibratoRateHz: 5.8,
  }),
  XYLOPHONE: makeVoice("XYLOPHONE", {
    waveform: "sine",
    attackMs: 1,
    decayMs: 210,
    sustain: 0.04,
    releaseMs: 100,
    filter: filter("lowpass", 5_000, 0.6),
    secondary: [secondary("sine", 3.8, 0.3)],
    transientLevel: 0.17,
    transientMs: 8,
  }),
  CELESTA: makeVoice("CELESTA", {
    waveform: "sine",
    attackMs: 3,
    decayMs: 720,
    sustain: 0.12,
    releaseMs: 380,
    filter: filter("highpass", 420, 0.55),
    secondary: [secondary("sine", 2, 0.24), secondary("sine", 4, 0.09)],
    transientLevel: 0.05,
    transientMs: 10,
  }),
  TUBULAR_BELLS: makeVoice("TUBULAR_BELLS", {
    waveform: "sine",
    attackMs: 2,
    decayMs: 1_650,
    sustain: 0.16,
    releaseMs: 950,
    filter: filter("lowpass", 5_800, 0.55),
    secondary: [secondary("sine", 2.01, 0.28), secondary("sine", 3.9, 0.1)],
    transientLevel: 0.08,
    transientMs: 14,
  }),
  STEEL_DRUM: makeVoice("STEEL_DRUM", {
    waveform: "sine",
    attackMs: 2,
    decayMs: 620,
    sustain: 0.1,
    releaseMs: 280,
    filter: filter("bandpass", 2_900, 1.05),
    secondary: [secondary("sine", 2.7, 0.2), secondary("sine", 4.1, 0.08)],
    transientLevel: 0.12,
    transientMs: 10,
  }),
  FLUTE: makeVoice("FLUTE", {
    waveform: "sine",
    attackMs: 38,
    decayMs: 140,
    sustain: 0.76,
    releaseMs: 150,
    filter: filter("lowpass", 2_700, 0.7),
    secondary: [secondary("triangle", 2, 0.08)],
    transientLevel: 0.08,
    transientMs: 40,
    noiseColor: "pink",
    vibratoDepthCents: 2,
    vibratoRateHz: 5.2,
  }),
  CLARINET: makeVoice("CLARINET", {
    waveform: "pulse",
    dutyCycle: 0.25,
    attackMs: 24,
    decayMs: 170,
    sustain: 0.7,
    releaseMs: 130,
    filter: filter("lowpass", 3_400, 0.8),
    secondary: [secondary("sine", 3, 0.12)],
    transientLevel: 0.035,
    transientMs: 22,
    vibratoDepthCents: 2.5,
    vibratoRateHz: 5.1,
  }),
  SAXOPHONE: makeVoice("SAXOPHONE", {
    waveform: "sawtooth",
    attackMs: 24,
    decayMs: 180,
    sustain: 0.74,
    releaseMs: 170,
    filter: filter("bandpass", 1_650, 0.75),
    secondary: [secondary("pulse", 2, 0.12, 4, 0.5)],
    transientLevel: 0.08,
    transientMs: 28,
    vibratoDepthCents: 4,
    vibratoRateHz: 5.3,
  }),
  TRUMPET: makeVoice("TRUMPET", {
    waveform: "sawtooth",
    attackMs: 18,
    decayMs: 150,
    sustain: 0.7,
    releaseMs: 120,
    filter: filter("lowpass", 4_600, 0.8),
    secondary: [secondary("pulse", 2, 0.22, 3, 0.5)],
    transientLevel: 0.08,
    transientMs: 18,
  }),
  BRASS: makeVoice("BRASS", {
    waveform: "pulse",
    dutyCycle: 0.5,
    attackMs: 28,
    decayMs: 210,
    sustain: 0.76,
    releaseMs: 190,
    filter: filter("lowpass", 3_900, 0.75),
    secondary: [secondary("sawtooth", 2, 0.2, -4)],
    transientLevel: 0.06,
    transientMs: 26,
  }),
  SYNTH_LEAD: makeVoice("SYNTH_LEAD", {
    waveform: "sawtooth",
    attackMs: 8,
    decayMs: 260,
    sustain: 0.62,
    releaseMs: 180,
    filter: filter("lowpass", 5_200, 0.7),
    secondary: [secondary("pulse", 1, 0.2, 7, 0.5)],
    vibratoDepthCents: 3,
    vibratoRateHz: 5.4,
  }),
  SYNTH_PAD: makeVoice("SYNTH_PAD", {
    waveform: "triangle",
    attackMs: 120,
    decayMs: 520,
    sustain: 0.72,
    releaseMs: 680,
    filter: filter("lowpass", 2_900, 0.6),
    secondary: [secondary("sawtooth", 1, 0.18, -9)],
    vibratoDepthCents: 2,
    vibratoRateHz: 4.2,
  }),
  TAMBOURINE: makeVoice("TAMBOURINE", {
    waveform: "noise",
    attackMs: 1,
    decayMs: 150,
    sustain: 0.035,
    releaseMs: 80,
    filter: filter("highpass", 5_400, 0.8),
    transientLevel: 0.5,
    transientMs: 6,
  }),
  SHAKER: makeVoice("SHAKER", {
    waveform: "noise",
    attackMs: 1,
    decayMs: 95,
    sustain: 0.025,
    releaseMs: 48,
    filter: filter("highpass", 3_800, 0.65),
    noiseColor: "pink",
    transientLevel: 0.3,
    transientMs: 5,
  }),
});

export interface ChipTuneNote {
  readonly pitchMidi: number;
  readonly startFrame: number;
  readonly durationFrames: number;
  readonly velocity?: number;
}

export interface ScheduledChipTuneNote {
  readonly pitchMidi: number;
  readonly frequencyHz: number;
  readonly startFrame: number;
  readonly durationFrames: number;
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly velocity: number;
}

export function midiToFrequency(pitchMidi: number): number {
  if (!Number.isFinite(pitchMidi) || pitchMidi < 0 || pitchMidi > 127) {
    return 0;
  }
  return 440 * Math.pow(2, (Math.trunc(pitchMidi) - 69) / 12);
}

export function getChipSynthPreset(
  presetId: ChipSynthPresetId,
): ChipSynthPreset {
  return CHIP_SYNTH_PRESETS.find((preset) => preset.id === presetId) ??
    CHIP_SYNTH_PRESETS[0]!;
}

const voiceFromPreset = (
  presetId: ChipSynthPresetId,
): ChipSynthVoiceProfile => {
  const preset = getChipSynthPreset(presetId);
  return makeVoice(`preset:${preset.id}`, {
    waveform: preset.waveform,
    dutyCycle: preset.dutyCycle,
    attackMs: preset.attackMs,
    decayMs: preset.decayMs,
    sustain: preset.sustain,
    releaseMs: preset.releaseMs,
  });
};

const drumVoiceForPitch = (
  pitchMidi: number,
  presetId: ChipSynthPresetId,
): ChipSynthVoiceProfile => {
  const pitch = Math.trunc(pitchMidi);
  if (pitch === 36 || pitch === 35) {
    return makeVoice("DRUMS_KICK", {
      waveform: presetId === "pulse-25" ? "pulse" : "sine",
      attackMs: 1,
      decayMs: 210,
      sustain: 0.035,
      releaseMs: 75,
      filter: filter("lowpass", 1_250, 0.7),
      pitchStartRatio: 6.5,
      pitchSweepMs: 34,
      transientLevel: 0.08,
      transientMs: 8,
    });
  }
  if (pitch === 38 || pitch === 39 || pitch === 40) {
    return makeVoice("DRUMS_SNARE", {
      waveform: presetId === "sawtooth" ? "sawtooth" : "noise",
      attackMs: 1,
      decayMs: 145,
      sustain: 0.05,
      releaseMs: 65,
      filter: filter("bandpass", 1_850, 0.8),
      transientLevel: 0.26,
      transientMs: 5,
    });
  }
  if (pitch === 42 || pitch === 44 || pitch === 46) {
    const softHat = presetId === "triangle";
    return makeVoice(pitch === 46 ? "DRUMS_OPEN_HAT" : "DRUMS_HAT", {
      waveform: softHat ? "triangle" : "noise",
      attackMs: 1,
      decayMs: pitch === 46 ? 230 : 54,
      sustain: 0.018,
      releaseMs: pitch === 46 ? 125 : 32,
      filter: softHat
        ? filter("lowpass", 3_600, 0.7)
        : filter("highpass", 5_800, 0.75),
      transientLevel: 0.34,
      transientMs: 4,
    });
  }
  return makeVoice("DRUMS_TOM", {
    waveform: presetId === "sawtooth" ? "sawtooth" : "sine",
    attackMs: 1,
    decayMs: 240,
    sustain: 0.06,
    releaseMs: 90,
    filter: filter("lowpass", 2_100, 0.7),
    pitchStartRatio: 2.5,
    pitchSweepMs: 24,
    transientLevel: 0.08,
    transientMs: 7,
  });
};

/** Resolve an instrument name to its modeled voice without touching Web Audio. */
export function getChipSynthVoice(
  voiceId?: string,
  pitchMidi?: number,
  presetId: ChipSynthPresetId = "pulse-25",
  overrides?: ReadonlyMap<string, ChipSynthVoiceOverride>,
): ChipSynthVoiceProfile {
  const normalized = String(voiceId ?? "").trim().toUpperCase().replace(
    /^INSTRUMENT:/u,
    "",
  );
  const base = normalized === "DRUMS"
    ? drumVoiceForPitch(pitchMidi ?? 38, presetId)
    : normalized === "CHIP" || normalized.length === 0
    ? voiceFromPreset(presetId)
    : CHIP_SYNTH_VOICE_PROFILES[normalized] ?? voiceFromPreset(presetId);
  const override = overrides?.get(normalized);
  return override === undefined
    ? base
    : applyChipSynthVoiceOverride(base, override);
}

/** Apply only the user-editable scalar controls to a modeled instrument. */
export function applyChipSynthVoiceOverride(
  base: ChipSynthVoiceProfile,
  override: ChipSynthVoiceOverride,
): ChipSynthVoiceProfile {
  const nextFilter = override.filter === null
    ? undefined
    : override.filter === undefined
    ? base.filter
    : {
      type: override.filter.type ?? base.filter?.type ?? "lowpass",
      frequencyHz: override.filter.frequencyHz ??
        base.filter?.frequencyHz ?? 6_000,
      q: override.filter.q ?? base.filter?.q ?? 0.7,
    };
  const patch: ChipSynthVoicePatch = {
    waveform: override.waveform ?? base.waveform,
    dutyCycle: override.dutyCycle ?? base.dutyCycle,
    attackMs: override.attackMs ?? base.attackMs,
    decayMs: override.decayMs ?? base.decayMs,
    sustain: override.sustain ?? base.sustain,
    releaseMs: override.releaseMs ?? base.releaseMs,
    noiseColor: override.noiseColor ?? base.noiseColor,
    transientLevel: override.transientLevel ?? base.transientLevel,
    transientMs: override.transientMs ?? base.transientMs,
    pitchStartRatio: override.pitchStartRatio ?? base.pitchStartRatio,
    pitchSweepMs: override.pitchSweepMs ?? base.pitchSweepMs,
    vibratoDepthCents: override.vibratoDepthCents ?? base.vibratoDepthCents,
    vibratoRateHz: override.vibratoRateHz ?? base.vibratoRateHz,
    secondary: base.secondary,
    ...(nextFilter === undefined ? {} : { filter: nextFilter }),
  };
  return makeVoice(base.id, patch);
}

export function buildChipTuneSchedule(
  notes: readonly ChipTuneNote[],
  fps: number,
  frameCount: number,
): readonly ScheduledChipTuneNote[] {
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(frameCount)) {
    return [];
  }
  const boundedFrameCount = Math.max(1, Math.trunc(frameCount));
  return notes
    .filter((note) => {
      return Number.isFinite(note.pitchMidi) &&
        midiToFrequency(note.pitchMidi) > 0 &&
        Number.isFinite(note.startFrame) &&
        Number.isFinite(note.durationFrames);
    })
    .map((note) => {
      const startFrame = Math.min(
        boundedFrameCount - 1,
        Math.max(0, Math.trunc(note.startFrame)),
      );
      const durationFrames = Math.max(1, Math.trunc(note.durationFrames));
      const velocity = Math.min(
        1,
        Math.max(0.05, Number.isFinite(note.velocity) ? note.velocity! : 0.8),
      );
      return {
        pitchMidi: Math.trunc(note.pitchMidi),
        frequencyHz: midiToFrequency(note.pitchMidi),
        startFrame,
        durationFrames,
        startSeconds: startFrame / fps,
        durationSeconds: durationFrames / fps,
        velocity,
      };
    })
    .sort((left, right) =>
      left.startFrame - right.startFrame || left.pitchMidi - right.pitchMidi
    );
}
