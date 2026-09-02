/**
 * Small template runtimes for the beginner iGAME path.
 *
 * This is intentionally not a general-purpose physics engine. It owns only
 * the predictable loop needed by the Action, Dodge, and Scroll templates:
 * movement, gravity, jump, floor landing, lightweight enemy triggers, and
 * camera follow. The canonical Game Project remains the source of all
 * authoring data.
 */
import type {
  BrainComponent,
  GameCamera2DSettings,
  GameEventCard,
  GameObjectRole,
  GameProject,
  GameRecipeDefinition,
  GameSceneRules,
  GameTimelineTrack,
} from "../game-300/core.ts";
import {
  DEFAULT_CAMERA_2D_SETTINGS,
  normalizeCamera2DSettings,
} from "./camera-2d.ts";
import {
  sceneRulesForRuntimeFamily,
  GAME_SCENE_RULE_PRESETS,
} from "./authoring-model.ts";

export const GAME_GENRE_RUNTIME_SCHEMA_VERSION = 1 as const;

export type GameGenreRuntimeFamily =
  | "ACTION_PLATFORM"
  | "DODGE_ARENA"
  | "SCROLL_SIDE";
export type GameGenreRuntimeMode = "STOPPED" | "PLAYING";

export interface GameGenreRuntimePoint {
  readonly x: number;
  readonly y: number;
}

export interface GameGenreRuntimeStatus {
  readonly hp: number;
  readonly maxHp: number;
  readonly attack: number;
  readonly defense: number;
}

export interface GameGenreRuntimeObject {
  readonly id: string;
  readonly label: string;
  readonly role: GameObjectRole | undefined;
  readonly position: GameGenreRuntimePoint;
  /**
   * Default genre rule engine (decision 2): every NPC-role object gets a
   * working STATUS (hp/attack/defense) whether or not the author placed a
   * STATUS node, so contact combat "just works" out of the box. Present for
   * every non-tilemap object; only NPC-role objects currently fight.
   */
  readonly status?: GameGenreRuntimeStatus;
  /** BRAIN runtime effect (decision 2): drives stepBrain's PURSUE/AVOID. */
  readonly brain?: {
    readonly mode: BrainComponent["mode"];
    readonly speed: number;
    readonly range: number;
  };
}

export interface GameGenreRuntimeInput {
  readonly left?: boolean;
  readonly right?: boolean;
  readonly up?: boolean;
  readonly down?: boolean;
  readonly jump?: boolean;
  readonly interact?: boolean;
  readonly tap?: boolean;
}

export interface GameGenreRuntimeState {
  readonly schemaVersion: typeof GAME_GENRE_RUNTIME_SCHEMA_VERSION;
  readonly projectId: GameProject["projectId"];
  readonly runtimeFamily: GameGenreRuntimeFamily;
  readonly rules: GameSceneRules;
  readonly mode: GameGenreRuntimeMode;
  readonly tick: number;
  readonly playerId: string;
  readonly playerPosition: GameGenreRuntimePoint;
  readonly velocity: GameGenreRuntimePoint;
  readonly grounded: boolean;
  readonly health: number;
  readonly playerStatus: GameGenreRuntimeStatus;
  readonly survivalSeconds: number;
  readonly gameOver: boolean;
  readonly camera2D: GameCamera2DSettings;
  readonly cameraOrigin: GameGenreRuntimePoint;
  readonly cameraShakeFrames: number;
  readonly world: {
    readonly width: number;
    readonly height: number;
    readonly solidCells: readonly GameGenreRuntimePoint[];
  };
  readonly objects: readonly GameGenreRuntimeObject[];
  readonly eventCards: readonly GameEventCard[];
  readonly activeEventIds: readonly string[];
  readonly firedEventIds: readonly string[];
  readonly dialogue: string | null;
  readonly lastAudioTrackId: string | null;
  readonly sceneComplete: boolean;
  readonly variables: Readonly<Record<string, string | number | boolean>>;
  /**
   * Inventory & Crafting (decision: author-defined, project-wide vocabulary,
   * never a fixed game's content). itemId -> count the player is currently
   * holding; absent keys mean zero. Updated by GIVE_ITEM/TAKE_ITEM/
   * CRAFT_ITEM, read by the HAS_ITEM condition.
   */
  readonly inventory: Readonly<Record<string, number>>;
  /** Author-defined recipes this project's CRAFT_ITEM cards may reference. */
  readonly recipes: readonly GameRecipeDefinition[];
}

