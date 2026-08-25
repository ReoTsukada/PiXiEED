---
spec_id: ARCH-PROJECT-REGISTRY-CORE-001
title: PiXiEED Core Project Registry Contract
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS, ENGINEERING
version: 1.0.0
updated: 2026-08-07
depends_on:
  - 02_ARCHITECTURE/PIXIEED_CORE_SYSTEM.md
  - 02_ARCHITECTURE/LEGACY_DATA_COMPATIBILITY.md
  - 02_ARCHITECTURE/ACCOUNT_PERMISSION_CORE.md
  - 02_ARCHITECTURE/STORAGE_PLACEMENT_AND_SYNC.md
  - 02_ARCHITECTURE/FEATURE_FLAG_OBSERVABILITY_ROLLBACK_CORE.md
---

# Project Registry Core

WP-091 defines the canonical identity and metadata boundary for projects used by PiXiEEDraw,
PiXiEEDraw2, PiXiAudio, PiXiGame, PixFind, camera/image tools, and other registered tools. It is
an unloaded, DOM-free Core contract and an in-memory reference implementation. It is not a
production database migration, route cutover, project import, or editor integration.

## Registry record

The v1 record contains only metadata and identity:

```text
projectId, projectKind, toolId, formatId, formatVersion
ownerType, ownerId, createdBy
name, visibility, lifecycleState
headRevisionId, rootAssetId or rootReference
legacyBindings, members, metadata
schemaVersion, recordVersion, membershipVersion
createdAt, updatedAt
```

`projectId` is the formal identifier. Project names are labels and are not globally unique unless a
future product surface explicitly requires a scoped uniqueness rule. Typed IDs preserve existing
IDs through adapters; they are never replaced by email, display name, sequential guesses, or a
new ID merely because a project is legacy.

The registry rejects Pixel/Audio/Game Blobs, Tiles/Chunks, Journal, Checkpoint, PXD/package body,
large Base64/Data URLs, full Editor State, JWT/email/secret, Commission body, and Market/Payment/
Entitlement/Licence/Royalty records. Those remain in their existing Core storage and authority
boundaries: IndexedDB for local index/queue metadata, OPFS/Object Storage for large bytes, and the
server database for confirmed metadata and authorization.

## Registered tools and formats

Unknown `projectKind`, `toolId`, `formatId`, and `formatVersion` fail closed. New tools are admitted
only through an explicit registration definition. The initial registrations are:

| Tool | Project kind | Formats and versions |
| --- | --- | --- |
| `pixiedraw` | `DRAW` | `pxd`: `archive-v2`, `2` |
| `pixiedraw2` | `DRAW2` | `pxd`: `archive-v2`, `2`; `pixipackage`: `1` |
| `pixieaudio` | `AUDIO` | `pixiaudio-project`: `1` |
| `pixigame` | `GAME` | `pixigame-project`: `1`; `pixipackage`: `1` |
| `pixfind` | `PIXFIND` | `image-project`: `1` |
| `camera-image` | `CAMERA_IMAGE` | `image-project`: `1` |
| `registered-tool` | `OTHER_REGISTERED` | `registered-project`: `1` |

The current PXD archive-v2 reader/writer remains authoritative until a lossless adapter and
round-trip gate are approved. Registry format metadata does not convert or rewrite PXD bytes.

## Ownership, members, and visibility

`ownerType` is `USER` or `TEAM`; `ownerId` is a stable typed identity. Member roles are
`CREATOR`, `EDITOR`, and `VIEWER`, with `USER_OWNER`/`TEAM_OWNER` derived from ownership. Account,
Market seller, buyer/purchase/entitlement, subscription, commission, and Admin roles are not
interchangeable with Project ownership.

Visibility is `PRIVATE`, `UNLISTED`, or `PUBLIC`:

- `PUBLIC` permits read only; it does not grant edit, publish, member, or ownership authority.
- `UNLISTED` is excluded from list/search projections and requires an explicit direct reference.
- `PRIVATE` hides guessed existence from anonymous/unknown principals with a 404-style result.
  A known principal without a grant may receive a 403-style result; both are fail-closed.
