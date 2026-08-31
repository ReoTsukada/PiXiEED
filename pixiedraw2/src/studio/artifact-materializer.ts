/**
 * STUDIO-030 local Artifact materialization.
 *
 * This module turns an already verified Studio Release Candidate into three
 * bounded, content-addressed output files and one deterministic ZIP.  It is
 * deliberately local and host-neutral: it does not upload, publish, mutate a
 * Project, or call a provider.  The caller must supply the bytes owned by
 * iDRAW/iAUDIO/iGAME together with the identity proof produced by that owner.
 */

import {
  encodeStoredZip,
  importPxdProject,
  type PxdProjectImport,
} from "../draw2-export.ts";
import {
  canonicalJson,
  type GameProject,
  type Sha256,
  validateGameProject,
} from "../game/game-300/core.ts";
import type {
  IntegrationDiagnostic,
  IntegrationResult,
} from "../game/game-340/core.ts";
import {
  type StudioPackageKind,
  type StudioReleaseCandidate,
  verifyStudioReleaseCandidate,
} from "./package-publish.ts";

export const STUDIO_ARTIFACT_MATERIALIZATION_SCHEMA_VERSION = 1 as const;
export const STUDIO_RELEASE_ZIP_MIME_TYPE = "application/zip" as const;
export const STUDIO_MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;

export const STUDIO_ARTIFACT_PATHS: Readonly<
  Record<StudioPackageKind, string>
> = Object.freeze({
  PXD: "packages/pxd/project.pxd",
  AUDIO: "packages/audio/master.wav",
  GAME: "packages/game/game-project.json",
});

export interface StudioPxdMaterializationSource {
  readonly kind: "PXD";
  readonly bytes: Uint8Array;
  readonly mimeType: "application/vnd.pixieed.pxd";
  /** The Draw reference which was locked in the Release Candidate. */
  readonly sourceReference: {
    readonly assetId: string;
    readonly revisionId: string;
    readonly contentHash: Sha256;
  };
}

export interface StudioAudioMaterializationSource {
  readonly kind: "AUDIO";
  readonly bytes: Uint8Array;
  readonly mimeType: "audio/wav";
  readonly sourceProjectId: string;
  /** State identity returned by the canonical iAUDIO Project/renderer. */
  readonly sourceStateHash: Sha256;
  readonly sourceProjectRevision: number;
}

export interface StudioGameMaterializationSource {
  readonly kind: "GAME";
  readonly bytes: Uint8Array;
  readonly mimeType: "application/json";
  /** Canonical GameProject used to produce the exact JSON bytes. */
  readonly project: GameProject;
}

export type StudioMaterializationSource =
  | StudioPxdMaterializationSource
  | StudioAudioMaterializationSource
  | StudioGameMaterializationSource;

export interface StudioReleaseMaterializationInput {
  readonly candidate: StudioReleaseCandidate;
  readonly sources: readonly StudioMaterializationSource[];
}

export interface StudioMaterializedArtifact {
  readonly kind: StudioPackageKind;
  readonly path: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly byteLength: number;
  readonly contentHash: Sha256;
  readonly lockedPackageHash: Sha256;
}

export interface StudioMaterializedArtifactRecord {
  readonly kind: StudioPackageKind;
  readonly path: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly contentHash: Sha256;
  readonly lockedPackageHash: Sha256;
}

export interface StudioReleaseArtifactManifest {
  readonly schemaVersion:
    typeof STUDIO_ARTIFACT_MATERIALIZATION_SCHEMA_VERSION;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly projectId: string;
  readonly projectRevisionId: string;
  readonly candidatePackageHash: Sha256;
  readonly candidateReproducibleBuildIdentity: Sha256;
  readonly artifacts: readonly StudioMaterializedArtifactRecord[];
  readonly manifestHash: Sha256;
  readonly reproducibleBuildIdentity: Sha256;
}

export interface StudioReleaseArtifactBundle {
  readonly status: "MATERIALIZED";
  readonly candidate: StudioReleaseCandidate;
  readonly manifest: StudioReleaseArtifactManifest;
  readonly manifestBytes: Uint8Array;
  readonly artifacts: readonly StudioMaterializedArtifact[];
  readonly zip: {
    readonly filename: string;
    readonly mimeType: typeof STUDIO_RELEASE_ZIP_MIME_TYPE;
    readonly bytes: Uint8Array;
    readonly contentHash: Sha256;
  };
}

