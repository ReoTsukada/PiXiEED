#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = "scripts/fixtures/agent-package-preflight-boundary-matrix-v1.json";
const requiredRiskClasses = ["authority", "security", "privacy", "lifecycle"];
const requiredForbiddenOperations = [
  "network",
  "production",
  "real-data",
  "real-account",
  "real-user-data",
  "production-db",
  "production-storage",
  "provider-write",
  "secrets",
  "ad-hoc-eval",
  "deploy",
  "publish",
  "commit",
  "push",
  "migrate",
  "route-cutover",
  "cutover",
  "real-payment",
  "real-payout",
  "store-submit",
  "production-signing",
  "auto-start-next-package",
];
const requiredCaseIds = [
  "AUTHORITY-ROOT-001",
  "RESOLVER-IDENTITY-001",
  "CALLER-STATE-001",
  "EVENT-ID-001",
  "REPLAY-REVOKE-001",
];
const forbiddenSourceTokens = [
  "ch\u0069ld_process",
  "sp\u0061wn(",
  "ex\u0065c(",
  "ev\u0061l(",
  "fet\u0063h(",
  "XMLHttp" + "Request",
  "http\u003a//",
  "https\u003a//",
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeRepoRelative(value) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value)) {
    throw new Error(`repository-relative path required: ${value}`);
  }
  const normalized = value.replaceAll("\\", "/");
  if (normalized.split("/").includes("..")) {
    throw new Error(`parent path is forbidden: ${value}`);
  }
  const absolute = path.resolve(root, normalized);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`path escapes repository: ${value}`);
  }
  return relative.split(path.sep).join("/");
}