const POINT_ZERO: GameGenreRuntimePoint = { x: 0, y: 0 };
const PLAYER_HALF_WIDTH = 0.35;
const PLAYER_HALF_HEIGHT = 0.35;
const JUMP_SPEED = 6;
const DEFAULT_MOVE_SPEED = 5;
const TOUCH_DISTANCE = 0.9;
export const DODGE_SURVIVAL_SECONDS = 15 as const;
export const DODGE_SURVIVAL_TICKS = DODGE_SURVIVAL_SECONDS * 60;
const DODGE_MOVE_SPEED = 4.5;
const DODGE_ENEMY_SPEED = 0.045;

// Default genre rule engine (decision 2): these are the "just works" combat
// numbers an author gets before ever touching a STATUS node — RPG Maker's
// Database plays the same role for JRPG math. COMBAT_TICK_INTERVAL throttles
// contact damage to twice a second instead of every frame (60/s), so simply
// touching an enemy doesn't delete both sides in a single tick.
const DEFAULT_NPC_STATUS: GameGenreRuntimeStatus = {
  hp: 10,
  maxHp: 10,
  attack: 2,
  defense: 0,
};
const DEFAULT_PLAYER_STATUS: GameGenreRuntimeStatus = {
  hp: 10,
  maxHp: 10,
  attack: 2,
  defense: 1,
};
const COMBAT_TICK_INTERVAL = 30;

function point(x: number, y: number): GameGenreRuntimePoint {
  return { x, y };
}

function distance(left: GameGenreRuntimePoint, right: GameGenreRuntimePoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function isDodgeEnemy(object: GameGenreRuntimeObject): boolean {
  const text = `${object.id} ${object.label}`.toLowerCase();
  return object.role === "NPC" || text.includes("enemy") || text.includes("敵");
}

function trackRole(track: GameTimelineTrack): GameObjectRole | undefined {
  return track.role;
}

/**
 * Default genre rule engine (decision 2): a STATUS node's fields override
 * the default when present and enabled; an object with no STATUS node still
 * gets a working one so combat never silently does nothing.
 */
function trackStatus(
  track: GameTimelineTrack | undefined,
  fallback: GameGenreRuntimeStatus,
): GameGenreRuntimeStatus {
  const status = track?.components?.find((component) =>
    component.type === "STATUS"
  );
  if (status?.type !== "STATUS" || !status.enabled) return fallback;
  return {
    hp: Math.max(0, status.hp),
    maxHp: Math.max(1, status.maxHp),
    attack: Math.max(0, status.attack),
    defense: Math.max(0, status.defense),
  };
}

function trackBrainMode(
  track: GameTimelineTrack | undefined,
): { readonly mode: BrainComponent["mode"]; readonly speed: number; readonly range: number } | undefined {
  const brain = track?.components?.find((component) =>
    component.type === "BRAIN"
  );
  if (brain?.type !== "BRAIN" || !brain.enabled) return undefined;
  return { mode: brain.mode, speed: brain.speed, range: brain.range };
}

/**
 * BRAIN runtime effect (decision 2): PURSUE/AVOID move every NPC-role
 * object toward or away from the player at the node's own speed, gated by
 * its range so idle enemies outside range stay put; PATROL/WAIT/AI/
 * PLAYER_CONTROL are left as authored positions here (PATROL needs a path,
 * which is a later Phase 3a/5 authoring concern, not this default engine).
 */
function stepBrain(
  object: GameGenreRuntimeObject,
  playerPosition: GameGenreRuntimePoint,
  world: { readonly width: number; readonly height: number },
): GameGenreRuntimeObject {
  const brain = object.brain;
  if (brain === undefined) return object;
  if (brain.mode !== "PURSUE" && brain.mode !== "AVOID") return object;
  const dx = playerPosition.x - object.position.x;
  const dy = playerPosition.y - object.position.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0.001 || length > brain.range) return object;
  const speed = Math.max(0, brain.speed) * 0.01;
  const move = Math.min(speed, length);
  const direction = brain.mode === "PURSUE" ? 1 : -1;
  return {
    ...object,
    position: point(
      Math.min(
        world.width - PLAYER_HALF_WIDTH,
        Math.max(
          PLAYER_HALF_WIDTH,
          object.position.x + (dx / length) * move * direction,
        ),
      ),
      Math.min(
        world.height - PLAYER_HALF_HEIGHT,
        Math.max(
          PLAYER_HALF_HEIGHT,
          object.position.y + (dy / length) * move * direction,
        ),
      ),
    ),
  };
}

