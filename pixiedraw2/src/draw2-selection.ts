/**
 * WP-120 Selection / Transform / Clipboard / local history Core contracts.
 *
 * This module is DOM-, Canvas-, Network-, and browser-clipboard-independent.
 * Selection and preview are local projections. Only an explicit commit mutates
 * Canonical Raster and creates one bounded operation.
 */

import {
  cloneProjectStateShared,
  createRasterSelectionMask,
  decodeRasterSelectionMask,
  EditorCore,
  type EditorCommand,
  sha256Hex,
  type CanonicalOperation,
  type CommandResult,
  type Diagnostic,
  type DirtyRegion,
  type DirtyTile,
  type Draw2Cel,
  type Draw2Frame,
  type Draw2Layer,
  type Draw2MetricScope,
  type ProjectState,
  type PixelPoint,
  type RasterAsset,
  type RasterMemoryMetrics,
  type RasterSelectionMask,
} from "./draw2-core.ts";

export type SelectionShapeKind = "rectangle" | "ellipse" | "freehand" | "magic" | "alpha" | "multi-region";
/**
 * Pixel-art transforms stay deterministic and nearest-neighbour.  The
 * legacy SCALE_INTEGER name remains accepted for existing commands, while
 * SCALE_NEAREST provides the PiXiEEDraw-style continuous 12.5%..800% range.
 */
export type TransformOperation =
  | "MOVE"
  | "FLIP_HORIZONTAL"
  | "FLIP_VERTICAL"
  | "ROTATE_90_CW"
  | "ROTATE_90_CCW"
  | "ROTATE_180"
  | "ROTATE_NEAREST"
  | "SCALE_INTEGER"
  | "SCALE_NEAREST";
export type TransformInterpolationPolicy = "NEAREST_NEIGHBOR";
export type OutOfBoundsPolicy = "CLIP" | "CANCEL" | "EXPAND_CANVAS_CANDIDATE";

export interface SelectionRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SelectionMask {
  readonly kind: SelectionShapeKind;
  readonly regions: readonly SelectionRegion[];
  readonly selectionVersion: number;
}

export interface SelectionScope {
  readonly assetId: string;
  readonly layerId: string;
  readonly frameId: string;
  readonly celId: string;
}

export interface SelectionPixel {
  readonly x: number;
  readonly y: number;
  readonly colorIndex: number;
}

export interface SelectionSnapshot {
  readonly selectionId: string;
  readonly mask: SelectionMask;
  readonly scope: SelectionScope;
  readonly sourceRasterRevision: number;
  readonly sourceStructureEpoch: number;
  readonly pixels: readonly SelectionPixel[];
}

export interface TransformDescriptor {
  readonly operation: TransformOperation;
  readonly dx: number;
  readonly dy: number;
  readonly factor: number;
  /** Degrees clockwise in canvas coordinates for ROTATE_NEAREST. */
  readonly angleDeg?: number;
  readonly interpolationPolicy: TransformInterpolationPolicy;
  readonly outOfBoundsPolicy: OutOfBoundsPolicy;
}

export interface TransformSession {
  readonly sessionId: string;
  readonly sourceSelectionVersion: number;
  readonly sourceRasterRevision: number;
  readonly sourceStructureEpoch: number;
  readonly transform: TransformDescriptor;
  readonly previewBounds: SelectionRegion;
  readonly destinationBounds: SelectionRegion;
  readonly status: "PREVIEW" | "COMMITTED" | "CANCELLED";
}

export interface TransformedPixel extends SelectionPixel {}

export interface TransformPreview {
  readonly sessionId: string;
  readonly pixels: readonly TransformedPixel[];
  readonly overlayRegions: readonly SelectionRegion[];
  readonly canonicalDirtyTiles: readonly DirtyTile[];
  readonly canonicalDirtyRegions: readonly DirtyRegion[];
  readonly metricScope: "PREVIEW_ONLY";
}

export interface ClipboardPayload {
  readonly format: "PIXIEEDRAW2_CLIPBOARD";
  readonly version: 1;
  readonly width: number;
  readonly height: number;
  readonly origin: PixelPoint;
  readonly pixels: readonly SelectionPixel[];
  readonly palette: readonly number[];
  readonly sourceAssetId: string;
  readonly sourceSelectionVersion: number;
  readonly provenance?: string;
}

export type ClipboardCompatibility =
  | "EXACT_PALETTE_MATCH"
  | "REMAP_POSSIBLE"
  | "PALETTE_EXTENSION_REQUIRED"
  | "PALETTE_OVERFLOW"
  | "INCOMPATIBLE";

export interface ClipboardCompatibilityResult {
  readonly result: ClipboardCompatibility;
  readonly mapping: Readonly<Record<number, number>>;
  readonly missingColors: readonly number[];
  readonly message: string;
}

export interface SelectionTransformCommand {
  readonly commandType: "selection.transformCommit";
  readonly commandId: string;
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly assetId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly clientSequence: number;
  readonly baseStructureEpoch: number;
  readonly createdAtMonotonicMs: number;
  readonly payload: { readonly selection: SelectionSnapshot; readonly session: TransformSession };
}

/**
 * Wire-safe selection transform payload.  The selected colors are resolved
 * from the receiving peer's canonical raster; the wire carries only the
 * deterministic selection mask, scope, and transform descriptor.
 */
export interface SelectionTransformWirePayload {
  readonly selectionId: string;
  readonly selectionVersion: number;
  readonly selectionKind: SelectionShapeKind;
  readonly selectionBounds: SelectionRegion;
  readonly scope: SelectionScope;
  readonly sourceRasterRevision: number;
  readonly sourceStructureEpoch: number;
  readonly selectionMask: RasterSelectionMask;
  readonly transform: TransformDescriptor;
  readonly sourceCount: number;
  readonly destinationCount: number;
  readonly outOfBoundsClipped: boolean;
  /** Transparent destination cells never erase existing artwork. */
  /** Omitted by older v1 peers; the runtime still defaults to preservation. */
  readonly transparentDestinationPolicy?: "PRESERVE_DESTINATION";
}

export interface SelectionTransformWireCommand
  extends Omit<SelectionTransformCommand, "payload"> {
  readonly payload: SelectionTransformWirePayload;
}

export interface ClipboardCopyCommand {
  readonly commandType: "clipboard.copy";
  readonly commandId: string;
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly assetId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly clientSequence: number;
  readonly baseStructureEpoch: number;
  readonly createdAtMonotonicMs: number;
  readonly payload: { readonly clipboard: ClipboardPayload };
}

export interface ClipboardCutCommand {
  readonly commandType: "clipboard.cut";
  readonly commandId: string;
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly assetId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly clientSequence: number;
  readonly baseStructureEpoch: number;
  readonly createdAtMonotonicMs: number;
  readonly payload: { readonly clipboard: ClipboardPayload; readonly selection: SelectionSnapshot };
}

export interface ClipboardPasteCommand {
  readonly commandType: "clipboard.paste";
  readonly commandId: string;
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly assetId: string;
  readonly actorId: string;
  readonly clientId: string;
  readonly clientSequence: number;
  readonly baseStructureEpoch: number;
  readonly createdAtMonotonicMs: number;
  readonly payload: { readonly clipboard: ClipboardPayload; readonly session: TransformSession };
}

export type SelectionCommand = SelectionTransformCommand | ClipboardCopyCommand | ClipboardCutCommand | ClipboardPasteCommand;

export type SelectionExecutionResult =
  | { readonly ok: true; readonly state: ProjectState; readonly result: CommandResult; readonly clipboard?: ClipboardPayload }
  | { readonly ok: false; readonly state: ProjectState; readonly diagnostics: readonly Diagnostic[] };

export interface HistoryEntry {
  readonly actionId: string;
  readonly operationId: string;
  readonly operationType: string;
  readonly before: ProjectState;
  readonly after: ProjectState;
}

/**
 * A Draw2 history entry owns a full structural snapshot (with shared raster
 * tiles). Keeping the in-memory stack unbounded makes a long painting session
 * grow without a recovery boundary, even though the persisted history is
 * already truncated. The recent tail is the useful undo window for the local
 * editor; PiXYNC history remains a separate authority.
 */
export const DRAW2_LIVE_HISTORY_LIMIT = 128 as const;

export interface LocalUndoRedoHistoryOptions {
  readonly maxEntries?: number;
}

export interface HistoryResult {
  readonly state: ProjectState;
  readonly actionId: string;
  readonly operationId: string;
  readonly direction: "UNDO" | "REDO";
  readonly transport: "LOCAL_ONLY";
}

const MAX_SELECTION_PIXELS = 1_048_576;
const MAX_CLIPBOARD_DIMENSION = 4096;

