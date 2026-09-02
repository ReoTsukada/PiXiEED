import {
  asComponentId,
  createGameProject,
  type GameTimelineTrack,
} from "../../src/game/game-300/core.ts";
import {
  defaultGameEventCardsForRuntimeFamily,
  sceneRulesForCreationMode,
  sceneRulesForRuntimeFamily,
} from "../../src/game/game-350/authoring-model.ts";
import {
  DEFAULT_CAMERA_2D_SETTINGS,
} from "../../src/game/game-350/camera-2d.ts";
import {
  createGameTilemapDocument,
} from "../../src/game/game-350/tilemap-authoring.ts";
import {
  createGameGenreRuntime,
  playGameGenre,
  stepGameGenre,
  type GameGenreRuntimeFamily,
} from "../../src/game/game-350/genre-runtime.ts";
import { createGame351RpgTemplate } from "../../src/game/game-350/playable-slice.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function projectFor(family: GameGenreRuntimeFamily) {
  const template = await createGame351RpgTemplate({
    projectId: "genre-runtime-test",
    ownerId: "genre-runtime-owner",
    revisionId: "genre-runtime-revision",
  });
  const isScroll = family === "SCROLL_SIDE";
  const width = isScroll ? 18 : 12;
  const height = 10;
  const floor = Array.from({ length: width }, (_, x) => ({
    x,
    y: height - 1,
    collision: "SOLID" as const,
  }));
  const tracks: GameTimelineTrack[] = [
    {
      trackId: "hero",
      label: "主人公",
      kind: "SPRITE",
      activeFrames: [0],
      role: "PLAYER",
      components: [
        {
          type: "TRANSFORM",
          componentId: asComponentId("hero-transform"),
          x: 1,
          y: 1,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        {
          type: "RIGIDBODY",
          componentId: asComponentId("hero-rigidbody"),
          bodyType: "DYNAMIC",
          mass: 1,
          gravityScale: 1,
          fixedRotation: true,
          enabled: true,
        },
        {
          type: "CHARACTER_CONTROLLER",
          componentId: asComponentId("hero-controller"),
          moveSpeed: 6,
          stepHeight: 0.25,
          fixedStep: 1,
          enabled: true,
        },
      ],
    },
    {
      trackId: "enemy",
      label: "敵",
      kind: "SPRITE",
      activeFrames: [0],
      role: "NPC",
      components: [{
        type: "TRANSFORM",
        componentId: asComponentId("enemy-transform"),
        x: 1.4,
        y: height - 1 - 0.35,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      }],
    },
    {
      trackId: "tilemap",
      label: "ステージ",
      kind: "TILEMAP",
      activeFrames: [0],
      role: "TILEMAP",
      tilemap: createGameTilemapDocument({
        mapId: "map:genre-runtime-test",
        width,
        height,
        cells: floor,
      }),
    },
    {
      trackId: "camera",
      label: "追従カメラ",
      kind: "CAMERA",
      activeFrames: [0],
      role: "CAMERA",
      components: [{
        type: "CAMERA",
        componentId: asComponentId("camera-component"),
        active: true,
        zoom: 1,
        camera2D: DEFAULT_CAMERA_2D_SETTINGS,
      }],
    },
    ...(isScroll
      ? [{
        trackId: "goal",
        label: "ゴール",
        kind: "EVENT",
        activeFrames: [0],
        role: "TRIGGER" as const,
        components: [{
          type: "TRANSFORM" as const,
          componentId: asComponentId("goal-transform"),
          x: width - 2,
          y: height - 1 - 0.35,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        }],
      }]
      : []),
  ];
  return createGameProject({
    ...template.project,
    editorTimeline: {
      frameCount: 16,
      creationMode: isScroll ? "SCROLL_2D" : "ACTION_2D",
      sceneRules: sceneRulesForCreationMode(
        isScroll ? "SCROLL_2D" : "ACTION_2D",
      ),
      tracks,
      eventCards: defaultGameEventCardsForRuntimeFamily(
        family,
        tracks.map((track) => track.trackId),
      ),
    },
  }, template.caller);
}

