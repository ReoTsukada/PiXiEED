# DRAW-140 PNG / PXD Contract

## Authority and boundary

DRAW-140 exports only the isolated Draw2 `ProjectState`. It never opens the
current `pixiedraw/` route, current PXD storage, PiXiSYNC, Market, or a
network provider. The package boundary is exposed by
`pixiedraw2/src/draw2/draw-140/export-contract.ts`.

## Canonical rules

- PNG is RGBA8 with filter 0 and stored DEFLATE blocks.
- Palette index `0` is transparent; PNG/PXD colors come from the canonical
  indexed raster and palette, never from Theme CSS.
- PXD v1 is `PXD\0`, archive version `1`, canonical JSON manifest, sorted asset
  IDs, explicit payload offsets, SHA-256 asset/manifest/package hashes. New
  Draw2 exports may include an optional canonical `assetDefinitions` manifest
  section containing stable source references and an optional external Registry
  identity mapping; it never contains pixel/audio/blob payloads.
- Import is fail-closed for bad magic/version, malformed manifest, invalid
  palette/dimensions, hash mismatch, offset mismatch, missing active asset,
  and trailing bytes.
- Export is local materialization only. It does not upload, migrate, publish,
  overwrite current PXD, or emit PiXiSYNC operations.
- The isolated exporter accepts only `LOCAL_DRAFT` and
  `VALIDATED_DEFINITION` PXD-owned definitions. `REGISTERED_ASSET` is an
  external Registry state and cannot be embedded as the source definition.

## Evidence disposition

Synthetic deterministic and round-trip fixtures are valid evidence for the
isolated contract. Browser UI, device performance, native file pickers, real
legacy/user PXD compatibility, live UI-draft-to-save wiring, and production
storage remain `UNTESTED` until their dedicated qualification packages run.
