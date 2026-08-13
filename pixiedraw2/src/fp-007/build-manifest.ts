/**
 * FP-007 Track 3: deterministic build manifest.
 *
 * This is an isolated reference contract. It deliberately does not execute a
 * build, read the host, inspect a cache, or contact a package registry. The
 * caller must supply already measured, repo-relative inputs.
 */

export const FP007_BUILD_MANIFEST_DOCUMENT =
  "PIXIEED-FP007-BUILD-MANIFEST-001" as const;
export const FP007_BUILD_MANIFEST_SCHEMA_VERSION = "1.0.0" as const;
export const FP007_HASH_ALGORITHM = "SHA-256" as const;

export type SourceMapMode = "INCLUDED" | "EXCLUDED";
export type MappingProofMode =
  | "SOURCE_MAP"
  | "DIRECT_SOURCE_DIGEST_CHAIN"
  | "EMBEDDED_SOURCE_REFERENCES";

export interface SourceMapPolicy {
  readonly mode: SourceMapMode;
  readonly mappingProof: MappingProofMode;
  readonly declaredMapPaths: readonly string[];
}

export interface BuildSourceInput {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface BuildManifestInput {
  readonly buildCommand: readonly string[];
  readonly entries: readonly string[];
  readonly initialChunks: readonly string[];
  readonly lazyChunks: readonly string[];
  readonly sourceMapPolicy: SourceMapPolicy;
  readonly sourceFiles: readonly BuildSourceInput[];
  readonly declaredArtifacts: readonly string[];
  readonly schemaRegistryDigest: string;
  readonly dependencyGraphHash: string;
  readonly lockfileHash: string;
  readonly toolchainHash: string;
  readonly allowlistedEnvironmentHash: string;
}

export interface CanonicalBuildManifest {
  readonly documentId: typeof FP007_BUILD_MANIFEST_DOCUMENT;
  readonly schemaVersion: typeof FP007_BUILD_MANIFEST_SCHEMA_VERSION;
  readonly hashAlgorithm: typeof FP007_HASH_ALGORITHM;
  readonly buildCommand: readonly string[];
  readonly entries: readonly string[];
  readonly initialChunks: readonly string[];
  readonly lazyChunks: readonly string[];
  readonly sourceMapPolicy: SourceMapPolicy;
  readonly sourceFiles: readonly BuildSourceInput[];
  readonly declaredArtifacts: readonly string[];
  readonly deterministicInputs: {
    readonly schemaRegistryDigest: string;
    readonly dependencyGraphHash: string;
    readonly lockfileHash: string;
    readonly toolchainHash: string;
    readonly allowlistedEnvironmentHash: string;
  };
}

export type BuildManifestDiagnosticCode =
  | "INPUT_NOT_OBJECT"
  | "UNKNOWN_FIELD"
  | "FORBIDDEN_CANONICAL_INPUT"
  | "INVALID_COMMAND"
  | "INVALID_REPO_RELATIVE_PATH"
  | "DUPLICATE_PATH"
  | "INITIAL_LAZY_OVERLAP"
  | "ENTRY_NOT_INITIAL"
  | "INVALID_SOURCE_INPUT"
  | "INVALID_BYTES"
  | "INVALID_SHA256"
  | "INVALID_SOURCE_MAP_POLICY"
  | "SOURCE_MAP_PROOF_MISSING"
  | "SOURCE_MAP_PATH_INVALID"
  | "HASH_INPUT_INVALID"
  | "UNDECLARED_ENTRY"
  | "ABSOLUTE_PATH_INPUT"
  | "NONDETERMINISTIC_STRING_INPUT";

export interface BuildManifestDiagnostic {
  readonly code: BuildManifestDiagnosticCode;
  readonly message: string;
  readonly path?: string;
}

export type BuildManifestResult<T> =
  | {
    readonly ok: true;
    readonly value: T;
    readonly diagnostics: readonly BuildManifestDiagnostic[];
  }
  | {
    readonly ok: false;
    readonly diagnostics: readonly BuildManifestDiagnostic[];
  };

const HASH = /^[a-f0-9]{64}$/u;
const FORBIDDEN_KEYS = new Set([
  "generatedAt",
  "timestamp",
  "createdAt",
  "updatedAt",
  "measuredAt",
  "host",
  "hostname",
  "locale",
  "random",
  "randomId",
  "userPath",
  "absolutePath",
  "cwd",
  "cacheState",
  "networkState",
  "networkMode",
]);
const TOP_LEVEL_KEYS = new Set([
  "buildCommand",
  "entries",
  "initialChunks",
  "lazyChunks",
  "sourceMapPolicy",
  "sourceFiles",
  "declaredArtifacts",
  "schemaRegistryDigest",
  "dependencyGraphHash",
  "lockfileHash",
  "toolchainHash",
  "allowlistedEnvironmentHash",
]);
const SOURCE_KEYS = new Set(["path", "bytes", "sha256"]);
const SOURCE_MAP_KEYS = new Set(["mode", "mappingProof", "declaredMapPaths"]);

function diagnostic(
  code: BuildManifestDiagnosticCode,
  message: string,
  path?: string,
): BuildManifestDiagnostic {
  return { code, message, ...(path === undefined ? {} : { path }) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertCanonicalJsonValue(
  value: unknown,
  path = "$",
  seen = new Set<object>(),
): void {
  if (
    value === undefined || typeof value === "function" ||
    typeof value === "symbol" || typeof value === "bigint"
  ) {
    throw new Error(`Non-canonical value at ${path}.`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`Non-finite number at ${path}.`);
  }
  if (value !== null && typeof value === "object") {
    if (seen.has(value)) throw new Error(`Circular value at ${path}.`);
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        assertCanonicalJsonValue(item, `${path}[${index}]`, seen)
      );
    } else {for (const [key, item] of Object.entries(value)) {
        assertCanonicalJsonValue(item, `${path}.${key}`, seen);
      }}
    seen.delete(value);
  }
}

/** Deterministic JSON: sorted object keys, preserved array order, no ambient values. */
export function canonicalJson(value: unknown): string {
  assertCanonicalJsonValue(value);
  if (value === null) return "null";
  if (
    typeof value === "string" || typeof value === "boolean" ||
    typeof value === "number"
  ) return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const object = value as Record<string, unknown>;
  return `{${
    Object.keys(object).sort(compareStable).map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(object[key])}`
    ).join(",")
  }}`;
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function isSha256(value: unknown): value is string {
  return typeof value === "string" && HASH.test(value);
}

export function normalizeRepoRelativePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replaceAll("\\", "/");
  if (
    normalized.length === 0 || normalized.startsWith("/") ||
    /^[A-Za-z]:\//u.test(normalized) || normalized.startsWith("//")
  ) return null;
  const parts = normalized.split("/");
  if (
    parts.some((part) => part.length === 0 || part === "." || part === "..")
  ) return null;
  if (normalized.includes("\0") || normalized.startsWith("file:")) return null;
  return normalized;
}

function scanForbiddenKeys(
  value: unknown,
  path: string,
  diagnostics: BuildManifestDiagnostic[],
  seen = new Set<object>(),
): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      scanForbiddenKeys(item, `${path}[${index}]`, diagnostics, seen)
    );
  } else {for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) {
        diagnostics.push(
          diagnostic(
            "FORBIDDEN_CANONICAL_INPUT",
            `Ambient field '${key}' cannot enter a canonical manifest.`,
            `${path}.${key}`,
          ),
        );
      }
      scanForbiddenKeys(item, `${path}.${key}`, diagnostics, seen);
    }}
  seen.delete(value);
}

const DETERMINISTIC_TIME_TOKENS = /\b(?:BUILD_TIME|SOURCE_DATE_EPOCH)\b/gu;
const NONDETERMINISTIC_STRING_RULES: readonly [RegExp, string][] = [
  [
    /(?:Date\.now|new\s+Date\s*\(|performance\.now|\bdate\s+(?:-u|--utc)?\b)/iu,
    "Dynamic clock or date input is not deterministic.",
  ],
  [
    /(?:os\.hostname|hostname\s*\(|process\.env\.(?:HOSTNAME|USER|HOME)|\b(?:HOSTNAME|USER|HOME)\b)/iu,
    "Host or user identity must not enter a canonical manifest.",
  ],
  [
    /(?:Intl\.|process\.env\.(?:LANG|LC_ALL|TZ)|\b(?:LANG|LC_ALL|TZ)\s*=|--(?:locale|timezone)(?:=|\s))/iu,
    "Locale or timezone input is not deterministic.",
  ],
  [
    /(?:Math\.random|randomUUID|randomBytes|crypto\.getRandomValues|\buuid(?:v\d+)?\b)/iu,
    "Randomness or UUID generation is not deterministic.",
  ],
];
const NETWORK_COMMAND =
  /(?:https?:\/\/|registry\.|jsr:|fetch\s*\(|curl\s|wget\s|npm\s+(?:install|ci|update|audit)|deno\s+(?:add|install|cache))/iu;
const CACHE_COMMAND =
  /(?:node_modules|\.cache\b|DENO_DIR|npm_config_cache|PLAYWRIGHT_BROWSERS_PATH|\b(?:cache|cached)\b)/iu;
const ABSOLUTE_STRING =
  /(?:^|[\s"'=:(\[,])(?:file:(?:\/\/)?|\/(?!\/)|[A-Za-z]:[\\/]|\\\\)[^\s"'`,;)}\]]*/iu;

