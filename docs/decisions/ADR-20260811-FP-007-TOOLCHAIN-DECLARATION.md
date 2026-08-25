# ADR: FP-007 shared Node toolchain declaration

Status: `NO_GO_BLOCKED`

## Decision

The three Node scopes covered by this patch use one root-owned declaration in
`package.json#pixieedToolchain`:

```json
{
  "nodeMajor": 22,
  "nodeVersion": "22.19.0",
  "packageManager": "npm",
  "npmVersion": "10.9.3",
  "lockfileVersion": 3,
  "inheritsTo": [
    "tools/screenshots",
    "16_IMPLEMENTATION_STARTER/reference-core"
  ]
}
```

This is an exact Node/npm declaration. `.nvmrc` records `22.19.0`; all three
existing `actions/setup-node@v5` workflows use `node-version: 22.19.0` and fail
closed unless `npm --version` is `10.9.3`. The root workflow continues to use
`npm ci`; and the root, screenshot, and reference-core lockfiles all use npm
`lockfileVersion: 3`. The scanner resolves `EXACT_NODE_NPM_PIN` for each of the
three allowlisted scopes and reports zero toolchain-related findings.

`root`, `tools/screenshots`, and
`16_IMPLEMENTATION_STARTER/reference-core` are the complete inheritance
boundary. The scanner resolves the root declaration for those paths only. A
missing declaration is `TOOLCHAIN_UNKNOWN`; incomplete, floating, ambiguous,
incompatible, or unauthorized declarations are `FAIL`/`BLOCKED`. A major-only
declaration is rejected as a current exact-pin claim and is not treated as a
reproducibility-resolved toolchain. The
Capacitor package, Deno projects, production routes, application runtime, and
all other package scopes do not inherit this policy.

## Evidence

- `.github/workflows/generate-market-ogp.yml`: setup Node 22, npm cache, and
  `npm ci` from the repository root.
- `.github/workflows/generate-pixfind-ogp-pages.yml`: setup Node 22.
- `.github/workflows/generate-social-seo-pages.yml`: setup Node 22.
- `package-lock.json`, `tools/screenshots/package-lock.json`, and
  `16_IMPLEMENTATION_STARTER/reference-core/package-lock.json`: lockfile v3.
- `pixiedraw2/src/fp-007/dependency-inventory.ts`: the allowlisted resolver,
  fail-closed scope/declaration checks, exact Node/npm policy, and rejection of
  major-only declarations.

## Consequences and limits

The declaration removes ambiguity in the three shared Node scopes without
altering dependencies, lock resolution, install state, or application behavior.
The exact Node/npm pin is current evidence and removes the three historical
`TOOLCHAIN_VERSION_UNPINNED` findings from the current scan. Immutable runner-
image verification, clean-checkout repeat builds, real distribution provenance,
and the remaining `VULNERABILITY_REVIEW_UNKNOWN` findings keep
FP-007 qualification blocked.

## Independent audit NO-GO checkpoint — 2026-08-11

Two fresh offline scans using the sanitized npm audit and JSR license artifacts agree on
7 projects, 2 findings, `FAIL=0`, `BLOCKED=2`,
`LICENSE_UNKNOWN=0`, `VULNERABILITY_REVIEW_UNKNOWN=2`, and canonical SHA-256
`0c1b0224bcac466899ed030852fc8a488aebb97222e56992259c856c147ff1af`.
Toolchain-related findings are `0`. Browser, Device, Production, clean
checkout, real distribution provenance, and the full 63/77 baseline remain
unexecuted or blocked by the stated qualification boundary.

No network, npm install, migration, route access, deploy, publish, commit, or
push is part of this decision.

The independent provenance audit fixes the package decision at `NO-GO`/`BLOCKED`: lock-to-JSR-
artifact binding passed; JSR-artifact-to-immutable-source-revision binding failed; and the JSR
ecosystem OSV query was unsupported. Candidate source-tag OSV zero findings are excluded because
artifact identity was not proven. The valid MIT license receipt remains license-only evidence.

解除条件は、同一のimmutable revisionに対するimmutable source binding、artifact/source
deterministic checksum specification、revision-scoped OSV Git receiptの三つの外部証跡を
揃え、raw URL/host/response/advisory本文なしで独立再監査すること。これが満たされるまで
FP-007をGO、完了、production-readyとして扱わず、CORE-100を開始しない。
