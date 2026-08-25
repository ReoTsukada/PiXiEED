# ADR — SITE-400 local App Shell route qualification

## Status

Accepted for isolated local qualification only.

## Decision

SITE-400 connects through the existing noindex `/core-shell/` App Shell only
for local qualification. The normal Shell remains server-route denied and the
Draw2 route remains unavailable by default. An isolated browser harness may
enable a fixed local server-route/tenant fixture before the Shell loads. That
fixture is not a client authority proof and is ignored outside the isolated
Core Shell entry.

When the Shell access contract is enabled, it lazy-loads the Draw2 route. The
route mounts a small SITE-400 status projection and then loads the browser
entry, which invokes the existing server composition and resolves only a
`REGISTERED_ASSET` identity, tenant, and Registry revision. No pixel, PXD,
audio, game, Storage payload, Canvas, Timeline, or Runtime state is copied or
created by this route.

## Consequences

- Browser evidence can prove App Shell → server-route gate → feature flag →
  lazy route → server composition → tenant membership → registered identity.
- OFF, unknown, denied, or invalid requests remain fail-closed and do not
  prefetch the route chunk.
- Production Auth/DB/RLS/Storage, artifact-byte authenticity, current public
  routes, Game/Audio/Market consumption, native packaging, deploy, and
  cutover remain later qualification work.
- The `core-shell/**` and local `pixiedraw2/index.html` integration files are
  explicitly local SITE-400 acceptance surfaces; no current public route is
  modified or redirected.
