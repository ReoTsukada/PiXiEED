/**
 * GAME-350 deterministic, host-neutral 2D physics.
 *
 * This is deliberately a bounded AABB solver.  Box, Circle and Capsule
 * colliders are projected to safe bounds so authoring stays predictable while
 * a later narrow-phase can be introduced without changing the Scene contract.
 */

import type {
  ColliderComponent,
  Component,
  Entity,
  GameCollisionLayer,
  RigidbodyComponent,
  Scene,
  TransformComponent,
} from "../game-300/core.ts";

export interface Physics2DVector {
  readonly x: number;
  readonly y: number;
}

export interface Physics2DMaterial {
  readonly friction: number;
  readonly bounciness: number;
}

export interface Physics2DSettings {
  readonly gravity: Physics2DVector;
  readonly fixedDeltaTime: number;
  readonly maxSubSteps: number;
  readonly defaultMaterial: Physics2DMaterial;
}

export const GAME350_PHYSICS_LAYER_BITS: Readonly<Record<GameCollisionLayer, number>> = Object.freeze({
  DEFAULT: 1 << 0,
  WORLD: 1 << 1,
  PLAYER: 1 << 2,
  NPC: 1 << 3,
  SENSOR: 1 << 4,
  PROJECTILE: 1 << 5,
});

export const DEFAULT_PHYSICS_2D_SETTINGS: Physics2DSettings = Object.freeze({
  gravity: Object.freeze({ x: 0, y: 9.8 }),
  fixedDeltaTime: 1 / 60,
  maxSubSteps: 4,
  defaultMaterial: Object.freeze({ friction: 0.4, bounciness: 0 }),
});

export type Physics2DCollisionDetection = "DISCRETE" | "CONTINUOUS";
export type Physics2DInterpolation = "NONE" | "INTERPOLATE";

export interface Physics2DRigidbodyOptions extends RigidbodyComponent {
  readonly linearDrag?: number;
  readonly angularDrag?: number;
  readonly freezePosition?: { readonly x: boolean; readonly y: boolean };
  readonly freezePositionX?: boolean;
  readonly freezePositionY?: boolean;
  readonly freezeRotation?: boolean;
  readonly simulated?: boolean;
  readonly collisionDetection?: Physics2DCollisionDetection;
  readonly interpolation?: Physics2DInterpolation;
}

export interface Physics2DColliderOptions extends ColliderComponent {
  readonly offset?: Physics2DVector;
  readonly mask?: readonly GameCollisionLayer[] | number;
  readonly material?: Physics2DMaterial;
}

export type Physics2DComponent = Component | Physics2DRigidbodyOptions | Physics2DColliderOptions;

export type Physics2DEntity = Omit<Entity, "components"> & {
  readonly active?: boolean;
  readonly components: readonly Physics2DComponent[];
};

export type Physics2DScene = Omit<Scene, "entities"> & {
  readonly physics2D?: Partial<Physics2DSettings>;
  readonly entities: readonly Physics2DEntity[];
};

export interface Physics2DAABB {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface Physics2DBody {
  readonly entityId: string;
  readonly componentId: string;
  readonly bodyType: "STATIC" | "DYNAMIC" | "KINEMATIC";
  readonly position: Physics2DVector;
  readonly scale: Physics2DVector;
  readonly velocity: Physics2DVector;
  readonly angle: number;
  readonly angularVelocity: number;
  readonly mass: number;
  readonly gravityScale: number;
  readonly linearDrag: number;
  readonly angularDrag: number;
  readonly freezePosition: { readonly x: boolean; readonly y: boolean };
  readonly freezeRotation: boolean;
  readonly simulated: boolean;
  readonly collisionDetection: Physics2DCollisionDetection;
  readonly interpolation: Physics2DInterpolation;
  readonly collider: Physics2DColliderOptions;
}

export interface Physics2DContact {
  readonly id: string;
  readonly kind: "COLLISION" | "TRIGGER";
  readonly phase: "ENTER" | "STAY" | "EXIT";
  readonly entityA: string;
  readonly entityB: string;
}

export interface Physics2DWorld {
  readonly settings: Physics2DSettings;
  readonly bodies: readonly Physics2DBody[];
  readonly activeContactIds: readonly string[];
  readonly tick: number;
  readonly accumulator: number;
}

export interface Physics2DStepInput {
  readonly velocityByEntityId?: Readonly<Record<string, Physics2DVector>>;
  readonly forceByEntityId?: Readonly<Record<string, Physics2DVector>>;
  readonly angularVelocityByEntityId?: Readonly<Record<string, number>>;
}

export interface Physics2DStepResult {
  readonly world: Physics2DWorld;
  readonly events: readonly Physics2DContact[];
}

export interface Physics2DAdvanceResult {
  readonly world: Physics2DWorld;
  readonly events: readonly Physics2DContact[];
  readonly steps: number;
  readonly droppedTime: number;
}

export interface Physics2DValidation {
  readonly valid: boolean;
  readonly diagnostics: readonly string[];
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  }
  return value;
}

