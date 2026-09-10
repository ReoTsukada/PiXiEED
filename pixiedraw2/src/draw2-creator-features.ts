import type {
  BrushAlgorithm,
  BrushPattern,
  BrushShape,
  PixelReader,
  RasterBounds,
} from "./draw2-basic-tools.ts";
import { MAX_BRUSH_SIZE } from "./draw2-brush.ts";
import type { PixelPoint } from "./draw2-core.ts";

/**
 * Draw2 creator-feature contracts.
 *
 * These helpers are deliberately DOM-free. They are suitable for the browser
 * editor, a future native shell, and deterministic conformance tests. They do
 * not own ProjectState or persistence; the editor adapter is responsible for
 * turning accepted results into canonical commands.
 */

export const CREATOR_FEATURE_SCHEMA_VERSION = 1 as const;

export interface BrushPreset {
  readonly id: string;
  readonly name: string;
  readonly brushSize: number;
  readonly brushShape: BrushShape;
  readonly brushAngle: number;
  readonly brushAlgorithm: BrushAlgorithm;
  readonly pattern: BrushPattern;
  readonly dither: "NONE" | "BAYER_2X2" | "BAYER_4X4";
  readonly colorIndex: number;
  readonly opacity: number;
  readonly schemaVersion: typeof CREATOR_FEATURE_SCHEMA_VERSION;
}

export interface BrushPresetInput
  extends Omit<BrushPreset, "schemaVersion" | "brushAngle" | "brushAlgorithm"> {
  readonly brushAngle?: number;
  readonly brushAlgorithm?: BrushAlgorithm;
}

function boundedInteger(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  return Number.isSafeInteger(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function boundedNumber(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  return Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function stableId(value: string, kind: string): string {
  if (!/^[A-Za-z0-9:_./-]{1,128}$/.test(value)) {
    throw new Error(`${kind} must be a bounded stable identifier.`);
  }
  return value;
}

export function normalizeBrushPreset(input: BrushPresetInput): BrushPreset {
  return {
    id: stableId(input.id, "Brush preset ID"),
    name: input.name.trim().slice(0, 64) || "Preset",
    brushSize: boundedInteger(input.brushSize, 1, MAX_BRUSH_SIZE, 1),
    brushShape: input.brushShape === "circle" ? "circle" : "square",
    brushAngle: boundedInteger(input.brushAngle ?? 0, -180, 180, 0),
    brushAlgorithm: input.brushAlgorithm === "pixel-perfect"
      ? "pixel-perfect"
      : "regular",
    pattern: input.pattern === "checker" || input.pattern === "dots" ||
        input.pattern === "bayer-2x2"
      ? input.pattern
      : "solid",
    dither: input.dither === "BAYER_2X2" || input.dither === "BAYER_4X4"
      ? input.dither
      : "NONE",
    colorIndex: boundedInteger(input.colorIndex, 0, 255, 0),
    opacity: boundedNumber(input.opacity, 0, 1, 1),
    schemaVersion: CREATOR_FEATURE_SCHEMA_VERSION,
  };
}

export class BrushPresetStore {
  readonly #presets = new Map<string, BrushPreset>();

  constructor(initial: readonly BrushPreset[] = []) {
    for (const preset of initial) this.save(preset);
  }

  save(input: BrushPresetInput | BrushPreset): BrushPreset {
    const preset = normalizeBrushPreset(input);
    this.#presets.set(preset.id, preset);
    return preset;
  }

  load(id: string): BrushPreset | undefined {
    return this.#presets.get(id);
  }
  remove(id: string): boolean {
    return this.#presets.delete(id);
  }
  list(): readonly BrushPreset[] {
    return [...this.#presets.values()].sort((a, b) =>
      a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
    );
  }
}

function pointKey(point: PixelPoint): string {
  return `${point.x}:${point.y}`;
}

function uniqueSorted(points: readonly PixelPoint[]): readonly PixelPoint[] {
  const result = new Map<string, PixelPoint>();
  for (const point of points) {
    if (Number.isSafeInteger(point.x) && Number.isSafeInteger(point.y)) {
      result.set(pointKey(point), { x: point.x, y: point.y });
    }
  }
  return [...result.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Bresenham line with both endpoints included and no duplicate pixels. */
export function pixelPerfectLine(
  from: PixelPoint,
  to: PixelPoint,
): readonly PixelPoint[] {
  let x = Math.round(from.x);
  let y = Math.round(from.y);
  const endX = Math.round(to.x);
  const endY = Math.round(to.y);
  const dx = Math.abs(endX - x);
  const sx = x < endX ? 1 : -1;
  const dy = -Math.abs(endY - y);
  const sy = y < endY ? 1 : -1;
  let error = dx + dy;
  const points: PixelPoint[] = [];
  while (true) {
    points.push({ x, y });
    if (x === endX && y === endY) break;
    const twice = 2 * error;
    if (twice >= dy) {
      error += dy;
      x += sx;
    }
    if (twice <= dx) {
      error += dx;
      y += sy;
    }
  }
  return points;
}

/** Quadratic pixel curve, sampled into Bresenham segments to prevent gaps. */
export function pixelPerfectCurve(
  start: PixelPoint,
  control: PixelPoint,
  end: PixelPoint,
  segments = 32,
): readonly PixelPoint[] {
  const count = boundedInteger(segments, 1, 1024, 32);
  const points: PixelPoint[] = [];
  let previous = { x: Math.round(start.x), y: Math.round(start.y) };
  for (let index = 1; index <= count; index += 1) {
    const t = index / count;
    const inverse = 1 - t;
    const next = {
      x: Math.round(
        (inverse * inverse * start.x) + (2 * inverse * t * control.x) +
          (t * t * end.x),
      ),
      y: Math.round(
        (inverse * inverse * start.y) + (2 * inverse * t * control.y) +
          (t * t * end.y),
      ),
    };
    points.push(...pixelPerfectLine(previous, next));
    previous = next;
  }
  return uniqueSorted(points);
}

export interface SelectionMask {
  readonly width: number;
  readonly height: number;
  readonly selected: Readonly<Uint8Array>;
}

export function createSelectionMask(
  width: number,
  height: number,
  points: readonly PixelPoint[] = [],
): SelectionMask {
  if (
    !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
    width < 1 || height < 1
  ) throw new Error("Selection mask dimensions must be positive integers.");
  const selected = new Uint8Array(width * height);
  for (const point of points) {
    if (point.x >= 0 && point.y >= 0 && point.x < width && point.y < height) {
      selected[point.y * width + point.x] = 1;
    }
  }
  return { width, height, selected };
}

function selectionAt(mask: SelectionMask, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < mask.width && y < mask.height &&
    mask.selected[y * mask.width + x] === 1;
}

function maskFromBytes(mask: SelectionMask, bytes: Uint8Array): SelectionMask {
  return { width: mask.width, height: mask.height, selected: bytes };
}

export function selectionExpand(
  mask: SelectionMask,
  radius = 1,
): SelectionMask {
  const distance = boundedInteger(
    radius,
    1,
    Math.max(mask.width, mask.height),
    1,
  );
  const result = new Uint8Array(mask.selected);
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (selectionAt(mask, x, y)) {
        continue;
      }
      let found = false;
      for (
        let offsetY = -distance;
        offsetY <= distance && !found;
        offsetY += 1
      ) {
        for (let offsetX = -distance; offsetX <= distance; offsetX += 1) {
          if (
            Math.abs(offsetX) + Math.abs(offsetY) <= distance &&
            selectionAt(mask, x + offsetX, y + offsetY)
          ) {
            found = true;
            break;
          }
        }
      }
      if (found) result[y * mask.width + x] = 1;
    }
  }
  return maskFromBytes(mask, result);
}

export function selectionShrink(
  mask: SelectionMask,
  radius = 1,
): SelectionMask {
  const distance = boundedInteger(
    radius,
    1,
    Math.max(mask.width, mask.height),
    1,
  );
  const result = new Uint8Array(mask.selected);
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (!selectionAt(mask, x, y)) {
        continue;
      }
      for (let offsetY = -distance; offsetY <= distance; offsetY += 1) {
        for (let offsetX = -distance; offsetX <= distance; offsetX += 1) {
          if (
            Math.abs(offsetX) + Math.abs(offsetY) <= distance &&
            !selectionAt(mask, x + offsetX, y + offsetY)
          ) {
            result[y * mask.width + x] = 0;
            offsetY = distance + 1;
            break;
          }
        }
      }
    }
  }
  return maskFromBytes(mask, result);
}

export function selectionInvert(mask: SelectionMask): SelectionMask {
  const result = new Uint8Array(mask.selected.length);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = mask.selected[index] === 1 ? 0 : 1;
  }
  return maskFromBytes(mask, result);
}

