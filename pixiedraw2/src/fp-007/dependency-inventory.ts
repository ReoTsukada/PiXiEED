/**
 * FP-007 Track 2: offline dependency inventory.
 *
 * This module is deliberately read-only. It separates what a manifest asks
 * for from what a lock file resolves and records unsafe existing inputs as
 * findings instead of changing them.
 */

import { compareCodePointStrings } from "./stable-order.ts";
import {
  FP007_JSR_LICENSE_ARTIFACT_PATH,
  FP007_JSR_SPECIFIER,
  type JsrLicenseReceiptArtifactValidation,
  loadJsrLicenseReceiptArtifact,
  validateJsrLicenseReceipt,
  validateJsrLicenseReceiptArtifact,
} from "./jsr-package-review-receipt.ts";
import {
  FP007_JSR_VULNERABILITY_PACKAGE,
  FP007_JSR_VULNERABILITY_VERSION,
  type JsrVulnerabilityReviewArtifactValidation,
  loadJsrVulnerabilityReviewArtifact,
  validateJsrVulnerabilityReviewReceipt,
} from "./jsr-vulnerability-review-receipt.ts";

export type AuditStatus = "PASS" | "FAIL" | "BLOCKED" | "UNKNOWN" | "UNTESTED";
export type DependencyKind = "npm" | "jsr";
export type DependencyScope = "direct" | "transitive";

/** NPM audit is bounded to these repository-relative lockfile scopes. */
export const NPM_AUDIT_SCOPE_IDS = [
  "root",
  "app-shell/pixieed-capacitor",
  "tools/screenshots",
] as const;
export type NpmAuditScopeId = typeof NPM_AUDIT_SCOPE_IDS[number];
export const NPM_AUDIT_PACKAGE_MANAGER = "npm" as const;
export const NPM_AUDIT_COMMAND_IDENTITY = "npm audit --json" as const;
export const NPM_AUDIT_RECEIPT_SCHEMA_VERSION = "1" as const;

export interface NpmAuditSeverityCounts {
  readonly low: number;
  readonly moderate: number;
  readonly high: number;
  readonly critical: number;
}

export interface NpmAuditReceiptV1 {
  readonly schemaVersion: typeof NPM_AUDIT_RECEIPT_SCHEMA_VERSION;
  readonly scopeId: NpmAuditScopeId;
  readonly packageManager: typeof NPM_AUDIT_PACKAGE_MANAGER;
  readonly lockfilePath: string;
  readonly lockfileSha256: string;
  readonly commandIdentity: typeof NPM_AUDIT_COMMAND_IDENTITY;
  readonly summary: {
    readonly knownVulnerabilitiesTotal: number;
    readonly severityCounts: NpmAuditSeverityCounts;
  };
  readonly evidenceId: string;
}

export type NpmAuditReceiptDiagnostic = {
  readonly code: string;
  readonly detail: string;
};

export interface NpmAuditReceiptValidation {
  readonly valid: boolean;
  readonly status: "PASS" | "BLOCKED";
  readonly evidenceLevel: "RECEIPT_BACKED_BOUNDED" | "UNKNOWN";
  readonly vulnerabilityDisposition:
    | "CLEAN"
    | "VULNERABILITIES_PRESENT"
    | "UNKNOWN";
  readonly vulnerabilitySummary?: {
    readonly total: number;
    readonly severityCounts: NpmAuditSeverityCounts;
  };
  readonly diagnostics: readonly NpmAuditReceiptDiagnostic[];
}

export interface NpmAuditReceiptInput {
  readonly receipt: unknown;
  readonly expectedLockfilePath: string;
}

export interface DependencyFinding {
  readonly code: string;
  readonly status: AuditStatus;
  readonly subject: string;
  readonly detail: string;
}

export interface ManifestDependency {
  readonly name: string;
  readonly declaration: string;
  readonly group:
    | "dependencies"
    | "devDependencies"
    | "optionalDependencies"
    | "peerDependencies"
    | "imports";
  readonly kind: DependencyKind;
}

export interface ResolvedDependency {
  readonly name: string;
  readonly declaration: string;
  readonly version: string;
  readonly scope: DependencyScope;
  readonly kind: DependencyKind;
  readonly origin: string;
  readonly registry: string;
  readonly license: string;
  readonly vulnerability: string;
  readonly lockResolved: boolean;
}

export interface DependencyProjectInventory {
  readonly projectPath: string;
  readonly manifestPath: string;
  readonly lockfilePath: string;
  readonly lockfilePresent: boolean;
  readonly lockfileHash: string;
  readonly manifestDependencies: readonly ManifestDependency[];
  readonly resolvedDependencies: readonly ResolvedDependency[];
  readonly toolchain: Readonly<Record<string, string>>;
  readonly findings: readonly DependencyFinding[];
  readonly status: AuditStatus;
}

/**
 * The only shared Node declaration evidenced by repository CI, the local
 * existing Node installation, and the three in-scope package-lock v3 files.
 * Exact versions are accepted only when declared in the root policy; the
 * scanner never guesses a patch from a major line.
 */
export const FP007_NODE_SCOPE_IDS = [
  "root",
  "tools/screenshots",
  "16_IMPLEMENTATION_STARTER/reference-core",
] as const;
export type Fp007NodeScopeId = typeof FP007_NODE_SCOPE_IDS[number];
export const FP007_NODE_POLICY = {
  nodeMajor: 22,
  nodeVersion: "22.19.0",
  packageManager: "npm",
  npmVersion: "10.9.3",
  lockfileVersion: 3,
  inheritsTo: [
    "tools/screenshots",
    "16_IMPLEMENTATION_STARTER/reference-core",
  ],
} as const;

export interface ToolchainResolution {
  readonly toolchain: Readonly<Record<string, string>>;
  readonly findings: readonly DependencyFinding[];
}

export interface DependencyInventory {
  readonly documentId: "PIXIEED-FP007-DEPENDENCY-INVENTORY-001";
  readonly schemaVersion: "1";
  readonly repository: "PiXiEED";
  readonly mode: "offline-read-only";
  readonly deterministic: true;
  readonly network: "disabled";
  readonly projects: readonly DependencyProjectInventory[];
  readonly findings: readonly DependencyFinding[];
  readonly status: AuditStatus;
}

interface JsonObject {
  readonly [key: string]: unknown;
}

interface PackageLockPackage extends JsonObject {
  readonly version?: unknown;
  readonly resolved?: unknown;
  readonly license?: unknown;
  readonly dependencies?: unknown;
  readonly devDependencies?: unknown;
  readonly optionalDependencies?: unknown;
  readonly peerDependencies?: unknown;
}

