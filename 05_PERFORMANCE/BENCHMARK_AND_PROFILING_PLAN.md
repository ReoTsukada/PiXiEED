---
spec_id: PERF-BENCHMARK-PROFILING-001
title: Draw2 Benchmark and Profiling Plan
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
---

# Benchmark and Profiling Plan

WP-099 defines the result schema and fixture catalog; WP-100 onward supplies the implementation
and executes the measurements. The harness must separate cold/warm runs, collect distributions,
and never pass from an average alone.

## Result identity

Every result records Benchmark ID, Project Fixture, Device Class, actual device, Browser and
version, OS, build/version, cold/warm condition, iterations, p50/p95/max, component memory
metrics, Long Tasks, raw-result reference, timestamp, and `PASS`/`FAIL`/`UNTESTED` status.

## Method

Use the same Fixture, Device Class, browser, build, input sequence, warm/cold condition, and
measurement boundary for candidate comparisons. Record environment and limitations. Benchmark
JS/TS before optional Worker/Wasm/GPU variants; include serialization, bridge, and memory-copy
overhead. Do not treat the developer Mac as the whole matrix.

## Safety and profiling

Benchmarking cannot skip Journal verification, Checkpoint integrity, accessibility, security,
or recovery. Long Task measurements cover routine drawing. Background/foreground, Worker crash,
GPU device loss, browser lifecycle, autosave, PiXiSYNC active collaboration, Asset Revision
commit, Draw→Game invalidation, import/export, and 30-minute sessions are separate workloads.
