# ADR-20260809 — WP-200 Game/Runtime Bridge Scope Reconstruction

Status: `accepted for isolated implementation`  
Date: `2026-08-09`

## Decision

WP-200 is implemented as an isolated Core Bridge that joins Game Project Revisions, Draw/Audio
Asset Revisions, locked Package dependencies, Build provenance, and a separate PiXiRuntime preview
and save-state boundary. It reuses the WP-160 typed IDs, Dependency Snapshot, Runtime Preview,
Build lifecycle, diagnostics, Feature Flag, and kill-switch contracts. No competing identity or
revision model is introduced.

## Provenance

The earlier WP-200 roadmap/prompt was not present in the repository. The active definition was
reconstructed from:

- `09_ROADMAP/CORE_SITE_INTEGRATION_PROGRAM.md` (WP-200 row and preservation rules);
- `03_PRODUCTS/PIXIGAME_SPEC.md` (shared Game Project, references, controls, preview, recovery);
- `03_PRODUCTS/PIXIRUNTIME_SPEC.md` (Runtime execution, save-state, capability and bundle boundary);
- `02_ARCHITECTURE/BUILD_EXPORT_PIPELINE.md` (validation → lock → plan → artifact → verification);
- `02_ARCHITECTURE/INTEGRATED_PACKAGE_FORMAT.md` and `PACKAGE_REGISTRY_CORE.md`;
- `02_ARCHITECTURE/ASSET_GRAPH.md` and `COST_AWARE_REALTIME_POLICY.md`;
- existing `pixiedraw2/src/wp160-*` contracts, tests, and isolated bundles;
- the supplied external WP-190 approval and WP-200 audit direction;
- the longer approved Master Context preserved in `.codex/context/WP-050.md`.

## Consequences

- Game authoring state is canonical only inside the new isolated bridge; UI state is not Project
  state.
- Runtime consumes verified locked references and never edits Draw2/Audio source state.
- Build output is not a Package, Project, entitlement, or publish decision.
- Preview can use an explicitly labelled local/unsaved path, but release/build inputs require exact
  locked revisions. Failed updates retain the previous valid session.
- Full Game UI, native/export/cloud services, public routes, Market, and production data remain
  outside this Work Package.
- Product-level device, compositor, legacy, and production gates remain UNTESTED until directly
  measured.