/**
 * Default genre rule engine (decision 2): contact combat that "just works"
 * without any authored Rule — bump into an NPC and both sides trade
 * attack-minus-defense damage (floored at 1 so combat always progresses),
 * an NPC at 0 HP is defeated (removed from the world), and the player at 0
 * HP ends the run. Throttled to COMBAT_TICK_INTERVAL so standing in contact
 * doesn't resolve 60 hits a second.
 */
function applyContactCombat(
  playerStatus: GameGenreRuntimeStatus,
  playerPosition: GameGenreRuntimePoint,
  objects: readonly GameGenreRuntimeObject[],
): {
  readonly objects: readonly GameGenreRuntimeObject[];
  readonly playerStatus: GameGenreRuntimeStatus;
} {
  let nextPlayerStatus = playerStatus;
  const nextObjects: GameGenreRuntimeObject[] = [];
  for (const object of objects) {
    if (
      object.role !== "NPC" || object.status === undefined ||
      nextPlayerStatus.hp <= 0
    ) {
      nextObjects.push(object);
      continue;
    }
    if (distance(playerPosition, object.position) > TOUCH_DISTANCE) {
      nextObjects.push(object);
      continue;
    }
    const damageToObject = Math.max(
      1,
      nextPlayerStatus.attack - object.status.defense,
    );
    const damageToPlayer = Math.max(
      1,
      object.status.attack - nextPlayerStatus.defense,
    );
    const objectHp = Math.max(0, object.status.hp - damageToObject);
    nextPlayerStatus = {
      ...nextPlayerStatus,
      hp: Math.max(0, nextPlayerStatus.hp - damageToPlayer),
    };
    if (objectHp <= 0) continue;
    nextObjects.push({ ...object, status: { ...object.status, hp: objectHp } });
  }
  return { objects: nextObjects, playerStatus: nextPlayerStatus };
}

function trackPosition(track: GameTimelineTrack): GameGenreRuntimePoint {
  const transform = track.components?.find((component) =>
    component.type === "TRANSFORM"
  );
  return transform?.type === "TRANSFORM"
    ? point(transform.x, transform.y)
    : point(0, 0);
}

function trackCamera(track: GameTimelineTrack | undefined): GameCamera2DSettings {
  const camera = track?.components?.find((component) =>
    component.type === "CAMERA"
  );
  return camera?.type === "CAMERA"
    ? normalizeCamera2DSettings(camera.camera2D)
    : DEFAULT_CAMERA_2D_SETTINGS;
}

