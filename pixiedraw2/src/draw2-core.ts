/**
 * PiXiEEDraw2 WP-100 Canonical Editor Core.
 *
 * This module is intentionally DOM-, Canvas-, UI-framework-, Network-, and
 * storage-implementation-independent. Browser/UI code belongs in draw2-entry.ts.
 * Tile size and renderer selection remain exchangeable until measured evidence exists.
 */

import {
  cloneDraw2Tilemaps,
  type Draw2LayerKind,
  type Draw2Tilemap,
} from "./draw2-tilemap.ts";

export type TileSize = 32 | 64;
export type TransportClass =
  | "LOCAL_ONLY"
  | "ACTIVE_SYNC"
  | "PLATFORM_EVENT"
  | "ASYNC_ON_DEMAND";

export interface Diagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly path?: string;
}

export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

/** Bounded deterministic pixel-line interpolation used by Pointer and tests. */
export const MAX_INTERPOLATED_STROKE_PIXELS = 65_536;

export function interpolatePixelLine(
  from: PixelPoint,
  to: PixelPoint,
): readonly PixelPoint[] {
  const points: PixelPoint[] = [];
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const stepX = from.x < to.x ? 1 : -1;
  const stepY = from.y < to.y ? 1 : -1;
  let error = dx - dy;
  while (true) {
    points.push({ x, y });
    if (x === to.x && y === to.y) break;
    const twiceError = error * 2;
    if (twiceError > -dy) {
      error -= dy;
      x += stepX;
    }
    if (twiceError < dx) {
      error += dx;
      y += stepY;
    }
    if (points.length > MAX_INTERPOLATED_STROKE_PIXELS) {
      throw new Error("Interpolated Stroke exceeds the bounded pixel budget.");
    }
  }
  return points;
}

export function interpolatePixelPath(
  points: readonly PixelPoint[],
): readonly PixelPoint[] {
  if (points.length === 0) return [];
  const interpolated: PixelPoint[] = [{
    x: points[0]?.x ?? 0,
    y: points[0]?.y ?? 0,
  }];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) continue;
    for (const point of interpolatePixelLine(from, to).slice(1)) {
      if (interpolated.length >= MAX_INTERPOLATED_STROKE_PIXELS) {
        throw new Error(
          "Interpolated Stroke exceeds the bounded pixel budget.",
        );
      }
      const previous = interpolated[interpolated.length - 1];
      if (previous?.x !== point.x || previous.y !== point.y) {
        interpolated.push(point);
      }
    }
  }
  return interpolated;
}

export interface DirtyTile {
  readonly assetId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly tileKey: string;
}

export interface DirtyRegion {
  readonly assetId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface InstrumentationPoint {
  readonly name:
    | "command.validate"
    | "command.commit"
    | "fill.scan"
    | "raster.cowSplit"
    | "dirty.tileCalculation"
    | "renderer.prepare"
    | "renderer.present"
    | "autosave.schedule"
    | "worker.transfer"
    | "memory.category";
  readonly durationMs: number;
  readonly detail?: Readonly<Record<string, number | string>>;
}

export interface InstrumentationSink {
  record(point: InstrumentationPoint): void;
}

export class SampledInstrumentation implements InstrumentationSink {
  readonly #sampleRate: number;
  readonly #points: InstrumentationPoint[] = [];
  readonly #random: () => number;

  constructor(sampleRate = 1, random: () => number = Math.random) {
    if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
      throw new Error("Instrumentation sampleRate must be between 0 and 1.");
    }
    this.#sampleRate = sampleRate;
    this.#random = random;
  }

  record(point: InstrumentationPoint): void {
    if (this.#random() <= this.#sampleRate) this.#points.push(point);
  }

  get points(): readonly InstrumentationPoint[] {
    return this.#points;
  }
}

class NullInstrumentation implements InstrumentationSink {
  record(_point: InstrumentationPoint): void {}
}

const NOOP_INSTRUMENTATION = new NullInstrumentation();

function diagnostic(code: string, message: string, path?: string): Diagnostic {
  return path === undefined
    ? { code, severity: "error", message }
    : { code, severity: "error", message, path };
}

function stableValue(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return { __type: "Uint8Array", values: Array.from(value) };
  }
  if (value instanceof Map) {
    return Array.from(value.entries())
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
      .map(([key, entry]) => [key, stableValue(entry)]);
  }
  if (Array.isArray(value)) return value.map((entry) => stableValue(entry));
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .filter((key) => object[key] !== undefined)
        .sort()
        .map((key) => [key, stableValue(object[key])]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value)) ?? "null";
}

export async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

interface TileCell {
  bytes: Uint8Array;
  references: number;
}

export interface TileMutation {
  readonly changed: boolean;
  readonly tile: DirtyTile;
  readonly copiedBytes: number;
  readonly cowSplit: boolean;
}

export interface RasterMemoryMetrics {
  readonly logicalRasterBytes: number;
  readonly allocatedTileBytes: number;
  readonly sharedTileBytes: number;
  readonly tileCount: number;
  readonly implicitTransparentTileCount: number;
  readonly cowSplitCount: number;
  readonly copiedBytes: number;
}

export interface TileSnapshot {
  readonly tileKey: string;
  readonly bytes: Uint8Array;
}

export interface RasterRegionSnapshot {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly implicitTransparentPixelCount: number;
}

/** Sparse indexed raster. Missing tiles are canonical transparent zeroes. */
export class IndexedTileRaster {
  readonly width: number;
  readonly height: number;
  readonly tileSize: TileSize;
  readonly #tiles: Map<string, TileCell>;
  #nonTransparentPixelCount: number;
  #cowSplitCount = 0;
  #copiedBytes = 0;

  private constructor(
    width: number,
    height: number,
    tileSize: TileSize,
    tiles: Map<string, TileCell>,
    nonTransparentPixelCount = 0,
  ) {
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this.#tiles = tiles;
    this.#nonTransparentPixelCount = nonTransparentPixelCount;
  }

  static empty(
    width: number,
    height: number,
    tileSize: TileSize,
  ): IndexedTileRaster {
    if (
      !Number.isSafeInteger(width) || width < 1 ||
      !Number.isSafeInteger(height) || height < 1
    ) {
      throw new Error("Raster dimensions must be positive safe integers.");
    }
    return new IndexedTileRaster(width, height, tileSize, new Map());
  }

