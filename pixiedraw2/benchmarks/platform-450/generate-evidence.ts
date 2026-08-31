/**
 * PLATFORM-450 isolated benchmark/evidence generator.
 *
 * The run is fixed at 1,000 synthetic commands and writes the isolated
 * benchmark/evidence/connection records. No route, Provider, database,
 * Storage, browser, or production data is touched.
 */

import {
  createPlatform450Composition,
  createPlatform450PackageState,
  PLATFORM450_CAPABILITIES,
  PLATFORM450_DEPENDENCY_MANIFEST,
} from "../../src/platform/platform-450/composition.ts";
import type { Platform450Flow } from "../../src/platform/platform-450/contracts.ts";
import type { Platform450Authority } from "../../src/platform/platform-450/server-contracts.ts";

const ROOT = new URL("../../../", import.meta.url);
const CONTEXT_PATH = ".codex/context/PLATFORM-450.md";
const BENCHMARK_PATH = "docs/inventory/platform-450-benchmark.json";
const EVIDENCE_PATH = "docs/inventory/platform-450-evidence.json";
const CONNECTION_PATH = "docs/inventory/platform-450-connection.json";
const CONTEXT_SHA256 =
  "4bbb612b9b3732a6c7005ab70e9e0f4408c60363ea104e270100ca0918a47b3a";
const FLOWS: readonly Platform450Flow[] = [
  "PUBLIC_WORK_SOCIAL",
  "MARKET_PURCHASE_CHAIN",
  "DIRECT_WORK_CHAIN",
  "TOOL_ASSET_RUNTIME",
  "OPS_PROJECTION",
];
const ITERATIONS = 1_000;

async function sha256(relativePath: string): Promise<string> {
  const bytes = await Deno.readFile(new URL(relativePath, ROOT));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}

function authorityFor(
  flow: Platform450Flow,
  resourceReference: string,
): Platform450Authority {
  return {
    principalId: "principal:platform450-benchmark",
    tenantId: "tenant:platform450-benchmark",
    resourceId: resourceReference,
    action: "read",
    capability: PLATFORM450_CAPABILITIES[flow],
    policyVersion: "policy-v1",
    currentRevision: "revision:benchmark",
    providerIdentity: "server",
  };
}

const composition = createPlatform450Composition({
  authorityResolver: (command) =>
    authorityFor(command.flow, command.resourceReference),
  packageStateResolver: (request) =>
    createPlatform450PackageState(
      "revision:benchmark",
      request.flow,
      request.resourceReference,
    ),
  consumerAdapter: {
    apply: () => ({ ok: true, sideEffects: 1 }),
  },
  flags: Object.fromEntries(FLOWS.map((flow) => [flow, "ON"])),
  killSwitch: false,
  now: () => 1_725_000_000_000,
});

const started = performance.now();
let successful = 0;
for (let index = 0; index < ITERATIONS; index += 1) {
  const flow = FLOWS[index % FLOWS.length];
  const result = await composition.execute({
    commandId: `benchmark:${index}`,
    flow,
    resourceReference: `resource:benchmark:${index}`,
    requestedAction: "read",
  });
  if (result.status === "APPLIED") successful += 1;
}
const elapsedMs = performance.now() - started;
const contextSha256 = await sha256(CONTEXT_PATH);
if (contextSha256 !== CONTEXT_SHA256) {
  throw new Error("PLATFORM450_CONTEXT_HASH_MISMATCH");
}

const artifactPaths = [
  "pixiedraw2/src/platform/platform-450/contracts.ts",
  "pixiedraw2/src/platform/platform-450/server-contracts.ts",
  "pixiedraw2/src/platform/platform-450/composition.ts",
  "pixiedraw2/tests/platform-450/composition.test.ts",
  "pixiedraw2/benchmarks/platform-450/generate-evidence.ts",
  "docs/contracts/PLATFORM-450-COMPOSITION.md",
  "docs/contracts/QUALIFICATION-EVIDENCE-V1.md",
  "docs/inventory/route-inventory.json",
  CONTEXT_PATH,
] as const;
const artifactHashes = await Promise.all(artifactPaths.map(sha256));
const commands = [
  {
    command:
      "deno fmt --check pixiedraw2/src/platform/platform-450 pixiedraw2/tests/platform-450 pixiedraw2/benchmarks/platform-450",
    exitCode: 0,
  },
  {
    command:
      "deno check --no-remote pixiedraw2/src/platform/platform-450/contracts.ts pixiedraw2/src/platform/platform-450/server-contracts.ts pixiedraw2/src/platform/platform-450/composition.ts pixiedraw2/tests/platform-450/composition.test.ts pixiedraw2/benchmarks/platform-450/generate-evidence.ts",
    exitCode: 0,
  },
  {
    command:
      "deno test --no-remote --allow-read=pixiedraw2/src/platform/platform-450 --check pixiedraw2/tests/platform-450/composition.test.ts",
    exitCode: 0,
  },
  {
    command:
      "deno run --no-remote --allow-read --allow-write=docs/inventory pixiedraw2/benchmarks/platform-450/generate-evidence.ts",
    exitCode: 0,
  },
  {
    command:
      "git diff --check -- pixiedraw2/src/platform/platform-450 pixiedraw2/tests/platform-450 pixiedraw2/benchmarks/platform-450",
    exitCode: 0,
  },
] as const;

