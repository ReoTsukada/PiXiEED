/**
 * DRAW-110 production-oriented adapter over the existing Draw2 Core.
 *
 * This file owns interaction orchestration only. Project, indexed raster,
 * command validation, dirty tiles, COW, and operation identity remain owned by
 * draw2-core.ts. No DOM, Canvas, storage, network, current route, or provider
 * is imported here.
 */
import {
  cloneProjectStateShared,
  type CommandResult,
  createProject,
  type CreateProjectOptions,
  type EditorCommand,
  EditorCore,
  type ExecuteResult,
  type PixelPoint,
  type ProjectState,
  ReferenceRenderer,
  type RendererResult,
  sha256Hex,
} from "../../draw2-core.ts";
import type { DrawTool, StrokeRecord } from "../../fp-006/contracts.ts";

export type Draw110Tool = DrawTool | "fill" | "eyedropper" | "hand";
export type Draw110TemporaryTool = "eyedropper" | "hand";

export interface Draw110Viewport {
  readonly zoom: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly nearestNeighbor: true;
}

export interface Draw110HistoryEntry {
  readonly operationId: string;
  readonly operationType: string;
  readonly before: ProjectState;
  readonly after: ProjectState;
}

export interface Draw110Commit {
  readonly state: ProjectState;
  readonly result: CommandResult;
  readonly undoDepth: number;
  readonly redoDepth: number;
}

export interface Draw110Rejected {
  readonly state: ProjectState;
  readonly diagnostics: readonly {
    readonly code: string;
    readonly severity: "info" | "warning" | "error";
    readonly message: string;
    readonly path?: string;
  }[];
  readonly undoDepth: number;
  readonly redoDepth: number;
}

export type Draw110Execution = Draw110Commit | Draw110Rejected;

function isSuccess(
  result: ExecuteResult,
): result is Extract<ExecuteResult, { readonly ok: true }> {
  return result.ok;
}

function pointsFromStroke(stroke: StrokeRecord): readonly PixelPoint[] {
  return stroke.points.map((point) => ({
    x: Math.round(point.x),
    y: Math.round(point.y),
  }));
}

function finiteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function createDraw110Project(
  options: CreateProjectOptions = {
    projectId: "draw110-local",
    width: 256,
    height: 256,
    tileSize: 32,
  },
): ProjectState {
  return createProject(options);
}

export function resolveTemporaryTool(
  baseTool: Draw110Tool,
  modifiers: { readonly alt: boolean; readonly space: boolean },
): Draw110Tool {
  if (modifiers.space) return "hand";
  if (modifiers.alt) return "eyedropper";
  return baseTool;
}

export function createInitialViewport(): Draw110Viewport {
  return { zoom: 1, offsetX: 0, offsetY: 0, nearestNeighbor: true };
}

export function zoomViewport(
  viewport: Draw110Viewport,
  factor: number,
  anchor: { readonly x: number; readonly y: number },
): Draw110Viewport {
  const nextZoom = Math.min(
    64,
    Math.max(0.25, viewport.zoom * finiteNumber(factor, 1)),
  );
  const ratio = nextZoom / viewport.zoom;
  return {
    zoom: nextZoom,
    offsetX: anchor.x - (anchor.x - viewport.offsetX) * ratio,
    offsetY: anchor.y - (anchor.y - viewport.offsetY) * ratio,
    nearestNeighbor: true,
  };
}

export function panViewport(
  viewport: Draw110Viewport,
  delta: { readonly x: number; readonly y: number },
): Draw110Viewport {
  return {
    ...viewport,
    offsetX: viewport.offsetX + finiteNumber(delta.x, 0),
    offsetY: viewport.offsetY + finiteNumber(delta.y, 0),
  };
}

export class Draw110Editor {
  #state: ProjectState;
  #core: EditorCore;
  #sequence = 0;
  #undo: Draw110HistoryEntry[] = [];
  #redo: Draw110HistoryEntry[] = [];
  readonly #actorId: string;
  readonly #clientId: string;
  readonly #renderer = new ReferenceRenderer();

  constructor(
    state: ProjectState,
    identity: { readonly actorId?: string; readonly clientId?: string } = {},
  ) {
    this.#state = state;
    this.#core = new EditorCore(state);
    this.#actorId = identity.actorId ?? "draw110-local-actor";
    this.#clientId = identity.clientId ?? "draw110-local-client";
  }

