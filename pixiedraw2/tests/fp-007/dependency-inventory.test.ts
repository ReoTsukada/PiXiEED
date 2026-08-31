import {
  classifyDeclaration,
  type DependencyProjectInventory,
  inspectDenoProject,
  inspectNpmProject,
  resolveSharedNodeToolchain,
  validateNpmAuditReceipt,
} from "../../src/fp-007/dependency-inventory.ts";
import { analyzeCleanRoom } from "../../src/fp-007/clean-room-policy.ts";
import {
  redactAuditValue,
  redactEnvironmentNames,
  redactEnvironmentWithFingerprints,
} from "../../src/fp-007/secret-redaction.ts";

function assert(value: boolean, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

function assertEquals<T>(
  actual: T,
  expected: T,
  message = "values differ",
): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

function hasCode(result: DependencyProjectInventory, code: string): boolean {
  return result.findings.some((item) => item.code === code);
}

const LOCKFILE_HASH = "a".repeat(64);

const VALID_SHARED_TOOLCHAIN = {
  nodeMajor: 22,
  nodeVersion: "22.19.0",
  packageManager: "npm",
  npmVersion: "10.9.3",
  lockfileVersion: 3,
  inheritsTo: [
    "tools/screenshots",
    "16_IMPLEMENTATION_STARTER/reference-core",
  ],
};

function toolchainCode(
  scopeId: string,
  declaration: unknown,
): string | undefined {
  return resolveSharedNodeToolchain({ scopeId, declaration }).findings[0]?.code;
}

Deno.test("FP007-DEP-001 accepts the evidence-backed exact Node/npm pin", () => {
  for (
    const scopeId of [
      "root",
      "tools/screenshots",
      "16_IMPLEMENTATION_STARTER/reference-core",
    ]
  ) {
    const result = resolveSharedNodeToolchain({
      scopeId,
      declaration: VALID_SHARED_TOOLCHAIN,
    });
    assertEquals(result.findings.length, 0, scopeId);
    assertEquals(result.toolchain.nodeMajor, "22", scopeId);
    assertEquals(result.toolchain.nodeVersion, "22.19.0", scopeId);
    assertEquals(result.toolchain.packageManager, "npm", scopeId);
    assertEquals(result.toolchain.npmVersion, "10.9.3", scopeId);
    assertEquals(result.toolchain.lockfileVersion, "3", scopeId);
    assertEquals(result.toolchain.qualification, "EXACT_NODE_NPM_PIN", scopeId);
  }
});

Deno.test("FP007-DEP-001 keeps a Node 22 major-only declaration blocked", () => {
  const result = resolveSharedNodeToolchain({
    scopeId: "root",
    declaration: {
      nodeMajor: 22,
      packageManager: "npm",
      lockfileVersion: 3,
      inheritsTo: VALID_SHARED_TOOLCHAIN.inheritsTo,
    },
  });
  assertEquals(result.toolchain.qualification, undefined);
  assert(
    result.findings.some((item) =>
      item.code === "TOOLCHAIN_DECLARATION_INCOMPLETE"
    ),
    "exact Node and npm versions remain required",
  );
});

Deno.test("FP007-DEP-001 keeps absent shared toolchain declaration unknown", () => {
  assertEquals(toolchainCode("root", undefined), "TOOLCHAIN_UNKNOWN");
  assertEquals(
    toolchainCode("tools/screenshots", undefined),
    "TOOLCHAIN_UNKNOWN",
  );
});

Deno.test("FP007-DEP-001 rejects incomplete, floating, and ambiguous declarations", () => {
  assertEquals(
    toolchainCode("root", { nodeMajor: 22 }),
    "TOOLCHAIN_DECLARATION_INCOMPLETE",
  );
  assertEquals(
    toolchainCode("root", { ...VALID_SHARED_TOOLCHAIN, nodeMajor: "22.x" }),
    "TOOLCHAIN_DECLARATION_FLOATING",
  );
  assertEquals(
    toolchainCode("root", { ...VALID_SHARED_TOOLCHAIN, lockfileVersion: "3" }),
    "TOOLCHAIN_DECLARATION_INCOMPATIBLE",
  );
  assertEquals(
    toolchainCode("root", { ...VALID_SHARED_TOOLCHAIN, inheritsTo: "all" }),
    "TOOLCHAIN_DECLARATION_AMBIGUOUS",
  );
});

Deno.test("FP007-DEP-001 rejects incompatible Node policy and unauthorized inheritance", () => {
  assertEquals(
    toolchainCode("root", { ...VALID_SHARED_TOOLCHAIN, nodeMajor: 20 }),
    "TOOLCHAIN_DECLARATION_INCOMPATIBLE",
  );
  assertEquals(
    toolchainCode("root", {
      ...VALID_SHARED_TOOLCHAIN,
      inheritsTo: [
        ...VALID_SHARED_TOOLCHAIN.inheritsTo,
        "app-shell/pixieed-capacitor",
      ],
    }),
    "TOOLCHAIN_SCOPE_UNAUTHORIZED",
  );
  assertEquals(
    toolchainCode("app-shell/pixieed-capacitor", VALID_SHARED_TOOLCHAIN),
    "TOOLCHAIN_SCOPE_UNAUTHORIZED",
  );
});

function validNpmAuditReceipt() {
  return {
    schemaVersion: "1" as const,
    scopeId: "root" as const,
    packageManager: "npm" as const,
    lockfilePath: "package-lock.json",
    lockfileSha256: LOCKFILE_HASH,
    commandIdentity: "npm audit --json" as const,
    summary: {
      knownVulnerabilitiesTotal: 0,
      severityCounts: { low: 0, moderate: 0, high: 0, critical: 0 },
    },
    evidenceId: "fp007-npm-audit-root-20260811",
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function inspectReceipt(summary: {
  knownVulnerabilitiesTotal: number;
  severityCounts: {
    low: number;
    moderate: number;
    high: number;
    critical: number;
  };
}) {
  const lock = { packages: { "": {} } };
  const lockText = JSON.stringify(lock);
  return await inspectNpmProject({
    manifestPath: "package.json",
    manifest: {},
    lockfilePath: "package-lock.json",
    lockText,
    lock,
    npmAuditReceipt: {
      ...validNpmAuditReceipt(),
      lockfileSha256: await sha256Hex(lockText),
      summary,
    },
    toolchain: { node: ">=20" },
  });
}

Deno.test("FP007-DEP-001 accepts a bounded valid npm audit receipt", () => {
  const result = validateNpmAuditReceipt(validNpmAuditReceipt(), LOCKFILE_HASH);
  assertEquals(result.valid, true);
  assertEquals(result.status, "PASS");
  assertEquals(result.evidenceLevel, "RECEIPT_BACKED_BOUNDED");
  assertEquals(result.vulnerabilityDisposition, "CLEAN");
});

Deno.test("FP007-DEP-001 keeps a schema-valid nonzero receipt out of PASS", async () => {
  for (const severity of ["low", "moderate", "high", "critical"] as const) {
    const result = await inspectReceipt({
      knownVulnerabilitiesTotal: 1,
      severityCounts: {
        low: severity === "low" ? 1 : 0,
        moderate: severity === "moderate" ? 1 : 0,
        high: severity === "high" ? 1 : 0,
        critical: severity === "critical" ? 1 : 0,
      },
    });
    const finding = result.findings.find((item) =>
      item.code === "NPM_AUDIT_VULNERABILITIES_PRESENT"
    );
    assert(finding !== undefined, severity);
    assertEquals(finding.status, "BLOCKED");
    assert(finding.detail.includes(`knownVulnerabilitiesTotal=1`));
    assert(finding.detail.includes(`${severity}:1`));
    assert(!finding.detail.includes("http"));
  }
});

Deno.test("FP007-DEP-001 rejects a nonzero total with zero severities", () => {
  const result = validateNpmAuditReceipt({
    ...validNpmAuditReceipt(),
    summary: {
      knownVulnerabilitiesTotal: 1,
      severityCounts: { low: 0, moderate: 0, high: 0, critical: 0 },
    },
  }, LOCKFILE_HASH);
  assertEquals(result.valid, false);
  assert(
    result.diagnostics.some((item) =>
      item.code === "NPM_AUDIT_RECEIPT_TOTAL_INVALID"
    ),
  );
});

Deno.test("FP007-DEP-001 rejects hash mismatch and malformed severity", () => {
  const hashMismatch = validateNpmAuditReceipt(
    validNpmAuditReceipt(),
    "b".repeat(64),
  );
  assertEquals(hashMismatch.valid, false);
  assert(
    hashMismatch.diagnostics.some((item) =>
      item.code === "NPM_AUDIT_RECEIPT_HASH_MISMATCH"
    ),
  );

  const malformedSeverity = validateNpmAuditReceipt({
    ...validNpmAuditReceipt(),
    summary: {
      knownVulnerabilitiesTotal: 0,
      severityCounts: {
        low: -1,
        moderate: 0,
        high: 0,
        critical: 0,
        unknown: 0,
      },
    },
  }, LOCKFILE_HASH);
  assertEquals(malformedSeverity.valid, false);
  assert(
    malformedSeverity.diagnostics.some((item) =>
      item.code === "NPM_AUDIT_RECEIPT_SEVERITY_INVALID"
    ),
  );
});

Deno.test("FP007-DEP-001 rejects wrong scope, lockfile path, and package manager", () => {
  const result = validateNpmAuditReceipt({
    ...validNpmAuditReceipt(),
    scopeId: "unknown",
    packageManager: "pnpm",
    lockfilePath: "tools/screenshots/package-lock.json",
  }, LOCKFILE_HASH);
  assertEquals(result.valid, false);
  for (
    const code of [
      "NPM_AUDIT_RECEIPT_SCOPE_INVALID",
      "NPM_AUDIT_RECEIPT_PACKAGE_MANAGER_INVALID",
      "NPM_AUDIT_RECEIPT_PATH_INVALID",
    ]
  ) assert(result.diagnostics.some((item) => item.code === code), code);
});

Deno.test("FP007-DEP-001 rejects raw secret-like receipt fields fail-closed", () => {
  const result = validateNpmAuditReceipt({
    ...validNpmAuditReceipt(),
    apiKey: "raw-secret-value",
  }, LOCKFILE_HASH);
  assertEquals(result.valid, false);
  assert(
    result.diagnostics.some((item) =>
      item.code === "NPM_AUDIT_RECEIPT_UNSANITIZED"
    ),
  );
});

Deno.test("FP007-DEP-001 rejects every receipt nested unknown field", () => {
  for (
    const injection of [
      { unexpectedField: "redacted" },
      { syntheticField: "synthetic-value" },
      { redacted: "synthetic-value" },
    ]
  ) {
    const result = validateNpmAuditReceipt({
      ...validNpmAuditReceipt(),
      ...injection,
    }, LOCKFILE_HASH);
    assertEquals(result.valid, false);
    assert(
      result.diagnostics.some((item) =>
        item.code === "NPM_AUDIT_RECEIPT_UNKNOWN_FIELD"
      ),
    );
  }
  const nested = validateNpmAuditReceipt({
    ...validNpmAuditReceipt(),
    summary: { ...validNpmAuditReceipt().summary, detail: "must not pass" },
  }, LOCKFILE_HASH);
  assertEquals(nested.valid, false);
  assert(
    nested.diagnostics.some((item) =>
      item.code === "NPM_AUDIT_RECEIPT_SUMMARY_UNKNOWN_FIELD"
    ),
  );
});

Deno.test("FP007-DEP-001 keeps audit receipt PASS bounded from other statuses", async () => {
  const receipt = validateNpmAuditReceipt(
    validNpmAuditReceipt(),
    LOCKFILE_HASH,
  );
  assertEquals(receipt.status, "PASS");
  const npm = await inspectNpmProject({
    manifestPath: "package.json",
    manifest: { dependencies: { example: "1.2.3" } },
    lockfilePath: "package-lock.json",
    lockText: JSON.stringify({
      packages: {
        "": {},
        "node_modules/example": {
          version: "1.2.3",
          resolved: "https://registry.npmjs.org/example/-/example-1.2.3.tgz",
          license: "MIT",
        },
      },
    }),
    lock: {
      packages: {
        "": {},
        "node_modules/example": {
          version: "1.2.3",
          resolved: "https://registry.npmjs.org/example/-/example-1.2.3.tgz",
          license: "MIT",
        },
      },
    },
    toolchain: { node: ">=18" },
  });
  assertEquals(npm.status, "BLOCKED");
  const jsr = await inspectDenoProject({
    manifestPath: "supabase/functions/example/deno.json",
    config: { imports: { "@scope/pkg": "jsr:@scope/pkg@1.2.3" } },
    lockfilePath: "supabase/functions/example/deno.lock",
    lockfilePresent: false,
  });
  assertEquals(jsr.status, "BLOCKED");
});

Deno.test("FP007-DEP-001 preserves legacy unknown review when no receipt is supplied", async () => {
  const result = await inspectNpmProject({
    manifestPath: "package.json",
    manifest: { dependencies: { example: "1.2.3" } },
    lockfilePath: "package-lock.json",
    lockText: JSON.stringify({
      packages: {
        "": {},
        "node_modules/example": {
          version: "1.2.3",
          resolved: "https://registry.npmjs.org/example/-/example-1.2.3.tgz",
          license: "MIT",
        },
      },
    }),
    lock: {
      packages: {
        "": {},
        "node_modules/example": {
          version: "1.2.3",
          resolved: "https://registry.npmjs.org/example/-/example-1.2.3.tgz",
          license: "MIT",
        },
      },
    },
    toolchain: { node: ">=18" },
  });
  assert(hasCode(result, "VULNERABILITY_REVIEW_UNKNOWN"));
  assert(
    !result.findings.some((item) => item.code.startsWith("NPM_AUDIT_RECEIPT_")),
  );
});

Deno.test("FP007-DEP-001 blocks an explicit malformed receipt and retains unknown review", async () => {
  const result = await inspectNpmProject({
    manifestPath: "package.json",
    manifest: { dependencies: { example: "1.2.3" } },
    lockfilePath: "package-lock.json",
    lockText: JSON.stringify({
      packages: {
        "": {},
        "node_modules/example": {
          version: "1.2.3",
          resolved: "https://registry.npmjs.org/example/-/example-1.2.3.tgz",
          license: "MIT",
        },
      },
    }),
    lock: {
      packages: {
        "": {},
        "node_modules/example": {
          version: "1.2.3",
          resolved: "https://registry.npmjs.org/example/-/example-1.2.3.tgz",
          license: "MIT",
        },
      },
    },
    npmAuditReceipt: { schemaVersion: "malformed" },
    toolchain: { node: ">=18" },
  });
  assertEquals(
    result.findings.filter((item) => item.code === "NPM_AUDIT_RECEIPT_INVALID")
      .length,
    1,
  );
  assert(hasCode(result, "VULNERABILITY_REVIEW_UNKNOWN"));
  assertEquals(result.status, "BLOCKED");
});

Deno.test("FP007-DEP-001 valid zero receipt reviews only matching npm dependencies", async () => {
  const lockText = JSON.stringify({
    packages: {
      "": {},
      "node_modules/example": {
        version: "1.2.3",
        resolved: "https://registry.npmjs.org/example/-/example-1.2.3.tgz",
        license: "MIT",
      },
    },
  });
  const result = await inspectNpmProject({
    manifestPath: "package.json",
    manifest: { dependencies: { example: "1.2.3" } },
    lockfilePath: "package-lock.json",
    lockText,
    lock: JSON.parse(lockText),
    npmAuditReceipt: {
      schemaVersion: "1",
      scopeId: "root",
      packageManager: "npm",
      lockfilePath: "package-lock.json",
      lockfileSha256: await sha256Hex(lockText),
      commandIdentity: "npm audit --json",
      summary: {
        knownVulnerabilitiesTotal: 0,
        severityCounts: { low: 0, moderate: 0, high: 0, critical: 0 },
      },
      evidenceId: "fp007-zero-root",
    },
    toolchain: { node: ">=18" },
  });
  assertEquals(result.resolvedDependencies[0]?.vulnerability, "REVIEWED_NONE");
  assert(!hasCode(result, "VULNERABILITY_REVIEW_UNKNOWN"));
});

Deno.test("FP007-DEP-001 keeps nonzero receipt blocked and vulnerability unknown", async () => {
  const lockText = JSON.stringify({
    packages: {
      "": {},
      "node_modules/example": {
        version: "1.2.3",
        resolved: "https://registry.npmjs.org/example/-/example-1.2.3.tgz",
        license: "MIT",
      },
    },
  });
  const result = await inspectNpmProject({
    manifestPath: "package.json",
    manifest: { dependencies: { example: "1.2.3" } },
    lockfilePath: "package-lock.json",
    lockText,
    lock: JSON.parse(lockText),
    npmAuditReceipt: {
      schemaVersion: "1",
      scopeId: "root",
      packageManager: "npm",
      lockfilePath: "package-lock.json",
      lockfileSha256: await sha256Hex(lockText),
      commandIdentity: "npm audit --json",
      summary: {
        knownVulnerabilitiesTotal: 1,
        severityCounts: { low: 1, moderate: 0, high: 0, critical: 0 },
      },
      evidenceId: "fp007-nonzero-root",
    },
    toolchain: { node: ">=18" },
  });
  assert(hasCode(result, "NPM_AUDIT_VULNERABILITIES_PRESENT"));
  assert(hasCode(result, "VULNERABILITY_REVIEW_UNKNOWN"));
  assertEquals(result.resolvedDependencies[0]?.vulnerability, "UNKNOWN");
});

Deno.test("FP007-DEP-001 keeps manifest ranges separate and fails floating declarations", () => {
  assertEquals(classifyDeclaration("1.2.3"), "PASS");
  assertEquals(classifyDeclaration("latest"), "FAIL");
  assertEquals(classifyDeclaration("^8.2.0"), "FAIL");
  assertEquals(classifyDeclaration("~1.2.3"), "FAIL");
  assertEquals(classifyDeclaration("*"), "FAIL");
  assertEquals(classifyDeclaration("file:../local"), "FAIL");
});

Deno.test("FP007-DEP-001 checks exact root lock metadata against the manifest", async () => {
  const manifest = { devDependencies: { sharp: "0.35.3" } };
  const basePackage = {
    version: "0.35.3",
    resolved: "https://registry.npmjs.org/sharp/-/sharp-0.35.3.tgz",
    license: "Apache-2.0",
  };
  const inspect = (rootSpecifier: string) =>
    inspectNpmProject({
      manifestPath: "package.json",
      manifest,
      lockfilePath: "package-lock.json",
      lockText: JSON.stringify({
        packages: {
          "": { devDependencies: { sharp: rootSpecifier } },
          "node_modules/sharp": basePackage,
        },
      }),
      lock: {
        packages: {
          "": { devDependencies: { sharp: rootSpecifier } },
          "node_modules/sharp": basePackage,
        },
      },
      toolchain: { node: ">=20" },
    });

  assert(
    !(await inspect("0.35.3")).findings.some((item) =>
      item.code === "ROOT_LOCK_METADATA_MISMATCH"
    ),
  );
  for (const specifier of ["0.35.4", "^0.35.3"]) {
    const result = await inspect(specifier);
    assert(hasCode(result, "ROOT_LOCK_METADATA_MISMATCH"), specifier);
    assertEquals(
      result.findings.find((item) =>
        item.code === "ROOT_LOCK_METADATA_MISMATCH"
      )?.status,
      "BLOCKED",
    );
  }
});

Deno.test("FP007-DEP-001 blocks absent root lock metadata", async () => {
  const result = await inspectNpmProject({
    manifestPath: "package.json",
    manifest: { devDependencies: { sharp: "0.35.3" } },
    lockfilePath: "package-lock.json",
    lockText: JSON.stringify({
      packages: {
        "": {},
        "node_modules/sharp": {
          version: "0.35.3",
          resolved: "https://registry.npmjs.org/sharp/-/sharp-0.35.3.tgz",
          license: "Apache-2.0",
        },
      },
    }),
    lock: {
      packages: {
        "": {},
        "node_modules/sharp": {
          version: "0.35.3",
          resolved: "https://registry.npmjs.org/sharp/-/sharp-0.35.3.tgz",
          license: "Apache-2.0",
        },
      },
    },
    toolchain: { node: ">=20" },
  });

  const mismatch = result.findings.find((item) =>
    item.code === "ROOT_LOCK_METADATA_MISMATCH"
  );
  assert(mismatch !== undefined);
  assertEquals(mismatch.status, "BLOCKED");
});

Deno.test("FP007-DEP-001 reports lock mismatch, unknown review, and local origin without modifying inputs", async () => {
  const manifest = { dependencies: { exact: "1.2.3", local: "1.0.0" } };
  const lock = {
    packages: {
      "": {},
      "node_modules/exact": {
        version: "1.2.4",
        resolved: "https://registry.npmjs.org/exact/-/exact-1.2.4.tgz",
        license: "MIT",
      },
      "node_modules/local": { version: "1.0.0", resolved: "file:../local" },
    },
  };
  const result = await inspectNpmProject({
    manifestPath: "package.json",
    manifest,
    lockfilePath: "package-lock.json",
    lockText: JSON.stringify(lock),
    lock,
  });
  assertEquals(result.manifestDependencies[0]?.declaration, "1.2.3");
  assert(hasCode(result, "MANIFEST_LOCK_MISMATCH"));
  assert(hasCode(result, "LOCAL_PATH_DEPENDENCY"));
  assert(hasCode(result, "LICENSE_UNKNOWN"));
  assert(hasCode(result, "VULNERABILITY_REVIEW_UNKNOWN"));
  assertEquals(result.status, "FAIL");
});

Deno.test("FP007-DEP-001 treats absent Deno lock and floating JSR as blocking findings", async () => {
  const result = await inspectDenoProject({
    manifestPath: "supabase/functions/example/deno.json",
    config: {
      imports: { "@supabase/functions-js": "jsr:@supabase/functions-js@^2" },
    },
    lockfilePath: "supabase/functions/example/deno.lock",
    lockfilePresent: false,
  });
  assert(hasCode(result, "LOCKFILE_MISSING"));
  assert(hasCode(result, "FLOATING_JSR_RANGE"));
  assertEquals(result.status, "FAIL");
});

Deno.test("FP007-DEP-001 binds JSR identity, exact version, and integrity structurally", async () => {
  const declaration = "jsr:@scope/pkg@1.2.3";
  const integrity = "A".repeat(64);
  const lockText = JSON.stringify({
    version: "4",
    specifiers: { [declaration]: "1.2.3" },
    jsr: { "@scope/pkg@1.2.3": { integrity } },
  });
  const resolved = await inspectDenoProject({
    manifestPath: "deno.json",
    config: { imports: { "@scope/pkg": declaration } },
    lockfilePath: "deno.lock",
    lockfilePresent: true,
    lockText,
  });
  assertEquals(resolved.resolvedDependencies[0]?.lockResolved, true);

  const wrongPackage = await inspectDenoProject({
    manifestPath: "deno.json",
    config: { imports: { "@other/pkg": "jsr:@other/pkg@1.2.3" } },
    lockfilePath: "deno.lock",
    lockfilePresent: true,
    lockText,
  });
  assertEquals(wrongPackage.resolvedDependencies[0]?.lockResolved, false);
  assert(hasCode(wrongPackage, "LOCK_RESOLUTION_MISSING"));

  const missingIntegrity = await inspectDenoProject({
    manifestPath: "deno.json",
    config: { imports: { "@scope/pkg": declaration } },
    lockfilePath: "deno.lock",
    lockfilePresent: true,
    lockText: JSON.stringify({
      version: "4",
      specifiers: { [declaration]: "1.2.3" },
      jsr: { "@scope/pkg@1.2.3": {} },
    }),
  });
  assertEquals(missingIntegrity.resolvedDependencies[0]?.lockResolved, false);
  assert(hasCode(missingIntegrity, "LOCK_RESOLUTION_MISSING"));

  const malformed = await inspectDenoProject({
    manifestPath: "deno.json",
    config: { imports: { "@scope/pkg": declaration } },
    lockfilePath: "deno.lock",
    lockfilePresent: true,
    lockText: "{not-json",
  });
  assert(hasCode(malformed, "LOCKFILE_FORMAT_UNKNOWN"));
  assertEquals(malformed.status, "FAIL");
});

Deno.test("FP007-DEP-001 accepts current Supabase bare hex JSR lock integrity and rejects malformed values", async () => {
  const declaration = "jsr:@supabase/functions-js@2.112.2";
  const validIntegrities = [
    "692aba48a8aa15d9d6921b3fa11c6ce0242c48d6eb489674e18bb245bd2abad5",
    "sha256-" + "a".repeat(64),
    "sha256:" + "B".repeat(64),
  ];
  for (const integrity of validIntegrities) {
    const result = await inspectDenoProject({
      manifestPath: "supabase/functions/example/deno.json",
      config: { imports: { "@supabase/functions-js": declaration } },
      lockfilePath: "supabase/functions/example/deno.lock",
      lockfilePresent: true,
      lockText: JSON.stringify({
        version: "4",
        specifiers: { [declaration]: "2.112.2" },
        jsr: { "@supabase/functions-js@2.112.2": { integrity } },
      }),
    });
    assertEquals(result.resolvedDependencies[0]?.lockResolved, true, integrity);
    assert(!hasCode(result, "LOCK_RESOLUTION_MISSING"), integrity);
  }
  for (
    const integrity of [
      "a".repeat(63),
      "g".repeat(64),
      "https://example.invalid/" + "a".repeat(64),
      "arbitrary-integrity-value",
      "sha256-" + "a".repeat(63),
    ]
  ) {
    const result = await inspectDenoProject({
      manifestPath: "supabase/functions/example/deno.json",
      config: { imports: { "@supabase/functions-js": declaration } },
      lockfilePath: "supabase/functions/example/deno.lock",
      lockfilePresent: true,
      lockText: JSON.stringify({
        version: "4",
        specifiers: { [declaration]: "2.112.2" },
        jsr: { "@supabase/functions-js@2.112.2": { integrity } },
      }),
    });
    assertEquals(
      result.resolvedDependencies[0]?.lockResolved,
      false,
      integrity,
    );
    assert(hasCode(result, "LOCK_RESOLUTION_MISSING"), integrity);
  }
});

Deno.test("FP007-CLEAN-ROOM-001 detects dirty, generated, absolute, host, random, cache, and network inputs", () => {
  const result = analyzeCleanRoom({
    workspaceStatus: "dirty",
    generatedFiles: ["dist/entry.js", "generated/undeclared.json"],
    declaredGeneratedFiles: ["generated/declared.json"],
    sourceTexts: [{
      path: "build.mjs",
      content:
        "generatedAt = Date.now(); os.hostname(); Math.random(); .cache https://registry.example.invalid",
    }],
    usedEnvironmentNames: ["UNDECLARED_ENV"],
    declaredEnvironmentNames: [],
    commands: ["npm install", "/Users/example/.cache/tool"],
    networkMode: "disabled",
    cacheMode: "disabled",
  });
  for (
    const code of [
      "DIRTY_WORKSPACE",
      "UNTRACKED_DIST",
      "UNDECLARED_GENERATED_FILE",
      "UNDECLARED_ENVIRONMENT",
      "ABSOLUTE_PATH",
      "TIMESTAMP_INPUT",
      "HOST_INPUT",
      "RANDOM_INPUT",
      "CACHE_RELIANCE",
      "NETWORK_RELIANCE",
    ]
  ) assert(result.findings.some((item) => item.code === code), code);
  assertEquals(result.status, "FAIL");
});

Deno.test("FP007-CLEAN-ROOM-001 detects POSIX, Windows, UNC, and file URLs without flagging HTTPS", () => {
  const result = analyzeCleanRoom({
    workspaceStatus: "clean",
    generatedFiles: [
      "/opt/build/out.js",
      "/workspace/out.js",
      "/tmp/out.js",
      "C:\\build\\out.js",
      "\\\\server\\share\\out.js",
      "file:///var/tmp/out.js",
      "https://example.invalid/out.js",
    ],
    declaredGeneratedFiles: [],
    sourceTexts: [],
    usedEnvironmentNames: [],
    declaredEnvironmentNames: [],
    commands: [],
    networkMode: "disabled",
    cacheMode: "disabled",
  });
  const absoluteFindings = result.findings.filter((item) =>
    item.code === "ABSOLUTE_PATH"
  );
  assertEquals(absoluteFindings.length, 6);
  assertEquals(
    result.findings.some((item) =>
      item.code === "ABSOLUTE_PATH" &&
      item.subject === "https://example.invalid/out.js"
    ),
    false,
  );
});

Deno.test("FP007-SECRET-001 redacts nested objects, arrays, URL queries, headers, JWT, email, and encoded secret", () => {
  const value = redactAuditValue({
    nested: {
      authorization: "Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.signature",
      array: [
        "person@example.com",
        "https://example.invalid/download?token=secret-value&safe=1",
        "c2VjcmV0PXNlY3JldC12YWx1ZQ==",
        "Authorization: Bearer raw-secret-value",
      ],
    },
  }, ["secret-value", "raw-secret-value"]);
  const serialized = JSON.stringify(value);
  for (
    const secret of [
      "person@example.com",
      "secret-value",
      "raw-secret-value",
      "eyJhbGci",
    ]
  ) assertEquals(serialized.includes(secret), false, `leaked ${secret}`);
  assert(serialized.includes("REDACTED"));
});

Deno.test("FP007-SECRET-001 records environment names and presence without values", () => {
  const result = redactEnvironmentNames({
    SAFE_MODE: "1",
    SECRET_TOKEN: "private-value",
    ABSENT: undefined,
  });
  assertEquals(result.names.join(","), "ABSENT,SAFE_MODE,SECRET_TOKEN");
  assertEquals(result.present.join(","), "SAFE_MODE,SECRET_TOKEN");
  assertEquals(JSON.stringify(result).includes("private-value"), false);
});

Deno.test("FP007-SECRET-001 uses salted fingerprints without exposing environment values", async () => {
  const result = await redactEnvironmentWithFingerprints(
    { SECRET_TOKEN: "private-value" },
    "fixture-salt",
  );
  assert(result.fingerprints.SECRET_TOKEN?.startsWith("sha256:") === true);
  assertEquals(JSON.stringify(result).includes("private-value"), false);
  const repeated = await redactEnvironmentWithFingerprints(
    { SECRET_TOKEN: "private-value" },
    "fixture-salt",
  );
  assertEquals(
    result.fingerprints.SECRET_TOKEN,
    repeated.fingerprints.SECRET_TOKEN,
  );
});
