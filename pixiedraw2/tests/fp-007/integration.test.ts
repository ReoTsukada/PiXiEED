import {
  type BuildManifestInput,
  canonicalJson,
  createBuildManifest,
  sha256Hex,
} from "../../src/fp-007/build-manifest.ts";
import { createArtifactRecord } from "../../src/fp-007/artifact-manifest.ts";
import type { CleanRoomAudit } from "../../src/fp-007/clean-room-policy.ts";
import type {
  DependencyFinding,
  DependencyInventory,
  DependencyProjectInventory,
} from "../../src/fp-007/dependency-inventory.ts";
import {
  computeCurrentSystemImpactReceiptDigest,
  createFp007IntegrationEvidence,
  createFp007ReferenceChain,
  FP007_CONTEXT_SHA256,
  FP007_CURRENT_SYSTEM_IMPACT_COMMAND,
  FP007_CURRENT_SYSTEM_IMPACT_SCOPE,
  type Fp007AcceptanceId,
  type Fp007BaselineEvidence,
  type Fp007CommandEvidence,
  type Fp007CurrentSystemImpactReceipt,
  type Fp007IntegrationInput,
  type Fp007QualificationEvidence,
} from "../../src/fp-007/index.ts";
import {
  type CanonicalSchemaRecord,
  type SchemaIdentityInput,
  SchemaRegistry,
} from "../../src/fp-007/schema-registry.ts";
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function hasCode(
  result: { readonly diagnostics: readonly { readonly code: string }[] },
  code: string,
): boolean {
  return result.diagnostics.some((item) => item.code === code);
}

async function fixture(name: string): Promise<Record<string, unknown>> {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(await Deno.readTextFile(url)) as Record<string, unknown>;
}

const ACCEPTANCE_IDS: readonly Fp007AcceptanceId[] = [
  "FP007-SCHEMA-001",
  "FP007-DEP-001",
  "FP007-BUILD-001",
  "FP007-DIST-001",
  "FP007-PROVENANCE-001",
];

const BASELINE: Fp007BaselineEvidence = {
  manifestPath: "docs/inventory/baseline-failure-identity-wp080.json",
  verifierCommand: "node scripts/test-baseline-failure-identity-wp080.mjs",
  fullSuiteManifestPath: "docs/inventory/baseline-suite-wp000.json",
  fullSuiteVerifierCommand: "node scripts/test-baseline-suite-wp000.mjs",
  expectedFailureCount: 14,
  fullSuiteExpectedTotal: 77,
  fullSuiteExpectedPassCount: 63,
  fullSuiteExpectedFailureCount: 14,
  identityFields: ["test", "target", "signature"],
  identityDigest: "a".repeat(64),
  identityCount: 14,
  signatureDigest: "b".repeat(64),
  priorEvidence: "MATCHED_14_NOT_REEXECUTED",
  verificationStatus: "UNTESTED",
  newFailureIdentities: "UNTESTED",
  fullSuiteVerificationStatus: "UNTESTED",
  fullSuiteNewFailureIdentities: "UNTESTED",
};

function qualification(
  status: Fp007QualificationEvidence["status"],
  evidenceLevel: Fp007QualificationEvidence["evidenceLevel"],
  reason: string,
  commandIdentity: string | null = status === "PASS"
    ? QUALIFICATION_COMMANDS["FP007-BUILD-001"]
    : null,
): Fp007QualificationEvidence {
  return { status, evidenceLevel, reason, commandIdentity };
}

const QUALIFICATION_COMMANDS: Readonly<Record<Fp007AcceptanceId, string>> = {
  "FP007-SCHEMA-001":
    "deno test --no-remote --check tests/fp-007/schema-registry.test.ts",
  "FP007-DEP-001":
    "deno test --no-remote --check tests/fp-007/dependency-inventory.test.ts",
  "FP007-BUILD-001":
    "deno test --no-remote --check tests/fp-007/build-manifest.test.ts tests/fp-007/dist-provenance.test.ts",
  "FP007-DIST-001":
    "deno test --no-remote --check tests/fp-007/build-manifest.test.ts tests/fp-007/dist-provenance.test.ts",
  "FP007-PROVENANCE-001":
    "deno test --no-remote --check tests/fp-007/build-manifest.test.ts tests/fp-007/dist-provenance.test.ts",
};