interface SelectionOperationIdentity {
  readonly actorId: string;
  readonly clientId: string;
  readonly clientSequence?: number;
}

const DEFAULT_SELECTION_OPERATION_IDENTITY: SelectionOperationIdentity = {
  actorId: "draw2-selection-local",
  clientId: "draw2-selection-local",
};

function error(code: string, message: string, path?: string): Diagnostic {
  return path === undefined ? { code, severity: "error", message } : { code, severity: "error", message, path };
}

function isInteger(value: number): boolean { return Number.isSafeInteger(value); }

function isSelectionShapeKind(value: unknown): value is SelectionShapeKind {
  return value === "rectangle" || value === "ellipse" ||
    value === "freehand" || value === "magic" || value === "alpha" ||
    value === "multi-region";
}

function boundsFromRegions(regions: readonly SelectionRegion[]): SelectionRegion {
  if (regions.length === 0) throw new Error("Selection requires at least one region.");
  const minX = Math.min(...regions.map((region) => region.x));
  const minY = Math.min(...regions.map((region) => region.y));
  const maxX = Math.max(...regions.map((region) => region.x + region.width));
  const maxY = Math.max(...regions.map((region) => region.y + region.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function regionContains(region: SelectionRegion, point: PixelPoint): boolean {
  return point.x >= region.x && point.y >= region.y && point.x < region.x + region.width && point.y < region.y + region.height;
}

function containsInMask(mask: SelectionMask, point: PixelPoint): boolean {
  return mask.regions.some((region) => regionContains(region, point));
}

function regionForPoints(points: readonly PixelPoint[]): SelectionRegion | undefined {
  if (points.length === 0) return undefined;
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function validateRegion(asset: RasterAsset, region: SelectionRegion, path: string): Diagnostic[] {
  if (!isInteger(region.x) || !isInteger(region.y) || !isInteger(region.width) || !isInteger(region.height)) return [error("SELECTION_REGION_INVALID", "Selection region values must be safe integers.", path)];
  if (region.width < 1 || region.height < 1 || region.x < 0 || region.y < 0 || region.x + region.width > asset.width || region.y + region.height > asset.height) return [error("SELECTION_OUTSIDE_BOUNDS", "Selection region is outside the raster.", path)];
  return [];
}

function validateStructureScope(state: ProjectState, scope: SelectionScope, assetId: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (scope.assetId !== assetId) diagnostics.push(error("SELECTION_ASSET_MISMATCH", "Selection asset does not match the command asset.", "scope.assetId"));
  if (!state.layers.some((layer) => layer.id === scope.layerId)) diagnostics.push(error("SELECTION_LAYER_NOT_FOUND", "Selection layer is not in the Project structure.", "scope.layerId"));
  if (!state.frames.some((frame) => frame.id === scope.frameId)) diagnostics.push(error("SELECTION_FRAME_NOT_FOUND", "Selection frame is not in the Project structure.", "scope.frameId"));
  const cel = state.cels.find((candidate) => candidate.id === scope.celId);
  if (cel === undefined || cel.layerId !== scope.layerId || cel.frameId !== scope.frameId || cel.assetId !== assetId) diagnostics.push(error("SELECTION_CEL_SCOPE_INVALID", "Selection cel scope is not an active compatible layer/frame/cel reference.", "scope.celId"));
  return diagnostics;
}

function validateSnapshot(state: ProjectState, asset: RasterAsset, snapshot: SelectionSnapshot): Diagnostic[] {
  const diagnostics = validateStructureScope(state, snapshot.scope, asset.id);
  if (!isInteger(snapshot.mask.selectionVersion) || snapshot.mask.selectionVersion < 1) diagnostics.push(error("SELECTION_VERSION_INVALID", "Selection version must be positive.", "mask.selectionVersion"));
  if (snapshot.sourceRasterRevision !== asset.revision) diagnostics.push(error("STALE_SELECTION_RASTER", "Selection source raster revision is stale.", "sourceRasterRevision"));
  if (snapshot.sourceStructureEpoch !== state.structureEpoch) diagnostics.push(error("STALE_SELECTION_STRUCTURE", "Selection source structure epoch is stale.", "sourceStructureEpoch"));
  if (snapshot.pixels.length < 1 || snapshot.pixels.length > MAX_SELECTION_PIXELS) diagnostics.push(error("SELECTION_PIXEL_LIMIT_EXCEEDED", "Selection pixel snapshot is outside its bounded limit.", "pixels"));
  const seen = new Set<string>();
  snapshot.mask.regions.forEach((region, index) => diagnostics.push(...validateRegion(asset, region, `mask.regions[${index}]`)));
  for (const pixel of snapshot.pixels) {
    const key = `${pixel.x}:${pixel.y}`;
    if (seen.has(key)) diagnostics.push(error("SELECTION_PIXEL_DUPLICATE", "Selection snapshot contains a duplicate pixel.", "pixels"));
    seen.add(key);
    if (!isInteger(pixel.x) || !isInteger(pixel.y) || pixel.x < 0 || pixel.y < 0 || pixel.x >= asset.width || pixel.y >= asset.height) diagnostics.push(error("SELECTION_PIXEL_OUT_OF_BOUNDS", "Selection pixel is outside the raster.", "pixels"));
    if (!isInteger(pixel.colorIndex) || pixel.colorIndex < 0 || pixel.colorIndex >= asset.palette.length) diagnostics.push(error("SELECTION_PIXEL_COLOR_INVALID", "Selection pixel references an invalid palette index.", "pixels"));
    if (!containsInMask(snapshot.mask, pixel)) diagnostics.push(error("SELECTION_PIXEL_OUTSIDE_MASK", "Selection pixel is outside the selection mask regions.", "pixels"));
  }
  return diagnostics;
}

function validateTransform(transform: TransformDescriptor): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isInteger(transform.dx) || !isInteger(transform.dy)) diagnostics.push(error("TRANSFORM_TRANSLATION_INVALID", "Transform translation must use integer coordinates.", "transform"));
  if (transform.interpolationPolicy !== "NEAREST_NEIGHBOR") diagnostics.push(error("TRANSFORM_INTERPOLATION_UNSUPPORTED", "Only deterministic nearest-neighbor transform is supported.", "transform.interpolationPolicy"));
  if (transform.outOfBoundsPolicy === "EXPAND_CANVAS_CANDIDATE") diagnostics.push(error("TRANSFORM_CANVAS_EXPANSION_UNSUPPORTED", "Canvas expansion is a future candidate and cannot mutate this Project.", "transform.outOfBoundsPolicy"));
  if (transform.operation === "SCALE_INTEGER" && (!isInteger(transform.factor) || transform.factor < 1 || transform.factor > 8)) diagnostics.push(error("TRANSFORM_SCALE_INVALID", "Integer scale factor must be between 1 and 8.", "transform.factor"));
  if (transform.operation === "SCALE_NEAREST" && (!Number.isFinite(transform.factor) || transform.factor < 0.125 || transform.factor > 8)) diagnostics.push(error("TRANSFORM_SCALE_INVALID", "Nearest-neighbor scale factor must be between 0.125 and 8.", "transform.factor"));
  if (transform.operation === "ROTATE_NEAREST" && (!Number.isFinite(transform.angleDeg) || Math.abs(transform.angleDeg ?? 0) > 36000)) diagnostics.push(error("TRANSFORM_ANGLE_INVALID", "Nearest-neighbor rotation angle must be finite and within ±36000 degrees.", "transform.angleDeg"));
  return diagnostics;
}

function validateClipboard(clipboard: ClipboardPayload, asset: RasterAsset): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (clipboard.format !== "PIXIEEDRAW2_CLIPBOARD" || clipboard.version !== 1) diagnostics.push(error("CLIPBOARD_FORMAT_UNSUPPORTED", "Clipboard format/version is unsupported.", "clipboard"));
  if (!isInteger(clipboard.width) || !isInteger(clipboard.height) || clipboard.width < 1 || clipboard.height < 1 || clipboard.width > MAX_CLIPBOARD_DIMENSION || clipboard.height > MAX_CLIPBOARD_DIMENSION) diagnostics.push(error("CLIPBOARD_DIMENSIONS_INVALID", "Clipboard dimensions are outside the safe limit.", "clipboard"));
  if (!isInteger(clipboard.origin.x) || !isInteger(clipboard.origin.y)) diagnostics.push(error("CLIPBOARD_ORIGIN_INVALID", "Clipboard origin must use safe integer coordinates.", "clipboard.origin"));
  if (clipboard.width * clipboard.height > MAX_SELECTION_PIXELS || clipboard.pixels.length < 1 || clipboard.pixels.length > MAX_SELECTION_PIXELS) diagnostics.push(error("CLIPBOARD_PIXEL_LIMIT_EXCEEDED", "Clipboard payload exceeds the bounded pixel limit.", "clipboard.pixels"));
  if (clipboard.palette.length < 1 || clipboard.palette[0] !== 0) diagnostics.push(error("CLIPBOARD_TRANSPARENCY_INVALID", "Clipboard palette index 0 must be transparent.", "clipboard.palette"));
  if (clipboard.provenance !== undefined && (clipboard.provenance.length > 256 || /(?:javascript:|data:|https?:|<script|\/\/)\s*/i.test(clipboard.provenance))) diagnostics.push(error("CLIPBOARD_PROVENANCE_UNTRUSTED", "Clipboard provenance contains an unsafe or oversized value.", "clipboard.provenance"));
  const seen = new Set<string>();
  for (const pixel of clipboard.pixels) {
    const pixelKey = `${pixel.x}:${pixel.y}`;
    if (seen.has(pixelKey)) diagnostics.push(error("CLIPBOARD_PIXEL_DUPLICATE", "Clipboard payload contains a duplicate pixel.", "clipboard.pixels"));
    seen.add(pixelKey);
    if (!isInteger(pixel.x) || !isInteger(pixel.y) || pixel.x < 0 || pixel.y < 0 || pixel.x >= clipboard.width || pixel.y >= clipboard.height) diagnostics.push(error("CLIPBOARD_PIXEL_OUT_OF_BOUNDS", "Clipboard pixel is outside its bounded dimensions.", "clipboard.pixels"));
    if (!isInteger(pixel.colorIndex) || pixel.colorIndex < 0 || pixel.colorIndex >= clipboard.palette.length) diagnostics.push(error("CLIPBOARD_PIXEL_COLOR_INVALID", "Clipboard pixel references an invalid source palette index.", "clipboard.pixels"));
  }
  if (clipboard.palette.some((color) => !isInteger(color) || color < 0 || color > 0xffffffff)) diagnostics.push(error("CLIPBOARD_PALETTE_INVALID", "Clipboard palette contains an invalid color.", "clipboard.palette"));
  if (asset.width < 1 || asset.height < 1) diagnostics.push(error("CLIPBOARD_TARGET_INVALID", "Clipboard target raster is invalid.", "assetId"));
  return diagnostics;
}

export function createRectangleSelectionSnapshot(
  state: ProjectState,
  bounds: SelectionRegion,
  selectionId = `selection-${state.projectId}-${state.structureEpoch}`,
  selectionVersion = 1,
): SelectionSnapshot {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) throw new Error("Active Draw2 asset is missing.");
  const regionErrors = validateRegion(asset, bounds, "bounds");
  if (regionErrors.length > 0) throw new Error(regionErrors[0]?.message ?? "Selection bounds are invalid.");
  if (bounds.width * bounds.height > MAX_SELECTION_PIXELS) throw new Error("Selection exceeds the bounded pixel limit.");
  const pixels: SelectionPixel[] = [];
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) pixels.push({ x, y, colorIndex: asset.raster.getPixel(x, y) });
  }
  return {
    selectionId,
    mask: { kind: "rectangle", regions: [bounds], selectionVersion },
    scope: { assetId: asset.id, layerId: state.activeLayerId, frameId: state.activeFrameId, celId: state.activeCelId },
    sourceRasterRevision: asset.revision,
    sourceStructureEpoch: state.structureEpoch,
    pixels,
  };
}

