/**
 * Musical context helpers shared by the Audio editor and its Piano Roll.
 *
 * The context is intentionally a guide for note authoring.  It does not
 * rewrite existing notes unless an explicit editing mode asks it to do so.
 */

import {
  type AudioMusicalContext,
  type AudioMusicalKey,
  type AudioMusicalScaleId,
  type AudioScaleGuideMode,
} from "../audio-200/contracts.ts";

export interface AudioMusicalScaleDefinition {
  readonly id: AudioMusicalScaleId;
  readonly label: string;
  readonly intervals: readonly number[];
}

const AUDIO_MUSICAL_SCALE_DEFINITIONS: readonly AudioMusicalScaleDefinition[] =
  Object.freeze(
    [
      { id: "major", label: "Major", intervals: [0, 2, 4, 5, 7, 9, 11] },
      { id: "minor", label: "Minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
      {
        id: "harmonic-minor",
        label: "Harmonic Minor",
        intervals: [0, 2, 3, 5, 7, 8, 11],
      },
      {
        id: "melodic-minor",
        label: "Melodic Minor",
        intervals: [0, 2, 3, 5, 7, 9, 11],
      },
      { id: "dorian", label: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10] },
      {
        id: "phrygian",
        label: "Phrygian",
        intervals: [0, 1, 3, 5, 7, 8, 10],
      },
      { id: "lydian", label: "Lydian", intervals: [0, 2, 4, 6, 7, 9, 11] },
      {
        id: "mixolydian",
        label: "Mixolydian",
        intervals: [0, 2, 4, 5, 7, 9, 10],
      },
      { id: "locrian", label: "Locrian", intervals: [0, 1, 3, 5, 6, 8, 10] },
      {
        id: "pentatonic",
        label: "Major Pentatonic",
        intervals: [0, 2, 4, 7, 9],
      },
      {
        id: "minor-pentatonic",
        label: "Minor Pentatonic",
        intervals: [0, 3, 5, 7, 10],
      },
      { id: "blues", label: "Blues", intervals: [0, 3, 5, 6, 7, 10] },
      {
        id: "chromatic",
        label: "Chromatic",
        intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      },
    ] satisfies readonly AudioMusicalScaleDefinition[],
  );

export { AUDIO_MUSICAL_SCALE_DEFINITIONS };

const KEY_PITCH_CLASSES: Readonly<Record<AudioMusicalKey, number>> = {
  C: 0,
  "C♯": 1,
  D: 2,
  "D♯": 3,
  E: 4,
  F: 5,
  "F♯": 6,
  G: 7,
  "G♯": 8,
  A: 9,
  "A♯": 10,
  B: 11,
};

export function audioMusicalScaleDefinition(
  scale: AudioMusicalScaleId,
): AudioMusicalScaleDefinition {
  return AUDIO_MUSICAL_SCALE_DEFINITIONS.find((item) => item.id === scale) ??
    AUDIO_MUSICAL_SCALE_DEFINITIONS[0]!;
}

export function audioMusicalKeyPitchClass(key: AudioMusicalKey): number {
  return KEY_PITCH_CLASSES[key];
}

export function audioMusicalScalePitchClasses(
  context: AudioMusicalContext,
): ReadonlySet<number> {
  const root = audioMusicalKeyPitchClass(context.key);
  return new Set(
    audioMusicalScaleDefinition(context.scale).intervals.map((interval) =>
      (root + interval) % 12
    ),
  );
}

export function isAudioPitchInMusicalScale(
  pitchMidi: number,
  context: AudioMusicalContext,
): boolean {
  return audioMusicalScalePitchClasses(context).has(
    Math.trunc(pitchMidi) % 12,
  );
}

/**
 * Resolve a user-entered pitch using the selected guide policy. Existing
 * notes are intentionally outside this helper: changing the musical context
 * never rewrites canonical notes.
 */
export function audioMusicalPitchForInput(
  pitchMidi: number,
  context: AudioMusicalContext,
  mode: AudioScaleGuideMode,
  minPitch = 0,
  maxPitch = 127,
): number | undefined {
  if (!Number.isFinite(pitchMidi)) return undefined;
  const lower = Math.min(Math.trunc(minPitch), Math.trunc(maxPitch));
  const upper = Math.max(Math.trunc(minPitch), Math.trunc(maxPitch));
  const bounded = Math.max(lower, Math.min(upper, Math.trunc(pitchMidi)));
  if (mode === "DISPLAY" || isAudioPitchInMusicalScale(bounded, context)) {
    return bounded;
  }
  if (mode === "SNAP") {
    return snapAudioPitchToMusicalScale(bounded, context, lower, upper);
  }
  return undefined;
}

/**
 * Return the nearest pitch inside the selected scale. Ties prefer the lower
 * pitch so a click between two scale rows does not jump unexpectedly upward.
 */
export function snapAudioPitchToMusicalScale(
  pitchMidi: number,
  context: AudioMusicalContext,
  minPitch = 0,
  maxPitch = 127,
): number {
  const lower = Math.min(Math.trunc(minPitch), Math.trunc(maxPitch));
  const upper = Math.max(Math.trunc(minPitch), Math.trunc(maxPitch));
  const bounded = Math.max(lower, Math.min(upper, Math.trunc(pitchMidi)));
  const pitchClasses = audioMusicalScalePitchClasses(context);
  if (pitchClasses.has(bounded % 12)) return bounded;
  let best = bounded;
  let distance = Number.POSITIVE_INFINITY;
  for (let candidate = lower; candidate <= upper; candidate += 1) {
    if (!pitchClasses.has(candidate % 12)) continue;
    const nextDistance = Math.abs(candidate - bounded);
    if (
      nextDistance < distance || (nextDistance === distance && candidate < best)
    ) {
      best = candidate;
      distance = nextDistance;
    }
  }
  return best;
}