function schemaIdentityInput(
  record: CanonicalSchemaRecord,
): SchemaIdentityInput {
  return {
    name: record.name,
    exactVersion: record.exactVersion,
    digest: record.digest,
  };
}

type MutableBuildManifestInput = {
  -readonly [Key in keyof BuildManifestInput]: BuildManifestInput[Key];
};

function isolatedQualifications(): Readonly<
  Record<Fp007AcceptanceId, Fp007QualificationEvidence>
> {
  return Object.fromEntries(ACCEPTANCE_IDS.map((id) => [
    id,
    qualification(
      "PASS",
      "ISOLATED_REFERENCE",
      "Deterministic isolated reference fixture completed.",
      QUALIFICATION_COMMANDS[id],
    ),
  ])) as Readonly<Record<Fp007AcceptanceId, Fp007QualificationEvidence>>;
}

function realQualifications(): Readonly<
  Record<Fp007AcceptanceId, Fp007QualificationEvidence>
> {
  return Object.fromEntries(ACCEPTANCE_IDS.map((id) => [
    id,
    qualification(
      "UNTESTED",
      "UNTESTED",
      "Real repository qualification was not executed in this isolated test.",
      null,
    ),
  ])) as Readonly<Record<Fp007AcceptanceId, Fp007QualificationEvidence>>;
}

async function currentSystemImpactReceipt(
  overrides: Partial<Fp007CurrentSystemImpactReceipt> = {},
): Promise<Fp007CurrentSystemImpactReceipt> {
  const receipt: Fp007CurrentSystemImpactReceipt = {
    scope: [...FP007_CURRENT_SYSTEM_IMPACT_SCOPE],
    commandIdentity: FP007_CURRENT_SYSTEM_IMPACT_COMMAND,
    qualification: "EXECUTED",
    exitCode: 0,
    resultDigest: null,
    inspectedPaths: [
      "current-routes",
      "pixiedraw",
      "pxd",
      "pixisync",
      "market",
    ],
    workspaceState: "clean",
    unresolvedDiffs: false,
    ...overrides,
  };
  return {
    ...receipt,
    resultDigest: await computeCurrentSystemImpactReceiptDigest(receipt),
  };
}

async function commandEvidence(): Promise<readonly Fp007CommandEvidence[]> {
  const records = [
    {
      command: QUALIFICATION_COMMANDS["FP007-SCHEMA-001"],
      testCount: 5,
    },
    {
      command: QUALIFICATION_COMMANDS["FP007-DEP-001"],
      testCount: 7,
    },
    {
      command: QUALIFICATION_COMMANDS["FP007-BUILD-001"],
      testCount: 11,
    },
    {
      command:
        "deno test --no-remote --allow-read tests/fp-007/integration.test.ts",
      testCount: 10,
    },
  ];
  return await Promise.all(records.map(async (record) => ({
    ...record,
    scope: "ISOLATED_REFERENCE" as const,
    qualification: "EXECUTED" as const,
    exitCode: 0,
    resultDigest: await sha256Hex(
      canonicalJson({ ...record, exitCode: 0, status: "PASS" }),
    ),
    artifactDigest: await sha256Hex(
      canonicalJson({
        command: record.command,
        testCount: record.testCount,
        artifacts: ["fp-007-test-output"],
      }),
    ),
    status: "PASS" as const,
  })));
}

function cleanRoom(
  status: CleanRoomAudit["status"] = "PASS",
  findings: readonly CleanRoomAudit["findings"][number][] = [],
): CleanRoomAudit {
  return {
    documentId: "PIXIEED-FP007-CLEAN-ROOM-001",
    deterministic: true,
    findings,
    status,
  };
}

function dependencyInventory(
  overrides: Partial<DependencyInventory> = {},
): DependencyInventory {
  const project: DependencyProjectInventory = {
    projectPath: ".",
    manifestPath: "package.json",
    lockfilePath: "package-lock.json",
    lockfilePresent: true,
    lockfileHash: "a".repeat(64),
    manifestDependencies: [{
      name: "fixture-package",
      declaration: "1.2.3",
      group: "dependencies",
      kind: "npm",
    }],
    resolvedDependencies: [{
      name: "fixture-package",
      declaration: "1.2.3",
      version: "1.2.3",
      scope: "direct",
      kind: "npm",
      origin: "registry",
      registry: "registry.npmjs.org",
      license: "MIT",
      vulnerability: "REVIEWED_NONE",
      lockResolved: true,
    }],
    toolchain: { node: "20.0.0" },
    findings: [],
    status: "PASS",
  };
  return {
    documentId: "PIXIEED-FP007-DEPENDENCY-INVENTORY-001",
    schemaVersion: "1",
    repository: "PiXiEED",
    mode: "offline-read-only",
    deterministic: true,
    network: "disabled",
    projects: [project],
    findings: [],
    status: "PASS",
    ...overrides,
  };
}

