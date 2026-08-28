import {
  canEnterGame351Cell,
  createGame351PlayableSnapshot,
  createGame351PlayableState,
  createGame351RpgTemplate,
  createGame351RpgTemplateFromProject,
  createGame351Physics2DScene,
  createGame351Physics2DWorld,
  GAME351_INPUT_ACTIONS,
  stepGame351Physics2D,
  GAME351_INTERACT_ACTION,
  playGame351,
  redoGame351Authoring,
  restartGame351,
  stepGame351,
  stopGame351,
  triggerGame351Action,
  undoGame351Authoring,
} from "../../src/game/game-350/playable-slice.ts";
import { asBehaviorId, createGameProject } from "../../src/game/game-300/core.ts";
import { GameEditorCanonicalStore } from "../../src/pixync/game-editor-canonical-store.ts";
import { createGameEditorPersistenceRecord } from "../../src/workspace/game-persistence.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function rebuildTemplateProject(
  template: Awaited<ReturnType<typeof createGame351RpgTemplate>>,
  update: (entity: Awaited<ReturnType<typeof createGame351RpgTemplate>>["project"]["scenes"][number]["entities"][number]) => Awaited<ReturnType<typeof createGame351RpgTemplate>>["project"]["scenes"][number]["entities"][number],
) {
  const project = await createGameProject(
    {
      ...template.project,
      scenes: template.project.scenes.map((scene) => ({
        ...scene,
        entities: scene.entities.map(update),
      })),
    },
    template.caller,
  );
  return { ...template, project };
}

Deno.test("GAME351-TEMPLATE-001 creates a canonical RPG Project and explicit immutable playable snapshot", async () => {
  const template = await createGame351RpgTemplate();
  const snapshot = createGame351PlayableSnapshot(template);
  assert(
    snapshot.projectId === template.project.projectId,
    "snapshot must preserve Project identity",
  );
  assert(
    snapshot.ownerId === template.project.ownerId &&
      snapshot.projectRevisionId === template.project.revision.revisionId,
    "snapshot must preserve owner and revision identity",
  );
  assert(
    snapshot.sceneId === template.sceneId,
    "snapshot must declare Scene identity",
  );
  assert(
    snapshot.playerEntityId === template.playerEntityId &&
      snapshot.playerPosition.x === 1 && snapshot.playerPosition.y === 1,
    "snapshot must declare Player identity and position",
  );
  assert(
    snapshot.npcEntityId === template.npcEntityId &&
      snapshot.npcPosition.x === 5 && snapshot.npcPosition.y === 3,
    "snapshot must declare NPC identity and position",
  );
  assert(
    snapshot.collisionBounds.minX === 0 &&
      snapshot.collisionBounds.minY === 0 &&
      snapshot.collisionBounds.maxX === 7 &&
      snapshot.collisionBounds.maxY === 5,
    "snapshot must declare collision bounds",
  );
  assert(
    snapshot.solidCells.some((cell) => cell.x === 0 && cell.y === 1),
    "map boundary must be solid",
  );
  assert(
    snapshot.solidCells.some((cell) => cell.x === 3 && cell.y === 2),
    "map must contain a solid cell",
  );
  assert(
    !canEnterGame351Cell(snapshot, { x: 0, y: 1 }) &&
      canEnterGame351Cell(snapshot, { x: 1, y: 1 }),
    "walkability must distinguish solid and open cells",
  );
  assert(
    !canEnterGame351Cell(snapshot, snapshot.npcPosition),
    "NPC position must be collision-safe for the Player",
  );
  assert(
    Object.isFrozen(snapshot) && Object.isFrozen(snapshot.playerPosition) &&
      Object.isFrozen(snapshot.solidCells),
    "playable snapshot must be deeply immutable",
  );
  const repeated = createGame351PlayableSnapshot(
    await createGame351RpgTemplate(),
  );
  assert(
    JSON.stringify(snapshot) === JSON.stringify(repeated),
    "the RPG template snapshot must be deterministic",
  );
});

