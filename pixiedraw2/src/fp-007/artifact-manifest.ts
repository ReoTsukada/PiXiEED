/** FP-007 Track 3: repo-relative source/dist artifact inventory. */

import {
  canonicalJson,
  isSha256,
  normalizeRepoRelativePath,
  sha256Hex,
} from "./build-manifest.ts";

export const FP007_ARTIFACT_MANIFEST_DOCUMENT =
  "PIXIEED-FP007-ARTIFACT-MANIFEST-001" as const;
export const FP007_ARTIFACT_MANIFEST_SCHEMA_VERSION = "1.0.0" as const;

export type ArtifactRole =
  | "SOURCE"
  | "ENTRY"
  | "INITIAL_CHUNK"
  | "LAZY_CHUNK"
  | "SOURCE_MAP"
  | "ASSET"
  | "GENERATED";
export type ArtifactCompression = "NONE" | "GZIP" | "BROTLI";

export interface ArtifactRecord {
  readonly path: string;
  readonly role: ArtifactRole;
  readonly bytes: number;
  readonly size: number;
  readonly sha256: string;
  readonly compression: ArtifactCompression;
}

export interface ArtifactBytesInput {
  readonly path: string;
  readonly role: ArtifactRole;
  readonly compression: ArtifactCompression;
  readonly content: Uint8Array;
}

export interface ArtifactManifest {
  readonly documentId: typeof FP007_ARTIFACT_MANIFEST_DOCUMENT;
  readonly schemaVersion: typeof FP007_ARTIFACT_MANIFEST_SCHEMA_VERSION;
  readonly hashAlgorithm: "SHA-256";
  readonly artifacts: readonly ArtifactRecord[];
}

export type ArtifactDiagnosticCode =
  | "INVALID_ARTIFACT"
  | "INVALID_PATH"
  | "INVALID_ROLE"
  | "INVALID_COMPRESSION"
  | "INVALID_BYTES"
  | "INVALID_HASH"
  | "DUPLICATE_ARTIFACT"
  | "UNDECLARED_ARTIFACT"
  | "SECRET_BEARING_ARTIFACT";

export interface ArtifactDiagnostic {
  readonly code: ArtifactDiagnosticCode;
  readonly message: string;
  readonly path?: string;
}

export type ArtifactResult<T> =
  | {
    readonly ok: true;
    readonly value: T;
    readonly diagnostics: readonly ArtifactDiagnostic[];
  }
  | { readonly ok: false; readonly diagnostics: readonly ArtifactDiagnostic[] };

const ROLES: readonly ArtifactRole[] = [
  "SOURCE",
  "ENTRY",
  "INITIAL_CHUNK",
  "LAZY_CHUNK",
  "SOURCE_MAP",
  "ASSET",
  "GENERATED",
];
const COMPRESSIONS: readonly ArtifactCompression[] = ["NONE", "GZIP", "BROTLI"];

function diagnostic(
  code: ArtifactDiagnosticCode,
  message: string,
  path?: string,
): ArtifactDiagnostic {
  return { code, message, ...(path === undefined ? {} : { path }) };
}

function compareArtifact(left: ArtifactRecord, right: ArtifactRecord): number {
  return left.path < right.path
    ? -1
    : left.path > right.path
    ? 1
    : left.role < right.role
    ? -1
    : left.role > right.role
    ? 1
    : 0;
}