  /** Rehydrates a sparse raster from its canonical tile snapshots. */
  static fromTileSnapshots(
    width: number,
    height: number,
    tileSize: TileSize,
    snapshots: readonly TileSnapshot[],
  ): IndexedTileRaster {
    const raster = IndexedTileRaster.empty(width, height, tileSize);
    const tiles = new Map<string, TileCell>();
    const expectedByteLength = tileSize * tileSize;
    const tileColumns = Math.ceil(width / tileSize);
    const tileRows = Math.ceil(height / tileSize);
    let nonTransparentPixelCount = 0;
    for (const snapshot of snapshots) {
      if (!/^\d+:\d+$/.test(snapshot.tileKey)) {
        throw new Error("Raster tile key is invalid.");
      }
      const [tileXText, tileYText] = snapshot.tileKey.split(":");
      const tileX = Number(tileXText);
      const tileY = Number(tileYText);
      if (
        !Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY) ||
        tileX < 0 || tileY < 0 || tileX >= tileColumns || tileY >= tileRows
      ) {
        throw new Error("Raster tile key is outside the raster.");
      }
      if (
        !(snapshot.bytes instanceof Uint8Array) ||
        snapshot.bytes.byteLength !== expectedByteLength
      ) {
        throw new Error("Raster tile byte length is invalid.");
      }
      for (const value of snapshot.bytes) {
        if (value !== 0) nonTransparentPixelCount += 1;
      }
      if (tiles.has(snapshot.tileKey)) {
        throw new Error("Raster tile key is duplicated.");
      }
      tiles.set(snapshot.tileKey, {
        bytes: new Uint8Array(snapshot.bytes),
        references: 1,
      });
    }
    return new IndexedTileRaster(
      raster.width,
      raster.height,
      raster.tileSize,
      tiles,
      nonTransparentPixelCount,
    );
  }

  /** Shares immutable Tile buffers; the next mutation splits only its affected Tile. */
  sharedClone(): IndexedTileRaster {
    const tiles = new Map<string, TileCell>();
    for (const [key, cell] of this.#tiles) {
      cell.references += 1;
      tiles.set(key, cell);
    }
    return new IndexedTileRaster(
      this.width,
      this.height,
      this.tileSize,
      tiles,
      this.#nonTransparentPixelCount,
    );
  }

  #tileCoordinates(
    x: number,
    y: number,
  ): { tileX: number; tileY: number; localIndex: number; tileKey: string } {
    const tileX = Math.floor(x / this.tileSize);
    const tileY = Math.floor(y / this.tileSize);
    const localX = x % this.tileSize;
    const localY = y % this.tileSize;
    return {
      tileX,
      tileY,
      localIndex: localY * this.tileSize + localX,
      tileKey: `${tileX}:${tileY}`,
    };
  }

  getPixel(x: number, y: number): number {
    if (
      !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 ||
      x >= this.width || y >= this.height
    ) {
      throw new Error("Pixel coordinate is outside the raster.");
    }
    const coordinates = this.#tileCoordinates(x, y);
    return this.#tiles.get(coordinates.tileKey)
      ?.bytes[coordinates.localIndex] ?? 0;
  }

  /** Returns whether the raster contains any non-transparent indexed pixel. */
  hasNonTransparentPixel(): boolean {
    return this.#nonTransparentPixelCount > 0;
  }

  setPixel(
    assetId: string,
    x: number,
    y: number,
    colorIndex: number,
  ): TileMutation {
    if (!Number.isInteger(colorIndex) || colorIndex < 0 || colorIndex > 255) {
      throw new Error(
        "Canonical palette index must be an integer from 0 through 255.",
      );
    }
    if (
      !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 ||
      x >= this.width || y >= this.height
    ) {
      throw new Error("Pixel coordinate is outside the raster.");
    }
    const coordinates = this.#tileCoordinates(x, y);
    let cell = this.#tiles.get(coordinates.tileKey);
    const previous = cell?.bytes[coordinates.localIndex] ?? 0;
    const tile: DirtyTile = {
      assetId,
      tileX: coordinates.tileX,
      tileY: coordinates.tileY,
      tileKey: coordinates.tileKey,
    };
    if (previous === colorIndex) {
      return { changed: false, tile, copiedBytes: 0, cowSplit: false };
    }

    let copiedBytes = 0;
    let cowSplit = false;
    if (cell === undefined) {
      cell = {
        bytes: new Uint8Array(this.tileSize * this.tileSize),
        references: 1,
      };
      this.#tiles.set(coordinates.tileKey, cell);
    } else if (cell.references > 1) {
      cell.references -= 1;
      cell = { bytes: new Uint8Array(cell.bytes), references: 1 };
      this.#tiles.set(coordinates.tileKey, cell);
      copiedBytes = cell.bytes.byteLength;
      cowSplit = true;
      this.#cowSplitCount += 1;
      this.#copiedBytes += copiedBytes;
    }
    cell.bytes[coordinates.localIndex] = colorIndex;
    if (previous === 0 && colorIndex !== 0) {
      this.#nonTransparentPixelCount += 1;
    } else if (previous !== 0 && colorIndex === 0) {
      this.#nonTransparentPixelCount -= 1;
    }
    return { changed: true, tile, copiedBytes, cowSplit };
  }

  snapshotTiles(): readonly TileSnapshot[] {
    return Array.from(this.#tiles.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([tileKey, cell]) => ({
        tileKey,
        bytes: new Uint8Array(cell.bytes),
      }));
  }

  /** Full canonical read is reserved for Golden Fixture equivalence, not active dirty rendering. */
  toUint8Array(): Uint8Array {
    const pixels = new Uint8Array(this.width * this.height);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        pixels[y * this.width + x] = this.getPixel(x, y);
      }
    }
    return pixels;
  }

  /** Reads only the requested presentation region; active editing must not call toUint8Array(). */
  readRegion(
    x: number,
    y: number,
    width: number,
    height: number,
  ): RasterRegionSnapshot {
    if (
      !Number.isSafeInteger(x) || !Number.isSafeInteger(y) ||
      !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || x < 0 || y < 0 || x + width > this.width ||
      y + height > this.height
    ) {
      throw new Error("Raster region is outside the raster.");
    }
    const pixels = new Uint8Array(width * height);
    let implicitTransparentPixelCount = 0;
    for (let regionY = 0; regionY < height; regionY += 1) {
      for (let regionX = 0; regionX < width; regionX += 1) {
        const sourceX = x + regionX;
        const sourceY = y + regionY;
        const coordinates = this.#tileCoordinates(sourceX, sourceY);
        const cell = this.#tiles.get(coordinates.tileKey);
        if (cell === undefined) implicitTransparentPixelCount += 1;
        pixels[regionY * width + regionX] =
          cell?.bytes[coordinates.localIndex] ?? 0;
      }
    }
    return { x, y, width, height, pixels, implicitTransparentPixelCount };
  }

  memoryMetrics(): RasterMemoryMetrics {
    let sharedTileBytes = 0;
    for (const cell of this.#tiles.values()) {
      if (cell.references > 1) sharedTileBytes += cell.bytes.byteLength;
    }
    const tileColumns = Math.ceil(this.width / this.tileSize);
    const tileRows = Math.ceil(this.height / this.tileSize);
    return {
      logicalRasterBytes: this.width * this.height,
      allocatedTileBytes: this.#tiles.size * this.tileSize * this.tileSize,
      sharedTileBytes,
      tileCount: this.#tiles.size,
      implicitTransparentTileCount: tileColumns * tileRows - this.#tiles.size,
      cowSplitCount: this.#cowSplitCount,
      copiedBytes: this.#copiedBytes,
    };
  }
}