function mapFromTracks(tracks: readonly GameTimelineTrack[]): {
  readonly width: number;
  readonly height: number;
  readonly solidCells: readonly GameGenreRuntimePoint[];
} {
  const mapTrack = tracks.find((track) =>
    track.role === "TILEMAP" || track.kind === "TILEMAP"
  );
  const tilemapComponent = mapTrack?.components?.find((component) =>
    component.type === "TILEMAP"
  );
  const document = mapTrack?.tilemap ??
    (tilemapComponent?.type === "TILEMAP"
      ? tilemapComponent.document
      : undefined);
  const width = Math.max(8, document?.width ?? 24);
  const height = Math.max(6, document?.height ?? 10);
  const solidCells = document?.cells
    .filter((cell) => cell.collision === "SOLID")
    .map((cell) => point(cell.x, cell.y)) ??
    Array.from({ length: width }, (_, x) => point(x, height - 1));
  return { width, height, solidCells };
}

function objectById(
  state: GameGenreRuntimeState,
  id: string | undefined,
): GameGenreRuntimeObject | undefined {
  if (id === undefined || id === state.playerId) {
    return id === state.playerId
      ? {
        id: state.playerId,
        label: "主人公",
        role: "PLAYER",
        position: state.playerPosition,
      }
      : undefined;
  }
  return state.objects.find((object) => object.id === id);
}

function targetPosition(
  state: GameGenreRuntimeState,
  card: GameEventCard,
): GameGenreRuntimePoint | undefined {
  if (card.targetTrackId !== undefined) {
    return objectById(state, card.targetTrackId)?.position;
  }
  if (card.condition === "REACH_GOAL") {
    return state.objects.find((object) =>
      object.role === "TRIGGER" && object.id.toLowerCase().includes("goal")
    )?.position;
  }
  return undefined;
}

function cardIsNearTarget(
  state: GameGenreRuntimeState,
  card: GameEventCard,
): boolean {
  // Inventory & Crafting (decision): HAS_ITEM is a state check, not a
  // spatial one -- it reuses the same "near"/edge-triggered plumbing as
  // TOUCH/ENTER_RANGE so a Sentence Logic row reading
  // "HAS_ITEM(鍵) -> COMPLETE_SCENE" fires exactly once when the threshold
  // is crossed, and can fire again if the item is later taken away and
  // re-collected.
  if (card.condition === "HAS_ITEM") {
    const have = state.inventory[card.itemId ?? ""] ?? 0;
    return have >= Math.max(1, card.amount ?? 1);
  }
  const target = targetPosition(state, card);
  // A side-scrolling goal is a finish line, not a point that must be hit at
  // the exact same height. This keeps the beginner path predictable even if
  // the player is still falling when they cross the goal column.
  if (
    target !== undefined && card.condition === "REACH_GOAL" &&
    state.runtimeFamily === "SCROLL_SIDE"
  ) {
    return state.playerPosition.x >= target.x - TOUCH_DISTANCE;
  }
  return target === undefined || distance(state.playerPosition, target) <=
    TOUCH_DISTANCE;
}

/**
 * Inventory & Crafting (decision): GIVE_ITEM/TAKE_ITEM only ever touch
 * `inventory`, the same shape SET_VARIABLE already uses for `variables` --
 * no new subsystem, just one more author-defined record.
 */
function addToInventory(
  inventory: Readonly<Record<string, number>>,
  itemId: string,
  amount: number,
): Readonly<Record<string, number>> {
  const next = Math.max(0, (inventory[itemId] ?? 0) + amount);
  return { ...inventory, [itemId]: next };
}

/**
 * CRAFT_ITEM looks the recipe up by id and only applies it when every
 * ingredient is fully available -- an incomplete recipe is simply a no-op,
 * matching the "no advanced error detection needed" design: the row just
 * quietly does nothing until the author (or player) has what it needs.
 */
