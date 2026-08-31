/**
 * WP-170 Advanced Draw2 Tool Core.
 *
 * This file is intentionally independent from DOM, Canvas, Network, Storage, and UI.
 * It plans deterministic pixel writes and typed metadata operations. The editor adapter
 * is a separate lazy boundary; previews never mutate a canonical raster.
 */

import {
  asAssetId,
  asAssetRevisionId,
  asPackageId,
  calculateDependencySnapshotHash,
  canonicalJson,
  hashCanonical,
  type AssetId,
  type AssetReferenceMode,
  type AssetRevisionId,
  type ContentHash,
  type DependencyLockEntry,
  type DependencySnapshotHash,
  type PackageId,
} from "./wp160-contracts.ts";

export const WP170_SCHEMA_VERSION = 1 as const;

export type AdvancedToolId =
  | "pattern-brush"
  | "stamp"
  | "mirror"
  | "dither"
  | "palette-remap"
  | "tile-map"
  | "overlay";

export type AdvancedTransportClass = "LOCAL_ONLY" | "ACTIVE_SYNC" | "PLATFORM_EVENT" | "ASYNC_ON_DEMAND";

export interface AdvancedDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export type AdvancedResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly AdvancedDiagnostic[] };

function success<T>(value: T): AdvancedResult<T> { return { ok: true, value }; }
function failure<T>(code: string, message: string, path?: string): AdvancedResult<T> {
  return { ok: false, diagnostics: [{ code, message, ...(path === undefined ? {} : { path }) }] };
}

function requireString(value: string, code: string, path: string): AdvancedDiagnostic | undefined {
  return typeof value === "string" && value.trim().length > 0 ? undefined : { code, message: "A stable non-empty identifier is required.", path };
}

