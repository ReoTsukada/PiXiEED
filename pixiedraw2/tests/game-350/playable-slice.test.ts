import {
  canEnterGame351Cell,
  createGame351PlayableSnapshot,
  createGame351PlayableState,
  createGame351RpgTemplate,
  createGame351RpgTemplateFromProject,
  createGame351Physics2DScene,
  createGame351Physics2DWorld,
  createGame351Physics2DSession,
  playGame351Physics2DSession,
  stepGame351Physics2DSession,
  stopGame351Physics2DSession,
  restartGame351Physics2DSession,
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
import {
  asBehaviorId,
  asComponentId,
  createGameProject,
  type GameCamera2DSettings,
} from "../../src/game/game-300/core.ts";
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

Deno.test("GAME351-CAMERA-001 reads the editable camera profile from the canonical editor timeline", async () => {
  const template = await createGame351RpgTemplate();
  const camera2D: GameCamera2DSettings = {
    ...template.project.scenes[0]!.entities
      .flatMap((entity) => entity.components)
      .find((component) => component.type === "CAMERA")!.camera2D!,
    referenceWidth: 320,
    shake: {
      ...template.project.scenes[0]!.entities
        .flatMap((entity) => entity.components)
        .find((component) => component.type === "CAMERA")!.camera2D!.shake,
      durationMs: 1000,
    },
  };
  const project = await createGameProject(
    {
      ...template.project,
      editorTimeline: {
        frameCount: 16,
        tracks: [{
          trackId: "camera",
          label: "Main Camera",
          kind: "CAMERA",
          activeFrames: [],
          role: "CAMERA",
          components: [{
            type: "CAMERA",
            componentId: asComponentId("camera-editor-component"),
            active: true,
            zoom: 1,
            camera2D,
          }],
        }],
      },
    },
    template.caller,
  );
  const snapshot = createGame351PlayableSnapshot({ ...template, project });
  assert(
    snapshot.camera2D.referenceWidth === 320 &&
      snapshot.camera2D.shake.durationMs === 1000,
    "Runtime preview must consume camera values edited in the canonical timeline",
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

Deno.test("GAME351-PREVIEW-SESSION-001 isolates Physics2D Preview lifecycle and contacts", async () => {
  const template = await createGame351RpgTemplate();
  const beforeProject = JSON.stringify(template.project);
  let session = playGame351Physics2DSession(createGame351Physics2DSession(template, { settings: { gravity: { x: 0, y: 0 } } }));
  const beforeWorld = JSON.stringify(session.world);
  session = stepGame351Physics2DSession(session, { action: GAME351_INPUT_ACTIONS.MOVE_DOWN });
  const moved = session.world.bodies.find((body) => body.entityId === String(template.playerEntityId))!;
  assert(moved.position.y > 1, "Preview session must move the Physics2D Player");
  for (let index = 0; index < 15; index += 1) session = stepGame351Physics2DSession(session, { action: GAME351_INPUT_ACTIONS.MOVE_DOWN });
  let collisionSeen = false;
  for (let index = 0; index < 40; index += 1) {
    session = stepGame351Physics2DSession(session, { action: GAME351_INPUT_ACTIONS.MOVE_RIGHT });
    collisionSeen ||= session.events.some((event) => event.kind === "COLLISION");
  }
  const blocked = session.world.bodies.find((body) => body.entityId === String(template.playerEntityId))!;
  assert(blocked.position.x < 3, `Physics2D Preview Player must stop at the solid cell (x=${blocked.position.x})`);
  assert(collisionSeen, "solid contact must be exposed by the session");
  assert(JSON.stringify(template.project) === beforeProject && JSON.stringify(session.snapshot) !== "", "session stepping must not mutate the canonical Project");
  const stopped = stopGame351Physics2DSession(session);
  assert(stopped.mode === "STOPPED" && stepGame351Physics2DSession(stopped).world === stopped.world, "Stop must freeze the Preview runtime");
  const restarted = restartGame351Physics2DSession(stopped);
  const resetPlayer = restarted.world.bodies.find((body) => body.entityId === String(template.playerEntityId))!;
  assert(restarted.tick === 0 && resetPlayer.position.x === 1 && resetPlayer.position.y === 1, "Restart must clear runtime movement");
  assert(JSON.stringify(createGame351Physics2DSession(template, { settings: { gravity: { x: 0, y: 0 } } }).world) === beforeWorld, "Restart must be deterministic");
});

Deno.test("GAME351-PREVIEW-SESSION-002 exposes trigger ENTER/STAY/EXIT", async () => {
  const base = await createGame351RpgTemplate();
  const template = { ...base, map: { ...base.map, triggerCells: [{ x: 2, y: 1, triggerId: "preview-trigger" }] } };
  let session = playGame351Physics2DSession(createGame351Physics2DSession(template, { settings: { gravity: { x: 0, y: 0 } } }));
  let phases: string[] = [];
  for (let index = 0; index < 16; index += 1) {
    session = stepGame351Physics2DSession(session, { action: GAME351_INPUT_ACTIONS.MOVE_RIGHT });
    phases = [...phases, ...session.events.filter((event) => event.kind === "TRIGGER").map((event) => event.phase)];
  }
  assert(phases.includes("ENTER"), "enter must be emitted when Player enters a trigger");
  session = stepGame351Physics2DSession(session, { action: null });
  phases = [...phases, ...session.events.filter((event) => event.kind === "TRIGGER").map((event) => event.phase)];
  assert(phases.includes("STAY"), "stay must be emitted while overlap continues");
  for (let index = 0; index < 16; index += 1) {
    session = stepGame351Physics2DSession(session, { action: GAME351_INPUT_ACTIONS.MOVE_LEFT });
    phases = [...phases, ...session.events.filter((event) => event.kind === "TRIGGER").map((event) => event.phase)];
  }
  assert(phases.includes("EXIT"), "exit must be emitted when Player leaves a trigger");
});

Deno.test("GAME351-PREVIEW-SESSION-003 keeps large-map Physics2D bodies inside the runtime chunk window", async () => {
  const base = await createGame351RpgTemplate();
  const cases = [
    { size: 256, center: { x: 128, y: 128 }, inside: { x: 128, y: 128 }, outside: { x: 0, y: 0 } },
    { size: 1024, center: { x: 512, y: 512 }, inside: { x: 512, y: 512 }, outside: { x: 0, y: 0 } },
  ] as const;

  for (const testCase of cases) {
    const map = {
      ...base.map,
      width: testCase.size,
      height: testCase.size,
      bounds: { minX: 0, minY: 0, maxX: testCase.size - 1, maxY: testCase.size - 1 },
      solidCells: [testCase.inside, testCase.outside],
      triggerCells: [{ ...testCase.inside, x: testCase.inside.x + 1, triggerId: `large-map-${testCase.size}` }, { ...testCase.outside, x: testCase.outside.x + 1, triggerId: `outside-${testCase.size}` }],
    };
    const template = { ...base, map };
    const beforeProject = JSON.stringify(template.project);
    const session = createGame351Physics2DSession(template, {
      tilemapCenter: testCase.center,
      tilemapChunkSize: 32,
      tilemapChunkRadius: 1,
    });
    const generatedScene = session.scene.entities.filter((entity) => String(entity.entityId).startsWith("physics2d:"));
    const generatedBodies = session.world.bodies.filter((body) => body.entityId.startsWith("physics2d:"));
    const canonicalBodies = session.world.bodies.filter((body) => !body.entityId.startsWith("physics2d:"));
    assert(generatedScene.length === 6, `only one in-window solid, one trigger, and four boundaries may be projected for ${testCase.size}x${testCase.size}`);
    assert(generatedBodies.length === 6, `Preview Physics2D body count must stay bounded for ${testCase.size}x${testCase.size}`);
    const canonicalEntityIds = new Set(session.scene.entities.filter((entity) => !String(entity.entityId).startsWith("physics2d:")).map((entity) => String(entity.entityId)));
    assert(canonicalBodies.some((body) => body.entityId === String(template.playerEntityId)), "the canonical Player body must remain counted separately from generated tilemap bodies");
    assert(canonicalBodies.every((body) => canonicalEntityIds.has(body.entityId)), "non-generated Physics2D bodies must come only from canonical entities; Camera2D has no body");
    assert(session.world.bodies.length === canonicalBodies.length + 6, "total Preview bodies must be canonical Player/NPC plus the bounded tilemap projection");
    assert(!generatedScene.some((entity) => entity.name.includes(`(${testCase.outside.x},${testCase.outside.y})`) || entity.name.includes(`outside-${testCase.size}`)), "out-of-window Solid/Trigger must not enter the Physics2D Scene");
    assert(JSON.stringify(template.project) === beforeProject, "large-map runtime projection must not mutate the canonical Project");
  }
});
