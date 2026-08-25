# CORE-100 — Core Integration Baseline and Adapter Composition

status: COMPLETE
phase: core
kind: core
depends_on: FP-007
implementation_model: Luna MAX
implementation_parallelism: max-4-disjoint-tracks
review_model: Terra High
independent_review: true
next_package: CORE-110
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

Compose the completed FP-004, FP-005, and FP-007 contracts into one isolated PiXiEED Core root.
The root owns validation, current server-context use, event/idempotency decisions, and projection
rules. Adapters own transport and serialization only. This package establishes the fixed boundary;
CORE-110 proves that the boundary behaves consistently under failures.

## Prerequisites and canonical inputs

- FP-007 is independently approved; FP-004 and FP-005 evidence manifests and schema hashes are
  available and have no unresolved blocking finding.
- Use the FP-003AA authenticated server context and AuthorizationProofV1 as the only authority
  input. Read the Core Completion Blueprint, FP-004 contract, FP-005 policy, FP-007 registry,
  Project/Asset/Package Registry contracts, and existing adapter inventories.
- The composition root must be created with explicit typed dependencies. No caller-provided
  `trusted`, `serverAllow`, authority object, provider, or mutable global may select authority.

## Deliverables

- `pixiedraw2/src/core/core-100/**`: one composition root, typed capability declarations, adapter
  interfaces, fail-closed unsupported operations, canonical request/result/diagnostic path, and
  separate Finance, Notification, and Search consumer interfaces.
- Adapter bindings for durable transaction/Inbox/Outbox, privacy/storage policy, schema/build
  policy, and provider-shaped transport. Each adapter declares supported operations and cannot
  bypass Core validation or invent success.
- Default-off feature flag and isolated entry boundary. No import/script-loading/route change to
  `pixiedraw/`, current Market/Social/Admin, PiXiSYNC, Supabase, PXD, or production data.
- Contract, inventory, and ADR evidence mapping the dependency graph, composition identity, and
  adapter capability matrix.

## Non-scope

No product UI, Draw2/Audio/Game feature, provider credential, production Auth/RLS/DB/Storage/queue,
current route replacement, migration, deploy, publish, Commerce execution, native shell release,
or conformance/failure-qualification claim. CORE-100 does not prove the adapters survive failure;
that is CORE-110.

## Invariants

1. There is exactly one isolated composition root for this package and one canonical command /
   context / result path through it. A second authority layer is rejected in review.
2. Core validates tenant/resource/action/capability, schema, input placement, idempotency, and
   event identity before calling an adapter; adapters cannot return success without required typed
   transaction/result records.
3. Unsupported capability, missing provider, stale/revoked context, malformed result, and unknown
   schema fail closed with stable typed diagnostics.
4. Finance, Notification, and Search are separate consumers with separate idempotency/retry
   ownership; one consumer cannot grant another consumer's side effect.
5. Provider objects, DOM/Canvas, UI state, raw blobs, credentials, and current production modules
   are not imported by the Core composition root.
6. Every flag is default OFF and server/route boundary checked; OFF means no route registration,
   provider call, data mutation, or public-navigation connection.

## Attack and failure matrix

| Fixture / injection | Required assertion | Evidence |
|---|---|---|
| Browser/caller supplies `trusted`, provider, context, or capability | Ignored/rejected; only fixed server composition can supply them | `CORE100-SCOPE-001` |
| Missing, expired, revoked, tenant/resource-mismatched context | Deny before adapter invocation | `CORE100-SCOPE-001` |
| Adapter claims `{ok:true}` without transaction/event/result identity | Typed malformed-success error; no projection/side effect | `CORE100-SCOPE-001` |
| Unsupported capability or absent adapter | Stable fail-closed result; no fallback provider | `CORE100-SCOPE-001` |
| Finance/Notification/Search consumer cross-wired | Composition validation fails; side effect stays consumer-scoped | `CORE100-EVIDENCE-001` |
| Feature flag OFF/unknown/route direct access | No registration or mutation; unknown flag is fail-closed | `CORE100-EVIDENCE-001` |
| Existing production route/module inspection | No changed import, script, URL, data, or flag default | `CORE100-STOP-001` |

## Exact acceptance evidence mapping

Create `docs/inventory/core-100-evidence.json` with source paths, composition hash, adapter
capability matrix, fixture ids, commands, exit codes, and independent review.

- `CORE100-SCOPE-001`: composition-root construction and caller/provider substitution attacks;
  authority, capability, malformed-success, and unsupported-operation fail-closed tests.
- `CORE100-EVIDENCE-001`: contract conformance for FP-004/005/007 inputs, separate Finance/
  Notification/Search interfaces, default-off flag tests, and typed diagnostic/result snapshots.
- `CORE100-STOP-001`: source/import/route diff audit, current-route smoke evidence, production
  connection scan, forbidden-action scan, and explicit no-migration/deploy/publish statement.

## Performance, security, privacy, and compatibility

- Measure composition construction and one command path separately from adapter I/O; record cold /
  warm latency and memory for reference fixtures. Do not claim production SLO or full E2E PASS.
- Provider and caller injection are deny-by-default. Logs contain only opaque ids, hashes, typed
  error codes, and bounded diagnostics; no JWT, secret, PII, raw project, or private work content.
- Existing PXD, PiXiSYNC, Market, URL, and project/asset contracts remain read-only compatibility
  references. New adapters require explicit version/capability mapping and do not silently rewrite
  legacy records.

## Checkpoint and stop

Checkpoint records composition/contract hashes, adapter capability matrix, feature-flag defaults,
source graph, evidence manifest, baseline failure identity, and reviewer result. Stop on a second
composition root, caller-controlled authority, provider success ambiguity, production import/route
change, scope violation, or stale Context. Do not migrate, deploy, publish, commit, push, or
auto-start CORE-110.

## Bounded write scope

- `pixiedraw2/src/core/core-100/**`
- `pixiedraw2/tests/core-100/**`
- `pixiedraw2/benchmarks/core-100/**`
- `docs/contracts/CORE-100-*.md`
- `docs/inventory/core-100-*.json`
- `docs/decisions/ADR-*-CORE-100-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules

- Preserve current Market, PiXiSYNC, URLs, data, production fallback, and dirty worktree.
- Do not migrate, deploy, publish, commit, push, or start the next package automatically.
- Do not convert synthetic, isolated, desktop-only, or unavailable evidence into production PASS.
- Stop on missing dependency, stale Context, write-scope violation, authority ambiguity, data-loss risk, or required approval.

## Handoff

Complete only after acceptance evidence, Checkpoint, and independent review are recorded. The next package is
`CORE-110`; `autoStartNext: false`. Wait for explicit instruction.
