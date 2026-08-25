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

// src/audio/audio-200/contracts.ts
function audioOk(value, diagnostics = []) {
  return {
    ok: true,
    value,
    diagnostics
  };
}
function audioFail(code, message, path, recoverable = false) {
  const diagnostic = {
    code,
    message,
    ...path === void 0 ? {} : {
      path
    },
    recoverable
  };
  return {
    ok: false,
    diagnostics: [
      diagnostic
    ]
  };
}

// src/audio/audio-200/timebase.ts
function audioTicksPerSecond(clock) {
  return clock.tempoMilliBpm * clock.ticksPerQuarter / 6e4;
}
function audioTickToSeconds(tick, clock) {
  const ticks = Number.isFinite(tick) ? Math.max(0, tick) : 0;
  return ticks / audioTicksPerSecond(clock);
}

// src/audio/audio-300/automation.ts
var MAX_AUTOMATION_POINTS = 65536;
var MIN_CUTOFF_HZ = 20;
var MAX_CUTOFF_HZ = 2e4;
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
function valueKindForTarget(kind) {
  if (kind === "TRACK_GAIN" || kind === "MIXER_CHANNEL_GAIN" || kind === "CLIP_GAIN") return "GAIN_DB";
  if (kind === "TRACK_PAN" || kind === "MIXER_CHANNEL_PAN") return "PAN";
  if (kind === "FILTER_CUTOFF") return "FILTER_CUTOFF_HZ";
  return "NORMALIZED";
}
function normalizeValue(value, kind) {
  if (kind === "GAIN_DB") return clamp(finite(value, 0), -120, 24);
  if (kind === "PAN") return clamp(finite(value, 0), -1, 1);
  if (kind === "FILTER_CUTOFF_HZ") {
    return clamp(finite(value, 1e3), MIN_CUTOFF_HZ, MAX_CUTOFF_HZ);
  }
  return clamp(finite(value, 0), -1e6, 1e6);
}
function comparePoints(left, right) {
  return left.tick - right.tick;
}
function compileAudioAutomation(automation) {
  if (typeof automation.automationId !== "string" || automation.automationId.trim().length === 0 || automation.points.length === 0 || automation.points.length > MAX_AUTOMATION_POINTS) {
    return audioFail("AUDIO_INVALID_AUTOMATION", "Automation must contain a bounded non-empty point list.", "automation.points");
  }
  const valueKind = valueKindForTarget(automation.target.kind);
  const points = automation.points.filter((point) => Number.isSafeInteger(point.tick) && point.tick >= 0).map((point) => ({
    ...point,
    value: normalizeValue(point.value, valueKind)
  })).sort(comparePoints);
  if (points.length === 0) {
    return audioFail("AUDIO_INVALID_AUTOMATION", "Automation point ticks are invalid.", "automation.points");
  }
  const deduped = [];
  for (const point of points) {
    const previous = deduped.at(-1);
    if (previous?.tick === point.tick) deduped[deduped.length - 1] = point;
    else deduped.push(point);
  }
  return audioOk({
    automationId: String(automation.automationId),
    target: automation.target,
    valueKind,
    points: deduped
  });
}
function ticksToAutomationSeconds(tick, tempoMilliBpm, ticksPerQuarter) {
  return audioTickToSeconds(tick, automationClock(tempoMilliBpm, ticksPerQuarter));
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
function automationValueToParam(value, kind) {
  if (kind === "GAIN_DB") return 10 ** (clamp(value, -120, 24) / 20);
  if (kind === "FILTER_CUTOFF_HZ") {
    return clamp(value, MIN_CUTOFF_HZ, MAX_CUTOFF_HZ);
  }
  return kind === "PAN" ? clamp(value, -1, 1) : value;
}
function scheduleAudioAutomation(param, curve, options, generation = 0) {
  const fromTick = Math.max(0, options.fromTick ?? 0);
  const untilTick = options.untilTick ?? Number.MAX_SAFE_INTEGER;
  const startAt = Math.max(finite(options.nowSeconds, 0), finite(options.startAtSeconds ?? options.nowSeconds, options.nowSeconds));
  const transform = options.valueTransform ?? ((value) => automationValueToParam(value, curve.valueKind));
  const firstValue = transform(automationValueAtTick(curve, fromTick));
  param.cancelScheduledValues(startAt);
  param.setValueAtTime(firstValue, startAt);
  let scheduledPoints = 0;
  let lastValue = firstValue;
  for (const point of curve.points) {
    if (point.tick <= fromTick || point.tick > untilTick) continue;
    const pointTime = Math.max(startAt, startAt + ticksToAutomationSeconds(point.tick - fromTick, options.tempoMilliBpm, options.ticksPerQuarter));
    lastValue = transform(point.value);
    param.linearRampToValueAtTime(lastValue, pointTime);
    scheduledPoints += 1;
  }
  return {
    generation,
    scheduledPoints,
    firstValue,
    lastValue
  };
}
function compileProjectAutomations(project) {
  const curves = /* @__PURE__ */ new Map();
  for (const automation of project.automations) {
    const compiled = compileAudioAutomation(automation);
    if (!compiled.ok) continue;
    curves.set(automationKey(automation.target.kind, automation.target.targetId, automation.target.parameterName), compiled.value);
  }
  return curves;
}
function automationKey(kind, targetId, parameterName) {
  return `${kind}:${targetId}:$${parameterName ?? ""}`;
}
function automationCurveForTarget(curves, kind, targetId, parameterName) {
  return curves.get(automationKey(kind, targetId, parameterName));
}
export {
  automationCurveForTarget,
  automationKey,
  automationValueAtSeconds,
  automationValueAtTick,
  automationValueToParam,
  compileAudioAutomation,
  compileProjectAutomations,
  scheduleAudioAutomation,
  ticksToAutomationSeconds
};
