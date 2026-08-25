# ADR-20260806 — WP-010 contract alignment

## Status

Accepted for WP-010 reference scope; production integration deferred to later Work Packages.

## Context

The v4.2 Master Context supplies a dependency-free reference core and four initial JSON Schemas.
WP-000 also recorded existing PiXiEEDDraw persistence, PXD archive, PiXiSYNC operation, RPC, and
baseline evidence. The two sets of contracts are related but are not byte-for-byte identical.

## Decisions

1. Use the v4.2 reference core as the comparison baseline for the Command Envelope, Canonical
   Operation, minimal Project State, PXD manifest, atomic execution, deterministic operation ID,
   Journal, and Checkpoint failure paths.
2. Keep existing repository identifiers and contracts at the production boundary. Current local
   `local-*` project IDs, shared room IDs, UUID PiXiSYNC operation IDs, server revisions,
   `structure_epoch`, existing payload codecs, RPC argument names, and current PXD archive manifest
   are preserved by adapters.
3. Do not invent a second live type system or replace current runtime types in WP-010. The
   reference core's plain string IDs are an isolated contract vocabulary; a future adapter may
   add compile-time branding only if it maps losslessly to current fields.
4. Treat the reference PXD manifest (`packageId`, `projectId`, `createdBy`, `assets`,
   `dependencies`) as the initial portable package schema. Treat the existing repository
   `manifest.json` archive version 2 as a separate compatibility input/output until a later PXD
   package adapter proves equivalence. No current writer or reader is changed here.
5. Keep `schemaVersion` separate from PXD archive `version`. Unsupported versions must fail
   explicitly and migration must write a new destination while retaining the source.

## Evidence

- `16_IMPLEMENTATION_STARTER/reference-core/src/types.ts`
- `16_IMPLEMENTATION_STARTER/reference-core/src/command-engine.ts`
- `16_IMPLEMENTATION_STARTER/reference-core/schemas/*.schema.json`
- `pixiedraw/assets/js/app.js` (`createAutosaveProjectId` and current project identity flow)
- `pixiedraw/assets/js/modules/pixisync-realtime-client-utils.js`
- `pixiedraw/assets/js/modules/pixisync-order-keeper-utils.js`
- `pixiedraw/assets/js/modules/pixisync-document-operation-utils.js`
- `pixiedraw/assets/js/modules/project-storage-v2-archive-codec.js`
- `docs/inventory/storage-and-formats.json`
- `docs/inventory/pixisync-data-contracts.md`

## Compatibility and rollback

Current Market, PiXiSYNC, public URLs, existing projects, and financial/entitlement/rights data are
unchanged. No feature flag is enabled, no database or Storage migration is required, and the
current production path is the rollback path. Future integration requires shadow validation,
convergence tests, package round-trip tests, reconciliation, and owner approval before cutover.

## Open decisions

- The lossless adapter between the current archive-v2 manifest and the portable package manifest
  is deferred to the PXD/package Work Packages.
- The mapping from current UUID operation IDs to deterministic reference operation IDs is deferred
  until the Command Engine and PiXiSYNC convergence contract are implemented.
