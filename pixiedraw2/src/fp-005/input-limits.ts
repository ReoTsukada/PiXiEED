/**
 * FP-005 bounded input inspection.
 *
 * This module only returns bounded metadata. It never returns a caller payload
 * or includes one in a diagnostic. Callers may choose a smaller limit, but a
 * caller cannot raise the versioned FP-005 limits.
 */

import { FP005_ERROR_CODES } from "./error-codes.ts";
import {
  fp005Failure,
  fp005Success,
  type Fp005InputLimits,
  type Fp005Result,
} from "./contracts.ts";
import { FP005_INPUT_LIMITS } from "./policies.ts";

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

export interface Fp005InputLimitOverrides extends Partial<Fp005InputLimits> {
  /** A smaller node limit for the JSON graph; callers cannot raise it. */
  readonly maxJsonNodes?: number;
  /** A smaller array-item limit; callers cannot raise it. */
  readonly maxArrayItems?: number;
  /** A smaller object-property limit; callers cannot raise it. */
  readonly maxObjectProperties?: number;
  /** Alias for a smaller JSON byte limit; callers cannot raise it. */
  readonly maxJsonBytes?: number;
  /** Alias for a smaller binary byte limit; callers cannot raise it. */
  readonly maxBinaryBytes?: number;
}

export interface Fp005JsonLimits {
  readonly maxBytes: number;
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxStringBytes: number;
  readonly maxArrayItems: number;
  readonly maxObjectProperties: number;
}

export interface Fp005BinaryLimits {
  readonly maxBytes: number;
}

export interface Fp005JsonSummary {
  readonly kind: "JSON";
  readonly byteLength: number;
  readonly nodeCount: number;
  readonly maxDepth: number;
  readonly stringCount: number;
  readonly arrayCount: number;
  readonly objectCount: number;
}

export interface Fp005BinarySummary {
  readonly kind: "BINARY";
  readonly byteLength: number;
  readonly maxBytes: number;
}

export const FP005_JSON_LIMITS: Fp005JsonLimits = Object.freeze({
  maxBytes: FP005_INPUT_LIMITS.maxEnvelopeBytes,
  maxDepth: FP005_INPUT_LIMITS.maxJsonDepth,
  maxNodes: FP005_INPUT_LIMITS.maxCollectionItems,
  maxStringBytes: FP005_INPUT_LIMITS.maxStringBytes,
  maxArrayItems: FP005_INPUT_LIMITS.maxCollectionItems,
  maxObjectProperties: FP005_INPUT_LIMITS.maxCollectionItems,
});

export const FP005_BINARY_LIMITS: Fp005BinaryLimits = Object.freeze({
  maxBytes: FP005_INPUT_LIMITS.maxBlobBytes,
});

function fail<T>(code: typeof FP005_ERROR_CODES[keyof typeof FP005_ERROR_CODES], message: string, path?: string): Fp005Result<T> {
  return fp005Failure(code, message, path);
}

function boundedLimit(requested: unknown, canonical: number): number {
  if (requested === undefined) return canonical;
  if (!Number.isSafeInteger(requested) || (requested as number) < 0) return 0;
  return Math.min(requested as number, canonical);
}

export function resolveJsonLimits(overrides: Fp005InputLimitOverrides = {}): Fp005JsonLimits {
  return {
    maxBytes: boundedLimit(overrides.maxJsonBytes ?? overrides.maxEnvelopeBytes, FP005_JSON_LIMITS.maxBytes),
    maxDepth: boundedLimit(overrides.maxJsonDepth, FP005_JSON_LIMITS.maxDepth),
    maxNodes: boundedLimit(overrides.maxJsonNodes ?? overrides.maxCollectionItems, FP005_JSON_LIMITS.maxNodes),
    maxStringBytes: boundedLimit(overrides.maxStringBytes, FP005_JSON_LIMITS.maxStringBytes),
    maxArrayItems: boundedLimit(overrides.maxArrayItems ?? overrides.maxCollectionItems, FP005_JSON_LIMITS.maxArrayItems),
    maxObjectProperties: boundedLimit(overrides.maxObjectProperties ?? overrides.maxCollectionItems, FP005_JSON_LIMITS.maxObjectProperties),
  };
}