async function registryFixture(): Promise<{
  readonly registry: SchemaRegistry;
  readonly record: CanonicalSchemaRecord;
  readonly caller: Record<string, unknown>;
}> {
  const caller = await fixture("schema-canonical-v1.json");
  const compatible = await fixture("schema-canonical-v2-compatible.json");
  const result = await SchemaRegistry.create([caller, compatible]);
  assert(result.ok, "canonical schema fixtures must register");
  const record = result.value.list().find((item) =>
    item.exactVersion === "1.0.0"
  );
  assert(record !== undefined, "canonical v1 record must be registered");
  return { registry: result.value, record, caller };
}

async function baseInput(): Promise<Fp007IntegrationInput> {
  const { registry, record, caller } = await registryFixture();
  const inventory = dependencyInventory();
  const chain = await createFp007ReferenceChain({
    schemaRegistry: registry,
    schemaIdentity: schemaIdentityInput(record),
    dependencyInventory: inventory,
    allowlistedEnvironmentHash: "b".repeat(64),
  });
  return {
    contextSha256: FP007_CONTEXT_SHA256,
    schemaRegistry: registry,
    callerSchema: caller,
    expectedSchemaIdentity: schemaIdentityInput(record),
    dependencyInventory: inventory,
    cleanRoom: cleanRoom(),
    buildManifest: chain.buildManifest,
    buildManifestHash: chain.buildManifestHash,
    artifactManifest: chain.artifactManifest,
    artifactManifestHash: chain.artifactManifestHash,
    provenance: chain.provenance,
    repeatBuild: chain.repeatBuild,
    isolatedFixtureStatuses: isolatedQualifications(),
    realRepoQualification: realQualifications(),
    commands: await commandEvidence(),
    baseline: BASELINE,
  };
}

function withRealQualification(
  input: Fp007IntegrationInput,
  id: Fp007AcceptanceId,
  value: Fp007QualificationEvidence,
): Fp007IntegrationInput {
  return {
    ...input,
    realRepoQualification: { ...input.realRepoQualification, [id]: value },
  };
}

function buildInputFromManifest(
  manifest: Fp007IntegrationInput["buildManifest"],
): BuildManifestInput {
  return {
    buildCommand: manifest.buildCommand,
    entries: manifest.entries,
    initialChunks: manifest.initialChunks,
    lazyChunks: manifest.lazyChunks,
    sourceMapPolicy: manifest.sourceMapPolicy,
    sourceFiles: manifest.sourceFiles,
    declaredArtifacts: manifest.declaredArtifacts,
    schemaRegistryDigest: manifest.deterministicInputs.schemaRegistryDigest,
    dependencyGraphHash: manifest.deterministicInputs.dependencyGraphHash,
    lockfileHash: manifest.deterministicInputs.lockfileHash,
    toolchainHash: manifest.deterministicInputs.toolchainHash,
    allowlistedEnvironmentHash:
      manifest.deterministicInputs.allowlistedEnvironmentHash,
  };
}

async function rebuiltWith(
  input: Fp007IntegrationInput,
  mutate: (draft: MutableBuildManifestInput) => void,
): Promise<Fp007IntegrationInput> {
  const draft: MutableBuildManifestInput = {
    ...buildInputFromManifest(input.buildManifest),
  };
  mutate(draft);
  const result = await createBuildManifest(draft);
  assert(
    result.ok,
    `mutated manifest fixture must remain structurally valid: ${
      result.diagnostics.map((item) => item.message).join("; ")
    }`,
  );
  return {
    ...input,
    buildManifest: result.value.manifest,
    buildManifestHash: result.value.manifestHash,
  };
}

