/**
 * Server-side package integrity rules shared by the Market verifier and its
 * fixed Deno tests. This validates identity, composition, hashes, sizes,
 * MIME hints, and container signatures. It is not an antivirus scanner.
 */

export const MARKET_PACKAGE_SCHEMA = "pixieed-market-package/v1" as const;
export const MARKET_PACKAGE_MAX_FILES = 128;
export const MARKET_PACKAGE_MAX_BYTES = 50 * 1024 * 1024;

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
      return isSafePxdZip(bytes);
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
    const actualHash = await sha256Hex(downloaded.bytes);
    if (actualHash !== hash) return failure("HASH_MISMATCH", "Storage bytes differ from the signed manifest", path);
    totalBytes += size;
  }
  if (totalBytes > MARKET_PACKAGE_MAX_BYTES || numberValue(manifest.total_bytes) !== totalBytes) return failure("TOTAL_BYTES_MISMATCH", "manifest total size does not match Storage");
  if (expectedPaths.size !== files.length) return failure("PATH_COUNT_MISMATCH", "request file paths do not match the manifest");

  const sourceHash = await computeMarketPackageSourceHash(files);
  if (sourceHash !== String(input.sourceSha256 || "").toLowerCase()) return failure("SOURCE_HASH_MISMATCH", "package fingerprint differs from the listing draft");
  return { ok: true, sourceHash, composition, fileCount: files.length, totalBytes };
}
