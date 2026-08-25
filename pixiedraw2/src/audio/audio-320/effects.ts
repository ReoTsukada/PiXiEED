/**
 * AUDIO-320 Insert FX semantics shared by Offline Render and Freeze.
 *
 * The implementation is intentionally bounded and deterministic.  Browser
 * realtime nodes are created by MixerRuntimeAdapter; this module owns the
 * canonical parameter interpretation and the host-neutral render projection.
 */

import type { AudioEffect } from "../audio-200/contracts.ts";
import {
  type AudioAutomationCurve,
  automationValueAtSeconds,
} from "../audio-300/index.ts";

const MIN_DB = -120;
const MAX_DB = 24;

/**
 * The Audio EQ editor and both render paths share these fixed musical bands.
 * Keeping the band identities stable makes automation and saved Projects
 * portable while the UI remains small enough for the lightweight workspace.
 */
export const AUDIO_EQ_BANDS = Object.freeze(
  [
    { parameterName: "band60", frequencyHz: 60, label: "60" },
    { parameterName: "band120", frequencyHz: 120, label: "120" },
    { parameterName: "band250", frequencyHz: 250, label: "250" },
    { parameterName: "band500", frequencyHz: 500, label: "500" },
    { parameterName: "band1000", frequencyHz: 1_000, label: "1k" },
    { parameterName: "band2000", frequencyHz: 2_000, label: "2k" },
    { parameterName: "band4000", frequencyHz: 4_000, label: "4k" },
    { parameterName: "band8000", frequencyHz: 8_000, label: "8k" },
  ] as const,
);

interface OfflineBiquadState {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

interface OfflineEqState {
  lowLeft: number;
  lowRight: number;
  bands?: Array<{ left: OfflineBiquadState; right: OfflineBiquadState }>;
}

export interface OfflineEffectChainState {
  readonly eq: Map<string, OfflineEqState>;
  readonly compressor: Map<string, { envelope: number }>;
  readonly delay: Map<string, {
    sampleRateHz: number;
    delayFrames: number;
    index: number;
    left: Float32Array;
    right: Float32Array;
  }>;
  readonly reverb: Map<string, {
    sampleRateHz: number;
    delayFrames: number;
    index: number;
    left: Float32Array;
    right: Float32Array;
  }>;
}

export interface OfflineEffectChainOptions {
  readonly effects: readonly AudioEffect[];
  readonly state: OfflineEffectChainState;
  readonly sampleRateHz: number;
  readonly blockStartSeconds: number;
  readonly tempoMilliBpm: number;
  readonly ticksPerQuarter: number;
  readonly curveFor?: (
    effectId: string,
    parameterName: string,
  ) => AudioAutomationCurve | undefined;
}

export function createOfflineEffectChainState(): OfflineEffectChainState {
  return {
    eq: new Map(),
    compressor: new Map(),
    delay: new Map(),
    reverb: new Map(),
  };
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, finite(value, min)));
}

function dbToLinear(db: number): number {
  return 10 ** (clamp(db, MIN_DB, MAX_DB) / 20);
}

function parameter(
  effect: AudioEffect,
  names: readonly string[],
  fallback: number,
): number {
  for (const name of names) {
    const item = effect.parameters.find((candidate) => candidate.name === name);
    if (item !== undefined && Number.isFinite(item.value)) return item.value;
  }
  return fallback;
}

function automatedParameter(
  effect: AudioEffect,
  names: readonly string[],
  timeSeconds: number,
  options: OfflineEffectChainOptions,
  fallback: number,
): number {
  for (const name of names) {
    const curve = options.curveFor?.(String(effect.effectId), name);
    if (curve !== undefined) {
      return automationValueAtSeconds(
        curve,
        timeSeconds,
        options.tempoMilliBpm,
        options.ticksPerQuarter,
      );
    }
  }
  return parameter(effect, names, fallback);
}

