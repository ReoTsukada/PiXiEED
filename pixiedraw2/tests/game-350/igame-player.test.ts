import {
  admitIGameExternalBuild,
  createIGamePlayerManifest,
  createIGamePlayerSession,
  igameExternalBuildResourceId,
  isIGameExternalBuildTarget,
  resolveIGamePlayerAccess,
  type IGamePlayerManifest,
} from "../../src/game/game-350/igame-player-contract.ts";
import type { AuthorizationProofV1 } from "../../src/wp160-contracts.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function manifest(sourceAuthority: "REGISTRY" | "LOCAL_PREVIEW"): IGamePlayerManifest {
  return createIGamePlayerManifest({
    productId: "igame-product-1",
    projectId: "game-project-1",
    revisionId: "game-revision-7",
    ownerId: "owner-1",
    tenantId: "tenant-1",
    title: "Fixture RPG",
    runtimeProfileId: "top-down-rpg",
    runtimeVersion: "game-runtime-1",
    sourceAuthority,
  });
}

function proof(input: {
  readonly principalId: string;
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly action: string;
  readonly capability: string;
  readonly grantId: string | null;
}): AuthorizationProofV1 {
  const now = Date.now();
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "registry-authority",
    proofId: `proof-${input.resourceId}`,
    principalId: input.principalId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    action: input.action,
    capability: input.capability,
    tenantId: input.tenantId,
    correlationId: "test-correlation",
    policyVersion: "authorization-policy-v1",
    grantId: input.grantId,
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60 * 60 * 1_000).toISOString(),
  };
}

function externalSource(product: IGamePlayerManifest) {
  return {
    productId: product.productId,
    projectId: product.projectId,
    revisionId: product.revisionId,
    ownerId: product.ownerId,
    tenantId: product.tenantId,
    packageId: "game-package-1",
    packageVersion: "1.0.0",
    sourceSnapshotHash: "a".repeat(64),
  };
}

Deno.test("GAME350-PLAYER-001 keeps the internal Player execution-only", () => {
  const product = manifest("LOCAL_PREVIEW");
  const access = resolveIGamePlayerAccess({
    manifest: product,
    source: "LOCAL_PREVIEW",
  });
  assert(access.decision === "AUTHORIZED", "local Player preview must open");
  const session = createIGamePlayerSession(access);
  assert(
    session.mode === "PLAYER" && session.canWriteProject === false &&
      session.canEditGame === false && session.canEditDraw === false &&
      session.canEditAudio === false && session.assetAuthority === "READ_ONLY",
    "Player session must expose no authoring authority",
  );
  assert(
    product.editAuthority === "NONE" && product.assetAuthority === "READ_ONLY",
    "Player manifest must lock Game and imported asset sources",
  );
});

Deno.test("GAME350-PLAYER-002 requires Registry proof for a sold product", () => {
  const product = manifest("REGISTRY");
  const missing = resolveIGamePlayerAccess({
    manifest: product,
    source: "SERVER_AUTHORITY",
    principalId: "buyer-1",
  });
  assert(
    missing.decision === "DENIED" && missing.code === "SERVER_AUTH_REQUIRED",
    "Registry Player must stop without authentication and entitlement",
  );
  const allowed = resolveIGamePlayerAccess({
    manifest: product,
    source: "SERVER_AUTHORITY",
    principalId: "buyer-1",
    proof: proof({
      principalId: "buyer-1",
      tenantId: product.tenantId,
      resourceType: "igame-product",
      resourceId: product.productId,
      action: "play",
      capability: "game.play",
      grantId: "play-grant-1",
    }),
  });
  assert(
    allowed.decision === "AUTHORIZED" && allowed.proof?.grantId === "play-grant-1",
    "Registry Player must accept only an in-scope server proof",
  );
});

Deno.test("GAME350-EXTERNAL-001 gates Android APK/AAB and other takeout builds", () => {
  const product = manifest("REGISTRY");
  const source = externalSource(product);
  const target = "ANDROID_AAB" as const;
  const validRequest = {
    manifest: product,
    source,
    target,
    principalId: "buyer-1",
    proof: proof({
      principalId: "buyer-1",
      tenantId: product.tenantId,
      resourceType: "igame-external-build",
      resourceId: igameExternalBuildResourceId(product, target),
      action: "build",
      capability: "game.build.external",
      grantId: "build-grant-1",
    }),
    featureEnabled: true,
    killSwitch: false,
  };
  const admitted = admitIGameExternalBuild(validRequest);
  assert(
    admitted.decision === "ADMITTED" &&
      admitted.code === "EXTERNAL_BUILD_ADMITTED" &&
      admitted.grantId === "build-grant-1" &&
      admitted.requiresServerBuild === true &&
      admitted.artifactMaterialized === false,
    "paid external build must be admitted without pretending an AAB exists",
  );
  assert(
    isIGameExternalBuildTarget("ANDROID_APK") &&
      isIGameExternalBuildTarget("ANDROID_AAB") &&
      isIGameExternalBuildTarget("IOS_IPA") &&
      !isIGameExternalBuildTarget("PXD"),
    "PXD must not be treated as an external executable build target",
  );
});

Deno.test("GAME350-EXTERNAL-002 fails closed for missing payment scope, identity drift, and flags", () => {
  const product = manifest("REGISTRY");
  const source = externalSource(product);
  const target = "ANDROID_APK" as const;
  const base = {
    manifest: product,
    source,
    target,
    principalId: "buyer-1",
    proof: proof({
      principalId: "buyer-1",
      tenantId: product.tenantId,
      resourceType: "igame-external-build",
      resourceId: igameExternalBuildResourceId(product, target),
      action: "build",
      capability: "game.build.external",
      grantId: null,
    }),
    featureEnabled: true,
    killSwitch: false,
  } as const;
  const unpaid = admitIGameExternalBuild(base);
  assert(
    unpaid.decision === "DENIED" && unpaid.code === "ENTITLEMENT_REQUIRED",
    "an allow proof without a paid grant must not unlock takeout",
  );
  const drifted = admitIGameExternalBuild({
    ...base,
    source: { ...source, revisionId: "game-revision-8" },
  });
  assert(
    drifted.decision === "DENIED" && drifted.code === "SOURCE_IDENTITY_MISMATCH",
    "revision drift must reject the external build",
  );
  const disabled = admitIGameExternalBuild({ ...base, featureEnabled: false });
  assert(
    disabled.decision === "UNAVAILABLE" && disabled.code === "FEATURE_DISABLED",
    "feature flag OFF must stop external builds safely",
  );
  const stopped = admitIGameExternalBuild({ ...base, killSwitch: true });
  assert(
    stopped.decision === "UNAVAILABLE" && stopped.code === "KILL_SWITCH_ACTIVE",
    "kill switch must stop external builds safely",
  );
  const local = admitIGameExternalBuild({
    ...base,
    manifest: manifest("LOCAL_PREVIEW"),
    source: externalSource(manifest("LOCAL_PREVIEW")),
  });
  assert(
    local.decision === "DENIED" && local.code === "REGISTRY_REQUIRED",
    "a local preview cannot be taken out as an executable",
  );
});
