---
spec_id: PERF-DRAW2-BUNDLE-MEMORY-WORKER-001
title: Draw2 Bundle Memory and Worker Budgets
status: MANDATORY_GATE
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
---

# Draw2 Bundle, Memory, and Worker Budgets

## Bundle boundary

The initial Draw2 route contains only bootstrap, Editor Core, essential raster editing, required
accessibility/UI primitives, and the smallest verified renderer boundary. Lazy-load advanced
export formats, voxel, physics-assisted animation, AI/background processing, uncommon converters,
Market, Social, Game Build, Audio Editor, large help/documentation, unused icons, and extension
code. The exact byte budget is derived from the WP-099 reference build, existing isolated Shell
baseline, dependency measurements, and real build output; this document deliberately does not
invent an arbitrary number.

After the measured budget is approved, WP-100+ CI treats it as an automatic regression gate.
Route-level lazy loading and unauthorized-chunk request checks remain mandatory.

## Memory budget dimensions

Record canonical raster, decoded Tiles, composite cache, preview cache, Undo, Worker transfers,
COW shared bytes, COW split count, active Frame, inactive/cold Tiles, and measurable OPFS cache
bytes. Evict only in this order: disposable preview cache, thumbnails, inactive composites,
decoded persisted cold Tiles. Never evict unjournaled mutation.

## Worker contract

Worker use is workload-specific and benchmarked. Prohibit Worker-per-operation creation, repeated
tiny structured clones, full-Canvas-per-Stroke transfer, giant object graph round trips, and
redundant pixel copies. Prefer Transferable where ownership is explicit. A Worker crash keeps
Canonical State, leaves uncommitted operations unconfirmed, and supports fallback/retry.

## Status

WP-099 defines the dimensions and measurement gate. Actual budgets and technology selection remain
`AUDIT_REQUIRED`; absent actual device/browser evidence is explicitly `UNTESTED` until the
reference-build and device evidence are independently reviewed.
