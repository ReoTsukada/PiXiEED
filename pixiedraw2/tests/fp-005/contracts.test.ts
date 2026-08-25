import { FP005_ERROR_CODES } from "../../src/fp-005/error-codes.ts";
import { FP005_INPUT_LIMITS, decideRetention, redactDiagnostic, validateInput, validatePath, validateStorageLocator, validateTelemetry } from "../../src/fp-005/policies.ts";

function assert(value: boolean, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) throw new Error(`expected ${String(expected)}, got ${String(actual)}`);
}

const HASH = "a".repeat(64);
const locator = { placement: "OPFS", path: "tenant/project/chunk", contentHash: HASH, byteLength: 12, tenantId: "tenant-1", resourceType: "project", resourceId: "project-1" } as const;

Deno.test("FP-005 contracts preserve bounded locator shape and reject traversal", () => {
  assert(validateStorageLocator(locator).ok);
  assertEquals(validatePath({ path: "../secret", authority: "LOCAL" }).ok, false);
  assertEquals(validatePath({ path: "%2e%2e/secret", authority: "LOCAL" }).ok, false);
});

Deno.test("FP-005 input, telemetry, redaction, and retention fail closed", () => {
  assertEquals(FP005_INPUT_LIMITS.maxEnvelopeBytes, 262144);
  assertEquals(validateInput({ value: "x" }, { ...FP005_INPUT_LIMITS, maxJsonDepth: 0 }).ok, false);
  assertEquals(validateTelemetry({ schemaVersion: "FP005_V1", eventName: "draw", result: "OK", errorCode: "not-a-code" }).ok, false);
  const redacted = redactDiagnostic({ authorization: "jwt", nested: { email: "a@example.com" } });
  assert(redacted.ok && JSON.stringify(redacted.value).includes("[REDACTED]"));
  const retention = decideRetention("tenant-1", "asset-1", "PURCHASED");
  assert(retention.ok && retention.value.action === "RETAIN");
  assertEquals(validateStorageLocator({ ...locator, path: "/absolute" }).diagnostics[0]?.code, FP005_ERROR_CODES.PATH_INVALID);
});
