import {
  canonicalSchemaJson,
  type CanonicalSchemaRecord,
  computeSchemaDigest,
  createCanonicalSchemaRecord,
  schemaIdentity,
  SchemaRegistry,
  serializeSchemaRecord,
} from "../../src/fp-007/schema-registry.ts";
import { checkSchemaCompatibility } from "../../src/fp-007/schema-compatibility.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function hasCode(
  result: { readonly diagnostics: readonly { readonly code: string }[] },
  code: string,
): boolean {
  return result.diagnostics.some((item) => item.code === code);
}

async function fixture(name: string): Promise<Record<string, unknown>> {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(await Deno.readTextFile(url)) as Record<string, unknown>;
}

async function signedRecord(
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return { ...input, digest: await computeSchemaDigest(input) };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function buildRegistry(): Promise<
  {
    readonly registry: SchemaRegistry;
    readonly records: Readonly<Record<string, CanonicalSchemaRecord>>;
  }
> {
  const names = [
    "schema-canonical-v1.json",
    "schema-canonical-v2-compatible.json",
    "schema-canonical-v2-breaking.json",
    "schema-canonical-v2-adapted.json",
    "schema-legacy-pxd-v2.json",
    "schema-attack-rename.json",
  ];
  const loaded = await Promise.all(names.map(fixture));
  const registryResult = await SchemaRegistry.create(loaded, {
    registeredMigrationOrAdapterIds: [
      "adapter.core.project.v2",
      "adapter.legacy.pxd.v2",
    ],
  });
  assert(
    registryResult.ok,
    `fixture registry must be valid: ${
      registryResult.diagnostics.map((item) => item.message).join("; ")
    }`,
  );
  const records: Record<string, CanonicalSchemaRecord> = {};
  for (const record of registryResult.value.list()) {
    records[record.exactVersion] = record;
  }
  return { registry: registryResult.value, records };
}

Deno.test("FP-007 schema records normalize deterministically and use name/version/digest identity", async () => {
  const input = await fixture("schema-canonical-v1.json");
  const normalized = await createCanonicalSchemaRecord(input);
  assert(normalized.ok, "valid canonical schema fixture must be accepted");
  assert(
    normalized.value.status === "ACTIVE",
    "status must normalize to the canonical enum",
  );
  assert(
    normalized.value.compatibilityMode === "full",
    "compatibility mode must normalize to lowercase",
  );
  assert(
    normalized.value.fixtureSet[0] === "project.empty.v1",
    "fixture set must be sorted deterministically",
  );
  assert(
    normalized.value.identity === schemaIdentity(normalized.value),
    "identity must be derived from name/version/digest",
  );
  assert(
    Object.isFrozen(normalized.value) &&
      Object.isFrozen(normalized.value.fields),
    "canonical records must not be caller-mutable",
  );
  assert(
    await computeSchemaDigest(input) === normalized.value.digest,
    "digest must cover canonical schema material",
  );
  const serialized = serializeSchemaRecord(normalized.value);
  assert(
    serialized === serializeSchemaRecord(clone(normalized.value)),
    "canonical serialization must ignore object insertion order",
  );
  assert(
    !serialized.includes("generatedAt") && !serialized.includes("localhost") &&
      !serialized.includes("/Users/"),
    "schema serialization must not contain host/time/path inputs",
  );
  assert(
    canonicalSchemaJson({ b: 1, a: [2, 3] }) === '{"a":[2,3],"b":1}',
    "canonical JSON must sort object keys without locale state",
  );
});

Deno.test("FP-007 registry rejects digest tampering, floating versions, unknown identities, and unregistered adapters", async () => {
  const invalidDigest = await fixture("schema-invalid-digest.json");
  const invalid = await createCanonicalSchemaRecord(invalidDigest);
  assert(
    !invalid.ok && hasCode(invalid, "DIGEST_MISMATCH"),
    "digest mismatch must fail closed before registration",
  );

  const legacy = await fixture("schema-legacy-pxd-v2.json");
  const missingAdapter = await SchemaRegistry.create([legacy]);
  assert(
    !missingAdapter.ok &&
      hasCode(missingAdapter, "MIGRATION_OR_ADAPTER_NOT_REGISTERED"),
    "legacy adapter must be registered explicitly",
  );

  const canonical = await fixture("schema-canonical-v1.json");
  const floating = { ...canonical, exactVersion: "latest" };
  const floatingResult = await createCanonicalSchemaRecord(floating);
  assert(
    !floatingResult.ok && hasCode(floatingResult, "INVALID_EXACT_VERSION"),
    "mutable version aliases must fail closed",
  );

  const { registry } = await buildRegistry();
  const unknownName = registry.resolve({
    name: "core.unknown",
    exactVersion: "1.0.0",
    digest: canonical.digest,
  });
  assert(
    !unknownName.ok && hasCode(unknownName, "UNKNOWN_SCHEMA_NAME"),
    "unknown schema name must fail closed",
  );
  const knownDigest = registry.list().find((record) =>
    record.exactVersion === "1.0.0"
  )?.digest;
  assert(knownDigest !== undefined, "known digest fixture must be registered");
  const unknownVersion = registry.resolve({
    name: "core.project",
    exactVersion: "9.0.0",
    digest: knownDigest,
  });
  assert(
    !unknownVersion.ok && hasCode(unknownVersion, "UNKNOWN_SCHEMA_VERSION"),
    "unknown exact version must fail closed",
  );
  const unknownDigest = registry.resolve({
    name: "core.project",
    exactVersion: "1.0.0",
    digest: "e".repeat(64),
  });
  assert(
    !unknownDigest.ok && hasCode(unknownDigest, "UNKNOWN_SCHEMA_DIGEST"),
    "unknown digest must fail closed",
  );
});

Deno.test("FP-007 caller schema bodies never become authority; canonical registry records are re-resolved", async () => {
  const { registry, records } = await buildRegistry();
  const canonical = records["1.0.0"];
  assert(canonical !== undefined, "canonical v1 fixture must exist");
  const forgedCaller = {
    ...clone(canonical),
    owner: "attacker",
    status: "ACTIVE",
    fields: {
      ...canonical.fields,
      evil: {
        type: "string",
        required: true,
        nullable: false,
        hasDefault: false,
      },
    },
  };
  const resolved = registry.resolveCallerSchema(forgedCaller, canonical);
  assert(resolved.ok, "registered caller identity should resolve");
  assert(
    resolved.value.owner === "core" &&
      !Object.hasOwn(resolved.value.fields, "evil"),
    "caller-provided body must never be used as authority",
  );
  assert(
    resolved.value.identity === canonical.identity &&
      resolved.value !== forgedCaller,
    "resolution must return the canonical registered record",
  );

  const mismatched = registry.resolveCallerSchema(
    forgedCaller,
    records["2.0.0"],
  );
  assert(
    !mismatched.ok && hasCode(mismatched, "CALLER_SCHEMA_SCOPE_MISMATCH"),
    "caller identity must be bound to the expected record",
  );
  const missingIdentity = registry.resolveCallerSchema({
    fields: canonical.fields,
  });
  assert(
    !missingIdentity.ok &&
      hasCode(missingIdentity, "CALLER_SCHEMA_IDENTITY_REQUIRED"),
    "caller body without identity must fail closed",
  );
  const throwingCaller = new Proxy({}, {
    get() {
      throw new Error("caller-controlled getter");
    },
  });
  const unreadable = registry.resolveCallerSchema(throwingCaller);
  assert(
    !unreadable.ok && hasCode(unreadable, "CALLER_SCHEMA_IDENTITY_REQUIRED"),
    "unreadable caller objects must fail closed",
  );
});

Deno.test("FP-007 compatibility modes explicitly handle optional changes, required changes, type changes, and renames", async () => {
  const { registry, records } = await buildRegistry();
  const compatible = checkSchemaCompatibility(
    registry,
    records["1.0.0"],
    records["2.0.0"],
  );
  assert(
    compatible.ok && compatible.value.mode === "backward" &&
      !compatible.value.adapted,
    "optional field addition must pass declared backward compatibility",
  );
  assert(
    compatible.value.changes.some((change) =>
      change.kind === "FIELD_ADDED" && change.field === "description"
    ),
    "optional field addition must be recorded",
  );

  const breaking = checkSchemaCompatibility(
    registry,
    records["1.0.0"],
    records["2.1.0"],
  );
  assert(
    !breaking.ok && hasCode(breaking, "COMPATIBILITY_VIOLATION") &&
      hasCode(breaking, "MIGRATION_OR_ADAPTER_REQUIRED"),
    "type change without adapter must fail closed",
  );

  const adapted = checkSchemaCompatibility(
    registry,
    records["1.0.0"],
    records["2.2.0"],
  );
  assert(
    adapted.ok && adapted.value.adapted &&
      adapted.value.legacyConversion === false,
    "registered adapter may explicitly bridge an incompatible change",
  );

  const rename = checkSchemaCompatibility(
    registry,
    records["1.0.0"],
    records["2.3.0"],
  );
  assert(
    !rename.ok && hasCode(rename, "MIGRATION_OR_ADAPTER_REQUIRED"),
    "field rename must not be inferred",
  );
});

Deno.test("FP-007 required additions/removals and legacy formats remain fail-closed and explicit", async () => {
  const base = await fixture("schema-canonical-v1.json");
  const { digest: _baseDigest, ...baseDraft } = base;
  const requiredAdditionDraft = {
    ...baseDraft,
    exactVersion: "2.4.0",
    compatibilityMode: "forward",
    fixtureSet: ["project.required-add.v2"],
    fields: {
      ...(baseDraft.fields as Record<string, unknown>),
      requiredNew: {
        type: "string",
        required: true,
        nullable: false,
        hasDefault: false,
      },
    },
  };
  const requiredRemovalDraft = {
    ...baseDraft,
    exactVersion: "2.5.0",
    compatibilityMode: "backward",
    fixtureSet: ["project.required-remove.v2"],
    fields: {
      id: (baseDraft.fields as Record<string, unknown>).id,
      title: (baseDraft.fields as Record<string, unknown>).title,
    },
  };
  const optionalRemovalDraft = {
    ...baseDraft,
    exactVersion: "2.6.0",
    compatibilityMode: "forward",
    fixtureSet: ["project.optional-remove.v2"],
    fields: {
      id: (baseDraft.fields as Record<string, unknown>).id,
      count: (baseDraft.fields as Record<string, unknown>).count,
    },
  };
  const generated = await Promise.all(
    [requiredAdditionDraft, requiredRemovalDraft, optionalRemovalDraft].map(
      signedRecord,
    ),
  );
  const registryResult = await SchemaRegistry.create([base, ...generated], {
    registeredMigrationOrAdapterIds: [],
  });
  assert(registryResult.ok, "generated compatibility fixtures must register");
  const requiredAdd = checkSchemaCompatibility(
    registryResult.value,
    base,
    generated[0],
  );
  assert(
    !requiredAdd.ok && hasCode(requiredAdd, "MIGRATION_OR_ADAPTER_REQUIRED"),
    "required field addition must require an adapter under forward mode",
  );
  const requiredRemove = checkSchemaCompatibility(
    registryResult.value,
    base,
    generated[1],
  );
  assert(
    !requiredRemove.ok &&
      hasCode(requiredRemove, "MIGRATION_OR_ADAPTER_REQUIRED"),
    "required field removal must require an adapter under backward mode",
  );
  const optionalRemove = checkSchemaCompatibility(
    registryResult.value,
    base,
    generated[2],
  );
  assert(
    optionalRemove.ok &&
      optionalRemove.value.changes.some((change) =>
        change.kind === "FIELD_REMOVED"
      ),
    "optional field removal is forward compatible and must remain explicit",
  );

  const legacy = await fixture("schema-legacy-pxd-v2.json");
  const canonical = await fixture("schema-canonical-v1.json");
  const legacyBoundary = checkSchemaCompatibility(
    registryResult.value,
    legacy,
    canonical,
  );
  assert(
    !legacyBoundary.ok && hasCode(legacyBoundary, "UNKNOWN_SCHEMA_NAME"),
    "legacy/canonical comparison must first require both records to be registered",
  );
  const fullRegistry = await buildRegistry();
  const explicitBoundary = checkSchemaCompatibility(
    fullRegistry.registry,
    legacy,
    canonical,
  );
  assert(
    !explicitBoundary.ok &&
      hasCode(explicitBoundary, "LEGACY_ADAPTER_REQUIRED"),
    "legacy conversion must remain an explicit adapter operation, never implicit compatibility",
  );
});
