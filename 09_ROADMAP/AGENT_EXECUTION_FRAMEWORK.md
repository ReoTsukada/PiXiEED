# PiXiEED Agent Execution Framework v2

```yaml
framework_id: PIXIEED-AGENT-FRAMEWORK-002
schema_version: 2
registry: 00_START_HERE/WORK_PACKAGE_REGISTRY.json
upper_prompt: .codex/prompts/AI_DEVELOPMENT_HARNESS_OPTIMIZATION.md
default_execution_mode: BALANCED
```

## Canonical optimization and coordination policy

The complete cost, rework, routing, test-tier, evidence, and completion policy is kept in the upper
prompt at `.codex/prompts/AI_DEVELOPMENT_HARNESS_OPTIMIZATION.md`. This framework and every package
dispatch must follow that prompt; this reference is intentional so the policy has one canonical home.

- `BALANCED` is the default mode. `ECONOMY` and `TURBO` require an explicit task decision.
- SOL MAX is the read-only owner of the contract, root-cause analysis, solution, dependency DAG,
  change budget, escalation, and integration direction.
- Luna MAX implements the fixed contract, runs affected validation, and performs one implementation
  self-review. Specialists are added only for disjoint DAG nodes; an Integrator handles shared
  import/export and Tier 2 integration without adding features.
- Terra High is read-only. The normal gate is one affected-diff review; a release gate permits at
  most one full audit. A second finding in the same category returns the package to SOL.
- Change budget, Tier 0-4 validation, Incremental Evidence, Cost Governor, Rework Detector, and
  local synthetic-only security validation are mandatory. Schema PASS and semantic acceptance remain
  separate, and the final report uses the fixed format in the upper prompt.

## Ownership

- Handwritten authority: Registry, package definitions, Queue mirror, roadmap, framework, contracts, ADRs.
- Package agent: only files matching Registry `allowedWriteGlobs`.
- Coordinator: Queue, Registry, `.codex/PIXIEED_IMPLEMENTATION_STATE.yaml`, Decisions, Blockers,
  Test Results, Worklog, and Context manifests.
- Generated: Context bundles and derived gap summaries; never hand-edit.
- Historical: older Prompts and Context snapshots are evidence, never active instructions.

## Native host rules

Browser/PWA is first and remains fallback. NATIVE-500 owns one host boundary; Core and canonical Project
State must not fork by shell. NATIVE-510 is desktop direct-distribution candidate work only: signing, macOS
notarization, auto-update, rollback, file association, offline, and security evidence are mandatory;
Tauri/Electron require ADR comparison and are not selected now. NATIVE-520 is based on
`app-shell/pixieed-capacitor`; Google Play/App Store are primary, Play internal/closed and TestFlight
are staged evidence, and PWA is fallback. Store submission, deploy, signing-account access, and native
production release are forbidden.

## Mandatory editor Workspace UX guardrail

This applies to Desktop, Tablet, Mobile, Browser, and Native editor Workspaces. `document/page` scrolling is
forbidden: shell and critical controls must fit inside `100dvh` plus safe-area insets. Long lists may scroll
or virtualize only inside their owning Panel. Do not show every Panel at once; switch with
dock/tab/sheet/command palette. Use icon-first compact density without permanently displaying large
explanatory copy.
Every icon must expose an accessible name, tooltip, shortcut hint, and disabled reason. Meaning and procedure
must remain discoverable through Help/Q&A, shortcut cheat sheet, command palette, and guided
creation/onboarding. Destructive, publish, billing, and other high-risk actions must never be icon-only.
Toolbar, Menu, Help, Shortcut, Command Palette, and QA enumeration must use one versioned Command Registry;
mandatory actions that exist only as unregistered DOM handlers are forbidden.

Reference viewport acceptance must record `document.scrollWidth - document.clientWidth == 0` and
`document.scrollHeight - document.clientHeight == 0` (or equivalent overflow=0), safe-area fit, and that
any scrolling is confined to Panel internals or virtualization. Missing device/viewport evidence remains
`UNTESTED`.

## State, acceptance, checkpoint

