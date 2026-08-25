# ADR-20260808: Isolated Draw-to-play Preview Foundation

- Status: Accepted for WP-160 implementation
- Date: 2026-08-08
- Scope: `pixiedraw2/` local entry and pure Runtime/Build contracts

## Decision

Implement the first Draw-to-play slice as two independent pure modules and one lazy browser
projection:

1. `wp160-game-runtime-core.ts` owns typed asset resolution, animation sampling, semantic input,
   Runtime state, loop stepping, diagnostics, and safe hot reload.
2. `wp160-build-pipeline.ts` owns Build Plan canonicalization, lifecycle, evidence, cache identity,
   Artifact identity, cancellation, security fixtures, and explicit Publish intent.
3. `draw2-entry.ts` loads `wp160-runtime-core.js` only after the local Preview action. It does not
   import Runtime implementation into the initial Editor bundle.

The current production page and all current data contracts remain untouched.

## Rationale

PiXiGame authoring and PiXiRuntime execution have different security, bundle, state, and lifecycle
responsibilities. Combining them would make Editor UI and authoring state transitively available to
public Runtime users and would blur the distinction between Build and Publish. A pure contract
also keeps the existing Draw2 Core independent of DOM, Canvas, Storage, Network, and Legacy PXD.

The Draw2 local projection follows the approved UX direction: Desktop pixel editing remains
Aseprite-informed, while Runtime is a separate play preview. LIVE is useful for local authoring;
PINNED is required for stable Build inputs and later published artifacts.

## Rejected alternatives

- Embedding PiXiGame Editor in the Runtime bundle: rejected due to security, bundle, and state
  boundary violations.
- Building directly from mutable LIVE editor state: rejected because reproducibility and rollback
  require a locked Dependency Snapshot.
- Treating Build success as publication: rejected because Market/SNS/URL and rights are separate
  release operations.
- Preloading all Project/Registry data: rejected due to startup bytes, privacy, and cost.

## Consequences

The slice is executable and measurable locally, but it does not claim a shipped Runtime, Cloud
Build, native exporter, production Route, Market release, or WP-150 Legacy compatibility. Those
remain separate gates and require external audit before WP-170 is started.
