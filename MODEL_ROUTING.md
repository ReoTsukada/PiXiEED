# MODEL_ROUTING.md — SOL Orchestration, Luna Execution, and Terra Read-only Final Review

```yaml
document_id: PIXIEED-MODEL-ROUTING-002
schema_version: 2
status: CANONICAL
registry: 00_START_HERE/WORK_PACKAGE_REGISTRY.json
upper_prompt: .codex/prompts/AI_DEVELOPMENT_HARNESS_OPTIMIZATION.md
default_execution_mode: BALANCED
```

The complete optimization contract is canonicalized in
`.codex/prompts/AI_DEVELOPMENT_HARNESS_OPTIMIZATION.md`. This file keeps the routing summary and must
remain aligned with its `BALANCED` default, Contract First, DAG, Change Budget, Tier 0-4, Incremental
Evidence, Cost Governor, Rework Detector, and fixed completion report.

## SOL resident coordinator (read-only)

SOL MAX is the resident read-only orchestrator for the full PiXiEED program. It reads the Canonical state,
roadmap, package dependencies, protected invariants, Harness registry, and prior evidence; selects the next
bounded slice; fixes the contract, root cause, solution, and dependency DAG; dispatches complete instructions
to Luna and Terra; integrates reports; and determines the next safe action. SOL must not edit product source,
tests, production data, or implementation contracts directly.

## Luna default

Luna MAX is the persistent implementation and integration lead when the Registry defines the scope, write
set, dependencies, and acceptance IDs. It completes coherent local work through targeted evidence rather
than stopping between ordinary correction, verification, and documentation steps. Missing files or ambiguity
produce `CATALOG_MISSING`, `DEPENDENCY_NOT_ACCEPTED`, `WRITE_SCOPE_VIOLATION`, or
`EVIDENCE_UNAVAILABLE`; Luna must stop, not infer.

## Composition Root preflight and two-round gate

Before implementation of any authority, security, privacy, or lifecycle package, Luna must run the fixed
repository preflight and attach its output to the package handoff:

```text
node scripts/test-agent-package-preflight.mjs --manifest <package-preflight-manifest.json> --self-test
```

The manifest input is mandatory. The preflight is repository-bound synthetic Harness evidence, not product
acceptance: it reads declared package files, inspects the public export/import graph, checks that the fixed test
source contains every invalid-input case and expected reason code, and compares the result artifact's
`exitCode: 0` and source SHA-256 with the current repository file. It never spawns a package command, uses eval,
or accesses a network. Its Composition Root Boundary Matrix performs boundary validation and invalid-input
rejection for public export/constructor/factory/caller-injection surfaces, resolver-returned ID/type/tenant/version
or revision/content identity mismatches, caller-supplied current state, direct Event objects and substituted
input Event IDs, and replay/stale/revoke transitions. Every invalid-input case must be rejected by the
server-owned composition boundary. The same fixed Terra review checklist is attached before Terra's first audit.

For P0/P1 findings, `max_fix_rounds=2`. Round one requires a root-cause Composition Root, public API, or
import-graph redesign; local symptom patches do not satisfy the gate. A second finding of the same class stops
implementation and returns the package to the design gate; its checkpoint status must be `STOP_DESIGN_GATE`.
Each round records a timebox and checkpoint.

The preflight and its fixture use no network, production access, real data, real accounts, production DB/Storage,
provider writes, secrets, ad-hoc evaluation, deploy, publish, commit, push, migrate, route cutover, real
payment/payout, store submission, production signing, or automatic next-package start. Use repository-fixed
commands only. Evidence schema validity and semantic acceptance are separate: schema `PASS` never implies
semantic acceptance `PASS`, and Luna must not fill the independent Terra reviewer field. A preflight `PASS`
confirms repository-bound consistency only; it cannot grant semantic acceptance.

## SOL route verification

When the configured SOL route has not been verified, use one minimal read-only probe and record
`SOL_ROUTING: PASS`, `UNVERIFIED`, or `FALLBACK_REQUIRED`. Do not repeat that probe until the configuration
changes. SOL remains the coordinator after the probe; implementation returns to Luna MAX and the read-only final
review returns to Terra High.

## Cost/time operating profile

The default operating profile is `BALANCED`: a resident read-only SOL coordinator, one bounded Luna
implementation lead, disjoint specialists only when a DAG node is independent, an Integrator for Tier 2,
and one read-only Terra affected-diff review. It is not mass Luna fan-out.

- SOL sends one complete preflight and dispatch wave at package start, then keeps the global dependency and
  handoff state coherent without editing product files.
- Use one Luna MAX lead for a coherent package and send all truly independent specialist instructions in one
  bounded wave. Do not create parallel workers for coupled files, repeated checks, or status-only work.
- Keep Terra High read-only for evidence truthfulness, cross-track integration, and the final affected-diff
  review. A release gate may request at most one full audit; Terra never implements fixes.
- A second finding in the same category returns the work to SOL. Do not continue a local patch loop.
- Apply the Change Budget (`<=500` changed lines, `<=4` files, `<=2` retries, one full audit, one full
  evidence run) unless SOL records a justified package-specific adjustment.
- Close completed agents immediately after their report. Agent count, retained chat entries, and app-side
  history are not repository state and cannot be removed by editing repository files.
- Reuse the existing Harness/Context/evidence paths before creating a new one. Optimize safe time-to-gate and
  first-pass completion rather than the number of agents or simultaneous tasks.

## Route

- SOL MAX: resident read-only coordinator for all packages; no product implementation or direct source edits.

- Foundation, Core, Draw2, Audio, Game: Luna MAX; Terra High read-only final review. SOL remains coordinator only.
- Site/product adapters: Luna MAX, escalating to Terra High read-only final review when ownership crosses systems.
- NATIVE-500/510/520: Luna MAX for host-boundary and distribution-contract work; Terra High read-only final review. Store submission, deployment, signing-account access, and shell-specific canonical-project forks remain forbidden.
- WP-900..980: Terra High evidence coordination and read-only final review; SOL coordinates only.
- WP-990: Luna implementation after the applicable Owner gate; Terra read-only final review; SOL coordinates only.
- CUT-001: implementation agent only after explicit Owner authorization; Terra read-only final review; SOL remains
  read-only and does not perform the cutover.

The exact route in the Registry overrides this summary. Model choice never replaces tests or approval.

## Escalation and independence

Escalate after two substantive failures, unclear ownership, authority/financial/privacy impact, uncertain
recovery/data integrity, or entry into qualification/cutover. The reviewer must be a different agent/model,
inspect the actual diff and evidence, and classify residual risk. Review never replaces tests.

## Parallelism and prohibitions

At package start, SOL sends the complete bounded instructions and the Luna lead dispatches the approved
implementation tracks in one wave. Parallel work requires disjoint write globs, separate worktrees, shared read-only baseline,
and no concurrent Queue/Registry/State/Worklog edits. The Registry parallelism value is a ceiling; do not add
agents where the work is coupled or the critical path is serial. WP-910..980 may collect independent evidence in parallel after WP-900
opens the matrix; WP-900 aggregation, WP-990, and CUT-001 remain serial. No production migration, route
cutover, deployment, publication, commit, push, provider write, real payment/payout, or automatic next
package start is allowed.
