---
spec_id: PERF-BASELINE-BUDGETS-001
title: PiXiEED Performance Budgets
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
---

# Performance Budgets

This document is the shared measurement vocabulary for Draw2 and later tool bridges. It does
not claim that any device or browser has passed. Results must be recorded with the WP-099
Benchmark Result Schema and marked `UNTESTED` when the actual device/browser evidence is absent.

## Mandatory reference fixtures

| Fixture | Canvas | Layers | Frames | Input |
| --- | ---: | ---: | ---: | --- |
| Mobile reference | 256×256 | 12 | 60 | 60Hz touch/pointer |
| Desktop reference | 512×512 | 20 | 120 | 60Hz pointer |
| Scale stress | 1024×1024 | 50 | 500 | timeline and composite |

## Release gates

- Desktop reference `p95 input → visible <= 24ms`.
- Mobile reference `p95 input → visible <= 32ms`.
- Routine drawing has no Main Thread Long Task over 50ms.
- Frame/Cel duplicate reference operation is `<= 10ms`.
- 30-minute continuous sessions show bounded memory by component metrics; a single total
  memory number is insufficient.
- A result without actual device, browser/version, build, condition, iterations, p50, p95,
  max, memory metrics, Long Tasks, raw-result reference, and timestamp is `UNTESTED`.

## Regression policy

Compared with a recorded baseline, more than 10% regression requires explicit review and more
than 20% blocks release unless separately approved for a critical reason. Correctness,
Accessibility, Security, Journal durability, and recovery are independent gates and cannot be
traded for a faster number.
