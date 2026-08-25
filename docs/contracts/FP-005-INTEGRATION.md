# FP-005 Integration Contract

## Scope and status

This document records the FP-005 isolated-reference integration boundary. The implementation
status is `ISOLATED_REFERENCE_COMPLETE`; independent Terra review is
`INDEPENDENT_TERRA_REVIEW_PASS`. The boundary is package-local and does not change the current
production routes, data, Auth, database, RLS, Storage, providers, Market, or PiXiSYNC.

The only cross-track entry point is `validateFp005Boundary` in
`pixiedraw2/src/fp-005/index.ts`. It accepts versioned plain-data requests and returns bounded
metadata or a fail-closed diagnostic. Provider access and browser/runtime state are outside this
isolated reference.

## Canonical integration flow

```text
versioned request
  -> kind/schema and unknown-field rejection
  -> INPUT: bounded JSON/content/archive/path validation
  -> STORAGE: placement classification + typed locator validation
  -> scope: tenant/resource binding + current AuthorizationProofV1 recheck
  -> TELEMETRY: allowlist + redaction + serialization
  -> bounded result or fail-closed diagnostic
```

`MATERIALIZE` composes the input checks with the storage placement and scope checks. `RETENTION`
returns an explicit decision and cannot delete authority or purchased bytes. The local and server
authorities remain distinct; a local locator is never accepted as a server locator.

## Wire-compatible locator and placement separation

`Fp005StorageLocator` preserves the existing locator fields `placement`, `path`, `contentHash`,
and `byteLength`. Tenant/resource binding and optional MIME metadata are validated as part of the
typed record. The placement classifier is a separate decision from locator validation:

| Storage class | Canonical placement | Authority |
| --- | --- | --- |
| `ACTIVE_STATE` | `MEMORY` | local |
| `JOURNAL_METADATA` | `INDEXED_DB` | local |
| `LARGE_BLOB` | `OPFS` | local |
| `AUTHORITY_METADATA` | `DATABASE` | server |
| `IMMUTABLE_BLOB` | `OBJECT_STORAGE` | server |

The boundary rejects a durable active-memory value, a non-canonical placement, a locator with a
different tenant/resource binding, hash/size/MIME mismatch, an authority mismatch, or an
unvalidated caller-selected provider path.

## Versioned limits and privacy boundary

The policy version is `FP005_V1`. Fixed limits are 262144 envelope bytes, JSON depth 16, 10000
collection items, 65536-byte strings, 1024-byte paths, 32 path segments, 536870912-byte blobs,
100000 archive entries, 2 GiB expanded archive bytes, and compression ratio 100.

Paths are relative normalized paths only. Traversal, encoded traversal, absolute paths, NUL or
control characters, backslash ambiguity, non-canonical Unicode, symlinks, duplicate normalized
paths, active content, and MIME/content mismatch fail closed. Diagnostics and telemetry are
allowlisted and redacted; evidence contains opaque fixture identifiers and measured metadata only.
No JWT, cookie, secret, direct identifier, raw project body, raw media, pixel/audio bytes, or
private work content is included in evidence.

## Acceptance integration map

The authoritative row-level mapping, command exits, and benchmark output are in
`docs/inventory/fp-005-evidence.json`. The five acceptance IDs are mapped to source, tests, and
synthetic inline fixtures there. All FP-005 tests passed `43/43` with exit 0, including the public
boundary `2/2`; the check covered 28 files with exit 0. Independent Terra review passed all five
Acceptance IDs in isolated scope with P0/P1/P2 equal to 0. The original forged-proof, redactor,
truncation, Deflate, quota-retention, unknown, and locator probes all passed fail-closed.
FP-005対象のwhitespace issueは0件だった。

## Evidence boundary

The benchmark is metadata-only local synthetic validation. The recorded rejected counts are
`[1, 10, 100, 1000]`, with `p50/p95/max` milliseconds of `1=1.578833/1.578833/1.578833`,
`10=0.205166/0.30325/0.30325`, `100=0.167833/0.277875/0.756458`, and
`1000=0.144334/0.398375/3.728875`. Its status is `MEASURED_LOCAL_SYNTHETIC`; it is not a
production SLO or production-equivalent claim. `productionSloClaim=false` and
`productionEquivalentClaim=false` are invariant evidence fields. Baseline identity passed
`14/14` existing matches with `0` new identities; the baseline identity is authoritative. The
source/test manifest SHA-256 values are recorded in the evidence inventory.

The following remain `UNTESTED`: production Auth/DB/RLS/Storage/provider, real large streaming,
power-loss, browser/device/network, long session, and migration/deploy/rollback/cutover. Eight
all-repository permission-limited failures were excluded from the FP-005 package pass and do not
override the authoritative baseline identity. No production connection, credential, migration,
deploy, publish, commit, or push is authorized by this contract.