export function resolveBinaryLimits(overrides: Fp005InputLimitOverrides = {}): Fp005BinaryLimits {
  return {
    maxBytes: boundedLimit(overrides.maxBinaryBytes ?? overrides.maxBlobBytes, FP005_BINARY_LIMITS.maxBytes),
  };
}

/** Returns a byte count, or limit + 1, without allocating the caller string. */
function utf8LengthAtMost(value: string, limit: number): number {
  const buffer = new Uint8Array(limit + 1);
  const encoded = TEXT_ENCODER.encodeInto(value, buffer);
  if (encoded.read < value.length || encoded.written > limit) return limit + 1;
  return encoded.written;
}

function addBytes(state: JsonWalkState, amount: number): boolean {
  if (!Number.isSafeInteger(amount) || amount < 0) return false;
  state.byteLength += amount;
  return Number.isSafeInteger(state.byteLength) && state.byteLength <= state.limits.maxBytes;
}

function quotedStringLength(value: string, state: JsonWalkState): number | undefined {
  const rawLength = utf8LengthAtMost(value, state.limits.maxStringBytes);
  if (rawLength > state.limits.maxStringBytes) return undefined;
  // The source string is already bounded by maxStringBytes. JSON.stringify is
  // therefore bounded as well, and its result is used only for byte accounting.
  const quoted = JSON.stringify(value);
  if (typeof quoted !== "string") return undefined;
  const quotedLength = utf8LengthAtMost(quoted, state.limits.maxBytes);
  return quotedLength > state.limits.maxBytes ? undefined : quotedLength;
}

interface JsonWalkState {
  readonly limits: Fp005JsonLimits;
  readonly seen: Set<object>;
  byteLength: number;
  nodeCount: number;
  maxDepth: number;
  stringCount: number;
  arrayCount: number;
  objectCount: number;
}

function isCanonicalArrayKey(key: string, length: number): boolean {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
}

function ownDataDescriptor(value: object, key: string): PropertyDescriptor | undefined {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) return undefined;
    return descriptor;
  } catch {
    return undefined;
  }
}

function hasOnlyJsonArrayProperties(value: readonly unknown[]): boolean {
  try {
    const keys = Reflect.ownKeys(value);
    return keys.every((key) => key === "length" || (typeof key === "string" && isCanonicalArrayKey(key, value.length)));
  } catch {
    return false;
  }
}

function walkJsonValue(value: unknown, depth: number, state: JsonWalkState): boolean {
  if (depth > state.limits.maxDepth) return false;
  state.maxDepth = Math.max(state.maxDepth, depth);
  state.nodeCount += 1;
  if (state.nodeCount > state.limits.maxNodes) return false;

  if (value === null) return addBytes(state, 4);
  if (typeof value === "string") {
    state.stringCount += 1;
    const length = quotedStringLength(value, state);
    return length !== undefined && addBytes(state, length);
  }
  if (typeof value === "boolean") return addBytes(state, value ? 4 : 5);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return false;
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" && addBytes(state, utf8LengthAtMost(serialized, state.limits.maxBytes));
  }
  if (typeof value !== "object" || value === undefined) return false;

  if (state.seen.has(value)) return false;
  state.seen.add(value);

  if (Array.isArray(value)) {
    state.arrayCount += 1;
    if (value.length > state.limits.maxArrayItems || !hasOnlyJsonArrayProperties(value)) return false;
    if (!addBytes(state, 1)) return false;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = ownDataDescriptor(value, String(index));
      if (descriptor === undefined || !addBytes(state, index === 0 ? 0 : 1) || !walkJsonValue(descriptor.value, depth + 1, state)) return false;
    }
    return addBytes(state, 1);
  }

  let prototype: object | null;
  let keys: string[];
  try {
    prototype = Object.getPrototypeOf(value);
    keys = Object.keys(value);
    const ownKeys = Reflect.ownKeys(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string")) return false;
  } catch {
    return false;
  }
  state.objectCount += 1;
  if (keys.length > state.limits.maxObjectProperties) return false;
  if (!addBytes(state, 1)) return false;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === undefined) return false;
    const descriptor = ownDataDescriptor(value, key);
    const keyLength = quotedStringLength(key, state);
    if (descriptor === undefined || keyLength === undefined || !addBytes(state, index === 0 ? keyLength + 1 : keyLength + 2) || !walkJsonValue(descriptor.value, depth + 1, state)) return false;
  }
  return addBytes(state, 1);
}

