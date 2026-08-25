# PLANS.md — PiXiEED v2 Execution Protocol

```yaml
document_id: PIXIEED-IMPLEMENTATION-PLANS-002
schema_version: 2
status: CANONICAL
authority: 00_START_HERE/WORK_PACKAGE_REGISTRY.json
```

## Source of truth

Read the registry first. The Queue is a human mirror. Historical Prompts and Context snapshots are evidence
only. If an ID is absent from the registry, stop with `CATALOG_MISSING`.

## Preflight

1. Read `AGENTS.md`, `CURRENT_SYSTEM_PRESERVATION_GATE.md`, this file, and the Registry.
2. Confirm the package is `READY`, its predecessor is accepted, and `autoStartNext` is false.
3. Capture commit, dirty-worktree status, package ID, Context paths, and baseline.
4. Read only the declared definition and Context files.
5. Confirm allowed globs, forbidden actions, acceptance IDs, and stop conditions.

## Required plan

```yaml
package_id:
goal:
phase:
depends_on:
definition:
context_files:
allowed_write_globs:
forbidden_actions:
acceptance_ids:
verification_level:
implementation_route:
review_route:
rollback_or_recovery:
stop_conditions:
```

## Execution and completion

Implement only the bounded scope. Add a reproducible check, make the smallest complete change, run targeted
verification, applicable browser/device/build checks, and inspect the diff. Preserve `UNTESTED`,
`PARTIAL`, `UNKNOWN`, and `BLOCKED` unless new evidence changes them.

A package is complete only when every acceptance ID has cited evidence, relevant checks pass, independent
review is complete, preservation impact is classified, and residual risks are explicit. Synthetic, local,
desktop-only, or unavailable evidence cannot become production `PASS` by assertion.

## Checkpoint and handoff

Append package ID, run ID, baseline, dirty-tree fingerprint, input Context SHA, changed files, commands,
acceptance results, blockers, reviewer, decision, and Registry-defined `nextPackage`. On interruption
remain `IN_PROGRESS` or `BLOCKED`. Never auto-start the next package. WP-990 prepares an Owner
decision request; only explicit Owner authorization can unblock CUT-001.
