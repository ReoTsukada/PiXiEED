# ADR-20260810 — FP-003Z Server Authority Root and Persisted Revision Integrity

## Status

Accepted for isolated implementation; pending independent external audit. FP-004 and WP-900
remain NO-GO.

## Decision

Replace the Provider-injectable release path with a fixed server-only Composition Root built on a
`CanonicalRegistryAdapter`. Browser-safe entries receive no Registry, resolver, Provider,
Financial Authority, License, or Contributor service. Test-only composition uses an isolated
in-memory Registry fixture and is not exported from release entries.

Treat command values as identifiers and expected revisions, not authority. Rehydrate the current
Request-rooted Direct Work graph from the Registry on every authority operation. Verify every
record envelope, current head, parent/snapshot version, canonical hash, Provider Event identity,
Financial Authority, and Payment status before deriving settlement or Ledger.

Retire the old caller-created `SERVER_REGISTRY` reference path with an explicit deny result. The
Ledger materializer accepts an ID-only command and performs the Payment lookup itself. Contributor
Snapshot and License semantic authority are resolved from the Registry by Product Revision ID;
extra caller authority fields are rejected by the command boundary.

Regenerate Browser dist through the existing `build:market`, `build:direct-work`, and `build:fp003`
tasks. The build/static audit checks all Browser bundle entries, old source removal, fixed root
composition, build graph, stale token absence, and bounded output size.

## Alternatives rejected

- A stricter caller-supplied `origin`/hash/revision object as the trust root.
- A Provider factory exposed to release code or Browser commands.
- Treating WeakMap/Map process state as persisted authority.
- Connecting Supabase, Production DB, Provider, or Durable Event infrastructure in this package.
- Deleting stale dist files without proving their build graph and regenerating safe outputs.

## Consequences

The real production adapter remains a contract-only boundary and is explicitly UNTESTED. The
isolated fixture proves the complete lookup and derivation path without Production access. Direct
Work stale-chain attacks and authority substitutions are testable independently. The external audit
must still verify the real server composition, transaction boundary, crash recovery, and production
compatibility before FP-004 or WP-900.
