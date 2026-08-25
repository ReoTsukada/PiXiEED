import { REDACTED, redactPrivacyValue } from "../../src/fp-005/redaction.ts";
import { sanitizeTelemetry, serializeTelemetry } from "../../src/fp-005/telemetry.ts";

function assert(value: boolean, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) throw new Error(`expected ${String(expected)}, got ${String(actual)}`);
}

function assertStringIncludes(value: string, expected: string): void {
  assert(value.includes(expected), `expected ${JSON.stringify(value)} to include ${expected}`);
}

Deno.test("FP005-PII-001 redacts forbidden fields and sensitive strings before serialization", () => {
  const result = redactPrivacyValue({
    authorization: "Bearer eyJhbGciOiJub25lIn0.x.y",
    email: "person@example.com",
    nested: { note: "safe diagnostic" },
  });
  assert(result.ok);
  const serialized = JSON.stringify(result.value);
  assertStringIncludes(serialized, REDACTED);
  assertEquals(serialized.includes("person@example.com"), false);
  assertEquals(serialized.includes("eyJhbGci"), false);
});

Deno.test("FP005-TELEMETRY-001 emits only the allowlisted telemetry shape", () => {
  const result = serializeTelemetry({
    schemaVersion: "FP005_V1",
    eventName: "draw.completed",
    operationId: "opaque-operation-1",
    result: "OK",
    privateBody: "must not be serialized",
    email: "person@example.com",
  });
  assertEquals(result.ok, false);
  assert(sanitizeTelemetry({ schemaVersion: "FP005_V1", eventName: "bad event", result: "OK" }).ok === false);
});