function success<T>(value: T): IntegrationResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function failure<T>(
  ...diagnostics: IntegrationDiagnostic[]
): IntegrationResult<T> {
  return { ok: false, diagnostics };
}

function diagnostic(
  code: IntegrationDiagnostic["code"],
  path: string,
  message: string,
): IntegrationDiagnostic {
  return { code, path, message, recoverable: false };
}

function validHash(value: unknown): value is Sha256 {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function validIdentity(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value);
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

async function sha256Bytes(bytes: Uint8Array): Promise<Sha256> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    cloneBytes(bytes).buffer as ArrayBuffer,
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("") as Sha256;
}

function boundedBytes(
  bytes: unknown,
  path: string,
): IntegrationDiagnostic | undefined {
  if (!(bytes instanceof Uint8Array)) {
    return diagnostic("INVALID_CLAIM", path, "Artifact bytes must be Uint8Array.");
  }
  if (bytes.byteLength < 1 || bytes.byteLength > STUDIO_MAX_ARTIFACT_BYTES) {
    return diagnostic(
      "PARTIAL_PACKAGE",
      `${path}.byteLength`,
      `Artifact bytes must be between 1 and ${STUDIO_MAX_ARTIFACT_BYTES}.`,
    );
  }
  return undefined;
}

function packageArtifact(
  candidate: StudioReleaseCandidate,
  kind: StudioPackageKind,
): StudioReleaseCandidate["manifest"]["packages"][number] | undefined {
  return candidate.manifest.packages.find((item) => item.kind === kind);
}

function sourceKinds(
  sources: readonly StudioMaterializationSource[],
): readonly IntegrationDiagnostic[] {
  const diagnostics: IntegrationDiagnostic[] = [];
  const seen = new Set<StudioPackageKind>();
  for (const [index, source] of sources.entries()) {
    if (seen.has(source.kind)) {
      diagnostics.push(
        diagnostic(
          "DUPLICATE_REFERENCE",
          `sources[${index}].kind`,
          `${source.kind} materialization source is duplicated.`,
        ),
      );
    }
    seen.add(source.kind);
  }
  for (const kind of ["PXD", "AUDIO", "GAME"] as const) {
    if (!seen.has(kind)) {
      diagnostics.push(
        diagnostic(
          "PARTIAL_PACKAGE",
          "sources",
          `${kind} materialization source is missing.`,
        ),
      );
    }
  }
  return diagnostics;
}

function candidateReference(
  candidate: StudioReleaseCandidate,
  kind: "DRAW" | "AUDIO",
): StudioReleaseCandidate["manifest"]["packages"][number]["references"][number] | undefined {
  const packageKind = kind === "DRAW" ? "PXD" : "AUDIO";
  return packageArtifact(candidate, packageKind)?.references.find((entry) =>
    entry.kind === kind
  );
}

function validWav(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 44) return false;
  const ascii = (offset: number, value: string): boolean =>
    [...value].every((character, index) =>
      bytes[offset + index] === character.charCodeAt(0)
    );
  return ascii(0, "RIFF") && ascii(8, "WAVE") && ascii(12, "fmt ") &&
    ascii(36, "data");
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}