function vector(x: number, y: number): Physics2DVector {
  return { x, y };
}

function finiteVector(value: unknown): value is Physics2DVector {
  return value !== null && typeof value === "object" &&
    typeof (value as Record<string, unknown>).x === "number" &&
    Number.isFinite((value as Record<string, unknown>).x) &&
    typeof (value as Record<string, unknown>).y === "number" &&
    Number.isFinite((value as Record<string, unknown>).y);
}

function record(component: Physics2DComponent): Record<string, unknown> {
  return component as unknown as Record<string, unknown>;
}

function componentOf<T extends Physics2DComponent["type"]>(
  entity: Physics2DEntity,
  type: T,
): Extract<Physics2DComponent, { readonly type: T }> | undefined {
  return entity.components.find((component) => component.type === type) as Extract<Physics2DComponent, { readonly type: T }> | undefined;
}

function settingsWithDefaults(settings?: Partial<Physics2DSettings>): Physics2DSettings {
  return {
    gravity: { ...DEFAULT_PHYSICS_2D_SETTINGS.gravity, ...(settings?.gravity ?? {}) },
    fixedDeltaTime: settings?.fixedDeltaTime ?? DEFAULT_PHYSICS_2D_SETTINGS.fixedDeltaTime,
    maxSubSteps: settings?.maxSubSteps ?? DEFAULT_PHYSICS_2D_SETTINGS.maxSubSteps,
    defaultMaterial: { ...DEFAULT_PHYSICS_2D_SETTINGS.defaultMaterial, ...(settings?.defaultMaterial ?? {}) },
  };
}

export function validatePhysics2DSettings(value: unknown): Physics2DValidation {
  const diagnostics: string[] = [];
  if (value === null || typeof value !== "object") return { valid: false, diagnostics: ["settings"] };
  const candidate = value as Record<string, unknown>;
  if (!finiteVector(candidate.gravity)) diagnostics.push("gravity");
  if (typeof candidate.fixedDeltaTime !== "number" || !Number.isFinite(candidate.fixedDeltaTime) || candidate.fixedDeltaTime <= 0 || candidate.fixedDeltaTime > 1) diagnostics.push("fixedDeltaTime");
  if (!Number.isSafeInteger(candidate.maxSubSteps) || Number(candidate.maxSubSteps) < 1 || Number(candidate.maxSubSteps) > 32) diagnostics.push("maxSubSteps");
  const material = candidate.defaultMaterial;
  if (material === null || typeof material !== "object") diagnostics.push("defaultMaterial");
  else {
    const m = material as Record<string, unknown>;
    if (typeof m.friction !== "number" || !Number.isFinite(m.friction) || m.friction < 0 || m.friction > 1) diagnostics.push("defaultMaterial.friction");
    if (typeof m.bounciness !== "number" || !Number.isFinite(m.bounciness) || m.bounciness < 0 || m.bounciness > 1) diagnostics.push("defaultMaterial.bounciness");
  }
  return { valid: diagnostics.length === 0, diagnostics };
}

export function normalizePhysics2DSettings(settings?: Partial<Physics2DSettings>): Physics2DSettings {
  const normalized = settingsWithDefaults(settings);
  const checked = validatePhysics2DSettings(normalized);
  if (!checked.valid) throw new Error(`Invalid Physics2D settings: ${checked.diagnostics.join(",")}`);
  return freezeDeep(normalized);
}

