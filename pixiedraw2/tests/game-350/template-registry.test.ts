import {
  GAME_TEMPLATE_CATEGORIES,
  GAME_TEMPLATE_KINDS,
  isValidGameTemplateInstance,
} from "../../src/game/game-300/core.ts";
import { GameEditorCanonicalStore } from "../../src/pixync/game-editor-canonical-store.ts";
import {
  createGameEditorPersistenceRecord,
  validateGameEditorPersistenceRecord,
} from "../../src/workspace/game-persistence.ts";
import {
  applyGameTemplate,
  getGameTemplate,
  getGameTemplates,
  removeGameTemplateInstance,
  validateGameTemplateDefinition,
} from "../../src/game/game-350/template-registry.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("GAME350-TEMPLATE-001 exposes a genre-neutral catalog and RPG pack", () => {
  const templates = getGameTemplates();
  assert(
    templates.length >= 16,
    "catalog must cover core and genre starter packs",
  );
  assert(
    GAME_TEMPLATE_CATEGORIES.every((category) =>
      category === "CORE" ||
      templates.some((template) => template.category === category)
    ),
    "catalog must expose every supported genre category",
  );
  assert(
    GAME_TEMPLATE_KINDS.every((kind) =>
      templates.some((template) => template.kind === kind)
    ),
    "catalog must expose every requested RPG data kind",
  );
  for (const template of templates) {
    assert(
      validateGameTemplateDefinition(template).valid,
      `${template.id} must validate`,
    );
  }
  assert(
    getGameTemplate("rpg.playable-character") !== undefined,
    "RPG player template is required",
  );
  assert(
    getGameTemplate("rpg.weapon") !== undefined,
    "RPG weapon template is required",
  );
  assert(
    getGameTemplate("rpg.armor") !== undefined,
    "RPG armor template is required",
  );
  assert(
    getGameTemplate("rpg.skill") !== undefined,
    "RPG skill template is required",
  );
  assert(
    getGameTemplate("rpg.status-sheet") !== undefined,
    "RPG status template is required",
  );
  assert(
    getGameTemplate("rpg.tile") !== undefined,
    "RPG tile template is required",
  );
  assert(
    getGameTemplate("rpg.damage") !== undefined,
    "RPG damage template is required",
  );
  assert(
    getGameTemplate("rpg.ui-hud") !== undefined,
    "RPG UI template is required",
  );
});

Deno.test("GAME350-TEMPLATE-002 applies scene templates as Game-owned objects", () => {
  const initial = [{ id: "root", label: "Root", kind: "EMPTY", filled: [] }];
  const result = applyGameTemplate({
    templateId: "rpg.playable-character",
    tracks: initial,
    instances: [],
    overrides: {
      name: "Hero",
      moveSpeed: 7,
      maxHp: 250,
      gravityScale: 1,
    },
  });
  assert(initial.length === 1, "template application must not mutate tracks");
  assert(result.tracks.length === 2, "scene template must add one track");
  assert(
    result.instance.target === "SCENE_OBJECT",
    "player template must target a scene object",
  );
  assert(
    result.instance.targetTrackId === result.selectedTrackId,
    "created object must be selected",
  );
  assert(
    result.instance.label === "Hero",
    "template override must become the object name",
  );
  const created = result.tracks.find((track) =>
    track.id === result.instance.targetTrackId
  );
  assert(created !== undefined, "created track must exist");
  assert(
    created.components?.some((component) =>
      component.type === "CHARACTER_CONTROLLER" && component.moveSpeed === 7
    ),
    "player speed must reach the controller",
  );
  assert(
    created.components?.some((component) =>
      component.type === "RIGIDBODY" && component.gravityScale === 1
    ),
    "gravity must reach the rigidbody",
  );
  assert(
    !JSON.stringify(result.instance).includes("assetId"),
    "template instance must not contain source asset data",
  );
  assert(
    isValidGameTemplateInstance(result.instance),
    "applied instance must pass canonical validation",
  );
});

Deno.test("GAME350-TEMPLATE-003 keeps RPG data templates attachable without changing the scene", () => {
  const tracks = [{ id: "hero", label: "Hero", kind: "SPRITE", filled: [] }];
  const weapon = applyGameTemplate({
    templateId: "rpg.weapon",
    tracks,
    instances: [],
    selectedTrackId: "hero",
    overrides: { name: "Fire Sword", attackPower: 40 },
  });
  assert(
    weapon.tracks.length === tracks.length,
    "data template must not add a scene object",
  );
  assert(
    weapon.instance.target === "GAME_DATA",
    "weapon must remain Game data",
  );
  assert(
    weapon.instance.targetTrackId === "hero",
    "weapon may attach to the selected Game object",
  );
  assert(
    weapon.instance.values.attackPower === 40,
    "weapon values must be persisted",
  );
  const armor = applyGameTemplate({
    templateId: "rpg.armor",
    tracks,
    instances: weapon.instances,
    selectedTrackId: "hero",
  });
  assert(
    armor.instances.length === 2,
    "multiple Game data templates must coexist",
  );
  assert(
    removeGameTemplateInstance(armor.instances, weapon.instance.instanceId)
      .length === 1,
    "removing data must be explicit",
  );
});

Deno.test("GAME350-TEMPLATE-004 persists through the editor record and Canonical Project", async () => {
  const baseTracks = [{
    id: "hero",
    label: "Hero",
    kind: "SPRITE",
    filled: [],
  }];
  const applied = applyGameTemplate({
    templateId: "rpg.playable-character",
    tracks: baseTracks,
    instances: [],
  });
  const data = applyGameTemplate({
    templateId: "rpg.weapon",
    tracks: applied.tracks,
    instances: applied.instances,
    ...(applied.instance.targetTrackId === undefined
      ? {}
      : { selectedTrackId: applied.instance.targetTrackId }),
  });
  const record = await createGameEditorPersistenceRecord(
    "template-project",
    data.tracks,
    1,
    "2026-08-27T00:00:00.000Z",
    undefined,
    [],
    [],
    [],
    undefined,
    data.instances,
  );
  assert(
    await validateGameEditorPersistenceRecord(record),
    "template record must pass persistence validation",
  );
  const store = await GameEditorCanonicalStore.create(record);
  const persisted = store.project.editorTimeline?.templateInstances ?? [];
  assert(
    persisted.length === 2,
    "canonical timeline must retain all template instances",
  );
  assert(
    persisted.some((instance) => instance.templateId === "rpg.weapon"),
    "weapon must survive canonical projection",
  );
});
