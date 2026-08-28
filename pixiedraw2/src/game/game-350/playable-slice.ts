/**
 * GAME-351 internal Playable Slice inside the GAME-350 boundary.
 *
 * The canonical authoring object remains GAME-300 GameProject/Journal. This
 * module only derives an immutable preview snapshot and keeps input/runtime
 * values beside, never inside, the authoring journal.
 */

import {
  asComponentId,
  asEntityId,
  asOwnerId,
  asProjectId,
  asRevisionId,
  asSceneId,
  type BehaviorIR,
  type CallerContext,
  createGameProject,
  createJournal,
  type Entity,
  type GameProject,
  type GameProjectDraft,
  type GameTilemapDocument,
  type OwnerId,
  type ProjectId,
  redoJournal,
  type RevisionId,
  type SceneId,
  type Sha256,
  undoJournal,
  validateGameProject,
} from "../game-300/core.ts";
import { type ActionId, asActionId } from "../game-310/core.ts";
import {
  cloneGameRuntimeState,
  createGameRuntimeState,
  DEFAULT_GAME_RUNTIME_PROFILE_ID,
  GAME_RUNTIME_PROFILE_IDS,
  GAME_RUNTIME_PROFILES,
  type GameRuntimeModule,
  type GameRuntimeState,
  playGameRuntimeState,
  restartGameRuntimeState,
  stepGameRuntimeState,
  stopGameRuntimeState,
} from "./runtime-core.ts";
import {
  createPhysics2DWorld,
  normalizePhysics2DSettings,
  stepPhysics2D,
  type Physics2DEntity,
  type Physics2DScene,
  type Physics2DSettings,
  type Physics2DStepResult,
  type Physics2DWorld,
} from "./physics-2d.ts";
import {
  createGameTilemapDocument,
  solidGameTilemapCells,
  triggerGameTilemapCells,
} from "./tilemap-authoring.ts";

export const GAME351_PLAYABLE_SCHEMA_VERSION = 1 as const;
export const GAME351_FIXED_STEP_TICKS = 1 as const;
export const GAME351_INPUT_ACTIONS = Object.freeze({
  MOVE_UP: asActionId("rpg.move.up"),
  MOVE_DOWN: asActionId("rpg.move.down"),
  MOVE_LEFT: asActionId("rpg.move.left"),
  MOVE_RIGHT: asActionId("rpg.move.right"),
});
export const GAME351_INTERACT_ACTION = asActionId("rpg.interact");
export const GAME351_TAP_ACTION = asActionId("rpg.tap");

export type Game351MoveAction =
  (typeof GAME351_INPUT_ACTIONS)[keyof typeof GAME351_INPUT_ACTIONS];
export interface Game351GridPosition {
  readonly x: number;
  readonly y: number;
}

export interface Game351TriggerCell extends Game351GridPosition {
  readonly triggerId: string;
}

export interface Game351CollisionBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface Game351RpgMap {
  readonly width: number;
  readonly height: number;
  readonly bounds: Game351CollisionBounds;
  readonly solidCells: readonly Game351GridPosition[];
  readonly triggerCells: readonly Game351TriggerCell[];
}

export interface Game351RpgTemplate {
  readonly project: GameProject;
  readonly caller: CallerContext;
  readonly sceneId: SceneId;
  readonly playerEntityId: ReturnType<typeof asEntityId>;
  readonly npcEntityId: ReturnType<typeof asEntityId>;
  /** Fixed template input; the editable canonical state is project/journal. */
  readonly map: Game351RpgMap;
}

export interface CreateGame351TemplateOptions {
  readonly projectId?: string;
  readonly ownerId?: string;
  readonly revisionId?: string;
  readonly name?: string;
}

export interface Game351PlayableSnapshot {
  readonly schemaVersion: typeof GAME351_PLAYABLE_SCHEMA_VERSION;
  readonly projectId: ProjectId;
  readonly ownerId: OwnerId;
  readonly projectRevisionId: RevisionId;
  readonly projectHash: Sha256;
  readonly sceneId: SceneId;
  readonly playerEntityId: ReturnType<typeof asEntityId>;
  readonly playerPosition: Game351GridPosition;
  readonly npcEntityId: ReturnType<typeof asEntityId>;
  readonly npcPosition: Game351GridPosition;
  readonly collisionBounds: Game351CollisionBounds;
  readonly solidCells: readonly Game351GridPosition[];
  readonly triggerCells: readonly Game351TriggerCell[];
}

