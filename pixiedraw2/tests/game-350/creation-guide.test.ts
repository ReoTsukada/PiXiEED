import {
  createGameCreationGuide,
  GAME_CREATION_MODE_OPTIONS,
  isSelectedGameCreationMode,
  normalizeGameCreationMode,
} from "../../src/game/game-350/creation-guide.ts";

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
      guide.steps[3]?.id === "ASSET_REFERENCE" &&
      guide.steps[3]?.required === false &&
      guide.nextStep?.action === "START_PREVIEW",
    "asset references should stay optional until after the first test play",
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
    guide.nextStep?.actionLabel === "RPGスターターを配置",
    "blank Game should offer one clear starter action",
  );
});

Deno.test("GAME350-CREATION-001 defines template and blank creation choices", () => {
  assert(
    GAME_CREATION_MODE_OPTIONS.map((option) => option.id).join(",") ===
      "RPG_TEMPLATE,BLANK",
    "new Game should expose RPG template and blank choices in a stable order",
  );
  assert(
    GAME_CREATION_MODE_OPTIONS[0]?.recommended === true &&
      GAME_CREATION_MODE_OPTIONS[1]?.recommended === false,
    "RPG template should be the recommended starting choice",
  );
});

Deno.test("GAME350-CREATION-002 normalizes only supported creation modes", () => {
  assert(
    normalizeGameCreationMode("RPG_TEMPLATE") === "RPG_TEMPLATE" &&
      normalizeGameCreationMode("BLANK") === "BLANK",
    "supported creation modes should remain unchanged",
  );
  assert(
    normalizeGameCreationMode("SIMPLE") === "UNSELECTED" &&
      normalizeGameCreationMode(undefined) === "UNSELECTED" &&
      !isSelectedGameCreationMode("UNSELECTED"),
    "editor modes and unknown values must not become creation modes",
  );
});

Deno.test("GAME350-CREATION-003 wires NEW through the lazy Game bootstrap", async () => {
  const html = await Deno.readTextFile(
    new URL("../../index.html", import.meta.url),
  );
  const entry = await Deno.readTextFile(
    new URL("../../src/draw2-entry.ts", import.meta.url),
  );
  const workspace = await Deno.readTextFile(
    new URL("../../src/wp180-workspace-ui.ts", import.meta.url),
  );
  assert(
    html.includes('id="draw2GameCreationModeTemplate"') &&
      html.includes('id="draw2GameCreationModeBlank"'),
    "the Game Scene must expose both creation choices",
  );
  assert(
    entry.includes("initialProjectMode") &&
      entry.includes("initialProjectMode === undefined"),
    "the initial NEW/OPEN mode must cross the lazy module boundary",
  );
  assert(
    workspace.includes('blank: options.initialProjectMode === "NEW"') &&
      workspace.includes(
        'gameCreationModePromptVisible ? "game-scene" : "preview"',
      ),
    "NEW must restore blank Game state and land on the creation Scene",
  );
});
