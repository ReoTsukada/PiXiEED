import {
  advancePhysics2D,
  colliderAABB,
  createPhysics2DWorld,
  DEFAULT_PHYSICS_2D_SETTINGS,
  stepPhysics2D,
  validatePhysics2DScene,
  validatePhysics2DSettings,
  type Physics2DScene,
} from "../../src/game/game-350/physics-2d.ts";
import {
  asComponentId,
  asEntityId,
  asSceneId,
} from "../../src/game/game-300/core.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function transform(id: string, x: number, y: number) {
  return { type: "TRANSFORM" as const, componentId: asComponentId(`${id}:transform`), x, y, rotation: 0, scaleX: 1, scaleY: 1 };
}

function collider(id: string, layer: "WORLD" | "PLAYER" | "SENSOR", options: Record<string, unknown> = {}) {
  return { type: "COLLIDER" as const, componentId: asComponentId(`${id}:collider`), shape: "BOX" as const, width: 1, height: 1, radius: 0.5, isTrigger: false, layer, enabled: true, ...options };
}

function rigidbody(id: string, bodyType: "STATIC" | "DYNAMIC" | "KINEMATIC", options: Record<string, unknown> = {}) {
  return { type: "RIGIDBODY" as const, componentId: asComponentId(`${id}:rigidbody`), bodyType, mass: 1, gravityScale: bodyType === "DYNAMIC" ? 1 : 0, fixedRotation: true, enabled: true, ...options };
}

function scene(entities: Physics2DScene["entities"], settings: Physics2DScene["physics2D"] = { gravity: { x: 0, y: 0 } }): Physics2DScene {
  return { sceneId: asSceneId("scene:game350-physics"), name: "Physics", rootEntityIds: entities.map((entity) => entity.entityId), entities, physics2D: settings };
}

Deno.test("GAME350-PHYSICS-001 exposes bounded defaults and safe collider bounds", () => {
  assert(DEFAULT_PHYSICS_2D_SETTINGS.gravity.y === 9.8 && DEFAULT_PHYSICS_2D_SETTINGS.fixedDeltaTime === 1 / 60 && DEFAULT_PHYSICS_2D_SETTINGS.maxSubSteps === 4, "Physics2D defaults must be stable");
  assert(validatePhysics2DSettings(DEFAULT_PHYSICS_2D_SETTINGS).valid, "default settings must validate");
  assert(!validatePhysics2DSettings({ ...DEFAULT_PHYSICS_2D_SETTINGS, fixedDeltaTime: 0 }).valid, "invalid fixed step must fail");
  const world = createPhysics2DWorld(scene([{ entityId: asEntityId("entity:circle"), name: "Circle", components: [transform("circle", 2, 3), { ...collider("circle", "WORLD", { shape: "CIRCLE", radius: 2 }) }] }]));
  const body = world.bodies[0]!;
  const bounds = colliderAABB(body);
  assert(bounds.minX === 0 && bounds.maxX === 4 && bounds.minY === 1 && bounds.maxY === 5, "Circle must project to an AABB-safe bound");
  const scaled = { ...body, scale: { x: 2, y: 0.5 } };
  const scaledBounds = colliderAABB(scaled, scaled.scale);
  assert(scaledBounds.minX === -2 && scaledBounds.maxX === 6 && scaledBounds.minY === 2 && scaledBounds.maxY === 4, "Transform scale must be included in the safe bound");
  let rejected = false;
  try { createPhysics2DWorld(scene([{ entityId: asEntityId("bad"), name: "Bad", components: [transform("bad", 0, 0), collider("bad", "WORLD", { mask: ["NOPE"] })] }])); } catch { rejected = true; }
  assert(rejected, "invalid layer masks must be rejected instead of silently defaulted");
  assert(!validatePhysics2DScene(scene([{ entityId: asEntityId("bad-material"), name: "Bad Material", components: [transform("bad-material", 0, 0), collider("bad-material", "WORLD", { material: { friction: 2, bounciness: 0 } })] }])).valid, "invalid material values must be rejected");
  const duplicateComponent = scene([{ entityId: asEntityId("duplicate"), name: "Duplicate", components: [transform("duplicate", 0, 0), transform("duplicate-2", 0, 0)] }]);
  assert(!validatePhysics2DScene(duplicateComponent).valid, "duplicate component types must be rejected");
});

