import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofV1,
} from "../../src/wp160-contracts.ts";
import {
  createSite400ServerComposition,
  type Site400RegisteredAssetRecordV1,
  type Site400ResolveRequestV1,
} from "../../src/platform/site-400/server-authorized-registry-provider.ts";
import { createSite400LazyEntry } from "../../src/platform/site-400/lazy-entry.ts";
import { createFp003AaServerAuthFixture } from "../fixtures/fp003aa-server-auth-fixture.ts";
import { InMemoryAuthoritativeRegistry } from "../fixtures/in-memory-authoritative-registry.ts";

const TENANT_ID = "tenant:site400";
const PRINCIPAL_ID = "principal:site400-owner";
const PROJECT_ID = "project:site400";
const SESSION = "session:site400-owner";
const ASSET_ID = "asset:hero";
const SOURCE_PXD_ID = "pxd:hero";
const DEFINITION_ID = "definition:hero";
const REVISION_ID = "revision:hero:v1";
const DIGEST = "a".repeat(64);

const tenantContext = {
  schemaVersion: "SERVER_TENANT_CONTEXT_V1" as const,
  tenantId: TENANT_ID,
  principalId: PRINCIPAL_ID,
  source: "SERVER_REGISTRY" as const,
};

function proof(): AuthorizationProofV1 {
  const issuedAt = new Date(Date.now() - 30_000).toISOString();
  const expiresAt = new Date(Date.now() + 4 * 60_000).toISOString();
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "site400-test-auth-adapter",
    proofId: `proof:${SESSION}`,
    principalId: PRINCIPAL_ID,
    resourceType: "SERVER_AUTHENTICATED_PRINCIPAL",
    resourceId: `auth-session:${SESSION}`,
    action: "server.authority.context.create",
    capability: "server.authority.context.create",
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: `grant:${SESSION}`,
    tenantId: null,
    correlationId: `auth-correlation:${SESSION}`,
    issuedAt,
    expiresAt,
  };
}

function identity(
  overrides: Partial<{
    assetId: string;
    projectId: string;
    ownerId: string;
    referenceMode: "LIVE" | "PINNED" | "REVIEW" | "FORKED";
    sourceRevisionId: string;
    definitionDigest: string;
  }> = {},
) {
  return {
    schemaVersion: 1 as const,
    status: "REGISTERED_ASSET" as const,
    assetId: overrides.assetId ?? ASSET_ID,
    projectId: overrides.projectId ?? PROJECT_ID,
    sourcePxdId: SOURCE_PXD_ID,
    definitionId: DEFINITION_ID,
    ownerId: overrides.ownerId ?? PRINCIPAL_ID,
    sourceRevisionId: overrides.sourceRevisionId ?? REVISION_ID,
    definitionDigest: overrides.definitionDigest ?? DIGEST,
    referenceMode: overrides.referenceMode ?? ("LIVE" as const),
  };
}

function request(
  overrides: Partial<Site400ResolveRequestV1> = {},
): Site400ResolveRequestV1 {
  return {
    requestId: overrides.requestId ?? "http:site400:request:1",
    sessionReference: overrides.sessionReference ?? SESSION,
    correlationId: overrides.correlationId ?? "correlation:site400:1",
    assetId: overrides.assetId ?? ASSET_ID,
    projectId: overrides.projectId ?? PROJECT_ID,
    ...(overrides.requestedTenantId === undefined
      ? {}
      : { requestedTenantId: overrides.requestedTenantId }),
  };
}

