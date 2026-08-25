# WP-092 Asset Registry Contract

## Status

Completed as an isolated Core contract on 2026-08-07. WP-000 through WP-091 were preserved and
their implementation packages were not re-run. No production migration, Storage upload, database
write, route change, deploy, publish, commit, or push was performed.

## Canonical boundaries

- Asset owns identity, owner, Project reference, visibility, lifecycle, HEAD, provenance, legacy
  binding, metadata, and record version.
- AssetRevision owns immutable Revision ID, parent, content Hash, MIME, byte length, verified
  Storage Locator, Tool/Format version, dependency snapshot reference, and verification state.
- Dependency owns consumer/provider Asset and Revision references, relation, compatibility,
  required/optional status, and LIVE/PINNED/REVIEW/FORKED policy.
- Project Registry owns only Project identity and root references; it does not copy Asset data.
- Market, Package, License, Royalty, Purchase, Entitlement, Commission, and SNS remain separate.

## Verified Blob contract

Blob bytes remain in OPFS/Object Storage. Registry rows store Hash, size, MIME, and relative locator
metadata only. A trusted injected verifier must return computed Hash/size/MIME; the client-provided
Hash is never accepted as proof. Same Hash metadata is reused across Assets, while same-Asset
duplicate content cannot create a second Revision. Path traversal, external URL, Base64/Data URL,
MIME spoofing, size mismatch, and Hash mismatch fail closed.

## Reference Policies

`LIVE` follows provider HEAD and emits `ASSET_LIVE_REFERENCE_UPDATED`; `PINNED` remains fixed;
`REVIEW` records a candidate and emits `ASSET_UPDATE_AVAILABLE`; `FORKED` creates an independent
Asset ID with provenance and no later parent auto-update. Unknown policies are rejected.

## Commands and events

Commands are Create Asset, Create Revision, Set Head, Add/Remove Dependency, Change Reference
Policy, Archive, Restore, Trash, Quarantine, and Fork. Every write has Command ID, Actor,
Correlation ID, Expected Record Version, Idempotency Key, and server Permission Decision. Same
fingerprint retries replay; stale Version and different idempotency payloads fail without mutation.
Hard Delete is absent. Events are bounded metadata and do not contain Blob body or Storage Locator.

## Security and lifecycle

Private existence is concealed from unknown principals. Public Preview does not expose source
locator or source permission. Active dependents or retention locks block trash; trashed assets are
retained for restore/relationship safety. Quarantine preserves the source and is not silently
restored. Provenance never performs Royalty calculation.

## Feature flags

`asset-registry-read`, `asset-registry-write`, `asset-revision-write`, `asset-dependency-live`,
`asset-legacy-adapter`, and `asset-storage-upload` are independent default-off controls. Rollback
preserves current Asset, Project, PXD, PiXiSYNC, Market, and purchase paths.

## Verification

`scripts/test-core-asset-registry-wp092.mjs` covers 11 Commands, 12 Events, 36 failure fixtures,
four Reference Policies, live Draw-to-Game and revision update behavior, Audio-compatible Asset
kind registration, legacy mapping, Blob verification, access separation, lifecycle retention,
feature flag rollback, pagination, and transport-free event boundaries.

## Related files

- `02_ARCHITECTURE/ASSET_REGISTRY_CORE.md`
- `02_ARCHITECTURE/ASSET_GRAPH.md`
- `core-shell/assets/core-asset-registry-contracts.js`
- `core-shell/schemas/asset-registry-v1.schema.json`
- `core-shell/fixtures/asset-registry-v1.valid.json`
- `docs/decisions/ADR-20260807-WP092-asset-registry.md`
- `docs/inventory/wp092-asset-registry-boundary.json`