function rotatedRegion(
  bounds: SelectionRegion,
  angleDeg: number,
  dx = 0,
  dy = 0,
): SelectionRegion {
  const normalizedAngle = ((angleDeg % 360) + 360) % 360;
  const radians = normalizedAngle * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians)) < 1e-10 ? 0 : Math.cos(radians);
  const sin = Math.abs(Math.sin(radians)) < 1e-10 ? 0 : Math.sin(radians);
  const centerX = bounds.x + (bounds.width - 1) / 2;
  const centerY = bounds.y + (bounds.height - 1) / 2;
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width - 1, y: bounds.y },
    { x: bounds.x, y: bounds.y + bounds.height - 1 },
    { x: bounds.x + bounds.width - 1, y: bounds.y + bounds.height - 1 },
  ].map((point) => ({
    x: centerX + (point.x - centerX) * cos - (point.y - centerY) * sin,
    y: centerY + (point.x - centerX) * sin + (point.y - centerY) * cos,
  }));
  const minX = Math.floor(Math.min(...corners.map((point) => point.x)) + 1e-9);
  const minY = Math.floor(Math.min(...corners.map((point) => point.y)) + 1e-9);
  const maxX = Math.ceil(Math.max(...corners.map((point) => point.x)) - 1e-9);
  const maxY = Math.ceil(Math.max(...corners.map((point) => point.y)) - 1e-9);
  return {
    x: minX + dx,
    y: minY + dy,
    width: Math.max(1, maxX - minX + 1),
    height: Math.max(1, maxY - minY + 1),
  };
}

function transformedPixels(snapshot: SelectionSnapshot, transform: TransformDescriptor): readonly TransformedPixel[] {
  const bounds = boundsFromRegions(snapshot.mask.regions);
  const pixels: TransformedPixel[] = [];
  if (transform.operation === "ROTATE_NEAREST") {
    const angleDeg = transform.angleDeg ?? 0;
    const radians = ((angleDeg % 360) + 360) % 360 * Math.PI / 180;
    const cos = Math.abs(Math.cos(radians)) < 1e-10 ? 0 : Math.cos(radians);
    const sin = Math.abs(Math.sin(radians)) < 1e-10 ? 0 : Math.sin(radians);
    const centerX = bounds.x + (bounds.width - 1) / 2;
    const centerY = bounds.y + (bounds.height - 1) / 2;
    const output = rotatedRegion(bounds, angleDeg);
    const sourceByPoint = new Map<string, SelectionPixel>();
    for (const pixel of snapshot.pixels) sourceByPoint.set(`${pixel.x}:${pixel.y}`, pixel);
    for (let targetY = output.y; targetY < output.y + output.height; targetY += 1) {
      for (let targetX = output.x; targetX < output.x + output.width; targetX += 1) {
        const targetRelX = targetX - centerX;
        const targetRelY = targetY - centerY;
        const sourceX = Math.round(centerX + targetRelX * cos + targetRelY * sin);
        const sourceY = Math.round(centerY - targetRelX * sin + targetRelY * cos);
        const source = sourceByPoint.get(`${sourceX}:${sourceY}`);
        if (source === undefined) continue;
        pixels.push({
          x: targetX + transform.dx,
          y: targetY + transform.dy,
          colorIndex: source.colorIndex,
        });
      }
    }
    return pixels;
  }
  if (transform.operation === "SCALE_INTEGER" || transform.operation === "SCALE_NEAREST") {
    const factor = transform.factor;
    const outputWidth = Math.max(1, Math.round(bounds.width * factor));
    const outputHeight = Math.max(1, Math.round(bounds.height * factor));
    const originX = Math.floor((bounds.width - outputWidth) / 2);
    const originY = Math.floor((bounds.height - outputHeight) / 2);
    const sourceByLocalPoint = new Map<string, SelectionPixel>();
    for (const pixel of snapshot.pixels) sourceByLocalPoint.set(`${pixel.x - bounds.x}:${pixel.y - bounds.y}`, pixel);
    for (let targetY = 0; targetY < outputHeight; targetY += 1) {
      for (let targetX = 0; targetX < outputWidth; targetX += 1) {
        const sourceX = Math.min(bounds.width - 1, Math.max(0, Math.floor(((targetX + 0.5 - (outputWidth / 2)) / factor) + (bounds.width / 2))));
        const sourceY = Math.min(bounds.height - 1, Math.max(0, Math.floor(((targetY + 0.5 - (outputHeight / 2)) / factor) + (bounds.height / 2))));
        const source = sourceByLocalPoint.get(`${sourceX}:${sourceY}`);
        if (source === undefined) continue;
        pixels.push({ x: bounds.x + originX + targetX + transform.dx, y: bounds.y + originY + targetY + transform.dy, colorIndex: source.colorIndex });
      }
    }
    return pixels;
  }
  for (const pixel of snapshot.pixels) {
    const localX = pixel.x - bounds.x;
    const localY = pixel.y - bounds.y;
    if (transform.operation === "MOVE") pixels.push({ x: pixel.x + transform.dx, y: pixel.y + transform.dy, colorIndex: pixel.colorIndex });
    else if (transform.operation === "FLIP_HORIZONTAL") pixels.push({ x: bounds.x + bounds.width - 1 - localX + transform.dx, y: pixel.y + transform.dy, colorIndex: pixel.colorIndex });
    else if (transform.operation === "FLIP_VERTICAL") pixels.push({ x: pixel.x + transform.dx, y: bounds.y + bounds.height - 1 - localY + transform.dy, colorIndex: pixel.colorIndex });
    else if (transform.operation === "ROTATE_90_CW") pixels.push({ x: bounds.x + bounds.height - 1 - localY + transform.dx, y: bounds.y + localX + transform.dy, colorIndex: pixel.colorIndex });
    else if (transform.operation === "ROTATE_90_CCW") pixels.push({ x: bounds.x + localY + transform.dx, y: bounds.y + bounds.width - 1 - localX + transform.dy, colorIndex: pixel.colorIndex });
    else if (transform.operation === "ROTATE_180") pixels.push({ x: bounds.x + bounds.width - 1 - localX + transform.dx, y: bounds.y + bounds.height - 1 - localY + transform.dy, colorIndex: pixel.colorIndex });
  }
  return pixels;
}

