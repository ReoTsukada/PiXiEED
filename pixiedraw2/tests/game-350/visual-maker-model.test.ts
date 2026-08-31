import {
  createDefaultGameVisualMakerConfig,
  GAME_VISUAL_MAKER_CATEGORIES,
  GAME_VISUAL_MAKER_DIRECTIONS,
  GAME_VISUAL_MAKER_MOTIONS,
  isValidGameVisualMakerConfig,
  normalizeGameVisualMakerConfig,
  updateGameVisualMakerUiSlot,
} from "../../src/game/game-350/visual-maker-model.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("GAME350-VISUAL-MAKER-001 exposes the five beginner work areas", () => {
  assert(
    GAME_VISUAL_MAKER_CATEGORIES.map((item) => item.id).join(",") ===
      "WORLD,HERO,ITEM,EVENT,UI",
    "visual maker categories should follow the creator's natural order",
  );
  assert(
    GAME_VISUAL_MAKER_DIRECTIONS.length === 8 &&
      GAME_VISUAL_MAKER_MOTIONS.map((item) => item.id).join(",") ===
        "IDLE,WALK,RUN,ATTACK",
    "the Hero card should expose eight directions and four motions",
  );
});

Deno.test("GAME350-VISUAL-MAKER-002 keeps UI slots fixed and reference-free", () => {
  const config = createDefaultGameVisualMakerConfig("hero");
  assert(isValidGameVisualMakerConfig(config), "default maker state should validate");
  assert(
    config.uiSlots.length === 5 &&
      config.uiSlots.map((slot) => slot.id).join(",") ===
        "TOP_LEFT,TOP_CENTER,TOP_RIGHT,BOTTOM_LEFT,BOTTOM_RIGHT",
    "five visual button positions should be available",
  );
  const next = updateGameVisualMakerUiSlot(config, "BOTTOM_RIGHT", (slot) => ({
    ...slot,
    label: "ジャンプ",
    action: "JUMP",
  }));
  assert(
    next.selectedUiSlot === "BOTTOM_RIGHT" &&
      next.uiSlots.find((slot) => slot.id === "BOTTOM_RIGHT")?.action === "JUMP",
    "selecting a screen position should update only its friendly action",
  );
  assert(
    !Object.keys(next).some((key) => key.toLocaleLowerCase().includes("pixel")),
    "maker metadata must not contain raster pixels",
  );
});

Deno.test("GAME350-VISUAL-MAKER-003 fails closed and restores a safe default", () => {
  const config = createDefaultGameVisualMakerConfig();
  const invalid = {
    ...config,
    activeCategory: "UNKNOWN",
  };
  assert(!isValidGameVisualMakerConfig(invalid), "unknown categories must be rejected");
  const restored = normalizeGameVisualMakerConfig(invalid, "player-1");
  assert(
    restored.activeCategory === "HERO" &&
      restored.hero.trackId === "player-1",
    "invalid maker state should return a safe Hero default",
  );
});
