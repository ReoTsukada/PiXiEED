import { FP005_TELEMETRY_POLICY, validateTelemetry } from "./policies.ts";
import {
  fp005Failure,
  fp005Success,
  type Fp005Result,
  type Fp005TelemetryEvent,
} from "./contracts.ts";
import { FP005_ERROR_CODES } from "./error-codes.ts";
import { redactPrivacyValue } from "./redaction.ts";

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;
const TELEMETRY_KEYS = new Set(["schemaVersion", "eventName", "operationId", "feature", "durationMs", "result", "errorCode"]);

function invalid(message: string, path?: string): Fp005Result<never> {
  return fp005Failure(FP005_ERROR_CODES.TELEMETRY_INVALID, message, path);
}

function safeOptionalId(value: unknown, name: string): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !SAFE_NAME.test(value) || new TextEncoder().encode(value).byteLength > 256) return null;
  return value;
}

export function sanitizeTelemetry(input: unknown): Fp005Result<Fp005TelemetryEvent> {
  const checked = validateTelemetry(input);
  if (!checked.ok) return checked;
  const event = checked.value;
  const unknownField = Object.keys(input as Record<string, unknown>).some((key) => !TELEMETRY_KEYS.has(key));
  if (unknownField) return invalid("Telemetry contains an unsupported field.");
  if (new TextEncoder().encode(event.eventName).byteLength > FP005_TELEMETRY_POLICY.maxEventNameBytes || !SAFE_NAME.test(event.eventName)) {
    return invalid("Telemetry event name is not allowlisted.", "eventName");
  }
  const operationId = safeOptionalId(event.operationId, "operationId");
  const feature = safeOptionalId(event.feature, "feature");
  if (operationId === null) return invalid("Telemetry operation id is invalid.", "operationId");
  if (feature === null) return invalid("Telemetry feature is invalid.", "feature");
  if (event.durationMs !== undefined && (!Number.isFinite(event.durationMs) || event.durationMs < 0 || event.durationMs > 86_400_000)) {
    return invalid("Telemetry duration is invalid.", "durationMs");
  }
  const sanitized: Fp005TelemetryEvent = {
    schemaVersion: event.schemaVersion,
    eventName: event.eventName,
    ...(operationId === undefined ? {} : { operationId }),
    ...(feature === undefined ? {} : { feature }),
    ...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }),
    result: event.result,
    ...(event.errorCode === undefined ? {} : { errorCode: event.errorCode }),
  };
  return fp005Success(sanitized);
}

export function serializeTelemetry(input: unknown): Fp005Result<string> {
  const sanitized = sanitizeTelemetry(input);
  if (!sanitized.ok) return sanitized;
  const redacted = redactPrivacyValue(sanitized.value);
  if (!redacted.ok) return redacted as Fp005Result<string>;
  const serialized = JSON.stringify(redacted.value);
  if (serialized === undefined) return invalid("Telemetry serialization failed.");
  return fp005Success(serialized);
}

export const createTelemetryEvent = sanitizeTelemetry;
export const redactTelemetry = sanitizeTelemetry;