function estimatedTransformBounds(snapshot: SelectionSnapshot, transform: TransformDescriptor): SelectionRegion {
  const bounds = boundsFromRegions(snapshot.mask.regions);
  if (transform.operation === "ROTATE_90_CW" || transform.operation === "ROTATE_90_CCW") return { ...bounds, width: bounds.height, height: bounds.width };
  if (transform.operation === "ROTATE_NEAREST") return rotatedRegion(bounds, transform.angleDeg ?? 0, transform.dx, transform.dy);
  if (transform.operation === "SCALE_INTEGER" || transform.operation === "SCALE_NEAREST") {
    return { ...bounds, width: Math.max(1, Math.round(bounds.width * transform.factor)), height: Math.max(1, Math.round(bounds.height * transform.factor)) };
  }
  return bounds;
}

function destinationBounds(snapshot: SelectionSnapshot, transform: TransformDescriptor): SelectionRegion {
  if (transform.operation === "ROTATE_NEAREST") {
    const bounds = boundsFromRegions(snapshot.mask.regions);
    return rotatedRegion(bounds, transform.angleDeg ?? 0, transform.dx, transform.dy);
  }
  const pixels = transformedPixels(snapshot, transform);
  return regionForPoints(pixels) ?? boundsFromRegions(snapshot.mask.regions);
}

export function createTransformSession(snapshot: SelectionSnapshot, transform: TransformDescriptor, sessionId = `transform-${snapshot.selectionId}-${snapshot.mask.selectionVersion}`): TransformSession {
  const destination = destinationBounds(snapshot, transform);
  return {
    sessionId,
    sourceSelectionVersion: snapshot.mask.selectionVersion,
    sourceRasterRevision: snapshot.sourceRasterRevision,
    sourceStructureEpoch: snapshot.sourceStructureEpoch,
    transform,
    previewBounds: boundsFromRegions(snapshot.mask.regions),
    destinationBounds: destination,
    status: "PREVIEW",
  };
}

function createClipboardSelectionSnapshot(
  state: ProjectState,
  clipboard: ClipboardPayload,
): SelectionSnapshot {
  const asset = state.assets[state.activeAssetId];
  if (asset === undefined) throw new Error("Paste target asset is missing.");
  const compatibility = assessClipboardPalette(clipboard, asset.palette);
  return {
    selectionId: `clipboard-${clipboard.sourceAssetId}-${clipboard.sourceSelectionVersion}`,
    mask: { kind: "rectangle", regions: [{ x: clipboard.origin.x, y: clipboard.origin.y, width: clipboard.width, height: clipboard.height }], selectionVersion: clipboard.sourceSelectionVersion },
    scope: { assetId: asset.id, layerId: state.activeLayerId, frameId: state.activeFrameId, celId: state.activeCelId },
    sourceRasterRevision: asset.revision,
    sourceStructureEpoch: state.structureEpoch,
    pixels: clipboard.pixels.map((pixel) => ({
      x: pixel.x + clipboard.origin.x,
      y: pixel.y + clipboard.origin.y,
      colorIndex: compatibility.mapping[pixel.colorIndex] ?? pixel.colorIndex,
    })),
  };
}

export function createClipboardPasteSession(state: ProjectState, clipboard: ClipboardPayload, transform: TransformDescriptor, sessionId = `paste-${state.projectId}-${clipboard.sourceSelectionVersion}`): TransformSession {
  const snapshot = createClipboardSelectionSnapshot(state, clipboard);
  return createTransformSession(snapshot, transform, sessionId);
}

export function previewTransform(snapshot: SelectionSnapshot, session: TransformSession): TransformPreview {
  return {
    sessionId: session.sessionId,
    pixels: transformedPixels(snapshot, session.transform),
    overlayRegions: [session.previewBounds, session.destinationBounds],
    canonicalDirtyTiles: [],
    canonicalDirtyRegions: [],
    metricScope: "PREVIEW_ONLY",
  };
}

/** Builds the visible placement projection from the same pixels used by Paste. */
export function previewClipboardPaste(
  state: ProjectState,
  clipboard: ClipboardPayload,
  session: TransformSession,
): TransformPreview {
  return previewTransform(
    createClipboardSelectionSnapshot(state, clipboard),
    session,
  );
}

export function createClipboardPayload(state: ProjectState, snapshot: SelectionSnapshot, provenance?: string): ClipboardPayload {
  const bounds = boundsFromRegions(snapshot.mask.regions);
  return {
    format: "PIXIEEDRAW2_CLIPBOARD",
    version: 1,
    width: bounds.width,
    height: bounds.height,
    origin: { x: bounds.x, y: bounds.y },
    pixels: snapshot.pixels.map((pixel) => ({ x: pixel.x - bounds.x, y: pixel.y - bounds.y, colorIndex: pixel.colorIndex })),
    palette: [...(state.assets[snapshot.scope.assetId]?.palette ?? [0])],
    sourceAssetId: snapshot.scope.assetId,
    sourceSelectionVersion: snapshot.mask.selectionVersion,
    ...(provenance === undefined ? {} : { provenance }),
  };
}

export function assessClipboardPalette(clipboard: ClipboardPayload, targetPalette: readonly number[]): ClipboardCompatibilityResult {
  const mapping: Record<number, number> = { 0: 0 };
  const missingColors: number[] = [];
  const usedColors = new Set(clipboard.pixels.map((pixel) => pixel.colorIndex));
  for (const index of usedColors) {
    if (index === 0) continue;
    const color = clipboard.palette[index];
    if (color === undefined) continue;
    const targetIndex = targetPalette.indexOf(color);
    if (targetIndex >= 0) mapping[index] = targetIndex;
    else missingColors.push(color);
  }
  if (missingColors.length === 0) return { result: "EXACT_PALETTE_MATCH", mapping, missingColors, message: "Exact indexed palette match." };
  if (missingColors.length + targetPalette.length <= 256) return { result: "PALETTE_EXTENSION_REQUIRED", mapping, missingColors, message: "Clipboard requires an explicit palette extension decision." };
  if (missingColors.length > 0) return { result: "PALETTE_OVERFLOW", mapping, missingColors, message: "Clipboard colors exceed the target palette capacity." };
  return { result: "INCOMPATIBLE", mapping, missingColors, message: "Clipboard palette is incompatible." };
}

function validateSession(snapshot: SelectionSnapshot, session: TransformSession): Diagnostic[] {
  const diagnostics = validateTransform(session.transform);
  if (session.status !== "PREVIEW") diagnostics.push(error("TRANSFORM_SESSION_NOT_PREVIEW", "Only an active Preview session can be committed.", "session.status"));
  if (session.sourceSelectionVersion !== snapshot.mask.selectionVersion) diagnostics.push(error("STALE_SELECTION_VERSION", "Transform session selection version is stale.", "session.sourceSelectionVersion"));
  if (session.sourceRasterRevision !== snapshot.sourceRasterRevision) diagnostics.push(error("STALE_TRANSFORM_RASTER", "Transform session raster version is stale.", "session.sourceRasterRevision"));
  if (session.sourceStructureEpoch !== snapshot.sourceStructureEpoch) diagnostics.push(error("STALE_TRANSFORM_STRUCTURE", "Transform session structure epoch is stale.", "session.sourceStructureEpoch"));
  const estimated = estimatedTransformBounds(snapshot, session.transform);
  if (estimated.width * estimated.height > MAX_SELECTION_PIXELS) diagnostics.push(error("TRANSFORM_PIXEL_LIMIT_EXCEEDED", "Transform output exceeds the bounded pixel limit.", "session.transform.factor"));
  return diagnostics;
}

function changedRegions(assetId: string, points: readonly PixelPoint[]): readonly DirtyRegion[] {
  const region = regionForPoints(points);
  return region === undefined ? [] : [{ assetId, ...region }];
}

