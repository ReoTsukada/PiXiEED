/**
 * WP-140 isolated deterministic PNG and PXD export boundary.
 *
 * This is a new Draw2 reference package. It does not read or write the current
 * PiXiEEDraw PXD archive, storage, routes, or PiXYNC contracts.
 */

import {
  IndexedTileRaster,
  canonicalJson,
  createProject,
  type Draw2Cel,
  type Draw2Frame,
  type Draw2Layer,
  type Draw2Timeline,
  type ProjectState,
  type RasterAsset,
} from "./draw2-core.ts";
import {
  validateAssetDefinitionDraft,
  type AssetDefinitionDraft,
  type ValidatedAssetDefinition,
} from "./draw2-creator-workspace.ts";
import {
  normalizeDraw2TimelineMetadata,
  packAtlas,
  type Draw2TimelineMetadata,
} from "./draw2-creator-features.ts";
import {
  validateAssetPackageManifest,
  verifyAssetPackageManifest,
  type AssetPackageManifest,
} from "./game/game-350/assetization.ts";
import { maxPngExportScale } from "./draw2-export-registry.ts";
export {
  EXPORT_FORMATS,
  exportFormatDefinition,
  normalizeExportFormats,
  visibleExportFormats,
} from "./draw2-export-registry.ts";
export type {
  ExportCategory,
  ExportFormat,
  ExportFormatDefinition,
  ExportPackageMode,
  ExportState,
} from "./draw2-export-registry.ts";

export const PXD_FORMAT = "pxd" as const;
export const PXD_SCHEMA_VERSION = 1 as const;
export const PXD_ARCHIVE_VERSION = 1 as const;
export const PXD_MIME_TYPE = "application/vnd.pixieed.pxd" as const;
export const PNG_MIME_TYPE = "image/png" as const;

const PXD_MAGIC = new Uint8Array([0x50, 0x58, 0x44, 0x00]);
const PXD_HEADER_BYTES = 9;
const PXD_CREATED_BY = Object.freeze({ application: "PiXiEED", version: "2.0.0-reference" });

export interface PngExport {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly mimeType: typeof PNG_MIME_TYPE;
  readonly width: number;
  readonly height: number;
  readonly pixelHash: string;
}

export interface PngExportOptions {
  /** Nearest-neighbour scale for pixel art output. */
  readonly scale?: number;
  /**
   * Optional progress callback for UI surfaces that need to stay responsive
   * while a large raster is being expanded and encoded.
   * The callback receives a value from 0 to 1.
   */
  readonly onProgress?: (progress: number) => void | Promise<void>;
  /** Composite the active timeline frame, matching the visible canvas. */
  readonly composite?: boolean;
}

export interface StoredZipEntry {
  readonly filename: string;
  readonly bytes: Uint8Array;
}

interface PxdProjectMetadata {
  readonly name: string;
  readonly structureEpoch: number;
  readonly activeAssetId: string;
  readonly activeLayerId: string;
  readonly activeFrameId: string;
  readonly activeCelId: string;
  readonly layers: readonly Draw2Layer[];
  readonly frames: readonly Draw2Frame[];
  readonly cels: readonly Draw2Cel[];
  readonly timeline: Draw2Timeline;
  /** Sparse Tilemap references; old PXD manifests may omit this field. */
  readonly tilemaps?: ProjectState["tilemaps"];
}

export interface PxdManifestAsset {
  readonly assetId: string;
  readonly revisionId: string;
  readonly mediaType: "application/vnd.pixieed.indexed-raster";
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly tileSize: 32 | 64;
  readonly palette: readonly number[];
  readonly revision: number;
  readonly offset: number;
}

/**
 * PXD-owned local Asset Definition. Source identity is retained for
 * diagnostics, while captured animation frames may also carry a bounded,
 * fixed RGBA snapshot. Registry identity is deliberately kept in the optional
 * external mapping below.
 */
export type PxdAssetDefinition = AssetDefinitionDraft | ValidatedAssetDefinition;

export interface PxdRegisteredAssetIdentity {
  readonly assetId: string;
  readonly revisionId: string;
}

export interface PxdAssetDefinitionEntry {
  readonly definitionId: string;
  readonly definition: PxdAssetDefinition;
  readonly registryIdentity?: PxdRegisteredAssetIdentity;
}

/**
 * A local product candidate is only a selection-and-rights proposal inside a
 * PXD. It never carries price, owner, payment, or Marketplace authority.
 */
export type PxdProductModule = "DRAW" | "AUDIO" | "GAME";
export type PxdProductKind =
  | "GAME_PROJECT"
  | "DRAW_IMAGE"
  | "DRAW_ANIMATION"
  | "DRAW_CHARACTER_ANIMATION"
  | "AUDIO_ASSET"
  | "PROJECT";
export type PxdProductRight =
  | "PERSONAL_USE"
  | "COMMERCIAL_USE"
  | "DERIVATIVE"
  | "EMBEDDING"
  | "RESALE";
export type PxdProductEdition =
  | { readonly kind: "UNLIMITED" }
  | { readonly kind: "LIMITED"; readonly maxUnits: number };

export interface PxdProductDefinition {
  readonly schemaVersion: 1;
  readonly persistence: "LOCAL_DRAFT";
  readonly productId: string;
  readonly kind: PxdProductKind;
  readonly name: string;
  readonly description: string;
  readonly includedModules: readonly PxdProductModule[];
  readonly assetDefinitionIds: readonly string[];
  readonly audioRevisionIds: readonly string[];
  readonly rights: readonly PxdProductRight[];
  readonly edition: PxdProductEdition;
}

export interface PxdManifestV1 {
  readonly format: typeof PXD_FORMAT;
  readonly schemaVersion: typeof PXD_SCHEMA_VERSION;
  readonly archiveVersion: typeof PXD_ARCHIVE_VERSION;
  readonly packageKind: "PROJECT_PACKAGE";
  readonly packageId: string;
  readonly projectId: string;
  readonly createdBy: typeof PXD_CREATED_BY;
  readonly project: PxdProjectMetadata;
  readonly assets: readonly PxdManifestAsset[];
  /** Optional for backwards-compatible reads; new exports always emit it. */
  readonly assetDefinitions?: readonly PxdAssetDefinitionEntry[];
  /** Optional lightweight Draw timeline annotations. */
  readonly drawTimelineMetadata?: Draw2TimelineMetadata;
  readonly dependencies: readonly [];
  readonly canonicalManifestHash: string;
}

export interface PxdExport {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly mimeType: typeof PXD_MIME_TYPE;
  readonly packageHash: string;
  readonly manifestHash: string;
  readonly manifest: PxdManifestV1;
}

export interface PxdImportOptions {
  readonly expectedPackageHash?: string;
}

export interface PxdExportOptions {
  /** PXD-owned definitions; captured local animation snapshots are preserved. */
  readonly assetDefinitions?: readonly PxdAssetDefinitionEntry[];
  readonly drawTimelineMetadata?: Draw2TimelineMetadata;
}

export interface PxdImportResult {
  readonly state: ProjectState;
  readonly packageHash: string;
  readonly manifestHash: string;
  readonly assetDefinitions: readonly PxdAssetDefinitionEntry[];
  readonly drawTimelineMetadata: Draw2TimelineMetadata;
}

/**
 * Integrated PXD project archive.  Version 1 remains the Draw-only archive;
 * version 2 keeps each module as an independent entry inside the same PXD.
 * The archive never introduces a PiXiPackage layer.
 */
export const PXD_PROJECT_SCHEMA_VERSION = 2 as const;
export const PXD_PROJECT_ARCHIVE_VERSION = 2 as const;