Deno.test("GAME350-GENRE-001 runs Action movement, gravity, floor, and jump", async () => {
  const project = await projectFor("ACTION_PLATFORM");
  let state = playGameGenre(createGameGenreRuntime(project));
  for (let index = 0; index < 90; index += 1) {
    state = stepGameGenre(state);
  }
  assert(state.grounded, "Action player should land on the Scene floor");
  const beforeX = state.playerPosition.x;
  state = stepGameGenre(state, { right: true });
  assert(
    state.playerPosition.x > beforeX,
    "Action player should move horizontally without exposing physics components",
  );
  const beforeJumpY = state.playerPosition.y;
  state = stepGameGenre(state, { jump: true });
  assert(
    state.playerPosition.y < beforeJumpY && state.velocity.y < 0,
    "Action player should jump from a grounded floor",
  );
});

Deno.test("GAME350-GENRE-002 maps touch and damage cards to runtime effects", async () => {
  const project = await projectFor("ACTION_PLATFORM");
  let state = playGameGenre(createGameGenreRuntime(project));
  let collisionState:
    | typeof state
    | undefined;
  for (let index = 0; index < 90; index += 1) {
    state = stepGameGenre(state);
    if (state.cameraShakeFrames > 0) collisionState = state;
  }
  assert(
    state.health === 2 && collisionState !== undefined &&
      collisionState.activeEventIds.includes("event:enemy-hit"),
    "touching the starter enemy should apply damage and camera shake cards",
  );
  const stableHealth = state.health;
  state = stepGameGenre(state);
  assert(
    state.health === stableHealth,
    "a continuous touch should not repeatedly fire an edge-triggered card",
  );
});

Deno.test("GAME350-GENRE-004 default STATUS combat defeats an unarmed NPC over time", async () => {
  const project = await projectFor("ACTION_PLATFORM");
  let state = playGameGenre(createGameGenreRuntime(project));
  // No STATUS node was authored on "enemy" or "hero" in this fixture, so
  // both sides must run on the default genre rule engine's numbers
  // (decision 2): hp 10, attack 2, defense 0/1.
  assert(
    state.playerStatus.hp === 10 && state.playerStatus.maxHp === 10,
    "player should start with the default STATUS preset when no node is authored",
  );
  const enemyBefore = state.objects.find((object) => object.id === "enemy");
  assert(
    enemyBefore?.status?.hp === 10,
    "an NPC with no STATUS node should still get a default hp of 10",
  );
  // The fixture's enemy sits within touch distance of the player's landing
  // spot and never moves, but the player first needs ~80 ticks just to fall
  // onto the floor -- only once grounded does the throttled contact-combat
  // (one resolution every 30 ticks) start landing hits, so five hits to
  // fully deplete a 10 hp default NPC needs real margin past 80 + 5*30.
  for (let index = 0; index < 260; index += 1) {
    state = stepGameGenre(state);
  }
  assert(
    state.objects.find((object) => object.id === "enemy") === undefined,
    "an NPC reduced to 0 hp should be removed from the world (defeated)",
  );
  assert(
    state.playerStatus.hp > 0 && state.playerStatus.hp < 10,
    "the player should take contact damage too, but survive a single weak NPC",
  );
  assert(!state.gameOver, "losing partial hp to one NPC should not end the run");
});

Deno.test("GAME350-GENRE-005 completes the Scroll scene at its goal", async () => {
  const project = await projectFor("SCROLL_SIDE");
  let state = playGameGenre(createGameGenreRuntime(project));
  for (let index = 0; index < 90; index += 1) {
    state = stepGameGenre(state);
  }
  for (let index = 0; index < 220; index += 1) {
    state = stepGameGenre(state, { right: true });
  }
  assert(
    state.sceneComplete,
    "Scroll player should reach the starter goal with horizontal movement",
  );
  assert(
    state.cameraOrigin.x > 0,
    "Scroll camera should follow the player across the world",
  );
});

