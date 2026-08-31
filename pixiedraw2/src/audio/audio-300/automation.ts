/**
 * AUDIO-300 Automation Runtime.
 *
 * Automation remains canonical metadata in AUDIO-200.  This module only
 * compiles immutable curves into bounded lookup/scheduling operations; it
 * never mutates Project state and never stores Web Audio nodes.
 */

import {
  type Audio200Result,
  type AudioAutomation,
  type AudioAutomationTargetKind,
  audioFail,
  audioOk,
  type AudioProject,
} from "../audio-200/contracts.ts";
import {
  type AudioClockSpec,
  audioTicksPerSecond,
  audioTickToSeconds,
} from "../audio-200/timebase.ts";
import type { AudioTick } from "../audio-200/contracts.ts";

export type AudioAutomationValueKind =
  | "GAIN_DB"
  | "PAN"
  | "FILTER_CUTOFF_HZ"
  | "NORMALIZED";

export interface AudioAutomationCurve {
  readonly automationId: string;
  readonly target: AudioAutomation["target"];
  readonly valueKind: AudioAutomationValueKind;
  readonly points: readonly AudioAutomation["points"][number][];
}

export interface AutomationAudioParam {
  value: number;
  cancelScheduledValues(time: number): void;
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
}

export interface AudioAutomationScheduleOptions {
  readonly nowSeconds: number;
  readonly tempoMilliBpm: number;
  readonly ticksPerQuarter: number;
  readonly fromTick?: number;
  readonly untilTick?: number;
  readonly startAtSeconds?: number;
  readonly valueTransform?: (value: number) => number;
}

export interface AudioAutomationScheduleResult {
  readonly generation: number;
  readonly scheduledPoints: number;
  readonly firstValue: number;
  readonly lastValue: number;
}

/** Tick-native point editing helpers used by the automation lane UI. */
export function upsertAudioAutomationPoint(
  automation: AudioAutomation,
  tick: number,
  value: number,
): AudioAutomation {
  const safeTick = Math.max(
    0,
    Math.round(Number.isFinite(tick) ? tick : 0),
  ) as AudioTick;
  const nextPoint = { tick: safeTick, value };
  const points = automation.points.filter((point) => point.tick !== safeTick);
  points.push(nextPoint);
  points.sort((left, right) => left.tick - right.tick);
  return { ...automation, points };
}

export function removeAudioAutomationPoint(
  automation: AudioAutomation,
  tick: number,
): AudioAutomation {
  const safeTick = Math.max(0, Math.round(Number.isFinite(tick) ? tick : 0));
  return {
    ...automation,
    points: automation.points.filter((point) => point.tick !== safeTick),
  };
}

const MAX_AUTOMATION_POINTS = 65_536;
const MIN_CUTOFF_HZ = 20;
const MAX_CUTOFF_HZ = 20_000;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function automationClock(
  tempoMilliBpm: number,
  ticksPerQuarter: number,
): AudioClockSpec {
  return {
    framesPerSecond: 1,
    tempoMilliBpm: Math.max(20_000, finite(tempoMilliBpm, 120_000)),
    ticksPerQuarter: Math.max(24, finite(ticksPerQuarter, 480)),
  };
}

function valueKindForTarget(
  kind: AudioAutomationTargetKind,
): AudioAutomationValueKind {
  if (
    kind === "TRACK_GAIN" || kind === "MIXER_CHANNEL_GAIN" ||
    kind === "CLIP_GAIN"
  ) return "GAIN_DB";
  if (kind === "TRACK_PAN" || kind === "MIXER_CHANNEL_PAN") return "PAN";
  if (kind === "FILTER_CUTOFF") return "FILTER_CUTOFF_HZ";
  return "NORMALIZED";
}

function normalizeValue(
  value: number,
  kind: AudioAutomationValueKind,
): number {
  if (kind === "GAIN_DB") return clamp(finite(value, 0), -120, 24);
  if (kind === "PAN") return clamp(finite(value, 0), -1, 1);
  if (kind === "FILTER_CUTOFF_HZ") {
    return clamp(finite(value, 1_000), MIN_CUTOFF_HZ, MAX_CUTOFF_HZ);
  }
  return clamp(finite(value, 0), -1_000_000, 1_000_000);
}

function comparePoints(
  left: AudioAutomation["points"][number],
  right: AudioAutomation["points"][number],
): number {
  return left.tick - right.tick;
}

