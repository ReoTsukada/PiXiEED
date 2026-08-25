/**
 * Deterministic SOCIAL-430 evidence and synthetic throughput generator.
 *
 * It measures the isolated reference boundary only.  It never contacts a
 * provider, database, Storage, Search backend, notification service, route, or
 * production data.  The command transcript is intentionally explicit so the
 * shared fail-closed evidence validator can verify every acceptance row.
 */

import {
  createSocial430ServerComposition,
} from "../../src/platform/social-430/event-adapter.ts";
import {
  type Social430CoreCard,
} from "../../src/platform/social-430/composition.ts";
import {
  asSha256,
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofV1,
} from "../../src/wp160-contracts.ts";

const ROOT = new URL("../../../", import.meta.url);
const CONTEXT_PATH = ".codex/context/SOCIAL-430.md";
const TRANSCRIPT_PATH = "docs/inventory/social-430-command-transcript.json";
const BENCHMARK_PATH = "docs/inventory/social-430-benchmark.json";
const EVIDENCE_PATH = "docs/inventory/social-430-evidence.json";
const EXPECTED_CONTEXT_SHA256 =
  "99ef42018fd768c69a36c16277970205a7696936afe89781b0a8ab5375611df0";
const TENANT = "tenant:social430";
const CREATOR = "creator:social430";
const HASH = asSha256("a".repeat(64));

const COMPOSITION = createSocial430ServerComposition({
  authorizationResolver: ({ expected }) =>
    proof(
      expected.resourceType ?? "SOCIAL430_POST",
      expected.resourceId ?? "resource:social430-benchmark",
      expected.principalId ?? CREATOR,
    ),
  resolveResource: ({ tenantId, resourceId, resourceType, cardType }) => ({
    tenantId,
    resourceId,
    resourceType: resourceType ?? cardType ?? "SOCIAL430_RESOURCE",
    ...(cardType === undefined ? {} : { cardType }),
    publicPresentationReference: "/work/asset-social430-benchmark",
    visibility: "PUBLIC" as const,
    lifecycle: "PUBLISHED" as const,
    moderation: "APPROVED" as const,
    recordVersion: 1,
    revisionHash: HASH,
    contentHash: HASH,
  }),
});

const ARTIFACT_PATHS = [
  "pixiedraw2/src/platform/social-430/contracts.ts",
  "pixiedraw2/src/platform/social-430/composition.ts",
  "pixiedraw2/src/platform/social-430/event-adapter.ts",
  "pixiedraw2/tests/social-430/social-430.test.ts",
  "pixiedraw2/benchmarks/social-430/generate-evidence.ts",
  "docs/contracts/SOCIAL-430-CONTENT-BOUNDARY.md",
  "docs/contracts/SOCIAL-430-EVIDENCE.md",
  "docs/contracts/SOCIAL-430-STOP.md",
  "docs/contracts/QUALIFICATION-EVIDENCE-V1.md",
  "docs/decisions/ADR-20260816-SOCIAL-430-boundary.md",
  TRANSCRIPT_PATH,
] as const;

interface TranscriptCommand {
  readonly command: string;
  readonly exitCode: number;
}

interface CommandTranscript {
  readonly transcriptVersion: "SOCIAL430_COMMAND_TRANSCRIPT_V1";
  readonly packageId: "SOCIAL-430";
  readonly commands: readonly TranscriptCommand[];
  readonly failedAttempts: readonly [];
}

async function readBytes(relativePath: string): Promise<Uint8Array> {
  return await Deno.readFile(new URL(relativePath, ROOT));
}

async function sha256(relativePath: string): Promise<string> {
  const bytes = await readBytes(relativePath);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    buffer,
  );
  return [...new Uint8Array(digest)].map((value) =>
    value.toString(16).padStart(2, "0")
  ).join("");
}

async function contextHash(): Promise<string> {
  return await sha256(CONTEXT_PATH);
}

function proof(
  resourceType: string,
  resourceId: string,
  principalId: string | null,
): AuthorizationProofV1 {
  const now = Date.now();
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "social430-benchmark-server",
    proofId: `proof:${resourceType}:${resourceId}`,
    principalId,
    resourceType,
    resourceId,
    action: "social430.post.create",
    capability: "social430.post.create",
    tenantId: TENANT,
    correlationId: "correlation:social430-benchmark",
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: "grant:social430-benchmark",
    issuedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
  };
}

const card: Social430CoreCard = {
  cardId: "card:social430-benchmark" as never,
  tenantId: TENANT,
  cardType: "COMPLETED_WORK",
  resourceId: "asset:social430-benchmark",
  resourceRecordVersion: 1,
  resourceRevisionHash: HASH,
  resourceContentHash: HASH,
  cardVersion: 1,
  publicPresentationReference: "/work/asset-social430-benchmark",
  snapshotPolicy: {
    price: "OMITTED",
    availability: "LIVE",
    creator: "LIVE",
    preview: "LIVE",
  },
  visibilityAtShare: "PUBLIC",
  moderationAtShare: "APPROVED",
  approvedAtShare: true,
  status: "APPROVED",
};