export interface PxdProjectAudioAssetInput {
  readonly revisionId: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface PxdProjectAudioInput {
  readonly schemaVersion: string;
  readonly record: unknown;
  readonly assets?: readonly PxdProjectAudioAssetInput[];
}

export interface PxdProjectGameInput {
  readonly schemaVersion: string;
  readonly record: unknown;
}

export interface PxdProjectExportOptions {
  /** PXD-owned definitions; captured local animation snapshots are preserved. */
  readonly assetDefinitions?: readonly PxdAssetDefinitionEntry[];
  readonly drawTimelineMetadata?: Draw2TimelineMetadata;
  /**
   * Optional local product candidates. They reference module/asset identities;
   * they do not duplicate bytes or become Marketplace Product records.
   */
  readonly productDefinitions?: readonly PxdProductDefinition[];
  /** Strict, content-addressed Asset / Asset Pack delivery manifests. */
  readonly assetPackages?: readonly AssetPackageManifest[];
  readonly audio?: PxdProjectAudioInput;
  readonly game?: PxdProjectGameInput;
}

export interface PxdProjectPayloadEntry {
  readonly path: string;
  readonly mediaType: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly offset: number;
}

export interface PxdProjectAudioAssetManifest
  extends PxdProjectPayloadEntry {
  readonly revisionId: string;
}

export interface PxdProjectModuleManifest {
  readonly schemaVersion: string | null;
  readonly status: "EMBEDDED" | "EMPTY";
  readonly state: PxdProjectPayloadEntry | null;
  readonly assets: readonly PxdProjectAudioAssetManifest[];
}

export interface PxdManifestV2 {
  readonly format: typeof PXD_FORMAT;
  readonly schemaVersion: typeof PXD_PROJECT_SCHEMA_VERSION;
  readonly archiveVersion: typeof PXD_PROJECT_ARCHIVE_VERSION;
  readonly packageKind: "PROJECT_PACKAGE";
  readonly packageId: string;
  readonly projectId: string;
  readonly createdBy: typeof PXD_CREATED_BY;
  readonly project: PxdProjectMetadata;
  readonly modules: {
    readonly draw: {
      readonly schemaVersion: "DRAW2_PROJECT_V1";
      readonly status: "EMBEDDED";
      readonly state: null;
      readonly assets: readonly PxdManifestAsset[];
    };
    readonly audio: PxdProjectModuleManifest;
    readonly game: PxdProjectModuleManifest;
  };
  readonly entries: readonly PxdProjectPayloadEntry[];
  readonly assetDefinitions: readonly PxdAssetDefinitionEntry[];
  readonly drawTimelineMetadata?: Draw2TimelineMetadata;
  readonly productDefinitions?: readonly PxdProductDefinition[];
  /** Optional strict Asset / Asset Pack manifests from the Draw workspace. */
  readonly assetPackages?: readonly AssetPackageManifest[];
  readonly dependencies: readonly [];
  readonly canonicalManifestHash: string;
}

export interface PxdProjectExport {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly mimeType: typeof PXD_MIME_TYPE;
  readonly packageHash: string;
  readonly manifestHash: string;
  readonly manifest: PxdManifestV2;
}

export interface PxdProjectAudioAssetImport {
  readonly revisionId: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface PxdProjectImport {
  readonly state: ProjectState;
  readonly packageHash: string;
  readonly manifestHash: string;
  readonly manifest: PxdManifestV2;
  readonly assetDefinitions: readonly PxdAssetDefinitionEntry[];
  readonly drawTimelineMetadata: Draw2TimelineMetadata;
  readonly productDefinitions: readonly PxdProductDefinition[];
  readonly assetPackages: readonly AssetPackageManifest[];
  readonly audio: {
    readonly schemaVersion: string;
    readonly record: unknown;
    readonly assets: readonly PxdProjectAudioAssetImport[];
  } | null;
  readonly game: {
    readonly schemaVersion: string;
    readonly record: unknown;
  } | null;
}

function assert(condition: boolean, code: string, message: string): asserts condition {
  if (!condition) throw Object.assign(new Error(message), { code });
}

function uint32(value: number, label: string): number {
  assert(Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff, "PXD_NUMBER_INVALID", `${label} must be a uint32.`);
  return value;
}

function readUint32(bytes: Uint8Array, offset: number, label: string): number {
  assert(offset >= 0 && offset + 4 <= bytes.length, "PXD_TRUNCATED", `${label} is truncated.`);
  return ((bytes[offset] ?? 0) * 0x1000000) + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0);
}

function writeUint32(value: number): Uint8Array {
  const output = new Uint8Array(4);
  output[0] = (value >>> 24) & 0xff;
  output[1] = (value >>> 16) & 0xff;
  output[2] = (value >>> 8) & 0xff;
  output[3] = value & 0xff;
  return output;
}

function writeUint16LittleEndian(value: number): Uint8Array {
  assert(
    Number.isSafeInteger(value) && value >= 0 && value <= 0xffff,
    "ZIP_NUMBER_INVALID",
    "ZIP uint16 value is invalid.",
  );
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function writeUint32LittleEndian(value: number): Uint8Array {
  assert(
    Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff,
    "ZIP_NUMBER_INVALID",
    "ZIP uint32 value is invalid.",
  );
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

async function sha256BytesHex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function colorToRgba(color: number, paletteIndex: number): [number, number, number, number] {
  if (paletteIndex === 0) return [0, 0, 0, 0];
  // Draw2 palette colors are ARGB (0xAARRGGBB), while Canvas/ImageData and
  // every exported raster use RGBA byte order.
  return [
    (color >>> 16) & 0xff,
    (color >>> 8) & 0xff,
    color & 0xff,
    (color >>> 24) & 0xff,
  ];
}

function rasterToRgba(asset: RasterAsset): Uint8Array {
  const indexed = asset.raster.toUint8Array();
  const rgba = new Uint8Array(indexed.length * 4);
  for (let index = 0; index < indexed.length; index += 1) {
    const paletteIndex = indexed[index] ?? 0;
    const color = colorToRgba(asset.palette[paletteIndex] ?? 0, paletteIndex);
    const target = index * 4;
    rgba[target] = color[0];
    rgba[target + 1] = color[1];
    rgba[target + 2] = color[2];
    rgba[target + 3] = color[3];
  }
  return rgba;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipFilenameIsSafe(filename: string): boolean {
  return filename.length > 0 && filename.length <= 255 &&
    !filename.startsWith("/") && !filename.includes("\\") &&
    !filename.split("/").some((segment) =>
      segment.length === 0 || segment === "." || segment === ".."
    ) &&
    !/[\u0000-\u001f]/u.test(filename);
}

/**
 * Create a deterministic ZIP container using stored entries only. ZIP is a
 * packaging method, not another export format, so the caller supplies the
 * already-rendered output files.
 */
export function encodeStoredZip(entries: readonly StoredZipEntry[]): Uint8Array {
  assert(entries.length > 0, "ZIP_ENTRIES_EMPTY", "ZIP requires at least one output.");
  assert(entries.length <= 0xffff, "ZIP_ENTRIES_TOO_MANY", "ZIP has too many entries.");
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const filenames = new Set<string>();
  let localOffset = 0;

  for (const entry of entries) {
    assert(zipFilenameIsSafe(entry.filename), "ZIP_FILENAME_INVALID", `ZIP filename ${entry.filename} is unsafe.`);
    assert(!filenames.has(entry.filename), "ZIP_FILENAME_DUPLICATE", `ZIP filename ${entry.filename} is duplicated.`);
    filenames.add(entry.filename);
    const nameBytes = encoder.encode(entry.filename);
    const bytes = new Uint8Array(entry.bytes);
    assert(nameBytes.byteLength <= 0xffff, "ZIP_FILENAME_TOO_LONG", "ZIP filename is too long.");
    assert(bytes.byteLength <= 0xffffffff, "ZIP_ENTRY_TOO_LARGE", `ZIP entry ${entry.filename} is too large.`);
    assert(localOffset <= 0xffffffff, "ZIP_OFFSET_INVALID", "ZIP local entry offset is too large.");
    const checksum = crc32(bytes);
    const localHeader = concatBytes(
      writeUint32LittleEndian(0x04034b50),
      writeUint16LittleEndian(20),
      writeUint16LittleEndian(0x0800),
      writeUint16LittleEndian(0),
      writeUint16LittleEndian(0),
      writeUint16LittleEndian(0),
      writeUint32LittleEndian(checksum),
      writeUint32LittleEndian(bytes.byteLength),
      writeUint32LittleEndian(bytes.byteLength),
      writeUint16LittleEndian(nameBytes.byteLength),
      writeUint16LittleEndian(0),
    );
    const localRecord = concatBytes(localHeader, nameBytes, bytes);
    localParts.push(localRecord);
    centralParts.push(concatBytes(
      writeUint32LittleEndian(0x02014b50),
      writeUint16LittleEndian(20),
      writeUint16LittleEndian(20),
      writeUint16LittleEndian(0x0800),
      writeUint16LittleEndian(0),
      writeUint16LittleEndian(0),
      writeUint16LittleEndian(0),
      writeUint32LittleEndian(checksum),
      writeUint32LittleEndian(bytes.byteLength),
      writeUint32LittleEndian(bytes.byteLength),
      writeUint16LittleEndian(nameBytes.byteLength),
      writeUint16LittleEndian(0),
      writeUint16LittleEndian(0),
      writeUint16LittleEndian(0),
      writeUint16LittleEndian(0),
      writeUint32LittleEndian(0),
      writeUint32LittleEndian(localOffset),
      nameBytes,
    ));
    localOffset += localRecord.byteLength;
  }

  const centralDirectory = concatBytes(...centralParts);
  assert(localOffset <= 0xffffffff, "ZIP_OFFSET_INVALID", "ZIP local entries are too large.");
  assert(centralDirectory.byteLength <= 0xffffffff, "ZIP_DIRECTORY_TOO_LARGE", "ZIP central directory is too large.");
  const endOfCentralDirectory = concatBytes(
    writeUint32LittleEndian(0x06054b50),
    writeUint16LittleEndian(0),
    writeUint16LittleEndian(0),
    writeUint16LittleEndian(entries.length),
    writeUint16LittleEndian(entries.length),
    writeUint32LittleEndian(centralDirectory.byteLength),
    writeUint32LittleEndian(localOffset),
    writeUint16LittleEndian(0),
  );
  return concatBytes(...localParts, centralDirectory, endOfCentralDirectory);
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  assert(typeBytes.byteLength === 4, "PNG_CHUNK_TYPE_INVALID", "PNG chunk type must be four bytes.");
  return concatBytes(writeUint32(data.byteLength), typeBytes, data, writeUint32(crc32(concatBytes(typeBytes, data))));
}

function zlibStore(bytes: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  if (bytes.length === 0) blocks.push(new Uint8Array([1, 0, 0, 0xff, 0xff]));
  for (let offset = 0; offset < bytes.length; offset += 65_535) {
    const end = Math.min(bytes.length, offset + 65_535);
    const length = end - offset;
    const header = new Uint8Array(5);
    header[0] = end === bytes.length ? 1 : 0;
    header[1] = length & 0xff;
    header[2] = (length >>> 8) & 0xff;
    header[3] = (~length) & 0xff;
    header[4] = ((~length) >>> 8) & 0xff;
    blocks.push(header, bytes.slice(offset, end));
  }
  blocks.push(writeUint32(adler32(bytes)));
  return concatBytes(...blocks);
}

function encodePngFromScanlines(
  width: number,
  height: number,
  scanlines: Uint8Array,
): Uint8Array {
  const ihdr = new Uint8Array(13);
  ihdr.set(writeUint32(width), 0);
  ihdr.set(writeUint32(height), 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return concatBytes(signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", zlibStore(scanlines)), pngChunk("IEND", new Uint8Array()));
}

function createPngScanlines(
  width: number,
  height: number,
  rgba: Uint8Array,
): Uint8Array {
  const scanlines = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    scanlines[rowStart] = 0;
    scanlines.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), rowStart + 1);
  }
  return scanlines;
}

/** Encodes RGBA pixels with filter 0 and stored DEFLATE blocks for deterministic output. */
export function encodePngRgba(width: number, height: number, rgba: Uint8Array): Uint8Array {
  uint32(width, "width");
  uint32(height, "height");
  assert(width > 0 && height > 0, "PNG_DIMENSIONS_INVALID", "PNG dimensions must be positive.");
  assert(rgba.byteLength === width * height * 4, "PNG_PIXEL_LENGTH_INVALID", "RGBA byte length does not match dimensions.");
  return encodePngFromScanlines(width, height, createPngScanlines(width, height, rgba));
}

function normalizePngScale(
  value: number | undefined,
  width: number,
  height: number,
): number {
  const candidate = Number.isFinite(value) ? Math.round(value as number) : 1;
  return Math.max(1, Math.min(maxPngExportScale(width, height), candidate));
}

function scaleRgba(
  rgba: Uint8Array,
  width: number,
  height: number,
  scale: number,
): Uint8Array {
  if (scale === 1) return rgba;
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  uint32(scaledWidth, "scaled width");
  uint32(scaledHeight, "scaled height");
  const output = new Uint8Array(scaledWidth * scaledHeight * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * width + x) * 4;
      for (let offsetY = 0; offsetY < scale; offsetY += 1) {
        for (let offsetX = 0; offsetX < scale; offsetX += 1) {
          const targetOffset =
            ((y * scale + offsetY) * scaledWidth + x * scale + offsetX) * 4;
          output.set(rgba.subarray(sourceOffset, sourceOffset + 4), targetOffset);
        }
      }
    }
  }
  return output;
}

async function yieldToRenderer(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function scaleRgbaWithProgress(
  rgba: Uint8Array,
  width: number,
  height: number,
  scale: number,
  onProgress: (progress: number) => void | Promise<void>,
): Promise<Uint8Array> {
  if (scale === 1) {
    await onProgress(1);
    return rgba;
  }
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  uint32(scaledWidth, "scaled width");
  uint32(scaledHeight, "scaled height");
  const output = new Uint8Array(scaledWidth * scaledHeight * 4);
  const rowStep = Math.max(1, Math.ceil(height / 32));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * width + x) * 4;
      for (let offsetY = 0; offsetY < scale; offsetY += 1) {
        for (let offsetX = 0; offsetX < scale; offsetX += 1) {
          const targetOffset =
            ((y * scale + offsetY) * scaledWidth + x * scale + offsetX) * 4;
          output.set(rgba.subarray(sourceOffset, sourceOffset + 4), targetOffset);
        }
      }
    }
    if (y === height - 1 || y % rowStep === 0) {
      await onProgress((y + 1) / height);
      await yieldToRenderer();
    }
  }
  return output;
}

async function createPngScanlinesWithProgress(
  width: number,
  height: number,
  rgba: Uint8Array,
  onProgress: (progress: number) => void | Promise<void>,
): Promise<Uint8Array> {
  const scanlines = new Uint8Array(height * (width * 4 + 1));
  const rowStep = Math.max(1, Math.ceil(height / 32));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    scanlines[rowStart] = 0;
    scanlines.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), rowStart + 1);
    if (y === height - 1 || y % rowStep === 0) {
      await onProgress((y + 1) / height);
      await yieldToRenderer();
    }
  }
  return scanlines;
}

async function encodePngRgbaWithProgress(
  width: number,
  height: number,
  rgba: Uint8Array,
  onProgress: (progress: number) => void | Promise<void>,
): Promise<Uint8Array> {
  uint32(width, "width");
  uint32(height, "height");
  assert(width > 0 && height > 0, "PNG_DIMENSIONS_INVALID", "PNG dimensions must be positive.");
  assert(rgba.byteLength === width * height * 4, "PNG_PIXEL_LENGTH_INVALID", "RGBA byte length does not match dimensions.");
  const scanlines = await createPngScanlinesWithProgress(width, height, rgba, onProgress);
  await onProgress(1);
  return encodePngFromScanlines(width, height, scanlines);
}

function resolveRasterRgba(
  state: ProjectState,
  assetId: string,
  composite = true,
): { readonly width: number; readonly height: number; readonly rgba: Uint8Array } {
  const asset = state.assets[assetId];
  assert(asset !== undefined, "RASTER_ASSET_NOT_FOUND", "Raster export asset was not found.");
  if (composite && assetId === state.activeAssetId) {
    return compositeFrameRgba(state, state.activeFrameId);
  }
  return {
    width: asset.width,
    height: asset.height,
    rgba: rasterToRgba(asset),
  };
}

export async function exportPng(
  state: ProjectState,
  assetId = state.activeAssetId,
  options: PngExportOptions = {},
): Promise<PngExport> {
  const asset = state.assets[assetId];
  assert(asset !== undefined, "PNG_ASSET_NOT_FOUND", "PNG export asset was not found.");
  const indexed = asset.raster.toUint8Array();
  const source = resolveRasterRgba(
    state,
    assetId,
    options.composite !== false,
  );
  const scale = normalizePngScale(options.scale, source.width, source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  const rgba = source.rgba;
  if (options.onProgress === undefined) {
    return {
      bytes: encodePngRgba(
        width,
        height,
        scaleRgba(rgba, source.width, source.height, scale),
      ),
      filename: `${state.projectId}.png`,
      mimeType: PNG_MIME_TYPE,
      width,
      height,
      pixelHash: await sha256BytesHex(indexed),
    };
  }
  await options.onProgress(0.06);
  const scaled = await scaleRgbaWithProgress(
    rgba,
    source.width,
    source.height,
    scale,
    async (progress) => options.onProgress?.(0.08 + progress * 0.58),
  );
  await options.onProgress(0.68);
  const bytes = await encodePngRgbaWithProgress(
    width,
    height,
    scaled,
    async (progress) => options.onProgress?.(0.69 + progress * 0.28),
  );
  await options.onProgress(1);
  return {
    bytes,
    filename: `${state.projectId}.png`,
    mimeType: PNG_MIME_TYPE,
    width,
    height,
    pixelHash: await sha256BytesHex(indexed),
  };
}

export interface RgbaRasterExport {
  readonly rgba: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

export interface RasterAnimationFrame {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly durationMs: number;
}

export interface RasterImageExport {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly frameCount?: number;
}

export interface RasterExportOptions {
  readonly scale?: number;
  /** RGBA uint32 color used when the output format cannot preserve alpha. */
  readonly backgroundColor?: number;
  /** Composite the active timeline frame, matching the visible canvas. */
  readonly composite?: boolean;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizedBackgroundColor(value: number | undefined): [number, number, number, number] {
  const color = Number.isSafeInteger(value) && value !== undefined
    ? value >>> 0
    : 0xffffffff;
  return [
    (color >>> 24) & 0xff,
    (color >>> 16) & 0xff,
    (color >>> 8) & 0xff,
    color & 0xff,
  ];
}

/** Returns a scaled RGBA raster for browser-native image encoders. */
export function exportRasterRgba(
  state: ProjectState,
  assetId = state.activeAssetId,
  options: RasterExportOptions = {},
): RgbaRasterExport {
  const asset = state.assets[assetId];
  assert(asset !== undefined, "RASTER_ASSET_NOT_FOUND", "Raster export asset was not found.");
  const source = resolveRasterRgba(
    state,
    assetId,
    options.composite !== false,
  );
  const scale = normalizePngScale(options.scale, source.width, source.height);
  return {
    rgba: scaleRgba(source.rgba, source.width, source.height, scale),
    width: source.width * scale,
    height: source.height * scale,
    scale,
  };
}

/** Flattens transparency against a color for JPEG and other opaque outputs. */
export function flattenRgba(
  rgba: Uint8Array,
  backgroundColor = 0xffffffff,
): Uint8Array {
  assert(rgba.byteLength % 4 === 0, "RGBA_PIXEL_LENGTH_INVALID", "RGBA byte length must be divisible by four.");
  const [backgroundRed, backgroundGreen, backgroundBlue, backgroundAlpha] =
    normalizedBackgroundColor(backgroundColor);
  const backdropAlpha = backgroundAlpha / 255;
  const output = new Uint8Array(rgba.byteLength);
  for (let offset = 0; offset < rgba.byteLength; offset += 4) {
    const alpha = (rgba[offset + 3] ?? 0) / 255;
    const outputAlpha = alpha + backdropAlpha * (1 - alpha);
    if (outputAlpha <= 0) {
      output[offset] = backgroundRed;
      output[offset + 1] = backgroundGreen;
      output[offset + 2] = backgroundBlue;
      output[offset + 3] = 255;
      continue;
    }
    output[offset] = clampByte(((rgba[offset] ?? 0) * alpha + backgroundRed * backdropAlpha * (1 - alpha)) / outputAlpha);
    output[offset + 1] = clampByte(((rgba[offset + 1] ?? 0) * alpha + backgroundGreen * backdropAlpha * (1 - alpha)) / outputAlpha);
    output[offset + 2] = clampByte(((rgba[offset + 2] ?? 0) * alpha + backgroundBlue * backdropAlpha * (1 - alpha)) / outputAlpha);
    output[offset + 3] = 255;
  }
  return output;
}

function layerForCel(state: ProjectState, cel: Draw2Cel): Draw2Layer | undefined {
  return state.layers.find((layer) =>
    layer.layerTrackId === cel.layerTrackId || layer.id === cel.layerId
  );
}

function frameIdsForExport(state: ProjectState): readonly string[] {
  const knownFrameIds = new Set(state.frames.map((frame) => frame.frameId));
  const ordered = state.timeline.frameOrder.filter((frameId) =>
    knownFrameIds.has(frameId)
  );
  const trailing = state.frames
    .filter((frame) => !ordered.includes(frame.frameId))
    .sort((left, right) => left.index - right.index || left.frameId.localeCompare(right.frameId))
    .map((frame) => frame.frameId);
  const result = [...ordered, ...trailing];
  return result.length > 0 ? result : [state.activeFrameId];
}

function compositeFrameRgba(
  state: ProjectState,
  frameId: string,
): { readonly width: number; readonly height: number; readonly rgba: Uint8Array } {
  const fallback = state.assets[state.activeAssetId] ?? Object.values(state.assets)[0];
  assert(fallback !== undefined, "RASTER_ASSETS_EMPTY", "The project has no raster assets.");
  const cels = state.cels
    .filter((cel) => cel.frameId === frameId && cel.lifecycle === "ACTIVE" && cel.assetId !== undefined)
    .map((cel) => ({ cel, asset: cel.assetId === undefined ? undefined : state.assets[cel.assetId] }))
    .filter((entry): entry is { readonly cel: Draw2Cel; readonly asset: RasterAsset } => entry.asset !== undefined)
    .filter((entry) => layerForCel(state, entry.cel)?.visible !== false)
    .sort((left, right) => {
      const leftLayer = layerForCel(state, left.cel);
      const rightLayer = layerForCel(state, right.cel);
      return (leftLayer?.order ?? 0) - (rightLayer?.order ?? 0) || left.cel.layerTrackId.localeCompare(right.cel.layerTrackId);
    });
  if (cels.length === 0) {
    return {
      width: fallback.width,
      height: fallback.height,
      rgba: rasterToRgba(fallback),
    };
  }
  const base = cels[0]?.asset ?? fallback;
  const rgba = new Uint8Array(base.width * base.height * 4);
  for (const entry of cels) {
    const source = rasterToRgba(entry.asset);
    const layer = layerForCel(state, entry.cel);
    const opacity = Math.max(0, Math.min(1, layer?.opacity ?? 1));
    const width = Math.min(base.width, entry.asset.width);
    const height = Math.min(base.height, entry.asset.height);
    const multiply = layer?.blendMode === "MULTIPLY";
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourceOffset = (y * entry.asset.width + x) * 4;
        const targetOffset = (y * base.width + x) * 4;
        const sourceAlpha = ((source[sourceOffset + 3] ?? 0) / 255) * opacity;
        if (sourceAlpha <= 0) continue;
        const targetAlpha = (rgba[targetOffset + 3] ?? 0) / 255;
        const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
        const targetFactor = targetAlpha * (1 - sourceAlpha);
        const sourceRed = source[sourceOffset] ?? 0;
        const sourceGreen = source[sourceOffset + 1] ?? 0;
        const sourceBlue = source[sourceOffset + 2] ?? 0;
        const targetRed = rgba[targetOffset] ?? 0;
        const targetGreen = rgba[targetOffset + 1] ?? 0;
        const targetBlue = rgba[targetOffset + 2] ?? 0;
        const blendedRed = multiply && targetAlpha > 0 ? sourceRed * targetRed / 255 : sourceRed;
        const blendedGreen = multiply && targetAlpha > 0 ? sourceGreen * targetGreen / 255 : sourceGreen;
        const blendedBlue = multiply && targetAlpha > 0 ? sourceBlue * targetBlue / 255 : sourceBlue;
        rgba[targetOffset] = clampByte((blendedRed * sourceAlpha + targetRed * targetFactor) / outputAlpha);
        rgba[targetOffset + 1] = clampByte((blendedGreen * sourceAlpha + targetGreen * targetFactor) / outputAlpha);
        rgba[targetOffset + 2] = clampByte((blendedBlue * sourceAlpha + targetBlue * targetFactor) / outputAlpha);
        rgba[targetOffset + 3] = clampByte(outputAlpha * 255);
      }
    }
  }
  return { width: base.width, height: base.height, rgba };
}

/** Resolves the timeline into deterministic RGBA frames for GIF/APNG/atlases. */
export function exportRasterAnimationFrames(
  state: ProjectState,
  options: Pick<RasterExportOptions, "scale"> = {},
): readonly RasterAnimationFrame[] {
  const fallback = state.assets[state.activeAssetId] ?? Object.values(state.assets)[0];
  assert(fallback !== undefined, "RASTER_ASSETS_EMPTY", "The project has no raster assets.");
  const scale = normalizePngScale(options.scale, fallback.width, fallback.height);
  const frameById = new Map(state.frames.map((frame) => [frame.frameId, frame]));
  return frameIdsForExport(state).map((frameId, index) => {
    const raw = compositeFrameRgba(state, frameId);
    const frame = frameById.get(frameId);
    return {
      id: frameId || `frame-${index}`,
      width: raw.width * scale,
      height: raw.height * scale,
      rgba: scaleRgba(raw.rgba, raw.width, raw.height, scale),
      durationMs: Math.max(1, Math.round(frame?.durationMs ?? 100)),
    };
  });
}

function svgNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/u, "").replace(/\.$/u, "");
}

