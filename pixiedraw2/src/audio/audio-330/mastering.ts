/**
 * AUDIO-330 Master processing and metering.
 *
 * Master state is canonical; meter samples and analyzer bins are runtime
 * projections only.  The processing is bounded, deterministic, and shared
 * by Offline Render/Freeze.  Browser MixerRuntime uses the same parameters
 * through Web Audio nodes.
 */

import type { AudioEffect, AudioMasterState } from "../audio-200/contracts.ts";
import {
  applyOfflineEffectChain,
  createOfflineEffectChainState,
  type OfflineEffectChainState,
} from "../audio-320/index.ts";
import type { AudioAutomationCurve } from "../audio-300/index.ts";

const MAX_SPECTRUM_BINS = 24;
const MAX_INTEGRATED_FRAMES = 48_000 * 300;

export const DEFAULT_AUDIO_MASTER_STATE: AudioMasterState = {
  gainMilliDb: 0,
  limiterEnabled: false,
  limiterCeilingMilliDb: -1_000,
  bypass: false,
  effectIds: [],
};

export interface AudioMasterProcessOptions {
  readonly master?: AudioMasterState;
  readonly effects?: readonly AudioEffect[];
  readonly effectState?: OfflineEffectChainState;
  readonly sampleRateHz: number;
  readonly blockStartSeconds: number;
  readonly tempoMilliBpm: number;
  readonly ticksPerQuarter: number;
  readonly curveFor?: (
    effectId: string,
    parameterName: string,
  ) => AudioAutomationCurve | undefined;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, finite(value, min)));
}

export function masterGainToLinear(gainMilliDb: number): number {
  return 10 ** (clamp(gainMilliDb, -120_000, 24_000) / 20_000);
}

export function masterCeilingToLinear(ceilingMilliDb: number): number {
  return 10 ** (clamp(ceilingMilliDb, -120_000, 0) / 20_000);
}

/** Apply Master FX, gain, and a bounded peak limiter to a PCM block. */
export function applyOfflineMasterProcessing(
  left: Float32Array,
  right: Float32Array,
  options: AudioMasterProcessOptions,
): void {
  if (left.length === 0 || right.length === 0) return;
  const master = options.master ?? DEFAULT_AUDIO_MASTER_STATE;
  if (master.bypass) return;
  const effects = options.effects ?? [];
  if (effects.length > 0) {
    const effectOptions = {
      effects,
      state: options.effectState ?? createOfflineEffectChainState(),
      sampleRateHz: options.sampleRateHz,
      blockStartSeconds: options.blockStartSeconds,
      tempoMilliBpm: options.tempoMilliBpm,
      ticksPerQuarter: options.ticksPerQuarter,
      ...(options.curveFor === undefined ? {} : { curveFor: options.curveFor }),
    };
    applyOfflineEffectChain(left, right, effectOptions);
  }
  const gain = masterGainToLinear(master.gainMilliDb);
  const ceiling = masterCeilingToLinear(master.limiterCeilingMilliDb);
  for (let index = 0; index < left.length; index += 1) {
    let nextLeft = finite(left[index]!, 0) * gain;
    let nextRight = finite(right[index]!, 0) * gain;
    if (master.limiterEnabled) {
      const peak = Math.max(Math.abs(nextLeft), Math.abs(nextRight));
      if (peak > ceiling && peak > 0) {
        const scale = ceiling / peak;
        nextLeft *= scale;
        nextRight *= scale;
      }
    }
    left[index] = clamp(nextLeft, -1, 1);
    right[index] = clamp(nextRight, -1, 1);
  }
}

export interface AudioMasterMeterSnapshot {
  readonly active: boolean;
  readonly peakLinear: number;
  readonly rmsLinear: number;
  readonly lufsMomentary: number;
  readonly lufsShortTerm: number;
  readonly lufsIntegrated: number;
  readonly truePeakLinear: number;
  readonly spectrum: readonly number[];
  readonly sampleFrames: number;
}

function loudnessDb(rms: number): number {
  const bounded = Math.max(1e-9, finite(rms, 0));
  // Approximation of LUFS without a browser-specific K-weighting graph.
  return -0.691 + 20 * Math.log10(bounded);
}

function truePeak(left: Float32Array, right: Float32Array): number {
  let peak = 0;
  let previousLeft = 0;
  let previousRight = 0;
  for (let index = 0; index < left.length; index += 1) {
    const currentLeft = finite(left[index]!, 0);
    const currentRight = finite(right[index]!, 0);
    peak = Math.max(peak, Math.abs(currentLeft), Math.abs(currentRight));
    peak = Math.max(
      peak,
      Math.abs((previousLeft + currentLeft) * 0.5),
      Math.abs((previousRight + currentRight) * 0.5),
    );
    previousLeft = currentLeft;
    previousRight = currentRight;
  }
  return peak;
}

