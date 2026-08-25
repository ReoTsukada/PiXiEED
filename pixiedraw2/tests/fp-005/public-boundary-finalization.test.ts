import { strict as assert } from "node:assert";
import { deflateRawSync } from "node:zlib";
import { FP005_ERROR_CODES } from "../../src/fp-005/error-codes.ts";
import { FP005_SCHEMA_VERSION } from "../../src/fp-005/contracts.ts";
import { validateFp005Boundary } from "../../src/fp-005/index.ts";
import { redactPrivacyValue } from "../../src/fp-005/redaction.ts";
import { createFp005ServerPolicyComposition } from "../../src/fp-005/server-policy-composition.ts";
import { recheckStorageScope } from "../../src/fp-005/storage-scope.ts";
import {
  bindCanonicalTenantMembership,
  createServerAuthorityRequestContext,
  createServerAuthPrincipalProvider,
  type CanonicalTenantMembershipRegistryV1,
} from "../../src/server/internal/authenticated-context.ts";
import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofExpectation,
  type AuthorizationProofV1,
} from "../../src/wp160-contracts.ts";

const tenantId = "tenant-public";
const resourceType = "project";
const resourceId = "project-public";
const principalId = "principal-public";
const hash = "a".repeat(64);
const issuedAt = new Date(Date.now() - 30_000).toISOString();
const expiresAt = new Date(Date.now() + 240_000).toISOString();

function proof(overrides: Partial<AuthorizationProofV1> = {}): AuthorizationProofV1 {
  return { schemaVersion: 1, proofType: "AUTHORIZATION_PROOF", source: "server", decision: "allow", authorityId: "server-authority", proofId: "server-proof", principalId, resourceType, resourceId, action: "storage.write", capability: "storage:write", tenantId, correlationId: "public-correlation", policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION, grantId: "public-grant", issuedAt, expiresAt, ...overrides };
}

async function policy() {
  const provider = createServerAuthPrincipalProvider({
    async verify() {
      return { principalId, authSessionId: "session-public", assurance: "SESSION_VERIFIED" as const, tenantMemberships: [{ membershipId: "membership-public", principalId, tenantId, membershipRevision: "membership-public:v1", status: "ACTIVE" as const }], authorizationProof: proof({ resourceType: "SERVER_AUTHENTICATED_PRINCIPAL", resourceId: "session-public", action: "server.authority.context.create", capability: "server.authority.context.create", tenantId: null }), issuedAt, expiresAt, correlationId: "auth-correlation" };
    },
  });
  const principal = await provider.authenticate({ requestId: "request-public", resourceType, resourceId, sessionReference: "session-ref", correlationId: "public-correlation" });
  assert(principal !== null);
  const membership = bindCanonicalTenantMembership({ principal, membership: principal.tenantMemberships[0]! });
  const authorityContext = createServerAuthorityRequestContext({ principal, membership, request: { requestId: "request-public", resourceType, resourceId, correlationId: "public-correlation" } });
  const membershipRegistry: CanonicalTenantMembershipRegistryV1 = { async getCurrent() { return membership; } };
  const composition = createFp005ServerPolicyComposition({
    authorityContext,
    membershipRegistry,
    authorizationProofResolver: ({ expected }: { readonly expected: AuthorizationProofExpectation }) => proof({ authorityId: "resolved-server", proofId: "resolved-proof", principalId: expected.principalId ?? null, resourceType: expected.resourceType ?? resourceType, resourceId: expected.resourceId ?? resourceId, action: expected.action ?? "storage.write", capability: expected.capability ?? "storage:write", tenantId: expected.tenantId ?? tenantId }),
    resolveQuota: (request) => ({ schemaVersion: FP005_SCHEMA_VERSION, tenantId: request.tenantId, resourceType: request.resourceType, resourceId: request.resourceId, quotaBytes: 100, currentUsageBytes: 4, quotaRevision: "quota-r1" }),
    resolveRetention: (request) => ({ schemaVersion: FP005_SCHEMA_VERSION, tenantId: request.tenantId, ...(request.resourceType === undefined ? {} : { resourceType: request.resourceType }), resourceId: request.resourceId, category: request.category, currentAssetRevision: "asset-r1", activeEntitlement: false, activeLicense: false, licenseStatus: "NONE", legalHold: false, dependencyCount: 0, referenceCount: 0 }),
  });
  return { composition };
}

