/**
 * DRAW-120 selection, transform, and clipboard adapter.
 *
 * Selection and transform previews are local projections. Canonical raster
 * mutation happens only through one bounded `raster.writeSet` command, so a
 * cut, paste, or transform produces one operation and one undo unit. This
 * module is DOM-, Canvas-, storage-, network-, provider-, and route-free.
 */
import {
  cloneProjectStateShared,
  type CommandResult,
  createProject,
  type CreateProjectOptions,
  type EditorCommand,
  EditorCore,
  type PixelPoint,
  type ProjectState,
  sha256Hex,
} from "../../draw2-core.ts";

export type Draw120SelectionMode = "REPLACE" | "ADD" | "SUBTRACT" | "INTERSECT";

export interface Draw120Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Draw120Selection {
  readonly celId: string;
  readonly points: readonly PixelPoint[];
  readonly bounds: Draw120Bounds | null;
}

export interface Draw120Transform {
  readonly translateX?: number;
  readonly translateY?: number;
  readonly flipHorizontal?: boolean;
  readonly flipVertical?: boolean;
  readonly rotateQuarterTurns?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
}

interface Draw120NormalisedTransform {
  readonly translateX: number;
  readonly translateY: number;
  readonly flipHorizontal: boolean;
  readonly flipVertical: boolean;
  readonly rotateQuarterTurns: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface Draw120Write {
  readonly x: number;
  readonly y: number;
  readonly colorIndex: number;
}

export interface Draw120ClipboardCell {
  readonly x: number;
  readonly y: number;
  readonly colorIndex: number;
}

export interface Draw120Clipboard {
  readonly sourceAssetId: string;
  readonly sourceCelId: string;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly Draw120ClipboardCell[];
}

export interface Draw120TransformPreview {
  readonly sourceSelection: Draw120Selection;
  readonly destinationSelection: Draw120Selection;
  readonly writes: readonly Draw120Write[];
  readonly transform: Required<Draw120Transform>;
}

export interface Draw120Commit {
  readonly state: ProjectState;
  readonly result: CommandResult;
  readonly operationType:
    | "raster.writeSet"
    | "selection.transformCommit"
    | "clipboard.cut"
    | "clipboard.paste";
  readonly undoDepth: number;
  readonly redoDepth: number;
}

export interface Draw120Rejected {
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

export type Draw120Execution = Draw120Commit | Draw120Rejected;
export type Draw120SelectionAction = Draw120Selection | Draw120Rejected;

interface Draw120HistoryEntry {
  readonly before: ProjectState;
  readonly after: ProjectState;
  readonly beforeSelection: Draw120Selection;
  readonly afterSelection: Draw120Selection;
  readonly operationType: Draw120Commit["operationType"];
}

function errorDiagnostic(code: string, message: string, path?: string) {
  return path === undefined
    ? { code, severity: "error" as const, message }
    : { code, severity: "error" as const, message, path };
}

function pointKey(point: PixelPoint): string {
  return `${point.x}:${point.y}`;
}

function comparePoints(left: PixelPoint, right: PixelPoint): number {
  return left.y - right.y || left.x - right.x;
}

function cloneSelection(selection: Draw120Selection): Draw120Selection {
  return {
    celId: selection.celId,
    points: selection.points.map((point) => ({ ...point })),
    bounds: selection.bounds === null ? null : { ...selection.bounds },
  };
}

function boundsForPoints(points: readonly PixelPoint[]): Draw120Bounds | null {
  if (points.length === 0) return null;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function normaliseTransform(
  input: Draw120Transform,
): Draw120NormalisedTransform | Draw120Rejected["diagnostics"] {
  const translateX = input.translateX ?? 0;
  const translateY = input.translateY ?? 0;
  const scaleX = input.scaleX ?? 1;
  const scaleY = input.scaleY ?? 1;
  const rotateQuarterTurns = input.rotateQuarterTurns ?? 0;
  if (
    !Number.isSafeInteger(translateX) ||
    !Number.isSafeInteger(translateY) ||
    !Number.isFinite(scaleX) ||
    !Number.isFinite(scaleY) ||
    scaleX <= 0 ||
    scaleY <= 0 ||
    scaleX > 16 ||
    scaleY > 16 ||
    !Number.isSafeInteger(rotateQuarterTurns)
  ) {
    return [
      errorDiagnostic(
        "TRANSFORM_INPUT_INVALID",
        "Transform values must be finite, bounded, and deterministic.",
        "transform",
      ),
    ];
  }
  return {
    translateX,
    translateY,
    flipHorizontal: input.flipHorizontal ?? false,
    flipVertical: input.flipVertical ?? false,
    rotateQuarterTurns: ((rotateQuarterTurns % 4) + 4) % 4,
    scaleX,
    scaleY,
  };
}

function createEmptySelection(celId: string): Draw120Selection {
  return { celId, points: [], bounds: null };
}

export function createDraw120Project(options: CreateProjectOptions = {
  projectId: "draw120-local",
  width: 256,
  height: 256,
  tileSize: 32,
}): ProjectState {
  return createProject(options);
}

export class Draw120Editor {
  #state: ProjectState;
  #core: EditorCore;
  #sequence: number;
  #selection: Draw120Selection;
  #clipboard: Draw120Clipboard | undefined;
  #preview: Draw120TransformPreview | undefined;
  #undo: Draw120HistoryEntry[] = [];
  #redo: Draw120HistoryEntry[] = [];
  readonly #actorId: string;
  readonly #clientId: string;

  constructor(
    state: ProjectState,
    identity: { readonly actorId?: string; readonly clientId?: string } = {},
  ) {
    this.#state = state;
    this.#core = new EditorCore(state);
    this.#actorId = identity.actorId ?? "draw120-local-actor";
    this.#clientId = identity.clientId ?? "draw120-local-client";
    this.#sequence = state.lastClientSequenceByClient[this.#clientId] ?? 0;
    this.#selection = createEmptySelection(state.activeCelId);
  }

  get state(): ProjectState {
    return this.#state;
  }

  get selection(): Draw120Selection {
    return this.#selection;
  }

  get clipboard(): Draw120Clipboard | undefined {
    return this.#clipboard;
  }

  get preview(): Draw120TransformPreview | undefined {
    return this.#preview;
  }

  get undoDepth(): number {
    return this.#undo.length;
  }

  get redoDepth(): number {
    return this.#redo.length;
  }

  selectRectangle(
    from: PixelPoint,
    to: PixelPoint,
    mode: Draw120SelectionMode = "REPLACE",
  ): Draw120SelectionAction {
    if (
      !Number.isSafeInteger(from.x) ||
      !Number.isSafeInteger(from.y) ||
      !Number.isSafeInteger(to.x) ||
      !Number.isSafeInteger(to.y)
    ) {
      return this.#selectionRejected(
        "SELECTION_POINT_INVALID",
        "Selection coordinates must be safe integers.",
      );
    }
    const asset = this.#activeAsset();
    if (
      Math.min(from.x, to.x) < 0 ||
      Math.min(from.y, to.y) < 0 ||
      Math.max(from.x, to.x) >= asset.width ||
      Math.max(from.y, to.y) >= asset.height
    ) {
      return this.#selectionRejected(
        "SELECTION_OUT_OF_BOUNDS",
        "Selection rectangle exceeds the active Cel bounds.",
      );
    }
    const points: PixelPoint[] = [];
    for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y += 1) {
      for (
        let x = Math.min(from.x, to.x);
        x <= Math.max(from.x, to.x);
        x += 1
      ) points.push({ x, y });
    }
    return this.selectPoints(points, mode);
  }