Deno.test("FP-007 integration keeps analyzer, isolated fixture, and real-repository qualification separate", async () => {
  const result = await createFp007IntegrationEvidence(await baseInput());
  assert(
    result.ok,
    `normal integration must produce evidence: ${
      result.diagnostics.map((item) => item.detail).join("; ")
    }`,
  );
  assert(
    result.value.acceptances.length === 5,
    "all five acceptance records must be present",
  );
  assert(
    result.value.acceptances.every((item) =>
      item.analyzer.execution === "PASS"
    ),
    "each analyzer execution must be recorded",
  );
  assert(
    result.value.acceptances.every((item) =>
      item.isolatedFixture.status === "PASS"
    ),
    "isolated fixtures must pass",
  );
  assert(
    result.value.acceptances.every((item) =>
      item.realRepoQualification.status === "UNTESTED"
    ),
    "real repository qualification must remain untested",
  );
  assert(
    result.value.status === "UNTESTED",
    "isolated PASS must not become a real repository PASS",
  );
  assert(
    result.value.chain.schemaRegistryDigest.length === 64 &&
      result.value.chain.provenanceHash.length === 64,
    "cross-track chain hashes must be present",
  );
  assert(
    result.value.repeatBuild.status === "PASS" &&
      result.value.repeatBuild.comparison === "PASS",
    "repeat-build qualification must be included in the evidence chain",
  );
  assert(
    result.value.totalTestCount === 33,
    "command test counts must be summed deterministically",
  );
});

Deno.test("FP-007 integration rejects unknown schema identities and ignores forged caller bodies", async () => {
  const input = await baseInput();
  const forged = {
    ...(input.callerSchema as Record<string, unknown>),
    owner: "attacker",
    fields: {},
  };
  const forgedResult = await createFp007IntegrationEvidence({
    ...input,
    callerSchema: forged,
  });
  assert(
    forgedResult.ok,
    "a forged body with a valid registered identity must be re-resolved to canonical authority",
  );

  const unknown = await createFp007IntegrationEvidence({
    ...input,
    callerSchema: {
      ...(input.callerSchema as Record<string, unknown>),
      name: "unknown.schema",
    },
    expectedSchemaIdentity: {
      ...input.expectedSchemaIdentity,
      name: "unknown.schema",
    },
  });
  assert(
    !unknown.ok && hasCode(unknown, "UNKNOWN_SCHEMA_NAME"),
    "unknown schema names must fail closed",
  );
});

Deno.test("FP-007 integration rejects floating dependency declarations through the digest chain", async () => {
  const input = await baseInput();
  const finding: DependencyFinding = {
    code: "FLOATING_MANIFEST_RANGE",
    status: "FAIL",
    subject: "package.json:fixture-package",
    detail: "Fixture dependency declaration is floating.",
  };
  const baseProject = input.dependencyInventory.projects[0];
  assert(baseProject !== undefined, "base dependency project must exist");
  const inventory = dependencyInventory({
    projects: [{
      ...baseProject,
      manifestDependencies: [{
        name: "fixture-package",
        declaration: "^1.2.3",
        group: "dependencies",
        kind: "npm",
      }],
      findings: [finding],
      status: "FAIL",
    }],
    findings: [finding],
    status: "FAIL",
  });
  const result = await createFp007IntegrationEvidence({
    ...input,
    dependencyInventory: inventory,
  });
  assert(
    !result.ok && hasCode(result, "DEPENDENCY_GRAPH_HASH_MISMATCH"),
    "floating dependency input must invalidate the build chain",
  );
});

Deno.test("FP-007 integration rejects lock mismatch even when a structurally valid manifest is supplied", async () => {
  const input = await baseInput();
  const mutated = await rebuiltWith(input, (draft) => {
    draft.lockfileHash = "f".repeat(64);
  });
  const result = await createFp007IntegrationEvidence(mutated);
  assert(
    !result.ok && hasCode(result, "DEPENDENCY_LOCK_HASH_MISMATCH"),
    "lock digest mismatch must fail closed",
  );
});

Deno.test("FP-007 integration records dirty clean-room as a real-repository blocker", async () => {
  const input = await baseInput();
  const dirtyFinding = {
    code: "DIRTY_WORKTREE",
    status: "BLOCKED" as const,
    subject: "worktree",
    detail: "A clean checkout was not available.",
  };
  const result = await createFp007IntegrationEvidence(withRealQualification(
    { ...input, cleanRoom: cleanRoom("BLOCKED", [dirtyFinding]) },
    "FP007-BUILD-001",
    qualification(
      "BLOCKED",
      "REAL_REPOSITORY",
      "Dirty worktree prevents real clean-checkout qualification.",
    ),
  ));
  assert(
    result.ok,
    "a current-repository blocker is evidence, not an integration schema error",
  );
  assert(
    result.value.status === "BLOCKED",
    "dirty clean-room must block release qualification",
  );
  assert(
    result.value.findings.byCode.DIRTY_WORKTREE === 1,
    "dirty worktree identity must be retained",
  );
});

