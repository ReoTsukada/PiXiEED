# ADR-001 GAME-300 Canonical Project and Behavior IR

- Status: Accepted for GAME-300 isolated implementation
- Decision: keep one typed Project model and one canonical Behavior IR; No-code, Graph, and Script are projections into that IR.
- Rationale: a single hashable state prevents authoring-mode drift and makes Revision/Dependency validation fail-closed.
- Persistence: use immutable command journal entries plus explicit checkpoints. Undo/redo is in-memory model behavior for this package; no storage adapter is introduced.
- Boundary: Draw/Audio are referenced by pinned Asset Revision metadata. DOM, network, filesystem, Runtime, Registry/Queue/State/Context, current routes/data, and GAME-310 remain outside scope.
- Evidence: `docs/inventory/game-300-evidence.json` and `pixiedraw2/tests/game-300/core.test.ts`.

