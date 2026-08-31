/// <reference lib="dom" />

/** Independent Game editor subdocument persistence for the local workspace. */

import { sha256Hex } from "../draw2-core.ts";
import {
  type BehaviorIR,
  createGameProject,
  type GameAnimationBinding,
  type GameComponentState,
  type GameEventCard,
  type GameObjectRole,
  type GameProject,
  type GameSceneRules,
  type GameTemplateInstance,
  type GameTilemapDocument,
  isValidGameAnimationBinding,
  isValidGameCamera2DSettings,
  isValidGameEventCard,
  isValidGameSceneRules,
  isValidGameTemplateInstance,
  isValidGameTilemapDocument,
} from "../game/game-300/core.ts";
import {
  validateBoundedGameScript,
  validateVisualGameLogic,
  type VisualGameLogicSource,
} from "../game/game-350/visual-logic.ts";
import {
  normalizePhysics2DSettings,
  type Physics2DSettings,
  validatePhysics2DSettings,
} from "../game/game-350/physics-2d.ts";
import {
  isValidGameVisualMakerConfig,
  type GameVisualMakerConfig,
} from "../game/game-350/visual-maker-model.ts";

export const GAME_EDITOR_PERSISTENCE_SCHEMA_VERSION =
  "GAME_EDITOR_PERSISTENCE_V1" as const;
export const GAME_EDITOR_PERSISTENCE_DB_NAME =
  "pixiedraw2-game-subdocuments" as const;
export const GAME_EDITOR_PERSISTENCE_DB_VERSION = 1 as const;
export const GAME_EDITOR_PERSISTENCE_STORE_NAME = "projects" as const;
export type GameEditorCreationMode =
  | "RPG_TEMPLATE"
  | "ACTION_2D"
  | "DODGE_2D"
  | "SCROLL_2D"
  | "BLANK";

export interface GameEditorTrack {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly filled: readonly number[];
  /** Optional scene-tree parent. Omitted means that the track is a root. */
  readonly parentTrackId?: string;
  /** Optional authoring visibility/runtime flag; omitted keeps legacy records valid. */
  readonly active?: boolean;
  /** Game-owned object role; Draw/Audio source metadata never enters here. */
  readonly role?: GameObjectRole;
  /** Component configuration owned by Game and projected into the canonical Scene. */
  readonly components?: readonly GameComponentState[];
  /** Game-owned sparse map layout; source artwork remains in iDRAW. */
  readonly tilemap?: GameTilemapDocument;
}

/**
 * Metadata-only cross-mode reference. Game may change placement, attachment,
 * or LIVE/PINNED mode; Draw/Audio bytes and source metadata remain owned by
 * their module and are intentionally absent from this record.
 */
export interface GameEditorBinding {
  readonly trackId: string;
  readonly kind: "DRAW" | "AUDIO";
  readonly assetId: string;
  readonly revisionId: string;
  readonly contentHash: string;
  readonly mode: "LIVE" | "PINNED";
  readonly label: string;
  /** Named iDRAW Asset Definition; source bytes never cross this boundary. */
  readonly assetDefinitionId?: string;
}

function referenceOnlyBinding(binding: GameEditorBinding): GameEditorBinding {
  return {
    trackId: binding.trackId,
    kind: binding.kind,
    assetId: binding.assetId,
    revisionId: binding.revisionId,
    contentHash: binding.contentHash,
    mode: binding.mode,
    label: binding.label,
    ...(binding.assetDefinitionId === undefined
      ? {}
      : { assetDefinitionId: binding.assetDefinitionId }),
  };
}

function cloneComponents(
  components: readonly GameComponentState[],
): GameComponentState[] {
  return components.map((
    component,
  ) => ({ ...component } as GameComponentState));
}

function cloneTilemap(
  tilemap: GameTilemapDocument,
): GameTilemapDocument {
  return {
    ...tilemap,
    cells: tilemap.cells.map((cell) => ({ ...cell })),
  };
}