export function selectionBorder(
  mask: SelectionMask,
  radius = 1,
): SelectionMask {
  const expanded = selectionExpand(mask, radius);
  const inner = selectionShrink(mask, radius);
  const result = new Uint8Array(mask.selected.length);
  for (let index = 0; index < result.length; index += 1) {
    result[index] =
      expanded.selected[index] === 1 && inner.selected[index] === 0 ? 1 : 0;
  }
  return maskFromBytes(mask, result);
}

export type TransformGizmoOperation =
  | "MOVE"
  | "ROTATE_90_CW"
  | "ROTATE_90_CCW"
  | "ROTATE_180"
  | "FLIP_HORIZONTAL"
  | "FLIP_VERTICAL"
  | "SCALE_NEAREST";

export interface TransformGizmo {
  readonly operation: TransformGizmoOperation;
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly scaleX: number;
  readonly scaleY: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export function normalizeTransformGizmo(
  input: Partial<TransformGizmo> = {},
): TransformGizmo {
  const operation: TransformGizmoOperation =
    input.operation === "ROTATE_90_CW" || input.operation === "ROTATE_90_CCW" ||
      input.operation === "ROTATE_180" ||
      input.operation === "FLIP_HORIZONTAL" ||
      input.operation === "FLIP_VERTICAL" || input.operation === "SCALE_NEAREST"
      ? input.operation
      : "MOVE";
  const bounds = input.bounds ?? { x: 0, y: 0, width: 1, height: 1 };
  return {
    operation,
    bounds: {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height)),
    },
    scaleX: boundedNumber(input.scaleX ?? 1, 0.125, 16, 1),
    scaleY: boundedNumber(input.scaleY ?? 1, 0.125, 16, 1),
    offsetX: Math.round(input.offsetX ?? 0),
    offsetY: Math.round(input.offsetY ?? 0),
  };
}

