/** FP-005 archive boundary.  Descriptor validation is retained for compatibility;
 * finalization must use the byte-backed ZIP validator below. */
import { FP005_ERROR_CODES, type Fp005ErrorCode } from "./error-codes.ts";
import { inflateRawSync } from "node:zlib";
import { fp005Failure, fp005Success, type Fp005Result } from "./contracts.ts";
import { FP005_INPUT_LIMITS } from "./policies.ts";
import {
  validateArchiveEntries as validateCanonicalArchiveEntries,
  validateArchiveEntry,
  type NormalizedArchiveEntry,
  type RelativePathPolicy,
} from "./path-validation.ts";

export interface Fp005ArchiveSummary {
  readonly entries: readonly NormalizedArchiveEntry[];
  readonly entryCount: number;
  readonly compressedByteLength: number;
  readonly expandedByteLength: number;
  /** False means that the legacy descriptor compatibility path was used. */
  readonly verifiedFromBytes?: boolean;
  readonly format?: "ZIP" | "DESCRIPTOR";
}

interface RecordValue {
  readonly [key: string]: unknown;
}

interface LocalEntry {
  readonly offset: number;
  readonly path: string;
  readonly kind: "FILE" | "DIRECTORY";
  readonly method: number;
  readonly flags: number;
  readonly crc32: number;
  readonly compressedByteLength: number;
  readonly expandedByteLength: number;
  readonly data: Uint8Array;
}

const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_END = 0x06054b50;
const ZIP_EOCD_SEARCH = 65557;
const ZIP_ALLOWED_FLAGS = 0x0800;
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) === 1 ? 0xedb88320 : 0);
    table[index] = value >>> 0;
  }
  return table;
})();

function invalid(message: string, code: Fp005ErrorCode = FP005_ERROR_CODES.ARCHIVE_INVALID): Fp005Result<never> {
  return fp005Failure(code, message, "archive");
}

function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function actualBytes(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return undefined;
}

function archiveBytes(input: unknown): Uint8Array | undefined {
  const direct = actualBytes(input);
  if (direct !== undefined) return direct;
  if (!record(input)) return undefined;
  return actualBytes(input.data) ?? actualBytes(input.bytes);
}

function read16(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 2 > bytes.byteLength) return undefined;
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function read32(bytes: Uint8Array, offset: number): number | undefined {
  if (offset < 0 || offset + 4 > bytes.byteLength) return undefined;
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16) | ((bytes[offset + 3] ?? 0) * 0x1000000);
}

function readName(bytes: Uint8Array, offset: number, length: number): string | undefined {
  if (!Number.isSafeInteger(length) || length < 0 || offset < 0 || offset + length > bytes.byteLength) return undefined;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset, offset + length));
  } catch {
    return undefined;
  }
}

function findEocd(bytes: Uint8Array): number | undefined {
  const first = Math.max(0, bytes.byteLength - ZIP_EOCD_SEARCH);
  for (let offset = bytes.byteLength - 22; offset >= first; offset -= 1) {
    if (read32(bytes, offset) !== ZIP_END) continue;
    const commentLength = read16(bytes, offset + 20);
    if (commentLength !== undefined && offset + 22 + commentLength === bytes.byteLength) return offset;
  }
  return undefined;
}

function zipName(rawName: string): { readonly name: string; readonly kind: "FILE" | "DIRECTORY" } | undefined {
  const directory = rawName.endsWith("/");
  const name = directory ? rawName.slice(0, -1) : rawName;
  if (name.length === 0 || name.endsWith("/")) return undefined;
  return { name, kind: directory ? "DIRECTORY" : "FILE" };
}

function validateZipEntry(
  rawName: string,
  kind: "FILE" | "DIRECTORY",
  compressedByteLength: number,
  expandedByteLength: number,
  externalAttributes?: number,
  versionMadeBy?: number,
  policy?: RelativePathPolicy,
): Fp005Result<NormalizedArchiveEntry> {
  return validateArchiveEntry({
    path: rawName,
    kind,
    compressedByteLength,
    expandedByteLength,
    ...(externalAttributes === undefined ? {} : { externalAttributes }),
    ...(versionMadeBy === undefined ? {} : { versionMadeBy }),
  }, policy);
}

