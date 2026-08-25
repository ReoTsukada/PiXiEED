# ADR-20260808: PiXiEEDraw2 structural timeline boundary

- Status: Accepted for isolated WP-130 reference implementation
- Scope: `pixiedraw2/` only
- Date: 2026-08-08

## Decision

Model Layer Tracks, Frames, Cels, Timeline order, and raster backing as
separate canonical records with stable typed IDs. Mutations use versioned
structural commands and produce bounded dirty-domain results. Timeline UI
scroll/selection/hover/zoom and playback are projections/session state.

Frame duplication uses shared raster backing and affected-tile Copy-on-Write;
an empty Cel has no raster allocation. Onion Skin is a neighboring-frame
renderer projection and cannot mutate canonical state.

## Reasons

This follows the WP-100/110/120 Reference Core contracts and the mandatory
PiXiEEDraw2 Product Specification. It prevents array-index identity drift,
avoids full raster/timeline cloning, preserves exact structural Undo/Redo, and
leaves a narrow adapter seam for future Journal/PiXiSYNC/storage integration.

The existing production PiXiEEDraw and its PXD/PiXiSYNC contracts are not
rewritten. The new entry remains feature-flagged off and isolated, so the
implementation can be compared against the existing behavior before any
replacement decision.

## Rejected alternatives

1. **Array-index-only timeline state** — rejected because reorder/delete would
   change identity and make sync, undo, and compatibility unsafe.
2. **Full raster clone per duplicate Frame** — rejected because it violates the
   sparse/COW memory model and scales with canvas size rather than changed
   tiles.
3. **UI state in Canonical Project State** — rejected because personal scroll,
   selection, and hover would create unnecessary PiXiSYNC conflicts.
4. **Direct writes to current PiXiSYNC/PXD/storage** — rejected for WP-130;
   the adapter seams are defined but production integration is explicitly
   deferred.

## Consequences

The isolated Core now carries additional typed structural records and command
validation. The UI has a virtualized timeline with accessible native buttons
and non-drag reorder controls. Device performance, full compositor behavior,
long sessions, and production adapters remain explicit follow-up gates rather
than implied completion.

## Evidence

- `pixiedraw2/src/draw2-timeline.ts`
- `pixiedraw2/tests/core.test.ts`
- `pixiedraw2/benchmarks/run-timeline-structure-benchmark.ts`
- `docs/contracts/WP-130-TIMELINE-STRUCTURE.md`