Deno.test("GAME351-PLAYABLE-001 provides fixed-step Play Stop Restart with deterministic collision-safe movement", async () => {
  const template = await createGame351RpgTemplate();
  const initial = createGame351PlayableState(template);
  const playing = playGame351(initial);
  const commands = [
    GAME351_INPUT_ACTIONS.MOVE_RIGHT,
    GAME351_INPUT_ACTIONS.MOVE_RIGHT,
    GAME351_INPUT_ACTIONS.MOVE_DOWN,
    GAME351_INPUT_ACTIONS.MOVE_UP,
    GAME351_INPUT_ACTIONS.MOVE_LEFT,
  ] as const;
  const walk = (start: typeof playing) =>
    commands.reduce(
      (state, action, index) =>
        stepGame351(state, { sequence: index + 1, action }),
      start,
    );
  const first = walk(playing);
  const second = walk(playGame351(createGame351PlayableState(template)));
  assert(
    first.runtime.tick === commands.length && first.runtime.mode === "PLAYING",
    "each accepted input must advance exactly one fixed tick",
  );
  assert(
    first.runtime.playerPosition.x === 2 &&
      first.runtime.playerPosition.y === 1,
    "movement must stop at the solid center cell and remain deterministic",
  );
  assert(
    JSON.stringify(first.runtime) === JSON.stringify(second.runtime),
    "the same input sequence must produce the same runtime result",
  );
  assert(
    playing.runtime.playerPosition.x === 1 &&
      playing.runtime.playerPosition.y === 1 && playing.runtime.tick === 0,
    "step must not mutate its input state",
  );
  const stopped = stopGame351(first);
  const stoppedStep = stepGame351(stopped, {
    sequence: 1,
    action: GAME351_INPUT_ACTIONS.MOVE_RIGHT,
  });
  assert(
    stoppedStep.runtime.tick === stopped.runtime.tick &&
      stoppedStep.runtime.playerPosition.x === stopped.runtime.playerPosition.x,
    "stopped runtime must not consume input",
  );
  const restarted = restartGame351(stopped);
  assert(
    restarted.runtime.mode === "STOPPED" && restarted.runtime.tick === 0 &&
      restarted.runtime.playerPosition.x === 1 &&
      restarted.runtime.playerPosition.y === 1,
    "Restart must return to the initial snapshot",
  );
  const activeRestart = restartGame351(first);
  assert(
    activeRestart.runtime.mode === "PLAYING" &&
      activeRestart.runtime.tick === 0 &&
      activeRestart.runtime.playerPosition.x === 1,
    "Restart must preserve the active lifecycle mode while resetting runtime",
  );
});

Deno.test("GAME351-JOURNAL-001 keeps Play runtime changes outside the canonical GAME-300 Journal", async () => {
  const template = await createGame351RpgTemplate();
  const initial = createGame351PlayableState(template);
  const beforeProject = JSON.stringify(initial.journal.current);
  const beforeHistory = JSON.stringify({
    sequence: initial.journal.sequence,
    past: initial.journal.past,
    future: initial.journal.future,
  });
  const moved = stepGame351(playGame351(initial), {
    sequence: 1,
    action: GAME351_INPUT_ACTIONS.MOVE_RIGHT,
  });
  assert(
    moved.runtime.playerPosition.x === 2,
    "fixture must produce a runtime-only movement",
  );
  assert(
    JSON.stringify(initial.journal.current) === beforeProject &&
      JSON.stringify(moved.journal.current) === beforeProject,
    "Play must not mutate canonical Project",
  );
  assert(
    JSON.stringify({
      sequence: moved.journal.sequence,
      past: moved.journal.past,
      future: moved.journal.future,
    }) === beforeHistory,
    "Play must not append to edit history",
  );
  const undone = undoGame351Authoring(moved);
  const redone = redoGame351Authoring(undone);
  assert(
    undone.runtime.playerPosition.x === moved.runtime.playerPosition.x &&
      redone.runtime.playerPosition.x === moved.runtime.playerPosition.x,
    "authoring undo/redo must not alter runtime state",
  );
  assert(
    undone.journal.current === moved.journal.current &&
      redone.journal.current === moved.journal.current,
    "authoring undo/redo must reuse the existing Journal boundary",
  );
});

