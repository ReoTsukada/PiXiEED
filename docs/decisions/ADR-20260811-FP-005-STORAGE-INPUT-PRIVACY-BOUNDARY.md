# ADR-20260811: FP-005 Storage, Input, and Privacy Boundary

- Status: `ISOLATED_REFERENCE_COMPLETE / INDEPENDENT_TERRA_REVIEW_PASS`
- Date: `2026-08-11`
- Scope: FP-005 isolated reference only

## Context

FP-005 needs one fail-closed boundary for storage placement, typed locators, bounded input,
tenant/resource scope, retention, telemetry, and privacy-safe diagnostics. The implementation is
an isolated reference under `pixiedraw2/src/fp-005/**`; it must not be confused with production
Auth, DB, RLS, Storage, provider, browser, or device behavior.

## Decision

### 1. Preserve the existing locator wire shape

The existing locator fields `placement`, `path`, `contentHash`, and `byteLength` remain stable.
FP-005 validates the typed locator and adds tenant/resource binding for the reference boundary;
it does not silently coerce legacy or caller-selected provider handles.

### 2. Separate placement from locator authority

Placement classification determines the canonical location for the data class. Locator validation
then verifies the path, hash, byte length, MIME metadata, tenant/resource binding, and authority.
Local (`MEMORY`, `INDEXED_DB`, `OPFS`) and server (`DATABASE`, `OBJECT_STORAGE`) authorities are
not interchangeable. A placement decision is not an authorization decision, and a locator is not
accepted merely because its shape is syntactically valid.

### 3. Fail closed at every boundary

Unknown schema or fields, unbounded or malformed input, active content, unsafe paths, mismatched
metadata, missing/stale/invalid AuthorizationProofV1, cross-tenant scope, quota exhaustion, and
protected retention deletion return typed failure before a provider action. No fallback Boolean,
caller-supplied trust field, or existence-leaking success is accepted.

### 4. Keep evidence synthetic-only

Tests and the benchmark use inline synthetic metadata and adversarial labels. Evidence records
fixture IDs, source/test paths, command exits, counts, hashes where available, and aggregate timing
metadata only. It contains no PII, secrets, JWTs, cookies, email/phone/address values, payment
data, raw project text, raw media, pixel/audio bytes, or private commission content.

## Consequences

- The isolated facade can be integrated across the FP-005 tracks without changing the existing
  locator wire fields.
- Placement, scope, redaction, path, archive, content, quota, and retention checks remain
  independently traceable to their source and tests.
- `productionSloClaim=false` and `productionEquivalentClaim=false`; local synthetic timings do not
  establish production performance or provider behavior.
- All FP-005 tests passed `43/43` with exit 0, public boundary tests passed `2/2`, and the check
  covered 28 files with exit 0. Baseline identity passed `14/14` existing matches with `0` new
  identities and exit 0; that baseline identity is authoritative.
- The FP-005 target diff check passed with whitespace issues `0`.
- Independent Terra review passed all five Acceptance IDs in isolated scope; P0/P1/P2 are 0.
- The original forged-proof, redactor, truncation, Deflate, quota-retention, unknown, and locator
  probes passed fail-closed.
- The benchmark is `MEASURED_LOCAL_SYNTHETIC` with rejected counts `[1, 10, 100, 1000]` and
  recorded `p50/p95/max` milliseconds of `1=1.578833/1.578833/1.578833`,
  `10=0.205166/0.30325/0.30325`, `100=0.167833/0.277875/0.756458`, and
  `1000=0.144334/0.398375/3.728875`. This is not production evidence.
- Source/test manifest SHA-256 values are recorded in the evidence inventory; the artifact hash is
  not left null.

## Explicitly untested

- production Auth/DB/RLS/Storage/provider
- real large streaming
- power-loss durability
- browser/device/network behavior
- long-session behavior
- migration/deploy/rollback/cutover

Eight all-repository permission-limited failures are excluded from the FP-005 package pass and do
not override the authoritative baseline identity. The production Auth/DB/RLS/Storage/provider,
real large streaming, power-loss, browser/device/network, long-session, and
migration/deploy/rollback/cutover claims remain `UNTESTED`. This ADR authorizes no production
connection, credential use, migration, deploy, publish, commit, or push.