function containsAbsoluteString(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");
  const withoutHttpUrls = normalized.replace(
    /https?:\/\/[^\s"'`,;)}\]]*/giu,
    "",
  );
  if (/^file:(?:\/\/)?/iu.test(withoutHttpUrls)) return true;
  if (/^(?:[A-Za-z]:\/|\/|\/\/)/u.test(withoutHttpUrls)) return true;
  return ABSOLUTE_STRING.test(withoutHttpUrls);
}

function scanForbiddenStrings(
  value: unknown,
  path: string,
  diagnostics: BuildManifestDiagnostic[],
  seen = new Set<object>(),
): void {
  if (typeof value === "string") {
    const candidate = value.replace(DETERMINISTIC_TIME_TOKENS, "");
    for (const [expression, message] of NONDETERMINISTIC_STRING_RULES) {
      if (expression.test(candidate)) {
        diagnostics.push(
          diagnostic("NONDETERMINISTIC_STRING_INPUT", message, path),
        );
      }
    }
    if (containsAbsoluteString(value)) {
      diagnostics.push(
        diagnostic(
          "ABSOLUTE_PATH_INPUT",
          "Absolute paths and file URLs cannot enter a canonical manifest.",
          path,
        ),
      );
    }
    if (path.startsWith("$.buildCommand[") && NETWORK_COMMAND.test(value)) {
      diagnostics.push(
        diagnostic(
          "NONDETERMINISTIC_STRING_INPUT",
          "Build commands must not resolve through a network or registry.",
          path,
        ),
      );
    }
    if (path.startsWith("$.buildCommand[") && CACHE_COMMAND.test(value)) {
      diagnostics.push(
        diagnostic(
          "NONDETERMINISTIC_STRING_INPUT",
          "Build commands must not depend on an undeclared cache or local installation state.",
          path,
        ),
      );
    }
    return;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      scanForbiddenStrings(item, `${path}[${index}]`, diagnostics, seen)
    );
  } else {for (const [key, item] of Object.entries(value)) {
      scanForbiddenStrings(item, `${path}.${key}`, diagnostics, seen);
    }}
  seen.delete(value);
}