function craftRecipe(
  inventory: Readonly<Record<string, number>>,
  recipes: readonly GameRecipeDefinition[],
  recipeId: string | undefined,
): Readonly<Record<string, number>> {
  const recipe = recipes.find((candidate) => candidate.recipeId === recipeId);
  if (recipe === undefined) return inventory;
  const canCraft = recipe.ingredients.every((ingredient) =>
    (inventory[ingredient.itemId] ?? 0) >= ingredient.amount
  );
  if (!canCraft) return inventory;
  let next = inventory;
  for (const ingredient of recipe.ingredients) {
    next = addToInventory(next, ingredient.itemId, -ingredient.amount);
  }
  return addToInventory(next, recipe.result.itemId, recipe.result.amount);
}

function applyEventCard(
  state: GameGenreRuntimeState,
  card: GameEventCard,
): GameGenreRuntimeState {
  if (!card.enabled) return state;
  switch (card.action) {
    case "DAMAGE": {
      const damaged = state.health - Math.max(0, card.amount ?? 1);
      return {
        ...state,
        health: Math.max(0, damaged),
        gameOver: damaged <= 0,
        cameraShakeFrames: Math.max(
          state.cameraShakeFrames,
          state.camera2D.shake.onDamage ? 8 : 0,
        ),
      };
    }
    case "SHAKE_CAMERA":
      return {
        ...state,
        cameraShakeFrames: Math.max(state.cameraShakeFrames, 8),
      };
    case "SHOW_DIALOGUE":
      return {
        ...state,
        dialogue: card.message?.trim() || "イベントが起こりました。",
      };
    case "PLAY_AUDIO":
      return {
        ...state,
        lastAudioTrackId: card.audioTrackId ?? card.targetTrackId ?? null,
      };
    case "COMPLETE_SCENE":
      return { ...state, sceneComplete: true };
    case "SET_VARIABLE":
      return {
        ...state,
        variables: {
          ...state.variables,
          state: card.message?.trim() || true,
        },
      };
    case "GIVE_ITEM":
      if (card.itemId === undefined) return state;
      return {
        ...state,
        inventory: addToInventory(
          state.inventory,
          card.itemId,
          Math.max(1, card.amount ?? 1),
        ),
      };
    case "TAKE_ITEM":
      if (card.itemId === undefined) return state;
      return {
        ...state,
        inventory: addToInventory(
          state.inventory,
          card.itemId,
          -Math.max(1, card.amount ?? 1),
        ),
      };
    case "CRAFT_ITEM":
      return {
        ...state,
        inventory: craftRecipe(state.inventory, state.recipes, card.recipeId),
      };
  }
}

function cameraOriginFor(
  playerPosition: GameGenreRuntimePoint,
  camera2D: GameCamera2DSettings,
  world: GameGenreRuntimeState["world"],
): GameGenreRuntimePoint {
  const pixelsPerUnit = Math.max(1, camera2D.pixelsPerUnit);
  const viewportWidth = Math.max(1, camera2D.referenceWidth / pixelsPerUnit);
  const viewportHeight = Math.max(1, camera2D.referenceHeight / pixelsPerUnit);
  const x = camera2D.follow.enabled
    ? playerPosition.x - viewportWidth / 2 + camera2D.follow.lookAheadX
    : 0;
  const y = camera2D.follow.enabled
    ? playerPosition.y - viewportHeight / 2 + camera2D.follow.lookAheadY
    : 0;
  const clampedX = Math.min(
    Math.max(0, world.width - viewportWidth),
    Math.max(0, x),
  );
  const clampedY = Math.min(
    Math.max(0, world.height - viewportHeight),
    Math.max(0, y),
  );
  const quantum = 1 / pixelsPerUnit;
  return point(
    camera2D.pixelPerfect ? Math.round(clampedX / quantum) * quantum : clampedX,
    camera2D.pixelPerfect ? Math.round(clampedY / quantum) * quantum : clampedY,
  );
}

