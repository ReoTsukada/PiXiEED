# FP-003AA — Authenticated Server Context Contract

Status: APPROVED in isolated scope after independent three-blocker attack verification.

FP-004 is GO as the next isolated package, but its implementation has not been started in this
turn. Production Auth/DB/RLS, deployment, migration, and production-equivalent evidence remain
later gates.

FP-003AA closes the remaining FP-003Z boundary finding: a structurally valid
`ServerAuthorityRequestContextV1` must not be accepted as proof that an authenticated principal
owns or may access a tenant/resource. This package changes only the isolated `pixiedraw2/`
server-side reference boundary. FP-004, FP-005+, WP-900+, production integration, migration,
deploy, publish, commit, and push remain out of scope.

## Authority path

```text
request + session reference
  -> AuthPrincipalProvider.authenticate()
  -> authenticated, lifetime-valid principal
  -> TenantMembershipResolver.resolve()
  -> canonical active membership bound to that principal
  -> runtime-branded request context
  -> Composition Root
  -> Direct Work authority service
```

The handler receives no context argument. It derives one internally and passes it to the
Composition Root. The resolver must consult a `CanonicalTenantMembershipRegistryV1` for the
current membership and the server-side canonical record registry for the current resource, then
return exactly one active membership. `deriveServerAuthorityRequestContext` re-reads the
membership from that canonical membership registry and compares principal ID, membership ID,
tenant ID, and ACTIVE status before binding it. No caller-provided tenant, principal, role,
capability, amount, or record is treated as authority.

`createServerAuthorityCompositionRoot` wires the Registry, AuthPrincipalProvider, and
TenantMembershipResolver once at server startup, keeps the domain service private, and freezes the
returned handler. The Release Root exports only the fixed `fp003zHandler`; it does not export a
Root factory, raw service, context factory, resolver, or Registry. Test DI is isolated in
`tests/fixtures/fp003aa-test-composition.ts` and is not imported or re-exported by Browser or
Release entries. The default isolated export is fail-closed until a real server Auth Adapter is
configured. The FP-003AA fixture uses a separate current-membership map and explicit revocation
operation to model the same server-side boundary.

## Runtime contract

`AuthenticatedServerPrincipalV1` contains the server Auth Adapter result, including principal ID,
auth session ID, authentication source, assurance, active/suspended/revoked memberships,
`AuthorizationProofV1`, issued time, expiry, and correlation ID.

`ServerAuthorityRequestContextV1` contains only values derived by the server Composition Root:

- principal and auth session binding;
- request/resource binding;
- active canonical tenant membership;
- canonical membership revision bound at issuance and re-read at context consumption;
- short lifetime bounded by the principal expiry;
- trace-only correlation ID;
- `SERVER_COMPOSITION_ROOT` source marker.

The source marker is descriptive, not the security mechanism. The security mechanism is a private
runtime brand held by the server module. A plain object, object spread, JSON round trip, or
`structuredClone` therefore cannot become an authority context. A context is consumed once for
the expected Direct Work request. Consumption reserves the server-issued object before the first
asynchronous membership lookup, so concurrent callers cannot both consume the same Context. A
failed lookup releases the in-flight reservation for a safe retry. Consumption re-reads the
current membership and rejects replay, expiry, revocation, suspension, incompatible revision
changes, mismatched resource, and wrong tenant.

Only principals issued by the private `SERVER_AUTH_ADAPTER` issuance primitive cross
`deriveServerAuthorityRequestContext`. The source value is fixed by the issuer and is not
accepted as caller input. Direct contract fixtures use the same provider path with a synthetic
verified-session adapter; there is no alternate test source accepted by the handler.

## Browser boundary

`src/server/internal/authenticated-context.ts` and `src/server/server-authority-handler.ts` are
not imported by Browser entries. Browser commands remain identifier/input envelopes. Browser code
cannot construct the private WeakSet brands, and server authority values are neither accepted as
Browser command fields nor emitted by Browser bundle entries.

## Failure behavior

Authentication failure, unknown session, invalid proof, expired/future principal, non-finite clock
values, inactive or ambiguous membership, missing current registry record, stale membership
revision, request/resource mismatch, forged context, clone/spread, and replay all fail closed.
Registry exceptions, null/undefined results, malformed responses, missing revisions, and
impossible states normalize to typed deny diagnostics rather than fallback allow. The server handler returns
`SERVER_AUTHENTICATION_REQUIRED` when derivation fails; the domain service returns
`SERVER_CONTEXT_INVALID` when a context is missing, forged, stale, mismatched, revoked, or already
used, and `REGISTRY_UNAVAILABLE`/`REGISTRY_INVALID_RESPONSE` for Registry failures. Chain retrieval
and Ledger materialization carry the bound `membershipId` and `membershipRevision`; the
authoritative Registry must condition both operations on the current active Membership. A
revocation between Context consumption and Ledger materialization therefore denies the settlement
instead of persisting a stale financial result. Ledger success responses are validated for shape,
current Payment/Event identity, derived type/direction, canonical Money, and hash presence; an
`{ok:true}` response without a valid value is never a success.

## Compatibility and rollback

Existing FP-003Z direct service fixtures now use an isolated server-issued fixture context. Existing
production paths are not changed. Rollback is limited to removing the FP-003AA server handler,
internal context module, fixture, tests, and associated documentation/checkpoint changes; no
production migration or data rollback is required.

## Verification status

The finalization test set covers Release Root Handler-only exports, isolated Test DI, authenticated
handler composition, caller-created shape-valid context, fake session, unauthorized tenant,
same-ID wrong resource, expired/future principal, revoked current membership after issuance,
incompatible membership revision, non-finite clocks, malformed/throwing Registry, one-time replay,
clone/spread, correlation-only behavior, Browser import exclusion, concurrent Context consume,
concurrent Settlement single-Ledger behavior, revoke-between-chain-and-Ledger, and malformed
Ledger success responses. FP-003AA is 17/17 and FP-003Z remains 14/14. The independent attack
harness reports concurrent consume `true/false` with one membership lookup, concurrent Settlement
`true/false` with one Ledger call, `STALE_MEMBERSHIP` after revocation, and four malformed Ledger
responses rejected as `REGISTRY_INVALID_RESPONSE`. Existing FP-001 through FP-003 and
WP-210/220/230/240/250 regressions and the inherited 14 Failure Identities remain required
evidence. Static source/deployment inventory is a P1 review item; current production deployment
is UNTESTED. Production Auth Adapter, real Auth/RLS, browser/device matrix, and
production-equivalent E2E remain UNTESTED.
