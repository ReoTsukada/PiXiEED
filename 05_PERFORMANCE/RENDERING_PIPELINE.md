---
spec_id: PERF-RENDERING-PIPELINE-001
title: Draw2 Rendering Pipeline
status: NORMATIVE
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-07
---

# Rendering Pipeline

Canonical Project State is independent of DOM, Canvas, WebGL, WebGPU, and UI framework. A
renderer consumes deterministic Commands/Canonical Operations and produces a presentation;
it never becomes the authority for Project State.

## Dirty pipeline

```text
pointer samples
  → local stroke preview
  → command commit
  → dirty tile set
  → affected layer composite
  → affected viewport rectangle
  → independent overlays
  → present
```

One-pixel edits must not scan every Frame, Layer, Canvas pixel, or Timeline entry. Grid,
Selection, Guide, Reference, and Onion Skin are separate invalidation domains. Timeline
scroll/scrub uses windowing and does not rematerialize the full Canvas state.

## Backend equivalence

Canvas2D, WebGL2, WebGPU, and optional Wasm backends must consume the same canonical operation
fixture and produce equivalent canonical pixels. GPU rounding, color conversion, and display
format expansion are presentation concerns only. WebGPU is optional and must fall back without
changing Project State when unavailable, lost, or initialization fails.

## Main Thread boundary

The Main Thread owns pointer/focus/keyboard/UI interaction, presentation submission, and small
orchestration. Fill, Transform, Composite, Encode/Decode, Hash, Thumbnail, Checkpoint,
Package materialization, compression, waveform, and large import/export may use a Worker after
measured comparison. A Worker failure keeps canonical state and never promotes an uncommitted
operation to confirmed state.
