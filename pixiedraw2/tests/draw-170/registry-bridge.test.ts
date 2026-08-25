import {
  canConsumeRegisteredAsset,
  calculateAssetDefinitionDigest,
  createAssetRegistryBridge,
  createTestOnlyRegistryBridgeProvider,
  type RegisteredAssetIdentity,
} from "../../src/draw2-asset-registry-bridge.ts";
import {
  createAssetDefinitionDraft,
  validateAssetDefinitionDraft,
  type ValidatedAssetDefinition,
} from "../../src/draw2-creator-workspace.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function fixture() {
  const draft = createAssetDefinitionDraft({
    sourceProjectId: "project-draw2",
    sourceCanvasId: "canvas-main",
    sourceKind: "SELECTED_LAYERS",
    sourceLayerIds: ["layer-body", "layer-hair"],
    frameStart: 1,
    frameEnd: 4,
    layerSelection: { kind: "SELECTED_LAYERS", layerIds: ["layer-body", "layer-hair"] },
    frameSelection: { kind: "EXPLICIT", frameIds: ["frame-1", "frame-2", "frame-3", "frame-4"] },
    region: { kind: "GRID", cellSize: 16, x: 0, y: 0, columns: 2, rows: 3 },
    animationMapping: [{ name: "IDLE", frameIds: ["frame-1", "frame-2"], loopMode: "LOOP", fps: 12 }],
    assetKind: "CHARACTER",
    pivot: "FEET",
    metadata: { name: "Hero", tags: ["player"] },
  });
  assert(draft.ok, "Asset draft fixture creation failed.");
  const validated = validateAssetDefinitionDraft(draft.value);
  assert(validated.ok, "Asset definition fixture validation failed.");
  const digest = await calculateAssetDefinitionDigest(validated.value);
  assert(digest.ok, "Asset definition digest calculation failed.");
  const provider = createTestOnlyRegistryBridgeProvider([{
    projectId: "project-draw2",
    sourcePxdId: "project-draw2.pxd",
    definitionId: "hero",
    ownerId: "owner-1",
    sourceRevisionId: "revision-1",
    definitionDigest: digest.value,
    assetId: "asset-hero",
  }]);
  return {
    definition: validated.value,
    provider,
    bridge: createAssetRegistryBridge(provider),
    context: {
      projectId: "project-draw2",
      sourcePxdId: "project-draw2.pxd",
      definitionId: "hero",
      ownerId: "owner-1",
      referenceMode: "LIVE" as const,
    },
    digest: digest.value,
  };
}

async function registerLive() {
  const value = await fixture();
  const result = await value.bridge.register(value.definition, value.context);
  assert(result.ok, "LIVE registration failed.");
  return { ...value, identity: result.value };
}

Deno.test("RB-01 registers a validated definition through the TEST_ONLY provider", async () => {
  const { identity } = await registerLive();
  assert(identity.status === "REGISTERED_ASSET", "Registration did not promote to REGISTERED_ASSET.");
  assert(identity.assetId === "asset-hero", "Provider-assigned identity was not returned.");
});

Deno.test("RB-02 rejects LOCAL_DRAFT promotion", async () => {
  const value = await fixture();
  const result = await value.bridge.register({ ...value.definition, persistence: "LOCAL_DRAFT" }, value.context);
  assert(!result.ok && result.code === "LOCAL_DRAFT_NOT_REGISTERABLE", "LOCAL_DRAFT crossed the Registry boundary.");
});

Deno.test("RB-03 rejects malformed definitions and embedded payloads", async () => {
  const value = await fixture();
  const malformed = await value.bridge.register({ ...value.definition, sourceLayerIds: [] }, value.context);
  assert(!malformed.ok && malformed.code === "INVALID_ASSET_DEFINITION", "Malformed definition was accepted.");
  const payload = await value.bridge.register({ ...value.definition, metadata: { ...value.definition.metadata, pixels: [1, 2] } }, value.context);
  assert(!payload.ok && payload.code === "INVALID_ASSET_DEFINITION", "Embedded pixel payload was accepted.");
});

Deno.test("RB-04 rejects owner mismatch", async () => {
  const value = await fixture();
  const result = await value.bridge.register(value.definition, { ...value.context, ownerId: "owner-other" });
  assert(!result.ok && result.code === "PROVIDER_REJECTED", "Owner mismatch was not rejected by the provider boundary.");
});

