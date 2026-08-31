/** Engine-neutral 2D camera math used by iGAME authoring and preview. */

import {
  GAME_CAMERA_2D_SETTINGS_SCHEMA_VERSION,
  isValidGameCamera2DSettings,
  type CameraComponent,
  type GameCamera2DSettings,
} from "../game-300/core.ts";

export interface Camera2DPoint {
  readonly x: number;
  readonly y: number;
}

export interface Camera2DViewport {
  readonly width: number;
  readonly height: number;
}

export const DEFAULT_CAMERA_2D_SETTINGS: GameCamera2DSettings = Object.freeze({
  schemaVersion: GAME_CAMERA_2D_SETTINGS_SCHEMA_VERSION,
  pixelPerfect: true,
  referenceWidth: 160,
  referenceHeight: 96,
  pixelsPerUnit: 16,
  follow: Object.freeze({
    enabled: true,
    targetId: "hero",
    smoothing: 0.12,
    deadZoneX: 1,
    deadZoneY: 0.75,
    lookAheadX: 0.5,
    lookAheadY: 0,
  }),
  shake: Object.freeze({
    onDamage: true,
    strength: 0.5,
    durationMs: 160,
    frequency: 18,
  }),
});

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function bounded(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return finite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function integerBounded(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return Number.isSafeInteger(value) &&
      Number(value) >= minimum && Number(value) <= maximum
    ? Number(value)
    : fallback;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stableId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}

/** Normalize legacy/malformed editor input to a safe portable camera config. */
export function normalizeCamera2DSettings(
  value: unknown,
  fallback: GameCamera2DSettings = DEFAULT_CAMERA_2D_SETTINGS,
): GameCamera2DSettings {
  if (isValidGameCamera2DSettings(value)) {
    return {
      ...value,
      follow: { ...value.follow },
      shake: { ...value.shake },
    };
  }
  const source = record(value);
  const sourceFollow = record(source?.follow);
  const sourceShake = record(source?.shake);
  const fallbackFollow = fallback.follow;
  const fallbackShake = fallback.shake;
  return {
    schemaVersion: GAME_CAMERA_2D_SETTINGS_SCHEMA_VERSION,
    pixelPerfect: typeof source?.pixelPerfect === "boolean"
      ? source.pixelPerfect
      : fallback.pixelPerfect,
    referenceWidth: integerBounded(
      source?.referenceWidth,
      1,
      8192,
      fallback.referenceWidth,
    ),
    referenceHeight: integerBounded(
      source?.referenceHeight,
      1,
      8192,
      fallback.referenceHeight,
    ),
    pixelsPerUnit: integerBounded(
      source?.pixelsPerUnit,
      1,
      1024,
      fallback.pixelsPerUnit,
    ),
    follow: {
      enabled: typeof sourceFollow?.enabled === "boolean"
        ? sourceFollow.enabled
        : fallbackFollow.enabled,
      ...(stableId(sourceFollow?.targetId)
        ? { targetId: sourceFollow.targetId }
        : fallbackFollow.targetId === undefined
        ? {}
        : { targetId: fallbackFollow.targetId }),
      smoothing: bounded(
        sourceFollow?.smoothing,
        0,
        2,
        fallbackFollow.smoothing,
      ),
      deadZoneX: bounded(
        sourceFollow?.deadZoneX,
        0,
        64,
        fallbackFollow.deadZoneX,
      ),
      deadZoneY: bounded(
        sourceFollow?.deadZoneY,
        0,
        64,
        fallbackFollow.deadZoneY,
      ),
      lookAheadX: bounded(
        sourceFollow?.lookAheadX,
        -64,
        64,
        fallbackFollow.lookAheadX,
      ),
      lookAheadY: bounded(
        sourceFollow?.lookAheadY,
        -64,
        64,
        fallbackFollow.lookAheadY,
      ),
    },
    shake: {
      onDamage: typeof sourceShake?.onDamage === "boolean"
        ? sourceShake.onDamage
        : fallbackShake.onDamage,
      strength: bounded(
        sourceShake?.strength,
        0,
        64,
        fallbackShake.strength,
      ),
      durationMs: integerBounded(
        sourceShake?.durationMs,
        0,
        10000,
        fallbackShake.durationMs,
      ),
      frequency: bounded(
        sourceShake?.frequency,
        1,
        120,
        fallbackShake.frequency,
      ),
    },
  };
}

export function camera2DSettingsFor(
  component: Pick<CameraComponent, "camera2D"> | undefined,
): GameCamera2DSettings {
  return normalizeCamera2DSettings(component?.camera2D);
}

/** Move the camera toward a target while respecting a rectangular dead zone. */
export function resolveCameraFollowPosition(
  current: Camera2DPoint,
  target: Camera2DPoint,
  settings: GameCamera2DSettings,
  deltaSeconds: number,
): Camera2DPoint {
  if (!settings.follow.enabled) return { ...current };
  const followedTarget = {
    x: target.x + settings.follow.lookAheadX,
    y: target.y + settings.follow.lookAheadY,
  };
  const desired = {
    x: Math.abs(followedTarget.x - current.x) <= settings.follow.deadZoneX
      ? current.x
      : followedTarget.x -
        Math.sign(followedTarget.x - current.x) * settings.follow.deadZoneX,
    y: Math.abs(followedTarget.y - current.y) <= settings.follow.deadZoneY
      ? current.y
      : followedTarget.y -
        Math.sign(followedTarget.y - current.y) * settings.follow.deadZoneY,
  };
  if (settings.follow.smoothing <= 0 || deltaSeconds <= 0) return desired;
  const alpha = 1 - Math.exp(-deltaSeconds / settings.follow.smoothing);
  return {
    x: current.x + (desired.x - current.x) * alpha,
    y: current.y + (desired.y - current.y) * alpha,
  };
}

export function cameraViewportSize(
  settings: GameCamera2DSettings,
): Camera2DViewport {
  return {
    width: settings.referenceWidth / settings.pixelsPerUnit,
    height: settings.referenceHeight / settings.pixelsPerUnit,
  };
}

export function clampCameraOrigin(
  origin: Camera2DPoint,
  world: Camera2DViewport,
  viewport: Camera2DViewport,
): Camera2DPoint {
  return {
    x: Math.min(Math.max(0, world.width - viewport.width), Math.max(0, origin.x)),
    y: Math.min(Math.max(0, world.height - viewport.height), Math.max(0, origin.y)),
  };
}

export function pixelSnapCameraPosition(
  position: Camera2DPoint,
  settings: GameCamera2DSettings,
): Camera2DPoint {
  if (!settings.pixelPerfect) return { ...position };
  const ppu = settings.pixelsPerUnit;
  return {
    x: Math.round(position.x * ppu) / ppu,
    y: Math.round(position.y * ppu) / ppu,
  };
}

/** Resolve a camera origin in world units for a pixel-perfect viewport. */
export function resolveCameraViewportOrigin(input: {
  readonly targetPosition: Camera2DPoint;
  readonly currentPosition?: Camera2DPoint;
  readonly world: Camera2DViewport;
  readonly settings: GameCamera2DSettings;
  readonly deltaSeconds?: number;
}): Camera2DPoint {
  const viewport = cameraViewportSize(input.settings);
  const current = input.currentPosition ?? {
    x: input.targetPosition.x,
    y: input.targetPosition.y,
  };
  const follow = resolveCameraFollowPosition(
    current,
    input.targetPosition,
    input.settings,
    input.deltaSeconds ?? 0,
  );
  const centered = {
    x: follow.x - viewport.width / 2,
    y: follow.y - viewport.height / 2,
  };
  return pixelSnapCameraPosition(
    clampCameraOrigin(centered, input.world, viewport),
    input.settings,
  );
}

/** Deterministic, bounded camera shake offset for a damage event. */
export function cameraShakeOffset(
  settings: GameCamera2DSettings,
  elapsedMs: number,
  seed = 0,
): Camera2DPoint {
  const duration = settings.shake.durationMs;
  if (!settings.shake.onDamage || duration <= 0 || elapsedMs < 0 || elapsedMs >= duration) {
    return { x: 0, y: 0 };
  }
  const progress = Math.min(1, elapsedMs / duration);
  const envelope = 1 - progress;
  const phase = (elapsedMs / 1000) * settings.shake.frequency * Math.PI * 2;
  const raw = {
    x: Math.sin(phase + seed * 1.7) * settings.shake.strength * envelope,
    y: Math.cos(phase * 0.83 + seed * 2.3) * settings.shake.strength * envelope,
  };
  return settings.pixelPerfect
    ? pixelSnapCameraPosition(raw, settings)
    : raw;
}
