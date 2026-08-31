import { canonicalJson, hashCanonical } from "../../wp160-contracts.ts";
import { sourcePathIsSafe, type AudioProject, type AudioRevision } from "../audio-200/contracts.ts";
import type { AudioEventGraph } from "../audio-210/contracts.ts";
import {
  AUDIO220_ARCHIVE_VERSION, AUDIO220_SCHEMA_VERSION, asAudio220PackageId, audio220Fail, audio220Ok,
  type Audio220Authority, type Audio220CallerClaims, type Audio220DependencyLockEntry, type Audio220Diagnostic,
  type Audio220PackageEnvelope, type Audio220PackageManifest, type Audio220Result, type Audio220LicenseSnapshot,
  type Audio220Materialization, type Audio220ProvenanceSnapshot,
} from "./contracts.ts";

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_URI = /^https?:\/\/[^\s]+$/;

function fail<T>(code: Parameters<typeof audio220Fail>[0], message: string, path?: string): Audio220Result<T> {
  return audio220Fail(code, message, path);
}
function revisionFor(project: AudioProject, revisionId: string): AudioRevision | null {
  return project.revisions.find((item) => item.revisionId === revisionId) ?? null;
}
function validateLocator(locator: AudioRevision["source"]["locator"], path: string): Audio220Diagnostic | null {
  if (locator.namespace !== "audio" || !sourcePathIsSafe(locator.relativePath)) {
    return { code: "AUDIO220_PATH_TRAVERSAL", message: "Audio locator path is not a safe relative path.", path, recoverable: false };
  }
  if (!SHA256.test(locator.contentHash) || !Number.isSafeInteger(locator.byteLength) || locator.byteLength < 0) {
    return { code: "AUDIO220_HASH_MISMATCH", message: "Locator hash or byte length is invalid.", path, recoverable: false };
  }
  return null;
}
function validLicense(license: Audio220LicenseSnapshot): boolean {
  return ["CC0", "CC_BY", "CC_BY_SA", "PROPRIETARY"].includes(license.kind) &&
    license.snapshotId.length > 0 && license.licenseId.length > 0 && license.version.length > 0 &&
    license.subjectId.length > 0 && license.holderId.length > 0 && SAFE_URI.test(license.sourceUri) && SHA256.test(license.snapshotHash);
}
function validProvenance(provenance: Audio220ProvenanceSnapshot, revision: AudioRevision): boolean {
  return provenance.sourceRevisionId === revision.revisionId && provenance.sourceHash === revision.source.metadata.contentHash &&
    provenance.creatorId.length > 0 && SHA256.test(provenance.snapshotHash);
}
function claimsMatch(claims: Audio220CallerClaims | undefined, manifest: { readonly packageId: string; readonly projectId: string; readonly audioRevisionId: string; readonly dependencies: readonly { readonly contentHash: string; readonly locator: { readonly relativePath: string } }[] }, license: Audio220LicenseSnapshot): boolean {
  if (!claims) return true;
  return (claims.packageId === undefined || claims.packageId === manifest.packageId) &&
    (claims.projectId === undefined || claims.projectId === manifest.projectId) &&
    (claims.revisionId === undefined || claims.revisionId === manifest.audioRevisionId) &&
    (claims.contentHash === undefined || claims.contentHash === manifest.dependencies[0]?.contentHash) &&
    (claims.licenseId === undefined || claims.licenseId === license.licenseId) &&
    (claims.locator === undefined || claims.locator === manifest.dependencies[0]?.locator.relativePath);
}
function containsRawPayload(value: unknown): boolean {
  const rawKeys = new Set(["arrayBuffer", "base64", "blob", "bytes", "dataUrl", "pcm", "samples"]);
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return true;
  if (Array.isArray(value)) return value.some(containsRawPayload);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, item]) => rawKeys.has(key) || containsRawPayload(item));
}
function hasDependencyCycle(dependencies: readonly Audio220DependencyLockEntry[]): boolean {
  const edges = new Map(dependencies.map((dependency) => [dependency.dependencyId, dependency.dependsOn]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of edges.get(id) ?? []) if (!edges.has(next) || visit(next)) return true;
    visiting.delete(id); visited.add(id); return false;
  };
  return dependencies.some((dependency) => visit(dependency.dependencyId));
}