/** Low-frequency, bounded meter/analyzer projection. Idle cost is zero. */
export class MasterMeterRuntime {
  private active = false;
  private peakLinear = 0;
  private rmsLinear = 0;
  private lufsMomentary = -Infinity;
  private lufsShortTerm = -Infinity;
  private lufsIntegrated = -Infinity;
  private truePeakLinear = 0;
  private sampleFrames = 0;
  private integratedEnergy = 0;
  private integratedFrames = 0;
  private spectrum = new Float32Array(MAX_SPECTRUM_BINS);

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.reset();
  }

  isActive(): boolean {
    return this.active;
  }

  reset(): void {
    this.peakLinear = 0;
    this.rmsLinear = 0;
    this.lufsMomentary = -Infinity;
    this.lufsShortTerm = -Infinity;
    this.lufsIntegrated = -Infinity;
    this.truePeakLinear = 0;
    this.sampleFrames = 0;
    this.integratedEnergy = 0;
    this.integratedFrames = 0;
    this.spectrum.fill(0);
  }

  process(
    left: Float32Array,
    right: Float32Array,
    sampleRateHz: number,
  ): AudioMasterMeterSnapshot {
    if (!this.active || left.length === 0 || right.length === 0) {
      return this.snapshot();
    }
    let energy = 0;
    let peak = 0;
    for (let index = 0; index < left.length; index += 1) {
      const l = finite(left[index]!, 0);
      const r = finite(right[index]!, 0);
      energy += (l * l + r * r) * 0.5;
      peak = Math.max(peak, Math.abs(l), Math.abs(r));
    }
    const frames = left.length;
    const rms = Math.sqrt(Math.max(0, energy / frames));
    this.peakLinear = peak;
    this.rmsLinear = rms;
    this.lufsMomentary = loudnessDb(rms);
    this.lufsShortTerm = loudnessDb(
      Math.sqrt(Math.max(0, (this.rmsLinear ** 2 + rms ** 2) / 2)),
    );
    if (this.integratedFrames + frames > MAX_INTEGRATED_FRAMES) {
      const retainedFrames = Math.max(0, MAX_INTEGRATED_FRAMES - frames);
      const retainedRatio = retainedFrames / MAX_INTEGRATED_FRAMES;
      this.integratedEnergy = this.integratedEnergy * retainedRatio + energy;
      this.integratedFrames = MAX_INTEGRATED_FRAMES;
    } else {
      this.integratedEnergy = Math.min(
        Number.MAX_SAFE_INTEGER,
        this.integratedEnergy + energy,
      );
      this.integratedFrames += frames;
    }
    this.lufsIntegrated = loudnessDb(
      Math.sqrt(this.integratedEnergy / Math.max(1, this.integratedFrames)),
    );
    this.truePeakLinear = Math.max(this.truePeakLinear, truePeak(left, right));
    this.sampleFrames += frames;
    const bins = Math.min(
      MAX_SPECTRUM_BINS,
      Math.max(1, Math.floor(sampleRateHz / 2)),
    );
    const analysisFrames = Math.min(frames, 256);
    const start = Math.max(0, frames - analysisFrames);
    for (let bin = 0; bin < bins; bin += 1) {
      const frequency = (bin + 1) * (sampleRateHz / 2) / bins;
      let real = 0;
      let imaginary = 0;
      for (let index = 0; index < analysisFrames; index += 1) {
        const value = (finite(left[start + index]!, 0) +
          finite(right[start + index]!, 0)) * 0.5;
        const phase = 2 * Math.PI * frequency * index / sampleRateHz;
        real += value * Math.cos(phase);
        imaginary -= value * Math.sin(phase);
      }
      this.spectrum[bin] = Math.sqrt(
        real * real + imaginary * imaginary,
      ) / Math.max(1, analysisFrames);
    }
    return this.snapshot();
  }

  snapshot(): AudioMasterMeterSnapshot {
    return {
      active: this.active,
      peakLinear: finite(this.peakLinear, 0),
      rmsLinear: finite(this.rmsLinear, 0),
      lufsMomentary: this.lufsMomentary,
      lufsShortTerm: this.lufsShortTerm,
      lufsIntegrated: this.lufsIntegrated,
      truePeakLinear: finite(this.truePeakLinear, 0),
      spectrum: [...this.spectrum],
      sampleFrames: this.sampleFrames,
    };
  }
}

export function createMasterMeterRuntime(): MasterMeterRuntime {
  return new MasterMeterRuntime();
}
