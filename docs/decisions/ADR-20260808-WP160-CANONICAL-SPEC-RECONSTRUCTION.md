# ADR-20260808: Reconstruct the WP-160 Game/Runtime/Build Specifications

- Status: Accepted for Context
- Date: 2026-08-08
- Scope: WP-160 handoff and later Game/Runtime/Build Work Packages

## Decision

The three mandatory WP-160 Context files were absent from the working tree and Git history:

- `03_PRODUCTS/PIXIRUNTIME_SPEC.md`
- `03_PRODUCTS/PIXIGAME_SPEC.md`
- `02_ARCHITECTURE/BUILD_EXPORT_PIPELINE.md`

They are reconstructed from approved sources, not recovered verbatim. The source mapping and
implementation-status boundaries are recorded in
`docs/inventory/wp160-canonical-spec-provenance.json`.

## Canonical boundaries

1. PiXiGame is a Core-integrated Creator Platform Game Creation Environment, not a reduced
   standalone Game Maker.
2. PiXiRuntime is a separate lightweight execution Runtime. It does not contain Editor UI,
   Draw2, PiXiAudio Editor, or unrestricted authoring state.
3. Package Registry represents canonical content/dependencies; Build creates target-specific
   artifacts; Runtime executes verified artifacts; Distribution/Release records delivery and
   rights separately.
4. Easy, detailed, and code Game authoring views operate over one Entity/Component/Action/Event/
   Revision contract. TypeScript, Visual Graph, and no-code are not separate incompatible models.
5. Desktop Draw2 may combine Aseprite pixel-art efficiency with Unity-like Creator Workspace
   concepts. Mobile Portrait remains Canvas-first and context-driven, based on the existing
   PiXiEEDraw strength. Tablet is adaptive. Shared Core and Project Format do not branch by device.
6. Existing Routes, PiXiEEDraw, PXD, PiXiSYNC, Market, Projects, Purchases, Entitlements, Licenses,
   Royalties, Database, Storage, and public data remain untouched until explicit compatibility and
   release gates pass.

## Status discipline

The specifications use `CURRENT`, `CURRENT SLICE`, `PLANNED`, `ADVANCED`, and `FUTURE EXTENSION`
truthfully. A product direction, contract, or registry boundary is not evidence that a Game
Editor, Runtime, Build service, external exporter, or production bridge is implemented.

## Consequences

WP-160 can receive a complete Context without silently shrinking the Game/Runtime architecture or
inventing requirements. WP-160 implementation is still not started in this checkpoint. Later
Game/Runtime and Build work requires its own implementation, security, performance, compatibility,
and external-audit gates.

## Verification and non-scope

The files must pass Context Map validation, JSON/YAML validation, `git diff --check`, and a
successful WP-160 Context build. This ADR changes documentation only; it performs no migration,
deployment, publication, route cutover, current-data mutation, commit, or push.