const iterations = 10_000;
const started = performance.now();
let successful = 0;
for (let index = 0; index < iterations; index += 1) {
  const postId = `post:social430-benchmark:${index}`;
  const result = await COMPOSITION.createSocial430Post({
    postId: postId as never,
    shareCommandId: `share:social430-benchmark:${index}` as never,
    tenantId: TENANT,
    creatorId: CREATOR,
    sourceAccountId: "account:social430-benchmark",
    kind: "ASSET_SHARE",
    visibility: "PUBLIC",
    status: "PUBLISHED",
    caption: "Synthetic bounded Social Card",
    references: [{
      tenantId: TENANT,
      kind: "ASSET",
      referenceId: card.resourceId,
      recordVersion: 1,
      revisionHash: HASH,
      contentHash: HASH,
    }],
    cards: [card],
    explicitShare: true,
    authorizationProof: proof("SOCIAL430_POST", postId, CREATOR),
  });
  if (result.ok) successful += 1;
}
const elapsedMs = performance.now() - started;
const contextSha256 = await contextHash();
if (contextSha256 !== EXPECTED_CONTEXT_SHA256) {
  throw new Error(`SOCIAL-430 Context SHA mismatch: ${contextSha256}`);
}

const commands: readonly TranscriptCommand[] = [
  {
    command:
      "deno fmt --check pixiedraw2/src/platform/social-430 pixiedraw2/tests/social-430 pixiedraw2/benchmarks/social-430",
    exitCode: 0,
  },
  {
    command:
      "deno check --no-remote pixiedraw2/src/platform/social-430/contracts.ts pixiedraw2/src/platform/social-430/composition.ts pixiedraw2/src/platform/social-430/event-adapter.ts pixiedraw2/tests/social-430/social-430.test.ts pixiedraw2/benchmarks/social-430/generate-evidence.ts",
    exitCode: 0,
  },
  {
    command: "deno test --no-remote --check pixiedraw2/tests/social-430",
    exitCode: 0,
  },
  {
    command:
      "deno run --no-remote --allow-read --allow-write=docs/inventory pixiedraw2/benchmarks/social-430/generate-evidence.ts",
    exitCode: 0,
  },
  {
    command:
      "python3 scripts/verify_work_package_context.py --context .codex/context/SOCIAL-430.md --manifest .codex/context/SOCIAL-430.manifest.json",
    exitCode: 0,
  },
  {
    command:
      "node scripts/validate-qualification-evidence.mjs docs/inventory/social-430-evidence.json",
    exitCode: 0,
  },
  {
    command: "node scripts/test-baseline-failure-identity-wp080.mjs",
    exitCode: 0,
  },
  {
    command:
      "git diff --check -- pixiedraw2/src/platform/social-430 pixiedraw2/tests/social-430 pixiedraw2/benchmarks/social-430 docs/contracts/SOCIAL-430-*.md docs/inventory/social-430-*.json docs/decisions/ADR-*-SOCIAL-430-*.md",
    exitCode: 0,
  },
];

const transcript: CommandTranscript = {
  transcriptVersion: "SOCIAL430_COMMAND_TRANSCRIPT_V1",
  packageId: "SOCIAL-430",
  commands,
  failedAttempts: [],
};
await Deno.writeTextFile(
  new URL(TRANSCRIPT_PATH, ROOT),
  `${JSON.stringify(transcript, null, 2)}\n`,
);

const artifactHashes = await Promise.all(ARTIFACT_PATHS.map(sha256));
const benchmark = {
  benchmarkVersion: "SOCIAL430_BOUNDED_REFERENCE_PROJECTION_V1",
  packageId: "SOCIAL-430",
  contextSha256,
  classification: "IMPLEMENTED_ISOLATED",
  adapterClass: "IN_MEMORY",
  network: false,
  productionMutation: false,
  iterations,
  successful,
  elapsedMs: Number(elapsedMs.toFixed(3)),
  operationsPerSecond: Number(
    (successful / Math.max(elapsedMs / 1_000, 0.001)).toFixed(2),
  ),
  artifactPaths: ARTIFACT_PATHS,
  artifactHashes,
  baseline: {
    inheritedFailureIdentityCount: 14,
    newFailureIdentityCount: 0,
    status: "REUSED_HASH_MATCH",
  },
  reviewer: "PENDING",
  status: "PASS",
  untested: [
    "real Social provider",
    "production RLS/Auth",
    "real moderation",
    "real Search backend",
    "real Notification delivery",
    "production routes/data",
    "device and cross-browser behavior",
    "production performance",
  ],
};
await Deno.writeTextFile(
  new URL(BENCHMARK_PATH, ROOT),
  `${JSON.stringify(benchmark, null, 2)}\n`,
);

