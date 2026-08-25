# CODEX_TASK_PROMPTS — v2 Handoff Policy

```yaml
prompt_policy_id: PIXIEED-PROMPT-POLICY-002
registry: 00_START_HERE/WORK_PACKAGE_REGISTRY.json
active_handoff: CODEX_TASK_PROMPTS/FP-004.md
```

## Active handoff

Only `FP-004.md` is active. It is valid only while the Registry reports `FP-004.status: READY`
and FP-003AA is historical completion. Future Prompts become active only after a Registry entry and
definition exist and the package status is explicitly `READY`.

## Completed Prompt history

Completed Start Prompt files were removed during the v2 reset because they duplicated completed scope and
could be mistaken for active instructions. Completion history remains in the Registry, Contracts, ADRs,
Inventories, Test Results, and Worklog. Those evidence files were not deleted. A completed package must not be
reconstructed or rerun from an old Prompt; a future audit reads the preserved evidence through an explicitly
registered package.

## Required active handoff fields

Package ID/status, dependencies, Context paths, bounded write globs, forbidden actions, acceptance IDs,
verification level, implementation/review routes, exact stop conditions, and Registry-defined nextPackage.
`autoStartNext` is always false.
