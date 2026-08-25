# FP-005 Contracts

`FP005_V1` is the isolated privacy, storage, and input boundary. It accepts typed,
tenant/resource-bound references and rejects unknown, oversized, unsafe, or active content.

## Canonical placement

| Class | Placement |
| --- | --- |
| Active state | `MEMORY` |
| Journal/checkpoint/index metadata | `INDEXED_DB` |
| Large tiles, audio, cache, and checkpoints | `OPFS` |
| Owner, rights, revision, hash/size/type metadata | `DATABASE` |
| Immutable media/package/backup blobs | `OBJECT_STORAGE` |

`Fp005StorageLocator` preserves the existing locator fields `placement`, `path`,
`contentHash`, and `byteLength`, and adds the tenant/resource binding. Local and server
authorities are not interchangeable.

## Fixed limits

`FP005_INPUT_LIMITS` defines the versioned limits: 262144 envelope bytes, JSON depth 16,
10000 collection items, 65536-byte strings, 1024-byte paths, 32 path segments, 536870912-byte
blobs, 100000 archive entries, 2 GiB expanded archives, and a compression ratio of 100.

Paths are relative normalized paths only. Empty segments, traversal, encoded traversal, NUL/control
characters, backslashes, active MIME types, invalid hashes, and cross-tenant locators fail closed.
Telemetry and diagnostics are allowlisted/redacted; authority and purchased bytes are retained.