function validEditorComponent(
  component: unknown,
): component is GameComponentState {
  if (
    component === null || typeof component !== "object" ||
    Array.isArray(component)
  ) return false;
  const value = component as Record<string, unknown>;
  if (typeof value.componentId !== "string" || typeof value.type !== "string") {
    return false;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value.componentId)) {
    return false;
  }
  switch (value.type) {
    case "TRANSFORM":
      return ["x", "y", "rotation", "scaleX", "scaleY"].every((key) =>
        typeof value[key] === "number" && Number.isFinite(value[key])
      );
    case "SPRITE":
      return typeof value.visible === "boolean";
    case "AUDIO_SOURCE":
      return typeof value.loop === "boolean" &&
        typeof value.volume === "number" && Number.isFinite(value.volume) &&
        value.volume >= 0 && value.volume <= 1;
    case "TILEMAP":
      return typeof value.mapId === "string" &&
        /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value.mapId) &&
        Number.isSafeInteger(value.tileSize) && Number(value.tileSize) > 0 &&
        typeof value.collisionEnabled === "boolean" &&
        (value.document === undefined ||
          isValidGameTilemapDocument(value.document));
    case "COLLIDER":
      return ["BOX", "CIRCLE", "CAPSULE"].includes(String(value.shape)) &&
        ["DEFAULT", "WORLD", "PLAYER", "NPC", "SENSOR", "PROJECTILE"].includes(
          String(value.layer),
        ) &&
        ["width", "height", "radius"].every((key) =>
          typeof value[key] === "number" && Number.isFinite(value[key]) &&
          Number(value[key]) > 0
        ) && typeof value.isTrigger === "boolean" &&
        typeof value.enabled === "boolean";
    case "RIGIDBODY":
      return ["STATIC", "DYNAMIC", "KINEMATIC"].includes(
        String(value.bodyType),
      ) && typeof value.mass === "number" && Number.isFinite(value.mass) &&
        value.mass > 0 && typeof value.gravityScale === "number" &&
        Number.isFinite(value.gravityScale) &&
        typeof value.fixedRotation === "boolean" &&
        typeof value.enabled === "boolean";
    case "CHARACTER_CONTROLLER":
      return typeof value.moveSpeed === "number" &&
        Number.isFinite(value.moveSpeed) && value.moveSpeed > 0 &&
        typeof value.stepHeight === "number" &&
        Number.isFinite(value.stepHeight) && value.stepHeight >= 0 &&
        Number.isSafeInteger(value.fixedStep) && Number(value.fixedStep) > 0 &&
        typeof value.enabled === "boolean";
    case "CAMERA":
      return typeof value.active === "boolean" &&
        typeof value.zoom === "number" && Number.isFinite(value.zoom) &&
        value.zoom > 0 &&
        (value.camera2D === undefined ||
          isValidGameCamera2DSettings(value.camera2D));
    case "BEHAVIOR":
      return typeof value.enabled === "boolean";
    default:
      return false;
  }
}

const GAME_EDITOR_BINDING_KEYS = new Set([
  "trackId",
  "kind",
  "assetId",
  "revisionId",
  "contentHash",
  "mode",
  "label",
  "assetDefinitionId",
]);

const GAME_EDITOR_TRACK_KEYS = new Set([
  "id",
  "label",
  "kind",
  "filled",
  "parentTrackId",
  "active",
  "role",
  "components",
  "tilemap",
]);
const GAME_EDITOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const PHYSICS_2D_KEYS = new Set([
  "gravity",
  "fixedDeltaTime",
  "maxSubSteps",
  "defaultMaterial",
]);
const PHYSICS_2D_VECTOR_KEYS = new Set(["x", "y"]);
const PHYSICS_2D_MATERIAL_KEYS = new Set(["friction", "bounciness"]);

function validPersistedPhysics2D(value: unknown): value is Physics2DSettings {
  if (!validatePhysics2DSettings(value).valid) return false;
  const candidate = value as unknown as Record<string, unknown>;
  const gravity = candidate.gravity as Record<string, unknown>;
  const material = candidate.defaultMaterial as Record<string, unknown>;
  return Object.keys(candidate).every((key) => PHYSICS_2D_KEYS.has(key)) &&
    Object.keys(candidate).length === PHYSICS_2D_KEYS.size &&
    Object.keys(gravity).every((key) => PHYSICS_2D_VECTOR_KEYS.has(key)) &&
    Object.keys(gravity).length === PHYSICS_2D_VECTOR_KEYS.size &&
    Object.keys(material).every((key) => PHYSICS_2D_MATERIAL_KEYS.has(key)) &&
    Object.keys(material).length === PHYSICS_2D_MATERIAL_KEYS.size;
}

