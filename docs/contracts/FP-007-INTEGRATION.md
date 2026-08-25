# FP-007 Cross-track Integration Contract

Status: `NO_GO_BLOCKED` / `RELEASE_QUALIFICATION_BLOCKED`

This document defines the coordinator-owned boundary between the FP-007 Schema,
Dependency/Clean-room, and Build/Dist/Provenance tracks. It does not change a
package manifest, lockfile, Deno configuration, build script, migration, route,
production data, or current PiXiEED system.

## Evidence layers

Every acceptance is reported in four separate fields:

1. `analyzer`: the analyzer executed and the findings it produced;
2. `isolatedFixture`: deterministic reference and attack-fixture behavior;
3. `realRepoQualification`: qualification of the current repository inputs;
4. `reviewStatus`: coordinator integration and independent review state.

An isolated fixture `PASS` never upgrades an `UNTESTED`, `UNKNOWN`, `FAIL`, or
`BLOCKED` current-repository qualification. The package status is the worst
status across these layers and the review gate.

## Canonical chain

The integration chain is bound in this order:

```text
Schema Registry identity and digest
  -> dependency graph / lockfile / toolchain / allowlisted environment hashes
  -> canonical build manifest
  -> artifact manifest and initial/lazy boundary
  -> source-to-dist mapping
  -> provenance hash chain
  -> repeat-build qualification and sanitized evidence
```

## FP007-REWORK-02 build and filesystem boundary

The real-distribution qualification runner binds two canonical input classes:

1. copied artifact inputs, inventorying the declared staging entries; and
2. build-control inputs, inventorying the repository-relative staging module,
   qualification authority, toolchain declarations, lockfiles, and FP-007 build
   contract.

Each record contains exact byte length and SHA-256. The deterministic
`inputHash` is computed from the canonical manifest, the build-control file
records, and the copied-source file records. The checkpoint compares it before
and after each staged run and before receipt creation. A build-control mutation,
including a mutation of the staging implementation or its declaration followed
by an attempted restoration, is therefore fail-closed as `SOURCE_MUTATED` when
the checkpoint observes it.

The mandatory build-control set is the independent manifest itself,
`stage-web-assets.mjs`, this qualification runner, root `package.json` and
`package-lock.json`, `.nvmrc`, the Capacitor `package.json` and
`package-lock.json`, `capacitor.config.json`, and this build inventory. Each
working-tree file is also bound to its Git `HEAD` blob SHA-1. The runner checks
that binding at the initial checkpoint, before and after both staged runs, and
at the final pre-receipt checkpoint. A restored byte mutation remains rejected
because the mutation is observed before restoration can become authority.

External qualification output is created in a runner-owned private child of a
private temporary parent. The child is inspected without following symlinks,
populated privately, and published only by a same-parent rename after boundary
and parent identity checks. Node's standard filesystem API does not provide an
`openat`/directory-handle relative write primitive for this module. The code
therefore does not claim protection against an arbitrary malicious process with
the same UID racing between the final check and the syscall. That threat model
remains a P2/UNTESTED qualification limitation; boundary and parent replacement fixtures
fail closed and preserve external sentinels.

Temporary cleanup binds target and parent device/inode/realpath identity, moves
the checked directory to a private-parent tombstone, revalidates the tombstone,
and only then removes it. Replacement fixtures covering both check-to-rename
and rename-to-delete fail closed without deleting the exchanged object or its
external sentinel. A cleanup failure remains a blocked qualification and leaves
the safe temporary evidence for investigation.

Each link is recomputed from canonical, repository-relative values. Caller
schema bodies are re-resolved by identity. A floating dependency, lock mismatch,
unknown schema, source or toolchain mutation, timestamp, absolute path, secret,
undeclared artifact, or lazy-to-initial overlap fails closed.

## Current-system receipt boundary