function validMaterial(value: unknown, fallback: Physics2DMaterial): Physics2DMaterial {
  if (value === null || typeof value !== "object") return fallback;
  const candidate = value as Record<string, unknown>;
  const material = {
    friction: typeof candidate.friction === "number" ? candidate.friction : fallback.friction,
    bounciness: typeof candidate.bounciness === "number" ? candidate.bounciness : fallback.bounciness,
  };
  if (material.friction < 0 || material.friction > 1 || material.bounciness < 0 || material.bounciness > 1 || !Number.isFinite(material.friction) || !Number.isFinite(material.bounciness)) throw new Error("Physics2D material values must be between 0 and 1.");
  return material;
}

function layerMask(value: unknown): number {
  if (value === undefined) return 0x3f;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 0x3f) return value;
  if (Array.isArray(value) && value.every((item) => Object.hasOwn(GAME350_PHYSICS_LAYER_BITS, item))) {
    return value.reduce((mask, item) => mask | GAME350_PHYSICS_LAYER_BITS[item as GameCollisionLayer], 0);
  }
  throw new Error("Physics2D collider mask is invalid.");
}

function validatePhysicsBody(entity: Physics2DEntity, diagnostics: string[]): void {
  const transform = componentOf(entity, "TRANSFORM");
  if (transform !== undefined && ![transform.x, transform.y, transform.rotation, transform.scaleX, transform.scaleY].every((item) => typeof item === "number" && Number.isFinite(item))) diagnostics.push(`${String(entity.entityId)}.transform`);
  const collider = componentOf(entity, "COLLIDER");
  if (collider !== undefined) {
    if (!["BOX", "CIRCLE", "CAPSULE"].includes(collider.shape) || ![collider.width, collider.height, collider.radius].every((item) => typeof item === "number" && Number.isFinite(item) && item > 0)) diagnostics.push(`${String(entity.entityId)}.collider.shape`);
    if (!Object.hasOwn(GAME350_PHYSICS_LAYER_BITS, collider.layer) || typeof collider.isTrigger !== "boolean" || typeof collider.enabled !== "boolean") diagnostics.push(`${String(entity.entityId)}.collider`);
    const value = record(collider);
    if (value.offset !== undefined && !finiteVector(value.offset)) diagnostics.push(`${String(entity.entityId)}.collider.offset`);
    try { layerMask(value.mask); } catch { diagnostics.push(`${String(entity.entityId)}.collider.mask`); }
    try { validMaterial(value.material, DEFAULT_PHYSICS_2D_SETTINGS.defaultMaterial); } catch { diagnostics.push(`${String(entity.entityId)}.collider.material`); }
  }
  const rigidbody = rigidbodyOf(entity);
  if (rigidbody !== undefined) {
    const value = record(rigidbody);
    if (!["STATIC", "DYNAMIC", "KINEMATIC"].includes(rigidbody.bodyType) || typeof rigidbody.mass !== "number" || !Number.isFinite(rigidbody.mass) || rigidbody.mass <= 0 || typeof rigidbody.gravityScale !== "number" || !Number.isFinite(rigidbody.gravityScale) || typeof rigidbody.fixedRotation !== "boolean" || typeof rigidbody.enabled !== "boolean") diagnostics.push(`${String(entity.entityId)}.rigidbody`);
    for (const key of ["linearDrag", "angularDrag"]) if (value[key] !== undefined && (typeof value[key] !== "number" || !Number.isFinite(value[key]) || Number(value[key]) < 0)) diagnostics.push(`${String(entity.entityId)}.rigidbody.${key}`);
    if (value.freezePosition !== undefined && (value.freezePosition === null || typeof value.freezePosition !== "object" || typeof (value.freezePosition as Record<string, unknown>).x !== "boolean" || typeof (value.freezePosition as Record<string, unknown>).y !== "boolean")) diagnostics.push(`${String(entity.entityId)}.rigidbody.freezePosition`);
    for (const key of ["freezePositionX", "freezePositionY", "freezeRotation", "simulated"]) if (value[key] !== undefined && typeof value[key] !== "boolean") diagnostics.push(`${String(entity.entityId)}.rigidbody.${key}`);
    if (value.collisionDetection !== undefined && value.collisionDetection !== "DISCRETE" && value.collisionDetection !== "CONTINUOUS") diagnostics.push(`${String(entity.entityId)}.rigidbody.collisionDetection`);
    if (value.interpolation !== undefined && value.interpolation !== "NONE" && value.interpolation !== "INTERPOLATE") diagnostics.push(`${String(entity.entityId)}.rigidbody.interpolation`);
  }
}