interface PackageLock extends JsonObject {
  readonly packages?: unknown;
}

interface DenoJsrResolution {
  readonly packageName: string;
  readonly version: string;
  readonly integrity: string;
}

interface DenoLockParseResult {
  readonly format: "recognized" | "unknown" | "malformed";
  readonly resolutions: ReadonlyMap<string, DenoJsrResolution>;
}

const FLOATING_RANGE =
  /^(?:latest|next|canary|\*|x|X|workspace:|file:|git\+|https?:|jsr:)/iu;
const RANGE_OPERATOR =
  /(?:\^|~|\*|\bx\b|>=|<=|>|<|\|\||\s+-\s+|\b(?:latest|next|canary)\b)/iu;
const EXACT_VERSION =
  /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const NPM_REGISTRY = "registry.npmjs.org";
const JSR_REGISTRY = "jsr.io";
const SHA256_HEX = /^[A-Fa-f0-9]{64}$/u;
const SAFE_EVIDENCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const EXPECTED_NPM_LOCKFILES: Readonly<Record<NpmAuditScopeId, string>> = {
  root: "package-lock.json",
  "app-shell/pixieed-capacitor":
    "app-shell/pixieed-capacitor/package-lock.json",
  "tools/screenshots": "tools/screenshots/package-lock.json",
};

const TOOLCHAIN_DECLARATION_KEY = "pixieedToolchain";

function toolchainFinding(
  code: string,
  status: AuditStatus,
  scopeId: string,
  detail: string,
): DependencyFinding {
  return finding(
    code,
    status,
    scopeId === "root" ? "package.json" : `${scopeId}/package.json`,
    detail,
  );
}

function isNpmAuditScopeId(value: unknown): value is NpmAuditScopeId {
  return typeof value === "string" &&
    (NPM_AUDIT_SCOPE_IDS as readonly string[]).includes(value);
}

function receiptDiagnostic(
  code: string,
  detail: string,
): NpmAuditReceiptDiagnostic {
  return { code, detail };
}

function containsUnsafeReceiptText(value: unknown): boolean {
  if (typeof value === "string") {
    return /https?:\/\/|file:\/\/|(?:bearer|authorization|cookie|token|api[_-]?key|secret|password)\s*[:=]|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN/u
      .test(value);
  }
  if (Array.isArray(value)) return value.some(containsUnsafeReceiptText);
  if (isObject(value)) {
    return Object.entries(value).some(([key, item]) =>
      /(?:token|secret|password|authorization|cookie|api[_-]?key)/iu.test(
        key,
      ) ||
      containsUnsafeReceiptText(item)
    );
  }
  return false;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function hasOnlyKeys(value: JsonObject, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

/**
 * Validates a sanitized npm audit receipt without reading the network or
 * issuing npm commands. A valid result is deliberately bounded evidence only.
 */
export function validateNpmAuditReceipt(
  receipt: unknown,
  expectedLockfileHash: string,
  expectedLockfilePath?: string,
): NpmAuditReceiptValidation {
  const diagnostics: NpmAuditReceiptDiagnostic[] = [];
  if (!isObject(receipt)) {
    diagnostics.push(receiptDiagnostic(
      "NPM_AUDIT_RECEIPT_MISSING",
      "No object-shaped lockfile-bound npm audit receipt was supplied.",
    ));
    return {
      valid: false,
      status: "BLOCKED",
      evidenceLevel: "UNKNOWN",
      vulnerabilityDisposition: "UNKNOWN",
      diagnostics,
    };
  }
  if (
    !hasOnlyKeys(receipt, [
      "schemaVersion",
      "scopeId",
      "packageManager",
      "lockfilePath",
      "lockfileSha256",
      "commandIdentity",
      "summary",
      "evidenceId",
    ])
  ) {
    diagnostics.push(receiptDiagnostic(
      "NPM_AUDIT_RECEIPT_UNKNOWN_FIELD",
      "Receipt contains a field outside the Receipt V1 allowlist.",
    ));
  }
  if (containsUnsafeReceiptText(receipt)) {
    diagnostics.push(receiptDiagnostic(
      "NPM_AUDIT_RECEIPT_UNSANITIZED",
      "Receipt contains a raw secret, token, or URL-shaped value.",
    ));
  }
  if (receipt.schemaVersion !== NPM_AUDIT_RECEIPT_SCHEMA_VERSION) {
    diagnostics.push(receiptDiagnostic(
      "NPM_AUDIT_RECEIPT_VERSION_INVALID",
      "Only Receipt V1 is accepted.",
    ));
  }
  if (!isNpmAuditScopeId(receipt.scopeId)) {
    diagnostics.push(receiptDiagnostic(
      "NPM_AUDIT_RECEIPT_SCOPE_INVALID",
      "Receipt scope is not one of the three allowed npm scopes.",
    ));
  }
  if (receipt.packageManager !== NPM_AUDIT_PACKAGE_MANAGER) {
    diagnostics.push(receiptDiagnostic(
      "NPM_AUDIT_RECEIPT_PACKAGE_MANAGER_INVALID",
      "Receipt package manager must be npm.",
    ));
  }
  if (
    !isNpmAuditScopeId(receipt.scopeId) ||
    receipt.lockfilePath !== EXPECTED_NPM_LOCKFILES[receipt.scopeId]
  ) {
    diagnostics.push(receiptDiagnostic(
      "NPM_AUDIT_RECEIPT_PATH_INVALID",
      "Receipt lockfile path does not match its allowed scope.",
    ));
  }
  if (
    expectedLockfilePath !== undefined &&
    receipt.lockfilePath !== expectedLockfilePath
  ) {
    diagnostics.push(receiptDiagnostic(
      "NPM_AUDIT_RECEIPT_PROJECT_PATH_MISMATCH",
      "Receipt lockfile path does not match the inspected project.",
    ));
  }
  const lockfileSha256 = receipt.lockfileSha256;
  if (typeof lockfileSha256 !== "string" || !SHA256_HEX.test(lockfileSha256)) {
    diagnostics.push(receiptDiagnostic(
      "NPM_AUDIT_RECEIPT_HASH_INVALID",
      "Receipt lockfile hash must be a lowercase SHA-256 hex digest.",
    ));
  }
  if (
    !SHA256_HEX.test(expectedLockfileHash) ||
    receipt.lockfileSha256 !== expectedLockfileHash
  ) {
    diagnostics.push(receiptDiagnostic(
      "NPM_AUDIT_RECEIPT_HASH_MISMATCH",
      "Receipt hash does not match the expected lockfile hash.",
    ));
  }
  if (receipt.commandIdentity !== NPM_AUDIT_COMMAND_IDENTITY) {
    diagnostics.push(receiptDiagnostic(
      "NPM_AUDIT_RECEIPT_COMMAND_INVALID",
      "Receipt command identity is not the approved npm audit JSON command.",
    ));
  }
  const summary = receipt.summary;
  if (
    isObject(summary) && !hasOnlyKeys(summary, [
      "knownVulnerabilitiesTotal",
      "severityCounts",
    ])
  ) {
    diagnostics.push(receiptDiagnostic(
      "NPM_AUDIT_RECEIPT_SUMMARY_UNKNOWN_FIELD",
      "Receipt summary contains a field outside its allowlist.",
    ));
  }
  const severityCounts = isObject(summary) ? summary.severityCounts : undefined;
  const severityKeys = severityCounts && isObject(severityCounts)
    ? Object.keys(severityCounts)
    : [];
  if (
    severityCounts && isObject(severityCounts) && !hasOnlyKeys(
      severityCounts,
      ["low", "moderate", "high", "critical"],
    )
  ) {
    diagnostics.push(receiptDiagnostic(
      "NPM_AUDIT_RECEIPT_SEVERITY_UNKNOWN_FIELD",
      "Severity counts contain a field outside their allowlist.",
    ));
  }
  if (
    severityCounts === undefined || !isObject(severityCounts) ||
    severityKeys.length !== 4 ||
    !["low", "moderate", "high", "critical"].every((key) =>
      severityKeys.includes(key) &&
      isNonNegativeInteger(severityCounts[key])
    )
  ) {
    diagnostics.push(receiptDiagnostic(
      "NPM_AUDIT_RECEIPT_SEVERITY_INVALID",
      "Severity counts must contain only canonical non-negative integer severities.",
    ));
  }
  const total = isObject(summary)
    ? summary.knownVulnerabilitiesTotal
    : undefined;
  const severityTotal = severityCounts && isObject(severityCounts)
    ? ["low", "moderate", "high", "critical"].reduce(
      (sum, key) =>
        sum +
        (isNonNegativeInteger(severityCounts[key]) ? severityCounts[key] : 0),
      0,
    )
    : -1;
  if (!isNonNegativeInteger(total) || total !== severityTotal) {
    diagnostics.push(receiptDiagnostic(
      "NPM_AUDIT_RECEIPT_TOTAL_INVALID",
      "Known vulnerability total must equal the canonical severity sum.",
    ));
  }
  if (
    typeof receipt.evidenceId !== "string" ||
    !SAFE_EVIDENCE_ID.test(receipt.evidenceId)
  ) {
    diagnostics.push(receiptDiagnostic(
      "NPM_AUDIT_RECEIPT_EVIDENCE_ID_INVALID",
      "evidenceId must be a bounded non-secret identifier.",
    ));
  }
  const valid = diagnostics.length === 0;
  const vulnerabilityDisposition = !valid
    ? "UNKNOWN"
    : total === 0
    ? "CLEAN"
    : "VULNERABILITIES_PRESENT";
  return {
    valid,
    status: valid && vulnerabilityDisposition === "CLEAN" ? "PASS" : "BLOCKED",
    evidenceLevel: valid && vulnerabilityDisposition === "CLEAN"
      ? "RECEIPT_BACKED_BOUNDED"
      : "UNKNOWN",
    vulnerabilityDisposition,
    ...(valid
      ? {
        vulnerabilitySummary: {
          total: total as number,
          severityCounts: severityCounts as NpmAuditSeverityCounts,
        },
      }
      : {}),
    diagnostics,
  };
}

/** Stable JSON bytes for storing or hashing a receipt without changing it. */
export function serializeNpmAuditReceipt(receipt: NpmAuditReceiptV1): string {
  return JSON.stringify(canonicalize(receipt));
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = "UNKNOWN"): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function sorted<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => compareCodePointStrings(key(a), key(b)));
}

