import {
  buildSceneHierarchy,
  deleteEntity,
  duplicateEntity,
  reparentEntity,
  renameEntity,
  setEntityActive,
  validateSceneHierarchy,
  validateScenePrefabReferences,
} from "../../src/game/game-350/scene-graph.ts";
import {
  asComponentId,
  asEntityId,
  asPrefabId,
  asSceneId,
} from "../../src/game/game-300/core.ts";
import type { Game350Scene } from "../../src/game/game-350/scene-graph.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fixture(): Game350Scene {
  return {
    sceneId: asSceneId("scene:game350-hierarchy"),
    name: "Hierarchy",
    rootEntityIds: [asEntityId("root")],
    entities: [
      {
        entityId: asEntityId("root"),
        name: "Root",
        active: true,
        components: [{
          type: "TRANSFORM",
          componentId: asComponentId("component:root:transform"),
          x: 0,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        }],
      },
      {
        entityId: asEntityId("child"),
        name: "Child",
        parentEntityId: asEntityId("root"),
        components: [],
      },
    ],
  };
}

Deno.test("GAME350-HIERARCHY-001 builds deterministic parent/child hierarchy and rejects malformed graphs", () => {
  const scene = fixture();
  const tree = buildSceneHierarchy(scene);
  assert(tree.length === 1 && tree[0]?.children[0]?.entity.name === "Child", "child must be nested under root");
  assert(tree[0]?.depth === 0 && tree[0]?.children[0]?.depth === 1, "hierarchy depth must be deterministic");

  const missingParent = { ...scene, entities: scene.entities.map((entity) => entity.entityId === asEntityId("child") ? { ...entity, parentEntityId: asEntityId("missing") } : entity) };
  assert(!validateSceneHierarchy(missingParent).valid, "missing parent must fail closed");
  const cycle = { ...scene, rootEntityIds: [], entities: scene.entities.map((entity) => entity.entityId === asEntityId("root") ? { ...entity, parentEntityId: asEntityId("child") } : entity) };
  assert(validateSceneHierarchy(cycle).diagnostics.some((item) => item.code === "CYCLE"), "cycle must be diagnosed");
  const duplicate = { ...scene, entities: [...scene.entities, { ...scene.entities[0]!, components: [] }] };
  assert(validateSceneHierarchy(duplicate).diagnostics.some((item) => item.code === "DUPLICATE_ID"), "duplicate Entity ID must be rejected");
});

Deno.test("GAME350-HIERARCHY-002 keeps rename/reparent/active operations immutable and no-op safe", () => {
  const scene = fixture();
  const renamed = renameEntity(scene, asEntityId("child"), "Renamed");
  assert(renamed.ok && renamed.changed && renamed.scene?.entities[1]?.name === "Renamed", "rename must return a new Scene");
  assert(scene.entities[1]?.name === "Child", "rename must not mutate input");
  const noOpRename = renameEntity(scene, asEntityId("child"), " Child ");
  assert(noOpRename.ok && !noOpRename.changed && noOpRename.scene === scene, "trim-equivalent rename must be a no-op");
  const active = setEntityActive(scene, asEntityId("child"), false);
  assert(active.ok && active.changed && active.scene?.entities[1]?.active === false, "active flag must be immutable");
  const reparented = reparentEntity(scene, asEntityId("child"), undefined);
  assert(reparented.ok && reparented.changed && reparented.scene?.rootEntityIds.includes(asEntityId("child")), "reparent to root must update roots");
  const cycle = reparentEntity(scene, asEntityId("root"), asEntityId("child"));
  assert(!cycle.ok && cycle.diagnostics.some((item) => item.code === "CYCLE"), "reparent cycle must be rejected");
  const foreign = reparentEntity(scene, asEntityId("child"), { sceneId: asSceneId("scene:foreign"), entityId: asEntityId("root") });
  assert(!foreign.ok && foreign.diagnostics.some((item) => item.code === "FOREIGN_TARGET"), "foreign scene target must be rejected");
});

Deno.test("GAME350-HIERARCHY-003 duplicates IDs safely and deletes a complete subtree atomically", () => {
  const scene = fixture();
  const duplicated = duplicateEntity(scene, asEntityId("root"), { entityId: asEntityId("root-copy") });
  assert(duplicated.ok && duplicated.scene?.entities.length === 4, "duplicate must include the subtree");
  assert(duplicated.scene?.entities.some((entity) => entity.entityId === asEntityId("root-copy")), "duplicate root must get a new ID");
  assert(duplicated.scene?.entities.some((entity) => entity.entityId === asEntityId("root-copy:child")), "duplicate child must get a new ID");
  const collision = duplicateEntity(scene, asEntityId("root"), { entityId: asEntityId("root") });
  assert(!collision.ok && collision.diagnostics.some((item) => item.code === "DUPLICATE_ID"), "duplicate IDs must fail closed");
  const nested = duplicateEntity(scene, asEntityId("child"));
  assert(nested.ok, "duplicating a nested Entity must remain a valid operation");
  assert(nested.scene?.rootEntityIds.length === 1, "duplicating a nested Entity must not create a new root");
  assert(nested.scene?.entities.find((entity) => entity.entityId === asEntityId("child:copy"))?.parentEntityId === asEntityId("root"), "nested duplicate must keep its original parent");
  const automatic = duplicateEntity(duplicated.scene!, asEntityId("root"));
  assert(automatic.ok && automatic.scene?.entities.some((entity) => entity.entityId === asEntityId("root:copy")), "automatic duplicate IDs must use a stable copy suffix");
  const repeated = duplicateEntity(automatic.scene!, asEntityId("root"));
  assert(repeated.ok && repeated.scene?.entities.some((entity) => entity.entityId === asEntityId("root:copy2")), "automatic duplicate IDs must advance deterministically");
  const deleted = deleteEntity(scene, asEntityId("root"));
  assert(deleted.ok && deleted.scene?.entities.length === 0 && deleted.scene.rootEntityIds.length === 0, "delete must remove descendants atomically");
});

Deno.test("GAME350-HIERARCHY-004 keeps Prefab design-gate closed", () => {
  const scene = fixture();
  const prefabEntity = { ...scene.entities[0]!, prefabId: asPrefabId("prefab:deferred") };
  const candidate = { ...scene, entities: [prefabEntity, scene.entities[1]!] };
  const result = validateScenePrefabReferences(candidate, [{ prefabId: asPrefabId("prefab:deferred"), name: "Deferred", rootEntityId: asEntityId("root"), entityIds: [asEntityId("root")], componentIds: [] }]);
  assert(!result.valid && result.diagnostics.some((item) => item.code === "PREFAB_DESIGN_GATE"), "Prefab references must remain unavailable in Phase 1");
});