Deno.test("FP-007 build manifest rejects timestamps, absolute paths, and lazy-to-initial contamination", async () => {
  const input = await baseInput();
  const timestamp = await createBuildManifest({
    ...buildInputFromManifest(input.buildManifest),
    generatedAt: "2026-08-11T00:00:00Z",
  } as unknown as BuildManifestInput);
  assert(
    !timestamp.ok && hasCode(timestamp, "FORBIDDEN_CANONICAL_INPUT"),
    "timestamps must not enter canonical build inputs",
  );

  const absolute = await createBuildManifest({
    ...buildInputFromManifest(input.buildManifest),
    buildCommand: ["fixture-build", "/Users/attacker/dist/entry.js"],
  });
  assert(
    !absolute.ok && hasCode(absolute, "INVALID_COMMAND"),
    "absolute paths must fail closed",
  );

  const overlap = await createBuildManifest({
    ...buildInputFromManifest(input.buildManifest),
    lazyChunks: ["dist/entry.js"],
  });
  assert(
    !overlap.ok && hasCode(overlap, "INITIAL_LAZY_OVERLAP"),
    "lazy-to-initial contamination must fail closed",
  );
});

Deno.test("FP-007 integration rejects source mutation and toolchain/environment changes in provenance", async () => {
  const input = await baseInput();
  const baseSource = input.buildManifest.sourceFiles[0];
  assert(baseSource !== undefined, "base source fixture must exist");
  const sourceChanged = await rebuiltWith(input, (draft) => {
    draft.sourceFiles = [{
      ...baseSource,
      sha256: "c".repeat(64),
    }];
  });
  const sourceResult = await createFp007IntegrationEvidence(sourceChanged);
  assert(
    !sourceResult.ok && hasCode(sourceResult, "PROVENANCE_BUILD_LINK_MISMATCH"),
    "source mutation must invalidate the existing provenance link",
  );

  const toolchainChanged = await rebuiltWith(input, (draft) => {
    draft.toolchainHash = "d".repeat(64);
  });
  const toolchainResult = await createFp007IntegrationEvidence(
    toolchainChanged,
  );
  assert(
    !toolchainResult.ok && hasCode(toolchainResult, "TOOLCHAIN_HASH_MISMATCH"),
    "toolchain changes must invalidate deterministic inputs",
  );

  const environmentChanged = await rebuiltWith(input, (draft) => {
    draft.allowlistedEnvironmentHash = "e".repeat(64);
  });
  const environmentResult = await createFp007IntegrationEvidence(
    environmentChanged,
  );
  assert(
    !environmentResult.ok &&
      hasCode(environmentResult, "ENVIRONMENT_HASH_MISMATCH"),
    "environment changes must be explicitly diagnosed",
  );
});

Deno.test("FP-007 integration rejects contradictory repeat-build success", async () => {
  const input = await baseInput();
  const result = await createFp007IntegrationEvidence({
    ...input,
    repeatBuild: {
      ...input.repeatBuild,
      comparison: { ...input.repeatBuild.comparison, status: "FAIL" },
    },
  });
  assert(
    !result.ok && hasCode(result, "REPEAT_BUILD_INVALID"),
    "contradictory repeat-build evidence must fail closed",
  );
});

Deno.test("FP-007 artifact boundary rejects secret-like content and invalid provenance artifacts", async () => {
  const secret = await createArtifactRecord({
    path: "dist/secret.txt",
    role: "ASSET",
    compression: "NONE",
    content: new TextEncoder().encode("api_key=1234567890"),
  });
  assert(
    !secret.ok && hasCode(secret, "SECRET_BEARING_ARTIFACT"),
    "secret-like artifact content must not be inventoried",
  );

  const input = await baseInput();
  const baseArtifact = input.artifactManifest.artifacts[0];
  assert(baseArtifact !== undefined, "base artifact fixture must exist");
  const invalidArtifactManifest = {
    ...input.artifactManifest,
    artifacts: [{
      ...baseArtifact,
      path: "/Users/attacker/dist.js",
    }],
  };
  const result = await createFp007IntegrationEvidence({
    ...input,
    artifactManifest: invalidArtifactManifest,
  });
  assert(
    !result.ok && hasCode(result, "ARTIFACT_PATH_INVALID"),
    "absolute artifact paths must fail closed",
  );
});