`PLANNED -> READY -> IN_PROGRESS -> REVIEW -> COMPLETE`; missing dependency/evidence/authorization is
`BLOCKED`. Verify Registry/Context hashes, definition, dependencies, write globs, forbidden actions,
acceptance IDs, route, and dirty baseline. Each acceptance ID maps to reproducible evidence; unavailable
evidence remains `UNTESTED`. Append baseline, changed files, commands, results, blockers, reviewer,
decision, input Context SHA, and exact `nextPackage`. On interruption remain `IN_PROGRESS` or
`BLOCKED`; never auto-start.

All new packages use `docs/contracts/QUALIFICATION-EVIDENCE-V1.md`. Package-level prose, aggregate test
counts, and legacy fallback values are not acceptance evidence. Run
`scripts/verify_work_package_context.py` before each qualification; a stale or mixed Context is
`BLOCKED`. Baseline expectations are read from inventory files, and each inherited failure keeps its
test name, target file, and major error signature. Package-level review may not silently promote a
missing acceptance reviewer, exit code, or hash.

Before independent review, run
`node scripts/validate-qualification-evidence.mjs` against the generated
evidence. This shared validator is fail-closed: missing acceptance-level exit
codes, artifact hashes, or reviewers remain `PARTIAL`/`BLOCKED` and cannot be
filled by a package-level test count or prose review. Legacy evidence may be
adapted only with an explicit acceptance-ID coverage map.

### Composition Root Boundary Matrix preflight

Before implementation of any authority, security, privacy, or lifecycle package,
SOL and Luna must load the fixed synthetic preflight:

```text
node scripts/test-agent-package-preflight.mjs --manifest <package-preflight-manifest.json> --self-test
```

The manifest input is mandatory. The preflight is a repository-bound Harness,
not product evidence: it reads the declared package files, inspects the public
export/import graph, checks the fixed test source for every case and reason code,
and compares the machine-readable result artifact's `exitCode: 0` and source
SHA-256 against the current repository file. It never spawns a package command,
uses eval, or accesses a network. Its required Composition Root Boundary Matrix
records boundary validation and invalid-input rejection for each risk class,
boundary, substituted input, expected outcome, and reason code for:

- public export, constructor, factory, and caller-injection surfaces;
- resolver-returned ID, type, tenant, version, revision, and content identity;
- caller-supplied current visibility, lifecycle, moderation, membership, or
  locked state;
- direct Event objects, substituted Event IDs, replay, stale lifecycle input,
  and revoke authorization.

The fixed fixture is synthetic and fail-closed: its manifest must enumerate the
complete forbidden-operation set (network, production, real-data, real-account,
production DB/Storage, provider write, secrets, ad-hoc evaluation, deploy,
publish, commit, push, migrate, route cutover, real payment/payout, store
submission, production signing, and automatic next-package start). The Harness
must run before the first Terra review and use repository-fixed commands only.

For P0/P1 findings, `max_fix_rounds` is `2`. Round one requires a root-cause
Composition Root/public API/import-graph redesign; local symptom patches are
not sufficient. A second finding of the same class stops implementation and
returns the package to the design gate; the checkpoint status must be
`STOP_DESIGN_GATE` on round two. Each round records a timebox and checkpoint
before further work.

Terra receives the same fixed checklist before its first audit. Schema validity
of Evidence and semantic acceptance are separate fields: schema `PASS` does
not make semantic acceptance `PASS`, and Luna cannot fill the independent
reviewer field. A repository-bound preflight `PASS` only confirms manifest,
static graph, fixture, and artifact consistency; it cannot grant semantic
acceptance.

## Continuous Learning & Completion Policy

The repository is the durable memory of the engineering organization. Agent
conversation history, model memory, and application-side agent lists are not
authoritative. A validated lesson becomes reusable only when it is recorded in
the appropriate existing owner: a protected invariant, regression test, harness,
benchmark, architecture rule, specialist rule, or evidence record.

### Before every package

Read the minimum required context in this order:

```text
AGENTS.md
→ 00_START_HERE authority and current state
→ Work Package Registry / Queue
→ relevant contracts and architecture
→ protected invariants and Harness Registry entries
→ previous package handoff
→ generated package Context and its SHA
```

Do not reread the entire repository without a concrete reason. Before adding a
Harness, Registry, contract, cache, state store, adapter, or abstraction, search
existing ownership first and choose `REUSE → EXTEND → COMPOSE → CREATE`.

### Vertical-slice completion

