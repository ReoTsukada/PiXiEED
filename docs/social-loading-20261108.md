# SNS initial loading improvement, 2026-11-08

## Scope and status

Initial implementation and verification used `fix/sns-loading-20261108`, based on `fdca97bb`. Database changes, real-account mutations and public previews are out of scope. The authorized release and its deployment confirmation are tracked separately in the pull request.

The public source reads, authorisation, consent, publication filters, post actions, limits, and storage formats remain the same. The change concerns loading order and display timing on `/feed/` and `/explore/`.

## Diagnosis and implementation

The old API waited for map/showcase reads (including optional showcase placement enrichment) before starting the text/music request, and withheld every post until all sources had settled. Live public read-only inspection observed first-post DOM at 0.76–2.11 seconds in four desktop/mobile-width cases, and the optional `social_post_map_points` request returned 404. Those are individual unthrottled observations, not a representative production percentile. Most visible images were small; the initial request dependency chain was the actionable bottleneck.

- Start three independent public sources concurrently.
- Emit validated, deduplicated, sorted, limit-bounded partial snapshots. Render available posts without waiting for slower sources or optional map links.
- Preserve loading state until all reads settle. Retain errors/retry and never present initial loading as a confirmed empty result.
- Keep existing card/image nodes when data and action state are unchanged. Preserve visible scroll position across insertions and warning-height changes, without undoing the browser's own scroll anchoring.
- Keep Like disabled across partial rerenders and restore retry after failure.
- Generate modulepreload hints for all 12 static dependencies of the SNS entry and minify the 13-module graph without bundling. Dynamic imports and module singleton identity remain intact. Prepare the graph before existing build optimizers; apply output afterward so their parsers see unchanged source.
- Bump the SNS entry/API revision and matching contract tests.

The optional placement endpoint's existing 404 remains visible as a warning. This change does not fabricate map links or alter production schema/permissions to conceal it.

## Reproducible browser comparison

Chrome headless on Mac, new isolated context per run, no service worker, HTTP no-store, gzip static text. Local static responses have an 80ms delay. Synthetic map/showcase reads take 250ms each, optional placement 250ms, text/music 350ms. All external requests are fulfilled by test fixtures or aborted. No CPU throttle. Three runs per viewport/route; values below are medians in milliseconds. These are controlled-test results, not a production speed guarantee.

| Viewport | Route | First post before → after | All sources before → after |
| --- | --- | --- | --- |
| 390×844 | /feed/ | 1482.9 → 686.2 | 1482.9 → 950.0 |
| 390×844 | /explore/ | 1491.6 → 704.9 | 1491.6 → 964.4 |
| 1280×800 | /feed/ | 1578.2 → 655.3 | 1578.2 → 909.8 |
| 1280×800 | /explore/ | 1529.0 → 706.7 | 1529.0 → 963.9 |

First-post DOM improves by 53–58% under these conditions. SNS static graph bytes in actual built artifacts: 215,856 → 172,684 raw (20.0% smaller), 60,148 → 53,008 gzip (11.9% smaller). Requests remain 13; HTML exposes the dependencies immediately instead of four successive discovery rounds.

Run:

```
npm ci --ignore-scripts
npm test
npm run build -- --output <new-outside-checkout-directory>
PIXIEED_SNS_BEFORE=<baseline-build> PIXIEED_SNS_AFTER=<new-build> PIXIEED_SNS_REPORT=<private-output> node scripts/social-loading-browser-harness.mjs
```

## Verification

- Full `npm test`: 3,237 tests passed, no failures/skips.
- Full build and posting-policy check passed. PR CI also runs the synthetic SNS browser checks; only JSON reports are uploaded, never test screenshots.
- Nine API regression tests cover parallel launch, early showcase, optional map enrichment, reference reuse, limits/order, rejected sources, complete failure, callback exceptions, cancellation and timeout behavior.
- Three build tests cover static-only hints, untouched dynamic imports, preserved exports, source-checkout rejection, two-phase application, and deterministic output.
- Browser checks at 320×568, 390×844 and 1280×800 passed: partial display while a source is delayed, Like double action and failure/retry, bookmark, detail close, draft view, history back, composer open/close, image-node reuse, visible scroll anchor, empty/failure states, no horizontal overflow, no uncaught script error, and no unintended remote write.
- Mobile and desktop screenshots inspected. They contain synthetic fixtures and remain outside the source checkout.
- Independent code review findings were fixed and rereviewed.
- Additional existing profile harness: its unrelated globe event-panel close-position assertion fails identically on baseline and new build at 320px. It is not a pass and was not changed in this task. A clearly labelled focused run, excluding globe CSS and unpublished book-room cases, passed 14 profile checks including account/device separation, author validation, deletion confirmation, cleanup retry, list retry and stale private-response rejection after logout. All Supabase responses/actions were synthetic.

## Evidence and limits

Private local evidence is under `/tmp/pixieed-sns-perf-20261108/`:
- `before/`, `after-scroll-fix/` (final built code)
- `browser-verified/results.json` (baseline runs), `browser-final/results.json` (final runs and regression checks)
- `all-tests-passed.log`, `after-scroll-fix-build.log`, `final-bytes.json`
- `profile-regression.log`, `profile-baseline.log`, `profile-focused.log`

Real-device Safari/Firefox, real-account writes, production after-deployment timings, actual ad delivery, and the unrelated globe CSS defect are not verified/resolved by this change. Release requires explicit approval and a separate production verification.