Deno.test("FP-007 canonical evidence serialization excludes ambient identity and remains repeatable", async () => {
  const first = await createFp007IntegrationEvidence(await baseInput());
  const second = await createFp007IntegrationEvidence(await baseInput());
  assert(first.ok && second.ok, "repeat evidence fixture must be valid");
  assert(
    canonicalJson(first.value) === canonicalJson(second.value),
    "same deterministic inputs must produce byte-identical evidence",
  );
  const serialized = canonicalJson(first.value);
  assert(
    !serialized.includes("/Users/") && !serialized.includes("generatedAt") &&
      !serialized.includes("@example.com"),
    "evidence must not contain ambient path/time/address data",
  );
  assert(
    await sha256Hex(serialized) ===
      await sha256Hex(canonicalJson(second.value)),
    "evidence digest must be deterministic",
  );

  const evidence = JSON.parse(
    await Deno.readTextFile(
      new URL("../../../docs/inventory/fp-007-evidence.json", import.meta.url),
    ),
  ) as {
    readonly commands?: readonly {
      readonly command?: string;
      readonly testCount?: number | null;
    }[];
    readonly totalTestCount?: number;
  };
  const suiteCommand = evidence.commands?.find((item) =>
    item.command === "deno test -A pixiedraw2/tests/fp-007"
  );
  assert(
    suiteCommand?.testCount === 94 && evidence.totalTestCount === 94,
    "checked-in evidence must record the current 94-test FP-007 suite",
  );

  const contract = await Deno.readTextFile(
    new URL("../../../docs/contracts/FP-007-INTEGRATION.md", import.meta.url),
  );
  assert(
    contract.includes("deno test -A pixiedraw2/tests/fp-007") &&
      contract.includes("94 passing FP-007 tests") &&
      !contract.includes("80 passing FP-007 tests") &&
      !contract.includes("82 passing FP-007 tests"),
    "integration contract must retain the current 94-test command and count",
  );

  const buildEvidence = JSON.parse(
    await Deno.readTextFile(
      new URL("../../../docs/inventory/fp-007-build.json", import.meta.url),
    ),
  ) as {
    readonly existingRepositoryFindings?: readonly {
      readonly path?: string;
      readonly status?: string;
      readonly resolution?: string;
    }[];
  };
  const stagingFinding = buildEvidence.existingRepositoryFindings?.find((
    item,
  ) =>
    item.path === "app-shell/pixieed-capacitor/scripts/stage-web-assets.mjs"
  );
  assert(
    stagingFinding?.status === "RESOLVED_BY_CURRENT_SOURCE" &&
      stagingFinding.resolution?.includes("repository-relative") &&
      stagingFinding.resolution.includes("no generatedAt") &&
      stagingFinding.resolution.includes("UNTESTED"),
    "historical staging finding must be resolved by current source evidence without qualifying real distribution",
  );
});

Deno.test("FP-007 evidence rejects forged PASS claims and isolated evidence promoted to real repository", async () => {
  const input = await baseInput();
  const forgedCommands = input.commands.map((item, index) =>
    index === 0 ? { ...item, exitCode: 1 } : item
  );
  const forgedPass = await createFp007IntegrationEvidence({
    ...input,
    commands: forgedCommands,
  });
  assert(
    !forgedPass.ok && hasCode(forgedPass, "COMMAND_EVIDENCE_INCONSISTENT"),
    "a PASS command with a non-zero exit code must be rejected",
  );

  const promoted = await createFp007IntegrationEvidence(
    withRealQualification(
      input,
      "FP007-SCHEMA-001",
      qualification(
        "PASS",
        "REAL_REPOSITORY",
        "Caller claims a real repository qualification without a real command.",
        QUALIFICATION_COMMANDS["FP007-SCHEMA-001"],
      ),
    ),
  );
  assert(
    !promoted.ok && hasCode(promoted, "QUALIFICATION_COMMAND_MISMATCH"),
    "isolated command evidence must not qualify a real repository PASS",
  );
});