function applyEq(
  left: Float32Array,
  right: Float32Array,
  effect: AudioEffect,
  state: OfflineEffectChainState,
  options: OfflineEffectChainOptions,
): void {
  const id = String(effect.effectId);
  const memory = state.eq.get(id) ?? { lowLeft: 0, lowRight: 0 };
  const multiBand = AUDIO_EQ_BANDS.some((band) =>
    effect.parameters.some((parameterValue) =>
      parameterValue.name === band.parameterName
    )
  );
  if (multiBand) {
    const bands = memory.bands?.length === AUDIO_EQ_BANDS.length
      ? memory.bands
      : AUDIO_EQ_BANDS.map(() => ({
        left: { x1: 0, x2: 0, y1: 0, y2: 0 },
        right: { x1: 0, x2: 0, y1: 0, y2: 0 },
      }));
    for (let index = 0; index < left.length; index += 1) {
      const time = options.blockStartSeconds + index / options.sampleRateHz;
      const mix = clamp(
        automatedParameter(effect, ["mix"], time, options, 1),
        0,
        1,
      );
      const dryLeft = left[index]!;
      const dryRight = right[index]!;
      let processedLeft = dryLeft;
      let processedRight = dryRight;
      for (let bandIndex = 0; bandIndex < AUDIO_EQ_BANDS.length; bandIndex++) {
        const band = AUDIO_EQ_BANDS[bandIndex]!;
        const gain = clamp(
          automatedParameter(
            effect,
            [band.parameterName],
            time,
            options,
            0,
          ),
          -18,
          18,
        );
        const q = clamp(
          automatedParameter(effect, ["eqQ", "q"], time, options, 1),
          0.05,
          30,
        );
        const frequency = Math.min(
          Math.max(20, band.frequencyHz),
          Math.max(21, options.sampleRateHz / 2 - 1),
        );
        const omega = 2 * Math.PI * frequency / options.sampleRateHz;
        const sine = Math.sin(omega);
        const cosine = Math.cos(omega);
        const amplitude = 10 ** (gain / 40);
        const alpha = sine / (2 * q);
        const a0 = 1 + alpha / amplitude;
        const coefficients = {
          b0: (1 + alpha * amplitude) / a0,
          b1: (-2 * cosine) / a0,
          b2: (1 - alpha * amplitude) / a0,
          a1: (-2 * cosine) / a0,
          a2: (1 - alpha / amplitude) / a0,
        };
        const stateForBand = bands[bandIndex]!;
        const nextLeft = processBiquadSample(
          processedLeft,
          stateForBand.left,
          coefficients,
        );
        const nextRight = processBiquadSample(
          processedRight,
          stateForBand.right,
          coefficients,
        );
        processedLeft = nextLeft;
        processedRight = nextRight;
      }
      left[index] = dryLeft * (1 - mix) + processedLeft * mix;
      right[index] = dryRight * (1 - mix) + processedRight * mix;
    }
    state.eq.set(id, { ...memory, bands });
    return;
  }
  for (let index = 0; index < left.length; index += 1) {
    const time = options.blockStartSeconds + index / options.sampleRateHz;
    const frequency = clamp(
      automatedParameter(effect, ["frequency", "freq"], time, options, 1_000),
      20,
      20_000,
    );
    const gain = clamp(
      automatedParameter(effect, ["gainDb", "gain"], time, options, 0),
      MIN_DB,
      MAX_DB,
    );
    const mix = clamp(
      automatedParameter(effect, ["mix"], time, options, 1),
      0,
      1,
    );
    const alpha = Math.exp(-2 * Math.PI * frequency / options.sampleRateHz);
    memory.lowLeft = (1 - alpha) * left[index]! + alpha * memory.lowLeft;
    memory.lowRight = (1 - alpha) * right[index]! + alpha * memory.lowRight;
    const linear = dbToLinear(gain);
    left[index] = left[index]! + memory.lowLeft * (linear - 1) * mix;
    right[index] = right[index]! + memory.lowRight * (linear - 1) * mix;
  }
  state.eq.set(id, memory);
}

function processBiquadSample(
  input: number,
  state: OfflineBiquadState,
  coefficients: {
    readonly b0: number;
    readonly b1: number;
    readonly b2: number;
    readonly a1: number;
    readonly a2: number;
  },
): number {
  const output = coefficients.b0 * input + coefficients.b1 * state.x1 +
    coefficients.b2 * state.x2 - coefficients.a1 * state.y1 -
    coefficients.a2 * state.y2;
  state.x2 = state.x1;
  state.x1 = input;
  state.y2 = state.y1;
  state.y1 = output;
  return output;
}

function applyCompressor(
  left: Float32Array,
  right: Float32Array,
  effect: AudioEffect,
  state: OfflineEffectChainState,
  options: OfflineEffectChainOptions,
): void {
  const id = String(effect.effectId);
  const memory = state.compressor.get(id) ?? { envelope: 0 };
  for (let index = 0; index < left.length; index += 1) {
    const time = options.blockStartSeconds + index / options.sampleRateHz;
    const threshold = clamp(
      automatedParameter(
        effect,
        ["thresholdDb", "threshold"],
        time,
        options,
        -18,
      ),
      -100,
      0,
    );
    const ratio = clamp(
      automatedParameter(effect, ["ratio"], time, options, 4),
      1,
      20,
    );
    const attack = clamp(
      automatedParameter(effect, ["attackMs", "attack"], time, options, 10),
      0.1,
      1_000,
    ) / 1_000;
    const release = clamp(
      automatedParameter(effect, ["releaseMs", "release"], time, options, 100),
      1,
      2_000,
    ) / 1_000;
    const makeup = clamp(
      automatedParameter(effect, ["makeupDb", "makeup"], time, options, 0),
      MIN_DB,
      MAX_DB,
    );
    const level = Math.max(Math.abs(left[index]!), Math.abs(right[index]!));
    const coefficient = level > memory.envelope
      ? Math.exp(-1 / Math.max(1, attack * options.sampleRateHz))
      : Math.exp(-1 / Math.max(1, release * options.sampleRateHz));
    memory.envelope = coefficient * memory.envelope + (1 - coefficient) * level;
    const levelDb = 20 * Math.log10(Math.max(1e-7, memory.envelope));
    const over = Math.max(0, levelDb - threshold);
    const reductionDb = over - over / ratio;
    const gain = dbToLinear(makeup - reductionDb);
    left[index] = left[index]! * gain;
    right[index] = right[index]! * gain;
  }
  state.compressor.set(id, memory);
}