/** Compile and normalize one canonical curve without changing the source. */
export function compileAudioAutomation(
  automation: AudioAutomation,
): Audio200Result<AudioAutomationCurve> {
  if (
    typeof automation.automationId !== "string" ||
    automation.automationId.trim().length === 0 ||
    automation.points.length === 0 ||
    automation.points.length > MAX_AUTOMATION_POINTS
  ) {
    return audioFail(
      "AUDIO_INVALID_AUTOMATION",
      "Automation must contain a bounded non-empty point list.",
      "automation.points",
    );
  }
  const valueKind = valueKindForTarget(automation.target.kind);
  const points = automation.points
    .filter((point) => Number.isSafeInteger(point.tick) && point.tick >= 0)
    .map((point) => ({
      ...point,
      value: normalizeValue(point.value, valueKind),
    }))
    .sort(comparePoints);
  if (points.length === 0) {
    return audioFail(
      "AUDIO_INVALID_AUTOMATION",
      "Automation point ticks are invalid.",
      "automation.points",
    );
  }
  // Keep the last point at a duplicate tick. This makes seek/replay
  // deterministic while avoiding zero-length AudioParam ramps.
  const deduped: typeof points = [];
  for (const point of points) {
    const previous = deduped.at(-1);
    if (previous?.tick === point.tick) deduped[deduped.length - 1] = point;
    else deduped.push(point);
  }
  return audioOk({
    automationId: String(automation.automationId),
    target: automation.target,
    valueKind,
    points: deduped,
  });
}

export function ticksToAutomationSeconds(
  tick: number,
  tempoMilliBpm: number,
  ticksPerQuarter: number,
): number {
  return audioTickToSeconds(
    tick,
    automationClock(tempoMilliBpm, ticksPerQuarter),
  );
}

export function automationValueAtTick(
  curve: AudioAutomationCurve,
  tick: number,
): number {
  const points = curve.points;
  if (points.length === 1 || tick <= points[0]!.tick) {
    return points[0]!.value;
  }
  const last = points[points.length - 1]!;
  if (tick >= last.tick) return last.value;
  let low = 0;
  let high = points.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle]!.tick <= tick) low = middle;
    else high = middle;
  }
  const left = points[low]!;
  const right = points[high]!;
  const span = Math.max(1, right.tick - left.tick);
  const ratio = clamp((tick - left.tick) / span, 0, 1);
  return left.value + (right.value - left.value) * ratio;
}

export function automationValueAtSeconds(
  curve: AudioAutomationCurve,
  seconds: number,
  tempoMilliBpm: number,
  ticksPerQuarter: number,
): number {
  return automationValueAtTick(
    curve,
    Math.max(0, seconds) * audioTicksPerSecond(
      automationClock(tempoMilliBpm, ticksPerQuarter),
    ),
  );
}

export function automationValueToParam(
  value: number,
  kind: AudioAutomationValueKind,
): number {
  if (kind === "GAIN_DB") return 10 ** (clamp(value, -120, 24) / 20);
  if (kind === "FILTER_CUTOFF_HZ") {
    return clamp(value, MIN_CUTOFF_HZ, MAX_CUTOFF_HZ);
  }
  return kind === "PAN" ? clamp(value, -1, 1) : value;
}

/**
 * Schedule an entire curve directly on AudioParam.  Seek/loop callers invoke
 * this again after cancelling from the current clock; no per-frame JS pump is
 * required while the curve is playing.
 */
export function scheduleAudioAutomation(
  param: AutomationAudioParam,
  curve: AudioAutomationCurve,
  options: AudioAutomationScheduleOptions,
  generation = 0,
): AudioAutomationScheduleResult {
  const fromTick = Math.max(0, options.fromTick ?? 0);
  const untilTick = options.untilTick ?? Number.MAX_SAFE_INTEGER;
  const startAt = Math.max(
    finite(options.nowSeconds, 0),
    finite(options.startAtSeconds ?? options.nowSeconds, options.nowSeconds),
  );
  const transform = options.valueTransform ??
    ((value: number) => automationValueToParam(value, curve.valueKind));
  const firstValue = transform(
    automationValueAtTick(curve, fromTick),
  );
  param.cancelScheduledValues(startAt);
  param.setValueAtTime(firstValue, startAt);
  let scheduledPoints = 0;
  let lastValue = firstValue;
  for (const point of curve.points) {
    if (point.tick <= fromTick || point.tick > untilTick) continue;
    const pointTime = Math.max(
      startAt,
      startAt + ticksToAutomationSeconds(
        point.tick - fromTick,
        options.tempoMilliBpm,
        options.ticksPerQuarter,
      ),
    );
    lastValue = transform(point.value);
    param.linearRampToValueAtTime(lastValue, pointTime);
    scheduledPoints += 1;
  }
  return { generation, scheduledPoints, firstValue, lastValue };
}

export function compileProjectAutomations(
  project: AudioProject,
): ReadonlyMap<string, AudioAutomationCurve> {
  const curves = new Map<string, AudioAutomationCurve>();
  for (const automation of project.automations) {
    const compiled = compileAudioAutomation(automation);
    if (!compiled.ok) continue;
    curves.set(
      automationKey(
        automation.target.kind,
        automation.target.targetId,
        automation.target.parameterName,
      ),
      compiled.value,
    );
  }
  return curves;
}

export function automationKey(
  kind: AudioAutomationTargetKind,
  targetId: string,
  parameterName?: string,
): string {
  return `${kind}:${targetId}:$${parameterName ?? ""}`;
}

export function automationCurveForTarget(
  curves: ReadonlyMap<string, AudioAutomationCurve>,
  kind: AudioAutomationTargetKind,
  targetId: string,
  parameterName?: string,
): AudioAutomationCurve | undefined {
  return curves.get(automationKey(kind, targetId, parameterName));
}
