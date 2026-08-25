---
spec_id: ARCH-ASSET-001
title: Unified Asset Graph
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
audience: AI_AGENTS
normative_language: MUST_SHOULD_MAY
depends_on:
  - ARCH-PLATFORM-001
tags:
version: 0.1.0
updated: 2026-08-07
---

# Unified Asset Graph

## NODE TYPES

- `pixel.sprite`
- `pixel.palette`
- `animation.clip`
- `tile.tileset`
- `tile.map`
- `collision.shape`
- `rig.skeleton`
- `physics.profile`
- `voxel.model`
- `audio.clip`
- `audio.song`
- `game.scene`
- `game.behavior`
- `ui.document`
- `extension.package`
- `export.profile`
- `build.artifact`
- `license.record`
- `market.product_version`

## EDGE TYPES

- `depends_on`
- `derived_from`
- `uses_palette`
- `uses_animation`
- `exports_to`
- `licensed_from`
- `contains`
- `runtime_binds`
- `replaces`
- `version_of`

## INVARIANTS

- Asset IDs MUST be stable UUIDs.
- Asset versions MUST be immutable after publication or sale.
- Mutable drafts MUST point to immutable content blobs.
- Cycles MUST be rejected unless explicitly supported by a typed runtime reference.
- Build cache keys MUST include input content hashes, tool version, configuration hash, and target.
- Deleting an asset MUST be blocked or converted to a tombstone when dependents exist.

## CONSUMER REVISION MODES

Every consumer edge MUST explicitly declare one of the Core package modes:

```text
LIVE    → latest compatible revision for development preview
PINNED  → one immutable revision/hash for publication, sale, or entitlement
REVIEW  → candidate revision awaiting an approving actor
FORKED  → new lineage with derived_from and independent rights
```

`LIVE` is never allowed to mutate a published or purchased package. A Product/Build publication
creates a Dependency Lock and converts required edges to `PINNED`. A `FORKED` edge creates a new
Asset ID or explicit derived revision according to the rights contract; it does not let Game or
Audio mutate the source Draw asset in place.

## CROSS-TOOL ASSET EXAMPLE

```text
Draw2 Project
  → Character Asset / Revision 2
  → Game Scene reference (LIVE during development)
  → Audio BGM reference (REVIEW until approved)
  → Build 1.0 references (PINNED)
  → Market Product dependency lock
  → SNS Market Card reference
```

The graph stores origin, consumers, revision/hash, compatible tools, dependency locks, license
snapshot, and recovery status. A missing or unauthorized referenced Blob is a typed recovery error;
it is not replaced with an empty asset.

## WP-092 Asset Registry boundary

The canonical Asset Registry implements this graph as an unloaded Core contract. Asset identity,
immutable AssetRevision metadata, verified content-addressed Blob references, Dependency edges,
Provenance, and LIVE/PINNED/REVIEW/FORKED policy are kept separate from Project Registry metadata.

The Registry never stores Blob bytes, Base64/Data URLs, PXD/package bodies, Journal/Checkpoint,
full Editor State, Post content, payment, purchase, entitlement, license body, royalty, or
Commission data. A trusted verifier proves Hash, size, and MIME before a Revision is `VERIFIED`.
Existing `core-asset-graph-utils.js` remains a WP-040 host adapter; the WP-092 pure contract is
`core-shell/assets/core-asset-registry-contracts.js` and is not loaded by current routes.
