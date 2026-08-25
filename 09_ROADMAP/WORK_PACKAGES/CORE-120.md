# CORE-120 — Core Completion and Cross-Core Convergence Gate

status: COMPLETE
phase: core
kind: gate
depends_on: CORE-110
implementation_model: Terra High
implementation_parallelism: max-2-disjoint-tracks
review_model: Sol MAX
independent_review: true
next_package: FP-006
auto_start_next: false
verification_level: isolated-reference+targeted-tests+independent-review

## Objective

Operate as a qualification gate, not a feature implementation or production release. Confirm that
FP-004, FP-005, FP-007, CORE-100, and CORE-110 form one reproducible isolated Core with no open
blocking P0, complete evidence mapping, explicit residual UNTESTED items, and a safe handoff to the
Draw2 phase (`FP-006`). A pass here never means production integration.

## Prerequisites and canonical inputs

- All predecessor packages are explicitly approved by their independent reviewers; their source,
  contract, schema, and evidence hashes match the current Context.
- Read the Core Completion Blueprint, every predecessor acceptance manifest, current implementation
  reality inventory, preservation gate, and baseline-failure identity. Do not infer PASS from a
  source file or from a synthetic test alone.
- The qualification bundle uses only synthetic/production-equivalent fixtures and records its
  environment, toolchain, adapter class, and evidence level.

## Deliverables

- `pixiedraw2/src/core/core-120/**` only if a gate/evidence helper is needed; no new authority or
  product behavior.
- `docs/contracts/CORE-120-*.md`, `docs/inventory/core-120-evidence.json`, and an ADR/checkpoint
  containing predecessor hashes, acceptance matrix, residual findings, rollback path, and handoff.
- A qualification report with package status, exact test commands/exit codes, artifact identities,
  adapter/provider classification, baseline comparison, production-nonintegration statement, and
  explicit `UNTESTED` list for devices, live providers, real legacy data, staging, and cutover.

## Non-scope

No Draw2/Audio/Game implementation, native/store release, provider credentials, production DB/
Storage/queue/Auth/RLS, migration, deployment, publication, route replacement, current data change,
commit, push, or automatic start of FP-006. WP-900 remains the later release-readiness authority;
CORE-120 cannot authorize it or CUT-001.

## Invariants

1. Core completion is true only when every predecessor acceptance id has source-traceable evidence,
   exit code, artifact hash, and reviewer; missing evidence is not silently waived.
2. Contract/schema/build hashes in the report equal the generated Context and source tree used by
   the tests. Stale or mixed Context invalidates the gate.
3. No open blocking P0, authority split, privacy leak, malformed-success path, duplicate financial
   side effect, non-deterministic build, or production connection is allowed.
4. Existing production routes, Draw, PXD, PiXiSYNC, Market, projects, assets, purchases,
   entitlements, licenses, royalties, DB, and Storage remain byte/behavior unchanged by this gate.
5. `IMPLEMENTED_ISOLATED`, `PRODUCTION_EQUIVALENT`, `PRODUCTION_INTEGRATED`, and `UNTESTED` are
   reported separately. No isolated result is promoted to production qualification.
6. Handoff to FP-006 is a record only; `auto_start_next` remains false and no Draw2 code is run by
   this gate.

## Attack and failure matrix

| Gate challenge | Required assertion | Evidence |
|---|---|---|
| Missing predecessor row/hash/reviewer | Gate blocks with named missing evidence | `CORE120-GATE-001` |
| Stale Context or mixed contract/schema version | Gate blocks; no result is promoted | `CORE120-GATE-001` |
| Any FP-004/005/007 or CORE-100/110 P0 | Gate is NO-GO with finding identity and owner | `CORE120-GATE-001` |
| Duplicate/side-effect/replay regression | Gate blocks and reports exact consumer/count | `CORE120-CONVERGENCE-001` |
| Current route/import/data/prod provider probe | No change/access; violation is immediate STOP | `CORE120-NONINTRUSION-001` |
| Isolated result presented as production/device/live data PASS | Classification remains isolated/UNTESTED | `CORE120-NONINTRUSION-001` |
| Rollback/stop flag/consumer pause rehearsal | Accepted evidence remains recoverable and current path remains fallback | `CORE120-HANDOFF-001` |

## Exact acceptance evidence mapping

Create `docs/inventory/core-120-evidence.json` with one row per acceptance id and predecessor id,
source/context/schema hashes, test command, exit code, adapter class, classification, reviewer,
finding identity, and residual UNTESTED list.

- `CORE120-GATE-001`: all predecessor acceptance rows complete, no blocking P0, dependency graph
  closed, current Context matches, and the gate result is PASS or named NO-GO.
- `CORE120-CONVERGENCE-001`: cross-core identity/revision/package/event/result comparison,
  duplicate/replay/failure counts, and shared contract/schema/build hash agreement.
- `CORE120-NONINTRUSION-001`: route/script/data/provider diff and access audit proving current
  production remains untouched; synthetic or unavailable evidence is not promoted.
- `CORE120-HANDOFF-001`: rollback/stop instructions, checkpoint hash, FP-006 handoff context,
  open-risk/UNTESTED register, and explicit stop awaiting Owner/next instruction.

## Performance, security, privacy, and compatibility

- Report qualification-run duration, memory, artifact size/hash, adapter/test-fixture counts, and
  reproducibility. Product editor/device/long-session performance remains `UNTESTED` until its own
  WP-006/DRAW gates provide evidence.
- Repeat source review for caller-controlled authority, provider substitution, tenant leakage,
  secret/PII diagnostics, replay side effects, and malformed success. A zero-count scan alone is
  insufficient without source-traceable attack evidence.
- Compatibility is limited to named isolated adapters and contract fixtures. Existing PXD,
  PiXiSYNC, Market/Commerce, URL, project, asset, entitlement, license, and royalty compatibility
  with real data remains a later qualification item.

## Checkpoint and stop

Checkpoint records the complete predecessor matrix, all hashes, commands/exit codes, environment,
baseline failure identity, classification, residual risks, rollback route, and independent gate
review. Stop and report NO-GO for any missing evidence, new P0, hash mismatch, production access,
scope violation, or overclaim. After the report, stop; do not auto-start FP-006, WP-900, deploy,
publish, migrate, commit, or push.

## Bounded write scope

- `pixiedraw2/src/core/core-120/**`
- `pixiedraw2/tests/core-120/**`
- `pixiedraw2/benchmarks/core-120/**`
- `docs/contracts/CORE-120-*.md`
- `docs/inventory/core-120-*.json`
- `docs/decisions/ADR-*-CORE-120-*.md`
- Coordinator-owned Queue, Registry, State, Worklog, and generated Context manifests are not package-agent write targets.

## Stop rules

- Preserve current Market, PiXiSYNC, URLs, data, production fallback, and dirty worktree.
- Do not migrate, deploy, publish, commit, push, or start the next package automatically.
- Do not convert synthetic, isolated, desktop-only, or unavailable evidence into production PASS.
- Stop on missing dependency, stale Context, write-scope violation, authority ambiguity, data-loss risk, or required approval.

## Handoff

Complete only after acceptance evidence, Checkpoint, and independent review are recorded. After a new explicit
instruction, `FP-006`, `AUDIO-200`, and `GAME-300` are eligible parallel roots. The Registry `nextPackage`
remains `FP-006` as the reporting cursor; it is not a serial dependency for Audio/Game. `autoStartNext: false`.
