import { canonicalJson, sha256Hex } from "../../src/fp-007/build-manifest.ts";
import {
  createJsrLicenseReceiptArtifact,
  FP007_JSR_INTEGRITY,
  FP007_JSR_PACKAGE,
  FP007_JSR_REVIEW_LOCKFILES,
  FP007_JSR_SPECIFIER,
  FP007_JSR_VERSION,
  type JsrLicenseReceiptV1,
  validateJsrLicenseReceipt,
  validateJsrLicenseReceiptArtifact,
} from "../../src/fp-007/jsr-package-review-receipt.ts";
import {
  inspectDenoProject,
  scanRepository,
} from "../../src/fp-007/dependency-inventory.ts";
import { compareCodeUnitStrings } from "../../src/fp-007/stable-order.ts";

function assert(value: boolean, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message = "values differ") {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

const LOCK_TEXT = JSON.stringify({
  version: "5",
  specifiers: { [FP007_JSR_SPECIFIER]: FP007_JSR_VERSION },
  jsr: {
    "@supabase/functions-js@2.112.2": { integrity: FP007_JSR_INTEGRITY },
  },
});

async function receipt(lockfilePath: string): Promise<JsrLicenseReceiptV1> {
  const body = {
    schemaVersion: "1" as const,
    packageName: FP007_JSR_PACKAGE,
    version: FP007_JSR_VERSION,
    specifier: FP007_JSR_SPECIFIER,
    integrity: FP007_JSR_INTEGRITY,
    lockfilePath: lockfilePath as JsrLicenseReceiptV1["lockfilePath"],
    lockfileSha256: await sha256Hex(LOCK_TEXT),
    licenseSpdx: "MIT" as const,
    sourceKind: "official-jsr-metadata" as const,
    reviewDate: "2026-08-11",
  };
  return { ...body, receiptDigest: await sha256Hex(canonicalJson(body)) };
}

async function artifact() {
  return await createJsrLicenseReceiptArtifact(
    await Promise.all(
      FP007_JSR_REVIEW_LOCKFILES.map(receipt),
    ),
  );
}

Deno.test("FP007-JSR-LICENSE-001 accepts only the exact two-lock MIT artifact", async () => {
  const checked = await validateJsrLicenseReceiptArtifact(await artifact());
  assertEquals(checked.valid, true);
  assertEquals(checked.receipts.size, 2);
  assert(!JSON.stringify(checked.artifact).includes("vulnerability"));
  assert(!JSON.stringify(checked.artifact).includes("sourceRepository"));
});

Deno.test("FP007-JSR-LICENSE-001 uses explicit UTF-16 lockfile ordering", () => {
  const paths = [
    "é/asset.js",
    "e\u0301/asset.js",
    "😀/asset.js",
    "🦄/asset.js",
    "z/asset.js",
    "A/asset.js",
    "a/asset.js",
    "#/asset.js",
    "_/asset.js",
    "-/asset.js",
  ];
  const sorted = [...paths].sort(compareCodeUnitStrings);
  assertEquals(
    JSON.stringify(sorted),
    JSON.stringify([
      "#/asset.js",
      "-/asset.js",
      "A/asset.js",
      "_/asset.js",
      "a/asset.js",
      "e\u0301/asset.js",
      "z/asset.js",
      "é/asset.js",
      "😀/asset.js",
      "🦄/asset.js",
    ]),
    "lockfile path order must be UTF-16 code-unit deterministic",
  );
});

Deno.test("FP007-JSR-LICENSE-001 keeps receipt and digest stable for input order", async () => {
  const forward = await artifact();
  const reversed = await createJsrLicenseReceiptArtifact(
    [...(await Promise.all(FP007_JSR_REVIEW_LOCKFILES.map(receipt)))].reverse(),
  );
  assertEquals(
    JSON.stringify(reversed.receipts),
    JSON.stringify(forward.receipts),
    "receipt order must not depend on input order",
  );
  assertEquals(
    reversed.artifactDigest,
    forward.artifactDigest,
    "receipt digest must not depend on input order",
  );
});

Deno.test(
  "FP007-JSR-LICENSE-001 uses checked-in receipts only in repository scan",
  async () => {
    const inventory = await scanRepository(".");
    const result = inventory.projects.find((item) =>
      item.lockfilePath === FP007_JSR_REVIEW_LOCKFILES[0]
    );
    assert(result !== undefined);
    assertEquals(result.resolvedDependencies[0]?.license, "MIT");
    assertEquals(
      result.resolvedDependencies[0]?.vulnerability,
      "REVIEWED_NONE",
    );
  },
);

Deno.test(
  "FP007-JSR-LICENSE-001 public inspect ignores caller-supplied license receipt",
  async () => {
    const result = await inspectDenoProject(
      {
        manifestPath: "supabase/functions/market-reconcile-my-sales/deno.json",
        config: { imports: { "@supabase/functions-js": FP007_JSR_SPECIFIER } },
        lockfilePath: FP007_JSR_REVIEW_LOCKFILES[0],
        lockfilePresent: true,
        lockText: LOCK_TEXT,
        ...({ jsrLicenseReceiptArtifact: await artifact() } as Record<
          string,
          unknown
        >),
      } as unknown as Parameters<typeof inspectDenoProject>[0],
    );
    assertEquals(result.resolvedDependencies[0]?.license, "UNKNOWN");
    assert(result.findings.some((item) => item.code === "LICENSE_UNKNOWN"));
  },
);

Deno.test("FP007-JSR-LICENSE-001 keeps a mismatched lock unknown and blocked", async () => {
  const result = await inspectDenoProject({
    manifestPath: "supabase/functions/market-reconcile-my-sales/deno.json",
    config: { imports: { "@supabase/functions-js": FP007_JSR_SPECIFIER } },
    lockfilePath: FP007_JSR_REVIEW_LOCKFILES[0],
    lockfilePresent: true,
    lockText: JSON.stringify({
      version: "5",
      specifiers: { [FP007_JSR_SPECIFIER]: FP007_JSR_VERSION },
      jsr: {
        "@supabase/functions-js@2.112.2": {
          integrity: "sha256-" + "a".repeat(64),
        },
      },
    }),
  });
  assertEquals(result.resolvedDependencies[0]?.license, "UNKNOWN");
  assert(result.findings.some((item) => item.code === "LICENSE_UNKNOWN"));
  assert(
    result.findings.some((item) =>
      item.code === "VULNERABILITY_REVIEW_UNKNOWN"
    ),
  );
});

Deno.test("FP007-JSR-LICENSE-001 rejects unknown fields and duplicate lock entries", async () => {
  const valid = await artifact();
  const unknownField = await validateJsrLicenseReceiptArtifact({
    ...valid,
    extra: "not allowed",
  });
  assert(!unknownField.valid);
  assert(
    unknownField.diagnostics.some((item) => item.code === "UNKNOWN_FIELD"),
  );

  const duplicate = await validateJsrLicenseReceiptArtifact({
    ...valid,
    receipts: [valid.receipts[0], valid.receipts[0]],
  });
  assert(!duplicate.valid);
  assert(duplicate.diagnostics.some((item) => item.code === "DUPLICATE_ENTRY"));
});

Deno.test("FP007-JSR-LICENSE-001 rejects path, license, integrity, and lock hash mismatches", async () => {
  const valid = await receipt(FP007_JSR_REVIEW_LOCKFILES[0]);
  const expected = {
    packageName: FP007_JSR_PACKAGE,
    version: FP007_JSR_VERSION,
    specifier: FP007_JSR_SPECIFIER,
    integrity: FP007_JSR_INTEGRITY,
    lockfilePath: FP007_JSR_REVIEW_LOCKFILES[0],
    lockfileSha256: await sha256Hex(LOCK_TEXT),
  };
  const checks = await Promise.all([
    validateJsrLicenseReceipt({ ...valid, lockfilePath: "../deno.lock" }),
    validateJsrLicenseReceipt({ ...valid, licenseSpdx: "Apache-2.0" }),
    validateJsrLicenseReceipt({ ...valid, integrity: "a".repeat(64) }),
    validateJsrLicenseReceipt(valid, {
      ...expected,
      lockfileSha256: "b".repeat(64),
    }),
  ]);
  assert(checks.every((item) => !item.valid));
  assert(
    checks[0].diagnostics.some((item) => item.code === "LOCKFILE_PATH_INVALID"),
  );
  assert(
    checks[1].diagnostics.some((item) => item.code === "LICENSE_MISMATCH"),
  );
  assert(
    checks[2].diagnostics.some((item) => item.code === "INTEGRITY_INVALID"),
  );
  assert(
    checks[3].diagnostics.some((item) =>
      item.code === "LOCKFILESHA256_MISMATCH"
    ),
  );
});

Deno.test("FP007-JSR-LICENSE-001 keeps a missing receipt fail-closed", async () => {
  const result = await inspectDenoProject({
    manifestPath: "supabase/functions/market-reconcile-purchase/deno.json",
    config: { imports: { "@supabase/functions-js": FP007_JSR_SPECIFIER } },
    lockfilePath: FP007_JSR_REVIEW_LOCKFILES[1],
    lockfilePresent: true,
    lockText: LOCK_TEXT,
  });
  assert(result.findings.some((item) => item.code === "LICENSE_UNKNOWN"));
  assert(
    result.findings.some((item) =>
      item.code === "VULNERABILITY_REVIEW_UNKNOWN"
    ),
  );
  assertEquals(result.resolvedDependencies[0]?.license, "UNKNOWN");
});