export function createSelectionTransformWirePayload(
  snapshot: SelectionSnapshot,
  transform: TransformDescriptor,
  destinationCount: number,
  outOfBoundsClipped: boolean,
): SelectionTransformWirePayload {
  const selectionMask = createRasterSelectionMask(snapshot.pixels);
  if (selectionMask === undefined) {
    throw new Error("Selection transform requires a non-empty selection mask.");
  }
  return {
    selectionId: snapshot.selectionId,
    selectionVersion: snapshot.mask.selectionVersion,
    selectionKind: snapshot.mask.kind,
    selectionBounds: boundsFromRegions(snapshot.mask.regions),
    scope: snapshot.scope,
    sourceRasterRevision: snapshot.sourceRasterRevision,
    sourceStructureEpoch: snapshot.sourceStructureEpoch,
    selectionMask,
    transform,
    sourceCount: snapshot.pixels.length,
    destinationCount,
    outOfBoundsClipped,
    transparentDestinationPolicy: "PRESERVE_DESTINATION",
  };
}

async function buildResult(
  state: ProjectState,
  commandId: string,
  operationType: CanonicalOperation["operationType"],
  operationPayload: unknown,
  asset: RasterAsset,
  dirtyTiles: Map<string, DirtyTile>,
  dirtyRegions: readonly DirtyRegion[],
  copiedBytes: number,
  cowSplitCount: number,
  noOp = false,
  identity: SelectionOperationIdentity = DEFAULT_SELECTION_OPERATION_IDENTITY,
): Promise<CommandResult> {
  const operationBody = {
    operationType,
    schemaVersion: 1 as const,
    commandId,
    projectId: state.projectId,
    assetId: asset.id,
    actorId: identity.actorId,
    clientId: identity.clientId,
    clientSequence: identity.clientSequence ??
      state.lastClientSequenceByClient[identity.clientId] ?? 0,
    structureEpoch: state.structureEpoch,
    payload: operationPayload,
  };
  const operation: CanonicalOperation = { operationId: `op_${await canonicalOperationId(operationBody)}`, ...operationBody };
  const points = dirtyRegions.flatMap((region) => [{ x: region.x, y: region.y }, { x: region.x + region.width - 1, y: region.y + region.height - 1 }]);
  return {
    operation,
    noOp,
    metricScope: "COMMAND_TO_DIRTY" satisfies Draw2MetricScope,
    dirtyTiles: [...dirtyTiles.values()].sort((left, right) => left.tileKey.localeCompare(right.tileKey)),
    dirtyRegions,
    memory: asset.raster.memoryMetrics(),
    copiedBytes,
    cowSplitCount,
    trace: { commandValidationCount: 1, commandCommitCount: 1, affectedLayerCount: 1, affectedFrameCount: 1, fullRasterCloneCount: 0, fullTimelineRebuildCount: 0, wholeProjectSerializationCount: 0 },
    instrumentation: [{ name: "dirty.tileCalculation", durationMs: 0, detail: { tileCount: dirtyTiles.size, metricScope: "COMMAND_TO_DIRTY" } }, ...points.map(() => ({ name: "renderer.prepare" as const, durationMs: 0, detail: { metricScope: "DIRTY_TO_PRESENT" } }))],
  };
}

async function canonicalOperationId(value: unknown): Promise<string> {
  return (await sha256Hex(value)).slice(0, 32);
}

function applyPixelMutations(
  state: ProjectState,
  assetId: string,
  sourcePixels: readonly SelectionPixel[],
  destinationPixels: readonly SelectionPixel[],
  clearSource: boolean,
): {
  state: ProjectState;
  asset: RasterAsset;
  dirtyTiles: Map<string, DirtyTile>;
  dirtyPoints: PixelPoint[];
  copiedBytes: number;
  cowSplitCount: number;
  changed: boolean;
} {
  const nextState = cloneProjectStateShared(state);
  const asset = nextState.assets[assetId];
  if (asset === undefined) throw new Error("Selection target asset is missing.");
  const dirtyTiles = new Map<string, DirtyTile>();
  const dirtyPoints: PixelPoint[] = [];
  let copiedBytes = 0;
  let cowSplitCount = 0;
  const mutate = (point: PixelPoint, colorIndex: number): void => {
    const mutation = asset.raster.setPixel(asset.id, point.x, point.y, colorIndex);
    if (!mutation.changed) return;
    dirtyTiles.set(mutation.tile.tileKey, mutation.tile);
    dirtyPoints.push(point);
    copiedBytes += mutation.copiedBytes;
    if (mutation.cowSplit) cowSplitCount += 1;
  };
  if (clearSource) for (const pixel of sourcePixels) mutate(pixel, 0);
  // Selection and clipboard snapshots are dense, so transparent cells are
  // present in the destination list as well. Index 0 represents a hole, not
  // an erase instruction: writing it here would destroy artwork underneath a
  // moved/ pasted transparent region. Clearing the source remains explicit
  // through `clearSource` above.
  for (const pixel of destinationPixels) {
    if (pixel.colorIndex === 0) continue;
    mutate(pixel, pixel.colorIndex);
  }
  const uniqueDirtyPoints = new Map(
    dirtyPoints.map((point) => [`${point.x}:${point.y}`, point]),
  );
  const effectiveDirtyPoints = [...uniqueDirtyPoints.values()].filter((point) =>
    state.assets[assetId]?.raster.getPixel(point.x, point.y) !==
      asset.raster.getPixel(point.x, point.y)
  );
  if (effectiveDirtyPoints.length === 0) {
    const originalAsset = state.assets[assetId];
    if (originalAsset === undefined) throw new Error("Selection target asset is missing.");
    return {
      state,
      asset: originalAsset,
      dirtyTiles: new Map(),
      dirtyPoints: [],
      copiedBytes: 0,
      cowSplitCount: 0,
      changed: false,
    };
  }
  const effectiveTileKeys = new Set(
    effectiveDirtyPoints.map((point) =>
      `${Math.floor(point.x / asset.raster.tileSize)}:${Math.floor(point.y / asset.raster.tileSize)}`
    ),
  );
  const effectiveDirtyTiles = new Map(
    [...dirtyTiles].filter(([tileKey]) => effectiveTileKeys.has(tileKey)),
  );
  const nextAsset = { ...asset, revision: asset.revision + 1 };
  nextState.assets = { ...nextState.assets, [assetId]: nextAsset };
  return {
    state: nextState,
    asset: nextAsset,
    dirtyTiles: effectiveDirtyTiles,
    dirtyPoints: effectiveDirtyPoints,
    copiedBytes,
    cowSplitCount,
    changed: true,
  };
}

function commitState(
  state: ProjectState,
  commandId: string,
  identity: SelectionOperationIdentity = DEFAULT_SELECTION_OPERATION_IDENTITY,
): ProjectState {
  const next = cloneProjectStateShared(state);
  next.appliedCommandIds = [...next.appliedCommandIds, commandId];
  const previousSequence = next.lastClientSequenceByClient[identity.clientId] ?? 0;
  const nextSequence = identity.clientSequence === undefined
    ? previousSequence + 1
    : Math.max(previousSequence + 1, identity.clientSequence);
  next.lastClientSequenceByClient = {
    ...next.lastClientSequenceByClient,
    [identity.clientId]: nextSequence,
  };
  return next;
}

