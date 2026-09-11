/**
 * Server-side package integrity rules shared by the Market verifier and its
 * fixed Deno tests. This validates identity, composition, hashes, sizes,
 * MIME hints, and container signatures. It is not an antivirus scanner.
 */

export const MARKET_PACKAGE_SCHEMA = "pixieed-market-package/v1" as const;
export const MARKET_PACKAGE_MAX_FILES = 128;
export const MARKET_PACKAGE_MAX_BYTES = 50 * 1024 * 1024;
/** Draw2 PXD manifests are metadata only; keep JSON parsing bounded. */
export const MARKET_PXD_MAX_MANIFEST_BYTES = 4 * 1024 * 1024;

export const MARKET_PACKAGE_FORMATS = Object.freeze([
  "pixiedraw-project",
  "png",
  "webp",
  "gif",
  "apng",
  "sprite-sheet-png",
  "aac",
  "aiff",
  "flac",
  "m4a",
  "mid",
  "midi",
  "mp3",
  "oga",
  "ogg",
  "opus",
  "wav",
  "weba",
  "novel-json",
  "visual-project",
  "text",
  "markdown",
  "html",
  "csv",
  "rtf",
  "json",
  "mp4",
  "webm",
  "mov",
  "m4v",
  "ogv",
]);

const FORMAT_SET = new Set(MARKET_PACKAGE_FORMATS);
const IMAGE_FORMATS = new Set([
  "png",
  "webp",
  "gif",
  "apng",
  "sprite-sheet-png",
]);
const AUDIO_FORMATS = new Set([
  "aac",
  "aiff",
  "flac",
  "m4a",
  "mid",
  "midi",
  "mp3",
  "oga",
  "ogg",
  "opus",
  "wav",
  "weba",
]);
const TEXT_FORMATS = new Set([
  "novel-json",
  "visual-project",
  "text",
  "markdown",
  "html",
  "csv",
  "rtf",
  "json",
]);
const VIDEO_FORMATS = new Set(["mp4", "webm", "mov", "m4v", "ogv"]);

export type MarketPackageFile = {
  original_path: string;
  name: string;
  size: number;
  mime_type: string;
  format: string;
  sha256: string;
  storage_path: string;
};

export type DownloadedMarketPackageFile = {
  path: string;
  bytes: Uint8Array;
  mimeType: string;
};

export type MarketPackageValidationInput = {
  manifest: unknown;
  ownerId: string;
  assetId: string;
  sourceSha256: string;
  includedFormats: readonly string[];
  fileObjectPaths: readonly string[];
  downloadedFiles: readonly DownloadedMarketPackageFile[];
};

export type MarketPackageValidationResult =
  | {
    ok: true;
    sourceHash: string;
    composition: string;
    fileCount: number;
    totalBytes: number;
    /** PXD v2 Projects whose embedded Game module is structurally present. */
    gameProjectIds: readonly string[];
  }
  | {
    ok: false;
    code: string;
    message: string;
    path?: string;
  };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : NaN;
}

function sortedUnique(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value)))).sort();
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const a = sortedUnique(left);
  const b = sortedUnique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function textAt(bytes: Uint8Array, offset: number, length: number): string {
  return new TextDecoder().decode(bytes.slice(offset, offset + length));
}

function hasAscii(bytes: Uint8Array, value: string): boolean {
  const needle = new TextEncoder().encode(value);
  if (needle.length === 0 || needle.length > bytes.length) return false;
  outer: for (let offset = 0; offset <= bytes.length - needle.length; offset += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      if (bytes[offset + index] !== needle[index]) continue outer;
    }
    return true;
  }
  return false;
}

function hasBytes(bytes: Uint8Array, expected: readonly number[], offset = 0): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function readZip16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) return -1;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readZip32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) return -1;
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] * 0x1000000)) >>> 0;
}

