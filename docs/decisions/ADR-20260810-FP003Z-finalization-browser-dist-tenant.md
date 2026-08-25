# ADR — FP-003Z Finalization: Browser, dist, and Tenant boundaries

- Date: 2026-08-10
- Status: Accepted for isolated implementation; external audit pending
- Scope: `pixiedraw2/` only

## Decision

Keep the existing FP-003Z Server Composition Root and persisted stale-chain/
Payment→Ledger checks, then close the remaining boundaries with three explicit
rules:

1. Browser WP-230/240/250 entries export only bounded command envelopes. Authority
   is resolved by the server handler from the authenticated session and Canonical
   Registry; Browser input cannot provide a Proof, resolver, actor, or authority
   object.
2. Tenant identity is part of every canonical reference and Direct Work graph.
   Server Direct Work methods require a Composition-Root request context, and all
   Registry/ledger reads are tenant-scoped.
3. Generated artifacts are audited from the actual `pixiedraw2/dist/` directory
   against every `build*` task. A stale or untracked Browser artifact is a failure.

## Alternatives rejected

- **Trust a Browser-supplied Proof or resolver:** rejected because a caller can
  fabricate an apparently server-issued decision.
- **Resolve Tenant from an unqualified ID only:** rejected because the same ID can
  exist in multiple tenant namespaces; ambiguous lookup must fail closed.
- **Maintain a six-file dist allowlist:** rejected because stale artifacts outside
  that list escape audit.
- **Rewrite the existing WP-230/240/250 cores immediately:** rejected because they
  remain isolated legacy adapters used by existing regression fixtures. They are not
  Browser build entries; their residual resolver contracts are explicitly classified
  and excluded from generated Browser artifacts.
- **Start FP-004 or WP-900:** rejected because this package is a boundary
  finalization and must be externally audited first.

## Consequences

The Browser API is smaller and cannot construct an authority result. Server command
handlers must do the additional Registry lookup. Direct Work test fixtures now
support two tenants with the same record IDs and detect mixed chains. Legacy
core-only records use the explicit `legacy-compatibility` adapter namespace, which
is never treated as an authenticated Server Tenant.

## Evidence

- `scripts/audit-fp003z-finalization.mjs`
- `pixiedraw2/tests/fp003z-finalization.test.ts`
- `pixiedraw2/tests/fp003z-attack-matrix.test.ts`
- `pixiedraw2/tests/fp003z-persisted-authority.test.ts`
- `scripts/test-baseline-failure-identity-wp080.mjs`

No production migration, route change, data mutation, deploy, publish, commit, or
push is part of this decision.