export type Game351RuntimeMode = "STOPPED" | "PLAYING";

export interface Game351InputState {
  readonly lastSequence: number;
  readonly lastAction: Game351MoveAction | null;
}

export interface Game351InputStep {
  readonly sequence: number;
  readonly action: Game351MoveAction | null;
}

export interface Game351RuntimeState {
  readonly mode: Game351RuntimeMode;
  readonly tick: number;
  readonly sceneId: SceneId;
  readonly playerPosition: Game351GridPosition;
  readonly npcPosition: Game351GridPosition;
  readonly dialogue: string | null;
}

export interface Game351PlayableState extends
  GameRuntimeState<
    Game351PlayableSnapshot,
    Game351MoveAction,
    Game351RuntimeState
  > {
  readonly schemaVersion: typeof GAME351_PLAYABLE_SCHEMA_VERSION;
}

/**
 * Physics2D preview input. Coordinates use the existing RPG convention:
 * +x is right, +y is down, and a directional action is a world-units/second
 * velocity for exactly one fixed Physics2D step.
 */
export interface Game351Physics2DInput {
  readonly action?: Game351MoveAction | null;
}

export const GAME351_PHYSICS2D_MOVE_SPEED = 4;

export interface Game351Physics2DSceneOptions {
  readonly settings?: Partial<Physics2DSettings>;
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      freezeDeep(child);
    }
  }
  return value;
}

function position(x: number, y: number): Game351GridPosition {
  return { x, y };
}
function clonePosition(value: Game351GridPosition): Game351GridPosition {
  return position(value.x, value.y);
}

function cellKey(value: Game351GridPosition): string {
  return `${value.x},${value.y}`;
}

function defaultMap(): Game351RpgMap {
  return mapFromTilemapDocument(defaultMapDocument());
}

function mapFromTilemapDocument(
  document: GameTilemapDocument,
): Game351RpgMap {
  const bounds: Game351CollisionBounds = {
    minX: 0,
    minY: 0,
    maxX: document.width - 1,
    maxY: document.height - 1,
  };
  return freezeDeep({
    width: document.width,
    height: document.height,
    bounds,
    solidCells: solidGameTilemapCells(document).map((cell) =>
      position(cell.x, cell.y)
    ),
    triggerCells: triggerGameTilemapCells(document).map((cell) => ({
      x: cell.x,
      y: cell.y,
      triggerId: cell.triggerId!,
    })),
  });
}

function defaultMapDocument(): GameTilemapDocument {
  const bounds = { minX: 0, minY: 0, maxX: 7, maxY: 5 };
  const cells = [] as {
    readonly x: number;
    readonly y: number;
    readonly collision: "SOLID";
  }[];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (
        x === bounds.minX || x === bounds.maxX || y === bounds.minY ||
        y === bounds.maxY || (x === 3 && y === 2) || (x === 4 && y === 2)
      ) cells.push({ x, y, collision: "SOLID" });
    }
  }
  return createGameTilemapDocument({
    mapId: "game351-rpg-map",
    width: 8,
    height: 6,
    cells,
  });
}

function transform(componentId: string, x: number, y: number) {
  return {
    type: "TRANSFORM" as const,
    componentId: asComponentId(componentId),
    x,
    y,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  };
}

function camera(componentId: string) {
  return {
    type: "CAMERA" as const,
    componentId: asComponentId(componentId),
    active: true,
    zoom: 1,
  };
}
function collider(componentId: string, layer: "WORLD" | "PLAYER" | "NPC") {
  return {
    type: "COLLIDER" as const,
    componentId: asComponentId(componentId),
    shape: "BOX" as const,
    width: 0.8,
    height: 0.8,
    radius: 0.4,
    isTrigger: false,
    layer,
    enabled: true,
  };
}
function rigidbody(
  componentId: string,
  bodyType: "STATIC" | "KINEMATIC" | "DYNAMIC",
) {
  return {
    type: "RIGIDBODY" as const,
    componentId: asComponentId(componentId),
    bodyType,
    mass: 1,
    gravityScale: 0,
    fixedRotation: true,
    enabled: true,
  };
}
function characterController(componentId: string) {
  return {
    type: "CHARACTER_CONTROLLER" as const,
    componentId: asComponentId(componentId),
    moveSpeed: 4,
    stepHeight: 0.25,
    fixedStep: GAME351_FIXED_STEP_TICKS,
    enabled: true,
  };
}
function tilemap(
  componentId: string,
  document: GameTilemapDocument = defaultMapDocument(),
) {
  return {
    type: "TILEMAP" as const,
    componentId: asComponentId(componentId),
    mapId: "game351-rpg-map",
    tileSize: 1,
    collisionEnabled: true,
    document,
  };
}
function entity(
  entityId: string,
  name: string,
  components: Entity["components"],
): Entity {
  return { entityId: asEntityId(entityId), name, components };
}

