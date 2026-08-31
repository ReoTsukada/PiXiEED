/**
 * STUDIO-020 Package / Publish boundary.
 *
 * This module assembles the three Studio packages from canonical metadata. It
 * intentionally does not read or copy pixels, PCM, blobs, or executable
 * payloads. The source tools remain the owners of those bytes; the package
 * only carries their Asset ID, Revision, Hash, License, and registry facts.
 */

import {
  type AssetKind,
  type CallerContext,
  canonicalJson,
  type GameProject,
  type Sha256,
  sha256,
  validateGameProject,
} from "../game/game-300/core.ts";
import {
  type IntegrationDiagnostic,
  type IntegrationDiagnosticCode,
  type IntegrationResult,
  type LicenseSnapshot,
  type PackageManifest as IntegrationPackageManifest,
  verifyManifest,
} from "../game/game-340/core.ts";
import {
  asAssetId as asRuntimeAssetId,
  asAssetRevisionId as asRuntimeAssetRevisionId,
  asPackageId as asRuntimePackageId,
  asSha256 as asRuntimeSha256,
  type BuildConfiguration,
  type BuildTarget,
  calculateDependencySnapshotHash,
  type DependencyLockEntry,
  type DependencySnapshot,
  type RuntimeVersionContract,
} from "../wp160-contracts.ts";
import type { BuildRequest } from "../wp160-build-pipeline.ts";

export const STUDIO_PACKAGE_SCHEMA_VERSION = 1 as const;

export type StudioPackageKind = "PXD" | "AUDIO" | "GAME";

export interface StudioAssetRegistryEntry {
  readonly kind: AssetKind;
  readonly assetId: string;
  readonly revisionId: string;
  readonly contentHash: Sha256;
  readonly ownerId: string;
  readonly licenseId: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly sourcePackage: Exclude<StudioPackageKind, "GAME">;
}

export interface StudioAssetRegistryReference
  extends StudioAssetRegistryEntry {}

export interface StudioReleaseInput {
  readonly packageId: string;
  readonly packageVersion: string;
  readonly project: GameProject;
  readonly integration: IntegrationPackageManifest;
  readonly caller: CallerContext;
  readonly assetRegistry: readonly StudioAssetRegistryEntry[];
}

export interface StudioBuildRequestInput {
  readonly requestId: string;
  readonly target: BuildTarget;
  readonly configuration: BuildConfiguration;
  readonly runtime: RuntimeVersionContract;
}

export interface StudioPackageArtifact {
  readonly kind: StudioPackageKind;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly projectId: string;
  readonly projectRevisionId: string;
  readonly projectHash: Sha256;
  readonly integrationManifestHash: Sha256;
  readonly references: readonly StudioAssetRegistryReference[];
  readonly contentHash: Sha256;
}

export interface StudioReleaseManifest {
  readonly schemaVersion: typeof STUDIO_PACKAGE_SCHEMA_VERSION;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly projectRevisionId: string;
  readonly projectHash: Sha256;
  readonly integrationManifestHash: Sha256;
  readonly assetRegistryHash: Sha256;
  readonly licenseHash: Sha256;
  readonly packages: readonly StudioPackageArtifact[];
  readonly packageHash: Sha256;
  readonly reproducibleBuildIdentity: Sha256;
}

export interface StudioReleaseVerification {
  readonly referencesLocked: true;
  readonly rightsVerified: true;
  readonly packageHashesDeterministic: true;
  readonly sourcePayloadsExternal: true;
}

export interface StudioReleaseCandidate {
  readonly status: "VERIFIED";
  readonly manifest: StudioReleaseManifest;
  readonly verification: StudioReleaseVerification;
}

export interface StudioPublishIntent {
  readonly kind: "STUDIO_PUBLISH_INTENT";
  readonly packageId: string;
  readonly packageVersion: string;
  readonly projectRevisionId: string;
  readonly packageHash: Sha256;
  readonly requestedBy: string;
  readonly explicit: true;
  readonly note:
    "External distribution requires a separate approved operation.";
}

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "bytes",
  "rawbytes",
  "pixels",
  "pixeldata",
  "pcm",
  "samples",
  "sampledata",
  "audiobuffer",
  "imagedata",
]);

