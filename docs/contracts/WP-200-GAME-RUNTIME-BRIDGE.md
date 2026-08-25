# WP-200 Game/Runtime Core Bridge Contract

## Boundary

`wp200-game-runtime-core.ts` is DOM, Canvas, Network, Supabase, IndexedDB, OPFS, Object Storage,
Market, PiXiSYNC, and current-route independent. It stores reference metadata, not raw Draw or
Audio bytes. The Runtime bundle imports only execution-safe functions; Build tooling is a separate
entry.

## Canonical flow

```text
Game Project Revision
  → Draw/Audio Asset Revision references
  → locked Package Dependency Snapshot
  → deterministic Build Plan
  → verified Runtime Artifact
  → Runtime Preview / execution
```

`LIVE` is authoring/preview-only. `PINNED` is required for Build and Runtime Artifact provenance.
`REVIEW` requires explicit acceptance. `FORKED` is an independent lineage and never silently
updates the source.

## State separation

- Game Project: Scene, Entity, Component, Input Action, Behavior IR, Build Profile, references.
- Runtime: tick, input states, component runtime values, scene selection, presentation state.
- Runtime Save State: declared versioned progression/checkpoint only.
- Build Artifact: immutable verified output with provenance and exact lock.
- Workspace/UI: not canonical and not synchronized as Project operations.

## Required failure behavior

Unknown schema/runtime/target, missing or unauthorized dependency, quarantine, hash mismatch,
dependency cycle, unsafe path/URL/active content, unsupported capability, unverified artifact,
cancelled/partial build, and incompatible revision update return typed diagnostics and fail closed.
Recovery retains the last valid Runtime session and never empties or rewrites the Game Project.

## Feature and cost boundary

Game Core read/write, preview, execution, and Build flags are default OFF. Unknown flags and the
kill switch fail closed. Pointer samples, frame ticks, and audio samples remain LOCAL_ONLY;
confirmed Revision/Package events are small ID/Hash invalidations and fetch on demand.