function stableDigest(value: unknown): string {
  const text = canonicalJson(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `wp170_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stableWriteDigest(writes: readonly PixelWrite[]): string {
  let hash = 2166136261;
  for (const write of writes) {
    hash ^= write.x;
    hash = Math.imul(hash, 16777619);
    hash ^= write.y;
    hash = Math.imul(hash, 16777619);
    hash ^= write.colorIndex;
    hash = Math.imul(hash, 16777619);
  }
  hash ^= writes.length;
  return `wp170_write_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export interface PixelPoint { readonly x: number; readonly y: number; }
export interface PixelWrite extends PixelPoint { readonly colorIndex: number; }
export interface PixelRect extends PixelPoint { readonly width: number; readonly height: number; readonly assetId?: string; }

export interface CanonicalPixelTarget {
  readonly assetId: string;
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly palette: readonly number[];
  readPixel(x: number, y: number): number;
}

export interface AdvancedOperation {
  readonly operationId: string;
  readonly schemaVersion: 1;
  readonly toolId: AdvancedToolId;
  readonly operationType: string;
  readonly previewOnly: boolean;
  readonly writes: readonly PixelWrite[];
  readonly affectedRegions: readonly PixelRect[];
  readonly dirtyTiles: readonly string[];
  readonly transportClass: AdvancedTransportClass;
  readonly undoBoundary: "ATOMIC" | "NONE";
  readonly inputFingerprint: string;
  readonly workerCandidate?: "MEASURE_AFTER_BOUNDARY";
}

export interface ToolSession {
  readonly sessionId: string;
  readonly toolId: AdvancedToolId;
  readonly status: "PREVIEW" | "CANCELLED" | "COMMITTED";
  readonly preview: AdvancedOperation;
}

function validTarget(target: CanonicalPixelTarget): AdvancedDiagnostic[] {
  const diagnostics: AdvancedDiagnostic[] = [];
  if (!Number.isSafeInteger(target.width) || target.width < 1) diagnostics.push({ code: "TARGET_WIDTH_INVALID", message: "Target width must be a positive safe integer.", path: "target.width" });
  if (!Number.isSafeInteger(target.height) || target.height < 1) diagnostics.push({ code: "TARGET_HEIGHT_INVALID", message: "Target height must be a positive safe integer.", path: "target.height" });
  if (!Number.isSafeInteger(target.tileSize) || target.tileSize < 1) diagnostics.push({ code: "TARGET_TILE_SIZE_INVALID", message: "Target tileSize must be a positive safe integer.", path: "target.tileSize" });
  if (target.palette.length < 1 || target.palette.length > 256) diagnostics.push({ code: "PALETTE_LENGTH_INVALID", message: "Indexed palette must contain 1 through 256 entries.", path: "target.palette" });
  return diagnostics;
}

function inBounds(target: CanonicalPixelTarget, point: PixelPoint): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < target.width && point.y < target.height;
}

function deduplicateWrites(writes: readonly PixelWrite[], targetWidth: number): AdvancedResult<readonly PixelWrite[]> {
  const numericKeySafe = Number.isSafeInteger(targetWidth) && targetWidth > 0 && writes.every((write) => Number.isSafeInteger(write.y * targetWidth + write.x));
  if (numericKeySafe) {
    const byPoint = new Map<number, PixelWrite>();
    for (const write of writes) {
      if (!Number.isSafeInteger(write.x) || !Number.isSafeInteger(write.y) || !Number.isSafeInteger(write.colorIndex)) return failure("WRITE_INTEGER_INVALID", "Pixel writes require safe integer coordinates and color indexes.");
      const key = write.y * targetWidth + write.x;
      const previous = byPoint.get(key);
      if (previous !== undefined && previous.colorIndex !== write.colorIndex) return failure("WRITE_COLOR_CONFLICT", "Two deterministic writes target the same pixel with different colors.", String(key));
      byPoint.set(key, write);
    }
    return success([...byPoint.entries()].sort(([left], [right]) => left - right).map(([, write]) => write));
  }
  const byPoint = new Map<string, PixelWrite>();
  for (const write of writes) {
    if (!Number.isSafeInteger(write.x) || !Number.isSafeInteger(write.y) || !Number.isSafeInteger(write.colorIndex)) return failure("WRITE_INTEGER_INVALID", "Pixel writes require safe integer coordinates and color indexes.");
    const key = `${write.x}:${write.y}`;
    const previous = byPoint.get(key);
    if (previous !== undefined && previous.colorIndex !== write.colorIndex) return failure("WRITE_COLOR_CONFLICT", "Two deterministic writes target the same pixel with different colors.", key);
    byPoint.set(key, write);
  }
  return success([...byPoint.values()].sort((left, right) => left.y - right.y || left.x - right.x || left.colorIndex - right.colorIndex));
}

function operationFromWrites(
  target: CanonicalPixelTarget,
  toolId: AdvancedToolId,
  operationType: string,
  writes: readonly PixelWrite[],
  input: unknown,
  previewOnly: boolean,
  transportClass: AdvancedTransportClass,
  clipMode: "CLIP" | "REJECT" = "CLIP",
  writesAlreadyCanonical = false,
): AdvancedResult<AdvancedOperation> {
  const targetDiagnostics = validTarget(target);
  if (targetDiagnostics.length > 0) return { ok: false, diagnostics: targetDiagnostics };
  const clipped: PixelWrite[] = [];
  for (const write of writes) {
    if (!Number.isSafeInteger(write.colorIndex) || write.colorIndex < 0 || write.colorIndex >= target.palette.length) return failure("PALETTE_INDEX_INVALID", "Pixel write references an unavailable palette index.", "colorIndex");
    if (!inBounds(target, write)) {
      if (clipMode === "REJECT") return failure("WRITE_OUT_OF_BOUNDS", "Operation would write outside the target and was rejected.");
      continue;
    }
    clipped.push(write);
  }
  const deduplicated = writesAlreadyCanonical ? success<readonly PixelWrite[]>(clipped) : deduplicateWrites(clipped, target.width);
  if (!deduplicated.ok) return deduplicated;
  const normalized = deduplicated.value;
  const dirtyTiles = new Set<string>();
  for (const write of normalized) dirtyTiles.add(`${target.assetId}:${Math.floor(write.x / target.tileSize)}:${Math.floor(write.y / target.tileSize)}`);
  let minX = 0; let minY = 0; let maxX = 0; let maxY = 0;
  if (normalized.length > 0) {
    minX = normalized[0]?.x ?? 0; minY = normalized[0]?.y ?? 0; maxX = minX; maxY = minY;
    for (const write of normalized) { minX = Math.min(minX, write.x); minY = Math.min(minY, write.y); maxX = Math.max(maxX, write.x); maxY = Math.max(maxY, write.y); }
  }
  const affectedRegions = normalized.length === 0 ? [] : [{ assetId: target.assetId, x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }];
  const inputFingerprint = stableDigest(input);
  return success({
    operationId: stableDigest({ toolId, operationType, previewOnly, writeSetFingerprint: stableWriteDigest(normalized), inputFingerprint }),
    schemaVersion: WP170_SCHEMA_VERSION,
    toolId,
    operationType,
    previewOnly,
    writes: normalized,
    affectedRegions,
    dirtyTiles: [...dirtyTiles].sort(),
    transportClass,
    undoBoundary: previewOnly ? "NONE" : "ATOMIC",
    inputFingerprint,
  });
}

function linePoints(from: PixelPoint, to: PixelPoint): readonly PixelPoint[] {
  const points: PixelPoint[] = [];
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - from.x);
  const sx = from.x < to.x ? 1 : -1;
  const dy = -Math.abs(to.y - from.y);
  const sy = from.y < to.y ? 1 : -1;
  let error = dx + dy;
  while (true) {
    points.push({ x, y });
    if (x === to.x && y === to.y) break;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
  return points;
}

function interpolatePath(points: readonly PixelPoint[]): readonly PixelPoint[] {
  if (points.length === 0) return [];
  const result: PixelPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point === undefined) continue;
    const previous = points[index - 1];
    const segment = previous === undefined ? [point] : linePoints(previous, point);
    result.push(...segment);
  }
  const unique = new Map<string, PixelPoint>();
  for (const point of result) unique.set(`${point.x}:${point.y}`, point);
  return [...unique.values()];
}

