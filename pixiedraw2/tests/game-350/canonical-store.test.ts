import {
  createGameEditorPersistenceRecord,
  validateGameEditorPersistenceRecord,
} from "../../src/workspace/game-persistence.ts";
import { GameEditorCanonicalStore } from "../../src/pixync/game-editor-canonical-store.ts";
import { asBehaviorId } from "../../src/game/game-300/core.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("GAME350-CANONICAL-001 projects editor tracks into Scene and Entity state", async () => {
  const record = await createGameEditorPersistenceRecord("game-project", [
    { id: "hero", label: "Hero", kind: "SPRITE", filled: [0, 2] },
    { id: "music", label: "Music", kind: "AUDIO", filled: [1] },
  ], 1);
  const store = await GameEditorCanonicalStore.create(record);
  const scene = store.project.scenes[0];
  assert(scene !== undefined, "editor records must create a canonical scene");
  assert(
    scene.entities.length === 2,
    "each editor track must become an entity",
  );
  assert(
    scene.entities[0]?.components[0]?.type === "TRANSFORM",
    "track entities need a canonical transform",
  );
  assert(
    store.project.editorTimeline?.tracks.length === 2,
    "timeline tracks must remain lossless",
  );
});

Deno.test("GAME350-CANONICAL-002 preserves user scenes while refreshing the editor scene", async () => {
  const first = await createGameEditorPersistenceRecord("game-project", [
    { id: "hero", label: "Hero", kind: "SPRITE", filled: [] },
  ], 1);
  const store = await GameEditorCanonicalStore.create(first);
  const second = await createGameEditorPersistenceRecord("game-project", [
    { id: "hero", label: "Player", kind: "SPRITE", filled: [3] },
    { id: "enemy", label: "Enemy", kind: "SPRITE", filled: [4] },
  ], 2);
  await store.commitLocal(second);
  const scene = store.project.scenes[0];
  assert(
    scene?.entities.length === 2,
    "editor scene must reconcile added tracks",
  );
  assert(
    scene.entities[0]?.name === "Player",
    "editor scene must reconcile renamed tracks",
  );
  assert(
    store.project.editorTimeline?.tracks[1]?.label === "Enemy",
    "timeline update must remain canonical",
  );
});

Deno.test("GAME350-CANONICAL-003 projects Draw and Audio bindings into typed components", async () => {
  const hash = "a".repeat(64);
  const record = await createGameEditorPersistenceRecord(
    "game-project",
    [
      { id: "hero", label: "Hero", kind: "SPRITE", filled: [0] },
      { id: "music", label: "Music", kind: "MUSIC", filled: [] },
    ],
    1,
    undefined,
    undefined,
    [
      {
        trackId: "hero",
        kind: "DRAW",
        assetId: "draw-hero",
        revisionId: "draw-revision-1",
        contentHash: hash,
        mode: "PINNED",
        label: "Hero",
      },
      {
        trackId: "music",
        kind: "AUDIO",
        assetId: "audio-bgm",
        revisionId: "audio-revision-1",
        contentHash: hash,
        mode: "LIVE",
        label: "BGM",
      },
    ],
  );
  const store = await GameEditorCanonicalStore.create(record);
  const scene = store.project.scenes[0];
  const hero = scene?.entities.find((entity) => entity.name === "Hero");
  const music = scene?.entities.find((entity) => entity.name === "Music");
  assert(
    hero?.components.some((component) => component.type === "SPRITE"),
    "Draw binding must become a Sprite component",
  );
  assert(
    music?.components.some((component) => component.type === "AUDIO_SOURCE"),
    "Audio binding must become an Audio Source component",
  );
  assert(
    await validateGameEditorPersistenceRecord(record),
    "binding-bearing records must validate their state hash",
  );
});