function initialEventState(
  state: GameGenreRuntimeState,
): GameGenreRuntimeState {
  let next = state;
  const firedEventIds: string[] = [];
  for (const card of state.eventCards) {
    if (card.enabled && card.condition === "START") {
      next = applyEventCard(next, card);
      firedEventIds.push(card.eventId);
    }
  }
  return { ...next, firedEventIds };
}

function processEventCards(
  state: GameGenreRuntimeState,
  input: GameGenreRuntimeInput,
): GameGenreRuntimeState {
  let next = state;
  const activeEventIds: string[] = [];
  const firedEventIds = [...state.firedEventIds];
  for (const card of state.eventCards) {
    if (!card.enabled || card.condition === "START") continue;
    const near = cardIsNearTarget(next, card);
    const inputTriggered = card.condition === "TAP"
      ? input.tap === true
      : card.condition === "INTERACT"
      ? input.interact === true
      : false;
    const rangeTriggered = card.condition === "TOUCH" ||
      card.condition === "ENTER_RANGE" ||
      card.condition === "REACH_GOAL" ||
      card.condition === "HAS_ITEM";
    const triggered = rangeTriggered ? near : inputTriggered && near;
    if (!triggered) continue;
    if (rangeTriggered) activeEventIds.push(card.eventId);
    const edgeTriggered = rangeTriggered
      ? !state.activeEventIds.includes(card.eventId)
      : true;
    const oneShot = card.condition === "REACH_GOAL";
    if (
      edgeTriggered &&
      (!oneShot || !firedEventIds.includes(card.eventId))
    ) {
      next = applyEventCard(next, card);
      if (oneShot) firedEventIds.push(card.eventId);
    }
  }
  return { ...next, activeEventIds, firedEventIds };
}

function landingY(
  state: GameGenreRuntimeState,
  x: number,
  previousY: number,
  nextY: number,
): number | undefined {
  if (!state.rules.floorCollision || nextY < previousY) return undefined;
  let best: number | undefined;
  for (const cell of state.world.solidCells) {
    if (Math.abs(cell.x - x) > 0.8) continue;
    const surface = cell.y - PLAYER_HALF_HEIGHT;
    if (surface < previousY - 0.05 || nextY < surface) continue;
    if (best === undefined || surface < best) best = surface;
  }
  return best;
}

function stepMovement(
  state: GameGenreRuntimeState,
  input: GameGenreRuntimeInput,
): Pick<GameGenreRuntimeState, "playerPosition" | "velocity" | "grounded"> {
  if (state.runtimeFamily === "DODGE_ARENA") {
    const directionX = (input.right === true ? 1 : 0) -
      (input.left === true ? 1 : 0);
    const directionY = (input.down === true ? 1 : 0) -
      ((input.up === true || input.jump === true) ? 1 : 0);
    const magnitude = Math.hypot(directionX, directionY) || 1;
    const velocityX = directionX / magnitude * DODGE_MOVE_SPEED;
    const velocityY = directionY / magnitude * DODGE_MOVE_SPEED;
    return {
      playerPosition: point(
        Math.min(
          state.world.width - PLAYER_HALF_WIDTH,
          Math.max(PLAYER_HALF_WIDTH, state.playerPosition.x + velocityX / 60),
        ),
        Math.min(
          state.world.height - PLAYER_HALF_HEIGHT,
          Math.max(PLAYER_HALF_HEIGHT, state.playerPosition.y + velocityY / 60),
        ),
      ),
      velocity: point(velocityX, velocityY),
      grounded: true,
    };
  }
  const direction = (input.right === true ? 1 : 0) -
    (input.left === true ? 1 : 0);
  const speed = DEFAULT_MOVE_SPEED;
  const velocityX = state.rules.horizontalMove ? direction * speed : 0;
  const jump = input.jump === true && state.grounded && state.rules.jump;
  const gravity = GAME_SCENE_RULE_PRESETS[state.rules.gravity];
  const velocityY = state.rules.gravity === "NONE"
    ? 0
    : jump
    ? -JUMP_SPEED
    : state.velocity.y + gravity / 60;
  const previous = state.playerPosition;
  let x = previous.x + velocityX / 60;
  let y = previous.y + velocityY / 60;
  x = Math.min(
    state.world.width - PLAYER_HALF_WIDTH,
    Math.max(PLAYER_HALF_WIDTH, x),
  );
  const floor = landingY(state, x, previous.y, y);
  const grounded = floor !== undefined;
  if (floor !== undefined) y = floor;
  y = Math.min(
    state.world.height + 2,
    Math.max(-2, y),
  );
  return {
    playerPosition: point(x, y),
    velocity: point(velocityX, floor === undefined ? velocityY : 0),
    grounded,
  };
}