function projectOf(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//u, "");
  const slash = normalized.lastIndexOf("/");
  return slash < 0 ? "." : normalized.slice(0, slash);
}

function finding(
  code: string,
  status: AuditStatus,
  subject: string,
  detail: string,
): DependencyFinding {
  return { code, status, subject, detail };
}

function statusOf(findings: readonly DependencyFinding[]): AuditStatus {
  if (findings.some((item) => item.status === "FAIL")) return "FAIL";
  if (findings.some((item) => item.status === "BLOCKED")) return "BLOCKED";
  if (findings.some((item) => item.status === "UNKNOWN")) return "UNKNOWN";
  if (findings.some((item) => item.status === "UNTESTED")) return "UNTESTED";
  return "PASS";
}

function toolchainRecord(scopeId: string): Readonly<Record<string, string>> {
  return {
    nodeMajor: String(FP007_NODE_POLICY.nodeMajor),
    nodeVersion: FP007_NODE_POLICY.nodeVersion,
    packageManager: FP007_NODE_POLICY.packageManager,
    npmVersion: FP007_NODE_POLICY.npmVersion,
    lockfileVersion: String(FP007_NODE_POLICY.lockfileVersion),
    declaration: "root.package.json#pixieedToolchain",
    inheritance: scopeId === "root" ? "self" : `root->${scopeId}`,
    qualification: "EXACT_NODE_NPM_PIN",
  };
}

function exactStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) &&
    value.every((item) => typeof item === "string");
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const uniqueLeft = [...new Set(left)].sort(compareCodePointStrings);
  const uniqueRight = [...new Set(right)].sort(compareCodePointStrings);
  return uniqueLeft.length === uniqueRight.length && uniqueLeft.every(
    (item, index) => item === uniqueRight[index],
  );
}

/**
 * Resolves the root-declared Node policy only for the three explicitly
 * allowlisted package scopes. This is a policy boundary, not package-manager
 * discovery: floating or guessed values never become a valid declaration.
 */
