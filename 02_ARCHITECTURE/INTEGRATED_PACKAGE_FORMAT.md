---
spec_id: ARCH-INTEGRATED-PACKAGE-001
title: Integrated PiXiPackage and PXD Compatibility Contract
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS, ENGINEERING
version: 1.0.0
updated: 2026-08-16
depends_on:
  - 02_ARCHITECTURE/OFFICIAL_PACKAGE_FORMAT.md
  - 02_ARCHITECTURE/ASSET_GRAPH.md
  - 02_ARCHITECTURE/PIXIEED_CORE_SYSTEM.md
  - CURRENT_SYSTEM_PRESERVATION_GATE.md
---

# Integrated PiXiPackage and PXD Compatibility Contract

## Decision

PiXiEED has an explicit boundary between the current production archive, the
Draw2 source container, and the integrated delivery package:

1. **Current PXD** is the existing production PiXiEEDraw editable Draw project format. Its
   archive, routes, and manifest behavior remain unchanged and readable/writable by the current
   application.
2. **Draw2 PXD v1** is the new user-facing editable PiXiEED project container. It owns the Draw
   project state and reference-only `AssetDefinitions` for that project. It is still a Draw-
   centered slice: Audio/Game sections are references and bindings, not full Audio/Game editor
   state.
3. **Integrated PiXiPackage** is the materialized Core delivery/package model for Draw, Audio,
   Game, Runtime, video/演出, controls, dependencies, provenance, and licenses. It may use the
   `.pxd` extension when materialized as an editable integrated package; `PXD2` is not a product
   or format name.

The current production PXD is never expanded or rewritten in place. Draw2 PXD v1 is a separate
versioned source-container contract behind an explicit adapter boundary. A later PiXiPackage
materialization may include the PXD source references and the resolved immutable revisions, but it
does not replace the PXD source of truth or rewrite current production data.

## Draw2 PXD source-container contract

From the creator's perspective, one `.pxd` file is the editable source for one PiXiEED Project:

```text
Draw2 PXD
├── Project metadata and schema version
├── Draw state: Canvas / Palette / Layers / Frames / Timeline / Tags / settings
├── AssetDefinitions (reference definitions owned by this PXD)
├── Audio and Game references/bindings (no full editor state in the initial slice)
├── Asset Graph and dependency references
├── revision / recovery metadata selected for materialization
├── PiXiSYNC metadata boundary
├── provenance / license metadata boundary
└── previews / thumbnails
```

An `AssetDefinition` stores stable Project/Canvas/Layer/Frame/Cel references, region,
animation mapping, pivot, protection, metadata, and dependency IDs. It never embeds pixel
buffers, audio blobs, credentials, or a second canonical Project. The lifecycle is:

```text
LOCAL_DRAFT
  → VALIDATED_DEFINITION
  → PXD AssetDefinitions
  → Registry Bridge (external identity/authorization)
  → REGISTERED_ASSET
```

`REGISTERED_ASSET` is not stored as a second source Asset inside the PXD. If an external Registry
identity exists, the PXD may retain an explicit `registryIdentity` mapping (`assetId` and
`revisionId`) while the PXD definition remains the source reference. Removing or changing a
Registry mapping must not delete or rewrite the PXD source definition.

The editor may use IndexedDB journals, OPFS chunks, caches, checkpoints, and immutable blobs while
editing. Those are implementation details. Save/export materializes the logical source container
to one `.pxd`; it does not require rewriting a monolithic file on every pointer sample.

There are no required user-facing `.pxasset` or `.pxproject` files for this workflow. Those names
remain historical/architectural package concepts only. External delivery, sale, backup, or
cross-project transfer may materialize a PiXiPackage, PNG, GIF, sprite sheet, audio file, or other
export from the PXD source.

## Package layers

```text
PiXiPackage
├── Manifest
│   ├── packageId / projectId / owner
│   ├── packageKind / schemaVersion / archiveVersion
│   ├── rootProjects / rootAssets / rootBuilds
│   └── createdBy / compatibleTools / capabilities
├── Project State
│   ├── Draw project and raster/timeline references
│   ├── Audio project, notes, mixer/effect references
│   ├── Game scenes, entities, event sheet, visual graph, scripts
│   ├── Camera, video, timeline, animation and sync metadata
│   └── Input map, control UI, collider guide, physics/runtime references
├── Asset Graph
│   ├── Asset IDs and immutable Revision IDs
│   ├── origin, consumers, derivations, dependencies
│   └── LIVE / PINNED / REVIEW / FORKED reference edges
├── Content and Storage
│   ├── content hashes and byte sizes
│   ├── reference manifest entries
│   └── optional embedded immutable Blobs
├── Journal and Checkpoints
├── Dependency Lock
├── License and Provenance Snapshot
├── Previews and export metadata
└── Integrity attestations / signatures
```