Deno.test("FP-007 evidence rejects incomplete retained baseline identity proof", async () => {
  const input = await baseInput();
  const result = await createFp007IntegrationEvidence({
    ...input,
    baseline: { ...input.baseline, signatureDigest: "not-a-digest" },
  });
  assert(
    !result.ok && hasCode(result, "BASELINE_EVIDENCE_INCOMPLETE"),
    "baseline identity count and signature digest are mandatory evidence",
  );
});

Deno.test("FP-007 evidence accepts an independently executed 63/77 baseline", async () => {
  const input = await baseInput();
  const result = await createFp007IntegrationEvidence({
    ...input,
    baseline: {
      ...input.baseline,
      priorEvidence: "MATCHED_14_REEXECUTED",
      verificationStatus: "PASS",
      newFailureIdentities: "ZERO",
      fullSuiteVerificationStatus: "PASS",
      fullSuiteNewFailureIdentities: "ZERO",
    },
  });
  assert(
    result.ok,
    "measured 14-identity and 63/77 baseline evidence must be accepted",
  );
});

Deno.test("FP-007 evidence rejects a claimed full-suite pass with new failures", async () => {
  const input = await baseInput();
  const result = await createFp007IntegrationEvidence({
    ...input,
    baseline: {
      ...input.baseline,
      priorEvidence: "MATCHED_14_REEXECUTED",
      verificationStatus: "PASS",
      newFailureIdentities: "ZERO",
      fullSuiteVerificationStatus: "PASS",
      fullSuiteNewFailureIdentities: "UNTESTED",
    },
  });
  assert(
    !result.ok && hasCode(result, "BASELINE_EVIDENCE_INCOMPLETE"),
    "a full-suite pass without zero new failures must be rejected",
  );
});

Deno.test("FP-007 current-system impact stays fail closed without server adapter", async () => {
  const input = await baseInput();
  const untested = await createFp007IntegrationEvidence(input);
  assert(untested.ok, "missing impact receipt must remain valid evidence");
  assert(
    Object.values(untested.value.currentSystemImpact).slice(0, 5).every((
      value,
    ) => value === "UNTESTED"),
    "missing receipt must never produce UNCHANGED",
  );

  const diagnosticOnlyReceipt = await currentSystemImpactReceipt();
  const blocked = await createFp007IntegrationEvidence({
    ...input,
    currentSystemImpactReceipt: diagnosticOnlyReceipt,
  });
  assert(
    !blocked.ok && hasCode(blocked, "CURRENT_SYSTEM_IMPACT_PROOF_REQUIRED"),
    "a client/reference receipt without a separately issued server proof must block",
  );

  const forged = await createFp007IntegrationEvidence({
    ...input,
    currentSystemImpactReceipt: {
      ...diagnosticOnlyReceipt,
      resultDigest: "a".repeat(64),
    },
  });
  assert(
    !forged.ok && hasCode(forged, "CURRENT_SYSTEM_IMPACT_RECEIPT_INVALID"),
    "a forged receipt digest must be rejected",
  );

  const scopeSwap = await createFp007IntegrationEvidence({
    ...input,
    currentSystemImpactReceipt: {
      ...diagnosticOnlyReceipt,
      scope: [
        "CURRENT_ROUTES",
        "CURRENT_PIXIEEDRAW",
        "PXD",
        "PIXISYNC",
        "OTHER",
      ],
    },
  });
  assert(
    !scopeSwap.ok &&
      hasCode(scopeSwap, "CURRENT_SYSTEM_IMPACT_RECEIPT_INVALID"),
    "a scope-swapped receipt must be rejected",
  );

  const notExecuted = await createFp007IntegrationEvidence({
    ...input,
    currentSystemImpactReceipt: {
      ...diagnosticOnlyReceipt,
      qualification: "NOT_EXECUTED",
      exitCode: null,
    },
  });
  assert(
    !notExecuted.ok &&
      hasCode(notExecuted, "CURRENT_SYSTEM_IMPACT_RECEIPT_INVALID"),
    "an unexecuted receipt must be rejected",
  );

  const dirty = await createFp007IntegrationEvidence({
    ...input,
    currentSystemImpactReceipt: {
      ...diagnosticOnlyReceipt,
      workspaceState: "dirty",
      unresolvedDiffs: true,
    },
  });
  assert(
    !dirty.ok && hasCode(dirty, "CURRENT_SYSTEM_IMPACT_RECEIPT_INVALID"),
    "dirty or unresolved receipt state must be rejected",
  );
});