export function resolveSharedNodeToolchain(input: {
  readonly scopeId: string;
  readonly declaration: unknown;
}): ToolchainResolution {
  const { scopeId, declaration } = input;
  if (!(FP007_NODE_SCOPE_IDS as readonly string[]).includes(scopeId)) {
    return {
      toolchain: {},
      findings: [toolchainFinding(
        "TOOLCHAIN_SCOPE_UNAUTHORIZED",
        "FAIL",
        scopeId,
        "The shared FP-007 Node declaration was applied outside its three allowlisted scopes.",
      )],
    };
  }
  if (!isObject(declaration)) {
    return {
      toolchain: {},
      findings: [toolchainFinding(
        "TOOLCHAIN_UNKNOWN",
        "BLOCKED",
        scopeId,
        "The root pixieedToolchain declaration is absent or not an object.",
      )],
    };
  }
  const keys = Object.keys(declaration).sort(compareCodePointStrings);
  const expectedKeys = [
    "inheritsTo",
    "lockfileVersion",
    "nodeMajor",
    "nodeVersion",
    "packageManager",
    "npmVersion",
  ];
  if (!sameStringSet(keys, expectedKeys)) {
    return {
      toolchain: {},
      findings: [toolchainFinding(
        "TOOLCHAIN_DECLARATION_INCOMPLETE",
        "BLOCKED",
        scopeId,
        "The shared declaration must contain exactly nodeMajor, nodeVersion, packageManager, npmVersion, lockfileVersion, and inheritsTo.",
      )],
    };
  }
  if (
    typeof declaration.nodeMajor === "string" ||
    (typeof declaration.nodeMajor === "number" &&
      !Number.isInteger(declaration.nodeMajor))
  ) {
    return {
      toolchain: {},
      findings: [toolchainFinding(
        "TOOLCHAIN_DECLARATION_FLOATING",
        "FAIL",
        scopeId,
        "nodeMajor must be the integer CI major 22; ranges and patch-like values are not accepted there.",
      )],
    };
  }
  if (
    declaration.nodeMajor !== FP007_NODE_POLICY.nodeMajor ||
    declaration.nodeVersion !== FP007_NODE_POLICY.nodeVersion ||
    declaration.packageManager !== FP007_NODE_POLICY.packageManager ||
    declaration.npmVersion !== FP007_NODE_POLICY.npmVersion ||
    declaration.lockfileVersion !== FP007_NODE_POLICY.lockfileVersion
  ) {
    return {
      toolchain: {},
      findings: [toolchainFinding(
        "TOOLCHAIN_DECLARATION_INCOMPATIBLE",
        "FAIL",
        scopeId,
        "The declaration differs from the exact Node/npm policy, CI Node 22 major, or lockfileVersion 3 evidence.",
      )],
    };
  }
  if (!exactStringArray(declaration.inheritsTo)) {
    return {
      toolchain: {},
      findings: [toolchainFinding(
        "TOOLCHAIN_DECLARATION_AMBIGUOUS",
        "FAIL",
        scopeId,
        "inheritsTo must be an explicit string scope list.",
      )],
    };
  }
  if (!sameStringSet(declaration.inheritsTo, FP007_NODE_POLICY.inheritsTo)) {
    return {
      toolchain: {},
      findings: [toolchainFinding(
        "TOOLCHAIN_SCOPE_UNAUTHORIZED",
        "FAIL",
        scopeId,
        "inheritsTo must contain exactly tools/screenshots and 16_IMPLEMENTATION_STARTER/reference-core.",
      )],
    };
  }
  if (
    scopeId !== "root" &&
    !declaration.inheritsTo.includes(scopeId)
  ) {
    return {
      toolchain: {},
      findings: [toolchainFinding(
        "TOOLCHAIN_SCOPE_UNAUTHORIZED",
        "FAIL",
        scopeId,
        "The target scope is not an explicitly authorized root inheritance target.",
      )],
    };
  }
  return {
    toolchain: toolchainRecord(scopeId),
    findings: [],
  };
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isObject(value)) {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort(compareCodePointStrings)) {
      output[key] = canonicalize(value[key]);
    }
    return output;
  }
  return value;
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value;
  const normalized = new Uint8Array(bytes.byteLength);
  normalized.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", normalized.buffer);
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function classifyDeclaration(declaration: string): AuditStatus {
  const value = declaration.trim();
  if (!value || FLOATING_RANGE.test(value) || RANGE_OPERATOR.test(value)) {
    return "FAIL";
  }
  return EXACT_VERSION.test(value) ? "PASS" : "FAIL";
}

