# SITE-400 Server-authorized Registry Provider

Status: `COMPLETE_CANDIDATE` / isolated vertical slice

## Scope

SITE-400 connects only this bounded path:

```text
isolated lazy entry
  -> Server Auth Adapter
  -> current Tenant Membership
  -> branded Server Authority Context
  -> Canonical Registry current record
  -> REGISTERED_ASSET identity
```

The Provider does not connect a current public route, Production Auth, DB/RLS,
Storage, Game Studio, Audio Editor, Market, PiXiSYNC, native hosts, or any
deployment surface. It carries identity and revision metadata only; no pixel,
raster, Blob, or PXD payload is copied.

## Authority rules

- Auth and Tenant providers are captured in the server composition root.
- The request accepts identifiers and a session reference only.
- Caller-supplied `ownerId`, `status`, `trusted`, `allowed`, Provider, or
  authority objects are not accepted.
- Membership is revalidated and the branded request context is consumed before
  the Registry read; revocation and stale revisions fail closed.
- The Registry envelope, tenant, project, owner, status, identity shape, and
  reference mode are validated before the host-neutral Draw2 Registry Bridge
  returns an identity.
- `LOCAL_DRAFT` and `VALIDATED_DEFINITION` never resolve through this Provider.
- LIVE/PINNED/REVIEW/FORKED are preserved; SITE-400 does not mutate reference
  mode or source revision.

## Lazy boundary

`pixiedraw2/src/platform/site-400/lazy-entry.ts` is the only SITE-400 entry
point in this slice. It memoizes its loader Promise and has no DOM, current
route, render-loop, pointer, Runtime tick, Game, Audio, or Market import.

## Evidence and limits

The SITE400-01..16 tests use an isolated in-memory Registry and synthetic
server-auth adapter. This proves the contract and attack matrix, not a real
Production Auth/DB/RLS/browser route. Those remain `UNTESTED` and are assigned
to later qualification packages.