function checkSizes(compressed: number, expanded: number): Fp005Result<true> {
  if (!Number.isSafeInteger(compressed) || !Number.isSafeInteger(expanded) || compressed < 0 || expanded < 0) return invalid("ZIP entry sizes are malformed.");
  if (compressed > FP005_INPUT_LIMITS.maxBlobBytes || expanded > FP005_INPUT_LIMITS.maxExpandedArchiveBytes) return invalid("ZIP entry size exceeds the fixed limit.");
  if (compressed === 0 && expanded > 0) return invalid("ZIP compression ratio exceeds the fixed limit.");
  if (compressed > 0 && expanded / compressed > FP005_INPUT_LIMITS.maxCompressionRatio) return invalid("ZIP compression ratio exceeds the fixed limit.");
  return fp005Success(true);
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ (CRC32_TABLE[(value ^ byte) & 0xff] ?? 0);
  return (value ^ 0xffffffff) >>> 0;
}

function hasActivePayload(bytes: Uint8Array): boolean {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes).toLowerCase();
  return ["<script", "<svg", "<?php", "#!/", "javascript:", "document.", "window.", "function ", "=>"].some((token) => text.includes(token));
}

function decodeZipEntry(local: LocalEntry): Fp005Result<true> {
  let expanded: Uint8Array;
  try {
    expanded = local.method === 0 ? local.data : new Uint8Array(inflateRawSync(local.data));
  } catch {
    return invalid("ZIP Deflate payload cannot be decoded.");
  }
  if (expanded.byteLength !== local.expandedByteLength || crc32(expanded) !== local.crc32) {
    return invalid("ZIP entry CRC or expanded size does not match its header.");
  }
  if (hasActivePayload(expanded)) return invalid("ZIP entry contains active payload content.");
  return fp005Success(true);
}

