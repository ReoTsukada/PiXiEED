import {
  createNpmAuditReceiptArtifact,
  loadNpmAuditReceiptArtifact,
  type NpmAuditArtifactEntry,
  parseNpmAuditJsonInMemory,
  serializeNpmAuditReceiptArtifact,
  writeNpmAuditReceiptArtifact,
} from "../../src/fp-007/npm-audit-receipt-artifact.ts";
import {
  NPM_AUDIT_COMMAND_IDENTITY,
  NPM_AUDIT_SCOPE_IDS,
  scanRepository,
} from "../../src/fp-007/dependency-inventory.ts";

function assert(value: boolean, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

const hashes = Object.fromEntries(
  NPM_AUDIT_SCOPE_IDS.map((scope) => [scope, "a".repeat(64)]),
);

function runner(
  scopeId: typeof NPM_AUDIT_SCOPE_IDS[number],
  exitCode = 0,
  total = 0,
) {
  const lockfileSha256 = hashes[scopeId];
  assert(lockfileSha256 !== undefined);
  return parseNpmAuditJsonInMemory({
    scopeId,
    lockfilePath: scopeId === "root"
      ? "package-lock.json"
      : `${scopeId}/package-lock.json`,
    lockfileSha256,
    exitCode,
    stdout: JSON.stringify({
      metadata: {
        vulnerabilities: {
          total,
          low: total,
          moderate: 0,
          high: 0,
          critical: 0,
        },
      },
    }),
    evidenceId: `synthetic-${scopeId.replaceAll("/", "-")}`,
  });
}

function entry(
  scopeId: typeof NPM_AUDIT_SCOPE_IDS[number],
  exitCode = 0,
  total = 0,
): NpmAuditArtifactEntry {
  const result = runner(scopeId, exitCode, total);
  assert("receipt" in result);
  return {
    scopeId,
    execution: {
      commandIdentity: NPM_AUDIT_COMMAND_IDENTITY,
      exitClassification: total === 0 ? "ZERO_COUNTS" : "NONZERO_COUNTS",
      evidenceId: `synthetic-${scopeId.replaceAll("/", "-")}`,
    },
    receipt: result.receipt,
  };
}

Deno.test("FP007 audit artifact: zero receipts are bounded but never overall PASS", async () => {
  const artifact = await createNpmAuditReceiptArtifact(
    NPM_AUDIT_SCOPE_IDS.map((scope) => entry(scope)),
  );
  const loaded = await loadNpmAuditReceiptArtifact(
    Deno.cwd(),
    "pixiedraw2/tests/fp-007/fixtures/npm-audit-receipts-zero.json",
  );
  assert(loaded.overallStatus === "BLOCKED");
  assert(artifact.artifactDigest.length === 64);
  assert(
    serializeNpmAuditReceiptArtifact(artifact) ===
      serializeNpmAuditReceiptArtifact(
        await createNpmAuditReceiptArtifact([...artifact.scopes].reverse()),
      ),
  );
});

Deno.test("FP007 audit runner: exit 1 with valid nonzero JSON is recorded but blocked", () => {
  const result = runner("root", 1, 1);
  assert("receipt" in result && result.blocked === true);
});

Deno.test("FP007 audit runner: process, network, malformed JSON, and secret input fail closed", () => {
  const base = {
    scopeId: "root" as const,
    lockfilePath: "package-lock.json",
    lockfileSha256: "a".repeat(64),
    evidenceId: "synthetic-root",
  };
  const processFailure = parseNpmAuditJsonInMemory({
    ...base,
    exitCode: null,
    stdout: "",
  });
  const networkFailure = parseNpmAuditJsonInMemory({
    ...base,
    exitCode: 1,
    stdout: "{}",
    executionFailure: "NETWORK_FAILURE",
  });
  const malformed = parseNpmAuditJsonInMemory({
    ...base,
    exitCode: 1,
    stdout: "not-json",
  });
  const secret = parseNpmAuditJsonInMemory({
    ...base,
    exitCode: 1,
    stdout: '{"token":"eyJaaa.bbb.ccc"}',
  });
  assert(
    "failureCode" in processFailure &&
      processFailure.failureCode === "PROCESS_FAILED",
  );
  assert(
    "failureCode" in networkFailure &&
      networkFailure.failureCode === "NETWORK_FAILED",
  );
  assert(
    "failureCode" in malformed && malformed.failureCode === "MALFORMED_JSON",
  );
  assert("failureCode" in secret && secret.failureCode === "UNSANITIZED_INPUT");
  for (
    const recordedAt of [
      "2026-08-11T00:00:00Z",
      "2099-12-31T23:59:59.999Z",
    ]
  ) {
    const timestamp = parseNpmAuditJsonInMemory(
      {
        ...base,
        recordedAt,
        exitCode: 0,
        stdout: JSON.stringify({
          metadata: {
            vulnerabilities: {
              total: 0,
              low: 0,
              moderate: 0,
              high: 0,
              critical: 0,
            },
          },
        }),
      } as unknown as Parameters<typeof parseNpmAuditJsonInMemory>[0],
    );
    assert(
      "failureCode" in timestamp &&
        timestamp.failureCode === "UNSANITIZED_INPUT",
      "caller timestamps must not become receipt authority",
    );
  }
});

Deno.test("FP007 audit artifact loader: traversal is rejected and partial scopes are blocked", async () => {
  const traversal = await loadNpmAuditReceiptArtifact(
    Deno.cwd(),
    "../outside.json",
  );
  assert(
    traversal.diagnostics.some((item) => item.code === "ARTIFACT_PATH_INVALID"),
  );
  const partial = await createNpmAuditReceiptArtifact([entry("root")]);
  assert(partial.scopes.length === 1);
});

Deno.test("FP007 audit artifact: create rejects unknown receipt and entry fields", async () => {
  const base = entry("root") as unknown as Record<string, unknown>;
  for (
    const injection of [
      { unexpectedField: "redacted" },
      { syntheticField: "synthetic-value" },
      { redacted: "synthetic-value" },
    ]
  ) {
    await assertRejects(() =>
      createNpmAuditReceiptArtifact([{
        ...base,
        receipt: { ...(base.receipt as object), ...injection },
      } as unknown as NpmAuditArtifactEntry]), "Invalid");
  }
  await assertRejects(() =>
    createNpmAuditReceiptArtifact([{
      ...base,
      arbitrary: "unknown",
    } as unknown as NpmAuditArtifactEntry]), "Invalid");
});

Deno.test("FP007 audit artifact: failure allowlist and exit classification are consistent", async () => {
  const validEntry = entry("root");
  const base = validEntry as unknown as Record<string, unknown>;
  const execution = validEntry.execution;
  for (
    const [failureCode, exitClassification] of [
      ["PROCESS_FAILED", "PROCESS_FAILURE"],
      ["NETWORK_FAILED", "NETWORK_FAILURE"],
      ["MALFORMED_JSON", "PARSE_FAILURE"],
      ["UNSANITIZED_INPUT", "PARSE_FAILURE"],
    ] as const
  ) {
    const artifact = await createNpmAuditReceiptArtifact([{
      scopeId: "root",
      execution: { ...execution, exitClassification },
      failureCode,
    }]);
    const scope = artifact.scopes[0];
    assert(scope !== undefined);
    assert(scope.failureCode === failureCode);
  }
  await assertRejects(() =>
    createNpmAuditReceiptArtifact([{
      scopeId: "root",
      execution: { ...execution, exitClassification: "ZERO_COUNTS" },
      failureCode: "PROCESS_FAILED",
    }]), "FAILURE_EXIT_MISMATCH");
  await assertRejects(() =>
    createNpmAuditReceiptArtifact([{
      ...base,
      execution: { ...execution, exitClassification: "PROCESS_FAILURE" },
    } as unknown as NpmAuditArtifactEntry]), "EXIT_RECEIPT_MISMATCH");
  await assertRejects(() =>
    createNpmAuditReceiptArtifact([{
      scopeId: "root",
      execution,
      failureCode: "NOT_ALLOWLISTED",
    } as unknown as NpmAuditArtifactEntry]), "FAILURE_CODE_INVALID");
  await assertRejects(
    () => createNpmAuditReceiptArtifact([validEntry, validEntry]),
    "DUPLICATE_SCOPE",
  );
});

Deno.test("FP007 audit artifact writer: traversal and symlink boundaries fail closed", async () => {
  const artifact = await createNpmAuditReceiptArtifact([{
    scopeId: "root",
    execution: {
      commandIdentity: NPM_AUDIT_COMMAND_IDENTITY,
      exitClassification: "PROCESS_FAILURE",
      evidenceId: "synthetic-root",
    },
    failureCode: "PROCESS_FAILED",
  }]);
  const root = await Deno.makeTempDir({ prefix: "fp007-writer-" });
  try {
    await assertRejects(
      () => writeNpmAuditReceiptArtifact(root, "../escape.json", artifact),
      "repository-relative",
    );
    const outside = `${root}-outside.json`;
    await Deno.writeTextFile(outside, "sentinel");
    try {
      const rootLink = `${root}-link`;
      await Deno.symlink(root, rootLink);
      await assertRejects(
        () => writeNpmAuditReceiptArtifact(rootLink, "root.json", artifact),
        "real directory",
      );
      await Deno.symlink(outside, `${root}/existing.json`);
      await assertRejects(
        () => writeNpmAuditReceiptArtifact(root, "existing.json", artifact),
        "symlink",
      );
      await Deno.mkdir(`${root}/safe`);
      await Deno.symlink(root, `${root}/safe-link`);
      await assertRejects(
        () =>
          writeNpmAuditReceiptArtifact(root, "safe-link/out.json", artifact),
        "symlink",
      );
    } catch (error) {
      if (
        error instanceof Deno.errors.NotCapable ||
        error instanceof Deno.errors.PermissionDenied
      ) {
        console.warn(
          "UNTESTED: symlink creation is unavailable in this environment.",
        );
      } else {
        throw error;
      }
    } finally {
      await Deno.remove(outside).catch(() => undefined);
      await Deno.remove(`${root}-link`).catch(() => undefined);
    }
  } finally {
    await Deno.remove(root, { recursive: true }).catch(() => undefined);
  }
});

async function assertRejects(
  operation: () => Promise<unknown>,
  expected: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert(String(error).includes(expected), `${expected}: ${String(error)}`);
    return;
  }
  throw new Error(`expected rejection containing ${expected}`);
}