Deno.test("GAME351-EVENT-001 executes a saved no-code interaction without changing edit history", async () => {
  const template = await createGame351RpgTemplate();
  const behavior = {
    behaviorId: asBehaviorId("behavior:pixiedraw-game:enemy"),
    version: 1 as const,
    ownership: "CANONICAL_IR" as const,
    rules: [{
      ruleId: "enemy-event",
      enabled: true,
      trigger: { type: "ACTION" as const, actionId: "rpg.interact" },
      conditions: [{ kind: "ALWAYS" as const }],
      actions: [{
        kind: "SET_VARIABLE" as const,
        targetId: "enemy",
        property: "dialogue",
        value: "Welcome to the RPG slice.",
      }],
    }],
  };
  let state = playGame351(createGame351PlayableState(template));
  for (
    const [sequence, action] of [
      GAME351_INPUT_ACTIONS.MOVE_RIGHT,
      GAME351_INPUT_ACTIONS.MOVE_RIGHT,
      GAME351_INPUT_ACTIONS.MOVE_RIGHT,
      GAME351_INPUT_ACTIONS.MOVE_RIGHT,
      GAME351_INPUT_ACTIONS.MOVE_DOWN,
    ].entries()
  ) {
    state = stepGame351(state, { sequence: sequence + 1, action });
  }
  const beforeJournal = JSON.stringify(state.journal);
  const interacted = triggerGame351Action(
    state,
    String(GAME351_INTERACT_ACTION),
    [behavior],
  );
  assert(
    interacted.runtime.playerPosition.x === 5 &&
      interacted.runtime.playerPosition.y === 2,
    "the Player must stand beside the NPC before interacting",
  );
  assert(
    interacted.runtime.dialogue === "Welcome to the RPG slice.",
    "the no-code action must set the runtime dialogue",
  );
  assert(
    JSON.stringify(interacted.journal) === beforeJournal,
    "runtime event execution must not append to the authoring Journal",
  );
});

Deno.test("GAME351-STUDIO-001 binds the playable preview to the canonical Studio Project identity", async () => {
  const record = await createGameEditorPersistenceRecord(
    "studio-game-project",
    [
      { id: "hero", label: "Player", kind: "SPRITE", filled: [] },
      { id: "enemy", label: "Guide NPC", kind: "SPRITE", filled: [] },
      { id: "tilemap", label: "RPG Map", kind: "TILEMAP", filled: [] },
    ],
    1,
  );
  const canonical = await GameEditorCanonicalStore.create(record);
  const template = createGame351RpgTemplateFromProject(canonical.project);
  const snapshot = createGame351PlayableSnapshot(template);
  assert(
    snapshot.projectId === canonical.project.projectId &&
      snapshot.projectHash === canonical.project.revision.snapshotHash &&
      snapshot.projectRevisionId === canonical.project.revision.revisionId,
    "Studio preview must retain the canonical Project identity and hash",
  );
  assert(
    snapshot.playerPosition.x === 1 && snapshot.playerPosition.y === 1 &&
      snapshot.npcPosition.x === 5 && snapshot.npcPosition.y === 3,
    "Studio preview must read the canonical Player/NPC transforms",
  );
});

Deno.test("GAME351-NONINTRUSION-001 keeps the slice host-neutral and source/project state isolated", async () => {
  const state = createGame351PlayableState(await createGame351RpgTemplate());
  const snapshotBefore = JSON.stringify(state.snapshot);
  const runtimeBefore = JSON.stringify(state.runtime);
  const next = stepGame351(playGame351(state), {
    sequence: 1,
    action: GAME351_INPUT_ACTIONS.MOVE_RIGHT,
  });
  assert(
    JSON.stringify(state.snapshot) === snapshotBefore &&
      JSON.stringify(state.runtime) === runtimeBefore,
    "runtime stepping must not mutate snapshot or source state",
  );
  assert(
    next.snapshot === state.snapshot && next.journal === state.journal,
    "runtime state must retain immutable snapshot and canonical Journal references",
  );
});

Deno.test("GAME351-PHYSICS2D-001 projects canonical entities, solid cells, and stable map boundaries", async () => {
  const template = await createGame351RpgTemplate();
  const scene = createGame351Physics2DScene(template);
  const generated = scene.entities.filter((entity) =>
    String(entity.entityId).startsWith("physics2d:")
  );
  assert(
    generated.length === template.map.solidCells.length + 4,
    "Physics2D scene must add one body per solid cell and four map boundaries",
  );
  assert(
    scene.entities.some((entity) => entity.entityId === template.playerEntityId &&
      entity.components.some((component) =>
        component.type === "COLLIDER" &&
        component.componentId === "game351-rpg-player-collider"
      )),
    "canonical Player Collider must be projected without replacement",
  );
  assert(
    generated.every((entity) =>
      entity.components.some((component) =>
        component.type === "RIGIDBODY" && component.bodyType === "STATIC"
      )
    ),
    "generated map bodies must be static",
  );
  const first = createGame351Physics2DWorld(template);
  const second = createGame351Physics2DWorld(await createGame351RpgTemplate());
  assert(
    JSON.stringify(first) === JSON.stringify(second),
    "the canonical Physics2D World must be deterministic",
  );
  assert(
    Object.isFrozen(first) && Object.isFrozen(first.bodies),
    "Physics2D World must be immutable",
  );
});