- Client display is never the authority. The server permission decision and current membership
  state are required for writes and stale/removed sessions fail closed.

## Lifecycle and deletion

```text
ACTIVE     → ARCHIVED | TRASHED | MIGRATING | QUARANTINED
ARCHIVED   → ACTIVE | TRASHED | MIGRATING | QUARANTINED
TRASHED    → ACTIVE
MIGRATING  → ACTIVE | ARCHIVED | QUARANTINED
QUARANTINED→ (explicit audited resolution outside WP-091)
```

There is no hard-delete command and IDs are never reused. `TRASHED` retains restore/export and all
public URL, Market, purchase, license, and commission relationships. Legacy conflict, collision,
cycle, or owner mismatch enters `QUARANTINED`; source records are retained and never silently
merged or deleted.

## Commands and events

Every write has a typed Command Envelope with `commandId`, `commandType`, `schemaVersion`,
`projectId`, `actorId`, `correlationId`, `expectedRecordVersion`, `idempotencyKey`, a server
`permissionDecision`, trusted command time, and a bounded metadata payload. The reference registry
uses optimistic `recordVersion` checks and stores command/idempotency fingerprints. A repeated
command with the same fingerprint replays its result; a reused key with a different fingerprint
fails without mutation.

The v1 commands are Create, Rename, Change Visibility, Archive, Restore, Trash, Change Tool/Format,
Update Head Revision, Add/Remove Member, Begin/Complete Migration, Quarantine Legacy Mapping, and
Request Ownership Transfer. Ownership transfer is only a request/event in this package; it does
not rewrite owner, Market rights, purchases, licenses, royalty, commission, or payment state.

Events are append-only metadata facts: Created, Metadata Changed, Visibility Changed, Member
Changed, Archived, Restored, Trashed, Migration Started/Completed, Legacy Mapping Quarantined, and
Ownership Transfer Requested. Events contain no content bytes, JWT, email, secret, Commission body,
or financial/entitlement data.

## Legacy bindings

Each binding requires `legacySystemId`, `legacyProjectId`, `legacyFormatVersion`, `mappingState`,
`adapterVersion`, `migrationStatus`, and a verification hash/equivalent evidence. A permanent
one-to-one map is used per legacy system/entity. Forward/reverse collisions, circular mapping,
cross-user ID substitution, and owner mismatch fail closed and preserve the originals. Migration is
read/validate/verify/write-to-new-destination only; WP-091 does not register existing production
projects or reinterpret current PiXiSYNC history.

## Listing and Project Switcher

The reference listing contract uses server-side permission filtering before pagination, stable
cursor, deterministic `(updatedAt ASC, projectId ASC)` ordering, maximum page size 100, owner/member/
visibility filters, and explicit lifecycle filters. It does not depend on Project ID sequences and
does not send all projects to a client for local filtering. Search indexing is deferred to WP-096.

The Project Switcher returns a selected project identity and record version. It does not mutate
Editor State, transfer Blob data, or change the current production Project.

## Flags and rollback

All five flags are default-off and independently injectable through the existing server-side flag
boundary:

```text
project-registry-read
project-registry-write
project-registry-legacy-adapter
project-registry-migration
project-registry-ownership-transfer
```

Read and write are independent. Unknown, off, killed, or rolled-back decisions return an explicit
Unavailable/fallback result before the in-memory adapter mutates. A kill switch preserves current
PXD, PiXiSYNC, projects, URLs, Market products, purchases, and rights data.

## Implementation boundary

`core-shell/assets/core-project-registry-contracts.js` is an isolated ESM contract and in-memory
reference implementation. Clock, ID, random, network, feature-flag, and permission adapters are
injected; the module calls no DOM, Canvas, browser storage, network, time, or random global. The
module is not referenced by `core-shell/index.html`, `pixiedraw/index.html`, current routes, PXD,
PiXiSYNC, Market, Supabase, or Object Storage.
