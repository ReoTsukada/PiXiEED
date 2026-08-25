---
contract_id: WP-110-REFERENCE-PERFORMANCE-CHECKPOINT
status: MEASURED_REFERENCE_UNTESTED
version: 1.0.0
updated: 2026-08-07
---

# WP-110 Reference Performance Checkpoint

This is the mandatory pre-feature phase of WP-110. It measures the isolated WP-100 Reference
Path before adding pen, eraser, fill, palette, or timeline features. It does not replace the
formal device matrix and does not promote measured values to a production performance PASS.

## Measurement boundary

```text
typed Command
  → Core validation/commit
  → sparse indexed Tile mutation
  → Dirty Tile/Region
  → Reference dirty-region preparation
  → optional Canvas2D region present
```

`toUint8Array()` and full canonical SHA-256 are explicit Golden/reference operations only. The
active dirty path uses `readRegion()` and records preparation/present area. The current Core slice
has one raster asset and no 20-layer/120-frame compositor; affected layer/frame counts therefore
describe the Core slice (`1/1`), not full-project coverage.

## Required evidence

- 1 pixel trace at 512×512 and 256×256: command counts, affected area, allocation delta, COW,
  dirty region, renderer preparation, present area, and forbidden full-work counters.
- COW duplicate/edit Golden hashes for 32×32 and 64×64, source immutability, shared-byte change,
  split count, and copied bytes.
- Same-command-sequence determinism for canonical pixels, structure, command results, and dirty
  results.
- 1024×1024 sparse versus tile-dense allocation evidence.
- 32×32 versus 64×64 comparison for single pixel, short stroke, long stroke, duplicate/COW, and
  explicitly unimplemented fill/composite fixtures.
- Browser p50/p95/max with at least 40 samples, Long Task observer result, Canvas present path,
  resource requests, and environment identity.
- Bundle raw/minified/gzip/Brotli/CSS/source-map/request/lazy-chunk baseline.

## Status rules

The measured records are `UNTESTED` because the host device model is unavailable, the mobile
fixture is desktop-simulated, and the formal p95 gate is deliberately not evaluated here. Tile
size, Renderer, Worker topology, OffscreenCanvas, WebGPU, Wasm, and SharedArrayBuffer remain
`DECISION_PENDING` or `UNTESTED` candidates. Fill, Composite, actual device evidence, 30-minute
memory, and full layer/frame compositor coverage remain unimplemented or untested.

## Preservation

The checkpoint is isolated under `pixiedraw2/` and does not load or modify current Routes,
PiXiEEDraw, PXD, PiXiSYNC, Market, existing Projects/Assets/Packages, Purchase/Entitlement/
License/Royalty data, Production Database/Storage, or public Navigation. No migration, upload,
deploy, publish, commit, or push is performed.
