/** GAME-340: host-neutral Draw/Audio integration boundary. */
import {
  canonicalJson,
  sha256,
  validateGameProject,
  type AssetKind,
  type CallerContext,
  type GameProject,
  type Sha256,
} from "../game-300/core.ts";

export const GAME_INTEGRATION_SCHEMA_VERSION = 1 as const;
export type IntegrationMode = "LIVE" | "PINNED" | "REVIEW" | "FORKED";
export type IntegrationDiagnosticCode =
  | "INVALID_PROJECT" | "CALLER_CLAIM_MISMATCH" | "MISSING_ASSET" | "WRONG_PROJECT"
  | "WRONG_OWNER" | "STALE_REVISION" | "REVISION_MISMATCH" | "HASH_MISMATCH"
  | "MODE_MISMATCH" | "REVIEW_REQUIRED" | "FORK_MISMATCH" | "PERMISSION_DENIED"
  | "LICENSE_MISSING" | "DUPLICATE_REFERENCE" | "DUPLICATE_DEPENDENCY"
  | "DEPENDENCY_CYCLE" | "MISSING_DEPENDENCY" | "PARTIAL_PACKAGE" | "DUPLICATE_EVENT"
  | "OUT_OF_ORDER_EVENT" | "PINNED_LOCKED" | "INVALID_CLAIM" | "UNSUPPORTED_SCHEMA";

export interface IntegrationDiagnostic { readonly code: IntegrationDiagnosticCode; readonly path: string; readonly message: string; readonly recoverable: boolean; }
export interface IntegrationResult<T> { readonly ok: boolean; readonly value?: T; readonly diagnostics: readonly IntegrationDiagnostic[]; }
export interface AssetBinding {
  readonly componentId: string; readonly projectId: string; readonly ownerId: string;
  readonly kind: AssetKind; readonly assetId: string; readonly mode: IntegrationMode;
  readonly revisionId?: string; readonly forkId?: string; readonly contentHash?: Sha256;
  readonly licenseId: string; readonly permission: "READ" | "PREVIEW";
}
export interface CanonicalAssetRevision {
  readonly projectId: string; readonly ownerId: string; readonly kind: AssetKind;
  readonly assetId: string; readonly revisionId: string; readonly contentHash: Sha256;
  readonly licenseId: string; readonly permission: "READ" | "PREVIEW";
  readonly reviewStatus: "DRAFT" | "APPROVED"; readonly forkId?: string;
}
export interface DependencyLock {
  readonly dependencyId: string; readonly targetId: string; readonly targetRevisionId: string;
  readonly contentHash: Sha256; readonly licenseId: string; readonly dependsOn: readonly string[];
}
export interface LicenseSnapshot { readonly licenseId: string; readonly ownerId: string; readonly scope: "PREVIEW" | "PACKAGE"; readonly revisionId: string; }
export interface ResolvedAsset extends AssetBinding { readonly revisionId: string; readonly contentHash: Sha256; readonly licenseId: string; }
export interface PackageManifest {
  readonly schemaVersion: typeof GAME_INTEGRATION_SCHEMA_VERSION; readonly projectId: string; readonly ownerId: string;
  readonly projectRevisionId: string; readonly projectHash: Sha256; readonly assetLocks: readonly ResolvedAsset[];
  readonly dependencyLocks: readonly DependencyLock[]; readonly licenses: readonly LicenseSnapshot[];
  readonly packageHash: Sha256;
}
export interface PreviewUpdateEvent {
  readonly eventId: string; readonly sequence: number; readonly projectId: string; readonly ownerId: string;
  readonly projectRevisionId: string; readonly kind: AssetKind; readonly assetId: string;
  readonly revisionId: string; readonly contentHash: Sha256;
}
export interface PreviewState { readonly manifest: PackageManifest; readonly appliedEvents: readonly string[]; readonly updates: readonly PreviewUpdateEvent[]; }

