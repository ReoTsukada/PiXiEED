#!/usr/bin/env node

/**
 * Validate the shared Qualification Evidence V1 shape.
 *
 * This validator is deliberately fail-closed: package-level review, test
 * counts, or a zero exit code cannot fill an acceptance-level reviewer or
 * artifact that the evidence document does not contain.
 */
import fs from "node:fs";

const STATUSES = new Set(["PASS", "PARTIAL", "BLOCKED", "UNTESTED"]);
const ADAPTER_CLASSES = new Set([
  "IN_MEMORY",
  "PRODUCTION_EQUIVALENT",
  "PRODUCTION_INTEGRATED",
  "UNTESTED",
]);
const CLASSIFICATIONS = new Set([
  "IMPLEMENTED_ISOLATED",
  "PRODUCTION_EQUIVALENT",
  "PRODUCTION_INTEGRATED",
  "UNTESTED",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(nonEmptyString);
}

function add(issues, code, path, detail, blocking = true) {
  issues.push({ code, path, detail, blocking });
}

export function validateQualificationEvidence(document) {
  const issues = [];
  if (!isRecord(document)) {
    add(issues, "DOCUMENT_NOT_OBJECT", "$", "JSON root must be an object");
    return { valid: false, qualificationReady: false, issues };
  }
  if (document.evidenceVersion !== "QUALIFICATION_EVIDENCE_V1") {
    add(issues, "EVIDENCE_VERSION_INVALID", "evidenceVersion", "expected QUALIFICATION_EVIDENCE_V1");
  }
  if (!nonEmptyString(document.packageId)) {
    add(issues, "PACKAGE_ID_MISSING", "packageId", "packageId is required");
  }
  if (!isSha256(document.contextSha256)) {
    add(issues, "CONTEXT_HASH_INVALID", "contextSha256", "a SHA-256 Context hash is required");
  }
  if (!STATUSES.has(document.status)) {
    add(issues, "STATUS_INVALID", "status", "status must be PASS, PARTIAL, BLOCKED, or UNTESTED");
  }
  if (document.noProductionClaims !== true) {
    add(issues, "PRODUCTION_CLAIM_GUARD_MISSING", "noProductionClaims", "must be true for isolated qualification evidence");
  }
  if (!Array.isArray(document.acceptance) || document.acceptance.length === 0) {
    add(issues, "ACCEPTANCE_ROWS_MISSING", "acceptance", "one row is required for every acceptance ID");
    return { valid: false, issues };
  }

  const ids = new Set();
  for (const [index, row] of document.acceptance.entries()) {
    const prefix = `acceptance[${index}]`;
    if (!isRecord(row)) {
      add(issues, "ACCEPTANCE_ROW_INVALID", prefix, "row must be an object");
      continue;
    }
    if (!nonEmptyString(row.id)) add(issues, "ACCEPTANCE_ID_MISSING", `${prefix}.id`, "id is required");
    else if (ids.has(row.id)) add(issues, "ACCEPTANCE_ID_DUPLICATE", `${prefix}.id`, `duplicate id ${row.id}`);
    else ids.add(row.id);
    if (!STATUSES.has(row.status)) add(issues, "ACCEPTANCE_STATUS_INVALID", `${prefix}.status`, "invalid acceptance status");
    for (const field of ["source", "contract", "schema", "build"]) {
      if (!nonEmptyStringArray(row[field])) add(issues, "ACCEPTANCE_TRACE_MISSING", `${prefix}.${field}`, `${field} must contain at least one path`);
    }
    if (!Array.isArray(row.commands) || row.commands.length === 0) {
      add(issues, "ACCEPTANCE_COMMANDS_MISSING", `${prefix}.commands`, "at least one executed command is required");
    } else {
      for (const [commandIndex, command] of row.commands.entries()) {
        const commandPath = `${prefix}.commands[${commandIndex}]`;
        if (!isRecord(command) || !nonEmptyString(command.command)) {
          add(issues, "COMMAND_INVALID", commandPath, "command text is required");
          continue;
        }
        if (!Number.isInteger(command.exitCode)) {
          add(issues, "COMMAND_EXIT_MISSING", `${commandPath}.exitCode`, "exitCode must be recorded");
        }
      }
    }
    if (!ADAPTER_CLASSES.has(row.adapterClass)) add(issues, "ADAPTER_CLASS_INVALID", `${prefix}.adapterClass`, "invalid adapter class");
    if (!CLASSIFICATIONS.has(row.classification)) add(issues, "CLASSIFICATION_INVALID", `${prefix}.classification`, "invalid evidence classification");
    if (row.classification === "PRODUCTION_INTEGRATED" && document.noProductionClaims === true) {
      add(issues, "PRODUCTION_CLASSIFICATION_OVERCLAIM", `${prefix}.classification`, "isolated evidence cannot claim PRODUCTION_INTEGRATED");
    }

    const pass = row.status === "PASS";
    if (pass) {
      if (!nonEmptyString(row.reviewer)) add(issues, "ACCEPTANCE_REVIEWER_MISSING", `${prefix}.reviewer`, "PASS requires an acceptance-level reviewer");
      if (!Array.isArray(row.artifactHashes) || row.artifactHashes.length === 0 || !row.artifactHashes.every(isSha256)) {
        add(issues, "ACCEPTANCE_ARTIFACT_HASH_MISSING", `${prefix}.artifactHashes`, "PASS requires at least one SHA-256 artifact hash");
      }
      if (Array.isArray(row.commands) && row.commands.some((command) => command.exitCode !== 0)) {
        add(issues, "ACCEPTANCE_COMMAND_FAILED", `${prefix}.commands`, "PASS cannot contain a non-zero command");
      }
    }
  }

  if (document.status === "PASS" && document.acceptance.some((row) => row.status !== "PASS")) {
    add(issues, "PACKAGE_PASS_WITH_INCOMPLETE_ROWS", "status", "package PASS requires every acceptance row to be PASS");
  }
  return {
    valid: issues.length === 0,
    qualificationReady: issues.length === 0 && document.status === "PASS",
    issues,
  };
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/validate-qualification-evidence.mjs <evidence.json>");
    process.exitCode = 2;
    return;
  }
  let document;
  try {
    document = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(JSON.stringify({ valid: false, issues: [{ code: "JSON_READ_FAILED", path: file, detail: String(error), blocking: true }] }, null, 2));
    process.exitCode = 2;
    return;
  }
  const result = validateQualificationEvidence(document);
  console.log(JSON.stringify({ file, ...result }, null, 2));
  process.exitCode = result.valid ? 0 : 2;
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) main();
