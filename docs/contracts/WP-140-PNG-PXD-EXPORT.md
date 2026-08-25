# WP-140 PNG and PXD export contract

## Scope

WP-140 implements an isolated deterministic export boundary under `pixiedraw2/`. It does
not rewrite the current `pixiedraw/` PXD implementation and does not connect to current
routes, PiXiSYNC, Supabase, Market, Project data, or Object Storage.

## PNG

- Source is the canonical indexed raster; palette index `0` is transparent.
- Output is deterministic RGBA8 PNG with filter `0`, no timestamps, and deterministic
  stored-DEFLATE blocks.
- Export includes dimensions and a SHA-256 hash of the indexed source raster. The benchmark
  reports this raw indexed hash separately from the Core's canonical-JSON hash used for
  round-trip equality.
- Theme, Canvas CSS, and UI color changes cannot alter this output.

## Versioned PXD package

The isolated v1 container is:

```text
PXD magic (4 bytes) + archive version (1 byte) + manifest length (uint32 BE)
  + canonical UTF-8 manifest + concatenated canonical raster payloads
```

The manifest declares `format=pxd`, `schemaVersion=1`, `archiveVersion=1`,
`packageKind=PROJECT_PACKAGE`, Project identity/structure, indexed assets, dependencies,
per-asset hashes, canonical manifest hash, and the package hash is calculated over the
complete bytes. Asset paths are fixed relative `objects/asset-0000.raster` entries and
payload offsets must be contiguous. The starter schema remains the schema reference; the
container is an isolated Draw2 adapter until the Core Package Registry accepts a later
compatibility gate.

## Import and failure behavior

Import validates magic, versions, JSON, manifest hash, expected package hash when supplied,
asset path/size/dimensions/palette/revision/offset, asset hashes, active identity, and
trailing bytes. Corrupt or mismatched data is rejected with a diagnostic code and never
partially applied. A successful import creates a new local ProjectState and keeps current
PXD files untouched. Large import/export work remains a worker/cancellation candidate
after measurement; this WP does not claim a device performance gate.

The UI adapter creates a local download only through Blob/Object URL and reads a selected
file locally. It does not upload, publish, migrate, or mutate production data.

## Verification

The contract is covered by deterministic PNG/PXD tests, import round-trip, corrupted
payload rejection, benchmark output, type checking, and `git diff --check`. Real device,
Safari/Firefox, very large package, worker, and production compatibility gates remain
`UNTESTED` and belong to later Work Packages.
