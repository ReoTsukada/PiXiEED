/**
 * DRAW-160 Draw-to-play reference boundary.
 *
 * The resolver is the canonical Registry seam. Callers provide only the
 * requested mode and identity; revision, hash, permission, and license are
 * returned by the resolver and are validated before Runtime creation.
 */
import {
  createDependencySnapshot,
  createRuntimePreview,
  safeHotReload,
  stopRuntimePreview,
  type CreateRuntimePreviewOptions,
  type HotReloadResult,
  type RuntimePreviewSession,
} from "../../wp160-game-runtime-core.ts";
import {
  asAssetId,
  asAssetRevisionId,
  asPackageId,
  asSha256,
  type AssetId,
  type AssetReferenceMode,
  type AssetRevisionId,
  type ContentHash,
  type DependencySnapshot,
  type GamePreviewId,
  type GameProjectId,
  type PackageId,
  type RuntimeCapabilityProfile,
  type RuntimeDiagnostic,
  type RuntimeVersionContract,
} from "../../wp160-contracts.ts";

export const DRAW160_CONTRACT = Object.freeze({
  modes: ["LIVE", "PINNED", "REVIEW", "FORKED"] as const,
  resolverAuthority: "CANONICAL_REGISTRY",
  editorStateWritable: false,
  runtimeStateWritable: true,
  publishImplicit: false,
  runtimeBundleContainsEditor: false,
  defaultFeatureFlag: false,
});

export type Draw160PreviewMode = AssetReferenceMode;
export type Draw160ResolutionStatus = "RESOLVED" | "REJECTED";

export interface CanonicalPreviewRevision {
  readonly source: "CANONICAL_REGISTRY";
  readonly assetId: string;
  readonly revisionId: string;
  readonly contentHash: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly mode: Draw160PreviewMode;
  readonly licenseStatus: "VALID" | "MISSING" | "EXPIRED" | "REVOKED";
  readonly permission: "GRANTED" | "DENIED";
  readonly reviewStatus?: "PENDING" | "APPROVED" | "REJECTED";
  readonly forkId?: string;
}

export interface Draw160PreviewRequest {
  readonly assetId: string;
  readonly mode: Draw160PreviewMode;
  readonly revisionId?: string;
  readonly forkId?: string;
}

export interface CanonicalPreviewResolver {
  resolveLive(input: { readonly assetId: string }): Promise<CanonicalPreviewRevision | undefined>;
  resolvePinned(input: { readonly assetId: string; readonly revisionId: string }): Promise<CanonicalPreviewRevision | undefined>;
  resolveReview(input: { readonly assetId: string; readonly revisionId: string }): Promise<CanonicalPreviewRevision | undefined>;
  resolveForked(input: { readonly assetId: string; readonly forkId: string }): Promise<CanonicalPreviewRevision | undefined>;
}

export interface Draw160PreviewReference {
  readonly status: "RESOLVED";
  readonly assetId: AssetId;
  readonly revisionId: AssetRevisionId;
  readonly contentHash: ContentHash;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly mode: Draw160PreviewMode;
  readonly forkId?: string;
}

export interface Draw160PreviewRejection {
  readonly status: "REJECTED";
  readonly code:
    | "CALLER_REVISION_OVERRIDE"
    | "REVISION_REQUIRED"
    | "FORK_REQUIRED"
    | "CANONICAL_REVISION_MISSING"
    | "CANONICAL_REVISION_INVALID"
    | "LICENSE_INVALID"
    | "PERMISSION_DENIED"
    | "REVIEW_NOT_APPROVED"
    | "FORK_MISMATCH";
  readonly message: string;
}

export type Draw160Resolution = Draw160PreviewReference | Draw160PreviewRejection;

function reject(code: Draw160PreviewRejection["code"], message: string): Draw160PreviewRejection {
  return { status: "REJECTED", code, message };
}

function isMode(value: string): value is Draw160PreviewMode {
  return DRAW160_CONTRACT.modes.includes(value as Draw160PreviewMode);
}