/** Create the deterministic RPG template using the existing GAME-300 factory. */
export async function createGame351RpgTemplate(
  options: CreateGame351TemplateOptions = {},
): Promise<Game351RpgTemplate> {
  const projectId = asProjectId(options.projectId ?? "game351-rpg-template");
  const ownerId = asOwnerId(options.ownerId ?? "game351-template-owner");
  const revisionId = asRevisionId(
    options.revisionId ?? "game351-rpg-revision-1",
  );
  const sceneId = asSceneId("game351-rpg-scene");
  const playerEntityId = asEntityId("game351-rpg-player");
  const npcEntityId = asEntityId("game351-rpg-npc");
  const mapEntityId = asEntityId("game351-rpg-map");
  const cameraEntityId = asEntityId("game351-rpg-camera");
  const caller: CallerContext = { projectId, ownerId, revisionId };
  const scene = {
    sceneId,
    name: "RPG Main Scene",
    rootEntityIds: [mapEntityId, playerEntityId, npcEntityId, cameraEntityId],
    entities: [
      entity(String(mapEntityId), "Map", [
        transform("game351-rpg-map-transform", 0, 0),
        tilemap("game351-rpg-map-tilemap"),
        collider("game351-rpg-map-collider", "WORLD"),
      ]),
      entity(String(playerEntityId), "Player", [
        transform("game351-rpg-player-transform", 1, 1),
        collider("game351-rpg-player-collider", "PLAYER"),
        rigidbody("game351-rpg-player-rigidbody", "DYNAMIC"),
        characterController("game351-rpg-player-controller"),
      ]),
      entity(String(npcEntityId), "Guide NPC", [
        transform("game351-rpg-npc-transform", 5, 3),
        collider("game351-rpg-npc-collider", "NPC"),
        rigidbody("game351-rpg-npc-rigidbody", "KINEMATIC"),
      ]),
      entity(String(cameraEntityId), "Camera", [
        camera("game351-rpg-camera-component"),
      ]),
    ],
  };
  const draft: GameProjectDraft = {
    schemaVersion: 1,
    projectId,
    ownerId,
    name: options.name ?? "iGAME RPG Playable Slice",
    revision: { revisionId, projectId, ownerId, sequence: 1 },
    scenes: [scene],
    prefabs: [],
    dependencies: [],
    behaviors: [],
    runtimeProfile: {
      schemaVersion: 1,
      profileId: DEFAULT_GAME_RUNTIME_PROFILE_ID,
    },
  };
  const project = await createGameProject(draft, caller);
  return {
    project,
    caller,
    sceneId,
    playerEntityId,
    npcEntityId,
    map: defaultMap(),
  };
}

/**
 * Project-bound preview template for the Studio bridge.
 *
 * The editor Project remains the canonical source; this only supplies the
 * fixed RPG collision map and identifies the existing Player/NPC entities.
 */
