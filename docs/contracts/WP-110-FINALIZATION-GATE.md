---
contract_id: WP-110-FINALIZATION-GATE
status: COMPLETE_WITH_PERFORMANCE_PARTIAL
version: 1.0.0
updated: 2026-08-07
---

# WP-110 Finalization Gate

This document closes the requested WP-110 finalization work. It does not turn a Core-slice
browser smoke into a full device or 20-layer/120-frame performance PASS.

## Product authority

`03_PRODUCTS/PIXIEEDRAW2_SPEC.md` is present, marked `RECONSTRUCTED_CANONICAL`, and is a
mandatory reference in the WP-110 through WP-190 Draw2 Context Map. The original was not
found in the working tree or Git history. Provenance is recorded in
`docs/inventory/pixiedraw2-product-spec-provenance.json`.

The context builder returns Validation Error exit `3` when this mandatory file is absent or
when the relevant Context Map entry omits it. It never generates a replacement document.

## Browser smoke result

The available real browser was an in-app Chromium host. The measured interval is the isolated
`command → dirty Tile/Region → Reference dirty-region preparation → optional Canvas present`
path. The current implementation has one raster asset and no 20-layer/120-frame compositor,
so the requested `PROJECT_B` fixture is represented as `PROJECT_B_DESKTOP_REFERENCE_CORE_SLICE`
with measured affected layer/frame `1/1`. This is `PARTIAL_UNTESTED`, not a formal performance
PASS. Full formal p95 evaluation is deliberately false.

| Fixture | Surface classification | Samples | p50 / p95 / max input→visible | Long Tasks | Status |
| --- | --- | ---: | ---: | --- | --- |
| 512×512 requested 20 Layers/120 Frames; Core slice 1/1 measured | `DESKTOP_BROWSER_REFERENCE` | 40 | 0 / 0.100 / 1.100 ms | 0, max 0 ms | PARTIAL_UNTESTED |
| 256×256 requested mobile reference; desktop browser viewport only, Core slice 1/1 measured | `DESKTOP_BROWSER_MOBILE_VIEWPORT` | 40 | 0 / 0.100 / 0.600 ms | 0, max 0 ms | UNTESTED; not real mobile |

Evidence is in `docs/inventory/wp110-finalization-browser-smoke.json`. The environment was
Chromium 151.0.0.0 on the Codex in-app browser host, `MacIntel`, warm condition, build
`pixiedraw2-reference-checkpoint-local`, with device model unavailable.

## Transparency regression

- Canonical palette index `0` remains transparent.
- Erasing a colored pixel restores canonical index `0`.
- The isolated Canvas projects the erased pixel as `[0, 0, 0, 0]`.
- Dirty repaint is bounded to the erased region and does not retain the prior color.
- Empty and erased canonical full-reference Golden hashes are equal.

The Core Golden check is in `pixiedraw2/tests/core.test.ts`; the Canvas projection check is
in `scripts/test-pixiedraw2-wp110-browser.mjs`.

## Remaining evidence

Still `UNTESTED` or `DECISION_PENDING`: real mobile, Safari/Firefox, stylus, 30-minute memory,
full 20-layer/120-frame compositor, WebGPU, Wasm, SharedArrayBuffer, final Worker/Renderer
equivalence, large timeline/layer virtualization, and production compatibility. These remain
tracked for WP-120/WP-130/WP-140/WP-150/WP-160/WP-170/WP-180/WP-190 and later gates.

## Preservation

No current Route, PiXiEEDraw, PXD, PiXiSYNC, Market, Project, Asset, Package, database,
Storage, migration, deploy, publish, upload, commit, or push was changed. WP-120 Context is
regenerated only as a handoff artifact; WP-120 implementation is not started.