Deno.test("GAME351-PHYSICS2D-002 applies directional speed and gravity while blocking solid cells", async () => {
  const template = await createGame351RpgTemplate();
  let world = createGame351Physics2DWorld(template, {
    settings: { gravity: { x: 0, y: 0 } },
  });
  let collisionSeen = false;
  for (let index = 0; index < 15; index += 1) {
    const stepped = stepGame351Physics2D(world, {
      action: GAME351_INPUT_ACTIONS.MOVE_DOWN,
    });
    world = stepped.world;
  }
  for (let index = 0; index < 40; index += 1) {
    const stepped = stepGame351Physics2D(world, {
      action: GAME351_INPUT_ACTIONS.MOVE_RIGHT,
    });
    collisionSeen ||= stepped.events.some((event) => event.kind === "COLLISION");
    world = stepped.world;
  }
  const player = world.bodies.find((body) =>
    body.entityId === String(template.playerEntityId)
  )!;
  assert(player.position.x < 3, "dynamic Player must stop before the solid cell");
  assert(collisionSeen, "solid cell contact must produce a COLLISION event");
  const repeated = stepGame351Physics2D(
    createGame351Physics2DWorld(template, { settings: { gravity: { x: 0, y: 0 } } }),
    { action: GAME351_INPUT_ACTIONS.MOVE_RIGHT },
  );
  const repeatedAgain = stepGame351Physics2D(
    createGame351Physics2DWorld(await createGame351RpgTemplate(), { settings: { gravity: { x: 0, y: 0 } } }),
    { action: GAME351_INPUT_ACTIONS.MOVE_RIGHT },
  );
  assert(
    JSON.stringify(repeated) === JSON.stringify(repeatedAgain),
    "one Physics2D input step must be deterministic and non-mutating",
  );

  const gravityTemplate = await rebuildTemplateProject(template, (entity) => ({
    ...entity,
    components: entity.components.map((component) =>
      entity.entityId === template.playerEntityId && component.type === "RIGIDBODY"
        ? { ...component, gravityScale: 1 }
        : component
    ),
  }));
  const gravityWorld = createGame351Physics2DWorld(gravityTemplate, {
    settings: { gravity: { x: 0, y: 60 } },
  });
  const gravityStep = stepGame351Physics2D(gravityWorld);
  const gravityPlayer = gravityStep.world.bodies.find((body) =>
    body.entityId === String(gravityTemplate.playerEntityId)
  )!;
  assert(
    gravityPlayer.gravityScale === 1 && gravityPlayer.position.y > 1,
    "dynamic Player must follow canonical gravityScale and Physics2D gravity",
  );
});

Deno.test("GAME351-PHYSICS2D-003 distinguishes canonical NPC trigger events from blocking collisions", async () => {
  const template = await createGame351RpgTemplate();
  const triggerTemplate = await rebuildTemplateProject(template, (entity) => ({
    ...entity,
    components: entity.components.map((component) =>
      entity.entityId === template.npcEntityId && component.type === "COLLIDER"
        ? { ...component, isTrigger: true }
        : component
    ),
  }));
  let world = createGame351Physics2DWorld(triggerTemplate, {
    settings: { gravity: { x: 0, y: 0 } },
  });
  let triggerSeen = false;
  for (let index = 0; index < 62; index += 1) {
    const stepped = stepGame351Physics2D(world, {
      action: GAME351_INPUT_ACTIONS.MOVE_RIGHT,
    });
    world = stepped.world;
  }
  for (let index = 0; index < 32; index += 1) {
    const stepped = stepGame351Physics2D(world, {
      action: GAME351_INPUT_ACTIONS.MOVE_DOWN,
    });
    triggerSeen ||= stepped.events.some((event) => event.kind === "TRIGGER");
    world = stepped.world;
  }
  assert(triggerSeen, "canonical NPC trigger overlap must produce a TRIGGER event");
  assert(
    !world.activeContactIds.some((id) => id.startsWith("COLLISION|") && id.includes(String(triggerTemplate.npcEntityId))),
    "NPC trigger must not become a blocking COLLISION contact",
  );
});
