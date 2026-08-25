# ADR-20260810 — FP-003AA Authenticated Server Context

Status: APPROVED in isolated scope after independent three-blocker attack verification.
FP-004 is GO as the next package; FP-004 implementation was not started in this turn.

## Decision

Keep the FP-003Z Composition Root and add a server-only authenticated context derivation boundary.
The request handler authenticates through `AuthPrincipalProvider`, resolves current tenant
membership through `TenantMembershipResolver`, and creates a runtime-branded,
request/resource-bound `ServerAuthorityRequestContextV1`. The handler, rather than the caller,
passes that context to the domain authority service.

The context is short-lived and one-use. Only a principal issued by `SERVER_AUTH_ADAPTER` can cross
the handler derivation boundary. Direct fixtures use the same provider path with a synthetic
verified-session adapter; no alternate test source is accepted. Existing Browser entries remain
unaware of the context module.

The startup Composition Root wires the Registry, AuthPrincipalProvider, and TenantMembershipResolver
once, keeps the domain service private, and freezes the resulting handler. The Release Root exports
only the fixed Handler; Root factories, raw services, context factories, resolvers, and Registries
are not Release Surface. Test DI is isolated in a test fixture module and is not imported or
re-exported by Browser or Release entries. The default isolated export is fail-closed until a real
server Auth Adapter is configured. The fixture models the current membership registry separately
from the principal's session claims and can revoke a membership after the session is issued.
Context consumption re-reads the current membership and compares the bound membership revision,
so revocation or incompatible revision changes invalidate an already-issued context.

The consume operation also reserves the runtime-branded Context before its first asynchronous
membership lookup and releases that reservation on failure. This makes concurrent reuse fail
closed without converting a transient Registry failure into permanent consumption. Direct Work
Chain lookup and Ledger materialization receive both `membershipId` and `membershipRevision` from
the Context. The authoritative Registry must perform a current active-membership conditional check
for both calls; the reference adapter models that as the transaction/conditional-write boundary.
The Composition Service validates the Ledger response before returning success, including the
success value, Payment/Event identity, derived entry type/direction, canonical Money, and hash.

## Why

The previous FP-003Z contract validated fields but did not prove that a principal was authenticated
or that the tenant came from a current server membership. A caller could therefore construct a
shape-valid object. TypeScript types, source naming, and a `source` string are insufficient against
this failure mode. A private runtime brand plus server-only derivation makes the missing binding
explicit and testable without connecting Production Auth or changing RLS.

## Rejected alternatives

- Trusting the old structural type: caller-forgeable and the audited P0 finding remains open.
- Accepting a caller-supplied `trusted`/`serverAllow` Boolean: not a proof of identity or membership.
- Re-exporting server factories from a shared/browser contract: widens the authority boundary.
- Connecting Production Auth or RLS in this package: expands scope and would be a production change.
- Making FP-004 responsible for authentication: mixes durable-event and authority concerns.
- Treating a context-issued membership as permanently valid: permits stale/revoked authority.
- Treating a successful Ledger response as trustworthy because `ok === true`: permits malformed
  financial success values to cross the settlement boundary.

## Consequences

The direct authority service now requires a fresh server-issued context and existing direct-service
fixtures must create one for each call. A context cannot cross a structured-clone or JSON boundary.
Non-finite clocks and Registry exceptions/malformed responses fail closed with typed diagnostics.
The three FP-004-blocking cases are now independently covered: concurrent Context double-consume,
revocation between Chain load and Ledger materialization, and malformed Ledger success responses.
Static source exposure remains a P1 deployment-boundary review item. Production Auth Adapter
integration, real Server Handler transport, and production-equivalent E2E remain explicit
follow-up evidence, not implied by the isolated fixture.

## Rollback

Remove only the FP-003AA isolated server module, handler, fixture, tests, docs, and checkpoint
entries. Do not touch current routes, production data, migrations, deployments, or published
artifacts.