function diagnostic(code: IntegrationDiagnosticCode, path: string, message: string, recoverable = true): IntegrationDiagnostic { return { code, path, message, recoverable }; }
function success<T>(value: T): IntegrationResult<T> { return { ok: true, value, diagnostics: [] }; }
function failure<T>(...diagnostics: IntegrationDiagnostic[]): IntegrationResult<T> { return { ok: false, diagnostics }; }
function stable(value: string): boolean { return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u.test(value); }
function byKey(a: { kind: AssetKind; assetId: string; revisionId: string }, b: { kind: AssetKind; assetId: string; revisionId: string }): number { return `${a.kind}:${a.assetId}:${a.revisionId}`.localeCompare(`${b.kind}:${b.assetId}:${b.revisionId}`); }
function callerDiagnostics(project: GameProject, caller: CallerContext): IntegrationDiagnostic[] {
  const out: IntegrationDiagnostic[] = [];
  if (String(project.projectId) !== String(caller.projectId)) out.push(diagnostic("WRONG_PROJECT", "caller.projectId", "Caller project claim does not match."));
  if (String(project.ownerId) !== String(caller.ownerId)) out.push(diagnostic("WRONG_OWNER", "caller.ownerId", "Caller owner claim does not match."));
  if (String(project.revision.revisionId) !== String(caller.revisionId)) out.push(diagnostic("STALE_REVISION", "caller.revisionId", "Caller project revision is stale."));
  return out;
}
function assetKey(value: Pick<AssetBinding, "kind" | "assetId">): string { return `${value.kind}:${value.assetId}`; }
function detectCycle(locks: readonly DependencyLock[]): boolean {
  const graph = new Map(locks.map((lock) => [lock.dependencyId, lock.dependsOn]));
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string): boolean => { if (visiting.has(id)) return true; if (visited.has(id)) return false; visiting.add(id); for (const next of graph.get(id) ?? []) if (visit(next)) return true; visiting.delete(id); visited.add(id); return false; };
  return locks.some((lock) => visit(lock.dependencyId));
}

export function resolveAssetBinding(binding: AssetBinding, authority: readonly CanonicalAssetRevision[], caller: CallerContext): IntegrationResult<ResolvedAsset> {
  const claim = [binding.projectId === String(caller.projectId) ? undefined : diagnostic("WRONG_PROJECT", "binding.projectId", "Asset binding belongs to another project."), binding.ownerId === String(caller.ownerId) ? undefined : diagnostic("WRONG_OWNER", "binding.ownerId", "Asset binding belongs to another owner."), binding.permission === "PREVIEW" || binding.permission === "READ" ? undefined : diagnostic("PERMISSION_DENIED", "binding.permission", "Preview permission is required.")].filter((item): item is IntegrationDiagnostic => item !== undefined);
  if (claim.length) return failure(...claim);
  if (!stable(binding.assetId) || !stable(binding.licenseId)) return failure(diagnostic("INVALID_CLAIM", "binding", "Binding identifiers are invalid."));
  const matches = authority.filter((item) => item.projectId === binding.projectId && item.ownerId === binding.ownerId && item.kind === binding.kind && item.assetId === binding.assetId);
  if (matches.length === 0) return failure(diagnostic("MISSING_ASSET", "binding.assetId", "Canonical asset revision is missing."));
  const current = matches.slice().sort((a, b) => a.revisionId.localeCompare(b.revisionId)).at(-1)!;
  const selected = binding.mode === "LIVE" ? current : matches.find((item) => item.revisionId === binding.revisionId);
  if (!selected) return failure(diagnostic("STALE_REVISION", "binding.revisionId", "Requested asset revision is not canonical."));
  if (binding.mode === "LIVE" && (binding.revisionId !== undefined || binding.contentHash !== undefined)) return failure(diagnostic("INVALID_CLAIM", "binding", "LIVE cannot carry a caller revision or hash override."));
  if (binding.mode !== "LIVE" && binding.revisionId !== selected.revisionId) return failure(diagnostic("REVISION_MISMATCH", "binding.revisionId", "Revision claim does not match canonical authority."));
  if (binding.contentHash !== undefined && binding.contentHash !== selected.contentHash) return failure(diagnostic("HASH_MISMATCH", "binding.contentHash", "Caller hash is not authoritative."));
  if (binding.licenseId !== selected.licenseId) return failure(diagnostic("LICENSE_MISSING", "binding.licenseId", "License claim does not match canonical authority."));
  if (binding.mode === "REVIEW" && selected.reviewStatus !== "APPROVED") return failure(diagnostic("REVIEW_REQUIRED", "binding.mode", "Review mode requires APPROVED authority."));
  if (binding.mode === "FORKED" && selected.forkId !== binding.forkId) return failure(diagnostic("FORK_MISMATCH", "binding.forkId", "Fork binding does not match canonical authority."));
  return success({ ...binding, revisionId: selected.revisionId, contentHash: selected.contentHash, licenseId: selected.licenseId });
}