  get state(): ProjectState {
    return this.#state;
  }
  get undoDepth(): number {
    return this.#undo.length;
  }
  get redoDepth(): number {
    return this.#redo.length;
  }

  async commitStroke(stroke: StrokeRecord): Promise<Draw110Execution> {
    const colorIndex = stroke.tool === "eraser" ? 0 : 1;
    return this.#executeRaster({
      commandType: "raster.strokeCommit",
      payload: { points: pointsFromStroke(stroke), colorIndex },
    });
  }

  async commitPencil(
    points: readonly PixelPoint[],
    colorIndex: number,
  ): Promise<Draw110Execution> {
    return this.#executeRaster({
      commandType: "raster.strokeCommit",
      payload: { points, colorIndex },
    });
  }

  async commitFill(
    seed: PixelPoint,
    colorIndex: number,
    maxPixels = 1_048_576,
  ): Promise<Draw110Execution> {
    return this.#executeRaster({
      commandType: "raster.fill",
      payload: { seedX: seed.x, seedY: seed.y, colorIndex, maxPixels },
    });
  }

  samplePaletteIndex(point: PixelPoint): number {
    const asset = this.#state.assets[this.#state.activeAssetId];
    if (
      asset === undefined || !Number.isSafeInteger(point.x) ||
      !Number.isSafeInteger(point.y) || point.x < 0 || point.y < 0 ||
      point.x >= asset.width || point.y >= asset.height
    ) return 0;
    return asset.raster.getPixel(point.x, point.y);
  }

  async presentDirty(result: CommandResult): Promise<RendererResult> {
    return this.#renderer.render({
      state: this.#state,
      assetId: result.operation.assetId,
      dirtyTiles: result.dirtyTiles,
      dirtyRegions: result.dirtyRegions,
      mode: "DIRTY_REGIONS",
    });
  }

  undo(): ProjectState | undefined {
    const entry = this.#undo.pop();
    if (entry === undefined) return undefined;
    this.#redo.push(entry);
    this.#state = cloneProjectStateShared(entry.before);
    this.#core = new EditorCore(this.#state);
    return this.#state;
  }

  redo(): ProjectState | undefined {
    const entry = this.#redo.pop();
    if (entry === undefined) return undefined;
    this.#undo.push(entry);
    this.#state = cloneProjectStateShared(entry.after);
    this.#core = new EditorCore(this.#state);
    return this.#state;
  }

  async canonicalRasterHash(): Promise<string> {
    const asset = this.#state.assets[this.#state.activeAssetId];
    if (asset === undefined) {
      throw new Error("Active Draw110 asset is unavailable.");
    }
    return sha256Hex(asset.raster.toUint8Array());
  }

  async #executeRaster(
    input: {
      readonly commandType: "raster.strokeCommit" | "raster.fill";
      readonly payload: unknown;
    },
  ): Promise<Draw110Execution> {
    const asset = this.#state.assets[this.#state.activeAssetId];
    if (asset === undefined) {
      throw new Error("Active Draw110 asset is unavailable.");
    }
    const nextSequence = this.#sequence + 1;
    const command = {
      commandId: `draw110-${nextSequence}`,
      commandType: input.commandType,
      schemaVersion: 1 as const,
      projectId: this.#state.projectId,
      assetId: asset.id,
      actorId: this.#actorId,
      clientId: this.#clientId,
      clientSequence: nextSequence,
      baseStructureEpoch: this.#state.structureEpoch,
      createdAtMonotonicMs: performance.now(),
      payload: input.payload,
    } as EditorCommand;
    const before = this.#state;
    const execution = await this.#core.execute(command);
    if (!isSuccess(execution)) {
      return {
        state: this.#state,
        diagnostics: execution.diagnostics,
        undoDepth: this.undoDepth,
        redoDepth: this.redoDepth,
      };
    }
    this.#sequence = nextSequence;
    this.#state = execution.state;
    this.#core = new EditorCore(this.#state);
    this.#undo.push({
      operationId: execution.result.operation.operationId,
      operationType: execution.result.operation.operationType,
      before: cloneProjectStateShared(before),
      after: cloneProjectStateShared(this.#state),
    });
    this.#redo = [];
    return {
      state: this.#state,
      result: execution.result,
      undoDepth: this.undoDepth,
      redoDepth: this.redoDepth,
    };
  }
}
