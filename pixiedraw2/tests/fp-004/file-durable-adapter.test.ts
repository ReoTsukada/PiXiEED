import { strict as assert } from "node:assert";
import { Fp004CrashError } from "../../src/fp-004/durable-transaction.ts";
import {
  FP004_FILE_DURABILITY_CAPABILITY,
  Fp004FileDurableAdapter,
} from "../../src/fp-004/file-durable-adapter.ts";
import {
  asFp004EventId,
  type Fp004CommitRequest,
} from "../../src/fp-004/contracts.ts";
import type {
  AuthorizationProofV1,
  ContentHash,
} from "../../src/wp160-contracts.ts";

const hash = (value: string): ContentHash => {
  const bytes = [...value].map((item) => item.charCodeAt(0).toString(16)).join(
    "",
  );
  return bytes.padEnd(64, "0").slice(0, 64) as ContentHash;
};

const fixtureNow = new Date();
const now = fixtureNow.toISOString();
const expiresAt = new Date(fixtureNow.getTime() + 30 * 60 * 1_000)
  .toISOString();

function request(): Fp004CommitRequest {
  const proof: AuthorizationProofV1 = {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "authority-file",
    proofId: "proof-file",
    principalId: "principal-file",
    resourceType: "project",
    resourceId: "project-file",
    action: "project.write",
    capability: "PROJECT.WRITE",
    tenantId: "tenant-file",
    correlationId: "correlation-file",
    policyVersion: "authorization-policy-v1",
    grantId: "grant-file",
    issuedAt: now,
    expiresAt,
  };
  return {
    authorizationProof: proof,
    expectedAuthorization: {
      principalId: "principal-file",
      tenantId: "tenant-file",
      resourceType: "project",
      resourceId: "project-file",
      action: "project.write",
      capability: "PROJECT.WRITE",
    },
    idempotency: {
      scope: "project.write",
      key: "file-request-1",
      requestHash: hash("file-request"),
    },
    event: {
      schemaVersion: "DURABLE_EVENT_V1",
      eventId: asFp004EventId("file-event-1"),
      eventKind: "DOMAIN_FACT",
      aggregate: {
        tenantId: "tenant-file",
        aggregateType: "project",
        aggregateId: "project-aggregate-file",
        aggregateVersion: 1,
        resourceType: "project",
        resourceId: "project-file",
      },
      payloadHash: hash("file-payload"),
      resultHash: hash("file-state"),
      correlationId: "correlation-file",
      producerType: "file-fixture",
    },
    stateReference: {
      resourceType: "project",
      resourceId: "project-file",
      expectedRevision: "GENESIS",
      nextRevision: "file-revision-1",
      stateHash: hash("file-state"),
    },
  };
}