function assertValidTrackHierarchy(tracks: readonly GameEditorTrack[]): void {
  const byId = new Map<string, GameEditorTrack>();
  for (const track of tracks) {
    if (
      !GAME_EDITOR_ID_PATTERN.test(track.id) ||
      typeof track.label !== "string" || typeof track.kind !== "string" ||
      !Array.isArray(track.filled) || byId.has(track.id)
    ) throw new Error("Invalid Game editor track identity.");
    if (
      track.parentTrackId !== undefined &&
      (!GAME_EDITOR_ID_PATTERN.test(track.parentTrackId) ||
        track.parentTrackId === track.id)
    ) throw new Error("Invalid Game editor parent track.");
    if (track.active !== undefined && typeof track.active !== "boolean") {
      throw new Error("Invalid Game editor active flag.");
    }
    if (
      track.tilemap !== undefined &&
      !isValidGameTilemapDocument(track.tilemap)
    ) {
      throw new Error("Invalid Game editor tilemap.");
    }
    byId.set(track.id, track);
  }
  for (const track of tracks) {
    if (
      track.parentTrackId !== undefined && !byId.has(track.parentTrackId)
    ) throw new Error("Game editor parent track is missing.");
    const seen = new Set<string>([track.id]);
    let parentId = track.parentTrackId;
    while (parentId !== undefined) {
      if (seen.has(parentId)) throw new Error("Game editor parent cycle.");
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentTrackId;
    }
  }
}

export type GameBehaviorSourceMode = "SIMPLE" | "GRAPH" | "CODE";

/**
 * Authoring source kept beside canonical Behavior IR. Game owns this source;
 * Draw and Audio assets are referenced by the compiled actions only.
 */
export interface GameBehaviorSourceSnapshot {
  readonly behaviorId: string;
  readonly mode: GameBehaviorSourceMode;
  readonly graph?: VisualGameLogicSource;
  readonly sourceText?: string;
}

function cloneVisualGameLogicSource(
  source: VisualGameLogicSource,
): VisualGameLogicSource {
  return {
    schemaVersion: source.schemaVersion,
    sourceKind: source.sourceKind,
    behaviorId: source.behaviorId,
    nodes: source.nodes.map((node) => {
      switch (node.kind) {
        case "EVENT":
          return { ...node, trigger: { ...node.trigger } };
        case "CONDITION":
          return { ...node, condition: { ...node.condition } };
        case "ACTION":
          return { ...node, action: { ...node.action } };
        case "MERGE":
        case "END":
          return { ...node };
      }
    }),
    edges: source.edges.map((edge) => ({ ...edge })),
  };
}

function referenceOnlyBehaviorSource(
  source: GameBehaviorSourceSnapshot,
): GameBehaviorSourceSnapshot {
  return {
    behaviorId: source.behaviorId,
    mode: source.mode,
    ...(source.graph === undefined
      ? {}
      : { graph: cloneVisualGameLogicSource(source.graph) }),
    ...(source.sourceText === undefined
      ? {}
      : { sourceText: source.sourceText }),
  };
}

function validBehaviorSourceSnapshot(
  source: unknown,
): source is GameBehaviorSourceSnapshot {
  if (
    source === null || typeof source !== "object" || Array.isArray(source)
  ) return false;
  const candidate = source as Record<string, unknown>;
  if (
    typeof candidate.behaviorId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(candidate.behaviorId) ||
    !["SIMPLE", "GRAPH", "CODE"].includes(String(candidate.mode))
  ) return false;
  const mode = String(candidate.mode) as GameBehaviorSourceMode;
  const graph = candidate.graph;
  if (graph !== undefined) {
    if (
      graph === null || typeof graph !== "object" || Array.isArray(graph)
    ) return false;
    const graphCandidate = graph as Record<string, unknown>;
    if (
      graphCandidate.behaviorId !== candidate.behaviorId ||
      !Array.isArray(graphCandidate.nodes) ||
      !Array.isArray(graphCandidate.edges)
    ) return false;
    try {
      if (!validateVisualGameLogic(graph as VisualGameLogicSource).valid) {
        return false;
      }
    } catch {
      return false;
    }
  }
  if (mode === "GRAPH" && graph === undefined) return false;
  if (mode === "CODE") {
    if (
      typeof candidate.sourceText !== "string" ||
      candidate.sourceText.trim().length === 0
    ) return false;
    const sourceText = candidate.sourceText;
    const scriptValidation = validateBoundedGameScript({
      schemaVersion: 1,
      sourceKind: "BOUNDED_SCRIPT",
      behaviorId: candidate.behaviorId as VisualGameLogicSource["behaviorId"],
      language: "typescript",
      sourceText,
    });
    if (!scriptValidation.valid) return false;
  }
  if (
    mode === "SIMPLE" &&
    (graph !== undefined || candidate.sourceText !== undefined)
  ) {
    return false;
  }
  return candidate.sourceText === undefined ||
    typeof candidate.sourceText === "string";
}

