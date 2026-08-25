// src/wp160-contracts.ts
var AUTHORIZATION_PROOF_ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1e3;
var AUTHORIZATION_PROOF_MAX_LIFETIME_MS = 24 * 60 * 60 * 1e3;
var DEFAULT_WP160_FEATURE_FLAGS = Object.freeze({
  "game-core-read": false,
  "game-core-write": false,
  "runtime-preview": false,
  "runtime-execution": false,
  "game-build": false,
  "game-build-cache": false,
  "game-publish": false
});

// src/audio/audio-300/automation.ts
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function automationValueAtTick(curve, tick) {
  const points = curve.points;
  if (points.length === 1 || tick <= points[0].tick) {
    return points[0].value;
  }
  const last = points[points.length - 1];
  if (tick >= last.tick) return last.value;
  let low = 0;
  let high = points.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].tick <= tick) low = middle;
    else high = middle;
  }
  const left = points[low];
  const right = points[high];
  const span = Math.max(1, right.tick - left.tick);
  const ratio = clamp((tick - left.tick) / span, 0, 1);
  return left.value + (right.value - left.value) * ratio;
}
function automationValueAtSeconds(curve, seconds, tempoMilliBpm, ticksPerQuarter) {
  const ticksPerSecond = Math.max(1, tempoMilliBpm / 1e3 * ticksPerQuarter / 60);
  return automationValueAtTick(curve, Math.max(0, seconds) * ticksPerSecond);
}

// src/audio/audio-320/effects.ts
var MIN_DB = -120;
var MAX_DB = 24;
function createOfflineEffectChainState() {
  return {
    eq: /* @__PURE__ */ new Map(),
    compressor: /* @__PURE__ */ new Map(),
    reverb: /* @__PURE__ */ new Map()
  };
}
function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
function clamp2(value, min, max) {
  return Math.min(max, Math.max(min, finite(value, min)));
}
function dbToLinear(db) {
  return 10 ** (clamp2(db, MIN_DB, MAX_DB) / 20);
}
function parameter(effect, names, fallback) {
  for (const name of names) {
    const item = effect.parameters.find((candidate) => candidate.name === name);
    if (item !== void 0 && Number.isFinite(item.value)) return item.value;
  }
  return fallback;
}
function automatedParameter(effect, names, timeSeconds, options, fallback) {
  for (const name of names) {
    const curve = options.curveFor?.(String(effect.effectId), name);
    if (curve !== void 0) {
      return automationValueAtSeconds(curve, timeSeconds, options.tempoMilliBpm, options.ticksPerQuarter);
    }
  }
  return parameter(effect, names, fallback);
}
function applyEq(left, right, effect, state, options) {
  const id = String(effect.effectId);
  const memory = state.eq.get(id) ?? {
    lowLeft: 0,
    lowRight: 0
  };
  for (let index = 0; index < left.length; index += 1) {
    const time = options.blockStartSeconds + index / options.sampleRateHz;
    const frequency = clamp2(automatedParameter(effect, [
      "frequency",
      "freq"
    ], time, options, 1e3), 20, 2e4);
    const gain = clamp2(automatedParameter(effect, [
      "gainDb",
      "gain"
    ], time, options, 0), MIN_DB, MAX_DB);
    const mix = clamp2(automatedParameter(effect, [
      "mix"
    ], time, options, 1), 0, 1);
    const alpha = Math.exp(-2 * Math.PI * frequency / options.sampleRateHz);
    memory.lowLeft = (1 - alpha) * left[index] + alpha * memory.lowLeft;
    memory.lowRight = (1 - alpha) * right[index] + alpha * memory.lowRight;
    const linear = dbToLinear(gain);
    left[index] = left[index] + memory.lowLeft * (linear - 1) * mix;
    right[index] = right[index] + memory.lowRight * (linear - 1) * mix;
  }
  state.eq.set(id, memory);
}
function applyCompressor(left, right, effect, state, options) {
  const id = String(effect.effectId);
  const memory = state.compressor.get(id) ?? {
    envelope: 0
  };
  for (let index = 0; index < left.length; index += 1) {
    const time = options.blockStartSeconds + index / options.sampleRateHz;
    const threshold = clamp2(automatedParameter(effect, [
      "thresholdDb",
      "threshold"
    ], time, options, -18), -100, 0);
    const ratio = clamp2(automatedParameter(effect, [
      "ratio"
    ], time, options, 4), 1, 20);
    const attack = clamp2(automatedParameter(effect, [
      "attackMs",
      "attack"
    ], time, options, 10), 0.1, 1e3) / 1e3;
    const release = clamp2(automatedParameter(effect, [
      "releaseMs",
      "release"
    ], time, options, 100), 1, 2e3) / 1e3;
    const makeup = clamp2(automatedParameter(effect, [
      "makeupDb",
      "makeup"
    ], time, options, 0), MIN_DB, MAX_DB);
    const level = Math.max(Math.abs(left[index]), Math.abs(right[index]));
    const coefficient = level > memory.envelope ? Math.exp(-1 / Math.max(1, attack * options.sampleRateHz)) : Math.exp(-1 / Math.max(1, release * options.sampleRateHz));
    memory.envelope = coefficient * memory.envelope + (1 - coefficient) * level;
    const levelDb = 20 * Math.log10(Math.max(1e-7, memory.envelope));
    const over = Math.max(0, levelDb - threshold);
    const reductionDb = over - over / ratio;
    const gain = dbToLinear(makeup - reductionDb);
    left[index] = left[index] * gain;
    right[index] = right[index] * gain;
  }
  state.compressor.set(id, memory);
}
function applyReverb(left, right, effect, state, options) {
  const id = String(effect.effectId);
  const delayMs = clamp2(parameter(effect, [
    "delayMs",
    "delay"
  ], 120), 1, 2e3);
  const delayFrames = Math.max(1, Math.round(delayMs * options.sampleRateHz / 1e3));
  const previous = state.reverb.get(id);
  const memory = previous !== void 0 && previous.sampleRateHz === options.sampleRateHz && previous.delayFrames === delayFrames ? previous : {
    sampleRateHz: options.sampleRateHz,
    delayFrames,
    index: 0,
    left: new Float32Array(Math.min(delayFrames, options.sampleRateHz * 2)),
    right: new Float32Array(Math.min(delayFrames, options.sampleRateHz * 2))
  };
  const feedback = clamp2(parameter(effect, [
    "decay",
    "feedback"
  ], 0.35), 0, 0.95);
  for (let index = 0; index < left.length; index += 1) {
    const time = options.blockStartSeconds + index / options.sampleRateHz;
    const mix = clamp2(automatedParameter(effect, [
      "mix",
      "wet"
    ], time, options, 0.25), 0, 1);
    const slot = memory.index % memory.left.length;
    const delayedLeft = memory.left[slot];
    const delayedRight = memory.right[slot];
    const inputLeft = left[index];
    const inputRight = right[index];
    memory.left[slot] = inputLeft + delayedLeft * feedback;
    memory.right[slot] = inputRight + delayedRight * feedback;
    left[index] = inputLeft * (1 - mix) + delayedLeft * mix;
    right[index] = inputRight * (1 - mix) + delayedRight * mix;
    memory.index = (memory.index + 1) % memory.left.length;
  }
  state.reverb.set(id, memory);
}
function applyOfflineEffectChain(left, right, options) {
  if (left.length === 0 || right.length === 0) return;
  for (const effect of options.effects) {
    if (!effect.enabled) continue;
    if (effect.kind === "EQ") {
      applyEq(left, right, effect, options.state, options);
    } else if (effect.kind === "COMPRESSOR") {
      applyCompressor(left, right, effect, options.state, options);
    } else if (effect.kind === "REVERB") {
      applyReverb(left, right, effect, options.state, options);
    }
  }
}