Deno.test("GAME350-PHYSICS-002 applies gravity, drag, constraints and deterministic static-wall resolution", () => {
  const source = scene([
    { entityId: asEntityId("wall"), name: "Wall", components: [transform("wall", 0, 1), collider("wall", "WORLD")] },
    { entityId: asEntityId("player"), name: "Player", components: [transform("player", 0, 0), collider("player", "PLAYER"), rigidbody("player", "DYNAMIC", { linearDrag: 1, freezePosition: { x: true, y: false } })] },
    { entityId: asEntityId("kinematic"), name: "Kinematic", components: [transform("kinematic", 3, 0), collider("kinematic", "WORLD"), rigidbody("kinematic", "KINEMATIC")] },
  ]);
  const initial = createPhysics2DWorld(source, { gravity: { x: 0, y: 9.8 } });
  const stepped = stepPhysics2D(initial, { velocityByEntityId: { player: { x: 10, y: 60 }, kinematic: { x: 6, y: 0 } } }).world;
  const player = stepped.bodies.find((body) => body.entityId === "player")!;
  const wall = stepped.bodies.find((body) => body.entityId === "wall")!;
  const kinematic = stepped.bodies.find((body) => body.entityId === "kinematic")!;
  assert(player.position.x === 0 && player.position.y <= 0.000001, "freeze X and static wall must constrain the dynamic body");
  assert(wall.position.x === 0 && wall.position.y === 1, "static wall must remain fixed");
  assert(kinematic.position.x > 3, "kinematic body must accept explicit fixed-step motion");
  const repeated = stepPhysics2D(initial, { velocityByEntityId: { player: { x: 10, y: 60 }, kinematic: { x: 6, y: 0 } } }).world;
  assert(JSON.stringify(stepped) === JSON.stringify(repeated), "same input must produce the same world");
  assert(JSON.stringify(initial) !== JSON.stringify(stepped), "step must not mutate the input world");
});

Deno.test("GAME350-PHYSICS-003 separates blocking and trigger contacts with enter/stay/exit", () => {
  const triggerScene = scene([
    { entityId: asEntityId("trigger"), name: "Trigger", components: [transform("trigger", 0, 0), collider("trigger", "SENSOR", { isTrigger: true })] },
    { entityId: asEntityId("body"), name: "Body", components: [transform("body", 0, 0), collider("body", "PLAYER"), rigidbody("body", "DYNAMIC", { gravityScale: 0 })] },
  ]);
  const initial = createPhysics2DWorld(triggerScene);
  const first = stepPhysics2D(initial);
  assert(first.events.length === 1 && first.events[0]?.kind === "TRIGGER" && first.events[0]?.phase === "ENTER" && first.events[0]?.entityA === "body" && first.events[0]?.entityB === "trigger", "overlap must emit one trigger enter in stable ID order");
  const second = stepPhysics2D(first.world);
  assert(second.events.length === 1 && second.events[0]?.phase === "STAY", "continued overlap must emit trigger stay");
  const third = stepPhysics2D(second.world, { velocityByEntityId: { body: { x: 120, y: 0 } } });
  assert(third.events.length === 1 && third.events[0]?.phase === "EXIT", "separation must emit trigger exit");

  const blocked = stepPhysics2D(createPhysics2DWorld(scene([
    { entityId: asEntityId("wall"), name: "Wall", components: [transform("wall", 0, 0), collider("wall", "WORLD")] },
    { entityId: asEntityId("body"), name: "Body", components: [transform("body", 0, 0), collider("body", "PLAYER"), rigidbody("body", "DYNAMIC", { gravityScale: 0 })] },
  ])));
  assert(blocked.events[0]?.kind === "COLLISION", "blocking overlap must be a collision event");
});

Deno.test("GAME350-PHYSICS-004 respects layer masks and clamps accumulator catch-up", () => {
  const masked = createPhysics2DWorld(scene([
    { entityId: asEntityId("wall"), name: "Wall", components: [transform("wall", 0, 0), collider("wall", "WORLD", { mask: [] })] },
    { entityId: asEntityId("body"), name: "Body", components: [transform("body", 0, 0), collider("body", "PLAYER", { mask: ["WORLD"] }), rigidbody("body", "DYNAMIC", { gravityScale: 0 })] },
  ]));
  assert(stepPhysics2D(masked).events.length === 0, "layer masks must disable pair evaluation");
  const world = createPhysics2DWorld(scene([]), { gravity: { x: 0, y: 0 }, fixedDeltaTime: 0.1, maxSubSteps: 2 });
  const advanced = advancePhysics2D(world, 10);
  assert(advanced.steps === 2 && advanced.droppedTime > 9, "catch-up must be hard-clamped to maxSubSteps");
  assert(advanced.world.tick === 2 && advanced.world.accumulator === 0, "clamped advance must remain bounded and deterministic");
});