export type PatternRepeat = "SINGLE" | "REPEAT_X" | "REPEAT_Y" | "REPEAT_XY";
export type TransparentPixelPolicy = "SKIP" | "WRITE_TRANSPARENT";
export interface PatternSource {
  readonly width: number;
  readonly height: number;
  readonly pixels: readonly number[];
  readonly palette: readonly number[];
  readonly transparentIndex: 0;
}
export interface PatternBrushOptions {
  readonly anchorX: number;
  readonly anchorY: number;
  readonly repeat: PatternRepeat;
  readonly transparent: TransparentPixelPolicy;
  readonly clipping: "CLIP" | "REJECT";
}

function validatePattern(pattern: PatternSource): AdvancedDiagnostic[] {
  const diagnostics: AdvancedDiagnostic[] = [];
  if (!Number.isSafeInteger(pattern.width) || pattern.width < 1 || !Number.isSafeInteger(pattern.height) || pattern.height < 1) diagnostics.push({ code: "PATTERN_DIMENSIONS_INVALID", message: "Pattern dimensions must be positive safe integers." });
  if (pattern.pixels.length !== pattern.width * pattern.height) diagnostics.push({ code: "PATTERN_PIXEL_COUNT_INVALID", message: "Pattern pixels must exactly match width × height." });
  if (pattern.palette.length < 1 || pattern.palette.length > 256) diagnostics.push({ code: "PATTERN_PALETTE_INVALID", message: "Pattern palette must contain 1 through 256 entries." });
  for (const index of pattern.pixels) if (!Number.isSafeInteger(index) || index < 0 || index >= pattern.palette.length) diagnostics.push({ code: "PATTERN_INDEX_INVALID", message: "Pattern contains an unavailable palette index.", path: "pixels" });
  return diagnostics;
}

export function planPatternBrushStroke(
  target: CanonicalPixelTarget,
  pointerSamples: readonly PixelPoint[],
  pattern: PatternSource,
  options: PatternBrushOptions,
): AdvancedResult<AdvancedOperation> {
  const patternDiagnostics = validatePattern(pattern);
  if (patternDiagnostics.length > 0) return { ok: false, diagnostics: patternDiagnostics };
  const path = interpolatePath(pointerSamples);
  const centers = options.repeat === "SINGLE" ? path.slice(0, 1) : path;
  const writes: PixelWrite[] = [];
  const seenOrigins = new Set<string>();
  for (const center of centers) {
    const repeatsX = options.repeat === "REPEAT_X" || options.repeat === "REPEAT_XY";
    const repeatsY = options.repeat === "REPEAT_Y" || options.repeat === "REPEAT_XY";
    const originX = repeatsX ? Math.floor((center.x - options.anchorX) / pattern.width) * pattern.width : center.x - options.anchorX;
    const originY = repeatsY ? Math.floor((center.y - options.anchorY) / pattern.height) * pattern.height : center.y - options.anchorY;
    const originKey = `${originX}:${originY}`;
    if (seenOrigins.has(originKey)) continue;
    seenOrigins.add(originKey);
    for (let patternY = 0; patternY < pattern.height; patternY += 1) {
      for (let patternX = 0; patternX < pattern.width; patternX += 1) {
        const sourceIndex = pattern.pixels[patternY * pattern.width + patternX] ?? 0;
        if (sourceIndex === pattern.transparentIndex && options.transparent === "SKIP") continue;
        writes.push({ x: originX + patternX, y: originY + patternY, colorIndex: sourceIndex });
      }
    }
  }
  return operationFromWrites(target, "pattern-brush", "raster.patternBrushCommit", writes, { pointerSamples, pattern, options }, false, "ACTIVE_SYNC", options.clipping);
}

export interface StampOptions {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly transparent: TransparentPixelPolicy;
  readonly paletteCompatibility: "EXACT" | "REMAP_NEAREST" | "REJECT";
  readonly clipping: "CLIP" | "REJECT";
}
export interface StampPlan {
  readonly session: ToolSession;
  readonly commit: AdvancedOperation;
}

function paletteDistance(left: number, right: number): number {
  const lr = (left >>> 24) & 0xff; const lg = (left >>> 16) & 0xff; const lb = (left >>> 8) & 0xff; const la = left & 0xff;
  const rr = (right >>> 24) & 0xff; const rg = (right >>> 16) & 0xff; const rb = (right >>> 8) & 0xff; const ra = right & 0xff;
  return (lr - rr) ** 2 + (lg - rg) ** 2 + (lb - rb) ** 2 + (la - ra) ** 2;
}

function resolveStampIndex(sourceIndex: number, sourcePalette: readonly number[], targetPalette: readonly number[], mode: StampOptions["paletteCompatibility"]): number | AdvancedDiagnostic {
  if (sourceIndex === 0) return 0;
  if (mode === "EXACT") {
    if (sourceIndex >= targetPalette.length || sourcePalette[sourceIndex] !== targetPalette[sourceIndex]) return { code: "STAMP_PALETTE_INCOMPATIBLE", message: "Stamp requires an exact palette compatibility match." };
    return sourceIndex;
  }
  if (mode === "REJECT") {
    if (sourceIndex >= targetPalette.length) return { code: "STAMP_PALETTE_OVERFLOW", message: "Stamp palette index is unavailable in the target palette." };
    return sourceIndex;
  }
  const sourceColor = sourcePalette[sourceIndex];
  if (sourceColor === undefined) return { code: "STAMP_SOURCE_COLOR_MISSING", message: "Stamp source color is missing." };
  let bestIndex = 0; let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < targetPalette.length; index += 1) {
    const distance = paletteDistance(sourceColor, targetPalette[index] ?? 0);
    if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
  }
  return bestIndex;
}

