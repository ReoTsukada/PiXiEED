# SITE-460 — Browser Site Connection and Usability

status: COMPLETE_CANDIDATE
phase: platform-site
kind: site-connection
depends_on: PLATFORM-450
implementation_model: Luna Fast
review_model: SOL read-only integration
next_package: NATIVE-500
auto_start_next: false
verification_level: local-browser+feature-flag+existing-route-preservation

## Objective

Make the bounded PLATFORM-450 seam usable inside the existing browser site through a local,
feature-flagged connection path. This package is not a route cutover and does not replace the
current production site, data, providers, or browser fallback.

## Scope

- Add only the smallest browser-facing connection seam required to exercise the existing platform contract.
- Keep the feature disabled by default and reversible through the existing site flag mechanism.
- Verify one local browser smoke path at the supported site entry and preserve the existing route when disabled.
- Reuse PLATFORM-450 contracts/evidence; do not repeat its isolated tests or benchmark.
- Do not re-read or reimplement PLATFORM-450 internal composition/server contracts; reuse the public contracts and existing PLATFORM-450 evidence.

## Implementation contract

- `?site460=on` is accepted only on a local host; the default is OFF and non-local hosts force OFF.
- The connection uses a top-level fixed composition with no exported external dependency injection.
- At minimum, `PUBLIC_WORK_SOCIAL` must reach visible `COMPLETED` status.
- Browser evidence must show zero console/runtime errors and no overlay at `390x844`, `768x1024`, and `1280x900`.
- The existing Draw app must remain operable with the flag disabled.
- Budget: 350 logical source lines, at most 8 tests, at most 2 revisions, Tier 1 plus one browser matrix.

## Acceptance

- `SITE460-CONNECTION-001`: feature-flagged connection reaches the bounded platform seam locally.
- `SITE460-BROWSER-001`: browser smoke evidence records visible success and no console/runtime error on the scoped path.
- `SITE460-PRESERVE-001`: disabled flag preserves the existing route and no production/provider/data mutation occurs.

The implementation may edit only the registered site-460 source/test/benchmark paths plus
`pixiedraw2/index.html`, `pixiedraw2/deno.json`, and `pixiedraw2/dist/site460-browser-entry.js`.
Existing PLATFORM-450 tests and benchmarks are reused and must not be rerun for this package.

## Forbidden

Production deployment, publish, database or migration changes, route replacement/cutover, native/store work,
real private data, real provider activation, commit, and push are forbidden. Local/browser evidence must not be
reported as production qualification. `auto_start_next: false` is permanent.

## Write scope

- `pixiedraw2/src/platform/site-460/**`
- `pixiedraw2/tests/platform-site-460/**`
- `pixiedraw2/benchmarks/platform-site-460/**`
- `docs/contracts/SITE-460-*.md`
- `docs/inventory/site-460-*.json`
- `docs/decisions/ADR-*-SITE-460-*.md`
