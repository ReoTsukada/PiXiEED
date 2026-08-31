/**
 * FP-007 Schema Registry.
 *
 * This module is an isolated, deterministic reference contract. It does not
 * read files, consult a network registry, inspect the host, or trust a
 * caller-provided schema body as authority. A caller supplies only an
 * identity; the registered canonical record is re-resolved before use.
 */

export const FP007_SCHEMA_CONTRACT_VERSION = 1 as const;
export const FP007_SCHEMA_DIGEST_ALGORITHM = "SHA-256" as const;

export type SchemaCompatibilityMode = "backward" | "forward" | "full";
export type SchemaStatus = "ACTIVE" | "DEPRECATED" | "RETIRED";
export type SchemaFamily = "CANONICAL" | "LEGACY";
export type SchemaValueType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "null";

export interface SchemaFieldDefinition {
  readonly type: SchemaValueType;
  readonly required: boolean;
  readonly nullable: boolean;
  readonly hasDefault: boolean;
}

export interface SchemaRecordDraft {
  readonly name: string;
  readonly exactVersion: string;
  readonly owner: string;
  readonly status: SchemaStatus;
  readonly compatibilityMode: SchemaCompatibilityMode;
  readonly migrationOrAdapterId: string | null;
  readonly fixtureSet: readonly string[];
  readonly fields: Readonly<Record<string, SchemaFieldDefinition>>;
  readonly schemaFamily: SchemaFamily;
  readonly legacyOf: string | null;
}

export interface SchemaRecordInput {
  readonly name: string;
  readonly exactVersion: string;
  readonly digest: string;
  readonly owner: string;
  readonly status: string;
  readonly compatibilityMode: string;
  readonly migrationOrAdapterId?: string | null;
  readonly fixtureSet: readonly string[];
  readonly fields: Readonly<Record<string, SchemaFieldDefinition>>;
  readonly schemaFamily?: string;
  readonly legacyOf?: string | null;
}

export interface CanonicalSchemaRecord extends SchemaRecordDraft {
  readonly digest: string;
  readonly identity: string;
}

export interface SchemaIdentityInput {
  readonly name: string;
  readonly exactVersion: string;
  readonly digest: string;
}

export type SchemaDiagnosticCode =
  | "INPUT_NOT_OBJECT"
  | "UNKNOWN_FIELD"
  | "INVALID_NAME"
  | "INVALID_EXACT_VERSION"
  | "INVALID_DIGEST"
  | "INVALID_OWNER"
  | "INVALID_STATUS"
  | "INVALID_COMPATIBILITY_MODE"
  | "INVALID_MIGRATION_OR_ADAPTER"
  | "INVALID_FIXTURE_SET"
  | "INVALID_SCHEMA_FAMILY"
  | "INVALID_LEGACY_REFERENCE"
  | "INVALID_FIELDS"
  | "INVALID_FIELD_NAME"
  | "INVALID_FIELD_DEFINITION"
  | "LEGACY_ADAPTER_REQUIRED"
  | "DIGEST_MISMATCH"
  | "DUPLICATE_SCHEMA_IDENTITY"
  | "INVALID_SCHEMA_IDENTITY"
  | "CALLER_SCHEMA_IDENTITY_REQUIRED"
  | "CALLER_SCHEMA_SCOPE_MISMATCH"
  | "UNKNOWN_SCHEMA_NAME"
  | "UNKNOWN_SCHEMA_VERSION"
  | "UNKNOWN_SCHEMA_DIGEST"
  | "MIGRATION_OR_ADAPTER_NOT_REGISTERED";

export interface SchemaDiagnostic {
  readonly code: SchemaDiagnosticCode;
  readonly message: string;
  readonly path?: string;
}

export type SchemaResult<T> =
  | {
    readonly ok: true;
    readonly value: T;
    readonly diagnostics: readonly SchemaDiagnostic[];
  }
  | { readonly ok: false; readonly diagnostics: readonly SchemaDiagnostic[] };

const SCHEMA_NAME = /^[a-z][a-z0-9._:/-]{0,127}$/u;
const EXACT_VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const ADAPTER_ID = /^[a-z][a-z0-9._:-]{0,127}$/u;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

const DRAFT_KEYS = new Set([
  "name",
  "exactVersion",
  "owner",
  "status",
  "compatibilityMode",
  "migrationOrAdapterId",
  "fixtureSet",
  "fields",
  "schemaFamily",
  "legacyOf",
]);

