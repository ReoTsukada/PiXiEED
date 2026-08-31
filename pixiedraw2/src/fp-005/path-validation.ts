/**
 * FP-005 path boundary.
 *
 * This module only deals with untrusted path-shaped values. It does not resolve
 * a filesystem handle, open an archive, or access a provider. A path accepted
 * here is a canonical relative name that can be used by a later adapter.
 */
import { FP005_ERROR_CODES } from "./error-codes.ts";
import {
  fp005Failure,
  fp005Success,
  type Fp005InputLimits,
  type Fp005PathResult,
  type Fp005Result,
  type PathPolicyV1,
} from "./contracts.ts";
import { FP005_INPUT_LIMITS, FP005_PATH_POLICY } from "./policies.ts";

declare const normalizedRelativePathBrand: unique symbol;

/** A path that has passed the FP-005 relative-path boundary. */
export type NormalizedRelativePath = string & {
  readonly [normalizedRelativePathBrand]: "NormalizedRelativePath";
};

export interface NormalizedRelativePathResult extends Omit<Fp005PathResult, "normalizedPath"> {
  readonly normalizedPath: NormalizedRelativePath;
}

export interface NormalizedArchiveEntry {
  readonly path: NormalizedRelativePath;
  readonly kind: "FILE" | "DIRECTORY";
  readonly compressedByteLength?: number;
  readonly expandedByteLength?: number;
}

export type RelativePathPolicy = Pick<PathPolicyV1, "maxPathBytes" | "maxPathSegments">;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
const FORMAT_CHARACTERS = /\p{Cf}/u;
const NON_ASCII_SPACES = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/u;
const CONFUSABLE_PATH_CHARACTERS = /[\u2024\u2025\u2026\u2044\u2215\u2216\u2217\u2218\u2219\u3002\uff0e\uff0f\uff3c\uff61]/u;
const URI_SCHEME_OR_DRIVE = /^[A-Za-z][A-Za-z0-9+.-]*:/u;
const ACTIVE_ENTRY_EXTENSION = /\.(?:bat|bin|cjs|class|cmd|com|dll|docm|exe|htm|html|jar|js|mjs|php|ps1|sh|svg|wasm|xlsm|xlam|xltm|pptm|shtml)$/iu;
const NESTED_ARCHIVE_EXTENSION = /\.(?:7z|arj|gz|jar|rar|tar|tgz|war|zip)$/iu;
const ACTIVE_MIME = /^(?:application\/(?:javascript|java-archive|x-httpd-php|wasm|x-sh)|image\/svg\+xml|text\/(?:html|javascript|x-shellscript))$/iu;
const ACTIVE_OFFICE_ENTRY = /(?:^|\/)(?:vba(?:project|data)?(?:\.[^/]+)?|macros?|activex(?:\/|\.|$)|customui(?:\/|\.|$)|externalLinks(?:\/|\.|$)|embeddings\/oleobject)/iu;

function invalidPath<T = never>(message = "Path is not a safe normalized relative path."): Fp005Result<T> {
  return fp005Failure(FP005_ERROR_CODES.PATH_INVALID, message, "path");
}

