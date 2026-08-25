# ADR-20260807-WP120 — Isolated Selection, Transform, and Clipboard Core

- Status: accepted for isolated WP-120 implementation
- Scope: `pixiedraw2/` Core and its isolated Reference Entry only
- Date: 2026-08-07

## Context

Draw2 needs selection, pixel-art transforms, and clipboard operations without allowing a
temporary Preview to become Canonical Raster state. The current production Draw/PXD/PiXiSYNC
contracts must remain untouched while the new Editor Core is built.

## Decision

Keep Selection as a versioned sparse local projection with explicit layer/frame/cel scope. Keep
the Canvas overlay separate from Canonical Raster. Use a typed `TransformSession`; Preview is
read-only and Commit is one bounded canonical operation. Use indexed nearest-neighbor math and
initial `CLIP` bounds policy; reject canvas expansion until a separately reviewed contract exists.

Use shared Project/Raster state and split only affected existing Tiles on mutation. This gives
source/destination dirty locality and preserves the prior state for local atomic Undo/Redo.
Represent internal Clipboard data as a bounded indexed payload. Treat system Clipboard as a
future adapter, and reject palette mismatch rather than silently remapping colors.

The current file placement is intentionally an isolated Draw2 implementation, not a production
route change. The Core module has no DOM, Canvas, Network, IndexedDB, OPFS, Supabase, PXD, or
PiXiSYNC dependency; the Entry is the only projection and local journal seam.

## Consequences

Preview can be cancelled without a state or history mutation, stale sessions fail closed, and
deterministic pixel operations can be compared by hash. Rectangle selection currently materializes
the bounded selected pixel list; future freehand/magic/alpha/multi-region masks can reuse the
same mask contract without requiring a full-canvas mask. OS clipboard integration and full
compositor/device performance remain explicit follow-up work.
