---
contract_id: WP-100-PIXEEDRAW2-VERTICAL-SLICE
status: IMPLEMENTED_ISOLATED_VERTICAL_SLICE
version: 1.0.0
updated: 2026-08-07
---

# WP-100 PiXiEEDraw2 Vertical Slice

WP-100 implements the first isolated Draw2 Project open/create and one-pixel editing path. It is
not a production replacement and does not change the current `pixiedraw/` route.

## Canonical path

```text
Pointer
  → typed Command Envelope
  → validate
  → persistent/shared Canonical Project State
  → indexed sparse Tile mutation with affected-Tile COW
  → Dirty Tile Set / Dirty Region
  → Renderer Adapter projection
  → local Journal + dirty Tile write + periodic verified Checkpoint seam
```

The Core in `pixiedraw2/src/draw2-core.ts` has no DOM, Canvas, UI-framework, Network, IndexedDB,
OPFS, Supabase, or production PXD dependency. `draw2-entry.ts` is the browser-only projection.
The current Reference Renderer is exchangeable; Tile size remains a runtime fixture choice and is
not an architecture decision.

## Guardrails

- Canonical pixels are indexed `Uint8Array`, transparent `0`, palette `1..255`, one byte/pixel.
- Missing sparse Tiles read as transparent and do not allocate a full Canvas buffer.
- Duplicate edits share immutable Tile buffers; only affected shared Tiles split by COW.
- Command payloads are deterministic, versioned, bounded, validated, and Blob-free.
- Active Editing Long Task scope is pointer/drawing/selection/transform/timeline/layer/routine
  autosave and routine collaboration. Import/Export/Package Build use separate Worker,
  Progress, Cancellation, Chunking, and Heavy Task budgets.
- `UNTESTED`, `UNVERIFIED`, missing/invalid benchmark, unavailable device, and unavailable browser
  never become `PASS`. WP-100 records no performance PASS.
- Tile size, Canvas2D/WebGL2, OffscreenCanvas, WebGPU, Wasm, SharedArrayBuffer, and Worker
  topology remain `DECISION_PENDING` until identical fixture/device/browser measurements and an ADR.
- Local editor state uses `LOCAL_ONLY`; no production sync, PXD migration, database, Storage,
  Route, Market, PiXiSYNC, Project, Asset, Package, purchase, entitlement, license, or royalty
  path is connected.

## Current implementation boundary

`pixiedraw2/index.html` is a noindex isolated Entry. It provides Project ID open/create, a local
256×256 Indexed Raster viewport, palette selection, one-pixel commands, local autosave readiness,
and status metrics. It is not connected to public Navigation and does not claim device performance.