function applyReverb(
  left: Float32Array,
  right: Float32Array,
  effect: AudioEffect,
  state: OfflineEffectChainState,
  options: OfflineEffectChainOptions,
): void {
  const id = String(effect.effectId);
  const delayMs = clamp(
    parameter(effect, ["delayMs", "delay"], 120),
    1,
    2_000,
  );
  const delayFrames = Math.max(
    1,
    Math.round(delayMs * options.sampleRateHz / 1_000),
  );
  const previous = state.reverb.get(id);
  const memory = previous !== undefined &&
      previous.sampleRateHz === options.sampleRateHz &&
      previous.delayFrames === delayFrames
    ? previous
    : {
      sampleRateHz: options.sampleRateHz,
      delayFrames,
      index: 0,
      left: new Float32Array(Math.min(delayFrames, options.sampleRateHz * 2)),
      right: new Float32Array(Math.min(delayFrames, options.sampleRateHz * 2)),
    };
  const feedback = clamp(
    parameter(effect, ["decay", "feedback"], 0.35),
    0,
    0.95,
  );
  for (let index = 0; index < left.length; index += 1) {
    const time = options.blockStartSeconds + index / options.sampleRateHz;
    const mix = clamp(
      automatedParameter(effect, ["mix", "wet"], time, options, 0.25),
      0,
      1,
    );
    const slot = memory.index % memory.left.length;
    const delayedLeft = memory.left[slot]!;
    const delayedRight = memory.right[slot]!;
    const inputLeft = left[index]!;
    const inputRight = right[index]!;
    memory.left[slot] = inputLeft + delayedLeft * feedback;
    memory.right[slot] = inputRight + delayedRight * feedback;
    left[index] = inputLeft * (1 - mix) + delayedLeft * mix;
    right[index] = inputRight * (1 - mix) + delayedRight * mix;
    memory.index = (memory.index + 1) % memory.left.length;
  }
  state.reverb.set(id, memory);
}

function applyDelay(
  left: Float32Array,
  right: Float32Array,
  effect: AudioEffect,
  state: OfflineEffectChainState,
  options: OfflineEffectChainOptions,
): void {
  const id = String(effect.effectId);
  const delayMs = clamp(
    automatedParameter(
      effect,
      ["delayMs", "delay"],
      options.blockStartSeconds,
      options,
      250,
    ),
    1,
    2_000,
  );
  const delayFrames = Math.max(
    1,
    Math.round(delayMs * options.sampleRateHz / 1_000),
  );
  const previous = state.delay.get(id);
  const memory = previous !== undefined &&
      previous.sampleRateHz === options.sampleRateHz &&
      previous.delayFrames === delayFrames
    ? previous
    : {
      sampleRateHz: options.sampleRateHz,
      delayFrames,
      index: 0,
      left: new Float32Array(Math.min(delayFrames, options.sampleRateHz * 2)),
      right: new Float32Array(Math.min(delayFrames, options.sampleRateHz * 2)),
    };
  const feedback = clamp(
    automatedParameter(
      effect,
      ["feedback", "decay"],
      options.blockStartSeconds,
      options,
      0.35,
    ),
    0,
    0.95,
  );
  for (let index = 0; index < left.length; index += 1) {
    const time = options.blockStartSeconds + index / options.sampleRateHz;
    const mix = clamp(
      automatedParameter(effect, ["mix", "wet"], time, options, 0.35),
      0,
      1,
    );
    const slot = memory.index % memory.left.length;
    const delayedLeft = memory.left[slot]!;
    const delayedRight = memory.right[slot]!;
    const inputLeft = left[index]!;
    const inputRight = right[index]!;
    memory.left[slot] = inputLeft + delayedLeft * feedback;
    memory.right[slot] = inputRight + delayedRight * feedback;
    left[index] = inputLeft * (1 - mix) + delayedLeft * mix;
    right[index] = inputRight * (1 - mix) + delayedRight * mix;
    memory.index = (memory.index + 1) % memory.left.length;
  }
  state.delay.set(id, memory);
}

/** Apply the enabled Track/Bus/Return insert chain in canonical order. */
export function applyOfflineEffectChain(
  left: Float32Array,
  right: Float32Array,
  options: OfflineEffectChainOptions,
): void {
  if (left.length === 0 || right.length === 0) return;
  for (const effect of options.effects) {
    if (!effect.enabled) continue;
    if (effect.kind === "EQ") {
      applyEq(left, right, effect, options.state, options);
    } else if (effect.kind === "COMPRESSOR") {
      applyCompressor(left, right, effect, options.state, options);
    } else if (effect.kind === "DELAY") {
      applyDelay(left, right, effect, options.state, options);
    } else if (effect.kind === "REVERB") {
      applyReverb(left, right, effect, options.state, options);
    }
  }
}

export function effectParameterValue(
  effect: AudioEffect,
  name: string,
  fallback: number,
): number {
  return parameter(effect, [name], fallback);
}