function checkKnownKeys(
  value: Record<string, unknown>,
  keys: ReadonlySet<string>,
  path: string,
  diagnostics: BuildManifestDiagnostic[],
): void {
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) {
      diagnostics.push(
        diagnostic(
          "UNKNOWN_FIELD",
          `Unknown field '${key}' is not canonical.`,
          `${path}.${key}`,
        ),
      );
    }
  }
}

function normalizedPathList(
  value: unknown,
  path: string,
  diagnostics: BuildManifestDiagnostic[],
): string[] | null {
  if (!Array.isArray(value)) {
    diagnostics.push(
      diagnostic(
        "INVALID_REPO_RELATIVE_PATH",
        "A path list is required.",
        path,
      ),
    );
    return null;
  }
  const output: string[] = [];
  for (const [index, item] of value.entries()) {
    const normalized = normalizeRepoRelativePath(item);
    if (normalized === null) {
      diagnostics.push(
        diagnostic(
          "INVALID_REPO_RELATIVE_PATH",
          "Only a non-empty repo-relative POSIX path is accepted.",
          `${path}[${index}]`,
        ),
      );
    } else output.push(normalized);
  }
  const sorted = [...output].sort(compareStable);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] === sorted[index - 1]) {
      diagnostics.push(
        diagnostic(
          "DUPLICATE_PATH",
          "A canonical path may occur only once.",
          path,
        ),
      );
    }
  }
  return [...new Set(sorted)];
}