export interface GameEditorPersistenceRecord {
  readonly schemaVersion: typeof GAME_EDITOR_PERSISTENCE_SCHEMA_VERSION;
  readonly projectId: string;
  readonly revision: number;
  readonly savedAt: string;
  readonly stateHash: string;
  readonly tracks: readonly GameEditorTrack[];
  /** Optional starter family; legacy records infer RPG/blank from their tracks. */
  readonly creationMode?: GameEditorCreationMode;
  /** Optional scene-wide physics settings; missing means GAME-350 defaults. */
  readonly physics2D?: Physics2DSettings;
  /** Beginner-facing Scene rules; engine components are derived internally. */
  readonly sceneRules?: GameSceneRules;
  /** Beginner-facing event cards; canonical BehaviorIR remains authoritative. */
  readonly eventCards?: readonly GameEventCard[];
  readonly bindings?: readonly GameEditorBinding[];
  /** Canonical no-code Behavior IR; source is persisted separately below. */
  readonly behaviors?: readonly BehaviorIR[];
  /** Visual graph or bounded code source for reopening the same authoring view. */
  readonly behaviorSources?: readonly GameBehaviorSourceSnapshot[];
  /** Game-owned reusable template instances; Draw/Audio source bytes never enter here. */
  readonly templateInstances?: readonly GameTemplateInstance[];
  /** Game-owned animation assignments; iDRAW frames remain source references. */
  readonly animationBindings?: readonly GameAnimationBinding[];
  /** Beginner-facing visual maker selections and UI slot layout. */
  readonly visualMaker?: GameVisualMakerConfig;
  /** Exact PiXYNC canonical checkpoint; omitted by legacy/local-only records. */
  readonly canonicalProject?: GameProject;
  readonly appliedCommandIds?: readonly string[];
}

export interface GameEditorPersistenceSaveResult {
  readonly ok: boolean;
  readonly stale: boolean;
}

/** Optional compare-and-swap guard for a Game editor snapshot. */
export interface GameEditorPersistenceSaveOptions {
  /** Revision 0 and a null hash represent a missing Project record. */
  readonly expectedRevision?: number;
  readonly expectedStateHash?: string | null;
}

export interface GameEditorPersistenceStore {
  readonly available: boolean;
  load(projectId: string): Promise<GameEditorPersistenceRecord | null>;
  save(
    record: GameEditorPersistenceRecord,
    options?: GameEditorPersistenceSaveOptions,
  ): Promise<GameEditorPersistenceSaveResult>;
  clear(projectId: string): Promise<boolean>;
}