export function createGame351RpgTemplateFromProject(
  project: GameProject,
): Game351RpgTemplate {
  const profileId = project.runtimeProfile?.profileId ??
    DEFAULT_GAME_RUNTIME_PROFILE_ID;
  if (profileId !== GAME_RUNTIME_PROFILE_IDS.TOP_DOWN_RPG) {
    throw new Error(
      `GAME-351 RPG preview does not support runtime profile: ${profileId}`,
    );
  }
  const scene =
    project.scenes.find((candidate) =>
      String(candidate.sceneId).startsWith("scene:pixiedraw-game:")
    ) ?? project.scenes[0];
  const playerEntityId = asEntityId(`entity:pixieed-game:hero`);
  const npcEntityId = asEntityId(`entity:pixieed-game:enemy`);
  if (
    scene === undefined ||
    !scene.entities.some((entity) => entity.entityId === playerEntityId) ||
    !scene.entities.some((entity) => entity.entityId === npcEntityId)
  ) {
    throw new Error(
      "Studio Game Project does not contain the RPG Player/NPC pair.",
    );
  }
  return {
    project,
    caller: {
      projectId: project.projectId,
      ownerId: project.ownerId,
      revisionId: project.revision.revisionId,
    },
    sceneId: scene.sceneId,
    playerEntityId,
    npcEntityId,
    map: mapFromTilemapDocument(
      scene.entities
        .flatMap((entity) => entity.components)
        .find((component) => component.type === "TILEMAP")?.document ??
        defaultMapDocument(),
    ),
  };
}

function entityTransform(
  project: GameProject,
  sceneId: SceneId,
  entityId: ReturnType<typeof asEntityId>,
): Game351GridPosition {
  const scene = project.scenes.find((item) => item.sceneId === sceneId);
  const target = scene?.entities.find((item) => item.entityId === entityId);
  const component = target?.components.find((item) =>
    item.type === "TRANSFORM"
  );
  if (
    component === undefined || !Number.isSafeInteger(component.x) ||
    !Number.isSafeInteger(component.y)
  ) {
    throw new Error(
      `Entity ${String(entityId)} must have an integer Transform.`,
    );
  }
  return position(component.x, component.y);
}

function inBounds(
  bounds: Game351CollisionBounds,
  value: Game351GridPosition,
): boolean {
  return value.x >= bounds.minX && value.x <= bounds.maxX &&
    value.y >= bounds.minY && value.y <= bounds.maxY;
}

function validateMap(map: Game351RpgMap): void {
  if (
    !Number.isSafeInteger(map.width) || !Number.isSafeInteger(map.height) ||
    map.width < 1 || map.height < 1
  ) throw new Error("RPG map dimensions must be positive integers.");
  if (map.bounds.minX > map.bounds.maxX || map.bounds.minY > map.bounds.maxY) {
    throw new Error("RPG collision bounds are invalid.");
  }
  const seen = new Set<string>();
  for (const cell of map.solidCells) {
    if (
      !Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y) ||
      !inBounds(map.bounds, cell)
    ) {
      throw new Error(
        "RPG solid cells must be integer cells inside collision bounds.",
      );
    }
    if (seen.has(cellKey(cell))) {
      throw new Error(`RPG solid cell is duplicated: ${cellKey(cell)}`);
    }
    seen.add(cellKey(cell));
  }
  const triggerIds = new Set<string>();
  for (const cell of map.triggerCells) {
    if (
      !Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y) ||
      !inBounds(map.bounds, cell) || typeof cell.triggerId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(cell.triggerId)
    ) {
      throw new Error(
        "RPG trigger cells must be valid integer cells with stable IDs.",
      );
    }
    const key = cellKey(cell);
    if (seen.has(key)) {
      throw new Error(`RPG map cell cannot be both solid and trigger: ${key}`);
    }
    if (triggerIds.has(cell.triggerId)) {
      throw new Error(`RPG trigger id is duplicated: ${cell.triggerId}`);
    }
    triggerIds.add(cell.triggerId);
    seen.add(key);
  }
}

function validatePhysics2DMap(map: Game351RpgMap): void {
  validateMap(map);
  const { minX, minY, maxX, maxY } = map.bounds;
  if (![minX, minY, maxX, maxY].every(Number.isSafeInteger)) {
    throw new Error("RPG collision bounds must be safe integer coordinates.");
  }
  if (
    map.width !== maxX - minX + 1 || map.height !== maxY - minY + 1
  ) {
    throw new Error("RPG map dimensions must match collision bounds.");
  }
}

function coordinateId(value: number): string {
  return value < 0 ? `n${Math.abs(value)}` : `p${value}`;
}

function physics2DId(
  sceneId: SceneId,
  kind: string,
  suffix: string,
): string {
  return `physics2d:${String(sceneId)}:${kind}:${suffix}`;
}