Deno.test("GAME350-CANONICAL-004 projects Behavior IR into a stable Scene component", async () => {
  const record = await createGameEditorPersistenceRecord(
    "game-project",
    [{ id: "enemy", label: "Guide NPC", kind: "SPRITE", filled: [] }],
    1,
    undefined,
    undefined,
    [],
    [{
      behaviorId: asBehaviorId("behavior:pixiedraw-game:enemy"),
      version: 1,
      ownership: "CANONICAL_IR",
      rules: [{
        ruleId: "enemy-event",
        enabled: true,
        trigger: { type: "ACTION", actionId: "rpg.interact" },
        conditions: [{ kind: "ALWAYS" }],
        actions: [{
          kind: "SET_VARIABLE",
          targetId: "enemy",
          property: "dialogue",
          value: "hello",
        }],
      }],
    }],
  );
  const store = await GameEditorCanonicalStore.create(record);
  const entity = store.project.scenes[0]?.entities[0];
  assert(
    store.project.behaviors.length === 1,
    "Behavior IR must remain canonical",
  );
  assert(
    entity?.components.some((component) =>
      component.type === "BEHAVIOR" &&
      String(component.behaviorId) === "behavior:pixiedraw-game:enemy"
    ),
    "Behavior IR must project to a stable BEHAVIOR component",
  );
  assert(
    await validateGameEditorPersistenceRecord(record),
    "Behavior-bearing records must validate their state hash",
  );
});

Deno.test("GAME350-CANONICAL-005 keeps author-defined game data and event references lossless", async () => {
  const record = await createGameEditorPersistenceRecord(
    "game-data-project",
    [{ id: "hero", label: "Hero", kind: "SPRITE", filled: [] }],
    1,
    undefined,
    undefined,
    [],
    [],
    [],
    undefined,
    [],
    [],
    undefined,
    undefined,
    [
      {
        eventId: "event:inventory",
        label: "鍵を渡す",
        enabled: true,
        who: "PLAYER",
        condition: "HAS_ITEM",
        sourceTrackId: "hero",
        action: "GIVE_ITEM",
        amount: 1,
        itemId: "item:key",
      },
      {
        eventId: "event:craft",
        label: "薬を作る",
        enabled: true,
        who: "PLAYER",
        condition: "INTERACT",
        sourceTrackId: "hero",
        action: "CRAFT_ITEM",
        recipeId: "recipe:potion",
      },
      {
        eventId: "event:block",
        label: "石を置く",
        enabled: true,
        who: "PLAYER",
        condition: "TOUCH",
        sourceTrackId: "hero",
        action: "PLACE_BLOCK",
        blockTypeId: "block:stone",
      },
    ],
    undefined,
    {
      items: [
        {
          itemId: "item:key",
          label: "古い鍵",
          stackable: false,
          maxStack: 1,
        },
        {
          itemId: "item:potion",
          label: "回復薬",
          stackable: true,
          maxStack: 10,
        },
      ],
      recipes: [{
        recipeId: "recipe:potion",
        label: "回復薬を作る",
        ingredients: [{ itemId: "item:key", amount: 1 }],
        result: { itemId: "item:potion", amount: 1 },
      }],
      blockTypes: [{
        blockTypeId: "block:stone",
        label: "石ブロック",
        breakable: true,
        dropItemId: "item:key",
        placeable: true,
      }],
    },
  );
  const store = await GameEditorCanonicalStore.create(record);
  const timeline = store.project.editorTimeline;
  assert(timeline?.items?.[1]?.label === "回復薬", "items must remain canonical");
  assert(timeline?.recipes?.[0]?.result.itemId === "item:potion", "recipes must remain canonical");
  assert(timeline?.blockTypes?.[0]?.blockTypeId === "block:stone", "block types must remain canonical");
  assert(timeline?.eventCards?.[2]?.blockTypeId === "block:stone", "event references must remain canonical");
  assert(
    await validateGameEditorPersistenceRecord(record),
    "game data and event references must validate their state hash",
  );
});
