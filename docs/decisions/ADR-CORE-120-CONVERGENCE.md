# ADR — CORE-120 convergence gate

- Status: Accepted as an isolated gate implementation; acceptance qualification remains fail-closed until each predecessor row is complete.
- Scope: CORE-120 only

## Decision

Use one deterministic gate around FP-004, FP-005, FP-007, CORE-100, and
CORE-110 evidence. Reuse each predecessor's contracts and hashes. The gate may
report `BLOCKED`; it may not turn missing row-level evidence into PASS.

## Evidence boundary

The evidence generator derives stable file hashes from the current worktree and
records the generated CORE-120 Context hash. It keeps synthetic, isolated,
production-equivalent-shaped, production-integrated, and unavailable checks
separate. The current repository's FP-007 artifact is BLOCKED by its external
clean-checkout qualification state, and this ADR preserves that finding.

## Stop and rollback

The fallback is the current route and the already accepted predecessor
artifacts. `CORE120_STOP_AWAIT_OWNER` remains active. FP-006, release readiness,
production migration, deployment, publication, and store submission require a
new explicit gate decision and are not authorized by this ADR.