export function planStamp(target: CanonicalPixelTarget, stamp: PatternSource, options: StampOptions): AdvancedResult<StampPlan> {
  const diagnostics = validatePattern(stamp);
  if (!Number.isSafeInteger(options.scale) || options.scale < 1 || options.scale > 16) diagnostics.push({ code: "STAMP_SCALE_INVALID", message: "Stamp scale must be an integer from 1 through 16." });
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  const writes: PixelWrite[] = [];
  for (let sourceY = 0; sourceY < stamp.height; sourceY += 1) for (let sourceX = 0; sourceX < stamp.width; sourceX += 1) {
    const sourceIndex = stamp.pixels[sourceY * stamp.width + sourceX] ?? 0;
    if (sourceIndex === 0 && options.transparent === "SKIP") continue;
    const resolved = resolveStampIndex(sourceIndex, stamp.palette, target.palette, options.paletteCompatibility);
    if (typeof resolved !== "number") return { ok: false, diagnostics: [resolved] };
    for (let dy = 0; dy < options.scale; dy += 1) for (let dx = 0; dx < options.scale; dx += 1) writes.push({ x: options.x + sourceX * options.scale + dx, y: options.y + sourceY * options.scale + dy, colorIndex: resolved });
  }
  const previewResult = operationFromWrites(target, "stamp", "raster.stampPreview", writes, { stamp, options }, true, "LOCAL_ONLY", options.clipping);
  if (!previewResult.ok) return previewResult;
  const commitResult = operationFromWrites(target, "stamp", "raster.stampCommit", writes, { stamp, options }, false, "ACTIVE_SYNC", options.clipping);
  if (!commitResult.ok) return commitResult;
  return success({
    session: { sessionId: stableDigest({ stamp, options }), toolId: "stamp", status: "PREVIEW", preview: previewResult.value },
    commit: commitResult.value,
  });
}

export function cancelToolSession(session: ToolSession): ToolSession { return { ...session, status: "CANCELLED" }; }
export function commitToolSession(session: ToolSession, commit: AdvancedOperation): AdvancedResult<AdvancedOperation> {
  if (session.status !== "PREVIEW") return failure("TOOL_SESSION_NOT_PREVIEW", "Only a live preview session can be committed.");
  if (commit.previewOnly || commit.toolId !== session.toolId) return failure("TOOL_SESSION_COMMIT_MISMATCH", "Commit must match the non-preview operation for the session.");
  return success(commit);
}

export interface MirrorOptions {
  readonly horizontal: boolean;
  readonly vertical: boolean;
  readonly axisX2?: number;
  readonly axisY2?: number;
  readonly clipping: "CLIP" | "REJECT";
}

export function planMirror(target: CanonicalPixelTarget, sourceWrites: readonly PixelWrite[], options: MirrorOptions): AdvancedResult<AdvancedOperation> {
  if (!options.horizontal && !options.vertical) return failure("MIRROR_AXIS_MISSING", "At least one mirror axis must be enabled.");
  const writes: PixelWrite[] = [];
  for (const source of sourceWrites) {
    const x = options.horizontal ? (options.axisX2 ?? target.width - 1) - source.x : source.x;
    const y = options.vertical ? (options.axisY2 ?? target.height - 1) - source.y : source.y;
    writes.push({ x, y, colorIndex: source.colorIndex });
  }
  return operationFromWrites(target, "mirror", "raster.mirrorCommit", writes, { sourceWrites, options }, false, "ACTIVE_SYNC", options.clipping);
}

export interface DitherPreset {
  readonly presetId: "BAYER_2X2" | "BAYER_4X4";
  readonly version: 1;
  readonly matrix: readonly (readonly number[])[];
}
export const DITHER_PRESETS: Readonly<Record<DitherPreset["presetId"], DitherPreset>> = Object.freeze({
  BAYER_2X2: Object.freeze({ presetId: "BAYER_2X2", version: 1, matrix: [[0, 2], [3, 1]] }),
  BAYER_4X4: Object.freeze({ presetId: "BAYER_4X4", version: 1, matrix: [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]] }),
});
export interface DitherOptions {
  readonly region: PixelRect;
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly amount: number;
  readonly preset: DitherPreset;
  readonly clipping: "CLIP" | "REJECT";
  readonly cancelRequested?: () => boolean;
}

