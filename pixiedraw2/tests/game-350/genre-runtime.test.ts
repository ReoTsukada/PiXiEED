import {
  asComponentId,
  createGameProject,
  type GameTimelineTrack,
} from "../../src/game/game-300/core.ts";
import {
  defaultGameEventCardsForRuntimeFamily,
  sceneRulesForCreationMode,
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
  // The fixture's enemy sits within touch distance of the player's spawn
  // and never moves, so standing still resolves five throttled combat
  // ticks (every 30 ticks) well within 160 steps.
  for (let index = 0; index < 160; index += 1) {
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