function absoluteRepoPath(relativePath) {
  return path.join(root, normalizeRepoRelative(relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(absoluteRepoPath(relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(relativePath) {
  return sha256Text(readText(relativePath));
}

function parseArgs(argv) {
  const manifestIndex = argv.indexOf("--manifest");
  if (manifestIndex < 0 || !argv[manifestIndex + 1] || argv[manifestIndex + 1].startsWith("--")) {
    throw new Error("--manifest <repository-relative-manifest.json> is required");
  }
  return {
    manifestPath: normalizeRepoRelative(argv[manifestIndex + 1]),
    selfTest: argv.includes("--self-test"),
  };
}

function evaluateBoundaryProbe(probe) {
  const input = probe.input ?? {};
  switch (probe.id) {
    case "AUTHORITY-ROOT-001":
      return input.publicExportSource !== "server" ||
          input.authoritySource !== "server" ||
          input.resolverSource !== "server" ||
          input.factorySource !== "server"
        ? { accepted: false, reasonCode: "CALLER_INJECTION_REJECTED" }
        : { accepted: true, reasonCode: "SERVER_COMPOSITION_ACCEPTED" };
    case "RESOLVER-IDENTITY-001": {
      const identityKeys = [
        ["lookupId", "returnedId"],
        ["lookupType", "returnedType"],
        ["lookupTenant", "returnedTenant"],
        ["lookupVersion", "returnedVersion"],
        ["lookupRevision", "returnedRevision"],
        ["lookupContent", "returnedContent"],
      ];
      const mismatch = identityKeys.some(([lookupKey, returnedKey]) =>
        input[lookupKey] !== input[returnedKey]
      );
      return mismatch
        ? { accepted: false, reasonCode: "CANONICAL_IDENTITY_MISMATCH" }
        : { accepted: true, reasonCode: "CANONICAL_IDENTITY_MATCH" };
    }
    case "CALLER-STATE-001": {
      const stateKeys = [
        ["canonicalVisibility", "callerVisibility"],
        ["canonicalLifecycle", "callerLifecycle"],
        ["canonicalModeration", "callerModeration"],
        ["canonicalMembership", "callerMembership"],
        ["canonicalLocked", "callerLocked"],
      ];
      const substituted = input.stateSource !== "server" ||
        stateKeys.some(([canonicalKey, callerKey]) =>
          input[canonicalKey] !== input[callerKey]
        );
      return substituted
        ? { accepted: false, reasonCode: "CALLER_STATE_NOT_AUTHORITY" }
        : { accepted: true, reasonCode: "CANONICAL_STATE_MATCH" };
    }
    case "EVENT-ID-001":
      return input.eventSource !== "server-id" ||
          input.lookupEventId !== input.returnedEventId
        ? { accepted: false, reasonCode: "CANONICAL_EVENT_ID_REQUIRED" }
        : { accepted: true, reasonCode: "CANONICAL_EVENT_ID_MATCH" };
    case "REPLAY-REVOKE-001":
      return input.transitionSource !== "server" ||
          input.operation !== "revoke" ||
          input.replayed === true ||
          input.stale === true ||
          typeof input.serverEventId !== "string" ||
          input.authorizationSource !== "server"
        ? { accepted: false, reasonCode: "LIFECYCLE_TRANSITION_NOT_AUTHORIZED" }
        : { accepted: true, reasonCode: "LIFECYCLE_TRANSITION_AUTHORIZED" };
    default:
      return { accepted: false, reasonCode: "UNKNOWN_BOUNDARY_PROBE" };
  }
}

function runBoundaryProbes(fixture) {
  const probes = fixture.boundaryProbes ?? [];
  const results = probes.map((probe) => {
    const decision = evaluateBoundaryProbe(probe);
    const passed = decision.accepted === false &&
      probe.expectedOutcome === "REJECT" &&
      decision.reasonCode === probe.expectedReasonCode;
    return {
      id: probe.id,
      passed,
      accepted: decision.accepted,
      reasonCode: decision.reasonCode,
    };
  });
  return {
    results,
    issues: results
      .filter((result) => !result.passed)
      .map((result) => `boundary probe did not reject substituted input: ${result.id}`),
  };
}

function validateExecutionPolicy(policy, issues, sourceLabel, required = false) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    if (required) issues.push(`${sourceLabel} executionPolicy is required`);
    return;
  }
  if (policy.mode !== "BALANCED") issues.push(`${sourceLabel} executionPolicy mode must default to BALANCED`);
  if (policy.contract !== "required-before-implementation") {
    issues.push(`${sourceLabel} executionPolicy contract must be required-before-implementation`);
  }
  const budget = policy.changeBudget;
  if (!budget || typeof budget !== "object") {
    issues.push(`${sourceLabel} executionPolicy changeBudget is required`);
  } else {
    const budgetRules = [
      ["maxChangedLines", 500],
      ["maxFiles", 4],
      ["maxRetries", 2],
      ["maxFullAudits", 1],
      ["maxFullEvidenceRuns", 1],
    ];
    for (const [field, maximum] of budgetRules) {
      if (!Number.isInteger(budget[field]) || budget[field] < 1 || budget[field] > maximum) {
        issues.push(`${sourceLabel} executionPolicy changeBudget.${field} must be an integer <= ${maximum}`);
      }
    }
  }
  const tiers = policy.testTiers;
  if (!tiers || typeof tiers !== "object") {
    issues.push(`${sourceLabel} executionPolicy testTiers is required`);
  } else {
    if (tiers.specialistMax !== 1) issues.push(`${sourceLabel} specialistMax tier must be 1`);
    if (tiers.integratorMax !== 2) issues.push(`${sourceLabel} integratorMax tier must be 2`);
    if (tiers.finalMax !== 4) issues.push(`${sourceLabel} finalMax tier must be 4`);
  }
  const exactRules = [
    ["maxAffectedDiffReviews", 1],
    ["maxReleaseGateFullAudits", 1],
    ["maxFullEvidenceRuns", 1],
    ["evidenceRuns", 1],
    ["integratorTier", 2],
  ];
  for (const [field, expected] of exactRules) {
    if (policy[field] !== expected) issues.push(`${sourceLabel} executionPolicy ${field} must be ${expected}`);
  }
  if (policy.terraMode !== "READ_ONLY_FINAL") {
    issues.push(`${sourceLabel} executionPolicy terraMode must be READ_ONLY_FINAL`);
  }
  if (policy.specialistPolicy !== "DISJOINT_ONLY") {
    issues.push(`${sourceLabel} executionPolicy specialistPolicy must be DISJOINT_ONLY`);
  }
  if (policy.sameCategoryEscalation !== "SOL") {
    issues.push(`${sourceLabel} executionPolicy sameCategoryEscalation must be SOL`);
  }
}

function validateFixture(fixture) {
  const issues = [];
  const requireValue = (condition, message) => {
    if (!condition) issues.push(message);
  };
  const configuredRiskClasses = new Set(fixture.requiredRiskClasses ?? []);
  const matrix = fixture.boundaryMatrix ?? [];
  const probes = fixture.boundaryProbes ?? [];
  const checklist = fixture.terraReviewChecklist ?? [];
  const commands = fixture.requiredCommands ?? [];
  const forbiddenOperations = new Set(fixture.forbiddenOperations ?? []);
  const serialized = JSON.stringify(fixture);

  requireValue(
    fixture.schemaVersion === "AGENT_PACKAGE_PREFLIGHT_V1",
    "schemaVersion must be AGENT_PACKAGE_PREFLIGHT_V1",
  );
  requireValue(
    fixture.classification === "FIXED_SYNTHETIC",
    "fixture must remain FIXED_SYNTHETIC",
  );
  requireValue(fixture.network === false, "network must be false");
  requireValue(fixture.productionAccess === false, "productionAccess must be false");
  requireValue(fixture.realData === false, "realData must be false");
  requireValue(fixture.max_fix_rounds === 2, "max_fix_rounds must be 2");
  validateExecutionPolicy(fixture.executionPolicy, issues, "fixture", true);
  requireValue(
    Number.isInteger(fixture.timebox_minutes) && fixture.timebox_minutes > 0,
    "timebox_minutes must be a positive integer",
  );
  requireValue(
    Number.isInteger(fixture.checkpoint_every_minutes) &&
      fixture.checkpoint_every_minutes > 0 &&
      fixture.checkpoint_every_minutes <= fixture.timebox_minutes,
    "checkpoint_every_minutes must be within timebox",
  );
  for (const riskClass of requiredRiskClasses) {
    requireValue(
      configuredRiskClasses.has(riskClass),
      `required risk class missing: ${riskClass}`,
    );
  }
  requireValue(matrix.length >= 5, "boundary matrix must contain five rows");
  requireValue(
    probes.length === matrix.length,
    "boundary probes must map one-to-one to the boundary matrix",
  );
  const matrixIds = new Set(matrix.map((row) => row.id));
  const probeIds = new Set(probes.map((probe) => probe.id));
  requireValue(
    probeIds.size === probes.length &&
      [...matrixIds].every((id) => probeIds.has(id)),
    "boundary probes must cover every matrix row exactly once",
  );
  for (const row of matrix) {
    requireValue(Boolean(row.id), "boundary matrix row requires id");
    requireValue(
      configuredRiskClasses.has(row.riskClass),
      `boundary matrix row has unknown risk class: ${row.id}`,
    );
    requireValue(
      row.expectedOutcome === "REJECT",
      `boundary matrix row must reject substituted input: ${row.id}`,
    );
    requireValue(Boolean(row.reasonCode), `reasonCode missing: ${row.id}`);
  }
  for (const probe of probes) {
    requireValue(Boolean(probe.id), "boundary probe requires id");
    requireValue(
      probe.expectedOutcome === "REJECT",
      `boundary probe must reject substituted input: ${probe.id}`,
    );
    requireValue(
      Boolean(probe.expectedReasonCode),
      `boundary probe reason code missing: ${probe.id}`,
    );
  }
  requireValue(
    checklist.length >= 8,
    "Terra review checklist must contain eight boundary checks",
  );
  requireValue(
    fixture.evidenceSeparation?.schemaStatus === "PASS",
    "schema evidence must be independently reported as PASS",
  );
  requireValue(
    fixture.evidenceSeparation?.semanticAcceptanceStatus === "PENDING",
    "semantic acceptance must remain PENDING before Terra review",
  );
  requireValue(
    fixture.evidenceSeparation?.independentReviewer === "Terra High",
    "independent reviewer must be Terra High",
  );
  requireValue(
    fixture.evidenceSeparation?.lunaSelfApproval === false,
    "Luna self approval must be false",
  );
  for (const operation of requiredForbiddenOperations) {
    requireValue(
      forbiddenOperations.has(operation),
      `required forbidden operation missing: ${operation}`,
    );
  }
  for (const command of commands) {
    requireValue(
      typeof command === "string" && command.startsWith("node scripts/"),
      `required command must be a repository script: ${command}`,
    );
    requireValue(
      !/[;&|]|\b(?:eval|curl|wget|http:\/\/|https:\/\/|node\s+-e)\b/i.test(command),
      `ad-hoc or external command is forbidden: ${command}`,
    );
  }
  const terminology = fixture.terminology ?? {};
  for (const preferred of [
    "boundary validation",
    "invalid-input rejection",
    "substituted input",
  ]) {
    requireValue(
      (terminology.preferred ?? []).includes(preferred),
      `preferred terminology missing: ${preferred}`,
    );
  }
  for (const forbidden of terminology.forbidden ?? []) {
    requireValue(
      typeof forbidden === "string" && forbidden.length > 0,
      "terminology forbidden entries must be non-empty",
    );
  }
  requireValue(
    serialized.includes("public export") || serialized.includes("public contract"),
    "public surface validation must be represented",
  );
  requireValue(
    serialized.includes("direct Event object"),
    "direct Event object rejection must be represented",
  );
  return issues;
}

function validateSameClassFinding(fixRound, issues, sourceLabel) {
  if (!fixRound || typeof fixRound !== "object") {
    issues.push(`${sourceLabel} fixRound is required`);
    return;
  }
  if (fixRound.max_fix_rounds !== 2) {
    issues.push(`${sourceLabel} max_fix_rounds must be 2`);
  }
  if (!Number.isInteger(fixRound.currentRound) || fixRound.currentRound < 1 || fixRound.currentRound > 2) {
    issues.push(`${sourceLabel} currentRound must be 1 or 2`);
  }
  if (!Number.isInteger(fixRound.timebox_minutes) || fixRound.timebox_minutes <= 0) {
    issues.push(`${sourceLabel} timebox_minutes must be positive`);
  }
  if (!Number.isInteger(fixRound.checkpoint_every_minutes) ||
      fixRound.checkpoint_every_minutes <= 0 ||
      fixRound.checkpoint_every_minutes > fixRound.timebox_minutes) {
    issues.push(`${sourceLabel} checkpoint_every_minutes must be within timebox`);
  }
  const finding = fixRound.sameClassFinding;
  if (!finding || typeof finding.class !== "string" || !Number.isInteger(finding.occurrence)) {
    issues.push(`${sourceLabel} sameClassFinding is required`);
    return;
  }
  const expectedDecision = finding.occurrence >= 2 ? "STOP_DESIGN_GATE" : "CONTINUE";
  if (finding.decision !== expectedDecision) {
    issues.push(`${sourceLabel} sameClassFinding decision must be ${expectedDecision}`);
  }
  if (finding.occurrence >= 2 && fixRound.currentRound !== 2) {
    issues.push(`${sourceLabel} second sameClassFinding must be currentRound 2`);
  }
}

function validateManifestShape(manifest) {
  const issues = [];
  const requireValue = (condition, message) => {
    if (!condition) issues.push(message);
  };
  const stringArray = (value) => Array.isArray(value) &&
    value.length > 0 && value.every((item) => typeof item === "string" && item.length > 0);
  const expectedCaseMap = new Map(requiredCaseIds.map((id) => [id, null]));

  requireValue(
    manifest.schemaVersion === "AGENT_PACKAGE_PREFLIGHT_MANIFEST_V1",
    "manifest schemaVersion must be AGENT_PACKAGE_PREFLIGHT_MANIFEST_V1",
  );
  requireValue(typeof manifest.packageId === "string" && manifest.packageId.length > 0, "manifest packageId is required");
  requireValue(manifest.classification === "FIXED_SYNTHETIC", "manifest must be FIXED_SYNTHETIC");
  requireValue(manifest.network === false, "manifest network must be false");
  requireValue(manifest.productionAccess === false, "manifest productionAccess must be false");
  requireValue(manifest.realData === false, "manifest realData must be false");
  requireValue(manifest.staticOnly === true, "manifest staticOnly must be true");
  requireValue(stringArray(manifest.publicEntrypoints), "publicEntrypoints are required");
  requireValue(stringArray(manifest.serverOnlyCompositionRoots), "serverOnlyCompositionRoots are required");
  requireValue(stringArray(manifest.forbiddenPublicExports), "forbiddenPublicExports are required");
  requireValue(stringArray(manifest.forbiddenPublicConstructors), "forbiddenPublicConstructors are required");
  requireValue(stringArray(manifest.forbiddenPublicFactories), "forbiddenPublicFactories are required");
  requireValue(stringArray(manifest.expectedReasonCodes), "expectedReasonCodes are required");
  for (const riskClass of requiredRiskClasses) {
    requireValue(
      Array.isArray(manifest.requiredRiskClasses) && manifest.requiredRiskClasses.includes(riskClass),
      `manifest required risk class missing: ${riskClass}`,
    );
  }

  const cases = manifest.invalidInputCases;
  requireValue(Array.isArray(cases) && cases.length === requiredCaseIds.length, "manifest must contain five invalid input cases");
  if (Array.isArray(cases)) {
    const caseIds = new Set();
    const representedRiskClasses = new Set();
    for (const testCase of cases) {
      requireValue(typeof testCase.id === "string", "invalid input case id is required");
      caseIds.add(testCase.id);
      requireValue(requiredCaseIds.includes(testCase.id), `unknown invalid input case: ${testCase.id}`);
      requireValue(requiredRiskClasses.includes(testCase.riskClass), `invalid input case risk class is invalid: ${testCase.id}`);
      representedRiskClasses.add(testCase.riskClass);
      requireValue(testCase.expectedOutcome === "REJECT", `invalid input case must reject: ${testCase.id}`);
      requireValue(typeof testCase.reasonCode === "string" && testCase.reasonCode.length > 0, `invalid input case reason code missing: ${testCase.id}`);
      if (expectedCaseMap.has(testCase.id)) expectedCaseMap.set(testCase.id, testCase.reasonCode);
    }
    requireValue(caseIds.size === cases.length && requiredCaseIds.every((id) => caseIds.has(id)), "invalid input cases must cover all five categories exactly once");
    for (const riskClass of requiredRiskClasses) {
      requireValue(representedRiskClasses.has(riskClass), `invalid input cases missing risk class: ${riskClass}`);
    }
  }
  for (const [caseId, reasonCode] of expectedCaseMap) {
    requireValue(reasonCode && manifest.expectedReasonCodes.includes(reasonCode), `expected reason code missing for ${caseId}`);
  }

  const bindingFields = ["id", "type", "tenant", "version", "cardType"];
  const resolverBindings = manifest.resolverBindings;
  requireValue(Array.isArray(resolverBindings) && resolverBindings.length > 0, "resolverBindings are required");
  if (Array.isArray(resolverBindings)) {
    for (const binding of resolverBindings) {
      requireValue(typeof binding.name === "string", "resolver binding name is required");
      for (const side of ["requested", "returned"]) {
        requireValue(binding[side] && typeof binding[side] === "object", `resolver binding ${side} is required`);
        for (const field of bindingFields) {
          requireValue(typeof binding[side]?.[field] === "string", `resolver binding ${side}.${field} is required`);
        }
      }
      const mismatch = bindingFields.some((field) => binding.requested?.[field] !== binding.returned?.[field]);
      requireValue(mismatch, `resolver binding must include substituted identity: ${binding.name}`);
      requireValue(binding.expectedOutcome === "REJECT", `resolver binding must reject: ${binding.name}`);
      requireValue(typeof binding.reasonCode === "string" && manifest.expectedReasonCodes.includes(binding.reasonCode), `resolver binding reason code missing: ${binding.name}`);
    }
  }

  const eventFields = ["eventId", "payloadHash", "aggregate", "version"];
  const eventBindings = manifest.eventBindings;
  requireValue(Array.isArray(eventBindings) && eventBindings.length > 0, "eventBindings are required");
  if (Array.isArray(eventBindings)) {
    for (const binding of eventBindings) {
      requireValue(typeof binding.name === "string", "event binding name is required");
      for (const side of ["lookup", "resolved"]) {
        requireValue(binding[side] && typeof binding[side] === "object", `event binding ${side} is required`);
        for (const field of eventFields) {
          requireValue(binding[side]?.[field] !== undefined, `event binding ${side}.${field} is required`);
        }
      }
      const mismatch = eventFields.some((field) => binding.lookup?.[field] !== binding.resolved?.[field]);
      requireValue(mismatch, `event binding must include substituted identity: ${binding.name}`);
      requireValue(binding.expectedOutcome === "REJECT", `event binding must reject: ${binding.name}`);
      requireValue(typeof binding.reasonCode === "string" && manifest.expectedReasonCodes.includes(binding.reasonCode), `event binding reason code missing: ${binding.name}`);
    }
  }

  const invalidInputTest = manifest.invalidInputTest;
  requireValue(invalidInputTest?.mode === "STATIC_MANIFEST_AND_RESULT_ARTIFACT", "static invalid-input test manifest is required");
  requireValue(typeof invalidInputTest?.testSource === "string", "invalid input test source path is required");
  requireValue(typeof invalidInputTest?.resultArtifact === "string", "invalid input test result artifact path is required");
  requireValue(typeof manifest.evidencePath === "string", "evidencePath is required");
  requireValue(typeof manifest.checkpointPath === "string", "checkpointPath is required");
  requireValue(manifest.evidenceSeparation?.schemaStatus === "PASS", "manifest schemaStatus must be PASS");
  requireValue(manifest.evidenceSeparation?.semanticAcceptanceStatus === "PENDING", "manifest semantic acceptance must be PENDING");
  requireValue(manifest.evidenceSeparation?.independentReviewer === "Terra High", "manifest independent reviewer must be Terra High");
  requireValue(manifest.evidenceSeparation?.lunaSelfApproval === false, "manifest Luna self approval must be false");
  requireValue(typeof manifest.harnessRegistryPath === "string", "harnessRegistryPath is required");
  requireValue(typeof manifest.harnessId === "string", "harnessId is required");
  requireValue(typeof manifest.legacyHarnessAlias === "string", "legacyHarnessAlias is required");
  if (manifest.executionPolicy !== undefined) {
    validateExecutionPolicy(manifest.executionPolicy, issues, "manifest", true);
  }

  const forbiddenOperations = new Set(manifest.forbiddenOperations ?? []);
  for (const operation of requiredForbiddenOperations) {
    requireValue(forbiddenOperations.has(operation), `manifest forbidden operation missing: ${operation}`);
  }
  validateSameClassFinding(manifest.fixRound, issues, "manifest");
  return issues;
}

function extractImportSpecifiers(source) {
  const specifiers = [];
  const pattern = /\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    specifiers.push(match[1] ?? match[2]);
  }
  return specifiers;
}

function resolveRelativeImport(importerPath, specifier) {
  if (!specifier.startsWith(".")) return null;
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(importerPath), specifier));
  return joined.replace(/\.(?:mjs|js|ts|json)$/u, "");
}

