# CORE-110 — Core Project / Asset / Package / Event Interoperability

status: COMPLETE
phase: core
kind: core
depends_on: CORE-100
implementation_model: Luna MAX
implementation_parallelism: max-5-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: CORE-120
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

Run one cross-adapter conformance suite against the CORE-100 composition using in-memory,
production-equivalent, and deliberately failing adapters. Prove that identity, revisions,
packages, Event durability, privacy placement, provider identity, and result semantics do not
change with the adapter and that failure/retry/replay cannot create a second side effect.

## Prerequisites and canonical inputs

- CORE-100 has an independent review and a fixed composition hash/capability matrix.
- Use the exact FP-004/005/007 policy and schema versions supplied by CORE-100. Do not create a
  parallel idempotency, AuthorizationProof, money, storage, or schema system.
- Fixtures use synthetic tenants, principals, projects, assets, products, provider callbacks, and
  private/public classifications only. No production credentials or real private content.

## Deliverables

- `pixiedraw2/src/core/core-110/**`: shared conformance runner, adapter fixture factories, failure
  injection controls, side-effect spies, result/digest comparator, and evidence serializer.
- Conformance matrix executed identically against in-memory, restartable production-equivalent,
  and failing adapters. Every test identifies adapter, schema/policy version, fixture, injection
  point, expected typed result, actual result, and side-effect count.
- Failure evidence for authorization loss, malformed provider success, duplicate provider delivery,
  idempotency conflict, aggregate gap/stale version, lease theft, rollback/crash, dispatch pause,
  DLQ/replay, schema mismatch, privacy rejection, and unsupported capability.

## Non-scope

No new Core authority contract, product feature, UI, production adapter, migration, deployment,
route switch, store release, real payment/notification/search side effect, or final device/product
qualification. CORE-110 verifies boundaries; CORE-120 decides qualification readiness.

## Invariants

1. The same canonical fixture and command produce the same typed result, event identity rules,
   aggregate-version behavior, privacy classification, and error identity across adapters.
2. A failing adapter can cause retry/DLQ/unsupported result but cannot bypass Core validation,
   fabricate provider identity, or turn malformed success into a commit.
3. Every injected crash/retry/replay leaves the canonical state and side-effect ledger at the
   contractually expected count; duplicates never produce a second Finance/Notification/Search or
   provider mutation.
4. Lease fencing, authorization revalidation, tenant isolation, schema compatibility, and storage
   placement are exercised in the same runner, not only in adapter-specific tests.
5. Evidence separates `IN_MEMORY`, `PRODUCTION_EQUIVALENT`, and `UNTESTED`; one adapter's PASS
   cannot promote another adapter or production to PASS.

## Attack and failure matrix

| Injection | Required assertion | Evidence |
|---|---|---|
| Authorization revoked between accept and commit | All adapters deny; no state/Event/Outbox mutation | `CORE110-SCOPE-001` |
| Provider `{ok:true}`, unknown status, identity/hash mismatch | All adapters reject malformed success identically | `CORE110-SCOPE-001` |
| Duplicate provider delivery / idempotency conflict | Same delivery one side effect; conflict zero additional side effects | `CORE110-EVIDENCE-001` |
| Gap, stale version, same-version identity conflict | Gap durable, stale ignored, conflict quarantined consistently | `CORE110-EVIDENCE-001` |
| Lease theft/expiry and process crash at each FP-004 point | Stale worker cannot ack/side-effect; recovery preserves counts | `CORE110-EVIDENCE-001` |
| Outbox pause, retry exhaustion, poison, DLQ and replay | Bounded retry, recoverable DLQ, replay `NONE`, zero external mutation | `CORE110-EVIDENCE-001` |
| Schema/policy mismatch and unsupported capability | Fail closed with same version/error contract | `CORE110-SCOPE-001` |
| Cross-tenant locator/private payload | Denied with no existence/content leak | `CORE110-EVIDENCE-001` |
| Production route/provider/data probe | No connection or current-path change | `CORE110-STOP-001` |

## Exact acceptance evidence mapping

Create `docs/inventory/core-110-evidence.json` with one row per fixture/adapter/injection and
include command, exit code, result hash, side-effect counts, restart transcript, and reviewer.

- `CORE110-SCOPE-001`: adapter capability and exact contract-version comparison, authorization
  revocation, malformed success, schema mismatch, unsupported capability, and no-bypass tests.
- `CORE110-EVIDENCE-001`: full failure matrix across all adapter classes, crash/restart/retry/DLQ/
  replay, duplicate/conflict, gap/lease, storage/privacy, and consumer side-effect spies.
- `CORE110-STOP-001`: source graph and environment audit proving no production route/provider/data
  access, no auto-start, and no unmeasured result promoted to PASS.

## Performance, security, privacy, and compatibility

- Record per-adapter p50/p95 for command, commit, consume, retry, and replay, plus queue depth,
  memory, and side-effect count. Separate synthetic/in-memory from production-equivalent numbers;
  no 24/32 ms or production claim without the required E2E evidence.
- Attack tests must prove all adapters fail closed on missing/revoked AuthorizationProof, tenant
  mismatch, malformed provider result, and stale lease. Test output contains no secret or payload.
- Compatibility means identical behavior for the current contract versions and named legacy
  adapters. Real legacy PXD/PiXiSYNC/Commerce compatibility remains separately `UNTESTED`.

## Checkpoint and stop

Checkpoint records composition hash, contract/policy/schema hashes, adapter list, fixture/injection
manifest, side-effect counters, per-adapter results, baseline failure identity, and independent
review. Stop on divergent authority, second trust root, nondeterministic result, unbounded retry,
privacy leak, production access, write-scope violation, or stale Context. Do not migrate, deploy,
publish, commit, push, or auto-start CORE-120.

## Bounded write scope

- `pixiedraw2/src/core/core-110/**`
- `pixiedraw2/tests/core-110/**`
- `pixiedraw2/benchmarks/core-110/**`
- `docs/contracts/CORE-110-*.md`
- `docs/inventory/core-110-*.json`
- `docs/decisions/ADR-*-CORE-110-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules

- Preserve current Market, PiXiSYNC, URLs, data, production fallback, and dirty worktree.
- Do not migrate, deploy, publish, commit, push, or start the next package automatically.
- Do not convert synthetic, isolated, desktop-only, or unavailable evidence into production PASS.
- Stop on missing dependency, stale Context, write-scope violation, authority ambiguity, data-loss risk, or required approval.

## Handoff

Complete only after acceptance evidence, Checkpoint, and independent review are recorded. The next package is
`CORE-120`; `autoStartNext: false`. Wait for explicit instruction.
