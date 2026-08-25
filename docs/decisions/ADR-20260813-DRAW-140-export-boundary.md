# ADR-20260813 — DRAW-140 Export Boundary

## Status

Accepted for isolated reference implementation.

## Decision

Keep the existing DOM/network-free Draw2 exporter as the implementation
authority and expose it through a DRAW-140 package adapter. Do not merge the
new PXD v1 container with the current PiXiEEDraw archive-v2 reader/writer.
The exporter is deterministic, local-only, hash-verified, and fail-closed.

## Consequences

PNG/PXD export/import can be tested without current routes or production data.
The current PXD remains untouched. Real-file and device qualification are
separate evidence gates, not inferred from synthetic fixtures.