The public receipt digest is diagnostic data only. The distributed
client/reference sources contain no proof creation path: neither the public
integration index nor the directly imported boundary module exposes a proof
creator or test-only composition entry. The private \`WeakSet\`/\`WeakMap\`
validation brand remains verifier-only in this package, so a valid server proof
cannot be generated here.

\`UNCHANGED\` is therefore fail-closed. A receipt supplied without an opaque
proof from a separate server boundary remains \`UNTESTED\`/\`BLOCKED\`; a
receipt rehash, spread, JSON value, \`Proxy\`, structured clone, or
browser-shaped object is never authority. The isolated tests cover direct module
export inspection and these negative paths without fabricating a positive proof.

A future server adapter is only a contract at this stage: a separately built and
non-distributed Server Composition Root may resolve the real inspection result
and return an opaque proof to this verifier. That root must not be reachable
from Browser/client imports. No production provider, secret, signing key, server
implementation, or current-system inspection is connected here; all of those
remain \`UNTESTED\`.

## Acceptance matrix

| Acceptance             | Analyzer                                                                      | Isolated fixture                  | Current repository                                                                                                                       | Independent review |
| ---------------------- | ----------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `FP007-SCHEMA-001`     | Executed; canonical identity and digest checks pass                           | PASS                              | UNTESTED for a production/current provider                                                                                               | PENDING            |
| `FP007-DEP-001`        | Executed; fresh offline analyzer result is `PASS` with 0 `FAIL` or unknown review findings | PASS for attack fixtures          | `PASS` for exact-lock dependency review; top-level release remains blocked by separate build/current-system gates | PENDING            |
| `FP007-BUILD-001`      | Executed; canonical manifest checks pass                                      | PASS; repeatable isolated fixture | BLOCKED by dirty worktree and clean-checkout absence                                                                                     | PENDING            |
| `FP007-DIST-001`       | Executed; topology and mapping checks pass                                    | PASS                              | UNTESTED for real distribution qualification                                                                                             | PENDING            |
| `FP007-PROVENANCE-001` | Executed; isolated chain checks pass                                          | PASS                              | Bounded PASS for the exact JSR dependency receipt: artifact → immutable source → commit-scoped OSV binding is verified; real distribution provenance remains UNTESTED and top-level FP-007 remains `BLOCKED` | Bounded receipt closure; external blockers remain |

## JSR vulnerability receipt checkpoint

The exact normalized receipt at
`docs/inventory/fp-007-jsr-provenance-receipts.json` is accepted only when its
package/version/subject PURL/integrity, Rekor UUID/index/log ID/SET digest,
immutable source commit/workflow identity, all four verification states, and
OSV commit query identity/result digest agree. It is reused for the two
allowlisted lockfile scopes only after the current lock resolution matches the
same exact JSR identity. Raw URLs, hosts, responses, advisory bodies, timestamps,
and secrets are excluded from the receipt.

The JSR ecosystem query remains unsupported and is not used as evidence. The
OSV result is a commit-scoped zero-vulnerability response, and the source
commit is bound by independently verified Rekor SLSA evidence. A changed
package, version, integrity, PURL, source commit, verification state, or OSV
response keeps `VULNERABILITY_REVIEW_UNKNOWN` blocked.

This receipt resolves only the dependency review acceptance. Dirty worktree,
clean-checkout, real distribution/provenance, current-system, and production
gates remain separate and keep top-level FP-007 `BLOCKED` until independently
qualified.

## Current repository qualification

The historical pre-receipt scan baseline found 141 dependency findings: 0 `FAIL`
and 141 `BLOCKED`, including `VULNERABILITY_REVIEW_UNKNOWN=132` and
`LOCK_RESOLUTION_MISSING=2`. This is historical/superseded evidence and is not
the current qualification result. After the valid zero-count receipts,
reference-core lock repair, exact shared Node declaration, and the exact JSR
vulnerability receipt, the current canonical dependency result is 0 findings
with `FAIL=0` and `BLOCKED=0`:
`VULNERABILITY_REVIEW_UNKNOWN=0` and `LICENSE_UNKNOWN=0`; `LOCKFILE_MISSING=0`,
`TOOLCHAIN_UNKNOWN=0`, and `TOOLCHAIN_VERSION_UNPINNED=0`. The three shared Node
scopes resolve Node `22.19.0` and npm `10.9.3`; the exact toolchain declaration
is recorded as `EXACT_NODE_NPM_PIN`. The sharp manifest declaration is exact and
`FLOATING_MANIFEST_RANGE=0`. The valid exact-lock-bound JSR license receipts set
both `resolvedDependencies[].license` values to `MIT` and remove only the two
`LICENSE_UNKNOWN` findings; they do not provide vulnerability review, overall
FP-007, or production qualification. Existing JSR frozen-lock technical PASS and
the bounded MIT license evidence remain distinct from vulnerability authority.
The separate exact JSR vulnerability receipt covers both allowlisted lockfile
scopes with `REVIEWED_NONE`; the current canonical result is
`VULNERABILITY_REVIEW_UNKNOWN=0`. Dirty worktree, clean-checkout, distribution,
baseline, and production qualification remain separate qualification blockers
or `UNTESTED` items; FP-007 records them and does not silently remediate them.

An isolated/reference measurement of the existing
`pixiedraw2/src/draw2-entry.ts` input now covers raw, gzip, and Brotli with
recorded deterministic parameters. It is `REFERENCE_ONLY`; it does not qualify
real distribution, provenance, clean checkout, Browser/Device build identity, or
Production. The fixed baseline was rechecked at 63/77 successes with the same
14 failure identities (14/14 identity match) and 0 new failures. Browser,
Device, and Production qualification remain `UNTESTED` until the appropriate
later qualification has actually run.

## Dependency receipt and root-lock evidence boundary

`NpmAuditReceiptV1` is an npm-only, scope-bounded receipt for `root`,
`app-shell/pixieed-capacitor`, or `tools/screenshots`. Its evidence must
identify the matching lockfile path and SHA-256, command identity
`npm audit --json`, severity totals, `evidenceId`, and sanitized content. Runtime timestamps are
ambient input, are rejected as unknown runner fields, and are never stored or included in the
receipt or artifact digest.
Receipt absence is `NOT_ISSUED`/`UNISSUED` and outside the verification target;
explicit invalidity is fail-closed `BLOCKED` as one `NPM_AUDIT_RECEIPT_INVALID`
finding and keeps the affected NPM dependencies `VULNERABILITY_REVIEW_UNKNOWN`.
A valid all-zero receipt updates only the matching NPM lockfile scope's resolved
dependencies to bounded `REVIEWED_NONE`. A valid receipt is only bounded
receipt-backed evidence for that npm lockfile. It cannot qualify JSR, license,
an external provider, overall FP-007, or production. Schema-valid does not mean
vulnerability-clean: any nonzero total or severity count produces the sanitized
`NPM_AUDIT_VULNERABILITIES_PRESENT` blocker and is never `PASS` or
`RECEIPT_BACKED_BOUNDED`; only an all-zero receipt is bounded evidence.

The root package manifest and package-lock root metadata are checked for exact
declaration equality. Missing, floating, or mismatched metadata is
`ROOT_LOCK_METADATA_MISMATCH` and fail-closed `BLOCKED`.

The receipt artifact/runner boundary is implemented in
`pixiedraw2/src/fp-007/npm-audit-receipt-artifact.ts`. Its loader accepts only
safe repository- relative paths, canonical digest-bound V1 artifacts, and the
three fixed npm scopes. It exposes only sanitized receipts to `scanRepository`;
raw audit streams and execution failures are not stored. The actual runner
boundary parsed each audit stream in memory only, and the checked-in artifact is
a canonical lock-hash-bound sanitized receipt with zero counts for all three
scopes. It remains bounded evidence and is untrusted for overall `PASS`.

The JSR license boundary is implemented in
`pixiedraw2/src/fp-007/jsr-package-review-receipt.ts` and is loaded from
`docs/inventory/fp-007-jsr-license-receipts.json` by `scanRepository`. A receipt
changes a resolved JSR dependency to `MIT` only when its package, exact
specifier/version, lock integrity, lockfile path/hash, digest, and official MIT
source all match. Invalid, mismatched, or absent receipts leave the license
`UNKNOWN` and retain `LICENSE_UNKNOWN`/`BLOCKED`; the receipt never changes the
JSR vulnerability disposition.

Receipt, entry, execution metadata, summary, and severity are complete
allowlists. Artifact writing rejects traversal, root/parent/target symlinks, and
non-directory parents with a fail-closed `lstat` boundary. The isolated
FP007-REWORK-02 replacement fixtures are covered by the focused Node test; this
does not upgrade dirty-worktree, clean-checkout, real-distribution, or same-UID
production qualification.

The fresh inventory authority is regenerated from both sanitized receipt
artifacts and remains top-level `BLOCKED` only because separate release gates
are unresolved. Two fresh runs agree on 7 projects and 0 findings
(`FAIL=0`, `BLOCKED=0`): `LICENSE_UNKNOWN=0` and
`VULNERABILITY_REVIEW_UNKNOWN=0`, with `LOCKFILE_MISSING=0`,
`TOOLCHAIN_UNKNOWN=0`, and `TOOLCHAIN_VERSION_UNPINNED=0`; its canonical SHA-256
is `93a5539b9d8c8e52aaaed0bcd578015e5870f57bf0791a8ed5e7046428a01073`. The
synchronized authority is `docs/inventory/fp-007-dependencies.json`, and the
current evidence is in `docs/inventory/fp-007-evidence.json`. Both
`pixiedraw2/deno.lock` and
`16_IMPLEMENTATION_STARTER/reference-core/package-lock.json` are present and
effective. The receipt changes cover NPM vulnerability dispositions, exact JSR
MIT license classification, and bounded JSR vulnerability review, while the
allowlisted reference-core lock-only repair removes only its historical
`LOCKFILE_MISSING` finding. These are current evidence, not a claim of
clean-checkout, real distribution, Browser, Device, or Production
qualification.

For the `pixiedraw2` scope, the entry/tests/import scan found no external JSR or
npm imports. The Deno 2.8.1 offline cache command was limited to that scope and
exited 0 in frozen mode; because Deno does not materialize a file for zero
resolutions, the canonical Deno lock v5 shape (`version`, empty `specifiers`,
empty `jsr`) was recorded as `pixiedraw2/deno.lock`. No network or cache
download was used. This repair qualifies only the bounded exact-lock JSR MIT
license classification; it does not qualify JSR vulnerability review, toolchain,
npm receipt, or overall FP-007.

The current verification run records 94 passing FP-007 tests with the exact
suite command `deno test -A pixiedraw2/tests/fp-007` (exit 0; 94 passed, 0
failed). The strict type-checking command remains a separate source-check
qualification and is not used to inflate the suite count. The current formatting
check is
`deno fmt --check pixiedraw2/src/fp-007 pixiedraw2/tests/fp-007 pixiedraw2/benchmarks/fp-007`
over 37 files. The current type check is
`deno check --no-remote pixiedraw2/src/fp-007/*.ts pixiedraw2/tests/fp-007/*.ts pixiedraw2/benchmarks/fp-007/*.ts`
(exit 0); the validation is `git diff --check`.

## Offline and privacy boundary

The analyzers operate read-only and offline. A missing offline license or
vulnerability source is `UNKNOWN`/`BLOCKED`, never an inferred approval.
Evidence contains only stable repository-relative paths, hashes, statuses, and
safe diagnostics. It must not contain absolute paths, timestamps, host or user
identity, email, JWT, secret, token, project content, pixel/audio/PXD/Package
body, purchase, entitlement, royalty, or commission content.

## Remediation ownership

- Dependency ranges, lockfiles, vulnerability/license disposition, and existing
  staging nondeterminism belong to a separately authorized dependency/build
  remediation package.
- Clean-checkout and real distribution qualification belong to the release
  qualification owner after a clean input is available.
- Schema adapter registration and legacy compatibility remain explicit schema
  owners; no implicit PXD or PiXiSYNC conversion is introduced here.
- FP-007 coordinator owns cross-track evidence shape and evidence integrity.
- Independent reviewer owns the final review decision and residual-risk record.

## CORE-100 entry condition

`CORE-100` cannot start from this document. It requires a fresh Context/Registry
check after FP-007, all FP-007 acceptance layers reviewed, no unresolved
FP-007-blocking finding, and an explicit next-package authorization. This
package's `autoStartNext` remains false.

Current routes, PiXiEEDraw, PXD, PiXiSYNC, Market, existing projects/assets,
production data, and deployment state are unchanged by this contract.