function normalizedHash(
  value: unknown,
  path: string,
  diagnostics: BuildManifestDiagnostic[],
): string | null {
  if (!isSha256(value)) {
    diagnostics.push(
      diagnostic(
        "HASH_INPUT_INVALID",
        "A lowercase SHA-256 hash is required.",
        path,
      ),
    );
    return null;
  }
  return value;
}

function normalizeSourceFiles(
  value: unknown,
  diagnostics: BuildManifestDiagnostic[],
): BuildSourceInput[] | null {
  if (!Array.isArray(value)) {
    diagnostics.push(
      diagnostic(
        "INVALID_SOURCE_INPUT",
        "sourceFiles must be an array.",
        "sourceFiles",
      ),
    );
    return null;
  }
  const output: BuildSourceInput[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) {
      diagnostics.push(
        diagnostic(
          "INVALID_SOURCE_INPUT",
          "A source input must be an object.",
          `sourceFiles[${index}]`,
        ),
      );
      continue;
    }
    checkKnownKeys(item, SOURCE_KEYS, `sourceFiles[${index}]`, diagnostics);
    const path = normalizeRepoRelativePath(item.path);
    if (path === null) {
      diagnostics.push(
        diagnostic(
          "INVALID_REPO_RELATIVE_PATH",
          "Source path must be repo-relative.",
          `sourceFiles[${index}].path`,
        ),
      );
    }
    const bytes = item.bytes;
    if (
      typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes < 0
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_BYTES",
          "Source bytes must be a non-negative safe integer.",
          `sourceFiles[${index}].bytes`,
        ),
      );
    }
    const sha256 = normalizedHash(
      item.sha256,
      `sourceFiles[${index}].sha256`,
      diagnostics,
    );
    if (
      path !== null && typeof bytes === "number" &&
      Number.isSafeInteger(bytes) && bytes >= 0 && sha256 !== null
    ) output.push({ path, bytes, sha256 });
  }
  output.sort((left, right) => compareStable(left.path, right.path));
  for (let index = 1; index < output.length; index += 1) {
    const current = output[index];
    const previous = output[index - 1];
    if (
      current !== undefined && previous !== undefined &&
      current.path === previous.path
    ) {
      diagnostics.push(
        diagnostic(
          "DUPLICATE_PATH",
          "A source path may occur only once.",
          "sourceFiles",
        ),
      );
    }
  }
  return output;
}