export async function createAudioPackage(
  project: AudioProject,
  graph: AudioEventGraph,
  materialization: Audio220Materialization,
  packageId: string,
  authority: Audio220Authority,
  callerClaims?: Audio220CallerClaims,
): Promise<Audio220Result<Audio220PackageEnvelope>> {
  if (graph.projectId !== project.projectId || graph.projectRevision !== project.projectRevision) return fail("AUDIO220_INVALID_INPUT", "Graph is not bound to the canonical project.", "graph");
  if (graph.bindings.some((binding) => binding.referenceMode !== "PINNED")) return fail("AUDIO220_UNLOCKED_REVISION", "Package input must use only PINNED audio events.", "graph.bindings");
  const revisions = graph.bindings.map((binding) => revisionFor(project, binding.revisionId));
  if (revisions.some((revision) => revision === null)) return fail("AUDIO220_MISSING_DEPENDENCY", "A pinned revision is absent from the canonical project.", "graph.bindings");
  const unique = [...new Map(graph.bindings.map((binding) => [`${binding.assetId}:${binding.revisionId}`, binding])).values()];
  const uniqueRevisions = unique.map((binding) => revisionFor(project, binding.revisionId)!);
  const dependencies: Audio220DependencyLockEntry[] = [];
  const licenses: Audio220LicenseSnapshot[] = [];
  const provenances: Audio220ProvenanceSnapshot[] = [];
  for (let index = 0; index < uniqueRevisions.length; index += 1) {
    const revision = uniqueRevisions[index]!;
    const binding = unique[index]!;
    const locatorDiagnostic = validateLocator(revision.source.locator, `dependencies[${index}].locator`);
    if (locatorDiagnostic) return { ok: false, diagnostics: [locatorDiagnostic] };
    if (revision.source.locator.contentHash !== revision.source.metadata.contentHash || revision.source.locator.byteLength !== revision.source.metadata.byteLength) return fail("AUDIO220_HASH_MISMATCH", "Locator does not match canonical revision metadata.", `dependencies[${index}]`);
    const license = authority.resolveLicense(revision.revisionId);
    const provenance = authority.resolveProvenance(revision.revisionId);
    if (!license) return fail("AUDIO220_MISSING_DEPENDENCY", "Canonical license snapshot is missing.", `dependencies[${index}].license`);
    if (!validLicense(license)) return fail("AUDIO220_UNSUPPORTED_LICENSE", "License snapshot is unsupported or malformed.", `dependencies[${index}].license`);
    if (!provenance || !validProvenance(provenance, revision)) return fail("AUDIO220_MISSING_DEPENDENCY", "Canonical provenance snapshot is missing or unbound.", `dependencies[${index}].provenance`);
    if (!claimsMatch(callerClaims, { packageId: asAudio220PackageId(packageId), projectId: project.projectId, audioRevisionId: revision.revisionId, dependencies: [{ contentHash: revision.source.metadata.contentHash, locator: revision.source.locator }] }, license)) return fail("AUDIO220_INVALID_INPUT", "Caller claims do not match canonical package inputs.", "callerClaims");
    licenses.push(license); provenances.push(provenance);
    dependencies.push({ dependencyId: `${revision.assetId}:${revision.revisionId}`, kind: "AUDIO_SOURCE", projectId: project.projectId, assetId: revision.assetId, revisionId: revision.revisionId, revisionNumber: revision.revisionNumber, contentHash: revision.source.metadata.contentHash, byteLength: revision.source.metadata.byteLength, mimeType: revision.source.metadata.mimeType, locator: revision.source.locator, licenseSnapshotHash: license.snapshotHash, provenanceSnapshotHash: provenance.snapshotHash, dependsOn: [], mode: "PINNED" });
    if (materialization === "PORTABLE" && revision.source.locator.placement === "MEMORY_PREVIEW") return fail("AUDIO220_OFFLINE", "PORTABLE package cannot lock an ephemeral memory locator.", `dependencies[${index}].locator`);
    if (binding.assetId !== revision.assetId) return fail("AUDIO220_HASH_MISMATCH", "Event asset and revision asset differ.", `dependencies[${index}]`);
  }
  const dependencyLockHash = await hashCanonical(dependencies);
  const manifestUnsigned = { schemaVersion: AUDIO220_SCHEMA_VERSION, archiveVersion: AUDIO220_ARCHIVE_VERSION, packageId: asAudio220PackageId(packageId), projectId: project.projectId, materialization, audioRevisionId: dependencies[0]?.revisionId ?? ("none" as never), graphHash: graph.stateHash, dependencyLockHash, licenseSnapshotHashes: licenses.map((item) => item.snapshotHash), provenanceSnapshotHashes: provenances.map((item) => item.snapshotHash), licenseSnapshots: licenses, provenanceSnapshots: provenances, dependencies } as const;
  const manifestHash = await hashCanonical(manifestUnsigned);
  const manifest = { ...manifestUnsigned, manifestHash };
  const packageHash = await hashCanonical({ schemaVersion: AUDIO220_SCHEMA_VERSION, manifest });
  return audio220Ok({ schemaVersion: AUDIO220_SCHEMA_VERSION, manifest, packageHash });
}

export async function exportAudioPackage(envelope: Audio220PackageEnvelope): Promise<Audio220Result<string>> {
  const check = await validateAudioPackage(envelope);
  if (!check.ok) return check;
  return audio220Ok(canonicalJson(envelope));
}

export async function importAudioPackage(serialized: string): Promise<Audio220Result<Audio220PackageEnvelope>> {
  if (typeof serialized !== "string" || serialized.length > 2_000_000) return fail("AUDIO220_INVALID_EXPORT", "Serialized package is invalid or too large.");
  let value: unknown;
  try { value = JSON.parse(serialized); } catch { return fail("AUDIO220_INVALID_EXPORT", "Serialized package is not valid JSON."); }
  if (containsRawPayload(value)) return fail("AUDIO220_RAW_PAYLOAD_REJECTED", "Raw audio payloads are not package authority.");
  if (value === null || typeof value !== "object" || Array.isArray(value)) return fail("AUDIO220_INVALID_EXPORT", "Package envelope must be an object.");
  return validateAudioPackage(value as Audio220PackageEnvelope);
}