export interface RasterAsset {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly palette: readonly number[];
  readonly raster: IndexedTileRaster;
  readonly revision: number;
}

export interface Draw2Layer {
  readonly id: string;
  readonly layerTrackId: string;
  readonly name: string;
  readonly order: number;
  readonly orderingKey: string;
  readonly visible: boolean;
  readonly opacity: number;
  readonly blendMode: "NORMAL" | "MULTIPLY";
  readonly locked: boolean;
  readonly lifecycle: "ACTIVE" | "ARCHIVED";
  /** Old Draw2 records omit this field; omission means a Raster layer. */
  readonly kind?: Draw2LayerKind;
}

export interface Draw2Frame {
  readonly id: string;
  readonly frameId: string;
  readonly index: number;
  readonly orderKey: string;
  readonly durationMs: number;
  readonly timingUnit: "MILLISECONDS";
  readonly metadataVersion: number;
}

export type Draw2CelBindingMode =
  | "EMPTY"
  | "RASTER"
  | "TILEMAP"
  | "DUPLICATE_INDEPENDENT"
  | "SHARED_REFERENCE"
  | "LINKED_HELD_CANDIDATE";

export interface Draw2Cel {
  readonly id: string;
  readonly celId: string;
  readonly layerId: string;
  readonly layerTrackId: string;
  readonly frameId: string;
  /** Explicit undefined is used by CLEAR/EMPTY transitions under strict optional typing. */
  readonly assetId?: string | undefined;
  readonly bindingMode: Draw2CelBindingMode;
  readonly recordVersion: number;
  readonly lifecycle: "ACTIVE" | "CLEARED" | "ARCHIVED";
}

export interface Draw2Timeline {
  readonly id: string;
  readonly timelineId: string;
  readonly frameOrder: readonly string[];
  readonly layerTrackOrder: readonly string[];
  readonly metadataVersion: number;
}

export interface ProjectState {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly name: string;
  readonly structureEpoch: number;
  readonly activeAssetId: string;
  readonly layers: readonly Draw2Layer[];
  readonly frames: readonly Draw2Frame[];
  readonly cels: readonly Draw2Cel[];
  readonly timeline: Draw2Timeline;
  readonly activeLayerId: string;
  readonly activeFrameId: string;
  readonly activeCelId: string;
  assets: Readonly<Record<string, RasterAsset>>;
  /** Sparse Tilemap placements. Optional for compatibility with old states. */
  readonly tilemaps?: Readonly<Record<string, Draw2Tilemap>>;
  appliedCommandIds: readonly string[];
  lastClientSequenceByClient: Readonly<Record<string, number>>;
}

export interface CreateProjectOptions {
  readonly projectId: string;
  readonly name?: string;
  readonly width?: number;
  readonly height?: number;
  readonly tileSize?: TileSize;
  readonly palette?: readonly number[];
}

function validatePalette(palette: readonly number[]): readonly number[] {
  if (palette.length < 1 || palette.length > 256) {
    throw new Error("Palette must contain 1 through 256 entries.");
  }
  if (palette[0] !== 0) throw new Error("Palette index 0 must be transparent.");
  for (const color of palette) {
    if (!Number.isSafeInteger(color) || color < 0 || color > 0xffffffff) {
      throw new Error("Palette colors must be uint32 values.");
    }
  }
  return [...palette];
}

export function createProject(options: CreateProjectOptions): ProjectState {
  if (!options.projectId) throw new Error("Project ID is required.");
  const width = options.width ?? 256;
  const height = options.height ?? 256;
  const palette = validatePalette(
    options.palette ?? [0, 0xffffffff, 0xff0000ff, 0x0000ffff],
  );
  const assetId = `${options.projectId}:draw:main`;
  const asset: RasterAsset = {
    id: assetId,
    width,
    height,
    palette,
    raster: IndexedTileRaster.empty(width, height, options.tileSize ?? 32),
    revision: 0,
  };
  const layerId = `${options.projectId}:layer:0`;
  const frameId = `${options.projectId}:frame:0`;
  const celId = `${options.projectId}:cel:0:0`;
  return {
    schemaVersion: 1,
    projectId: options.projectId,
    name: options.name ?? "Untitled Draw2 Project",
    structureEpoch: 1,
    activeAssetId: assetId,
    layers: [{
      id: layerId,
      layerTrackId: layerId,
      name: "Layer 1",
      order: 0,
      orderingKey: "00000000",
      visible: true,
      opacity: 1,
      blendMode: "NORMAL",
      locked: false,
      lifecycle: "ACTIVE",
      kind: "RASTER",
    }],
    frames: [{
      id: frameId,
      frameId,
      index: 0,
      orderKey: "00000000",
      durationMs: 100,
      timingUnit: "MILLISECONDS",
      metadataVersion: 1,
    }],
    cels: [{
      id: celId,
      celId,
      layerId,
      layerTrackId: layerId,
      frameId,
      assetId,
      bindingMode: "RASTER",
      recordVersion: 1,
      lifecycle: "ACTIVE",
    }],
    timeline: {
      id: `${options.projectId}:timeline:0`,
      timelineId: `${options.projectId}:timeline:0`,
      frameOrder: [frameId],
      layerTrackOrder: [layerId],
      metadataVersion: 1,
    },
    activeLayerId: layerId,
    activeFrameId: frameId,
    activeCelId: celId,
    assets: { [assetId]: asset },
    tilemaps: {},
    appliedCommandIds: [],
    lastClientSequenceByClient: {},
  };
}

export interface ProjectRepository {
  open(projectId: string): ProjectState | undefined;
  create(options: CreateProjectOptions): ProjectState;
  save(state: ProjectState): void;
}