export function transformSelectionPixels(
  points: readonly PixelPoint[],
  gizmoInput: TransformGizmo,
): readonly PixelPoint[] {
  const gizmo = normalizeTransformGizmo(gizmoInput);
  const { x, y, width, height } = gizmo.bounds;
  const result: PixelPoint[] = [];
  for (const point of points) {
    let localX = point.x - x;
    let localY = point.y - y;
    let outWidth = width;
    let outHeight = height;
    if (gizmo.operation === "FLIP_HORIZONTAL") localX = width - 1 - localX;
    if (gizmo.operation === "FLIP_VERTICAL") localY = height - 1 - localY;
    if (gizmo.operation === "ROTATE_90_CW") {
      const next = localX;
      localX = height - 1 - localY;
      localY = next;
      outWidth = height;
      outHeight = width;
    }
    if (gizmo.operation === "ROTATE_90_CCW") {
      const next = localX;
      localX = localY;
      localY = width - 1 - next;
      outWidth = height;
      outHeight = width;
    }
    if (gizmo.operation === "ROTATE_180") {
      localX = width - 1 - localX;
      localY = height - 1 - localY;
    }
    if (gizmo.operation === "SCALE_NEAREST") {
      const startX = Math.floor(localX * gizmo.scaleX);
      const startY = Math.floor(localY * gizmo.scaleY);
      const endX = Math.max(
        startX,
        Math.floor((localX + 1) * gizmo.scaleX) - 1,
      );
      const endY = Math.max(
        startY,
        Math.floor((localY + 1) * gizmo.scaleY) - 1,
      );
      for (let scaledY = startY; scaledY <= endY; scaledY += 1) {
        for (let scaledX = startX; scaledX <= endX; scaledX += 1) {
          result.push({
            x: x + scaledX + gizmo.offsetX,
            y: y + scaledY + gizmo.offsetY,
          });
        }
      }
      continue;
    }
    void outWidth;
    void outHeight;
    result.push({
      x: x + localX + gizmo.offsetX,
      y: y + localY + gizmo.offsetY,
    });
  }
  return uniqueSorted(result);
}

export interface AnimationTag {
  readonly id: string;
  readonly name: string;
  readonly fromFrameIndex: number;
  readonly toFrameIndex: number;
  readonly loop: boolean;
  readonly color?: number | undefined;
}

export class AnimationTagStore {
  readonly #tags = new Map<string, AnimationTag>();

  upsert(tag: AnimationTag, frameCount: number): AnimationTag {
    const errors = validateAnimationTag(tag, frameCount);
    if (errors.length > 0) throw new Error(errors.join(","));
    const normalized = {
      ...tag,
      id: stableId(tag.id, "Animation tag ID"),
      name: tag.name.trim().slice(0, 64),
    };
    this.#tags.set(normalized.id, normalized);
    return normalized;
  }

  remove(id: string): boolean {
    return this.#tags.delete(id);
  }
  get(id: string): AnimationTag | undefined {
    return this.#tags.get(id);
  }
  list(): readonly AnimationTag[] {
    return [...this.#tags.values()].sort((a, b) =>
      a.fromFrameIndex - b.fromFrameIndex || a.id.localeCompare(b.id)
    );
  }
}

export function validateAnimationTag(
  tag: AnimationTag,
  frameCount: number,
): readonly string[] {
  const errors: string[] = [];
  if (!tag.id.trim() || !tag.name.trim()) {
    errors.push("TAG_ID_OR_NAME_REQUIRED");
  }
  if (
    !Number.isSafeInteger(tag.fromFrameIndex) ||
    !Number.isSafeInteger(tag.toFrameIndex) || tag.fromFrameIndex < 0 ||
    tag.toFrameIndex < tag.fromFrameIndex || tag.toFrameIndex >= frameCount
  ) errors.push("TAG_FRAME_RANGE_INVALID");
  if (
    tag.color !== undefined &&
    (!Number.isSafeInteger(tag.color) || tag.color < 0 ||
      tag.color > 0xffffffff)
  ) errors.push("TAG_COLOR_INVALID");
  return errors;
}

export interface LinkedCelBinding {
  readonly celId: string;
  readonly sourceCelId: string;
  readonly mode: "LINKED";
}

export function createLinkedCelBinding(
  celId: string,
  sourceCelId: string,
  existing: readonly LinkedCelBinding[] = [],
): LinkedCelBinding {
  stableId(celId, "Linked Cel ID");
  stableId(sourceCelId, "Linked Cel source ID");
  if (celId === sourceCelId) throw new Error("A Cel cannot link to itself.");
  const binding = { celId, sourceCelId, mode: "LINKED" as const };
  resolveLinkedCel(sourceCelId, [...existing, binding]);
  return binding;
}

export function resolveLinkedCel(
  celId: string,
  bindings: readonly LinkedCelBinding[],
): string {
  const map = new Map(
    bindings.map((binding) => [binding.celId, binding.sourceCelId]),
  );
  const visited = new Set<string>();
  let current = celId;
  while (map.has(current)) {
    if (visited.has(current)) throw new Error("Linked Cel cycle detected.");
    visited.add(current);
    current = map.get(current) as string;
  }
  return current;
}