export function validatePhysics2DScene(scene: Physics2DScene | Scene): Physics2DValidation {
  const diagnostics: string[] = [];
  const entityIds = new Set<string>();
  try {
    validatePhysics2DSettings(settingsWithDefaults((scene as Physics2DScene).physics2D));
    const settings = settingsWithDefaults((scene as Physics2DScene).physics2D);
    const settingsValidation = validatePhysics2DSettings(settings);
    if (!settingsValidation.valid) diagnostics.push(...settingsValidation.diagnostics);
  } catch {
    diagnostics.push("settings");
  }
  for (const entity of scene.entities as readonly Physics2DEntity[]) {
    const entityKey = String(entity.entityId);
    if (entityIds.has(entityKey)) diagnostics.push(`${entityKey}.entityId`);
    entityIds.add(entityKey);
    const componentIds = new Set<string>();
    const componentTypes = new Set<string>();
    for (const component of entity.components) {
      const componentKey = String(component.componentId);
      if (componentIds.has(componentKey)) diagnostics.push(`${entityKey}.componentId`);
      componentIds.add(componentKey);
      if (componentTypes.has(component.type)) diagnostics.push(`${entityKey}.duplicate.${component.type}`);
      componentTypes.add(component.type);
    }
    validatePhysicsBody(entity, diagnostics);
  }
  return { valid: diagnostics.length === 0, diagnostics };
}

