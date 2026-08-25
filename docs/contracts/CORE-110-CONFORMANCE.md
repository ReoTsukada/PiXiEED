# CORE-110 Conformance Contract

Status: independently reviewed and accepted for isolated qualification.

CORE-110 executes one conformance runner against the existing CORE-100
composition root. The runner varies only adapter fixtures; it does not create a
second authority, money, idempotency, storage, or schema contract.

## Reused boundaries

- CORE-100 is the only Composition/Authority/Result entry point and remains
  default `OFF` outside the explicitly enabled synthetic test root.
- FP-004 supplies the durable transaction result, aggregate revision rules,
  Inbox/Outbox lease fencing, bounded retry, DLQ, crash points, and
  side-effect-free replay mode.
- FP-005 supplies the existing storage policy, locator validation, tenant
  binding, and privacy placement decisions.
- FP-007 supplies canonical schema identity and digest resolution.

The in-memory fixture is an isolated reference. The production-equivalent
fixture is restartable and shaped like the durable boundary but is not a
production database or provider. A deliberately failing fixture is labelled
`UNTESTED` and is allowed to return typed failures only.

## Result and evidence rules

Result comparison canonicalizes stable object key order and normalizes only
commit timestamps. Error identity is based on the typed result and diagnostic
code, not adapter-local text. Evidence keeps adapter class, command, exit code,
result hash, side-effect counters, and restart transcript on every row.

`IN_MEMORY`, `PRODUCTION_EQUIVALENT`, and `UNTESTED` are never collapsed. No
synthetic benchmark is a production-performance claim. Freshly generated
evidence starts with `independentReview: PENDING`; the accepted artifact
records the independent reviewer explicitly. Production providers, live
Auth/DB/RLS, devices, legacy user data, and production performance remain
`UNTESTED`.

## Negative-case contract

The suite covers authorization revocation between acceptance and commit,
malformed provider success and identity mismatch, duplicate/conflicting
delivery, aggregate gaps and stale/same-version conflicts, FP-004 crash points,
lease fencing and expiry, outbox pause/retry/poison/DLQ/replay, schema/policy
mismatch, unsupported capability, and cross-tenant locator denial without
payload disclosure.

No browser, route, production Auth/DB/RLS/RPC, provider, migration, deploy,
publish, store, or current PiXiEED/PiXiSYNC/Market path is imported.