/** Local-only repository seam. IndexedDB/OPFS adapters belong outside Canonical Editor Core. */
export class InMemoryProjectRepository implements ProjectRepository {
  readonly #projects = new Map<string, ProjectState>();

  open(projectId: string): ProjectState | undefined {
    const state = this.#projects.get(projectId);
    if (state === undefined) return undefined;
    return cloneStateShared(state);
  }

  create(options: CreateProjectOptions): ProjectState {
    const state = createProject(options);
    this.#projects.set(state.projectId, state);
    return cloneStateShared(state);
  }

  save(state: ProjectState): void {
    this.#projects.set(state.projectId, cloneStateShared(state));
  }
}

export interface CommandEnvelope<TPayload> {
  readonly commandId: string;
  readonly commandType:
    | "raster.setPixel"
    | "raster.strokeCommit"
    | "raster.writeSet"
    | "raster.fill"
    | "palette.setColor"
    | "palette.appendColor";
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly assetId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly clientSequence: number;
  readonly baseStructureEpoch: number;
  readonly createdAtMonotonicMs: number;
  readonly payload: TPayload;
}

export interface SetPixelPayload {
  readonly x: number;
  readonly y: number;
  readonly colorIndex: number;
}
export interface StrokeCommitPayload {
  readonly points: readonly PixelPoint[];
  readonly colorIndex: number;
}
export interface WriteSetPayload {
  readonly writes: readonly (PixelPoint & { readonly colorIndex: number })[];
  /** Optional provenance retained for advanced-tool commits. */
  readonly toolSessionId?: string;
  readonly sourceOperationType?: string;
}
export interface FillPayload {
  readonly seedX: number;
  readonly seedY: number;
  readonly colorIndex: number;
  readonly maxPixels: number;
}
export interface PaletteSetColorPayload {
  readonly paletteIndex: number;
  readonly color: number;
}
export interface PaletteAppendColorPayload {
  readonly color: number;
}
export type EditorCommand =
  | CommandEnvelope<SetPixelPayload> & {
    readonly commandType: "raster.setPixel";
  }
  | CommandEnvelope<StrokeCommitPayload> & {
    readonly commandType: "raster.strokeCommit";
  }
  | CommandEnvelope<WriteSetPayload> & {
    readonly commandType: "raster.writeSet";
  }
  | CommandEnvelope<FillPayload> & { readonly commandType: "raster.fill" }
  | CommandEnvelope<PaletteSetColorPayload> & {
    readonly commandType: "palette.setColor";
  }
  | CommandEnvelope<PaletteAppendColorPayload> & {
    readonly commandType: "palette.appendColor";
  };

export type StructuralOperationType =
  | "timeline.addLayerTrack"
  | "timeline.removeLayerTrack"
  | "timeline.duplicateLayerTrack"
  | "timeline.reorderLayerTrack"
  | "timeline.renameLayerTrack"
  | "timeline.setLayerVisibility"
  | "timeline.setLayerOpacity"
  | "timeline.setLayerBlendMode"
  | "timeline.setLayerLock"
  | "timeline.addFrame"
  | "timeline.removeFrame"
  | "timeline.duplicateFrame"
  | "timeline.reorderFrame"
  | "timeline.changeFrameDuration"
  | "timeline.createCel"
  | "timeline.clearCel"
  | "timeline.replaceCelBinding"
  | "timeline.activateCel";

export type CanonicalOperationType =
  | EditorCommand["commandType"]
  | "selection.transformCommit"
  | "clipboard.copy"
  | "clipboard.cut"
  | "clipboard.paste"
  | StructuralOperationType;

export type StructuralDirtyDomain =
  | "RASTER_DIRTY"
  | "COMPOSITE_DIRTY"
  | "TIMELINE_STRUCTURE_DIRTY"
  | "TIMELINE_CELL_DIRTY"
  | "LAYER_METADATA_DIRTY"
  | "ONION_SKIN_DIRTY";

