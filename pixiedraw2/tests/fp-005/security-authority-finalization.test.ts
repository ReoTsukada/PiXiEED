import { strict as assert } from "node:assert";
import { FP005_SCHEMA_VERSION } from "../../src/fp-005/contracts.ts";
import { recheckStorageScope, validateStorageScope } from "../../src/fp-005/storage-scope.ts";
import { REDACTED, redactPrivacyValue } from "../../src/fp-005/redaction.ts";
import { serializeTelemetry, sanitizeTelemetry } from "../../src/fp-005/telemetry.ts";

const tenantId = "tenant-sec";
const resourceType = "project";
const resourceId = "project-sec";
const locator = { placement: "OPFS" as const, path: "tenant-sec/project-sec/chunk", contentHash: "a".repeat(64), byteLength: 4, tenantId, resourceType, resourceId };
const callerProof = { schemaVersion: 1, proofType: "AUTHORIZATION_PROOF", source: "server", decision: "allow", authorityId: "forged", proofId: "forged", principalId: "principal-sec", resourceType, resourceId, action: "storage.write", capability: "storage:write", tenantId, correlationId: "forged", policyVersion: "authorization-policy-v1", grantId: "forged", issuedAt: new Date(Date.now() - 30_000).toISOString(), expiresAt: new Date(Date.now() + 240_000).toISOString() };

Deno.test("FP005 security authority denies caller proofs, lookalike policy objects, and recheck without a sealed composition", async () => {
  const request = { schemaVersion: FP005_SCHEMA_VERSION, authorizationProof: callerProof, tenantId, resourceType, resourceId, locator, principalId: "principal-sec", action: "storage.write", capability: "storage:write" };
  assert.equal(validateStorageScope(request).ok, false);
  assert.equal(validateStorageScope(request, { policyComposition: { kind: "FP005_SERVER_POLICY_COMPOSITION" } }).ok, false);
  assert.equal((await recheckStorageScope(request, locator, { policyComposition: { kind: "FP005_SERVER_POLICY_COMPOSITION" } })).ok, false);
});

Deno.test("FP005 security serialization emits only flat allowlisted values", () => {
  const redacted = redactPrivacyValue({ media: new Uint8Array([1]), project: { body: "short project body" }, cardNumber: "4111111111111111", details: { note: "raw private commission" }, eventName: "security.check" });
  assert.equal(redacted.ok, true);
  if (redacted.ok) {
    const serialized = JSON.stringify(redacted.value);
    for (const secret of ["short project body", "4111111111111111", "raw private commission"]) assert.equal(serialized.includes(secret), false);
    assert.equal(serialized.includes(REDACTED), true);
  }
  assert.equal(serializeTelemetry({ schemaVersion: FP005_SCHEMA_VERSION, eventName: "security.check", result: "OK", jwt: "eyJheader.payload.signature" }).ok, false);
  assert.equal(sanitizeTelemetry({ schemaVersion: FP005_SCHEMA_VERSION, eventName: "security.check", result: "OK", unknown: { privateCommission: "private" } }).ok, false);
});
