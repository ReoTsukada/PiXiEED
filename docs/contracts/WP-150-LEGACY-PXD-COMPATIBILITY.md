# WP-150 Legacy PXD Compatibility Contract

## Canonical scope

The canonical Work Package definitions are:

| ID | Canonical scope | Authority |
| --- | --- | --- |
| WP-140 | Deterministic PNG and isolated Draw2 PXD v1 export/import | `00_START_HERE/IMPLEMENTATION_QUEUE.yaml`, `00_START_HERE/WORK_PACKAGE_CONTEXT_MAP.json`, WP-140 Context, Implementation State |
| WP-150 | Current PiXiEEDraw Legacy PXD archive-v2 read-only compatibility adapter | The same queue/map/Context/State records and this contract |

No older active WP-140/WP-150 definition is accepted. The roadmap's broader `WP-110–160`
line is a program grouping, not a competing Work Package scope.

## Format identity

Format detection is byte-based and independent of filename or extension:

```text
Draw2 PXD v1:      PXD 00 + archiveVersion=1 + manifest format=pxd/schemaVersion=1
Legacy PXD v2:     ZIP local signature PK 03 04 + manifest.json format=pxd|pixieedraw/version=2
Unknown/other:     fail closed
```

The Legacy adapter never best-effort parses Draw2 PXD v1, and the WP-140 exporter is not used as
the reverse implementation of the Legacy reader. Unsupported or unknown versions fail closed.

## Read-only source pipeline

```text
Legacy PXD bytes
→ identify
→ bounded ZIP/manifest validation
→ Legacy adapter parse
→ compatibility analysis
→ new local Draw2 working copy
```

The input is copied into parser-owned buffers and its SHA-256 is recorded. Import does not rewrite,
normalize, migrate, upload, sync, or delete the original. A future migration must create
`Original + converted copy`; source replacement requires a separate owner-approved cutover policy.

## Compatibility result

The adapter returns `SUPPORTED_WITH_ADAPTER` with `copyRequired=true` when all supported fields and
pixels are represented. Unknown fields/entries or unsupported blend semantics return
`REVIEW_REQUIRED` while remaining in the retained original. Malformed, unsafe, unsupported, or
potentially executable content is rejected as `UNSUPPORTED`/`QUARANTINED`. No unknown field is
silently dropped and no lossy conversion is automatic.

## Security and resource limits

Legacy PXD is untrusted input. The adapter bounds archive/entry/JSON/canvas/frame/layer/Base64/
decompressed bitmap sizes and rejects malformed lengths, ZIP flags/compression, duplicate IDs and
paths, path traversal, absolute paths, trailing bytes, invalid palette/index/raster references,
missing bitmap entries, bitmap hash mismatches, indexed/RGBA disagreement, active HTML/SVG/script/
Wasm payloads, unsupported encodings, and unknown versions. Script is never executed.

## Lazy boundary and preservation

The Legacy module is a separate browser chunk loaded only when the local Import PXD control is
used. It is absent from the initial Draw2 editor module body. Fixture/debug code is not placed in
the initial bundle. The local measurement records two initial requests, with the Legacy chunk
requested only on demand; this is evidence, not a production performance approval. Current
`pixiedraw/`, current PXD, PiXiSYNC, Market, URLs, Project/Asset data, Database, Storage, and
public Navigation remain unchanged.

## Verification matrix

The isolated synthetic matrix covers minimal project, transparency, palette, multiple layers,
animation frames, empty cel/frame, sparse raster, malformed/truncated/trailing input, unsafe path,
future version, active content, missing decompressor, bitmap hash mismatch, indexed/RGBA mismatch,
unknown field review, active-canvas/count consistency, and New PXD v1 separation. The existing
JSON-shaped Legacy fixture remains synthetic and is not a real binary archive fixture. Real
non-private Legacy fixtures are required before claiming production compatibility; no real
private user data is used.