Prefer a real user workflow connected through the canonical contract and runtime
path to evidence over a large isolated architecture expansion. Types, unit tests,
contracts, or an isolated Harness alone are never Product Completion. Classify
evidence as `SYNTHETIC`, `ISOLATED`, `BROWSER`, `REAL_DEVICE`, `STAGING`, or
`PROD_EQUIVALENT`; never promote one evidence class into another.

### Failure learning loop

Every failure follows this sequence:

```text
failure
→ exact root cause
→ isolated or same-class classification
→ narrow search for same-class occurrences
→ coherent minimal fix
→ affected tests
→ baseline and protected-invariant checks
→ promotion decision
```

Do not repeatedly patch symptoms. A lesson is promoted only when at least one
of these applies: the same class occurred twice, it concerns security/identity/
permission, finance/entitlement/royalty, corruption/data loss, lifecycle or
memory, a hot-path performance risk, a repeated manual check, or a cross-package
invariant. A trivial one-off typo remains an ordinary fix; it does not create a
new Harness or policy.

### Automatic performance review triggers

During package review, inspect the relevant path for per-frame Registry
resolution or hashing, full-project/timeline traversal, broad serialization,
hidden heavy Workspace updates, duplicate mounted Workspaces, unbounded caches,
observer/listener leaks, repeated hot-loop allocation, and synchronous storage or
network work in interaction paths. If detected, open a focused Performance Review
using the existing Harness Registry before changing architecture. Do not default
to Worker or broad refactoring without a measured dominant cost and a measured
benefit.

### Completion and reopening

Do not mark a package complete from a single test count. Completion requires its
acceptance evidence, baseline no-new-failure result, required independent review,
protected-invariant mapping, and evidence record. Once those are present, record
`REOPEN_REQUIRED = NO` in the package handoff. Reopen only for a regression,
contract change, new P0/P1 evidence, a real-device contradiction, or an upstream
canonical change. New optional concerns do not reopen a closed package or create
an infinite audit loop.

### Durable handoff

Each package handoff is concise and records:

```text
WHAT_WAS_BUILT
WHAT_IS_PROVEN
WHAT_IS_NOT_PROVEN
PROTECTED_INVARIANTS
NEW_DURABLE_LEARNING
REUSED_HARNESS
PERFORMANCE_CONSTRAINTS
NEXT_DEPENDENCY
REOPEN_CONDITIONS
```

Future agents read the promoted owner and current Context, not every historical
prompt. After closure, the Coordinator reads the canonical Queue, prepares the
next dependency-ready Context, and does not auto-start it.

### Execution metrics

Track `task_count`, `first_pass_rate`, `reopen_rate`, `regression_count`,
`average_fix_rounds`, `review_finding_count`, `harness_reuse_rate`,
`time_to_gate`, `unnecessary_parallel_count`, `context_reload_volume`, and
`human_intervention_count`. Optimize total safe completion time rather than
agent count, token count, or the fewest tests. Parallel agents are useful only
for disjoint acceptance IDs and write scopes; completed agents close after their
evidence is received.

## Parallelization and special gates

The coordinator performs one preflight decomposition before implementation and sends every independent
worker its complete instruction, read scope, write glob, acceptance IDs, fixtures, and stop conditions at
the beginning of the package. Do not wait for one worker to finish before dispatching another independent
track. Registry `implementationRoute.parallelism` is the maximum simultaneous Luna worker count, not a
requirement to create busywork.

Use separate worktrees and disjoint write sets only. Recommended tracks are contract/schema, implementation
slice, adversarial/failure fixtures, performance/browser/device evidence, and independent review. Shared
Registry/Queue/State/Worklog integration remains coordinator-only and serial. Workers return patches and
evidence; the coordinator checks cross-track assumptions, integrates, runs the complete package suite, and
then requests an independent reviewer. Cancel a track when its write set overlaps or its premise becomes stale.

### SOL resident coordinator, Luna implementation, and Terra final read-only review

SOL MAX is the resident read-only coordinator for the whole PiXiEED program. SOL keeps the global roadmap,
Canonical state, dependency graph, next-package scope, protected invariants, and unresolved findings in view.
SOL performs preflight decomposition, selects the next implementation slice, fixes the contract and root
cause, builds the dependency DAG, sends complete instructions to Luna and Terra, integrates their reports,
and decides whether a package can advance. Read-only means SOL does not edit product source, tests,
production data, or implementation contracts directly.