export interface CanonicalOperation {
  readonly operationId: string;
  readonly operationType: CanonicalOperationType;
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

export interface CommandResult {
  readonly operation: CanonicalOperation;
  readonly metricScope?: Draw2MetricScope;
  readonly structuralDirtyDomains?: readonly StructuralDirtyDomain[];
  readonly dirtyTiles: readonly DirtyTile[];
  readonly dirtyRegions: readonly DirtyRegion[];
  readonly memory: RasterMemoryMetrics;
  readonly copiedBytes: number;
  readonly cowSplitCount: number;
  readonly strokeMetrics?: {
    readonly inputPointCount: number;
    readonly interpolatedPixelCount: number;
    readonly touchedTileCount: number;
    readonly dirtyTileCount: number;
    readonly dirtyRegionCount: number;
    readonly unrelatedFrameCount: number;
    readonly unrelatedLayerCount: number;
  };
  readonly trace: {
    readonly commandValidationCount: number;
    readonly commandCommitCount: number;
    readonly affectedLayerCount: number;
    readonly affectedFrameCount: number;
    readonly fullRasterCloneCount: number;
    readonly fullTimelineRebuildCount: number;
    readonly wholeProjectSerializationCount: number;
  };
  readonly instrumentation: readonly InstrumentationPoint[];
}

export type Draw2MetricScope =
  | "COMMAND_ONLY"
  | "COMMAND_TO_DIRTY"
  | "DIRTY_TO_PRESENT"
  | "INPUT_TO_VISIBLE"
  | "FULL_COMPOSITOR"
  | "PREVIEW_ONLY";

export type ExecuteResult =
  | {
    readonly ok: true;
    readonly state: ProjectState;
    readonly result: CommandResult;
  }
  | {
    readonly ok: false;
    readonly state: ProjectState;
    readonly diagnostics: readonly Diagnostic[];
  };

export interface CoreClock {
  now(): number;
}

export interface EditorCoreOptions {
  readonly clock?: CoreClock;
  readonly instrumentation?: InstrumentationSink;
}

export interface EditorExecuteOptions {
  readonly cancelRequested?: () => boolean;
}

export function cloneProjectStateShared(state: ProjectState): ProjectState {
  const assets: Record<string, RasterAsset> = {};
  for (const [id, asset] of Object.entries(state.assets)) {
    assets[id] = { ...asset, raster: asset.raster.sharedClone() };
  }
  return {
    ...state,
    assets,
    tilemaps: cloneDraw2Tilemaps(state.tilemaps),
    layers: state.layers.map((layer) => ({ ...layer })),
    frames: state.frames.map((frame) => ({ ...frame })),
    cels: state.cels.map((cel) => ({ ...cel })),
    timeline: {
      ...state.timeline,
      frameOrder: [...state.timeline.frameOrder],
      layerTrackOrder: [...state.timeline.layerTrackOrder],
    },
    appliedCommandIds: [...state.appliedCommandIds],
    lastClientSequenceByClient: { ...state.lastClientSequenceByClient },
  };
}

function cloneStateShared(state: ProjectState): ProjectState {
  return cloneProjectStateShared(state);
}

function validateEnvelope(
  state: ProjectState,
  command: EditorCommand,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (command.schemaVersion !== 1) {
    diagnostics.push(
      diagnostic(
        "COMMAND_SCHEMA_UNSUPPORTED",
        "Unsupported command schema version.",
        "schemaVersion",
      ),
    );
  }
  if (command.projectId !== state.projectId) {
    diagnostics.push(
      diagnostic(
        "COMMAND_PROJECT_MISMATCH",
        "Command project does not match state.",
        "projectId",
      ),
    );
  }
  if (command.baseStructureEpoch !== state.structureEpoch) {
    diagnostics.push(
      diagnostic(
        "COMMAND_STRUCTURE_EPOCH_MISMATCH",
        "Command structure epoch is stale.",
        "baseStructureEpoch",
      ),
    );
  }
  if (state.appliedCommandIds.includes(command.commandId)) {
    diagnostics.push(
      diagnostic(
        "COMMAND_DUPLICATE",
        "Command was already applied.",
        "commandId",
      ),
    );
  }
  const expectedSequence =
    (state.lastClientSequenceByClient[command.clientId] ?? 0) + 1;
  if (command.clientSequence !== expectedSequence) {
    diagnostics.push(
      diagnostic(
        "COMMAND_CLIENT_SEQUENCE_GAP",
        `Expected client sequence ${expectedSequence}.`,
        "clientSequence",
      ),
    );
  }
  if (
    !command.commandId || !command.projectId || !command.assetId ||
    !command.actorId || !command.clientId
  ) {
    diagnostics.push(
      diagnostic(
        "COMMAND_REQUIRED_FIELD",
        "Command identity fields are required.",
      ),
    );
  }
  if (
    !Number.isSafeInteger(command.clientSequence) || command.clientSequence < 1
  ) {
    diagnostics.push(
      diagnostic(
        "COMMAND_CLIENT_SEQUENCE_INVALID",
        "clientSequence must be a positive safe integer.",
        "clientSequence",
      ),
    );
  }
  if (
    !Number.isFinite(command.createdAtMonotonicMs) ||
    command.createdAtMonotonicMs < 0
  ) {
    diagnostics.push(
      diagnostic(
        "COMMAND_MONOTONIC_TIME_INVALID",
        "createdAtMonotonicMs must be finite and non-negative.",
        "createdAtMonotonicMs",
      ),
    );
  }
  return diagnostics;
}

function validatePayload(
  state: ProjectState,
  command: EditorCommand,
): Diagnostic[] {
  const asset = state.assets[command.assetId];
  if (asset === undefined) {
    return [
      diagnostic(
        "RASTER_ASSET_NOT_FOUND",
        "Raster asset was not found.",
        "assetId",
      ),
    ];
  }
  const diagnostics: Diagnostic[] = [];
  if (command.commandType === "palette.appendColor") {
    if (asset.palette.length >= 256) {
      diagnostics.push(
        diagnostic(
          "PALETTE_FULL",
          "Palette cannot contain more than 256 entries.",
          "payload.color",
        ),
      );
    }
    if (
      !Number.isSafeInteger(command.payload.color) ||
      command.payload.color < 0 || command.payload.color > 0xffffffff
    ) {
      diagnostics.push(
        diagnostic(
          "PALETTE_COLOR_INVALID",
          "Palette color must be a uint32 value.",
          "payload.color",
        ),
      );
    }
    return diagnostics;
  }
  if (command.commandType === "palette.setColor") {
    if (
      !Number.isSafeInteger(command.payload.paletteIndex) ||
      command.payload.paletteIndex < 1 ||
      command.payload.paletteIndex >= asset.palette.length
    ) {
      diagnostics.push(
        diagnostic(
          "PALETTE_INDEX_INVALID",
          "paletteIndex must reference an existing non-transparent palette entry.",
          "payload.paletteIndex",
        ),
      );
    }
    if (
      !Number.isSafeInteger(command.payload.color) ||
      command.payload.color < 0 || command.payload.color > 0xffffffff
    ) {
      diagnostics.push(
        diagnostic(
          "PALETTE_COLOR_INVALID",
          "Palette color must be a uint32 value.",
          "payload.color",
        ),
      );
    }
    return diagnostics;
  }
  if (command.commandType === "raster.fill") {
    const { seedX, seedY, colorIndex, maxPixels } = command.payload;
    if (!Number.isSafeInteger(seedX) || seedX < 0 || seedX >= asset.width) {
      diagnostics.push(
        diagnostic(
          "FILL_SEED_X_OUT_OF_BOUNDS",
          "Fill seed x is outside the raster.",
          "payload.seedX",
        ),
      );
    }
    if (!Number.isSafeInteger(seedY) || seedY < 0 || seedY >= asset.height) {
      diagnostics.push(
        diagnostic(
          "FILL_SEED_Y_OUT_OF_BOUNDS",
          "Fill seed y is outside the raster.",
          "payload.seedY",
        ),
      );
    }
    if (
      !Number.isSafeInteger(maxPixels) || maxPixels < 1 || maxPixels > 1_048_576
    ) {
      diagnostics.push(
        diagnostic(
          "FILL_PIXEL_LIMIT_INVALID",
          "maxPixels must be between 1 and 1048576.",
          "payload.maxPixels",
        ),
      );
    }
    if (
      !Number.isSafeInteger(colorIndex) || colorIndex < 0 || colorIndex > 255 ||
      colorIndex >= asset.palette.length
    ) {
      diagnostics.push(
        diagnostic(
          "RASTER_COLOR_INDEX_INVALID",
          "colorIndex must reference palette index 0..255.",
          "payload.colorIndex",
        ),
      );
    }
    return diagnostics;
  }
  const points = command.commandType === "raster.setPixel"
    ? [command.payload]
    : command.commandType === "raster.strokeCommit"
    ? command.payload.points
    : command.commandType === "raster.writeSet"
    ? command.payload.writes
    : [];
  if (
    command.commandType === "raster.strokeCommit" &&
    (points.length < 1 || points.length > MAX_INTERPOLATED_STROKE_PIXELS)
  ) {
    diagnostics.push(
      diagnostic(
        "STROKE_POINT_COUNT_INVALID",
        `Stroke point count must be between 1 and ${MAX_INTERPOLATED_STROKE_PIXELS}.`,
        "payload.points",
      ),
    );
  }
  if (
    command.commandType === "raster.strokeCommit" && diagnostics.length === 0
  ) {
    try {
      interpolatePixelPath(command.payload.points);
    } catch (cause) {
      diagnostics.push(
        diagnostic(
          "STROKE_POINT_COUNT_INVALID",
          cause instanceof Error
            ? cause.message
            : "Stroke interpolation exceeded its bounded pixel budget.",
          "payload.points",
        ),
      );
    }
  }
  if (command.commandType === "raster.writeSet") {
    if (
      command.payload.writes.length < 1 ||
      command.payload.writes.length > 1_048_576
    ) {
      diagnostics.push(
        diagnostic(
          "WRITE_SET_COUNT_INVALID",
          "Write set must contain between 1 and 1048576 writes.",
          "payload.writes",
        ),
      );
    }
    for (const write of command.payload.writes) {
      if (
        !Number.isSafeInteger(write.colorIndex) || write.colorIndex < 0 ||
        write.colorIndex > 255 || write.colorIndex >= asset.palette.length
      ) {
        diagnostics.push(
          diagnostic(
            "RASTER_COLOR_INDEX_INVALID",
            "colorIndex must reference palette index 0..255.",
            "payload.writes.colorIndex",
          ),
        );
      }
    }
  } else {
    const colorIndex = command.payload.colorIndex;
    if (
      !Number.isSafeInteger(colorIndex) || colorIndex < 0 || colorIndex > 255 ||
      colorIndex >= asset.palette.length
    ) {
      diagnostics.push(
        diagnostic(
          "RASTER_COLOR_INDEX_INVALID",
          "colorIndex must reference palette index 0..255.",
          "payload.colorIndex",
        ),
      );
    }
  }
  for (const point of points) {
    if (
      !Number.isSafeInteger(point.x) || point.x < 0 || point.x >= asset.width
    ) {
      diagnostics.push(
        diagnostic(
          "RASTER_X_OUT_OF_BOUNDS",
          "x is outside the raster.",
          "payload.x",
        ),
      );
    }
    if (
      !Number.isSafeInteger(point.y) || point.y < 0 || point.y >= asset.height
    ) {
      diagnostics.push(
        diagnostic(
          "RASTER_Y_OUT_OF_BOUNDS",
          "y is outside the raster.",
          "payload.y",
        ),
      );
    }
  }
  return diagnostics;
}

function regionFromPoints(
  assetId: string,
  points: readonly PixelPoint[],
): DirtyRegion {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    assetId,
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX + 1,
    height: Math.max(...ys) - minY + 1,
  };
}