function containsSecretLikeContent(content: Uint8Array): boolean {
  const text = new TextDecoder().decode(content);
  return /(?:authorization\s*:\s*bearer\s+[A-Za-z0-9._-]+|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|(?:api[_-]?key|secret|password)\s*[:=]\s*['"]?[A-Za-z0-9_./+=-]{8,}|sk-[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/iu
    .test(text);
}

export async function createArtifactRecord(
  input: ArtifactBytesInput,
): Promise<ArtifactResult<ArtifactRecord>> {
  const diagnostics: ArtifactDiagnostic[] = [];
  const path = normalizeRepoRelativePath(input.path);
  if (path === null) {
    diagnostics.push(
      diagnostic(
        "INVALID_PATH",
        "Artifact path must be repo-relative.",
        "path",
      ),
    );
  }
  if (!ROLES.includes(input.role)) {
    diagnostics.push(
      diagnostic("INVALID_ROLE", "Artifact role is not supported.", "role"),
    );
  }
  if (!COMPRESSIONS.includes(input.compression)) {
    diagnostics.push(
      diagnostic(
        "INVALID_COMPRESSION",
        "Artifact compression is not supported.",
        "compression",
      ),
    );
  }
  if (!(input.content instanceof Uint8Array)) {
    diagnostics.push(
      diagnostic(
        "INVALID_ARTIFACT",
        "Artifact content must be bytes.",
        "content",
      ),
    );
  }
  const content = input.content instanceof Uint8Array
    ? input.content
    : new Uint8Array();
  const bytes = content.byteLength;
  if (path !== null && !containsSecretLikeContent(content)) {
    return {
      ok: true,
      value: {
        path,
        role: input.role,
        bytes,
        size: bytes,
        sha256: await sha256Hex(content),
        compression: input.compression,
      },
      diagnostics,
    };
  }
  if (containsSecretLikeContent(content)) {
    diagnostics.push(
      diagnostic(
        "SECRET_BEARING_ARTIFACT",
        "Secret-like source/map content is never retained in an artifact inventory.",
        path ?? "content",
      ),
    );
  }
  return { ok: false, diagnostics };
}

export function validateArtifactRecord(
  input: unknown,
  path = "artifact",
): ArtifactResult<ArtifactRecord> {
  const diagnostics: ArtifactDiagnostic[] = [];
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "INVALID_ARTIFACT",
          "Artifact record must be an object.",
          path,
        ),
      ],
    };
  }
  const record = input as Record<string, unknown>;
  const normalizedPath = normalizeRepoRelativePath(record.path);
  if (normalizedPath === null) {
    diagnostics.push(
      diagnostic(
        "INVALID_PATH",
        "Artifact path must be repo-relative.",
        `${path}.path`,
      ),
    );
  }
  if (!ROLES.includes(record.role as ArtifactRole)) {
    diagnostics.push(
      diagnostic(
        "INVALID_ROLE",
        "Artifact role is not supported.",
        `${path}.role`,
      ),
    );
  }
  if (!COMPRESSIONS.includes(record.compression as ArtifactCompression)) {
    diagnostics.push(
      diagnostic(
        "INVALID_COMPRESSION",
        "Artifact compression is not supported.",
        `${path}.compression`,
      ),
    );
  }
  if (
    typeof record.bytes !== "number" || !Number.isSafeInteger(record.bytes) ||
    record.bytes < 0
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_BYTES",
        "Artifact bytes must be a non-negative safe integer.",
        `${path}.bytes`,
      ),
    );
  }
  if (
    typeof record.size !== "number" || !Number.isSafeInteger(record.size) ||
    record.size < 0 || record.size !== record.bytes
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_BYTES",
        "Artifact size must equal bytes.",
        `${path}.size`,
      ),
    );
  }
  if (!isSha256(record.sha256)) {
    diagnostics.push(
      diagnostic(
        "INVALID_HASH",
        "Artifact sha256 must be a lowercase SHA-256 hash.",
        `${path}.sha256`,
      ),
    );
  }
  if (
    diagnostics.length > 0 || normalizedPath === null ||
    !ROLES.includes(record.role as ArtifactRole) ||
    !COMPRESSIONS.includes(record.compression as ArtifactCompression) ||
    typeof record.bytes !== "number" || !Number.isSafeInteger(record.bytes) ||
    !isSha256(record.sha256)
  ) return { ok: false, diagnostics };
  return {
    ok: true,
    value: {
      path: normalizedPath,
      role: record.role as ArtifactRole,
      bytes: record.bytes,
      size: record.size as number,
      sha256: record.sha256,
      compression: record.compression as ArtifactCompression,
    },
    diagnostics: [],
  };
}

export async function createArtifactManifest(
  records: readonly unknown[],
): Promise<
  ArtifactResult<
    {
      readonly manifest: ArtifactManifest;
      readonly canonicalJson: string;
      readonly manifestHash: string;
    }
  >
> {
  const diagnostics: ArtifactDiagnostic[] = [];
  const normalized: ArtifactRecord[] = [];
  if (!Array.isArray(records)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic("INVALID_ARTIFACT", "Artifact records must be an array."),
      ],
    };
  }
  for (const [index, input] of records.entries()) {
    const result = validateArtifactRecord(input, `artifacts[${index}]`);
    if (!result.ok) diagnostics.push(...result.diagnostics);
    else normalized.push(result.value);
  }
  normalized.sort(compareArtifact);
  for (let index = 1; index < normalized.length; index += 1) {
    const current = normalized[index];
    const previous = normalized[index - 1];
    if (
      current !== undefined && previous !== undefined &&
      current.path === previous.path
    ) {
      diagnostics.push(
        diagnostic(
          "DUPLICATE_ARTIFACT",
          "An artifact path may occur only once in a manifest.",
          current.path,
        ),
      );
    }
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  const manifest: ArtifactManifest = {
    documentId: FP007_ARTIFACT_MANIFEST_DOCUMENT,
    schemaVersion: FP007_ARTIFACT_MANIFEST_SCHEMA_VERSION,
    hashAlgorithm: "SHA-256",
    artifacts: normalized,
  };
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

export function validateArtifactDeclarations(
  records: readonly ArtifactRecord[],
  declaredPaths: readonly string[],
): readonly ArtifactDiagnostic[] {
  const declared = new Set(declaredPaths);
  return records.filter((record) => !declared.has(record.path)).map((record) =>
    diagnostic(
      "UNDECLARED_ARTIFACT",
      `Artifact '${record.path}' is not declared by the build manifest.`,
      record.path,
    )
  );
}
