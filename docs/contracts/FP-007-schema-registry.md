# FP-007 Schema Registry / Compatibility Contract

Status: `IMPLEMENTED_ISOLATED_REFERENCE`

This contract is the Track 1 reference boundary for FP-007. It is independent of DOM, Canvas,
current PiXiEEDraw, PiXiSYNC, Market, network registries, local files, host information, and
production data. It does not authorize a migration, deployment, route change, or cutover.

## Canonical identity

A registered schema is addressed by exactly:

```text
name + "@" + exactVersion + "#" + digest
```

`digest` is lowercase SHA-256 over deterministic canonical JSON of the normalized schema material:

```text
name, exactVersion, owner, status, compatibilityMode,
migrationOrAdapterId, fixtureSet, fields, schemaFamily, legacyOf
```

The digest is not included in the material being hashed. Object keys and fixture IDs are sorted by
code-point order. No timestamp, absolute path, host name, locale-dependent sort, random value,
environment variable, or user-specific path is accepted as a schema input.

## Normalized record

Every canonical record contains:

| Field | Rule |
|---|---|
| `name` | Lowercase bounded stable name. Path/host values are rejected. |
| `exactVersion` | Bounded exact token. `latest`, `*`, `^`, `~`, and mutable ranges are rejected. |
| `digest` | Lowercase 64-character SHA-256 and must match canonical material. |
| `owner` | Bounded stable identifier. |
| `status` | `ACTIVE`, `DEPRECATED`, or `RETIRED`. Input case is normalized. |
| `compatibilityMode` | `backward`, `forward`, or `full`. Input case is normalized. |
| `migrationOrAdapterId` | Stable lowercase ID or `null`; required for Legacy records. |
| `fixtureSet` | Non-empty, unique, code-point-sorted stable fixture IDs. |
| `schemaFamily` | `CANONICAL` or `LEGACY`. |
| `legacyOf` | Canonical schema name for Legacy records; otherwise `null`. |
| `fields` | Sorted field map with type, required, nullable, and `hasDefault`. |

Unknown record or field keys fail closed. Registered migration/adapter IDs are supplied to the
isolated registry at construction time; a record cannot become canonical merely because it names an
unregistered adapter.

## Authority boundary

`SchemaRegistry.resolveCallerSchema()` reads only `name`, `exactVersion`, and `digest` from a caller
object, optionally checks an expected identity, and then returns the frozen registered record. It
never trusts caller-provided `owner`, `status`, fields, fixture set, compatibility mode, or adapter
metadata. Unknown name, version, or digest fails before the record can be used.

The registry is therefore a lookup/verification boundary, not a client-side schema authority.
Provider, server, and production integration remain separate future gates.

## Compatibility direction

The candidate (`to`) record declares the mode used by `checkSchemaCompatibility()`.

- `backward`: candidate output must remain readable by the previous reader. Optional field additions
  and optional field removals are safe; required additions/removals, type changes, nullability
  changes, and inferred renames are not.
- `forward`: candidate reader must accept previous output. Optional additions/removals are safe;
  required additions are safe only when a canonical default is declared; required removals in the
  relevant direction, type changes, nullability changes, and inferred renames are not.
- `full`: both directions must pass.

The implementation uses a conservative rule for a simultaneous field removal and addition:
because a rename cannot be inferred safely, it is recorded as
`FIELD_RENAMED_OR_REPLACED` and requires an explicit migration or adapter.

When a declared mode is violated, the result fails closed unless the candidate names a migration or
adapter ID that is present in the registry. A registered adapter makes the result
`adapted: true`; it does not silently transform data and does not authorize a legacy conversion.

## Legacy boundary

PXD, PiXiSYNC, Market, and other legacy formats are separate `LEGACY` records with their own exact
version and `legacyOf` reference. They require a registered explicit adapter ID. A Legacy record and
a canonical record never pass ordinary compatibility comparison; the result is
`LEGACY_ADAPTER_REQUIRED`. No best-effort parsing, implicit conversion, or version aliasing is
allowed. The adapter operation must be a later, separately versioned boundary with its own fixtures.

## Failure and attack coverage

The Track 1 fixtures and tests cover:

- digest tampering and digest mismatch before registration;
- unknown schema name, exact version, and digest;
- mutable `latest` version rejection;
- unknown record/field shape rejection;
- unregistered Legacy adapter rejection;
- forged caller body whose identity is valid but whose owner/fields are altered;
- caller identity scope mismatch and missing identity;
- optional field addition/removal under explicit direction;
- required field addition/removal without adapter;
- field type change without adapter;
- field rename/replacement without inferred conversion;
- registered adapter path for an explicitly declared incompatible change;
- Legacy-to-canonical comparison rejection.

Fixtures are under:

```text
pixiedraw2/tests/fp-007/fixtures/schema-*.json
```

Implementation and tests are:

```text
pixiedraw2/src/fp-007/schema-registry.ts
pixiedraw2/src/fp-007/schema-compatibility.ts
pixiedraw2/tests/fp-007/schema-registry.test.ts
```

## Verification status

The evidence is isolated local reference evidence only. It does not prove production provider,
real legacy user-data, browser, device, clean-checkout, dependency-lock, or production build
compatibility. Those remain the responsibility of the other FP-007 tracks and later qualification
gates.