/** Parse both ZIP local headers and the central directory from actual bytes. */
export function validateZipArchive(input: unknown, policy?: RelativePathPolicy): Fp005Result<Fp005ArchiveSummary> {
  const bytes = archiveBytes(input);
  if (bytes === undefined) return invalid("A real Uint8Array or ArrayBuffer ZIP payload is required.");
  if (bytes.byteLength > FP005_INPUT_LIMITS.maxBlobBytes) return invalid("ZIP payload exceeds the fixed byte limit.", FP005_ERROR_CODES.INPUT_TOO_LARGE);
  const eocd = findEocd(bytes);
  if (eocd === undefined) return invalid("ZIP end record is missing or truncated.");

  const disk = read16(bytes, eocd + 4);
  const centralDisk = read16(bytes, eocd + 6);
  const entryCount = read16(bytes, eocd + 10);
  const centralSize = read32(bytes, eocd + 12);
  const centralOffset = read32(bytes, eocd + 16);
  if (disk === undefined || centralDisk === undefined || entryCount === undefined || centralSize === undefined || centralOffset === undefined) return invalid("ZIP end record is truncated.");
  if (disk !== 0 || centralDisk !== 0) return invalid("Multi-disk ZIP archives are unsupported.");
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) return invalid("ZIP64 archives are not parsed.");
  if (entryCount > FP005_INPUT_LIMITS.maxArchiveEntries) return invalid("ZIP entry count exceeds the fixed limit.");
  if (centralOffset + centralSize !== eocd || centralOffset > bytes.byteLength) return invalid("ZIP central directory range is malformed.");

  const locals = new Map<number, LocalEntry>();
  const localPaths = new Set<string>();
  let localOffset = 0;
  let compressedTotal = 0;
  let expandedTotal = 0;
  while (localOffset < centralOffset) {
    if (read32(bytes, localOffset) !== ZIP_LOCAL) return invalid("ZIP local directory is malformed or truncated.");
    if (localOffset + 30 > centralOffset) return invalid("ZIP local header is truncated.");
    const flags = read16(bytes, localOffset + 6);
    const method = read16(bytes, localOffset + 8);
    const crc = read32(bytes, localOffset + 14);
    const compressed = read32(bytes, localOffset + 18);
    const expanded = read32(bytes, localOffset + 22);
    const nameLength = read16(bytes, localOffset + 26);
    const extraLength = read16(bytes, localOffset + 28);
    if (flags === undefined || method === undefined || crc === undefined || compressed === undefined || expanded === undefined || nameLength === undefined || extraLength === undefined) return invalid("ZIP local header is truncated.");
    if ((flags & ~ZIP_ALLOWED_FLAGS) !== 0 || method !== 0 && method !== 8) return invalid("ZIP local flags or compression method are unsupported.");
    if (compressed === 0xffffffff || expanded === 0xffffffff) return invalid("ZIP64 entry sizes are not parsed.");
    const nameStart = localOffset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressed;
    if (dataStart < nameStart || dataEnd < dataStart || dataEnd > centralOffset) return invalid("ZIP local entry data is truncated.");
    const rawName = readName(bytes, nameStart, nameLength);
    if (rawName === undefined) return invalid("ZIP entry name is not valid UTF-8.");
    const name = zipName(rawName);
    if (name === undefined) return invalid("ZIP entry name is malformed.");
    if (name.kind === "DIRECTORY" && (compressed !== 0 || expanded !== 0)) return invalid("ZIP directory sizes are malformed.");
    const sizes = checkSizes(compressed, expanded);
    if (!sizes.ok) return sizes;
    const entry = validateZipEntry(name.name, name.kind, compressed, expanded, undefined, undefined, policy);
    if (!entry.ok) return entry;
    if (localPaths.has(entry.value.path)) return invalid("ZIP contains duplicate normalized paths.");
    localPaths.add(entry.value.path);
    if (compressedTotal > FP005_INPUT_LIMITS.maxBlobBytes - compressed || expandedTotal > FP005_INPUT_LIMITS.maxExpandedArchiveBytes - expanded) return invalid("ZIP totals exceed the fixed limit.");
    compressedTotal += compressed;
    expandedTotal += expanded;
    locals.set(localOffset, { offset: localOffset, path: entry.value.path, kind: entry.value.kind, method, flags, crc32: crc, compressedByteLength: compressed, expandedByteLength: expanded, data: bytes.slice(dataStart, dataEnd) });
    localOffset = dataEnd;
  }
  if (localOffset !== centralOffset || locals.size !== entryCount) return invalid("ZIP local entry count or boundary does not match the end record.");

  const entries: NormalizedArchiveEntry[] = [];
  const centralPaths = new Set<string>();
  let centralCursor = centralOffset;
  let centralEntries = 0;
  while (centralCursor < eocd) {
    if (read32(bytes, centralCursor) !== ZIP_CENTRAL || centralCursor + 46 > eocd) return invalid("ZIP central directory is malformed or truncated.");
    const versionMadeBy = read16(bytes, centralCursor + 4);
    const flags = read16(bytes, centralCursor + 8);
    const method = read16(bytes, centralCursor + 10);
    const crc = read32(bytes, centralCursor + 16);
    const compressed = read32(bytes, centralCursor + 20);
    const expanded = read32(bytes, centralCursor + 24);
    const nameLength = read16(bytes, centralCursor + 28);
    const extraLength = read16(bytes, centralCursor + 30);
    const commentLength = read16(bytes, centralCursor + 32);
    const diskStart = read16(bytes, centralCursor + 34);
    const externalAttributes = read32(bytes, centralCursor + 38);
    const localOffsetRef = read32(bytes, centralCursor + 42);
    if (versionMadeBy === undefined || flags === undefined || method === undefined || crc === undefined || compressed === undefined || expanded === undefined || nameLength === undefined || extraLength === undefined || commentLength === undefined || diskStart === undefined || externalAttributes === undefined || localOffsetRef === undefined) return invalid("ZIP central directory entry is truncated.");
    if (diskStart !== 0 || (flags & ~ZIP_ALLOWED_FLAGS) !== 0 || method !== 0 && method !== 8) return invalid("ZIP central entry flags or compression method are unsupported.");
    if (compressed === 0xffffffff || expanded === 0xffffffff || localOffsetRef === 0xffffffff) return invalid("ZIP64 central entry fields are not parsed.");
    const nameStart = centralCursor + 46;
    const next = nameStart + nameLength + extraLength + commentLength;
    if (next < nameStart || next > eocd) return invalid("ZIP central entry is truncated.");
    const rawName = readName(bytes, nameStart, nameLength);
    if (rawName === undefined) return invalid("ZIP central entry name is not valid UTF-8.");
    const name = zipName(rawName);
    if (name === undefined) return invalid("ZIP central entry name is malformed.");
    const sizes = checkSizes(compressed, expanded);
    if (!sizes.ok) return sizes;
    const centralEntry = validateZipEntry(name.name, name.kind, compressed, expanded, externalAttributes, versionMadeBy, policy);
    if (!centralEntry.ok) return centralEntry;
    if (centralPaths.has(centralEntry.value.path)) return invalid("ZIP contains duplicate normalized paths.");
    centralPaths.add(centralEntry.value.path);
    const local = locals.get(localOffsetRef);
    if (local === undefined || local.path !== centralEntry.value.path || local.kind !== centralEntry.value.kind || local.method !== method || local.flags !== flags || local.crc32 !== crc || local.compressedByteLength !== compressed || local.expandedByteLength !== expanded) return invalid("ZIP central and local directory entries do not match.");
    const decoded = decodeZipEntry(local);
    if (!decoded.ok) return decoded;
    entries.push(centralEntry.value);
    centralEntries += 1;
    centralCursor = next;
  }
  if (centralCursor !== eocd || centralEntries !== entryCount || centralPaths.size !== locals.size) return invalid("ZIP central entry count does not match the end record.");
  if (compressedTotal === 0 && expandedTotal > 0 || compressedTotal > 0 && expandedTotal / compressedTotal > FP005_INPUT_LIMITS.maxCompressionRatio) return invalid("ZIP compression ratio exceeds the fixed limit.");
  return fp005Success({ entries: Object.freeze(entries), entryCount, compressedByteLength: compressedTotal, expandedByteLength: expandedTotal, verifiedFromBytes: true, format: "ZIP" });
}

