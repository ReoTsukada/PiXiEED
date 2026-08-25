import {
  createGameEditorPersistenceRecord,
  validateGameEditorPersistenceRecord,
} from "../../src/workspace/game-persistence.ts";
import { GameEditorCanonicalStore } from "../../src/pixync/game-editor-canonical-store.ts";

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
  assert(scene.entities.length === 2, "each editor track must become an entity");
  assert(scene.entities[0]?.components[0]?.type === "TRANSFORM", "track entities need a canonical transform");
  assert(store.project.editorTimeline?.tracks.length === 2, "timeline tracks must remain lossless");
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
  assert(scene?.entities.length === 2, "editor scene must reconcile added tracks");
  assert(scene.entities[0]?.name === "Player", "editor scene must reconcile renamed tracks");
  assert(store.project.editorTimeline?.tracks[1]?.label === "Enemy", "timeline update must remain canonical");
});

Deno.test("GAME350-CANONICAL-003 projects Draw and Audio bindings into typed components", async () => {
  const hash = "a".repeat(64);
  const record = await createGameEditorPersistenceRecord("game-project", [
    { id: "hero", label: "Hero", kind: "SPRITE", filled: [0] },
    { id: "music", label: "Music", kind: "MUSIC", filled: [] },
  ], 1, undefined, undefined, [
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
  ]);
  const store = await GameEditorCanonicalStore.create(record);
  const scene = store.project.scenes[0];
  const hero = scene?.entities.find((entity) => entity.name === "Hero");
  const music = scene?.entities.find((entity) => entity.name === "Music");
  assert(hero?.components.some((component) => component.type === "SPRITE"), "Draw binding must become a Sprite component");
  assert(music?.components.some((component) => component.type === "AUDIO_SOURCE"), "Audio binding must become an Audio Source component");
  assert(await validateGameEditorPersistenceRecord(record), "binding-bearing records must validate their state hash");
});
