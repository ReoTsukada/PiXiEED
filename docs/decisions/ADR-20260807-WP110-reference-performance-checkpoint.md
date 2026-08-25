# ADR-20260807-WP110 — Reference Performance Checkpoint Boundary

- Status: accepted for the WP-110 pre-feature checkpoint; formal performance gate remains untested
- Scope: isolated `pixiedraw2/` Reference Path only
- Date: 2026-08-07

## Context

WP-100 was approved with performance and technology decisions explicitly unmeasured. Before
adding pen, eraser, fill, palette, or timeline features, the current Reference Path must prove
that a one-pixel edit is local. The browser host is available for measurement, but its device
model is not available and the mobile-sized fixture is desktop-simulated.

## Decision

Use a dirty-region Reference Renderer path for active editing. `IndexedTileRaster.readRegion()`
serves only the requested region; `toUint8Array()` and full SHA-256 remain explicit Golden
verification operations. Record 40 samples for 512×512 and 256×256 Core-slice fixtures, COW
32/64, sparse 1024×1024, deterministic hashes, tile workload comparisons, Browser Canvas
present, Long Task observer, resource requests, and local bundle compression.

Keep the formal result `UNTESTED` when actual device identity, real mobile, complete layer/frame
compositor coverage, or the required cross-device matrix is absent. Keep Tile size, Renderer,
Worker topology, OffscreenCanvas, WebGPU, Wasm, and SharedArrayBuffer unselected. Fill and
Composite remain reserved fixtures until their WP-110 implementation exists.

## Consequences

The active one-pixel path no longer performs a full raster read for Canvas presentation. This is
an isolated Core/Entry change and does not alter the current production Draw, PXD, PiXiSYNC,
Market, Routes, or data. The checkpoint provides evidence for the next feature implementation;
it does not authorize production integration or a performance PASS.
