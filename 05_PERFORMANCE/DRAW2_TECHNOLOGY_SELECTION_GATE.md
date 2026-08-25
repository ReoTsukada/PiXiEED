---
spec_id: PERF-DRAW2-TECHNOLOGY-GATE-001
title: Draw2 Technology Selection Gate
status: MANDATORY_GATE
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
---

# Draw2 Technology Selection Gate

Technology is selected by measured workload evidence, compatibility, fallback safety, bundle and
memory impact, operational complexity, and security—not by being modern, latest, or fastest in
one synthetic run.

## Candidate comparison

The harness may compare Canvas2D, OffscreenCanvas, WebGL2, WebGPU, JavaScript/TypeScript,
Rust/Wasm, Worker, SharedWorker, Transferable, and SharedArrayBuffer. Every comparison uses the
same Fixture, Device Class, actual device, browser/version, OS, warm/cold condition, measurement
boundary, iterations, and build.

Include JS/TS baseline and all bridge/serialization/memory-copy overhead. A technology is not
selected from a p95 improvement that loses correctness, recovery, accessibility, bundle, or
memory gates.

## WebGPU

WebGPU is never a Canonical Renderer requirement. It may be an accelerated presentation backend
only when Feature Detect, Benchmark Win, and Safe Fallback all pass. Unavailable, device-lost, or
initialization-failure paths fall back to Canvas2D/WebGL2 or another verified backend without
changing Project State.

## Wasm and SharedArrayBuffer

Rust/Wasm requires a measured hotspot benefit after bridge, serialization, allocation, and copy
overhead. SharedArrayBuffer requires `crossOriginIsolated`, COOP/COEP and third-party integration
review, actual benchmark evidence, and a fully working non-SAB fallback. Neither is required by
WP-099 and neither is marked selected without evidence.

## Gate status

WP-099 records the candidates and method as `UNTESTED`/`AUDIT_REQUIRED`; it does not fabricate a
winner from the current Developer Mac. Technology ADRs are required when a backend is selected.