function fullRegion(asset: RasterAsset): DirtyRegion {
  return {
    assetId: asset.id,
    x: 0,
    y: 0,
    width: asset.width,
    height: asset.height,
  };
}

function fillPlan(
  asset: RasterAsset,
  payload: FillPayload,
  options: EditorExecuteOptions,
): { points: readonly PixelPoint[]; visitedCount: number } | Diagnostic[] {
  const targetColor = asset.raster.getPixel(payload.seedX, payload.seedY);
  if (targetColor === payload.colorIndex) {
    return { points: [], visitedCount: 1 };
  }
  const queue: PixelPoint[] = [{ x: payload.seedX, y: payload.seedY }];
  const visited = new Set<number>();
  const points: PixelPoint[] = [];
  let cursor = 0;
  while (cursor < queue.length) {
    if (options.cancelRequested?.() === true) {
      return [
        diagnostic(
          "FILL_CANCELLED",
          "Fill was cancelled before canonical mutation.",
          "payload",
        ),
      ];
    }
    const point = queue[cursor];
    cursor += 1;
    if (point === undefined) continue;
    const key = point.y * asset.width + point.x;
    if (visited.has(key)) continue;
    visited.add(key);
    if (asset.raster.getPixel(point.x, point.y) !== targetColor) continue;
    if (points.length >= payload.maxPixels) {
      return [
        diagnostic(
          "FILL_PIXEL_LIMIT_EXCEEDED",
          "Fill exceeded its bounded pixel budget.",
          "payload.maxPixels",
        ),
      ];
    }
    points.push(point);
    if (point.x > 0) queue.push({ x: point.x - 1, y: point.y });
    if (point.x + 1 < asset.width) queue.push({ x: point.x + 1, y: point.y });
    if (point.y > 0) queue.push({ x: point.x, y: point.y - 1 });
    if (point.y + 1 < asset.height) queue.push({ x: point.x, y: point.y + 1 });
  }
  return { points, visitedCount: visited.size };
}

export class EditorCore {
  #state: ProjectState;
  readonly #clock: CoreClock;
  readonly #instrumentation: InstrumentationSink;

  constructor(state: ProjectState, options: EditorCoreOptions = {}) {
    this.#state = state;
    this.#clock = options.clock ?? { now: () => performance.now() };
    this.#instrumentation = options.instrumentation ?? NOOP_INSTRUMENTATION;
  }

  get state(): ProjectState {
    return this.#state;
  }

