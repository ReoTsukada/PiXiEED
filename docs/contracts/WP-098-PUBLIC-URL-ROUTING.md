# WP-098 Public URL and Routing Core Contract

## Scope

WP-098 adds an unloaded, framework-free Public URL Routing Core under
`core-shell/`. It records the current WP-000 route snapshot, resolves canonical and
legacy-compatible paths, and returns a redirect candidate before any host applies it.
It does not change an existing HTML route, server redirect, sitemap, production data,
PXD, PiXiSYNC, Market, Project, Purchase, Entitlement, or Storage record.

## Route registry

- The 50 current HTML routes in `docs/inventory/route-inventory.json` are copied into
  `CURRENT_ROUTE_SNAPSHOT` with source, kind, visibility, authentication, and rollback metadata.
- The compatibility Catalog currently has 58 records: the 50 current records plus typed dynamic
  or legacy forms for Market, PiXFiND, PiXiEEDraw project queries, and post detail URLs.
- Dynamic Market item routes use a typed UUID `itemId` and a server resource resolver.
- Existing generated PiXFiND puzzle paths and `/market/item.html?id=<uuid>` are legacy
  compatibility inputs; their canonical destinations are `/pixfind/?puzzle=<id>` and
  `/market/items/<uuid>/` respectively.
- Existing `index.html` aliases, `/pixfind/index.html?puzzle=<id>`, `/pixiedraw/?project=<id>`,
  `/post/?id=<id>`, and `/posts/<id>/` are resolved without altering their current source files.
- `/pixiedraw/` remains a current public route. Private Account/Market management routes
  require a server permission decision and are never inferred from client state.

## Resolution and privacy

Resolution accepts same-origin HTTP(S) paths only. Unknown, malformed, cross-origin,
deleted, trashed, quarantined, private, and unlisted resources fail closed. An existing
private resource may return a server-authorized result, but it cannot become Public Discovery.
Legacy IDs are validated before the injected server resolver is called. The resolver receives
`source: "server"`; client-selected resource visibility is not trusted.

## Redirect and metadata rules

The default is `shadow`: the Core returns a bounded 308 candidate and preserves the current
path. Applying a redirect requires the Redirect Flag, a trusted server permission decision,
and an injected proof with both `canonicalVerified` and `privacyVerified`. No arbitrary external
destination is accepted, and `prepareRedirect` provides a recoverable proof gate.

Canonical metadata is produced only from a successful Public resolution and a server metadata
adapter. Non-public results return `noindex,nofollow` with no canonical or Open Graph URL.
Metadata is bounded and excludes project bodies, purchase/entitlement/rights/commission data,
JWT, secrets, email, payment data, raw media, and package bytes.

## Feature flags and rollback

All five Public URL flags default OFF. Unknown, disabled, or killed flags fail closed. The
rollback result is `KEEP_CURRENT_ROUTE`, with no redirect applied and no public metadata cutover.
The isolated entry may be tested independently, but it is not connected to current HTML routes.

## Cost-aware transport boundary

The canonical realtime decision is recorded in
`02_ARCHITECTURE/COST_AWARE_REALTIME_POLICY.md`. URL resolution is an
`ASYNC_ON_DEMAND` metadata/discovery read; route registry reads are local/static, and a route
transition may issue only a bounded server request after permission filtering. WP-098 does not
open a permanent Realtime subscription or add route high-frequency events.