async function setup(input: {
  readonly record?: Site400RegisteredAssetRecordV1 | Record<string, unknown>;
  readonly assetId?: string;
  readonly referenceMode?: "LIVE" | "PINNED" | "REVIEW" | "FORKED";
} = {}) {
  const registry = new InMemoryAuthoritativeRegistry();
  const assetId = input.assetId ?? ASSET_ID;
  const record = input.record ?? {
    schemaVersion: 1 as const,
    tenantId: TENANT_ID,
    identity: input.referenceMode === undefined
      ? identity({ assetId })
      : identity({ assetId, referenceMode: input.referenceMode }),
  };
  await registry.put(
    tenantContext,
    "REGISTERED_ASSET",
    assetId,
    "registered-asset:v1",
    record,
  );
  const fixture = createFp003AaServerAuthFixture({ registry });
  fixture.authAdapter.register({
    sessionReference: SESSION,
    principalId: PRINCIPAL_ID,
    tenantIds: [TENANT_ID],
  });
  const composition = createSite400ServerComposition({
    registry,
    authProvider: fixture.authProvider,
    tenantResolver: fixture.tenantResolver,
  });
  return { registry, fixture, composition, assetId };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertDenied(result: { readonly ok: boolean }, label: string): void {
  assert(!result.ok, `${label} must be denied`);
}

Deno.test("SITE400-01 authorized REGISTERED_ASSET resolves", async () => {
  const { composition } = await setup();
  const result = await composition.resolveRegisteredAsset(request());
  assert(result.ok, "authorized asset must resolve");
  assert(result.value.identity.assetId === ASSET_ID, "asset identity mismatch");
  assert(result.value.resolvedBy === "SITE400_SERVER_COMPOSITION_ROOT", "server source missing");
});

Deno.test("SITE400-02 LOCAL_DRAFT is not resolvable", async () => {
  const draft = await setup({
    record: { persistence: "LOCAL_DRAFT", assetId: ASSET_ID },
  });
  assertDenied(await draft.composition.resolveRegisteredAsset(request()), "LOCAL_DRAFT");
});

Deno.test("SITE400-03 VALIDATED_DEFINITION without registration is not resolvable", async () => {
  const validated = await setup({
    record: { persistence: "VALIDATED_DEFINITION", assetId: ASSET_ID },
  });
  assertDenied(await validated.composition.resolveRegisteredAsset(request()), "VALIDATED_DEFINITION");
});

Deno.test("SITE400-05 wrong Project is denied", async () => {
  const { composition } = await setup();
  assertDenied(
    await composition.resolveRegisteredAsset(request({ projectId: "project:other" })),
    "wrong project",
  );
});

Deno.test("SITE400-04 wrong owner is denied", async () => {
  const { composition } = await setup({ record: {
    schemaVersion: 1,
    tenantId: TENANT_ID,
    identity: identity({ ownerId: "principal:other" }),
  } });
  assertDenied(await composition.resolveRegisteredAsset(request()), "wrong owner");
});

Deno.test("SITE400-06 wrong Tenant is denied", async () => {
  const { composition } = await setup();
  assertDenied(
    await composition.resolveRegisteredAsset(request({ requestedTenantId: "tenant:other" })),
    "wrong tenant",
  );
});

Deno.test("SITE400-07 unauthenticated request is denied", async () => {
  const { composition } = await setup();
  assertDenied(
    await composition.resolveRegisteredAsset(request({ sessionReference: "session:unknown" })),
    "unauthenticated",
  );
});

Deno.test("SITE400-08 unknown Asset is denied", async () => {
  const { composition } = await setup();
  assertDenied(
    await composition.resolveRegisteredAsset(request({ assetId: "asset:unknown" })),
    "unknown asset",
  );
});

Deno.test("SITE400-09 unavailable Registry Provider fails closed", async () => {
  const { registry, fixture } = await setup();
  const unavailableRegistry = {
    membershipRegistry: registry.membershipRegistry,
    async getCurrent() {
      throw new Error("provider unavailable");
    },
  };
  const composition = createSite400ServerComposition({
    registry: unavailableRegistry,
    authProvider: fixture.authProvider,
    tenantResolver: fixture.tenantResolver,
  });
  const result = await composition.resolveRegisteredAsset(request());
  assertDenied(result, "provider unavailable");
});

Deno.test("SITE400-10 forged Registered state and caller authority are denied", async () => {
  const { composition } = await setup({ record: {
    schemaVersion: 1,
    tenantId: TENANT_ID,
    identity: { ...identity(), trusted: true },
  } });
  assertDenied(await composition.resolveRegisteredAsset(request()), "forged state");
  const forgedRequest = {
    ...request(),
    ownerId: PRINCIPAL_ID,
    status: "REGISTERED_ASSET",
    trusted: true,
    allowed: true,
  } as unknown as Site400ResolveRequestV1;
  assertDenied(await composition.resolveRegisteredAsset(forgedRequest), "caller authority injection");
});

Deno.test("SITE400-11 LIVE reference mode is preserved", async () => {
  const { composition } = await setup({ referenceMode: "LIVE" });
  const result = await composition.resolveRegisteredAsset(request());
  assert(result.ok && result.value.identity.referenceMode === "LIVE", "LIVE mode changed");
});

Deno.test("SITE400-12 PINNED reference mode is preserved", async () => {
  const { composition } = await setup({ referenceMode: "PINNED" });
  const result = await composition.resolveRegisteredAsset(request());
  assert(result.ok && result.value.identity.referenceMode === "PINNED", "PINNED mode changed");
  if (result.ok) assert(result.value.identity.sourceRevisionId === REVISION_ID, "PINNED revision changed");
});

Deno.test("SITE400-13 lazy Entry loads once", async () => {
  let loadCount = 0;
  const entry = createSite400LazyEntry(async () => {
    loadCount += 1;
    return {
      moduleId: "SITE-400",
      status: "ISOLATED_READY" as const,
      connectedRoutes: [] as const,
      heavyModules: [] as const,
    };
  });
  const [first, second] = await Promise.all([entry.load(), entry.load()]);
  assert(first === second, "lazy entry must be memoized");
  assert(loadCount === 1, "lazy entry loaded more than once");
  assert(first.connectedRoutes.length === 0 && first.heavyModules.length === 0, "duplicate heavy entry exists");
});

Deno.test("SITE400-15 logout or Membership revocation invalidates the next resolve", async () => {
  const { composition, fixture } = await setup();
  const first = await composition.resolveRegisteredAsset(request());
  assert(first.ok, "pre-revocation resolve must pass");
  fixture.tenantResolver.setMembershipStatus(
    PRINCIPAL_ID,
    `membership:${PRINCIPAL_ID}:${TENANT_ID}`,
    "REVOKED",
  );
  assertDenied(await composition.resolveRegisteredAsset(request({ requestId: "http:site400:request:2" })), "revoked membership");
});

Deno.test("SITE400-14 Creator Workspace, Canvas, and Timeline are not duplicated", async () => {
  const source = await Deno.readTextFile(
    new URL("../../src/platform/site-400/entry.ts", import.meta.url),
  );
  assert(!source.includes("Canvas"), "SITE-400 entry must not create a Canvas");
  assert(!source.includes("Timeline"), "SITE-400 entry must not create a Timeline");
  assert(!source.includes("Creator Workspace"), "SITE-400 entry must not create a duplicate Workspace");
});

Deno.test("SITE400-16 Provider has no render-loop or Runtime-tick resolution path", async () => {
  const source = await Deno.readTextFile(
    new URL("../../src/platform/site-400/server-authorized-registry-provider.ts", import.meta.url),
  );
  for (const forbidden of ["window", "document", "fetch(", "requestAnimationFrame", "setInterval", "renderTimeline", "Runtime tick"]) {
    assert(!source.includes(forbidden), `forbidden hot-path dependency: ${forbidden}`);
  }
});
