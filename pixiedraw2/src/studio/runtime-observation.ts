/**
 * STUDIO-040 runtime observation collector.
 *
 * This is a local, dependency-free observation boundary. It records only
 * bounded counters and performance measurements supplied by the runtime; it
 * never sends telemetry, changes a flag, executes a rollback, or contacts a
 * provider. The resulting observation is still subject to the operational
 * safety and readiness gates.
 */

import type { Sha256 } from "../game/game-300/core.ts";
import {
  evaluateGameRuntimePerformance,
  type GameRuntimePerformanceSample,
  type GameRuntimePerformanceProfile,
} from "../game/game-350/runtime-performance.ts";
import {
  createStudioOperationalObservation,
  type StudioOperationalEnvironment,
  type StudioOperationalObservation,
} from "./operational-safety.ts";

export const STUDIO_RUNTIME_OBSERVATION_COLLECTOR_SCHEMA_VERSION = 1 as const;

export interface StudioRuntimeObservationHost {
  /** A monotonic clock such as performance.now(). */
  readonly now: () => number;
  /** Returns used heap bytes when the host exposes that measurement. */
  readonly memoryBytes?: () => number | undefined;
  /** Returns the count of observed Long Tasks in the capture window. */
  readonly longTaskCount?: () => number | undefined;
}

export interface StudioBrowserRuntimeObservationSource {
  readonly performance?: {
    readonly now?: () => number;
    readonly memory?: {
      readonly usedJSHeapSize?: number;
    };
  };
  readonly getLongTaskCount?: () => number | undefined;
}

export interface StudioRuntimeObservationInput {
  readonly environment: StudioOperationalEnvironment;
  readonly packageHash: Sha256;
  readonly sourceIdentity: string;
  readonly capturedAt: string;
  readonly profile: GameRuntimePerformanceProfile;
  readonly host: StudioRuntimeObservationHost;
  readonly rateLimit: {
    readonly windowMs: number;
    readonly maxOperations: number;
  };
}

export interface StudioRuntimeAssetObservation {
  readonly assetId: string;
  readonly byteLength: number;
  readonly decodedBytes?: number;
}

