# GAME-320 Runtime Preview and Save State Contract

Status: isolated reference implementation, schema version `1`.

`createRuntimeSnapshot` validates a GAME-300 `GameProject` and freezes its project revision hash and every referenced Draw/Audio Asset Revision into an immutable `RuntimeProjectSnapshot`. `RuntimeSession` owns only a Runtime world projection: mode, fixed integer ticks, frame count, declared component properties, variables, scene, and input sequence. Preview, play, pause, stop, reset, step, checkpoint, and restore are pure state transitions; they never write the authoring Project.

Runtime input is semantic and sequence-ordered. The module accepts no clock, random source, DOM, network, filesystem, storage, production route, Market, PiXiSYNC, Registry, Queue, State, or Context dependency. Unknown/non-deterministic input is rejected or remains inert; it is never interpreted as host code.

## Save State boundary

`RuntimeSaveState` is versioned and contains the Runtime schema, project identity/hash, project revision lock, asset revision locks, and declared Runtime world state. Restore checks all locks, caller claims, schema, world shape, and component identity against the snapshot. Stale, tampered, wrong-project, wrong-owner, wrong-revision, missing/unknown component, and unsupported schema claims fail closed. GAME-320 does not silently migrate; `migrateRuntimeSaveState` returns `UNSUPPORTED_MIGRATION`.

Checkpoints are Runtime-local named Save States. They do not become Game Project checkpoints, journal commands, PiXiSYNC events, or persistence writes.

## Explicit non-claims

Browser, visual/a11y, physical-device, production Runtime, package/build provenance, asset resolver, storage adapter, migration implementation, and release/cutover behavior remain `UNTESTED` or out of scope.