export interface PaletteGroup {
  readonly id: string;
  readonly name: string;
  readonly colorIndices: readonly number[];
}
export interface PaletteHistoryEntry {
  readonly color: number;
  readonly atSequence: number;
}

export class PaletteManager {
  readonly #groups = new Map<string, PaletteGroup>();
  readonly #history: PaletteHistoryEntry[] = [];

  setGroup(group: PaletteGroup): PaletteGroup {
    const normalized = {
      id: stableId(group.id, "Palette group ID"),
      name: group.name.trim().slice(0, 64) || "Group",
      colorIndices: [
        ...new Set(
          group.colorIndices.filter((index) =>
            Number.isSafeInteger(index) && index >= 0 && index <= 255
          ),
        ),
      ].sort((a, b) => a - b),
    };
    this.#groups.set(normalized.id, normalized);
    return normalized;
  }

  removeGroup(id: string): boolean {
    return this.#groups.delete(id);
  }
  listGroups(): readonly PaletteGroup[] {
    return [...this.#groups.values()].sort((a, b) =>
      a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
    );
  }
  recordHistory(color: number, atSequence: number): void {
    if (
      Number.isSafeInteger(color) && color >= 0 && color <= 0xffffffff &&
      Number.isSafeInteger(atSequence) && atSequence >= 0
    ) this.#history.push({ color, atSequence });
  }
  history(limit = 32): readonly PaletteHistoryEntry[] {
    return this.#history.slice(-boundedInteger(limit, 1, 256, 32)).reverse();
  }
}

export function buildPaletteRamp(
  start: number,
  end: number,
  steps: number,
): readonly number[] {
  const count = boundedInteger(steps, 2, 256, 2);
  const s = colorChannels(start);
  const e = colorChannels(end);
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    return channelsColor({
      r: Math.round(s.r + (e.r - s.r) * t),
      g: Math.round(s.g + (e.g - s.g) * t),
      b: Math.round(s.b + (e.b - s.b) * t),
      a: Math.round(s.a + (e.a - s.a) * t),
    });
  });
}

function colorChannels(
  color: number,
): { r: number; g: number; b: number; a: number } {
  return {
    r: (color >>> 24) & 0xff,
    g: (color >>> 16) & 0xff,
    b: (color >>> 8) & 0xff,
    a: color & 0xff,
  };
}
function channelsColor(
  channels: { r: number; g: number; b: number; a: number },
): number {
  return (((channels.r & 0xff) << 24) | ((channels.g & 0xff) << 16) |
    ((channels.b & 0xff) << 8) | (channels.a & 0xff)) >>> 0;
}

export function replacePaletteColors(
  palette: readonly number[],
  replacements: Readonly<Record<number, number>>,
): readonly number[] {
  return palette.map((color, index) =>
    index === 0
      ? 0
      : replacements[index] === undefined
      ? color
      : replacements[index]
  );
}

export interface TileSet {
  readonly id: string;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly tileCount: number;
}
export interface TileMapCell {
  readonly x: number;
  readonly y: number;
  readonly tileIndex: number;
}

export class TileMapStore {
  readonly #cells = new Map<string, TileMapCell>();
  readonly #tileSet: TileSet;