export async function commitTransform(state: ProjectState, command: SelectionTransformCommand): Promise<SelectionExecutionResult> {
  const asset = state.assets[command.assetId];
  if (asset === undefined) return { ok: false, state, diagnostics: [error("TRANSFORM_ASSET_NOT_FOUND", "Transform asset was not found.")] };
  const diagnostics = [...validateSnapshot(state, asset, command.payload.selection), ...validateSession(command.payload.selection, command.payload.session)];
  if (command.projectId !== state.projectId || command.assetId !== command.payload.selection.scope.assetId || command.baseStructureEpoch !== state.structureEpoch) diagnostics.push(error("TRANSFORM_COMMAND_SCOPE_INVALID", "Transform command scope is stale or mismatched."));
  if (state.appliedCommandIds.includes(command.commandId)) diagnostics.push(error("TRANSFORM_DUPLICATE_COMMAND", "Transform command was already applied.", "commandId"));
  if (diagnostics.length > 0) return { ok: false, state, diagnostics };
  const transformed = transformedPixels(command.payload.selection, command.payload.session.transform);
  const outOfBounds = transformed.some((pixel) => pixel.x < 0 || pixel.y < 0 || pixel.x >= asset.width || pixel.y >= asset.height);
  if (outOfBounds && command.payload.session.transform.outOfBoundsPolicy === "CANCEL") return { ok: false, state, diagnostics: [error("TRANSFORM_OUT_OF_BOUNDS", "Transform destination is outside the raster and policy is CANCEL.")] };
  const clipped = transformed.filter((pixel) => pixel.x >= 0 && pixel.y >= 0 && pixel.x < asset.width && pixel.y < asset.height);
  const transform = command.payload.session.transform;
  const identityTransform = transform.operation === "MOVE" &&
    transform.dx === 0 && transform.dy === 0;
  if (identityTransform) {
    const result = await buildResult(
      state,
      command.commandId,
      "selection.transformCommit",
      createSelectionTransformWirePayload(
        command.payload.selection,
        transform,
        clipped.length,
        false,
      ),
      asset,
      new Map(),
      [],
      0,
      0,
      true,
      command,
    );
    return { ok: true, state, result };
  }
  const mutation = applyPixelMutations(state, command.assetId, command.payload.selection.pixels, clipped, true);
  const sourcePoints = command.payload.selection.pixels;
  const destinationPoints = clipped;
  const dirtyRegions = changedRegions(asset.id, mutation.dirtyPoints);
  const operationPayload = createSelectionTransformWirePayload(
    command.payload.selection,
    command.payload.session.transform,
    destinationPoints.length,
    outOfBounds && command.payload.session.transform.outOfBoundsPolicy === "CLIP",
  );
  const temporaryResult = await buildResult(
    mutation.state,
    command.commandId,
    "selection.transformCommit",
    operationPayload,
    mutation.asset,
    mutation.dirtyTiles,
    dirtyRegions,
    mutation.copiedBytes,
    mutation.cowSplitCount,
    !mutation.changed,
    command,
  );
  if (!mutation.changed) return { ok: true, state, result: temporaryResult };
  const nextState = commitState(mutation.state, command.commandId, command);
  return {
    ok: true,
    state: nextState,
    result: {
      ...temporaryResult,
      operation: {
        ...temporaryResult.operation,
        clientSequence: nextState.lastClientSequenceByClient[command.clientId] ??
          command.clientSequence,
      },
    },
  };
}

function wireSelectionPixels(
  asset: RasterAsset,
  mask: ReturnType<typeof decodeRasterSelectionMask>,
): SelectionPixel[] {
  const pixels: SelectionPixel[] = [];
  for (const row of mask.rows) {
    for (const span of row.spans) {
      for (let offset = 0; offset < span.width; offset += 1) {
        // Decoded rows/spans already contain absolute raster coordinates.
        const x = span.x + offset;
        const y = row.y;
        pixels.push({ x, y, colorIndex: asset.raster.getPixel(x, y) });
      }
    }
  }
  return pixels;
}

/** Applies the compact selection-transform form received from PiXYNC. */
export async function applyCompactSelectionTransform(
  state: ProjectState,
  command: SelectionTransformWireCommand,
): Promise<SelectionExecutionResult> {
  const asset = state.assets[command.assetId];
  if (asset === undefined) {
    return {
      ok: false,
      state,
      diagnostics: [error("TRANSFORM_ASSET_NOT_FOUND", "Transform asset was not found.")],
    };
  }
  const payload = command.payload;
  const diagnostics: Diagnostic[] = [];
  if (command.projectId !== state.projectId) {
    diagnostics.push(error("TRANSFORM_COMMAND_SCOPE_INVALID", "Transform command project is stale or mismatched.", "projectId"));
  }
  if (command.assetId !== payload.scope?.assetId) {
    diagnostics.push(error("TRANSFORM_COMMAND_SCOPE_INVALID", "Transform command asset does not match the selection scope.", "scope.assetId"));
  }
  if (command.baseStructureEpoch !== state.structureEpoch) {
    diagnostics.push(error("TRANSFORM_COMMAND_SCOPE_INVALID", "Transform command structure epoch is stale or mismatched.", "baseStructureEpoch"));
  }
  if (state.appliedCommandIds.includes(command.commandId)) {
    diagnostics.push(error("TRANSFORM_DUPLICATE_COMMAND", "Transform command was already applied.", "commandId"));
  }
  if (typeof payload.selectionId !== "string" || payload.selectionId.length < 1 || payload.selectionId.length > 128) {
    diagnostics.push(error("SELECTION_ID_INVALID", "Selection ID must be a bounded non-empty string.", "selectionId"));
  }
  if (!isInteger(payload.selectionVersion) || payload.selectionVersion < 1) {
    diagnostics.push(error("SELECTION_VERSION_INVALID", "Selection version must be positive.", "selectionVersion"));
  }
  if (!isSelectionShapeKind(payload.selectionKind)) {
    diagnostics.push(error("SELECTION_KIND_INVALID", "Selection kind is unsupported.", "selectionKind"));
  }
  if (!isInteger(payload.sourceRasterRevision) || payload.sourceRasterRevision < 0) {
    diagnostics.push(error("STALE_SELECTION_RASTER", "Selection source raster revision is invalid.", "sourceRasterRevision"));
  }
  if (!isInteger(payload.sourceStructureEpoch) || payload.sourceStructureEpoch !== command.baseStructureEpoch) {
    diagnostics.push(error("STALE_SELECTION_STRUCTURE", "Selection source structure epoch is stale.", "sourceStructureEpoch"));
  }
  if (!isInteger(payload.sourceCount) || payload.sourceCount < 1 || payload.sourceCount > MAX_SELECTION_PIXELS) {
    diagnostics.push(error("SELECTION_PIXEL_LIMIT_EXCEEDED", "Selection source count is outside its bounded limit.", "sourceCount"));
  }
  if (!isInteger(payload.destinationCount) || payload.destinationCount < 0 || payload.destinationCount > MAX_SELECTION_PIXELS) {
    diagnostics.push(error("TRANSFORM_PIXEL_LIMIT_EXCEEDED", "Transform destination count is outside its bounded limit.", "destinationCount"));
  }
  if (typeof payload.outOfBoundsClipped !== "boolean") {
    diagnostics.push(error("TRANSFORM_METADATA_INVALID", "Transform clipping metadata must be boolean.", "outOfBoundsClipped"));
  }
  if (
    payload.transparentDestinationPolicy !== undefined &&
    payload.transparentDestinationPolicy !== "PRESERVE_DESTINATION"
  ) {
    diagnostics.push(error("TRANSFORM_TRANSPARENCY_POLICY_UNSUPPORTED", "Transform payload must preserve existing artwork under transparent destination cells.", "transparentDestinationPolicy"));
  }

  const scope = payload.scope;
  const validScope = scope !== null && typeof scope === "object" && !Array.isArray(scope);
  if (!validScope) {
    diagnostics.push(error("SELECTION_SCOPE_INVALID", "Selection scope is required.", "scope"));
  } else {
    diagnostics.push(...validateStructureScope(state, scope, command.assetId));
  }

  const selectionBounds = payload.selectionBounds;
  const validBounds = selectionBounds !== null && typeof selectionBounds === "object" && !Array.isArray(selectionBounds);
  if (!validBounds) {
    diagnostics.push(error("SELECTION_REGION_INVALID", "Selection bounds are required.", "selectionBounds"));
  } else {
    diagnostics.push(...validateRegion(asset, selectionBounds, "selectionBounds"));
    if (selectionBounds.width * selectionBounds.height > MAX_SELECTION_PIXELS) {
      diagnostics.push(error("TRANSFORM_PIXEL_LIMIT_EXCEEDED", "Selection bounds exceed the bounded pixel limit.", "selectionBounds"));
    }
  }

  let decodedMask: ReturnType<typeof decodeRasterSelectionMask> | undefined;
  try {
    decodedMask = decodeRasterSelectionMask(payload.selectionMask);
  } catch (cause) {
    diagnostics.push(error(
      "RASTER_SELECTION_MASK_INVALID",
      cause instanceof Error ? cause.message : "Selection mask is invalid.",
      "selectionMask",
    ));
  }
  if (decodedMask !== undefined) {
    if (decodedMask.selectedCount > MAX_SELECTION_PIXELS) {
      diagnostics.push(error("SELECTION_PIXEL_LIMIT_EXCEEDED", "Selection mask exceeds the bounded pixel limit.", "selectionMask.selectedCount"));
    }
    if (decodedMask.x + decodedMask.width > asset.width || decodedMask.y + decodedMask.height > asset.height) {
      diagnostics.push(error("SELECTION_OUTSIDE_BOUNDS", "Selection mask is outside the raster.", "selectionMask"));
    }
    if (validBounds && (
      decodedMask.x < selectionBounds.x || decodedMask.y < selectionBounds.y ||
      decodedMask.x + decodedMask.width > selectionBounds.x + selectionBounds.width ||
      decodedMask.y + decodedMask.height > selectionBounds.y + selectionBounds.height
    )) {
      diagnostics.push(error("SELECTION_MASK_SCOPE_INVALID", "Selection mask is outside the declared selection bounds.", "selectionMask"));
    }
    if (isInteger(payload.sourceCount) && payload.sourceCount !== decodedMask.selectedCount) {
      diagnostics.push(error("TRANSFORM_METADATA_INVALID", "Selection source count does not match the selection mask.", "sourceCount"));
    }
  }
  const transform = payload.transform;
  const validTransform = transform !== null && typeof transform === "object" && !Array.isArray(transform);
  if (!validTransform) {
    diagnostics.push(error("TRANSFORM_INVALID", "Transform descriptor is required.", "transform"));
  } else {
    diagnostics.push(...validateTransform(transform));
  }
  if (diagnostics.length > 0 || decodedMask === undefined || !validScope || !validBounds || !validTransform) {
    return { ok: false, state, diagnostics };
  }

  const selection: SelectionSnapshot = {
    selectionId: payload.selectionId,
    mask: {
      kind: payload.selectionKind,
      regions: [selectionBounds],
      selectionVersion: payload.selectionVersion,
    },
    scope,
    // The source revision is intentionally rebound to this peer's current
    // raster. The operation is ordered by PiXYNC; the wire never transports
    // an unbounded color array, so selected colors come from this canonical
    // raster immediately before the ordered transform is applied.
    sourceRasterRevision: asset.revision,
    sourceStructureEpoch: state.structureEpoch,
    pixels: wireSelectionPixels(asset, decodedMask),
  };
  const session = createTransformSession(
    selection,
    transform,
    `remote-transform-${command.commandId}`,
  );
  return commitTransform(state, {
    ...command,
    payload: { selection, session },
  });
}