function diagnostic(
  code: IntegrationDiagnosticCode,
  path: string,
  message: string,
  recoverable = false,
): IntegrationDiagnostic {
  return { code, path, message, recoverable };
}

function failure<T>(
  ...diagnostics: IntegrationDiagnostic[]
): IntegrationResult<T> {
  return { ok: false, diagnostics };
}

function success<T>(value: T): IntegrationResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function stable(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value);
}

function validHash(value: unknown): value is Sha256 {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function registryKey(
  value: Pick<StudioAssetRegistryEntry, "kind" | "assetId" | "revisionId">,
): string {
  return `${value.kind}:${value.assetId}:${value.revisionId}`;
}

function sourcePackageFor(kind: AssetKind): Exclude<StudioPackageKind, "GAME"> {
  return kind === "DRAW" ? "PXD" : "AUDIO";
}

function sortedRegistry(
  entries: readonly StudioAssetRegistryEntry[],
): readonly StudioAssetRegistryEntry[] {
  return entries.slice().sort((left, right) =>
    registryKey(left).localeCompare(registryKey(right))
  );
}

function sortedLicenses(
  licenses: readonly LicenseSnapshot[],
): readonly LicenseSnapshot[] {
  return licenses.slice().sort((left, right) =>
    left.licenseId.localeCompare(right.licenseId)
  );
}

function forbiddenPayloadPath(value: unknown): string | undefined {
  const visited = new Set<object>();
  const visit = (candidate: unknown, path: string): string | undefined => {
    if (candidate === null || typeof candidate !== "object") return undefined;
    if (visited.has(candidate)) return undefined;
    visited.add(candidate);
    if (Array.isArray(candidate)) {
      for (let index = 0; index < candidate.length; index += 1) {
        const found = visit(candidate[index], `${path}[${index}]`);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    for (const key of Object.keys(candidate)) {
      const normalized = key.toLowerCase().replaceAll("_", "").replaceAll(
        "-",
        "",
      );
      if (FORBIDDEN_PAYLOAD_KEYS.has(normalized)) {
        return `${path}.${key}`;
      }
      const found = visit(
        (candidate as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return visit(value, "input");
}

async function verifyIntegrationManifest(
  input: StudioReleaseInput,
): Promise<readonly IntegrationDiagnostic[]> {
  const diagnostics: IntegrationDiagnostic[] = [];
  const projectValidation = validateGameProject(input.project, input.caller);
  if (!projectValidation.valid) {
    diagnostics.push(
      diagnostic(
        "INVALID_PROJECT",
        "project",
        "Canonical Game Project validation failed.",
      ),
    );
  }
  const verified = verifyManifest(input.integration, {
    projectId: String(input.caller.projectId),
    ownerId: String(input.caller.ownerId),
    revisionId: String(input.caller.revisionId),
  });
  if (!verified.ok) diagnostics.push(...verified.diagnostics);
  if (!stable(input.packageId)) {
    diagnostics.push(
      diagnostic("INVALID_CLAIM", "packageId", "Package ID is unstable."),
    );
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$/u.test(input.packageVersion)) {
    diagnostics.push(
      diagnostic(
        "INVALID_CLAIM",
        "packageVersion",
        "Package version is not a stable identifier.",
      ),
    );
  }
  if (String(input.project.projectId) !== input.integration.projectId) {
    diagnostics.push(
      diagnostic(
        "WRONG_PROJECT",
        "integration.projectId",
        "Integration manifest belongs to another project.",
      ),
    );
  }
  if (String(input.project.ownerId) !== input.integration.ownerId) {
    diagnostics.push(
      diagnostic(
        "WRONG_OWNER",
        "integration.ownerId",
        "Integration manifest belongs to another owner.",
      ),
    );
  }
  if (
    String(input.project.revision.revisionId) !==
      input.integration.projectRevisionId
  ) {
    diagnostics.push(
      diagnostic(
        "STALE_REVISION",
        "integration.projectRevisionId",
        "Integration manifest is not bound to the current Project revision.",
      ),
    );
  }
  if (input.project.revision.snapshotHash !== input.integration.projectHash) {
    diagnostics.push(
      diagnostic(
        "HASH_MISMATCH",
        "integration.projectHash",
        "Integration project hash does not match the canonical Project.",
      ),
    );
  }
  const { packageHash: integrationPackageHash, ...integrationBase } =
    input.integration;
  if (
    !validHash(integrationPackageHash) ||
    await sha256(integrationBase) !== integrationPackageHash
  ) {
    diagnostics.push(
      diagnostic(
        "HASH_MISMATCH",
        "integration.packageHash",
        "Integration manifest hash does not match its contents.",
      ),
    );
  }
  const seenLocks = new Set<string>();
  for (const lock of input.integration.assetLocks) {
    const key = registryKey(lock);
    if (seenLocks.has(key)) {
      diagnostics.push(
        diagnostic(
          "DUPLICATE_REFERENCE",
          "integration.assetLocks",
          `Duplicate locked asset: ${key}`,
        ),
      );
    }
    seenLocks.add(key);
    if (lock.mode !== "PINNED") {
      diagnostics.push(
        diagnostic(
          "MODE_MISMATCH",
          `integration.assetLocks.${key}.mode`,
          "Publish input must pin every asset Revision.",
        ),
      );
    }
    if (!validHash(lock.contentHash)) {
      diagnostics.push(
        diagnostic(
          "HASH_MISMATCH",
          `integration.assetLocks.${key}.contentHash`,
          "Asset lock hash is not a lowercase SHA-256 value.",
        ),
      );
    }
  }
  const seenLicenses = new Set<string>();
  for (const license of input.integration.licenses) {
    if (seenLicenses.has(license.licenseId)) {
      diagnostics.push(
        diagnostic(
          "DUPLICATE_REFERENCE",
          "integration.licenses",
          `Duplicate license snapshot: ${license.licenseId}`,
        ),
      );
    }
    seenLicenses.add(license.licenseId);
    if (
      license.scope !== "PACKAGE" ||
      license.ownerId !== String(input.project.ownerId) ||
      license.revisionId !== String(input.project.revision.revisionId)
    ) {
      diagnostics.push(
        diagnostic(
          "LICENSE_MISSING",
          `integration.licenses.${license.licenseId}`,
          "Package license is not bound to the Project owner and Revision.",
        ),
      );
    }
  }
  const requiredLicenseIds = new Set(
    input.integration.assetLocks.map((lock) => lock.licenseId),
  );
  for (const licenseId of requiredLicenseIds) {
    if (!seenLicenses.has(licenseId)) {
      diagnostics.push(
        diagnostic(
          "LICENSE_MISSING",
          "integration.licenses",
          `Missing package license snapshot: ${licenseId}`,
        ),
      );
    }
  }
  return diagnostics;
}

function verifyRegistry(
  input: StudioReleaseInput,
): readonly IntegrationDiagnostic[] {
  const diagnostics: IntegrationDiagnostic[] = [];
  const locks = input.integration.assetLocks;
  const lockByKey = new Map(locks.map((lock) => [registryKey(lock), lock]));
  const registryByKey = new Map<string, StudioAssetRegistryEntry>();
  for (const entry of input.assetRegistry) {
    const key = registryKey(entry);
    if (registryByKey.has(key)) {
      diagnostics.push(
        diagnostic(
          "DUPLICATE_REFERENCE",
          "assetRegistry",
          `Duplicate registry entry: ${key}`,
        ),
      );
      continue;
    }
    registryByKey.set(key, entry);
    if (
      !stable(entry.assetId) || !stable(entry.revisionId) ||
      !stable(entry.ownerId) || !stable(entry.licenseId)
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_CLAIM",
          `assetRegistry.${key}`,
          "Registry identity is not stable.",
        ),
      );
    }
    if (!validHash(entry.contentHash)) {
      diagnostics.push(
        diagnostic(
          "HASH_MISMATCH",
          `assetRegistry.${key}.contentHash`,
          "Registry hash is not a lowercase SHA-256 value.",
        ),
      );
    }
    if (!Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0) {
      diagnostics.push(
        diagnostic(
          "INVALID_CLAIM",
          `assetRegistry.${key}.byteLength`,
          "Registry byteLength must be a non-negative safe integer.",
        ),
      );
    }
    if (
      typeof entry.mimeType !== "string" ||
      entry.mimeType.trim().length === 0 ||
      /[\u0000-\u001f]/u.test(entry.mimeType)
    ) {
      diagnostics.push(
        diagnostic(
          "INVALID_CLAIM",
          `assetRegistry.${key}.mimeType`,
          "Registry MIME type is invalid.",
        ),
      );
    }
    const expectedPackage = sourcePackageFor(entry.kind);
    if (entry.sourcePackage !== expectedPackage) {
      diagnostics.push(
        diagnostic(
          "INVALID_CLAIM",
          `assetRegistry.${key}.sourcePackage`,
          `Expected ${expectedPackage} for ${entry.kind} assets.`,
        ),
      );
    }
    const lock = lockByKey.get(key);
    if (lock === undefined) {
      diagnostics.push(
        diagnostic(
          "PARTIAL_PACKAGE",
          `assetRegistry.${key}`,
          "Registry entry is not locked by the integration manifest.",
        ),
      );
      continue;
    }
    if (
      entry.kind !== lock.kind || entry.assetId !== lock.assetId ||
      entry.revisionId !== lock.revisionId ||
      entry.contentHash !== lock.contentHash ||
      entry.ownerId !== input.integration.ownerId ||
      entry.licenseId !== lock.licenseId
    ) {
      diagnostics.push(
        diagnostic(
          "HASH_MISMATCH",
          `assetRegistry.${key}`,
          "Registry metadata does not match the locked Asset Revision.",
        ),
      );
    }
  }
  for (const lock of locks) {
    if (!registryByKey.has(registryKey(lock))) {
      diagnostics.push(
        diagnostic(
          "PARTIAL_PACKAGE",
          "assetRegistry",
          `Missing registry entry: ${registryKey(lock)}`,
        ),
      );
    }
  }
  if (registryByKey.size !== lockByKey.size) {
    diagnostics.push(
      diagnostic(
        "PARTIAL_PACKAGE",
        "assetRegistry",
        "Asset Registry must exactly cover the locked Draw and Audio assets.",
      ),
    );
  }
  if (!input.assetRegistry.some((entry) => entry.kind === "DRAW")) {
    diagnostics.push(
      diagnostic("PARTIAL_PACKAGE", "assetRegistry", "PXD source is missing."),
    );
  }
  if (!input.assetRegistry.some((entry) => entry.kind === "AUDIO")) {
    diagnostics.push(
      diagnostic(
        "PARTIAL_PACKAGE",
        "assetRegistry",
        "Audio source is missing.",
      ),
    );
  }
  return diagnostics;
}

function packageReferences(
  entries: readonly StudioAssetRegistryEntry[],
  kind: StudioPackageKind,
): readonly StudioAssetRegistryReference[] {
  const filtered = kind === "GAME"
    ? entries
    : entries.filter((entry) => entry.sourcePackage === kind);
  return sortedRegistry(filtered).map((entry) => ({ ...entry }));
}

async function createPackageArtifact(
  input: StudioReleaseInput,
  integrationManifestHash: Sha256,
  kind: StudioPackageKind,
): Promise<StudioPackageArtifact> {
  const references = packageReferences(input.assetRegistry, kind);
  const base = {
    kind,
    packageId: input.packageId,
    packageVersion: input.packageVersion,
    projectId: String(input.project.projectId),
    projectRevisionId: String(input.project.revision.revisionId),
    projectHash: input.project.revision.snapshotHash,
    integrationManifestHash,
    references,
  } satisfies Omit<StudioPackageArtifact, "contentHash">;
  return { ...base, contentHash: await sha256(base) };
}

async function verifyReleaseManifest(
  manifest: StudioReleaseManifest,
): Promise<readonly IntegrationDiagnostic[]> {
  const diagnostics: IntegrationDiagnostic[] = [];
  if (manifest.schemaVersion !== STUDIO_PACKAGE_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic(
        "UNSUPPORTED_SCHEMA",
        "schemaVersion",
        "Studio Package schema is unsupported.",
      ),
    );
  }
  if (
    !validHash(manifest.packageHash) ||
    !validHash(manifest.reproducibleBuildIdentity)
  ) {
    diagnostics.push(
      diagnostic(
        "HASH_MISMATCH",
        "manifest",
        "Studio Package hashes are malformed.",
      ),
    );
    return diagnostics;
  }
  const { packageHash, reproducibleBuildIdentity, ...base } = manifest;
  if (await sha256(base) !== packageHash) {
    diagnostics.push(
      diagnostic(
        "HASH_MISMATCH",
        "manifest.packageHash",
        "Studio Package hash does not match its contents.",
      ),
    );
  }
  if (
    await sha256({ packageHash, packages: manifest.packages }) !==
      reproducibleBuildIdentity
  ) {
    diagnostics.push(
      diagnostic(
        "HASH_MISMATCH",
        "manifest.reproducibleBuildIdentity",
        "Reproducible Build identity does not match the Package.",
      ),
    );
  }
  const expectedKinds: readonly StudioPackageKind[] = ["PXD", "AUDIO", "GAME"];
  if (
    manifest.packages.length !== expectedKinds.length ||
    expectedKinds.some((kind) =>
      manifest.packages.filter((item) => item.kind === kind).length !== 1
    )
  ) {
    diagnostics.push(
      diagnostic(
        "PARTIAL_PACKAGE",
        "manifest.packages",
        "PXD, Audio, and Game packages must each be present exactly once.",
      ),
    );
  }
  for (const artifact of manifest.packages) {
    const { contentHash, ...artifactBase } = artifact;
    if (!validHash(contentHash) || await sha256(artifactBase) !== contentHash) {
      diagnostics.push(
        diagnostic(
          "HASH_MISMATCH",
          `manifest.packages.${artifact.kind}.contentHash`,
          "Sub-package hash does not match its references.",
        ),
      );
    }
  }
  return diagnostics;
}

/** Create a verified, metadata-only PXD + Audio + Game release candidate. */
export async function createStudioReleaseCandidate(
  input: StudioReleaseInput,
): Promise<IntegrationResult<StudioReleaseCandidate>> {
  const forbidden = forbiddenPayloadPath(input);
  if (forbidden !== undefined) {
    return failure(
      diagnostic(
        "INVALID_CLAIM",
        forbidden,
        "Raw media or executable payloads cannot enter a Studio Package.",
      ),
    );
  }
  const manifestDiagnostics = await verifyIntegrationManifest(input);
  const registryDiagnostics = verifyRegistry(input);
  if (manifestDiagnostics.length > 0 || registryDiagnostics.length > 0) {
    return failure(...manifestDiagnostics, ...registryDiagnostics);
  }
  const sortedEntries = sortedRegistry(input.assetRegistry);
  const integrationManifestHash = await sha256(input.integration);
  const assetRegistryHash = await sha256(sortedEntries);
  const licenseHash = await sha256(sortedLicenses(input.integration.licenses));
  const packages = ["PXD", "AUDIO", "GAME"] as const;
  const artifacts: StudioPackageArtifact[] = [];
  for (const kind of packages) {
    artifacts.push(
      await createPackageArtifact(input, integrationManifestHash, kind),
    );
  }
  const manifestBase = {
    schemaVersion: STUDIO_PACKAGE_SCHEMA_VERSION,
    packageId: input.packageId,
    packageVersion: input.packageVersion,
    projectId: String(input.project.projectId),
    ownerId: String(input.project.ownerId),
    projectRevisionId: String(input.project.revision.revisionId),
    projectHash: input.project.revision.snapshotHash,
    integrationManifestHash,
    assetRegistryHash,
    licenseHash,
    packages: artifacts,
  } satisfies Omit<
    StudioReleaseManifest,
    "packageHash" | "reproducibleBuildIdentity"
  >;
  const packageHash = await sha256(manifestBase);
  const reproducibleBuildIdentity = await sha256({
    packageHash,
    packages: artifacts,
  });
  const manifest: StudioReleaseManifest = {
    ...manifestBase,
    packageHash,
    reproducibleBuildIdentity,
  };
  const integrityDiagnostics = await verifyReleaseManifest(manifest);
  if (integrityDiagnostics.length > 0) return failure(...integrityDiagnostics);
  return success({
    status: "VERIFIED",
    manifest,
    verification: {
      referencesLocked: true,
      rightsVerified: true,
      packageHashesDeterministic: true,
      sourcePayloadsExternal: true,
    },
  });
}

/** Re-check a candidate before an explicitly approved external Publish step. */
export async function verifyStudioReleaseCandidate(
  candidate: StudioReleaseCandidate,
): Promise<IntegrationResult<StudioReleaseCandidate>> {
  if (candidate.status !== "VERIFIED") {
    return failure(
      diagnostic(
        "PARTIAL_PACKAGE",
        "candidate.status",
        "Only a verified Studio Package can be published.",
      ),
    );
  }
  if (!Object.values(candidate.verification).every((item) => item === true)) {
    return failure(
      diagnostic(
        "INVALID_CLAIM",
        "candidate.verification",
        "Every Studio Package verification flag must remain true.",
      ),
    );
  }
  const forbidden = forbiddenPayloadPath(candidate.manifest);
  if (forbidden !== undefined) {
    return failure(
      diagnostic(
        "INVALID_CLAIM",
        forbidden,
        "Raw media or executable payloads cannot enter a Studio Package.",
      ),
    );
  }
  const diagnostics = await verifyReleaseManifest(candidate.manifest);
  return diagnostics.length === 0
    ? success(candidate)
    : failure(...diagnostics);
}

/** This creates an intent only; it does not upload, publish, or mutate state. */
export async function createStudioPublishIntent(
  candidate: StudioReleaseCandidate,
  requestedBy: string,
): Promise<IntegrationResult<StudioPublishIntent>> {
  const verified = await verifyStudioReleaseCandidate(candidate);
  if (!verified.ok) return failure(...verified.diagnostics);
  if (!stable(requestedBy)) {
    return failure(
      diagnostic(
        "PERMISSION_DENIED",
        "requestedBy",
        "Publish requester must be a stable identity.",
      ),
    );
  }
  const manifest = candidate.manifest;
  return success({
    kind: "STUDIO_PUBLISH_INTENT",
    packageId: manifest.packageId,
    packageVersion: manifest.packageVersion,
    projectRevisionId: manifest.projectRevisionId,
    packageHash: manifest.packageHash,
    requestedBy,
    explicit: true,
    note: "External distribution requires a separate approved operation.",
  });
}

/**
 * Project the verified Studio manifest into the shared Build contract. The
 * returned request still contains metadata only; materialization is owned by
 * the existing WP-160/WP-200 Build pipeline.
 */
export async function createStudioBuildRequest(
  candidate: StudioReleaseCandidate,
  request: StudioBuildRequestInput,
): Promise<IntegrationResult<BuildRequest>> {
  const verified = await verifyStudioReleaseCandidate(candidate);
  if (!verified.ok) return failure(...verified.diagnostics);
  const manifest = candidate.manifest;
  const gamePackage = manifest.packages.find((item) => item.kind === "GAME");
  if (gamePackage === undefined) {
    return failure(
      diagnostic(
        "PARTIAL_PACKAGE",
        "manifest.packages.GAME",
        "Game Package is required before creating a Build request.",
      ),
    );
  }
  try {
    const packageId = asRuntimePackageId(manifest.packageId);
    const entries: DependencyLockEntry[] = gamePackage.references.map(
      (entry) => ({
        assetId: asRuntimeAssetId(entry.assetId),
        revisionId: asRuntimeAssetRevisionId(entry.revisionId),
        contentHash: asRuntimeSha256(entry.contentHash, "ContentHash"),
        byteLength: entry.byteLength,
        mimeType: entry.mimeType,
        mode: "PINNED",
        required: true,
      }),
    );
    const dependencies: DependencySnapshot = {
      packageId,
      packageVersion: manifest.packageVersion,
      entries: entries.slice().sort((left, right) =>
        left.assetId.localeCompare(right.assetId) ||
        left.revisionId.localeCompare(right.revisionId)
      ),
      snapshotHash: await calculateDependencySnapshotHash(
        packageId,
        manifest.packageVersion,
        entries,
      ),
      locked: true,
    };
    return success({
      requestId: request.requestId,
      packageId,
      packageVersion: manifest.packageVersion,
      packageHash: asRuntimeSha256(manifest.packageHash, "ContentHash"),
      dependencies,
      target: request.target,
      configuration: request.configuration,
      runtime: request.runtime,
      sourceRevisionId: manifest.projectRevisionId,
    });
  } catch (error) {
    return failure(
      diagnostic(
        "INVALID_CLAIM",
        "buildRequest",
        error instanceof Error
          ? error.message
          : "Studio Build request identity is invalid.",
      ),
    );
  }
}

export function canonicalStudioPackageJson(value: unknown): string {
  return canonicalJson(value);
}