function u16(value: number): number[] { return [value & 0xff, (value >>> 8) & 0xff]; }
function u32(value: number): number[] { return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]; }
function crc32(value: Uint8Array): number { let crc = 0xffffffff; for (const byte of value) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function zipDeflate(path: string, data: Uint8Array, compressed = new Uint8Array(deflateRawSync(data))): Uint8Array {
  const name = new TextEncoder().encode(path); const checksum = crc32(data);
  const local = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(8), ...u16(0), ...u16(0), ...u32(checksum), ...u32(compressed.byteLength), ...u32(data.byteLength), ...u16(name.byteLength), ...u16(0), ...name, ...compressed];
  const central = [...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(8), ...u16(0), ...u16(0), ...u32(checksum), ...u32(compressed.byteLength), ...u32(data.byteLength), ...u16(name.byteLength), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...name];
  return Uint8Array.from([...local, ...central, ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(1), ...u16(1), ...u32(central.length), ...u32(local.length), ...u16(0)]);
}
function png(): Uint8Array { return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0]); }
function storageRequest() {
  const locator = { placement: "OPFS", path: "tenant-public/project-public/blob.bin", contentHash: hash, byteLength: 4, tenantId, resourceType, resourceId };
  return { kind: "MATERIALIZE" as const, schemaVersion: FP005_SCHEMA_VERSION, tenantId, resourceType, resourceId, storage: { schemaVersion: FP005_SCHEMA_VERSION, storageClass: "LARGE_BLOB", locator, tenantId, resourceType, resourceId, contentHash: hash, byteLength: 4, durable: true }, locator, authorizationProof: proof(), principalId, action: "storage.write", capability: "storage:write", quotaRevision: "quota-r1", content: { data: png(), mimeType: "image/png" }, archive: zipDeflate("docs/readme.txt", new TextEncoder().encode("safe")) };
}

Deno.test("FP005 public facade denies every reproduced unsealed adversarial probe", () => {
  const forged = validateFp005Boundary(storageRequest());
  assert.equal(forged.ok, false);
  const clone = { kind: "FP005_SERVER_POLICY_COMPOSITION" };
  assert.equal(validateFp005Boundary(storageRequest(), { policyComposition: clone }).ok, false);
  assert.equal(validateFp005Boundary(storageRequest(), { policyComposition: JSON.parse(JSON.stringify(clone)) }).ok, false);
  assert.equal(validateFp005Boundary(storageRequest(), { policyComposition: new Proxy(clone, {}) }).ok, false);
  assert.equal(validateFp005Boundary({ kind: "INPUT", schemaVersion: FP005_SCHEMA_VERSION, content: { data: png().subarray(0, 8), mimeType: "image/png" } }).ok, false);
  assert.equal(validateFp005Boundary({ kind: "INPUT", schemaVersion: FP005_SCHEMA_VERSION, archive: zipDeflate("safe.txt", Uint8Array.of(1), Uint8Array.of(0)) }).ok, false);
  assert.equal(validateFp005Boundary({ kind: "TELEMETRY", schemaVersion: FP005_SCHEMA_VERSION, telemetry: { schemaVersion: FP005_SCHEMA_VERSION, eventName: "audit.probe", result: "OK", unknown: { private: "x" } } }).ok, false);
  const redacted = redactPrivacyValue({ details: { note: "RAW_PROJECT_BODY payment 4111111111111111 private commission pixel audio" } });
  assert(redacted.ok);
  assert.equal(JSON.stringify(redacted.value).includes("RAW_PROJECT_BODY"), false);
});

Deno.test("FP005 public facade accepts only sealed-current authority, strict bytes, quota, and retention", async () => {
  const { composition } = await policy();
  for (const lookalike of [{ ...composition }, JSON.parse(JSON.stringify(composition)), new Proxy(composition, {})]) {
    assert.equal(validateFp005Boundary(storageRequest(), { policyComposition: lookalike }).ok, false);
  }
  const materialized = validateFp005Boundary(storageRequest(), { policyComposition: composition });
  assert.equal(materialized.ok, true);
  if (materialized.ok && materialized.value.kind === "MATERIALIZE") {
    assert.equal(materialized.value.content?.verifiedFromBytes, true);
    assert.equal(materialized.value.archive?.verifiedFromBytes, true);
    assert.equal(materialized.value.quota?.action, "ALLOW");
  }
  const request = storageRequest();
  const rechecked = await recheckStorageScope({ authorizationProof: request.authorizationProof, tenantId, resourceType, resourceId, locator: request.locator, principalId, action: "storage.write", capability: "storage:write" }, request.locator, { policyComposition: composition });
  assert.equal(rechecked.ok, true);
  const cache = validateFp005Boundary({ kind: "RETENTION", schemaVersion: FP005_SCHEMA_VERSION, tenantId, resourceType, resourceId, assetRevision: "asset-r1", category: "CACHE" }, { policyComposition: composition });
  assert.equal(cache.ok, true);
  if (cache.ok && cache.value.kind === "RETENTION") assert.equal(cache.value.decision.action, "DELETE");
  const purchased = validateFp005Boundary({ kind: "RETENTION", schemaVersion: FP005_SCHEMA_VERSION, tenantId, resourceType, resourceId, assetRevision: "asset-r1", category: "PURCHASED" }, { policyComposition: composition });
  assert.equal(purchased.ok, true);
  if (purchased.ok && purchased.value.kind === "RETENTION") assert.equal(purchased.value.decision.action, "RETAIN");
  const activeZip = validateFp005Boundary({ kind: "INPUT", schemaVersion: FP005_SCHEMA_VERSION, archive: zipDeflate("docs/readme.txt", new TextEncoder().encode("<script>alert(1)</script>")) });
  assert.equal(activeZip.ok, false);
  if (!activeZip.ok) assert.equal(activeZip.diagnostics[0]?.code, FP005_ERROR_CODES.ARCHIVE_INVALID);
});
