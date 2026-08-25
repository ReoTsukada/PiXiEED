import { createGameCreationGuide } from "../../src/game/game-350/creation-guide.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const starterTracks = [
  { id: "hero", label: "Player", kind: "SPRITE" },
  { id: "enemy", label: "Guide NPC", kind: "SPRITE" },
  { id: "tilemap", label: "RPG Map", kind: "TILEMAP" },
];

Deno.test("GAME350-GUIDE-001 exposes a clear starter-to-preview recipe", () => {
  const guide = createGameCreationGuide({
    tracks: starterTracks,
    behaviorCount: 1,
    bindingCount: 0,
    previewReady: false,
  });
  assert(guide.steps.length === 4, "guide should contain four beginner steps");
  assert(
    guide.steps[0]?.complete === true &&
      guide.steps[1]?.complete === true &&
      guide.steps[2]?.id === "ASSET_REFERENCE" &&
      guide.nextStep?.action === "OPEN_ASSETS",
    "the next step should be adding a read-only asset reference",
  );
});

Deno.test("GAME350-GUIDE-002 recommends the starter kit for a blank Game", () => {
  const guide = createGameCreationGuide({
    tracks: [],
    behaviorCount: 0,
    bindingCount: 0,
    previewReady: false,
  });
  assert(
    guide.nextStep?.id === "STARTER",
    "blank Game should start at the starter step",
  );
  assert(
    guide.nextStep?.actionLabel === "スターターを配置",
    "blank Game should offer one clear starter action",
  );
});