export async function createGameEditorPersistenceRecord(
  projectId: string,
  tracks: readonly GameEditorTrack[],
  revision: number,
  savedAt = new Date().toISOString(),
  canonical?: {
    readonly project: GameProject;
    readonly appliedCommandIds: readonly string[];
  },
  bindings: readonly GameEditorBinding[] = [],
  behaviors: readonly BehaviorIR[] = [],
  behaviorSources: readonly GameBehaviorSourceSnapshot[] = [],
  physics2D?: Partial<Physics2DSettings>,
  templateInstances: readonly GameTemplateInstance[] = [],
  animationBindings: readonly GameAnimationBinding[] = [],
  creationMode?: GameEditorCreationMode,
  sceneRules?: GameSceneRules,
  eventCards: readonly GameEventCard[] = [],
  visualMaker?: GameVisualMakerConfig,
): Promise<GameEditorPersistenceRecord> {
  assertValidTrackHierarchy(tracks);
  if (
    templateInstances.some((instance) =>
      !isValidGameTemplateInstance(instance) ||
      (instance.targetTrackId !== undefined &&
        !tracks.some((track) => track.id === instance.targetTrackId))
    ) ||
    new Set(templateInstances.map((instance) => instance.instanceId)).size !==
      templateInstances.length ||
    animationBindings.some((binding) =>
      !isValidGameAnimationBinding(binding) ||
      !tracks.some((track) => track.id === binding.trackId)
    ) ||
    new Set(animationBindings.map((binding) => binding.bindingId)).size !==
      animationBindings.length ||
    (sceneRules !== undefined && !isValidGameSceneRules(sceneRules)) ||
    eventCards.some((card) =>
      !isValidGameEventCard(card) ||
      [card.sourceTrackId, card.targetTrackId, card.audioTrackId].some(
        (trackId) => trackId !== undefined &&
          !tracks.some((track) => track.id === trackId),
      )
    ) ||
    new Set(eventCards.map((card) => card.eventId)).size !== eventCards.length ||
    (visualMaker !== undefined && !isValidGameVisualMakerConfig(visualMaker))
  ) throw new Error("Invalid Game template instances.");
  const normalizedTracks = tracks.map((track) => ({
    id: track.id,
    label: track.label,
    kind: track.kind,
    filled: [...track.filled],
    ...(track.parentTrackId === undefined
      ? {}
      : { parentTrackId: track.parentTrackId }),
    ...(track.active === undefined ? {} : { active: track.active }),
    ...(track.role === undefined ? {} : { role: track.role }),
    ...(track.components === undefined
      ? {}
      : { components: cloneComponents(track.components) }),
    ...(track.tilemap === undefined
      ? {}
      : { tilemap: cloneTilemap(track.tilemap) }),
  }));
  const body = {
    schemaVersion: GAME_EDITOR_PERSISTENCE_SCHEMA_VERSION,
    projectId,
    revision,
    savedAt,
    tracks: normalizedTracks,
    ...(creationMode === undefined ? {} : { creationMode }),
    ...(sceneRules === undefined ? {} : { sceneRules: { ...sceneRules } }),
    ...(eventCards.length === 0 ? {} : {
      eventCards: eventCards.map((card) => ({ ...card })),
    }),
    ...(visualMaker === undefined ? {} : {
      visualMaker: {
        ...visualMaker,
        hero: { ...visualMaker.hero },
        uiSlots: visualMaker.uiSlots.map((slot) => ({ ...slot })),
      },
    }),
    bindings: bindings.map(referenceOnlyBinding),
    behaviors: behaviors.map((behavior) => ({
      ...behavior,
      rules: behavior.rules.map((rule) => ({
        ...rule,
        trigger: { ...rule.trigger },
        conditions: rule.conditions.map((condition) => ({ ...condition })),
        actions: rule.actions.map((action) => ({ ...action })),
      })),
    })),
    ...(physics2D === undefined
      ? {}
      : { physics2D: normalizePhysics2DSettings(physics2D) }),
    ...(behaviorSources.length === 0
      ? {}
      : { behaviorSources: behaviorSources.map(referenceOnlyBehaviorSource) }),
    ...(templateInstances.length === 0 ? {} : {
      templateInstances: templateInstances.map((instance) => ({
        ...instance,
        values: { ...instance.values },
      })),
    }),
    ...(animationBindings.length === 0 ? {} : {
      animationBindings: animationBindings.map((binding) => ({
        ...binding,
        frameIds: [...binding.frameIds],
      })),
    }),
    ...(canonical === undefined ? {} : {
      canonicalProject: canonical.project,
      appliedCommandIds: [...canonical.appliedCommandIds],
    }),
  };
  return { ...body, stateHash: await sha256Hex(body) };
}

