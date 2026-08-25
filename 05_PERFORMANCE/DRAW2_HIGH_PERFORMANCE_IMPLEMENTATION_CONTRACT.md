---
spec_id: PERF-DRAW2-HIGH-PERFORMANCE-001
title: Draw2 High Performance Implementation Contract
status: MANDATORY_GATE
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
depends_on:
  - 02_ARCHITECTURE/COMMAND_ENGINE.md
  - 02_ARCHITECTURE/STORAGE_PLACEMENT_AND_SYNC.md
  - 02_ARCHITECTURE/COST_AWARE_REALTIME_POLICY.md
  - 05_PERFORMANCE/PERFORMANCE_BUDGETS.md
  - 05_PERFORMANCE/RENDERING_PIPELINE.md
  - 05_PERFORMANCE/MEMORY_AND_RASTER_MODEL.md
  - 05_PERFORMANCE/BENCHMARK_AND_PROFILING_PLAN.md
---

# Draw2 High Performance Implementation Contract

This is a mandatory completion contract for WP-100 through WP-190. It is not a suggestion and
does not claim that Draw2 has been implemented. WP-100 must not start until WP-099 has passed
the local contract checks and the external audit gate is resolved.

## Editor Core hard requirements

- Implement the Canonical Editor Core in strict TypeScript with DOM-, Canvas-, UI-framework-,
  and Network-independent state and deterministic operations.
- Renderer backends consume state; they do not own Project State. DOM, Canvas, WebGL, WebGPU,
  Supabase, or a router cannot be the authority for canonical editor data.
- Keep command, Journal, Checkpoint, Asset Revision, and recovery boundaries explicit.
- Preserve current PXD/PiXiSYNC adapters; no compatibility behavior is removed to improve a
  benchmark number.

## Raster, Tile, and invalidation hard requirements

- Canonical indexed raster is transparent `0`, palette `1..255`, `Uint8Array`, one byte/pixel.
  RGBA is a display/GPU upload expansion only.
- Measure 32×32 and 64×64 Tiles using the same fixture/device/browser/condition before choosing.
  Sparse/large Projects may use Tiles; the choice requires an ADR with measured evidence.
- Frame/Cel duplicate uses shared immutable raster/Tiles and affected-Tile Copy-on-Write. The
  default is not a full raster copy; duplicate reference target is `<=10ms`.
- One-pixel change follows `pointer → local preview → command → dirty Tile set → affected
  layer composite → affected viewport → overlays → present`. It must not scan all Frames,
  Layers, Canvas pixels, or Timeline entries.
- Grid, Selection, Guide, Reference, and Onion Skin use separate invalidation domains.

## Main Thread, Worker, and lifecycle hard requirements

Main Thread work is limited to pointer input, focus/keyboard, UI interaction, presentation, and
small orchestration. Fill, Transform, Composite, Encode/Decode, Hash, Thumbnail, Checkpoint,
Package materialization, compression, waveform, and large import/export are Worker candidates
only after benchmark evidence. Do not create a Worker per operation, clone tiny tasks repeatedly,
transfer the entire Canvas per Stroke, bounce giant object graphs, or duplicate pixel buffers.
Buffer ownership and Transferable behavior are explicit. Worker crash, GPU loss, unavailable
WebGPU, and unavailable SharedArrayBuffer keep Canonical State intact, preserve uncommitted status,
and permit fallback/retry.

## Budgets and regression gates

- Desktop fixture: 512×512, 20 Layers, 120 Frames, 60Hz; p95 input→visible `<=24ms`.
- Mobile fixture: 256×256, 12 Layers, 60 Frames; p95 input→visible `<=32ms`.
- Routine drawing Long Task over 50ms is a release failure.
- Thirty-minute editing sessions must show bounded component memory.
- Baseline regression `>10%` requires explicit review; `>20%` blocks release unless separately
  approved. Correctness, accessibility, security, and durability cannot be traded away.

## Local-first and persistence

`LOCAL_ONLY` covers pointer, stroke samples, pixel preview, selection, zoom, Tool State, and
animation ticks. `ACTIVE_SYNC` covers only confirmed collaboration operations and necessary
presence. `PLATFORM_EVENT` carries small committed Asset Revision/Head and meaningful Project
state events. Same-device Draw2→Game uses local transport first. Autosave is Journal + dirty
regions/Tiles + periodic verified Checkpoint; it never performs full PXD serialization per
Stroke, full Checkpoint per change, Base64 autosave, or unchanged-frame writes.

This section is governed jointly by [`02_ARCHITECTURE/COST_AWARE_REALTIME_POLICY.md`](../02_ARCHITECTURE/COST_AWARE_REALTIME_POLICY.md)
and [`02_ARCHITECTURE/STORAGE_PLACEMENT_AND_SYNC.md`](../02_ARCHITECTURE/STORAGE_PLACEMENT_AND_SYNC.md).
IndexedDB remains the structured Journal/Index/Queue boundary, OPFS remains the local large-byte
and cache boundary, the server Database remains confirmed metadata/permission authority, and
Object Storage remains the immutable Blob/Package boundary. High-frequency local editor changes
must not become global Realtime messages or permanent subscriptions.

## Scale and backend equivalence

1000-frame Timelines and large Layer counts require virtualization/windowing; scrolling must not
materialize all DOM nodes or Canvas state. Canonical pixels from Canvas2D, WebGL2, optional WebGPU,
and optional Wasm must be Golden-Fixture equivalent. GPU color/rounding differences remain outside
Canonical Project State.

## Completion evidence

Every WP-100–WP-190 completion report must link Benchmark Result records, raw references, device/
browser status, memory component metrics, Long Task data, backend equivalence, autosave/recovery,
fallback, accessibility, and regression comparisons. Missing real-device evidence is `UNTESTED`,
never `PASS`.