export interface StudioRuntimeObservationSession {
  readonly markStartupReady: () => void;
  readonly markSceneReady: () => void;
  readonly markFirstFrame: () => void;
  /** Record a frame duration, or omit it to measure from the previous call. */
  readonly recordSteadyFrame: (durationMs?: number) => void;
  /** Repeated observations for one Asset ID replace the previous sample. */
  readonly recordAsset: (asset: StudioRuntimeAssetObservation) => void;
  readonly markAssetsMeasured: () => void;
  readonly recordRuntimeError: (count?: number) => void;
  readonly recordRealtimeFailure: (count?: number) => void;
  readonly recordStorageFailure: (count?: number) => void;
  readonly recordMonitoringAlert: (count?: number) => void;
  readonly recordOperation: (count?: number) => void;
  /** Finish once; repeated calls return the same immutable observation. */
  readonly finish: () => Promise<StudioOperationalObservation>;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function safeNonNegativeInteger(value: unknown): value is number {
  return finiteNonNegative(value) && Number.isSafeInteger(value);
}

function readNow(host: StudioRuntimeObservationHost): number | undefined {
  try {
    const value = host.now();
    return finiteNonNegative(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function readSafeInteger(
  reader: (() => number | undefined) | undefined,
): number | undefined {
  if (reader === undefined) return undefined;
  try {
    const value = reader();
    return safeNonNegativeInteger(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function elapsed(
  start: number | undefined,
  end: number | undefined,
): number | undefined {
  if (start === undefined || end === undefined || end < start) return undefined;
  return end - start;
}

function addCounter(current: number, amount: number | undefined): number {
  if (amount === undefined || !safeNonNegativeInteger(amount)) return current;
  if (amount > Number.MAX_SAFE_INTEGER - current) return Number.MAX_SAFE_INTEGER;
  return current + amount;
}

function readAssets(
  assets: ReadonlyMap<string, StudioRuntimeAssetObservation>,
  measured: boolean,
): Pick<GameRuntimePerformanceSample, "assetBytes" | "decodedBytes"> {
  if (!measured) return {};
  let assetBytes = 0;
  let decodedBytes = 0;
  let allDecoded = true;
  for (const asset of assets.values()) {
    if (!safeNonNegativeInteger(asset.byteLength)) return {};
    if (asset.byteLength > Number.MAX_SAFE_INTEGER - assetBytes) return {};
    assetBytes += asset.byteLength;
    if (asset.decodedBytes === undefined) {
      allDecoded = false;
    } else if (safeNonNegativeInteger(asset.decodedBytes)) {
      if (asset.decodedBytes > Number.MAX_SAFE_INTEGER - decodedBytes) {
        return {};
      }
      decodedBytes += asset.decodedBytes;
    } else {
      allDecoded = false;
    }
  }
  return {
    assetBytes,
    ...(allDecoded ? { decodedBytes } : {}),
  };
}

/** Adapt a browser-like performance object without taking a dependency on Window. */
export function createStudioBrowserRuntimeObservationHost(
  source: StudioBrowserRuntimeObservationSource,
): StudioRuntimeObservationHost {
  const performanceSource = source.performance;
  return {
    now: () => performanceSource?.now?.() ?? Date.now(),
    memoryBytes: () => {
      const value = performanceSource?.memory?.usedJSHeapSize;
      return safeNonNegativeInteger(value) ? value : undefined;
    },
    ...(source.getLongTaskCount === undefined
      ? {}
      : { longTaskCount: source.getLongTaskCount }),
  };
}

/** Start a bounded observation session; no data leaves this process. */
export function beginStudioRuntimeObservation(
  input: StudioRuntimeObservationInput,
): StudioRuntimeObservationSession {
  const startedAt = readNow(input.host);
  let startupReadyAt: number | undefined;
  let sceneReadyAt: number | undefined;
  let firstFrameAt: number | undefined;
  let previousFrameAt: number | undefined;
  const steadyFrameDurations: number[] = [];
  const assets = new Map<string, StudioRuntimeAssetObservation>();
  let assetsMeasured = false;
  let runtimeErrorCount = 0;
  let realtimeFailureCount = 0;
  let storageFailureCount = 0;
  let alertCount = 0;
  let operationCount = 0;
  let finished = false;
  let resultPromise: Promise<StudioOperationalObservation> | undefined;

  const mark = (
    get: () => number | undefined,
    set: (value: number) => void,
  ): void => {
    if (finished || get() !== undefined) return;
    const value = readNow(input.host);
    if (value !== undefined) set(value);
  };

  const recordCounter = (
    target: { value: number },
    count: number | undefined,
  ): void => {
    if (finished) return;
    target.value = addCounter(target.value, count ?? 1);
  };

  const finish = (): Promise<StudioOperationalObservation> => {
    if (resultPromise !== undefined) return resultPromise;
    finished = true;
    const startupMs = elapsed(startedAt, startupReadyAt);
    const sceneLoadMs = elapsed(startupReadyAt, sceneReadyAt);
    const firstFrameMs = elapsed(sceneReadyAt, firstFrameAt);
    const steadyFrameMs = steadyFrameDurations.length === 0
      ? undefined
      : Math.max(...steadyFrameDurations);
    const memoryBytes = readSafeInteger(input.host.memoryBytes);
    const longTaskCount = readSafeInteger(input.host.longTaskCount);
    const sample: GameRuntimePerformanceSample = {
      ...(startupMs === undefined ? {} : { startupMs }),
      ...(sceneLoadMs === undefined ? {} : { sceneLoadMs }),
      ...(firstFrameMs === undefined ? {} : { firstFrameMs }),
      ...(steadyFrameMs === undefined ? {} : { steadyFrameMs }),
      ...(memoryBytes === undefined ? {} : { memoryBytes }),
      ...readAssets(assets, assetsMeasured),
      ...(longTaskCount === undefined ? {} : { longTaskCount }),
    };
    const performance = evaluateGameRuntimePerformance(input.profile, sample);
    resultPromise = createStudioOperationalObservation({
      schemaVersion: 1,
      environment: input.environment,
      packageHash: input.packageHash,
      sourceIdentity: input.sourceIdentity,
      capturedAt: input.capturedAt,
      performance,
      monitoring: {
        errorCount: runtimeErrorCount,
        realtimeFailureCount,
        storageFailureCount,
        alertCount,
      },
      rateLimit: {
        windowMs: input.rateLimit.windowMs,
        maxOperations: input.rateLimit.maxOperations,
        observedOperations: operationCount,
      },
    });
    return resultPromise;
  };

  return {
    markStartupReady: () => mark(() => startupReadyAt, (value) => {
      startupReadyAt = value;
    }),
    markSceneReady: () => mark(() => sceneReadyAt, (value) => {
      sceneReadyAt = value;
    }),
    markFirstFrame: () => mark(() => firstFrameAt, (value) => {
      firstFrameAt = value;
    }),
    recordSteadyFrame: (durationMs?: number) => {
      if (finished) return;
      const now = readNow(input.host);
      const measured = durationMs ?? elapsed(previousFrameAt, now);
      previousFrameAt = now;
      if (measured !== undefined && finiteNonNegative(measured)) {
        steadyFrameDurations.push(measured);
      }
    },
    recordAsset: (asset) => {
      if (finished || typeof asset.assetId !== "string" || asset.assetId.length === 0) return;
      assets.set(asset.assetId, asset);
      assetsMeasured = false;
    },
    markAssetsMeasured: () => {
      if (!finished) assetsMeasured = true;
    },
    recordRuntimeError: (count) => recordCounter({
      get value() {
        return runtimeErrorCount;
      },
      set value(value) {
        runtimeErrorCount = value;
      },
    }, count),
    recordRealtimeFailure: (count) => recordCounter({
      get value() {
        return realtimeFailureCount;
      },
      set value(value) {
        realtimeFailureCount = value;
      },
    }, count),
    recordStorageFailure: (count) => recordCounter({
      get value() {
        return storageFailureCount;
      },
      set value(value) {
        storageFailureCount = value;
      },
    }, count),
    recordMonitoringAlert: (count) => recordCounter({
      get value() {
        return alertCount;
      },
      set value(value) {
        alertCount = value;
      },
    }, count),
    recordOperation: (count) => recordCounter({
      get value() {
        return operationCount;
      },
      set value(value) {
        operationCount = value;
      },
    }, count),
    finish,
  };
}
