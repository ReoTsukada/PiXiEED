import {
  cameraShakeOffset,
  DEFAULT_CAMERA_2D_SETTINGS,
  normalizeCamera2DSettings,
  pixelSnapCameraPosition,
  resolveCameraFollowPosition,
  resolveCameraViewportOrigin,
} from "../../src/game/game-350/camera-2d.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("GAME350-CAMERA-001 normalizes a pixel-perfect follow and shake profile", () => {
  const settings = normalizeCamera2DSettings({
    pixelPerfect: true,
    referenceWidth: 320,
    referenceHeight: 180,
    pixelsPerUnit: 16,
    follow: {
      enabled: true,
      targetId: "hero",
      smoothing: 0.2,
      deadZoneX: 2,
      deadZoneY: 1,
      lookAheadX: 1,
      lookAheadY: 0,
    },
    shake: {
      onDamage: true,
      strength: 2,
      durationMs: 240,
      frequency: 20,
    },
  });
  assert(settings.referenceWidth === 320, "reference width should survive");
  assert(settings.follow.targetId === "hero", "follow target should survive");
  assert(settings.shake.durationMs === 240, "shake duration should survive");
  assert(
    normalizeCamera2DSettings({ referenceWidth: -1 }).referenceWidth ===
      DEFAULT_CAMERA_2D_SETTINGS.referenceWidth,
    "invalid legacy input should use the safe default",
  );
});

Deno.test("GAME350-CAMERA-002 respects dead zone and smoothing", () => {
  const immediate = resolveCameraFollowPosition(
    { x: 0, y: 0 },
    { x: 0.5, y: 0.5 },
    DEFAULT_CAMERA_2D_SETTINGS,
    0,
  );
  assert(immediate.x === 0 && immediate.y === 0, "dead zone should hold camera");
  const moved = resolveCameraFollowPosition(
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { ...DEFAULT_CAMERA_2D_SETTINGS, follow: { ...DEFAULT_CAMERA_2D_SETTINGS.follow, smoothing: 0 } },
    1 / 60,
  );
  assert(moved.x === 3.5, "look-ahead and dead zone should define the target");
});

Deno.test("GAME350-CAMERA-003 snaps viewport and shake to the pixel grid", () => {
  const snapped = pixelSnapCameraPosition({ x: 0.13, y: 0.19 }, DEFAULT_CAMERA_2D_SETTINGS);
  assert(snapped.x === 0.125 && snapped.y === 0.1875, "camera should snap to 1/PPU");
  const origin = resolveCameraViewportOrigin({
    targetPosition: { x: 8, y: 4 },
    world: { width: 20, height: 12 },
    settings: DEFAULT_CAMERA_2D_SETTINGS,
  });
  assert(origin.x >= 0 && origin.y >= 0, "camera origin should stay in world bounds");
  const shake = cameraShakeOffset(DEFAULT_CAMERA_2D_SETTINGS, 20, 3);
  assert(Math.abs(shake.x * 16 - Math.round(shake.x * 16)) < 1e-9, "shake x should be pixel snapped");
  assert(cameraShakeOffset(DEFAULT_CAMERA_2D_SETTINGS, 999, 3).x === 0, "expired shake should stop");
});