export function planDither(target: CanonicalPixelTarget, options: DitherOptions, previewOnly = false): AdvancedResult<AdvancedOperation> {
  if (!Number.isInteger(options.amount) || options.amount < 0 || options.amount > 255) return failure("DITHER_AMOUNT_INVALID", "Dither amount must be an integer from 0 through 255.");
  if (options.preset.version !== 1 || options.preset.matrix.length === 0) return failure("DITHER_PRESET_UNSUPPORTED", "Dither preset version or matrix is unsupported.");
  if (options.fromIndex < 0 || options.fromIndex >= target.palette.length || options.toIndex < 0 || options.toIndex >= target.palette.length) return failure("DITHER_PALETTE_INDEX_INVALID", "Dither palette indexes are unavailable.");
  const writes: PixelWrite[] = [];
  const matrix = options.preset.matrix;
  const matrixSize = matrix.length;
  for (let y = options.region.y; y < options.region.y + options.region.height; y += 1) {
    if (options.cancelRequested?.() === true) return failure("DITHER_CANCELLED", "Dither was cancelled before canonical mutation.");
    for (let x = options.region.x; x < options.region.x + options.region.width; x += 1) {
    if (!inBounds(target, { x, y })) { if (options.clipping === "REJECT") return failure("DITHER_REGION_OUT_OF_BOUNDS", "Dither region exceeds the target."); continue; }
    if (target.readPixel(x, y) !== options.fromIndex) continue;
    const threshold = ((matrix[y % matrixSize]?.[x % (matrix[y % matrixSize]?.length ?? 1)] ?? 0) + 1) * 255 / ((matrixSize * (matrix[y % matrixSize]?.length ?? matrixSize)));
    if (threshold <= options.amount) writes.push({ x, y, colorIndex: options.toIndex });
    }
  }
  const result = operationFromWrites(target, "dither", previewOnly ? "raster.ditherPreview" : "raster.ditherCommit", writes, { options }, previewOnly, previewOnly ? "LOCAL_ONLY" : "ACTIVE_SYNC", options.clipping, true);
  if (!result.ok) return result;
  return success(writes.length > 4096 ? { ...result.value, workerCandidate: "MEASURE_AFTER_BOUNDARY" } : result.value);
}

export interface GridState { readonly enabled: boolean; readonly spacingX: number; readonly spacingY: number; readonly originX: number; readonly originY: number; readonly mode: "PIXEL" | "CUSTOM"; }
export interface RulerState { readonly enabled: boolean; readonly unit: "PIXEL" | "CANVAS"; }
export interface Guide { readonly guideId: string; readonly orientation: "HORIZONTAL" | "VERTICAL"; readonly position: number; readonly visible: boolean; readonly shared: boolean; }
export interface ReferenceImage { readonly referenceId: string; readonly assetId: AssetId; readonly revisionId: AssetRevisionId; readonly x: number; readonly y: number; readonly scale: number; readonly opacity: number; readonly visible: boolean; readonly locked: boolean; readonly scope: "LOCAL" | "SHARED"; }
export interface SliceMetadata { readonly sliceId: string; readonly name: string; readonly rect: PixelRect; readonly pivot: PixelPoint; readonly nineSlice?: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }; readonly frameId?: string; }
export interface OverlayState { readonly grid: GridState; readonly ruler: RulerState; readonly guides: readonly Guide[]; readonly references: readonly ReferenceImage[]; readonly slices: readonly SliceMetadata[]; readonly toolPreviewId?: string; }
export type OverlayDomain = "GRID" | "RULER" | "GUIDE" | "REFERENCE" | "SLICE" | "TOOL_PREVIEW";

export function defaultOverlayState(): OverlayState {
  return { grid: { enabled: false, spacingX: 1, spacingY: 1, originX: 0, originY: 0, mode: "PIXEL" }, ruler: { enabled: false, unit: "PIXEL" }, guides: [], references: [], slices: [] };
}
export function overlayProjectionHash(state: OverlayState): string { return stableDigest(state); }
export function toggleGrid(state: OverlayState, enabled: boolean): { readonly state: OverlayState; readonly invalidated: readonly OverlayDomain[] } {
  return { state: { ...state, grid: { ...state.grid, enabled } }, invalidated: ["GRID"] };
}
export function computeOverlayInvalidation(before: OverlayState, after: OverlayState): readonly OverlayDomain[] {
  const domains: OverlayDomain[] = [];
  if (canonicalJson(before.grid) !== canonicalJson(after.grid)) domains.push("GRID");
  if (canonicalJson(before.ruler) !== canonicalJson(after.ruler)) domains.push("RULER");
  if (canonicalJson(before.guides) !== canonicalJson(after.guides)) domains.push("GUIDE");
  if (canonicalJson(before.references) !== canonicalJson(after.references)) domains.push("REFERENCE");
  if (canonicalJson(before.slices) !== canonicalJson(after.slices)) domains.push("SLICE");
  if (before.toolPreviewId !== after.toolPreviewId) domains.push("TOOL_PREVIEW");
  return domains;
}
export function addGuide(state: OverlayState, guide: Guide): AdvancedResult<OverlayState> {
  const idError = requireString(guide.guideId, "GUIDE_ID_INVALID", "guideId");
  if (idError !== undefined) return { ok: false, diagnostics: [idError] };
  if (state.guides.some((item) => item.guideId === guide.guideId)) return failure("GUIDE_DUPLICATE", "Guide identity is already present.", "guideId");
  if (!Number.isFinite(guide.position)) return failure("GUIDE_POSITION_INVALID", "Guide position must be finite.", "position");
  return success({ ...state, guides: [...state.guides, guide] });
}
export function validateReferenceImage(input: Partial<ReferenceImage> & { readonly externalUrl?: string }): AdvancedResult<ReferenceImage> {
  if (input.externalUrl !== undefined) return failure("REFERENCE_EXTERNAL_URL_FORBIDDEN", "Reference images must use an owned Asset/Revision boundary, not an external URL.");
  if (input.referenceId === undefined || input.assetId === undefined || input.revisionId === undefined) return failure("REFERENCE_IDENTITY_REQUIRED", "Reference identity and immutable Asset Revision are required.");
  if (typeof input.opacity !== "number" || !Number.isFinite(input.opacity) || input.opacity < 0 || input.opacity > 1) return failure("REFERENCE_OPACITY_INVALID", "Reference opacity must be between 0 and 1.");
  if (typeof input.scale !== "number" || !Number.isFinite(input.scale) || input.scale <= 0) return failure("REFERENCE_SCALE_INVALID", "Reference scale must be positive.");
  return success(input as ReferenceImage);
}

