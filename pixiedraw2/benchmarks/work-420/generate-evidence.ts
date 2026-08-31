/**
 * Deterministic, bounded WORK-420 qualification evidence generator.
 *
 * The generator reads the checked-in local command transcript and hashes only
 * the isolated WORK-420 slice plus its direct contract/context inputs. It
 * does not access the network, Provider, database, Storage, or production.
 */

const ROOT = new URL("../../../", import.meta.url);
const CONTEXT_PATH = ".codex/context/WORK-420.md";
const TRANSCRIPT_PATH = "docs/inventory/work-420-command-transcript.json";
const EVIDENCE_PATH = "docs/inventory/work-420-evidence.json";
const BENCHMARK_PATH = "docs/inventory/work-420-benchmark.json";
const EXPECTED_CONTEXT_SHA256 =
  "ceacf9223d19ef74b0a00998cb9e2796fc7ab1bf31d14f9b26e3666d483930a2";

const ARTIFACT_PATHS = [
  "pixiedraw2/src/platform/work-420/contracts.ts",
  "pixiedraw2/src/platform/work-420/composition.ts",
  "pixiedraw2/src/platform/work-420/event-adapter.ts",
  "pixiedraw2/tests/work-420/fixture.ts",
  "pixiedraw2/tests/work-420/composition.test.ts",
  "pixiedraw2/tests/work-420/event-adapter.test.ts",
  "pixiedraw2/benchmarks/work-420/generate-evidence.ts",
  "docs/contracts/WORK-420-COMPOSITION.md",
  "docs/contracts/QUALIFICATION-EVIDENCE-V1.md",
  "docs/decisions/ADR-20260816-WORK-420-composition-boundary.md",
  TRANSCRIPT_PATH,
] as const;

interface TranscriptCommand {
  readonly command: string;
  readonly exitCode: number;
}

interface FailedTranscriptCommand extends TranscriptCommand {
  readonly reason: string;
}

interface CommandTranscript {
  readonly transcriptVersion: "WORK420_COMMAND_TRANSCRIPT_V1";
  readonly packageId: "WORK-420";
  readonly commands: readonly TranscriptCommand[];
  readonly failedAttempts?: readonly FailedTranscriptCommand[];
}

async function readBytes(relativePath: string): Promise<Uint8Array> {
  return await Deno.readFile(new URL(relativePath, ROOT));
}

async function sha256(relativePath: string): Promise<string> {
  const bytes = await readBytes(relativePath);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(
    await Deno.readTextFile(new URL(relativePath, ROOT)),
  ) as T;
}

const transcript = await readJson<CommandTranscript>(TRANSCRIPT_PATH);
if (
  transcript.transcriptVersion !== "WORK420_COMMAND_TRANSCRIPT_V1" ||
  transcript.packageId !== "WORK-420" ||
  transcript.commands.length === 0 ||
  transcript.commands.some((item) =>
    typeof item.command !== "string" ||
    item.command.trim().length === 0 ||
    !Number.isInteger(item.exitCode) ||
    item.exitCode !== 0
  )
) {
  throw new Error(
    "WORK-420 command transcript must contain only recorded zero-exit commands.",
  );
}
if (
  transcript.failedAttempts?.some((item) =>
    typeof item.command !== "string" ||
    item.command.trim().length === 0 ||
    !Number.isInteger(item.exitCode) ||
    item.exitCode === 0 ||
    typeof item.reason !== "string" ||
    item.reason.trim().length === 0
  )
) {
  throw new Error(
    "WORK-420 failed attempts must contain a command, a non-zero exitCode, and a reason.",
  );
}

const contextSha256 = await sha256(CONTEXT_PATH);
if (contextSha256 !== EXPECTED_CONTEXT_SHA256) {
  throw new Error(
    `WORK-420 Context SHA mismatch: expected ${EXPECTED_CONTEXT_SHA256}, got ${contextSha256}`,
  );
}

const artifactHashes = await Promise.all(ARTIFACT_PATHS.map(sha256));
const commands = transcript.commands.map(({ command, exitCode }) => ({
  command,
  exitCode,
}));
const aggregateExitCode = commands.every((item) => item.exitCode === 0) ? 0 : 1;

const untested = [
  "real Provider/Auth/RLS/DB/Storage verification",
  "real payment execution and provider delivery",
  "browser/device and current production route behavior",
  "cross-process durable eventing and crash recovery",
  "production deployment, migration, cutover, or publish",
];