const RECORD_KEYS = new Set([...DRAFT_KEYS, "digest"]);
const FIELD_KEYS = new Set(["type", "required", "nullable", "hasDefault"]);
const VALUE_TYPES: readonly SchemaValueType[] = [
  "string",
  "integer",
  "number",
  "boolean",
  "object",
  "array",
  "null",
];
const COMPATIBILITY_MODES: readonly SchemaCompatibilityMode[] = [
  "backward",
  "forward",
  "full",
];
const STATUSES: readonly SchemaStatus[] = ["ACTIVE", "DEPRECATED", "RETIRED"];
const FAMILIES: readonly SchemaFamily[] = ["CANONICAL", "LEGACY"];

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function success<T>(
  value: T,
  diagnostics: readonly SchemaDiagnostic[] = [],
): SchemaResult<T> {
  return { ok: true, value, diagnostics };
}

function failure<T>(diagnostics: readonly SchemaDiagnostic[]): SchemaResult<T> {
  return { ok: false, diagnostics };
}

function diagnostic(
  code: SchemaDiagnosticCode,
  message: string,
  path?: string,
): SchemaDiagnostic {
  return { code, message, ...(path === undefined ? {} : { path }) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function onlyKnownKeys(
  value: Record<string, unknown>,
  known: ReadonlySet<string>,
  diagnostics: SchemaDiagnostic[],
  path: string,
): void {
  for (const key of Object.keys(value).sort()) {
    if (!known.has(key)) {
      diagnostics.push(
        diagnostic(
          "UNKNOWN_FIELD",
          `Unknown schema field '${key}' is not accepted.`,
          `${path}.${key}`,
        ),
      );
    }
  }
}

function normalizeText(
  value: unknown,
  code: SchemaDiagnosticCode,
  path: string,
  diagnostics: SchemaDiagnostic[],
): string | null {
  if (typeof value !== "string") {
    diagnostics.push(diagnostic(code, "Value must be a string.", path));
    return null;
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    diagnostics.push(diagnostic(code, "Value must not be empty.", path));
    return null;
  }
  return normalized;
}

function normalizeName(
  value: unknown,
  path: string,
  diagnostics: SchemaDiagnostic[],
): string | null {
  const normalized =
    normalizeText(value, "INVALID_NAME", path, diagnostics)?.toLowerCase() ??
      null;
  if (normalized !== null && !SCHEMA_NAME.test(normalized)) {
    diagnostics.push(
      diagnostic(
        "INVALID_NAME",
        "Schema name must be a bounded stable name, not a path or host-specific value.",
        path,
      ),
    );
    return null;
  }
  return normalized;
}

function normalizeExactVersion(
  value: unknown,
  path: string,
  diagnostics: SchemaDiagnostic[],
): string | null {
  const normalized = normalizeText(
    value,
    "INVALID_EXACT_VERSION",
    path,
    diagnostics,
  );
  if (normalized === null) return null;
  if (
    !EXACT_VERSION.test(normalized) ||
    /^(latest|stable|current|next)$/iu.test(normalized)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_EXACT_VERSION",
        "Schema version must be exact; ranges, latest, and mutable aliases are forbidden.",
        path,
      ),
    );
    return null;
  }
  return normalized;
}

function normalizeDigest(
  value: unknown,
  path: string,
  diagnostics: SchemaDiagnostic[],
): string | null {
  if (typeof value !== "string" || !SHA256.test(value)) {
    diagnostics.push(
      diagnostic(
        "INVALID_DIGEST",
        "Digest must be a lowercase 64-character SHA-256 value.",
        path,
      ),
    );
    return null;
  }
  return value;
}

function normalizeOwner(
  value: unknown,
  path: string,
  diagnostics: SchemaDiagnostic[],
): string | null {
  const normalized = normalizeText(value, "INVALID_OWNER", path, diagnostics);
  if (normalized !== null && !STABLE_ID.test(normalized)) {
    diagnostics.push(
      diagnostic(
        "INVALID_OWNER",
        "Owner must be a bounded stable identifier.",
        path,
      ),
    );
    return null;
  }
  return normalized;
}

