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

// src/audio/audio-200/timebase.ts
function audioTicksPerSecond(clock) {
  return clock.tempoMilliBpm * clock.ticksPerQuarter / 6e4;
}

// src/audio/audio-300/automation.ts
function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function automationClock(tempoMilliBpm, ticksPerQuarter) {
  return {
    framesPerSecond: 1,
    tempoMilliBpm: Math.max(2e4, finite(tempoMilliBpm, 12e4)),
    ticksPerQuarter: Math.max(24, finite(ticksPerQuarter, 480))
  };
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
  return automationValueAtTick(curve, Math.max(0, seconds) * audioTicksPerSecond(automationClock(tempoMilliBpm, ticksPerQuarter)));
}

// src/audio/audio-320/effects.ts
var MIN_DB = -120;
var MAX_DB = 24;
var AUDIO_EQ_BANDS = Object.freeze([
  {
    parameterName: "band60",
    frequencyHz: 60,
    label: "60"
  },
  {
    parameterName: "band120",
    frequencyHz: 120,
    label: "120"
  },
  {
    parameterName: "band250",
    frequencyHz: 250,
    label: "250"
  },
  {
    parameterName: "band500",
    frequencyHz: 500,
    label: "500"
  },
  {
    parameterName: "band1000",
    frequencyHz: 1e3,
    label: "1k"
  },
  {
    parameterName: "band2000",
    frequencyHz: 2e3,
    label: "2k"
  },
  {
    parameterName: "band4000",
    frequencyHz: 4e3,
    label: "4k"
  },
  {
    parameterName: "band8000",
    frequencyHz: 8e3,
    label: "8k"
  }
]);
function createOfflineEffectChainState() {
  return {
    eq: /* @__PURE__ */ new Map(),
    compressor: /* @__PURE__ */ new Map(),
    delay: /* @__PURE__ */ new Map(),
    reverb: /* @__PURE__ */ new Map()
  };
}
function finite2(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
function clamp2(value, min, max) {
  return Math.min(max, Math.max(min, finite2(value, min)));
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
  const multiBand = AUDIO_EQ_BANDS.some((band) => effect.parameters.some((parameterValue) => parameterValue.name === band.parameterName));
  if (multiBand) {
    const bands = memory.bands?.length === AUDIO_EQ_BANDS.length ? memory.bands : AUDIO_EQ_BANDS.map(() => ({
      left: {
        x1: 0,
        x2: 0,
        y1: 0,
        y2: 0
      },
      right: {
        x1: 0,
        x2: 0,
        y1: 0,
        y2: 0
      }
    }));
    for (let index = 0; index < left.length; index += 1) {
      const time = options.blockStartSeconds + index / options.sampleRateHz;
      const mix = clamp2(automatedParameter(effect, [
        "mix"
      ], time, options, 1), 0, 1);
      const dryLeft = left[index];
      const dryRight = right[index];
      let processedLeft = dryLeft;
      let processedRight = dryRight;
      for (let bandIndex = 0; bandIndex < AUDIO_EQ_BANDS.length; bandIndex++) {
        const band = AUDIO_EQ_BANDS[bandIndex];
        const gain = clamp2(automatedParameter(effect, [
          band.parameterName
        ], time, options, 0), -18, 18);
        const q = clamp2(automatedParameter(effect, [
          "eqQ",
          "q"
        ], time, options, 1), 0.05, 30);
        const frequency = Math.min(Math.max(20, band.frequencyHz), Math.max(21, options.sampleRateHz / 2 - 1));
        const omega = 2 * Math.PI * frequency / options.sampleRateHz;
        const sine = Math.sin(omega);
        const cosine = Math.cos(omega);
        const amplitude = 10 ** (gain / 40);
        const alpha = sine / (2 * q);
        const a0 = 1 + alpha / amplitude;
        const coefficients = {
          b0: (1 + alpha * amplitude) / a0,
          b1: -2 * cosine / a0,
          b2: (1 - alpha * amplitude) / a0,
          a1: -2 * cosine / a0,
          a2: (1 - alpha / amplitude) / a0
        };
        const stateForBand = bands[bandIndex];
        const nextLeft = processBiquadSample(processedLeft, stateForBand.left, coefficients);
        const nextRight = processBiquadSample(processedRight, stateForBand.right, coefficients);
        processedLeft = nextLeft;
        processedRight = nextRight;
      }
      left[index] = dryLeft * (1 - mix) + processedLeft * mix;
      right[index] = dryRight * (1 - mix) + processedRight * mix;
    }
    state.eq.set(id, {
      ...memory,
      bands
    });
    return;
  }
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
function processBiquadSample(input, state, coefficients) {
  const output = coefficients.b0 * input + coefficients.b1 * state.x1 + coefficients.b2 * state.x2 - coefficients.a1 * state.y1 - coefficients.a2 * state.y2;
  state.x2 = state.x1;
  state.x1 = input;
  state.y2 = state.y1;
  state.y1 = output;
  return output;
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
function applyDelay(left, right, effect, state, options) {
  const id = String(effect.effectId);
  const delayMs = clamp2(automatedParameter(effect, [
    "delayMs",
    "delay"
  ], options.blockStartSeconds, options, 250), 1, 2e3);
  const delayFrames = Math.max(1, Math.round(delayMs * options.sampleRateHz / 1e3));
  const previous = state.delay.get(id);
  const memory = previous !== void 0 && previous.sampleRateHz === options.sampleRateHz && previous.delayFrames === delayFrames ? previous : {
    sampleRateHz: options.sampleRateHz,
    delayFrames,
    index: 0,
    left: new Float32Array(Math.min(delayFrames, options.sampleRateHz * 2)),
    right: new Float32Array(Math.min(delayFrames, options.sampleRateHz * 2))
  };
  const feedback = clamp2(automatedParameter(effect, [
    "feedback",
    "decay"
  ], options.blockStartSeconds, options, 0.35), 0, 0.95);
  for (let index = 0; index < left.length; index += 1) {
    const time = options.blockStartSeconds + index / options.sampleRateHz;
    const mix = clamp2(automatedParameter(effect, [
      "mix",
      "wet"
    ], time, options, 0.35), 0, 1);
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
  state.delay.set(id, memory);
}
function applyOfflineEffectChain(left, right, options) {
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
function effectParameterValue(effect, name, fallback) {
  return parameter(effect, [
    name
  ], fallback);
}
export {
  AUDIO_EQ_BANDS,
  applyOfflineEffectChain,
  createOfflineEffectChainState,
  effectParameterValue
};
