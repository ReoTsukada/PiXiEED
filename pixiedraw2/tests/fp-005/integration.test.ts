import {
  FP005_FACADE,
  validateFp005Boundary,
} from "../../src/fp-005/index.ts";
import { FP005_ERROR_CODES } from "../../src/fp-005/error-codes.ts";
import { FP005_SCHEMA_VERSION } from "../../src/fp-005/contracts.ts";

function assert(value: boolean, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message = "values differ"): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function assertFailure(result: ReturnType<typeof validateFp005Boundary>, ...codes: string[]): void {
  assert(!result.ok, "expected the FP-005 boundary to reject the request");
  const code = result.diagnostics[0]?.code;
  assert(code !== undefined && codes.includes(code), `unexpected diagnostic code: ${String(code)}`);
}

const HASH = "a".repeat(64);
const SECRET = "raw-secret-must-never-cross-the-boundary";
const TENANT_ID = "tenant-1";
const RESOURCE_TYPE = "project";
const RESOURCE_ID = "project-1";
const LOCATOR = {
  placement: "OPFS",
  path: "tenant-1/project-1/chunk.bin",
  contentHash: HASH,
  byteLength: 4,
  mimeType: "application/octet-stream",
  tenantId: TENANT_ID,
  resourceType: RESOURCE_TYPE,
  resourceId: RESOURCE_ID,
} as const;

function authorizationProof(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const issuedAt = new Date(Date.now() - 60_000).toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "authority-1",
    proofId: "proof-1",
    principalId: "principal-1",
    resourceType: RESOURCE_TYPE,
    resourceId: RESOURCE_ID,
    action: "storage.read",
    capability: "storage:read",
    tenantId: TENANT_ID,
    correlationId: "correlation-1",
    policyVersion: "authorization-policy-v1",
    grantId: "grant-1",
    issuedAt,
    expiresAt,
    ...overrides,
  };
}

function storageRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "STORAGE",
    schemaVersion: FP005_SCHEMA_VERSION,
    tenantId: TENANT_ID,
    resourceType: RESOURCE_TYPE,
    resourceId: RESOURCE_ID,
    storage: {
      schemaVersion: FP005_SCHEMA_VERSION,
      storageClass: "LARGE_BLOB",
      tenantId: TENANT_ID,
      resourceType: RESOURCE_TYPE,
      resourceId: RESOURCE_ID,
      locator: LOCATOR,
      contentHash: HASH,
      byteLength: 4,
      mimeType: "application/octet-stream",
      durable: true,
    },
    locator: LOCATOR,
    authorizationProof: authorizationProof(),
    authority: "LOCAL",
    principalId: "principal-1",
    action: "storage.read",
    capability: "storage:read",
    ...overrides,
  };
}

Deno.test("FP005 integration: public storage/materialization fails closed without a sealed server composition", () => {
  const result = validateFp005Boundary({
    ...storageRequest(),
    kind: "MATERIALIZE",
    json: { projectId: RESOURCE_ID, token: SECRET },
    content: { data: new Uint8Array([0x01, 0x02, 0x03, 0x04]), mimeType: "application/octet-stream", declaredByteLength: 4 },
    archive: [{ path: "assets/readme.txt", kind: "FILE", compressedByteLength: 4, expandedByteLength: 12 }],
    path: "assets/readme.txt",
    pathAuthority: "LOCAL",
  });

  assertFailure(result, FP005_ERROR_CODES.AUTHORIZATION_REQUIRED);
});

Deno.test("FP005 integration: unsafe locator paths are rejected before storage scope resolution", () => {
  for (const path of ["../secret", "/absolute/secret", "%2e%2e/secret", "tenant\\secret"]) {
    const result = validateFp005Boundary(storageRequest({
      locator: { ...LOCATOR, path },
      storage: { ...storageRequest().storage as Record<string, unknown>, locator: { ...LOCATOR, path } },
    }));
    assertFailure(result, FP005_ERROR_CODES.STORAGE_LOCATOR_INVALID, FP005_ERROR_CODES.PATH_INVALID);
  }
});

Deno.test("FP005 integration: cross-tenant storage is denied without an existence-leaking success", () => {
  const foreignLocator = { ...LOCATOR, tenantId: "tenant-2" };
  const result = validateFp005Boundary(storageRequest({
    locator: foreignLocator,
    storage: { ...storageRequest().storage as Record<string, unknown>, locator: foreignLocator },
  }));

  assertFailure(result, FP005_ERROR_CODES.TENANT_SCOPE_DENIED);
  assertEquals(JSON.stringify(result).includes("tenant-2"), false, "foreign tenant identity must not be disclosed in diagnostics");
});