function normalizeStatus(
  value: unknown,
  path: string,
  diagnostics: SchemaDiagnostic[],
): SchemaStatus | null {
  const normalized =
    normalizeText(value, "INVALID_STATUS", path, diagnostics)?.toUpperCase() ??
      null;
  if (
    normalized === null || !(STATUSES as readonly string[]).includes(normalized)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_STATUS",
        "Status must be ACTIVE, DEPRECATED, or RETIRED.",
        path,
      ),
    );
    return null;
  }
  return normalized as SchemaStatus;
}

function normalizeCompatibilityMode(
  value: unknown,
  path: string,
  diagnostics: SchemaDiagnostic[],
): SchemaCompatibilityMode | null {
  const normalized =
    normalizeText(value, "INVALID_COMPATIBILITY_MODE", path, diagnostics)
      ?.toLowerCase() ?? null;
  if (
    normalized === null ||
    !(COMPATIBILITY_MODES as readonly string[]).includes(normalized)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_COMPATIBILITY_MODE",
        "Compatibility mode must be backward, forward, or full.",
        path,
      ),
    );
    return null;
  }
  return normalized as SchemaCompatibilityMode;
}

function normalizeAdapterId(
  value: unknown,
  path: string,
  diagnostics: SchemaDiagnostic[],
): string | null {
  if (value === undefined || value === null) return null;
  const normalized =
    normalizeText(value, "INVALID_MIGRATION_OR_ADAPTER", path, diagnostics)
      ?.toLowerCase() ?? null;
  if (normalized !== null && !ADAPTER_ID.test(normalized)) {
    diagnostics.push(
      diagnostic(
        "INVALID_MIGRATION_OR_ADAPTER",
        "Migration or adapter ID must be a bounded stable identifier.",
        path,
      ),
    );
    return null;
  }
  return normalized;
}

function normalizeSchemaFamily(
  value: unknown,
  path: string,
  diagnostics: SchemaDiagnostic[],
): SchemaFamily | null {
  if (value === undefined) return "CANONICAL";
  const normalized =
    normalizeText(value, "INVALID_SCHEMA_FAMILY", path, diagnostics)
      ?.toUpperCase() ?? null;
  if (
    normalized === null || !(FAMILIES as readonly string[]).includes(normalized)
  ) {
    diagnostics.push(
      diagnostic(
        "INVALID_SCHEMA_FAMILY",
        "Schema family must be CANONICAL or LEGACY.",
        path,
      ),
    );
    return null;
  }
  return normalized as SchemaFamily;
}

function normalizeLegacyOf(
  value: unknown,
  path: string,
  diagnostics: SchemaDiagnostic[],
): string | null {
  if (value === undefined || value === null) return null;
  const normalized = normalizeName(value, path, diagnostics);
  return normalized;
}

function normalizeFixtureSet(
  value: unknown,
  path: string,
  diagnostics: SchemaDiagnostic[],
): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push(
      diagnostic(
        "INVALID_FIXTURE_SET",
        "Fixture set must contain at least one stable fixture ID.",
        path,
      ),
    );
    return null;
  }
  const result: string[] = [];
  for (const [index, fixture] of value.entries()) {
    const normalized = normalizeText(
      fixture,
      "INVALID_FIXTURE_SET",
      `${path}[${index}]`,
      diagnostics,
    );
    if (normalized !== null && !STABLE_ID.test(normalized)) {
      diagnostics.push(
        diagnostic(
          "INVALID_FIXTURE_SET",
          "Fixture IDs must be bounded stable identifiers, not absolute paths.",
          `${path}[${index}]`,
        ),
      );
    } else if (normalized !== null) {
      result.push(normalized);
    }
  }
  const unique = [...new Set(result)].sort(compareStable);
  if (unique.length !== result.length) {
    diagnostics.push(
      diagnostic("INVALID_FIXTURE_SET", "Fixture IDs must be unique.", path),
    );
  }
  return unique;
}

