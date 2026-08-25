# ADR-20260813 — DRAW-110 Reuses the Draw2 Canonical Core

## Decision

DRAW-110 adds a bounded adapter under `pixiedraw2/src/draw2/draw-110/` and
delegates all canonical mutation to the existing Draw2 Core.

## Consequences

The adapter can evolve from isolated reference tests to Browser and Native
presentation hosts without changing PXD, Project, Asset, Revision, Undo, or
PiXiSYNC semantics. It also keeps the pointer hot path local: temporary tools,
viewport movement, and presentation choices do not write Canonical Project
State.

## Rejected alternative

Creating a separate Raster/History model for the new editor would make later
Selection, Timeline, PXD, and cross-tool adapters reconcile two incompatible
authorities. That is explicitly rejected.