async function verifyPxdSource(
  candidate: StudioReleaseCandidate,
  source: StudioPxdMaterializationSource,
): Promise<IntegrationDiagnostic[]> {
  const diagnostics: IntegrationDiagnostic[] = [];
  const bounds = boundedBytes(source.bytes, "sources.PXD");
  if (bounds !== undefined) diagnostics.push(bounds);
  if (source.mimeType !== "application/vnd.pixieed.pxd") {
    diagnostics.push(
      diagnostic("INVALID_CLAIM", "sources.PXD.mimeType", "PXD MIME type is invalid."),
    );
  }
  if (
    !validIdentity(source.sourceReference.assetId) ||
    !validIdentity(source.sourceReference.revisionId) ||
    !validHash(source.sourceReference.contentHash)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_CLAIM",
        "sources.PXD.sourceReference",
        "PXD source reference identity is invalid.",
      ),
    );
  }
  const locked = candidateReference(candidate, "DRAW");
  if (
    locked === undefined ||
    locked.assetId !== source.sourceReference.assetId ||
    locked.revisionId !== source.sourceReference.revisionId ||
    locked.contentHash !== source.sourceReference.contentHash
  ) {
    diagnostics.push(
      diagnostic(
        "HASH_MISMATCH",
        "sources.PXD.sourceReference",
        "PXD source reference does not match the locked Draw Revision.",
      ),
    );
  }
  if (diagnostics.length > 0) return diagnostics;
  try {
    const imported: PxdProjectImport = await importPxdProject(source.bytes);
    if (imported.manifest.projectId !== candidate.manifest.projectId) {
      diagnostics.push(
        diagnostic(
          "WRONG_PROJECT",
          "sources.PXD.manifest.projectId",
          "PXD Project ID does not match the Release Candidate.",
        ),
      );
    }
    if (!imported.manifest.modules.draw.assets.some((asset) =>
      asset.assetId === source.sourceReference.assetId
    )) {
      diagnostics.push(
        diagnostic(
          "MISSING_ASSET",
          "sources.PXD.manifest.modules.draw.assets",
          "Locked Draw Asset is not present in the PXD artifact.",
        ),
      );
    }
  } catch (error) {
    diagnostics.push(
      diagnostic(
        "HASH_MISMATCH",
        "sources.PXD.bytes",
        error instanceof Error
          ? `PXD artifact verification failed: ${error.message}`
          : "PXD artifact verification failed.",
      ),
    );
  }
  return diagnostics;
}

function verifyAudioSource(
  candidate: StudioReleaseCandidate,
  source: StudioAudioMaterializationSource,
): IntegrationDiagnostic[] {
  const diagnostics: IntegrationDiagnostic[] = [];
  const bounds = boundedBytes(source.bytes, "sources.AUDIO");
  if (bounds !== undefined) diagnostics.push(bounds);
  if (source.mimeType !== "audio/wav" || !validWav(source.bytes)) {
    diagnostics.push(
      diagnostic(
        "INVALID_CLAIM",
        "sources.AUDIO.bytes",
        "AUDIO artifact must be a valid WAV output.",
      ),
    );
  }
  if (!validIdentity(source.sourceProjectId)) {
    diagnostics.push(
      diagnostic(
        "INVALID_CLAIM",
        "sources.AUDIO.sourceProjectId",
        "Audio source Project ID is invalid.",
      ),
    );
  }
  if (!validHash(source.sourceStateHash)) {
    diagnostics.push(
      diagnostic(
        "HASH_MISMATCH",
        "sources.AUDIO.sourceStateHash",
        "Audio source state hash is invalid.",
      ),
    );
  }
  if (!Number.isSafeInteger(source.sourceProjectRevision) || source.sourceProjectRevision < 0) {
    diagnostics.push(
      diagnostic(
        "INVALID_CLAIM",
        "sources.AUDIO.sourceProjectRevision",
        "Audio source Project revision is invalid.",
      ),
    );
  }
  if (source.sourceProjectId !== candidate.manifest.projectId) {
    diagnostics.push(
      diagnostic(
        "WRONG_PROJECT",
        "sources.AUDIO.sourceProjectId",
        "Audio source Project ID does not match the Release Candidate.",
      ),
    );
  }
  const locked = candidateReference(candidate, "AUDIO");
  if (locked === undefined || locked.contentHash !== source.sourceStateHash) {
    diagnostics.push(
      diagnostic(
        "HASH_MISMATCH",
        "sources.AUDIO.sourceStateHash",
        "Audio source state hash does not match the locked Audio Revision.",
      ),
    );
  }
  return diagnostics;
}