function validateResolved(request: Draw160PreviewRequest, record: CanonicalPreviewRevision | undefined): Draw160Resolution {
  if (record === undefined) return reject("CANONICAL_REVISION_MISSING", "The canonical Registry did not resolve a preview revision.");
  if (record.source !== "CANONICAL_REGISTRY" || record.assetId !== request.assetId || !isMode(record.mode)) return reject("CANONICAL_REVISION_INVALID", "The preview revision is not a canonical, mode-bound Registry record.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(record.revisionId) || !/^[a-f0-9]{64}$/u.test(record.contentHash)) return reject("CANONICAL_REVISION_INVALID", "The canonical revision identity or hash is invalid.");
  if (!Number.isSafeInteger(record.byteLength) || record.byteLength < 0 || record.mimeType.length === 0) return reject("CANONICAL_REVISION_INVALID", "The canonical preview payload metadata is invalid.");
  if (record.licenseStatus !== "VALID") return reject("LICENSE_INVALID", "The preview license is not valid for Runtime use.");
  if (record.permission !== "GRANTED") return reject("PERMISSION_DENIED", "Preview permission was not granted by the canonical authority.");
  if (record.mode !== request.mode) return reject("CANONICAL_REVISION_INVALID", "The canonical revision mode does not match the requested mode.");
  if (request.mode === "REVIEW" && record.reviewStatus !== "APPROVED") return reject("REVIEW_NOT_APPROVED", "Review mode requires an explicit canonical approval.");
  if (request.mode === "FORKED" && (request.forkId === undefined || record.forkId !== request.forkId)) return reject("FORK_MISMATCH", "The fork identity is not bound to the canonical preview revision.");
  if (request.mode !== "LIVE" && request.revisionId !== undefined && record.revisionId !== request.revisionId) return reject("CANONICAL_REVISION_INVALID", "The canonical Registry returned a different revision than the explicit request.");
  return {
    status: "RESOLVED",
    assetId: asAssetId(record.assetId),
    revisionId: asAssetRevisionId(record.revisionId),
    contentHash: asSha256(record.contentHash),
    byteLength: record.byteLength,
    mimeType: record.mimeType,
    mode: request.mode,
    ...(record.forkId === undefined ? {} : { forkId: record.forkId }),
  };
}

export async function resolveDraw160PreviewReference(request: Draw160PreviewRequest, resolver: CanonicalPreviewResolver): Promise<Draw160Resolution> {
  if (request.mode === "LIVE" && request.revisionId !== undefined) return reject("CALLER_REVISION_OVERRIDE", "LIVE preview revision is resolved by the canonical Registry, not the caller.");
  if ((request.mode === "PINNED" || request.mode === "REVIEW") && request.revisionId === undefined) return reject("REVISION_REQUIRED", `${request.mode} preview requires an explicit revision identity.`);
  if (request.mode === "FORKED" && request.forkId === undefined) return reject("FORK_REQUIRED", "FORKED preview requires an explicit fork identity.");
  const record = request.mode === "LIVE"
    ? await resolver.resolveLive({ assetId: request.assetId })
    : request.mode === "PINNED"
      ? await resolver.resolvePinned({ assetId: request.assetId, revisionId: request.revisionId as string })
      : request.mode === "REVIEW"
        ? await resolver.resolveReview({ assetId: request.assetId, revisionId: request.revisionId as string })
        : await resolver.resolveForked({ assetId: request.assetId, forkId: request.forkId as string });
  return validateResolved(request, record);
}

export interface Draw160PreviewOptions {
  readonly previewId: string;
  readonly projectId: string;
  readonly projectRevisionId: string;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly runtime: RuntimeVersionContract;
  readonly supportedRuntimeVersion: string;
  readonly capabilities: RuntimeCapabilityProfile;
  readonly resolver: CanonicalPreviewResolver;
  readonly request: Draw160PreviewRequest;
  readonly inputMap?: CreateRuntimePreviewOptions["inputMap"];
  readonly renderer?: CreateRuntimePreviewOptions["renderer"];
}

export interface Draw160PreviewController {
  readonly reference: Draw160PreviewReference;
  readonly session: RuntimePreviewSession;
  readonly previousSessions: readonly RuntimePreviewSession[];
  readonly previousReferences: readonly Draw160PreviewReference[];
}

function resolvedReference(value: Draw160Resolution): Draw160PreviewReference {
  if (value.status !== "RESOLVED") throw new Error(`${value.code}: ${value.message}`);
  return value;
}

async function snapshotFor(reference: Draw160PreviewReference, packageId: PackageId, packageVersion: string): Promise<DependencySnapshot> {
  return await createDependencySnapshot(packageId, packageVersion, [{
    assetId: reference.assetId,
    revisionId: reference.revisionId,
    contentHash: reference.contentHash,
    byteLength: reference.byteLength,
    mimeType: reference.mimeType,
    mode: reference.mode,
    required: true,
  }], true);
}

export async function createDraw160Preview(options: Draw160PreviewOptions): Promise<Draw160PreviewController> {
  const reference = resolvedReference(await resolveDraw160PreviewReference(options.request, options.resolver));
  const packageId = asPackageId(options.packageId);
  const dependencies = await snapshotFor(reference, packageId, options.packageVersion);
  const session = await createRuntimePreview({
    previewId: options.previewId,
    projectId: options.projectId,
    projectRevisionId: options.projectRevisionId,
    packageId: options.packageId,
    packageVersion: options.packageVersion,
    runtime: options.runtime,
    supportedRuntimeVersion: options.supportedRuntimeVersion,
    dependencies,
    capabilities: options.capabilities,
    ...(options.inputMap === undefined ? {} : { inputMap: options.inputMap }),
    ...(options.renderer === undefined ? {} : { renderer: options.renderer }),
  });
  return { reference, session, previousSessions: [], previousReferences: [] };
}

export async function reloadDraw160Preview(controller: Draw160PreviewController, options: Pick<Draw160PreviewOptions, "packageId" | "packageVersion" | "resolver"> & { readonly request: Draw160PreviewRequest }): Promise<{ accepted: boolean; controller: Draw160PreviewController; diagnostics: readonly RuntimeDiagnostic[] }> {
  const nextReference = await resolveDraw160PreviewReference(options.request, options.resolver);
  if (nextReference.status !== "RESOLVED") return { accepted: false, controller, diagnostics: [{ code: "HOT_RELOAD_REJECTED", severity: "ERROR", message: nextReference.message, recoverable: true }] };
  if (controller.reference.mode === "PINNED" && (nextReference.revisionId !== controller.reference.revisionId || nextReference.contentHash !== controller.reference.contentHash)) return { accepted: false, controller, diagnostics: [{ code: "HOT_RELOAD_REJECTED", severity: "ERROR", message: "PINNED preview cannot follow a different revision.", recoverable: true }] };
  if (controller.reference.mode === "FORKED" && nextReference.forkId !== controller.reference.forkId) return { accepted: false, controller, diagnostics: [{ code: "HOT_RELOAD_REJECTED", severity: "ERROR", message: "FORKED preview cannot switch branches during hot reload.", recoverable: true }] };
  const packageId = asPackageId(options.packageId);
  const dependencies = await snapshotFor(nextReference, packageId, options.packageVersion);
  const result: HotReloadResult = safeHotReload(controller.session, dependencies);
  if (!result.accepted) return { accepted: false, controller, diagnostics: result.diagnostics };
  return {
    accepted: true,
    controller: {
      reference: nextReference,
      session: result.session,
      previousSessions: [...controller.previousSessions, controller.session],
      previousReferences: [...controller.previousReferences, controller.reference],
    },
    diagnostics: result.diagnostics,
  };
}

export function stopDraw160Preview(controller: Draw160PreviewController): Draw160PreviewController {
  return { ...controller, session: stopRuntimePreview(controller.session) };
}

export function rollbackDraw160Preview(controller: Draw160PreviewController): Draw160PreviewController {
  const previous = controller.previousSessions[controller.previousSessions.length - 1];
  const previousReference = controller.previousReferences[controller.previousReferences.length - 1];
  if (previous === undefined || previousReference === undefined) return controller;
  return {
    reference: previousReference,
    session: previous,
    previousSessions: controller.previousSessions.slice(0, -1),
    previousReferences: controller.previousReferences.slice(0, -1),
  };
}
