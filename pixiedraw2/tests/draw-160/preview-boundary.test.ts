import { createProject } from "../../src/draw2-core.ts";
import { createDraw160Preview, reloadDraw160Preview, resolveDraw160PreviewReference, rollbackDraw160Preview, stopDraw160Preview, type CanonicalPreviewResolver, type CanonicalPreviewRevision } from "../../src/draw2/draw-160/preview-boundary.ts";
import { asAssetId, asAssetRevisionId, asSha256, type RuntimeCapabilityProfile } from "../../src/wp160-contracts.ts";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const capabilities: RuntimeCapabilityProfile = { pointer: true, touch: true, keyboard: true, mouse: true, gamepad: false, screenWidth: 1280, screenHeight: 720, devicePixelRatio: 1, audio: false, graphics: "CANVAS2D", webGpuBenefitMeasured: false, reducedMotion: false };
function record(mode: CanonicalPreviewRevision["mode"], revisionId = "rev-a", contentHash = HASH_A, extra: Partial<CanonicalPreviewRevision> = {}): CanonicalPreviewRevision { return { source: "CANONICAL_REGISTRY", assetId: "sprite/player", revisionId, contentHash, byteLength: 32, mimeType: "application/octet-stream", mode, licenseStatus: "VALID", permission: "GRANTED", ...extra }; }
function resolver(records: { live?: CanonicalPreviewRevision; pinned?: CanonicalPreviewRevision; review?: CanonicalPreviewRevision; forked?: CanonicalPreviewRevision }): CanonicalPreviewResolver { return { resolveLive: async () => records.live, resolvePinned: async () => records.pinned, resolveReview: async () => records.review, resolveForked: async () => records.forked }; }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

Deno.test("DRAW-160 resolves all four explicit reference modes through canonical authority", async () => {
  const live = await resolveDraw160PreviewReference({ assetId: "sprite/player", mode: "LIVE" }, resolver({ live: record("LIVE") }));
  const pinned = await resolveDraw160PreviewReference({ assetId: "sprite/player", mode: "PINNED", revisionId: "rev-a" }, resolver({ pinned: record("PINNED") }));
  const review = await resolveDraw160PreviewReference({ assetId: "sprite/player", mode: "REVIEW", revisionId: "rev-a" }, resolver({ review: record("REVIEW", "rev-a", HASH_A, { reviewStatus: "APPROVED" }) }));
  const forked = await resolveDraw160PreviewReference({ assetId: "sprite/player", mode: "FORKED", forkId: "fork-1" }, resolver({ forked: record("FORKED", "fork-1-rev", HASH_B, { forkId: "fork-1" }) }));
  assert(live.status === "RESOLVED" && pinned.status === "RESOLVED" && review.status === "RESOLVED" && forked.status === "RESOLVED", "all explicit modes must resolve from canonical records");
});

Deno.test("DRAW-160 rejects caller revision substitution, unapproved review, license, permission, and fork mismatch", async () => {
  const liveOverride = await resolveDraw160PreviewReference({ assetId: "sprite/player", mode: "LIVE", revisionId: "caller-rev" }, resolver({ live: record("LIVE") }));
  const review = await resolveDraw160PreviewReference({ assetId: "sprite/player", mode: "REVIEW", revisionId: "rev-a" }, resolver({ review: record("REVIEW", "rev-a", HASH_A, { reviewStatus: "PENDING" }) }));
  const license = await resolveDraw160PreviewReference({ assetId: "sprite/player", mode: "LIVE" }, resolver({ live: record("LIVE", "rev-a", HASH_A, { licenseStatus: "REVOKED" }) }));
  const permission = await resolveDraw160PreviewReference({ assetId: "sprite/player", mode: "LIVE" }, resolver({ live: record("LIVE", "rev-a", HASH_A, { permission: "DENIED" }) }));
  const fork = await resolveDraw160PreviewReference({ assetId: "sprite/player", mode: "FORKED", forkId: "fork-1" }, resolver({ forked: record("FORKED", "rev-a", HASH_A, { forkId: "fork-2" }) }));
  assert(liveOverride.status === "REJECTED" && liveOverride.code === "CALLER_REVISION_OVERRIDE", "LIVE caller revision must be rejected");
  assert(review.status === "REJECTED" && review.code === "REVIEW_NOT_APPROVED", "unapproved REVIEW must be rejected");
  assert(license.status === "REJECTED" && permission.status === "REJECTED" && fork.status === "REJECTED", "license, permission, and fork mismatch must fail closed");
});

