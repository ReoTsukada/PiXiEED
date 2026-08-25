# ADR-20260807-WP099 — Draw2 Performance and Architecture Gate

- Status: accepted as mandatory pre-WP-100 gate; external audit required
- Scope: WP-099 and WP-100–WP-190 completion criteria
- Date: 2026-08-07

## Context

PiXiEEDraw2 will replace neither the current PiXiEEDraw nor current PXD/PiXiSYNC behavior until
compatibility gates pass. Performance cannot be repaired safely after an editor state, renderer,
storage, and UI architecture has already coupled. The supplied WP-099 decision requires a
lightweight, local-first, tile-aware, Worker-ready, fallback-safe design before WP-100 begins.

## Decision

Adopt four mandatory artifacts: High Performance Implementation Contract, Technology Selection
Gate, Device and Workload Matrix, and Bundle/Memory/Worker Budgets. Add a versioned Benchmark
Result Schema and Fixture Catalog. Use exact latency gates of p95 input→visible `<=24ms` desktop,
`<=32ms` mobile, Long Task over 50ms as a release failure, and duplicate reference `<=10ms`.
Do not assign arbitrary byte budgets; derive them from measured reference builds and dependencies.

Canonical pixels use indexed `Uint8Array` values (`0` transparent, `1..255` palette). Tile/COW,
dirty invalidation, virtualized timelines, component memory metrics, Worker ownership, backend
equivalence, autosave durability, and crash/fallback behavior are mandatory evidence.

Technology remains unselected until identical fixture/device/browser/warm-cold/build measurements
exist. WebGPU is optional with Feature Detect + Benchmark Win + Safe Fallback. Wasm requires a
measured hotspot benefit after bridge/copy overhead. SharedArrayBuffer requires isolation and
third-party impact review plus a non-SAB fallback.

## Consequences

WP-099 can define and validate the contract without implementing Draw2. WP-100 Context may be
generated, but WP-100 implementation must stop at `EXTERNAL_AUDIT_REQUIRED`. Missing real-device
or browser evidence is `UNTESTED`, never a passing result. Current Draw, PXD, PiXiSYNC, Market,
Routes, Projects, Assets, Packages, Database, Storage, and production data remain unchanged.
