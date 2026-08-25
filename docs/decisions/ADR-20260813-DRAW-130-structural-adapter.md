# ADR-20260813 — DRAW-130 Structural Adapter Boundary

## Decision

Layer, Frame, Cel, Timeline, Onion Skin, Playback, and virtualized projection
are implemented under `pixiedraw2/src/draw2/draw-130/`. Structural mutations
reuse the Draw2 `ProjectState`, `structureEpoch`, shared snapshots, deterministic
operation IDs, and one-operation/one-Undo contract. Onion Skin and Playback
remain projection-only.

## Rationale

This enables the Desktop Timeline, Tablet panel, and Mobile bottom sheet to
share one structure model while avoiding full-grid materialization and avoiding
pixel or Workspace rerendering during projection-only changes.

## Boundary and follow-up

The current Draw2 Core command union has raster/palette execution authority;
DRAW-130 keeps structural execution in this bounded adapter until a later Core
schema convergence package. PXD export/import will consume this structure in
DRAW-140. No current PiXiEEDraw route, PXD implementation, PiXiSYNC transport,
Market, Storage, production provider, or native host is modified.