export async function copyClipboard(state: ProjectState, command: ClipboardCopyCommand): Promise<SelectionExecutionResult> {
  const asset = state.assets[command.assetId];
  if (asset === undefined) return { ok: false, state, diagnostics: [error("CLIPBOARD_ASSET_NOT_FOUND", "Clipboard source asset was not found.")] };
  if (state.appliedCommandIds.includes(command.commandId)) return { ok: false, state, diagnostics: [error("CLIPBOARD_DUPLICATE_COMMAND", "Clipboard command was already applied.", "commandId")] };
  const diagnostics = [...validateClipboard(command.payload.clipboard, asset)];
  if (diagnostics.length > 0) return { ok: false, state, diagnostics };
  const nextState = commitState(state, command.commandId);
  const result = await buildResult(nextState, command.commandId, "clipboard.copy", { format: command.payload.clipboard.format, version: command.payload.clipboard.version, pixelCount: command.payload.clipboard.pixels.length }, asset, new Map(), [], 0, 0);
  return { ok: true, state: nextState, result, clipboard: command.payload.clipboard };
}

export async function cutClipboard(state: ProjectState, command: ClipboardCutCommand): Promise<SelectionExecutionResult> {
  const asset = state.assets[command.assetId];
  if (asset === undefined) return { ok: false, state, diagnostics: [error("CLIPBOARD_ASSET_NOT_FOUND", "Clipboard source asset was not found.")] };
  if (state.appliedCommandIds.includes(command.commandId)) return { ok: false, state, diagnostics: [error("CLIPBOARD_DUPLICATE_COMMAND", "Clipboard command was already applied.", "commandId")] };
  if (command.projectId !== state.projectId || command.baseStructureEpoch !== state.structureEpoch) return { ok: false, state, diagnostics: [error("CLIPBOARD_COMMAND_SCOPE_INVALID", "Clipboard command scope is stale or mismatched.")] };
  const diagnostics = [...validateClipboard(command.payload.clipboard, asset), ...validateSnapshot(state, asset, command.payload.selection)];
  if (diagnostics.length > 0) return { ok: false, state, diagnostics };
  const mutation = applyPixelMutations(state, command.assetId, command.payload.selection.pixels, [], true);
  const dirtyRegions = changedRegions(asset.id, mutation.dirtyPoints);
  const result = await buildResult(mutation.state, command.commandId, "clipboard.cut", { format: command.payload.clipboard.format, version: 1, pixelCount: command.payload.clipboard.pixels.length }, mutation.asset, mutation.dirtyTiles, dirtyRegions, mutation.copiedBytes, mutation.cowSplitCount, !mutation.changed);
  if (!mutation.changed) return { ok: true, state, result, clipboard: command.payload.clipboard };
  const nextState = commitState(mutation.state, command.commandId);
  return { ok: true, state: nextState, result: { ...result, operation: { ...result.operation, clientSequence: nextState.lastClientSequenceByClient["draw2-selection-local"] ?? 0 } }, clipboard: command.payload.clipboard };
}

export async function pasteClipboard(state: ProjectState, command: ClipboardPasteCommand): Promise<SelectionExecutionResult> {
  const asset = state.assets[command.assetId];
  if (asset === undefined) return { ok: false, state, diagnostics: [error("CLIPBOARD_ASSET_NOT_FOUND", "Clipboard target asset was not found.")] };
  if (state.appliedCommandIds.includes(command.commandId)) return { ok: false, state, diagnostics: [error("CLIPBOARD_DUPLICATE_COMMAND", "Clipboard command was already applied.", "commandId")] };
  if (command.projectId !== state.projectId || command.baseStructureEpoch !== state.structureEpoch) return { ok: false, state, diagnostics: [error("CLIPBOARD_COMMAND_SCOPE_INVALID", "Clipboard command scope is stale or mismatched.")] };
  const compatibility = assessClipboardPalette(command.payload.clipboard, asset.palette);
  const diagnostics = [...validateClipboard(command.payload.clipboard, asset), ...validateTransform(command.payload.session.transform)];
  if (compatibility.result !== "EXACT_PALETTE_MATCH") diagnostics.push(error("CLIPBOARD_PALETTE_MISMATCH", compatibility.message, "clipboard.palette"));
  if (command.payload.session.status !== "PREVIEW") diagnostics.push(error("PASTE_SESSION_NOT_PREVIEW", "Paste must begin as a placement Preview."));
  if (command.payload.session.sourceRasterRevision !== asset.revision) diagnostics.push(error("STALE_PASTE_RASTER", "Paste placement session is stale for the target raster."));
  if (command.payload.session.sourceStructureEpoch !== state.structureEpoch) diagnostics.push(error("STALE_PASTE_STRUCTURE", "Paste placement session is stale for the Project structure."));
  if (diagnostics.length > 0) return { ok: false, state, diagnostics };
  const relativePixels = command.payload.clipboard.pixels;
  const destinationPixels = transformedPixels({
    selectionId: `paste-${command.commandId}`,
    mask: { kind: "rectangle", regions: [{ x: command.payload.clipboard.origin.x, y: command.payload.clipboard.origin.y, width: command.payload.clipboard.width, height: command.payload.clipboard.height }], selectionVersion: command.payload.clipboard.sourceSelectionVersion },
    scope: { assetId: command.assetId, layerId: state.activeLayerId, frameId: state.activeFrameId, celId: state.activeCelId },
    sourceRasterRevision: asset.revision,
    sourceStructureEpoch: state.structureEpoch,
    pixels: relativePixels.map((pixel) => ({ x: pixel.x + command.payload.clipboard.origin.x, y: pixel.y + command.payload.clipboard.origin.y, colorIndex: compatibility.mapping[pixel.colorIndex] ?? pixel.colorIndex })),
  }, command.payload.session.transform);
  const outOfBounds = destinationPixels.some((pixel) => pixel.x < 0 || pixel.y < 0 || pixel.x >= asset.width || pixel.y >= asset.height);
  if (outOfBounds && command.payload.session.transform.outOfBoundsPolicy === "CANCEL") return { ok: false, state, diagnostics: [error("PASTE_OUT_OF_BOUNDS", "Paste destination is outside the raster and policy is CANCEL.")] };
  const clipped = destinationPixels.filter((pixel) => pixel.x >= 0 && pixel.y >= 0 && pixel.x < asset.width && pixel.y < asset.height);
  const mutation = applyPixelMutations(state, command.assetId, [], clipped, false);
  const result = await buildResult(mutation.state, command.commandId, "clipboard.paste", { format: command.payload.clipboard.format, version: 1, pixelCount: clipped.length, paletteCompatibility: compatibility.result }, mutation.asset, mutation.dirtyTiles, changedRegions(asset.id, mutation.dirtyPoints), mutation.copiedBytes, mutation.cowSplitCount, !mutation.changed);
  if (!mutation.changed) return { ok: true, state, result, clipboard: command.payload.clipboard };
  const nextState = commitState(mutation.state, command.commandId);
  return { ok: true, state: nextState, result: { ...result, operation: { ...result.operation, clientSequence: nextState.lastClientSequenceByClient["draw2-selection-local"] ?? 0 } }, clipboard: command.payload.clipboard };
}