Luna MAX is the normal implementation and integration lead for the current program. It owns ordinary
preflight, Harness reuse, coherent local correction, and targeted evidence. A Luna lead may delegate
at most one bounded child level when a distinct read or test question materially reduces risk. The lead must
send the child its complete read scope, exclusive write or read-only scope, acceptance IDs, stop rules, and
return format at dispatch time. Child scopes must not overlap the lead or another worker; a child may not edit
Registry, Queue, State, Context manifests, current routes, production data, or a sibling's files. Delegation
is forbidden for busywork, repeated tests, or work that the lead can complete without creating a new boundary.

The Terra High auditor is independent from the implementing Luna and is read-only. Terra inspects the actual
affected diff, tests, evidence, cross-track boundaries, and residual risk; classifies findings as PASS,
UNTESTED, P0/P1/P2; and returns the exact correction or approval condition to SOL. The normal affected-diff
review runs once, and a release-gate full audit runs at most once. Luna's self-review is not Terra approval;
if a child fails to report, Terra records that evidence as pending rather than inferring approval. A second
finding in the same category returns the package to SOL instead of starting another local patch loop.

SOL remains resident across packages, but does not create mass parallel work by default. Model availability is
probed once per configuration, not once per package. SOL may request a deeper Terra review or additional Luna
specialist only when the acceptance IDs and write scopes are independent or the risk warrants it.

FP-004/005/007 and Core packages are dependency-sequence-gated, but each package may use its declared
parallel tracks internally. WP-910..980
may collect independent evidence in parallel after WP-900 opens the matrix; WP-990 aggregates serially.
CORE-120 is Core completion; FP-006 is Draw2; WP-900 is qualification-entry/gap authority; WP-990 records
but never grants Owner approval; CUT-001 remains BLOCKED until explicit Owner authorization.

## Agent OS and Product Completion extension

The operating extension for Efficiency Governor routing, reusable Role Cards, durable Learning promotion,
automatic Harness curation, protected hot paths, resource lifecycle checks, and metrics is canonicalized in
this document. The machine-readable Harness location map is `docs/inventory/harness-registry.json`.
Product Completion, Workspace, Golden Projects, and vertical slices are canonicalized in the Product
completion overlay sections of `09_ROADMAP/PIXIEED_COMPLETION_ROADMAP.md`, with domain details remaining in
`02_ARCHITECTURE/`, `03_PRODUCTS/`, `05_PERFORMANCE/`, and package contracts.

These documents extend this framework and do not change Registry order, current package state, allowed write
globs, or the `auto_start_next: false` rule.

## Canonical consolidation / no-clutter rule

This framework is the single canonical owner for Agent execution. Do not create a parallel
`AGENT_OS.md`, `AGENT_SYSTEM.md`, `AGENT_FRAMEWORK_V2.md`, or another general Agent authority.

Before adding a document or instruction, classify the need:

1. Can this framework be extended?
2. Is it package-scoped and better placed in that package definition?
3. Is it a durable learning, evidence record, or historical prompt?
4. Is a new file actually required for machine validation?

Existing Registry, Queue, State, Roadmap, Architecture, Work Package definitions, tests, benchmarks,
fixtures, browser audits, validators, and Context builders remain the source of truth for their existing
responsibilities. New policy must link to those owners instead of copying their content.

### One-entry rule

The normal entry path is:

```text
AGENTS.md
  ↓ how to work
00_START_HERE/
  ↓ current state and authority
09_ROADMAP/PIXIEED_COMPLETION_ROADMAP.md
  ↓ final direction and package sequence
```

`AGENT_EXECUTION_FRAMEWORK.md` is the Agent-specific continuation from that entry path. Detail belongs
in a package definition, contract, evidence, or the existing domain specification. `AGENTS.md` remains a
map and is not expanded into a knowledge dump.

### Role and routing policy

The current Terra High / Luna / SOL model is retained. Terra remains a final read-only reviewer; the
optimization policy limits the review to the affected diff once, with at most one release-gate full audit.
The following are routing labels, not a request to keep more agents alive:

### Efficiency Governor default

