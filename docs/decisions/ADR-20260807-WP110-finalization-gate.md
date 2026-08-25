---
adr_id: ADR-20260807-WP110-finalization-gate
status: ACCEPTED_WITH_PARTIAL_PERFORMANCE_EVIDENCE
date: 2026-08-07
---

# ADR: WP-110 finalization evidence boundary

## Decision

Close the WP-110 implementation and product-authority finalization work after adding the
reconstructed product specification, provenance, canonical transparency regression, and an
actual-browser 40-sample smoke record. Keep performance status `PARTIAL_UNTESTED`/`UNTESTED`
because the available harness measures the isolated Core slice rather than the full
512×512/20-layer/120-frame compositor and cannot identify a real device model.

## Rationale

The smoke proves the measured reference path and records p50/p95/max, affected Tile/Region/
Layer/Frame, memory categories, Long Tasks, browser identity, and resource requests. It does
not prove the unmeasured device, full compositor, long-session, backend, or mobile rows. The
browser-sized 256×256 run is therefore explicitly `DESKTOP_BROWSER_MOBILE_VIEWPORT`, never
real-mobile evidence.

## Consequences

- WP-110 remains complete as an isolated implementation with truthful performance status.
- WP-120 Context may be regenerated as a handoff artifact, but WP-120 is not implemented or
  auto-started.
- Future technology selection must use the same fixture and measured evidence before changing
  Tile, Renderer, Worker, WebGPU, Wasm, or SharedArrayBuffer decisions.
- Existing routes, products, projects, rights, storage, and synchronization boundaries remain
  the rollback path.