function normalizeFieldDefinition(
  value: unknown,
  path: string,
  diagnostics: SchemaDiagnostic[],
): SchemaFieldDefinition | null {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(
        "INVALID_FIELD_DEFINITION",
        "Field definition must be an object.",
        path,
      ),
    );
    return null;
  }
  onlyKnownKeys(value, FIELD_KEYS, diagnostics, path);
  const type = typeof value.type === "string"
    ? value.type.trim().toLowerCase()
    : null;
  if (type === null || !(VALUE_TYPES as readonly string[]).includes(type)) {
    diagnostics.push(
      diagnostic(
        "INVALID_FIELD_DEFINITION",
        "Field type is not supported.",
        `${path}.type`,
      ),
    );
  }
  if (typeof value.required !== "boolean") {
    diagnostics.push(
      diagnostic(
        "INVALID_FIELD_DEFINITION",
        "Field required must be boolean.",
        `${path}.required`,
      ),
    );
  }
  if (typeof value.nullable !== "boolean") {
    diagnostics.push(
      diagnostic(
        "INVALID_FIELD_DEFINITION",
        "Field nullable must be boolean.",
        `${path}.nullable`,
      ),
    );
  }
  if (value.hasDefault !== undefined && typeof value.hasDefault !== "boolean") {
    diagnostics.push(
      diagnostic(
        "INVALID_FIELD_DEFINITION",
        "Field hasDefault must be boolean when supplied.",
        `${path}.hasDefault`,
      ),
    );
  }
  if (
    type === null || !(VALUE_TYPES as readonly string[]).includes(type) ||
    typeof value.required !== "boolean" ||
    typeof value.nullable !== "boolean" ||
    (value.hasDefault !== undefined && typeof value.hasDefault !== "boolean")
  ) return null;
  return {
    type: type as SchemaValueType,
    required: value.required,
    nullable: value.nullable,
    hasDefault: value.hasDefault ?? false,
  };
}

function normalizeFields(
  value: unknown,
  path: string,
  diagnostics: SchemaDiagnostic[],
): Readonly<Record<string, SchemaFieldDefinition>> | null {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic(
        "INVALID_FIELDS",
        "Schema fields must be an object keyed by field name.",
        path,
      ),
    );
    return null;
  }
  const normalized: Record<string, SchemaFieldDefinition> = {};
  for (const key of Object.keys(value).sort()) {
    if (!FIELD_NAME.test(key)) {
      diagnostics.push(
        diagnostic(
          "INVALID_FIELD_NAME",
          "Field name must be a bounded stable identifier.",
          `${path}.${key}`,
        ),
      );
      continue;
    }
    const field = normalizeFieldDefinition(
      value[key],
      `${path}.${key}`,
      diagnostics,
    );
    if (field !== null) normalized[key] = field;
  }
  return normalized;
}

function normalizeDraft(input: unknown): SchemaResult<SchemaRecordDraft> {
  const diagnostics: SchemaDiagnostic[] = [];
  if (!isRecord(input)) {
    return failure([
      diagnostic("INPUT_NOT_OBJECT", "Schema record must be an object."),
    ]);
  }
  onlyKnownKeys(input, DRAFT_KEYS, diagnostics, "schema");
  const name = normalizeName(input.name, "schema.name", diagnostics);
  const exactVersion = normalizeExactVersion(
    input.exactVersion,
    "schema.exactVersion",
    diagnostics,
  );
  const owner = normalizeOwner(input.owner, "schema.owner", diagnostics);
  const status = normalizeStatus(input.status, "schema.status", diagnostics);
  const compatibilityMode = normalizeCompatibilityMode(
    input.compatibilityMode,
    "schema.compatibilityMode",
    diagnostics,
  );
  const migrationOrAdapterId = normalizeAdapterId(
    input.migrationOrAdapterId,
    "schema.migrationOrAdapterId",
    diagnostics,
  );
  const fixtureSet = normalizeFixtureSet(
    input.fixtureSet,
    "schema.fixtureSet",
    diagnostics,
  );
  const fields = normalizeFields(input.fields, "schema.fields", diagnostics);
  const schemaFamily = normalizeSchemaFamily(
    input.schemaFamily,
    "schema.schemaFamily",
    diagnostics,
  );
  const legacyOf = normalizeLegacyOf(
    input.legacyOf,
    "schema.legacyOf",
    diagnostics,
  );

  if (
    schemaFamily === "LEGACY" &&
    (legacyOf === null || migrationOrAdapterId === null)
  ) {
    diagnostics.push(
      diagnostic(
        "LEGACY_ADAPTER_REQUIRED",
        "Legacy schemas require legacyOf and an explicit registered migration or adapter ID.",
        "schema",
      ),
    );
  }
  if (schemaFamily === "CANONICAL" && legacyOf !== null) {
    diagnostics.push(
      diagnostic(
        "INVALID_LEGACY_REFERENCE",
        "Canonical schemas cannot carry a legacyOf reference.",
        "schema.legacyOf",
      ),
    );
  }
  if (
    diagnostics.length > 0 || name === null || exactVersion === null ||
    owner === null || status === null || compatibilityMode === null ||
    fixtureSet === null || fields === null || schemaFamily === null ||
    legacyOf === null && input.legacyOf !== undefined && input.legacyOf !== null
  ) return failure(diagnostics);
  return success({
    name,
    exactVersion,
    owner,
    status,
    compatibilityMode,
    migrationOrAdapterId,
    fixtureSet,
    fields,
    schemaFamily,
    legacyOf,
  });
}