  selectPoints(
    points: readonly PixelPoint[],
    mode: Draw120SelectionMode = "REPLACE",
  ): Draw120SelectionAction {
    const asset = this.#activeAsset();
    for (const point of points) {
      if (
        !Number.isSafeInteger(point.x) ||
        !Number.isSafeInteger(point.y) ||
        point.x < 0 ||
        point.y < 0 ||
        point.x >= asset.width ||
        point.y >= asset.height
      ) {
        return this.#selectionRejected(
          "SELECTION_OUT_OF_BOUNDS",
          "Selection point exceeds the active Cel bounds.",
        );
      }
    }
    const incoming = new Map(
      points.map((point) => [pointKey(point), { x: point.x, y: point.y }]),
    );
    const current = new Map(
      this.#selection.points.map((point) => [pointKey(point), { ...point }]),
    );
    let selected: PixelPoint[];
    if (mode === "REPLACE") selected = [...incoming.values()];
    else if (mode === "ADD") {
      selected = [...new Map([...current, ...incoming]).values()];
    } else if (mode === "SUBTRACT") {
      selected = [...current].filter(([key]) => !incoming.has(key)).map((
        [, point],
      ) => point);
    } else {selected = [...current].filter(([key]) => incoming.has(key)).map((
        [, point],
      ) => point
      );}
    this.#selection = this.#makeSelection(selected);
    this.#preview = undefined;
    return this.#selection;
  }

  clearSelection(): Draw120Selection {
    this.#selection = createEmptySelection(this.#state.activeCelId);
    this.#preview = undefined;
    return this.#selection;
  }

  copy(): Draw120Clipboard | Draw120Rejected {
    const selection = this.#selection;
    const bounds = selection.bounds;
    if (bounds === null || selection.points.length === 0) {
      return this.#selectionRejected(
        "SELECTION_EMPTY",
        "Copy requires a non-empty selection.",
      );
    }
    const asset = this.#activeAsset();
    this.#clipboard = {
      sourceAssetId: asset.id,
      sourceCelId: selection.celId,
      width: bounds.width,
      height: bounds.height,
      cells: selection.points.map((point) => ({
        x: point.x - bounds.x,
        y: point.y - bounds.y,
        colorIndex: asset.raster.getPixel(point.x, point.y),
      })),
    };
    return this.#clipboard;
  }

  async cut(): Promise<Draw120Execution> {
    const copied = this.copy();
    if ("state" in copied) return copied;
    const writes = this.#selection.points.map((point) => ({
      x: point.x,
      y: point.y,
      colorIndex: 0,
    }));
    return this.#executeWriteSet(
      writes,
      "clipboard.cut",
      "clipboard.cut",
      this.#selection,
    );
  }

  async paste(target: PixelPoint): Promise<Draw120Execution> {
    const clipboard = this.#clipboard;
    if (clipboard === undefined) {
      return this.#rejected(
        "CLIPBOARD_EMPTY",
        "Paste requires a copied selection.",
      );
    }
    if (!Number.isSafeInteger(target.x) || !Number.isSafeInteger(target.y)) {
      return this.#rejected(
        "PASTE_TARGET_INVALID",
        "Paste target must use safe integer coordinates.",
      );
    }
    const asset = this.#activeAsset();
    const writes = clipboard.cells.map((cell) => ({
      x: target.x + cell.x,
      y: target.y + cell.y,
      colorIndex: cell.colorIndex,
    }));
    if (
      writes.some((write) =>
        write.x < 0 || write.y < 0 || write.x >= asset.width ||
        write.y >= asset.height
      )
    ) {
      return this.#rejected(
        "PASTE_OUT_OF_BOUNDS",
        "Paste would exceed the active Cel bounds.",
      );
    }
    const selection = this.#makeSelection(writes.map(({ x, y }) => ({ x, y })));
    return this.#executeWriteSet(
      writes,
      "clipboard.paste",
      "clipboard.paste",
      selection,
    );
  }

  beginTransform(
    transform: Draw120Transform = {},
  ): Draw120TransformPreview | Draw120Rejected {
    const selection = this.#selection;
    if (selection.bounds === null || selection.points.length === 0) {
      return this.#selectionRejected(
        "SELECTION_EMPTY",
        "Transform requires a non-empty selection.",
      );
    }
    const normalised = normaliseTransform(transform);
    if (!("rotateQuarterTurns" in normalised)) {
      return this.#selectionRejected(
        normalised[0]?.code ?? "TRANSFORM_INPUT_INVALID",
        normalised[0]?.message ?? "Transform input is invalid.",
      );
    }
    const asset = this.#activeAsset();
    const sourceWidth = selection.bounds.width;
    const sourceHeight = selection.bounds.height;
    const rotate = normalised.rotateQuarterTurns;
    const destination = new Map<string, Draw120Write>();
    const orderedPoints = [...selection.points].sort(comparePoints);
    for (const point of orderedPoints) {
      let localX = point.x - selection.bounds.x;
      let localY = point.y - selection.bounds.y;
      if (normalised.flipHorizontal) localX = sourceWidth - 1 - localX;
      if (normalised.flipVertical) localY = sourceHeight - 1 - localY;
      let orientedX = localX;
      let orientedY = localY;
      if (rotate === 1) {
        orientedX = sourceHeight - 1 - localY;
        orientedY = localX;
      } else if (rotate === 2) {
        orientedX = sourceWidth - 1 - localX;
        orientedY = sourceHeight - 1 - localY;
      } else if (rotate === 3) {
        orientedX = localY;
        orientedY = sourceWidth - 1 - localX;
      }
      const startX = Math.floor(orientedX * normalised.scaleX);
      const endX = Math.max(
        startX + 1,
        Math.ceil((orientedX + 1) * normalised.scaleX),
      );
      const startY = Math.floor(orientedY * normalised.scaleY);
      const endY = Math.max(
        startY + 1,
        Math.ceil((orientedY + 1) * normalised.scaleY),
      );
      const colorIndex = asset.raster.getPixel(point.x, point.y);
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const destinationPoint = {
            x: selection.bounds.x + normalised.translateX + x,
            y: selection.bounds.y + normalised.translateY + y,
            colorIndex,
          };
          if (
            destinationPoint.x < 0 ||
            destinationPoint.y < 0 ||
            destinationPoint.x >= asset.width ||
            destinationPoint.y >= asset.height
          ) {
            return this.#selectionRejected(
              "TRANSFORM_OUT_OF_BOUNDS",
              "Transform preview exceeds the active Cel bounds.",
            );
          }
          destination.set(pointKey(destinationPoint), destinationPoint);
        }
      }
    }
    const destinationPoints = [...destination.values()].map(({ x, y }) => ({
      x,
      y,
    }));
    const destinationSelection = this.#makeSelection(destinationPoints);
    const sourceKeys = new Set(selection.points.map(pointKey));
    const union = new Map<string, PixelPoint>();
    for (const point of selection.points) union.set(pointKey(point), point);
    for (const point of destinationPoints) union.set(pointKey(point), point);
    const writes: Draw120Write[] = [];
    for (const point of [...union.values()].sort(comparePoints)) {
      const target = destination.get(pointKey(point))?.colorIndex ?? 0;
      if (
        sourceKeys.has(pointKey(point)) && !destination.has(pointKey(point))
      ) {
        writes.push({ x: point.x, y: point.y, colorIndex: 0 });
      } else if (asset.raster.getPixel(point.x, point.y) !== target) {
        writes.push({ x: point.x, y: point.y, colorIndex: target });
      }
    }
    this.#preview = {
      sourceSelection: cloneSelection(selection),
      destinationSelection,
      writes,
      transform: {
        translateX: normalised.translateX,
        translateY: normalised.translateY,
        flipHorizontal: normalised.flipHorizontal ?? false,
        flipVertical: normalised.flipVertical ?? false,
        rotateQuarterTurns: rotate,
        scaleX: normalised.scaleX,
        scaleY: normalised.scaleY,
      },
    };
    return this.#preview;
  }

  cancelTransform(): Draw120Selection {
    this.#preview = undefined;
    return this.#selection;
  }

  async commitTransform(): Promise<Draw120Execution> {
    const preview = this.#preview;
    if (preview === undefined) {
      return this.#rejected(
        "TRANSFORM_PREVIEW_MISSING",
        "Commit requires an active transform preview.",
      );
    }
    const result = await this.#executeWriteSet(
      preview.writes,
      "selection.transformCommit",
      "selection.transformCommit",
      preview.destinationSelection,
    );
    if ("result" in result) this.#preview = undefined;
    return result;
  }

  async commitRasterWrites(
    writes: readonly Draw120Write[],
    sourceOperationType = "raster.writeSet",
  ): Promise<Draw120Execution> {
    return this.#executeWriteSet(
      writes,
      sourceOperationType,
      "raster.writeSet",
      this.#selection,
    );
  }

  undo(): ProjectState | undefined {
    const entry = this.#undo.pop();
    if (entry === undefined) return undefined;
    this.#redo.push(entry);
    this.#state = cloneProjectStateShared(entry.before);
    this.#core = new EditorCore(this.#state);
    this.#selection = cloneSelection(entry.beforeSelection);
    this.#preview = undefined;
    this.#sequence = this.#state.lastClientSequenceByClient[this.#clientId] ??
      0;
    return this.#state;
  }

  redo(): ProjectState | undefined {
    const entry = this.#redo.pop();
    if (entry === undefined) return undefined;
    this.#undo.push(entry);
    this.#state = cloneProjectStateShared(entry.after);
    this.#core = new EditorCore(this.#state);
    this.#selection = cloneSelection(entry.afterSelection);
    this.#preview = undefined;
    this.#sequence = this.#state.lastClientSequenceByClient[this.#clientId] ??
      0;
    return this.#state;
  }

  async canonicalRasterHash(): Promise<string> {
    return sha256Hex(this.#activeAsset().raster.toUint8Array());
  }

  #activeAsset() {
    const asset = this.#state.assets[this.#state.activeAssetId];
    const cel = this.#state.cels.find((candidate) =>
      candidate.id === this.#state.activeCelId
    );
    if (
      asset === undefined || cel === undefined || cel.assetId !== asset.id ||
      cel.id !== this.#selection.celId
    ) {
      throw new Error("Active Cel and raster asset are not aligned.");
    }
    return asset;
  }

  #makeSelection(points: readonly PixelPoint[]): Draw120Selection {
    const deduplicated = new Map(
      points.map((point) => [pointKey(point), { x: point.x, y: point.y }]),
    );
    return {
      celId: this.#state.activeCelId,
      points: [...deduplicated.values()].sort(comparePoints),
      bounds: boundsForPoints([...deduplicated.values()]),
    };
  }

  #selectionRejected(code: string, message: string): Draw120Rejected {
    return {
      state: this.#state,
      diagnostics: [errorDiagnostic(code, message)],
      undoDepth: this.undoDepth,
      redoDepth: this.redoDepth,
    };
  }

  #rejected(code: string, message: string): Draw120Rejected {
    return this.#selectionRejected(code, message);
  }

  async #executeWriteSet(
    inputWrites: readonly Draw120Write[],
    sourceOperationType: string,
    operationType: Draw120Commit["operationType"],
    afterSelection: Draw120Selection,
  ): Promise<Draw120Execution> {
    const asset = this.#activeAsset();
    const writes = new Map<string, Draw120Write>();
    for (const write of inputWrites) {
      if (
        !Number.isSafeInteger(write.x) ||
        !Number.isSafeInteger(write.y) ||
        !Number.isSafeInteger(write.colorIndex) ||
        write.x < 0 ||
        write.y < 0 ||
        write.x >= asset.width ||
        write.y >= asset.height ||
        write.colorIndex < 0 ||
        write.colorIndex >= asset.palette.length
      ) {
        return this.#rejected(
          "WRITE_SET_INVALID",
          "Write set contains an invalid coordinate or palette index.",
        );
      }
      if (asset.raster.getPixel(write.x, write.y) !== write.colorIndex) {
        writes.set(pointKey(write), { ...write });
      }
    }
    const orderedWrites = [...writes.values()].sort(comparePoints);
    const nextSequence = this.#sequence + 1;
    const command: EditorCommand = {
      commandId: `draw120-${nextSequence}`,
      commandType: "raster.writeSet",
      schemaVersion: 1,
      projectId: this.#state.projectId,
      assetId: asset.id,
      actorId: this.#actorId,
      clientId: this.#clientId,
      clientSequence: nextSequence,
      baseStructureEpoch: this.#state.structureEpoch,
      createdAtMonotonicMs: performance.now(),
      payload: {
        writes: orderedWrites.map(({ x, y, colorIndex }) => ({
          x,
          y,
          colorIndex,
        })),
        toolSessionId: `draw120-${sourceOperationType}`,
        sourceOperationType,
      },
    };
    const before = this.#state;
    const execution = await this.#core.execute(command);
    if (!execution.ok) {
      return {
        state: this.#state,
        diagnostics: execution.diagnostics,
        undoDepth: this.undoDepth,
        redoDepth: this.redoDepth,
      };
    }
    if (!execution.result.noOp) this.#sequence = nextSequence;
    this.#state = execution.state;
    this.#core = new EditorCore(this.#state);
    const beforeSelection = cloneSelection(this.#selection);
    this.#selection = cloneSelection(afterSelection);
    if (!execution.result.noOp) {
      this.#undo.push({
        before: cloneProjectStateShared(before),
        after: cloneProjectStateShared(this.#state),
        beforeSelection,
        afterSelection: cloneSelection(this.#selection),
        operationType,
      });
      this.#redo = [];
    }
    this.#preview = undefined;
    return {
      state: this.#state,
      result: execution.result,
      operationType,
      undoDepth: this.undoDepth,
      redoDepth: this.redoDepth,
    };
  }
}