function invalidArchive<T = never>(message = "Archive entry is not safe."): Fp005Result<T> {
  return fp005Failure(FP005_ERROR_CODES.ARCHIVE_INVALID, message, "archive");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function hasMalformedOrDangerousPercentEncoding(value: string): boolean {
  let candidate = value;
  for (let pass = 0; pass < 4; pass += 1) {
    if (/%(?![0-9a-f]{2})/iu.test(candidate)) return true;
    const encodedParts = candidate.match(/%(?:[0-9a-f]{2})+/giu) ?? [];
    for (const encodedPart of encodedParts) {
      let decodedPart: string;
      try {
        decodedPart = decodeURIComponent(encodedPart);
      } catch {
        return true;
      }
      if (/[.\\/\u0000-\u001f\u007f-\u009f]/u.test(decodedPart) || FORMAT_CHARACTERS.test(decodedPart) || CONFUSABLE_PATH_CHARACTERS.test(decodedPart)) {
        return true;
      }
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(candidate);
    } catch {
      return true;
    }
    if (decoded === candidate) return false;
    candidate = decoded;
  }
  return true;
}

function effectivePolicy(policy: RelativePathPolicy): RelativePathPolicy {
  const maxPathBytes = Number.isSafeInteger(policy.maxPathBytes) && policy.maxPathBytes > 0
    ? Math.min(policy.maxPathBytes, FP005_PATH_POLICY.maxPathBytes)
    : FP005_PATH_POLICY.maxPathBytes;
  const maxPathSegments = Number.isSafeInteger(policy.maxPathSegments) && policy.maxPathSegments > 0
    ? Math.min(policy.maxPathSegments, FP005_PATH_POLICY.maxPathSegments)
    : FP005_PATH_POLICY.maxPathSegments;
  return { maxPathBytes, maxPathSegments };
}

function extractPath(input: unknown): string | undefined {
  if (typeof input === "string") return input;
  if (!isRecord(input) || typeof input.path !== "string") return undefined;
  if (input.authority !== undefined && input.authority !== "LOCAL" && input.authority !== "SERVER") return undefined;
  return input.path;
}

function brandPath(value: string): NormalizedRelativePath {
  return value as NormalizedRelativePath;
}

function validatePathString(value: string, policy: RelativePathPolicy): Fp005Result<NormalizedRelativePath> {
  const bounded = effectivePolicy(policy);
  if (value.length === 0 || value.length > bounded.maxPathBytes) return invalidPath();
  if (hasUnpairedSurrogate(value) || CONTROL_CHARACTERS.test(value) || value.includes("\\")) return invalidPath();
  if (hasMalformedOrDangerousPercentEncoding(value)) return invalidPath();
  if (FORMAT_CHARACTERS.test(value) || NON_ASCII_SPACES.test(value) || CONFUSABLE_PATH_CHARACTERS.test(value)) return invalidPath();
  if (value.startsWith("/") || URI_SCHEME_OR_DRIVE.test(value)) return invalidPath();

  // Canonical Unicode is required at the boundary. This makes NFC/NFD aliases
  // collide deterministically instead of depending on the backing provider.
  const normalized = value.normalize("NFC");
  if (normalized !== value) return invalidPath("Path must use canonical Unicode normalization.");
  const byteLength = new TextEncoder().encode(normalized).byteLength;
  if (byteLength === 0 || byteLength > bounded.maxPathBytes) return invalidPath();

  const segments = normalized.split("/");
  if (segments.length === 0 || segments.length > bounded.maxPathSegments) return invalidPath();
  for (const segment of segments) {
    if (segment.length === 0 || segment === "." || segment === "..") return invalidPath();
    if (segment.trim() !== segment) return invalidPath("Path segments may not have ambiguous edge whitespace.");
  }
  return fp005Success(brandPath(normalized));
}

/** Validate and return the canonical relative path string. */
export function validateNormalizedRelativePath(
  input: unknown,
  policy: RelativePathPolicy = FP005_PATH_POLICY,
): Fp005Result<NormalizedRelativePath> {
  const path = extractPath(input);
  return path === undefined ? invalidPath() : validatePathString(path, policy);
}

/** Alias emphasizing that the returned value is canonicalized before use. */
export const normalizeRelativePath = validateNormalizedRelativePath;

/** Existing FP-005 path result shape, with a branded normalizedPath value. */
export function validatePath(
  input: unknown,
  policy: RelativePathPolicy | Fp005InputLimits = FP005_PATH_POLICY,
): Fp005Result<NormalizedRelativePathResult> {
  const path = extractPath(input);
  if (path === undefined) return invalidPath();
  const result = validatePathString(path, policy);
  if (!result.ok) return result;
  return fp005Success({
    normalizedPath: result.value,
    segments: Object.freeze(result.value.split("/")),
  });
}

export function isNormalizedRelativePath(value: unknown): value is NormalizedRelativePath {
  if (typeof value !== "string") return false;
  const result = validatePathString(value, FP005_PATH_POLICY);
  return result.ok && result.value === value;
}

/** Reject duplicate paths after the same normalization used by every locator. */
export function validateNormalizedPathSet(
  values: readonly unknown[],
  policy: RelativePathPolicy = FP005_PATH_POLICY,
): Fp005Result<readonly NormalizedRelativePath[]> {
  if (!Array.isArray(values) || values.length > FP005_INPUT_LIMITS.maxArchiveEntries) return invalidArchive("The archive entry count exceeds the fixed limit.");
  const normalizedPaths: NormalizedRelativePath[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const result = validateNormalizedRelativePath(value, policy);
    if (!result.ok) return result;
    if (seen.has(result.value)) return invalidArchive("Archive contains duplicate normalized paths.");
    seen.add(result.value);
    normalizedPaths.push(result.value);
  }
  return fp005Success(Object.freeze(normalizedPaths));
}

function readEntryPath(entry: Record<string, unknown>): string | undefined {
  const path = entry.path;
  const name = entry.name;
  if (path !== undefined && typeof path !== "string") return undefined;
  if (name !== undefined && typeof name !== "string") return undefined;
  if (path !== undefined && name !== undefined && path !== name) return undefined;
  return typeof path === "string" ? path : typeof name === "string" ? name : undefined;
}

function isSymlinkEntry(entry: Record<string, unknown>): boolean {
  if (entry.isSymlink === true || entry.symlink === true) return true;
  if (typeof entry.type === "string" && entry.type.toUpperCase() === "SYMLINK") return true;
  if (typeof entry.kind === "string" && entry.kind.toUpperCase() === "SYMLINK") return true;
  if (typeof entry.entryType === "string" && entry.entryType.toUpperCase() === "SYMLINK") return true;
  if (typeof entry.linkTarget === "string" || typeof entry.symlinkTarget === "string") return true;
  const mode = entry.mode;
  if (typeof mode === "number" && Number.isSafeInteger(mode) && (mode & 0o170000) === 0o120000) return true;
  const externalAttributes = entry.externalAttributes;
  return typeof externalAttributes === "number" && Number.isSafeInteger(externalAttributes)
    && (((externalAttributes >>> 16) & 0o170000) === 0o120000);
}

function readEntryKind(entry: Record<string, unknown>): Fp005Result<"FILE" | "DIRECTORY"> {
  const rawKind = entry.kind ?? entry.type ?? entry.entryType;
  if (rawKind === undefined) return fp005Success("FILE");
  if (typeof rawKind !== "string") return invalidArchive("Archive entry kind is invalid.");
  const kind = rawKind.toUpperCase();
  if (["SYMLINK", "LINK", "ARCHIVE", "ZIP", "NESTED_ARCHIVE"].includes(kind)) return invalidArchive();
  if (["FILE", "REGULAR"].includes(kind)) return fp005Success("FILE");
  if (["DIRECTORY", "DIR"].includes(kind)) return fp005Success("DIRECTORY");
  return invalidArchive("Archive entry kind is unsupported.");
}

function readOptionalByteLength(entry: Record<string, unknown>, keys: readonly string[]): Fp005Result<number | undefined> {
  const key = keys.find((candidate) => entry[candidate] !== undefined);
  if (key === undefined) return fp005Success(undefined);
  const value = entry[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > FP005_INPUT_LIMITS.maxExpandedArchiveBytes) return invalidArchive("Archive entry size is outside the fixed limit.");
  return fp005Success(value as number);
}

interface OptionalBoolean {
  readonly valid: boolean;
  readonly present: boolean;
  readonly value: boolean;
}

function hasArchiveFlag(entry: Record<string, unknown>, keys: readonly string[]): OptionalBoolean {
  let observed: boolean | undefined;
  let present = false;
  for (const key of keys) {
    if (entry[key] === undefined) continue;
    present = true;
    if (typeof entry[key] !== "boolean") return { valid: false, present: true, value: false };
    observed = entry[key] as boolean;
  }
  return { valid: true, present, value: observed ?? false };
}

function hasActiveArchiveName(path: NormalizedRelativePath): boolean {
  return ACTIVE_ENTRY_EXTENSION.test(path);
}

function hasNestedArchiveName(path: NormalizedRelativePath): boolean {
  return NESTED_ARCHIVE_EXTENSION.test(path);
}

function hasActiveOfficeName(path: NormalizedRelativePath): boolean {
  return ACTIVE_OFFICE_ENTRY.test(path);
}

function hasValidExternalAttributes(entry: Record<string, unknown>): boolean {
  const attributes = entry.externalAttributes;
  const madeBy = entry.versionMadeBy ?? entry.madeBy;
  if (attributes !== undefined && (!Number.isSafeInteger(attributes) || (attributes as number) < 0 || (attributes as number) > 0xffffffff)) return false;
  if (madeBy !== undefined && (!Number.isSafeInteger(madeBy) || (madeBy as number) < 0 || (madeBy as number) > 0xffff)) return false;
  return true;
}

/** Validate one untrusted archive-entry descriptor without opening the archive. */
export function validateArchiveEntry(
  input: unknown,
  policy: RelativePathPolicy = FP005_PATH_POLICY,
): Fp005Result<NormalizedArchiveEntry> {
  if (!isRecord(input)) return invalidArchive();
  if (!hasValidExternalAttributes(input)) return invalidArchive("Archive external attributes are malformed.");
  if (isSymlinkEntry(input)) return invalidArchive("Symlink archive entries are not accepted.");
  const pathInput = readEntryPath(input);
  if (pathInput === undefined) return invalidArchive("Archive entry path is required.");
  const path = validateNormalizedRelativePath(pathInput, policy);
  if (!path.ok) return invalidArchive();
  const kind = readEntryKind(input);
  if (!kind.ok) return kind;
  if (hasActiveArchiveName(path.value)) return invalidArchive("Active archive content is not accepted.");
  if (hasActiveOfficeName(path.value)) return invalidArchive("Active Office archive content is not accepted.");
  const activeFlag = hasArchiveFlag(input, ["activeContent", "isActiveContent"]);
  if (!activeFlag.valid || activeFlag.value) return invalidArchive("Active archive content is not accepted.");
  const nestedFlag = hasArchiveFlag(input, ["nestedArchive", "isNestedArchive"]);
  if (!nestedFlag.valid || nestedFlag.value || hasNestedArchiveName(path.value)) return invalidArchive("Nested archives are not accepted.");
  if (input.mimeType !== undefined) {
    if (typeof input.mimeType !== "string" || ACTIVE_MIME.test(input.mimeType)) return invalidArchive("Active archive MIME types are not accepted.");
  }

  const compressed = readOptionalByteLength(input, ["compressedByteLength", "compressedSize"]);
  if (!compressed.ok) return compressed;
  const expanded = readOptionalByteLength(input, ["expandedByteLength", "uncompressedSize", "expandedSize"]);
  if (!expanded.ok) return expanded;
  if (compressed.value !== undefined && expanded.value !== undefined) {
    if (compressed.value === 0 && expanded.value > 0) return invalidArchive("Archive compression ratio exceeds the fixed limit.");
    if (compressed.value > 0 && expanded.value / compressed.value > FP005_INPUT_LIMITS.maxCompressionRatio) return invalidArchive("Archive compression ratio exceeds the fixed limit.");
  }

  const result: NormalizedArchiveEntry = {
    path: path.value,
    kind: kind.value,
    ...(compressed.value === undefined ? {} : { compressedByteLength: compressed.value }),
    ...(expanded.value === undefined ? {} : { expandedByteLength: expanded.value }),
  };
  return fp005Success(result);
}

/** Validate archive entry paths, duplicate identity, and bounded expansion metadata. */
export function validateArchiveEntries(
  input: unknown,
  policy: RelativePathPolicy = FP005_PATH_POLICY,
): Fp005Result<readonly NormalizedArchiveEntry[]> {
  if (!Array.isArray(input) || input.length > FP005_INPUT_LIMITS.maxArchiveEntries) return invalidArchive("The archive entry count exceeds the fixed limit.");
  const entries: NormalizedArchiveEntry[] = [];
  const seen = new Set<string>();
  let compressedTotal = 0;
  let expandedTotal = 0;
  for (const candidate of input) {
    const result = validateArchiveEntry(candidate, policy);
    if (!result.ok) return result;
    if (seen.has(result.value.path)) return invalidArchive("Archive contains duplicate normalized paths.");
    seen.add(result.value.path);
    const compressed = result.value.compressedByteLength ?? 0;
    const expanded = result.value.expandedByteLength ?? 0;
    if (compressedTotal > Number.MAX_SAFE_INTEGER - compressed || expandedTotal > FP005_INPUT_LIMITS.maxExpandedArchiveBytes - expanded) return invalidArchive("Archive expansion exceeds the fixed limit.");
    compressedTotal += compressed;
    expandedTotal += expanded;
    entries.push(result.value);
  }
  if (compressedTotal === 0 && expandedTotal > 0) return invalidArchive("Archive compression ratio exceeds the fixed limit.");
  if (compressedTotal > 0 && expandedTotal / compressedTotal > FP005_INPUT_LIMITS.maxCompressionRatio) return invalidArchive("Archive compression ratio exceeds the fixed limit.");
  return fp005Success(Object.freeze(entries));
}

export const validateArchive = validateArchiveEntries;
export const validateArchivePathSet = validateNormalizedPathSet;
