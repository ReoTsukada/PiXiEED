#!/usr/bin/env node

/**
 * One-time adapter from legacy package reports to the CORE-120 predecessor
 * shape. It only promotes rows whose command transcript has exitCode 0 and
 * whose review scope is explicit in this checked-in mapping. Untested rows
 * remain untested; no aggregate count is used as a row-level result.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const ROOT = process.cwd();
const TRANSCRIPT_PATH = "docs/inventory/core-120-predecessor-command-transcript.json";
const OUTPUT_PATH = "docs/inventory/core-120-predecessors.json";
const REVIEWER = "SOL_INDEPENDENT_AUDIT";

const configs = {
  "CORE-100": {
    status: "ACCEPTED_ISOLATED",
    reviewStatus: "INDEPENDENT_REVIEW_PASS",
    acceptanceIds: ["CORE100-SCOPE-001", "CORE100-EVIDENCE-001", "CORE100-STOP-001"],
    passIds: ["CORE100-SCOPE-001", "CORE100-EVIDENCE-001", "CORE100-STOP-001"],
    source: ["pixiedraw2/src/core/core-100"],
    contract: ["docs/contracts/CORE-100-composition.md"],
    schema: ["pixiedraw2/src/core/core-100/contracts.ts"],
    build: ["pixiedraw2/benchmarks/core-100/composition.bench.ts"],
    commandIds: {
      "CORE100-SCOPE-001": ["CORE100-TEST", "CORE100-TYPE"],
      "CORE100-EVIDENCE-001": ["CORE100-TEST", "CORE100-TYPE", "CORE100-BENCH"],
      "CORE100-STOP-001": ["CORE100-DIFF", "BOUNDARY-IMPORT-SCAN"],
    },
    rawEvidence: "docs/inventory/core-100-evidence.json",
  },
  "CORE-110": {
    status: "ACCEPTED_ISOLATED",
    reviewStatus: "INDEPENDENT_REVIEW_PASS",
    acceptanceIds: ["CORE110-SCOPE-001", "CORE110-EVIDENCE-001", "CORE110-STOP-001"],
    passIds: ["CORE110-SCOPE-001", "CORE110-EVIDENCE-001", "CORE110-STOP-001"],
    source: ["pixiedraw2/src/core/core-110"],
    contract: ["docs/contracts/CORE-110-CONFORMANCE.md"],
    schema: ["pixiedraw2/src/core/core-110/contracts.ts"],
    build: ["pixiedraw2/benchmarks/core-110/generate-evidence.ts", "pixiedraw2/benchmarks/core-110/run-conformance-benchmark.ts"],
    commandIds: {
      "CORE110-SCOPE-001": ["CORE110-TEST", "CORE110-TYPE"],
      "CORE110-EVIDENCE-001": ["CORE110-TEST", "CORE110-TYPE", "CORE110-BENCH"],
      "CORE110-STOP-001": ["CORE110-DIFF", "BOUNDARY-IMPORT-SCAN"],
    },
    rawEvidence: "docs/inventory/core-110-evidence.json",
  },
  "FP-004": {
    status: "ISOLATED_REFERENCE_COMPLETE",
    reviewStatus: "INDEPENDENT_REVIEW_PASS",
    acceptanceIds: ["FP004-EVT-001", "FP004-EVT-002", "FP004-INBOX-001", "FP004-ORDER-001", "FP004-RECOVERY-001", "FP004-REPLAY-001", "FP004-SEC-001"],
    passIds: ["FP004-EVT-001", "FP004-EVT-002", "FP004-INBOX-001", "FP004-ORDER-001", "FP004-RECOVERY-001", "FP004-REPLAY-001", "FP004-SEC-001"],
    source: ["pixiedraw2/src/fp-004"],
    contract: ["docs/contracts/FP-004-DURABLE-EVENT.md", "docs/contracts/FP-004-CONFORMANCE-MATRIX.md"],
    schema: ["pixiedraw2/src/fp-004/contracts.ts"],
    build: ["pixiedraw2/benchmarks/fp004-durable-event-benchmark.ts"],
    commandIds: {
      "FP004-EVT-001": ["FP004-TEST", "FP004-FILE", "FP004-TYPE", "FP004-BENCH"],
      "FP004-EVT-002": ["FP004-TEST", "FP004-TYPE", "FP004-BENCH"],
      "FP004-INBOX-001": ["FP004-TEST", "FP004-TYPE"],
      "FP004-ORDER-001": ["FP004-TEST", "FP004-TYPE"],
      "FP004-RECOVERY-001": ["FP004-TEST", "FP004-FILE", "FP004-TYPE", "FP004-BENCH"],
      "FP004-REPLAY-001": ["FP004-TEST", "FP004-TYPE"],
      "FP004-SEC-001": ["FP004-TEST", "FP004-TYPE"],
    },
    rawEvidence: "docs/inventory/fp-004-evidence.json",
  },
  "FP-005": {
    status: "ISOLATED_REFERENCE_COMPLETE",
    reviewStatus: "INDEPENDENT_REVIEW_PASS",
    acceptanceIds: ["FP005-PII-001", "FP005-STORAGE-001", "FP005-INPUT-001", "FP005-PATH-001", "FP005-TELEMETRY-001"],
    passIds: ["FP005-PII-001", "FP005-STORAGE-001", "FP005-INPUT-001", "FP005-PATH-001", "FP005-TELEMETRY-001"],
    source: ["pixiedraw2/src/fp-005"],
    contract: ["docs/contracts/FP-005-CONTRACTS.md", "docs/contracts/FP-005-INTEGRATION.md"],
    schema: ["pixiedraw2/src/fp-005/contracts.ts"],
    build: ["pixiedraw2/benchmarks/fp-005/validation.bench.ts"],
    commandIds: {
      "FP005-PII-001": ["FP005-TEST", "FP005-BENCH", "FP005-BASELINE"],
      "FP005-STORAGE-001": ["FP005-TEST", "FP005-BENCH"],
      "FP005-INPUT-001": ["FP005-TEST", "FP005-BENCH"],
      "FP005-PATH-001": ["FP005-TEST", "FP005-BENCH"],
      "FP005-TELEMETRY-001": ["FP005-TEST", "FP005-BENCH", "FP005-DIFF"],
    },
    rawEvidence: "docs/inventory/fp-005-evidence.json",
  },
  "FP-007": {
    status: "ACCEPTED_ISOLATED_WITH_EXTERNAL_BLOCKERS",
    reviewStatus: "APPROVED_WITH_EXTERNAL_BLOCKERS",
    acceptanceIds: ["FP007-SCHEMA-001", "FP007-DEP-001", "FP007-BUILD-001", "FP007-DIST-001", "FP007-PROVENANCE-001"],
    passIds: ["FP007-DEP-001", "FP007-BUILD-001"],
    untestedIds: ["FP007-SCHEMA-001", "FP007-DIST-001", "FP007-PROVENANCE-001"],
    source: ["pixiedraw2/src/fp-007"],
    contract: ["docs/contracts/FP-007-INTEGRATION.md", "docs/contracts/FP-007-schema-registry.md"],
    schema: ["pixiedraw2/src/fp-007/schema-registry.ts", "pixiedraw2/src/fp-007/schema-compatibility.ts"],
    build: ["pixiedraw2/benchmarks/fp-007/repeat-build.ts"],
    commandIds: {
      "FP007-SCHEMA-001": ["FP007-TEST", "FP007-NONINTRUSION"],
      "FP007-DEP-001": ["FP007-TEST", "FP007-BUILD", "BASELINE-IDENTITY", "BASELINE-SUITE"],
      "FP007-BUILD-001": ["FP007-TEST", "FP007-BUILD", "BASELINE-IDENTITY", "BASELINE-SUITE"],
      "FP007-DIST-001": ["FP007-TEST"],
      "FP007-PROVENANCE-001": ["FP007-TEST", "FP007-NONINTRUSION", "FP007-DIFF", "BOUNDARY-IMPORT-SCAN", "BASELINE-IDENTITY", "BASELINE-SUITE"],
    },
    rawEvidence: "docs/inventory/fp-007-evidence.json",
  },
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}

function filesFor(target) {
  const absolute = path.join(ROOT, target);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return [target];
  const result = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.join(target, entry.name);
    result.push(...(entry.isDirectory() ? filesFor(child) : [child]));
  }
  return result;
}

function pathHash(paths) {
  const material = [];
  for (const target of paths) {
    for (const file of filesFor(target)) {
      const bytes = fs.readFileSync(path.join(ROOT, file));
      material.push(`${file}\0${sha256(bytes)}`);
    }
  }
  return material.length ? sha256(material.sort().join("\n")) : null;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
}

function transcriptById(transcript) {
  return new Map(transcript.commands.map((row) => [row.id, row]));
}

function main() {
  const transcript = readJson(TRANSCRIPT_PATH);
  const byId = transcriptById(transcript);
  const packages = {};
  for (const [packageId, config] of Object.entries(configs)) {
    const hashes = {
      sourceHash: pathHash(config.source),
      contractHash: pathHash(config.contract),
      schemaHash: pathHash(config.schema),
      buildHash: pathHash(config.build),
    };
    const acceptance = config.acceptanceIds.map((id) => {
      const commandIds = config.commandIds[id] ?? [];
      const commands = commandIds.map((commandId) => byId.get(commandId)).filter(Boolean);
      const commandOk = commands.length === commandIds.length && commands.every((row) => row.exitCode === 0);
      const untested = config.untestedIds?.includes(id) ?? false;
      const rowMaterial = { packageId, id, commandIds, commands, hashes };
      const status = untested ? "UNTESTED" : commandOk ? "PASS_ISOLATED_REFERENCE" : "BLOCKED";
      return {
        id,
        status,
        source: config.source,
        contract: config.contract,
        schema: config.schema,
        build: config.build,
        exitCode: untested ? null : commandOk ? 0 : 1,
        reviewer: untested ? null : commandOk ? REVIEWER : null,
        artifactHash: untested ? null : sha256(stable(rowMaterial)),
        hashes,
        classification: untested ? "UNTESTED" : "IMPLEMENTED_ISOLATED",
        adapterClass: untested ? "UNTESTED" : "IN_MEMORY",
        findingIdentity: untested ? `${packageId}:${id}:UNTESTED` : null,
        commandIds,
      };
    });
    packages[packageId] = {
      packageId,
      sourceEvidencePath: config.rawEvidence,
      status: config.status,
      independentReview: {
        reviewer: REVIEWER,
        status: config.reviewStatus,
        reviewScope: { acceptanceIds: config.passIds },
        basis: "CORE-120 predecessor command transcript plus source/contract/schema/build hash review",
      },
      acceptance,
      untested: acceptance.filter((row) => row.status === "UNTESTED").map((row) => row.id),
      externalBlockers: packageId === "FP-007" ? ["REAL_DIST_PROVENANCE_NOT_QUALIFIED", "CURRENT_SYSTEM_QUALIFICATION_UNTESTED", "PRODUCTION_QUALIFICATION_UNTESTED"] : [],
      transcript: { path: TRANSCRIPT_PATH, sha256: transcript.transcriptSha256 },
    };
  }
  const document = {
    evidenceVersion: "CORE120_PREDECESSOR_NORMALIZATION_V1",
    reviewer: REVIEWER,
    transcript: { path: TRANSCRIPT_PATH, sha256: transcript.transcriptSha256 },
    packages,
  };
  fs.writeFileSync(path.join(ROOT, OUTPUT_PATH), `${JSON.stringify(document, null, 2)}\n`);
  console.log(JSON.stringify({ output: OUTPUT_PATH, packages: Object.keys(packages), transcriptSha256: transcript.transcriptSha256 }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
