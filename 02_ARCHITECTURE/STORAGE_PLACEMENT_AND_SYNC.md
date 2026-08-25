---
spec_id: ARCH-STORAGE-PLACEMENT-001
title: PiXiEED Storage Placement and Synchronization Boundaries
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS, ENGINEERING
version: 1.0.0
updated: 2026-08-07
depends_on:
  - 02_ARCHITECTURE/PIXIEED_CORE_SYSTEM.md
  - 02_ARCHITECTURE/INTEGRATED_PACKAGE_FORMAT.md
  - CURRENT_SYSTEM_PRESERVATION_GATE.md
---

# PiXiEED Storage Placement and Synchronization Boundaries

## Decision

PiXiEED does not put every value into IndexedDB. Storage is selected by data shape, lifecycle,
latency, authority, and size. Browser-local persistence is **Memory + IndexedDB + OPFS**. Cloud
authority is **Database + Object Storage**. Tool integration is **Asset Graph + Revision + Event**.

```text
Memory
  current editor state, selection, recent Undo/Redo, render cache, playback state

IndexedDB
  Command Journal, pending Operations, checkpoint metadata, Project/Asset indexes,
  small metadata/settings, recent Projects, Offline Queue

OPFS
  large Draw tiles/chunks, Audio Blobs, waveform/render caches, Game build caches,
  previews, large local checkpoints

Supabase Database
  accounts, permissions, Project metadata, confirmed Revision/Operation state,
  Asset Graph, Product/Purchase/Entitlement/License/Royalty, SNS, Commission,
  Subscription, ledger, notification, and search projections

Object Storage
  PXD/PiXiPackage exports, PNG/GIF, Audio/Game packages, immutable Asset Blobs,
  thumbnails, backups, and public files
```

## Ownership rules

| Data | Primary location | Rule |
| --- | --- | --- |
| Current Canvas/Frame/Layer/tool state | Memory | Fast and disposable; never the only durable copy after acknowledgement. |
| Recent Undo/Redo | Memory | Exact reversible state stays local; long history is Journal/Checkpoint work. |
| Command Journal | IndexedDB | Structured records, ordered sequence, operation ID, hash/ack state. |
| Pending/offline Operation | IndexedDB | Retryable queue; no large Blob payload in the record. |
| Project/Asset index | IndexedDB | Lookup metadata and local handles only. |
| Tile/Chunk/Audio/Preview/Build bytes | OPFS | Large or partial-update data; reference by hash/path in IndexedDB. |
| Confirmed command/revision/permission | Supabase Database | Server authority for shared state; current PiXiSYNC contracts remain compatible. |
| Immutable Blob/Package/export | Object Storage | Content-addressed or immutable path; database stores hash, size, MIME, owner, license, and dependency references. |

The exact current IndexedDB stores remain evidence in `docs/inventory/storage-and-formats.json`.
They are not silently migrated by this specification. In particular, current local journal/autosave
stores remain readable while the new Core storage adapter is developed.

## Local edit sequence

```text
User command
  → apply in Memory
  → append structured Command Journal record in IndexedDB
  → write changed Tile/Chunk/Blob to OPFS
  → update IndexedDB index/checkpoint location
  → create a bounded Checkpoint
  → enqueue Core/PiXiSYNC Operation
  → server confirms Revision/Operation and Blob availability
```

The UI may render immediately after a validated local apply, but a save/sync indicator MUST expose
pending, acknowledged, conflict, and recovery states. A confirmed command is not discarded merely
because a later OPFS or network step fails; recovery keeps the Journal entry and reports the failed
side effect.

## PiXiSYNC payload boundary

PiXiSYNC synchronizes structured changes, not whole large files on every edit:

```text
Command Envelope
  + Canonical Operation
  + changed Tile/Region reference when needed
  + Asset Revision metadata
  + Project structure/metadata change
  + content hash and authorized Blob upload/download intent
```

Large image, Audio, Game, and Package bytes use content hashes and an explicit Object Storage or
OPFS transfer step. A small metadata operation MUST NOT contain an unbounded Base64 Blob. A Blob is
uploaded only when the receiving authority does not already possess the hash; the database records
the resulting immutable reference.

## Event and cross-tool boundary

Tools never edit another tool's IndexedDB record in place. Core emits a typed Asset Revision or
Project event:

```text
Draw2 → Draw Revision updated → Core Event Bus → Game/Video reload reference
Audio → Audio Revision updated → Core Event Bus → safe playback swap / timeline recalculation
Game → presentation reference changed → Core → source Draw/Audio remains immutable
```

Same-browser delivery may use a Core Event Bus backed by BroadcastChannel, MessageChannel,
SharedWorker, or Service Worker where capability checks allow it. Separate devices use the current
PiXiSYNC/Realtime compatibility boundary. Event delivery is a projection/notification mechanism;
Asset Graph, Revision, license, and server confirmation remain the source of truth.

## PXD/PiXiPackage materialization

Working projects remain split across local and server boundaries. Export, backup, transfer, and
Market distribution may materialize:

- a lightweight package containing Manifest, IDs, Revision references, hashes, Dependency Lock, and
  License Snapshot; or
- a complete embedded package containing all required Draw/Audio/Game/Video/Input data and locked
  immutable Blobs.

Materialization reads from the authoritative references and does not convert normal editing into a
single giant file rewrite. Missing, unauthorized, or hash-mismatched bytes produce a recovery error.

## Compatibility and rollout

The current PiXiEEDraw IndexedDB/autosave, current PXD archive-v2, current PiXiSYNC pending queue,
Supabase contracts, and existing Storage paths remain active. New Core adapters start in isolated or
shadow mode. Migration must be additive, measurable, reversible, and separately approved; no
production data, migration, deploy, publish, or URL cutover is part of this specification.