export async function validateGameEditorPersistenceRecord(
  record: GameEditorPersistenceRecord,
): Promise<boolean> {
  if (
    record.schemaVersion !== GAME_EDITOR_PERSISTENCE_SCHEMA_VERSION ||
    typeof record.projectId !== "string" ||
    !Number.isSafeInteger(record.revision) || record.revision < 0 ||
    typeof record.savedAt !== "string" || !Array.isArray(record.tracks)
  ) return false;
  const expected = await sha256Hex({
    schemaVersion: record.schemaVersion,
    projectId: record.projectId,
    revision: record.revision,
    savedAt: record.savedAt,
    tracks: record.tracks,
    ...(record.creationMode === undefined
      ? {}
      : { creationMode: record.creationMode }),
    ...(record.physics2D === undefined ? {} : { physics2D: record.physics2D }),
    ...(record.sceneRules === undefined ? {} : { sceneRules: record.sceneRules }),
    ...(record.eventCards === undefined ? {} : { eventCards: record.eventCards }),
    ...(record.visualMaker === undefined
      ? {}
      : { visualMaker: record.visualMaker }),
    ...(record.bindings === undefined ? {} : { bindings: record.bindings }),
    ...(record.behaviors === undefined ? {} : { behaviors: record.behaviors }),
    ...(record.behaviorSources === undefined
      ? {}
      : { behaviorSources: record.behaviorSources }),
    ...(record.templateInstances === undefined
      ? {}
      : { templateInstances: record.templateInstances }),
    ...(record.animationBindings === undefined
      ? {}
      : { animationBindings: record.animationBindings }),
    ...(record.canonicalProject === undefined
      ? {}
      : { canonicalProject: record.canonicalProject }),
    ...(record.appliedCommandIds === undefined
      ? {}
      : { appliedCommandIds: record.appliedCommandIds }),
  });
  if (record.stateHash !== expected) return false;
  if (
    record.creationMode !== undefined &&
    ![
      "RPG_TEMPLATE",
      "ACTION_2D",
      "DODGE_2D",
      "SCROLL_2D",
      "BLANK",
    ].includes(record.creationMode)
  ) return false;
  if (
    record.physics2D !== undefined &&
    !validPersistedPhysics2D(record.physics2D)
  ) return false;
  if (
    record.sceneRules !== undefined &&
    !isValidGameSceneRules(record.sceneRules)
  ) return false;
  if (
    record.eventCards !== undefined &&
    (!Array.isArray(record.eventCards) ||
      new Set(record.eventCards.map((card) => card.eventId)).size !==
        record.eventCards.length ||
      record.eventCards.some((card) =>
        !isValidGameEventCard(card) ||
        [card.sourceTrackId, card.targetTrackId, card.audioTrackId].some(
          (trackId) => trackId !== undefined &&
            !record.tracks.some((track) => track.id === trackId),
        )
      ))
  ) return false;
  if (
    record.visualMaker !== undefined &&
    !isValidGameVisualMakerConfig(record.visualMaker)
  ) return false;
  if (record.canonicalProject !== undefined) {
    try {
      const candidate = record.canonicalProject;
      if (String(candidate.projectId) !== record.projectId) return false;
      const { snapshotHash, ...revision } = candidate.revision;
      const verified = await createGameProject(
        { ...candidate, revision },
        {
          projectId: candidate.projectId,
          ownerId: candidate.ownerId,
          revisionId: candidate.revision.revisionId,
        },
      );
      if (verified.revision.snapshotHash !== snapshotHash) return false;
      const canonicalTracks = candidate.editorTimeline?.tracks.map((track) => ({
        id: track.trackId,
        label: track.label,
        kind: track.kind,
        filled: [...track.activeFrames],
        ...((track as unknown as GameEditorTrack).parentTrackId === undefined
          ? {}
          : {
            parentTrackId: (track as unknown as GameEditorTrack).parentTrackId,
          }),
        ...((track as unknown as GameEditorTrack).active === undefined
          ? {}
          : { active: (track as unknown as GameEditorTrack).active }),
        ...(track.role === undefined ? {} : { role: track.role }),
        ...(track.components === undefined
          ? {}
          : { components: cloneComponents(track.components) }),
        ...(track.tilemap === undefined
          ? {}
          : { tilemap: cloneTilemap(track.tilemap) }),
      })) ?? [];
      if (await sha256Hex(canonicalTracks) !== await sha256Hex(record.tracks)) {
        return false;
      }
      if (
        await sha256Hex(candidate.editorTimeline?.templateInstances ?? []) !==
          await sha256Hex(record.templateInstances ?? [])
      ) return false;
      if (
        await sha256Hex(candidate.editorTimeline?.animationBindings ?? []) !==
          await sha256Hex(record.animationBindings ?? [])
      ) return false;
      if (
        await sha256Hex(candidate.editorTimeline?.sceneRules) !==
          await sha256Hex(record.sceneRules)
      ) return false;
      if (
        candidate.editorTimeline?.creationMode !== record.creationMode
      ) return false;
      if (
        await sha256Hex(candidate.editorTimeline?.eventCards ?? []) !==
          await sha256Hex(record.eventCards ?? [])
      ) return false;
      const scene = candidate.scenes.find((item) =>
        String(item.sceneId).startsWith("scene:pixieed-game:")
      ) as
        | (typeof candidate.scenes)[number] & {
          readonly physics2D?: Physics2DSettings;
        }
        | undefined;
      if (
        await sha256Hex(scene?.physics2D) !==
          await sha256Hex(record.physics2D)
      ) return false;
      const entityByTrackId = new Map(
        (scene?.entities ?? []).map((entity) => [
          String(entity.entityId).replace("entity:pixieed-game:", ""),
          entity,
        ]),
      );
      for (const track of record.tracks) {
        const entity = entityByTrackId.get(track.id) as
          | (typeof candidate.scenes)[number]["entities"][number] & {
            readonly active?: boolean;
          }
          | undefined;
        if (entity === undefined) return false;
        const parentId = entity.parentEntityId === undefined
          ? undefined
          : String(entity.parentEntityId).replace(
            "entity:pixieed-game:",
            "",
          );
        if (
          parentId !== track.parentTrackId || entity.active !== track.active
        ) {
          return false;
        }
      }
    } catch {
      return false;
    }
  }
  if (
    record.bindings !== undefined &&
    (!Array.isArray(record.bindings) ||
      record.bindings.some((binding) =>
        binding === null || typeof binding !== "object" ||
        typeof binding.trackId !== "string" ||
        (binding.kind !== "DRAW" && binding.kind !== "AUDIO") ||
        typeof binding.assetId !== "string" ||
        typeof binding.revisionId !== "string" ||
        !/^[a-f0-9]{64}$/u.test(binding.contentHash) ||
        (binding.mode !== "LIVE" && binding.mode !== "PINNED") ||
        typeof binding.label !== "string" ||
        (binding.assetDefinitionId !== undefined &&
          (binding.kind !== "DRAW" ||
            typeof binding.assetDefinitionId !== "string" ||
            !GAME_EDITOR_ID_PATTERN.test(binding.assetDefinitionId))) ||
        Object.keys(binding).some((key) => !GAME_EDITOR_BINDING_KEYS.has(key))
      ))
  ) return false;
  if (
    record.behaviorSources !== undefined &&
    (!Array.isArray(record.behaviorSources) ||
      record.behaviorSources.some((source) =>
        !validBehaviorSourceSnapshot(source)
      ))
  ) return false;
  if (
    record.templateInstances !== undefined &&
    (!Array.isArray(record.templateInstances) ||
      new Set(record.templateInstances.map((instance) => instance.instanceId))
          .size !==
        record.templateInstances.length ||
      record.templateInstances.some((instance) =>
        !isValidGameTemplateInstance(instance)
      ))
  ) return false;
  if (
    record.animationBindings !== undefined &&
    (!Array.isArray(record.animationBindings) ||
      new Set(record.animationBindings.map((binding) => binding.bindingId))
          .size !== record.animationBindings.length ||
      record.animationBindings.some((binding) =>
        !isValidGameAnimationBinding(binding) ||
        !record.tracks.some((track) => track.id === binding.trackId)
      ))
  ) return false;
  if (
    record.behaviors !== undefined &&
    (!Array.isArray(record.behaviors) ||
      record.behaviors.some((behavior) =>
        behavior === null || typeof behavior !== "object" ||
        typeof behavior.behaviorId !== "string" || behavior.version !== 1 ||
        behavior.ownership !== "CANONICAL_IR" ||
        !Array.isArray(behavior.rules) ||
        behavior.rules.some((rule: unknown) => {
          if (rule === null || typeof rule !== "object") return true;
          const candidate = rule as Record<string, unknown>;
          return typeof candidate.ruleId !== "string" ||
            typeof candidate.enabled !== "boolean" ||
            candidate.trigger === null ||
            typeof candidate.trigger !== "object" ||
            !Array.isArray(candidate.conditions) ||
            !Array.isArray(candidate.actions);
        })
      ))
  ) return false;
  return (
    (record.appliedCommandIds === undefined ||
      (Array.isArray(record.appliedCommandIds) &&
        record.appliedCommandIds.every((id) => typeof id === "string"))) &&
    record.tracks.every((track) =>
      track !== null && typeof track === "object" &&
      Object.keys(track).every((key) => GAME_EDITOR_TRACK_KEYS.has(key)) &&
      typeof track.id === "string" && typeof track.label === "string" &&
      typeof track.kind === "string" && Array.isArray(track.filled) &&
      GAME_EDITOR_ID_PATTERN.test(track.id) &&
      (track.parentTrackId === undefined ||
        (typeof track.parentTrackId === "string" &&
          GAME_EDITOR_ID_PATTERN.test(track.parentTrackId) &&
          track.parentTrackId !== track.id)) &&
      (track.active === undefined || typeof track.active === "boolean") &&
      track.filled.every((frame: number) =>
        Number.isSafeInteger(frame) && frame >= 0
      ) &&
      (track.role === undefined ||
        [
          "PLAYER",
          "NPC",
          "PROP",
          "TRIGGER",
          "TILEMAP",
          "CAMERA",
          "AUDIO",
          "CUSTOM",
        ].includes(track.role)) &&
      (track.components === undefined ||
        (Array.isArray(track.components) &&
          new Set(
              track.components.map((component: GameComponentState) =>
                String(component.componentId)
              ),
            ).size === track.components.length &&
          track.components.every(validEditorComponent))) &&
      (track.tilemap === undefined ||
        isValidGameTilemapDocument(track.tilemap))
    ) && (() => {
      try {
        assertValidTrackHierarchy(record.tracks);
        for (const instance of record.templateInstances ?? []) {
          if (
            instance.targetTrackId !== undefined &&
            !record.tracks.some((track) => track.id === instance.targetTrackId)
          ) return false;
        }
        for (const binding of record.animationBindings ?? []) {
          if (!record.tracks.some((track) => track.id === binding.trackId)) {
            return false;
          }
        }
        return true;
      } catch {
        return false;
      }
    })()
  );
}

