import {
  createDefaultRpgTilemapDocument,
  createGameTilemapDocument,
  gameTilemapCellAt,
  paintGameTilemapCell,
  setGameTilemapCell,
  solidGameTilemapCells,
  triggerGameTilemapCells,
  validateGameTilemapDocument,
} from "../../src/game/game-350/tilemap-authoring.ts";
import {
  componentIdFor,
  defaultGameObjectComponents,
} from "../../src/game/game-350/game-studio-systems.ts";
import {
  createGame351Physics2DScene,
  createGame351RpgTemplateFromProject,
} from "../../src/game/game-350/playable-slice.ts";
import { GameEditorCanonicalStore } from "../../src/pixync/game-editor-canonical-store.ts";
import { createGameEditorPersistenceRecord } from "../../src/workspace/game-persistence.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("GAME350-TILEMAP-001 creates deterministic immutable RPG map data", () => {
  const first = createDefaultRpgTilemapDocument();
  const second = createDefaultRpgTilemapDocument();
  assert(first.width === 12 && first.height === 8, "RPG map size must be 12x8");
  assert(solidGameTilemapCells(first).length === 38, "default boundary and inner walls must be present");
  assert(triggerGameTilemapCells(first).length === 1, "default RPG map must include one sample trigger");
  assert(JSON.stringify(first) === JSON.stringify(second), "default map must be deterministic");
  assert(Object.isFrozen(first) && Object.isFrozen(first.cells), "map data must be immutable");
  assert(validateGameTilemapDocument(first).valid, "created map must pass authoring validation");
});

Deno.test("GAME350-TILEMAP-002 paints cells without mutating the previous document", () => {
  const initial = createGameTilemapDocument({
    mapId: "map:test",
    width: 4,
    height: 4,
  });
  const wall = paintGameTilemapCell(initial, 1, 2, "SOLID");
  const trigger = paintGameTilemapCell(wall, 2, 2, "TRIGGER", "event:door");
  const erased = paintGameTilemapCell(trigger, 1, 2, "ERASE");
  assert(initial.cells.length === 0, "painting must not mutate the source document");
  assert(gameTilemapCellAt(wall, 1, 2)?.collision === "SOLID", "solid paint must create a wall");
  assert(gameTilemapCellAt(trigger, 2, 2)?.triggerId === "event:door", "trigger paint must keep a stable trigger id");
  assert(gameTilemapCellAt(erased, 1, 2) === undefined, "erase must remove the cell");
  assert(paintGameTilemapCell(initial, 1, 2, "ERASE") === initial, "empty erase must be a no-op");
});

Deno.test("GAME350-TILEMAP-002A keeps huge worlds sparse", () => {
  const document = createGameTilemapDocument({
    mapId: "map:huge",
    width: 1_000_000,
    height: 1_000_000,
    cells: [
      { x: 999_999, y: 999_999, collision: "SOLID" },
    ],
  });
  assert(document.width === 1_000_000 && document.height === 1_000_000, "large dimensions must be accepted");
  assert(document.cells.length === 1 && gameTilemapCellAt(document, 999_999, 999_999)?.collision === "SOLID", "only authored cells should be stored");
  assert(validateGameTilemapDocument(document).valid, "sparse huge maps must remain canonical");
});

Deno.test("GAME350-TILEMAP-003 rejects invalid or conflicting map cells", () => {
  let duplicateRejected = false;
  try {
    createGameTilemapDocument({
      mapId: "map:test",
      width: 2,
      height: 2,
      cells: [
        { x: 0, y: 0, collision: "SOLID" },
        { x: 0, y: 0, collision: "SOLID" },
      ],
    });
  } catch {
    duplicateRejected = true;
  }
  assert(duplicateRejected, "duplicate cells must be rejected");
  let outsideRejected = false;
  try {
    createGameTilemapDocument({
      mapId: "map:test",
      width: 2,
      height: 2,
      cells: [{ x: 2, y: 0, collision: "SOLID" }],
    });
  } catch {
    outsideRejected = true;
  }
  assert(outsideRejected, "out-of-bounds cells must be rejected");
  let conflictRejected = false;
  try {
    createGameTilemapDocument({
      mapId: "map:test",
      width: 2,
      height: 2,
      cells: [{ x: 0, y: 0, collision: "NONE" }],
    });
  } catch {
    conflictRejected = true;
  }
  assert(conflictRejected, "empty cells must not be persisted");
  const valid = setGameTilemapCell(
    createGameTilemapDocument({ mapId: "map:test", width: 2, height: 2 }),
    0,
    0,
    { collision: "NONE", triggerId: "event:start" },
  );
  assert(validateGameTilemapDocument(valid).valid, "trigger-only cells must be valid");
});