function projectBindings(project: GameProject, caller: CallerContext): AssetBinding[] {
  return project.scenes.flatMap((scene) => scene.entities.flatMap((entity) => entity.components.flatMap((component) => {
    if (component.type !== "SPRITE" && component.type !== "AUDIO_SOURCE") return [];
    const base = { componentId: String(component.componentId), projectId: String(project.projectId), ownerId: String(project.ownerId), kind: component.asset.kind, assetId: String(component.asset.assetId), mode: component.asset.mode, licenseId: "", permission: "PREVIEW" as const };
    return [component.asset.mode === "PINNED" ? { ...base, revisionId: String(component.asset.revisionId) } : base];
  })));
}

export async function createIntegratedPackage(project: GameProject, caller: CallerContext, bindings: readonly AssetBinding[], authority: readonly CanonicalAssetRevision[], dependencyLocks: readonly DependencyLock[], licenses: readonly LicenseSnapshot[]): Promise<IntegrationResult<PackageManifest>> {
  const projectResult = validateGameProject(project, caller);
  if (!projectResult.valid) return failure(diagnostic("INVALID_PROJECT", "project", "GAME-300 project validation failed."));
  const callerIssues = callerDiagnostics(project, caller); if (callerIssues.length) return failure(...callerIssues);
  const expected = projectBindings(project, caller); const expectedKeys = new Set(expected.map((item) => item.componentId));
  if (bindings.length !== expected.length || bindings.some((item) => !expectedKeys.has(item.componentId))) return failure(diagnostic("PARTIAL_PACKAGE", "bindings", "Every Draw/Audio component must have exactly one integration binding."));
  const seen = new Set<string>(); const resolved: ResolvedAsset[] = [];
  for (const binding of bindings) { if (seen.has(binding.componentId)) return failure(diagnostic("DUPLICATE_REFERENCE", `bindings.${binding.componentId}`, "Duplicate component binding.")); seen.add(binding.componentId); const result = resolveAssetBinding(binding, authority, caller); if (!result.ok) return failure(...result.diagnostics); resolved.push(result.value!); }
  const depIds = new Set(project.dependencies.map((item) => String(item.dependencyId))); const lockIds = new Set<string>();
  for (const lock of dependencyLocks) { if (lockIds.has(lock.dependencyId)) return failure(diagnostic("DUPLICATE_DEPENDENCY", "dependencyLocks", "Duplicate dependency lock.")); lockIds.add(lock.dependencyId); if (!depIds.has(lock.dependencyId)) return failure(diagnostic("MISSING_DEPENDENCY", "dependencyLocks", "Dependency lock is not declared by the project.")); }
  if (lockIds.size !== depIds.size) return failure(diagnostic("PARTIAL_PACKAGE", "dependencyLocks", "Dependency locks are incomplete."));
  if (detectCycle(dependencyLocks)) return failure(diagnostic("DEPENDENCY_CYCLE", "dependencyLocks", "Dependency lock graph contains a cycle."));
  const requiredLicenseIds = new Set([...resolved.map((item) => item.licenseId), ...dependencyLocks.map((item) => item.licenseId)]);
  if (licenses.some((item, index) => licenses.findIndex((other) => other.licenseId === item.licenseId) !== index) || [...requiredLicenseIds].some((id) => !licenses.some((item) => item.licenseId === id))) return failure(diagnostic("LICENSE_MISSING", "licenses", "License snapshots are incomplete or duplicated."));
  const assetLocks = resolved.slice().sort(byKey); const sortedDeps = dependencyLocks.slice().sort((a, b) => a.dependencyId.localeCompare(b.dependencyId)); const sortedLicenses = licenses.slice().sort((a, b) => a.licenseId.localeCompare(b.licenseId));
  const base = { schemaVersion: GAME_INTEGRATION_SCHEMA_VERSION, projectId: String(project.projectId), ownerId: String(project.ownerId), projectRevisionId: String(project.revision.revisionId), projectHash: project.revision.snapshotHash, assetLocks, dependencyLocks: sortedDeps, licenses: sortedLicenses };
  return success({ ...base, packageHash: await sha256(base) });
}

