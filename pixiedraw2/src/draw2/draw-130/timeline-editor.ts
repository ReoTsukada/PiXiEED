/**
 * DRAW-130 Layer / Frame / Cel / Timeline adapter.
 *
 * Structural commands are kept in one bounded adapter until the canonical
 * Core schema gains structural execution. The adapter still uses the Core
 * ProjectState, identity, structureEpoch, COW snapshots, deterministic
 * operation IDs, and one-operation/one-Undo semantics. It has no DOM, Canvas,
 * storage, network, provider, current-route, or production-system imports.
 */
import {
  cloneProjectStateShared,
  createProject,
  type CreateProjectOptions,
  type Draw2Cel,
  type Draw2Frame,
  type Draw2Layer,
  type Draw2Timeline,
  type ProjectState,
  sha256Hex,
} from "../../draw2-core.ts";

export type Draw130OperationType =
  | "timeline.addLayerTrack"
  | "timeline.removeLayerTrack"
  | "timeline.duplicateLayerTrack"
  | "timeline.reorderLayerTrack"
  | "timeline.renameLayerTrack"
  | "timeline.setLayerVisibility"
  | "timeline.setLayerOpacity"
  | "timeline.setLayerLock"
  | "timeline.addFrame"
  | "timeline.removeFrame"
  | "timeline.duplicateFrame"
  | "timeline.reorderFrame"
  | "timeline.changeFrameDuration"
  | "timeline.createCel"
  | "timeline.clearCel"
  | "timeline.replaceCelBinding"
  | "timeline.setTag";

export interface Draw130Tag {
  readonly id: string;
  readonly name: string;
  readonly startFrameId: string;
  readonly endFrameId: string;
  readonly color: number;
}

export interface Draw130TimelineMetadata {
  readonly fps: number;
  readonly onionSkin: {
    readonly enabled: boolean;
    readonly before: number;
    readonly after: number;
  };
  readonly tags: readonly Draw130Tag[];
}

export interface Draw130ProjectionRow {
  readonly index: number;
  readonly id: string;
}

export interface Draw130CellProjection {
  readonly layerId: string;
  readonly frameId: string;
  readonly celId: string;
  readonly bindingMode: Draw2Cel["bindingMode"];
}

export interface Draw130TimelineProjection {
  readonly totalFrames: number;
  readonly totalLayers: number;
  readonly frameStart: number;
  readonly frameEndExclusive: number;
  readonly layerStart: number;
  readonly layerEndExclusive: number;
  readonly overscan: number;
  readonly visibleFrames: readonly Draw130ProjectionRow[];
  readonly visibleLayers: readonly Draw130ProjectionRow[];
  readonly cells: readonly Draw130CellProjection[];
  readonly metrics: {
    readonly totalItems: number;
    readonly visibleItems: number;
    readonly overscanItems: number;
    readonly mountedItems: number;
    readonly renderedItems: number;
  };
}

export interface Draw130OnionProjection {
  readonly enabled: boolean;
  readonly currentFrameId: string;
  readonly before: readonly {
    readonly frameId: string;
    readonly offset: number;
    readonly celIds: readonly string[];
  }[];
  readonly after: readonly {
    readonly frameId: string;
    readonly offset: number;
    readonly celIds: readonly string[];
  }[];
}

export interface Draw130PlaybackState {
  readonly playing: boolean;
  readonly frameId: string;
  readonly loop: boolean;
}

export interface Draw130Operation {
  readonly operationId: string;
  readonly operationType: Draw130OperationType;
  readonly schemaVersion: 1;
  readonly commandId: string;
  readonly projectId: string;
  readonly assetId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly clientSequence: number;
  readonly structureEpoch: number;
  readonly payload: unknown;
}

export interface Draw130Result {
  readonly operation: Draw130Operation;
  readonly state: ProjectState;
  readonly dirtyDomains: readonly (
    | "TIMELINE_STRUCTURE_DIRTY"
    | "TIMELINE_CELL_DIRTY"
    | "LAYER_METADATA_DIRTY"
    | "ONION_SKIN_DIRTY"
  )[];
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly fullTimelineRebuildCount: 0;
}

export interface Draw130Rejected {
  readonly state: ProjectState;
  readonly diagnostics: readonly {
    readonly code: string;
    readonly severity: "error";
    readonly message: string;
    readonly path?: string;
  }[];
  readonly undoDepth: number;
  readonly redoDepth: number;
}

export type Draw130Execution = Draw130Result | Draw130Rejected;

interface Draw130Snapshot {
  readonly state: ProjectState;
  readonly metadata: Draw130TimelineMetadata;
}