export function registryFor(kind: DependencyKind, resolved: string): string {
  if (kind === "jsr") return JSR_REGISTRY;
  try {
    return new URL(resolved).hostname || "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

export function originFor(kind: DependencyKind, resolved: string): string {
  if (resolved === "UNKNOWN") return "UNKNOWN";
  if (/^(?:file:|\.\.?\/|\/|[A-Za-z]:[\\/])/u.test(resolved)) {
    return "local-path";
  }
  if (kind === "jsr") {
    return resolved.startsWith("jsr:") ? "declared-jsr" : "UNKNOWN";
  }
  try {
    const url = new URL(resolved);
    return url.protocol === "https:" ? "registry" : "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

function packageNameFromLockPath(path: string): string {
  const marker = "/node_modules/";
  const index = path.lastIndexOf(marker);
  const name = index >= 0
    ? path.slice(index + marker.length)
    : path.replace(/^node_modules\//u, "");
  if (name.startsWith("@")) return name.split("/").slice(0, 2).join("/");
  return name.split("/")[0] ?? name;
}

function jsrPackageAndVersion(
  specifier: string,
): { packageName: string; version: string } | null {
  const value = specifier.trim().replace(/^jsr:/u, "");
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  return { packageName: value.slice(0, at), version: value.slice(at + 1) };
}

function isJsrIntegrity(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return SHA256_HEX.test(value) ||
    /^sha256[-:][A-Fa-f0-9]{64}$/u.test(value);
}

function parseDenoLock(lockText: string): DenoLockParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(lockText) as unknown;
  } catch {
    return { format: "malformed", resolutions: new Map() };
  }
  if (
    !isObject(parsed) || !isObject(parsed.specifiers) || !isObject(parsed.jsr)
  ) {
    return { format: "unknown", resolutions: new Map() };
  }
  const resolutions = new Map<string, DenoJsrResolution>();
  for (const [specifier, rawVersion] of Object.entries(parsed.specifiers)) {
    if (
      typeof rawVersion !== "string" ||
      classifyDeclaration(rawVersion) !== "PASS"
    ) continue;
    const parsedSpecifier = jsrPackageAndVersion(specifier);
    if (parsedSpecifier === null) continue;
    const jsrRecord = parsed.jsr as JsonObject;
    const candidates = [
      `${parsedSpecifier.packageName}@${rawVersion}`,
      `jsr:${parsedSpecifier.packageName}@${rawVersion}`,
    ];
    const recordKey = candidates.find((key) => isObject(jsrRecord[key]));
    if (recordKey === undefined) continue;
    const record = jsrRecord[recordKey];
    if (!isObject(record) || !isJsrIntegrity(record.integrity)) continue;
    resolutions.set(specifier, {
      packageName: parsedSpecifier.packageName,
      version: rawVersion,
      integrity: record.integrity,
    });
  }
  return { format: "recognized", resolutions };
}

function manifestDependencies(manifest: JsonObject): ManifestDependency[] {
  const groups = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ] as const;
  const output: ManifestDependency[] = [];
  for (const group of groups) {
    const entries = manifest[group];
    if (!isObject(entries)) continue;
    for (
      const name of Object.keys(entries).sort(compareCodePointStrings)
    ) {
      output.push({
        name,
        declaration: stringValue(entries[name]),
        group,
        kind: "npm",
      });
    }
  }
  return output;
}

function npmResolvedDependencies(
  manifestEntries: readonly ManifestDependency[],
  lock: PackageLock | undefined,
): ResolvedDependency[] {
  const direct = new Map(manifestEntries.map((item) => [item.name, item]));
  const packages = lock?.packages;
  if (!isObject(packages)) {
    return manifestEntries.map((item) => ({
      name: item.name,
      declaration: item.declaration,
      version: "UNKNOWN",
      scope: "direct",
      kind: item.kind,
      origin: "UNKNOWN",
      registry: "UNKNOWN",
      license: "UNKNOWN",
      vulnerability: "UNKNOWN",
      lockResolved: false,
    }));
  }
  const output: ResolvedDependency[] = [];
  for (const [path, raw] of Object.entries(packages)) {
    if (path === "" || !isObject(raw)) continue;
    const packageName = packageNameFromLockPath(path);
    const declaration = direct.get(packageName)?.declaration ?? "UNKNOWN";
    const resolved = stringValue(raw.resolved);
    output.push({
      name: packageName,
      declaration,
      version: stringValue(raw.version),
      scope: direct.has(packageName) ? "direct" : "transitive",
      kind: "npm",
      origin: originFor("npm", resolved),
      registry: registryFor("npm", resolved),
      license: stringValue(raw.license),
      vulnerability: "UNKNOWN",
      lockResolved: typeof raw.version === "string" &&
        typeof raw.resolved === "string",
    });
  }
  for (const item of manifestEntries) {
    if (!output.some((resolved) => resolved.name === item.name)) {
      output.push({
        name: item.name,
        declaration: item.declaration,
        version: "UNKNOWN",
        scope: "direct",
        kind: item.kind,
        origin: "UNKNOWN",
        registry: "UNKNOWN",
        license: "UNKNOWN",
        vulnerability: "UNKNOWN",
        lockResolved: false,
      });
    }
  }
  return sorted(output, (item) => `${item.scope}:${item.name}`);
}

function applyNpmAuditDisposition(
  resolved: readonly ResolvedDependency[],
  receiptValidation: NpmAuditReceiptValidation | undefined,
): ResolvedDependency[] {
  const reviewedNone = receiptValidation?.valid === true &&
    receiptValidation.vulnerabilityDisposition === "CLEAN";
  if (!reviewedNone) return [...resolved];
  return resolved.map((item) => ({
    ...item,
    // This is bounded to the matching npm lockfile snapshot and scope.
    vulnerability: "REVIEWED_NONE",
  }));
}

function npmFindings(
  entries: readonly ManifestDependency[],
  resolved: readonly ResolvedDependency[],
  lockPresent: boolean,
  lockRoot: PackageLockPackage | undefined,
  receiptValidation: NpmAuditReceiptValidation | undefined,
): DependencyFinding[] {
  const findings: DependencyFinding[] = [];
  if (!lockPresent) {
    findings.push(
      finding(
        "LOCKFILE_MISSING",
        "BLOCKED",
        "package-lock.json",
        "Exact lock resolution is unavailable.",
      ),
    );
  }
  if (receiptValidation !== undefined && !receiptValidation.valid) {
    findings.push(
      finding(
        "NPM_AUDIT_RECEIPT_INVALID",
        "BLOCKED",
        "npm audit receipt",
        receiptValidation.diagnostics.map((item) => item.code).join(", "),
      ),
    );
  }
  if (
    receiptValidation?.valid === true &&
    receiptValidation.vulnerabilityDisposition === "VULNERABILITIES_PRESENT"
  ) {
    const summary = receiptValidation.vulnerabilitySummary;
    const detail = summary === undefined
      ? "Known vulnerabilities are present in the sanitized npm audit receipt."
      : `knownVulnerabilitiesTotal=${summary.total}; severityCounts=low:${summary.severityCounts.low},moderate:${summary.severityCounts.moderate},high:${summary.severityCounts.high},critical:${summary.severityCounts.critical}`;
    findings.push(
      finding(
        "NPM_AUDIT_VULNERABILITIES_PRESENT",
        "BLOCKED",
        "npm audit receipt",
        detail,
      ),
    );
  }
  for (const item of entries) {
    const metadata = isObject(lockRoot?.[item.group])
      ? lockRoot[item.group] as JsonObject
      : undefined;
    const lockDeclaration = metadata === undefined
      ? undefined
      : metadata[item.name];
    if (
      typeof lockDeclaration !== "string" ||
      classifyDeclaration(lockDeclaration) !== "PASS" ||
      lockDeclaration !== item.declaration
    ) {
      findings.push(
        finding(
          "ROOT_LOCK_METADATA_MISMATCH",
          "BLOCKED",
          item.name,
          "Package-lock root metadata is missing, floating, or differs from the manifest declaration.",
        ),
      );
    }
  }
  for (const item of entries) {
    if (classifyDeclaration(item.declaration) !== "PASS") {
      findings.push(
        finding(
          "FLOATING_MANIFEST_RANGE",
          "FAIL",
          item.name,
          "Manifest declaration is not an exact semantic version.",
        ),
      );
    }
  }
  for (const item of resolved) {
    if (!item.lockResolved) {
      findings.push(
        finding(
          "LOCK_RESOLUTION_MISSING",
          "BLOCKED",
          item.name,
          "Resolved exact version and registry locator are incomplete.",
        ),
      );
    }
    if (item.origin === "local-path") {
      findings.push(
        finding(
          "LOCAL_PATH_DEPENDENCY",
          "FAIL",
          item.name,
          "Dependency resolves from a local path.",
        ),
      );
    }
    if (item.origin === "UNKNOWN" || item.registry === "UNKNOWN") {
      findings.push(
        finding(
          "DEPENDENCY_ORIGIN_UNKNOWN",
          "BLOCKED",
          item.name,
          "Dependency origin cannot be proven offline.",
        ),
      );
    }
    if (item.registry !== "UNKNOWN" && item.registry !== NPM_REGISTRY) {
      findings.push(
        finding(
          "UNDECLARED_REGISTRY",
          "FAIL",
          item.name,
          "Dependency registry is outside the declared npm registry.",
        ),
      );
    }
    if (item.license === "UNKNOWN") {
      findings.push(
        finding(
          "LICENSE_UNKNOWN",
          "BLOCKED",
          item.name,
          "License evidence is absent from the offline lock record.",
        ),
      );
    }
    if (
      item.vulnerability === "UNKNOWN"
    ) {
      findings.push(
        finding(
          "VULNERABILITY_REVIEW_UNKNOWN",
          "BLOCKED",
          item.name,
          "No offline vulnerability disposition was supplied; absence is not approval.",
        ),
      );
    }
    const manifest = entries.find((entry) => entry.name === item.name);
    if (
      manifest !== undefined &&
      classifyDeclaration(manifest.declaration) === "PASS" &&
      manifest.declaration.replace(/^v/u, "") !==
        item.version.replace(/^v/u, "")
    ) {
      findings.push(
        finding(
          "MANIFEST_LOCK_MISMATCH",
          "FAIL",
          item.name,
          "Exact manifest declaration does not match the locked version.",
        ),
      );
    }
  }
  return sorted(findings, (item) => `${item.code}:${item.subject}`);
}

export async function inspectNpmProject(input: {
  readonly manifestPath: string;
  readonly manifest: JsonObject;
  readonly lockfilePath: string;
  readonly lockText?: string;
  readonly lock?: PackageLock;
  readonly toolchain?: Readonly<Record<string, string>>;
  readonly toolchainFindings?: readonly DependencyFinding[];
  readonly npmAuditReceipt?: unknown;
}): Promise<DependencyProjectInventory> {
  const entries = manifestDependencies(input.manifest);
  const lockPresent = input.lockText !== undefined;
  const lockRoot = isObject(input.lock?.packages)
    ? isObject(input.lock.packages[""])
      ? input.lock.packages[""] as PackageLockPackage
      : undefined
    : undefined;
  const resolved = npmResolvedDependencies(entries, input.lock);
  const lockHash = lockPresent
    ? await sha256Hex(input.lockText as string)
    : "UNKNOWN";
  const receiptValidation = input.npmAuditReceipt === undefined
    ? undefined
    : validateNpmAuditReceipt(
      input.npmAuditReceipt,
      lockHash,
      input.lockfilePath,
    );
  const dispositionedResolved = applyNpmAuditDisposition(
    resolved,
    receiptValidation,
  );
  const findings = npmFindings(
    entries,
    dispositionedResolved,
    lockPresent,
    lockRoot,
    receiptValidation,
  );
  if (lockPresent && input.lock === undefined) {
    findings.push(
      finding(
        "LOCKFILE_INVALID",
        "BLOCKED",
        input.lockfilePath,
        "Lockfile text exists but could not be parsed as a package lock.",
      ),
    );
  }
  if (input.toolchainFindings !== undefined) {
    findings.push(...input.toolchainFindings);
  } else if (
    input.toolchain === undefined || Object.keys(input.toolchain).length === 0
  ) {
    findings.push(
      finding(
        "TOOLCHAIN_UNKNOWN",
        "BLOCKED",
        input.manifestPath,
        "Manifest does not declare a reproducible toolchain version.",
      ),
    );
  }
  return {
    projectPath: projectOf(input.manifestPath),
    manifestPath: input.manifestPath,
    lockfilePath: input.lockfilePath,
    lockfilePresent: lockPresent,
    lockfileHash: lockHash,
    manifestDependencies: sorted(
      entries,
      (item) => `${item.group}:${item.name}`,
    ),
    resolvedDependencies: dispositionedResolved,
    toolchain: input.toolchain ?? {},
    findings,
    status: statusOf(findings),
  };
}

function jsrEntries(config: JsonObject): ManifestDependency[] {
  const imports = config.imports;
  if (!isObject(imports)) return [];
  return Object.keys(imports).sort(compareCodePointStrings).map((
    name,
  ) => ({
    name,
    declaration: stringValue(imports[name]),
    group: "imports",
    kind: "jsr",
  }));
}

type DenoProjectInspectionInput = {
  readonly manifestPath: string;
  readonly config: JsonObject;
  readonly lockfilePath: string;
  readonly lockfilePresent: boolean;
  readonly lockText?: string;
  readonly toolchain?: Readonly<Record<string, string>>;
};

type RepositoryDenoProjectInspectionInput = DenoProjectInspectionInput & {
  /**
   * Internal-only authority loaded from the checked-in repository artifacts.
   * These properties are intentionally absent from the exported inspection
   * API and are only supplied by scanRepository below.
   */
  readonly jsrLicenseReceiptArtifact?: unknown;
  readonly jsrVulnerabilityReviewArtifact?:
    JsrVulnerabilityReviewArtifactValidation;
};

async function inspectDenoProjectWithRepositoryAuthority(
  input: RepositoryDenoProjectInspectionInput,
): Promise<DependencyProjectInventory> {
  const entries = jsrEntries(input.config);
  const parsedLock = input.lockText === undefined
    ? {
      format: "unknown",
      resolutions: new Map<string, DenoJsrResolution>(),
    } as const
    : parseDenoLock(input.lockText);
  const resolved: ResolvedDependency[] = entries.map((entry) => {
    const parsedSpecifier = jsrPackageAndVersion(entry.declaration);
    const version = parsedSpecifier?.version ?? "UNKNOWN";
    const exact = classifyDeclaration(version) === "PASS";
    const resolution = exact
      ? parsedLock.resolutions.get(entry.declaration)
      : undefined;
    return {
      name: entry.name,
      declaration: entry.declaration,
      version: resolution?.version ?? (exact ? version : "UNKNOWN"),
      scope: "direct",
      kind: entry.kind,
      origin: entry.declaration.startsWith("jsr:") ? "declared-jsr" : "UNKNOWN",
      registry: entry.declaration.startsWith("jsr:") ? JSR_REGISTRY : "UNKNOWN",
      license: "UNKNOWN",
      vulnerability: "UNKNOWN",
      lockResolved: input.lockfilePresent && input.lockText !== undefined &&
        parsedLock.format === "recognized" && resolution !== undefined &&
        resolution.packageName === parsedSpecifier?.packageName &&
        resolution.version === version && isJsrIntegrity(resolution.integrity),
    };
  });
  const licenseArtifact: JsrLicenseReceiptArtifactValidation | undefined =
    input.jsrLicenseReceiptArtifact === undefined
      ? undefined
      : await validateJsrLicenseReceiptArtifact(
        input.jsrLicenseReceiptArtifact,
      );
  const findings: DependencyFinding[] = [];
  if (licenseArtifact !== undefined && !licenseArtifact.valid) {
    findings.push(
      finding(
        "JSR_LICENSE_RECEIPT_INVALID",
        "BLOCKED",
        input.lockfilePath,
        licenseArtifact.diagnostics.map((item) => item.code).join(", "),
      ),
    );
  }
  if (!input.lockfilePresent) {
    findings.push(
      finding(
        "LOCKFILE_MISSING",
        "BLOCKED",
        input.lockfilePath,
        "Deno lockfile is absent; exact JSR resolution cannot be proven offline.",
      ),
    );
  }
  if (input.lockfilePresent && input.lockText === undefined) {
    findings.push(
      finding(
        "LOCKFILE_UNREADABLE",
        "BLOCKED",
        input.lockfilePath,
        "Deno lockfile presence was detected but its contents are unavailable.",
      ),
    );
  }
  if (
    input.lockfilePresent && input.lockText !== undefined &&
    parsedLock.format !== "recognized"
  ) {
    findings.push(
      finding(
        "LOCKFILE_FORMAT_UNKNOWN",
        parsedLock.format === "malformed" ? "FAIL" : "UNKNOWN",
        input.lockfilePath,
        "Deno lockfile format is malformed or not an explicitly supported structured JSR format.",
      ),
    );
  }
  for (const entry of entries) {
    if (
      classifyDeclaration(
        entry.declaration.slice(entry.declaration.lastIndexOf("@") + 1),
      ) !== "PASS"
    ) {
      findings.push(
        finding(
          "FLOATING_JSR_RANGE",
          "FAIL",
          entry.name,
          "JSR import uses a floating or non-exact range.",
        ),
      );
    }
  }
  for (const [entryIndex, item] of resolved.entries()) {
    const entry = entries[entryIndex];
    if (entry === undefined) {
      resolved[entryIndex] = {
        ...item,
        license: "UNKNOWN",
        vulnerability: "UNKNOWN",
      };
      continue;
    }
    const parsedSpecifier = entry === undefined
      ? null
      : jsrPackageAndVersion(entry.declaration);
    const resolution = entry === undefined || parsedSpecifier === null
      ? undefined
      : parsedLock.resolutions.get(entry.declaration);
    const licenseReceipt = licenseArtifact?.valid === true
      ? licenseArtifact.receipts.get(input.lockfilePath)
      : undefined;
    const licenseReceiptValidation = licenseReceipt === undefined ||
        resolution === undefined || parsedSpecifier === null
      ? undefined
      : await validateJsrLicenseReceipt(licenseReceipt, {
        packageName: resolution.packageName,
        version: resolution.version,
        specifier: entry.declaration,
        integrity: resolution.integrity,
        lockfilePath: input.lockfilePath,
        lockfileSha256: input.lockText === undefined
          ? "UNKNOWN"
          : await sha256Hex(input.lockText),
      });
    const licenseReceiptMatches = licenseReceiptValidation?.valid === true &&
      item.lockResolved;
    const vulnerabilityReceipt =
      input.jsrVulnerabilityReviewArtifact?.valid === true
        ? input.jsrVulnerabilityReviewArtifact.receipt
        : undefined;
    const vulnerabilityReceiptValidation = vulnerabilityReceipt === undefined ||
        resolution === undefined || parsedSpecifier === null
      ? undefined
      : await validateJsrVulnerabilityReviewReceipt(vulnerabilityReceipt, {
        integrity: resolution.integrity,
        consumer: {
          projectPath: projectOf(input.manifestPath),
          lockfilePath: input.lockfilePath,
          lockfileSha256: input.lockText === undefined
            ? "UNKNOWN"
            : await sha256Hex(input.lockText),
          dependencyKey: `${resolution.packageName}@${resolution.version}`,
        },
      });
    const vulnerabilityReceiptMatches =
      vulnerabilityReceiptValidation?.valid === true &&
      item.lockResolved &&
      resolution?.packageName === FP007_JSR_VULNERABILITY_PACKAGE &&
      resolution.version === FP007_JSR_VULNERABILITY_VERSION &&
      entry.declaration === FP007_JSR_SPECIFIER;
    resolved[entryIndex] = {
      ...item,
      license: licenseReceiptMatches ? "MIT" : "UNKNOWN",
      vulnerability: vulnerabilityReceiptMatches ? "REVIEWED_NONE" : "UNKNOWN",
    };
    if (licenseReceipt !== undefined && !licenseReceiptMatches) {
      findings.push(
        finding(
          "JSR_LICENSE_RECEIPT_MISMATCH",
          "BLOCKED",
          item.name,
          "License receipt does not exactly match this manifest entry and lock snapshot.",
        ),
      );
    }
    if (!item.lockResolved) {
      findings.push(
        finding(
          "LOCK_RESOLUTION_MISSING",
          "BLOCKED",
          item.name,
          "Deno import has no exact offline lock resolution.",
        ),
      );
    }
    if (!licenseReceiptMatches) {
      findings.push(
        finding(
          "LICENSE_UNKNOWN",
          "BLOCKED",
          item.name,
          "No valid exact-lock-bound official JSR MIT license receipt was supplied.",
        ),
      );
    }
    if (!vulnerabilityReceiptMatches) {
      findings.push(
        finding(
          "VULNERABILITY_REVIEW_UNKNOWN",
          "BLOCKED",
          item.name,
          vulnerabilityReceiptValidation?.diagnostics.map((item) => item.code)
            .join(", ") ||
            "No exact-lock-bound JSR vulnerability receipt was supplied.",
        ),
      );
    }
  }
  return {
    projectPath: projectOf(input.manifestPath),
    manifestPath: input.manifestPath,
    lockfilePath: input.lockfilePath,
    lockfilePresent: input.lockfilePresent,
    lockfileHash: input.lockfilePresent && input.lockText !== undefined
      ? await sha256Hex(input.lockText)
      : "UNKNOWN",
    manifestDependencies: entries,
    resolvedDependencies: resolved,
    toolchain: input.toolchain ??
      { runtime: "deno", runtimeVersion: "UNKNOWN" },
    findings: sorted(findings, (item) => `${item.code}:${item.subject}`),
    status: statusOf(findings),
  };
}

/**
 * Inspect a Deno project from caller-visible manifest and lock inputs.
 *
 * Vulnerability review authority is deliberately not accepted here. Only the
 * repository scanner may load and bind the checked-in receipt artifact.
 */
export async function inspectDenoProject(
  input: DenoProjectInspectionInput,
): Promise<DependencyProjectInventory> {
  const sanitizedInput: DenoProjectInspectionInput = {
    manifestPath: input.manifestPath,
    config: input.config,
    lockfilePath: input.lockfilePath,
    lockfilePresent: input.lockfilePresent,
    ...(input.lockText !== undefined ? { lockText: input.lockText } : {}),
    ...(input.toolchain !== undefined ? { toolchain: input.toolchain } : {}),
  };
  return await inspectDenoProjectWithRepositoryAuthority(sanitizedInput);
}

async function readJson(
  root: string,
  relativePath: string,
): Promise<JsonObject | undefined> {
  try {
    const raw = JSON.parse(
      await Deno.readTextFile(`${root}/${relativePath}`),
    ) as unknown;
    return isObject(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}

async function readJsrLicenseReceiptArtifact(
  root: string,
): Promise<unknown | undefined> {
  const loaded = await loadJsrLicenseReceiptArtifact(
    root,
    FP007_JSR_LICENSE_ARTIFACT_PATH,
  );
  if (!loaded.present) return undefined;
  return loaded.artifact ?? null;
}

async function readText(
  root: string,
  relativePath: string,
): Promise<string | undefined> {
  try {
    return await Deno.readTextFile(`${root}/${relativePath}`);
  } catch {
    return undefined;
  }
}

async function exists(root: string, relativePath: string): Promise<boolean> {
  try {
    await Deno.stat(`${root}/${relativePath}`);
    return true;
  } catch {
    return false;
  }
}

async function findDenoConfigs(
  root: string,
  relativeDirectory: string,
): Promise<string[]> {
  const output: string[] = [];
  try {
    for await (const entry of Deno.readDir(`${root}/${relativeDirectory}`)) {
      const relative = `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory) {
        output.push(...await findDenoConfigs(root, relative));
      } else if (entry.isFile && entry.name === "deno.json") {
        output.push(relative);
      }
    }
  } catch {
    return output;
  }
  return output.sort(compareCodePointStrings);
}

export async function scanRepository(
  root: string,
  options: {
    readonly npmAuditReceipts?: Readonly<
      Partial<Record<NpmAuditScopeId, unknown>>
    >;
  } = {},
): Promise<DependencyInventory> {
  const projects: DependencyProjectInventory[] = [];
  const jsrLicenseReceiptArtifact = await readJsrLicenseReceiptArtifact(root);
  const jsrVulnerabilityReviewArtifact =
    await loadJsrVulnerabilityReviewArtifact(root);
  const rootManifest = await readJson(root, "package.json");
  const rootToolchainDeclaration = rootManifest?.pixieedToolchain;
  const npmManifests = [
    ["package.json", "package-lock.json"],
    [
      "app-shell/pixieed-capacitor/package.json",
      "app-shell/pixieed-capacitor/package-lock.json",
    ],
    ["tools/screenshots/package.json", "tools/screenshots/package-lock.json"],
    [
      "16_IMPLEMENTATION_STARTER/reference-core/package.json",
      "16_IMPLEMENTATION_STARTER/reference-core/package-lock.json",
    ],
  ] as const;
  for (const [manifestPath, lockfilePath] of npmManifests) {
    const manifest = await readJson(root, manifestPath);
    if (manifest === undefined) continue;
    const lockText = await readText(root, lockfilePath);
    const lock = lockText === undefined ? undefined : (() => {
      try {
        const parsed = JSON.parse(lockText) as unknown;
        return isObject(parsed) ? parsed as PackageLock : undefined;
      } catch {
        return undefined;
      }
    })();
    const scopeId = manifestPath === "package.json"
      ? "root"
      : manifestPath === "tools/screenshots/package.json"
      ? "tools/screenshots"
      : manifestPath ===
          "16_IMPLEMENTATION_STARTER/reference-core/package.json"
      ? "16_IMPLEMENTATION_STARTER/reference-core"
      : undefined;
    const sharedToolchain: {
      readonly toolchain?: Readonly<Record<string, string>>;
      readonly findings?: readonly DependencyFinding[];
    } = scopeId === undefined ? {} : resolveSharedNodeToolchain({
      scopeId,
      declaration: rootToolchainDeclaration,
    });
    const toolchain = scopeId === undefined
      ? isObject(manifest.engines)
        ? Object.fromEntries(
          Object.entries(manifest.engines).map(([key, value]) => [
            key,
            stringValue(value),
          ]),
        )
        : undefined
      : sharedToolchain.toolchain;
    projects.push(
      await inspectNpmProject({
        manifestPath,
        manifest,
        lockfilePath,
        ...(lockText !== undefined ? { lockText } : {}),
        ...(lock !== undefined ? { lock } : {}),
        npmAuditReceipt: NPM_AUDIT_SCOPE_IDS.map((scopeId) =>
          EXPECTED_NPM_LOCKFILES[scopeId] === lockfilePath
            ? options.npmAuditReceipts?.[scopeId]
            : undefined
        ).find((receipt) => receipt !== undefined),
        ...(toolchain !== undefined ? { toolchain } : {}),
        ...(sharedToolchain.findings !== undefined
          ? { toolchainFindings: sharedToolchain.findings }
          : {}),
      }),
    );
  }
  const denoPaths = [
    "pixiedraw2/deno.json",
    ...await findDenoConfigs(root, "supabase/functions"),
  ];
  for (const manifestPath of denoPaths) {
    const config = await readJson(root, manifestPath);
    if (config === undefined) continue;
    const lockfilePath = manifestPath.replace(/deno\.json$/u, "deno.lock");
    const denoLockText = await readText(root, lockfilePath);
    projects.push(
      await inspectDenoProjectWithRepositoryAuthority({
        manifestPath,
        config,
        lockfilePath,
        lockfilePresent: await exists(root, lockfilePath),
        ...(denoLockText !== undefined ? { lockText: denoLockText } : {}),
        toolchain: { runtime: "deno", runtimeVersion: "UNKNOWN" },
        ...(jsrLicenseReceiptArtifact !== undefined
          ? { jsrLicenseReceiptArtifact }
          : {}),
        jsrVulnerabilityReviewArtifact,
      }),
    );
  }
  const orderedProjects = sorted(projects, (item) => item.manifestPath);
  const findings = sorted(
    orderedProjects.flatMap((item) =>
      item.findings.map((entry) => ({
        ...entry,
        subject: `${item.manifestPath}:${entry.subject}`,
      }))
    ),
    (item) => `${item.code}:${item.subject}`,
  );
  return {
    documentId: "PIXIEED-FP007-DEPENDENCY-INVENTORY-001",
    schemaVersion: "1",
    repository: "PiXiEED",
    mode: "offline-read-only",
    deterministic: true,
    network: "disabled",
    projects: orderedProjects,
    findings,
    status: statusOf(findings),
  };
}
