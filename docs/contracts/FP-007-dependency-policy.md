# FP-007 Dependency / Clean-room / Secret Exclusion Contract

```yaml
contract_id: PIXIEED-FP007-DEPENDENCY-POLICY-001
status: NO_GO_BLOCKED
version: 1.0.0
mode: offline-read-only
network: disabled
```

## Authority

`pixiedraw2/src/fp-007/dependency-inventory.ts` is the read-only reference for dependency
inspection. It keeps the manifest declaration separate from the lockfile resolution. It does not
edit a manifest, lockfile, Deno configuration, build script, migration, route, or production data.

The inventory is repository-relative and deterministic. It contains no timestamp, hostname,
username, absolute path, secret, token, email, project body, purchased content, or private source.

## Dependency decision rules

| Input | Result |
|---|---|
| Exact `x.y.z` declaration and exact lock resolution | eligible for further review |
| `latest`, `*`, `^`, `~`, wildcard, git/file/local path, or floating JSR range | `FAIL` |
| Missing lockfile or missing exact resolved version | `BLOCKED` |
| Manifest declaration and lock version differ | `FAIL` |
| Unknown origin or registry outside the declared registry | `BLOCKED` or `FAIL` |
| Unknown license or vulnerability disposition | `BLOCKED` |
| No offline vulnerability database | `BLOCKED`; never inferred as safe |

`direct` and `transitive` are recorded independently. Origin, registry, license, vulnerability
disposition, lock hash, and declared toolchain are separate fields. Existing nonconforming files
remain findings; this package does not make them pass by editing them.

The current canonical inventory is recorded in `docs/inventory/fp-007-dependencies.json` and has
7 projects and 0 findings: `VULNERABILITY_REVIEW_UNKNOWN=0`; `LICENSE_UNKNOWN=0`,
`FAIL=0`, `BLOCKED=0`, and `LOCKFILE_MISSING=0`. Its canonical SHA-256 is
`93a5539b9d8c8e52aaaed0bcd578015e5870f57bf0791a8ed5e7046428a01073`; two fresh runs produced
the same projects, findings, categories, and hash. Toolchain-related findings are `0`.
`pixiedraw2/deno.lock` and `16_IMPLEMENTATION_STARTER/reference-core/package-lock.json` are
present and effective. These findings remain evidence for later authorized remediation, not
silent upgrades.

The JSR license artifact at `docs/inventory/fp-007-jsr-license-receipts.json` is loaded by the
canonical scanner. Only a valid receipt whose package, exact version/specifier, lock integrity,
lockfile path/hash, and official MIT conclusion all match the inspected dependency may set
`resolvedDependencies[].license` to `MIT` and remove `LICENSE_UNKNOWN`. An absent, invalid, or
mismatched receipt leaves the value `UNKNOWN` and keeps the license finding `BLOCKED`. The receipt
does not provide a vulnerability disposition; the two JSR dependencies therefore remain
`VULNERABILITY_REVIEW_UNKNOWN`.

## Independent provenance NO-GO checkpoint

The independent provenance audit is a formal `NO-GO` decision. Lock-to-JSR-artifact binding is
`PASS`, but JSR-artifact-to-immutable-source-revision binding is `FAIL`, and the JSR ecosystem OSV
query is `UNSUPPORTED`. Zero findings from a candidate source tag cannot be used because artifact
identity against that source was not proven. No raw URL, host, response, or advisory text is retained.

FP-007 remains `BLOCKED` until all of the following external evidence is supplied and independently
rechecked: immutable source binding; an artifact/source deterministic checksum specification; and an
OSV Git receipt scoped to that exact immutable revision. The MIT license receipt remains valid and
does not satisfy any vulnerability or provenance condition.

### Shared Node toolchain declaration

The root `package.json#pixieedToolchain` declares Node `22.19.0`, npm `10.9.3`,
`nodeMajor: 22`, and `lockfileVersion: 3`, and explicitly inherits only to
`tools/screenshots` and `16_IMPLEMENTATION_STARTER/reference-core`. This follows
the three existing `actions/setup-node@v5` workflows, each pinned to Node
`22.19.0` and guarded by npm `10.9.3`, plus the v3 lockfile format in all three
shared Node scopes. The scanner applies this declaration only to `root`,
`tools/screenshots`, and `16_IMPLEMENTATION_STARTER/reference-core`. Missing,
floating/ambiguous, incompatible, and out-of-bound declarations fail closed;
the current exact declaration resolves as `EXACT_NODE_NPM_PIN` in all three
scopes and emits no `TOOLCHAIN_VERSION_UNPINNED` finding. Exact declaration
evidence does not by itself qualify an immutable runner image or a clean,
real-repository build.

## NpmAuditReceiptV1 and root-lock contract

`NpmAuditReceiptV1` is bounded to the allowlisted repository-relative npm scopes `root`,
`app-shell/pixieed-capacitor`, and `tools/screenshots`. It accepts npm only, records the scope's
lockfile path and lowercase SHA-256 digest, the command identity `npm audit --json`, the total and
low/moderate/high/critical severity summary, a safe `evidenceId`, and sanitized receipt content.
Receipt validation is diagnostic and offline; it does not execute npm or contact a registry.

