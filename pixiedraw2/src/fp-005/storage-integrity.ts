/** FP-005 metadata-only storage integrity boundary. */
import { FP005_ERROR_CODES, type Fp005ErrorCode } from "./error-codes.ts";
import {
  FP005_SCHEMA_VERSION,
  fp005Failure,
  fp005Success,
  type Fp005Result,
  type Fp005StorageLocator,
} from "./contracts.ts";
import { validateStorageLocator } from "./policies.ts";

export interface Fp005StorageIntegrityInput {
  readonly schemaVersion: typeof FP005_SCHEMA_VERSION;
  readonly locator: unknown;
  readonly observedContentHash: string;
  readonly observedByteLength: number;
}

export interface Fp005StorageIntegrityResult {
  readonly schemaVersion: typeof FP005_SCHEMA_VERSION;
  readonly locator: Fp005StorageLocator;
  readonly contentHash: Fp005StorageLocator["contentHash"];
  readonly byteLength: number;
  readonly verified: true;
}

function fail<T>(code: Fp005ErrorCode, message: string, path?: string): Fp005Result<T> {
  return fp005Failure(code, message, path);
}

/** Verify provider metadata without accepting or retaining raw blob content. */
export function validateStorageIntegrity(value: unknown): Fp005Result<Fp005StorageIntegrityResult> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail(FP005_ERROR_CODES.STORAGE_LOCATOR_INVALID, "Storage integrity input is invalid.");
  }
  const input = value as Partial<Fp005StorageIntegrityInput>;
  if (input.schemaVersion !== FP005_SCHEMA_VERSION) {
    return fail(FP005_ERROR_CODES.SCHEMA_UNSUPPORTED, "Storage integrity policy version is unsupported.", "schemaVersion");
  }
  const locator = validateStorageLocator(input.locator);
  if (!locator.ok) return locator;
  if (typeof input.observedContentHash !== "string" || input.observedContentHash !== locator.value.contentHash) {
    return fail(FP005_ERROR_CODES.STORAGE_LOCATOR_INVALID, "Stored content hash does not match the locator.", "observedContentHash");
  }
  const observedByteLength = input.observedByteLength;
  if (typeof observedByteLength !== "number" || !Number.isSafeInteger(observedByteLength) || observedByteLength < 0 || observedByteLength !== locator.value.byteLength) {
    return fail(FP005_ERROR_CODES.STORAGE_LOCATOR_INVALID, "Stored byte length does not match the locator.", "observedByteLength");
  }
  return fp005Success({
    schemaVersion: FP005_SCHEMA_VERSION,
    locator: locator.value,
    contentHash: locator.value.contentHash,
    byteLength: locator.value.byteLength,
    verified: true,
  });
}

export const checkStorageIntegrity = validateStorageIntegrity;
export const verifyStorageIntegrity = validateStorageIntegrity;