Deno.test("RB-05 rejects Project mismatch", async () => {
  const value = await fixture();
  const result = await value.bridge.register(value.definition, { ...value.context, projectId: "project-other" });
  assert(!result.ok && result.code === "INVALID_REGISTRATION_CONTEXT", "Project mismatch was not rejected.");
});

Deno.test("RB-06 keeps the Asset ID stable on idempotent registration", async () => {
  const value = await fixture();
  const first = await value.bridge.register(value.definition, value.context);
  const second = await value.bridge.register(value.definition, value.context);
  assert(first.ok && second.ok, "Idempotent registration did not succeed.");
  assert(first.value.assetId === second.value.assetId, "Asset ID changed on repeated registration.");
});

Deno.test("RB-07 keeps PXD and definition references without pixel duplication", async () => {
  const { identity, definition } = await registerLive();
  const serialized = JSON.stringify(identity);
  assert(identity.sourcePxdId === "project-draw2.pxd" && identity.definitionId === "hero", "PXD/definition references are missing.");
  assert(!/pixel|raster|blob|base64|dataUrl|bytes/i.test(serialized), "Registry identity contains payload data.");
  assert(!Object.prototype.hasOwnProperty.call(identity, "sourceCanvasId"), "Registry identity copied editor state.");
  assert(definition.sourceCanvasId === "canvas-main", "The PXD source definition was not retained as the source of truth.");
});

Deno.test("RB-08 LIVE resolves a new source revision without changing Asset ID", async () => {
  const value = await registerLive();
  value.provider.updateSource("project-draw2.pxd", "hero", { sourceRevisionId: "revision-2" });
  const result = await value.bridge.resolve(value.identity.assetId, value.context);
  assert(result.ok, "Workspace registration failed.");
  assert(result.value.assetId === value.identity.assetId, "LIVE changed the stable Asset ID.");
  assert(result.value.sourceRevisionId === "revision-2", "LIVE did not resolve the current source revision.");
});

Deno.test("RB-09 PINNED resolves the exact source revision only", async () => {
  const value = await fixture();
  const pinnedDefinition = { ...value.definition, protection: { ...value.definition.protection, referencePolicy: "PINNED" as const } };
  const pinnedDigest = await calculateAssetDefinitionDigest(pinnedDefinition);
  assert(pinnedDigest.ok, "PINNED definition digest calculation failed.");
  value.provider.updateSource("project-draw2.pxd", "hero", { definitionDigest: pinnedDigest.value });
  const pinned = await value.bridge.register(pinnedDefinition, { ...value.context, referenceMode: "PINNED", sourceRevisionId: "revision-1" });
  assert(pinned.ok, "PINNED registration failed.");
  const result = await value.bridge.resolve(pinned.value.assetId, { ...value.context, referenceMode: "PINNED", sourceRevisionId: "revision-1", definitionDigest: pinnedDigest.value });
  assert(result.ok && result.value.sourceRevisionId === "revision-1", "PINNED did not retain the exact revision.");
  value.provider.updateSource("project-draw2.pxd", "hero", { sourceRevisionId: "revision-2" });
  const stale = await value.bridge.resolve(pinned.value.assetId, { ...value.context, referenceMode: "PINNED", sourceRevisionId: "revision-1", definitionDigest: pinnedDigest.value });
  assert(!stale.ok && stale.code === "PROVIDER_REJECTED", "PINNED silently upgraded after the source changed.");
});

Deno.test("RB-10 returns typed unresolved failure when the source disappears", async () => {
  const value = await registerLive();
  value.provider.removeSource("project-draw2.pxd", "hero");
  const result = await value.bridge.resolve(value.identity.assetId, value.context);
  assert(!result.ok && result.code === "UNRESOLVED_SOURCE_DEFINITION", "Missing source did not fail closed with a typed diagnostic.");
});

Deno.test("RB-11 resolves a registered identity only with matching context", async () => {
  const value = await registerLive();
  const result = await value.bridge.resolve(value.identity.assetId, { ...value.context, definitionId: "other-definition" });
  assert(!result.ok && result.code === "PROVIDER_REJECTED", "Cross-definition resolve was accepted.");
});

Deno.test("RB-12 allows only REGISTERED_ASSET identities to cross consumers", async () => {
  const value = await registerLive();
  assert(canConsumeRegisteredAsset(value.identity, "GAME"), "Registered identity was not eligible for Game.");
  assert(canConsumeRegisteredAsset(value.identity, "AUDIO"), "Registered identity was not eligible for Audio.");
  assert(!canConsumeRegisteredAsset(value.definition, "GAME"), "Validated definition crossed into Game.");
  assert(!canConsumeRegisteredAsset({ status: "REGISTERED_ASSET", assetId: "asset-fake" }, "GAME"), "Caller-created fake identity crossed the consumer boundary.");
});

