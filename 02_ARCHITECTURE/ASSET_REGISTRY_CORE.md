---
spec_id: ARCH-ASSET-REGISTRY-CORE-001
title: PiXiEED Core Asset Registry Contract
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS, ENGINEERING
version: 1.0.0
updated: 2026-08-07
depends_on:
  - 02_ARCHITECTURE/ASSET_GRAPH.md
  - 02_ARCHITECTURE/PROJECT_REGISTRY_CORE.md
  - 02_ARCHITECTURE/STORAGE_PLACEMENT_AND_SYNC.md
  - 02_ARCHITECTURE/LEGACY_DATA_COMPATIBILITY.md
---

# Asset Registry Core

WP-092 freezes the canonical Asset, AssetRevision, verified Blob reference, Dependency, Provenance,
and cross-tool update boundary. The implementation is an unloaded, framework-neutral in-memory
reference adapter. It does not implement Draw2, Audio playback, Game Preview, Market, SNS, or real
Storage upload.

## Asset record

An Asset is identity and metadata only:

```text
assetId, assetKind, ownerType, ownerId, sourceProjectId, createdBy
visibility, lifecycleState, headRevisionId, provenance, legacyBindings
metadata, schemaVersion, recordVersion, createdAt, updatedAt
```

Asset Kind is registered and unknown values fail closed. The initial kinds include Raster Image,
Animation, Palette, Tile Set, Sprite Sheet, Audio, Music Project, Sound Effect, Game Scene,
Game Component, Game UI, Script, Visual Graph, Event Sheet, Video/Timeline, Package, and
Thumbnail/Preview.

Asset ownership is separate from Project ownership, Market Product ownership, Purchase/Entitlement,
License, Royalty, Commission, and Subscription state. `PUBLIC_PREVIEW` is a preview surface only;
it never grants source Blob or Object Storage access.

## Immutable AssetRevision

Each Revision has its own immutable ID and contains:

```text
revisionId, assetId, parentRevisionId, contentHash, contentType, byteLength
storageLocator, toolId, formatId, formatVersion, dependencySnapshotId
createdBy, createdAt, verificationState, recordVersion, immutable=true
```

Revision N is never edited in place. A new edit creates Revision N+1. Client-provided Hash and size
are untrusted; a server-side/injected Blob Verifier must return computed Hash, byte length, and MIME
evidence before the Revision becomes `VERIFIED`. The same verified content hash is reused across
Assets, while identical content is not duplicated as a Revision of the same Asset.

The Registry stores only locator metadata, never Blob bytes, Base64, Data URLs, PXD/package bodies,
Editor State, Journal, Checkpoint, Post content, payment, rights, or Commission data. Locators are
relative `object-storage` or `opfs` references; external URLs, absolute paths, traversal, and
Script/HTML execution are rejected at this boundary.

## Dependency and provenance

An edge records consumer Asset, provider Asset, provider/resolved/candidate Revision references,
relation type, required/optional status, compatibility constraint, and Reference Policy. Supported
policies are:

- `LIVE`: resolved Revision follows the provider HEAD and emits a live-update event.
- `PINNED`: one immutable Revision remains fixed after provider HEAD changes.
- `REVIEW`: a provider update becomes a candidate/update-available event; approval is separate.
- `FORKED`: a new Asset ID and lineage are independent; provider updates never mutate the fork.

Forbidden dependency cycles fail closed. `RUNTIME_BINDS` is the only explicitly cycle-allowed
relation in this contract; a future Package/Build closure must still reject cycles. The Asset Graph
retains active consumer edges and prevents unsafe trash when active dependents or an injected
retention lock exist. Hard Delete is not a command.

Provenance is one of `ORIGINAL`, `DERIVED_FROM`, `FORKED_FROM`, `IMPORTED_FROM`, or `GENERATED_FROM`.
It stores source references only. Royalty calculation and Market rights remain separate contracts.

## Events and live update

Events contain bounded Asset/Revision IDs, Hash, reason, correlation ID, policy, and edge references.
They never contain Blob body or Storage Locator. The reference adapter emits Created, Revision
Created, Head Changed, Dependency Changed, Archived, Restored, Trashed, Quarantined, Missing,
Compatibility Changed, Live Reference Updated, and Update Available events.

The event payload is transport-neutral. BroadcastChannel, SharedWorker, MessageChannel, Core Event
Bus, PiXiSYNC, or Realtime adapters may consume it later, but WP-092 does not couple to a transport.

## Security and visibility

Private guessed Asset existence is concealed for unknown principals. A known unauthorized source
request returns a fail-closed 403-style result. A public preview can return bounded preview metadata
without a source locator. Asset ID substitution, removed permission, path traversal, MIME spoofing,
and external fetch are not accepted as authority.

## Flags and storage

The following flags are independent and default-off:

```text
asset-registry-read
asset-registry-write
asset-revision-write
asset-dependency-live
asset-legacy-adapter
asset-storage-upload
```

Read, Write, Revision, Live Update, Legacy Adapter, and Upload are separately injectable through
the existing server-side flag boundary. Kill switch/rollback returns the preserved path and does
not delete or change existing Assets, Projects, PXD, PiXiSYNC, Market products, or purchases.

Storage follows `STORAGE_PLACEMENT_AND_SYNC.md`: Memory owns decoded working data, IndexedDB owns
indexes and queues, OPFS owns local large bytes/caches, Database owns confirmed metadata, and Object
Storage owns immutable bytes/packages/previews.

## Implementation boundary

`core-shell/assets/core-asset-registry-contracts.js` is the isolated implementation. Existing
`pixiedraw/assets/js/modules/core-asset-graph-utils.js` remains the WP-040 host adapter and is not
replaced or wired differently by WP-092. The current Draw/PXD/PiXiSYNC/Market/SNS paths remain
readable and unchanged through future adapters.

## Tool Bridge boundary

WP-093 consumes this Registry through references only. The Versioned Tool Bridge may carry
`assetId`, `revisionId`, `contentHash`, `projectId`, `packageId`, and opaque Storage Handle
references, but never Blob bytes, PXD/PiXiPackage bodies, Base64, Data URLs, or full Editor State.
Reference Policy remains authoritative here; the Bridge does not define a second LIVE/PINNED/
REVIEW/FORKED state machine. It only delivers bounded update/invalidation events to registered
Tools after server authorization and Feature Flag checks.
