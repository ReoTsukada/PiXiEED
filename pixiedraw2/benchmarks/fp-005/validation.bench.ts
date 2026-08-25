/**
 * FP-005 local synthetic benchmark.
 *
 * Metadata-only: no provider, filesystem, network, database, or user data is
 * read. Every sample crosses the FP-005 facade's Storage, Input/Path, and
 * Telemetry boundaries before its latency is recorded.
 */
import { validateFp005Boundary } from "../../src/fp-005/index.ts";
import { AUTHORIZATION_PROOF_POLICY_VERSION } from "../../src/wp160-contracts.ts";

const SIZES = [1, 10, 100, 1000] as const;
const SCHEMA_VERSION = "FP005_V1" as const;
const HASH = "a".repeat(64);
const TENANT_ID = "synthetic-tenant";
const RESOURCE_TYPE = "synthetic-project";

function authorizationProof(resourceId: string) {
  const now = Date.now();
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "fp005-local-synthetic",
    proofId: `proof:${resourceId}`,
    principalId: "synthetic-principal",
    resourceType: RESOURCE_TYPE,
    resourceId,
    action: "storage.read",
    capability: "storage.read",
    tenantId: TENANT_ID,
    correlationId: "fp005-local-synthetic",
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: "grant:fp005-local-synthetic",
    issuedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
  } as const;
}

function fixture(index: number) {
  const resourceId = `synthetic-resource-${index}`;
  const path = `synthetic/project-${index}/metadata.json`;
  const locator = {
    placement: "OPFS",
    path,
    contentHash: HASH,
    byteLength: 128,
    mimeType: "application/json",
    tenantId: TENANT_ID,
    resourceType: RESOURCE_TYPE,
    resourceId,
  } as const;
  const rejected = index % 10 === 9;
  return {
    storage: {
      kind: "STORAGE" as const,
      schemaVersion: SCHEMA_VERSION,
      tenantId: TENANT_ID,
      resourceType: RESOURCE_TYPE,
      resourceId,
      storage: {
        schemaVersion: SCHEMA_VERSION,
        storageClass: "LARGE_BLOB" as const,
        locator,
        tenantId: TENANT_ID,
        resourceType: RESOURCE_TYPE,
        resourceId,
        byteLength: 128,
        mimeType: "application/json",
        durable: true,
      },
      locator: rejected ? { ...locator, path: "../rejected.json" } : locator,
      authorizationProof: authorizationProof(resourceId),
      authority: "LOCAL" as const,
      action: "storage.read",
      capability: "storage.read",
      principalId: "synthetic-principal",
    },
    input: {
      kind: "INPUT" as const,
      schemaVersion: SCHEMA_VERSION,
      json: { schema: "synthetic-metadata-v1", ordinal: index, fields: ["name", "revision", "path"] },
      path: rejected ? "../rejected.json" : path,
      pathAuthority: "LOCAL" as const,
    },
    telemetry: {
      kind: "TELEMETRY" as const,
      schemaVersion: SCHEMA_VERSION,
      telemetry: {
        schemaVersion: SCHEMA_VERSION,
        eventName: "fp005.synthetic.validation",
        operationId: `synthetic-operation-${index}`,
        feature: "fp005-benchmark",
        durationMs: 0,
        result: rejected ? "ERROR" as const : "OK" as const,
      },
    },
  };
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const position = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return Number((sorted[Math.max(0, position)] ?? 0).toFixed(6));
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function measure(size: number) {
  const latencies: number[] = [];
  let count = 0;
  let rejected = 0;
  for (let index = 0; index < size; index += 1) {
    const sample = fixture(index);
    const started = performance.now();
    const storage = validateFp005Boundary(sample.storage);
    const input = validateFp005Boundary(sample.input);
    const telemetry = validateFp005Boundary(sample.telemetry);
    latencies.push(performance.now() - started);
    count += 1;
    if (!storage.ok || !input.ok || !telemetry.ok) rejected += 1;
  }
  return {
    count,
    rejected,
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      max: round(Math.max(...latencies)),
    },
  };
}

console.log(JSON.stringify({
  schemaVersion: SCHEMA_VERSION,
  benchmarkId: "FP-005_METADATA_ONLY_VALIDATION",
  status: "MEASURED_LOCAL_SYNTHETIC",
  productionSloClaim: false,
  productionEquivalentClaim: false,
  fixture: {
    sizes: SIZES,
    rejectedEvery: 10,
    boundaries: ["STORAGE", "INPUT", "PATH", "TELEMETRY"],
    dataClass: "synthetic-metadata-only",
  },
  results: SIZES.map(measure),
  notes: [
    "Fixed synthetic metadata fixture only; no real user data was used.",
    "Storage, Input/Path, and Telemetry were validated through validateFp005Boundary; PATH is carried by the Input facade request.",
    "Latency is local validator execution time and is not a production, browser, provider, or device measurement.",
  ],
}, null, 2));