export const validateArchiveBytes = validateZipArchive;
export const parseZipArchive = validateZipArchive;

function hasDeclaredSize(value: unknown, keys: readonly string[]): boolean {
  return record(value) && keys.some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function validateDescriptorArchive(input: readonly unknown[], policy?: RelativePathPolicy): Fp005Result<Fp005ArchiveSummary> {
  if (input.length > FP005_INPUT_LIMITS.maxArchiveEntries) return invalid("The archive entry count exceeds the fixed limit.");
  for (const entry of input) {
    if (!hasDeclaredSize(entry, ["compressedByteLength", "compressedSize"]) || !hasDeclaredSize(entry, ["expandedByteLength", "uncompressedSize", "expandedSize"])) return invalid("Archive entries without declared sizes are rejected unless actual bytes are supplied.");
  }
  const result = validateCanonicalArchiveEntries(input, policy);
  if (!result.ok) return result;
  let compressedByteLength = 0;
  let expandedByteLength = 0;
  for (const entry of result.value) {
    const compressed = entry.compressedByteLength ?? 0;
    const expanded = entry.expandedByteLength ?? 0;
    if (compressedByteLength > FP005_INPUT_LIMITS.maxBlobBytes - compressed || expandedByteLength > FP005_INPUT_LIMITS.maxExpandedArchiveBytes - expanded) return invalid("Archive total size exceeds the fixed limit.");
    compressedByteLength += compressed;
    expandedByteLength += expanded;
  }
  return fp005Success({ entries: result.value, entryCount: result.value.length, compressedByteLength, expandedByteLength, verifiedFromBytes: false, format: "DESCRIPTOR" });
}

/** Compatibility facade. Actual ZIP bytes always take the byte-backed path. */
export function validateArchive(input: unknown, policy?: RelativePathPolicy): Fp005Result<Fp005ArchiveSummary> {
  if (archiveBytes(input) !== undefined) return validateZipArchive(input, policy);
  return Array.isArray(input) ? validateDescriptorArchive(input, policy) : invalid("A parsed archive or actual ZIP bytes are required.");
}

export const validateArchiveInput = validateArchive;
export const validateArchiveEntries = validateArchive;