function isSafeZipPath(path: string): boolean {
  if (!path || path.includes("\0") || path.includes("\\") || path.startsWith("/")) return false;
  return path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

const DRAW2_PXD_MAGIC = [0x50, 0x58, 0x44, 0x00] as const;
const DRAW2_PXD_HEADER_BYTES = 9;
const DRAW2_PXD_MAX_METADATA_ITEMS = 4096;
const DRAW2_PXD_MAX_STRING_BYTES = 4096;
type Draw2PxdVersion = 1 | 2;

type Draw2PxdPayloadEntry = {
  path: string;
  mediaType: string;
  sha256: string;
  bytes: number;
  offset: number;
};

type Draw2PxdRasterAsset = Draw2PxdPayloadEntry & {
  assetId: string;
  revisionId: string;
  width: number;
  height: number;
  tileSize: number;
  palette: readonly unknown[];
  revision: number;
};

type ParsedDraw2Pxd = {
  version: Draw2PxdVersion;
  manifest: Record<string, unknown>;
  payloadStart: number;
  entries: readonly Draw2PxdPayloadEntry[];
};

type Draw2PxdValidationResult =
  | { ok: true; projectId: string; hasGameModule: boolean }
  | { ok: false; code: string; message: string };

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafePxdString(value: unknown, maximum = DRAW2_PXD_MAX_STRING_BYTES): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function isSafePxdInteger(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function hasDraw2PxdMagic(bytes: Uint8Array): boolean {
  return bytes.length >= DRAW2_PXD_MAGIC.length && DRAW2_PXD_MAGIC.every((value, index) => bytes[index] === value);
}

function readPxdUint32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) return -1;
  return (bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function isSafePxdPath(path: string): boolean {
  return isSafeZipPath(path) && !/^[A-Za-z]:/u.test(path) && !/[\u0000-\u001f\u007f]/u.test(path);
}

function knownDraw2PxdV2Path(path: string): boolean {
  return /^objects\/(?:asset-\d{4}\.raster|audio-\d{4}\.bin)$/u.test(path) ||
    path === "modules/audio/state.json" || path === "modules/game/state.json";
}

function validatePxdProjectMetadata(value: unknown): boolean {
  if (!isObjectRecord(value) || !isSafePxdString(value.name) || !isSafePxdInteger(value.structureEpoch, 1)) return false;
  for (const key of ["layers", "frames", "cels"]) {
    const collection = value[key];
    if (!Array.isArray(collection) || collection.length > DRAW2_PXD_MAX_METADATA_ITEMS) return false;
  }
  return isObjectRecord(value.timeline);
}

function validatePxdPayloadEntry(value: unknown): value is Draw2PxdPayloadEntry {
  if (!isObjectRecord(value)) return false;
  return isSafePxdPath(stringValue(value.path)) &&
    isSafePxdString(value.mediaType, 256) &&
    isSha256(value.sha256) &&
    isSafePxdInteger(value.bytes, 1, MARKET_PACKAGE_MAX_BYTES) &&
    isSafePxdInteger(value.offset, 0, MARKET_PACKAGE_MAX_BYTES);
}

function samePxdPayloadEntry(left: Draw2PxdPayloadEntry, right: Draw2PxdPayloadEntry): boolean {
  return left.path === right.path && left.mediaType === right.mediaType && left.sha256 === right.sha256 &&
    left.bytes === right.bytes && left.offset === right.offset;
}

function validatePxdRasterAsset(value: unknown, expectedPathPattern: RegExp): value is Draw2PxdRasterAsset {
  if (!isObjectRecord(value) || !validatePxdPayloadEntry(value)) return false;
  const raster = value as unknown as Draw2PxdRasterAsset;
  if (!isSafePxdString(raster.assetId) || !isSafePxdString(raster.revisionId) ||
    raster.mediaType !== "application/vnd.pixieed.indexed-raster" || !expectedPathPattern.test(raster.path) ||
    !isSafePxdInteger(raster.width, 1, 1_000_000) || !isSafePxdInteger(raster.height, 1, 1_000_000) ||
    (raster.tileSize !== 32 && raster.tileSize !== 64) || !Array.isArray(raster.palette) ||
    raster.palette.length < 1 || raster.palette.length > 256 || raster.palette[0] !== 0 ||
    !isSafePxdInteger(raster.revision, 0)) return false;
  const pixelBytes = raster.width * raster.height;
  if (!Number.isSafeInteger(pixelBytes) || pixelBytes !== raster.bytes || pixelBytes > MARKET_PACKAGE_MAX_BYTES) return false;
  return raster.palette.every((color) => isSafePxdInteger(color, 0, 0xffffffff));
}

function validatePxdModule(
  value: unknown,
  moduleName: "audio" | "game",
): { state: Draw2PxdPayloadEntry | null; assets: readonly Draw2PxdPayloadEntry[] } | null {
  if (!isObjectRecord(value)) return null;
  const status = value.status;
  const schemaVersion = value.schemaVersion;
  const stateValue = value.state;
  const assetsValue = value.assets;
  if ((status !== "EMPTY" && status !== "EMBEDDED") || !Array.isArray(assetsValue) || assetsValue.length > MARKET_PACKAGE_MAX_FILES) return null;
  if (status === "EMPTY") {
    return schemaVersion === null && stateValue === null && assetsValue.length === 0 ? { state: null, assets: [] } : null;
  }
  if (!isSafePxdString(schemaVersion, 256) || !validatePxdPayloadEntry(stateValue) ||
    stateValue.path !== `modules/${moduleName}/state.json` || stateValue.mediaType !== "application/json") return null;
  if (moduleName === "game" && assetsValue.length !== 0) return null;
  const assets: Draw2PxdPayloadEntry[] = [];
  const revisionIds = new Set<string>();
  for (const assetValue of assetsValue) {
    if (!isObjectRecord(assetValue) || !validatePxdPayloadEntry(assetValue)) return null;
    const asset = assetValue as Draw2PxdPayloadEntry & { revisionId?: unknown };
    if (!/^objects\/audio-\d{4}\.bin$/u.test(asset.path) || !isSafePxdString(asset.revisionId) || revisionIds.has(asset.revisionId)) return null;
    revisionIds.add(asset.revisionId);
    assets.push(asset);
  }
  return { state: stateValue, assets };
}

function validateDraw2PxdManifest(
  manifest: Record<string, unknown>,
  version: Draw2PxdVersion,
): readonly Draw2PxdPayloadEntry[] | null {
  if (manifest.format !== "pxd" || manifest.schemaVersion !== version || manifest.archiveVersion !== version ||
    manifest.packageKind !== "PROJECT_PACKAGE" || !isSafePxdString(manifest.packageId) ||
    !isSafePxdString(manifest.projectId) || !isObjectRecord(manifest.createdBy) ||
    !isSafePxdString(manifest.createdBy.application) || !validatePxdProjectMetadata(manifest.project) ||
    !Array.isArray(manifest.dependencies) || manifest.dependencies.length !== 0 || !isSha256(manifest.canonicalManifestHash)) return null;

  if (version === 1) {
    if (!Array.isArray(manifest.assets) || manifest.assets.length === 0 || manifest.assets.length > MARKET_PACKAGE_MAX_FILES) return null;
    const paths = new Set<string>();
    const assetIds = new Set<string>();
    const entries: Draw2PxdPayloadEntry[] = [];
    for (const assetValue of manifest.assets) {
      if (!validatePxdRasterAsset(assetValue, /^objects\/asset-\d{4}\.raster$/u)) return null;
      if (paths.has(assetValue.path) || assetIds.has(assetValue.assetId)) return null;
      paths.add(assetValue.path);
      assetIds.add(assetValue.assetId);
      entries.push(assetValue);
    }
    return entries;
  }

  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0 || manifest.entries.length > MARKET_PACKAGE_MAX_FILES) return null;
  const entries: Draw2PxdPayloadEntry[] = [];
  let previousPath = "";
  for (const entryValue of manifest.entries) {
    if (!validatePxdPayloadEntry(entryValue) || !knownDraw2PxdV2Path(entryValue.path) || entryValue.path <= previousPath) return null;
    previousPath = entryValue.path;
    entries.push(entryValue);
  }

  const modules = manifest.modules;
  if (!isObjectRecord(modules)) return null;
  const draw = modules.draw;
  if (!isObjectRecord(draw) || draw.schemaVersion !== "DRAW2_PROJECT_V1" || draw.status !== "EMBEDDED" ||
    draw.state !== null || !Array.isArray(draw.assets) || draw.assets.length === 0 || draw.assets.length > MARKET_PACKAGE_MAX_FILES) return null;
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const references = new Set<string>();
  const drawAssetIds = new Set<string>();
  for (const assetValue of draw.assets) {
    if (!validatePxdRasterAsset(assetValue, /^objects\/asset-\d{4}\.raster$/u)) return null;
    if (drawAssetIds.has(assetValue.assetId)) return null;
    const entry = entryByPath.get(assetValue.path);
    if (!entry || !samePxdPayloadEntry(assetValue, entry)) return null;
    drawAssetIds.add(assetValue.assetId);
    references.add(assetValue.path);
  }
  for (const moduleName of ["audio", "game"] as const) {
    const module = validatePxdModule(modules[moduleName], moduleName);
    if (module === null) return null;
    if (module.state !== null) {
      const entry = entryByPath.get(module.state.path);
      if (!entry || !samePxdPayloadEntry(module.state, entry)) return null;
      references.add(module.state.path);
    }
    for (const asset of module.assets) {
      const entry = entryByPath.get(asset.path);
      if (!entry || !samePxdPayloadEntry(asset, entry)) return null;
      references.add(asset.path);
    }
  }
  return references.size === entries.length && entries.every((entry) => references.has(entry.path)) ? entries : null;
}

function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 64) throw new Error("PXD manifest nesting is too deep.");
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry, depth + 1)).join(",")}]`;
  if (isObjectRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], depth + 1)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseDraw2PxdContainer(bytes: Uint8Array): ParsedDraw2Pxd | null {
  if (!hasDraw2PxdMagic(bytes) || bytes.length < DRAW2_PXD_HEADER_BYTES || bytes.length > MARKET_PACKAGE_MAX_BYTES) return null;
  const version = bytes[4];
  if (version !== 1 && version !== 2) return null;
  const manifestLength = readPxdUint32(bytes, 5);
  if (manifestLength < 2 || manifestLength > MARKET_PXD_MAX_MANIFEST_BYTES) return null;
  const payloadStart = DRAW2_PXD_HEADER_BYTES + manifestLength;
  if (payloadStart > bytes.length) return null;
  let manifest: unknown;
  try {
    manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(DRAW2_PXD_HEADER_BYTES, payloadStart)));
  } catch (_error) {
    return null;
  }
  if (!isObjectRecord(manifest)) return null;
  const entries = validateDraw2PxdManifest(manifest, version);
  return entries === null ? null : { version, manifest, payloadStart, entries };
}

async function validateDraw2PxdPayload(bytes: Uint8Array): Promise<Draw2PxdValidationResult> {
  const parsed = parseDraw2PxdContainer(bytes);
  if (parsed === null) return { ok: false, code: "PXD_CONTAINER_INVALID", message: "Draw2 PXD header or manifest is invalid" };
  let manifestBase: Record<string, unknown>;
  try {
    manifestBase = { ...parsed.manifest };
    delete manifestBase.canonicalManifestHash;
    if (await sha256Hex(new TextEncoder().encode(canonicalJson(manifestBase))) !== parsed.manifest.canonicalManifestHash) {
      return { ok: false, code: "PXD_MANIFEST_HASH_MISMATCH", message: "Draw2 PXD manifest hash does not match its contents" };
    }
  } catch (_error) {
    return { ok: false, code: "PXD_MANIFEST_CANONICALIZATION_FAILED", message: "Draw2 PXD manifest cannot be canonically verified" };
  }

  let expectedOffset = 0;
  for (const entry of parsed.entries) {
    if (entry.offset !== expectedOffset) return { ok: false, code: "PXD_PAYLOAD_OFFSET_INVALID", message: "Draw2 PXD payload offsets are not contiguous" };
    const start = parsed.payloadStart + entry.offset;
    const end = start + entry.bytes;
    if (start < parsed.payloadStart || end < start || end > bytes.length) return { ok: false, code: "PXD_PAYLOAD_BOUNDARY_INVALID", message: "Draw2 PXD payload boundary is invalid" };
    if (await sha256Hex(bytes.slice(start, end)) !== entry.sha256) return { ok: false, code: "PXD_PAYLOAD_HASH_MISMATCH", message: "Draw2 PXD payload hash does not match its manifest" };
    expectedOffset += entry.bytes;
  }
  if (parsed.payloadStart + expectedOffset !== bytes.length) return { ok: false, code: "PXD_TRAILING_BYTES", message: "Draw2 PXD contains bytes outside its declared payload" };
  const modules = parsed.manifest.modules;
  const game = isObjectRecord(modules) && isObjectRecord(modules.game)
    ? modules.game
    : null;
  return {
    ok: true,
    projectId: stringValue(parsed.manifest.projectId),
    hasGameModule: parsed.version === 2 && game?.status === "EMBEDDED" && game.state !== null,
  };
}

function isSafePxdZip(bytes: Uint8Array): boolean {
  if (bytes.length < 22 || bytes.length > MARKET_PACKAGE_MAX_BYTES) return false;
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (readZip32(bytes, offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) return false;
  const disk = readZip16(bytes, eocd + 4);
  const centralDisk = readZip16(bytes, eocd + 6);
  const entryCount = readZip16(bytes, eocd + 10);
  const centralSize = readZip32(bytes, eocd + 12);
  const centralOffset = readZip32(bytes, eocd + 16);
  const commentLength = readZip16(bytes, eocd + 20);
  if (disk !== 0 || centralDisk !== 0 || entryCount < 1 || entryCount > MARKET_PACKAGE_MAX_FILES ||
    eocd + 22 + commentLength !== bytes.length || centralOffset + centralSize !== eocd) return false;

  const names = new Set<string>();
  const localEntries = new Map<string, { offset: number; compressedSize: number; uncompressedSize: number }>();
  let cursor = 0;
  while (cursor < centralOffset) {
    if (readZip32(bytes, cursor) !== 0x04034b50) return false;
    const flags = readZip16(bytes, cursor + 6);
    const method = readZip16(bytes, cursor + 8);
    const compressedSize = readZip32(bytes, cursor + 18);
    const uncompressedSize = readZip32(bytes, cursor + 22);
    const nameLength = readZip16(bytes, cursor + 26);
    const extraLength = readZip16(bytes, cursor + 28);
    const nameStart = cursor + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = textAt(bytes, nameStart, nameLength);
    if (flags !== 0 || method !== 0 || compressedSize !== uncompressedSize || compressedSize > MARKET_PACKAGE_MAX_BYTES ||
      !isSafeZipPath(name) || names.has(name) || dataStart < nameStart || dataEnd > centralOffset) return false;
    names.add(name);
    localEntries.set(name, { offset: cursor, compressedSize, uncompressedSize });
    cursor = dataEnd;
  }
  if (cursor !== centralOffset || names.size !== entryCount) return false;

  cursor = centralOffset;
  let centralEntries = 0;
  while (cursor < eocd) {
    if (readZip32(bytes, cursor) !== 0x02014b50) return false;
    const flags = readZip16(bytes, cursor + 8);
    const method = readZip16(bytes, cursor + 10);
    const compressedSize = readZip32(bytes, cursor + 20);
    const uncompressedSize = readZip32(bytes, cursor + 24);
    const nameLength = readZip16(bytes, cursor + 28);
    const extraLength = readZip16(bytes, cursor + 30);
    const commentLength = readZip16(bytes, cursor + 32);
    const localOffset = readZip32(bytes, cursor + 42);
    const name = textAt(bytes, cursor + 46, nameLength);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    const local = localEntries.get(name);
    if (flags !== 0 || method !== 0 || !local || local.offset !== localOffset ||
      local.compressedSize !== compressedSize || local.uncompressedSize !== uncompressedSize || next > eocd) return false;
    centralEntries += 1;
    cursor = next;
  }
  return cursor === eocd && centralEntries === entryCount && names.has("manifest.json") && names.has("project.json");
}

export function hasValidContainerSignature(format: string, bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  switch (format) {
    case "png":
    case "sprite-sheet-png":
      return hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "apng":
      return hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && hasAscii(bytes, "acTL");
    case "webp":
      return hasAscii(bytes.slice(0, 4), "RIFF") && hasAscii(bytes.slice(8, 12), "WEBP");
    case "gif":
      return textAt(bytes, 0, 6) === "GIF87a" || textAt(bytes, 0, 6) === "GIF89a";
    case "pixiedraw-project":
      return hasDraw2PxdMagic(bytes) ? parseDraw2PxdContainer(bytes) !== null : isSafePxdZip(bytes);
    case "wav":
      return hasAscii(bytes.slice(0, 4), "RIFF") && hasAscii(bytes.slice(8, 12), "WAVE");
    case "aiff":
      return hasAscii(bytes.slice(0, 4), "FORM") && (hasAscii(bytes.slice(8, 12), "AIFF") || hasAscii(bytes.slice(8, 12), "AIFC"));
    case "flac":
      return hasAscii(bytes.slice(0, 4), "fLaC");
    case "m4a":
      return hasAscii(bytes.slice(4, 8), "ftyp");
    case "mid":
    case "midi":
      return hasAscii(bytes.slice(0, 4), "MThd");
    case "ogg":
    case "oga":
    case "opus":
      return hasAscii(bytes.slice(0, 4), "OggS");
    case "weba":
      return hasBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    case "mp3":
      return hasAscii(bytes.slice(0, 3), "ID3") || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    case "aac":
      return bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0;
    case "mp4":
    case "mov":
    case "m4v":
      return hasAscii(bytes.slice(4, 8), "ftyp");
    case "webm":
      return hasBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    case "ogv":
      return hasAscii(bytes.slice(0, 4), "OggS");
    case "novel-json":
    case "visual-project":
    case "json":
    case "text":
    case "markdown":
    case "html":
    case "csv":
    case "rtf": {
      if (bytes.some((value) => value === 0)) return false;
      let decoded = "";
      try {
        decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch (_error) {
        return false;
      }
      if (!decoded.trim()) return false;
      if (format === "rtf" && !decoded.trimStart().startsWith("{\\rtf")) return false;
      if (format === "novel-json" || format === "visual-project" || format === "json") {
        try {
          const parsed = JSON.parse(decoded);
          if (format === "novel-json") {
            return parsed?.contentKind === "NOVEL" || parsed?.contentAggregate?.novel?.contentKind === "NOVEL";
          }
          if (format === "visual-project") return parsed?.kind === "pixieed-visual-project";
          return parsed !== null && typeof parsed === "object";
        } catch (_error) {
          return false;
        }
      }
      return true;
    }
    default:
      return false;
  }
}

function mimeMatches(format: string, mimeType: string): boolean {
  const mime = mimeType.toLowerCase().split(";", 1)[0].trim();
  if (!mime || mime === "application/octet-stream") return true;
  if (format === "pixiedraw-project") return ["application/vnd.pixieed.pxd", "application/zip", "application/x-zip-compressed"].includes(mime);
  if (format === "png" || format === "apng" || format === "sprite-sheet-png") return ["image/png", "image/apng"].includes(mime);
  if (format === "webp") return mime === "image/webp";
  if (format === "gif") return mime === "image/gif";
  if (AUDIO_FORMATS.has(format)) return mime.startsWith("audio/") || mime === "audio/midi" || mime === "application/ogg";
  if (format === "mp4") return ["video/mp4", "application/mp4"].includes(mime);
  if (format === "mov") return ["video/quicktime", "video/mov"].includes(mime);
  if (format === "m4v") return ["video/x-m4v", "video/mp4"].includes(mime);
  if (format === "webm") return mime === "video/webm";
  if (format === "ogv") return ["video/ogg", "application/ogg"].includes(mime);
  if (format === "novel-json" || format === "visual-project" || format === "json") return ["application/json", "text/json", "text/plain"].includes(mime);
  if (format === "markdown") return ["text/markdown", "text/x-markdown", "text/plain"].includes(mime);
  if (format === "html") return ["text/html", "application/xhtml+xml"].includes(mime);
  if (format === "csv") return ["text/csv", "text/plain"].includes(mime);
  if (format === "rtf") return ["application/rtf", "text/rtf"].includes(mime);
  if (format === "text") return mime.startsWith("text/");
  return false;
}

function deriveComposition(formats: readonly string[]): string {
  const unique = sortedUnique(formats);
  if (unique.length === 1 && unique[0] === "pixiedraw-project") return "pixiedraw-project";
  const hasImage = unique.some((format) => IMAGE_FORMATS.has(format));
  const hasAudio = unique.some((format) => AUDIO_FORMATS.has(format));
  const hasText = unique.some((format) => TEXT_FORMATS.has(format));
  const hasVideo = unique.some((format) => VIDEO_FORMATS.has(format));
  if (hasAudio && hasImage && unique.every((format) => IMAGE_FORMATS.has(format) || AUDIO_FORMATS.has(format))) return "image-audio";
  if (hasText && hasImage && unique.every((format) => TEXT_FORMATS.has(format) || IMAGE_FORMATS.has(format))) return "text-image";
  if (hasVideo && hasImage && unique.every((format) => VIDEO_FORMATS.has(format) || IMAGE_FORMATS.has(format))) return "image-video";
  if (hasAudio && unique.every((format) => AUDIO_FORMATS.has(format))) return "audio-only";
  if (hasText && unique.every((format) => TEXT_FORMATS.has(format))) return "text-only";
  if (hasVideo && unique.every((format) => VIDEO_FORMATS.has(format))) return "video-only";
  if (hasImage && unique.every((format) => IMAGE_FORMATS.has(format))) return "image-only";
  return "all-files";
}

function failure(code: string, message: string, path?: string): MarketPackageValidationResult {
  return path === undefined ? { ok: false, code, message } : { ok: false, code, message, path };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const stableBytes = new Uint8Array(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", stableBytes.buffer as ArrayBuffer));
  return Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function computeMarketPackageSourceHash(files: readonly MarketPackageFile[]): Promise<string> {
  const fingerprint = JSON.stringify(files.map(({ original_path, size, format, sha256 }) => ({
    original_path,
    size,
    format,
    sha256,
  })));
  return sha256Hex(new TextEncoder().encode(fingerprint));
}

export async function validateMarketPackage(input: MarketPackageValidationInput): Promise<MarketPackageValidationResult> {
  const manifest = record(input.manifest);
  if (stringValue(manifest.schema) !== MARKET_PACKAGE_SCHEMA) return failure("MANIFEST_SCHEMA", "unsupported market package manifest");
  const filesValue = manifest.files;
  if (!Array.isArray(filesValue) || filesValue.length === 0 || filesValue.length > MARKET_PACKAGE_MAX_FILES) {
    return failure("MANIFEST_FILES", "market package file count is invalid");
  }
  const files = filesValue.map((value) => record(value)) as unknown as MarketPackageFile[];
  const formats = files.map((file) => stringValue(file.format));
  if (formats.some((format) => !FORMAT_SET.has(format))) return failure("FORMAT_UNSUPPORTED", "package contains an unsupported format");
  if (!sameStringSet(formats, input.includedFormats)) return failure("FORMAT_MISMATCH", "manifest formats do not match the listing formats");
  const composition = deriveComposition(formats);
  if (stringValue(manifest.product_composition) !== composition) return failure("COMPOSITION_MISMATCH", "package composition does not match its files");
  if (numberValue(manifest.file_count) !== files.length) return failure("FILE_COUNT_MISMATCH", "manifest file count does not match its files");

  const expectedPrefix = `${input.ownerId}/${input.assetId}/files/`;
  const expectedPaths = new Set(input.fileObjectPaths);
  const downloadedByPath = new Map(input.downloadedFiles.map((file) => [file.path, file]));
  if (expectedPaths.size !== input.fileObjectPaths.length || downloadedByPath.size !== input.downloadedFiles.length) return failure("DUPLICATE_PATH", "package contains duplicate storage paths");

  let totalBytes = 0;
  const gameProjectIds = new Set<string>();
  for (const file of files) {
    const path = stringValue(file.storage_path);
    const format = stringValue(file.format);
    const size = numberValue(file.size);
    const hash = stringValue(file.sha256).toLowerCase();
    if (!path.startsWith(expectedPrefix) || !expectedPaths.has(path)) return failure("PATH_SCOPE", "file path is outside the seller package scope", path);
    if (!stringValue(file.original_path) || !Number.isSafeInteger(size) || size < 1 || !/^[0-9a-f]{64}$/u.test(hash)) return failure("FILE_METADATA", "file metadata is invalid", path);
    const downloaded = downloadedByPath.get(path);
    if (!downloaded) return failure("FILE_MISSING", "a manifest file was not found in Storage", path);
    if (downloaded.bytes.byteLength !== size) return failure("SIZE_MISMATCH", "Storage size differs from the signed manifest", path);
    if (!mimeMatches(format, downloaded.mimeType)) return failure("MIME_MISMATCH", "Storage MIME differs from the declared format", path);
    if (!hasValidContainerSignature(format, downloaded.bytes)) return failure("MAGIC_MISMATCH", "file container signature does not match its format", path);
    if (format === "pixiedraw-project" && hasDraw2PxdMagic(downloaded.bytes)) {
      const pxdValidation = await validateDraw2PxdPayload(downloaded.bytes);
      if (!pxdValidation.ok) return failure(pxdValidation.code, pxdValidation.message, path);
      if (pxdValidation.hasGameModule) gameProjectIds.add(pxdValidation.projectId);
    }
    const actualHash = await sha256Hex(downloaded.bytes);
    if (actualHash !== hash) return failure("HASH_MISMATCH", "Storage bytes differ from the signed manifest", path);
    totalBytes += size;
  }
  if (totalBytes > MARKET_PACKAGE_MAX_BYTES || numberValue(manifest.total_bytes) !== totalBytes) return failure("TOTAL_BYTES_MISMATCH", "manifest total size does not match Storage");
  if (expectedPaths.size !== files.length) return failure("PATH_COUNT_MISMATCH", "request file paths do not match the manifest");

  const sourceHash = await computeMarketPackageSourceHash(files);
  if (sourceHash !== String(input.sourceSha256 || "").toLowerCase()) return failure("SOURCE_HASH_MISMATCH", "package fingerprint differs from the listing draft");
  return {
    ok: true,
    sourceHash,
    composition,
    fileCount: files.length,
    totalBytes,
    gameProjectIds: [...gameProjectIds].sort(),
  };
}