Deno.test("GAME350-TILEMAP-004 persists the map document through Canonical Scene and timeline", async () => {
  const document = createDefaultRpgTilemapDocument("map:authoring");
  const record = await createGameEditorPersistenceRecord(
    "tilemap-project",
    [
      { id: "hero", label: "Player", kind: "SPRITE", filled: [], components: defaultGameObjectComponents("hero", "SPRITE") },
      { id: "enemy", label: "NPC", kind: "SPRITE", filled: [], components: defaultGameObjectComponents("enemy", "SPRITE") },
      {
        id: "tilemap",
        label: "RPG Map",
        kind: "TILEMAP",
        filled: [],
        tilemap: document,
        components: defaultGameObjectComponents("tilemap", "TILEMAP").map((component) =>
          component.type === "TILEMAP"
            ? { ...component, mapId: document.mapId }
            : component
        ),
      },
    ],
    1,
  );
  const store = await GameEditorCanonicalStore.create(record);
  const scene = store.project.scenes[0]!;
  const tilemap = scene.entities.find((entity) =>
    String(entity.entityId) === "entity:pixieed-game:tilemap"
  )?.components.find((component) => component.type === "TILEMAP");
  const timeline = store.project.editorTimeline?.tracks.find((track) =>
    track.trackId === "tilemap"
  );
  assert(tilemap?.type === "TILEMAP" && JSON.stringify(tilemap.document) === JSON.stringify(document), "Scene must retain the map document");
  assert(timeline?.tilemap !== undefined && JSON.stringify(timeline.tilemap) === JSON.stringify(document), "timeline must retain the map document");
  assert(
    scene.entities.some((entity) => entity.components.some((component) =>
      component.type === "TILEMAP" && component.componentId === componentIdFor("tilemap", "TILEMAP")
    )),
    "canonical Scene must retain the tilemap component",
  );
});

Deno.test("GAME350-TILEMAP-005 projects authored Trigger cells into the Physics2D preview", async () => {
  const document = createGameTilemapDocument({
    mapId: "game351-rpg-map",
    width: 8,
    height: 6,
    cells: [
      { x: 0, y: 0, collision: "SOLID" },
      { x: 2, y: 1, collision: "NONE", triggerId: "event:entrance" },
    ],
  });
  const record = await createGameEditorPersistenceRecord(
    "tilemap-runtime-project",
    [
      { id: "hero", label: "Player", kind: "SPRITE", filled: [], components: defaultGameObjectComponents("hero", "SPRITE") },
      { id: "enemy", label: "NPC", kind: "SPRITE", filled: [], components: defaultGameObjectComponents("enemy", "SPRITE") },
      {
        id: "tilemap",
        label: "RPG Map",
        kind: "TILEMAP",
        filled: [],
        tilemap: document,
        components: defaultGameObjectComponents("tilemap", "TILEMAP"),
      },
    ],
    1,
  );
  const canonical = await GameEditorCanonicalStore.create(record);
  const template = createGame351RpgTemplateFromProject(canonical.project);
  const physicsScene = createGame351Physics2DScene(template, {
    settings: { gravity: { x: 0, y: 0 } },
  });
  const triggerEntities = physicsScene.entities.filter((entity) =>
    String(entity.entityId).includes(":trigger:")
  );
  assert(triggerEntities.length === 1, "one authored Trigger cell must become one runtime entity");
  assert(triggerEntities[0]!.components.some((component) =>
    component.type === "COLLIDER" && component.isTrigger && component.layer === "SENSOR"
  ), "authored Trigger must be a non-blocking SENSOR collider");
});