function verifyGameSource(
  candidate: StudioReleaseCandidate,
  source: StudioGameMaterializationSource,
): IntegrationDiagnostic[] {
  const diagnostics: IntegrationDiagnostic[] = [];
  const bounds = boundedBytes(source.bytes, "sources.GAME");
  if (bounds !== undefined) diagnostics.push(bounds);
  if (source.mimeType !== "application/json") {
    diagnostics.push(
      diagnostic("INVALID_CLAIM", "sources.GAME.mimeType", "Game MIME type is invalid."),
    );
  }
  const projectValidation = validateGameProject(source.project, {
    projectId: source.project.projectId,
    ownerId: source.project.ownerId,
    revisionId: source.project.revision.revisionId,
  });
  if (!projectValidation.valid) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROJECT",
        "sources.GAME.project",
        "Canonical GameProject validation failed.",
      ),
    );
  }
  if (String(source.project.projectId) !== candidate.manifest.projectId) {
    diagnostics.push(
      diagnostic(
        "WRONG_PROJECT",
        "sources.GAME.project.projectId",
        "Game Project ID does not match the Release Candidate.",
      ),
    );
  }
  if (String(source.project.revision.revisionId) !== candidate.manifest.projectRevisionId) {
    diagnostics.push(
      diagnostic(
        "STALE_REVISION",
        "sources.GAME.project.revision.revisionId",
        "Game Project Revision does not match the Release Candidate.",
      ),
    );
  }
  if (source.project.revision.snapshotHash !== candidate.manifest.projectHash) {
    diagnostics.push(
      diagnostic(
        "HASH_MISMATCH",
        "sources.GAME.project.revision.snapshotHash",
        "Game Project hash does not match the Release Candidate.",
      ),
    );
  }
  try {
    const decoded = new TextDecoder().decode(source.bytes);
    const parsed = JSON.parse(decoded) as unknown;
    if (canonicalJson(parsed) !== decoded || canonicalJson(source.project) !== decoded) {
      diagnostics.push(
        diagnostic(
          "HASH_MISMATCH",
          "sources.GAME.bytes",
          "Game artifact is not the canonical JSON of the locked GameProject.",
        ),
      );
    }
  } catch {
    diagnostics.push(
      diagnostic("INVALID_CLAIM", "sources.GAME.bytes", "Game artifact JSON is invalid."),
    );
  }
  return diagnostics;
}

async function verifySource(
  candidate: StudioReleaseCandidate,
  source: StudioMaterializationSource,
): Promise<IntegrationDiagnostic[]> {
  if (source.kind === "PXD") return await verifyPxdSource(candidate, source);
  if (source.kind === "AUDIO") return verifyAudioSource(candidate, source);
  return verifyGameSource(candidate, source);
}

function artifactRecords(
  artifacts: readonly StudioMaterializedArtifact[],
): readonly StudioMaterializedArtifactRecord[] {
  return artifacts.map(({ bytes: _bytes, ...record }) => record);
}

async function createBundle(
  candidate: StudioReleaseCandidate,
  artifacts: readonly StudioMaterializedArtifact[],
): Promise<StudioReleaseArtifactBundle> {
  const records = artifactRecords(artifacts);
  const manifestBase = {
    schemaVersion: STUDIO_ARTIFACT_MATERIALIZATION_SCHEMA_VERSION,
    packageId: candidate.manifest.packageId,
    packageVersion: candidate.manifest.packageVersion,
    projectId: candidate.manifest.projectId,
    projectRevisionId: candidate.manifest.projectRevisionId,
    candidatePackageHash: candidate.manifest.packageHash,
    candidateReproducibleBuildIdentity:
      candidate.manifest.reproducibleBuildIdentity,
    artifacts: records,
  };
  const manifestHash = await sha256Bytes(jsonBytes(manifestBase));
  const reproducibleBuildIdentity = await sha256Bytes(
    jsonBytes({
      candidatePackageHash: candidate.manifest.packageHash,
      candidateReproducibleBuildIdentity:
        candidate.manifest.reproducibleBuildIdentity,
      artifacts: records,
    }),
  );
  const manifest: StudioReleaseArtifactManifest = {
    ...manifestBase,
    manifestHash,
    reproducibleBuildIdentity,
  };
  const manifestBytes = jsonBytes(manifest);
  const zipEntries = [
    { filename: "manifest.json", bytes: manifestBytes },
    ...artifacts.map((artifact) => ({
      filename: artifact.path,
      bytes: artifact.bytes,
    })),
  ].sort((left, right) => left.filename.localeCompare(right.filename));
  const zipBytes = encodeStoredZip(zipEntries);
  return {
    status: "MATERIALIZED",
    candidate,
    manifest,
    manifestBytes,
    artifacts,
    zip: {
      filename: `${candidate.manifest.packageId}-${candidate.manifest.packageVersion}.studio.zip`,
      mimeType: STUDIO_RELEASE_ZIP_MIME_TYPE,
      bytes: zipBytes,
      contentHash: await sha256Bytes(zipBytes),
    },
  };
}