function byteView(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return undefined;
}

function parseJsonBytes(bytes: Uint8Array, limits: Fp005JsonLimits): unknown | undefined {
  if (bytes.byteLength > limits.maxBytes) return undefined;
  try {
    const text = TEXT_DECODER.decode(bytes);
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Validates a JSON value or bounded JSON source and returns metadata only.
 * Cycles, accessors, exotic objects, sparse arrays, non-finite numbers, and
 * all fixed-limit violations fail closed.
 */
export function validateJsonInput(input: unknown, overrides: Fp005InputLimitOverrides = {}): Fp005Result<Fp005JsonSummary> {
  const limits = resolveJsonLimits(overrides);
  let value = input;
  const bytes = byteView(input);
  if (bytes !== undefined) {
    if (bytes.byteLength > limits.maxBytes) return fail(FP005_ERROR_CODES.INPUT_TOO_LARGE, "JSON input exceeds the fixed byte limit.", "jsonBytes");
    value = parseJsonBytes(bytes, limits);
    if (value === undefined) return fail(FP005_ERROR_CODES.INPUT_INVALID, "JSON input is malformed or not UTF-8.", "json");
  } else if (typeof input === "string") {
    if (utf8LengthAtMost(input, limits.maxBytes) > limits.maxBytes) return fail(FP005_ERROR_CODES.INPUT_TOO_LARGE, "JSON input exceeds the fixed byte limit.", "jsonBytes");
    try {
      value = JSON.parse(input) as unknown;
    } catch {
      return fail(FP005_ERROR_CODES.INPUT_INVALID, "JSON input is malformed.", "json");
    }
  }

  const state: JsonWalkState = {
    limits,
    seen: new Set<object>(),
    byteLength: 0,
    nodeCount: 0,
    maxDepth: 0,
    stringCount: 0,
    arrayCount: 0,
    objectCount: 0,
  };
  if (!walkJsonValue(value, 0, state)) {
    const code = state.byteLength > limits.maxBytes ? FP005_ERROR_CODES.INPUT_TOO_LARGE : FP005_ERROR_CODES.INPUT_INVALID;
    return fail(code, "JSON input exceeds a fixed FP-005 structural limit.", "json");
  }
  return fp005Success({
    kind: "JSON",
    byteLength: state.byteLength,
    nodeCount: state.nodeCount,
    maxDepth: state.maxDepth,
    stringCount: state.stringCount,
    arrayCount: state.arrayCount,
    objectCount: state.objectCount,
  });
}

export function validateBinarySize(input: unknown, overrides: Fp005InputLimitOverrides = {}): Fp005Result<Fp005BinarySummary> {
  const limits = resolveBinaryLimits(overrides);
  let byteLength: unknown = input;
  const bytes = byteView(input);
  if (bytes !== undefined) {
    byteLength = bytes.byteLength;
  } else if (input !== null && typeof input === "object") {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(input, "byteLength");
      if (descriptor === undefined || !("value" in descriptor)) return fail(FP005_ERROR_CODES.INPUT_INVALID, "Binary metadata is invalid.", "byteLength");
      byteLength = descriptor.value;
    } catch {
      return fail(FP005_ERROR_CODES.INPUT_INVALID, "Binary metadata is invalid.", "byteLength");
    }
  }
  if (!Number.isSafeInteger(byteLength) || (byteLength as number) < 0) return fail(FP005_ERROR_CODES.INPUT_INVALID, "Binary byte length is invalid.", "byteLength");
  if ((byteLength as number) > limits.maxBytes) return fail(FP005_ERROR_CODES.INPUT_TOO_LARGE, "Binary input exceeds the fixed byte limit.", "byteLength");
  return fp005Success({ kind: "BINARY", byteLength: byteLength as number, maxBytes: limits.maxBytes });
}

export const validateJson = validateJsonInput;
export const validateStructuredInput = validateJsonInput;
export const validateBlobSize = validateBinarySize;
export const validateBinaryInput = validateBinarySize;