export interface AdvancedPalette { readonly version: 1; readonly colors: readonly number[]; }
export function validateAdvancedPalette(palette: AdvancedPalette): AdvancedResult<AdvancedPalette> {
  if (palette.version !== 1) return failure("PALETTE_SCHEMA_UNSUPPORTED", "Only palette schema version 1 is supported.");
  if (palette.colors.length < 1 || palette.colors.length > 256) return failure("PALETTE_OVERFLOW", "Indexed Palette cannot exceed 256 entries.");
  if (palette.colors[0] !== 0) return failure("TRANSPARENT_INDEX_PROTECTED", "Palette index 0 is reserved for transparent pixels.");
  if (palette.colors.some((color) => !Number.isSafeInteger(color) || color < 0 || color > 0xffffffff)) return failure("PALETTE_COLOR_INVALID", "Palette colors must be uint32 values.");
  return success(palette);
}
export function planPaletteRemap(target: CanonicalPixelTarget, palette: AdvancedPalette, newOrder: readonly number[]): AdvancedResult<{ readonly palette: AdvancedPalette; readonly operation: AdvancedOperation }> {
  const paletteCheck = validateAdvancedPalette(palette);
  if (!paletteCheck.ok) return paletteCheck;
  if (newOrder.length !== palette.colors.length || newOrder[0] !== 0 || new Set(newOrder).size !== newOrder.length || newOrder.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= palette.colors.length)) return failure("PALETTE_REORDER_INVALID", "Palette reorder must be a complete permutation with transparent index 0 fixed.");
  const oldToNew = new Map<number, number>();
  newOrder.forEach((oldIndex, newIndex) => oldToNew.set(oldIndex, newIndex));
  const writes: PixelWrite[] = [];
  for (let y = 0; y < target.height; y += 1) for (let x = 0; x < target.width; x += 1) {
    const oldIndex = target.readPixel(x, y); const newIndex = oldToNew.get(oldIndex);
    if (newIndex === undefined) return failure("PALETTE_REMAP_SOURCE_INVALID", "Raster references a color outside the palette.", `${x}:${y}`);
    if (newIndex !== oldIndex) writes.push({ x, y, colorIndex: newIndex });
  }
  const operation = operationFromWrites(target, "palette-remap", "palette.reorderAndRemap", writes, { palette, newOrder }, false, "ACTIVE_SYNC", "REJECT");
  if (!operation.ok) return operation;
  return success({ palette: { version: 1, colors: newOrder.map((oldIndex) => palette.colors[oldIndex] ?? 0) }, operation: operation.value });
}
export function addPaletteColor(palette: AdvancedPalette, color: number): AdvancedResult<AdvancedPalette> {
  const check = validateAdvancedPalette(palette); if (!check.ok) return check;
  if (palette.colors.length >= 256) return failure("PALETTE_OVERFLOW", "Cannot add a color beyond indexed palette capacity.");
  if (!Number.isSafeInteger(color) || color < 0 || color > 0xffffffff) return failure("PALETTE_COLOR_INVALID", "Palette color must be a uint32 value.");
  return success({ version: 1, colors: [...palette.colors, color] });
}
export function removePaletteColor(palette: AdvancedPalette, index: number): AdvancedResult<AdvancedPalette> {
  const check = validateAdvancedPalette(palette); if (!check.ok) return check;
  if (index <= 0 || index >= palette.colors.length) return failure("TRANSPARENT_INDEX_PROTECTED", "Transparent index 0 cannot be removed and the index must exist.");
  return success({ version: 1, colors: palette.colors.filter((_, candidate) => candidate !== index) });
}