async function withTempPath(
  callback: (storageRoot: string, snapshotName: string) => Promise<void>,
): Promise<void> {
  const directory = await Deno.makeTempDir({ prefix: "fp004-file-" });
  try {
    await callback(directory, "state.json");
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
}

Deno.test("FP004-EVT-001 file adapter survives a new process-shaped instance", async () => {
  await withTempPath(async (storageRoot, snapshotName) => {
    const first = await Fp004FileDurableAdapter.open(storageRoot, snapshotName, {
      clock: () => new Date(now),
      authorizationRevalidator: () => true,
    });
    assert.equal(first.capability, FP004_FILE_DURABILITY_CAPABILITY);
    assert.equal(first.capability.processDurable, true);
    assert.equal(first.capability.productionEquivalent, false);
    assert.equal(first.capability.powerLossDurable, false);
    assert.equal(first.capability.powerLossDurability, "UNTESTED");
    assert.equal(first.capability.productionEquivalentStatus, "UNTESTED");
    assert.equal((await first.commit(request())).ok, true);

    const restarted = await Fp004FileDurableAdapter.open(storageRoot, snapshotName, {
      clock: () => new Date(now),
      authorizationRevalidator: () => true,
    });
    assert.equal(restarted.snapshot().events.length, 1);
    assert.equal(restarted.snapshot().outbox.length, 1);
    assert.equal(restarted.snapshot().idempotency.length, 1);
    const duplicate = await restarted.commit(request());
    assert.equal(duplicate.ok, true);
    if (duplicate.ok) assert.equal(duplicate.value.duplicate, true);
  });
});

Deno.test("FP004-RECOVERY-001 persists the committed state across response crash", async () => {
  await withTempPath(async (storageRoot, snapshotName) => {
    const crashing = await Fp004FileDurableAdapter.open(storageRoot, snapshotName, {
      clock: () => new Date(now),
      authorizationRevalidator: () => true,
      faultInjector: (point) => {
        if (point === "AFTER_COMMIT_BEFORE_RESPONSE") {
          throw new Fp004CrashError(point);
        }
      },
    });
    await assert.rejects(() => crashing.commit(request()), Fp004CrashError);

    const restarted = await Fp004FileDurableAdapter.open(storageRoot, snapshotName, {
      clock: () => new Date(now),
      authorizationRevalidator: () => true,
    });
    assert.equal(restarted.snapshot().events.length, 1);
    const retry = await restarted.commit(request());
    assert.equal(retry.ok, true);
    if (retry.ok) assert.equal(retry.value.duplicate, true);
  });
});

Deno.test("FP004-SEC-001 rejects unsafe paths and malformed snapshots", async () => {
  await assert.rejects(
    () => Fp004FileDurableAdapter.open("/tmp", "../relative-state.json"),
    /snapshot name is unsafe/,
  );
  await withTempPath(async (storageRoot, snapshotName) => {
    await Deno.writeTextFile(
      `${storageRoot}/${snapshotName}`,
      JSON.stringify({ schemaVersion: "UNKNOWN" }),
    );
    await assert.rejects(
      () => Fp004FileDurableAdapter.open(storageRoot, snapshotName),
      /snapshot is invalid or unsupported/,
    );
  });
});

Deno.test("FP004-SEC-002 confines snapshots to a real, non-symlink storage root", async () => {
  await withTempPath(async (storageRoot, snapshotName) => {
    await assert.rejects(
      () => Fp004FileDurableAdapter.open(storageRoot, "../outside.json"),
      /snapshot name is unsafe/,
    );
    await assert.rejects(
      () => Fp004FileDurableAdapter.open(storageRoot, "/tmp/fp004-outside.json"),
      /snapshot name is unsafe/,
    );

    const linkedPath = `${storageRoot}/${snapshotName}`;
    await Deno.symlink(`${storageRoot}/outside.json`, linkedPath);
    await assert.rejects(
      () => Fp004FileDurableAdapter.open(storageRoot, snapshotName),
      /snapshot symlink is unsafe/,
    );

    await Deno.remove(linkedPath);
    await Deno.symlink(`${storageRoot}/outside.tmp`, `${linkedPath}.tmp`);
    await assert.rejects(
      () => Fp004FileDurableAdapter.open(storageRoot, snapshotName),
      /temporary snapshot symlink is unsafe/,
    );
    await Deno.remove(`${linkedPath}.tmp`);

    const linkedRoot = `${storageRoot}-link`;
    await Deno.symlink(storageRoot, linkedRoot);
    await assert.rejects(
      () => Fp004FileDurableAdapter.open(linkedRoot, "other.json"),
      /storage root symlink is unsafe/,
    );
  });
});

Deno.test("FP004-RECOVERY-002 keeps the existing snapshot after a deterministic write failure", async () => {
  await withTempPath(async (storageRoot, snapshotName) => {
    const first = await Fp004FileDurableAdapter.open(storageRoot, snapshotName, {
      clock: () => new Date(now),
      authorizationRevalidator: () => true,
    });
    assert.equal((await first.commit(request())).ok, true);
    const beforeFailure = first.snapshot();
    const secondRequest = { ...request(), idempotency: { ...request().idempotency, key: "file-request-2" } };
    const failing = await Fp004FileDurableAdapter.openForTest(
      storageRoot,
      snapshotName,
      {
        clock: () => new Date(now),
        authorizationRevalidator: () => true,
      },
      { rename: async () => { throw new Error("injected rename failure"); } },
    );
    await assert.rejects(
      () => failing.commit(secondRequest),
      /injected rename failure/,
    );

    const restarted = await Fp004FileDurableAdapter.open(storageRoot, snapshotName, {
      clock: () => new Date(now),
      authorizationRevalidator: () => true,
    });
    assert.deepEqual(restarted.snapshot(), beforeFailure);
  });
});