function staticWorldEntity(
  entityId: string,
  componentPrefix: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Physics2DEntity {
  const worldCollider = collider(`${componentPrefix}:collider`, "WORLD");
  return {
    entityId: asEntityId(entityId),
    name,
    components: [
      transform(`${componentPrefix}:transform`, x, y),
      {
        ...worldCollider,
        width,
        height,
        radius: Math.min(width, height) / 2,
        mask: ["PLAYER", "NPC"] as const,
      },
      rigidbody(`${componentPrefix}:rigidbody`, "STATIC"),
    ],
  };
}

function staticTriggerEntity(
  entityId: string,
  componentPrefix: string,
  triggerId: string,
  x: number,
  y: number,
): Physics2DEntity {
  const triggerCollider = collider(`${componentPrefix}:collider`, "WORLD");
  return {
    entityId: asEntityId(entityId),
    name: `RPG Trigger (${triggerId})`,
    components: [
      transform(`${componentPrefix}:transform`, x, y),
      {
        ...triggerCollider,
        layer: "SENSOR" as const,
        isTrigger: true,
        mask: ["PLAYER", "NPC"] as const,
      },
      rigidbody(`${componentPrefix}:rigidbody`, "STATIC"),
    ],
  };
}

function physics2DPlayerBody(world: Physics2DWorld) {
  const players = world.bodies.filter((body) =>
    body.bodyType === "DYNAMIC" && body.collider.layer === "PLAYER"
  );
  if (players.length !== 1) {
    throw new Error(
      "GAME-351 Physics2D preview requires exactly one dynamic PLAYER body.",
    );
  }
  return players[0]!;
}

/** Compile the canonical Project into the immutable GAME-351 preview input. */
export function createGame351PlayableSnapshot(
  template: Game351RpgTemplate,
): Game351PlayableSnapshot {
  const validation = validateGameProject(template.project, template.caller);
  if (!validation.valid) {
    throw new Error(
      `Cannot compile invalid RPG Project: ${
        validation.diagnostics.map((item) => item.code).join(",")
      }`,
    );
  }
  validateMap(template.map);
  const scene = template.project.scenes.find((item) =>
    item.sceneId === template.sceneId
  );
  if (scene === undefined) {
    throw new Error(
      `Scene ${String(template.sceneId)} is not part of the Project.`,
    );
  }
  const player = scene.entities.find((item) =>
    item.entityId === template.playerEntityId
  );
  const npc = scene.entities.find((item) =>
    item.entityId === template.npcEntityId
  );
  if (player === undefined || npc === undefined) {
    throw new Error(
      "RPG template must contain Player and NPC entities in its Scene.",
    );
  }
  const playerPosition = entityTransform(
    template.project,
    template.sceneId,
    template.playerEntityId,
  );
  const npcPosition = entityTransform(
    template.project,
    template.sceneId,
    template.npcEntityId,
  );
  if (
    !inBounds(template.map.bounds, playerPosition) ||
    !inBounds(template.map.bounds, npcPosition)
  ) throw new Error("RPG actors must start inside collision bounds.");
  const solid = new Set(template.map.solidCells.map(cellKey));
  if (solid.has(cellKey(playerPosition)) || solid.has(cellKey(npcPosition))) {
    throw new Error("RPG actors may not start on solid cells.");
  }
  return freezeDeep({
    schemaVersion: GAME351_PLAYABLE_SCHEMA_VERSION,
    projectId: template.project.projectId,
    ownerId: template.project.ownerId,
    projectRevisionId: template.project.revision.revisionId,
    projectHash: template.project.revision.snapshotHash,
    sceneId: template.sceneId,
    playerEntityId: template.playerEntityId,
    playerPosition: clonePosition(playerPosition),
    npcEntityId: template.npcEntityId,
    npcPosition: clonePosition(npcPosition),
    collisionBounds: { ...template.map.bounds },
    solidCells: template.map.solidCells.map((cell) => clonePosition(cell)),
    triggerCells: template.map.triggerCells.map((cell) => ({ ...cell })),
  });
}

/**
 * Project the canonical GAME-300 Scene into a separate Physics2D Scene.
 *
 * The source Project is never mutated. Canonical entities/components are
 * copied as-is; only the RPG map's generated 1x1 cells and four outer walls
 * are appended as static WORLD bodies. This is an explicit preview adapter,
 * not a replacement for the existing fixed-cell runtime.
 */
export function createGame351Physics2DScene(
  template: Game351RpgTemplate,
  options: Game351Physics2DSceneOptions = {},
): Physics2DScene {
  createGame351PlayableSnapshot(template);
  validatePhysics2DMap(template.map);
  const sourceScene = template.project.scenes.find((scene) =>
    scene.sceneId === template.sceneId
  );
  if (sourceScene === undefined) {
    throw new Error(
      `Scene ${String(template.sceneId)} is not part of the Project.`,
    );
  }
  const player = sourceScene.entities.find((entity) =>
    entity.entityId === template.playerEntityId
  );
  const playerCollider = player?.components.find((component) =>
    component.type === "COLLIDER"
  );
  const playerRigidbody = player?.components.find((component) =>
    component.type === "RIGIDBODY"
  );
  if (
    player === undefined || playerCollider?.type !== "COLLIDER" ||
    playerRigidbody?.type !== "RIGIDBODY" ||
    playerCollider.layer !== "PLAYER" ||
    playerRigidbody.bodyType !== "DYNAMIC" ||
    playerCollider.enabled === false || playerRigidbody.enabled === false
  ) {
    throw new Error(
      "GAME-351 Physics2D preview requires an enabled dynamic PLAYER Collider and Rigidbody.",
    );
  }

  const entities: Physics2DEntity[] = sourceScene.entities.map((entity) => ({
    ...entity,
    components: entity.components.map((component) => ({ ...component })),
  }));
  const entityIds = new Set(entities.map((entity) => String(entity.entityId)));
  const componentIds = new Set(
    entities.flatMap((entity) =>
      entity.components.map((component) => String(component.componentId))
    ),
  );
  const appendGenerated = (generated: Physics2DEntity): void => {
    const entityKey = String(generated.entityId);
    if (entityIds.has(entityKey)) {
      throw new Error(`Physics2D generated Entity ID collides: ${entityKey}`);
    }
    const generatedComponentIds = generated.components.map((component) =>
      String(component.componentId)
    );
    if (
      new Set(generatedComponentIds).size !== generatedComponentIds.length ||
      generatedComponentIds.some((componentId) => componentIds.has(componentId))
    ) {
      throw new Error(
        `Physics2D generated Component ID collides for Entity: ${entityKey}`,
      );
    }
    entityIds.add(entityKey);
    generatedComponentIds.forEach((componentId) => componentIds.add(componentId));
    entities.push(generated);
  };

  const cells = [...template.map.solidCells].sort((left, right) =>
    left.y - right.y || left.x - right.x
  );
  for (const cell of cells) {
    const suffix = `${coordinateId(cell.x)}:${coordinateId(cell.y)}`;
    const id = physics2DId(template.sceneId, "solid", suffix);
    appendGenerated(
      staticWorldEntity(
        id,
        id,
        `RPG Solid Cell (${cell.x},${cell.y})`,
        cell.x,
        cell.y,
        1,
        1,
      ),
    );
  }

  const triggers = [...template.map.triggerCells].sort((left, right) =>
    left.y - right.y || left.x - right.x ||
    left.triggerId.localeCompare(right.triggerId)
  );
  for (const trigger of triggers) {
    const id = physics2DId(
      template.sceneId,
      "trigger",
      `${coordinateId(trigger.x)}:${coordinateId(trigger.y)}:${trigger.triggerId}`,
    );
    appendGenerated(
      staticTriggerEntity(
        id,
        id,
        trigger.triggerId,
        trigger.x,
        trigger.y,
      ),
    );
  }

  const { minX, minY, maxX, maxY } = template.map.bounds;
  const spanX = maxX - minX + 1;
  const spanY = maxY - minY + 1;
  const boundaries = [
    {
      name: "left",
      x: minX - 0.5,
      y: (minY + maxY) / 2,
      width: 1,
      height: spanY + 1,
    },
    {
      name: "right",
      x: maxX + 0.5,
      y: (minY + maxY) / 2,
      width: 1,
      height: spanY + 1,
    },
    {
      name: "top",
      x: (minX + maxX) / 2,
      y: minY - 0.5,
      width: spanX + 1,
      height: 1,
    },
    {
      name: "bottom",
      x: (minX + maxX) / 2,
      y: maxY + 0.5,
      width: spanX + 1,
      height: 1,
    },
  ] as const;
  for (const boundary of boundaries) {
    const id = physics2DId(template.sceneId, "boundary", boundary.name);
    appendGenerated(
      staticWorldEntity(
        id,
        id,
        `RPG Map Boundary (${boundary.name})`,
        boundary.x,
        boundary.y,
        boundary.width,
        boundary.height,
      ),
    );
  }

  const sourceSettings = (sourceScene as Physics2DScene).physics2D;
  return {
    ...sourceScene,
    rootEntityIds: [
      ...sourceScene.rootEntityIds,
      ...entities.slice(sourceScene.entities.length).map((entity) => entity.entityId),
    ],
    entities,
    physics2D: normalizePhysics2DSettings({
      ...sourceSettings,
      ...(options.settings ?? {}),
    }),
  };
}

/** Create a deterministic immutable Physics2D World for the RPG preview. */
export function createGame351Physics2DWorld(
  template: Game351RpgTemplate,
  options: Game351Physics2DSceneOptions = {},
): Physics2DWorld {
  const world = createPhysics2DWorld(
    createGame351Physics2DScene(template, options),
  );
  const player = physics2DPlayerBody(world);
  if (player.entityId !== String(template.playerEntityId)) {
    throw new Error("GAME-351 Physics2D PLAYER body is not template-bound.");
  }
  return world;
}

/**
 * Advance the separate Physics2D preview by exactly one fixed step.
 * Omitted/null action lets the physics world apply its own current velocity
 * and gravity. A direction replaces the Player's requested velocity with
 * moveSpeed in the +x/right, -x/left, +y/down, -y/up coordinate system; one
 * fixed-step gravity increment is included because Physics2D supplied input
 * velocities intentionally replace acceleration for that step.
 */
export function stepGame351Physics2D(
  world: Physics2DWorld,
  input: Game351Physics2DInput = {},
): Physics2DStepResult {
  const player = physics2DPlayerBody(world);
  const action = input.action;
  if (action !== undefined && !validAction(action)) {
    throw new Error(`Invalid GAME-351 Physics2D action: ${String(action)}`);
  }
  if (action === undefined || action === null) return stepPhysics2D(world);
  const delta = movement(action);
  const gravity = {
    x: world.settings.gravity.x * player.gravityScale *
      world.settings.fixedDeltaTime,
    y: world.settings.gravity.y * player.gravityScale *
      world.settings.fixedDeltaTime,
  };
  return stepPhysics2D(world, {
    velocityByEntityId: {
      [player.entityId]: {
        x: delta.x * GAME351_PHYSICS2D_MOVE_SPEED + gravity.x,
        y: delta.y * GAME351_PHYSICS2D_MOVE_SPEED + gravity.y,
      },
    },
  });
}

/** Create the Playable state while reusing GAME-300's canonical Journal. */
export function createGame351PlayableState(
  template: Game351RpgTemplate,
): Game351PlayableState {
  const snapshot = createGame351PlayableSnapshot(template);
  return createGameRuntimeState({
    journal: createJournal(template.project, template.caller),
    snapshot,
    module: GAME351_RPG_RUNTIME_MODULE,
  });
}

export function playGame351(state: Game351PlayableState): Game351PlayableState {
  return playGameRuntimeState(state);
}

export function stopGame351(state: Game351PlayableState): Game351PlayableState {
  return stopGameRuntimeState(state, GAME351_RPG_RUNTIME_MODULE);
}

export function clearGame351Dialogue(
  state: Game351PlayableState,
): Game351PlayableState {
  return {
    ...cloneUnchangedState(state),
    runtime: { ...state.runtime, dialogue: null },
  };
}

/** Reset runtime to the initial snapshot; a playing runtime remains playing. */
export function restartGame351(
  state: Game351PlayableState,
): Game351PlayableState {
  return restartGameRuntimeState(state, GAME351_RPG_RUNTIME_MODULE);
}

function validAction(
  value: Game351InputStep["action"],
): value is Game351MoveAction | null {
  return value === null ||
    (Object.values(GAME351_INPUT_ACTIONS) as readonly ActionId[]).includes(
      value,
    );
}

function movement(action: Game351MoveAction | null): Game351GridPosition {
  if (action === GAME351_INPUT_ACTIONS.MOVE_UP) return position(0, -1);
  if (action === GAME351_INPUT_ACTIONS.MOVE_DOWN) return position(0, 1);
  if (action === GAME351_INPUT_ACTIONS.MOVE_LEFT) return position(-1, 0);
  if (action === GAME351_INPUT_ACTIONS.MOVE_RIGHT) return position(1, 0);
  return position(0, 0);
}

/** The RPG template is one module implementation of the shared runtime contract. */
export const GAME351_RPG_RUNTIME_MODULE: GameRuntimeModule<
  Game351PlayableSnapshot,
  Game351MoveAction,
  Game351RuntimeState
> = {
  profile: GAME_RUNTIME_PROFILES.resolve(
    GAME_RUNTIME_PROFILE_IDS.TOP_DOWN_RPG,
  )!,
  fixedStepTicks: GAME351_FIXED_STEP_TICKS,
  createInitialRuntime(snapshot) {
    return {
      mode: "STOPPED",
      tick: 0,
      sceneId: snapshot.sceneId,
      playerPosition: clonePosition(snapshot.playerPosition),
      npcPosition: clonePosition(snapshot.npcPosition),
      dialogue: null,
    };
  },
  isValidAction(action) {
    return validAction(action);
  },
  step(snapshot, runtime, action) {
    const delta = movement(action);
    const candidate = position(
      runtime.playerPosition.x + delta.x,
      runtime.playerPosition.y + delta.y,
    );
    const nextPlayerPosition = canEnterGame351Cell(snapshot, candidate)
      ? candidate
      : clonePosition(runtime.playerPosition);
    return {
      ...runtime,
      playerPosition: nextPlayerPosition,
      npcPosition: clonePosition(runtime.npcPosition),
    };
  },
  cloneRuntime(runtime) {
    return {
      ...runtime,
      playerPosition: clonePosition(runtime.playerPosition),
      npcPosition: clonePosition(runtime.npcPosition),
    };
  },
  stopRuntime(runtime) {
    return { ...runtime, dialogue: null };
  },
};

function cloneUnchangedState(
  state: Game351PlayableState,
): Game351PlayableState {
  return cloneGameRuntimeState(state, GAME351_RPG_RUNTIME_MODULE);
}

function isAdjacent(
  left: Game351GridPosition,
  right: Game351GridPosition,
): boolean {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y) === 1;
}

