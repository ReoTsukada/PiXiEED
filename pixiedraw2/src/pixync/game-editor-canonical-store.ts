/** Lossless Game editor timeline boundary for the Game-300 PiXYNC adapter. */
import type {
  GameEditorBinding,
  GameEditorPersistenceRecord,
} from "../workspace/game-persistence.ts";
import { validateGameEditorPersistenceRecord } from "../workspace/game-persistence.ts";
import {
  appendJournalCommand,
  asAssetId,
  asAssetRevisionId,
  asBehaviorId,
  asComponentId,
  asEntityId,
  asOwnerId,
  asProjectId,
  asRevisionId,
  asSceneId,
  asSha256,
  type CallerContext,
  type Component,
  createGameProject,
  createJournal,
  type Entity,
  type GameComponentState,
  type GameProject,
  type GameTilemapDocument,
  type JournalCommand,
  type JournalState,
  type Scene,
  sha256,
} from "../game/game-300/core.ts";
import { DEFAULT_GAME_RUNTIME_PROFILE_ID } from "../game/game-350/runtime-core.ts";
import type { Physics2DSettings } from "../game/game-350/physics-2d.ts";

const EDITOR_SCENE_PREFIX = "scene:pixieed-game:";
const EDITOR_ENTITY_PREFIX = "entity:pixieed-game:";
const EDITOR_TRANSFORM_PREFIX = "component:pixieed-transform:";

type CanonicalEditorTrack = GameEditorPersistenceRecord["tracks"][number];
type CanonicalTimelineTrack = {
  readonly trackId: string;
  readonly label: string;
  readonly kind: string;
  readonly activeFrames: readonly number[];
  readonly parentTrackId?: string;
  readonly active?: boolean;
  readonly role?: NonNullable<CanonicalEditorTrack["role"]>;
  readonly components?: NonNullable<CanonicalEditorTrack["components"]>;
  readonly tilemap?: GameTilemapDocument;
};
type CanonicalEntity = Entity & {
  readonly active?: boolean;
};
type CanonicalScene = Scene & {
  readonly physics2D?: Physics2DSettings;
  readonly entities: readonly CanonicalEntity[];
};

function assertValidTrackHierarchy(
  tracks: readonly GameEditorPersistenceRecord["tracks"][number][],
): void {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  if (byId.size !== tracks.length) throw new Error("Duplicate Game track id.");
  for (const track of tracks) {
    if (track.parentTrackId === track.id) {
      throw new Error("A Game track cannot parent itself.");
    }
    if (
      track.parentTrackId !== undefined &&
      !byId.has(track.parentTrackId)
    ) throw new Error("Game track parent is missing.");
    const seen = new Set([track.id]);
    let parentId = track.parentTrackId;
    while (parentId !== undefined) {
      if (seen.has(parentId)) throw new Error("Game track parent cycle.");
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentTrackId;
    }
  }
}

function editorSceneId(projectId: string) {
  return asSceneId(`${EDITOR_SCENE_PREFIX}${projectId}`);
}

function editorEntityId(trackId: string) {
  return asEntityId(`${EDITOR_ENTITY_PREFIX}${trackId}`);
}

function editorTransformId(trackId: string) {
  return asComponentId(`${EDITOR_TRANSFORM_PREFIX}${trackId}`);
}

function canonicalComponentFromEditorState(
  component: GameComponentState,
): Component | undefined {
  switch (component.type) {
    case "TRANSFORM":
    case "TILEMAP":
    case "COLLIDER":
    case "RIGIDBODY":
    case "CHARACTER_CONTROLLER":
    case "CAMERA":
      return component;
    case "SPRITE":
    case "AUDIO_SOURCE":
    case "BEHAVIOR":
      // Asset and behavior components are completed from their canonical
      // bindings/Behavior IR below. The editor state only controls flags.
      return undefined;
  }
}