interface Draw130HistoryEntry {
  readonly before: Draw130Snapshot;
  readonly after: Draw130Snapshot;
  readonly operation: Draw130Operation;
}

function diagnostic(code: string, message: string, path?: string) {
  return path === undefined
    ? { code, severity: "error" as const, message }
    : { code, severity: "error" as const, message, path };
}

function cloneMetadata(
  metadata: Draw130TimelineMetadata,
): Draw130TimelineMetadata {
  return {
    fps: metadata.fps,
    onionSkin: { ...metadata.onionSkin },
    tags: metadata.tags.map((tag) => ({ ...tag })),
  };
}

function cloneSnapshot(snapshot: Draw130Snapshot): Draw130Snapshot {
  return {
    state: cloneProjectStateShared(snapshot.state),
    metadata: cloneMetadata(snapshot.metadata),
  };
}

function findCel(
  state: ProjectState,
  layerId: string,
  frameId: string,
): Draw2Cel | undefined {
  return state.cels.find((cel) =>
    cel.layerId === layerId && cel.frameId === frameId &&
    cel.lifecycle !== "ARCHIVED"
  );
}

function activeAssetId(state: ProjectState): string {
  return state.assets[state.activeAssetId] === undefined
    ? ""
    : state.activeAssetId;
}

function nextIndex<
  T extends { readonly order?: number; readonly index?: number },
>(items: readonly T[], field: "order" | "index"): number {
  return items.reduce(
    (maximum, item) => Math.max(maximum, item[field] ?? -1),
    -1,
  ) + 1;
}

function updateTimeline(
  state: ProjectState,
  frameOrder: readonly string[],
  layerTrackOrder: readonly string[],
): Draw2Timeline {
  return {
    ...state.timeline,
    frameOrder: [...frameOrder],
    layerTrackOrder: [...layerTrackOrder],
    metadataVersion: state.timeline.metadataVersion + 1,
  };
}

export function createDraw130Project(options: CreateProjectOptions = {
  projectId: "draw130-local",
  width: 256,
  height: 256,
  tileSize: 32,
}): ProjectState {
  return createProject(options);
}

export function createTimelineProjection(
  state: ProjectState,
  options: {
    readonly frameStart?: number;
    readonly frameCount?: number;
    readonly layerStart?: number;
    readonly layerCount?: number;
    readonly overscan?: number;
  } = {},
): Draw130TimelineProjection {
  const overscan =
    Number.isSafeInteger(options.overscan) && (options.overscan ?? 0) >= 0
      ? Math.min(options.overscan ?? 0, 32)
      : 2;
  const rawFrameStart = Number.isSafeInteger(options.frameStart)
    ? options.frameStart ?? 0
    : 0;
  const rawLayerStart = Number.isSafeInteger(options.layerStart)
    ? options.layerStart ?? 0
    : 0;
  const frameCount =
    Number.isSafeInteger(options.frameCount) && (options.frameCount ?? 0) > 0
      ? options.frameCount ?? 1
      : 12;
  const layerCount =
    Number.isSafeInteger(options.layerCount) && (options.layerCount ?? 0) > 0
      ? options.layerCount ?? 1
      : 8;
  const frameStart = Math.max(
    0,
    Math.min(
      rawFrameStart,
      Math.max(0, state.frames.length - 1) - frameCount + 1,
    ),
  );
  const layerStart = Math.max(
    0,
    Math.min(
      rawLayerStart,
      Math.max(0, state.layers.length - 1) - layerCount + 1,
    ),
  );
  const frameEndExclusive = Math.min(
    state.frames.length,
    frameStart + frameCount,
  );
  const layerEndExclusive = Math.min(
    state.layers.length,
    layerStart + layerCount,
  );
  const visibleFrames = state.timeline.frameOrder.slice(
    frameStart,
    frameEndExclusive,
  ).map((id, index) => ({ index: frameStart + index, id }));
  const visibleLayers = state.timeline.layerTrackOrder.slice(
    layerStart,
    layerEndExclusive,
  ).map((id, index) => ({ index: layerStart + index, id }));
  const cells: Draw130CellProjection[] = [];
  for (const layer of visibleLayers) {
    for (const frame of visibleFrames) {
      const layerRecord = state.layers.find((candidate) =>
        candidate.id === layer.id
      );
      const frameRecord = state.frames.find((candidate) =>
        candidate.id === frame.id
      );
      const cel = layerRecord === undefined || frameRecord === undefined
        ? undefined
        : findCel(state, layerRecord.id, frameRecord.id);
      if (cel !== undefined) {
        cells.push({
          layerId: layer.id,
          frameId: frame.id,
          celId: cel.id,
          bindingMode: cel.bindingMode,
        });
      }
    }
  }
  const visibleItems = visibleFrames.length + visibleLayers.length +
    cells.length;
  const overscanFrames =
    Math.min(state.frames.length, frameStart + frameCount + overscan) -
    Math.max(0, frameStart - overscan);
  const overscanLayers =
    Math.min(state.layers.length, layerStart + layerCount + overscan) -
    Math.max(0, layerStart - overscan);
  return {
    totalFrames: state.frames.length,
    totalLayers: state.layers.length,
    frameStart,
    frameEndExclusive,
    layerStart,
    layerEndExclusive,
    overscan,
    visibleFrames,
    visibleLayers,
    cells,
    metrics: {
      totalItems: state.frames.length * state.layers.length,
      visibleItems,
      overscanItems: Math.max(
        0,
        overscanFrames * overscanLayers - cells.length,
      ),
      mountedItems: visibleItems,
      renderedItems: visibleItems,
    },
  };
}