Deno.test("FP005 integration: active content and active or nested archive entries are rejected", () => {
  const activeContent = validateFp005Boundary({
    kind: "INPUT",
    schemaVersion: FP005_SCHEMA_VERSION,
    content: { data: new TextEncoder().encode("<script>alert(1)</script>"), mimeType: "text/html" },
  });
  assertFailure(activeContent, FP005_ERROR_CODES.ACTIVE_CONTENT_REJECTED);

  const activeArchive = validateFp005Boundary({
    kind: "INPUT",
    schemaVersion: FP005_SCHEMA_VERSION,
    archive: [{ path: "scripts/app.js", kind: "FILE" }],
  });
  assertFailure(activeArchive, FP005_ERROR_CODES.ARCHIVE_INVALID);

  const nestedArchive = validateFp005Boundary({
    kind: "INPUT",
    schemaVersion: FP005_SCHEMA_VERSION,
    archive: [{ path: "bundles/inner.zip", kind: "FILE" }],
  });
  assertFailure(nestedArchive, FP005_ERROR_CODES.ARCHIVE_INVALID);
});

Deno.test("FP005 integration: telemetry rejects unknown/PII fields and identifiers", () => {
  const sanitized = validateFp005Boundary({
    kind: "TELEMETRY",
    schemaVersion: FP005_SCHEMA_VERSION,
    telemetry: {
      schemaVersion: FP005_SCHEMA_VERSION,
      eventName: "draw.completed",
      operationId: "opaque-operation-1",
      result: "ERROR",
      errorCode: FP005_ERROR_CODES.INPUT_INVALID,
      email: "person@example.com",
      privateBody: SECRET,
      authorization: "Bearer eyJhbGciOiJub25lIn0.secret.signature",
    },
  });
  assertFailure(sanitized, FP005_ERROR_CODES.TELEMETRY_INVALID);

  const piiIdentifier = validateFp005Boundary({
    kind: "TELEMETRY",
    schemaVersion: FP005_SCHEMA_VERSION,
    telemetry: { schemaVersion: FP005_SCHEMA_VERSION, eventName: "draw.completed", operationId: "person@example.com", result: "OK" },
  });
  assertFailure(piiIdentifier, FP005_ERROR_CODES.TELEMETRY_INVALID);
});

Deno.test("FP005 integration: public retention requires a sealed server composition", () => {
  for (const category of ["AUTHORITY", "PURCHASED"] as const) {
    const result = validateFp005Boundary({
      kind: "RETENTION",
      schemaVersion: FP005_SCHEMA_VERSION,
      tenantId: TENANT_ID,
      resourceId: RESOURCE_ID,
      category,
    });
    assertFailure(result, FP005_ERROR_CODES.RETENTION_PROTECTED);
  }

  const callerDelete = validateFp005Boundary({
    kind: "RETENTION",
    schemaVersion: FP005_SCHEMA_VERSION,
    tenantId: TENANT_ID,
    resourceId: RESOURCE_ID,
    category: "DELETE",
  });
  assertFailure(callerDelete, FP005_ERROR_CODES.INPUT_INVALID, FP005_ERROR_CODES.TENANT_SCOPE_DENIED);
});

Deno.test("FP005 integration: unknown schema versions are rejected at the facade", () => {
  const result = validateFp005Boundary({
    kind: "INPUT",
    schemaVersion: "FP005_V0",
    json: { safe: true },
  });
  assertFailure(result, FP005_ERROR_CODES.SCHEMA_UNSUPPORTED);
});

Deno.test("FP005 integration: malformed input and caller-supplied trust fields fail closed", () => {
  assertFailure(validateFp005Boundary(null), FP005_ERROR_CODES.INPUT_INVALID);
  assertFailure(validateFp005Boundary("not-an-envelope"), FP005_ERROR_CODES.INPUT_INVALID);
  assertFailure(validateFp005Boundary({
    kind: "INPUT",
    schemaVersion: FP005_SCHEMA_VERSION,
    json: "{malformed",
  }), FP005_ERROR_CODES.INPUT_INVALID);

  const forged = validateFp005Boundary({
    kind: "INPUT",
    schemaVersion: FP005_SCHEMA_VERSION,
    json: { safe: true },
    ok: true,
    allow: true,
    trusted: true,
    diagnostic: { code: "FORGED", secret: SECRET },
  });
  assertFailure(forged, FP005_ERROR_CODES.INPUT_INVALID);

  const malformedProof = validateFp005Boundary(storageRequest({ authorizationProof: { allow: true, trusted: true } }));
  assertFailure(malformedProof, FP005_ERROR_CODES.AUTHORIZATION_REQUIRED, FP005_ERROR_CODES.TENANT_SCOPE_DENIED);
});

Deno.test("FP005 integration: serialized results and diagnostics contain no raw secret", () => {
  const telemetry = validateFp005Boundary({
    kind: "TELEMETRY",
    schemaVersion: FP005_SCHEMA_VERSION,
    telemetry: { schemaVersion: FP005_SCHEMA_VERSION, eventName: "save.completed", result: "OK", note: SECRET },
  });
  const forgedDiagnostic = validateFp005Boundary({
    kind: "INPUT",
    schemaVersion: FP005_SCHEMA_VERSION,
    json: { safe: true },
    secret: SECRET,
  });
  const serialized = JSON.stringify({ telemetry, forgedDiagnostic });

  assertEquals(telemetry.ok, false);
  assertEquals(serialized.includes(SECRET), false);
  assertEquals(serialized.includes("secret"), false);
  assertEquals(serialized.includes("note"), false);
});
