# Current production boundaries — WP-000

調査日: 2026-08-06

目的は、後続 Work Package が current path を切断しないための境界記録である。WP-000では本番データ、migration適用、Edge Function deploy、web/native publish、commit/pushを行っていない。

## Boundary map

| Boundary | Current implementation | Current control / rollback evidence |
| --- | --- | --- |
| Public web source | Root pages, `market/`, `pixfind/`, `pixiedraw/`, `pixiee-lens/`, `projects/`, shared `scripts/` | `CNAME`, `sitemap.xml`, HTML script cache-busters, and source route inventory. |
| PiXiEEDraw runtime | `pixiedraw/index.html` + `pixiedraw/assets/js/app.js` + currently loaded module files | `SHARED_PROJECTS_ENABLED=false`; `PIXISYNC_V1_ENABLED=true`; `window.__PIXISYNC_V1_CONFIG__`; build `20260803-178`; service-worker cache `pixiedraw-v<buildId>`. |
| Local persistence | IndexedDB and File System Access API paths listed in `storage-and-formats.json` | Browser-local state; no local user content copied into WP-000 fixtures. |
| Market database | `supabase/migrations/*.sql`, current Market RPCs, RLS/policies | `market_current_user_is_dev`, `market_listing_is_enabled`, seller/reviewer/admin checks; live state not queried. |
| Market private files | `market-private` Storage bucket and signed URL Edge Functions | Source policies and function boundaries recorded; object counts and live policy behavior not verified. |
| PiXiSYNC database | `collab_v1` schema, RPCs, RLS, `pixisync-checkpoints` bucket | Revision/checkpoint/session contracts and tests recorded; no realtime channel or production object was touched. |
| Stripe | Market/PiXiSYNC Stripe Edge Functions and `_shared/market-stripe.ts` | API version source reference `2025-06-30.basil`; no key, webhook dashboard, or live event was inspected. |
| Capacitor/native | `app-shell/pixieed-capacitor` staging scripts and native projects | `npm run doctor` passed with 34 entries; no `cap:sync`, archive, signing, or store publish ran. |

## Release and rollback controls

1. Web/PiXiEEDraw release identity is the build info loaded by `pixiedraw/index.html`; the service worker derives its cache name from the build ID and network-firsts executable assets.
2. Legacy shared-project behavior remains disabled by `SHARED_PROJECTS_ENABLED=false`; enabling or removing it is a separate compatibility decision.
3. PiXiSYNC V1 remains independently gated by `PIXISYNC_V1_ENABLED` and optional `window.__PIXISYNC_V1_CONFIG__`; normal active focus recovery does not create a new realtime connection.
4. Market access/write gates and server-side RLS/RPC checks are distinct. A UI visibility change cannot be treated as a server authorization change.
5. Database migration status and frontend cache identity are separate release states. The read-only migration list showed matching local/remote columns through `20260805020000`, but no push or production verification was done.

## Known source/document mismatch

`docs/project-file-map.md` says production PiXiEEDraw is a single-file path that does not load modules. The inspected current `pixiedraw/index.html` does load `assets/js/modules/*.js` and `assets/js/app.js`. WP-000 records the discrepancy for a later documentation correction; it does not change runtime files.

## Explicit non-evidence

The following remain unknown: live production row counts, Storage object counts and hashes, current Stripe webhook destinations/replay state, deployed HTML cache-buster identity, native signing state, and browser/device behavior not covered by the commands in `.codex/PIXIEED_TEST_RESULTS.md`.
