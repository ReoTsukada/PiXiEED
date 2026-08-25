# GAME-300 Game Project Core Contract

Status: isolated reference implementation, schema version `1`.

## Canonical model

`GameProject` owns typed `Scene`, `Entity`, `Component`, `Prefab`, `Dependency`, `BehaviorIR`, and `Revision` values. A revision is bound to the project and owner and carries a deterministic SHA-256 snapshot hash. Draw and Audio components store `Asset ID + Asset Revision ID + owner ID + content hash + mode`; they do not copy source pixels or audio bytes.

No-code, Visual Graph, and bounded TypeScript Script inputs compile to the same `BehaviorIR` (`version: 1`, `ownership: CANONICAL_IR`). Arbitrary script execution or reverse conversion is outside this contract.

## Safety boundary

Validation rejects unknown schema, duplicate IDs, entity/dependency cycles, invalid component state, missing behavior/asset references, and caller project/owner/revision mismatches. Journal commands retain before/after immutable project snapshots; new edits clear redo, and checkpoints restore a known project snapshot.

The module is pure TypeScript and has no DOM, network, filesystem, storage, Registry, Queue, State, Context, Runtime, or GAME-310 dependency. Browser, physical-device, production, deployment, migration, and accessibility execution are not claimed by this contract.