function normalizeSourceMapPolicy(
  value: unknown,
  diagnostics: BuildManifestDiagnostic[],
): SourceMapPolicy | null {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(
        "INVALID_SOURCE_MAP_POLICY",
        "sourceMapPolicy must be an object.",
        "sourceMapPolicy",
      ),
    );
    return null;
  }
  checkKnownKeys(value, SOURCE_MAP_KEYS, "sourceMapPolicy", diagnostics);
  const mode = value.mode;
  const mappingProof = value.mappingProof;
  const maps = normalizedPathList(
    value.declaredMapPaths,
    "sourceMapPolicy.declaredMapPaths",
    diagnostics,
  );
  if (mode !== "INCLUDED" && mode !== "EXCLUDED") {
    diagnostics.push(
      diagnostic(
        "INVALID_SOURCE_MAP_POLICY",
        "mode must be INCLUDED or EXCLUDED.",
        "sourceMapPolicy.mode",
      ),
    );
  }
  if (
    mappingProof !== "SOURCE_MAP" &&
    mappingProof !== "DIRECT_SOURCE_DIGEST_CHAIN" &&
    mappingProof !== "EMBEDDED_SOURCE_REFERENCES"
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_SOURCE_MAP_POLICY",
        "mappingProof is not supported.",
        "sourceMapPolicy.mappingProof",
      ),
    );
  }
  if (mode === "INCLUDED" && mappingProof !== "SOURCE_MAP") {
    diagnostics.push(
      diagnostic(
        "INVALID_SOURCE_MAP_POLICY",
        "Included maps require SOURCE_MAP proof.",
        "sourceMapPolicy.mappingProof",
      ),
    );
  }
  if (mode === "INCLUDED" && (maps === null || maps.length === 0)) {
    diagnostics.push(
      diagnostic(
        "SOURCE_MAP_PROOF_MISSING",
        "Included source maps must declare at least one map path.",
        "sourceMapPolicy.declaredMapPaths",
      ),
    );
  }
  if (mode === "EXCLUDED" && mappingProof === "SOURCE_MAP") {
    diagnostics.push(
      diagnostic(
        "SOURCE_MAP_PROOF_MISSING",
        "Excluded maps require an explicit alternative mapping proof.",
        "sourceMapPolicy.mappingProof",
      ),
    );
  }
  if (mode === "EXCLUDED" && maps !== null && maps.length > 0) {
    diagnostics.push(
      diagnostic(
        "INVALID_SOURCE_MAP_POLICY",
        "Excluded maps cannot declare map artifacts.",
        "sourceMapPolicy.declaredMapPaths",
      ),
    );
  }
  if (
    (mode !== "INCLUDED" && mode !== "EXCLUDED") ||
    (mappingProof !== "SOURCE_MAP" &&
      mappingProof !== "DIRECT_SOURCE_DIGEST_CHAIN" &&
      mappingProof !== "EMBEDDED_SOURCE_REFERENCES") ||
    maps === null
  ) return null;
  return { mode, mappingProof, declaredMapPaths: maps };
}

export function validateBuildTopology(
  manifest: CanonicalBuildManifest,
): readonly BuildManifestDiagnostic[] {
  const diagnostics: BuildManifestDiagnostic[] = [];
  const initial = new Set(manifest.initialChunks);
  const lazy = new Set(manifest.lazyChunks);
  for (const chunk of initial) {
    if (lazy.has(chunk)) {
      diagnostics.push(
        diagnostic(
          "INITIAL_LAZY_OVERLAP",
          `Chunk '${chunk}' is both initial and lazy.`,
          chunk,
        ),
      );
    }
  }
  for (const entry of manifest.entries) {
    if (!initial.has(entry)) {
      diagnostics.push(
        diagnostic(
          "ENTRY_NOT_INITIAL",
          `Entry '${entry}' is not in the initial chunk boundary.`,
          entry,
        ),
      );
    }
  }
  for (const artifact of manifest.declaredArtifacts) {
    if (
      !manifest.entries.includes(artifact) &&
      !manifest.initialChunks.includes(artifact) &&
      !manifest.lazyChunks.includes(artifact) &&
      !manifest.sourceFiles.some((source) => source.path === artifact) &&
      !manifest.sourceMapPolicy.declaredMapPaths.includes(artifact)
    ) {
      diagnostics.push(
        diagnostic(
          "UNDECLARED_ENTRY",
          `Declared artifact '${artifact}' is not represented by the build topology.`,
          artifact,
        ),
      );
    }
  }
  return diagnostics;
}