The manifest is the index and contract. It is not a mutable bag of all runtime bytes. Project
edits update immutable Asset Revisions and append commands to the journal; checkpoints provide a
bounded recovery base. A package export resolves the graph into either reference or embedded form.

## Project-time storage

During editing, the Core keeps data separated:

```text
Project Manifest
  → Project State and Asset Graph references
  → immutable Draw / Audio / Game / Video / Input Asset Revisions
  → Journal
  → Checkpoint
```

Editing a Draw Asset creates a new Draw Revision and updates only the selected reference edge. It
does not rewrite a full game or audio package. Editing Audio follows the same rule. Game-side
presentation properties (position, scale, tint, animation binding, mix level, timeline placement)
remain reference settings; editing source pixels or source audio opens the owning Draw2 or Audio
project and creates a source Revision.

## Reference modes

Every consuming edge MUST declare one mode:

| Mode | Meaning | Safe default |
| --- | --- | --- |
| `LIVE` | Follow the latest compatible Revision after validation. | Development Preview only. |
| `PINNED` | Use one exact Revision and hash. | Published/sold versions and purchase entitlements. |
| `REVIEW` | Detect a candidate Revision but require approval before the consumer changes. | Shared preview and staged release. |
| `FORKED` | Create a new Asset lineage from the source Revision for independent editing. | Derivative work with separate rights. |

`LIVE` MUST NOT silently alter an already published Product, purchased build, entitlement, or
license snapshot. A publication or sale operation converts all required edges to `PINNED` and
writes a Dependency Lock. `REVIEW` records proposed changes and the approving actor. `FORKED`
records `derived_from`, source hash, license basis, and the new owner/editor scope.

## Two materialization forms

### Lightweight reference package

```text
Manifest
＋ Project IDs and State snapshots
＋ Asset IDs and Revision IDs
＋ content hashes and sizes
＋ Dependency Lock
＋ License/Provenance Snapshot
```

The Core resolves immutable Blobs by authorized reference. This form is for collaborative editing,
live previews, and small project handoffs. A missing or unauthorized Blob is a visible recovery
error, never an empty substitute.

### Complete embedded package

```text
Manifest
＋ Draw / Audio / Game / Video / Input data
＋ required immutable Blobs
＋ Journal and selected Checkpoints
＋ Dependency Lock
＋ License/Provenance Snapshot
＋ hashes and integrity attestations
```

This form is for offline backup, cross-device transfer, long-term archive, and distribution. It
MUST be self-consistent: every required reference resolves to an embedded entry or an explicitly
locked external dependency. It MUST NOT embed credentials, private session tokens, or unverified
payment secrets.

## Complete game and Market package

A distributable game package MUST contain or lock every runtime-required dependency:

```text
Game Project / Scene / Runtime
＋ Draw Asset Revisions
＋ Audio Asset Revisions
＋ controls and input map
＋ collider/physics/runtime references
＋ Dependency Lock
＋ License Snapshot
＋ package hash and build provenance
```

The Market Product references this immutable package revision. Existing products are projected into
the new Product/Package/License model without rewriting historical purchase, entitlement, royalty,
payout, or URL records. If a source Asset is later deleted or unpublished, a purchased package
continues to resolve from its locked embedded or entitlement-authorized dependency.

## Legacy adapters

```text
Current .pxd
  → legacy PXD reader
  → lossless Draw2 Project/Asset Revision import
  → original source retained

Integrated PiXiPackage
  → supported-subset Draw export adapter
  → current PiXiEEDraw-readable .pxd
  → explicit unsupported-data report
```

The import MUST preserve canvas, pixels, palette, layer, frame, duration, transparency, and
animation semantics. The original file remains available until the converted project passes the
fixture/hash/visual compatibility gate. Exporting an integrated package to current PXD MUST never
silently discard Audio, Game, Video, Input, License, or Dependency data; unsupported sections are
reported and remain in the source package.

## Versioning and integrity

`schemaVersion`, `archiveVersion`, `packageVersion`, and current PXD `version` are independent
fields. An unsupported version fails explicitly. Migration writes a new destination and retains
the source. Each immutable entry has a content hash; each package has a canonical manifest hash;
each published Product has a Dependency Lock and License Snapshot. Hash equality is not permission
to delete a source or dependency.

## Required gates

- legacy PXD open/import/export round-trip;
- Draw2, Audio, Game, video, and control reference resolution;
- LIVE/PINNED/REVIEW/FORKED state transitions;
- lightweight and complete package consistency;
- corrupted, missing, unauthorized, unsupported-version, and dependency-cycle rejection;
- purchased package survival after source unpublish/delete;
- no historical financial or entitlement rewrite;
- no production migration or public cutover before owner approval and rollback proof.
