# WP-170 Advanced Draw2 Tool Contract

## Canonical pipeline

```text
Input → Tool Session → deterministic pixel operation
      → Canonical Command → sparse/COW raster mutation
      → dirty Tiles/Regions → Renderer Projection
```

The UI is an adapter. Pointer samples, hover, zoom, local panel state, preview, and ruler hover
are `LOCAL_ONLY`. A committed shared structural operation is `ACTIVE_SYNC`; Asset Revision and
Package events are `PLATFORM_EVENT`; discovery and future Market work is `ASYNC_ON_DEMAND`.

## Raster tools

- Pattern Brush: source pixels, anchor, repeat policy, transparent behavior, clipping, palette
  indexes, sample-frequency-independent Bresenham interpolation, and affected Tile reporting.
- Stamp: immutable pixel source, nearest-neighbor scale, palette compatibility, selection-safe
  clipping, Preview/Cancel/Commit, and one atomic undo operation.
- Mirror: horizontal/vertical/both, integer or half-pixel axis in doubled coordinates, clipping,
  duplicate suppression, and conflicting-write rejection.
- Dither: versioned Bayer 2×2/4×4 presets, deterministic amount, bounded region, cancellation,
  preview/commit separation, and `MEASURE_AFTER_BOUNDARY` Worker candidate for large writes.
- Palette: index 0 transparent and protected, maximum 256 entries, explicit add/remove/reorder,
  atomic remap, and no silent color dropping or appearance changes.

## Non-raster domains

Grid, Ruler, Guide, Reference Image, and Slice are Projection/Overlay state. Overlay invalidation
is domain-specific; toggling Grid never rebuilds the raster. Guides have stable identity and
duplicate/bad-coordinate rejection. Reference Images require owned Asset/Revision IDs and reject
external URLs. Slice bounds fail closed and metadata changes do not change raster hashes.

Animation Tags reference stable Frame IDs and reject deleted frames without silent repair. Tile
Maps reference Tile Assets and revisions by placement; repeated instances are not full raster
copies and dependency cycles/missing Assets fail closed. Game Asset Metadata is separate from
raster data and rejects unknown fields pending review.

## Package preparation

Preparation stores included immutable Asset/Revisions, dependency snapshot hash, integrity hash,
preview candidates, compatibility, `PackageKind`, and separate `SaleKind` (`MATERIAL` or
`FINISHED_PRODUCT`). It ends at `PREPARATION_ONLY`; it has no price, fee, royalty, purchase,
entitlement, or Market publish operation.

## Compatibility and release

The Legacy PXD/Draw/PiXiSYNC adapter remains lazy and read-only. The current site, current Draw,
existing PXD, existing URLs, Market, database, Storage, and production data are outside this
WP. Feature flags remain OFF and the isolated entry remains disconnected from public navigation.
