import {
  completeIGameBrandSplash,
  createIGameRuntimeLaunchConfig,
  createIGameRuntimeLaunchState,
  startIGameRuntime,
  stopIGameRuntime,
} from "../../src/game/game-350/runtime-launch.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("GAME350-RUNTIME-LAUNCH-001 always follows PiXiEED splash -> start -> gameplay", () => {
  const config = createIGameRuntimeLaunchConfig({
    title: "User Action Game",
    subtitle: "ユーザーが設定したスタート画面",
    startSceneId: "scene-main",
    startLabel: "ゲーム開始",
  });
  const splash = createIGameRuntimeLaunchState(config);
  assert(splash.phase === "BRAND_SPLASH", "launch must begin with the brand splash");
  const start = completeIGameBrandSplash(splash);
  assert(start.phase === "START_SCREEN", "splash must lead to the start screen");
  const gameplay = startIGameRuntime(start);
  assert(gameplay.phase === "GAMEPLAY", "start must lead to the package-owned gameplay surface");
  assert(gameplay.config.title === "User Action Game", "the package title must reach the start screen");
});

Deno.test("GAME350-RUNTIME-LAUNCH-002 rejects skipped and duplicate transitions", () => {
  const config = createIGameRuntimeLaunchConfig({
    title: "Safe Runtime",
    startSceneId: "scene-safe",
  });
  const splash = createIGameRuntimeLaunchState(config);
  let skipped = false;
  try {
    startIGameRuntime(splash);
  } catch {
    skipped = true;
  }
  assert(skipped, "gameplay cannot start before the start screen");

  const start = completeIGameBrandSplash(splash);
  const gameplay = startIGameRuntime(start);
  let duplicate = false;
  try {
    startIGameRuntime(gameplay);
  } catch {
    duplicate = true;
  }
  assert(duplicate, "duplicate gameplay start must be rejected");
  assert(stopIGameRuntime(gameplay).phase === "STOPPED", "runtime must expose a safe stop state");
});

Deno.test("GAME350-RUNTIME-LAUNCH-003 does not require a PiXiEED-owned game surface", () => {
  const config = createIGameRuntimeLaunchConfig({
    title: "Custom HUD Game",
    startSceneId: "scene-custom",
  });
  assert(config.startSceneId === "scene-custom", "the user package selects the first scene");
  assert(config.startLabel === "START", "the generic start action is configurable but has a safe default");
});