export async function validateAudioPackage(envelope: Audio220PackageEnvelope): Promise<Audio220Result<Audio220PackageEnvelope>> {
  const manifest = envelope?.manifest;
  if (!envelope || envelope.schemaVersion !== AUDIO220_SCHEMA_VERSION || !manifest || manifest.schemaVersion !== AUDIO220_SCHEMA_VERSION || manifest.archiveVersion !== AUDIO220_ARCHIVE_VERSION) return fail("AUDIO220_UNSUPPORTED_SCHEMA", "Unsupported or missing AUDIO-220 package schema.");
  if (!Array.isArray(manifest.dependencies) || manifest.dependencies.length === 0) return fail("AUDIO220_MISSING_DEPENDENCY", "Package must contain at least one dependency.", "manifest.dependencies");
  if (containsRawPayload(envelope)) return fail("AUDIO220_RAW_PAYLOAD_REJECTED", "Raw audio payloads are not package authority.");
  if (!Array.isArray(manifest.licenseSnapshots) || !Array.isArray(manifest.provenanceSnapshots)) return fail("AUDIO220_AMBIGUOUS_LICENSE", "License and provenance snapshots are missing.", "manifest");
  const seen = new Set<string>();
  for (const [index, dependency] of manifest.dependencies.entries()) {
    if (seen.has(dependency.dependencyId)) return fail("AUDIO220_DUPLICATE_DEPENDENCY", "Duplicate dependency id.", `manifest.dependencies[${index}]`);
    seen.add(dependency.dependencyId);
    const pathDiagnostic = validateLocator(dependency.locator, `manifest.dependencies[${index}].locator`);
    if (pathDiagnostic) return { ok: false, diagnostics: [pathDiagnostic] };
    if (dependency.renderedLocator) {
      const renderedDiagnostic = validateLocator(dependency.renderedLocator, `manifest.dependencies[${index}].renderedLocator`);
      if (renderedDiagnostic) return { ok: false, diagnostics: [renderedDiagnostic] };
    }
    if (dependency.mode !== "PINNED" || dependency.locator.contentHash !== dependency.contentHash || dependency.locator.byteLength !== dependency.byteLength) return fail("AUDIO220_HASH_MISMATCH", "Dependency lock is not exact or locator metadata differs.", `manifest.dependencies[${index}]`);
    if (dependency.kind !== "AUDIO_SOURCE") return fail("AUDIO220_UNSUPPORTED_SCHEMA", "Unsupported audio dependency kind.", `manifest.dependencies[${index}].kind`);
    if (dependency.dependsOn.some((id: string) => typeof id !== "string")) return fail("AUDIO220_INVALID_INPUT", "Dependency edges must be stable ids.", `manifest.dependencies[${index}].dependsOn`);
  }
  if (hasDependencyCycle(manifest.dependencies)) return fail("AUDIO220_DEPENDENCY_CYCLE", "Dependency lock contains a cycle or missing dependency edge.", "manifest.dependencies");
  const lockHash = await hashCanonical(manifest.dependencies);
  if (lockHash !== manifest.dependencyLockHash) return fail("AUDIO220_MANIFEST_TAMPERED", "Dependency lock hash does not match the manifest.", "manifest.dependencyLockHash");
  const { manifestHash, ...unsigned } = manifest;
  if (await hashCanonical(unsigned) !== manifestHash) return fail("AUDIO220_MANIFEST_TAMPERED", "Manifest hash does not match its contents.", "manifest.manifestHash");
  if (await hashCanonical({ schemaVersion: AUDIO220_SCHEMA_VERSION, manifest }) !== envelope.packageHash) return fail("AUDIO220_MANIFEST_TAMPERED", "Package hash does not match the envelope.", "packageHash");
  if (manifest.licenseSnapshotHashes.length !== manifest.dependencies.length || manifest.provenanceSnapshotHashes.length !== manifest.dependencies.length || manifest.licenseSnapshots.length !== manifest.dependencies.length || manifest.provenanceSnapshots.length !== manifest.dependencies.length) return fail("AUDIO220_AMBIGUOUS_LICENSE", "License and provenance snapshots are incomplete.", "manifest");
  if (manifest.licenseSnapshots.some((snapshot, index) => snapshot.snapshotHash !== manifest.licenseSnapshotHashes[index] || !validLicense(snapshot))) return fail("AUDIO220_AMBIGUOUS_LICENSE", "License snapshot binding is invalid.", "manifest.licenseSnapshots");
  if (manifest.provenanceSnapshots.some((snapshot, index) => snapshot.snapshotHash !== manifest.provenanceSnapshotHashes[index] || !SHA256.test(snapshot.snapshotHash))) return fail("AUDIO220_AMBIGUOUS_LICENSE", "Provenance snapshot binding is invalid.", "manifest.provenanceSnapshots");
  return audio220Ok(envelope);
}