export class Draw130Editor {
  #state: ProjectState;
  #metadata: Draw130TimelineMetadata;
  #sequence: number;
  #undo: Draw130HistoryEntry[] = [];
  #redo: Draw130HistoryEntry[] = [];
  #playback: Draw130PlaybackState;
  readonly #actorId: string;
  readonly #clientId: string;

  constructor(
    state: ProjectState,
    identity: { readonly actorId?: string; readonly clientId?: string } = {},
  ) {
    this.#state = state;
    this.#actorId = identity.actorId ?? "draw130-local-actor";
    this.#clientId = identity.clientId ?? "draw130-local-client";
    this.#sequence = state.lastClientSequenceByClient[this.#clientId] ?? 0;
    this.#metadata = {
      fps: 12,
      onionSkin: { enabled: false, before: 1, after: 1 },
      tags: [],
    };
    this.#playback = {
      playing: false,
      frameId: state.activeFrameId,
      loop: true,
    };
  }

  get state(): ProjectState {
    return this.#state;
  }
  get metadata(): Draw130TimelineMetadata {
    return cloneMetadata(this.#metadata);
  }
  get playback(): Draw130PlaybackState {
    return { ...this.#playback };
  }
  get undoDepth(): number {
    return this.#undo.length;
  }
  get redoDepth(): number {
    return this.#redo.length;
  }

  timelineProjection(
    options: Parameters<typeof createTimelineProjection>[1] = {},
  ): Draw130TimelineProjection {
    return createTimelineProjection(this.#state, options);
  }

  setPlayback(
    playing: boolean,
    loop = this.#playback.loop,
  ): Draw130PlaybackState {
    this.#playback = { ...this.#playback, playing, loop };
    return this.playback;
  }

  nextPlaybackFrame(): string {
    const order = this.#state.timeline.frameOrder;
    const index = Math.max(0, order.indexOf(this.#playback.frameId));
    const nextIndex = index + 1 < order.length
      ? index + 1
      : this.#playback.loop
      ? 0
      : index;
    this.#playback = {
      ...this.#playback,
      frameId: order[nextIndex] ?? this.#playback.frameId,
    };
    return this.#playback.frameId;
  }

  onionProjection(): Draw130OnionProjection {
    const order = this.#state.timeline.frameOrder;
    const currentIndex = Math.max(0, order.indexOf(this.#state.activeFrameId));
    const collect = (direction: -1 | 1, count: number) =>
      Array.from({ length: count }, (_, offset) => {
        const index = currentIndex + direction * (offset + 1);
        const frameId = order[index];
        if (frameId === undefined) return undefined;
        return {
          frameId,
          offset: offset + 1,
          celIds: this.#state.cels.filter((cel) =>
            cel.frameId === frameId && cel.lifecycle === "ACTIVE"
          ).map((cel) => cel.id),
        };
      }).filter((value): value is NonNullable<typeof value> =>
        value !== undefined
      );
    return {
      enabled: this.#metadata.onionSkin.enabled,
      currentFrameId: this.#state.activeFrameId,
      before: collect(-1, this.#metadata.onionSkin.before),
      after: collect(1, this.#metadata.onionSkin.after),
    };
  }

  setOnionSkin(
    enabled: boolean,
    before = this.#metadata.onionSkin.before,
    after = this.#metadata.onionSkin.after,
  ): Draw130OnionProjection | Draw130Rejected {
    if (
      !Number.isSafeInteger(before) || !Number.isSafeInteger(after) ||
      before < 0 || before > 8 || after < 0 || after > 8
    ) {
      return this.#rejected(
        "ONION_SKIN_RANGE_INVALID",
        "Onion Skin range must be between 0 and 8.",
      );
    }
    this.#metadata = {
      ...this.#metadata,
      onionSkin: { enabled, before, after },
    };
    return this.onionProjection();
  }

  setFps(fps: number): Draw130Rejected | Draw130TimelineMetadata {
    if (!Number.isSafeInteger(fps) || fps < 1 || fps > 240) {
      return this.#rejected(
        "FPS_OUT_OF_RANGE",
        "FPS must be a safe integer from 1 through 240.",
      );
    }
    this.#metadata = { ...this.#metadata, fps };
    return this.metadata;
  }

  async setTag(tag: Omit<Draw130Tag, "id">): Promise<Draw130Execution> {
    const frameIds = new Set(this.#state.timeline.frameOrder);
    if (
      !frameIds.has(tag.startFrameId) || !frameIds.has(tag.endFrameId) ||
      !Number.isSafeInteger(tag.color) || tag.color < 0 ||
      tag.color > 0xffffffff || !tag.name.trim()
    ) {
      return this.#rejected(
        "TAG_INPUT_INVALID",
        "Tag requires valid frame IDs, name, and color.",
      );
    }
    const start = this.#state.timeline.frameOrder.indexOf(tag.startFrameId);
    const end = this.#state.timeline.frameOrder.indexOf(tag.endFrameId);
    if (start > end) {
      return this.#rejected(
        "TAG_RANGE_INVALID",
        "Tag start frame must not follow end frame.",
      );
    }
    const id = `${this.#state.projectId}:tag:${this.#metadata.tags.length}`;
    return this.#commit(
      "timeline.setTag",
      { tag: { ...tag, id } },
      (state, metadata) => ({
        state,
        metadata: { ...metadata, tags: [...metadata.tags, { ...tag, id }] },
      }),
      ["TIMELINE_STRUCTURE_DIRTY"],
    );
  }

  async addLayer(name = "Layer"): Promise<Draw130Execution> {
    if (!name.trim()) {
      return this.#rejected("LAYER_NAME_EMPTY", "Layer name is required.");
    }
    return this.#commit("timeline.addLayerTrack", { name }, (state) => {
      const order = nextIndex(state.layers, "order");
      const id = `${state.projectId}:layer:${order}`;
      const layer: Draw2Layer = {
        id,
        layerTrackId: id,
        name: name.trim(),
        order,
        orderingKey: String(order).padStart(8, "0"),
        visible: true,
        opacity: 1,
        blendMode: "NORMAL",
        locked: false,
        lifecycle: "ACTIVE",
      };
      const cels: Draw2Cel[] = state.frames.map((frame) => ({
        id: `${state.projectId}:cel:${id}:${frame.id}`,
        celId: `${state.projectId}:cel:${id}:${frame.id}`,
        layerId: id,
        layerTrackId: id,
        frameId: frame.id,
        bindingMode: "EMPTY",
        recordVersion: 1,
        lifecycle: "ACTIVE",
      }));
      return {
        state: {
          ...state,
          layers: [...state.layers, layer],
          cels: [...state.cels, ...cels],
          timeline: updateTimeline(state, state.timeline.frameOrder, [
            ...state.timeline.layerTrackOrder,
            id,
          ]),
        },
      };
    }, ["TIMELINE_STRUCTURE_DIRTY"]);
  }

  async duplicateLayer(layerId: string): Promise<Draw130Execution> {
    const source = this.#state.layers.find((layer) =>
      layer.id === layerId && layer.lifecycle === "ACTIVE"
    );
    if (source === undefined) {
      return this.#rejected("LAYER_NOT_FOUND", "Layer was not found.");
    }
    return this.#commit(
      "timeline.duplicateLayerTrack",
      { layerId },
      (state) => {
        const order = nextIndex(state.layers, "order");
        const id = `${state.projectId}:layer:${order}`;
        const layer: Draw2Layer = {
          ...source,
          id,
          layerTrackId: id,
          name: `${source.name} Copy`,
          order,
          orderingKey: String(order).padStart(8, "0"),
        };
        const cels = state.cels.filter((cel) => cel.layerId === source.id).map((
          cel,
        ) => ({
          ...cel,
          id: `${state.projectId}:cel:${id}:${cel.frameId}`,
          celId: `${state.projectId}:cel:${id}:${cel.frameId}`,
          layerId: id,
          layerTrackId: id,
          bindingMode: cel.assetId === undefined
            ? "EMPTY" as const
            : "SHARED_REFERENCE" as const,
        }));
        return {
          state: {
            ...state,
            layers: [...state.layers, layer],
            cels: [...state.cels, ...cels],
            timeline: updateTimeline(state, state.timeline.frameOrder, [
              ...state.timeline.layerTrackOrder,
              id,
            ]),
          },
        };
      },
      ["TIMELINE_STRUCTURE_DIRTY"],
    );
  }

  async removeLayer(layerId: string): Promise<Draw130Execution> {
    if (this.#state.layers.length <= 1) {
      return this.#rejected(
        "LAST_LAYER_REMOVE",
        "The last layer cannot be removed.",
      );
    }
    const source = this.#state.layers.find((layer) =>
      layer.id === layerId && layer.lifecycle === "ACTIVE"
    );
    if (source === undefined) {
      return this.#rejected("LAYER_NOT_FOUND", "Layer was not found.");
    }
    return this.#commit("timeline.removeLayerTrack", { layerId }, (state) => {
      const layers = state.layers.filter((layer) => layer.id !== layerId).map((
        layer,
        order,
      ) => ({ ...layer, order, orderingKey: String(order).padStart(8, "0") }));
      const layerTrackOrder = state.timeline.layerTrackOrder.filter((id) =>
        id !== layerId
      );
      const activeLayerId = state.activeLayerId === layerId
        ? layers[0]?.id ?? state.activeLayerId
        : state.activeLayerId;
      const activeFrameId = state.activeFrameId;
      const activeCelId = findCel(state, activeLayerId, activeFrameId)?.id ??
        state.activeCelId;
      return {
        state: {
          ...state,
          layers,
          cels: state.cels.filter((cel) => cel.layerId !== layerId),
          activeLayerId,
          activeCelId,
          timeline: updateTimeline(
            state,
            state.timeline.frameOrder,
            layerTrackOrder,
          ),
        },
      };
    }, ["TIMELINE_STRUCTURE_DIRTY"]);
  }

  async setLayerVisibility(
    layerId: string,
    visible: boolean,
  ): Promise<Draw130Execution> {
    return this.#updateLayer(
      layerId,
      "timeline.setLayerVisibility",
      (layer) => ({ ...layer, visible }),
      ["LAYER_METADATA_DIRTY"],
    );
  }
  async setLayerLock(
    layerId: string,
    locked: boolean,
  ): Promise<Draw130Execution> {
    return this.#updateLayer(
      layerId,
      "timeline.setLayerLock",
      (layer) => ({ ...layer, locked }),
      ["LAYER_METADATA_DIRTY"],
    );
  }
  async setLayerOpacity(
    layerId: string,
    opacity: number,
  ): Promise<Draw130Execution> {
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      return this.#rejected(
        "LAYER_OPACITY_INVALID",
        "Layer opacity must be between 0 and 1.",
      );
    }
    return this.#updateLayer(
      layerId,
      "timeline.setLayerOpacity",
      (layer) => ({ ...layer, opacity }),
      ["LAYER_METADATA_DIRTY"],
    );
  }
  async renameLayer(layerId: string, name: string): Promise<Draw130Execution> {
    if (!name.trim()) {
      return this.#rejected("LAYER_NAME_EMPTY", "Layer name is required.");
    }
    return this.#updateLayer(
      layerId,
      "timeline.renameLayerTrack",
      (layer) => ({ ...layer, name: name.trim() }),
      ["LAYER_METADATA_DIRTY"],
    );
  }

  async addFrame(durationMs = 100): Promise<Draw130Execution> {
    if (
      !Number.isSafeInteger(durationMs) || durationMs < 1 || durationMs > 60_000
    ) {
      return this.#rejected(
        "FRAME_DURATION_INVALID",
        "Frame duration must be between 1 and 60000 milliseconds.",
      );
    }
    return this.#commit("timeline.addFrame", { durationMs }, (state) => {
      const index = nextIndex(state.frames, "index");
      const frameId = `${state.projectId}:frame:${index}`;
      const frame: Draw2Frame = {
        id: frameId,
        frameId,
        index,
        orderKey: String(index).padStart(8, "0"),
        durationMs,
        timingUnit: "MILLISECONDS",
        metadataVersion: 1,
      };
      const cels = state.layers.map((layer) => ({
        id: `${state.projectId}:cel:${layer.id}:${frameId}`,
        celId: `${state.projectId}:cel:${layer.id}:${frameId}`,
        layerId: layer.id,
        layerTrackId: layer.layerTrackId,
        frameId,
        bindingMode: "EMPTY" as const,
        recordVersion: 1,
        lifecycle: "ACTIVE" as const,
      }));
      const firstCel = cels.find((cel) => cel.layerId === state.activeLayerId);
      return {
        state: {
          ...state,
          frames: [...state.frames, frame],
          cels: [...state.cels, ...cels],
          activeFrameId: frameId,
          activeCelId: firstCel?.id ?? state.activeCelId,
          timeline: updateTimeline(state, [
            ...state.timeline.frameOrder,
            frameId,
          ], state.timeline.layerTrackOrder),
        },
      };
    }, ["TIMELINE_STRUCTURE_DIRTY"]);
  }

  async duplicateFrame(frameId: string): Promise<Draw130Execution> {
    const source = this.#state.frames.find((frame) => frame.id === frameId);
    if (source === undefined) {
      return this.#rejected("FRAME_NOT_FOUND", "Frame was not found.");
    }
    return this.#commit("timeline.duplicateFrame", { frameId }, (state) => {
      const index = nextIndex(state.frames, "index");
      const newFrameId = `${state.projectId}:frame:${index}`;
      const frame: Draw2Frame = {
        ...source,
        id: newFrameId,
        frameId: newFrameId,
        index,
        orderKey: String(index).padStart(8, "0"),
        metadataVersion: source.metadataVersion + 1,
      };
      const cels = state.layers.map((layer) => {
        const sourceCel = findCel(state, layer.id, source.id);
        return {
          id: `${state.projectId}:cel:${layer.id}:${newFrameId}`,
          celId: `${state.projectId}:cel:${layer.id}:${newFrameId}`,
          layerId: layer.id,
          layerTrackId: layer.layerTrackId,
          frameId: newFrameId,
          assetId: sourceCel?.assetId,
          bindingMode: sourceCel?.assetId === undefined
            ? "EMPTY" as const
            : "SHARED_REFERENCE" as const,
          recordVersion: 1,
          lifecycle: "ACTIVE" as const,
        };
      });
      const firstCel = cels.find((cel) => cel.layerId === state.activeLayerId);
      return {
        state: {
          ...state,
          frames: [...state.frames, frame],
          cels: [...state.cels, ...cels],
          activeFrameId: newFrameId,
          activeCelId: firstCel?.id ?? state.activeCelId,
          timeline: updateTimeline(state, [
            ...state.timeline.frameOrder,
            newFrameId,
          ], state.timeline.layerTrackOrder),
        },
      };
    }, ["TIMELINE_STRUCTURE_DIRTY"]);
  }

  async removeFrame(frameId: string): Promise<Draw130Execution> {
    if (this.#state.frames.length <= 1) {
      return this.#rejected(
        "LAST_FRAME_REMOVE",
        "The last frame cannot be removed.",
      );
    }
    if (
      this.#state.frames.find((frame) => frame.id === frameId) === undefined
    ) return this.#rejected("FRAME_NOT_FOUND", "Frame was not found.");
    return this.#commit("timeline.removeFrame", { frameId }, (state) => {
      const frames = state.frames.filter((frame) => frame.id !== frameId).map((
        frame,
        index,
      ) => ({ ...frame, index, orderKey: String(index).padStart(8, "0") }));
      const activeFrameId = state.activeFrameId === frameId
        ? frames[0]?.id ?? state.activeFrameId
        : state.activeFrameId;
      const activeCelId =
        findCel(state, state.activeLayerId, activeFrameId)?.id ??
          state.activeCelId;
      return {
        state: {
          ...state,
          frames,
          cels: state.cels.filter((cel) => cel.frameId !== frameId),
          activeFrameId,
          activeCelId,
          timeline: updateTimeline(
            state,
            state.timeline.frameOrder.filter((id) => id !== frameId),
            state.timeline.layerTrackOrder,
          ),
        },
      };
    }, ["TIMELINE_STRUCTURE_DIRTY"]);
  }

  async changeFrameDuration(
    frameId: string,
    durationMs: number,
  ): Promise<Draw130Execution> {
    if (
      !Number.isSafeInteger(durationMs) || durationMs < 1 || durationMs > 60_000
    ) {
      return this.#rejected(
        "FRAME_DURATION_INVALID",
        "Frame duration must be between 1 and 60000 milliseconds.",
      );
    }
    return this.#commit(
      "timeline.changeFrameDuration",
      { frameId, durationMs },
      (state) => {
        if (state.frames.find((frame) => frame.id === frameId) === undefined) {
          return {
            diagnostics: [
              diagnostic("FRAME_NOT_FOUND", "Frame was not found."),
            ],
          };
        }
        return {
          state: {
            ...state,
            frames: state.frames.map((frame) =>
              frame.id === frameId
                ? {
                  ...frame,
                  durationMs,
                  metadataVersion: frame.metadataVersion + 1,
                }
                : frame
            ),
          },
        };
      },
      ["TIMELINE_STRUCTURE_DIRTY"],
    );
  }

  async createCel(layerId: string, frameId: string): Promise<Draw130Execution> {
    return this.#commit("timeline.createCel", { layerId, frameId }, (state) => {
      const layer = state.layers.find((candidate) => candidate.id === layerId);
      const frame = state.frames.find((candidate) => candidate.id === frameId);
      if (layer === undefined) {
        return {
          diagnostics: [diagnostic("LAYER_NOT_FOUND", "Layer was not found.")],
        };
      }
      if (frame === undefined) {
        return {
          diagnostics: [diagnostic("FRAME_NOT_FOUND", "Frame was not found.")],
        };
      }
      const existing = findCel(state, layerId, frameId);
      if (existing !== undefined && existing.lifecycle === "ACTIVE") {
        return {
          diagnostics: [
            diagnostic("CEL_ALREADY_EXISTS", "Cel already exists."),
          ],
        };
      }
      const celId = existing?.id ??
        `${state.projectId}:cel:${layerId}:${frameId}`;
      const cel: Draw2Cel = {
        id: celId,
        celId,
        layerId,
        layerTrackId: layer.layerTrackId,
        frameId,
        bindingMode: "EMPTY",
        recordVersion: (existing?.recordVersion ?? 0) + 1,
        lifecycle: "ACTIVE",
      };
      return {
        state: {
          ...state,
          cels: [
            ...state.cels.filter((candidate) => candidate.id !== celId),
            cel,
          ],
          activeLayerId: layerId,
          activeFrameId: frameId,
          activeCelId: celId,
        },
      };
    }, ["TIMELINE_CELL_DIRTY"]);
  }

  async clearCel(layerId: string, frameId: string): Promise<Draw130Execution> {
    return this.#commit("timeline.clearCel", { layerId, frameId }, (state) => {
      const cel = findCel(state, layerId, frameId);
      if (cel === undefined) {
        return {
          diagnostics: [diagnostic("CEL_NOT_FOUND", "Cel was not found.")],
        };
      }
      return {
        state: {
          ...state,
          cels: state.cels.map((candidate) =>
            candidate.id === cel.id
              ? {
                ...candidate,
                assetId: undefined,
                bindingMode: "EMPTY" as const,
                lifecycle: "CLEARED" as const,
                recordVersion: candidate.recordVersion + 1,
              }
              : candidate
          ),
        },
      };
    }, ["TIMELINE_CELL_DIRTY"]);
  }

  async replaceCelBinding(
    layerId: string,
    frameId: string,
    assetId: string,
    bindingMode: Draw2Cel["bindingMode"] = "SHARED_REFERENCE",
  ): Promise<Draw130Execution> {
    return this.#commit("timeline.replaceCelBinding", {
      layerId,
      frameId,
      assetId,
      bindingMode,
    }, (state) => {
      const cel = findCel(state, layerId, frameId);
      if (cel === undefined) {
        return {
          diagnostics: [diagnostic("CEL_NOT_FOUND", "Cel was not found.")],
        };
      }
      if (state.assets[assetId] === undefined) {
        return {
          diagnostics: [
            diagnostic("ASSET_NOT_FOUND", "Cel asset was not found."),
          ],
        };
      }
      if (bindingMode === "EMPTY") {
        return {
          diagnostics: [
            diagnostic(
              "CEL_BINDING_INVALID",
              "A non-empty binding requires an asset.",
            ),
          ],
        };
      }
      return {
        state: {
          ...state,
          cels: state.cels.map((candidate) =>
            candidate.id === cel.id
              ? {
                ...candidate,
                assetId,
                bindingMode,
                lifecycle: "ACTIVE" as const,
                recordVersion: candidate.recordVersion + 1,
              }
              : candidate
          ),
        },
      };
    }, ["TIMELINE_CELL_DIRTY"]);
  }

  async setLayerWritable(
    layerId: string,
    frameId: string,
  ): Promise<Draw130Rejected | { readonly writable: true }> {
    const layer = this.#state.layers.find((candidate) =>
      candidate.id === layerId
    );
    const cel = findCel(this.#state, layerId, frameId);
    if (layer === undefined) {
      return this.#rejected("LAYER_NOT_FOUND", "Layer was not found.");
    }
    if (cel === undefined) {
      return this.#rejected("CEL_NOT_FOUND", "Cel was not found.");
    }
    if (!layer.visible) {
      return this.#rejected(
        "LAYER_HIDDEN",
        "Hidden layer is not writable through the active drawing target.",
      );
    }
    if (layer.locked) {
      return this.#rejected("LAYER_LOCKED", "Locked layer is not writable.");
    }
    return { writable: true };
  }

  undo(): ProjectState | undefined {
    const entry = this.#undo.pop();
    if (entry === undefined) return undefined;
    this.#redo.push(entry);
    this.#restore(entry.before);
    return this.#state;
  }

  redo(): ProjectState | undefined {
    const entry = this.#redo.pop();
    if (entry === undefined) return undefined;
    this.#undo.push(entry);
    this.#restore(entry.after);
    return this.#state;
  }

  async structureHash(): Promise<string> {
    return sha256Hex({
      structureEpoch: this.#state.structureEpoch,
      layers: this.#state.layers,
      frames: this.#state.frames,
      cels: this.#state.cels,
      timeline: this.#state.timeline,
      metadata: { fps: this.#metadata.fps, tags: this.#metadata.tags },
    });
  }

  #restore(snapshot: Draw130Snapshot): void {
    const restored = cloneSnapshot(snapshot);
    this.#state = restored.state;
    this.#metadata = restored.metadata;
    this.#sequence = this.#state.lastClientSequenceByClient[this.#clientId] ??
      0;
    this.#playback = {
      ...this.#playback,
      frameId: this.#state.activeFrameId,
      playing: false,
    };
  }

  async #updateLayer(
    layerId: string,
    operationType: Draw130OperationType,
    update: (layer: Draw2Layer) => Draw2Layer,
    dirtyDomains: Draw130Result["dirtyDomains"],
  ): Promise<Draw130Execution> {
    return this.#commit(operationType, { layerId }, (state) => {
      const layer = state.layers.find((candidate) => candidate.id === layerId);
      if (layer === undefined) {
        return {
          diagnostics: [diagnostic("LAYER_NOT_FOUND", "Layer was not found.")],
        };
      }
      return {
        state: {
          ...state,
          layers: state.layers.map((candidate) =>
            candidate.id === layerId ? update(candidate) : candidate
          ),
        },
      };
    }, dirtyDomains);
  }

  #rejected(code: string, message: string): Draw130Rejected {
    return {
      state: this.#state,
      diagnostics: [diagnostic(code, message)],
      undoDepth: this.undoDepth,
      redoDepth: this.redoDepth,
    };
  }

  async #commit(
    operationType: Draw130OperationType,
    payload: unknown,
    mutate: (
      state: ProjectState,
      metadata: Draw130TimelineMetadata,
    ) => {
      readonly state?: ProjectState;
      readonly metadata?: Draw130TimelineMetadata;
      readonly diagnostics?: readonly ReturnType<typeof diagnostic>[];
    },
    dirtyDomains: Draw130Result["dirtyDomains"],
  ): Promise<Draw130Execution> {
    const before: Draw130Snapshot = {
      state: this.#state,
      metadata: this.#metadata,
    };
    const mutation = mutate(
      cloneProjectStateShared(this.#state),
      cloneMetadata(this.#metadata),
    );
    if (mutation.diagnostics !== undefined) {
      return {
        state: this.#state,
        diagnostics: mutation.diagnostics,
        undoDepth: this.undoDepth,
        redoDepth: this.redoDepth,
      };
    }
    const nextState = mutation.state ?? this.#state;
    const nextMetadata = mutation.metadata ?? this.#metadata;
    const nextSequence = this.#sequence + 1;
    const commandId = `draw130-${nextSequence}`;
    const stateWithIdentity: ProjectState = {
      ...nextState,
      structureEpoch: nextState.structureEpoch + 1,
      appliedCommandIds: [...nextState.appliedCommandIds, commandId],
      lastClientSequenceByClient: {
        ...nextState.lastClientSequenceByClient,
        [this.#clientId]: nextSequence,
      },
    };
    const body = {
      operationType,
      schemaVersion: 1 as const,
      commandId,
      projectId: stateWithIdentity.projectId,
      assetId: activeAssetId(stateWithIdentity),
      actorId: this.#actorId,
      clientId: this.#clientId,
      clientSequence: nextSequence,
      structureEpoch: stateWithIdentity.structureEpoch,
      payload,
    };
    const operation: Draw130Operation = {
      operationId: `op_${await sha256Hex(body)}`,
      ...body,
    };
    const after: Draw130Snapshot = {
      state: stateWithIdentity,
      metadata: nextMetadata,
    };
    this.#state = stateWithIdentity;
    this.#metadata = nextMetadata;
    this.#sequence = nextSequence;
    this.#undo.push({
      before: cloneSnapshot(before),
      after: cloneSnapshot(after),
      operation,
    });
    this.#redo = [];
    return {
      operation,
      state: this.#state,
      dirtyDomains,
      undoDepth: this.undoDepth,
      redoDepth: this.redoDepth,
      fullTimelineRebuildCount: 0,
    };
  }
}