/** Materialize PXD, AUDIO, GAME and the deterministic Studio ZIP locally. */
export async function materializeStudioReleaseArtifact(
  input: StudioReleaseMaterializationInput,
): Promise<IntegrationResult<StudioReleaseArtifactBundle>> {
  const verified = await verifyStudioReleaseCandidate(input.candidate);
  if (!verified.ok) return failure(...verified.diagnostics);
  const sourceDiagnostics = sourceKinds(input.sources);
  if (sourceDiagnostics.length > 0) return failure(...sourceDiagnostics);
  const diagnostics: IntegrationDiagnostic[] = [];
  for (const source of input.sources) {
    diagnostics.push(...await verifySource(input.candidate, source));
  }
  if (diagnostics.length > 0) return failure(...diagnostics);
  const artifacts: StudioMaterializedArtifact[] = [];
  for (const kind of ["PXD", "AUDIO", "GAME"] as const) {
    const source = input.sources.find((item) => item.kind === kind);
    const locked = packageArtifact(input.candidate, kind);
    if (source === undefined || locked === undefined) {
      diagnostics.push(
        diagnostic("PARTIAL_PACKAGE", `sources.${kind}`, `${kind} source is missing.`),
      );
      continue;
    }
    const bytes = cloneBytes(source.bytes);
    artifacts.push({
      kind,
      path: STUDIO_ARTIFACT_PATHS[kind],
      mimeType: source.mimeType,
      bytes,
      byteLength: bytes.byteLength,
      contentHash: await sha256Bytes(bytes),
      lockedPackageHash: locked.contentHash,
    });
  }
  if (diagnostics.length > 0) return failure(...diagnostics);
  return success(await createBundle(input.candidate, artifacts));
}

function expectedManifestBase(
  bundle: StudioReleaseArtifactBundle,
): Omit<StudioReleaseArtifactManifest, "manifestHash" | "reproducibleBuildIdentity"> {
  const records = artifactRecords(bundle.artifacts);
  return {
    schemaVersion: bundle.manifest.schemaVersion,
    packageId: bundle.manifest.packageId,
    packageVersion: bundle.manifest.packageVersion,
    projectId: bundle.manifest.projectId,
    projectRevisionId: bundle.manifest.projectRevisionId,
    candidatePackageHash: bundle.manifest.candidatePackageHash,
    candidateReproducibleBuildIdentity:
      bundle.manifest.candidateReproducibleBuildIdentity,
    artifacts: records,
  };
}