Deno.test("DRAW-160 preserves Runtime world state on LIVE reload and rejects PINNED mutation", async () => {
  const baseOptions = { previewId: "preview-1", projectId: "project-1", projectRevisionId: "project-rev-1", packageId: "package-1", packageVersion: "1.0.0", runtime: { runtimeId: "pixie-runtime", runtimeVersion: "0.1.0", supportedManifestVersion: 1 }, supportedRuntimeVersion: "0.1.0", capabilities, resolver: resolver({ live: record("LIVE") }), request: { assetId: "sprite/player", mode: "LIVE" as const } };
  let controller = await createDraw160Preview(baseOptions);
  const previousWorld = controller.session.world;
  const reloaded = await reloadDraw160Preview(controller, { packageId: "package-1", packageVersion: "1.0.0", resolver: resolver({ live: record("LIVE", "rev-b", HASH_B) }), request: { assetId: "sprite/player", mode: "LIVE" } });
  assert(reloaded.accepted && reloaded.controller.session.world.tick === previousWorld.tick, "LIVE reload must preserve Runtime world state");
  controller = await createDraw160Preview({ ...baseOptions, resolver: resolver({ pinned: record("PINNED") }), request: { assetId: "sprite/player", mode: "PINNED", revisionId: "rev-a" } });
  const pinnedReload = await reloadDraw160Preview(controller, { packageId: "package-1", packageVersion: "1.0.0", resolver: resolver({ pinned: record("PINNED", "rev-b", HASH_B) }), request: { assetId: "sprite/player", mode: "PINNED", revisionId: "rev-b" } });
  assert(!pinnedReload.accepted && pinnedReload.diagnostics.some((item) => item.code === "HOT_RELOAD_REJECTED"), "PINNED mutation must be rejected");
});

Deno.test("DRAW-160 rollback restores the matching canonical reference and Runtime session", async () => {
  const canonicalResolver = resolver({ live: record("LIVE") });
  const first = await createDraw160Preview({ previewId: "preview-rollback", projectId: "project-rollback", projectRevisionId: "project-rev-rollback", packageId: "package-rollback", packageVersion: "1.0.0", runtime: { runtimeId: "pixie-runtime", runtimeVersion: "0.1.0", supportedManifestVersion: 1 }, supportedRuntimeVersion: "0.1.0", capabilities, resolver: canonicalResolver, request: { assetId: "sprite/player", mode: "LIVE" } });
  const reloaded = await reloadDraw160Preview(first, { packageId: "package-rollback", packageVersion: "1.0.0", resolver: resolver({ live: record("LIVE", "rev-b", HASH_B) }), request: { assetId: "sprite/player", mode: "LIVE" } });
  assert(reloaded.accepted, "LIVE reload must be accepted before rollback");
  const rolledBack = rollbackDraw160Preview(reloaded.controller);
  assert(rolledBack.reference.revisionId === first.reference.revisionId, "rollback must restore the canonical reference revision");
  assert(rolledBack.reference.contentHash === first.reference.contentHash, "rollback must restore the canonical reference hash");
  assert(rolledBack.session.previewId === first.session.previewId, "rollback must restore the previous Runtime session");
});

Deno.test("DRAW-160 stop preserves Project/Core ownership and Runtime is not editor UI", async () => {
  const controller = await createDraw160Preview({ previewId: "preview-2", projectId: "project-2", projectRevisionId: "project-rev-2", packageId: "package-2", packageVersion: "1.0.0", runtime: { runtimeId: "pixie-runtime", runtimeVersion: "0.1.0", supportedManifestVersion: 1 }, supportedRuntimeVersion: "0.1.0", capabilities, resolver: resolver({ live: record("LIVE") }), request: { assetId: "sprite/player", mode: "LIVE" } });
  const stopped = stopDraw160Preview(controller);
  assert(!stopped.session.running && stopped.session.projectId === controller.session.projectId, "stopping preview must not mutate Project identity");
  const runtimeSource = await Deno.readTextFile(new URL("../../src/wp160-runtime-bundle-entry.ts", import.meta.url));
  for (const forbidden of ["draw2-entry", "draw2-export", "draw2-legacy-compat", "document", "window", "indexedDB", "supabase"]) assert(!runtimeSource.includes(forbidden), `Runtime bundle must not import ${forbidden}`);
});

Deno.test("DRAW-160 existing Core package remains available without changing project creation", async () => {
  const project = createProject({ projectId: "draw-160-core-fixture", width: 2, height: 2 });
  assert(project.projectId === "draw-160-core-fixture" && asAssetId(project.activeAssetId) === project.activeAssetId, "Draw2 Core identity must remain canonical");
  assert(asAssetRevisionId("rev-a") === "rev-a" && asSha256(HASH_A) === HASH_A, "typed Runtime identities must remain stable");
});