export async function createBuildManifest(
  input: unknown,
): Promise<
  BuildManifestResult<
    {
      readonly manifest: CanonicalBuildManifest;
      readonly canonicalJson: string;
      readonly manifestHash: string;
    }
  >
> {
  const diagnostics: BuildManifestDiagnostic[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "INPUT_NOT_OBJECT",
          "Build manifest input must be an object.",
        ),
      ],
    };
  }
  scanForbiddenKeys(input, "$", diagnostics);
  scanForbiddenStrings(input, "$", diagnostics);
  checkKnownKeys(input, TOP_LEVEL_KEYS, "$", diagnostics);
  const command = input.buildCommand;
  if (
    !Array.isArray(command) || command.length === 0 ||
    command.some((item) =>
      typeof item !== "string" || item.trim().length === 0 ||
      /(?:^|\s)(?:\/|[A-Za-z]:\\)|(?:\/Users\/|\\\\)/u.test(item)
    )
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_COMMAND",
        "buildCommand must be a non-empty argv-like list without host paths.",
        "buildCommand",
      ),
    );
  }
  const buildCommand = Array.isArray(command)
    ? command.map((item) => typeof item === "string" ? item.trim() : "")
    : [];
  const entries = normalizedPathList(input.entries, "entries", diagnostics) ??
    [];
  const initialChunks =
    normalizedPathList(input.initialChunks, "initialChunks", diagnostics) ?? [];
  const lazyChunks =
    normalizedPathList(input.lazyChunks, "lazyChunks", diagnostics) ?? [];
  const sourceMapPolicy = normalizeSourceMapPolicy(
    input.sourceMapPolicy,
    diagnostics,
  );
  const sourceFiles = normalizeSourceFiles(input.sourceFiles, diagnostics) ??
    [];
  const declaredArtifacts = normalizedPathList(
    input.declaredArtifacts,
    "declaredArtifacts",
    diagnostics,
  ) ?? [];
  const schemaRegistryDigest = normalizedHash(
    input.schemaRegistryDigest,
    "schemaRegistryDigest",
    diagnostics,
  );
  const dependencyGraphHash = normalizedHash(
    input.dependencyGraphHash,
    "dependencyGraphHash",
    diagnostics,
  );
  const lockfileHash = normalizedHash(
    input.lockfileHash,
    "lockfileHash",
    diagnostics,
  );
  const toolchainHash = normalizedHash(
    input.toolchainHash,
    "toolchainHash",
    diagnostics,
  );
  const allowlistedEnvironmentHash = normalizedHash(
    input.allowlistedEnvironmentHash,
    "allowlistedEnvironmentHash",
    diagnostics,
  );
  if (
    diagnostics.length > 0 || sourceMapPolicy === null ||
    schemaRegistryDigest === null || dependencyGraphHash === null ||
    lockfileHash === null || toolchainHash === null ||
    allowlistedEnvironmentHash === null
  ) return { ok: false, diagnostics };
  const manifest: CanonicalBuildManifest = {
    documentId: FP007_BUILD_MANIFEST_DOCUMENT,
    schemaVersion: FP007_BUILD_MANIFEST_SCHEMA_VERSION,
    hashAlgorithm: FP007_HASH_ALGORITHM,
    buildCommand,
    entries,
    initialChunks,
    lazyChunks,
    sourceMapPolicy,
    sourceFiles,
    declaredArtifacts,
    deterministicInputs: {
      schemaRegistryDigest,
      dependencyGraphHash,
      lockfileHash,
      toolchainHash,
      allowlistedEnvironmentHash,
    },
  };
  diagnostics.push(...validateBuildTopology(manifest));
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  const json = canonicalJson(manifest);
  return {
    ok: true,
    value: {
      manifest,
      canonicalJson: json,
      manifestHash: await sha256Hex(json),
    },
    diagnostics: [],
  };
}
