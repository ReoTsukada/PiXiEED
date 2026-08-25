import { strict as assert } from "node:assert";
import {
  asFp004EventId,
  asFp004LeaseToken,
  asFp004RecordId,
  asFp004TransactionId,
  FP004_SCHEMA_VERSION,
  hasExpiredLease,
  isFp004Hash,
  isFp004SafeIdentifier,
  isPositiveSafeInteger,
  isValidFp004Aggregate,
} from "../src/fp-004/contracts.ts";

const HASH = "a".repeat(64);

Deno.test("FP-004 contracts accept bounded stable identities and hashes", () => {
  assert.equal(asFp004RecordId("outbox:tenant-a:001"), "outbox:tenant-a:001");
  assert.equal(asFp004EventId("evt:aggregate-a:1"), "evt:aggregate-a:1");
  assert.equal(asFp004TransactionId("tx:commit-1"), "tx:commit-1");
  assert.equal(asFp004LeaseToken("lease:worker-a:1"), "lease:worker-a:1");
  assert.equal(isFp004Hash(HASH), true);
  assert.equal(isFp004SafeIdentifier("tenant-a"), true);
  assert.equal(isPositiveSafeInteger(1), true);
  assert.equal(FP004_SCHEMA_VERSION, "DURABLE_EVENT_V1");
});

Deno.test("FP-004 contracts reject unsafe identity, hash, and aggregate inputs", () => {
  assert.throws(() => asFp004RecordId("../secret"));
  assert.throws(() => asFp004EventId(""));
  assert.throws(() => asFp004TransactionId("token with space"));
  assert.throws(() => asFp004LeaseToken("lease\nworker"));
  assert.equal(isFp004Hash("not-a-hash"), false);
  assert.equal(isFp004SafeIdentifier("tenant with space"), false);
  assert.equal(isPositiveSafeInteger(0), false);
  assert.equal(
    isValidFp004Aggregate({
      tenantId: "tenant-a",
      aggregateType: "PAYMENT",
      aggregateId: "payment-a",
      aggregateVersion: 1,
      resourceType: "PAYMENT",
      resourceId: "payment-a",
    }),
    true,
  );
  assert.equal(
    isValidFp004Aggregate({
      tenantId: "tenant a",
      aggregateType: "PAYMENT",
      aggregateId: "payment-a",
      aggregateVersion: 0,
      resourceType: "PAYMENT",
      resourceId: "payment-a",
    }),
    false,
  );
});

Deno.test("FP-004 lease expiration is time-bound and never inferred from a truthy flag", () => {
  const now = new Date("2026-08-10T00:00:00.000Z");
  assert.equal(
    hasExpiredLease({
      ownerId: "worker-a",
      fencingToken: asFp004LeaseToken("lease:a:1"),
      acquiredAt: "2026-08-09T23:59:00.000Z",
      expiresAt: "2026-08-09T23:59:59.999Z",
      attempt: 1,
    }, now),
    true,
  );
  assert.equal(
    hasExpiredLease({
      ownerId: "worker-a",
      fencingToken: asFp004LeaseToken("lease:a:2"),
      acquiredAt: "2026-08-10T00:00:00.000Z",
      expiresAt: "2026-08-10T00:01:00.000Z",
      attempt: 2,
    }, now),
    false,
  );
  assert.equal(
    hasExpiredLease({
      ownerId: "worker-a",
      fencingToken: asFp004LeaseToken("lease:a:3"),
      acquiredAt: "2026-08-10T00:00:00.000Z",
      expiresAt: "not-a-time",
      attempt: 3,
    }, now),
    true,
  );
});