function normalizeRecord(
  input: unknown,
): SchemaResult<
  { readonly draft: SchemaRecordDraft; readonly digest: string }
> {
  const diagnostics: SchemaDiagnostic[] = [];
  if (!isRecord(input)) {
    return failure([
      diagnostic("INPUT_NOT_OBJECT", "Schema record must be an object."),
    ]);
  }
  onlyKnownKeys(input, RECORD_KEYS, diagnostics, "schema");
  const draftInput = Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== "digest"),
  );
  const draft = normalizeDraft(draftInput);
  if (!draft.ok) diagnostics.push(...draft.diagnostics);
  const digest = normalizeDigest(input.digest, "schema.digest", diagnostics);
  if (!draft.ok || digest === null || diagnostics.length > 0) {
    return failure(diagnostics);
  }
  return success({ draft: draft.value, digest });
}

function canonicalJsonValue(value: unknown): string {
  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        "Schema canonical JSON cannot encode a non-finite number.",
      );
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJsonValue).join(",")}]`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${
      keys.map((key) =>
        `${JSON.stringify(key)}:${canonicalJsonValue(value[key])}`
      ).join(",")
    }}`;
  }
  throw new TypeError("Schema canonical JSON accepts only JSON values.");
}

export function canonicalSchemaJson(value: unknown): string {
  return canonicalJsonValue(value);
}

export function schemaDigestMaterial(
  record: SchemaRecordDraft,
): SchemaRecordDraft {
  const fields: Record<string, SchemaFieldDefinition> = {};
  for (const key of Object.keys(record.fields).sort()) {
    const field = record.fields[key];
    if (field !== undefined) fields[key] = field;
  }
  return {
    name: record.name,
    exactVersion: record.exactVersion,
    owner: record.owner,
    status: record.status,
    compatibilityMode: record.compatibilityMode,
    migrationOrAdapterId: record.migrationOrAdapterId,
    fixtureSet: [...record.fixtureSet].sort(),
    fields,
    schemaFamily: record.schemaFamily,
    legacyOf: record.legacyOf,
  };
}