function sceneFromEditorTracks(
  projectId: string,
  tracks: GameEditorPersistenceRecord["tracks"],
  bindings: readonly GameEditorBinding[],
  behaviors: GameEditorPersistenceRecord["behaviors"],
  previous: Scene | undefined,
  physics2D?: Physics2DSettings,
): Scene {
  assertValidTrackHierarchy(tracks);
  const bindingsByTrack = new Map(
    bindings.map((binding) => [binding.trackId, binding]),
  );
  const behaviorIds = new Set(
    (behaviors ?? []).map((behavior) => String(behavior.behaviorId)),
  );
  const previousById = new Map(
    (previous?.entities ?? []).map((
      entity,
    ) => [String(entity.entityId), entity]),
  );
  const entities: CanonicalEntity[] = tracks.map((track, index) => {
    const entityId = editorEntityId(track.id);
    const prior = previousById.get(String(entityId));
    const {
      parentEntityId: _priorParentEntityId,
      active: _priorActive,
      ...priorWithoutHierarchy
    } = (prior as CanonicalEntity | undefined) ?? {};
    const configuredTransform = track.components?.find((component) =>
      component.type === "TRANSFORM"
    );
    const transform = configuredTransform ??
      prior?.components.find((component) => component.type === "TRANSFORM") ?? {
      type: "TRANSFORM" as const,
      componentId: editorTransformId(track.id),
      x: track.id === "hero" ? 1 : track.id === "enemy" ? 5 : 0,
      y: track.id === "hero" ? 1 : track.id === "enemy" ? 3 : 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    };
    const binding = bindingsByTrack.get(track.id);
    const nonAssetComponents = track.components === undefined
      ? (prior?.components ?? []).filter((component) =>
        component.type !== "TRANSFORM" && component.type !== "SPRITE" &&
        component.type !== "AUDIO_SOURCE" &&
        (component.type !== "BEHAVIOR" ||
          !String(component.behaviorId).startsWith("behavior:pixiedraw-game:"))
      )
      : track.components
        .filter((component) => component.type !== "TRANSFORM")
        .map(canonicalComponentFromEditorState)
        .filter((component): component is Component => component !== undefined);
    const projectedComponents = nonAssetComponents.map((component) =>
      component.type === "TILEMAP" && track.tilemap !== undefined
        ? { ...component, document: track.tilemap }
        : component
    );
    const behaviorId = `behavior:pixiedraw-game:${track.id}`;
    const behaviorComponent: Component | undefined = behaviorIds.has(behaviorId)
      ? {
        type: "BEHAVIOR",
        componentId: asComponentId(`component:pixiedraw-behavior:${track.id}`),
        behaviorId: asBehaviorId(behaviorId),
      }
      : undefined;
    const boundComponent: Component | undefined = binding === undefined
      ? undefined
      : binding.kind === "DRAW"
      ? {
        type: "SPRITE",
        componentId: asComponentId(`component:pixieed-sprite:${track.id}`),
        asset: {
          kind: "DRAW",
          assetId: asAssetId(binding.assetId),
          revisionId: asAssetRevisionId(binding.revisionId),
          ownerId: asOwnerId(projectId),
          contentHash: asSha256(binding.contentHash),
          mode: binding.mode,
        },
        visible: true,
      }
      : {
        type: "AUDIO_SOURCE",
        componentId: asComponentId(`component:pixieed-audio:${track.id}`),
        asset: {
          kind: "AUDIO",
          assetId: asAssetId(binding.assetId),
          revisionId: asAssetRevisionId(binding.revisionId),
          ownerId: asOwnerId(projectId),
          contentHash: asSha256(binding.contentHash),
          mode: binding.mode,
        },
        loop: track.kind === "MUSIC",
        volume: 1,
      };
    return {
      ...priorWithoutHierarchy,
      entityId,
      name: track.label.trim() || `Object ${index + 1}`,
      ...(track.parentTrackId === undefined
        ? {}
        : { parentEntityId: editorEntityId(track.parentTrackId) }),
      ...(track.active === undefined ? {} : { active: track.active }),
      components: [
        transform,
        ...projectedComponents,
        ...(behaviorComponent === undefined ? [] : [behaviorComponent]),
        ...(boundComponent === undefined ? [] : [boundComponent]),
      ],
    };
  });
  const scene: CanonicalScene = {
    sceneId: previous?.sceneId ?? editorSceneId(projectId),
    name: previous?.name ?? "Main Scene",
    rootEntityIds: tracks.filter((track) => track.parentTrackId === undefined)
      .map((track) => editorEntityId(track.id)),
    entities,
    ...(physics2D === undefined ? {} : { physics2D }),
  };
  return scene;
}

