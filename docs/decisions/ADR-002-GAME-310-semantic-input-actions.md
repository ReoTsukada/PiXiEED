# ADR-002 GAME-310 Semantic Input Actions

- Status: Accepted for isolated GAME-310 implementation
- Decision: represent every device binding as a semantic Action Map entry and resolve enabled contexts by priority.
- Safety: validation rejects duplicate/ambiguous bindings, caller mismatch, and unsafe control bounds; invalid maps resolve no action.
- Accessibility: touch controls carry safe-area geometry, visibility, feedback, screen-reader name, and focus order.
- Boundary: no DOM, network, filesystem, production route/data, runtime bridge, Registry, Queue, State, or Context integration is introduced.
- Evidence: `docs/inventory/game-310-evidence.json` and `pixiedraw2/tests/game-310/core.test.ts`.
