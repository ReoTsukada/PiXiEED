# ADR-001-GAME-320 — Isolate Runtime Save State from Authoring State

Status: accepted for isolated GAME-320 reference implementation.

## Decision

Runtime Preview receives a validated GAME-300 Project snapshot, locks the Project Revision and referenced Asset Revisions, and executes against a separate immutable `RuntimeWorldState`. Save State serializes only that Runtime state plus its compatibility locks. Restore requires the same snapshot and caller claim. Unsupported schema or migration is rejected explicitly.

## Rationale

GAME-300 remains the authoring authority and GAME-310 remains the semantic input authority. Sharing mutable objects would allow preview input, pause/restart, or save restore to alter editor state or imply a Project/PiXiSYNC write. Fixed integer ticks and ordered semantic input make the reference loop reproducible without ambient time or random.

## Consequences

- Preview/play/pause/stop/reset and Runtime checkpoints are local pure transitions.
- Project revision changes make an existing Save State stale; no silent migration occurs.
- DOM, network, filesystem, production Runtime, Market, Registry, Queue, State, and Context integration must be added only by a separately scoped contract.
- Browser, device, accessibility, memory, and production-equivalent qualification are not claimed by GAME-320.