function reconcileEditorScene(
  projectId: string,
  tracks: GameEditorPersistenceRecord["tracks"],
  bindings: readonly GameEditorBinding[],
  behaviors: GameEditorPersistenceRecord["behaviors"],
  previousScenes: readonly Scene[] | undefined,
  physics2D?: Physics2DSettings,
): readonly Scene[] {
  const id = String(editorSceneId(projectId));
  const existing = previousScenes?.find((scene) =>
    String(scene.sceneId) === id
  );
  const next = sceneFromEditorTracks(
    projectId,
    tracks,
    bindings,
    behaviors,
    existing,
    physics2D,
  );
  const retained = (previousScenes ?? []).filter((scene) =>
    String(scene.sceneId) !== id
  );
  return [next, ...retained];
}

async function revisionId(
  record: GameEditorPersistenceRecord,
): Promise<string> {
  const contentHash = await sha256({
    projectId: record.projectId,
    revision: record.revision,
    tracks: [...record.tracks].sort((left, right) =>
      left.id.localeCompare(right.id)
    ).map((track) => ({
      id: track.id,
      label: track.label,
      kind: track.kind,
      filled: [...track.filled].sort((left, right) => left - right),
      ...(track.parentTrackId === undefined
        ? {}
        : { parentTrackId: track.parentTrackId }),
      ...(track.active === undefined ? {} : { active: track.active }),
      ...(track.role === undefined ? {} : { role: track.role }),
      ...(track.components === undefined ? {} : {
        components: track.components.map((component) => ({ ...component })),
      }),
      ...(track.tilemap === undefined ? {} : { tilemap: track.tilemap }),
    })),
    bindings: [...(record.bindings ?? [])].sort((left, right) =>
      left.trackId.localeCompare(right.trackId)
    ),
    behaviors: [...(record.behaviors ?? [])].sort((left, right) =>
      String(left.behaviorId).localeCompare(String(right.behaviorId))
    ),
    ...(record.physics2D === undefined ? {} : { physics2D: record.physics2D }),
    ...(record.sceneRules === undefined ? {} : { sceneRules: record.sceneRules }),
    ...(record.eventCards === undefined ? {} : {
      eventCards: [...record.eventCards].sort((left, right) =>
        left.eventId.localeCompare(right.eventId)
      ),
    }),
    ...(record.templateInstances === undefined ? {} : {
      templateInstances: [...record.templateInstances].sort((left, right) =>
        left.instanceId.localeCompare(right.instanceId)
      ),
    }),
    ...(record.animationBindings === undefined ? {} : {
      animationBindings: [...record.animationBindings].sort((left, right) =>
        left.bindingId.localeCompare(right.bindingId)
      ).map((binding) => ({
        ...binding,
        frameIds: [...binding.frameIds],
      })),
    }),
  });
  return `game-editor-revision:${record.revision}:${
    String(contentHash).slice(0, 16)
  }`;
}

function caller(project: GameProject): CallerContext {
  return {
    projectId: project.projectId,
    ownerId: project.ownerId,
    revisionId: project.revision.revisionId,
  };
}

async function projectFromRecord(
  record: GameEditorPersistenceRecord,
  previous?: GameProject,
): Promise<GameProject> {
  const projectId = asProjectId(record.projectId);
  // The room/project identity is stable across all collaborators; an editor's
  // personal actor id must never become canonical Game ownership.
  const ownerId = asOwnerId(record.projectId);
  const nextRevisionId = asRevisionId(await revisionId(record));
  const previousEditorScene = previous?.scenes.find((scene) =>
    String(scene.sceneId) === String(editorSceneId(projectId))
  ) as CanonicalScene | undefined;
  return createGameProject({
    schemaVersion: 1,
    projectId,
    ownerId,
    name: "PiXiEED Game",
    revision: {
      revisionId: nextRevisionId,
      projectId,
      ownerId,
      sequence: Math.max(1, record.revision + 1),
      ...(previous === undefined
        ? {}
        : { parentRevisionId: previous.revision.revisionId }),
    },
    scenes: reconcileEditorScene(
      projectId,
      record.tracks,
      record.bindings ?? [],
      record.behaviors ?? previous?.behaviors ?? [],
      previous?.scenes,
      record.physics2D ?? previousEditorScene?.physics2D,
    ),
    prefabs: previous?.prefabs ?? [],
    dependencies: previous?.dependencies.map((dependency) => ({
      ...dependency,
      ownerRevisionId: nextRevisionId,
    })) ?? [],
    behaviors: record.behaviors ?? previous?.behaviors ?? [],
    runtimeProfile: previous?.runtimeProfile ?? {
      schemaVersion: 1,
      profileId: DEFAULT_GAME_RUNTIME_PROFILE_ID,
    },
    editorTimeline: {
      frameCount: 16,
      ...(record.creationMode === undefined ? {} : {
        creationMode: record.creationMode,
      }),
      tracks: record.tracks.map((track) => ({
        trackId: track.id,
        label: track.label,
        kind: track.kind,
        activeFrames: [...track.filled],
        ...(track.parentTrackId === undefined
          ? {}
          : { parentTrackId: track.parentTrackId }),
        ...(track.active === undefined ? {} : { active: track.active }),
        ...(track.role === undefined ? {} : { role: track.role }),
        ...(track.components === undefined ? {} : {
          components: track.components.map((component) => ({ ...component })),
        }),
        ...(track.tilemap === undefined ? {} : { tilemap: track.tilemap }),
      })) as readonly CanonicalTimelineTrack[],
      ...(record.sceneRules === undefined ? {} : { sceneRules: record.sceneRules }),
      ...(record.eventCards === undefined ? {} : {
        eventCards: record.eventCards.map((card) => ({ ...card })),
      }),
      ...(record.templateInstances === undefined ? {} : {
        templateInstances: record.templateInstances.map((instance) => ({
          ...instance,
          values: { ...instance.values },
        })),
      }),
      ...(record.animationBindings === undefined ? {} : {
        animationBindings: record.animationBindings.map((binding) => ({
          ...binding,
          frameIds: [...binding.frameIds],
        })),
      }),
    },
  }, {
    projectId,
    ownerId,
    revisionId: nextRevisionId,
  });
}

