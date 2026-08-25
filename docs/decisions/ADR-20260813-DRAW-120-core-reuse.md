# ADR-20260813 — DRAW-120 Reuses the Draw2 Core Write-Set Contract

## Decision

Selection, transform, cut, and paste are implemented as a bounded adapter under
`pixiedraw2/src/draw2/draw-120/`. The adapter keeps selection and transform
preview local, then delegates canonical mutation to the existing
`raster.writeSet` command in `draw2-core.ts`.

## Rationale

This preserves one Project/Raster/Palette/Command/Undo authority while allowing
Desktop direct manipulation, keyboard controls, and Mobile sheets to share the
same behavior. One committed transform or clipboard mutation maps to one
canonical operation and one Undo entry.

## Rejected alternative

A separate selection raster or UI-owned mutation model was rejected because it
would require later reconciliation with Layer/Frame/Cel, PXD, PiXiSYNC, and
cross-tool Asset Graph contracts and would make preview cancellation unsafe.

## Boundary

No current PiXiEEDraw route, PXD implementation, PiXiSYNC transport, Market,
Storage, production provider, or native host is modified or imported.