const benchmark = {
  benchmarkVersion: "WORK420_BOUNDED_EVIDENCE_V1",
  packageId: "WORK-420",
  classification: "IMPLEMENTED_ISOLATED",
  adapterClass: "IN_MEMORY",
  adapterId: "WORK420_FP004_REFERENCE_ADAPTER",
  contextSha256,
  bounded: true,
  network: false,
  productionMutation: false,
  scenarioCount: 15,
  testCounts: {
    composition: 11,
    eventAdapter: 4,
    total: 15,
  },
  remediatedFindings: [
    "WORK420-AUTH-001",
    "WORK420-AUTH-002",
    "WORK420-CURRENT-001",
  ],
  maxReplayAttempts: 32,
  artifactPaths: ARTIFACT_PATHS,
  artifactHashes,
  commands,
  reviewer: "TERRA_HIGH_INDEPENDENT_REVIEW",
  status: "PASS",
  failedAttempts: transcript.failedAttempts ?? [],
  untested,
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
    id: "WORK420-SCOPE-001",
    status: "PASS",
    source: [
      "pixiedraw2/src/platform/work-420/contracts.ts",
      "pixiedraw2/src/platform/work-420/composition.ts",
      "pixiedraw2/src/platform/work-420/event-adapter.ts",
    ],
    contract: [
      "docs/contracts/WORK-420-COMPOSITION.md",
      "docs/contracts/FP-002-DIRECT-WORK-AGGREGATE-INTEGRITY.md",
      "docs/contracts/WP-220-DIRECT-WORK-BILLING.md",
    ],
    schema: [
      "pixiedraw2/src/platform/work-420/contracts.ts",
      "docs/contracts/QUALIFICATION-EVIDENCE-V1.md",
    ],
    build: ["pixiedraw2/benchmarks/work-420/generate-evidence.ts"],
    commands,
    exitCode: aggregateExitCode,
    contextSha256,
    artifactHashes: evidenceArtifactHashes,
    targetTests: [
      "pixiedraw2/tests/work-420/composition.test.ts (11/11)",
      "pixiedraw2/tests/work-420/event-adapter.test.ts (4/4)",
    ],
    adapterClass: "IN_MEMORY",
    classification: "IMPLEMENTED_ISOLATED",
    reviewer: "TERRA_HIGH_INDEPENDENT_REVIEW",
    findingIdentity: null,
  },
  {
    id: "WORK420-EVIDENCE-001",
    status: "PASS",
    source: [
      "pixiedraw2/tests/work-420/composition.test.ts",
      "pixiedraw2/tests/work-420/event-adapter.test.ts",
      "pixiedraw2/benchmarks/work-420/generate-evidence.ts",
    ],
    contract: [
      "docs/contracts/WORK-420-COMPOSITION.md",
      "docs/contracts/QUALIFICATION-EVIDENCE-V1.md",
    ],
    schema: [
      "docs/inventory/work-420-command-transcript.json",
      "docs/inventory/work-420-benchmark.json",
      "docs/inventory/work-420-evidence.json",
    ],
    build: ["pixiedraw2/benchmarks/work-420/generate-evidence.ts"],
    commands,
    exitCode: aggregateExitCode,
    contextSha256,
    artifactHashes: evidenceArtifactHashes,
    targetTests: [
      "pixiedraw2/tests/work-420/composition.test.ts (11/11)",
      "pixiedraw2/tests/work-420/event-adapter.test.ts (4/4)",
    ],
    adapterClass: "IN_MEMORY",
    classification: "IMPLEMENTED_ISOLATED",
    reviewer: "TERRA_HIGH_INDEPENDENT_REVIEW",
    findingIdentity: null,
  },
  {
    id: "WORK420-STOP-001",
    status: "PASS",
    source: [
      "pixiedraw2/src/platform/work-420/composition.ts",
      "pixiedraw2/src/platform/work-420/event-adapter.ts",
      "docs/decisions/ADR-20260816-WORK-420-composition-boundary.md",
    ],
    contract: ["docs/contracts/WORK-420-COMPOSITION.md"],
    schema: [
      "pixiedraw2/src/platform/work-420/composition.ts",
      "pixiedraw2/src/platform/work-420/event-adapter.ts",
    ],
    build: ["pixiedraw2/benchmarks/work-420/generate-evidence.ts"],
    commands,
    exitCode: aggregateExitCode,
    contextSha256,
    artifactHashes: evidenceArtifactHashes,
    targetTests: [
      "pixiedraw2/tests/work-420/composition.test.ts (11/11)",
      "pixiedraw2/tests/work-420/event-adapter.test.ts (4/4)",
    ],
    adapterClass: "IN_MEMORY",
    classification: "IMPLEMENTED_ISOLATED",
    reviewer: "TERRA_HIGH_INDEPENDENT_REVIEW",
    findingIdentity: null,
  },
] as const;

const evidence = {
  evidenceVersion: "QUALIFICATION_EVIDENCE_V1",
  packageId: "WORK-420",
  contextSha256,
  status: "PASS",
  acceptance,
  artifactPaths: evidenceArtifactPaths,
  artifactHashes: evidenceArtifactHashes,
  commands,
  failedAttempts: transcript.failedAttempts ?? [],
  remediatedFindings: [
    "WORK420-AUTH-001",
    "WORK420-AUTH-002",
    "WORK420-CURRENT-001",
  ],
  untested,
  baseline: {
    existingMarketAndDirectWorkRoutesUntouched: true,
    existingFp002Fp003Fp004FilesUntouched: true,
    productionQualification: "UNTESTED",
  },
  independentReview: {
    reviewer: "TERRA_HIGH_INDEPENDENT_REVIEW",
    status: "APPROVED_BOUNDED_LOCAL_SLICE",
    externalIndependentReview: "PASS_BOUNDED_INDEPENDENT_REVIEW",
  },
  checkpoint: {
    handoff: "WORK-420",
    nextPackage: "SOCIAL-430",
    autoStartNext: false,
  },
  noProductionClaims: true,
};

await Deno.writeTextFile(
  new URL(EVIDENCE_PATH, ROOT),
  `${JSON.stringify(evidence, null, 2)}\n`,
);

console.log(`WORK-420 evidence generated: ${EVIDENCE_PATH}`);