  constructor(tileSet: TileSet) {
    this.#tileSet = tileSet;
  }
  set(cell: TileMapCell): TileMapCell {
    const placed = placeTile(this.#tileSet, cell);
    this.#cells.set(`${placed.x}:${placed.y}`, placed);
    return placed;
  }
  remove(x: number, y: number): boolean {
    return this.#cells.delete(`${x}:${y}`);
  }
  get(x: number, y: number): TileMapCell | undefined {
    return this.#cells.get(`${x}:${y}`);
  }
  list(): readonly TileMapCell[] {
    return [...this.#cells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  }
}

export function placeTile(tileSet: TileSet, cell: TileMapCell): TileMapCell {
  if (
    cell.tileIndex < 0 || cell.tileIndex >= tileSet.tileCount ||
    !Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y)
  ) throw new Error("Tile placement is outside the TileSet contract.");
  return { x: cell.x, y: cell.y, tileIndex: cell.tileIndex };
}

export interface AtlasSpriteInput {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}
export interface AtlasLayoutOptions {
  readonly maxWidth: number;
  readonly padding: number;
  readonly extrude: number;
}
export interface AtlasSpriteLayout extends AtlasSpriteInput {
  readonly x: number;
  readonly y: number;
  readonly packedWidth: number;
  readonly packedHeight: number;
}
export interface AtlasLayout {
  readonly width: number;
  readonly height: number;
  readonly sprites: readonly AtlasSpriteLayout[];
  readonly schemaVersion: typeof CREATOR_FEATURE_SCHEMA_VERSION;
}

/** Deterministic shelf packing. Pixel encoding/PNG is delegated to export adapters. */
export function packAtlas(
  sprites: readonly AtlasSpriteInput[],
  options: AtlasLayoutOptions,
): AtlasLayout {
  const maxWidth = boundedInteger(options.maxWidth, 1, 16_384, 2048);
  const padding = boundedInteger(options.padding, 0, 256, 0);
  const extrude = boundedInteger(options.extrude, 0, 64, 0);
  let x = padding;
  let y = padding;
  let rowHeight = 0;
  let width = 1;
  const layouts: AtlasSpriteLayout[] = [];
  for (const sprite of [...sprites].sort((a, b) => a.id.localeCompare(b.id))) {
    if (
      !Number.isSafeInteger(sprite.width) ||
      !Number.isSafeInteger(sprite.height) || sprite.width < 1 ||
      sprite.height < 1
    ) throw new Error("Atlas sprite dimensions must be positive integers.");
    const packedWidth = sprite.width + (extrude * 2);
    const packedHeight = sprite.height + (extrude * 2);
    if (x > padding && x + packedWidth + padding > maxWidth) {
      x = padding;
      y += rowHeight + padding;
      rowHeight = 0;
    }
    layouts.push({
      ...sprite,
      x: x + extrude,
      y: y + extrude,
      packedWidth,
      packedHeight,
    });
    x += packedWidth + padding;
    rowHeight = Math.max(rowHeight, packedHeight);
    width = Math.max(width, x);
  }
  return {
    width: Math.min(maxWidth, width),
    height: Math.max(1, y + rowHeight + padding),
    sprites: layouts,
    schemaVersion: CREATOR_FEATURE_SCHEMA_VERSION,
  };
}

export interface SliceDefinition {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pivotX?: number | undefined;
  readonly pivotY?: number | undefined;
}
export function validateSlice(
  slice: SliceDefinition,
  bounds: RasterBounds,
): readonly string[] {
  const errors: string[] = [];
  if (!slice.id.trim() || !slice.name.trim()) {
    errors.push("SLICE_ID_OR_NAME_REQUIRED");
  }
  if (
    slice.width < 1 || slice.height < 1 || slice.x < 0 || slice.y < 0 ||
    slice.x + slice.width > bounds.width ||
    slice.y + slice.height > bounds.height
  ) errors.push("SLICE_OUT_OF_BOUNDS");
  if (
    slice.pivotX !== undefined && (slice.pivotX < 0 || slice.pivotX > 1) ||
    slice.pivotY !== undefined && (slice.pivotY < 0 || slice.pivotY > 1)
  ) errors.push("SLICE_PIVOT_INVALID");
  return errors;
}

export interface NineSliceRegions {
  readonly center: SliceDefinition;
  readonly top: SliceDefinition;
  readonly right: SliceDefinition;
  readonly bottom: SliceDefinition;
  readonly left: SliceDefinition;
}
export function nineSliceRegions(
  slice: SliceDefinition,
  border: { left: number; top: number; right: number; bottom: number },
): NineSliceRegions {
  const innerWidth = Math.max(1, slice.width - border.left - border.right);
  const innerHeight = Math.max(1, slice.height - border.top - border.bottom);
  const item = (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): SliceDefinition => ({
    id: `${slice.id}:${id}`,
    name: `${slice.name}:${id}`,
    x,
    y,
    width,
    height,
  });
  return {
    center: item(
      "center",
      slice.x + border.left,
      slice.y + border.top,
      innerWidth,
      innerHeight,
    ),
    top: item("top", slice.x + border.left, slice.y, innerWidth, border.top),
    right: item(
      "right",
      slice.x + slice.width - border.right,
      slice.y + border.top,
      border.right,
      innerHeight,
    ),
    bottom: item(
      "bottom",
      slice.x + border.left,
      slice.y + slice.height - border.bottom,
      innerWidth,
      border.bottom,
    ),
    left: item("left", slice.x, slice.y + border.top, border.left, innerHeight),
  };
}

export interface GuideLine {
  readonly id: string;
  readonly axis: "X" | "Y";
  readonly position: number;
  readonly color?: number | undefined;
}
export interface ReferenceImageLocator {
  readonly assetId: string;
  readonly opacity: number;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly locked: boolean;
}
export interface RadialSymmetryConfig {
  readonly centerX: number;
  readonly centerY: number;
  readonly spokes: number;
  readonly reflect: boolean;
}

export class GuideStore {
  readonly #guides = new Map<string, GuideLine>();
  #reference: ReferenceImageLocator | undefined;

  setGuide(guide: GuideLine): GuideLine {
    const normalized = {
      ...guide,
      id: stableId(guide.id, "Guide ID"),
      position: Math.round(guide.position),
    };
    this.#guides.set(normalized.id, normalized);
    return normalized;
  }
  removeGuide(id: string): boolean {
    return this.#guides.delete(id);
  }
  listGuides(): readonly GuideLine[] {
    return [...this.#guides.values()].sort((a, b) =>
      a.axis.localeCompare(b.axis) || a.position - b.position ||
      a.id.localeCompare(b.id)
    );
  }
  setReferenceImage(reference: ReferenceImageLocator): ReferenceImageLocator {
    if (
      !reference.assetId.trim() || !Number.isFinite(reference.scale) ||
      reference.scale <= 0 || reference.opacity < 0 || reference.opacity > 1
    ) throw new Error("Reference image locator is invalid.");
    this.#reference = {
      ...reference,
      opacity: boundedNumber(reference.opacity, 0, 1, 1),
      scale: boundedNumber(reference.scale, 0.03125, 64, 1),
    };
    return this.#reference;
  }
  referenceImage(): ReferenceImageLocator | undefined {
    return this.#reference;
  }
}

export function radialSymmetryPoints(
  point: PixelPoint,
  config: RadialSymmetryConfig,
): readonly PixelPoint[] {
  const spokes = boundedInteger(config.spokes, 2, 64, 2);
  const radians = (Math.PI * 2) / spokes;
  const dx = point.x - config.centerX;
  const dy = point.y - config.centerY;
  const points: PixelPoint[] = [];
  for (let index = 0; index < spokes; index += 1) {
    const angle = radians * index;
    const rotated = {
      x: Math.round(
        config.centerX + (dx * Math.cos(angle) - dy * Math.sin(angle)),
      ),
      y: Math.round(
        config.centerY + (dx * Math.sin(angle) + dy * Math.cos(angle)),
      ),
    };
    points.push(rotated);
    if (config.reflect) {
      points.push({
        x: Math.round(config.centerX - (rotated.x - config.centerX)),
        y: rotated.y,
      });
    }
  }
  return uniqueSorted(points);
}

export interface MacroAction {
  readonly commandId: string;
  readonly payload?: Readonly<Record<string, unknown>> | undefined;
}
export class MacroRecorder {
  #recording = false;
  #actions: MacroAction[] = [];
  start(): void {
    this.#recording = true;
    this.#actions = [];
  }
  record(action: MacroAction): void {
    if (this.#recording) {
      this.#actions.push({
        commandId: action.commandId,
        payload: action.payload === undefined
          ? undefined
          : { ...action.payload },
      });
    }
  }
  stop(): readonly MacroAction[] {
    this.#recording = false;
    return this.actions();
  }
  actions(): readonly MacroAction[] {
    return this.#actions.map((action) => ({
      ...action,
      payload: action.payload === undefined ? undefined : { ...action.payload },
    }));
  }
  get isRecording(): boolean {
    return this.#recording;
  }
}

