/** Offline, exact-lock-bound JSR license receipt evidence. */

import {
  canonicalJson,
  normalizeRepoRelativePath,
  sha256Hex,
} from "./build-manifest.ts";
import { compareCodeUnitStrings } from "./stable-order.ts";

export const FP007_JSR_LICENSE_ARTIFACT_DOCUMENT =
  "PIXIEED-FP007-JSR-LICENSE-RECEIPTS-001" as const;
export const FP007_JSR_LICENSE_ARTIFACT_SCHEMA_VERSION = "1.0.0" as const;
export const FP007_JSR_LICENSE_RECEIPT_SCHEMA_VERSION = "1" as const;
export const FP007_JSR_LICENSE_ARTIFACT_PATH =
  "docs/inventory/fp-007-jsr-license-receipts.json" as const;
export const FP007_JSR_PACKAGE = "@supabase/functions-js" as const;
export const FP007_JSR_VERSION = "2.112.2" as const;
export const FP007_JSR_SPECIFIER =
  "jsr:@supabase/functions-js@2.112.2" as const;
export const FP007_JSR_INTEGRITY =
  "692aba48a8aa15d9d6921b3fa11c6ce0242c48d6eb489674e18bb245bd2abad5" as const;
export const FP007_JSR_LICENSE = "MIT" as const;
export const FP007_JSR_SOURCE_KIND = "official-jsr-metadata" as const;

export const FP007_JSR_REVIEW_LOCKFILES = [
  "supabase/functions/market-reconcile-my-sales/deno.lock",
  "supabase/functions/market-reconcile-purchase/deno.lock",
] as const;
export type Fp007JsrReviewLockfilePath =
  typeof FP007_JSR_REVIEW_LOCKFILES[number];

export interface JsrLicenseReceiptV1 {
  readonly schemaVersion: typeof FP007_JSR_LICENSE_RECEIPT_SCHEMA_VERSION;
  readonly packageName: typeof FP007_JSR_PACKAGE;
  readonly version: typeof FP007_JSR_VERSION;
  readonly specifier: typeof FP007_JSR_SPECIFIER;
  readonly integrity: typeof FP007_JSR_INTEGRITY;
  readonly lockfilePath: Fp007JsrReviewLockfilePath;
  readonly lockfileSha256: string;
  readonly licenseSpdx: typeof FP007_JSR_LICENSE;
  readonly sourceKind: typeof FP007_JSR_SOURCE_KIND;
  readonly reviewDate: string;
  readonly receiptDigest: string;
}

export interface JsrLicenseReceiptDiagnostic {
  readonly code: string;
  readonly detail: string;
}

export interface JsrLicenseReceiptValidation {
  readonly valid: boolean;
  readonly licenseSpdx: "MIT" | "UNKNOWN";
  readonly diagnostics: readonly JsrLicenseReceiptDiagnostic[];
}

export interface JsrLicenseReceiptArtifactV1 {
  readonly documentId: typeof FP007_JSR_LICENSE_ARTIFACT_DOCUMENT;
  readonly schemaVersion: typeof FP007_JSR_LICENSE_ARTIFACT_SCHEMA_VERSION;
  readonly receipts: readonly JsrLicenseReceiptV1[];
  readonly artifactDigest: string;
}

export interface JsrLicenseReceiptArtifactValidation {
  readonly valid: boolean;
  readonly artifact?: JsrLicenseReceiptArtifactV1;
  readonly receipts: ReadonlyMap<string, JsrLicenseReceiptV1>;
  readonly diagnostics: readonly JsrLicenseReceiptDiagnostic[];
}

export interface JsrLicenseReceiptArtifactLoadResult
  extends JsrLicenseReceiptArtifactValidation {
  readonly present: boolean;
}

const SHA256 = /^[a-f0-9]{64}$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const SAFE_IDENTITY = /^@[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)+$/u;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function diagnostic(
  code: string,
  detail: string,
): JsrLicenseReceiptDiagnostic {
  return { code, detail };
}

function onlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const set = new Set(allowed);
  return Object.keys(value).every((key) => set.has(key));
}

function containsUnsafeValue(value: unknown): boolean {
  if (typeof value === "string") {
    return /https?:\/\/|file:\/\/|(?:bearer|authorization|cookie|token|api[_-]?key|secret|password)\s*[:=]|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN/iu
      .test(value);
  }
  if (Array.isArray(value)) return value.some(containsUnsafeValue);
  if (object(value)) {
    return Object.entries(value).some(([key, item]) =>
      /(?:token|secret|password|authorization|cookie|api[_-]?key|url|raw|metadata|response)/iu
        .test(key) || containsUnsafeValue(item)
    );
  }
  return false;
}