function transformOf(entity: Physics2DEntity): TransformComponent {
  const candidate = componentOf(entity, "TRANSFORM");
  return candidate ?? { type: "TRANSFORM", componentId: "physics2d:implicit-transform" as TransformComponent["componentId"], x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
}

function colliderOf(entity: Physics2DEntity, settings: Physics2DSettings): Physics2DColliderOptions | undefined {
  const candidate = componentOf(entity, "COLLIDER");
  if (candidate === undefined) return undefined;
  const value = record(candidate);
  const offset = finiteVector(value.offset) ? value.offset : vector(0, 0);
  return {
    ...candidate,
    offset,
    mask: layerMask(value.mask),
    material: validMaterial(value.material, settings.defaultMaterial),
  };
}

function rigidbodyOf(entity: Physics2DEntity): Physics2DRigidbodyOptions | undefined {
  const candidate = componentOf(entity, "RIGIDBODY");
  return candidate as Physics2DRigidbodyOptions | undefined;
}

function bodyFromEntity(entity: Physics2DEntity, settings: Physics2DSettings): Physics2DBody | undefined {
  if (entity.active === false) return undefined;
  const collider = colliderOf(entity, settings);
  if (collider === undefined || collider.enabled === false) return undefined;
  const transform = transformOf(entity);
  const rb = rigidbodyOf(entity);
  const value = rb === undefined ? {} : record(rb);
  const freezePositionValue = value.freezePosition;
  const freezePosition = freezePositionValue !== null && typeof freezePositionValue === "object"
    ? { x: Boolean((freezePositionValue as Record<string, unknown>).x), y: Boolean((freezePositionValue as Record<string, unknown>).y) }
    : { x: Boolean(value.freezePositionX), y: Boolean(value.freezePositionY) };
  const bodyType = rb?.bodyType ?? "STATIC";
  return freezeDeep({
    entityId: String(entity.entityId),
    componentId: String(collider.componentId),
    bodyType,
    position: vector(transform.x, transform.y),
    scale: vector(transform.scaleX, transform.scaleY),
    velocity: vector(0, 0),
    angle: transform.rotation,
    angularVelocity: 0,
    mass: rb?.mass ?? 1,
    gravityScale: rb?.gravityScale ?? 0,
    linearDrag: typeof value.linearDrag === "number" && Number.isFinite(value.linearDrag) && value.linearDrag >= 0 ? value.linearDrag : 0,
    angularDrag: typeof value.angularDrag === "number" && Number.isFinite(value.angularDrag) && value.angularDrag >= 0 ? value.angularDrag : 0,
    freezePosition,
    freezeRotation: Boolean(value.freezeRotation ?? rb?.fixedRotation ?? false),
    simulated: value.simulated !== false && rb?.enabled !== false,
    collisionDetection: value.collisionDetection === "CONTINUOUS" ? "CONTINUOUS" : "DISCRETE",
    interpolation: value.interpolation === "INTERPOLATE" ? "INTERPOLATE" : "NONE",
    collider,
  });
}

export function createPhysics2DWorld(scene: Physics2DScene | Scene, settings?: Partial<Physics2DSettings>): Physics2DWorld {
  const sceneSettings = (scene as Physics2DScene).physics2D;
  const normalized = normalizePhysics2DSettings({ ...sceneSettings, ...settings });
  const validation = validatePhysics2DScene({ ...scene as Physics2DScene, physics2D: normalized });
  if (!validation.valid) throw new Error(`Invalid Physics2D scene: ${validation.diagnostics.join(",")}`);
  const bodies = (scene.entities as readonly Physics2DEntity[]).map((entity) => bodyFromEntity(entity, normalized)).filter((body): body is Physics2DBody => body !== undefined).sort((left, right) => left.entityId.localeCompare(right.entityId) || left.componentId.localeCompare(right.componentId));
  return freezeDeep({ settings: normalized, bodies, activeContactIds: [], tick: 0, accumulator: 0 });
}

function dimensions(body: Physics2DBody): { width: number; height: number } {
  const collider = body.collider;
  if (collider.shape === "CIRCLE") return { width: collider.radius * 2, height: collider.radius * 2 };
  if (collider.shape === "CAPSULE") return { width: Math.max(collider.width, collider.radius * 2), height: Math.max(collider.height, collider.radius * 2) };
  return { width: collider.width, height: collider.height };
}

export function colliderAABB(body: Pick<Physics2DBody, "position" | "collider">, transformScale: Physics2DVector = vector(1, 1)): Physics2DAABB {
  const size = dimensions(body as Physics2DBody);
  const width = Math.abs(transformScale.x) * size.width;
  const height = Math.abs(transformScale.y) * size.height;
  const offset = body.collider.offset ?? vector(0, 0);
  const centerX = body.position.x + offset.x * transformScale.x;
  const centerY = body.position.y + offset.y * transformScale.y;
  return { minX: centerX - width / 2, minY: centerY - height / 2, maxX: centerX + width / 2, maxY: centerY + height / 2 };
}

function intersects(a: Physics2DAABB, b: Physics2DAABB, touching = false): boolean {
  const epsilon = touching ? 1e-9 : 0;
  return a.minX <= b.maxX + epsilon && a.maxX >= b.minX - epsilon && a.minY <= b.maxY + epsilon && a.maxY >= b.minY - epsilon;
}

function pairId(a: Physics2DBody, b: Physics2DBody, kind: "COLLISION" | "TRIGGER"): string {
  const entities = [a.entityId, b.entityId].sort();
  return `${kind}|${entities[0]}|${entities[1]}`;
}

function maskAllows(body: Physics2DBody, other: Physics2DBody): boolean {
  const mask = body.collider.mask as number | undefined;
  const bit = GAME350_PHYSICS_LAYER_BITS[other.collider.layer];
  return mask === undefined || (mask & bit) !== 0;
}

function canPair(a: Physics2DBody, b: Physics2DBody): boolean {
  return a.entityId !== b.entityId && a.simulated && b.simulated && maskAllows(a, b) && maskAllows(b, a);
}

function inverseMass(body: Physics2DBody): number {
  return body.bodyType === "DYNAMIC" && body.simulated ? 1 / body.mass : 0;
}

function withBody(body: Physics2DBody, changes: Partial<Physics2DBody>): Physics2DBody {
  return { ...body, ...changes, position: changes.position ?? body.position, velocity: changes.velocity ?? body.velocity, collider: changes.collider ?? body.collider };
}

function resolvePair(a: Physics2DBody, b: Physics2DBody): [Physics2DBody, Physics2DBody] {
  if (a.collider.isTrigger || b.collider.isTrigger) return [a, b];
  const boxA = colliderAABB(a, a.scale);
  const boxB = colliderAABB(b, b.scale);
  const overlapX = Math.min(boxA.maxX, boxB.maxX) - Math.max(boxA.minX, boxB.minX);
  const overlapY = Math.min(boxA.maxY, boxB.maxY) - Math.max(boxA.minY, boxB.minY);
  if (overlapX <= 0 || overlapY <= 0) return [a, b];
  const relativeX = Math.abs(a.velocity.x - b.velocity.x);
  const relativeY = Math.abs(a.velocity.y - b.velocity.y);
  const moveX = relativeX > relativeY ? overlapX < overlapY : relativeY > relativeX ? false : overlapX < overlapY;
  const sign = moveX ? (a.position.x < b.position.x ? -1 : 1) : (a.position.y < b.position.y ? -1 : 1);
  const amount = moveX ? overlapX : overlapY;
  const totalInverseMass = inverseMass(a) + inverseMass(b);
  if (totalInverseMass === 0) return [a, b];
  const aShare = inverseMass(a) / totalInverseMass;
  const bShare = inverseMass(b) / totalInverseMass;
  const aPosition = { ...a.position, ...(moveX ? { x: a.position.x + sign * amount * aShare } : { y: a.position.y + sign * amount * aShare }) };
  const bPosition = { ...b.position, ...(moveX ? { x: b.position.x - sign * amount * bShare } : { y: b.position.y - sign * amount * bShare }) };
  const restitution = Math.max(a.collider.material?.bounciness ?? 0, b.collider.material?.bounciness ?? 0);
  const friction = Math.min(1, ((a.collider.material?.friction ?? 0) + (b.collider.material?.friction ?? 0)) / 2);
  const aVelocity = { ...a.velocity };
  const bVelocity = { ...b.velocity };
  const normalKey = moveX ? "x" : "y";
  const relative = a.velocity[normalKey] - b.velocity[normalKey];
  if (relative * sign < 0) {
    const impulse = -(1 + restitution) * relative / totalInverseMass;
    aVelocity[normalKey] += impulse * aShare;
    bVelocity[normalKey] -= impulse * bShare;
  }
  if (moveX) { aVelocity.y *= 1 - friction * 0.5; bVelocity.y *= 1 - friction * 0.5; } else { aVelocity.x *= 1 - friction * 0.5; bVelocity.x *= 1 - friction * 0.5; }
  return [withBody(a, { position: aPosition, velocity: aVelocity }), withBody(b, { position: bPosition, velocity: bVelocity })];
}

function applyConstraints(body: Physics2DBody, positionReference = body.position): Physics2DBody {
  const velocity = { ...body.velocity };
  const position = { ...body.position };
  if (body.freezePosition.x) { velocity.x = 0; position.x = positionReference.x; }
  if (body.freezePosition.y) { velocity.y = 0; position.y = positionReference.y; }
  const angularVelocity = body.freezeRotation ? 0 : body.angularVelocity;
  return withBody(body, { position, velocity, angularVelocity });
}

function integrate(world: Physics2DWorld, input: Physics2DStepInput): Physics2DBody[] {
  const dt = world.settings.fixedDeltaTime;
  return world.bodies.map((original) => {
    if (!original.simulated || original.bodyType === "STATIC") return original;
    const suppliedVelocity = input.velocityByEntityId?.[original.entityId];
    const force = input.forceByEntityId?.[original.entityId] ?? vector(0, 0);
    const suppliedAngular = input.angularVelocityByEntityId?.[original.entityId];
    const acceleration = original.bodyType === "DYNAMIC"
      ? { x: world.settings.gravity.x * original.gravityScale + force.x / original.mass, y: world.settings.gravity.y * original.gravityScale + force.y / original.mass }
      : vector(0, 0);
    const velocity = suppliedVelocity === undefined ? { x: original.velocity.x + acceleration.x * dt, y: original.velocity.y + acceleration.y * dt } : { x: suppliedVelocity.x, y: suppliedVelocity.y };
    const drag = 1 / (1 + original.linearDrag * dt);
    velocity.x *= drag;
    velocity.y *= drag;
    const position = { x: original.position.x + velocity.x * dt, y: original.position.y + velocity.y * dt };
    const angularVelocity = (suppliedAngular ?? original.angularVelocity) / (1 + original.angularDrag * dt);
    return applyConstraints(withBody(original, { position, velocity, angularVelocity, angle: original.angle + angularVelocity * dt }), original.position);
  });
}

function contactEvents(previous: readonly string[], current: readonly string[], bodiesById: ReadonlyMap<string, Physics2DBody>): Physics2DContact[] {
  const previousSet = new Set(previous);
  const currentSet = new Set(current);
  const all = [...new Set([...previous, ...current])].sort();
  return all.map((id) => {
    const [, entityA, entityB] = id.split("|");
    const kind = id.startsWith("TRIGGER|") ? "TRIGGER" : "COLLISION";
    const phase = currentSet.has(id) ? (previousSet.has(id) ? "STAY" : "ENTER") : "EXIT";
    return { id, kind, phase, entityA: entityA ?? "", entityB: entityB ?? "" } as Physics2DContact;
  }).filter((contact) => bodiesById.has(contact.entityA) || bodiesById.has(contact.entityB));
}

function activeContacts(bodies: readonly Physics2DBody[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i]!;
      const b = bodies[j]!;
      if (!canPair(a, b)) continue;
      const aabb = colliderAABB(a, a.scale);
      const babb = colliderAABB(b, b.scale);
      if (intersects(aabb, babb, true)) result.push(pairId(a, b, a.collider.isTrigger || b.collider.isTrigger ? "TRIGGER" : "COLLISION"));
    }
  }
  return result.sort();
}

