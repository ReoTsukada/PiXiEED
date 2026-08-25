# WP-091 Project Registry Contract

## Status

Completed as an isolated Core contract on 2026-08-07. WP-000 through WP-090 were preserved and
their implementation packages were not re-run. No production migration, route connection, deploy,
publish, commit, or push was performed.

## Canonical record

The runtime contract is `core-shell/assets/core-project-registry-contracts.js` and the portable
record shape is documented by `core-shell/schemas/project-registry-v1.schema.json`. Required
identity/metadata includes:

```text
projectId / projectKind / toolId / formatId / formatVersion
ownerType / ownerId / createdBy
visibility / lifecycleState / headRevisionId
rootAssetId or rootReference / legacyBindings
schemaVersion / recordVersion / createdAt / updatedAt
```

The record may contain bounded name, member, and display metadata only. It rejects content bytes,
PXD/package bodies, Journal/Checkpoint/Operation payloads, full Editor State, Base64/Data URLs,
JWT/email/secret, Commission body, and Market financial/entitlement data.

## Commands, idempotency, and result contract

The 14 commands and 11 events are exported constants and are tested by
`scripts/test-core-project-registry-wp091.mjs`. Writes require a server allow decision, correlation
ID, expected record version, and idempotency key. Stale versions return `PROJECT_RECORD_VERSION_CONFLICT`.
Same-fingerprint retry returns the original result; different payload reuse returns
`PROJECT_IDEMPOTENCY_KEY_REUSE`. Hard delete is not a command.

## Visibility and lifecycle

Private guessed existence is concealed with 404-style metadata for anonymous/unknown principals;
known denied principals receive a 403-style diagnostic. Public read is not write permission.
Unlisted projects are excluded from listing and require direct reference. Lifecycle is explicit,
with `TRASHED` restore and no hard delete. Quarantine is terminal in this package until an explicit
future resolution contract exists.

## Ownership and compatibility

User/Team ownership and Creator/Editor/Viewer membership are separate from Seller, Purchase,
Entitlement, Subscription, Commission, Admin, and Market Product ownership. Ownership transfer is
request-only and records unchanged downstream rights. Legacy bindings are permanent, one-to-one,
hash-evidenced, and conflict-safe. Collisions create a quarantined isolated record while keeping
the original mapping; no existing Project is auto-registered or migrated.

## Storage and rollout

The Registry holds server metadata. IndexedDB is only a local index/offline metadata mirror; OPFS
and Object Storage hold large bytes. The five Project Registry flags are default-off and supplied by
the existing server-side feature flag evaluator. Read/write are independent; kill-switch/rollback
returns the preserved current path without deleting or rewriting current data.

Listing uses server-side permission filtering, stable cursor, deterministic order, page size <=100,
and explicit lifecycle/owner/member/visibility filters. The switcher returns identity and record
version only; it does not mutate Editor State or transfer a Blob.

## Related files

- `02_ARCHITECTURE/PROJECT_REGISTRY_CORE.md`
- `core-shell/assets/core-project-registry-contracts.js`
- `core-shell/schemas/project-registry-v1.schema.json`
- `core-shell/fixtures/project-registry-v1.valid.json`
- `docs/decisions/ADR-20260807-WP091-project-registry.md`
- `docs/inventory/wp091-project-registry-boundary.json`
