import {
  adaptFp005V1StorageLocatorToRegistry,
  adaptRegistryStorageLocatorToFp005V1,
  validateRegistryStorageLocator,
  type RegistryStorageLocatorToFp005V1Options,
} from "../../src/fp-005/locator-validation.ts";
import { FP005_ERROR_CODES } from "../../src/fp-005/error-codes.ts";
import type { ContentHash } from "../../src/wp160-contracts.ts";

function assert(value: boolean, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) throw new Error(`expected ${String(expected)}, got ${String(actual)}`);
}

function assertRejected(result: { readonly ok: boolean }, label: string): void {
  assert(!result.ok, `${label} must be rejected`);
}

const HASH = "a".repeat(64) as ContentHash;
const BINDING = { tenantId: "tenant-1", resourceType: "asset", resourceId: "asset-1" } as const;
const METADATA: RegistryStorageLocatorToFp005V1Options = {
  ...BINDING,
  contentHash: HASH,
  byteLength: 32,
  mimeType: "application/octet-stream",
};

Deno.test("FP005 LOCATOR-COMPAT round-trips exact OPFS and Object Storage fixtures", () => {
  const fixtures = [
    { provider: "opfs", bucket: null, objectKey: "tenant-1/assets/asset-1.bin" },
    { provider: "object-storage", bucket: "assets", objectKey: "tenant-1/assets/asset-1.bin" },
  ] as const;

  for (const fixture of fixtures) {
    const adapted = adaptRegistryStorageLocatorToFp005V1(fixture, {
      ...METADATA,
      expectedBinding: BINDING,
    });
    assert(adapted.ok);
    assertEquals(adapted.value.schemaVersion, "FP005_STORAGE_LOCATOR_V1");
    assertEquals(adapted.value.path, fixture.objectKey);
    assertEquals(adapted.value.objectKey as string, fixture.objectKey);
    assertEquals(adapted.value.tenantId, BINDING.tenantId);

    const roundTrip = adaptFp005V1StorageLocatorToRegistry(adapted.value, BINDING);
    assert(roundTrip.ok);
    assertEquals(JSON.stringify(roundTrip.value), JSON.stringify(fixture));
  }
});

Deno.test("FP005 LOCATOR-COMPAT keeps legacy input optional and rejects provider/bucket mismatches", () => {
  assert(validateRegistryStorageLocator({
    provider: "opfs",
    bucket: null,
    objectKey: "legacy/file.bin",
  }).ok);

  assertRejected(adaptRegistryStorageLocatorToFp005V1({
    provider: "unknown",
    bucket: null,
    objectKey: "legacy/file.bin",
  }, METADATA), "unknown provider");
  assertRejected(adaptRegistryStorageLocatorToFp005V1({
    provider: "object-storage",
    bucket: null,
    objectKey: "legacy/file.bin",
  }, METADATA), "missing Object Storage bucket");
  assertRejected(adaptRegistryStorageLocatorToFp005V1({
    provider: "opfs",
    bucket: "assets",
    objectKey: "legacy/file.bin",
  }, METADATA), "OPFS bucket mismatch");
});

Deno.test("FP005 LOCATOR-COMPAT rejects unsafe keys and cross-tenant bindings", () => {
  const unsafe = adaptRegistryStorageLocatorToFp005V1({
    provider: "opfs",
    bucket: null,
    objectKey: "../escape.bin",
  }, METADATA);
  assertRejected(unsafe, "unsafe objectKey");

  const foreign = adaptRegistryStorageLocatorToFp005V1({
    provider: "opfs",
    bucket: null,
    objectKey: "tenant-1/assets/asset-1.bin",
  }, { ...METADATA, expectedBinding: { ...BINDING, tenantId: "tenant-2" } });
  assertRejected(foreign, "cross-tenant binding");
  if (!foreign.ok) assertEquals(foreign.diagnostics[0]?.code, FP005_ERROR_CODES.TENANT_SCOPE_DENIED);
});

Deno.test("FP005 LOCATOR-COMPAT rejects lossy or inconsistent reverse conversions", () => {
  const plainFp005Locator = {
    placement: "OPFS",
    path: "tenant-1/assets/asset-1.bin",
    contentHash: HASH,
    byteLength: 32,
    tenantId: BINDING.tenantId,
    resourceType: BINDING.resourceType,
    resourceId: BINDING.resourceId,
  } as const;
  assertRejected(adaptFp005V1StorageLocatorToRegistry(plainFp005Locator), "plain FP005 locator");

  const adapted = adaptRegistryStorageLocatorToFp005V1({
    provider: "object-storage",
    bucket: "assets",
    objectKey: "tenant-1/assets/asset-1.bin",
  }, METADATA);
  assert(adapted.ok);
  assertRejected(adaptFp005V1StorageLocatorToRegistry({
    ...adapted.value,
    placement: "DATABASE",
  }), "unmappable FP005 placement");
  assertRejected(adaptFp005V1StorageLocatorToRegistry({
    ...adapted.value,
    bucket: null,
  }), "inconsistent provider/bucket pair");
});