/** One deterministic fixed step. The input World and its bodies are never mutated. */
export function stepPhysics2D(world: Physics2DWorld, input: Physics2DStepInput = {}): Physics2DStepResult {
  let bodies = integrate(world, input);
  const positionReferences = new Map(bodies.map((body) => [body.entityId, body.position]));
  const pairs = bodies.flatMap((a, i) => bodies.slice(i + 1).map((b) => [a, b] as const)).filter(([a, b]) => canPair(a, b) && !a.collider.isTrigger && !b.collider.isTrigger).sort(([a, b], [c, d]) => pairId(a, b, "COLLISION").localeCompare(pairId(c, d, "COLLISION")));
  for (const [a, b] of pairs) {
    const aIndex = bodies.findIndex((body) => body.entityId === a.entityId);
    const bIndex = bodies.findIndex((body) => body.entityId === b.entityId);
    if (aIndex < 0 || bIndex < 0) continue;
    const [nextA, nextB] = resolvePair(bodies[aIndex]!, bodies[bIndex]!);
    bodies[aIndex] = applyConstraints(nextA);
    bodies[bIndex] = applyConstraints(nextB);
  }
  bodies = bodies.map((body) => applyConstraints(body, positionReferences.get(body.entityId) ?? body.position));
  bodies.sort((left, right) => left.entityId.localeCompare(right.entityId) || left.componentId.localeCompare(right.componentId));
  const nextContactIds = activeContacts(bodies);
  const byId = new Map(bodies.map((body) => [body.entityId, body]));
  const events = contactEvents(world.activeContactIds, nextContactIds, byId);
  const nextWorld = freezeDeep({ ...world, bodies, activeContactIds: nextContactIds, tick: world.tick + 1, accumulator: 0 });
  return { world: nextWorld, events: freezeDeep(events) };
}

/** Advance by wall-clock time with a fixed-step accumulator and a hard catch-up cap. */
export function advancePhysics2D(world: Physics2DWorld, elapsedSeconds: number, input: Physics2DStepInput = {}): Physics2DAdvanceResult {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new Error("Physics2D elapsed time must be a finite non-negative number.");
  const dt = world.settings.fixedDeltaTime;
  const requested = world.accumulator + elapsedSeconds;
  const bounded = Math.min(requested, dt * world.settings.maxSubSteps);
  let current = { ...world, accumulator: bounded } as Physics2DWorld;
  const events: Physics2DContact[] = [];
  let steps = 0;
  while (current.accumulator + 1e-12 >= dt && steps < world.settings.maxSubSteps) {
    const stepped = stepPhysics2D(current, input);
    events.push(...stepped.events);
    current = { ...stepped.world, accumulator: current.accumulator - dt };
    steps += 1;
  }
  const droppedTime = Math.max(0, requested - bounded);
  return { world: freezeDeep(current), events: freezeDeep(events), steps, droppedTime };
}
