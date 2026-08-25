# CORE-120 Core Completion and Cross-Core Convergence

Status: qualification gate implementation; acceptance-level evidence gaps remain
fail-closed and named.

CORE-120 is a fail-closed evidence gate. It does not create a second authority,
transaction, storage, schema, money, or event system. It reads the accepted
predecessor artifacts and compares shared identity, revision, package, event,
result, contract, schema, and build material.

The generated artifact must keep `IMPLEMENTED_ISOLATED`,
`PRODUCTION_EQUIVALENT`, `PRODUCTION_INTEGRATED`, and `UNTESTED` separate.
Synthetic and production-equivalent-shaped fixtures are never production
qualification. Missing acceptance-level trace, exit code, reviewer, or hash is
a named blocker rather than an inferred pass.

The gate also records duplicate event IDs, replay side effects, malformed
success, authority split, private-payload leakage, changed paths, provider
access, baseline identity, rollback route, stop flag, and the explicit owner
authorization required before FP-006. It never starts FP-006 automatically.

Production Auth/DB/RLS/provider access, current routes, Draw, PXD, PiXiSYNC,
Market, production data, migration, deploy, publish, store release, commit,
and push are outside this gate.
