import { FP005_REDACTION_POLICY, redactDiagnostic } from "./policies.ts";
import {
  fp005Failure,
  fp005Success,
  type Fp005RedactionPolicy,
  type Fp005Result,
} from "./contracts.ts";
import { FP005_ERROR_CODES } from "./error-codes.ts";

/** The only representation for rejected diagnostic values. */
const REDACTED = "[REDACTED]" as const;
const SAFE_TEXT = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const SAFE_KEYS = new Set([
  "schemaVersion", "eventName", "operationId", "feature", "durationMs", "result", "errorCode",
  "code", "path", "recoverable", "kind", "status",
]);

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function safeScalar(key: string, value: unknown): string | number | boolean | typeof REDACTED | undefined {
  if (!SAFE_KEYS.has(key)) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : REDACTED;
  if (typeof value !== "string" || utf8Bytes(value) > 256) return REDACTED;
  return SAFE_TEXT.test(value) ? value : REDACTED;
}

/**
 * Project/media/payment diagnostics are never a data transport.  Only a tiny
 * flat allowlist survives; nested values, arbitrary strings, arrays, binary,
 * Blob/File, and unknown fields are omitted rather than recursively copied.
 */
export function redactPrivacyValue(input: unknown, policy: Fp005RedactionPolicy = FP005_REDACTION_POLICY): Fp005Result<unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return fp005Success(REDACTED);
  }
  const output: Record<string, string | number | boolean | typeof REDACTED> = {};
  try {
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const normalized = key.toLowerCase();
      if (policy.forbiddenFields.some((field) => normalized.includes(field.toLowerCase()))) {
        output[key] = REDACTED;
        continue;
      }
      const scalar = safeScalar(key, value);
      if (scalar !== undefined) output[key] = scalar;
    }
  } catch {
    return fp005Failure(FP005_ERROR_CODES.REDACTION_REQUIRED, "Diagnostic cannot be safely redacted.");
  }
  const serialized = JSON.stringify(output);
  if (utf8Bytes(serialized) > policy.maxDiagnosticBytes) {
    return fp005Failure(FP005_ERROR_CODES.REDACTION_REQUIRED, "Diagnostic exceeds the privacy-safe size limit.");
  }
  return fp005Success(Object.freeze(output));
}

export const redactDiagnosticValue = redactPrivacyValue;
export { REDACTED };
export { redactDiagnostic };