  async execute(
    command: EditorCommand,
    options: EditorExecuteOptions = {},
  ): Promise<ExecuteResult> {
    const validationStarted = this.#clock.now();
    const envelopeDiagnostics = validateEnvelope(this.#state, command);
    const payloadDiagnostics = envelopeDiagnostics.length === 0
      ? validatePayload(this.#state, command)
      : [];
    this.#instrumentation.record({
      name: "command.validate",
      durationMs: this.#clock.now() - validationStarted,
    });
    const diagnostics = [...envelopeDiagnostics, ...payloadDiagnostics];
    if (diagnostics.length > 0) {
      return { ok: false, state: this.#state, diagnostics };
    }

    const sourceAsset = this.#state.assets[command.assetId];
    if (sourceAsset === undefined) {
      return {
        ok: false,
        state: this.#state,
        diagnostics: [
          diagnostic("RASTER_ASSET_NOT_FOUND", "Raster asset was not found."),
        ],
      };
    }
    let points: readonly PixelPoint[] = [];
    let fillVisitedCount = 0;
    if (command.commandType === "raster.setPixel") points = [command.payload];
    else if (command.commandType === "raster.strokeCommit") {
      points = interpolatePixelPath(command.payload.points);
    } else if (command.commandType === "raster.writeSet") {
      points = command.payload.writes;
    } else if (command.commandType === "raster.fill") {
      const fillStarted = this.#clock.now();
      const planned = fillPlan(sourceAsset, command.payload, options);
      this.#instrumentation.record({
        name: "fill.scan",
        durationMs: this.#clock.now() - fillStarted,
        detail: {
          visitedCount: Array.isArray(planned) ? 0 : planned.visitedCount,
        },
      });
      if (Array.isArray(planned)) {
        return { ok: false, state: this.#state, diagnostics: planned };
      }
      points = planned.points;
      fillVisitedCount = planned.visitedCount;
    }

    const nextState = cloneStateShared(this.#state);
    const asset = nextState.assets[command.assetId];
    if (asset === undefined) {
      return {
        ok: false,
        state: this.#state,
        diagnostics: [
          diagnostic("RASTER_ASSET_NOT_FOUND", "Raster asset was not found."),
        ],
      };
    }
    const dirtyTiles = new Map<string, DirtyTile>();
    const touchedTileKeys = new Set<string>();
    let copiedBytes = 0;
    let cowSplitCount = 0;
    const commitStarted = this.#clock.now();
    if (
      command.commandType !== "palette.setColor" &&
      command.commandType !== "palette.appendColor"
    ) {
      const writeColors = command.commandType === "raster.writeSet"
        ? new Map(
          command.payload.writes.map((
            write,
          ) => [`${write.x}:${write.y}`, write.colorIndex]),
        )
        : undefined;
      for (const point of points) {
        const tileX = Math.floor(point.x / asset.raster.tileSize);
        const tileY = Math.floor(point.y / asset.raster.tileSize);
        touchedTileKeys.add(`${asset.id}:${tileX}:${tileY}`);
        const colorIndex = writeColors?.get(`${point.x}:${point.y}`) ??
          (command.commandType === "raster.writeSet"
            ? 0
            : command.payload.colorIndex);
        const mutation = asset.raster.setPixel(
          asset.id,
          point.x,
          point.y,
          colorIndex,
        );
        if (mutation.changed) {
          dirtyTiles.set(mutation.tile.tileKey, mutation.tile);
          copiedBytes += mutation.copiedBytes;
          if (mutation.cowSplit) cowSplitCount += 1;
        }
      }
    }
    const nextAsset: RasterAsset = command.commandType === "palette.setColor"
      ? {
        ...asset,
        palette: asset.palette.map((color, index) =>
          index === command.payload.paletteIndex ? command.payload.color : color
        ),
        revision: asset.revision + 1,
      }
      : command.commandType === "palette.appendColor"
      ? {
        ...asset,
        palette: [...asset.palette, command.payload.color],
        revision: asset.revision + 1,
      }
      : { ...asset, revision: asset.revision + (dirtyTiles.size > 0 ? 1 : 0) };
    nextState.assets = { ...nextState.assets, [asset.id]: nextAsset };
    nextState.appliedCommandIds = [
      ...nextState.appliedCommandIds,
      command.commandId,
    ];
    nextState.lastClientSequenceByClient = {
      ...nextState.lastClientSequenceByClient,
      [command.clientId]: command.clientSequence,
    };
    this.#instrumentation.record({
      name: "command.commit",
      durationMs: this.#clock.now() - commitStarted,
    });
    if (cowSplitCount > 0) {
      this.#instrumentation.record({
        name: "raster.cowSplit",
        durationMs: 0,
        detail: { count: cowSplitCount, copiedBytes },
      });
    }
    this.#instrumentation.record({
      name: "dirty.tileCalculation",
      durationMs: 0,
      detail: { tileCount: dirtyTiles.size },
    });

    const payload = command.commandType === "raster.setPixel"
      ? {
        ...command.payload,
        previousColorIndex: this.#state.assets[asset.id]?.raster.getPixel(
          command.payload.x,
          command.payload.y,
        ) ?? 0,
      }
      : command.commandType === "raster.fill"
      ? {
        ...command.payload,
        filledPixelCount: points.length,
        visitedCount: fillVisitedCount,
      }
      : command.commandType === "palette.setColor"
      ? {
        ...command.payload,
        previousColor:
          this.#state.assets[asset.id]?.palette[command.payload.paletteIndex] ??
            0,
      }
      : command.commandType === "palette.appendColor"
      ? { ...command.payload, paletteIndex: nextAsset.palette.length - 1 }
      : { ...command.payload, dirtyTileCount: dirtyTiles.size };
    const operationBody = {
      operationType: command.commandType,
      schemaVersion: 1 as const,
      commandId: command.commandId,
      projectId: command.projectId,
      assetId: command.assetId,
      actorId: command.actorId,
      clientId: command.clientId,
      clientSequence: command.clientSequence,
      structureEpoch: nextState.structureEpoch,
      payload,
    };
    const operation: CanonicalOperation = {
      operationId: `op_${await sha256Hex(operationBody)}`,
      ...operationBody,
    };
    this.#state = nextState;
    const dirtyRegions = command.commandType === "palette.setColor" ||
        command.commandType === "palette.appendColor"
      ? [fullRegion(asset)]
      : dirtyTiles.size === 0
      ? []
      : [regionFromPoints(asset.id, points)];
    const strokeMetrics = command.commandType === "raster.strokeCommit"
      ? {
        inputPointCount: command.payload.points.length,
        interpolatedPixelCount: points.length,
        touchedTileCount: touchedTileKeys.size,
        dirtyTileCount: dirtyTiles.size,
        dirtyRegionCount: dirtyRegions.length,
        unrelatedFrameCount: Math.max(0, this.#state.frames.length - 1),
        unrelatedLayerCount: Math.max(0, this.#state.layers.length - 1),
      }
      : undefined;
    return {
      ok: true,
      state: nextState,
      result: {
        operation,
        dirtyTiles: [...dirtyTiles.values()].sort((left, right) =>
          left.tileKey.localeCompare(right.tileKey)
        ),
        dirtyRegions,
        memory: nextAsset.raster.memoryMetrics(),
        copiedBytes,
        cowSplitCount,
        ...(strokeMetrics === undefined ? {} : { strokeMetrics }),
        trace: {
          commandValidationCount: 1,
          commandCommitCount: 1,
          affectedLayerCount: 1,
          affectedFrameCount: 1,
          fullRasterCloneCount: 0,
          fullTimelineRebuildCount: 0,
          wholeProjectSerializationCount: 0,
        },
        instrumentation: this.#instrumentation instanceof SampledInstrumentation
          ? this.#instrumentation.points
          : [],
      },
    };
  }
}

