import { strict as assert } from "node:assert";
import { FP005_ERROR_CODES } from "../../src/fp-005/error-codes.ts";
import { checkStorageQuota } from "../../src/fp-005/storage-placement.ts";
import { decideStorageRetention } from "../../src/fp-005/retention-decision.ts";

const quotaInput = { schemaVersion: "FP005_V1", tenantId: "tenant-1", resourceType: "asset", resourceId: "asset-1", incomingBytes: 1 };
const retentionInput = { schemaVersion: "FP005_V1", tenantId: "tenant-1", resourceType: "asset", resourceId: "asset-1", category: "CACHE" as const };

Deno.test("FP005 QUOTA rejects an absent server-policy composition", () => {
  assert.equal(checkStorageQuota(quotaInput).ok, false);
});

Deno.test("FP005 QUOTA rejects cloned and structural server-policy lookalikes", () => {
  for (const policyComposition of [{}, { kind: "FP005_SERVER_POLICY_COMPOSITION" }]) {
    assert.equal(checkStorageQuota(quotaInput, { policyComposition }).ok, false);
  }
});

Deno.test("FP005 QUOTA rejects oversized caller requests before resolution", () => {
  const quota = checkStorageQuota({ ...quotaInput, incomingBytes: Number.MAX_SAFE_INTEGER }, { policyComposition: {} });
  assert.equal(quota.ok, false);
  if (!quota.ok) assert.equal(quota.diagnostics[0]?.code, FP005_ERROR_CODES.INPUT_TOO_LARGE);
});

Deno.test("FP005 RETENTION rejects absent and structural server-policy lookalikes", () => {
  for (const policyComposition of [undefined, {}, { kind: "FP005_SERVER_POLICY_COMPOSITION" }]) {
    assert.equal(decideStorageRetention(retentionInput, { policyComposition }).ok, false);
  }
});