/** Execute the bounded no-code interaction event without touching authoring history. */
export function triggerGame351Action(
  state: Game351PlayableState,
  actionId: string,
  behaviors: readonly BehaviorIR[],
): Game351PlayableState {
  if (
    state.runtime.mode !== "PLAYING" ||
    (actionId !== String(GAME351_INTERACT_ACTION) &&
      actionId !== String(GAME351_TAP_ACTION)) ||
    !isAdjacent(state.runtime.playerPosition, state.runtime.npcPosition)
  ) return cloneUnchangedState(state);
  for (const behavior of behaviors) {
    for (const rule of behavior.rules) {
      if (
        !rule.enabled || rule.trigger.type !== "ACTION" ||
        rule.trigger.actionId !== actionId
      ) continue;
      for (const action of rule.actions) {
        if (
          action.kind === "SET_VARIABLE" && action.property === "dialogue" &&
          typeof action.value === "string" && action.value.trim().length > 0
        ) {
          return {
            ...cloneUnchangedState(state),
            runtime: {
              ...state.runtime,
              dialogue: action.value.trim(),
            },
          };
        }
      }
    }
  }
  return cloneUnchangedState(state);
}

export function canEnterGame351Cell(
  snapshot: Game351PlayableSnapshot,
  value: Game351GridPosition,
): boolean {
  return inBounds(snapshot.collisionBounds, value) &&
    !new Set(snapshot.solidCells.map(cellKey)).has(cellKey(value)) &&
    cellKey(value) !== cellKey(snapshot.npcPosition);
}

/** Advance exactly one fixed tick without mutating the input state or Project Journal. */
export function stepGame351(
  state: Game351PlayableState,
  input: Game351InputStep,
): Game351PlayableState {
  return stepGameRuntimeState(state, input, GAME351_RPG_RUNTIME_MODULE);
}

/** Authoring-only undo/redo delegates to the existing GAME-300 Journal. */
export function undoGame351Authoring(
  state: Game351PlayableState,
): Game351PlayableState {
  return { ...state, journal: undoJournal(state.journal) };
}

export function redoGame351Authoring(
  state: Game351PlayableState,
): Game351PlayableState {
  return { ...state, journal: redoJournal(state.journal) };
}