export class GameEditorCanonicalStore {
  #journal: JournalState;
  readonly #revisions = new Map<string, GameProject>();
  readonly #remoteCommandIds = new Set<string>();

  private constructor(initial: GameProject) {
    this.#journal = createJournal(initial, caller(initial));
    this.#remember(initial);
  }

  static async create(
    record: GameEditorPersistenceRecord,
  ): Promise<GameEditorCanonicalStore> {
    if (!await validateGameEditorPersistenceRecord(record)) {
      throw new Error("Game editor record failed canonical validation.");
    }
    return new GameEditorCanonicalStore(await projectFromRecord(record));
  }

  static restore(
    project: GameProject,
    appliedCommandIds: readonly string[] = [],
  ): GameEditorCanonicalStore {
    const store = new GameEditorCanonicalStore(project);
    for (const commandId of appliedCommandIds) {
      store.#remoteCommandIds.add(commandId);
    }
    return store;
  }

  get project(): GameProject {
    return this.#journal.current;
  }

  get undoDepth(): number {
    return this.#journal.past.length;
  }

  get redoDepth(): number {
    return this.#journal.future.length;
  }

  get appliedCommandIds(): readonly string[] {
    return [
      ...this.#journal.past.map((command) => command.commandId),
      ...this.#remoteCommandIds,
    ];
  }

  async commitLocal(
    record: GameEditorPersistenceRecord,
  ): Promise<JournalCommand | undefined> {
    if (!await validateGameEditorPersistenceRecord(record)) {
      throw new Error("Game editor record failed canonical validation.");
    }
    if (record.projectId !== String(this.project.projectId)) {
      throw new Error("Game editor record belongs to another project.");
    }
    const next = await projectFromRecord(record, this.project);
    if (next.revision.snapshotHash === this.project.revision.snapshotHash) {
      return undefined;
    }
    const commandId = `game-editor-command:${record.revision}:${
      record.stateHash.slice(0, 16)
    }`;
    this.#journal = await appendJournalCommand(
      this.#journal,
      next,
      caller(next),
      commandId,
    );
    this.#remember(next);
    return this.#journal.past.at(-1);
  }

  resolve(afterHash: string, revision: string): GameProject | undefined {
    return this.#revisions.get(`${afterHash}:${revision}`);
  }

  applyRemote(next: GameProject, commandId: string): void {
    if (String(next.projectId) !== String(this.project.projectId)) {
      throw new Error("Remote Game revision belongs to another project.");
    }
    // Preserve local history stacks. A remote revision advances only current.
    this.#journal = { ...this.#journal, current: next };
    this.#remoteCommandIds.add(commandId);
    this.#remember(next);
  }

  #remember(project: GameProject): void {
    this.#revisions.set(
      `${String(project.revision.snapshotHash)}:${
        String(project.revision.revisionId)
      }`,
      project,
    );
  }
}