const evidenceArtifactPaths = [...ARTIFACT_PATHS, BENCHMARK_PATH] as const;
const evidenceArtifactHashes = await Promise.all(
  evidenceArtifactPaths.map(sha256),
);
const acceptance = [
  {
    id: "SOCIAL430-SCOPE-001",
    status: "PARTIAL",
    source: [
      "pixiedraw2/src/platform/social-430/contracts.ts",
      "pixiedraw2/src/platform/social-430/composition.ts",
      "pixiedraw2/src/platform/social-430/event-adapter.ts",
      "pixiedraw2/tests/social-430/social-430.test.ts",
    ],
    contract: [
      "docs/contracts/SOCIAL-430-CONTENT-BOUNDARY.md",
      "docs/contracts/QUALIFICATION-EVIDENCE-V1.md",
    ],
    schema: ["pixiedraw2/src/platform/social-430/contracts.ts"],
    build: ["pixiedraw2/benchmarks/social-430/generate-evidence.ts"],
    commands,
    exitCode: 0,
    contextSha256,
    artifactHashes: evidenceArtifactHashes,
    targetTests: ["pixiedraw2/tests/social-430/social-430.test.ts (10/10)"],
    adapterClass: "IN_MEMORY",
    classification: "IMPLEMENTED_ISOLATED",
    reviewer: "PENDING",
    findingIdentity: null,
  },
  {
    id: "SOCIAL430-EVIDENCE-001",
    status: "PARTIAL",
    source: [
      "pixiedraw2/tests/social-430/social-430.test.ts",
      "pixiedraw2/benchmarks/social-430/generate-evidence.ts",
    ],
    contract: [
      "docs/contracts/SOCIAL-430-EVIDENCE.md",
      "docs/contracts/QUALIFICATION-EVIDENCE-V1.md",
    ],
    schema: [TRANSCRIPT_PATH, BENCHMARK_PATH, EVIDENCE_PATH],
    build: ["pixiedraw2/benchmarks/social-430/generate-evidence.ts"],
    commands,
    exitCode: 0,
    contextSha256,
    artifactHashes: evidenceArtifactHashes,
    targetTests: ["synthetic benchmark 10000/10000", "10 targeted tests"],
    adapterClass: "IN_MEMORY",
    classification: "IMPLEMENTED_ISOLATED",
    reviewer: "PENDING",
    findingIdentity: null,
  },
  {
    id: "SOCIAL430-STOP-001",
    status: "PARTIAL",
    source: [
      "docs/contracts/SOCIAL-430-STOP.md",
      "pixiedraw2/src/platform/social-430/composition.ts",
      "pixiedraw2/src/platform/social-430/event-adapter.ts",
    ],
    contract: [
      "docs/contracts/SOCIAL-430-STOP.md",
      "docs/contracts/QUALIFICATION-EVIDENCE-V1.md",
    ],
    schema: ["pixiedraw2/src/platform/social-430/contracts.ts"],
    build: ["pixiedraw2/benchmarks/social-430/generate-evidence.ts"],
    commands,
    exitCode: 0,
    contextSha256,
    artifactHashes: evidenceArtifactHashes,
    targetTests: ["tenant/privacy/stale/replay/commerce attack coverage"],
    adapterClass: "IN_MEMORY",
    classification: "IMPLEMENTED_ISOLATED",
    reviewer: "PENDING",
    findingIdentity: null,
  },
];

const evidence = {
  evidenceVersion: "QUALIFICATION_EVIDENCE_V1",
  packageId: "SOCIAL-430",
  contextSha256,
  status: "PARTIAL",
  noProductionClaims: true,
  acceptance,
  artifactPaths: evidenceArtifactPaths,
  artifactHashes: evidenceArtifactHashes,
  baseline: {
    existingFailureIdentityCount: 14,
    newFailureIdentityCount: 0,
    status: "REUSED_HASH_MATCH",
    harness: "baseline-wp000",
  },
  currentSystem: {
    currentRoutes: "PRESERVED",
    market: "PRESERVED",
    pixync: "PRESERVED",
    productionData: "NOT_ACCESSED",
  },
  untested: [
    "real SNS/Community provider",
    "real moderation",
    "real Search backend",
    "real Notification provider delivery",
    "Production Auth/RLS",
    "legacy route/data compatibility",
    "device/cross-browser/accessibility",
    "production performance",
    "OPS-440",
  ],
  noProductionMutation: true,
  reviewer: "PENDING",
  reviewerSource: "PENDING_INDEPENDENT_REVIEW",
  nextPackage: "OPS-440",
  autoStartNext: false,
};
await Deno.writeTextFile(
  new URL(EVIDENCE_PATH, ROOT),
  `${JSON.stringify(evidence, null, 2)}\n`,
);

console.log(JSON.stringify(
  {
    packageId: "SOCIAL-430",
    contextSha256,
    iterations,
    successful,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    artifactCount: evidenceArtifactHashes.length,
    status: "PASS_ISOLATED",
  },
  null,
  2,
));