An absent receipt is outside the vulnerability-verification target and remains legacy `UNKNOWN`.
An explicitly supplied invalid receipt is fail-closed `BLOCKED` as `NPM_AUDIT_RECEIPT_INVALID` and
retains `VULNERABILITY_REVIEW_UNKNOWN`. A valid all-zero receipt changes only the resolved NPM
dependencies in its matching lockfile scope to `REVIEWED_NONE`; this means only that this audit
scope returned zero findings for this lock snapshot. A valid receipt provides only
bounded `RECEIPT_BACKED_BOUNDED` evidence for its matching npm lockfile scope. It does not make
JSR, license review, external-provider review, overall FP-007, or production qualification `PASS`.
Schema validity and vulnerability cleanliness are separate decisions: a nonzero total or any
nonzero severity is always `NPM_AUDIT_VULNERABILITIES_PRESENT` and `BLOCKED`, retains UNKNOWN
dispositions, and is never `PASS` or `RECEIPT_BACKED_BOUNDED`. Only total zero with all four
severity counts zero can produce the bounded `REVIEWED_NONE` disposition.

The V1 artifact is a separate lockfile-hash-bound container. It retains only one sanitized
`NpmAuditReceiptV1` and minimal execution metadata per scope: command identity, exit
classification, and safe `evidenceId`, plus the artifact SHA-256. Runtime timestamps are ambient
input and are rejected at the runner boundary; they are never stored or included in a digest. Raw stdout/stderr,
URLs, hosts, users, tokens, emails, and advisory/package detail are never retained. The offline
loader parses, validates, checks the canonical artifact digest, and returns only the valid receipt
map to `scanRepository(root, { npmAuditReceipts })`; it never runs npm or uses network. The future
runner boundary parses supplied stdout in memory only and is not an audit executor in FP-007.

Receipt V1, entry V1, execution metadata, artifact, summary, and severity objects are complete
allowlists: every key outside the declared schema is rejected before canonicalization or digesting.
The only failure codes are `PROCESS_FAILED`, `NETWORK_FAILED`, `MALFORMED_JSON`, and
`UNSANITIZED_INPUT`. They map respectively to `PROCESS_FAILURE`, `NETWORK_FAILURE`, and
`PARSE_FAILURE` (for the latter two); a receipt maps only to `ZERO_COUNTS` when its total is zero
or `NONZERO_COUNTS` otherwise. A receipt and failure code cannot coexist, and any mismatch is
`BLOCKED`.

Artifact writing accepts only a normalized repository-relative path. The root, every existing
parent component, and an existing target are checked with `lstat`; symlinks, non-directory
parents, traversal, and existing symlink targets are rejected. The filesystem API does not provide
a fully race-free no-follow create-and-replace primitive in this boundary, so callers must use an
exclusive safe root and treat concurrent path replacement between the checks and write as
`UNTESTED`/`BLOCKED`; the checkable symlink and containment boundary is fail-closed.

Exit 0 with all-zero counts is the only receipt-backed bounded-evidence candidate. Exit 1 with
valid nonzero JSON may be recorded but remains `BLOCKED`; process, network, parse, unsanitized,
scope, path, raw-field, lock-hash, and partial-artifact failures produce no valid receipt and an
explicit sanitized blocker. Missing artifact scopes remain `BLOCKED`, distinct from a caller that
supplies no receipt at all. Artifact evidence never qualifies overall FP-007 `PASS`.

For every npm manifest dependency, the package manifest declaration and the package-lock root
metadata declaration are compared for exact equality. Missing, floating, or unequal root metadata
is `ROOT_LOCK_METADATA_MISMATCH` and fail-closed `BLOCKED`.

## Clean-room policy

`clean-room-policy.ts` detects dirty worktrees, untracked distribution files, undeclared generated
files, undeclared environment variables, absolute paths, timestamp/host/locale/random inputs,
cache reliance, and network/registry reliance. The deterministic build input is closed when any
such input is found. Unknown workspace, network, or cache state remains `BLOCKED`.

The current dirty worktree is preserved and recorded as a finding. Existing generated `dist`
artifacts are not deleted or rewritten by FP-007.

## Secret and private-content boundary

`secret-redaction.ts` recursively handles objects and arrays and redacts sensitive fields, bearer
headers, cookies, API keys, JWTs, PEM private keys, email addresses, URL/query values, percent
encoded secrets, base64-encoded secret-shaped values, and configured known secret values. It never
returns the raw secret. Environment evidence records only sorted names, presence, and optionally a
salted SHA-256 fingerprint. The salt is not emitted.

Audit evidence must not contain JWT, email, private key, authorization header, raw blob, pixel,
audio, PXD, Package body, purchase, entitlement, royalty, commission, or project content.

## Acceptance and limitations

- `FP007-DEP-001` is satisfied by deterministic offline analysis and explicit bounded receipts;
  the current repository remains top-level blocked only by later qualification boundaries.
- `FP007-BUILD-001` and `FP007-PROVENANCE-001` consume the clean-room result; this Track 2 does
  not claim a clean checkout or a repeat build from the dirty worktree.
- Real production provider, RLS, Store, device, legacy-user-data, and vulnerability-service
  behavior remains `UNTESTED` or `UNKNOWN`.
- This checkpoint is not a GO, completion, or production-readiness decision; `CORE-100` must not
  start from FP-007 while the NO-GO conditions remain.
