import {
  validateArchiveEntries,
  validateArchiveEntry,
  validateNormalizedPathSet,
  validateNormalizedRelativePath,
} from "../../src/fp-005/path-validation.ts";
import {
  validateRegistryStorageLocator,
  validateStorageLocator,
} from "../../src/fp-005/locator-validation.ts";

function assert(value: boolean, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

function assertRejected(value: { readonly ok: boolean }, label: string): void {
  assert(!value.ok, `${label} must be rejected`);
}

const HASH = "a".repeat(64);

const validPath = "tenant/project/asset.bin";
const validMetadataLocator = {
  placement: "OPFS",
  path: validPath,
  contentHash: HASH,
  byteLength: 32,
  tenantId: "tenant-1",
  resourceType: "asset",
  resourceId: "asset-1",
} as const;

Deno.test("FP005-PATH-001 accepts canonical relative paths", () => {
  const result = validateNormalizedRelativePath({ path: validPath, authority: "LOCAL" });
  assert(result.ok);
  assert(result.value === validPath);
  assert(validateNormalizedRelativePath("日本語/画像.png").ok);
});

Deno.test("FP005-PATH-001 rejects absolute, traversal, encoded traversal, NUL, and backslash paths", () => {
  for (const candidate of [
    "/absolute/file",
    "../secret",
    "a/../../secret",
    "%2e%2e/secret",
    "a/%2Fsecret",
    `safe/${String.fromCharCode(0)}name`,
    "safe\\name",
  ]) {
    assertRejected(validateNormalizedRelativePath(candidate), candidate);
  }
});

Deno.test("FP005-PATH-001 rejects non-canonical Unicode and duplicate normalized paths", () => {
  assertRejected(validateNormalizedRelativePath("e\u0301/file"), "NFD path");
  const duplicates = validateNormalizedPathSet(["é/file", "é/file"]);
  assertRejected(duplicates, "duplicate normalized path");
  assert(validateNormalizedPathSet(["é/file", "a/file"]).ok);
});

Deno.test("FP005-PATH-001 rejects symlinks and accepts a regular archive entry", () => {
  assertRejected(validateArchiveEntry({ path: "link", type: "SYMLINK" }), "typed symlink");
  assertRejected(validateArchiveEntry({ path: "link", isSymlink: true }), "flagged symlink");
  const valid = validateArchiveEntry({ path: "dir/file.txt", kind: "FILE", expandedByteLength: 12 });
  assert(valid.ok);
  assert(valid.value.kind === "FILE");
  assert(validateArchiveEntries([{ path: "dir/file.txt", kind: "FILE" }]).ok);
});

Deno.test("FP005-PATH-001 rejects provider, bucket, objectKey, and authority mismatches", () => {
  assert(validateRegistryStorageLocator({
    provider: "opfs",
    bucket: null,
    objectKey: "local/file.bin",
  }).ok);
  assert(validateRegistryStorageLocator({
    provider: "object-storage",
    bucket: "assets",
    objectKey: "server/file.bin",
  }).ok);

  assertRejected(validateRegistryStorageLocator({
    provider: "opfs",
    bucket: "assets",
    objectKey: "local/file.bin",
  }), "OPFS bucket authority mismatch");
  assertRejected(validateRegistryStorageLocator({
    provider: "object-storage",
    bucket: null,
    objectKey: "server/file.bin",
  }), "Object Storage bucket authority mismatch");
  assertRejected(validateRegistryStorageLocator({
    provider: "unexpected",
    bucket: null,
    objectKey: "local/file.bin",
  }), "provider mismatch");
  assertRejected(validateRegistryStorageLocator({
    provider: "object-storage",
    bucket: "assets",
    objectKey: "/absolute/file.bin",
  }), "objectKey authority mismatch");
  assertRejected(validateNormalizedRelativePath({ path: "server/file.bin", authority: "REMOTE" }), "unknown path authority");
});

Deno.test("FP005-PATH-001 rejects cross-tenant metadata locators and accepts matching scope", () => {
  assert(validateStorageLocator(validMetadataLocator).ok);
  assert(validateStorageLocator(validMetadataLocator, {
    tenantId: "tenant-1",
    resourceType: "asset",
    resourceId: "asset-1",
  }).ok);
  assertRejected(validateStorageLocator(validMetadataLocator, {
    tenantId: "tenant-2",
    resourceType: "asset",
    resourceId: "asset-1",
  }), "cross-tenant locator");
  assertRejected(validateStorageLocator({ ...validMetadataLocator, tenantId: "tenant-2" }, {
    tenantId: "tenant-1",
    resourceType: "asset",
    resourceId: "asset-1",
  }), "cross-tenant locator payload");
});