export interface PaletteCommand {
  readonly id: string;
  readonly title: string;
  readonly keywords?: readonly string[] | undefined;
  readonly shortcut?: string | undefined;
}
export function searchCommandPalette(
  commands: readonly PaletteCommand[],
  query: string,
): readonly PaletteCommand[] {
  const normalized = query.trim().toLocaleLowerCase();
  return [...commands].filter((command) =>
    normalized.length === 0 ||
    [command.id, command.title, ...(command.keywords ?? [])].join(" ")
      .toLocaleLowerCase().includes(normalized)
  ).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

export interface RevisionDiff {
  readonly changedPixels: number;
  readonly changedBounds?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | undefined;
}
export function comparePixelRevisions(
  before: PixelReader,
  after: PixelReader,
): RevisionDiff {
  if (before.width !== after.width || before.height !== after.height) {
    throw new Error("Revision dimensions must match.");
  }
  let changedPixels = 0;
  let minX = before.width;
  let minY = before.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < before.height; y += 1) {
    for (let x = 0; x < before.width; x += 1) {
      if (before.getPixel(x, y) !== after.getPixel(x, y)) {
        changedPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return {
    changedPixels,
    changedBounds: changedPixels === 0
      ? undefined
      : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}

export interface TimelineMarker {
  readonly id: string;
  readonly frameIndex: number;
  readonly kind: "AUDIO" | "GAME_EVENT" | "NOTE";
  readonly label: string;
  readonly payload?:
    | Readonly<Record<string, string | number | boolean>>
    | undefined;
}

export class TimelineMarkerStore {
  readonly #markers = new Map<string, TimelineMarker>();
  upsert(marker: TimelineMarker): TimelineMarker {
    if (
      !marker.id.trim() || !marker.label.trim() ||
      !Number.isSafeInteger(marker.frameIndex) || marker.frameIndex < 0 ||
      !["AUDIO", "GAME_EVENT", "NOTE"].includes(marker.kind)
    ) throw new Error("Timeline marker is invalid.");
    const normalized = {
      ...marker,
      id: stableId(marker.id, "Timeline marker ID"),
      label: marker.label.trim().slice(0, 128),
      payload: marker.payload === undefined ? undefined : { ...marker.payload },
    };
    this.#markers.set(normalized.id, normalized);
    return normalized;
  }
  remove(id: string): boolean {
    return this.#markers.delete(id);
  }
  list(frameIndex?: number): readonly TimelineMarker[] {
    return [...this.#markers.values()].filter((marker) =>
      frameIndex === undefined || marker.frameIndex === frameIndex
    ).sort((a, b) => a.frameIndex - b.frameIndex || a.id.localeCompare(b.id));
  }
}

export interface DrawAudioReference {
  readonly id: string;
  readonly audioAssetId: string;
  readonly audioRevisionId: string;
  readonly kind: "BGM" | "SE";
  readonly label: string;
  readonly startFrame: number;
  readonly durationFrames: number;
  readonly loop: boolean;
  readonly gain: number;
}

export class DrawAudioReferenceStore {
  readonly #references = new Map<string, DrawAudioReference>();

  upsert(
    reference: DrawAudioReference,
    frameCount: number,
  ): DrawAudioReference {
    if (!Number.isSafeInteger(frameCount) || frameCount < 1) {
      throw new Error("Draw Audio reference requires a valid frame count.");
    }
    const normalized: DrawAudioReference = {
      id: stableId(reference.id, "Draw Audio reference ID"),
      audioAssetId: stableId(reference.audioAssetId, "Audio Asset ID"),
      audioRevisionId: stableId(reference.audioRevisionId, "Audio Revision ID"),
      kind: reference.kind === "SE" ? "SE" : "BGM",
      label: reference.label.trim().slice(0, 128) || reference.kind,
      startFrame: boundedInteger(reference.startFrame, 0, frameCount - 1, 0),
      durationFrames: boundedInteger(
        reference.durationFrames,
        1,
        frameCount,
        reference.kind === "SE" ? 1 : frameCount,
      ),
      loop: reference.kind === "BGM" && reference.loop === true,
      gain: boundedNumber(reference.gain, 0, 2, 1),
    };
    this.#references.set(normalized.id, normalized);
    return normalized;
  }

  remove(id: string): boolean {
    return this.#references.delete(id);
  }

  list(): readonly DrawAudioReference[] {
    return [...this.#references.values()].sort((left, right) =>
      left.startFrame - right.startFrame || left.id.localeCompare(right.id)
    );
  }
}

export interface Draw2SelectionStampPixel {
  readonly x: number;
  readonly y: number;
  readonly colorIndex: number;
}

export interface Draw2SelectionStamp {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** Only selected pixels are stored; unlisted cells remain transparent. */
  readonly pixels: readonly Draw2SelectionStampPixel[];
  readonly palette: readonly number[];
  readonly schemaVersion: typeof CREATOR_FEATURE_SCHEMA_VERSION;
}

export type Draw2SelectionStampInput = Omit<
  Draw2SelectionStamp,
  "schemaVersion"
>;

const MAX_SELECTION_STAMP_DIMENSION = 4_096;
const MAX_SELECTION_STAMP_AREA = 1_048_576;

export function normalizeDraw2SelectionStamp(
  input: Draw2SelectionStampInput | Draw2SelectionStamp,
): Draw2SelectionStamp {
  if (
    typeof input.id !== "string" || typeof input.name !== "string" ||
    !Array.isArray(input.pixels) || !Array.isArray(input.palette)
  ) {
    throw new Error("Draw2 selection stamp shape is invalid.");
  }
  if (
    !Number.isSafeInteger(input.width) ||
    !Number.isSafeInteger(input.height) || input.width < 1 ||
    input.height < 1 || input.width > MAX_SELECTION_STAMP_DIMENSION ||
    input.height > MAX_SELECTION_STAMP_DIMENSION ||
    input.width * input.height > MAX_SELECTION_STAMP_AREA
  ) {
    throw new Error("Draw2 selection stamp dimensions are invalid.");
  }
  if (input.palette.length < 1 || input.palette.length > 256) {
    throw new Error("Draw2 selection stamp palette is invalid.");
  }
  const palette = input.palette.map((color) => {
    if (
      !Number.isSafeInteger(color) || color < 0 || color > 0xffffffff
    ) throw new Error("Draw2 selection stamp palette color is invalid.");
    return color >>> 0;
  });
  const pixels = new Map<string, Draw2SelectionStampPixel>();
  for (const candidate of input.pixels) {
    if (
      candidate === null || typeof candidate !== "object" ||
      !Number.isSafeInteger(candidate.x) ||
      !Number.isSafeInteger(candidate.y) ||
      !Number.isSafeInteger(candidate.colorIndex) ||
      candidate.x < 0 || candidate.y < 0 || candidate.x >= input.width ||
      candidate.y >= input.height || candidate.colorIndex < 0 ||
      candidate.colorIndex >= palette.length
    ) {
      throw new Error("Draw2 selection stamp pixel is invalid.");
    }
    pixels.set(`${candidate.x}:${candidate.y}`, {
      x: candidate.x,
      y: candidate.y,
      colorIndex: candidate.colorIndex,
    });
  }
  return {
    id: stableId(input.id, "Draw2 selection stamp ID"),
    name: input.name.trim().slice(0, 64) || "Selection stamp",
    width: input.width,
    height: input.height,
    pixels: [...pixels.values()].sort((left, right) =>
      left.y - right.y || left.x - right.x
    ),
    palette,
    schemaVersion: CREATOR_FEATURE_SCHEMA_VERSION,
  };
}

export class Draw2SelectionStampStore {
  readonly #stamps = new Map<string, Draw2SelectionStamp>();

  constructor(initial: readonly Draw2SelectionStamp[] = []) {
    for (const stamp of initial) this.save(stamp);
  }

  save(
    input: Draw2SelectionStampInput | Draw2SelectionStamp,
  ): Draw2SelectionStamp {
    const stamp = normalizeDraw2SelectionStamp(input);
    this.#stamps.set(stamp.id, stamp);
    return stamp;
  }

  load(id: string): Draw2SelectionStamp | undefined {
    return this.#stamps.get(id);
  }

  remove(id: string): boolean {
    return this.#stamps.delete(id);
  }

  list(): readonly Draw2SelectionStamp[] {
    return [...this.#stamps.values()].sort((left, right) =>
      left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
    );
  }
}

export const DRAW2_TIMELINE_METADATA_SCHEMA_VERSION = 2 as const;

export interface Draw2TimelineMetadata {
  readonly schemaVersion: typeof DRAW2_TIMELINE_METADATA_SCHEMA_VERSION;
  readonly animationTags: readonly AnimationTag[];
  readonly markers: readonly TimelineMarker[];
  readonly audioReferences: readonly DrawAudioReference[];
  /** Optional for backward compatibility with pre-selection-stamp records. */
  readonly selectionStamps?: readonly Draw2SelectionStamp[];
}

function isMetadataRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneTimelineMarker(marker: TimelineMarker): TimelineMarker {
  return marker.payload === undefined
    ? { ...marker }
    : { ...marker, payload: { ...marker.payload } };
}

/**
 * Normalize the lightweight Draw timeline annotations used by the UI.
 * Raster pixels and editor history are intentionally outside this boundary.
 */
export function normalizeDraw2TimelineMetadata(
  value: unknown,
  frameCount: number,
): Draw2TimelineMetadata {
  if (!Number.isSafeInteger(frameCount) || frameCount < 1) {
    throw new Error("Draw2 timeline metadata requires a valid frame count.");
  }
  if (value === undefined) {
    return {
      schemaVersion: DRAW2_TIMELINE_METADATA_SCHEMA_VERSION,
      animationTags: [],
      markers: [],
      audioReferences: [],
    };
  }
  if (
    !isMetadataRecord(value) ||
    value.schemaVersion !== DRAW2_TIMELINE_METADATA_SCHEMA_VERSION
  ) {
    throw new Error("Draw2 timeline metadata schema is unsupported.");
  }
  if (
    !Array.isArray(value.animationTags) || !Array.isArray(value.markers) ||
    !Array.isArray(value.audioReferences)
  ) {
    throw new Error("Draw2 timeline metadata collections are invalid.");
  }
  const selectionStampCandidates = value.selectionStamps;
  if (
    selectionStampCandidates !== undefined &&
    !Array.isArray(selectionStampCandidates)
  ) {
    throw new Error("Draw2 selection stamp collection is invalid.");
  }
  const tags = new AnimationTagStore();
  const tagIds = new Set<string>();
  for (const candidate of value.animationTags) {
    if (!isMetadataRecord(candidate) || typeof candidate.id !== "string") {
      throw new Error("Draw2 animation tag is invalid.");
    }
    if (tagIds.has(candidate.id)) {
      throw new Error("Draw2 animation tag identity is duplicated.");
    }
    tagIds.add(candidate.id);
    tags.upsert(candidate as unknown as AnimationTag, frameCount);
  }
  const markers = new TimelineMarkerStore();
  const markerIds = new Set<string>();
  for (const candidate of value.markers) {
    if (!isMetadataRecord(candidate) || typeof candidate.id !== "string") {
      throw new Error("Draw2 timeline marker is invalid.");
    }
    if (
      !Number.isSafeInteger(candidate.frameIndex) ||
      (candidate.frameIndex as number) < 0 ||
      (candidate.frameIndex as number) >= frameCount
    ) {
      throw new Error("Draw2 timeline marker frame is invalid.");
    }
    if (markerIds.has(candidate.id)) {
      throw new Error("Draw2 timeline marker identity is duplicated.");
    }
    markerIds.add(candidate.id);
    markers.upsert(candidate as unknown as TimelineMarker);
  }
  const audioReferences = new DrawAudioReferenceStore();
  const audioReferenceIds = new Set<string>();
  for (const candidate of value.audioReferences) {
    if (!isMetadataRecord(candidate) || typeof candidate.id !== "string") {
      throw new Error("Draw Audio reference is invalid.");
    }
    if (audioReferenceIds.has(candidate.id)) {
      throw new Error("Draw Audio reference identity is duplicated.");
    }
    audioReferenceIds.add(candidate.id);
    audioReferences.upsert(
      candidate as unknown as DrawAudioReference,
      frameCount,
    );
  }
  const selectionStamps = new Draw2SelectionStampStore();
  const selectionStampIds = new Set<string>();
  for (const candidate of selectionStampCandidates ?? []) {
    if (
      candidate === null || typeof candidate !== "object" ||
      typeof candidate.id !== "string"
    ) {
      throw new Error("Draw2 selection stamp is invalid.");
    }
    const normalized = normalizeDraw2SelectionStamp(
      candidate as unknown as Draw2SelectionStamp,
    );
    if (selectionStampIds.has(normalized.id)) {
      throw new Error("Draw2 selection stamp identity is duplicated.");
    }
    selectionStampIds.add(normalized.id);
    selectionStamps.save(normalized);
  }
  return {
    schemaVersion: DRAW2_TIMELINE_METADATA_SCHEMA_VERSION,
    animationTags: tags.list().map((tag) => ({ ...tag })),
    markers: markers.list().map(cloneTimelineMarker),
    audioReferences: audioReferences.list().map((reference) => ({
      ...reference,
    })),
    ...(selectionStampCandidates === undefined ? {} : {
      selectionStamps: selectionStamps.list().map((stamp) => ({
        ...stamp,
        pixels: stamp.pixels.map((pixel) => ({ ...pixel })),
        palette: [...stamp.palette],
      })),
    }),
  };
}