Deno.test("RB-13 fails closed when the provider fails", async () => {
  const value = await fixture();
  value.provider.setFailureMode("REGISTER");
  const register = await value.bridge.register(value.definition, value.context);
  assert(!register.ok && register.code === "PROVIDER_REJECTED", "Provider failure was treated as successful registration.");
  value.provider.setFailureMode("NONE");
  const registered = await value.bridge.register(value.definition, value.context);
  assert(registered.ok, "Provider recovery registration failed.");
  value.provider.setFailureMode("RESOLVE");
  const resolve = await value.bridge.resolve(registered.value.assetId, value.context);
  assert(!resolve.ok && resolve.code === "PROVIDER_REJECTED", "Provider resolve failure was treated as successful resolution.");
});

Deno.test("RB-14 rejects conflicting Provider identity responses", async () => {
  const value = await fixture();
  const maliciousProvider = {
    register: async () => ({ ok: true as const, identity: { schemaVersion: 1, status: "REGISTERED_ASSET", assetId: "asset-other", projectId: "project-other", sourcePxdId: "other.pxd", definitionId: "other", ownerId: "owner-other", sourceRevisionId: "revision-1", definitionDigest: value.digest, referenceMode: "LIVE" as const } }),
    resolve: async () => ({ ok: false as const, code: "UNKNOWN_ASSET", message: "unknown" }),
  };
  const result = await createAssetRegistryBridge(maliciousProvider).register(value.definition, value.context);
  assert(!result.ok && result.code === "IDENTITY_CONFLICT", "Conflicting Provider identity was accepted.");
});

Deno.test("RB-15 registration does not recreate the Creator Workspace", async () => {
  const value = await fixture();
  const workspace = { projectId: value.definition.sourceProjectId, canvasId: value.definition.sourceCanvasId, frameCount: 4, layerCount: 2 };
  const snapshot = JSON.stringify(workspace);
  const result = await value.bridge.register(value.definition, value.context);
  assert(result.ok, "Pinned-revision fixture registration failed.");
  assert(JSON.stringify(workspace) === snapshot, "Registry registration recreated or mutated Workspace state.");
});

Deno.test("RB-16 rejects a PINNED definition without an exact revision", async () => {
  const value = await fixture();
  const pinnedDefinition: ValidatedAssetDefinition = { ...value.definition, protection: { ...value.definition.protection, referencePolicy: "PINNED" } };
  const result = await value.bridge.register(pinnedDefinition, { ...value.context, referenceMode: "PINNED" });
  assert(!result.ok && result.code === "PINNED_REVISION_REQUIRED", "PINNED registration without revision was accepted.");
});

Deno.test("RB-17 keeps the registered identity reference-only", async () => {
  const value = await registerLive();
  const identity: RegisteredAssetIdentity = value.identity;
  assert(Object.keys(identity).every((key) => !/pixel|raster|blob|base64|dataUrl|bytes|canvas/i.test(key)), "Registered identity contains editor or payload fields.");
});

Deno.test("RB-18 keeps the Bridge host-neutral and unloaded", async () => {
  const source = await Deno.readTextFile(new URL("../../src/draw2-asset-registry-bridge.ts", import.meta.url));
  for (const token of ["document", "window", "fetch(", "WebSocket", "indexedDB", "localStorage", "supabase", "Math.random", "Date.now"]) {
    assert(!source.includes(token), `Registry Bridge must not depend on ${token}.`);
  }
});

Deno.test("RB-19 rejects silent reference-mode changes for a stable Asset ID", async () => {
  const value = await registerLive();
  const pinnedDefinition = { ...value.definition, protection: { ...value.definition.protection, referencePolicy: "PINNED" as const } };
  const pinnedDigest = await calculateAssetDefinitionDigest(pinnedDefinition);
  assert(pinnedDigest.ok, "PINNED mode digest calculation failed.");
  value.provider.updateSource("project-draw2.pxd", "hero", { definitionDigest: pinnedDigest.value });
  const result = await value.bridge.register(pinnedDefinition, { ...value.context, referenceMode: "PINNED", sourceRevisionId: "revision-1" });
  assert(!result.ok && result.code === "PROVIDER_REJECTED", "Reference mode changed without an explicit policy operation.");
});