/**
 * Minimal project for Inventory & Crafting tests: no enemy, no goal track --
 * just a hero, a floor, and a project-wide item/recipe vocabulary the
 * author would define once and reference from Sentence Logic rows.
 */
async function projectForInventory() {
  const template = await createGame351RpgTemplate({
    projectId: "genre-runtime-inventory-test",
    ownerId: "genre-runtime-inventory-owner",
    revisionId: "genre-runtime-inventory-revision",
  });
  const width = 12;
  const height = 10;
  const floor = Array.from({ length: width }, (_, x) => ({
    x,
    y: height - 1,
    collision: "SOLID" as const,
  }));
  const tracks: GameTimelineTrack[] = [
    {
      trackId: "hero",
      label: "主人公",
      kind: "SPRITE",
      activeFrames: [0],
      role: "PLAYER",
      components: [
        {
          type: "TRANSFORM",
          componentId: asComponentId("hero-transform"),
          x: 1,
          y: 1,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
      ],
    },
    {
      trackId: "tilemap",
      label: "ステージ",
      kind: "TILEMAP",
      activeFrames: [0],
      role: "TILEMAP",
      tilemap: createGameTilemapDocument({
        mapId: "map:genre-runtime-inventory-test",
        width,
        height,
        cells: floor,
      }),
    },
  ];
  return createGameProject({
    ...template.project,
    editorTimeline: {
      frameCount: 16,
      creationMode: "ACTION_2D",
      sceneRules: sceneRulesForCreationMode("ACTION_2D"),
      tracks,
      items: [
        { itemId: "herb", label: "薬草", stackable: true, maxStack: 9 },
        { itemId: "potion", label: "ポーション", stackable: true, maxStack: 9 },
      ],
      recipes: [
        {
          recipeId: "brew-potion",
          label: "ポーション調合",
          ingredients: [{ itemId: "herb", amount: 2 }],
          result: { itemId: "potion", amount: 1 },
        },
      ],
      eventCards: [
        {
          eventId: "event:start-give-herb",
          label: "開始時に薬草を渡す",
          enabled: true,
          who: "PLAYER",
          condition: "START",
          action: "GIVE_ITEM",
          itemId: "herb",
          amount: 2,
        },
        {
          eventId: "event:auto-craft-potion",
          label: "薬草が集まったらポーションを調合",
          enabled: true,
          who: "PLAYER",
          condition: "HAS_ITEM",
          itemId: "herb",
          amount: 2,
          action: "CRAFT_ITEM",
          recipeId: "brew-potion",
        },
        {
          eventId: "event:potion-complete",
          label: "ポーションを持っていればクリア",
          enabled: true,
          who: "PLAYER",
          condition: "HAS_ITEM",
          itemId: "potion",
          amount: 1,
          action: "COMPLETE_SCENE",
        },
      ],
    },
  }, template.caller);
}

Deno.test("GAME350-GENRE-006 GIVE_ITEM/CRAFT_ITEM/HAS_ITEM drive the inventory without a script", async () => {
  const project = await projectForInventory();
  const created = createGameGenreRuntime(project);
  assert(
    created.inventory.herb === 2,
    "a START card's GIVE_ITEM should stock the inventory before Play even starts",
  );
  assert(
    (created.inventory.potion ?? 0) === 0,
    "no potion should exist until the craft recipe actually runs",
  );
  let state = playGameGenre(created);
  state = stepGameGenre(state);
  assert(
    state.inventory.herb === 0,
    "CRAFT_ITEM should consume the recipe's ingredients from the inventory",
  );
  assert(
    state.inventory.potion === 1,
    "CRAFT_ITEM should add the recipe's result to the inventory",
  );
  assert(
    state.sceneComplete,
    "a HAS_ITEM condition should be able to trigger COMPLETE_SCENE the same tick the item is crafted",
  );
});

/**
 * Minimal project for Block Building tests (decision: 2D, existing
 * tilemap). Gravity/floor collision are switched off (RPG_GRID's rule
 * preset) so the player sits exactly at its spawn cell every tick -- the
 * test is about BREAK_BLOCK/PLACE_BLOCK's cell targeting, not physics.
 */
async function projectForBlockBuilding() {
  const template = await createGame351RpgTemplate({
    projectId: "genre-runtime-block-test",
    ownerId: "genre-runtime-block-owner",
    revisionId: "genre-runtime-block-revision",
  });
  const width = 8;
  const height = 8;
  const tracks: GameTimelineTrack[] = [
    {
      trackId: "hero",
      label: "主人公",
      kind: "SPRITE",
      activeFrames: [0],
      role: "PLAYER",
      components: [
        {
          type: "TRANSFORM",
          componentId: asComponentId("hero-transform"),
          x: 2.5,
          y: 2.5,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
      ],
    },
    {
      trackId: "tilemap",
      label: "ステージ",
      kind: "TILEMAP",
      activeFrames: [0],
      role: "TILEMAP",
      tilemap: createGameTilemapDocument({
        mapId: "map:genre-runtime-block-test",
        width,
        height,
        // One breakable "dirt" wall directly beside the player's spawn.
        cells: [{ x: 3, y: 2, collision: "SOLID", blockTypeId: "dirt" }],
      }),
    },
  ];
  return createGameProject({
    ...template.project,
    editorTimeline: {
      frameCount: 16,
      sceneRules: sceneRulesForRuntimeFamily("RPG_GRID"),
      tracks,
      items: [
        { itemId: "dirt_chunk", label: "土", stackable: true, maxStack: 99 },
      ],
      blockTypes: [
        {
          blockTypeId: "dirt",
          label: "土ブロック",
          breakable: true,
          dropItemId: "dirt_chunk",
          placeable: true,
        },
      ],
      eventCards: [
        {
          eventId: "event:break-dirt",
          label: "タップでブロックを壊す",
          enabled: true,
          who: "PLAYER",
          condition: "TAP",
          action: "BREAK_BLOCK",
        },
        {
          eventId: "event:place-dirt",
          label: "話しかけでブロックを置く",
          enabled: true,
          who: "PLAYER",
          condition: "INTERACT",
          action: "PLACE_BLOCK",
          itemId: "dirt_chunk",
          blockTypeId: "dirt",
        },
      ],
    },
  }, template.caller);
}

Deno.test("GAME350-GENRE-007 BREAK_BLOCK/PLACE_BLOCK dig and rebuild the tilemap without a script", async () => {
  const project = await projectForBlockBuilding();
  let state = playGameGenre(createGameGenreRuntime(project));
  assert(
    state.world.blockTypeIds["3,2"] === "dirt",
    "the authored dirt cell should seed the runtime's block map",
  );
  assert(
    state.world.solidCells.some((cell) => cell.x === 3 && cell.y === 2),
    "a SOLID block cell should also seed the collision map",
  );
  state = stepGameGenre(state, { tap: true });
  assert(
    state.world.blockTypeIds["3,2"] === undefined,
    "BREAK_BLOCK should clear the nearby breakable block from the map",
  );
  assert(
    !state.world.solidCells.some((cell) => cell.x === 3 && cell.y === 2),
    "breaking a block should also clear its collision cell",
  );
  assert(
    state.inventory.dirt_chunk === 1,
    "a breakable block's dropItemId should land in the inventory",
  );
  state = stepGameGenre(state, { interact: true });
  assert(
    state.inventory.dirt_chunk === 0,
    "PLACE_BLOCK should consume one of the placed block's item from the inventory",
  );
  const placedCells = Object.entries(state.world.blockTypeIds).filter((
    [, blockTypeId],
  ) => blockTypeId === "dirt");
  assert(
    placedCells.length === 1,
    "placing a block should add exactly one dirt cell back to the map",
  );
  const [placedKey] = placedCells[0];
  const [placedX, placedY] = placedKey.split(",").map(Number);
  assert(
    state.world.solidCells.some((cell) =>
      cell.x === placedX && cell.y === placedY
    ),
    "a newly placed block should also become a collision cell",
  );
});