function isReviewLockfile(value: unknown): value is Fp007JsrReviewLockfilePath {
  return typeof value === "string" &&
    (FP007_JSR_REVIEW_LOCKFILES as readonly string[]).includes(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

function receiptBody(receipt: Omit<JsrLicenseReceiptV1, "receiptDigest">) {
  return canonicalJson(receipt);
}

function artifactBody(
  artifact: Omit<JsrLicenseReceiptArtifactV1, "artifactDigest">,
): string {
  return canonicalJson(artifact);
}

export async function validateJsrLicenseReceipt(
  value: unknown,
  expected?: {
    readonly packageName: string;
    readonly version: string;
    readonly specifier: string;
    readonly integrity: string;
    readonly lockfilePath: string;
    readonly lockfileSha256: string;
  },
): Promise<JsrLicenseReceiptValidation> {
  const diagnostics: JsrLicenseReceiptDiagnostic[] = [];
  if (!object(value)) {
    return {
      valid: false,
      licenseSpdx: "UNKNOWN",
      diagnostics: [
        diagnostic("RECEIPT_INVALID", "Receipt must be an object."),
      ],
    };
  }
  if (
    !onlyKeys(value, [
      "schemaVersion",
      "packageName",
      "version",
      "specifier",
      "integrity",
      "lockfilePath",
      "lockfileSha256",
      "licenseSpdx",
      "sourceKind",
      "reviewDate",
      "receiptDigest",
    ])
  ) {
    diagnostics.push(diagnostic(
      "UNKNOWN_FIELD",
      "Receipt contains a field outside the exact allowlist.",
    ));
  }
  if (containsUnsafeValue(value)) {
    diagnostics.push(diagnostic(
      "UNSANITIZED_INPUT",
      "Receipt contains a URL, email, token, or raw external content.",
    ));
  }
  if (value.schemaVersion !== FP007_JSR_LICENSE_RECEIPT_SCHEMA_VERSION) {
    diagnostics.push(
      diagnostic("SCHEMA_VERSION_INVALID", "Only Receipt V1 is accepted."),
    );
  }
  if (
    value.packageName !== FP007_JSR_PACKAGE ||
    typeof value.packageName !== "string" ||
    !SAFE_IDENTITY.test(value.packageName)
  ) {
    diagnostics.push(
      diagnostic(
        "PACKAGE_IDENTITY_INVALID",
        "Package identity is not the fixed safe JSR package ID.",
      ),
    );
  }
  if (
    value.version !== FP007_JSR_VERSION ||
    typeof value.version !== "string" ||
    !/^\d+\.\d+\.\d+$/u.test(value.version)
  ) {
    diagnostics.push(
      diagnostic(
        "VERSION_INVALID",
        "Only the fixed exact package version is accepted.",
      ),
    );
  }
  if (value.specifier !== FP007_JSR_SPECIFIER) {
    diagnostics.push(
      diagnostic(
        "SPECIFIER_MISMATCH",
        "Receipt specifier is not the fixed exact JSR lock entry.",
      ),
    );
  }
  if (
    value.integrity !== FP007_JSR_INTEGRITY ||
    typeof value.integrity !== "string" || !SHA256.test(value.integrity)
  ) {
    diagnostics.push(
      diagnostic(
        "INTEGRITY_INVALID",
        "Receipt integrity is not the fixed lowercase SHA-256 lock integrity.",
      ),
    );
  }
  if (
    !isReviewLockfile(value.lockfilePath) ||
    normalizeRepoRelativePath(value.lockfilePath) !== value.lockfilePath
  ) {
    diagnostics.push(
      diagnostic(
        "LOCKFILE_PATH_INVALID",
        "Receipt lockfile path is outside the two normalized allowlisted paths.",
      ),
    );
  }
  if (
    typeof value.lockfileSha256 !== "string" ||
    !SHA256.test(value.lockfileSha256)
  ) {
    diagnostics.push(
      diagnostic(
        "LOCKFILE_HASH_INVALID",
        "Lock snapshot must be a lowercase SHA-256 digest.",
      ),
    );
  }
  if (value.licenseSpdx !== FP007_JSR_LICENSE) {
    diagnostics.push(
      diagnostic(
        "LICENSE_MISMATCH",
        "Only the official JSR MIT conclusion is accepted.",
      ),
    );
  }
  if (value.sourceKind !== FP007_JSR_SOURCE_KIND) {
    diagnostics.push(
      diagnostic(
        "SOURCE_KIND_INVALID",
        "Only official JSR metadata is an accepted source kind.",
      ),
    );
  }
  if (!isIsoDate(value.reviewDate)) {
    diagnostics.push(
      diagnostic(
        "REVIEW_DATE_INVALID",
        "Review date must be a valid bounded ISO date.",
      ),
    );
  }
  if (
    typeof value.receiptDigest !== "string" || !SHA256.test(value.receiptDigest)
  ) {
    diagnostics.push(
      diagnostic(
        "RECEIPT_DIGEST_INVALID",
        "Receipt digest must be lowercase SHA-256.",
      ),
    );
  } else {
    const {
      receiptDigest: _ignored,
      ...body
    } = value as unknown as JsrLicenseReceiptV1;
    if (value.receiptDigest !== await sha256Hex(receiptBody(body))) {
      diagnostics.push(
        diagnostic(
          "RECEIPT_DIGEST_MISMATCH",
          "Receipt digest does not match its canonical bounded content.",
        ),
      );
    }
  }
  if (expected !== undefined) {
    for (const [field, expectedValue] of Object.entries(expected)) {
      if (value[field] !== expectedValue) {
        diagnostics.push(diagnostic(
          `${field.toUpperCase()}_MISMATCH`,
          `Receipt ${field} does not match the inspected lock entry or snapshot.`,
        ));
      }
    }
  }
  return {
    valid: diagnostics.length === 0,
    licenseSpdx: diagnostics.length === 0 ? "MIT" : "UNKNOWN",
    diagnostics,
  };
}

export async function createJsrLicenseReceiptArtifact(
  receipts: readonly JsrLicenseReceiptV1[],
): Promise<JsrLicenseReceiptArtifactV1> {
  const diagnostics: JsrLicenseReceiptDiagnostic[] = [];
  const seen = new Set<string>();
  for (const receipt of receipts) {
    if (seen.has(receipt.lockfilePath)) {
      diagnostics.push(
        diagnostic(
          "DUPLICATE_ENTRY",
          "A lockfile receipt occurs more than once.",
        ),
      );
    }
    seen.add(receipt.lockfilePath);
    const checked = await validateJsrLicenseReceipt(receipt);
    diagnostics.push(...checked.diagnostics);
  }
  if (
    receipts.length !== FP007_JSR_REVIEW_LOCKFILES.length ||
    FP007_JSR_REVIEW_LOCKFILES.some((path) => !seen.has(path))
  ) {
    diagnostics.push(
      diagnostic(
        "RECEIPT_SCOPE_INCOMPLETE",
        "Artifact must contain exactly one receipt for each allowlisted lockfile.",
      ),
    );
  }
  if (diagnostics.length > 0) {
    throw new Error(
      `Invalid JSR license artifact: ${
        diagnostics.map((item) => item.code).join(",")
      }`,
    );
  }
  const body = {
    documentId: FP007_JSR_LICENSE_ARTIFACT_DOCUMENT,
    schemaVersion: FP007_JSR_LICENSE_ARTIFACT_SCHEMA_VERSION,
    receipts: [...receipts].sort((left, right) =>
      compareCodeUnitStrings(left.lockfilePath, right.lockfilePath)
    ),
  } as const;
  return { ...body, artifactDigest: await sha256Hex(artifactBody(body)) };
}

export async function validateJsrLicenseReceiptArtifact(
  value: unknown,
): Promise<JsrLicenseReceiptArtifactValidation> {
  const diagnostics: JsrLicenseReceiptDiagnostic[] = [];
  if (!object(value)) {
    return {
      valid: false,
      receipts: new Map(),
      diagnostics: [
        diagnostic("ARTIFACT_INVALID", "Artifact must be an object."),
      ],
    };
  }
  if (
    !onlyKeys(value, [
      "documentId",
      "schemaVersion",
      "receipts",
      "artifactDigest",
    ])
  ) {
    diagnostics.push(
      diagnostic(
        "UNKNOWN_FIELD",
        "Artifact contains a field outside the exact allowlist.",
      ),
    );
  }
  if (
    value.documentId !== FP007_JSR_LICENSE_ARTIFACT_DOCUMENT ||
    value.schemaVersion !== FP007_JSR_LICENSE_ARTIFACT_SCHEMA_VERSION
  ) {
    diagnostics.push(
      diagnostic(
        "ARTIFACT_VERSION_INVALID",
        "Only JSR license artifact V1 is accepted.",
      ),
    );
  }
  if (!Array.isArray(value.receipts)) {
    diagnostics.push(
      diagnostic("RECEIPTS_INVALID", "Artifact receipts must be an array."),
    );
  }
  const validReceipts: JsrLicenseReceiptV1[] = [];
  const seen = new Set<string>();
  if (Array.isArray(value.receipts)) {
    for (const receipt of value.receipts) {
      const checked = await validateJsrLicenseReceipt(receipt);
      diagnostics.push(...checked.diagnostics);
      if (object(receipt) && typeof receipt.lockfilePath === "string") {
        if (seen.has(receipt.lockfilePath)) {
          diagnostics.push(
            diagnostic(
              "DUPLICATE_ENTRY",
              "A lockfile receipt occurs more than once.",
            ),
          );
        }
        seen.add(receipt.lockfilePath);
      }
      if (checked.valid) validReceipts.push(receipt as JsrLicenseReceiptV1);
    }
  }
  if (
    validReceipts.length !== FP007_JSR_REVIEW_LOCKFILES.length ||
    FP007_JSR_REVIEW_LOCKFILES.some((path) => !seen.has(path))
  ) {
    diagnostics.push(
      diagnostic(
        "RECEIPT_SCOPE_INCOMPLETE",
        "Artifact must contain exactly one valid receipt for each allowlisted lockfile.",
      ),
    );
  }
  if (
    typeof value.artifactDigest !== "string" ||
    !SHA256.test(value.artifactDigest)
  ) {
    diagnostics.push(
      diagnostic(
        "ARTIFACT_DIGEST_INVALID",
        "Artifact digest must be lowercase SHA-256.",
      ),
    );
  } else {
    const body = {
      documentId: value.documentId,
      schemaVersion: value.schemaVersion,
      receipts: value.receipts,
    };
    if (
      value.artifactDigest !==
        await sha256Hex(
          artifactBody(
            body as Omit<JsrLicenseReceiptArtifactV1, "artifactDigest">,
          ),
        )
    ) {
      diagnostics.push(
        diagnostic(
          "ARTIFACT_DIGEST_MISMATCH",
          "Artifact digest does not match canonical content.",
        ),
      );
    }
  }
  if (diagnostics.length > 0) {
    return { valid: false, receipts: new Map(), diagnostics };
  }
  const artifact = {
    documentId: value.documentId as typeof FP007_JSR_LICENSE_ARTIFACT_DOCUMENT,
    schemaVersion: value
      .schemaVersion as typeof FP007_JSR_LICENSE_ARTIFACT_SCHEMA_VERSION,
    receipts: validReceipts,
    artifactDigest: value.artifactDigest as string,
  };
  return {
    valid: true,
    artifact,
    receipts: new Map(
      validReceipts.map((receipt) => [receipt.lockfilePath, receipt]),
    ),
    diagnostics,
  };
}

export function serializeJsrLicenseReceiptArtifact(
  artifact: JsrLicenseReceiptArtifactV1,
): string {
  return canonicalJson(artifact);
}

export async function loadJsrLicenseReceiptArtifact(
  root: string,
  relativePath = FP007_JSR_LICENSE_ARTIFACT_PATH,
): Promise<JsrLicenseReceiptArtifactLoadResult> {
  if (
    typeof relativePath !== "string" ||
    normalizeRepoRelativePath(relativePath) !== relativePath
  ) {
    return {
      present: false,
      valid: false,
      receipts: new Map(),
      diagnostics: [
        diagnostic(
          "ARTIFACT_PATH_INVALID",
          "Artifact path must be repository-relative without traversal.",
        ),
      ],
    };
  }
  let raw: string;
  try {
    raw = await Deno.readTextFile(`${root}/${relativePath}`);
  } catch {
    return {
      present: false,
      valid: false,
      receipts: new Map(),
      diagnostics: [
        diagnostic(
          "ARTIFACT_READ_FAILED",
          "Artifact could not be read from the repository.",
        ),
      ],
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {
      present: true,
      valid: false,
      receipts: new Map(),
      diagnostics: [
        diagnostic("ARTIFACT_JSON_INVALID", "Artifact is not valid JSON."),
      ],
    };
  }
  const checked = await validateJsrLicenseReceiptArtifact(parsed);
  return { present: true, ...checked };
}