Deno.test("FP007 audit artifact: supplied valid zero receipt reaches scanner without network", async () => {
  const root = Deno.cwd();
  const loaded = await loadNpmAuditReceiptArtifact(
    root,
    "pixiedraw2/tests/fp-007/fixtures/npm-audit-receipts-zero.json",
  );
  assert(
    loaded.diagnostics.length === 0,
    loaded.diagnostics.map((item) => item.code).join(","),
  );
  const inventory = await scanRepository(root, {
    npmAuditReceipts: loaded.receipts,
  });
  assert(inventory.projects.length > 0);
  assert(
    !inventory.findings.some((item) =>
      item.code === "NPM_AUDIT_RECEIPT_UNSANITIZED"
    ),
  );
  const auditedLockfiles = new Set(
    NPM_AUDIT_SCOPE_IDS.map((scope) =>
      scope === "root" ? "package-lock.json" : `${scope}/package-lock.json`
    ),
  );
  const npmProjects = inventory.projects.filter((item) =>
    auditedLockfiles.has(item.lockfilePath)
  );
  assert(npmProjects.length === NPM_AUDIT_SCOPE_IDS.length);
  for (const project of npmProjects) {
    assert(
      !project.findings.some((item) =>
        item.code === "VULNERABILITY_REVIEW_UNKNOWN"
      ),
      project.manifestPath,
    );
    assert(
      project.resolvedDependencies.every((item) =>
        item.vulnerability === "REVIEWED_NONE"
      ),
      project.manifestPath,
    );
  }
  const jsr = inventory.projects.filter((item) =>
    item.manifestPath.endsWith("deno.json")
  );
  assert(
    jsr.every((project) =>
      !project.findings.some((item) =>
        item.code === "VULNERABILITY_REVIEW_UNKNOWN"
      )
    ),
  );
  assert(
    jsr.filter((project) => project.manifestPath.endsWith("deno.json"))
      .every((project) =>
        project.resolvedDependencies.every((item) =>
          item.vulnerability === "REVIEWED_NONE"
        )
      ),
  );
});