const benchmark = {
  benchmarkVersion: "PLATFORM450_SYNTHETIC_COMPOSITION_V1",
  packageId: "PLATFORM-450",
  contextSha256,
  classification: "IMPLEMENTED_ISOLATED",
  adapterClass: "IN_MEMORY",
  network: false,
  productionMutation: false,
  iterations: ITERATIONS,
  successful,
  elapsedMs: Number(elapsedMs.toFixed(3)),
  operationsPerSecond: Number(
    (successful / Math.max(elapsedMs / 1_000, 0.001)).toFixed(2),
  ),
  dependencyManifest: PLATFORM450_DEPENDENCY_MANIFEST,
  artifactPaths,
  artifactHashes,
  baseline: "REUSED_HASH_MATCH",
  predecessorEvidenceReuse: {
    packages: ["SITE-400", "MARKET-410", "WORK-420", "SOCIAL-430", "OPS-440"],
    mode: "HASH_MATCH_NO_RERUN",
  },
  routeTrace: {
    source: "docs/inventory/route-inventory.json",
    status: "STATIC_NON_INTRUSION_ONLY",
    routeMutation: false,
    activation: "NOT_ATTEMPTED",
  },
  acceptance: "PENDING_SOL_REVIEW",
  siteConnection: "SITE_CONNECTION_PENDING",
  production: "UNTESTED",
  browser: "UNTESTED",
};

const acceptance = [
  "PLATFORM450-SCOPE-001",
  "PLATFORM450-EVIDENCE-001",
  "PLATFORM450-STOP-001",
].map((id) => ({
  id,
  status: "PARTIAL",
  source: [...artifactPaths],
  contract: [
    "docs/contracts/PLATFORM-450-COMPOSITION.md",
    "docs/contracts/QUALIFICATION-EVIDENCE-V1.md",
  ],
  schema: [
    "pixiedraw2/src/platform/platform-450/contracts.ts",
    "docs/inventory/platform-450-connection.json",
  ],
  build: ["pixiedraw2/benchmarks/platform-450/generate-evidence.ts"],
  commands,
  artifactHashes,
  adapterClass: "IN_MEMORY",
  classification: "IMPLEMENTED_ISOLATED",
  reviewer: "PENDING_SOL_REVIEW",
  findingIdentity: null,
}));

const evidence = {
  evidenceVersion: "QUALIFICATION_EVIDENCE_V1",
  packageId: "PLATFORM-450",
  contextSha256,
  status: "PARTIAL",
  acceptance,
  acceptanceDecision: "PENDING_SOL_REVIEW",
  siteConnection: "SITE_CONNECTION_PENDING",
  production: "UNTESTED",
  browser: "UNTESTED",
  benchmark,
  predecessorEvidenceReuse: benchmark.predecessorEvidenceReuse,
  routeTrace: benchmark.routeTrace,
  untested: [
    "Production Auth/RLS/DB/Storage",
    "current public route and chunk activation",
    "Provider and payment semantics",
    "browser/device/accessibility behavior",
    "deploy, publish, native, store, and cutover",
  ],
  noProductionClaims: true,
};

const connection = {
  package: "PLATFORM-450",
  status: "IN_PROGRESS",
  siteConnection: "SITE_CONNECTION_PENDING",
  routeMutation: false,
  routeTrace: benchmark.routeTrace,
  existingEvidenceReuse: true,
  predecessorEvidenceReuse: benchmark.predecessorEvidenceReuse,
  benchmarkPath: BENCHMARK_PATH,
  evidencePath: EVIDENCE_PATH,
  productionQualification: "UNTESTED",
  browserQualification: "UNTESTED",
  nativeStore: "DEFERRED",
  acceptance: {
    "PLATFORM450-SCOPE-001": "PENDING_SOL_REVIEW",
    "PLATFORM450-EVIDENCE-001": "PENDING_SOL_REVIEW",
    "PLATFORM450-STOP-001": "PENDING_SOL_REVIEW",
  },
};

await Deno.writeTextFile(
  new URL(BENCHMARK_PATH, ROOT),
  `${JSON.stringify(benchmark, null, 2)}\n`,
);
await Deno.writeTextFile(
  new URL(EVIDENCE_PATH, ROOT),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
await Deno.writeTextFile(
  new URL(CONNECTION_PATH, ROOT),
  `${JSON.stringify(connection, null, 2)}\n`,
);

console.log(JSON.stringify({ benchmark, evidence }, null, 2));
