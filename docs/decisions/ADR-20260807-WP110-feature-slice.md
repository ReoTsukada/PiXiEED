# ADR-20260807-WP110 — Isolated Raster Feature Slice

- Status: accepted for isolated WP-110 implementation; device/performance release gates remain untested
- Scope: `pixiedraw2/` Core and local Browser Projection
- Date: 2026-08-07

## Decision

Keep the feature slice in the existing strict TypeScript Canonical Core and reuse PiXiEED's established
`RRGGBBAA` palette packing. Do not introduce a parallel color encoding, UI framework, Worker topology,
WebGL2/WebGPU backend, Wasm, or SharedArrayBuffer before the required measurement and technology ADR.
Pen and Eraser compile to bounded pixel/stroke Commands; Fill uses a cancellable pre-commit plan; Palette
definition updates the palette only; active Canvas presentation consumes Dirty Regions. An optional renderer
is wrapped by `FallbackRenderer` and cannot mutate Canonical State.

## Rationale

This preserves the WP-100 Core boundary, existing palette compatibility, local-first autosave, and the
Reference Checkpoint's evidence status. It also leaves Fill worker-ready without coupling the Core to DOM,
Canvas, Network, IndexedDB, OPFS, or a provider SDK.

## Consequences

The isolated Entry now demonstrates the basic editor tools without altering current production behavior.
Formal device/p95, long-session memory, full compositor, backend equivalence, and production compatibility
remain later validation gates. No current route, public navigation, database, storage, migration, deploy,
publish, commit, or push is changed.
