---
spec_id: PERF-DRAW2-DEVICE-MATRIX-001
title: Draw2 Device and Workload Matrix
status: MANDATORY_GATE
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
---

# Draw2 Device and Workload Matrix

This matrix is a Benchmark Contract, not a claim that every row has run. Rows without actual
device/browser evidence remain `UNTESTED` and block a broad `PASS`.

## Project fixtures

| ID | Canvas | Layers | Frames | Additional |
| --- | ---: | ---: | ---: | --- |
| `PROJECT_A` | 256×256 | 12 | 60 | mobile reference |
| `PROJECT_B` | 512×512 | 20 | 120 | desktop reference, 60Hz |
| `PROJECT_C` | 1024×1024 | 50 | 500 | scale stress |
| `TIMELINE_1000` | fixture-dependent | fixture-dependent | 1000 | virtualized timeline |
| `COMPOSITE_100` | fixture-dependent | 100 | fixture-dependent | dense composite |
| `SPARSE_LARGE` | large | sparse | fixture-dependent | sparse Tile model |
| `DENSE_LARGE` | large | dense | fixture-dependent | dense Tile model |

## Workloads

`single pixel`, `rapid short strokes`, `long continuous stroke`, `flood fill`, `selection
transform`, `frame duplicate`, `cel duplicate`, `layer visibility`, `timeline scrub`, `onion
skin`, `palette update`, `autosave while drawing`, `PiXiSYNC while drawing`, `Asset Revision
commit`, `Draw→Game LIVE invalidation`, `import`, `export`, `checkpoint`, `crash/recovery`,
`background/foreground`, and `30-minute editing session`.

## Device classes

- modern desktop
- lower-power desktop/laptop
- modern phone
- lower-memory phone
- touch device
- high-DPI display

## Browser classes

Chromium-family, Safari-family, and Firefox-family. Each result records actual browser/version,
OS, build, input modality, display scale, warm/cold condition, iterations, p50/p95/max,
component memory, Long Tasks, raw result reference, timestamp, and status.
