import { FP005_ERROR_CODES } from "../../src/fp-005/error-codes.ts";
import { validateStorageIntegrity } from "../../src/fp-005/storage-integrity.ts";
import { classifyStoragePlacement, checkStorageQuota } from "../../src/fp-005/storage-placement.ts";
import { validateStorageScope } from "../../src/fp-005/storage-scope.ts";
import { decideStorageRetention } from "../../src/fp-005/retention-decision.ts";

function assert(value: boolean, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

const HASH = "a".repeat(64);
const locator = { placement: "OPFS", path: "tenant/project/chunk", contentHash: HASH, byteLength: 12, tenantId: "tenant-1", resourceType: "project", resourceId: "project-1" } as const;

Deno.test("FP005-STORAGE-001 rejects durable memory and verifies metadata", () => {
  const active = classifyStoragePlacement({ schemaVersion: "FP005_V1", storageClass: "ACTIVE_STATE", tenantId: "tenant-1", resourceType: "project", resourceId: "project-1", durable: true });
  assert(!active.ok && active.diagnostics[0]?.code === FP005_ERROR_CODES.STORAGE_PLACEMENT_INVALID);
  assert(validateStorageIntegrity({ schemaVersion: "FP005_V1", locator, observedContentHash: HASH, observedByteLength: 12 }).ok);
  assert(!validateStorageIntegrity({ schemaVersion: "FP005_V1", locator, observedContentHash: "b".repeat(64), observedByteLength: 12 }).ok);
});

Deno.test("FP005-STORAGE-001 bounds quota, retention, and tenant scope", () => {
  assert(!checkStorageQuota({ schemaVersion: "FP005_V1", tenantId: "tenant-1", resourceType: "project", resourceId: "project-1", quotaBytes: 10, usedBytes: 10, incomingBytes: 1 }).ok);
  const retained = decideStorageRetention({ schemaVersion: "FP005_V1", tenantId: "tenant-1", resourceId: "asset-1", category: "PURCHASED" });
  assert(!retained.ok && retained.diagnostics[0]?.code === FP005_ERROR_CODES.RETENTION_PROTECTED);
  const denied = validateStorageScope({ schemaVersion: "FP005_V1", authorizationProof: null, tenantId: "tenant-1", resourceType: "project", resourceId: "project-1", locator });
  assert(!denied.ok && denied.diagnostics[0]?.code === FP005_ERROR_CODES.AUTHORIZATION_REQUIRED);
});