export interface FrameIdentity { readonly frameId: string; }
export interface AnimationTag { readonly tagId: string; readonly name: string; readonly startFrameId: string; readonly endFrameId: string; readonly order: number; readonly direction: "FORWARD" | "REVERSE" | "PING_PONG"; readonly metadata?: Readonly<Record<string, string>>; }
export function validateAnimationTags(tags: readonly AnimationTag[], frames: readonly FrameIdentity[]): AdvancedResult<readonly AnimationTag[]> {
  const frameIds = new Set(frames.map((frame) => frame.frameId)); const tagIds = new Set<string>();
  for (const tag of tags) {
    if (tagIds.has(tag.tagId)) return failure("ANIMATION_TAG_DUPLICATE", "Animation tag IDs must be unique.", "tagId");
    tagIds.add(tag.tagId);
    if (!frameIds.has(tag.startFrameId) || !frameIds.has(tag.endFrameId)) return failure("ANIMATION_TAG_FRAME_MISSING", "Animation tag references a deleted or unknown Frame identity.");
    if (!Number.isSafeInteger(tag.order) || tag.order < 0) return failure("ANIMATION_TAG_ORDER_INVALID", "Animation tag order must be a non-negative safe integer.");
  }
  return success([...tags].sort((left, right) => left.order - right.order || left.tagId.localeCompare(right.tagId)));
}
export function validateSlice(slice: SliceMetadata, target: Pick<CanonicalPixelTarget, "width" | "height">, frameIds: ReadonlySet<string>): AdvancedResult<SliceMetadata> {
  const idError = requireString(slice.sliceId, "SLICE_ID_INVALID", "sliceId"); if (idError !== undefined) return { ok: false, diagnostics: [idError] };
  if (!Number.isSafeInteger(slice.rect.x) || !Number.isSafeInteger(slice.rect.y) || !Number.isSafeInteger(slice.rect.width) || !Number.isSafeInteger(slice.rect.height) || slice.rect.width < 1 || slice.rect.height < 1 || slice.rect.x < 0 || slice.rect.y < 0 || slice.rect.x + slice.rect.width > target.width || slice.rect.y + slice.rect.height > target.height) return failure("SLICE_BOUNDS_INVALID", "Slice bounds must be a positive rectangle inside the target.");
  if (slice.frameId !== undefined && !frameIds.has(slice.frameId)) return failure("SLICE_FRAME_MISSING", "Slice references a deleted or unknown Frame identity.");
  return success(slice);
}

export interface TileAsset { readonly tileAssetId: string; readonly revisionId: string; readonly width: number; readonly height: number; readonly contentHash: string; readonly dependsOnTileAssetIds: readonly string[]; }
export interface TilePlacement { readonly placementId: string; readonly tileAssetId: string; readonly mapX: number; readonly mapY: number; readonly layerId: string; readonly transform: "NONE" | "FLIP_X" | "FLIP_Y" | "ROTATE_90"; readonly collisionMetadata?: Readonly<Record<string, string>>; }
export interface TileMapState { readonly mapId: string; readonly width: number; readonly height: number; readonly placements: readonly TilePlacement[]; readonly referenceMode: AssetReferenceMode; }
export function validateTileMap(map: TileMapState, assets: readonly TileAsset[]): AdvancedResult<TileMapState> {
  const byId = new Map(assets.map((asset) => [asset.tileAssetId, asset])); const placements = new Set<string>();
  for (const placement of map.placements) {
    if (placements.has(placement.placementId)) return failure("TILE_PLACEMENT_DUPLICATE", "Tile placement identity must be unique.");
    placements.add(placement.placementId);
    const asset = byId.get(placement.tileAssetId);
    if (asset === undefined) return failure("TILE_ASSET_MISSING", "Tile Map placement references a missing Tile Asset.");
    if (placement.mapX < 0 || placement.mapY < 0 || placement.mapX >= map.width || placement.mapY >= map.height) return failure("TILE_PLACEMENT_BOUNDS_INVALID", "Tile placement is outside the map bounds.");
    if (asset.width < 1 || asset.height < 1) return failure("TILE_DIMENSIONS_INVALID", "Tile dimensions must be positive.");
  }
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string): AdvancedDiagnostic | undefined => {
    if (visiting.has(id)) return { code: "TILE_DEPENDENCY_CYCLE", message: "Tile Asset dependency cycle detected." };
    if (visited.has(id)) return undefined;
    const asset = byId.get(id); if (asset === undefined) return { code: "TILE_ASSET_MISSING", message: "Tile dependency references a missing asset." };
    visiting.add(id); for (const dependency of asset.dependsOnTileAssetIds) { const error = visit(dependency); if (error !== undefined) return error; }
    visiting.delete(id); visited.add(id); return undefined;
  };
  for (const asset of assets) { const error = visit(asset.tileAssetId); if (error !== undefined) return { ok: false, diagnostics: [error] }; }
  return success(map);
}