/** Re-verify bytes, hashes, manifest identity, and ZIP reconstruction. */
export async function verifyStudioReleaseArtifactBundle(
  bundle: StudioReleaseArtifactBundle,
): Promise<IntegrationResult<StudioReleaseArtifactBundle>> {
  const candidate = await verifyStudioReleaseCandidate(bundle.candidate);
  if (!candidate.ok) return failure(...candidate.diagnostics);
  if (bundle.status !== "MATERIALIZED") {
    return failure(
      diagnostic("PARTIAL_PACKAGE", "bundle.status", "Artifact bundle is not materialized."),
    );
  }
  if (bundle.manifest.schemaVersion !== STUDIO_ARTIFACT_MATERIALIZATION_SCHEMA_VERSION) {
    return failure(
      diagnostic("UNSUPPORTED_SCHEMA", "manifest.schemaVersion", "Artifact schema is unsupported."),
    );
  }
  const manifest = bundle.manifest;
  if (
    manifest.packageId !== bundle.candidate.manifest.packageId ||
    manifest.packageVersion !== bundle.candidate.manifest.packageVersion ||
    manifest.projectId !== bundle.candidate.manifest.projectId ||
    manifest.projectRevisionId !== bundle.candidate.manifest.projectRevisionId ||
    manifest.candidatePackageHash !== bundle.candidate.manifest.packageHash ||
    manifest.candidateReproducibleBuildIdentity !==
      bundle.candidate.manifest.reproducibleBuildIdentity
  ) {
    return failure(
      diagnostic("HASH_MISMATCH", "manifest", "Artifact manifest is bound to another Candidate."),
    );
  }
  const diagnostics: IntegrationDiagnostic[] = [];
  const seenKinds = new Set<StudioPackageKind>();
  const seenPaths = new Set<string>();
  for (const [index, artifact] of bundle.artifacts.entries()) {
    const bounds = boundedBytes(artifact.bytes, `artifacts[${index}]`);
    if (bounds !== undefined) diagnostics.push(bounds);
    if (seenKinds.has(artifact.kind)) {
      diagnostics.push(
        diagnostic("DUPLICATE_REFERENCE", `artifacts[${index}].kind`, "Artifact kind is duplicated."),
      );
    }
    seenKinds.add(artifact.kind);
    if (seenPaths.has(artifact.path) || artifact.path !== STUDIO_ARTIFACT_PATHS[artifact.kind]) {
      diagnostics.push(
        diagnostic("INVALID_CLAIM", `artifacts[${index}].path`, "Artifact path is invalid or duplicated."),
      );
    }
    seenPaths.add(artifact.path);
    if (artifact.byteLength !== artifact.bytes.byteLength) {
      diagnostics.push(
        diagnostic("HASH_MISMATCH", `artifacts[${index}].byteLength`, "Artifact byteLength does not match its bytes."),
      );
    }
    if (!validHash(artifact.contentHash) || await sha256Bytes(artifact.bytes) !== artifact.contentHash) {
      diagnostics.push(
        diagnostic("HASH_MISMATCH", `artifacts[${index}].contentHash`, "Artifact byte hash does not match its bytes."),
      );
    }
  }
  for (const kind of ["PXD", "AUDIO", "GAME"] as const) {
    if (!seenKinds.has(kind)) {
      diagnostics.push(diagnostic("PARTIAL_PACKAGE", "artifacts", `${kind} artifact is missing.`));
    }
  }
  const records = artifactRecords(bundle.artifacts);
  if (canonicalJson(records) !== canonicalJson(manifest.artifacts)) {
    diagnostics.push(
      diagnostic("HASH_MISMATCH", "manifest.artifacts", "Manifest artifact records do not match the bundle."),
    );
  }
  const expectedBase = expectedManifestBase(bundle);
  if (await sha256Bytes(jsonBytes(expectedBase)) !== manifest.manifestHash) {
    diagnostics.push(
      diagnostic("HASH_MISMATCH", "manifest.manifestHash", "Artifact manifest hash is invalid."),
    );
  }
  const expectedIdentity = await sha256Bytes(jsonBytes({
    candidatePackageHash: manifest.candidatePackageHash,
    candidateReproducibleBuildIdentity:
      manifest.candidateReproducibleBuildIdentity,
    artifacts: records,
  }));
  if (expectedIdentity !== manifest.reproducibleBuildIdentity) {
    diagnostics.push(
      diagnostic("HASH_MISMATCH", "manifest.reproducibleBuildIdentity", "Reproducible artifact identity is invalid."),
    );
  }
  // Do not feed untrusted paths into the ZIP encoder.  Besides being safer,
  // this keeps verification fail-closed with structured diagnostics instead
  // of leaking a lower-level encoder exception.
  if (diagnostics.length > 0) return failure(...diagnostics);
  const reconstructedEntries = [
    { filename: "manifest.json", bytes: cloneBytes(bundle.manifestBytes) },
    ...bundle.artifacts.map((artifact) => ({
      filename: artifact.path,
      bytes: cloneBytes(artifact.bytes),
    })),
  ].sort((left, right) => left.filename.localeCompare(right.filename));
  const reconstructedZip = encodeStoredZip(reconstructedEntries);
  if (
    canonicalBytes(reconstructedZip) !== canonicalBytes(bundle.zip.bytes) ||
    !validHash(bundle.zip.contentHash) ||
    await sha256Bytes(bundle.zip.bytes) !== bundle.zip.contentHash
  ) {
    diagnostics.push(
      diagnostic("HASH_MISMATCH", "bundle.zip", "Release ZIP bytes or hash is invalid."),
    );
  }
  if (diagnostics.length > 0) return failure(...diagnostics);
  return success(bundle);
}

function canonicalBytes(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