function isNewer(
  incoming: GameEditorPersistenceRecord,
  current: GameEditorPersistenceRecord | undefined,
): boolean {
  if (current === undefined) return true;
  if (incoming.revision !== current.revision) {
    return incoming.revision > current.revision;
  }
  return incoming.savedAt >= current.savedAt;
}

function matchesExpected(
  current: GameEditorPersistenceRecord | undefined,
  options: GameEditorPersistenceSaveOptions | undefined,
): boolean {
  if (options?.expectedRevision !== undefined &&
    (current?.revision ?? 0) !== options.expectedRevision) return false;
  if (options?.expectedStateHash !== undefined &&
    (current?.stateHash ?? null) !== options.expectedStateHash) return false;
  return true;
}

function openGameDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    const request = indexedDB.open(name, GAME_EDITOR_PERSISTENCE_DB_VERSION);
    request.onupgradeneeded = () => {
      if (
        !request.result.objectStoreNames.contains(
          GAME_EDITOR_PERSISTENCE_STORE_NAME,
        )
      ) {
        request.result.createObjectStore(GAME_EDITOR_PERSISTENCE_STORE_NAME, {
          keyPath: "projectId",
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Game DB open failed."));
    request.onblocked = () => reject(new Error("Game DB open was blocked."));
  });
}

export function createIndexedDbGameEditorPersistenceStore(
  databaseName = GAME_EDITOR_PERSISTENCE_DB_NAME,
): GameEditorPersistenceStore {
  const available = typeof indexedDB !== "undefined";
  return {
    available,
    async load(projectId) {
      if (!available) return null;
      try {
        const database = await openGameDatabase(databaseName);
        return await new Promise<GameEditorPersistenceRecord | null>(
          (resolve) => {
            const request = database.transaction(
              GAME_EDITOR_PERSISTENCE_STORE_NAME,
              "readonly",
            ).objectStore(GAME_EDITOR_PERSISTENCE_STORE_NAME).get(projectId);
            request.onsuccess = () => {
              database.close();
              resolve(
                (request.result as GameEditorPersistenceRecord | undefined) ??
                  null,
              );
            };
            request.onerror = () => {
              database.close();
              resolve(null);
            };
          },
        );
      } catch {
        return null;
      }
    },
    async save(record, options) {
      if (!available) return { ok: false, stale: false };
      try {
        const database = await openGameDatabase(databaseName);
        return await new Promise<GameEditorPersistenceSaveResult>((resolve) => {
          let stale = false;
          const transaction = database.transaction(
            GAME_EDITOR_PERSISTENCE_STORE_NAME,
            "readwrite",
          );
          const store = transaction.objectStore(
            GAME_EDITOR_PERSISTENCE_STORE_NAME,
          );
          const read = store.get(record.projectId);
          read.onsuccess = () => {
            const current = read.result as
              | GameEditorPersistenceRecord
              | undefined;
            if (!matchesExpected(current, options)) stale = true;
            else if (isNewer(record, current)) store.put(record);
            else stale = true;
          };
          read.onerror = () => transaction.abort();
          transaction.oncomplete = () => {
            database.close();
            resolve({ ok: true, stale });
          };
          transaction.onerror = () => {
            database.close();
            resolve({ ok: false, stale: false });
          };
          transaction.onabort = () => {
            database.close();
            resolve({ ok: false, stale: false });
          };
        });
      } catch {
        return { ok: false, stale: false };
      }
    },
    async clear(projectId) {
      if (!available) return false;
      try {
        const database = await openGameDatabase(databaseName);
        return await new Promise<boolean>((resolve) => {
          const transaction = database.transaction(
            GAME_EDITOR_PERSISTENCE_STORE_NAME,
            "readwrite",
          );
          transaction.objectStore(GAME_EDITOR_PERSISTENCE_STORE_NAME).delete(
            projectId,
          );
          transaction.oncomplete = () => {
            database.close();
            resolve(true);
          };
          transaction.onerror = () => {
            database.close();
            resolve(false);
          };
          transaction.onabort = () => {
            database.close();
            resolve(false);
          };
        });
      } catch {
        return false;
      }
    },
  };
}

export function createMemoryGameEditorPersistenceStore(): GameEditorPersistenceStore {
  const records = new Map<string, GameEditorPersistenceRecord>();
  return {
    available: true,
    async load(projectId) {
      return records.get(projectId) ?? null;
    },
    async save(record, options) {
      const current = records.get(record.projectId);
      if (!matchesExpected(current, options) || !isNewer(record, current)) {
        return { ok: true, stale: true };
      }
      records.set(record.projectId, record);
      return { ok: true, stale: false };
    },
    async clear(projectId) {
      records.delete(projectId);
      return true;
    },
  };
}