// src/audio/audio-330/mastering.ts
var MAX_SPECTRUM_BINS = 24;
var MAX_INTEGRATED_FRAMES = 48e3 * 300;
var DEFAULT_AUDIO_MASTER_STATE = {
  gainMilliDb: 0,
  limiterEnabled: false,
  limiterCeilingMilliDb: -1e3,
  bypass: false,
  effectIds: []
};
function finite2(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
function clamp3(value, min, max) {
  return Math.min(max, Math.max(min, finite2(value, min)));
}
function masterGainToLinear(gainMilliDb) {
  return 10 ** (clamp3(gainMilliDb, -12e4, 24e3) / 2e4);
}
function masterCeilingToLinear(ceilingMilliDb) {
  return 10 ** (clamp3(ceilingMilliDb, -12e4, 0) / 2e4);
}
function applyOfflineMasterProcessing(left, right, options) {
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
      ...options.curveFor === void 0 ? {} : {
        curveFor: options.curveFor
      }
    };
    applyOfflineEffectChain(left, right, effectOptions);
  }
  const gain = masterGainToLinear(master.gainMilliDb);
  const ceiling = masterCeilingToLinear(master.limiterCeilingMilliDb);
  for (let index = 0; index < left.length; index += 1) {
    let nextLeft = finite2(left[index], 0) * gain;
    let nextRight = finite2(right[index], 0) * gain;
    if (master.limiterEnabled) {
      const peak = Math.max(Math.abs(nextLeft), Math.abs(nextRight));
      if (peak > ceiling && peak > 0) {
        const scale = ceiling / peak;
        nextLeft *= scale;
        nextRight *= scale;
      }
    }
    left[index] = clamp3(nextLeft, -1, 1);
    right[index] = clamp3(nextRight, -1, 1);
  }
}
function loudnessDb(rms) {
  const bounded = Math.max(1e-9, finite2(rms, 0));
  return -0.691 + 20 * Math.log10(bounded);
}
function truePeak(left, right) {
  let peak = 0;
  let previousLeft = 0;
  let previousRight = 0;
  for (let index = 0; index < left.length; index += 1) {
    const currentLeft = finite2(left[index], 0);
    const currentRight = finite2(right[index], 0);
    peak = Math.max(peak, Math.abs(currentLeft), Math.abs(currentRight));
    peak = Math.max(peak, Math.abs((previousLeft + currentLeft) * 0.5), Math.abs((previousRight + currentRight) * 0.5));
    previousLeft = currentLeft;
    previousRight = currentRight;
  }
  return peak;
}
var MasterMeterRuntime = class {
  active = false;
  peakLinear = 0;
  rmsLinear = 0;
  lufsMomentary = -Infinity;
  lufsShortTerm = -Infinity;
  lufsIntegrated = -Infinity;
  truePeakLinear = 0;
  sampleFrames = 0;
  integratedEnergy = 0;
  integratedFrames = 0;
  spectrum = new Float32Array(MAX_SPECTRUM_BINS);
  setActive(active) {
    this.active = active;
    if (!active) this.reset();
  }
  isActive() {
    return this.active;
  }
  reset() {
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
  process(left, right, sampleRateHz) {
    if (!this.active || left.length === 0 || right.length === 0) {
      return this.snapshot();
    }
    let energy = 0;
    let peak = 0;
    for (let index = 0; index < left.length; index += 1) {
      const l = finite2(left[index], 0);
      const r = finite2(right[index], 0);
      energy += (l * l + r * r) * 0.5;
      peak = Math.max(peak, Math.abs(l), Math.abs(r));
    }
    const frames = left.length;
    const rms = Math.sqrt(Math.max(0, energy / frames));
    this.peakLinear = peak;
    this.rmsLinear = rms;
    this.lufsMomentary = loudnessDb(rms);
    this.lufsShortTerm = loudnessDb(Math.sqrt(Math.max(0, (this.rmsLinear ** 2 + rms ** 2) / 2)));
    if (this.integratedFrames + frames > MAX_INTEGRATED_FRAMES) {
      const retainedFrames = Math.max(0, MAX_INTEGRATED_FRAMES - frames);
      const retainedRatio = retainedFrames / MAX_INTEGRATED_FRAMES;
      this.integratedEnergy = this.integratedEnergy * retainedRatio + energy;
      this.integratedFrames = MAX_INTEGRATED_FRAMES;
    } else {
      this.integratedEnergy = Math.min(Number.MAX_SAFE_INTEGER, this.integratedEnergy + energy);
      this.integratedFrames += frames;
    }
    this.lufsIntegrated = loudnessDb(Math.sqrt(this.integratedEnergy / Math.max(1, this.integratedFrames)));
    this.truePeakLinear = Math.max(this.truePeakLinear, truePeak(left, right));
    this.sampleFrames += frames;
    const bins = Math.min(MAX_SPECTRUM_BINS, Math.max(1, Math.floor(sampleRateHz / 2)));
    const analysisFrames = Math.min(frames, 256);
    const start = Math.max(0, frames - analysisFrames);
    for (let bin = 0; bin < bins; bin += 1) {
      const frequency = (bin + 1) * (sampleRateHz / 2) / bins;
      let real = 0;
      let imaginary = 0;
      for (let index = 0; index < analysisFrames; index += 1) {
        const value = (finite2(left[start + index], 0) + finite2(right[start + index], 0)) * 0.5;
        const phase = 2 * Math.PI * frequency * index / sampleRateHz;
        real += value * Math.cos(phase);
        imaginary -= value * Math.sin(phase);
      }
      this.spectrum[bin] = Math.sqrt(real * real + imaginary * imaginary) / Math.max(1, analysisFrames);
    }
    return this.snapshot();
  }
  snapshot() {
    return {
      active: this.active,
      peakLinear: finite2(this.peakLinear, 0),
      rmsLinear: finite2(this.rmsLinear, 0),
      lufsMomentary: this.lufsMomentary,
      lufsShortTerm: this.lufsShortTerm,
      lufsIntegrated: this.lufsIntegrated,
      truePeakLinear: finite2(this.truePeakLinear, 0),
      spectrum: [
        ...this.spectrum
      ],
      sampleFrames: this.sampleFrames
    };
  }
};
function createMasterMeterRuntime() {
  return new MasterMeterRuntime();
}
export {
  DEFAULT_AUDIO_MASTER_STATE,
  MasterMeterRuntime,
  applyOfflineMasterProcessing,
  createMasterMeterRuntime,
  masterCeilingToLinear,
  masterGainToLinear
};