export function verifyManifest(manifest: PackageManifest, caller: { projectId: string; ownerId: string; revisionId: string }): IntegrationResult<PackageManifest> {
  if (manifest.schemaVersion !== GAME_INTEGRATION_SCHEMA_VERSION) return failure(diagnostic("UNSUPPORTED_SCHEMA", "schemaVersion", "Package schema is unsupported."));
  if (manifest.projectId !== caller.projectId || manifest.ownerId !== caller.ownerId || manifest.projectRevisionId !== caller.revisionId) return failure(diagnostic("CALLER_CLAIM_MISMATCH", "caller", "Manifest caller claims do not match."));
  if (manifest.assetLocks.length === 0 && manifest.dependencyLocks.length === 0) return failure(diagnostic("PARTIAL_PACKAGE", "manifest", "Package has no locked dependencies."));
  return success(manifest);
}

export function createPreviewState(manifest: PackageManifest, caller: { projectId: string; ownerId: string; revisionId: string }): IntegrationResult<PreviewState> { const checked = verifyManifest(manifest, caller); return checked.ok ? success({ manifest, appliedEvents: [], updates: [] }) : failure(...checked.diagnostics); }
export async function applyPreviewUpdate(state: PreviewState, event: PreviewUpdateEvent): Promise<IntegrationResult<PreviewState>> {
  if (state.appliedEvents.includes(event.eventId)) return failure(diagnostic("DUPLICATE_EVENT", "event.eventId", "Preview event was already applied."));
  if (event.projectId !== state.manifest.projectId || event.ownerId !== state.manifest.ownerId) return failure(diagnostic("CALLER_CLAIM_MISMATCH", "event", "Preview event belongs to another caller."));
  if (event.projectRevisionId !== state.manifest.projectRevisionId) return failure(diagnostic("STALE_REVISION", "event.projectRevisionId", "Preview event is stale."));
  const previous = state.updates.at(-1); if (previous && event.sequence !== previous.sequence + 1) return failure(diagnostic("OUT_OF_ORDER_EVENT", "event.sequence", "Preview events must be contiguous and ordered."));
  const lock = state.manifest.assetLocks.find((item) => item.kind === event.kind && item.assetId === event.assetId);
  if (!lock) return failure(diagnostic("MISSING_ASSET", "event.assetId", "Preview event asset is not package-locked."));
  if (lock.mode === "PINNED" || lock.mode === "REVIEW" || lock.mode === "FORKED") return failure(diagnostic("PINNED_LOCKED", "event", "Locked asset modes cannot hot-update."));
  if (event.contentHash !== lock.contentHash && lock.mode !== "LIVE") return failure(diagnostic("HASH_MISMATCH", "event.contentHash", "Event hash does not match locked asset."));
  const nextLock = { ...lock, revisionId: event.revisionId, contentHash: event.contentHash }; const nextBase = { schemaVersion: state.manifest.schemaVersion, projectId: state.manifest.projectId, ownerId: state.manifest.ownerId, projectRevisionId: state.manifest.projectRevisionId, projectHash: state.manifest.projectHash, assetLocks: state.manifest.assetLocks.map((item) => item === lock ? nextLock : item), dependencyLocks: state.manifest.dependencyLocks, licenses: state.manifest.licenses }; const nextManifest = { ...nextBase, packageHash: await sha256(nextBase) };
  return success({ manifest: nextManifest, appliedEvents: [...state.appliedEvents, event.eventId], updates: [...state.updates, event] });
}
export function rollbackPreview(state: PreviewState): PreviewState { if (state.updates.length === 0) return state; const updates = state.updates.slice(0, -1); const ids = state.appliedEvents.slice(0, -1); return { ...state, appliedEvents: ids, updates }; }
export function canonicalIntegrationJson(value: unknown): string { return canonicalJson(value); }