export interface RendererRequest {
  readonly state: ProjectState;
  readonly assetId: string;
  readonly dirtyTiles: readonly DirtyTile[];
  readonly dirtyRegions?: readonly DirtyRegion[];
  readonly mode?: "FULL_REFRESH_GOLDEN" | "DIRTY_REGIONS";
}

export interface RendererResult {
  readonly backendId: string;
  readonly canonicalPixelHash?: string;
  readonly hashScope: "FULL_RASTER" | "DIRTY_REGIONS" | "NOT_COMPUTED";
  readonly dirtyTileCount: number;
  readonly preparationPixelCount: number;
  readonly presentPixelCount: number;
  readonly implicitTransparentPixelCount: number;
  readonly fullRefresh: boolean;
  readonly fallbackUsed: boolean;
}

export interface RendererAdapter {
  readonly backendId: string;
  render(request: RendererRequest): Promise<RendererResult>;
}

/** Golden/reference renderer. It never becomes the canonical state owner. */
export class ReferenceRenderer implements RendererAdapter {
  readonly backendId = "reference-indexed";

  async render(request: RendererRequest): Promise<RendererResult> {
    const asset = request.state.assets[request.assetId];
    if (asset === undefined) throw new Error("Renderer asset was not found.");
    const dirtyRegions = request.dirtyRegions ?? [];
    if (request.mode === "DIRTY_REGIONS") {
      let preparationPixelCount = 0;
      let implicitTransparentPixelCount = 0;
      for (const region of dirtyRegions) {
        const snapshot = asset.raster.readRegion(
          region.x,
          region.y,
          region.width,
          region.height,
        );
        preparationPixelCount += snapshot.pixels.length;
        implicitTransparentPixelCount += snapshot.implicitTransparentPixelCount;
      }
      return {
        backendId: this.backendId,
        hashScope: "NOT_COMPUTED",
        dirtyTileCount: request.dirtyTiles.length,
        preparationPixelCount,
        presentPixelCount: preparationPixelCount,
        implicitTransparentPixelCount,
        fullRefresh: false,
        fallbackUsed: false,
      };
    }
    const pixels = asset.raster.toUint8Array();
    return {
      backendId: this.backendId,
      canonicalPixelHash: await sha256Hex(pixels),
      hashScope: "FULL_RASTER",
      dirtyTileCount: request.dirtyTiles.length,
      preparationPixelCount: pixels.length,
      presentPixelCount: pixels.length,
      implicitTransparentPixelCount: 0,
      fullRefresh: true,
      fallbackUsed: false,
    };
  }
}

/** Keeps Canonical State intact when an optional presentation backend fails. */
export class FallbackRenderer implements RendererAdapter {
  readonly backendId: string;
  readonly #primary: RendererAdapter;
  readonly #fallback: RendererAdapter;

  constructor(primary: RendererAdapter, fallback: RendererAdapter) {
    this.#primary = primary;
    this.#fallback = fallback;
    this.backendId = `${primary.backendId}->${fallback.backendId}`;
  }

  async render(request: RendererRequest): Promise<RendererResult> {
    try {
      return await this.#primary.render(request);
    } catch {
      const fallbackResult = await this.#fallback.render(request);
      return {
        ...fallbackResult,
        backendId: this.backendId,
        fallbackUsed: true,
      };
    }
  }
}

export interface JournalSink {
  append(operation: CanonicalOperation): Promise<void>;
  writeDirtyTiles(
    assetId: string,
    tiles: readonly TileSnapshot[],
  ): Promise<void>;
  writeCheckpoint(state: ProjectState): Promise<void>;
}

export class InMemoryLocalJournal implements JournalSink {
  readonly operations: CanonicalOperation[] = [];
  readonly dirtyTileWrites: Array<
    { assetId: string; tiles: readonly TileSnapshot[] }
  > = [];
  readonly checkpoints: ProjectState[] = [];

  async append(operation: CanonicalOperation): Promise<void> {
    this.operations.push(structuredClone(operation));
  }
  async writeDirtyTiles(
    assetId: string,
    tiles: readonly TileSnapshot[],
  ): Promise<void> {
    this.dirtyTileWrites.push({
      assetId,
      tiles: tiles.map((tile) => ({
        tileKey: tile.tileKey,
        bytes: new Uint8Array(tile.bytes),
      })),
    });
  }
  async writeCheckpoint(state: ProjectState): Promise<void> {
    this.checkpoints.push(state);
  }
}

export class LocalAutosaveCoordinator {
  readonly #journal: JournalSink;
  readonly #checkpointEvery: number;
  #operationCount = 0;
  readonly #instrumentation: InstrumentationSink;

  constructor(
    journal: JournalSink,
    checkpointEvery = 20,
    instrumentation: InstrumentationSink = NOOP_INSTRUMENTATION,
  ) {
    if (!Number.isSafeInteger(checkpointEvery) || checkpointEvery < 1) {
      throw new Error("checkpointEvery must be positive.");
    }
    this.#journal = journal;
    this.#checkpointEvery = checkpointEvery;
    this.#instrumentation = instrumentation;
  }

  async record(state: ProjectState, result: CommandResult): Promise<void> {
    const started = performance.now();
    await this.#journal.append(result.operation);
    const asset = state.assets[result.operation.assetId];
    if (asset === undefined) throw new Error("Autosave asset was not found.");
    const dirtyKeys = new Set(result.dirtyTiles.map((tile) => tile.tileKey));
    await this.#journal.writeDirtyTiles(
      asset.id,
      asset.raster.snapshotTiles().filter((tile) =>
        dirtyKeys.has(tile.tileKey)
      ),
    );
    this.#operationCount += 1;
    if (this.#operationCount % this.#checkpointEvery === 0) {
      await this.#journal.writeCheckpoint(state);
    }
    this.#instrumentation.record({
      name: "autosave.schedule",
      durationMs: performance.now() - started,
      detail: { dirtyTileCount: result.dirtyTiles.length },
    });
  }
}

export interface LocalTransportMessage {
  readonly transport: "LOCAL_ONLY";
  readonly kind: "DRAW2_STATE_CHANGED";
  readonly projectId: string;
  readonly assetId: string;
  readonly revision: number;
}

export class LocalTransport {
  readonly #listeners = new Set<(message: LocalTransportMessage) => void>();
  subscribe(listener: (message: LocalTransportMessage) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  publish(message: LocalTransportMessage): void {
    for (const listener of this.#listeners) listener(message);
  }
}