function familyForProject(project: GameProject): GameGenreRuntimeFamily {
  const family = project.editorTimeline?.sceneRules?.runtimeFamily;
  if (
    family === "ACTION_PLATFORM" || family === "DODGE_ARENA" ||
    family === "SCROLL_SIDE"
  ) return family;
  if (project.editorTimeline?.creationMode === "DODGE_2D") {
    return "DODGE_ARENA";
  }
  if (project.editorTimeline?.creationMode === "SCROLL_2D") {
    return "SCROLL_SIDE";
  }
  return "ACTION_PLATFORM";
}

export function createGameGenreRuntime(
  project: GameProject,
): GameGenreRuntimeState {
  const family = familyForProject(project);
  const fallbackRules = sceneRulesForRuntimeFamily(family);
  const rules = project.editorTimeline?.sceneRules ?? fallbackRules;
  const tracks = project.editorTimeline?.tracks ?? [];
  const player = tracks.find((track) => track.role === "PLAYER") ??
    tracks.find((track) => track.trackId === "hero");
  const playerId = player?.trackId ?? "hero";
  const world = mapFromTracks(tracks);
  const cameraTrack = tracks.find((track) => track.role === "CAMERA");
  const camera2D = trackCamera(cameraTrack);
  const objects = tracks
    .filter((track) => track.trackId !== playerId)
    .filter((track) =>
      (track as GameTimelineTrack & { readonly active?: boolean }).active !==
        false
    )
    .map((track) => {
      const role = trackRole(track);
      const brain = trackBrainMode(track);
      return {
        id: track.trackId,
        label: track.label,
        role,
        position: trackPosition(track),
        ...(role === "NPC"
          ? { status: trackStatus(track, DEFAULT_NPC_STATUS) }
          : {}),
        ...(brain === undefined ? {} : { brain }),
      };
    });
  const state: GameGenreRuntimeState = {
    schemaVersion: GAME_GENRE_RUNTIME_SCHEMA_VERSION,
    projectId: project.projectId,
    runtimeFamily: family,
    rules,
    mode: "STOPPED",
    tick: 0,
    playerId,
    playerPosition: trackPosition(player ?? {
      trackId: playerId,
      label: "主人公",
      kind: "SPRITE",
      activeFrames: [],
    }),
    velocity: POINT_ZERO,
    grounded: false,
    health: 3,
    playerStatus: trackStatus(player, DEFAULT_PLAYER_STATUS),
    survivalSeconds: 0,
    gameOver: false,
    camera2D,
    cameraOrigin: cameraOriginFor(point(1, 1), camera2D, world),
    cameraShakeFrames: 0,
    world,
    objects,
    eventCards: project.editorTimeline?.eventCards ?? [],
    activeEventIds: [],
    firedEventIds: [],
    dialogue: null,
    lastAudioTrackId: null,
    sceneComplete: false,
    variables: {},
    inventory: {},
    recipes: project.editorTimeline?.recipes ?? [],
  };
  return initialEventState(state);
}

export function playGameGenre(
  state: GameGenreRuntimeState,
): GameGenreRuntimeState {
  return { ...state, mode: "PLAYING", dialogue: null };
}