export function selectionCommandId(operation: string, projectId: string, sequence: number): string { return `draw2-${operation}-${projectId}-${sequence}`; }

export class LocalUndoRedoHistory {
  #state: ProjectState;
  readonly #undo: HistoryEntry[] = [];
  readonly #redo: HistoryEntry[] = [];
  readonly #maxEntries: number;

  constructor(
    state: ProjectState,
    options: LocalUndoRedoHistoryOptions = {},
  ) {
    this.#state = state;
    const maxEntries = options.maxEntries;
    this.#maxEntries = typeof maxEntries === "number" &&
        Number.isSafeInteger(maxEntries) &&
        maxEntries >= 1 && maxEntries <= 1024
      ? maxEntries
      : DRAW2_LIVE_HISTORY_LIMIT;
  }
  get state(): ProjectState { return this.#state; }
  get undoDepth(): number { return this.#undo.length; }
  get redoDepth(): number { return this.#redo.length; }
  get maxEntries(): number { return this.#maxEntries; }
  #trim(entries: HistoryEntry[]): void {
    if (entries.length <= this.#maxEntries) return;
    entries.splice(0, entries.length - this.#maxEntries);
  }
  snapshot(maxEntries = Number.MAX_SAFE_INTEGER): UndoRedoHistorySnapshot {
    const limit = Number.isSafeInteger(maxEntries) && maxEntries >= 0
      ? maxEntries
      : Number.MAX_SAFE_INTEGER;
    const bounded = (entries: readonly HistoryEntry[]): HistoryEntry[] => {
      const start = Math.max(0, entries.length - limit);
      return entries.slice(start).map((entry) => ({
        ...entry,
        before: cloneProjectStateShared(entry.before),
        after: cloneProjectStateShared(entry.after),
      }));
    };
    return {
      undo: bounded(this.#undo),
      redo: bounded(this.#redo),
    };
  }
  restore(snapshot: UndoRedoHistorySnapshot): void {
    this.#undo.length = 0;
    this.#redo.length = 0;
    for (const entry of snapshot.undo) {
      this.#undo.push({
        ...entry,
        before: cloneProjectStateShared(entry.before),
        after: cloneProjectStateShared(entry.after),
      });
    }
    for (const entry of snapshot.redo) {
      this.#redo.push({
        ...entry,
        before: cloneProjectStateShared(entry.before),
        after: cloneProjectStateShared(entry.after),
      });
    }
    this.#trim(this.#undo);
    this.#trim(this.#redo);
    this.#state = cloneProjectStateShared(
      this.#undo.at(-1)?.after ?? this.#redo.at(-1)?.before ?? this.#state,
    );
  }
  record(before: ProjectState, after: ProjectState, operationId: string, operationType: string, actionId = operationId): void {
    this.#undo.push({ actionId, operationId, operationType, before: cloneProjectStateShared(before), after: cloneProjectStateShared(after) });
    this.#trim(this.#undo);
    this.#redo.length = 0;
    this.#state = cloneProjectStateShared(after);
  }
  /**
   * Rebase local full-state history over a remote raster operation. Aseprite's
   * local undo restores the user's previous edit without removing a later
   * change; applying the remote command to both sides of every local entry
   * gives the same invariant for Draw2's snapshot history.
   */
  async rebaseRemoteRasterOperation(
    command: EditorCommand,
    currentState: ProjectState,
  ): Promise<void> {
    if (!command.commandType.startsWith("raster.")) {
      throw new Error("Only raster operations can rebase Draw2 history.");
    }
    const rebase = async (snapshot: ProjectState): Promise<ProjectState> => {
      if (snapshot.appliedCommandIds.includes(command.commandId)) {
        return snapshot;
      }
      const nextClientSequence =
        (snapshot.lastClientSequenceByClient[command.clientId] ?? 0) + 1;
      const rebasedCommand = {
        ...command,
        projectId: snapshot.projectId,
        baseStructureEpoch: snapshot.structureEpoch,
        clientSequence: nextClientSequence,
      } as EditorCommand;
      const result = await new EditorCore(snapshot).execute(rebasedCommand);
      if (!result.ok) {
        throw new Error(
          `Remote history rebase failed: ${result.diagnostics[0]?.code ?? "unknown"}`,
        );
      }
      // The snapshot only needs a locally contiguous sequence while the
      // command is replayed. Restore the remote sequence afterwards so an
      // Undo followed by the next remote operation remains gap-free.
      return {
        ...result.state,
        lastClientSequenceByClient: {
          ...result.state.lastClientSequenceByClient,
          [command.clientId]: command.clientSequence,
        },
      };
    };
    const rebaseEntry = async (entry: HistoryEntry): Promise<HistoryEntry> => ({
      ...entry,
      before: await rebase(entry.before),
      after: await rebase(entry.after),
    });
    const [undo, redo] = await Promise.all([
      Promise.all(this.#undo.map(rebaseEntry)),
      Promise.all(this.#redo.map(rebaseEntry)),
    ]);
    this.#undo.splice(0, this.#undo.length, ...undo);
    this.#redo.splice(0, this.#redo.length, ...redo);
    this.#trim(this.#undo);
    this.#trim(this.#redo);
    this.#state = cloneProjectStateShared(currentState);
  }
  /** Rebase a compact remote selection transform without dropping local history. */
  async rebaseRemoteSelectionTransformOperation(
    command: SelectionTransformWireCommand,
    currentState: ProjectState,
  ): Promise<void> {
    const rebase = async (snapshot: ProjectState): Promise<ProjectState> => {
      if (snapshot.appliedCommandIds.includes(command.commandId)) {
        return snapshot;
      }
      const asset = snapshot.assets[command.assetId];
      if (asset === undefined) {
        throw new Error("Remote selection transform history rebase asset is missing.");
      }
      const nextClientSequence =
        (snapshot.lastClientSequenceByClient[command.clientId] ?? 0) + 1;
      const rebasedCommand: SelectionTransformWireCommand = {
        ...command,
        projectId: snapshot.projectId,
        baseStructureEpoch: snapshot.structureEpoch,
        clientSequence: nextClientSequence,
        payload: {
          ...command.payload,
          sourceRasterRevision: asset.revision,
          sourceStructureEpoch: snapshot.structureEpoch,
        },
      };
      const result = await applyCompactSelectionTransform(snapshot, rebasedCommand);
      if (!result.ok) {
        throw new Error(
          `Remote selection transform history rebase failed: ${result.diagnostics[0]?.code ?? "unknown"}`,
        );
      }
      return {
        ...result.state,
        lastClientSequenceByClient: {
          ...result.state.lastClientSequenceByClient,
          [command.clientId]: command.clientSequence,
        },
      };
    };
    const rebaseEntry = async (entry: HistoryEntry): Promise<HistoryEntry> => ({
      ...entry,
      before: await rebase(entry.before),
      after: await rebase(entry.after),
    });
    const [undo, redo] = await Promise.all([
      Promise.all(this.#undo.map(rebaseEntry)),
      Promise.all(this.#redo.map(rebaseEntry)),
    ]);
    this.#undo.splice(0, this.#undo.length, ...undo);
    this.#redo.splice(0, this.#redo.length, ...redo);
    this.#trim(this.#undo);
    this.#trim(this.#redo);
    this.#state = cloneProjectStateShared(currentState);
  }
  undo(): HistoryResult | undefined {
    const entry = this.#undo.pop();
    if (entry === undefined) return undefined;
    this.#redo.push(entry);
    this.#trim(this.#redo);
    this.#state = cloneProjectStateShared(entry.before);
    return { state: this.#state, actionId: entry.actionId, operationId: entry.operationId, direction: "UNDO", transport: "LOCAL_ONLY" };
  }
  redo(): HistoryResult | undefined {
    const entry = this.#redo.pop();
    if (entry === undefined) return undefined;
    this.#undo.push(entry);
    this.#trim(this.#undo);
    this.#state = cloneProjectStateShared(entry.after);
    return { state: this.#state, actionId: entry.actionId, operationId: entry.operationId, direction: "REDO", transport: "LOCAL_ONLY" };
  }
}

export interface UndoRedoHistorySnapshot {
  readonly undo: readonly HistoryEntry[];
  readonly redo: readonly HistoryEntry[];
}

export function selectionStructureSummary(state: ProjectState): { layers: readonly Draw2Layer[]; frames: readonly Draw2Frame[]; cels: readonly Draw2Cel[]; activeLayerId: string; activeFrameId: string; activeCelId: string } {
  return { layers: state.layers, frames: state.frames, cels: state.cels, activeLayerId: state.activeLayerId, activeFrameId: state.activeFrameId, activeCelId: state.activeCelId };
}