function hasPublicExport(source, symbol) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\bexport\\s+(?:(?:async)\\s+)?(?:function|class|const|let|var)\\s+${escaped}\\b`).test(source) ||
    new RegExp(`\\bexport\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\}`).test(source);
}

function validateRepositoryGraph(manifest) {
  const issues = [];
  const sourceByPath = new Map();
  const loadSource = (relativePath, label) => {
    try {
      const normalized = normalizeRepoRelative(relativePath);
      const source = readText(normalized);
      sourceByPath.set(normalized, source);
      for (const token of forbiddenSourceTokens) {
        if (source.includes(token)) issues.push(`${label} contains forbidden runtime token: ${token}`);
      }
      return normalized;
    } catch (error) {
      issues.push(`${label} cannot be read: ${error.message}`);
      return null;
    }
  };

  const publicPaths = (manifest.publicEntrypoints ?? []).map((entry) => loadSource(entry, `public entrypoint ${entry}`)).filter(Boolean);
  const serverPaths = (manifest.serverOnlyCompositionRoots ?? []).map((entry) => loadSource(entry, `server composition root ${entry}`)).filter(Boolean);
  const testPath = loadSource(manifest.invalidInputTest?.testSource, "invalid input test source");
  for (const publicPath of publicPaths) {
    const source = sourceByPath.get(publicPath);
    if (!/\bexport\b/u.test(source)) issues.push(`public entrypoint has no export: ${publicPath}`);
    for (const symbol of [
      ...(manifest.forbiddenPublicExports ?? []),
      ...(manifest.forbiddenPublicConstructors ?? []),
      ...(manifest.forbiddenPublicFactories ?? []),
    ]) {
      if (hasPublicExport(source, symbol)) issues.push(`forbidden public symbol exported: ${symbol}`);
    }
    for (const specifier of extractImportSpecifiers(source)) {
      const resolved = resolveRelativeImport(publicPath, specifier);
      if (resolved && serverPaths.some((serverPath) => serverPath.replace(/\.(?:mjs|js|ts|json)$/u, "") === resolved)) {
        issues.push(`public entrypoint imports server-only composition root: ${publicPath}`);
      }
    }
  }
  for (const serverPath of serverPaths) {
    const source = sourceByPath.get(serverPath);
    if (/^\s*export\b/mu.test(source)) issues.push(`server-only composition root has public export: ${serverPath}`);
  }
  if (testPath) {
    const testSource = sourceByPath.get(testPath);
    if (!/REJECT/u.test(testSource)) issues.push("invalid input test source must contain REJECT assertions");
    for (const testCase of manifest.invalidInputCases ?? []) {
      if (!testSource.includes(testCase.id)) issues.push(`test source missing case: ${testCase.id}`);
      if (!testSource.includes(testCase.reasonCode)) issues.push(`test source missing reason code: ${testCase.reasonCode}`);
    }
  }
  return { issues, sourcePath: testPath, sourceHash: testPath ? sha256File(testPath) : null };
}

function requireResult(condition, message, issues) {
  if (!condition) issues.push(message);
}

function validateCaseResults(manifest, resultArtifact, sourceHash, issues) {
  if (!resultArtifact || typeof resultArtifact !== "object") {
    issues.push("invalid input result artifact is required");
    return;
  }
  requireResult(resultArtifact.schemaVersion === "AGENT_PACKAGE_PREFLIGHT_RESULT_V1", "result artifact schemaVersion is invalid", issues);
  requireResult(resultArtifact.packageId === manifest.packageId, "result artifact packageId is stale", issues);
  requireResult(resultArtifact.sourcePath === manifest.invalidInputTest?.testSource, "result artifact sourcePath is stale", issues);
  requireResult(resultArtifact.sourceHash === sourceHash, "result artifact sourceHash is stale", issues);
  requireResult(resultArtifact.exitCode === 0, "result artifact exitCode must be 0", issues);
  requireResult(resultArtifact.status === "PASS", "result artifact status must be PASS", issues);
  const expected = new Map((manifest.invalidInputCases ?? []).map((testCase) => [testCase.id, testCase.reasonCode]));
  const actual = new Map((resultArtifact.caseResults ?? []).map((result) => [result.caseId, result]));
  for (const [caseId, reasonCode] of expected) {
    const result = actual.get(caseId);
    requireResult(Boolean(result), `result artifact missing case: ${caseId}`, issues);
    requireResult(result?.reasonCode === reasonCode, `result artifact reason code is stale: ${caseId}`, issues);
    requireResult(result?.status === "PASS", `result artifact case is not PASS: ${caseId}`, issues);
  }
  requireResult(actual.size === expected.size, "result artifact case count is stale", issues);
  requireResult(resultArtifact.evidencePath === manifest.evidencePath, "result artifact evidencePath is stale", issues);
  requireResult(resultArtifact.checkpointPath === manifest.checkpointPath, "result artifact checkpointPath is stale", issues);
  if (manifest.executionPolicy !== undefined) {
    requireResult(
      resultArtifact.executionPolicy &&
        JSON.stringify(resultArtifact.executionPolicy) === JSON.stringify(manifest.executionPolicy),
      "result artifact executionPolicy is stale",
      issues,
    );
  }
}

function validateEvidenceAndCheckpoint(manifest, sourceHash, resultArtifact, evidence, checkpoint) {
  const issues = [];
  requireResult(evidence?.schemaVersion === "AGENT_PACKAGE_PREFLIGHT_EVIDENCE_V1", "evidence schemaVersion is invalid", issues);
  requireResult(evidence?.packageId === manifest.packageId, "evidence packageId is stale", issues);
  requireResult(evidence?.sourcePath === manifest.invalidInputTest?.testSource, "evidence sourcePath is stale", issues);
  requireResult(evidence?.sourceHash === sourceHash, "evidence sourceHash is stale", issues);
  requireResult(evidence?.resultArtifactPath === manifest.invalidInputTest?.resultArtifact, "evidence resultArtifactPath is stale", issues);
  requireResult(evidence?.schemaStatus === "PASS", "evidence schemaStatus must be PASS", issues);
  requireResult(evidence?.semanticAcceptanceStatus === "PENDING", "preflight cannot grant semantic acceptance", issues);
  requireResult(evidence?.independentReviewer === "Terra High", "evidence independentReviewer must be Terra High", issues);
  requireResult(evidence?.lunaSelfApproval === false, "Luna self approval must be false", issues);
  requireResult(evidence?.checkpointPath === manifest.checkpointPath, "evidence checkpointPath is stale", issues);
  requireResult(evidence?.fixRound && JSON.stringify(evidence.fixRound) === JSON.stringify(manifest.fixRound), "evidence fixRound is stale", issues);
  if (manifest.executionPolicy !== undefined) {
    requireResult(
      evidence?.executionPolicy &&
        JSON.stringify(evidence.executionPolicy) === JSON.stringify(manifest.executionPolicy),
      "evidence executionPolicy is stale",
      issues,
    );
  }
  requireResult(checkpoint?.schemaVersion === "AGENT_PACKAGE_PREFLIGHT_CHECKPOINT_V1", "checkpoint schemaVersion is invalid", issues);
  requireResult(checkpoint?.packageId === manifest.packageId, "checkpoint packageId is stale", issues);
  requireResult(checkpoint?.sourcePath === manifest.invalidInputTest?.testSource, "checkpoint sourcePath is stale", issues);
  requireResult(checkpoint?.sourceHash === sourceHash, "checkpoint sourceHash is stale", issues);
  const expectedCheckpointStatus = manifest.fixRound?.sameClassFinding?.occurrence >= 2
    ? "STOP_DESIGN_GATE"
    : "READY_FOR_TERRA";
  requireResult(checkpoint?.status === expectedCheckpointStatus, `checkpoint status must be ${expectedCheckpointStatus}`, issues);
  requireResult(checkpoint?.currentRound === manifest.fixRound?.currentRound, "checkpoint currentRound is stale", issues);
  requireResult(checkpoint?.max_fix_rounds === manifest.fixRound?.max_fix_rounds, "checkpoint max_fix_rounds is stale", issues);
  requireResult(checkpoint?.timebox_minutes === manifest.fixRound?.timebox_minutes, "checkpoint timebox is stale", issues);
  requireResult(checkpoint?.checkpoint_every_minutes === manifest.fixRound?.checkpoint_every_minutes, "checkpoint interval is stale", issues);
  requireResult(checkpoint?.sameClassFinding && JSON.stringify(checkpoint.sameClassFinding) === JSON.stringify(manifest.fixRound?.sameClassFinding), "checkpoint sameClassFinding is stale", issues);
  if (manifest.executionPolicy !== undefined) {
    requireResult(
      checkpoint?.executionPolicy &&
        JSON.stringify(checkpoint.executionPolicy) === JSON.stringify(manifest.executionPolicy),
      "checkpoint executionPolicy is stale",
      issues,
    );
  }
  requireResult(resultArtifact?.sourceHash === sourceHash, "evidence result artifact hash is stale", issues);
  return issues;
}

function validateHarnessAlias(manifest, registry) {
  const issues = [];
  const entry = registry?.entries?.find((candidate) => candidate.id === manifest.harnessId);
  requireResult(Boolean(entry), `Harness registry entry is missing: ${manifest.harnessId}`, issues);
  requireResult(entry?.aliases?.includes(manifest.legacyHarnessAlias), "Harness legacy alias is missing", issues);
  return issues;
}

function validateRepositoryBoundManifest(manifest, options = {}) {
  const issues = validateManifestShape(manifest);
  const graph = validateRepositoryGraph(manifest);
  issues.push(...graph.issues);
  let resultArtifact = options.resultArtifactOverride;
  let evidence = options.evidenceOverride;
  let checkpoint = options.checkpointOverride;
  let registry = options.registryOverride;
  try {
    if (!resultArtifact) resultArtifact = readJson(manifest.invalidInputTest.resultArtifact);
  } catch (error) {
    issues.push(`result artifact cannot be read: ${error.message}`);
  }
  try {
    if (!evidence) evidence = readJson(manifest.evidencePath);
  } catch (error) {
    issues.push(`evidence cannot be read: ${error.message}`);
  }
  try {
    if (!checkpoint) checkpoint = readJson(manifest.checkpointPath);
  } catch (error) {
    issues.push(`checkpoint cannot be read: ${error.message}`);
  }
  try {
    if (!registry) registry = readJson(manifest.harnessRegistryPath);
  } catch (error) {
    issues.push(`Harness registry cannot be read: ${error.message}`);
  }
  validateCaseResults(manifest, resultArtifact, graph.sourceHash, issues);
  issues.push(...validateEvidenceAndCheckpoint(manifest, graph.sourceHash, resultArtifact, evidence, checkpoint));
  issues.push(...validateHarnessAlias(manifest, registry));
  return { issues, sourceHash: graph.sourceHash, resultArtifact, evidence, checkpoint };
}

function makeStopGateSelfTestCase(manifest) {
  const candidate = clone(manifest);
  candidate.fixRound.currentRound = 2;
  candidate.fixRound.sameClassFinding.occurrence = 2;
  candidate.fixRound.sameClassFinding.decision = "STOP_DESIGN_GATE";
  const evidence = clone(readJson(manifest.evidencePath));
  const checkpoint = clone(readJson(manifest.checkpointPath));
  evidence.fixRound = clone(candidate.fixRound);
  checkpoint.status = "STOP_DESIGN_GATE";
  checkpoint.currentRound = candidate.fixRound.currentRound;
  checkpoint.sameClassFinding = clone(candidate.fixRound.sameClassFinding);
  return [
    "second same-class finding STOP gate",
    candidate,
    { evidenceOverride: evidence, checkpointOverride: checkpoint },
    false,
  ];
}

function runSelfTest(fixture, manifest) {
  const cases = [
    ["valid repository-bound fixture", manifest, {}, false],
    [
      "accepted outcome mutation",
      (() => {
        const candidate = clone(manifest);
        candidate.invalidInputCases[0].expectedOutcome = "ACCEPT";
        return candidate;
      })(),
      {},
      true,
    ],
    [
      "reason replacement mutation",
      (() => {
        const candidate = clone(manifest);
        candidate.invalidInputCases[0].reasonCode = "SUBSTITUTED_REASON";
        candidate.expectedReasonCodes[0] = "SUBSTITUTED_REASON";
        return candidate;
      })(),
      {},
      true,
    ],
    [
      "probe missing mutation",
      (() => {
        const candidate = clone(manifest);
        candidate.invalidInputCases.pop();
        return candidate;
      })(),
      {},
      true,
    ],
    [
      "required risk class mutation",
      (() => {
        const candidate = clone(manifest);
        candidate.requiredRiskClasses = candidate.requiredRiskClasses.filter((riskClass) => riskClass !== "privacy");
        return candidate;
      })(),
      {},
      true,
    ],
    [
      "execution policy mutation",
      (() => {
        const candidate = clone(manifest);
        candidate.executionPolicy.mode = "TURBO";
        candidate.executionPolicy.changeBudget.maxFiles = 5;
        return candidate;
      })(),
      {},
      true,
    ],
    makeStopGateSelfTestCase(manifest),
    [
      "second same-class finding mutation",
      (() => {
        const candidate = clone(manifest);
        candidate.fixRound.sameClassFinding.occurrence = 2;
        candidate.fixRound.sameClassFinding.decision = "CONTINUE";
        return candidate;
      })(),
      {},
      true,
    ],
    [
      "stale result artifact mutation",
      manifest,
      { resultArtifactOverride: { ...readJson(manifest.invalidInputTest.resultArtifact), sourceHash: "stale-source-hash" } },
      true,
    ],
    [
      "Harness alias mutation",
      manifest,
      {
        registryOverride: (() => {
          const registry = clone(readJson(manifest.harnessRegistryPath));
          const entry = registry.entries.find((candidate) => candidate.id === manifest.harnessId);
          entry.aliases = [];
          return registry;
        })(),
      },
      true,
    ],
  ];
  const results = cases.map(([name, candidate, options, shouldFail]) => {
    const result = validateRepositoryBoundManifest(candidate, options);
    const passed = shouldFail ? result.issues.length > 0 : result.issues.length === 0;
    return { name, passed, issueCount: result.issues.length };
  });
  const fixtureProbeRun = runBoundaryProbes(fixture);
  return {
    results,
    fixtureBoundaryProbes: fixtureProbeRun.results,
    fixtureIssues: fixtureProbeRun.issues,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixture = readJson(fixturePath);
  const manifest = readJson(args.manifestPath);
  const fixtureIssues = validateFixture(fixture);
  const boundaryProbeRun = runBoundaryProbes(fixture);
  const repositoryRun = validateRepositoryBoundManifest(manifest);
  const selfTest = args.selfTest ? runSelfTest(fixture, manifest) : null;
  const selfTestIssues = selfTest
    ? [
        ...selfTest.results.filter((result) => !result.passed).map((result) => `self-test failed: ${result.name}`),
        ...selfTest.fixtureIssues,
      ]
    : [];
  const issues = [
    ...fixtureIssues,
    ...boundaryProbeRun.issues,
    ...repositoryRun.issues,
    ...selfTestIssues,
  ];
  const passed = issues.length === 0;
  console.log(JSON.stringify({
    fixture: fixturePath,
    manifest: args.manifestPath,
    classification: manifest.classification,
    packageId: manifest.packageId,
    boundaryRows: fixture.boundaryMatrix.length,
    boundaryProbes: boundaryProbeRun.results,
    repositoryBound: true,
    publicEntrypoints: manifest.publicEntrypoints,
    serverOnlyCompositionRoots: manifest.serverOnlyCompositionRoots,
    sourceHash: repositoryRun.sourceHash,
    max_fix_rounds: manifest.fixRound?.max_fix_rounds,
    timebox_minutes: manifest.fixRound?.timebox_minutes,
    checkpoint_every_minutes: manifest.fixRound?.checkpoint_every_minutes,
    executionMode: manifest.executionPolicy?.mode ?? "LEGACY_UNSPECIFIED",
    maxAffectedDiffReviews: manifest.executionPolicy?.maxAffectedDiffReviews ?? "LEGACY_UNSPECIFIED",
    maxReleaseGateFullAudits: manifest.executionPolicy?.maxReleaseGateFullAudits ?? "LEGACY_UNSPECIFIED",
    maxFullEvidenceRuns: manifest.executionPolicy?.maxFullEvidenceRuns ?? "LEGACY_UNSPECIFIED",
    network: manifest.network,
    productionAccess: manifest.productionAccess,
    realData: manifest.realData,
    schemaStatus: manifest.evidenceSeparation?.schemaStatus ?? "FAIL",
    semanticAcceptanceStatus: repositoryRun.evidence?.semanticAcceptanceStatus ?? "PENDING",
    selfTest: selfTest ? selfTest.results : "NOT_REQUESTED",
    status: passed ? "PASS" : "FAIL",
    issues,
  }, null, 2));
  process.exitCode = passed ? 0 : 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