export async function computeSchemaDigest(input: unknown): Promise<string> {
  const digestFreeInput = isRecord(input)
    ? Object.fromEntries(
      Object.entries(input).filter(([key]) => key !== "digest"),
    )
    : input;
  const draft = normalizeDraft(digestFreeInput);
  if (!draft.ok) {
    throw new TypeError(
      draft.diagnostics.map((item) => item.message).join(" "),
    );
  }
  const bytes = new TextEncoder().encode(
    canonicalSchemaJson(schemaDigestMaterial(draft.value)),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function schemaIdentityFromParts(
  name: string,
  exactVersion: string,
  digest: string,
): string {
  return `${name}@${exactVersion}#${digest}`;
}

export function schemaIdentity(
  input: SchemaIdentityInput | CanonicalSchemaRecord,
): string {
  return schemaIdentityFromParts(input.name, input.exactVersion, input.digest);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function canonicalRecord(
  draft: SchemaRecordDraft,
  digest: string,
): CanonicalSchemaRecord {
  const fields: Record<string, SchemaFieldDefinition> = {};
  for (const key of Object.keys(draft.fields).sort()) {
    const field = draft.fields[key];
    if (field !== undefined) fields[key] = { ...field };
  }
  const value: CanonicalSchemaRecord = {
    ...draft,
    fixtureSet: [...draft.fixtureSet],
    fields,
    digest,
    identity: schemaIdentityFromParts(draft.name, draft.exactVersion, digest),
  };
  return deepFreeze(value);
}

export async function createCanonicalSchemaRecord(
  input: unknown,
): Promise<SchemaResult<CanonicalSchemaRecord>> {
  const normalized = normalizeRecord(input);
  if (!normalized.ok) return normalized;
  const expectedDigest = await computeSchemaDigest(normalized.value.draft);
  if (expectedDigest !== normalized.value.digest) {
    return failure([
      diagnostic(
        "DIGEST_MISMATCH",
        "Schema digest does not match the canonical schema material.",
        "schema.digest",
      ),
    ]);
  }
  return success(
    canonicalRecord(normalized.value.draft, normalized.value.digest),
  );
}

function normalizeIdentity(input: unknown): SchemaResult<SchemaIdentityInput> {
  const diagnostics: SchemaDiagnostic[] = [];
  if (!isRecord(input)) {
    return failure([
      diagnostic(
        "INVALID_SCHEMA_IDENTITY",
        "Schema identity must be an object.",
      ),
    ]);
  }
  const name = normalizeName(input.name, "identity.name", diagnostics);
  const exactVersion = normalizeExactVersion(
    input.exactVersion,
    "identity.exactVersion",
    diagnostics,
  );
  const digest = normalizeDigest(input.digest, "identity.digest", diagnostics);
  if (
    diagnostics.length > 0 || name === null || exactVersion === null ||
    digest === null
  ) return failure(diagnostics);
  return success({ name, exactVersion, digest });
}

export interface SchemaRegistryOptions {
  readonly registeredMigrationOrAdapterIds?: readonly string[];
}

export class SchemaRegistry {
  readonly #records: ReadonlyMap<string, CanonicalSchemaRecord>;
  readonly #names: ReadonlySet<string>;
  readonly #versionsByName: ReadonlyMap<string, ReadonlySet<string>>;
  readonly #registeredMigrationOrAdapterIds: ReadonlySet<string>;

  private constructor(
    records: ReadonlyMap<string, CanonicalSchemaRecord>,
    registeredMigrationOrAdapterIds: ReadonlySet<string>,
  ) {
    this.#records = records;
    this.#names = new Set([...records.values()].map((record) => record.name));
    const versions = new Map<string, Set<string>>();
    for (const record of records.values()) {
      const current = versions.get(record.name) ?? new Set<string>();
      current.add(record.exactVersion);
      versions.set(record.name, current);
    }
    this.#versionsByName = new Map(
      [...versions.entries()].map(([name, values]) => [name, new Set(values)]),
    );
    this.#registeredMigrationOrAdapterIds = registeredMigrationOrAdapterIds;
  }

  static async create(
    records: readonly unknown[],
    options: SchemaRegistryOptions = {},
  ): Promise<SchemaResult<SchemaRegistry>> {
    const diagnostics: SchemaDiagnostic[] = [];
    const normalizedAdapters = new Set<string>();
    for (
      const [index, adapter] of (options.registeredMigrationOrAdapterIds ?? [])
        .entries()
    ) {
      if (
        typeof adapter !== "string" ||
        !ADAPTER_ID.test(adapter.trim().toLowerCase())
      ) {
        diagnostics.push(
          diagnostic(
            "INVALID_MIGRATION_OR_ADAPTER",
            "Registered migration or adapter IDs must be stable identifiers.",
            `options.registeredMigrationOrAdapterIds[${index}]`,
          ),
        );
      } else {
        normalizedAdapters.add(adapter.trim().toLowerCase());
      }
    }
    const map = new Map<string, CanonicalSchemaRecord>();
    for (const [index, input] of records.entries()) {
      const result = await createCanonicalSchemaRecord(input);
      if (!result.ok) {
        diagnostics.push(
          ...result.diagnostics.map((item) => ({
            ...item,
            path: item.path === undefined
              ? `records[${index}]`
              : `records[${index}].${item.path}`,
          })),
        );
        continue;
      }
      const record = result.value;
      if (
        record.migrationOrAdapterId !== null &&
        !normalizedAdapters.has(record.migrationOrAdapterId)
      ) {
        diagnostics.push(
          diagnostic(
            "MIGRATION_OR_ADAPTER_NOT_REGISTERED",
            "A migration or adapter ID must be registered before the schema can become canonical.",
            `records[${index}].migrationOrAdapterId`,
          ),
        );
      }
      if (map.has(record.identity)) {
        diagnostics.push(
          diagnostic(
            "DUPLICATE_SCHEMA_IDENTITY",
            "Schema identity must be unique in the registry.",
            `records[${index}]`,
          ),
        );
      } else {
        map.set(record.identity, record);
      }
    }
    if (diagnostics.length > 0) return failure(diagnostics);
    return success(new SchemaRegistry(map, normalizedAdapters));
  }

  get registeredMigrationOrAdapterIds(): readonly string[] {
    return [...this.#registeredMigrationOrAdapterIds].sort();
  }

  list(): readonly CanonicalSchemaRecord[] {
    return [...this.#records.values()].sort((left, right) =>
      compareStable(left.identity, right.identity)
    );
  }

  resolve(identityInput: unknown): SchemaResult<CanonicalSchemaRecord> {
    const identity = normalizeIdentity(identityInput);
    if (!identity.ok) return identity;
    const nameVersions = this.#versionsByName.get(identity.value.name);
    if (nameVersions === undefined) {
      return failure([
        diagnostic(
          "UNKNOWN_SCHEMA_NAME",
          "Schema name is not registered.",
          "identity.name",
        ),
      ]);
    }
    if (!nameVersions.has(identity.value.exactVersion)) {
      return failure([
        diagnostic(
          "UNKNOWN_SCHEMA_VERSION",
          "Exact schema version is not registered for this schema name.",
          "identity.exactVersion",
        ),
      ]);
    }
    const record = this.#records.get(schemaIdentity(identity.value));
    if (record === undefined) {
      return failure([
        diagnostic(
          "UNKNOWN_SCHEMA_DIGEST",
          "Schema digest is not registered for this exact schema version.",
          "identity.digest",
        ),
      ]);
    }
    return success(record);
  }

  resolveCallerSchema(
    callerValue: unknown,
    expectedIdentity?: SchemaIdentityInput,
  ): SchemaResult<CanonicalSchemaRecord> {
    if (!isRecord(callerValue)) {
      return failure([
        diagnostic(
          "CALLER_SCHEMA_IDENTITY_REQUIRED",
          "Caller must provide a schema identity object; its body is never authority.",
        ),
      ]);
    }
    let callerIdentity: SchemaIdentityInput;
    try {
      callerIdentity = {
        name: callerValue.name as string,
        exactVersion: callerValue.exactVersion as string,
        digest: callerValue.digest as string,
      };
    } catch {
      return failure([
        diagnostic(
          "CALLER_SCHEMA_IDENTITY_REQUIRED",
          "Caller schema identity could not be read safely.",
        ),
      ]);
    }
    const identity = normalizeIdentity(callerIdentity);
    if (!identity.ok) {
      return failure([
        diagnostic(
          "CALLER_SCHEMA_IDENTITY_REQUIRED",
          "Caller schema must expose a valid name, exactVersion, and digest.",
        ),
      ]);
    }
    if (expectedIdentity !== undefined) {
      const expected = normalizeIdentity(expectedIdentity);
      if (
        !expected.ok ||
        schemaIdentity(expected.value) !== schemaIdentity(identity.value)
      ) {
        return failure([
          diagnostic(
            "CALLER_SCHEMA_SCOPE_MISMATCH",
            "Caller schema identity is not bound to the expected canonical schema.",
          ),
        ]);
      }
    }
    return this.resolve(identity.value);
  }

  hasRegisteredMigrationOrAdapter(id: string | null): boolean {
    return id !== null && this.#registeredMigrationOrAdapterIds.has(id);
  }
}

export function serializeSchemaRecord(record: CanonicalSchemaRecord): string {
  return canonicalSchemaJson({
    contractVersion: FP007_SCHEMA_CONTRACT_VERSION,
    name: record.name,
    exactVersion: record.exactVersion,
    digest: record.digest,
    identity: record.identity,
    owner: record.owner,
    status: record.status,
    compatibilityMode: record.compatibilityMode,
    migrationOrAdapterId: record.migrationOrAdapterId,
    fixtureSet: [...record.fixtureSet].sort(),
    fields: Object.fromEntries(
      Object.keys(record.fields).sort().map((key) => [key, record.fields[key]]),
    ),
    schemaFamily: record.schemaFamily,
    legacyOf: record.legacyOf,
  });
}
