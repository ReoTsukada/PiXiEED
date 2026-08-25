# ADR-20260808: WP-170 Advanced Draw2 Tool Core

- Status: Accepted for isolated WP-170 implementation
- Date: 2026-08-08
- Scope: `pixiedraw2/` only

## Context reconstruction

The repository did not contain `09_ROADMAP/WORK_PACKAGES/WP-170.md` when the approved
WP-160 audit handed work to WP-170. The old prompt described only a Draw/Draw2 bridge and
did not include the approved Advanced Draw2 feature direction. The roadmap was reconstructed
from the supplied approval, the existing Draw2 product/performance contracts, and the existing
WP-150 compatibility boundary. WP-000 through WP-160 remain complete and were not re-run.

## Decision

Implement the advanced feature layer as a DOM-free deterministic planner plus a separate lazy
Editor Adapter. Pattern Brush, Stamp, Mirror, Dither, Palette Remap, and future raster tools
produce a bounded `AdvancedOperation` containing deduplicated pixel writes, affected regions,
dirty Tiles, transport class, and an atomic undo boundary. `raster.writeSet` is the single
EditorCore bridge for a mixed-color operation.

Grid, Ruler, Guide, Reference Image, Slice, and tool previews remain Overlay/Projection state.
They cannot mutate raster pixels or enter PiXiSYNC as incidental local UI state. Reference Images
use owned Asset/Revision identities and reject external URLs. Tile Maps retain Tile Asset
identity and placement references; they are never flattened to a large RGBA canvas.

Package preparation computes an immutable dependency snapshot and integrity hash. It records
separate `PackageKind` and `SaleKind`, but does not contain prices, fees, royalties, purchases,
entitlements, or publish behavior.

## Aseprite comparison boundary

| Area | Aseprite baseline | WP-170 result | State |
| --- | --- | --- | --- |
| Pattern/Stamp | repeatable source, preview/place/cancel, atomic action | deterministic source/anchor/repeat, preview session, cancel/commit contract | PASS Core / UI parity UNTESTED |
| Mirror | horizontal/vertical symmetry with predictable axis | half-pixel-safe axis, clipping, conflict/deduplication | PASS Core |
| Dither | pixel-art pattern operation | versioned Bayer presets, preview/commit, cancellation, worker candidate | PASS Core / device UNTESTED |
| Palette | indexed colors with transparent index | index 0 protected, 256 cap, explicit reorder/remap | PASS Core |
| Timeline/Tags | Layer × Frame × Cel and animation ranges | stable Frame IDs and fail-closed Animation Tags | PASS Core / full UI parity UNTESTED |
| Grid/Guides | visual aids separate from pixels | separate Overlay domains and invalidation | PASS Core |
| Mobile | desktop workflow is not merely shrunk | Canvas-first isolated adaptive surface | PARTIAL; device/touch UNTESTED |

Aseprite is an interaction reference, not a dependency or copied implementation. Shortcut,
temporary-tool, dock/panel, and full parity audits remain an explicit later UI/device gate.

## Rejected alternatives

- Adding each advanced tool directly to `draw2-entry.ts`: rejected because UI would own
  canonical state and the initial bundle would grow transitively.
- Rewriting full canvases for palette or tile operations: rejected because sparse/COW and dirty
  locality are required for 256×256 through 512×512 workloads.
- Treating guides/references as raster pixels: rejected because visual preferences and editable
  content have different persistence and sync semantics.
- Publishing Package preparation directly to Market: rejected because sale, entitlement,
  license, and publish are separate platform boundaries.

## Consequences

The pure Core is testable without a browser and the advanced chunk is lazy. The local synthetic
512×512 dither and 1000-frame stress fixtures expose Long Task candidates; worker migration,
real devices, GPU/compositor, long sessions, and production compatibility remain UNTESTED.
