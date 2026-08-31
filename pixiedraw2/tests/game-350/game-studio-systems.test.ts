import {
  defaultGameObjectComponents,
  gameObjectRoleFor,
} from "../../src/game/game-350/game-studio-systems.ts";
import {
  createGameEditorPersistenceRecord,
  validateGameEditorPersistenceRecord,
} from "../../src/workspace/game-persistence.ts";
import { GameEditorCanonicalStore } from "../../src/pixync/game-editor-canonical-store.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(
  actual: T,
  expected: T,
  message = "Values are not equal",
): void {
  if (actual !== expected) {
    throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`);
  }
}

Deno.test("GAME350-SYSTEMS-001 creates an object model with Transform, Collider, Rigidbody and Controller", () => {
  const components = defaultGameObjectComponents("hero", "SPRITE");
  assertEquals(gameObjectRoleFor("hero", "SPRITE"), "PLAYER");
  assert(
    components.some((component) => component.type === "TRANSFORM"),
    "Player requires Transform",
  );
  assert(
    components.some((component) => component.type === "SPRITE"),
    "Player requires Sprite state",
  );
  assert(
    components.some((component) =>
      component.type === "COLLIDER" && !component.isTrigger
    ),
    "Player requires a blocking Collider",
  );
  assert(
    components.some((component) =>
      component.type === "RIGIDBODY" && component.bodyType === "DYNAMIC"
    ),
    "Player requires a dynamic Rigidbody",
  );
  assert(
    components.some((component) =>
      component.type === "CHARACTER_CONTROLLER" && component.fixedStep === 1
    ),
    "Player requires fixed-step movement",
  );
});

Deno.test("GAME350-SYSTEMS-002 persists Trigger and Tilemap configuration into the canonical Scene", async () => {
  const record = await createGameEditorPersistenceRecord("game-systems", [{
    id: "trigger",
    label: "Exit Trigger",
    kind: "EVENT",
    role: "TRIGGER",
    filled: [],
    components: defaultGameObjectComponents("trigger", "EVENT"),
  }, {
    id: "map",
    label: "World Map",
    kind: "TILEMAP",
    role: "TILEMAP",
    filled: [],
    components: defaultGameObjectComponents("map", "TILEMAP"),
  }], 0);
  assert(
    await validateGameEditorPersistenceRecord(record),
    "Game component record must validate",
  );
  const store = await GameEditorCanonicalStore.create(record);
  const scene = store.project.scenes[0];
  const trigger = scene?.entities.find((entity) =>
    String(entity.entityId).endsWith(":trigger")
  );
  const map = scene?.entities.find((entity) =>
    String(entity.entityId).endsWith(":map")
  );
  assert(
    trigger?.components.some((component) =>
      component.type === "COLLIDER" && component.isTrigger
    ),
    "Trigger must project as a trigger Collider",
  );
  assert(
    map?.components.some((component) =>
      component.type === "TILEMAP" && component.collisionEnabled
    ),
    "Tilemap collision must project into canonical Game",
  );
  assertEquals(store.project.editorTimeline?.tracks[0]?.role, "TRIGGER");
});
