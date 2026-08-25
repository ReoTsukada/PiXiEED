---
contract_id: WP-120-SELECTION-TRANSFORMS
status: IMPLEMENTED_ISOLATED
version: 1.0.0
updated: 2026-08-07
---

# WP-120 Selection / Transform / Clipboard Contract

## Boundary

WP-120 is implemented only under `pixiedraw2/`. The current PiXiEEDraw route, PXD, PiXiSYNC,
Market, existing Projects/Assets, public URLs, production Database/Storage, and public
Navigation are not loaded or mutated.

## Selection

- Selection is a local projection represented by bounded sparse `SelectionRegion[]` plus selected
  indexed pixels. It is not stored as a full-canvas boolean mask.
- `SelectionSnapshot` carries `selectionId`, `SelectionMask.kind`, regions, `selectionVersion`,
  `sourceRasterRevision`, `sourceStructureEpoch`, and explicit `assetId/layerId/frameId/celId`.
- A transform has an explicit active cel scope. It never implicitly edits every layer or frame.
- Overlay rectangles and transform Preview pixels are presentation projections; they do not mutate
  Canonical Raster, Journal, Revision, or transport state.

## Transform

Supported deterministic operations are `MOVE`, horizontal/vertical flip, 90-degree clockwise
rotation, and integer scale 1..8. The only interpolation authority is
`NEAREST_NEIGHBOR`; Canvas smoothing cannot affect Canonical pixels. Initial out-of-bounds policy
is `CLIP`. `CANCEL` fails closed and canvas expansion is explicitly unsupported.

`TransformSession` binds session ID, selection/raster/structure versions, typed transform,
preview/destination bounds, and status. A stale or duplicate commit is rejected. Preview has
`metricScope=PREVIEW_ONLY`, zero canonical dirty tiles/regions, and no journal entry. Commit
creates one `selection.transformCommit` operation and reports `metricScope=COMMAND_TO_DIRTY`.

## Clipboard

The internal clipboard is a bounded versioned `PIXIEEDRAW2_CLIPBOARD` payload with dimensions,
origin, indexed pixels, palette, source Asset/Selection version, and optional sanitized
provenance. Dimension, pixel-count, origin, palette-index, duplicate-pixel, unsafe-provenance,
and transparency violations fail closed. Commands never carry a Base64, Blob, or unbounded full
document.

The browser/system Clipboard API is not a Core dependency. An OS clipboard adapter remains a
future boundary and must validate into this payload before Core use. Paste accepts an exact
palette match only; remap, extension, overflow, and incompatible results are reported and never
silently nearest-color converted.

## Mutation, history, and recovery

- Only Commit, Cut, and Paste mutate Canonical Raster.
- Copy and Preview are local and do not enter the Journal in the isolated UI.
- Source and destination dirty regions are reported separately; only affected shared Tiles are
  Copy-on-Write split. No Preview COW split or full-canvas clone is used.
- Transform/Cut/Paste Undo and Redo are one local user action. Cancel is not history and restores
  no state because it never mutates state.
- Duplicate, stale selection/raster/structure, invalid transform, malformed clipboard, palette
  mismatch, out-of-bounds `CANCEL`, and unsafe provenance fail closed before mutation.

## Verification boundary

The Core suite has 13/13 passing tests. Synthetic sparse fixtures cover 256, 512, and 1024
rasters. Playwright covers 390x844 and 1280x900 for selection, Preview, Cancel, Commit, Copy,
Cut, Paste placement, keyboard activation, focus, Undo, Redo, overflow, and page errors.
The measured Preview path is local synthetic evidence; real-device input-to-visible, full
layer/frame compositor, long-session memory, backend equivalence, and OS Clipboard integration
remain UNTESTED.