function hexByte(value: number): string {
  return clampByte(value).toString(16).padStart(2, "0");
}

/** Emits crisp pixel rectangles so SVG keeps the indexed-art silhouette and alpha. */
export function exportSvg(
  state: ProjectState,
  assetId = state.activeAssetId,
  options: Pick<RasterExportOptions, "scale" | "composite"> = {},
): RasterImageExport {
  const asset = state.assets[assetId];
  assert(asset !== undefined, "SVG_ASSET_NOT_FOUND", "SVG export asset was not found.");
  const raster = exportRasterRgba(state, assetId, options);
  const rgba = raster.rgba;
  const rectangles: string[] = [];
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const offset = (y * raster.width + x) * 4;
      const alpha = rgba[offset + 3] ?? 0;
      if (alpha === 0) continue;
      const opacity = alpha === 255 ? "" : ` fill-opacity="${svgNumber(alpha / 255)}"`;
      rectangles.push(
        `<rect x="${x}" y="${y}" width="1" height="1" fill="#${hexByte(rgba[offset] ?? 0)}${hexByte(rgba[offset + 1] ?? 0)}${hexByte(rgba[offset + 2] ?? 0)}"${opacity}/>`
      );
    }
  }
  const width = raster.width;
  const height = raster.height;
  const markup = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${rectangles.join("")}</svg>\n`;
  return {
    bytes: new TextEncoder().encode(markup),
    filename: `${state.projectId}.svg`,
    mimeType: "image/svg+xml",
    width,
    height,
  };
}

function setUint16LittleEndian(output: Uint8Array, offset: number, value: number): void {
  output.set(writeUint16LittleEndian(value), offset);
}

function setUint32LittleEndian(output: Uint8Array, offset: number, value: number): void {
  output.set(writeUint32LittleEndian(value), offset);
}

function encodeBmpRgba(width: number, height: number, rgba: Uint8Array): Uint8Array {
  assert(width > 0 && height > 0 && width <= 0x7fffffff && height <= 0x7fffffff, "BMP_DIMENSIONS_INVALID", "BMP dimensions are invalid.");
  assert(rgba.byteLength === width * height * 4, "BMP_PIXEL_LENGTH_INVALID", "BMP RGBA byte length does not match dimensions.");
  const pixelBytes = rgba.byteLength;
  const pixelOffset = 14 + 40;
  const output = new Uint8Array(pixelOffset + pixelBytes);
  output[0] = 0x42;
  output[1] = 0x4d;
  setUint32LittleEndian(output, 2, output.byteLength);
  setUint32LittleEndian(output, 10, pixelOffset);
  setUint32LittleEndian(output, 14, 40);
  setUint32LittleEndian(output, 18, width);
  setUint32LittleEndian(output, 22, height);
  setUint16LittleEndian(output, 26, 1);
  setUint16LittleEndian(output, 28, 32);
  setUint32LittleEndian(output, 30, 0);
  setUint32LittleEndian(output, 34, pixelBytes);
  setUint32LittleEndian(output, 38, 3780);
  setUint32LittleEndian(output, 42, 3780);
  setUint32LittleEndian(output, 46, 0);
  setUint32LittleEndian(output, 50, 0);
  for (let y = 0; y < height; y += 1) {
    const sourceY = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (sourceY * width + x) * 4;
      const targetOffset = pixelOffset + (y * width + x) * 4;
      output[targetOffset] = rgba[sourceOffset + 2] ?? 0;
      output[targetOffset + 1] = rgba[sourceOffset + 1] ?? 0;
      output[targetOffset + 2] = rgba[sourceOffset] ?? 0;
      output[targetOffset + 3] = rgba[sourceOffset + 3] ?? 255;
    }
  }
  return output;
}

export function exportBmp(
  state: ProjectState,
  assetId = state.activeAssetId,
  options: Pick<RasterExportOptions, "scale"> = {},
): RasterImageExport {
  const raster = exportRasterRgba(state, assetId, options);
  return {
    bytes: encodeBmpRgba(raster.width, raster.height, raster.rgba),
    filename: `${state.projectId}.bmp`,
    mimeType: "image/bmp",
    width: raster.width,
    height: raster.height,
  };
}

function encodeTiffRgba(width: number, height: number, rgba: Uint8Array): Uint8Array {
  assert(width > 0 && height > 0, "TIFF_DIMENSIONS_INVALID", "TIFF dimensions are invalid.");
  assert(rgba.byteLength === width * height * 4, "TIFF_PIXEL_LENGTH_INVALID", "TIFF RGBA byte length does not match dimensions.");
  const entryCount = 14;
  const ifdOffset = 8;
  const ifdBytes = 2 + entryCount * 12 + 4;
  const bitsOffset = ifdOffset + ifdBytes;
  const xResolutionOffset = bitsOffset + 8;
  const yResolutionOffset = xResolutionOffset + 8;
  const pixelOffset = yResolutionOffset + 8;
  const output = new Uint8Array(pixelOffset + rgba.byteLength);
  output[0] = 0x49;
  output[1] = 0x49;
  setUint16LittleEndian(output, 2, 42);
  setUint32LittleEndian(output, 4, ifdOffset);
  setUint16LittleEndian(output, ifdOffset, entryCount);
  let entryOffset = ifdOffset + 2;
  const writeEntry = (tag: number, type: number, count: number, value: number): void => {
    setUint16LittleEndian(output, entryOffset, tag);
    setUint16LittleEndian(output, entryOffset + 2, type);
    setUint32LittleEndian(output, entryOffset + 4, count);
    if (type === 3 && count === 1) {
      setUint16LittleEndian(output, entryOffset + 8, value);
      setUint16LittleEndian(output, entryOffset + 10, 0);
    } else {
      setUint32LittleEndian(output, entryOffset + 8, value);
    }
    entryOffset += 12;
  };
  writeEntry(256, 4, 1, width);
  writeEntry(257, 4, 1, height);
  writeEntry(258, 3, 4, bitsOffset);
  writeEntry(259, 3, 1, 1);
  writeEntry(262, 3, 1, 2);
  writeEntry(273, 4, 1, pixelOffset);
  writeEntry(277, 3, 1, 4);
  writeEntry(278, 4, 1, height);
  writeEntry(279, 4, 1, rgba.byteLength);
  writeEntry(282, 5, 1, xResolutionOffset);
  writeEntry(283, 5, 1, yResolutionOffset);
  writeEntry(284, 3, 1, 1);
  writeEntry(296, 3, 1, 2);
  writeEntry(338, 3, 1, 2);
  setUint32LittleEndian(output, entryOffset, 0);
  for (let index = 0; index < 4; index += 1) setUint16LittleEndian(output, bitsOffset + index * 2, 8);
  setUint32LittleEndian(output, xResolutionOffset, 300);
  setUint32LittleEndian(output, xResolutionOffset + 4, 1);
  setUint32LittleEndian(output, yResolutionOffset, 300);
  setUint32LittleEndian(output, yResolutionOffset + 4, 1);
  output.set(rgba, pixelOffset);
  return output;
}

export function exportTiff(
  state: ProjectState,
  assetId = state.activeAssetId,
  options: Pick<RasterExportOptions, "scale"> = {},
): RasterImageExport {
  const raster = exportRasterRgba(state, assetId, options);
  return {
    bytes: encodeTiffRgba(raster.width, raster.height, raster.rgba),
    filename: `${state.projectId}.tiff`,
    mimeType: "image/tiff",
    width: raster.width,
    height: raster.height,
  };
}

interface GifPaletteResult {
  readonly colors: readonly number[];
  readonly frames: readonly Uint8Array[];
}

function nearestGifColor(colors: readonly number[], rgb: number): number {
  const red = (rgb >>> 16) & 0xff;
  const green = (rgb >>> 8) & 0xff;
  const blue = rgb & 0xff;
  let bestIndex = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < colors.length; index += 1) {
    const candidate = colors[index] ?? 0;
    const dr = red - ((candidate >>> 16) & 0xff);
    const dg = green - ((candidate >>> 8) & 0xff);
    const db = blue - (candidate & 0xff);
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function buildGifPalette(frames: readonly RasterAnimationFrame[]): GifPaletteResult {
  const colors: number[] = [0];
  const colorMap = new Map<number, number>();
  for (const frame of frames) {
    for (let offset = 0; offset < frame.rgba.byteLength; offset += 4) {
      const alpha = frame.rgba[offset + 3] ?? 0;
      if (alpha < 128) continue;
      const rgb = ((frame.rgba[offset] ?? 0) << 16) |
        ((frame.rgba[offset + 1] ?? 0) << 8) |
        (frame.rgba[offset + 2] ?? 0);
      if (colorMap.has(rgb)) continue;
      if (colors.length < 256) {
        const index = colors.length;
        colors.push(rgb);
        colorMap.set(rgb, index);
      }
    }
  }
  const paletteSize = Math.max(2, Math.min(256, 2 ** Math.ceil(Math.log2(Math.max(2, colors.length)))));
  while (colors.length < paletteSize) colors.push(0);
  const indexedFrames = frames.map((frame) => {
    const indexed = new Uint8Array(frame.width * frame.height);
    for (let offset = 0; offset < frame.rgba.byteLength; offset += 4) {
      const alpha = frame.rgba[offset + 3] ?? 0;
      const pixelIndex = offset / 4;
      if (alpha < 128) {
        indexed[pixelIndex] = 0;
        continue;
      }
      const rgb = ((frame.rgba[offset] ?? 0) << 16) |
        ((frame.rgba[offset + 1] ?? 0) << 8) |
        (frame.rgba[offset + 2] ?? 0);
      const mapped = colorMap.get(rgb);
      indexed[pixelIndex] = mapped ?? nearestGifColor(colors, rgb);
    }
    return indexed;
  });
  return { colors, frames: indexedFrames };
}

function gifLzwSubBlocks(indexStream: Uint8Array, minCodeSize: number): Uint8Array {
  const output: number[] = [minCodeSize, 0];
  let currentSubblock = 1;
  const clearCode = 1 << minCodeSize;
  const codeMask = clearCode - 1;
  const endCode = clearCode + 1;
  let nextCode = endCode + 1;
  let codeSize = minCodeSize + 1;
  let shift = 0;
  let bitBuffer = 0;
  const codeTable = new Map<number, number>();
  const pushDataByte = (value: number): void => {
    output.push(value & 0xff);
    if (output.length === currentSubblock + 256) {
      output[currentSubblock] = 255;
      currentSubblock = output.length;
      output.push(0);
    }
  };
  const flushBytes = (forcePartial: boolean): void => {
    while (shift >= 8) {
      pushDataByte(bitBuffer);
      bitBuffer >>>= 8;
      shift -= 8;
    }
    if (forcePartial && shift > 0) {
      pushDataByte(bitBuffer);
      bitBuffer = 0;
      shift = 0;
    }
  };
  const emitCode = (code: number): void => {
    bitBuffer |= code << shift;
    shift += codeSize;
    flushBytes(false);
  };
  let previousCode = (indexStream[0] ?? 0) & codeMask;
  emitCode(clearCode);
  for (let index = 1; index < indexStream.length; index += 1) {
    const nextValue = (indexStream[index] ?? 0) & codeMask;
    const key = (previousCode << 8) | nextValue;
    const existingCode = codeTable.get(key);
    if (existingCode === undefined) {
      emitCode(previousCode);
      if (nextCode === 4096) {
        emitCode(clearCode);
        codeTable.clear();
        nextCode = endCode + 1;
        codeSize = minCodeSize + 1;
      } else {
        if (nextCode >= (1 << codeSize)) codeSize += 1;
        codeTable.set(key, nextCode);
        nextCode += 1;
      }
      previousCode = nextValue;
    } else {
      previousCode = existingCode;
    }
  }
  emitCode(previousCode);
  emitCode(endCode);
  flushBytes(true);
  if (currentSubblock + 1 === output.length) output[currentSubblock] = 0;
  else {
    output[currentSubblock] = output.length - currentSubblock - 1;
    output.push(0);
  }
  return Uint8Array.from(output);
}

function writeGifUint16(output: number[], value: number): void {
  output.push(value & 0xff, (value >>> 8) & 0xff);
}

/** Encodes indexed GIF frames with a shared palette and optional looping. */
export function encodeGifFrames(
  frames: readonly RasterAnimationFrame[],
  loopCount = 0,
): Uint8Array {
  assert(frames.length > 0, "GIF_FRAMES_EMPTY", "GIF requires at least one frame.");
  const first = frames[0];
  assert(first !== undefined, "GIF_FRAMES_EMPTY", "GIF requires at least one frame.");
  assert(first.width <= 65535 && first.height <= 65535, "GIF_DIMENSIONS_INVALID", "GIF dimensions exceed the format limit.");
  for (const frame of frames) {
    assert(frame.width === first.width && frame.height === first.height, "GIF_FRAME_DIMENSIONS_INVALID", "GIF frames must share dimensions.");
    assert(frame.rgba.byteLength === frame.width * frame.height * 4, "GIF_PIXEL_LENGTH_INVALID", "GIF RGBA byte length does not match dimensions.");
  }
  const palette = buildGifPalette(frames);
  const bits = Math.max(1, Math.round(Math.log2(palette.colors.length)));
  const minCodeSize = Math.max(2, bits);
  const output: number[] = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
  writeGifUint16(output, first.width);
  writeGifUint16(output, first.height);
  output.push(0x80 | (bits - 1), 0, 0);
  for (const color of palette.colors) output.push((color >>> 16) & 0xff, (color >>> 8) & 0xff, color & 0xff);
  assert(Number.isSafeInteger(loopCount) && loopCount >= 0 && loopCount <= 65535, "GIF_LOOP_INVALID", "GIF loop count is invalid.");
  output.push(0x21, 0xff, 0x0b, 0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, 0x03, 0x01);
  writeGifUint16(output, loopCount);
  output.push(0);
  for (const [index, frame] of frames.entries()) {
    const delay = Math.max(1, Math.min(65535, Math.round(frame.durationMs / 10)));
    output.push(0x21, 0xf9, 0x04, 0x01);
    writeGifUint16(output, delay);
    output.push(0, 0, 0x2c);
    writeGifUint16(output, 0);
    writeGifUint16(output, 0);
    writeGifUint16(output, frame.width);
    writeGifUint16(output, frame.height);
    output.push(0);
    const indexed = palette.frames[index] ?? new Uint8Array(frame.width * frame.height);
    output.push(...gifLzwSubBlocks(indexed, minCodeSize));
  }
  output.push(0x3b);
  return Uint8Array.from(output);
}

export function exportGif(
  state: ProjectState,
  options: Pick<RasterExportOptions, "scale"> = {},
): RasterImageExport {
  const frames = exportRasterAnimationFrames(state, options);
  const first = frames[0];
  assert(first !== undefined, "GIF_FRAMES_EMPTY", "GIF requires at least one frame.");
  return {
    bytes: encodeGifFrames(frames),
    filename: `${state.projectId}.gif`,
    mimeType: "image/gif",
    width: first.width,
    height: first.height,
    frameCount: frames.length,
  };
}

function writeUint16BigEndian(output: Uint8Array, offset: number, value: number): void {
  output[offset] = (value >>> 8) & 0xff;
  output[offset + 1] = value & 0xff;
}

function apngDelay(durationMs: number): [number, number] {
  const milliseconds = Math.max(1, Math.round(durationMs));
  const denominator = 1000;
  let numerator = Math.min(65535, milliseconds);
  let divisor = 1;
  for (let candidate = Math.min(numerator, denominator); candidate > 1; candidate -= 1) {
    if (numerator % candidate === 0 && denominator % candidate === 0) {
      divisor = candidate;
      break;
    }
  }
  return [Math.max(1, Math.round(numerator / divisor)), Math.max(1, Math.round(denominator / divisor))];
}

/** Encodes RGBA timeline frames as a standards-compliant APNG. */
export function encodeApngFrames(frames: readonly RasterAnimationFrame[]): Uint8Array {
  assert(frames.length > 0, "APNG_FRAMES_EMPTY", "APNG requires at least one frame.");
  const first = frames[0];
  assert(first !== undefined, "APNG_FRAMES_EMPTY", "APNG requires at least one frame.");
  assert(first.width <= 0xffffffff && first.height <= 0xffffffff, "APNG_DIMENSIONS_INVALID", "APNG dimensions are invalid.");
  for (const frame of frames) {
    assert(frame.width === first.width && frame.height === first.height, "APNG_FRAME_DIMENSIONS_INVALID", "APNG frames must share dimensions.");
    assert(frame.rgba.byteLength === frame.width * frame.height * 4, "APNG_PIXEL_LENGTH_INVALID", "APNG RGBA byte length does not match dimensions.");
  }
  const ihdr = new Uint8Array(13);
  ihdr.set(writeUint32(first.width), 0);
  ihdr.set(writeUint32(first.height), 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts: Uint8Array[] = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
  ];
  const animationControl = new Uint8Array(8);
  animationControl.set(writeUint32(frames.length), 0);
  animationControl.set(writeUint32(0), 4);
  parts.push(pngChunk("acTL", animationControl));
  let sequence = 0;
  for (const [index, frame] of frames.entries()) {
    const frameControl = new Uint8Array(26);
    frameControl.set(writeUint32(sequence), 0);
    sequence += 1;
    frameControl.set(writeUint32(frame.width), 4);
    frameControl.set(writeUint32(frame.height), 8);
    frameControl.set(writeUint32(0), 12);
    frameControl.set(writeUint32(0), 16);
    const [delayNumerator, delayDenominator] = apngDelay(frame.durationMs);
    writeUint16BigEndian(frameControl, 20, delayNumerator);
    writeUint16BigEndian(frameControl, 22, delayDenominator);
    frameControl[24] = 0;
    frameControl[25] = 0;
    parts.push(pngChunk("fcTL", frameControl));
    const compressed = zlibStore(createPngScanlines(frame.width, frame.height, frame.rgba));
    if (index === 0) {
      parts.push(pngChunk("IDAT", compressed));
    } else {
      const frameData = new Uint8Array(4 + compressed.byteLength);
      frameData.set(writeUint32(sequence), 0);
      sequence += 1;
      frameData.set(compressed, 4);
      parts.push(pngChunk("fdAT", frameData));
    }
  }
  parts.push(pngChunk("IEND", new Uint8Array()));
  return concatBytes(...parts);
}

export function exportApng(
  state: ProjectState,
  options: Pick<RasterExportOptions, "scale"> = {},
): RasterImageExport {
  const frames = exportRasterAnimationFrames(state, options);
  const first = frames[0];
  assert(first !== undefined, "APNG_FRAMES_EMPTY", "APNG requires at least one frame.");
  return {
    bytes: encodeApngFrames(frames),
    filename: `${state.projectId}.apng`,
    mimeType: "image/apng",
    width: first.width,
    height: first.height,
    frameCount: frames.length,
  };
}

export interface SpriteSheetExportOptions {
  readonly scale?: number;
  readonly maxWidth?: number;
  readonly padding?: number;
}

export interface SpriteSheetExport extends RasterImageExport {
  readonly layout: {
    readonly width: number;
    readonly height: number;
    readonly sprites: readonly {
      readonly id: string;
      readonly width: number;
      readonly height: number;
      readonly x: number;
      readonly y: number;
      readonly packedWidth: number;
      readonly packedHeight: number;
    }[];
  };
}

function buildSpriteSheet(
  state: ProjectState,
  options: SpriteSheetExportOptions = {},
): { readonly frames: readonly RasterAnimationFrame[]; readonly layout: SpriteSheetExport["layout"]; readonly rgba: Uint8Array } {
  const frames = exportRasterAnimationFrames(
    state,
    options.scale === undefined ? {} : { scale: options.scale },
  );
  const layout = packAtlas(
    frames.map((frame) => ({ id: frame.id, width: frame.width, height: frame.height })),
    {
      maxWidth: Math.max(1, Math.min(16_384, Math.round(options.maxWidth ?? 4096))),
      padding: Math.max(0, Math.min(256, Math.round(options.padding ?? 0))),
      extrude: 0,
    },
  );
  const rgba = new Uint8Array(layout.width * layout.height * 4);
  const frameById = new Map(frames.map((frame) => [frame.id, frame]));
  for (const sprite of layout.sprites) {
    const frame = frameById.get(sprite.id);
    if (frame === undefined) continue;
    for (let y = 0; y < frame.height; y += 1) {
      const sourceStart = y * frame.width * 4;
      const targetStart = ((sprite.y + y) * layout.width + sprite.x) * 4;
      rgba.set(frame.rgba.subarray(sourceStart, sourceStart + frame.width * 4), targetStart);
    }
  }
  return { frames, layout, rgba };
}

export function exportSpriteSheet(
  state: ProjectState,
  options: SpriteSheetExportOptions = {},
): SpriteSheetExport {
  const result = buildSpriteSheet(state, options);
  return {
    bytes: encodePngRgba(result.layout.width, result.layout.height, result.rgba),
    filename: `${state.projectId}-spritesheet.png`,
    mimeType: "image/png",
    width: result.layout.width,
    height: result.layout.height,
    frameCount: result.frames.length,
    layout: result.layout,
  };
}

/** Exports the active indexed raster as the reusable tile source PNG. */
export function exportTileset(
  state: ProjectState,
  assetId = state.activeAssetId,
  options: Pick<RasterExportOptions, "scale"> = {},
): RasterImageExport {
  // A tileset is the source raster, not the visible timeline composite.
  const raster = exportRasterRgba(state, assetId, { ...options, composite: false });
  return {
    bytes: encodePngRgba(raster.width, raster.height, raster.rgba),
    filename: `${state.projectId}-tileset.png`,
    mimeType: "image/png",
    width: raster.width,
    height: raster.height,
  };
}

export interface AtlasJsonExportOptions extends SpriteSheetExportOptions {
  readonly imageFilename?: string;
}

export function exportAtlasJson(
  state: ProjectState,
  options: AtlasJsonExportOptions = {},
): RasterImageExport {
  const result = buildSpriteSheet(state, options);
  const framesById = new Map(result.frames.map((frame) => [frame.id, frame]));
  const payload = {
    schemaVersion: 1,
    image: options.imageFilename ?? `${state.projectId}-spritesheet.png`,
    size: { width: result.layout.width, height: result.layout.height },
    frames: Object.fromEntries(result.layout.sprites.map((sprite) => {
      const frame = framesById.get(sprite.id);
      return [sprite.id, {
        frame: { x: sprite.x, y: sprite.y, w: sprite.width, h: sprite.height },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: sprite.width, h: sprite.height },
        sourceSize: { w: sprite.width, h: sprite.height },
        durationMs: frame?.durationMs ?? 100,
      }];
    })),
    meta: {
      app: "PiXiEEDstudio",
      version: "2.0.0",
      format: "RGBA8888",
      scale: options.scale ?? 1,
    },
  };
  return {
    bytes: new TextEncoder().encode(`${JSON.stringify(payload, null, 2)}\n`),
    filename: `${state.projectId}.atlas.json`,
    mimeType: "application/json",
    width: result.layout.width,
    height: result.layout.height,
    frameCount: result.frames.length,
  };
}

function projectMetadata(state: ProjectState): PxdProjectMetadata {
  return {
    name: state.name,
    structureEpoch: state.structureEpoch,
    activeAssetId: state.activeAssetId,
    activeLayerId: state.activeLayerId,
    activeFrameId: state.activeFrameId,
    activeCelId: state.activeCelId,
    layers: state.layers,
    frames: state.frames,
    cels: state.cels,
    timeline: state.timeline,
    tilemaps: state.tilemaps ?? {},
  };
}

function manifestWithoutHash(value: Omit<PxdManifestV1, "canonicalManifestHash">): string {
  return canonicalJson(value);
}

function packageFileName(projectId: string): string {
  return `${projectId.replace(/[^A-Za-z0-9._-]+/gu, "-") || "pixieed-project"}.pxd`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertNoEmbeddedAssetPayload(
  value: unknown,
  path: string,
  allowRasterSnapshots = false,
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoEmbeddedAssetPayload(entry, `${path}[${index}]`, allowRasterSnapshots)
    );
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (allowRasterSnapshots && key === "rasterSnapshot") {
      // AssetAnimationFrameReference validates this fixed image's dimensions,
      // channel count, and byte range before the definition reaches export.
      continue;
    }
    assert(
      !["pixels", "pixelData", "raster", "blob", "dataUrl", "rgba", "indexedBytes", "payload"].includes(key),
      "PXD_ASSET_DEFINITION_EMBEDDED_DATA",
      `${path}.${key} must not contain embedded asset data.`,
    );
    assertNoEmbeddedAssetPayload(entry, `${path}.${key}`, allowRasterSnapshots);
  }
}

function assertAssetDefinitionShape(value: unknown, path: string): asserts value is PxdAssetDefinition {
  assert(isRecord(value), "PXD_ASSET_DEFINITION_INVALID", `${path} must be an object.`);
  const definition = value as Record<string, unknown>;
  assert(definition.schemaVersion === 1, "PXD_ASSET_DEFINITION_VERSION_UNSUPPORTED", `${path}.schemaVersion is unsupported.`);
  assert(definition.persistence === "LOCAL_DRAFT" || definition.persistence === "VALIDATED_DEFINITION", "PXD_ASSET_DEFINITION_PERSISTENCE_INVALID", `${path}.persistence must be LOCAL_DRAFT or VALIDATED_DEFINITION.`);
  const candidate = { ...definition, persistence: "LOCAL_DRAFT" } as AssetDefinitionDraft;
  const validation = validateAssetDefinitionDraft(candidate);
  assert(validation.ok, "PXD_ASSET_DEFINITION_INVALID", `${path} failed Asset Definition validation.`);
  const normalized = { ...validation.value, persistence: definition.persistence };
  assert(canonicalJson(normalized) === canonicalJson(definition), "PXD_ASSET_DEFINITION_NOT_NORMALIZED", `${path} is not normalized.`);
}

function validateAssetDefinitionEntry(value: unknown, index: number): PxdAssetDefinitionEntry {
  const path = `assetDefinitions[${index}]`;
  assert(isRecord(value), "PXD_ASSET_DEFINITION_INVALID", `${path} must be an object.`);
  assertNoEmbeddedAssetPayload(value, path, true);
  assert(typeof value.definitionId === "string" && value.definitionId.trim() === value.definitionId && value.definitionId.length > 0, "PXD_ASSET_DEFINITION_ID_INVALID", `${path}.definitionId is invalid.`);
  assertAssetDefinitionShape(value.definition, `${path}.definition`);
  if (value.registryIdentity !== undefined) {
    assert(isRecord(value.registryIdentity), "PXD_REGISTRY_IDENTITY_INVALID", `${path}.registryIdentity is invalid.`);
    assert(typeof value.registryIdentity.assetId === "string" && value.registryIdentity.assetId.trim() === value.registryIdentity.assetId && value.registryIdentity.assetId.length > 0, "PXD_REGISTRY_IDENTITY_INVALID", `${path}.registryIdentity.assetId is invalid.`);
    assert(typeof value.registryIdentity.revisionId === "string" && value.registryIdentity.revisionId.trim() === value.registryIdentity.revisionId && value.registryIdentity.revisionId.length > 0, "PXD_REGISTRY_IDENTITY_INVALID", `${path}.registryIdentity.revisionId is invalid.`);
  }
  return value as unknown as PxdAssetDefinitionEntry;
}

function normalizeAssetDefinitions(entries: readonly PxdAssetDefinitionEntry[] | undefined): PxdAssetDefinitionEntry[] {
  const normalized = [...(entries ?? [])].map((entry, index) => validateAssetDefinitionEntry(entry, index));
  normalized.sort((left, right) => left.definitionId < right.definitionId ? -1 : left.definitionId > right.definitionId ? 1 : 0);
  for (let index = 1; index < normalized.length; index += 1) {
    assert(normalized[index - 1]?.definitionId !== normalized[index]?.definitionId, "PXD_ASSET_DEFINITION_DUPLICATE", `Asset Definition ${normalized[index]?.definitionId ?? ""} is duplicated.`);
  }
  return normalized;
}

const PXD_PRODUCT_MODULES: readonly PxdProductModule[] = ["DRAW", "AUDIO", "GAME"];
const PXD_PRODUCT_KINDS: readonly PxdProductKind[] = [
  "GAME_PROJECT",
  "DRAW_IMAGE",
  "DRAW_ANIMATION",
  "DRAW_CHARACTER_ANIMATION",
  "AUDIO_ASSET",
  "PROJECT",
];
const PXD_PRODUCT_RIGHTS: readonly PxdProductRight[] = [
  "PERSONAL_USE",
  "COMMERCIAL_USE",
  "DERIVATIVE",
  "EMBEDDING",
  "RESALE",
];

function normalizePxdProductReferences(value: unknown, path: string): string[] {
  assert(Array.isArray(value), "PXD_PRODUCT_REFERENCE_INVALID", `${path} must be an array.`);
  const normalized = value.map((entry, index) => {
    assert(typeof entry === "string" && entry.trim() === entry && entry.length > 0, "PXD_PRODUCT_REFERENCE_INVALID", `${path}[${index}] is invalid.`);
    return entry;
  });
  assert(new Set(normalized).size === normalized.length, "PXD_PRODUCT_REFERENCE_DUPLICATE", `${path} contains a duplicate reference.`);
  return normalized.sort(compareStrings);
}

function normalizePxdProductDefinition(
  value: unknown,
  index: number,
  assetDefinitionIds: ReadonlySet<string>,
  audioRevisionIds: ReadonlySet<string>,
  availableModules: ReadonlySet<PxdProductModule>,
): PxdProductDefinition {
  const path = `productDefinitions[${index}]`;
  assert(isRecord(value), "PXD_PRODUCT_DEFINITION_INVALID", `${path} must be an object.`);
  assertNoEmbeddedAssetPayload(value, path);
  const allowedKeys = new Set([
    "schemaVersion",
    "persistence",
    "productId",
    "kind",
    "name",
    "description",
    "includedModules",
    "assetDefinitionIds",
    "audioRevisionIds",
    "rights",
    "edition",
  ]);
  assert(Object.keys(value).every((key) => allowedKeys.has(key)), "PXD_PRODUCT_DEFINITION_FIELD_INVALID", `${path} contains an unsupported field.`);
  assert(value.schemaVersion === 1, "PXD_PRODUCT_DEFINITION_VERSION_UNSUPPORTED", `${path}.schemaVersion is unsupported.`);
  assert(value.persistence === "LOCAL_DRAFT", "PXD_PRODUCT_DEFINITION_PERSISTENCE_INVALID", `${path}.persistence must be LOCAL_DRAFT.`);
  assert(typeof value.productId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value.productId), "PXD_PRODUCT_ID_INVALID", `${path}.productId is invalid.`);
  assert(typeof value.kind === "string" && PXD_PRODUCT_KINDS.includes(value.kind as PxdProductKind), "PXD_PRODUCT_KIND_INVALID", `${path}.kind is invalid.`);
  assert(typeof value.name === "string" && value.name.trim() === value.name && value.name.length > 0 && value.name.length <= 128, "PXD_PRODUCT_NAME_INVALID", `${path}.name is invalid.`);
  assert(typeof value.description === "string" && value.description.trim() === value.description && value.description.length <= 4096, "PXD_PRODUCT_DESCRIPTION_INVALID", `${path}.description is invalid.`);
  const includedModules = normalizePxdProductReferences(value.includedModules, `${path}.includedModules`) as PxdProductModule[];
  assert(includedModules.every((module) => PXD_PRODUCT_MODULES.includes(module)), "PXD_PRODUCT_MODULE_INVALID", `${path}.includedModules contains an unsupported module.`);
  assert(includedModules.length > 0, "PXD_PRODUCT_MODULE_REQUIRED", `${path}.includedModules must not be empty.`);
  const assetIds = normalizePxdProductReferences(value.assetDefinitionIds, `${path}.assetDefinitionIds`);
  const audioIds = normalizePxdProductReferences(value.audioRevisionIds, `${path}.audioRevisionIds`);
  for (const assetId of assetIds) assert(assetDefinitionIds.has(assetId), "PXD_PRODUCT_ASSET_REFERENCE_MISSING", `${path} references missing Asset Definition ${assetId}.`);
  for (const audioId of audioIds) assert(audioRevisionIds.has(audioId), "PXD_PRODUCT_AUDIO_REFERENCE_MISSING", `${path} references missing Audio revision ${audioId}.`);
  assert(assetIds.length === 0 || includedModules.includes("DRAW"), "PXD_PRODUCT_DRAW_MODULE_REQUIRED", `${path} uses Draw Asset Definitions without including DRAW.`);
  assert(audioIds.length === 0 || includedModules.includes("AUDIO"), "PXD_PRODUCT_AUDIO_MODULE_REQUIRED", `${path} uses Audio revisions without including AUDIO.`);
  if (value.kind === "GAME_PROJECT") assert(includedModules.includes("GAME"), "PXD_PRODUCT_GAME_MODULE_REQUIRED", `${path} GAME_PROJECT must include GAME.`);
  if (["DRAW_IMAGE", "DRAW_ANIMATION", "DRAW_CHARACTER_ANIMATION"].includes(value.kind as string)) {
    assert(includedModules.includes("DRAW") && assetIds.length > 0, "PXD_PRODUCT_DRAW_SOURCE_REQUIRED", `${path} Draw products require DRAW and at least one Asset Definition.`);
  }
  if (value.kind === "AUDIO_ASSET") {
    assert(includedModules.includes("AUDIO") && audioIds.length > 0, "PXD_PRODUCT_AUDIO_SOURCE_REQUIRED", `${path} AUDIO_ASSET products require AUDIO and at least one Audio revision.`);
  }
  const rights = normalizePxdProductReferences(value.rights, `${path}.rights`) as PxdProductRight[];
  assert(rights.every((right) => PXD_PRODUCT_RIGHTS.includes(right)), "PXD_PRODUCT_RIGHT_INVALID", `${path}.rights contains an unsupported right.`);
  assert(rights.length > 0, "PXD_PRODUCT_RIGHT_REQUIRED", `${path}.rights must not be empty.`);
  assert(isRecord(value.edition), "PXD_PRODUCT_EDITION_INVALID", `${path}.edition is invalid.`);
  const editionValue = value.edition;
  let edition: PxdProductEdition;
  if (editionValue.kind === "UNLIMITED") {
    assert(Object.keys(editionValue).length === 1, "PXD_PRODUCT_EDITION_INVALID", `${path}.edition contains an unsupported field.`);
    edition = { kind: "UNLIMITED" };
  } else {
    assert(editionValue.kind === "LIMITED" && Object.keys(editionValue).length === 2, "PXD_PRODUCT_EDITION_INVALID", `${path}.edition kind is invalid.`);
    const maxUnits = editionValue.maxUnits;
    assert(typeof maxUnits === "number" && Number.isSafeInteger(maxUnits) && maxUnits > 0, "PXD_PRODUCT_EDITION_LIMIT_INVALID", `${path}.edition.maxUnits must be a positive safe integer.`);
    edition = { kind: "LIMITED", maxUnits };
  }
  for (const module of includedModules) assert(availableModules.has(module), "PXD_PRODUCT_MODULE_MISSING", `${path} requires unavailable module ${module}.`);
  return {
    schemaVersion: 1,
    persistence: "LOCAL_DRAFT",
    productId: value.productId,
    kind: value.kind as PxdProductKind,
    name: value.name,
    description: value.description,
    includedModules,
    assetDefinitionIds: assetIds,
    audioRevisionIds: audioIds,
    rights,
    edition,
  };
}

function normalizePxdProductDefinitions(
  entries: readonly PxdProductDefinition[] | undefined,
  assetDefinitions: readonly PxdAssetDefinitionEntry[],
  audioRevisionIds: readonly string[],
  availableModules: ReadonlySet<PxdProductModule>,
): PxdProductDefinition[] {
  const assetDefinitionIds = new Set(assetDefinitions.map((entry) => entry.definitionId));
  const audioIds = new Set(audioRevisionIds);
  const normalized = [...(entries ?? [])].map((entry, index) => normalizePxdProductDefinition(entry, index, assetDefinitionIds, audioIds, availableModules));
  normalized.sort((left, right) => compareStrings(left.productId, right.productId));
  for (let index = 1; index < normalized.length; index += 1) {
    assert(normalized[index - 1]?.productId !== normalized[index]?.productId, "PXD_PRODUCT_DEFINITION_DUPLICATE", `Product Definition ${normalized[index]?.productId ?? ""} is duplicated.`);
  }
  return normalized;
}

function normalizePxdAssetPackages(
  entries: readonly AssetPackageManifest[] | undefined,
): AssetPackageManifest[] {
  const normalized = [...(entries ?? [])].map((entry, index) => {
    const checked = validateAssetPackageManifest(entry);
    if (!checked.ok) {
      assert(false, "PXD_ASSET_PACKAGE_INVALID", `assetPackages[${index}] is invalid: ${checked.reasons.join("; ")}`);
    }
    return entry;
  });
  normalized.sort((left, right) => compareStrings(left.packageId, right.packageId));
  for (let index = 1; index < normalized.length; index += 1) {
    assert(normalized[index - 1]?.packageId !== normalized[index]?.packageId, "PXD_ASSET_PACKAGE_DUPLICATE", `Asset Package ${normalized[index]?.packageId ?? ""} is duplicated.`);
  }
  return normalized;
}

export async function exportPxd(state: ProjectState, options: PxdExportOptions = {}): Promise<PxdExport> {
  const assetEntries: PxdManifestAsset[] = [];
  const payloads: Uint8Array[] = [];
  const assetDefinitions = normalizeAssetDefinitions(options.assetDefinitions);
  const drawTimelineMetadata = options.drawTimelineMetadata === undefined
    ? undefined
    : normalizeDraw2TimelineMetadata(
      options.drawTimelineMetadata,
      state.frames.length,
    );
  let offset = 0;
  const assetIds = Object.keys(state.assets).sort();
  for (const [assetIndex, assetId] of assetIds.entries()) {
    const asset = state.assets[assetId];
    assert(asset !== undefined, "PXD_ASSET_NOT_FOUND", `PXD export asset ${assetId} was not found.`);
    const pixels = asset.raster.toUint8Array();
    const path = `objects/asset-${String(assetIndex).padStart(4, "0")}.raster`;
    assetEntries.push({
      assetId: asset.id,
      revisionId: `${asset.id}:revision:${asset.revision}`,
      mediaType: "application/vnd.pixieed.indexed-raster",
      path,
      sha256: await sha256BytesHex(pixels),
      bytes: pixels.byteLength,
      width: asset.width,
      height: asset.height,
      tileSize: asset.raster.tileSize,
      palette: [...asset.palette],
      revision: asset.revision,
      offset,
    });
    payloads.push(pixels);
    offset += pixels.byteLength;
  }
  const content = {
    format: PXD_FORMAT,
    schemaVersion: PXD_SCHEMA_VERSION,
    archiveVersion: PXD_ARCHIVE_VERSION,
    packageKind: "PROJECT_PACKAGE" as const,
    projectId: state.projectId,
    project: projectMetadata(state),
    assets: assetEntries,
    assetDefinitions,
    ...(drawTimelineMetadata === undefined ? {} : { drawTimelineMetadata }),
    dependencies: [] as const,
  };
  const packageId = `pxd_${(await sha256BytesHex(new TextEncoder().encode(canonicalJson(content)))).slice(0, 32)}`;
  const manifestBase = {
    ...content,
    packageId,
    createdBy: PXD_CREATED_BY,
  };
  const manifestHash = await sha256BytesHex(new TextEncoder().encode(manifestWithoutHash(manifestBase)));
  const manifest: PxdManifestV1 = { ...manifestBase, canonicalManifestHash: manifestHash };
  const manifestBytes = new TextEncoder().encode(canonicalJson(manifest));
  assert(manifestBytes.byteLength <= 0xffffffff, "PXD_MANIFEST_TOO_LARGE", "PXD manifest exceeds the container limit.");
  const bytes = concatBytes(PXD_MAGIC, new Uint8Array([PXD_ARCHIVE_VERSION]), writeUint32(manifestBytes.byteLength), manifestBytes, ...payloads);
  return {
    bytes,
    filename: packageFileName(state.projectId),
    mimeType: PXD_MIME_TYPE,
    packageHash: await sha256BytesHex(bytes),
    manifestHash,
    manifest,
  };
}

function validateProjectMetadata(value: unknown): PxdProjectMetadata {
  assert(value !== null && typeof value === "object", "PXD_PROJECT_INVALID", "PXD project metadata is invalid.");
  const project = value as PxdProjectMetadata;
  assert(typeof project.name === "string", "PXD_PROJECT_INVALID", "PXD project name is invalid.");
  assert(Number.isSafeInteger(project.structureEpoch) && project.structureEpoch >= 1, "PXD_PROJECT_INVALID", "PXD structure epoch is invalid.");
  assert(Array.isArray(project.layers) && Array.isArray(project.frames) && Array.isArray(project.cels), "PXD_PROJECT_INVALID", "PXD timeline collections are invalid.");
  assert(project.timeline !== null && typeof project.timeline === "object", "PXD_PROJECT_INVALID", "PXD timeline metadata is invalid.");
  return project;
}

function validateManifest(value: unknown): PxdManifestV1 {
  assert(value !== null && typeof value === "object", "PXD_MANIFEST_INVALID", "PXD manifest must be an object.");
  const manifest = value as PxdManifestV1;
  assert(manifest.format === PXD_FORMAT, "PXD_FORMAT_UNSUPPORTED", "Unsupported PXD format.");
  assert(manifest.schemaVersion === PXD_SCHEMA_VERSION && manifest.archiveVersion === PXD_ARCHIVE_VERSION, "PXD_VERSION_UNSUPPORTED", "Unsupported PXD schema or archive version.");
  assert(manifest.packageKind === "PROJECT_PACKAGE", "PXD_PACKAGE_KIND_UNSUPPORTED", "Unsupported PXD package kind.");
  assert(typeof manifest.packageId === "string" && manifest.packageId.length > 0, "PXD_MANIFEST_INVALID", "PXD packageId is invalid.");
  assert(typeof manifest.projectId === "string" && manifest.projectId.length > 0, "PXD_MANIFEST_INVALID", "PXD projectId is invalid.");
  assert(Array.isArray(manifest.assets) && manifest.assets.length > 0, "PXD_ASSETS_EMPTY", "PXD must contain at least one raster asset.");
  validateProjectMetadata(manifest.project);
  if (manifest.assetDefinitions !== undefined) {
    assert(Array.isArray(manifest.assetDefinitions), "PXD_ASSET_DEFINITION_INVALID", "PXD assetDefinitions must be an array.");
    const entries = manifest.assetDefinitions.map((entry, index) => validateAssetDefinitionEntry(entry, index));
    for (let index = 1; index < entries.length; index += 1) {
      assert(entries[index - 1]!.definitionId < entries[index]!.definitionId, "PXD_ASSET_DEFINITION_ORDER_INVALID", "PXD assetDefinitions must be in canonical definitionId order.");
      assert(entries[index - 1]?.definitionId !== entries[index]?.definitionId, "PXD_ASSET_DEFINITION_DUPLICATE", `Asset Definition ${entries[index]?.definitionId ?? ""} is duplicated.`);
    }
  }
  if (manifest.drawTimelineMetadata !== undefined) {
    const normalized = normalizeDraw2TimelineMetadata(
      manifest.drawTimelineMetadata,
      manifest.project.frames.length,
    );
    assert(
      canonicalJson(normalized) === canonicalJson(manifest.drawTimelineMetadata),
      "PXD_TIMELINE_METADATA_NOT_NORMALIZED",
      "PXD Draw timeline metadata must be canonically normalized.",
    );
  }
  assert(Array.isArray(manifest.dependencies) && manifest.dependencies.length === 0, "PXD_DEPENDENCIES_UNSUPPORTED", "PXD dependencies must be empty in the isolated v1 exporter.");
  assert(typeof manifest.canonicalManifestHash === "string" && /^[a-f0-9]{64}$/u.test(manifest.canonicalManifestHash), "PXD_MANIFEST_HASH_INVALID", "PXD manifest hash is invalid.");
  for (const [index, asset] of manifest.assets.entries()) {
    assert(asset !== null && typeof asset === "object", "PXD_ASSET_INVALID", `PXD asset ${index} is invalid.`);
    assert(typeof asset.assetId === "string" && typeof asset.revisionId === "string", "PXD_ASSET_INVALID", `PXD asset ${index} identity is invalid.`);
    assert(asset.mediaType === "application/vnd.pixieed.indexed-raster", "PXD_ASSET_TYPE_UNSUPPORTED", `PXD asset ${index} media type is unsupported.`);
    assert(/^objects\/asset-\d{4}\.raster$/u.test(asset.path), "PXD_PATH_UNSAFE", `PXD asset ${index} path is invalid.`);
    assert(/^[a-f0-9]{64}$/u.test(asset.sha256), "PXD_ASSET_HASH_INVALID", `PXD asset ${index} hash is invalid.`);
    assert(Number.isSafeInteger(asset.bytes) && asset.bytes > 0, "PXD_ASSET_SIZE_INVALID", `PXD asset ${index} size is invalid.`);
    assert(Number.isSafeInteger(asset.width) && asset.width > 0 && Number.isSafeInteger(asset.height) && asset.height > 0, "PXD_ASSET_DIMENSIONS_INVALID", `PXD asset ${index} dimensions are invalid.`);
    assert(asset.tileSize === 32 || asset.tileSize === 64, "PXD_TILE_SIZE_INVALID", `PXD asset ${index} tile size is invalid.`);
    assert(Array.isArray(asset.palette) && asset.palette.length >= 1 && asset.palette.length <= 256 && asset.palette[0] === 0, "PXD_PALETTE_INVALID", `PXD asset ${index} palette is invalid.`);
    assert(Number.isSafeInteger(asset.revision) && asset.revision >= 0, "PXD_REVISION_INVALID", `PXD asset ${index} revision is invalid.`);
    assert(Number.isSafeInteger(asset.offset) && asset.offset >= 0, "PXD_OFFSET_INVALID", `PXD asset ${index} offset is invalid.`);
  }
  return manifest;
}

function buildImportedAsset(entry: PxdManifestAsset, bytes: Uint8Array): RasterAsset {
  assert(bytes.byteLength === entry.bytes && bytes.byteLength === entry.width * entry.height, "PXD_ASSET_SIZE_MISMATCH", `PXD asset ${entry.assetId} byte size does not match its dimensions.`);
  const raster = IndexedTileRaster.empty(entry.width, entry.height, entry.tileSize);
  for (let index = 0; index < bytes.length; index += 1) {
    const colorIndex = bytes[index] ?? 0;
    assert(colorIndex < entry.palette.length, "PXD_PIXEL_INDEX_INVALID", `PXD asset ${entry.assetId} contains an out-of-range palette index.`);
    if (colorIndex === 0) continue;
    const x = index % entry.width;
    const y = Math.floor(index / entry.width);
    raster.setPixel(entry.assetId, x, y, colorIndex);
  }
  return { id: entry.assetId, width: entry.width, height: entry.height, palette: [...entry.palette], raster, revision: entry.revision };
}

export async function importPxdPackage(bytes: Uint8Array, options: PxdImportOptions = {}): Promise<PxdImportResult> {
  assert(bytes.byteLength >= PXD_HEADER_BYTES, "PXD_TRUNCATED", "PXD package header is truncated.");
  for (let index = 0; index < PXD_MAGIC.length; index += 1) assert(bytes[index] === PXD_MAGIC[index], "PXD_MAGIC_INVALID", "PXD magic header is invalid.");
  assert(bytes[4] === PXD_ARCHIVE_VERSION, "PXD_VERSION_UNSUPPORTED", "Unsupported PXD archive version.");
  const manifestLength = readUint32(bytes, 5, "PXD manifest");
  const manifestStart = PXD_HEADER_BYTES;
  const payloadStart = manifestStart + manifestLength;
  assert(payloadStart <= bytes.byteLength, "PXD_TRUNCATED", "PXD manifest is truncated.");
  let manifest: PxdManifestV1;
  try {
    manifest = validateManifest(JSON.parse(new TextDecoder().decode(bytes.subarray(manifestStart, payloadStart))) as unknown);
  } catch (cause) {
    if (cause instanceof SyntaxError) throw Object.assign(new Error("PXD manifest JSON is invalid."), { code: "PXD_MANIFEST_JSON_INVALID" });
    throw cause;
  }
  const manifestBase = { ...manifest } as Omit<PxdManifestV1, "canonicalManifestHash"> & { canonicalManifestHash?: string };
  delete manifestBase.canonicalManifestHash;
  const actualManifestHash = await sha256BytesHex(new TextEncoder().encode(manifestWithoutHash(manifestBase)));
  assert(actualManifestHash === manifest.canonicalManifestHash, "PXD_MANIFEST_HASH_MISMATCH", "PXD manifest hash does not match its contents.");
  const packageHash = await sha256BytesHex(bytes);
  if (options.expectedPackageHash !== undefined) assert(packageHash === options.expectedPackageHash, "PXD_PACKAGE_HASH_MISMATCH", "PXD package hash does not match the expected hash.");
  const assets: Record<string, RasterAsset> = {};
  let expectedOffset = 0;
  for (const entry of manifest.assets) {
    assert(entry.offset === expectedOffset, "PXD_ASSET_OFFSET_INVALID", `PXD asset ${entry.assetId} is not in canonical payload order.`);
    const start = payloadStart + entry.offset;
    const end = start + entry.bytes;
    assert(end <= bytes.byteLength, "PXD_TRUNCATED", `PXD asset ${entry.assetId} is truncated.`);
    const rasterBytes = bytes.slice(start, end);
    assert(await sha256BytesHex(rasterBytes) === entry.sha256, "PXD_ASSET_HASH_MISMATCH", `PXD asset ${entry.assetId} hash does not match its contents.`);
    assert(assets[entry.assetId] === undefined, "PXD_ASSET_DUPLICATE", `PXD asset ${entry.assetId} is duplicated.`);
    assets[entry.assetId] = buildImportedAsset(entry, rasterBytes);
    expectedOffset += entry.bytes;
  }
  assert(payloadStart + expectedOffset === bytes.byteLength, "PXD_TRAILING_BYTES", "PXD contains unexpected trailing bytes.");
  const primary = manifest.assets[0];
  assert(primary !== undefined, "PXD_ASSETS_EMPTY", "PXD has no primary asset.");
  const project = manifest.project;
  const created = createProject({ projectId: manifest.projectId, name: project.name, width: primary.width, height: primary.height, tileSize: primary.tileSize, palette: primary.palette });
  const state: ProjectState = {
    ...created,
    structureEpoch: project.structureEpoch,
    activeAssetId: project.activeAssetId,
    activeLayerId: project.activeLayerId,
    activeFrameId: project.activeFrameId,
    activeCelId: project.activeCelId,
    layers: project.layers.map((layer) => ({ ...layer })),
    frames: project.frames.map((frame) => ({ ...frame })),
    cels: project.cels.map((cel) => ({ ...cel })),
    timeline: { ...project.timeline, frameOrder: [...project.timeline.frameOrder], layerTrackOrder: [...project.timeline.layerTrackOrder] },
    tilemaps: project.tilemaps ?? {},
    assets,
    appliedCommandIds: [],
    lastClientSequenceByClient: {},
  };
  assert(state.assets[state.activeAssetId] !== undefined, "PXD_ACTIVE_ASSET_MISSING", "PXD active asset is missing.");
  return {
    state,
    packageHash,
    manifestHash: manifest.canonicalManifestHash,
    assetDefinitions: manifest.assetDefinitions === undefined ? [] : manifest.assetDefinitions.map((entry, index) => validateAssetDefinitionEntry(entry, index)),
    drawTimelineMetadata: manifest.drawTimelineMetadata === undefined
      ? normalizeDraw2TimelineMetadata(undefined, state.frames.length)
      : normalizeDraw2TimelineMetadata(
        manifest.drawTimelineMetadata,
        state.frames.length,
      ),
  };
}

interface PxdProjectPayloadSpec {
  readonly path: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function projectPayloadPathIsSafe(path: string): boolean {
  return path.length > 0 && path.length <= 512 &&
    !path.startsWith("/") && !path.includes("\\") &&
    !path.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..") &&
    !/[\u0000\u0009\u000a\u000d]/u.test(path);
}

function projectJsonPayload(value: unknown, path: string): Uint8Array {
  assert(value !== undefined, "PXD_MODULE_STATE_MISSING", `${path} is missing.`);
  const json = canonicalJson(value);
  assert(json.length > 0, "PXD_MODULE_STATE_EMPTY", `${path} is empty.`);
  return new TextEncoder().encode(json);
}

function projectMediaType(value: string, path: string): string {
  assert(typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= 128 && !/[\u0000-\u0020]/u.test(value), "PXD_MEDIA_TYPE_INVALID", `${path} media type is invalid.`);
  return value;
}

function projectPayloadEntry(
  spec: PxdProjectPayloadSpec,
  offset: number,
): PxdProjectPayloadEntry {
  assert(projectPayloadPathIsSafe(spec.path), "PXD_PATH_UNSAFE", `PXD path ${spec.path} is unsafe.`);
  assert(Number.isSafeInteger(offset) && offset >= 0, "PXD_OFFSET_INVALID", `PXD offset for ${spec.path} is invalid.`);
  return {
    path: spec.path,
    mediaType: projectMediaType(spec.mediaType, spec.path),
    sha256: "" as string,
    bytes: spec.bytes.byteLength,
    offset,
  };
}

function projectModuleManifest(
  schemaVersion: string,
  state: PxdProjectPayloadEntry,
  assets: readonly PxdProjectAudioAssetManifest[] = [],
): PxdProjectModuleManifest {
  return {
    schemaVersion,
    status: "EMBEDDED",
    state,
    assets,
  };
}

function emptyProjectModule(): PxdProjectModuleManifest {
  return {
    schemaVersion: null,
    status: "EMPTY",
    state: null,
    assets: [],
  };
}

/**
 * Export one portable PXD containing Draw, Audio, and Game canonical
 * subdocuments.  JSON is limited to module metadata; raster and source audio
 * remain separate binary entries so the Manifest never becomes a giant blob.
 */
export async function exportPxdProject(
  state: ProjectState,
  options: PxdProjectExportOptions = {},
): Promise<PxdProjectExport> {
  const assetDefinitions = normalizeAssetDefinitions(options.assetDefinitions);
  const assetPackages = normalizePxdAssetPackages(options.assetPackages);
  for (const [index, packageManifest] of assetPackages.entries()) {
    const verified = await verifyAssetPackageManifest(packageManifest);
    if (!verified.ok) {
      assert(false, "PXD_ASSET_PACKAGE_HASH_INVALID", `assetPackages[${index}] could not be verified: ${verified.reasons.join("; ")}`);
    }
  }
  const drawTimelineMetadata = options.drawTimelineMetadata === undefined
    ? undefined
    : normalizeDraw2TimelineMetadata(
      options.drawTimelineMetadata,
      state.frames.length,
    );
  const payloadSpecs: PxdProjectPayloadSpec[] = [];
  const drawAssetSpecs: Array<{
    readonly asset: Omit<PxdManifestAsset, "offset" | "sha256" | "bytes" | "path">;
    readonly path: string;
    readonly pixels: Uint8Array;
    readonly sha256: string;
  }> = [];
  const assetIds = Object.keys(state.assets).sort(compareStrings);
  for (const [assetIndex, assetId] of assetIds.entries()) {
    const asset = state.assets[assetId];
    assert(asset !== undefined, "PXD_ASSET_NOT_FOUND", `PXD export asset ${assetId} was not found.`);
    const pixels = asset.raster.toUint8Array();
    const path = `objects/asset-${String(assetIndex).padStart(4, "0")}.raster`;
    const sha256 = await sha256BytesHex(pixels);
    drawAssetSpecs.push({
      asset: {
        assetId: asset.id,
        revisionId: `${asset.id}:revision:${asset.revision}`,
        mediaType: "application/vnd.pixieed.indexed-raster",
        width: asset.width,
        height: asset.height,
        tileSize: asset.raster.tileSize,
        palette: [...asset.palette],
        revision: asset.revision,
      },
      path,
      pixels,
      sha256,
    });
    payloadSpecs.push({
      path,
      mediaType: "application/vnd.pixieed.indexed-raster",
      bytes: pixels,
    });
  }

  let audioStateSpec: PxdProjectPayloadSpec | undefined;
  const audioAssetSpecs: Array<{
    readonly revisionId: string;
    readonly path: string;
    readonly mediaType: string;
    readonly bytes: Uint8Array;
    readonly sha256: string;
  }> = [];
  if (options.audio !== undefined) {
    assert(options.audio.schemaVersion.trim().length > 0, "PXD_MODULE_SCHEMA_INVALID", "Audio schemaVersion is invalid.");
    audioStateSpec = {
      path: "modules/audio/state.json",
      mediaType: "application/json",
      bytes: projectJsonPayload(options.audio.record, "modules.audio.state"),
    };
    payloadSpecs.push(audioStateSpec);
    const sourceAssets = [...(options.audio.assets ?? [])].sort((left, right) => compareStrings(left.revisionId, right.revisionId));
    const seenRevisionIds = new Set<string>();
    for (const [index, source] of sourceAssets.entries()) {
      assert(typeof source.revisionId === "string" && source.revisionId.trim() === source.revisionId && source.revisionId.length > 0, "PXD_AUDIO_REVISION_INVALID", `Audio asset ${index} revisionId is invalid.`);
      assert(!seenRevisionIds.has(source.revisionId), "PXD_AUDIO_REVISION_DUPLICATE", `Audio revision ${source.revisionId} is duplicated.`);
      seenRevisionIds.add(source.revisionId);
      assert(source.bytes.byteLength > 0, "PXD_AUDIO_ASSET_EMPTY", `Audio asset ${source.revisionId} is empty.`);
      const path = `objects/audio-${String(index).padStart(4, "0")}.bin`;
      const mediaType = projectMediaType(source.mediaType, `audio.assets.${source.revisionId}`);
      const sha256 = await sha256BytesHex(source.bytes);
      audioAssetSpecs.push({ revisionId: source.revisionId, path, mediaType, bytes: source.bytes, sha256 });
      payloadSpecs.push({ path, mediaType, bytes: source.bytes });
    }
  }

  let gameStateSpec: PxdProjectPayloadSpec | undefined;
  if (options.game !== undefined) {
    assert(options.game.schemaVersion.trim().length > 0, "PXD_MODULE_SCHEMA_INVALID", "Game schemaVersion is invalid.");
    gameStateSpec = {
      path: "modules/game/state.json",
      mediaType: "application/json",
      bytes: projectJsonPayload(options.game.record, "modules.game.state"),
    };
    payloadSpecs.push(gameStateSpec);
  }

  const availableModules = new Set<PxdProductModule>(["DRAW"]);
  if (options.audio !== undefined) availableModules.add("AUDIO");
  if (options.game !== undefined) availableModules.add("GAME");
  const productDefinitions = normalizePxdProductDefinitions(
    options.productDefinitions,
    assetDefinitions,
    audioAssetSpecs.map((asset) => asset.revisionId),
    availableModules,
  );

  payloadSpecs.sort((left, right) => compareStrings(left.path, right.path));
  const payloadEntries = new Map<string, PxdProjectPayloadEntry>();
  const payloadByPath = new Map<string, Uint8Array>();
  let offset = 0;
  for (const spec of payloadSpecs) {
    assert(!payloadEntries.has(spec.path), "PXD_ENTRY_DUPLICATE", `PXD entry ${spec.path} is duplicated.`);
    const entry = projectPayloadEntry(spec, offset);
    payloadEntries.set(spec.path, {
      ...entry,
      sha256: await sha256BytesHex(spec.bytes),
    });
    payloadByPath.set(spec.path, spec.bytes);
    offset += spec.bytes.byteLength;
  }

  const drawAssets: PxdManifestAsset[] = drawAssetSpecs.map((spec) => {
    const entry = payloadEntries.get(spec.path);
    assert(entry !== undefined, "PXD_ENTRY_MISSING", `PXD Draw entry ${spec.path} is missing.`);
    return {
      ...spec.asset,
      path: spec.path,
      sha256: spec.sha256,
      bytes: spec.pixels.byteLength,
      offset: entry.offset,
    };
  });
  const audioAssets: PxdProjectAudioAssetManifest[] = audioAssetSpecs.map((spec) => {
    const entry = payloadEntries.get(spec.path);
    assert(entry !== undefined, "PXD_ENTRY_MISSING", `PXD Audio entry ${spec.path} is missing.`);
    return { ...entry, revisionId: spec.revisionId };
  });
  const audioModule = options.audio === undefined
    ? emptyProjectModule()
    : projectModuleManifest(
      options.audio.schemaVersion,
      payloadEntries.get(audioStateSpec!.path)!,
      audioAssets,
    );
  const gameModule = options.game === undefined
    ? emptyProjectModule()
    : projectModuleManifest(
      options.game.schemaVersion,
      payloadEntries.get(gameStateSpec!.path)!,
    );
  const content = {
    format: PXD_FORMAT,
    schemaVersion: PXD_PROJECT_SCHEMA_VERSION,
    archiveVersion: PXD_PROJECT_ARCHIVE_VERSION,
    packageKind: "PROJECT_PACKAGE" as const,
    projectId: state.projectId,
    project: projectMetadata(state),
    modules: {
      draw: {
        schemaVersion: "DRAW2_PROJECT_V1" as const,
        status: "EMBEDDED" as const,
        state: null,
        assets: drawAssets,
      },
      audio: audioModule,
      game: gameModule,
    },
    entries: [...payloadEntries.values()],
    assetDefinitions,
    ...(drawTimelineMetadata === undefined ? {} : { drawTimelineMetadata }),
    productDefinitions,
    ...(assetPackages.length === 0 ? {} : { assetPackages }),
    dependencies: [] as const,
  };
  const packageId = `pxd_${(await sha256BytesHex(new TextEncoder().encode(canonicalJson(content)))).slice(0, 32)}`;
  const manifestBase = {
    ...content,
    packageId,
    createdBy: PXD_CREATED_BY,
  };
  const manifestHash = await sha256BytesHex(new TextEncoder().encode(canonicalJson(manifestBase)));
  const manifest: PxdManifestV2 = { ...manifestBase, canonicalManifestHash: manifestHash };
  const manifestBytes = new TextEncoder().encode(canonicalJson(manifest));
  assert(manifestBytes.byteLength <= 0xffffffff, "PXD_MANIFEST_TOO_LARGE", "PXD manifest exceeds the container limit.");
  const payloads = [...payloadEntries.keys()].map((path) => payloadByPath.get(path)!);
  const bytes = concatBytes(
    PXD_MAGIC,
    new Uint8Array([PXD_PROJECT_ARCHIVE_VERSION]),
    writeUint32(manifestBytes.byteLength),
    manifestBytes,
    ...payloads,
  );
  return {
    bytes,
    filename: packageFileName(state.projectId),
    mimeType: PXD_MIME_TYPE,
    packageHash: await sha256BytesHex(bytes),
    manifestHash,
    manifest,
  };
}

function validateProjectPayloadEntry(
  value: unknown,
  path: string,
): PxdProjectPayloadEntry {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "PXD_ENTRY_INVALID", `${path} is invalid.`);
  const entry = value as PxdProjectPayloadEntry;
  assert(projectPayloadPathIsSafe(entry.path), "PXD_PATH_UNSAFE", `${path}.path is unsafe.`);
  assert(typeof entry.mediaType === "string" && entry.mediaType.length > 0, "PXD_MEDIA_TYPE_INVALID", `${path}.mediaType is invalid.`);
  assert(/^[a-f0-9]{64}$/u.test(entry.sha256), "PXD_ENTRY_HASH_INVALID", `${path}.sha256 is invalid.`);
  assert(Number.isSafeInteger(entry.bytes) && entry.bytes > 0, "PXD_ENTRY_SIZE_INVALID", `${path}.bytes is invalid.`);
  assert(Number.isSafeInteger(entry.offset) && entry.offset >= 0, "PXD_OFFSET_INVALID", `${path}.offset is invalid.`);
  return entry;
}

function validateProjectModuleManifest(
  value: unknown,
  path: string,
): PxdProjectModuleManifest {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "PXD_MODULE_INVALID", `${path} is invalid.`);
  const module = value as PxdProjectModuleManifest;
  assert(module.schemaVersion === null || (typeof module.schemaVersion === "string" && module.schemaVersion.length > 0), "PXD_MODULE_SCHEMA_INVALID", `${path}.schemaVersion is invalid.`);
  assert(module.status === "EMPTY" || module.status === "EMBEDDED", "PXD_MODULE_STATUS_INVALID", `${path}.status is invalid.`);
  assert(module.state === null || typeof module.state === "object", "PXD_MODULE_STATE_INVALID", `${path}.state is invalid.`);
  const state = module.state === null ? null : validateProjectPayloadEntry(module.state, `${path}.state`);
  assert(Array.isArray(module.assets), "PXD_MODULE_ASSETS_INVALID", `${path}.assets is invalid.`);
  const assets = module.assets.map((asset, index) => {
    const entry = validateProjectPayloadEntry(asset, `${path}.assets[${index}]`);
    const candidate = asset as PxdProjectAudioAssetManifest;
    assert(typeof candidate.revisionId === "string" && candidate.revisionId.length > 0, "PXD_AUDIO_REVISION_INVALID", `${path}.assets[${index}].revisionId is invalid.`);
    return { ...entry, revisionId: candidate.revisionId };
  });
  if (module.status === "EMPTY") {
    assert(module.schemaVersion === null && state === null && assets.length === 0, "PXD_MODULE_EMPTY_INVALID", `${path} empty module must not contain state or assets.`);
  } else {
    assert(module.schemaVersion !== null && state !== null, "PXD_MODULE_STATE_MISSING", `${path} embedded module state is missing.`);
  }
  return { schemaVersion: module.schemaVersion, status: module.status, state, assets };
}

function validateProjectManifestAsset(
  value: unknown,
  index: number,
): PxdManifestAsset {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "PXD_ASSET_INVALID", `modules.draw.assets[${index}] is invalid.`);
  const asset = value as PxdManifestAsset;
  assert(typeof asset.assetId === "string" && typeof asset.revisionId === "string", "PXD_ASSET_INVALID", `modules.draw.assets[${index}] identity is invalid.`);
  assert(asset.mediaType === "application/vnd.pixieed.indexed-raster", "PXD_ASSET_TYPE_UNSUPPORTED", `modules.draw.assets[${index}] media type is unsupported.`);
  assert(/^objects\/asset-\d{4}\.raster$/u.test(asset.path), "PXD_PATH_UNSAFE", `modules.draw.assets[${index}].path is invalid.`);
  assert(/^[a-f0-9]{64}$/u.test(asset.sha256), "PXD_ASSET_HASH_INVALID", `modules.draw.assets[${index}].sha256 is invalid.`);
  assert(Number.isSafeInteger(asset.bytes) && asset.bytes > 0, "PXD_ASSET_SIZE_INVALID", `modules.draw.assets[${index}].bytes is invalid.`);
  assert(Number.isSafeInteger(asset.width) && asset.width > 0 && Number.isSafeInteger(asset.height) && asset.height > 0, "PXD_ASSET_DIMENSIONS_INVALID", `modules.draw.assets[${index}] dimensions are invalid.`);
  assert(asset.tileSize === 32 || asset.tileSize === 64, "PXD_TILE_SIZE_INVALID", `modules.draw.assets[${index}].tileSize is invalid.`);
  assert(Array.isArray(asset.palette) && asset.palette.length >= 1 && asset.palette.length <= 256 && asset.palette[0] === 0, "PXD_PALETTE_INVALID", `modules.draw.assets[${index}].palette is invalid.`);
  assert(Number.isSafeInteger(asset.revision) && asset.revision >= 0, "PXD_REVISION_INVALID", `modules.draw.assets[${index}].revision is invalid.`);
  assert(Number.isSafeInteger(asset.offset) && asset.offset >= 0, "PXD_OFFSET_INVALID", `modules.draw.assets[${index}].offset is invalid.`);
  return asset;
}

function validateProjectManifest(value: unknown): PxdManifestV2 {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "PXD_MANIFEST_INVALID", "PXD v2 manifest must be an object.");
  const manifest = value as PxdManifestV2;
  assert(manifest.format === PXD_FORMAT, "PXD_FORMAT_UNSUPPORTED", "Unsupported PXD format.");
  assert(manifest.schemaVersion === PXD_PROJECT_SCHEMA_VERSION && manifest.archiveVersion === PXD_PROJECT_ARCHIVE_VERSION, "PXD_VERSION_UNSUPPORTED", "Unsupported PXD project schema or archive version.");
  assert(manifest.packageKind === "PROJECT_PACKAGE", "PXD_PACKAGE_KIND_UNSUPPORTED", "Unsupported PXD package kind.");
  assert(typeof manifest.packageId === "string" && manifest.packageId.length > 0 && typeof manifest.projectId === "string" && manifest.projectId.length > 0, "PXD_MANIFEST_INVALID", "PXD project identity is invalid.");
  assert(Array.isArray(manifest.entries), "PXD_ENTRIES_INVALID", "PXD entries are invalid.");
  const entries = manifest.entries.map((entry, index) => validateProjectPayloadEntry(entry, `entries[${index}]`));
  for (let index = 1; index < entries.length; index += 1) {
    assert(entries[index - 1]!.path < entries[index]!.path, "PXD_ENTRY_ORDER_INVALID", "PXD entries must be in canonical path order.");
  }
  assert(typeof manifest.canonicalManifestHash === "string" && /^[a-f0-9]{64}$/u.test(manifest.canonicalManifestHash), "PXD_MANIFEST_HASH_INVALID", "PXD manifest hash is invalid.");
  assert(Array.isArray(manifest.dependencies) && manifest.dependencies.length === 0, "PXD_DEPENDENCIES_UNSUPPORTED", "PXD project dependencies must be empty.");
  validateProjectMetadata(manifest.project);
  if (manifest.drawTimelineMetadata !== undefined) {
    const normalized = normalizeDraw2TimelineMetadata(
      manifest.drawTimelineMetadata,
      manifest.project.frames.length,
    );
    assert(
      canonicalJson(normalized) === canonicalJson(manifest.drawTimelineMetadata),
      "PXD_TIMELINE_METADATA_NOT_NORMALIZED",
      "PXD Draw timeline metadata must be canonically normalized.",
    );
  }
  assert(manifest.modules !== null && typeof manifest.modules === "object", "PXD_MODULES_INVALID", "PXD modules are missing.");
  const draw = manifest.modules.draw;
  assert(draw !== null && typeof draw === "object" && draw.schemaVersion === "DRAW2_PROJECT_V1" && draw.status === "EMBEDDED" && draw.state === null && Array.isArray(draw.assets) && draw.assets.length > 0, "PXD_DRAW_MODULE_INVALID", "PXD Draw module is invalid.");
  const drawAssets = draw.assets.map((asset, index) => validateProjectManifestAsset(asset, index));
  const audio = validateProjectModuleManifest(manifest.modules.audio, "modules.audio");
  const game = validateProjectModuleManifest(manifest.modules.game, "modules.game");
  if (manifest.assetDefinitions !== undefined) {
    assert(Array.isArray(manifest.assetDefinitions), "PXD_ASSET_DEFINITION_INVALID", "PXD assetDefinitions must be an array.");
  }
  const assetDefinitions = manifest.assetDefinitions === undefined
    ? []
    : manifest.assetDefinitions.map((entry, index) => validateAssetDefinitionEntry(entry, index));
  for (let index = 1; index < assetDefinitions.length; index += 1) {
    assert(assetDefinitions[index - 1]!.definitionId < assetDefinitions[index]!.definitionId, "PXD_ASSET_DEFINITION_ORDER_INVALID", "PXD assetDefinitions must be in canonical definitionId order.");
  }
  const availableModules = new Set<PxdProductModule>(["DRAW"]);
  if (audio.status === "EMBEDDED") availableModules.add("AUDIO");
  if (game.status === "EMBEDDED") availableModules.add("GAME");
  if (manifest.productDefinitions !== undefined) {
    assert(Array.isArray(manifest.productDefinitions), "PXD_PRODUCT_DEFINITION_INVALID", "PXD productDefinitions must be an array.");
  }
  const productDefinitions = normalizePxdProductDefinitions(
    manifest.productDefinitions,
    assetDefinitions,
    audio.assets.map((asset) => asset.revisionId),
    availableModules,
  );
  if (manifest.productDefinitions !== undefined) {
    assert(canonicalJson(productDefinitions) === canonicalJson(manifest.productDefinitions), "PXD_PRODUCT_DEFINITION_NOT_NORMALIZED", "PXD productDefinitions must be canonically normalized.");
  }
  if (manifest.assetPackages !== undefined) {
    assert(Array.isArray(manifest.assetPackages), "PXD_ASSET_PACKAGE_INVALID", "PXD assetPackages must be an array.");
  }
  const assetPackages = normalizePxdAssetPackages(manifest.assetPackages);
  if (manifest.assetPackages !== undefined) {
    assert(canonicalJson(assetPackages) === canonicalJson(manifest.assetPackages), "PXD_ASSET_PACKAGE_NOT_NORMALIZED", "PXD assetPackages must be canonically normalized.");
  }
  const entryPaths = new Set(entries.map((entry) => entry.path));
  for (const asset of drawAssets) assert(entryPaths.has(asset.path), "PXD_ENTRY_MISSING", `PXD Draw entry ${asset.path} is missing.`);
  for (const module of [audio, game]) {
    if (module.state !== null) assert(entryPaths.has(module.state.path), "PXD_ENTRY_MISSING", `PXD module entry ${module.state.path} is missing.`);
    for (const asset of module.assets) assert(entryPaths.has(asset.path), "PXD_ENTRY_MISSING", `PXD module entry ${asset.path} is missing.`);
  }
  return {
    ...manifest,
    modules: { draw: { ...draw, assets: drawAssets }, audio, game },
    entries,
    ...(manifest.assetPackages === undefined ? {} : { assetPackages }),
  };
}

function parseProjectJsonPayload(
  entry: PxdProjectPayloadEntry,
  payloads: ReadonlyMap<string, Uint8Array>,
): unknown {
  const bytes = payloads.get(entry.path);
  assert(bytes !== undefined, "PXD_ENTRY_MISSING", `PXD entry ${entry.path} is missing.`);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (cause) {
    if (cause instanceof SyntaxError) throw Object.assign(new Error(`PXD module JSON ${entry.path} is invalid.`), { code: "PXD_MODULE_JSON_INVALID" });
    throw cause;
  }
}

/** Imports the integrated v2 PXD while preserving the three module boundaries. */
export async function importPxdProject(
  bytes: Uint8Array,
  options: PxdImportOptions = {},
): Promise<PxdProjectImport> {
  assert(bytes.byteLength >= PXD_HEADER_BYTES, "PXD_TRUNCATED", "PXD project header is truncated.");
  for (let index = 0; index < PXD_MAGIC.length; index += 1) assert(bytes[index] === PXD_MAGIC[index], "PXD_MAGIC_INVALID", "PXD magic header is invalid.");
  assert(bytes[4] === PXD_PROJECT_ARCHIVE_VERSION, "PXD_VERSION_UNSUPPORTED", "Unsupported PXD project archive version.");
  const manifestLength = readUint32(bytes, 5, "PXD project manifest");
  const manifestStart = PXD_HEADER_BYTES;
  const payloadStart = manifestStart + manifestLength;
  assert(payloadStart <= bytes.byteLength, "PXD_TRUNCATED", "PXD project manifest is truncated.");
  let manifest: PxdManifestV2;
  try {
    manifest = validateProjectManifest(JSON.parse(new TextDecoder().decode(bytes.subarray(manifestStart, payloadStart))) as unknown);
  } catch (cause) {
    if (cause instanceof SyntaxError) throw Object.assign(new Error("PXD project manifest JSON is invalid."), { code: "PXD_MANIFEST_JSON_INVALID" });
    throw cause;
  }
  const manifestBase = { ...manifest } as Omit<PxdManifestV2, "canonicalManifestHash"> & { canonicalManifestHash?: string };
  delete manifestBase.canonicalManifestHash;
  const actualManifestHash = await sha256BytesHex(new TextEncoder().encode(canonicalJson(manifestBase)));
  assert(actualManifestHash === manifest.canonicalManifestHash, "PXD_MANIFEST_HASH_MISMATCH", "PXD project manifest hash does not match its contents.");
  for (const [index, packageManifest] of (manifest.assetPackages ?? []).entries()) {
    const verified = await verifyAssetPackageManifest(packageManifest);
    if (!verified.ok) {
      assert(false, "PXD_ASSET_PACKAGE_HASH_INVALID", `assetPackages[${index}] could not be verified: ${verified.reasons.join("; ")}`);
    }
  }
  const packageHash = await sha256BytesHex(bytes);
  if (options.expectedPackageHash !== undefined) assert(packageHash === options.expectedPackageHash, "PXD_PACKAGE_HASH_MISMATCH", "PXD package hash does not match the expected hash.");
  const payloads = new Map<string, Uint8Array>();
  let expectedOffset = 0;
  for (const entry of manifest.entries) {
    assert(entry.offset === expectedOffset, "PXD_ENTRY_OFFSET_INVALID", `PXD entry ${entry.path} is not in canonical payload order.`);
    const start = payloadStart + entry.offset;
    const end = start + entry.bytes;
    assert(end <= bytes.byteLength, "PXD_TRUNCATED", `PXD entry ${entry.path} is truncated.`);
    const entryBytes = bytes.slice(start, end);
    assert(await sha256BytesHex(entryBytes) === entry.sha256, "PXD_ENTRY_HASH_MISMATCH", `PXD entry ${entry.path} hash does not match its contents.`);
    payloads.set(entry.path, entryBytes);
    expectedOffset += entry.bytes;
  }
  assert(payloadStart + expectedOffset === bytes.byteLength, "PXD_TRAILING_BYTES", "PXD project contains unexpected trailing bytes.");

  const assets: Record<string, RasterAsset> = {};
  for (const entry of manifest.modules.draw.assets) {
    const rasterBytes = payloads.get(entry.path);
    assert(rasterBytes !== undefined, "PXD_ENTRY_MISSING", `PXD Draw entry ${entry.path} is missing.`);
    assert(await sha256BytesHex(rasterBytes) === entry.sha256, "PXD_ASSET_HASH_MISMATCH", `PXD asset ${entry.assetId} hash does not match its contents.`);
    assert(assets[entry.assetId] === undefined, "PXD_ASSET_DUPLICATE", `PXD asset ${entry.assetId} is duplicated.`);
    assets[entry.assetId] = buildImportedAsset(entry, rasterBytes);
  }
  const primary = manifest.modules.draw.assets[0];
  assert(primary !== undefined, "PXD_ASSETS_EMPTY", "PXD project has no Draw asset.");
  const project = manifest.project;
  const created = createProject({ projectId: manifest.projectId, name: project.name, width: primary.width, height: primary.height, tileSize: primary.tileSize, palette: primary.palette });
  const state: ProjectState = {
    ...created,
    structureEpoch: project.structureEpoch,
    activeAssetId: project.activeAssetId,
    activeLayerId: project.activeLayerId,
    activeFrameId: project.activeFrameId,
    activeCelId: project.activeCelId,
    layers: project.layers.map((layer) => ({ ...layer })),
    frames: project.frames.map((frame) => ({ ...frame })),
    cels: project.cels.map((cel) => ({ ...cel })),
    timeline: { ...project.timeline, frameOrder: [...project.timeline.frameOrder], layerTrackOrder: [...project.timeline.layerTrackOrder] },
    tilemaps: project.tilemaps ?? {},
    assets,
    appliedCommandIds: [],
    lastClientSequenceByClient: {},
  };
  assert(state.assets[state.activeAssetId] !== undefined, "PXD_ACTIVE_ASSET_MISSING", "PXD active Draw asset is missing.");
  const audio = manifest.modules.audio.status === "EMPTY" || manifest.modules.audio.state === null
    ? null
    : {
      schemaVersion: manifest.modules.audio.schemaVersion!,
      record: parseProjectJsonPayload(manifest.modules.audio.state, payloads),
      assets: manifest.modules.audio.assets.map((asset) => ({
        revisionId: asset.revisionId,
        mediaType: asset.mediaType,
        bytes: payloads.get(asset.path)!,
      })),
    };
  const game = manifest.modules.game.status === "EMPTY" || manifest.modules.game.state === null
    ? null
    : {
      schemaVersion: manifest.modules.game.schemaVersion!,
      record: parseProjectJsonPayload(manifest.modules.game.state, payloads),
    };
  const assetDefinitions = manifest.assetDefinitions === undefined
    ? []
    : manifest.assetDefinitions;
  return {
    state,
    packageHash,
    manifestHash: manifest.canonicalManifestHash,
    manifest,
    assetDefinitions,
    drawTimelineMetadata: manifest.drawTimelineMetadata === undefined
      ? normalizeDraw2TimelineMetadata(undefined, state.frames.length)
      : normalizeDraw2TimelineMetadata(
        manifest.drawTimelineMetadata,
        state.frames.length,
      ),
    productDefinitions: manifest.productDefinitions === undefined ? [] : manifest.productDefinitions,
    assetPackages: manifest.assetPackages === undefined ? [] : manifest.assetPackages,
    audio,
    game,
  };
}