The cost- and time-efficient default is a **resident read-only SOL coordinator plus bounded Luna execution and
one read-only Terra final review**, not an unbounded number of workers:

- **SOL MAX** remains the single read-only orchestration and audit-direction layer. It reads and plans but does
  not implement or directly modify product files.
- **Luna MAX** implements one coherent package. It may run one bounded dispatch wave for genuinely independent
  tracks, using disjoint write globs and acceptance IDs.
- **Terra High** read-only reviews the affected implementation, evidence, and boundaries once, with one
  permitted release-gate full audit. Terra does not implement fixes.
- A package does not gain speed from agent count alone. Prefer one Luna lead, add parallel specialists only
  when their scopes are truly independent, and close each agent as soon as its report and evidence are received.
- Repository changes cannot clear Codex desktop chat history or the app-side agent list. Treat that UI state as
  separate from the repository; use the app's own archive/clear controls or a fresh chat when available.

This profile optimizes total safe completion time, first-pass rate, review independence, and context reuse;
it does not optimize the number of active agents or raw token usage.

| Route | Use |
| --- | --- |
| `NO_AGENT_REQUIRED` | Documentation, one existing validator, or a bounded local change |
| `REUSE_EXISTING_THREAD` | Same package, role, Context SHA, and unresolved finding set |
| `FORK_EXISTING_THREAD` | Same knowledge, disjoint read-only/test scope or separate worktree |
| `START_NEW_SPECIALIST` | New domain or incompatible context |
| `PARALLEL_SPECIALISTS` | Disjoint write globs and independent acceptance IDs only |
| `START_FRESH_INDEPENDENT_REVIEWER` | Auth, finance, corruption, lifecycle, compatibility, performance, release evidence |

The Coordinator selects `scope → dependency → write conflict → existing knowledge → harness reuse →
evidence level → risk → cost`. Agent count is not a progress metric. A Luna child is at most one bounded
level, and is forbidden for busywork or repeated tests.

Every dispatch includes the complete read scope, write scope, forbidden paths, acceptance IDs, fixtures,
baseline identity, stop rules, and return format at the beginning. Completed agents close after evidence is
received. Thread history and application-side agent cache are not deleted through repository operations.

### Durable learning and prompt retirement

```text
Observation → Root Cause → Minimal Reproduction → Regression Test
           → Learning Candidate → Independent Review → Durable Learning
```

Completed package prompts are historical inputs after useful facts are promoted into a Protected Invariant,
Regression Test, Specialist Rule, or Evidence record. Future agents must read the promoted owner, not every
old prompt. Documents are classified as `CANONICAL`, `PACKAGE_SCOPED`, `DURABLE_LEARNING`, `EVIDENCE`,
`HISTORICAL`, or `DEPRECATED`; the same fact is linked, not copied.

### Harness reuse-first policy

Before creating a Harness, search the existing tests, fixtures, benchmarks, browser audits, validators,
and Evidence inventories. The order is:

```text
REUSE → EXTEND → COMPOSE → NEW HARNESS
```

The machine-readable location map is `docs/inventory/harness-registry.json`. A new Harness requires a
unique purpose, invariant/failure class, input fixture, owner package, evidence level, exit-code contract,
and a written reason why reuse or extension was insufficient. Unknown cleanup candidates are never deleted.

### Protected invariants and metrics

- Existing routes, PiXiEEDraw, PXD, PiXiSYNC, Market, Project/Asset/Purchase/License/Royalty data remain untouched.
- Baseline identity compares test name, target file, and major Error Signature; new failures remain zero.
- Workspace state is not canonical project state; all three editor profiles use one Core.
- Pointer/RAF/audio hot paths do not run full authorization scans, full serialization, hierarchy rebuilds, or DOM-wide translation.
- Mount/unmount, panel open/close, playback, route, project, scene, and reload must clean up RAF, timers, listeners, observers, workers, subscriptions, AudioNodes, thumbnails, and caches.
- Unmeasured device, browser, staging, production-equivalent, and production behavior stays `UNTESTED`.

Track `task_count`, `first_pass_rate`, `reopen_rate`, `regression_count`, `average_fix_rounds`,
`review_finding_count`, `harness_reuse_rate`, `time_to_gate`, `unnecessary_parallel_count`, and
`context_reload_volume`. Optimize total completion time, not token count or agent count.