export function stopGameGenre(
  state: GameGenreRuntimeState,
): GameGenreRuntimeState {
  return { ...state, mode: "STOPPED" };
}

export function restartGameGenre(
  project: GameProject,
): GameGenreRuntimeState {
  return playGameGenre(createGameGenreRuntime(project));
}

export function clearGameGenreDialogue(
  state: GameGenreRuntimeState,
): GameGenreRuntimeState {
  return { ...state, dialogue: null };
}

export function triggerGameGenreCameraShake(
  state: GameGenreRuntimeState,
): GameGenreRuntimeState {
  return { ...state, cameraShakeFrames: Math.max(state.cameraShakeFrames, 8) };
}

export function stepGameGenre(
  state: GameGenreRuntimeState,
  input: GameGenreRuntimeInput = {},
): GameGenreRuntimeState {
  if (
    state.mode !== "PLAYING" || state.gameOver || state.sceneComplete
  ) return state;
  // Legacy DODGE_ARENA default chase stays for any enemy without an
  // authored BRAIN node (backward compatible); an object with a BRAIN node
  // is driven by stepBrain below instead, using its own speed/range.
  const chasedObjects = state.runtimeFamily === "DODGE_ARENA"
    ? state.objects.map((object) => {
      if (object.brain !== undefined || !isDodgeEnemy(object)) return object;
      const dx = state.playerPosition.x - object.position.x;
      const dy = state.playerPosition.y - object.position.y;
      const length = Math.hypot(dx, dy);
      if (length <= 0.001) return object;
      const move = Math.min(DODGE_ENEMY_SPEED, length);
      return {
        ...object,
        position: point(
          Math.min(
            state.world.width - PLAYER_HALF_WIDTH,
            Math.max(PLAYER_HALF_WIDTH, object.position.x + dx / length * move),
          ),
          Math.min(
            state.world.height - PLAYER_HALF_HEIGHT,
            Math.max(PLAYER_HALF_HEIGHT, object.position.y + dy / length * move),
          ),
        ),
      };
    })
    : state.objects;
  // BRAIN runtime effect (decision 2): PURSUE/AVOID objects move toward or
  // away from the player every tick, in every runtime family.
  const brainObjects = chasedObjects.map((object) =>
    stepBrain(object, state.playerPosition, state.world)
  );
  const movement = stepMovement(state, input);
  // Default genre rule engine (decision 2): contact combat runs on a
  // throttled cadence so touching an enemy doesn't resolve 60 hits/second.
  const combat = (state.tick + 1) % COMBAT_TICK_INTERVAL === 0
    ? applyContactCombat(state.playerStatus, movement.playerPosition, brainObjects)
    : { objects: brainObjects, playerStatus: state.playerStatus };
  const nextBase: GameGenreRuntimeState = {
    ...state,
    tick: state.tick + 1,
    objects: combat.objects,
    playerStatus: combat.playerStatus,
    playerPosition: movement.playerPosition,
    velocity: movement.velocity,
    grounded: movement.grounded,
    survivalSeconds: state.runtimeFamily === "DODGE_ARENA"
      ? Math.floor((state.tick + 1) / 60)
      : state.survivalSeconds,
    cameraOrigin: cameraOriginFor(
      movement.playerPosition,
      state.camera2D,
      state.world,
    ),
    cameraShakeFrames: Math.max(0, state.cameraShakeFrames - 1),
    dialogue: input.interact === true || input.tap === true
      ? null
      : state.dialogue,
    gameOver: state.gameOver || combat.playerStatus.hp <= 0,
  };
  const eventState = processEventCards(nextBase, input);
  if (
    eventState.runtimeFamily === "DODGE_ARENA" &&
    eventState.tick >= DODGE_SURVIVAL_TICKS && !eventState.gameOver
  ) {
    return { ...eventState, sceneComplete: true };
  }
  return eventState;
}
