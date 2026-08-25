# ADR-20260813 — DRAW-150 Legacy Read-only Boundary

## Status

Accepted for isolated reference implementation.

## Decision

Keep current PiXiEEDraw Legacy PXD archive-v2 behind a read-only, lazy adapter.
Import always creates a new Draw2 working copy and preserves source bytes and
hash. The adapter must not import or call the Draw2 PXD v1 exporter.

## Rejection policy

Unknown or unsupported data is review/unsupported, never silently flattened.
All untrusted archive and bitmap inputs are bounded and fail closed. Current
routes, PXD storage, PiXiSYNC, Market, and production data are outside scope.
