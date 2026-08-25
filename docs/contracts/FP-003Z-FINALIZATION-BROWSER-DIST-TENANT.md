# FP-003Z Finalization — Browser Authority, dist, and Tenant Boundary

Status: isolated implementation complete; independent external audit pending.

## Scope

This finalization closes the remaining FP-003Z boundary findings without starting
FP-004 or WP-900. It applies only to the isolated `pixiedraw2/` implementation and
its build/audit evidence.

## Browser contract

`pixiedraw2/src/fp003z-browser-command-contract.ts` is the only public command
surface for the WP-230/240/250 Browser entries. It accepts bounded IDs, expected
revisions, user input, and presentation references. It does not accept or emit:

- `AuthorizationProofV1`
- an authority resolver or Provider resolver
- server-resolved actor/creator/recipient values
- Financial Authority, License, Contributor, Registry, or Provider objects

The server handler must re-resolve principal, tenant, resource, capability, and
current revision from the authenticated Server Composition Root and Canonical
Registry. The Browser command is not an authority decision.

## Tenant binding

`ServerTenantContextV1` is generated on the Server Registry boundary. The context
is required by `CanonicalRecordRefV2`, `CurrentDirectWorkChain`,
`SecureLedgerCommand`, `MarketSettlementAuthority`, and principal resolution.
Direct Work server methods additionally require a
`ServerAuthorityRequestContextV1` created by the Server Composition Root. The
Browser command never carries this context.

All Direct Work records carry `DirectWorkAggregateIdentity.tenantId`. Registry
lookup keys are tenant-scoped. A same-ID record in another tenant cannot be mixed
into a chain, Payment, or Ledger operation. Ambiguous unqualified fixture lookup
fails closed; production resolution must use the authenticated server context.

Legacy core-only Direct Work records that predate Tenant binding use the explicit
`legacy-compatibility` adapter namespace. This is not a Server Tenant and is not
accepted by the FP-003Z Server Composition Root.

## Build and artifact boundary

Every JavaScript artifact in `pixiedraw2/dist/` must be represented by a `build*`
task in `pixiedraw2/deno.json`. `scripts/audit-fp003z-finalization.mjs` enumerates
the actual directory rather than maintaining a fixed artifact list, verifies the
source entry/output graph, and rejects Server Composition, Registry, resolver,
Provider, and legacy authority Boolean tokens in Browser entries and generated
artifacts.

The stale six-file dist condition was caused by source entries being changed while
the old WP-230/240/250 generated files were not regenerated through the build
tasks. The finalization rebuilds every registered Browser artifact and makes the
audit fail if an untracked or stale artifact returns.

## Residual classification

| Classification | Rule | Finalization result |
| --- | --- | --- |
| `SECURITY_AUTHORITY_SERVER_INTERNAL` | Server Composition/Registry-only authority code | retained only under `pixiedraw2/src/server/` |
| `LEGACY_ADAPTER_ONLY` | Core compatibility resolver retained for isolated server/legacy adapters | not reachable from Browser build entries |
| `POLICY_ONLY` | Consent/region/age or shadow policy state | not converted into AuthorizationProof |
| `DERIVED_STATE` | Boolean derived after canonical Proof validation | allowed only when not an authority input |
| `NON_AUTHORITY` | Presentation or local state | outside the authority boundary |

Caller-injectable authority in Browser entries and generated Browser artifacts is
zero. Legacy adapter occurrences remain explicitly classified and are not exposed
by the Browser build graph.

## Verification gate

The finalization evidence includes Browser runtime attacks, same-ID Tenant A/B
fixtures, mixed-record and cross-Tenant Ledger rejection, all eight stale-chain
rejections, Payment→Ledger binding, FP-001 through FP-003Y and WP-210/220/230/240/250
regressions, full dist/build graph audit, 14/14 inherited Baseline Failure Identity
matches with new identities 0, and `git diff --check`.

Production Registry, Provider, Database, Durable Event, migration, deployment,
publish, route switch, current Draw/PXD/PiXiSYNC/Market data, commit, and push are
out of scope.
