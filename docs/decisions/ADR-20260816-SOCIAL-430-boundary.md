# ADR-20260816-SOCIAL-430 Boundary

Status: `ACCEPTED_FOR_ISOLATED_REFERENCE`
Package: `SOCIAL-430`
Decision owner: SOL MAX (read-only coordinator)
Implementation: Luna MAX
Independent review: Terra High required

## Decision

Implement SOCIAL-430 as a pure in-memory composition boundary under
`pixiedraw2/src/platform/social-430/`. Reuse the stable WP-230 entity vocabulary
and WP-160 `AuthorizationProofV1`/hash helpers, while adding a server-only
composition root that closes over the authority capability, tenant-bound proof expectations,
canonical current-state lookups, deep privacy rejection, current-state Card
redaction, canonical Event-ID projection with payload integrity verification,
idempotent duplicate handling, lifecycle-Event-bound visibility revoke, and
explicit non-commerce Market Card markers.

The public dependency direction is fixed as `caller → contracts.ts`; the
server-only composition root is physically separate and closes over the
capability. `contracts.ts` exports no server factory/class/adapter/capability,
and caller handlers have no authority parameter. Resolver outputs are accepted
only when requested ID/type/tenant/version/cardType and bound revision/content
identity match. Event projection re-resolves the canonical Event ID, producer
proof, payload hash, aggregate, and exact current version before acceptance or
visibility revoke.

## Alternatives rejected

- Editing the current SNS, Market, PixFind, account, or public URL routes would
  violate the preservation gate.
- Calling Supabase, provider SDKs, moderation, Search, Notification, or Storage
  would turn an isolated reference into an unqualified production integration.
- Trusting client visibility, producer, recipient, or moderation claims would
  permit cross-tenant and stale-content leakage.
- Re-running completed WP-230 or WORK-420 packages would violate the package
  dependency and evidence-reuse policy.

## Consequences

The new boundary can be tested deterministically with synthetic fixtures and
reused Harness entries (`baseline-wp000`, `qualification-evidence-v1`,
`context-integrity`, the core-security boundary validator, `durable-event`, and
`market-pixisync-baseline`). Real provider/RLS/moderation/Search/Notification,
device, and production behavior remain untested and require their own gate.

No migration, route cutover, production data access, deploy, publish, commit, or
push is performed by this decision.
