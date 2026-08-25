# ADR-20260808: WP-150 Legacy PXD Compatibility Entry Gate

- Status: Accepted
- Date: 2026-08-08
- Scope: isolated `pixiedraw2/` WP-150 only

## Decision

WP-150 may implement a read-only Legacy PXD archive-v2 adapter only after the following Entry
Gate is recorded:

1. Canonical scope is WP-140 PNG/PXD export and WP-150 Legacy PXD compatibility.
2. New Draw2 PXD v1 (`PXD\0`, archive v1, manifest schema v1) and Legacy PXD archive-v2 (stored
   ZIP, `manifest.json` format/version 2) are identified by bytes, not extension.
3. Legacy bytes are hashed and retained; import creates a new Draw2 working copy and cannot rewrite
   the source, trigger migration, or mutate PiXiSYNC.
4. Compatibility results distinguish supported adapter conversion, review, unsupported, and
   quarantine outcomes. Unknown fields remain in the original and are review-visible.
5. ZIP, JSON, raster, palette, Base64, decompression, active-content, path, version, and resource
   limits fail closed.
6. WP-140's new exporter and WP-150's Legacy reader are separate modules.
7. Legacy parsing remains a lazy, on-demand chunk and does not enter the editor startup hot path.

The gate passes through `scripts/test-pixiedraw2-wp150.mjs` and the seven isolated Legacy tests.

## Verification status

The isolated implementation and seven synthetic tests pass. The bundle boundary is measured but
not a production performance gate. Real binary Legacy fixtures, physical-device behavior, and
production compatibility remain untested and require external audit before any release decision.

## Consequences

Draw2 preserves the existing user's project data without freezing the new UI or Core model to the
Legacy editor. The current application remains the authoritative Legacy reader/writer until real
non-private fixtures, visual/hash comparison, rollback, and production compatibility gates are
approved. A future multi-canvas or unsupported-feature conversion remains review/unsupported; it
is never silently flattened.

## Explicit non-scope

No current route, current PXD file, PiXiSYNC session/history, Market product/purchase/right,
Database, Object Storage, migration, upload, deployment, publish, commit, or push is changed.
