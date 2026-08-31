import {
  asBehaviorId,
  isValidGameEventCard,
  isValidGameSceneRules,
  type GameEventCard,
} from "../../src/game/game-300/core.ts";
import {
  behaviorFromGameEventCard,
  defaultGameEventCardsForRuntimeFamily,
  GAME_SCENE_RULE_PRESETS,
  physics2DSettingsForSceneRules,
  sceneRulesForCreationMode,
  sceneRulesForRuntimeFamily,
  sceneRulesSummary,
} from "../../src/game/game-350/authoring-model.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("GAME350-AUTHORING-001 maps templates to scene-wide rules", () => {
  const rpg = sceneRulesForCreationMode("RPG_TEMPLATE");
  const action = sceneRulesForCreationMode("ACTION_2D");
  const scroll = sceneRulesForCreationMode("SCROLL_2D");
  const blank = sceneRulesForCreationMode("BLANK");
  assert(
    rpg.runtimeFamily === "RPG_GRID" && rpg.gravity === "NONE" &&
      rpg.horizontalMove && rpg.verticalMove && !rpg.jump,
    "RPG should use no gravity and four-direction movement",
  );
  assert(
    action.runtimeFamily === "ACTION_PLATFORM" &&
      action.gravity === "STANDARD" && action.horizontalMove &&
      !action.verticalMove && action.jump && action.floorCollision,
    "Action should enable gravity, horizontal movement, jump, and floor collision",
  );
  assert(
    scroll.runtimeFamily === "SCROLL_SIDE" && scroll.gravity === "STANDARD" &&
      scroll.cameraFollow && scroll.mobileControls,
    "Scroll should use the side-scrolling runtime and camera controls",
  );
  assert(
    blank.runtimeFamily === "FREE" && blank.gravity === "NONE",
    "Blank creation should stay at the minimum rules",
  );
  assert(
    sceneRulesSummary(action).includes("2Dアクション") &&
      sceneRulesSummary(action).includes("床との衝突"),
    "the beginner summary should describe the active rules",
  );
});

Deno.test("GAME350-AUTHORING-002 derives bounded Physics2D values", () => {
  for (const [gravity, expected] of Object.entries(GAME_SCENE_RULE_PRESETS)) {
    const rules = {
      ...sceneRulesForRuntimeFamily("ACTION_PLATFORM"),
      gravity: gravity as "NONE" | "WEAK" | "STANDARD" | "STRONG",
    };
    const physics = physics2DSettingsForSceneRules(rules);
    assert(
      physics.gravity.x === 0 && physics.gravity.y === expected,
      "gravity preset should map to one scene-level Physics2D value",
    );
  }
});

Deno.test("GAME350-AUTHORING-003 compiles event cards into bounded behavior", () => {
  const cards = defaultGameEventCardsForRuntimeFamily(
    "ACTION_PLATFORM",
    ["hero", "enemy", "tilemap", "camera"],
  );
  assert(cards.length === 2, "Action starter should seed damage and shake cards");
  const compiled = cards.map(behaviorFromGameEventCard);
  assert(
    compiled.every((behavior) => behavior.ownership === "CANONICAL_IR") &&
      compiled[0]?.rules[0]?.trigger.type === "COLLISION" &&
      compiled[0]?.rules[0]?.actions[0]?.kind === "SET_COMPONENT_PROPERTY",
    "event cards should compile to the existing bounded BehaviorIR",
  );
  assert(
    String(compiled[0]?.behaviorId).startsWith("behavior:pixiedraw-game:"),
    "compiled behavior identity should remain Game-owned",
  );
});

Deno.test("GAME350-AUTHORING-004 validates reference-only card data", () => {
  const card: GameEventCard = {
    eventId: "event:test-dialogue",
    label: "話しかける",
    enabled: true,
    who: "PLAYER",
    condition: "INTERACT",
    sourceTrackId: "hero",
    targetTrackId: "npc",
    action: "SHOW_DIALOGUE",
    message: "こんにちは",
  };
  assert(isValidGameEventCard(card), "a normal event card should be valid");
  assert(
    isValidGameSceneRules(sceneRulesForRuntimeFamily("RPG_GRID")),
    "a normal Scene rule set should be valid",
  );
  assert(
    !isValidGameEventCard({ ...card, eventId: "event bad" }),
    "event IDs must remain stable reference keys",
  );
  const compiled = behaviorFromGameEventCard(card);
  assert(
    compiled.behaviorId === asBehaviorId("behavior:pixiedraw-game:event:test-dialogue"),
    "card compilation should be deterministic",
  );
});

Deno.test("GAME350-AUTHORING-005 leaves starter targets empty until placed", () => {
  const cards = defaultGameEventCardsForRuntimeFamily("RPG_GRID", ["hero"]);
  assert(
    cards[0]?.sourceTrackId === "hero" &&
      cards[0]?.targetTrackId === undefined &&
      isValidGameEventCard(cards[0]),
    "a starter card must remain saveable before its NPC is placed",
  );
});