export interface GameAssetMetadata {
  readonly assetRole: "SPRITE" | "TILE" | "BACKGROUND" | "UI" | "EFFECT";
  readonly pivot: PixelPoint;
  readonly collisionHint: "NONE" | "RECTANGLE" | "MASK";
  readonly animationTagIds: readonly string[];
  readonly sliceIds: readonly string[];
  readonly tileAssetId?: string;
  readonly playbackDefaults: { readonly fps: number; readonly loop: boolean; readonly tagId?: string };
}
const GAME_METADATA_KEYS = new Set(["assetRole", "pivot", "collisionHint", "animationTagIds", "sliceIds", "tileAssetId", "playbackDefaults"]);
export function validateGameAssetMetadata(input: Record<string, unknown>): AdvancedResult<GameAssetMetadata> {
  const unknown = Object.keys(input).filter((key) => !GAME_METADATA_KEYS.has(key));
  if (unknown.length > 0) return failure("GAME_METADATA_UNKNOWN_FIELD", "Unknown Game Asset Metadata must be reviewed instead of silently ignored.", unknown[0]);
  const metadata = input as unknown as GameAssetMetadata;
  if (!Number.isSafeInteger(metadata.playbackDefaults?.fps) || metadata.playbackDefaults.fps < 1 || metadata.playbackDefaults.fps > 1000) return failure("GAME_METADATA_FPS_INVALID", "Playback FPS must be a bounded integer.");
  if (!Number.isSafeInteger(metadata.pivot?.x) || !Number.isSafeInteger(metadata.pivot?.y)) return failure("GAME_METADATA_PIVOT_INVALID", "Game Asset pivot must use integer coordinates.");
  return success(metadata);
}

export interface PackageAssetInput extends DependencyLockEntry { readonly authorized: boolean; readonly quarantined: boolean; }
export type PackageKind = "DRAW_ASSET" | "FINISHED_PRODUCT" | "INTEGRATED_PROJECT";
export type SaleKind = "MATERIAL" | "FINISHED_PRODUCT";
export interface MarketPackagePreparationInput {
  readonly packageId: PackageId;
  readonly packageVersion: string;
  readonly packageKind: PackageKind;
  readonly saleKind: SaleKind;
  readonly dependencies: readonly PackageAssetInput[];
  readonly previewCandidates: readonly string[];
  readonly compatibility: readonly string[];
  readonly metadata: Readonly<Record<string, string>>;
  readonly [key: string]: unknown;
}
export interface MarketPackagePreparation {
  readonly packageId: PackageId;
  readonly packageVersion: string;
  readonly packageKind: PackageKind;
  readonly saleKind: SaleKind;
  readonly dependencySnapshotHash: DependencySnapshotHash;
  readonly integrityHash: ContentHash;
  readonly includedAssetIds: readonly AssetId[];
  readonly previewCandidates: readonly string[];
  readonly compatibility: readonly string[];
  readonly metadata: Readonly<Record<string, string>>;
  readonly publishState: "PREPARATION_ONLY";
}
export async function prepareMarketPackage(input: MarketPackagePreparationInput): Promise<AdvancedResult<MarketPackagePreparation>> {
  const forbidden = ["price", "fee", "royalty", "purchase", "publish"].find((key) => Object.prototype.hasOwnProperty.call(input, key));
  if (forbidden !== undefined) return failure("PACKAGE_FINANCIAL_OR_PUBLISH_FIELD", "WP-170 package preparation cannot contain sale, financial, entitlement, or publish fields.", forbidden);
  if (input.dependencies.length === 0) return failure("PACKAGE_DEPENDENCY_EMPTY", "A package must declare at least one immutable dependency.");
  for (const dependency of input.dependencies) {
    if (!dependency.authorized) return failure("PACKAGE_UNAUTHORIZED_DEPENDENCY", "Unauthorized package dependency was rejected.", dependency.assetId);
    if (dependency.quarantined) return failure("PACKAGE_QUARANTINED_DEPENDENCY", "Quarantined package dependency was rejected.", dependency.assetId);
  }
  const entries = input.dependencies.map(({ authorized: _authorized, quarantined: _quarantined, ...entry }) => entry);
  const dependencySnapshotHash = await calculateDependencySnapshotHash(input.packageId, input.packageVersion, entries);
  const integrityHash = await hashCanonical({ packageId: input.packageId, packageVersion: input.packageVersion, packageKind: input.packageKind, saleKind: input.saleKind, entries, previewCandidates: input.previewCandidates, compatibility: input.compatibility, metadata: input.metadata, dependencySnapshotHash });
  return success({ packageId: input.packageId, packageVersion: input.packageVersion, packageKind: input.packageKind, saleKind: input.saleKind, dependencySnapshotHash, integrityHash, includedAssetIds: entries.map((entry) => entry.assetId), previewCandidates: [...input.previewCandidates], compatibility: [...input.compatibility], metadata: input.metadata, publishState: "PREPARATION_ONLY" });
}

export function assertStableAssetIds(assetId: string, revisionId: string, packageId: string): AdvancedResult<{ readonly assetId: AssetId; readonly revisionId: AssetRevisionId; readonly packageId: PackageId }> {
  try { return success({ assetId: asAssetId(assetId), revisionId: asAssetRevisionId(revisionId), packageId: asPackageId(packageId) }); }
  catch (cause) { return failure("TYPED_ID_INVALID", cause instanceof Error ? cause.message : "Stable ID validation failed."); }
}
